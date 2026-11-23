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
    },
  };

  const LIQUID_CONFIG = {
    headScene: {
      COLOR_OUTLINE: "#CBCBB9",
      COLOR_FOREGROUND: "#22261E",
      COLOR_BACKGROUND: "#F8F8F3",
      COLOR_CURSOR_FOREGROUND: "#CFD2C5",
      COLOR_CURSOR_BACKGROUND: "#E8E8DF",
      COLOR_CURSOR_OUTLINE: "#E8E8DF",
      COLOR_FILTER: "#50593F",
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
      iterations_poisson: 4,
      iterations_viscous: 4,
      dissipation: 0.96,
      mouse_force: 50,
      resolution: 0.1,
      cursor_size: 18,
      straightness: 1,
      viscous: 30,
      isBounce: false,
      dt: 0.014,
      isViscous: false,
      BFECC: true,
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

      // Liquid cursor mask
      vec4 textureCursorEffect = texture2D(tCursorEffect, vec2(0.025 + vUv.x * 0.95, 0.025 + vUv.y * 0.95));
      textureCursorEffect.rgb = 1.0 - textureCursorEffect.rgb;
      float cursorEffect = step(0.1, textureCursorEffect.r);

      float noiseBase = textureBackgroundNoise.r;
      vec3 background = mix(COLOR_BACKGROUND, mix(COLOR_BACKGROUND, COLOR_FOREGROUND, uReveal), noiseBase);
      vec3 cursorBackground = mix(COLOR_CURSOR_BACKGROUND, COLOR_CURSOR_FOREGROUND, noiseBase);

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

        background = mix(COLOR_BACKGROUND, mix(COLOR_BACKGROUND, COLOR_OUTLINE, uReveal), edge);
        cursorBackground = mix(cursorBackground, COLOR_CURSOR_OUTLINE, edge);
      }

      background = mix(background, uColorHover, step(textureBackgroundNoise.g, -0.1 + uHover * 1.1));
      background = mix(background, cursorBackground, cursorEffect * uCursorIntensity);

      vec4 textureDefaultDiffuse = texture2D(tDefaultDiffuse, vUv);
      vec4 textureHelmet = texture2D(tHelmet, vUv);

      // Wave hover transition mask
      float hoverTransition = vUv.y + sin(vUv.x * PI) * sin(uHelmetHover * PI) * 0.2;
      cursorEffect += step(1.0 - hoverTransition, uHelmetHover);
      cursorEffect = clamp(cursorEffect * uCursorIntensity, 0.0, 1.0);

      background = mix(background, cursorBackground, step(1.0 - hoverTransition, uHelmetHover));

      // Background remains pure reactive white base; 3D letters render in defaultScene
      vec3 base = mix(background, textureDefaultDiffuse.rgb, textureDefaultDiffuse.a);
      vec3 rangerLayer = mix(background, textureHelmet.rgb, textureHelmet.a);
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

  function computeSizes() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = width > 768
      ? Math.min(window.devicePixelRatio, 1.25)
      : Math.min(window.devicePixelRatio, 2);
    return { width, height, pixelRatio };
  }

  function toSRGBColor(hex) {
    return new THREE.Color(hex).convertLinearToSRGB();
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
      const w = Math.max(1, Math.round(this.options.resolution * this.sizes.width));
      const h = Math.max(1, Math.round(this.options.resolution * this.sizes.height));
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

      this.sourceTarget = new THREE.WebGLRenderTarget(this.sizes.width, this.sizes.height, { samples: 2 });
      this.clock = new THREE.Clock();
      this.delta = 0;
      this.interval = 1 / 60;
    }

    resize() {
      this.simulation.resize();
      this.sourceTarget.setSize(this.sizes.width, this.sizes.height);
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
      this.renderTarget = new THREE.WebGLRenderTarget(this.sizes.width, this.sizes.height, { samples: 1 });
    }

    resize() {
      this.renderTarget.setSize(this.sizes.width, this.sizes.height);
    }

    update(elapsed, delta) {
      this.easedMouse.normalized.update(delta);
      this.easedMouse.pace.update(delta);

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

  class MarcosPortrait {
    constructor(assets, mouse, sizes, camera) {
      this.sizes = sizes;
      this.intensity = 0.075;
      this.mouse = {
        normalized: mouse.createEasedNormalized(0.025),
      };

      this.geometry = new THREE.PlaneGeometry(1, 1, 128, 128);
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
      this.geometry = new THREE.PlaneGeometry(1, 1, 128, 128);
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

      this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x000000, 2.6);
      this.pointLight = new THREE.PointLight(0xffffff, 2.6);
      this.pointLight.position.set(-0.75, 0.2, 0.4);
      this.scene.add(this.hemisphereLight, this.pointLight);

      this.renderTarget = new THREE.WebGLRenderTarget(
        this.sizes.width * this.sizes.pixelRatio,
        this.sizes.height * this.sizes.pixelRatio,
        { samples: 2 }
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

      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.clear();
      this.renderer.render(this.scene, camera);
    }
  }

  // =========================================================================
  // Ranger Profiles (Colors for Menu, Morphin Balls & Suit Shader)
  // =========================================================================

  const RANGER_PROFILES = {
    black: {
      name: "RANGER PRETO",
      accentHex: "#FFFFFF",
      frameHex: "#11130E",
      pillFg: "#FFFFFF",
      letterFill: "#FFFFFF",
      letterStroke: "#11130E",
      waveHex: "#22261E",
      suitHex: "#1C2018",
      tintMix: 0.0,
    },
    red: {
      name: "RANGER VERMELHO",
      accentHex: "#FF2233",
      frameHex: "#FF2233",
      pillFg: "#FF2233",
      letterFill: "#181B14",
      letterStroke: "#FF2233",
      waveHex: "#FF2233",
      suitHex: "#FF1E27",
      tintMix: 0.94,
    },
    blue: {
      name: "RANGER AZUL",
      accentHex: "#0088FF",
      frameHex: "#0088FF",
      pillFg: "#0088FF",
      letterFill: "#181B14",
      letterStroke: "#0088FF",
      waveHex: "#0088FF",
      suitHex: "#0077FF",
      tintMix: 0.94,
    },
    green: {
      name: "RANGER VERDE",
      accentHex: "#00E676",
      frameHex: "#00E676",
      pillFg: "#00E676",
      letterFill: "#181B14",
      letterStroke: "#00E676",
      waveHex: "#00E676",
      suitHex: "#00D66C",
      tintMix: 0.94,
    },
    yellow: {
      name: "RANGER AMARELO",
      accentHex: "#FFD000",
      frameHex: "#FFD000",
      pillFg: "#FFD000",
      letterFill: "#181B14",
      letterStroke: "#FFD000",
      waveHex: "#FFD000",
      suitHex: "#FFC400",
      tintMix: 0.94,
    },
    pink: {
      name: "RANGER ROSA",
      accentHex: "#FF2A85",
      frameHex: "#FF2A85",
      pillFg: "#FF2A85",
      letterFill: "#181B14",
      letterStroke: "#FF2A85",
      waveHex: "#FF2A85",
      suitHex: "#FF207E",
      tintMix: 0.94,
    },
    silver: {
      name: "RANGER PRATA",
      accentHex: "#D8E2EC",
      frameHex: "#D8E2EC",
      pillFg: "#D8E2EC",
      letterFill: "#181B14",
      letterStroke: "#D8E2EC",
      waveHex: "#C8D6E5",
      suitHex: "#C8D6E5",
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

      this.activeRangerKey = "black";
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
        { samples: 1 }
      );

      this.cameraTransformGroup = new THREE.Group();
      this.camera = new THREE.PerspectiveCamera(15, this.sizes.width / this.sizes.height, 0.1, 1000);
      this.cameraTransformGroup.add(this.camera);
      this.defaultScene.add(this.cameraTransformGroup);

      this.head = new MarcosPortrait(assets, mouse, sizes, this.camera);
      this.defaultScene.add(this.head.instance);

      this.helmet = new RangerCharacter(renderer, sizes, assets);

      this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x000000, 2.5);
      this.pointLight = new THREE.PointLight(0xffffff, 2.5);
      this.pointLight.position.set(-0.75, 0.2, 0.4);
      this.defaultScene.add(this.hemisphereLight, this.pointLight);

      this.init3DLetters();
      this.applyResponsive();
      this.bindUIControls();
    }

    init3DLetters() {
      this.letterItems = [];
      this.lettersGroup = new THREE.Group();
      this.lettersGroup.position.set(0, 0, -0.18);
      this.defaultScene.add(this.lettersGroup);

      // Super Mario World 2 / Yoshi's Island 3D Pause Letters ("Times New Roman", serif)
      const rows = [
        { text: "MARCOS", y: 0.28, spacing: 0.26 },
        { text: "SIQUEIRA", y: 0.04, spacing: 0.24 },
      ];

      const planeGeo = new THREE.PlaneGeometry(0.19, 0.23);

      rows.forEach((row) => {
        const chars = row.text.split("");
        const totalW = (chars.length - 1) * row.spacing;
        const startX = -totalW * 0.5;

        chars.forEach((char, i) => {
          const posX = startX + i * row.spacing;
          const posY = row.y;

          const canvas = document.createElement("canvas");
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext("2d");
          const TextureCtor = (this.assets && this.assets.textures && this.assets.textures.head && this.assets.textures.head.diffuse)
            ? this.assets.textures.head.diffuse.constructor
            : (window.THREE.Texture || window.THREE.CanvasTexture);
          const tex = new TextureCtor(canvas);
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;

          const frontMat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            side: THREE.DoubleSide,
          });

          // 3D double-sided letter block with depth
          const letterMesh = new THREE.Group();
          const frontMesh = new THREE.Mesh(planeGeo, frontMat);
          frontMesh.position.z = 0.012;
          const backMesh = new THREE.Mesh(planeGeo, frontMat);
          backMesh.position.z = -0.012;
          backMesh.rotation.y = Math.PI;
          letterMesh.add(frontMesh);
          letterMesh.add(backMesh);

          letterMesh.position.set(posX, posY, 0);
          this.lettersGroup.add(letterMesh);

          this.letterItems.push({
            char,
            canvas,
            ctx,
            tex,
            mesh: letterMesh,
            baseX: posX,
            baseY: posY,
            velX: (Math.random() - 0.5) * 0.02,
            velY: (Math.random() - 0.5) * 0.04,
          });
        });
      });

      this.updateLetterTextures();
      this.bindLetterInteraction();
    }

    updateLetterTextures(rangerKey = this.activeRangerKey) {
      const profile = RANGER_PROFILES[rangerKey] || RANGER_PROFILES.black;
      const fillHex = profile.letterFill || "#FFFFFF";
      const strokeHex = profile.letterStroke || profile.frameHex || profile.accentHex || "#11130E";

      this.letterItems.forEach((item) => {
        const ctx = item.ctx;
        ctx.clearRect(0, 0, 256, 256);
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;

        // Pure Times New Roman, bold, elegant
        ctx.font = 'bold 172px "Times New Roman", Georgia, serif';

        // Outer border stroke first (Black border on Black Ranger)
        ctx.lineWidth = 14;
        ctx.strokeStyle = strokeHex;
        ctx.strokeText(item.char, 128, 128);

        // Middle fill on top (White middle on Black Ranger)
        ctx.fillStyle = fillHex;
        ctx.fillText(item.char, 128, 128);

        ctx.restore();
        item.tex.needsUpdate = true;
      });
    }

    bindLetterInteraction() {
      const canvasEl = this.renderer.domElement;
      if (!canvasEl) return;

      let isDragging = false;
      let activeItem = null;
      let lastX = 0;
      let lastY = 0;

      const getNormalizedPos = (clientX, clientY) => {
        const rect = canvasEl.getBoundingClientRect();
        return {
          normX: ((clientX - rect.left) / rect.width) * 2 - 1,
          normY: -(((clientY - rect.top) / rect.height) * 2 - 1),
        };
      };

      const onDown = (e) => {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        lastX = clientX;
        lastY = clientY;

        const { normX, normY } = getNormalizedPos(clientX, clientY);

        let closest = null;
        let minDist = 1e9;
        this.letterItems.forEach((item) => {
          const screenX = item.mesh.position.x * 0.72;
          const screenY = item.mesh.position.y * 1.45;
          const dist = Math.hypot(normX - screenX, normY - screenY);
          if (dist < minDist) {
            minDist = dist;
            closest = item;
          }
        });

        isDragging = true;
        activeItem = minDist < 0.45 ? closest : null;
        if (activeItem) {
          activeItem.velY = 0;
          activeItem.velX = 0;
        }
      };

      const onMove = (e) => {
        if (!isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = clientX - lastX;
        const dy = clientY - lastY;
        lastX = clientX;
        lastY = clientY;

        if (activeItem) {
          activeItem.velY += dx * 0.024;
          activeItem.velX += dy * 0.024;

          const activeIdx = this.letterItems.indexOf(activeItem);
          this.letterItems.forEach((it, idx) => {
            if (it !== activeItem) {
              const dist = Math.abs(idx - activeIdx);
              if (dist <= 3) {
                const wavePower = 1 / (dist + 1);
                it.velY += dx * 0.012 * wavePower;
                it.velX += dy * 0.012 * wavePower;
              }
            }
          });
        } else {
          this.letterItems.forEach((it) => {
            it.velY += dx * 0.012;
            it.velX += dy * 0.012;
          });
        }
      };

      const onUp = () => {
        isDragging = false;
        activeItem = null;
      };

      canvasEl.addEventListener("mousedown", onDown);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);

      canvasEl.addEventListener("touchstart", onDown, { passive: true });
      window.addEventListener("touchmove", onMove, { passive: true });
      window.addEventListener("touchend", onUp);
      window.addEventListener("touchcancel", onUp);
    }

    drawTitleSign() {
      // Replaced by 3D interactive Times New Roman letter blocks
    }

    setRanger(key, { pulseMorph = false } = {}) {
      const profile = RANGER_PROFILES[key] || RANGER_PROFILES.black;
      this.activeRangerKey = key;
      this.updateLetterTextures(key);

      // Swap actual Movie Ranger character texture & alpha silhouette
      if (this.assets && this.assets.textures && this.assets.textures.rangerVariants) {
        const variant =
          this.assets.textures.rangerVariants[key] || this.assets.textures.rangerVariants.black;
        this.helmet.setVariant(variant);
      }

      // Update CSS accent color, frame border color & UI indicators
      document.documentElement.setAttribute("data-ranger-theme", key);
      document.documentElement.style.setProperty("--accent", profile.accentHex);
      document.documentElement.style.setProperty("--frame-accent", profile.frameHex || profile.accentHex);
      document.documentElement.style.setProperty("--pill-fg", profile.pillFg || profile.accentHex);

      const activeNameEl = document.getElementById("morphin-active-name");
      if (activeNameEl) {
        activeNameEl.textContent = profile.name;
      }

      document.querySelectorAll("[data-ranger-select]").forEach((ball) => {
        ball.classList.toggle("is-active", ball.dataset.rangerSelect === key);
      });

      const u = this.compositionMesh.material.uniforms;
      const targetWaveColor = toSRGBColor(profile.waveHex);
      const targetSuitColor = toSRGBColor(profile.suitHex);

      // Tween background wave foreground color
      const startFg = u.COLOR_FOREGROUND.value.clone();
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

    applyResponsive() {
      if (this.sizes.width > 768) {
        this.camera.position.z = 3.32;
        this.head.instance.position.y = -0.04;
        if (this.lettersGroup) {
          this.lettersGroup.scale.set(1.0, 1.0, 1.0);
        }
      } else {
        this.camera.position.z = 4.10;
        this.head.instance.position.y = -0.06;
        if (this.lettersGroup) {
          this.lettersGroup.scale.set(0.78, 0.78, 0.78);
        }
      }
      this.helmet.instance.position.copy(this.head.instance.position);

      this.compositionMesh.scale.set(this.sizes.width, this.sizes.height, 1);
      this.compositionMesh.material.uniforms.uAspect.value = this.sizes.width / this.sizes.height;
      this.camera.aspect = this.sizes.width / this.sizes.height;
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

      this.head.update(delta, this.helmetRevealValue, fluidTexture);
      this.easedMouse.normalized.update(delta);

      // Super Mario World 2 / Yoshi's Island Pause 3D Letter Tumbling Physics:
      if (this.letterItems) {
        this.letterItems.forEach((item, idx) => {
          // Apply angular momentum from drag interaction
          item.mesh.rotation.y += item.velY;
          item.mesh.rotation.x += item.velX;

          // Momentum inertia damping
          item.velY *= 0.94;
          item.velX *= 0.94;

          // Continuous organic 3D tumbling wave (Super Mario World 2 Pause style)
          const idleWaveY = Math.sin(elapsed * 2.2 + idx * 0.45) * 0.016;
          const idleWaveX = Math.cos(elapsed * 1.8 + idx * 0.35) * 0.012;
          item.mesh.rotation.y += idleWaveY;
          item.mesh.rotation.x += idleWaveX;

          // Subtle float bounce
          item.mesh.position.y = item.baseY + Math.sin(elapsed * 2.4 + idx * 0.5) * 0.006;
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
    const urls = [
      ASSETS.textures.head.diffuse,
      ASSETS.textures.head.depth,
      ASSETS.textures.head.alpha,
      ASSETS.textures.head.normal,
      ASSETS.textures.head.shadow,
      ASSETS.textures.ranger.diffuse,
      ASSETS.textures.ranger.depth,
      ASSETS.textures.ranger.alpha,
      ASSETS.textures.ranger.normal,
      ASSETS.textures.noise.texture,
      ASSETS.textures.rangerVariants.red.diffuse,
      ASSETS.textures.rangerVariants.red.alpha,
      ASSETS.textures.rangerVariants.blue.diffuse,
      ASSETS.textures.rangerVariants.blue.alpha,
      ASSETS.textures.rangerVariants.green.diffuse,
      ASSETS.textures.rangerVariants.green.alpha,
      ASSETS.textures.rangerVariants.yellow.diffuse,
      ASSETS.textures.rangerVariants.yellow.alpha,
      ASSETS.textures.rangerVariants.pink.diffuse,
      ASSETS.textures.rangerVariants.pink.alpha,
      ASSETS.textures.rangerVariants.silver.diffuse,
      ASSETS.textures.rangerVariants.silver.alpha,
    ];
    let loadedCount = 0;
    const totalCount = urls.length;

    const loadTex = (url) =>
      new Promise((resolve, reject) =>
        textureLoader.load(
          url,
          (tex) => {
            loadedCount++;
            if (typeof onProgress === "function") {
              onProgress(loadedCount, totalCount);
            }
            resolve(tex);
          },
          undefined,
          reject
        )
      );

    return Promise.all(urls.map(loadTex)).then(
      ([
        headDiffuse,
        headDepth,
        headAlpha,
        headNormal,
        headShadow,
        rangerDiffuse,
        rangerDepth,
        rangerAlpha,
        rangerNormal,
        noiseTex,
        redDiffuse,
        redAlpha,
        blueDiffuse,
        blueAlpha,
        greenDiffuse,
        greenAlpha,
        yellowDiffuse,
        yellowAlpha,
        pinkDiffuse,
        pinkAlpha,
        silverDiffuse,
        silverAlpha,
      ]) => {
        headDiffuse.minFilter = THREE.LinearFilter;
        headDiffuse.magFilter = THREE.LinearFilter;
        headDiffuse.colorSpace = THREE.SRGBColorSpace;

        headShadow.minFilter = THREE.LinearFilter;
        headShadow.magFilter = THREE.LinearFilter;
        headShadow.colorSpace = THREE.SRGBColorSpace;

        headDepth.colorSpace = THREE.SRGBColorSpace;

        [
          rangerDiffuse,
          redDiffuse,
          blueDiffuse,
          greenDiffuse,
          yellowDiffuse,
          pinkDiffuse,
          silverDiffuse,
        ].forEach((tex) => {
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
        });

        rangerDepth.colorSpace = THREE.SRGBColorSpace;

        configureNonHeadTexture(noiseTex);

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
              diffuse: rangerDiffuse,
              depth: rangerDepth,
              alpha: rangerAlpha,
              normal: rangerNormal,
            },
            rangerVariants: {
              black: { diffuse: rangerDiffuse, alpha: rangerAlpha },
              red: { diffuse: redDiffuse, alpha: redAlpha },
              blue: { diffuse: blueDiffuse, alpha: blueAlpha },
              green: { diffuse: greenDiffuse, alpha: greenAlpha },
              yellow: { diffuse: yellowDiffuse, alpha: yellowAlpha },
              pink: { diffuse: pinkDiffuse, alpha: pinkAlpha },
              silver: { diffuse: silverDiffuse, alpha: silverAlpha },
            },
            noise: { texture: noiseTex },
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
      }, 280);
    }

    window.addEventListener("resize", () => {
      const next = computeSizes();
      sizes.width = next.width;
      sizes.height = next.height;
      sizes.pixelRatio = next.pixelRatio;

      mainCamera.aspect = sizes.width / sizes.height;
      mainCamera.fov = 2 * Math.atan(sizes.height / 2 / 10) * (180 / Math.PI);
      mainCamera.updateProjectionMatrix();

      renderer.setPixelRatio(sizes.pixelRatio);
      renderer.setSize(sizes.width, sizes.height);

      fluidCursor.resize();
      backgroundNoise.resize();
      heroScene.resize();
    });

    gsap.ticker.add(() => {
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
    let smoothScrollY = window.scrollY || 0;
    let lastActiveSectionId = "hero";
    let lastTickTime = performance.now();

    function applyTimelineAt(rawScrollY, scrollY, now, dtSec) {
      if (isHeroLocked) {
        rawScrollY = 0;
        scrollY = 0;
      }

      const vh = window.innerHeight || 800;
      const vw = window.innerWidth || 1280;
      const isMobile = vw <= 768;
      const section2EnterScrollPx = vh * 1.15;

      // 0. Initial Scroll Cue: visible at scrollY = 0 when ONLY the character + name sign are on screen
      if (heroScrollCue) {
        heroScrollCue.classList.toggle("is-cue-hidden", rawScrollY > 10 || isHeroLocked);
      }

      // 1. Trigger sequence on First Scroll (rawScrollY >= 10px):
      //    - On Mobile (isMobile): 1st scroll lifts the character UP (-12vh) and shows ONLY #morphin-dock below him!
      //      Then scrolling further (scrollY >= 48vh) swaps #morphin-dock out and brings #hero-intro-box into the bottom dock!
      //    - On Desktop (!isMobile): 1st scroll brings #morphin-dock on the right, and after 1.15s (or scrollY >= 24vh)
      //      brings #hero-intro-box on the left.
      if (rawScrollY < 8) {
        rightBoxTriggered = false;
        leftBoxTriggered = false;
        firstScrollTimestamp = 0;
        rightEnterProgress = Math.max(0, rightEnterProgress - dtSec * 1.8);
        leftEnterProgress = Math.max(0, leftEnterProgress - dtSec * 1.8);
        hintEnterProgress = Math.max(0, hintEnterProgress - dtSec * 1.8);
        rightAutoType = 0;
        leftAutoType = 0;
        hintAutoType = 0;
      } else {
        if (!rightBoxTriggered) {
          rightBoxTriggered = true;
          firstScrollTimestamp = now;
        }
        if (isMobile) {
          leftBoxTriggered = scrollY >= vh * 0.48;
          if (!leftBoxTriggered) {
            leftEnterProgress = Math.max(0, leftEnterProgress - dtSec * 2.2);
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

      const pEnterR = Math.max(easeOutCubic(rightEnterProgress), easeOutCubic(rangeProgress(scrollY, 15, vh * 0.30)));
      const pEnterL = isMobile
        ? Math.max(easeOutCubic(leftEnterProgress), easeOutCubic(rangeProgress(scrollY, vh * 0.48, vh * 0.76)))
        : Math.max(easeOutCubic(leftEnterProgress), easeOutCubic(rangeProgress(scrollY, vh * 0.20, vh * 0.48)));
      const pEnterH = Math.max(easeOutCubic(hintEnterProgress), easeOutCubic(rangeProgress(scrollY, vh * 0.25, vh * 0.52)));

      // Header follows Right Box entrance on first scroll
      if (siteHeader) {
        siteHeader.classList.toggle("is-entrance-hidden", pEnterR < 0.02);
        siteHeader.style.setProperty("--header-y", `${((1 - pEnterR) * -36).toFixed(1)}px`);
        siteHeader.style.setProperty("--header-opacity", pEnterR.toFixed(3));
      }

      // 2. Main Character Stage (#hero-frame-card):
      //    - In Fullscreen Mode (isHeroLocked): expands to 100% full screen with no border framing, no lift, no fade
      //    - On Mobile: on the 1st scroll, lifts the character canvas UP (--char-lift-y: -12vh) so the color switcher
      //      fits cleanly BELOW the character without covering his face!
      //    - Closes its frame border at scrollY: 42vh -> 110vh
      //    - Recedes smoothly in parallax as Menu 1 (#habilidades) rises over it
      if (heroFrameCard && heroViewport) {
        if (isHeroLocked) {
          heroViewport.style.padding = "0px";
          heroViewport.style.visibility = "visible";
          heroFrameCard.style.borderRadius = "0px";
          heroFrameCard.style.borderWidth = "0px";
          heroFrameCard.style.transform = "none";
          heroFrameCard.style.filter = "brightness(1)";
          heroFrameCard.style.pointerEvents = "auto";
          heroFrameCard.style.setProperty("--char-lift-y", "0px");
        } else {
          const pFrame = easeInOutCubic(rangeProgress(scrollY, vh * 0.42, vh * 1.10));
          const pHeroCovered = easeInOutCubic(rangeProgress(scrollY, section2EnterScrollPx, vh * 2.10));
          const maxFramePx = vw > 1100 ? 76 : vw > 680 ? 28 : 14;
          const padPx = (pFrame * maxFramePx).toFixed(1);
          const radius = Math.round(pFrame * (vw > 680 ? 26 : 20));
          const borderW = (pFrame * 4).toFixed(1);

          const mobileCharLiftPx = isMobile ? -pEnterR * (vh * 0.12) : 0;
          heroFrameCard.style.setProperty("--char-lift-y", `${mobileCharLiftPx.toFixed(1)}px`);

          const parallaxLiftPx = -Math.max(0, scrollY - section2EnterScrollPx) * 0.42;
          const heroScale = 1 - pHeroCovered * 0.065;
          const heroBright = 1 - pHeroCovered * 0.48;

          heroViewport.style.padding = `${padPx}px`;
          heroViewport.style.visibility = scrollY > vh * 2.35 ? "hidden" : "visible";
          heroFrameCard.style.borderRadius = `${radius}px`;
          heroFrameCard.style.borderWidth = `${borderW}px`;
          heroFrameCard.style.transform = `translate3d(0, ${parallaxLiftPx.toFixed(1)}px, 0) scale(${heroScale.toFixed(4)})`;
          heroFrameCard.style.filter = `brightness(${heroBright.toFixed(3)})`;
          heroFrameCard.style.pointerEvents = scrollY > vh * 1.55 ? "none" : "auto";
        }
      }

      // 3. Right Box (#morphin-dock):
      //    - In Fullscreen Mode (isHeroLocked): dock container stays visible so the ghost button can be clicked to exit
      //    - On Mobile: appears below the lifted character on 1st scroll, then rises/fades out at 46vh -> 78vh as Left Box enters
      //    - On Desktop: stays in place while the frame closes, then rises UP at 112vh -> 178vh
      if (morphinDock) {
        if (isHeroLocked) {
          morphinDock.classList.remove("is-entrance-hidden");
          morphinDock.style.setProperty("--scroll-y", "0px");
          morphinDock.style.setProperty("--box-opacity", "1");
        } else {
          const exitStartR = isMobile ? vh * 0.46 : vh * 1.12;
          const exitEndR = isMobile ? vh * 0.80 : vh * 1.78;
          const fadeStartR = isMobile ? vh * 0.56 : vh * 1.62;
          const pExitR = easeInOutCubic(rangeProgress(scrollY, exitStartR, exitEndR));
          const enterOffsetPx = (1 - pEnterR) * 80;
          const exitOffsetPx = -pExitR * (isMobile ? vh * 0.45 : vh * 1.05);
          const totalRightY = enterOffsetPx + exitOffsetPx;
          const rightOpacity = pEnterR * (1 - rangeProgress(scrollY, fadeStartR, exitEndR));

          morphinDock.classList.toggle("is-entrance-hidden", rightOpacity < 0.02);
          morphinDock.style.setProperty("--scroll-y", `${totalRightY.toFixed(1)}px`);
          morphinDock.style.setProperty("--box-opacity", rightOpacity.toFixed(3));

          const scrollTypeR = rangeProgress(scrollY, 25, vh * 0.38);
          rightBoxTyper.setProgress(rawScrollY < 8 ? 0 : Math.max(rightAutoType, scrollTypeR));
        }
      }

      // 4. Left Box (#hero-intro-box):
      if (heroIntroBox) {
        const exitStartL = isMobile ? vh * 0.86 : vh * 1.48;
        const exitEndL = isMobile ? vh * 1.25 : vh * 2.15;
        const fadeStartL = isMobile ? vh * 0.98 : vh * 1.98;
        const pExitL = easeInOutCubic(rangeProgress(scrollY, exitStartL, exitEndL));
        const enterOffsetPx = (1 - pEnterL) * 80;
        const exitOffsetPx = -pExitL * (isMobile ? vh * 0.45 : vh * 1.05);
        const totalLeftY = enterOffsetPx + exitOffsetPx;
        const leftOpacity = pEnterL * (1 - rangeProgress(scrollY, fadeStartL, exitEndL));

        heroIntroBox.classList.toggle("is-entrance-hidden", leftOpacity < 0.02);
        heroIntroBox.style.setProperty("--scroll-y", `${totalLeftY.toFixed(1)}px`);
        heroIntroBox.style.setProperty("--box-opacity", leftOpacity.toFixed(3));

        const scrollTypeL = rangeProgress(
          scrollY,
          isMobile ? vh * 0.48 : vh * 0.22,
          isMobile ? vh * 0.74 : vh * 0.56
        );
        leftBoxTyper.setProgress(rawScrollY < 8 ? 0 : Math.max(leftAutoType, scrollTypeL));
      }

      // 5. Center Hint (#hero-center-hint):
      if (heroCenterHint) {
        const pExitH = easeInOutCubic(rangeProgress(scrollY, vh * 1.05, vh * 1.58));
        const hintY = (1 - pEnterH) * 35 - pExitH * (vh * 0.95);
        const hintOpacity = pEnterH * (1 - rangeProgress(scrollY, vh * 1.42, vh * 1.60));

        heroCenterHint.classList.toggle("is-entrance-hidden", hintOpacity < 0.02);
        heroCenterHint.style.setProperty("--scroll-y", `${hintY.toFixed(1)}px`);
        heroCenterHint.style.setProperty("--box-opacity", hintOpacity.toFixed(3));

        const scrollTypeH = rangeProgress(scrollY, vh * 0.24, vh * 0.52);
        hintTyper.setProgress(rawScrollY < 8 ? 0 : Math.max(hintAutoType, scrollTypeH));
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

        // Slide in from the right (+48vw -> 0px) as the card enters from the bottom
        const pSlideIn = easeOutCubic(rangeProgress(vh - uTop, vh * 0.02, vh * 0.62));
        const slideXPx = (1 - pSlideIn) * (vw * 0.48);

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
        card.style.setProperty("--card-brightness", cardBrightness.toFixed(3));
      });

      // Drive typewriter on Section 2 (#habilidades) as it settles into view
      const s2UTop = untransformedTops[0] !== undefined ? untransformedTops[0] : vh;
      const s2WriteP = clamp01((vh * 0.88 - s2UTop) / (vh * 0.65));
      section2Typer.setProgress(s2WriteP);

      // Drive scroll-based typewriter on the headers/steps of Menu 2, Menu 3, Menu 4 as they enter
      extraSectionTypers.forEach(({ secEl, typer }, tIdx) => {
        const cardIdx = tIdx + 1;
        const uTop = untransformedTops[cardIdx] !== undefined ? untransformedTops[cardIdx] : vh;
        const pSecWrite = clamp01((vh * 0.85 - uTop) / (vh * 0.58));
        typer.setProgress(pSecWrite);
      });

      // Active navigation link highlight + automatic menu Ranger accent color sync on scroll
      let currentId = "hero";
      let currentRangerKey = "black";
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
      applyTimelineAt(targetY, smoothScrollY, now, dtSec);
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
