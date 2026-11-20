// The carrier's rooms dressed as places, not boxes. layout.mjs builds the walls and calls in here for three things:
//
// - `roomSurfaces(c)`: the room's walls, deck and deckhead. Five wall finishes (panelled, padded, bare structure, tile,
//   and the passages' own), three decks (plating, tread plate, non-slip), each a canvas texture tinted per kind of room,
//   with the grime and scuffs a lived-in ship collects low down. `LOOK` says which room gets what, and its lamps.
// - `roomLights(I, c)`: the lamps, coloured and as bright as the room's kind wants (the command spaces dim, the galley
//   and the sick bay bright), and laid out over what the room is for where a set says so.
// - `dressRoom(C, I, c, open)`: the ship's structure showing in every room: a frame (a stiffener up each long wall
//   under each deckhead beam), the cable tray and pipe runs along the deckhead with their colour bands, and lit coves.
// - `SETS[id](C, I, c, hooks, open)`: the rooms that are built as a set of their own: the bridge, the CIC, the mess and
//   the galley, the crew's quarters, the sick bay and engineering control; `dressHangar` adds to the hangar.
//
// Everything is boxes and cylinders on a small shared palette, so a room still bakes into a dozen meshes (decor.mjs
// `bake`). Posters and notices are drawn on a lit atlas (`C.paper`): one material for every printed sheet aboard. The
// few things that move (the CIC's plot) are `userData.live` and ticked by `setsFrame`.

import * as THREE from 'three';
import { box, cyl, at, mat, glow, mulberry } from '../util.mjs';
import { SignAtlas, screen } from '../decor.mjs';

// --- surfaces ------------------------------------------------------------------------------------------------------

const texCache = new Map();
function tex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}

/** Grime: darker toward the deck, a few scuffs and drips. Drawn last over any wall, in canvas pixels (h = 3 m). */
function grime(g, w, h, r, k = 1) {
  const grd = g.createLinearGradient(0, h * 0.72, 0, h);
  grd.addColorStop(0, 'rgba(30,24,18,0)');
  grd.addColorStop(1, `rgba(30,24,18,${0.32 * k})`);
  g.fillStyle = grd;
  g.fillRect(0, h * 0.72, w, h * 0.28);
  g.strokeStyle = `rgba(20,18,16,${0.25 * k})`;
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const x = r() * w, y = h * (0.78 + r() * 0.18);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 50, y + (r() - 0.5) * 6);
    g.stroke();
  }
  g.fillStyle = `rgba(40,32,24,${0.08 * k})`;
  for (let i = 0; i < 3; i++) g.fillRect(r() * w, h * (0.2 + r() * 0.4), 2, 30 + r() * 80);
}

const rivets = (g, pts, c = '#5e646d') => {
  g.fillStyle = c;
  for (const [x, y] of pts) g.fillRect(x - 3, y - 3, 6, 6);
};

const WALLS = {
  /** Panels over a kick plate and a rail: the passages and most rooms. */
  panel: (g, w, h, r) => {
    g.fillStyle = '#d2d6dc';
    g.fillRect(0, 0, w, h);
    const kick = h * 0.7;
    g.fillStyle = '#7d838c';
    g.fillRect(0, kick, w, h - kick);
    g.fillStyle = '#4c525b';
    g.fillRect(0, kick - 12, w, 16);
    g.fillStyle = '#b4b9c1';
    g.fillRect(0, kick - 14, w, 3);
    const gr = g.createLinearGradient(0, 20, 0, kick - 30);
    gr.addColorStop(0, '#dde1e6');
    gr.addColorStop(1, '#c4c9d0');
    g.fillStyle = gr;
    g.fillRect(16, 24, w - 32, kick - 56);
    g.strokeStyle = 'rgba(40,44,52,0.6)';
    g.lineWidth = 3;
    g.strokeRect(14, 22, w - 28, kick - 52);
    g.fillStyle = '#353a42';
    g.fillRect(0, 0, 4, h);
    g.fillRect(w - 4, 0, 4, h);
    g.fillRect(0, 0, w, 8);
    rivets(g, [[22, 36], [w - 22, 36], [22, kick - 40], [w - 22, kick - 40], [22, kick + 30], [w - 22, kick + 30], [22, h - 26], [w - 22, h - 26]]);
    g.fillStyle = '#3e434b';
    g.fillRect(w * 0.3, kick + 40, w * 0.4, 46);
    g.fillStyle = '#23272d';
    for (let k = 0; k < 6; k++) g.fillRect(w * 0.32, kick + 46 + k * 7, w * 0.36, 3);
    g.fillStyle = 'rgba(30,34,40,0.3)';
    g.fillRect(w * 0.5 - 1, 30, 2, kick - 70);
    grime(g, w, h, r);
  },
  /** Padded panels, quilted, over a dark kick: the command spaces, quarters and wardrooms. Soft walls to be thrown into. */
  padded: (g, w, h, r) => {
    g.fillStyle = '#2c3138';
    g.fillRect(0, 0, w, h);
    const kick = h * 0.72;
    const rows = 3, cols = 1, gap = 7;
    const ph = (kick - 20) / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = 8 + i * (w - 16) / cols, y = 14 + j * ph, pw = (w - 16) / cols - gap, hh = ph - gap;
      const gr = g.createLinearGradient(x, y, x + pw, y + hh);
      gr.addColorStop(0, '#e4e7eb');
      gr.addColorStop(0.55, '#c9ced5');
      gr.addColorStop(1, '#9ea5ae');
      g.fillStyle = gr;
      g.beginPath();
      g.roundRect(x, y, pw, hh, 18);
      g.fill();
      // the quilting: a stitched diamond
      g.strokeStyle = 'rgba(60,66,76,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + pw / 2, y + 10);
      g.lineTo(x + pw - 10, y + hh / 2);
      g.lineTo(x + pw / 2, y + hh - 10);
      g.lineTo(x + 10, y + hh / 2);
      g.closePath();
      g.stroke();
      g.fillStyle = 'rgba(40,46,56,0.5)';
      g.beginPath();
      g.arc(x + pw / 2, y + hh / 2, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#5c626b';
    g.fillRect(0, kick, w, h - kick);
    g.fillStyle = '#41464e';
    g.fillRect(0, kick - 4, w, 10);
    g.fillStyle = '#8b9199';
    g.fillRect(0, kick + 6, w, 2);
    grime(g, w, h, r, 0.7);
  },
  /** Bare structure: plate, weld seams, a stiffener's shadow, rivet rows and rust tears: engineering, workshops, hangar. */
  bare: (g, w, h, r) => {
    g.fillStyle = '#c3c6c9';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,40,40'},${0.03 + r() * 0.05})`;
      g.fillRect(r() * w, r() * h, 2 + r() * 14, 2 + r() * 14);
    }
    g.fillStyle = 'rgba(40,42,46,0.55)';
    for (const y of [h * 0.34, h * 0.68]) g.fillRect(0, y, w, 3); // weld seams
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (const y of [h * 0.34, h * 0.68]) g.fillRect(0, y + 3, w, 1);
    g.fillStyle = '#4a4e54';
    g.fillRect(0, 0, 5, h);
    g.fillRect(w - 5, 0, 5, h);
    const sh = g.createLinearGradient(w - 60, 0, w - 5, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = sh;
    g.fillRect(w - 60, 0, 55, h);
    for (let y = 30; y < h; y += 46) rivets(g, [[14, y], [w - 16, y]], '#6c7178');
    g.fillStyle = 'rgba(110,60,30,0.16)';
    for (let i = 0; i < 4; i++) {
      const x = 16 + r() * (w - 32), y = 30 + Math.floor(r() * 8) * 46;
      g.fillRect(x - 1, y, 3, 40 + r() * 120);
    }
    // a stencilled frame mark
    g.fillStyle = 'rgba(30,30,30,0.5)';
    g.font = '600 18px ui-monospace, Menlo, monospace';
    g.fillText(['FR', 'STBD', 'WT', 'NO WELD'][Math.floor(r() * 4)], 26, h * 0.62);
    grime(g, w, h, r, 1.3);
  },
  /** Tile: the galley, the sick bay, the washrooms. Small white tiles over a steel kick plate. */
  tile: (g, w, h, r) => {
    g.fillStyle = '#9aa1a8';
    g.fillRect(0, 0, w, h);
    const kick = h * 0.82, s = w / 8;
    for (let y = 0; y < kick; y += s) for (let x = 0; x < w; x += s) {
      const v = 228 - Math.floor(r() * 14);
      g.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
      g.fillRect(x + 1.5, y + 1.5, s - 3, s - 3);
    }
    g.fillStyle = '#b8bfc6';
    g.fillRect(0, kick, w, h - kick);
    g.fillStyle = '#7d848c';
    g.fillRect(0, kick, w, 4);
    rivets(g, [[20, kick + 30], [w - 20, kick + 30]], '#80878f');
    grime(g, w, h, r, 0.6);
  }
};

const FLOORS = {
  /** Deck plating, 2 m a tile, with scuffs. */
  plate: (g, w, h, r) => {
    g.fillStyle = '#c4c8ce';
    g.fillRect(0, 0, w, h);
    for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128]]) {
      const gr = g.createLinearGradient(x, y, x + 128, y + 128);
      gr.addColorStop(0, '#cfd3d9');
      gr.addColorStop(1, '#b2b7be');
      g.fillStyle = gr;
      g.fillRect(x + 3, y + 3, 122, 122);
      g.fillStyle = 'rgba(60,64,72,0.3)';
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) g.fillRect(x + 12 + i * 14 + (j % 2) * 7, y + 12 + j * 14, 4, 2);
      rivets(g, [[x + 10, y + 10], [x + 118, y + 10], [x + 10, y + 118], [x + 118, y + 118]], '#6a7079');
    }
    g.fillStyle = '#464c55';
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, 126, w, 4);
    g.fillRect(0, 0, 3, h);
    g.fillRect(126, 0, 4, h);
    g.strokeStyle = 'rgba(30,30,30,0.12)';
    g.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const x = r() * w, y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 70, y + (r() - 0.5) * 20);
      g.stroke();
    }
  },
  /** Tread plate: raised bars in a herringbone, for the working spaces. */
  tread: (g, w, h, r) => {
    g.fillStyle = '#b9bdc2';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
      const flip = ((x + y) / 16) % 2;
      g.save();
      g.translate(x + 8, y + 8);
      g.rotate(flip ? 0.785 : -0.785);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-6, -1.5, 12, 3);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-6, 1.5, 12, 1.5);
      g.restore();
    }
    g.fillStyle = '#4d5157';
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, 0, 3, h);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(${r() < 0.4 ? '90,60,30' : '20,20,20'},${0.05 + r() * 0.08})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 10 + r() * 30, 6 + r() * 16, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  },
  /** Non-slip sheet in 1 m squares, flecked: the mess decks, the galley, the sick bay, the gym. */
  nonskid: (g, w, h, r) => {
    g.fillStyle = '#c8c8c8';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = r() < 0.5 ? 255 : 60;
      g.fillStyle = `rgba(${v},${v},${v},${0.08 + r() * 0.1})`;
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    g.fillStyle = 'rgba(40,40,40,0.45)';
    for (const p of [0, 128]) (g.fillRect(p, 0, 2, h), g.fillRect(0, p, w, 2));
  }
};

/** Deckhead: panels with vents, between the beams. */
function ceilTex(g, w, h) {
  g.fillStyle = '#9ba1aa';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#50565f';
  g.fillRect(0, 0, w, 6);
  g.fillRect(0, 0, 6, h);
  g.fillStyle = '#868c95';
  g.fillRect(30, 30, 196, 196);
  g.fillStyle = '#585e67';
  for (let k = 0; k < 9; k++) g.fillRect(60, 60 + k * 16, 136, 5);
}

/** What each kind of room is finished in, and how it is lit. `k` scales the lamps (16 at 1), `cove` is a lit strip under
 *  the coving (null: none), `fill` and `sun` the scene's fill and sun while you are in it (main.mjs; ABOARD's when not
 *  given). Keyed by system; `ROOM` overrides by room id. */
