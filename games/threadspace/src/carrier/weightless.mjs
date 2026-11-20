// Living weightless (design/ROADMAP.md, phase 4): the handholds in every weightless room, and moving by them.
//
// Build time, `dressHolds(C, I, c, open)` (layout.mjs, for each room with `float`): rails along every wall at two
// heights, broken at doors and windows; grab handles either side of each door; short handles across the deck and the
// deckhead; and a handle by each thing in the room you use (a console, a locker, a ladder). Each is a hold in `I.holds`:
// a segment `a`→`b` in the deck's frame, with `n`, the wall's normal into the room.
//
// Run time, `Floater` (walker.floater, called by Walker.frame while `float`): you are either holding a hold or
// drifting. Holding, you are still (the drive's push doesn't move you); W pushes off along where you look, harder the
// longer you hold it before you let go, Shift with W a hard push; A, D and S pull you along the hold you have, and on
// to the next one at its end. Drifting, you cannot change course: you go where the push sent you until a wall stops
// you (a soft stop) or you catch a hold. Space catches the hold in reach, and with none in reach fires the suit's
// cold-gas puffer against your drift; WASD on the puffer push you gently where you look. Its gas is limited, and topped
// up wherever there is weight (a drum, a hub ring, a walking deck). Drifting slowly past a hold, you take it anyway.
// Out of gas in air you can still swim, very slowly. You move in three dimensions: up to the deckhead, down to the
// deck, through a door only below its lintel.
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
  reach: 1.05, // m from your eye to a hold you can take
  pull: 1.3, // m/s along a hold, hand over hand
  push: [0.7, 3], // m/s: a tap of W, and W held for `charge` seconds
  charge: 1,
  hard: 4, // m/s: Shift with W
  slow: 0.4, // m/s: drifting slower than this past a hold, you take it
  gas: 12, // m/s of the puffer's Δv in a full bottle
  puff: 0.6, // m/s²: the puffer pushing you
  brake: 1.4, // m/s²: the puffer against your drift (Space)
  refill: 4, // s to top the bottle up where there is weight
  swim: [0.1, 0.15], // m/s² and m/s: swimming in air, with no gas
  door: 2.1, // m above the deck: your eye's highest through a door (its lintel is at 2.5)
  legs: 1.5, // m below your eye your feet reach: a foot rail or a deck handle under you
  stand: 1.55, // m: your eye over a foot rail you stand in
};

const RAIL = mat('#d8a530'); // the airless hangar's rails (sets/hangar.mjs) are this yellow too
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
 *  each end (or one in the middle of a short handle). Axis-aligned. */
function hold(I, c, a, b, n, kind) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
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

