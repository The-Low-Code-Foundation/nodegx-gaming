// How much of the carrier's hull the layout accounts for, and where the empty space is.
//
//   node tools/carrier-space.mjs            # from this folder
//
// It fills the hull (the `hull.main` loft in ships/carrier.layout.json) with 1 m cells and marks each one that falls in
// a compartment. A walkable room counts from its floor to 0.8 m over its ceiling (the deckhead and the ducts in it).
// Then it prints the share accounted for and a top-down map per height band: `#` full, `+` partly, `.` empty, blank
// outside the hull. Bow on the left. Use it after adding compartments: a warship has no empty space to spare.

import { readFileSync } from 'node:fs';

const L = JSON.parse(readFileSync(new URL('../ships/carrier.layout.json', import.meta.url)));
const S = L.hull.main;
const floorOf = Object.fromEntries(L.decks.map((d) => [d.id, d.floor]));
const boxes = L.compartments.map((c) => {
  const y = c.y ?? [floorOf[c.deck], floorOf[c.deck] + (c.h ?? 3) + 0.8];
  return { c, x: c.x, y, z: c.z };
});

/** Inside the hull's octagonal section at z (the loft's chamfer is 0.32 of the smaller half-size). Kept 1 m in from
 *  the skin: that metre is the hull's own frames and armour. */
function inside(x, y, z) {
  if (z < S[0].z || z > S[S.length - 1].z) return false;
  let i = 0;
  while (S[i + 1].z < z) i++;
  const t = (z - S[i].z) / (S[i + 1].z - S[i].z);
  const lerp = (k) => S[i][k] + (S[i + 1][k] - S[i][k]) * t;
  const a = lerp('w') / 2 - 1, b = lerp('h') / 2 - 1, cy = lerp('y');
  const c = Math.min(a, b) * 0.32;
  const px = Math.abs(x), py = Math.abs(y - cy);
  return px <= a && py <= b && px + py <= a + b - c;
}

const full = (x, y, z) => boxes.some((b) => x >= b.x[0] && x < b.x[1] && y >= b.y[0] && y < b.y[1] && z >= b.z[0] && z < b.z[1]);

let hull = 0, used = 0;
const BANDS = [['above the main deck', 4, 10], ['main deck', 0, 4], ['between decks', -8, 0], ['lower deck', -24, -8]];
const maps = BANDS.map(() => new Map());
for (let z = -200; z < 190; z++) for (let x = -34; x < 34; x++) for (let y = -24; y < 10; y++) {
  const [cx, cy, cz] = [x + 0.5, y + 0.5, z + 0.5];
  if (!inside(cx, cy, cz)) continue;
  hull++;
  const f = full(cx, cy, cz);
  if (f) used++;
  const bi = BANDS.findIndex(([, y0, y1]) => cy >= y0 && cy < y1);
  if (bi < 0) continue;
  const key = `${Math.floor((x + 34) / 4)},${Math.floor((z + 200) / 4)}`;
  const m = maps[bi].get(key) ?? [0, 0];
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
function insideSkin(x, y, z) {
  const zz = Math.max(S[0].z, Math.min(S[S.length - 1].z, z));
  let i = 0;
  while (S[i + 1].z < zz) i++;
  const t = (zz - S[i].z) / (S[i + 1].z - S[i].z);
  const lerp = (k) => S[i][k] + (S[i + 1][k] - S[i][k]) * t;
  const a = lerp('w') / 2 + 0.01, b = lerp('h') / 2 + 0.01, c = Math.min(a, b) * 0.32;
  const px = Math.abs(x), py = Math.abs(y - lerp('y'));
  return px <= a && py <= b && px + py <= a + b - c;
}

if (clash.length) console.log(`Overlapping: ${clash.join('; ')}\n`);
if (outside.length) console.log(`Through the hull: ${outside.map((c) => c.id).join(', ')}\n`);
console.log(`Hull volume (1 m in from the skin): ${hull.toLocaleString()} m³`);
console.log(`Accounted for: ${used.toLocaleString()} m³, ${((100 * used) / hull).toFixed(1)}%\n`);
BANDS.forEach(([name, y0, y1], bi) => {
  console.log(`${name} (y ${y0} to ${y1}), bow left, port at the top, one character is 4 m:`);
  for (let r = 0; r < 17; r++) {
    let line = '';
    for (let k = 0; k < 98; k++) {
      const m = maps[bi].get(`${r},${k}`);
      line += !m ? ' ' : m[1] === m[0] ? '#' : m[1] > m[0] / 3 ? '+' : '.';
    }
    console.log('  ' + line);
  }
  console.log('');
});
