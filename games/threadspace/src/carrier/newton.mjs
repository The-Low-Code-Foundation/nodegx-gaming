// Flight by thrusters, the Newtonian way: a ship keeps moving and keeps turning until something pushes it otherwise,
// and the only things that push are its thrusters, each where it actually sits on the hull and pointing the way it
// actually points. Turning comes from pairs of manoeuvring thrusters at the bow and the stern firing in opposite
// directions; moving comes from the main drives aft and the same thrusters firing together. The carrier and (later)
// the fighters share `Rigid`; a fighter flies on its own model (flight.mjs: per-nozzle valves, pops and the attitude
// hold, as settled in the Fighter Sound Lab).
//
// A command is six numbers from -1 to 1: an acceleration along the ship's x, y, z and a turn about them. Each thruster
// fires as hard as it helps that command, and what the ship then actually does is the sum of what the thrusters
// produce, so a command the thrusters cannot give (a pure sideways slide from one cluster) is not given.
//
// Flight assist is a pilot's helper, not physics: with it on, any axis you are not commanding is steered back to zero
// turn (ROT), and in FULL to zero drift too. Off, the ship does exactly and only what you tell it. A fighter's FULL is
// cruise: you set a speed and she flies where her nose points at it (the assist does the pushing, `Helm.cruise`).

import * as THREE from 'three';
import { clamp } from '../util.mjs';

export const ASSIST = ['OFF', 'ROT', 'FULL'];
const AXES = 6;
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Rigid {
  /** `size` [w, h, l] in metres: the moments of inertia of a solid box that size. */
  constructor({ mass, size }) {
    const [w, h, l] = size;
    this.mass = mass;
    this.I = new THREE.Vector3((mass * (h * h + l * l)) / 12, (mass * (w * w + l * l)) / 12, (mass * (w * w + h * h)) / 12);
    this.vel = new THREE.Vector3(); // world, m/s
    this.ang = new THREE.Vector3(); // the ship's own frame, rad/s
  }
}

export class Thrusters {
  /** `list`: { pos, dir, force, kind } with `pos` from the centre of mass and `dir` the way the exhaust goes (the push is
   *  the other way), both in the ship's frame. */
  constructor(list, body) {
    this.body = body;
    this.list = list;
    for (const t of list) {
      const F = t.dir.clone().multiplyScalar(-t.force);
      const tau = new THREE.Vector3().crossVectors(t.pos, F);
      t.c = [F.x / body.mass, F.y / body.mass, F.z / body.mass, tau.x / body.I.x, tau.y / body.I.y, tau.z / body.I.z];
      t.throttle = 0;
      // The main drives push; they are not steered for turning (that would shove the ship ahead every time it turned).
      t.axes = t.kind === 'main' ? 3 : AXES;
    }
    // How far each thruster's push along an axis is scaled: by the strongest single push on that axis that way.
    this.norm = { pos: new Array(AXES).fill(0), neg: new Array(AXES).fill(0) };
    for (const t of list) for (let k = 0; k < t.axes; k++) {
      if (t.c[k] > 0) this.norm.pos[k] = Math.max(this.norm.pos[k], t.c[k]);
      else this.norm.neg[k] = Math.max(this.norm.neg[k], -t.c[k]);
    }
    // The same for the manoeuvring jets alone (docking mode never lights the main drive).
    this.normJ = { pos: new Array(AXES).fill(0), neg: new Array(AXES).fill(0) };
    for (const t of list) if (t.kind !== 'main') for (let k = 0; k < t.axes; k++) {
      if (t.c[k] > 0) this.normJ.pos[k] = Math.max(this.normJ.pos[k], t.c[k]);
      else this.normJ.neg[k] = Math.max(this.normJ.neg[k], -t.c[k]);
    }
    // What the ship can really do on each axis each way (m/s² and rad/s²): asked for flat out, what comes out.
    this.cap = { pos: [], neg: [] };
    this.capJ = { pos: [], neg: [] }; // and on her jets alone
    const u = new Array(AXES).fill(0);
    for (const [cap, jets] of [[this.cap, false], [this.capJ, true]]) {
      for (let k = 0; k < AXES; k++) {
        for (const s of [1, -1]) {
          u.fill(0);
          u[k] = s;
          const out = this.allocate(u, jets);
          cap[s > 0 ? 'pos' : 'neg'][k] = Math.abs(out[k]);
        }
      }
    }
    this.allocate(u.fill(0));
  }

