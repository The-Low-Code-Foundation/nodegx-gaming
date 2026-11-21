// Mending fighters in the hangar (design/ROADMAP.md phase 9, session 3). A damaged fighter set down on her pad gets a
// repair crew, and she cannot launch until it is done.
//
// Her damage is her own (fighter-damage.mjs keeps it on her model, `userData.dmg`): every damaged part is a job. How
// long each takes is in the layout's `fighter.repair` (set in tools/carrier-v2.mjs): `min` + `per[does]` × what the
// part has lost, + `hole` for each hole in a tank. Leaks and the cockpit go first (`order`).
//
//   The outside (tanks, jet blocks, radiators): drones from racks on the hangar's walls. Each flies weightless and
//   Newtonian (a velocity it wants on a braking profile, the push it gets capped at `accel`), up to a lane over
//   everything, along it and down to a point `standoff` off the part, kept clear of the gangway, the boards and the
//   fighters. There it fits a plate over each hole and welds it round, as your welder does (hitfx.mjs `weldTick`: the
//   plate, the bead creeping round it hot and cooling, the arc's blue light, sparks), then welds over the rest of the
//   part. A welded hole leaves a plate on her skin (fighter-damage.mjs `plate`), not a clean skin; a tank stops leaking
//   as each hole is sealed.
//   The inside (cockpit and canopy, guns, drive): the deck crew, in heavy suits, weightless, push off along the gangway
//   and out along her spur to her flank, and work in foot restraints at her open frame (the canopy up for the
//   cockpit). A new canopy takes the cracks away.
//
// The pad's board shows each part, what is being done to it and the time left (`board`); the fighter seat refuses a
// launch while she is held (`fighter.held`, seats/fighter.mjs). You can help: E on a damaged part outside, with the
// welder and plates (the damage control `patch` kit), adds `help` to the drone's work on it.
//
// Timing and the drones' flight are seeded physics (nothing random, the same steps every run). The crew's time to a job
// is its way's length at `crew.speed` (their own travel, floating.mjs, has random beats, so it only follows). What
// you see (sparks, puffs, the weld point wandering, the bead) is Math.random with private scratch vectors.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { weldTick, zapTick } from './hitfx.mjs';
import { nearest, band } from './fighter-damage.mjs';
import { crewMember, removeCrew } from './crew.mjs';
import { floatIn, footRestraint } from './floating.mjs';
import { openCanopy } from '../ships.mjs';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// Physics scratch.
const _ve = new THREE.Vector3(), _vf = new THREE.Vector3();
const _vu = new THREE.Vector3(), _vd = new THREE.Vector3(), _vt = new THREE.Vector3();
// Where round the work a drone tries to hold, in turn: [yaw about the vertical, tilt up], radians.
const SWING = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [1, 0], [-1, 0], [0, 1], [1.5, 0], [-1.5, 0], [0.7, 0.7], [-0.7, 0.7], [0, 1.4]];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
// Looks scratch: never handed on.
const _vp = new THREE.Vector3(), _vn = new THREE.Vector3(), _vq = new THREE.Vector3(), _vs = new THREE.Vector3();
const _vm = new THREE.Matrix4(), _vQ = new THREE.Quaternion(), _vo = new THREE.Object3D();
const R = Math.random, rnd = (a, b) => a + (b - a) * R();
const BEAD_HOT = new THREE.Color('#ffd08a'), BEAD_WARM = new THREE.Color('#ff6a20'), BEAD_COLD = new THREE.Color('#5c5852');
const ARC = new THREE.Color('#bcd4ff'), _vc = new THREE.Color();
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** What each kind of work is called on the board and her damage page. */
const VERB = { tank: 'PLATING', jets: 'WELDING', radiator: 'WELDING', cockpit: 'FITTING', guns: 'FITTING', drive: 'FITTING' };

// --- a drone ---------------------------------------------------------------------------------------------------------

const DRONE = {
  shell: new THREE.MeshLambertMaterial({ color: '#c9cdd2', flatShading: true }),
  dark: new THREE.MeshLambertMaterial({ color: '#3a4048', flatShading: true }),
  hazard: new THREE.MeshLambertMaterial({ color: '#d8a530', flatShading: true }),
  eye: new THREE.MeshBasicMaterial({ color: '#7fe8ff', toneMapped: false }),
  lamp: new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false }),
  tip: new THREE.MeshBasicMaterial({ color: '#cfe0ff', toneMapped: false })
};
let DRONE_GEO = null;
/** A repair drone: a squat body with a jet pod on each corner, a stack of hull plates on its back, an eye at the front
 *  and a welding arm under it (its own group, `arm`, turned to the work; `tip` the torch). Three merged meshes and the
 *  arm. Faces -z. */
export function droneMesh() {
  if (!DRONE_GEO) {
    const B = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.BoxGeometry(w, h, d).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
    const C = (r, h, x, y, z, rx = 0, rz = 0, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg).rotateX(rx).rotateZ(rz).translate(x, y, z);
    const shell = [C(0.27, 0.2, 0, 0, 0, 0, 0, 8), B(0.36, 0.08, 0.36, 0, 0.13, 0.04)];
    const dark = [C(0.29, 0.05, 0, -0.06, 0, 0, 0, 8), B(0.1, 0.18, 0.14, 0, -0.09, -0.24)];
    const hazard = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      dark.push(B(0.26, 0.04, 0.05, sx * 0.24, 0, sz * 0.24, 0, (sx * sz * Math.PI) / 4)); // the arm out to the pod
      shell.push(B(0.12, 0.12, 0.12, sx * 0.37, 0, sz * 0.37));
      for (const [ax, ay, az] of [[sx, 0, 0], [0, 0, sz], [0, 1, 0], [0, -1, 0]]) dark.push(C(0.022, 0.05, sx * 0.37 + ax * 0.075, ay * 0.075, sz * 0.37 + az * 0.075, az ? Math.PI / 2 : 0, ax ? Math.PI / 2 : 0, 6));
      hazard.push(B(0.125, 0.025, 0.125, sx * 0.37, 0.05, sz * 0.37));
    }
    // The plates it carries, stacked and strapped on its back.
    for (let i = 0; i < 4; i++) shell.push(B(0.3, 0.012, 0.3, 0, 0.18 + i * 0.016, 0.04, 0, i * 0.07));
    hazard.push(B(0.04, 0.08, 0.32, 0, 0.2, 0.04));
    DRONE_GEO = { shell: mergeGeometries(shell), dark: mergeGeometries(dark), hazard: mergeGeometries(hazard) };
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(DRONE_GEO.shell, DRONE.shell), new THREE.Mesh(DRONE_GEO.dark, DRONE.dark), new THREE.Mesh(DRONE_GEO.hazard, DRONE.hazard));
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), DRONE.eye);
  eye.position.set(0, 0.02, -0.275);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), DRONE.lamp);
  lamp.position.set(0.12, 0.2, 0.18);
  g.add(eye, lamp);
  // The arm: a shoulder under the eye, a boom, the torch.
  const arm = new THREE.Group();
  arm.position.set(0, -0.12, -0.24);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 6).rotateX(Math.PI / 2).translate(0, 0, -0.21), DRONE.dark);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.08).translate(0, 0, -0.45), DRONE.hazard);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.06, 6).rotateX(Math.PI / 2).translate(0, 0, -0.52), DRONE.tip);
  arm.add(boom, head, tip);
  g.add(arm);
  g.userData.live = true;
  return { g, arm, lamp, eye };
}

