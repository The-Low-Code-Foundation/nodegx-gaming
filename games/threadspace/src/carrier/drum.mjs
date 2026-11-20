// The spin drums, as the cutaway shows them (the layout's `drum`, from tools/carrier-v2.mjs): each half a group that
// turns about the ship's axis, the two halves opposite ways, holding its rooms (coloured by what they are for, as in
// the ship designer), its ring corridors, the belt of water tanks and stores outside them, the drum's inner wall, the
// spokes up to the hub ring, and its end walls. The fixed armoured sleeve round them is the hull itself.
//
// Each room sits in its own segment's frame: segment k is turned 2πk/sides about z from straight down, and in that
// frame the room is a box with its floor at y = -floorR. Seen from outside (the cutaway), they are blocks, one
// InstancedMesh per kind of part, so the 320 rooms cost a few draw calls (`blocks`).
//
// Walking (`segment()`): each segment you come near is built as an ordinary `Interior` in its own frame (a group turned
// to its angle on the spinning half), with its two rooms, its piece of ring corridor, and at a spoke the lift and the
// ladder; up is +y, as on any deck, so the rooms, fits, sets, lamps and colliders are today's. Segment k's floor edge
// at x = +hw is segment k+1's at x = -hw (hw = floorR·tan(π/sides)), so walking round the ring is stepping from one
// frame into the next at the edge (`main.mjs`); `placeInDrum()` leans the view across the 9° crease so you feel it
// rather than see a jump. Segments are kept once built; only those near you are drawn.

import * as THREE from 'three';
import { Interior } from '../interiors.mjs';
import { room, fit, SYSTEMS } from './layout.mjs';
import { roomSurfaces, roomLights, dressRoom, drumSet } from './sets.mjs';
import { drawSign, hazardMat } from '../decor.mjs';
import { box, at, mat, glow } from '../util.mjs';
import { drumKits, drumLockers } from './damage.mjs';

/** The room colours of the ship designer (design/ship-designer.html, USES). */
export const USE_COLORS = {
  medical: '#ff8f8f', flight: '#ffb35c', ops: '#c79bff', mess: '#ffd84d', wardroom: '#e9c98a', officers: '#8dbbff',
  berths: '#5b8de0', marines: '#4267a8', gym: '#6fe0a2', stores: '#bfa98a', workshop: '#e28f5a', hydro: '#a5e35f', spare: '#5a6470'
};

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _c = new THREE.Color();

