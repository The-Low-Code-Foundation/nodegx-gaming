// The ship's integrity: what each compartment holds (air, health) and what a hit does to it. Every compartment in the
// layout, walkable or sealed, is a volume of air with a health. A shell comes in from outside on a straight line: it
// crosses the hull wherever that line meets it, then the compartments on its path, and stops where its penetration
// runs out. The first compartment it enters is holed to space; each one after that is holed to the one before (the
// shell's own channel). Every compartment on the path loses health, the one it stops in most.
//
// Then the air does what air does:
//
// - A hole to space vents its compartment: the air goes at a rate set by the hole's area over the room's volume, so a
//   fist-sized hole empties a cabin in a minute and a big one in seconds. A hole between two compartments lets them
//   share air.
// - Pressure doors stand open on every doorway and close by themselves when the air on either side starts to fall
//   below `doorsShut`, sealing the leak off from the rest of the ship. A shut door opens again once both sides are back
//   up; E opens one by hand if the two sides are close enough in pressure, and never onto a vacuum. The ladders' hatches
//   do the same, without the doors you see.
// - Life support puts air back into any compartment that is no longer losing it.
// - The repair drones in the drone bay fly out to every hole to space and seal it, one drone a hole. Inside, you can
//   put a patch on a hole yourself, with a patch kit (hold E), which is quicker.
//
// What the damage does to the ship, from each system's health (volume-weighted over its compartments):
//
// - the reactor: below 35% the ship is on emergency power, the lights dim and the main drives stop;
// - the main drive and each manoeuvring cluster (the compartment it is fixed to): their thrust falls with their health;
// - life support: how fast the air comes back;
// - the drone bay: no drones go out once it is wrecked.
//
// And what it does to you: the air you breathe is your compartment's. A venting room pulls you toward the hole; below
// `faint` you have seconds before you black out, and a damage control party drags you to the nearest room with air.
//
// Fires, electrical faults and coolant leaks (damage.mjs's jobs) now come from hits: a hit that does real damage to a
// walkable room can start one there. And an attack is what makes hits: every few minutes a raider makes a firing pass
// down one side (`attack`), and the speakers call out what it hit.
//
// The layout's `integrity` entry has every number.

import * as THREE from 'three';
import { box, at, mat, mulberry, clamp } from '../util.mjs';
import { hazardMat } from '../decor.mjs';
import { facing, roomAt } from './layout.mjs';
import { frameOf, sideOf, portals } from './wayfinding.mjs';

const DOOR_H = 2.5;
const SIDES = {
  port: new THREE.Vector3(1, 0, 0),
  starboard: new THREE.Vector3(-1, 0, 0),
  above: new THREE.Vector3(0, -1, 0),
  below: new THREE.Vector3(0, 1, 0)
};

