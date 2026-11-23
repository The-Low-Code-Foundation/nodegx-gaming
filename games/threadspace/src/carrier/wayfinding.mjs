// How a stranger finds the hangar. Hospitals do it with coloured lines on the floor, warships with numbered frames
// and stencilled locations; the carrier has both, all worked out from the layout, so a new room or a new route needs no
// code:
//
// - Floor lines: one colour per route in the layout's `routes.lines`, a thin stripe of each down every passage, with a
//   small arrow every few metres pointing the way. Where the way to a route's room leaves the passage, its line turns
//   off through that door. The paint is dull and only faintly luminous (as real photoluminescent egress markings are):
//   there if you look for it, not something you look at.
// - Overhead signs: every 25 m or so down a passage, a hanging sign for each direction listing the routes ahead in
//   their line colours.
// - Frame plates: navy style. A frame is a metre aft of the bow (`frameOf`), so FR 180 is 180 m from the stem; the
//   plates are every 10 frames on the passage walls, with the deck and the side. The HUD says the same.
// - Deck plans: a "you are here" board at every ladder and in every length of passage, drawn heads-up (what is in
//   front of you is up on the board), with every room, the ladders, and the line colours.
// - The one-way rule, as warships keep it: forward and up on the starboard side, aft and down on the port side, so
//   two streams of people never meet head-on in a narrow passage at action stations. A stencil in every cross passage
//   says so, and the routes follow it (`ONE_WAY`).
//
// The ways between rooms (doors, ladders) are found from the layout; each route is a shortest walk back from its room
// (metres walked, a little for every door, a lot to cut through someone else's room), which gives every room the way
// out of it toward that room (`plan`).

import * as THREE from 'three';
import { box, cyl, at, mat } from '../util.mjs';
import { drawSign } from '../decor.mjs';
import { facing, SYSTEMS } from './layout.mjs';

const LANE = 0.085; // between the lines' centres
const LANE_W = 0.028;
const ARROWS = 6; // metres between a line's arrows
const ONE_WAY = 10; // metres a route counts against going forward on the port side or aft on the starboard side
const THROUGH = 60; // metres a route counts against crossing a room that is not a passage
const PIPES = ['#7a2a26', '#2a4a70', '#7a6630', '#2f5a3e']; // fire main, fresh water, propellant, coolant

/** Frame number at z: metres aft of the bow. */
export const frameOf = (L, z) => Math.round(z - L.hull.main[0].z);
export const sideOf = (x) => (x < -0.8 ? 'port' : x > 0.8 ? 'starboard' : 'centreline');

/** Every walkable room's ways out: doors (the point is the door's middle on this room's wall) and ladder ends. */
export function portals(C) {
  const out = new Map();
  for (const c of C.L.compartments) if (c.access === 'walk') out.set(c.id, []);
  for (const d of C.L.doors) {
    const [A, B] = d.between.map((id) => C.rooms.get(id));
    const rel = facing(A, B);
    if (!rel) continue;
    const wall = (R, side) => (side === 'n' ? R.z[0] : side === 's' ? R.z[1] : side === 'w' ? R.x[0] : R.x[1]);
    const pt = (R, side) => (rel.along === 'z' ? { x: d.at, z: wall(R, side) } : { x: wall(R, side), z: d.at });
    out.get(A.id).push({ kind: 'door', to: B.id, side: rel.a, w: d.w, ...pt(A, rel.a) });
    out.get(B.id).push({ kind: 'door', to: A.id, side: rel.b, w: d.w, ...pt(B, rel.b) });
  }
  for (const l of C.L.ladders) {
    const ra = roomOn(C, l.a.deck, ...l.a.at), rb = roomOn(C, l.b.deck, ...l.b.at);
    if (!ra || !rb) continue;
    out.get(ra.id).push({ kind: 'ladder', to: rb.id, deck: l.b.deck, x: l.a.at[0], z: l.a.at[1] });
    out.get(rb.id).push({ kind: 'ladder', to: ra.id, deck: l.a.deck, x: l.b.at[0], z: l.b.at[1] });
  }
  return out;
}

