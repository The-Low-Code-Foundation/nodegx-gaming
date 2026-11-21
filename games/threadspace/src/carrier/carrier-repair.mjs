// Mending the carrier (design/ROADMAP.md phase 9, session 4): every hurt part (carrier-damage.mjs) and every hole in
// her (integrity.mjs) is a job, done in order of what matters most (`order`: a leaking tank first, then holes into rooms
// with air, a jammed bay door, the thrusters…), by whoever does that kind of job:
//
//   Drones (`integrity.drones.count` of them, racked in the repair drone bay, none while the bay is wrecked): everything
//   on her skin. Each flies out of the bay's hatch (`drones.exit`), clear of her round an ellipse that holds her hull
//   and her spread radiators (`route`), along her and in to a point `standoff` off the work, Newtonian on a braking
//   profile with capped thrust (`fly`), and plates and welds it. The holes in her skin, a radiator, a thruster
//   cluster, a gun mount.
//   Damage control parties (`parties.count`, from the damage control centre): what is inside. A jammed bay door (from
//   the hangar), a turret's mechanism (from its hoist trunk), a drum's bearing (from the spine), a hole between two
//   compartments. They are timed: `setup` and their way's length at `speed`; when they get there you see them, suited,
//   in foot restraints at the work, the sparks of their tools.
//
// You can do any inside job yourself: E there (hold it) with the tool kit (`help`: a party is 1), alone before the
// party gets there or with them. A hole into a room you plate as before (integrity.mjs); the party does it if you don't.
//
// A part comes back as the work goes (its health rises toward whole at the rate that finishes it on time, so a thruster
// cluster pushes harder as it is welded); a hit while it is being mended adds to the work. Timing and the drones'
// flight are seeded physics; what you see (sparks, the arc, the crew's clips) is Math.random with its own scratch.

import * as THREE from 'three';
import { weldTick, zapTick } from './hitfx.mjs';
import { droneMesh } from './fighter-repair.mjs';
import { skinNormal } from './carrier-damage.mjs';
import { crewMember, removeCrew } from './crew.mjs';
import { floatIn, footRestraint } from './floating.mjs';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// Physics scratch.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
// Looks scratch: never handed on.
const _vp = new THREE.Vector3(), _vn = new THREE.Vector3(), _vq = new THREE.Vector3(), _vh = new THREE.Vector3();
const R = Math.random;

/** What a job is called on the board. */
const WHAT = { tank: 'Tank holed', breach: 'Hull breach', hole: 'Hull hole', inside: 'Bulkhead holed', radiator: 'Radiator', rcs: 'Thrusters', turret: 'Turret', pdc: 'Gun mount', door: 'Bay door', bearing: 'Drum bearing' };

export class HullRepair {
  /** `G` the game in hand (main.mjs): `C`, `ship`, `parts` (carrier-damage.mjs), `plant`, `dc`, `sfx`; `crew` false
   *  leaves the parties unseen (?crew=0: the work and its timing go on without them). */
  constructor(G, { crew = true } = {}) {
    this.G = G;
    const C = (this.C = G.C), L = C.L;
    this.P = L.integrity.parts;
    this.D = L.integrity.drones;
    this.ship = G.ship;
    this.parts = G.parts;
    this.time = 0;
    this.tasks = [];
    this.log = []; // what was done: { what, by, t, took } (tests and the console)
    this.showCrew = crew;
    this.crew = []; // the parties' people, for tickCrew (main.mjs)
    const floor = Object.fromEntries(L.decks.map((d) => [d.id, d.floor]));
    this.floor = floor;
    // The drone bay and its hatch onto space.
    const bay = L.compartments.find((c) => c.id === this.D.from);
    const by = bay?.y ?? [0, 0];
    this.dock = bay ? new THREE.Vector3((bay.x[0] + bay.x[1]) / 2, (by[0] + by[1]) / 2, (bay.z[0] + bay.z[1]) / 2) : new THREE.Vector3();
    const Q = this.P.drones;
    this.exit = new THREE.Vector3(...Q.exit);
    this.out = new THREE.Vector3(...Q.out).normalize();
    this.group = new THREE.Group(); // on her frame: main.mjs gathers it into C.exterior
    this.group.name = 'hull-drones';
    C.frame.add(this.group);
    this.drones = Array.from({ length: this.D.count }, (_, i) => {
      const look = droneMesh();
      look.g.scale.setScalar(Q.scale);
      look.g.visible = false;
      this.group.add(look.g);
      return { i, pos: this.dock.clone(), vel: new THREE.Vector3(), state: 'docked', path: [], task: null, look, acc: {} };
    });
    // The parties: where they set out from.
    const dcr = C.rooms.get(this.P.parties.from);
    this.base = dcr ? new THREE.Vector3((dcr.x[0] + dcr.x[1]) / 2, floor[dcr.deck] ?? 0, (dcr.z[0] + dcr.z[1]) / 2) : new THREE.Vector3();
    this.parties = Array.from({ length: this.P.parties.count }, (_, i) => ({ i, task: null, people: [] }));
  }

