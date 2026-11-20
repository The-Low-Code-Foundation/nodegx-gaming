// The off-watch hands in the drums (the spin-drum carrier), from the routine's `drum` entry (ships/carrier.watches.json):
// people eating in the messes at meal hours, cooking in the galley, training in the gym, at the workshop benches, in the
// wardrooms, a few awake in the berths, and some walking the ring corridor. At the change of watch they wait at the
// spoke lifts and ride with you; at action stations they go up the spokes and the drum empties.
//
// Only the segments round you are populated (drum.mjs `drumWindow` shows two either side), and a room changes only out
// of your sight: never while you stand in it, nor while you can see into it through its doorway. Each room's people
// are dealt from its id and the half hour, so a room looks the same when you come back. The cast is the six people in
// assets/people (crew.mjs), in their department's uniform; their skinned meshes are drawn whether you look at them or
// not, so `max` keeps the number drawn at once small.

import * as THREE from 'three';
import { crewMember, removeCrew } from './crew.mjs';
import { drumDeck, drumSpots, freeSpots, segment, ringId, deckKey } from './drum.mjs';
import { hm } from './watch.mjs';

const DAY = 86400;
const HALF = 1800;
const inHours = (s, [a, b]) => (a <= b ? s >= a && s < b : s >= a || s < b);
const hashOf = (str) => [...str].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const _w = new THREE.Vector3();

export class Hands {
  /** `D` the routine's `drum` entry. `ctx`: `routine` (the clock), `ship` (integrity: action stations), `sfx`, `camera`. */
  constructor(C, D, { routine, ship, sfx, camera }) {
    Object.assign(this, { C, D, routine, ship, sfx, camera });
    this.crew = []; // the live crew members, for tickCrew
    this.figs = new Set(); // { m, I, seg, room, kind ('room' | 'ring' | 'wait' | 'ride' | 'out'), key, goal, gv }
    this.rooms = new Map(); // room id → { key, figs }
    this.pool = [];
    this.check = 0;
    this.carT = 0;
    this.stationsAt = null; // ship time action stations was called
    this.rows = (r) => D.rooms?.[r.id] ?? D.uses[r.use];
  }

  // --- the clock ---

  row(rows) {
    const s = this.routine.t % DAY;
    return rows?.find((w) => inHours(s, w.hours.map(hm)));
  }

  /** Within the change of watch: `before` minutes before a watch ends to `after` minutes after the next begins.
   *  'before' or 'after', or null. */
  changing() {
    const R = this.routine, w = R.watchAt(), K = this.D.change;
    if (!K) return null;
    if (R.t >= w.end - K.before * 60) return 'before';
    if (R.t < w.start + K.after * 60) return 'after';
    return null;
  }

  // --- each frame ---

  /** `you`: { mode, drum (main.mjs `drumNow`, or null), ride, room, x, z }. */
  frame(dt, you) {
    this.you = you;
    const stations = !!this.ship?.stations;
    if (stations && this.stationsAt == null) this.callStations();
    if (!stations) this.stationsAt = null;
    if (!you.drum || you.mode !== 'walk') {
      if (this.figs.size) this.clear();
      return;
    }
    for (const f of [...this.figs]) this.move(f, dt);
    if ((this.check -= dt) > 0) return;
    this.check = 0.5;
    if (this.camera) {
      // Where the camera looks now (its matrices are otherwise only brought up to date by a render).
      this.camera.updateMatrixWorld();
      this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    }
    this.populate();
    this.lifts(0.5);
  }

  /** Takes everyone off: you have left the drum. */
  clear() {
    for (const f of [...this.figs]) this.drop(f);
    this.rooms.clear();
  }

  // --- who is where ---

