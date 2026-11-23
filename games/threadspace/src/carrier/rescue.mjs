// Rescue craft: a tanker or a tug, launched from the hangar to a fighter that has run dry out in space. From the
// cockpit, 1 calls the tanker and 2 the tug (seats/fighter.mjs); the same key again recalls it before it has you.
//
// Both live on stands in the hangar (rescue-craft.mjs `parkCraft`, `C.craft`: a tanker and a tug a side) and launch
// from there: up off the stand to its `ride` height, along the hangar on its jets to its side's bay door (`legsOut`),
// nose out, and the run out through the door, as a fighter does (fighter.mjs `launch`), then into the world with the
// carrier's velocity. (A layout with no stands: from your own pad, empty while you are out, as before.) Out there
// they fly Newton's way, as everything here does: point the drive along the change of velocity wanted and burn (a
// flip and burn to stop), the jets for the last few metres. A straight line through the carrier is broken by a point
// clear of her hull (`detour`, her lofts slice by slice: fighter.mjs `hullSpan`).
//
// - The tanker (`kinds.tanker`) comes alongside, a few metres over your spine and pointing your way, matches you, and
//   runs a hose down to your back. While the hose is on, both tanks fill at `flow` kg/s. Move more than `hose` metres
//   off and the hose comes away (it comes round again). Full, it goes home and you fly yourself in.
// - The tug (`kinds.tug`) sits ahead of your nose, takes you on a tow bar (`cable` metres) and tows you home, hands off:
//   your controls are off while you are on it (`fighter.towed`). It is a tow bar, not a rope: in space a rope cannot
//   slow you, and you would sail on past the tug into the carrier. So it holds you at its length both ways: the tug
//   pulls and brakes, you follow, your nose swings to the line. Off the bay, inside flight control's range and slow, it lets
//   you go and flight control brings you in (fighter.mjs `land`). Faster than a refuel when you are a long way out: it
//   tows at `towAccel` up to `towCruise`.
//
// - A fighter that is tumbling (her jets dry, or hit) cannot be met at a station off her nose or her spine: it swings
//   round with her. So either craft first holds off her centre, `grab.hold` metres out, matched to her drift, and puts
//   a line on her (`grab`): it takes her spin off at `grab.despin` rad/s² (hands off: `fighter.towed`), and once she is
//   steady comes in to its station as above, the line still on.
// - Shot dead in space (`fighter-down`, main.mjs), the tug goes out to her by default (`disabled()`): one already out
//   carries on (or turns back out), a tanker out goes home and the tug follows it out (`queue`). The tanker is no use
//   to her then, and 1 says so.
//
// Home: each comes back to the gate off its own stretch of door at its ride height, in through the door (the tug
// stern first, so it parks nose out, ready), along the hangar and down onto its stand (`legsIn`), where it stays.
// The same flying is the cutter's tug's (tow.mjs `Tow` extends this): the helpers take the carrier from `this.C` and
// `this.body`, the world from `this.scene` and the craft's charge from `this.her()`. Says `rescue` on the bus ({ kind, state }) and the calls
// `rescue-launch`, `rescue-on`, `rescue-done`, `rescue-recall`. Every number is the layout's `fighter.rescue`
// (tools/carrier-v2.mjs). Looks use unseeded randoms; what happens uses none, so a scripted run is unchanged.

import * as THREE from 'three';
import { clamp } from '../util.mjs';
import { craftMesh, craftThrust, PARK } from './rescue-craft.mjs';
import { Fighter } from './fighter.mjs';

const FWD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3(), _h = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _j = new THREE.Vector3(), _jd = new THREE.Vector3(), _jq = new THREE.Quaternion(), _lv = new THREE.Vector3();
const smooth = (k) => k * k * (3 - 2 * k);

/** The words for each kind (the HUD and damage control's card). */
const NAMES = { tanker: 'Tanker', tug: 'Tug' };

/** The hose or the cable: a thin cylinder between two world points, stretched each frame. */
export function lineMesh(color, r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  m.frustumCulled = false;
  return m;
}
export function stretch(m, a, b) {
  m.position.lerpVectors(a, b, 0.5);
  const d = _h.subVectors(b, a), L = d.length();
  m.scale.set(1, Math.max(0.01, L), 1);
  if (L > 1e-4) m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / L));
}

