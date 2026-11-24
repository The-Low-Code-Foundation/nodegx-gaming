// Draws the 78 card faces as small SVG files, in the app's night-and-gold look.
//
//   node tools/draw-cards.mjs
//
// It reads the card names from the deck itself (Data/Cards, the "EDIT: the 78 cards" Static Data node) and writes
// project/cards/<id>.svg, one per card, plus project/cards/back.svg. The app shows them as plain images, so you can
// replace any of them with your own picture under the same file name (keep it portrait, about 7 by 12).
//
// The pictures are simple on purpose: each Major Arcana card gets the emblem a Rider-Waite deck is known for
// (the Tower and its lightning, the Hermit's lantern, the Wheel), each numbered card gets its pips, and each court
// card gets a headpiece (Page: a cap, Knight: a helm, Queen and King: a crown) over its suit's symbol.
// No deck's artwork is copied; every shape is drawn here.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const project = join(here, '..', 'project');
const out = join(project, 'cards');

const deckNode = JSON.parse(readFileSync(join(project, 'components', 'Data', 'Cards', 'nodes.json'), 'utf8')).nodes.find(
  (n) => n.type === 'Static Data'
);
const cards = JSON.parse(deckNode.parameters.json);

// ---- the palette (the app's tokens, as hex: SVG in an <img> cannot read CSS variables) ----
const C = {
  night: '#14112a',
  dusk: '#251e49',
  gold: '#e8b84a',
  goldDeep: '#a8822a',
  ink: '#f3ead2',
  violet: '#8f7ad6',
  violetDeep: '#5b4a9c',
  shadow: '#0c0a1c',
  wood: '#b7773d',
  leaf: '#8fc46a',
  water: '#6fb3d9',
  waterDeep: '#3d7fa6',
  steel: '#dfe5f2',
  steelDeep: '#8e9abb',
  red: '#d9654b',
  rose: '#f0d8de'
};
const SUIT = {
  major: { accent: C.violet },
  wands: { accent: '#e08a4a' },
  cups: { accent: C.water },
  swords: { accent: C.steelDeep },
  pentacles: { accent: C.leaf }
};

const W = 140;
const H = 240;
const CX = 70;
const CY = 118; // the middle of the picture area (y 42 to 194)