const LOOK = {
  command: { wall: 'padded', floor: 'plate', tint: '#7a8594', deck: '#3e444e', ceil: '#4b525c', trim: '#1c2026', lamp: '#cfe2ff', k: 1.0, cove: '#2f6fc0', fill: 0.45 },
  quarters: { wall: 'padded', floor: 'plate', tint: '#8a929e', deck: '#4d535c', ceil: '#646b75', trim: '#262a31', lamp: '#ffe0b8', k: 0.95, cove: '#c08040' },
  mess: { wall: 'panel', floor: 'nonskid', tint: '#a89c8c', deck: '#6e5244', ceil: '#7a7670', trim: '#2e2a26', lamp: '#ffdcb0', k: 1.0, cove: '#d08a40' },
  galley: { wall: 'tile', floor: 'nonskid', tint: '#aab0b6', deck: '#8a4a3a', ceil: '#7c838b', trim: '#3a3f46', lamp: '#f2f6ff', k: 0.8, cove: null },
  medical: { wall: 'padded', floor: 'nonskid', tint: '#c4ccd2', deck: '#7e909e', ceil: '#8a939b', trim: '#4a5862', lamp: '#eef6ff', k: 0.85, cove: '#3ac0b0' },
  work: { wall: 'bare', floor: 'tread', tint: '#9a9686', deck: '#5b5850', ceil: '#6e6b62', trim: '#2e2b26', lamp: '#ffd9a0', k: 1.0, cove: null },
  welfare: { wall: 'panel', floor: 'nonskid', tint: '#8f98a6', deck: '#3f5060', ceil: '#727a85', trim: '#262b33', lamp: '#ffe6c4', k: 1.0, cove: '#c08040' },
  hangar: { wall: 'bare', floor: 'tread', tint: '#868e98', deck: '#4a4f56', ceil: '#5d636b', trim: '#26292e', lamp: '#e8eef8', k: 1.4, cove: null, fill: 0.8, sun: 0.9 },
  corridor: { wall: 'panel', floor: 'plate', tint: '#8d96a3', deck: '#5f666f', ceil: '#7a818b', trim: '#2b3038', lamp: '#ffe6c4', k: 1.0, cove: null }
};
const BY_SYSTEM = {
  bridge: 'command', sensors: 'command', flight: 'command', quarters: 'quarters', mess: 'mess', medical: 'medical',
  engineering: 'work', repair: 'work', damage: 'work', stores: 'work', armoury: 'work', 'life-support': 'work', aux: 'work',
  welfare: 'welfare', hangar: 'hangar', corridor: 'corridor'
};
const ROOM = {
  galley: 'galley', scullery: 'galley', washrooms: 'galley', laundry: 'galley', medbay: 'medical',
  wardroom: 'quarters', lounge: 'mess', 'senior-mess': 'mess', chapel: 'quarters', 'ship-office': 'command',
  comms: 'command', 'pilots-ready': 'command', training: 'welfare', 'galley-stores': 'work', 'ship-shop': 'welfare'
};

/** The name of a room's look (a key of LOOK), and the look itself. */
export const lookKey = (c) => ROOM[c.id] ?? BY_SYSTEM[c.system] ?? 'corridor';
export const lookOf = (c) => LOOK[lookKey(c)];

const surfCache = new Map();
/** The room's surfaces (walls, deck, deckhead, trim), shaped as decor.mjs `surfaces` so `Interior` builds with them. */
export function roomSurfaces(c) {
  const L = lookOf(c);
  const key = `${L.wall}|${L.floor}|${L.tint}|${L.deck}|${L.ceil}|${L.trim}`;
  if (surfCache.has(key)) return surfCache.get(key);
  const m = (color, map, uv) => {
    const x = new THREE.MeshLambertMaterial({ color, map, flatShading: true });
    x.userData.uv = uv;
    return x;
  };
  const wall = tex(`w|${L.wall}`, 256, 512, (g, w, h) => WALLS[L.wall](g, w, h, mulberry(L.wall.length * 31)));
  const floor = tex(`f|${L.floor}`, 256, 256, (g, w, h) => FLOORS[L.floor](g, w, h, mulberry(L.floor.length * 17)));
  const ceil = tex('c', 256, 256, ceilTex);
  const s = { wall: m(L.tint, wall, [1.5, 3]), floor: m(L.deck, floor, L.floor === 'nonskid' ? [2, 2] : [2, 2]), ceil: m(L.ceil, ceil, [1.5, 1.5]), trim: new THREE.MeshLambertMaterial({ color: L.trim, flatShading: true }) };
  surfCache.set(key, s);
  return s;
}

// --- the lamps -----------------------------------------------------------------------------------------------------

/** Rooms whose lamps hang over what matters in them, as [x, z] in the room's own box (0 to 1 each way). */
const LAMPS = {
  mess: [[0.54, 0.2], [0.54, 0.45], [0.54, 0.7], [0.6, 0.92]],
  galley: [[0.3, 0.25], [0.7, 0.25], [0.5, 0.75]],
  medbay: [[0.55, 0.15], [0.7, 0.42], [0.7, 0.62], [0.5, 0.88]],
  cic: [[0.5, 0.5]],
  'eng-control': [[0.25, 0.3], [0.75, 0.3], [0.25, 0.75], [0.75, 0.75]]
};

export function roomLights(I, c) {
  const L = lookOf(c);
  const [x1, x2] = c.x, [z1, z2] = c.z, h = c.h ?? 3;
  const w = x2 - x1, d = z2 - z1, big = h > 6;
  const inten = (big ? 60 : 16) * L.k, dist = big ? 34 : 12;
  if (LAMPS[c.id]) {
    for (const [u, v] of LAMPS[c.id]) I.light(x1 + w * u, z1 + d * v, L.lamp, inten, dist, I.floorY + h);
    return;
  }
  const step = big ? 16 : 8;
  const nx = Math.max(1, Math.round(w / step)), nz = Math.max(1, Math.round(d / step));
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    I.light(x1 + (w * (i + 0.5)) / nx, z1 + (d * (k + 0.5)) / nz, L.lamp, inten, dist, I.floorY + h);
  }
}

// --- the palette and the parts ---------------------------------------------------------------------------------------

export const P = {
  steel: mat('#5b626c'), dark: mat('#2a2f36'), black: mat('#15181d'), grey: mat('#7a828c'), light: mat('#a4abb3'),
  stainless: mat('#98a0a8'), stainlessDk: mat('#6f7882'), white: mat('#dde2e8'), sheet: mat('#c9c4b6'),
  pad: mat('#3b4654'), padLight: mat('#55606e'), blanket: mat('#4d6a86'), blanket2: mat('#6a5a3e'), pillow: mat('#d0d4d6'),
  curtain: mat('#2a3c4e'), red: mat('#a8322c'), yellow: mat('#d8a530'), green: mat('#3f8a4a'), blue: mat('#3a6ea8'),
  orange: mat('#c8662a'), brown: mat('#7a5a3a'), teal: mat('#3f8f8a'), rubber: mat('#202328'), cable: mat('#1c1e22'),
  cableG: mat('#4a5058'), cableO: mat('#b8642a'), crate: mat('#6a6248'), olive: mat('#4f5a46'), table: mat('#454d57'),
  tableTop: mat('#4e5661'), laminate: mat('#5b4535'), chrome: mat('#c8ced4')
};
const G = (...parts) => {
  const g = new THREE.Group();
  g.add(...parts);
  return g;
};
/** A horizontal cylinder along x (`ax` 'x') or z. */
const rod = (r, len, m, ax = 'x', seg = 8) => {
  const c = cyl(r, r, len, m, seg);
  if (ax === 'x') c.rotation.z = Math.PI / 2;
  else c.rotation.x = Math.PI / 2;
  return G(c); // in a group of its own, so `at` can place it without undoing the turn
};

/** An acceleration couch: a gimballed shell on a post, padded, its front toward -z like `Interior.seat`, the seat at
 *  the same height so a seated crew member sits in it. */
export function couch(color = P.pad, { low = false } = {}) {
  const g = new THREE.Group();
  g.add(at(cyl(0.16, 0.24, 0.08, P.dark, 10), 0, 0.04, 0));
  g.add(at(cyl(0.07, 0.07, 0.3, P.steel, 8), 0, 0.2, 0));
  g.add(at(box(0.5, 0.06, 0.12, P.steel), 0, 0.34, 0)); // the gimbal yoke
  g.add(at(box(0.66, 0.1, 0.62, P.dark), 0, 0.4, 0));
  g.add(at(box(0.58, 0.08, 0.56, color), 0, 0.48, -0.01));
  const back = new THREE.Group();
  back.position.set(0, 0.44, 0.3);
  back.rotation.x = 0.22;
  const bh = low ? 0.55 : 0.98;
  back.add(at(box(0.66, bh, 0.1, P.dark), 0, bh / 2, 0.05));
  back.add(at(box(0.56, bh - 0.08, 0.08, color), 0, bh / 2, -0.02));
  for (const s of [-1, 1]) back.add(at(box(0.08, bh * 0.7, 0.16, color), s * 0.3, bh * 0.45, -0.06)); // side bolsters
  if (!low) back.add(at(box(0.4, 0.2, 0.12, color), 0, bh + 0.1, -0.01), at(box(0.06, 0.24, 0.16, P.dark), -0.24, bh + 0.08, 0), at(box(0.06, 0.24, 0.16, P.dark), 0.24, bh + 0.08, 0));
  g.add(back);
  for (const s of [-1, 1]) {
    g.add(at(box(0.08, 0.06, 0.5, P.dark), s * 0.36, 0.66, 0.02));
    g.add(at(box(0.06, 0.18, 0.06, P.dark), s * 0.36, 0.56, 0.22));
  }
  g.add(at(box(0.07, 0.015, 0.12, glow('#3a8ad0', 0.9)), 0.36, 0.7, -0.12)); // the armrest's pad
  // the harness: two straps over the back
  for (const s of [-0.12, 0.12]) g.add(at(box(0.05, 0.6, 0.012, P.black), s, 0.95, 0.27, 0.22, 0, 0));
  return g;
}

/** A console desk: a sloped key panel and two or three screens on a bezel, a lit edge, a recess for knees. Whoever uses
 *  it stands or sits on its +z side (like `Interior.console`). */
export function desk(w = 2.2, color = '#58b0ff', kinds = ['status', 'nav'], { low = false } = {}) {
  const g = new THREE.Group();
  g.add(at(box(w, 0.72, 0.42, P.dark), 0, 0.36, -0.2));
  g.add(at(box(w, 0.06, 0.08, P.black), 0, 0.03, 0.06)); // toe kick
  g.add(at(box(w + 0.04, 0.05, 0.62, mat('#2b3442')), 0, 0.75, -0.04, 0.12, 0, 0)); // the key panel, sloped toward you
  g.add(at(box(w - 0.3, 0.012, 0.22, glow('#14263a')), 0, 0.79, 0.02, 0.12, 0, 0));
  const r = mulberry(Math.round(w * 100) + color.length);
  for (let i = 0; i < Math.floor(w * 5); i++) {
    const c = r() < 0.15 ? '#ffb347' : r() < 0.3 ? '#39d27a' : color;
    g.add(at(box(0.05, 0.012, 0.04, glow(c, 0.9)), -w / 2 + 0.2 + r() * (w - 0.4), 0.8, -0.05 + r() * 0.12, 0.12, 0, 0));
  }
  g.add(at(box(w, 0.025, 0.025, glow(color, 0.8)), 0, 0.77, 0.27));
  // the screens on a bezel (`low`: laid back and lower, to keep a view over them, as at the helm)
  const n = kinds.length, sw = Math.min(0.9, (w - 0.2) / n - 0.06);
  const sy = low ? 0.98 : 1.15, tilt = low ? -0.75 : -0.2, sh = low ? 0.36 : 0.46;
  g.add(at(box(w - 0.1, sh + 0.16, 0.08, P.black), 0, sy - 0.01, -0.34, tilt, 0, 0));
  kinds.forEach((k, i) => {
    const x = -((n - 1) / 2) * (sw + 0.06) + i * (sw + 0.06);
    g.add(at(screen(k, color, sw, sh), x, sy, -0.29, tilt, 0, 0));
  });
  g.add(at(box(w - 0.1, 0.04, 0.12, P.dark), 0, sy + sh / 2 + 0.08 * (low ? 0.5 : 1), -0.38, tilt, 0, 0));
  return g;
}

/** Three berths stacked, a frame round them, each with its mattress, blanket and pillow, a reading lamp and a curtain
 *  drawn part way. Long along x, open toward +z. `seed` picks how each is left. */
