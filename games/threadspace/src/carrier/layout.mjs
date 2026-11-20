// The carrier, built from its layout (ships/carrier/): the hull, the walkable decks, the sealed machinery
// spaces, the outside fittings (drive bells, thruster clusters, turrets, radiators) and the cutaway overlay. Everything
// is placed in the ship's own frame (`frame`), whose origin is the layout's origin; `obj` (the frame's parent) sits at
// the centre of mass, so the physics turns the ship about the right point.
//
// Rooms are walls and floors from interiors.mjs's `Interior` (one per deck), so the walker, the light pool and `bake`
// work on them unchanged. What the layout adds: per-segment doors and windows on any wall, doors between rooms found
// from the rooms' own boxes, ladders between decks, and sealed compartments that are machinery you can see but not enter.

import * as THREE from 'three';
import { Interior } from '../interiors.mjs';
import { loft, metal, fighter, foldWings, DARK, TRIM } from '../ships.mjs';
import { box, cyl, at, mat, glow } from '../util.mjs';
import { hazardMat, bake, drawSign, SignAtlas } from '../decor.mjs';
import { plan, dressDeck } from './wayfinding.mjs';
import { dressKits } from './damage.mjs';
import { roomSurfaces, roomLights, dressRoom, dressHangar, SETS, messTable, desk, lookKey, P as PAL } from './sets.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildDrums } from './drum.mjs';

const H = 3; // room height unless the layout says otherwise
const GAP = 1.5; // two rooms whose walls are closer than this can share a door

/** Each system's colour on the cutaway and the legend. */
export const SYSTEMS = {
  bridge: ['#58b0ff', 'Command'],
  corridor: ['#8a93a3', 'Passages'],
  quarters: ['#b48cff', 'Quarters'],
  mess: ['#e0b060', 'Mess and galley'],
  medical: ['#ff7a8a', 'Medical'],
  'life-support': ['#39d27a', 'Life support'],
  hangar: ['#4fd0e0', 'Hangar'],
  flight: ['#4fd0e0', 'Flight control'],
  engineering: ['#ffb347', 'Engineering'],
  repair: ['#ffcf7a', 'Repair drones'],
  armoury: ['#ff6a50', 'Armoury'],
  stores: ['#a08060', 'Stores'],
  reactor: ['#ff6a2a', 'Reactor'],
  drive: ['#ff9a40', 'Main drive'],
  power: ['#ffd040', 'Power'],
  heat: ['#ff8a5a', 'Heat sinks'],
  pdc: ['#c86a7a', 'Point defence'],
  tanks: ['#3a8acc', 'Water and propellant'],
  magazine: ['#ff4040', 'Magazines'],
  turret: ['#d04848', 'Turret machinery'],
  damage: ['#ff8c3a', 'Damage control'],
  welfare: ['#e08ad0', 'Gym and recreation'],
  sensors: ['#6ad0ff', 'Sensors'],
  aux: ['#9aa6b4', 'Auxiliary machinery'],
  water: ['#4ab8d8', 'Water recovery'],
  cooling: ['#ff7a6a', 'Reactor cooling']
};

/** Builds the whole ship. `hooks.ladder(ladder, end)`, `hooks.helm()`, `hooks.bay()`, `hooks.fighter(i)` are what E
 *  does at each. */
/** A hangar's launch doors: `bayDoors` (any number), or today's single `bayDoor`. */
const bayDoorsOf = (c) => c.bayDoors ?? (c.bayDoor ? [c.bayDoor] : []);

export function buildCarrier(L, hooks = {}) {
  const obj = new THREE.Group();
  obj.name = 'carrier';
  const frame = new THREE.Group();
  frame.position.set(-L.com[0], -L.com[1], -L.com[2]);
  obj.add(frame);
  const C = {
    L, obj, frame, hooks,
    decks: new Map(), // deck id → Interior
    rooms: new Map(), // compartment id → compartment (with its deck)
    machinery: new THREE.Group(),
    overlay: new THREE.Group(), // the cutaway's colours: drawn only in the cutaway
    outside: new THREE.Group(),
    hull: [],
    labels: [],
    fighters: []
  };
  frame.add(C.machinery, C.overlay, C.outside);
  C.overlay.visible = false;
  for (const c of L.compartments) C.rooms.set(c.id, c);
  C.holes = ladderHoles(C); // the openings the ladders climb through, cut in the rooms' decks and deckheads
  C.hatchLids = new Map();
  C.ways = plan(C); // the routes between rooms, for the floor lines and signs (wayfinding.mjs)
  C.atlas = new SignAtlas(); // every sign aboard on a few shared textures

  buildHull(C);
  for (const d of L.decks) buildDeck(C, d, hooks);
  boardingTubes(C, hooks);
  for (const c of L.compartments) if (c.access === 'sealed') buildSealed(C, c);
  bake(C.machinery);
  lightViewed(C);
  buildOutside(C);
  buildDrums(C); // the spin drums, when the layout has them (drum.mjs)
  // Where a room's things go: its deck's Interior. A drum room's is its segment's (drum.mjs `places` sets these for
  // the spin-drum carrier); a ship without drums has only decks.
  C.interior ??= (deck) => C.decks.get(deck);
  C.interiorOf ??= (room) => C.decks.get(room.deck);
  C.deckName ??= (deck) => L.decks.find((d) => d.id === deck)?.name ?? `Deck ${deck}`;
  C.isDrum ??= () => false;
  return C;
}

// --- the hull ------------------------------------------------------------------------------------------------------

function buildHull(C) {
  const hullMat = metal('#9aa3ad', { metalness: 0.4 });
  const islandMat = metal('#868f99', { metalness: 0.4 });
  C.hullMat = hullMat;
  const add = (mesh) => ((mesh.userData.hull = true), C.frame.add(mesh), C.hull.push(mesh));
  // Not on the game's SHELL_LAYER: from inside, its back faces are culled anyway.
  const D = C.L.drum;
  if (D?.sleeve) {
    // The spin-drum carrier: the drum section is an open tube (as hull.glb draws it), so the bow and the stern are lofts
    // of their own, capped, and the sleeve between them is a band, outside and in, with its ends as flat rings.
    const S = C.L.hull.main, z0 = D.halves[0].z[0], z1 = D.halves[D.halves.length - 1].z[1];
    const mid = S.filter((s) => s.z >= z0 - 0.05 && s.z <= z1 + 0.05);
    add(loft(S.filter((s) => s.z < z0 - 0.05), hullMat, { uv: 12 }));
    add(loft(S.filter((s) => s.z > z1 + 0.05), hullMat, { uv: 12 }));
    const t = D.structure?.sleeve?.t ?? D.sleeve.armour ?? 0.5;
    const inset = (s) => ({ ...s, w: s.w - 2 * t, h: s.h - 2 * t });
    const inMat = metal('#6f7882', { metalness: 0.4 });
    add(loft(mid, hullMat, { uv: 12, ends: [false, false] }));
    add(turnFaces(loft(mid.map(inset), inMat, { uv: 12, ends: [false, false] }), null));
    for (const [sec, out] of [[mid[0], -1], [mid[mid.length - 1], 1]]) add(turnFaces(loft([sec, inset(sec)], hullMat, { uv: 12, ends: [false, false] }), out));
  } else add(loft(C.L.hull.main, hullMat, { uv: 12 }));
  add(loft(C.L.hull.island, islandMat, { uv: 12 }));
  // Armour belts and seams: dark bands round the hull every 40 m, so its length reads. Each sits on the flat sides and
  // the flat top of the section where it falls.
  const belt = mat('#59616b');
  const S = C.L.hull.main;
  for (let z = Math.ceil((S[0].z + 20) / 40) * 40 - 20; z <= S[S.length - 1].z - 10; z += 40) {
    let i = 0;
    while (S[i + 1].z < z) i++;
    if (S[i + 1].z - S[i].z < 2 || S[i].w !== S[i + 1].w || S[i].h !== S[i + 1].h) continue; // only where the hull runs straight
    const t = (z - S[i].z) / (S[i + 1].z - S[i].z), lerp = (k, d = 0) => (S[i][k] ?? d) + ((S[i + 1][k] ?? d) - (S[i][k] ?? d)) * t;
    const w = lerp('w'), h = lerp('h'), y = lerp('y'), c = Math.min(w, h) / 2 * lerp('c', 0.32);
    for (const s of [-1, 1]) C.outside.add(at(box(0.6, h - 2 * c - 1, 1.2, belt), s * (w / 2 + 0.2), y, z));
    C.outside.add(at(box((w - 2 * c) * 0.8, 0.6, 1.2, belt), 0, y + h / 2 + 0.2, z));
  }
}

/** Turns a loft's faces round where they face the wrong way: `out` ±1 for a flat ring facing ∓z… ±z (its first face
 *  is checked), or null to turn every face (a tube seen from inside). */
function turnFaces(mesh, out) {
  const g = mesh.geometry, p = g.attributes.position, uv = g.attributes.uv;
  if (out !== null) {
    const a = new THREE.Vector3().fromBufferAttribute(p, 0), b = new THREE.Vector3().fromBufferAttribute(p, 1), c = new THREE.Vector3().fromBufferAttribute(p, 2);
    if (b.sub(a).cross(c.sub(a)).z * out >= 0) return mesh;
  }
  for (let i = 0; i < p.count; i += 3) for (const A of [p, uv]) for (let k = 0; k < A.itemSize; k++) {
    const v = A.array[(i + 1) * A.itemSize + k];
    A.array[(i + 1) * A.itemSize + k] = A.array[(i + 2) * A.itemSize + k];
    A.array[(i + 2) * A.itemSize + k] = v;
  }
  p.needsUpdate = uv.needsUpdate = true;
  g.computeVertexNormals();
  return mesh;
}

// --- the decks -----------------------------------------------------------------------------------------------------

