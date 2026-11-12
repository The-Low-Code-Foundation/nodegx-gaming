// The blocks, and the texture atlas painted for them in code (16 × 16 pixel tiles in Minecraft's manner: a handful
// of shades per block in clumps, tiling seamlessly, no image files). A world can repaint the atlas with its own
// palette (the secret worlds do: an amber forest, a blue tundra…).
import * as THREE from 'three';
import { rng } from './noise.mjs';

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, DEEP: 4, COAL: 5, IRON: 6, GRAVEL: 7, LAVA: 8, GLOWMOSS: 9, CRYSTAL: 10,
  LOG: 11, LEAVES: 12, TORCH: 13, RUNE: 14, FLOOR: 15, LECTERN: 16, FRAME: 17, DORMANT: 18, PORTAL: 19,
  SAND: 20, SANDSTONE: 21, SNOW: 22, ICE: 23, METAL: 24, METALFLOOR: 25, CACTUS: 26, CRATE: 27, COBBLE: 28,
  PILLAR: 29, FLOWERS: 30, BEACON: 31, WATER: 32, TALLGRASS: 33, POPPY: 34, DANDELION: 35, RED_MUSHROOM: 36,
  BROWN_MUSHROOM: 37, BIRCH: 38, SNOWGRASS: 39,
  // A torch stuck to a wall, by the way it faces (away from the wall): +x, -x, +z, -z.
  WALL_TORCH_E: 40, WALL_TORCH_W: 41, WALL_TORCH_S: 42, WALL_TORCH_N: 43,
  SNOWYSTONE: 44, PLANKS: 45, CACHE: 46,
  // The ship (round 7, DIG-002): two tones of hull, glass, deck plate, lit panels, hazard stripes, the wingtip lights,
  // the furniture (bunks, med beds, consoles, seats, the log's screen), the engines' nozzles, and the scorched ground.
  HULL: 47, HULL_DARK: 48, GLASS: 49, DECK: 50, PANEL: 51, HAZARD: 52, RUNLIGHT: 53, BUNK: 54, MEDBED: 55,
  CONSOLE: 56, SEAT: 57, SCREEN: 58, NOZZLE: 59, SCORCH: 60,
  // Their places (round 8, DIG-006): dressed stone and its cracked and dark kinds, fallen rubble (quick to dig), floor
  // mosaics, friezes, tiles, shelves of tablets, crystal lanterns, banners, statues, the rolling stone door, lamp
  // niches, stone with lines carved in it (where something can be read), and mural panels.
  CARVED: 61, CARVED_CRACKED: 62, CARVED_DARK: 63, RUBBLE: 64, MOSAIC: 65, FRIEZE: 66, TILE: 67, TABLETS: 68,
  LANTERN: 69, BANNER: 70, STATUE: 71, STONE_DOOR: 72, LAMP_NICHE: 73, INSCRIBED: 74, MURAL: 75
};