function rack(seed, { levels = 3 } = {}) {
  const r = mulberry(seed);
  const g = new THREE.Group();
  const L = 2.1, D = 0.86, top = 2.3;
  for (const s of [-1, 1]) g.add(at(box(0.06, top, D, P.steel), s * (L / 2 + 0.03), top / 2, 0)); // end panels
  g.add(at(box(L + 0.12, 0.05, D, P.steel), 0, top, 0));
  g.add(at(box(L, top - 0.1, 0.03, P.grey), 0, top / 2, -D / 2 + 0.015)); // the back
  const ys = levels === 3 ? [0.22, 0.95, 1.62] : [0.3, 1.25];
  ys.forEach((y, i) => {
    g.add(at(box(L, 0.06, D, P.dark), 0, y, 0)); // the pan
    g.add(at(box(L - 0.06, 0.12, D - 0.06, P.sheet), 0, y + 0.09, 0)); // mattress
    const made = r() < 0.6;
    const blk = r() < 0.5 ? P.blanket : P.blanket2;
    g.add(at(box(made ? L * 0.7 : L * 0.45, 0.04, D - 0.04, blk), made ? 0.28 : 0.4 + r() * 0.1, y + 0.17, made ? 0 : 0.08 * (r() - 0.5), 0, made ? 0 : (r() - 0.5) * 0.4, 0));
    g.add(at(box(0.4, 0.09, 0.5, P.pillow), -L / 2 + 0.28, y + 0.19, -0.05));
    g.add(at(box(L, 0.03, 0.03, P.steel), 0, y + 0.3, D / 2 - 0.02)); // the rail
    g.add(at(box(0.16, 0.05, 0.08, glow(r() < 0.5 ? '#ffe2b0' : '#3a3428')), -L / 2 + 0.1, y + (i === ys.length - 1 ? top - y - 0.1 : ys[i + 1] - y - 0.12), -D / 2 + 0.1));
    g.add(at(box(0.4, 0.22, 0.06, P.dark), L / 2 - 0.3, y + 0.42, -D / 2 + 0.06)); // a shelf box
    // the curtain: a sheet hanging from the next berth's pan, pulled part way across
    const shut = r();
    if (shut > 0.25) {
      const cw = L * Math.min(0.95, shut);
      const hh = (i === ys.length - 1 ? top : ys[i + 1]) - y - 0.1;
      g.add(at(box(cw, hh, 0.02, P.curtain), -L / 2 + cw / 2, y + 0.06 + hh / 2, D / 2 + 0.01));
    }
  });
  g.add(at(box(L + 0.12, 0.03, 0.03, P.grey), 0, top - 0.05, D / 2 + 0.03)); // the curtain track
  return g;
}

/** A tall double locker with vents, handles and a name card. Front toward +z. */
function locker(w = 0.6) {
  const g = new THREE.Group();
  g.add(at(box(w, 1.95, 0.5, mat('#4a5a6e')), 0, 0.975, 0));
  g.add(at(box(0.012, 1.85, 0.01, P.black), 0, 0.98, 0.255));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) g.add(at(box(w * 0.3, 0.02, 0.01, P.black), s * w * 0.24, 1.72 - k * 0.05, 0.255));
    g.add(at(box(0.02, 0.18, 0.03, P.chrome), s * 0.05, 1.0, 0.27));
    g.add(at(box(w * 0.28, 0.06, 0.01, P.sheet), s * w * 0.24, 1.45, 0.256));
  }
  return g;
}

/** A mess table bolted to the deck with stools either side: `n` a side, long along x. `top` is the tabletop's material. */
function messTable(len, n, { stoolMat = P.steel, top = P.tableTop } = {}) {
  const g = new THREE.Group();
  g.add(at(box(len, 0.05, 0.9, top), 0, 0.74, 0));
  g.add(at(box(len, 0.04, 0.03, P.stainlessDk), 0, 0.775, 0.44), at(box(len, 0.04, 0.03, P.stainlessDk), 0, 0.775, -0.44)); // the fiddle
  g.add(at(box(len - 0.3, 0.06, 0.4, P.table), 0, 0.68, 0));
  for (const s of [-1, 1]) g.add(at(cyl(0.06, 0.08, 0.7, P.dark, 8), s * (len / 2 - 0.5), 0.35, 0), at(box(0.5, 0.03, 0.5, P.dark), s * (len / 2 - 0.5), 0.015, 0));
  for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len * (i + 0.5)) / n;
    g.add(at(cyl(0.035, 0.035, 0.44, P.dark, 6), x, 0.22, side * 0.72));
    g.add(at(cyl(0.19, 0.19, 0.06, stoolMat, 12), x, 0.46, side * 0.72));
  }
  // what is on it: a cruet, a stack of trays, mugs
  g.add(at(box(0.22, 0.12, 0.12, P.dark), 0, 0.83, 0));
  g.add(at(cyl(0.025, 0.025, 0.14, P.red, 6), -0.05, 0.84, 0), at(cyl(0.025, 0.025, 0.14, P.white, 6), 0.05, 0.84, 0));
  return g;
}

/** A rack of shelves with gear on it. Long along x, front +z. */
function shelfRack(seed, w = 1.9, items = [P.crate, P.olive, P.brown, P.white]) {
  const r = mulberry(seed);
  const g = new THREE.Group();
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) for (const z of [-0.25, 0.25]) g.add(at(box(0.04, 2.1, 0.04, P.steel), x, 1.05, z));
  for (const y of [0.1, 0.8, 1.45, 2.05]) {
    g.add(at(box(w, 0.03, 0.56, P.steel), 0, y, 0));
    if (y > 2) continue;
    let x = -w / 2 + 0.1;
    while (x < w / 2 - 0.25) {
      const bw = 0.2 + r() * 0.45, bh = 0.15 + r() * 0.4;
      if (x + bw > w / 2 - 0.08) break;
      if (r() < 0.85) g.add(at(box(bw, bh, 0.3 + r() * 0.18, items[Math.floor(r() * items.length)]), x + bw / 2, y + 0.015 + bh / 2, 0));
      x += bw + 0.04;
    }
    g.add(at(box(w, 0.02, 0.02, P.yellow), 0, y + 0.2, 0.27)); // the fiddle bar that keeps it on the shelf under thrust
  }
  return g;
}

// --- paper: posters and notices, on a lit atlas ----------------------------------------------------------------------

/** An atlas whose pages are lit like paint (Lambert), not glowing like the signs. */
class PaperAtlas extends SignAtlas {
  newPage() {
    super.newPage();
    this.page.material = new THREE.MeshLambertMaterial({ map: this.page.tex });
  }
}
const paper = (C) => (C.paper ??= new PaperAtlas(2048));