  /** Sets every thruster's throttle for command `u` and returns the six accelerations they make together. `jets`:
   *  the manoeuvring jets only, the main drives shut (docking mode). */
  allocate(u, jets = false) {
    const out = new Array(AXES).fill(0), N = jets ? this.normJ : this.norm;
    for (const t of this.list) {
      if (jets && t.kind === 'main') {
        t.throttle = 0;
        continue;
      }
      let s = 0;
      for (let k = 0; k < t.axes; k++) {
        if (!u[k]) continue;
        const n = u[k] > 0 ? N.pos[k] : N.neg[k];
        if (n) s += (u[k] * t.c[k]) / n;
      }
      t.throttle = clamp(s, 0, t.health ?? 1); // a damaged thruster gives what it still can (integrity.mjs)
      for (let k = 0; k < AXES; k++) out[k] += t.c[k] * t.throttle;
    }
    return out;
  }

  /** The most the thrusters can give on axis `k` in the direction of `sign` (`jets`: on the manoeuvring jets alone). */
  capOf(k, sign, jets = false) {
    const c = jets ? this.capJ : this.cap;
    return sign >= 0 ? c.pos[k] : c.neg[k];
  }
}

/** Expands the layout's thruster entries into single thrusters: each main drive points aft; each manoeuvring cluster has
 *  one nozzle pointing outboard, one up or down (away from the centre of mass) and one fore or aft (away from the
 *  middle), which is enough for every turn and every slide. Positions are made relative to the centre of mass. */
export function thrustersFromLayout(L, { s = L.thrusters.rcsScale ?? 1 } = {}) {
  const com = new THREE.Vector3(...L.com);
  const out = [];
  for (const m of L.thrusters.main) out.push({ kind: 'main', at: new THREE.Vector3(...m.at), pos: new THREE.Vector3(...m.at).sub(com), dir: new THREE.Vector3(0, 0, 1), force: m.force, r: m.r });
  for (const c of L.thrusters.rcs) {
    const p = new THREE.Vector3(...c.at);
    const rel = p.clone().sub(com);
    const dirs = [new THREE.Vector3(Math.sign(rel.x), 0, 0), new THREE.Vector3(0, Math.sign(rel.y), 0), new THREE.Vector3(0, 0, Math.sign(rel.z))];
    for (const d of dirs) out.push({ kind: 'rcs', at: p.clone().addScaledVector(d, 1.2 * s), pos: rel.clone(), dir: d, force: L.thrusters.rcsForce, r: 0.9 * s, s });
  }
  return out;
}

/** The helm: reads the controls into a command, adds flight assist, runs the thrusters, moves the ship. */
export class Helm {
  constructor(obj, body, thrusters) {
    this.obj = obj;
    this.body = body;
    this.thr = thrusters;
    this.assist = 1;
    this.stick = { x: 0, y: 0 };
    this.u = new Array(AXES).fill(0);
    this.out = new Array(AXES).fill(0);
    this.spaceWas = false;
    // What "at rest" means to the assist and the instruments: zero velocity in the world for the carrier, the
    // carrier's own velocity for a fighter (its flight computer holds station on the mothership).
    this.ref = new THREE.Vector3();
    // How quickly the assist brings a turn and a drift to rest, in seconds: slow and gentle for the carrier. With
    // `rate` (rad/s) set, the assist also turns the stick into a turn-rate command: full stick holds that rate instead
    // of spinning faster for as long as you hold it (a fighter's fly-by-wire). Assist OFF is always raw thrust.
    this.tau = { turn: 1.2, drift: 2, rate: 0, expo: 0 };
    // Cruise, for a fighter (`cruise` set): in FULL, W and S (or the wheel) set a speed instead of pushing, and the assist
    // flies her where her nose points at that speed, killing any slide. { max, rate (m/s per second of holding W),
    // step (m/s per wheel notch) }. Without it, FULL holds still when you let go (the carrier).
    this.cruise = null;
    this.set = 0;
    this.assistWas = this.assist;
    // Docking mode (`dockMode()`), for slow, exact flying beside a mothership: see `dockFrame`.
    this.dock = null;
  }

