// Damage control. When a hit hurts a room (integrity.mjs), something can go wrong in it: a fire in a compartment, an
// electrical fault, a coolant leak in a passage. (With `auto`, jobs also come by themselves every so often.) The ship's
// speakers call it out with where it is (deck, frame, side) and you go and deal with it: find the kit, find the place,
// hold E. It is what the wayfinding is for.
//
// Everything about the jobs is data, the layout's `damage` entry: what kits there are and where they are kept, what
// each kind of job needs (a kit, a switchboard isolation, so many seconds of work), how it gets worse, and when it is
// lost. This file has two halves:
//
// - `dressKits(C, I, deck)`, at build time: the red extinguisher cabinets and yellow repair lockers along the passages,
//   and the racks of kit just inside the rooms that keep it. Baked with the deck.
// - `DamageControl`, at run time: raising a job, its fire or sparks or spray, the switchboard, the job card, the alarm
//   and the call over the speakers, the clock and the result. What you see is hitfx.mjs's particles (blaze.mjs): a fire
//   that burns where the shell came in if a hit started it, round and drifting where nothing weighs anything and licking
//   upwards in the drums; the extinguisher's powder; the welder's arc and sparks (the `patch` kit is a welder and hull
//   plates); a coolant leak's jet of droplets; a fault's bursts of sparks.
//
// A job's place is given as a compartment number, deck-frame-side, as on a real warship: 2-291-1 is deck 2, frame 291
// (291 m aft of the bow), starboard (1; port is 2, the centreline 0).

import * as THREE from 'three';
import { box, cyl, at, mat, mulberry } from '../util.mjs';
import { drawSign } from '../decor.mjs';
import { frameOf, sideOf, clear, xz } from './wayfinding.mjs';
import { fireTick, sprayTick, weldTick, jetTick, zapTick } from './hitfx.mjs';

// --- build time: where the kit is kept -------------------------------------------------------------------------------

export function dressKits(C, I, deck) {
  const D = C.L.damage;
  if (!D) return;
  for (const c of C.L.compartments) {
    if (c.access !== 'walk' || c.deck !== deck.id) continue;
    const P = C.passages?.get(c.id);
    if (P) lockers(C, I, P, D);
    Object.entries(D.kits).filter(([, kit]) => kit.rooms?.includes(c.id)).forEach(([k, kit], i) => rack(C, I, c, k, kit, i));
  }
}

/** Kit with `lockers` along a passage: the first such kit every 30 m, the next every 60 m, on whichever wall is clear. */
function lockers(C, I, P, D) {
  const [a0, a1] = P.c[P.ax];
  if (a1 - a0 < 12) return;
  Object.entries(D.kits).filter(([, k]) => k.lockers).forEach(([k, kit], j) => {
    const big = j > 0; // the repair lockers are cupboards; the extinguisher cabinets are small
    const [w, h, d, y] = big ? [1.0, 1.9, 0.38, 0.95] : [0.5, 0.85, 0.22, 1.15];
    let n = 0;
    for (let t0 = a0 + 7 + j * 16; t0 < a1 - 4; t0 += j ? 60 : 30) {
      let spot = null;
      for (const dt of [0, 1.5, -1.5, 3, -3, 4.5, -4.5]) {
        const t = t0 + dt;
        if (t - w / 2 < a0 + 0.5 || t + w / 2 > a1 - 0.5) continue;
        const wall = [['lo', 'hi'], ['hi', 'lo']][(n + j) % 2].find((wl) => clear(P, wl, t - w / 2 - 0.2, t + w / 2 + 0.2));
        if (wall) (spot = { t, wall });
        if (spot) break;
      }
      n++;
      if (!spot) continue;
      const { t, wall } = spot;
      P.taken[wall].push([t - w / 2, t + w / 2]);
      const inward = wall === 'lo' ? 1 : -1;
      const [x, z] = xz(P, t, P.wall[wall] + inward * (d / 2 + 0.1));
      const g = new THREE.Group();
      g.add(at(box(w, h, d, kit.color), 0, 0, 0));
      if (big) g.add(at(box(0.04, 0.3, 0.04, '#1a1a1a'), w * 0.3, 0.1, d / 2 + 0.02), at(box(w - 0.1, 0.02, 0.02, '#1a1a1a'), 0, 0, d / 2 + 0.01));
      else g.add(at(box(w - 0.1, h - 0.1, 0.02, mat('#e8d0c8')), 0, 0, d / 2 + 0.01), at(cyl(0.09, 0.09, 0.55, '#a8201a', 8), 0, -0.05, 0.02));
      const face = P.ax === 'z' ? (wall === 'lo' ? Math.PI / 2 : -Math.PI / 2) : wall === 'lo' ? 0 : Math.PI;
      I.prop(g, x, z, { y, ry: face });
      const [lx, lz] = xz(P, t, P.wall[wall] + inward * 0.12);
      const label = C.atlas.plane(0.62, 0.15, (gg, pw, ph) => drawSign(gg, pw, ph, kit.lockers, kit.color), 300);
      I.group.add(at(label, lx, I.floorY + y + h / 2 + 0.2, lz, 0, face, 0));
      const [ux, uz] = xz(P, t, P.wall[wall] + inward * 0.6);
      I.use(`kit-${k}-${P.c.id}-${n}`, `Take ${kit.name}`, ux, uz, () => C.hooks.kit?.(k), { r: 2 });
    }
  });
}