const f = (n) => Math.round(n * 100) / 100;
const pts = (list) => list.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
function star(cx, cy, r, points = 5, inner = 0.42, rot = -90) {
  const p = [];
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    p.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return pts(p);
}
function rays(cx, cy, r1, r2, n, stroke, width = 1.2, opacity = 1, offset = 0) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = ((offset + (i * 360) / n) * Math.PI) / 180;
    s += `<line x1="${f(cx + r1 * Math.cos(a))}" y1="${f(cy + r1 * Math.sin(a))}" x2="${f(cx + r2 * Math.cos(a))}" y2="${f(cy + r2 * Math.sin(a))}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
  }
  return s;
}

// ---- the four suit symbols, drawn centred on (0, 0); `s` is the height ----
function wand(s, w = s * 0.12) {
  const leaf = (y, side) =>
    `<ellipse cx="${f(side * w * 1.25)}" cy="${f(y)}" rx="${f(w * 1.05)}" ry="${f(w * 0.45)}" transform="rotate(${side * -35} ${f(side * w * 1.25)} ${f(y)})" fill="${C.leaf}"/>`;
  return (
    `<rect x="${f(-w / 2)}" y="${f(-s / 2)}" width="${f(w)}" height="${f(s)}" rx="${f(w / 2)}" fill="${C.wood}" stroke="#e08a4a" stroke-width="${f(Math.max(0.6, s * 0.015))}"/>` +
    leaf(-s * 0.3, 1) +
    leaf(-s * 0.08, -1) +
    leaf(s * 0.16, 1)
  );
}
function cup(s) {
  const r = s * 0.42;
  const top = -s * 0.48;
  return (
    `<path d="M${f(-r)},${f(top)} Q${f(-r)},${f(s * 0.08)} 0,${f(s * 0.1)} Q${f(r)},${f(s * 0.08)} ${f(r)},${f(top)} Z" fill="${C.water}" stroke="${C.gold}" stroke-width="${f(Math.max(0.6, s * 0.03))}"/>` +
    `<ellipse cx="0" cy="${f(top)}" rx="${f(r)}" ry="${f(s * 0.07)}" fill="${C.waterDeep}" stroke="${C.gold}" stroke-width="${f(Math.max(0.6, s * 0.03))}"/>` +
    `<rect x="${f(-s * 0.05)}" y="${f(s * 0.09)}" width="${f(s * 0.1)}" height="${f(s * 0.28)}" fill="${C.gold}"/>` +
    `<ellipse cx="0" cy="${f(s * 0.42)}" rx="${f(s * 0.26)}" ry="${f(s * 0.075)}" fill="${C.gold}"/>`
  );
}
function sword(s, w = s * 0.11, hw = s * 0.19) {
  const guard = s * 0.2;
  const sw = f(Math.max(0.5, s * 0.012));
  return (
    `<polygon points="${pts([[0, -s / 2], [w / 2, -s / 2 + w * 1.6], [w / 2, guard], [-w / 2, guard], [-w / 2, -s / 2 + w * 1.6]])}" fill="${C.steel}" stroke="${C.steelDeep}" stroke-width="${sw}"/>` +
    `<line x1="0" y1="${f(-s / 2 + w * 1.8)}" x2="0" y2="${f(guard - w * 0.4)}" stroke="${C.steelDeep}" stroke-width="${sw}"/>` +
    `<rect x="${f(-hw)}" y="${f(guard)}" width="${f(hw * 2)}" height="${f(s * 0.055)}" rx="${f(s * 0.025)}" fill="${C.gold}"/>` +
    `<rect x="${f(-w * 0.35)}" y="${f(guard + s * 0.055)}" width="${f(w * 0.7)}" height="${f(s * 0.18)}" fill="${C.violetDeep}"/>` +
    `<circle cx="0" cy="${f(guard + s * 0.27)}" r="${f(s * 0.045)}" fill="${C.gold}"/>`
  );
}
function pentacle(s) {
  const r = s / 2;
  const sw = f(Math.max(0.6, s * 0.035));
  const p = [];
  for (let i = 0; i < 5; i++) {
    const a = ((-90 + i * 144) * Math.PI) / 180;
    p.push([r * 0.66 * Math.cos(a), r * 0.66 * Math.sin(a)]);
  }
  return (
    `<circle r="${f(r)}" fill="${C.gold}" stroke="${C.goldDeep}" stroke-width="${sw}"/>` +
    `<circle r="${f(r * 0.78)}" fill="none" stroke="${C.goldDeep}" stroke-width="${sw}"/>` +
    `<polygon points="${pts(p)}" fill="none" stroke="${C.goldDeep}" stroke-width="${sw}" stroke-linejoin="round"/>`
  );
}
const SYMBOL = { wands: wand, cups: cup, swords: sword, pentacles: pentacle };
const LONG = { wands: true, swords: true };
const at = (x, y, inner, extra = '') => `<g transform="translate(${f(x)} ${f(y)})${extra}">${inner}</g>`;

// Pip positions in a box from -1 to 1, the way playing cards lay them out.
const PIPS = {
  2: [[0, -0.6], [0, 0.6]],
  3: [[0, -0.66], [0, 0], [0, 0.66]],
  4: [[-0.5, -0.55], [0.5, -0.55], [-0.5, 0.55], [0.5, 0.55]],
  5: [[-0.5, -0.6], [0.5, -0.6], [0, 0], [-0.5, 0.6], [0.5, 0.6]],
  6: [[-0.5, -0.68], [0.5, -0.68], [-0.5, 0], [0.5, 0], [-0.5, 0.68], [0.5, 0.68]],
  7: [[-0.5, -0.7], [0.5, -0.7], [0, -0.35], [-0.5, 0], [0.5, 0], [-0.5, 0.7], [0.5, 0.7]],
  8: [[-0.5, -0.7], [0.5, -0.7], [0, -0.35], [-0.5, 0], [0.5, 0], [0, 0.35], [-0.5, 0.7], [0.5, 0.7]],
  9: [[-0.5, -0.75], [0.5, -0.75], [-0.5, -0.25], [0.5, -0.25], [0, 0], [-0.5, 0.25], [0.5, 0.25], [-0.5, 0.75], [0.5, 0.75]],
  10: [[-0.5, -0.75], [0.5, -0.75], [0, -0.5], [-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25], [0, 0.5], [-0.5, 0.75], [0.5, 0.75]]
};
function pipCard(suit, n) {
  const draw = SYMBOL[suit];
  if (LONG[suit]) {
    // Staves and blades stand side by side: one row up to four, two rows from five.
    const rowsOf = n <= 4 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
    const s = rowsOf.length === 1 ? 104 : 66;
    const ys = rowsOf.length === 1 ? [CY] : [CY - 38, CY + 38];
    const w = suit === 'wands' ? Math.min(s * 0.12, 6.5) : Math.min(s * 0.11, 7);
    let out = '';
    rowsOf.forEach((count, r) => {
      const gap = Math.min(26, 100 / count);
      for (let i = 0; i < count; i++) {
        const x = CX + (i - (count - 1) / 2) * gap;
        out += at(x, ys[r], suit === 'wands' ? wand(s, w) : sword(s, w, Math.min(s * 0.19, gap * 0.42)));
      }
    });
    return out;
  }
  const s = n <= 3 ? 34 : n <= 6 ? 32 : n <= 8 ? 25 : 23;
  const bx = 28;
  const by = 66;
  return PIPS[n].map(([x, y]) => at(CX + x * bx * 2, CY + y * by, draw(s))).join('');
}
function aceCard(suit) {
  return (
    `<circle cx="${CX}" cy="${CY}" r="50" fill="url(#glow)"/>` +
    rays(CX, CY, 34, 54, 16, C.gold, 1.2, 0.55) +
    at(CX, CY, SYMBOL[suit](LONG[suit] ? 96 : 64))
  );
}
function headpiece(rank, x, y) {
  const g = C.gold;
  if (rank === 11) {
    // Page: a soft cap with a feather
    return (
      `<path d="M${x - 22},${y + 6} Q${x - 24},${y - 14} ${x},${y - 14} Q${x + 26},${y - 14} ${x + 22},${y + 6} Z" fill="${C.violetDeep}" stroke="${g}" stroke-width="1.5"/>` +
      `<rect x="${x - 23}" y="${y + 3}" width="46" height="6" rx="3" fill="${g}"/>` +
      `<path d="M${x + 8},${y - 12} Q${x + 30},${y - 34} ${x + 34},${y - 20} Q${x + 24},${y - 18} ${x + 12},${y - 8} Z" fill="${C.red}" stroke="${g}" stroke-width="1"/>`
    );
  }
  if (rank === 12) {
    // Knight: a helm with a plume
    return (
      `<path d="M${x - 18},${y + 10} L${x - 18},${y - 6} Q${x - 18},${y - 22} ${x},${y - 22} Q${x + 18},${y - 22} ${x + 18},${y - 6} L${x + 18},${y + 10} Z" fill="${C.steel}" stroke="${C.steelDeep}" stroke-width="1.5"/>` +
      `<rect x="${x - 14}" y="${y - 6}" width="28" height="4" rx="2" fill="${C.shadow}"/>` +
      `<line x1="${x}" y1="${y - 1}" x2="${x}" y2="${y + 9}" stroke="${C.steelDeep}" stroke-width="1.5"/>` +
      `<path d="M${x},${y - 22} Q${x - 4},${y - 40} ${x + 22},${y - 36} Q${x + 10},${y - 30} ${x + 6},${y - 21} Z" fill="${C.red}"/>`
    );
  }
  if (rank === 13) {
    // Queen: a crown of five rounded points
    let s = `<path d="M${x - 24},${y + 8} L${x - 26},${y - 12} L${x - 13},${y - 2} L${x - 7},${y - 18} L${x},${y - 4} L${x + 7},${y - 18} L${x + 13},${y - 2} L${x + 26},${y - 12} L${x + 24},${y + 8} Z" fill="${g}" stroke="${C.goldDeep}" stroke-width="1"/>`;
    for (const [px, py] of [[-26, -12], [-7, -18], [7, -18], [26, -12]]) s += `<circle cx="${x + px}" cy="${y + py}" r="3" fill="${C.ink}"/>`;
    return s + `<circle cx="${x}" cy="${y + 3}" r="3" fill="${C.red}"/>`;
  }
  // King: a tall crown with crosses
  let s = `<path d="M${x - 24},${y + 8} L${x - 24},${y - 10} L${x - 12},${y - 2} L${x},${y - 20} L${x + 12},${y - 2} L${x + 24},${y - 10} L${x + 24},${y + 8} Z" fill="${g}" stroke="${C.goldDeep}" stroke-width="1"/>`;
  for (const [px, py] of [[-24, -10], [0, -20], [24, -10]]) {
    s += `<line x1="${x + px}" y1="${y + py - 9}" x2="${x + px}" y2="${y + py}" stroke="${g}" stroke-width="2"/>`;
    s += `<line x1="${x + px - 4}" y1="${y + py - 5}" x2="${x + px + 4}" y2="${y + py - 5}" stroke="${g}" stroke-width="2"/>`;
  }
  return s + `<rect x="${x - 24}" y="${y + 2}" width="48" height="6" fill="${C.goldDeep}"/>` + `<circle cx="${x - 10}" cy="${y + 5}" r="2" fill="${C.red}"/><circle cx="${x + 10}" cy="${y + 5}" r="2" fill="${C.water}"/>`;
}
function courtCard(suit, rank) {
  return (
    `<circle cx="${CX}" cy="${CY + 22}" r="40" fill="url(#glow)"/>` +
    headpiece(rank, CX, 78) +
    at(CX, CY + 26, SYMBOL[suit](LONG[suit] ? 86 : 58))
  );
}

// ---- the 22 emblems; each draws into the picture area (x 14 to 126, y 42 to 194) ----
const g = C.gold;
const ink = C.ink;
const person = (x, y, s = 1, fill = ink) =>
  `<circle cx="${x}" cy="${y - 13 * s}" r="${5 * s}" fill="${fill}"/><path d="M${x - 7 * s},${y + 12 * s} L${x},${y - 7 * s} L${x + 7 * s},${y + 12 * s} Z" fill="${fill}"/>`;
const MAJOR = [
  // 0 The Fool: the sun, a bundle on a stick, the cliff edge, a white rose
  () =>
    `<circle cx="102" cy="64" r="13" fill="${g}"/>` +
    rays(102, 64, 16, 22, 12, g, 1.4) +
    `<path d="M14,170 L70,170 L84,194 L14,194 Z" fill="${C.violetDeep}"/>` +
    `<path d="M70,170 L84,194" stroke="${ink}" stroke-width="1.2"/>` +
    `<line x1="40" y1="158" x2="92" y2="104" stroke="${C.wood}" stroke-width="3" stroke-linecap="round"/>` +
    `<circle cx="96" cy="100" r="10" fill="${C.red}" stroke="${g}" stroke-width="1"/>` +
    `<circle cx="44" cy="138" r="6" fill="${C.rose}"/><circle cx="44" cy="138" r="2.4" fill="${g}"/>`,
  // I The Magician: the infinity sign, a raised wand, the four suits on the table
  () =>
    `<path d="M58,58 C50,50 40,58 48,64 C54,68 60,58 70,58 C80,58 86,68 92,64 C100,58 90,50 82,58 C76,64 64,64 58,58 Z" fill="none" stroke="${g}" stroke-width="2.4"/>` +
    `<line x1="70" y1="76" x2="70" y2="136" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="70" cy="76" r="4" fill="${g}"/><circle cx="70" cy="136" r="4" fill="${g}"/>` +
    `<rect x="18" y="160" width="104" height="8" rx="2" fill="${C.wood}"/>` +
    at(32, 150, cup(18)) +
    at(56, 150, pentacle(16)) +
    at(84, 145, sword(28)) +
    at(108, 145, wand(28)),
  // II The High Priestess: two pillars (B and J), the veil, the moon at her feet
  () =>
    `<rect x="22" y="54" width="18" height="128" fill="${C.shadow}" stroke="${g}" stroke-width="1.2"/>` +
    `<rect x="100" y="54" width="18" height="128" fill="${ink}" stroke="${g}" stroke-width="1.2"/>` +
    `<text x="31" y="74" text-anchor="middle" font-family="Georgia, serif" font-size="12" fill="${ink}">B</text>` +
    `<text x="109" y="74" text-anchor="middle" font-family="Georgia, serif" font-size="12" fill="${C.shadow}">J</text>` +
    `<rect x="40" y="58" width="60" height="96" fill="${C.violetDeep}" opacity="0.8"/>` +
    [0, 1, 2].map((r) => [0, 1, 2].map((c) => `<circle cx="${52 + c * 18}" cy="${74 + r * 26}" r="5" fill="${C.red}" opacity="0.85"/>`).join('')).join('') +
    `<path d="M50,176 A22,22 0 1 0 90,176 A17,17 0 1 1 50,176 Z" fill="${ink}"/>`,
  // III The Empress: a heart-shaped shield with the sign of Venus, a crown of stars, wheat
  () =>
    [...Array(12)].map((_, i) => { const a = (Math.PI * (200 + i * 12.7)) / 180; return `<polygon points="${star(70 + 38 * Math.cos(a), 98 + 38 * Math.sin(a), 3.2, 6, 0.45)}" fill="${g}"/>`; }).join('') +
    `<path d="M70,148 C34,118 44,82 70,100 C96,82 106,118 70,148 Z" fill="${C.rose}" stroke="${g}" stroke-width="1.5"/>` +
    `<circle cx="70" cy="108" r="8" fill="none" stroke="${C.red}" stroke-width="2.4"/><line x1="70" y1="116" x2="70" y2="132" stroke="${C.red}" stroke-width="2.4"/><line x1="63" y1="124" x2="77" y2="124" stroke="${C.red}" stroke-width="2.4"/>` +
    [28, 112].map((x) => `<line x1="${x}" y1="192" x2="${x}" y2="158" stroke="${g}" stroke-width="1.6"/>` + [0, 1, 2, 3].map((i) => `<ellipse cx="${x - 3}" cy="${162 + i * 7}" rx="3" ry="1.6" transform="rotate(-35 ${x - 3} ${162 + i * 7})" fill="${g}"/><ellipse cx="${x + 3}" cy="${165 + i * 7}" rx="3" ry="1.6" transform="rotate(35 ${x + 3} ${165 + i * 7})" fill="${g}"/>`).join('')).join(''),
  // IV The Emperor: mountains, a stone throne with rams' horns, the ankh
  () =>
    `<polygon points="14,150 34,96 50,124 66,86 86,128 104,100 126,150" fill="${C.violetDeep}"/>` +
    `<rect x="38" y="108" width="64" height="80" fill="${C.steelDeep}" stroke="${g}" stroke-width="1.2"/>` +
    [42, 98].map((x) => `<path d="M${x},112 c${x < 70 ? -10 : 10},-14 ${x < 70 ? -22 : 22},4 ${x < 70 ? -10 : 10},10 c${x < 70 ? 6 : -6},2 ${x < 70 ? 8 : -8},-6 ${x < 70 ? 2 : -2},-6" fill="none" stroke="${ink}" stroke-width="2.2"/>`).join('') +
    `<circle cx="70" cy="132" r="8" fill="none" stroke="${g}" stroke-width="3"/><line x1="70" y1="140" x2="70" y2="172" stroke="${g}" stroke-width="3"/><line x1="58" y1="148" x2="82" y2="148" stroke="${g}" stroke-width="3"/>`,
  // V The Hierophant: the triple cross, two crossed keys
  () =>
    `<line x1="70" y1="52" x2="70" y2="150" stroke="${g}" stroke-width="3.4"/>` +
    [[62, 52 + 12], [58, 52 + 24], [54, 52 + 36]].map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${140 - x}" y2="${y}" stroke="${g}" stroke-width="3"/>`).join('') +
    [-1, 1].map((d) => `<g transform="rotate(${d * 35} 70 170)"><line x1="70" y1="140" x2="70" y2="192" stroke="${d < 0 ? g : C.steel}" stroke-width="3"/><circle cx="70" cy="136" r="6" fill="none" stroke="${d < 0 ? g : C.steel}" stroke-width="3"/><rect x="70" y="180" width="9" height="4" fill="${d < 0 ? g : C.steel}"/><rect x="70" y="186" width="6" height="4" fill="${d < 0 ? g : C.steel}"/></g>`).join(''),
  // VI The Lovers: a great sun with wings, two people below it
  () =>
    `<circle cx="70" cy="74" r="16" fill="${g}"/>` +
    rays(70, 74, 19, 27, 16, g, 1.4) +
    `<path d="M52,92 Q30,84 18,100 Q36,98 50,104 Z M88,92 Q110,84 122,100 Q104,98 90,104 Z" fill="${C.violet}"/>` +
    person(42, 168, 1.4) +
    person(98, 168, 1.4, C.rose) +
    `<path d="M70,150 C60,140 62,132 70,138 C78,132 80,140 70,150 Z" fill="${C.red}"/>`,
  // VII The Chariot: a canopy of stars, the car on two wheels, a dark and a light sphinx
  () =>
    `<path d="M30,96 Q70,62 110,96" fill="none" stroke="${C.violet}" stroke-width="2"/>` +
    [36, 52, 70, 88, 104].map((x, i) => `<polygon points="${star(x, [90, 80, 76, 80, 90][i], 4, 6, 0.45)}" fill="${g}"/>`).join('') +
    `<line x1="34" y1="96" x2="34" y2="134" stroke="${g}" stroke-width="2"/><line x1="106" y1="96" x2="106" y2="134" stroke="${g}" stroke-width="2"/>` +
    `<rect x="30" y="118" width="80" height="34" rx="3" fill="${C.steelDeep}" stroke="${g}" stroke-width="1.5"/>` +
    `<circle cx="38" cy="156" r="11" fill="none" stroke="${g}" stroke-width="2.4"/><circle cx="102" cy="156" r="11" fill="none" stroke="${g}" stroke-width="2.4"/>` +
    `<path d="M46,192 q0,-16 12,-18 q8,0 8,8 l0,10 Z" fill="${C.shadow}" stroke="${g}" stroke-width="1"/>` +
    `<path d="M94,192 q0,-16 -12,-18 q-8,0 -8,8 l0,10 Z" fill="${ink}" stroke="${g}" stroke-width="1"/>`,
  // VIII Strength: the infinity sign over a lion's head
  () =>
    `<path d="M58,62 C50,54 40,62 48,68 C54,72 60,62 70,62 C80,62 86,72 92,68 C100,62 90,54 82,62 C76,68 64,68 58,62 Z" fill="none" stroke="${g}" stroke-width="2.4"/>` +
    `<polygon points="${star(70, 132, 46, 16, 0.78)}" fill="#c9822f"/>` +
    `<circle cx="70" cy="132" r="30" fill="${g}"/>` +
    `<circle cx="59" cy="124" r="3.4" fill="${C.shadow}"/><circle cx="81" cy="124" r="3.4" fill="${C.shadow}"/>` +
    `<path d="M64,138 L76,138 L70,146 Z" fill="${C.shadow}"/><path d="M62,152 Q70,158 78,152" fill="none" stroke="${C.shadow}" stroke-width="2"/>` +
    `<path d="M48,108 q4,-10 12,-8 M92,108 q-4,-10 -12,-8" stroke="${C.goldDeep}" stroke-width="2" fill="none"/>`,
  // IX The Hermit: a mountain peak, a staff, the lantern with a star in it
  () =>
    `<polygon points="14,194 70,120 126,194" fill="${C.violetDeep}"/><polygon points="56,138 70,120 84,138 76,134 70,140 64,134" fill="${ink}"/>` +
    `<line x1="38" y1="56" x2="38" y2="190" stroke="${C.wood}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<line x1="88" y1="56" x2="88" y2="66" stroke="${g}" stroke-width="1.6"/>` +
    `<circle cx="88" cy="90" r="28" fill="url(#glow)"/>` +
    `<path d="M76,68 L100,68 L104,110 L72,110 Z" fill="${C.shadow}" stroke="${g}" stroke-width="2"/>` +
    `<polygon points="${star(88, 89, 10, 6, 0.5)}" fill="${g}"/>`,
  // X The Wheel of Fortune: a wheel of eight spokes, lettered T A R O
  () =>
    `<circle cx="70" cy="118" r="46" fill="${C.violetDeep}" stroke="${g}" stroke-width="3"/>` +
    `<circle cx="70" cy="118" r="32" fill="none" stroke="${g}" stroke-width="1.5"/>` +
    rays(70, 118, 12, 32, 8, g, 2) +
    `<circle cx="70" cy="118" r="9" fill="${g}"/>` +
    ['T', 'A', 'R', 'O'].map((l, i) => { const a = (Math.PI * (-90 + i * 90)) / 180; return `<text x="${f(70 + 39 * Math.cos(a))}" y="${f(118 + 39 * Math.sin(a) + 4)}" text-anchor="middle" font-family="Georgia, serif" font-size="11" fill="${ink}">${l}</text>`; }).join('') +
    [[22, 64], [118, 64], [22, 176], [118, 176]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${C.violet}"/>`).join(''),
  // XI Justice: the scales, an upright sword
  () =>
    at(70, 120, sword(140)) +
    `<line x1="26" y1="88" x2="114" y2="88" stroke="${g}" stroke-width="2.6"/>` +
    [30, 110].map((x) => `<line x1="${x}" y1="88" x2="${x - 12}" y2="124" stroke="${g}" stroke-width="1"/><line x1="${x}" y1="88" x2="${x + 12}" y2="124" stroke="${g}" stroke-width="1"/><path d="M${x - 16},124 Q${x},138 ${x + 16},124 Z" fill="${g}"/>`).join(''),
  // XII The Hanged Man: the living tree like a T, a figure upside down with a halo
  () =>
    `<rect x="28" y="56" width="84" height="8" rx="3" fill="${C.wood}"/><rect x="28" y="56" width="8" height="138" fill="${C.wood}"/><rect x="104" y="56" width="8" height="138" fill="${C.wood}"/>` +
    [40, 60, 84, 100].map((x) => `<ellipse cx="${x}" cy="54" rx="4" ry="2" fill="${C.leaf}"/>`).join('') +
    `<line x1="70" y1="64" x2="70" y2="80" stroke="${ink}" stroke-width="1.5"/>` +
    `<line x1="70" y1="80" x2="70" y2="104" stroke="${C.red}" stroke-width="5" stroke-linecap="round"/><path d="M70,92 L84,92 L84,104" fill="none" stroke="${C.red}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M60,104 L80,104 L76,142 L64,142 Z" fill="${C.water}"/>` +
    `<circle cx="70" cy="156" r="18" fill="url(#glow)"/><circle cx="70" cy="156" r="14" fill="none" stroke="${g}" stroke-width="2"/><circle cx="70" cy="154" r="8" fill="${ink}"/>`,
  // XIII Death: the black banner with the white rose, a sun rising between two towers
  () =>
    `<path d="M14,194 L14,176 L36,176 L36,160 L46,160 L46,194 Z M126,194 L126,176 L104,176 L104,160 L94,160 L94,194 Z" fill="${C.violetDeep}"/>` +
    `<path d="M52,194 A18,18 0 0 1 88,194 Z" fill="${g}"/>` + [200, 220, 240, 260, 280, 300, 320, 340].map((d) => { const a = (d * Math.PI) / 180; return `<line x1="${f(70 + 22 * Math.cos(a))}" y1="${f(194 + 22 * Math.sin(a))}" x2="${f(70 + 30 * Math.cos(a))}" y2="${f(194 + 30 * Math.sin(a))}" stroke="${g}" stroke-width="1.4" stroke-linecap="round"/>`; }).join('') +
    `<line x1="40" y1="52" x2="40" y2="160" stroke="${C.steelDeep}" stroke-width="3"/>` +
    `<path d="M42,56 L112,56 L104,84 L112,112 L42,112 Z" fill="${C.shadow}" stroke="${g}" stroke-width="1.2"/>` +
    [0, 1, 2, 3, 4].map((i) => { const a = (Math.PI * (-90 + i * 72)) / 180; return `<circle cx="${f(74 + 9 * Math.cos(a))}" cy="${f(84 + 9 * Math.sin(a))}" r="8" fill="${ink}"/>`; }).join('') +
    `<circle cx="74" cy="84" r="5" fill="${g}"/>`,
  // XIV Temperance: two cups with water flowing between them, the road to a sunrise crown
  () =>
    `<circle cx="104" cy="66" r="10" fill="${g}"/>` + rays(104, 66, 13, 18, 10, g, 1.2) +
    `<path d="M104,80 Q96,130 70,194" fill="none" stroke="${C.violet}" stroke-width="2" stroke-dasharray="3 3"/>` +
    at(44, 98, cup(34)) +
    at(92, 150, cup(34)) +
    `<path d="M56,86 Q86,100 88,132" fill="none" stroke="${C.water}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<polygon points="30,170 44,150 58,170" fill="none" stroke="${g}" stroke-width="2"/><rect x="28" y="168" width="32" height="20" fill="none" stroke="${g}" stroke-width="2"/>`,
  // XV The Devil: an upturned star, horns, two figures chained to a block
  () =>
    `<polygon points="${star(70, 64, 16, 5, 0.42, 90)}" fill="none" stroke="${g}" stroke-width="2"/>` +
    `<path d="M40,104 Q36,82 52,74 Q46,90 56,104 Z M100,104 Q104,82 88,74 Q94,90 84,104 Z" fill="${C.red}"/>` +
    `<path d="M34,104 L106,104 L96,122 L44,122 Z" fill="${C.shadow}" stroke="${g}" stroke-width="1.4"/>` +
    `<rect x="54" y="122" width="32" height="22" fill="${C.shadow}" stroke="${g}" stroke-width="1.4"/>` +
    person(32, 176, 1.2) + person(108, 176, 1.2) +
    `<path d="M58,136 Q44,150 34,166 M82,136 Q96,150 106,166" fill="none" stroke="${C.steel}" stroke-width="1.6" stroke-dasharray="4 2"/>`,
  // XVI The Tower: the tower on its rock, the crown knocked off, lightning, falling sparks
  () =>
    `<path d="M14,194 Q40,170 70,176 Q100,170 126,194 Z" fill="${C.violetDeep}"/>` +
    `<rect x="52" y="86" width="36" height="92" fill="${C.steelDeep}" stroke="${g}" stroke-width="1.2"/>` +
    `<rect x="62" y="104" width="7" height="11" fill="${g}"/><rect x="72" y="126" width="7" height="11" fill="${g}"/><rect x="62" y="148" width="7" height="11" fill="${g}"/>` +
    `<path d="M76,74 L102,64 L106,74 L100,72 L94,80 L88,72 L80,82 Z" fill="${g}" transform="rotate(24 92 72)"/>` +
    `<polygon points="34,44 62,72 52,75 86,106 54,82 64,79 44,44" fill="${ink}" stroke="${g}" stroke-width="0.8"/>` +
    [[36, 98], [104, 112], [30, 134], [112, 146], [40, 164]].map(([x, y]) => `<path d="M${x},${y} q-3,6 0,8 q3,-2 0,-8 Z" fill="${C.red}"/>`).join(''),
  // XVII The Star: one great eight-pointed star, seven small ones, a pool
  () =>
    `<circle cx="70" cy="94" r="32" fill="url(#glow)"/>` +
    `<polygon points="${star(70, 94, 30, 8, 0.38)}" fill="${g}"/>` +
    [[26, 60], [114, 60], [22, 104], [118, 104], [34, 140], [106, 140], [70, 46]].map(([x, y]) => `<polygon points="${star(x, y, 7, 8, 0.4)}" fill="${ink}"/>`).join('') +
    `<path d="M14,170 Q42,160 70,170 T126,170 L126,194 L14,194 Z" fill="${C.water}" opacity="0.8"/>` +
    `<path d="M24,180 q10,-5 20,0 M80,184 q10,-5 20,0" stroke="${ink}" stroke-width="1.2" fill="none" opacity="0.7"/>`,
  // XVIII The Moon: a moon with a face in profile, two towers, a path winding out of the water
  () =>
    `<circle cx="70" cy="78" r="26" fill="${C.rose}"/>` + rays(70, 78, 29, 36, 16, g, 1.2, 0.8) +
    `<path d="M78,58 A24,24 0 1 1 78,98 A18,18 0 1 0 78,58 Z" fill="${C.violetDeep}" opacity="0.55"/>` +
    `<path d="M14,194 L14,120 L22,112 L30,120 L30,194 Z M126,194 L126,120 L118,112 L110,120 L110,194 Z" fill="${C.steelDeep}"/>` +
    `<path d="M70,176 Q56,160 72,146 Q86,132 70,118" fill="none" stroke="${g}" stroke-width="2.4" stroke-dasharray="4 3"/>` +
    `<path d="M14,180 Q42,172 70,180 T126,180 L126,194 L14,194 Z" fill="${C.water}" opacity="0.8"/>` +
    [[52, 112], [88, 112], [60, 128], [80, 128]].map(([x, y]) => `<path d="M${x},${y} q-3,6 0,8 q3,-2 0,-8 Z" fill="${g}"/>`).join(''),
  // XIX The Sun: a sun with a face, straight and wavy rays, sunflowers over a wall
  () =>
    `<circle cx="70" cy="96" r="30" fill="${g}"/>` +
    rays(70, 96, 34, 48, 12, g, 3) + rays(70, 96, 34, 42, 12, C.red, 2, 0.9, 15) +
    `<circle cx="61" cy="92" r="2.6" fill="${C.goldDeep}"/><circle cx="79" cy="92" r="2.6" fill="${C.goldDeep}"/><path d="M60,104 Q70,112 80,104" fill="none" stroke="${C.goldDeep}" stroke-width="2"/>` +
    `<rect x="14" y="170" width="112" height="24" fill="${C.steelDeep}"/>` +
    [0, 1, 2, 3, 4, 5].map((i) => `<line x1="${14 + i * 22}" y1="170" x2="${14 + i * 22}" y2="194" stroke="${C.shadow}" stroke-width="1"/>`).join('') +
    [32, 70, 108].map((x) => `<line x1="${x}" y1="170" x2="${x}" y2="156" stroke="${C.leaf}" stroke-width="2"/><polygon points="${star(x, 152, 8, 10, 0.55)}" fill="${g}"/><circle cx="${x}" cy="152" r="3.6" fill="${C.wood}"/>`).join(''),
  // XX Judgement: a trumpet with a banner from a cloud, people rising with arms up
  () =>
    `<path d="M30,76 Q30,58 48,60 Q56,46 72,54 Q88,44 98,58 Q114,56 112,74 Z" fill="${C.ink}" opacity="0.9"/>` +
    `<path d="M58,72 L96,128 L104,124 L66,68 Z" fill="${g}"/><path d="M96,128 L92,140 L110,130 Z" fill="${g}"/>` +
    `<path d="M74,92 L96,78 L104,96 L82,110 Z" fill="${ink}" stroke="${g}" stroke-width="1"/><line x1="85" y1="85" x2="93" y2="103" stroke="${C.red}" stroke-width="2.2"/><line x1="79" y1="98" x2="99" y2="90" stroke="${C.red}" stroke-width="2.2"/>` +
    [30, 60, 92].map((x) => `<rect x="${x - 12}" y="178" width="24" height="12" fill="${C.steelDeep}"/>` + person(x, 168, 0.9) + `<path d="M${x - 4},158 L${x - 11},146 M${x + 4},158 L${x + 11},146" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`).join(''),
  // XXI The World: a laurel wreath tied with ribbons, a dancer inside, the four corners
  () =>
    `<ellipse cx="70" cy="118" rx="34" ry="52" fill="none" stroke="${C.leaf}" stroke-width="5"/>` +
    [...Array(18)].map((_, i) => { const a = (Math.PI * 2 * i) / 18; const x = 70 + 34 * Math.cos(a); const y = 118 + 52 * Math.sin(a); return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="4.4" ry="2" transform="rotate(${f((a * 180) / Math.PI + 60)} ${f(x)} ${f(y)})" fill="${C.leaf}"/>`; }).join('') +
    `<path d="M62,64 Q70,74 78,64 M62,172 Q70,162 78,172" fill="none" stroke="${C.red}" stroke-width="3"/>` +
    `<circle cx="70" cy="100" r="6" fill="${ink}"/><path d="M70,106 L62,138 L78,138 Z" fill="${C.violet}"/><path d="M70,110 L56,98 M70,110 L84,98 M66,138 L60,150 M74,138 L76,152" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>` +
    [[22, 54], [118, 54], [22, 182], [118, 182]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="8" fill="${[C.ink, C.gold, C.wood, '#c9822f'][i]}"/>`).join('')
];

// ---- the card ----
function defs(accent) {
  return (
    `<defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${C.dusk}"/><stop offset="1" stop-color="${C.night}"/></linearGradient>` +
    `<radialGradient id="glow"><stop offset="0" stop-color="${C.gold}" stop-opacity="0.45"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="10" fill="url(#bg)" stroke="${C.gold}" stroke-width="2.5"/>` +
    `<rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="6" fill="none" stroke="${accent}" stroke-width="1" opacity="0.6"/>`
  );
}
function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>\n`;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function face(card) {
  const suit = card.suit;
  const accent = SUIT[suit].accent;
  const n = Number(card.id.split('-')[1]);
  let art;
  if (suit === 'major') art = MAJOR[n]();
  else if (n === 1) art = aceCard(suit);
  else if (n <= 10) art = pipCard(suit, n);
  else art = courtCard(suit, n);
  const label = suit === 'major' ? (n === 0 ? '0' : card.chip) : card.chip;
  const nameSize = card.name.length > 15 ? 10.5 : card.name.length > 12 ? 11.5 : 13;
  return svg(
    defs(accent) +
    `<text x="${CX}" y="31" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${label.length > 4 ? 13 : 17}" fill="${C.gold}" letter-spacing="1">${esc(label)}</text>` +
    `<line x1="40" y1="39" x2="100" y2="39" stroke="${accent}" stroke-width="0.8" opacity="0.7"/>` +
    art +
    `<path d="M14,200 L126,200 L120,211 L126,222 L14,222 L20,211 Z" fill="${C.shadow}" stroke="${accent}" stroke-width="0.8" opacity="0.95"/>` +
    `<text x="${CX}" y="215" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${nameSize}" fill="${C.ink}">${esc(card.name)}</text>`
  );
}
function back() {
  let s = defs(C.violet);
  s += `<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="4" fill="none" stroke="${C.gold}" stroke-width="0.8" opacity="0.5"/>`;
  s += `<circle cx="${CX}" cy="${H / 2}" r="40" fill="url(#glow)"/>`;
  s += `<polygon points="${star(CX, H / 2, 30, 8, 0.38)}" fill="${C.gold}"/>`;
  s += `<circle cx="${CX}" cy="${H / 2}" r="44" fill="none" stroke="${C.gold}" stroke-width="1"/>`;
  for (const [x, y] of [[CX, 44], [CX, H - 44], [34, H / 2], [W - 34, H / 2]]) s += `<polygon points="${star(x, y, 6, 8, 0.4)}" fill="${C.ink}"/>`;
  return svg(s);
}

mkdirSync(out, { recursive: true });
for (const card of cards) writeFileSync(join(out, `${card.id}.svg`), face(card));
writeFileSync(join(out, 'back.svg'), back());
console.log(`wrote ${cards.length + 1} files to ${out}`);
