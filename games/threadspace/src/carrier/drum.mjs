// The spin drums, as the cutaway shows them (the layout's `drum`, from tools/carrier-v2.mjs): each half a group that
// turns about the ship's axis, the two halves opposite ways, holding its rooms (coloured by what they are for, as in
// the ship designer), its ring corridors, the belt of water tanks and stores outside them, the drum's inner wall, the
// spokes up to the hub ring, and its end walls. The fixed armoured sleeve round them is the hull itself, open at both
// ends, so from outside each half is drawn as it would be seen through them (`drumOutside()`): its end walls, inner
// wall and belt, the spokes' lift tubes and the armoured hub ring, turning with it.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Interior } from '../interiors.mjs';
import { room, fit, SYSTEMS } from './layout.mjs';
import { roomSurfaces, roomLights, dressRoom, drumSet } from './sets.mjs';
import { drawSign, hazardMat } from '../decor.mjs';
import { box, at, mat, glow } from '../util.mjs';
import { drumKits, drumLockers } from './damage.mjs';
import { hubHatch } from './hub.mjs';

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
    const outside = drumOutside(D, h); // as seen from outside, through the sleeve's open ends
    half.add(node, segs, outside);
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
    halves.push({ id: h.id, node: half, blocks: node, segs, outside, spec: h, dir: h.dir, omega: (h.rpm * 2 * Math.PI) / 60 });
  }
  C.drums = { group, halves, built: new Map(), shown: [] };
  places(C);
  spineLifts(C);
  return C.drums;
}

/** One half as seen from outside, through the sleeve's open ends (`D.structure`): the end walls with a ring of lamps,
 *  the inner wall and the belt's outside, each spoke's two lift tubes (lit slits, so you see them turning) and ladder
 *  tube on an armoured web, and the hub ring's armoured drum round the spine. A few merged meshes per half; `main.mjs`
 *  draws it only when you can see out (`seesOut()`), and never in the cutaway, which has the blocks. */