const F = (size, weight = 600) => `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`;
const MONO = (size, weight = 600) => `${weight} ${size}px ui-monospace, Menlo, monospace`;
function text(g, s, x, y, font, color, align = 'left', maxW = Infinity) {
  g.font = font;
  const wide = g.measureText(s).width;
  if (wide > maxW) g.font = font.replace(/([\d.]+)px/, (m, n) => `${(n * maxW) / wide}px`);
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}
function wrap(g, s, x, y, maxW, lh, font, color) {
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'left';
  g.textBaseline = 'top';
  let line = '';
  for (const word of s.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > maxW && line) {
      g.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = t;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}

/** The posters aboard: a safety notice or a word from the ship, each a picture drawn in its cell. */
const POSTERS = {
  burn(g, w, h) {
    g.fillStyle = '#e8e2d2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e0b020';
    g.fillRect(0, 0, w, h * 0.2);
    for (let x = -h; x < w; x += 28) {
      g.fillStyle = '#1a1a1a';
      g.beginPath();
      g.moveTo(x, h * 0.2);
      g.lineTo(x + 14, h * 0.2);
      g.lineTo(x + 14 + 10, h * 0.2 + 10);
      g.lineTo(x + 10, h * 0.2 + 10);
      g.fill();
    }
    text(g, 'SECURE FOR BURN', w / 2, h * 0.1, F(h * 0.09, 800), '#1a1a1a', 'center', w * 0.9);
    // a figure strapped into a couch
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = w * 0.025;
    g.lineCap = 'round';
    const cx = w * 0.5, cy = h * 0.52;
    g.beginPath();
    g.moveTo(cx - w * 0.25, cy + h * 0.12);
    g.lineTo(cx + w * 0.05, cy + h * 0.12);
    g.lineTo(cx + w * 0.2, cy - h * 0.12);
    g.stroke();
    g.fillStyle = '#c03020';
    g.beginPath();
    g.arc(cx + w * 0.2, cy - h * 0.17, w * 0.05, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c03020';
    g.beginPath();
    g.moveTo(cx + w * 0.17, cy - h * 0.1);
    g.lineTo(cx + w * 0.02, cy + h * 0.08);
    g.lineTo(cx - w * 0.18, cy + h * 0.08);
    g.stroke();
    g.strokeStyle = '#e0b020';
    g.lineWidth = w * 0.015;
    g.beginPath();
    g.moveTo(cx + w * 0.12, cy - h * 0.1);
    g.lineTo(cx - w * 0.02, cy + h * 0.06);
    g.stroke();
    wrap(g, 'When the burn is called, get to a couch, strap in, and stay in until the drive is secured. Nothing loose: at three g a dropped mug weighs as much as a brick.', w * 0.08, h * 0.72, w * 0.84, h * 0.045, F(h * 0.034, 500), '#222');
  },
  suit(g, w, h) {
    g.fillStyle = '#1d2a36';
    g.fillRect(0, 0, w, h);
    text(g, 'IS YOUR SUIT', w / 2, h * 0.1, F(h * 0.075, 800), '#f0f0f0', 'center', w * 0.9);
    text(g, 'READY?', w / 2, h * 0.19, F(h * 0.11, 900), '#ffb347', 'center', w * 0.9);
    g.strokeStyle = '#f0f0f0';
    g.lineWidth = w * 0.02;
    g.beginPath();
    g.arc(w / 2, h * 0.42, w * 0.18, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(120,180,230,0.45)';
    g.beginPath();
    g.ellipse(w / 2, h * 0.43, w * 0.12, w * 0.08, 0, 0, Math.PI * 2);
    g.fill();
    const items = ['Bottles full', 'Seals checked', 'Helmet on its clip', 'Radio on the ship channel'];
    items.forEach((s, i) => {
      g.strokeStyle = '#39d27a';
      g.lineWidth = 3;
      g.strokeRect(w * 0.12, h * (0.63 + i * 0.075) - h * 0.02, h * 0.04, h * 0.04);
      text(g, s, w * 0.12 + h * 0.06, h * (0.63 + i * 0.075), F(h * 0.036, 500), '#e8e8e8');
    });
  },
  breach(g, w, h) {
    g.fillStyle = '#121518';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c0c4c8';
    g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    text(g, 'THIS SHIP HAS GONE', w / 2, h * 0.17, F(h * 0.1, 700), '#d8dce0', 'center', w * 0.9);
    g.fillStyle = '#05080a';
    g.fillRect(w * 0.36, h * 0.3, w * 0.28, h * 0.38);
    text(g, '0', w / 2, h * 0.5, MONO(h * 0.34, 700), '#ff5a3a', 'center', w * 0.9);
    text(g, 'DAYS WITHOUT A HULL BREACH', w / 2, h * 0.83, F(h * 0.09, 700), '#d8dce0', 'center', w * 0.9);
  },
  quiet(g, w, h) {
    g.fillStyle = '#2b2440';
    g.fillRect(0, 0, w, h);
    text(g, 'WATCH BELOW', w / 2, h * 0.32, F(h * 0.22, 800), '#e8e0ff', 'center', w * 0.9);
    text(g, 'SLEEPING', w / 2, h * 0.6, F(h * 0.22, 800), '#b48cff', 'center', w * 0.9);
    text(g, 'Keep it down. Your turn is coming.', w / 2, h * 0.85, F(h * 0.1, 500), '#c8c0e0', 'center', w * 0.9);
  },
  loose(g, w, h) {
    g.fillStyle = '#e8e2d2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#b02a20';
    g.fillRect(0, 0, w, h * 0.3);
    text(g, 'LOOSE KIT KILLS', w / 2, h * 0.15, F(h * 0.13, 900), '#fff', 'center', w * 0.9);
    wrap(g, 'Stow it or lose it. A wrench left on a bench is a round fired across the room the first time she turns hard.', w * 0.07, h * 0.4, w * 0.86, h * 0.1, F(h * 0.075, 500), '#222');
  },
  menu(g, w, h) {
    g.fillStyle = '#1c1f1c';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6a5a3a';
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
    text(g, 'TODAY', w / 2, h * 0.11, F(h * 0.08, 800), '#f0e6c8', 'center', w * 0.9);
    const lines = [['BREAKFAST', 'Oats · eggs (real) · toast'], ['DINNER', 'Protein loaf · greens from hydro'], ['', 'Rice · gravy'], ['SUPPER', 'Soup · bread · cheese'], ['ALWAYS', 'Coffee. Lots of it.']];
    lines.forEach(([a, b], i) => {
      text(g, a, w * 0.08, h * (0.26 + i * 0.14), F(h * 0.045, 700), '#e0b060');
      text(g, b, w * 0.08, h * (0.32 + i * 0.14), F(h * 0.045, 500), '#e8e8e0');
    });
  },
  crest(g, w, h) {
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
    g.fillStyle = '#1a2a44';
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c8a24a';
    g.lineWidth = R * 0.06;
    g.beginPath();
    g.arc(cx, cy, R * 0.94, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = R * 0.02;
    g.beginPath();
    g.arc(cx, cy, R * 0.72, 0, Math.PI * 2);
    g.stroke();
    // a carrier in plan, bow up, with a fighter leaving her
    g.fillStyle = '#d8dce2';
    g.beginPath();
    g.moveTo(cx, cy - R * 0.55);
    g.lineTo(cx + R * 0.16, cy - R * 0.2);
    g.lineTo(cx + R * 0.16, cy + R * 0.5);
    g.lineTo(cx - R * 0.16, cy + R * 0.5);
    g.lineTo(cx - R * 0.16, cy - R * 0.2);
    g.closePath();
    g.fill();
    g.fillStyle = '#c8a24a';
    g.beginPath();
    g.moveTo(cx + R * 0.36, cy - R * 0.36);
    g.lineTo(cx + R * 0.44, cy - R * 0.14);
    g.lineTo(cx + R * 0.28, cy - R * 0.14);
    g.fill();
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + ((i - 3) * Math.PI) / 9;
      g.beginPath();
      g.arc(cx + Math.cos(a) * R * 0.83, cy + Math.sin(a) * R * 0.83, R * 0.03, 0, Math.PI * 2);
      g.fill();
    }
    g.save();
    g.translate(cx, cy);
    g.font = F(R * 0.12, 800);
    g.fillStyle = '#c8a24a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const words = 'EVERY HAND · EVERY WATCH';
    const span = Math.PI * 0.7;
    [...words].forEach((ch, i) => {
      const a = Math.PI / 2 + span / 2 - (span * i) / (words.length - 1);
      g.save();
      g.rotate(a);
      g.translate(R * 0.83, 0);
      g.rotate(-Math.PI / 2);
      g.fillText(ch, 0, 0);
      g.restore();
    });
    g.restore();
  },
  board(g, w, h, seed = 3) {
    const r = mulberry(seed);
    g.fillStyle = '#6a5640';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#8a7054';
    g.fillRect(8, 8, w - 16, h - 16);
    for (let i = 0; i < 9; i++) {
      const pw = w * (0.18 + r() * 0.1), ph = h * (0.22 + r() * 0.15);
      const x = 14 + r() * (w - pw - 28), y = 14 + r() * (h - ph - 28);
      g.save();
      g.translate(x + pw / 2, y + ph / 2);
      g.rotate((r() - 0.5) * 0.12);
      g.fillStyle = ['#f2efe6', '#f4e8a0', '#e6eef4', '#f2efe6'][Math.floor(r() * 4)];
      g.fillRect(-pw / 2, -ph / 2, pw, ph);
      g.fillStyle = 'rgba(40,40,40,0.6)';
      for (let k = 0; k < 6; k++) g.fillRect(-pw / 2 + 6, -ph / 2 + 10 + k * (ph / 8), pw * (0.4 + r() * 0.45), 2);
      g.fillStyle = ['#c0302a', '#2a6ac0', '#2a9a4a'][Math.floor(r() * 3)];
      g.beginPath();
      g.arc(0, -ph / 2 + 4, 3, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  },
  cross(g, w, h) {
    g.fillStyle = '#f2f4f6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2aa070';
    const t = w * 0.26;
    g.fillRect((w - t) / 2, h * 0.08, t, h * 0.62);
    g.fillRect(w * 0.13, h * 0.08 + (h * 0.62 - t) / 2, w * 0.74, t);
    text(g, 'SICK BAY', w / 2, h * 0.86, F(h * 0.11, 800), '#1d6a4a', 'center', w * 0.9);
  },
  triage(g, w, h) {
    g.fillStyle = '#f2f4f6';
    g.fillRect(0, 0, w, h);
    text(g, 'TRIAGE', w * 0.06, h * 0.1, F(h * 0.08, 800), '#222');
    const rows = [['#c0302a', 'IMMEDIATE', 'Airway · bleeding · decompression'], ['#e0a020', 'URGENT', 'Burns · fractures · g injury'], ['#2a9a4a', 'DELAYED', 'Walking wounded'], ['#202020', 'EXPECTANT', '']];
    rows.forEach(([c, a, b], i) => {
      const y = h * (0.24 + i * 0.18);
      g.fillStyle = c;
      g.fillRect(w * 0.06, y, w * 0.12, h * 0.12);
      text(g, a, w * 0.22, y + h * 0.035, F(h * 0.05, 700), '#222');
      text(g, b, w * 0.22, y + h * 0.09, F(h * 0.036, 500), '#444');
    });
  },
  hangar(g, w, h) {
    g.clearRect(0, 0, w, h);
    text(g, 'HANGAR ONE', w / 2, h * 0.42, F(h * 0.62, 900), 'rgba(230,232,236,0.92)', 'center', w * 0.9);
    g.fillStyle = 'rgba(232,184,48,0.95)';
    g.fillRect(w * 0.08, h * 0.86, w * 0.84, h * 0.08);
  },
  clear(g, w, h) {
    g.fillStyle = '#e8b830';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#141414';
    g.fillRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
    text(g, 'STAND CLEAR OF THE BAY WHEN THE DOORS MOVE', w / 2, h / 2, F(h * 0.36, 800), '#e8b830', 'center', w * 0.9);
  },
  fod(g, w, h) {
    g.fillStyle = '#e8e2d2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a3a6a';
    g.fillRect(0, 0, w, h * 0.28);
    text(g, 'FOD WALK', w / 2, h * 0.14, F(h * 0.14, 900), '#fff', 'center', w * 0.9);
    wrap(g, 'Before any launch, every hand on deck walks the lane, shoulder to shoulder. A bolt in the lane goes out the bay at forty metres a second.', w * 0.07, h * 0.36, w * 0.86, h * 0.1, F(h * 0.068, 500), '#222');
  }
};
/** A poster `kind`, `w` × `h` metres, on a wall at (x, y over the deck, z), facing `ry`. */
function poster(C, I, kind, w, h, x, y, z, ry, opts) {
  const m = paper(C).plane(w, h, (g, pw, ph) => POSTERS[kind](g, pw, ph, opts), 260);
  I.group.add(at(m, x, I.floorY + y, z, 0, ry, 0));
  mark(I, x, z, w);
  return m;
}
/** Something flat on a wall at (x, z), `w` wide: `dressRoom` puts no frame across it. */
function mark(I, x, z, w) {
  (I.onWalls ??= []).push({ x, z, w });
}
/** A screen on a wall (`Interior.screen`), marked so no frame stands across it. */
function wallScreen(I, kind, x, y, z, ry, color, w, h) {
  mark(I, x, z, w);
  return I.screen(kind, x, y, z, ry, color, w, h);
}

// --- every room: the structure showing ------------------------------------------------------------------------------

const BANDS = [P.green, P.blue, P.brown, P.orange];
/** Which long wall a room's deckhead services run along (null: none, the set has its own). */
const SERVICES = { galley: null, 'eng-control': null, medbay: 'w', mess: 'w', cic: 'e', bridge: 's' };
const pipeMat = mat('#8a9098');

/** Frames, deckhead services and lit coves for an ordinary room (not a passage, not the hangar). */
export function dressRoom(C, I, c, open) {
  if (c.system === 'corridor' || c.system === 'hangar') return;
  const L = lookOf(c), S = I.s, y = I.floorY, h = c.h ?? 3;
  const [x1, x2] = c.x, [z1, z2] = c.z;
  const w = x2 - x1, d = z2 - z1;
  const alongZ = d >= w, span = alongZ ? d : w, across = alongZ ? w : d;
  const g = I.group;
  // A frame under each deckhead beam (layout.mjs `room` puts the beams every 3 m along the long way): a stiffener up each
  // long wall, with a bracket where it meets the beam. Not across a door or a window.
  const walls = alongZ ? [['w', x1, 1], ['e', x2, -1]] : [['n', z1, 1], ['s', z2, -1]];
  const c0 = alongZ ? (z1 + z2) / 2 : (x1 + x2) / 2;
  for (let t = -span / 2 + 1.5; t < span / 2 - 0.5; t += 3) {
    const a = c0 + t;
    for (const [side, line, inward] of walls) {
      if (open[side].some((o) => o.a < a + 0.45 && o.b > a - 0.45)) continue;
      if ((I.onWalls ?? []).some((m) => Math.abs((alongZ ? m.z : m.x) - a) < m.w / 2 + 0.25 && Math.abs((alongZ ? m.x : m.z) - line) < 0.6)) continue;
      const p = line + inward * 0.17;
      g.add(alongZ ? at(box(0.14, h - 0.1, 0.2, S.trim), p, y + h / 2, a) : at(box(0.2, h - 0.1, 0.14, S.trim), a, y + h / 2, p));
      g.add(alongZ ? at(box(0.34, 0.34, 0.1, S.trim), line + inward * 0.27, y + h - 0.3, a, 0, 0, inward * 0.78) : at(box(0.1, 0.34, 0.34, S.trim), a, y + h - 0.3, line + inward * 0.27, -inward * 0.78, 0, 0));
    }
  }
  // Services along the deckhead, against the long wall with fewer doors: a cable tray and two pipes, banded by what
  // they carry, hung from the beams.
  const pref = SERVICES[c.id];
  if (across >= 3.6 && pref !== null) {
    const doors = (k) => open[k].length + (open[k].some((o) => o.kind === 'window') ? 9 : 0);
    // (A preferred wall that is not one of this room's long walls, as in a drum room of the same name, is ignored.)
    const [, line, inward] = (pref && walls.find((w) => w[0] === pref)) || (doors(walls[0][0]) <= doors(walls[1][0]) ? walls[0] : walls[1]);
    const len = span - 0.1;
    const run = (off, yy, mesh) => g.add(alongZ ? at(mesh, line + inward * off, y + h - yy, c0) : at(mesh, c0, y + h - yy, line + inward * off));
    run(0.55, 0.36, alongZ ? box(0.46, 0.04, len, P.steel) : box(len, 0.04, 0.46, P.steel));
    for (const e of [-0.22, 0.22]) run(0.55 + e, 0.31, alongZ ? box(0.02, 0.1, len, P.steel) : box(len, 0.1, 0.02, P.steel));
    [[0.42, P.cable, 0.04], [0.52, P.cableG, 0.035], [0.62, P.cableO, 0.03], [0.7, P.cable, 0.045]].forEach(([o, m, r]) => run(o, 0.3, rod(r, len, m, alongZ ? 'z' : 'x', 6)));
    const pipes = [[1.0, 0.26, 0.06], [1.18, 0.3, 0.045]];
    pipes.forEach(([o, yy, r], i) => {
      run(o, yy, rod(r, len, pipeMat, alongZ ? 'z' : 'x', 8));
      for (let t = -span / 2 + 0.8 + i * 0.6; t < span / 2 - 0.4; t += 3) {
        const a = c0 + t, band = rod(r + 0.01, 0.16, BANDS[(i + Math.round(c0)) & 3], alongZ ? 'z' : 'x', 8);
        g.add(alongZ ? at(band, line + inward * o, y + h - yy, a) : at(band, a, y + h - yy, line + inward * o));
      }
    });
    for (let t = -span / 2 + 0.75; t < span / 2; t += 1.5) {
      const a = c0 + t;
      for (const o of [0.33, 0.77]) g.add(alongZ ? at(box(0.02, 0.3, 0.02, P.steel), line + inward * o, y + h - 0.17, a) : at(box(0.02, 0.3, 0.02, P.steel), a, y + h - 0.17, line + inward * o));
    }
  }
  // A lit cove along the top of every wall without a window in it.
  if (L.cove) {
    const cm = glow(new THREE.Color(L.cove).multiplyScalar(0.75).getStyle(), 1);
    for (const [side, line, a0, b0, alongX, inward] of [['n', z1, x1, x2, true, 1], ['s', z2, x1, x2, true, -1], ['w', x1, z1, z2, false, 1], ['e', x2, z1, z2, false, -1]]) {
      if (open[side].some((o) => o.kind === 'window')) continue;
      const len = b0 - a0 - 0.6, mid = (a0 + b0) / 2;
      if (len < 0.5) continue;
      g.add(alongX ? at(box(len, 0.025, 0.04, cm), mid, y + h - 0.2, line + inward * 0.19) : at(box(0.04, 0.025, len, cm), line + inward * 0.19, y + h - 0.2, mid));
    }
  }
}

// --- the sets ------------------------------------------------------------------------------------------------------

/** `Interior.prop` with the turn as its own argument: place(I, mesh, x, z, ry, opts), or place(I, mesh, x, z, opts). */
const place = (I, mesh, x, z, ry = 0, opts = {}) => {
  if (typeof ry === 'object') (opts = ry), (ry = opts.ry ?? 0);
  return I.prop(mesh, x, z, { ...opts, ry });
};

function bridge(C, I, c, hooks) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  // Laid out from the helm (the layout's `helm.at`: today's ship has it 3.5 m in from the forward bulkhead), so the
  // set stands in any ship's bridge.
  const hz = C.L.helm?.at[1] ?? z1 + 3.5;
  // The helm forward, under the windows, flanked by navigation and sensors; the officer of the watch's couch on a step
  // behind; the status and comms banks on the side walls; the plot over the aft door.
  place(I, desk(3.0, '#58b0ff', ['nav', 'target', 'nav'], { low: true }), 0, hz - 1.7);
  place(I, couch(P.pad), 0, hz);
  I.use('helm', 'Take the helm', 0, hz - 0.4, () => hooks.helm?.(), { r: 2.2 });
  for (const s of [-1, 1]) {
    place(I, desk(2.4, s < 0 ? '#39d27a' : '#ff6a50', s < 0 ? ['nav', 'status'] : ['radar', 'target']), s * 4, hz + 0.3);
    place(I, couch(P.pad, { low: true }), s * 4, hz + 2);
  }
  // The command step: a low dais, its couch, two repeaters on arms.
  place(I, box(4.2, 0.18, 2.6, P.dark), 0, hz + 7, { y: 0.09, collide: false });
  I.group.add(at(box(4.2, 0.02, 0.04, glow('#2f6fc0')), 0, y + 0.18, hz + 5.7));
  place(I, couch(mat('#5a4a30')), 0, hz + 7, { y: 0.18 });
  for (const s of [-1, 1]) {
    I.group.add(at(cyl(0.03, 0.03, 0.6, P.steel, 6), s * 0.75, y + 0.9, hz + 6.4));
    I.group.add(at(screen(s < 0 ? 'status' : 'radar', '#58b0ff', 0.42, 0.28), s * 0.75, y + 1.3, hz + 6.25, -0.3, s * -0.4, 0));
    I.group.add(at(box(0.46, 0.32, 0.03, P.black), s * 0.75, y + 1.3, hz + 6.28, -0.3, s * -0.4, 0));
  }
  place(I, desk(2.6, '#ffb347', ['status', 'reactor']), x1 + 0.75, hz + 7.5, { ry: Math.PI / 2 });
  place(I, desk(2.6, '#b48cff', ['text', 'status']), x2 - 0.75, hz + 7.5, { ry: -Math.PI / 2 });
  // Overhead: a ring of repeaters over the helm, out of the line of the windows.
  I.group.add(at(box(3.4, 0.06, 0.5, P.dark), 0, y + 3.3, hz + 1.4));
  for (const s of [-1, 0, 1]) I.group.add(at(screen(['status', 'nav', 'status'][s + 1], '#58b0ff', 0.9, 0.36), s * 1.05, y + 3.05, hz + 1.62, 0.25, Math.PI, 0));
  // The aft bulkhead: the big plot over the door, lockers and the damage board either side of it.
  I.screen('map', 0, 2.65, z2 - 0.14, Math.PI, '#58b0ff', 3.2, 0.9);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) place(I, locker(0.6), s * (2.6 + k * 0.64), z2 - 0.3, { ry: Math.PI });
    poster(C, I, s < 0 ? 'burn' : 'suit', 0.62, 0.86, s < 0 ? -5.0 : 4.85, 1.55, z2 - 0.12, Math.PI);
  }
  // Grab rails along the side walls, for when she turns hard.
  for (const s of [-1, 1]) I.group.add(at(box(0.04, 0.04, 9, P.chrome), s * (x2 - 0.12), y + 1.15, hz + 3));
}

function cic(C, I, c) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  // The plot: a dark table with a lit chart in its top, and the picture standing over it (setsFrame turns it).
  const tx = cx + 0.6, tw = 2.6, td = 5.4;
  place(I, G(at(box(tw, 0.86, td, P.dark), 0, 0.43, 0), at(box(tw + 0.16, 0.06, td + 0.16, P.black), 0, 0.89, 0)), tx, cz);
  const chart = C.atlas.plane(tw - 0.2, td - 0.2, (g, pw, ph) => {
    g.fillStyle = '#031018';
    g.fillRect(0, 0, pw, ph);
    g.strokeStyle = 'rgba(80,170,255,0.35)';
    g.lineWidth = 1;
    for (let x = 0; x < pw; x += pw / 10) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, ph), g.stroke());
    for (let yy = 0; yy < ph; yy += pw / 10) (g.beginPath(), g.moveTo(0, yy), g.lineTo(pw, yy), g.stroke());
    g.strokeStyle = 'rgba(120,200,255,0.8)';
    g.lineWidth = 2;
    for (const k of [0.15, 0.3, 0.45]) (g.beginPath(), g.arc(pw / 2, ph / 2, pw * k, 0, Math.PI * 2), g.stroke());
    g.fillStyle = '#ff6a50';
    for (const [u, v] of [[0.2, 0.15], [0.8, 0.3], [0.7, 0.8]]) g.fillRect(u * pw - 4, v * ph - 4, 8, 8);
    g.fillStyle = '#39d27a';
    g.fillRect(pw / 2 - 5, ph / 2 - 10, 10, 20);
  }, 90);
  I.group.add(at(chart, tx, y + 0.925, cz, -Math.PI / 2, 0, 0));
  const holo = new THREE.Group();
  holo.userData.live = true;
  const lm = new THREE.LineBasicMaterial({ color: '#4fb8ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  holo.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.9, 1)), lm));
  const ring = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.TorusGeometry(1.1, 0.002, 2, 48)), lm);
  ring.rotation.x = Math.PI / 2;
  holo.add(ring);
  const dot = (color, x, yy, z, s = 0.06) => holo.add(at(new THREE.Mesh(new THREE.OctahedronGeometry(s), glow(color)), x, yy, z));
  dot('#39d27a', 0, 0, 0, 0.09);
  dot('#ff6a50', 0.7, 0.3, -0.4);
  dot('#ff6a50', -0.5, -0.2, 0.6);
  dot('#ffb347', 0.2, 0.6, 0.5, 0.05);
  holo.position.set(tx, y + 1.85, cz);
  I.group.add(holo);
  (C.anim ??= []).push((dt) => (holo.rotation.y += dt * 0.15));
  // Consoles round the walls with couches, clear of the doors and the plotter's place.
  place(I, desk(2.0, '#58b0ff', ['radar', 'target']), x1 + 0.5, z1 + 2.2, { ry: Math.PI / 2 });
  place(I, couch(P.pad, { low: true }), x1 + 1.45, z1 + 2.2, { ry: Math.PI / 2 });
  place(I, desk(2.0, '#58b0ff', ['nav', 'status']), x1 + 0.5, z2 - 2.2, { ry: Math.PI / 2 });
  place(I, couch(P.pad, { low: true }), x1 + 1.45, z2 - 2.2, { ry: Math.PI / 2 });
  place(I, desk(1.8, '#ff6a50', ['target', 'status']), x2 - 0.5, z1 + 2.6, { ry: -Math.PI / 2 });
  place(I, desk(1.8, '#ffb347', ['status', 'radar']), x2 - 0.5, z2 - 2.0, { ry: -Math.PI / 2 });
  // The forward bulkhead: the tactical picture, beside the door.
  wallScreen(I, 'radar', x1 + 1.9, 1.9, z1 + 0.14, 0, '#58b0ff', 2.6, 1.4);
  I.group.add(at(box(2.8, 1.6, 0.06, P.black), x1 + 1.9, y + 1.9, z1 + 0.11));
  for (const z of [cz - 2.5, cz + 2.5]) wallScreen(I, 'map', x1 + 0.15, 2.2, z, Math.PI / 2, '#58b0ff', 1.6, 0.6);
  poster(C, I, 'loose', 0.8, 0.5, x2 - 0.12, 1.7, cz - 1.6, -Math.PI / 2);
}

