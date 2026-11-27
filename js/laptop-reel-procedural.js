/**
 * OPÇÃO 1 — 100% PROCEDURAL THREE.JS 3D NOTEBOOK MOTION REEL (Estilo poly.app)
 * Independent module for /versao-direta/ and root /
 * - 100% Procedural Three.js Geometry (ExtrudeGeometry chamfered unibody + 64 3D backlit keys + articulated hingeGroup)
 * - 3D Spatial Floor Grid + Orbiting Point Lights casting real-time specular reflections
 * - 16:10 Dynamic CanvasTexture projecting MS_OS Desktop Browser UI + First Scene Snapshot + 4 Interactive Showcases
 * - Responsive Camera Framing (Desktop mouse parallax, Tablet 85% FOV fit, Mobile <768px close-up display focus)
 */
(function () {
  "use strict";

  const SHOWCASES = [
    {
      id: 0,
      code: "00 // HERO_STAGE.3D",
      pill: "00 · Site 3D",
      title: "VITRINE INTERATIVA MS_OS DENTRO DO NOTEBOOK",
      desc: "A primeira cena 3D emoldurada como um site desktop real com barra de navegador, menus e WebGL a 120Hz.",
      accent: "#00F0FF",
      badge: "WEBGL 2.0 · 120FPS",
      metricLabel: "Renderização Adaptativa",
      metricVal: "✓ 60–120Hz Fluido",
    },
    {
      id: 1,
      code: "01 // SOFTWARES_JS.APP",
      pill: "01 · Softwares JS",
      title: "CRIAÇÃO DE SOFTWARES, SAAS & ERPS EM JAVASCRIPT",
      desc: "Painéis financeiros, CRMs sob medida e sistemas com leitura automática de PDFs e notas fiscais via IA.",
      accent: "#0088FF",
      badge: "SAAS · ERP · OCR IA",
      metricLabel: "Leitura IA Nota_Fiscal.pdf",
      metricVal: "✓ Extraído em 0,7s",
    },
    {
      id: 2,
      code: "02 // WEB_DESIGN_3D.GL",
      pill: "02 · Web Design 3D",
      title: "WEB DESIGN 3D & LANDING PAGES PADRÃO AWWWARDS",
      desc: "Páginas interativas cinematográficas projetadas para impressionar decisores B2B em qualquer celular ou PC.",
      accent: "#FF1E42",
      badge: "PADRÃO AWWWARDS",
      metricLabel: "Retenção Visual de Decisores",
      metricVal: "+310% Engajamento",
    },
    {
      id: 3,
      code: "03 // AUTOMACAO_IA.N8N",
      pill: "03 · Automação IA",
      title: "AUTOMAÇÕES COM IA & AGENTES SDR NO WHATSAPP 24/7",
      desc: "Robôs inteligentes em n8n que atendem leads em 2 segundos, qualificam, agendam reuniões e atualizam o CRM.",
      accent: "#00FF66",
      badge: "WHATSAPP IA 24/7",
      metricLabel: "Agente SDR IA no WhatsApp",
      metricVal: "✓ Reunião Agendada (1,2s)",
    },
    {
      id: 4,
      code: "04 // TRAFEGO_B2B.ADS",
      pill: "04 · Tráfego B2B",
      title: "GESTÃO DE TRÁFEGO PAGO & ESCALA COMERCIAL B2B",
      desc: "Anúncios estratégicos no Meta Ads e Google Ads levando decisores qualificados direto para o seu funil.",
      accent: "#FFD000",
      badge: "META & GOOGLE ADS",
      metricLabel: "Tráfego + Site Rápido + IA",
      metricVal: "+60% Leads Qualificados",
    },
  ];

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function rangeProgress(p, a, b) {
    if (p <= a) return 0;
    if (p >= b) return 1;
    return (p - a) / (b - a);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // Helper: Create a Chamfered / Rounded 3D Box using native THREE.ExtrudeGeometry (Zero external dependencies!)
  function createRoundedBoxGeo(width, height, depth, radius, smoothness) {
    const shape = new THREE.Shape();
    const eps = 0.00001;
    const r = Math.min(radius, width * 0.45, height * 0.45);
    const w = width - r * 2;
    const h = height - r * 2;
    const x0 = -width * 0.5 + r;
    const y0 = -height * 0.5 + r;

    shape.absarc(x0, y0, Math.max(eps, r), -Math.PI, -Math.PI / 2, false);
    shape.absarc(x0 + w, y0, Math.max(eps, r), -Math.PI / 2, 0, false);
    shape.absarc(x0 + w, y0 + h, Math.max(eps, r), 0, Math.PI / 2, false);
    shape.absarc(x0, y0 + h, Math.max(eps, r), Math.PI / 2, Math.PI, false);

    const extrudeSettings = {
      depth: Math.max(0.001, depth - r * 0.5),
      bevelEnabled: true,
      bevelSegments: Math.max(2, smoothness || 3),
      steps: 1,
      bevelSize: r * 0.35,
      bevelThickness: r * 0.25,
      curveSegments: Math.max(4, (smoothness || 3) * 2),
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.center();
    return geo;
  }

  function initProceduralLaptopReel() {
    if (typeof THREE === "undefined") return;
    document.body.classList.add("has-3d-laptop-reel");

    const stickyStage = document.getElementById("scrollytelling-stage");
    const scrollyTrack = document.getElementById("scrollytelling-track");
    if (!stickyStage) return;

    // 1. Inject 3D Laptop Stage & Floating Editorial HUD
    const stageEl = document.createElement("div");
    stageEl.className = "laptop-3d-stage";
    stageEl.id = "laptop-3d-stage";
    stageEl.innerHTML = `
      <canvas class="laptop-3d-canvas" id="laptop-3d-canvas"></canvas>
      <div class="laptop-reel-hud" id="laptop-reel-hud">
        <div class="laptop-reel-top-badge">
          <span class="badge-dot"></span>
          <span>OPÇÃO 1 // NOTEBOOK 3D 100% PROCEDURAL (THREE.JS GEOMETRY)</span>
        </div>
        <div class="laptop-reel-bottom-row">
          <div class="laptop-editorial-card" id="laptop-editorial-card">
            <span class="laptop-editorial-kicker" id="laptop-ed-kicker">00 // HERO_STAGE.3D</span>
            <div class="laptop-editorial-title" id="laptop-ed-title">VITRINE INTERATIVA MS_OS DENTRO DO NOTEBOOK</div>
            <p class="laptop-editorial-desc" id="laptop-ed-desc">A primeira cena 3D emoldurada como um site desktop real com barra de navegador, menus e WebGL a 120Hz.</p>
          </div>
          <div class="laptop-showcase-pills" role="tablist" aria-label="Showcases MS_OS">
            <button type="button" class="laptop-showcase-pill is-active" data-showcase-idx="0">00 · Site 3D</button>
            <button type="button" class="laptop-showcase-pill" data-showcase-idx="1">01 · Softwares JS</button>
            <button type="button" class="laptop-showcase-pill" data-showcase-idx="2">02 · Web 3D</button>
            <button type="button" class="laptop-showcase-pill" data-showcase-idx="3">03 · IA n8n</button>
            <button type="button" class="laptop-showcase-pill" data-showcase-idx="4">04 · Ads B2B</button>
          </div>
        </div>
      </div>
    `;
    stickyStage.appendChild(stageEl);

    // Inject Version Switcher so the user can compare Opção 1 (Procedural) vs Opção 2 (.GLB)
    const switcher = document.createElement("nav");
    switcher.className = "version-compare-switcher";
    switcher.setAttribute("aria-label", "Alternar entre as duas opções de Notebook 3D");
    const isSubdir = window.location.pathname.indexOf("/versao-") !== -1;
    const urlProcedural = isSubdir ? "../versao-direta/" : "versao-direta/";
    const urlGlb = isSubdir ? "../versao-completa/" : "versao-completa/";
    switcher.innerHTML = `
      <a href="${urlProcedural}" class="version-compare-link is-current">Opção 1: 3D Procedural</a>
      <a href="${urlGlb}" class="version-compare-link">Opção 2: Modelo .GLB</a>
    `;
    document.body.appendChild(switcher);

    const canvas = document.getElementById("laptop-3d-canvas");
    const edKicker = document.getElementById("laptop-ed-kicker");
    const edTitle = document.getElementById("laptop-ed-title");
    const edDesc = document.getElementById("laptop-ed-desc");
    const pillBtns = stageEl.querySelectorAll("[data-showcase-idx]");

    let manualShowcaseOverride = null;
    pillBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-showcase-idx"), 10) || 0;
        manualShowcaseOverride = idx;
        setActiveShowcaseUI(idx);
        drawScreenCanvasTexture(idx, performance.now() * 0.001);
      });
    });

    // 2. Three.js Scene, Camera & Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.35, 5.2);

    // 3. Spatial 3D Grid + Orbiting Specular Lights
    const gridGroup = new THREE.Group();
    const gridHelper = new THREE.GridHelper(18, 28, 0x00ff66, 0x003b1e);
    gridHelper.position.y = -0.65;
    if (gridHelper.material) {
      gridHelper.material.transparent = true;
      gridHelper.material.opacity = 0.26;
    }
    gridGroup.add(gridHelper);
    scene.add(gridGroup);

    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);

    const rimLightCyan = new THREE.PointLight(0x00f0ff, 3.4, 14);
    rimLightCyan.position.set(-3.5, 2.2, -2.5);
    scene.add(rimLightCyan);

    const rimLightGreen = new THREE.PointLight(0x00ff66, 3.0, 14);
    rimLightGreen.position.set(3.5, 1.8, 2.8);
    scene.add(rimLightGreen);

    const rimLightMagenta = new THREE.PointLight(0xff007a, 2.2, 12);
    rimLightMagenta.position.set(0, -1.5, 3.2);
    scene.add(rimLightMagenta);

    // 4. Dynamic 16:10 CanvasTexture Projecting MS_OS UI onto the 3D Screen
    const screenTexCanvas = document.createElement("canvas");
    screenTexCanvas.width = 1280;
    screenTexCanvas.height = 800; // 16:10 aspect ratio
    const sCtx = screenTexCanvas.getContext("2d");
    const screenTexture = new THREE.CanvasTexture(screenTexCanvas);
    screenTexture.minFilter = THREE.LinearFilter;
    screenTexture.magFilter = THREE.LinearFilter;
    if ("colorSpace" in screenTexture && THREE.SRGBColorSpace) {
      screenTexture.colorSpace = THREE.SRGBColorSpace;
    }

    // 5. Build 100% Procedural MacBook Pro / Cyberpunk Workstation
    const laptopRoot = new THREE.Group();
    scene.add(laptopRoot);

    const aluminumMat = new THREE.MeshStandardMaterial({
      color: 0x20242e,
      metalness: 0.86,
      roughness: 0.24,
    });

    const chamferRimMat = new THREE.MeshStandardMaterial({
      color: 0x4b5366,
      metalness: 0.94,
      roughness: 0.16,
    });

    const darkWellMat = new THREE.MeshStandardMaterial({
      color: 0x07090e,
      metalness: 0.35,
      roughness: 0.65,
    });

    const keycapMat = new THREE.MeshStandardMaterial({
      color: 0x12151e,
      metalness: 0.25,
      roughness: 0.45,
      emissive: 0x00ff66,
      emissiveIntensity: 0.14,
    });

    const trackpadMat = new THREE.MeshStandardMaterial({
      color: 0x181c26,
      metalness: 0.5,
      roughness: 0.14,
    });

    // 5A. Base Group (Unibody Deck + Recessed Keyboard + 64 3D Keycaps + Trackpad + Thumb Notch)
    const baseGroup = new THREE.Group();
    laptopRoot.add(baseGroup);

    const baseGeo = createRoundedBoxGeo(3.2, 2.15, 0.1, 0.12, 3);
    baseGeo.rotateX(Math.PI / 2);
    const baseMesh = new THREE.Mesh(baseGeo, aluminumMat);
    baseMesh.position.y = -0.05;
    baseGroup.add(baseMesh);

    // Keyboard recessed well
    const wellGeo = new THREE.BoxGeometry(2.68, 0.02, 1.04);
    const wellMesh = new THREE.Mesh(wellGeo, darkWellMat);
    wellMesh.position.set(0, 0.005, -0.18);
    baseGroup.add(wellMesh);

    // Glowing Matrix Backlight Plate under the keys
    const backlightMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      transparent: true,
      opacity: 0.28,
    });
    const backlightPlate = new THREE.Mesh(new THREE.PlaneGeometry(2.62, 0.98), backlightMat);
    backlightPlate.rotation.x = -Math.PI / 2;
    backlightPlate.position.set(0, 0.016, -0.18);
    baseGroup.add(backlightPlate);

    // 64 Sculpted 3D Keycaps using InstancedMesh (1 single draw call!)
    const rows = 5;
    const cols = 13;
    const totalKeys = rows * cols;
    const keyGeo = new THREE.BoxGeometry(0.175, 0.022, 0.155);
    const keyInstanced = new THREE.InstancedMesh(keyGeo, keycapMat, totalKeys);
    const dummy = new THREE.Object3D();
    let kIdx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const kx = -1.2 + c * 0.2;
        const kz = -0.56 + r * 0.19;
        dummy.position.set(kx, 0.022, kz);
        dummy.scale.set(r === 4 && c >= 4 && c <= 8 ? 1.15 : 1, 1, 1);
        dummy.updateMatrix();
        keyInstanced.setMatrixAt(kIdx++, dummy.matrix);
      }
    }
    keyInstanced.instanceMatrix.needsUpdate = true;
    baseGroup.add(keyInstanced);

    // Glass Force Touch Trackpad
    const tpGeo = new THREE.BoxGeometry(0.98, 0.012, 0.56);
    const tpMesh = new THREE.Mesh(tpGeo, trackpadMat);
    tpMesh.position.set(0, 0.008, 0.64);
    baseGroup.add(tpMesh);

    // Front CNC Thumb Notch
    const notchGeo = new THREE.BoxGeometry(0.46, 0.032, 0.08);
    const notchMesh = new THREE.Mesh(notchGeo, darkWellMat);
    notchMesh.position.set(0, -0.02, 1.05);
    baseGroup.add(notchMesh);

    // Rear Cylindrical Hinge Clutch
    const hingeCylGeo = new THREE.CylinderGeometry(0.042, 0.042, 2.2, 16);
    hingeCylGeo.rotateZ(Math.PI / 2);
    const hingeCylMesh = new THREE.Mesh(hingeCylGeo, darkWellMat);
    hingeCylMesh.position.set(0, 0.01, -1.05);
    baseGroup.add(hingeCylMesh);

    // 5B. Articulated Lid Group (Pivots around X axis at the rear hinge [0, 0.02, -1.05])
    const hingeGroup = new THREE.Group();
    hingeGroup.position.set(0, 0.02, -1.05);
    laptopRoot.add(hingeGroup);

    // Outer Aluminum Lid Shell
    const lidShellGeo = createRoundedBoxGeo(3.2, 2.04, 0.055, 0.12, 3);
    const lidShellMesh = new THREE.Mesh(lidShellGeo, aluminumMat);
    lidShellMesh.position.set(0, 1.02, -0.02);
    hingeGroup.add(lidShellMesh);

    // Metallic Chamfer Rim around Lid
    const lidRimGeo = createRoundedBoxGeo(3.22, 2.06, 0.03, 0.12, 3);
    const lidRimMesh = new THREE.Mesh(lidRimGeo, chamferRimMat);
    lidRimMesh.position.set(0, 1.02, -0.025);
    hingeGroup.add(lidRimMesh);

    // Piano Black Glass Display Bezel
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x040508,
      metalness: 0.2,
      roughness: 0.1,
    });
    const bezelMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.96), bezelMat);
    bezelMesh.position.set(0, 1.02, 0.012);
    hingeGroup.add(bezelMesh);

    // 16:10 Embedded Display Screen Plane
    const screenMat = new THREE.MeshBasicMaterial({
      map: screenTexture,
    });
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.96, 1.85), screenMat);
    screenMesh.position.set(0, 1.03, 0.016);
    hingeGroup.add(screenMesh);

    // Subtle Diagonal Glass Glare Layer over Display
    const glareCanvas = document.createElement("canvas");
    glareCanvas.width = 256;
    glareCanvas.height = 256;
    const gCtx = glareCanvas.getContext("2d");
    const gGrad = gCtx.createLinearGradient(0, 0, 256, 200);
    gGrad.addColorStop(0, "rgba(255,255,255,0.14)");
    gGrad.addColorStop(0.32, "rgba(255,255,255,0.03)");
    gGrad.addColorStop(0.45, "rgba(255,255,255,0)");
    gGrad.addColorStop(1, "rgba(0,255,102,0.05)");
    gCtx.fillStyle = gGrad;
    gCtx.fillRect(0, 0, 256, 256);
    const glareTex = new THREE.CanvasTexture(glareCanvas);
    const glareMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.98, 1.86),
      new THREE.MeshBasicMaterial({ map: glareTex, transparent: true, depthWrite: false })
    );
    glareMesh.position.set(0, 1.03, 0.019);
    hingeGroup.add(glareMesh);

    // Camera Notch + Green Active LED at Top Center of Screen
    const camNotchMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.065), bezelMat);
    camNotchMesh.position.set(0, 1.925, 0.02);
    hingeGroup.add(camNotchMesh);

    const camLedMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.011, 12),
      new THREE.MeshBasicMaterial({ color: 0x00ff66 })
    );
    camLedMesh.position.set(0.06, 1.925, 0.022);
    hingeGroup.add(camLedMesh);

    // 6. Render the MS_OS Interactive Interface onto the 16:10 Screen CanvasTexture
    let activeShowcaseIdx = 0;

    function setActiveShowcaseUI(idx) {
      if (activeShowcaseIdx === idx && edKicker && edKicker.dataset.idx === String(idx)) return;
      activeShowcaseIdx = idx;
      const item = SHOWCASES[idx] || SHOWCASES[0];
      if (edKicker) {
        edKicker.textContent = item.code;
        edKicker.dataset.idx = String(idx);
        edKicker.style.color = item.accent;
      }
      if (edTitle) edTitle.textContent = item.title;
      if (edDesc) edDesc.textContent = item.desc;
      pillBtns.forEach((b) => {
        const bIdx = parseInt(b.getAttribute("data-showcase-idx"), 10) || 0;
        b.classList.toggle("is-active", bIdx === idx);
      });
    }

    function drawScreenCanvasTexture(showcaseIdx, timeSec) {
      const w = screenTexCanvas.width;
      const h = screenTexCanvas.height;
      const item = SHOWCASES[showcaseIdx] || SHOWCASES[0];

      // Background
      sCtx.fillStyle = "#060510";
      sCtx.fillRect(0, 0, w, h);

      // 1. Desktop Browser Chrome Bar (Top 44px)
      sCtx.fillStyle = "#141722";
      sCtx.fillRect(0, 0, w, 46);
      const dotColors = ["#FF5F56", "#FFBD2E", "#27C93F"];
      for (let i = 0; i < 3; i++) {
        sCtx.beginPath();
        sCtx.fillStyle = dotColors[i];
        sCtx.arc(24 + i * 20, 23, 6.5, 0, Math.PI * 2);
        sCtx.fill();
      }

      // URL Bar Pill
      sCtx.fillStyle = "#080A11";
      sCtx.fillRect(320, 9, 640, 28);
      sCtx.strokeStyle = "rgba(255,255,255,0.16)";
      sCtx.lineWidth = 1;
      sCtx.strokeRect(320, 9, 640, 28);
      sCtx.fillStyle = "#E2E8F0";
      sCtx.font = '600 14px "Consolas", monospace';
      sCtx.textAlign = "center";
      sCtx.fillText("🔒 https://marcossiqueira.com.br/ms-os/" + item.code.split(" ")[2].toLowerCase(), 640, 28);

      // FPS Badge
      sCtx.fillStyle = "rgba(0, 255, 102, 0.16)";
      sCtx.fillRect(1080, 10, 176, 26);
      sCtx.fillStyle = "#00FF66";
      sCtx.font = '700 13px "Consolas", monospace';
      sCtx.fillText(item.badge, 1168, 28);

      // 2. Desktop Website Navigation Header (y: 46 -> 104)
      sCtx.fillStyle = "#0B0919";
      sCtx.fillRect(0, 46, w, 56);
      sCtx.fillStyle = "#FFFFFF";
      sCtx.font = '700 22px "Bebas Neue", sans-serif';
      sCtx.textAlign = "left";
      sCtx.fillText("MS. MARCOS SIQUEIRA", 28, 82);

      const navLabels = ["Início 3D", "Softwares JS", "Web Design 3D", "Automações IA", "Tráfego B2B"];
      sCtx.font = '600 14px "Inter", sans-serif';
      for (let n = 0; n < navLabels.length; n++) {
        const nx = 340 + n * 135;
        const isCurrent = n === showcaseIdx;
        if (isCurrent) {
          sCtx.fillStyle = "rgba(0, 240, 255, 0.18)";
          sCtx.fillRect(nx - 12, 60, 118, 28);
          sCtx.fillStyle = item.accent;
        } else {
          sCtx.fillStyle = "rgba(255,255,255,0.68)";
        }
        sCtx.fillText(navLabels[n], nx, 79);
      }

      // Header CTA Button
      sCtx.fillStyle = "#00F59B";
      sCtx.fillRect(1070, 58, 182, 32);
      sCtx.fillStyle = "#040810";
      sCtx.font = '700 14px "Inter", sans-serif';
      sCtx.textAlign = "center";
      sCtx.fillText("WHATSAPP DIRETO ↗", 1161, 79);

      // 3. Main Framed Content Viewport inside the 3D Screen (y: 118 -> 748)
      const vx = 24;
      const vy = 116;
      const vw = w - 48;
      const vh = h - 156;

      // Capture live or static First Scene Canvas if available
      const snapCanvas = document.getElementById("notebook-static-screen");
      const glCanvas = document.querySelector("canvas.gl");
      const sourceCanvas = snapCanvas && snapCanvas.width > 0 ? snapCanvas : glCanvas;

      if (sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
        sCtx.save();
        sCtx.beginPath();
        sCtx.rect(vx, vy, vw, vh);
        sCtx.clip();

        // Draw first scene with cover fit inside the browser viewport
        const srcAspect = sourceCanvas.width / sourceCanvas.height;
        const dstAspect = vw / vh;
        let drawW = vw;
        let drawH = vh;
        let drawX = vx;
        let drawY = vy;
        if (srcAspect > dstAspect) {
          drawW = vh * srcAspect;
          drawX = vx - (drawW - vw) * 0.5;
        } else {
          drawH = vw / srcAspect;
          drawY = vy - (drawH - vh) * 0.46;
        }
        sCtx.globalAlpha = showcaseIdx === 0 ? 1.0 : 0.34;
        sCtx.drawImage(sourceCanvas, drawX, drawY, drawW, drawH);
        sCtx.restore();
      }

      // If in Showcase 1..4, render the interactive MS_OS Application Overlay inside the 3D Display
      if (showcaseIdx > 0) {
        sCtx.fillStyle = "rgba(6, 8, 20, 0.76)";
        sCtx.fillRect(vx + 40, vy + 36, vw - 80, vh - 72);
        sCtx.strokeStyle = item.accent;
        sCtx.lineWidth = 2.5;
        sCtx.strokeRect(vx + 40, vy + 36, vw - 80, vh - 72);

        // App Window Header
        sCtx.fillStyle = "rgba(255,255,255,0.06)";
        sCtx.fillRect(vx + 40, vy + 36, vw - 80, 44);
        sCtx.fillStyle = item.accent;
        sCtx.font = '700 18px "Consolas", monospace';
        sCtx.textAlign = "left";
        sCtx.fillText(item.code + " — MS_OS WORKSTATION", vx + 68, vy + 64);

        // Showcase Title & Description inside the 3D Screen
        sCtx.fillStyle = "#FFFFFF";
        sCtx.font = '700 44px "Bebas Neue", sans-serif';
        sCtx.fillText(item.title, vx + 72, vy + 148);

        sCtx.fillStyle = "#CBD5E1";
        sCtx.font = '500 22px "Inter", sans-serif';
        sCtx.fillText(item.desc.slice(0, 68), vx + 72, vy + 195);
        if (item.desc.length > 68) {
          sCtx.fillText(item.desc.slice(68), vx + 72, vy + 226);
        }

        // Live Telemetry Box
        sCtx.fillStyle = "rgba(0, 255, 102, 0.1)";
        sCtx.fillRect(vx + 72, vy + 265, vw - 220, 74);
        sCtx.strokeStyle = "rgba(0, 255, 102, 0.45)";
        sCtx.lineWidth = 1.5;
        sCtx.strokeRect(vx + 72, vy + 265, vw - 220, 74);

        sCtx.fillStyle = "#94A3B8";
        sCtx.font = '600 18px "Consolas", monospace';
        sCtx.fillText(item.metricLabel, vx + 98, vy + 308);

        sCtx.fillStyle = "#00FF66";
        sCtx.font = '700 24px "Consolas", monospace';
        sCtx.textAlign = "right";
        sCtx.fillText(item.metricVal, vx + vw - 175, vy + 310);

        // Animated Progress / Telemetry Wave Bars
        for (let b = 0; b < 16; b++) {
          const bx = vx + 72 + b * 62;
          const bh = 28 + Math.sin(timeSec * 3.2 + b * 0.6 + showcaseIdx) * 18;
          sCtx.fillStyle = b % 2 === 0 ? item.accent : "#00FF66";
          sCtx.fillRect(bx, vy + 425 - bh, 44, bh);
        }
      }

      // Inner Cyan Frame Border around the Website Viewport
      sCtx.strokeStyle = item.accent;
      sCtx.lineWidth = 2.5;
      sCtx.strokeRect(vx, vy, vw, vh);

      // 4. Bottom Website Footer Bar inside the 3D Screen
      sCtx.fillStyle = "#080714";
      sCtx.fillRect(0, h - 34, w, 34);
      sCtx.fillStyle = "rgba(255,255,255,0.65)";
      sCtx.font = '600 12px "Consolas", monospace';
      sCtx.textAlign = "left";
      sCtx.fillText("© MARCOS SIQUEIRA — ENGENHARIA DE SOFTWARE & PROSPECÇÃO B2B", 24, h - 13);
      sCtx.fillStyle = "#00FF66";
      sCtx.textAlign = "right";
      sCtx.fillText("● MS_OS 3D PROCEDURAL ENGINE ONLINE", w - 24, h - 13);

      screenTexture.needsUpdate = true;
    }

    // 7. Mouse Parallax & Responsive Camera Framing (Desktop, Tablet, Mobile <768px)
    let pointerX = 0;
    let pointerY = 0;
    let smoothPointerX = 0;
    let smoothPointerY = 0;

    window.addEventListener(
      "pointermove",
      (e) => {
        pointerX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
        pointerY = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      },
      { passive: true }
    );

    function syncResponsiveCamera(pReel) {
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 800;
      const aspect = vw / Math.max(1, vh);
      camera.aspect = aspect;

      // Zoom-in phase at the end of the reel (p: 0.32 -> 0.37)
      const pZoomIn = easeInOutCubic(rangeProgress(pReel, 0.78, 1.0));

      if (vw < 768) {
        // Mobile (<768px): Close-up vertical framing focused directly on the 3D laptop display for crystal-clear reading
        camera.fov = 38;
        const baseZ = Math.max(4.1, 3.05 / Math.max(0.42, aspect));
        camera.position.z = baseZ - pZoomIn * 1.15;
        camera.position.y = 1.05 + pZoomIn * 0.08;
        camera.lookAt(0, 0.88 + pZoomIn * 0.14, 0);
      } else if (vw <= 1080) {
        // Tablet: Dynamic FOV / distance so the 3D notebook occupies ~85% of width without clipping on rotations
        camera.fov = 38;
        camera.position.z = 5.4 - pZoomIn * 1.35;
        camera.position.y = 1.15;
        camera.lookAt(0, 0.76, 0);
      } else {
        // Desktop Widescreen
        camera.fov = 34;
        camera.position.z = 4.85 - pZoomIn * 1.45;
        camera.position.y = 1.12 - pZoomIn * 0.08;
        camera.lookAt(0, 0.78 + pZoomIn * 0.15, 0);
      }
      camera.updateProjectionMatrix();
    }

    window.addEventListener(
      "resize",
      () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
      },
      { passive: true }
    );

    // 8. Scroll-Driven Animation Loop (Synchronized with Cena 1 -> CRT TV-Off -> Cena 2)
    let lastDrawTime = 0;

    function tickProceduralReel(now) {
      requestAnimationFrame(tickProceduralReel);
      if (document.hidden) return;

      const vh = window.innerHeight || 800;
      const trackHeight = scrollyTrack ? scrollyTrack.offsetHeight : vh * 5;
      const maxScroll = Math.max(1, trackHeight - vh);
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const p = clamp01(scrollY / maxScroll);

      const heroRig = document.getElementById("notebook-rig");
      if (heroRig) {
        heroRig.classList.toggle("is-scrolled-3d", p > 0.014);
      }

      // The 3D Laptop Reel is visible during Cena 1 (p: 0.012 -> 0.45, including the CRT TV-Off collapse at 0.36 -> 0.45)
      const isVisible = p > 0.012 && p < 0.455;
      if (!isVisible) {
        stageEl.style.opacity = "0";
        stageEl.style.visibility = "hidden";
        stageEl.classList.remove("is-active");
        return;
      }

      // Reset manual override if user scrolls back to top
      if (p < 0.03) manualShowcaseOverride = null;

      const pAppear = easeOutCubic(rangeProgress(p, 0.012, 0.04));
      const pReel = clamp01(rangeProgress(p, 0.015, 0.36));
      const pTvOff = rangeProgress(p, 0.36, 0.45);

      // CRT TV Power-Off Collapse (Synchronized with the Matrix Background!)
      let tvScaleX = 1;
      let tvScaleY = 1;
      let tvOp = 1;
      let brightness = 1;
      if (pTvOff > 0) {
        const pVert = easeInOutCubic(rangeProgress(pTvOff, 0.0, 0.44));
        const pHoriz = easeInOutCubic(rangeProgress(pTvOff, 0.4, 0.78));
        tvScaleY = Math.max(0.003, 1 - pVert * 0.997);
        tvScaleX = (1 + pVert * 0.06 * (1 - pHoriz)) * Math.max(0.004, 1 - pHoriz * 0.996);
        tvOp = 1 - easeOutCubic(rangeProgress(pTvOff, 0.68, 0.82));
        brightness = 1 + pVert * 2.6;
      }

      const finalOp = pAppear * tvOp;
      stageEl.style.opacity = finalOp.toFixed(3);
      stageEl.style.visibility = finalOp <= 0.005 ? "hidden" : "visible";
      stageEl.classList.toggle("is-active", finalOp > 0.2 && pTvOff < 0.05);
      stageEl.style.transform =
        pTvOff > 0.001 ? `scaleX(${tvScaleX.toFixed(4)}) scaleY(${tvScaleY.toFixed(4)})` : "none";
      stageEl.style.filter =
        pTvOff > 0.005
          ? `brightness(${brightness.toFixed(2)}) contrast(${(1 + pTvOff * 0.6).toFixed(2)})`
          : "none";

      // 1) Lid Opening Animation (hingeGroup.rotation.x from closed +82° to open -15° = 105° opening angle!)
      const pLidOpen = easeOutCubic(rangeProgress(p, 0.014, 0.11));
      const closedAngle = Math.PI * 0.46; // folded down over keyboard
      const openAngle = -0.24; // 105 deg ergonomic open angle
      hingeGroup.rotation.x = closedAngle + (openAngle - closedAngle) * pLidOpen;

      // 2) Camera & Laptop 3D Rotation Choreography (Starts in 3/4 lateral close-up, rotates to frontal center)
      smoothPointerX += (pointerX - smoothPointerX) * 0.08;
      smoothPointerY += (pointerY - smoothPointerY) * 0.08;

      const lateralIntro = 1 - easeInOutCubic(rangeProgress(p, 0.015, 0.13));
      const showcaseWaveY = Math.sin(pReel * Math.PI * 2.2) * 0.16 * (1 - rangeProgress(pReel, 0.8, 1.0));
      laptopRoot.rotation.y = -0.68 * lateralIntro + showcaseWaveY + smoothPointerX * 0.14;
      laptopRoot.rotation.x = 0.22 * lateralIntro + 0.08 - smoothPointerY * 0.08;
      laptopRoot.position.y = -0.18 + Math.sin(now * 0.0018) * 0.025;

      // 3) Orbiting Point Lights for Real-Time Specular Chassis Reflections
      const orbitAngle = pReel * Math.PI * 3 + now * 0.0012;
      rimLightCyan.position.x = Math.cos(orbitAngle) * 4.2;
      rimLightCyan.position.z = Math.sin(orbitAngle) * 3.5;
      rimLightGreen.position.x = Math.cos(orbitAngle + Math.PI) * 4.2;
      rimLightGreen.position.z = Math.sin(orbitAngle + Math.PI) * 3.5;

      // 4) Determine Active Showcase Stage from Scroll (or manual click override)
      let autoIdx = 0;
      if (p >= 0.30) autoIdx = 4;
      else if (p >= 0.24) autoIdx = 3;
      else if (p >= 0.18) autoIdx = 2;
      else if (p >= 0.12) autoIdx = 1;
      else autoIdx = 0;

      const displayIdx = manualShowcaseOverride !== null ? manualShowcaseOverride : autoIdx;
      setActiveShowcaseUI(displayIdx);

      // Redraw 16:10 Screen Texture at ~30fps for animated telemetry bars + first scene projection
      if (now - lastDrawTime > 33) {
        drawScreenCanvasTexture(displayIdx, now * 0.001);
        lastDrawTime = now;
      }

      syncResponsiveCamera(pReel);
      renderer.render(scene, camera);
    }

    drawScreenCanvasTexture(0, 0);
    requestAnimationFrame(tickProceduralReel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProceduralLaptopReel);
  } else {
    initProceduralLaptopReel();
  }
})();