/** The racks of kit a drum room keeps (drum.mjs builds its segment as you come near, and calls this). */
export function drumKits(C, I, c) {
  const D = C.L.damage;
  if (D) Object.entries(D.kits).filter(([, kit]) => kit.rooms?.includes(c.id)).forEach(([k, kit], i) => rack(C, I, c, k, kit, i));
}

/** The kit cabinets along a drum's ring corridor (segment `seg`'s piece of it, `corr`): an extinguisher cabinet on the
 *  fore wall every other segment, and the other locker kits (repair lockers, vac suits) on the aft wall in turn, every
 *  fifth. They keep clear of the doorways (mid-segment), the lift (fore wall, x 2.6) and the ladder and plate (aft
 *  wall, x < -2). */
export function drumLockers(C, I, corr, seg) {
  const D = C.L.damage;
  if (!D) return;
  const kits = Object.entries(D.kits).filter(([, k]) => k.lockers);
  const put = ([k, kit], big, x, fore) => {
    const [w, h, d, y] = big ? [1.0, 1.9, 0.38, 0.95] : [0.5, 0.85, 0.22, 1.15];
    const wz = fore ? corr.z[0] : corr.z[1], inward = fore ? 1 : -1, face = fore ? 0 : Math.PI;
    const g = new THREE.Group();
    g.add(at(box(w, h, d, kit.color), 0, 0, 0));
    if (big) g.add(at(box(0.04, 0.3, 0.04, '#1a1a1a'), w * 0.3, 0.1, d / 2 + 0.02), at(box(w - 0.1, 0.02, 0.02, '#1a1a1a'), 0, 0, d / 2 + 0.01));
    else g.add(at(box(w - 0.1, h - 0.1, 0.02, mat('#e8d0c8')), 0, 0, d / 2 + 0.01), at(cyl(0.09, 0.09, 0.55, '#a8201a', 8), 0, -0.05, 0.02));
    I.prop(g, x, wz + inward * (d / 2 + 0.1), { y, ry: face });
    const label = C.atlas.plane(0.62, 0.15, (gg, pw, ph) => drawSign(gg, pw, ph, kit.lockers, kit.color), 300);
    I.group.add(at(label, x, I.floorY + y + h / 2 + 0.2, wz + inward * 0.12, 0, face, 0));
    I.use(`kit-${k}-${corr.id}-${seg}`, `Take ${kit.name}`, x, wz + inward * 0.6, () => C.hooks.kit?.(k), { r: 2 });
  };
  if (kits[0] && seg % 2 === 0) put(kits[0], false, -2.9, true);
  const rest = kits.slice(1);
  if (rest.length && seg % 5 === 1) put(rest[Math.floor(seg / 5) % rest.length], true, 2.9, false);
}

/** A room's door: { x, z, side } from the routes (wayfinding.mjs), or a drum room's doorway (drum.mjs). */
const doorOf = (C, c) => C.ways.portals.get(c.id)?.find((q) => q.kind === 'door') ?? C.doorOf?.(c) ?? null;