  /** Fills the rooms and the corridor round you, as the time asks, wherever you cannot see. */
  populate() {
    const C = this.C, you = this.you, here = you.drum, shown = C.drums.shown;
    const stations = this.stationsAt != null;
    // Rooms in segments no longer drawn lose their people.
    for (const [id, st] of this.rooms) if (!st.I.group.parent?.visible) {
      for (const f of st.figs) this.drop(f);
      this.rooms.delete(id);
    }
    for (const f of [...this.figs]) if (!f.I.group.parent?.visible && f.kind !== 'ride') this.drop(f);
    // Nearest rooms first, so the people you are about to see are the ones drawn.
    const list = [];
    for (const I of shown) for (const r of this.roomsOf(I)) list.push({ I, r, d: Math.abs(this.arc(I, (r.x[0] + r.x[1]) / 2, here, you.x)) });
    list.sort((a, b) => a.d - b.d);
    // The rooms share what the corridor and the lift queue leave: `ring` walkers' most, and at the change of watch the
    // queue too.
    const reserve = Math.max(...this.D.ring.map((w) => w.n[1])) + (this.changing() === 'before' ? this.D.change?.waiting ?? 0 : 0);
    let budget = this.D.max - reserve;
    for (const { I, r } of list) {
      const st = this.rooms.get(r.id);
      const want = this.want(I, r, stations);
      if (st && st.key === want.key) {
        budget -= st.figs.length;
        continue;
      }
      if (this.roomSeen(I, r.id)) {
        // In sight: it stays as it is (empty, if nobody was put there before you came).
        if (st) budget -= st.figs.length;
        continue;
      }
      if (st) for (const f of st.figs) stations && f.m && this.seenAt(f.I, r.id, f.m.root.position.x, f.m.root.position.z) ? this.evacuate(f) : this.drop(f);
      const figs = [];
      for (const s of want.list) {
        if (budget <= 0) break;
        budget--;
        figs.push(this.spawn(I, s.room, s, 'room'));
      }
      // Short of the budget: try again next time (the key is not kept).
      this.rooms.set(r.id, { key: figs.length === want.list.length ? want.key : null, figs, I });
    }
    // Over (rooms kept as they were while you could see them): the farthest you cannot see give theirs up.
    for (let i = list.length - 1; i >= 0 && budget < 0; i--) {
      const st = this.rooms.get(list[i].r.id);
      if (!st?.figs.length || this.roomSeen(list[i].I, list[i].r.id)) continue;
      budget += st.figs.length;
      for (const f of [...st.figs]) this.drop(f);
      st.key = null;
    }
    this.ring(this.D.max - [...this.figs].length);
  }

  /** The drum rooms in segment Interior `I`. */
  roomsOf(I) {
    return (I.droom ??= this.C.L.drum.rooms.filter((r) => r.half === I.half && r.deck === I.did && r.seg === I.seg));
  }

  /** Who room `r` (in segment `I`) should have in it now: { key, list: [{ room, x, z, yaw, pose, k, dept }] }. */
  want(I, r, stations) {
    const slot = Math.floor(this.routine.t / HALF);
    const stay = this.D.stations?.stay ?? [];
    const row = stations && !stay.includes(r.use) ? null : this.row(this.rows(r));
    const key = `${slot}|${stations && !stay.includes(r.use)}|${row ? this.rows(r).indexOf(row) : -1}`;
    if (!row) return { key, list: [] };
    const rnd = rng(hashOf(`${r.id}|${slot}`));
    const n = row.n[0] + Math.floor(rnd() * (row.n[1] - row.n[0] + 1));
    const mine = (I.spots ?? []).filter((s) => s.room === r.id);
    const pools = { sitChair: mine.filter((s) => s.pose === 'sitChair'), workTable: mine.filter((s) => s.pose === 'workTable'), stand: freeSpots(I, r) };
    const used = [], list = [];
    const clear = (s) => used.every((u) => Math.hypot(u.x - s.x, u.z - s.z) > 0.9);
    for (let i = 0; i < n; i++) {
      const pose = pick(rnd, row.poses);
      const from = pools[pose]?.filter(clear).length ? pools[pose] : pools.stand;
      const free = from.filter(clear);
      if (!free.length) break;
      const s = pick(rnd, free);
      used.push(s);
      const standing = from === pools.stand;
      list.push({ room: r.id, x: s.x, z: s.z, yaw: s.yaw + (standing ? (rnd() - 0.5) * 1.2 : 0), pose: standing ? (pose === 'sitChair' || pose === 'workTable' ? 'idle' : pose) : s.pose, k: Math.floor(rnd() * 6), dept: pick(rnd, row.depts ?? ['crew']) });
    }
    return { key, list };
  }