function buildDeck(C, deck, hooks) {
  const I = new Interior(C.frame, deck.floor);
  I.deck = deck;
  I.ceiling = 3;
  C.decks.set(deck.id, I);
  const rooms = C.L.compartments.filter((c) => c.access === 'walk' && c.deck === deck.id);
  // Openings per room and side: doors (from the layout's door list), windows and bay doors (from the room).
  const open = new Map(rooms.map((c) => [c.id, { n: [], s: [], w: [], e: [] }]));
  for (const c of rooms) {
    for (const w of c.windows ?? []) open.get(c.id)[w.side].push({ a: w.from, b: w.to, kind: 'window', sill: w.sill ?? 1, head: w.head });
    for (const bd of bayDoorsOf(c)) open.get(c.id)[bd.side].push({ a: bd.from, b: bd.to, kind: 'bay', head: bd.height });
  }
  const passages = [];
  for (const d of C.L.doors) {
    const [A, B] = d.between.map((id) => C.rooms.get(id));
    if (A.deck !== deck.id) continue;
    const rel = facing(A, B);
    if (!rel) throw new Error(`carrier layout: ${A.id} and ${B.id} do not face each other across a wall`);
    open.get(A.id)[rel.a].push({ a: d.at - d.w / 2, b: d.at + d.w / 2, kind: 'door' });
    open.get(B.id)[rel.b].push({ a: d.at - d.w / 2, b: d.at + d.w / 2, kind: 'door' });
    passages.push({ ...rel, at: d.at, w: d.w });
  }
  for (const c of rooms) {
    I.s = roomSurfaces(c); // the room's finish and lamps by what it is for (sets.mjs)
    room(I, c, open.get(c.id), C.holes.get(c.id));
    hatches(C, I, c);
    roomLights(I, c);
    furnish(C, I, c, hooks, open.get(c.id));
    dressRoom(C, I, c, open.get(c.id));
    floorOverlay(C, c, deck.floor);
  }
  I.s = roomSurfaces({ system: 'corridor' });
  for (const p of passages) I.passage(p.along, p.a1, p.a2, p.at - p.w / 2, p.at + p.w / 2);
  dressDeck(C, I, deck, open);
  dressKits(C, I, deck);
  for (const l of C.L.ladders) for (const end of ['a', 'b']) if (l[end].deck === deck.id) ladder(C, I, l, end, hooks);
  I.finish();
  return I;
}

/** Which walls of A and B face each other across a narrow gap: the sides, the axis a door between them runs along, and
 *  the gap's run on the other axis (a passage fills it). */
export function facing(A, B) {
  const overlapX = Math.min(A.x[1], B.x[1]) - Math.max(A.x[0], B.x[0]);
  const overlapZ = Math.min(A.z[1], B.z[1]) - Math.max(A.z[0], B.z[0]);
  if (overlapX > 0) {
    if (B.z[0] >= A.z[1] - 0.01 && B.z[0] - A.z[1] < GAP) return { a: 's', b: 'n', along: 'z', a1: A.z[1], a2: B.z[0] };
    if (A.z[0] >= B.z[1] - 0.01 && A.z[0] - B.z[1] < GAP) return { a: 'n', b: 's', along: 'z', a1: B.z[1], a2: A.z[0] };
  }
  if (overlapZ > 0) {
    if (B.x[0] >= A.x[1] - 0.01 && B.x[0] - A.x[1] < GAP) return { a: 'e', b: 'w', along: 'x', a1: A.x[1], a2: B.x[0] };
    if (A.x[0] >= B.x[1] - 0.01 && A.x[0] - B.x[1] < GAP) return { a: 'w', b: 'e', along: 'x', a1: B.x[1], a2: A.x[0] };
  }
  return null;
}

/** A room like `Interior.room`, but each wall can have any number of doors, windows and a bay door along it, and its
 *  deck and deckhead can have a ladder's opening in them (`holes`, from `ladderHoles`). */
export function room(I, c, open, holes = []) {
  const y = I.floorY, h = c.h ?? H, g = I.group, S = I.s;
  const [x1, x2] = c.x, [z1, z2] = c.z;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, w = x2 - x1, d = z2 - z1;
  I.roomNow = c.id;
  I.rooms.push({ id: c.id, x1, x2, z1, z2, y0: y, y1: y + h });
  // A slab, or with an opening the four slabs round it.
  const slab = (yy, m, hole) => {
    if (!hole) return g.add(at(box(w, 0.1, d, m), cx, yy, cz));
    const [a, b] = hole.x, [p, q] = hole.z;
    for (const [u0, u1, v0, v1] of [[x1, a, z1, z2], [b, x2, z1, z2], [a, b, z1, p], [a, b, q, z2]]) {
      if (u1 - u0 > 0.01 && v1 - v0 > 0.01) g.add(at(box(u1 - u0, 0.1, v1 - v0, m), (u0 + u1) / 2, yy, (v0 + v1) / 2));
    }
  };
  const floorHole = holes.find((o) => o.kind === 'floor'), ceilHole = holes.find((o) => o.kind === 'ceil');
  slab(y - 0.05, S.floor, floorHole);
  slab(y + h + 0.05, S.ceil, ceilHole);
  const across = w < d, span = across ? d : w, step = h > 6 ? 6 : 3;
  for (let t = -span / 2 + step / 2; t < span / 2 - 0.5; t += step) {
    // No deckhead beam across a ladder's opening.
    if (ceilHole && (across ? cz + t + 0.16 > ceilHole.z[0] && cz + t - 0.16 < ceilHole.z[1] : cx + t + 0.16 > ceilHole.x[0] && cx + t - 0.16 < ceilHole.x[1])) continue;
    g.add(across ? at(box(w, 0.16, 0.32, S.trim), cx, y + h - 0.08, cz + t) : at(box(0.32, 0.16, d, S.trim), cx + t, y + h - 0.08, cz));
  }
  const sides = { n: [z1, x1, x2, true], s: [z2, x1, x2, true], w: [x1, z1, z2, false], e: [x2, z1, z2, false] };
  for (const [name, [line, a0, b0, alongX]] of Object.entries(sides)) {
    const piece = (len, hh, along, yy, thick = 0.2, m = S.wall) => g.add(alongX ? at(box(len, hh, thick, m), along, yy, line) : at(box(thick, hh, len, m), line, yy, along));
    const solid = (a, b, from = 0, to = h, collide = true) => {
      if (b - a < 0.05 || to - from < 0.02) return;
      const len = b - a, mid = (a + b) / 2;
      piece(len, to - from, mid, y + (from + to) / 2);
      if (from === 0) piece(len, 0.16, mid, y + 0.08, 0.26, S.trim); // skirting
      if (to === h) piece(len, 0.12, mid, y + h - 0.06, 0.3, S.trim); // coving
      if (collide) alongX ? I.collider(a, y, line - 0.1, b, y + h, line + 0.1) : I.collider(line - 0.1, y, a, line + 0.1, y + h, b);
    };
    let cur = a0;
    for (const o of open[name].sort((p, q) => p.a - q.a)) {
      solid(cur, o.a);
      if (o.kind === 'door') I.doorFrame(alongX, line, o.a, o.b, y, h, 2.5);
      else if (o.kind === 'window') {
        const head = o.head ?? h;
        solid(o.a, o.b, 0, o.sill, true);
        solid(o.a, o.b, head, h, false);
        I.window(alongX, line, o.a, o.b, y + o.sill, y + head);
      } else if (o.kind === 'bay') {
        solid(o.a, o.b, o.head, h, false);
        // A rail along the mouth: the field that holds the air in is also what stops you walking out into space.
        alongX ? I.collider(o.a, y, line - 0.3, o.b, y + h, line + 0.3) : I.collider(line - 0.3, y, o.a, line + 0.3, y + h, o.b);
        const len = o.b - o.a, mid = (o.a + o.b) / 2;
        g.add(alongX ? at(box(len, 0.06, 0.6, hazardMat()), mid, y + 0.03, line) : at(box(0.6, 0.06, len, hazardMat()), line, y + 0.03, mid));
        g.add(alongX ? at(box(len, 0.05, 0.05, glow('#4fd0e0', 0.7)), mid, y + 1.0, line) : at(box(0.05, 0.05, len, glow('#4fd0e0', 0.7)), line, y + 1.0, mid));
      }
      cur = o.b;
    }
    solid(cur, b0);
  }
  return { cx, cz, w, d, h };
}

// --- furniture -----------------------------------------------------------------------------------------------------

const BUNK = mat('#3a4049'), SHEET = mat('#c9c4b6'), STEEL = mat('#5b626c'), TABLE = mat('#454c56'), CRATE = mat('#6a6248');

