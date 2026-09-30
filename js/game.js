/**
 * game.js - Gerenciador Central das Regras do Futebol de Botão 3D
 * Turnos alternados, mecânica de arrasto do mouse (estilingue), detecção de gol,
 * cronômetro de 3 minutos, reposicionamento tático 4x4 / 5x5 e IA do Bot.
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { sounds } from './audio.js';

export class GameManager {
  constructor(renderer, physics, network) {
    this.renderer = renderer;
    this.physics = physics;
    this.network = network;

    // Configurações dos Jogadores
    this.players = [
      { name: 'Craque 10', team: 'Brasil FC', abbr: 'BRA', color: '#0055ff' },
      { name: 'Adversário', team: 'Argentina', abbr: 'ARG', color: '#00a8ff' }
    ];

    this.formation = 4; // 4x4 ou 5x5
    this.currentTurn = 0; // 0 = Time 1, 1 = Time 2
    this.score = [0, 0];
    this.matchDuration = 180; // 3 minutos
    this.timeRemaining = this.matchDuration;
    this.isMatchRunning = false;
    this.isGameOver = false;

    // Estados de Interação do Mouse / Mira
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isDragging = false;
    this.selectedPiece = null;
    this.selectedBody = null;
    this.dragStartWorld = new THREE.Vector3();
    this.dragCurrentWorld = new THREE.Vector3();
    this.maxDragDistance = 4.5;
    this.maxImpulse = 28.0;

    // Coleções de Corpos Físicos
    this.pieces = []; // Array de { id, teamIndex, isGoalkeeper, body, mesh }
    this.ball = null;

    // Controle de Repouso e Turno
    this.hasShotBeenMade = false;
    this.botThinking = false;

    // Timer Interval
    this.timerInterval = null;

    // Callbacks de Atualização da UI
    this.onTurnChanged = null;
    this.onScoreChanged = null;
    this.onTimeChanged = null;
    this.onGoalEvent = null;
    this.onGameOver = null;

    this.setupPhysicsCallbacks();
    this.setupInputListeners();
  }

  setupPhysicsCallbacks() {
    this.physics.onGoalScored = (scoringTeamIndex) => {
      this.handleGoal(scoringTeamIndex);
    };
  }

  setupInputListeners() {
    const canvas = this.renderer.canvas;

    const onPointerDown = (e) => {
      if (!this.isMatchRunning || this.isGameOver || !this.physics.isSettled || this.hasShotBeenMade) return;
      if (!this.network.canLocalPlayerShoot(this.currentTurn)) return;

      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.renderer.activeCamera);
      
      // Checa interseção com as peças do jogador do turno atual
      const teamMeshes = this.pieces
        .filter(p => p.teamIndex === this.currentTurn)
        .map(p => p.mesh);

      const intersects = this.raycaster.intersectObjects(teamMeshes, true);

      if (intersects.length > 0) {
        // Encontra a peça pai correspondente
        let hitObj = intersects[0].object;
        while (hitObj && !hitObj.pieceId && hitObj.parent) {
          hitObj = hitObj.parent;
        }

        const foundPiece = this.pieces.find(p => p.id === hitObj.pieceId);
        if (foundPiece) {
          this.isDragging = true;
          this.selectedPiece = foundPiece;
          this.selectedBody = foundPiece.body;
          this.dragStartWorld.copy(foundPiece.mesh.position);
          this.dragCurrentWorld.copy(foundPiece.mesh.position);
          this.renderer.showSelectionRing(foundPiece.mesh.position);
          sounds.playClick();
        }
      }
    };

    const onPointerMove = (e) => {
      if (!this.isDragging || !this.selectedPiece) return;

      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.renderer.activeCamera);

      // Raycast no plano do campo (Y = 0)
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersection = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(groundPlane, intersection);

      if (intersection) {
        this.dragCurrentWorld.copy(intersection);

        // Vetor do arrasto (Puxar para trás como estilingue)
        const pullVector = new THREE.Vector3().subVectors(this.dragCurrentWorld, this.dragStartWorld);
        const distance = pullVector.length();
        const clampedDist = Math.min(distance, this.maxDragDistance);

        // A mira aponta na direção oposta ao arrasto (slingshot!)
        const aimDir = pullVector.clone().negate().normalize();
        const aimVector = aimDir.multiplyScalar(clampedDist);
        const powerFraction = clampedDist / this.maxDragDistance;

        // Atualiza elementos visuais 3D e a barra de força no HUD
        this.renderer.updateAimTrajectory(this.dragStartWorld, aimVector, powerFraction);
        this.updatePowerBarUI(powerFraction);
      }
    };

    const onPointerUp = () => {
      if (!this.isDragging || !this.selectedPiece) return;

      const pullVector = new THREE.Vector3().subVectors(this.dragCurrentWorld, this.dragStartWorld);
      const distance = pullVector.length();

      // Se arrastou com distância mínima válida para um chute
      if (distance > 0.35) {
        const clampedDist = Math.min(distance, this.maxDragDistance);
        const powerFraction = clampedDist / this.maxDragDistance;
        const impulseMagnitude = powerFraction * this.maxImpulse;

        // O tiro é disparado na direção contrária ao puxão (estilingue)
        const shotDir = pullVector.clone().negate().normalize();
        const impulseVec = shotDir.multiplyScalar(impulseMagnitude);

        // Aplica na física
        this.executeShot(this.selectedPiece.id, impulseVec);

        // Notifica rede se estiver no modo online
        this.network.sendShot(this.selectedPiece.id, impulseVec.x, impulseVec.z);
      }

      this.cancelAim();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', () => this.cancelAim());
  }

  cancelAim() {
    this.isDragging = false;
    this.selectedPiece = null;
    this.selectedBody = null;
    this.renderer.hideAimTrajectory();
    this.renderer.hideSelectionRing();
    const aimOverlay = document.getElementById('aim-indicator');
    if (aimOverlay) aimOverlay.classList.add('hidden');
  }

  updatePowerBarUI(fraction) {
    const aimOverlay = document.getElementById('aim-indicator');
    const fill = document.getElementById('power-bar-fill');
    const label = document.getElementById('power-percent');
    if (aimOverlay && fill && label) {
      aimOverlay.classList.remove('hidden');
      const percent = Math.round(fraction * 100);
      fill.style.width = percent + '%';
      label.textContent = percent + '%';
    }
  }

  // Executa o chute físico
  executeShot(pieceId, impulseVec) {
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!piece) return;

    this.hasShotBeenMade = true;
    this.physics.applyShotImpulse(piece.body, impulseVec);
  }

  // Recebe disparo remoto do adversário no modo Online
  applyRemoteShot(shotData) {
    const impulseVec = new THREE.Vector3(shotData.impulseX, 0, shotData.impulseZ);
    this.executeShot(shotData.pieceId, impulseVec);
  }

  // Inicia ou Reinicia uma Partida
  startMatch(player1Data, player2Data, formation = 4) {
    this.players[0] = { ...player1Data };
    this.players[1] = { ...player2Data };
    this.formation = parseInt(formation, 10);
    this.score = [0, 0];
    this.timeRemaining = this.matchDuration;
    this.isGameOver = false;
    this.isMatchRunning = true;
    this.currentTurn = 0; // Mandante começa
    this.hasShotBeenMade = false;

    this.setupMatchEntities();
    this.startMatchTimer();

    sounds.playWhistle(false);

    if (this.onScoreChanged) this.onScoreChanged(this.score);
    if (this.onTurnChanged) this.onTurnChanged(this.currentTurn, this.players[this.currentTurn]);
    if (this.onTimeChanged) this.onTimeChanged(this.timeRemaining);
  }

  // Monta os botões e a bola nas posições de campo
  setupMatchEntities() {
    // Limpa entidades anteriores
    this.renderer.clearPieces();
    this.physics.bodies = [];
    this.pieces = [];

    // Cria a Bola no Centro
    const ballPos = new CANNON.Vec3(0, 0.4, 0);
    const ballBody = this.physics.createBallBody(ballPos);
    const ballMesh = this.renderer.createBallMesh();
    this.ball = { body: ballBody, mesh: ballMesh };

    // Posicionamento Tático conforme a Formação (4x4 ou 5x5)
    const positions = this.getFormationPositions(this.formation);

    // Time 1 (Home - Lado Esquerdo)
    positions.team1.forEach((pos, idx) => {
      const id = `t1_p${idx}`;
      const isGk = idx === 0;
      const body = this.physics.createButtonBody(id, pos, isGk);
      const mesh = this.renderer.createButtonMesh(id, this.players[0].color, this.players[0].abbr, isGk);
      this.pieces.push({ id, teamIndex: 0, isGoalkeeper: isGk, body, mesh });
    });

    // Time 2 (Away - Lado Direito)
    positions.team2.forEach((pos, idx) => {
      const id = `t2_p${idx}`;
      const isGk = idx === 0;
      const body = this.physics.createButtonBody(id, pos, isGk);
      const mesh = this.renderer.createButtonMesh(id, this.players[1].color, this.players[1].abbr, isGk);
      this.pieces.push({ id, teamIndex: 1, isGoalkeeper: isGk, body, mesh });
    });
  }

  // Gera as coordenadas táticas oficiais do futebol de botão
  getFormationPositions(formation) {
    if (formation === 4) {
      // 4x4: 1 Goleiro + 3 Linha
      return {
        team1: [
          new CANNON.Vec3(-11.5, 0.4, 0),    // Goleiro
          new CANNON.Vec3(-7.5, 0.3, 0),     // Zagueiro central
          new CANNON.Vec3(-3.5, 0.3, 3.8),   // Ala Superior
          new CANNON.Vec3(-3.5, 0.3, -3.8)   // Ala Inferior
        ],
        team2: [
          new CANNON.Vec3(11.5, 0.4, 0),     // Goleiro
          new CANNON.Vec3(7.5, 0.3, 0),      // Zagueiro central
          new CANNON.Vec3(3.5, 0.3, 3.8),    // Ala Superior
          new CANNON.Vec3(3.5, 0.3, -3.8)    // Ala Inferior
        ]
      };
    } else {
      // 5x5: 1 Goleiro + 4 Linha
      return {
        team1: [
          new CANNON.Vec3(-11.5, 0.4, 0),    // Goleiro
          new CANNON.Vec3(-8.0, 0.3, 2.5),   // Lateral Superior
          new CANNON.Vec3(-8.0, 0.3, -2.5),  // Lateral Inferior
          new CANNON.Vec3(-3.0, 0.3, 2.8),   // Ponta Superior
          new CANNON.Vec3(-3.0, 0.3, -2.8)   // Ponta Inferior
        ],
        team2: [
          new CANNON.Vec3(11.5, 0.4, 0),     // Goleiro
          new CANNON.Vec3(8.0, 0.3, 2.5),    // Lateral Superior
          new CANNON.Vec3(8.0, 0.3, -2.5),   // Lateral Inferior
          new CANNON.Vec3(3.0, 0.3, 2.8),    // Ponta Superior
          new CANNON.Vec3(3.0, 0.3, -2.8)    // Ponta Inferior
        ]
      };
    }
  }

  // Reposiciona todas as peças após um Gol
  resetFieldPositions(possessionTeam = 0) {
    const positions = this.getFormationPositions(this.formation);

    // Reseta Bola no centro (ou ligeiramente a favor do time com posse)
    const ballOffset = (possessionTeam === 0) ? -0.8 : 0.8;
    this.physics.resetBody(this.ball.body, new CANNON.Vec3(ballOffset, 0.4, 0));

    // Reseta Botões do Time 1
    const t1Pieces = this.pieces.filter(p => p.teamIndex === 0);
    positions.team1.forEach((pos, idx) => {
      if (t1Pieces[idx]) {
        this.physics.resetBody(t1Pieces[idx].body, pos);
      }
    });

    // Reseta Botões do Time 2
    const t2Pieces = this.pieces.filter(p => p.teamIndex === 1);
    positions.team2.forEach((pos, idx) => {
      if (t2Pieces[idx]) {
        this.physics.resetBody(t2Pieces[idx].body, pos);
      }
    });

    this.hasShotBeenMade = false;
    this.currentTurn = possessionTeam;

    sounds.playWhistle(false);

    if (this.onTurnChanged) {
      this.onTurnChanged(this.currentTurn, this.players[this.currentTurn]);
    }
  }

  // Disparo de Gol
  handleGoal(scoringTeamIndex) {
    if (this.isGameOver) return;

    this.score[scoringTeamIndex]++;
    sounds.playGoal();

    // Efeito de Confetes na tela
    if (window.confetti) {
      window.confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }

    const scoringTeam = this.players[scoringTeamIndex];
    if (this.onScoreChanged) this.onScoreChanged(this.score);
    if (this.onGoalEvent) this.onGoalEvent(scoringTeam);

    // Quem sofreu o gol tem direito à saída de bola no meio de campo
    const nextPossession = 1 - scoringTeamIndex;

    // Aguarda o banner de celebração do gol terminar para reiniciar
    setTimeout(() => {
      if (this.isMatchRunning && !this.isGameOver) {
        this.resetFieldPositions(nextPossession);
      }
    }, 3200);
  }

  // Relógio de 3 Minutos da Partida
  startMatchTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      if (!this.isMatchRunning || this.isGameOver) return;

      this.timeRemaining--;

      if (this.onTimeChanged) {
        this.onTimeChanged(this.timeRemaining);
      }

      if (this.timeRemaining <= 0) {
        this.timeRemaining = 0;
        this.checkMatchEnd();
      }
    }, 1000);
  }

  checkMatchEnd() {
    // Só encerra quando as peças pararem no campo
    if (this.physics.isSettled) {
      this.endGame();
    }
  }

  endGame() {
    this.isGameOver = true;
    this.isMatchRunning = false;
    if (this.timerInterval) clearInterval(this.timerInterval);

    sounds.playWhistle(true);

    let winner = null;
    if (this.score[0] > this.score[1]) {
      winner = this.players[0];
    } else if (this.score[1] > this.score[0]) {
      winner = this.players[1];
    }

    if (this.onGameOver) {
      this.onGameOver({
        score: this.score,
        winner,
        players: this.players
      });
    }
  }

  // Loop de Atualização Chamado a cada Frame do AnimationFrame
  update(dt) {
    this.physics.step(dt);
    this.renderer.syncPhysics(this.physics.bodies, this.ball ? this.ball.body : null);

    // Checagem de Fim de Turno quando um lance foi feito e as peças pararam
    if (this.hasShotBeenMade && this.physics.isSettled && !this.physics.goalCooldown) {
      this.hasShotBeenMade = false;

      // Se o tempo acabou durante o lance, finaliza o jogo
      if (this.timeRemaining <= 0) {
        this.endGame();
        return;
      }

      // Alterna o Turno para o outro jogador
      this.currentTurn = 1 - this.currentTurn;
      sounds.playShortBeep();

      if (this.onTurnChanged) {
        this.onTurnChanged(this.currentTurn, this.players[this.currentTurn]);
      }

      // Se for a vez do Bot (Treino), aciona a IA
      if (this.network.mode === 'bot' && this.currentTurn === 1 && !this.isGameOver) {
        this.triggerBotTurn();
      }
    }
  }

  // Inteligência Artificial do Bot para Modo Treino
  triggerBotTurn() {
    if (this.botThinking || this.isGameOver) return;
    this.botThinking = true;

    // Tempo de reflexão do robô (800ms a 1200ms)
    setTimeout(() => {
      if (!this.isMatchRunning || this.isGameOver || this.currentTurn !== 1) {
        this.botThinking = false;
        return;
      }

      const ballPos = this.ball.body.position;
      const botPieces = this.pieces.filter(p => p.teamIndex === 1 && !p.isGoalkeeper);

      // Encontra a peça mais próxima da bola
      let bestPiece = botPieces[0];
      let bestDist = Infinity;

      for (let piece of botPieces) {
        const dist = piece.body.position.distanceTo(ballPos);
        if (dist < bestDist) {
          bestDist = dist;
          bestPiece = piece;
        }
      }

      if (bestPiece) {
        // O Bot quer empurrar a bola na direção do gol do adversário (x = -13, z = 0)
        const targetGoal = new THREE.Vector3(-13, 0.2, (Math.random() - 0.5) * 2.5);
        const ballThree = new THREE.Vector3(ballPos.x, 0.2, ballPos.z);
        const pieceThree = new THREE.Vector3(bestPiece.body.position.x, 0.2, bestPiece.body.position.z);

        // Vetor da peça em direção à bola
        const dirToBall = new THREE.Vector3().subVectors(ballThree, pieceThree).normalize();
        // Vetor da bola em direção ao gol
        const dirBallToGoal = new THREE.Vector3().subVectors(targetGoal, ballThree).normalize();

        // Combina as direções com um pouco de imprevisibilidade humana
        const shotDir = new THREE.Vector3()
          .addVectors(dirToBall.multiplyScalar(0.7), dirBallToGoal.multiplyScalar(0.3))
          .normalize();

        const power = 15 + Math.random() * 10;
        const impulseVec = shotDir.multiplyScalar(power);

        this.executeShot(bestPiece.id, impulseVec);
      }

      this.botThinking = false;
    }, 900);
  }
}
