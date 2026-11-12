// The test level as data: a grid of 2 m cells. Pure (no three.js), so tools/check-map.mjs can read it too.
// Cell (cx, cy) covers world x ∈ [cx·S, cx·S + S], z ∈ [cy·S, cy·S + S]. Positions below are world metres.
export const S = 2;
export const W = 56, H = 28;

export const ROOMS = [
  { id: 'lab', name: 'Lab 3', x0: 1, y0: 3, x1: 8, y1: 10, h: 3.4, style: 'lab' },
  { id: 'corr', name: 'Service corridor C-2', x0: 10, y0: 6, x1: 31, y1: 7, h: 3.0, style: 'office' },
  { id: 'sec', name: 'Security office', x0: 14, y0: 1, x1: 19, y1: 4, h: 3.0, style: 'office' },
  { id: 'corrB', name: 'Hold access', x0: 30, y0: 8, x1: 31, y1: 12, h: 3.0, style: 'office' },
  { id: 'garden', name: 'Specimen Hold C', x0: 18, y0: 14, x1: 39, y1: 26, h: 7.0, style: 'hold' },
  { id: 'bay', name: 'Loading bay', x0: 41, y0: 9, x1: 54, y1: 23, h: 8.0, style: 'bay' },
  { id: 'lift', name: 'East freight lift', x0: 46, y0: 5, x1: 49, y1: 7, h: 3.4, style: 'lift' }
];

// A door is a 2 m deep doorway with a slab in its middle that slides up into the ceiling.
export const DOORS = [
  { id: 'lab', cells: [[9, 6], [9, 7]], h: 3.0 },
  { id: 'sec', cells: [[16, 5], [17, 5]], h: 3.0 },
  { id: 'hold', cells: [[30, 13], [31, 13]], h: 3.0 },
  { id: 'gate', cells: [[40, 17], [40, 18]], h: 4.2, locked: true, slow: true },
  { id: 'lift', cells: [[47, 8], [48, 8]], h: 3.0, locked: true }
];

// Solid furniture. `box` is the solid part inside the cell, in metres from the cell's corner [x0, z0, x1, z1];
// `top` is how tall it is (bullets fly over a bench).
export const PROPS = [
  { kind: 'bench', c: [3, 5], box: [0, 0.35, 2, 1.65], top: 0.95 },
  { kind: 'bench', c: [4, 5], box: [0, 0.35, 2, 1.65], top: 0.95 },
  { kind: 'bench', c: [6, 9], box: [0, 0.35, 2, 1.65], top: 0.95 },
  { kind: 'bench', c: [7, 9], box: [0, 0.35, 2, 1.65], top: 0.95 },
  { kind: 'tube', c: [5, 7], box: [0.25, 0.25, 1.75, 1.75], top: 3.4 },
  { kind: 'vending', c: [24, 6], box: [0.25, 0, 1.75, 0.95], top: 2.0 },
  { kind: 'desk', c: [18, 1], box: [0.1, 0, 1.9, 1.0], top: 0.8 },
  { kind: 'pillar', c: [22, 17], box: [0.2, 0.2, 1.8, 1.8], top: 99 },
  { kind: 'pillar', c: [22, 22], box: [0.2, 0.2, 1.8, 1.8], top: 99 },
  { kind: 'pillar', c: [35, 17], box: [0.2, 0.2, 1.8, 1.8], top: 99 },
  { kind: 'crate', c: [26, 20], box: [0.05, 0.05, 1.95, 1.95], top: 1.9 },
  { kind: 'crate', c: [27, 20], box: [0.05, 0.05, 1.95, 1.95], top: 1.9 },
  { kind: 'crate', c: [26, 21], box: [0.05, 0.05, 1.95, 1.95], top: 1.9 },
  { kind: 'pillar', c: [44, 13], box: [0.2, 0.2, 1.8, 1.8], top: 99 },
  { kind: 'pillar', c: [44, 20], box: [0.2, 0.2, 1.8, 1.8], top: 99 },
  { kind: 'pillar', c: [51, 13], box: [0.2, 0.2, 1.8, 1.8], top: 99 },
  { kind: 'pillar', c: [51, 20], box: [0.2, 0.2, 1.8, 1.8], top: 99 },
  { kind: 'crate', c: [47, 16], box: [0.05, 0.05, 1.95, 1.95], top: 3.8 },
  { kind: 'crate', c: [48, 16], box: [0.05, 0.05, 1.95, 1.95], top: 1.9 }
];

