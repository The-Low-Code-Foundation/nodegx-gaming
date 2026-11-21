// Fire, smoke, sparks and spray: the particles of damage (design/ROADMAP.md, phase 9). Not gas.mjs's gas, which is
// vacuum gas cooling from white to violet; this is what burns and what is sprayed, in air or out of it.
//
//   Blaze    two particle pools in one parent's frame: `glow` (additive: flame, sparks, embers) and `haze` (blended:
//            smoke, powder, vapour, droplets). A particle has a velocity, a `wind` it is dragged towards (`drag` per
//            second: 0 in vacuum), and a `rise` along the parent's +y (flames and smoke rise where there is weight,
//            droplets and sparks fall; 0 where nothing weighs anything). Positions are in the parent's frame, so a
//            fire in a drum turns with the drum.
//   Blazes   one Blaze per parent, made when first asked for (`in(parent)`), all moved each frame.
//
// Looks only: every random here is Math.random, never a seeded one, so the fingerprints (tools/carrier-check.mjs) do
// not move for them. Particles never collide with anything: they are made to live about as long as it takes them to
// reach a wall.
//
// Rendering rule from gas.mjs: no NaN or Inf pixel (it blacks out the frame through the bloom), so no pow of a negative
// base, no normalize of a zero vector.

import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const VERT = /* glsl */ `
  attribute float a, sz, seed, heat, kind;
  uniform float uScale;
  uniform vec2 uNear;
  varying float vA, vSeed, vHeat, vKind;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
    float d = max(-mvPosition.z, 0.05);
    vA = a * smoothstep(uNear.x, uNear.y, d);
    vSeed = seed; vHeat = heat; vKind = kind;
    // A spark or a droplet is a point of light or a glint however near it is: never a ball in your face.
    float mx = kind > 3.5 ? 5. : (kind > .5 && kind < 1.5 ? 18. : 600.);
    gl_PointSize = clamp(sz * uScale / d, 1.5, mx);
    gl_Position = a < 0.002 ? vec4(2., 2., 2., 1.) : projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <clipping_planes_vertex>
  }`;

// kind 0 flame, 1 spark (glow); 2 smoke, 3 powder or vapour, 4 droplet (haze). `heat` is a flame's or spark's heat
// (white-hot to a dull red) and a haze particle's tone (soot to white).
const FRAG = /* glsl */ `
  uniform float uT, uGlow;
  varying float vA, vSeed, vHeat, vKind;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  #include <clipping_planes_pars_fragment>
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(h2(i), h2(i + vec2(1., 0.)), f.x), mix(h2(i + vec2(0., 1.)), h2(i + vec2(1., 1.)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0., k = .5; for (int i = 0; i < 4; i++) { s += k * vn(p); p = p * 2.03 + vec2(1.7, 9.2); k *= .5; } return s; }
  void main() {
    #include <clipping_planes_fragment>
    #include <logdepthbuf_fragment>
    vec2 uv = gl_PointCoord * 2. - 1.;
    float r = length(uv); if (r > 1.) discard;
    float ang = vSeed * 6.2831; uv = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * uv;
    vec2 q = uv * 1.4 + vSeed * 41.;
    if (uGlow > .5) {
      vec3 col;
      float dens;
      if (vKind < .5) {
        // Flame: a licking, ragged blob, hottest in the middle.
        float n = fbm(q * 1.3 + vec2(0., -uT * 2.2));
        float w = fbm(q * 2.6 + n * 2.2 + vec2(uT * .7, 0.));
        dens = 1. - smoothstep(.0, .95, r + .55 * (w - .45));
        dens *= smoothstep(.15, .55, n + .35 * (1. - r));
        float h = clamp(vHeat * (1.2 - .6 * r) + .25 * (w - .5), 0., 1.);
        // Colours in linear light (the screen brightens them): deep red, orange, yellow, near white.
        col = mix(vec3(.12, .012, .002), vec3(.9, .16, .015), smoothstep(.05, .4, h));
        col = mix(col, vec3(1., .42, .06), smoothstep(.4, .7, h));
        col = mix(col, vec3(1., .78, .42), smoothstep(.75, 1., h));
        col *= 1.25;
      } else {
        // A spark or an ember: a hot point.
        dens = exp(-r * r * 9.);
        float h = clamp(vHeat, 0., 1.);
        col = mix(vec3(1., .3, .05), vec3(1., .75, .35), smoothstep(.2, .6, h));
        col = mix(col, vec3(1., 1., .92), smoothstep(.7, 1., h)) * 2.2;
      }
      float al = clamp(dens * vA, 0., 1.);
      gl_FragColor = vec4(col * al, al);
    } else {
      float n = fbm(q + vec2(uT * .08, 0.));
      float dens;
      vec3 col;
      if (vKind > 3.5) {
        // A droplet: small and hard edged.
        dens = 1. - smoothstep(.55, .9, r);
        col = vec3(.5, .6, .72);
      } else {
        // Smoke, powder, vapour: billows.
        float w = fbm(q * 2.1 + n * 1.7);
        dens = (1. - smoothstep(.1, 1., r)) * (.45 + .75 * w);
        dens = smoothstep(.08, .7, dens);
        // Linear light: soot is very dark here to read as soot on screen.
        col = mix(vec3(.008, .007, .006), vec3(.12, .115, .11), smoothstep(0., .6, vHeat));
        col = mix(col, vKind > 2.5 ? vec3(.62, .66, .72) : vec3(.3, .29, .28), smoothstep(.6, 1., vHeat));
      }
      gl_FragColor = vec4(col, clamp(dens * vA, 0., 1.));
    }
  }`;