function drumOutside(D, h) {
  const g = new THREE.Group();
  g.name = `drum-${h.id}-outside`;
  const ST = D.structure;
  if (!ST) return g;
  const S = D.sides, step = (2 * Math.PI) / S, k0 = -Math.PI / 2 + step / 2; // polygon corners between the segments
  const corner = (r) => r / Math.cos(step / 2); // a flat at r, as the polygon's corner radius
  const zc = (h.z[0] + h.z[1]) / 2, len = h.z[1] - h.z[0], zCorr = (h.corridor[0] + h.corridor[1]) / 2;
  const parts = { hull: [], armour: [], dark: [], lamp: [] };
  const put = (key, geo, m) => parts[key].push(m ? geo.applyMatrix4(m) : geo);
  const M4 = () => new THREE.Matrix4();
  const tube = (r, l, n = S, open = true) => new THREE.CylinderGeometry(r, r, l, n, 1, open, k0 + Math.PI / 2).rotateX(Math.PI / 2); // corners as the ring's
  // The end walls (from the inner wall out to the belt), the inner wall, the belt's outside.
  for (const z of [h.z[0], h.z[1]]) put('hull', new THREE.RingGeometry(corner(D.innerR), corner(D.belt.to), S, 1, k0), M4().makeTranslation(0, 0, z));
  put('hull', tube(corner(D.innerR), len), M4().makeTranslation(0, 0, zc));
  put('dark', tube(corner(D.belt.to), len - 0.1), M4().makeTranslation(0, 0, zc));
  // A lamp on each end wall in every segment, near the rim, and two at each spoke's foot.
  for (const z of [h.z[0] - 0.05, h.z[1] + 0.05]) for (let k = 0; k < S; k++) {
    const r = D.belt.to - 0.9, a = -Math.PI / 2 + k * step;
    put('lamp', new THREE.BoxGeometry(0.9, 0.35, 0.1), M4().makeRotationZ(a + Math.PI / 2).premultiply(M4().makeTranslation(Math.cos(a) * r, Math.sin(a) * r, z)));
  }
  // The spokes: from the hub ring's armour down to the inner wall, in the corridor's z, at their segments.
  const sp = ST.spoke, r0 = ST.hub.r, r1 = D.innerR, L = r1 - r0, mid = -(r0 + r1) / 2;
  for (const k of D.spokes.segments) {
    const R = M4().makeRotationZ(k * step);
    const at = (x, y, z) => M4().makeTranslation(x, y, z).premultiply(R);
    for (const x of [-sp.w / 2 + sp.tube, sp.w / 2 - sp.tube]) {
      put('hull', new THREE.CylinderGeometry(sp.tube, sp.tube, L, 12, 1, true), at(x, mid, zCorr));
      for (const z of [-sp.tube - 0.01, sp.tube + 0.01]) put('lamp', new THREE.BoxGeometry(0.22, L - 2, 0.04), at(x, mid, zCorr + z));
      for (let y = r0 + 3; y < r1 - 1; y += 6) put('armour', new THREE.CylinderGeometry(sp.tube + 0.25, sp.tube + 0.25, 0.7, 12), at(x, -y, zCorr));
    }
    put('armour', new THREE.BoxGeometry(sp.w - 2 * sp.tube, L, 0.6), at(0, mid, zCorr)); // the web between them
    put('hull', new THREE.CylinderGeometry(0.75, 0.75, L, 10, 1, true), at(0, mid, zCorr + sp.d / 2 - 0.75)); // the ladder tube
    put('armour', new THREE.BoxGeometry(sp.w + 1.6, 1.4, sp.d + 1.2), at(0, -(r1 - 0.7), zCorr)); // its foot on the inner wall
  }
  // The hub ring's armoured drum, with banded ends; its inside is hub.mjs's.
  const hz0 = zCorr - ST.hub.len / 2, hz1 = zCorr + ST.hub.len / 2, spineR = D.structure.spine.r + 0.25;
  put('armour', tube(ST.hub.r, ST.hub.len, 32), M4().makeTranslation(0, 0, zCorr));
  for (const z of [hz0, hz1]) {
    put('armour', new THREE.RingGeometry(spineR, ST.hub.r, 32, 1), M4().makeTranslation(0, 0, z));
    put('dark', tube(ST.hub.r + 0.45, 0.9, 32, false), M4().makeTranslation(0, 0, z + (z < zCorr ? 0.45 : -0.45)));
  }
  const look = {
    hull: new THREE.MeshStandardMaterial({ color: '#8a939d', roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }),
    armour: new THREE.MeshStandardMaterial({ color: '#6e7782', roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: '#2f353d', roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide }),
    lamp: glow('#ffd9a0')
  };
  for (const [key, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const geo = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => (x.deleteAttribute('uv'), x)));
    const m = new THREE.Mesh(geo, look[key]);
    m.name = `drum-outside-${key}`;
    g.add(m);
  }
  return g;
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
  room(I, corr, open.get(corr.id), D.spokes.segments.includes(seg) ? [ladderHole(C, hid, did)] : []);
  const n0 = I.lights.length;
  roomLights(I, corr);
  // The ring corridor's lamps win places in the light pool (lights.mjs) over nearer room lamps behind walls, so the
  // corridor is lit as far up the curve as you can see (about a segment and a half each way, to where the deckhead
  // cuts the view off).
  for (const l of I.lights.slice(n0)) l.weight = 0.4;
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
  // Lamp strips along both walls at the deckhead, glowing on their own: up the curve, past the lamps the light pool
  // lights (lights.mjs), the corridor still reads as lit. Gaps at the doorways' signs.
  for (const z of [corr.z[0] + 0.17, corr.z[1] - 0.17]) I.group.add(at(box(2 * hw - 0.4, 0.05, 0.06, glow('#cfc3aa', 0.5)), 0, I.floorY + 2.55, z)); // clear of the walls' thickness
  // Where you are round the ring: a plate on the aft wall.
  const plate = `${h.name.toUpperCase()} · ${dk.name.toUpperCase()} · ${String(seg).padStart(2, '0')}`;
  const pm = C.atlas.plane(2.2, 0.26, (cg, pw, ph) => drawSign(cg, pw, ph, plate, '#9aa6b4'), 180);
  I.group.add(at(pm, -2.6, I.floorY + 1.7, corr.z[1] - 0.12, 0, Math.PI, 0));
  drumLockers(C, I, corr, seg); // extinguishers, repair lockers and vac suits along the corridor (damage.mjs)
  if (D.spokes.segments.includes(seg)) spokeFoot(C, I, hid, did, seg);
  I.spots = collectSpots(I, rooms); // where people sit and work (hands.mjs), read off the sets before they are baked
  I.finish();
  const built = { I, g, key, hid, did, seg };
  C.drums.built.set(key, built);
  return built;
}

const _sp = new THREE.Vector3(), _sd = new THREE.Vector3(), _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4();

/** The spots the sets marked (`userData.spots` on a prop: a stool, a bench, a desk, each { x, z, yaw, pose } in the
 *  prop's own frame), in the segment's frame, each with the room it is in: [{ room, x, z, yaw, pose }]. */
function collectSpots(I, rooms) {
  const out = [];
  I.group.updateWorldMatrix(true, true);
  _inv.copy(I.group.matrixWorld).invert();
  I.group.traverse((o) => {
    for (const sp of o.userData.spots ?? []) {
      _rel.multiplyMatrices(_inv, o.matrixWorld);
      _sp.set(sp.x, 0, sp.z).applyMatrix4(_rel);
      _sd.set(-Math.sin(sp.yaw), 0, -Math.cos(sp.yaw)).transformDirection(_rel); // the way they face
      const r = rooms.find((q) => _sp.x > q.x[0] && _sp.x < q.x[1] && _sp.z > q.z[0] && _sp.z < q.z[1]);
      if (r) out.push({ room: r.id, x: _sp.x, z: _sp.z, yaw: Math.atan2(-_sd.x, -_sd.z), pose: sp.pose });
    }
  });
  return out;
}

/** Standing room in drum room `r` of segment Interior `I`: a grid of spots clear of everything that collides, and of
 *  the doorway (cached on the Interior). Each faces roughly into the room. */
