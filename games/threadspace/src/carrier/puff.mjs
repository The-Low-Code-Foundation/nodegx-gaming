// Jets of gas in vacuum, seen close: a manoeuvring thruster's puff and a gun's muzzle blast, in one particle system.
//
// What a small jet looks like out there (docking footage of capsules and shuttles): a sharp cone that is brightest and
// densest at the throat, made of streaks running out fast, thinning to nothing within a few metres, and gone the
// moment the valve shuts. Nothing holds the gas, so there is no cloud and nothing lingers. A gun's muzzle is the same
// gas, hotter: a white star at the muzzle, a cone thrown ahead, a ring of lobes thrown out sideways by the brake, all
// gone in a fraction of a second.
//
//   Puffs      one pool of instanced quads, one draw call, simulated in the vertex shader: a particle is written once
//              (where it was born, when, its velocity, its axis, how it grows) and never touched again, so a frame
//              costs nothing on the CPU but the particles born in it. Four kinds of particle:
//                STREAK  a thin filament along its axis, turned to face you
//                CONE    a slug of gas: a cone along its axis from the throat's width to its own, with filaments
//                        radiating from the apex, brightest at the narrow end
//                GLOW    a soft round glow facing you (the throat's bright core)
//                STAR    a glow with spikes (a muzzle's flash)
//   jet()      a thruster's nozzle, called every frame with its throttle: a pop when the valve opens, the cone while
//              it stays open, nothing the frame after it shuts. The gas keeps the nozzle's own velocity.
//   muzzle()   a gun firing, by calibre.
//
// All the numbers are `JET` and `MUZZLE` below. Looks only: its own random numbers (never Math.random, never a seeded
// generator) and its own scratch vectors (callers hand in shared ones). The shader keeps gas.mjs's rule: no NaN can
// come out of it (every pow has a clamped base, no normalize of a vector that can be zero), because one NaN pixel
// under the bloom blacks out the frame.

import * as THREE from 'three';

/** A thruster's puff, for a nozzle of scale 1 (the carrier's; a ship's `thrusters.rcsScale` scales it, lengths and
 *  speeds by `grow`'s power of it so a small ship's jets still read). */
export const JET = {
  len: 16, // metres the cone reaches at full throttle before it has thinned to nothing
  speed: 80, // m/s the gas leaves at (len / speed is how long any of it is seen: 0.2 s)
  half: 0.34, // the cone's half angle, radians
  grow: 0.7, // length and speed go as scale ** grow
  mouth: 0.8, // the cone's width at the throat, metres
  cones: 46, // slugs of gas a second at full throttle (the cone's body)
  streaks: 150, // filaments a second
  core: 34, // glows at the throat a second
  pop: 16, // filaments thrown wide the moment the valve opens
  k: 0.5, // brightness of the body
  tint: [0.6, 0.76, 1.0] // what it cools to (linear light): cold, faintly blue
};

/** A muzzle blast, for `size` 1 (a heavy turret's round). */
export const MUZZLE = {
  reach: 38, // metres the forward cone runs
  side: 16, // metres the brake's lobes run out sideways
  lobes: 6, // how many lobes
  life: 0.34, // seconds the gas is seen (size 1; smaller guns are quicker)
  star: 12, // metres across the flash
  k: 1.0
};

const STRIDE = 20;
export const STREAK = 0, CONE = 1, GLOW = 2, STAR = 3;

// Private randoms: an xorshift, so nothing here ever draws from Math.random or a seeded generator.
let _seed = 0x2f6e2b1;
const R = () => {
  _seed ^= _seed << 13;
  _seed ^= _seed >>> 17;
  _seed ^= _seed << 5;
  return (_seed >>> 0) / 4294967296;
};
/** A rate into a count, the fraction kept by chance. */
const whole = (x) => {
  const m = Math.floor(x);
  return m + (R() < x - m ? 1 : 0);
};