function furnish(C, I, c, hooks, open) {
  const [x1, x2] = c.x, [z1, z2] = c.z;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const signColor = SYSTEMS[c.system]?.[0] ?? '#9fd4ff';
  if (SETS[c.id]) SETS[c.id](C, I, c, hooks, open); // the rooms built as sets of their own (sets.mjs)
  else switch (c.id) {
    case 'ready-room': {
      I.prop(box(2.2, 0.8, 1.1, TABLE), cx, cz - 1.5, { y: 0.4 });
      I.seat(cx, cz - 0.3, 0, '#5a4a30', { arms: true });
      I.screen('status', x2 - 0.15, 1.7, cz, -Math.PI / 2, '#b48cff', 1.6, 0.9);
      break;
    }
    case 'ls-control': {
      for (const z of [cz - 2.6, cz + 2.6]) I.console(x1 + 1.6, z, 2.4, -Math.PI / 2, '#39d27a', 0.9, 'status');
      break;
    }
    case 'armoury': case 'stores': {
      // Racks down both long walls, leaving the doorways clear.
      const m = c.id === 'armoury' ? mat('#3a3f47') : CRATE;
      const clearOf = (side, z) => !open[side].some((o) => o.kind === 'door' && o.a < z + 1.6 && o.b > z - 1.6);
      for (let z = z1 + 1; z < z2 - 1; z += 2.2) {
        if (clearOf('w', z)) I.prop(box(1.2, 2.2, 1.8, m), x1 + 1, z, { y: 1.1 });
        if (clearOf('e', z)) I.prop(box(1.2, 2.2, 1.8, m), x2 - 1, z, { y: 1.1 });
      }
      break;
    }
    case 'hangar': hangar(C, I, c, hooks), dressHangar(C, I, c); break;
    case 'flight-control': {
      for (const z of [cz - 1.5, cz + 1.5]) I.console(x1 + 1.4, z, 2.2, -Math.PI / 2, '#4fd0e0', 0.9, 'nav');
      I.use('bay', 'Open the bay doors', x1 + 1.6, cz, () => hooks.bay?.(), { r: 2.6 });
      I.screen('status', x2 - 0.15, 1.7, cz + 3, -Math.PI / 2, '#4fd0e0', 1.8, 0.9);
      break;
    }
    case 'drone-bay': {
      // Racks of the little repair drones that seal holes in the hull: a field team in boxes.
      for (let z = z1 + 1.5; z < z2 - 1; z += 2.5) {
        I.prop(box(1.2, 2.4, 2.0, STEEL), x2 - 0.8, z, { y: 1.2 });
        const d = drone();
        d.position.set(x2 - 0.8, I.floorY + 1.6, z);
        I.group.add(d);
      }
      break;
    }
    default:
      if (c.fit) fit(I, c, open, signColor);
  }
  // A sign over every door into this room, on the far side (in the passage, or in the room next door). A room with a
  // ladder in it says where the ladder goes.
  const ladders = C.ways.portals.get(c.id).filter((p) => p.kind === 'ladder').map((p) => `${p.deck < c.deck ? '▲' : '▼'} DECK ${p.deck}`);
  const text = [c.name.toUpperCase(), ...ladders].join(' · ');
  for (const d of C.L.doors) {
    if (!d.between.includes(c.id) || c.system === 'corridor' && !ladders.length) continue;
    const other = C.rooms.get(d.between[0] === c.id ? d.between[1] : d.between[0]);
    const rel = facing(other, c);
    const x = rel.along === 'x' ? (rel.a === 'e' ? other.x[1] - 0.12 : other.x[0] + 0.12) : d.at;
    const z = rel.along === 'z' ? (rel.a === 's' ? other.z[1] - 0.12 : other.z[0] + 0.12) : d.at;
    const ry = rel.along === 'x' ? (rel.a === 'e' ? -Math.PI / 2 : Math.PI / 2) : rel.a === 's' ? Math.PI : 0;
    // Into a tall room (the hangar) the sign is twice the size and higher, so it reads from across the deck.
    const k = (other.h ?? H) > 6 ? 2.2 : 1;
    const w = Math.min(2.6, 0.5 + text.length * 0.095) * k, h = 0.3 * k;
    const m = C.atlas.plane(w, h, (g, pw, ph) => drawSign(g, pw, ph, text, signColor), 180 / k);
    I.group.add(at(m, x, I.floorY + (k > 1 ? 3.4 : 2.7), z, 0, ry, 0));
  }
}

/** Furniture by kind, for any room whose layout entry has `fit`: tables, cabins, washroom, shelves, workshop, gym,
 *  laundry, cells, office, machines, lockers, briefing. It is laid out in the room's own terms: u runs along the wall
 *  with the door in it, v away from that wall into the room, so a fit works on whichever side of a passage the room is.
 *  Nothing stands within 2 m of the door wall, or in front of a door in any other wall. */