/** Runs along [a0, b0] with the `gaps` taken out, each run at least `min` long. */
function runs(a0, b0, gaps, min = 0.5) {
  const out = [];
  let cur = a0;
  for (const [a, b] of gaps.slice().sort((p, q) => p[0] - q[0])) {
    if (a - cur >= min) out.push([cur, a]);
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
    // The brace straps: one in each free stretch of wall a metre or more long, and one every five metres along a long
    // one. The lower rail (and an upper one low enough to meet the headrest) breaks for each.
    const free = runs(a0 + 0.5, b0 - 0.5, [...gaps, ...against(y + 0.6), ...against(y + 1.3), ...against(y + 1.9)], 1);
    const mine = [];
    for (const [ra, rb] of free) {
      const k = Math.max(1, Math.round((rb - ra) / 5));
      for (let i = 0; i < k; i++) mine.push(ra + ((i + 0.5) * (rb - ra)) / k);
    }
    const at3 = (u, yy, w) => (alongX ? V(u, yy, line + inward * w) : V(line + inward * w, yy, u));
    for (const u of mine) {
      braceStrap(I, at3, alongX, u, y);
      braces.push({ room: c.id, I, n: n.clone(), eye: at3(u, y + 1.72, 0.55) });
    }
    const strapGaps = mine.map((u) => [u - 0.42, u + 0.42]);
    for (const hy of [1.0, h - 0.5]) for (const [ra, rb] of runs(a0 + 0.4, b0 - 0.4, [...gaps, ...against(y + hy), ...(hy < 2.2 ? strapGaps : [])])) {
      const k = Math.max(1, Math.round((rb - ra + 0.4) / 2.6)), seg = (rb - ra - (k - 1) * 0.4) / k;
      for (let i = 0; i < k; i++) {
        const u0 = ra + i * (seg + 0.4);
        hold(I, c, pt(u0, y + hy), pt(u0 + seg, y + hy), n, 'rail');
      }
    }
    // Upright grab handles either side of each door, on the room's side.
    for (const o of open[side]) if (o.kind === 'door') for (const u of [o.a - 0.2, o.b + 0.2]) {
      if (u > a0 + 0.2 && u < b0 - 0.2) hold(I, c, pt(u, y + 0.7), pt(u, y + 2.1), n, 'door');
    }
  }
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
  const xs = Math.min(w, d) < 4.5 && long === 'z' ? [(x1 + x2) / 2] : lines(x1 + 1, x2 - 1, 2.6);
  const zs = Math.min(w, d) < 4.5 && long === 'x' ? [(z1 + z2) / 2] : lines(z1 + 1, z2 - 1, 2.6);
  const half = 0.25;
  for (const x of xs) for (const z of zs) {
    const across = long === 'z' ? [V(x - half, 0, z), V(x + half, 0, z)] : [V(x, 0, z - half), V(x, 0, z + half)];
    if (!inHole(x, z, 'floor') && !blocked(x, z, y - 0.1, y + 0.4)) hold(I, c, across[0].clone().setY(y + 0.07), across[1].clone().setY(y + 0.07), V(0, 1, 0), 'deck');
    if (!inHole(x, z, 'ceil') && !blocked(x, z, y + h - 0.5, y + h + 0.1)) hold(I, c, across[0].clone().setY(y + h - 0.25), across[1].clone().setY(y + h - 0.25), V(0, -1, 0), 'deckhead');
  }
  // A handle by each thing to use here: upright on the nearest wall if it is within a metre and a half, else across the
  // deck beside it.
  for (const u of I.interactables) {
    const p = u.pos;
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
const _e = new THREE.Vector3(), _f2 = new THREE.Vector3(), _j = new THREE.Vector3();
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
    this.was = new Set(); // last frame's keys, for presses and releases
    this.last = new THREE.Vector3();
    // Where your hand would go: a small glow on the hold in reach.
    this.marker = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd77a', toneMapped: false, transparent: true, opacity: 0.85 }));
    this.marker.visible = false;
    this.marker.userData.live = true;
    // Brace for impact: the strap you are in, how hurt you are (0 to 1: 1 blacks you out), the red flash of a knock.
    this.strapped = null;
    this.hurt = 0;
    this.flash = 0;
    this.hurtEl = document.getElementById('c-hurt');
    this.braceEl = document.getElementById('c-brace');
    this.html = '';
    BRACE.floater = this;
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

  /** Not weightless this frame: the bottle tops up from the ship where there is weight. */
  idle(dt) {
    this.gas = Math.min(HOLD.gas, this.gas + (HOLD.gas / HOLD.refill) * dt);
    if (this.held || this.charge >= 0) this.reset();
    this.marker.visible = false;
    this.puffing = false;
  }

  /** The nearest hold in reach, or null: { h, t, d, p, foot }. Your hands reach `reach` from your eye; with `body`
   *  your feet reach a hold at the deck under you too (a foot rail, a deck handle: `foot`), from as low as `HOLD.legs`
   *  below your eye. */
  find(I, eye, skip = null, reach = HOLD.reach, body = false) {
    let best = null;
    for (const h of I.holds ?? []) {
      if (h === skip) continue;
      if (Math.min(h.a.x, h.b.x) - reach > eye.x || Math.max(h.a.x, h.b.x) + reach < eye.x) continue;
      if (Math.min(h.a.z, h.b.z) - reach > eye.z || Math.max(h.a.z, h.b.z) + reach < eye.z) continue;
      _d.subVectors(h.b, h.a);
      // The point of you nearest the hold: your eye, or with `body` anywhere down to your feet.
      _f2.copy(eye);
      if (body && h.n.y > 0.5) _f2.y = Math.max(eye.y - HOLD.legs, Math.min(eye.y, (h.a.y + h.b.y) / 2));
      const t = Math.min(1, Math.max(0, _d.dot(_p.subVectors(_f2, h.a)) / (h.len * h.len || 1)));
      _p.copy(h.a).addScaledVector(_d, t);
      const d = _p.distanceTo(_f2), foot = _f2.y < eye.y - 0.8;
      if (d <= (foot ? 0.6 : reach) && (!best || d < best.d)) best = { h, t, d, p: _p.clone(), foot };
    }
    return best;
  }

  grab(walker, n, speed) {
    const eye = walker.eye(_e);
    this.held = { h: n.h, t: n.t, off: eye.clone().sub(n.p), foot: !!n.foot };
    walker.vel.set(0, 0, 0);
    this.charge = -1;
    this.G.sfx?.cue('clunk', { vol: Math.min(1, 0.12 + speed * 0.12) });
    if (speed > 2.2) walker.pitch += Math.min(0.12, (speed - 2.2) * 0.05); // the jolt as your arm takes it
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
    // Where you look (forward, with the pitch) and your right.
    walker.forward(_f);
    _r.set(Math.cos(walker.yaw), 0, -Math.sin(walker.yaw));
    this.puffing = false;
    if (this.held) this.holding(walker, dt, { down, pressed, released, shift });
    else this.drifting(walker, dt, { down, shift });
    this.was = new Set(keys);
    this.last.copy(walker.pos);
    // The glow where your hand is, or would go.
    const m = this.marker, show = this.held ?? this.near;
    if (show) {
      if (m.parent !== I.group) I.group.add(m);
      m.position.copy(this.held ? _p.copy(this.held.h.a).lerp(this.held.h.b, this.held.t) : show.p);
      m.material.opacity = this.held ? 0.35 : 0.85;
    }
    m.visible = !!show;
  }

  holding(walker, dt, { down, pressed, released, shift }) {
    const H = this.held, h = H.h;
    walker.vel.set(0, 0, 0);
    // Pull along the hold: A, D and S as a direction, the part of it along the hold.
    let fx = 0, fz = 0;
    if (down('KeyA')) fx -= 1;
    if (down('KeyD')) fx += 1;
    if (down('KeyS')) fz += 1;
    if ((fx || fz) && h.len > 0.4) {
      _d.copy(_r).multiplyScalar(fx).addScaledVector(_f, -fz);
      const u = _p.subVectors(h.b, h.a).divideScalar(h.len), s = _d.dot(u);
      if (Math.abs(s) > 0.3) {
        const sgn = Math.sign(s), t = H.t + (sgn * HOLD.pull * dt) / h.len;
        if (t < 0 || t > 1) {
          // At its end: on to the next hold along, if one is within a hand's reach of the end.
          const end = (t > 1 ? h.b : h.a).clone().addScaledVector(u, sgn * 0.45);
          const next = this.find(walker.interior, end, h, 0.6);
          if (next) {
            const grip = _e.copy(h.a).lerp(h.b, Math.min(1, Math.max(0, t)));
            H.h = next.h;
            H.t = next.t;
            H.foot = H.foot && next.h.n.y > 0.5;
            H.off.add(grip.sub(next.p));
          } else H.t = Math.min(1, Math.max(0, t));
        } else H.t = t;
      }
    }
    // Your eye comes in to within an arm's length of your hand; standing in a foot rail, upright over it.
    if (H.foot) H.off.lerp(_d.set(0, HOLD.stand, 0), Math.min(1, dt * 3));
    else {
      const L = H.off.length();
      if (L > 0.7) H.off.multiplyScalar(Math.max(0.7, L - dt * 1.5) / L);
    }
    const grip = _e.copy(H.h.a).lerp(H.h.b, H.t);
    walker.pos.copy(grip).add(H.off).y -= EYE;
    // W: the longer you hold it, the harder you push off when you let go. Shift with it, a hard push at once.
    if (pressed('KeyW')) this.charge = 0;
    if (this.charge >= 0 && down('KeyW')) this.charge += dt;
    const go = this.charge >= 0 && (released('KeyW') || (down('KeyW') && shift));
    if (go) {
      const k = Math.min(1, this.charge / HOLD.charge);
      const speed = shift ? HOLD.hard : HOLD.push[0] + (HOLD.push[1] - HOLD.push[0]) * k;
      walker.vel.copy(_f).multiplyScalar(speed);
      this.ignore = H.h;
      this.ignoreT = 0.6;
      this.held = null;
      this.charge = -1;
      this.G.sfx?.cue('clunk', { vol: 0.1 + 0.05 * speed });
    }
  }

  drifting(walker, dt, { down, shift }) {
    const v = walker.vel, speed0 = v.length();
    v.addScaledVector(walker.shove, dt); // under a drive, nothing holds you but your hands
    const eye = walker.eye(_e);
    const n = (this.near = this.find(walker.interior, eye, this.ignoreT > 0 ? this.ignore : null, HOLD.reach, true));
    // Space: take the hold in reach; with none, the puffer against your drift.
    if (down('Space') && n) return this.grab(walker, n, speed0);
    let fx = 0, fz = 0;
    if (down('KeyW')) fz -= 1;
    if (down('KeyS')) fz += 1;
    if (down('KeyA')) fx -= 1;
    if (down('KeyD')) fx += 1;
    const air = this.G.ship?.airOf?.(this.G.walk?.roomNow?.()) ?? 101;
    if (down('Space') && speed0 > 0.01 && this.gas > 0) {
      const dv = Math.min(speed0, HOLD.brake * dt, this.gas);
      v.multiplyScalar((speed0 - dv) / speed0);
      this.gas -= dv;
      this.puffing = true;
    } else if (fx || fz) {
      _d.copy(_r).multiplyScalar(fx).addScaledVector(_f, -fz).normalize();
      if (this.gas > 0) {
        const dv = Math.min(HOLD.puff * dt, this.gas);
        v.addScaledVector(_d, dv);
        this.gas -= dv;
        this.puffing = true;
      } else if (air > 50 && v.dot(_d) < HOLD.swim[1]) v.addScaledVector(_d, HOLD.swim[0] * dt); // swimming in air
    }
    if (this.puffing && !this.puffT) (this.puffT = 0.25), this.G.sfx?.cue('hiss', { dur: 0.3, vol: 0.25 });
    this.puffT = Math.max(0, (this.puffT ?? 0) - dt);
    // Puffing (and half a second after), you are going somewhere: a hold you drift past slowly is not taken for you.
    this.puffed = this.puffing ? 0.5 : Math.max(0, (this.puffed ?? 0) - dt);
    const hit = this.move(walker, v.x * dt, v.y * dt, v.z * dt);
    const speed = v.length();
    if (hit.any) {
      const into = hit.into;
      if (into > 1.2) this.G.sfx?.cue('clunk', { vol: Math.min(1, 0.2 + into * 0.15) });
      if (into > 2.5) walker.pitch += Math.min(0.1, (into - 2.5) * 0.04);
      this.injure(into);
    }
    // A slow drift past a hold, or a stop against a wall by one: you take it.
    if (n && !this.puffed && (speed < HOLD.slow || (hit.any && speed < 1.5))) this.grab(walker, n, speed);
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
    if ((!r || r !== r0) && eye > I.floorY + HOLD.door + 0.05) {
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
    const gas = `puffer ${Math.round((100 * this.gas) / HOLD.gas)}%${hurt}`;
    if (this.strapped) return `weightless · strapped in · ${gas}`;
    if (this.held) return `weightless · ${this.held.foot ? 'feet in a foot rail' : `holding a ${this.held.h.kind === 'rail' ? 'rail' : 'handhold'}`} · ${gas}`;
    const s = walker.vel.length();
    return `weightless · ${s < 0.05 ? 'adrift, still' : `drifting ${s.toFixed(1)} m/s`} · ${gas}`;
  }

  /** What the prompt says when there is nothing to use (E) near you. */
  prompt() {
    if (this.strapped) return { key: 'E', label: 'Unstrap' };
    if (this.held) {
      if (this.charge >= 0) return { key: 'W', label: `Let go to push off ${'▮'.repeat(1 + Math.floor(Math.min(1, this.charge / HOLD.charge) * 4)).padEnd(5, '▯')}` };
      return { key: 'W', label: 'Push off where you look (hold for harder, Shift: hard) · A D S along the hold' };
    }
    if (this.near) return { key: 'Space', label: this.near.foot ? 'Hook your feet in' : 'Take hold' };
    return this.gas > 0 ? { key: 'Space', label: 'Brake with the suit puffer · WASD puff' } : { key: '', label: 'Puffer empty: drift to a wall or swim (WASD)' };
  }
}
