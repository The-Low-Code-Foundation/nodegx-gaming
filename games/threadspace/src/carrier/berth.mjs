// A ship carried in another ship's berth: the cutter in the carrier's hangar (design/ROADMAP.md, phase 12).
//
// The engine runs the ship you are aboard (`C`, her `Rigid` body, her helm). Her mothership is the host: a second
// `buildCarrier` out in the world with no systems of her own (main.mjs makes it, `?host=<id>&berth=<berth id>`), her
// hangar deck drawn round you and her bay doors worked from here. While you are carried, your ship's place is the
// berth's, in the host's frame; nothing she does at the helm moves her.
//
// Phases:
//   berthed   on the cradle, bay door shut. L at the helm asks to launch.
//   opening   flight control has the door on your side going up.
//   launch    the cradle's arms push her out sideways through the door, slowly, to `clear` metres off the host's
//             centreline. Then the hand-over: she is a body in the world with the velocity she really has (the host's,
//             the host's turn carrying the berth round, and the push), as fighter.mjs `handOver` does it.
//   out       yours. L in the recovery lane's catchment asks to fly her in yourself (recovery.mjs: the lane, the
//             door, the capture or the wave-off); L again there, or L anywhere else within `recover.range` of the gate
//             and slower than `recover.speed` against the host, hands her to flight control (`takeIn`).
//   tug       flight control's tug (tow.mjs, `berth.tug`, set by main.mjs) is on its way out to her from its stand in
//             the hangar: she holds where she is, hands off, her drift taken off at `HOLD` m/s². Without a tug (or none
//             on its stand) `takeIn` goes straight to `recover`.
//   recover   flown in along a path in the host's frame: to the gate off her door, then sideways onto the cradle. With
//             the tug on her (`towed()`), it is the tug that has her, clamped to her outboard flank, until she reaches
//             the cradle's arms off the door (`offU` along the path), where it lets go and goes home.
//   capture   you flew her to the cradle's arms (`capture`): drawn onto the cradle from the place and speed she had.
//   closing   down on the cradle, the door coming shut; then berthed.
//
// The berth is the host layout's `berths` entry: { id, ship, side, door ('w' | 'e'), at [x, y, z] (where the carried
// ship's layout origin sits, in the host's frame), yaw, out (-1 port, +1 starboard), port, clear }. A host with a
// hangar but no `berths` yet gets a stand-in from `standIn()`.
//
// `lastRecovery` is how she last came home, for a career to read (with `crew: who` when the crew's pilot had her at
// the time): { manual: false } from flight control (`tug: true` when the tug brought her), or the grade
// of your own approach (recovery.mjs `grade`: closing speed, offset, alignment, seconds from the holding point).
//
// Not here yet (ROADMAP phase 12's second half): the cutter against the carrier's hull as solids, the host under way
// (she stands still in the world), and the cradle drawn moving.

import * as THREE from 'three';
import { clamp } from '../util.mjs';

const PUSH = 2.2; // m/s the cradle's arms reach
const PUSH_ACC = 0.5; // m/s² they push at
const GATE = 30; // metres beyond `clear` where a recovery lines up
const RECOVER = { range: 900, speed: 20, cruise: 14 }; // flight control takes her inside this, slower than this; flies her in at this
const HOLD = 0.5; // m/s² her drift is taken off at while she waits for the tug
const smooth = (k) => k * k * (3 - 2 * k);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _h = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** A berth for a host whose layout has a hangar with bay doors but no `berths`: on the port side, in front of the
 *  first port door, the carried ship's keel a metre over the hangar floor. */
export function standIn(HL, L) {
  const hangar = HL.compartments.find((c) => c.id === 'hangar');
  const door = (hangar?.bayDoors ?? []).find((d) => d.side === 'w') ?? hangar?.bayDoors?.[0];
  if (!hangar || !door) return null;
  const out = door.side === 'w' ? -1 : 1;
  const floor = HL.decks.find((d) => d.id === hangar.deck).floor;
  const half = Math.max(...HL.hull.main.map((s) => s.w)) / 2;
  const beam = L.envelope ? Math.max(-L.envelope.min[0], L.envelope.max[0]) : 6;
  const x = out * (Math.abs(out < 0 ? hangar.x[0] : hangar.x[1]) - beam - 3);
  return { id: 'stand-in', ship: null, side: out < 0 ? 'port' : 'starboard', door: door.side, at: [x, floor + 1 - (L.envelope?.min[1] ?? -3), (door.from + door.to) / 2], yaw: out < 0 ? 0 : Math.PI, out, clear: half + 25 };
}