  /** The hands walking the ring corridor, up to the routine's count (and inside the budget): new ones come in at the
   *  window's edges, out of sight. */
  ring(budget) {
    const here = this.you.drum, C = this.C, ringRow = this.row(this.D.ring), stations = this.stationsAt != null;
    const walkers = [...this.figs].filter((f) => f.kind === 'ring' && f.I.half === here.hid && f.I.did === here.did);
    let want = ringRow ? ringRow.n[0] + Math.floor(rng(hashOf(`ring|${Math.floor(this.routine.t / HALF)}`))() * (ringRow.n[1] - ringRow.n[0] + 1)) : 0;
    // At action stations the corridor fills with hands going up, until the drum is empty.
    if (stations) want = this.routine.t - this.stationsAt < (this.D.stations?.empty ?? 60) * this.routine.rate ? 3 : 0;
    const { hw } = drumDeck(C, here.hid, here.did);
    const h = C.L.drum.halves.find((x) => x.id === here.hid), cz = (h.corridor[0] + h.corridor[1]) / 2;
    for (let i = walkers.length; i < want && budget > 0; i++) {
      const side = Math.random() < 0.5 ? -1 : 1, seg = here.seg + side * 2, x = (Math.random() - 0.5) * 2 * (hw - 0.5);
      const I = segment(C, here.hid, here.did, seg).I;
      const room = ringId(here.hid, here.did);
      if (this.seenAt(I, room, x, cz)) continue;
      const dir = -side; // walking toward you, round the ring
      const f = this.spawn(I, room, { x, z: cz + dir * 0.6, yaw: dir > 0 ? -Math.PI / 2 : Math.PI / 2, pose: 'walk', k: Math.floor(Math.random() * 6), dept: pick(Math.random, ['crew', 'crew', 'engineering', 'flight']) }, 'ring');
      f.goal = stations || this.changing() === 'before' ? this.liftGoal(I, x, dir) : { seg: I.seg + dir * 6, x: 0, z: cz + dir * 0.6 };
      if (stations) f.hurry = 1.5;
      budget--;
    }
  }

  // --- moving ---

  /** Each frame for one figure: walking round the ring from one segment's frame into the next, and what happens at
   *  the end of a walk. */
  move(f, dt) {
    const m = f.m;
    if (!m || !f.goal) return;
    const { hw } = drumDeck(this.C, f.I.half, f.I.did);
    const x = m.root.position.x;
    if (Math.abs(x) > hw) {
      // Over the floor's edge: into the next segment's frame, if it is drawn; otherwise gone round the curve.
      const k = x > hw ? 1 : -1, next = this.C.drums.built.get(`${f.I.half}|${f.I.did}|${(((f.I.seg + k) % 40) + 40) % 40}`);
      if (!next?.g.visible) return this.drop(f);
      next.I.group.add(m.root);
      m.root.position.x -= k * 2 * hw;
      for (const p of m.route ?? []) p.x -= k * 2 * hw;
      f.I = next.I;
      f.seg = next.I.seg;
    }
    this.aim(f);
    if (m.arrived && !f.there) {
      f.there = true;
      if (f.kind === 'out') {
        // Out of the room: on round the ring to the lift.
        f.kind = 'ring';
        f.goal = this.liftGoal(f.I, m.root.position.x);
        f.there = false;
        m.arrived = false;
        m.play('walk');
        this.aim(f, true);
      } else if (f.goal.lift) {
        // At the lift doors: wait for the car.
        f.kind = 'wait';
        m.root.rotation.y = 0; // facing the doors
      } else this.drop(f); // walked on round the ring, out of the window
    }
  }

  /** Points a walking figure at its goal, in the segment frame it is in now. */
  aim(f, fresh = false) {
    const m = f.m, { hw, S } = drumDeck(this.C, f.I.half, f.I.did);
    let ds = (((f.goal.seg - f.I.seg) % S) + S) % S;
    if (ds > S / 2) ds -= S;
    const gx = f.goal.x + ds * 2 * hw;
    if (!f.gv || fresh) {
      f.gv = new THREE.Vector3(gx, f.I.floorY, f.goal.z);
      m.route = [m.root.position.clone(), f.gv];
      m.leg = 1;
      m.once = true;
      m.arrived = false;
    } else f.gv.set(gx, f.I.floorY, f.goal.z);
  }

  /** The spoke lift nearest (x in segment I), as a walking goal: a spot at its doors. `dir` 0 means either way. */
  liftGoal(I, x, dir = 0) {
    const C = this.C, { hw, S } = drumDeck(C, I.half, I.did), spokes = C.L.drum.spokes.segments, s = drumSpots(C, I.half);
    let best = null;
    for (const k of spokes) {
      let ds = (((k - I.seg) % S) + S) % S;
      if (ds > S / 2) ds -= S;
      const d = ds * 2 * hw + s.landing.x - x;
      if (dir && Math.sign(d) !== dir && Math.abs(d) > 1) continue;
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { d, seg: k };
    }
    return this.liftSpot(I.half, best.seg);
  }