export class Rescue {
  /** `G` the game in hand (main.mjs): its fighter, guns, carrier `body`, doors, bus and damage control. The rest say
   *  whose craft they are (tow.mjs gives the host's): `C` the carrier they live in, `body` her motion ({ vel, ang }),
   *  `scene` where they fly once out, `doors` her bay doors, `her()` what they go out to. */
  constructor(G, { C = G.C, body = G.body, scene = G.fighter?.scene, doors = G.doors, her = () => G.fighter?.obj } = {}) {
    Object.assign(this, { G, C, body, scene, doors, her });
    this.S = C.L.fighter.rescue;
    this.craft = null; // the one out, if any
    this.done = []; // what each sortie came to (tests)
    this.queue = null; // a kind to launch once the craft out is stowed (the tug, after a tanker, for a fighter shot dead)
  }

  /** The craft out now, its kind, or null. */
  get kind() {
    return this.craft?.kind ?? null;
  }

  /** You on the tug's tow bar. */
  get towing() {
    return this.craft?.state === 'tow';
  }

  /** 1 or 2 in the cockpit: send `kind` out to you, or (the same kind again, before it has you) call it back. Returns
   *  the line for the card. */
  call(kind, auto = false) {
    const { fighter, doors, C } = this.G, S = this.S;
    if (!S?.kinds?.[kind]) return null;
    if (!fighter.flying) return this.say('Flight control: rescue craft go out to a fighter in space.');
    const c = this.craft;
    if (fighter.disabled && !auto) return this.say(kind === 'tanker' ? 'Flight control: you are dead in space. Gas will not help you: the tug is bringing you in.' : 'Flight control: you are dead in space. The tug is bringing you in.');
    if (c) {
      if (c.kind === kind && ['launch', 'out'].includes(c.state)) return this.recall();
      return this.say(`Flight control: the ${NAMES[c.kind].toLowerCase()} is already out to you.`);
    }
    // Off its stand on your side; or, with none, out of your pad, which is empty while you fly.
    this.launch(kind, this.spot(kind, fighter.out) ?? this.padSpot(kind));
    doors.setBay(1);
    C.bus?.emit('rescue', { kind, state: 'launch', auto });
    C.bus?.emit('call', { id: 'rescue-launch', kind });
    return this.say(auto ? 'Flight control: tug launching to bring you in. Hands off, she will come to you.' : kind === 'tanker' ? 'Flight control: tanker launching. Hold your course and she will come to you.' : 'Flight control: tug launching. She will take you on her tow bar and tow you home.');
  }

  /** Your fighter is shot dead in space (main.mjs, `fighter-down`): the tug goes out to her. One out already carries
   *  on, or turns back out if it was going home; a tanker out goes home, and the tug launches once it is in. */
  disabled() {
    const c = this.craft;
    if (c?.kind === 'tug') {
      if (c.state === 'home' || (c.state === 'launch' && c.home)) {
        c.home = null;
        if (c.state === 'home') c.state = 'out';
        this.say('Flight control: tug, turn back out: she is dead in space. Bring her in.');
      }
      return;
    }
    if (c) {
      this.queue = 'tug';
      if (!['home', 'in'].includes(c.state)) this.goHome(c, 'disabled');
      this.say('Flight control: tanker returning. The tug launches as soon as she is in.');
      return;
    }
    this.call('tug', true);
  }

  /** Called back before it has you: it turns for home. */
  recall() {
    const c = this.craft;
    if (!c) return null;
    if (this.G.fighter.disabled && c.kind === 'tug') return this.say('Flight control: negative, you are dead in space. The tug stays with you.');
    this.goHome(c, 'recalled');
    this.G.C.bus?.emit('call', { id: 'rescue-recall', kind: c.kind });
    return this.say(`Flight control: ${NAMES[c.kind].toLowerCase()} recalled.`);
  }

  say(text) {
    this.G.dc?.say(null, text, 0, 5);
    return text;
  }

  /** The stand of a `kind` on side `out` with its craft on it, or null. */
  spot(kind, out) {
    return (this.C.craft ?? []).find((s) => s.kind === kind && s.out === out && s.home) ?? null;
  }

  /** No stands: a stand-in on your fighter's pad, the craft built there and taken away again when it is home. */
  padSpot(kind) {
    const fi = this.G.fighter, S = this.S, home = fi.home, obj = craftMesh(kind);
    fi.berth.add(obj);
    obj.position.copy(home.pos);
    obj.quaternion.copy(home.quat);
    const exitZ = home.pos.z + (home.pos.z < (S.bayMid ?? 33) ? 1 : -1) * S.bay;
    return { kind, side: fi.out < 0 ? 'port' : 'starboard', out: fi.out, at: home.pos.clone(), q: home.quat.clone(), qOut: home.quat.clone(), qIn: fi.inbound(), back: false, exitZ, ride: home.pos.y + this.C.L.fighter.launch.lift, obj, parent: fi.berth, home: true, temp: true };
  }