function roomOn(C, deck, x, z) {
  return C.L.compartments.find((c) => c.access === 'walk' && c.deck === deck && x >= c.x[0] && x <= c.x[1] && z >= c.z[0] && z <= c.z[1]);
}

/** The routes, each with `next`: room id → the way out of that room toward the route's room. A shortest walk, found
 *  back from the route's room: metres across each room from where you come in to where you leave, plus a metre a door,
 *  `THROUGH` for cutting across a room that is not a passage, and `ONE_WAY` for a passage walked against the rule. */
export function plan(C) {
  const P = portals(C);
  const routes = (C.L.routes?.lines ?? []).map((r, i) => ({ ...r, i, next: toward(C, P, r.to) }));
  return { portals: P, routes };
}

/** room id → the way out of that room toward room `to` (a door or a ladder end, from `portals`), by the costs above.
 *  The floor lines use it per route; guide.mjs per order. */
export function toward(C, P, to) {
  const next = new Map();
  const cost = new Map([[to, 0]]);
  const leave = new Map([[to, null]]); // where each room is left by, toward `to`
  const done = new Set();
  for (;;) {
    let id = null, best = Infinity;
    for (const [k, v] of cost) if (!done.has(k) && v < best) (best = v), (id = k);
    if (id === null) break;
    done.add(id);
    const out = leave.get(id), R = C.rooms.get(id);
    for (const p of P.get(id) ?? []) { // p: a way into `id` from p.to (its point is on id's side)
      if (done.has(p.to)) continue;
      const back = P.get(p.to)?.find((b) => b.to === id && b.kind === p.kind);
      if (!back) continue;
      let c = best + (p.kind === 'ladder' ? 6 : 1);
      if (out) {
        c += Math.hypot(p.x - out.x, p.z - out.z);
        if (R.system !== 'corridor') c += THROUGH;
        else c += against(R, p, out);
      }
      if (c < (cost.get(p.to) ?? Infinity)) {
        cost.set(p.to, c);
        leave.set(p.to, back);
        next.set(p.to, back);
      }
    }
  }
  return next;
}

/** What walking passage `R` from `a` to `b` costs against the one-way rule: forward on the port side, aft on the
 *  starboard side. A passage on the centreline, or across the ship, has no rule. */
function against(R, a, b) {
  const cx = (R.x[0] + R.x[1]) / 2;
  if (R.z[1] - R.z[0] < R.x[1] - R.x[0] || Math.abs(cx) < 0.8) return 0;
  const dz = b.z - a.z;
  return (cx < 0 && dz < -1) || (cx > 0 && dz > 1) ? ONE_WAY + Math.abs(dz) * 0.3 : 0;
}

/** Lines, signs, plates, plans and the pipes overhead for the passages of one deck. `open` is each room's openings per
 *  side (layout.mjs), so nothing is hung across a doorway. */
export function dressDeck(C, I, deck, openings) {
  const W = C.ways;
  for (const c of C.L.compartments) {
    if (c.access !== 'walk' || c.deck !== deck.id || c.system !== 'corridor') continue;
    const open = openings.get(c.id);
    const ax = c.z[1] - c.z[0] >= c.x[1] - c.x[0] ? 'z' : 'x';
    const P = { c, ax, cr: ax === 'z' ? 'x' : 'z', taken: { lo: [], hi: [] } };
    P.mid = (c[P.cr][0] + c[P.cr][1]) / 2;
    // Door spans on the two long walls, in the passage's own terms: lo is the wall at the low end of the cross axis.
    const walls = ax === 'z' ? ['w', 'e'] : ['n', 's'];
    P.doors = { lo: open[walls[0]].map((o) => [o.a, o.b]), hi: open[walls[1]].map((o) => [o.a, o.b]) };
    P.wall = { lo: c[P.cr][0], hi: c[P.cr][1] };
    (C.passages ??= new Map()).set(c.id, P); // damage.mjs hangs its lockers on the same walls
    lines(C, I, P, W);
    plans(C, I, P, W, deck);
    overhead(C, I, P, W);
    plates(C, I, P, deck);
    oneWay(C, I, P);
    services(I, P);
  }
}

