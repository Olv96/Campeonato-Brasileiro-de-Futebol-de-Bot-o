/**
 * physics.js - Simulação Física 3D com Cannon-es
 * Física calibrada com atrito cinético ativo para desaceleração suave e parada garantida.
 */

import * as CANNON from 'cannon-es';
import { sounds } from './audio.js';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -25, 0)
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
    const ballFelt = new CANNON.ContactMaterial(this.ballMaterial, this.feltMaterial, {
      friction: 0.05,
      restitution: 0.6
    });

    const plasticFelt = new CANNON.ContactMaterial(this.plasticMaterial, this.feltMaterial, {
      friction: 0.08,
      restitution: 0.2
    });

    // Impacto firme entre Botão e Bola (alta transferência de momento!)
    const plasticBall = new CANNON.ContactMaterial(this.plasticMaterial, this.ballMaterial, {
      friction: 0.1,
      restitution: 0.98
    });

    const plasticPlastic = new CANNON.ContactMaterial(this.plasticMaterial, this.plasticMaterial, {
      friction: 0.12,
      restitution: 0.8
    });

    const ballWood = new CANNON.ContactMaterial(this.ballMaterial, this.woodMaterial, {
      friction: 0.05,
      restitution: 0.85
    });

    const plasticWood = new CANNON.ContactMaterial(this.plasticMaterial, this.woodMaterial, {
      friction: 0.08,
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

    const barShape = new CANNON.Box(new CANNON.Vec3(postRadius, postRadius, halfGW));
    const crossbar = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.plasticMaterial,
      position: new CANNON.Vec3(xPos, gHeight, 0)
    });
    crossbar.addShape(barShape);
    this.world.addBody(crossbar);

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
      const halfSize = new CANNON.Vec3(0.28, 0.35, 1.0);
      body = new CANNON.Body({
        mass: 3.5,
        material: this.plasticMaterial
      });
      body.addShape(new CANNON.Box(halfSize));
      body.angularFactor.set(0, 1, 0);
      body.linearFactor.set(1, 0, 1);
      body.position.set(position.x, 0.35, position.z);
    } else {
      const radius = 0.75;
      const height = 0.36;

      body = new CANNON.Body({
        mass: 1.3,
        material: this.plasticMaterial
      });

      const shapeQ = new CANNON.Quaternion();
      shapeQ.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
      const cylinderShape = new CANNON.Cylinder(radius, radius, height, 24);
      body.addShape(cylinderShape, new CANNON.Vec3(0, 0, 0), shapeQ);

      // Trava inclinação nos eixos X e Z para nunca capotar
      body.angularFactor.set(0, 1, 0);
      body.linearFactor.set(1, 0, 1);
      body.position.set(position.x, height / 2, position.z);
    }

    body.pieceId = id;
    body.isGoalkeeper = isGoalkeeper;

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
      mass: 0.18,
      material: this.ballMaterial
    });
    body.addShape(new CANNON.Sphere(radius));
    body.angularFactor.set(1, 1, 1);
    body.linearFactor.set(1, 0.25, 1);
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
    // 1. Aplica atrito ativo real a cada frame para desacelerar com perfeição
    for (let body of this.bodies) {
      if (body.isBall) {
        // Bola rola e desacelera suavemente
        body.velocity.x *= 0.982;
        body.velocity.z *= 0.982;
        body.angularVelocity.x *= 0.982;
        body.angularVelocity.z *= 0.982;

        if (Math.hypot(body.velocity.x, body.velocity.z) < 0.1) {
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
        }
      } else {
        // Botão desliza como acrílico encerado e desacelera de forma natural e firme
        body.velocity.x *= 0.962;
        body.velocity.z *= 0.962;
        body.angularVelocity.y *= 0.95;

        if (Math.hypot(body.velocity.x, body.velocity.z) < 0.1) {
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
        }
      }
    }

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

    if (Math.abs(bPos.z) < halfGW && bPos.y >= 0 && bPos.y < this.goalHeight) {
      if (bPos.x < -halfW - 0.2) {
        this.triggerGoal(1);
      } else if (bPos.x > halfW + 0.2) {
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

  // Monitora quando todas as peças param para liberar o próximo turno
  checkSettledStatus() {
    const SPEED_THRESHOLD = 0.12;
    let allStationary = true;

    for (let body of this.bodies) {
      const speed = Math.hypot(body.velocity.x, body.velocity.z);
      if (speed > SPEED_THRESHOLD) {
        allStationary = false;
        break;
      }
    }

    if (allStationary) {
      this.settledFrames++;
      if (this.settledFrames >= 3) {
        this.forceSettle();
      }
    } else {
      this.settledFrames = 0;
      this.isSettled = false;
    }
  }

  // Força o repouso imediato de todos os corpos
  forceSettle() {
    this.isSettled = true;
    this.settledFrames = 3;
    for (let body of this.bodies) {
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
    }
  }

  // Aplica o impulso do chute no botão
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

    const posY = body.isBall ? 0.32 : (body.isGoalkeeper ? 0.35 : 0.18);
    body.position.set(position.x, posY, position.z);
    body.quaternion.setFromEuler(0, rotationY, 0);
  }
}