/** A rack of kit on the wall just inside a room's door (the `i`th in this room: each one 1.4 m further along). */
function rack(C, I, c, k, kit, i) {
  const p = doorOf(C, c);
  if (!p) return;
  const alongZ = p.side === 'e' || p.side === 'w';
  let inward = { e: [-1, 0], w: [1, 0], n: [0, 1], s: [0, -1] }[p.side];
  const [lo, hi] = alongZ ? c.z : c.x;
  const at0 = alongZ ? p.z : p.x;
  const beside = (j) => { const off = 1.7 + j * 1.4; return at0 + off + 0.6 < hi ? at0 + off : at0 - off; };
  let u = beside(i), wall = alongZ ? p.x : p.z;
  // A small room (the cutter's locker) has no run of wall beside its door for every rack: they would stand through the
  // end wall into the next room. There they go side by side along the wall facing the door.
  const n = Object.values(C.L.damage.kits).filter((kt) => kt.rooms?.includes(c.id)).length;
  if (Array.from({ length: n }, (_, j) => beside(j)).some((v) => v - 0.6 < lo || v + 0.6 > hi)) {
    const [a, b2] = alongZ ? c.x : c.z;
    wall = Math.abs(a - wall) > Math.abs(b2 - wall) ? a : b2;
    inward = [-inward[0], -inward[1]];
    u = lo + ((hi - lo) * (i + 0.5)) / n;
  }
  const wallX = alongZ ? wall : u, wallZ = alongZ ? u : wall;
  const pos = (inset) => [wallX + inward[0] * inset, wallZ + inward[1] * inset];
  const face = Math.atan2(inward[0], inward[1]);
  const g = new THREE.Group();
  g.add(at(box(1.1, 0.06, 0.32, '#3a4048'), 0, 0, 0), at(box(1.1, 0.06, 0.32, '#3a4048'), 0, 0.5, 0));
  for (const [x, y] of [[-0.32, 0.17], [0.05, 0.17], [0.38, 0.17], [-0.2, 0.67], [0.25, 0.67]]) g.add(at(box(0.3, 0.26, 0.26, kit.color), x, y, 0));
  const [rx, rz] = pos(0.2);
  I.prop(g, rx, rz, { y: 0.8, ry: face });
  const [lx, lz] = pos(0.11);
  I.group.add(at(C.atlas.plane(0.9, 0.18, (gg, pw, ph) => drawSign(gg, pw, ph, kit.label.toUpperCase() + 'S', kit.color), 300), lx, I.floorY + 1.9, lz, 0, face, 0));
  const [ux, uz] = pos(0.7);
  I.use(`kit-${k}-${c.id}`, `Take ${kit.name}`, ux, uz, () => C.hooks.kit?.(k), { r: 2 });
}

// --- run time --------------------------------------------------------------------------------------------------------

const CHAR = new THREE.MeshBasicMaterial({ color: '#16130f', transparent: true, opacity: 0.85, depthWrite: false }); // what is burning, burnt
const _h = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();
const MARK = new THREE.MeshBasicMaterial({ color: '#ff3a3a', transparent: true, opacity: 0.8, toneMapped: false, depthTest: false });
MARK.userData.uncut = true;

const VERB = { fire: 'Put the fire out', electrical: 'Repair the fault', leak: 'Weld the leak' };
const OUT = { fire: 'Fire out', electrical: 'Fault repaired', leak: 'Leak welded shut' };

export class DamageControl {
  /** `auto`: raise jobs by themselves while you walk. Each job is called out on the bus (`call`), and the announcer
   *  (src/core/announcer.mjs) says it to whoever should hear it. */
  constructor(C, { hud, sfx, auto = true, seed = Date.now() } = {}) {
    this.C = C;
    this.L = C.L;
    this.D = C.L.damage;
    this.hud = hud;
    this.sfx = sfx;
    this.auto = auto && !!this.D;
    this.rand = mulberry(seed % 2147483647);
    this.carry = new Map(); // kit id → { agent } (seconds left, for an extinguisher)
    this.job = null;
    this.log = [];
    this.wait = this.D?.first ?? 45;
    this.time = 0;
    this.msg = null;
    this.el = document.getElementById('c-job');
    this.uses = [];
    this.pending = []; // jobs hits have started while another was on (`queue`)
    this.airOf = null; // (room id) → kPa, from integrity.mjs: a fire in a room that has lost its air goes out
    this.markScale = 1;
    if (!this.D) return;
    // The switchboards' isolating switch and the damage control centre's "Call a drill": uses that show only when they mean something.
    for (const id of this.D.switchboards ?? []) {
      const c = C.rooms.get(id);
      if (!c) continue;
      const I = C.interiorOf(c);
      const u = I.use(`isolate-${id}`, 'Isolate the supply', (c.x[0] + c.x[1]) / 2, (c.z[0] + c.z[1]) / 2, () => this.isolate(), { r: 4.5 });
      u.hidden = () => !(this.job?.K.isolate && !this.job.isolated);
      this.uses.push(u);
    }
    const dcc = C.rooms.get('damage-control');
    if (dcc) {
      const u = C.interiorOf(dcc).use('call-drill', 'Call a drill', (dcc.x[0] + dcc.x[1]) / 2, (dcc.z[0] + dcc.z[1]) / 2, () => this.raise(), { r: 4.5 });
      u.hidden = () => !!this.job;
    }
    this.marker = this.makeMarker();
    C.overlay.add(this.marker);
  }

  // --- kit ---

  take(k) {
    const kit = this.D.kits[k];
    const had = this.carry.has(k);
    this.carry.set(k, { agent: kit.agent ?? Infinity });
    this.say(null, had ? `You swap for a full ${kit.label.toLowerCase()}.` : `You take ${kit.name}.`);
    this.sfx?.cue('clunk', { vol: 0.5 });
  }

  // --- raising a job ---

