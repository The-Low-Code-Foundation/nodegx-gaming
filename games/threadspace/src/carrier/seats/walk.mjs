// The walking seat: you on your feet (or floating) aboard. Where you are (a fixed deck, a drum segment, a lift car, a
// hub ring, between the spine and a hub ring, on a ladder, on the hangar's catwalk), how you get between them, the
// camera, and the line at the top of the screen that says where you are.
//
// `G` is the game in hand (main.mjs): the ship `C` and her layout `L`, the systems, the camera, the HUD, `setMode`,
// `fadeThen` and `fading`.

import * as THREE from 'three';
import { roomAt, facing } from '../layout.mjs';
import { drumWindow, drumDeck, drumSpots, drumRoomAt, placeInDrum, drumCamera, liftCar, liftShaft, parseKey } from '../drum.mjs';
import { hubRing, hubPlace, hubBelow, wrap } from '../hub.mjs';
import { frameOf, sideOf } from '../wayfinding.mjs';
import { box, at, mat } from '../../util.mjs';

const _tgt = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const glow3 = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });

/** The yaw to face coming off a ladder at `end` ({ deck, at }): along a passage toward its longer run, or in a room
 *  toward its nearest door. Yaw 0 looks toward the bow (-z). Null when the room has no way out to face. */
function wayOut(C, end) {
  const r = roomAt(C, end.deck, end.at[0], end.at[1]);
  if (!r) return null;
  const [x, z] = end.at, toward = (px, pz) => Math.atan2(-(px - x), -(pz - z));
  const lx = r.x[1] - r.x[0], lz = r.z[1] - r.z[0];
  if (Math.max(lx, lz) > 8 && Math.max(lx, lz) > 2.5 * Math.min(lx, lz)) {
    // A passage: the way with more of it ahead.
    return lz > lx ? toward(x, z - r.z[0] > r.z[1] - z ? r.z[0] : r.z[1]) : toward(x - r.x[0] > r.x[1] - x ? r.x[0] : r.x[1], z);
  }
  let best = null;
  for (const d of C.L.doors) {
    if (!d.between.includes(r.id)) continue;
    const o = C.rooms.get(d.between.find((id) => id !== r.id)), rel = o && facing(r, o);
    if (!rel) continue;
    const p = rel.a === 'n' ? [d.at, r.z[0]] : rel.a === 's' ? [d.at, r.z[1]] : rel.a === 'w' ? [r.x[0], d.at] : [r.x[1], d.at];
    const dist = Math.hypot(p[0] - x, p[1] - z);
    if (dist > 0.3 && (!best || dist < best.dist)) best = { dist, p };
  }
  return best ? toward(...best.p) : null;
}

export class WalkSeat {
  constructor(G) {
    this.G = G;
    const { L, C, walker } = G;
    this.deckNow = L.spawn.deck;
    this.drumNow = null; // the drum segment you stand in (the spin-drum carrier): { I, g, hid, did, seg }
    this.ride = null; // a lift car on its way up or down a spoke
    this.hubNow = null; // the hub ring you walk in (hub.mjs): { hub }
    this.swing = null; // between the spine and a hub ring: catching it ('catch') or pushing off it ('push')
    this.climb = null; // on a ladder between two decks, climbing (drawn, not a fade)
    this.catwalk = null; // on the hangar's catwalk (`C.catwalks`, sets.mjs): which length
    this.lastX = null; // where you were last frame, round a drum or a hub ring (for the Coriolis nudge)
    // The hangar catwalk's rungs: up from the floor at each end of a length, and down again from its top.
    for (const run of C.catwalks ?? []) {
      const I = C.decks.get(run.deck);
      for (const z of run.rungs) {
        I.use('catwalk-up', 'Climb the rungs to the catwalk', run.wall - 0.7, z, () => this.startRungs(run, z, true), { r: 1.8 });
        I.use('catwalk-down', 'Climb down to the hangar floor', run.wall - 0.7, z, () => this.startRungs(run, z, false), { r: 1.8, y: run.y + 1.2 });
      }
    }
    walker.speed = 4.6;
  }

  // --- the layout's uses (layout.mjs, drum.mjs, hub.mjs hooks) ---------------------------------------------------------

  ladder(l, end) {
    const { ship, dc } = this.G;
    if (!ship.hatchOpen(l)) return dc.say(null, "The hatch won't open: the compartment on the other side has lost its air.");
    this.startClimb(l, end);
  }

  /** The drums (drum.mjs): a lift down a spoke from the spine, back up to the hub (in your duty suit), the ladder
   *  between the decks. */
  drum(kind, a) {
    // Out of the drum only in your duty suit: the lockers are beside the lift doors (drum.mjs `suitLockers`).
    if (kind === 'up' && !this.hubNow && !this.G.ship.suit) {
      this.G.sfx.cue('clunk', { vol: 0.3 });
      return this.G.dc.say(null, "Not up to the hub in your off-duty uniform: outside the drums it's the duty suit. The lockers are beside the lift doors.", 0, 6);
    }
    if (kind === 'ladder') this.startDrumClimb(a);
    else if (kind === 'catch') this.startSwing('catch', hubRing(this.G.C, a.half));
    else if (this.hubNow) this.startRide(kind, a); // from the hub ring you step into the car
    else this.G.fadeThen(() => this.startRide(kind, a));
  }

