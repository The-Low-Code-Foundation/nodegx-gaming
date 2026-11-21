// Living weightless (design/ROADMAP.md, phase 4): the handholds in every weightless room, and moving by them.
//
// Build time, `dressHolds(C, I, c, open)` (layout.mjs, for each room with `float`): a rail along each wall at hand
// height, in lengths with gaps between, broken at doors, windows and furniture; grab handles either side of each door;
// a sparse line of handles on the deckhead (and in rooms on the deck); and a handle by each thing in the room you use
// (a console, a locker). Each is a hold in `I.holds`: a segment `a`→`b` in the deck's frame, with `n`, the wall's
// normal into the room. Kept sparse on purpose: enough to get about by, not a hold everywhere you look.
//
// Run time, `Floater` (walker.floater, called by Walker.frame while `float`): you are either holding a hold or
// drifting. Holding, you are still (the drive's push doesn't move you); W pushes off along where you look, harder the
// longer you hold it before you let go, Shift with W a big push at once; A, D and S pull you along the hold you have,
// hand over hand, and on to the next one at its end. Drifting, you cannot change course: you go where the push sent
// you until a wall stops you or you take a hold, and nothing is ever taken for you: Space takes the hold in reach (a
// soft glow marks it, a little ahead of you where you look), and with none in reach fires the suit's cold-gas puffer
// against your drift; WASD on the puffer push you gently where you look. Its gas is limited, and topped up wherever
// there is weight (a drum, a hub ring, a walking deck) and at the PUFFER GAS refill points. Out of gas in air you can
// still swim, very slowly. You move in three dimensions: up to the deckhead, down to the deck, through a door only
// below its lintel.
//
// The airless hangar has no handholds of these: you cross it by its gangway (sets/hangar.mjs), whose rails are its holds,
// clipped by a lanyard to the safety wire over it (`I.tethers`, `tether()`), so you can never drift off into the bay.
//
// Brace for impact: a brace strap on the walls of every weightless room (a padded back and a harness, every five metres
// or so). At action stations, or when the ship calls brace (a torpedo seconds out: weapons/torpedoes.mjs `braceFrame`),
// E straps you in; E again lets you go. A hit kicks her structure (`jolt` on the bus, from integrity.mjs `impact`):
// strapped in, you ride it; holding on, you keep your hold below the layout's `weapons.brace.grip` (`feet` for a foot
// rail); loose, you keep going while the ship moves under you, and meet a wall. Meeting one faster than `hurt` m/s
// hurts, and a whole injury blacks you out (integrity.mjs `rescue`: the damage control party picks you up). It heals.

import * as THREE from 'three';
import { roomAt } from './layout.mjs';
import { box, at, mat, glow } from '../util.mjs';

const EYE = 1.6; // the walker's eye above its `pos` (walk.mjs)
const R = 0.38; // your body's radius against the walls
export const HOLD = {
  reach: 1.45, // m from your eye to a hold you can take (Space)
  catch: 2.5, // m: a hold you look at this far off you can still take: you reach out and pull yourself in to it
  surface: 1.15, // m from your eye to a wall, the deck or the deckhead you can push off with W (no hold needed)
  pull: 1.3, // m/s along a hold, hand over hand (A D S)
  fast: 2.2, // m/s: with Shift
  gangway: 1.35, // the gangway's rails are made for it: pulling along them is this much quicker
  swap: 1.9, // m from your hand to the next hold you reach for, at a hold's end or across it
  push: [3, 4.5], // m/s: a tap of W, and W held for `charge` seconds
  charge: 0.8,
  hard: 6.5, // m/s: Shift with W, a big push at once
  leash: 2.6, // m/s: the hardest push off where you are clipped on (the lanyard catches you)
  scrape: 0.92, // what is left of your slide along a wall you meet (what you had into it is gone)
  haul: [1.8, 1.4], // m/s² and m/s: hauling yourself in on your lanyard (Space, clipped on, nothing in reach)
  low: 0.35, // the puffer's bottle under this: the refill points glow, and the HUD says where the nearest is
  gas: 12, // m/s of the puffer's Δv in a full bottle; the puffer is off until you switch it on (P)
  puff: 0.6, // m/s²: the puffer pushing you
  brake: 1.4, // m/s²: the puffer against your drift (Space)
  refill: 4, // s to top the bottle up where there is weight
  swim: [0.25, 0.35], // m/s² and m/s: swimming in air, with the puffer off or empty
  door: 2.1, // m above the deck: your eye's highest through a door (its lintel is at 2.5)
  legs: 1.5, // m below your eye your feet reach: a foot rail or a deck handle under you
  stand: 1.55, // m: your eye over a foot rail you stand in
  tether: 3.2, // m: the furthest your eye gets from the safety wire you are clipped to (the airless hangar's gangway)
};

const RAIL = mat('#d8a530');

/** A soft round glow, bright in the middle and gone at the edge: the grab hint's texture. */
let DOT = null;
function softDot() {
  if (DOT) return DOT;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  DOT = new THREE.CanvasTexture(cv);
  DOT.colorSpace = THREE.SRGBColorSpace;
  return DOT;
} // the airless hangar's rails (sets/hangar.mjs) are this yellow too
const FOOT = mat('#5b626c');
const STRIP = glow('#4e6078'); // dim: under the bloom aboard a brighter strip reads as a white line
const PAD = mat('#3a424c');
const BRACE_LAMP = glow('#7a4a20'); // the small amber lamp over each brace strap
// The brace straps' uses ask the Floater (one aboard: yours) whether to show and what to do.
const BRACE = { floater: null };

/** A cargo net `w` by `h` (in its own x and y, facing +z): cord in a diamond mesh about 12 cm across, see-through
 *  between. One shared material, so every net aboard bakes into one mesh per deck. */
let NET = null;
export function net(w, h) {
  if (!NET) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    g.strokeStyle = '#d8d2b8';
    g.lineWidth = 4;
    for (const [a, b, c2, d] of [[0, 0, 64, 64], [64, 0, 0, 64], [-32, 32, 32, 96], [32, -32, 96, 32], [32, -32, -32, 32], [96, 32, 32, 96]]) (g.beginPath(), g.moveTo(a, b), g.lineTo(c2, d), g.stroke());
    g.fillStyle = '#e8e2c8';
    for (const [x, yy] of [[0, 0], [64, 0], [0, 64], [64, 64], [32, 32]]) g.fillRect(x - 4, yy - 4, 8, 8); // the knots
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    NET = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, color: '#b8b098' });
  }
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 0.24, (uv.getY(i) * h) / 0.24);
  return new THREE.Mesh(geo, NET);
}

/** A strap: a webbing band `w` long along x, 5 cm wide, lying flat (`flat`, across a top) or standing (across a
 *  front facing z). */
export const strap = (w, flat = true) => (flat ? box(w, 0.012, 0.05, STRAP) : box(w, 0.05, 0.012, STRAP));
const STRAP = mat('#c8a030');

/** Foot rails a piece of furniture asks for, in its own frame: `mesh.userData.foot = [{ x, z, w, along }]` (a rail
 *  `w` long along its x, or its z with `along: 'z'`, centred on (x, z)). In a weightless room `dressHolds` builds each one on the deck and makes it a hold: where
 *  you stand at a desk, a bench or a table, feet hooked under the rail. Elsewhere it is ignored. */
function footRails(I, c) {
  const [x1, x2] = c.x, [z1, z2] = c.z;
  for (const m of I.group.children) {
    const specs = m.userData.foot;
    if (!specs || m.userData.footDone || m.position.x < x1 || m.position.x > x2 || m.position.z < z1 || m.position.z > z2) continue;
    m.userData.footDone = true;
    const cs = Math.cos(m.rotation.y), sn = Math.sin(m.rotation.y);
    const to = (lx, lz) => new THREE.Vector3(m.position.x + lx * cs + lz * sn, I.floorY + 0.09, m.position.z - lx * sn + lz * cs);
    for (const f of specs) {
      const [a, b] = f.along === 'z' ? [to(f.x, f.z - f.w / 2), to(f.x, f.z + f.w / 2)] : [to(f.x - f.w / 2, f.z), to(f.x + f.w / 2, f.z)];
      hold(I, c, a, b, new THREE.Vector3(0, 1, 0), 'foot');
    }
  }
}