  /** The first free place to wait at the lift in segment `seg`: in a line across its doors (the ring corridor is only
   *  3 m wide, so there is no second row). */
  liftSpot(hid, seg) {
    const s = drumSpots(this.C, hid), taken = new Set([...this.figs].filter((f) => f.goal?.lift && f.goal.seg === seg).map((f) => f.goal.slot));
    let n = 0;
    while (taken.has(n)) n++;
    return { seg, slot: n, x: s.landing.x + [-0.7, 0.7, -1.5, 1.5, 2.3, -2.3][n % 6], z: s.landing.z + 0.15, lift: true };
  }

  /** A figure in a room gets up and goes: out through the doorway, then round the ring to the nearest lift. */
  evacuate(f) {
    const m = f.m, r = this.C.rooms.get(f.room);
    if (!m || !r) return this.drop(f);
    const fore = r.row !== 'aft', cx = (r.x[0] + r.x[1]) / 2, dz = fore ? r.z[1] : r.z[0];
    const h = this.C.L.drum.halves.find((x) => x.id === f.I.half), cz = (h.corridor[0] + h.corridor[1]) / 2;
    const y = f.I.floorY, p = m.root.position;
    m.route = [p.clone(), new THREE.Vector3(cx, y, p.z), new THREE.Vector3(cx, y, dz + (fore ? -0.8 : 0.8)), new THREE.Vector3(cx, y, cz)];
    m.leg = 1;
    m.once = true;
    m.arrived = false;
    m.hurry = 1.4;
    m.play('walk');
    f.kind = 'out';
    f.goal = { seg: f.I.seg, x: cx, z: cz };
    f.gv = m.route[3];
    const st = this.rooms.get(f.room);
    if (st) st.figs = st.figs.filter((g) => g !== f);
  }

  /** Action stations: whoever you can see gets up and goes for the lifts; the rest are simply gone. */
  callStations() {
    this.stationsAt = this.routine.t;
    if (!this.you?.drum) return;
    const stay = this.D.stations?.stay ?? [];
    for (const f of [...this.figs]) {
      if (f.kind !== 'room' || stay.includes(this.C.rooms.get(f.room)?.use)) continue;
      if (f.m && this.seenAt(f.I, f.room, f.m.root.position.x, f.m.root.position.z)) this.evacuate(f);
      else this.drop(f);
    }
    for (const f of this.figs) if (f.kind === 'ring' && f.m) (f.goal = this.liftGoal(f.I, f.m.root.position.x)), (f.m.hurry = 1.5), this.aim(f, true);
    for (const id of [...this.rooms.keys()]) if (!stay.includes(this.C.rooms.get(id)?.use)) this.rooms.delete(id);
  }

  // --- the lifts ---