/** A point in the passage: `t` along it, `s` across it. */
export const xz = (P, t, s) => (P.ax === 'z' ? [s, t] : [t, s]);
/** A door in one of the passage's long walls (not across its end). */
const inSide = (P, p) => p.kind === 'door' && (P.ax === 'z' ? p.side === 'e' || p.side === 'w' : p.side === 'n' || p.side === 's');

function lines(C, I, P, W) {
  const { c, ax, cr, mid } = P;
  const [a0, a1] = c[ax];
  const n = W.routes.length;
  const y = I.floorY;
  for (const r of W.routes) {
    const p = r.next.get(c.id);
    if (!p || r.to === c.id) continue;
    const m = paint(r.color);
    const off = P.wall.lo + 0.22 + r.i * LANE; // a band along one wall, each line in the same place in every passage
    const len = a1 - a0 - 0.5;
    const [x, z] = xz(P, (a0 + a1) / 2, off);
    I.group.add(at(ax === 'z' ? box(LANE_W, 0.01, len, m) : box(len, 0.01, LANE_W, m), x, y + 0.006, z));
    const pt = p[ax];
    // An arrow every few metres, toward the way out; none right at it.
    for (let t = a0 + 1.5 + r.i * 0.5; t < a1 - 1; t += ARROWS) {
      if (Math.abs(t - pt) < 1.4) continue;
      const [ax2, az2] = xz(P, t, off);
      I.group.add(chevron(m, ax2, y + 0.012, az2, ax === 'z' ? [0, Math.sign(pt - t)] : [Math.sign(pt - t), 0]));
    }
    // The turn-off: through a door in a long wall, the line crosses to it (the lines fan out across the doorway).
    if (inSide(P, p)) {
      const tt = pt + (r.i - (n - 1) / 2) * LANE * Math.min(1, (p.w - 0.3) / (LANE * n));
      const end = p[cr] + Math.sign(p[cr] - mid) * 0.35;
      const l = Math.abs(end - off);
      const [sx, sz] = xz(P, tt, (end + off) / 2);
      I.group.add(at(ax === 'z' ? box(l, 0.01, LANE_W, m) : box(LANE_W, 0.01, l, m), sx, y + 0.007, sz));
      const [cx, cz] = xz(P, tt, p[cr] - Math.sign(p[cr] - mid) * 0.45);
      const d = Math.sign(p[cr] - mid);
      I.group.add(chevron(m, cx, y + 0.013, cz, ax === 'z' ? [d, 0] : [0, d]));
    }
    if (p.kind === 'ladder') {
      // A ring of the route's colour round the ladder's foot: this is where the line leaves the deck.
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.78 + r.i * 0.06, 0.805 + r.i * 0.06, 24), m);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, y + 0.03, p.z);
      I.group.add(ring);
    }
  }
}

const paints = new Map();
const DECK = new THREE.Color('#5f666f'); // the passages' floor (layout.mjs LOOKS)
/** A line's paint: its colour mostly worn into the deck's grey, with no glow, so you find it when you look for it and
 *  otherwise it is just floor. */
function paint(color) {
  if (!paints.has(color)) {
    // In sRGB terms: keep the hue, drop most of the saturation, and sit just a shade off the deck's own lightness.
    const hsl = new THREE.Color(color).getHSL({}, THREE.SRGBColorSpace);
    const deck = DECK.getHSL({}, THREE.SRGBColorSpace);
    const c = new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 0.2), deck.l + 0.04, THREE.SRGBColorSpace);
    paints.set(color, new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0, side: THREE.DoubleSide }));
  }
  return paints.get(color);
}