// solid: the player collides. opaque: hides the faces behind it and stops light. hard: seconds to dig with the pick
// (Infinity = cannot be dug). light: what it gives off (0–15). drop: what digging it puts in the pack.
// shape: cube, cross (a plant: two crossed quads), torch, liquid (its own see-through pass), none.
// filter: light lost passing through it beyond the usual one a block (leaves, water).
const def = (name, o) => ({ name, solid: true, opaque: true, hard: 0.6, light: 0, drop: 'rubble', shape: 'cube', filter: 0, ...o });
const plant = (name, tile, o) => def(name, { solid: false, opaque: false, hard: 0.02, shape: 'cross', drop: null, tiles: [tile], ...o });
export const BLOCKS = [];
BLOCKS[B.AIR] = def('air', { solid: false, opaque: false, shape: 'none', drop: null });
BLOCKS[B.GRASS] = def('grass', { hard: 0.45, tiles: ['grass_top', 'grass_side', 'dirt'] });
BLOCKS[B.DIRT] = def('dirt', { hard: 0.4, tiles: ['dirt'] });
BLOCKS[B.STONE] = def('stone', { hard: 0.75, tiles: ['stone'] });
BLOCKS[B.DEEP] = def('deepstone', { hard: 1.0, tiles: ['deep_top', 'deep', 'deep_top'] });
BLOCKS[B.COAL] = def('coal ore', { hard: 0.8, tiles: ['coal'], drop: 'coal' });
BLOCKS[B.IRON] = def('iron ore', { hard: 1.0, tiles: ['iron'], drop: 'iron' });
BLOCKS[B.GRAVEL] = def('gravel', { hard: 0.45, tiles: ['gravel'], drop: 'gravel' });
BLOCKS[B.LAVA] = def('lava', { solid: false, opaque: false, hard: Infinity, light: 15, tiles: ['lava'], drop: null, liquid: true, shape: 'liquid', hurts: 4 });
BLOCKS[B.GLOWMOSS] = def('glow moss', { hard: 0.3, light: 9, tiles: ['glowmoss'], drop: 'rubble' });
BLOCKS[B.CRYSTAL] = def('crystal', { hard: 0.9, light: 12, tiles: ['crystal'], drop: 'crystal' });
BLOCKS[B.LOG] = def('log', { hard: 0.6, tiles: ['log_top', 'log_side', 'log_top'] });
BLOCKS[B.LEAVES] = def('leaves', { hard: 0.2, tiles: ['leaves'], drop: null, opaque: false, cutout: true, filter: 1 });
// Round 7: a flare (B.TORCH keeps its name in the code): a metal stick with a white-hot tip. Unlimited, so it drops nothing.
BLOCKS[B.TORCH] = def('flare', { solid: false, opaque: false, hard: 0.05, light: 14, shape: 'torch', drop: null, tiles: ['torch'] });
BLOCKS[B.RUNE] = def('rune stone', { hard: 1.6, light: 10, tiles: ['rune'] });
BLOCKS[B.FLOOR] = def('worked floor', { hard: 1.6, tiles: ['floor'] });
BLOCKS[B.LECTERN] = def('lectern', { hard: Infinity, light: 9, tiles: ['lectern_top', 'lectern_side', 'lectern_side'], drop: null });
BLOCKS[B.FRAME] = def('portal frame', { hard: Infinity, light: 7, tiles: ['frame'], drop: null });
BLOCKS[B.DORMANT] = def('dormant portal', { hard: Infinity, tiles: ['dormant'], drop: null });
BLOCKS[B.PORTAL] = def('portal', { solid: false, opaque: false, hard: Infinity, light: 13, shape: 'none', drop: null });
BLOCKS[B.SAND] = def('sand', { hard: 0.4, tiles: ['sand'] });
BLOCKS[B.SANDSTONE] = def('sandstone', { hard: 0.7, tiles: ['sandstone_top', 'sandstone', 'sandstone_top'] });
BLOCKS[B.SNOW] = def('snow', { hard: 0.35, tiles: ['snow'] });
BLOCKS[B.ICE] = def('ice', { hard: 0.5, tiles: ['ice'] });
BLOCKS[B.METAL] = def('hull plate', { hard: 2.0, tiles: ['metal'] });
BLOCKS[B.METALFLOOR] = def('deck', { hard: 2.0, tiles: ['metalfloor'] });
BLOCKS[B.CACTUS] = def('cactus', { hard: 0.3, tiles: ['cactus_top', 'cactus', 'cactus_top'], drop: null });
BLOCKS[B.CRATE] = def('supply crate', { hard: 0.35, tiles: ['crate'], drop: 'crate' });
BLOCKS[B.COBBLE] = def('rubble', { hard: 0.6, tiles: ['cobble'] });
BLOCKS[B.PILLAR] = def('old pillar', { hard: 1.2, tiles: ['pillar_top', 'pillar', 'pillar_top'] });
BLOCKS[B.FLOWERS] = def('meadow', { hard: 0.45, tiles: ['flowers', 'grass_side', 'dirt'] });
BLOCKS[B.BEACON] = def('beacon', { hard: Infinity, light: 15, tiles: ['beacon'], drop: null });
BLOCKS[B.WATER] = def('water', { solid: false, opaque: false, hard: Infinity, tiles: ['water'], drop: null, liquid: true, shape: 'liquid', filter: 1 });
BLOCKS[B.TALLGRASS] = plant('tall grass', 'tallgrass');
BLOCKS[B.POPPY] = plant('poppy', 'poppy');
BLOCKS[B.DANDELION] = plant('dandelion', 'dandelion');
BLOCKS[B.RED_MUSHROOM] = plant('red mushroom', 'red_mushroom', { light: 1 });
BLOCKS[B.BROWN_MUSHROOM] = plant('brown mushroom', 'brown_mushroom', { light: 1 });
BLOCKS[B.BIRCH] = def('birch log', { hard: 0.6, tiles: ['birch_top', 'birch_side', 'birch_top'] });
BLOCKS[B.SNOWGRASS] = def('snowy grass', { hard: 0.45, tiles: ['snow', 'snow_side', 'dirt'] });
BLOCKS[B.SNOWYSTONE] = def('snowy stone', { hard: 0.75, tiles: ['snow', 'snowstone_side', 'stone'] });
BLOCKS[B.PLANKS] = def('planks', { hard: 0.5, tiles: ['planks'] });
// A cache: a sealed box of special ammo (the miners' hamlets and the shrines keep one now and then).
BLOCKS[B.CACHE] = def('ammo cache', { hard: 0.3, light: 8, tiles: ['cache_top', 'cache', 'cache_top'], drop: 'cache' });
// The ship. Nothing in it works, by design; it is hard to dig (the hull is a ship's), but not impossible.
BLOCKS[B.HULL] = def('hull', { hard: 3.0, tiles: ['hull'] });
BLOCKS[B.HULL_DARK] = def('dark hull', { hard: 3.0, tiles: ['hull_dark'] });
BLOCKS[B.GLASS] = def('glass', { hard: 1.5, opaque: false, tiles: ['glass'], drop: null });
BLOCKS[B.DECK] = def('deck plate', { hard: 3.0, tiles: ['deck', 'hull_dark', 'hull_dark'] });
BLOCKS[B.PANEL] = def('lit panel', { hard: 2.0, light: 12, tiles: ['panel'], drop: null });
BLOCKS[B.HAZARD] = def('hazard plate', { hard: 3.0, tiles: ['hazard', 'hull_dark', 'hull_dark'] });
BLOCKS[B.RUNLIGHT] = def('running light', { hard: 2.0, light: 10, tiles: ['runlight'], drop: null });
BLOCKS[B.BUNK] = def('bunk', { hard: 0.8, tiles: ['bunk_top', 'hull_dark', 'hull_dark'], drop: null });
BLOCKS[B.MEDBED] = def('med bed', { hard: 0.8, tiles: ['medbed_top', 'hull', 'hull_dark'], drop: null });
BLOCKS[B.CONSOLE] = def('console', { hard: 2.0, light: 6, tiles: ['console_top', 'console_side', 'hull_dark'], drop: null });
BLOCKS[B.SEAT] = def('seat', { hard: 0.8, opaque: false, shape: 'slab', tiles: ['seat'], drop: null });
BLOCKS[B.SCREEN] = def('ship\'s log', { hard: Infinity, light: 9, tiles: ['hull_dark', 'screen', 'hull_dark'], drop: null });
BLOCKS[B.NOZZLE] = def('engine nozzle', { hard: 3.0, light: 7, tiles: ['nozzle'], drop: null });
BLOCKS[B.SCORCH] = def('scorched earth', { hard: 0.45, tiles: ['scorch', 'scorch_side', 'dirt'] });
BLOCKS[B.CARVED] = def('dressed stone', { hard: 1.4, tiles: ['carved_top', 'carved', 'carved_top'] });
BLOCKS[B.CARVED_CRACKED] = def('cracked dressed stone', { hard: 0.9, tiles: ['carved_cracked'] });
BLOCKS[B.CARVED_DARK] = def('dark dressed stone', { hard: 1.6, tiles: ['carved_dark'] });
BLOCKS[B.RUBBLE] = def('fallen rock', { hard: 0.18, tiles: ['rubble'] });
BLOCKS[B.MOSAIC] = def('mosaic', { hard: 1.2, tiles: ['mosaic', 'carved', 'carved_top'] });
BLOCKS[B.FRIEZE] = def('frieze', { hard: 1.4, tiles: ['carved_top', 'frieze', 'carved_top'] });
BLOCKS[B.TILE] = def('tiled floor', { hard: 1.0, tiles: ['tile', 'carved', 'carved_top'] });
BLOCKS[B.TABLETS] = def('shelf of tablets', { hard: 1.0, tiles: ['carved_top', 'tablets', 'carved_top'] });
BLOCKS[B.LANTERN] = def('crystal lantern', { hard: 0.8, light: 13, tiles: ['lantern_top', 'lantern', 'lantern_top'], drop: 'crystal' });
BLOCKS[B.BANNER] = def('banner', { solid: false, opaque: false, cutout: true, hard: 0.15, tiles: ['banner'], drop: null });
BLOCKS[B.STATUE] = def('statue stone', { hard: 1.4, tiles: ['statue_top', 'statue', 'statue_top'] });
BLOCKS[B.STONE_DOOR] = def('stone door', { hard: Infinity, tiles: ['carved_top', 'stone_door', 'carved_top'], drop: null });
BLOCKS[B.LAMP_NICHE] = def('lamp niche', { hard: 1.2, light: 11, tiles: ['carved_top', 'lamp_niche', 'carved_top'] });
BLOCKS[B.INSCRIBED] = def('carved lines', { hard: Infinity, light: 3, tiles: ['carved_top', 'inscribed', 'carved_top'], drop: null });
BLOCKS[B.MURAL] = def('mural', { hard: 1.4, tiles: ['carved_top', 'mural', 'carved_top'] });
[[B.WALL_TORCH_E, [1, 0, 0]], [B.WALL_TORCH_W, [-1, 0, 0]], [B.WALL_TORCH_S, [0, 0, 1]], [B.WALL_TORCH_N, [0, 0, -1]]].forEach(
  ([id, facing]) => (BLOCKS[id] = { ...BLOCKS[B.TORCH], facing })
);
// The torch for a face it is put against (the face's normal), or null where none can go (a ceiling).
export function torchFor(n) {
  if (n[1] === 1) return B.TORCH;
  if (n[1] === -1) return null;
  return n[0] === 1 ? B.WALL_TORCH_E : n[0] === -1 ? B.WALL_TORCH_W : n[2] === 1 ? B.WALL_TORCH_S : B.WALL_TORCH_N;
}