export const PICKUPS = [
  { id: 'wrench', kind: 'wrench', p: [9.4, 0.05, 20.4] },
  { id: 'can-lab', kind: 'can', p: [13.5, 0.06, 9.2] },
  { id: 'smg', kind: 'smg', p: [37, 0.84, 2.3], ammo: 30 },
  { id: 'ammo-sec1', kind: 'ammo', p: [35.8, 0.84, 2.5], amount: 30 },
  { id: 'ammo-sec2', kind: 'ammo', p: [30.6, 0.0, 7.6], amount: 30 },
  { id: 'can-h1', kind: 'can', p: [59, 0.06, 31] },
  { id: 'can-h2', kind: 'can', p: [63.5, 0.06, 32.5] },
  { id: 'ammo-h', kind: 'ammo', p: [38.5, 0, 30.8], amount: 45 },
  { id: 'ammo-b1', kind: 'ammo', p: [84, 0, 20], amount: 45 },
  { id: 'ammo-b2', kind: 'ammo', p: [107, 0, 45.5], amount: 45 }
];

// Things you press E on. Wall-mounted ones name the cell they hang in and the wall.
export const USABLES = [
  { id: 'terminal', kind: 'terminal', c: [1, 4], side: 'W' },
  { id: 'lantern', kind: 'terminal', c: [14, 2], side: 'W', file: 'lantern' },
  { id: 'vending', kind: 'vending', c: [24, 6], side: 'N', depth: 0.95 },
  { id: 'med-lab', kind: 'medkit', c: [8, 10], side: 'E' },
  { id: 'med-sec', kind: 'medkit', c: [14, 4], side: 'W' },
  { id: 'med-hold', kind: 'medkit', c: [18, 26], side: 'W' },
  { id: 'med-bay1', kind: 'medkit', c: [41, 22], side: 'W' },
  { id: 'med-bay2', kind: 'medkit', c: [54, 10], side: 'E' },
  { id: 'gatectl', kind: 'gatectl', c: [39, 25], side: 'E' },
  { id: 'breaker', kind: 'breaker', c: [54, 21], side: 'E' }
];

export const CANISTERS = [
  [64.5, 44.5], [72.5, 51], [42.5, 40.5], // the hold: one by the nest
  [93, 23], [99, 43], [107, 29], [85, 27], [91, 35] // the bay
];

// Crystal clusters in the hold; the Tender visits the first six in this order.
export const CRYSTALS = [
  { p: [66, 33], tended: true }, // F, by the entrance
  { p: [74, 39], tended: true }, // E
  { p: [68, 49], tended: true }, // D, by the gate control
  { p: [60, 45], tended: true }, // C, the nest
  { p: [49, 39], tended: true }, // B
  { p: [41, 31], tended: true }, // A
  { p: [54, 51], small: true },
  { p: [42, 49], small: true },
  { p: [77, 46], small: true }
];
export const NEST = { p: [63, 47], homes: [[59, 44], [62, 46], [60, 48.5], [66, 47], [69, 50.5], [64, 50.5]] };

export const VENTS = {
  corr: { p: [39, 3.0, 13], ceiling: true },
  sec: { c: [19, 4], side: 'S' },
  bay: [{ c: [41, 10], side: 'W' }, { c: [54, 12], side: 'E' }, { c: [41, 16], side: 'W' }, { c: [50, 23], side: 'S' }]
};