  /** A job a hit has started (integrity.mjs): raised now if nothing else is on, else as soon as the job in hand ends.
   *  `opts.hole`: the hole it came in by (a fire burns there). */
  queue(kind, where, opts) {
    if (!this.D?.kinds[kind]) return;
    if (!this.job) return this.raise(kind, where, opts);
    if (!this.pending.some((p) => p.where === where)) this.pending.push({ kind, where, opts });
  }

  /** Raises a job now: `kind` (a key of `damage.kinds`) and `where` (a room id) or chosen at random; `opts.hole`, a
   *  hole drawn in that room: a fire burns at it. */
  raise(kind, where, opts) {
    if (!this.D) return null;
    if (this.job) this.end(false, 'Stood down.', true);
    const kinds = Object.keys(this.D.kinds);
    kind ??= kinds[Math.floor(this.rand() * kinds.length)];
    const K = this.D.kinds[kind];
    const rooms = this.placesFor(K);
    const room = where ? this.C.rooms.get(where) : rooms[Math.floor(this.rand() * rooms.length)];
    if (!room) return null;
    const I = this.C.interiorOf(room); // a drum room's: its segment's, in that segment's frame (drum.mjs)
    let spot = kind === 'leak' ? this.leakSpot(room) : kind === 'electrical' ? this.wallSpot(room, I) : this.floorSpot(room, I);
    // A fire a hit started burns at the hole it came in by (the floor spot is still drawn above, so the seeded randoms
    // stay where they were). You fight it from a step back, on the deck below it.
    const H = opts?.hole?.look;
    if (kind === 'fire' && H && H.I === I && !opts.hole.sealed) {
      const p = H.g.position, n = H.into, side = Math.abs(n.y) < 0.5 ? 1.6 : 0;
      const ux = Math.min(room.x[1] - 0.6, Math.max(room.x[0] + 0.6, p.x + n.x * side));
      const uz = Math.min(room.z[1] - 0.6, Math.max(room.z[0] + 0.6, p.z + n.z * side));
      spot = { x: p.x, z: p.z, y: p.y - I.floorY, n: n.clone(), ux, uz, hole: opts.hole };
    }
    const job = { kind, K, room, I, spot, t: 0, size: 1, progress: 0, isolated: false, idle: 0 };
    const drum = room.drum;
    job.code = drum ? `${room.half}${room.ring}-${String(room.seg).padStart(2, '0')}-${frameOf(this.L, spot.z)}` : `${room.deck}-${frameOf(this.L, spot.z)}-${Math.abs(spot.x) < 0.8 && room.x[0] < 0 && room.x[1] > 0 ? 0 : spot.x > 0 ? 1 : 2}`;
    job.side = drum ? `segment ${room.seg}` : Math.abs(spot.x) < 0.8 ? 'centreline' : sideOf(spot.x);
    job.place = kind === 'leak' ? `the ${room.name.toLowerCase()}` : `the ${room.name.toLowerCase()}`;
    job.use = I.use(`job-${kind}`, VERB[kind], spot.ux, spot.uz, () => this.press(), { r: kind === 'leak' ? 2.8 : 2.6 });
    job.fx = this.effects(job);
    this.job = job;
    this.placeMarker();
    this.marker.visible = true;
    // The call, with its alarm (content/announcements/damage-<kind>.json: the announcer decides who hears it).
    this.C.bus?.emit('call', { id: `damage-${kind}`, room: room.id, frame: frameOf(this.L, spot.z), side: job.side });
    this.say(null, `${K.call} ${K.name} in ${job.place}.`);
    this.C.bus?.emit('job', { job });
    return job;
  }

  /** The cutaway's red marker on the job's spot, in the ship's frame. */
  placeMarker() {
    const job = this.job, { spot, I, room } = job;
    if (room.drum) this.C.toShip(room.deck, room.seg, spot.x, I.floorY, spot.z, this.marker.position);
    else this.marker.position.set(spot.x, I.floorY, spot.z);
  }

  placesFor(K) {
    const walk = this.L.compartments.filter((c) => c.access === 'walk');
    if (Array.isArray(K.rooms)) return K.rooms.map((id) => this.C.rooms.get(id)).filter(Boolean);
    if (K.rooms === 'passages') return walk.filter((c) => c.system === 'corridor' && Math.max(c.x[1] - c.x[0], c.z[1] - c.z[0]) > 14);
    return walk.filter((c) => c.system !== 'corridor' && c.system !== 'hangar' && (c.x[1] - c.x[0]) * (c.z[1] - c.z[0]) > 30);
  }