  // --- the jobs (seeded) ------------------------------------------------------------------------------------------------

  /** A part has been hit again while its job is on: more work. */
  hurt(p, was) {
    const t = p.task;
    if (!t || t.phase === 'done') return;
    const K = this.P.kinds[p.kind], more = (K.per * Math.max(0, was - p.hp)) / p.max;
    t.T += more;
    t.left += more;
  }

  /** New jobs: every hurt part and every open hole that has none. */
  scan() {
    const K = this.P.kinds;
    for (const p of this.parts?.parts ?? []) {
      if (p.task || p.hp >= p.max - 0.5) continue;
      const k = K[p.kind], T = k.min + (k.per * (p.max - p.hp)) / p.max;
      this.add({ kind: p.kind, by: k.by, part: p, T, name: p.name });
    }
    const tanks = new Set(this.G.plant?.tanks.map((k) => k.id) ?? []);
    for (const h of this.ship.holes) {
      if (h.task || h.sealed) continue;
      const room = h.n.c, kind = h.to ? 'inside' : tanks.has(room.id) ? 'tank' : room.access === 'walk' && !room.vacuum ? 'breach' : 'hole';
      const T = this.D.seal * clamp(h.area / 0.1, 0.6, 4);
      const where = h.to && h.to.c.access === 'walk' ? h.to.c : room;
      this.add({ kind, by: h.to ? 'party' : 'drone', hole: h, T, name: `${WHAT[kind]}: ${where.name.toLowerCase()}` });
    }
  }

  add(t) {
    Object.assign(t, { left: t.T, phase: 'wait', worker: null, go: 0, helped: 0, t0: this.time, seq: this.tasks.length + this.log.length });
    if (t.part) t.part.task = t;
    if (t.hole) t.hole.task = t;
    if (t.by === 'party') this.spotFor(t);
    this.tasks.push(t);
    return t;
  }

  /** The order jobs are taken in: by kind (`order`), the worst hit first, then the oldest. */
  rank(t) {
    const i = this.P.order.indexOf(t.kind);
    const hurt = t.part ? 1 - t.part.hp / t.part.max : clamp((t.hole?.area ?? 0) / 0.5, 0, 1);
    return (i < 0 ? 99 : i) * 1000 - hurt * 100 + t.seq * 1e-3;
  }

  /** Free drones and parties take the waiting job that matters most. */
  assign() {
    const wait = this.tasks.filter((t) => t.phase === 'wait').sort((a, b) => this.rank(a) - this.rank(b));
    if (!wait.length) return;
    const n = this.ship.droneCount ?? this.D.count; // none while the drone bay is wrecked
    for (const d of this.drones) {
      if (d.task || d.i >= n) continue;
      const t = wait.find((x) => x.by === 'drone' && x.phase === 'wait');
      if (!t) break;
      this.send(d, t);
    }
    for (const q of this.parties) {
      if (q.task) continue;
      const t = wait.find((x) => x.by === 'party' && x.phase === 'wait');
      if (!t) break;
      this.sendParty(q, t);
    }
  }

