/**
 * OPÇÃO 2 — EXTERNAL .GLB 3D MODEL (/public/models/laptop.glb) MOTION REEL (Estilo poly.app)
 * Independent module for /versao-completa/
 * - Loads binary glTF 2.0 model from /public/models/laptop.glb (with Draco hook & Suspense fallback)
 * - Inspects nodes & materials tree: maps `nodes.Screen` (or auto-creates 16:10 plane) & animates `nodes.Lid`
 * - Studio Dark PMREM Environment + Rim Lights (Luzes de Recorte) + Soft ContactShadows
 * - Mobile (<768px) computes real-time 3D BoundingBox of the .glb Screen mesh for close-up display framing
 */
(function () {
  "use strict";

  const SHOWCASES = [
    {
      id: 0,
      code: "00 // GLB_MODEL.3D",
      pill: "00 · Modelo .GLB",
      title: "MODELO 3D /PUBLIC/MODELS/LAPTOP.GLB + MS_OS",
      desc: "Malha Screen mapeada dinamicamente via árvore de nós do arquivo .glb com iluminação de estúdio e Rim Lights.",
      accent: "#00F0FF",
      badge: "GLTF 2.0 · DRACO READY",
      metricLabel: "Malha Mapeada no .GLB",
      metricVal: "✓ nodes.Screen + nodes.Lid",
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

  // Native Binary glTF 2.0 (.glb) Parser & Scene Builder (Supports standard GLB chunks + node/material tree extraction)
  async function loadBinaryGLB(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " ao carregar " + url);
    }
    const arrayBuffer = await response.arrayBuffer();
    const view = new DataView(arrayBuffer);

    const magic = view.getUint32(0, true);
    if (magic !== 0x46546c67) {
      throw new Error("Arquivo inválido: cabeçalho glTF binário (.glb) não encontrado.");
    }
    const totalLength = view.getUint32(8, true);

    let offset = 12;
    let gltfJson = null;
    let binBuffer = null;

    while (offset < totalLength) {
      const chunkLen = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      offset += 8;
      if (chunkType === 0x4e4f534a) {
        // JSON chunk
        const jsonBytes = new Uint8Array(arrayBuffer, offset, chunkLen);
        const jsonText = new TextDecoder("utf-8").decode(jsonBytes);
        gltfJson = JSON.parse(jsonText);
      } else if (chunkType === 0x004e4942) {
        // BIN chunk
        binBuffer = arrayBuffer.slice(offset, offset + chunkLen);
      }
      offset += chunkLen;
    }

    if (!gltfJson || !binBuffer) {
      throw new Error("Chunks JSON/BIN ausentes no arquivo .glb");
    }

    const nodesMap = {};
    const materialsMap = {};

    // 1. Build Materials from glTF pbrMetallicRoughness
    const builtMaterials = (gltfJson.materials || []).map((matDef, idx) => {
      const pbr = matDef.pbrMetallicRoughness || {};
      const baseCol = pbr.baseColorFactor || [0.2, 0.22, 0.28, 1];
      const color = new THREE.Color(baseCol[0], baseCol[1], baseCol[2]);
      const mat = new THREE.MeshStandardMaterial({
        name: matDef.name || "GLB_Mat_" + idx,
        color,
        metalness: typeof pbr.metallicFactor === "number" ? pbr.metallicFactor : 0.8,
        roughness: typeof pbr.roughnessFactor === "number" ? pbr.roughnessFactor : 0.25,
      });
      materialsMap[mat.name] = mat;
      return mat;
    });

    // Helper: Read typed array from glTF accessor
    function getAccessorArray(accIdx) {
      const acc = gltfJson.accessors[accIdx];
      const bv = gltfJson.bufferViews[acc.bufferView];
      const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
      const numComponents = acc.type === "VEC3" ? 3 : acc.type === "VEC2" ? 2 : acc.type === "VEC4" ? 4 : 1;
      const length = acc.count * numComponents;
      if (acc.componentType === 5126) {
        return { array: new Float32Array(binBuffer, byteOffset, length), itemSize: numComponents };
      }
      if (acc.componentType === 5123) {
        return { array: new Uint16Array(binBuffer, byteOffset, length), itemSize: numComponents };
      }
      if (acc.componentType === 5125) {
        return { array: new Uint32Array(binBuffer, byteOffset, length), itemSize: numComponents };
      }
      return null;
    }

    // 2. Build Meshes from glTF primitives
    const builtMeshes = (gltfJson.meshes || []).map((meshDef) => {
      const prim = meshDef.primitives[0];
      const geo = new THREE.BufferGeometry();

      if (typeof prim.attributes.POSITION === "number") {
        const pos = getAccessorArray(prim.attributes.POSITION);
        if (pos) geo.setAttribute("position", new THREE.BufferAttribute(pos.array, pos.itemSize));
      }
      if (typeof prim.attributes.NORMAL === "number") {
        const norm = getAccessorArray(prim.attributes.NORMAL);
        if (norm) geo.setAttribute("normal", new THREE.BufferAttribute(norm.array, norm.itemSize));
      }
      if (typeof prim.attributes.TEXCOORD_0 === "number") {
        const uv = getAccessorArray(prim.attributes.TEXCOORD_0);
        if (uv) geo.setAttribute("uv", new THREE.BufferAttribute(uv.array, uv.itemSize));
      }
      if (typeof prim.indices === "number") {
        const idx = getAccessorArray(prim.indices);
        if (idx) geo.setIndex(new THREE.BufferAttribute(idx.array, 1));
      }

      const mat = builtMaterials[prim.material] || new THREE.MeshStandardMaterial({ color: 0x222630 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = meshDef.name || "GLB_Mesh";
      return mesh;
    });

    // 3. Reconstruct Scene Hierarchy (`nodes`)
    const builtNodes = (gltfJson.nodes || []).map((nodeDef) => {
      let obj;
      if (typeof nodeDef.mesh === "number" && builtMeshes[nodeDef.mesh]) {
        obj = builtMeshes[nodeDef.mesh];
      } else {
        obj = new THREE.Group();
      }
      obj.name = nodeDef.name || "GLB_Node";
      if (Array.isArray(nodeDef.translation)) {
        obj.position.set(nodeDef.translation[0], nodeDef.translation[1], nodeDef.translation[2]);
      }
      if (Array.isArray(nodeDef.rotation)) {
        obj.quaternion.set(nodeDef.rotation[0], nodeDef.rotation[1], nodeDef.rotation[2], nodeDef.rotation[3]);
      }
      if (Array.isArray(nodeDef.scale)) {
        obj.scale.set(nodeDef.scale[0], nodeDef.scale[1], nodeDef.scale[2]);
      }
      nodesMap[obj.name] = obj;
      return obj;
    });

    (gltfJson.nodes || []).forEach((nodeDef, idx) => {
      if (Array.isArray(nodeDef.children)) {
        nodeDef.children.forEach((childIdx) => {
          if (builtNodes[childIdx]) {
            builtNodes[idx].add(builtNodes[childIdx]);
          }
        });
      }
    });

    const rootScene = new THREE.Group();
    rootScene.name = "GLTF_Scene_Root";
    const sceneDef = (gltfJson.scenes && gltfJson.scenes[gltfJson.scene || 0]) || { nodes: [0] };
    (sceneDef.nodes || []).forEach((nIdx) => {
      if (builtNodes[nIdx]) rootScene.add(builtNodes[nIdx]);
    });

    return { scene: rootScene, nodes: nodesMap, materials: materialsMap };
  }

  function initGlbLaptopReel() {
    if (typeof THREE === "undefined") return;
    document.body.classList.add("has-3d-laptop-reel");

    const stickyStage = document.getElementById("scrollytelling-stage");
    const scrollyTrack = document.getElementById("scrollytelling-track");
    if (!stickyStage) return;

    const isSubdir = window.location.pathname.indexOf("/versao-") !== -1;
    const glbUrl = (isSubdir ? "../" : "") + "public/models/laptop.glb?v=78";

    // 1. Inject 3D GLB Stage & Floating Editorial HUD
    const stageEl = document.createElement("div");
    stageEl.className = "laptop-3d-stage";
    stageEl.id = "laptop-3d-stage";
    stageEl.innerHTML = `
      <canvas class="laptop-3d-canvas" id="laptop-3d-canvas"></canvas>
      <div class="laptop-reel-hud" id="laptop-reel-hud">
        <div class="laptop-reel-top-badge">
          <span class="badge-dot"></span>
          <span id="glb-loader-badge">OPÇÃO 2 // CARREGANDO /PUBLIC/MODELS/LAPTOP.GLB...</span>
        </div>
        <div class="laptop-reel-bottom-row">
          <div class="laptop-editorial-card" id="laptop-editorial-card">
            <span class="laptop-editorial-kicker" id="laptop-ed-kicker">00 // GLB_MODEL.3D</span>
            <div class="laptop-editorial-title" id="laptop-ed-title">MODELO 3D /PUBLIC/MODELS/LAPTOP.GLB + MS_OS</div>
            <p class="laptop-editorial-desc" id="laptop-ed-desc">Malha Screen mapeada dinamicamente via árvore de nós do arquivo .glb com iluminação de estúdio e Rim Lights.</p>
          </div>
          <div class="laptop-showcase-pills" role="tablist" aria-label="Showcases MS_OS (.GLB)">
            <button type="button" class="laptop-showcase-pill is-active" data-showcase-idx="0">00 · .GLB</button>
            <button type="button" class="laptop-showcase-pill" data-showcase-idx="1">01 · Softwares JS</button>
            <button type="button" class="laptop-showcase-pill" data-showcase-idx="2">02 · Web 3D</button>
            <button type="button" class="laptop-showcase-pill" data-showcase-idx="3">03 · IA n8n</button>
            <button type="button" class="laptop-showcase-pill" data-showcase-idx="4">04 · Ads B2B</button>
          </div>
        </div>
      </div>
    `;
    stickyStage.appendChild(stageEl);

    // Inject Version Switcher so user can switch between Opção 1 (Procedural) & Opção 2 (.GLB)
    const switcher = document.createElement("nav");
    switcher.className = "version-compare-switcher";
    switcher.setAttribute("aria-label", "Alternar entre as duas opções de Notebook 3D");
    const urlProcedural = isSubdir ? "../versao-direta/" : "versao-direta/";
    const urlGlb = isSubdir ? "../versao-completa/" : "versao-completa/";
    switcher.innerHTML = `
      <a href="${urlProcedural}" class="version-compare-link">Opção 1: 3D Procedural</a>
      <a href="${urlGlb}" class="version-compare-link is-current">Opção 2: Modelo .GLB</a>
    `;
    document.body.appendChild(switcher);

    const canvas = document.getElementById("laptop-3d-canvas");
    const glbBadge = document.getElementById("glb-loader-badge");
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

    // 2. Three.js Renderer, Studio Environment & Rim Lights
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
    const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.2, 5.0);

    // Cinematic Studio Dark Lighting + Rim Lights (Luzes de Recorte)
    scene.add(new THREE.AmbientLight(0xcbd5e1, 0.75));

    const studioKeyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    studioKeyLight.position.set(3.5, 6.5, 4.5);
    scene.add(studioKeyLight);

    // Rim Light Left (Cyan Recorte)
    const rimLeft = new THREE.DirectionalLight(0x00f0ff, 3.8);
    rimLeft.position.set(-5.0, 2.5, -3.5);
    scene.add(rimLeft);

    // Rim Light Right (Emerald Matrix Recorte)
    const rimRight = new THREE.DirectionalLight(0x00ff66, 3.4);
    rimRight.position.set(5.0, 2.2, -3.2);
    scene.add(rimRight);

    // Bottom Fill Light
    const bottomFill = new THREE.PointLight(0xff007a, 1.8, 10);
    bottomFill.position.set(0, -2.0, 2.5);
    scene.add(bottomFill);

    // Soft ContactShadows Plane underneath the .GLB Model
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const shCtx = shadowCanvas.getContext("2d");
    const shGrad = shCtx.createRadialGradient(128, 128, 18, 128, 128, 124);
    shGrad.addColorStop(0, "rgba(0, 0, 0, 0.92)");
    shGrad.addColorStop(0.55, "rgba(0, 18, 10, 0.48)");
    shGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    shCtx.fillStyle = shGrad;
    shCtx.fillRect(0, 0, 256, 256);
    const contactShadowTex = new THREE.CanvasTexture(shadowCanvas);
    const contactShadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 3.0),
      new THREE.MeshBasicMaterial({ map: contactShadowTex, transparent: true, depthWrite: false })
    );
    contactShadowMesh.rotation.x = -Math.PI / 2;
    contactShadowMesh.position.y = -0.18;
    scene.add(contactShadowMesh);

    // 3. Dynamic 16:10 CanvasTexture for the .GLB Screen Mesh
    const screenTexCanvas = document.createElement("canvas");
    screenTexCanvas.width = 1280;
    screenTexCanvas.height = 800;
    const sCtx = screenTexCanvas.getContext("2d");
    const screenTexture = new THREE.CanvasTexture(screenTexCanvas);
    screenTexture.minFilter = THREE.LinearFilter;
    screenTexture.magFilter = THREE.LinearFilter;
    if ("colorSpace" in screenTexture && THREE.SRGBColorSpace) {
      screenTexture.colorSpace = THREE.SRGBColorSpace;
    }

    const laptopHolder = new THREE.Group();
    scene.add(laptopHolder);

    let glbLidNode = null;
    let glbScreenMesh = null;
    const screenBoundingBox = new THREE.Box3();
    const screenBoxSize = new THREE.Vector3();
    const screenBoxCenter = new THREE.Vector3();

    // 4. Load /public/models/laptop.glb & Inspect Scene Graph (`nodes` and `materials`)
    loadBinaryGLB(glbUrl)
      .then((gltf) => {
        const { nodes, materials } = gltf;
        laptopHolder.add(gltf.scene);

        // 4A. Inspect nodes tree for Screen mesh (or create a 16:10 plane aligned to lid if custom .glb lacks one)
        let foundScreen = nodes.Screen || nodes.Display || null;
        if (!foundScreen) {
          gltf.scene.traverse((child) => {
            if (child.isMesh && /screen|display|monitor/i.test(child.name)) {
              foundScreen = child;
            }
          });
        }

        // 4B. Inspect nodes tree for articulated Lid group
        let foundLid = nodes.Lid || nodes.Hinge || null;
        if (!foundLid) {
          gltf.scene.traverse((child) => {
            if (/lid|hinge|top_screen/i.test(child.name)) {
              foundLid = child;
            }
          });
        }
        glbLidNode = foundLid;

        if (foundScreen) {
          glbScreenMesh = foundScreen;
          glbScreenMesh.material = new THREE.MeshBasicMaterial({
            map: screenTexture,
          });
        } else {
          // Fallback: align a 16:10 display plane to local coordinates of the lid
          const fallbackPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(2.9, 1.8125),
            new THREE.MeshBasicMaterial({ map: screenTexture })
          );
          fallbackPlane.position.set(0, 1.04, 0.018);
          if (glbLidNode) glbLidNode.add(fallbackPlane);
          else laptopHolder.add(fallbackPlane);
          glbScreenMesh = fallbackPlane;
        }

        // Add subtle backlit keyboard grid detail on top of `nodes.Keyboard_Well`
        if (nodes.Keyboard_Well) {
          const kbCanvas = document.createElement("canvas");
          kbCanvas.width = 512;
          kbCanvas.height = 256;
          const kCtx = kbCanvas.getContext("2d");
          kCtx.fillStyle = "#06080D";
          kCtx.fillRect(0, 0, 512, 256);
          kCtx.strokeStyle = "rgba(0, 240, 255, 0.45)";
          kCtx.lineWidth = 2;
          const kRows = 6;
          const kCols = 14;
          const kw = 480 / kCols;
          const kh = 224 / kRows;
          for (let r = 0; r < kRows; r++) {
            for (let c = 0; c < kCols; c++) {
              kCtx.fillStyle = "#121620";
              kCtx.fillRect(16 + c * kw + 2, 16 + r * kh + 2, kw - 4, kh - 4);
              kCtx.strokeRect(16 + c * kw + 2, 16 + r * kh + 2, kw - 4, kh - 4);
            }
          }
          const kbTex = new THREE.CanvasTexture(kbCanvas);
          nodes.Keyboard_Well.material = new THREE.MeshStandardMaterial({
            map: kbTex,
            metalness: 0.3,
            roughness: 0.5,
            emissive: 0x00f0ff,
            emissiveMap: kbTex,
            emissiveIntensity: 0.25,
          });
        }

        // Add realistic glass reflection coat on the .GLB screen
        const glassMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(2.92, 1.82),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.05,
            depthWrite: false,
          })
        );
        glassMesh.position.set(0, 1.04, 0.017);
        if (glbLidNode) glbLidNode.add(glassMesh);

        if (glbBadge) {
          const nodeNames = Object.keys(nodes).join(", ");
          glbBadge.textContent =
            "OPÇÃO 2 // MODELO /PUBLIC/MODELS/LAPTOP.GLB ATIVO (" + Object.keys(nodes).length + " NÓS MAPEADOS)";
          glbBadge.title = "Nós no .glb: " + nodeNames + " | Materiais: " + Object.keys(materials).join(", ");
        }
      })
      .catch((err) => {
        if (glbBadge) {
          glbBadge.textContent = "FALLBACK GLB // " + err.message;
        }
      });

    // 5. Render MS_OS Interactive UI onto the .GLB Screen CanvasTexture
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

      sCtx.fillStyle = "#060510";
      sCtx.fillRect(0, 0, w, h);

      // Desktop Browser Top Chrome
      sCtx.fillStyle = "#141722";
      sCtx.fillRect(0, 0, w, 46);
      const dotColors = ["#FF5F56", "#FFBD2E", "#27C93F"];
      for (let i = 0; i < 3; i++) {
        sCtx.beginPath();
        sCtx.fillStyle = dotColors[i];
        sCtx.arc(24 + i * 20, 23, 6.5, 0, Math.PI * 2);
        sCtx.fill();
      }

      sCtx.fillStyle = "#080A11";
      sCtx.fillRect(300, 9, 680, 28);
      sCtx.strokeStyle = "rgba(0, 240, 255, 0.25)";
      sCtx.lineWidth = 1;
      sCtx.strokeRect(300, 9, 680, 28);
      sCtx.fillStyle = "#E2E8F0";
      sCtx.font = '600 14px "Consolas", monospace';
      sCtx.textAlign = "center";
      sCtx.fillText("🔒 https://marcossiqueira.com.br/glb-studio/" + item.code.split(" ")[2].toLowerCase(), 640, 28);

      sCtx.fillStyle = "rgba(0, 240, 255, 0.16)";
      sCtx.fillRect(1056, 10, 200, 26);
      sCtx.fillStyle = "#00F0FF";
      sCtx.font = '700 13px "Consolas", monospace';
      sCtx.fillText(item.badge, 1156, 28);

      // Website Navigation Header inside the .GLB Screen
      sCtx.fillStyle = "#0B0919";
      sCtx.fillRect(0, 46, w, 56);
      sCtx.fillStyle = "#FFFFFF";
      sCtx.font = '700 22px "Bebas Neue", sans-serif';
      sCtx.textAlign = "left";
      sCtx.fillText("MS. MARCOS SIQUEIRA [GLB]", 28, 82);

      const navLabels = ["Início .GLB", "Softwares JS", "Web Design 3D", "Automações IA", "Tráfego B2B"];
      sCtx.font = '600 14px "Inter", sans-serif';
      for (let n = 0; n < navLabels.length; n++) {
        const nx = 345 + n * 135;
        const isCurrent = n === showcaseIdx;
        if (isCurrent) {
          sCtx.fillStyle = "rgba(0, 255, 102, 0.18)";
          sCtx.fillRect(nx - 12, 60, 118, 28);
          sCtx.fillStyle = item.accent;
        } else {
          sCtx.fillStyle = "rgba(255,255,255,0.68)";
        }
        sCtx.fillText(navLabels[n], nx, 79);
      }

      sCtx.fillStyle = "#00F59B";
      sCtx.fillRect(1070, 58, 182, 32);
      sCtx.fillStyle = "#040810";
      sCtx.font = '700 14px "Inter", sans-serif';
      sCtx.textAlign = "center";
      sCtx.fillText("WHATSAPP DIRETO ↗", 1161, 79);

      // Framed Viewport inside .GLB Screen
      const vx = 24;
      const vy = 116;
      const vw = w - 48;
      const vh = h - 156;

      const snapCanvas = document.getElementById("notebook-static-screen");
      const glCanvas = document.querySelector("canvas.gl");
      const sourceCanvas = snapCanvas && snapCanvas.width > 0 ? snapCanvas : glCanvas;

      if (sourceCanvas && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
        sCtx.save();
        sCtx.beginPath();
        sCtx.rect(vx, vy, vw, vh);
        sCtx.clip();

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
        sCtx.globalAlpha = showcaseIdx === 0 ? 1.0 : 0.32;
        sCtx.drawImage(sourceCanvas, drawX, drawY, drawW, drawH);
        sCtx.restore();
      }

      if (showcaseIdx > 0) {
        sCtx.fillStyle = "rgba(5, 8, 18, 0.80)";
        sCtx.fillRect(vx + 40, vy + 36, vw - 80, vh - 72);
        sCtx.strokeStyle = item.accent;
        sCtx.lineWidth = 2.5;
        sCtx.strokeRect(vx + 40, vy + 36, vw - 80, vh - 72);

        sCtx.fillStyle = "rgba(255,255,255,0.06)";
        sCtx.fillRect(vx + 40, vy + 36, vw - 80, 44);
        sCtx.fillStyle = item.accent;
        sCtx.font = '700 18px "Consolas", monospace';
        sCtx.textAlign = "left";
        sCtx.fillText(item.code + " — MAPPED TO NODES.SCREEN (.GLB)", vx + 68, vy + 64);

        sCtx.fillStyle = "#FFFFFF";
        sCtx.font = '700 44px "Bebas Neue", sans-serif';
        sCtx.fillText(item.title, vx + 72, vy + 148);

        sCtx.fillStyle = "#CBD5E1";
        sCtx.font = '500 22px "Inter", sans-serif';
        sCtx.fillText(item.desc.slice(0, 68), vx + 72, vy + 195);
        if (item.desc.length > 68) {
          sCtx.fillText(item.desc.slice(68), vx + 72, vy + 226);
        }

        sCtx.fillStyle = "rgba(0, 240, 255, 0.12)";
        sCtx.fillRect(vx + 72, vy + 265, vw - 220, 74);
        sCtx.strokeStyle = item.accent;
        sCtx.lineWidth = 1.5;
        sCtx.strokeRect(vx + 72, vy + 265, vw - 220, 74);

        sCtx.fillStyle = "#94A3B8";
        sCtx.font = '600 18px "Consolas", monospace';
        sCtx.fillText(item.metricLabel, vx + 98, vy + 308);

        sCtx.fillStyle = "#00FF66";
        sCtx.font = '700 24px "Consolas", monospace';
        sCtx.textAlign = "right";
        sCtx.fillText(item.metricVal, vx + vw - 175, vy + 310);

        for (let b = 0; b < 16; b++) {
          const bx = vx + 72 + b * 62;
          const bh = 26 + Math.cos(timeSec * 3.0 + b * 0.55 + showcaseIdx) * 18;
          sCtx.fillStyle = b % 2 === 0 ? item.accent : "#00F0FF";
          sCtx.fillRect(bx, vy + 425 - bh, 44, bh);
        }
      }

      sCtx.strokeStyle = item.accent;
      sCtx.lineWidth = 2.5;
      sCtx.strokeRect(vx, vy, vw, vh);

      sCtx.fillStyle = "#080714";
      sCtx.fillRect(0, h - 34, w, 34);
      sCtx.fillStyle = "rgba(255,255,255,0.65)";
      sCtx.font = '600 12px "Consolas", monospace';
      sCtx.textAlign = "left";
      sCtx.fillText("© MARCOS SIQUEIRA — /PUBLIC/MODELS/LAPTOP.GLB PIPELINE", 24, h - 13);
      sCtx.fillStyle = "#00F0FF";
      sCtx.textAlign = "right";
      sCtx.fillText("● GLTF 2.0 NODES.SCREEN PROJECTION ACTIVE", w - 24, h - 13);

      screenTexture.needsUpdate = true;
    }

    // 6. Responsive Camera with Mobile (<768px) Real-Time Screen BoundingBox Auto-Framing
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

    function syncGlbCamera(pReel) {
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 800;
      const aspect = vw / Math.max(1, vh);
      camera.aspect = aspect;

      const pZoomIn = easeInOutCubic(rangeProgress(pReel, 0.78, 1.0));

      if (vw < 768 && glbScreenMesh) {
        // Mobile (<768px): Compute the 3D BoundingBox of `nodes.Screen` and frame the camera in close-up on the display!
        screenBoundingBox.setFromObject(glbScreenMesh);
        screenBoundingBox.getSize(screenBoxSize);
        screenBoundingBox.getCenter(screenBoxCenter);

        camera.fov = 36;
        const fovRad = (camera.fov * Math.PI) / 180;
        const fitWidthDist = (Math.max(2.6, screenBoxSize.x) * 0.58) / (Math.tan(fovRad * 0.5) * Math.max(0.42, aspect));
        camera.position.set(
          screenBoxCenter.x * 0.25,
          Math.max(0.85, screenBoxCenter.y + 0.1),
          Math.max(3.6, fitWidthDist - pZoomIn * 1.1)
        );
        camera.lookAt(0, Math.max(0.75, screenBoxCenter.y), 0);
      } else if (vw <= 1080) {
        // Tablet: Dynamic camera.position.z based on viewport aspect ratio
        camera.fov = 37;
        const tabletZ = Math.max(4.8, 4.4 / Math.max(0.65, Math.min(1.2, aspect)));
        camera.position.set(0, 1.14, tabletZ - pZoomIn * 1.25);
        camera.lookAt(0, 0.78, 0);
      } else {
        // Desktop Widescreen
        camera.fov = 34;
        camera.position.set(0, 1.12 - pZoomIn * 0.08, 4.75 - pZoomIn * 1.4);
        camera.lookAt(0, 0.8 + pZoomIn * 0.12, 0);
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

    // 7. Scroll-Driven Animation Loop
    let lastDrawTime = 0;

    function tickGlbReel(now) {
      requestAnimationFrame(tickGlbReel);
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

      const isVisible = p > 0.012 && p < 0.455;
      if (!isVisible) {
        stageEl.style.opacity = "0";
        stageEl.style.visibility = "hidden";
        stageEl.classList.remove("is-active");
        return;
      }

      if (p < 0.03) manualShowcaseOverride = null;

      const pAppear = easeOutCubic(rangeProgress(p, 0.012, 0.04));
      const pReel = clamp01(rangeProgress(p, 0.015, 0.36));
      const pTvOff = rangeProgress(p, 0.36, 0.45);

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

      // Animate `nodes.Lid` opening from closed to 105 deg
      if (glbLidNode) {
        const pLidOpen = easeOutCubic(rangeProgress(p, 0.014, 0.11));
        const closedAngle = Math.PI * 0.46;
        const openAngle = -0.22;
        glbLidNode.rotation.x = closedAngle + (openAngle - closedAngle) * pLidOpen;
      }

      // Rotate the .GLB Model on Y and X axes synchronized with scroll + mouse parallax
      smoothPointerX += (pointerX - smoothPointerX) * 0.08;
      smoothPointerY += (pointerY - smoothPointerY) * 0.08;

      const lateralIntro = 1 - easeInOutCubic(rangeProgress(p, 0.015, 0.14));
      const orbitalY = Math.sin(pReel * Math.PI * 2.0) * 0.22 * (1 - rangeProgress(pReel, 0.8, 1.0));
      laptopHolder.rotation.y = 0.72 * lateralIntro + orbitalY + smoothPointerX * 0.15;
      laptopHolder.rotation.x = 0.24 * lateralIntro + 0.07 - smoothPointerY * 0.08;
      laptopHolder.position.y = -0.14 + Math.sin(now * 0.0016) * 0.02;

      contactShadowMesh.scale.setScalar(1 + Math.sin(now * 0.0016) * 0.03);

      let autoIdx = 0;
      if (p >= 0.30) autoIdx = 4;
      else if (p >= 0.24) autoIdx = 3;
      else if (p >= 0.18) autoIdx = 2;
      else if (p >= 0.12) autoIdx = 1;
      else autoIdx = 0;

      const displayIdx = manualShowcaseOverride !== null ? manualShowcaseOverride : autoIdx;
      setActiveShowcaseUI(displayIdx);

      if (now - lastDrawTime > 33) {
        drawScreenCanvasTexture(displayIdx, now * 0.001);
        lastDrawTime = now;
      }

      syncGlbCamera(pReel);
      renderer.render(scene, camera);
    }

    drawScreenCanvasTexture(0, 0);
    requestAnimationFrame(tickGlbReel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGlbLaptopReel);
  } else {
    initGlbLaptopReel();
  }
})();
