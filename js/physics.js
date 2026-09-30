/**
 * physics.js - Simulação Física 3D com Cannon-es
 * Física calibrada para deslizamento perfeito de futebol de botão sem capotamentos.
 */

import * as CANNON from 'cannon-es';
import { sounds } from './audio.js';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -25, 0) // Gravidade firme
    });

    // Dimensões Oficiais do Campo de Botão
    this.fieldWidth = 26;   // Eixo X
    this.fieldHeight = 16;  // Eixo Z
    this.goalWidth = 4.0;   // Largura da trave
    this.goalDepth = 1.8;   // Profundidade da rede
    this.goalHeight = 1.8;  // Altura da trave

    // Materiais
    this.feltMaterial = new CANNON.Material('felt');
    this.plasticMaterial = new CANNON.Material('plastic');
    this.ballMaterial = new CANNON.Material('ball');
    this.woodMaterial = new CANNON.Material('wood');

    this.setupContactMaterials();

    this.bodies = [];
    this.isSettled = true;
    this.settledFrames = 0;

    this.onGoalScored = null;
    this.goalCooldown = false;

    this.buildFieldBoundaries();
  }

  setupContactMaterials() {
    // Bola no Feltro (Deslizamento e rolamento suave e veloz)
    const ballFelt = new CANNON.ContactMaterial(this.ballMaterial, this.feltMaterial, {
      friction: 0.03,
      restitution: 0.6
    });

    // Botão no Feltro (Deslizamento encerado macio de botão clássico)
    const plasticFelt = new CANNON.ContactMaterial(this.plasticMaterial, this.feltMaterial, {
      friction: 0.04,
      restitution: 0.25
    });

    // Botão na Bola (Impacto seco com excelente transferência de energia!)
    const plasticBall = new CANNON.ContactMaterial(this.plasticMaterial, this.ballMaterial, {
      friction: 0.12,
      restitution: 0.96
    });

    // Botão com Botão (Choque elástico firme)
    const plasticPlastic = new CANNON.ContactMaterial(this.plasticMaterial, this.plasticMaterial, {
      friction: 0.12,
      restitution: 0.8
    });

    // Bola na Tabela de Madeira (Tabelas e quiques)
    const ballWood = new CANNON.ContactMaterial(this.ballMaterial, this.woodMaterial, {
      friction: 0.04,
      restitution: 0.85
    });

    // Botão na Tabela de Madeira
    const plasticWood = new CANNON.ContactMaterial(this.plasticMaterial, this.woodMaterial, {
      friction: 0.06,
      restitution: 0.65
    });

    this.world.addContactMaterial(ballFelt);
    this.world.addContactMaterial(plasticFelt);
    this.world.addContactMaterial(plasticBall);
    this.world.addContactMaterial(plasticPlastic);
    this.world.addContactMaterial(ballWood);
    this.world.addContactMaterial(plasticWood);
  }

  buildFieldBoundaries() {
    // Chão do Campo (Mesa)
    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: this.feltMaterial
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    const halfW = this.fieldWidth / 2;
    const halfH = this.fieldHeight / 2;
    const wallH = 1.2;
    const wallThick = 0.6;

    // Bordas Laterais Superiores e Inferiores (Z+ e Z-)
    const sideShape = new CANNON.Box(new CANNON.Vec3(halfW + 0.6, wallH / 2, wallThick / 2));
    
    // Parede Superior
    const topWall = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.woodMaterial,
      position: new CANNON.Vec3(0, wallH / 2, halfH + wallThick / 2)
    });
    topWall.addShape(sideShape);
    this.world.addBody(topWall);

    // Parede Inferior
    const bottomWall = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.woodMaterial,
      position: new CANNON.Vec3(0, wallH / 2, -(halfH + wallThick / 2))
    });
    bottomWall.addShape(sideShape);
    this.world.addBody(bottomWall);

    // Bordas de Fundo (deixando a boca do gol no centro)
    const segmentWidth = (this.fieldHeight - this.goalWidth) / 4;
    const endShape = new CANNON.Box(new CANNON.Vec3(wallThick / 2, wallH / 2, segmentWidth));
    const zOffset = this.goalWidth / 2 + segmentWidth;

    // Fundo Esquerdo
    this.createStaticBox(new CANNON.Vec3(-halfW - wallThick / 2, wallH / 2, zOffset), endShape, this.woodMaterial);
    this.createStaticBox(new CANNON.Vec3(-halfW - wallThick / 2, wallH / 2, -zOffset), endShape, this.woodMaterial);

    // Fundo Direito
    this.createStaticBox(new CANNON.Vec3(halfW + wallThick / 2, wallH / 2, zOffset), endShape, this.woodMaterial);
    this.createStaticBox(new CANNON.Vec3(halfW + wallThick / 2, wallH / 2, -zOffset), endShape, this.woodMaterial);

    // Traves e Redes
    this.buildGoalPhysics(-halfW, -1);
    this.buildGoalPhysics(halfW, 1);
  }

  createStaticBox(position, shape, material) {
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material,
      position
    });
    body.addShape(shape);
    this.world.addBody(body);
    return body;
  }

  buildGoalPhysics(xPos, direction) {
    const postRadius = 0.08;
    const halfGW = this.goalWidth / 2;
    const gDepth = this.goalDepth;
    const gHeight = this.goalHeight;

    // Postes Verticais da Trave
    const postShape = new CANNON.Cylinder(postRadius, postRadius, gHeight, 8);
    const post1 = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.plasticMaterial,
      position: new CANNON.Vec3(xPos, gHeight / 2, halfGW)
    });
    post1.addShape(postShape);
    this.world.addBody(post1);

    const post2 = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.plasticMaterial,
      position: new CANNON.Vec3(xPos, gHeight / 2, -halfGW)
    });
    post2.addShape(postShape);
    this.world.addBody(post2);

    // Travessão Superior
    const barShape = new CANNON.Box(new CANNON.Vec3(postRadius, postRadius, halfGW));
    const crossbar = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.plasticMaterial,
      position: new CANNON.Vec3(xPos, gHeight, 0)
    });
    crossbar.addShape(barShape);
    this.world.addBody(crossbar);

    // Paredes da Rede do Gol
    const netThick = 0.2;
    const backNetShape = new CANNON.Box(new CANNON.Vec3(netThick / 2, gHeight / 2, halfGW));
    const backNet = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.plasticMaterial,
      position: new CANNON.Vec3(xPos + direction * (gDepth + netThick / 2), gHeight / 2, 0)
    });
    backNet.addShape(backNetShape);
    this.world.addBody(backNet);

    const sideNetShape = new CANNON.Box(new CANNON.Vec3(gDepth / 2, gHeight / 2, netThick / 2));
    const sideNet1 = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.plasticMaterial,
      position: new CANNON.Vec3(xPos + direction * (gDepth / 2), gHeight / 2, halfGW + netThick / 2)
    });
    sideNet1.addShape(sideNetShape);
    this.world.addBody(sideNet1);

    const sideNet2 = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.plasticMaterial,
      position: new CANNON.Vec3(xPos + direction * (gDepth / 2), gHeight / 2, -(halfGW + netThick / 2))
    });
    sideNet2.addShape(sideNetShape);
    this.world.addBody(sideNet2);
  }

  // Cria Corpo Físico do Botão de Linha ou Goleiro
  createButtonBody(id, position, isGoalkeeper = false) {
    let body;

    if (isGoalkeeper) {
      // Goleiro Retangular de Botão
      const halfSize = new CANNON.Vec3(0.28, 0.35, 1.0);
      body = new CANNON.Body({
        mass: 4.0,
        material: this.plasticMaterial,
        linearDamping: 0.38,
        angularDamping: 0.6
      });
      body.addShape(new CANNON.Box(halfSize));
      // Trava inclinação: só permite rotação no eixo Y
      body.angularFactor.set(0, 1, 0);
      // Trava eixo Y para deslizar perfeitamente rente à mesa sem quicar
      body.linearFactor.set(1, 0, 1);
      body.position.set(position.x, 0.35, position.z);
    } else {
      // Botão de Linha Circular Clássico
      const radius = 0.75;
      const height = 0.36; // Altura ideal para colidir na linha do equador da bola

      body = new CANNON.Body({
        mass: 1.4,
        material: this.plasticMaterial,
        linearDamping: 0.28,  // Desliza suave como acrílico encerado
        angularDamping: 0.4
      });

      // Em Cannon.js, o Cylinder Shape tem eixo em Z; rotacionamos o SHAPE para ficar em Y
      const shapeQ = new CANNON.Quaternion();
      shapeQ.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
      const cylinderShape = new CANNON.Cylinder(radius, radius, height, 24);
      body.addShape(cylinderShape, new CANNON.Vec3(0, 0, 0), shapeQ);

      // SEGREDO DO DESLIZAMENTO DE BOTÃO:
      // Trava estritamente rotações em X e Z para JAMAIS tombar ou capotar!
      body.angularFactor.set(0, 1, 0);
      // Trava o movimento vertical Y para correr 100% plano na mesa
      body.linearFactor.set(1, 0, 1);
      body.position.set(position.x, height / 2, position.z);
    }

    body.pieceId = id;
    body.isGoalkeeper = isGoalkeeper;

    // Som de colisão proporcional à velocidade
    body.addEventListener('collide', (event) => {
      const contact = event.contact;
      const relVel = contact.getImpactVelocityAlongNormal();
      const absVel = Math.abs(relVel);
      if (absVel > 0.3) {
        if (event.body.material === this.plasticMaterial || event.body.material === this.ballMaterial) {
          sounds.playKick(absVel / 10);
        } else if (event.body.material === this.woodMaterial) {
          sounds.playTableBounce(absVel / 10);
        }
      }
    });

    this.world.addBody(body);
    this.bodies.push(body);
    return body;
  }

  // Cria Corpo Físico da Bola
  createBallBody(position) {
    const radius = 0.32;
    const body = new CANNON.Body({
      mass: 0.2,
      material: this.ballMaterial,
      linearDamping: 0.18,  // Rola livremente pelo campo
      angularDamping: 0.25
    });
    body.addShape(new CANNON.Sphere(radius));
    // A bola rola livremente em todos os eixos
    body.angularFactor.set(1, 1, 1);
    // Permite pequena resposta vertical sob impactos fortes mas mantém no plano
    body.linearFactor.set(1, 0.3, 1);
    body.position.set(position.x, radius, position.z);
    body.isBall = true;

    body.addEventListener('collide', (event) => {
      const contact = event.contact;
      const relVel = contact.getImpactVelocityAlongNormal();
      const absVel = Math.abs(relVel);
      if (absVel > 0.3) {
        if (event.body.material === this.woodMaterial) {
          sounds.playTableBounce(absVel / 8);
        } else if (event.body.material === this.plasticMaterial) {
          sounds.playKick(absVel / 8);
        }
      }
    });

    this.world.addBody(body);
    this.bodies.push(body);
    this.ballBody = body;
    return body;
  }

  step(dt) {
    this.world.step(1 / 60, dt, 3);
    this.checkGoalDetection();
    this.checkSettledStatus();
  }

  // Detecção de Gol
  checkGoalDetection() {
    if (!this.ballBody || this.goalCooldown) return;

    const bPos = this.ballBody.position;
    const halfGW = this.goalWidth / 2;
    const halfW = this.fieldWidth / 2;

    // Dentro da largura da trave
    if (Math.abs(bPos.z) < halfGW && bPos.y >= 0 && bPos.y < this.goalHeight) {
      // Gol na trave esquerda (X < -halfW) -> Ponto Time 2
      if (bPos.x < -halfW - 0.2) {
        this.triggerGoal(1);
      }
      // Gol na trave direita (X > halfW) -> Ponto Time 1
      else if (bPos.x > halfW + 0.2) {
        this.triggerGoal(0);
      }
    }
  }

  triggerGoal(scoringTeamIndex) {
    this.goalCooldown = true;
    if (this.onGoalScored) {
      this.onGoalScored(scoringTeamIndex);
    }
    setTimeout(() => {
      this.goalCooldown = false;
    }, 3500);
  }

  // Monitora quando todas as peças param para passar o turno
  checkSettledStatus() {
    const SPEED_THRESHOLD = 0.06;
    let allStationary = true;

    for (let body of this.bodies) {
      const speed = body.velocity.length();
      if (speed > SPEED_THRESHOLD) {
        allStationary = false;
        break;
      }
    }

    if (allStationary) {
      this.settledFrames++;
      if (this.settledFrames >= 6) {
        if (!this.isSettled) {
          this.isSettled = true;
          // Anula micro-velocidades residuais
          for (let body of this.bodies) {
            body.velocity.set(0, 0, 0);
            body.angularVelocity.set(0, 0, 0);
          }
        }
      }
    } else {
      this.settledFrames = 0;
      this.isSettled = false;
    }
  }

  // Aplica o impulso do chute no botão
  applyShotImpulse(body, impulseVec) {
    if (!body) return;
    this.isSettled = false;
    this.settledFrames = 0;
    body.wakeUp();

    // Impulso rigorosamente horizontal (Y = 0) aplicado no centro de massa
    body.applyImpulse(new CANNON.Vec3(impulseVec.x, 0, impulseVec.z), body.position);
    sounds.playKick(impulseVec.length() / 25);
  }

  resetBody(body, position, rotationY = 0) {
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);

    const posY = body.isBall ? 0.32 : (body.isGoalkeeper ? 0.35 : 0.18);
    body.position.set(position.x, posY, position.z);

    // Orientação limpa no eixo vertical Y (sem rotações de 90° em X!)
    body.quaternion.setFromEuler(0, rotationY, 0);
  }
}