function mess(C, I, c) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  // Tables across the room, stools bolted either side; the first row's inboard stool is where a hand sits at dinner
  // (the layout's station).
  const tx = x1 + 5.4, len = 4.2;
  for (const z of [z1 + 3.35, z1 + 7.65, z1 + 11.95]) place(I, messTable(len, 3), tx, z);
  // The aft end: the drinks bar and the tray return.
  const bar = G(at(box(4.4, 0.92, 0.7, P.stainlessDk), 0, 0.46, 0), at(box(4.5, 0.05, 0.75, P.stainless), 0, 0.945, 0));
  for (let i = 0; i < 3; i++) {
    const x = -1.5 + i * 1.5;
    bar.add(at(box(0.6, 0.75, 0.5, P.dark), x, 1.35, -0.1));
    bar.add(at(box(0.36, 0.2, 0.02, glow(['#ffb347', '#58b0ff', '#e0e0e0'][i], 0.9)), x, 1.55, 0.16));
    bar.add(at(box(0.18, 0.02, 0.2, P.black), x, 1.02, 0.05));
  }
  place(I, bar, tx, z2 - 0.4, { ry: Math.PI });
  place(I, G(at(box(1.4, 1.4, 0.5, P.steel), 0, 0.7, 0), ...[0.3, 0.55, 0.8, 1.05].map((yy) => at(box(1.3, 0.04, 0.45, P.light), 0, yy, 0.02))), x2 - 0.35, z2 - 2.6, { ry: -Math.PI / 2 });
  // The outboard wall: a long counter (condiments, cutlery, the urn), the menu over it.
  const ctr = G(at(box(5.2, 0.9, 0.6, P.stainlessDk), 0, 0.45, 0), at(box(5.3, 0.05, 0.65, P.stainless), 0, 0.925, 0));
  ctr.add(at(cyl(0.2, 0.2, 0.55, P.chrome, 12), -1.8, 1.23, 0), at(box(0.06, 0.06, 0.12, P.dark), -1.8, 1.08, 0.22));
  for (let i = 0; i < 6; i++) ctr.add(at(box(0.28, 0.14, 0.2, [P.red, P.white, P.yellow, P.green][i & 3]), -0.6 + i * 0.36, 1.02, 0));
  place(I, ctr, x2 - 0.35, z1 + 6.5, { ry: -Math.PI / 2 });
  poster(C, I, 'menu', 1.1, 1.4, x2 - 0.13, 1.95, z1 + 6.5, -Math.PI / 2);
  wallScreen(I, 'status', x2 - 0.15, 2.0, z1 + 10.6, -Math.PI / 2, '#e0b060', 1.6, 0.8);
  // The forward bulkhead: the ship's crest and the notice board.
  poster(C, I, 'crest', 1.7, 1.7, tx + 0.4, 1.75, z1 + 0.12, 0);
  poster(C, I, 'board', 1.6, 1.0, x2 - 1.6, 1.6, z1 + 0.12, 0, 7);
  poster(C, I, 'breach', 1.0, 0.62, x1 + 2.6, 2.0, z1 + 0.12, 0);
  // The inboard wall, either side of the door.
  poster(C, I, 'loose', 0.8, 0.5, x1 + 0.12, 1.7, z1 + 3.4, Math.PI / 2);
  poster(C, I, 'burn', 0.62, 0.86, x1 + 0.12, 1.6, z2 - 3.2, Math.PI / 2);
}