export function fit(I, c, open, color) {
  const side = ['e', 'w', 'n', 's'].find((k) => open[k].some((o) => o.kind === 'door')) ?? 'e';
  const [x1, x2] = c.x, [z1, z2] = c.z;
  const alongZ = side === 'e' || side === 'w';
  const U = alongZ ? z2 - z1 : x2 - x1, V = alongZ ? x2 - x1 : z2 - z1;
  const dv = { e: [-1, 0], w: [1, 0], n: [0, 1], s: [0, -1] }[side];
  const o = { e: [x2, z1], w: [x1, z1], n: [x1, z1], s: [x1, z2] }[side];
  const P = (u, v) => (alongZ ? [o[0] + dv[0] * v, o[1] + u] : [o[0] + u, o[1] + dv[1] * v]);
  const face = Math.atan2(-dv[0], -dv[1]); // turns a prop's front (+z) toward the door wall
  const toU = Math.atan2(alongZ ? 0 : 1, alongZ ? 1 : 0); // ... toward +u
  // Doors in the other walls, in (u, v): keep 1.4 m in front of each clear.
  const doorsUV = [];
  for (const [k, list] of Object.entries(open)) for (const d of list) {
    if (d.kind !== 'door' || k === side) continue;
    const m = (d.a + d.b) / 2;
    const wx = k === 'w' ? x1 : k === 'e' ? x2 : null, wz = k === 'n' ? z1 : k === 's' ? z2 : null;
    const [x, z] = wx !== null ? [wx, m] : [m, wz];
    doorsUV.push(alongZ ? [z - z1, Math.abs(x - o[0])] : [x - x1, Math.abs(z - o[1])]);
  }
  const free = (u, v, hu = 0.5, hv = 0.5) => v - hv >= 2 && !doorsUV.some(([du, dvv]) => Math.abs(du - u) < hu + 1.4 && Math.abs(dvv - v) < hv + 1.4);
  const put = (mesh, u, v, ry = face, opts) => {
    const [x, z] = P(u, v);
    return I.prop(mesh, x, z, { ry, ...opts });
  };
  /** Along the back wall, `depth` deep, one every `step` m: make(i) builds each, front toward the room. */
  const backRow = (depth, step, make, margin = 0.6) => {
    const n = Math.max(1, Math.floor((U - margin * 2) / step));
    for (let i = 0; i < n; i++) {
      const u = margin + (U - margin * 2) * (i + 0.5) / n;
      if (free(u, V - depth / 2, step / 2, depth / 2)) put(make(i), u, V - depth / 2 - 0.05);
    }
  };
  /** Along both end walls, from 2.2 m off the door wall to `stop` short of the back. */
  const endRows = (depth, step, make, stop = 1.2) => {
    for (const [u, ry] of [[depth / 2 + 0.05, toU], [U - depth / 2 - 0.05, toU + Math.PI]]) {
      for (let v = 2.2 + step / 2; v < V - stop - step / 2 + 0.01; v += step) if (free(u, v, depth / 2, step / 2)) put(make(), u, v, ry);
    }
  };
  const backScreen = (kind, w = 2.2, h = 1.0, y = 1.7) => {
    const [x, z] = P(U / 2, V - 0.13);
    I.screen(kind, x, y, z, face, color, w, h);
  };
  const G = (...parts) => {
    const g = new THREE.Group();
    g.add(...parts);
    return g;
  };
  switch (c.fit) {
    case 'tables': {
      const tw = Math.min(U - 3.2, 6);
      for (let v = 3.4; v < V - 2; v += 3.4) {
        put(messTable(tw, Math.max(2, Math.floor(tw / 1.4)), { top: lookKey(c) === 'quarters' ? PAL.laminate : PAL.tableTop }), U / 2, v, face);
      }
      backScreen('status', 2.4, 1.2);
      endRows(0.7, 2.4, () => G(at(box(2.2, 0.95, 0.7, STEEL), 0, 0.47, 0), at(box(2.2, 0.04, 0.7, mat('#2a3442')), 0, 0.96, 0)), 1.6);
      break;
    }
    case 'cabins': {
      // Cabins along the back wall: a bunk, a desk and a locker each, between partitions.
      const cw = 3.2, n = Math.max(1, Math.floor((U - 0.4) / cw)), depth = Math.min(3.6, V - 2.4);
      for (let i = 0; i < n; i++) {
        const u = 0.2 + (U - 0.4) * (i + 0.5) / n;
        put(G(at(box(2.0, 0.45, 0.95, BUNK), 0, 0.22, 0), at(box(1.9, 0.12, 0.88, SHEET), 0, 0.5, 0)), u - 0.4, V - 0.55, face);
        put(box(1.0, 0.75, 0.55, TABLE), u + 0.9, V - depth + 0.5, face, { y: 0.37 });
        put(box(0.6, 2.0, 0.55, STEEL), u + 1.2, V - 0.4, face, { y: 1.0 });
        if (i > 0) put(box(0.08, 2.3, depth, mat('#7a828c')), u - (U - 0.4) / n / 2, V - depth / 2, face, { y: 1.15 });
      }
      break;
    }
    case 'washroom': {
      // Shower stalls along the back wall, basins and mirrors along one end.
      const n = Math.max(1, Math.floor((U - 1) / 1.2));
      for (let i = 0; i <= n; i++) put(box(0.06, 2.1, 1.3, mat('#b8c0c8')), 0.5 + ((U - 1) * i) / n, V - 0.65, face, { y: 1.05 });
      for (let i = 0; i < n; i++) put(box(1.0, 0.04, 1.2, mat('#3a4a58')), 0.5 + ((U - 1) * (i + 0.5)) / n, V - 0.65, face, { y: 0.02, collide: false });
      const [x, z] = P(0.35, (2 + V - 1.5) / 2);
      I.prop(box(0.6, 0.85, Math.max(1, V - 3.6), mat('#c8ced6')), x, z, { y: 0.42, ry: toU });
      break;
    }
    case 'shelves': {
      const rack = () => {
        const r = new THREE.Group();
        for (const x of [-0.93, 0.93]) for (const z of [-0.27, 0.27]) r.add(at(box(0.05, 2.2, 0.05, STEEL), x, 1.1, z));
        for (const y of [0.12, 0.85, 1.55, 2.18]) r.add(at(box(1.9, 0.04, 0.6, STEEL), 0, y, 0));
        r.add(at(box(0.8, 0.5, 0.5, CRATE), -0.45, 0.39, 0), at(box(0.7, 0.4, 0.5, mat('#4f5a46')), 0.5, 0.34, 0));
        r.add(at(box(1.2, 0.45, 0.5, CRATE), -0.2, 1.1, 0), at(box(0.6, 0.55, 0.45, mat('#8a6a3a')), 0.4, 1.85, 0), at(box(0.6, 0.4, 0.45, CRATE), -0.5, 1.77, 0));
        return r;
      };
      backRow(0.6, 2.0, rack);
      endRows(0.6, 2.0, rack, 1.0);
      if (V > 7.5 && U > 6) for (let u = 2.2; u < U - 2.2; u += 2.0) put(G(at(box(1.9, 1.6, 1.2, STEEL), 0, 0.8, 0), at(box(1.6, 0.6, 1.0, CRATE), 0, 1.9, 0)), u, (2 + V - 0.6) / 2 + 0.3, face);
      break;
    }
    case 'workshop': {
      backRow(0.8, 2.4, () => {
        const b = G(at(box(2.2, 0.9, 0.8, mat('#4a5058')), 0, 0.45, 0), at(box(2.2, 0.05, 0.8, mat('#6a5a40')), 0, 0.92, 0), at(box(2.0, 1.0, 0.05, mat('#2e3440')), 0, 1.6, -0.38), at(box(0.3, 0.25, 0.3, mat('#a83a2c')), -0.6, 1.07, 0));
        b.userData.spots = [{ x: 0.2, z: 0.8, yaw: 0, pose: 'workTable' }]; // a hand at the bench (hands.mjs)
        return b;
      });
      // Machine tools down the middle: a lathe, a mill, a press.
      for (let u = 2.5, k = 0; u < U - 2; u += 3.2, k++) {
        const v = (2 + V - 1) / 2;
        if (!free(u, v, 1.2, 0.6)) continue;
        put(k % 2 ? G(at(box(1.0, 1.0, 1.0, mat('#4a6a5a')), 0, 0.5, 0), at(box(0.5, 1.0, 0.5, mat('#4a6a5a')), 0, 1.5, -0.2), at(cyl(0.08, 0.08, 0.4, DARK, 6), 0, 1.0, 0.15))
          : G(at(box(2.2, 0.9, 0.7, mat('#4a5a6a')), 0, 0.45, 0), at(cyl(0.22, 0.22, 0.3, DARK, 10), -0.8, 1.1, 0, 0, 0, Math.PI / 2), at(box(0.4, 0.3, 0.4, DARK), 0.7, 1.05, 0)), u, v, face);
      }
      endRows(0.6, 1.0, () => box(0.9, 1.8, 0.6, mat('#5a3a32')), 1.2);
      break;
    }
    case 'gym': {
      for (let u = 2, k = 0; u < U - 1.5 && k < 3; u += 3, k++) put(G(at(box(0.8, 0.3, 1.8, DARK), 0, 0.15, 0), at(box(0.7, 1.2, 0.1, STEEL), 0, 0.9, -0.85)), u, V - 1.2, face + Math.PI);
      const mats = box(Math.min(5, U - 4), 0.04, Math.min(4, V - 4.5), mat('#2a4a6a'));
      put(mats, U / 2, 2.2 + Math.min(4, V - 4.5) / 2, face, { collide: false });
      endRows(0.6, 1.6, () => G(at(box(1.4, 1.6, 0.5, STEEL), 0, 0.8, 0), at(cyl(0.12, 0.12, 1.3, DARK, 8), 0, 0.5, 0.1, 0, 0, Math.PI / 2), at(cyl(0.12, 0.12, 1.3, DARK, 8), 0, 1.1, 0.1, 0, 0, Math.PI / 2)), 2.6);
      break;
    }
    case 'laundry': {
      const unit = () => G(at(box(0.7, 0.9, 0.7, mat('#d0d4d8')), 0, 0.45, 0), at(box(0.7, 0.9, 0.7, mat('#d0d4d8')), 0, 1.36, 0), at(cyl(0.22, 0.22, 0.04, mat('#2a3038'), 12), 0, 0.5, 0.36, Math.PI / 2), at(cyl(0.22, 0.22, 0.04, mat('#2a3038'), 12), 0, 1.4, 0.36, Math.PI / 2));
      backRow(0.7, 0.8, unit, 0.4);
      put(box(Math.min(3, U - 3), 0.85, 1.0, TABLE), U / 2, Math.max(2.6, V - 2.6), face, { y: 0.42 });
      break;
    }
    case 'cells': {
      // Cells across the back, behind bars; the guard's desk by the door.
      const depth = Math.min(3, V - 3.2), n = Math.max(1, Math.floor(U / 2.6));
      const bars = mat('#7a828c');
      for (let u = 0.15; u < U - 0.1; u += 0.16) {
        const [x, z] = P(u, V - depth);
        I.group.add(at(cyl(0.02, 0.02, 2.4, bars, 4), x, I.floorY + 1.2, z));
      }
      {
        const [ax, az] = P(0, V - depth), [bx, bz] = P(U, V - depth);
        I.collider(Math.min(ax, bx) - 0.05, I.floorY, Math.min(az, bz) - 0.05, Math.max(ax, bx) + 0.05, I.floorY + 2.4, Math.max(az, bz) + 0.05);
      }
      for (let i = 0; i < n; i++) {
        const u = (U * (i + 0.5)) / n;
        if (i) put(box(0.08, 2.4, depth, mat('#5d646e')), (U * i) / n, V - depth / 2, face, { y: 1.2 });
        put(G(at(box(1.9, 0.4, 0.8, BUNK), 0, 0.2, 0), at(box(1.8, 0.1, 0.7, SHEET), 0, 0.45, 0)), u, V - 0.5, face);
      }
      put(box(1.4, 0.75, 0.7, TABLE), U - 1.4, 2.6, face, { y: 0.37 });
      break;
    }
    case 'office': {
      for (let v = 3.6; v < V - 1.6; v += 3.2) for (let u = 1.6; u < U - 1.4; u += 2.6) {
        if (!free(u, v, 1.1, 0.8)) continue;
        const [x, z] = P(u, v);
        I.prop(desk(2.0, color, [['status', 'nav', 'radar'][Math.floor(u + v) % 3], 'text']), x, z, { ry: face });
        const [sx, sz] = P(u, v - 0.9);
        I.seat(sx, sz, face, '#3a4a60', { low: true });
      }
      backScreen('nav', Math.min(3, U - 1.5), 1.1);
      break;
    }
    case 'machines': {
      // Fans, switchgear or pumps: big housings, ducts across the deckhead.
      const kind = c.system;
      backRow(1.6, 2.6, () => kind === 'power'
        ? G(at(box(2.2, 2.2, 1.0, mat('#3e4650')), 0, 1.1, 0), at(box(2.0, 0.05, 0.02, glow('#ffd040', 0.9)), 0, 1.9, 0.51), at(box(0.3, 0.3, 0.02, glow('#39d27a', 0.9)), -0.7, 1.5, 0.51))
        : G(at(box(2.2, 1.6, 1.4, mat('#4f5a52')), 0, 0.8, 0), at(cyl(0.6, 0.6, 0.3, DARK, 14), 0, 1.0, 0.75, Math.PI / 2)));
      for (let u = 1; u < U; u += 3) {
        const [x, z] = P(u, (2 + V) / 2);
        I.group.add(at(box(alongZ ? V - 1 : 1.0, 0.6, alongZ ? 1.0 : V - 1, mat('#6a727c')), x, I.floorY + 2.55, z));
      }
      if (V > 6) for (let u = 2.4; u < U - 2; u += 3.4) if (free(u, V / 2 + 0.6, 0.8, 0.8)) put(kind === 'power' ? box(1.6, 1.8, 1.0, mat('#3e4650')) : G(at(cyl(0.7, 0.8, 1.4, mat('#4f5a52'), 12), 0, 0.7, 0)), u, V / 2 + 0.6, face, { y: kind === 'power' ? 0.9 : 0 });
      break;
    }
    case 'lockers': {
      const locker = () => G(at(box(0.6, 2.0, 0.55, mat('#4a5a6e')), 0, 1.0, 0), at(box(0.04, 0.3, 0.02, DARK), 0.2, 1.2, 0.28));
      backRow(0.55, 0.64, locker, 0.3);
      endRows(0.55, 0.64, locker, 0.8);
      put(box(Math.min(3, U - 3), 0.45, 0.4, STEEL), U / 2, Math.max(2.6, (2 + V - 0.55) / 2), face, { y: 0.22 });
      if (c.system === 'damage') for (let u = 1.2; u < U - 1; u += 2.4) if (free(u, 2.4)) put(at(cyl(0.35, 0.35, 0.3, mat('#a8322c'), 12), 0, 1.4, 0, Math.PI / 2), u, V - 0.85, face, { collide: false });
      break;
    }
    case 'briefing': {
      backScreen('map', Math.min(4, U - 2), 1.6, 1.8);
      for (let v = V - 3; v > 2.4; v -= 1.5) for (let u = 1.6; u < U - 1.2; u += 1.1) {
        if (Math.abs(u - U / 2) < 0.7) continue; // an aisle down the middle
        const [x, z] = P(u, v);
        I.seat(x, z, face, '#3a4a60', { low: true });
      }
      break;
    }
  }
}

