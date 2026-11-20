// What the carrier is drawn with: the renderer and its depth buffer, the scene, the camera, the fill and the sun, the
// light pool, the bloom, space, and the frame budget. `light(…)` and `draw(…)` are the end of every frame (main.mjs
// `tick`): how it is lit for the seat you are in, and the render itself.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Space } from '../space.mjs';
import { LightPool } from '../lights.mjs';
import { FrameBudget } from './budget.mjs';

export class View {
  constructor(canvas, q) {
    this.canvas = canvas;
    // Depth over 0.2 m to 20 km: a reversed depth buffer where the browser has EXT_clip_control (it keeps the GPU's
    // early depth test: a third of the frame aboard, measured), else a logarithmic one (`?depth=log` forces it).
    const REV = q.get('depth') !== 'log' && !!document.createElement('canvas').getContext('webgl2')?.getExtension('EXT_clip_control');
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: !REV, reversedDepthBuffer: REV }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor('#02030a');
    renderer.localClippingEnabled = true;
    const scene = (this.scene = new THREE.Scene());
    const camera = (this.camera = new THREE.PerspectiveCamera(70, 1, 0.2, 20000));
    /** How it is lit aboard (see `light`): the fill and the sun, ACES exposure, and the bloom on lamps and screens.
     *  `__carrier.ABOARD` in the console to tune it live; `?post=0` (or `ABOARD.post = false`) renders aboard without
     *  tone mapping and bloom, for a slow machine. */
    this.ABOARD = { fill: 0.38, sun: 0.35, exposure: 1.15, bloom: 0.35, threshold: 0.92, post: q.get('post') !== '0' };
    this.hemi = new THREE.HemisphereLight('#9fb4d8', '#1a1410', 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e0', 1.6);
    this.sun.position.set(0.6, 0.8, 0.3);
    scene.add(this.sun);
    this.lightPool = new LightPool(scene);
    // Out in a fighter the view goes through bloom, so the drive's flame and the jets' glints glow. One NaN or Inf
    // pixel (a particle past its life, a pow of a negative number) smeared by the bloom blacks out the whole frame, so a
    // scrub pass zeroes any such pixel, and caps the rest, before the bloom sees them.
    const composer = (this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })));
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.); gl_FragColor = min(c, vec4(64.)); }'
    }));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.72);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.space = new Space(scene, renderer, this.sun);
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();
    this.budget = new FrameBudget(renderer, composer, this.bloom, this.resize, { fixed: +q.get('pr') || null });
  }

  resize() {
    // Never zero: a hidden page measures 0 × 0, and a zero-sized bloom target is an incomplete framebuffer.
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** The fill and the sun for where you are. They stand in for the ship's own lighting aboard: on emergency power they
   *  go down with the lamps. Aboard (walking, in a turret, at the helm on the bridge) the ship's own lamps do the
   *  lighting: the fill is low and the sun, which has no shadows and so would shine through every wall, is mostly put
   *  out, so rooms fall off into their corners instead of all being the same flat grey. `look`: the room's own wish
   *  (sets.mjs `lookOf`: some rooms want more fill, the hangar). */
  light({ mode, dark, inside, look }) {
    this.hemi.intensity = mode === 'cutaway' ? 1.8 : dark ? 0.12 : inside ? look?.fill ?? this.ABOARD.fill : 0.9;
    this.sun.intensity = dark ? 0.15 : inside ? look?.sun ?? this.ABOARD.sun : 1.6;
  }

  /** The render. Out in a fighter, the lab's look: ACES tone mapping (applied by the composer's output pass only) and
   *  bloom. Aboard, the same with a softer bloom, so lamps, screens and light strips glow and the lamps' pools roll off
   *  instead of clipping to the walls' flat colour. */
  draw({ mode, inside }) {
    const { renderer, ABOARD, bloom } = this;
    if (mode === 'fighter' || (inside && ABOARD.post)) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = mode === 'fighter' ? 1.05 : ABOARD.exposure;
      bloom.strength = mode === 'fighter' ? 0.85 : ABOARD.bloom;
      bloom.threshold = mode === 'fighter' ? 0.72 : ABOARD.threshold;
      this.composer.render();
    } else {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.render(this.scene, this.camera);
    }
  }
}