// Light sources (world metres). kinds: steady, pulse (emergency), flicker, tube (can be popped), beacon.
export const LIGHTS = [
  { p: [8, 3.2, 10], color: 0xff2a14, i: 9, d: 12, kind: 'pulse', fixture: 'beacon' },
  { p: [13, 3.3, 17], color: 0xfff0d8, i: 8, d: 10, kind: 'flicker', fixture: 'tube' },
  { p: [3.6, 1.3, 9], color: 0x5fd0ff, i: 1.0, d: 4.5 },
  { p: [26, 2.95, 14], color: 0xe6eeff, i: 7, d: 9, kind: 'tube', group: 'corr', fixture: 'tube' },
  { p: [36, 2.95, 14], color: 0xe6eeff, i: 7, d: 9, kind: 'tube', group: 'corr', fixture: 'tube' },
  { p: [46, 2.95, 14], color: 0xe6eeff, i: 7, d: 9, kind: 'tube', group: 'corr', fixture: 'tube' },
  { p: [56, 2.95, 14], color: 0xe6eeff, i: 6, d: 9, kind: 'flicker', fixture: 'tube' },
  { p: [62.6, 2.6, 12.4], color: 0xff2a14, i: 8, d: 9, kind: 'beacon', fixture: 'beacon' },
  { p: [37, 1.5, 3.4], color: 0xffaa55, i: 4, d: 7 },
  { p: [32, 2.95, 5], color: 0xe6eeff, i: 5, d: 8, kind: 'flicker', fixture: 'tube' },
  { p: [62, 2.95, 21], color: 0x9fb4c8, i: 3, d: 7, fixture: 'tube' },
  { p: [49, 1.0, 39], color: 0x38e8d0, i: 5, d: 11, group: 'crystal' },
  { p: [62, 1.0, 46], color: 0x38e8d0, i: 6, d: 12, group: 'crystal' },
  { p: [74, 1.0, 39], color: 0x38e8d0, i: 4, d: 9, group: 'crystal' },
  { p: [58, 6.4, 30], color: 0xffa04a, i: 9, d: 18, kind: 'flicker', fixture: 'lamp' },
  { p: [90, 7.6, 26], color: 0xffa050, i: 26, d: 24, group: 'bay', fixture: 'lamp' },
  { p: [102, 7.6, 40], color: 0xffa050, i: 26, d: 24, group: 'bay', fixture: 'lamp' },
  { p: [96, 7.6, 30], color: 0xffa050, i: 20, d: 20, group: 'bay', fixture: 'lamp' },
  { p: [96, 3.4, 18.4], color: 0xff2a14, i: 8, d: 10, kind: 'beacon', fixture: 'beacon' },
  { p: [96, 3.25, 12], color: 0xeaf2ff, i: 7, d: 7, group: 'lift', fixture: 'tube' }
];

export const SIGNS = [
  { text: 'SECURITY', p: [29.6, 2.2, 12.02], rotY: 0 },
  { text: 'EAST FREIGHT LIFT  →', p: [44, 2.2, 15.98], rotY: Math.PI },
  { text: '↓  SPECIMEN HOLD C', p: [60.02, 2.2, 22], rotY: Math.PI / 2 },
  { text: 'LOADING BAY  →', p: [79.98, 4.8, 32.6], rotY: -Math.PI / 2 },
  { text: 'GATE CONTROL', p: [79.98, 2.3, 51], rotY: -Math.PI / 2, small: true },
  { text: 'FREIGHT LIFT', p: [100, 3.6, 18.02], rotY: 0 },
  { text: 'LAB 3 · SUBLEVEL C', p: [2.02, 2.5, 15], rotY: Math.PI / 2 },
  { text: 'LIFT POWER', p: [109.98, 2.4, 43], rotY: -Math.PI / 2, small: true }
];