function drone() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat('#c8ccd2')));
  g.add(at(box(0.9, 0.06, 0.1, DARK), 0, 0, 0), at(box(0.1, 0.06, 0.9, DARK), 0, 0, 0));
  g.add(at(box(0.12, 0.12, 0.04, glow('#ffb347')), 0, 0.05, -0.32));
  return g;
}

function hangar(C, I, c, hooks) {
  const [x1, x2] = c.x, [z1, z2] = c.z;
  // Launch lanes: a painted strip from each fighter to the bay door on the side she faces (yaw +90° is port, -x).
  C.L.fighters.forEach((f, i) => {
    const out = f.yaw >= 0 ? -1 : 1, wall = out < 0 ? x1 : x2, tail = f.at[0] - out * 3;
    const lane = at(box(Math.abs(wall - tail), 0.02, 0.4, glow('#4fd0e0', 0.35)), (wall + tail) / 2, I.floorY + 0.01, f.at[1]);
    I.group.add(lane);
    const w = fighter({ paint: '#c9c4b6' });
    foldWings(w, 1);
    w.position.set(f.at[0], I.floorY + 1.15, f.at[1]);
    w.rotation.y = f.yaw;
    w.userData.live = true; // its own meshes (canopy hinge, wings): not baked
    for (const p of [...w.userData.plumes, ...w.userData.halos]) p.visible = false;
    I.group.add(w);
    C.fighters.push(w);
    I.collider(Math.min(f.at[0] + out * 3, f.at[0] - out * 6), I.floorY, f.at[1] - 3.8, Math.max(f.at[0] + out * 3, f.at[0] - out * 6), I.floorY + 3, f.at[1] + 3.8);
    // Her ladder, on her port side: E climbs in (main.mjs, fighter.mjs). In an airless, weightless hangar it is a frame
    // of grab bars you pull yourself up, not a ladder you climb.
    if (c.vacuum) I.group.add(grabFrame(f.at[0] + 1, I.floorY, f.at[1] - 4.0));
    I.use(`fighter-${i}`, c.vacuum ? 'Pull yourself up into the cockpit' : 'Climb into the fighter', f.at[0] + 1, f.at[1] - 4.6, () => hooks.fighter?.(i), { r: 2.8 });
  });
  // Crates and a fuel cart along the inboard wall, gantries overhead.
  // Crates and a fuel cart along a wall with no door in it, gantries overhead.
  const doors = bayDoorsOf(c), sides = new Set(doors.map((d) => d.side));
  const crateX = !sides.has('e') ? x2 - 2.2 : !sides.has('w') ? x1 + 2.2 : null;
  const clear = (z) => !doors.some((d) => z > d.from - 4 && z < d.to + 4);
  for (let z = z1 + 3; z < z2 - 3; z += 9) if (crateX !== null || clear(z)) I.prop(box(2.2, 1.6, 2.2, CRATE), crateX ?? x2 - 2.2, z, { y: 0.8 });
  for (let z = z1 + 10; z < z2; z += 20) I.prop(box(x2 - x1 - 1, 0.5, 0.6, TRIM), (x1 + x2) / 2, z, { y: 10.5, collide: false });
  I.sign('HANGAR', x2 - 0.15, 8, crateX === null ? (z1 + doors[0].from) / 2 : -16, -Math.PI / 2, '#4fd0e0', 6);
  // The bay doors. Where the hangar has headroom over the opening (the spin-drum carrier: 5 m over an 18 m door), each
  // door is a stack of leaves that telescope up into it, all clear of the opening when open; the leaves stand a little
  // further outboard each, so they nest behind the wall's header. Without the headroom, one slab lifts into the deck
  // above. C.bayDoor moves them all.
  const head = (c.h ?? 0) - 0.4;
  const leaves = doors.flatMap((d, k) => {
    const x = d.side === 'w' ? x1 - 0.1 : x2 + 0.1, out = d.side === 'w' ? -1 : 1;
    const room = head - d.height, n = room >= 1 ? Math.ceil(d.height / room) : 1, lh = d.height / n;
    return Array.from({ length: n }, (_, i) => {
      const leaf = at(box(0.3, lh - 0.04, d.to - d.from, metal('#6a727c', { metalness: 0.5 })), x + out * 0.12 * i, I.floorY + lh * (i + 0.5), (d.from + d.to) / 2);
      const rise = n > 1 ? d.height + 0.2 - lh * i : d.height - 0.4;
      return I.door(`bay${k ? `-${k}` : ''}${i ? `-leaf${i}` : ''}`, leaf, new THREE.Vector3(0, rise, 0));
    });
  });
  C.bayDoor = leaves.length === 1 ? leaves[0] : { set: (k) => leaves.forEach((d) => d.set(k)) };
}

/** A fighter's boarding frame in a weightless hangar: two uprights with grab bars between them up to the cockpit's sill,
 *  a hoop at the top leaning in toward her, on a base plate clamped to the deck. */
function grabFrame(x, y, z) {
  const g = new THREE.Group(), bar = mat('#d8a530'), post = mat('#8a929c');
  for (const s of [-0.4, 0.4]) g.add(at(box(0.07, 2.6, 0.07, post), s, 1.3, 0));
  for (let h = 0.45; h < 2.5; h += 0.4) g.add(at(box(0.8, 0.045, 0.045, bar), 0, h, 0));
  g.add(at(box(0.9, 0.06, 0.06, bar), 0, 2.62, 0.25), ...[-0.4, 0.4].map((s) => at(box(0.06, 0.06, 0.5, post), s, 2.6, 0.25)));
  g.add(at(box(1.1, 0.05, 0.6, hazardMat()), 0, 0.025, 0));
  g.position.set(x, y, z);
  return g;
}

/** The opening a ladder's trunk passes through, in the trunk's own frame (main.mjs `ladderTrunk`: the ladder at the
 *  origin, climbed from +z, walls at x ±0.8 and z -0.55 and 1.1): just inside its walls. */
const HATCH = { x: [-0.74, 0.74], z: [-0.49, 1.04] };

/** Where the ladders go through the decks: per walkable room, the opening in its deck (`floor`) or deckhead (`ceil`)
 *  over or under each trunk, with the ladders that use it. A climb is drawn up the trunk at the end you start from, so
 *  each end makes an opening in its own room and in the room straight above or below it. */
function ladderHoles(C) {
  const holes = new Map();
  const floorOf = (id) => C.L.decks.find((d) => d.id === id).floor;
  const roomAt = (deck, x, z) => C.L.compartments.find((c) => c.access === 'walk' && c.deck === deck && x > c.x[0] && x < c.x[1] && z > c.z[0] && z < c.z[1]);
  for (const l of C.L.ladders) for (const end of ['a', 'b']) {
    const p = l[end], o = l[end === 'a' ? 'b' : 'a'], up = floorOf(o.deck) > floorOf(p.deck);
    const yaw = p.yaw ?? 0, cs = Math.cos(yaw), sn = Math.sin(yaw), xs = [], zs = [];
    for (const hx of HATCH.x) for (const hz of HATCH.z) xs.push(p.at[0] + hx * cs + hz * sn), zs.push(p.at[1] - hx * sn + hz * cs);
    for (const [deck, kind] of [[p.deck, up ? 'ceil' : 'floor'], [o.deck, up ? 'floor' : 'ceil']]) {
      const r = roomAt(deck, p.at[0], p.at[1]);
      if (!r) continue;
      const list = holes.get(r.id) ?? holes.set(r.id, []).get(r.id);
      const h = list.find((h) => h.kind === kind) ?? (list.push({ kind, x: [Infinity, -Infinity], z: [Infinity, -Infinity], ladders: new Set() }), list.at(-1));
      h.x = [Math.max(r.x[0] + 0.05, Math.min(h.x[0], ...xs)), Math.min(r.x[1] - 0.05, Math.max(h.x[1], ...xs))];
      h.z = [Math.max(r.z[0] + 0.05, Math.min(h.z[0], ...zs)), Math.min(r.z[1] - 0.05, Math.max(h.z[1], ...zs))];
      h.ladders.add(l.id);
    }
  }
  return holes;
}

/** A lid over each of a deck's ladder openings, sliding clear along the room's long way, away from the nearer wall.
 *  `C.hatchLids` (ladder id → lids) is what a climb opens; main.mjs moves them. */
function hatches(C, I, c) {
  const h0 = c.h ?? H;
  for (const h of C.holes.get(c.id) ?? []) {
    const w = h.x[1] - h.x[0] + 0.16, d = h.z[1] - h.z[0] + 0.16, cx = (h.x[0] + h.x[1]) / 2, cz = (h.z[0] + h.z[1]) / 2;
    const lid = at(box(w, 0.06, d, hazardMat()), cx, I.floorY + (h.kind === 'floor' ? 0.03 : h0 - 0.03), cz);
    lid.userData.live = true;
    I.group.add(lid);
    const alongX = c.x[1] - c.x[0] > c.z[1] - c.z[0];
    const sign = alongX ? (cx - c.x[0] > c.x[1] - cx ? -1 : 1) : (cz - c.z[0] > c.z[1] - cz ? -1 : 1);
    const travel = alongX ? new THREE.Vector3(sign * (w + 0.05), 0, 0) : new THREE.Vector3(0, 0, sign * (d + 0.05));
    const entry = { mesh: lid, home: lid.position.clone(), travel, k: 0, want: 0 };
    (C.lids ??= []).push(entry);
    for (const id of h.ladders) (C.hatchLids.get(id) ?? C.hatchLids.set(id, []).get(id)).push(entry);
  }
}