/** One pool: additive (`glow`) or blended (`haze`). */
class Pool {
  constructor(parent, n, glow, near, clipPlanes) {
    this.n = n;
    this.i = 0;
    this.live = 0;
    const f = (k = 1) => new Float32Array(n * k);
    this.p = f(3); this.v = f(3); this.w = f(3); this.drag = f(); this.rise = f();
    this.a = f(); this.sz = f(); this.seed = f(); this.heat = f(); this.kind = f();
    this.age = f().fill(99); this.life = f().fill(1); this.s0 = f(); this.s1 = f(); this.k = f(); this.h0 = f(); this.cool = f(); this.fade = f();
    for (let i = 0; i < n; i++) this.seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    const at = (name, arr, k = 1, dyn = true) => {
      const b = new THREE.BufferAttribute(arr, k);
      if (dyn) b.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, b);
    };
    at('position', this.p, 3); at('a', this.a); at('sz', this.sz); at('seed', this.seed, 1, false); at('heat', this.heat); at('kind', this.kind);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false, clipping: true,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 }, uT: { value: 0 }, uGlow: { value: glow ? 1 : 0 }, uNear: { value: new THREE.Vector2(...near) } },
      vertexShader: VERT, fragmentShader: FRAG
    });
    if (clipPlanes) this.mat.clippingPlanes = clipPlanes;
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = glow ? 5 : 4;
    this.pts.userData.live = true;
    parent.add(this.pts);
  }

  add(p, v, o) {
    const i = this.i;
    this.i = (i + 1) % this.n;
    const j = i * 3;
    this.p[j] = p.x; this.p[j + 1] = p.y; this.p[j + 2] = p.z;
    this.v[j] = v.x; this.v[j + 1] = v.y; this.v[j + 2] = v.z;
    const w = o.wind;
    this.w[j] = w ? w.x : 0; this.w[j + 1] = w ? w.y : 0; this.w[j + 2] = w ? w.z : 0;
    this.drag[i] = o.drag ?? 0; this.rise[i] = o.rise ?? 0;
    this.age[i] = 0; this.life[i] = Math.max(o.life ?? 1, 0.02);
    this.s0[i] = o.s0 ?? 0.2; this.s1[i] = o.s1 ?? this.s0[i];
    this.k[i] = o.k ?? 1; this.h0[i] = o.heat ?? 1; this.cool[i] = o.cool ?? 1; this.fade[i] = o.fade ?? 1.5;
    this.kind[i] = o.kind;
    this.sz[i] = this.s0[i]; this.a[i] = 0; this.heat[i] = this.h0[i];
    this.live = 1;
    this.dirtyKind = true;
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
      const u = clamp(this.age[i] / this.life[i], 0, 1), w = 1 - u;
      const j = i * 3, kd = this.drag[i] > 0 ? 1 - Math.exp(-this.drag[i] * dt) : 0;
      for (let m = 0; m < 3; m++) this.v[j + m] += (this.w[j + m] - this.v[j + m]) * kd;
      this.v[j + 1] += this.rise[i] * dt;
      for (let m = 0; m < 3; m++) this.p[j + m] += this.v[j + m] * dt;
      this.sz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - w * w);
      this.a[i] = this.k[i] * Math.min(1, u / 0.06) * Math.pow(w, this.fade[i]);
      this.heat[i] = this.kind[i] < 1.5 ? this.h0[i] * Math.pow(w, this.cool[i]) : this.h0[i];
    }
    this.live = live;
    const A = this.pts.geometry.attributes;
    A.position.needsUpdate = A.a.needsUpdate = A.sz.needsUpdate = A.heat.needsUpdate = true;
    if (this.dirtyKind) (A.kind.needsUpdate = true), (this.dirtyKind = false);
  }
}