/** Builds the drums into C.frame (nothing when the layout has none). C.drums: { group, halves: [{ id, node, dir, omega }] }. */
export function buildDrums(C) {
  const D = C.L.drum;
  if (!D) return null;
  const group = new THREE.Group();
  group.name = 'drums';
  C.frame.add(group);
  const S = D.sides, step = (2 * Math.PI) / S;
  const lambert = (color, more = {}) => new THREE.MeshLambertMaterial({ color, ...more });
  const roomMat = lambert('#ffffff');
  const halves = [];
  for (const h of D.halves) {
    const half = new THREE.Group();
    half.name = `drum-${h.id}`;
    group.add(half);
    const node = new THREE.Group(); // the cutaway's blocks
    const segs = new THREE.Group(); // the walkable segments, built as you come near
    half.add(node, segs);
    const zc = (h.z[0] + h.z[1]) / 2, len = h.z[1] - h.z[0];
    // The rooms
    const rooms = D.rooms.filter((r) => r.half === h.id);
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const inst = new THREE.InstancedMesh(unit, roomMat, rooms.length);
    rooms.forEach((r, i) => {
      const dk = D.decks.find((d) => d.id === r.deck);
      const w = r.x[1] - r.x[0], d = r.z[1] - r.z[0], ht = dk.h - 0.35;
      _r.makeRotationZ(r.seg * step);
      _m.makeTranslation((r.x[0] + r.x[1]) / 2, -(dk.floorR - ht / 2), (r.z[0] + r.z[1]) / 2).multiply(new THREE.Matrix4().makeScale(w, ht, d));
      inst.setMatrixAt(i, _r.clone().multiply(_m));
      inst.setColorAt(i, _c.set(USE_COLORS[r.use] ?? '#888888'));
    });
    inst.userData.drumRooms = rooms;
    node.add(inst);
    // The ring corridors, one per deck: a flat strip per segment
    const corr = new THREE.InstancedMesh(unit, lambert('#3a4350'), S * D.decks.length);
    let n = 0;
    for (const dk of D.decks) for (let k = 0; k < S; k++) {
      const w = 2 * (dk.floorR - dk.h) * Math.tan(Math.PI / S);
      _r.makeRotationZ(k * step);
      _m.makeTranslation(0, -(dk.floorR - 0.15), (h.corridor[0] + h.corridor[1]) / 2).multiply(new THREE.Matrix4().makeScale(w, 0.3, h.corridor[1] - h.corridor[0]));
      corr.setMatrixAt(n++, _r.clone().multiply(_m));
    }
    node.add(corr);
    // The belt (water tanks and stores), the drum's inner wall, and the end walls
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(D.belt.to, D.belt.to, len - 0.4, S, 1, true), lambert('#2f6f8f', { side: THREE.DoubleSide }));
    const beltIn = new THREE.Mesh(new THREE.CylinderGeometry(D.belt.from, D.belt.from, len - 0.4, S, 1, true), lambert('#24566e', { side: THREE.DoubleSide }));
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(D.innerR, D.innerR, len - 0.4, S, 1, true), lambert('#59616b', { side: THREE.DoubleSide }));
    for (const m of [belt, beltIn, inner]) { m.rotation.x = Math.PI / 2; m.position.z = zc; node.add(m); }
    const endMat = lambert('#4a525c', { side: THREE.DoubleSide });
    for (const z of [h.z[0] + 0.2, h.z[1] - 0.2]) {
      const e = new THREE.Mesh(new THREE.RingGeometry(D.hub.r, D.belt.to, S, 1), endMat);
      e.position.z = z;
      node.add(e);
    }
    // The spokes (a lift and ladder shaft from the corridor's ceiling up to the hub) and the hub ring
    const spokeMat = lambert('#c9cdd2');
    const zCorr = (h.corridor[0] + h.corridor[1]) / 2;
    for (const k of D.spokes.segments) {
      const r0 = D.hub.r, r1 = D.decks[D.decks.length - 1].floorR - D.decks[D.decks.length - 1].h;
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(3, r1 - r0, 2.6), spokeMat);
      shaft.position.set(0, -(r0 + r1) / 2, zCorr);
      const arm = new THREE.Group();
      arm.rotation.z = k * step;
      arm.add(shaft);
      node.add(arm);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(D.hub.r, D.hub.r, h.corridor[1] - h.corridor[0], 24, 1, true), lambert('#c9cdd2', { side: THREE.DoubleSide }));
    hub.rotation.x = Math.PI / 2;
    hub.position.z = zCorr;
    node.add(hub);
    halves.push({ id: h.id, node: half, blocks: node, segs, spec: h, dir: h.dir, omega: (h.rpm * 2 * Math.PI) / 60 });
  }
  C.drums = { group, halves, built: new Map(), shown: [] };
  places(C);
  spineLifts(C);
  return C.drums;
}

/** The drum's rooms, and each deck's ring corridor, as places the rest of the ship can name (`C.rooms`): the career's
 *  officers and orders, your bunk, the watch bill, damage control's jobs, integrity's air. A drum place's `deck` is a
 *  key, `drum-<half>-<deck>` ("drum-b-i"), its `half`, `ring` (deck id) and `seg` say where it is, and x and z are in
 *  its segment's frame. The fixed hull's code reads them through `C.interior(deck, seg)` (the Interior to put things
 *  in), `C.deckName(deck)` and `C.toOverlay()` (a point in a segment, in the ship's frame, for the cutaway's markers). */