const VERT = /* glsl */ `
  attribute vec4 aP; // where it was born (world), and when
  attribute vec4 aV; // its velocity (world), and how long it lives
  attribute vec4 aA; // its axis (unit, world), and its kind + a seed in the fraction
  attribute vec4 aS; // length at birth and at the end, width at birth and at the end (metres)
  attribute vec4 aC; // colour (linear), brightness
  uniform float uT;
  varying vec2 vUv;
  varying vec4 vC;
  varying vec4 vM; // kind, seed, age 0..1, the throat's width over its own
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    float age = uT - aP.w;
    float u = age / max(aV.w, 1e-4);
    float kind = floor(aA.w + 0.001);
    vUv = vec2(position.x * 2., position.y);
    vC = aC;
    vM = vec4(kind, fract(aA.w), clamp(u, 0., 1.), 1.);
    if (u < 0. || u >= 1. || aC.a <= 0.) {
      gl_Position = vec4(2., 2., 2., 1.);
    } else {
      float e = 1. - (1. - u) * (1. - u); // out fast, then slower
      vec3 c = aP.xyz + aV.xyz * age;
      float len = mix(aS.x, aS.y, u), w = mix(aS.z, aS.w, e);
      vec3 toCam = cameraPosition - c;
      float dist = max(length(toCam), 1e-3);
      vec3 world;
      if (kind < 1.5) {
        vec3 side = cross(aA.xyz, toCam);
        float sl = length(side);
        side = sl > 1e-5 ? side / sl : vec3(1., 0., 0.);
        if (kind < 0.5) { // a filament is never thinner than a pixel or so; what it gains in width it loses in light
          float w0 = max(w, 1e-4);
          w = max(w0, dist * 0.0011);
          vC.a *= sqrt(w0 / w);
        }
        vM.w = clamp(aS.z / max(w, 1e-4), 0.02, 1.);
        world = c - aA.xyz * len * (1. - position.y) + side * w * position.x;
      } else {
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vUv.y = position.y * 2. - 1.;
        world = c + (right * position.x + up * (position.y - .5)) * w;
      }
      vC.a *= smoothstep(0.25, 1.4, dist); // nothing in your face
      gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.);
      #include <logdepthbuf_vertex>
    }
  }`;

const FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec4 vC;
  varying vec4 vM;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(h2(i), h2(i + vec2(1., 0.)), f.x), mix(h2(i + vec2(0., 1.)), h2(i + vec2(1., 1.)), f.x), f.y); }
  void main() {
    #include <logdepthbuf_fragment>
    float kind = vM.x, seed = vM.y, u = vM.z;
    float w1 = clamp(1. - u, 0., 1.);
    float fade = w1 * sqrt(w1);
    float a = 0.;
    if (kind < .5) {
      float x = vUv.x;
      float along = smoothstep(0., .55, vUv.y) * smoothstep(1., .82, vUv.y);
      float brk = .5 + .5 * vn(vec2(vUv.y * 5. + seed * 91., seed * 13.));
      a = exp(-x * x * 6.) * along * brk;
    } else if (kind < 1.5) {
      float hw = mix(vM.w, 1., vUv.y); // the cone: the throat's width at its tail, its own at its head
      float xx = vUv.x / hw;
      float body = clamp(1. - xx * xx, 0., 1.);
      body *= sqrt(body);
      float fil = vn(vec2(xx * 5.5 + seed * 57., vUv.y * 1.3 + seed * 7.)); // filaments running out from the apex
      fil = .3 + 1.5 * fil * fil;
      float lump = .55 + .45 * vn(vec2(xx * 2. + seed * 11., vUv.y * 7. - seed * 31.));
      float ends = smoothstep(0., .06, vUv.y) * smoothstep(1., .5, vUv.y);
      float dense = clamp(vM.w / hw, 0., 1.); // thinner as it spreads: brightest at the throat
      a = body * dense * fil * lump * ends;
    } else {
      float r = length(vUv);
      float g = exp(-r * r * 5.) + .7 * exp(-r * r * 42.);
      if (kind > 2.5) {
        float an = seed * 6.2831;
        vec2 q = mat2(cos(an), -sin(an), sin(an), cos(an)) * vUv;
        float s = 0.;
        for (int i = 0; i < 3; i++) {
          float t = float(i) * 1.0472 + .3 * sin(seed * 40. + float(i));
          vec2 n = vec2(cos(t), sin(t));
          float d = dot(q, vec2(-n.y, n.x));
          s += exp(-d * d * 1400.) * (.55 + .45 * h2(vec2(seed * 9., float(i))));
        }
        g += s * (1. - smoothstep(.15, 1., r));
      }
      a = g * (1. - smoothstep(.75, 1., r));
    }
    a = clamp(a * fade * vC.a, 0., 4.);
    // White-hot where it is dense and young, its own colour as it thins and cools.
    vec3 col = mix(vC.rgb, vec3(1.), clamp(a * .9 - .25, 0., 1.) * (1. - .6 * u));
    gl_FragColor = vec4(col * a, min(a, 1.));
    #include <colorspace_fragment>
  }`;

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3();
const _plat = new THREE.Vector3(), _prev = new THREE.Vector3(), _v0 = new THREE.Vector3(), _col = new THREE.Color();
const ZERO = new THREE.Vector3();

export class Puffs {
  constructor(scene, n = 8192) {
    this.n = n;
    this.i = 0;
    this.time = 0;
    this.until = 0; // when the last live particle dies
    this.lo = n; // the particles written since the last upload
    this.hi = -1;
    this.wrapped = false;
    this.enabled = true;
    this.carry = new Map(); // jet(): per nozzle, where it was and whether its valve was open
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); // x -0.5..0.5 across, y 0 (tail) to 1 (head)
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    this.data = new Float32Array(n * STRIDE);
    this.buf = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1);
    this.buf.setUsage(THREE.DynamicDrawUsage);
    ['aP', 'aV', 'aA', 'aS', 'aC'].forEach((name, k) => g.setAttribute(name, new THREE.InterleavedBufferAttribute(this.buf, 4, k * 4)));
    g.instanceCount = n;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, toneMapped: false, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'puffs';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** One particle, born `at` seconds after the clock's now. Colour in linear light. */
  add(kind, px, py, pz, vx, vy, vz, ax, ay, az, at, life, len0, len1, w0, w1, r, g, b, k) {
    if (!this.enabled) return;
    const i = this.i, o = i * STRIDE, D = this.data, t0 = this.time + at;
    this.i = i + 1;
    if (this.i >= this.n) (this.i = 0), (this.wrapped = true);
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
    D[o] = px; D[o + 1] = py; D[o + 2] = pz; D[o + 3] = t0;
    D[o + 4] = vx; D[o + 5] = vy; D[o + 6] = vz; D[o + 7] = life;
    D[o + 8] = ax; D[o + 9] = ay; D[o + 10] = az; D[o + 11] = kind + 0.02 + 0.96 * R();
    D[o + 12] = len0; D[o + 13] = len1; D[o + 14] = w0; D[o + 15] = w1;
    D[o + 16] = r; D[o + 17] = g; D[o + 18] = b; D[o + 19] = k;
    if (t0 + life > this.until) this.until = t0 + life;
  }

  /** The clock on by `dt`. Call it after every `jet()` of the frame (they are born along the frame that is starting)
   *  and before the guns fire (a muzzle blast is born at the frame's end). */
  frame(dt) {
    this.time += dt;
  }

  /** Just before the render: what was born this frame sent to the card. */
  flush() {
    this.mat.uniforms.uT.value = this.time;
    this.mesh.visible = this.time < this.until;
    if (this.hi < 0) return;
    this.buf.clearUpdateRanges();
    if (!this.wrapped) this.buf.addUpdateRange(this.lo * STRIDE, (this.hi - this.lo + 1) * STRIDE); // else the lot
    this.buf.needsUpdate = true;
    this.lo = this.n;
    this.hi = -1;
    this.wrapped = false;
  }

  clear() {
    this.data.fill(0);
    this.wrapped = true;
    this.hi = 0;
    this.until = 0;
  }

  /** A thruster's nozzle this frame: its mouth at world point `p`, the gas going along world unit `dir`, `k` (0..1) of
   *  full thrust, `s` the nozzle's scale (1 the carrier's, 0.3 the cutter's, 0.2 a fighter's). `key` stands for the
   *  nozzle: from where it was last frame comes its own velocity, which the gas keeps, and whether the valve has just
   *  opened (the pop). Call it every frame, firing or not. */
  jet(key, p, dir, k, dt, s = 1) {
    let c = this.carry.get(key);
    if (!c) this.carry.set(key, (c = { at: new THREE.Vector3().copy(p), on: false, t: -9 }));
    const seen = this.time - c.t < dt * 1.5 + 1e-6 && dt > 0;
    _prev.copy(c.at);
    _plat.copy(p).sub(c.at).divideScalar(Math.max(dt, 1e-4));
    if (!seen || _plat.lengthSq() > 4e6) _plat.set(0, 0, 0), _prev.copy(p); // not seen last frame, or a jump
    c.at.copy(p);
    c.t = this.time;
    if (k < 0.02 || dt <= 0 || !this.enabled) return void (c.on = false);
    const fresh = !c.on;
    c.on = true;
    const J = JET, g = Math.pow(s, J.grow), [tr, tg, tb] = J.tint;
    const kk = 0.45 + 0.55 * k; // size and light follow the throttle
    const L = J.len * g * kk, sp = J.speed * g, life = L / sp, mouth = J.mouth * s, wide = 2 * Math.tan(J.half) * L;
    const dx = dir.x, dy = dir.y, dz = dir.z;
    // Two unit vectors across the jet.
    _x.set(1, 0, 0);
    if (Math.abs(dx) > 0.9) _x.set(0, 1, 0);
    _x.addScaledVector(dir, -_x.dot(dir)).normalize();
    _y.crossVectors(dir, _x);
    // Each particle is born somewhere along this frame's path (`f` of the way through it), so a slow frame still
    // makes one unbroken cone and a turning ship's jet does not bead.
    // The cone's body: slugs of gas, each a cone from the throat out.
    let n = whole(J.cones * kk * dt);
    for (let i = 0; i < n; i++) {
      const f = R(), v = sp * (0.8 + 0.4 * R());
      _p.copy(_prev).lerp(p, f);
      this.add(CONE, _p.x, _p.y, _p.z, _plat.x + dx * v, _plat.y + dy * v, _plat.z + dz * v, dx, dy, dz, f * dt, life * (0.8 + 0.4 * R()),
        mouth * 0.6, L * (0.6 + 0.3 * R()), mouth, wide * (0.75 + 0.35 * R()), tr, tg, tb, J.k * kk);
    }
    // The filaments: thin streaks thrown out anywhere in the cone, the middle ones fastest.
    n = whole(J.streaks * kk * dt);
    for (let i = 0; i < n; i++) {
      const f = R();
      this.streak(_p.copy(_prev).lerp(p, f), dir, f * dt, sp, life, mouth, L, 1, 0.5 * kk);
    }
    // The throat: a small hard glow, and a short bright cone that stays by the nozzle (the shock).
    n = whole(J.core * dt);
    for (let i = 0; i < n; i++) {
      const f = R(), q = 0.35 * mouth, v = sp * 0.35;
      _p.copy(_prev).lerp(p, f);
      this.add(GLOW, _p.x + dx * q, _p.y + dy * q, _p.z + dz * q, _plat.x, _plat.y, _plat.z, dx, dy, dz, f * dt, 0.05 + 0.03 * R(), 0, 0, mouth * 2, mouth * 2.8, 0.85, 0.92, 1, 0.3 * kk);
      this.add(CONE, _p.x, _p.y, _p.z, _plat.x + dx * v, _plat.y + dy * v, _plat.z + dz * v, dx, dy, dz, f * dt, life * 0.5, mouth * 0.5, L * 0.22, mouth * 0.8, mouth * 2.2, 0.9, 0.95, 1, 0.7 * kk);
    }
    if (fresh) {
      // The valve opens: the first gas out goes wide, and the throat flashes.
      for (let i = 0; i < J.pop; i++) this.streak(p, dir, dt, sp * 1.25, life, mouth, L, 1.7, 0.8 * kk);
      this.add(GLOW, p.x, p.y, p.z, _plat.x, _plat.y, _plat.z, dx, dy, dz, dt, 0.09, 0, 0, mouth * 2.5, mouth * 6, 0.85, 0.92, 1, 0.8 * kk);
    }
  }

  /** One filament of a jet from `at`, somewhere in the cone round `dir` (`spread` times as wide), on top of `_plat`. */
  streak(at, dir, born, sp, life, mouth, L, spread, bright) {
    const J = JET, a = R() * 6.2832, r = Math.sqrt(R()) * Math.tan(J.half) * spread, cx = Math.cos(a) * r, cy = Math.sin(a) * r;
    const ox = _x.x * cx + _y.x * cy, oy = _x.y * cx + _y.y * cy, oz = _x.z * cx + _y.z * cy;
    _d.set(dir.x + ox, dir.y + oy, dir.z + oz).normalize();
    const v = sp * (0.6 + 0.55 * R()) * (1 - 0.35 * Math.min(r, 1)), lf = life * (0.45 + 0.55 * R()), off = mouth * 0.3;
    this.add(STREAK, at.x + ox * off, at.y + oy * off, at.z + oz * off, _plat.x + _d.x * v, _plat.y + _d.y * v, _plat.z + _d.z * v, _d.x, _d.y, _d.z, born, lf,
      mouth * 0.4, Math.min(v * lf * 0.8, L * 0.45), mouth * 0.09, mouth * (0.2 + 0.25 * R()), J.tint[0], J.tint[1], J.tint[2], bright * (0.6 + 0.8 * R()));
  }

  /** A gun fires: its muzzle at world point `p`, along world unit `d`. `size` 1 is a heavy turret's round (about 0.2 a
   *  close-in gun's or a fighter's cannon, 1.6 a railgun). `color` what the gas cools to, `v0` what the gun is carried
   *  along with. `lite` for a gun that fires many times a second: the star, a short cone, a few streaks. */
  muzzle(p, d, size = 1, { color = '#ffb060', v0 = null, lite = false } = {}) {
    if (!this.enabled) return;
    const M = MUZZLE, px = p.x, py = p.y, pz = p.z, dx = d.x, dy = d.y, dz = d.z;
    _v0.copy(v0 ?? ZERO);
    const ux = _v0.x, uy = _v0.y, uz = _v0.z;
    _col.set(color);
    const r = _col.r, g = _col.g, b = _col.b;
    const life = M.life * (0.45 + 0.55 * Math.min(size, 2)), reach = M.reach * size, bore = 0.45 * size, K = M.k;
    const star = M.star * size * (lite ? 0.7 : 1);
    _x.set(1, 0, 0);
    if (Math.abs(dx) > 0.9) _x.set(0, 1, 0);
    _x.addScaledVector(d, -_x.dot(d)).normalize();
    _y.crossVectors(d, _x);
    // The flash: a white star just ahead of the muzzle and its tinted glow, gone in a few frames.
    const q = 0.6 * size;
    this.add(STAR, px + dx * q, py + dy * q, pz + dz * q, ux, uy, uz, dx, dy, dz, 0, 0.06 + 0.06 * Math.min(size, 1.5), 0, 0, star * 0.5, star, 1, 0.97, 0.9, 1.6 * K);
    this.add(GLOW, px + dx * q, py + dy * q, pz + dz * q, ux, uy, uz, dx, dy, dz, 0, life * 0.7, 0, 0, star * 0.5, star * 1.1, r, g, b, 0.9 * K);
    // The cone thrown ahead: slugs at different speeds, so it stretches as it goes, and filaments inside it.
    const cones = lite ? 2 : 7, streaks = lite ? 5 : Math.round(26 + 22 * Math.min(size, 1.6));
    for (let i = 0; i < cones; i++) {
      const fr = (i + 0.3 + 0.7 * R()) / cones, lf = life * (0.55 + 0.6 * R()), v = (reach * (0.35 + 0.65 * fr)) / lf;
      const w = reach * (0.2 + 0.16 * R());
      this.add(CONE, px, py, pz, ux + dx * v, uy + dy * v, uz + dz * v, dx, dy, dz, 0, lf, bore, reach * (0.3 + 0.5 * fr), w * 0.3, w, r, g, b, (2.4 - 0.9 * fr) * K);
    }
    for (let i = 0; i < streaks; i++) {
      const a = R() * 6.2832, rr = Math.sqrt(R()) * 0.2, cx = Math.cos(a) * rr, cy = Math.sin(a) * rr;
      _d.set(dx + _x.x * cx + _y.x * cy, dy + _x.y * cx + _y.y * cy, dz + _x.z * cx + _y.z * cy).normalize();
      const lf = life * (0.4 + 0.8 * R()), v = (reach * (0.5 + 0.9 * R())) / lf;
      this.add(STREAK, px, py, pz, ux + _d.x * v, uy + _d.y * v, uz + _d.z * v, _d.x, _d.y, _d.z, 0, lf, bore, Math.min(v * lf * 0.7, reach * 0.4), bore * 0.25, bore * (0.5 + 0.5 * R()), r, g, b, (0.7 + 0.8 * R()) * K);
    }
    // The muzzle brake: lobes of gas thrown out flat round the barrel, and a thin ring of filaments between them.
    const lobes = lite ? 3 : M.lobes, a0 = R() * 6.2832, side = M.side * size;
    for (let i = 0; i < lobes; i++) {
      const a = a0 + (i / lobes) * 6.2832 + 0.25 * (R() - 0.5), cx = Math.cos(a), cy = Math.sin(a), fwd = 0.18;
      _d.set(_x.x * cx + _y.x * cy + dx * fwd, _x.y * cx + _y.y * cy + dy * fwd, _x.z * cx + _y.z * cy + dz * fwd).normalize();
      const lf = life * (0.5 + 0.4 * R()), v = (side * (0.8 + 0.4 * R())) / lf;
      this.add(CONE, px, py, pz, ux + _d.x * v, uy + _d.y * v, uz + _d.z * v, _d.x, _d.y, _d.z, 0, lf, bore * 0.6, side * 0.7, side * 0.12, side * 0.4, r, g, b, 1.8 * K);
      const few = lite ? 1 : 4;
      for (let j = 0; j < few; j++) {
        const lf2 = life * (0.35 + 0.6 * R()), v2 = (side * (0.6 + 0.9 * R())) / lf2, ja = a + 0.5 * (R() - 0.5), jx = Math.cos(ja), jy = Math.sin(ja), jf = fwd + 0.3 * (R() - 0.5);
        _d.set(_x.x * jx + _y.x * jy + dx * jf, _x.y * jx + _y.y * jy + dy * jf, _x.z * jx + _y.z * jy + dz * jf).normalize();
        this.add(STREAK, px, py, pz, ux + _d.x * v2, uy + _d.y * v2, uz + _d.z * v2, _d.x, _d.y, _d.z, 0, lf2, bore * 0.5, Math.min(v2 * lf2 * 0.7, side * 0.5), bore * 0.2, bore * 0.5, r, g, b, (0.6 + 0.7 * R()) * K);
      }
    }
  }

  /** A flash on its own at `p` (a gun's flicker between blasts): a star `size` metres across. */
  star(p, size, color = '#ffe0a0', v0 = null, life = 0.05) {
    _col.set(color);
    _v0.copy(v0 ?? ZERO);
    this.add(STAR, p.x, p.y, p.z, _v0.x, _v0.y, _v0.z, 0, 1, 0, 0, life, 0, 0, size * 0.6, size, _col.r, _col.g, _col.b, 1.2);
  }
}