// --- the holds, built -----------------------------------------------------------------------------------------------

/** A hold from `a` to `b` (in the deck's frame) standing `off` m out from its surface along `n`: a bar and a foot at
 *  each end (or one in the middle of a short handle). Axis-aligned. With `draw` false, only the hold: something else
 *  (a gangway's rail, a grab frame's bar) already draws it. */
export function hold(I, c, a, b, n, kind, draw = true) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  if (!draw) return void (I.holds ??= []).push({ a, b, n, kind, room: c.id, len, I, free: true }); // a bar on its own: pushed off any way
  const ax = Math.abs(d.x) > 1e-3 ? 'x' : Math.abs(d.y) > 1e-3 ? 'y' : 'z';
  const nx = Math.abs(n.x) > 0.5 ? 'x' : Math.abs(n.y) > 0.5 ? 'y' : 'z';
  const dims = { x: 0.04, y: 0.04, z: 0.04 };
  dims[ax] = len;
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  I.group.add(at(box(dims.x, dims.y, dims.z, RAIL), mid.x, mid.y, mid.z));
  // The feet: from the surface out to the bar.
  const foot = { x: 0.03, y: 0.03, z: 0.03 };
  foot[nx] = 0.09;
  const feet = len > 0.6 ? [a.clone().addScaledVector(d, 0.06 / len), b.clone().addScaledVector(d, -0.06 / len)] : [mid];
  for (const p of feet) {
    const q = p.clone().addScaledVector(n, -0.045);
    I.group.add(at(box(foot.x, foot.y, foot.z, FOOT), q.x, q.y, q.z));
  }
  (I.holds ??= []).push({ a, b, n, kind, room: c.id, len, I });
}

// The puffer's refill points: a dark panel with a quick-connect in a cyan ring. The ring's one shared material is
// turned up and pulses while your bottle is low (`Floater.frame`), so the nearest ones stand out from across a room.
const REFILL = { floater: null, glow: new THREE.MeshBasicMaterial({ color: '#2fb8cc', toneMapped: false }), body: mat('#252b33'), hose: mat('#1b1d20') };

/** A puffer refill point on a wall or a post: `p` the middle of its face (the deck's frame), `n` out from it (level).
 *  A use (E: top up) that shows only while your bottle is not full, and an entry in `I.refills` that the HUD measures
 *  to. `C` for its label on the sign atlas. */
export function refillPoint(C, I, c, p, n) {
  const g = new THREE.Group();
  g.add(at(box(0.36, 0.5, 0.07, REFILL.body), 0, 0, 0.035));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 6, 20), REFILL.glow);
  ring.position.set(0, 0.06, 0.075);
  g.add(ring, at(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), FOOT), 0, 0.06, 0.09, Math.PI / 2, 0, 0));
  // A hose in a loop under it, and a lit stripe along the top so it reads as a fitting even with the ring dim.
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 4, 14, Math.PI * 1.5), REFILL.hose);
  loop.position.set(0, -0.15, 0.09);
  loop.rotation.z = Math.PI * 0.75;
  g.add(loop, at(box(0.3, 0.025, 0.012, REFILL.glow), 0, 0.22, 0.075));
  if (C?.atlas) g.add(at(C.atlas.plane(0.3, 0.07, (gg, w, h) => {
    gg.fillStyle = '#10161c';
    gg.fillRect(0, 0, w, h);
    gg.fillStyle = '#5fe3f2';
    gg.font = `bold ${Math.round(h * 0.72)}px ui-monospace, Menlo, monospace`;
    gg.textAlign = 'center';
    gg.textBaseline = 'middle';
    gg.fillText('PUFFER GAS', w / 2, h / 2 + 1);
  }, 240), 0, -0.04, 0.072));
  g.position.copy(p);
  g.rotation.y = Math.atan2(n.x, n.z);
  I.group.add(g);
  const u = I.use('refill', 'Top up your puffer', p.x + n.x * 0.5, p.z + n.z * 0.5, () => REFILL.floater?.refill(), { r: 1.7, y: p.y });
  u.hidden = () => !REFILL.floater || REFILL.floater.gas >= HOLD.gas - 0.05;
  u.room = c.id;
  (I.refills ??= []).push({ p: p.clone(), room: c.id });
}

/** Runs along [a0, b0] with the `gaps` taken out, each run at least `min` long. */
function runs(a0, b0, gaps, min = 0.5) {
  const out = [];
  let cur = a0;
  for (const [a, b] of gaps.slice().sort((p, q) => p[0] - q[0])) {
    if (cur >= b0) break;
    // A gap that starts past the end of the wall (furniture in the next room, on the same line) ends the run at the
    // wall's end, not at the gap: without this, rails and brace straps were built out past the corner, into thin air.
    const end = Math.min(a, b0);
    if (end - cur >= min) out.push([cur, end]);
    cur = Math.max(cur, b);
  }
  if (b0 - cur >= min) out.push([cur, b0]);
  return out;
}

/** A brace strap on the wall: `at(u, yy, w)` the point `u` along the wall, `yy` up, `w` out from the wall line; `alongX`
 *  the wall runs along x. A padded back with a headrest, two shoulder straps and a lap strap with its buckle, and a small
 *  amber lamp over it. */
function braceStrap(I, at3, alongX, u, y) {
  const part = (du, dv, dw, cu, cv, cw, m) => {
    const q = at3(cu, cv, 0.1 + cw); // out from the wall's face, 0.1 m off its line
    I.group.add(at(alongX ? box(du, dv, dw, m) : box(dw, dv, du, m), q.x, q.y, q.z));
  };
  part(0.56, 1.5, 0.07, u, y + 1.2, 0.035, PAD);
  part(0.34, 0.24, 0.06, u, y + 1.72, 0.09, PAD);
  for (const s of [-0.13, 0.13]) part(0.05, 0.7, 0.012, u + s, y + 1.3, 0.077, STRAP);
  part(0.6, 0.05, 0.012, u, y + 0.95, 0.077, STRAP);
  part(0.08, 0.07, 0.02, u, y + 0.95, 0.085, FOOT);
  part(0.14, 0.03, 0.02, u, y + 2.05, 0.02, BRACE_LAMP);
}

/** The handholds of weightless room `c` on deck `I` (after its furniture, so the handles can find what it holds).
 *  `open`: its walls' doors, windows and bay doors (layout.mjs `buildDeck`). */