export const isOpaque = new Uint8Array(256);
export const isSolid = new Uint8Array(256);
export const emits = new Uint8Array(256);
export const filters = new Uint8Array(256);
// What stops the sky shining straight down a column: rock, but also leaves and water (light still seeps past them).
export const stopsSky = new Uint8Array(256);
export const isPlant = new Uint8Array(256);
export const isTorch = new Uint8Array(256);
for (let i = 0; i < BLOCKS.length; i++) {
  if (!BLOCKS[i]) continue;
  isOpaque[i] = BLOCKS[i].opaque ? 1 : 0;
  isSolid[i] = BLOCKS[i].solid ? 1 : 0;
  emits[i] = BLOCKS[i].light;
  filters[i] = BLOCKS[i].filter;
  stopsSky[i] = BLOCKS[i].opaque || BLOCKS[i].filter ? 1 : 0;
  isPlant[i] = BLOCKS[i].shape === 'cross' ? 1 : 0;
  isTorch[i] = BLOCKS[i].shape === 'torch' ? 1 : 0;
}

// The cave's colours. A secret world passes its own (sky, ground, accent) and gets a repainted atlas.
export const CAVE_PALETTE = {
  grass: '#62a03e', dirt: '#866043', stone: '#7f7f7f', deep: '#4d4d55', leaves: '#3b7d26', log: '#6a5132',
  sand: '#dbcf9c', snow: '#f2f6f8', metal: '#8a949c', glow: '#58e0c0', crystal: '#a874e8', accent: '#e8b04a',
  water: '#3a64d8'
};

const TILE = 16;
const ORDER = [
  'white', 'grass_top', 'grass_side', 'dirt', 'stone', 'deep', 'coal', 'iron', 'gravel', 'lava', 'glowmoss', 'crystal',
  'log_top', 'log_side', 'leaves', 'rune', 'floor', 'lectern_top', 'lectern_side', 'frame', 'dormant', 'sand',
  'sandstone', 'sandstone_top', 'snow', 'ice', 'metal', 'metalfloor', 'cactus', 'cactus_top', 'crate', 'cobble',
  'pillar', 'pillar_top', 'flowers', 'beacon', 'water', 'tallgrass', 'poppy', 'dandelion', 'red_mushroom',
  'brown_mushroom', 'birch_side', 'birch_top', 'torch', 'deep_top', 'snow_side', 'snowstone_side', 'planks',
  'cache', 'cache_top',
  'hull', 'hull_dark', 'glass', 'deck', 'panel', 'hazard', 'runlight', 'bunk_top', 'medbed_top', 'console_top',
  'console_side', 'seat', 'screen', 'nozzle', 'scorch', 'scorch_side',
  'carved', 'carved_top', 'carved_cracked', 'carved_dark', 'rubble', 'mosaic', 'frieze', 'tile', 'tablets', 'lantern',
  'lantern_top', 'banner', 'statue', 'statue_top', 'stone_door', 'lamp_niche', 'inscribed', 'mural'
];
export const TILE_INDEX = Object.fromEntries(ORDER.map((n, i) => [n, i]));
const PER_ROW = 16; // 16 × 16 tiles (8 × 8 filled up with the ship's)
const ATLAS = PER_ROW * TILE;

// [u0, v0, u1, v1] of a tile, inset a hair so neighbours never bleed in.
export function tileUV(name) {
  const i = TILE_INDEX[name] ?? 0;
  const x = (i % PER_ROW) * TILE;
  const y = Math.floor(i / PER_ROW) * TILE;
  const e = 0.02;
  return [(x + e) / ATLAS, 1 - (y + TILE - e) / ATLAS, (x + TILE - e) / ATLAS, 1 - (y + e) / ATLAS];
}
// A part of a tile, in its pixels (0–16, y down): the torch's stick and flame are cut from its tile this way.
export function tileSubUV(name, px0, py0, px1, py1) {
  const i = TILE_INDEX[name] ?? 0;
  const x = (i % PER_ROW) * TILE;
  const y = Math.floor(i / PER_ROW) * TILE;
  return [(x + px0) / ATLAS, 1 - (y + py1) / ATLAS, (x + px1) / ATLAS, 1 - (y + py0) / ATLAS];
}

const hex = (c) => {
  const n = parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const shade = (rgb, f) => rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));

