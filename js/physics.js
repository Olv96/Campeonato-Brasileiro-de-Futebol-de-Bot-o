/**
 * physics.js - Simulação Física 3D com Cannon-es
 * Gerencia colisões, atrito de mesa de botão, limites do campo, traves e detecção de repouso
 */

import * as CANNON from 'cannon-es';
import { sounds } from './audio.js';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -18, 0) // Gravidade firme para manter tudo na mesa
    });

    // Solver e tolerância
    this.world.defaultContactMaterial.friction = 0.3;
    this.world.defaultContactMaterial.restitution = 0.55;

    // Materiais
    this.feltMaterial = new CANNON.Material('felt');
    this.plasticMaterial = new CANNON.Material('plastic');
    this.ballMaterial = new CANNON.Material('ball');
    this.woodMaterial = new CANNON.Material('wood');

    this.setupContactMaterials();

    // Dimensões do Campo Oficial de Botão (Escala em metros virtuais)
    this.fieldWidth = 26;   // Eixo X (Comprimento do campo)
    this.fieldHeight = 16;  // Eixo Z (Largura do campo)
    this.goalWidth = 4.0;   // Largura da trave
    this.goalDepth = 1.8;   // Profundidade da rede
    this.goalHeight = 1.8;  // Altura da trave

    this.bodies = [];
    this.isSettled = true;
    this.settledFrames = 0;

    this.onGoalScored = null;
    this.goalCooldown = false;

    this.buildFieldBoundaries();
  }

  setupContactMaterials() {
    // Bola no Feltro (Deslizamento suave)
    const ballFelt = new CANNON.ContactMaterial(this.ballMaterial, this.feltMaterial, {
      friction: 0.12,
      restitution: 0.6
    });

    // Botão no Feltro (Atrito controlado de botão clássico)
    const plasticFelt = new CANNON.ContactMaterial(this.plasticMaterial, this.feltMaterial, {
      friction: 0.28,
      restitution: 0.35
    });

    // Botão na Bola (Impacto seco com transferência de momento)
    const plasticBall = new CANNON.ContactMaterial(this.plasticMaterial, this.ballMaterial, {
      friction: 0.2,
      restitution: 0.85
    });

    // Botão com Botão
    const plasticPlastic = new CANNON.ContactMaterial(this.plasticMaterial, this.plasticMaterial, {
      friction: 0.25,
      restitution: 0.7
    });

    // Bola / Botão nas Paredes de Madeira (Tabelas)
    const ballWood = new CANNON.ContactMaterial(this.ballMaterial, this.woodMaterial, {
      friction: 0.1,
      restitution: 0.75
    });
    const plasticWood = new CANNON.ContactMaterial(this.plasticMaterial, this.woodMaterial, {
      friction: 0.15,
      restitution: 0.55
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
    // Gira o plano para apontar para cima (Y+)
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    const halfW = this.fieldWidth / 2;
    const halfH = this.fieldHeight / 2;
    const wallH = 1.2;
    const wallThick = 0.5;

    // Bordas Laterais Superiores e Inferiores (Z+ e Z-)
    const sideShape = new CANNON.Box(new CANNON.Vec3(halfW + 0.5, wallH / 2, wallThick / 2));
    
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

    // Bordas de Fundo (Deixando abertura para o Gol no centro)
    const segmentWidth = (this.fieldHeight - this.goalWidth) / 4;
    const endShape = new CANNON.Box(new CANNON.Vec3(wallThick / 2, wallH / 2, segmentWidth));

    const zOffset = this.goalWidth / 2 + segmentWidth;

    // Esquerda (X = -halfW) - Superior e Inferior ao gol
    this.createStaticBox(new CANNON.Vec3(-halfW - wallThick / 2, wallH / 2, zOffset), endShape, this.woodMaterial);
    this.createStaticBox(new CANNON.Vec3(-halfW - wallThick / 2, wallH / 2, -zOffset), endShape, this.woodMaterial);

    // Direita (X = halfW) - Superior e Inferior ao gol
    this.createStaticBox(new CANNON.Vec3(halfW + wallThick / 2, wallH / 2, zOffset), endShape, this.woodMaterial);
    this.createStaticBox(new CANNON.Vec3(halfW + wallThick / 2, wallH / 2, -zOffset), endShape, this.woodMaterial);

    // Traves e Redes (Esquerda e Direita)
    this.buildGoalPhysics(-halfW, -1); // Gol Time 1 (Home)
    this.buildGoalPhysics(halfW, 1);   // Gol Time 2 (Away)
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

    // Postes Verticais da Trave (Físicos)
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

    // Paredes da Rede do Gol (Fundo e Laterais para a bola não vazar)
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

  // Cria Corpo Físico do Botão de Linha
  createButtonBody(id, position, isGoalkeeper = false) {
    let body;
    if (isGoalkeeper) {
      // Goleiro Retangular de Botão Clássico
      const halfSize = new CANNON.Vec3(0.25, 0.35, 0.9);
      body = new CANNON.Body({
        mass: 3.5,
        material: this.plasticMaterial,
        linearDamping: 0.6,
        angularDamping: 0.85
      });
      body.addShape(new CANNON.Box(halfSize));
    } else {
      // Botão de Linha Circular
      const radius = 0.72;
      const height = 0.28;
      body = new CANNON.Body({
        mass: 1.2,
        material: this.plasticMaterial,
        linearDamping: 0.52,
        angularDamping: 0.8
      });
      // Em Cannon.js, o Cylinder fica alinhado no eixo Z, então rotacionamos para ficar no eixo Y
      const q = new CANNON.Quaternion();
      q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
      body.addShape(new CANNON.Cylinder(radius, radius, height, 16), new CANNON.Vec3(0, 0, 0), q);
    }

    body.position.copy(position);
    body.pieceId = id;
    body.isGoalkeeper = isGoalkeeper;

    // Som de colisão
    body.addEventListener('collide', (event) => {
      const contact = event.contact;
      const relVel = contact.getImpactVelocityAlongNormal();
      if (Math.abs(relVel) > 0.4) {
        if (event.body.material === this.plasticMaterial || event.body.material === this.ballMaterial) {
          sounds.playKick(Math.abs(relVel) / 8);
        } else if (event.body.material === this.woodMaterial) {
          sounds.playTableBounce(Math.abs(relVel) / 8);
        }
      }
    });

    this.world.addBody(body);
    this.bodies.push(body);
    return body;
  }

  // Cria Corpo Físico da Bola
  createBallBody(position) {
    const radius = 0.35;
    const body = new CANNON.Body({
      mass: 0.22,
      material: this.ballMaterial,
      linearDamping: 0.38,
      angularDamping: 0.4
    });
    body.addShape(new CANNON.Sphere(radius));
    body.position.copy(position);
    body.isBall = true;

    body.addEventListener('collide', (event) => {
      const contact = event.contact;
      const relVel = contact.getImpactVelocityAlongNormal();
      if (Math.abs(relVel) > 0.3) {
        if (event.body.material === this.woodMaterial) {
          sounds.playTableBounce(Math.abs(relVel) / 6);
        } else if (event.body.material === this.plasticMaterial) {
          sounds.playKick(Math.abs(relVel) / 6);
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

  // Verifica se a bola entrou em um dos dois gols
  checkGoalDetection() {
    if (!this.ballBody || this.goalCooldown) return;

    const bPos = this.ballBody.position;
    const halfGW = this.goalWidth / 2;
    const halfW = this.fieldWidth / 2;

    // Checa se a bola está entre os limites laterais e de altura do gol
    if (Math.abs(bPos.z) < halfGW && bPos.y > 0 && bPos.y < this.goalHeight) {
      // Gol na trave esquerda (X < -halfW) -> Ponto para o Time 2 (Away)
      if (bPos.x < -halfW - 0.2) {
        this.triggerGoal(1); // Time 1 tomou gol, ponto do Time 2
      }
      // Gol na trave direita (X > halfW) -> Ponto para o Time 1 (Home)
      else if (bPos.x > halfW + 0.2) {
        this.triggerGoal(0); // Time 2 tomou gol, ponto do Time 1
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

  // Monitora se todas as peças pararam completamente para passar a vez
  checkSettledStatus() {
    const SPEED_THRESHOLD = 0.08;
    let allStationary = true;

    for (let body of this.bodies) {
      const speed = body.velocity.length();
      const rotSpeed = body.angularVelocity.length();
      if (speed > SPEED_THRESHOLD || rotSpeed > SPEED_THRESHOLD) {
        allStationary = false;
        break;
      }
    }

    if (allStationary) {
      this.settledFrames++;
      if (this.settledFrames >= 8) {
        if (!this.isSettled) {
          this.isSettled = true;
          // Zera micro velocidades residuais
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

  // Aplica impulso do chute em um botão
  applyShotImpulse(body, impulseVec) {
    if (!body) return;
    this.isSettled = false;
    this.settledFrames = 0;
    body.wakeUp();
    body.applyImpulse(new CANNON.Vec3(impulseVec.x, 0, impulseVec.z), body.position);
    sounds.playKick(impulseVec.length() / 25);
  }

  resetBody(body, position, rotationY = 0) {
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.position.copy(position);
    body.quaternion.setFromEuler(0, rotationY, 0);
    if (!body.isGoalkeeper && !body.isBall) {
      // Corrige rotação do cilindro
      const q = new CANNON.Quaternion();
      q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
      body.quaternion.copy(q);
    }
  }
}