  // --- where you can see from here ----------------------------------------------------------------------------------

  /** Walking, whether you can see out of the ship: only from a room with windows, the open hangar and its airlock, or
   *  with the cutaway's view. Not from a drum, a lift, the hub or a ladder. */
  seesOut() {
    if (this.drumNow || this.hubNow || this.swing || this.climb || this.ride) return false;
    const r = roomAt(this.G.C, this.deckNow, this.G.walker.pos.x, this.G.walker.pos.z);
    return !r || !!(r.windows?.length || r.bay || r.vacuum || r.airlock);
  }

  /** Whether fixed deck `id` is drawn while you walk: the one you are on, out of a drum and a hub ring; while you drop
   *  through the spine's hatch it goes as you leave it, and pushing off the hub it comes as you reach it; climbing, the
   *  deck you are climbing to as well. */
  fixedShown(id) {
    const { drumNow, climb, swing, hubNow, deckNow } = this;
    if (drumNow) return false;
    if (climb?.kind === 'fixed' && id === climb.to.deck) return true;
    if (swing) return id === deckNow && (swing.kind === 'catch' ? swing.u === undefined || swing.u < 0.35 : swing.u > 0.6);
    return !hubNow && id === deckNow;
  }

  /** Walking, the room you stand in (a drum room's id in a drum), or null. */
  roomNow() {
    const { drumNow, hubNow, swing, ride, deckNow } = this, { C, walker } = this.G;
    if (hubNow || swing) return null;
    if (drumNow) return ride ? null : drumRoomAt(C, drumNow.hid, drumNow.did, drumNow.seg, walker.pos.x, walker.pos.z)?.id;
    return roomAt(C, deckNow, walker.pos.x, walker.pos.z)?.id;
  }

  /** The deck you are on: a fixed deck's number, a drum deck's key in a drum, the hub ring's in one. */
  placeNow() {
    return this.drumNow ? this.drumNow.I.deck.id : this.hubNow ? this.hubNow.hub.I.deck.id : this.deckNow;
  }

  // --- standing you somewhere ---------------------------------------------------------------------------------------

  /** Stands you at (x, z) on deck `id`: a fixed deck's number, or a drum deck's key ("drum-b-i", drum.mjs) with the
   *  segment `seg` whose frame x and z are in. */
  goDeck(id, x, z, yaw, seg = 0) {
    this.leaveHub();
    this.catwalk = null;
    const k = parseKey(id);
    if (k) return this.enterDrum(k.hid, k.did, seg, x, z, yaw);
    const I = this.G.C.decks.get(id);
    this.drumNow = null;
    this.deckNow = id;
    this.G.walker.interior = I;
    this.G.walker.moveTo(new THREE.Vector3(x, I.floorY, z), yaw);
  }

  // --- the drums (the spin-drum carrier): walking round a ring, and the lifts up and down the spokes (drum.mjs) -------

  /** Stands you in segment `seg` of a half's deck at (x, z) in its frame; builds and shows the segments round it. */
  enterDrum(hid, did, seg, x, z, yaw = this.G.walker.yaw) {
    const walker = this.G.walker;
    this.leaveHub();
    const b = drumWindow(this.G.C, hid, did, seg);
    this.drumNow = b;
    walker.interior = b.I;
    walker.float = false;
    walker.pos.set(x, b.I.floorY, z);
    walker.yaw = yaw;
  }

  /** Past a segment floor's edge you are on the next segment's floor: the same point, in the next frame. */
  drumStep() {
    const walker = this.G.walker, d = this.drumNow;
    const { hw } = drumDeck(this.G.C, d.hid, d.did);
    if (Math.abs(walker.pos.x) <= hw) return;
    const k = walker.pos.x > hw ? 1 : -1;
    this.enterDrum(d.hid, d.did, d.seg + k, walker.pos.x - k * 2 * hw, walker.pos.z);
  }