function places(C) {
  const D = C.L.drum;
  for (const r of D.rooms) C.rooms.set(r.id, { ...r, ring: r.deck, deck: deckKey(r.half, r.deck), drum: true, access: 'walk' });
  for (const h of D.halves) for (const dk of D.decks) {
    const { hw } = drumDeck(C, h.id, dk.id), id = ringId(h.id, dk.id);
    C.rooms.set(id, { id, name: `${h.name} ring corridor, ${dk.name.toLowerCase()}`, system: 'corridor', access: 'walk', drum: true, half: h.id, ring: dk.id, seg: null, deck: deckKey(h.id, dk.id), x: [-hw, hw], z: [h.corridor[0] + INSET, h.corridor[1] - INSET], h: dk.h, g: dk.g });
  }
  const fixed = (d) => C.decks.get(d);
  C.interior = (deck, seg = 0) => {
    const k = parseKey(deck);
    return k ? segment(C, k.hid, k.did, seg).I : fixed(deck);
  };
  C.interiorOf = (room, seg = room.seg ?? 0) => C.interior(room.deck, seg);
  C.deckName = (deck) => {
    const k = parseKey(deck);
    if (!k) return C.L.decks.find((d) => d.id === deck)?.name ?? `Deck ${deck}`;
    const { h, dk } = drumDeck(C, k.hid, k.did);
    return `${h.name}, ${dk.name.toLowerCase()}`;
  };
  C.isDrum = (deck) => !!parseKey(deck);
  // A drum room's doorway, as the routes would give a door (wayfinding.mjs portals): on its corridor side, mid-room.
  C.doorOf = (c) => c.drum && c.row ? { kind: 'door', side: c.row === 'fore' ? 's' : 'n', x: (c.x[0] + c.x[1]) / 2, z: c.row === 'fore' ? c.z[1] : c.z[0] } : null;
  C.toShip = (deck, seg, x, y, z, out) => drumToShip(C, deck, seg, x, y, z, out);
  C.drumAt = (p) => drumPlaceAt(C, p);
  C.drumRoomAt = (I, x, z) => drumRoomAt(C, I.half, I.did, I.seg, x, z);
}

/** The drum place (a room or a ring corridor, as `places` registered it) at point `p` in the ship's frame (C.frame), as
 *  the drums stand now, or null: between the decks, in the belt, the hub, the spokes. How integrity.mjs finds what a
 *  shell passes through in a spinning drum: turn the point back by the half's spin, find the segment it lies in, and
 *  read its room there as on any deck. */
export function drumPlaceAt(C, p) {
  const D = C.L.drum;
  if (!D || !C.drums) return null;
  const r = Math.hypot(p.x, p.y);
  if (r < D.innerR || r > D.decks[0].floorR + 0.01) return null;
  for (const hv of C.drums.halves) {
    const h = hv.spec;
    if (p.z < h.z[0] || p.z > h.z[1]) continue;
    const S = D.sides, step = (2 * Math.PI) / S, rot = hv.node.rotation.z;
    // Into the half's frame, then the segment whose floor faces this way (segment k's down is -y turned k steps).
    const c = Math.cos(-rot), s = Math.sin(-rot), lx = p.x * c - p.y * s, ly = p.x * s + p.y * c;
    const k = ((Math.round((Math.atan2(ly, lx) + Math.PI / 2) / step) % S) + S) % S;
    const ck = Math.cos(-k * step), sk = Math.sin(-k * step), xs = lx * ck - ly * sk, ys = lx * sk + ly * ck;
    const dk = D.decks.find((d) => ys >= -d.floorR && ys <= -d.floorR + d.h);
    if (!dk) return null;
    const room = D.rooms.find((q) => q.half === h.id && q.deck === dk.id && q.seg === k && xs >= q.x[0] && xs <= q.x[1] && p.z >= q.z[0] && p.z <= q.z[1]);
    if (room) return room.id;
    return p.z >= h.corridor[0] && p.z <= h.corridor[1] ? ringId(h.id, dk.id) : null;
  }
  return null;
}

export const deckKey = (hid, did) => `drum-${hid}-${did}`;
export const ringId = (hid, did) => `ring-${hid}-${did}`;
/** `drum-b-i` → { hid: 'b', did: 'i' }, or null for a fixed deck. */
export function parseKey(deck) {
  if (typeof deck !== 'string' || !deck.startsWith('drum-')) return null;
  const [, hid, did] = deck.split('-');
  return { hid, did };
}

const _o = new THREE.Vector3();
/** (x, y, z) in segment `seg` of drum deck `deck`, in the ship's frame (C.frame, where the cutaway's overlay hangs):
 *  where the cutaway's marker goes. The drum turns, so ask again each frame. */
