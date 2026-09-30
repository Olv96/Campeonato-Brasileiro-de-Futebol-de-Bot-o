/**
 * renderer.js - Renderização 3D de Alta Fidelidade com Three.js
 * Cria a mesa de botão, campo listrado com marcações oficiais, botões acrílicos com 3 letras,
 * bola esportiva, iluminação de holofotes e linha de mira de trajetória estilingue.
 */

import * as THREE from 'three';

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e17);

    // Renderer WebGL
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Configuração de Câmeras
    this.aspect = window.innerWidth / window.innerHeight;
    this.setupCameras();

    // Luzes
    this.setupLighting();

    // Construção do Cenário do Futebol de Botão
    this.buildTableAndField();
    this.buildGoals();

    // Indicadores Visuais de Mira e Seleção
    this.setupAimHelpers();

    // Coleções de Meshes
    this.pieceMeshes = new Map(); // pieceId -> Mesh
    this.ballMesh = null;

    // Redimensionamento
    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupCameras() {
    // Câmera 1: Visão Isométrica Elevada (Esportiva Dinâmica)
    this.cameraIso = new THREE.PerspectiveCamera(45, this.aspect, 0.1, 1000);
    this.cameraIso.position.set(0, 22, 17);
    this.cameraIso.lookAt(0, 0, 0);

    // Câmera 2: Visão Zenital / Top-Down (Tática)
    this.cameraTop = new THREE.PerspectiveCamera(50, this.aspect, 0.1, 1000);
    this.cameraTop.position.set(0, 28, 0.01);
    this.cameraTop.lookAt(0, 0, 0);

    this.activeCamera = this.cameraIso;
    this.isTopView = false;
  }

  toggleCamera() {
    this.isTopView = !this.isTopView;
    this.activeCamera = this.isTopView ? this.cameraTop : this.cameraIso;
    return this.isTopView;
  }

  setupLighting() {
    // Luz ambiente suave
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    // Holofotes direcionais simulando iluminação de estádio
    const dirLight1 = new THREE.DirectionalLight(0xfff8ee, 1.4);
    dirLight1.position.set(16, 25, 14);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.camera.near = 0.5;
    dirLight1.shadow.camera.far = 60;
    dirLight1.shadow.camera.left = -18;
    dirLight1.shadow.camera.right = 18;
    dirLight1.shadow.camera.top = 12;
    dirLight1.shadow.camera.bottom = -12;
    dirLight1.shadow.bias = -0.001;
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xddeeff, 0.8);
    dirLight2.position.set(-16, 20, -14);
    this.scene.add(dirLight2);
  }

  buildTableAndField() {
    const fieldW = 26;
    const fieldH = 16;
    const wallHeight = 1.2;
    const borderThick = 0.8;

    // Textura do Gramado Oficial de Botão com Linhas Perfeitas
    const fieldTexture = this.generateFieldTexture();
    const fieldMaterial = new THREE.MeshStandardMaterial({
      map: fieldTexture,
      roughness: 0.8,
      metalness: 0.02
    });

    const fieldGeo = new THREE.PlaneGeometry(fieldW, fieldH);
    const fieldMesh = new THREE.Mesh(fieldGeo, fieldMaterial);
    fieldMesh.rotation.x = -Math.PI / 2;
    fieldMesh.position.y = 0.002; // Levemente acima da base de madeira para ELIMINAR Z-FIGHTING
    fieldMesh.receiveShadow = true;
    this.scene.add(fieldMesh);

    // Borda Externa de Madeira da Mesa (Estilo Clássico de Marcenaria)
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x2e190e, // Mogno nobre escuro
      roughness: 0.45,
      metalness: 0.1
    });

    // Paredes da Mesa
    const totalW = fieldW + borderThick * 2;
    const totalH = fieldH + borderThick * 2;

    // Base da Mesa sob o campo (rebaixada para -0.52 para nunca disputar pixels com a grama)
    const tableBaseGeo = new THREE.BoxGeometry(totalW, 1, totalH);
    const tableBase = new THREE.Mesh(tableBaseGeo, woodMaterial);
    tableBase.position.y = -0.52;
    tableBase.receiveShadow = true;
    this.scene.add(tableBase);

    // Laterais da Mesa
    const sideGeo = new THREE.BoxGeometry(totalW, wallHeight, borderThick);
    
    // Borda Superior
    const wallTop = new THREE.Mesh(sideGeo, woodMaterial);
    wallTop.position.set(0, wallHeight / 2, fieldH / 2 + borderThick / 2);
    wallTop.castShadow = true;
    wallTop.receiveShadow = true;
    this.scene.add(wallTop);

    // Borda Inferior
    const wallBottom = new THREE.Mesh(sideGeo, woodMaterial);
    wallBottom.position.set(0, wallHeight / 2, -(fieldH / 2 + borderThick / 2));
    wallBottom.castShadow = true;
    wallBottom.receiveShadow = true;
    this.scene.add(wallBottom);

    // Bordas de Fundo (com espaço para a boca do gol)
    const goalW = 4.0;
    const endSegmentH = (fieldH - goalW) / 2;
    const endGeo = new THREE.BoxGeometry(borderThick, wallHeight, endSegmentH);

    const zOffset = goalW / 2 + endSegmentH / 2;

    // Fundo Esquerdo
    const endL1 = new THREE.Mesh(endGeo, woodMaterial);
    endL1.position.set(-(fieldW / 2 + borderThick / 2), wallHeight / 2, zOffset);
    endL1.castShadow = true;
    this.scene.add(endL1);

    const endL2 = new THREE.Mesh(endGeo, woodMaterial);
    endL2.position.set(-(fieldW / 2 + borderThick / 2), wallHeight / 2, -zOffset);
    endL2.castShadow = true;
    this.scene.add(endL2);

    // Fundo Direito
    const endR1 = new THREE.Mesh(endGeo, woodMaterial);
    endR1.position.set(fieldW / 2 + borderThick / 2, wallHeight / 2, zOffset);
    endR1.castShadow = true;
    this.scene.add(endR1);

    const endR2 = new THREE.Mesh(endGeo, woodMaterial);
    endR2.position.set(fieldW / 2 + borderThick / 2, wallHeight / 2, -zOffset);
    endR2.castShadow = true;
    this.scene.add(endR2);
  }

  // Gera Canvas 2D de Alta Definição para as Faixas de Gramado e Linhas Oficiais
  generateFieldTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1260;
    const ctx = canvas.getContext('2d');

    const w = canvas.width;
    const h = canvas.height;

    // Faixas de Grama Alternadas (Tons Verdes Suaves e Profissionais)
    const stripes = 16;
    const stripeW = w / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = (i % 2 === 0) ? '#1b6932' : '#237a3b';
      ctx.fillRect(i * stripeW, 0, stripeW, h);
    }

    // Linhas Brancas do Campo Oficial
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';

    const margin = 30;
    const innerW = w - margin * 2;
    const innerH = h - margin * 2;

    // Borda Externa do Campo
    ctx.strokeRect(margin, margin, innerW, innerH);

    // Linha de Meio Campo
    ctx.beginPath();
    ctx.moveTo(w / 2, margin);
    ctx.lineTo(w / 2, h - margin);
    ctx.stroke();

    // Círculo Central
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 175, 0, Math.PI * 2);
    ctx.stroke();

    // Ponto Central
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 14, 0, Math.PI * 2);
    ctx.fill();

    // Grande Área e Pequena Área - Esquerda (Gol Time 1)
    const areaW = 310;
    const areaH = 620;
    const smallAreaW = 130;
    const smallAreaH = 340;

    // Grande Área Esquerda
    ctx.strokeRect(margin, (h - areaH) / 2, areaW, areaH);
    // Pequena Área Esquerda
    ctx.strokeRect(margin, (h - smallAreaH) / 2, smallAreaW, smallAreaH);
    // Ponto do Pênalti Esquerdo
    ctx.beginPath();
    ctx.arc(margin + 200, h / 2, 12, 0, Math.PI * 2);
    ctx.fill();
    // Arco da Grande Área Esquerdo
    ctx.beginPath();
    ctx.arc(margin + 200, h / 2, 110, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();

    // Grande Área e Pequena Área - Direita (Gol Time 2)
    ctx.strokeRect(w - margin - areaW, (h - areaH) / 2, areaW, areaH);
    ctx.strokeRect(w - margin - smallAreaW, (h - smallAreaH) / 2, smallAreaW, smallAreaH);
    ctx.beginPath();
    ctx.arc(w - margin - 200, h / 2, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w - margin - 200, h / 2, 110, (2 * Math.PI) / 3, (4 * Math.PI) / 3);
    ctx.stroke();

    // Cantos do Escanteio (Quatro Arcos)
    const cornerR = 35;
    ctx.beginPath(); ctx.arc(margin, margin, cornerR, 0, Math.PI / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(margin, h - margin, cornerR, -Math.PI / 2, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(w - margin, margin, cornerR, Math.PI / 2, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(w - margin, h - margin, cornerR, Math.PI, (3 * Math.PI) / 2); ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 16;
    return texture;
  }

  buildGoals() {
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.6
    });

    const netMat = new THREE.MeshStandardMaterial({
      color: 0xe0e7ff,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    });

    const fieldW = 26;
    const goalW = 4.0;
    const goalH = 1.8;
    const goalDepth = 1.8;
    const postR = 0.08;

    [-1, 1].forEach((dir) => {
      const x = dir * (fieldW / 2);

      // Postes Verticais
      const postGeo = new THREE.CylinderGeometry(postR, postR, goalH, 16);
      const post1 = new THREE.Mesh(postGeo, postMat);
      post1.position.set(x, goalH / 2, goalW / 2);
      post1.castShadow = true;
      this.scene.add(post1);

      const post2 = new THREE.Mesh(postGeo, postMat);
      post2.position.set(x, goalH / 2, -goalW / 2);
      post2.castShadow = true;
      this.scene.add(post2);

      // Travessão
      const barGeo = new THREE.CylinderGeometry(postR, postR, goalW, 16);
      const bar = new THREE.Mesh(barGeo, postMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(x, goalH, 0);
      bar.castShadow = true;
      this.scene.add(bar);

      // Caixa da Rede Tridimensional
      const netGeo = new THREE.BoxGeometry(goalDepth, goalH, goalW);
      const netMesh = new THREE.Mesh(netGeo, netMat);
      netMesh.position.set(x + dir * (goalDepth / 2), goalH / 2, 0);
      this.scene.add(netMesh);
    });
  }

  // Cria Textura Acrílica com as 3 Letras da Abreviação e Cor do Time
  generateButtonTexture(colorHex, abbr) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const cx = 256;
    const cy = 256;
    const r = 240;

    // Fundo com Gradiente Radial Acrílico
    const grad = ctx.createRadialGradient(cx - 50, cy - 50, 40, cx, cy, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.2, colorHex);
    grad.addColorStop(0.85, colorHex);
    grad.addColorStop(1, '#000000');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Borda Chanfrada Externa
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 14;
    ctx.stroke();

    // Anel Interno Decorativo
    ctx.beginPath();
    ctx.arc(cx, cy, 150, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 6;
    ctx.setLineDash([12, 10]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3 Letras da Abreviação no Centro com Efeito Relevo
    ctx.font = '900 110px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Sombra do Texto
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillText((abbr || 'BOT').toUpperCase(), cx, cy + 8);

    // Texto Branco Brilhante
    ctx.fillStyle = '#ffffff';
    ctx.fillText((abbr || 'BOT').toUpperCase(), cx, cy);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  // Cria Mesh 3D do Botão de Linha
  createButtonMesh(id, colorHex, abbr, isGoalkeeper = false) {
    let mesh;
    if (isGoalkeeper) {
      // Goleiro Retangular de Mesa (0.56 x 0.7 x 2.0)
      const geo = new THREE.BoxGeometry(0.56, 0.7, 2.0);
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(colorHex),
        roughness: 0.15,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        metalness: 0.1
      });
      mesh = new THREE.Mesh(geo, mat);
    } else {
      // Botão Circular Clássico com Topo de Acrílico Texturizado (Raio 0.75, Altura 0.36)
      const radius = 0.75;
      const height = 0.36;
      const geo = new THREE.CylinderGeometry(radius, radius, height, 32);

      const topTexture = this.generateButtonTexture(colorHex, abbr);

      const sideMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(colorHex),
        roughness: 0.2,
        clearcoat: 0.8,
        metalness: 0.1
      });

      const topMat = new THREE.MeshPhysicalMaterial({
        map: topTexture,
        roughness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05
      });

      // Materiais: [lateral, topo, base]
      mesh = new THREE.Mesh(geo, [sideMat, topMat, sideMat]);
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.pieceId = id;
    this.scene.add(mesh);
    this.pieceMeshes.set(id, mesh);
    return mesh;
  }

  // Cria Mesh 3D da Bola
  createBallMesh() {
    const radius = 0.32;
    const geo = new THREE.SphereGeometry(radius, 32, 32);

    // Textura de bola de futebol clássica
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 256);

    // Manchas pretas da bola
    ctx.fillStyle = '#111111';
    for (let x = 40; x < 512; x += 110) {
      for (let y = 30; y < 256; y += 90) {
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const ballTexture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshStandardMaterial({
      map: ballTexture,
      roughness: 0.35,
      metalness: 0.05
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.ballMesh = mesh;
    return mesh;
  }

  setupAimHelpers() {
    // Anel de Seleção sob o Botão Escolhido
    const ringGeo = new THREE.RingGeometry(0.85, 0.98, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00d26a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.02;
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    // Linha de Trajetória da Mira (Estilingue)
    const lineMat = new THREE.LineDashedMaterial({
      color: 0xffbe0b,
      dashSize: 0.3,
      gapSize: 0.15,
      linewidth: 3
    });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(0, 0.05, 0)
    ]);
    this.aimLine = new THREE.Line(lineGeo, lineMat);
    this.aimLine.computeLineDistances();
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);

    // Flecha indicadora na ponta da mira
    const arrowGeo = new THREE.ConeGeometry(0.3, 0.6, 16);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffbe0b });
    this.aimArrow = new THREE.Mesh(arrowGeo, arrowMat);
    this.aimArrow.rotation.x = Math.PI / 2;
    this.aimArrow.position.y = 0.08;
    this.aimArrow.visible = false;
    this.scene.add(this.aimArrow);
  }

  // Atualiza Mira do Estilingue durante o arrasto do mouse
  updateAimTrajectory(origin, aimVector, powerFraction) {
    if (!aimVector || aimVector.length() < 0.2) {
      this.aimLine.visible = false;
      this.aimArrow.visible = false;
      return;
    }

    this.aimLine.visible = true;
    this.aimArrow.visible = true;

    // Cor dinâmica da mira (Verde -> Amarelo -> Vermelho)
    const color = new THREE.Color().setHSL((1 - powerFraction) * 0.33, 1, 0.5);
    this.aimLine.material.color = color;
    this.aimArrow.material.color = color;

    const startPos = new THREE.Vector3(origin.x, 0.05, origin.z);
    const targetPos = new THREE.Vector3(
      origin.x + aimVector.x,
      0.05,
      origin.z + aimVector.z
    );

    const points = [startPos, targetPos];
    this.aimLine.geometry.setFromPoints(points);
    this.aimLine.computeLineDistances();

    // Posiciona flecha na ponta
    this.aimArrow.position.copy(targetPos);
    this.aimArrow.lookAt(targetPos.x + aimVector.x, 0.08, targetPos.z + aimVector.z);
  }

  hideAimTrajectory() {
    this.aimLine.visible = false;
    this.aimArrow.visible = false;
  }

  showSelectionRing(position) {
    this.selectionRing.position.set(position.x, 0.02, position.z);
    this.selectionRing.visible = true;
  }

  hideSelectionRing() {
    this.selectionRing.visible = false;
  }

  // Sincroniza posições do Cannon.js com Three.js
  syncPhysics(bodies, ballBody) {
    for (let body of bodies) {
      if (body.isBall) {
        if (this.ballMesh) {
          this.ballMesh.position.copy(body.position);
          this.ballMesh.quaternion.copy(body.quaternion);
        }
      } else {
        const mesh = this.pieceMeshes.get(body.pieceId);
        if (mesh) {
          mesh.position.copy(body.position);
          mesh.quaternion.copy(body.quaternion);
        }
      }
    }
  }

  clearPieces() {
    for (let [, mesh] of this.pieceMeshes) {
      this.scene.remove(mesh);
    }
    this.pieceMeshes.clear();
    if (this.ballMesh) {
      this.scene.remove(this.ballMesh);
      this.ballMesh = null;
    }
  }

  render() {
    this.renderer.render(this.scene, this.activeCamera);
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.aspect = width / height;

    this.cameraIso.aspect = this.aspect;
    this.cameraIso.updateProjectionMatrix();

    this.cameraTop.aspect = this.aspect;
    this.cameraTop.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }
}