  /** Into a lift car: down a spoke from the hub to a deck (`a.seg`, or the first spoke), or up from a deck to the hub. */
  startRide(dir, a) {
    const { L, C, hands, sfx } = this.G;
    const D = L.drum, { dk, h } = drumDeck(C, a.half, a.deck);
    const seg = a.seg ?? D.spokes.segments[0], spot = drumSpots(C, a.half);
    this.enterDrum(a.half, a.deck, seg, spot.lift.x, spot.lift.z, Math.PI); // facing the doors
    const car = liftCar(spot.lift), shaft = liftShaft(spot.lift, D.hub.r, dk.floorR - dk.h);
    this.drumNow.g.add(car, shaft);
    // The car's lamp, from the light pool (lights.mjs) like every other lamp aboard: a spec on the segment's interior.
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 2.2, 0);
    car.add(anchor);
    const lamp = { anchor, color: new THREE.Color('#fff1d6'), intensity: 9, distance: 7, decay: 1.6, weight: 0.01 };
    this.drumNow.I.lights.push(lamp);
    const omega = (h.rpm * 2 * Math.PI) / 60;
    this.ride = { dir, half: a.half, deck: a.deck, seg, spot, car, shaft, lamp, I: this.drumNow.I, t: 0, dur: 9, r0: D.hub.r + 0.4, r1: dk.floorR, omega, spin: h.dir, r: 0, v: 0, lean: 0 };
    this.rideFrame(0);
    hands?.boardRide(this.ride); // at the change of watch, one or two ride with you
    sfx.cue('servo', { dur: 1.2 });
  }

  /** The car moves along the spoke, easing in and out. Moving out from the axis in a spinning frame, the car's rails
   *  push you sideways (Coriolis, 2ωv): near the hub, where the spin's pull is weak, you feel it as a lean. Faked,
   *  cheaply. */
  rideFrame(dt) {
    const ride = this.ride, { C, hands, sfx } = this.G;
    ride.t += dt;
    const u = Math.min(1, ride.t / ride.dur), sm = u * u * (3 - 2 * u), dsm = (6 * u * (1 - u)) / ride.dur;
    const [ra, rb] = ride.dir === 'down' ? [ride.r0, ride.r1] : [ride.r1, ride.r0];
    ride.r = ra + (rb - ra) * sm;
    ride.v = (rb - ra) * dsm; // outward speed
    const g = ride.omega * ride.omega * ride.r;
    ride.lean = Math.max(-0.3, Math.min(0.3, -Math.atan2(2 * ride.omega * ride.v * ride.spin, Math.max(g, 1.2))));
    ride.car.position.y = -ride.r;
    if (u < 1 || ride.done) return;
    ride.done = true;
    ride.I.lights.splice(ride.I.lights.indexOf(ride.lamp), 1);
    ride.shaft.removeFromParent();
    hands?.endRide(ride, this.drumNow.I, ride.spot.landing);
    if (ride.dir === 'down') {
      ride.car.removeFromParent();
      const s = ride.spot.landing;
      this.ride = null;
      this.enterDrum(this.drumNow.hid, this.drumNow.did, this.drumNow.seg, s.x, s.z, Math.PI / 2);
      sfx.cue('servo', { dur: 1.2 });
    } else {
      // Up at the hub: the doors open on the hub ring (hub.mjs), facing into it.
      const hub = hubRing(C, ride.half), c = hub.cars.find((x) => x.seg === ride.seg && x.deck === ride.deck) ?? hub.cars[0];
      ride.car.removeFromParent();
      this.ride = null;
      this.enterHub(hub, c.s, c.out, c.yaw);
      sfx.cue('servo', { dur: 1.2 });
    }
  }

  // --- the hub rings (hub.mjs): catching one from the spine, walking it, pushing off it -------------------------------

  /** Stands you in `hub` at arc length `s`, `z` along the ship. */
  enterHub(hub, s, z, yaw = this.G.walker.yaw) {
    const walker = this.G.walker;
    this.leaveHub();
    this.drumNow = null;
    this.hubNow = { hub };
    hub.node.visible = true;
    walker.interior = hub.I;
    walker.float = false;
    walker.pos.set(wrap(hub, s), -hub.R, z);
    walker.yaw = yaw;
    walker.speed = 2.2; // a tenth of a g: long, slow lopes
  }

  leaveHub() {
    if (!this.hubNow) return;
    this.hubNow.hub.node.visible = false;
    this.hubNow = null;
    this.G.walker.speed = 4.6;
  }

  /** Between the spine and a hub ring, 1.4 s, the camera carried from where you are to where you will be. Catching:
   *  you drop through the hatch and grab the handhold passing under it, and are jerked up to the ring's speed. Pushing
   *  off: you float up through the seal and the ring turns away under you. */
  startSwing(kind, hub) {
    const { C, camera, walker, sfx } = this.G;
    const sp = C.rooms.get('spine');
    const swing = (this.swing = { kind, hub, t: 0, dur: 1.4, fromPos: camera.position.clone(), fromQuat: camera.quaternion.clone(), yaw: walker.yaw, sp });
    if (kind === 'catch') {
      swing.s = hubBelow(hub) + hub.dir * 0.4; // the handhold coming under you
      swing.z = Math.min(hub.z[1] - 2.6, Math.max(hub.z[0] + 2.6, walker.pos.z));
      hub.node.visible = true;
      sfx.cue('clunk', { vol: 0.4 });
    } else {
      swing.z = (hub.h.corridor[0] + hub.h.corridor[1]) / 2;
      sfx.cue('servo', { dur: 0.6 });
    }
  }

  swingFrame(dt) {
    const { C, camera, walker, hud } = this.G;
    const w = this.swing, hub = w.hub;
    w.t += dt;
    const u = Math.min(1, w.t / w.dur), e = u * u * (3 - 2 * u);
    w.u = u;
    if (w.kind === 'catch') {
      // Where you will stand in the ring: the handhold you caught, carried round with it.
      this.drumCameraTo(hub, w.s, w.z);
    } else {
      // Where you will float in the spine, in the fixed hull.
      const I = C.decks.get(w.sp.deck);
      _tgt.position.set((w.sp.x[0] + w.sp.x[1]) / 2, I.floorY + 1.6, w.z);
      C.frame.localToWorld(_tgt.position);
      _tgt.quaternion.copy(C.obj.getWorldQuaternion(_q)).multiply(walker.quat(_q2));
    }
    camera.position.lerpVectors(w.fromPos, _tgt.position, e);
    camera.quaternion.slerpQuaternions(w.fromQuat, _tgt.quaternion, e);
    if (w.kind === 'catch' && u > 0.55 && u < 0.8) camera.rotateZ((Math.random() - 0.5) * 0.04); // the jerk as your arm takes it
    if (u < 1) return;
    this.swing = null;
    if (w.kind === 'catch') {
      this.enterHub(hub, w.s, w.z, w.yaw);
      hud.flash?.('Caught: you are turning with the hub ring');
    } else {
      hub.node.visible = false;
      this.goDeck(w.sp.deck, (w.sp.x[0] + w.sp.x[1]) / 2, w.z, walker.yaw);
      walker.vel.set(hub.dir * 1.2, 0, 0); // still carrying a little of the ring's way: you drift across the spine
    }
  }

  /** The camera's pose standing at (s, z) in a hub ring, into `_tgt`. */
  drumCameraTo(hub, s, z) {
    const g = hubPlace(hub, s);
    drumCamera(_tgt, g, 0, -hub.R, z, 1.6, 0, this.G.walker.quat(_q2));
  }

  // --- ladders, climbed: the camera goes up or down them (no fade) -----------------------------------------------------

  /** Up or down a fixed-hull ladder `l` from its `end`: hand over hand through the trunk between the decks. Weightless
   *  (the spin-drum carrier's fixed hull) it is quick; the first carrier's decks have weight, so it is a climb. */
  startClimb(l, end) {
    const { C, walker, sfx, SPIN } = this.G;
    const from = l[end], to = l[end === 'a' ? 'b' : 'a'];
    const I0 = C.decks.get(from.deck), I1 = C.decks.get(to.deck);
    const y0 = I0.floorY, y1 = I1.floorY, rise = Math.abs(y1 - y0);
    const yaw = from.yaw ?? 0, [x, z] = from.at;
    const trunk = this.ladderTrunk(Math.min(y0, y1), Math.max(y0, y1) + 3);
    trunk.position.set(x, 0, z);
    trunk.rotation.y = yaw;
    C.frame.add(trunk);
    const anchor = new THREE.Object3D();
    C.frame.add(anchor);
    const lamp = { anchor, color: new THREE.Color('#fff1d6'), intensity: 4, distance: 6, decay: 1.6 };
    const speed = SPIN ? 2.4 : 1.1; // m/s: hand over hand weightless, or a real climb
    this.climb = { kind: 'fixed', to, t: 0, dur: 0.5 + Math.min(3.5, rise / speed), // a long trunk goes quicker than life: no more than 4 s
      y0, y1, x0: walker.pos.x, z0: walker.pos.z, x: x + Math.sin(yaw) * 0.7, z: z + Math.cos(yaw) * 0.7, yaw, trunk, anchor, lit: { lights: [lamp] }, I1, lids: C.hatchLids?.get(l.id) ?? [] };
    if (walker.float) this.climb.y0 = walker.pos.y; // weightless, from wherever you were floating by it
    this.climb.float = !!roomAt(C, to.deck, to.at[0], to.at[1])?.float; // where you come out is weightless
    this.climb.out = wayOut(C, to) ?? yaw + Math.PI; // which way you face coming off it: toward the way out of the room
    // Weightless, you swing round the ladder as you come off it, to its side nearest the way out: the ladder is then
    // behind you and nothing stands between you and the door.
    if (this.climb.float) (this.climb.xo = to.at[0] - Math.sin(this.climb.out) * 0.9), (this.climb.zo = to.at[1] - Math.cos(this.climb.out) * 0.9);
    for (const lid of this.climb.lids) lid.want = 1; // the hatches open (layout.mjs `hatches`), and shut behind you
    sfx.cue('clunk', { vol: 0.3 });
  }

  /** A ladder's trunk from `lo` to `hi` (its own frame: the ladder at the origin, climbed from +z): the walls round it,
   *  the rails and rungs all the way, and a glowing strip every 3 m. */
  ladderTrunk(lo, hi, [wlo, whi] = [lo, hi]) {
    const trunk = new THREE.Group(), wall = mat('#3a4048'), rail = mat('#8f7f4a');
    for (const [w, d, ox, oz] of [[0.08, 1.6, -0.8, 0], [0.08, 1.6, 0.8, 0], [1.6, 0.08, 0, -0.55], [1.6, 0.08, 0, 1.1]]) trunk.add(at(box(w, whi - wlo, d, wall), ox, (whi + wlo) / 2, oz));
    for (const sx of [-0.35, 0.35]) trunk.add(at(box(0.06, hi - lo, 0.06, rail), sx, (hi + lo) / 2, 0));
    for (let y = lo + 0.3; y < hi; y += 0.3) trunk.add(at(box(0.7, 0.04, 0.06, rail), 0, y, 0));
    for (let y = lo + 2; y < hi; y += 3) trunk.add(at(box(0.5, 0.05, 0.05, glow3('#fff1d6')), 0.75, y, 0.3));
    return trunk;
  }

  /** Up or down the rungs at `z`, between the hangar floor and the catwalk length `run`. */
  startRungs(run, z, up) {
    const { C, walker, sfx, SPIN } = this.G;
    const floor = C.decks.get(run.deck).floorY, rise = run.y - floor;
    this.climb = { kind: 'rungs', run, up, t: 0, dur: 0.5 + rise / (SPIN ? 2.4 : 1.1), y0: walker.pos.y, y1: up ? run.y : floor,
      x0: walker.pos.x, z0: walker.pos.z, x: run.wall - 0.6, z, yaw: -Math.PI / 2 }; // face the wall and its rungs
    sfx.cue('clunk', { vol: 0.3 });
  }

  /** On the catwalk: kept on its floor, inside its rail and its ends. */
  catwalkFrame() {
    const r = this.catwalk, walker = this.G.walker;
    walker.pos.x = Math.min(r.x[1] - 0.3, Math.max(r.x[0] + 0.3, walker.pos.x));
    walker.pos.z = Math.min(r.z[1] - 0.3, Math.max(r.z[0] + 0.3, walker.pos.z));
    walker.pos.y = r.y;
  }

  /** Between a drum's two decks at a spoke's ladder: a real climb, three metres at nearly a g. */
  startDrumClimb(a) {
    const { C, walker, sfx } = this.G;
    const s = drumSpots(C, a.half).ladder, from = this.drumNow, other = drumDeck(C, a.half, a.deck);
    const target = drumWindow(C, a.half, a.deck, a.seg); // built; shown with the one you are on while you climb
    drumWindow(C, from.hid, from.did, from.seg);
    target.g.visible = true;
    // The trunk through the structure between the decks (walls only there, so it is not a black band as you pass it),
    // and the rungs all the way. The ladder is climbed from -z.
    const y0 = walker.pos.y, y1 = -other.dk.floorR, lo = Math.min(y0, y1), hi = Math.max(y0, y1);
    const lower = y0 < y1 ? drumDeck(C, from.hid, from.did).dk : other.dk;
    const trunk = this.ladderTrunk(lo + 0.3, hi - 0.05, [lo + lower.h - 0.1, hi + 0.1]);
    trunk.position.set(s.x, 0, s.z);
    trunk.rotation.y = Math.PI;
    from.g.add(trunk);
    this.climb = { kind: 'drum', a, from, target, trunk, t: 0, dur: 3.2, y0: walker.pos.y, y1: -other.dk.floorR, x0: walker.pos.x, z0: walker.pos.z, x: s.x, z: s.z - 0.7, yaw: Math.PI, // the ladder is against the aft wall: face it
      lids: C.drumLids?.get(`${a.half}|${a.seg}`) ?? [] };
    for (const lid of this.climb.lids) lid.want = 1; // both decks' hatches open (drum.mjs `spokeFoot`), and shut behind you
    sfx.cue('clunk', { vol: 0.3 });
  }

  /** Along a guide line to `to` ({ x, y, z } on this deck), hand over hand, facing `yaw` at the end: the way up from the
   *  hangar's gangway to a berthed ship's port and back (berths.mjs). Drawn, not a fade; nothing else moves you meanwhile. */
  startLine(to, yaw) {
    const { walker, sfx } = this.G;
    walker.floater?.reset?.();
    const from = walker.pos.clone(), end = new THREE.Vector3(to.x, to.y, to.z);
    this.climb = { kind: 'line', t: 0, dur: Math.min(5, Math.max(1.4, from.distanceTo(end) / 2.4)), from, end, yaw };
    sfx.cue('clunk', { vol: 0.25 });
  }

  lineFrame(c, dt) {
    const walker = this.G.walker;
    c.t += dt;
    const u = Math.min(1, c.t / c.dur), pulls = Math.max(1, Math.round(c.from.distanceTo(c.end) / 1.2));
    const e = u - Math.sin(u * pulls * 2 * Math.PI) / (pulls * 2 * Math.PI); // each pull quick, then a pause
    walker.pos.lerpVectors(c.from, c.end, Math.min(1, Math.max(0, e)));
    walker.vel?.set(0, 0, 0);
    // Look along the line while you go, and where you are going to stand at the end.
    const along = Math.atan2(-(c.end.x - c.from.x), -(c.end.z - c.from.z));
    let d = (u > 0.7 ? c.yaw : along) - walker.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    walker.yaw += d * Math.min(1, dt * 4);
    const look = u > 0.7 ? 0 : Math.atan2(c.end.y - c.from.y, Math.hypot(c.end.x - c.from.x, c.end.z - c.from.z)) * 0.6;
    walker.pitch += (look - walker.pitch) * Math.min(1, dt * 4);
    walker.bob = 0;
    if (u < 1) return;
    this.climb = null;
    walker.floater?.arrive?.(); // a hand on the nearest hold
  }

  climbFrame(dt) {
    const c = this.climb, { C, walker } = this.G;
    if (c.kind === 'line') return this.lineFrame(c, dt);
    c.t += dt;
    const u = Math.min(1, c.t / c.dur);
    // Onto the ladder in the first 0.4 s, then up or down it, a pull at a time.
    const k = Math.min(1, c.t / 0.4), m = Math.max(0, (c.t - 0.4) / (c.dur - 0.4));
    walker.pos.x = c.x0 + (c.x - c.x0) * k;
    walker.pos.z = c.z0 + (c.z - c.z0) * k;
    const pulls = Math.abs(c.y1 - c.y0) / 0.6;
    const e = m - Math.sin(m * pulls * 2 * Math.PI) / (pulls * 2 * Math.PI); // each pull quick, then a pause
    walker.pos.y = c.y0 + (c.y1 - c.y0) * Math.min(1, Math.max(0, e));
    // Facing the ladder on it; weightless, turning round to face the room over the last of the climb, so you come out
    // of the trunk looking where you are going.
    const turnRound = c.kind === 'fixed' && c.float && u > 0.6;
    let d = (turnRound ? c.out : c.yaw) - walker.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    walker.yaw += d * Math.min(1, dt * (turnRound ? 4 : 6));
    if (turnRound && c.xo !== undefined) {
      const sw = (u - 0.6) / 0.4, e2 = sw * sw * (3 - 2 * sw);
      walker.pos.x = c.x + (c.xo - c.x) * e2;
      walker.pos.z = c.z + (c.zo - c.z) * e2;
    }
    // Look the way you climb, up or down the ladder, and level again as you step off.
    const look = (c.y1 > c.y0 ? 0.55 : -0.55) * Math.sin(Math.PI * Math.min(1, u * 1.1));
    walker.pitch += (look - walker.pitch) * Math.min(1, dt * 4);
    walker.bob = 0;
    if (c.anchor) c.anchor.position.set(walker.pos.x, walker.pos.y + 2.2, walker.pos.z);
    if (u < 1) return;
    this.climb = null;
    if (c.kind === 'rungs') {
      // Off the top, a step along the catwalk from the gap; off the bottom, a step back from the wall.
      const r = c.run, inward = c.z < (r.z[0] + r.z[1]) / 2 ? 1 : -1;
      this.catwalk = c.up ? r : null;
      walker.pos.set(c.up ? r.wall - 0.7 : r.wall - 1.3, c.y1, c.up ? c.z + inward * 1.1 : c.z);
    } else if (c.kind === 'fixed') {
      c.trunk.removeFromParent();
      c.anchor.removeFromParent();
      for (const lid of c.lids) lid.want = 0;
      const off = c.to.at;
      if (c.xo !== undefined) this.goDeck(c.to.deck, c.xo, c.zo, c.out);
      else this.goDeck(c.to.deck, off[0] + Math.sin(c.yaw) * 0.9, off[1] + Math.cos(c.yaw) * 0.9, walker.yaw);
      if (c.float) walker.floater?.arrive(); // a hand on the nearest hold as you come out
    } else {
      c.trunk.removeFromParent();
      for (const lid of c.lids) lid.want = 0;
      const s = drumSpots(C, c.a.half).ladder;
      this.enterDrum(c.a.half, c.a.deck, c.a.seg, s.x, s.z - 1.1, walker.yaw);
    }
  }

  // --- the frame ------------------------------------------------------------------------------------------------------

  /** Keys while walking: B the watch bill, E the nearest use (or, in a hub ring with nothing to use, push off). */
  key(code) {
    const { walker, routine, career } = this.G;
    if (code === 'KeyB') routine.read || !career.on ? routine.openBill() : routine.tell(null, 'You have not read the watch bill yet: it is on the board outside the ship\'s office.', 5);
    else if (code === 'KeyE' && (this.swing || this.climb)) return;
    else if (code === 'KeyE') {
      const u = walker.nearestUse();
      if (u) u.use();
      else if (this.hubNow) this.startSwing('push', this.hubNow.hub); // nothing to use in the hub ring: push off up into the spine
    }
  }

  /** Early in the frame, before the ship's systems: your feet (or hands), and whatever carries you (a lift, a ladder,
   *  the catwalk). A ride or a climb goes on whatever seat you are in. */
  move(f, dt) {
    const { C, walker, routine, mode } = this.G, walking = mode() === 'walk';
    // Weightless rooms (`float` in the layout: the spin-drum carrier's spine, crew tunnel and trunks): by the handholds
    // (weightless.mjs, `walker.floater`).
    if (walking) walker.float = !this.drumNow && !this.hubNow && !this.climb && !!roomAt(C, this.deckNow, walker.pos.x, walker.pos.z)?.float;
    if (walking) walker.frame(f, dt, { canMove: !this.G.fading && !routine.billOpen && !this.ride && !this.swing && !this.climb });
    if (walking && !walker.float) {
      walker.floater?.idle(dt); // where there is weight the suit's puffer tops up
      // Floated into a room with weight (or off a ladder): your feet back on its deck.
      if (!this.drumNow && !this.hubNow && !this.climb && !this.catwalk && !this.ride && !this.swing) {
        const fy = C.decks.get(this.deckNow).floorY;
        if (Math.abs(walker.pos.y - fy) > 1e-3) walker.pos.y += (fy - walker.pos.y) * Math.min(1, dt * 5);
        else walker.pos.y = fy;
      }
    }
    if (walking && this.drumNow && !this.ride && !this.climb) this.drumStep();
    if (this.hubNow) walker.pos.x = wrap(this.hubNow.hub, walker.pos.x);
    if (this.ride) this.rideFrame(dt);
    if (this.climb) this.climbFrame(dt);
    if (this.catwalk && walking && !this.climb) this.catwalkFrame();
  }

  /** What the main drive's push (m/s², drive.mjs) does to you, and walking round a drum or a hub ring, spinward you are
   *  heavier and antispinward lighter (2ωv against the spin's ω²r): a nudge. */
  feel(push, dt) {
    const { C, walker, SPIN, mode } = this.G, walking = mode() === 'walk';
    // The push carries you aft along the floor: walking toward the bow is slower, floating you go aft until you hold on.
    walker.shove.set(0, 0, SPIN && walking ? push : 0);
    if (SPIN && walking && this.hubNow && dt > 0) {
      // In the hub ring Coriolis is strong (2ωv against a tenth of a g): spinward you are much heavier.
      const hub = this.hubNow.hub, vx = this.lastX?.hub === hub ? (walker.pos.x - this.lastX.x) / dt : 0;
      walker.heavy = 0.35 * (1 + Math.max(-0.6, Math.min(0.6, (2 * vx * hub.dir) / (hub.omega * hub.R))));
    } else if (SPIN && walking && this.drumNow && !this.ride && dt > 0) {
      const { dk, h } = drumDeck(C, this.drumNow.hid, this.drumNow.did), omega = (h.rpm * 2 * Math.PI) / 60;
      const vx = this.lastX?.seg === this.drumNow.seg ? (walker.pos.x - this.lastX.x) / dt : 0;
      walker.heavy = 1 + Math.max(-0.2, Math.min(0.2, (2 * vx * h.dir) / (omega * dk.floorR)));
    } else walker.heavy = 1;
    this.lastX = this.drumNow ? { x: walker.pos.x, seg: this.drumNow.seg } : this.hubNow ? { x: walker.pos.x, hub: this.hubNow.hub } : null;
  }

  /** The camera and the HUD's line, walking. `drive`: drive.mjs (its push, and the first carrier's burn tilt). */
  frame(dt, drive) {
    const { C, L, camera, walker, hud, SPIN } = this.G, fading = this.G.fading, push = drive.push;
    const { swing, hubNow, drumNow, ride, climb } = this;
    if (swing) {
      this.swingFrame(dt);
      hud.where(this.swing ? (this.swing.kind === 'catch' ? `Catching the ${this.swing.hub.h.name.toLowerCase()}'s hub ring` : 'Pushing off up into the spine') : '');
      hud.use(null);
    } else if (hubNow) {
      hud.float(false);
      const hub = hubNow.hub, eyeH = walker.eye(_v).y - walker.pos.y;
      drumCamera(camera, hubPlace(hub, walker.pos.x), 0, walker.pos.y, walker.pos.z, eyeH, 0, walker.quat(_q));
      const tilt = Math.min(0.5, Math.atan(push / (hub.g * 9.81)));
      if (tilt > 0.002) camera.quaternion.premultiply(_q.setFromAxisAngle(_v.set(1, 0, 0).applyQuaternion(hub.you.getWorldQuaternion(_q2)), -tilt));
      hud.where(`${hub.h.name}, hub ring · ${hub.g.toFixed(2)} g · the floor turns round the spine at ${(hub.omega * hub.R).toFixed(1)} m/s${push > 0.3 ? ' · drive burning: down leans hard aft' : ''}`);
      const u = fading ? null : walker.nearestUse();
      hud.use(u ?? (fading ? null : { key: 'E', label: 'Push off up through the seal into the spine' }));
    } else if (drumNow) {
      hud.float(false);
      const { dk, h } = drumDeck(C, drumNow.hid, drumNow.did);
      if (ride) drumCamera(camera, drumNow.g, ride.spot.lift.x, -ride.r, ride.spot.lift.z, 1.6, ride.lean, walker.quat(_q));
      else placeInDrum(C, camera, walker, drumNow);
      // Under the main drive, down leans aft by atan(drive / spin g): about 8° on a deck at full drive, far more in a
      // lift near the hub, where the spin's pull is weak. The deck seems to slope up toward the bow.
      const gs = 9.81 * (ride ? (ride.omega * ride.omega * ride.r) / 9.81 : dk.g);
      const tilt = Math.min(0.5, Math.atan(push / Math.max(0.5, gs)));
      if (tilt > 0.002) camera.quaternion.premultiply(_q.setFromAxisAngle(_v.set(1, 0, 0).applyQuaternion(drumNow.g.getWorldQuaternion(_q2)), -tilt));
      const r = drumRoomAt(C, drumNow.hid, drumNow.did, drumNow.seg, walker.pos.x, walker.pos.z);
      const g = ride ? (ride.omega * ride.omega * ride.r) / 9.81 : dk.g;
      hud.where(climb
        ? `Climbing the ladder ${climb.y1 > climb.y0 ? 'up' : 'down'} to the ${drumDeck(C, climb.a.half, climb.a.deck).dk.name.toLowerCase()}`
        : ride
        ? `In a lift, ${ride.dir === 'down' ? 'down to' : 'up from'} the ${h.name.toLowerCase()}, ${dk.name.toLowerCase()} · ${Math.round(ride.r)} m from the axis · ${g.toFixed(2)} g${Math.abs(ride.lean) > 0.05 ? ' · the car leans on its rails' : ''}`
        : `${h.name}, ${dk.name.toLowerCase()} · ${r.system === 'corridor' ? 'ring corridor' : r.name} · segment ${drumNow.seg} of ${L.drum.sides} · ${g.toFixed(2)} g${push > 0.3 ? ` · drive burning: down leans ${Math.round((tilt * 180) / Math.PI)}° aft` : ''}`);
      hud.use(fading || ride || climb ? null : walker.nearestUse());
      drumNow.I.tick(dt);
    } else {
      walker.placeCamera(camera, C.frame);
      // Under the main drive the plating holds you to the deck, but the push still comes through it: what you feel as
      // down leans toward the stern, so the decks seem to slope up toward the bow (the first carrier, whose decks have a
      // weight of their own in the game). The spin-drum carrier's fixed hull is weightless: grip shoes hold your feet
      // and the push is the only weight there is, so you brace into it, a lean of a few degrees, not a slope.
      const lean = SPIN ? drive.burnTilt * 0.35 : drive.burnTilt;
      if (lean > 0.002) camera.quaternion.premultiply(_q.setFromAxisAngle(_v.set(1, 0, 0).applyQuaternion(C.obj.quaternion), -lean));
      const I = C.decks.get(this.deckNow);
      const r = roomAt(C, this.deckNow, walker.pos.x, walker.pos.z);
      if (climb?.kind === 'rungs') hud.where(`Climbing the rungs ${climb.up ? 'up to the catwalk' : 'down to the hangar floor'}`);
      else if (climb?.kind === 'fixed') hud.where(`Climbing ${climb.y1 > climb.y0 ? 'up' : 'down'} to the ${C.decks.get(climb.to.deck).deck.name.toLowerCase()}${SPIN ? ', hand over hand' : ''}`);
      else hud.where(`${I.deck.name}${r ? ' · ' + r.name : ''}${this.catwalk ? ', on the catwalk' : ''}${walker.float && walker.floater ? ' · ' + walker.floater.status(walker) : ''} · frame ${frameOf(L, walker.pos.z)}, ${sideOf(walker.pos.x)}${push > 0.3 ? ` · drive burning, ${(push / 9.81).toFixed(2)} g aft${walker.float && !walker.floater?.held ? ': take hold (Space)' : ''}` : ''}`);
      hud.float(walker.float);
      // Weightless, with nothing to use (E) in front of you, the prompt says how to move.
      hud.use(fading || climb ? null : walker.nearestUse() ?? (walker.float ? walker.floater?.prompt() : null));
      C.decks.get(this.deckNow).tick(dt);
    }
  }

  /** The lights to pool this frame besides the fixed decks shown: the drum segments round you, the hub ring, a
   *  ladder's trunk. */
  lit() {
    const out = [];
    if (this.G.mode() === 'walk' && this.drumNow) out.push(...this.G.C.drums.shown);
    if (this.G.mode() === 'walk' && (this.hubNow || this.swing)) out.push((this.hubNow?.hub ?? this.swing.hub).lit);
    if (this.climb?.lit) out.push(this.climb.lit);
    return out;
  }
}