  /** Docking mode on or off. On, the keys no longer push: each tap of a slide key changes a set velocity (against
   *  `ref`, in her own frame) by `step` m/s (held past `after` s it runs at `ramp` m/s²), and the jets fly her to it
   *  and hold it; X sets it to zero. The main drive stays shut. The stick and the turn keys ask for a slow turn rate
   *  (`rate`, rad/s, full over), and she stops turning when you let go. `aim` (a world attitude, or a function that
   *  gives one) with `hold` true is held instead: the jets turn her to it and keep her there, until a turn key is
   *  touched. It is the jets doing all of it: nothing here moves her but `allocate`. */
  dockMode(on, opts = {}) {
    if (!on) return (this.dock = null);
    const v = this.localVel(new THREE.Vector3());
    const r = (x) => Math.round(x * 10) / 10;
    this.dock = { on: true, set: new THREE.Vector3(r(v.x), r(v.y), r(v.z)), was: [0, 0, 0], held: [0, 0, 0], step: 0.1, after: 0.4, ramp: 0.8, max: 8, tau: 0.7, rate: 0.07, tauW: 0.5, tauA: 2, aim: null, hold: false, ...opts };
    return this.dock;
  }

  /** What the instruments call the assist while docking mode is on (hud.mjs reads `assistName`). */
  get assistName() {
    return this.dock?.on ? `DOCKING${this.dock.hold ? ' · HDG HOLD' : ''}` : undefined;
  }

  /** A frame in docking mode: velocities set and held on the jets, a slow turn rate or an attitude held. */
  dockFrame(f, dt, hands) {
    const D = this.dock, u = this.u.fill(0), k = f.keys, b = this.body, thr = this.thr;
    const key = (c) => (hands && k.has(c) ? 1 : 0);
    if (hands && (f.dx || f.dy)) {
      this.stick.x = clamp(this.stick.x + f.dx * 0.004, -1, 1);
      this.stick.y = clamp(this.stick.y - f.dy * 0.004, -1, 1);
    }
    const decay = Math.max(0, 1 - dt * 2.2);
    this.stick.x *= decay;
    this.stick.y *= decay;
    this.spaceWas = !!key('Space'); // Space does nothing here: K leaves docking mode
    // The set velocity: a tap is a step, a held key runs it.
    const ax = [key('KeyD') - key('KeyA'), key('KeyR') - key('KeyF'), key('KeyS') - key('KeyW')];
    for (let i = 0; i < 3; i++) {
      let s = D.set.getComponent(i);
      if (ax[i] && ax[i] !== D.was[i]) (s = Math.round((s + ax[i] * D.step) * 100) / 100), (D.held[i] = 0);
      else if (ax[i] && (D.held[i] += dt) > D.after) s += ax[i] * D.ramp * dt;
      D.was[i] = ax[i];
      D.set.setComponent(i, clamp(s, -D.max, D.max));
    }
    if (key('KeyX')) D.set.set(0, 0, 0);
    const v = this.localVel(_v);
    for (let i = 0; i < 3; i++) {
      const err = D.set.getComponent(i) - v.getComponent(i);
      if (Math.abs(err) < 1e-4) continue;
      u[i] = clamp(err / ((thr.capOf(i, err, true) || 1e-6) * D.tau), -1, 1);
    }
    // Turning: the keys (and, without a held heading, the stick) ask for a rate; a held heading asks for the rate
    // that closes on it.
    const turn = [key('ArrowUp') - key('ArrowDown'), key('ArrowLeft') - key('ArrowRight'), key('KeyZ') - key('KeyC')];
    if (turn[0] || turn[1] || turn[2]) D.hold = false;
    const aim = D.hold ? (typeof D.aim === 'function' ? D.aim() : D.aim) : null;
    if (aim) {
      // The turn from her attitude to the aim, as a vector in her own frame (its length the angle).
      const e = _q.copy(this.obj.quaternion).invert().multiply(aim);
      if (e.w < 0) e.set(-e.x, -e.y, -e.z, -e.w);
      const sn = Math.hypot(e.x, e.y, e.z), ang = 2 * Math.atan2(sn, e.w);
      _w.set(e.x, e.y, e.z).multiplyScalar(sn > 1e-9 ? ang / sn : 0);
    } else {
      if (!D.hold) (turn[0] = clamp(turn[0] + this.stick.y, -1, 1)), (turn[1] = clamp(turn[1] - this.stick.x, -1, 1));
      for (let i = 0; i < 3; i++) if (Math.abs(turn[i]) < 0.04) turn[i] = 0;
    }
    for (let i = 0; i < 3; i++) {
      const want = aim ? clamp(_w.getComponent(i) / D.tauA, -D.rate, D.rate) : turn[i] * D.rate;
      const err = want - b.ang.getComponent(i);
      if (Math.abs(err) < 1e-6) continue;
      u[3 + i] = clamp(err / ((thr.capOf(3 + i, err, true) || 1e-6) * D.tauW), -1, 1);
    }
    this.out = thr.allocate(u, true);
    step(this.obj, b, this.out, dt);
  }

