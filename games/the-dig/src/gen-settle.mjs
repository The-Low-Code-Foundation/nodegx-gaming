// The settlement engine (DIG-006): how their places are built, and how they fell apart. The same for everyone and
// deterministic, like the caves: a district (its id, its style, how big, how ruined, where it sits) always gives the
// same rooms, the same rubble and the same whole pockets. The texts are not here: a district file carries them, and
// the engine only says WHERE things can be read (the anchors). Node imports this module cleanly, so a settlement can
// be measured and pictured without a browser.
//
// A settlement is a graph of spaces (halls, homes, stores, cisterns, gardens, a library, a shrine, workshops, a refuge,
// stairs down to another level, vents up) joined by passages, laid out once from the district's own random stream.
// Each piece is then built into a grid in its own box, the way the ship is: block ids for every cell it decides, in
// three phases (0: walls, floors and foundations; 1: what is inside, air first; 2: things built standing inside, like
// the houses in a cavern town), with the collapse already applied. A chunk copies the share of every piece that
// overlaps it, phase by phase, so two chunks always agree on a piece that crosses the border between them.
import { B } from './blocks.mjs';
import { rng, hashString } from './noise.mjs';

// Districts are kept at least this far apart (the placer's grid; DIG-008 lands one per slot at most).
export const SLOT = 192;

const KEEP = 0;
const AIR = 255; // in a grid: make it air (B.AIR is 0, which a grid uses for "leave it")

// A material in a style (districts/styles.json) → the block it is built from.
export function materialBlock(m) {
  return {
    stone: B.STONE, deepstone: B.DEEP, sandstone: B.SANDSTONE, gravel: B.GRAVEL, rubble: B.RUBBLE, pillar: B.PILLAR,
    'worked-floor': B.FLOOR, rune: B.RUNE, crystal: B.CRYSTAL, glowmoss: B.GLOWMOSS, ice: B.ICE, water: B.WATER,
    carved: B.CARVED, 'carved-cracked': B.CARVED_CRACKED, 'carved-dark': B.CARVED_DARK, mosaic: B.MOSAIC,
    mural: B.CARVED_DARK, frieze: B.FRIEZE, tile: B.TILE, 'tablet-shelf': B.TABLETS, 'crystal-lantern': B.LANTERN,
    banner: B.BANNER, statue: B.STATUE, 'stone-door': B.STONE_DOOR, channel: B.WATER, 'lamp-niche': B.LAMP_NICHE
  }[m] ?? B.CARVED;
}

const SIZES = {
  few: { n: [3, 5], r: 24, levels: 1 },
  village: { n: [8, 13], r: 44, levels: 2 },
  town: { n: [18, 28], r: 64, levels: 3 }
};
// Each kind of space, as fractions of the style's room width and height: across (w), along (d), and high (h).
const SHAPE = {
  hall: { w: [0.8, 1], d: [1, 1.5], h: [0.85, 1] },
  home: { w: [0.35, 0.5], d: [0.35, 0.55], h: [0.45, 0.6] },
  store: { w: [0.3, 0.4], d: [0.3, 0.45], h: [0.4, 0.5] },
  cistern: { w: [0.45, 0.65], d: [0.5, 0.75], h: [0.6, 0.8] },
  garden: { w: [0.75, 1], d: [0.8, 1.2], h: [0.8, 1] },
  library: { w: [0.45, 0.6], d: [1.1, 1.5], h: [0.7, 0.9] },
  shrine: { w: [0.5, 0.7], d: [0.6, 0.9], h: [0.8, 1] },
  workshop: { w: [0.4, 0.55], d: [0.45, 0.65], h: [0.5, 0.65] },
  refuge: { w: [0.35, 0.5], d: [0.35, 0.5], h: [0.5, 0.6] }
};
// The space at a settlement's heart, by its setting.
const HEART = { 'rock-cut': 'hall', cavern: 'cavern', water: 'garden', crystal: 'shrine', archive: 'library' };
// Kinds worth keeping whole when the collapse is shared out: the ones with something to look at.
const SHOWY = { hall: 3, shrine: 3, library: 3, garden: 3, cavern: 2, home: 1, cistern: 1, workshop: 1, refuge: 2, store: 0.5 };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// The block each kind of anchor is carved on.
const READABLE = { lintel: 'INSCRIBED', tablet: 'TABLETS', note: 'TABLETS', song: 'INSCRIBED', mural: 'INSCRIBED', statue: 'INSCRIBED' };
for (const k in READABLE) READABLE[k] = B[READABLE[k]];