  /** The craft off stand `spot`: up to its ride height, along to its door, nose out (`legsOut`), then the run out. */
  launch(kind, spot) {
    spot.home = false;
    const c = (this.craft = { kind, K: this.S.kinds[kind], spot, obj: spot.obj, berth: spot.parent, out: spot.out, zIn: spot.exitZ, state: 'launch', t: 0, vel: new THREE.Vector3(), vLocal: new THREE.Vector3(), line: null, main: 0, hoseT: 0, beaconT: 0, grabDir: null, grabbed: false, legs: this.legsOut(spot), leg: null, run: false });
    return c;
  }

  /** Stand to door, in the hangar's frame: up, along the hangar to the door's stretch for it, nose out. */
  legsOut(s) {
    const up = s.at.clone().setY(s.ride), ex = up.clone().setZ(s.exitZ);
    return [{ p: up, q: s.q }, { p: ex, q: s.q }, { p: ex, q: s.qOut }];
  }

  /** Door to stand: in through the door (stern first if it parks nose out), round to its parked heading, along the
   *  hangar over its stand, and down onto it. */
  legsIn(s) {
    const up = s.at.clone().setY(s.ride), ex = up.clone().setZ(s.exitZ);
    return [{ p: ex, q: s.back ? s.qOut : s.qIn, door: true }, { p: ex, q: s.q }, { p: up, q: s.q }, { p: s.at.clone(), q: s.q }];
  }

  /** One step along its legs inside the hangar (eased in and out, at `PARK.speed` and `PARK.turn`), its jets puffing
   *  as it starts and stops. A `door` leg waits for its side's door. True when the last leg is done. */
  legFrame(c, dt) {
    const o = c.obj;
    if (!c.leg) {
      const L = c.legs.shift();
      if (!L) return true;
      const p0 = o.position.clone(), q0 = o.quaternion.clone();
      const T = Math.max(0.6, p0.distanceTo(L.p) / PARK.speed, q0.angleTo(L.q) / PARK.turn);
      c.leg = { ...L, p0, q0, t: 0, T };
      c.legV = c.legV ?? new THREE.Vector3();
    }
    const L = c.leg;
    if (L.door && !this.doors.openOn(c.spot.side)) return false;
    L.t += dt;
    const k = Math.min(1, L.t / L.T), was = _lv.copy(o.position);
    o.position.lerpVectors(L.p0, L.p, smooth(k));
    o.quaternion.slerpQuaternions(L.q0, L.q, smooth(k));
    // Its jets: by the change in its velocity this step (looks only).
    const v = was.subVectors(o.position, was).multiplyScalar(1 / Math.max(dt, 1e-4));
    const acc = _j.subVectors(v, c.legV).multiplyScalar(1 / Math.max(dt, 1e-4));
    c.legV.copy(v);
    c.berth.updateWorldMatrix(true, false);
    const n = acc.length();
    this.jets(c, acc.transformDirection(c.berth.matrixWorld).multiplyScalar(n), 3, dt);
    craftThrust(o, 0, c.t);
    if (k >= 1) c.leg = null;
    return false;
  }

  /** Its quads puffing for acceleration `a` (world, m/s²) out of `full`: gas the other way. Looks only. */
  jets(c, a, full, dt) {
    const P = this.G.guns?.puffs, o = c.obj, quads = o.userData.quads;
    if (!P || !quads) return;
    const n = a.length(), k = Math.min(1, n / full);
    const dir = _jd.copy(a).multiplyScalar(n > 1e-6 ? -1 / n : 0);
    o.updateWorldMatrix(true, false);
    quads.forEach((q, i) => P.jet(`${o.uuid}-${i}`, o.localToWorld(_j.copy(q)), dir, k < 0.08 ? 0 : k, dt, 0.22));
  }

  /** What the cockpit shows of her: where she is, her name and what she is doing; null with none out. */
  mark(out = {}) {
    const c = this.craft, fi = this.G.fighter;
    if (!c || !fi.obj || c.state === 'launch' || c.state === 'in') return null;
    out.point = c.obj.getWorldPosition(out.point ?? new THREE.Vector3());
    out.range = out.point.distanceTo(fi.obj.getWorldPosition(_a));
    out.label = NAMES[c.kind].toUpperCase();
    out.state = c.state;
    return out;
  }