function ladder(C, I, l, end, hooks) {
  const p = l[end], other = l[end === 'a' ? 'b' : 'a'];
  const up = C.L.decks.find((d) => d.id === other.deck).floor > I.floorY;
  const [x, z] = p.at;
  const g = new THREE.Group();
  const rail = mat('#c9a43a');
  // A steep ship's ladder: two rails and rungs, through a hatch in the deckhead (going up) or the deck (going down).
  const top = up ? 3.2 : 1.1;
  for (const s of [-0.35, 0.35]) g.add(at(box(0.06, top + 0.2, 0.06, rail), s, top / 2, 0));
  if (up) for (let y = 0.3; y < top; y += 0.3) g.add(at(box(0.7, 0.04, 0.06, rail), 0, y, 0));
  // At the foot, a hazard plate; the hatch overhead (or underfoot, going down) is a real opening with a lid
  // (`hatches()`), so a climb goes through the deck instead of through a solid slab.
  if (up) g.add(at(box(1.3, 0.03, 1.3, hazardMat()), 0, 0.02, 0));
  g.position.set(x, I.floorY, z);
  g.rotation.y = p.yaw ?? 0;
  I.group.add(g);
  const name = C.L.decks.find((d) => d.id === other.deck).name;
  I.use(`${l.id}-${end}`, `${up ? 'Climb up' : 'Climb down'} to the ${name.toLowerCase()}`, x, z, () => hooks.ladder?.(l, end), { r: 2 });
}

/** The boarding tubes, where a fighter has `boarding` (the spin-drum carrier, whose hangar is airless): a hatch in the
 *  deck of the room it names, over her, and a tube from the hangar's roof down to her canopy, so a pilot goes from the
 *  crew tunnel into her seat without a suit. E at the hatch boards her (`hooks.fighter`). */
function boardingTubes(C, hooks) {
  const hc = [...C.rooms.values()].find((c) => c.system === 'hangar' && c.access === 'walk');
  const HI = hc && C.decks.get(hc.deck);
  const steel = mat('#b9bec6'), ring = mat('#6a7380');
  C.L.fighters.forEach((f, i) => {
    const b = f.boarding, from = b && C.rooms.get(b.from), I = from && C.decks.get(from.deck);
    if (!I) return;
    const side = Math.sign(f.at[0]) || 1;
    const x = Math.min(from.x[1] - 0.5, Math.max(from.x[0] + 0.5, b.at[0] + side * 0.85)), z = b.at[1];
    const g = new THREE.Group();
    g.add(at(cyl(0.62, 0.62, 0.04, hazardMat(), 20), 0, 0.02, 0), at(cyl(0.48, 0.48, 0.06, '#1a1d22', 20), 0, 0.03, 0));
    for (const s of [-1, 1]) g.add(at(box(0.05, 1.1, 0.05, '#c9a43a'), s * 0.55, 0.55, 0), at(box(0.05, 0.05, 1.0, '#c9a43a'), s * 0.55, 1.1, 0));
    g.position.set(x, I.floorY, z);
    I.group.add(g);
    I.use(`tube-${i}`, `Down the boarding tube to fighter ${i + 1}`, x, z, () => hooks.fighter?.(i), { r: 2 });
    if (!HI) return;
    const out = f.yaw >= 0 ? -1 : 1; // her nose points out of her side's door
    const top = HI.floorY + (hc.h ?? 3), bottom = HI.floorY + 3.3, tx = f.at[0] + out * 1.5;
    // The tube telescopes up to the roof when she is crewed and her drive is up, so she lifts and runs out clear of it
    // (`C.boardTubes`, run by main.mjs): a group pivoted at the roof, squashed toward it.
    const t = new THREE.Group();
    t.add(at(cyl(0.75, 0.75, top - bottom, steel, 14), 0, (top + bottom) / 2 - top, 0));
    for (let y = bottom + 0.3; y < top; y += 2.5) t.add(at(cyl(0.82, 0.82, 0.18, ring, 14), 0, y - top, 0));
    t.add(at(cyl(1.0, 0.85, 0.4, ring, 14), 0, bottom + 0.2 - top, 0));
    t.position.set(tx, top, f.at[1]);
    t.userData.live = true;
    HI.group.add(t);
    (C.boardTubes ??= [])[i] = { t, k: 0 };
  });
}

// --- sealed compartments: machinery you see but do not walk into -----------------------------------------------------

const SHELL_IN = new THREE.MeshLambertMaterial({ color: '#23272e', side: THREE.BackSide });

function buildSealed(C, c) {
  const [x1, x2] = c.x, [y0, y1] = c.y, [z1, z2] = c.z;
  const w = x2 - x1, h = y1 - y0, d = z2 - z1;
  const cx = (x1 + x2) / 2, cy = (y0 + y1) / 2, cz = (z1 + z2) / 2;
  const M = C.machinery;
  M.add(at(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), SHELL_IN), cx, cy, cz));
  const g = new THREE.Group();
  g.position.set(cx, y0, cz);
  machine(c.system, g, w, h, d, C);
  workLamps(g, w, h, d);
  M.add(g);
  // The cutaway's colour: faint faces and bright edges.
  const color = SYSTEMS[c.system]?.[0] ?? '#ffffff';
  const faces = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color }));
  faces.position.set(cx, cy, cz);
  edges.position.set(cx, cy, cz);
  C.overlay.add(faces, edges);
  C.labels.push({ c, at: new THREE.Vector3(cx, cy, cz), y0, y1 });
}

const HOT = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
/** The heat sinks' bands: dark when the ship runs cool, a dull red to orange as the sinks fill (plant.mjs). */
export const HEAT_GLOW = new THREE.MeshBasicMaterial({ color: '#3a1a10', toneMapped: false });