// Dr Okafor hides in the corner of the security office.
export const OKAFOR = { p: [39.1, 3.0], yaw: -2.3 };
// The night shift the Skitters took: bodies at the crystals with growth coming up through them, and the trail they
// left being dragged there.
export const GROWN = [
  { p: [47.3, 40.6], ry: 0.7, kind: 'guard' },
  { p: [43.0, 30.4], ry: 2.3, kind: 'coat' }
];
export const TRAIL = [[61.4, 18], [61, 22], [61.2, 25.5], [60.6, 28.5], [58.5, 31.5], [55, 34.5], [51.5, 37.5], [48.6, 40]];
// The Sweep come down in the freight lift and take these posts in front of it.
export const SWEEP = {
  spawn: [[94.6, 12.5], [97, 13.5], [99.2, 12.5]],
  posts: [{ x: 90.6, z: 23.5, yaw: 0.35 }, { x: 97, z: 22.4, yaw: 0 }, { x: 103.4, z: 23.5, yaw: -0.35 }]
};
export const SONG_EVERY = 40.3;
export const START = { p: [5, 19.5], yaw: -0.98 };
export const AT = {
  garden: { p: [61, 29.6], yaw: Math.PI, flags: { corrBeat: 1, smgBeat: 1 }, give: { wrench: true, smg: true, mag: 30, reserve: 60, cans: 2 } },
  bay: { p: [84.5, 36], yaw: -Math.PI / 2, flags: { corrBeat: 1, smgBeat: 1, gateOpen: 1 }, give: { wrench: true, smg: true, mag: 30, reserve: 90, cans: 1 } }
};