/** A drone's rack: a frame on the wall with a cradle for each slot and a placard over it. */
function rackMesh(n, gap, into) {
  const g = new THREE.Group(), steel = new THREE.MeshLambertMaterial({ color: '#59606a', flatShading: true }), Y = DRONE.hazard;
  const len = (n - 1) * gap + 1.1;
  const parts = [];
  const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  parts.push(B(0.08, 1.3, len, 0, 0.1, 0), B(0.5, 0.06, len, 0.25, -0.33, 0), B(0.5, 0.06, len, 0.25, 0.55, 0));
  for (let i = 0; i < n; i++) {
    const z = -((n - 1) * gap) / 2 + i * gap;
    parts.push(B(0.42, 0.05, 0.05, 0.25, -0.3, z - 0.3), B(0.42, 0.05, 0.05, 0.25, -0.3, z + 0.3), B(0.05, 0.86, 0.05, 0.48, 0.12, z - 0.48));
  }
  g.add(new THREE.Mesh(mergeGeometries(parts), steel));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, len).translate(0.06, 0.66, 0), Y));
  g.rotation.y = Math.atan2(into.x, into.z) - Math.PI / 2; // its +x out of the wall
  return g;
}

// --- the bead of a weld on her skin ------------------------------------------------------------------------------------

/** Where grid point (u, v) (-0.5..0.5) of a decal's 7×7 grid lies, in the frame of the mesh it is on. */
function gridAt(d, u, v, out) {
  const P = d.mesh.geometry.attributes.position, N = 7;
  const fx = clamp((u + 0.5) * (N - 1), 0, N - 1.0001), fy = clamp((v + 0.5) * (N - 1), 0, N - 1.0001);
  const i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
  const k = (ii, jj) => (jj * N + ii) * 3;
  const arr = P.array;
  for (let c = 0; c < 3; c++) {
    const p00 = arr[k(i, j) + c], p10 = arr[k(i + 1, j) + c], p01 = arr[k(i, j + 1) + c], p11 = arr[k(i + 1, j + 1) + c];
    out.setComponent(c, (p00 * (1 - a) + p10 * a) * (1 - b) + (p01 * (1 - a) + p11 * a) * b);
  }
  return out;
}

/** The point `k` (0..1) of the way round a plate's seam: its square edge at ±`h` in the decal's grid. */
function seamUV(k, h) {
  const s = ((k % 1) + 1) % 1 * 4, e = Math.floor(s), f = s - e;
  return e === 0 ? [-h + 2 * h * f, -h] : e === 1 ? [h, -h + 2 * h * f] : e === 2 ? [h - 2 * h * f, h] : [-h, h - 2 * h * f];
}

const BEAD_N = 28;
/** The weld bead round plate decal `d`: short runs along its seam, laid as the weld goes (`laid`), each glowing and
 *  cooling (one instanced mesh, coloured per run). On the decal's own mesh, so it stays on her. */
function beadOn(d) {
  if (d.bead) return d.bead;
  const h = d.cell === 'platebig' ? 0.36 : 0.3;
  const scale = (d.world ?? d.size) / d.size; // world metres to the mesh's units
  const per = (8 * h * d.size) / BEAD_N; // a run's length, in the mesh's units
  const geo = new THREE.BoxGeometry(per * 1.15, 0.022 / scale, 0.012 / scale);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), BEAD_N);
  im.count = 0;
  im.frustumCulled = false;
  im.renderOrder = 2;
  im.userData.decal = true;
  const at = [];
  const nrm = new THREE.Vector3();
  gridAt(d, 0.12, 0, _vp);
  gridAt(d, -0.12, 0, _vq);
  const tu = _vs.subVectors(_vp, _vq).normalize().clone();
  gridAt(d, 0, 0.12, _vp);
  gridAt(d, 0, -0.12, _vq);
  const tv = new THREE.Vector3().subVectors(_vp, _vq).normalize();
  nrm.crossVectors(tu, tv).normalize();
  // Its outward side: the side the decal stands off the skin (her centre is behind it).
  for (let i = 0; i < BEAD_N; i++) {
    const [u0, v0] = seamUV(i / BEAD_N, h), [u1, v1] = seamUV((i + 1) / BEAD_N, h);
    const a = gridAt(d, u0, v0, new THREE.Vector3()), b = gridAt(d, u1, v1, new THREE.Vector3());
    const x = new THREE.Vector3().subVectors(b, a).normalize();
    const y = new THREE.Vector3().crossVectors(nrm, x).normalize();
    _vm.makeBasis(x, y, new THREE.Vector3().crossVectors(x, y));
    _vm.setPosition(a.add(b).multiplyScalar(0.5).addScaledVector(nrm, 0.004 / scale));
    im.setMatrixAt(i, _vm);
    im.setColorAt(i, BEAD_HOT);
    at.push(0);
  }
  d.mesh.add(im);
  d.bead = { im, h, laid: 0, at, nrm, scale, cold: false };
  return d.bead;
}

/** Lays bead `b` up to `k` (0..1) of the way round, at time `t`; and the runs cooling. */
function beadFrame(b, k, t) {
  const n = Math.min(BEAD_N, Math.ceil(k * BEAD_N - 1e-6));
  for (let i = b.laid; i < n; i++) b.at[i] = t;
  if (n > b.laid) (b.laid = n), (b.im.count = n), (b.cold = false);
  if (b.cold) return;
  let hot = false;
  const c = _vc;
  for (let i = 0; i < b.laid; i++) {
    const u = clamp((t - b.at[i]) / 25, 0, 1);
    if (u < 0.08) c.lerpColors(BEAD_HOT, BEAD_WARM, u / 0.08);
    else c.lerpColors(BEAD_WARM, BEAD_COLD, (u - 0.08) / 0.92);
    b.im.setColorAt(i, c);
    hot ||= u < 1;
  }
  if (b.im.instanceColor) b.im.instanceColor.needsUpdate = true;
  b.im.instanceMatrix.needsUpdate = true;
  if (!hot && b.laid >= BEAD_N) b.cold = true;
}

// --- the repairs -------------------------------------------------------------------------------------------------------

export class Repairs {
  /** `G` the game in hand (main.mjs): its `C`, `fighter`, `guns` (`fdmg`), `dc`, `sfx`; `crew` false leaves the deck
   *  crew ashore (?crew=0: the work and its timing go on without them). */
  constructor(G, { crew = true } = {}) {
    this.G = G;
    const C = (this.C = G.C);
    this.S = C.L.fighter.repair;
    this.room = [...C.rooms.values()].find((r) => r.system === 'hangar' && r.vacuum) ?? [...C.rooms.values()].find((r) => r.system === 'hangar');
    this.I = C.decks.get(this.room.deck);
    this.y0 = this.I.floorY;
    this.time = 0;
    this.jobs = new Map(); // pad index → job
    this.log = []; // what was done: { pad, part, by, t } (tests and the console)
    this.gangway();
    this.pads = C.L.fighters.map((f, i) => this.pad(f, i));
    this.drones = [];
    this.racks();
    this.crew = []; // the deck crew's people, for tickCrew (main.mjs)
    this.hands = this.S.crew.posts.map(([x, z], k) => ({ k, post: new THREE.Vector3(x, this.gy, z), at: new THREE.Vector3(x, this.gy, z), task: null, phase: 'idle', m: null, pad: null }));
    if (crew) this.hands.forEach((h, k) => this.board(h, k));
  }