  /** The prompt line while one is out (seats/fighter.mjs), or null. */
  prompt() {
    const c = this.craft, fi = this.G.fighter;
    if (!c || !fi.flying) return null;
    const n = NAMES[c.kind];
    const r = c.state === 'launch' ? null : c.obj.getWorldPosition(_a).distanceTo(fi.obj.getWorldPosition(_b));
    const rng = r == null ? '' : r < 1000 ? ` ${Math.round(r)} m` : ` ${(r / 1000).toFixed(1)} km`;
    if (c.state === 'launch') return { key: c.kind === 'tanker' ? '1' : '2', label: `${n} launching from the hangar (again: recall her)` };
    if (c.state === 'out') return { key: c.kind === 'tanker' ? '1' : '2', label: `${n} inbound,${rng} out (again: recall her)` };
    if (c.state === 'dock' && this.tumbling(c)) return { key: '', label: `${n} closing:${rng}. You are tumbling: hands off, she will put a line on you.` };
    if (c.state === 'grab') return { key: '', label: `${n}'s line is on you: steadying your spin, ${fi.body.ang.length() < 0.1 ? 'nearly there' : `${Math.round(fi.body.ang.length() * 57.3)}°/s`}. Hands off.` };
    if (c.state === 'dock') return { key: '', label: `${n} closing to make fast:${rng}. ${c.grabbed || fi.disabled ? 'Hands off.' : 'Hold still.'}` };
    if (c.state === 'fuel') {
      const P = fi.flight.prop, T = this.G.L.fighter.flight.tank;
      return { key: '', label: `Hose on: fuel ${Math.round((100 * P.main) / T.main)}%, jet gas ${Math.round((100 * P.rcs) / T.rcs)}%. Hold still.` };
    }
    if (c.state === 'tow') {
      const d = fi.obj.getWorldPosition(_a).distanceTo(fi.gateWorld(_b));
      return { key: '', label: `On the tug's tow bar, hands off: the bay ${d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`}` };
    }
    return null;
  }

  // --- the frame -------------------------------------------------------------------------------------------------------

  /** After the fighter's frame (main.mjs), before collisions. */
  frame(dt) {
    const fi = this.G.fighter;
    if (!this.craft && this.queue) {
      const k = this.queue;
      this.queue = null;
      if (fi.flying) this.call(k, true);
    }
    const c = this.craft;
    if (!c) return;
    c.t += dt;
    // Lost her (she landed, was shot down, broke up): home.
    if (['out', 'dock', 'grab', 'fuel', 'tow'].includes(c.state) && !fi.flying) this.goHome(c, 'lost');
    if (c.state === 'launch') this.launchFrame(c, dt);
    else if (c.state === 'in') this.inFrame(c, dt);
    else this.flyFrame(c, dt);
    if (this.craft) this.beacon(c, dt);
  }

  /** Her beacon: an amber flash every second and a bit, big enough to find from kilometres off. */
  beacon(c, dt) {
    const B = c.obj.userData.beacon, cam = this.G.camera;
    c.beaconT += dt;
    B.visible = c.beaconT % 1.2 < 0.12;
    B.scale.setScalar(cam ? clamp(cam.position.distanceTo(c.obj.getWorldPosition(_a)) * 0.01, 2, 40) : 3);
  }

  /** Off its stand and along the hangar to its door (`legFrame`), then out through it, in the carrier's frame, and into
   *  the world as a fighter is. */
  launchFrame(c, dt) {
    const S = this.S, L = this.C.L.fighter.launch, o = c.obj;
    if (!c.run) {
      if (!this.legFrame(c, dt)) return;
      if (!this.doors.openOn(c.spot.side)) return; // nose out at the door, waiting for it
      c.run = true;
      c.t = 0;
      c.from = o.position.clone();
      c.ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(o.quaternion);
    }
    const tt = c.t;
    o.position.copy(c.from).addScaledVector(c.ahead, 0.5 * S.launch * tt * tt);
    c.vLocal.copy(c.ahead).multiplyScalar(S.launch * tt);
    craftThrust(o, 0.6, c.t);
    this.exhaust(c, 0.6, dt);
    if (o.position.x * c.out > Math.abs(L.clear)) {
      const { C, body } = this;
      C.obj.updateMatrixWorld(true);
      const cq = C.obj.getWorldQuaternion(_q);
      const spin = _b.copy(body.ang).applyQuaternion(cq);
      const r = o.getWorldPosition(_c).sub(C.obj.getWorldPosition(_d));
      c.vel.copy(body.vel).add(spin.cross(r)).add(_e.copy(c.vLocal).applyQuaternion(c.berth.getWorldQuaternion(_q2)));
      this.scene.attach(o);
      c.state = c.home ? 'home' : 'out';
      c.t = 0;
    }
  }

  /** Out in the world: to her, alongside, the hose or the cable, and home. */
  flyFrame(c, dt) {
    const fi = this.G.fighter, S = this.S, K = c.K, o = c.obj;
    const fw = fi?.obj;
    if (fw) fw.updateWorldMatrix(true, false);
    const tp = _f, tv = _g;
    let brake = true, cruise = S.cruise, accel = S.accel, face = null, profile = null;
    if ((c.state === 'out' || c.state === 'dock') && this.tumbling(c)) {
      // She is tumbling: her station swings round with her, so hold off her centre (on the side we come from) and
      // put a line on her first.
      const fc = fw.getWorldPosition(_b);
      if (!c.grabDir) c.grabDir = new THREE.Vector3().subVectors(o.position, fc).normalize();
      tp.copy(fc).addScaledVector(c.grabDir, S.grab.hold + (c.state === 'out' ? S.near : 0));
      tv.copy(fi.body.vel);
      const d = o.position.distanceTo(tp);
      if (c.state === 'out' && d < S.near * 0.5) c.state = 'dock';
      if (c.state === 'dock') (face = 'her'), (profile = S.jets), (cruise = S.near * 0.5);
      if (c.state === 'dock' && d < S.grab.range && _a.subVectors(c.vel, tv).length() < S.dock.speed) this.grab(c);
    } else if (c.state === 'out' || c.state === 'dock') {
      // Her station off you: over your spine for the hose, or a bar's length ahead of your nose. She comes in to
      // it along the line out from you through it (from overhead, or from dead ahead), never through you.
      const st = _a.set(...K.station);
      if (c.state === 'out') st.addScaledVector(_b.copy(st).normalize(), S.near);
      tp.copy(st).applyMatrix4(fw.matrixWorld);
      tv.copy(fi.body.vel);
      const d = o.position.distanceTo(tp);
      if (c.state === 'out' && d < S.near * 0.5) c.state = 'dock';
      if (c.state === 'dock') (face = fw.quaternion), (profile = S.jets), (cruise = S.near * 0.5); // the last metres slow, as on her jets
      if (c.grabbed) this.lineFrame(c, dt); // the line still on, taking the last of her spin
      if (c.state === 'dock' && d < S.dock.dist && _a.subVectors(c.vel, tv).length() < S.dock.speed) this.makeFast(c);
    } else if (c.state === 'grab') {
      tp.copy(fw.getWorldPosition(_b)).addScaledVector(c.grabDir, S.grab.hold);
      tv.copy(fi.body.vel);
      face = 'her';
      profile = S.jets;
      cruise = S.near * 0.5;
      this.lineFrame(c, dt);
      if (fi.body.ang.length() < S.grab.steady) {
        c.grabbed = true;
        c.state = 'dock';
        this.say(`${NAMES[c.kind]}: she is steady. Coming in to make fast.`);
      }
    } else if (c.state === 'fuel') {
      tp.set(...K.station).applyMatrix4(fw.matrixWorld);
      tv.copy(fi.body.vel);
      face = fw.quaternion;
      this.fuelFrame(c, dt);
    } else if (c.state === 'tow') {
      // Home with you on the bar: to a point off the bay a bar's length beyond the gate, at the carrier's speed.
      this.gateOf(c, fi.home.pos.z, K.cable + S.tow.beyond, tp);
      this.shipVel(tp, tv);
      cruise = S.tow.cruise;
      accel = S.tow.accel;
      face = 'away';
      const gate = fi.gateWorld(_a);
      const fp = fw.getWorldPosition(_b);
      // Let go inside flight control's range and slow enough: they bring you in.
      if (fp.distanceTo(gate) < fi.S.landing.range * 0.8 && _c.subVectors(fi.body.vel, this.G.body.vel).length() < fi.S.landing.speed * 0.6) this.letGo(c);
    } else if (c.state === 'home') {
      // To the gate off its own stretch of door, at the height it rides in the hangar.
      this.gateOf(c, c.zIn, S.home, tp, c.spot.ride);
      this.shipVel(tp, tv);
      const d = o.position.distanceTo(tp);
      if (d < S.near) {
        // The last metres on her jets, turned as she goes in: nose in, or (a tug, to park nose out) stern first.
        profile = S.jets;
        cruise = S.near * 0.5;
        face = (c.qWorld ??= new THREE.Quaternion()).copy(c.spot.back ? c.spot.qOut : c.spot.qIn).premultiply(this.C.obj.getWorldQuaternion(_q2));
      }
      if (d < S.dock.dist * 3 && _a.subVectors(c.vel, tv).length() < 4) this.stowing(c);
    }
    if (!this.craft || c.state === 'in') return;
    this.steer(c, this.detour(o.position, tp, _e), tv, dt, { brake, cruise, accel, face, profile });
    if (c.state === 'tow') this.towFrame(c, dt);
  }

  /** Point `out` (world) off the bay on her side, `beyond` metres out past the gate, at `z` along the hangar (and at
   *  height `y`, else the landing gate's). */
  gateOf(c, z, beyond, out, y = null) {
    const [gx, gy] = this.C.L.fighter.landing.gate;
    return this.C.frame.localToWorld(out.set(c.out * (Math.abs(gx) + beyond), y ?? gy, z));
  }

  /** The velocity of the carrier's own point `p` (world): hers, plus her turn carrying it round. */
  shipVel(p, out) {
    const { C, body } = this;
    const cq = C.obj.getWorldQuaternion(_q);
    const spin = _c.copy(body.ang).applyQuaternion(cq);
    return out.copy(body.vel).add(spin.cross(_d.subVectors(p, C.obj.getWorldPosition(_d))));
  }

  /** Where to fly for `to` from `from` (world): `to` itself, or, when the straight line passes through the carrier,
   *  a point clear of her hull beside where it would (into `out`). Her hull is taken slice by slice along her length
   *  (fighter.mjs `hullSpan`: the lofts' half-width and half-height, the island and the drum sleeve too), grown by
   *  `clear` metres. A line that starts or ends inside that (off the bay door) is left alone. */
  detour(from, to, out) {
    const C = this.C, M = this.S.clear;
    out.copy(to);
    if (!this.slices) {
      const span = (a, b) => Fighter.prototype.hullSpan.call({ C }, a, b); // her lofts: the layout's, whichever ship has it
      const all = span(-1e5, 1e5);
      this.slices = { z0: all.bow - M, step: 10, list: [] };
      for (let z = all.bow - M; z <= all.stern + M; z += 10) this.slices.list.push(span(z - 10, z + 20));
    }
    const S = this.slices;
    const sliceAt = (z) => S.list[Math.floor((z - S.z0) / S.step)];
    const inside = (p) => {
      const sl = sliceAt(p.z);
      return !!sl && sl.w > 0 && Math.abs(p.x) < sl.w + M && Math.abs(p.y) < sl.h + M;
    };
    const inv = _m.copy(C.frame.matrixWorld).invert();
    const A = _a.copy(from).applyMatrix4(inv), B = _b.copy(to).applyMatrix4(inv);
    if (inside(A) || inside(B)) return out;
    const n = Math.ceil(A.distanceTo(B) / 12);
    for (let i = 1; i < n; i++) {
      const p = _c.lerpVectors(A, B, i / n);
      if (!inside(p)) continue;
      // Out beside her at that slice: off her axis the way the line was passing (or the way it came from).
      let dx = p.x, dy = p.y;
      if (Math.hypot(dx, dy) < 2) (dx = A.x), (dy = A.y);
      const len = Math.hypot(dx, dy) || 1, sl = sliceAt(p.z);
      (dx /= len), (dy /= len);
      const k = Math.min((sl.w + M + 20) / Math.max(1e-3, Math.abs(dx)), (sl.h + M + 20) / Math.max(1e-3, Math.abs(dy)));
      return out.set(dx * k, dy * k, p.z).applyMatrix4(C.frame.matrixWorld);
    }
    return out;
  }

  /** Newton's way to `tp` moving at `tv` (world): the velocity it wants (as fast as `cruise`, slowing in time to stop
   *  there if `brake`, braking at `profile` m/s² if given, else `accel`), the main drive along her nose for a big change,
   *  her jets for the rest. `face` is where her nose
   *  goes when she is not burning hard: a quaternion, 'away' (along the line from you to her), or null (at `tp`). */
  steer(c, tp, tv, dt, { brake, cruise, accel, face, profile }) {
    const S = this.S, o = c.obj;
    const rel = _a.subVectors(tp, o.position), dist = rel.length();
    const vr = _b.subVectors(c.vel, tv);
    const speed = brake ? Math.min(cruise, Math.sqrt(2 * (profile ?? accel) * S.margin * Math.max(0, dist - 0.2))) : cruise;
    const want = _c.copy(rel).multiplyScalar(dist > 1e-3 ? speed / dist : 0);
    const a = _d.subVectors(want, vr).multiplyScalar(1 / S.tau);
    if (a.length() > accel) a.setLength(accel);
    const nose = _e.copy(FWD).applyQuaternion(o.quaternion);
    let main = 0;
    const jet = _f; // what her jets give (the rest is the drive along her nose)
    if (face === 'away') {
      // Towing: the bar is off her stern, so she cannot turn and burn; she brakes on her bow jets, as hard as she pulls.
      main = Math.max(0, a.dot(nose));
      jet.copy(a).addScaledVector(nose, -main);
      c.vel.addScaledVector(a, dt);
    } else if (a.length() > S.jets) {
      // The drive pushes only along her nose; the jets take what they can of the rest.
      main = Math.max(0, a.dot(nose));
      const side = a.addScaledVector(nose, -main); // what the drive cannot give (sideways, or astern): the jets
      if (side.length() > S.jets) side.setLength(S.jets);
      jet.copy(side);
      c.vel.addScaledVector(nose, main * dt).addScaledVector(side, dt);
    } else (jet.copy(a), c.vel.addScaledVector(a, dt));
    o.position.addScaledVector(c.vel, dt);
    this.jets(c, jet, S.jets, dt);
    // Her nose: along the burn while it is a hard one, else where `face` says.
    const hard = _d.subVectors(want, vr).length() > S.jets * 2 && face !== 'away';
    let look = null;
    if (hard) look = _d.normalize();
    else if (face === 'away') look = _d.subVectors(o.position, this.her().getWorldPosition(_g)).normalize();
    else if (face === 'her') look = _d.subVectors(this.her().getWorldPosition(_g), o.position).normalize();
    else if (face) _q.copy(face);
    else if (dist > 2) look = _d.copy(rel).normalize();
    if (look) _q.setFromRotationMatrix(_m.lookAt(_g.set(0, 0, 0), look, _h.copy(UP).applyQuaternion(o.quaternion)));
    if (look || face) o.quaternion.rotateTowards(_q, S.turn * dt);
    c.main = main / accel;
    craftThrust(o, c.main, c.t);
    this.exhaust(c, c.main, dt);
  }

  /** Her drive's gas, while it burns (unseeded: looks only). */
  exhaust(c, k, dt) {
    const gas = this.G.guns?.gas;
    if (!gas || k < 0.05 || Math.random() > k * dt * 40) return;
    const o = c.obj;
    for (const n of o.userData.nozzles) {
      const p = o.localToWorld(_g.copy(n.at));
      const v = _h.copy(n.dir).transformDirection(o.matrixWorld).multiplyScalar(60 + 40 * Math.random()).add(c.vel);
      v.x += (Math.random() - 0.5) * 12;
      v.y += (Math.random() - 0.5) * 12;
      v.z += (Math.random() - 0.5) * 12;
      gas.emit(p, v, 0.8 + Math.random(), 0.6, 4 + 3 * Math.random(), 0.12, 0.7, 0);
    }
  }

  /** Alongside and matched: the hose goes on, or the cable. */
  makeFast(c) {
    const fi = this.G.fighter;
    c.state = c.kind === 'tanker' ? 'fuel' : 'tow';
    c.t = 0;
    if (c.line) c.line.removeFromParent(); // the grab line comes off: the hose or the bar takes her
    c.line = lineMesh(c.kind === 'tanker' ? '#20262c' : '#d8b048', c.kind === 'tanker' ? 0.09 : 0.14);
    this.G.fighter.scene.add(c.line);
    if (c.kind === 'tug') {
      fi.towed = true;
      fi.flight.assist = 0;
    } else fi.audio?.refill();
    this.G.C.bus?.emit('rescue', { kind: c.kind, state: c.state });
    this.G.C.bus?.emit('call', { id: 'rescue-on', kind: c.kind });
    this.say(c.kind === 'tanker' ? 'Tanker: hose is on. Hold still while we fill you.' : 'Tug: you are on the bar. Hands off, we have you.');
  }

  /** Her spin, more than the craft can meet her station against. */
  tumbling(c) {
    return !c.grabbed && this.G.fighter.body.ang.length() > this.S.grab.spin;
  }

  /** Off her centre and matched: a line on her. Hands off from here (`fighter.towed`). */
  grab(c) {
    const fi = this.G.fighter;
    c.state = 'grab';
    c.t = 0;
    c.line = lineMesh('#c8c0a8', 0.05);
    fi.scene.add(c.line);
    fi.towed = true;
    fi.flight.assist = 0;
    this.G.C.bus?.emit('rescue', { kind: c.kind, state: 'grab' });
    this.say(`${NAMES[c.kind]}: line is on you. Hands off while we take your spin off.`);
  }

  /** The line on her: from the craft's coupling to her port (her nose for the tug, her back for the tanker), taking her spin off, her hold aimed where she points. */
  lineFrame(c, dt) {
    const fi = this.G.fighter, K = c.K, S = this.S.grab, w = fi.obj;
    const w0 = fi.body.ang.length();
    if (w0 > 0) fi.body.ang.setLength(Math.max(0, w0 - S.despin * dt));
    fi.flight.aim.copy(w.quaternion);
    if (c.line) stretch(c.line, c.obj.localToWorld(_c.set(...K.hoseAt)), w.localToWorld(_d.set(...K.port)));
  }

  /** The hose on: both tanks fill; too far off and it comes away. */
  fuelFrame(c, dt) {
    const fi = this.G.fighter, K = c.K, P = fi.flight.prop, T = this.G.L.fighter.flight.tank;
    const a = c.obj.localToWorld(_a.set(...K.hoseAt)), b = fi.obj.localToWorld(_b.set(...K.port));
    stretch(c.line, a, b);
    if (a.distanceTo(b) > K.hose) {
      c.line.removeFromParent();
      c.line = null;
      c.state = 'dock';
      this.say('Tanker: hose away. Hold still and we will come round again.');
      return;
    }
    P.main = Math.min(T.main, P.main + K.flow[0] * dt);
    P.rcs = Math.min(T.rcs, P.rcs + K.flow[1] * dt);
    if (P.main >= T.main && P.rcs >= T.rcs) {
      this.done.push({ kind: 'tanker', t: c.t });
      this.G.C.bus?.emit('call', { id: 'rescue-done', kind: 'tanker' });
      this.say('Tanker: you are full. Hose away, we are going home. Fly yourself in.');
      this.goHome(c, 'full');
    }
  }

  /** On the tow bar: you are held at its length, your nose swings to the tug, and your hands are off. */
  towFrame(c, dt) {
    const fi = this.G.fighter, K = c.K, w = fi.obj;
    const T = c.obj.localToWorld(_a.set(...K.hoseAt));
    const N = w.localToWorld(_b.set(...K.port));
    const d = _c.subVectors(T, N), L = d.length();
    if (L > 1e-4) {
      // Held at the bar's length, and moving with the tug along it.
      d.multiplyScalar(1 / L);
      w.position.addScaledVector(d, L - K.cable);
      fi.body.vel.addScaledVector(d, _d.subVectors(c.vel, fi.body.vel).dot(d));
      // The bar is clamped at both ends, so she does not swing round the tug: what she has across it dies away.
      const across = _d.subVectors(fi.body.vel, c.vel);
      fi.body.vel.addScaledVector(across, -Math.min(1, K.damp * dt));
      // Her nose to the line.
      _q.setFromRotationMatrix(_m.lookAt(_e.set(0, 0, 0), d, _f.copy(UP).applyQuaternion(w.quaternion)));
      w.quaternion.rotateTowards(_q, K.swing * dt);
    }
    // Her spin damped by the bar, and her hold aimed where she points, so it does not fight it.
    fi.body.ang.multiplyScalar(Math.max(0, 1 - dt * 3));
    fi.flight.aim.copy(w.quaternion);
    stretch(c.line, T, w.localToWorld(_b.set(...K.port)));
  }

  /** Off the bay: the tug lets you go and flight control brings you in. */
  letGo(c) {
    const { fighter: fi, doors } = this.G;
    fi.towed = false;
    this.done.push({ kind: 'tug', t: c.t });
    this.G.C.bus?.emit('call', { id: 'rescue-done', kind: 'tug' });
    this.say('Tug: casting you off. Flight control has you.');
    doors.setBay(1);
    fi.land();
    this.goHome(c, 'cast off');
  }

  /** Back to the bay (any state), the hose or cable off. */
  goHome(c, why) {
    const fi = this.G.fighter;
    if (c.line) (c.line.removeFromParent(), (c.line = null));
    if (fi?.towed) fi.towed = false; // the bar, the hose or the grab line comes off
    c.home = why;
    if (c.state === 'launch' && !c.run) {
      // Still in the hangar: straight back to its stand.
      c.state = 'in';
      const s = c.spot, up = s.at.clone().setY(s.ride);
      c.leg = null;
      c.legs = [{ p: c.obj.position.clone(), q: s.q }, { p: up, q: s.q }, { p: s.at.clone(), q: s.q }];
    } else if (c.state !== 'launch') c.state = 'home';
    c.t = 0;
    this.G.C.bus?.emit('rescue', { kind: c.kind, state: 'home', why });
  }

  /** At her own gate off the bay: back into the carrier's frame, and in through the door to her stand (`legsIn`). */
  stowing(c) {
    this.C.obj.updateMatrixWorld(true);
    c.berth.attach(c.obj);
    c.state = 'in';
    c.t = 0;
    c.leg = null;
    c.legV = null;
    c.legs = this.legsIn(c.spot);
    this.doors.setBay(1);
  }

  /** In the hangar, along its legs, down onto its stand: there it stays (one built on a pad is taken away). */
  inFrame(c, dt) {
    if (!this.legFrame(c, dt)) return;
    const o = c.obj, s = c.spot;
    o.position.copy(s.at);
    o.quaternion.copy(s.q);
    craftThrust(o, 0, c.t);
    o.userData.beacon.visible = false;
    if (s.temp) o.removeFromParent();
    else s.home = true;
    this.G.C.bus?.emit('rescue', { kind: c.kind, state: 'stowed' });
    this.craft = null;
  }
}