function galley(C, I, c) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  const cx = (x1 + x2) / 2;
  // The cooking line along the forward bulkhead: ranges, the combi ovens, the kettle, under one hood.
  const line = new THREE.Group();
  const W = x2 - x1 - 0.4;
  line.add(at(box(W, 0.9, 0.85, P.stainlessDk), 0, 0.45, 0), at(box(W, 0.05, 0.9, P.stainless), 0, 0.925, 0));
  for (const x of [-2.2, -1.4]) {
    line.add(at(box(0.7, 0.02, 0.6, P.black), x, 0.96, 0));
    for (const [dx, dz] of [[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]]) line.add(at(cyl(0.12, 0.12, 0.012, glow('#5a1408'), 12), x + dx, 0.975, dz));
  }
  line.add(at(cyl(0.16, 0.16, 0.24, P.chrome, 12), -2.37, 1.1, -0.15), at(cyl(0.22, 0.2, 0.14, P.dark, 12), -1.25, 1.04, 0.12));
  line.add(at(box(1.0, 1.1, 0.8, P.stainless), 0.1, 1.5, -0.02), at(box(0.7, 0.5, 0.02, P.black), 0.1, 1.55, 0.39), at(box(0.12, 0.05, 0.02, glow('#39d27a')), 0.48, 1.9, 0.39));
  line.add(at(cyl(0.42, 0.36, 0.55, P.stainless, 14), 1.4, 1.2, 0), at(box(0.12, 0.5, 0.1, P.dark), 1.9, 1.15, 0));
  line.add(at(box(0.8, 0.02, 0.6, P.stainlessDk), 2.4, 0.97, 0));
  // the hood, and its filters
  line.add(at(box(W, 0.5, 1.1, P.stainless), 0, 2.6, 0.1), at(box(W - 0.2, 0.02, 0.9, mat('#5d646c')), 0, 2.34, 0.15));
  for (let i = 0; i < 6; i++) line.add(at(box(0.04, 0.2, 0.9, P.stainlessDk), -W / 2 + 0.6 + i * (W - 1.2) / 5, 2.44, 0.15));
  place(I, line, cx, z1 + 0.5, { ry: 0, collide: true });
  // Prep along the aft bulkhead: counters, two sinks, the dishwasher, pots on the shelf over them.
  const prep = new THREE.Group();
  prep.add(at(box(W, 0.9, 0.7, P.stainlessDk), 0, 0.45, 0), at(box(W, 0.05, 0.75, P.stainless), 0, 0.925, 0));
  for (const x of [-1.6, -0.8]) prep.add(at(box(0.6, 0.03, 0.45, P.black), x, 0.94, 0.05), at(box(0.04, 0.3, 0.04, P.chrome), x, 1.1, -0.25));
  prep.add(at(box(0.9, 0.85, 0.66, P.stainless), 1.3, 0.43, 0.04), at(box(0.1, 0.04, 0.02, glow('#58b0ff')), 1.6, 0.8, 0.38));
  prep.add(at(box(W, 0.04, 0.4, P.stainless), 0, 1.75, -0.15));
  for (let i = 0; i < 6; i++) prep.add(at(cyl(0.13 + (i % 3) * 0.04, 0.13 + (i % 3) * 0.04, 0.18 + (i % 2) * 0.12, P.chrome, 10), -2.3 + i * 0.9, 1.88 + (0.09 + (i % 2) * 0.06), -0.15));
  place(I, prep, cx, z2 - 0.42, { ry: Math.PI });
  // The prep island, with a hanging rail of pans over it; tall fridges in the corners.
  const island = G(at(box(2.4, 0.9, 0.9, P.stainlessDk), 0, 0.45, 0), at(box(2.5, 0.06, 1.0, mat('#8a6a48')), 0, 0.93, 0));
  for (let i = 0; i < 4; i++) island.add(at(box(0.3, 0.06, 0.2, P.white), -0.8 + i * 0.5, 0.99, (i % 2 ? 0.2 : -0.2)));
  place(I, island, cx, z2 - 2.55);
  I.group.add(at(box(2.2, 0.04, 0.04, P.chrome), cx, y + 2.35, z2 - 2.55));
  for (let i = 0; i < 5; i++) I.group.add(at(cyl(0.15, 0.13, 0.08, P.dark, 10), cx - 0.9 + i * 0.45, y + 2.1, z2 - 2.55), at(box(0.02, 0.22, 0.02, P.chrome), cx - 0.9 + i * 0.45, y + 2.24, z2 - 2.55));
  for (const s of [-1, 1]) {
    const fr = G(at(box(0.9, 2.1, 0.75, P.stainless), 0, 1.05, 0), at(box(0.01, 2.0, 0.01, P.black), 0, 1.05, 0.38), at(box(0.03, 0.4, 0.04, P.chrome), -0.06, 1.2, 0.4), at(box(0.03, 0.4, 0.04, P.chrome), 0.06, 1.2, 0.4));
    place(I, fr, s < 0 ? x1 + 0.45 : x2 - 0.45, z2 - 2.2, { ry: s < 0 ? Math.PI / 2 : -Math.PI / 2 });
  }
  poster(C, I, 'loose', 0.8, 0.5, x1 + 0.12, 1.7, z1 + 2.6, Math.PI / 2);
}

function quarters(C, I, c, open) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  const port = (x1 + x2) / 2 < 0, s = port ? 1 : -1, wall = port ? x1 : x2;
  // Racks three high along the outboard wall, a double locker between each, the curtains drawn by whoever is in.
  let k = 0;
  for (let z = z1 + 1.6; z < z2 - 1.2; z += 3.2, k++) {
    place(I, rack(c.id.length * 13 + k * 7), wall + s * 0.5, z, { ry: port ? Math.PI / 2 : -Math.PI / 2 });
    place(I, locker(0.9), wall + s * 0.3, z + 1.6, { ry: port ? Math.PI / 2 : -Math.PI / 2 });
  }
  // The other side: lockers down the inboard wall where there is no door, a table with its stools in the middle.
  const inner = port ? x2 : x1;
  const side = port ? 'e' : 'w';
  for (let z = z1 + 0.6; z < z2 - 0.4; z += 0.66) {
    if (open[side].some((o) => o.a < z + 1.2 && o.b > z - 1.2)) continue;
    place(I, locker(0.6), inner - s * 0.3, z, { ry: port ? -Math.PI / 2 : Math.PI / 2 });
  }
  const t = messTable(2.6, 2, { stoolMat: P.pad });
  place(I, t, (x1 + x2) / 2 + s * 0.4, (z1 + z2) / 2 + 3.2, { ry: Math.PI / 2 });
  // A screen on the forward bulkhead, the poster asking for quiet, a kit bag or two on the deck.
  I.screen('text', (x1 + x2) / 2, 1.8, z1 + 0.14, 0, '#ffb070', 1.2, 0.7);
  poster(C, I, 'quiet', 1.1, 0.5, (x1 + x2) / 2, 2.35, z2 - 0.12, Math.PI);
  poster(C, I, 'suit', 0.62, 0.86, (x1 + x2) / 2 + 1.6, 1.6, z1 + 0.12, 0);
  const r = mulberry(c.id.length * 5);
  for (let i = 0; i < 3; i++) place(I, G(at(cyl(0.18, 0.18, 0.7, r() < 0.5 ? P.olive : P.blanket, 8), 0, 0.18, 0, 0, 0, Math.PI / 2)), wall + s * (1.3 + r() * 0.3), z1 + 1.6 + Math.floor(r() * 4) * 3.2 + 0.4, { ry: r() * 3, collide: false });
}

function medbay(C, I, c) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  // The ward: three beds head to the outboard wall, each with its monitor on an arm and a curtain on a track.
  for (let i = 0; i < 3; i++) {
    const z = z1 + 5.2 + i * 3.2;
    const bed = G(
      at(box(2.0, 0.5, 0.95, P.steel), 0, 0.3, 0), at(box(1.95, 0.14, 0.9, P.white), 0, 0.62, 0),
      at(box(1.3, 0.05, 0.92, mat('#9ac0d0')), 0.3, 0.71, 0), at(box(0.4, 0.1, 0.6, P.pillow), -0.75, 0.73, 0),
      at(box(0.06, 0.6, 0.95, P.steel), -1.02, 0.75, 0), at(box(1.2, 0.04, 0.03, P.chrome), 0.2, 0.9, 0.5), at(box(1.2, 0.04, 0.03, P.chrome), 0.2, 0.9, -0.5)
    );
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.4, 0.4]) bed.add(at(cyl(0.05, 0.05, 0.06, P.black, 8), sx, 0.05, sz, Math.PI / 2, 0, 0));
    place(I, bed, x2 - 1.1, z, { ry: Math.PI });
    I.group.add(at(cyl(0.03, 0.03, 0.9, P.steel, 6), x2 - 0.25, y + 1.7, z - 0.7), at(box(0.6, 0.05, 0.05, P.steel), x2 - 0.5, y + 2.15, z - 0.7));
    I.group.add(at(screen('reactor', '#39d27a', 0.5, 0.34), x2 - 0.8, y + 1.85, z - 0.7, 0, -Math.PI / 2 + 0.4, 0));
    I.group.add(at(box(0.56, 0.4, 0.04, P.black), x2 - 0.82, y + 1.85, z - 0.72, 0, -Math.PI / 2 + 0.4, 0));
    // the IV pole
    place(I, G(at(cyl(0.02, 0.02, 1.9, P.chrome, 6), 0, 0.95, 0), at(cyl(0.22, 0.22, 0.03, P.chrome, 5), 0, 0.03, 0), at(box(0.12, 0.2, 0.04, mat('#cfe6f0')), 0.08, 1.75, 0)), x2 - 2.3, z + 0.65, { collide: false });
    if (i < 2) {
      I.group.add(at(box(0.03, 0.03, 2.4, P.chrome), x2 - 1.2, y + 2.85, z + 1.6, 0, Math.PI / 2, 0));
      const cl = 0.6 + (i * 0.7);
      I.group.add(at(box(cl, 2.3, 0.02, mat('#7ab0b8')), x2 - 0.4 - cl / 2, y + 1.65, z + 1.6));
    }
  }
  // The treatment bay aft: the table under its lamp, the trolley, the cabinets, the crash cart, the oxygen.
  const tz = z2 - 2.8, tx = (x1 + x2) / 2 + 0.6;
  place(I, G(at(cyl(0.2, 0.3, 0.6, P.steel, 10), 0, 0.3, 0), at(box(0.7, 0.12, 2.0, P.white), 0, 0.68, 0), at(box(0.62, 0.06, 1.9, mat('#3f8f8a')), 0, 0.77, 0)), tx, tz);
  const lamp = G(at(cyl(0.02, 0.02, 0.6, P.steel, 6), 0, -0.3, 0), at(cyl(0.45, 0.3, 0.14, P.white, 18), 0, -0.65, 0), at(cyl(0.38, 0.38, 0.01, glow('#f4f8ff'), 18), 0, -0.725, 0));
  I.group.add(at(lamp, tx, y + 3, tz));
  place(I, G(at(box(0.9, 0.04, 0.5, P.chrome), 0, 0.9, 0), at(box(0.9, 0.04, 0.5, P.chrome), 0, 0.4, 0), ...[[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]].map(([a, b]) => at(box(0.03, 0.9, 0.03, P.chrome), a, 0.45, b)), at(box(0.3, 0.04, 0.2, P.steel), -0.2, 0.94, 0)), tx - 1.6, tz + 0.6);
  for (let i = 0; i < 4; i++) {
    const cab = G(at(box(1.0, 2.0, 0.45, P.white), 0, 1.0, 0), at(box(0.9, 0.9, 0.01, mat('#bfd8e0')), 0, 1.5, 0.23), at(box(0.01, 0.8, 0.01, P.grey), 0, 0.5, 0.23));
    if (i === 1) cab.add(at(box(0.2, 0.06, 0.012, P.green), 0, 1.75, 0.235), at(box(0.06, 0.2, 0.012, P.green), 0, 1.75, 0.235));
    place(I, cab, x1 + 1.2 + i * 1.05, z2 - 0.28, { ry: Math.PI });
  }
  place(I, G(at(box(0.6, 1.0, 0.5, P.red), 0, 0.55, 0), ...[0.3, 0.55, 0.8].map((yy) => at(box(0.56, 0.02, 0.01, P.black), 0, yy, 0.255)), at(box(0.4, 0.25, 0.3, P.dark), 0, 1.18, 0)), x2 - 0.5, z2 - 1.0, { ry: -Math.PI / 2 });
  for (let i = 0; i < 3; i++) I.group.add(at(cyl(0.11, 0.11, 1.2, P.green, 10), x2 - 0.2, y + 0.6, z2 - 2.2 - i * 0.26), at(cyl(0.04, 0.04, 0.12, P.chrome, 6), x2 - 0.2, y + 1.26, z2 - 2.2 - i * 0.26));
  // The medic's desk by the door, the waiting bench, the cross and the triage chart.
  place(I, desk(1.6, '#3ac0b0', ['status', 'text']), x1 + 2.2, z1 + 0.5);
  place(I, couch(mat('#3f7f8a'), { low: true }), x1 + 2.2, z1 + 1.5);
  place(I, G(at(box(2.4, 0.45, 0.45, P.pad), 0, 0.23, 0), at(box(2.4, 0.5, 0.08, P.pad), 0, 0.7, -0.2)), x2 - 1.6, z1 + 0.4);
  poster(C, I, 'cross', 0.9, 0.9, x2 - 1.6, 1.85, z1 + 0.12, 0);
  poster(C, I, 'triage', 0.7, 0.9, x1 + 0.12, 1.7, z2 - 3.6, Math.PI / 2);
}