/** A flat arrowhead on the floor pointing along `dir` ([dx, dz]). */
function chevron(m, x, y, z, [dx, dz]) {
  const l = 0.13, w = 0.055;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -l, -w, 0, l, 0, 0, l * 0.2, 0, 0, -l, 0, 0, l * 0.2, w, 0, l], 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m);
  return at(mesh, x, y, z, 0, Math.atan2(-dx, -dz), 0);
}

/** True if [a, b] along a long wall is clear of its doors and of anything already hung there. */
export function clear(P, wall, a, b) {
  return ![...P.doors[wall], ...P.taken[wall]].some(([p, q]) => p < b + 0.3 && q > a - 0.3);
}

/** A hanging sign every 25 m or so: one face for each direction, listing the routes ahead in their colours. */
function overhead(C, I, P, W) {
  const { c, ax, cr, mid } = P;
  const [a0, a1] = c[ax];
  const len = a1 - a0;
  if (len < 8) return;
  const k = Math.max(1, Math.round(len / 25));
  const atlas = C.atlas;
  const ceil = I.floorY + (c.h ?? 3), top = ceil - 0.36; // the signs' top edge
  for (let j = 0; j < k; j++) {
    const t = a0 + (len * (j + 0.5)) / k;
    let size = [0, 0];
    for (const s of [1, -1]) {
      const items = [];
      for (const r of W.routes) {
        const p = r.next.get(c.id);
        if (!p || r.to === c.id) continue;
        const d = p[ax] - t;
        if (Math.abs(d) < 1.5 && inSide(P, p)) {
          const right = (ax === 'z' ? -s : s) === Math.sign(p[cr] - mid);
          items.push({ text: `${right ? '▶' : '◀'} ${r.name}`, color: r.color });
        } else if (Math.sign(d) === s || Math.abs(d) < 1.5) items.push({ text: `▲ ${r.name}`, color: r.color });
      }
      if (!items.length) continue;
      const span = c[cr][1] - c[cr][0], narrow = span < 2.8; // a narrow passage gets a narrow sign, above head height
      const cols = items.length > 3 && !narrow ? 2 : 1;
      const rows = Math.ceil(items.length / cols);
      const w = cols === 2 ? 2.8 : narrow ? Math.min(1.3, span - 0.3) : 1.5, h = 0.1 + rows * (narrow ? 0.12 : 0.2);
      const face = atlas.plane(w, h, (g, pw, ph) => drawRouteSign(g, pw, ph, items, cols, rows), 200);
      // Facing the people walking toward it, i.e. against their direction `s`.
      const ry = ax === 'z' ? (s > 0 ? Math.PI : 0) : s > 0 ? -Math.PI / 2 : Math.PI / 2;
      const [x, z] = xz(P, t - s * 0.03, mid);
      I.group.add(at(face, x, top - h / 2, z, 0, ry, 0));
      size = [Math.max(size[0], w), Math.max(size[1], h)];
    }
    if (!size[0]) continue;
    const [x, z] = xz(P, t, mid);
    I.group.add(at(ax === 'z' ? box(size[0] + 0.06, size[1] + 0.06, 0.04, '#141a22') : box(0.04, size[1] + 0.06, size[0] + 0.06, '#141a22'), x, top - size[1] / 2, z));
    for (const e of [-0.45, 0.45]) {
      const [rx, rz] = xz(P, t, mid + e * size[0]);
      I.group.add(at(cyl(0.015, 0.015, ceil - top, '#3a4048', 4), rx, (top + ceil) / 2, rz));
    }
  }
}