  /** `f` is the input frame (input.mjs); `hands` false lets the ship fly on with nobody at the controls. */
  frame(f, dt, hands = true) {
    if (this.dock?.on) return this.dockFrame(f, dt, hands);
    const u = this.u.fill(0);
    const k = f.keys;
    if (hands) {
      if (f.dx || f.dy) {
        this.stick.x = clamp(this.stick.x + f.dx * 0.004, -1, 1);
        this.stick.y = clamp(this.stick.y - f.dy * 0.004, -1, 1);
      }
      const decay = Math.max(0, 1 - dt * 2.2);
      this.stick.x *= decay;
      this.stick.y *= decay;
      const key = (c) => (k.has(c) ? 1 : 0);
      // Slide and thrust, in the ship's frame: x starboard, y up, -z ahead.
      u[0] = key('KeyD') - key('KeyA');
      u[1] = key('KeyR') - key('KeyF');
      u[2] = key('KeyS') - key('KeyW');
      // Turn: pitch about x (nose up is +), yaw about y (nose left is +), roll about z (left wing down is -).
      u[3] = clamp(this.stick.y + key('ArrowUp') - key('ArrowDown'), -1, 1);
      u[4] = clamp(-this.stick.x + key('ArrowLeft') - key('ArrowRight'), -1, 1);
      u[5] = key('KeyZ') - key('KeyC');
      for (let i = 3; i < 6; i++) if (Math.abs(u[i]) < 0.04) u[i] = 0;
      const space = k.has('Space');
      if (space && !this.spaceWas) this.assist = (this.assist + 1) % ASSIST.length;
      this.spaceWas = space;
    }
    const stop = hands && k.has('KeyX'); // all stop: assist on every axis, whatever else you are pressing
    const b = this.body;
    const cruise = !!this.cruise && this.assist === 2;
    // Coming into cruise, the set speed starts at the speed she already has ahead, so nothing lurches.
    if (cruise && this.assistWas !== 2) this.set = clamp(-this.localVel(_w).z, 0, this.cruise.max);
    this.assistWas = this.assist;
    if (cruise) {
      if (hands) {
        const dir = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
        this.set = clamp(this.set + dir * this.cruise.rate * dt - (f.wheel || 0) * this.cruise.step, 0, this.cruise.max);
        if (stop) this.set = 0;
      }
      u[2] = 0; // W and S set the speed; the assist does the pushing
    }
    // A softer stick: small movements ask for small turns, full stick still asks for the fastest (`expo` 0 is linear).
    if (this.tau.rate && this.tau.expo) for (let i = 3; i < 6; i++) u[i] = (1 - this.tau.expo) * u[i] + this.tau.expo * u[i] ** 3;
    // Turn assist: steer any free axis's turn rate to zero, as fast as the thrusters allow and gently at the end.
    if (this.assist >= 1 || stop) {
      for (let i = 0; i < 3; i++) {
        const w = b.ang.getComponent(i);
        if (u[3 + i] && !stop) {
          if (this.tau.rate) {
            const err = u[3 + i] * this.tau.rate - w;
            u[3 + i] = clamp(err / ((this.thr.capOf(3 + i, err) || 1e-6) * this.tau.turn), -1, 1);
          }
          continue;
        }
        if (Math.abs(w) < 1e-6) continue;
        const cap = this.thr.capOf(3 + i, -w) || 1e-6;
        u[3 + i] = clamp(-w / (cap * this.tau.turn), -1, 1);
      }
    }
    // Drift assist: the same for velocity in the ship's frame.
    if (this.assist >= 2 || stop) {
      _q.copy(this.obj.quaternion).invert();
      const v = _v.copy(b.vel).sub(this.ref).applyQuaternion(_q);
      for (let i = 0; i < 3; i++) {
        if (u[i] && !stop) continue;
        const vi = v.getComponent(i) - (i === 2 && cruise && !stop ? -this.set : 0); // in cruise, ahead is held at the set speed
        if (Math.abs(vi) < 1e-3) continue;
        const cap = this.thr.capOf(i, -vi) || 1e-6;
        u[i] = clamp(-vi / (cap * this.tau.drift), -1, 1);
      }
    }
    this.out = this.thr.allocate(u);
    step(this.obj, b, this.out, dt);
  }

