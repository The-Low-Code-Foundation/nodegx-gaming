// A room's walls, deck and deckhead (sets.mjs `roomSurfaces`): the canvas textures, with grime low down, and `LOOK`,
// which kind of room gets what finish and how it is lit.

import * as THREE from 'three';
import { mulberry } from '../../util.mjs';

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
  corridor: { wall: 'panel', floor: 'plate', tint: '#8d96a3', deck: '#5f666f', ceil: '#7a818b', trim: '#2b3038', lamp: '#ffe6c4', k: 1.0, cove: null },
  // A drum's ring corridor: you see a long way up the curve, past the lamps the light pool can light, so more fill.
  ring: { wall: 'panel', floor: 'plate', tint: '#8d96a3', deck: '#5f666f', ceil: '#7a818b', trim: '#2b3038', lamp: '#ffe6c4', k: 1.0, cove: null, fill: 0.62 }
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
export const lookKey = (c) => ROOM[c.id] ?? (c.drum && c.system === 'corridor' ? 'ring' : BY_SYSTEM[c.system]) ?? 'corridor';
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
