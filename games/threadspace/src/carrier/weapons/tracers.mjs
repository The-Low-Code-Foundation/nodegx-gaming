// How the guns look: tracers, sparks, muzzle rings and motor flames. Part of `Weapons` (weapons.mjs).
//
// In space a round leaves no smoke and nothing glows from air friction. What you see of a gun is what burns: the
// propellant at the muzzle (a flash, a ring of gas thrown out sideways by the muzzle brake, burning grains flung
// ahead), and a tracer's pyrotechnic in the base of the round, which burns for as long as the round flies. The eye
// (and a camera) smears that bright point along its way, so it reads as a streak: a white-hot head, a coloured tail
// that fades. A tracer is as bright from three kilometres as from thirty metres, so it is drawn never thinner than
// `MIN_ANGLE` of the view, the way a point of light is. Most rounds in a belt are not tracers (`ball`): drawn faint.
//
// One instanced pool for every streak (`Streaks`): the shells (fighter cannon, turrets, the raider's guns, the
// railguns), the sparks (`sparkBurst`: burning grains at a muzzle, splinters of a flak burst, spatter off armour,
// glitter round a flare). Each is a quad along its way, turned to face the camera (`streakMatrix`), on a texture whose
// red is the coloured glow and green the white core (`STREAK_MAT`), tinted per streak. The point defence's rounds
// have their own pool of the same kind (weapons.mjs `roundMesh`). Rings (`ring()`), the flames behind a burning motor
// (`motorFlame`, `flameFrame`) and the motor lighting (`ignite`) are here too. Everything here is looks: unseeded
// randoms only, so a scripted run's numbers do not move.

import * as THREE from 'three';
import { clamp } from '../../util.mjs'; // not from shared.mjs: that imports this file (torpedoMesh's flame)

const MIN_ANGLE = 0.0016; // radians: a tracer is never drawn thinner than this (about 1.5 px at 1080 lines)
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _t = new THREE.Vector3();
const _s = new THREE.Vector3(), _u = new THREE.Vector3(), _col = new THREE.Color();
// Their own scratch vectors: callers hand in the shared ones (shared.mjs), so nothing here may borrow those.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();

/** The streak's quad: across x from -0.5 to 0.5, along z from the tail (-1) to just past the head (+0.06). */
export const STREAK_GEO = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -1, 0.5, 0, -1, 0.5, 0, 0.06, -0.5, 0, 0.06], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
})();

/** The streak's texture: red is the glow (wide, fading toward the tail), green the white-hot core (narrow, bright at
 *  the head). v runs tail (0) to head (1). */
function streakTex() {
  const W = 32, H = 256, c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let j = 0; j < H; j++) {
    const v = 1 - j / (H - 1); // canvas rows run top (head) to bottom (tail)
    const along = Math.pow(v, 1.6), head = Math.pow(v, 9);
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) / W - 0.5;
      const glow = Math.exp(-((x / 0.24) ** 2)) * (0.15 + 0.85 * along);
      const core = Math.exp(-((x / 0.075) ** 2)) * (0.25 * along + 0.9 * head);
      const k = (j * W + i) * 4;
      img.data[k] = Math.round(255 * clamp(glow, 0, 1));
      img.data[k + 1] = Math.round(255 * clamp(core, 0, 1));
      img.data[k + 2] = 0;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  return t;
}

/** The streaks' material: additive, the tint on the glow, the core white (onBeforeCompile on the basic material, so
 *  instancing and the log depth buffer keep working). */