  /** A clear patch of floor, toward the back of the room. */
  floorSpot(c, I) {
    const door = doorOf(this.C, c);
    const free = (x, z) => !I.colliders.some((b) => b.min.y < I.floorY + 1 && b.max.y > I.floorY + 0.05 && x > b.min.x - 0.7 && x < b.max.x + 0.7 && z > b.min.z - 0.7 && z < b.max.z + 0.7);
    const cand = [];
    for (let x = c.x[0] + 1; x <= c.x[1] - 1; x += 0.5) for (let z = c.z[0] + 1; z <= c.z[1] - 1; z += 0.5) {
      if (!free(x, z)) continue;
      const d = door ? Math.hypot(x - door.x, z - door.z) : 0;
      if (d > 2.5) cand.push({ x, z, d });
    }
    cand.sort((a, b) => b.d - a.d);
    const p = cand.length ? cand[Math.floor(this.rand() * Math.max(1, cand.length / 2))] : { x: (c.x[0] + c.x[1]) / 2, z: (c.z[0] + c.z[1]) / 2 };
    return { x: p.x, z: p.z, ux: p.x, uz: p.z };
  }

  /** The middle of the wall across from the door: a distribution panel with its cover off. */
  wallSpot(c, I) {
    const door = doorOf(this.C, c);
    const back = { e: 'w', w: 'e', n: 's', s: 'n' }[door?.side ?? 'e'];
    const cx = (c.x[0] + c.x[1]) / 2, cz = (c.z[0] + c.z[1]) / 2;
    const wall = { e: [c.x[1] - 0.12, cz, -1, 0], w: [c.x[0] + 0.12, cz, 1, 0], n: [cx, c.z[0] + 0.12, 0, 1], s: [cx, c.z[1] - 0.12, 0, -1] }[back];
    // Off to one side of whatever stands against that wall's middle: at the end of the back row, 1.2 m from the corner.
    const alongZ = back === 'e' || back === 'w';
    const span = alongZ ? c.z : c.x;
    const a = span[0] + 1.0;
    const [x, z] = alongZ ? [wall[0], a] : [a, wall[1]];
    return { x, z, y: 1.5, nx: wall[2], nz: wall[3], ux: x + wall[2] * 1.4, uz: z + wall[3] * 1.4 };
  }

  /** A point on a passage's overhead pipes. */
  leakSpot(c) {
    const P = this.C.passages.get(c.id);
    const [a0, a1] = c[P.ax];
    const t = a0 + 6 + this.rand() * (a1 - a0 - 12);
    const wall = this.rand() < 0.5 ? 'lo' : 'hi';
    const inward = wall === 'lo' ? 1 : -1;
    const [x, z] = xz(P, t, P.wall[wall] + inward * 0.3);
    const [ux, uz] = xz(P, t, P.wall[wall] + inward * 0.9);
    return { x, z, y: (c.h ?? 3) - 0.3, ux, uz, P, wall };
  }

  // --- what you see and hear ---

  effects(job) {
    const { I, spot, kind } = job;
    const g = new THREE.Group();
    g.userData.live = true;
    I.group.add(g);
    const room = job.room, weight = !!room.drum; // only the drums have weight (design/ROADMAP.md, decision 2)
    const fx = { g, B: this.C.blazes?.in(I.group) ?? null, weight, acc: {} };
    // This room's lamps, to flicker or darken (an electrical fault) and to put back afterwards.
    fx.lamps = I.lights.filter((l) => l.room === room.id);
    for (const l of fx.lamps) (l.dcBase ??= l.intensity), (l.dcColor ??= l.color.clone());
    const lamp = (p, color) => {
      const anchor = new THREE.Object3D();
      anchor.position.copy(p);
      g.add(anchor);
      const light = { anchor, color: new THREE.Color(color), intensity: 0, distance: 10, decay: 1.6, room: room.id };
      I.lights.push(light);
      return light;
    };
    if (kind === 'fire') {
      // At a hole the scorch is already there; on the deck, a charred patch of whatever caught.
      const n = spot.n ?? new THREE.Vector3(0, 1, 0);
      const p = new THREE.Vector3(spot.x, I.floorY + (spot.y ?? 0.05), spot.z);
      if (!spot.n) {
        const ch = new THREE.Mesh(new THREE.CircleGeometry(0.9, 14), CHAR);
        ch.rotation.x = -Math.PI / 2;
        ch.position.set(spot.x, I.floorY + 0.03, spot.z);
        g.add(ch);
      }
      fx.fire = { p, n, r: 0.5, size: 1, left: 1, weight, up: Math.max(0.5, (room.h ?? 3) - (spot.y ?? 0)), wind: null, acc: {} };
      fx.light = lamp(p.clone().addScaledVector(n, 0.8), '#ff7a30');
    } else if (kind === 'electrical') {
      const yaw = Math.atan2(spot.nx, spot.nz);
      g.add(at(box(0.7, 0.9, 0.08, '#2a2e34'), spot.x, I.floorY + spot.y, spot.z, 0, yaw, 0)); // the panel, its cover off
      fx.zap = { p: new THREE.Vector3(spot.x + spot.nx * 0.1, I.floorY + spot.y, spot.z + spot.nz * 0.1), n: new THREE.Vector3(spot.nx, 0, spot.nz) };
      fx.light = lamp(fx.zap.p.clone().addScaledVector(fx.zap.n, 0.4), '#bcd8ff');
    } else {
      // The pipe's split: a jet of coolant across the passage and down a little, and a ragged seam on the pipe.
      const p = new THREE.Vector3(spot.x, I.floorY + spot.y, spot.z);
      const d = new THREE.Vector3(spot.ux - spot.x, 0, spot.uz - spot.z).normalize().applyAxisAngle(_h.set(0, 1, 0), (Math.random() - 0.5) * 1.2);
      d.y = -0.3;
      fx.jet = { p, d: d.normalize() };
      g.add(at(box(0.22, 0.12, 0.22, '#1e2226'), p.x, p.y, p.z));
      fx.light = lamp(p.clone().addScaledVector(fx.jet.d, 0.6), '#bcd4ff'); // the welder's arc, when you weld it
      fx.hiss = 0;
    }
    return fx;
  }