export function freeSpots(I, r) {
  I.free ??= new Map();
  if (I.free.has(r.id)) return I.free.get(r.id);
  const out = [], fore = r.row !== 'aft', dz = fore ? r.z[1] : r.z[0], cx = (r.x[0] + r.x[1]) / 2, cz = (r.z[0] + r.z[1]) / 2;
  const y0 = I.floorY + 0.2, y1 = I.floorY + 1.7, clear = 0.45;
  for (let x = r.x[0] + 0.8; x <= r.x[1] - 0.8; x += 0.9) for (let z = r.z[0] + 0.8; z <= r.z[1] - 0.8; z += 0.9) {
    if (Math.hypot(x - cx, z - dz) < 2.6) continue; // keep the doorway clear
    const hit = I.colliders.some((c) => c.max.y > y0 && c.min.y < y1 && x > c.min.x - clear && x < c.max.x + clear && z > c.min.z - clear && z < c.max.z + clear);
    if (!hit) out.push({ room: r.id, x, z, yaw: Math.atan2(-(cx - x), -(cz - z)), pose: 'idle' });
  }
  I.free.set(r.id, out);
  return out;
}

/** The opening the ladder between a drum's decks goes through, in the ring corridor at a spoke: in the outer deck's
 *  deckhead, in the inner deck's deck. The climb's trunk (main.mjs `ladderTrunk`) is turned half round there, so its
 *  inside runs from the ladder 1.04 m aft to 0.49 m fore. */
function ladderHole(C, hid, did) {
  const { D } = drumDeck(C, hid, did), { ladder } = drumSpots(C, hid);
  const outer = D.decks.find((q) => q.id === did).floorR > D.decks.find((q) => q.id !== did).floorR;
  return { kind: outer ? 'ceil' : 'floor', x: [ladder.x - 0.74, ladder.x + 0.74], z: [ladder.z - 1.04, ladder.z + 0.49] };
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
  if (up) lg.add(at(box(1.3, 0.03, 1.3, hazardMat()), 0, 0.02, 0));
  lg.position.set(ladder.x, y, ladder.z);
  I.group.add(lg);
  // The hatch: a real opening in the deckhead or the deck (`ladderHole`), under a lid that slides open for a climb
  // (main.mjs `startDrumClimb` opens `C.drumLids` for this half and segment; main.mjs moves every lid in `C.lids`).
  const hole = ladderHole(C, hid, did), w = hole.x[1] - hole.x[0] + 0.16, d = hole.z[1] - hole.z[0] + 0.16;
  const lid = at(box(w, 0.06, d, hazardMat()), (hole.x[0] + hole.x[1]) / 2, y + (up ? D.decks.find((q) => q.id === did).h - 0.03 : 0.03), (hole.z[0] + hole.z[1]) / 2);
  lid.userData.live = true;
  I.group.add(lid);
  const entry = { mesh: lid, home: lid.position.clone(), travel: new THREE.Vector3((ladder.x > 0 ? -1 : 1) * (w + 0.05), 0, 0), k: 0, want: 0 };
  (C.lids ??= []).push(entry);
  const key = `${hid}|${seg}`;
  (C.drumLids ??= new Map()).set(key, [...(C.drumLids.get(key) ?? []), entry]);
  I.use(`dladder-${hid}${did}${seg}`, `${up ? 'Climb up' : 'Climb down'} to the ${other.name.toLowerCase()}`, ladder.x, ladder.z,
    () => C.hooks.drum?.('ladder', { half: hid, deck: other.id, seg }), { r: 2 });
}

/** Shows the segments within `n` of `seg` on that half's deck (building any not built yet) and hides the rest.
 *  Returns the one you are in. Four each way: from a 1.7 m eye under a 3 m deckhead you see about 32 m along the
 *  outer deck's floor before it rises out of sight, three segments, and from a segment's edge that is three and a half
 *  ahead. With two, space showed through the end of the ring corridor. */
export function drumWindow(C, hid, did, seg, n = 4) {
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

/** In the spine at each half, a hatch in the floor onto the hub ring turning below (hub.mjs): E catches it. */
function spineLifts(C) {
  const sp = C.rooms.get('spine'), I = sp && C.decks.get(sp.deck);
  if (!I) return;
  for (const h of C.L.drum.halves) {
    const z = (h.corridor[0] + h.corridor[1]) / 2, x = (sp.x[0] + sp.x[1]) / 2;
    const omega = (h.rpm * 2 * Math.PI) / 60;
    hubHatch(C, I, x, z, h.dir, omega * (C.L.drum.hub.r + 0.9));
    I.use(`spine-hub-${h.id}`, `Catch the hub ring: down to the ${h.name.toLowerCase()}`, x, z, () => C.hooks.drum?.('catch', { half: h.id }), { r: 2, y: I.floorY + 0.8 });
  }
}

/** Turns the drums: each half `dir` × ω about the axis. Seen from the bow, dir 1 is clockwise. */
export function drumsFrame(C, dt) {
  if (!C.drums) return;
  for (const h of C.drums.halves) h.node.rotation.z += h.dir * h.omega * dt;
}
