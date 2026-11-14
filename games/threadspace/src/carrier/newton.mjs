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
    // What the ship can really do on each axis each way (m/s² and rad/s²): asked for flat out, what comes out.
    this.cap = { pos: [], neg: [] };
    const u = new Array(AXES).fill(0);
    for (let k = 0; k < AXES; k++) {
      for (const s of [1, -1]) {
        u.fill(0);
        u[k] = s;
        const out = this.allocate(u);
        this.cap[s > 0 ? 'pos' : 'neg'][k] = Math.abs(out[k]);
      }
    }
    this.allocate(u.fill(0));
  }

  /** Sets every thruster's throttle for command `u` and returns the six accelerations they make together. */
  allocate(u) {
    const out = new Array(AXES).fill(0);
    for (const t of this.list) {
      let s = 0;
      for (let k = 0; k < t.axes; k++) {
        if (!u[k]) continue;
        const n = u[k] > 0 ? this.norm.pos[k] : this.norm.neg[k];
        if (n) s += (u[k] * t.c[k]) / n;
      }
      t.throttle = clamp(s, 0, t.health ?? 1); // a damaged thruster gives what it still can (integrity.mjs)
      for (let k = 0; k < AXES; k++) out[k] += t.c[k] * t.throttle;
    }
    return out;
  }

  /** The most the thrusters can give on axis `k` in the direction of `sign`. */
  capOf(k, sign) {
    return sign >= 0 ? this.cap.pos[k] : this.cap.neg[k];
  }
}

/** Expands the layout's thruster entries into single thrusters: each main drive points aft; each manoeuvring cluster has
 *  one nozzle pointing outboard, one up or down (away from the centre of mass) and one fore or aft (away from the
 *  middle), which is enough for every turn and every slide. Positions are made relative to the centre of mass. */
export function thrustersFromLayout(L, { s = 1 } = {}) {
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
  }

  /** `f` is the input frame (input.mjs); `hands` false lets the ship fly on with nobody at the controls. */
  frame(f, dt, hands = true) {
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
const PLUME_RCS = new THREE.MeshBasicMaterial({ color: '#fff4dc', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const BELL = new THREE.MeshStandardMaterial({ color: '#2a2e35', roughness: 0.5, metalness: 0.7, flatShading: true });
const THROAT = new THREE.MeshBasicMaterial({ color: '#7ab8ff', toneMapped: false });
const BLOCK = new THREE.MeshStandardMaterial({ color: '#4a525c', roughness: 0.6, metalness: 0.4, flatShading: true });

/** The bells, nozzles and plumes on the outside of `frame` (the layout's frame), one plume per thruster. `fittings`
 *  false makes only the manoeuvring plumes (a fighter brings its own engine and plume, ships.mjs). */
export function buildThrusterMeshes(frame, list, { fittings = true } = {}) {
  const up = new THREE.Vector3(0, 1, 0);
  const clusters = new Set();
  for (const t of list) {
    if (!fittings && t.kind === 'main') continue;
    // The cone is only the jet's hot core at the nozzle: what it throws out is gas (gas.mjs).
    const len = t.kind === 'main' ? t.r * 8 : 2.4 * (t.s ?? 1);
    const base = t.kind === 'main' ? t.r * 0.7 : 0.4 * (t.s ?? 1);
    const geo = new THREE.ConeGeometry(base, len, 12, 1, true);
    geo.translate(0, len / 2, 0); // wide end at the nozzle, tip out along +y (then turned to the exhaust)
    const plume = new THREE.Mesh(geo, t.kind === 'main' ? PLUME_MAIN : PLUME_RCS);
    plume.quaternion.setFromUnitVectors(up, t.dir);
    plume.position.copy(t.at);
    if (t.kind === 'main') plume.position.z += t.r * 1.8; // from the bell's mouth
    plume.visible = false;
    frame.add(plume);
    t.plume = plume;
    if (!fittings) continue;
    if (t.kind === 'main') {
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.55, t.r, t.r * 1.8, 18, 1, true), BELL);
      bell.material.side = THREE.DoubleSide;
      bell.rotation.x = -Math.PI / 2; // narrow end forward at the hull, mouth aft
      bell.position.copy(t.at).add(new THREE.Vector3(0, 0, t.r * 0.9));
      bell.userData.fitting = true; // the Blender hull brings its own (layout.mjs loadHull)
      frame.add(bell);
      const throat = new THREE.Mesh(new THREE.CircleGeometry(t.r * 0.5, 18), THROAT);
      throat.position.copy(t.at).add(new THREE.Vector3(0, 0, 0.3));
      throat.userData.fitting = true;
      frame.add(throat);
    } else {
      const key = t.pos.toArray().join(',');
      if (!clusters.has(key)) {
        clusters.add(key);
        const blk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), BLOCK);
        blk.position.copy(t.at).addScaledVector(t.dir, -1.2);
        blk.userData.fitting = true;
        frame.add(blk);
      }
      const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 0.6, 8), BELL);
      nz.quaternion.setFromUnitVectors(up, t.dir);
      nz.position.copy(t.at);
      nz.userData.fitting = true;
      frame.add(nz);
    }
  }
}

/** Each plume as long and as bright as its thruster's throttle, with a flicker. With `fx` (a Gas, gas.mjs), each firing
 *  thruster also throws its gas out into the world. */
export function updatePlumes(list, time, fx = null, dt = 0) {
  for (const t of list) {
    if (!t.plume) continue;
    const k = t.throttle;
    t.plume.visible = k > 0.02;
    if (fx) {
      t.plume.updateWorldMatrix(true, false);
      const m = t.plume.matrixWorld;
      _v.setFromMatrixPosition(m);
      _w.setFromMatrixColumn(m, 1).normalize();
      // A fighter's thrusters are the scale the exhaust is tuned at (s 0.2, r 0.75); the carrier's are bigger.
      fx.nozzle(t.plume, _v, _w, k, dt, t.kind === 'main' ? { kind: 'main', s: t.r / 0.75 } : { s: (t.s ?? 1) / 0.2 });
    }
    if (!t.plume.visible) continue;
    const flick = 0.9 + 0.1 * Math.sin(time * 40 + t.pos.x);
    t.plume.scale.set(0.6 + 0.4 * k, (0.25 + 0.75 * k) * flick, 0.6 + 0.4 * k);
  }
}