export function dressHolds(C, I, c, open) {
  const y = I.floorY, h = c.h ?? 3, [x1, x2] = c.x, [z1, z2] = c.z, OFF = 0.09;
  const V = (x, yy, z) => new THREE.Vector3(x, yy, z);
  footRails(I, c);
  // The walls: north and south run along x, west and east along z. Rails in lengths of about two metres, at hand
  // height off the deck and below the deckhead, broken at every opening.
  const walls = [['n', z1, x1, x2, true, 1], ['s', z2, x1, x2, true, -1], ['w', x1, z1, z2, false, 1], ['e', x2, z1, z2, false, -1]];
  const braces = [];
  // Where something else is used (a console, a locker, and the ladders, which are built after this): no brace strap
  // within reach of it. [x, z, how near is too near].
  const busy = [...I.interactables.filter((u) => u.id !== 'refill').map((u) => [u.pos.x, u.pos.z, Math.max(2.2, (u.r ?? 1.5) + 0.8)]),
    ...C.L.ladders.flatMap((l) => ['a', 'b'].filter((e) => l[e].deck === I.deck?.id).map((e) => [l[e].at[0], l[e].at[1], 3.2]))];
  let spare = null; // the best place for a refill point if no door has one
  for (const [side, line, a0, b0, alongX, inward] of walls) {
    const n = alongX ? V(0, 0, inward) : V(inward, 0, 0);
    const pt = (u, yy) => (alongX ? V(u, yy, line + inward * OFF) : V(line + inward * OFF, yy, u));
    const gaps = open[side].map((o) => [o.a - 0.35, o.b + 0.35]);
    // Furniture against the wall at a rail's height (a locker, a rack, a console) breaks the rail too. The wall's own
    // colliders are 0.2 m thick on its line; anything thicker reaching within 0.35 m of it is furniture.
    const nk = alongX ? 'z' : 'x', uk = alongX ? 'x' : 'z';
    const against = (yy) => I.colliders.filter((k) => k.max[nk] - k.min[nk] > 0.25 && k.min.y < yy + 0.1 && k.max.y > yy - 0.1 &&
      (inward > 0 ? k.min[nk] < line + 0.35 && k.max[nk] > line : k.max[nk] > line - 0.35 && k.min[nk] < line)).map((k) => [k.min[uk] - 0.2, k.max[uk] + 0.2]);
    // Lamps all round, not only overhead (with no down, the deck is just another wall): a lit strip low on every wall,
    // under the lower rail, where nothing stands in front of it.
    for (const [ra, rb] of runs(a0 + 0.3, b0 - 0.3, [...gaps, ...against(y + 0.3)], 0.6)) {
      const m = (ra + rb) / 2, len = rb - ra, q = pt(m, y + 0.32);
      q[nk] = line + inward * 0.11;
      I.group.add(at(alongX ? box(len, 0.05, 0.03, STRIP) : box(0.03, 0.05, len, STRIP), q.x, q.y, q.z));
    }
    // The brace straps: one in a free stretch of wall 1.2 m or more long, about every nine metres, and never within
    // reach of something else you use (a ladder, a console, a hatch: E there must do that, not strap you in). The rail
    // breaks for each.
    const free = runs(a0 + 0.5, b0 - 0.5, [...gaps, ...against(y + 0.6), ...against(y + 1.3), ...against(y + 1.9)], 1.2);
    const at3 = (u, yy, w) => (alongX ? V(u, yy, line + inward * w) : V(line + inward * w, yy, u));
    const clearOfUses = (u) => { const q = at3(u, y, 0.55); return !busy.some(([x, z, r]) => Math.hypot(q.x - x, q.z - z) < r); };
    const mine = [];
    for (const [ra, rb] of free) {
      const k = Math.max(1, Math.round((rb - ra) / 9));
      for (let i = 0; i < k; i++) {
        const u = ra + ((i + 0.5) * (rb - ra)) / k;
        if (clearOfUses(u) && !braces.some((b) => b.eye.distanceTo(at3(u, y + 1.72, 0.55)) < 4)) mine.push(u);
      }
    }
    for (const u of mine) {
      braceStrap(I, at3, alongX, u, y);
      // Solid: you float into its pad, not through it.
      const p0 = at3(u - 0.3, y, 0), p1 = at3(u + 0.3, y + 2.0, 0.2);
      I.collider(Math.min(p0.x, p1.x), y, Math.min(p0.z, p1.z), Math.max(p0.x, p1.x), y + 2.0, Math.max(p0.z, p1.z));
      braces.push({ room: c.id, I, n: n.clone(), eye: at3(u, y + 1.72, 0.55) });
    }
    const strapGaps = mine.map((u) => [u - 0.42, u + 0.42]);
    // One rail at hand height, in lengths of at most 1.5 m about every 3.2 m (the gaps are a reach, so A D still
    // carry you along it), broken for the brace straps.
    const hy = 1.1;
    for (const [ra, rb] of runs(a0 + 0.4, b0 - 0.4, [...gaps, ...against(y + hy), ...strapGaps], 0.6)) {
      const k = Math.max(1, Math.round((rb - ra) / 3.2)), step = (rb - ra) / k, seg = Math.min(1.5, step);
      for (let i = 0; i < k; i++) {
        const mid = ra + (i + 0.5) * step;
        hold(I, c, pt(mid - seg / 2, y + hy), pt(mid + seg / 2, y + hy), n, 'rail');
      }
    }
    // Upright grab handles either side of each door, on the room's side.
    for (const o of open[side]) if (o.kind === 'door') for (const u of [o.a - 0.2, o.b + 0.2]) {
      if (u > a0 + 0.2 && u < b0 - 0.2) hold(I, c, pt(u, y + 0.7), pt(u, y + 2.1), n, 'door');
    }
    // A puffer refill point beside a door (past its grab handle), so there is one in every room and every few metres
    // of passage: none within 9 m of another in the same room.
    for (const o of open[side]) if (o.kind === 'door') {
      const u = [o.b + 0.62, o.a - 0.62].find((u) => u > a0 + 0.4 && u < b0 - 0.4 && !open[side].some((q) => u > q.a - 0.3 && u < q.b + 0.3) &&
        !against(y + 1.45).some(([ga, gb]) => u > ga && u < gb) && !mine.some((m) => Math.abs(m - u) < 0.75));
      if (u == null) continue;
      const p = at3(u, y + 1.45, 0.1);
      if (!(I.refills ?? []).some((r) => r.room === c.id && r.p.distanceTo(p) < 9)) refillPoint(C, I, c, p, n);
    }
    // Somewhere for one if no door had room beside it: the longest clear stretch of wall, off its brace straps.
    for (const [ra, rb] of runs(a0 + 0.5, b0 - 0.5, [...gaps, ...against(y + 1.45), ...mine.map((m) => [m - 0.75, m + 0.75])], 0.8)) {
      if (!spare || rb - ra > spare.len) spare = { len: rb - ra, p: at3((ra + rb) / 2, y + 1.45, 0.1), n: n.clone() };
    }
  }
  if (spare && !(I.refills ?? []).some((r) => r.room === c.id)) refillPoint(C, I, c, spare.p, spare.n);
  // The deck and the deckhead: short handles across, in a grid (one line down a passage), clear of furniture and of a
  // ladder's opening.
  const w = x2 - x1, d = z2 - z1, long = w > d ? 'x' : 'z';
  const holes = C.holes?.get(c.id) ?? [];
  const inHole = (x, z, kind) => holes.some((o) => o.kind === kind && x > o.x[0] - 0.6 && x < o.x[1] + 0.6 && z > o.z[0] - 0.6 && z < o.z[1] + 0.6);
  const blocked = (x, z, lo, hi) => I.colliders.some((k) => x > k.min.x - 0.3 && x < k.max.x + 0.3 && z > k.min.z - 0.3 && z < k.max.z + 0.3 && k.max.y > lo && k.min.y < hi);
  const lines = (a, b, step) => {
    const k = Math.max(1, Math.floor((b - a) / step)), out = [];
    for (let i = 0; i < k; i++) out.push(a + ((i + 0.5) * (b - a)) / k);
    return out;
  };
  // Sparse: a line of them down a passage's deckhead every five metres or so, a grid about 4.5 m apart in a room.
  const narrow = Math.min(w, d) < 4.5;
  const xs = narrow && long === 'z' ? [(x1 + x2) / 2] : lines(x1 + 1, x2 - 1, narrow ? 5 : 4.5);
  const zs = narrow && long === 'x' ? [(z1 + z2) / 2] : lines(z1 + 1, z2 - 1, narrow ? 5 : 4.5);
  const half = 0.25;
  for (const x of xs) for (const z of zs) {
    const across = long === 'z' ? [V(x - half, 0, z), V(x + half, 0, z)] : [V(x, 0, z - half), V(x, 0, z + half)];
    if (!narrow && !inHole(x, z, 'floor') && !blocked(x, z, y - 0.1, y + 0.4)) hold(I, c, across[0].clone().setY(y + 0.07), across[1].clone().setY(y + 0.07), V(0, 1, 0), 'deck');
    if (!inHole(x, z, 'ceil') && !blocked(x, z, y + h - 0.5, y + h + 0.1)) hold(I, c, across[0].clone().setY(y + h - 0.25), across[1].clone().setY(y + h - 0.25), V(0, -1, 0), 'deckhead');
  }
  // A handle by each thing to use here: upright on the nearest wall if it is within a metre and a half, else across the
  // deck beside it.
  for (const u of I.interactables) {
    const p = u.pos;
    if (u.id === 'refill') continue;
    if (p.x < x1 || p.x > x2 || p.z < z1 || p.z > z2 || (u.room && u.room !== c.id)) continue;
    const dist = [[p.z - z1, 'n'], [z2 - p.z, 's'], [p.x - x1, 'w'], [x2 - p.x, 'e']].sort((a, b) => a[0] - b[0])[0];
    if (dist[0] < 1.5) {
      const [, line, a0, b0, alongX, inward] = walls.find((wl) => wl[0] === dist[1]);
      const u0 = (alongX ? p.x : p.z) + 0.7, n = alongX ? V(0, 0, inward) : V(inward, 0, 0);
      if (u0 > a0 + 0.3 && u0 < b0 - 0.3 && !open[dist[1]].some((o) => u0 > o.a - 0.3 && u0 < o.b + 0.3)) {
        const q = (yy) => (alongX ? V(u0, yy, line + inward * OFF) : V(line + inward * OFF, yy, u0));
        hold(I, c, q(y + 0.8), q(y + 1.9), n, 'station');
      }
    } else {
      // Beside it on the deck, the first side that is clear of furniture.
      const spot = [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8], [1.2, 0], [-1.2, 0]].map(([ox, oz]) => [p.x + ox, p.z + oz])
        .find(([x, z]) => x > x1 + 0.5 && x < x2 - 0.5 && z > z1 + 0.5 && z < z2 - 0.5 && !blocked(x, z, y - 0.1, y + 0.4));
      if (spot) hold(I, c, V(spot[0], y + 0.07, spot[1] - half), V(spot[0], y + 0.07, spot[1] + half), V(0, 1, 0), 'station');
    }
  }
  // Each brace strap is a use (after the station handles, so it gets none): shown at action stations or a brace call,
  // or while you are in it.
  for (const b of braces) {
    const u = I.use('brace', 'Strap in', b.eye.x, b.eye.z, () => BRACE.floater?.strap(b), { r: 1.5, y: b.eye.y });
    Object.defineProperty(u, 'label', { get: () => (BRACE.floater?.strapped === b ? 'Unstrap' : 'Strap in for the hit') });
    u.hidden = () => !BRACE.floater?.offer(b);
    u.room = c.id;
  }
  (I.braces ??= []).push(...braces);
}

