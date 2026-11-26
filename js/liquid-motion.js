/**
 * Liquid Motion Effect — Black Ranger Transform
 *
 * Recreates the interactive Liquid Motion pipeline:
 * 1. 2D Navier-Stokes fluid cursor simulation (advection, external force, divergence, Poisson pressure, gradient projection)
 * 2. 3D Simplex Noise topographic contour waves driven by cursor motion and idle state
 * 3. 2.5D depth-displaced user portrait with fluid-reactive shadow
 * 4. 2.5D depth-displaced Black Ranger revealed through the liquid hover mask
 */

(function () {
  "use strict";

  // Force page to ALWAYS start at top (scrollY = 0) on open, reload (F5), unload or navigation
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  document.documentElement.classList.add("is-initial-loading");
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;

  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  const forceScrollToTop = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  };

  window.addEventListener("beforeunload", forceScrollToTop);
  window.addEventListener("pagehide", forceScrollToTop);
  window.addEventListener("pageshow", forceScrollToTop);
  window.addEventListener("load", () => {
    forceScrollToTop();
    setTimeout(() => {
      document.documentElement.classList.remove("is-initial-loading");
    }, 450);
  });

  const GL_ROOT = "assets/gl";

  const ASSETS = {
    textures: {
      head: {
        diffuse: `${GL_ROOT}/textures/head/webp/user-diffuse.png`,
        depth: `${GL_ROOT}/textures/head/webp/user-depth.png`,
        alpha: `${GL_ROOT}/textures/head/webp/user-alpha.png`,
        normal: `${GL_ROOT}/textures/head/webp/user-normal.png`,
        shadow: `${GL_ROOT}/textures/head/webp/user-shadow.png`,
      },
      ranger: {
        diffuse: `${GL_ROOT}/textures/head/webp/ranger-diffuse.png`,
        depth: `${GL_ROOT}/textures/head/webp/ranger-depth.png`,
        alpha: `${GL_ROOT}/textures/head/webp/ranger-alpha.png`,
        normal: `${GL_ROOT}/textures/head/webp/ranger-normal.png`,
      },
      rangerVariants: {
        black: {
          diffuse: `${GL_ROOT}/textures/head/webp/ranger-diffuse.png`,
          alpha: `${GL_ROOT}/textures/head/webp/ranger-alpha.png`,
        },
        red: {
          diffuse: `${GL_ROOT}/textures/head/webp/ranger-red-diffuse.png`,
          alpha: `${GL_ROOT}/textures/head/webp/ranger-red-alpha.png`,
        },
        blue: {
          diffuse: `${GL_ROOT}/textures/head/webp/ranger-blue-diffuse.png`,
          alpha: `${GL_ROOT}/textures/head/webp/ranger-blue-alpha.png`,
        },
        green: {
          diffuse: `${GL_ROOT}/textures/head/webp/ranger-green-diffuse.png`,
          alpha: `${GL_ROOT}/textures/head/webp/ranger-green-alpha.png`,
        },
        yellow: {
          diffuse: `${GL_ROOT}/textures/head/webp/ranger-yellow-diffuse.png`,
          alpha: `${GL_ROOT}/textures/head/webp/ranger-yellow-alpha.png`,
        },
        pink: {
          diffuse: `${GL_ROOT}/textures/head/webp/ranger-pink-diffuse.png`,
          alpha: `${GL_ROOT}/textures/head/webp/ranger-pink-alpha.png`,
        },
        silver: {
          diffuse: `${GL_ROOT}/textures/head/webp/ranger-silver-diffuse.png`,
          alpha: `${GL_ROOT}/textures/head/webp/ranger-silver-alpha.png`,
        },
      },
      noise: {
        texture: `${GL_ROOT}/textures/noise/noise-03.webp`,
      },
      retrowaveBg: `${GL_ROOT}/textures/retrowave-palms-bg.jpg`,
    },
  };

  // =========================================================================
  // Specific Processor / GPU Hardware Detection & 3 Complete Quality Presets
  // (Fraco / low | Normal / medium | Forte / high)
  // Automatically adjusts Hz (30/60/90/120Hz) & resolution across the 4 screen sizes
  // =========================================================================

  const IS_MOBILE_DEVICE =
    window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

  const QUALITY_PRESETS = {
    low: {
      key: "low",
      hz: 30,
      cssTier: "low",
      mobileMaxDpr: 1.15,
      desktopMaxDpr: 1.0,
      maxTotalPixels: 850000,
      portraitSegs: 40,
      letterSlices: 6,
      letterTexRes: 256,
      fluidRes: 0.05,
      fluidPoisson: 1,
      fluidBfecc: false,
      fluidTargetW: 256,
      fluidTargetH: 144,
      shaderQuality: 0.0,
    },
    medium: {
      key: "medium",
      hz: 60,
      cssTier: "medium",
      mobileMaxDpr: 1.75,
      desktopMaxDpr: 1.25,
      maxTotalPixels: 1850000,
      portraitSegs: 64,
      letterSlices: 12,
      letterTexRes: 512,
      fluidRes: 0.075,
      fluidPoisson: 2,
      fluidBfecc: false,
      fluidTargetW: 512,
      fluidTargetH: 288,
      shaderQuality: 1.0,
    },
    high: {
      key: "high",
      hz: 120,
      cssTier: "high",
      mobileMaxDpr: 2.75,
      desktopMaxDpr: 1.65,
      maxTotalPixels: 3400000,
      portraitSegs: 112,
      letterSlices: 22,
      letterTexRes: 768,
      fluidRes: 0.10,
      fluidPoisson: 4,
      fluidBfecc: true,
      fluidTargetW: 768,
      fluidTargetH: 432,
      shaderQuality: 2.0,
    },
  };

  function detectHardwareProfile() {
    const cores = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 4;
    const ram = typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : 0;
    const dpr = window.devicePixelRatio || 1;
    const ua = navigator.userAgent || "";

    let rawRenderer = "";
    let rawVendor = "";
    try {
      const probeCanvas = document.createElement("canvas");
      const gl =
        probeCanvas.getContext("webgl", { powerPreference: "high-performance" }) ||
        probeCanvas.getContext("experimental-webgl");
      if (gl) {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        if (dbg) {
          rawRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "");
          rawVendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || "");
        } else {
          rawRenderer = String(gl.getParameter(gl.RENDERER) || "");
          rawVendor = String(gl.getParameter(gl.VENDOR) || "");
        }
        const loseExt = gl.getExtension("WEBGL_lose_context");
        if (loseExt) loseExt.loseContext();
      }
    } catch (_e) {
      // Ignore WebGL probe errors
    }

    const rUpper = `${rawRenderer} ${rawVendor}`.toUpperCase();
    let recTier = null;

    // 1. Qualcomm Snapdragon / Adreno GPU Specific Detection
    const adrenoMatch = rUpper.match(/ADRENO[^\d]*(\d{3,4})/);
    if (adrenoMatch) {
      const model = parseInt(adrenoMatch[1], 10);
      if (model >= 710 || (model >= 640 && model < 700)) {
        recTier = "high";
      } else if (model >= 612 && model <= 639) {
        recTier = "medium";
      } else {
        recTier = "low";
      }
    }

    // 2. ARM Mali / Immortalis / Samsung Xclipse
    if (!recTier) {
      if (/IMMORTALIS|XCLIPSE|MALI-G710|MALI-G715|MALI-G720|MALI-G610|MALI-G615|MALI-G78|MALI-G77|MALI-G76/.test(rUpper)) {
        recTier = "high";
      } else if (/MALI-G68|MALI-G57|MALI-G72|MALI-G71/.test(rUpper)) {
        recTier = "medium";
      } else if (/MALI-G52|MALI-G51|MALI-G31|MALI-T|MALI-4|POWERVR|SGX|GE8320|GE8300/.test(rUpper)) {
        recTier = "low";
      }
    }

    // 3. Apple GPU (iPhone / iPad / Apple Silicon M1/M2/M3/M4)
    if (!recTier && (/APPLE/.test(rUpper) || /iPhone|iPad|iPod/i.test(ua))) {
      if (/M1|M2|M3|M4|A14|A15|A16|A17|A18/.test(rUpper) || dpr >= 2.8 || cores >= 6) {
        recTier = "high";
      } else {
        recTier = "medium";
      }
    }

    // 4. Desktop & Laptop GPUs (NVIDIA GeForce, AMD Radeon, Intel Arc / Iris / UHD / HD)
    if (!recTier) {
      if (/SWIFTSHADER|LLVMPIPE|BASIC RENDER|GMA|INTEL\(R\)\s*HD GRAPHICS\s*(2000|2500|3000|4000|4400|4600|500|505|510|515|520|530|610)|GEFORCE\s*(210|GT\s*6|GT\s*710|GT\s*720|GT\s*730)/.test(rUpper)) {
        recTier = "low";
      } else if (/RTX|GTX\s*(105|106|107|108|165|166|970|980)|RADEON\s*RX|RADEON\s*PRO|INTEL.*ARC|IRIS\s*XE/.test(rUpper)) {
        recTier = "high";
      } else if (/UHD\s*GRAPHICS|IRIS|RADEON|GEFORCE\s*MX|GTX/.test(rUpper)) {
        recTier = cores >= 8 && (!ram || ram >= 8) ? "high" : "medium";
      }
    }

    // 5. Fallback Heuristic using Processor Cores, RAM & Retina DPR
    if (!recTier) {
      if (cores <= 2 || (ram > 0 && ram <= 2) || (cores <= 4 && ram > 0 && ram <= 3)) {
        recTier = "low";
      } else if (
        (cores >= 8 && (ram >= 6 || (!ram && dpr >= 2.0))) ||
        (IS_MOBILE_DEVICE && cores >= 6 && dpr >= 2.0 && (!ram || ram >= 4))
      ) {
        recTier = "high";
      } else {
        recTier = "medium";
      }
    }

    return {
      recommendedTier: recTier,
    };
  }

  const HARDWARE_PROFILE = detectHardwareProfile();
  let savedTierPref = null;
  try {
    savedTierPref = localStorage.getItem("ms_quality_tier_override");
  } catch (_e) {
    savedTierPref = null;
  }

  let ACTIVE_QUALITY_TIER = savedTierPref && QUALITY_PRESETS[savedTierPref]
    ? savedTierPref
    : HARDWARE_PROFILE.recommendedTier;
  let CURRENT_QUALITY_PRESET = QUALITY_PRESETS[ACTIVE_QUALITY_TIER] || QUALITY_PRESETS.medium;
  let IS_LOW_END = CURRENT_QUALITY_PRESET.cssTier === "low";

  document.documentElement.setAttribute("data-quality-tier", CURRENT_QUALITY_PRESET.cssTier);
  document.documentElement.setAttribute("data-display-hz", String(CURRENT_QUALITY_PRESET.hz));
  document.documentElement.classList.toggle("is-low-end", IS_LOW_END);

  const SUPPORTS_COLOR_MIX =
    typeof window.CSS !== "undefined" &&
    typeof window.CSS.supports === "function" &&
    window.CSS.supports("color", "color-mix(in srgb, #ffffff 50%, transparent)");

  function hexToRgbaString(hex, alpha) {
    const clean = String(hex || "#FFFFFF").replace("#", "");
    const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean, 16) || 0xffffff;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const LIQUID_CONFIG = {
    headScene: {
      COLOR_OUTLINE: "#263042",
      COLOR_FOREGROUND: "#141923",
      COLOR_BACKGROUND: "#0A0C12",
      COLOR_CURSOR_FOREGROUND: "#1C2436",
      COLOR_CURSOR_BACKGROUND: "#121722",
      COLOR_CURSOR_OUTLINE: "#00E5FF",
      COLOR_FILTER: "#1E293B",
      SCALE: 1,
      SPEED: 0.1,
      THICKNESS: 0.000005,
      OUTLINE: true,
      SHOW_HELMET_PERMANENTLY: false,
      DISTORT_SCALE: 1,
      DISTORT_INTENSITY: 0.5,
      NOISE_DETAIL: 3,
      CURSOR_INTENSITY: 0.15,
      CURSOR_SCALE: 3,
      CURSOR_BOUNCE: -0.75,
      REVEAL_SIZE: 25,
      IS_WIREFRAME_ANIMATING: true,
    },
    fluid: {
      iterations_poisson: 2,
      iterations_viscous: 2,
      dissipation: 0.96,
      mouse_force: 45,
      resolution: 0.075,
      cursor_size: 18,
      straightness: 1,
      viscous: 30,
      isBounce: false,
      dt: 0.014,
      isViscous: false,
      BFECC: false,
    },
  };

  // =========================================================================
  // GLSL Shaders
  // =========================================================================

  const SIMPLEX_NOISE_GLSL = `
    vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);

      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);

      vec3 x1 = x0 - i1 + 1.0 * C.xxx;
      vec3 x2 = x0 - i2 + 2.0 * C.xxx;
      vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

      i = mod(i, 289.0);
      vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));

      float n_ = 1.0 / 7.0;
      vec3 ns = n_ * D.wyz - D.xzx;

      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);

      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);

      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);

      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));

      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);

      vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;

      vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
    }
  `;

  const FACE_VERT = `
    attribute vec3 position;
    uniform vec2 px;
    uniform vec2 boundarySpace;
    varying vec2 uv;
    precision highp float;

    void main() {
      vec3 pos = position;
      vec2 scale = 1.0 - boundarySpace * 2.0;
      pos.xy = pos.xy * scale;
      uv = vec2(0.5) + pos.xy * 0.5;
      gl_Position = vec4(pos, 1.0);
    }
  `;

  const BOUNDARY_LINE_VERT = `
    attribute vec3 position;
    varying vec2 uv;
    uniform vec2 px;
    precision highp float;

    void main() {
      vec3 pos = position;
      uv = 0.5 + pos.xy * 0.5;
      vec2 n = sign(pos.xy);
      pos.xy = abs(pos.xy) - px * 1.0;
      pos.xy *= n;
      gl_Position = vec4(pos, 1.0);
    }
  `;

  const ADVECTION_FRAG = `
    precision highp float;
    uniform sampler2D velocity;
    uniform float dt;
    uniform float dissipation;
    uniform bool isBFECC;
    uniform vec2 fboSize;
    uniform vec2 px;
    varying vec2 uv;

    void main() {
      vec2 ratio = max(fboSize.x, fboSize.y) / fboSize;

      if (isBFECC == false) {
        vec2 vel = texture2D(velocity, uv).xy;
        vec2 uv2 = uv - vel * dt * ratio;
        vec2 newVel = texture2D(velocity, uv2).xy;
        gl_FragColor = vec4(newVel, 0.0, 0.0);
      } else {
        vec2 spot_new = uv;
        vec2 vel_old = texture2D(velocity, uv).xy;
        vec2 spot_old = spot_new - vel_old * dt * ratio;
        vec2 vel_new1 = texture2D(velocity, spot_old).xy;
        vec2 spot_new2 = spot_old + vel_new1 * dt * ratio;
        vec2 error = spot_new2 - spot_new;
        vec2 spot_new3 = spot_new - error / 2.0;
        vec2 vel_2 = texture2D(velocity, spot_new3).xy;
        vec2 spot_old2 = spot_new3 - vel_2 * dt * ratio;
        vec2 newVel2 = texture2D(velocity, spot_old2).xy * dissipation;
        gl_FragColor = vec4(newVel2, 0.0, 0.0);
      }
    }
  `;

  const EXTERNAL_FORCE_VERT = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    uniform vec2 center;
    uniform vec2 scale;
    uniform vec2 px;
    varying vec2 vUv;

    void main() {
      vec2 pos = position.xy * scale * 2.0 * px + center;
      vUv = uv;
      gl_Position = vec4(pos, 0.0, 1.0);
    }
  `;

  const EXTERNAL_FORCE_FRAG = `
    precision highp float;
    uniform vec2 force;
    uniform vec2 center;
    uniform vec2 scale;
    uniform vec2 px;
    varying vec2 vUv;

    void main() {
      vec2 circle = (vUv - 0.5) * 2.0;
      float d = 1.0 - min(length(circle), 1.0);
      d *= d;
      gl_FragColor = vec4(force * d, 0.0, 1.0);
    }
  `;

  const VISCOUS_FRAG = `
    precision highp float;
    uniform sampler2D velocity;
    uniform sampler2D velocity_new;
    uniform float v;
    uniform vec2 px;
    uniform float dt;
    varying vec2 uv;

    void main() {
      vec2 old = texture2D(velocity, uv).xy;
      vec2 new0 = texture2D(velocity_new, uv + vec2(px.x * 2.0, 0.0)).xy;
      vec2 new1 = texture2D(velocity_new, uv - vec2(px.x * 2.0, 0.0)).xy;
      vec2 new2 = texture2D(velocity_new, uv + vec2(0.0, px.y * 2.0)).xy;
      vec2 new3 = texture2D(velocity_new, uv - vec2(0.0, px.y * 2.0)).xy;

      vec2 next = (4.0 * old + v * dt * (new0 + new1 + new2 + new3)) / (4.0 * (1.0 + v * dt));
      gl_FragColor = vec4(next, 0.0, 0.0);
    }
  `;

  const DIVERGENCE_FRAG = `
    precision highp float;
    uniform sampler2D velocity;
    uniform float dt;
    uniform vec2 px;
    varying vec2 uv;

    void main() {
      float x0 = texture2D(velocity, uv - vec2(px.x, 0.0)).x;
      float x1 = texture2D(velocity, uv + vec2(px.x, 0.0)).x;
      float y0 = texture2D(velocity, uv - vec2(0.0, px.y)).y;
      float y1 = texture2D(velocity, uv + vec2(0.0, px.y)).y;
      float divergence = (x1 - x0 + y1 - y0) / 2.0;
      gl_FragColor = vec4(divergence / dt);
    }
  `;

  const POISSON_FRAG = `
    precision highp float;
    uniform sampler2D pressure;
    uniform sampler2D divergence;
    uniform float straightness;
    uniform vec2 px;
    varying vec2 uv;

    void main() {
      float p0 = texture2D(pressure, uv + vec2(px.x * 2.0, 0.0)).r;
      float p1 = texture2D(pressure, uv - vec2(px.x * 2.0, 0.0)).r;
      float p2 = texture2D(pressure, uv + vec2(0.0, px.y * 2.0)).r;
      float p3 = texture2D(pressure, uv - vec2(0.0, px.y * 2.0)).r;
      float div = texture2D(divergence, uv).r;
      float newP = (p0 + p1 + p2 + p3) / (4.0 + straightness) - div;
      gl_FragColor = vec4(newP);
    }
  `;

  const PRESSURE_FRAG = `
    precision highp float;
    uniform sampler2D pressure;
    uniform sampler2D velocity;
    uniform vec2 px;
    uniform float dt;
    varying vec2 uv;

    void main() {
      float stepSize = 1.0;
      float p0 = texture2D(pressure, uv + vec2(px.x * stepSize, 0.0)).r;
      float p1 = texture2D(pressure, uv - vec2(px.x * stepSize, 0.0)).r;
      float p2 = texture2D(pressure, uv + vec2(0.0, px.y * stepSize)).r;
      float p3 = texture2D(pressure, uv - vec2(0.0, px.y * stepSize)).r;

      vec2 v = texture2D(velocity, uv).xy;
      vec2 gradP = vec2(p0 - p1, p2 - p3) * 0.5;
      v = v - gradP * dt;
      gl_FragColor = vec4(v, 0.0, 1.0);
    }
  `;

  const FLUID_OUTPUT_FRAG = `
    precision highp float;
    uniform sampler2D velocity;
    varying vec2 uv;

    void main() {
      vec2 vel = texture2D(velocity, uv).xy;
      float len = length(vel);
      vel = vel * 0.5 + 0.5;

      vec3 color = vec3(vel.x, vel.y, 1.0);
      color = mix(vec3(1.0), color, len);
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const BACKGROUND_NOISE_VERT = `
    varying vec2 vUv;

    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vUv = uv;
    }
  `;

  const BACKGROUND_NOISE_FRAG = `
    #include <simplex>

    varying vec2 vUv;

    uniform float uAspect;
    uniform float uTime;
    uniform float uMousePace;
    uniform float uReveal;
    uniform vec2 uMouseCoords;

    uniform float SCALE;
    uniform float SPEED;
    uniform float DISTORT_SCALE;
    uniform float DISTORT_INTENSITY;
    uniform float NOISE_DETAIL;
    uniform float CURSOR_INTENSITY;
    uniform float CURSOR_SCALE;
    uniform float CURSOR_BOUNCE;
    uniform float REVEAL_SIZE;

    void main() {
      vec2 uv = vUv;
      uv.x *= uAspect;
      uv.y += (REVEAL_SIZE + REVEAL_SIZE / 3.0) * (1.0 - uReveal);
      uv.y /= 1.0 + REVEAL_SIZE * (1.0 - uReveal);

      vec2 mouse = uMouseCoords * vec2(0.5) + vec2(0.5);
      mouse.x *= uAspect;

      float cursor = 1.0 - distance(mouse, uv) * CURSOR_SCALE;
      cursor *= uMousePace;
      cursor = clamp(cursor, CURSOR_BOUNCE, 1.0);

      float noiseDistort = 0.5 + snoise(vec3(uv.x * DISTORT_SCALE, uv.y * DISTORT_SCALE, uTime * SPEED * 0.1)) * 0.5;

      float noiseFinal = 0.5 + snoise(
        vec3(
          (uv.x + (cursor * CURSOR_INTENSITY) + (noiseDistort * DISTORT_INTENSITY)) * SCALE,
          (uv.y + (cursor * CURSOR_INTENSITY) + (noiseDistort * DISTORT_INTENSITY)) * SCALE,
          uTime * SPEED
        )
      ) * 0.5;

      noiseFinal *= NOISE_DETAIL;
      noiseFinal = fract(noiseFinal);
      float noiseBase = step(0.5, noiseFinal);

      gl_FragColor = vec4(vec3(noiseBase, noiseFinal, 0.0), 1.0);
    }
  `;

  const WIREFRAME_VERT = `
    varying vec2 vUv;
    varying vec3 vPosition;

    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vUv = uv;
      vPosition = position;
    }
  `;

  const WIREFRAME_FRAG = `
    varying vec2 vUv;
    varying vec3 vPosition;

    uniform float uTime;
    uniform float uOpacity;
    uniform bool uIsWireframeAnimating;

    void main() {
      float scanEffect = 0.1;
      if (uIsWireframeAnimating) {
        scanEffect = pow(fract(-vPosition.y * 10.0 - uTime), 4.0) * 0.1;
      }
      gl_FragColor = vec4(vec3(0.0), scanEffect * uOpacity);
    }
  `;

  const COMPOSITION_VERT = `
    precision highp float;
    varying vec2 vUv;

    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vUv = uv;
    }
  `;

  const COMPOSITION_FRAG = `
    precision highp float;
    #include <tonemapping_pars_fragment>

    const float PI = 3.141592;

    vec3 toGrayscale(vec3 color) {
      return vec3(dot(color, vec3(0.299, 0.587, 0.114)));
    }

    vec3 adjustContrast(vec3 color, float contrast) {
      return (color - 0.5) * contrast + 0.5;
    }

    float blendOverlay(float base, float blend) {
      return base < 0.5 ? (2.0 * base * blend) : (1.0 - 2.0 * (1.0 - base) * (1.0 - blend));
    }

    vec3 blendOverlay(vec3 base, vec3 blend) {
      return vec3(
        blendOverlay(base.r, blend.r),
        blendOverlay(base.g, blend.g),
        blendOverlay(base.b, blend.b)
      );
    }

    vec3 blendHardLight(vec3 base, vec3 blend) {
      return blendOverlay(blend, base);
    }

    uniform float uAspect;
    uniform float uTime;
    uniform float uReveal;
    uniform float uHover;
    uniform float uHelmetHover;
    uniform float uFilter;
    uniform float uCursorIntensity;
    uniform vec3 uColorHover;

    uniform sampler2D tDefaultDiffuse;
    uniform sampler2D tHelmet;
    uniform sampler2D tCursorEffect;
    uniform sampler2D tBackgroundNoise;
    uniform sampler2D tNoise;
    uniform sampler2D tTitleText;
    uniform sampler2D tPalmsLayer;
    uniform vec2 uMouseParallax;

    uniform vec3 uRangerColor;
    uniform float uRangerTintMix;
    uniform float uQualityLevel;

    uniform bool OUTLINE;
    uniform bool SHOW_HELMET_PERMANENTLY;
    uniform float THICKNESS;
    uniform vec3 COLOR_OUTLINE;
    uniform vec3 COLOR_FOREGROUND;
    uniform vec3 COLOR_BACKGROUND;
    uniform vec3 COLOR_CURSOR_FOREGROUND;
    uniform vec3 COLOR_CURSOR_BACKGROUND;
    uniform vec3 COLOR_CURSOR_OUTLINE;
    uniform vec3 COLOR_FILTER;
    uniform float REVEAL_SIZE;

    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      uv.x *= uAspect;
      uv.y += (REVEAL_SIZE + REVEAL_SIZE / 3.0) * (1.0 - uReveal);
      uv.y /= 1.0 + REVEAL_SIZE * (1.0 - uReveal);

      vec4 textureBackgroundNoise = texture2D(tBackgroundNoise, vUv);

      // Liquid cursor mask
      vec4 textureCursorEffect = texture2D(tCursorEffect, vec2(0.025 + vUv.x * 0.95, 0.025 + vUv.y * 0.95));
      textureCursorEffect.rgb = 1.0 - textureCursorEffect.rgb;
      float cursorEffect = smoothstep(0.08, 0.16, textureCursorEffect.r);

      vec2 mouseScreenUv = uMouseParallax * 0.5 + 0.5;
      vec3 cyberCyan = vec3(0.0, 0.90, 1.0);
      vec3 cyberMagenta = vec3(1.0, 0.02, 0.46);
      vec3 cyberViolet = vec3(0.55, 0.08, 0.95);
      vec3 dualAccent = mix(cyberCyan, cyberMagenta, clamp(vUv.x * 0.55 + (1.0 - vUv.y) * 0.45, 0.0, 1.0));

      // =======================================================================
      // 5-PLANE PROCEDURAL RETROWAVE STAGE (Rebuilt from scratch in 5 layers)
      // - 5º Plano (Fundo): Background com Degradê Noturno, Horizonte Neon & Estrelas
      // - 4º Plano: Sol Retrowave Fatiado com Efeito de Calor (Thermal Heat-Haze)
      // - 3º Plano: Palmeiras Isoladas com Balanço Natural no Hover
      // - 2º Plano: Piso Gradeado 3D em Perspectiva com Luz Correndo Entre as Linhas
      // - 1º Plano (Frente): Avatar (Personagem / Ranger) & Letreiro 3D
      // =======================================================================

      // -----------------------------------------------------------------------
      // 5º PLANO: Background com Degradê Retrowave & Estrelas
      // -----------------------------------------------------------------------
      vec2 skyUv = vUv - uMouseParallax * 0.004;
      float skyT = clamp((skyUv.y - 0.44) / 0.56, 0.0, 1.0);

      vec3 skyTop = vec3(0.018, 0.003, 0.042);       // Deep space violet-black
      vec3 skyMid = vec3(0.085, 0.008, 0.145);       // Synthwave twilight purple
      vec3 skyLow = vec3(0.450, 0.012, 0.210);       // Deep crimson-magenta glow
      vec3 skyHorizon = vec3(0.950, 0.025, 0.280);   // Intense neon pink-red horizon

      vec3 plane5Sky = mix(skyHorizon, skyLow, smoothstep(0.0, 0.22, skyT));
      plane5Sky = mix(plane5Sky, skyMid, smoothstep(0.18, 0.55, skyT));
      plane5Sky = mix(plane5Sky, skyTop, smoothstep(0.50, 1.0, skyT));

      // Intense horizon atmospheric bloom right around y = 0.46
      float horizonBloom = exp(-abs(skyUv.y - 0.465) * 14.0);
      plane5Sky += vec3(0.55, 0.02, 0.18) * horizonBloom;

      // Procedural twinkling stars in the upper night sky (y > 0.58) — skipped on Fraco (uQualityLevel < 0.5) for ultra-fast mobile fill rate
      if (uQualityLevel > 0.5 && skyUv.y > 0.56) {
        vec2 starGrid = skyUv * vec2(uAspect * 48.0, 48.0);
        vec2 starId = floor(starGrid);
        vec2 starLocal = fract(starGrid) - 0.5;
        float starSeed = fract(sin(dot(starId, vec2(127.1, 311.7))) * 43758.5453);
        if (starSeed > 0.92) {
          vec2 starOffset = vec2(fract(starSeed * 17.3) - 0.5, fract(starSeed * 29.7) - 0.5) * 0.55;
          float starDist = length(starLocal - starOffset);
          float twinkle = 0.55 + 0.45 * sin(uTime * (2.5 + fract(starSeed * 9.1) * 4.0) + starSeed * 60.0);
          float starBrightness = smoothstep(0.085, 0.01, starDist) * twinkle * smoothstep(0.56, 0.72, skyUv.y);
          plane5Sky += vec3(0.95, 0.80, 1.0) * starBrightness * 0.65;
        }
      }

      vec3 sceneColor = plane5Sky;

      // -----------------------------------------------------------------------
      // 4º PLANO: O Sol Retrowave Fatiado com Efeito de Calor (Behind Palms & Floor)
      // -----------------------------------------------------------------------
      vec2 sunCenter = vec2(0.50, 0.635) - uMouseParallax * 0.009;
      vec2 sunAspectScale = vec2(max(uAspect * 0.64, 0.52), 1.0);
      vec2 rawSunDelta = (vUv - sunCenter) * sunAspectScale;
      float rawSunDist = length(rawSunDelta);

      // Thermal Heat-Haze Distortion ("efeito de calor no sol"):
      // Rising convective heat waves warp the sun's disc edge, horizontal slices, and solar corona
      float sunHeatZone = smoothstep(0.36, 0.04, rawSunDist);
      float heatWaveX = sin(vUv.y * 135.0 - uTime * 5.4 + sin(vUv.x * 42.0 + uTime * 2.3)) * 0.0038 * sunHeatZone;
      float heatWaveY = sin(vUv.x * 80.0 + vUv.y * 105.0 - uTime * 4.6) * 0.0024 * sunHeatZone;

      vec2 heatedSunDelta = (vUv + vec2(heatWaveX, heatWaveY) - sunCenter) * sunAspectScale;
      float sunDist = length(heatedSunDelta);
      float sunRadius = 0.215;

      // Living thermal solar corona around the 4th-plane sun
      float sunCorona = smoothstep(sunRadius * 2.1, sunRadius * 0.4, sunDist);
      float coronaPulse = 0.5 + 0.5 * sin(uTime * 3.0 - sunDist * 18.0);
      sceneColor += vec3(0.85, 0.03, 0.38) * (sunCorona * (0.14 + 0.06 * coronaPulse));

      // Sliced Sun Disc with 20 progressive horizontal cut-out bars
      float sunDiscMask = smoothstep(sunRadius + 0.003, sunRadius - 0.003, sunDist);
      if (sunDiscMask > 0.001) {
        // Normalized vertical position inside the sun: 0.0 at bottom, 1.0 at top
        float sunNormY = clamp((heatedSunDelta.y + sunRadius) / (2.0 * sunRadius), 0.0, 1.0);

        // Horizontal slice bars (21 bands; solid near the very top, progressively wider dark gaps toward the bottom)
        float sliceFreq = 21.0;
        float slicePhase = fract(sunNormY * sliceFreq - uTime * 0.18);
        // Gap threshold decreases toward the top so top bands are thick and bottom bands have wider cut-outs
        float gapThreshold = clamp(0.46 * (1.0 - sunNormY * 0.82), 0.06, 0.46);
        float sliceBarMask = smoothstep(gapThreshold - 0.04, gapThreshold + 0.04, slicePhase);

        // Sun vertical color gradient: Hot Electric Violet-Magenta at top -> Neon Pink -> Sunset Crimson-Orange at base
        vec3 sunTopCol = vec3(0.78, 0.04, 0.85);
        vec3 sunMidCol = vec3(0.98, 0.03, 0.52);
        vec3 sunBotCol = vec3(1.00, 0.12, 0.28);
        vec3 sunColor = mix(sunBotCol, sunMidCol, smoothstep(0.0, 0.55, sunNormY));
        sunColor = mix(sunColor, sunTopCol, smoothstep(0.50, 1.0, sunNormY));

        // Internal thermal plasma shimmer inside the sun bands
        sunColor *= 0.92 + 0.14 * sin(sunNormY * 45.0 - uTime * 4.2);

        sceneColor = mix(sceneColor, sunColor, sunDiscMask * sliceBarMask);
      }

      // -----------------------------------------------------------------------
      // 3º PLANO: As Palmeiras (Isolated Transparent Layer in front of Sun, behind 3D Floor)
      // -----------------------------------------------------------------------
      vec2 palmBaseUv = vUv - uMouseParallax * 0.016;
      // Map screen Y [0.43..0.81] to palms canvas Y [0.0..1.0]
      float palmLocalY = (palmBaseUv.y - 0.43) / 0.38;
      if (palmLocalY > 0.0 && palmLocalY < 1.0) {
        // 2 palm trees positioned at left (0.365) and right (0.635) of the background sun
        float px = palmBaseUv.x;
        float palmCenter = px < 0.50 ? 0.365 : 0.635;
        float palmId = floor(palmCenter * 10.0 + 0.5);

        // Cantilever height from trunk base (0.0) to crown top (1.0)
        float h = clamp(palmLocalY, 0.0, 1.0);
        float trunkBend = h * h * (1.35 - 0.35 * h);

        // Hover interaction on this specific palm tree (mouse proximity + liquid cursor trail)
        float mouseDistToPalm = length((mouseScreenUv - vec2(palmCenter, 0.62)) * vec2(1.4, 1.0));
        float hoverProximity = smoothstep(0.18, 0.0, mouseDistToPalm);
        float hoverStrength = clamp(hoverProximity * 1.35 + cursorEffect * 0.90, 0.0, 1.7);

        // Natural breeze + elastic hover wind gust + directional push away from mouse cursor
        float idleBreeze = sin(uTime * 2.0 + palmId * 1.7) * 0.0035 + cos(uTime * 3.3 + palmId * 2.1) * 0.0015;
        float hoverOsc = sin(uTime * 7.6 + palmId * 2.0 - h * 2.5) * 0.015 * hoverStrength;
        float cursorPush = clamp(mouseScreenUv.x - palmCenter, -0.09, 0.09) * -0.12 * hoverProximity;

        // Individual palm frond rustling in the upper crown (h > 0.38)
        float frondFlutterX = 0.0;
        float frondFlutterY = 0.0;
        if (uQualityLevel > 0.5) {
          float crownZone = smoothstep(0.35, 0.62, h);
          frondFlutterX = sin(palmLocalY * 85.0 + px * 120.0 - uTime * (5.5 + hoverStrength * 8.5))
                        * (0.0012 + 0.0045 * hoverStrength) * crownZone;
          frondFlutterY = cos(px * 130.0 - palmLocalY * 65.0 + uTime * (5.0 + hoverStrength * 7.5))
                        * (0.0010 + 0.0035 * hoverStrength) * crownZone;
        }

        float swayX = (idleBreeze + hoverOsc + cursorPush) * trunkBend + frondFlutterX;
        float swayY = frondFlutterY * trunkBend;

        vec2 palmSampleUv = vec2(clamp(px - swayX, 0.001, 0.999), clamp(palmLocalY - swayY, 0.001, 0.999));
        vec4 palmTex = texture2D(tPalmsLayer, palmSampleUv);

        // Dark purple-black silhouette with subtle neon rim-backlight from the sun & horizon behind it
        vec3 palmSilhouetteCol = vec3(0.035, 0.006, 0.055);
        float sunBehindPalm = smoothstep(sunRadius * 1.25, sunRadius * 0.2, length((vec2(px, vUv.y) - sunCenter) * sunAspectScale));
        palmSilhouetteCol += vec3(0.22, 0.01, 0.12) * sunBehindPalm * (1.0 - palmTex.a * 0.5);

        sceneColor = mix(sceneColor, palmSilhouetteCol, palmTex.a);
      }

      // -----------------------------------------------------------------------
      // 2º PLANO: O Piso Gradeado 3D com Luz Passando Entre as Linhas (In front of Palms & Sun, behind Avatar)
      // -----------------------------------------------------------------------
      float horizonY = 0.455 - uMouseParallax.y * 0.016;
      float sx = vUv.x - 0.50 - uMouseParallax.x * 0.026;
      float sideAbs = abs(sx);

      // Flat central highway valley (|sx| < 0.075) flanked by 3D undulating wireframe mountain ridges on left & right
      float valleyWall = smoothstep(0.065, 0.24, sideAbs);
      float ridgeProfile = valleyWall * (
        0.042 +
        0.026 * sin(sx * 22.0 + 0.7) +
        0.016 * cos(sx * 38.0 - 0.4) +
        0.020 * sin(sx * 13.0)
      );
      float terrainTopY = horizonY + ridgeProfile;

      // Smooth 2nd-plane occlusion mask (occludes the lower trunks of the 3rd-plane palms and base of the 4th-plane sun!)
      float floorPlaneMask = smoothstep(terrainTopY + 0.003, terrainTopY - 0.003, vUv.y);
      if (floorPlaneMask > 0.001) {
        float dy = max(terrainTopY - vUv.y, 0.003);
        float floorProx = clamp(dy / 0.46, 0.0, 1.0);

        // True 3D perspective depth Z & lateral world coordinate X
        float z3d = 0.58 / (dy + 0.024);
        float x3d = sx * z3d * 1.55;

        // 3D undulating hill elevation across the side mountains & valley floor
        float hill3D = valleyWall * (
          sin(x3d * 1.45 + z3d * 0.75) * 0.52 +
          cos(x3d * 2.60 - z3d * 1.05) * 0.28
        ) + sin(x3d * 1.10 + z3d * 0.85) * 0.08 * (1.0 - valleyWall * 0.5);

        // 3D Wireframe Grid UV coordinates wrapping over the 3D hills and central valley highway
        float gridU = x3d * 2.35 + hill3D * 0.55;
        float gridV = z3d * 1.95 + hill3D * 0.65 - uTime * 0.65;

        float distU = abs(fract(gridU - 0.5) - 0.5);
        float distV = abs(fract(gridV - 0.5) - 0.5);

        // Perspective-correct anti-aliased grid line width + soft glow halo
        float lineCoreW = clamp(0.016 + dy * 0.032, 0.014, 0.042);
        float lineGlowW = lineCoreW * 3.2;

        float coreU = smoothstep(lineCoreW, lineCoreW * 0.2, distU);
        float coreV = smoothstep(lineCoreW, lineCoreW * 0.2, distV);
        float glowU = smoothstep(lineGlowW, lineCoreW * 0.5, distU);
        float glowV = smoothstep(lineGlowW, lineCoreW * 0.5, distV);

        float distFade = smoothstep(24.0, 2.2, z3d);
        float gridCore = max(coreU, coreV) * distFade;
        float gridGlow = max(glowU, glowV) * distFade;

        // 2nd-Plane Solid Terrain Surface (dark synthwave indigo-violet with horizon rim reflection)
        vec3 terrainSurface = mix(vec3(0.022, 0.005, 0.068), vec3(0.055, 0.012, 0.145), clamp(hill3D * 0.5 + 0.5, 0.0, 1.0));
        // Warm sunset reflection along the distant horizon vanishing point
        float horizonMist = exp(-dy * 11.0);
        terrainSurface = mix(terrainSurface, vec3(0.42, 0.02, 0.24), horizonMist * 0.65);

        // Base Wireframe Grid Line Color (Retrowave Violet-Blue -> Neon Magenta near horizon)
        vec3 baseGridCol = mix(vec3(0.28, 0.08, 0.78), vec3(0.85, 0.05, 0.55), horizonMist * 0.7 + valleyWall * 0.25);

        // Animated Light Pulses Traveling Along the 3D Grid Lines ("animação da luz passando entre as linhas"):
        // 1. Longitudinal laser streams racing along the U lines between horizon and foreground
        float lineIdU = floor(gridU + 0.5);
        float pulseAlongZ = pow(0.5 + 0.5 * sin(z3d * 1.65 - uTime * 4.8 + lineIdU * 0.85), 7.0);
        // 2. Transversal energy waves sweeping across the V rings
        float lineIdV = floor(gridV + 0.5);
        float pulseAlongX = pow(0.5 + 0.5 * sin(x3d * 1.45 - uTime * 3.8 + lineIdV * 0.75), 7.0);
        // 3. Interactive 3D hover light wave when cursor moves over the 3D floor
        float mouseFloorDist = length((vUv - mouseScreenUv) * vec2(uAspect * 0.85, 1.0));
        float hoverFloorWave = smoothstep(0.24, 0.0, mouseFloorDist) * (0.65 + 0.35 * sin(mouseFloorDist * 40.0 - uTime * 8.5));

        vec3 pulseColorZ = mix(cyberCyan, cyberMagenta, 0.5 + 0.5 * sin(lineIdU * 1.3 + uTime * 1.5));
        vec3 pulseColorX = mix(cyberMagenta, cyberCyan, 0.5 + 0.5 * cos(lineIdV * 1.1 - uTime * 1.8));

        vec3 activeLineLight = pulseColorZ * (coreU * pulseAlongZ * 1.35)
                             + pulseColorX * (coreV * pulseAlongX * 1.15)
                             + mix(cyberCyan, cyberMagenta, 0.35) * ((hoverFloorWave + cursorEffect * 0.8) * gridCore * 1.25);

        vec3 floorFinal = terrainSurface
                        + baseGridCol * (gridCore * 0.78 + gridGlow * 0.22)
                        + activeLineLight * (0.45 + 0.55 * floorProx);

        sceneColor = mix(sceneColor, floorFinal, floorPlaneMask);
      }

      // Subtle CRT scanline texture & active Ranger theme aura
      float crtScan = 0.96 + 0.04 * sin(vUv.y * 420.0 + uTime * 3.5);
      sceneColor *= crtScan;

      vec2 stageDelta = (vUv - vec2(0.5, 0.48)) * vec2(max(uAspect, 0.65), 1.0);
      float edgeVignette = clamp(1.0 - dot(stageDelta, stageDelta) * 0.32, 0.62, 1.0);
      sceneColor = mix(sceneColor, sceneColor * (0.75 + uRangerColor * 0.60), uRangerTintMix * 0.18);
      vec3 background = sceneColor * edgeVignette;

      // -----------------------------------------------------------------------
      // 1º PLANO (FOREGROUND): Avatar (Marcos / Ranger) & Letreiro 3D
      // -----------------------------------------------------------------------
      vec4 textureDefaultDiffuse = texture2D(tDefaultDiffuse, vUv);
      vec4 textureHelmet = texture2D(tHelmet, vUv);

      // Wave hover transition mask
      float hoverTransition = vUv.y + sin(vUv.x * PI) * sin(uHelmetHover * PI) * 0.2;
      cursorEffect += smoothstep(0.98 - hoverTransition, 1.02 - hoverTransition, uHelmetHover);
      cursorEffect = clamp(cursorEffect * uCursorIntensity, 0.0, 1.0);

      // Clean composition with deep blacks (Avatar in 1st plane over the 2nd-plane 3D floor!)
      vec3 portraitRgb = pow(max(textureDefaultDiffuse.rgb, vec3(0.0)), vec3(1.16));
      vec3 helmetRgb = pow(max(textureHelmet.rgb, vec3(0.0)), vec3(1.12));

      vec3 base = mix(background, portraitRgb, textureDefaultDiffuse.a);

      // Inside the liquid cursor / Ranger reveal, deepen letter saturation naturally
      vec3 saturatedTint = mix(uRangerColor, dualAccent, 0.4);
      vec3 hoverLetterRgb = mix(portraitRgb, portraitRgb * (0.65 + saturatedTint * 0.85), 0.45);
      vec3 rangerBgWithLetters = mix(background, hoverLetterRgb, textureDefaultDiffuse.a);

      vec3 rangerLayer = mix(rangerBgWithLetters, helmetRgb, textureHelmet.a);
      vec3 finalColor = mix(base, rangerLayer, cursorEffect);

      if (SHOW_HELMET_PERMANENTLY) {
        finalColor = rangerLayer;
      }

      vec3 end = mix(textureDefaultDiffuse.rgb, vec3(0.05), 1.0 - textureDefaultDiffuse.a);
      end = toGrayscale(end);
      end = adjustContrast(end, 0.8) * 0.75;
      end = blendHardLight(end, COLOR_FILTER);

      gl_FragColor = vec4(mix(finalColor, end, uFilter), 1.0);

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  // =========================================================================
  // Core Helpers & Input Controllers
  // =========================================================================

  function syncViewportZoomCompensation() {
    const outerW = window.outerWidth || 0;
    const screenW = window.screen && window.screen.width ? window.screen.width : 1366;
    const refW = outerW > 300 ? outerW : screenW;
    const innerW = window.innerWidth || refW;
    let zoomFix = 1;
    // If Chrome tab zoom is < 100% (e.g. 33% or 50%, making innerWidth huge and menus tiny),
    // automatically scale root rem font-size so all menus render at 100% normal physical size!
    if (innerW > refW * 1.08 && innerW > 768) {
      zoomFix = Math.min(4.5, innerW / refW);
      document.documentElement.style.fontSize = `${(16 * zoomFix).toFixed(2)}px`;
    } else {
      document.documentElement.style.fontSize = "";
    }
    window.__uiZoomCompensation = zoomFix;
    return zoomFix;
  }

  function computeSizes() {
    syncViewportZoomCompensation();
    const width = window.innerWidth || 1366;
    const height = window.innerHeight || 768;
    const isPortraitMobile = width <= 900;
    const preset = CURRENT_QUALITY_PRESET || QUALITY_PRESETS.medium;
    const maxDprCap = isPortraitMobile ? preset.mobileMaxDpr : preset.desktopMaxDpr;
    const rawDpr = Math.min(window.devicePixelRatio || 1, maxDprCap);
    const maxTotalPixels = preset.maxTotalPixels;
    const budgetDpr = Math.sqrt(maxTotalPixels / Math.max(width * height, 1));
    const pixelRatio = Math.max(0.85, Math.min(rawDpr, budgetDpr));
    const renderWidth = Math.max(1, Math.round(width * pixelRatio));
    const renderHeight = Math.max(1, Math.round(height * pixelRatio));
    return { width, height, pixelRatio, renderWidth, renderHeight };
  }

  function toSRGBColor(hex) {
    // Keep in Linear working space because COMPOSITION_FRAG runs #include <colorspace_fragment> at the end!
    // Converting Linear->sRGB here caused double-gamma encoding (washed-out "milky" brightness).
    return new THREE.Color(hex);
  }

  function mapClientToCanvasNDC(clientX, clientY, fallbackSizes) {
    const canvasEl = document.querySelector("canvas.gl");
    if (canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          x: ((clientX - rect.left) / rect.width) * 2 - 1,
          y: -((clientY - rect.top) / rect.height) * 2 + 1,
        };
      }
    }
    return {
      x: (clientX / fallbackSizes.width) * 2 - 1,
      y: -(clientY / fallbackSizes.height) * 2 + 1,
    };
  }

  class MouseTracker {
    constructor(dom, sizes) {
      this.dom = dom;
      this.sizes = sizes;
      this.default = new THREE.Vector2();
      this.normalized = {
        current: new THREE.Vector2(),
        previous: new THREE.Vector2(),
      };
      this.pace = {
        default: 0,
        separated: new THREE.Vector2(),
      };

      this._onMouseMove = this.onMouseMove.bind(this);
      this._onTouchMove = this.onTouchMove.bind(this);

      this.dom.addEventListener("mousemove", this._onMouseMove);
      this.dom.addEventListener("touchstart", this._onTouchMove, { passive: true });
      this.dom.addEventListener("touchmove", this._onTouchMove, { passive: true });
    }

    onMouseMove(e) {
      this.default.set(e.clientX, e.clientY);
      const ndc = mapClientToCanvasNDC(e.clientX, e.clientY, this.sizes);
      this.normalized.current.set(ndc.x, ndc.y);
    }

    onTouchMove(e) {
      if (!e.touches || !e.touches.length) return;
      const touch = e.touches[0];
      this.default.set(touch.clientX, touch.clientY);
      const ndc = mapClientToCanvasNDC(touch.clientX, touch.clientY, this.sizes);
      this.normalized.current.set(ndc.x, ndc.y);
    }

    update() {
      this.pace.default = this.normalized.current.distanceTo(this.normalized.previous);
      this.pace.separated.set(
        this.normalized.current.x - this.normalized.previous.x,
        this.normalized.current.y - this.normalized.previous.y
      );
      this.normalized.previous.copy(this.normalized.current);
    }

    createEasedNormalized(ease) {
      const value = new THREE.Vector2();
      return {
        value,
        update: (delta) => {
          value.x = THREE.MathUtils.damp(value.x, this.normalized.current.x, ease, delta);
          value.y = THREE.MathUtils.damp(value.y, this.normalized.current.y, ease, delta);
        },
      };
    }

    createEasedPace(ease) {
      const value = { default: 0, separated: new THREE.Vector2() };
      return {
        value,
        update: (delta) => {
          value.default = THREE.MathUtils.damp(value.default, this.pace.default, ease, delta);
          value.separated.x = THREE.MathUtils.damp(value.separated.x, this.pace.separated.x, ease, delta);
          value.separated.y = THREE.MathUtils.damp(value.separated.y, this.pace.separated.y, ease, delta);
        },
      };
    }
  }

  class IdleCursorController {
    constructor() {
      this.isMoving = true;
      this.isMovingPrevious = true;
      this.moveTimeout = null;
      this.progress = new THREE.Vector2();
      this.idleCursor = new THREE.Vector2();

      this.initialTimeout = setTimeout(() => {
        this.isMoving = false;
      }, 2500);

      this._onMove = this.onMove.bind(this);
      document.addEventListener("mousemove", this._onMove);
      document.addEventListener("touchmove", this._onMove, { passive: true });

      this.timeline = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 3 });
      this.timeline.fromTo(this.progress, { y: 0 }, { y: 1, duration: 2.5, ease: "none" }, 0);
      this.timeline.fromTo(this.progress, { x: 0 }, { x: 1, duration: 2.5, ease: "power1.inOut" }, 0);
      this.timeline.fromTo(this.progress, { y: 1 }, { y: 0, duration: 2.5, ease: "none" }, 4);
      this.timeline.fromTo(this.progress, { x: 1 }, { x: 0, duration: 2.5, ease: "power1.inOut" }, 4);
    }

    onMove() {
      this.isMoving = true;
      clearTimeout(this.initialTimeout);
      clearTimeout(this.moveTimeout);
      this.moveTimeout = setTimeout(() => {
        this.isMoving = false;
      }, 2000);
    }

    update() {
      if (!this.isMoving) {
        this.idleCursor.x = -Math.cos(this.progress.x * Math.PI * 4) * 0.75;
        this.idleCursor.y = Math.cos(this.progress.y * Math.PI) * 0.5;
      }

      if (this.isMoving !== this.isMovingPrevious) {
        if (!this.isMoving) {
          this.timeline.seek(0);
          this.timeline.play();
        } else {
          this.timeline.pause();
        }
        this.isMovingPrevious = this.isMoving;
      }
    }
  }

  // =========================================================================
  // 2D Navier-Stokes Fluid Simulation Passes
  // =========================================================================

  class ShaderPass {
    constructor(renderer, props) {
      this.renderer = renderer;
      this.props = props;
      this.uniforms = this.props.material ? this.props.material.uniforms : null;
    }

    init() {
      this.scene = new THREE.Scene();
      this.camera = new THREE.Camera();
      if (this.uniforms) {
        this.material = new THREE.RawShaderMaterial(this.props.material);
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.plane = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.plane);
      }
    }

    update() {
      this.renderer.setRenderTarget(this.props.output);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
    }
  }

  class AdvectionPass extends ShaderPass {
    constructor(renderer, simProps) {
      super(renderer, {
        material: {
          vertexShader: FACE_VERT,
          fragmentShader: ADVECTION_FRAG,
          uniforms: {
            boundarySpace: { value: simProps.cellScale },
            px: { value: simProps.cellScale },
            fboSize: { value: simProps.fboSize },
            velocity: { value: simProps.src.texture },
            dt: { value: simProps.dt },
            isBFECC: { value: true },
            dissipation: { value: simProps.dissipation },
          },
        },
        output: simProps.dst,
      });
      this.init();
    }

    init() {
      super.init();
      const boundaryGeo = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        -1, -1, 0, -1, 1, 0,
        -1, 1, 0, 1, 1, 0,
        1, 1, 0, 1, -1, 0,
        1, -1, 0, -1, -1, 0,
      ]);
      boundaryGeo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      const boundaryMat = new THREE.RawShaderMaterial({
        vertexShader: BOUNDARY_LINE_VERT,
        fragmentShader: ADVECTION_FRAG,
        uniforms: this.uniforms,
      });
      this.line = new THREE.LineSegments(boundaryGeo, boundaryMat);
      this.scene.add(this.line);
    }

    update({ dt, isBounce, BFECC }) {
      this.uniforms.dt.value = dt;
      this.line.visible = isBounce;
      this.uniforms.isBFECC.value = BFECC;
      super.update();
    }
  }

  class FluidMouseInput {
    constructor(sizes, idleState) {
      this.sizes = sizes;
      this.idleState = idleState;
      this.coords = new THREE.Vector2();
      this.coordsOld = new THREE.Vector2();
      this.diff = new THREE.Vector2();
      this.hasPointerEvent = false;
      this.wasIdle = false;

      this._onMouseMove = (e) => {
        this.setCoords(e.clientX, e.clientY);
      };
      this._onTouch = (e) => {
        if (!e.touches || !e.touches.length) return;
        this.setCoords(e.touches[0].clientX, e.touches[0].clientY);
      };

      window.addEventListener("mousemove", this._onMouseMove, false);
      window.addEventListener("touchstart", this._onTouch, { passive: true });
      window.addEventListener("touchmove", this._onTouch, { passive: true });
    }

    setCoords(clientX, clientY) {
      const ndc = mapClientToCanvasNDC(clientX, clientY, this.sizes);
      this.coords.set(ndc.x, ndc.y);
      if (!this.hasPointerEvent || this.wasIdle) {
        this.coordsOld.copy(this.coords);
        this.hasPointerEvent = true;
        this.wasIdle = false;
      }
    }

    update() {
      if (this.idleState.isMoving) {
        if (this.wasIdle) {
          this.coordsOld.copy(this.coords);
          this.wasIdle = false;
        }
        this.diff.subVectors(this.coords, this.coordsOld);
        this.coordsOld.copy(this.coords);
        if (this.coordsOld.x === 0 && this.coordsOld.y === 0) {
          this.diff.set(0, 0);
        }
      } else {
        this.wasIdle = true;
        this.coords.copy(this.idleState.idleCursor);
        this.diff.subVectors(this.coords, this.coordsOld);
        this.coordsOld.copy(this.coords);
      }
    }
  }

  class ExternalForcePass extends ShaderPass {
    constructor(renderer, mouseInput, simProps) {
      super(renderer, { output: simProps.dst });
      this.mouseInput = mouseInput;
      this.init(simProps);
    }

    init(simProps) {
      super.init();
      const geo = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.RawShaderMaterial({
        vertexShader: EXTERNAL_FORCE_VERT,
        fragmentShader: EXTERNAL_FORCE_FRAG,
        blending: THREE.AdditiveBlending,
        uniforms: {
          px: { value: simProps.cellScale },
          force: { value: new THREE.Vector2(0, 0) },
          center: { value: new THREE.Vector2(0, 0) },
          scale: { value: new THREE.Vector2(simProps.cursor_size, simProps.cursor_size) },
        },
      });
      this.mouseMesh = new THREE.Mesh(geo, mat);
      this.scene.add(this.mouseMesh);
    }

    update(params) {
      this.mouseInput.update();
      const forceX = (this.mouseInput.diff.x / 2) * params.mouse_force;
      const forceY = (this.mouseInput.diff.y / 2) * params.mouse_force;
      const cursorSizeX = params.cursor_size * params.cellScale.x;
      const cursorSizeY = params.cursor_size * params.cellScale.y;

      const centerX = Math.min(
        Math.max(this.mouseInput.coords.x, -1 + cursorSizeX + params.cellScale.x * 2),
        1 - cursorSizeX - params.cellScale.x * 2
      );
      const centerY = Math.min(
        Math.max(this.mouseInput.coords.y, -1 + cursorSizeY + params.cellScale.y * 2),
        1 - cursorSizeY - params.cellScale.y * 2
      );

      const u = this.mouseMesh.material.uniforms;
      u.force.value.set(forceX, forceY);
      u.center.value.set(centerX, centerY);
      u.scale.value.set(params.cursor_size, params.cursor_size);
      super.update();
    }
  }

  class ViscousPass extends ShaderPass {
    constructor(renderer, simProps) {
      super(renderer, {
        material: {
          vertexShader: FACE_VERT,
          fragmentShader: VISCOUS_FRAG,
          uniforms: {
            boundarySpace: { value: simProps.boundarySpace },
            velocity: { value: simProps.src.texture },
            velocity_new: { value: simProps.dst_.texture },
            v: { value: simProps.viscous },
            px: { value: simProps.cellScale },
            dt: { value: simProps.dt },
          },
        },
        output: simProps.dst,
        output0: simProps.dst_,
        output1: simProps.dst,
      });
      this.init();
    }

    update({ viscous, iterations, dt }) {
      let fboIn;
      let fboOut;
      this.uniforms.v.value = viscous;
      for (let i = 0; i < iterations; i++) {
        if (i % 2 === 0) {
          fboIn = this.props.output0;
          fboOut = this.props.output1;
        } else {
          fboIn = this.props.output1;
          fboOut = this.props.output0;
        }
        this.uniforms.velocity_new.value = fboIn.texture;
        this.props.output = fboOut;
        this.uniforms.dt.value = dt;
        super.update();
      }
      return fboOut;
    }
  }

  class DivergencePass extends ShaderPass {
    constructor(renderer, simProps) {
      super(renderer, {
        material: {
          vertexShader: FACE_VERT,
          fragmentShader: DIVERGENCE_FRAG,
          uniforms: {
            boundarySpace: { value: simProps.boundarySpace },
            velocity: { value: simProps.src.texture },
            px: { value: simProps.cellScale },
            dt: { value: simProps.dt },
          },
        },
        output: simProps.dst,
      });
      this.init();
    }

    update({ vel }) {
      this.uniforms.velocity.value = vel.texture;
      super.update();
    }
  }

  class PoissonPass extends ShaderPass {
    constructor(renderer, simProps) {
      super(renderer, {
        material: {
          vertexShader: FACE_VERT,
          fragmentShader: POISSON_FRAG,
          uniforms: {
            boundarySpace: { value: simProps.boundarySpace },
            pressure: { value: simProps.dst_.texture },
            divergence: { value: simProps.src.texture },
            px: { value: simProps.cellScale },
            straightness: { value: simProps.straightness },
          },
        },
        output: simProps.dst,
        output0: simProps.dst_,
        output1: simProps.dst,
      });
      this.init();
    }

    update({ iterations }) {
      let pIn;
      let pOut;
      for (let i = 0; i < iterations; i++) {
        if (i % 2 === 0) {
          pIn = this.props.output0;
          pOut = this.props.output1;
        } else {
          pIn = this.props.output1;
          pOut = this.props.output0;
        }
        this.uniforms.pressure.value = pIn.texture;
        this.props.output = pOut;
        super.update();
      }
      return pOut;
    }
  }

  class PressurePass extends ShaderPass {
    constructor(renderer, simProps) {
      super(renderer, {
        material: {
          vertexShader: FACE_VERT,
          fragmentShader: PRESSURE_FRAG,
          uniforms: {
            boundarySpace: { value: simProps.boundarySpace },
            pressure: { value: simProps.src_p.texture },
            velocity: { value: simProps.src_v.texture },
            px: { value: simProps.cellScale },
            dt: { value: simProps.dt },
          },
        },
        output: simProps.dst,
      });
      this.init();
    }

    update({ vel, pressure }) {
      this.uniforms.velocity.value = vel.texture;
      this.uniforms.pressure.value = pressure.texture;
      super.update();
    }
  }

  class FluidSimulation {
    constructor(renderer, sizes, mouseInput) {
      this.renderer = renderer;
      this.sizes = sizes;
      this.mouseInput = mouseInput;
      const preset = CURRENT_QUALITY_PRESET || QUALITY_PRESETS.medium;
      this.options = {
        ...LIQUID_CONFIG.fluid,
        resolution: preset.fluidRes,
        iterations_poisson: preset.fluidPoisson,
        BFECC: preset.fluidBfecc,
      };

      this.fbos = {
        vel_0: null,
        vel_1: null,
        vel_viscous0: null,
        vel_viscous1: null,
        div: null,
        pressure_0: null,
        pressure_1: null,
      };
      this.fboSize = new THREE.Vector2();
      this.cellScale = new THREE.Vector2();
      this.boundarySpace = new THREE.Vector2();

      this.calcSize();
      this.createAllFBOs();
      this.createShaderPasses();
    }

    createAllFBOs() {
      const isIOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent);
      const glCtx = this.renderer.getContext();
      const supportsFloat = Boolean(glCtx && glCtx.getExtension("EXT_color_buffer_float"));
      const fboType = isIOS || !supportsFloat ? THREE.HalfFloatType : THREE.FloatType;

      for (const key in this.fbos) {
        this.fbos[key] = new THREE.WebGLRenderTarget(this.fboSize.x, this.fboSize.y, {
          type: fboType,
        });
      }
    }

    createShaderPasses() {
      this.advection = new AdvectionPass(this.renderer, {
        cellScale: this.cellScale,
        fboSize: this.fboSize,
        dt: this.options.dt,
        src: this.fbos.vel_0,
        dst: this.fbos.vel_1,
        dissipation: this.options.dissipation,
      });

      this.externalForce = new ExternalForcePass(this.renderer, this.mouseInput, {
        cellScale: this.cellScale,
        cursor_size: this.options.cursor_size,
        dst: this.fbos.vel_1,
      });

      this.viscous = new ViscousPass(this.renderer, {
        cellScale: this.cellScale,
        boundarySpace: this.boundarySpace,
        viscous: this.options.viscous,
        src: this.fbos.vel_1,
        dst: this.fbos.vel_viscous1,
        dst_: this.fbos.vel_viscous0,
        dt: this.options.dt,
      });

      this.divergence = new DivergencePass(this.renderer, {
        cellScale: this.cellScale,
        boundarySpace: this.boundarySpace,
        src: this.fbos.vel_viscous0,
        dst: this.fbos.div,
        dt: this.options.dt,
      });

      this.poisson = new PoissonPass(this.renderer, {
        cellScale: this.cellScale,
        boundarySpace: this.boundarySpace,
        straightness: this.options.straightness,
        src: this.fbos.div,
        dst: this.fbos.pressure_1,
        dst_: this.fbos.pressure_0,
      });

      this.pressure = new PressurePass(this.renderer, {
        cellScale: this.cellScale,
        boundarySpace: this.boundarySpace,
        src_p: this.fbos.pressure_0,
        src_v: this.fbos.vel_viscous0,
        dst: this.fbos.vel_0,
        dt: this.options.dt,
      });
    }

    calcSize() {
      const baseW = this.sizes.renderWidth || Math.round(this.sizes.width * (this.sizes.pixelRatio || 1));
      const baseH = this.sizes.renderHeight || Math.round(this.sizes.height * (this.sizes.pixelRatio || 1));
      const w = Math.max(1, Math.round(this.options.resolution * baseW));
      const h = Math.max(1, Math.round(this.options.resolution * baseH));
      let cellScaleX = 1 / w;
      let cellScaleY = 1 / h;
      cellScaleX *= w / (1100 * this.options.resolution);
      cellScaleY *= w / (1100 * this.options.resolution);
      this.cellScale.set(cellScaleX, cellScaleY);
      this.fboSize.set(w, h);
    }

    resize() {
      this.calcSize();
      for (const key in this.fbos) {
        this.fbos[key].setSize(this.fboSize.x, this.fboSize.y);
      }
    }

    update() {
      if (this.options.isBounce) {
        this.boundarySpace.set(0, 0);
      } else {
        this.boundarySpace.copy(this.cellScale);
      }

      this.advection.update(this.options);
      this.externalForce.update({
        cursor_size: this.options.cursor_size,
        mouse_force: this.options.mouse_force,
        cellScale: this.cellScale,
      });

      let velTarget = this.fbos.vel_1;
      if (this.options.isViscous) {
        velTarget = this.viscous.update({
          viscous: this.options.viscous,
          iterations: this.options.iterations_viscous,
          dt: this.options.dt,
        });
      }

      this.divergence.update({ vel: velTarget });
      const pressureTarget = this.poisson.update({ iterations: this.options.iterations_poisson });
      this.pressure.update({ vel: velTarget, pressure: pressureTarget });
    }
  }

  class FluidCursor {
    constructor(renderer, sizes, mouse, idleState) {
      this.renderer = renderer;
      this.sizes = sizes;
      this.mouseInput = new FluidMouseInput(sizes, idleState);
      this.simulation = new FluidSimulation(renderer, sizes, this.mouseInput);

      this.scene = new THREE.Scene();
      this.camera = new THREE.Camera();
      this.output = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.RawShaderMaterial({
          vertexShader: FACE_VERT,
          fragmentShader: FLUID_OUTPUT_FRAG,
          uniforms: {
            velocity: { value: this.simulation.fbos.vel_0.texture },
            boundarySpace: { value: new THREE.Vector2() },
          },
        })
      );
      this.scene.add(this.output);

      // Adaptive fluid mask target sized by active processor quality preset
      const preset = CURRENT_QUALITY_PRESET || QUALITY_PRESETS.medium;
      this.sourceTarget = new THREE.WebGLRenderTarget(preset.fluidTargetW, preset.fluidTargetH, { samples: 0 });
      this.clock = new THREE.Clock();
    }

    applyQualityPreset(preset) {
      if (!preset) return;
      this.simulation.options.resolution = preset.fluidRes;
      this.simulation.options.iterations_poisson = preset.fluidPoisson;
      this.simulation.options.BFECC = preset.fluidBfecc;
      this.simulation.resize();
      this.sourceTarget.setSize(preset.fluidTargetW, preset.fluidTargetH);
    }

    resize() {
      this.simulation.resize();
    }

    update() {
      // Run natively at the user's screen refresh rate (60Hz, 90Hz, 120Hz, 144Hz, 240Hz) without 60fps frame-skipping judder!
      const frameDt = Math.min(this.clock.getDelta(), 1 / 30);
      this.simulation.options.dt = Math.max(0.004, Math.min(0.018, frameDt * 0.85));
      this.simulation.update();
      this.renderer.setRenderTarget(this.sourceTarget);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }
  }

  // =========================================================================
  // Topographic Simplex Noise Background Pass
  // =========================================================================

  class BackgroundNoisePass {
    constructor(renderer, sizes, mouse) {
      this.renderer = renderer;
      this.sizes = sizes;
      const cfg = LIQUID_CONFIG.headScene;

      this.easedMouse = {
        normalized: mouse.createEasedNormalized(0.025),
        pace: mouse.createEasedPace(0.01),
      };

      this.scene = new THREE.Scene();
      this.camera = new THREE.Camera();
      this.mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          uniforms: {
            uAspect: new THREE.Uniform(this.sizes.width / this.sizes.height),
            uTime: new THREE.Uniform(0),
            uMouseCoords: new THREE.Uniform(this.easedMouse.normalized.value),
            uMousePace: new THREE.Uniform(0),
            uReveal: new THREE.Uniform(1),
            SCALE: new THREE.Uniform(cfg.SCALE),
            SPEED: new THREE.Uniform(cfg.SPEED),
            DISTORT_SCALE: new THREE.Uniform(cfg.DISTORT_SCALE),
            DISTORT_INTENSITY: new THREE.Uniform(cfg.DISTORT_INTENSITY),
            NOISE_DETAIL: new THREE.Uniform(cfg.NOISE_DETAIL),
            CURSOR_INTENSITY: new THREE.Uniform(cfg.CURSOR_INTENSITY),
            CURSOR_SCALE: new THREE.Uniform(cfg.CURSOR_SCALE),
            CURSOR_BOUNCE: new THREE.Uniform(cfg.CURSOR_BOUNCE),
            REVEAL_SIZE: new THREE.Uniform(cfg.REVEAL_SIZE),
          },
          vertexShader: BACKGROUND_NOISE_VERT,
          fragmentShader: BACKGROUND_NOISE_FRAG,
        })
      );
      this.scene.add(this.mesh);
      const noiseW = Math.max(1, this.sizes.renderWidth || 1366);
      const noiseH = Math.max(1, this.sizes.renderHeight || 768);
      this.renderTarget = new THREE.WebGLRenderTarget(noiseW, noiseH, { samples: 0 });
      this.frameSkip = 0;
    }

    resize() {
      const noiseW = Math.max(1, this.sizes.renderWidth || 1366);
      const noiseH = Math.max(1, this.sizes.renderHeight || 768);
      this.renderTarget.setSize(noiseW, noiseH);
    }

    update(elapsed, delta) {
      this.easedMouse.normalized.update(delta);
      this.easedMouse.pace.update(delta);

      // Update slow-moving background simplex noise at 30fps instead of 60fps to halve shader load
      this.frameSkip = (this.frameSkip + 1) % 2;
      if (this.frameSkip !== 0 && elapsed > 0.2) return;

      const u = this.mesh.material.uniforms;
      u.uTime.value = elapsed;
      u.uMouseCoords.value = this.easedMouse.normalized.value;
      u.uMousePace.value = this.easedMouse.pace.value.default * 4;
      u.uAspect.value = this.sizes.width / this.sizes.height;

      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }
  }

  // =========================================================================
  // 2.5D Marcos Siqueira Portrait & 3D Ranger Layers
  // =========================================================================

  function createExtendedCharacterGeometry(segs) {
    const geo = new THREE.PlaneGeometry(1, 1, segs, segs);
    const pos = geo.attributes.position;
    if (pos && pos.array) {
      const arr = pos.array;
      for (let i = 0; i < arr.length; i += 3) {
        const y = arr[i + 1];
        // Smoothly extend the lower blazer/torso hem (y < -0.38) downward so when the character
        // recedes into the background on mobile scroll, his body never shows a horizontal cut-off edge.
        if (y < -0.38) {
          const t = (-0.38 - y) / 0.12;
          arr[i + 1] = y - t * (0.20 + 0.16 * t);
        }
      }
      pos.needsUpdate = true;
    }
    return geo;
  }

  class MarcosPortrait {
    constructor(assets, mouse, sizes, camera) {
      this.sizes = sizes;
      this.intensity = 0.075;
      this.mouse = {
        normalized: mouse.createEasedNormalized(0.025),
      };

      const portraitSegs = (CURRENT_QUALITY_PRESET || QUALITY_PRESETS.medium).portraitSegs;
      this.currentSegs = portraitSegs;
      this.geometry = createExtendedCharacterGeometry(portraitSegs);
      this.material = new THREE.MeshStandardMaterial({
        displacementMap: assets.textures.head.depth,
        displacementScale: 0.25,
        alphaMap: assets.textures.head.alpha,
        transparent: true,
        normalMap: assets.textures.head.normal,
      });

      this.uniforms = {
        uProjectorMatrix: new THREE.Uniform(camera.projectionMatrix),
        uProjectorViewMatrix: new THREE.Uniform(camera.matrixWorldInverse),
        uHelmetHover: new THREE.Uniform(0),
        tCursorEffect: new THREE.Uniform(null),
        tDefaultDiffuse: new THREE.Uniform(assets.textures.head.diffuse),
        tShadowDiffuse: new THREE.Uniform(assets.textures.head.shadow),
      };

      this.material.customProgramCacheKey = () => "marcos-portrait";
      this.material.onBeforeCompile = (shader) => {
        shader.defines.USE_UV = "";
        Object.assign(shader.uniforms, this.uniforms);

        shader.vertexShader = shader.vertexShader
          .replace(
            "varying vec3 vViewPosition;",
            `
            uniform mat4 uProjectorMatrix;
            uniform mat4 uProjectorViewMatrix;
            varying vec3 vViewPosition;
            varying vec4 vTexCoords;
            varying vec3 worldPosition;
            `
          )
          .replace(
            "#include <fog_vertex>",
            `
            #include <fog_vertex>
            vTexCoords = projectionMatrix * mvPosition;
            `
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `
            #include <common>
            varying vec4 vTexCoords;
            uniform float uHelmetHover;
            uniform sampler2D tCursorEffect;
            uniform sampler2D tDefaultDiffuse;
            uniform sampler2D tShadowDiffuse;
            `
          )
          .replace(
            "vec4 diffuseColor = vec4( diffuse, opacity );",
            `
            vec2 cameraUv = vTexCoords.xy / vTexCoords.w;
            cameraUv = cameraUv * 0.5 + 0.5;

            float hoverTransition = cameraUv.y + sin(cameraUv.x * PI) * sin(uHelmetHover * PI) * 0.2;

            vec4 textureCursorEffect = texture2D(tCursorEffect, vec2(cameraUv.x, 0.025 + cameraUv.y * 0.95));
            textureCursorEffect.rgb = 1.0 - textureCursorEffect.rgb;
            float cursorEffect = step(0.1, textureCursorEffect.r);

            vec4 textureDefaultDiffuse = texture2D(tDefaultDiffuse, vUv);
            vec4 textureShadowDiffuse = texture2D(tShadowDiffuse, vUv);

            vec3 color = mix(
              textureDefaultDiffuse.rgb,
              textureShadowDiffuse.rgb,
              min(cursorEffect + step(1.0 - hoverTransition, uHelmetHover), 1.0)
            );
            vec4 diffuseColor = vec4(color, opacity);
            `
          );
      };

      this.instance = new THREE.Mesh(this.geometry, this.material);
    }

    setGeometrySegments(segs) {
      if (!segs || this.currentSegs === segs) return;
      this.currentSegs = segs;
      const oldGeo = this.geometry;
      this.geometry = createExtendedCharacterGeometry(segs);
      this.instance.geometry = this.geometry;
      if (oldGeo && typeof oldGeo.dispose === "function") {
        oldGeo.dispose();
      }
    }

    update(delta, revealFactor, fluidTexture) {
      this.mouse.normalized.update(delta);
      this.instance.rotation.y = this.mouse.normalized.value.x * this.intensity * revealFactor;
      if (this.sizes.width > 768) {
        this.instance.rotation.x = -this.mouse.normalized.value.y * this.intensity * revealFactor;
      } else {
        this.instance.rotation.x = 0;
      }
      this.uniforms.tCursorEffect.value = fluidTexture;
    }
  }

  class RangerCharacter {
    constructor(renderer, sizes, assets) {
      this.renderer = renderer;
      this.sizes = sizes;
      const portraitSegs = (CURRENT_QUALITY_PRESET || QUALITY_PRESETS.medium).portraitSegs;
      this.currentSegs = portraitSegs;
      this.geometry = createExtendedCharacterGeometry(portraitSegs);
      this.material = new THREE.MeshStandardMaterial({
        map: assets.textures.ranger.diffuse,
        displacementMap: assets.textures.ranger.depth,
        displacementScale: 0.25,
        alphaMap: assets.textures.ranger.alpha,
        transparent: true,
        side: THREE.DoubleSide,
        normalMap: assets.textures.ranger.normal,
        roughness: 0.35,
        metalness: 0.2,
      });

      this.instance = new THREE.Mesh(this.geometry, this.material);
      this.scene = new THREE.Scene();
      this.scene.add(this.instance);

      this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x000000, 1.9);
      this.pointLight = new THREE.PointLight(0xffffff, 1.95);
      this.pointLight.position.set(-0.75, 0.2, 0.4);
      this.scene.add(this.hemisphereLight, this.pointLight);

      this.renderTarget = new THREE.WebGLRenderTarget(
        this.sizes.width * this.sizes.pixelRatio,
        this.sizes.height * this.sizes.pixelRatio,
        { samples: 0 }
      );
    }

    resize() {
      this.renderTarget.setSize(
        this.sizes.width * this.sizes.pixelRatio,
        this.sizes.height * this.sizes.pixelRatio
      );
    }

    setGeometrySegments(segs) {
      if (!segs || this.currentSegs === segs) return;
      this.currentSegs = segs;
      const oldGeo = this.geometry;
      this.geometry = createExtendedCharacterGeometry(segs);
      this.instance.geometry = this.geometry;
      if (oldGeo && typeof oldGeo.dispose === "function") {
        oldGeo.dispose();
      }
    }

    setVariant(variant) {
      if (!variant) return;
      this.material.map = variant.diffuse;
      this.material.alphaMap = variant.alpha;
      this.material.needsUpdate = true;
    }

    update(camera, headMesh) {
      this.instance.position.copy(headMesh.position);
      this.instance.rotation.copy(headMesh.rotation);
      this.instance.scale.copy(headMesh.scale);

      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.clear();
      this.renderer.render(this.scene, camera);
    }
  }

  // =========================================================================
  // Ranger Profiles — Gamified High-Tech 50-30-10 Color System
  // - 50-60% Base: Deep Cyber Obsidian (#060916)
  // - 30% Structural Frame (frameHex): Cyber Tech Blue / Indigo / Tactical HUD
  // - 10% Pattern-Breaker (accentHex): High-voltage Neon contrast for CTAs & active states
  // =========================================================================

  const RANGER_PROFILES = {
    black: {
      name: "RANGER PRETO",
      accentHex: "#00E5FF",
      secondaryHex: "#FF2E93",
      frameHex: "#272E3F",
      pillFg: "#00E5FF",
      gtaStops: ["#1E1038", "#6B1D7A", "#D91C70", "#FF5E3A", "#FFA600"],
      bevelTop: "#00E5FF",
      bevelBot: "#FF2E93",
      sideTint: "#2A1245",
      waveHex: "#161A24",
      outlineHex: "#00E5FF",
      suitHex: "#1E2430",
      tintMix: 0.0,
    },
    red: {
      name: "RANGER VERMELHO",
      accentHex: "#FF2A54",
      secondaryHex: "#FFB800",
      frameHex: "#FF2A54",
      pillFg: "#FF2A54",
      gtaStops: ["#3B0828", "#9E0E40", "#FF1E4D", "#FF5E1A", "#FFC400"],
      bevelTop: "#FF2A54",
      bevelBot: "#FFB800",
      sideTint: "#3D0A24",
      waveHex: "#1C141B",
      outlineHex: "#FF2A54",
      suitHex: "#FF1E38",
      tintMix: 0.94,
    },
    blue: {
      name: "RANGER AZUL",
      accentHex: "#00E5FF",
      secondaryHex: "#FF2E93",
      frameHex: "#00B4FF",
      pillFg: "#00E5FF",
      gtaStops: ["#0A1E5E", "#0066CC", "#00B4FF", "#7B2CBF", "#FF2E93"],
      bevelTop: "#00F0FF",
      bevelBot: "#FF2E93",
      sideTint: "#102052",
      waveHex: "#121B2A",
      outlineHex: "#00E5FF",
      suitHex: "#0088FF",
      tintMix: 0.94,
    },
    green: {
      name: "RANGER VERDE",
      accentHex: "#00F59B",
      secondaryHex: "#00E5FF",
      frameHex: "#00F59B",
      pillFg: "#00F59B",
      gtaStops: ["#072E33", "#097A5E", "#00D68F", "#00E5FF", "#A8FF3E"],
      bevelTop: "#00F59B",
      bevelBot: "#00E5FF",
      sideTint: "#09332C",
      waveHex: "#111F1D",
      outlineHex: "#00F59B",
      suitHex: "#00E676",
      tintMix: 0.94,
    },
    yellow: {
      name: "RANGER AMARELO",
      accentHex: "#FFC800",
      secondaryHex: "#FF2E93",
      frameHex: "#FFC800",
      pillFg: "#FFC800",
      gtaStops: ["#4A0E4E", "#B5176E", "#FF4D2A", "#FF9500", "#FFE000"],
      bevelTop: "#FFE000",
      bevelBot: "#FF2E93",
      sideTint: "#3D123A",
      waveHex: "#201D14",
      outlineHex: "#FFC800",
      suitHex: "#FFC400",
      tintMix: 0.94,
    },
    pink: {
      name: "RANGER ROSA",
      accentHex: "#FF2E93",
      secondaryHex: "#00E5FF",
      frameHex: "#FF2E93",
      pillFg: "#FF2E93",
      gtaStops: ["#300B54", "#8A1478", "#FF1E8A", "#FF6633", "#FFC837"],
      bevelTop: "#00F0FF",
      bevelBot: "#FF2E93",
      sideTint: "#330D4A",
      waveHex: "#201320",
      outlineHex: "#FF2E93",
      suitHex: "#FF207E",
      tintMix: 0.94,
    },
    silver: {
      name: "RANGER PRATA",
      accentHex: "#00E5FF",
      secondaryHex: "#FF2E93",
      frameHex: "#00E5FF",
      pillFg: "#00E5FF",
      // Iconic GTA VI Vice City Sunset Gradient (Deep Twilight Violet -> Hot Neon Magenta -> Sunset Orange -> Horizon Gold)
      // framed by Electric Cyan & Chrome chiseled 3D bevels
      gtaStops: ["#3B1066", "#9E1982", "#FF247F", "#FF662A", "#FFB800"],
      bevelTop: "#00F0FF",
      bevelBot: "#FF2E93",
      sideTint: "#280D42",
      waveHex: "#161C28",
      outlineHex: "#00E5FF",
      suitHex: "#D0DCE8",
      tintMix: 0.0,
    },
  };

  // =========================================================================
  // Main Liquid Hero Scene & Composition Pipeline
  // =========================================================================

  class LiquidHeroScene {
    constructor(renderer, sizes, mouse, assets, fluidCursor, backgroundNoise) {
      this.renderer = renderer;
      this.sizes = sizes;
      this.mouse = mouse;
      this.assets = assets;
      this.fluidCursor = fluidCursor;
      this.backgroundNoise = backgroundNoise;

      this.activeRangerKey = "silver";
      this.helmetRevealValue = 1;
      this.easedMouse = {
        normalized: mouse.createEasedNormalized(0.025),
      };

      const TextureCtor = (assets && assets.textures && assets.textures.head && assets.textures.head.diffuse)
        ? assets.textures.head.diffuse.constructor
        : null;
      if (TextureCtor) {
        window.THREE.Texture = TextureCtor;
        window.THREE.CanvasTexture = TextureCtor;
      }

      this.titleCanvas = document.createElement("canvas");
      this.titleCanvas.width = 2048;
      this.titleCanvas.height = 1024;
      this.titleTexture = new TextureCtor(this.titleCanvas);
      this.titleTexture.minFilter = THREE.LinearFilter;
      this.titleTexture.magFilter = THREE.LinearFilter;
      this.titleTexture.needsUpdate = true;
      this.drawTitleSign();

      // 3º Plano: Dedicated Transparent Palm Trees Layer Texture (generated ONCE at 2048x768, never regenerated on quality change!)
      this.palmsCanvas = document.createElement("canvas");
      this.palmsCanvas.width = 2048;
      this.palmsCanvas.height = 768;
      this.palmsTexture = new TextureCtor(this.palmsCanvas);
      this.palmsTexture.minFilter = THREE.LinearFilter;
      this.palmsTexture.magFilter = THREE.LinearFilter;
      this.drawRetrowavePalmsLayer();
      this.palmsTexture.needsUpdate = true;

      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          this.drawTitleSign();
          if (typeof this.updateLetterTextures === "function") {
            this.updateLetterTextures(this.activeRangerKey);
          }
        });
      }

      const cfg = LIQUID_CONFIG.headScene;
      this.compositionMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.ShaderMaterial({
          transparent: true,
          uniforms: {
            uAspect: new THREE.Uniform(this.sizes.width / this.sizes.height),
            uTime: new THREE.Uniform(0),
            uReveal: new THREE.Uniform(1),
            uColorHover: new THREE.Uniform(toSRGBColor(cfg.COLOR_FOREGROUND)),
            uHover: new THREE.Uniform(0),
            uHelmetHover: new THREE.Uniform(0),
            uFilter: new THREE.Uniform(0),
            uCursorIntensity: new THREE.Uniform(1),
            tDefaultDiffuse: new THREE.Uniform(null),
            tHelmet: new THREE.Uniform(null),
            tCursorEffect: new THREE.Uniform(null),
            tBackgroundNoise: new THREE.Uniform(null),
            tNoise: new THREE.Uniform(assets.textures.noise.texture),
            tTitleText: new THREE.Uniform(this.titleTexture),
            tPalmsLayer: new THREE.Uniform(this.palmsTexture),
            uMouseParallax: new THREE.Uniform(new THREE.Vector2(0, 0)),
            uRangerColor: new THREE.Uniform(toSRGBColor("#1C2018")),
            uRangerTintMix: new THREE.Uniform(0.0),
            uQualityLevel: new THREE.Uniform((CURRENT_QUALITY_PRESET || QUALITY_PRESETS.medium).shaderQuality),
            OUTLINE: new THREE.Uniform(cfg.OUTLINE),
            SHOW_HELMET_PERMANENTLY: new THREE.Uniform(cfg.SHOW_HELMET_PERMANENTLY),
            THICKNESS: new THREE.Uniform(cfg.THICKNESS),
            COLOR_OUTLINE: new THREE.Uniform(toSRGBColor(cfg.COLOR_OUTLINE)),
            COLOR_FOREGROUND: new THREE.Uniform(toSRGBColor(cfg.COLOR_FOREGROUND)),
            COLOR_BACKGROUND: new THREE.Uniform(toSRGBColor(cfg.COLOR_BACKGROUND)),
            COLOR_CURSOR_FOREGROUND: new THREE.Uniform(toSRGBColor(cfg.COLOR_CURSOR_FOREGROUND)),
            COLOR_CURSOR_BACKGROUND: new THREE.Uniform(toSRGBColor(cfg.COLOR_CURSOR_BACKGROUND)),
            COLOR_CURSOR_OUTLINE: new THREE.Uniform(toSRGBColor(cfg.COLOR_CURSOR_OUTLINE)),
            COLOR_FILTER: new THREE.Uniform(toSRGBColor(cfg.COLOR_FILTER)),
            REVEAL_SIZE: new THREE.Uniform(cfg.REVEAL_SIZE),
          },
          vertexShader: COMPOSITION_VERT,
          fragmentShader: COMPOSITION_FRAG,
        })
      );

      this.defaultScene = new THREE.Scene();
      this.defaultRenderTarget = new THREE.WebGLRenderTarget(
        this.sizes.width * this.sizes.pixelRatio,
        this.sizes.height * this.sizes.pixelRatio,
        { samples: 0 }
      );

      this.cameraTransformGroup = new THREE.Group();
      this.camera = new THREE.PerspectiveCamera(15, this.sizes.width / this.sizes.height, 0.1, 1000);
      this.cameraTransformGroup.add(this.camera);
      this.defaultScene.add(this.cameraTransformGroup);

      this.head = new MarcosPortrait(assets, mouse, sizes, this.camera);
      this.defaultScene.add(this.head.instance);

      this.helmet = new RangerCharacter(renderer, sizes, assets);

      this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x000000, 1.85);
      this.pointLight = new THREE.PointLight(0xffffff, 1.9);
      this.pointLight.position.set(-0.75, 0.2, 0.4);
      this.defaultScene.add(this.hemisphereLight, this.pointLight);

      this.init3DLetters();
      this.applyResponsive();
      this.bindUIControls();
      this.setRanger("silver", { pulseMorph: false });
    }

    init3DLetters() {
      if (this.lettersGroup) {
        if (this.letterItems && this.letterItems.length) {
          this.letterItems.forEach((item) => {
            if (item.tex && typeof item.tex.dispose === "function") item.tex.dispose();
            if (item.sideTex && typeof item.sideTex.dispose === "function") item.sideTex.dispose();
            if (item.faceMat && typeof item.faceMat.dispose === "function") item.faceMat.dispose();
            if (item.sideMat && typeof item.sideMat.dispose === "function") item.sideMat.dispose();
          });
        }
        if (this.sharedLetterPlaneGeo && typeof this.sharedLetterPlaneGeo.dispose === "function") {
          this.sharedLetterPlaneGeo.dispose();
        }
        this.defaultScene.remove(this.lettersGroup);
      }

      const preset = CURRENT_QUALITY_PRESET || QUALITY_PRESETS.medium;
      this.letterItems = [];
      this.lettersPauseUntil = 0;
      this.lettersGroup = new THREE.Group();
      this.lettersGroup.position.set(0, 0, -0.18);
      this.defaultScene.add(this.lettersGroup);

      // GTA VI "grand theft auto" (Pricedown) Custom 3D Block Lockup
      // Tight, touching heavy-outline letter spacing matching the official GTA logo
      const rows = [
        { text: "MARCOS", y: 0.22, spacing: 0.108 },
        { text: "SIQUEIRA", y: 0.04, spacing: 0.098 },
      ];

      const getGlyphAdvanceFactor = (ch) => {
        if (ch === "I") return 0.56;
        if (ch === "M") return 1.24;
        if (ch === "R") return 0.90;
        return 0.96;
      };

      const planeGeo = new THREE.PlaneGeometry(0.19, 0.23);
      this.sharedLetterPlaneGeo = planeGeo;
      const totalDepth = 0.045;
      const sliceCount = Math.max(4, preset.letterSlices || 12);
      const texRes = preset.letterTexRes || 512;

      rows.forEach((row) => {
        const chars = row.text.split("");
        const advances = chars.map((ch) => row.spacing * getGlyphAdvanceFactor(ch));
        let totalW = 0;
        for (let i = 0; i < chars.length - 1; i++) {
          totalW += (advances[i] + advances[i + 1]) * 0.5;
        }
        let cursorX = -totalW * 0.5;

        chars.forEach((char, i) => {
          if (i > 0) {
            cursorX += (advances[i - 1] + advances[i]) * 0.5;
          }
          const posX = cursorX;
          const posY = row.y;

          const TextureCtor = (this.assets && this.assets.textures && this.assets.textures.head && this.assets.textures.head.diffuse)
            ? this.assets.textures.head.diffuse.constructor
            : (window.THREE.Texture || window.THREE.CanvasTexture);

          // 1. Front & Back Face Texture (256px Fraco / 512px Médio / 768px Avançado)
          const canvas = document.createElement("canvas");
          canvas.width = texRes;
          canvas.height = texRes;
          const ctx = canvas.getContext("2d");
          const tex = new TextureCtor(canvas);
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;

          // 2. Solid 3D Extrusion Wall Texture
          const sideCanvas = document.createElement("canvas");
          sideCanvas.width = texRes;
          sideCanvas.height = texRes;
          const sideCtx = sideCanvas.getContext("2d");
          const sideTex = new TextureCtor(sideCanvas);
          sideTex.minFilter = THREE.LinearFilter;
          sideTex.magFilter = THREE.LinearFilter;
          sideTex.colorSpace = THREE.SRGBColorSpace;
          sideTex.needsUpdate = true;

          const faceMat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            alphaTest: 0.35,
            depthWrite: true,
            depthTest: true,
            side: THREE.DoubleSide,
          });

          const sideMat = new THREE.MeshBasicMaterial({
            map: sideTex,
            transparent: true,
            alphaTest: 0.35,
            depthWrite: true,
            depthTest: true,
            side: THREE.DoubleSide,
          });

          // True Solid 3D Extruded Letter Block with Isolated Natural Lighting & Depth Occlusion:
          const letterMesh = new THREE.Group();
          for (let s = 0; s < sliceCount; s++) {
            const t = s / (sliceCount - 1); // 0 (back) -> 1 (front)
            const zPos = (t - 0.5) * totalDepth;
            const isCap = s === 0 || s === sliceCount - 1;
            const sliceMesh = new THREE.Mesh(planeGeo, isCap ? faceMat : sideMat);
            sliceMesh.position.z = zPos;
            letterMesh.add(sliceMesh);
          }

          letterMesh.position.set(posX, posY, 0);
          this.lettersGroup.add(letterMesh);

          this.letterItems.push({
            char,
            canvas,
            ctx,
            tex,
            sideCanvas,
            sideCtx,
            sideTex,
            faceMat,
            sideMat,
            mesh: letterMesh,
            baseX: posX,
            baseY: posY,
            offsetX: 0,
            offsetY: 0,
            offsetZ: 0,
            targetOffsetX: 0,
            targetOffsetY: 0,
            targetOffsetZ: 0,
            scaleBoost: 0,
            targetScaleBoost: 0,
            hoverGlow: 0,
            rotX: 0,
            rotY: 0,
            rotZ: 0,
            targetRotX: 0,
            targetRotY: 0,
            targetRotZ: 0,
            velX: 0,
            velY: 0,
          });
        });
      });

      this.updateLetterTextures(this.activeRangerKey);
      if (!this.letterBindingsAttached) {
        this.letterBindingsAttached = true;
        this.bindLetterInteraction();
      }
    }

    rebuildForQualityPreset(preset) {
      if (!preset) return;
      if (this.compositionMesh && this.compositionMesh.material && this.compositionMesh.material.uniforms.uQualityLevel) {
        this.compositionMesh.material.uniforms.uQualityLevel.value = preset.shaderQuality;
      }
      if (this.head && typeof this.head.setGeometrySegments === "function") {
        this.head.setGeometrySegments(preset.portraitSegs);
      }
      if (this.helmet && typeof this.helmet.setGeometrySegments === "function") {
        this.helmet.setGeometrySegments(preset.portraitSegs);
      }
      // Never redraw or resize palmsCanvas here — palms are generated once at boot!
      this.init3DLetters();
      this.applyResponsive();
    }

    drawGtaPricedownGlyph(ctx, rawChar) {
      const ch = String(rawChar || "").toUpperCase();

      // Helper: adds a rounded rectangle sub-path (clockwise or counter-clockwise for evenodd cutouts)
      const addRoundRect = (x, y, w, h, radii, ccw = false) => {
        const [rTL, rTR, rBR, rBL] = Array.isArray(radii)
          ? radii
          : [radii, radii, radii, radii];
        if (!ccw) {
          ctx.moveTo(x + rTL, y);
          ctx.lineTo(x + w - rTR, y);
          ctx.quadraticCurveTo(x + w, y, x + w, y + rTR);
          ctx.lineTo(x + w, y + h - rBR);
          ctx.quadraticCurveTo(x + w, y + h, x + w - rBR, y + h);
          ctx.lineTo(x + rBL, y + h);
          ctx.quadraticCurveTo(x, y + h, x, y + h - rBL);
          ctx.lineTo(x, y + rTL);
          ctx.quadraticCurveTo(x, y, x + rTL, y);
        } else {
          ctx.moveTo(x + rTL, y);
          ctx.quadraticCurveTo(x, y, x, y + rTL);
          ctx.lineTo(x, y + h - rBL);
          ctx.quadraticCurveTo(x, y + h, x + rBL, y + h);
          ctx.lineTo(x + w - rBR, y + h);
          ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - rBR);
          ctx.lineTo(x + w, y + rTR);
          ctx.quadraticCurveTo(x + w, y, x + w - rTR, y);
          ctx.lineTo(x + rTL, y);
        }
        ctx.closePath();
      };

      ctx.beginPath();

      if (ch === "O") {
        // GTA "o" in "auto": chunky rounded block with narrow vertical capsule slit
        addRoundRect(-56, -68, 112, 142, 34, false);
        addRoundRect(-8, -32, 16, 70, 7, true);
      } else if (ch === "I") {
        // GTA "i": thick vertical stem + chunky rounded top dot
        addRoundRect(-27, -44, 54, 118, 13, false);
        addRoundRect(-27, -90, 54, 36, 13, false);
      } else if (ch === "U") {
        // GTA "u" in "auto": chunky rounded base with narrow vertical top-entry slot
        ctx.moveTo(-44, -68);
        ctx.lineTo(-18, -68);
        ctx.quadraticCurveTo(-8, -68, -8, -58);
        ctx.lineTo(-8, 30);
        ctx.quadraticCurveTo(-8, 38, 0, 38);
        ctx.quadraticCurveTo(8, 38, 8, 30);
        ctx.lineTo(8, -58);
        ctx.quadraticCurveTo(8, -68, 18, -68);
        ctx.lineTo(44, -68);
        ctx.quadraticCurveTo(56, -68, 56, -56);
        ctx.lineTo(56, 42);
        ctx.quadraticCurveTo(56, 74, 24, 74);
        ctx.lineTo(-24, 74);
        ctx.quadraticCurveTo(-56, 74, -56, 42);
        ctx.lineTo(-56, -56);
        ctx.quadraticCurveTo(-56, -68, -44, -68);
        ctx.closePath();
      } else if (ch === "M") {
        // GTA "m" (based on "n" in "grand"): 3 thick pillars with rounded top shoulders & 2 narrow vertical bottom slots
        ctx.moveTo(-64, -68);
        ctx.lineTo(46, -68);
        ctx.quadraticCurveTo(78, -68, 78, -36);
        ctx.lineTo(78, 62);
        ctx.quadraticCurveTo(78, 74, 66, 74);
        ctx.lineTo(42, 74);
        ctx.quadraticCurveTo(32, 74, 32, 64);
        ctx.lineTo(32, -22);
        ctx.quadraticCurveTo(32, -30, 25, -30);
        ctx.quadraticCurveTo(18, -30, 18, -22);
        ctx.lineTo(18, 64);
        ctx.quadraticCurveTo(18, 74, 8, 74);
        ctx.lineTo(-8, 74);
        ctx.quadraticCurveTo(-18, 74, -18, 64);
        ctx.lineTo(-18, -22);
        ctx.quadraticCurveTo(-18, -30, -25, -30);
        ctx.quadraticCurveTo(-32, -30, -32, -22);
        ctx.lineTo(-32, 64);
        ctx.quadraticCurveTo(-32, 74, -42, 74);
        ctx.lineTo(-66, 74);
        ctx.quadraticCurveTo(-78, 74, -78, 62);
        ctx.lineTo(-78, -54);
        ctx.quadraticCurveTo(-78, -68, -64, -68);
        ctx.closePath();
      } else if (ch === "R") {
        // GTA "r" in "grand": thick left pillar + rounded top-right overhang cap
        ctx.moveTo(-38, -68);
        ctx.lineTo(22, -68);
        ctx.quadraticCurveTo(54, -68, 54, -36);
        ctx.lineTo(54, -18);
        ctx.quadraticCurveTo(54, -6, 42, -6);
        ctx.lineTo(16, -6);
        ctx.quadraticCurveTo(6, -6, 6, 4);
        ctx.lineTo(6, 62);
        ctx.quadraticCurveTo(6, 74, -6, 74);
        ctx.lineTo(-40, 74);
        ctx.quadraticCurveTo(-52, 74, -52, 62);
        ctx.lineTo(-52, -54);
        ctx.quadraticCurveTo(-52, -68, -38, -68);
        ctx.closePath();
      } else if (ch === "C") {
        // GTA "c": chunky rounded block with narrow vertical center slot opening to the right
        ctx.moveTo(-22, -68);
        ctx.lineTo(24, -68);
        ctx.quadraticCurveTo(56, -68, 56, -36);
        ctx.lineTo(56, -16);
        ctx.quadraticCurveTo(56, -6, 46, -6);
        ctx.lineTo(16, -6);
        ctx.quadraticCurveTo(8, -6, 8, -14);
        ctx.lineTo(8, -26);
        ctx.quadraticCurveTo(8, -34, 0, -34);
        ctx.quadraticCurveTo(-8, -34, -8, -26);
        ctx.lineTo(-8, 30);
        ctx.quadraticCurveTo(-8, 38, 0, 38);
        ctx.quadraticCurveTo(8, 38, 8, 30);
        ctx.lineTo(8, 16);
        ctx.quadraticCurveTo(8, 8, 16, 8);
        ctx.lineTo(46, 8);
        ctx.quadraticCurveTo(56, 8, 56, 18);
        ctx.lineTo(56, 42);
        ctx.quadraticCurveTo(56, 74, 24, 74);
        ctx.lineTo(-22, 74);
        ctx.quadraticCurveTo(-56, 74, -56, 40);
        ctx.lineTo(-56, -34);
        ctx.quadraticCurveTo(-56, -68, -22, -68);
        ctx.closePath();
      } else if (ch === "A") {
        // GTA "a" in "grand" / "auto": top overhang arch + lower-left belly loop + inner vertical slit
        ctx.moveTo(-24, -68);
        ctx.lineTo(24, -68);
        ctx.quadraticCurveTo(56, -68, 56, -36);
        ctx.lineTo(56, 62);
        ctx.quadraticCurveTo(56, 74, 44, 74);
        ctx.lineTo(-24, 74);
        ctx.quadraticCurveTo(-56, 74, -56, 42);
        ctx.lineTo(-56, 14);
        ctx.quadraticCurveTo(-56, -12, -30, -12);
        ctx.lineTo(-2, -12);
        ctx.quadraticCurveTo(6, -12, 6, -20);
        ctx.lineTo(6, -28);
        ctx.quadraticCurveTo(6, -35, -1, -35);
        ctx.quadraticCurveTo(-8, -35, -8, -28);
        ctx.lineTo(-8, -26);
        ctx.quadraticCurveTo(-8, -18, -18, -18);
        ctx.lineTo(-44, -18);
        ctx.quadraticCurveTo(-54, -18, -54, -28);
        ctx.lineTo(-54, -38);
        ctx.quadraticCurveTo(-54, -68, -24, -68);
        ctx.closePath();
        // Inner vertical slit inside the bottom belly of "a"
        addRoundRect(-10, 18, 16, 26, 5, true);
      } else if (ch === "E") {
        // GTA "e" in "theft": chunky rounded block with upper enclosed slit + lower-right horizontal slot opening
        ctx.moveTo(-24, -68);
        ctx.lineTo(24, -68);
        ctx.quadraticCurveTo(56, -68, 56, -36);
        ctx.lineTo(56, 4);
        ctx.quadraticCurveTo(56, 14, 46, 14);
        ctx.lineTo(-2, 14);
        ctx.quadraticCurveTo(-8, 14, -8, 20);
        ctx.lineTo(-8, 32);
        ctx.quadraticCurveTo(-8, 39, 0, 39);
        ctx.quadraticCurveTo(8, 39, 8, 32);
        ctx.lineTo(8, 28);
        ctx.quadraticCurveTo(8, 22, 16, 22);
        ctx.lineTo(46, 22);
        ctx.quadraticCurveTo(56, 22, 56, 32);
        ctx.lineTo(56, 44);
        ctx.quadraticCurveTo(56, 74, 24, 74);
        ctx.lineTo(-24, 74);
        ctx.quadraticCurveTo(-56, 74, -56, 42);
        ctx.lineTo(-56, -36);
        ctx.quadraticCurveTo(-56, -68, -24, -68);
        ctx.closePath();
        // Upper enclosed slit counter inside "e"
        addRoundRect(-8, -36, 16, 26, 5, true);
      } else if (ch === "S") {
        // GTA "s": heavy rounded S-block with narrow upper-right and lower-left horizontal slot cutouts
        ctx.moveTo(-24, -68);
        ctx.lineTo(24, -68);
        ctx.quadraticCurveTo(56, -68, 56, -36);
        ctx.lineTo(56, -24);
        ctx.quadraticCurveTo(56, -16, 46, -16);
        ctx.lineTo(-4, -16);
        ctx.quadraticCurveTo(-10, -16, -10, -23);
        ctx.quadraticCurveTo(-10, -30, -4, -30);
        ctx.lineTo(46, -30);
        // Actually build S as one continuous closed contour with upper-right & lower-left slots:
        ctx.beginPath();
        ctx.moveTo(-24, -68);
        ctx.lineTo(26, -68);
        ctx.quadraticCurveTo(56, -68, 56, -38);
        ctx.lineTo(56, -32);
        ctx.quadraticCurveTo(56, -24, 46, -24);
        ctx.lineTo(-2, -24);
        ctx.quadraticCurveTo(-9, -24, -9, -17);
        ctx.quadraticCurveTo(-9, -10, -2, -10);
        ctx.lineTo(26, -10);
        ctx.quadraticCurveTo(56, -10, 56, 20);
        ctx.lineTo(56, 44);
        ctx.quadraticCurveTo(56, 74, 26, 74);
        ctx.lineTo(-26, 74);
        ctx.quadraticCurveTo(-56, 74, -56, 44);
        ctx.lineTo(-56, 36);
        ctx.quadraticCurveTo(-56, 28, -46, 28);
        ctx.lineTo(2, 28);
        ctx.quadraticCurveTo(9, 28, 9, 21);
        ctx.quadraticCurveTo(9, 14, 2, 14);
        ctx.lineTo(-26, 14);
        ctx.quadraticCurveTo(-56, 14, -56, -16);
        ctx.lineTo(-56, -38);
        ctx.quadraticCurveTo(-56, -68, -24, -68);
        ctx.closePath();
      } else if (ch === "Q") {
        // GTA "q" (paired with "g" in "grand"): chunky rounded loop with inner vertical slit + lower-right descender stem
        ctx.moveTo(-24, -68);
        ctx.lineTo(24, -68);
        ctx.quadraticCurveTo(56, -68, 56, -36);
        ctx.lineTo(56, 82);
        ctx.quadraticCurveTo(56, 94, 44, 94);
        ctx.lineTo(18, 94);
        ctx.quadraticCurveTo(6, 94, 6, 82);
        ctx.lineTo(6, 66);
        ctx.lineTo(-24, 66);
        ctx.quadraticCurveTo(-56, 66, -56, 34);
        ctx.lineTo(-56, -36);
        ctx.quadraticCurveTo(-56, -68, -24, -68);
        ctx.closePath();
        // Inner vertical slit counter inside "q"
        addRoundRect(-8, -34, 16, 64, 6, true);
      }
    }

    updateLetterTextures(rangerKey = this.activeRangerKey) {
      const profile = RANGER_PROFILES[rangerKey] || RANGER_PROFILES.silver;
      const stops = profile.gtaStops || ["#3B1066", "#9E1982", "#FF247F", "#FF662A", "#FFB800"];
      const bevelTop = profile.bevelTop || "#FFB800";
      const bevelBot = profile.bevelBot || "#FF1E88";

      this.letterItems.forEach((item) => {
        // Authentic GTA VI "grand theft auto" (Pricedown) 3D Sticker/Block Lettering:
        // - Clean Satin Off-White / Silver-Ice face (#F6F7FB -> #DFE3EC)
        // - Thick Rounded Jet-Black GTA Outline (#07030E) filling the narrow inner counters
        // - Thin Outer GTA VI Sunset Neon Rim (Gold #FFB800 -> Hot Pink #FF1E88 -> Violet #7B1FA2)
        const ctx = item.ctx;
        const cSize = item.canvas ? item.canvas.width : 512;
        const cScale = cSize / 256;
        ctx.clearRect(0, 0, cSize, cSize);
        ctx.save();
        ctx.scale(cScale, cScale);
        ctx.translate(128, 126);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.miterLimit = 2;

        // Build exact GTA Pricedown vector path for this letter
        this.drawGtaPricedownGlyph(ctx, item.char);

        // 1. Outer GTA VI Neon Rim (Gold-Orange top -> Hot Magenta mid -> Deep Purple bottom)
        const neonRimGrad = ctx.createLinearGradient(-65, -88, 65, 92);
        neonRimGrad.addColorStop(0.0, "#FFB800");
        neonRimGrad.addColorStop(0.45, bevelBot);
        neonRimGrad.addColorStop(1.0, stops[1] || "#7B1FA2");
        ctx.lineWidth = 30;
        ctx.strokeStyle = neonRimGrad;
        ctx.stroke();

        // 2. Heavy Rounded Jet-Black GTA Sticker Outline (#07030E)
        ctx.lineWidth = 23;
        ctx.strokeStyle = "#07030E";
        ctx.stroke();

        // 3. Crisp GTA "grand theft auto" Off-White / Satin Silver Letter Face (with evenodd inner slit cutouts!)
        const faceGrad = ctx.createLinearGradient(0, -72, 0, 78);
        faceGrad.addColorStop(0.0, "#FFFFFF");
        faceGrad.addColorStop(0.55, "#F1F3F8");
        faceGrad.addColorStop(1.0, "#D8DEE9");
        ctx.fillStyle = faceGrad;
        ctx.fill("evenodd");

        ctx.restore();
        item.tex.needsUpdate = true;

        // 2. Solid 3D Extruded Block Side Walls (Heavy Black GTA 3D Block + Outer Neon Rim)
        if (item.sideCtx && item.sideTex) {
          const sCtx = item.sideCtx;
          const sSize = item.sideCanvas ? item.sideCanvas.width : 512;
          const sScale = sSize / 256;
          sCtx.clearRect(0, 0, sSize, sSize);
          sCtx.save();
          sCtx.scale(sScale, sScale);
          sCtx.translate(128, 126);
          sCtx.lineJoin = "round";
          sCtx.lineCap = "round";

          this.drawGtaPricedownGlyph(sCtx, item.char);

          const sideRimGrad = sCtx.createLinearGradient(-65, -88, 65, 92);
          sideRimGrad.addColorStop(0.0, "#D99B00");
          sideRimGrad.addColorStop(0.5, "#B81462");
          sideRimGrad.addColorStop(1.0, "#3B0D54");

          sCtx.lineWidth = 28;
          sCtx.strokeStyle = sideRimGrad;
          sCtx.stroke();

          sCtx.lineWidth = 22;
          sCtx.strokeStyle = "#07030E";
          sCtx.stroke();
          sCtx.fillStyle = "#07030E";
          sCtx.fill("evenodd");

          sCtx.restore();
          item.sideTex.needsUpdate = true;
        }
      });
    }

    bindLetterInteraction() {
      const canvasEl = this.renderer.domElement;
      if (!canvasEl) return;

      let lastX = null;
      let lastY = null;

      const getNormalizedPos = (clientX, clientY) => {
        const rect = canvasEl.getBoundingClientRect();
        return {
          normX: ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
          normY: -(((clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1),
        };
      };

      const projectLetterToNDC = (item) => {
        const scale = this.lettersGroup ? this.lettersGroup.scale.x : 1;
        const groupZ = this.lettersGroup ? this.lettersGroup.position.z : -0.18;
        const wx = item.baseX * scale;
        const wy = item.baseY * scale;
        const dz = Math.max(0.5, this.camera.position.z - groupZ);
        const halfH = dz * Math.tan((this.camera.fov * Math.PI) / 360);
        const halfW = halfH * (this.camera.aspect || 1.6);
        return {
          screenX: (wx - this.camera.position.x) / halfW,
          screenY: (wy - this.camera.position.y) / halfH,
          radX: (0.115 * scale) / halfW,
          radY: (0.145 * scale) / halfH,
        };
      };

      // Hover interaction: when mouse passes over a letter, ONLY that letter moves smoothly in the direction passed
      const onPointerMove = (e) => {
        const now = performance.now();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        if (lastX === null || lastY === null) {
          lastX = clientX;
          lastY = clientY;
        }

        const dx = clientX - lastX;
        const dy = clientY - lastY;
        lastX = clientX;
        lastY = clientY;

        // While paused for 0.8s after a click, ignore hover movement
        if (now < this.lettersPauseUntil) return;

        const { normX, normY } = getNormalizedPos(clientX, clientY);
        const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

        this.letterItems.forEach((item) => {
          const { screenX, screenY, radX, radY } = projectLetterToNDC(item);
          const nx = (normX - screenX) / Math.max(radX, 0.001);
          const ny = (normY - screenY) / Math.max(radY, 0.001);
          const dist = Math.hypot(nx, ny);

          if (dist < 1.15) {
            const influence = 1 - dist / 1.15;
            // Move smoothly toward the direction the mouse passed + flashy 3D pop-out & scale surge
            const moveStepX = (dx * 0.0018 + (normX - screenX) * 0.18) * influence;
            const moveStepY = (-dy * 0.0018 + (normY - screenY) * 0.18) * influence;

            item.targetOffsetX = clamp(item.targetOffsetX + moveStepX, -0.055, 0.055);
            item.targetOffsetY = clamp(item.targetOffsetY + moveStepY, -0.055, 0.055);
            item.targetOffsetZ = Math.max(item.targetOffsetZ, 0.095 * influence);
            item.targetScaleBoost = Math.max(item.targetScaleBoost, 0.26 * influence);
            item.hoverGlow = Math.min(1, item.hoverGlow + 0.45 * influence);

            // Eye-catching 3D tilt, spin & roll toward the mouse pass direction
            item.targetRotY = clamp(item.targetRotY + (dx * 0.024 + nx * 0.34) * influence, -1.05, 1.05);
            item.targetRotX = clamp(item.targetRotX + (dy * 0.024 - ny * 0.34) * influence, -0.85, 0.85);
            item.targetRotZ = clamp(item.targetRotZ + (-dx * 0.008 - nx * 0.12) * influence, -0.32, 0.32);
            item.velY = clamp(item.velY + dx * 0.0065 * influence, -0.18, 0.18);
            item.velX = clamp(item.velX + dy * 0.0065 * influence, -0.18, 0.18);
          }
        });
      };

      // Reset letters to original position and stay still for 0.8 seconds (800ms):
      // - On Desktop (> 768px with mouse): single click anywhere resets
      // - On Mobile (<= 768px / touch): ONLY resets on a double-tap / double-click ("click duplo")!
      const triggerLettersOriginReset = () => {
        this.lettersPauseUntil = performance.now() + 800;
        this.letterItems.forEach((item) => {
          item.velX = 0;
          item.velY = 0;
          item.targetOffsetX = 0;
          item.targetOffsetY = 0;
          item.targetOffsetZ = 0;
          item.targetScaleBoost = 0;
          item.hoverGlow = 0;
          item.targetRotX = 0;
          item.targetRotY = 0;
          item.targetRotZ = 0;
        });
      };

      let lastTouchTime = 0;
      let lastTapTime = 0;
      let lastTapX = 0;
      let lastTapY = 0;

      const onDesktopMouseDown = () => {
        const now = performance.now();
        // Ignore synthesized mousedown from mobile touch or when on mobile viewport
        if (this.sizes.width <= 768 || now - lastTouchTime < 650) return;
        triggerLettersOriginReset();
      };

      const onMobileTouchStart = (e) => {
        const now = performance.now();
        lastTouchTime = now;
        const touch = e.touches && e.touches[0];
        if (!touch) return;

        lastX = touch.clientX;
        lastY = touch.clientY;

        // Detect double-tap ("click duplo") within 340ms and 48px radius
        const dt = now - lastTapTime;
        const dist = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);
        if (dt > 25 && dt <= 340 && dist < 48) {
          lastTapTime = 0;
          triggerLettersOriginReset();
        } else {
          lastTapTime = now;
          lastTapX = touch.clientX;
          lastTapY = touch.clientY;
        }
      };

      const onMobileDblClick = () => {
        if (this.sizes.width <= 768) {
          triggerLettersOriginReset();
        }
      };

      window.addEventListener("mousemove", onPointerMove, { passive: true });
      window.addEventListener("touchmove", onPointerMove, { passive: true });
      window.addEventListener("mousedown", onDesktopMouseDown, { passive: true });
      window.addEventListener("touchstart", onMobileTouchStart, { passive: true });
      window.addEventListener("dblclick", onMobileDblClick, { passive: true });
    }

    drawTitleSign() {
      // Replaced by 3D interactive letter blocks
    }

    drawRetrowavePalmsLayer() {
      const canvas = this.palmsCanvas;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Only 2 Palm Trees in the background framing the left and right sides of the sun
      const palms = [
        { x: 0.365, lean: 0.022, crownY: 0.26, scale: 1.04 },
        { x: 0.635, lean: -0.022, crownY: 0.26, scale: 1.04 },
      ];

      palms.forEach((p) => {
        const baseX = p.x * W;
        const baseY = H * 0.99;
        const topX = (p.x + p.lean) * W;
        const topY = p.crownY * H;
        const ctrlX = (baseX + topX) * 0.5 - p.lean * W * 0.25;
        const ctrlY = (baseY + topY) * 0.52;

        ctx.save();
        ctx.fillStyle = "#090212";
        ctx.strokeStyle = "#090212";
        ctx.lineCap = "round";

        // 1. Curved Tapered Palm Trunk (wider at the base, tapering gracefully to the crown)
        const steps = 28;
        for (let i = 0; i < steps; i++) {
          const t0 = i / steps;
          const t1 = (i + 1) / steps;
          const x0 = (1 - t0) * (1 - t0) * baseX + 2 * (1 - t0) * t0 * ctrlX + t0 * t0 * topX;
          const y0 = (1 - t0) * (1 - t0) * baseY + 2 * (1 - t0) * t0 * ctrlY + t0 * t0 * topY;
          const x1 = (1 - t1) * (1 - t1) * baseX + 2 * (1 - t1) * t1 * ctrlX + t1 * t1 * topX;
          const y1 = (1 - t1) * (1 - t1) * baseY + 2 * (1 - t1) * t1 * ctrlY + t1 * t1 * topY;

          const w = (19 * (1 - t0 * 0.58) + (i % 2 === 0 ? 1.2 : 0)) * p.scale;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }

        // Crown hub / coconut cluster at the top of the trunk
        ctx.beginPath();
        ctx.arc(topX, topY + 6 * p.scale, 13 * p.scale, 0, Math.PI * 2);
        ctx.fill();

        // 2. Lush Tropical Feather-Leaf Palm Fronds (13 arching fronds with realistic hanging pinnate leaflets)
        const frondSpecs = [
          { angle: -2.85, len: 132, drop: 62, arch: -44 },
          { angle: -2.48, len: 148, drop: 48, arch: -58 },
          { angle: -2.12, len: 142, drop: 30, arch: -68 },
          { angle: -1.78, len: 122, drop: 14, arch: -72 },
          { angle: -1.42, len: 105, drop: 8, arch: -68 },
          { angle: -3.12, len: 112, drop: 78, arch: -24 },
          { angle: -0.28, len: 132, drop: 62, arch: -44 },
          { angle: -0.66, len: 148, drop: 48, arch: -58 },
          { angle: -1.02, len: 142, drop: 30, arch: -68 },
          { angle: -1.36, len: 122, drop: 14, arch: -72 },
          { angle: 0.02, len: 112, drop: 78, arch: -24 },
          { angle: -2.65, len: 125, drop: 68, arch: -35 },
          { angle: -0.48, len: 125, drop: 68, arch: -35 },
        ];

        frondSpecs.forEach((f) => {
          const dirX = Math.cos(f.angle);
          const dirY = Math.sin(f.angle);
          const endX = topX + dirX * f.len * p.scale;
          const endY = topY + dirY * f.len * 0.48 * p.scale + f.drop * p.scale;
          const midX = topX + dirX * f.len * 0.54 * p.scale;
          const midY = topY + dirY * f.len * 0.36 * p.scale + f.arch * p.scale;

          // Frond central spine (rachis)
          ctx.lineWidth = 3.6 * p.scale;
          ctx.beginPath();
          ctx.moveTo(topX, topY);
          ctx.quadraticCurveTo(midX, midY, endX, endY);
          ctx.stroke();

          // Individual drooping pointed leaflets along the frond spine
          const numLeaflets = 24;
          for (let l = 2; l <= numLeaflets; l++) {
            const lt = l / numLeaflets;
            const lx = (1 - lt) * (1 - lt) * topX + 2 * (1 - lt) * lt * midX + lt * lt * endX;
            const ly = (1 - lt) * (1 - lt) * topY + 2 * (1 - lt) * lt * midY + lt * lt * endY;

            // Tangent along spine
            const tx = 2 * (1 - lt) * (midX - topX) + 2 * lt * (endX - midX);
            const ty = 2 * (1 - lt) * (midY - topY) + 2 * lt * (endY - midY);
            const tLen = Math.hypot(tx, ty) || 1;
            const nx = -ty / tLen;
            const ny = tx / tLen;

            const env = Math.sin(lt * Math.PI);
            const leafLen = (10 + 36 * env) * p.scale;
            const sideSign = endX >= topX ? 1 : -1;

            // Upper & lower hanging pinnae
            [-1, 1].forEach((side) => {
              const sLen = side === 1 ? leafLen : leafLen * 0.65;
              const tipX = lx + (nx * side * 0.55 + (tx / tLen) * 0.42) * sLen * 0.55 + sideSign * 4 * lt;
              const tipY = ly + Math.abs(ny) * sLen * (side === 1 ? 0.95 : 0.45) + sLen * 0.52;

              ctx.lineWidth = (2.2 - lt * 0.9) * p.scale;
              ctx.beginPath();
              ctx.moveTo(lx, ly);
              ctx.quadraticCurveTo(
                (lx + tipX) * 0.5 + sideSign * 2,
                (ly + tipY) * 0.5 - 3 * p.scale,
                tipX,
                tipY
              );
              ctx.stroke();
            });
          }
        });

        ctx.restore();
      });
    }

    setRanger(key, { pulseMorph = false } = {}) {
      const profile = RANGER_PROFILES[key] || RANGER_PROFILES.black;
      this.activeRangerKey = key;
      this.updateLetterTextures(key);

      // Swap actual Movie Ranger character texture & alpha silhouette (with lazy-load fallback)
      if (this.assets && this.assets.textures && this.assets.textures.rangerVariants) {
        const variant =
          this.assets.textures.rangerVariants[key] || this.assets.textures.rangerVariants.silver;
        this.helmet.setVariant(variant);
        if (variant && !variant.loaded && typeof this.assets.ensureRangerVariantLoaded === "function") {
          this.assets.ensureRangerVariantLoaded(key, (loadedVariant) => {
            if (this.activeRangerKey === key) {
              this.helmet.setVariant(loadedVariant);
            }
          });
        }
      }

      // Update CSS accent color, frame border color & UI indicators
      document.documentElement.setAttribute("data-ranger-theme", key);
      document.documentElement.style.setProperty("--accent", profile.accentHex);
      document.documentElement.style.setProperty("--frame-accent", profile.frameHex || profile.accentHex);
      document.documentElement.style.setProperty("--pill-fg", profile.pillFg || profile.accentHex);
      if (!SUPPORTS_COLOR_MIX) {
        document.documentElement.style.setProperty("--accent-soft", hexToRgbaString(profile.accentHex, 0.14));
        document.documentElement.style.setProperty("--accent-border", hexToRgbaString(profile.accentHex, 0.42));
        document.documentElement.style.setProperty("--accent-glow", hexToRgbaString(profile.accentHex, 0.32));
      }

      const activeNameEl = document.getElementById("morphin-active-name");
      if (activeNameEl) {
        activeNameEl.textContent = profile.name;
      }

      document.querySelectorAll("[data-ranger-select]").forEach((ball) => {
        ball.classList.toggle("is-active", ball.dataset.rangerSelect === key);
      });

      const u = this.compositionMesh.material.uniforms;
      const targetWaveColor = toSRGBColor(profile.waveHex);
      const targetOutlineColor = toSRGBColor(profile.outlineHex || profile.frameHex || profile.accentHex);
      const targetCursorOutlineColor = toSRGBColor(profile.accentHex || "#00FFA3");
      const targetSuitColor = toSRGBColor(profile.suitHex);

      // Tween background wave foreground & glowing cyber contour lines
      const startFg = u.COLOR_FOREGROUND.value.clone();
      const startOutline = u.COLOR_OUTLINE.value.clone();
      const startCursorOutline = u.COLOR_CURSOR_OUTLINE.value.clone();
      const startSuit = u.uRangerColor.value.clone();
      const startHover = u.uColorHover.value.clone();
      const colorState = { t: 0 };

      gsap.to(colorState, {
        t: 1,
        duration: 0.45,
        ease: "power2.out",
        overwrite: true,
        onUpdate: () => {
          u.COLOR_FOREGROUND.value.lerpColors(startFg, targetWaveColor, colorState.t);
          u.COLOR_OUTLINE.value.lerpColors(startOutline, targetOutlineColor, colorState.t);
          u.COLOR_CURSOR_OUTLINE.value.lerpColors(startCursorOutline, targetCursorOutlineColor, colorState.t);
          u.uRangerColor.value.lerpColors(startSuit, targetSuitColor, colorState.t);
          u.uColorHover.value.lerpColors(startHover, targetWaveColor, colorState.t);
        },
      });

      gsap.to(u.uRangerTintMix, {
        value: profile.tintMix,
        duration: 0.45,
        ease: "power2.out",
        overwrite: true,
      });

      if (pulseMorph) {
        gsap.killTweensOf(u.uHelmetHover);
        gsap.to(u.uHelmetHover, {
          value: 1,
          duration: 0.65,
          ease: "expo.out",
          onUpdate: () => {
            this.head.uniforms.uHelmetHover.value = u.uHelmetHover.value;
          },
          onComplete: () => {
            gsap.to(u.uHelmetHover, {
              value: 0,
              delay: 0.9,
              duration: 0.85,
              ease: "power2.inOut",
              onUpdate: () => {
                this.head.uniforms.uHelmetHover.value = u.uHelmetHover.value;
              },
            });
          },
        });
      }
    }

    bindUIControls() {
      const hoverTriggers = document.querySelectorAll('[data-gl-helmet="hover"]');
      if (hoverTriggers.length) {
        const triggerReveal = (active) => {
          const u = this.compositionMesh.material.uniforms.uHelmetHover;
          gsap.to(u, {
            value: active ? 1 : 0,
            duration: active ? 1.2 : 0.9,
            ease: "expo.inOut",
            overwrite: true,
            onUpdate: () => {
              this.head.uniforms.uHelmetHover.value = u.value;
            },
          });
          gsap.to(this, {
            helmetRevealValue: active ? 0 : 1,
            duration: active ? 1.2 : 0.9,
            ease: "power1.inOut",
            overwrite: true,
          });
        };

        hoverTriggers.forEach((hoverTrigger) => {
          hoverTrigger.addEventListener("mouseenter", () => triggerReveal(true));
          hoverTrigger.addEventListener("mouseleave", () => triggerReveal(false));
          hoverTrigger.addEventListener("touchstart", () => triggerReveal(true), { passive: true });
          hoverTrigger.addEventListener("touchend", () => triggerReveal(false));
        });
      }

      // 1. Morphin Balls Selector ("Seletor de Bolas Morphin")
      document.querySelectorAll("[data-ranger-select]").forEach((ball) => {
        ball.addEventListener("click", () => {
          this.setRanger(ball.dataset.rangerSelect, { pulseMorph: true });
        });
        ball.addEventListener("mouseenter", () => {
          this.setRanger(ball.dataset.rangerSelect, { pulseMorph: false });
        });
      });

      // 2. Menu Items Change Background Ranger According to Menu Color
      document.querySelectorAll("[data-ranger-key]").forEach((navItem) => {
        navItem.addEventListener("mouseenter", () => {
          this.setRanger(navItem.dataset.rangerKey, { pulseMorph: false });
        });
        navItem.addEventListener("click", () => {
          this.setRanger(navItem.dataset.rangerKey, { pulseMorph: true });
        });
      });

      // 3. Skill Cards Preview Ranger Colors
      document.querySelectorAll("[data-ranger-preview]").forEach((card) => {
        card.addEventListener("mouseenter", () => {
          this.setRanger(card.dataset.rangerPreview, { pulseMorph: false });
        });
      });

      // Expose helper so scrolling into each menu section can sync the active Ranger color theme
      window.__setPortfolioRangerFromScroll = (variantKey) => {
        if (variantKey && this.activeRangerKey !== variantKey) {
          this.setRanger(variantKey, { pulseMorph: false });
        }
      };

      // 4. Lock Ranger Toggle
      const permToggles = document.querySelectorAll("[data-toggle-helmet]");
      if (permToggles.length) {
        permToggles.forEach((permToggle) => {
          permToggle.addEventListener("click", () => {
            const permUniform = this.compositionMesh.material.uniforms.SHOW_HELMET_PERMANENTLY;
            permUniform.value = !permUniform.value;
            permToggles.forEach((btn) => {
              btn.classList.toggle("is-active", permUniform.value);
              btn.textContent = permUniform.value ? "Fixar Ranger: ON" : "Fixar Ranger: OFF";
            });
          });
        });
      }
    }

    updateMobileStageLayout(targetRecede, immediate = false) {
      if (this.sizes.width > 768) return;
      if (typeof this.mobileRecede !== "number" || immediate) {
        this.mobileRecede = targetRecede;
      } else {
        this.mobileRecede += (targetRecede - this.mobileRecede) * 0.18;
      }
      const r = this.mobileRecede;
      const aspect = this.sizes.width / Math.max(this.sizes.height, 1);
      const tanHalfFov = 0.1316525; // Math.tan((15 * Math.PI) / 360)
      const halfH = this.camera.position.z * tanHalfFov;
      const halfHLetters = (this.camera.position.z + 0.18) * tanHalfFov;

      // 1. 3D Letreiro ("MARCOS SIQUEIRA") positioned in the upper demarcated zone above his hair (Photo 1 & Photo 3)
      if (this.lettersGroup) {
        const mobileLetterScale = Math.min(0.68, Math.max(0.45, aspect * 1.04));
        this.lettersGroup.scale.set(mobileLetterScale, mobileLetterScale, mobileLetterScale);
        const midNdcY = 0.55 - r * 0.08;
        const lettersY = midNdcY * halfHLetters - 0.135 * mobileLetterScale;
        this.lettersGroup.position.set(0, lettersY, -0.18);
      }

      // 2. Character Portrait & Ranger Suit:
      //    - At r=0 (Photo 1): full character below the upper 3D letreiro
      //    - At r=1 (Photo 3): recedes into the background (scale 0.75) so his face sits in the red circle
      //      and his shoulders/blazer/shirt fill the red rectangle all the way behind the bottom dock
      const normFactor = halfH / 0.612;
      const charScale = 1.0 - r * 0.25;
      const charY = (-0.075 - r * 0.015) * normFactor;

      this.head.instance.scale.set(charScale, charScale, 1);
      this.head.instance.position.y = charY;
      this.helmet.instance.scale.copy(this.head.instance.scale);
      this.helmet.instance.position.copy(this.head.instance.position);
    }

    applyResponsive() {
      const aspect = this.sizes.width / Math.max(this.sizes.height, 1);
      if (this.sizes.width > 768) {
        this.camera.position.z = 3.32;
        this.head.instance.scale.set(1, 1, 1);
        this.head.instance.position.y = -0.04;
        if (this.lettersGroup) {
          this.lettersGroup.scale.set(1.0, 1.0, 1.0);
          this.lettersGroup.position.set(0, 0, -0.18);
        }
      } else {
        // Fit character and 3D letters cleanly inside narrow portrait mobile screens
        this.camera.position.z = Math.min(4.85, Math.max(4.15, 2.15 / Math.max(aspect, 0.42)));
        this.updateMobileStageLayout(window.__mobileHeroRecedeProgress || 0, true);
      }
      this.helmet.instance.position.copy(this.head.instance.position);
      this.helmet.instance.scale.copy(this.head.instance.scale);

      this.compositionMesh.scale.set(this.sizes.width, this.sizes.height, 1);
      this.compositionMesh.material.uniforms.uAspect.value = aspect;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }

    resize() {
      this.defaultRenderTarget.setSize(
        this.sizes.width * this.sizes.pixelRatio,
        this.sizes.height * this.sizes.pixelRatio
      );
      this.helmet.resize();
      this.applyResponsive();
    }

    update(elapsed, delta) {
      const fluidTexture = this.fluidCursor.sourceTarget.texture;
      const noiseTexture = this.backgroundNoise.renderTarget.texture;

      if (this.sizes.width <= 768) {
        this.updateMobileStageLayout(window.__mobileHeroRecedeProgress || 0, false);
      }

      this.head.update(delta, this.helmetRevealValue, fluidTexture);
      this.easedMouse.normalized.update(delta);

      // 3D Interactive Letters Physics (Independent hover motion + 0.8s click reset pause):
      if (this.letterItems) {
        const now = performance.now();
        const isPaused = now < (this.lettersPauseUntil || 0);
        const resumeRamp = isPaused
          ? 0
          : Math.min(1, (now - (this.lettersPauseUntil || 0)) / 320);

        this.letterItems.forEach((item, idx) => {
          if (isPaused) {
            // Smoothly & rapidly snap back to exact original position and stay still for 0.8s
            item.velX = 0;
            item.velY = 0;
            item.targetOffsetX = 0;
            item.targetOffsetY = 0;
            item.targetOffsetZ = 0;
            item.targetScaleBoost = 0;
            item.hoverGlow = 0;
            item.targetRotX = 0;
            item.targetRotY = 0;
            item.targetRotZ = 0;

            item.offsetX += (0 - item.offsetX) * 0.35;
            item.offsetY += (0 - item.offsetY) * 0.35;
            item.offsetZ += (0 - item.offsetZ) * 0.35;
            item.scaleBoost += (0 - item.scaleBoost) * 0.35;
            item.rotX += (0 - item.rotX) * 0.35;
            item.rotY += (0 - item.rotY) * 0.35;
            item.rotZ += (0 - item.rotZ) * 0.35;

            if (Math.abs(item.offsetX) < 0.0003) item.offsetX = 0;
            if (Math.abs(item.offsetY) < 0.0003) item.offsetY = 0;
            if (Math.abs(item.offsetZ) < 0.0003) item.offsetZ = 0;
            if (Math.abs(item.scaleBoost) < 0.0003) item.scaleBoost = 0;
            if (Math.abs(item.rotX) < 0.0005) item.rotX = 0;
            if (Math.abs(item.rotY) < 0.0005) item.rotY = 0;
            if (Math.abs(item.rotZ) < 0.0005) item.rotZ = 0;

            item.mesh.position.x = item.baseX + item.offsetX;
            item.mesh.position.y = item.baseY + item.offsetY;
            item.mesh.position.z = item.offsetZ;
            const s = 1 + item.scaleBoost;
            item.mesh.scale.set(s, s, s);
            item.mesh.rotation.x = item.rotX;
            item.mesh.rotation.y = item.rotY;
            item.mesh.rotation.z = item.rotZ;
            return;
          }

          // Apply independent angular velocity & smooth spring back
          item.targetRotY += item.velY;
          item.targetRotX += item.velX;
          item.velY *= 0.90;
          item.velX *= 0.90;

          // Gently decay hover targets back toward rest
          item.targetOffsetX *= 0.94;
          item.targetOffsetY *= 0.94;
          item.targetOffsetZ *= 0.90;
          item.targetScaleBoost *= 0.90;
          item.hoverGlow *= 0.92;
          item.targetRotX *= 0.93;
          item.targetRotY *= 0.93;
          item.targetRotZ *= 0.91;

          // Subtle organic 3D idle motion + independent hover target
          const idleRotY = Math.sin(elapsed * 2.0 + idx * 0.45) * 0.14 * resumeRamp;
          const idleRotX = Math.cos(elapsed * 1.6 + idx * 0.35) * 0.09 * resumeRamp;
          const idleFloatY = Math.sin(elapsed * 2.2 + idx * 0.5) * 0.0045 * resumeRamp;

          item.offsetX += (item.targetOffsetX - item.offsetX) * 0.18;
          item.offsetY += (item.targetOffsetY - item.offsetY) * 0.18;
          item.offsetZ += (item.targetOffsetZ - item.offsetZ) * 0.22;
          item.scaleBoost += (item.targetScaleBoost - item.scaleBoost) * 0.22;
          item.rotX += (idleRotX + item.targetRotX - item.rotX) * 0.18;
          item.rotY += (idleRotY + item.targetRotY - item.rotY) * 0.18;
          item.rotZ += (item.targetRotZ - item.rotZ) * 0.18;

          item.mesh.position.x = item.baseX + item.offsetX;
          item.mesh.position.y = item.baseY + item.offsetY + idleFloatY;
          item.mesh.position.z = item.offsetZ;
          const s = 1 + item.scaleBoost;
          item.mesh.scale.set(s, s, s);
          item.mesh.rotation.x = item.rotX;
          item.mesh.rotation.y = item.rotY;
          item.mesh.rotation.z = item.rotZ;

          // Isolated Natural 3D Lighting exclusively on the letters (never touches the character!):
          // Calculates surface normal N from the letter's 3D tilt and dot product with a virtual studio key light,
          // plus a flashy specular energy surge when the letter is hovered.
          if (item.faceMat && item.sideMat) {
            const lightX = -0.35 + this.easedMouse.normalized.value.x * 0.55;
            const lightY = 0.48 - this.easedMouse.normalized.value.y * 0.35;
            const lightZ = 0.92;

            const lx = lightX - item.mesh.position.x;
            const ly = lightY - item.mesh.position.y;
            const lz = lightZ;
            const lLen = Math.hypot(lx, ly, lz) || 1;

            const nx = Math.sin(item.rotY);
            const ny = -Math.sin(item.rotX) * Math.cos(item.rotY);
            const nz = Math.cos(item.rotX) * Math.cos(item.rotY);

            const ndotl = Math.max(0, (nx * lx + ny * ly + nz * lz) / lLen);
            // Realistic Glossy Enamel & Anodized 3D Studio Lighting (preserves vibrant GTA VI saturation & physical depth contrast)
            const spec = Math.pow(ndotl, 9) * 0.14 + item.hoverGlow * 0.16;
            const faceLight = Math.min(1.06, 0.78 + ndotl * 0.18 + spec);
            const sideLight = Math.min(0.82, 0.42 + (1 - Math.abs(nz)) * 0.26 + ndotl * 0.12 + item.hoverGlow * 0.14);

            item.faceMat.color.setRGB(faceLight, faceLight, faceLight);
            item.sideMat.color.setRGB(sideLight, sideLight * 0.92, sideLight * 1.05);
          }
        });
      }

      // Subtle camera parallax
      this.camera.position.x = this.easedMouse.normalized.value.x * 0.02 * this.helmetRevealValue;
      if (this.sizes.width > 768) {
        this.camera.position.y = -this.easedMouse.normalized.value.y * 0.02 * this.helmetRevealValue;
      } else {
        this.camera.position.y = 0;
      }

      // Render 2.5D Black Ranger pass synced with user head
      this.helmet.update(this.camera, this.head.instance);

      // Render 2.5D head pass
      this.renderer.setRenderTarget(this.defaultRenderTarget);
      this.renderer.clear();
      this.renderer.render(this.defaultScene, this.camera);

      // Feed composite shader uniforms
      const u = this.compositionMesh.material.uniforms;
      u.uTime.value = elapsed;
      if (u.uMouseParallax) {
        u.uMouseParallax.value.copy(this.easedMouse.normalized.value);
      }
      u.tDefaultDiffuse.value = this.defaultRenderTarget.texture;
      u.tHelmet.value = this.helmet.renderTarget.texture;
      u.tCursorEffect.value = fluidTexture;
      u.tBackgroundNoise.value = noiseTexture;
    }
  }

  // =========================================================================
  // Asset Loader & Application Entry Point
  // =========================================================================

  function configureNonHeadTexture(tex) {
    tex.flipY = false;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }

  function loadLiquidAssets(onProgress) {
    const textureLoader = new THREE.TextureLoader();
    // Boot fast with only the 10 essential textures (Head + Default Silver Ranger + Noise).
    // The remaining 6 Ranger color variants are lazy-loaded in the background after boot.
    const essentialUrls = [
      ASSETS.textures.head.diffuse,
      ASSETS.textures.head.depth,
      ASSETS.textures.head.alpha,
      ASSETS.textures.head.normal,
      ASSETS.textures.head.shadow,
      ASSETS.textures.rangerVariants.silver.diffuse,
      ASSETS.textures.ranger.depth,
      ASSETS.textures.rangerVariants.silver.alpha,
      ASSETS.textures.ranger.normal,
      ASSETS.textures.noise.texture,
      ASSETS.textures.retrowaveBg,
    ];
    let loadedCount = 0;
    const totalCount = essentialUrls.length;

    const loadTex = (url, trackProgress = true) =>
      new Promise((resolve, reject) =>
        textureLoader.load(
          url,
          (tex) => {
            if (trackProgress) {
              loadedCount++;
              if (typeof onProgress === "function") {
                onProgress(loadedCount, totalCount);
              }
            }
            resolve(tex);
          },
          undefined,
          reject
        )
      );

    return Promise.all(essentialUrls.map((u) => loadTex(u, true))).then(
      ([
        headDiffuse,
        headDepth,
        headAlpha,
        headNormal,
        headShadow,
        silverDiffuse,
        rangerDepth,
        silverAlpha,
        rangerNormal,
        noiseTex,
        retrowaveBgTex,
      ]) => {
        headDiffuse.minFilter = THREE.LinearFilter;
        headDiffuse.magFilter = THREE.LinearFilter;
        headDiffuse.colorSpace = THREE.SRGBColorSpace;

        headShadow.minFilter = THREE.LinearFilter;
        headShadow.magFilter = THREE.LinearFilter;
        headShadow.colorSpace = THREE.SRGBColorSpace;

        headDepth.colorSpace = THREE.SRGBColorSpace;

        silverDiffuse.minFilter = THREE.LinearFilter;
        silverDiffuse.magFilter = THREE.LinearFilter;
        silverDiffuse.colorSpace = THREE.SRGBColorSpace;

        rangerDepth.colorSpace = THREE.SRGBColorSpace;

        configureNonHeadTexture(noiseTex);

        if (retrowaveBgTex) {
          retrowaveBgTex.minFilter = THREE.LinearFilter;
          retrowaveBgTex.magFilter = THREE.LinearFilter;
          retrowaveBgTex.colorSpace = THREE.SRGBColorSpace;
          retrowaveBgTex.wrapS = THREE.ClampToEdgeWrapping;
          retrowaveBgTex.wrapT = THREE.ClampToEdgeWrapping;
        }

        const variantSources = {
          red: ASSETS.textures.rangerVariants.red,
          blue: ASSETS.textures.rangerVariants.blue,
          green: ASSETS.textures.rangerVariants.green,
          yellow: ASSETS.textures.rangerVariants.yellow,
          pink: ASSETS.textures.rangerVariants.pink,
          black: {
            diffuse: ASSETS.textures.ranger.diffuse,
            alpha: ASSETS.textures.ranger.alpha,
          },
        };

        const rangerVariants = {
          silver: { diffuse: silverDiffuse, alpha: silverAlpha, loaded: true },
          red: { diffuse: silverDiffuse, alpha: silverAlpha, loaded: false },
          blue: { diffuse: silverDiffuse, alpha: silverAlpha, loaded: false },
          green: { diffuse: silverDiffuse, alpha: silverAlpha, loaded: false },
          yellow: { diffuse: silverDiffuse, alpha: silverAlpha, loaded: false },
          pink: { diffuse: silverDiffuse, alpha: silverAlpha, loaded: false },
          black: { diffuse: silverDiffuse, alpha: silverAlpha, loaded: false },
        };

        const pendingPromises = {};

        const ensureRangerVariantLoaded = (key, onReady) => {
          const existing = rangerVariants[key];
          if (!existing || existing.loaded) {
            if (existing && typeof onReady === "function") onReady(existing);
            return Promise.resolve(existing);
          }
          if (!pendingPromises[key]) {
            const src = variantSources[key];
            if (!src) return Promise.resolve(existing);
            pendingPromises[key] = Promise.all([
              loadTex(src.diffuse, false),
              loadTex(src.alpha, false),
            ])
              .then(([diffTex, alphaTex]) => {
                diffTex.minFilter = THREE.LinearFilter;
                diffTex.magFilter = THREE.LinearFilter;
                diffTex.colorSpace = THREE.SRGBColorSpace;
                rangerVariants[key] = {
                  diffuse: diffTex,
                  alpha: alphaTex,
                  loaded: true,
                };
                return rangerVariants[key];
              })
              .catch(() => existing);
          }
          return pendingPromises[key].then((v) => {
            if (typeof onReady === "function") onReady(v);
            return v;
          });
        };

        return {
          textures: {
            head: {
              diffuse: headDiffuse,
              depth: headDepth,
              alpha: headAlpha,
              normal: headNormal,
              shadow: headShadow,
            },
            ranger: {
              diffuse: silverDiffuse,
              depth: rangerDepth,
              alpha: silverAlpha,
              normal: rangerNormal,
            },
            rangerVariants,
            noise: { texture: noiseTex },
            retrowaveBg: retrowaveBgTex,
          },
          ensureRangerVariantLoaded,
          preloadAllRangerVariants: (onEachLoaded) => {
            const keys = ["red", "blue", "green", "yellow", "pink", "black"];
            let chain = Promise.resolve();
            keys.forEach((k) => {
              chain = chain.then(() =>
                ensureRangerVariantLoaded(k, (loadedVar) => {
                  if (typeof onEachLoaded === "function") {
                    onEachLoaded(k, loadedVar);
                  }
                })
              );
            });
            return chain;
          },
        };
      }
    );
  }

  async function initLiquidMotion() {
    const canvas = document.querySelector("canvas.gl");
    const loaderEl = document.querySelector(".liquid-loader");
    const statusEl = document.querySelector(".liquid-loader-status");
    const barFillEl = document.getElementById("loader-bar-fill");
    const percentEl = document.getElementById("loader-percent");
    const progressBarEl = document.getElementById("loader-progressbar");
    if (!canvas) return;

    const setLoaderProgress = (pct, statusMsg) => {
      const clamped = Math.min(100, Math.max(0, Math.round(pct)));
      if (barFillEl) barFillEl.style.width = `${clamped}%`;
      if (percentEl) percentEl.textContent = `${clamped}%`;
      if (progressBarEl) progressBarEl.setAttribute("aria-valuenow", String(clamped));
      if (statusMsg && statusEl) statusEl.textContent = statusMsg;
    };

    setLoaderProgress(8, "Inicializando motor WebGL...");

    THREE.ShaderChunk.simplex = SIMPLEX_NOISE_GLSL;
    THREE.ColorManagement.enabled = true;

    let sizes = computeSizes();
    const renderer = new THREE.WebGLRenderer({
      canvas,
      powerPreference: "high-performance",
      alpha: true,
      precision: "highp",
      antialias: false,
    });
    renderer.autoClear = false;
    renderer.setPixelRatio(sizes.pixelRatio);
    renderer.setSize(sizes.width, sizes.height);

    const mainScene = new THREE.Scene();
    const mainCamera = new THREE.PerspectiveCamera(
      2 * Math.atan(sizes.height / 2 / 10) * (180 / Math.PI),
      sizes.width / sizes.height,
      0.1,
      1000
    );
    mainCamera.position.z = 10;

    let assets;
    try {
      assets = await loadLiquidAssets((loaded, total) => {
        const pct = 10 + (loaded / total) * 82;
        setLoaderProgress(pct, `Carregando texturas 2.5D & Shaders (${loaded}/${total})...`);
      });
    } catch (err) {
      console.error("Failed to load Liquid Motion assets:", err);
      if (statusEl) statusEl.textContent = "Erro ao carregar assets (abra via http://localhost:8080)";
      return;
    }

    setLoaderProgress(96, "Compilando Morphin Grid...");

    let clock, mouse, idleState, backgroundNoise, fluidCursor, heroScene;
    try {
      clock = new THREE.Clock();
      mouse = new MouseTracker(document, sizes);
      idleState = new IdleCursorController();
      backgroundNoise = new BackgroundNoisePass(renderer, sizes, mouse);
      fluidCursor = new FluidCursor(renderer, sizes, mouse, idleState);
      heroScene = new LiquidHeroScene(renderer, sizes, mouse, assets, fluidCursor, backgroundNoise);
      mainScene.add(heroScene.compositionMesh);
    } catch (initErr) {
      console.error("Failed to initialize scene at 96%:", initErr);
      if (statusEl) statusEl.textContent = `Erro na inicialização: ${initErr.message}`;
      return;
    }

    setLoaderProgress(100, "Pronto!");

    if (loaderEl) {
      setTimeout(() => {
        loaderEl.classList.add("is-loaded");
        forceScrollToTop();
        // Lazy-load secondary Ranger variants in the background after the hero is interactive
        if (assets && typeof assets.preloadAllRangerVariants === "function") {
          setTimeout(() => {
            assets.preloadAllRangerVariants((loadedKey, loadedVariant) => {
              if (heroScene && heroScene.activeRangerKey === loadedKey) {
                heroScene.helmet.setVariant(loadedVariant);
              }
            });
          }, 350);
        }
      }, 280);
    }

    const syncSizesAndRenderer = () => {
      const next = computeSizes();
      sizes.width = next.width;
      sizes.height = next.height;
      sizes.pixelRatio = next.pixelRatio;
      sizes.renderWidth = next.renderWidth;
      sizes.renderHeight = next.renderHeight;

      mainCamera.aspect = sizes.width / sizes.height;
      mainCamera.fov = 2 * Math.atan(sizes.height / 2 / 10) * (180 / Math.PI);
      mainCamera.updateProjectionMatrix();

      renderer.setPixelRatio(sizes.pixelRatio);
      renderer.setSize(sizes.width, sizes.height);

      fluidCursor.resize();
      backgroundNoise.resize();
      heroScene.resize();
    };

    window.addEventListener("resize", syncSizesAndRenderer);

    // =======================================================================
    // Minimal Gear Menu: 3 Complete Quality Presets (Fraco / Normal / Forte)
    // =======================================================================
    const gearBtn = document.getElementById("quality-gear-btn");
    const gearPanel = document.getElementById("quality-gear-panel");
    const tierButtons = document.querySelectorAll(".quality-option-btn[data-quality-tier]");

    let activeTargetHz = CURRENT_QUALITY_PRESET.hz || 60;
    window.__displayHz = activeTargetHz;

    const updateGearMenuUI = () => {
      tierButtons.forEach((btn) => {
        const isSelected = String(btn.getAttribute("data-quality-tier")) === String(ACTIVE_QUALITY_TIER);
        btn.classList.toggle("is-active", isSelected);
        btn.setAttribute("aria-checked", isSelected ? "true" : "false");
      });
    };

    const applyQualityTier = (tierKey, { persist = true, rebuildScene = true } = {}) => {
      const preset = QUALITY_PRESETS[tierKey];
      if (!preset) return;

      ACTIVE_QUALITY_TIER = preset.key;
      CURRENT_QUALITY_PRESET = preset;
      IS_LOW_END = preset.cssTier === "low";
      activeTargetHz = preset.hz;
      window.__displayHz = activeTargetHz;

      document.documentElement.setAttribute("data-quality-tier", preset.cssTier);
      document.documentElement.setAttribute("data-display-hz", String(activeTargetHz));
      document.documentElement.classList.toggle("is-low-end", IS_LOW_END);

      if (persist) {
        try {
          localStorage.setItem("ms_quality_tier_override", preset.key);
        } catch (_e) {}
      }

      if (typeof gsap.ticker.fps === "function") {
        gsap.ticker.fps(activeTargetHz >= 120 ? -1 : activeTargetHz);
      }
      if (typeof gsap.ticker.lagSmoothing === "function") {
        gsap.ticker.lagSmoothing(0);
      }

      if (rebuildScene) {
        syncSizesAndRenderer();
        fluidCursor.applyQualityPreset(CURRENT_QUALITY_PRESET);
        heroScene.rebuildForQualityPreset(CURRENT_QUALITY_PRESET);
      }
      updateGearMenuUI();
    };

    window.__applyQualityTier = applyQualityTier;

    if (gearBtn && gearPanel) {
      const toggleGearPanel = (forceOpen) => {
        const nextOpen = typeof forceOpen === "boolean" ? forceOpen : gearPanel.hidden;
        gearPanel.hidden = !nextOpen;
        gearBtn.setAttribute("aria-expanded", nextOpen ? "true" : "false");
      };

      gearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleGearPanel();
      });

      document.addEventListener("click", (e) => {
        if (!gearPanel.hidden && !gearPanel.contains(e.target) && !gearBtn.contains(e.target)) {
          toggleGearPanel(false);
        }
      });

      tierButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetTier = btn.getAttribute("data-quality-tier");
          applyQualityTier(targetTier, { persist: true, rebuildScene: true });
        });
      });
    }

    applyQualityTier(ACTIVE_QUALITY_TIER, { persist: false, rebuildScene: false });

    window.__isHeroStageVisible = true;

    gsap.ticker.add(() => {
      if (document.hidden || window.__isHeroStageVisible === false) {
        clock.getDelta();
        return;
      }

      const rawDt = clock.getDelta();
      const targetFrameDt = 1 / Math.max(30, activeTargetHz || 60);
      const hzSpeedScale = (activeTargetHz || 60) / 60;
      const delta = Math.min(rawDt || targetFrameDt, 1 / 24) * 100 * Math.min(1.35, Math.max(0.75, hzSpeedScale));
      const elapsed = clock.getElapsedTime();

      idleState.update();
      fluidCursor.update();
      heroScene.update(elapsed, delta);

      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(mainScene, mainCamera);

      mouse.update();
    });
  }

  // =========================================================================
  // Portfolio Interactivity (Scroll Framing, 3 Self-Explanatory Demos & Form)
  // =========================================================================

  const SAMPLE_DOCS = [
    {
      title: "Nota Fiscal — Servidores Cloud.pdf",
      vendor: "Cloud Brasil LTDA",
      cnpj: "48.921.400/0001-89",
      pay: "Pix Corporativo",
      valStr: "4.850,00",
      valNum: 4850,
    },
    {
      title: "Recibo — Campanha Meta Ads.pdf",
      vendor: "Meta Platforms Ireland",
      cnpj: "13.347.016/0001-17",
      pay: "Cartão de Crédito",
      valStr: "8.200,00",
      valNum: 8200,
    },
    {
      title: "Fatura — Equipamentos Escritório.pdf",
      vendor: "TechStore Hardware SA",
      cnpj: "29.104.882/0001-40",
      pay: "Boleto Faturado",
      valStr: "3.190,00",
      valNum: 3190,
    },
  ];

  function initPortfolioUI() {
    // 1. Scroll-Driven Scrollytelling Timeline + Blank Box Typewriter Reveal
    const siteHeader = document.getElementById("topo");
    const heroTrack = document.getElementById("hero");
    const heroFrameCard = document.getElementById("hero-frame-card");
    const heroViewport = document.querySelector(".hero-sticky-viewport");
    const heroIntroBox = document.getElementById("hero-intro-box");
    const heroCenterHint = document.getElementById("hero-center-hint");
    const morphinDock = document.getElementById("morphin-dock");
    const heroScrollCue = document.getElementById("hero-scroll-cue");
    const parallaxSheet = document.getElementById("parallax-content-sheet");
    const sections = document.querySelectorAll("section[id]");
    const navLinks = document.querySelectorAll(".site-nav .nav-link");

    // Helper: wrap static text nodes inside an element so typing preserves exact line wrapping & height
    function buildRichTextNodes(rootEl) {
      if (!rootEl) return [];
      const textNodes = [];
      const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let n;
      while ((n = walker.nextNode())) {
        textNodes.push(n);
      }
      return textNodes.map((origNode) => {
        const fullText = origNode.nodeValue.replace(/\s+/g, " ");
        const parent = origNode.parentNode;
        const typedNode = document.createTextNode("");
        const caretEl = document.createElement("span");
        caretEl.className = "type-caret";
        caretEl.setAttribute("aria-hidden", "true");
        const untypedSpan = document.createElement("span");
        untypedSpan.className = "type-untyped";
        untypedSpan.textContent = fullText;

        parent.insertBefore(typedNode, origNode);
        parent.insertBefore(caretEl, origNode);
        parent.insertBefore(untypedSpan, origNode);
        parent.removeChild(origNode);

        return {
          typedNode,
          caretEl,
          untypedSpan,
          fullText,
          length: fullText.length,
        };
      });
    }

    // Build a multi-step typewriter controller for a glass box so it starts blank and types out
    function createSequenceTypewriter(steps) {
      let totalChars = 0;
      const compiledSteps = steps.map((step) => {
        if (step.type === "reveal") {
          if (step.el) {
            step.el.classList.add("type-sub-item", "type-sub-hidden");
          }
          const start = totalChars;
          totalChars += step.weight || 3;
          return { ...step, start, end: totalChars };
        }
        if (step.type === "dynamicText") {
          if (step.containerEl) {
            step.containerEl.classList.add("type-sub-item", "type-sub-hidden");
          }
          const initialLen = step.el ? step.el.textContent.trim().length : 12;
          const start = totalChars;
          totalChars += Math.max(initialLen, 6);
          return {
            ...step,
            start,
            end: totalChars,
            liveText: step.el ? step.el.textContent.trim() : "",
          };
        }
        // Rich static text step
        if (step.containerEl) {
          step.containerEl.classList.add("type-sub-item", "type-sub-hidden");
        }
        const segments = buildRichTextNodes(step.el);
        const stepStart = totalChars;
        const segRanges = segments.map((seg) => {
          const s = totalChars;
          totalChars += seg.length;
          return { ...seg, start: s, end: totalChars };
        });
        return {
          ...step,
          segments: segRanges,
          start: stepStart,
          end: totalChars,
        };
      });

      let lastProgress = -1;

      return {
        setProgress(rawP) {
          const p = Math.min(Math.max(rawP, 0), 1);
          if (Math.abs(p - lastProgress) < 0.0005) return;
          lastProgress = p;

          const currentChar = p * totalChars;
          let activeCaret = null;

          compiledSteps.forEach((step) => {
            if (step.type === "reveal") {
              if (step.el) {
                step.el.classList.toggle("type-sub-hidden", currentChar <= step.start);
              }
              return;
            }

            if (step.type === "dynamicText") {
              if (!step.el) return;
              const currentText = step.el.dataset.liveTarget || step.el.textContent.trim() || step.liveText;
              if (p >= 0.995 && step.lastApplied >= 0.995) {
                step.liveText = step.el.textContent.trim() || step.liveText;
              } else if (step.lastApplied === undefined || step.lastApplied >= 0.995) {
                step.liveText = step.el.textContent.trim() || step.liveText;
              }
              const targetStr = step.liveText;
              const started = currentChar > step.start;
              if (step.containerEl) {
                step.containerEl.classList.toggle("type-sub-hidden", !started);
              }
              const stepSpan = Math.max(step.end - step.start, 1);
              const localP = Math.min(Math.max((currentChar - step.start) / stepSpan, 0), 1);
              const k = Math.round(localP * targetStr.length);
              step.el.textContent = targetStr.slice(0, k);
              step.lastApplied = p;
              return;
            }

            // Static rich text
            const started = currentChar > step.start;
            if (step.containerEl) {
              step.containerEl.classList.toggle("type-sub-hidden", !started);
            }
            step.segments.forEach((seg) => {
              const segSpan = Math.max(seg.end - seg.start, 1);
              const localP = Math.min(Math.max((currentChar - seg.start) / segSpan, 0), 1);
              const k = Math.round(localP * seg.length);
              seg.typedNode.nodeValue = seg.fullText.slice(0, k);
              seg.untypedSpan.textContent = seg.fullText.slice(k);
              seg.caretEl.classList.remove("is-active");
              if (p > 0.002 && p < 0.995 && currentChar >= seg.start && currentChar <= seg.end) {
                activeCaret = seg.caretEl;
              }
            });
          });

          if (activeCaret) {
            activeCaret.classList.add("is-active");
          }
        },
      };
    }

    // Build Typewriter for Right Box (#morphin-dock)
    const morphinBalls = morphinDock ? Array.from(morphinDock.querySelectorAll(".morphin-ball")) : [];
    const rightBoxSteps = [];
    if (morphinDock) {
      rightBoxSteps.push({
        type: "richText",
        el: morphinDock.querySelector(".morphin-title"),
      });
      rightBoxSteps.push({
        type: "dynamicText",
        el: document.getElementById("morphin-active-name"),
        containerEl: document.getElementById("morphin-active-name"),
      });
      morphinBalls.forEach((ball) => {
        rightBoxSteps.push({ type: "reveal", el: ball, weight: 2 });
      });
      rightBoxSteps.push({
        type: "dynamicText",
        el: morphinDock.querySelector(".morphin-lock-btn"),
        containerEl: morphinDock.querySelector(".morphin-lock-btn"),
      });
    }
    const rightBoxTyper = createSequenceTypewriter(rightBoxSteps);
    rightBoxTyper.setProgress(0);

    // Build Typewriter for Left Box (#hero-intro-box)
    const leftBoxSteps = [];
    if (heroIntroBox) {
      const statusPill = heroIntroBox.querySelector(".status-pill");
      const statusTextSpan = statusPill ? statusPill.querySelector("span:last-child") : null;
      const headlineEl = heroIntroBox.querySelector(".hero-headline");
      const bioEl = heroIntroBox.querySelector(".hero-short-bio");
      const primaryBtn = heroIntroBox.querySelector(".btn-primary");
      const outlineBtn = heroIntroBox.querySelector(".btn-outline");

      leftBoxSteps.push({
        type: "richText",
        el: statusTextSpan,
        containerEl: statusPill,
      });
      leftBoxSteps.push({
        type: "richText",
        el: headlineEl,
      });
      leftBoxSteps.push({
        type: "richText",
        el: bioEl,
      });
      leftBoxSteps.push({
        type: "richText",
        el: primaryBtn,
        containerEl: primaryBtn,
      });
      leftBoxSteps.push({
        type: "richText",
        el: outlineBtn,
        containerEl: outlineBtn,
      });
    }
    const leftBoxTyper = createSequenceTypewriter(leftBoxSteps);
    leftBoxTyper.setProgress(0);

    // Build Typewriter for Center Hint (#hero-center-hint)
    const hintTyper = createSequenceTypewriter(
      heroCenterHint ? [{ type: "richText", el: heroCenterHint }] : []
    );
    hintTyper.setProgress(0);

    // Build Scroll-Driven Typewriter for Section 2 (#habilidades — "O Que Eu Faço"):
    // Box slides in from the right EMPTY, then writes out its header and each of the 4 skill cards as you scroll!
    const section2Track = document.getElementById("section2-scroll-track");
    const section2Card = document.getElementById("habilidades");
    const section2Steps = [];
    if (section2Card) {
      const s2Head = section2Card.querySelector(".section-head");
      if (s2Head) {
        section2Steps.push({ type: "richText", el: s2Head });
      }
      const skillCards = Array.from(section2Card.querySelectorAll(".skill-card"));
      skillCards.forEach((sc) => {
        // First reveal the empty skill-card sliding in from the right, then write its contents on scroll
        section2Steps.push({ type: "reveal", el: sc, weight: 10 });
        section2Steps.push({ type: "richText", el: sc });
      });
    }
    const section2Typer = createSequenceTypewriter(section2Steps);
    section2Typer.setProgress(0);

    // Also build scroll-driven typewriters for the headers/steps of Menu 2 (#exemplos), Menu 3 (#processo), Menu 4 (#contato)
    const extraSectionTypers = ["exemplos", "processo", "contato"].map((secId) => {
      const secEl = document.getElementById(secId);
      if (!secEl) return null;
      const steps = [];
      const headEl = secEl.querySelector(".section-head") || secEl.querySelector(".contact-copy");
      if (headEl) {
        steps.push({ type: "richText", el: headEl });
      }
      if (secId === "processo") {
        Array.from(secEl.querySelectorAll(".p-step")).forEach((pStep) => {
          steps.push({ type: "reveal", el: pStep, weight: 8 });
          steps.push({ type: "richText", el: pStep });
        });
      }
      const typer = createSequenceTypewriter(steps);
      typer.setProgress(0);
      return { secEl, typer };
    }).filter(Boolean);

    // Math helpers for smooth stage transitions
    const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
    const rangeProgress = (val, start, end) => clamp01((val - start) / Math.max(end - start, 0.0001));
    const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

    // Fullscreen Character Mode / Boxes Toggle Button inside #morphin-dock:
    // Locks the scroll and keeps the character photo in clean full screen without framing borders or boxes
    const heroOverlayLayout = document.getElementById("hero-overlay-layout");
    const btnToggleBoxesVis = document.getElementById("btn-toggle-boxes-visibility");
    let isHeroLocked = false;

    if (btnToggleBoxesVis && heroOverlayLayout) {
      btnToggleBoxesVis.addEventListener("click", () => {
        isHeroLocked = !isHeroLocked;
        heroOverlayLayout.classList.toggle("is-boxes-transparent", isHeroLocked);
        document.body.classList.toggle("hero-scroll-locked", isHeroLocked);
        document.documentElement.classList.toggle("hero-scroll-locked", isHeroLocked);

        if (isHeroLocked) {
          window.scrollTo({ top: 0, behavior: "smooth" });
          btnToggleBoxesVis.textContent = "👁 Mostrar Boxes";
          btnToggleBoxesVis.title = "Restaurar boxes e liberar o scroll da página";
        } else {
          btnToggleBoxesVis.textContent = "👁 Boxes";
          btnToggleBoxesVis.title = "Tela cheia: ocultar boxes e prender o scroll";
        }
        needsTimelineRefresh = true;
      });
    }

    // Block wheel, touch and keyboard page scroll while hero-scroll-locked is active
    window.addEventListener(
      "wheel",
      (e) => {
        if (isHeroLocked) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    window.addEventListener(
      "touchmove",
      (e) => {
        if (isHeroLocked) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    window.addEventListener("keydown", (e) => {
      if (
        isHeroLocked &&
        ["Space", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(e.code)
      ) {
        e.preventDefault();
      }
    });

    // Live state for Slower, Smoother First-Scroll Box Entrance & Damped Scroll Inertia
    const menuCards = Array.from(document.querySelectorAll(".parallax-menu-card"));
    let rightBoxTriggered = false;
    let leftBoxTriggered = false;
    let firstScrollTimestamp = 0;
    let rightEnterProgress = 0;
    let leftEnterProgress = 0;
    let hintEnterProgress = 0;
    let rightAutoType = 0;
    let leftAutoType = 0;
    let hintAutoType = 0;
    let rightTypedMax = 0;
    let leftTypedMax = 0;
    let hintTypedMax = 0;
    let section2TypedMax = 0;
    const extraSectionTypedMax = new Array(extraSectionTypers.length).fill(0);
    let hasVisitedSection2 = false;
    let returningToPhoto1 = false;
    let returnLowestScrollY = 0;
    let prevRawScrollY = window.scrollY || 0;
    let smoothScrollY = window.scrollY || 0;
    let lastAppliedScrollY = -999;
    let needsTimelineRefresh = true;
    let lastActiveSectionId = "hero";
    let lastTickTime = performance.now();

    window.addEventListener("resize", () => {
      needsTimelineRefresh = true;
    }, { passive: true });

    window.addEventListener("touchend", () => {
      if (returningToPhoto1 && (window.scrollY || 0) > 4) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, { passive: true });

    function applyTimelineAt(rawScrollY, scrollY, now, dtSec) {
      if (isHeroLocked) {
        rawScrollY = 0;
        scrollY = 0;
      }

      const vh = window.innerHeight || 800;
      const vw = window.innerWidth || 1280;
      const isMobile = vw <= 768;
      const section2EnterScrollPx = vh * 1.15;

      const rawDeltaY = rawScrollY - prevRawScrollY;
      prevRawScrollY = rawScrollY;

      // Detect when user has reached Section 2 (#habilidades) and then scrolls UP back into Section 1 (#hero):
      // Instead of playing the Hero boxes in reverse over the character's face and un-typing texts backwards,
      // return Section 1 directly to the clean initial screen (Photo 1).
      if (rawScrollY >= vh * 1.05) {
        hasVisitedSection2 = true;
        returningToPhoto1 = false;
      } else if (hasVisitedSection2 && rawDeltaY < -0.5 && rawScrollY < vh * 1.05) {
        returningToPhoto1 = true;
        hasVisitedSection2 = false;
        returnLowestScrollY = rawScrollY;
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      if (returningToPhoto1) {
        if (rawScrollY < returnLowestScrollY) {
          returnLowestScrollY = rawScrollY;
        }
        if (rawScrollY <= 10 || rawScrollY > returnLowestScrollY + 24) {
          returningToPhoto1 = false;
        }
      }

      // Auto-pause WebGL loop when Hero stage is completely covered by Section 2+
      window.__isHeroStageVisible = isHeroLocked || scrollY <= vh * 2.35;

      // 0. Initial Scroll Cue: visible at scrollY = 0 (or when returning to Photo 1)
      if (heroScrollCue) {
        heroScrollCue.classList.toggle("is-cue-hidden", (rawScrollY > 10 && !returningToPhoto1) || isHeroLocked);
      }

      // 1. Trigger sequence on First Scroll (rawScrollY >= 10px):
      //    - On Mobile (isMobile): 1st scroll recedes the character into the background (Photo 3 red circle/rectangle)
      //      and shows ONLY #morphin-dock below him! Then scrolling further (scrollY >= 54vh) swaps #morphin-dock
      //      out and brings #hero-intro-box into the bottom dock!
      //    - When returning from Section 2 to Section 1 (returningToPhoto1): immediately resets to Photo 1 state!
      if (rawScrollY < 8 || returningToPhoto1) {
        rightBoxTriggered = false;
        leftBoxTriggered = false;
        firstScrollTimestamp = 0;
        if (returningToPhoto1) {
          rightEnterProgress = 0;
          leftEnterProgress = 0;
          hintEnterProgress = 0;
        } else {
          rightEnterProgress = Math.max(0, rightEnterProgress - dtSec * 1.8);
          leftEnterProgress = Math.max(0, leftEnterProgress - dtSec * 1.8);
          hintEnterProgress = Math.max(0, hintEnterProgress - dtSec * 1.8);
        }
        rightAutoType = 0;
        leftAutoType = 0;
        hintAutoType = 0;
        rightTypedMax = 0;
        leftTypedMax = 0;
        hintTypedMax = 0;
      } else {
        if (!rightBoxTriggered) {
          rightBoxTriggered = true;
          firstScrollTimestamp = now;
        }
        if (isMobile) {
          leftBoxTriggered = scrollY >= vh * 0.54;
          if (!leftBoxTriggered) {
            leftEnterProgress = Math.max(0, leftEnterProgress - dtSec * 2.4);
            leftAutoType = 0;
          }
        } else if (!leftBoxTriggered && (now - firstScrollTimestamp >= 1250 || scrollY >= vh * 0.24)) {
          leftBoxTriggered = true;
        }
      }

      if (rightBoxTriggered) {
        rightEnterProgress = Math.min(1, rightEnterProgress + dtSec * 1.15);
        if (rightEnterProgress > 0.42) {
          rightAutoType = Math.min(1, rightAutoType + dtSec * 0.65);
        }
      }
      if (leftBoxTriggered) {
        leftEnterProgress = Math.min(1, leftEnterProgress + dtSec * 1.05);
        hintEnterProgress = Math.min(1, hintEnterProgress + dtSec * 0.95);
        if (leftEnterProgress > 0.42) {
          leftAutoType = Math.min(1, leftAutoType + dtSec * 0.48);
          hintAutoType = Math.min(1, hintAutoType + dtSec * 0.78);
        }
      }

      const pEnterR = returningToPhoto1
        ? 0
        : Math.max(easeOutCubic(rightEnterProgress), easeOutCubic(rangeProgress(scrollY, 15, vh * 0.30)));
      const pEnterL = returningToPhoto1
        ? 0
        : isMobile
          ? Math.max(easeOutCubic(leftEnterProgress), easeOutCubic(rangeProgress(scrollY, vh * 0.54, vh * 0.78)))
          : Math.max(easeOutCubic(leftEnterProgress), easeOutCubic(rangeProgress(scrollY, vh * 0.20, vh * 0.48)));
      const pEnterH = returningToPhoto1
        ? 0
        : Math.max(easeOutCubic(hintEnterProgress), easeOutCubic(rangeProgress(scrollY, vh * 0.25, vh * 0.52)));

      // Sync mobile 3D character recession progress (0 = Photo 1 full size, 1 = Photo 3 receded into red circle/rectangle)
      window.__mobileHeroRecedeProgress = isMobile && !isHeroLocked && !returningToPhoto1 ? pEnterR : 0;

      // Header follows Right Box entrance on first scroll
      if (siteHeader) {
        siteHeader.classList.toggle("is-entrance-hidden", pEnterR < 0.02);
        siteHeader.style.setProperty("--header-y", `${((1 - pEnterR) * -36).toFixed(1)}px`);
        siteHeader.style.setProperty("--header-opacity", pEnterR.toFixed(3));
        document.body.classList.toggle("is-header-visible", pEnterR > 0.15);
      }

      // 2. Main Character Stage (#hero-frame-card):
      //    - Never lifts the canvas upward in CSS (--char-lift-y: 0px) so the character is never cut off at the bottom
      //    - Closes its frame border at scrollY: 42vh -> 110vh (unless returningToPhoto1)
      //    - Recedes smoothly in parallax as Menu 1 (#habilidades) rises over it
      if (heroFrameCard && heroViewport) {
        if (isHeroLocked || returningToPhoto1) {
          heroViewport.style.padding = "0px";
          heroViewport.style.visibility = "visible";
          heroFrameCard.style.borderRadius = "0px";
          heroFrameCard.style.borderWidth = "0px";
          heroFrameCard.style.transform = "none";
          heroFrameCard.style.filter = "brightness(1)";
          heroFrameCard.style.pointerEvents = "auto";
          heroFrameCard.style.setProperty("--char-lift-y", "0px");
        } else {
          const zoomComp = window.__uiZoomCompensation || 1;
          const pFrame = easeInOutCubic(rangeProgress(scrollY, vh * 0.42, vh * 1.10));
          const pHeroCovered = easeInOutCubic(rangeProgress(scrollY, section2EnterScrollPx, vh * 2.10));
          const maxFramePx = (vw > 1100 ? 76 : vw > 680 ? 28 : 14) * zoomComp;
          const padPx = (pFrame * maxFramePx).toFixed(1);
          const radius = Math.round(pFrame * (vw > 680 ? 26 : 20) * zoomComp);
          const borderW = (pFrame * 4 * zoomComp).toFixed(1);

          heroFrameCard.style.setProperty("--char-lift-y", "0px");

          const parallaxLiftPx = -Math.max(0, scrollY - section2EnterScrollPx) * 0.42;
          const heroScale = 1 - pHeroCovered * 0.065;
          const heroBright = 1 - pHeroCovered * 0.48;

          heroViewport.style.padding = `${padPx}px`;
          heroViewport.style.visibility = scrollY > vh * 2.35 ? "hidden" : "visible";
          heroFrameCard.style.borderRadius = `${radius}px`;
          heroFrameCard.style.borderWidth = `${borderW}px`;
          heroFrameCard.style.transform = `translate3d(0, ${parallaxLiftPx.toFixed(1)}px, 0) scale(${heroScale.toFixed(4)})`;
          heroFrameCard.style.filter = "none";
          heroFrameCard.style.pointerEvents = scrollY > vh * 1.55 ? "none" : "auto";
        }
      }

      // 3. Right Box (#morphin-dock):
      if (morphinDock) {
        if (isHeroLocked) {
          morphinDock.classList.remove("is-entrance-hidden");
          morphinDock.style.setProperty("--scroll-y", "0px");
          morphinDock.style.setProperty("--box-opacity", "1");
        } else if (returningToPhoto1) {
          morphinDock.classList.add("is-entrance-hidden");
          morphinDock.style.setProperty("--box-opacity", "0");
        } else {
          const exitStartR = isMobile ? vh * 0.36 : vh * 1.12;
          const exitEndR = isMobile ? vh * 0.54 : vh * 1.78;
          const fadeStartR = isMobile ? vh * 0.38 : vh * 1.62;
          const pExitR = easeInOutCubic(rangeProgress(scrollY, exitStartR, exitEndR));
          const enterOffsetPx = (1 - pEnterR) * 80;
          // On mobile, fade out in place at the bottom dock instead of floating up across the character's face
          const exitOffsetPx = -pExitR * (isMobile ? 16 : vh * 1.05);
          const totalRightY = enterOffsetPx + exitOffsetPx;
          const rightOpacity = pEnterR * (1 - rangeProgress(scrollY, fadeStartR, exitEndR));

          morphinDock.classList.toggle("is-entrance-hidden", rightOpacity < 0.02);
          morphinDock.style.setProperty("--scroll-y", `${totalRightY.toFixed(1)}px`);
          morphinDock.style.setProperty("--box-opacity", rightOpacity.toFixed(3));

          const scrollTypeR = rangeProgress(scrollY, 25, vh * 0.35);
          if (rightOpacity < 0.01) {
            rightTypedMax = 0;
          } else {
            rightTypedMax = Math.max(rightTypedMax, rightAutoType, scrollTypeR);
          }
          rightBoxTyper.setProgress(rawScrollY < 8 ? 0 : rightTypedMax);
        }
      }

      // 4. Left Box (#hero-intro-box):
      if (heroIntroBox) {
        if (isHeroLocked || returningToPhoto1) {
          heroIntroBox.classList.add("is-entrance-hidden");
          heroIntroBox.style.setProperty("--box-opacity", "0");
        } else {
          const exitStartL = isMobile ? vh * 0.88 : vh * 1.48;
          const exitEndL = isMobile ? vh * 1.15 : vh * 2.15;
          const fadeStartL = isMobile ? vh * 0.90 : vh * 1.98;
          const pExitL = easeInOutCubic(rangeProgress(scrollY, exitStartL, exitEndL));
          const enterOffsetPx = (1 - pEnterL) * 80;
          // On mobile, fade out in place at the bottom dock instead of floating up across the character's face (Photo 2)
          const exitOffsetPx = -pExitL * (isMobile ? 16 : vh * 1.05);
          const totalLeftY = enterOffsetPx + exitOffsetPx;
          const leftOpacity = pEnterL * (1 - rangeProgress(scrollY, fadeStartL, exitEndL));

          heroIntroBox.classList.toggle("is-entrance-hidden", leftOpacity < 0.02);
          heroIntroBox.style.setProperty("--scroll-y", `${totalLeftY.toFixed(1)}px`);
          heroIntroBox.style.setProperty("--box-opacity", leftOpacity.toFixed(3));

          const scrollTypeL = rangeProgress(
            scrollY,
            isMobile ? vh * 0.54 : vh * 0.22,
            isMobile ? vh * 0.78 : vh * 0.56
          );
          if (leftOpacity < 0.01) {
            leftTypedMax = 0;
          } else {
            leftTypedMax = Math.max(leftTypedMax, leftAutoType, scrollTypeL);
          }
          leftBoxTyper.setProgress(rawScrollY < 8 ? 0 : leftTypedMax);
        }
      }

      // 5. Center Hint (#hero-center-hint):
      if (heroCenterHint) {
        if (returningToPhoto1) {
          heroCenterHint.classList.add("is-entrance-hidden");
          heroCenterHint.style.setProperty("--box-opacity", "0");
        } else {
          const pExitH = easeInOutCubic(rangeProgress(scrollY, vh * 1.05, vh * 1.58));
          const hintY = (1 - pEnterH) * 35 - pExitH * (vh * 0.95);
          const hintOpacity = pEnterH * (1 - rangeProgress(scrollY, vh * 1.42, vh * 1.60));

          heroCenterHint.classList.toggle("is-entrance-hidden", hintOpacity < 0.02);
          heroCenterHint.style.setProperty("--scroll-y", `${hintY.toFixed(1)}px`);
          heroCenterHint.style.setProperty("--box-opacity", hintOpacity.toFixed(3));

          const scrollTypeH = rangeProgress(scrollY, vh * 0.24, vh * 0.52);
          if (hintOpacity < 0.01) {
            hintTypedMax = 0;
          } else {
            hintTypedMax = Math.max(hintTypedMax, hintAutoType, scrollTypeH);
          }
          hintTyper.setProgress(rawScrollY < 8 ? 0 : hintTypedMax);
        }
      }

      // 6. Stacked Menu Sections Parallax (#habilidades -> #exemplos -> #processo -> #contato):
      //    - Pure untransformed coordinates for 60fps smooth flow with zero layout thrashing
      //    - Section 2 (#habilidades) slides in FROM THE RIGHT (+48vw -> 0px) and its cards write on scroll
      //    - Section 3 (#exemplos, idx 1) connects cleanly BELOW Section 2's card box (does NOT cover Section 2)
      const untransformedTops = menuCards.map((card) => {
        const r = card.getBoundingClientRect();
        return r.top - (card.__lastAppliedY || 0);
      });

      menuCards.forEach((card, idx) => {
        const uTop = untransformedTops[idx];
        const nextUTop = idx + 1 < untransformedTops.length ? untransformedTops[idx + 1] : null;

        // Slide in from the right (+48vw desktop / +12vw mobile -> 0px) as the card enters from the bottom
        const slideEndVh = isMobile ? vh * 0.38 : vh * 0.62;
        const pSlideIn = easeOutCubic(rangeProgress(vh - uTop, vh * 0.02, slideEndVh));
        const slideXPx = (1 - pSlideIn) * (vw * (isMobile ? 0.12 : 0.48));

        const enterP = easeOutCubic(rangeProgress(vh - uTop, 0, vh * 0.82));
        const innerY = (1 - enterP) * 24;

        let coverP = 0;
        // Section 3 (#exemplos, idx === 1) connects cleanly BELOW Section 2 (#habilidades, idx === 0)!
        // Therefore Section 2 does NOT get covered or dimmed by Section 3!
        if (nextUTop !== null && idx !== 0) {
          coverP = easeInOutCubic(rangeProgress(vh - nextUTop, vh * 0.04, vh * 0.88));
        }

        const cardParallaxY = coverP * (vh * 0.16);
        const cardScale = 1 - coverP * 0.04;
        const cardBrightness = 1 - coverP * 0.36;

        card.__lastAppliedY = cardParallaxY;
        card.style.setProperty("--inner-parallax-y", `${innerY.toFixed(1)}px`);
        card.style.setProperty("--card-slide-x", `${slideXPx.toFixed(1)}px`);
        card.style.setProperty("--card-parallax-y", `${cardParallaxY.toFixed(1)}px`);
        card.style.setProperty("--card-parallax-scale", cardScale.toFixed(4));
        card.style.setProperty("--card-brightness", "1");
      });

      // Drive typewriter on Section 2 (#habilidades) as it settles into view (never un-types backwards while visible)
      const s2UTop = untransformedTops[0] !== undefined ? untransformedTops[0] : vh;
      const s2WriteP = clamp01((vh * 0.88 - s2UTop) / (vh * 0.65));
      if (s2UTop > vh * 1.02) {
        section2TypedMax = 0;
      } else {
        section2TypedMax = Math.max(section2TypedMax, s2WriteP);
      }
      section2Typer.setProgress(section2TypedMax);

      // Drive scroll-based typewriter on the headers/steps of Menu 2, Menu 3, Menu 4 as they enter
      extraSectionTypers.forEach(({ secEl, typer }, tIdx) => {
        const cardIdx = tIdx + 1;
        const uTop = untransformedTops[cardIdx] !== undefined ? untransformedTops[cardIdx] : vh;
        const pSecWrite = clamp01((vh * 0.85 - uTop) / (vh * 0.58));
        if (uTop > vh * 1.02) {
          extraSectionTypedMax[tIdx] = 0;
        } else {
          extraSectionTypedMax[tIdx] = Math.max(extraSectionTypedMax[tIdx] || 0, pSecWrite);
        }
        typer.setProgress(extraSectionTypedMax[tIdx]);
      });

      // Active navigation link highlight + automatic menu Ranger accent color sync on scroll
      let currentId = "hero";
      let currentRangerKey = "silver";
      sections.forEach((sec) => {
        const rect = sec.getBoundingClientRect();
        if (rect.top <= vh * 0.42) {
          currentId = sec.id;
          if (sec.dataset.sectionRanger) {
            currentRangerKey = sec.dataset.sectionRanger;
          }
        }
      });
      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === `#${currentId}`);
      });
      if (currentId !== lastActiveSectionId) {
        lastActiveSectionId = currentId;
        if (typeof window.__setPortfolioRangerFromScroll === "function") {
          window.__setPortfolioRangerFromScroll(currentRangerKey);
        }
      }
    }

    function tickTimeline(now) {
      const dtSec = Math.min((now - lastTickTime) / 1000, 0.1);
      lastTickTime = now;
      const targetY = window.scrollY || 0;
      const lerpFactor = 1 - Math.exp(-dtSec * 4.5);
      smoothScrollY += (targetY - smoothScrollY) * lerpFactor;
      if (Math.abs(targetY - smoothScrollY) < 0.25) {
        smoothScrollY = targetY;
      }

      const isScrollMoving =
        Math.abs(targetY - smoothScrollY) >= 0.05 ||
        Math.abs(smoothScrollY - lastAppliedScrollY) >= 0.05;
      const isEntranceAnimating =
        (rightBoxTriggered && (rightEnterProgress < 1 || rightAutoType < 1)) ||
        (leftBoxTriggered && (leftEnterProgress < 1 || leftAutoType < 1 || hintEnterProgress < 1 || hintAutoType < 1)) ||
        (!rightBoxTriggered && (rightEnterProgress > 0 || leftEnterProgress > 0 || hintEnterProgress > 0)) ||
        (rightBoxTriggered && !leftBoxTriggered);

      if (isScrollMoving || isEntranceAnimating || needsTimelineRefresh) {
        lastAppliedScrollY = smoothScrollY;
        needsTimelineRefresh = false;
        applyTimelineAt(targetY, smoothScrollY, now, dtSec);
      }
      requestAnimationFrame(tickTimeline);
    }

    requestAnimationFrame(tickTimeline);

    // 2. Demo Tabs Switcher (Exemplo 1, Exemplo 2, Exemplo 3)
    const demoTabs = document.querySelectorAll("[data-demo-tab]");
    const boxLeitor = document.getElementById("demo-box-leitor");
    const boxWa = document.getElementById("demo-box-whatsapp");
    const boxTrafego = document.getElementById("demo-box-trafego");

    demoTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const key = tab.dataset.demoTab;
        demoTabs.forEach((t) => t.classList.toggle("is-active", t === tab));
        if (boxLeitor) boxLeitor.hidden = key !== "leitor";
        if (boxWa) boxWa.hidden = key !== "whatsapp";
        if (boxTrafego) boxTrafego.hidden = key !== "trafego";
      });
    });

    // 3. Exemplo 1: Leitor Automático de Notas Fiscais com IA
    let selectedDocIdx = 0;
    let sheetTotal = 12400;
    const docCards = document.querySelectorAll("[data-doc-index]");
    const btnRunOcr = document.getElementById("btn-run-ocr");
    const scannerPreview = document.getElementById("scanner-preview");
    const scanDocTitle = document.getElementById("scan-doc-title");
    const scanStatusPill = document.getElementById("scan-status-pill");
    const scanVendor = document.getElementById("scan-vendor");
    const scanCnpj = document.getElementById("scan-cnpj");
    const scanPay = document.getElementById("scan-pay");
    const scanVal = document.getElementById("scan-val");
    const sheetTbody = document.getElementById("sheet-tbody");
    const sheetTotalEl = document.getElementById("sheet-total");

    function selectSampleDoc(idx) {
      selectedDocIdx = idx;
      const doc = SAMPLE_DOCS[idx] || SAMPLE_DOCS[0];
      docCards.forEach((c) => c.classList.toggle("is-selected", Number(c.dataset.docIndex) === idx));
      if (scanDocTitle) scanDocTitle.textContent = doc.title;
      if (scanVendor) scanVendor.textContent = doc.vendor;
      if (scanCnpj) scanCnpj.textContent = doc.cnpj;
      if (scanPay) scanPay.textContent = doc.pay;
      if (scanVal) scanVal.textContent = `R$ ${doc.valStr}`;
      if (scanStatusPill) scanStatusPill.textContent = "Pronto para leitura";
    }

    docCards.forEach((card) => {
      card.addEventListener("click", () => {
        selectSampleDoc(Number(card.dataset.docIndex));
      });
    });

    if (btnRunOcr) {
      btnRunOcr.addEventListener("click", () => {
        const doc = SAMPLE_DOCS[selectedDocIdx] || SAMPLE_DOCS[0];
        if (scannerPreview) scannerPreview.classList.add("is-scanning");
        if (scanStatusPill) scanStatusPill.textContent = "🤖 Lendo via IA...";
        btnRunOcr.disabled = true;

        setTimeout(() => {
          if (scannerPreview) scannerPreview.classList.remove("is-scanning");
          if (scanStatusPill) scanStatusPill.textContent = "✓ Extraído e Salvo!";
          btnRunOcr.disabled = false;

          sheetTotal += doc.valNum;
          if (sheetTbody) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td>${doc.vendor}</td>
              <td>${doc.pay}</td>
              <td class="text-accent">R$ ${doc.valStr}</td>
            `;
            sheetTbody.prepend(tr);
          }
          if (sheetTotalEl) {
            sheetTotalEl.textContent = `Total: R$ ${sheetTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          }
        }, 700);
      });
    }

    // 4. Exemplo 2: Robô de Atendimento & Vendas no WhatsApp
    const waMessages = document.getElementById("wa-messages");
    const waChips = document.querySelectorAll("[data-wa-msg]");
    const crmStageOut = document.getElementById("crm-stage-out");
    const crmValOut = document.getElementById("crm-val-out");
    const crmLogOut = document.getElementById("crm-log-out");

    function getWaBotReply(msg) {
      if (msg.includes("valor")) {
        return "Nossos projetos sob medida começam a partir de R$ 2.500 e já incluem design, código e automação. Quer agendar uma demonstração rápida de 15 minutos?";
      }
      if (msg.includes("agendar")) {
        return "Perfeito! Reservei seu horário na agenda para amanhã às 15h e já enviei o link da chamada no seu calendário. Posso ajudar em mais algo?";
      }
      return "Pagamento confirmado automaticamente pelo sistema! Seu projeto já foi iniciado no painel e nossa equipe acabou de ser notificada. 🚀";
    }

    waChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const userText = chip.dataset.waMsg;
        const stage = chip.dataset.crmStage;
        const val = chip.dataset.crmVal;

        if (waMessages) {
          const userDiv = document.createElement("div");
          userDiv.className = "wa-msg wa-msg--user";
          userDiv.textContent = userText;
          waMessages.appendChild(userDiv);
          waMessages.scrollTop = waMessages.scrollHeight;
        }

        setTimeout(() => {
          if (waMessages) {
            const botDiv = document.createElement("div");
            botDiv.className = "wa-msg wa-msg--bot";
            botDiv.textContent = getWaBotReply(userText);
            waMessages.appendChild(botDiv);
            waMessages.scrollTop = waMessages.scrollHeight;
          }
          if (crmStageOut) crmStageOut.textContent = stage;
          if (crmValOut) crmValOut.textContent = val;
          if (crmLogOut) {
            crmLogOut.textContent = `✓ IA respondeu em 1,2s → Status atualizado sozinho para "${stage}" (${val}).`;
          }
        }, 420);
      });
    });

    // 5. Exemplo 3: Comparador Simples de Tráfego Pago
    const budgetInput = document.getElementById("roi-budget");
    const ticketInput = document.getElementById("roi-ticket");
    const budgetVal = document.getElementById("roi-budget-val");
    const ticketVal = document.getElementById("roi-ticket-val");
    const basicLeadsEl = document.getElementById("basic-leads");
    const basicRevEl = document.getElementById("basic-rev");
    const proLeadsEl = document.getElementById("pro-leads");
    const proRevEl = document.getElementById("pro-rev");

    function updateTrafficComparison() {
      if (!budgetInput || !ticketInput) return;
      const budget = Number(budgetInput.value);
      const ticket = Number(ticketInput.value);

      const basicLeads = Math.round(budget / 50);
      const basicSales = Math.max(1, Math.round(basicLeads * 0.12));
      const basicRev = basicSales * ticket;

      const proLeads = Math.round(basicLeads * 1.6);
      const proSales = Math.max(2, Math.round(proLeads * 0.22));
      const proRev = proSales * ticket;

      if (budgetVal) budgetVal.textContent = `R$ ${budget.toLocaleString("pt-BR")}`;
      if (ticketVal) ticketVal.textContent = `R$ ${ticket.toLocaleString("pt-BR")}`;
      if (basicLeadsEl) basicLeadsEl.textContent = `${basicLeads} contatos`;
      if (basicRevEl) basicRevEl.textContent = `R$ ${basicRev.toLocaleString("pt-BR")}`;
      if (proLeadsEl) proLeadsEl.textContent = `${proLeads} contatos`;
      if (proRevEl) proRevEl.textContent = `R$ ${proRev.toLocaleString("pt-BR")}`;
    }

    [budgetInput, ticketInput].forEach((el) => {
      if (el) el.addEventListener("input", updateTrafficComparison);
    });
    updateTrafficComparison();

    // 6. Contact Briefing Form
    const serviceChips = document.querySelectorAll("#service-selector .service-chip");
    const clientName = document.getElementById("client-name");
    const clientContact = document.getElementById("client-contact");
    const clientGoal = document.getElementById("client-goal");
    const briefingForm = document.getElementById("briefing-form");
    const copyFeedback = document.getElementById("copy-feedback");

    serviceChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        chip.classList.toggle("is-selected");
      });
    });

    if (briefingForm) {
      briefingForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const selected = Array.from(serviceChips)
          .filter((c) => c.classList.contains("is-selected"))
          .map((c) => c.dataset.service);
        const servicesStr = selected.length ? selected.join(" + ") : "Projeto Digital";
        const nameStr = clientName && clientName.value.trim() ? clientName.value.trim() : "";
        const contactStr = clientContact && clientContact.value.trim() ? clientContact.value.trim() : "";
        const goalStr = clientGoal && clientGoal.value.trim() ? clientGoal.value.trim() : "";

        const msg = `Olá Marcos Siqueira! Meu nome é ${nameStr} (${contactStr}). Tenho interesse em: ${servicesStr}. Objetivo: ${goalStr}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(msg).catch(() => { });
        }
        if (copyFeedback) {
          copyFeedback.textContent = "✓ Mensagem copiada! Agora é só colar e enviar.";
          setTimeout(() => {
            copyFeedback.textContent = "";
          }, 4000);
        }
      });
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    initPortfolioUI();
    initLiquidMotion();
  });
})();