export class Berth {
  /** `C`, `body`: the ship you are aboard and her Rigid. `H`: the host (a built ship), `hostDoors` her Doors.
   *  `spec`: the berth. `say(text, secs)`: a line on the helm's sight. `onChange(phase)`: told at each change. */
  /** `held()`: why she may not launch (null when she may); `crew()`: who of the crew is flying her, if anyone. */
  constructor({ C, body, H, hostDoors, spec, say = () => {}, onChange = () => {}, held = null, crew = null }) {
    Object.assign(this, { C, body, H, hostDoors, spec, say, onChange, held, crew });
    this.hostVel = new THREE.Vector3(); // the host's velocity in the world (she stands still for now)
    this.hostAng = new THREE.Vector3(); // and her turn, in her own frame
    this.phase = 'berthed';
    this.s = 0; // metres out from the berth along the launch run
    this.v = 0; // and how fast
    this.t = 0;
    // The carried ship's centre of mass relative to her layout origin, turned as she lies in the berth.
    this.qBerth = new THREE.Quaternion().setFromAxisAngle(UP, spec.yaw ?? 0);
    this.com = new THREE.Vector3(...C.L.com).applyQuaternion(this.qBerth);
    this.home = new THREE.Vector3(...spec.at).add(this.com); // her centre of mass on the cradle, in the host's frame
    this.run = Math.abs(spec.clear) - Math.abs(this.home.x); // how far the cradle pushes her
    this.place(this.home, this.qBerth);
  }

  /** Carried: her place is the host's to give, and the helm does nothing. */
  get carried() {
    return this.phase !== 'out';
  }

  /** The gate off her door where recoveries line up, in the world. */
  gateWorld(t = new THREE.Vector3()) {
    return this.H.frame.localToWorld(t.set(this.spec.out * (Math.abs(this.spec.clear) + GATE), this.home.y, this.home.z));
  }

  /** Puts her at `p` (her centre of mass) and `q`, both in the host's frame. */
  place(p, q) {
    const { C, H } = this;
    H.obj.updateMatrixWorld(true);
    C.obj.position.copy(H.frame.localToWorld(_p.copy(p)));
    C.obj.quaternion.copy(H.obj.getWorldQuaternion(_h)).multiply(q); // (its own scratch: callers hand `_q` in as `q`)
    C.obj.updateMatrixWorld(true);
    this.body.vel.copy(this.hostVel);
    this.body.ang.set(0, 0, 0);
  }

  /** L at the helm: ask to launch, or ask flight control to bring her in. Returns what was said. */
  key() {
    if (this.phase === 'berthed') {
      const held = this.held?.(); // why she may not launch yet (main.mjs: her upkeep, upkeep.mjs)
      if (held) return this.tell(`Flight control: launch refused. ${held}`, 5);
      this.hostDoors.setBay(1);
      this.set('opening');
      return this.tell('Flight control: launch approved. Bay door opening.', 4);
    }
    if (this.phase === 'out') {
      // In the lane's catchment, the first L asks to fly her in yourself (recovery.mjs); it answers, or leaves it to us.
      const said = this.lane?.request();
      return said ? this.tell(said, 5) : this.takeIn();
    }
    if (this.phase === 'tug') return this.tell('Flight control has her: the tug is on its way. Hands off.', 2);
    return this.tell(this.phase === 'recover' || this.phase === 'closing' || this.phase === 'capture' ? 'Flight control has her.' : 'Launching.', 2);
  }

  /** Out: hands her to flight control, who fly her in (the automatic recovery), if she is near and slow enough. */
  takeIn() {
    if (this.phase !== 'out') return this.tell('Flight control has her.', 2);
    {
      const d = this.C.obj.position.distanceTo(this.gateWorld(_p));
      const v = _v.copy(this.body.vel).sub(this.hostVel).length();
      if (d > RECOVER.range) return this.tell(`Flight control: too far out to take you. Close to within ${RECOVER.range} m of the bay (${Math.round(d)} m now).`, 4);
      if (v > RECOVER.speed) return this.tell(`Flight control: too fast to take you. Slow to under ${RECOVER.speed} m/s against her (${Math.round(v)} now).`, 4);
      if (this.startTug()) return this.tell('Flight control has her: the tug is coming out to bring her in. Hands off, hold where you are.', 5);
      this.startRecover();
      return this.tell('Flight control has her. Hands off: coming aboard.', 4);
    }
  }