// --- moving by them -------------------------------------------------------------------------------------------------

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();
const _e = new THREE.Vector3(), _f2 = new THREE.Vector3(), _j = new THREE.Vector3(), _dir = new THREE.Vector3();
// The layout's `weapons.brace` when it has none (tools/carrier-v2.mjs says what each is).
const BRACED = { eta: 6, hold: 1.5, kick: 8, shell: 2.5, glance: 1.2, fade: 25, grip: 4.5, feet: 3.5, hurt: 4.2, per: 0.3, heal: 0.15 };

export class Floater {
  /** `G`: the game in hand (main.mjs): `C`, `ship` (the air), `sfx`, and `walk` (the deck you are on). */
  constructor(G) {
    this.G = G;
    this.gas = HOLD.gas;
    this.held = null; // { h, t, off }: the hold you have, where along it, and your eye's place from your hand
    this.charge = -1; // seconds W has been held while holding on (-1: not pushing)
    this.ignore = null; // the hold you just pushed off from, not to be caught again at once
    this.ignoreT = 0;
    this.near = null; // the hold in reach this frame: { h, t, d, p }
    this.puffing = false;
    this.puffer = false; // the suit's puffer: off until you switch it on (P), for when you are adrift out of reach of anything
    this.surface = null; // the wall, deck or deckhead in reach this frame, adrift: { n } (its normal, into the room)
    this.was = new Set(); // last frame's keys, for presses and releases
    this.last = new THREE.Vector3();
    // Where your hand would go: a soft glow (a hint, not a thing) on the hold in reach, a little ahead where you look.
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: '#ffd77a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.marker.visible = false;
    this.markT = 0;
    this.marker.userData.live = true;
    // Clipped on (a room with safety wires, `I.tethers`: the airless hangar's gangway): the wire's point nearest you, and
    // your lanyard to it, drawn from your chest.
    this.clip = null;
    this.lanyard = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ff7a30' }));
    this.lanyard.visible = false;
    this.lanyard.frustumCulled = false;
    this.lanyard.userData.live = true;
    // Brace for impact: the strap you are in, how hurt you are (0 to 1: 1 blacks you out), the red flash of a knock.
    this.strapped = null;
    this.hurt = 0;
    this.flash = 0;
    this.hurtEl = document.getElementById('c-hurt');
    this.braceEl = document.getElementById('c-brace');
    this.html = '';
    this.swapT = 0; // a beat between reaching from one hold to the next
    this.settle = false; // take the nearest hold next frame (off a ladder)
    this.refillNear = null; // { d, p } the nearest refill point on your deck, while the bottle is low
    BRACE.floater = this;
    REFILL.floater = this;
    G.C?.bus?.on('jolt', (e) => this.jolt(e));
  }

  /** The layout's brace numbers. */
  get B() {
    return this.G.guns?.W?.brace ?? BRACED;
  }

  /** Dropped: a jump to somewhere else (a teleport, a fade, another deck). */
  reset() {
    this.held = null;
    this.strapped = null;
    this.charge = -1;
    this.near = null;
    this.marker.visible = false;
    this.clip = null;
    this.lanyard.visible = false;
  }

  // --- brace for impact ---------------------------------------------------------------------------------------------

  /** Whether brace strap `b` offers itself: while you are in it, or (in none) at action stations or a brace call. */
  offer(b) {
    return this.strapped === b || (!this.strapped && !!(this.G.guns?.brace || this.G.ship?.stations));
  }

  /** E at a brace strap: into it, your back to the wall, facing out; or out of it again, still, by it. */
  strap(b) {
    const walker = this.G.walker;
    if (this.strapped === b) {
      this.strapped = null;
      walker.vel.set(0, 0, 0);
      this.G.sfx?.cue('clunk', { vol: 0.25 });
      return;
    }
    this.held = null;
    this.charge = -1;
    this.strapped = b;
    walker.vel.set(0, 0, 0);
    walker.yaw = Math.atan2(-b.n.x, -b.n.z);
    walker.pitch = 0;
    this.G.sfx?.cue('clunk', { vol: 0.45 });
  }

  /** A hit's kick through the structure (integrity.mjs `impact`, on the bus): `at` and `dir` in the ship's frame, `kind`
   *  'kick' (a torpedo), 'shell' or 'glance'. The ship jumps along `dir` and you, unless something holds you, do not:
   *  aboard, you are thrown against it. */
  jolt({ at: p, dir, kind }) {
    const B = this.B, walker = this.G.walker;
    if (!walker?.float || this.G.mode?.() !== 'walk' || this.G.fading) return;
    const size = (B[kind] ?? B.shell) / (1 + walker.pos.distanceTo(p) / B.fade);
    if (size < 0.3) return;
    if (this.strapped) return void (walker.pitch += Math.min(0.05, size * 0.008));
    const limit = this.held ? (this.held.foot ? B.feet : B.grip) : 0;
    if (this.held && size <= limit) {
      walker.pitch += Math.min(0.08, size * 0.015);
      this.G.sfx?.cue('clunk', { vol: Math.min(0.6, 0.15 + size * 0.06) });
      return;
    }
    if (this.held) {
      this.ignore = this.held.h;
      this.ignoreT = 1;
      this.held = null;
      this.charge = -1;
      this.G.dc?.say(null, 'The hit tore your hold away.', 0, 3);
    }
    // Against the kick, and a little off it (the structure rings, it does not move as one), the same for the same hit.
    const w = Math.sin(p.x * 12.9898 + p.y * 4.1414 + p.z * 78.233) * 43758.5453, r = w - Math.floor(w);
    _j.copy(dir).multiplyScalar(-size);
    _j.y += (r - 0.5) * size * 0.5;
    _j.x += (0.5 - ((r * 7.31) % 1)) * size * 0.3;
    walker.vel.add(_j);
    walker.pitch += Math.min(0.15, size * 0.03);
  }