export function settlementEngine(seed, hooks) {
  const { open, height } = hooks;
  const RESERVED = ['lair', 'vault'];
  const all = [];

  // ── the layout ─────────────────────────────────────────────────────────────────────────────────────────────────
  function layout(d) {
    const st = d.style;
    const R = rng(hashString(`${seed}:${d.id}`));
    const rnd = (a, b) => a + R() * (b - a);
    const int = (a, b) => Math.floor(rnd(a, b + 1));
    const pick = (weights) => {
      const ks = Object.keys(weights).filter((k) => weights[k] > 0);
      let t = R() * ks.reduce((s, k) => s + weights[k], 0);
      for (const k of ks) if ((t -= weights[k]) <= 0) return k;
      return ks[ks.length - 1];
    };
    const P = st.proportions;
    const size = SIZES[d.size] || SIZES.village;
    const want = int(size.n[0], size.n[1]);
    const levelH = P.roomHeight[1] + 5;
    const pw = Math.max(1, Math.min(P.passageWidth[1], int(P.passageWidth[0], P.passageWidth[1])));
    const { x: ax, y: ay, z: az } = d.at;
    const spaces = [], passages = [];
    const grow = (box, m) => [box[0] - m, box[1] - m, box[2] - m, box[3] + m, box[4] + m, box[5] + m];
    const meet = (a, b) => !(a[3] < b[0] || a[0] > b[3] || a[4] < b[1] || a[1] > b[4] || a[5] < b[2] || a[2] > b[5]);
    const dims = (kind) => {
      const s = SHAPE[kind];
      const W = rnd(P.roomWidth[0], P.roomWidth[1]);
      const H = rnd(P.roomHeight[0], P.roomHeight[1]);
      return {
        w: Math.max(3, Math.round(W * rnd(s.w[0], s.w[1]))),
        d: Math.max(3, Math.round(W * rnd(s.d[0], s.d[1]))),
        h: Math.max(3, Math.round(H * rnd(s.h[0], s.h[1])))
      };
    };
    const ceilingFor = (kind) => (kind === 'cavern' ? 'dome' : kind === 'store' || kind === 'workshop' ? 'flat' : P.ceiling);

    // The heart.
    {
      const kind = HEART[st.setting] || 'hall';
      let w, dd, h;
      if (kind === 'cavern') {
        w = Math.round(Math.max(28, Math.min(48, P.roomWidth[1] * 2.6)) * (d.size === 'few' ? 0.7 : 1));
        dd = Math.round(w * rnd(1, 1.25));
        h = Math.round(Math.min(28, Math.max(18, P.roomHeight[1] * 2.2)));
      } else ({ w, d: dd, h } = dims(kind));
      if (kind !== 'cavern') {
        w = Math.round(w * 1.2);
        dd = Math.round(dd * 1.2);
      }
      const x0 = ax - (w >> 1), z0 = az - (dd >> 1);
      spaces.push({ i: 0, kind, level: 0, box: [x0, ay, z0, x0 + w - 1, ay + h - 1, z0 + dd - 1], ceiling: ceilingFor(kind), parent: -1 });
    }

    // Grow outwards: a space off a side of one already there, joined by a straight passage; now and then a stair
    // down to the next level, whose foot the next spaces can grow from.
    const fits = (box, except) => {
      const g = grow(box, 2);
      if (Math.hypot((box[0] + box[3]) / 2 - ax, (box[2] + box[5]) / 2 - az) > size.r) return false;
      for (const s of spaces) if (!except.includes(s.i) && meet(g, grow(s.box, 1))) return false;
      for (const p of passages) if (meet(grow(box, 1), p.box)) return false;
      return true;
    };
    for (let tries = 0; spaces.length < want && tries < want * 40; tries++) {
      // Grow mostly from the newer spaces, so the plan spreads rather than piling round the heart.
      const from = spaces[Math.min(spaces.length - 1, Math.floor(spaces.length * Math.sqrt(R())))];
      if (from.kind === 'vent') continue;
      const fy = from.kind === 'stair' ? from.foot : from.box[1];
      const level = from.kind === 'stair' ? from.level + 1 : from.level;
      const [dx, dz] = DIRS[int(0, 3)];
      const weights = { ...st.spaces };
      if (level >= size.levels - 1 || spaces.some((s) => s.kind === 'stair' && s.parent === from.i)) delete weights.stair;
      if (from.kind === 'stair') delete weights.stair;
      if (spaces.filter((s) => s.kind === 'vent').length >= 1 + (spaces.length >> 3)) delete weights.vent;
      if (!Object.keys(weights).length) continue;
      const kind = pick(weights);
      if (kind === 'vent') {
        // A shaft up from the ceiling of a room, for air; it stops well under the ground.
        if (from.kind === 'stair') continue;
        const [x0, , z0, x1, y1, z1] = from.box;
        const vx = int(x0 + 1, x1 - 2), vz = int(z0 + 1, z1 - 2);
        const top = Math.min(y1 + int(10, 24), height(vx, vz) - 8);
        if (top < y1 + 4) continue;
        spaces.push({ i: spaces.length, kind, level, box: [vx, y1 + 1, vz, vx + 1, top, vz + 1], ceiling: 'flat', parent: from.i });
        continue;
      }
      const isStair = kind === 'stair';
      const dm = isStair ? { w: 5, d: 5, h: P.roomHeight[0] } : dims(kind);
      const L = int(0, st.setting === 'cavern' ? 2 : 5);
      // Where the passage leaves the parent, across its side (a block in from the corners).
      const fb = from.box;
      const along = dx !== 0 ? 0 : 2; // the axis the passage runs along: x (0) or z (2)
      const across = along === 0 ? 2 : 0;
      if (fb[across + 3] - 1 - (pw - 1) < fb[across] + 1) continue;
      const c = int(fb[across] + 1, fb[across + 3] - 1 - (pw - 1));
      dm.w = Math.max(dm.w, pw + 2);
      const face = dx + dz > 0 ? fb[along + 3] : fb[along];
      const sign = dx + dz;
      const start = face + sign * (L + 3); // the child's first interior cell along the axis
      const off = int(1, Math.max(1, dm.w - 1 - pw)); // where the passage meets it, across
      const b = [0, 0, 0, 0, 0, 0];
      b[along] = sign > 0 ? start : start - dm.d + 1;
      b[along + 3] = b[along] + dm.d - 1;
      b[across] = c - off;
      b[across + 3] = b[across] + dm.w - 1;
      if (isStair) {
        b[1] = fy - levelH;
        b[4] = fy + dm.h - 1;
      } else {
        b[1] = fy;
        b[4] = fy + dm.h - 1;
      }
      const ph = Math.max(3, Math.min(4, dm.h, from.box[4] - fy + 1));
      const pb = [0, fy, 0, 0, fy + ph - 1, 0];
      pb[along] = Math.min(face + sign, start - sign);
      pb[along + 3] = Math.max(face + sign, start - sign);
      pb[across] = c;
      pb[across + 3] = c + pw - 1;
      if (!fits(b, [from.i])) continue;
      const s = { i: spaces.length, kind, level, box: b, ceiling: isStair ? 'flat' : ceilingFor(kind), parent: from.i };
      if (isStair) {
        s.foot = fy - levelH;
        s.top = fy;
      }
      spaces.push(s);
      passages.push({ i: passages.length, from: from.i, to: s.i, box: pb, along, sign, level });
    }

    // Which spaces stay whole: a few per settlement, the showy ones first. The rest fall in, by the district's ruin.
    const ruin = Math.max(0, Math.min(1, d.ruin ?? 0.6));
    const rooms = spaces.filter((s) => s.kind !== 'vent' && s.kind !== 'stair');
    const nWhole = Math.max(1, Math.round(rooms.length * (0.4 - 0.3 * ruin)));
    const ranked = rooms.map((s) => ({ s, k: (SHOWY[s.kind] ?? 1) * (0.5 + R()) })).sort((a, b) => b.k - a.k);
    ranked.forEach(({ s }, n) => (s.whole = n < nWhole));
    for (const s of spaces) s.harm = s.whole ? 0 : Math.max(0.1, Math.min(1, ruin + (R() - 0.5) * 0.5));
    // As built, before anything fell (for pictures and checks): every space whole.
    if (d.collapse === false) for (const s of spaces) [s.whole, s.harm] = [true, 0];
    for (const p of passages) {
      const a = spaces[p.from], b = spaces[p.to];
      p.whole = a.whole && b.whole;
      p.harm = p.whole ? 0 : Math.max(a.harm, b.harm) * (0.6 + R() * 0.4);
    }
    // A refuge's door is a stone door, rolled across from inside (it rolls aside when you push it).
    for (const p of passages) if (spaces[p.to].kind === 'refuge' || (P.doorway === 'stone-door' && R() < 0.25)) p.door = true;
    return { spaces, passages, R, ruin };
  }

  // ── building a piece into its grid ─────────────────────────────────────────────────────────────────────────────
  // grid: Uint16Array over the piece's box, value = block | phase << 8 (0 = leave the cell as it is).
  function makeGrid(box) {
    const [x0, y0, z0, x1, y1, z1] = box;
    const W = x1 - x0 + 1, H = y1 - y0 + 1, D = z1 - z0 + 1;
    const g = new Uint16Array(W * H * D);
    const idx = (x, y, z) => (x < x0 || y < y0 || z < z0 || x > x1 || y > y1 || z > z1 ? -1 : (x - x0) + (z - z0) * W + (y - y0) * W * D);
    return {
      box, g,
      set(x, y, z, id, phase = 0) {
        const i = idx(x, y, z);
        if (i >= 0) g[i] = (id === 0 ? AIR : id) | (phase << 8);
      },
      get(x, y, z) {
        const i = idx(x, y, z);
        return i < 0 ? 0 : g[i];
      }
    };
  }
  // Is a cell inside the space's open volume (its ceiling shaped as the style says)?
  function insideOf(s) {
    const [x0, y0, z0, x1, y1, z1] = s.box;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, hx = (x1 - x0) / 2 + 0.5, hz = (z1 - z0) / 2 + 0.5;
    const H = y1 - y0 + 1;
    const long = x1 - x0 >= z1 - z0 ? 'x' : 'z';
    return (x, y, z) => {
      if (x < x0 || x > x1 || z < z0 || z > z1 || y < y0 || y > y1) return false;
      if (s.ceiling === 'flat' || H < 4) return true;
      const u = long === 'x' ? Math.abs(z - mz) / hz : Math.abs(x - mx) / hx; // across the short way, 0 at the middle
      let drop = 0;
      if (s.ceiling === 'vault') drop = Math.round(u * u * Math.min(3, H >> 1));
      else if (s.ceiling === 'dome') drop = Math.round(Math.min(1, Math.hypot((x - mx) / hx, (z - mz) / hz)) ** 2 * Math.min(8, H >> 1));
      else if (s.ceiling === 'stepped') drop = Math.min(H >> 1, Math.floor((u * Math.min(hx, hz)) / 2));
      return y <= y1 - drop;
    };
  }

  function build(S, s) {
    const st = S.d.style, pal = st.palette, mats = S.mats;
    const R = rng(hashString(`${seed}:${S.d.id}:space:${s.i}`));
    const inside = insideOf(s);
    const [x0, y0, z0, x1, y1, z1] = s.box;
    const UP = s.kind === 'vent' ? 1 : 5; // room above for a fallen roof (under the level above: levels are 5 apart)
    const G = makeGrid([x0 - 1, y0 - 3, z0 - 1, x1 + 1, y1 + UP, z1 + 1]);
    const decor = new Set(st.decor || []);
    const cx = (x0 + x1) >> 1, cz = (z0 + z1) >> 1;
    const long = x1 - x0 >= z1 - z0 ? 'x' : 'z';
    const harm = s.harm;
    const shellAt = (x, y, z) => {
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy, z + dz)) return true;
      return false;
    };
    // The roof's falls: each a mound of rubble on the floor and a ragged hole up into the rock above it.
    const falls = [];
    if (!s.whole && s.kind !== 'vent' && s.kind !== 'stair') {
      const area = (x1 - x0 + 1) * (z1 - z0 + 1);
      const n = Math.round(harm * (0.4 + area / 60) * (0.6 + R()));
      for (let k = 0; k < n; k++) falls.push({ x: x0 + R() * (x1 - x0), z: z0 + R() * (z1 - z0), r: 2 + R() * (2 + harm * 4) });
    }
    const fallAt = (x, z) => {
      let best = 0;
      for (const f of falls) best = Math.max(best, 1 - Math.hypot(x - f.x, z - f.z) / f.r);
      return best; // 0 outside every fall, up to 1 at a centre
    };
    const gravel = !s.whole && s.kind !== 'stair' && R() < harm * 0.35 ? { dir: R() < 0.5 ? 1 : -1, top: 1 + R() * (y1 - y0) * 0.7 } : null;
    const crack = !s.whole && s.kind !== 'stair' && s.kind !== 'vent' && R() < harm * 0.3 && Math.min(x1 - x0, z1 - z0) >= 5 ? { at: long === 'x' ? int(R, x0 + 2, x1 - 2) : int(R, z0 + 2, z1 - 2), w: 1 + (R() < 0.4 ? 1 : 0) } : null;
    const slope = (x, z) => {
      const f = (long === 'x' ? x - x0 : z - z0) / Math.max(1, long === 'x' ? x1 - x0 : z1 - z0);
      return gravel.dir > 0 ? f : 1 - f;
    };
    const inCrack = (x, z) => crack && Math.abs((long === 'x' ? x : z) - crack.at) < crack.w;
    const wall = mats.wall, floor = mats.floor, trim = mats.trim, light = mats.light;
    const lightEvery = s.whole ? 5 : 9;

    // Walls, floor and ceiling (phase 0): dressed stone round the open volume, cracked or gone where it fell.
    for (let y = y0 - 1; y <= y1 + 1; y++)
      for (let z = z0 - 1; z <= z1 + 1; z++)
        for (let x = x0 - 1; x <= x1 + 1; x++) {
          if (inside(x, y, z) || !shellAt(x, y, z)) continue;
          if (s.kind === 'vent' && y < y0) continue; // a vent opens into the room under it
          const isFloor = y < y0 || (!inside(x, y - 1, z) && inside(x, y + 1, z));
          const isCeil = !isFloor && y > y0 && inside(x, y - 1, z) && !inside(x, y + 1, z);
          const fa = fallAt(x, z);
          if (isCeil && fa > 0) continue; // the roof came down here: rock, left as it is
          let id = isFloor ? floor : wall;
          const h = R();
          if (!isFloor && !isCeil && y === y0 + Math.min(3, y1 - y0) && s.whole && decor.has('frieze') && s.kind !== 'store' && s.kind !== 'vent') id = B.FRIEZE;
          if (!isFloor && !isCeil && (y === y0 - 1 || y === y1 + 1)) id = trim;
          if (!isFloor && !isCeil && y === y0 + 2 && s.kind !== 'vent' && s.kind !== 'stair' && (mod(x + z, lightEvery) === 0) && !(harm > 0 && h < harm * 0.6)) id = light;
          if (s.kind === 'library' && !isFloor && !isCeil && y >= y0 && y <= Math.min(y1 - 1, y0 + 3) && decor.has('tablet-shelf') && mod(x + z, 3) !== 0) id = B.TABLETS;
          if (isFloor && s.whole && decor.has('mosaic') && (s.kind === 'hall' || s.kind === 'shrine' || s.kind === 'cavern') && Math.abs(x - cx) <= (x1 - x0) / 4 && Math.abs(z - cz) <= (z1 - z0) / 4) id = B.MOSAIC;
          if (isFloor && s.kind === 'home' && decor.has('tile')) id = B.TILE;
          if (harm > 0 && id !== floor && h < 0.12 + harm * 0.45) id = mats.cracked;
          if (harm > 0 && isFloor && h < harm * 0.25) id = mats.cracked;
          G.set(x, y, z, id, 0);
        }
    // Under the floor, down to the rock: foundations (phase 0), so nothing stands on air.
    if (s.kind !== 'vent') S.foundations.push(...footings(s.box, floor));

    // What is inside (phase 1): air, then rubble where the roof fell, a slope of gravel, a split in the floor, water.
    const pool = s.kind === 'cistern' || (s.kind === 'garden' && decor.has('pool')) || (s.kind === 'garden' && st.setting === 'water');
    const terraces = s.kind === 'cavern';
    const rx = (x1 - x0) / 2 + 0.5, rz = (z1 - z0) / 2 + 0.5;
    // A cavern town climbs in three rings of terraces, two blocks each, from a floor in the middle to its walls.
    const terraceH = (x, z) => Math.max(0, Math.min(3, Math.floor(Math.hypot((x - cx) / rx, (z - cz) / rz) * 3.2)) - 1) * 2;
    for (let y = y0; y <= y1 + UP; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const fa = fallAt(x, z);
          const inRoom = inside(x, y, z);
          // The hole the roof left: a ragged dome up into the rock over a fall.
          const hole = !inRoom && fa > 0 && y > y1 - 2 && y <= y1 + Math.round(fa * (UP - 1) * (0.5 + 0.5 * R()));
          if (!inRoom && !hole) continue;
          let id = AIR;
          const up = y - y0;
          if (fa > 0 && up < Math.round(fa * (2 + harm * 4))) id = R() < 0.18 ? mats.cracked : R() < 0.15 ? B.GRAVEL : B.RUBBLE;
          else if (gravel && up < gravel.top * slope(x, z)) id = B.GRAVEL;
          else if (pool && up < (s.kind === 'cistern' ? 2 : 1) && Math.abs(x - cx) < rx - 1.5 && Math.abs(z - cz) < rz - 1.5) id = B.WATER;
          else if (terraces && up < terraceH(x, z)) id = up === terraceH(x, z) - 1 ? floor : wall;
          G.set(x, y, z, id, 1);
        }
    if (crack)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) if (inCrack(x, z)) for (let y = y0 - 3; y < y0; y++) G.set(x, y, z, AIR, 1);

    // Standing inside (phase 2): pillars, a statue, a stair, a cavern town's houses.
    if (s.kind === 'stair') spiral(G, s, floor, wall);
    const every = st.proportions.pillarEvery;
    if (every > 0 && (s.kind === 'hall' || s.kind === 'library' || s.kind === 'garden' || s.kind === 'shrine') && Math.min(x1 - x0, z1 - z0) >= 6) {
      const inset = 2;
      for (let a = (long === 'x' ? x0 : z0) + inset; a <= (long === 'x' ? x1 : z1) - inset; a += every)
        for (const b of long === 'x' ? [z0 + inset, z1 - inset] : [x0 + inset, x1 - inset]) {
          const [x, z] = long === 'x' ? [a, b] : [b, a];
          // A broken pillar: snapped at some height, the top in pieces round its foot.
          const snap = harm > 0 && R() < 0.3 + harm * 0.5 ? Math.floor(R() * (y1 - y0) * 0.6) : Infinity;
          for (let y = y0; y <= y1; y++) {
            if (!inside(x, y, z)) break;
            if (y - y0 > snap) break;
            G.set(x, y, z, B.PILLAR, 2);
          }
          if (snap !== Infinity) for (const [ddx, ddz] of DIRS) if (R() < 0.6) G.set(x + ddx, y0, z + ddz, B.RUBBLE, 2);
        }
    }
    if (s.whole && decor.has('statue') && (s.kind === 'shrine' || s.kind === 'hall' || s.kind === 'garden')) {
      // At the end away from the way in.
      const p = S.passages.find((q) => q.to === s.i);
      const far = p ? p.sign : 1;
      const ax = p && p.along === 0 ? (far > 0 ? x1 - 1 : x0 + 1) : cx;
      const az = p && p.along === 2 ? (far > 0 ? z1 - 1 : z0 + 1) : cz;
      G.set(ax, y0 + 1, az, B.STATUE, 2);
      G.set(ax, y0 + 2, az, B.STATUE, 2);
      if (y1 - y0 >= 4) G.set(ax, y0 + 3, az, B.STATUE, 2);
      G.set(ax, y0, az, B.INSCRIBED, 2);
      S.anchors.push({ kind: 'statue', at: [ax, y0, az], space: s.i });
    }
    if (s.whole && decor.has('crystal-lantern') && s.kind !== 'stair' && s.kind !== 'vent') {
      // Lanterns standing on the floor in the corners.
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) if (inside(x, y0, z)) G.set(x, y0, z, B.LANTERN, 2);
    }
    if (s.whole && decor.has('banner') && (s.kind === 'hall' || s.kind === 'shrine'))
      for (let a = (long === 'x' ? x0 : z0) + 2; a <= (long === 'x' ? x1 : z1) - 2; a += 4)
        for (const b of long === 'x' ? [z0, z1] : [x0, x1]) {
          const [x, z] = long === 'x' ? [a, b] : [b, a];
          if (inside(x, y0 + 3, z) && y1 - y0 >= 5) G.set(x, y0 + 3, z, B.BANNER, 2);
        }
    if (terraces) houses(S, s, G, rng(hashString(`${seed}:${S.d.id}:houses:${s.i}`)), inside, terraceH);

    // Where things can be read (the district's texts are fitted to these by kind).
    const mark = (kind, x, y, z, id, phase) => {
      G.set(x, y, z, id, phase);
      S.anchors.push({ kind, at: [x, y, z], space: s.i });
    };
    if (s.kind === 'library') {
      mark('tablet', cx, y0, z0 - 1, B.TABLETS, 0);
      mark('tablet', cx, y0 + 1, z1 + 1, B.TABLETS, 0);
    }
    if (s.kind === 'home') mark('note', x0, y0, z0, B.TABLETS, 2);
    if (s.kind === 'garden' || s.kind === 'hall' || s.kind === 'cavern') mark('song', cx, y0 + 1, z1 + 1, B.INSCRIBED, 0);
    if (s.whole && decor.has('mural') && (s.kind === 'hall' || s.kind === 'shrine') && x1 - x0 >= 5) {
      for (let dy = 1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) G.set(cx + dx, y0 + dy, z0 - 1, B.MURAL, 0);
      mark('mural', cx, y0, z0 - 1, B.INSCRIBED, 0); // its caption, under it
    }
    return G;
  }
  const int = (R, a, b) => Math.floor(a + R() * (b - a + 1));
  const mod = (a, n) => ((a % n) + n) % n;

  // A spiral stair: a 3 × 3 core, and steps a block apart round the ring outside it, from the level below (the foot)
  // up to the level above, where a landing runs round the ring with an opening over the last steps for head room.
  function spiral(G, s, floor, wall) {
    const [x0, , z0, , y1] = s.box;
    const ring = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4], [0, 3], [0, 2], [0, 1]];
    for (let y = s.foot; y <= y1; y++) for (let a = 1; a <= 3; a++) for (let b = 1; b <= 3; b++) G.set(x0 + a, y, z0 + b, wall, 2);
    const rise = s.top - s.foot; // the upper level's floor stands on blocks at s.top - 1
    for (let n = 0; n < rise; n++) {
      const [a, b] = ring[n % 16];
      G.set(x0 + a, s.foot + n, z0 + b, floor, 2);
    }
    const open = new Set([1, 2, 3].map((k) => (rise - 1 - k + 1600) % 16));
    ring.forEach(([a, b], k) => {
      if (k === (rise - 1) % 16 || open.has(k)) return;
      G.set(x0 + a, s.top - 1, z0 + b, floor, 2);
    });
  }

  // A cavern town's houses: small boxes standing on its terraces (on a plinth up to the highest ground under them),
  // each with a doorway and a flat roof; in a ruined town most have lost some of their roof and walls.
  function houses(S, s, G, R, inside, terraceH) {
    const [x0, y0, z0, x1, , z1] = s.box;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rx = (x1 - x0) / 2 + 0.5, rz = (z1 - z0) / 2 + 0.5;
    const n = 8 + Math.floor(R() * 10);
    const taken = [];
    const mats = S.mats;
    const Rd = rng(hashString(`${seed}:${S.d.id}:houses-fall:${s.i}`)); // the damage, apart from where they stand
    for (let k = 0, tries = 0; k < n && tries < n * 10; tries++) {
      const a = R() * Math.PI * 2, r = 0.08 + R() * 0.62;
      const hx = Math.round(cx + Math.cos(a) * rx * r), hz = Math.round(cz + Math.sin(a) * rz * r);
      const w = 3 + Math.floor(R() * 3), d = 3 + Math.floor(R() * 3), h = 3 + Math.floor(R() * 2);
      const box = [hx - 1, 0, hz - 1, hx + w, 0, hz + d];
      if (taken.some((t) => !(box[3] + 2 < t[0] || box[0] - 2 > t[3] || box[5] + 2 < t[2] || box[2] - 2 > t[5]))) continue;
      let top = 0;
      for (let z = box[2]; z <= box[5]; z++) for (let x = box[0]; x <= box[3]; x++) top = Math.max(top, terraceH(x, z));
      const fy = y0 + top;
      let ok = true;
      for (const [x, z] of [[box[0], box[2]], [box[3], box[2]], [box[0], box[5]], [box[3], box[5]]]) if (!inside(x, fy + h, z) || !inside(x, y0, z)) ok = false;
      if (!ok) continue;
      taken.push(box);
      k++;
      // The plinth, up to the house's floor.
      for (let z = box[2]; z <= box[5]; z++) for (let x = box[0]; x <= box[3]; x++) for (let y = y0 + terraceH(x, z); y < fy; y++) G.set(x, y, z, y === fy - 1 ? mats.floor : mats.wall, 2);
      const door = Math.floor(R() * 4);
      const broken = !s.whole || Rd() < 0.35;
      // A broken house keeps its walls to some height round the edge and a few pieces of roof on the walls that
      // still stand full height; its middle roof is gone (nothing left hanging in the air).
      const wallTop = new Map();
      for (let z = box[2]; z <= box[5]; z++) for (let x = box[0]; x <= box[3]; x++) wallTop.set(`${x},${z}`, broken && Rd() < 0.4 ? fy + h - 2 : fy + h - 1);
      for (let y = fy; y <= fy + h; y++)
        for (let z = box[2]; z <= box[5]; z++)
          for (let x = box[0]; x <= box[3]; x++) {
            const edge = x === box[0] || x === box[3] || z === box[2] || z === box[5];
            const roof = y === fy + h;
            if (!edge && !roof) {
              G.set(x, y, z, AIR, 2);
              continue;
            }
            const midX = x === Math.round((box[0] + box[3]) / 2), midZ = z === Math.round((box[2] + box[5]) / 2);
            const isDoor = !roof && y < fy + 2 && ((door === 0 && x === box[3] && midZ) || (door === 1 && x === box[0] && midZ) || (door === 2 && z === box[5] && midX) || (door === 3 && z === box[2] && midX));
            if (isDoor) {
              G.set(x, y, z, AIR, 2);
              continue;
            }
            if (broken) {
              const top = wallTop.get(`${x},${z}`);
              if (roof ? !edge || top < fy + h - 1 || Rd() < 0.5 : y > top) {
                // Where the roof is gone, the fall that brought it down is gone too (nothing left on air).
                if (roof) for (let yy = fy + h; yy <= y0 + 8; yy++) G.set(x, yy, z, AIR, 2);
                continue;
              }
            }
            G.set(x, y, z, roof ? mats.trim : broken && Rd() < 0.3 ? mats.cracked : mats.wall, 2);
          }
      G.set(hx, fy, hz, B.TABLETS, 2);
      S.anchors.push({ kind: 'note', at: [hx, fy, hz], space: s.i });
    }
  }

  // The columns under a floor that stands over open cave: fill each down to the rock (at most 40 blocks).
  function footings(box, id) {
    const [x0, y0, z0, x1, , z1] = box;
    const out = [];
    for (let z = z0 - 1; z <= z1 + 1; z++)
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        let y = y0 - 2;
        while (y > y0 - 10 && open(x, y, z)) y--;
        if (open(x, y, z)) continue; // deeper than 8: the floor spans it, joined to the rest (no column down a ravine)
        if (y < y0 - 2) out.push({ x, z, y0: y + 1, y1: y0 - 2, id });
      }
    return out;
  }

  // A passage: dressed walls round a straight run, rubble where it fell in, a stone door where it meets a refuge.
  function buildPassage(S, p) {
    const R = rng(hashString(`${seed}:${S.d.id}:passage:${p.i}`));
    const [x0, y0, z0, x1, y1, z1] = p.box;
    const G = makeGrid([x0 - 1, y0 - 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1]);
    const mats = S.mats;
    for (let y = y0 - 1; y <= y1 + 1; y++)
      for (let z = z0 - 1; z <= z1 + 1; z++)
        for (let x = x0 - 1; x <= x1 + 1; x++) {
          const inX = x >= x0 && x <= x1, inZ = z >= z0 && z <= z1, inY = y >= y0 && y <= y1;
          if (inX && inY && inZ) continue;
          // Only the sides, floor and roof (the two open ends are where it meets its rooms).
          if (p.along === 0 ? !inX : !inZ) continue;
          const id = y < y0 ? mats.floor : p.harm > 0 && R() < 0.1 + p.harm * 0.4 ? mats.cracked : mats.wall;
          G.set(x, y, z, id, 0);
        }
    S.foundations.push(...footings(p.box, mats.floor));
    const len = (p.along === 0 ? x1 - x0 : z1 - z0) + 1;
    const plug = p.harm > 0 && R() < 0.2 + p.harm * 0.6 && len >= 2 ? { a: Math.floor(R() * (len - 1)), n: 1 + Math.floor(R() * Math.min(4, len - 1)) } : null;
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const t = p.along === 0 ? x - x0 : z - z0;
          let id = AIR;
          if (plug && t >= plug.a && t < plug.a + plug.n && y - y0 < (y1 - y0 + 1) * (0.7 + R() * 0.5)) id = B.RUBBLE;
          G.set(x, y, z, id, 1);
        }
    if (p.door) {
      // The door fills the passage's end against the refuge; beside it, a slot in the wall it rolls into.
      const t = p.sign > 0 ? (p.along === 0 ? x1 : z1) : p.along === 0 ? x0 : z0;
      const cells = [];
      for (let y = y0; y <= y1; y++)
        for (let c = p.along === 0 ? z0 : x0; c <= (p.along === 0 ? z1 : x1); c++) {
          const [x, z] = p.along === 0 ? [t, c] : [c, t];
          G.set(x, y, z, B.STONE_DOOR, 2);
          cells.push([x, y, z]);
        }
      const w = (p.along === 0 ? z1 - z0 : x1 - x0) + 1;
      const slot = [];
      for (let y = y0; y <= y1; y++)
        for (let k = 1; k <= w; k++) {
          const c = (p.along === 0 ? z1 : x1) + k;
          const [x, z] = p.along === 0 ? [t, c] : [c, t];
          slot.push([x, y, z]);
        }
      S.doors.push({ cells, slot, passage: p.i });
      // The slot is cut at build time (phase 1), so the door has somewhere to go.
      for (const [x, y, z] of slot) S.extra.push([x, y, z, AIR, 1]);
    }
    // A lintel over the doorway into the far room.
    const t = p.sign > 0 ? (p.along === 0 ? x1 : z1) : p.along === 0 ? x0 : z0;
    const mid = p.along === 0 ? (z0 + z1) >> 1 : (x0 + x1) >> 1;
    const [lx, lz] = p.along === 0 ? [t, mid] : [mid, t];
    G.set(lx, y1 + 1, lz, B.INSCRIBED, 0);
    S.anchors.push({ kind: 'lintel', at: [lx, y1 + 1, lz], space: p.to });
    return G;
  }

  // A road out: a long passage with a stepped slope, carved only through rock (where it crosses a cave it simply
  // opens into it), fallen in every twenty-odd blocks, and ending in a wall of rubble.
  function buildRoad(S, road, k) {
    const R = rng(hashString(`${seed}:${S.d.id}:road:${k}`));
    const mats = S.mats;
    const pts = [];
    let [x, y, z] = road.from;
    const [tx, ty, tz] = road.to;
    const xFirst = road.dx !== 0;
    const steps = [[x, y, z, xFirst ? 0 : 2]];
    const legs = xFirst ? [[0, tx], [2, tz]] : [[2, tz], [0, tx]];
    for (const [axis, target] of legs) {
      while ((axis === 0 ? x : z) !== target) {
        if (axis === 0) x += Math.sign(target - x);
        else z += Math.sign(target - z);
        // Down (or up) a block every other step until it reaches the far end's level.
        if (steps.length % 2 === 1 && y !== ty) y += Math.sign(ty - y);
        steps.push([x, y, z, axis]);
      }
    }
    const width = 3, high = 4;
    const cells = new Map();
    const add = (cx, cy, cz, id, phase) => {
      const key = `${cx},${cy},${cz}`;
      const old = cells.get(key);
      if (old && old[4] >= phase) return;
      cells.set(key, [cx, cy, cz, id, phase]);
    };
    let nextFall = 14 + Math.floor(R() * 12);
    let fallLeft = 0;
    steps.forEach(([sx, sy, sz, axis], n) => {
      if (n === nextFall) {
        fallLeft = 3 + Math.floor(R() * 6);
        nextFall = n + fallLeft + 14 + Math.floor(R() * 12);
      }
      const end = n >= steps.length - (road.endFall || 0);
      const fallen = S.d.collapse !== false && (fallLeft-- > 0 || end);
      for (let a = -1; a <= width; a++)
        for (let h = -1; h <= high; h++) {
          const [cx, cz] = axis === 0 ? [sx, sz + a - 1] : [sx + a - 1, sz];
          const cy = sy + h;
          const edge = a === -1 || a === width || h === -1 || h === high;
          if (edge) {
            if (!open(cx, cy, cz)) add(cx, cy, cz, h === -1 ? (R() < 0.3 ? mats.cracked : mats.floor) : R() < 0.35 ? mats.cracked : mats.wall, 0);
          } else add(cx, cy, cz, fallen && h < high - (R() < 0.3 ? 1 : 0) ? B.RUBBLE : AIR, 1);
        }
    });
    S.roadCells.push(...cells.values());
    if (steps.length) S.roadEnds.push(steps[steps.length - 1].slice(0, 3));
  }

  // ── a settlement ───────────────────────────────────────────────────────────────────────────────────────────────
  function add(d) {
    const pal = d.style.palette;
    const mats = {
      wall: materialBlock(pal.wall), floor: materialBlock(pal.floor), trim: materialBlock(pal.trim),
      accent: materialBlock(pal.accent), light: materialBlock(pal.light), cracked: B.CARVED_CRACKED
    };
    const L = layout(d);
    const S = { d, mats, spaces: L.spaces, passages: L.passages, anchors: [], doors: [], foundations: [], extra: [], roadCells: [], roadEnds: [], pieces: [] };
    for (const s of S.spaces) S.pieces.push({ kind: s.kind, grid: build(S, s), box: null });
    for (const p of S.passages) S.pieces.push({ kind: 'passage', grid: buildPassage(S, p), box: null });
    for (const pc of S.pieces) pc.box = pc.grid.box;
    S.anchors = S.anchors.filter((a) => {
      const want = READABLE[a.kind];
      return want == null || finalAt(S, ...a.at) === want;
    });
    S.anchors.forEach((a, n) => (a.n = n));
    // The road(s) out. With nowhere to go yet, a road runs out a way and ends in a fall.
    const roads = d.roads?.length ? d.roads : [{ len: 40 + Math.floor(rng(hashString(`${seed}:${d.id}:roadlen`))() * 30) }];
    roads.forEach((r, k) => {
      const from = gate(S, r.to || null, k);
      if (!from) return;
      const to = r.to ? [r.to.x, r.to.y, r.to.z] : [from.x + from.dx * r.len, from.y - Math.round(r.len / 6), from.z + from.dz * r.len];
      buildRoad(S, { from: [from.x, from.y, from.z], dx: from.dx, to, endFall: r.to ? 0 : 6 + Math.floor(r.len / 10) }, k);
    });
    if (S.roadCells.length) {
      let b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const [x, y, z] of S.roadCells) b = [Math.min(b[0], x), Math.min(b[1], y), Math.min(b[2], z), Math.max(b[3], x), Math.max(b[4], y), Math.max(b[5], z)];
      S.roadBox = b;
      // Bucketed by chunk, so a chunk finds its share without scanning the whole road.
      S.roadByChunk = new Map();
      for (const c of S.roadCells) {
        const key = `${Math.floor(c[0] / 16)},${Math.floor(c[1] / 16)},${Math.floor(c[2] / 16)}`;
        if (!S.roadByChunk.has(key)) S.roadByChunk.set(key, []);
        S.roadByChunk.get(key).push(c);
      }
    }
    let b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const pc of S.pieces) b = [Math.min(b[0], pc.box[0]), Math.min(b[1], pc.box[1]), Math.min(b[2], pc.box[2]), Math.max(b[3], pc.box[3]), Math.max(b[4], pc.box[4]), Math.max(b[5], pc.box[5])];
    for (const f of S.foundations) b[1] = Math.min(b[1], f.y0);
    S.box = b;
    all.push(S);
    return S;
  }

  // Where a road leaves: the middle of the outward wall of the space farthest out (toward its target, if any).
  function gate(S, to, k) {
    const [ax, , az] = [S.d.at.x, S.d.at.y, S.d.at.z];
    const rooms = S.spaces.filter((s) => s.kind !== 'vent' && s.kind !== 'stair' && s.level === 0);
    if (!rooms.length) return null;
    const dir = to ? [to.x - ax, to.z - az] : [Math.cos(k * 2.4 + 0.7), Math.sin(k * 2.4 + 0.7)];
    let best = null;
    for (const s of rooms) {
      const mx = (s.box[0] + s.box[3]) / 2, mz = (s.box[2] + s.box[5]) / 2;
      const score = (mx - ax) * dir[0] + (mz - az) * dir[1];
      if (!best || score > best.score) best = { s, score };
    }
    const s = best.s;
    const horiz = Math.abs(dir[0]) >= Math.abs(dir[1]);
    const dx = horiz ? Math.sign(dir[0]) || 1 : 0, dz = horiz ? 0 : Math.sign(dir[1]) || 1;
    const x = dx > 0 ? s.box[3] + 1 : dx < 0 ? s.box[0] - 1 : (s.box[0] + s.box[3]) >> 1;
    const z = dz > 0 ? s.box[5] + 1 : dz < 0 ? s.box[2] - 1 : (s.box[2] + s.box[5]) >> 1;
    return { x, y: s.box[1], z, dx, dz };
  }

  // The block a settlement leaves at a cell (ignoring roads and the rock round it): 0 where it leaves it alone.
  function finalAt(S, x, y, z) {
    const v = rawAt(S, x, y, z);
    return v === AIR ? B.AIR : v;
  }
  // The same, telling "made air" (AIR) from "left alone" (0).
  function rawAt(S, x, y, z) {
    let v = 0;
    for (const f of S.foundations) if (f.x === x && f.z === z && y >= f.y0 && y <= f.y1) v = f.id;
    for (let phase = 0; phase <= 2; phase++) {
      for (const pc of S.pieces) {
        const g = pc.grid.get(x, y, z);
        if (g && g >> 8 === phase) v = g & 255;
      }
      for (const [ex, ey, ez, id, ph] of S.extra) if (ph === phase && ex === x && ey === y && ez === z) v = id;
    }
    return v;
  }

  // ── stamping a chunk ───────────────────────────────────────────────────────────────────────────────────────────
  const meets = (b, ox, oy, oz, n) => !(b[3] < ox || b[0] >= ox + n || b[4] < oy || b[1] >= oy + n || b[5] < oz || b[2] >= oz + n);
  // data: the chunk's Uint8Array (n³, x fastest, then z, then y), at world (ox, oy, oz).
  function stampChunk(data, ox, oy, oz, n = 16) {
    let any = false;
    for (const S of all) {
      const inBox = meets(S.box, ox, oy, oz, n);
      let roads = null;
      if (S.roadBox && meets(S.roadBox, ox, oy, oz, n)) {
        roads = [];
        for (let cx = Math.floor(ox / 16); cx <= Math.floor((ox + n - 1) / 16); cx++)
          for (let cy = Math.floor(oy / 16); cy <= Math.floor((oy + n - 1) / 16); cy++)
            for (let cz = Math.floor(oz / 16); cz <= Math.floor((oz + n - 1) / 16); cz++) roads.push(...(S.roadByChunk.get(`${cx},${cy},${cz}`) || []));
        if (!roads.length) roads = null;
      }
      if (!inBox && !roads) continue;
      any = true;
      const put = (x, y, z, v) => {
        const lx = x - ox, ly = y - oy, lz = z - oz;
        if (lx < 0 || ly < 0 || lz < 0 || lx >= n || ly >= n || lz >= n) return;
        data[lx + lz * n + ly * n * n] = v === AIR ? B.AIR : v;
      };
      // Roads first: a settlement's own walls and rooms win where a road meets them.
      if (roads) for (const phase of [0, 1]) for (const [x, y, z, id, ph] of roads) if (ph === phase) put(x, y, z, id);
      if (!inBox) continue;
      for (const f of S.foundations) {
        if (f.x < ox || f.x >= ox + n || f.z < oz || f.z >= oz + n) continue;
        for (let y = Math.max(f.y0, oy); y <= Math.min(f.y1, oy + n - 1); y++) put(f.x, y, f.z, f.id);
      }
      for (let phase = 0; phase <= 2; phase++) {
        for (const pc of S.pieces) {
          const b = pc.box;
          if (!meets(b, ox, oy, oz, n)) continue;
          const W = b[3] - b[0] + 1, D = b[5] - b[2] + 1;
          const x0 = Math.max(ox, b[0]), x1 = Math.min(ox + n - 1, b[3]);
          const y0 = Math.max(oy, b[1]), y1 = Math.min(oy + n - 1, b[4]);
          const z0 = Math.max(oz, b[2]), z1 = Math.min(oz + n - 1, b[5]);
          const g = pc.grid.g;
          for (let y = y0; y <= y1; y++)
            for (let z = z0; z <= z1; z++)
              for (let x = x0; x <= x1; x++) {
                const v = g[(x - b[0]) + (z - b[2]) * W + (y - b[1]) * W * D];
                if (v === KEEP || v >> 8 !== phase) continue;
                put(x, y, z, v & 255);
              }
        }
        for (const [x, y, z, id, ph] of S.extra) if (ph === phase) put(x, y, z, id);
      }
    }
    return any;
  }

  // Is this cell inside a settlement's footprint (the generator keeps its cabins and remnants out of it)?
  function covers(box, margin = 2) {
    for (const S of all) {
      for (const pc of S.pieces) {
        const b = pc.box;
        if (!(b[3] + margin < box[0] || b[0] - margin > box[3] || b[4] + margin < box[1] || b[1] - margin > box[4] || b[5] + margin < box[2] || b[2] - margin > box[5])) return true;
      }
    }
    return false;
  }
  // Inside a room the creatures will not enter: a refuge that came through the collapse whole.
  function safeAt(x, y, z) {
    for (const S of all) {
      if (x < S.box[0] || x > S.box[3] || z < S.box[2] || z > S.box[5]) continue;
      for (const s of S.spaces) if (s.kind === 'refuge' && s.whole && x >= s.box[0] && x <= s.box[3] && y >= s.box[1] && y <= s.box[4] && z >= s.box[2] && z <= s.box[5]) return true;
    }
    return false;
  }
  // What a district would cut, at an anchor: the ship, a lair or a vault, a planted room, another settlement. Checked
  // on the settlement as built (its pieces' boxes and its road), so it is exact, not an estimate. [] when clear.
  function clashes(S) {
    const out = [];
    const boxes = S.pieces.map((p) => p.box);
    if (S.roadBox) for (const [x, y, z] of S.roadCells) boxes.push([x, y, z, x, y, z]);
    const hit = (b, m = 0) => boxes.some((a) => !(a[3] + m < b[0] || a[0] - m > b[3] || a[4] + m < b[1] || a[1] - m > b[4] || a[5] + m < b[2] || a[2] - m > b[5]));
    const ship = hooks.base?.().box;
    if (ship && hit(ship, 6)) out.push('ship');
    for (const t of hooks.structures || []) if (hit([t.x, t.y, t.z, t.x + 9, t.y + 7, t.z + 9], 3)) out.push('planted room');
    if (hooks.siteIn) {
      const [x0, y0, z0, x1, y1, z1] = S.roadBox ? S.box.map((v, i) => (i < 3 ? Math.min(v, S.roadBox[i]) : Math.max(v, S.roadBox[i]))) : S.box;
      const C = hooks.SITE;
      for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
        for (let j = Math.floor(y0 / C); j <= Math.floor(y1 / C); j++)
          for (let k = Math.floor(z0 / C); k <= Math.floor(z1 / C); k++) {
            const t = hooks.siteIn(i, j, k);
            if (t && RESERVED.includes(t.type) && hit(t.box, 2)) out.push(t.type);
          }
    }
    for (const T of all) if (T !== S && hit(T.box, 8)) out.push('settlement');
    return out;
  }
  // Place a district near a point: try anchors round it (dist blocks out, at the style's depth under the ground there)
  // and keep the first whose settlement cuts nothing and stands mostly on rock. Returns the settlement, or null.
  function place(d, near, opts = {}) {
    const [dmin, dmax] = opts.dist || [20, 60];
    const [hmin, hmax] = opts.depth || d.style.depth;
    const R = rng(hashString(`${seed}:${d.id}:place`));
    for (let t = 0; t < (opts.tries || 40); t++) {
      const a = R() * Math.PI * 2, r = dmin + R() * (dmax - dmin);
      const x = Math.round(near.x + Math.cos(a) * r), z = Math.round(near.z + Math.sin(a) * r);
      const y = Math.round(height(x, z) - hmin - R() * (hmax - hmin));
      // The heart on rock: few open cells under its middle.
      let gaps = 0, n = 0;
      for (let dz = -6; dz <= 6; dz += 3) for (let dx = -6; dx <= 6; dx += 3) (n++, open(x + dx, y - 2, z + dz) && gaps++);
      if (gaps > n * 0.25) continue;
      const S = add({ ...d, at: { x, y, z } });
      const c = clashes(S);
      if (!c.length) return S;
      all.splice(all.indexOf(S), 1);
    }
    return null;
  }

  // Does a settlement (or its road) decide this cell? (The generator's rule that roofs an opening under lava asks,
  // so it never lays a slab across a room where the lava it saw was carved away.)
  function writes(x, y, z) {
    for (const S of all) {
      const inBox = x >= S.box[0] && x <= S.box[3] && y >= S.box[1] && y <= S.box[4] && z >= S.box[2] && z <= S.box[5];
      if (inBox) {
        for (const pc of S.pieces) if (pc.grid.get(x, y, z)) return true;
        for (const f of S.foundations) if (f.x === x && f.z === z && y >= f.y0 && y <= f.y1) return true;
      }
      const bucket = S.roadByChunk?.get(`${Math.floor(x / 16)},${Math.floor(y / 16)},${Math.floor(z / 16)}`);
      if (bucket && bucket.some((c) => c[0] === x && c[1] === y && c[2] === z)) return true;
    }
    return false;
  }

  // The readable thing at a cell, if any: { settlement, anchor }.
  function anchorAt(x, y, z) {
    for (const S of all) for (const a of S.anchors) if (a.at[0] === x && a.at[1] === y && a.at[2] === z) return { S, a };
    return null;
  }

  // A sealed chamber (DIG-007, a district's secret): a small room with no way in, cut into the rock behind the wall an
  // anchor is carved on, so the one way in is to dig through beside what you just read. Tried right behind the anchor,
  // then behind it a few blocks to either side, then under the floor in front of it; each try must sit in solid rock
  // (no cave, nothing any settlement built, nothing it clashes with). Returns the chamber's anchor (a shelf of tablets
  // at its far end), or null when no try fits. Deterministic: the same anchor always gives the same chamber.
  function sealChamber(S, anchor, { cache = false, why = null } = {}) {
    const [ax, ay, az] = anchor.at;
    // The room side of the anchor: the first neighbour (in DIRS order) the settlement leaves open.
    // (A lintel over a doorway may have its open side only under it.)
    const face = DIRS.find(([dx, dz]) => rawAt(S, ax + dx, ay, az + dz) === AIR) || DIRS.find(([dx, dz]) => rawAt(S, ax + dx, ay - 1, az + dz) === AIR);
    if (!face) return why?.push('no open side'), null;
    const back = [-face[0], -face[1]], side = [face[1], face[0]];
    // Each try: the interior's near middle, which way is "in", and how the way in reads.
    // Behind the wall first (straight back, then a few blocks to either side), then the other walls round it the same
    // way, then under the floor in front of it: always within a few blocks of the text.
    const tries = [];
    const walls = [back, side, [-side[0], -side[1]], face];
    for (const [k, w] of walls.entries()) {
      const p = [w[1], w[0]];
      for (const s of [0, 4, -4]) tries.push({ o: [ax + w[0] * 2 + p[0] * s, ay - 1, az + w[1] * 2 + p[1] * s], dir: w, way: k === 0 ? (s ? 'beside' : 'behind') : 'near' });
    }
    for (const w of [face, side, [-side[0], -side[1]]]) tries.push({ o: [ax + w[0] * 2, ay - 9, az + w[1] * 2], dir: w, way: "under" });
    // A cell the chamber may not touch: open in the rock (a cave), open in any settlement (a room, a passage, a road),
    // or something readable. Solid walls a settlement already built are fine: the chamber keeps them as they are.
    const anchorCells = new Set(all.flatMap((T) => T.anchors.map((q) => q.at.join(','))));
    const madeOpen = (x, y, z) => {
      if (open(x, y, z)) return true;
      for (const T of all) {
        if (x < T.box[0] - 1 || x > T.box[3] + 1 || y < T.box[1] - 1 || y > T.box[4] + 1 || z < T.box[2] - 1 || z > T.box[5] + 1) {
          if (!T.roadByChunk) continue;
        } else if (rawAt(T, x, y, z) === AIR) return true;
        const bucket = T.roadByChunk?.get(`${Math.floor(x / 16)},${Math.floor(y / 16)},${Math.floor(z / 16)}`);
        if (bucket && bucket.some((c) => c[0] === x && c[1] === y && c[2] === z)) return true;
      }
      return false;
    };
    const built = (x, y, z) => all.some((T) => T.pieces.some((pc) => pc.grid.get(x, y, z)) || T.foundations.some((f) => f.x === x && f.z === z && y >= f.y0 && y <= f.y1));
    const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const t of tries) {
      const [ox, oy, oz] = t.o, [ix, iz] = t.dir, [px, pz] = [t.dir[1], t.dir[0]];
      const at = (a, c, h) => [ox + ix * a + px * c, oy + h, oz + iz * a + pz * c];
      // The interior: 3 along "in", 3 across, 3 high; a shell one block thick round it.
      const cells = [];
      for (let a = -1; a <= 3; a++)
        for (let c = -2; c <= 2; c++)
          for (let h = -1; h <= 3; h++) cells.push([...at(a, c, h), a >= 0 && a <= 2 && Math.abs(c) <= 1 && h >= 0 && h <= 2]);
      // Sealed: nothing open in it, nothing open against its shell, no readable cell in it, and the interior cut
      // only where nothing was built (so no room loses a wall).
      const bad = cells.find(([x, y, z, inner]) => madeOpen(x, y, z) || anchorCells.has(`${x},${y},${z}`) || (inner && built(x, y, z)) || (!inner && N6.some(([dx, dy, dz]) => madeOpen(x + dx, y + dy, z + dz))));
      if (bad) {
        why?.push(`${t.way}: ${open(bad[0], bad[1], bad[2]) ? 'cave' : 'built'}`);
        continue;
      }
      let box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const [x, y, z] of cells) box = [Math.min(box[0], x), Math.min(box[1], y), Math.min(box[2], z), Math.max(box[3], x), Math.max(box[4], y), Math.max(box[5], z)];
      const G = makeGrid(box);
      for (const [x, y, z, inner] of cells) if (inner || !built(x, y, z)) G.set(x, y, z, inner ? 0 : B.CARVED_DARK, inner ? 1 : 0);
      // The shelf in the far wall at eye height, a lamp niche in a side wall, the cache on the floor (if any).
      const shelf = at(3, 0, 1);
      G.set(...shelf, B.TABLETS, 1);
      G.set(...at(1, -2, 2), B.LAMP_NICHE, 1);
      const cacheAt = cache ? at(2, 1, 0) : null;
      if (cacheAt) G.set(...cacheAt, B.CACHE, 1);
      S.pieces.push({ kind: 'chamber', grid: G, box });
      const keep = S.box;
      S.box = keep.map((v, i) => (i < 3 ? Math.min(v, box[i]) : Math.max(v, box[i])));
      if (clashes(S).length) {
        why?.push(`${t.way}: clashes ${clashes(S).join(',')}`);
        S.pieces.pop();
        S.box = keep;
        continue;
      }
      const a = { kind: 'tablet', at: shelf, space: -1, secret: true, n: S.anchors.length };
      S.anchors.push(a);
      S.chamber = { box, anchor: a, cache: cacheAt, way: t.way };
      return a;
    }
    return null;
  }
  return { add, place, clashes, writes, all, stampChunk, covers, safeAt, anchorAt, finalAt, rawAt, sealChamber, SLOT };
}