  /** The cradle's arms take her where she is (you flew her to them: recovery.mjs calls this through the last gate,
   *  inside the tolerances, the door up): from the place, attitude and velocity she really has, onto the cradle,
   *  slowing all the way. `grade` is kept as `lastRecovery`. */
  capture(grade = {}) {
    if (this.phase !== 'out') return false;
    const { C, H } = this;
    H.obj.updateMatrixWorld(true);
    const hq = H.obj.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.p0 = H.frame.worldToLocal(C.obj.position.clone());
    this.q0 = hq.clone().multiply(C.obj.quaternion);
    this.v0 = this.body.vel.clone().sub(this.hostVel).applyQuaternion(hq); // against the host, in her frame
    // Long enough to slow her gently from the speed she has and to cover the way at about the arms' own speed.
    this.capT = clamp(Math.max(this.p0.distanceTo(this.home) / (PUSH * 0.6), this.v0.length() * 3), 6, 40);
    this.lastRecovery = { manual: true, ...grade, ...this.flownBy() };
    this.set('capture');
    return true;
  }

  /** `{ crew: who }` when the crew's pilot had her (the `crew` hook main.mjs gives), else nothing. */
  flownBy() {
    const who = this.crew?.();
    return who ? { crew: who } : {};
  }

  tell(text, secs) {
    this.say(text, secs);
    return text;
  }

  set(phase) {
    const was = this.phase;
    this.phase = phase;
    this.t = 0;
    this.onChange(phase);
    this.C.bus?.emit('berth-phase', { phase, was }); // every change, for whoever follows her (pilot.mjs, a career)
  }

  /** Flight control's tug out to her (tow.mjs): she holds where she is until it has her. False with no tug to send. */
  startTug() {
    if (!this.tug?.send(this)) return false;
    const { C, H } = this;
    H.obj.updateMatrixWorld(true);
    const hq = H.obj.getWorldQuaternion(new THREE.Quaternion());
    this.p0 = H.frame.worldToLocal(C.obj.position.clone());
    this.q0 = hq.clone().invert().multiply(C.obj.quaternion);
    this.drift = this.body.vel.clone().sub(this.hostVel).applyQuaternion(hq.invert()); // against the host, her frame
    this.tugged = true;
    this.lastRecovery = { manual: false, tug: true, ...this.flownBy() };
    this.hostDoors.setBay(1);
    this.set('tug');
    return true;
  }

  /** The tug has her (tow.mjs): flight control's path from where she is, the tug clamped on. */
  towed() {
    if (this.phase === 'tug') this.startRecover();
  }

  startRecover() {
    const { C, H, spec } = this;
    H.obj.updateMatrixWorld(true);
    const p0 = H.frame.worldToLocal(C.obj.position.clone());
    this.q0 = H.obj.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(C.obj.quaternion);
    const gate = new THREE.Vector3(spec.out * (Math.abs(spec.clear) + GATE), this.home.y, this.home.z);
    const off = new THREE.Vector3(spec.out * Math.abs(spec.clear), this.home.y, this.home.z);
    const pts = [p0];
    // Not out on her own side yet: over or under the host first, well clear of her, then across.
    if (p0.x * spec.out < Math.abs(spec.clear)) {
      const tall = Math.max(...H.L.hull.main.map((s) => s.h)) / 2 + 40;
      const y = p0.y >= 0 ? Math.max(p0.y, tall) : Math.min(p0.y, -tall);
      pts.push(new THREE.Vector3(p0.x, y, p0.z), new THREE.Vector3(gate.x, y, gate.z));
    }
    pts.push(gate, off, this.home.clone());
    this.path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = this.path.getLength();
    this.pathT = clamp(len / RECOVER.cruise, 12, 90);
    // How far along the path (by length: `getPointAt`) the gate is, and the point off the door where the cradle's arms
    // take her (and the tug lets her go).
    this.gateU = clamp(1 - (GATE + this.run) / len, 0, 1);
    this.offU = clamp(1 - off.distanceTo(this.home) / len, 0, 1);
    this.u = 0;
    this.lastRecovery = { manual: false, ...(this.tugged ? { tug: true } : {}), ...this.flownBy() };
    this.hostDoors.setBay(1);
    this.set('recover');
  }