  animate(job, dt, near) {
    const fx = job.fx, t = this.time, B = fx.B;
    const left = 1 - job.progress / this.need(job);
    if (fx.fire) {
      const F = fx.fire;
      F.size = 0.7 + 0.45 * job.size;
      F.r = 0.35 + 0.25 * job.size;
      F.left = Math.max(0.15, left);
      F.wind = this.draftOf?.(job.room.id, F.p, (F.draft ??= new THREE.Vector3())) ?? null; // venting: it leans towards where the air goes
      if (B) fireTick(B, F, dt);
      fx.light.intensity = (16 + 12 * job.size) * Math.max(0.2, left) * (0.8 + 0.25 * Math.sin(t * 17) + 0.1 * Math.sin(t * 41));
    }
    if (fx.zap) {
      const live = !job.isolated;
      const burst = live && B ? zapTick(B, fx.zap.p, fx.zap.n, dt, fx.weight) : false;
      fx.light.intensity = burst ? 18 : fx.light.intensity * 0.7;
      // A live fault makes the room's lamps stutter; once it is isolated, they are out but for the emergency lighting.
      for (const l of fx.lamps) {
        if (job.isolated) (l.intensity = l.dcBase * 0.12), l.color.set('#ff5040');
        else if (Math.random() < 0.08) l.intensity = l.dcBase * (Math.random() < 0.5 ? 0.15 : 1);
      }
    }
    if (fx.jet) {
      if (B) jetTick(B, fx.jet.p, fx.jet.d, dt, fx.weight, Math.max(0.15, left), fx.acc);
      fx.hiss -= dt;
      if (near < 14 && fx.hiss <= 0) {
        fx.hiss = 1.1;
        this.sfx?.cue('hiss', { dur: 1.2, vol: (1 - near / 14) * Math.max(0.2, left) });
      }
    }
    // The cutaway's marker breathes (and, in a drum, turns with it).
    if (this.job?.room.drum) this.placeMarker();
    this.marker.scale.setScalar(this.markScale * (1 + 0.25 * Math.sin(t * 5)));
  }

  /** You at work, one frame (looks only): the extinguisher's powder at the fire from your hands, the welder's arc on the
   *  pipe. `walker.pos` is in the job's interior's frame. */
  working(job, walker, dt) {
    const fx = job.fx, B = fx.B;
    if (!B) return;
    if (fx.fire) {
      const to = _f.copy(fx.fire.p).addScaledVector(fx.fire.n, 0.3);
      const hand = _h.set(walker.pos.x, walker.pos.y + 1.2, walker.pos.z);
      hand.addScaledVector(_d.subVectors(to, hand).normalize(), 0.45);
      sprayTick(B, hand, to, dt, fx.acc);
    } else if (fx.jet) {
      const toYou = _d.set(walker.pos.x - fx.jet.p.x, 0, walker.pos.z - fx.jet.p.z).normalize();
      weldTick(B, fx.jet.p, toYou, dt, fx.weight, fx.acc);
      fx.light.intensity = 20 * (0.5 + Math.random());
      fx.welded = this.time;
    }
  }

  makeMarker() {
    const g = new THREE.Group();
    // A ring on the floor and a beam up out of the hull, scaled with the cutaway's own pin (`markScale`) so it keeps its
    // size on screen however far out you zoom.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.4, 6, 28), MARK);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    g.add(ring, at(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 20, 6), MARK), 0, 10, 0));
    g.renderOrder = 5;
    g.visible = false;
    return g;
  }

  // --- doing the job ---