function machine(system, g, w, h, d, C) {
  const dark = mat('#3b4048'), mid = mat('#5d646e'), pipeM = mat('#7a6a50');
  switch (system) {
    case 'reactor': {
      // A tokamak on its side across the ship, its ring facing engineering's window: the plasma burning in the middle
      // of the vacuum vessel's rails, sixteen field coils round it, the central solenoid through it along the ship, the
      // legs it stands on, and a catwalk at the level of engineering's floor, along the window.
      const r = Math.min(w, h) * 0.32, cy = h * 0.5;
      const plasmaMat = new THREE.MeshBasicMaterial({ color: '#ffd6f4', toneMapped: false });
      const haloMat = new THREE.MeshBasicMaterial({ color: '#c070ff', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const plasma = at(new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.12, 10, 48), plasmaMat), 0, cy, 0);
      const halo = at(new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.3, 12, 48), haloMat), 0, cy, 0);
      plasma.userData.live = halo.userData.live = true;
      g.add(plasma, halo);
      for (const [dr, dz] of [[r * 0.36, 0], [-r * 0.36, 0], [0, r * 0.36], [0, -r * 0.36]]) {
        g.add(at(new THREE.Mesh(new THREE.TorusGeometry(r + dr, 0.14, 5, 48), dark), 0, cy, dz));
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const coil = new THREE.Mesh(new THREE.TorusGeometry(r * 0.44, r * 0.075, 6, 18), i % 4 ? mid : mat('#8a6a3a'));
        coil.position.set(Math.cos(a) * r, cy + Math.sin(a) * r, 0);
        coil.rotation.set(Math.PI / 2, 0, a, 'ZYX'); // its axis along the ring
        g.add(coil);
      }
      g.add(at(cyl(r * 0.3, r * 0.3, d * 0.9, dark, 16), 0, cy, 0, Math.PI / 2));
      for (const s of [-1, 1]) {
        g.add(at(box(1.4, cy - r * 0.7, 1.4, dark), s * r * 0.62, (cy - r * 0.7) / 2, 0));
        g.add(at(cyl(0.45, 0.45, cy, pipeM, 8), s * (r + 3.2), cy / 2, d * 0.2)); // coolant risers
      }
      const walk = 1.8; // engineering's floor, over the reactor room's own
      g.add(at(box(w * 0.86, 0.12, 1.8, mat('#4a4e54')), 0, walk, -d / 2 + 1.3));
      g.add(at(box(w * 0.86, 0.08, 0.08, mat('#c9a83a')), 0, walk + 1.05, -d / 2 + 2.15));
      for (let x = -w * 0.42; x <= w * 0.42; x += 2.4) g.add(at(box(0.08, 1.05, 0.08, mat('#c9a83a')), x, walk + 0.52, -d / 2 + 2.15));
      C.reactor = { plasmaMat, haloMat, plasma: new THREE.Color('#ffd6f4'), halo: 0.4, at: [g.position.x, g.position.y + cy, g.position.z] };
      break;
    }
    case 'drive': {
      // Four feed trunks running aft to the bells, with turbopumps on them.
      for (const t of C.L.thrusters.main) {
        const x = t.at[0], y = t.at[1];
        g.add(at(cyl(2.2, 2.6, d * 0.95, mid, 14), x, y - g.position.y, 0, Math.PI / 2));
        g.add(at(box(3, 3, 4, dark), x, y - g.position.y + 3, -d * 0.25));
        g.add(at(cyl(0.4, 0.4, d * 0.9, pipeM, 6), x + 2.8, y - g.position.y, 0, Math.PI / 2));
      }
      break;
    }
    case 'heat': {
      // The heat sinks: banks of insulated tanks of a wax that melts as it soaks up heat, coolant headers along the top
      // carrying it out to the radiators. The bands glow as the ship runs hot (plant.mjs drives HEAT_GLOW).
      const n = Math.max(2, Math.floor(d / 9));
      for (let i = 0; i < n; i++) {
        const z = -d / 2 + (d * (i + 0.5)) / n;
        for (const x of [-w * 0.22, w * 0.22]) {
          g.add(at(cyl(w * 0.18, w * 0.18, h * 0.82, mat('#6a6258'), 14), x, h * 0.42, z));
          g.add(at(new THREE.Mesh(new THREE.TorusGeometry(w * 0.185, 0.18, 5, 22), HEAT_GLOW), x, h * 0.6, z, Math.PI / 2));
        }
      }
      for (const x of [-w * 0.22, w * 0.22]) g.add(at(cyl(0.6, 0.6, d * 0.95, pipeM, 8), x, h * 0.9, 0, Math.PI / 2));
      break;
    }
    case 'pdc': {
      // Point defence: belt boxes of tracer rounds in racks, and the fire-control cabinets.
      for (let z = -d / 2 + 2; z < d / 2 - 2; z += 3) g.add(at(box(w * 0.5, h * 0.7, 1.6, mat('#5a5a3a')), -w * 0.18, h * 0.36, z));
      for (let z = -d / 2 + 4; z < d / 2 - 2; z += 8) g.add(at(box(w * 0.2, h * 0.8, 1.2, dark), w * 0.3, h * 0.4, z));
      break;
    }
    case 'tanks': {
      const n = Math.max(2, Math.floor(w / 6)), r = Math.min(h * 0.42, (w / n) * 0.47);
      for (let i = 0; i < n; i++) g.add(at(cyl(r, r, d * 0.96, mat('#4a6378'), 12), -w / 2 + (w * (i + 0.5)) / n, h / 2, 0, Math.PI / 2));
      break;
    }
    case 'magazine': {
      // Racks of heavy rounds, and the hoist that feeds the turret.
      for (let x = -w / 2 + 1.5; x < w / 2 - 1; x += 2.4) for (let y = 1; y < h - 1; y += 2.4) g.add(at(box(1.6, 1.6, d * 0.85, mat('#6a5a3a')), x, y, 0));
      break;
    }
    case 'turret': {
      g.add(at(cyl(Math.min(w, d) * 0.45, Math.min(w, d) * 0.45, h, dark, 16), 0, h / 2, 0));
      g.add(at(box(1.4, h, 1.4, mat('#8a7a50')), 0, h / 2, 0));
      break;
    }
    case 'life-support': {
      for (let x = -w / 2 + 2; x < w / 2 - 1; x += 3.5) {
        // Scrubber columns with a lit gauge band, and the blower housings with their status panels.
        g.add(at(cyl(1.0, 1.0, h * 0.8, mat('#5a7a62'), 10), x, h * 0.4, -d * 0.2));
        g.add(at(new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.08, 4, 16), HOT('#5dff9a')), x, h * 0.55, -d * 0.2, Math.PI / 2));
        g.add(at(box(2.4, h * 0.5, 2.4, dark), x, h * 0.25, d * 0.25));
        g.add(at(box(0.9, 0.5, 0.05, HOT(x % 7 < 3.5 ? '#5dff9a' : '#ffd040')), x, h * 0.32, d * 0.25 - 1.23));
      }
      g.add(at(cyl(0.3, 0.3, w * 0.9, pipeM, 6), 0, h * 0.85, 0, 0, 0, Math.PI / 2));
      break;
    }
    case 'power': {
      for (let z = -d / 2 + 4; z < d / 2 - 2; z += 7) g.add(at(box(w * 0.7, h * 0.6, 4, dark), 0, h * 0.3, z));
      g.add(at(box(0.5, 0.5, d * 0.9, HOT('#ffd040')), 0, h * 0.8, 0));
      break;
    }
    case 'quarters': {
      // Berthing: three-high bunks in rows, an aisle every second row, one tier of them per 3.8 m of height.
      const levels = Math.max(1, Math.floor(h / 3.8)), lh = h / levels;
      const frame = mat('#4a5058');
      for (let k = 0; k < levels; k++) {
        if (k) g.add(at(box(w, 0.2, d, dark), 0, k * lh, 0));
        for (let x = -w / 2 + 1.3; x < w / 2 - 1; x += 3.2) for (let z = -d / 2 + 0.8, i = 0; z < d / 2 - 0.5; z += i % 2 ? 1.6 : 0.95, i++) {
          g.add(at(box(2.1, Math.min(2.6, lh - 0.8), 0.9, frame), x, k * lh + Math.min(2.6, lh - 0.8) / 2 + 0.1, z));
        }
      }
      break;
    }
    case 'stores': {
      // Racks of crates, a level every 4 m.
      const levels = Math.max(1, Math.floor(h / 4)), lh = h / levels;
      const crate = mat('#6a6248'), crate2 = mat('#4f5a46');
      for (let k = 0; k < levels; k++) {
        if (k) g.add(at(box(w, 0.2, d, dark), 0, k * lh, 0));
        for (let x = -w / 2 + 1; x < w / 2 - 0.6; x += 2.4) g.add(at(box(1.2, Math.min(3, lh - 0.9), d * 0.9, (Math.round(x) + k) % 2 ? crate : crate2), x, k * lh + Math.min(3, lh - 0.9) / 2 + 0.1, 0));
      }
      break;
    }
    case 'aux': case 'cooling': case 'water': {
      // Pumps on their beds, heat exchangers or filter tanks, and the pipes between them, along the compartment.
      const tank = mat(system === 'water' ? '#4a7088' : system === 'cooling' ? '#7a5a50' : '#5a6470');
      const long = d >= w;
      const L1 = long ? d : w, W1 = long ? w : d;
      // a runs the long way, b across; a cylinder made along y is laid along a.
      const put = (mesh, a, y, b, lay = false) => g.add(at(mesh, long ? b : a, y, long ? a : b, lay && long ? Math.PI / 2 : 0, 0, lay && !long ? Math.PI / 2 : 0));
      const r = Math.min(h * 0.38, 2.4);
      for (let b = -W1 / 2 + r + 0.6; b < W1 / 2 - r; b += r * 2 + 1.4) {
        put(cyl(r, r, L1 * 0.8, tank, 12), 0, r + 0.3, b, true);
        if (b + r + 1.3 < W1 / 2) for (let a = -L1 / 2 + 3; a < L1 / 2 - 2; a += 6) put(box(1.6, Math.min(1.6, h * 0.4), 1.6, dark), a, Math.min(1.6, h * 0.4) / 2, b + r + 0.5);
      }
      for (const b of [-W1 / 4, W1 / 4]) put(cyl(0.25, 0.25, L1 * 0.95, pipeM, 6), 0, h - 0.5, b, true);
      break;
    }
    case 'sensors': {
      // Cabinets of electronics with their status lights; the forward array is a great dish behind the bow.
      for (let x = -w / 2 + 1; x < w / 2 - 0.6; x += 2.2) g.add(at(box(0.8, Math.min(2.2, h - 0.4), d * 0.85, mat('#2a323c')), x, Math.min(2.2, h - 0.4) / 2, 0));
      for (let x = -w / 2 + 1; x < w / 2 - 0.6; x += 2.2) g.add(at(box(0.05, 0.05, d * 0.8, HOT('#6ad0ff')), x + 0.42, Math.min(2.2, h - 0.4) * 0.7, 0));
      if (h > 10) {
        const R = Math.min(w, h) * 0.45;
        const dish = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 10, 0, Math.PI * 2, 0, 0.9), mat('#9aa6b4', { side: THREE.DoubleSide }));
        dish.rotation.x = Math.PI / 2; // the bowl opens toward the bow
        dish.position.set(0, h / 2, -d / 2 + 1 - R * Math.cos(0.9));
        g.add(dish);
      }
      break;
    }
    case 'hangar': {
      // Over the hangar: the crane rails the fighters are lifted on, the ventilation trunks, the fire mains.
      for (let x = -w / 2 + 2; x < w / 2; x += 8) g.add(at(box(0.8, 1.2, d * 0.98, dark), x, 0.6, 0));
      for (const x of [-w / 4, w / 4]) g.add(at(box(3, 2, d * 0.95, mat('#6a727c')), x, h - 1.4, 0));
      for (const x of [-w / 3, 0, w / 3]) g.add(at(cyl(0.3, 0.3, d * 0.95, mat('#a8322c'), 6), x + 1.6, h - 0.6, 0, Math.PI / 2));
      break;
    }
    default: {
      // Equipment racks and cabinets in rows.
      for (let x = -w / 2 + 1.2; x < w / 2 - 0.8; x += 2.6) g.add(at(box(1.4, Math.min(2.4, h - 0.4), d * 0.85, mid), x, Math.min(2.4, h - 0.4) / 2, 0));
      g.add(at(cyl(0.25, 0.25, d * 0.9, pipeM, 6), 0, h - 0.5, 0, Math.PI / 2));
    }
  }
}

/** Work lamps on a sealed compartment's deckhead: a strip every 9 m or so, in rows across it. */
function workLamps(g, w, h, d) {
  const long = d >= w, L1 = long ? d : w, W1 = long ? w : d;
  const n = Math.max(1, Math.round(L1 / 9)), rows = W1 > 12 ? 2 : 1;
  for (let i = 0; i < n; i++) for (let k = 0; k < rows; k++) {
    const a = -L1 / 2 + (L1 * (i + 0.5)) / n, b = rows > 1 ? (k ? W1 / 4 : -W1 / 4) : 0;
    g.add(at(box(long ? 0.35 : 1.8, 0.08, long ? 1.8 : 0.35, glow('#dfe6ee')), long ? b : a, h - 0.1, long ? a : b));
  }
}

/** The sealed spaces you can see into through a walkable room's window (engineering looks into the reactor, life
 *  support control into the atmosphere plant) get real lights: work lamps, and the reactor's own glow. They are lights
 *  of the deck the window is on, so the light pool shines them while you walk that deck, ahead of the room lights at
 *  the same distance (`weight`). `C.machineLights` lists them for `machineryFrame`. */