  /** You met a wall `into` m/s fast: past `hurt`, it hurts; a whole injury blacks you out. */
  injure(into) {
    const B = this.B, ship = this.G.ship;
    if (into <= B.hurt) return;
    const add = (into - B.hurt) * B.per;
    this.hurt = Math.min(1.2, this.hurt + add);
    this.flash = Math.min(1, 0.35 + add * 2.5);
    if (this.hurt >= 1 && ship && !ship.rescuing) {
      this.hurt = 0.4; // patched up
      const sick = [...this.G.C.rooms.values()].find((r) => r.system === 'medical');
      return ship.rescue(ship.node(this.G.walk?.roomNow?.()), sick?.id ?? null);
    }
    this.G.dc?.say(null, into > B.hurt + 2 ? `You hit the bulkhead hard (${into.toFixed(1)} m/s).` : `You hit the bulkhead (${into.toFixed(1)} m/s). That hurt.`, 0, 3);
  }

  /** Every frame, in every mode (main.mjs): an injury heals, the red edge fades, and the brace countdown. */
  tick(dt, mode) {
    const B = this.B;
    this.hurt = Math.max(0, this.hurt - (B.heal / 60) * dt);
    this.flash = Math.max(0, this.flash - dt * 1.2);
    if (this.hurtEl) {
      const o = mode === 'walk' ? Math.max(this.flash, this.hurt > 0.25 ? (this.hurt - 0.25) * 0.6 : 0) : 0;
      const t = o > 0.01 ? o.toFixed(2) : '0';
      if (this.hurtEl.style.opacity !== t) this.hurtEl.style.opacity = t;
    }
    const br = this.G.guns?.brace, el = this.braceEl;
    if (!el) return;
    const show = !!br && mode !== 'cutaway';
    el.hidden = !show;
    if (!show) return;
    const walker = this.G.walker;
    const what = mode !== 'walk' ? '' : !walker.float ? 'hold on' : this.strapped ? 'strapped in' : this.held ? 'holding on · strap in if you can (E)' : 'take hold or strap in (E)';
    const html = `BRACE BRACE BRACE<b>${br.eta > 0 ? `${br.eta.toFixed(1)} s` : 'IMPACT'}</b>${what ? `<small>${what}</small>` : ''}`;
    if (html !== this.html) (el.innerHTML = html), (this.html = html);
  }

  /** E at a refill point: the bottle topped up. */
  refill() {
    const was = this.gas;
    this.gas = HOLD.gas;
    this.G.sfx?.cue('hiss', { dur: 0.9, vol: 0.35 });
    this.G.dc?.say(null, was < HOLD.gas * 0.98 ? 'Puffer topped up.' : 'Your puffer is full.', 0, 2);
  }

  /** Off a ladder (seats/walk.mjs): take the nearest hold next frame, so you arrive holding on. */
  arrive() {
    this.reset();
    this.settle = true;
  }

  /** Not weightless this frame: the bottle tops up from the ship where there is weight. */
  idle(dt) {
    this.gas = Math.min(HOLD.gas, this.gas + (HOLD.gas / HOLD.refill) * dt);
    this.refillNear = null;
    this.hauling = false;
    REFILL.glow.color.set('#2fb8cc').multiplyScalar(0.55);
    if (this.held || this.charge >= 0) this.reset();
    this.marker.visible = false;
    this.puffing = false;
    this.clip = null;
    this.lanyard.visible = false;
  }

  /** The hold in reach you would take, or null: { h, t, d, p, foot }. Your hands reach `reach` from your eye; with `body`
   *  your feet reach a hold at the deck under you too (a foot rail, a deck handle: `foot`), from as low as `HOLD.legs`
   *  below your eye. With `look` (where you look), the one most ahead of you wins over a nearer one behind, and the
   *  point taken on it is the one nearest a spot just ahead of your eye, so the hint shows where you can see it. */
  find(I, eye, skip = null, reach = HOLD.reach, body = false, look = null) {
    let best = null, bs = Infinity;
    for (const h of I.holds ?? []) {
      if (h === skip) continue;
      if (Math.min(h.a.x, h.b.x) - reach > eye.x || Math.max(h.a.x, h.b.x) + reach < eye.x) continue;
      if (Math.min(h.a.z, h.b.z) - reach > eye.z || Math.max(h.a.z, h.b.z) + reach < eye.z) continue;
      _d.subVectors(h.b, h.a);
      // The point of you nearest the hold: your eye, or with `body` anywhere down to your feet.
      _f2.copy(eye);
      if (body && h.n.y > 0.5) _f2.y = Math.max(eye.y - HOLD.legs, Math.min(eye.y, (h.a.y + h.b.y) / 2));
      const foot = _f2.y < eye.y - 0.8;
      // Where along it: nearest your eye, or (looking) nearest a spot 0.7 m ahead of it, if that is still in reach.
      let t = Math.min(1, Math.max(0, _d.dot(_p.subVectors(_f2, h.a)) / (h.len * h.len || 1)));
      if (look && !foot) {
        const ta = Math.min(1, Math.max(0, _d.dot(_p.copy(_f2).addScaledVector(look, 0.7).sub(h.a)) / (h.len * h.len || 1)));
        if (_p.copy(h.a).addScaledVector(_d, ta).distanceTo(_f2) <= reach) t = ta;
      }
      _p.copy(h.a).addScaledVector(_d, t);
      const d = _p.distanceTo(_f2);
      if (d > (foot ? 0.6 : reach)) continue;
      const cos = look && d > 1e-3 ? _j.subVectors(_p, _f2).dot(look) / d : 0;
      if (d > HOLD.reach && cos < 0.8) continue; // further than an arm: only the one you look at
      const sc = d * (1.3 - 0.5 * cos);
      if (sc < bs) (bs = sc), (best = { h, t, d, p: _p.clone(), foot });
    }
    return best;
  }

  /** A frame of you weightless (Walker.frame, after the mouse). `f`: the input frame. */
  frame(walker, f, dt) {
    walker.drift += dt;
    walker.bob = 0;
    const I = walker.interior, keys = f.keys, was = this.was;
    const down = (k) => keys.has(k), pressed = (k) => keys.has(k) && !was.has(k), released = (k) => !keys.has(k) && was.has(k);
    const shift = down('ShiftLeft') || down('ShiftRight');
    // Moved by something else (a fade, another deck): let go. A hold keeps its deck on its rail (`held.h.I`), a strap on itself.
    const on = this.held ? this.held.h.I : this.strapped?.I;
    if (on && (on !== I || walker.pos.distanceTo(this.last) > 2)) this.reset();
    this.ignoreT = Math.max(0, this.ignoreT - dt);
    this.swapT = Math.max(0, this.swapT - dt);
    this.glow(walker, dt);
    // In a brace strap: held to the wall, whatever the drive or a hit does. E (its use) lets you go.
    if (this.strapped) {
      walker.vel.set(0, 0, 0);
      walker.pos.copy(this.strapped.eye).y -= EYE;
      this.near = null;
      this.marker.visible = false;
      this.was = new Set(keys);
      this.last.copy(walker.pos);
      return;
    }
    // Off a ladder: you come out of the trunk with a hand already on the nearest hold.
    if (this.settle) {
      this.settle = false;
      const n = this.find(I, walker.eye(_e), null, 1.7, true);
      if (n) this.grab(walker, n, 0, true);
    }
    // Where you look (forward, with the pitch) and your right.
    walker.forward(_f);
    _r.set(Math.cos(walker.yaw), 0, -Math.sin(walker.yaw));
    this.puffing = false;
    this.hauling = false;
    if (pressed('KeyP')) this.togglePuffer();
    if (this.held) this.holding(walker, dt, { down, pressed, released, shift });
    else this.drifting(walker, dt, { down, pressed, released, shift });
    this.tether(walker, dt);
    this.was = new Set(keys);
    this.last.copy(walker.pos);
    // The glow where your hand would go (pulsing gently), or faint where it is.
    const m = this.marker, show = this.held ?? this.near;
    this.markT += dt;
    if (show) {
      if (m.parent !== I.group) I.group.add(m);
      m.position.copy(this.held ? _p.copy(this.held.h.a).lerp(this.held.h.b, this.held.t) : show.p);
      m.material.opacity = this.held ? 0.18 : 0.75 + 0.2 * Math.sin(this.markT * 5);
      m.scale.setScalar(this.held ? 0.12 : 0.24 + 0.05 * Math.sin(this.markT * 5));
    }
    m.visible = !!show;
  }

