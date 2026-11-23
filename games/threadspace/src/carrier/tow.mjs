// Flight control's tug for a carried ship: what brings the cutter in when she is handed to flight control (L in the
// lane or out of it, `berth.takeIn()`, the crew pilot's hand-over after two wave-offs), in place of her simply being
// moved onto her cradle (design/ROADMAP.md, "the new course"; the player: "no more magically floating ship").
//
// The tug is one of the host's own, parked on its stand in her hangar (rescue-craft.mjs `parkCraft`, the host's
// `craft`), and this is rescue.mjs's flying (`Tow` extends `Rescue`: the legs in the hangar, `steer`, the braking
// profile, `detour` round her hull) with the host as the carrier and the ship you are aboard as what it goes out to.
//
//   launch    off its stand on her berth's side (the other side's if that one is out), along the hangar to the door,
//             nose out, out through it. She holds where she is meanwhile (berth phase `tug`, hands off).
//   out       Newtonian to a point `near` metres off her outboard flank (her port side: her docking port, to starboard,
//             faces the gangway in either berth), then
//   dock      in on its jets, nose to her, to its station: its push plate `TOW.gap` off her skin at her centre of mass.
//   coupled   the clamp's arms on her flank, the plate against her (`couple()`, then `berth.towed()`): flight control's
//             path brings her in with the tug fast to her, its drive lit by her acceleration toward her and its quads
//             puffing for the rest, until she reaches the cradle's arms off the door (`berth.offU`), where it lets go.
//   clear     back off her flank `TOW.clear` metres on its jets, still facing her, then
//   home      to the gate off its own stretch of door, in stern first, and back onto its stand (rescue.mjs).
//
// While it is out, or on its way in, the berth keeps the door open (`outside`). Says `tow` on the bus ({ state }).
// Looks only: what she does is the berth's; nothing here uses a seeded random number.

import * as THREE from 'three';
import { clamp } from '../util.mjs';
import { Rescue, lineMesh, stretch } from './rescue.mjs';
import { craftBounds, craftThrust } from './rescue-craft.mjs';

/** `gap`: metres between the tug's push plate and her skin, bridged by the clamp's arms. `ease`: seconds the clamp
 *  takes to draw it onto its station from where it made fast. `clear`: metres it backs off after letting go. `drive`,
 *  `jets`: her acceleration (m/s²) toward her, and across, that lights its drive or puffs its quads full; `idle` the
 *  drive's glow while it holds her. */
export const TOW = { gap: 1.2, ease: 1.5, clear: 18, drive: 0.4, jets: 0.4, idle: 0.1 };

const UP = new THREE.Vector3(0, 1, 0);
const _tp = new THREE.Vector3(), _tv = new THREE.Vector3(), _det = new THREE.Vector3(), _fq = new THREE.Quaternion();
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4();
const _p = new THREE.Vector3(), _r = new THREE.Vector3();
const ARMS = [-1, 1].map((s) => new THREE.Vector3(s * 1.72, -0.6, -8.35)); // the clamp arms' ends (rescue-craft.mjs)

export class Tow extends Rescue {
  /** `G` the cutter's page (main.mjs); `H` her host, `berth` her Berth, `doors` the host's bay doors, `scene` the
   *  world group. */
  constructor(G, { H, berth, doors, scene }) {
    super(G, { C: H, body: { vel: berth.hostVel, ang: berth.hostAng }, scene, doors, her: () => G.C.obj });
    this.berth = berth;
    // Her outboard flank at her centre of mass (her `obj` is there), from her envelope; the tug's station off it.
    const E = G.L.envelope, nose = -craftBounds('tug').min.z;
    this.skin = new THREE.Vector3((E?.min[0] ?? -5) - (G.L.com?.[0] ?? 0), 0, 0);
    this.station = this.skin.clone().setX(this.skin.x - TOW.gap - nose);
    this.qRel = new THREE.Quaternion().setFromAxisAngle(UP, -Math.PI / 2); // its nose along her +x: at her
  }

  /** Out, or on its way in until it is through the door: the berth keeps the door open for it. */
  get outside() {
    const c = this.craft;
    if (!c) return false;
    return c.state !== 'in' || c.legs.length >= 4 || !!c.leg?.door;
  }

  say(text, secs = 4) {
    this.berth.say(text, secs);
    return text;
  }

  /** Flight control sends it (berth.mjs `startTug`). False if there is no tug on a stand to send. */
  send() {
    if (this.craft) return false;
    const out = this.berth.spec.out, spot = this.spot('tug', out) ?? this.spot('tug', -out);
    if (!spot) return false;
    this.launch('tug', spot);
    this.doors.setBay(1);
    this.G.C.bus?.emit('tow', { state: 'launch' });
    return true;
  }

  /** The berth's line while it comes out to her. */
  status() {
    const c = this.craft;
    if (!c || c.state === 'launch') return 'the tug is launching from the hangar';
    const r = Math.round(c.obj.position.distanceTo(this.G.C.obj.position));
    return c.state === 'dock' ? `the tug is closing to clamp on · ${r} m` : `the tug is coming out to her · ${r} m`;
  }

  /** Every frame, after the berth has placed her (main.mjs). */
  frame(dt) {
    const c = this.craft;
    if (!c) return;
    c.t += dt;
    if ((c.state === 'out' || c.state === 'dock') && this.berth.phase !== 'tug') this.goHome(c, 'lost'); // she is not waiting for it
    if (c.state === 'launch') this.launchFrame(c, dt);
    else if (c.state === 'in') this.inFrame(c, dt);
    else if (c.state === 'coupled') this.coupledFrame(c, dt);
    else this.flyFrame(c, dt);
    if (this.craft) this.beacon(c, dt);
  }