function drawRouteSign(g, pw, ph, items, cols, rows) {
  g.fillStyle = '#0b1018';
  g.fillRect(0, 0, pw, ph);
  g.strokeStyle = '#5a6472';
  g.lineWidth = 3;
  g.strokeRect(2, 2, pw - 4, ph - 4);
  const pad = (ph * 0.1) / (0.1 + rows * 0.2), cw = (pw - 12) / cols, rh = (ph - pad) / rows;
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(rh * 0.62)}px ui-monospace, Menlo, monospace`;
  items.forEach((it, i) => {
    const col = Math.floor(i / rows), row = i % rows;
    const x = 6 + col * cw + 10, y = pad / 2 + row * rh + rh / 2;
    g.fillStyle = it.color;
    g.fillRect(x, y - rh * 0.3, rh * 0.22, rh * 0.6); // the line's colour, as on the floor
    g.fillText(it.text.toUpperCase(), x + rh * 0.42, y + 1);
  });
}

/** Frame plates, black on yellow, every 10 frames on each long wall where there is no door. */
function plates(C, I, P, deck) {
  const { c, ax } = P;
  const L = C.L;
  const [a0, a1] = c[ax];
  const sideName = { lo: ax === 'z' ? 'PORT' : 'FWD', hi: ax === 'z' ? 'STBD' : 'AFT' };
  const marks = ax === 'z' ? [] : [(a0 + a1) / 2];
  if (ax === 'z') for (let f = Math.ceil(frameOf(L, a0 + 1) / 10) * 10; f <= frameOf(L, a1 - 1); f += 10) marks.push(f + L.hull.main[0].z);
  for (const t of marks) for (const wall of ['lo', 'hi']) {
    if (!clear(P, wall, t - 0.3, t + 0.3)) continue;
    const fr = frameOf(L, ax === 'z' ? t : (c.z[0] + c.z[1]) / 2);
    const plate = C.atlas.plane(0.42, 0.3, (g, pw, ph) => {
      g.fillStyle = '#e8c23a';
      g.fillRect(0, 0, pw, ph);
      g.strokeStyle = '#1a1a1a';
      g.lineWidth = 3;
      g.strokeRect(4, 4, pw - 8, ph - 8);
      g.fillStyle = '#141414';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 ${Math.round(ph * 0.4)}px ui-monospace, Menlo, monospace`;
      g.fillText(`FR ${fr}`, pw / 2, ph * 0.38);
      g.font = `700 ${Math.round(ph * 0.2)}px ui-monospace, Menlo, monospace`;
      g.fillText(`DECK ${deck.id} · ${sideName[wall]}`, pw / 2, ph * 0.76);
    }, 260);
    const s = P.wall[wall] + (wall === 'lo' ? 0.12 : -0.12);
    const [x, z] = xz(P, t, s);
    const ry = ax === 'z' ? (wall === 'lo' ? Math.PI / 2 : -Math.PI / 2) : wall === 'lo' ? 0 : Math.PI;
    I.group.add(at(plate, x, I.floorY + 1.55, z, 0, ry, 0));
  }
}

/** The one-way rule, stencilled on both walls of a passage that crosses the ship between the port and starboard
 *  passages: the arrows point to the side you keep to, as the reader stands. */