function engControl(C, I, c, open = { n: [], s: [], w: [], e: [] }) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY, h = c.h ?? 3;
  // Laid out from the aft bulkhead (the window onto the reactor) and the room's middle, across its width (drawn for
  // today's ship's 16 m room: `X` scales an x across a narrower one).
  const cx = (x1 + x2) / 2, k = Math.min(1, (x2 - x1) / 16), X = (x) => cx + x * k, Z = (z) => z2 - (146 - z);
  const sideDoor = open.w.some((o) => o.kind === 'door'); // the mimic board's wall has the door in it: the board goes forward
  // The watch keepers' bank under the window onto the reactor: three desks (the layout's two posts stand at the outer
  // ones), a hazard line along the sill.
  place(I, desk(3.0, '#ffb347', ['status', 'reactor', 'status']), X(-4), Z(143.85), Math.PI);
  place(I, desk(3.0, '#ff6a2a', ['reactor', 'target', 'reactor']), X(4), Z(143.85), Math.PI);
  place(I, desk(2.2, '#ffd040', ['status', 'nav']), cx, Z(144.0), Math.PI);
  // The engineer's dais behind, its couch facing the window, repeaters on arms.
  place(I, box(3.2, 0.2, 2.4, P.dark), cx, Z(139.3), 0, { y: 0.1 });
  I.group.add(at(box(3.2, 0.02, 0.05, glow('#ffb347', 0.7)), cx, y + 0.2, Z(140.5)));
  place(I, desk(2.4, '#ffb347', ['status', 'reactor']), cx, Z(140.0), Math.PI, { y: 0.2 });
  place(I, couch(mat('#5a4a30')), cx, Z(139.0), Math.PI, { y: 0.2 });
  // The mimic board down the port bulkhead: the plant as a diagram, lit.
  const mimic = C.atlas.plane(9, 1.7, (g, pw, ph) => {
    g.fillStyle = '#0c1014';
    g.fillRect(0, 0, pw, ph);
    g.strokeStyle = '#2a3440';
    g.lineWidth = 6;
    g.strokeRect(3, 3, pw - 6, ph - 6);
    const box2 = (x, yy, w, hh, label, col) => {
      g.strokeStyle = col;
      g.lineWidth = 4;
      g.strokeRect(x * pw, yy * ph, w * pw, hh * ph);
      text(g, label, (x + w / 2) * pw, (yy + hh / 2) * ph, MONO(ph * 0.07, 700), col, 'center');
    };
    const line = (pts, col) => {
      g.strokeStyle = col;
      g.lineWidth = 5;
      g.beginPath();
      pts.forEach(([a, b], i) => (i ? g.lineTo(a * pw, b * ph) : g.moveTo(a * pw, b * ph)));
      g.stroke();
    };
    box2(0.04, 0.3, 0.14, 0.4, 'REACTOR', '#ff6a2a');
    box2(0.26, 0.12, 0.12, 0.25, 'PUMP A', '#39d27a');
    box2(0.26, 0.62, 0.12, 0.25, 'PUMP B', '#39d27a');
    box2(0.46, 0.3, 0.14, 0.4, 'HEAT EXCH', '#ffb347');
    box2(0.68, 0.12, 0.12, 0.25, 'SINKS', '#ff8a5a');
    box2(0.68, 0.62, 0.12, 0.25, 'RADIATORS', '#ff8a5a');
    box2(0.86, 0.3, 0.1, 0.4, 'DRIVE', '#ff9a40');
    line([[0.18, 0.4], [0.26, 0.25]], '#58b0ff');
    line([[0.18, 0.6], [0.26, 0.75]], '#58b0ff');
    line([[0.38, 0.25], [0.46, 0.4]], '#58b0ff');
    line([[0.38, 0.75], [0.46, 0.6]], '#58b0ff');
    line([[0.6, 0.4], [0.68, 0.25]], '#ff8a5a');
    line([[0.6, 0.6], [0.68, 0.75]], '#ff8a5a');
    line([[0.8, 0.25], [0.86, 0.4]], '#ffd040');
    line([[0.8, 0.75], [0.86, 0.6]], '#ffd040');
    text(g, 'PRIMARY LOOP · NOMINAL', 0.04 * pw, 0.12 * ph, MONO(ph * 0.06, 700), '#9fb0c0');
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i === 9 ? '#ffb347' : '#39d27a';
      g.beginPath();
      g.arc((0.06 + i * 0.065) * pw, 0.92 * ph, ph * 0.025, 0, Math.PI * 2);
      g.fill();
    }
  }, 110);
  if (sideDoor) {
    I.group.add(at(mimic, cx, y + 1.95, z1 + 0.14, 0, 0, 0));
    I.group.add(at(box(9.2, 1.9, 0.06, P.black), cx, y + 1.95, z1 + 0.11));
  } else {
    I.group.add(at(mimic, x1 + 0.14, y + 1.95, (z1 + z2) / 2 - 0.5, 0, Math.PI / 2, 0));
    mark(I, x1, (z1 + z2) / 2 - 0.5, 9.2);
    I.group.add(at(box(0.06, 1.9, 9.2, P.black), x1 + 0.11, y + 1.95, (z1 + z2) / 2 - 0.5));
  }
  // The starboard bulkhead: the switchboard, cabinet after cabinet of breakers.
  for (let i = 0; i < 9; i++) {
    const z = z1 + 2.2 + i * 1.05;
    const cab = G(at(box(1.0, 2.2, 0.6, mat('#3e4650')), 0, 1.1, 0));
    for (let k = 0; k < 4; k++) cab.add(at(box(0.8, 0.02, 0.01, P.black), 0, 0.5 + k * 0.42, 0.305));
    cab.add(at(box(0.08, 0.06, 0.01, glow(i === 6 ? '#ffb347' : '#39d27a')), -0.3, 1.9, 0.31), at(box(0.4, 0.12, 0.01, P.sheet), 0.1, 1.95, 0.305));
    place(I, cab, x2 - 0.35, z, { ry: -Math.PI / 2 });
  }
  // The forward bulkhead either side of the door: suit lockers, the tool board, the fire point.
  if (sideDoor) for (let i = 0; i < 4; i++) place(I, locker(0.6), x1 + 0.3, z1 + 1.2 + i * 0.66, { ry: Math.PI / 2 });
  else for (let i = 0; i < 4; i++) place(I, locker(0.6), x1 + 0.6 + i * 0.66, z1 + 0.3);
  if (!sideDoor) place(I, G(at(box(2.2, 1.2, 0.05, mat('#4a5058')), 0, 1.5, 0), ...[...Array(12)].map((_, i) => at(box(0.05, 0.25 + (i % 3) * 0.08, 0.03, [P.red, P.yellow, P.steel][i % 3]), -0.9 + i * 0.16, 1.5, 0.04))), x2 - 2.0, z1 + 0.1, { collide: false });
  if (!sideDoor) poster(C, I, 'loose', 0.8, 0.5, X(2.0), 2.4, z1 + 0.12, 0);
  // Heavy runs overhead, and a hazard line at the window's sill.
  for (const [x, r, m] of [[-6.5, 0.16, mat('#8a7a50')], [-6.0, 0.12, pipeMat], [6.2, 0.14, pipeMat]]) I.group.add(at(rod(r, z2 - z1 - 0.2, m, 'z', 10), X(x), y + h - 0.35, (z1 + z2) / 2));
  I.group.add(at(box(12 * k, 0.04, 0.12, I.s.trim), cx, y + 0.9, z2 - 0.1));
}

/** The hangar's dressing, after layout.mjs has put the fighters, the lanes, the bay door and the crates in. */
export function dressHangar(C, I, c) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY, h = c.h ?? 12;
  const yellow = mat('#d8a530'), deckPaint = mat('#c8ccd0');
  // Painted boxes round each parking spot, and a walkway along the inboard wall.
  for (const f of C.L.fighters) {
    const [fx, fz] = f.at;
    for (const [w, d, ox, oz] of [[9.5, 0.12, 1.5, -4.2], [9.5, 0.12, 1.5, 4.2], [0.12, 8.5, 6.25, 0]]) I.group.add(at(box(w, 0.012, d, yellow), fx + ox, y + 0.008, fz + oz));
  }
  I.group.add(at(box(0.12, 0.012, z2 - z1 - 2, deckPaint), x2 - 3.4, y + 0.008, (z1 + z2) / 2));
  // Tie-down rings in a grid.
  const ring = new THREE.TorusGeometry(0.09, 0.02, 4, 8);
  for (let x = x1 + 3; x < x2 - 4; x += 4) for (let z = z1 + 2; z < z2 - 1; z += 4) {
    const m = new THREE.Mesh(ring, P.black);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y + 0.01, z);
    I.group.add(m);
  }
  // A gantry crane: rails along the long walls high up, a bridge across, its trolley and hook.
  for (const x of [x1 + 1, x2 - 1]) I.group.add(at(box(0.5, 0.6, z2 - z1, P.steel), x, y + h - 1.6, (z1 + z2) / 2));
  const bz = 12;
  I.group.add(at(box(x2 - x1 - 1, 0.8, 0.7, mat('#c8a030')), (x1 + x2) / 2, y + h - 1.2, bz));
  I.group.add(at(box(1.4, 0.6, 1.2, P.dark), x1 + 14, y + h - 1.8, bz), at(cyl(0.02, 0.02, 4, P.black, 4), x1 + 14, y + h - 4.1, bz), at(box(0.4, 0.5, 0.3, yellow), x1 + 14, y + h - 6.2, bz));
  // A catwalk along the inboard wall at the height of the second deck, with its rail.
  const cw = 1.4, cy = 6.2;
  I.group.add(at(box(cw, 0.08, z2 - z1 - 2, P.steel), x2 - cw / 2, y + cy, (z1 + z2) / 2));
  for (const e of [0.5, 1.05]) I.group.add(at(box(0.04, 0.04, z2 - z1 - 2, yellow), x2 - cw, y + cy + e, (z1 + z2) / 2));
  for (let z = z1 + 1; z < z2 - 1; z += 2) I.group.add(at(box(0.04, 1.05, 0.04, P.steel), x2 - cw, y + cy + 0.53, z), at(box(cw, 0.06, 0.06, P.steel), x2 - cw / 2, y + cy - 0.15, z));
  // Along the inboard wall below it: tool chests, a fuel hose reel, a weapons trolley, a tow tractor.
  for (const z of [-32.5, -23.5, 21.5, 30.5]) {
    place(I, G(at(box(1.2, 1.0, 0.6, P.red), 0, 0.5, 0), ...[0.25, 0.45, 0.65, 0.85].map((yy) => at(box(1.1, 0.01, 0.01, P.black), 0, yy, 0.305)), at(box(1.2, 0.5, 0.5, P.red), 0, 1.25, -0.05)), x2 - 0.9, z, -Math.PI / 2);
  }
  for (const z of [-14.5, 12.5]) {
    place(I, G(at(cyl(0.6, 0.6, 0.35, P.dark, 16), 0, 1.2, 0, Math.PI / 2, 0, 0), at(cyl(0.45, 0.45, 0.4, mat('#202020'), 16), 0, 1.2, 0, Math.PI / 2, 0, 0), at(box(0.2, 1.2, 0.3, yellow), 0, 0.6, 0)), x2 - 0.5, z, { ry: -Math.PI / 2 });
  }
  const trolley = G(at(box(1.0, 0.25, 3.2, mat('#3a4a3a')), 0, 0.45, 0), ...[[-0.4, -1.3], [0.4, -1.3], [-0.4, 1.3], [0.4, 1.3]].map(([a, b]) => at(cyl(0.15, 0.15, 0.1, P.black, 10), a, 0.15, b, 0, 0, Math.PI / 2)));
  for (const s of [-0.22, 0.22]) trolley.add(at(cyl(0.12, 0.12, 2.8, mat('#d8dcd8'), 10), s, 0.72, 0, Math.PI / 2, 0, 0), at(cyl(0.12, 0.01, 0.3, P.red, 10), s, 0.72, -1.55, -Math.PI / 2, 0, 0));
  place(I, trolley, x2 - 5.5, -24);
  const tug = G(at(box(1.6, 0.7, 2.4, yellow), 0, 0.6, 0), at(box(1.2, 0.5, 0.8, P.dark), 0, 1.2, 0.6), at(box(1.3, 0.04, 0.9, P.black), 0, 1.45, 0.6));
  for (const [a, b] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) tug.add(at(cyl(0.3, 0.3, 0.25, P.black, 12), a, 0.3, b, 0, 0, Math.PI / 2));
  place(I, tug, x2 - 6, 22, { ry: 0.3 });
  // The words on the walls.
  poster(C, I, 'hangar', 16, 3.2, x2 - 0.56, 9.4, 18, -Math.PI / 2);
  poster(C, I, 'clear', 9, 0.7, (x1 + x2) / 2 - 6, 9.8, z1 + 0.16, 0);
  poster(C, I, 'fod', 1.4, 0.9, x2 - 0.15, 1.7, -6.5, -Math.PI / 2);
  poster(C, I, 'burn', 0.8, 1.1, x2 - 0.15, 1.7, 5.2, -Math.PI / 2);
  // The hangar's frames: deep ribs up both long walls and across the deckhead.
  for (let z = z1 + 4; z < z2; z += 8) {
    I.group.add(at(box(0.5, h, 0.6, I.s.trim), x2 - 0.25, y + h / 2, z));
    I.group.add(at(box(x2 - x1, 0.7, 0.5, I.s.trim), (x1 + x2) / 2, y + h - 0.35, z));
  }
}

