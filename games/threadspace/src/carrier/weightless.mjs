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

import * as THREE from 'three';
import { roomAt } from './layout.mjs';
import { box, at, mat } from '../util.mjs';

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
};

const RAIL = mat('#d8a530'); // the airless hangar's rails (sets/hangar.mjs) are this yellow too
const FOOT = mat('#5b626c');

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

/** The handholds of weightless room `c` on deck `I` (after its furniture, so the handles can find what it holds).
 *  `open`: its walls' doors, windows and bay doors (layout.mjs `buildDeck`). */
export function dressHolds(C, I, c, open) {
  const y = I.floorY, h = c.h ?? 3, [x1, x2] = c.x, [z1, z2] = c.z, OFF = 0.09;
  const V = (x, yy, z) => new THREE.Vector3(x, yy, z);
  // The walls: north and south run along x, west and east along z. Rails in lengths of about two metres, at hand
  // height off the deck and below the deckhead, broken at every opening.
  const walls = [['n', z1, x1, x2, true, 1], ['s', z2, x1, x2, true, -1], ['w', x1, z1, z2, false, 1], ['e', x2, z1, z2, false, -1]];
  for (const [side, line, a0, b0, alongX, inward] of walls) {
    const n = alongX ? V(0, 0, inward) : V(inward, 0, 0);
    const pt = (u, yy) => (alongX ? V(u, yy, line + inward * OFF) : V(line + inward * OFF, yy, u));
    const gaps = open[side].map((o) => [o.a - 0.35, o.b + 0.35]);
    // Furniture against the wall at a rail's height (a locker, a rack, a console) breaks the rail too. The wall's own
    // colliders are 0.2 m thick on its line; anything thicker reaching within 0.35 m of it is furniture.
    const nk = alongX ? 'z' : 'x', uk = alongX ? 'x' : 'z';
    const against = (yy) => I.colliders.filter((k) => k.max[nk] - k.min[nk] > 0.25 && k.min.y < yy + 0.1 && k.max.y > yy - 0.1 &&
      (inward > 0 ? k.min[nk] < line + 0.35 && k.max[nk] > line : k.max[nk] > line - 0.35 && k.min[nk] < line)).map((k) => [k.min[uk] - 0.2, k.max[uk] + 0.2]);
    for (const hy of [1.0, h - 0.5]) for (const [ra, rb] of runs(a0 + 0.4, b0 - 0.4, [...gaps, ...against(y + hy)])) {
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
}

// --- moving by them -------------------------------------------------------------------------------------------------

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();
const _e = new THREE.Vector3(), _q = new THREE.Quaternion();

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
  }

  /** Dropped: a jump to somewhere else (a teleport, a fade, another deck). */
  reset() {
    this.held = null;
    this.charge = -1;
    this.near = null;
    this.marker.visible = false;
  }

  /** Not weightless this frame: the bottle tops up from the ship where there is weight. */
  idle(dt) {
    this.gas = Math.min(HOLD.gas, this.gas + (HOLD.gas / HOLD.refill) * dt);
    if (this.held || this.charge >= 0) this.reset();
    this.marker.visible = false;
    this.puffing = false;
  }

  /** The nearest hold in reach of `eye`, or null: { h, t, d, p }. */
  find(I, eye, skip = null, reach = HOLD.reach) {
    let best = null;
    for (const h of I.holds ?? []) {
      if (h === skip) continue;
      if (Math.min(h.a.x, h.b.x) - reach > eye.x || Math.max(h.a.x, h.b.x) + reach < eye.x) continue;
      if (Math.min(h.a.z, h.b.z) - reach > eye.z || Math.max(h.a.z, h.b.z) + reach < eye.z) continue;
      _d.subVectors(h.b, h.a);
      const t = Math.min(1, Math.max(0, _d.dot(_p.subVectors(eye, h.a)) / (h.len * h.len || 1)));
      _p.copy(h.a).addScaledVector(_d, t);
      const d = _p.distanceTo(eye);
      if (d <= reach && (!best || d < best.d)) best = { h, t, d, p: _p.clone() };
    }
    return best;
  }

  grab(walker, n, speed) {
    const eye = walker.eye(_e);
    this.held = { h: n.h, t: n.t, off: eye.clone().sub(n.p) };
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
    if (this.held && (this.held.h.I !== I || walker.pos.distanceTo(this.last) > 2)) this.reset(); // moved by something else
    this.ignoreT = Math.max(0, this.ignoreT - dt);
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
            H.off.add(grip.sub(next.p));
          } else H.t = Math.min(1, Math.max(0, t));
        } else H.t = t;
      }
    }
    // Your eye comes in to within an arm's length of your hand.
    const L = H.off.length();
    if (L > 0.7) H.off.multiplyScalar(Math.max(0.7, L - dt * 1.5) / L);
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
    const n = (this.near = this.find(walker.interior, eye, this.ignoreT > 0 ? this.ignore : null));
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
    const hit = this.move(walker, v.x * dt, v.y * dt, v.z * dt);
    const speed = v.length();
    if (hit.any) {
      const into = hit.into;
      if (into > 1.2) this.G.sfx?.cue('clunk', { vol: Math.min(1, 0.2 + into * 0.15) });
      if (into > 2.5) walker.pitch += Math.min(0.1, (into - 2.5) * 0.04);
    }
    // A slow drift past a hold, or a stop against a wall by one: you take it.
    if (n && (speed < HOLD.slow || (hit.any && speed < 1.5))) this.grab(walker, n, speed);
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
    const gas = `puffer ${Math.round((100 * this.gas) / HOLD.gas)}%`;
    if (this.held) return `weightless · holding a ${this.held.h.kind === 'rail' ? 'rail' : 'handhold'} · ${gas}`;
    const s = walker.vel.length();
    return `weightless · ${s < 0.05 ? 'adrift, still' : `drifting ${s.toFixed(1)} m/s`} · ${gas}`;
  }

  /** What the prompt says when there is nothing to use (E) near you. */
  prompt() {
    if (this.held) {
      if (this.charge >= 0) return { key: 'W', label: `Let go to push off ${'▮'.repeat(1 + Math.floor(Math.min(1, this.charge / HOLD.charge) * 4)).padEnd(5, '▯')}` };
      return { key: 'W', label: 'Push off where you look (hold for harder, Shift: hard) · A D S along the hold' };
    }
    if (this.near) return { key: 'Space', label: 'Take hold' };
    return this.gas > 0 ? { key: 'Space', label: 'Brake with the suit puffer · WASD puff' } : { key: '', label: 'Puffer empty: drift to a wall or swim (WASD)' };
  }
}