function oneWay(C, I, P) {
  const { c, ax } = P;
  if (ax !== 'x') return;
  const sides = new Set(C.ways.portals.get(c.id).filter((p) => p.kind === 'door').map((p) => Math.sign((C.rooms.get(p.to).x[0] + C.rooms.get(p.to).x[1]) / 2)));
  if (!(sides.has(1) && sides.has(-1))) return;
  const W = 1.5, Hh = 0.36;
  for (const wall of ['lo', 'hi']) {
    // On the forward wall the reader faces the bow, starboard to their right; on the after wall it is to their left.
    const right = wall === 'lo';
    const t = (c.x[0] + c.x[1]) / 2 + (right ? -1.2 : 1.2);
    if (!clear(P, wall, t - W / 2, t + W / 2)) continue;
    P.taken[wall].push([t - W / 2, t + W / 2]);
    const plate = C.atlas.plane(W, Hh, (g, pw, ph) => {
      g.fillStyle = '#20252c';
      g.fillRect(0, 0, pw, ph);
      g.fillStyle = '#d8d2c0';
      g.textBaseline = 'middle';
      g.font = `700 ${Math.round(ph * 0.3)}px ui-monospace, Menlo, monospace`;
      g.textAlign = 'center';
      g.fillText(right ? 'FORWARD · STBD SIDE ▶' : '◀ FORWARD · STBD SIDE', pw / 2, ph * 0.3);
      g.fillText(right ? '◀ AFT · PORT SIDE' : 'AFT · PORT SIDE ▶', pw / 2, ph * 0.72);
    }, 200);
    const s = P.wall[wall] + (wall === 'lo' ? 0.12 : -0.12);
    const [x, z] = xz(P, t, s);
    I.group.add(at(plate, x, I.floorY + 1.75, z, 0, wall === 'lo' ? 0 : Math.PI, 0));
  }
}

/** "You are here": a deck plan at each ladder and every 60 m of passage, on whichever wall is clear. */
function plans(C, I, P, W, deck) {
  const { c, ax } = P;
  const [a0, a1] = c[ax];
  const len = a1 - a0;
  if (len < 10) return;
  const want = W.portals.get(c.id).filter((p) => p.kind === 'ladder').map((p) => p[ax] + (p[ax] - a0 < len / 2 ? 2.6 : -2.6));
  for (let t = a0 + 60; t < a1 - 20; t += 60) if (!want.some((w) => Math.abs(w - t) < 25)) want.push(t);
  if (!want.length) want.push((a0 + a1) / 2);
  const narrow = c[P.cr][1] - c[P.cr][0] < 2.8;
  const BW = narrow ? 2.4 : 3.0, BH = narrow ? 0.76 : 0.95;
  for (const t0 of want) {
    let spot = null;
    for (const dt of [0, 1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6, 8, -8]) {
      const t = t0 + dt;
      if (t - BW / 2 < a0 + 0.4 || t + BW / 2 > a1 - 0.4) continue;
      const wall = ['lo', 'hi'].find((w) => clear(P, w, t - BW / 2, t + BW / 2));
      if (wall) (spot = { t, wall });
      if (spot) break;
    }
    if (!spot) continue;
    const { t, wall } = spot;
    P.taken[wall].push([t - BW / 2, t + BW / 2]);
    const s = P.wall[wall] + (wall === 'lo' ? 0.13 : -0.13);
    const [x, z] = xz(P, t, s);
    // The board faces into the passage; you face the wall to read it.
    const n = ax === 'z' ? [wall === 'lo' ? 1 : -1, 0] : [0, wall === 'lo' ? 1 : -1];
    const board = C.atlas.plane(BW, BH, (g, pw, ph) => drawPlan(g, pw, ph, C, deck, { x, z }, [-n[0], -n[1]]), 340);
    I.group.add(at(board, x, I.floorY + 1.5, z, 0, Math.atan2(n[0], n[1]), 0));
    const frame = ax === 'z' ? box(0.06, BH + 0.1, BW + 0.1, '#2b3038') : box(BW + 0.1, BH + 0.1, 0.06, '#2b3038');
    const [fx, fz] = xz(P, t, s + (wall === 'lo' ? -0.04 : 0.04));
    I.group.add(at(frame, fx, I.floorY + 1.5, fz));
  }
}