function lightViewed(C) {
  C.machineLights = [];
  const done = new Set();
  for (const c of C.L.compartments) {
    if (c.access !== 'walk' || !c.windows) continue;
    const I = C.decks.get(c.deck);
    for (const win of c.windows) {
      const alongX = win.side === 'n' || win.side === 's';
      const sign = win.side === 'n' || win.side === 'w' ? -1 : 1;
      const line = alongX ? c.z[sign < 0 ? 0 : 1] : c.x[sign < 0 ? 0 : 1];
      const y0 = I.floorY + (win.sill ?? 1), y1 = I.floorY + (win.head ?? c.h ?? H);
      for (const s of C.L.compartments) {
        if (s.access !== 'sealed' || done.has(s.id)) continue;
        const near = alongX ? s.z[sign < 0 ? 1 : 0] : s.x[sign < 0 ? 1 : 0];
        const span = alongX ? s.x : s.z;
        if (Math.abs(near - line) > GAP || span[1] < win.from || span[0] > win.to || s.y[1] < y0 || s.y[0] > y1) continue;
        done.add(s.id);
        // Two work lamps a few metres in from the window, high up; the reactor's glow at its ring.
        const into = Math.min(4, ((alongX ? s.z[1] - s.z[0] : s.x[1] - s.x[0]) * 0.4));
        const ly = Math.min(s.y[1] - 0.6, y1 + 3);
        for (const k of [0.25, 0.75]) {
          const a = win.from + (win.to - win.from) * k;
          const p = alongX ? [a, ly, line + sign * into] : [line + sign * into, ly, a];
          lamp(C, I, p, '#e6eef8', 22, 20, 'work');
        }
        if (s.system === 'reactor' && C.reactor) lamp(C, I, C.reactor.at, '#d8a0ff', 80, 36, 'plasma');
      }
    }
  }
}

function lamp(C, I, p, color, intensity, distance, kind) {
  const anchor = new THREE.Object3D();
  anchor.position.set(...p);
  I.group.add(anchor);
  const spec = { anchor, color: new THREE.Color(color), intensity, distance, decay: 1.6, room: null, weight: 0.3, kind };
  spec.base = { color: spec.color.clone(), intensity };
  I.lights.push(spec);
  C.machineLights.push(spec);
}

const EMERGENCY = new THREE.Color('#ff3a20');

/** Each frame: the plasma's shimmer, and what the power does to it and the lamps. `power` false is emergency power:
 *  the work lamps go to a dim red and the plasma to an ember; `reactor` (0 to 1) is the reactor's health. */
export function machineryFrame(C, t, { power = true, reactor = 1 } = {}) {
  const R = C.reactor;
  const level = power ? 0.35 + 0.65 * reactor : 0.12;
  const shimmer = 0.88 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 2.9) + 0.04 * Math.sin(t * 31);
  if (R) {
    R.plasmaMat.color.copy(R.plasma).multiplyScalar(level * shimmer);
    R.haloMat.opacity = R.halo * level * shimmer;
  }
  for (const s of C.machineLights ?? []) {
    if (s.kind === 'plasma') s.color.copy(s.base.color), (s.intensity = s.base.intensity * level * shimmer);
    else if (power) s.color.copy(s.base.color), (s.intensity = s.base.intensity);
    else s.color.copy(s.base.color).lerp(EMERGENCY, 0.6), (s.intensity = s.base.intensity * 0.25);
  }
}

// --- the outside ---------------------------------------------------------------------------------------------------

function buildOutside(C) {
  const O = C.outside;
  for (const m of C.L.mounts) {
    if (m.kind === 'turret') O.add(turret(m));
    else if (m.kind === 'pdc') O.add(pdcBase(m));
    else if (m.kind === 'radiator') {
      const [a, b] = m.x, [z1, z2] = m.z;
      const panel = at(box(b - a, 0.5, z2 - z1, mat('#3a2e2a')), (a + b) / 2, m.y, (z1 + z2) / 2);
      O.add(panel);
      // Heat lines across the panel: they glow dull red, the ship shedding heat.
      for (let z = z1 + 2; z < z2; z += 4) O.add(at(box(b - a - 1, 0.55, 0.3, HOT('#7a2a18')), (a + b) / 2, m.y, z));
      const inboard = Math.abs(a) < Math.abs(b) ? a : b; // the edge against the hull
      O.add(at(box(Math.abs(b - a) * 0.1, 3, z2 - z1, TRIM), inboard + Math.sign(inboard) * 0.8, m.y, (z1 + z2) / 2));
    } else if (m.kind === 'bay-door') {
      const [y0, y1] = m.y, [z1, z2] = m.z;
      // The outer door: rides up the outside of the hull with the inner one (main.mjs drives all of them), all the way
      // clear of the opening, so the bay opens onto space.
      const out = Math.sign(m.x) || -1;
      const panel = at(box(0.6, y1 - y0, z2 - z1, mat('#4a525c')), m.x + out * 0.2, (y0 + y1) / 2, (z1 + z2) / 2);
      panel.userData.live = true;
      panel.userData.home = panel.position.y;
      panel.userData.travel = y1 - y0 + 0.3;
      O.add(panel);
      (C.bayPanels ??= []).push(panel);
      C.bayPanel ??= panel;
      for (const z of [z1, z2]) O.add(at(box(0.8, y1 - y0 + 1, 1, hazardMat()), m.x + out * 0.3, (y0 + y1) / 2, z));
    }
  }
  // The bridge's armoured shutters: open plates above and below each window, outside the wall.
  const br = C.rooms.get('bridge'), fl = br && C.L.decks.find((d) => d.id === br.deck)?.floor;
  for (const w of br?.windows ?? []) {
    const len = w.to - w.from + 1.4, mid = (w.from + w.to) / 2, y1 = fl + (w.head ?? 3.3) + 1.3, y0 = fl + (w.sill ?? 1) + 0.15;
    const along = w.side === 'n' || w.side === 's';
    const off = { n: br.z[0] - 1.7, s: br.z[1] + 1.7, w: br.x[0] - 1.7, e: br.x[1] + 1.7 }[w.side];
    for (const [y, t] of [[y1, 1.2], [y0, 0.8]]) O.add(along ? at(box(len, t, 0.8, TRIM), mid, y, off) : at(box(0.8, t, len, TRIM), off, y, mid));
  }
  bake(O);
}

/** A turret: the barbette's ring, and on it the gunhouse (named the mount's id, origin on the turret's axis at the
 *  ring) carrying the guns (`<id>-guns`, origin on the trunnions), the same names and pivots as hull.glb's, so
 *  weapons.mjs trains and elevates either. */
function turret(m) {
  const g = new THREE.Group();
  const s = Math.sign(m.up[1]);
  const armour = metal('#6e7782', { metalness: 0.5 });
  g.add(at(cyl(5.5, 6, 2, DARK, 18), 0, s * 1, 0)); // the barbette's ring
  const house = new THREE.Group();
  house.name = m.id;
  house.userData.live = true;
  house.position.set(0, s * 2.2, 0);
  house.add(at(box(9, 4.5, 11, armour), 0, s * 1.8, 0)); // the gunhouse
  house.add(at(box(3, 1.4, 3, mat('#1a2a3a')), 3, s * 4.9, -1.5)); // the gunner's cab and its sight
  const guns = new THREE.Group();
  guns.name = `${m.id}-guns`;
  guns.position.set(0, s * 1.7, -6.2);
  for (const x of [-1.7, 1.7]) guns.add(at(cyl(0.55, 0.75, 20, DARK, 10), x, 0, -11.2, -Math.PI / 2)); // two long barrels, muzzles forward
  house.add(guns);
  g.add(house);
  g.position.set(...m.at);
  return g;
}

/** A point defence mount's armoured sponson (the rotary gun that turns on it is weapons.mjs's, in both hulls). */
function pdcBase(m) {
  const g = new THREE.Group();
  g.add(at(cyl(2.2, 2.8, 1.6, TRIM, 14), 0, 0.8, 0));
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...m.up));
  g.position.set(...m.at);
  return g;
}

// --- the cutaway's floors ------------------------------------------------------------------------------------------

function floorOverlay(C, c, floor) {
  const color = SYSTEMS[c.system]?.[0] ?? '#ffffff';
  const [x1, x2] = c.x, [z1, z2] = c.z;
  const plate = at(box(x2 - x1, 0.05, z2 - z1, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false })), (x1 + x2) / 2, floor + 0.04, (z1 + z2) / 2);
  C.overlay.add(plate);
  C.labels.push({ c, at: new THREE.Vector3((x1 + x2) / 2, floor + 1.5, (z1 + z2) / 2), y0: floor, y1: floor + (c.h ?? H) });
}

/** Puts on the Blender hull (assets/carrier/hull.glb, from tools/blender/carrier_v2_build.py) in place of the lofted one
 *  and the code-built fittings. Without the file the ship keeps her code-built outside: nothing else changes. */
export async function loadHull(C, url = 'assets/carrier/hull.glb') {
  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync(url);
  } catch {
    return false;
  }
  for (const m of C.hull) m.removeFromParent();
  for (const o of [...C.outside.children]) if (!C.bayPanels?.includes(o)) o.visible = false;
  C.frame.traverse((o) => {
    if (o.userData.fitting) o.visible = false;
  });
  const root = gltf.scene;
  root.name = 'hull.glb';
  // Metal with nothing to reflect renders near black (the scene has no environment map): keep it mostly paint.
  root.traverse((o) => {
    if (o.isMesh && !/Glass/.test(o.material.name)) o.material.metalness = Math.min(o.material.metalness, 0.2);
  });
  C.hull = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    let p = o;
    while (p && p !== root && !['hull', 'island'].includes(p.name)) p = p.parent;
    if (p && p !== root) C.hull.push(o);
  });
  C.frame.add(root);
  C.blender = root;
  return true;
}

/** The walkable compartment on deck `deck` that contains (x, z), or null. */
export function roomAt(C, deck, x, z) {
  for (const c of C.L.compartments) {
    if (c.access !== 'walk' || c.deck !== deck) continue;
    if (x >= c.x[0] - 0.3 && x <= c.x[1] + 0.3 && z >= c.z[0] - 0.3 && z <= c.z[1] + 0.3) return c;
  }
  return null;
}