  /** At the change of watch (and at action stations) hands wait at the spoke lifts; a car comes every so often, takes
   *  those waiting and lets others out. */
  lifts(dt) {
    const C = this.C, you = this.you, here = you.drum, K = this.D.change, ch = this.changing(), stations = this.stationsAt != null;
    if (!K) return;
    const s = drumSpots(C, here.hid);
    // Waiting at the doors before the change: placed out of sight, up to `waiting` a lift.
    if (ch === 'before' && !stations) for (const I of C.drums.shown) {
      if (!C.L.drum.spokes.segments.includes(I.seg)) continue;
      const at = [...this.figs].filter((f) => f.goal?.lift && f.goal.seg === I.seg).length;
      const room = ringId(I.half, I.did);
      for (let i = at; i < K.waiting; i++) {
        const g = this.liftSpot(I.half, I.seg);
        if (this.seenAt(I, room, g.x, g.z) || this.figs.size >= this.D.max) break;
        const f = this.spawn(I, room, { x: g.x, z: g.z, yaw: 0, pose: 'idle', k: Math.floor(Math.random() * 6), dept: pick(Math.random, ['crew', 'engineering', 'flight']) }, 'wait');
        f.goal = g;
      }
    }
    // The car: not before the watch changes; then (or at action stations) every 20 s or so at each lift with someone
    // waiting, the first a moment after the change.
    if (ch !== this.lastCh && ch === 'after') this.carT = 1 + Math.random() * 2;
    this.lastCh = ch;
    if (ch === 'before' && !stations) return;
    if ((this.carT -= dt) > 0) return;
    this.carT = 18 + Math.random() * 8;
    for (const I of C.drums.shown) {
      if (!C.L.drum.spokes.segments.includes(I.seg)) continue;
      const waiting = [...this.figs].filter((f) => f.kind === 'wait' && f.I === I);
      const off = ch === 'after' && !stations ? 1 + Math.floor(Math.random() * 2) : 0; // the watch coming off, down
      if (!waiting.length && !off) continue;
      const near = Math.abs(this.arc(I, s.lift.x, here, you.x)) < 14;
      if (near) this.sfx?.cue('servo', { dur: 1.2, vol: 0.5 });
      for (const f of waiting) this.drop(f);
      for (let i = 0; i < off && this.figs.size < this.D.max; i++) {
        const dir = Math.random() < 0.5 ? -1 : 1, room = ringId(I.half, I.did);
        const h = C.L.drum.halves.find((x) => x.id === I.half), cz = (h.corridor[0] + h.corridor[1]) / 2;
        const f = this.spawn(I, room, { x: s.lift.x - 0.5 + i, z: s.landing.z, yaw: dir > 0 ? -Math.PI / 2 : Math.PI / 2, pose: 'walk', k: Math.floor(Math.random() * 6), dept: 'crew' }, 'ring');
        f.goal = { seg: I.seg + dir * 6, x: 0, z: cz + dir * 0.6 };
      }
    }
  }

  /** You step into a lift car at the change of watch (or at action stations): one or two ride with you. */
  boardRide(ride) {
    const K = this.D.change;
    if (!K || !(this.changing() || this.stationsAt != null)) return;
    const n = K.riders[0] + Math.floor(Math.random() * (K.riders[1] - K.riders[0] + 1));
    ride.riders = [];
    for (let i = 0; i < n; i++) {
      const f = { I: ride.I, seg: ride.I.seg, room: ringId(ride.I.half, ride.I.did), kind: 'ride', m: null };
      this.figs.add(f);
      ride.riders.push(f);
      this.get(Math.floor(Math.random() * 6), pick(Math.random, ['crew', 'engineering', 'flight'])).then((m) => {
        if (!this.figs.has(f) || !ride.car.parent) return this.release(m);
        f.m = m;
        m.root.position.set(i ? 0.6 : -0.6, 0, -0.35);
        m.root.rotation.y = Math.PI; // facing the doors, with you
        m.deck = ride.I.deck.id;
        ride.car.add(m.root);
        m.route = null;
        m.play('idle');
        this.crew.push(m);
      }, () => this.figs.delete(f));
    }
  }

  /** The ride is over: down, the riders step out and walk off round the ring; up, they go on past you. */
  endRide(ride, I, landing) {
    for (const f of ride.riders ?? []) {
      if (ride.dir !== 'down' || !f.m) {
        this.drop(f);
        continue;
      }
      const m = f.m, dir = m.root.position.x < 0 ? -1 : 1;
      I.group.add(m.root);
      m.root.position.set(landing.x + dir * 0.6, I.floorY, landing.z + 0.3);
      const h = this.C.L.drum.halves.find((x) => x.id === I.half), cz = (h.corridor[0] + h.corridor[1]) / 2;
      Object.assign(f, { I, seg: I.seg, kind: 'ring', goal: { seg: I.seg + dir * 6, x: 0, z: cz + dir * 0.6 }, gv: null });
      m.play('walk');
    }
  }

  // --- what you can see ---

  /** Arc length round the ring from you (`here`, at x) to (x2 in segment I): + spinward of you. */
  arc(I, x2, here, x) {
    const { hw, S } = drumDeck(this.C, I.half, I.did);
    let ds = (((I.seg - here.seg) % S) + S) % S;
    if (ds > S / 2) ds -= S;
    return ds * 2 * hw + x2 - x;
  }

