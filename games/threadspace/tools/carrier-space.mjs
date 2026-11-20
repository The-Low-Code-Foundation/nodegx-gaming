// How much of the carrier's hull the layout accounts for, and where the empty space is.
//
//   node tools/carrier-space.mjs                                # from this folder: the ship in ships/carrier/
//   node tools/carrier-space.mjs archive/carrier-v1/carrier-v1.layout.json   # the first carrier (archived)
//
// It fills the hull (the `hull.main` and `hull.island` lofts) with 1 m cells and marks each one that falls in a
// compartment. A walkable room counts from its floor to 0.8 m over its ceiling (the deckhead and the ducts in it).
// Then it prints the share accounted for and a top-down map per deck's height band: `#` full, `+` partly, `.` empty,
// `~` a spin drum (its rooms are in `drum` and turn, so they are counted apart), blank outside the hull. Bow on the
// left. Use it after adding compartments: a warship has no empty space to spare.

import { readFileSync, statSync } from 'node:fs';
import { loadLayout } from '../src/core/ship.mjs';

// A ship's folder (ships/carrier) or a layout in one file (the archived first carrier's).
const file = new URL('../' + (process.argv[2] ?? 'ships/carrier'), import.meta.url).pathname.replace(/\/$/, '');
const L = statSync(file).isDirectory() ? await loadLayout(file, async (p) => JSON.parse(readFileSync(p))) : JSON.parse(readFileSync(file));
const lofts = [L.hull.main, L.hull.island].filter(Boolean);
const floorOf = Object.fromEntries(L.decks.map((d) => [d.id, d.floor]));
const boxes = L.compartments.map((c) => {
  const y = c.y ?? [floorOf[c.deck], floorOf[c.deck] + (c.h ?? 3) + 0.8];
  return { c, x: c.x, y, z: c.z };
});

/** Inside a loft's chamfered section at z (the chamfer is `c` of the smaller half-size, 0.32 when not given), `inset`
 *  metres in from the skin: that metre is the hull's own frames and armour. */
function inLoft(S, x, y, z, inset) {
  if (z < S[0].z || z > S[S.length - 1].z) return false;
  let i = 0;
  while (S[i + 1].z < z) i++;
  const t = (z - S[i].z) / (S[i + 1].z - S[i].z || 1);
  const lerp = (k, d = 0) => (S[i][k] ?? d) + ((S[i + 1][k] ?? d) - (S[i][k] ?? d)) * t;
  const a = lerp('w') / 2 - inset, b = lerp('h') / 2 - inset, cy = lerp('y'), c = Math.min(a, b) * lerp('c', 0.32);
  const px = Math.abs(x), py = Math.abs(y - cy);
  return px <= a && py <= b && px + py <= a + b - c;
}
const inside = (x, y, z) => lofts.some((S) => inLoft(S, x, y, z, 1));
const insideSkin = (x, y, z) => lofts.some((S) => inLoft(S, x, y, z, -0.01));
/** In a drum's section outside the fixed spine: the spinning rooms, the belt, and the sleeve's gap. */
const inDrum = (x, y, z) => !!L.drum && L.drum.halves.some((h) => z > h.z[0] && z < h.z[1]) && Math.hypot(x, y) > L.drum.hub.spineR;

const full = (x, y, z) => boxes.some((b) => x >= b.x[0] && x < b.x[1] && y >= b.y[0] && y < b.y[1] && z >= b.z[0] && z < b.z[1]);

// The extent of the hull, and a height band per deck (from its floor to the next floor up).
const all = lofts.flat();
const z0 = Math.floor(L.hull.main[0].z), z1 = Math.ceil(L.hull.main[L.hull.main.length - 1].z);
const half = Math.ceil(Math.max(...all.map((s) => s.w / 2)));
const yLo = Math.floor(Math.min(...all.map((s) => (s.y ?? 0) - s.h / 2))), yHi = Math.ceil(Math.max(...all.map((s) => (s.y ?? 0) + s.h / 2)));
const floors = [...L.decks].sort((a, b) => b.floor - a.floor);
const BANDS = floors.map((d, i) => [d.name, d.floor, i ? floors[i - 1].floor : yHi]);
BANDS.push(['below the lowest deck', yLo, floors[floors.length - 1].floor]);

let hull = 0, used = 0, spun = 0;
const maps = BANDS.map(() => new Map());
for (let z = z0; z < z1; z++) for (let x = -half; x < half; x++) for (let y = yLo; y < yHi; y++) {
  const [cx, cy, cz] = [x + 0.5, y + 0.5, z + 0.5];
  if (!inside(cx, cy, cz)) continue;
  const bi = BANDS.findIndex(([, b0, b1]) => cy >= b0 && cy < b1);
  const key = `${Math.floor((x + half) / 4)},${Math.floor((z - z0) / 4)}`;
  if (inDrum(cx, cy, cz)) { spun++; if (bi >= 0) maps[bi].set(key, maps[bi].get(key) ?? 'drum'); continue; }
  hull++;
  const f = full(cx, cy, cz);
  if (f) used++;
  if (bi < 0) continue;
  let m = maps[bi].get(key);
  if (!Array.isArray(m)) m = [0, 0];
  m[0]++;
  if (f) m[1]++;
  maps[bi].set(key, m);
}

// Compartments that overlap (a walkable room counts to its ceiling here, not its deckhead).
const solid = L.compartments.map((c) => ({ c, x: c.x, z: c.z, y: c.y ?? [floorOf[c.deck], floorOf[c.deck] + (c.h ?? 3)] }));
const clash = [];
for (let i = 0; i < solid.length; i++) for (let k = i + 1; k < solid.length; k++) {
  const a = solid[i], b = solid[k];
  const o = (p) => Math.min(a[p][1], b[p][1]) - Math.max(a[p][0], b[p][0]);
  if (o('x') > 0.01 && o('y') > 0.01 && o('z') > 0.01) clash.push(`${a.c.id} and ${b.c.id}`);
}
// Sealed compartments that poke out through the hull (their corners, tested without the 1 m allowance).
const outside = L.compartments.filter((c) => c.y && [0, 1].some((i) => [0, 1].some((j) => [0, 1].some((k) => !insideSkin(c.x[i], c.y[j], c.z[k])))));

if (clash.length) console.log(`Overlapping: ${clash.join('; ')}\n`);
if (outside.length) console.log(`Through the hull: ${outside.map((c) => c.id).join(', ')}\n`);
console.log(`Hull volume (1 m in from the skin${L.drum ? ', less the drums' : ''}): ${hull.toLocaleString()} m³`);
console.log(`Accounted for: ${used.toLocaleString()} m³, ${((100 * used) / hull).toFixed(1)}%`);
if (L.drum) console.log(`Drum sections (rooms, belt, sleeve gap): ${spun.toLocaleString()} m³, ${L.drum.rooms.length} rooms in \`drum\``);
console.log('');
const rows = Math.ceil((2 * half) / 4), cols = Math.ceil((z1 - z0) / 4);
BANDS.forEach(([name, y0, y1], bi) => {
  if (!maps[bi].size) return;
  console.log(`${name} (y ${y0} to ${y1}), bow left, port at the top, one character is 4 m:`);
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let k = 0; k < cols; k++) {
      const m = maps[bi].get(`${r},${k}`);
      line += !m ? ' ' : m === 'drum' ? '~' : m[1] === m[0] ? '#' : m[1] > m[0] / 3 ? '+' : '.';
    }
    if (line.trim()) console.log('  ' + line);
  }
  console.log('');
});
