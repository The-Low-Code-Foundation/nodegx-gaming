// The approach lane: how you fly a fighter back aboard yourself. A line of rings runs straight out from the bay, in the
// carrier's frame (so they move and turn with her), on the line through your own pad. Fly out to the far ring, turn in,
// and come down the lane slowing as you go: each ring wants a speed, and the next one ahead of you is green when you
// are on it, amber when you are fast or off the line, red when you are much too fast. Through the last ring slowly and
// on the line, and flight control catches you and sets you on your pad (`Fighter.capture`).
//
// Everything is in the layout's `fighter.landing`: `gate` (x and y off the bay where the lane ends), `lane` (how far out
// it runs), `ring` (their radius) and `catch` (how close and how slow flight control will take you).
//
// `state` each frame: along (metres out from the gate along the lane), side and up (metres off the line), closing (m/s
// toward the bay, along the lane), want (the speed wanted here), inLane, nose (how straight in she points, 1 dead on),
// and `call`: what the HUD says ('lane' fly to it, 'line' line up, 'slow', 'fast' much too fast, 'good', 'catch').

import * as THREE from 'three';
import { clamp } from '../util.mjs';

const STEP = 40; // metres between rings
export const COLOR = { idle: '#4fd0e0', good: '#40ff80', line: '#ffb030', slow: '#ffb030', fast: '#ff4030', lane: '#4fd0e0' };
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _n = new THREE.Vector3();

/** A gate's light: additive, never tone mapped, left whole by the cutaway. One per gate, so each takes its own call.
 *  (recovery.mjs, the lane for a ship that berths sideways, draws its gates with it too.) */
export function laneMat() {
  const m = new THREE.MeshBasicMaterial({ color: COLOR.idle, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  m.userData.uncut = true; // the cutaway's planes leave it whole
  return m;
}

/** Lights a lane's `gates` (each with `userData.along` and `userData.mat`, the far one last) for a craft `along`
 *  metres out: the next gate ahead of her carries the call's colour (`tone`, a hex colour); the ones she has passed
 *  fade; off the lane (`inLane` false) they are all idle and the far one pulses. */
export function lightLane(gates, along, inLane, tone) {
  let next = null;
  for (const r of gates) if (r.userData.along < along - 2 && (!next || r.userData.along > next.userData.along)) next = r;
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 180);
  for (const r of gates) {
    const m = r.userData.mat;
    if (!inLane) {
      m.color.set(COLOR.idle);
      m.opacity = r === gates[gates.length - 1] ? 0.4 + 0.5 * pulse : 0.35;
    } else if (r === next) {
      m.color.set(tone);
      m.opacity = 0.95;
    } else {
      m.color.set(COLOR.idle);
      m.opacity = r.userData.along > along ? 0.12 : 0.4;
    }
  }
  return next;
}

/** The speed the lane wants `along` metres out: 4 m/s at the gate, rising to 40 m/s 400 m out. */
export const wantAt = (along) => clamp(4 + along * 0.09, 4, 40);

export class Approach {
  constructor(C) {
    this.C = C;
    this.S = C.L.fighter.landing;
    this.len = this.S.lane ?? 400;
    this.group = new THREE.Group();
    this.group.name = 'approach-lane';
    this.group.visible = false;
    this.rings = [];
    const R = this.S.ring ?? 7;
    for (let a = 0; a <= this.len + 0.1; a += STEP) {
      const m = laneMat();
      const ring = new THREE.Group();
      // A ring of eight light bars, not a solid hoop: it reads as lights at a distance and does not hide the bay.
      for (let k = 0; k < 8; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.35, R * 0.55, 0.35), m);
        const t = (k / 8) * Math.PI * 2;
        bar.position.set(0, Math.sin(t) * R, Math.cos(t) * R);
        bar.rotation.x = -t;
        ring.add(bar);
      }
      ring.userData = { along: a, mat: m };
      this.group.add(ring);
      this.rings.push(ring);
    }
    C.frame.add(this.group);
    this.padZ = 0;
    this.state = { along: Infinity, side: 0, up: 0, closing: 0, want: 0, inLane: false, nose: 0, call: 'lane' };
  }

  /** Puts the lane on the line through pad `z` (the fighter you are in), on her side `out` (-1 port, +1 starboard). */
  setPad(z, out = -1) {
    this.padZ = z;
    this.out = out;
    const [gx, gy] = this.S.gate;
    for (const r of this.rings) r.position.set(out * (Math.abs(gx) + r.userData.along), gy, z);
  }

  /** A point on the lane's centre line, `along` metres out, in the world. */
  pointAt(along, t = new THREE.Vector3()) {
    const [gx, gy] = this.S.gate;
    return this.C.frame.localToWorld(t.set((this.out ?? -1) * (Math.abs(gx) + along), gy, this.padZ));
  }

  /** Works out where `fighter` is on the lane; `show` lights the rings. `carrier` is the carrier's Rigid. */
  frame(dt, fighter, carrier, show) {
    this.group.visible = show;
    const s = this.state;
    if (!fighter.obj) return s;
    const [gx, gy] = this.S.gate;
    const frame = this.C.frame;
    frame.updateWorldMatrix(true, false);
    const p = frame.worldToLocal(fighter.obj.getWorldPosition(_v));
    const o = this.out ?? -1;
    s.along = p.x * o - Math.abs(gx); // metres out from the gate, on her side
    s.side = p.z - this.padZ;
    s.up = p.y - gy;
    // Her velocity relative to the carrier, in the carrier's frame: -out is inbound.
    const cq = frame.getWorldQuaternion(_q);
    const rel = _n.copy(fighter.body.vel).sub(carrier.vel).applyQuaternion(cq.clone().invert());
    s.closing = -o * rel.x;
    s.want = wantAt(Math.max(0, s.along));
    const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(fighter.obj.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(cq.invert());
    s.nose = -o * nose.x;
    const off = Math.hypot(s.side, s.up);
    s.inLane = s.along > -10 && s.along < this.len + 30 && off < 25 + s.along * 0.08 && s.nose > 0.2; // and pointed in, not leaving
    const K = this.S.catch;
    if (!s.inLane) s.call = 'lane';
    else if (s.along < K.along && Math.abs(s.side) < K.off[0] && Math.abs(s.up) < K.off[1] && s.closing > -1 && s.closing < K.speed && s.nose > 0.8) s.call = 'catch';
    else if (Math.abs(s.side) > 4 + s.along * 0.02 || Math.abs(s.up) > 4 + s.along * 0.02) s.call = 'line';
    else if (s.closing > s.want * 1.8 + 4) s.call = 'fast';
    else if (s.closing > s.want * 1.25 + 2) s.call = 'slow';
    else s.call = 'good';
    if (!show) return s;
    // The next ring ahead of her carries the call; the ones she has passed fade; the far one pulses when she is off the lane.
    lightLane(this.rings, s.along, s.inLane, COLOR[s.call] ?? COLOR.good);
    return s;
  }
}