  /** The gangway's shape (as sets/hangar.mjs builds it): what the drones keep clear of, and the crew's ways. */
  gangway() {
    const C = this.C, c = this.room, y = this.y0;
    const lock = C.L.doors.find((d) => d.between.includes(c.id) && d.between.some((id) => C.rooms.get(id)?.airlock));
    const gx = (this.gx = lock?.at ?? 0), HW = 0.8, SW = 0.5;
    this.gy = y + 0.35;
    const top = y + 2.6;
    this.spurs = C.L.fighters.map((f) => {
      const s = Math.sign(f.at[0] - gx) || 1, fx = f.at[0] + 1, b = C.boardAt ?? 4.6;
      return { s, z: f.at[1] - b, x0: gx + s * HW, x1: fx + s * 0.7, fx };
    });
    const za = c.z[0] + 0.15, zb = Math.max(...this.spurs.map((p) => p.z)) + 2.5;
    this.boxes = [{ x: [gx - HW, gx + HW], y: [y, top], z: [za, zb] }];
    for (const p of this.spurs) this.boxes.push({ x: [Math.min(p.x0, p.x1), Math.max(p.x0, p.x1) + 0.3], y: [y, top], z: [p.z - SW, p.z + SW] });
  }

  /** Pad `i`: its board, on a post at the end of her spur, facing the gangway. */
  pad(f, i) {
    const sp = this.spurs[i], B = this.S.board, y = this.y0;
    const cv = document.createElement('canvas');
    cv.width = 560;
    cv.height = 400;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    const g = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: '#59606a', flatShading: true });
    const cy = 2.05;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(B.w + 0.08, B.h + 0.08, 0.05).translate(0, cy, -0.03), steel));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, cy - B.h / 2, 0.07).translate(0, (cy - B.h / 2) / 2 + 0.35, -0.06), steel));
    face.position.set(0, cy, 0.0);
    g.add(face);
    const x = sp.x1 + sp.s * 0.3;
    g.position.set(x, y, sp.z);
    g.rotation.y = sp.s < 0 ? Math.PI / 2 : -Math.PI / 2; // facing back along the spur
    this.I.group.add(g);
    this.boxes.push({ x: [x - 0.15, x + 0.15], y: [y, y + cy + B.h / 2 + 0.05], z: [sp.z - B.w / 2, sp.z + B.w / 2] });
    const p = { i, f, sp, board: { cv, g: cv.getContext('2d'), tex, face, key: '', next: 0 } };
    return p;
  }

  /** The drones in their racks. */
  racks() {
    const D = this.S.drones;
    let id = 0;
    for (const r of D.racks) {
      const into = new THREE.Vector3(...r.into).normalize();
      const rack = rackMesh(r.n, D.gap, into);
      rack.position.set(r.at[0], this.y0 + r.at[1], r.at[2] + ((r.n - 1) * D.gap) / 2);
      this.I.group.add(rack);
      for (let k = 0; k < r.n; k++) {
        const home = new THREE.Vector3(r.at[0], this.y0 + r.at[1], r.at[2] + k * D.gap).addScaledVector(into, 0.3);
        const look = droneMesh();
        look.g.position.copy(home);
        look.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), into);
        this.I.group.add(look.g);
        this.drones.push({
          id: ++id, home, out: home.clone().addScaledVector(into, 1.4), into, pos: home.clone(), vel: new THREE.Vector3(),
          look, state: 'docked', path: [], task: null, lane: this.y0 + D.lane + (id % 3) * 0.7, acc: {}, weld: null, puff: 0
        });
      }
    }
  }

  /** A deck hand into their heavy suit at their post on the gangway, in a foot restraint (loaded in the background). */
  board(h, k) {
    const C = this.C;
    crewMember(C.L.stations.length + 11 + k, 'flight', { outfit: 'vac' }).then((m) => {
      m.root.position.copy(h.at).setY(this.gy);
      m.root.rotation.y = h.post.x <= 0 ? -Math.PI / 2 : Math.PI / 2;
      this.I.group.add(m.root);
      m.deck = this.room.deck;
      floatIn(m, this.room);
      m.route = null;
      footRestraint(m);
      m.play('lookAround');
      h.m = m;
      this.crew.push(m);
      if (h.task) this.walkTo(h, h.way); // already sent out while they were loading
    }, (e) => console.warn('repair crew could not come aboard', e));
  }

  // --- the jobs (seeded: no randoms) -----------------------------------------------------------------------------------

  /** Fighter on pad `i` is on her pad, and not the one out flying or coming in. */
  onPad(i) {
    const fi = this.G.fighter, obj = this.C.fighters[i];
    if (!obj) return false;
    if (fi.obj !== obj) return true;
    return fi.phase === 'seated';
  }

  /** A job for the damaged fighter on pad `i`: one task per damaged part, in `order`. */
  start(i) {
    const S = this.S, D = this.G.guns.fdmg, obj = this.C.fighters[i], st = D.of(obj);
    const order = (p) => S.order.indexOf(p.does) * 1000 - (1 - Math.max(0, p.hp) / p.max) * 100;
    const tasks = st.parts.filter((p) => p.hp < p.max - 1e-6 || p.holes.length).sort((a, b) => order(a) - order(b)).map((p) => {
      const lost = 1 - Math.max(0, p.hp) / p.max, holes = p.does === 'tank' ? p.holes.length : 0;
      const T = S.min + (S.per[p.does] ?? 40) * lost + S.hole * holes;
      return { part: p, kind: S.inside.includes(p.does) ? 'crew' : 'drone', T, left: T, hp0: Math.max(0, p.hp), holes: holes ? [...p.holes] : [], sealed: 0, phase: 'wait', worker: null, go: 0, patches: null, use: null, helped: 0 };
    });
    const job = { i, obj, st, tasks, t: 0, done: false };
    for (const t of tasks) t.job = job;
    this.jobs.set(i, job);
    for (const t of tasks) if (t.kind === 'drone') this.useFor(t);
    this.mark(job);
    this.G.dc?.say(null, `Pad ${i + 1}: the repair crew are out to her. ${tasks.length} ${tasks.length === 1 ? 'part' : 'parts'} to mend, about ${mmss(this.eta(job))}.`, 0, 6);
    return job;
  }

  /** Every frame (main.mjs, after the guns and her damage): new jobs, the drones and the crew, the work, your welding,
   *  what you see, the boards, and whether the fighter you are in may launch. */
  frame(dt, f, walker, mode) {
    this.time += dt;
    const D = this.G.guns.fdmg;
    if (!D) return;
    for (let i = 0; i < this.pads.length; i++) {
      if (this.jobs.has(i) || !this.onPad(i)) continue;
      const obj = this.C.fighters[i], st = obj.userData.dmg;
      if (st && !st.clean && !D.whole(st)) this.start(i);
      else if (st && !st.clean) D.mended(st, { glass: false });
    }
    this.assign();
    for (const d of this.drones) this.fly(d, dt);
    for (const h of this.hands) this.handFrame(h, dt);
    // Your welding: E held at a part a drone works (or will), with the welder and plates.
    const near = mode === 'walk' && walker?.interior === this.I ? walker.nearestUse() : null;
    const you = near?.repair && f?.keys.has('KeyE') && this.G.dc?.carry.has('patch') ? near.repair : null;
    for (const job of this.jobs.values()) {
      job.t += dt;
      for (const t of job.tasks) {
        if (t.phase === 'done') continue;
        const working = t.phase === 'work', helping = t === you;
        const rate = (working ? 1 : 0) + (helping ? this.S.help : 0);
        if (rate > 0) this.work(t, dt * rate);
        if (helping) t.helped += dt;
      }
      if (!job.done && job.tasks.every((t) => t.phase === 'done')) this.finish(job);
    }
    for (const [i, job] of this.jobs) if (job.done) this.jobs.delete(i);
    // The fighter you are in: held on her pad while she is being mended, and not refuelled while a tank leaks.
    const fi = this.G.fighter;
    const job = fi.obj ? this.jobs.get(fi.index) : null;
    fi.held = job && !job.done ? this.why(job) : null;
    fi.refuelHold = !!job && job.st.parts.some((p) => p.holes.length);
    this.looks(dt, you, mode);
  }

  /** Work done on task `t`: `w` seconds of it (more than `dt` when you help). The part mended as it goes, each tank
   *  hole sealed in its turn. */
  work(t, w) {
    const D = this.G.guns.fdmg, st = t.job.st, p = t.part;
    t.left = Math.max(0, t.left - w);
    const done = t.T - t.left;
    while (t.sealed < t.holes.length && done >= (t.sealed + 1) * this.S.hole - 1e-9) D.seal(st, p, t.holes[t.sealed++]);
    D.mend(st, p, t.hp0 + (p.max - t.hp0) * (done / t.T));
    if (t.left <= 0) {
      while (t.sealed < t.holes.length) D.seal(st, p, t.holes[t.sealed++]);
      D.mend(st, p, p.max, true);
      p.work = null;
      this.arcOff(t);
      if (p.does === 'cockpit') D.unglaze(st);
      // The deck crew back a hole from inside and plate it over: it shows as a plate, as the drones' do.
      if (t.kind === 'crew') for (const pt of this.patches(t)) if (pt.d) D.plate(pt.d);
      t.phase = 'done';
      this.log.push({ pad: t.job.i, part: p.id, by: t.kind, t: +this.time.toFixed(2), helped: +t.helped.toFixed(2) });
      if (t.use) this.I.interactables.splice(this.I.interactables.indexOf(t.use) >>> 0, 1), (t.use = null);
      const w = t.worker;
      t.worker = null;
      if (w) (w.task = null), this.next(w);
    }
  }

  /** All done: she is whole, her tanks topped up, and cleared. */
  finish(job) {
    const D = this.G.guns.fdmg, fi = this.G.fighter;
    job.done = true;
    D.mended(job.st, { glass: true });
    for (const d of job.st.decals) if (d.cell === 'hole' || d.cell === 'big') D.plate(d); // a hole no task reached
    const prop = job.obj.userData.prop, tank = this.C.L.fighter.flight.tank;
    if (prop) Object.assign(prop, tank);
    if (fi.obj === job.obj) fi.refuelT = 0;
    this.drawBoard(this.pads[job.i], true);
    this.G.dc?.say(null, `Pad ${job.i + 1}: repairs done, her tanks topped up. She is cleared for launch.`, 0, 6);
    this.G.sfx?.cue?.('clunk', { vol: 0.3 });
  }

  /** The time left on `job`, roughly: its drone work over the drones, its crew work over the crew, and the way out. */
  eta(job) {
    let dr = 0, cr = 0, nd = 0, nc = 0;
    for (const t of job.tasks) {
      if (t.phase === 'done') continue;
      const extra = t.phase === 'wait' ? 14 : t.phase === 'going' ? t.go : 0;
      if (t.kind === 'drone') (dr += t.left + extra), nd++;
      else (cr += t.left + extra), nc++;
    }
    return Math.max(nd ? dr / Math.min(nd, this.drones.length) : 0, nc ? cr / Math.min(nc, this.hands.length) : 0);
  }

  /** Why she may not launch, for the seat's prompt. */
  why(job) {
    const left = job.tasks.filter((t) => t.phase !== 'done');
    const leak = left.find((t) => t.holes.length > t.sealed);
    const what = leak ? `${leak.part.name.toLowerCase()} leaking` : `${left[0]?.part.name.toLowerCase() ?? 'checks'}`;
    return `${left.length} ${left.length === 1 ? 'job' : 'jobs'} left (${what}), about ${mmss(this.eta(job))}`;
  }

  /** Free drones and hands to the waiting jobs, first in order. */
  assign() {
    for (const job of this.jobs.values()) for (const t of job.tasks) {
      if (t.phase !== 'wait' || t.worker) continue;
      if (t.kind === 'drone') {
        const goal = this.standoff(t, _a);
        let best = null, bd = Infinity;
        for (const d of this.drones) {
          if (d.task || d.state === 'out') continue;
          const dd = d.pos.distanceTo(goal);
          if (dd < bd) (bd = dd), (best = d);
        }
        if (best) this.send(best, t);
      } else {
        const h = this.hands.find((x) => !x.task);
        if (h) this.sendHand(h, t);
      }
    }
  }

  /** What a free worker does next: the next waiting job of its kind, or home. */
  next(w) {
    this.assign();
    if (w.task) return;
    if (w.home) this.goHome(w);
    else this.handHome(w);
  }

  // --- the drones (seeded physics) -----------------------------------------------------------------------------------

  /** Where on her a drone works for task `t`, in her frame (`p`, `n`): a tank's first hole still open, else where
   *  the part was hit, else its middle. */
  spot(t, p, n) {
    const part = t.part, h = t.holes[t.sealed];
    if (h) p.copy(h.at), n.copy(h.out);
    else if (part.at) {
      p.copy(part.at);
      if (part.n) n.copy(part.n);
      else n.set(0, 1, 0);
    } else {
      const s = part.shapes[0], c = s.box ?? s.ball ?? [s.cyl[0], s.cyl[1], (s.cyl[2] + s.cyl[3]) / 2];
      nearest(s, new THREE.Vector3(c[0] + (Math.sign(c[0]) || 0), c[1] + 1, c[2]), p, n);
    }
    return onHer(t.job.obj, part, p, n);
  }

  /** The point a drone holds off the part for task `t`, in the hangar deck's frame: `standoff` out from it, swung
   *  round or closer in if the gangway, a board or a neighbour is there. It comes down onto it from its lane; when
   *  something overhangs the spot (a folded radiator), `via` is where it comes down beside it, to slide in under. */
  standoff(t, out, via = null) {
    const obj = t.job.obj, D = this.S.drones;
    obj.updateMatrix();
    const P = this.spot(t, _b, _c).applyMatrix4(obj.matrix);
    const N = _c.transformDirection(obj.matrix);
    // Not from under her: she sits on her gear, a hand's breadth off the deck. A belly part is worked from her side.
    if (N.y < -0.35) {
      N.y = 0;
      if (N.lengthSq() < 0.04) N.set(0, 0, Math.sign(P.z - obj.position.z) || -1);
      N.normalize();
    }
    // Straight out from the work first; then swung round it, then up over it, then closer in.
    const up = _vu.set(0, 1, 0);
    let side = null, best = null;
    for (const d of [D.standoff, D.standoff * 0.7, D.standoff * 0.45]) for (const [yaw, tilt] of SWING) {
      _vd.copy(N).applyAxisAngle(up, yaw);
      if (tilt && _vt.crossVectors(_vd, up).lengthSq() > 1e-4) _vd.applyAxisAngle(_vt.normalize(), tilt);
      if (_vd.y < -0.35) continue;
      out.copy(P).addScaledVector(_vd, d);
      if (!this.free(out)) continue;
      const lift = this.clearY(out) - out.y;
      if (lift <= 1e-6) return via?.set(NaN, 0, 0), out;
      // Overhung: is there a clear way down beside it, and across to it?
      if (!side) {
        _vt.set(_vd.x, 0, _vd.z);
        if (_vt.lengthSq() > 0.04) {
          _vt.normalize();
          for (let k = 0.4; k <= 2.4 && !side; k += 0.4) {
            const v = _ve.copy(out).addScaledVector(_vt, k);
            if (this.clearY(v) > v.y + 1e-6) continue;
            let ok = true;
            for (let s = 0.2; s < k && ok; s += 0.2) ok = this.free(_vf.copy(out).addScaledVector(_vt, s));
            if (ok) side = { at: out.clone(), via: v.clone() };
          }
        }
      }
      if (!best || lift < best.lift) best = { lift, v: out.clone() };
    }
    if (side) return via?.copy(side.via), out.copy(side.at);
    via?.set(NaN, 0, 0);
    if (!best) return out.copy(P).addScaledVector(N, D.standoff).setY(this.clearY(out));
    out.copy(best.v);
    out.y += best.lift;
    return out;
  }

  /** Whether a drone can be at `p` at all: clear of the deck, the gangway, the boards and the fighters. */
  free(p) {
    const r = this.S.drones.radius;
    if (p.y < this.y0 + 0.6) return false;
    for (const b of this.boxes) if (inBox(b, p, r)) return false;
    for (const b of this.fighterSolids()) if (inBox(b, p, r)) return false;
    return true;
  }

  /** The lowest a drone can hold at `p`'s x and z, coming straight down: above everything under the lane there (the
   *  gangway, the boards, the fighters), `radius` clear. */
  clearY(p) {
    const r = this.S.drones.radius;
    let y = Math.max(p.y, this.y0 + 0.6);
    const solid = [...this.boxes, ...this.fighterSolids()];
    for (let pass = 0; pass < 3; pass++) for (const b of solid) {
      if (p.x < b.x[0] - r || p.x > b.x[1] + r || p.z < b.z[0] - r || p.z > b.z[1] + r) continue;
      if (b.y[1] + r > y) y = b.y[1] + r;
    }
    return y;
  }

  /** What is solid of each fighter on her pad, in the deck's frame: her parts' shapes as boxes (the radiators and
   *  their jets folded up as she is parked), kept on her until she moves or folds. */
  fighterSolids() {
    const out = (this._fs ??= []);
    out.length = 0;
    const parts = this.C.L.fighter.damage.parts;
    for (const obj of this.C.fighters) {
      if (!obj?.parent || obj.parent !== this.I.group) continue;
      const u = obj.userData, key = `${obj.position.x},${obj.position.z},${obj.rotation.y},${u.folded ?? 0}`;
      if (u.repairKey !== key) {
        u.repairKey = key;
        obj.updateMatrix();
        u.repairSolids = [];
        for (const part of parts) for (const s of part.shapes) {
          const bb = shapeBox(s);
          if (isWing(part)) bb.applyMatrix4(foldMats(obj).ms[(s.box ?? s.cyl ?? s.ball)[0] < 0 ? 0 : 1] ?? _vm.identity());
          bb.applyMatrix4(obj.matrix);
          u.repairSolids.push({ x: [bb.min.x, bb.max.x], y: [bb.min.y, bb.max.y], z: [bb.min.z, bb.max.z] });
        }
      }
      out.push(...u.repairSolids);
    }
    return out;
  }

  /** Drone `d` out to task `t`: up out of its rack (or off the job it was on) to its lane, along it, and down. */
  send(d, t) {
    d.task = t;
    t.worker = d;
    t.phase = 'going';
    const via = new THREE.Vector3(), S = this.standoff(t, new THREE.Vector3(), via);
    t.at = S;
    const lane = d.lane;
    d.path = d.state === 'docked' ? [d.out.clone(), d.out.clone().setY(lane)] : this.outOf(d);
    d.via = Number.isNaN(via.x) ? null : via.clone();
    if (!d.via) d.path.push(S.clone().setY(lane), S);
    else d.path.push(via.clone().setY(lane), via, S);
    d.state = 'fly';
  }

  goHome(d) {
    const lane = d.lane;
    d.path = [...this.outOf(d), d.out.clone().setY(lane), d.out.clone(), d.home.clone()];
    d.via = null;
    d.state = 'home';
  }

  /** The way up to its lane from where drone `d` is: out sideways first if it came in under something. */
  outOf(d) {
    const p = d.via ? [d.via.clone()] : [];
    p.push((d.via ?? d.pos).clone().setY(Math.max(d.lane, d.pos.y)));
    return p;
  }

  /** One frame of drone `d`'s flight: a velocity it wants toward its next point on a braking profile, the push to get
   *  it capped at `accel`. It stops at each point of its way. */
  fly(d, dt) {
    const D = this.S.drones;
    if (d.state === 'docked') return;
    const goal = d.path[0] ?? (d.state === 'work' ? d.task?.at : null);
    if (!goal) return;
    const to = _a.subVectors(goal, d.pos), dist = to.length();
    const want = dist > 1e-4 ? to.multiplyScalar(Math.min(D.cruise, Math.sqrt(2 * D.accel * 0.7 * Math.max(0, dist - 0.01))) / dist) : to.set(0, 0, 0);
    const acc = _b.subVectors(want, d.vel).divideScalar(D.tau);
    if (acc.length() > D.accel) acc.setLength(D.accel);
    d.vel.addScaledVector(acc, dt);
    d.pos.addScaledVector(d.vel, dt);
    d.thrust = acc.length() / D.accel;
    d.push = d.push ?? new THREE.Vector3();
    d.push.copy(acc);
    if (d.path.length && dist < 0.06 && d.vel.length() < 0.12) {
      d.path.shift();
      if (!d.path.length) {
        if (d.state === 'fly') (d.state = 'work'), d.task && (d.task.phase = 'work');
        else if (d.state === 'home') (d.state = 'docked'), d.pos.copy(d.home), d.vel.set(0, 0, 0);
      }
    }
  }

  // --- the deck crew (their timing seeded: the way's length at `speed`) ---------------------------------------------

  /** Where a deck hand stands for task `t`: on a foot restraint by her flank on her spur's side, abreast of the part. */
  handSpot(t, out) {
    const obj = t.job.obj, sp = this.spurs[t.job.i], C = this.S.crew;
    obj.updateMatrix();
    const s = t.part.shapes[0], c = s.box ?? s.ball ?? [s.cyl[0], s.cyl[1], (s.cyl[2] + s.cyl[3]) / 2];
    const P = _b.set(c[0], c[1], c[2]).applyMatrix4(obj.matrix);
    const side = Math.sign(sp.z - obj.position.z) || -1;
    const edge = obj.position.z + side * 1.97; // her flank (her tanks' outsides)
    out.set(clamp(P.x, Math.min(sp.x0, sp.fx) - 4, Math.max(sp.x0, sp.fx) + 4), this.y0, edge + side * C.flank);
    // The cockpit is worked from her canopy's side, by the sill; the drive from behind her quarter.
    return out;
  }

  /** The way along the gangway from where hand `h` is to `to` (all at the grating's height but the last point). */
  way(h, to, sp) {
    const pts = [h.at.clone()];
    const from = h.pad != null ? this.spurs[h.pad] : null;
    if (from && from !== sp) pts.push(new THREE.Vector3(from.x1, this.gy, from.z), new THREE.Vector3(this.gx, this.gy, from.z));
    if (!from) pts.push(new THREE.Vector3(this.gx, this.gy, h.at.z));
    if (sp) {
      if (from !== sp) pts.push(new THREE.Vector3(this.gx, this.gy, sp.z));
      pts.push(new THREE.Vector3(sp.x1, this.gy, sp.z));
    } else if (from) pts.push(new THREE.Vector3(this.gx, this.gy, to.z));
    pts.push(to.clone());
    return pts.filter((p, k) => !k || p.distanceTo(pts[k - 1]) > 0.05);
  }

  sendHand(h, t) {
    const C = this.S.crew;
    const to = this.handSpot(t, new THREE.Vector3());
    const way = this.way(h, to, this.spurs[t.job.i]);
    let len = 0;
    for (let k = 1; k < way.length; k++) len += way[k].distanceTo(way[k - 1]);
    h.task = t;
    t.worker = h;
    t.phase = 'going';
    t.go = C.setup + len / C.speed;
    t.at = to;
    h.phase = 'going';
    h.way = way;
    h.at.copy(to);
    h.pad = t.job.i;
    if (h.m) this.walkTo(h, way);
  }

  handHome(h) {
    const way = this.way(h, h.post, null);
    h.phase = 'back';
    h.way = way;
    h.at.copy(h.post);
    h.pad = null;
    if (h.m) this.walkTo(h, way);
  }

  /** A deck hand's way, as their own weightless travel (floating.mjs `floatStep`): off their foot restraint and away. */
  walkTo(h, way) {
    const m = h.m;
    if (m.footPlate) m.footPlate.removeFromParent(), (m.footPlate = null);
    m.root.position.y = this.gy;
    m.route = way.map((p) => new THREE.Vector3(p.x, this.y0, p.z));
    m.route[0].copy(m.root.position).setY(this.y0);
    m.leg = 1;
    m.once = true;
    m.arrived = false;
    m.go = null;
    m.settle = 0;
    m.restPose = 'workTable';
    m.placed = false;
    m.play('walk');
  }

  handFrame(h, dt) {
    const t = h.task;
    if (t && t.phase === 'going' && (t.go -= dt) <= 0) (t.go = 0), (t.phase = 'work');
    const m = h.m;
    if (!m || !m.route) return;
    // Up off the grating over the last stretch to the foot restraint by her flank (or back down onto the gangway).
    const last = m.leg === m.route.length - 1;
    const wantY = last && h.phase !== 'back' ? this.y0 + this.S.crew.h : this.gy;
    if (!m.arrived) m.root.position.y += (wantY - m.root.position.y) * Math.min(1, dt * 1.5);
    if (m.arrived && !m.placed) {
      m.placed = true;
      const back = h.phase === 'back' || !h.task;
      m.root.position.y = back ? this.gy : this.y0;
      footRestraint(m, back ? 0.38 : this.S.crew.h);
      if (back) m.root.rotation.y = h.post.x <= 0 ? -Math.PI / 2 : Math.PI / 2, m.play('lookAround'), (h.phase = 'idle');
      else {
        const obj = this.C.fighters[h.pad];
        if (obj) m.root.rotation.y = Math.atan2(-(obj.position.x - m.root.position.x) * 0.2, -(obj.position.z - m.root.position.z));
        m.play('workTable');
      }
    }
  }

  // --- your welding ------------------------------------------------------------------------------------------------------

  /** A use on the part for drone task `t`: E there (hold it) welds with the drone, with the welder and plates. */
  useFor(t) {
    const dc = this.G.dc, name = t.part.name.toLowerCase();
    const u = this.I.use(`repair-${t.job.i}-${t.part.id}`, `Hold E: weld her ${name}`, 0, 0, () => {
      if (!dc?.carry.has('patch')) dc?.say(null, `You need ${dc.D.kits.patch.name} to weld her. ${dc.whereKit('patch')}`);
    }, { r: this.S.reach, y: 0 });
    u.repair = t;
    u.key = 'E';
    u.hidden = () => t.phase === 'done' || this.G.mode?.() !== 'walk';
    t.use = u;
    this.placeUse(t);
  }

  /** The use where the work on task `t` is now: on her skin, in the deck's frame. */
  placeUse(t) {
    const u = t.use, obj = t.job.obj;
    if (!u) return;
    const w = t.weldAt ?? this.spot(t, _vp, _vn);
    obj.updateMatrix();
    u.pos.copy(w).applyMatrix4(obj.matrix);
    const pct = Math.round((1 - t.left / t.T) * 100), name = t.part.name.toLowerCase();
    const kit = this.G.dc?.carry.has('patch');
    u.label = !kit ? `E: her ${name} needs welding (you need the welder and plates)` : t.helped > 0 ? `Welding her ${name}: ${pct}%` : t.holes.length > t.sealed ? `Hold E: plate the hole in her ${name}` : `Hold E: weld her ${name} with the drone`;
  }

  // --- what you see (Math.random) ---------------------------------------------------------------------------------------

  looks(dt, you, mode) {
    const vis = this.I.group.visible;
    for (const d of this.drones) this.droneLook(d, dt, vis);
    for (const job of this.jobs.values()) {
      for (const t of job.tasks) {
        if (t.phase === 'done') continue;
        if (t.kind === 'drone') this.weldLook(t, dt, vis, t === you);
        else this.crewLook(t, dt, vis);
        if (t.use) this.placeUse(t);
      }
      // A tank hole not yet sealed still vents a little gas on the pad.
      const B = vis ? this.C.blazes?.in(job.obj) : null;
      if (B) for (const p of job.st.parts) for (const h of p.holes) {
        if (R() > dt * 12) continue;
        _vs.copy(h.out).multiplyScalar(rnd(1.5, 4)).add(_vq.set(rnd(-0.4, 0.4), rnd(-0.4, 0.4), rnd(-0.4, 0.4)));
        B.emit('vapour', _vp.copy(h.at).addScaledVector(h.out, 0.04), _vs, { life: rnd(0.6, 1.2), s0: 0.05, s1: rnd(0.25, 0.5), heat: 1, k: 0.25, fade: 1.6 });
      }
      for (const p of job.st.parts) {
        const t = job.tasks.find((x) => x.part === p && x.phase !== 'done');
        p.work = !t ? null : t.phase === 'wait' ? 'WAIT' : t.phase === 'going' ? (t.kind === 'crew' ? 'CREW' : 'DRONE') : VERB[p.does] === 'FITTING' ? 'CREW' : 'WELD';
      }
    }
    // The beads cooling on every fighter's plates, and the boards.
    for (const obj of this.C.fighters) for (const dd of obj?.userData.dmg?.decals ?? []) if (dd.bead && !dd.bead.cold) beadFrame(dd.bead, dd.bead.laid / BEAD_N, this.time);
    for (const p of this.pads) if ((p.board.next -= dt) <= 0) (p.board.next = 0.5), vis && this.drawBoard(p);
  }

  droneLook(d, dt, vis) {
    const g = d.look.g;
    g.position.copy(d.pos);
    if (d.state === 'docked') {
      d.look.lamp.visible = false;
      return;
    }
    d.look.lamp.visible = this.time % 1 < 0.5;
    // Facing: the way it flies, then the work.
    const t = d.task, work = d.state === 'work' && t ? t.weldWorld : null;
    const face = work ? _vq.subVectors(work, d.pos) : d.vel.lengthSq() > 0.04 ? _vq.copy(d.vel) : null;
    if (face) {
      face.y *= 0.35;
      if (face.lengthSq() > 1e-4) {
        _vQ.setFromUnitVectors(_vn.set(0, 0, -1), face.normalize());
        g.quaternion.slerp(_vQ, Math.min(1, dt * 2));
      }
    }
    // The arm to the work, folded back in flight.
    const arm = d.look.arm;
    if (work) {
      g.updateMatrixWorld(true);
      _vp.copy(work).applyMatrix4(this.I.group.matrixWorld);
      arm.lookAt(_vp);
      arm.rotateY(Math.PI); // lookAt points +z at it; the arm reaches along -z
      // The boom runs out to it (it telescopes).
      arm.scale.z = clamp(arm.getWorldPosition(_vq).distanceTo(_vp) / 0.54, 0.5, 4);
    } else arm.rotation.set(-1.2, 0, 0), (arm.scale.z += (0.6 - arm.scale.z) * Math.min(1, dt * 2));
    // Cold gas puffs off the pods as it pushes (looks only).
    if (!vis || !(d.thrust > 0.15)) return;
    const B = this.C.blazes?.in(this.I.group);
    if (!B || R() > dt * 14 * d.thrust) return;
    _vs.copy(d.push).normalize().multiplyScalar(-rnd(1.5, 3));
    const sx = R() < 0.5 ? -1 : 1, sz = R() < 0.5 ? -1 : 1;
    _vp.set(sx * 0.37, 0, sz * 0.37).applyQuaternion(g.quaternion).add(d.pos);
    B.emit('vapour', _vp, _vs.add(d.vel), { life: rnd(0.3, 0.6), s0: 0.03, s1: rnd(0.12, 0.22), heat: 1, k: 0.3, fade: 2 });
  }

  /** The drone (and you) at work on task `t`: each hole in turn gets a plate, welded round, then the weld wanders
   *  over the rest of the part. The arc lights the hangar blue. */
  weldLook(t, dt, vis, you) {
    const obj = t.job.obj, D = this.G.guns.fdmg;
    const at = t.phase === 'work' || you;
    t.patches ??= this.patches(t);
    const k = 1 - t.left / t.T;
    let w = null, n = null;
    // Which plate the work is on: a tank's holes by the holes sealed, the rest by how far it has got.
    const span = t.patches.length ? Math.min(0.8, (t.patches.length * this.S.hole) / t.T) : 0;
    const pi = t.patches.length ? Math.min(t.patches.length - 1, Math.floor((k / Math.max(span, 1e-6)) * t.patches.length)) : -1;
    if (at && pi >= 0 && k < span + 1e-6) {
      const pt = t.patches[pi];
      for (let j = 0; j < pi; j++) this.patchDone(t.patches[j]);
      if (!pt.d && !pt.tried) (pt.tried = true), (pt.d = D.platedAt(obj, pt.at, pt.n, 0.55));
      if (pt.d) {
        D.plate(pt.d);
        const b = beadOn(pt.d), kk = clamp((k / span) * t.patches.length - pi, 0, 1);
        beadFrame(b, kk, this.time);
        const [u, v] = seamUV(kk, b.h);
        w = gridAt(pt.d, u, v, _vp).addScaledVector(b.nrm, 0.01 / b.scale);
        pt.d.on.updateWorldMatrix(true, false);
        w.applyMatrix4(pt.d.on.matrixWorld);
        obj.worldToLocal(w);
        n = _vn.copy(pt.d.n);
        if (isWing(t.part)) onHer(obj, t.part, _vs.copy(pt.d.at), n); // the decal's normal as she flew
      } else (w = onHer(obj, t.part, _vp.copy(pt.at), (n = _vn.copy(pt.n))));
    } else if (at) {
      for (const pt of t.patches) this.patchDone(pt);
      // Over the rest of the part: the weld moves on every second or two.
      if (!t.roam || (t.roamT -= dt) <= 0) {
        t.roamT = rnd(1.2, 2.4);
        const s = t.part.shapes[Math.floor(R() * t.part.shapes.length)];
        const base = this.spot(t, _vq, _vs);
        const q = _vq.copy(base).add(_vs.set(rnd(-0.6, 0.6), rnd(-0.3, 0.3), rnd(-0.6, 0.6)));
        t.roam = { p: new THREE.Vector3(), n: new THREE.Vector3() };
        if (isWing(t.part)) unfold(obj, q); // her parts' shapes are as she flies: the roam is on the panel as it is now
        nearest(s, q, t.roam.p, t.roam.n);
        onHer(obj, t.part, t.roam.p, t.roam.n);
      }
      w = _vp.copy(t.roam.p);
      n = _vn.copy(t.roam.n);
    }
    if (!w) {
      t.weldWorld = null;
      this.arcOff(t);
      return;
    }
    t.weldAt = (t.weldAt ??= new THREE.Vector3()).copy(w);
    obj.updateMatrix();
    t.weldWorld = (t.weldWorld ??= new THREE.Vector3()).copy(w).applyMatrix4(obj.matrix);
    if (!vis) return this.arcOff(t);
    // A drone welds in bursts, a few seconds on and a breath off while it moves the torch; you weld while you hold E.
    if (!you && (t.burst = (t.burst ?? rnd(0, 3)) - dt) <= 0) (t.lit = !t.lit), (t.burst = t.lit ? rnd(1.8, 4) : rnd(0.5, 1.4));
    if (!you && !t.lit) return this.arcOff(t);
    const B = this.C.blazes?.in(obj);
    if (B) weldTick(B, w, n, dt, false, (t.acc ??= {}));
    this.arc(t, _vq.copy(w).addScaledVector(n, 0.4).applyMatrix4(obj.matrix), you ? 1 : 0.45);
  }

  /** A plate's weld finished (all its bead laid). */
  patchDone(pt) {
    if (!pt.d) return;
    this.G.guns.fdmg.plate(pt.d);
    const b = beadOn(pt.d);
    if (b.laid < BEAD_N) beadFrame(b, 1, this.time);
  }

  /** The holes a drone plates for task `t`: a tank's holes (each over the hole drawn there, or a plate laid where it
   *  is), or the holes drawn on the part. */
  patches(t) {
    const st = t.job.st, D = this.G.guns.fdmg;
    const isHole = (d) => d.cell === 'hole' || d.cell === 'big';
    const partOf = (at) => {
      let best = null, bd = Infinity;
      for (const p of st.parts) for (const s of p.shapes) {
        const dd = nearest(s, at, _vq, _vs);
        if (dd < bd) (bd = dd), (best = p);
      }
      return best;
    };
    if (t.holes.length) return t.holes.map((h) => {
      const d = st.decals.filter(isHole).sort((a, b) => a.at.distanceTo(h.at) - b.at.distanceTo(h.at))[0];
      return d && d.at.distanceTo(h.at) < 0.7 ? { d, at: d.at, n: d.n } : { d: null, at: h.at, n: h.out };
    });
    return st.decals.filter((d) => isHole(d) && partOf(d.at) === t.part).map((d) => ({ d, at: d.at, n: d.n }));
  }

  /** The deck crew at work on task `t`: the canopy up for the cockpit (a parked fighter), now and then a spit of
   *  sparks from inside her frame. */
  crewLook(t, dt, vis) {
    if (t.phase !== 'work') return;
    const obj = t.job.obj, fi = this.G.fighter;
    if (t.part.does === 'cockpit' && fi.obj !== obj) openCanopy(obj, Math.min(1, (t.canopy = (t.canopy ?? 0.3) + dt / 1.5)));
    const B = vis ? this.C.blazes?.in(obj) : null;
    if (!B) return;
    const s = t.part.shapes[0];
    nearest(s, _vq.set((R() - 0.5) * 2, 1.5, (R() - 0.5) * 3), _vp, _vn);
    zapTick(B, _vp, _vn, dt * 0.5, false);
  }

  /** The arc's light for task `t` at `p` (deck frame), flickering. */
  arc(t, p, k = 1) {
    if (!t.arc) {
      const anchor = new THREE.Object3D();
      this.I.group.add(anchor);
      t.arc = { anchor, color: ARC.clone(), intensity: 0, distance: 6, decay: 1.6, room: this.room.id };
      this.I.lights.push(t.arc);
    }
    t.arc.anchor.position.copy(p);
    t.arc.intensity = 18 * k * (0.5 + R());
  }

  arcOff(t) {
    if (!t.arc) return;
    const i = this.I.lights.indexOf(t.arc);
    if (i >= 0) this.I.lights.splice(i, 1);
    t.arc.anchor.removeFromParent();
    t.arc = null;
  }

  /** Each part's state on her damage page while she is under repair. */
  mark(job) {
    for (const t of job.tasks) t.part.work = 'WAIT';
  }

  // --- the pad's board ------------------------------------------------------------------------------------------------

  /** Pad `p`'s board: her parts, each one's health and what is being done to it, and the time left; or cleared. Drawn
   *  again only when what it says changes. */
  drawBoard(p, force = false) {
    const obj = this.C.fighters[p.i], st = obj?.userData.dmg, job = this.jobs.get(p.i);
    const D = this.G.guns.fdmg;
    const rows = (st?.parts ?? (this._fresh ??= D.fresh().parts)).map((part) => {
      const t = job?.tasks.find((x) => x.part === part);
      const k = Math.max(0, part.hp) / part.max;
      let what = 'OK', left = '';
      if (t && t.phase !== 'done') {
        const who = t.worker ? (t.kind === 'drone' ? `DRONE ${t.worker.id}` : `CREW ${t.worker.k + 1}`) : '';
        what = t.phase === 'wait' ? 'WAITING' : t.phase === 'going' ? `${who} ON THE WAY` : t.holes.length > t.sealed ? `${who} PLATING ${t.sealed + 1}/${t.holes.length}` : `${who} ${VERB[part.does]}`;
        left = mmss(t.left + (t.phase === 'going' ? t.go : 0));
      } else if (t) what = 'DONE';
      return { short: part.short, k, what, left, band: band(k), live: !!t && t.phase === 'work' };
    });
    const state = job && !job.done ? 'repair' : obj && this.G.fighter.obj === obj && this.G.fighter.flying ? 'out' : 'ready';
    const eta = job && !job.done ? mmss(this.eta(job)) : '';
    const key = JSON.stringify([state, eta, rows.map((r) => [r.what, r.left, Math.round(r.k * 50)])]);
    if (!force && key === p.board.key) return;
    p.board.key = key;
    const g = p.board.g, W = p.board.cv.width, H = p.board.cv.height;
    g.fillStyle = '#0a0e12';
    g.fillRect(0, 0, W, H);
    const tone = state === 'repair' ? '#ffb347' : state === 'out' ? '#7fb8ff' : '#5fd88a';
    g.strokeStyle = tone;
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = tone;
    g.font = 'bold 34px monospace';
    g.textBaseline = 'top';
    g.fillText(`PAD ${p.i + 1}`, 18, 14);
    g.font = 'bold 24px monospace';
    g.textAlign = 'right';
    g.fillText(state === 'repair' ? `UNDER REPAIR  ${eta}` : state === 'out' ? 'FIGHTER OUT' : 'READY', W - 18, 20);
    g.textAlign = 'left';
    g.fillRect(18, 56, W - 36, 2);
    g.font = '17px monospace';
    rows.forEach((r, k) => {
      const y = 66 + k * 25.5;
      const col = r.band === 'ok' ? '#5fd88a' : r.band === 'scuffed' ? '#b8d860' : r.band === 'hit' ? '#ffd040' : r.band === 'bad' ? '#ff8a30' : '#ff4040';
      g.fillStyle = '#9aa8b4';
      g.fillText(r.short, 18, y + 2);
      g.fillStyle = '#1e262e';
      g.fillRect(100, y + 4, 110, 14);
      g.fillStyle = col;
      g.fillRect(100, y + 4, 110 * r.k, 14);
      g.fillStyle = r.what === 'OK' || r.what === 'DONE' ? '#5f7080' : r.live ? '#ffd890' : '#c8d0d8';
      g.fillText(r.what.slice(0, 24), 222, y + 2);
      g.textAlign = 'right';
      g.fillStyle = '#c8d0d8';
      g.fillText(r.left, W - 18, y + 2);
      g.textAlign = 'left';
    });
    g.fillStyle = tone;
    g.font = 'bold 20px monospace';
    g.fillText(state === 'repair' ? 'NO LAUNCH UNTIL CLEARED' : state === 'out' ? '' : 'CLEARED FOR LAUNCH', 18, H - 34);
    p.board.tex.needsUpdate = true;
  }

  /** The console: `__carrier.repairs.info()`. */
  info() {
    return {
      jobs: [...this.jobs.values()].map((j) => ({ pad: j.i + 1, eta: Math.round(this.eta(j)), tasks: j.tasks.map((t) => `${t.part.id}:${t.kind}:${t.phase}:${t.left.toFixed(1)}/${t.T.toFixed(1)}`) })),
      drones: this.drones.map((d) => `${d.id}:${d.state}${d.task ? `@${d.task.job.i + 1}/${d.task.part.id}` : ''}`),
      crew: this.hands.map((h) => `${h.k + 1}:${h.phase}${h.task ? `@${h.task.job.i + 1}/${h.task.part.id}` : ''}${h.m ? '' : ' (not aboard)'}`),
      log: this.log
    };
  }
}

