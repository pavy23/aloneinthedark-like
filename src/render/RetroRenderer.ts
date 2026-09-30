import * as THREE from 'three';

export interface RetroSettings {
  /** Internal render height in pixels (width follows the 4:3 frame). */
  height: 240 | 360 | 480;
  /** Colour levels per channel after dithering (lower = more "VGA"). */
  levels: number;
  dither: boolean;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Post pass: linear -> sRGB, grade, vignette, grain, flash, fade, then ordered (Bayer) dithering and
// per-channel quantisation. This is what gives the flat 3D a 1990s VGA/early-3D-card texture.
const FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform float uTime;
uniform float uLevels;
uniform float uDither;
uniform float uFade;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uVignette;
uniform float uGrain;
uniform float uSaturation;
uniform vec3 uTint;
uniform float uPulse;
varying vec2 vUv;

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 c = toSRGB(texture2D(tScene, vUv).rgb);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSaturation) * uTint;
  vec2 d = vUv - 0.5;
  float vig = 1.0 - uVignette * dot(d, d) * 2.4;
  // Low-health pulse darkens the frame edges in time with the heartbeat.
  vig -= uPulse * smoothstep(0.12, 0.5, dot(d, d) * 2.0) * 0.6;
  c *= clamp(vig, 0.0, 1.0);
  c += (hash(gl_FragCoord.xy + fract(uTime * 7.13) * 91.7) - 0.5) * uGrain;
  c = mix(c, uFlashColor, uFlash);
  c *= 1.0 - uFade;
  float b = (bayer4(gl_FragCoord.xy) - 0.5) * uDither;
  float lv = uLevels - 1.0;
  c = floor(c * lv + 0.5 + b) / lv;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

/**
 * Renders the scene into a tiny off-screen target and up-scales it with nearest filtering.
 * The canvas drawing buffer *is* the low-res frame; CSS scales it (image-rendering: pixelated).
 */
export class RetroRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private target: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly post: THREE.ShaderMaterial;
  width = 320;
  height = 240;
  settings: RetroSettings = { height: 240, levels: 20, dither: true };

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // lets automated tests and screenshots read the frame
    });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = true;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);

    this.target = new THREE.WebGLRenderTarget(this.width, this.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      type: THREE.HalfFloatType,
    });

    this.post = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.target.texture },
        uTime: { value: 0 },
        uLevels: { value: 20 },
        uDither: { value: 1 },
        uFade: { value: 0 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(0.6, 0.02, 0.02) },
        uVignette: { value: 0.42 },
        uGrain: { value: 0.022 },
        uSaturation: { value: 0.82 },
        uTint: { value: new THREE.Color(1.0, 0.97, 0.9) },
        uPulse: { value: 0 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.applySettings(this.settings);
  }

  applySettings(s: RetroSettings): void {
    this.settings = { ...s };
    this.height = s.height;
    this.width = Math.round((s.height * 4) / 3);
    this.renderer.setSize(this.width, this.height, false);
    this.target.setSize(this.width, this.height);
    this.post.uniforms.uLevels.value = s.levels;
    this.post.uniforms.uDither.value = s.dither ? 1 : 0;
  }

  set fade(v: number) {
    this.post.uniforms.uFade.value = v;
  }
  get fade(): number {
    return this.post.uniforms.uFade.value as number;
  }
  set flash(v: number) {
    this.post.uniforms.uFlash.value = v;
  }
  set pulse(v: number) {
    this.post.uniforms.uPulse.value = v;
  }
  setGrade(saturation: number, tint: THREE.ColorRepresentation): void {
    this.post.uniforms.uSaturation.value = saturation;
    (this.post.uniforms.uTint.value as THREE.Color).set(tint);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    this.post.uniforms.uTime.value = time;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }

  /** Fit the canvas into its container with a 4:3 frame (pillar/letter-boxed). */
  layout(availW: number, availH: number): void {
    const aspect = 4 / 3;
    let w = availW;
    let h = w / aspect;
    if (h > availH) {
      h = availH;
      w = h * aspect;
    }
    this.canvas.style.width = `${Math.floor(w)}px`;
    this.canvas.style.height = `${Math.floor(h)}px`;
  }
}