const KIND = { flame: 0, spark: 1, smoke: 2, powder: 3, vapour: 3, droplet: 4 };

export class Blaze {
  /** `near`: particles fade out closer than near[0]..near[1] m to the camera (none in your face). */
  constructor(parent, { n = 1400, near = [0.25, 1.2], clipPlanes = null } = {}) {
    this.parent = parent;
    this.glow = new Pool(parent, n, true, near, clipPlanes);
    this.haze = new Pool(parent, n, false, near, clipPlanes);
  }

  /** One particle of `kind` (flame, spark, smoke, powder, vapour, droplet) at `p` going `v` (the parent's frame), with
   *  { life, s0, s1 (size, m, start and end), k (brightness or opacity), heat (a flame's or spark's heat, a haze's tone:
   *  0 soot to 1 white), cool (how fast heat goes), fade, wind, drag, rise }. */
  emit(kind, p, v, o = {}) {
    const K = KIND[kind];
    (K < 2 ? this.glow : this.haze).add(p, v, { ...o, kind: K });
  }

  frame(dt, t) {
    this.glow.frame(dt, t);
    this.haze.frame(dt, t);
  }

  get live() {
    return this.glow.live || this.haze.live;
  }

  setScale(s) {
    this.glow.mat.uniforms.uScale.value = this.haze.mat.uniforms.uScale.value = s;
  }

  dispose() {
    for (const P of [this.glow, this.haze]) P.pts.removeFromParent(), P.pts.geometry.dispose(), P.mat.dispose();
  }
}

export class Blazes {
  constructor(C) {
    this.C = C;
    this.map = new Map();
    this.scale = 600;
    this.t = 0;
  }

  /** The Blaze in `parent`'s frame, made the first time. `opts` only count then. */
  in(parent, opts = {}) {
    let B = this.map.get(parent);
    if (!B) {
      B = new Blaze(parent, { clipPlanes: this.C?.clipPlanes ?? null, ...opts });
      B.setScale(this.scale);
      this.map.set(parent, B);
    }
    return B;
  }

  /** Point size per metre at one metre, from the camera and the canvas height (as gas.mjs). */
  setView(camera, height) {
    this.scale = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (const B of this.map.values()) B.setScale(this.scale);
  }

  frame(dt) {
    this.t += dt;
    for (const [parent, B] of this.map) {
      // A drum segment torn down (drum.mjs) takes its fire with it.
      if (!parent.parent && !parent.isScene && !B.live) {
        B.dispose();
        this.map.delete(parent);
        continue;
      }
      B.frame(dt, this.t);
    }
  }
}