/** The deck plan, heads-up: `f` is the way the reader faces, which is up on the board. */
function drawPlan(g, pw, ph, C, deck, here, f) {
  const L = C.L;
  const r = [-f[1], f[0]]; // the reader's right
  const toS = (x, z) => [x * r[0] + z * r[1], x * f[0] + z * f[1]]; // (right, up)
  const rooms = L.compartments.filter((c) => c.access === 'walk' && c.deck === deck.id);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of rooms) for (const x of c.x) for (const z of c.z) {
    const [sx, sy] = toS(x, z);
    x0 = Math.min(x0, sx), x1 = Math.max(x1, sx), y0 = Math.min(y0, sy), y1 = Math.max(y1, sy);
  }
  g.fillStyle = '#0d131c';
  g.fillRect(0, 0, pw, ph);
  g.strokeStyle = '#5a6472';
  g.lineWidth = 4;
  g.strokeRect(2, 2, pw - 4, ph - 4);
  const head = ph * 0.13, foot = ph * 0.12, pad = 18;
  const mw = pw - pad * 2, mh = ph - head - foot - pad;
  const sx = Math.min(mw / (x1 - x0), (mh / (y1 - y0)) * 3), sy = Math.min(mh / (y1 - y0), sx * 2.4);
  const ox = pad + (mw - (x1 - x0) * sx) / 2, oy = head + pad / 2 + (mh - (y1 - y0) * sy) / 2;
  const P = (x, z) => {
    const [a, b] = toS(x, z);
    return [ox + (a - x0) * sx, oy + (y1 - b) * sy];
  };
  const rect = (c) => {
    const [ax, ay] = P(c.x[0], c.z[0]), [bx, by] = P(c.x[1], c.z[1]);
    return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)];
  };
  // Header: the deck, which way the bow is, and the key.
  g.textBaseline = 'middle';
  g.fillStyle = '#d8e2ee';
  g.font = `700 ${Math.round(head * 0.5)}px ui-monospace, Menlo, monospace`;
  g.textAlign = 'left';
  g.fillText(`DECK ${deck.id} · ${deck.name.toUpperCase()}`, pad, head * 0.6);
  const [bx, by] = [toS(0, -1)[0], toS(0, -1)[1]];
  const bow = Math.abs(bx) > Math.abs(by) ? (bx > 0 ? 'BOW ▶' : '◀ BOW') : by > 0 ? '▲ BOW' : '▼ BOW';
  g.textAlign = 'right';
  g.fillText(bow, pw - pad, head * 0.6);
  // Rooms: passages grey, the rest in their system's colour, named where the name fits.
  for (const c of rooms) {
    const [x, y, w, h] = rect(c);
    const col = c.system === 'corridor' ? '#59616c' : SYSTEMS[c.system]?.[0] ?? '#8a93a3';
    g.fillStyle = col + (c.system === 'corridor' ? '88' : '44');
    g.fillRect(x, y, w, h);
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    if (c.system === 'corridor') continue;
    label(g, c.name, x, y, w, h);
  }
  // Ladders: where they go.
  for (const c of rooms) for (const p of C.ways.portals.get(c.id)) {
    if (p.kind !== 'ladder') continue;
    const [x, y] = P(p.x, p.z);
    g.fillStyle = '#e8c23a';
    g.fillRect(x - 9, y - 9, 18, 18);
    g.fillStyle = '#141414';
    g.font = `800 13px ui-monospace, Menlo, monospace`;
    g.textAlign = 'center';
    g.fillText(p.deck < deck.id ? '▲' : '▼', x, y + 1);
    g.fillStyle = '#e8c23a';
    g.font = `700 13px ui-monospace, Menlo, monospace`;
    g.fillText(`DECK ${p.deck}`, x, y + (y > ph / 2 ? -18 : 20));
  }
  // You are here.
  const [hx, hy] = P(here.x, here.z);
  g.fillStyle = '#ff3a3a';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(hx, hy, 10, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.font = `800 15px ui-monospace, Menlo, monospace`;
  g.textAlign = hx > pw * 0.8 ? 'right' : 'left';
  g.fillStyle = '#ff6a6a';
  g.fillText('YOU ARE HERE', hx + (hx > pw * 0.8 ? -16 : 16), hy + (hy > ph / 2 ? -16 : 16));
  // Footer: the floor lines.
  g.textAlign = 'left';
  g.font = `700 ${Math.round(foot * 0.42)}px ui-monospace, Menlo, monospace`;
  let x = pad;
  g.fillStyle = '#9aa6b4';
  g.fillText('FOLLOW THE LINES:', x, ph - foot * 0.6);
  x += g.measureText('FOLLOW THE LINES: ').width;
  for (const r of C.ways.routes) {
    g.fillStyle = r.color;
    g.fillRect(x, ph - foot * 0.6 - 7, 22, 14);
    x += 30;
    g.fillText(r.name.toUpperCase(), x, ph - foot * 0.6);
    x += g.measureText(r.name.toUpperCase()).width + 24;
  }
}