  /** The ship's velocity relative to `ref`, in its own frame (x starboard, y up, -z ahead). */
  localVel(t = new THREE.Vector3()) {
    return t.copy(this.body.vel).sub(this.ref).applyQuaternion(_q.copy(this.obj.quaternion).invert());
  }
}

/** Integrates one step: the turn rate (own frame) and the velocity (world) from the six accelerations. */
export function step(obj, body, out, dt) {
  body.ang.x += out[3] * dt;
  body.ang.y += out[4] * dt;
  body.ang.z += out[5] * dt;
  const a = body.ang.length() * dt;
  if (a > 0) obj.quaternion.multiply(_q.setFromAxisAngle(_w.copy(body.ang).normalize(), a));
  obj.quaternion.normalize();
  const acc = _v.set(out[0], out[1], out[2]).applyQuaternion(obj.quaternion);
  body.vel.addScaledVector(acc, dt);
  obj.position.addScaledVector(body.vel, dt);
}

// --- plumes ----------------------------------------------------------------------------------------------------------

const PLUME_MAIN = new THREE.MeshBasicMaterial({ color: '#9fd0ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const BELL = new THREE.MeshStandardMaterial({ color: '#2a2e35', roughness: 0.5, metalness: 0.7, flatShading: true });
const THROAT = new THREE.MeshBasicMaterial({ color: '#7ab8ff', toneMapped: false });
const BLOCK = new THREE.MeshStandardMaterial({ color: '#4a525c', roughness: 0.6, metalness: 0.4, flatShading: true });
// A manoeuvring jet's nozzle: a short bell with a pale lip and a black throat, so you see where the gas will come from.
const JET_BELL = new THREE.MeshStandardMaterial({ color: '#8d949c', roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide });
const JET_LIP = new THREE.MeshStandardMaterial({ color: '#d6dade', roughness: 0.4, metalness: 0.2 });
const JET_THROAT = new THREE.MeshBasicMaterial({ color: '#030405' });
/** The nozzle's size for a jet of scale 1 (metres): the mouth's radius, the throat's, the bell's length. The mouth is
 *  at the thruster's `at`, where puff.mjs starts the gas (its `JET.mouth` is the gas's width there). */
export const NOZZLE = { mouth: 0.46, throat: 0.2, len: 0.62, lip: 0.05 };
let NOZZLE_GEO = null;
function nozzleGeo() {
  if (NOZZLE_GEO) return NOZZLE_GEO;
  const N = NOZZLE;
  const bell = new THREE.CylinderGeometry(N.mouth, N.throat, N.len, 16, 1, true).translate(0, -N.len / 2, 0); // mouth at y 0, body back along -y
  const lip = new THREE.TorusGeometry(N.mouth, N.lip, 6, 20).rotateX(Math.PI / 2);
  const throat = new THREE.CircleGeometry(N.mouth * 0.93, 16).rotateX(-Math.PI / 2).translate(0, -N.len * 0.2, 0); // the dark inside, a little down the bell
  return (NOZZLE_GEO = { bell, lip, throat });
}

/** The bells, nozzles and plumes on the outside of `frame` (the layout's frame). A main drive gets a bell and a plume
 *  cone; a manoeuvring jet gets a nozzle (three instanced meshes for all of them, shown on a Blender hull too: they
 *  mark the layout's own thruster positions, which is where the gas comes from) and `t.plume`, an empty at its mouth
 *  pointing along the gas, which `updatePlumes` reads. `fittings` false makes only the manoeuvring ones (a fighter
 *  brings its own engine and plume, ships.mjs). */
export function buildThrusterMeshes(frame, list, { fittings = true } = {}) {
  const up = new THREE.Vector3(0, 1, 0);
  const clusters = new Set();
  const jets = list.filter((t) => t.kind !== 'main');
  if (jets.length) {
    const G = nozzleGeo(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const parts = [new THREE.InstancedMesh(G.bell, JET_BELL, jets.length), new THREE.InstancedMesh(G.lip, JET_LIP, jets.length), new THREE.InstancedMesh(G.throat, JET_THROAT, jets.length)];
    jets.forEach((t, i) => {
      m4.compose(t.at, q.setFromUnitVectors(up, t.dir), sc.setScalar(t.s ?? 1));
      for (const p of parts) p.setMatrixAt(i, m4);
    });
    for (const p of parts) {
      p.name = 'jet-nozzles';
      p.computeBoundingSphere();
      frame.add(p);
    }
  }
  for (const t of list) {
    if (!fittings && t.kind === 'main') continue;
    if (t.kind !== 'main') {
      // What a jet throws out is drawn by puff.mjs: here only where from and which way.
      const mouth = new THREE.Object3D();
      mouth.quaternion.setFromUnitVectors(up, t.dir);
      mouth.position.copy(t.at);
      frame.add(mouth);
      t.plume = mouth;
      const key = t.pos.toArray().join(',');
      if (fittings && !clusters.has(key)) {
        clusters.add(key);
        const s = t.s ?? 1, blk = new THREE.Mesh(new THREE.BoxGeometry(1.7 * s, 1.7 * s, 1.7 * s), BLOCK);
        blk.position.copy(t.at).addScaledVector(t.dir, -1.2 * s);
        blk.userData.fitting = true; // the Blender hull brings its own (layout.mjs loadHull)
        frame.add(blk);
      }
      continue;
    }
    // The cone is only the drive's hot core at the bell: what it throws out is gas (gas.mjs).
    const len = t.r * 8, base = t.r * 0.7;
    const geo = new THREE.ConeGeometry(base, len, 12, 1, true);
    geo.translate(0, len / 2, 0); // wide end at the nozzle, tip out along +y (then turned to the exhaust)
    const plume = new THREE.Mesh(geo, PLUME_MAIN);
    plume.quaternion.setFromUnitVectors(up, t.dir);
    plume.position.copy(t.at);
    plume.position.z += t.r * 1.8; // from the bell's mouth
    plume.visible = false;
    frame.add(plume);
    t.plume = plume;
    if (!fittings) continue;
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.55, t.r, t.r * 1.8, 18, 1, true), BELL);
    bell.material.side = THREE.DoubleSide;
    bell.rotation.x = -Math.PI / 2; // narrow end forward at the hull, mouth aft
    bell.position.copy(t.at).add(new THREE.Vector3(0, 0, t.r * 0.9));
    bell.userData.fitting = true;
    frame.add(bell);
    const throat = new THREE.Mesh(new THREE.CircleGeometry(t.r * 0.5, 18), THROAT);
    throat.position.copy(t.at).add(new THREE.Vector3(0, 0, 0.3));
    throat.userData.fitting = true;
    frame.add(throat);
  }
}

/** Every frame. A main drive's plume cone as long and as bright as its throttle, with a flicker, and with `fx` (a
 *  Gas, gas.mjs) its exhaust thrown out into the world. A manoeuvring jet's puff, with `puffs` (puff.mjs): told every
 *  frame, firing or not, so it knows the nozzle's own velocity and the moment the valve opens. */
export function updatePlumes(list, time, fx = null, dt = 0, puffs = null) {
  for (const t of list) {
    if (!t.plume) continue;
    const k = t.throttle, main = t.kind === 'main';
    if (main) t.plume.visible = k > 0.02;
    if (main ? fx : puffs) {
      t.plume.updateWorldMatrix(true, false);
      const m = t.plume.matrixWorld;
      _v.setFromMatrixPosition(m);
      _w.setFromMatrixColumn(m, 1).normalize();
      // A fighter's drive is the scale the exhaust is tuned at (r 0.75); the carrier's are bigger.
      if (main) fx.nozzle(t.plume, _v, _w, k, dt, { kind: 'main', s: t.r / 0.75 });
      else puffs.jet(t, _v, _w, k, dt, t.s ?? 1);
    }
    if (!main || !t.plume.visible) continue;
    const flick = 0.9 + 0.1 * Math.sin(time * 40 + t.pos.x);
    t.plume.scale.set(0.6 + 0.4 * k, (0.25 + 0.75 * k) * flick, 0.6 + 0.4 * k);
  }
}