  /** Out to her flank and in to its station; or backing off her after letting go. Home is rescue.mjs's. */
  flyFrame(c, dt) {
    if (!['out', 'dock', 'clear'].includes(c.state)) return super.flyFrame(c, dt);
    const S = this.S, o = c.obj, her = this.G.C.obj;
    her.updateWorldMatrix(true, false);
    let cruise = S.cruise, profile = null, face = null;
    const tv = _tv.copy(c.state === 'clear' ? this.berth.hostVel : this.G.body.vel);
    const tp = _tp.copy(this.station);
    if (c.state === 'clear') {
      tp.x -= TOW.clear;
      tp.applyMatrix4(her.matrixWorld);
      (face = c.qHold), (profile = S.jets), (cruise = 3);
      if (o.position.distanceTo(tp) < 2) {
        this.goHome(c, 'done');
        this.G.C.bus?.emit('tow', { state: 'home' });
      }
    } else {
      // Off her flank `near` metres out along the line through its station, then in along it, nose to her.
      if (c.state === 'out') tp.x -= S.near;
      tp.applyMatrix4(her.matrixWorld);
      const d = o.position.distanceTo(tp);
      if (c.state === 'out' && d < S.near * 0.5) c.state = 'dock';
      if (c.state === 'dock') (face = _fq.copy(her.quaternion).multiply(this.qRel)), (profile = S.jets), (cruise = S.near * 0.5);
      if (c.state === 'dock' && d < S.dock.dist && _v.subVectors(c.vel, tv).length() < S.dock.speed) return this.couple(c);
    }
    this.steer(c, this.detour(o.position, tp, _det), tv, dt, { brake: true, cruise, accel: S.accel, face, profile });
  }

  /** Made fast: the clamp's arms on her, and flight control's path from here (berth.mjs `towed`). */
  couple(c) {
    const o = c.obj, her = this.G.C.obj;
    her.updateWorldMatrix(true, false);
    c.state = 'coupled';
    c.t = 0;
    c.relP = o.position.clone().applyMatrix4(_m.copy(her.matrixWorld).invert()); // where it made fast, on her
    c.relQ = her.quaternion.clone().invert().multiply(o.quaternion);
    c.prevP = her.position.clone();
    c.prevV = this.G.body.vel.clone();
    c.acc = new THREE.Vector3();
    c.arms = ARMS.map(() => lineMesh('#e0b030', 0.1));
    for (const m of c.arms) this.scene.add(m);
    this.say('Tug: clamped on. We have her: bringing her in. Hands off.', 5);
    this.G.C.bus?.emit('tow', { state: 'coupled' });
    this.berth.towed();
  }

  /** Fast to her: placed on her each frame (her motion is the berth's path), its drive and jets doing it, until the
   *  cradle's arms have her. */
  coupledFrame(c, dt) {
    const o = c.obj, her = this.G.C.obj, b = this.berth;
    if (b.phase !== 'recover' || b.u >= b.offU) return this.castOff(c);
    her.updateWorldMatrix(true, false);
    const k = Math.min(1, dt / TOW.ease);
    c.relP.lerp(this.station, k * 2);
    c.relQ.slerp(this.qRel, k * 2);
    o.position.copy(c.relP).applyMatrix4(her.matrixWorld);
    o.quaternion.copy(her.quaternion).multiply(c.relQ);
    o.updateWorldMatrix(true, false);
    // Her acceleration (smoothed: a path's finite differences are rough) is what the tug is giving her.
    const v = _v.subVectors(her.position, c.prevP).multiplyScalar(1 / Math.max(dt, 1e-4));
    c.prevP.copy(her.position);
    c.acc.lerp(_a.subVectors(v, c.prevV).multiplyScalar(1 / Math.max(dt, 1e-4)), Math.min(1, dt * 4));
    c.prevV.copy(v);
    c.vel.copy(v);
    const nose = _n.set(0, 0, -1).applyQuaternion(o.quaternion), push = c.acc.dot(nose);
    const main = clamp(push / TOW.drive, 0, 1);
    craftThrust(o, Math.max(TOW.idle, main), c.t);
    this.exhaust(c, main, dt);
    this.jets(c, _a.copy(c.acc).addScaledVector(nose, -Math.max(0, push)), TOW.jets, dt);
    // The clamp's arms, from their ends on the tug out to her skin.
    c.arms.forEach((m, i) => {
      const a = o.localToWorld(_p.copy(ARMS[i]));
      const g = her.worldToLocal(_r.copy(a));
      g.x = this.skin.x;
      g.z *= 1.5;
      stretch(m, a, her.localToWorld(g));
    });
  }

  /** The cradle's arms have her: the clamp comes off and the tug backs away. */
  castOff(c) {
    for (const m of c.arms ?? []) m.removeFromParent();
    c.arms = null;
    craftThrust(c.obj, 0, c.t);
    c.state = 'clear';
    c.t = 0;
    c.qHold = c.obj.quaternion.clone();
    this.done.push({ kind: 'tug', ship: true });
    this.say('Tug: the cradle has her. Clamp off, going home.', 4);
    this.G.C.bus?.emit('tow', { state: 'off' });
  }
}