  frame(dt) {
    const { spec, hostDoors } = this;
    this.t += dt;
    if (this.phase === 'out') return;
    if (this.phase === 'berthed' || this.phase === 'closing') {
      this.place(this.home, this.qBerth);
      if (this.phase === 'closing') hostDoors.setBay(this.tug?.outside ? 1 : 0); // not shut on the tug coming home
      if (this.phase === 'closing' && hostDoors.kOf(spec.door) <= 0) {
        this.set('berthed');
        this.say('On the cradle. Bay door shut.', 3);
      }
      return;
    }
    if (this.phase === 'opening') {
      this.place(this.home, this.qBerth);
      if (hostDoors.openOn(spec.door)) {
        this.s = this.v = 0;
        this.set('launch');
        this.say('Cradle away.', 2);
      }
      return;
    }
    if (this.phase === 'launch') {
      this.v = Math.min(PUSH, this.v + PUSH_ACC * dt);
      this.s += this.v * dt;
      this.place(_w.copy(this.home).setX(this.home.x + spec.out * this.s), this.qBerth);
      if (this.s >= this.run) this.handOver();
      return;
    }
    if (this.phase === 'capture') {
      // A cubic from where and how fast she was to rest on the cradle (Hermite: p0, v0 → home, 0).
      const k = clamp(this.t / this.capT, 0, 1), k2 = k * k, k3 = k2 * k;
      _w.copy(this.p0).multiplyScalar(2 * k3 - 3 * k2 + 1).addScaledVector(this.v0, (k3 - 2 * k2 + k) * this.capT).addScaledVector(this.home, -2 * k3 + 3 * k2);
      this.place(_w, _q.copy(this.q0).slerp(this.qBerth, smooth(clamp(k * 2.5, 0, 1))));
      if (k >= 1) {
        hostDoors.setBay(this.tug?.outside ? 1 : 0);
        this.set('closing');
      }
      return;
    }
    if (this.phase === 'tug') {
      // Hands off, waiting for the tug: her own jets take her drift off and hold her where she is.
      const v = this.drift.length();
      if (v > 0) this.drift.setLength(Math.max(0, v - HOLD * dt));
      this.p0.addScaledVector(this.drift, dt);
      this.place(this.p0, this.q0);
      this.body.vel.add(_v.copy(this.drift).applyQuaternion(this.H.obj.getWorldQuaternion(_h)));
      return;
    }
    if (this.phase === 'recover') {
      // Wait at the gate for the door, then on in.
      let k = clamp(this.t / this.pathT, 0, 1);
      if (smooth(k) >= this.gateU && !hostDoors.openOn(spec.door) && smooth(k) < this.gateU + 0.02) {
        this.t -= dt; // holding at the gate until the door is up
        k = clamp(this.t / this.pathT, 0, 1);
      }
      this.u = smooth(k);
      this.place(this.path.getPointAt(this.u), _q.copy(this.q0).slerp(this.qBerth, smooth(clamp(k * 1.6, 0, 1))));
      if (k >= 1) {
        hostDoors.setBay(this.tug?.outside ? 1 : 0);
        this.tugged = false;
        this.set('closing');
      }
    }
  }

  /** Clear of the hull: from now on she is a body in the world with the velocity she really has. */
  handOver() {
    const { C, H, spec } = this;
    H.obj.updateMatrixWorld(true);
    const hq = H.obj.getWorldQuaternion(new THREE.Quaternion());
    const spin = this.hostAng.clone().applyQuaternion(hq); // the host's turn, in the world
    const r = C.obj.getWorldPosition(new THREE.Vector3()).sub(H.obj.getWorldPosition(_p));
    this.body.vel.copy(this.hostVel).add(spin.clone().cross(r)).add(_v.set(spec.out * this.v, 0, 0).applyQuaternion(hq));
    this.body.ang.copy(spin.applyQuaternion(_q.copy(C.obj.quaternion).invert())); // she was turning with her host
    this.hostDoors.setBay(0);
    this.set('out');
    this.say('Clear of the bay. She is yours.', 4);
  }

  /** A line for the HUD: where she is in all this. */
  status() {
    if (this.phase === 'out') {
      const d = this.C.obj.position.distanceTo(this.gateWorld(_p));
      return d < RECOVER.range * 3 ? `bay ${Math.round(d)} m` : '';
    }
    if (this.phase === 'tug') return this.tug?.status?.() ?? 'the tug is coming out to her';
    return { berthed: 'on the cradle · L launches', opening: 'bay door opening', launch: `cradle pushing her out · ${Math.max(0, Math.round(this.run - this.s))} m to clear`, recover: 'flight control has her', capture: 'the cradle has her', closing: 'on the cradle · bay door closing' }[this.phase];
  }
}