export function streakMaterial() {
  const m = new THREE.MeshBasicMaterial({ map: streakTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#if defined( USE_COLOR )\n\tdiffuseColor.rgb = vColor.rgb * sampledDiffuseColor.r + vec3( 0.9 * sampledDiffuseColor.g ) * min( vec3( 1.0 ), vColor.rgb * 1.6 );\n#endif');
  };
  m.customProgramCacheKey = () => 'streak-v1';
  return m;
}

/** The matrix of a streak at `pos` (its head) going along `dir` (unit), `len` long and `w` wide, turned so its face
 *  is toward `eye`; never thinner than `MIN_ANGLE` from there. */
export function streakMatrix(m4, pos, dir, len, w, eye) {
  _z.copy(dir);
  _t.subVectors(eye, pos);
  const d = _t.length();
  w = Math.max(w, d * MIN_ANGLE);
  len = Math.max(len, w * 1.5);
  _x.crossVectors(_z, _t);
  if (_x.lengthSq() < 1e-9) _x.set(1, 0, 0).cross(_z);
  _x.normalize();
  _y.crossVectors(_z, _x);
  _x.multiplyScalar(w);
  _y.multiplyScalar(w);
  _s.copy(_z).multiplyScalar(len);
  return m4.set(_x.x, _y.x, _s.x, pos.x, _x.y, _y.y, _s.y, pos.y, _x.z, _y.z, _s.z, pos.z, 0, 0, 0, 1);
}

/** A pool of streaks drawn as one instanced mesh: `begin()`, `add(...)` each, `end()`. */
export class Streaks {
  constructor(scene, cap = 1500) {
    this.mesh = new THREE.InstancedMesh(STREAK_GEO, streakMaterial(), cap);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.cap = cap;
    this.n = 0;
    this.m4 = new THREE.Matrix4();
    scene.add(this.mesh);
  }
  begin() {
    this.n = 0;
  }
  /** `color` a THREE.Color (or hex), `k` its brightness (over 1 runs hotter: the core whitens). */
  add(pos, dir, len, w, color, k, eye) {
    if (this.n >= this.cap || !eye) return;
    this.mesh.setMatrixAt(this.n, streakMatrix(this.m4, pos, dir, len, w, eye));
    _col.set(color).multiplyScalar(k);
    this.mesh.setColorAt(this.n, _col);
    this.n++;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Each kind of round's look: tint, brightness, width (m) and how much of its speed is smeared into its length. */
export const LOOK = {
  shell: { color: '#ff9a3a', k: 1.6, w: 1.5, smear: 0.045, max: 90 }, // a turret's round: the big one
  rail: { color: '#8fc4ff', k: 1.8, w: 1.3, smear: 0.014, max: 140 },
  cannon: { color: '#ffc060', k: 1.3, w: 0.28, smear: 0.03, max: 36 }, // your fighter's tracers
  ball: { color: '#ffb070', k: 0.32, w: 0.16, smear: 0.025, max: 26 }, // the rounds between
  theirs: { color: '#ff4a2a', k: 1.5, w: 1.3, smear: 0.04, max: 70 }, // the raider's guns
  flak: { color: '#ff6a3a', k: 1.2, w: 0.5, smear: 0.03, max: 30 }, // the raider's flak at you
  bandit: { color: '#ff5a40', k: 1.2, w: 0.3, smear: 0.03, max: 32 },
  pdc: { color: '#ffe8a0', k: 1.1, w: 0.32, smear: 0.025, max: 26 },
  pdflak: { color: '#ff9a40', k: 1.3, w: 0.75, smear: 0.022, max: 14 },
  pdTheirs: { color: '#ff7050', k: 1.1, w: 0.32, smear: 0.025, max: 26 }
};

/** Which look a shell wears (projectiles.mjs `fire` sets the flags). */
export function lookOf(s) {
  if (s.rail) return LOOK.rail;
  if (s.cannon) return s.tracer ? LOOK.cannon : LOOK.ball;
  if (s.bandit) return LOOK.bandit;
  if (s.flak) return LOOK.flak;
  return s.ours ? LOOK.shell : LOOK.theirs;
}

let RING_GEO = null;
const FLAME_GEO = new THREE.ConeGeometry(1, 1, 10, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2); // its base (r 1) at z 0, its tip at z 1

/** A motor's flame: two nested cones pointing aft (+z) from `z`, `r` across at the mouth, hot white inside a coloured
 *  sheath. Scaled each frame by `flameFrame`. */
export function motorFlame(r, len, color) {
  const g = new THREE.Group();
  const sheath = new THREE.Mesh(FLAME_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const core = new THREE.Mesh(FLAME_GEO, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  sheath.scale.set(r, r, len);
  core.scale.set(r * 0.45, r * 0.45, len * 0.55);
  g.add(sheath, core);
  g.userData = { r, len, sheath, core };
  g.visible = false;
  g.traverse((o) => (o.frustumCulled = false));
  return g;
}

/** A flame lit (`on`) or not, flickering, `k` its strength (1 full). */
export function flameFrame(f, on, k = 1, t = 0) {
  f.visible = on;
  if (!on) return;
  const { r, len, sheath, core } = f.userData;
  const flick = 0.82 + 0.18 * Math.sin(t * 61) * Math.sin(t * 23 + 1.3) + 0.12 * Math.random();
  sheath.scale.set(r * (0.9 + 0.1 * flick), r * (0.9 + 0.1 * flick), len * k * flick);
  core.scale.set(r * 0.45, r * 0.45, len * 0.55 * k * (0.9 + 0.2 * Math.random()));
}

/** Mixed into `Weapons` (weapons.mjs). */
export const tracerParts = {
  /** `n` sparks from `p` (world): out along `dir` (unit, or null: every way) in a cone `spread` (0 a line, 1 a
   *  hemisphere, 2 everywhere), at `speed` m/s (± half), on top of `v0`, living `life` s (± half), `color`. */
  sparkBurst(p, n, { dir = null, spread = 2, speed = 60, v0 = null, life = 0.5, color = '#ffc070', w = 0.18, k = 1.4 } = {}) {
    const S = (this.sparks ??= []);
    for (let i = 0; i < n && S.length < 700; i++) {
      const v = _u.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      if (dir) v.multiplyScalar(spread).add(dir).normalize();
      v.multiplyScalar(speed * (0.5 + Math.random()));
      if (v0) v.add(v0);
      S.push({ pos: p.clone(), vel: v.clone(), t: 0, life: life * (0.5 + Math.random()), color, w: w * (0.6 + 0.8 * Math.random()), k });
    }
  },

  /** Sparks moving and fading, into the streak pool (after the shells: fxFrame). */
  sparksFrame(dt) {
    const S = this.sparks;
    if (!S?.length) return;
    const ref = this.body?.vel, eye = this.ear;
    for (const s of S) {
      s.t += dt;
      s.pos.addScaledVector(s.vel, dt);
      const k = 1 - s.t / s.life;
      if (k <= 0 || !eye) continue;
      _a.subVectors(s.vel, ref ?? _b.set(0, 0, 0));
      const sp = _a.length();
      if (sp > 1e-3) _a.multiplyScalar(1 / sp);
      else _a.set(0, 0, 1);
      this.streaks.add(s.pos, _a, Math.min(8, sp * 0.03 + s.w), s.w, s.color, s.k * k * k, eye);
    }
    this.sparks = S.filter((s) => s.t < s.life);
  },

  /** A ring of gas thrown out flat round `p` (world), across `d` (its axis, unit): out to `size` metres over `life`. */
  ring(p, d, size, color = '#ffc890', life = 0.35) {
    if (!RING_GEO) RING_GEO = new THREE.RingGeometry(0.55, 1, 40);
    const m = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.position.copy(p);
    // `d` null: a blast's shell of gas, seen edge on all round, so turned to face you.
    if (!d) d = this.ear && this.ear.distanceToSquared(p) > 1 ? _d.subVectors(this.ear, p).normalize() : _d.set(0, 1, 0);
    m.quaternion.setFromUnitVectors(_e.set(0, 0, 1), d);
    m.frustumCulled = false;
    this.scene.add(m);
    this.fx.push({ kind: 'ring', mesh: m, t: 0, life, size, vel: this.body?.vel?.clone() ?? null });
  },

  /** A motor lights at `p` (world), its nose along `d`: a flash, a ring of the first gas, burning grains thrown aft, the
   *  sound by distance. `size` 1 is a missile, about 3 a torpedo. */
  ignite(p, d, size, v0, color = '#ffd8a0') {
    this.flash(p, 4 * size, color, 0.22 + 0.05 * size);
    this.flash(p, 1.8 * size, '#ffffff', 0.09);
    this.ring(_c.copy(p).addScaledVector(d, -0.6 * size), d, 7 * size, color, 0.3 + 0.05 * size);
    this.sparkBurst(p, Math.round(10 + 6 * size), { dir: _d.copy(d).negate(), spread: 0.5, speed: 70 * Math.sqrt(size), v0, life: 0.5, color: '#ffc070' });
    const G = this.gas;
    for (let i = 0; G && i < 10 + 6 * size; i++) {
      const v = _a.copy(d).multiplyScalar(-(30 + 50 * Math.random()) * Math.sqrt(size));
      v.x += (Math.random() - 0.5) * 30;
      v.y += (Math.random() - 0.5) * 30;
      v.z += (Math.random() - 0.5) * 30;
      if (v0) v.add(v0);
      G.emit(p, v, 1 + Math.random() * 1.5, 0.6 * size, (4 + 5 * Math.random()) * size, 0.2, 0.7, 0);
    }
    const dist = this.ear ? this.ear.distanceTo(p) : 800;
    this.feel?.ignite?.(clamp(1 - dist / (900 + 400 * size), 0, 1) * Math.min(1.4, 0.6 + 0.3 * size), dist < 60);
  },

  /** A burning motor's trail of gas, `rate` wisps a second, out of its nozzle at `p` aft along `-d` (looks only). */
  trail(p, d, v0, rate, dt, size = 1) {
    const G = this.gas;
    if (!G || Math.random() > rate * dt) return;
    const v = _a.copy(d).multiplyScalar(-(40 + 40 * Math.random()) * size);
    v.x += (Math.random() - 0.5) * 8 * size;
    v.y += (Math.random() - 0.5) * 8 * size;
    v.z += (Math.random() - 0.5) * 8 * size;
    if (v0) v.add(v0);
    G.emit(p, v, 1.2 + Math.random() * 1.6, 0.4 * size, (3 + 3 * Math.random()) * size, 0.1, 0.75, 0);
  },

  /** A round meets armour or a hull at `p` (world), coming along `d` (unit, or null): a flash and spatter thrown back
   *  off the plate, `size` 1 a turret's shell. */
  impact(p, d, size = 1, color = '#ffc070') {
    this.flash(p, 2.2 * size, color, 0.12 + 0.05 * size);
    this.sparkBurst(p, Math.round(6 + 14 * size), { dir: d ? _d.copy(d).negate() : null, spread: d ? 1.4 : 2, speed: 40 + 50 * size, v0: this.body?.vel, life: 0.35 + 0.25 * size, color, w: 0.12 + 0.1 * size });
  }
};