// Shared looks.
const HOLE = new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide });
const PATCH = new THREE.MeshLambertMaterial({ color: '#c8a030', side: THREE.DoubleSide });
const SCORCH = new THREE.MeshBasicMaterial({ color: '#1c1a18', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
const MIST = new THREE.PointsMaterial({ color: '#dfe8f0', size: 0.06, transparent: true, opacity: 0.75, depthWrite: false });
const MARK_HOLE = new THREE.MeshBasicMaterial({ color: '#ff2a2a', toneMapped: false, depthTest: false, transparent: true });
const MARK_SEALED = new THREE.MeshBasicMaterial({ color: '#e8c040', toneMapped: false, depthTest: false, transparent: true });
const MARK_DRONE = new THREE.MeshBasicMaterial({ color: '#5ff0ff', toneMapped: false, depthTest: false, transparent: true });
const FLASH = new THREE.MeshBasicMaterial({ color: '#ffb060', transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const TRACER = new THREE.MeshBasicMaterial({ color: '#ffd890', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
for (const m of [MARK_HOLE, MARK_SEALED, MARK_DRONE]) m.userData.uncut = true;

/** A compartment's box in the ship's frame: x, y and z ranges. A walkable room runs from its deck's floor up. */
export function boxOf(L, c) {
  if (c.access === 'sealed') return { x: c.x, y: c.y, z: c.z };
  const f = L.decks.find((d) => d.id === c.deck).floor;
  return { x: c.x, y: [f, f + (c.h ?? 3)], z: c.z };
}

const inside = (b, p, m = 0) => p.x >= b.x[0] - m && p.x <= b.x[1] + m && p.y >= b.y[0] - m && p.y <= b.y[1] + m && p.z >= b.z[0] - m && p.z <= b.z[1] + m;

/** The hull's cross-section at z (lerped between the layout's sections), or null beyond its ends. */
function section(list, z) {
  if (z < list[0].z || z > list.at(-1).z) return null;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (z > b.z) continue;
    const k = (z - a.z) / Math.max(1e-6, b.z - a.z);
    return { w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k, y: a.y + (b.y - a.y) * k };
  }
  return null;
}

export class Integrity {
  /** `dc`: the damage control (jobs, kit, the speakers). `thrusters`: the carrier's thruster list (newton.mjs).
   *  `auto`: attacks come by themselves. `hooks.rescue(room)`: carry the player into that room. `hooks.raid(from)`: send
   *  a raider in from that side (weapons.mjs); without it an attack is a pass of shells from out of sight. */
  constructor(C, { dc, sfx, thrusters = [], auto = true, seed = Date.now(), hooks = {} } = {}) {
    this.C = C;
    this.L = C.L;
    this.N = C.L.integrity;
    this.dc = dc;
    this.sfx = sfx;
    this.hooks = hooks;
    this.auto = auto && !!this.N?.attack;
    this.rand = mulberry(seed % 2147483647);
    this.time = 0;
    const A = this.N.air;
    // Every compartment is a node of the air network.
    this.nodes = new Map();
    for (const c of C.L.compartments) {
      const b = boxOf(C.L, c);
      const vol = (b.x[1] - b.x[0]) * (b.y[1] - b.y[0]) * (b.z[1] - b.z[0]);
      this.nodes.set(c.id, { c, b, vol, air: A.nominal, health: 100, rate: 0, was: A.nominal, drain: null, holes: [], low: false, green: 0 });
    }
    this.links = []; // doors and hatches between walkable rooms
    this.holes = [];
    this.events = []; // scheduled: tracers, hits, calls
    this.fx = []; // flashes and tracers in flight
    this.drones = [];
    this.wait = this.N.attack?.first ?? 90;
    this.shake = 0;
    this.hypoxia = 0;
    this.rescuing = false;
    this.log = [];
    this.buildDoors();
    this.buildHatches();
    this.buildOverlay();
    // Which compartment each manoeuvring cluster is fixed to: the nearest one to it.
    this.thrusters = thrusters;
    for (const t of thrusters) {
      if (t.kind !== 'rcs') continue;
      let best = null, bd = Infinity;
      const p = t.at;
      for (const n of this.nodes.values()) {
        const q = new THREE.Vector3(clamp(p.x, n.b.x[0], n.b.x[1]), clamp(p.y, n.b.y[0], n.b.y[1]), clamp(p.z, n.b.z[0], n.b.z[1]));
        const d = q.distanceTo(p);
        if (d < bd) (bd = d), (best = n);
      }
      t.node = best;
    }
    this.systems();
    this.veil = document.getElementById('c-veil');
    this.gauge = document.getElementById('c-air');
    this.board = document.getElementById('c-ship');
    this.boardT = 0;
  }

  node(id) {
    return this.nodes.get(id);
  }

  /** The air in compartment `id`, kPa. */
  airOf(id) {
    return this.nodes.get(id)?.air ?? this.N.air.nominal;
  }

  // --- build: the pressure doors and the hatches ---------------------------------------------------------------------

  buildDoors() {
    const C = this.C;
    const steel = mat('#6a7380'), frame = mat('#3a4048');
    this.L.doors.forEach((d, i) => {
      const [A, B] = d.between.map((id) => C.rooms.get(id));
      const rel = facing(A, B);
      const I = C.decks.get(A.deck);
      const y = I.floorY;
      const alongX = rel.along === 'z'; // the doorway runs along x when you walk through it along z
      const line = (rel.a1 + rel.a2) / 2; // the middle of the gap between the two rooms' walls
      const a = d.at - d.w / 2, b = d.at + d.w / 2;
      // The leaf: a slab with hazard edges and a dogging wheel each side. It slides sideways into the gap between the
      // rooms' walls (or into the wall itself, where they touch), so open, it is out of sight.
      const leaf = new THREE.Group();
      leaf.add(at(box(d.w, DOOR_H, 0.08, steel), 0, 0, 0));
      for (const s of [-1, 1]) {
        leaf.add(at(box(0.12, DOOR_H, 0.1, hazardMat()), s * (d.w / 2 - 0.06), 0, 0));
        leaf.add(at(box(0.36, 0.04, 0.04, frame), 0, 0.05, s * 0.07), at(box(0.04, 0.36, 0.04, frame), 0, 0.05, s * 0.07));
      }
      if (!alongX) leaf.rotation.y = Math.PI / 2;
      const mid = (a + b) / 2;
      leaf.position.set(alongX ? mid : line, y + DOOR_H / 2, alongX ? line : mid);
      const travel = alongX ? new THREE.Vector3(d.w + 0.05, 0, 0) : new THREE.Vector3(0, 0, d.w + 0.05);
      const col = alongX ? [[a, y, line - 0.12], [b, y + DOOR_H, line + 0.12]] : [[line - 0.12, y, a], [line + 0.12, y + DOOR_H, b]];
      const door = I.door(`pdoor-${i}`, leaf, travel, { collide: col });
      door.set(1);
      // A lamp over the doorway, through the wall so both sides see it: green open, amber moving, red shut on a vacuum.
      const lampMat = new THREE.MeshBasicMaterial({ color: '#2aff6a', toneMapped: false });
      const depth = Math.abs(rel.a2 - rel.a1) + 0.7;
      const lamp = alongX ? at(box(0.3, 0.1, depth, lampMat), mid, y + DOOR_H + 0.25, line) : at(box(depth, 0.1, 0.3, lampMat), line, y + DOOR_H + 0.25, mid);
      lamp.userData.live = true;
      I.group.add(lamp);
      const u = I.use(`pdoor-${i}`, 'Open the pressure door', alongX ? mid : line, alongX ? line : mid, () => this.tryOpen(link), { r: 2.2 });
      const link = { kind: 'door', a: A.id, b: B.id, area: d.w * DOOR_H, open: true, k: 1, door, lamp, lampMat, use: u, deck: A.deck, quiet: 0, x: alongX ? mid : line, z: alongX ? line : mid };
      u.hidden = () => link.open || link.k > 0.5;
      this.links.push(link);
    });
  }

  buildHatches() {
    const C = this.C;
    for (const l of this.L.ladders) {
      const ra = roomAt(C, l.a.deck, ...l.a.at), rb = roomAt(C, l.b.deck, ...l.b.at);
      if (!ra || !rb) continue;
      this.links.push({ kind: 'hatch', ladder: l, a: ra.id, b: rb.id, area: 1.2, open: true, k: 1, quiet: 0 });
    }
  }

  /** Whether you can climb through a ladder's hatch: `main.mjs` asks before it moves you up or down. A shut hatch you
   *  open, climb through and dog behind you, as long as the air is the same both sides; never onto a vacuum. */
  hatchOpen(l) {
    const h = this.links.find((k) => k.ladder === l);
    return !h || h.open || Math.abs(this.airOf(h.a) - this.airOf(h.b)) <= this.N.air.openWithin;
  }

  /** E on a shut door: open it if the two sides are close enough in pressure, else say why not. */
  tryOpen(link) {
    const pa = this.airOf(link.a), pb = this.airOf(link.b);
    if (Math.abs(pa - pb) > this.N.air.openWithin) {
      const far = pa < pb ? link.a : link.b;
      const p = Math.min(pa, pb);
      this.sfx?.cue('clunk', { vol: 0.3 });
      this.dc?.say(null, `The door won't open: ${Math.round(p)} kPa in the ${this.C.rooms.get(far).name.toLowerCase()}${p < 10 ? ', near vacuum' : ''}.`);
      return;
    }
    link.open = true;
    link.hold = 5; // long enough to step through; at action stations it shuts again after that
    this.sfx?.cue('servo', { dur: 1.2 });
  }

  // --- build: the cutaway's damage colours ---------------------------------------------------------------------------

  buildOverlay() {
    this.overlay = new THREE.Group();
    this.C.overlay.add(this.overlay);
    for (const n of this.nodes.values()) {
      const { b } = n;
      const m = new THREE.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: 0.4, depthWrite: false });
      const mesh = at(new THREE.Mesh(new THREE.BoxGeometry(b.x[1] - b.x[0] + 0.3, b.y[1] - b.y[0] + 0.3, b.z[1] - b.z[0] + 0.3), m), (b.x[0] + b.x[1]) / 2, (b.y[0] + b.y[1]) / 2, (b.z[0] + b.z[1]) / 2);
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.overlay.add(mesh);
      n.tint = mesh;
    }
  }

  // --- hits ------------------------------------------------------------------------------------------------------------

  /** Is a point (ship frame) inside the hull? */
  inHull(p) {
    for (const list of [this.L.hull.main, this.L.hull.island]) {
      const s = section(list, p.z);
      if (s && Math.abs(p.x) <= s.w / 2 && Math.abs(p.y - s.y) <= s.h / 2) return true;
    }
    return false;
  }

  compartmentAt(p) {
    for (const n of this.nodes.values()) if (inside(n.b, p)) return n;
    return null;
  }

  /** Picks a compartment, weighted by its volume (a big target is hit more often). */
  pick() {
    const all = [...this.nodes.values()];
    let t = this.rand() * all.reduce((s, n) => s + n.vol, 0);
    for (const n of all) if ((t -= n.vol) <= 0) return n;
    return all[0];
  }

  /**
   * A shell, now. `target` (a compartment id) is what it was aimed at, `from` the side it comes from (port, starboard,
   * above, below); `pen` the metres of ship it goes through, `damage` the health it takes from what it passes through,
   * `hole` the hole's area in m². Anything left out is dealt from the layout's `integrity.shell`. Returns what it did.
   */
  hit(opts = {}) {
    const shot = this.aim(opts);
    return shot && this.strike(shot);
  }

  /** Where a shell would come in: its line, where it meets the hull, and its numbers. Nothing happens yet. */
  aim({ target, from, pen, damage, hole } = {}) {
    const S = this.N.shell;
    const n0 = target ? this.nodes.get(target) : this.pick();
    if (!n0) return null;
    const r = this.rand;
    from ??= ['port', 'starboard', 'above', 'below'][Math.floor(r() * 4)];
    pen ??= S.pen[0] + r() * (S.pen[1] - S.pen[0]);
    damage ??= S.damage[0] + r() * (S.damage[1] - S.damage[0]);
    hole ??= S.hole[0] + r() * (S.hole[1] - S.hole[0]);
    // Aim at a point inside the target, come in from that side with a little slant.
    const b = n0.b;
    const aim = new THREE.Vector3(b.x[0] + (b.x[1] - b.x[0]) * (0.2 + 0.6 * r()), b.y[0] + (b.y[1] - b.y[0]) * (0.2 + 0.6 * r()), b.z[0] + (b.z[1] - b.z[0]) * (0.2 + 0.6 * r()));
    const dir = SIDES[from].clone().add(new THREE.Vector3((r() - 0.5) * 0.3, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3)).normalize();
    // Where that line meets the hull.
    const p = aim.clone().addScaledVector(dir, -160);
    let entry = null;
    for (let s = 0; s < 200; s += 0.4) {
      p.addScaledVector(dir, 0.4);
      if (this.inHull(p)) {
        entry = p.clone();
        break;
      }
    }
    if (!entry) return null;
    return { target: n0.c.id, from, dir, entry, pen, damage, hole };
  }

  /** The shell arrives: through the ship along its line, holing and hurting what it passes, bursting where it stops. */
  strike({ from, dir, entry, pen, damage, hole }) {
    const path = [];
    let prev = null, last = null;
    const q = new THREE.Vector3();
    let stop = entry.clone();
    for (let s = 0; s <= pen; s += 0.4) {
      q.copy(entry).addScaledVector(dir, s);
      if (!this.inHull(q) && s > 2) break; // out the other side
      stop.copy(q);
      const n = this.compartmentAt(q);
      if (n && n !== prev) {
        // A new compartment: holed at the face the shell came through, to space or to the compartment before.
        const face = this.face(n.b, q, dir);
        this.makeHole(n, last, face.at, face.n, last ? hole * 0.7 : hole);
        this.hurt(n, damage * (1 - (0.5 * s) / pen));
        path.push(n);
        last = n;
      }
      prev = n;
    }
    // It goes off where it stops: the most damage there, some to the compartments round it.
    const burst = this.compartmentAt(stop) ?? last;
    if (burst) this.hurt(burst, damage * 0.8);
    for (const n of this.nodes.values()) {
      if (n === burst || !inside(n.b, stop, 4)) continue;
      this.hurt(n, damage * 0.3);
    }
    const res = { from, entry, stop, path: path.map((n) => n.c.id), burst: burst?.c.id ?? null };
    this.log.push(res);
    this.impact(entry, dir);
    this.consequences(path, burst);
    return res;
  }

  /** Takes `damage` from a compartment's health. A shell wrecks what is near it, so a big space (a machinery room the
   *  size of a hall) loses less of itself than a cabin does: the damage is scaled by sqrt(600 m³ / its volume). */
  hurt(n, damage) {
    n.health = Math.max(0, n.health - damage * clamp(Math.sqrt(600 / n.vol), 0.2, 1));
  }

  /** Where a ray entering box `b` at `q` (going `dir`) crossed its face: the point on the face, and the face's normal
   *  pointing into the box. */
  face(b, q, dir) {
    const back = q.clone().addScaledVector(dir, -0.4);
    let axis = 'x', best = -Infinity;
    for (const k of ['x', 'y', 'z']) {
      const lo = b[k][0], hi = b[k][1];
      const out = back[k] < lo ? lo - back[k] : back[k] > hi ? back[k] - hi : -1;
      if (out > best) (best = out), (axis = k);
    }
    const n = new THREE.Vector3();
    n[axis] = Math.sign(dir[axis]) || 1;
    const p = q.clone();
    p[axis] = n[axis] > 0 ? b[axis][0] : b[axis][1];
    return { at: p, n };
  }

  makeHole(n, to, p, normal, area) {
    const h = { n, to, at: p.clone(), normal: normal.clone(), area, sealed: false, patch: 0, drone: null, t: 0 };
    n.holes.push(h);
    if (to) to.holes.push(h);
    this.holes.push(h);
    // In a walkable room you see it: a ragged black hole in the plating, glowing at its edge for a while.
    if (n.c.access === 'walk') this.holeLook(h, n);
    else if (to?.c.access === 'walk') this.holeLook(h, to, true);
    // In the cutaway: a red dot, yellow once it is sealed.
    h.mark = at(new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), MARK_HOLE), p.x, p.y, p.z);
    h.mark.renderOrder = 6;
    this.overlay.add(h.mark);
    return h;
  }

  holeLook(h, n, far = false) {
    const I = this.C.decks.get(n.c.deck);
    const r = Math.sqrt(h.area / Math.PI);
    const g = new THREE.Group();
    g.userData.live = true;
    // A ragged disc: black, inside a ring of torn metal that glows hot and cools.
    const pts = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, rr = r * (0.75 + 0.5 * this.rand());
      pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
    }
    const black = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), HOLE);
    const rimMat = new THREE.MeshBasicMaterial({ color: '#ff8a3a', transparent: true, opacity: 1, toneMapped: false, side: THREE.DoubleSide });
    const rim = new THREE.Mesh(new THREE.RingGeometry(r * 0.85, r * 1.18, 14), rimMat);
    rim.position.z = -0.004;
    // Round it, the paint burnt off: a ragged scorch.
    const sp = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, rr = r * (1.6 + 0.7 * this.rand());
      sp.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
    }
    const scorch = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(sp)), SCORCH);
    scorch.position.z = -0.008;
    g.add(scorch, rim, black);
    // Facing into the room, just proud of the wall (walls are 0.2 thick on their line), the floor or the ceiling. A
    // hole from the compartment next door is on this room's own facing wall, across the gap between them.
    const into = far ? h.normal.clone().negate() : h.normal.clone();
    const b = n.b;
    const on = new THREE.Vector3(clamp(h.at.x, b.x[0] + r, b.x[1] - r), clamp(h.at.y, b.y[0] + r, b.y[1] - r), clamp(h.at.z, b.z[0] + r, b.z[1] - r));
    for (const k of ['x', 'y', 'z']) if (into[k]) on[k] = into[k] > 0 ? b[k][0] : b[k][1];
    g.position.copy(on).addScaledVector(into, 0.13);
    g.lookAt(g.position.clone().add(into));
    this.setClip(HOLE, PATCH, SCORCH, rimMat, MIST);
    I.group.add(g);
    h.look = { g, rimMat, I, r, into };
    // The mist: air and loose dust streaming to the hole.
    const N = 70;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const mist = new THREE.Points(geo, MIST);
    mist.frustumCulled = false;
    mist.userData.live = true;
    I.group.add(mist);
    h.look.mist = mist;
    h.look.seeds = Array.from({ length: N }, () => ({ k: this.rand(), a: this.rand() * Math.PI * 2, s: 0.5 + this.rand() }));
    // Inside, you can patch it.
    const u = I.use(`hole-${this.holes.length}`, 'Patch the hole', g.position.x + into.x * (Math.abs(into.y) > 0.5 ? 0 : 0.9), g.position.z + into.z * (Math.abs(into.y) > 0.5 ? 0 : 0.9), () => this.pressPatch(h), { r: 2.6 });
    u.hidden = () => h.sealed;
    h.use = u;
    h.room = n;
  }

  setClip(...mats) {
    if (!this.C.clipPlanes) return;
    for (const m of mats) if (m.clippingPlanes !== this.C.clipPlanes) (m.clippingPlanes = this.C.clipPlanes), (m.needsUpdate = true);
  }

  pressPatch(h) {
    if (h.sealed) return;
    if (!this.dc?.carry.has('patch')) this.dc?.say(null, `You need a patch kit to plug it. ${this.dc.whereKit('patch')}`);
  }

  seal(h, by) {
    if (h.sealed) return;
    h.sealed = true;
    h.by = by;
    h.mark.material = MARK_SEALED;
    if (h.look) {
      const { g, r } = h.look;
      g.add(at(new THREE.Mesh(new THREE.CircleGeometry(r * 1.7, 16), PATCH), 0, 0, 0.01));
      h.look.mist.visible = false;
      h.look.rimMat.opacity = 0;
    }
    const where = h.n.c.access === 'walk' ? h.n : h.to?.c.access === 'walk' ? h.to : h.n;
    this.dc?.say(null, by === 'you' ? `Hole patched in the ${where.c.name.toLowerCase()}.` : `Drones have sealed the hole in the ${where.c.name.toLowerCase()}.`, 0, 4);
    this.sfx?.cue('clunk', { vol: 0.4 });
  }

  /** The flash where it struck, the bang and the shake you feel aboard. */
  impact(p, dir) {
    const f = at(new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), FLASH.clone()), p.x, p.y, p.z);
    f.userData.uncut = true;
    this.C.frame.add(f);
    this.fx.push({ mesh: f, t: 0, life: 0.6, kind: 'flash' });
    const you = this.you ?? new THREE.Vector3();
    const d = you.distanceTo(p);
    this.shake = Math.max(this.shake, 1.6 / (1 + d / 25));
    this.sfx?.play('boom', Math.min(1000, 120 + d * 3), 40);
  }

  /** A tracer streaking in from far out toward `p`, for `secs`. */
  tracer(p, dir, secs) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 26), TRACER);
    this.C.frame.add(m);
    this.fx.push({ mesh: m, t: 0, life: secs, kind: 'tracer', from: p.clone().addScaledVector(dir, -900), to: p.clone(), dir: dir.clone() });
    m.position.copy(p).addScaledVector(dir, -900);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  }

  /** What a hit starts: a fire, an electrical fault or a coolant leak in the walkable room it hurt most, called out. */
  consequences(path, burst) {
    const J = this.N.jobs;
    const walk = path.filter((n) => n.c.access === 'walk' && n.c.system !== 'hangar' && n.air > this.N.air.unsafe);
    const hurt = (burst?.c.access === 'walk' && burst.c.system !== 'hangar' && burst.air > this.N.air.unsafe ? burst : null) ?? walk.at(-1);
    if (hurt && this.dc) {
      const c = hurt.c, r = this.rand();
      const elec = ['power', 'bridge', 'sensors', 'aux', 'engineering', 'repair', 'flight'].includes(c.system);
      if (c.system === 'corridor') r < J.leak && this.dc.placesFor(this.dc.D.kinds.leak).includes(c) && this.dc.queue('leak', c.id);
      else if (elec && r < J.electrical) this.dc.queue('electrical', c.id);
      else if (r < J.fire) this.dc.queue('fire', c.id);
    }
    // The call: the first breach of a walkable space by name, or what was hit.
    const breached = path.find((n) => n.c.access === 'walk') ?? path[0];
    if (!breached) return;
    const h = breached.holes.at(-1);
    const deck = breached.c.access === 'walk' ? this.L.decks.find((d) => d.id === breached.c.deck).name.toLowerCase() : null;
    const z = h?.at.z ?? (breached.b.z[0] + breached.b.z[1]) / 2;
    const where = deck ? `${deck[0].toUpperCase() + deck.slice(1)}, frame ${frameOf(this.L, z)}, ${sideOf(h?.at.x ?? 0)}.` : `Frame ${frameOf(this.L, z)}.`;
    const what = breached.c.access === 'walk' ? 'Hull breach' : 'Hit';
    this.dc?.say(`${what} in the ${breached.c.name.toLowerCase()}. ${where}`, `${what}: ${breached.c.name}. ${where}`, 400, 6);
  }

  // --- attacks -------------------------------------------------------------------------------------------------------

  /** A raider's firing pass down one side: the alarm, the call, then its shells a second or so apart. */
  attack(from) {
    const A = this.N.attack;
    from ??= ['port', 'starboard', 'above', 'below'][Math.floor(this.rand() * 4)];
    const n = A.hits[0] + Math.floor(this.rand() * (A.hits[1] - A.hits[0] + 1));
    this.sfx?.cue('klaxon', { n: 5 });
    const side = { port: 'to port', starboard: 'to starboard', above: 'from above', below: 'from below' }[from];
    this.stations = true;
    for (const l of this.links) (l.open = false), (l.hold = 0);
    this.wait = A.between[0] + this.rand() * (A.between[1] - A.between[0]);
    if (this.hooks.raid) {
      // A raider you can see and fight (weapons.mjs): its own shells make the hits, and it says when the raid is over.
      this.dc?.say(`Action stations, action stations. Raider closing ${side}. Gun crews close up. Close all pressure doors.`, `Action stations: a raider closing ${side}. Gun crews closing up; all pressure doors closing.`, 300, 6);
      this.standAt = Infinity;
      this.hooks.raid(from);
      return 0;
    }
    this.dc?.say(`Action stations, action stations. Incoming fire ${side}. Close all pressure doors. Brace, brace, brace.`, `Action stations: incoming fire ${side}. All pressure doors closing.`, 300, 6);
    let last = this.time;
    for (let i = 0; i < n; i++) {
      const t = this.time + A.lead + i * (0.8 + this.rand() * 0.9);
      last = t;
      this.events.push({ t, fn: () => this.volley(from) });
    }
    this.standAt = last + A.stand;
    return n;
  }

  /** The raider is gone (destroyed or breaking off): stand down `attack.stand` seconds from now. */
  raidOver() {
    if (this.stations) this.standAt = this.time + this.N.attack.stand;
  }

  /** A shell that flew here (weapons.mjs) meets the hull at `entry` going `dir` (both in the ship's frame): what it
   *  does is dealt from the layout's `integrity.shell` like any other, unless `opts` says. */
  arrive(entry, dir, opts = {}) {
    const S = this.N.shell, r = this.rand;
    const ax = Math.abs(dir.x) >= Math.abs(dir.y) ? 'x' : 'y';
    const from = ax === 'x' ? (dir.x > 0 ? 'port' : 'starboard') : dir.y > 0 ? 'below' : 'above';
    return this.strike({
      from, dir: dir.clone().normalize(), entry: entry.clone(),
      pen: opts.pen ?? S.pen[0] + r() * (S.pen[1] - S.pen[0]),
      damage: opts.damage ?? S.damage[0] + r() * (S.damage[1] - S.damage[0]),
      hole: opts.hole ?? S.hole[0] + r() * (S.hole[1] - S.hole[0])
    });
  }

  /** The raid is over: the doors may open again (each one once the air both sides of it is good). */
  standDown() {
    this.stations = false;
    this.sfx?.cue('chime');
    this.dc?.say('Stand down from action stations.', 'Stand down from action stations.', 0, 4);
  }

  /** One shell of a pass: its tracer in to where it will strike, then the strike. */
  volley(from) {
    const shot = this.aim({ from });
    if (!shot) return;
    this.tracer(shot.entry, shot.dir, 0.35);
    this.events.push({ t: this.time + 0.35, fn: () => this.strike(shot) });
  }

  // --- each frame ----------------------------------------------------------------------------------------------------

  /** `walker` and `mode` as for damage control; `f` the input frame (E held, for a patch). */
  frame(dt, f, walker, mode) {
    this.time += dt;
    const N = this.N;
    this.you = walker.pos;
    // Scheduled things.
    for (const e of this.events.splice(0).sort((a, b) => a.t - b.t)) {
      if (e.t <= this.time) e.fn();
      else this.events.push(e);
    }
    if (this.stations && !this.events.length && this.time > this.standAt) this.standDown();
    if (this.auto && !this.stations) (this.wait -= dt), this.wait <= 0 && this.attack();
    // The air, in small steps (a big hole empties a room in a few seconds).
    this.breached = this.zone();
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < steps; i++) this.air(dt / steps);
    for (const n of this.nodes.values()) {
      n.rate += ((n.air - n.was) / Math.max(1e-4, dt) - n.rate) * Math.min(1, dt * 4);
      n.was = n.air;
    }
    this.doors(dt);
    this.dronesFrame(dt);
    this.systems();
    this.fxFrame(dt);
    this.holeFrame(dt, f, walker, mode);
    this.rooms(dt);
    this.you3(dt, walker, mode);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.overlayFrame();
    if ((this.boardT -= dt) <= 0) (this.boardT = 0.25), this.boardFrame(mode);
  }

  air(h) {
    const A = this.N.air;
    const k = this.N.hole.flow;
    for (const n of this.nodes.values()) n.drain = null;
    const drainTo = (n, rate, x, z) => {
      if (!n.drain || rate > n.drain.rate) n.drain = { rate, x, z };
    };
    // Holes: to space, or between two compartments.
    for (const hole of this.holes) {
      if (hole.sealed) continue;
      const a = hole.n, b = hole.to;
      const g = hole.area * k; // m³ of room a second
      if (!b) {
        const lost = a.air * (1 - Math.exp((-g * h) / a.vol));
        a.air -= lost;
        drainTo(a, lost / h / Math.max(1, a.air), hole.at.x, hole.at.z);
      } else this.share(a, b, g, h, hole.at.x, hole.at.z, drainTo);
    }
    // Doors and hatches, as far open as they are.
    for (const l of this.links) {
      if (l.k <= 0.02) continue;
      this.share(this.nodes.get(l.a), this.nodes.get(l.b), l.area * l.k * A.through, h, l.x, l.z, drainTo);
    }
    // Life support tops up any compartment that is no longer open to space; the supply to a breached zone is cut.
    const fill = A.refill * this.lsFactor;
    for (const n of this.nodes.values()) {
      if (n.air >= A.nominal || this.breached.has(n)) continue;
      n.air = Math.min(A.nominal, n.air + fill * h);
    }
  }

  /** The compartments that are open to space: holed to it, or joined to one that is by holes and open doors. */
  zone() {
    const out = new Set();
    let q = this.holes.filter((h) => !h.sealed && !h.to).map((h) => h.n);
    q.forEach((n) => out.add(n));
    while (q.length) {
      const next = [];
      const add = (n) => !out.has(n) && (out.add(n), next.push(n));
      for (const n of q) {
        for (const h of n.holes) if (!h.sealed && h.to) add(h.n === n ? h.to : h.n);
        for (const l of this.links) if (l.k > 0.02 && (l.a === n.c.id || l.b === n.c.id)) add(this.nodes.get(l.a === n.c.id ? l.b : l.a));
      }
      q = next;
    }
    return out;
  }

  /** Air flowing between two compartments through an opening of conductance `g` (m³/s), without overshooting. */
  share(a, b, g, h, x, z, drainTo) {
    const dp = a.air - b.air;
    if (Math.abs(dp) < 1e-3) return;
    const eq = dp / (1 / a.vol + 1 / b.vol); // the amount that would even them out
    let n = dp * g * h;
    n = Math.sign(eq) * Math.min(Math.abs(n), Math.abs(eq) * 0.9);
    a.air -= n / a.vol;
    b.air += n / b.vol;
    const from = n > 0 ? a : b;
    if (from.air > 0.1) drainTo(from, Math.abs(n) / from.vol / from.air / h, x, z);
  }

  doors(dt) {
    const A = this.N.air;
    const falling = (n) => n.rate < -A.falling;
    for (const l of this.links) {
      const a = this.nodes.get(l.a), b = this.nodes.get(l.b);
      if (l.hold > 0) l.hold -= dt;
      const lo = Math.min(a.air, b.air);
      // At action stations every door is kept shut: one you open by hand shuts again behind you.
      if (this.stations && l.open && !(l.hold > 0)) l.open = false, l.kind === 'door' && this.heard(l, 'servo');
      else if (l.open && !(l.hold > 0) && lo < A.doorsShut && (falling(a) || falling(b))) {
        l.open = false;
        if (l.kind === 'door') this.heard(l, 'servo');
        if (!this.closingCalled || this.time - this.closingCalled > 8) {
          this.closingCalled = this.time;
          this.dc?.say(null, 'Pressure doors closing.', 0, 3);
        }
      } else if (!l.open && !this.stations && Math.min(a.air, b.air) > A.doorsShut + 5 && Math.abs(a.air - b.air) < 3 && !falling(a) && !falling(b)) {
        l.quiet += dt;
        if (l.quiet > 4) (l.open = true), (l.quiet = 0), l.kind === 'door' && this.heard(l, 'servo');
      } else l.quiet = 0;
      const want = l.open ? 1 : 0;
      if (l.k !== want) {
        l.k = want > l.k ? Math.min(1, l.k + dt / 1.0) : Math.max(0, l.k - dt / 1.6);
        l.door?.set(l.k);
        if (l.k === 0) l.kind === 'door' && this.heard(l, 'clunk');
      }
      if (l.lampMat) l.lampMat.color.set(l.k > 0.98 ? '#2aff6a' : l.k > 0.02 ? (this.time * 4) % 1 < 0.5 ? '#ffa020' : '#3a2a10' : lo < A.unsafe ? '#ff2a1a' : '#e8e8e8');
    }
  }

  /** A door's sound, if you are on its deck and near it. */
  heard(l, kind) {
    if (!this.you || this.walkDeck !== l.deck) return;
    const d = Math.hypot(this.you.x - l.x, this.you.z - l.z);
    if (d < 25) this.sfx?.cue(kind, { vol: (1 - d / 25) * 0.8, dur: 1 });
  }

  /** The drones: one to each hole to space, out of the drone bay; they seal it after `seal` seconds a 0.1 m². */
  dronesFrame(dt) {
    const D = this.N.drones;
    const bay = this.nodes.get(D.from);
    const free = this.droneCount - this.drones.filter((d) => !d.done).length;
    if (bay && free > 0) {
      const wait = this.holes.filter((h) => !h.sealed && !h.drone && (!h.to || D.inside)).sort((a, b) => (a.to ? 1 : 0) - (b.to ? 1 : 0));
      for (const h of wait.slice(0, free)) {
        const from = new THREE.Vector3((bay.b.x[0] + bay.b.x[1]) / 2, bay.b.y[0] + 1, (bay.b.z[0] + bay.b.z[1]) / 2);
        const to = h.at.clone().addScaledVector(h.normal, h.to ? 0.5 : -1.5);
        const dist = from.distanceTo(to);
        const mesh = at(new THREE.Mesh(new THREE.OctahedronGeometry(1.4), MARK_DRONE), from.x, from.y, from.z);
        mesh.renderOrder = 7;
        this.overlay.add(mesh);
        const d = { h, from, to, mesh, t: 0, fly: dist / D.speed, work: D.seal * clamp(h.area / 0.1, 0.6, 4), done: false };
        h.drone = d;
        this.drones.push(d);
      }
    }
    for (const d of this.drones) {
      if (d.done) continue;
      d.t += dt;
      const k = Math.min(1, d.t / d.fly);
      d.mesh.position.lerpVectors(d.from, d.to, k);
      if (d.h.sealed) (d.done = true), d.mesh.removeFromParent();
      else if (d.t >= d.fly + d.work) {
        this.seal(d.h, 'drone');
        d.done = true;
        d.mesh.removeFromParent();
      }
    }
    this.drones = this.drones.filter((d) => !d.done);
  }

  /** Each system's health (0 to 1), volume-weighted over its compartments. */
  sys(system) {
    let v = 0, h = 0;
    for (const n of this.nodes.values()) if (n.c.system === system) (v += n.vol), (h += n.vol * n.health);
    return v ? h / v / 100 : 1;
  }

  systems() {
    const P = this.N.power;
    const reactor = this.sys('reactor');
    this.power = reactor >= P.below && this.sys('power') >= P.below; // the reactor, and the switchboards to carry it
    const drive = clamp((this.sys('drive') - 0.2) / 0.5, 0, 1) * (this.power ? 1 : 0);
    for (const t of this.thrusters) {
      if (t.kind === 'main') t.health = drive;
      else if (t.node) t.health = clamp((t.node.health / 100 - 0.2) / 0.4, 0, 1);
    }
    this.driveFactor = drive;
    this.lsFactor = clamp(this.sys('life-support') * 1.25, 0, 1) * (this.power ? 1 : 0.5);
    const bay = this.nodes.get(this.N.drones.from);
    this.droneCount = bay && bay.health >= 40 ? this.N.drones.count : 0;
  }

  fxFrame(dt) {
    for (const e of this.fx) {
      e.t += dt;
      const k = e.t / e.life;
      if (e.kind === 'flash') {
        e.mesh.scale.setScalar(3 + 22 * Math.sqrt(k)); // big enough to read from the helm's outside view, 600 m off
        e.mesh.material.opacity = Math.max(0, 1 - k);
      } else e.mesh.position.lerpVectors(e.from, e.to, Math.min(1, k));
      if (k >= 1) e.mesh.removeFromParent(), e.mesh.geometry.dispose();
    }
    this.fx = this.fx.filter((e) => e.t < e.life);
  }

  /** The holes you can see: the hot rim cooling, the mist streaming in, and patching one yourself. */
  holeFrame(dt, f, walker, mode) {
    const P = this.N.patch;
    const near = mode === 'walk' ? walker.nearestUse() : null;
    for (const h of this.holes) {
      h.t += dt;
      if (!h.look) continue;
      const L = h.look;
      // Hot metal cooling: yellow-orange to a dull red, then gone.
      L.rimMat.opacity = h.sealed ? 0 : Math.max(0, 1 - h.t / 40);
      L.rimMat.color.setHSL(0.09 - Math.min(0.09, h.t / 300), 1, 0.6 - Math.min(0.35, h.t / 60));
      if (h.use && near === h.use && !h.sealed) {
        if (f.keys.has('KeyE') && this.dc?.carry.has('patch')) {
          h.patch += dt;
          if (h.patch >= P.work) {
            this.dc.carry.delete('patch');
            this.seal(h, 'you');
          }
        }
        h.use.label = h.patch > 0 ? `Patching: ${Math.round((100 * h.patch) / P.work)}%` : 'Hold E: patch the hole';
        h.use.key = f.keys.has('KeyE') && h.patch > 0 ? '' : 'E';
      }
      // The mist: specks drawn from the room toward the hole, quicker as they near it.
      const room = h.room;
      const venting = !h.sealed && room.air > 3 && (h.to ? Math.abs(h.n.air - h.to.air) > 2 : true);
      L.mist.visible = venting && L.I.group.visible;
      if (!L.mist.visible) continue;
      const pos = L.mist.geometry.attributes.position;
      const b = room.b, hp = L.g.position;
      const strength = clamp(room.air / this.N.air.nominal, 0.15, 1);
      for (let i = 0; i < L.seeds.length; i++) {
        const s = L.seeds[i];
        s.k += dt * s.s * 0.6 * strength;
        if (s.k >= 1) (s.k = 0), (s.a = this.rand() * Math.PI * 2), (s.s = 0.5 + this.rand());
        const reach = 2.5 + 3 * s.s;
        const kk = s.k * s.k;
        const ox = Math.cos(s.a) * reach * (1 - kk), oz = Math.sin(s.a) * reach * (1 - kk), oy = (s.s - 1) * 1.6 * (1 - kk);
        pos.setXYZ(i, clamp(hp.x + ox + L.into.x * (1 - kk) * 1.5, b.x[0] + 0.2, b.x[1] - 0.2), clamp(hp.y + oy + L.into.y * (1 - kk) * 1.5, b.y[0] + 0.1, b.y[1] - 0.1), clamp(hp.z + oz + L.into.z * (1 - kk) * 1.5, b.z[0] + 0.2, b.z[1] - 0.2));
      }
      pos.needsUpdate = true;
    }
  }

  /** The rooms' lamps: red while they vent, a dim red on a vacuum, amber while their doors move, green when the air is
   *  back, dim on emergency power. */
  rooms(dt) {
    const A = this.N.air;
    const moving = new Set();
    for (const l of this.links) if (l.kind === 'door' && l.k > 0.02 && l.k < 0.98) moving.add(l.a), moving.add(l.b);
    for (const n of this.nodes.values()) {
      if (n.c.access !== 'walk') continue;
      if (n.air < A.unsafe) n.low = true;
      else if (n.low && n.air > A.nominal - 3) (n.low = false), (n.green = 4);
      if (n.green > 0) n.green -= dt;
      const venting = n.rate < -A.falling * 2 || n.holes.some((h) => !h.sealed && n.air > 3);
      const mode = venting ? 'red' : n.air < 20 ? 'vacuum' : moving.has(n.c.id) ? 'amber' : n.green > 0 ? 'green' : !this.power ? 'dim' : null;
      if (mode !== n.mode) {
        n.mode = mode;
        this.C.decks.get(n.c.deck).alarm(n.c.id, mode);
      }
    }
  }

  /** You: the wind toward a hole, the air you breathe, blacking out and being pulled clear. */
  you3(dt, walker, mode) {
    const A = this.N.air;
    const deck = walker.interior?.deck?.id;
    this.walkDeck = mode === 'walk' ? deck : null;
    const room = mode === 'walk' ? roomAt(this.C, deck, walker.pos.x, walker.pos.z) : null;
    const n = room ? this.nodes.get(room.id) : null;
    this.here = n;
    if (n?.drain && !this.rescuing) {
      // The wind: up to `wind` m/s toward where the air is going, as strong as it is going fast.
      const dx = n.drain.x - walker.pos.x, dz = n.drain.z - walker.pos.z;
      const d = Math.hypot(dx, dz);
      const v = Math.min(A.wind, n.drain.rate * 60) * clamp(n.air / A.nominal, 0, 1);
      if (d > 0.6 && v > 0.05) {
        walker.slide((dx / d) * v * dt, 0);
        walker.slide(0, (dz / d) * v * dt);
      }
    }
    // Breathing: below `faint` the clock runs to blacking out; with air again it runs back.
    const p = n ? n.air : A.nominal;
    if (p < A.faint) this.hypoxia += dt * (1 + (A.faint - p) / A.faint);
    else this.hypoxia = Math.max(0, this.hypoxia - dt * 0.5);
    if (this.hypoxia >= A.blackout && !this.rescuing) this.rescue(n);
    if (this.veil) {
      const k = clamp(this.hypoxia / A.blackout, 0, 1);
      this.veil.style.opacity = k ? (0.35 + 0.65 * k).toFixed(3) : '0';
    }
    if (this.gauge) {
      const show = mode === 'walk' && p < A.nominal - 5;
      this.gauge.hidden = !show;
      if (show) {
        const trend = n.rate < -A.falling ? ' · falling' : n.rate > A.falling ? ' · rising' : '';
        const word = p < A.faint ? 'NO AIR: get out' : p < A.unsafe ? 'thin air' : 'air';
        const html = `<b>${Math.round(p)} kPa</b> ${word}${trend}`;
        if (html !== this.gaugeHtml) (this.gauge.innerHTML = html), (this.gaugeHtml = html);
        this.gauge.classList.toggle('bad', p < A.unsafe);
      }
    }
  }

  /** You blacked out: a damage control party carries you to the nearest room with good air. */
  rescue(n) {
    this.rescuing = true;
    const A = this.N.air;
    // Breadth-first through every way between rooms, doors open or not (they carry you through).
    const ways = portals(this.C);
    const seen = new Set([n?.c.id]);
    let q = [n?.c.id], to = null;
    while (q.length && !to) {
      const next = [];
      for (const id of q) for (const p of ways.get(id) ?? []) {
        if (seen.has(p.to)) continue;
        seen.add(p.to);
        if (this.airOf(p.to) > A.unsafe + 10) {
          to = p.to;
          break;
        }
        next.push(p.to);
      }
      q = next;
    }
    to ??= 'damage-control';
    this.dc?.say(null, `You blacked out. A damage control party dragged you to the ${this.C.rooms.get(to).name.toLowerCase()}.`, 0, 7);
    this.hooks.rescue?.(this.C.rooms.get(to), () => {
      this.hypoxia = 0;
      this.rescuing = false;
    });
  }

  overlayFrame() {
    if (!this.C.overlay.visible) return;
    const A = this.N.air;
    const blink = (this.time * 2.5) % 1 < 0.6;
    for (const n of this.nodes.values()) {
      const venting = n.holes.some((h) => !h.sealed);
      const m = n.tint.material;
      let show = true;
      if (venting) m.color.set('#ff2a1a'), (m.opacity = blink ? 0.55 : 0.25);
      else if (n.air < A.unsafe) m.color.set('#2a4aff'), (m.opacity = 0.45);
      else if (n.health < 60) m.color.set('#ff9a2a'), (m.opacity = 0.2 + 0.3 * (1 - n.health / 60));
      else show = false;
      n.tint.visible = show;
    }
  }

  /** The cutaway's ship status board: the systems, the drones, the breaches, the rooms without air. */
  boardFrame(mode) {
    if (!this.board) return;
    this.board.hidden = mode !== 'cutaway';
    if (this.board.hidden) return;
    const pc = (v) => `${Math.round(v * 100)}%`;
    const cls = (v) => (v >= 0.75 ? 'ok' : v >= 0.4 ? 'warn' : 'bad');
    const rcs = this.thrusters.filter((t) => t.kind === 'rcs');
    const rcsOk = rcs.length ? rcs.reduce((s, t) => s + (t.health ?? 1), 0) / rcs.length : 1;
    const rows = [
      ['Reactor', this.sys('reactor'), this.power ? '' : 'emergency power'],
      ['Power distribution', this.sys('power'), ''],
      ['Main drive', this.driveFactor ?? 1, ''],
      ['Manoeuvring', rcsOk, ''],
      ['Life support', this.sys('life-support'), ''],
      ['Shields', this.sys('shield'), this.shieldCharge != null ? `charge ${Math.round(this.shieldCharge * 100)}%` : ''],
      ['Sensors', this.sys('sensors'), '']
    ];
    const open = this.holes.filter((h) => !h.sealed).length, shut = this.holes.length - open;
    const busy = this.drones.length;
    const thin = [...this.nodes.values()].filter((n) => n.c.access === 'walk' && n.air < this.N.air.unsafe).map((n) => n.c.name);
    let html = `<div class="s-head">Ship's status${this.stations ? ' · <span class="bad">action stations</span>' : ''}</div><div class="s-grid">${rows.map(([k, v, note]) => `<span>${k}</span><b class="${cls(v)}">${pc(v)}${note ? ` <i>${note}</i>` : ''}</b>`).join('')}
      <span>Repair drones</span><b class="${this.droneCount ? 'ok' : 'bad'}">${busy} out of ${this.droneCount}</b>
      <span>Hull breaches</span><b class="${open ? 'bad' : 'ok'}">${open} open${shut ? `, ${shut} sealed` : ''}</b></div>`;
    if (thin.length) html += `<div class="s-thin">No air: ${thin.join(', ')}</div>`;
    if (html !== this.boardHtml) (this.board.innerHTML = html), (this.boardHtml = html);
  }

  /** Damage control finished a job in a room: some of its health comes back. */
  mended(roomId, amount = this.N.jobs.mends) {
    const n = this.nodes.get(roomId);
    if (n) n.health = Math.min(100, n.health + amount);
  }
}