  /** Every frame (main.mjs, after the guns): new jobs, the drones and the parties, the work, you helping, the looks. */
  frame(dt, f, walker, mode) {
    this.time += dt;
    this.scan();
    this.assign();
    for (const d of this.drones) this.fly(d, dt);
    const near = mode === 'walk' ? walker?.nearestUse?.() : null;
    const working = near?.repair && f?.keys?.has('KeyE') && this.G.dc?.carry.has(this.P.kit) ? near.repair : null;
    for (const t of this.tasks) {
      if (t.phase === 'done') continue;
      // Done another way: you plated the hole, or it was patched from the other side.
      if (t.hole?.sealed) {
        this.finish(t, t.hole.by === 'you' ? 'you' : null);
        continue;
      }
      if (t.phase === 'going' && t.by === 'party' && (t.go -= dt) <= 0) (t.go = 0), (t.phase = 'work'), this.arrived(t);
      const rate = (t.phase === 'work' ? 1 : 0) + (working === t ? this.P.help : 0);
      if (working === t) t.helped += dt;
      if (rate > 0) this.work(t, dt * rate);
    }
    this.tasks = this.tasks.filter((t) => t.phase !== 'done');
    this.looks(dt, mode, working);
  }

  /** `s` seconds of work on task `t`: a part's health climbs toward whole at the rate that gets it there on time. */
  work(t, s) {
    const p = t.part;
    if (p) p.hp = Math.min(p.max, p.hp + ((p.max - p.hp) * Math.min(s, t.left)) / Math.max(1e-6, t.left));
    t.left -= s;
    if (t.left <= 0) this.finish(t, t.phase === 'work' ? (t.helped > 0 ? 'both' : t.by) : 'you');
  }

  finish(t, by) {
    t.phase = 'done';
    const p = t.part, h = t.hole, w = t.worker;
    if (p) {
      p.hp = p.max;
      p.task = null;
      p.spots.length = 0;
    }
    if (h) {
      h.task = null;
      if (!h.sealed) this.ship.seal(h, 'drone');
      // A plate on her skin where a drone sealed a hole in it.
      if (!h.to && t.by === 'drone' && this.parts) {
        const at = h.hull ?? h.at;
        this.parts.plate(at, skinNormal(this.C.L, at, new THREE.Vector3()), 0.8 + Math.sqrt(h.area) * 2.2);
      }
    }
    if (w?.look) this.goHome(w);
    else if (w) this.partyHome(w);
    t.worker = null;
    this.log.push({ what: p?.id ?? t.kind, by: by ?? t.by, t: Math.round(this.time * 10) / 10, took: Math.round((this.time - t.t0) * 10) / 10 });
    if (p) {
      const who = by === 'you' ? 'You have' : by === 'both' ? 'You and the party have' : t.by === 'drone' ? 'Drones have' : 'The damage control party has';
      this.G.dc?.say(null, `${who} mended the ${p.name.replace(/^The /, '').toLowerCase()}.`, 0, 4);
      if (p.kind === 'turret') this.C.bus?.emit('call', { id: 'turret-back', what: p.name });
    }
    if (t.use) {
      const I = t.spot?.I;
      if (I) I.interactables.splice(I.interactables.indexOf(t.use) >>> 0, 1);
      t.use = null;
    }
  }

  // --- the drones (seeded flight) ---------------------------------------------------------------------------------------

  /** The ellipse round her that clears her hull (and her radiators while spread) over z0..z1: its half axes. */
  envelope(z0, z1) {
    const L = this.C.L, Q = this.P.drones;
    let w = 0, h = 0;
    for (const s of L.hull.main) if (s.z >= z0 - 40 && s.z <= z1 + 40) (w = Math.max(w, s.w)), (h = Math.max(h, s.h));
    if (!w) (w = Math.max(...L.hull.main.map((s) => s.w))), (h = Math.max(...L.hull.main.map((s) => s.h)));
    let A = (w / 2) * Math.SQRT2 + Q.clear, B = (h / 2) * Math.SQRT2 + Q.clear;
    for (const r of this.G.plant?.radiators ?? []) {
      if (r.k < 0.05 || r.box.z[1] < z0 - 10 || r.box.z[0] > z1 + 10) continue;
      A = Math.max(A, Math.max(Math.abs(r.box.x[0]), Math.abs(r.box.x[1])) + Q.clear);
    }
    return { A, B };
  }

