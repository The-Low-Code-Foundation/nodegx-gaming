// Gas in vacuum, as the Fighter Sound Lab settled it: like the gas in telescope images, not cartoon puffs. Nothing out
// there holds it: it leaves hot and fast, spreads fast and then slower, cools from white through blue to violet, and
// is gone. Each particle is a wisp, not a ball: domain-warped noise in the shader, a different slice per particle, so
// overlapping particles make filaments and veils for a moment. Additive, no drag.
//
//   Gas        one particle pool, one Points draw. `emit()` one wisp; `nozzle()` feeds it from a thruster (the
//              main drives, via newton.mjs `updatePlumes`; the manoeuvring jets are puff.mjs's).
//   DriveFx    a fighter's drive and jets, seen: the flame at the nozzle (a short pale cone that lengthens with power),
//              the core and halo sprites, the gas poured out of the flame and spread over each frame's path (so the
//              plume never detaches or beads), a glint at each jet valve, and each jet's puff (puff.mjs `jet`, through
//              `gas.puffs`, which main.mjs sets). Moved onto whichever fighter you are in (fighter.mjs).
//
// Rendering rule: one NaN or Inf pixel, smeared by the bloom, blacks out the frame (main.mjs scrubs them before the
// bloom as a last net). So: every (1 - u) is clamped to [0, 1] before a pow, no pow of a negative base in GLSL, and no
// normalize of a vector that can be zero.

import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const R = Math.random;