  /** The refill points' rings: steady while your bottle is fine, bright and pulsing when it is low; and the nearest one
   *  on this deck, for the HUD. */
  glow(walker, dt) {
    const low = this.gas < HOLD.gas * HOLD.low;
    this.glowT = (this.glowT ?? 0) + dt;
    const k = low ? 1.4 + 0.9 * Math.sin(this.glowT * 6) : 0.55;
    REFILL.glow.color.set('#2fb8cc').multiplyScalar(Math.max(0.3, k));
    this.refillNear = null;
    if (!low) return;
    const eye = walker.eye(_e);
    for (const r of walker.interior.refills ?? []) {
      const d = r.p.distanceTo(eye);
      if (!this.refillNear || d < this.refillNear.d) this.refillNear = { d, p: r.p };
    }
  }

  grab(walker, n, speed, quiet = false) {
    const eye = walker.eye(_e);
    this.held = { h: n.h, t: n.t, off: eye.clone().sub(n.p), foot: !!n.foot };
    walker.vel.set(0, 0, 0);
    this.charge = -1;
    this.G.sfx?.cue('clunk', { vol: quiet ? 0.1 : Math.min(1, 0.12 + speed * 0.12) });
    if (speed > 2.2) walker.pitch += Math.min(0.12, (speed - 2.2) * 0.05); // the jolt as your arm takes it
  }

  /** Holding on. W: held, a push off where you look when you let go, harder the longer you held it; Shift with W, a
   *  big push at once. A D S: hand over hand along the hold (S back the way you face, A and D to the sides), and on to
   *  the next hold when it ends or runs across the way you want (`reachFor`). */
  holding(walker, dt, { down, pressed, released, shift }) {
    const H = this.held;
    walker.vel.set(0, 0, 0);
    let fx = 0, fz = 0;
    if (down('KeyS')) fz += 1;
    if (down('KeyA')) fx -= 1;
    if (down('KeyD')) fx += 1;
    if ((fx || fz) && this.charge < 0) {
      _dir.copy(_r).multiplyScalar(fx).addScaledVector(_f, -fz).normalize();
      this.pull(walker, _dir, dt, (shift ? HOLD.fast : HOLD.pull) * (this.clip ? HOLD.gangway : 1));
    }
    // Your eye comes in to within an arm's length of your hand; standing in a foot rail, upright over it.
    if (this.held.foot) H.off.lerp(_d.set(0, HOLD.stand, 0), Math.min(1, dt * 3));
    else {
      const L = H.off.length();
      if (L > 0.7) H.off.multiplyScalar(Math.max(0.7, L - dt * 1.8) / L);
    }
    const grip = _e.copy(H.h.a).lerp(H.h.b, H.t);
    walker.pos.copy(grip).add(H.off).y -= EYE;
    // W: a tap is a good push; held, harder when you let go. Shift with it, a big push at once.
    if (!this.charging(dt, { down, pressed, released, shift })) return;
    this.pushOff(walker, H.h.n, H.h.free, shift);
    this.ignore = H.h;
    this.ignoreT = 0.6;
    this.held = null;
  }

  /** W for a push: true on the frame you push (W let go, or W with Shift). `charge` counts how long it was held. */
  charging(dt, { down, pressed, released, shift }) {
    if (pressed('KeyW')) this.charge = 0;
    if (this.charge >= 0 && down('KeyW')) this.charge += dt;
    return this.charge >= 0 && (released('KeyW') || (down('KeyW') && shift));
  }

  /** Off what you hold or touch (`n`: its surface's normal, into the room; `free`: a bar you can push off any way)
   *  where you look, as hard as the charge says. Looking into its wall or deck you go along it, not through it. */
  pushOff(walker, n, free, shift) {
    const k = Math.min(1, Math.max(0, this.charge) / HOLD.charge);
    let speed = shift ? HOLD.hard : HOLD.push[0] + (HOLD.push[1] - HOLD.push[0]) * k;
    if (this.clip) speed = Math.min(speed, HOLD.leash); // on the gangway: your lanyard will catch you
    const into = _d.copy(_f).dot(n);
    if (into < 0 && !free) _d.addScaledVector(n, -into * 1.05);
    if (_d.lengthSq() < 0.04) _d.copy(n);
    walker.vel.copy(_d.normalize()).multiplyScalar(speed);
    this.charge = -1;
    this.G.sfx?.cue('clunk', { vol: 0.1 + 0.04 * speed });
  }

  /** P: the suit's puffer on or off. Off, you move yourself: push off, pull along, take hold. */
  togglePuffer() {
    this.puffer = !this.puffer;
    this.G.sfx?.cue('clunk', { vol: 0.15 });
    this.G.dc?.say(null, this.puffer ? 'Suit puffer on: W A S D puff, Space brakes.' : 'Suit puffer off.', 0, 2.5);
  }

  /** The wall, deck or deckhead within `HOLD.surface` of your eye (the nearest), its normal into the room; or a
   *  piece of furniture's side. Null if none. */
  touching(walker) {
    const C = this.G.C, I = walker.interior, eye = walker.eye(_e), R = HOLD.surface;
    const r = roomAt(C, this.G.walk?.deckNow, walker.pos.x, walker.pos.z);
    let best = null, bd = R;
    const take = (d, x, y, z) => {
      if (d < bd) (bd = d), (best = (best ?? { n: new THREE.Vector3() })), best.n.set(x, y, z);
    };
    const fy = I.floorY;
    take(eye.y - fy - 0.35, 0, 1, 0); // the deck, reached with a foot or a hand
    if (r) {
      take(fy + (r.h ?? 3) - eye.y, 0, -1, 0);
      take(eye.x - r.x[0], 1, 0, 0);
      take(r.x[1] - eye.x, -1, 0, 0);
      take(eye.z - r.z[0], 0, 0, 1);
      take(r.z[1] - eye.z, 0, 0, -1);
    }
    for (const c of I.colliders ?? []) {
      if (eye.y < c.min.y - 0.4 || eye.y > c.max.y + 0.6) continue;
      const nx = Math.min(c.max.x, Math.max(c.min.x, eye.x)), nz = Math.min(c.max.z, Math.max(c.min.z, eye.z));
      const ex = eye.x - nx, ez = eye.z - nz, d = Math.hypot(ex, ez);
      if (d > 1e-3 && d < bd) take(d, ex / d, 0, ez / d);
    }
    return best;
  }

  /** Hand over hand along the hold you have, toward `dir` (level or not), at `speed`; at its end, or when it runs across
   *  `dir`, reach for the next one that way. */
  pull(walker, dir, dt, speed) {
    const H = this.held, h = H.h;
    const u = _p.subVectors(h.b, h.a).divideScalar(h.len || 1), s = h.len > 0.3 ? dir.dot(u) : 0;
    if (Math.abs(s) > 0.35) {
      const t = H.t + (Math.sign(s) * speed * Math.min(1, Math.abs(s) * 1.4) * dt) / h.len;
      if (t >= 0 && t <= 1) return void (H.t = t);
      H.t = Math.min(1, Math.max(0, t));
    }
    if (this.swapT > 0) return;
    const grip = _j.copy(h.a).lerp(h.b, H.t);
    const next = this.reachFor(walker.interior, grip, dir, h);
    if (!next) return;
    H.off.add(grip.sub(next.p)); // your eye stays where it is; it comes in to the new hand as you pull on
    H.h = next.h;
    H.t = next.t;
    H.foot = H.foot && next.h.n.y > 0.5;
    this.swapT = Math.min(0.35, next.d / (speed * 2));
    this.G.sfx?.cue('clunk', { vol: 0.06 });
  }