  /** The way from `p` (just off her skin) to `s`, both in her frame: out to the ellipse, round it, along her, in. */
  route(p, s) {
    const { A, B } = this.envelope(Math.min(p.z, s.z), Math.max(p.z, s.z));
    const ang = (q) => Math.atan2(q.y / B, q.x / A);
    const ell = (a, z) => new THREE.Vector3(A * Math.cos(a), B * Math.sin(a), z);
    const a0 = ang(p), a1 = ang(s);
    let da = a1 - a0;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const n = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 6)));
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(ell(a0 + (da * i) / n, p.z));
    pts.push(ell(a1, s.z));
    return pts;
  }

  /** Where a drone holds off the work for task `t`, in her frame (`out` set to the way it faces from the work). */
  standoff(t, out) {
    const Q = this.P.drones, p = t.part, h = t.hole;
    if (p) {
      const at = p.spots.at(-1) ?? p.pos;
      out.copy(p.out);
      return at.clone().addScaledVector(out, Q.standoff + (p.kind === 'pdc' ? 2 : 0));
    }
    if (h.spin) return this.ship.holeNow(h, new THREE.Vector3()).setZ(h.at.z + Math.sign(h.at.z - (h.n.b ? (h.n.b.z[0] + h.n.b.z[1]) / 2 : h.at.z)) * Q.standoff);
    const at = h.hull ?? h.at;
    skinNormal(this.C.L, at, out);
    return at.clone().addScaledVector(out, Q.standoff);
  }

  /** Drone `d` out to task `t`. */
  send(d, t) {
    d.task = t;
    t.worker = d;
    t.phase = 'going';
    const S = this.standoff(t, new THREE.Vector3());
    t.at = S;
    const from = d.state === 'docked' ? null : d.pos; // a drone on its way home turns round where it is
    const path = [];
    if (!from) {
      if (d.state === 'docked') path.push(this.exit.clone());
      path.push(this.exit.clone().addScaledVector(this.out, this.P.drones.clear));
    }
    const start = from ?? path.at(-1);
    // A hole in a spinning drum is reached through the sleeve's open end nearest it.
    if (t.hole?.spin) {
      const D = this.C.L.drum, z0 = D.halves[0].z[0] - 8, z1 = D.halves.at(-1).z[1] + 8;
      const zEnd = Math.abs(S.z - z0) < Math.abs(S.z - z1) ? z0 : z1;
      path.push(...this.route(start, new THREE.Vector3(S.x, S.y, zEnd)), new THREE.Vector3(S.x, S.y, zEnd));
    } else path.push(...this.route(start, S));
    path.push(S);
    d.path = path;
    d.state = 'fly';
  }

  goHome(d) {
    d.task = null;
    const out = this.exit.clone().addScaledVector(this.out, this.P.drones.clear);
    d.path = [...this.route(d.pos, out), out, this.exit.clone(), this.dock.clone()];
    d.state = 'home';
  }

  /** One frame of drone `d`'s flight: the velocity it wants toward its next point (through a waypoint at cruise, onto
   *  the last on a braking profile), the push to get it capped at `accel`. */
  fly(d, dt) {
    const Q = this.P.drones;
    if (d.state === 'docked') return;
    // A drum hole turns: the drone at work keeps station on it.
    if (d.state === 'work' && d.task?.hole?.spin) d.task.at.copy(this.standoff(d.task, _c));
    const goal = d.path[0] ?? (d.state === 'work' ? d.task?.at : null);
    if (!goal) return;
    const last = d.path.length <= 1;
    const to = _a.subVectors(goal, d.pos), dist = to.length();
    // Onto the last point it stops; through a waypoint it slows to `corner`, so it can make the turn there.
    const speed = Math.min(Q.cruise, (last ? 0 : Q.corner) + Math.sqrt(2 * Q.accel * 0.7 * Math.max(0, dist - (last ? 0.02 : Q.pass))));
    const want = dist > 1e-4 ? to.multiplyScalar(speed / dist) : to.set(0, 0, 0);
    const acc = _b.subVectors(want, d.vel).divideScalar(Q.tau);
    if (acc.length() > Q.accel) acc.setLength(Q.accel);
    d.vel.addScaledVector(acc, dt);
    d.pos.addScaledVector(d.vel, dt);
    d.thrust = acc.length() / Q.accel;
    if (!d.path.length) return;
    const passed = last ? dist < 0.1 && d.vel.length() < 0.2 : dist < Q.pass;
    if (!passed) return;
    d.path.shift();
    if (d.path.length) return;
    if (d.state === 'fly') (d.state = 'work'), d.task && (d.task.phase = 'work');
    else if (d.state === 'home') (d.state = 'docked'), d.pos.copy(this.dock), d.vel.set(0, 0, 0);
  }

  // --- the parties (timed) ----------------------------------------------------------------------------------------------

  /** Where the inside work for task `t` is done: its deck's Interior, the spot on its floor, the work point, and a use
   *  there for you. */
  spotFor(t) {
    const C = this.C, L = C.L, p = t.part, h = t.hole;
    let deck = null, x = 0, z = 0, work = null, room = null;
    if (p?.kind === 'door') {
      room = [...C.rooms.values()].find((c) => c.system === 'hangar');
      deck = room?.deck;
      const wx = p.side === 'w' ? room.x[0] : room.x[1];
      x = wx - Math.sign(wx) * 1.6;
      z = p.pos.z;
      work = new THREE.Vector3(wx - Math.sign(wx) * 0.3, 1.4, z);
    } else if (p?.kind === 'turret') {
      const F = p.t.spec.from;
      deck = F.deck;
      x = F.at[0] + 1.4;
      z = F.at[1];
      work = new THREE.Vector3(F.at[0], 2.2, F.at[1]);
    } else if (p?.kind === 'bearing') {
      room = C.rooms.get('spine');
      deck = room?.deck;
      x = 0;
      z = p.pos.z + 2.6;
      work = new THREE.Vector3(0, 0.15, p.pos.z);
    } else if (h?.look) {
      const Lk = h.look, I = Lk.I;
      t.spot = { I, x: Lk.g.position.x + Lk.into.x * 1.2, z: Lk.g.position.z + Lk.into.z * 1.2, work: Lk.g.position.clone(), local: true, room: h.room?.c };
      return;
    }
    const I = deck != null ? C.decks.get(deck) : null;
    if (!I) return;
    room ??= [...C.rooms.values()].find((c) => c.deck === deck && c.access === 'walk' && x >= c.x[0] && x <= c.x[1] && z >= c.z[0] && z <= c.z[1]);
    t.spot = { I, x, z, work: work.setY(I.floorY + work.y), room };
    const u = I.use(`hull-repair-${t.seq}`, '', x, z, () => {
      if (!this.G.dc?.carry.has(this.P.kit)) this.G.dc?.say(null, `You need ${this.G.dc.D.kits[this.P.kit].name}. ${this.G.dc.whereKit(this.P.kit)}`);
    }, { r: 2.6 });
    u.repair = t;
    u.key = 'E';
    u.hidden = () => t.phase === 'done';
    t.use = u;
  }

  /** How far a party goes from the damage control centre to task `t`, in metres (decks apart counted as climbs). */
  way(t) {
    const L = this.C.L, s = t.spot, h = t.hole;
    const to = s && !s.local ? _a.set(s.x, s.I.floorY, s.z) : _a.copy(h?.at ?? t.part?.pos ?? this.base);
    return Math.abs(to.x - this.base.x) + Math.abs(to.y - this.base.y) * 1.5 + Math.abs(to.z - this.base.z);
  }

  sendParty(q, t) {
    const P = this.P.parties;
    q.task = t;
    t.worker = q;
    t.phase = 'going';
    t.go = P.setup + this.way(t) / P.speed;
  }

  /** The party is at the work: you see them there, suited, in foot restraints either side of it. */
  arrived(t) {
    const s = t.spot, q = t.worker;
    if (!this.showCrew || !s || !q) return;
    const C = this.C, vac = !!s.room?.vacuum;
    for (let k = 0; k < 2; k++) {
      crewMember(C.L.stations.length + 20 + q.i * 2 + k, 'engineering', { outfit: vac ? 'vac' : 'duty' }).then((m) => {
        if (t.phase === 'done' || q.task !== t) return;
        const side = k ? 1 : -1;
        const dx = s.work.x - s.x, dz = s.work.z - s.z, len = Math.hypot(dx, dz) || 1;
        m.root.position.set(s.x + (-dz / len) * 0.8 * side, s.I.floorY, s.z + (dx / len) * 0.8 * side);
        m.root.rotation.y = Math.atan2(-(s.work.x - m.root.position.x), -(s.work.z - m.root.position.z));
        s.I.group.add(m.root);
        m.deck = s.I.deck?.id ?? s.room?.deck;
        floatIn(m, s.room);
        m.route = null;
        footRestraint(m);
        m.play('workTable');
        q.people.push(m);
        this.crew.push(m);
      }, (e) => console.warn('damage control party could not come', e));
    }
  }

  partyHome(q) {
    for (const m of q.people) {
      removeCrew(m);
      this.crew.splice(this.crew.indexOf(m) >>> 0, 1);
    }
    q.people.length = 0;
    q.task = null;
  }

  // --- what you see (Math.random) ---------------------------------------------------------------------------------------

  looks(dt, mode, working) {
    const C = this.C, out = C.exterior?.visible !== false;
    const B = out ? C.blazes?.in(C.frame, { clipPlanes: null, near: [1.5, 9] }) : null;
    for (const d of this.drones) {
      const g = d.look.g;
      g.visible = d.state !== 'docked';
      if (!g.visible) continue;
      g.position.copy(d.pos);
      const t = d.task;
      if (d.state === 'work' && t) {
        const at = t.part ? t.part.spots.at(-1) ?? t.part.pos : t.hole.spin ? this.ship.holeNow(t.hole, _vh) : t.hole.hull ?? t.hole.at;
        g.lookAt(C.frame.localToWorld(_vp.copy(d.pos).multiplyScalar(2).sub(at))); // it faces -z: its arm to the work
        // The weld, in bursts: the arc and its sparks where the drone's arm meets her.
        d.acc.burst = (d.acc.burst ?? 0) - dt;
        if (d.acc.burst < -1.2) d.acc.burst = 0.6 + R() * 1.4;
        if (B && d.acc.burst > 0) weldTick(B, _vn.copy(at).add(_vp.set(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.8)), _vq.subVectors(d.pos, at).normalize(), dt, false, d.acc);
      } else if (d.vel.lengthSq() > 0.05) g.lookAt(C.frame.localToWorld(_vp.copy(d.pos).sub(d.vel)));
    }
    // A party at work: sparks at the work, now and then.
    for (const t of this.tasks) {
      const s = t.spot;
      if (!s || !(t.phase === 'work' || working === t) || !s.I.group.visible) continue;
      const Bi = C.blazes?.in(s.I.group);
      if (Bi) {
        const n = _vn.set(s.x - s.work.x, 0, s.z - s.work.z).normalize();
        if (working === t) weldTick(Bi, s.work, n, dt, false, (t.acc ??= {}));
        else zapTick(Bi, s.work, n, dt * 2, false);
      }
      if (t.use) {
        const pct = Math.round((1 - t.left / t.T) * 100), kit = this.G.dc?.carry.has(this.P.kit);
        const label = (t.part?.name ?? t.name).replace(/^The /, '').toLowerCase();
        t.use.label = !kit ? `The ${label} needs mending (you need ${this.G.dc?.D.kits[this.P.kit].name})` : working === t ? `Mending the ${label}: ${pct}%` : `Hold E: mend the ${label}${t.phase === 'work' ? ' with the party' : ''}`;
      }
    }
  }

  /** The jobs in hand, most urgent first: for the status board and the console. */
  board() {
    return [...this.tasks].sort((a, b) => this.rank(a) - this.rank(b)).map((t) => ({
      what: t.part?.name ?? t.name, by: t.by, phase: t.phase, left: Math.max(0, Math.round(t.left)), eta: mmss(Math.max(0, t.left + (t.go ?? 0)))
    }));
  }

  rows() {
    const out = this.drones.filter((d) => d.state !== 'docked').length, busy = this.parties.filter((q) => q.task).length;
    const b = this.board();
    const rows = [['Repairs', b.length ? 0.5 : 1, b.length ? `${b.length} job${b.length > 1 ? 's' : ''} · drones ${out}/${this.drones.length} out · parties ${busy}/${this.parties.length}` : 'nothing to mend']];
    for (const j of b.slice(0, 3)) rows.push([`  ${j.what}`, 0.6, `${j.by === 'drone' ? 'drone' : 'party'} · ${j.phase === 'wait' ? 'waiting' : j.phase === 'going' ? 'on the way' : 'at work'} · ${j.eta}`]);
    return rows;
  }

  info() {
    return { tasks: this.board(), drones: this.drones.map((d) => d.state), parties: this.parties.map((q) => q.task?.part?.id ?? q.task?.kind ?? null), log: this.log };
  }
}