export function drumToShip(C, deck, seg, x, y, z, out = new THREE.Vector3()) {
  const k = parseKey(deck), b = segment(C, k.hid, k.did, seg);
  b.g.updateWorldMatrix(true, false);
  b.g.localToWorld(out.set(x, y, z));
  C.frame.updateWorldMatrix(true, false);
  return C.frame.worldToLocal(out);
}

// --- walking in the drum -------------------------------------------------------------------------------------------

const DOOR = 1.4; // a drum room's doorway onto the ring corridor
const INSET = 0.15; // the corridor's walls stand this far in from the rows, so two walls never share a plane
const ringDist = (a, b, n) => Math.min((a - b + n) % n, (b - a + n) % n);

/** A deck of a half: its numbers, and the half-width of a segment's floor. */
export function drumDeck(C, hid, did) {
  const D = C.L.drum, h = D.halves.find((x) => x.id === hid), dk = D.decks.find((d) => d.id === did);
  return { D, h, dk, hw: dk.floorR * Math.tan(Math.PI / D.sides), step: (2 * Math.PI) / D.sides, S: D.sides };
}

/** Where the lift stands in a spoke segment's corridor (against its fore wall) and the ladder (against its aft wall). */
export function drumSpots(C, hid) {
  const h = C.L.drum.halves.find((x) => x.id === hid);
  const z0 = h.corridor[0] + INSET, z1 = h.corridor[1] - INSET;
  return { lift: { x: 2.6, z: z0 + 0.75, w: 2.4, d: 1.5 }, landing: { x: 2.6, z: z0 + 2.05 }, ladder: { x: -2.8, z: z1 - 0.55 } };
}

/** Segment `seg` of half `hid`, deck `did` (built the first time it is asked for): { I, g }. */
export function segment(C, hid, did, seg) {
  const { D, h, dk, hw, step, S } = drumDeck(C, hid, did);
  seg = ((seg % S) + S) % S;
  const key = `${hid}|${did}|${seg}`;
  if (C.drums.built.has(key)) return C.drums.built.get(key);
  const hv = C.drums.halves.find((x) => x.id === hid);
  const g = new THREE.Group();
  g.rotation.z = seg * step;
  hv.segs.add(g);
  g.updateMatrixWorld(true);
  const I = new Interior(g, -dk.floorR);
  I.deck = { id: `drum-${hid}-${did}`, name: `${h.name}, ${dk.name.toLowerCase()}` };
  I.ceiling = dk.h;
  Object.assign(I, { half: hid, did, seg });
  const deck = I.deck.id;
  const corr = { id: ringId(hid, did), name: 'Ring corridor', system: 'corridor', deck, x: [-hw, hw], z: [h.corridor[0] + INSET, h.corridor[1] - INSET], h: dk.h };
  const rooms = D.rooms.filter((r) => r.half === hid && r.deck === did && r.seg === seg).map((r) => C.rooms.get(r.id)); // as `places` registered them
  const open = new Map([corr, ...rooms].map((c) => [c.id, { n: [], s: [], w: [], e: [] }]));
  for (const r of rooms) {
    const fore = r.row === 'fore', cx = (r.x[0] + r.x[1]) / 2;
    open.get(r.id)[fore ? 's' : 'n'].push({ a: cx - DOOR / 2, b: cx + DOOR / 2, kind: 'door' });
    open.get(corr.id)[fore ? 'n' : 's'].push({ a: cx - DOOR / 2, b: cx + DOOR / 2, kind: 'door' });
  }
  for (const side of ['w', 'e']) open.get(corr.id)[side].push({ a: corr.z[0], b: corr.z[1], kind: 'open' }); // round the ring
  I.s = roomSurfaces(corr);
  room(I, corr, open.get(corr.id));
  roomLights(I, corr);
  for (const r of rooms) {
    const o = open.get(r.id);
    I.s = roomSurfaces(r);
    room(I, r, o);
    roomLights(I, r);
    // The berths, messes, galley and sick bays have the drum's own sets (sets.mjs `drumSet`: today's were drawn for the
    // old decks' long rooms); the rest are furnished by kind (`fit`), which lays itself out from the room and its door.
    const set = drumSet(r);
    if (set) set(C, I, r, o);
    else if (r.fit) fit(I, r, o, SYSTEMS[r.system]?.[0] ?? '#9fd4ff');
    dressRoom(C, I, r, o);
    drumKits(C, I, r); // the racks of kit a room keeps (damage.mjs): the tool kits in the electrical shop
    // The doorway through the gap between the room's wall and the corridor's, and the room's name over it.
    const fore = r.row === 'fore', cx = (r.x[0] + r.x[1]) / 2;
    I.s = roomSurfaces(corr);
    I.passage('z', fore ? r.z[1] : corr.z[1], fore ? corr.z[0] : r.z[0], cx - DOOR / 2, cx + DOOR / 2, { h: 2.5 });
    const text = r.name.toUpperCase(), color = SYSTEMS[r.system]?.[0] ?? '#9fd4ff';
    const m = C.atlas.plane(Math.min(2.6, 0.5 + text.length * 0.095), 0.3, (cg, pw, ph) => drawSign(cg, pw, ph, text, color), 180);
    I.group.add(at(m, cx, I.floorY + 2.7, fore ? corr.z[0] + 0.12 : corr.z[1] - 0.12, 0, fore ? 0 : Math.PI, 0));
  }
  // Where you are round the ring: a plate on the aft wall.
  const plate = `${h.name.toUpperCase()} · ${dk.name.toUpperCase()} · ${String(seg).padStart(2, '0')}`;
  const pm = C.atlas.plane(2.2, 0.26, (cg, pw, ph) => drawSign(cg, pw, ph, plate, '#9aa6b4'), 180);
  I.group.add(at(pm, -2.6, I.floorY + 1.7, corr.z[1] - 0.12, 0, Math.PI, 0));
  drumLockers(C, I, corr, seg); // extinguishers, repair lockers and vac suits along the corridor (damage.mjs)
  if (D.spokes.segments.includes(seg)) spokeFoot(C, I, hid, did, seg);
  I.finish();
  const built = { I, g, key, hid, did, seg };
  C.drums.built.set(key, built);
  return built;
}