  need(job) {
    return job.K.work * (job.kind === 'fire' ? job.size : 1);
  }

  /** E pressed at the job: tells you what is missing, if anything. Holding E does the work (`frame`). */
  press() {
    const why = this.blocked();
    if (why) this.say(null, why);
  }

  blocked() {
    const job = this.job;
    if (!job) return null;
    if (job.K.isolate && !job.isolated) {
      const sb = this.switchboard();
      this.sfx?.cue('clunk', { vol: 0.3 });
      return `It's live. Isolate the supply first, at the ${sb.name.toLowerCase()} (deck ${sb.deck}, frame ${frameOf(this.L, (sb.z[0] + sb.z[1]) / 2)}).`;
    }
    if (!this.carry.has(job.K.kit)) return `You need ${this.D.kits[job.K.kit].name}. ${this.whereKit(job.K.kit)}`;
    return null;
  }

  switchboard() {
    return this.C.rooms.get(this.D.switchboards?.[0]);
  }

  whereKit(k) {
    const kit = this.D.kits[k];
    const parts = kit.kept ? [kit.kept] : [];
    for (const id of kit.rooms ?? []) parts.push(`the ${this.C.rooms.get(id).name.toLowerCase()}`);
    return parts.length ? `Try ${parts.join(', or ')}.` : '';
  }

  isolate() {
    const job = this.job;
    if (!job?.K.isolate || job.isolated) return;
    job.isolated = true;
    this.sfx?.cue('clunk', { vol: 0.8 });
    this.say(null, `Supply to the ${job.room.name.toLowerCase()} isolated. It is safe to work on.`);
  }

  /** Each frame. `f` is the input frame, `walker` the walker (its nearest use), `mode` the seat. */
  frame(dt, f, walker, mode) {
    if (!this.D) return;
    this.time += dt;
    if (this.msg) (this.msg.t -= dt), this.msg.t <= 0 && (this.msg = null);
    const job = this.job;
    if (!job) {
      // A job a hit started while another was on comes up a few seconds after that one ends.
      if (this.pending.length) (this.gap = (this.gap ?? 4) - dt), this.gap <= 0 && ((this.gap = 4), this.raise(this.pending[0].kind, this.pending[0].where, this.pending.shift().opts));
      else if (this.auto && mode === 'walk') (this.wait -= dt), this.wait <= 0 && this.raise();
      return this.card(mode);
    }
    job.t += dt;
    // Fire needs air: a fire in a compartment that has vented goes out by itself.
    if (job.kind === 'fire' && this.airOf && this.airOf(job.room.id) < 40) return this.end(true, '', false, `The fire in the ${job.room.name.toLowerCase()} went out when the compartment lost its air.`);
    const near = mode === 'walk' && walker.interior === job.I ? Math.hypot(walker.pos.x - job.spot.x, walker.pos.z - job.spot.z) : 99;
    const working = mode === 'walk' && f.keys.has('KeyE') && walker.nearestUse() === job.use && !this.blocked();
    if (working) {
      job.progress += dt;
      const kit = this.carry.get(job.K.kit);
      if (kit.agent !== Infinity) {
        kit.agent -= dt;
        if (kit.agent <= 0) {
          this.carry.delete(job.K.kit);
          this.say(null, `The ${this.D.kits[job.K.kit].label.toLowerCase()} is empty. ${this.whereKit(job.K.kit)}`);
        }
      }
      this.working(job, walker, dt);
      if (this.workSound <= 0 || this.workSound === undefined) (this.workSound = 0.5), this.sfx?.cue('hiss', { dur: 0.6, vol: 0.5 });
      this.workSound -= dt;
    } else if (job.kind === 'fire') {
      // A fire you are not fighting grows.
      job.idle += dt;
      if (job.idle >= job.K.grows) {
        job.idle = 0;
        job.size++;
        if (job.size >= job.K.lost) return this.end(false, `The fire in the ${job.room.name.toLowerCase()} could not be held. The compartment is sealed and flooded with suppressant.`);
        this.C.bus?.emit('call', { id: 'damage-spreading', room: job.room.id });
        this.say(null, `The fire is spreading (${job.size} of ${job.K.lost - 1}).`);
      }
    }
    if (job.kind === 'electrical' && !job.isolated && job.t >= job.K.after) {
      const room = job.room.id;
      this.end(false, `The fault in the ${job.room.name.toLowerCase()} has started a fire.`);
      return this.raise(job.K.becomes, room);
    }
    if (job.kind === 'leak' && job.t >= job.K.lost) return this.end(false, 'The section was isolated from the main, and lost its coolant.');
    if (job.progress >= this.need(job)) return this.end(true);
    job.use.label = working ? `${VERB[job.kind]}: ${Math.round((100 * job.progress) / this.need(job))}%` : `Hold E: ${VERB[job.kind].toLowerCase()}`;
    job.use.key = working ? '' : 'E';
    if (job.fx.jet && !working) job.fx.light.intensity = 0; // the arc is out when you stop
    this.animate(job, dt, near);
    this.card(mode);
  }