const GAS_VERT = /* glsl */ `
  attribute float a, sz, seed, heat, cold;
  uniform float uScale;
  varying float vA, vSeed, vHeat, vCold;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    float d = max(-mv.z, 0.05);
    vA = a * smoothstep(1.5, 9.0, d); // nothing right in your face (the seat, the chase camera)
    vSeed = seed; vHeat = heat; vCold = cold;
    gl_PointSize = clamp(sz * uScale / d, 1., 420.);
    gl_Position = a < 0.002 ? vec4(2., 2., 2., 1.) : projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;

const GAS_FRAG = /* glsl */ `
  uniform float uT;
  varying float vA, vSeed, vHeat, vCold;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(h2(i), h2(i + vec2(1., 0.)), f.x), mix(h2(i + vec2(0., 1.)), h2(i + vec2(1., 1.)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0., k = .5; for (int i = 0; i < 4; i++) { s += k * vn(p); p = p * 2.03 + vec2(1.7, 9.2); k *= .5; } return s; }
  void main() {
    #include <logdepthbuf_fragment>
    vec2 uv = gl_PointCoord * 2. - 1.;
    float ang = vSeed * 6.2831; uv = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * uv;
    float r = length(uv); if (r > 1.) discard;
    vec2 q = uv * 1.6 + vSeed * 37.;
    float n = fbm(q + vec2(0., uT * .15));
    float w = fbm(q * 2.2 + n * 1.8);
    float fil = 1. - abs(2. * w - 1.); // ridges of warped noise: filaments
    float dens = (1. - smoothstep(.1, 1., r)) * (.5 * n + .8 * fil * fil);
    dens = smoothstep(.05, .6, dens);
    vec3 cool = vec3(.46, .28, .82), mid = vec3(.36, .6, 1.), hot = vec3(.92, .96, 1.), frost = vec3(.72, .8, .95);
    vec3 col = mix(cool, mid, smoothstep(0., .5, vHeat)); col = mix(col, hot, smoothstep(.55, 1., vHeat));
    col = mix(col, frost, vCold);
    float al = clamp(dens * vA, 0., 1.);
    gl_FragColor = vec4(col * al, al);
  }`;

export class Gas {
  constructor(scene, n = 2600) {
    this.n = n;
    this.i = 0;
    this.dirty = false;
    this.live = 0;
    const g = new THREE.BufferGeometry();
    const f = (k = 1) => new Float32Array(n * k);
    this.p = f(3); this.v = f(3); this.a = f(); this.sz = f(); this.seed = f(); this.heat = f(); this.cold = f();
    this.age = f().fill(99); this.life = f().fill(1); this.s0 = f(); this.s1 = f(); this.k = f(); this.h0 = f();
    for (let i = 0; i < n; i++) this.seed[i] = R();
    const at = (name, arr, k = 1, dyn = true) => {
      const b = new THREE.BufferAttribute(arr, k);
      if (dyn) b.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, b);
    };
    at('position', this.p, 3); at('a', this.a); at('sz', this.sz); at('seed', this.seed, 1, false); at('heat', this.heat); at('cold', this.cold);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { uScale: { value: 600 }, uT: { value: 0 } },
      vertexShader: GAS_VERT, fragmentShader: GAS_FRAG
    });
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 4;
    this.carry = new Map(); // nozzle() emitters: leftover fraction, last position, on last frame
    this.tick = 0;
    this.enabled = true;
    scene.add(this.pts);
  }

  /** One wisp at `p` with velocity `v` (world), living `life` s, size from `s0` to `s1` m, brightness `k`, `heat` 0..1
   *  (white-hot to violet), `cold` 0..1 (frosty jet gas). */
  emit(p, v, life, s0, s1, k, heat, cold) {
    if (!this.enabled) return;
    const i = this.i;
    this.i = (i + 1) % this.n;
    this.p[i * 3] = p.x; this.p[i * 3 + 1] = p.y; this.p[i * 3 + 2] = p.z;
    this.v[i * 3] = v.x; this.v[i * 3 + 1] = v.y; this.v[i * 3 + 2] = v.z;
    this.age[i] = 0; this.life[i] = Math.max(life, 0.01); this.s0[i] = s0; this.s1[i] = s1; this.k[i] = k; this.h0[i] = heat; this.cold[i] = cold;
    this.dirty = true;
    this.live = 1;
  }

  /** Point size per metre at one metre, from the camera and the canvas height. */
  setView(camera, height) {
    this.mat.uniforms.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }

  frame(dt, t) {
    this.mat.uniforms.uT.value = t;
    if (!this.live) return;
    let live = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) {
        this.a[i] = 0;
        continue;
      }
      live++;
      this.age[i] += dt;
      const u = clamp(this.age[i] / this.life[i], 0, 1), w = 1 - u; // w never below 0: pow() stays finite
      for (let j = 0; j < 3; j++) this.p[i * 3 + j] += this.v[i * 3 + j] * dt; // no drag: there is no air
      this.sz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - w * w); // fast spread, then slower
      this.a[i] = this.k[i] * Math.min(1, u / 0.05) * Math.pow(w, 1.8);
      this.heat[i] = this.h0[i] * Math.pow(w, 1.5);
    }
    this.live = live;
    const A = this.pts.geometry.attributes;
    A.position.needsUpdate = A.a.needsUpdate = A.sz.needsUpdate = A.heat.needsUpdate = true;
    if (this.dirty) (A.cold.needsUpdate = true), (this.dirty = false);
  }

  clear() {
    this.age.fill(99);
    this.a.fill(0);
  }

  /** A thruster feeding the gas (the carrier's, via newton.mjs `updatePlumes`): nozzle at world point `p`, exhaust along
   *  world unit `dir`, at `k` (0..1) of full thrust. `key` stands for the nozzle; from where it was last frame comes the
   *  nozzle's own velocity, which the gas keeps. `s` scales it (1 is a fighter's), `kind` 'main' or 'rcs'. */
  nozzle(key, p, dir, k, dt, { s = 1, kind = 'rcs' } = {}) {
    let c = this.carry.get(key);
    if (!c) this.carry.set(key, (c = { left: 0, at: p.clone(), on: false, tick: -9 }));
    const plat = _pv.copy(p).sub(c.at).divideScalar(Math.max(dt, 1e-4));
    if (c.tick !== this.tick || plat.lengthSq() > 4e6) plat.set(0, 0, 0); // not seen last frame, or a jump
    c.at.copy(p);
    c.tick = this.tick + 1;
    if (k < 0.02 || dt <= 0) return void (c.on = false);
    const fresh = !c.on;
    c.on = true;
    if (kind === 'main') {
      c.left += (60 + 260 * k) * dt;
      while (c.left >= 1) {
        c.left -= 1;
        const sp = (10 + 18 * k) * Math.sqrt(s) * (0.8 + 0.4 * R()), jit = (3 + 5 * k) * Math.sqrt(s);
        _pp.copy(p).addScaledVector(dir, (0.2 + R() * 0.45 * (2 + 12 * k)) * s);
        jitter(_pd.copy(dir).multiplyScalar(sp), jit).add(plat);
        this.emit(_pp, _pd, 2 + 1.5 * R(), (0.5 + 0.6 * k) * s, (6 + 10 * R()) * (0.6 + 0.4 * k) * s, 0.06 + 0.07 * k, 0.65 + 0.35 * k, 0);
      }
      return;
    }
    // A jet: a burst when the valve opens, a trickle while it stays open.
    c.left += fresh ? 18 : 130 * k * dt;
    while (c.left >= 1) {
      c.left -= 1;
      burst(this, p, dir, plat, s, fresh ? 0.55 : 0.3);
    }
  }

  stepTick() {
    this.tick++;
  }
}

/** Cold gas flung from a jet in a cone: frosty, subtle, gone in under 0.7 s. */
function burst(gas, at, dir, vel, s, k) {
  const sp = (20 + 25 * R()) * Math.sqrt(s);
  _pd.copy(dir).multiplyScalar(sp);
  jitter(_pd, sp * 0.7).add(vel);
  gas.emit(_pp.copy(at).addScaledVector(dir, (0.1 + R() * 0.2) * s), _pd, 0.35 + 0.3 * R(), 0.1 * s, (1.8 + 1.8 * R()) * s, k, 0.1, 1);
}

function jitter(v, amount) {
  v.x += (R() - 0.5) * amount;
  v.y += (R() - 0.5) * amount;
  v.z += (R() - 0.5) * amount;
  return v;
}

const _pp = new THREE.Vector3(), _pd = new THREE.Vector3(), _pv = new THREE.Vector3();

// --- a fighter's drive and jets ----------------------------------------------------------------------------------------

let GLOW = null;
function glowTexture() {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,.8)');
  g.addColorStop(0.4, 'rgba(255,255,255,.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  GLOW = new THREE.CanvasTexture(c);
  GLOW.colorSpace = THREE.SRGBColorSpace;
  return GLOW;
}
const sprite = (color, s) => {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  m.scale.setScalar(s);
  return m;
};

const FLAME_VERT = /* glsl */ `
  varying vec2 vUv; varying float vE;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    vec3 toEye = -mv.xyz;
    float l = length(toEye);
    vE = l > 1e-5 ? abs(dot(normalize(normalMatrix * normal), toEye / l)) : 0.; // no normalize of a zero vector
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const FLAME_FRAG = /* glsl */ `
  uniform float uT, uK;
  varying vec2 vUv; varying float vE;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    float along = clamp(vUv.y, 0., 1.);
    float edge = pow(clamp(vE, 0., 1.), 2.2);
    float bands = .88 + .12 * cos(along * 26. - uT * 16.);
    float w = 1. - along;
    float fade = w * w * smoothstep(0., .05, along);
    vec3 col = mix(vec3(.95, .97, 1.), vec3(.45, .65, 1.), smoothstep(0., .5, along));
    float a = clamp(edge * fade * bands * uK * 1.1, 0., 1.);
    gl_FragColor = vec4(col * a, a);
  }`;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();

const JET_SCALE = 0.2; // a fighter's jets against the carrier's (puff.mjs `jet`)

export class DriveFx {
  /** `gas` the Gas the plume pours into; `flight` her Flight (the nozzles and their valves). */
  constructor(gas, flight) {
    this.gas = gas;
    this.flight = flight;
    this.group = new THREE.Group();
    this.group.name = 'drive-fx';
    this.nozzle = new THREE.Vector3(...flight.S.nozzle);
    this.core = sprite('#bfe4ff', 2);
    this.halo = sprite('#3d6cff', 6);
    this.core.position.copy(this.nozzle);
    this.halo.position.copy(this.nozzle).add(new THREE.Vector3(0, 0, 0.4));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { uT: { value: 0 }, uK: { value: 0 } }, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG
    });
    const lg = new THREE.CylinderGeometry(0.1, 0.32, 1, 18, 16, true);
    lg.translate(0, 0.5, 0);
    lg.rotateX(Math.PI / 2);
    this.flame = new THREE.Mesh(lg, this.mat);
    this.flame.position.copy(this.nozzle);
    this.flame.frustumCulled = false;
    this.group.add(this.core, this.halo, this.flame);
    this.glints = flight.noz.map((n) => {
      const f = sprite('#e4f0ff', 0.4);
      f.position.copy(n.at).addScaledVector(n.dir, 0.12);
      f.visible = false;
      this.group.add(f);
      return f;
    });
    this.lastNp = new THREE.Vector3();
    this.started = false;
    this.acc = 0;
    this.time = 0;
  }

  /** Onto fighter model `obj` (its drive's mouth, if the model has one). */
  attach(obj, nozzle = null) {
    if (nozzle) {
      this.nozzle.copy(nozzle);
      this.core.position.copy(nozzle);
      this.halo.position.copy(nozzle).add(new THREE.Vector3(0, 0, 0.4));
      this.flame.position.copy(nozzle);
    }
    obj.add(this.group);
    this.started = false;
  }

  detach() {
    this.group.removeFromParent();
    for (const g of this.glints) g.visible = false;
  }

  /** Every frame: `obj` her model (anywhere in the scene graph), `dt`. */
  frame(obj, dt) {
    this.time += dt;
    const fl = this.flight, k = fl.power, t = this.time;
    obj.updateWorldMatrix(true, false);
    const np = obj.localToWorld(_a.copy(this.nozzle));
    // Her own velocity, from where the nozzle was last frame (works on the pad, in the lane and in flight alike).
    const vel = _d.copy(np).sub(this.lastNp).divideScalar(Math.max(dt, 1e-4));
    if (!this.started || vel.lengthSq() > 4e6) {
      vel.copy(fl.body.vel);
      this.lastNp.copy(np);
      this.started = true;
    }
    this.core.material.opacity = clamp(0.2 + 0.7 * k, 0, 1);
    this.core.scale.setScalar(0.6 + 1.3 * k + 0.05 * Math.sin(t * 50));
    this.halo.material.opacity = 0.12 + 0.35 * k;
    this.halo.scale.setScalar(2 + 4 * k);
    this.core.material.color.setHSL(0.58, 0.9 - 0.6 * k, 0.6 + 0.3 * k);
    // A cold drive shows nothing at all.
    this.core.visible = this.halo.visible = fl.spool > 0.02 || k > 0.01;
    this.flame.visible = k > 0.01;
    const flameLen = 2 + 12 * k;
    this.mat.uniforms.uT.value = t;
    this.mat.uniforms.uK.value = k;
    this.flame.scale.set(0.8 + 0.35 * k, 0.8 + 0.35 * k, flameLen);
    // The drive's gas: it pours out of the flame (born inside it, along the first part), spread over this frame's path
    // so the plume never breaks into beads, and streams away behind her. Artistically slow: it hangs for 2-3.5 s.
    const q = obj.getWorldQuaternion(_q);
    const back = _b.set(0, 0, 1).applyQuaternion(q);
    if (k > 0.02) {
      this.acc += (60 + 260 * k) * dt;
      while (this.acc >= 1) {
        this.acc -= 1;
        const f = R(), sp = (10 + 18 * k) * (0.8 + 0.4 * R()), jit = 3 + 5 * k;
        _c.copy(this.lastNp).lerp(np, f).addScaledVector(back, 0.2 + R() * 0.45 * flameLen);
        jitter(_c, 0.3);
        const v = jitter(_pd.copy(back).multiplyScalar(sp), jit); // relative to her
        _c.addScaledVector(v, (1 - f) * dt); // where it would be by now
        v.add(vel);
        this.gas.emit(_c, v, 2 + 1.5 * R(), 0.5 + 0.6 * k, (6 + 10 * R()) * (0.6 + 0.4 * k), 0.06 + 0.07 * k, 0.65 + 0.35 * k, 0);
      }
    } else this.acc = 0;
    this.lastNp.copy(np);
    // The jets: a glint at the valve, and a burst of cold gas flung out in a cone.
    fl.noz.forEach((n, i) => {
      const gl = this.glints[i];
      if (n.open && !n.was) n.flash = 1;
      n.flash = n.open ? Math.max(n.flash * Math.exp(-dt / 0.05), 0.2) : n.flash * Math.exp(-dt / 0.04);
      gl.visible = n.flash > 0.02;
      if (gl.visible) {
        gl.material.opacity = n.flash * 0.6;
        gl.scale.setScalar(0.15 + 0.35 * n.flash);
      }
      // The puff itself (puff.mjs, through `gas.puffs`): told every frame, so it has the pop when the valve opens.
      const P = this.gas.puffs;
      if (P) P.jet(n, obj.localToWorld(_c.copy(n.at)), _b.copy(n.dir).applyQuaternion(q), n.open ? 1 : 0, dt, JET_SCALE);
    });
  }
}