/** A spoke's foot in the corridor: the lift's car and doors against the fore wall, the ladder between the decks against
 *  the aft wall. */
function spokeFoot(C, I, hid, did, seg) {
  const { D } = drumDeck(C, hid, did);
  const { lift, landing, ladder } = drumSpots(C, hid);
  const y = I.floorY, steel = mat('#8a929c'), frame = mat('#3a4048');
  const x0 = lift.x - lift.w / 2, x1 = lift.x + lift.w / 2, z0 = lift.z - lift.d / 2, z1 = lift.z + lift.d / 2;
  for (const x of [x0, x1]) I.group.add(at(box(0.12, 2.9, lift.d, steel), x, y + 1.45, lift.z));
  I.group.add(at(box(lift.w, 0.3, lift.d, steel), lift.x, y + 2.85, lift.z));
  I.group.add(at(box(lift.w - 0.3, 2.3, 0.06, frame), lift.x, y + 1.15, z1)); // the doors
  I.group.add(at(box(0.04, 2.3, 0.08, glow('#ffb347')), lift.x, y + 1.15, z1 + 0.02));
  I.group.add(at(box(lift.w - 0.3, 0.05, 0.08, glow('#ffb347')), lift.x, y + 2.33, z1 + 0.02));
  I.collider(x0, y, z0, x1, y + 3, z1);
  const sign = C.atlas.plane(1.8, 0.26, (cg, pw, ph) => drawSign(cg, pw, ph, 'LIFT · ▲ HUB', '#ffb347'), 180);
  I.group.add(at(sign, lift.x, y + 2.6, z1 + 0.05, 0, 0, 0));
  I.use(`lift-${hid}${did}${seg}`, 'Take the lift up to the hub', landing.x, landing.z, () => C.hooks.drum?.('up', { half: hid, deck: did, seg }), { r: 2.2 });
  // The ladder: up through the deckhead from the outer deck, down through the deck from the inner one.
  const other = D.decks.find((d) => d.id !== did), up = other.floorR < D.decks.find((d) => d.id === did).floorR;
  const lg = new THREE.Group(), rail = mat('#c9a43a');
  const top = up ? 3.0 : 1.1;
  for (const s of [-0.35, 0.35]) lg.add(at(box(0.06, top + 0.2, 0.06, rail), s, top / 2, 0));
  if (up) for (let yy = 0.3; yy < top; yy += 0.3) lg.add(at(box(0.7, 0.04, 0.06, rail), 0, yy, 0));
  lg.add(at(box(1.3, 0.03, 1.3, hazardMat()), 0, 0.02, 0), at(box(1.2, 0.08, 1.2, mat('#1a1d22')), 0, up ? 2.95 : 0.03, 0));
  lg.position.set(ladder.x, y, ladder.z);
  I.group.add(lg);
  I.use(`dladder-${hid}${did}${seg}`, `${up ? 'Climb up' : 'Climb down'} to the ${other.name.toLowerCase()}`, ladder.x, ladder.z,
    () => C.hooks.drum?.('ladder', { half: hid, deck: other.id, seg }), { r: 2 });
}