  /** The hold to reach for from `grip` toward `dir`: within `HOLD.swap` of your hand and ahead of it that way, the
   *  nearest and the most in line (one that runs the way you are going, the gangway's next length rather than a spur's
   *  rail, wins a tie). Null if there is none. */
  reachFor(I, grip, dir, skip) {
    let best = null, score = Infinity;
    const R = HOLD.swap, aim = _f2.copy(grip).addScaledVector(dir, 0.6);
    for (const h of I.holds ?? []) {
      if (h === skip) continue;
      if (Math.min(h.a.x, h.b.x) - R > grip.x || Math.max(h.a.x, h.b.x) + R < grip.x) continue;
      if (Math.min(h.a.z, h.b.z) - R > grip.z || Math.max(h.a.z, h.b.z) + R < grip.z) continue;
      if (Math.min(h.a.y, h.b.y) - R > grip.y || Math.max(h.a.y, h.b.y) + R < grip.y) continue;
      _d.subVectors(h.b, h.a);
      const t = Math.min(1, Math.max(0, _d.dot(_p.subVectors(aim, h.a)) / (h.len * h.len || 1)));
      _p.copy(h.a).addScaledVector(_d, t);
      const v = _p.clone().sub(grip), d = v.length();
      if (d > R || d < 0.05) continue;
      const ahead = v.dot(dir) / d;
      if (ahead < 0.45) continue;
      const runs = h.len > 0.3 ? Math.abs(_d.dot(dir)) / h.len : 0;
      const sc = d * (1.7 - ahead) - runs * 0.35;
      if (sc < score) (score = sc), (best = { h, t, d, p: _p.clone() });
    }
    return best;
  }

  /** Adrift. You keep your course until a wall stops you (sliding along it, what you had into it gone) or you take a
   *  hold, and only Space takes one: the hold in reach, or one you look at further off (`HOLD.catch`: you reach out
   *  and pull yourself in to it); with none, clipped on, haul yourself in on your lanyard. W by a wall, the deck or the
   *  deckhead pushes you off it (no hold needed). The puffer is off unless you switch it on (P): then WASD puff and
   *  Space brakes; off, in air, WASD swim, very slowly. */
  drifting(walker, dt, keys) {
    const { down, pressed, shift } = keys;
    const v = walker.vel, speed0 = v.length();
    v.addScaledVector(walker.shove, dt); // under a drive, nothing holds you but your hands
    const eye = walker.eye(_e);
    const n = (this.near = this.find(walker.interior, eye, this.ignoreT > 0 ? this.ignore : null, HOLD.catch, true, _f));
    if (down('Space') && n) return this.grab(walker, n, speed0); // held as you drift up to one, it takes it
    // By a surface: W pushes off it, as off a hold (a tap a good push, held harder, Shift a big one).
    const S = (this.surface = this.touching(walker));
    if (!S && this.charge >= 0 && !down('KeyW')) this.charge = -1;
    if (S && (this.charge >= 0 || pressed('KeyW'))) {
      if (this.charging(dt, keys)) this.pushOff(walker, S.n, false, shift);
      else {
        v.multiplyScalar(Math.max(0, 1 - dt * 4)); // a hand on it while you gather yourself
        const hit = this.move(walker, v.x * dt, v.y * dt, v.z * dt);
        if (hit.any) v.multiplyScalar(HOLD.scrape);
      }
      return;
    }
    let fx = 0, fz = 0;
    if (down('KeyW')) fz -= 1;
    if (down('KeyS')) fz += 1;
    if (down('KeyA')) fx -= 1;
    if (down('KeyD')) fx += 1;
    const air = this.G.ship?.airOf?.(this.G.walk?.roomNow?.()) ?? 101;
    if (down('Space') && this.clip) {
      // Clipped on: hand over hand up your lanyard to the wire, and the gangway's rail under it.
      _d.subVectors(this.clip, eye);
      const L = _d.length();
      if (L > 0.5) {
        _d.divideScalar(L);
        const along = v.dot(_d), want = Math.min(HOLD.haul[1], L * 1.2);
        v.addScaledVector(_d, Math.max(0, Math.min(want - along, HOLD.haul[0] * dt)));
        v.addScaledVector(_p.copy(v).addScaledVector(_d, -v.dot(_d)), -Math.min(1, dt * 2)); // the swing off the line damps
      } else v.multiplyScalar(Math.max(0, 1 - dt * 3));
      this.hauling = true;
    } else if (this.puffer && down('Space') && speed0 > 0.01 && this.gas > 0) {
      const dv = Math.min(speed0, HOLD.brake * dt, this.gas);
      v.multiplyScalar((speed0 - dv) / speed0);
      this.gas -= dv;
      this.puffing = true;
    } else if (fx || fz) {
      _d.copy(_r).multiplyScalar(fx).addScaledVector(_f, -fz).normalize();
      if (this.puffer && this.gas > 0) {
        const dv = Math.min(HOLD.puff * dt, this.gas);
        v.addScaledVector(_d, dv);
        this.gas -= dv;
        this.puffing = true;
      } else if (air > 50 && v.dot(_d) < HOLD.swim[1]) v.addScaledVector(_d, HOLD.swim[0] * dt); // swimming in air
    }
    if (this.puffing && !this.puffT) (this.puffT = 0.25), this.G.sfx?.cue('hiss', { dur: 0.3, vol: 0.25 });
    this.puffT = Math.max(0, (this.puffT ?? 0) - dt);
    const hit = this.move(walker, v.x * dt, v.y * dt, v.z * dt);
    if (hit.any) {
      const into = hit.into;
      v.multiplyScalar(HOLD.scrape); // a wall met takes most of your slide along it
      if (into > 1.2) this.G.sfx?.cue('clunk', { vol: Math.min(1, 0.2 + into * 0.15) });
      if (into > 2.5) walker.pitch += Math.min(0.1, (into - 2.5) * 0.04);
      this.injure(into);
    }
  }

  /** Clipped to a safety wire (`I.tethers`, each `{ a, b, room }` in the deck's frame: the airless hangar's gangway,
   *  sets/hangar.mjs): in a room that has them, your lanyard runs to the nearest point of the nearest one and slides
   *  along it, and you get no further than `HOLD.tether` from it. Going out against it, the line goes taut and takes
   *  the speed you had away from it (gently: a lanyard has give, so it never hurts). */
  tether(walker) {
    const I = walker.interior, r = roomAt(this.G.C, this.G.walk?.deckNow, walker.pos.x, walker.pos.z);
    const wires = r && I.tethers?.filter((t) => t.room === r.id);
    if (!wires?.length) {
      this.clip = null;
      this.lanyard.visible = false;
      return;
    }
    const eye = walker.eye(_e);
    let best = null, bd = Infinity;
    for (const t of wires) {
      _d.subVectors(t.b, t.a);
      const L2 = _d.lengthSq() || 1, u = Math.min(1, Math.max(0, _d.dot(_p.subVectors(eye, t.a)) / L2));
      _p.copy(t.a).addScaledVector(_d, u);
      const d = _p.distanceTo(eye);
      if (d < bd) (bd = d), (best = (best ?? new THREE.Vector3()).copy(_p));
    }
    this.clip = best;
    if (bd > HOLD.tether) {
      _d.subVectors(eye, best).divideScalar(bd);
      eye.copy(best).addScaledVector(_d, HOLD.tether);
      walker.pos.copy(eye).y -= EYE;
      const out = walker.vel.dot(_d);
      if (out > 0) {
        walker.vel.addScaledVector(_d, -out * 1.25); // a little spring back off the line's stretch
        if (out > 0.6) this.G.sfx?.cue('clunk', { vol: Math.min(0.5, 0.1 + out * 0.1) });
      }
    }
    // The lanyard: from your chest, just under your eye and a little ahead, to the wire.
    const pos = this.lanyard.geometry.attributes.position;
    walker.forward(_f2);
    pos.setXYZ(0, eye.x + _f2.x * 0.25, eye.y - 0.45, eye.z + _f2.z * 0.25);
    pos.setXYZ(1, best.x, best.y, best.z);
    pos.needsUpdate = true;
    if (this.lanyard.parent !== I.group) I.group.add(this.lanyard);
    this.lanyard.visible = true;
  }

