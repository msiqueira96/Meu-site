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

  // Adaptive Hardware Tier Detection for Older / Low-End Devices
  const IS_MOBILE_DEVICE =
    window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  const IS_LOW_END =
    (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4) ||
    (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4);
  if (IS_LOW_END) {
    document.documentElement.classList.add("is-low-end");
  }

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
    varying vec2 vUv;

    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vUv = uv;
    }
  `;

  const COMPOSITION_FRAG = `
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
    uniform sampler2D tRetrowaveBg;
    uniform vec2 uMouseParallax;

    uniform vec3 uRangerColor;
    uniform float uRangerTintMix;

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

      // Liquid cursor mask (smoothstep prevents pixelated stair-step edges on the liquid reveal)
      vec4 textureCursorEffect = texture2D(tCursorEffect, vec2(0.025 + vUv.x * 0.95, 0.025 + vUv.y * 0.95));
      textureCursorEffect.rgb = 1.0 - textureCursorEffect.rgb;
      float cursorEffect = smoothstep(0.08, 0.16, textureCursorEffect.r);

      // =======================================================================
      // Interactive Retrowave Palms, 3D Wireframe Floor & Sun Heat-Haze Stage
      // =======================================================================
      float imgAspect = 1.777;
      vec2 coverScale = uAspect > imgAspect
        ? vec2(1.0, imgAspect / max(uAspect, 0.1))
        : vec2(uAspect / imgAspect, 1.0);
      vec2 baseUv = (vUv - 0.5) * coverScale * 0.93 + 0.5;

      // Mouse position in image UV space for interactive palm hover & 3D floor light
      vec2 mouseScreenUv = uMouseParallax * 0.5 + 0.5;
      vec2 mouseBgUv = (mouseScreenUv - 0.5) * coverScale * 0.93 + 0.5;

      // 1. REAL 3D PERSPECTIVE FLOOR DEFORMATION (bgUv.y < 0.49):
      //    Closer foreground wireframe terrain shifts and tilts in 3D perspective relative to the distant horizon
      float floorProx = clamp((0.485 - baseUv.y) / 0.485, 0.0, 1.0);
      float floorDepthCurve = floorProx * floorProx;

      vec2 bgUv = baseUv;
      // Gentle upper camera drift + strong 3D stereographic ground plane parallax on the wireframe floor
      bgUv.x += sin(uTime * 0.35) * 0.006 - uMouseParallax.x * (0.010 + floorDepthCurve * 0.034);
      bgUv.x = 0.492 + (bgUv.x - 0.492) * (1.0 - uMouseParallax.y * 0.038 * floorProx);
      bgUv.y += cos(uTime * 0.28) * 0.004 - uMouseParallax.y * (0.006 + floorDepthCurve * 0.018);
      // Subtle 3D rolling terrain elevation wave across the wireframe hills
      bgUv.y += sin(bgUv.x * 16.0 + uTime * 1.8) * 0.0032 * floorProx * (1.0 - floorProx);

      // 2. SOLAR THERMAL HEAT-HAZE ("efeito de calor no sol"):
      //    Convective rising heat mirage distortion on and around the giant sliced neon sun
      vec2 sunCenter = vec2(0.490, 0.655);
      float sunDist = length((bgUv - sunCenter) * vec2(1.62, 1.0));
      float sunHeatZone = smoothstep(0.36, 0.05, sunDist);
      float horizonHeatZone = smoothstep(0.62, 0.44, bgUv.y) * smoothstep(0.40, 0.50, bgUv.y);
      float totalHeatMask = max(sunHeatZone, horizonHeatZone * 0.75);

      float heatWaveX = sin(bgUv.y * 140.0 - uTime * 5.6 + sin(bgUv.x * 48.0 + uTime * 2.4)) * 0.0028 * totalHeatMask;
      float heatWaveY = sin(bgUv.x * 82.0 + bgUv.y * 105.0 - uTime * 4.8) * 0.0018 * sunHeatZone;
      vec2 heatedUv = clamp(bgUv + vec2(heatWaveX, heatWaveY), 0.002, 0.998);

      vec3 retroScene = texture2D(tRetrowaveBg, heatedUv).rgb;

      // 3. INTERACTIVE HOVER-SWAYING PALM TREES ("palmeiras balançando naturalmente ao passar o hover"):
      //    6 palm trees along the horizon (x = 0.076, 0.240, 0.392, 0.582, 0.735, 0.896, y = 0.48..0.82).
      //    Uses dark-silhouette foreground/background separation so palms sway freely without ghosting or warping the sun!
      float palmYMask = smoothstep(0.47, 0.51, bgUv.y) * smoothstep(0.83, 0.75, bgUv.y);
      if (palmYMask > 0.001) {
        float px = bgUv.x;
        float palmCenter = px < 0.158 ? 0.076
                         : px < 0.316 ? 0.240
                         : px < 0.487 ? 0.392
                         : px < 0.658 ? 0.582
                         : px < 0.815 ? 0.735
                                      : 0.896;
        float palmId = floor(palmCenter * 10.0 + 0.5);
        float distFromPalmX = abs(px - palmCenter);
        float palmColMask = smoothstep(0.075, 0.012, distFromPalmX) * palmYMask;

        if (palmColMask > 0.001) {
          // Height from trunk root (0.48) to crown top (0.80)
          float h = clamp((bgUv.y - 0.48) / 0.32, 0.0, 1.0);
          float trunkBend = h * h * (1.35 - 0.35 * h);

          // Hover detection: triggers when mouse cursor or liquid trail passes over this specific palm tree
          float mouseDistToPalm = length((mouseBgUv - vec2(palmCenter, 0.65)) * vec2(1.45, 1.0));
          float hoverProximity = smoothstep(0.19, 0.0, mouseDistToPalm);
          float hoverStrength = clamp(hoverProximity * 1.25 + cursorEffect * 0.95, 0.0, 1.6);

          // Natural tropical breeze + elastic hover wind gust + directional brush push from cursor
          float idleBreeze = sin(uTime * 2.1 + palmId * 1.7) * 0.0032 + cos(uTime * 3.4 + palmId * 2.3) * 0.0014;
          float hoverOsc = sin(uTime * 7.8 + palmId * 1.9 - h * 2.6) * 0.014 * hoverStrength;
          float cursorPush = clamp(mouseBgUv.x - palmCenter, -0.09, 0.09) * -0.11 * hoverProximity;

          // Individual palm frond rustling in the upper crown (y > 0.56)
          float crownZone = smoothstep(0.55, 0.65, bgUv.y);
          float frondFlutterX = sin(bgUv.y * 155.0 + bgUv.x * 115.0 - uTime * (5.2 + hoverStrength * 8.0))
                              * (0.0011 + 0.0042 * hoverStrength) * crownZone;
          float frondFlutterY = cos(bgUv.x * 140.0 - bgUv.y * 90.0 + uTime * (4.8 + hoverStrength * 7.5))
                              * (0.0006 + 0.0024 * hoverStrength) * crownZone;

          float swayX = (idleBreeze + hoverOsc + cursorPush) * trunkBend + frondFlutterX;
          float swayY = frondFlutterY * trunkBend;

          vec2 swayedUv = clamp(heatedUv - vec2(swayX, swayY), 0.002, 0.998);
          vec3 swayedSample = texture2D(tRetrowaveBg, swayedUv).rgb;

          // Reconstruct clean sky/sun stripe behind the static palm position by sampling adjacent bright horizon pixels
          vec2 fillUv = clamp(heatedUv + vec2((px < palmCenter ? -0.022 : 0.022), 0.0), 0.002, 0.998);
          vec3 cleanBackdrop = max(retroScene, texture2D(tRetrowaveBg, fillUv).rgb);

          // Composite swayed dark palm silhouette cleanly onto the reconstructed sky/sun backdrop
          float swayedLuma = dot(swayedSample, vec3(0.333));
          float cleanLuma = dot(cleanBackdrop, vec3(0.333));
          float isPalmSilhouette = smoothstep(cleanLuma + 0.02, cleanLuma - 0.08, swayedLuma);
          vec3 compositedPalm = mix(cleanBackdrop, swayedSample, isPalmSilhouette);

          retroScene = mix(retroScene, compositedPalm, palmColMask);
        }
      }

      // 4. REAL 3D WIREFRAME FLOOR LIGHT ANIMATION ("animação da luz passando entre as linhas"):
      vec3 cyberCyan = vec3(0.0, 0.85, 1.0);
      vec3 cyberMagenta = vec3(1.0, 0.02, 0.48);
      vec3 cyberViolet = vec3(0.65, 0.12, 1.0);
      vec3 dualAccent = mix(cyberCyan, cyberMagenta, clamp(vUv.x * 0.55 + (1.0 - vUv.y) * 0.45, 0.0, 1.0));

      float floorRegion = smoothstep(0.50, 0.42, bgUv.y);
      if (floorRegion > 0.001) {
        // Isolate the glowing wireframe lines of the 3D terrain from the dark valley quads
        float lineSignal = retroScene.r * 1.55 + retroScene.b * 0.55 - retroScene.g * 0.4;
        float gridLineMask = smoothstep(0.20, 0.42, lineSignal) * floorRegion;

        // 3D perspective depth coordinate (Z from vanishing point) & valley lane angle
        float perspZ = 1.15 / max(0.505 - bgUv.y, 0.028);
        float laneAngle = (bgUv.x - 0.492) / max(0.505 - bgUv.y, 0.035);

        // Wave 1: 3D depth light pulses racing along the horizontal wireframe rings
        float zPulse1 = pow(0.5 + 0.5 * sin(perspZ * 2.1 - uTime * 4.2), 6.0);
        // Wave 2: Counter-traveling laser streams along the longitudinal mountain & valley lines
        float laneStream = pow(0.5 + 0.5 * sin(laneAngle * 14.0 - perspZ * 1.3 + uTime * 5.0), 6.0);
        // Wave 3: Interactive 3D hover energy ring expanding along the floor lines around the mouse
        float mouseFloorDist = length((bgUv - mouseBgUv) * vec2(1.4, 1.0));
        float hoverGridRing = smoothstep(0.24, 0.0, mouseFloorDist) * (0.65 + 0.35 * sin(mouseFloorDist * 45.0 - uTime * 8.0));

        vec3 lineLightColor = mix(cyberMagenta, cyberCyan, 0.5 + 0.5 * sin(laneAngle * 3.0 + uTime * 1.8));
        vec3 hoverLineColor = mix(cyberCyan, cyberViolet, 0.4);

        vec3 gridEmission = lineLightColor * (zPulse1 * 0.85 + laneStream * 0.75)
                          + hoverLineColor * ((hoverGridRing + cursorEffect * 0.75) * 0.95);

        retroScene += gridLineMask * gridEmission * (0.45 + 0.55 * floorProx);
      }

      // 5. Thermal Solar Corona & Horizon Glow + Subtle CRT Scanlines
      float sunCorona = smoothstep(0.45, 0.0, sunDist);
      float heatPulse = 0.5 + 0.5 * sin(uTime * 3.2 - sunDist * 16.0);
      retroScene += vec3(0.95, 0.08, 0.38) * (sunCorona * (0.06 + 0.05 * heatPulse));

      float crtScan = 0.96 + 0.04 * sin(vUv.y * 420.0 + uTime * 3.5);
      retroScene *= crtScan;

      // Subtle vignette & active Ranger theme aura blend
      vec2 stageDelta = (vUv - vec2(0.5, 0.48)) * vec2(max(uAspect, 0.65), 1.0);
      float edgeVignette = clamp(1.0 - dot(stageDelta, stageDelta) * 0.34, 0.58, 1.0);
      retroScene = mix(retroScene, retroScene * (0.72 + uRangerColor * 0.65), uRangerTintMix * 0.20);
      vec3 studioBaseBg = retroScene * edgeVignette;
      vec3 background = studioBaseBg;

      if (OUTLINE) {
        float edge = 0.0;
        vec4 sampledRight = texture2D(tBackgroundNoise, vUv + vec2(THICKNESS, 0.0));
        vec4 sampledLeft = texture2D(tBackgroundNoise, vUv + vec2(-THICKNESS, 0.0));
        vec4 sampledUp = texture2D(tBackgroundNoise, vUv + vec2(0.0, THICKNESS));
        vec4 sampledDown = texture2D(tBackgroundNoise, vUv + vec2(0.0, -THICKNESS));

        if (sampledRight.r != textureBackgroundNoise.r ||
            sampledLeft.r != textureBackgroundNoise.r ||
            sampledUp.r != textureBackgroundNoise.r ||
            sampledDown.r != textureBackgroundNoise.r) {
          edge = 1.0;
        }

        vec3 contourTint = mix(dualAccent, uRangerColor, 0.35);
        float lineStrength = (0.04 + cursorEffect * 0.22) * uReveal;
        background = mix(studioBaseBg, contourTint, edge * lineStrength);
      }

      vec4 textureDefaultDiffuse = texture2D(tDefaultDiffuse, vUv);
      vec4 textureHelmet = texture2D(tHelmet, vUv);

      // Wave hover transition mask
      float hoverTransition = vUv.y + sin(vUv.x * PI) * sin(uHelmetHover * PI) * 0.2;
      cursorEffect += smoothstep(0.98 - hoverTransition, 1.02 - hoverTransition, uHelmetHover);
      cursorEffect = clamp(cursorEffect * uCursorIntensity, 0.0, 1.0);

      // Clean composition with deep blacks (removes milky / washed-out veil on portrait & letters)
      vec3 portraitRgb = pow(max(textureDefaultDiffuse.rgb, vec3(0.0)), vec3(1.16));
      vec3 helmetRgb = pow(max(textureHelmet.rgb, vec3(0.0)), vec3(1.12));

      vec3 base = mix(background, portraitRgb, textureDefaultDiffuse.a);

      // Inside the liquid cursor / Ranger reveal, deepen letter saturation naturally (multiplicative tint, zero whitening!)
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
    // Render at native 1:1 physical monitor resolution (up to 1600x900) so it is 100% sharp and never pixelated,
    // while still preventing 4K/5K zoomed-out tabs from overloading the GPU
    const maxW = IS_LOW_END ? 1280 : 1600;
    const maxH = IS_LOW_END ? 720 : 900;
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      1.0,
      maxW / Math.max(width, 1),
      maxH / Math.max(height, 1)
    );
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
      this.options = { ...LIQUID_CONFIG.fluid };

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

      // Smooth medium-res fluid mask target (512x288, 0 MSAA) — sharp edges with negligible GPU load
      this.sourceTarget = new THREE.WebGLRenderTarget(512, 288, { samples: 0 });
      this.clock = new THREE.Clock();
      this.delta = 0;
      this.interval = 1 / 60;
    }

    resize() {
      this.simulation.resize();
    }

    update() {
      this.delta += this.clock.getDelta();
      if (this.delta > this.interval) {
        this.simulation.update();
        this.renderer.setRenderTarget(this.sourceTarget);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.delta %= this.interval;
      }
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

      const portraitSegs = IS_LOW_END ? 48 : 64;
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
      const portraitSegs = IS_LOW_END ? 48 : 64;
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
            tRetrowaveBg: new THREE.Uniform(assets.textures.retrowaveBg || assets.textures.noise.texture),
            uMouseParallax: new THREE.Uniform(new THREE.Vector2(0, 0)),
            uRangerColor: new THREE.Uniform(toSRGBColor("#1C2018")),
            uRangerTintMix: new THREE.Uniform(0.0),
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
      this.letterItems = [];
      this.lettersPauseUntil = 0;
      this.lettersGroup = new THREE.Group();
      this.lettersGroup.position.set(0, 0, -0.18);
      this.defaultScene.add(this.lettersGroup);

      // Clean Architectural 3D Display Typography ("Bebas Neue" / "Mona Sans Variable")
      // Lightweight 8-slice metallic relief, zero cartoon outlines, zero white fill
      const rows = [
        { text: "MARCOS", y: 0.23, spacing: 0.125 },
        { text: "SIQUEIRA", y: 0.04, spacing: 0.114 },
      ];

      const getGlyphAdvanceFactor = (ch) => {
        if (ch === "I") return 0.52;
        if (ch === "M") return 1.06;
        if (ch === "Q" || ch === "U" || ch === "R" || ch === "A" || ch === "O") return 0.92;
        return 0.86;
      };

      const planeGeo = new THREE.PlaneGeometry(0.19, 0.23);
      const totalDepth = 0.045;
      const sliceCount = 12;

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

          // 1. Front & Back Face Texture (Middle fill + border)
          const canvas = document.createElement("canvas");
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext("2d");
          const tex = new TextureCtor(canvas);
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;

          // 2. Solid 3D Extrusion Wall Texture (Depth volume between front and back faces)
          const sideCanvas = document.createElement("canvas");
          sideCanvas.width = 256;
          sideCanvas.height = 256;
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

      this.updateLetterTextures();
      this.bindLetterInteraction();
    }

    updateLetterTextures(rangerKey = this.activeRangerKey) {
      const profile = RANGER_PROFILES[rangerKey] || RANGER_PROFILES.silver;
      const stops = profile.gtaStops || ["#3B1066", "#9E1982", "#FF247F", "#FF662A", "#FFB800"];
      const bevelTop = profile.bevelTop || "#00F0FF";
      const bevelBot = profile.bevelBot || "#FF2E93";
      const sideTint = profile.sideTint || "#280D42";

      this.letterItems.forEach((item, idx) => {
        // 1. GTA VI ("VI") Inspired Realistic 3D Emblem Face:
        //    - Chiseled 3D metallic outer rim (Cyan -> Chrome Slate -> Magenta)
        //    - Dark recessed 3D inner groove (#0B0414) for physical badge realism
        //    - Ultra-saturated Vice City Sunset Gradient Face with palm/horizon silhouette & glossy acrylic reflection
        const ctx = item.ctx;
        ctx.clearRect(0, 0, 256, 256);
        ctx.save();
        ctx.translate(128, 130);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "miter";
        ctx.miterLimit = 2.5;
        ctx.font = '700 202px "Bebas Neue", "Mona Sans Variable", sans-serif';

        // Step 1: Fill Inner Glyph with Iconic GTA VI Vice City Sunset Gradient
        const sunsetGrad = ctx.createLinearGradient(0, -88, 0, 88);
        sunsetGrad.addColorStop(0.0, stops[0]);
        sunsetGrad.addColorStop(0.26, stops[1]);
        sunsetGrad.addColorStop(0.52, stops[2]);
        sunsetGrad.addColorStop(0.78, stops[3]);
        sunsetGrad.addColorStop(1.0, stops[4]);
        ctx.fillStyle = sunsetGrad;
        ctx.fillText(item.char, 0, 0);

        // Step 2: Internal GTA VI Vice Horizon Glow, Palm/Skyline Silhouette & Glossy Enamel Coat
        // (Clipped 100% strictly to the inner sunset face before outer bevels are drawn!)
        ctx.save();
        ctx.globalCompositeOperation = "source-atop";

        // Warm horizon sun-glow band across lower-middle of the glyph
        const horizonGlow = ctx.createRadialGradient(0, 26, 4, 0, 26, 92);
        horizonGlow.addColorStop(0, "rgba(255, 215, 90, 0.38)");
        horizonGlow.addColorStop(0.5, "rgba(255, 46, 147, 0.16)");
        horizonGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = horizonGlow;
        ctx.fillRect(-120, -95, 240, 190);

        // Subtle GTA VI tropical horizon wave silhouettes at the bottom of the letter
        ctx.fillStyle = "rgba(14, 5, 28, 0.55)";
        for (let w = 0; w < 5; w++) {
          const wy = 48 + w * 9;
          ctx.fillRect(-110, wy, 220, 2.5 + w * 0.6);
        }

        // Stylized Vice City palm silhouette arch inside the sunset horizon
        const palmX = idx % 2 === 0 ? -16 : 16;
        const palmY = 42;
        ctx.strokeStyle = "rgba(14, 5, 28, 0.65)";
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(palmX, 92);
        ctx.quadraticCurveTo(palmX + (idx % 2 === 0 ? 7 : -7), 66, palmX + (idx % 2 === 0 ? 11 : -11), palmY);
        ctx.stroke();

        const fronds = [
          [-26, -6], [-18, -15], [-4, -18], [14, -15], [24, -5], [-16, 4], [18, 4]
        ];
        ctx.lineWidth = 2.4;
        fronds.forEach(([fx, fy]) => {
          const topX = palmX + (idx % 2 === 0 ? 11 : -11);
          ctx.beginPath();
          ctx.moveTo(topX, palmY);
          ctx.quadraticCurveTo(topX + fx * 0.55, palmY + fy - 5, topX + fx, palmY + fy + 4);
          ctx.stroke();
        });

        // Crisp Diagonal Glossy Enamel / Studio Softbox Reflection across top-left of letter
        const glossGrad = ctx.createLinearGradient(-70, -92, 20, -10);
        glossGrad.addColorStop(0, "rgba(0, 240, 255, 0.34)");
        glossGrad.addColorStop(0.45, "rgba(255, 255, 255, 0.15)");
        glossGrad.addColorStop(0.52, "rgba(255, 255, 255, 0.0)");
        glossGrad.addColorStop(1, "rgba(0, 0, 0, 0.0)");
        ctx.fillStyle = glossGrad;
        ctx.fillRect(-120, -100, 240, 120);
        ctx.restore();

        // Step 3: Fine Inner Specular Rim along the edge of the sunset face
        const innerRim = ctx.createLinearGradient(-65, -88, 65, 88);
        innerRim.addColorStop(0, bevelTop);
        innerRim.addColorStop(0.5, stops[2]);
        innerRim.addColorStop(1, stops[4]);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = innerRim;
        ctx.strokeText(item.char, 0, 0);

        // Step 4: Draw Dark 3D Recessed Groove & Outer Chiseled Metallic Bevel Frame BEHIND the inner face (destination-over)
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";

        // Dark 3D recessed inset channel between inner sunset face and outer metallic frame
        ctx.lineWidth = 6.0;
        ctx.strokeStyle = "#080310";
        ctx.strokeText(item.char, 0, 0);

        // Outer Chiseled Metallic Bevel Frame (3D Chrome + Cyan/Magenta Neon Reflection)
        const outerBevel = ctx.createLinearGradient(-75, -94, 75, 94);
        outerBevel.addColorStop(0, bevelTop);
        outerBevel.addColorStop(0.28, "#8A99AD");
        outerBevel.addColorStop(0.52, "#1E162B");
        outerBevel.addColorStop(0.76, bevelBot);
        outerBevel.addColorStop(1, stops[4]);
        ctx.lineWidth = 14.5;
        ctx.strokeStyle = outerBevel;
        ctx.strokeText(item.char, 0, 0);
        ctx.restore();

        ctx.restore();
        item.tex.needsUpdate = true;

        // 2. Realistic Chiseled 3D Extruded Block Walls (Deep Glossy Anodized Violet-Obsidian + Neon Edge Specular)
        if (item.sideCtx && item.sideTex) {
          const sCtx = item.sideCtx;
          sCtx.clearRect(0, 0, 256, 256);
          sCtx.save();
          sCtx.translate(128, 130);
          sCtx.textAlign = "center";
          sCtx.textBaseline = "middle";
          sCtx.lineJoin = "miter";
          sCtx.miterLimit = 2.5;
          sCtx.font = '700 202px "Bebas Neue", "Mona Sans Variable", sans-serif';

          const sideEdgeGrad = ctx.createLinearGradient(-80, -94, 80, 94);
          sideEdgeGrad.addColorStop(0, "#096B7A");
          sideEdgeGrad.addColorStop(0.35, sideTint);
          sideEdgeGrad.addColorStop(0.7, "#11071C");
          sideEdgeGrad.addColorStop(1, "#7A1248");

          sCtx.lineWidth = 14;
          sCtx.strokeStyle = sideEdgeGrad;
          sCtx.strokeText(item.char, 0, 0);
          sCtx.fillStyle = "#0D0617";
          sCtx.fillText(item.char, 0, 0);
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

      // Click anywhere -> return all letters to original position and stay still for 0.8 seconds (800ms)
      const onGlobalClickReset = () => {
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

      window.addEventListener("mousemove", onPointerMove, { passive: true });
      window.addEventListener("touchmove", onPointerMove, { passive: true });
      window.addEventListener("mousedown", onGlobalClickReset, { passive: true });
      window.addEventListener("touchstart", onGlobalClickReset, { passive: true });
    }

    drawTitleSign() {
      // Replaced by 3D interactive Times New Roman letter blocks
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
      precision: "lowp",
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

    window.addEventListener("resize", () => {
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
    });

    window.__isHeroStageVisible = true;

    gsap.ticker.add(() => {
      if (document.hidden || window.__isHeroStageVisible === false) {
        clock.getDelta();
        return;
      }

      const delta = Math.min(clock.getDelta(), 1 / 30) * 100;
      const elapsed = clock.getElapsedTime();

      backgroundNoise.update(elapsed, delta);
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