/** Shows the segments within `n` of `seg` on that half's deck (building any not built yet) and hides the rest.
 *  Returns the one you are in. */
export function drumWindow(C, hid, did, seg, n = 2) {
  const { S } = drumDeck(C, hid, did);
  for (let k = -n; k <= n; k++) segment(C, hid, did, seg + k);
  C.drums.shown = [];
  for (const b of C.drums.built.values()) {
    b.g.visible = b.hid === hid && b.did === did && ringDist(b.seg, ((seg % S) + S) % S, S) <= n;
    if (b.g.visible) C.drums.shown.push(b.I);
  }
  return segment(C, hid, did, seg);
}

/** The drum room at (x, z) in segment `seg`'s frame, or the ring corridor. */
export function drumRoomAt(C, hid, did, seg, x, z) {
  const D = C.L.drum;
  const r = D.rooms.find((r) => r.half === hid && r.deck === did && r.seg === seg && x >= r.x[0] - 0.3 && x <= r.x[1] + 0.3 && z >= r.z[0] - 0.3 && z <= r.z[1] + 0.3);
  return r ?? C.rooms.get(ringId(hid, did));
}

const _M = new THREE.Matrix4(), _T = new THREE.Matrix4(), _R = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _Q2 = new THREE.Quaternion(), _Z = new THREE.Vector3(0, 0, 1);

/** The camera for you standing at (x, floor, z) in segment frame `g`, `eyeH` up, leaning `phi` about the ship's axis
 *  (the crease between segments, a lift's Coriolis sway), looking along `look` (the walker's quaternion). */
export function drumCamera(camera, g, x, y, z, eyeH, phi, look) {
  g.updateWorldMatrix(true, false);
  _M.copy(g.matrixWorld).multiply(_T.makeTranslation(x, y, z)).multiply(_R.makeRotationZ(phi)).multiply(_T.makeTranslation(0, eyeH, 0));
  camera.position.setFromMatrixPosition(_M);
  g.getWorldQuaternion(_Q);
  camera.quaternion.copy(_Q).multiply(_Q2.setFromAxisAngle(_Z, phi)).multiply(look);
}

/** Walking: the view leans across the last `edge` metres before a segment's edge, half the step at the edge itself,
 *  so it meets the next segment's lean the other way and nothing jumps. */
export function placeInDrum(C, camera, walker, built, edge = 0.9) {
  const { hw, step } = drumDeck(C, built.hid, built.did);
  const x = walker.pos.x, sm = (t) => ((t = Math.min(1, Math.max(0, t))), t * t * (3 - 2 * t));
  const phi = x > hw - edge ? (step / 2) * sm((x - hw + edge) / edge) : x < -hw + edge ? -(step / 2) * sm((-hw + edge - x) / edge) : 0;
  const eyeH = walker.eye(_E).y - walker.pos.y;
  drumCamera(camera, built.g, x, walker.pos.y, walker.pos.z, eyeH, phi, walker.quat(_Q3));
}
const _E = new THREE.Vector3(), _Q3 = new THREE.Quaternion();

/** A lift car: a lit box you ride in, its floor at its origin (main.mjs moves it up and down the spoke), the door
 *  glazed so you see the shaft go by. */