/** A room's name in its box, wrapped and shrunk to fit; turned on its side in a tall narrow box; left out if neither
 *  fits. */
function label(g, text, x, y, w, h) {
  const words = text.toUpperCase().split(' ');
  const fitIn = (bw, bh) => {
    for (let size = 15; size >= 8; size--) {
      g.font = `700 ${size}px ui-monospace, Menlo, monospace`;
      const lines = [];
      let cur = '';
      for (const wd of words) {
        const next = cur ? `${cur} ${wd}` : wd;
        if (g.measureText(next).width <= bw - 6) cur = next;
        else {
          if (cur) lines.push(cur);
          cur = wd;
        }
      }
      lines.push(cur);
      if (!lines.some((l) => g.measureText(l).width > bw - 4) && lines.length * size * 1.1 <= bh - 4) return { size, lines };
    }
    return null;
  };
  const flat = fitIn(w, h), side = !flat || flat.size < 10 ? fitIn(h, w) : null;
  const use = side && (!flat || side.size > flat.size) ? side : flat;
  if (!use) return;
  g.save();
  g.translate(x + w / 2, y + h / 2);
  if (use === side) g.rotate(-Math.PI / 2);
  g.font = `700 ${use.size}px ui-monospace, Menlo, monospace`;
  g.fillStyle = '#e8eef5';
  g.textAlign = 'center';
  use.lines.forEach((l, i) => g.fillText(l, 0, (i - (use.lines.length - 1) / 2) * use.size * 1.1));
  g.restore();
}

/** Pipes and a cable tray along the deckhead at each side, in the colours ships paint them, so a passage is not a bare
 *  tube: fire main and fresh water to port, propellant and coolant to starboard. */
function services(I, P) {
  const { c, ax, cr } = P;
  const [a0, a1] = c[ax];
  const len = a1 - a0 - 0.2, mid = (a0 + a1) / 2;
  const top = I.floorY + (c.h ?? 3);
  if (c[cr][1] - c[cr][0] < 2.4) return; // too narrow
  [[P.wall.lo + 0.18, 0], [P.wall.lo + 0.32, 1], [P.wall.hi - 0.18, 2], [P.wall.hi - 0.32, 3]].forEach(([s, k]) => {
    const [x, z] = xz(P, mid, s);
    const p = cyl(0.05, 0.05, len, PIPES[k], 6);
    I.group.add(at(p, x, top - 0.22 - (k % 2) * 0.12, z, ax === 'z' ? Math.PI / 2 : 0, 0, ax === 'z' ? 0 : Math.PI / 2));
  });
  const [tx, tz] = xz(P, mid, P.wall.lo + 0.35);
  I.group.add(at(ax === 'z' ? box(0.45, 0.06, len, '#3a4048') : box(len, 0.06, 0.45, '#3a4048'), tx, top - 0.06, tz));
  // Brackets every 3 m.
  for (let t = a0 + 1.5; t < a1; t += 3) for (const w of ['lo', 'hi']) {
    const [bx, bz] = xz(P, t, P.wall[w] + (w === 'lo' ? 0.3 : -0.3));
    I.group.add(at(ax === 'z' ? box(0.5, 0.04, 0.05, '#2b3038') : box(0.05, 0.04, 0.5, '#2b3038'), bx, top - 0.3, bz));
  }
}