  /** Whether you could see someone standing at (x, z) in `room`, segment Interior `I`: never from another deck or out
   *  of the drum; always in the room you are in; into a room only through its doorway; along the corridor, what is in
   *  front of you and in reach round the curve. */
  seenAt(I, room, x, z) {
    const you = this.you, here = you?.drum;
    if (!here || you.mode !== 'walk' || you.ride) return false;
    if (I.half !== here.hid || I.did !== here.did) return false;
    const ring = ringId(I.half, I.did), mine = you.room ?? ring;
    if (room === mine && room !== ring) return true;
    const door = (id) => {
      const r = this.C.rooms.get(id);
      return { I: r.seg === I.seg ? I : segment(this.C, r.half, r.ring, r.seg).I, x: (r.x[0] + r.x[1]) / 2 };
    };
    if (room !== ring && mine !== ring) return false; // two rooms: walls between
    if (room !== ring) {
      // You in the corridor, they in a room: seen through its doorway when you are near it.
      const d = door(room);
      if (Math.abs(this.arc(d.I, d.x, here, you.x)) > 7) return false;
    } else if (mine !== ring) {
      // You in a room, they in the corridor: only near your doorway.
      const d = door(mine);
      if (Math.abs(this.arc(I, x, here, 0) - this.arc(d.I, d.x, here, 0)) > 6) return false;
    } else if (Math.abs(this.arc(I, x, here, you.x)) > 30) return false;
    // In front of you?
    if (!this.camera) return true;
    // In the camera's own space (its depth buffer may be reversed, so not through the projection): ahead, and inside
    // the field of view with a margin.
    const cam = this.camera;
    I.group.localToWorld(_w.set(x, I.floorY + 1.1, z)).applyMatrix4(cam.matrixWorldInverse);
    if (_w.z > -0.3) return false;
    const ty = Math.tan(((cam.fov * Math.PI) / 180) * 0.5) * 1.25, tx = ty * cam.aspect;
    return Math.abs(_w.x) < -_w.z * tx + 0.6 && Math.abs(_w.y) < -_w.z * ty + 0.6;
  }

  roomSeen(I, room) {
    const you = this.you;
    if (you?.drum && you.room === room) return true;
    const r = this.C.rooms.get(room);
    return this.seenAt(I, room, (r.x[0] + r.x[1]) / 2, (r.z[0] + r.z[1]) / 2);
  }

  // --- the people ---

  /** A figure at `s` ({ x, z, yaw, pose, k, dept }) in segment Interior `I`, loading in the background. */
  spawn(I, room, s, kind) {
    const f = { I, seg: I.seg, room, kind, m: null, hurry: 1 };
    this.figs.add(f);
    this.get(s.k, s.dept).then((m) => {
      if (!this.figs.has(f)) return this.release(m);
      f.m = m;
      m.root.position.set(s.x, f.I.floorY, s.z);
      m.root.rotation.y = s.yaw ?? 0;
      m.deck = deckKey(I.half, I.did);
      m.route = null;
      m.arrived = false;
      m.hurry = f.hurry;
      f.I.group.add(m.root);
      m.play(s.pose);
      if (f.goal) this.aim(f, true);
      this.crew.push(m);
    }, () => this.figs.delete(f));
    return f;
  }

  drop(f) {
    this.figs.delete(f);
    if (f.m) this.release(f.m);
    f.m = null;
    const st = this.rooms.get(f.room);
    if (st) st.figs = st.figs.filter((g) => g !== f);
  }

  /** A crew member from the pool (the same person in the same uniform), or a new one. */
  get(k, dept) {
    const i = this.pool.findIndex((m) => m.k === k && m.dept === dept);
    if (i >= 0) return Promise.resolve(this.pool.splice(i, 1)[0]);
    return crewMember(k, dept).then((m) => {
      m.k = k;
      if (this.C.clipPlanes) m.root.traverse((o) => o.material && [o.material].flat().forEach((x) => (x.clippingPlanes = this.C.clipPlanes)));
      return m;
    });
  }

  release(m) {
    removeCrew(m);
    Object.assign(m, { route: null, once: false, arrived: false, hurry: 1 });
    const i = this.crew.indexOf(m);
    if (i >= 0) this.crew.splice(i, 1);
    if (this.pool.length < 14) this.pool.push(m);
  }

  /** For the console: how many are drawn, and where. */
  info() {
    const by = {};
    for (const f of this.figs) by[f.kind] = (by[f.kind] ?? 0) + 1;
    return { drawn: this.crew.length, figs: this.figs.size, by, pool: this.pool.length, rooms: [...this.rooms].map(([id, st]) => `${id}:${st.figs.length}`).join(' '), change: this.changing(), stations: this.stationsAt != null };
  }
}