/** One set per room id. Each takes (C, I, c, hooks, open) like layout.mjs `furnish`. */
export const SETS = {
  bridge, cic, mess, galley, medbay, 'eng-control': (C, I, c, h, open) => engControl(C, I, c, open),
  'quarters-a': (C, I, c, h, open) => quarters(C, I, c, open),
  'quarters-b': (C, I, c, h, open) => quarters(C, I, c, open),
  'quarters-c': (C, I, c, h, open) => quarters(C, I, c, open)
};

// --- the drum's sets ----------------------------------------------------------------------------------------------
//
// A drum room (drum.mjs) is about 9 × 9 m with one doorway, in the middle of the wall on the ring corridor. Today's sets
// were drawn for the long side rooms of the old decks, so the drum has its own, laid out from the back wall (`v`, the
// distance from it) toward the doorway, and turned to suit whichever side of the corridor the room is on.

/** The room's frame for a drum set: `Z(v)` the z `v` metres in from the back wall, `R(ry)` a turn for something drawn
 *  facing +z (toward the doorway in a fore-row room), `D` the depth from the back wall to the door's. */
function drumFrame(c) {
  const fore = c.row !== 'aft', [z1, z2] = c.z;
  return { fore, Z: (v) => (fore ? z1 + v : z2 - v), R: (ry) => (fore ? ry : Math.PI - ry), D: z2 - z1, x1: c.x[0], x2: c.x[1] };
}

/** Berths: three racks three high (two on the back wall, one on a side wall), lockers down the other side wall, a
 *  table and stools in the middle. Bunk 1 (the back wall's starboard rack, bottom berth) is where `watches.you.bunk`
 *  puts yours: (2.2, 1.3 m in from the back). */
function drumQuarters(C, I, c) {
  const { Z, R, D, x1, x2 } = drumFrame(c);
  const seed = [...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  for (const [k, x] of [[0, -2.2], [1, 2.2]]) place(I, rack(seed + k * 7), x, Z(0.5), { ry: R(0) });
  place(I, rack(seed + 21), x1 + 0.5, Z(3.6), { ry: R(Math.PI / 2) }); // along the port wall, facing in
  for (let v = 1.6; v < D - 1.4; v += 0.66) place(I, locker(0.6), x2 - 0.3, Z(v), { ry: R(-Math.PI / 2) });
  place(I, messTable(2.0, 2, { stoolMat: P.pad }), 0.4, Z(4.6), { ry: R(Math.PI / 2) });
  I.screen('text', x1 + 0.14, 1.8, Z(6.6), R(Math.PI / 2), '#ffb070', 1.0, 0.6);
  poster(C, I, 'quiet', 1.1, 0.5, 0, 2.55, Z(0.12), R(0));
  const r = mulberry(seed);
  for (let i = 0; i < 2; i++) place(I, G(at(cyl(0.18, 0.18, 0.7, r() < 0.5 ? P.olive : P.blanket, 8), 0, 0.18, 0, 0, 0, Math.PI / 2)), -2.4 + i * 4.4, Z(1.55 + r() * 0.3), { ry: r() * 3, collide: false });
}

/** A mess: the servery counter along the back wall, four tables either side of the aisle from the door, the drinks
 *  machines on a side wall. */
function drumMess(C, I, c) {
  const { Z, R, x1, x2 } = drumFrame(c);
  const W = x2 - x1 - 1.2;
  const ctr = G(at(box(W, 0.9, 0.65, P.stainlessDk), 0, 0.45, 0), at(box(W + 0.1, 0.05, 0.7, P.stainless), 0, 0.925, 0), at(box(W, 0.04, 0.3, P.stainless), 0, 1.45, -0.18));
  for (let i = 0; i < 5; i++) ctr.add(at(box(0.5, 0.06, 0.4, P.chrome), -W / 2 + 0.8 + i * ((W - 1.6) / 4), 0.97, 0));
  ctr.add(at(cyl(0.2, 0.2, 0.55, P.chrome, 12), W / 2 - 0.4, 1.23, -0.05));
  place(I, ctr, 0, Z(0.4), { ry: R(0) });
  for (const v of [2.9, 5.5]) for (const x of [-2.25, 2.25]) place(I, messTable(3.0, 2), x, Z(v), { ry: R(0) });
  const bar = G(at(box(1.8, 0.92, 0.6, P.stainlessDk), 0, 0.46, 0), at(box(1.9, 0.05, 0.65, P.stainless), 0, 0.945, 0));
  for (let i = 0; i < 2; i++) bar.add(at(box(0.6, 0.75, 0.45, P.dark), -0.45 + i * 0.9, 1.35, -0.08), at(box(0.36, 0.2, 0.02, glow(['#ffb347', '#58b0ff'][i], 0.9)), -0.45 + i * 0.9, 1.55, 0.15));
  place(I, bar, x2 - 0.35, Z(7.6), { ry: R(-Math.PI / 2) });
  poster(C, I, 'menu', 1.1, 1.4, -2.2, 2.1, Z(0.12), R(0));
  poster(C, I, 'crest', 1.2, 1.2, 2.2, 2.1, Z(0.12), R(0));
  poster(C, I, 'board', 1.4, 0.9, x1 + 0.12, 1.6, Z(6.8), R(Math.PI / 2), 7);
}

/** A galley: the cooking line under its hood along the back wall, prep counters down a side wall, the island, and the
 *  tall fridges either side of the door. */
function drumGalley(C, I, c) {
  const { Z, R, D, x1, x2 } = drumFrame(c);
  const W = x2 - x1 - 0.4;
  const line = G(at(box(W, 0.9, 0.85, P.stainlessDk), 0, 0.45, 0), at(box(W, 0.05, 0.9, P.stainless), 0, 0.925, 0));
  for (const x of [-2.6, -1.8]) {
    line.add(at(box(0.7, 0.02, 0.6, P.black), x, 0.96, 0));
    for (const [dx, dz] of [[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]]) line.add(at(cyl(0.12, 0.12, 0.012, glow('#5a1408'), 12), x + dx, 0.975, dz));
  }
  line.add(at(box(1.0, 1.1, 0.8, P.stainless), 0, 1.5, -0.02), at(box(0.7, 0.5, 0.02, P.black), 0, 1.55, 0.39), at(box(0.12, 0.05, 0.02, glow('#39d27a')), 0.38, 1.9, 0.39));
  line.add(at(cyl(0.42, 0.36, 0.55, P.stainless, 14), 1.4, 1.2, 0), at(box(0.8, 0.02, 0.6, P.stainlessDk), 2.5, 0.97, 0));
  line.add(at(box(W, 0.5, 1.1, P.stainless), 0, 2.45, 0.1), at(box(W - 0.2, 0.02, 0.9, mat('#5d646c')), 0, 2.19, 0.15));
  place(I, line, 0, Z(0.5), { ry: R(0), collide: true });
  const len = D - 4.2;
  const prep = G(at(box(len, 0.9, 0.7, P.stainlessDk), 0, 0.45, 0), at(box(len, 0.05, 0.75, P.stainless), 0, 0.925, 0), at(box(len, 0.04, 0.4, P.stainless), 0, 1.75, -0.15));
  for (const x of [-1.0, -0.2]) prep.add(at(box(0.6, 0.03, 0.45, P.black), x, 0.94, 0.05), at(box(0.04, 0.3, 0.04, P.chrome), x, 1.1, -0.25));
  for (let i = 0; i < 4; i++) prep.add(at(cyl(0.13 + (i % 3) * 0.04, 0.13 + (i % 3) * 0.04, 0.18 + (i % 2) * 0.12, P.chrome, 10), -len / 2 + 0.5 + i * 0.9, 1.9, -0.15));
  place(I, prep, x1 + 0.4, Z(1.6 + len / 2), { ry: R(Math.PI / 2) });
  const island = G(at(box(2.2, 0.9, 0.9, P.stainlessDk), 0, 0.45, 0), at(box(2.3, 0.06, 1.0, mat('#8a6a48')), 0, 0.93, 0));
  place(I, island, 1.0, Z(4.2), { ry: R(0) });
  for (const x of [x1 + 0.5, x2 - 0.5]) {
    const fr = G(at(box(0.9, 2.1, 0.75, P.stainless), 0, 1.05, 0), at(box(0.01, 2.0, 0.01, P.black), 0, 1.05, 0.38), at(box(0.03, 0.4, 0.04, P.chrome), 0, 1.2, 0.4));
    place(I, fr, x, Z(D - 0.45), { ry: R(Math.PI) });
  }
  poster(C, I, 'loose', 0.8, 0.5, x2 - 0.12, 1.7, Z(2.6), R(-Math.PI / 2));
}

/** A sick bay: two beds head to the back wall with their monitors and a curtain between, the treatment table, the
 *  cabinets down a side wall, the medic's desk by the door. */
function drumMedbay(C, I, c) {
  const { Z, R, D, x1, x2 } = drumFrame(c), y = I.floorY;
  for (const x of [-2.6, 0.2]) {
    const bed = G(
      at(box(0.95, 0.5, 2.0, P.steel), 0, 0.3, 0), at(box(0.9, 0.14, 1.95, P.white), 0, 0.62, 0),
      at(box(0.92, 0.05, 1.3, mat('#9ac0d0')), 0, 0.71, 0.3), at(box(0.6, 0.1, 0.4, P.pillow), 0, 0.73, -0.75), at(box(0.95, 0.6, 0.06, P.steel), 0, 0.75, -1.02)
    );
    place(I, bed, x, Z(1.15), { ry: R(0) });
    I.group.add(at(screen('reactor', '#39d27a', 0.5, 0.34), x + 0.75, y + 1.85, Z(0.2), 0, R(0), 0));
    place(I, G(at(cyl(0.02, 0.02, 1.9, P.chrome, 6), 0, 0.95, 0), at(cyl(0.22, 0.22, 0.03, P.chrome, 5), 0, 0.03, 0), at(box(0.12, 0.2, 0.04, mat('#cfe6f0')), 0.08, 1.75, 0)), x - 0.7, Z(0.6), { collide: false });
  }
  I.group.add(at(box(0.02, 2.3, 2.2, mat('#7ab0b8')), -1.2, y + 1.65, Z(1.2)));
  const tx = 2.9, tz = Z(4.4);
  place(I, G(at(cyl(0.2, 0.3, 0.6, P.steel, 10), 0, 0.3, 0), at(box(0.7, 0.12, 2.0, P.white), 0, 0.68, 0), at(box(0.62, 0.06, 1.9, mat('#3f8f8a')), 0, 0.77, 0)), tx, tz, { ry: R(0) });
  I.group.add(at(G(at(cyl(0.02, 0.02, 0.6, P.steel, 6), 0, -0.3, 0), at(cyl(0.45, 0.3, 0.14, P.white, 18), 0, -0.65, 0), at(cyl(0.38, 0.38, 0.01, glow('#f4f8ff'), 18), 0, -0.725, 0)), tx, y + (c.h ?? 3), tz));
  for (let i = 0; i < 3; i++) place(I, G(at(box(1.0, 2.0, 0.45, P.white), 0, 1.0, 0), at(box(0.9, 0.9, 0.01, mat('#bfd8e0')), 0, 1.5, 0.23)), x1 + 0.28, Z(3.4 + i * 1.05), { ry: R(Math.PI / 2) });
  place(I, G(at(box(0.6, 1.0, 0.5, P.red), 0, 0.55, 0), at(box(0.4, 0.25, 0.3, P.dark), 0, 1.18, 0)), x2 - 0.4, Z(2.6), { ry: R(-Math.PI / 2) });
  place(I, desk(1.6, '#3ac0b0', ['status', 'text']), -2.4, Z(D - 1.6), { ry: R(Math.PI) });
  poster(C, I, 'cross', 0.9, 0.9, 1.6, 2.0, Z(0.12), R(0));
  poster(C, I, 'triage', 0.7, 0.9, x2 - 0.12, 1.7, Z(5.6), R(-Math.PI / 2));
}

/** The set for drum room `c`, by what the room is for (the galley by name), or null for its fit. */
export function drumSet(c) {
  if (c.id === 'galley') return drumGalley;
  return { berths: drumQuarters, mess: drumMess, medical: drumMedbay }[c.use] ?? null;
}

/** Each frame: what moves in the sets. */
export function setsFrame(C, dt, t) {
  for (const f of C.anim ?? []) f(dt, t);
}

export { messTable, locker, rack, shelfRack, poster };