/** Her radiators and the wingtip jets on them fold up over her on the pad (ships.mjs `foldWings`). */
function inBox(b, p, r) {
  return p.x > b.x[0] - r && p.x < b.x[1] + r && p.y > b.y[0] - r && p.y < b.y[1] + r && p.z > b.z[0] - r && p.z < b.z[1] + r;
}

const isWing = (part) => part.does === 'radiator' || (part.does === 'jets' && part.block >= 2);

/** For each radiator (port, starboard), the matrix in her frame that takes a point of it as she flies (spread) to
 *  where it is now. Kept on her while she stays folded the same. */
function foldMats(obj) {
  const u = obj.userData, k = u.folded ?? 0;
  if (u.foldMats?.k === k) return u.foldMats;
  obj.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const ms = (u.wingFolds ?? []).map((pv) => {
    if (!pv) return new THREE.Matrix4();
    const now = new THREE.Matrix4().multiplyMatrices(inv, pv.matrixWorld);
    const rz = pv.rotation.z;
    pv.rotation.z = 0;
    pv.updateMatrixWorld(true);
    const spread = new THREE.Matrix4().multiplyMatrices(inv, pv.matrixWorld);
    pv.rotation.z = rz;
    pv.updateMatrixWorld(true);
    return now.multiply(spread.invert());
  });
  return (u.foldMats = { k, ms, inv: ms.map((m) => m.clone().invert()) });
}