  end(ok, why = '', quiet = false, note = null) {
    const job = this.job;
    if (!job) return;
    this.C.bus?.emit('job-end', { job, ok }); // the integrity mends the room, the career hears how it went
    const fx = job.fx;
    fx.g.removeFromParent();
    if (fx.light) job.I.lights.splice(job.I.lights.indexOf(fx.light), 1);
    for (const l of fx.lamps) (l.intensity = l.dcBase), l.color.copy(l.dcColor);
    job.I.interactables.splice(job.I.interactables.indexOf(job.use), 1);
    this.marker.visible = false;
    if (job.K.kit === 'patch' && ok) this.carry.delete('patch'); // a patch stays on the pipe
    this.job = null;
    this.wait = this.D.between[0] + this.rand() * (this.D.between[1] - this.D.between[0]);
    const mins = fmt(job.t);
    this.log.push({ kind: job.kind, room: job.room.id, ok, t: job.t });
    if (quiet) return;
    if (note) return this.say(null, note, 0, 7);
    if (ok) {
      const grade = job.t < 60 ? 'Smartly done.' : job.t < 120 ? 'Well done.' : 'Done, but it took a while.';
      this.sfx?.cue('chime');
      this.C.bus?.emit('call', { id: 'damage-done', room: job.room.id, out: `${OUT[job.kind]}.` });
      this.say(null, `${OUT[job.kind]} in ${mins}. ${grade}`, 0, 7);
    } else {
      this.sfx?.cue('klaxon', { n: 1 });
      this.say(null, why, 0, 8);
    }
  }

  // --- the job card and the speakers ---

  /** Shows `text` on the card for `secs`. (`call` and `delay` are gone: the ship's calls are said on the bus as
   *  `call` events, and the announcer, src/core/announcer.mjs, decides who hears them.) */
  say(call, text, delay = 0, secs = 5) {
    if (call) console.warn('dc.say(call) is gone: emit a call on the bus', call);
    if (text) this.msg = { text, t: secs };
  }

  card(mode) {
    const el = this.el;
    if (!el) return;
    const job = this.job;
    const show = (mode === 'walk' || mode === 'cutaway') && (job || this.msg);
    el.hidden = !show;
    if (!show) return;
    let html = '';
    if (job) {
      const K = job.K, kit = this.D.kits[K.kit];
      const deck = { name: this.C.deckName(job.room.deck) };
      const steps = [];
      if (K.isolate) {
        const sb = this.switchboard();
        steps.push([job.isolated, `Isolate the supply at the ${sb.name.toLowerCase()}, deck ${sb.deck}, frame ${frameOf(this.L, (sb.z[0] + sb.z[1]) / 2)}`]);
      }
      const has = this.carry.has(K.kit);
      steps.push([has || job.progress > 0, `Get ${kit.name}${has ? '' : `: ${this.whereKit(K.kit).replace(/^Try /, '').replace(/\.$/, '')}`}`]);
      steps.push([false, `${VERB[job.kind]}: hold E${job.progress ? ` (${Math.round((100 * job.progress) / this.need(job))}%)` : ''}`]);
      const left = job.kind === 'fire' ? `size ${job.size} of ${K.lost - 1}` : job.kind === 'electrical' ? (job.isolated ? 'isolated' : `fire risk in ${fmt(Math.max(0, K.after - job.t))}`) : `lost in ${fmt(Math.max(0, K.lost - job.t))}`;
      html += `<div class="j-head"><b class="j-kind ${job.kind}">${K.name}</b><span>${fmt(job.t)}</span></div>
        <div class="j-room">${job.room.name}</div>
        <div class="j-where"><code>${job.code}</code> ${deck.name.toLowerCase()} · frame ${frameOf(this.L, job.spot.z)} · ${job.side}</div>
        <ol class="j-steps">${steps.map(([done, s]) => `<li${done ? ' class="done"' : ''}>${s}</li>`).join('')}</ol>
        <div class="j-state">${left}</div>`;
    }
    const carried = [...this.carry].map(([k, v]) => this.D.kits[k].label + (v.agent !== Infinity ? ` (${Math.ceil(v.agent)} s)` : ''));
    if (carried.length) html += `<div class="j-carry">Carrying: ${carried.join(', ')}</div>`;
    if (this.msg) html += `<div class="j-msg">${this.msg.text}</div>`;
    if (html !== this.lastHtml) (el.innerHTML = html), (this.lastHtml = html);
  }
}

function fmt(s) {
  s = Math.floor(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
