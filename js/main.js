/**
 * main.js - Inicializador e Controlador da Interface do Jogo Futebol de Botão 3D
 */

import { GameRenderer } from './renderer.js';
import { PhysicsWorld } from './physics.js';
import { NetworkManager } from './network.js';
import { GameManager } from './game.js';
import { supabaseManager } from './supabaseClient.js';
import { sounds } from './audio.js';

class App {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.renderer = new GameRenderer(this.canvas);
    this.physics = new PhysicsWorld();
    this.network = new NetworkManager(null);
    this.game = new GameManager(this.renderer, this.physics, this.network);
    this.network.game = this.game;

    this.unreadChatCount = 0;
    this.isChatOpen = false;

    this.initUI();
    this.initGameCallbacks();
    this.startRenderLoop();
  }

  initUI() {
    // Referências aos Elementos do DOM
    this.menuOverlay = document.getElementById('main-menu');
    this.gameHud = document.getElementById('game-hud');
    this.chatWidget = document.getElementById('chat-widget');
    this.chatPanel = document.getElementById('chat-panel');
    this.lobbyModal = document.getElementById('lobby-modal');
    this.endgameModal = document.getElementById('endgame-modal');
    this.goalBanner = document.getElementById('goal-banner');

    // Inputs de Customização do Time
    this.inputPlayerName = document.getElementById('input-player-name');
    this.inputTeamName = document.getElementById('input-team-name');
    this.inputTeamAbbr = document.getElementById('input-team-abbr');
    this.inputTeamColor = document.getElementById('input-team-color');

    // Elementos de Preview do Botão
    this.previewDisk = document.getElementById('preview-disk');
    this.previewText = document.getElementById('preview-text');

    // Configuração dos Eventos do Menu
    this.setupMenuTabs();
    this.setupCustomizationListeners();
    this.setupGameModeButtons();
    this.setupSupabaseTab();
    this.setupChat();
    this.setupHudButtons();

    // Carrega dados salvos do jogador se existirem
    this.loadSavedPreferences();
    this.updatePreview();
  }

  loadSavedPreferences() {
    const saved = localStorage.getItem('futebol3d_player_profile');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.name) this.inputPlayerName.value = data.name;
        if (data.team) this.inputTeamName.value = data.team;
        if (data.abbr) this.inputTeamAbbr.value = data.abbr;
        if (data.color) this.inputTeamColor.value = data.color;
      } catch (e) {
        console.warn('Erro ao carregar perfil salvo:', e);
      }
    }
  }

  savePlayerPreferences() {
    const profile = this.getLocalPlayerData();
    localStorage.setItem('futebol3d_player_profile', JSON.stringify(profile));
  }

  getLocalPlayerData() {
    const abbr = (this.inputTeamAbbr.value || 'BOT').toUpperCase().trim().substring(0, 3);
    return {
      name: this.inputPlayerName.value.trim() || 'Jogador 1',
      team: this.inputTeamName.value.trim() || 'Meu Time',
      abbr: abbr.length === 3 ? abbr : (abbr + 'XXX').substring(0, 3),
      color: this.inputTeamColor.value || '#0055ff'
    };
  }

  setupMenuTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sounds.playClick();
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetTab = document.getElementById(btn.dataset.tab);
        if (targetTab) targetTab.classList.add('active');
      });
    });

    document.getElementById('btn-next-to-play').addEventListener('click', () => {
      sounds.playClick();
      this.savePlayerPreferences();
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="tab-play"]').classList.add('active');
      document.getElementById('tab-play').classList.add('active');
    });
  }

  setupCustomizationListeners() {
    // Atualização da Abreviação (máximo 3 letras e maiúsculas)
    this.inputTeamAbbr.addEventListener('input', () => {
      this.inputTeamAbbr.value = this.inputTeamAbbr.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.updatePreview();
    });

    // Atualização da Cor
    this.inputTeamColor.addEventListener('input', () => {
      this.updatePreview();
    });

    // Paleta de Cores Pré-definidas
    const presetDots = document.querySelectorAll('.preset-dot');
    presetDots.forEach(dot => {
      dot.addEventListener('click', () => {
        sounds.playClick();
        this.inputTeamColor.value = dot.dataset.color;
        this.updatePreview();
      });
    });

    // Seleção de Formato (4x4 ou 5x5)
    const formatRadios = document.querySelectorAll('input[name="game-format"]');
    formatRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        sounds.playClick();
        document.querySelectorAll('.format-card').forEach(card => card.classList.remove('active'));
        radio.closest('.format-card').classList.add('active');
      });
    });
  }

  updatePreview() {
    const color = this.inputTeamColor.value;
    const abbr = (this.inputTeamAbbr.value || 'BOT').toUpperCase().substring(0, 3);

    const previewDisk = document.getElementById('preview-disk');
    const previewText = document.getElementById('preview-text');

    if (previewDisk && previewText) {
      previewDisk.style.background = `radial-gradient(circle at 35% 35%, #ffffff, ${color} 40%, #000000 100%)`;
      previewText.textContent = abbr;
    }
  }

  getSelectedFormation() {
    const checked = document.querySelector('input[name="game-format"]:checked');
    return checked ? parseInt(checked.value, 10) : 4;
  }

  setupGameModeButtons() {
    // 1. Iniciar Partida Local 1x1
    document.getElementById('btn-play-local').addEventListener('click', () => {
      sounds.playClick();
      this.savePlayerPreferences();
      this.network.setMode('local');

      const p1 = this.getLocalPlayerData();
      // Time 2 padrão para modo local (adversário estilizado)
      const p2 = {
        name: 'Adversário 2',
        team: p1.abbr === 'FLA' ? 'Vasco' : 'Rival FC',
        abbr: p1.abbr === 'FLA' ? 'VAS' : 'RIV',
        color: p1.color === '#e63946' ? '#1d3557' : '#e63946'
      };

      this.startGameSession(p1, p2, this.getSelectedFormation());
    });

    // 2. Iniciar Modo Treino com Robô (IA)
    document.getElementById('btn-play-bot').addEventListener('click', () => {
      sounds.playClick();
      this.savePlayerPreferences();
      this.network.setMode('bot');

      const p1 = this.getLocalPlayerData();
      const p2 = {
        name: 'Robô IA',
        team: 'Cyber Bot',
        abbr: 'BOT',
        color: '#8b5cf6'
      };

      this.startGameSession(p1, p2, this.getSelectedFormation());
    });

    // 3. Criar Sala Online (Supabase)
    document.getElementById('btn-create-room').addEventListener('click', async () => {
      sounds.playClick();
      this.savePlayerPreferences();
      const statusEl = document.getElementById('room-status-msg');
      statusEl.textContent = 'Conectando ao Supabase...';

      try {
        const roomCode = this.network.generateRoomCode();
        const p1 = this.getLocalPlayerData();
        const formation = this.getSelectedFormation();

        await this.network.createRoom(roomCode, p1, formation);

        statusEl.textContent = '';
        this.openLobbyModal(roomCode, p1, true, formation);
      } catch (err) {
        statusEl.textContent = err.message || 'Erro ao criar sala. Verifique a aba Supabase.';
      }
    });

    // 4. Entrar em Sala Online
    document.getElementById('btn-join-room').addEventListener('click', async () => {
      sounds.playClick();
      this.savePlayerPreferences();
      const inputCode = document.getElementById('input-room-code');
      const roomCode = (inputCode.value || '').trim().toUpperCase();
      const statusEl = document.getElementById('room-status-msg');

      if (!roomCode || roomCode.length < 4) {
        statusEl.textContent = 'Digite um código válido de 4 dígitos.';
        return;
      }

      statusEl.textContent = 'Entrando na sala ' + roomCode + '...';

      try {
        const guestData = this.getLocalPlayerData();
        await this.network.joinRoom(roomCode, guestData);
        statusEl.textContent = '';
        this.openLobbyModal(roomCode, guestData, false, this.getSelectedFormation());
      } catch (err) {
        statusEl.textContent = err.message || 'Erro ao entrar na sala.';
      }
    });

    // Sair da Sala no Lobby
    document.getElementById('btn-leave-lobby').addEventListener('click', () => {
      sounds.playClick();
      this.network.leaveRoom();
      this.lobbyModal.classList.add('hidden');
    });

    // Copiar código da sala
    document.getElementById('btn-copy-room').addEventListener('click', () => {
      const code = document.getElementById('lobby-room-code').textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
          alert('Código da sala copiado: ' + code);
        });
      }
    });

    // Botão de Iniciar Partida Online (Apenas Host)
    const btnStartOnline = document.getElementById('btn-start-online-match');
    btnStartOnline.addEventListener('click', () => {
      sounds.playClick();
      this.network.startOnlineMatch();
    });

    // Modais de Fim de Jogo
    document.getElementById('btn-rematch').addEventListener('click', () => {
      sounds.playClick();
      this.endgameModal.classList.add('hidden');
      this.game.startMatch(this.game.players[0], this.game.players[1], this.game.formation);
    });

    document.getElementById('btn-endgame-menu').addEventListener('click', () => {
      sounds.playClick();
      this.endgameModal.classList.add('hidden');
      this.exitToMenu();
    });
  }

  openLobbyModal(roomCode, playerData, isHost, formation) {
    this.lobbyModal.classList.remove('hidden');
    document.getElementById('lobby-room-code').textContent = roomCode;
    document.getElementById('lobby-formation-text').textContent = `${formation} x ${formation}`;

    const slotHost = document.getElementById('slot-host');
    const slotGuest = document.getElementById('slot-guest');
    const btnStart = document.getElementById('btn-start-online-match');

    if (isHost) {
      document.getElementById('slot-host-name').textContent = playerData.name;
      document.getElementById('slot-host-team').textContent = playerData.team;
      document.getElementById('slot-host-avatar').textContent = playerData.abbr;
      document.getElementById('slot-host-avatar').style.backgroundColor = playerData.color;

      document.getElementById('slot-guest-name').textContent = 'Aguardando...';
      document.getElementById('slot-guest-team').textContent = 'Convidado';
      document.getElementById('slot-guest-avatar').textContent = '?';
      document.getElementById('slot-guest-status').textContent = 'Esperando...';
      btnStart.disabled = true;
      btnStart.textContent = 'Aguardando Adversário...';
    } else {
      document.getElementById('slot-guest-name').textContent = playerData.name;
      document.getElementById('slot-guest-team').textContent = playerData.team;
      document.getElementById('slot-guest-avatar').textContent = playerData.abbr;
      document.getElementById('slot-guest-avatar').style.backgroundColor = playerData.color;
      document.getElementById('slot-guest-status').textContent = 'Pronto!';
      btnStart.disabled = true;
      btnStart.textContent = 'Aguardando Host Iniciar...';
    }
  }

  setupSupabaseTab() {
    const btnTest = document.getElementById('btn-test-supabase');
    const statusText = document.getElementById('sb-status');
    const pingBadge = document.getElementById('server-ping-badge');

    if (btnTest) {
      btnTest.addEventListener('click', async () => {
        sounds.playClick();
        if (statusText) {
          statusText.style.color = '#ffd166';
          statusText.textContent = 'Testando conexão com Supabase Realtime...';
        }
        const t0 = performance.now();
        const res = await supabaseManager.testConnection();
        const ping = Math.round(performance.now() - t0);

        if (statusText) {
          statusText.style.color = res.success ? '#10b981' : '#f43f5e';
          statusText.textContent = res.message;
        }
        if (pingBadge && res.success) {
          pingBadge.textContent = `${ping}ms (Excelente)`;
          pingBadge.style.color = '#10b981';
        }
      });
    }
  }

  setupChat() {
    const toggleBtn = document.getElementById('chat-toggle-btn');
    const closeBtn = document.getElementById('chat-close-btn');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const unreadBadge = document.getElementById('chat-unread-badge');

    const toggleChat = () => {
      this.isChatOpen = !this.isChatOpen;
      if (this.isChatOpen) {
        this.chatPanel.classList.remove('hidden');
        this.unreadChatCount = 0;
        unreadBadge.classList.add('hidden');
        chatInput.focus();
      } else {
        this.chatPanel.classList.add('hidden');
      }
    };

    toggleBtn.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', toggleChat);

    // Emojis Rápidos
    const emojiBtns = document.querySelectorAll('.emoji-btn');
    emojiBtns.forEach(b => {
      b.addEventListener('click', () => {
        sounds.playClick();
        const me = this.game.players[this.network.localPlayerIndex] || this.getLocalPlayerData();
        this.network.sendChat(me.name, me.abbr, me.color, b.dataset.emoji);
      });
    });

    // Envio do formulário
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;

      const me = this.game.players[this.network.localPlayerIndex] || this.getLocalPlayerData();
      this.network.sendChat(me.name, me.abbr, me.color, text);
      chatInput.value = '';
    });
  }

  appendChatMessage(data) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg player-msg';

    msgDiv.innerHTML = `
      <div class="chat-author" style="color: ${data.teamColor}">
        <span>[${data.teamAbbr}]</span> ${data.authorName}:
      </div>
      <div class="chat-text">${escapeHtml(data.text)}</div>
    `;

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;

    // Se o chat estiver fechado, incrementa a bolinha de notificação
    if (!this.isChatOpen) {
      this.unreadChatCount++;
      const badge = document.getElementById('chat-unread-badge');
      if (badge) badge.classList.remove('hidden');
    }
  }

  setupHudButtons() {
    // Alternar Câmera (Isométrica x Top-Down)
    document.getElementById('btn-cam-toggle').addEventListener('click', () => {
      sounds.playClick();
      this.renderer.toggleCamera();
    });

    // Mutar/Desmutar Som
    const soundBtn = document.getElementById('btn-sound-toggle');
    soundBtn.addEventListener('click', () => {
      const isMuted = sounds.toggleMute();
      soundBtn.style.opacity = isMuted ? '0.4' : '1.0';
    });

    // Sair para Menu
    document.getElementById('btn-menu-exit').addEventListener('click', () => {
      if (confirm('Deseja realmente sair da partida?')) {
        this.exitToMenu();
      }
    });
  }

  initGameCallbacks() {
    // Atualização de Turno
    this.game.onTurnChanged = (turnIndex, player) => {
      const turnBadge = document.getElementById('hud-turn-badge');
      const turnText = document.getElementById('hud-turn-text');
      const pulseDot = turnBadge.querySelector('.pulse-dot');

      turnText.textContent = `Turno de ${player.abbr}`;
      pulseDot.style.background = player.color;
      pulseDot.style.boxShadow = `0 0 10px ${player.color}`;
    };

    // Atualização de Placar
    this.game.onScoreChanged = (score) => {
      document.getElementById('hud-score-home').textContent = score[0];
      document.getElementById('hud-score-away').textContent = score[1];
    };

    // Atualização de Tempo (3 minutos)
    this.game.onTimeChanged = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      document.getElementById('hud-match-timer').textContent =
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    // Evento de GOL
    this.game.onGoalEvent = (scoringTeam) => {
      const banner = document.getElementById('goal-banner');
      const teamName = document.getElementById('goal-scorer-team');
      teamName.textContent = scoringTeam.team.toUpperCase();
      teamName.style.color = scoringTeam.color;

      banner.classList.remove('hidden');
      setTimeout(() => {
        banner.classList.add('hidden');
      }, 3000);

      // Adiciona mensagem ao chat
      this.appendSystemChatMessage(`⚽ GOOOOL! ${scoringTeam.name} marcou para o time ${scoringTeam.team}!`);
    };

    // Fim de Partida
    this.game.onGameOver = ({ score, winner, players }) => {
      this.endgameModal.classList.remove('hidden');
      document.getElementById('endgame-home-info').textContent = `${players[0].abbr} ${score[0]}`;
      document.getElementById('endgame-away-info').textContent = `${score[1]} ${players[1].abbr}`;

      const msgEl = document.getElementById('endgame-message');
      if (winner) {
        msgEl.textContent = `🎉 O ${winner.team} (${winner.name}) é o grande campeão!`;
      } else {
        msgEl.textContent = '🤝 Partida equilibrada! O jogo terminou empatado!';
      }
    };

    // Rede: Conexão de Adversário
    this.network.onPlayerJoined = (opponentData, formation) => {
      const slotGuest = document.getElementById('slot-guest');
      const btnStart = document.getElementById('btn-start-online-match');

      if (slotGuest) {
        document.getElementById('slot-guest-name').textContent = opponentData.name;
        document.getElementById('slot-guest-team').textContent = opponentData.team;
        document.getElementById('slot-guest-avatar').textContent = opponentData.abbr;
        document.getElementById('slot-guest-avatar').style.backgroundColor = opponentData.color;
        document.getElementById('slot-guest-status').textContent = 'Conectado!';
      }

      if (this.network.isHost && btnStart) {
        btnStart.disabled = false;
        btnStart.textContent = 'Iniciar Partida Agora!';
      }

      this.opponentData = opponentData;
      if (formation) {
        this.game.formation = formation;
      }
    };

    // Rede: Início de Partida Online
    this.network.onGameStart = (matchConfig) => {
      this.lobbyModal.classList.add('hidden');
      const p1 = this.network.isHost ? this.getLocalPlayerData() : this.opponentData;
      const p2 = this.network.isHost ? this.opponentData : this.getLocalPlayerData();
      this.startGameSession(p1, p2, matchConfig.formation || 4);
    };

    // Rede: Chat Recebido
    this.network.onChatMessage = (msgData) => {
      this.appendChatMessage(msgData);
    };

    // Rede: Desconexão de Adversário
    this.network.onPlayerLeft = () => {
      this.appendSystemChatMessage('⚠️ O adversário saiu da partida.');
    };
  }

  appendSystemChatMessage(text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg system-msg';
    msgDiv.textContent = text;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  }

  startGameSession(p1, p2, formation) {
    this.menuOverlay.classList.add('hidden');
    this.gameHud.classList.remove('hidden');
    this.chatWidget.classList.remove('hidden');

    // Atualiza Placar do Topo
    document.getElementById('hud-badge-home').textContent = p1.abbr;
    document.getElementById('hud-badge-home').style.backgroundColor = p1.color;
    document.getElementById('hud-name-home').textContent = p1.team;
    document.getElementById('hud-player-home').textContent = p1.name;

    document.getElementById('hud-badge-away').textContent = p2.abbr;
    document.getElementById('hud-badge-away').style.backgroundColor = p2.color;
    document.getElementById('hud-name-away').textContent = p2.team;
    document.getElementById('hud-player-away').textContent = p2.name;

    this.appendSystemChatMessage(`🏁 Início de partida: ${p1.team} vs ${p2.team} (${formation}x${formation})!`);

    // Inicia o motor do jogo
    this.game.startMatch(p1, p2, formation);
  }

  exitToMenu() {
    this.game.isMatchRunning = false;
    if (this.game.timerInterval) clearInterval(this.game.timerInterval);
    this.network.leaveRoom();

    this.gameHud.classList.add('hidden');
    this.chatWidget.classList.add('hidden');
    this.chatPanel.classList.add('hidden');
    this.endgameModal.classList.add('hidden');
    this.lobbyModal.classList.add('hidden');
    this.menuOverlay.classList.remove('hidden');
  }

  // Render Loop contínuo a 60 FPS
  startRenderLoop() {
    let lastTime = performance.now();

    const loop = (currentTime) => {
      requestAnimationFrame(loop);

      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      if (this.game.isMatchRunning) {
        this.game.update(dt);
      }

      this.renderer.render();
    };

    requestAnimationFrame(loop);
  }
}

// Utilitário para sanitização básica de HTML no chat
function escapeHtml(string) {
  const div = document.createElement('div');
  div.innerText = string;
  return div.innerHTML;
}

// Inicializa a aplicação ao carregar o DOM
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