export function paintAtlas(palette = CAVE_PALETTE, seed = 7) {
  const pal = { ...CAVE_PALETTE };
  for (const [k, v] of Object.entries(palette ?? {})) if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) pal[k] = v;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS;
  const g = canvas.getContext('2d');
  const img = g.createImageData(ATLAS, ATLAS);
  const r = rng(seed);
  const put = (tile, x, y, rgb, a = 255) => {
    const i = TILE_INDEX[tile];
    const px = (i % PER_ROW) * TILE + x;
    const py = Math.floor(i / PER_ROW) * TILE + y;
    const o = (py * ATLAS + px) * 4;
    img.data[o] = rgb[0];
    img.data[o + 1] = rgb[1];
    img.data[o + 2] = rgb[2];
    img.data[o + 3] = a;
  };
  const each = (tile, fn) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) put(tile, x, y, fn(x, y));
  };
  // A field of 0–1 values that clumps (blurred noise, wrapping at the edges so the tile repeats seamlessly),
  // ranked so every shade of a palette gets its share. sx/sy stretch the clumps (deepstone's streaks).
  const field = (passes = 1, sx = 1, sy = 1) => {
    let f = new Float32Array(256).map(() => r());
    for (let p = 0; p < passes; p++) {
      const n = new Float32Array(256);
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const at = (dx, dy) => f[((x + dx + 16) % 16) + ((y + dy + 16) % 16) * 16];
          n[x + y * 16] = (at(0, 0) * 2 + (at(1, 0) + at(-1, 0)) * sx + (at(0, 1) + at(0, -1)) * sy) / (2 + 2 * sx + 2 * sy);
        }
      f = n;
    }
    const order = [...f.keys()].sort((a, b) => f[a] - f[b]);
    const out = new Float32Array(256);
    order.forEach((i, rank) => (out[i] = rank / 255));
    return out;
  };
  // Pick from a list of shades by a field value; weights say how much of the tile each shade covers.
  const pick = (shades, v, weights) => {
    if (!weights) return shades[Math.min(shades.length - 1, Math.floor(v * shades.length))];
    let acc = 0;
    for (let i = 0; i < shades.length; i++) if (v <= (acc += weights[i])) return shades[i];
    return shades[shades.length - 1];
  };
  const tones = (base, fs) => fs.map((f) => shade(hex(base), f));
  const clumps = (tile, shades, passes = 1, weights) => {
    const f = field(passes);
    each(tile, (x, y) => pick(shades, f[x + y * 16], weights));
  };
  // Worley cells (cobble, gravel): which seed each pixel is nearest to, wrapping, and whether it sits on an edge.
  const cells = (n) => {
    const pts = Array.from({ length: n }, () => [r() * 16, r() * 16]);
    const own = new Int16Array(256);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        let best = 1e9, bi = 0;
        pts.forEach(([px, py], i) => {
          const dx = Math.min(Math.abs(x + 0.5 - px), 16 - Math.abs(x + 0.5 - px));
          const dy = Math.min(Math.abs(y + 0.5 - py), 16 - Math.abs(y + 0.5 - py));
          const d = dx * dx + dy * dy;
          if (d < best) [best, bi] = [d, i];
        });
        own[x + y * 16] = bi;
      }
    const edge = (x, y) => {
      const c = own[x + y * 16];
      return own[((x + 1) % 16) + y * 16] !== c || own[x + ((y + 1) % 16) * 16] !== c;
    };
    return { own, edge, n };
  };
  // Ore: blobs of a colour sitting on stone, each with a darker rim and a bright fleck.
  const ore = (tile, oreRgb, count = 5) => {
    const st = field(1);
    const stone = tones(pal.stone, [0.84, 0.94, 1.0, 1.08]);
    const spot = new Map();
    for (let k = 0; k < count; k++) {
      const cx = 2 + Math.floor(r() * 12), cy = 2 + Math.floor(r() * 12);
      const blob = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [2, 1], [1, 2]].filter((_, i) => i < 4 || r() < 0.5);
      for (const [dx, dy] of blob) spot.set(`${cx + dx},${cy + dy}`, dx === 0 && dy === 0 ? 2 : 1);
    }
    each(tile, (x, y) => {
      const s = spot.get(`${x},${y}`);
      if (s === 2) return shade(oreRgb, 1.25);
      if (s === 1) return shade(oreRgb, 0.9 + r() * 0.15);
      // A rim of darker stone round a blob.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (spot.has(`${x + dx},${y + dy}`)) return shade(hex(pal.stone), 0.68);
      return pick(stone, st[x + y * 16], [0.15, 0.35, 0.35, 0.15]);
    });
  };

  each('white', () => [255, 255, 255]);

  // ── the ground ──
  const grass = tones(pal.grass, [0.8, 0.9, 1.0, 1.1]);
  const dirt = tones(pal.dirt, [0.74, 0.88, 1.0, 1.14]);
  clumps('grass_top', grass, 1, [0.2, 0.3, 0.3, 0.2]);
  {
    const f = field(1);
    each('dirt', (x, y) => (r() < 0.05 ? shade(hex(pal.dirt), 1.3) : pick(dirt, f[x + y * 16], [0.15, 0.3, 0.35, 0.2])));
  }
  {
    const f = field(1);
    const fringe = Array.from({ length: 16 }, () => 2 + Math.floor(r() * 2) + (r() < 0.3 ? 2 + Math.floor(r() * 2) : 0));
    each('grass_side', (x, y) => {
      if (y < fringe[x]) return y === fringe[x] - 1 ? shade(grass[0], 0.9) : pick(grass, f[x + y * 16]);
      return r() < 0.05 ? shade(hex(pal.dirt), 1.3) : pick(dirt, f[x + y * 16], [0.15, 0.3, 0.35, 0.2]);
    });
  }
  {
    const f = field(1);
    const snow = tones(pal.snow, [0.9, 0.95, 1.0]);
    const fringe = Array.from({ length: 16 }, () => 3 + Math.floor(r() * 2) + (r() < 0.25 ? 2 : 0));
    each('snow_side', (x, y) => (y < fringe[x] ? pick(snow, f[x + y * 16]) : pick(dirt, f[x + y * 16], [0.15, 0.3, 0.35, 0.2])));
    const stone = tones(pal.stone, [0.82, 0.92, 1.0, 1.08]);
    each('snowstone_side', (x, y) => (y < fringe[x] ? pick(snow, f[x + y * 16]) : pick(stone, f[x + y * 16], [0.12, 0.33, 0.4, 0.15])));
  }
  each('flowers', (x, y) => {
    if (r() < 0.06) return r() < 0.5 ? [240, 220, 90] : shade(hex(pal.accent), 1.1);
    return grass[Math.floor(r() * 4)];
  });
  clumps('stone', tones(pal.stone, [0.82, 0.92, 1.0, 1.08]), 1, [0.12, 0.33, 0.4, 0.15]);
  {
    // Deepstone: dark, in horizontal streaks, with a chiselled cross-hatch on top.
    const f = field(2, 2.5, 0.2);
    const deep = tones(pal.deep, [0.72, 0.86, 1.0, 1.12]);
    each('deep', (x, y) => pick(deep, f[x + y * 16], [0.15, 0.35, 0.35, 0.15]));
    const t = field(1);
    each('deep_top', (x, y) => ((x === 0 || y === 0) ? shade(hex(pal.deep), 0.7) : pick(deep, t[x + y * 16], [0.15, 0.35, 0.35, 0.15])));
  }
  ore('coal', [46, 46, 48]);
  ore('iron', [216, 175, 147]);
  {
    const c = cells(14);
    const pebbles = Array.from({ length: c.n }, () => [[140, 132, 128], [118, 112, 110], [98, 92, 90], [150, 128, 116], [84, 80, 80]][Math.floor(r() * 5)]);
    each('gravel', (x, y) => (c.edge(x, y) ? shade(pebbles[c.own[x + y * 16]], 0.62) : shade(pebbles[c.own[x + y * 16]], 0.92 + r() * 0.16)));
  }
  {
    const f = field(2);
    const lava = [[196, 64, 8], [228, 104, 18], [244, 150, 28], [252, 206, 72]];
    each('lava', (x, y) => pick(lava, f[x + y * 16], [0.25, 0.35, 0.25, 0.15]));
  }
  {
    const f = field(1);
    const water = tones(pal.water, [0.86, 0.94, 1.0, 1.08]);
    each('water', (x, y) => pick(water, f[x + y * 16]));
  }
  {
    const f = field(1);
    const deep = tones(pal.deep, [0.8, 0.95, 1.05]);
    const glow = tones(pal.glow, [0.75, 1.0, 1.25]);
    each('glowmoss', (x, y) => (f[x + y * 16] > 0.58 ? pick(glow, (f[x + y * 16] - 0.58) / 0.42) : pick(deep, r())));
  }
  each('crystal', (x, y) => {
    const facet = ((x + y) % 5 === 0 || (x - y + 16) % 6 === 0) ? 1.35 : 0.8 + r() * 0.25;
    return shade(hex(pal.crystal), facet);
  });
  clumps('sand', tones(pal.sand, [0.9, 0.95, 1.0, 1.04]), 0);
  {
    const f = field(1);
    each('sandstone', (x, y) => shade(hex(pal.sand), (y === 0 || y === 11 ? 0.8 : y < 4 ? 1.02 : 0.95) * (0.95 + f[x + y * 16] * 0.08)));
    each('sandstone_top', (x, y) => shade(hex(pal.sand), (x === 0 || y === 0 || x === 15 || y === 15 ? 0.88 : 1) * (0.95 + f[x + y * 16] * 0.08)));
  }
  clumps('snow', tones(pal.snow, [0.92, 0.96, 1.0]), 1);
  each('ice', (x, y) => shade([150, 190, 240], (x === y || x === 15 - y ? 1.15 : 0.95) * (0.95 + r() * 0.1)));

  // ── wood and plants ──
  {
    // Bark: each column its own shade, with dark furrows running down it.
    const col = Array.from({ length: 16 }, () => 0.82 + r() * 0.3);
    const furrow = Array.from({ length: 16 }, () => r() < 0.3);
    each('log_side', (x, y) => shade(hex(pal.log), (furrow[x] && (y + x * 3) % 7 !== 0 ? 0.62 : col[x]) * (0.94 + r() * 0.1)));
    const wood = shade(hex(pal.log), 1.75);
    each('log_top', (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return shade(hex(pal.log), 0.8 + r() * 0.2);
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      return shade(wood, Math.floor(d) % 2 ? 0.86 : 1.0);
    });
    each('birch_side', (x, y) => {
      const mark = (Math.floor(y / 3) * 7 + Math.floor(x / 4) * 5) % 9 === 0 && r() < 0.85;
      return mark ? [58, 56, 52] : shade([216, 214, 206], 0.92 + r() * 0.1);
    });
    each('birch_top', (x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return shade([216, 214, 206], 0.9);
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      return shade([206, 186, 130], Math.floor(d) % 2 ? 0.88 : 1.0);
    });
  }
  {
    // Leaves: clumps of green with gaps you see the sky through.
    const f = field(1);
    const leaves = tones(pal.leaves, [0.7, 0.86, 1.0, 1.14]);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const v = f[x + y * 16];
        if (v < 0.2) put('leaves', x, y, leaves[0], 0);
        else put('leaves', x, y, pick(leaves, (v - 0.2) / 0.8));
      }
  }
  // Plants: drawn on a clear ground, as Minecraft's are, and shown as two crossed panes.
  const clear = (tile) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(tile, x, y, [0, 0, 0], 0);
  };
  {
    clear('tallgrass');
    for (let x = 0; x < 16; x++) {
      if (r() < 0.35) continue;
      const h = 5 + Math.floor(r() * 9);
      const lean = r() < 0.5 ? -1 : 1;
      for (let k = 0; k < h; k++) {
        const xx = x + (k > h * 0.6 && r() < 0.5 ? lean : 0);
        if (xx < 0 || xx > 15) continue;
        put('tallgrass', xx, 15 - k, shade(grass[Math.floor(r() * 4)], 0.85 + (k / h) * 0.3));
      }
    }
  }
  const flower = (tile, petal, centre) => {
    clear(tile);
    const stem = shade(hex(pal.grass), 0.75);
    for (let y = 8; y < 16; y++) put(tile, 7 + (y > 12 ? 1 : 0), y, stem);
    put(tile, 6, 12, stem);
    put(tile, 5, 11, stem);
    put(tile, 9, 13, stem);
    for (let y = 3; y < 8; y++)
      for (let x = 5; x < 11; x++) {
        const d = Math.hypot(x - 7.5, y - 5);
        if (d < 2.9) put(tile, x, y, d < 1.1 ? centre : shade(petal, 0.85 + r() * 0.25));
      }
  };
  flower('poppy', [214, 30, 30], [40, 30, 20]);
  flower('dandelion', [248, 214, 40], [232, 170, 20]);
  const mushroom = (tile, cap, spots) => {
    clear(tile);
    for (let y = 9; y < 16; y++) for (let x = 7; x < 9; x++) put(tile, x, y, shade([222, 210, 186], 0.9 + r() * 0.1));
    for (let y = 5; y < 10; y++)
      for (let x = 3; x < 13; x++) {
        const w = y === 5 ? 3 : y === 6 ? 4 : 5;
        if (Math.abs(x - 7.5) > w) continue;
        put(tile, x, y, spots && r() < 0.18 ? [236, 230, 222] : shade(cap, 0.85 + r() * 0.2));
      }
  };
  mushroom('red_mushroom', [196, 30, 28], true);
  mushroom('brown_mushroom', [150, 108, 78], false);
  // The flare (round 7; it was a torch): a metal stick (columns 7–8, rows 6–15) with a red band, under a white-hot tip
  // (rows 2–5) with a pale blue edge. The mesher cuts these parts out.
  each('torch', (x, y) => {
    if (y < 6) return y < 3 ? [255, 255, 255] : y < 5 ? [226, 244, 255] : [150, 210, 255];
    if (y === 9 || y === 10) return shade([208, 64, 44], x % 2 ? 0.8 : 1);
    return shade([150, 158, 166], x % 2 ? 0.7 : 1);
  });

  // ── worked stone, the rooms and the secret worlds ──
  const glyph = new Set();
  for (let k = 0; k < 5; k++) {
    const gx = 2 + Math.floor(r() * 10), gy = 2 + Math.floor(r() * 10);
    const len = 2 + Math.floor(r() * 4);
    const vertical = r() < 0.5;
    for (let s = 0; s < len; s++) glyph.add(vertical ? `${gx},${gy + s}` : `${gx + s},${gy}`);
  }
  each('rune', (x, y) => (glyph.has(`${x},${y}`) ? shade(hex(pal.accent), 1.1) : shade([58, 54, 66], 0.85 + r() * 0.3)));
  each('floor', (x, y) => shade([92, 86, 98], (x % 8 === 0 || y % 8 === 0 ? 0.7 : 1) * (0.9 + r() * 0.2)));
  each('lectern_top', (x, y) => (x > 2 && x < 13 && y > 3 && y < 12 ? shade([236, 222, 186], 0.9 + r() * 0.1) : shade([96, 66, 40], 0.9 + r() * 0.2)));
  each('lectern_side', (x, y) => shade([96, 66, 40], (y % 5 === 0 ? 0.7 : 1) * (0.9 + r() * 0.2)));
  each('frame', (x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? shade(hex(pal.accent), 0.7) : shade([30, 22, 44], 0.8 + r() * 0.4)));
  each('dormant', (x, y) => shade([24, 20, 34], 0.8 + 0.4 * Math.abs(Math.sin(x * 0.6 + y * 0.4))));
  each('metal', (x, y) => shade(hex(pal.metal), (x === 0 || y === 0 ? 1.2 : x === 15 || y === 15 ? 0.6 : 1) * ((x === 3 || x === 12) && (y === 3 || y === 12) ? 0.6 : 0.95 + r() * 0.08)));
  each('metalfloor', (x, y) => shade(hex(pal.metal), ((x + y) % 4 === 0 ? 0.75 : 0.95) * (0.95 + r() * 0.1)));
  each('cactus', (x) => shade([70, 140, 60], (x % 4 === 1 ? 0.7 : 1) * (0.9 + r() * 0.2)));
  each('cactus_top', () => shade([90, 160, 70], 0.9 + r() * 0.2));
  each('crate', (x, y) => shade([150, 105, 55], (x < 2 || y < 2 || x > 13 || y > 13 || x === y || x === 15 - y ? 0.65 : 1) * (0.9 + r() * 0.2)));
  {
    // Cobble: rounded stones with dark mortar between them, lit from the top left.
    const c = cells(9);
    const tone = Array.from({ length: c.n }, () => 0.82 + r() * 0.3);
    each('cobble', (x, y) => {
      if (c.edge(x, y)) return shade(hex(pal.stone), 0.5 + r() * 0.08);
      const up = c.own[x + ((y + 15) % 16) * 16] !== c.own[x + y * 16] || c.own[((x + 15) % 16) + y * 16] !== c.own[x + y * 16];
      return shade(hex(pal.stone), tone[c.own[x + y * 16]] * (up ? 1.18 : 1) * (0.95 + r() * 0.08));
    });
  }
  each('pillar', (x) => shade([200, 192, 176], (x % 5 === 0 ? 0.75 : 1) * (0.9 + r() * 0.15)));
  each('pillar_top', (x, y) => shade([200, 192, 176], (x === 0 || y === 0 || x === 15 || y === 15 ? 0.75 : 1) * (0.9 + r() * 0.15)));
  each('beacon', (x, y) => shade(hex(pal.accent), 1.1 - Math.hypot(x - 7.5, y - 7.5) * 0.04));
  // Planks: four boards a tile, each its own shade, the joins staggered, a dark line between.
  {
    const tone = [0.95, 1.05, 0.9, 1.0].map((t) => t + (r() - 0.5) * 0.06);
    each('planks', (x, y) => {
      const b = Math.floor(y / 4);
      const join = (x + b * 7) % 16 === 0;
      return shade([162, 124, 78], (y % 4 === 3 || join ? 0.62 : tone[b]) * (0.93 + r() * 0.1));
    });
  }
  // The cache: dark plate with a glowing seam round the lid and a mark in the middle.
  const cacheGlow = [96, 236, 214];
  each('cache', (x, y) => {
    if (y === 5 || y === 6) return shade(cacheGlow, 0.85 + r() * 0.2);
    if ((x === 7 || x === 8) && y >= 8 && y <= 11) return shade(cacheGlow, 1);
    return shade([52, 58, 70], (x === 0 || x === 15 || y === 0 || y === 15 ? 0.6 : 1) * (0.9 + r() * 0.15));
  });
  each('cache_top', (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 2.5 && d < 4) return shade(cacheGlow, 0.9 + r() * 0.15);
    return shade([52, 58, 70], (d > 7 ? 0.6 : 1) * (0.9 + r() * 0.15));
  });

  // ── their places (round 8) ──
  {
    // Dressed stone: big blocks in two courses a tile, the joints staggered, a chisel speckle, lit from the top left.
    const stone = [172, 160, 140];
    const ashlar = (tile, base, crackRows) => {
      const f = field(1);
      each(tile, (x, y) => {
        const course = y >> 3;
        const joint = y % 8 === 7 || (x + course * 8) % 16 === 15;
        const lit = y % 8 === 0 || (x + course * 8) % 16 === 0;
        return shade(base, (joint ? 0.6 : lit ? 1.12 : 0.92 + f[x + y * 16] * 0.14) * (0.96 + r() * 0.06));
      });
    };
    ashlar('carved', stone);
    each('carved_top', (x, y) => shade(stone, (x === 0 || y === 0 ? 1.1 : x === 15 || y === 15 ? 0.62 : 0.95) * (0.94 + r() * 0.08)));
    ashlar('carved_dark', [74, 70, 80]);
    ashlar('carved_cracked', stone);
    {
      // Cracks: two wandering dark lines across the courses, and a corner chipped away.
      const i = TILE_INDEX.carved_cracked;
      const px0 = (i % PER_ROW) * TILE, py0 = Math.floor(i / PER_ROW) * TILE;
      const dark = (x, y, f) => {
        const o = ((py0 + y) * ATLAS + px0 + x) * 4;
        for (let k = 0; k < 3; k++) img.data[o + k] = Math.round(img.data[o + k] * f);
      };
      for (let k = 0; k < 2; k++) {
        let x = 2 + r() * 12, y = 0;
        while (y < 16) {
          dark(Math.max(0, Math.min(15, Math.floor(x))), y, 0.45);
          x += (r() - 0.5) * 2.2;
          y++;
        }
      }
      for (let y = 11; y < 16; y++) for (let x = 0; x < 16 - y + 10; x++) if (x < 5) dark(x, y, 0.7);
    }
    {
      // Fallen rock: broken lumps of stone and dressed stone with dark gaps, loose.
      const c = cells(11);
      const tone = Array.from({ length: c.n }, () => [0.7 + r() * 0.35, r() < 0.3]);
      each('rubble', (x, y) => {
        if (c.edge(x, y)) return shade([60, 56, 54], 0.8 + r() * 0.2);
        const [t, worked] = tone[c.own[x + y * 16]];
        return shade(worked ? stone : hex(pal.stone), t * (0.92 + r() * 0.1));
      });
    }
    // A floor mosaic: tesserae two pixels square, a diamond in rings of colour on pale ground.
    const tess = [[226, 214, 186], [196, 124, 64], [52, 128, 132], [176, 64, 56], [232, 196, 96]];
    each('mosaic', (x, y) => {
      if (x % 2 === 1 && y % 2 === 1 && r() < 0.6) return [96, 88, 80];
      const d = Math.abs((x >> 1) - 3.5) + Math.abs((y >> 1) - 3.5);
      return shade(tess[[0, 3, 1, 2, 4, 1, 0, 2][Math.floor(d)] ?? 0], 0.9 + r() * 0.12);
    });
    // A frieze: a band of carved waves along the wall, deep shadow under each crest.
    each('frieze', (x, y) => {
      if (y < 2 || y > 13) return shade(stone, y === 1 || y === 14 ? 0.62 : 1.05);
      const crest = 7.5 + Math.sin((x / 16) * Math.PI * 4) * 3.5;
      const v = y < crest ? 1.12 : y < crest + 1.5 ? 0.55 : 0.85;
      return shade(stone, v * (0.95 + r() * 0.06));
    });
    each('tile', (x, y) => shade([178, 98, 64], (x % 4 === 3 || y % 4 === 3 ? 0.55 : 0.9 + ((x >> 2) + (y >> 2)) % 2 * 0.12) * (0.95 + r() * 0.08)));
    // A shelf of tablets: two shelves, each with clay tablets standing on it, lines scratched across them.
    each('tablets', (x, y) => {
      const row = y >> 3;
      if (y % 8 === 7) return shade(stone, 0.7);
      if (y % 8 === 0) return shade(stone, 1.05);
      const slot = (x + row * 3) % 4;
      if (slot === 3) return shade([40, 36, 34], 1);
      const lineY = y % 8 === 2 || y % 8 === 4;
      return shade([206, 176, 132], (lineY && slot === 1 ? 0.6 : 1) * (0.9 + r() * 0.12));
    });
    // A crystal lantern: a carved frame round a white-violet glow.
    each('lantern', (x, y) => {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6) return shade(stone, d > 7 ? 0.6 : 1.05);
      if (x === 7 || x === 8 || y === 7 || y === 8) return shade(stone, 0.9);
      return shade([226, 214, 255], 1 - d * 0.04 + r() * 0.05);
    });
    each('lantern_top', (x, y) => (Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) < 3 ? [236, 228, 255] : shade(stone, 0.95 + r() * 0.05)));
    // A banner: cloth hanging in the middle of the block, a gold border and a mark, nothing round it.
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const cloth = x >= 4 && x <= 11 && y <= 13 + (x % 2);
        if (!cloth) {
          put('banner', x, y, [0, 0, 0], 0);
          continue;
        }
        const edge = x === 4 || x === 11 || y === 0 || y >= 12 + (x % 2);
        const mark = Math.abs(x - 7.5) + Math.abs(y - 6) < 2.5;
        put('banner', x, y, edge || mark ? shade([214, 172, 72], 0.95 + r() * 0.1) : shade([58, 52, 112], 0.9 + r() * 0.15));
      }
    // Statue stone: pale and smooth, with soft folds running down it.
    each('statue', (x, y) => shade([214, 206, 190], (0.88 + Math.sin(x * 0.9 + Math.sin(y * 0.3) * 1.5) * 0.08) * (0.97 + r() * 0.04)));
    each('statue_top', () => shade([214, 206, 190], 0.95 + r() * 0.05));
    // The stone door: a round stone with a hole through the middle, set in its frame.
    each('stone_door', (x, y) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 1.6) return [30, 28, 28];
      if (d > 7.6) return shade(stone, 0.6);
      return shade([150, 140, 126], (Math.abs(d - 5.2) < 0.6 ? 0.7 : d < 2.4 ? 0.8 : 1) * (0.92 + r() * 0.1));
    });
    // A lamp niche: an arch cut into dressed stone, a warm flame in it.
    each('lamp_niche', (x, y) => {
      const inArch = x >= 4 && x <= 11 && y >= 5 && y <= 13 && (y >= 8 || Math.hypot(x - 7.5, y - 8) < 4);
      if (!inArch) return shade(stone, (y % 8 === 7 ? 0.6 : 0.95) * (0.95 + r() * 0.06));
      const flame = Math.hypot((x - 7.5) * 1.6, y - 10) < 2.6;
      return flame ? [255, 226 - (y - 8) * 10, 140] : shade([255, 190, 110], 0.45 + (13 - y) * 0.04);
    });
    // Carved lines: a sunk panel with rows of cut marks, catching a little light. The marks mean nothing here.
    each('inscribed', (x, y) => {
      if (x < 2 || x > 13 || y < 2 || y > 13) return shade(stone, x === 1 || y === 1 ? 0.6 : 1.0);
      const row = y >= 4 && y <= 12 && (y - 4) % 3 === 0;
      const mark = row && (x * 7 + y * 3) % 5 !== 0;
      return mark ? shade([255, 214, 140], 0.85 + r() * 0.15) : shade(stone, 0.78 + r() * 0.06);
    });
    // A mural (a placeholder: soft shapes of colour on a dark ground, until the motifs are drawn).
    each('mural', (x, y) => {
      const a = Math.sin(x * 0.5) + Math.cos(y * 0.45);
      return a > 1 ? shade([196, 124, 64], 0.9 + r() * 0.1) : a < -0.9 ? shade([52, 128, 132], 0.9 + r() * 0.1) : shade([60, 52, 58], 0.9 + r() * 0.1);
    });
  }

  // ── the ship ──
  {
    // Hull plate: big panels with a rivet at each corner, a seam down one side, a faint wear.
    const plate = (tile, base, f0) =>
      each(tile, (x, y) => {
        const seam = x === 0 || y === 0 ? 1.12 : x === 15 || y === 15 || (y === 7 && x > 0) ? 0.66 : 1;
        const rivet = (x === 2 || x === 13) && (y === 2 || y === 13) ? 0.62 : (x === 2 || x === 13) && (y === 9 || y === 4) ? 0.8 : 1;
        return shade(base, f0 * seam * rivet * (0.95 + r() * 0.07));
      });
    plate('hull', [214, 218, 222], 1);
    plate('hull_dark', [70, 76, 84], 1);
    // Glass: a frame and two streaks of shine; the rest is see-through (cut out, as leaves are).
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const edge = x === 0 || y === 0 || x === 15 || y === 15;
        const streak = (x + y === 9 && x > 3 && x < 7) || (x + y === 19 && x > 8 && x < 12);
        if (edge) put('glass', x, y, [52, 58, 66]);
        else if (streak) put('glass', x, y, [196, 226, 240]);
        else put('glass', x, y, [0, 0, 0], 0);
      }
    // Deck plate: a diamond tread.
    each('deck', (x, y) => shade([112, 118, 126], ((x + y) % 4 === 0 && (x - y + 16) % 4 === 0 ? 1.25 : x === 0 || y === 0 ? 0.7 : 1) * (0.93 + r() * 0.08)));
    // A lit panel: warm light behind a grille.
    each('panel', (x, y) => (x < 2 || y < 2 || x > 13 || y > 13 ? shade([70, 76, 84], 0.9 + r() * 0.1) : y % 3 === 0 ? shade([200, 160, 90], 0.9) : shade([255, 226, 160], 0.95 + r() * 0.06)));
    each('hazard', (x, y) => (Math.floor((x + y) / 4) % 2 ? shade([236, 186, 40], 0.92 + r() * 0.08) : shade([36, 36, 40], 0.9 + r() * 0.15)));
    each('runlight', (x, y) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      return d < 4 ? shade([255, 90, 80], 1.2 - d * 0.08) : shade([70, 76, 84], 0.9 + r() * 0.1);
    });
    // A bunk: a blue blanket, a white pillow at one end.
    each('bunk_top', (x, y) => (x === 0 || x === 15 || y === 0 || y === 15 ? shade([70, 76, 84], 0.9) : y < 5 ? shade([236, 238, 240], 0.92 + r() * 0.06) : shade([62, 92, 150], (y % 4 === 0 ? 0.82 : 1) * (0.93 + r() * 0.08))));
    each('medbed_top', (x, y) => {
      if (x === 0 || x === 15 || y === 0 || y === 15) return shade([180, 186, 192], 0.9);
      if ((x >= 6 && x <= 9 && y >= 4 && y <= 13) || (y >= 7 && y <= 10 && x >= 3 && x <= 12)) return shade([84, 214, 196], 1);
      return shade([240, 242, 244], 0.94 + r() * 0.05);
    });
    // Consoles: a row of lit keys on top, two little screens on the side.
    each('console_top', (x, y) => ((x % 3 === 1) && (y % 3 === 1) && x > 0 && x < 15 && y > 2 ? [[96, 236, 214], [255, 196, 80], [255, 110, 90]][(x + y * 3) % 3] : shade([46, 50, 58], 0.9 + r() * 0.15)));
    each('console_side', (x, y) => (y >= 2 && y <= 7 && ((x >= 2 && x <= 6) || (x >= 9 && x <= 13)) ? shade([60, 170, 160], 0.8 + (y % 2) * 0.25) : shade([46, 50, 58], (y === 0 ? 1.3 : 0.9) + r() * 0.12)));
    each('seat', (x, y) => (x === 0 || x === 15 || y === 0 || y === 15 ? shade([40, 40, 44], 1) : shade([118, 70, 52], (x % 5 === 2 || y % 5 === 2 ? 0.8 : 1) * (0.92 + r() * 0.1))));
    // The log's screen: lines of text in green on black.
    each('screen', (x, y) => {
      if (x === 0 || x === 15 || y === 0 || y === 15) return shade([70, 76, 84], 0.9);
      if (y % 3 === 1 && x > 1 && x < 3 + ((y * 7) % 11)) return [120, 236, 150];
      return shade([14, 22, 18], 0.9 + r() * 0.2);
    });
    each('nozzle', (x, y) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      return d < 3 ? [255, 214, 140] : d < 5.5 ? shade([255, 140, 60], 1.1 - (d - 3) * 0.12) : d < 7 ? shade([40, 40, 44], 0.9) : shade([70, 76, 84], 0.9 + r() * 0.1);
    });
    // Scorched earth: burnt black with ash and an ember or two of brown.
    const ash = [[30, 26, 24], [44, 38, 34], [62, 54, 46], [86, 74, 60]];
    clumps('scorch', ash, 1, [0.3, 0.35, 0.25, 0.1]);
    {
      const f = field(1);
      each('scorch_side', (x, y) => (y < 3 ? pick(ash, f[x + y * 16]) : pick(dirt, f[x + y * 16], [0.15, 0.3, 0.35, 0.2])));
    }
  }

  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  // Lighting is done on the colours as painted (sRGB), the way Minecraft's light map works.
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// The ten stages of a block breaking, as Minecraft draws them over the block: cracks that spread from the middle.
// Grey 0.5 is "no change" under the multiply the overlay uses; darker pixels are the cracks.
export function paintCracks(seed = 11) {
  const r = rng(seed);
  const lines = [];
  for (let k = 0; k < 9; k++) {
    let x = 7.5 + (r() - 0.5) * 3, y = 7.5 + (r() - 0.5) * 3;
    let a = r() * Math.PI * 2;
    const path = [];
    for (let s = 0; s < 14; s++) {
      path.push([Math.floor(x), Math.floor(y)]);
      a += (r() - 0.5) * 1.1;
      x += Math.cos(a);
      y += Math.sin(a);
      if (x < 0 || y < 0 || x >= 16 || y >= 16) break;
    }
    lines.push(path);
  }
  const out = [];
  for (let stage = 0; stage < 10; stage++) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const g = canvas.getContext('2d');
    const img = g.createImageData(16, 16);
    for (let i = 0; i < 256; i++) img.data.set([128, 128, 128, 255], i * 4);
    const reach = (stage + 1) / 10;
    lines.forEach((path, li) => {
      if (li > 2 + stage) return;
      const n = Math.ceil(path.length * Math.min(1, reach * 1.4));
      for (let s = 0; s < n; s++) {
        const [x, y] = path[s];
        img.data.set([40, 40, 40, 255], (x + y * 16) * 4);
      }
    });
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;
    out.push(tex);
  }
  return out;
}

// [top, side, bottom] tile names for a block.
export function tilesOf(id) {
  const t = BLOCKS[id]?.tiles ?? ['white'];
  return t.length === 1 ? [t[0], t[0], t[0]] : t;
}