  /** Moves your eye by (dx, dy, dz) in the deck's frame: the walls stop you on x and z (at your eye's height), the deck
   *  and the deckhead on y, and a door's lintel stops you going through it with your head up. Each axis you are
   *  stopped on loses its speed. Returns { any, into }: whether anything stopped you, and how fast you met it. */
  move(walker, dx, dy, dz) {
    const p = walker.pos, v = walker.vel, I = walker.interior, C = this.G.C, deck = this.G.walk?.deckNow;
    const out = { any: false, into: 0 };
    const stop = (k) => {
      out.into = Math.max(out.into, Math.abs(v[k]));
      v[k] = 0;
      out.any = true;
    };
    const x0 = p.x, z0 = p.z, r0 = roomAt(C, deck, x0, z0);
    if (dx && this.slide(walker, dx, 0)) stop('x');
    if (dz && this.slide(walker, 0, dz)) stop('z');
    let r = roomAt(C, deck, p.x, p.z);
    const eye = p.y + EYE + dy;
    if (!r && r0 && !this.inDoor(deck, p.x, p.z)) {
      // Out of every room and not in a doorway: through a gap in a wall that should not be there. Back you come.
      p.x = x0;
      p.z = z0;
      if (dx) stop('x');
      if (dz) stop('z');
      r = r0;
    } else if ((!r || r !== r0) && eye > I.floorY + HOLD.door + 0.05) {
      // Out of the room (through a door, or into the gap between two rooms) with your head above the door's lintel:
      // back to where you were along the deck.
      p.x = x0;
      p.z = z0;
      if (dx) stop('x');
      if (dz) stop('z');
      r = roomAt(C, deck, p.x, p.z);
    }
    const lo = I.floorY + 0.45, hi = I.floorY + (r ? (r.h ?? 3) - 0.3 : HOLD.door);
    const y = Math.min(hi, Math.max(lo, eye));
    if (Math.abs(y - eye) > 1e-6 && Math.abs(dy) > 1e-9) stop('y');
    p.y = y - EYE;
    return out;
  }

  /** Whether (x, z) on `deck` is in the doorway between two walkable rooms (the layout's `doors`), from wall to wall. */
  inDoor(deck, x, z) {
    const C = this.G.C;
    const list = ((this.doorways ??= new Map()).get(deck)) ?? this.doorways.set(deck, C.L.doors.flatMap((d) => {
      const [A, B] = d.between.map((id) => C.rooms.get(id));
      if (!A || !B || A.deck !== deck || B.deck !== deck || A.access !== 'walk' || B.access !== 'walk') return [];
      const w = (d.w ?? 1.6) / 2 + 0.1;
      for (const [P, Q] of [[A, B], [B, A]]) {
        if (Math.abs(P.x[1] - Q.x[0]) < 1.6) return [{ x: [P.x[1] - 0.5, Q.x[0] + 0.5], z: [d.at - w, d.at + w] }];
        if (Math.abs(P.z[1] - Q.z[0]) < 1.6) return [{ x: [d.at - w, d.at + w], z: [P.z[1] - 0.5, Q.z[0] + 0.5] }];
      }
      return [];
    })).get(deck);
    return list.some((g) => x >= g.x[0] && x <= g.x[1] && z >= g.z[0] && z <= g.z[1]);
  }

  /** Walker.slide with the walls met at your eye's height, not your feet's (weightless, you may be anywhere between the
   *  deck and the deckhead). True if a wall pushed you back along the axis you moved on. */
  slide(walker, dx, dz) {
    const p = walker.pos;
    p.x += dx;
    p.z += dz;
    const want = { x: p.x, z: p.z };
    const y = p.y + EYE;
    for (const c of walker.interior.colliders) {
      if (y < c.min.y - 0.25 || y > c.max.y + 0.25) continue;
      const nx = Math.min(c.max.x, Math.max(c.min.x, p.x)), nz = Math.min(c.max.z, Math.max(c.min.z, p.z));
      const ex = p.x - nx, ez = p.z - nz, d2 = ex * ex + ez * ez;
      if (d2 >= R * R) continue;
      if (d2 < 1e-6) {
        if (dx) p.x = dx > 0 ? c.min.x - R : c.max.x + R;
        else p.z = dz > 0 ? c.min.z - R : c.max.z + R;
        continue;
      }
      const d = Math.sqrt(d2);
      p.x = nx + (ex / d) * R;
      p.z = nz + (ez / d) * R;
    }
    return dx ? Math.abs(p.x - want.x) > 1e-4 : Math.abs(p.z - want.z) > 1e-4; // pushed back along the axis moved
  }

  /** The line for the top of the screen. */
  status(walker) {
    const hurt = this.hurt > 0.7 ? ' · badly hurt' : this.hurt > 0.4 ? ' · hurt' : this.hurt > 0.12 ? ' · bruised' : '';
    const pct = Math.round((100 * this.gas) / HOLD.gas), R = this.puffer ? this.refillNear : null;
    const where = R ? ` · REFILL ${R.d < 2 ? "here" : `${Math.round(R.d)} m`} (cyan PUFFER GAS rings)` : '';
    const gas = `${this.puffer ? `puffer on ${pct}%${pct === 0 ? ' EMPTY' : ''}` : 'puffer off'}${where}${this.clip ? ' · clipped on' : ''}${hurt}`;
    if (this.strapped) return `weightless · strapped in · ${gas}`;
    if (this.held) return `weightless · ${this.held.foot ? 'feet in a foot rail' : `holding a ${this.held.h.kind === 'rail' ? 'rail' : 'handhold'}`} · ${gas}`;
    const s = walker.vel.length();
    return `weightless · ${this.hauling ? 'hauling in on your lanyard' : s < 0.05 ? 'adrift, still' : `drifting ${s.toFixed(1)} m/s`} · ${gas}`;
  }

  /** What the prompt says when there is nothing to use (E) near you. */
  prompt() {
    if (this.strapped) return { key: 'E', label: 'Unstrap' };
    if (this.held) {
      if (this.charge >= 0) return { key: 'W', label: `Let go to push off ${'▮'.repeat(1 + Math.floor(Math.min(1, this.charge / HOLD.charge) * 4)).padEnd(5, '▯')}` };
      return { key: 'W', label: `Push off where you look (hold for harder, Shift: big push) · A D S pull yourself along${this.clip ? ' · clipped on' : ''}` };
    }
    if (this.charge >= 0 && this.surface) return { key: 'W', label: `Let go to push off ${'▮'.repeat(1 + Math.floor(Math.min(1, this.charge / HOLD.charge) * 4)).padEnd(5, '▯')}` };
    if (this.near) return { key: 'Space', label: this.near.foot ? 'Hook your feet in' : this.near.d > HOLD.reach ? 'Reach for it' : 'Take hold' };
    if (this.surface) return { key: 'W', label: 'Push off the wall where you look (hold for harder)' };
    if (this.clip) return { key: 'Space', label: 'Haul yourself in on your lanyard' };
    if (!this.puffer) return { key: 'P', label: 'Nothing in reach: swim (W A S D, slowly), or switch on your suit puffer' };
    if (this.gas <= 0) return { key: '', label: this.refillNear ? 'Puffer empty: drift to a wall or swim (WASD), then refill at a PUFFER GAS point' : 'Puffer empty: drift to a wall or swim (WASD)' };
    return { key: 'Space', label: 'Brake with the suit puffer · WASD puff · P puffer off' };
  }
}