export function liftCar(spot) {
  const g = new THREE.Group(), wall = mat('#7a828c'), dark = mat('#2a2f36');
  const { w, d } = spot, H = 2.5;
  g.add(at(box(w, 0.08, d, dark), 0, -0.04, 0), at(box(w, 0.08, d, wall), 0, H + 0.04, 0));
  for (const s of [-1, 1]) g.add(at(box(0.08, H, d, wall), (s * w) / 2, H / 2, 0));
  g.add(at(box(w, H, 0.08, wall), 0, H / 2, -d / 2));
  // The door: a frame round a window
  g.add(at(box(w, 0.6, 0.08, dark), 0, 0.3, d / 2), at(box(w, 0.35, 0.08, dark), 0, H - 0.175, d / 2));
  for (const s of [-1, 1]) g.add(at(box(0.3, H, 0.08, dark), s * (w / 2 - 0.15), H / 2, d / 2));
  g.add(at(box(w - 0.6, H - 0.95, 0.02, new THREE.MeshBasicMaterial({ color: '#9fc4e8', transparent: true, opacity: 0.08, depthWrite: false })), 0, 0.6 + (H - 0.95) / 2, d / 2));
  g.add(at(box(w * 0.6, 0.03, d * 0.5, glow('#fff1d6')), 0, H - 0.01, 0));
  g.position.set(spot.x, 0, spot.z);
  return g;
}

/** The spoke's shaft for a ride: walls round the car from the hub down to the deck's deckhead, and a lamp strip every
 *  2.5 m on the wall the door faces, so you see yourself move. Built for the ride and taken away after. */
export function liftShaft(spot, r0, r1) {
  const g = new THREE.Group(), wall = mat('#3a4048'), len = r1 - r0, cy = -(r0 + r1) / 2;
  const W = spot.w + 0.7, Dp = spot.d + 0.7;
  for (const s of [-1, 1]) g.add(at(box(0.1, len, Dp, wall), spot.x + (s * W) / 2, cy, spot.z), at(box(W, len, 0.1, wall), spot.x, cy, spot.z + (s * Dp) / 2));
  for (let r = r0 + 1; r < r1; r += 2.5) g.add(at(box(W * 0.7, 0.07, 0.04, glow('#9fd4ff', 0.9)), spot.x, -r, spot.z + Dp / 2 - 0.08));
  for (let r = r0 + 2; r < r1; r += 5) for (const s of [-1, 1]) g.add(at(box(0.05, 0.4, 0.05, glow('#ffb347', 0.8)), spot.x + s * (W / 2 - 0.08), -r, spot.z + Dp / 2 - 0.1));
  return g;
}

/** The lifts' call points in the spine, one pair per half (to each deck), at its corridor's z. */
function spineLifts(C) {
  const sp = C.rooms.get('spine'), I = sp && C.decks.get(sp.deck);
  if (!I) return;
  for (const h of C.L.drum.halves) {
    const z = (h.corridor[0] + h.corridor[1]) / 2;
    C.L.drum.decks.forEach((dk, i) => {
      const x = i === 0 ? sp.x[0] + 0.3 : sp.x[1] - 0.3, wall = i === 0 ? sp.x[0] + 0.12 : sp.x[1] - 0.12;
      I.group.add(at(box(0.06, 2.3, 1.8, mat('#3a4048')), wall, I.floorY + 1.15, z));
      I.group.add(at(box(0.05, 0.05, 1.8, glow('#ffb347')), wall, I.floorY + 2.35, z));
      const t = `LIFT · ${h.name.toUpperCase()} · ${dk.name.toUpperCase()}`;
      const m = C.atlas.plane(Math.min(2.6, 0.5 + t.length * 0.08), 0.26, (cg, pw, ph) => drawSign(cg, pw, ph, t, '#ffb347'), 180);
      I.group.add(at(m, wall + (i === 0 ? 0.04 : -0.04), I.floorY + 2.6, z, 0, i === 0 ? Math.PI / 2 : -Math.PI / 2, 0));
      I.use(`spine-lift-${h.id}${dk.id}`, `Take the lift down to the ${h.name.toLowerCase()}, ${dk.name.toLowerCase()}`, x, z,
        () => C.hooks.drum?.('down', { half: h.id, deck: dk.id }), { r: 1.8 });
    });
  }
}

/** Turns the drums: each half `dir` × ω about the axis. Seen from the bow, dir 1 is clockwise. */
export function drumsFrame(C, dt) {
  if (!C.drums) return;
  for (const h of C.drums.halves) h.node.rotation.z += h.dir * h.omega * dt;
}