const SIDES = {
  W: (cx, cy, d) => ({ x: cx * S + d, z: cy * S + S / 2, rotY: Math.PI / 2 }),
  E: (cx, cy, d) => ({ x: cx * S + S - d, z: cy * S + S / 2, rotY: -Math.PI / 2 }),
  N: (cx, cy, d) => ({ x: cx * S + S / 2, z: cy * S + d, rotY: 0 }),
  S: (cx, cy, d) => ({ x: cx * S + S / 2, z: cy * S + S - d, rotY: Math.PI })
};
/** Where a thing hanging on a cell's wall sits, and which way its front (+z) faces. */
export function wallPos(cx, cy, side, depth = 0.1) {
  return SIDES[side](cx, cy, depth);
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Level {
  constructor() {
    this.g = new Array(W * H).fill(null);
    for (const r of ROOMS)
      for (let y = r.y0; y <= r.y1; y++)
        for (let x = r.x0; x <= r.x1; x++) this.g[y * W + x] = { room: r.id, h: r.h, style: r.style };
    for (const d of DOORS) for (const [x, y] of d.cells) this.g[y * W + x] = { room: 'door', door: d.id, h: d.h, style: 'door' };
    for (const p of PROPS) {
      const c = this.g[p.c[1] * W + p.c[0]];
      if (!c) throw new Error(`prop ${p.kind} at ${p.c} is inside a wall`);
      c.prop = p;
    }
    this.doorOpen = {};
    this.doorLocked = {};
    for (const d of DOORS) {
      this.doorOpen[d.id] = 0;
      this.doorLocked[d.id] = !!d.locked;
    }
    this.version = 0;
    this.flows = new Map();
  }
  cell(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return null;
    return this.g[cy * W + cx];
  }
  cellAt(x, z) {
    return this.cell(Math.floor(x / S), Math.floor(z / S));
  }
  roomAt(x, z) {
    const c = this.cellAt(x, z);
    return c ? c.room : null;
  }
  heightAt(x, z) {
    const c = this.cellAt(x, z);
    return c ? c.h : 3;
  }
  doorBlocks(id) {
    return this.doorOpen[id] < 0.85;
  }
  /** The solid part of a cell as a world box, or null when you can walk there. */
  solidBox(cx, cy) {
    const c = this.cell(cx, cy);
    const x = cx * S, z = cy * S;
    if (!c) return [x, z, x + S, z + S, 99];
    if (c.prop) {
      const b = c.prop.box;
      return [x + b[0], z + b[1], x + b[2], z + b[3], c.prop.top];
    }
    if (c.door && this.doorBlocks(c.door)) return [x, z, x + S, z + S, 99];
    return null;
  }
  /** Is the cell passable for a creature finding its way (doors it can open count as open)? */
  passable(cx, cy) {
    const c = this.cell(cx, cy);
    if (!c || c.prop) return false;
    if (c.door) return !this.doorLocked[c.door];
    return true;
  }
  /** Push a circle out of every solid box it overlaps. Returns true when it touched something. */
  resolve(p, r) {
    let hit = false;
    const x0 = Math.floor((p.x - r) / S), x1 = Math.floor((p.x + r) / S);
    const z0 = Math.floor((p.z - r) / S), z1 = Math.floor((p.z + r) / S);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.solidBox(cx, cz);
        if (!b) continue;
        const nx = clamp(p.x, b[0], b[2]), nz = clamp(p.z, b[1], b[3]);
        const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (r - d);
          p.z += (dz / d) * (r - d);
        } else {
          // the centre is inside the box: leave by the nearest side
          const l = p.x - b[0], rr = b[2] - p.x, t = p.z - b[1], bt = b[3] - p.z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) p.x = b[0] - r;
          else if (m === rr) p.x = b[2] + r;
          else if (m === t) p.z = b[1] - r;
          else p.z = b[3] + r;
        }
      }
    return hit;
  }
  moveCircle(p, dx, dz, r) {
    let hit = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (r * 0.8)));
    for (let i = 0; i < steps; i++) {
      p.x += dx / steps;
      if (this.resolve(p, r)) hit = true;
      p.z += dz / steps;
      if (this.resolve(p, r)) hit = true;
    }
    return hit;
  }
  /**
   * A 3D ray through the grid: walls, closed doors, furniture, the floor, ceilings and the lintels over doorways.
   * d must be a unit vector. Returns { t, n: [x, y, z], what: 'wall'|'floor'|'ceil'|'prop' } or null within max.
   */
  ray(o, d, max) {
    const h = Math.hypot(d.x, d.z);
    // straight up or down
    if (h < 1e-5) {
      const ch = this.heightAt(o.x, o.z);
      const t = d.y < 0 ? o.y / -d.y : (ch - o.y) / d.y;
      return t <= max ? { t, n: [0, d.y < 0 ? 1 : -1, 0], what: d.y < 0 ? 'floor' : 'ceil' } : null;
    }
    const ux = d.x / h, uz = d.z / h; // unit 2D direction; 2D distance s ↔ 3D t = s / h
    let cx = Math.floor(o.x / S), cz = Math.floor(o.z / S);
    const stepX = ux > 0 ? 1 : -1, stepZ = uz > 0 ? 1 : -1;
    const dX = ux !== 0 ? Math.abs(S / ux) : Infinity, dZ = uz !== 0 ? Math.abs(S / uz) : Infinity;
    let sX = ux !== 0 ? (ux > 0 ? (cx + 1) * S - o.x : o.x - cx * S) / Math.abs(ux) : Infinity;
    let sZ = uz !== 0 ? (uz > 0 ? (cz + 1) * S - o.z : o.z - cz * S) / Math.abs(uz) : Infinity;
    let s = 0, nx = 0, nz = 0;
    const maxS = max * h;
    for (let i = 0; i < 256; i++) {
      const sOut = Math.min(sX, sZ);
      const tIn = s / h, tOut = sOut / h;
      const c = this.cell(cx, cz);
      if (!c || (c.door && this.doorBlocks(c.door))) {
        return tIn <= max ? { t: tIn, n: [nx, 0, nz], what: 'wall' } : null;
      }
      const yIn = o.y + d.y * tIn;
      if (i > 0 && yIn >= c.h) return tIn <= max ? { t: tIn, n: [nx, 0, nz], what: 'wall' } : null; // a lintel
      if (c.prop) {
        const hit = this.rayBox(o, d, c.prop, cx, cz, tIn, tOut);
        if (hit && hit.t <= max) return hit;
      }
      if (d.y < 0) {
        const tf = -o.y / d.y;
        if (tf >= tIn && tf <= tOut) return tf <= max ? { t: tf, n: [0, 1, 0], what: 'floor' } : null;
      } else if (d.y > 0) {
        const tc = (c.h - o.y) / d.y;
        if (tc >= tIn && tc <= tOut) return tc <= max ? { t: tc, n: [0, -1, 0], what: 'ceil' } : null;
      }
      if (sOut > maxS) return null;
      s = sOut;
      if (sX < sZ) {
        sX += dX;
        cx += stepX;
        nx = -stepX;
        nz = 0;
      } else {
        sZ += dZ;
        cz += stepZ;
        nx = 0;
        nz = -stepZ;
      }
    }
    return null;
  }
  rayBox(o, d, prop, cx, cz, tMin, tMax) {
    const b = prop.box;
    const bx0 = cx * S + b[0], bx1 = cx * S + b[2], bz0 = cz * S + b[1], bz1 = cz * S + b[3];
    let t0 = tMin, t1 = tMax, n = null;
    const axes = [
      [o.x, d.x, bx0, bx1, [-1, 0, 0], [1, 0, 0]],
      [o.z, d.z, bz0, bz1, [0, 0, -1], [0, 0, 1]],
      [o.y, d.y, -1, prop.top, [0, -1, 0], [0, 1, 0]]
    ];
    for (const [oo, dd, lo, hi, nLo, nHi] of axes) {
      if (Math.abs(dd) < 1e-9) {
        if (oo < lo || oo > hi) return null;
        continue;
      }
      let a = (lo - oo) / dd, bb = (hi - oo) / dd, na = nLo;
      if (a > bb) {
        [a, bb] = [bb, a];
        na = nHi;
      }
      if (a > t0) {
        t0 = a;
        n = na;
      }
      if (bb < t1) t1 = bb;
      if (t0 > t1) return null;
    }
    return { t: t0, n: n ?? [0, 1, 0], what: 'prop' };
  }
  /** Can a see b (3D points)? */
  los(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    const hit = this.ray(a, { x: dx / len, y: dy / len, z: dz / len }, len);
    return !hit || hit.t >= len - 0.05;
  }
  /**
   * A distance field (in cells) to the target cell over the cells `allow` lets a creature use, cached until a door
   * locks or unlocks.
   */
  flow(tx, tz, maskId, allow) {
    const tcx = Math.floor(tx / S), tcz = Math.floor(tz / S);
    const key = `${tcx},${tcz},${maskId},${this.version}`;
    let f = this.flows.get(key);
    if (f) return f;
    f = new Int16Array(W * H).fill(-1);
    if (this.cell(tcx, tcz)) {
      const q = [tcz * W + tcx];
      f[q[0]] = 0;
      for (let qi = 0; qi < q.length; qi++) {
        const i = q[qi], x = i % W, y = (i / W) | 0;
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ax, ny = y + ay;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (f[ni] >= 0 || !this.passable(nx, ny) || (allow && !allow(this.g[ni]))) continue;
          f[ni] = f[i] + 1;
          q.push(ni);
        }
      }
    }
    if (this.flows.size > 80) this.flows.clear();
    this.flows.set(key, f);
    return f;
  }
  /** Which way to walk from p towards t: straight there when the way is clear, else down the distance field. */
  steer(p, t, r, maskId = 'all', allow = null) {
    const dx = t.x - p.x, dz = t.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.01) return { x: 0, z: 0, dist };
    if (dist < 14 && this.clearPath(p, t, r)) return { x: dx / dist, z: dz / dist, dist };
    const f = this.flow(t.x, t.z, maskId, allow);
    const cx = Math.floor(p.x / S), cz = Math.floor(p.z / S);
    const here = f[cz * W + cx];
    let best = here >= 0 ? here : 1e9, bx = null, bz = null;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + ax, nz = cz + az;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const v = f[nz * W + nx];
      if (v < 0) continue;
      if (ax && az && (f[cz * W + nx] < 0 || f[nz * W + cx] < 0)) continue; // no cutting corners
      const score = v + (ax && az ? 0.4 : 0);
      if (score < best) {
        best = score;
        bx = nx;
        bz = nz;
      }
    }
    if (bx === null) return { x: dx / dist, z: dz / dist, dist };
    const wx = bx * S + S / 2 - p.x, wz = bz * S + S / 2 - p.z;
    const wl = Math.hypot(wx, wz) || 1;
    return { x: wx / wl, z: wz / wl, dist };
  }
  clearPath(a, b, r) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len < 1e-3) return true;
    const px = (-dz / len) * r, pz = (dx / len) * r;
    for (const k of [-1, 0, 1]) {
      const o = { x: a.x + px * k, y: 0.5, z: a.z + pz * k };
      const hit = this.ray(o, { x: dx / len, y: 0, z: dz / len }, len);
      if (hit && hit.t < len - 0.05) return false;
    }
    return true;
  }
}