/** Point `p` and normal `n` on `part`, given as she flies (her frame), as they are on her now: on a folded radiator,
 *  folded with it, and the normal its outer face's (a hole through a thin panel is welded from outside). */
function onHer(obj, part, p, n) {
  if (!isWing(part)) return p;
  const F = foldMats(obj), m = F.ms[p.x < 0 ? 0 : 1];
  if (!m) return p;
  p.applyMatrix4(m);
  n.transformDirection(m);
  if (n.x * (Math.sign(p.x) || 1) < 0) n.negate();
  return p;
}

/** The other way: a point on a folded panel as it is now, back to where it is as she flies. */
function unfold(obj, p) {
  const F = foldMats(obj), m = F.inv[p.x < 0 ? 0 : 1];
  if (m) p.applyMatrix4(m);
  return p;
}

/** A part's shape as a box in her frame. */
function shapeBox(s) {
  if (s.box) {
    const [x, y, z, hx, hy, hz] = s.box;
    return new THREE.Box3(new THREE.Vector3(x - hx, y - hy, z - hz), new THREE.Vector3(x + hx, y + hy, z + hz));
  }
  if (s.ball) {
    const [x, y, z, r] = s.ball;
    return new THREE.Box3(new THREE.Vector3(x - r, y - r, z - r), new THREE.Vector3(x + r, y + r, z + r));
  }
  const [x, y, z0, z1, r] = s.cyl;
  return new THREE.Box3(new THREE.Vector3(x - r, y - r, z0), new THREE.Vector3(x + r, y + r, z1));
}
