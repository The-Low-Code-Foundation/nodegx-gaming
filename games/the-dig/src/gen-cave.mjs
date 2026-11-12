// The cave world: Minecraft-ish country on top (rolling grass, forests of oak and birch, the odd mountain with snow
// on it, a sea with sandy beaches, cave mouths), then rock all the way down, forever. Spaghetti tunnels, caverns
// that grow commoner and bigger with depth, ravines with ledges, lava pooled at the bottom of each 80-block band,
// coal and iron, glow moss, crystals and mushrooms in the deep, the odd supply crate, and the rooms planted from
// the day's plants.
import { B, isPlant, torchFor } from './blocks.mjs';
import { makeNoise, hash3 } from './noise.mjs';
import { settlementEngine } from './gen-settle.mjs';

export const CS = 16;
export const SEA = 2;
const ROOM = { w: 9, h: 7, d: 9 };
const SITE = 48;
// The remnants (round 7, DIG-004): at most one in each 20-block cell, between the bigger sites.
const REM = 20;
// The shafts of daylight (round 5): at most one in each 88 × 88 square of the map.
const SKY = 88;

// The logbooks the miners left. Some of it is worth knowing.
const NOTES = [
  { title: 'Logbook, day 41', text: 'The big one came through again. It has no eyes. It found Dunmore by his footsteps. Walk, don\'t run, and it goes right past you.' },
  { title: 'Logbook, the last page', text: 'Whatever lives in the wide caverns can\'t follow you into a narrow tunnel. We dug ours one block wide on purpose.' },
  { title: 'Scrawled inside the cover', text: 'The crates hold coal. The glowing boxes hold stranger things: rounds nobody up top could have made.' },
  { title: 'Logbook, day 70', text: 'Found an old grappling hook in the stores. Aim at the lip of a ledge and it puts you on top. Aim at a bare wall and it lets you go, so be quick with the next one.' },
  { title: 'Logbook, day 3', text: 'The purple rooms hum. Get close and you hear it before you see it. Nobody here has opened one.' },
  { title: 'Logbook, day 19', text: 'Every pool of lava has rock under it. Fall in and you sink slowly, so there is time to jump out. Keep jumping.' },
  { title: 'Logbook, day 88', text: 'Found a crystal hollow. Sat in it for an hour. Didn\'t dig a thing. Best shift of the year.' },
  { title: 'A note under a mug', text: 'If you\'re reading this the stew is cold. Sorry. The flares are in the crate.' },
  { title: 'Logbook, day 7', text: 'Every eighty blocks down there is a lava floor, and every band deeper the caverns get wider.' },
  { title: 'Logbook, day 52', text: 'The tool takes anything you feed it. Rockets out of a rifle barrel. I stopped asking how.' },
  { title: 'Logbook, day 60', text: 'We built the hamlet where the cave was quiet. It isn\'t quiet any more. We\'re going down, not up.' },
  { title: 'Pinned to the wall', text: 'Shots are loud. The big one hears a rifle from forty blocks. A bolt it barely hears at all.' },
  { title: 'Logbook, day 12', text: 'Crawlers won\'t step into a flare\'s light. Light your way back and the way back stays yours.' },
  { title: 'Logbook, day 30', text: 'Nothing we carry points at the humming rooms. You hear them before you see them, so stop digging now and then and listen.' },
  { title: 'Child\'s drawing', text: 'A stick figure with a pickaxe, a very large grey shape with no face, and a tunnel exactly one block wide between them.' },
  { title: 'Logbook, day 95', text: 'Where the daylight comes down a shaft, grass grows on the cave floor. You can see the light from a long way off. That is the way up.' },
  { title: 'Logbook, day 23', text: 'The bony ones shoot. They draw first: a moment, then the arrow. Move sideways when you see the bow come up.' },
  { title: 'Scratched into a rune stone', text: 'We sealed the good stores in rooms of rune stone. They glow through the rock. Follow the glow.' },
  { title: 'Logbook, day 64', text: 'There is a nest down the east tunnel. Dozens of them, round a heap of the glowing boxes. We left it alone. Something with more firepower might not.' },
  { title: 'Logbook, day 77', text: 'The pale crawlers don\'t care about flares. They jump the last bit. Don\'t let one get within a few blocks of you.' }
];
// On the screen in the ship's workshop (round 7: the ship replaced the plank house). Who you are and why you
// landed, and no more: the miners' logbooks are an earlier expedition's.
const SHIP_LOG = { title: 'Ship\'s log', text: 'Down safe. A survey ship and a crew of one. The charts say one expedition came here before me and never sent a report home, so nobody really knows what is under this ground. I came to look. The kit has the pulse in it: hold it, let go, and the rock shows where it is hollow. If the deep gets the better of me, the med bay brings me round, with everything still in my pack. The way down is mine to find.' };

export function caveGenerator(seed) {
  const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2), n4 = makeNoise(seed + 3), n5 = makeNoise(seed + 4);
  const n6 = makeNoise(seed + 5), n7 = makeNoise(seed + 6);
  const hcache = new Map();
  // The ground: broad lowlands and sea, hills, and now and then a ridge of mountain. (The cache key is exact: a
  // hashed key that collides hands one column another's height, and the chunks either side of it disagree.)
  const rawHeight = (x, z) => {
    const k = x * 2097152 + z;
    let h = hcache.get(k);
    if (h === undefined) {
      const broad = n1.fbm2(x / 220, z / 220, 4);
      const hills = n2.fbm2(x / 60, z / 60, 3);
      const ridge = 1 - Math.abs(n5.noise2(x / 170 + 31, z / 170 - 17));
      const mount = Math.max(0, n6.fbm2(x / 330, z / 330, 2) - 0.12);
      // (Mountains are craggy: a finer noise bites into them in proportion to their height.)
      const crag = mount * ridge * (n2.noise2(x / 13 + 7, z / 13 - 3) * 0.5 + n4.noise2(x / 6, z / 6) * 0.25);
      h = Math.floor(5 + broad * 16 + hills * 6 + n2.noise2(x / 23, z / 23) * 1.5 + mount * ridge * ridge * 150 + crag * 40);
      if (hcache.size > 400000) hcache.clear();
      hcache.set(k, h);
    }
    return h;
  };
  // The landing pad (round 7, DIG-002): where the ship stands the ground is the generator's own, made level, so
  // everything that reads the ground (caves, trees, the creatures' surface) sees it flat. An ellipse RX × RZ round
  // the ship, flat inside, easing back to the land over the next half of its radius. Set once, below.
  let PAD = null;
  const padE = (x, z) => (PAD ? Math.hypot((x - PAD.x) / PAD.rx, (z - PAD.z) / PAD.rz) : Infinity);
  const height = (x, z) => {
    const h = rawHeight(x, z);
    if (!PAD) return h;
    const e = padE(x, z);
    if (e >= PAD.outer) return h;
    if (e <= 1) return PAD.g;
    const t = (e - 1) / (PAD.outer - 1);
    return Math.round(PAD.g + (h - PAD.g) * t * t * (3 - 2 * t));
  };
  // What the top of a column is made of, from its height and its neighbours' (cliffs show their stone).
  const SNOWLINE = 44;
  const topOf = (x, z, h, steep) => {
    if (h < SEA - 3) return hash3(x, 5, z, seed) < 0.5 ? B.GRAVEL : B.SAND;
    if (h <= SEA + 1) return B.SAND;
    if (h >= SNOWLINE + Math.floor(hash3(x, 6, z, seed) * 5)) return steep ? B.STONE : B.SNOWYSTONE;
    if (steep) return B.STONE;
    if (h >= SNOWLINE - 6 + Math.floor(hash3(x, 6, z, seed) * 4)) return B.SNOWGRASS;
    return B.GRASS;
  };
  const steepAt = (x, z, h) => Math.max(Math.abs(height(x + 1, z) - h), Math.abs(height(x - 1, z) - h), Math.abs(height(x, z + 1) - h), Math.abs(height(x, z - 1) - h)) >= 3;
  // How wooded a place is: open plains, light woods, thick forest; birch in some woods.
  const woods = (x, z) => {
    const f = n7.noise2(x / 130, z / 130);
    return f > 0.3 ? 0.045 : f > 0.05 ? 0.014 : 0.0025;
  };
  const rangeCache = new Map();
  const heightRange = (x0, z0, size) => {
    const k = `${x0},${z0},${size}`;
    let r = rangeCache.get(k);
    if (!r) {
      let lo = Infinity, hi = -Infinity;
      for (let z = z0; z <= z0 + size; z++)
        for (let x = x0; x <= x0 + size; x++) {
          const h = height(x, z);
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      r = [lo - 2, Math.max(hi + 9, SEA + 1)]; // + a tree's height; the sea's surface
      if (rangeCache.size > 5000) rangeCache.clear();
      rangeCache.set(k, r);
    }
    return r;
  };

  // Is this cell hollowed out by a cave? Below the surface, kept three blocks under the lowest ground beside it (so
  // no cave opens under the sea) — except where a tunnel is let up to daylight, as a cave mouth.
  // The cave noises are smooth, so they are sampled on a lattice every 4 blocks and blended in between (as
  // Minecraft does): noise is the dear part of making a chunk. The lattice sits on world multiples of 4, so every
  // chunk computes the same value for the same cell.
  const mouthAt = (x, z) => n7.noise2(x / 90 + 50, z / 90 - 20) > 0.42;
  const ravineAt = (x, z) => Math.abs(n2.noise2(x / 160 + 40, z / 160 - 30));
  const CAVE_FIELDS = [
    (x, y, z) => n3.noise3(x / 38, y / 26, z / 38),
    (x, y, z) => n4.noise3(x / 38, y / 26, z / 38),
    (x, y, z) => n5.noise3(x / 64, y / 34, z / 64) + n3.noise3(x / 17, y / 13, z / 17) * 0.18,
    // Where the caverns are: a slow noise that makes cavern country and tunnel country, so the big rooms come in
    // districts with tunnels between, not one open hall under everything (round 4: "a bit 'too' open").
    (x, y, z) => n6.noise3(x / 150 + 13, y / 70, z / 150 - 7),
    // A second, finer tunnel network, crossing the first: narrow passages that join things up.
    (x, y, z) => n1.noise3(x / 32 + 50, y / 22, z / 32 - 50),
    (x, y, z) => n7.noise3(x / 32 - 30, y / 22, z / 32 + 30)
  ];
  // col: { h, hmin, mouth, ravine } for the cell's column; f: the lattice the fields come from.
  function caveAt(x, y, z, col, f) {
    const { h, hmin } = col;
    if (y > (col.mouth ? h : hmin - 3)) return false;
    const depth = h - y;
    // Spaghetti: where two ridged noises are both near zero. Two or three blocks across, a little wider deep down.
    const a = f(0, x, y, z), b = f(1, x, y, z);
    const w = 0.052 + Math.min(0.02, Math.max(0, depth) / 4000);
    if (a * a + b * b < w * w) return true;
    if (y > hmin - 3) return false;
    // The narrow network, in tunnel country only (away from the caverns): passages two blocks across, a maze to
    // find your way through between the big rooms.
    const country = f(3, x, y, z);
    if (depth > 8 && country < 0.15) {
      const c = f(4, x, y, z), e = f(5, x, y, z);
      if (c * c + e * e < 0.0042) return true;
    }
    // Caverns: big blobs, only in cavern country, a little more of it deeper down. Kept away from the first 18 blocks.
    if (depth > 18 && f(2, x, y, z) + country * 0.45 > 0.58 - Math.min(0.08, (depth - 18) / 800)) return true;
    // Ravines: thin, tall slots that wander across the map, with ledges where a smaller noise bites in.
    if (depth > 10 && y < -14 && y > -14 - 120 && col.ravine < 0.05) {
      const ledge = n4.noise3(x / 9, y / 5, z / 9) * 0.018;
      if (col.ravine < 0.022 + ledge + Math.min(0.012, depth / 4000)) return true;
    }
    return false;
  }
  const column = (x, z, h, hmin) => ({ h, hmin, mouth: hmin > SEA + 2 && mouthAt(x, z) && padE(x, z) > 1.7, ravine: ravineAt(x, z) });
  // One cell on its own (placing a room, a remnant, a tree by a cave mouth): the same lattice, its corner values kept
  // (round 7: the remnants ask about thousands of cells, and neighbours share corners). Stored as 32-bit floats and
  // blended in the same order as lattice(), so a cell reads exactly as the chunk that holds it does.
  const corners = new Map();
  const corner = (k, X, Y, Z) => {
    const key = (((X + 4096) * 8192 + (Y + 4096)) * 8192 + (Z + 4096)) * 8 + k;
    let v = corners.get(key);
    if (v === undefined) {
      if (corners.size > 400000) corners.clear();
      corners.set(key, (v = Math.fround(CAVE_FIELDS[k](X * 4, Y * 4, Z * 4))));
    }
    return v;
  };
  const oneCell = (k, x, y, z) => {
    const X = Math.floor(x / 4), Y = Math.floor(y / 4), Z = Math.floor(z / 4);
    const fx = (x - X * 4) / 4, fy = (y - Y * 4) / 4, fz = (z - Z * 4) / 4;
    const c = (dx, dy, dz) => corner(k, X + dx, Y + dy, Z + dz);
    const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * fx, x10 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * fx;
    const x01 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * fx, x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * fx;
    const z0v = x00 + (x10 - x00) * fz, z1v = x01 + (x11 - x01) * fz;
    return z0v + (z1v - z0v) * fy;
  };
  function cave(x, y, z, h, hmin = h) {
    return caveAt(x, y, z, column(x, z, h, hmin), (k, xx, yy, zz) => oneCell(k, xx, yy, zz));
  }

  const ORE_FIELDS = [
    (x, y, z) => n3.noise3(x / 5, y / 5, z / 5),
    (x, y, z) => n4.noise3(x / 4, y / 4, z / 4),
    (x, y, z) => n5.noise3(x / 7, y / 5, z / 7),
    (x, y, z) => n6.noise3(x / 9, y / 7, z / 9)
  ];
  const COAL_AT = 0.45, IRON_AT = 0.47, GRAVEL_AT = 0.56, DIRT_AT = 0.56;

  function lavaLevel(x, z, y) {
    const band = Math.floor(y / 80) * 80;
    return band + 3 + Math.round(n1.noise2(x / 60, z / 60) * 3);
  }

  const structures = [];

  function chunk(cx, cy, cz) {
    const data = new Uint8Array(CS * CS * CS);
    const ox = cx * CS, oy = cy * CS, oz = cz * CS;
    // The cave mask with a one-cell border, so the walls know where the air is.
    const E = CS + 2;
    const hollow = new Uint8Array(E * E * E);
    const heights = new Int32Array(E * E);
    for (let z = 0; z < E; z++) for (let x = 0; x < E; x++) heights[x + z * E] = height(ox + x - 1, oz + z - 1);
    // The lowest ground round each column (a cave stays under it), and the top block of each.
    const hmin = new Int32Array(E * E);
    for (let z = 0; z < E; z++)
      for (let x = 0; x < E; x++) {
        let m = heights[x + z * E];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, zz = z + dz;
          m = Math.min(m, xx >= 0 && zz >= 0 && xx < E && zz < E ? heights[xx + zz * E] : height(ox + xx - 1, oz + zz - 1));
        }
        hmin[x + z * E] = m;
      }
    let anyCave = false;
    const topH = Math.max(...heights);
    if (oy - 1 <= topH) {
      const full = lattice(CAVE_FIELDS, ox - 1, oy - 1, oz - 1, E, 4).fill();
      const f = (k, x, y, z) => full[k][(x - ox + 1) + (z - oz + 1) * E + (y - oy + 1) * E * E];
      const cols = [];
      for (let z = 0; z < E; z++) for (let x = 0; x < E; x++) cols.push(column(ox + x - 1, oz + z - 1, heights[x + z * E], hmin[x + z * E]));
      for (let y = 0; y < E; y++)
        for (let z = 0; z < E; z++)
          for (let x = 0; x < E; x++) {
            const wy = oy + y - 1;
            if (wy > heights[x + z * E]) continue;
            if (caveAt(ox + x - 1, wy, oz + z - 1, cols[x + z * E], f)) {
              hollow[x + z * E + y * E * E] = 1;
              anyCave = true;
            }
          }
    }
    // The ores and the patches of gravel and dirt in the rock: smooth blobs, on a lattice every 2 blocks.
    // (Coal and iron are small blobs, sampled every 2 blocks; gravel and dirt are big patches, every 4.)
    const oreFull = oy <= topH ? [...lattice(ORE_FIELDS.slice(0, 2), ox, oy, oz, CS, 2).fill(), ...lattice(ORE_FIELDS.slice(2), ox, oy, oz, CS, 4).fill()] : null;
    const ores = (k, x, y, z) => oreFull[k][(x - ox) + (z - oz) * CS + (y - oy) * CS * CS];
    const at = (x, y, z) => hollow[(x + 1) + (z + 1) * E + (y + 1) * E * E];

    for (let z = 0; z < CS; z++)
      for (let x = 0; x < CS; x++) {
        const wx = ox + x, wz = oz + z;
        const h = heights[(x + 1) + (z + 1) * E];
        const steep = h > SEA + 1 && Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => Math.abs(heights[(x + 1 + dx) + (z + 1 + dz) * E] - h))) >= 3;
        let top = topOf(wx, wz, h, steep);
        // The ground the ship came down on is burnt black under it, thinning out in a ring round it.
        if (PAD && (top === B.GRASS || top === B.DIRT || top === B.SNOWGRASS)) {
          const e = padE(wx, wz);
          // (In patches that fray at the edge, not single blocks: a smooth noise, nudged a little per block.)
          const burn = 0.5 + n3.noise2(wx / 6 + 40, wz / 6 - 40) * 0.6 + (hash3(wx, 8, wz, seed + 12) - 0.5) * 0.25;
          if (e < 1.3 && burn > (e < 0.75 ? -1 : 0.25 + (e - 0.75) * 1.3)) top = B.SCORCH;
        }
        const under = top === B.SAND ? B.SAND : top === B.GRAVEL ? B.GRAVEL : top === B.STONE || top === B.SNOWYSTONE ? B.STONE : B.DIRT;
        for (let y = 0; y < CS; y++) {
          const wy = oy + y;
          const i = x + z * CS + y * CS * CS;
          if (wy > h) {
            if (wy <= SEA) data[i] = B.WATER;
            // A plant on the grass (not over a cave mouth).
            else if (wy === h + 1 && (top === B.GRASS) && !(anyCave && at(x, y - 1, z))) {
              const r = hash3(wx, 7, wz, seed + 11);
              if (r < 0.1) data[i] = B.TALLGRASS;
              else if (r < 0.106) data[i] = B.POPPY;
              else if (r < 0.112) data[i] = B.DANDELION;
            }
            continue;
          }
          if (anyCave && at(x, y, z)) {
            if (wy < -40 && wy <= lavaLevel(wx, wz, wy)) data[i] = B.LAVA;
            // Every pool has a floor. A cave crossing a band's edge used to have open air straight under the
            // lava (the band below starts dry), and you sank through it into the cave beneath.
            else if (wy < -41 && at(x, y + 1, z) && wy + 1 <= lavaLevel(wx, wz, wy + 1)) data[i] = B.DEEP;
            else if (wy < -8 && !at(x, y - 1, z)) {
              const r = hash3(wx, wy, wz, seed + 9);
              if (r < 0.0012) data[i] = B.CRATE;
              else if (r < 0.006 && h - wy > 12) data[i] = r < 0.0036 ? B.BROWN_MUSHROOM : B.RED_MUSHROOM;
            }
            continue;
          }
          let id;
          if (wy === h) id = top;
          else if (wy > h - 4 && under !== B.STONE) id = under;
          else {
            // Deepstone takes over below 48, dithered across the boundary.
            id = wy < -48 + Math.floor(hash3(wx, wy, wz, seed) * 8) ? B.DEEP : B.STONE;
            const depth = h - wy;
            if (ores(0, wx, wy, wz) > COAL_AT && hash3(wx, wy, wz, seed + 1) < 0.55) id = B.COAL;
            else if (depth > 12 && ores(1, wx, wy, wz) > IRON_AT && hash3(wx, wy, wz, seed + 2) < 0.5) id = B.IRON;
            else if (ores(2, wx, wy, wz) > GRAVEL_AT) id = B.GRAVEL;
            else if (depth > 4 && ores(3, wx, wy, wz) > DIRT_AT) id = B.DIRT;
            // The walls of the caves: glow moss, and crystal deeper down. This is the light you see far off.
            if (anyCave && depth > 16 && (at(x + 1, y, z) || at(x - 1, y, z) || at(x, y + 1, z) || at(x, y - 1, z) || at(x, y, z + 1) || at(x, y, z - 1))) {
              const r = hash3(wx, wy, wz, seed + 3);
              const crystal = Math.min(0.012, Math.max(0, (depth - 40) / 8000));
              if (r < crystal) id = B.CRYSTAL;
              else if (r < crystal + 0.014 && n1.noise3(wx / 20, wy / 20, wz / 20) > 0.1) id = B.GLOWMOSS;
            }
          }
          data[i] = id;
        }
      }

    // Trees. Each is decided from its own column alone, so one that crosses a chunk's edge is the same tree on both
    // sides; every chunk it could reach draws its share (the old check used this chunk's own heights, and cut the
    // tops off trees standing on higher ground next door).
    const put = (x, y, z, id, onlyAir) => {
      const lx = x - ox, ly = y - oy, lz = z - oz;
      if (lx < 0 || ly < 0 || lz < 0 || lx >= CS || ly >= CS || lz >= CS) return;
      const i = lx + lz * CS + ly * CS * CS;
      if (onlyAir && data[i] !== B.AIR && !isPlant[data[i]]) return;
      data[i] = id;
    };
    for (let tz = oz - 2; tz < oz + CS + 2; tz++)
      for (let tx = ox - 2; tx < ox + CS + 2; tx++) {
        const pick = hash3(tx, 0, tz, seed + 5);
        if (pick > 0.045 || pick > woods(tx, tz)) continue;
        const th = height(tx, tz);
        if (th + 9 < oy || th + 1 >= oy + CS) continue;
        if (padE(tx, tz) < 1.65) continue; // the ship's clearing
        if (topOf(tx, tz, th, steepAt(tx, tz, th)) !== B.GRASS) continue;
        if (mouthAt(tx, tz) && cave(tx, th, tz, th, Math.min(th, height(tx + 1, tz), height(tx - 1, tz), height(tx, tz + 1), height(tx, tz - 1)))) continue;
        const birch = n5.noise2(tx / 70 - 9, tz / 70 + 4) > 0.35 && hash3(tx, 2, tz, seed) < 0.7;
        const trunk = (birch ? 5 : 4) + Math.floor(hash3(tx, 1, tz, seed) * 3);
        const T = th + trunk;
        for (let y = th + 1; y <= T; y++) put(tx, y, tz, birch ? B.BIRCH : B.LOG);
        put(tx, th, tz, B.DIRT);
        for (let y = T - 2; y <= T + 1; y++) {
          const r = y >= T ? 1 : 2;
          for (let dz = -r; dz <= r; dz++)
            for (let dx = -r; dx <= r; dx++) {
              const corner = Math.abs(dx) === r && Math.abs(dz) === r;
              if (corner && (y === T + 1 || hash3(tx + dx, y, tz + dz, seed) < 0.5)) continue;
              put(tx + dx, y, tz + dz, B.LEAVES, true);
            }
        }
      }

    // What people left down here (before the planted rooms, which win where they meet).
    let stamped = false;
    for (let i = Math.floor(ox / SITE); i <= Math.floor((ox + CS - 1) / SITE); i++)
      for (let j = Math.floor(oy / SITE); j <= Math.floor((oy + CS - 1) / SITE); j++)
        for (let k = Math.floor(oz / SITE); k <= Math.floor((oz + CS - 1) / SITE); k++) {
          const s = siteIn(i, j, k);
          if (!s) continue;
          const [x0, y0, z0, x1, y1, z1] = s.box;
          if (x1 < ox || x0 >= ox + CS || y1 < oy || y0 >= oy + CS || z1 < oz || z0 >= oz + CS) continue;
          if (settle.all.length && settle.covers(s.box)) continue; // their places win over the miners'
          stampSite(s, put);
          stamped = true;
        }
    // The remnants: small, unmarked, everywhere (not where a planted room stands).
    for (let i = Math.floor(ox / REM); i <= Math.floor((ox + CS - 1) / REM); i++)
      for (let j = Math.floor(oy / REM); j <= Math.floor((oy + CS - 1) / REM); j++)
        for (let k = Math.floor(oz / REM); k <= Math.floor((oz + CS - 1) / REM); k++) {
          const r = remnantIn(i, j, k);
          if (!r) continue;
          const [x0, y0, z0, x1, y1, z1] = r.box;
          if (x1 < ox || x0 >= ox + CS || y1 < oy || y0 >= oy + CS || z1 < oz || z0 >= oz + CS) continue;
          if (structures.some((t) => boxesMeet(r.box, [t.x - 1, t.y - 1, t.z - 1, t.x + ROOM.w, t.y + ROOM.h, t.z + ROOM.d]))) continue;
          if (settle.all.length && settle.covers(r.box)) continue;
          stampRemnant(r, put);
          stamped = true;
        }
    // Their settlements (round 8): the districts placed so far, each stamped where it overlaps this chunk.
    if (settle.all.length && settle.stampChunk(data, ox, oy, oz, CS)) stamped = true;
    // A corridor dug under a lava pool gets the pool's floor back.
    if (stamped && oy < -40)
      for (let y = 0; y < CS; y++)
        for (let z = 0; z < CS; z++)
          for (let x = 0; x < CS; x++) {
            const i = x + z * CS + y * CS * CS;
            if (data[i] !== B.AIR) continue;
            const wy = oy + y + 1;
            const lavaAbove = y < CS - 1 ? data[i + CS * CS] === B.LAVA : anyCave && at(x, y + 1, z) && wy < -40 && wy <= lavaLevel(ox + x, oz + z, wy) && !(settle.all.length && settle.writes(ox + x, wy, oz + z));
            if (lavaAbove) data[i] = B.DEEP;
          }
    // The shafts of daylight, then the base (both before the planted rooms, which win where they meet).
    for (let i = Math.floor((ox - 12) / SKY); i <= Math.floor((ox + CS + 12) / SKY); i++)
      for (let k = Math.floor((oz - 12) / SKY); k <= Math.floor((oz + CS + 12) / SKY); k++) {
        const s = skylightIn(i, k);
        if (s && Math.abs(s.x - (ox + 8)) < 8 + s.r + 7 && Math.abs(s.z - (oz + 8)) < 8 + s.r + 7) carveSkylight(s, data, ox, oy, oz);
      }
    const b = base();
    const [bx0, by0, bz0, bx1, by1, bz1] = b.box;
    if (!(bx1 < ox || bx0 >= ox + CS || by1 < oy || by0 >= oy + CS || bz1 < oz || bz0 >= oz + CS)) stampShip(data, ox, oy, oz);
    for (const s of structures) stamp(s, data, ox, oy, oz);
    return data;
  }

  // ── What people left down here: a miner's cabin in a pocket of rock, a hamlet in a hollow of its own, old mine
  // corridors propped with logs, crystal geodes, a small shrine round a cache. At most one site in each 48-block
  // cell, decided from the cell alone (so every chunk agrees) and kept inside it.
  const siteCache = new Map();
  function siteIn(i, j, k) {
    const ck = `${i},${j},${k}`;
    if (siteCache.has(ck)) return siteCache.get(ck);
    let s = null;
    const h = (n) => hash3(i * 31 + n, j, k, seed + 101);
    const x = i * SITE + 12 + Math.floor(h(1) * 24), z = k * SITE + 12 + Math.floor(h(2) * 24);
    let y = j * SITE + 14 + Math.floor(h(3) * 20);
    const depth = height(x, z) - y;
    const r = h(4);
    // Round 5 added the lairs (a nest round a hoard: "dangerous enemy areas" for the nukes and cluster bombs) and the
    // vaults (sealed rune rooms with good ammo inside: more secret rooms, everywhere, not only round where you start).
    let type = depth < 16 ? null : r < 0.22 ? 'cabin' : r < 0.34 ? 'mine' : r < 0.43 && depth > 30 ? 'geode' : r < 0.49 ? 'shrine' : r < 0.55 && depth > 26 ? 'hamlet' : r < 0.64 && depth > 24 ? 'lair' : r < 0.77 && depth > 18 ? 'vault' : null;
    // Nothing floats: a site stands on rock (a geode sits inside it), so try a few heights in the cell for one with
    // ground under it, and leave the cell empty if none has. (Round 3 put a quarter of them over a cavern.)
    if (type && type !== 'mine') {
      const ys = [y, ...[1, 2, 3].map((t) => j * SITE + 14 + Math.floor(hash3(i * 31 + 3, j + t * 7, k, seed + 103) * 20))];
      y = ys.find((yy) => height(x, z) - yy >= 16 && grounded(type, x, yy, z));
      if (y === undefined) type = null;
    }
    if (type) {
      s = { type, x, y, z, salt: h(5), turn: Math.floor(h(6) * 4), axis: h(7) < 0.5 ? 'x' : 'z', branch: h(8) < 0.5 };
      if (type === 'mine') {
        // A corridor runs the length of its cell, through the middle.
        if (s.axis === 'x') s.x = i * SITE + 24;
        else s.z = k * SITE + 24;
      }
      const R = { cabin: 4, hamlet: 12, geode: 6, shrine: 4, mine: 20, lair: 12, vault: 3 }[type];
      const across = type === 'mine' ? (s.branch ? 12 : 2) : R;
      const [rx, rz] = type === 'mine' && s.axis === 'z' ? [across, R] : type === 'mine' ? [R, across] : [R, R];
      s.box = [s.x - rx, y - (type === 'geode' ? 6 : 1), s.z - rz, s.x + rx, y + (type === 'hamlet' || type === 'lair' ? 9 : 6), s.z + rz];
      // A lair's two ways in: tunnels out from the hollow, kept inside the cell (so every chunk they cross draws them).
      if (type === 'lair') {
        s.exits = [s.salt * Math.PI * 2, s.salt * Math.PI * 2 + Math.PI + 0.7].map((a) => {
          const ex = Math.max(i * SITE + 1, Math.min(i * SITE + SITE - 2, Math.round(x + Math.cos(a) * 24)));
          const ez = Math.max(k * SITE + 1, Math.min(k * SITE + SITE - 2, Math.round(z + Math.sin(a) * 24)));
          return [ex, ez];
        });
        s.box = [i * SITE, y - 1, k * SITE, i * SITE + SITE - 1, y + 9, k * SITE + SITE - 1];
        s.key = `lair:${i},${j},${k}`;
      }
      if (type === 'vault') s.key = `vault:${i},${j},${k}`;
      // The logbook: in most cabins, always in a hamlet (on the square) and in a vault.
      if (type === 'cabin' && s.salt < 0.65) s.lectern = cabinCell(s, 2, 1, -2);
      if (type === 'hamlet') s.lectern = [x + 2, y + 1, z];
      if (type === 'vault') s.lectern = [x - 2, y + 1, z - 2];
      if (s.lectern) s.note = NOTES[Math.floor(hash3(i, j, k, seed + 107) * NOTES.length)];
    }
    if (siteCache.size > 20000) siteCache.clear();
    siteCache.set(ck, s);
    return s;
  }
  // Is the cave open at this cell (before anything is built)? Sampled cell by cell, so kept to a few dozen calls.
  const open = (x, y, z) => cave(x, y, z, height(x, z));
  // Is there rock under a site's footprint (every other cell of it), and for a geode, rock all round it?
  function grounded(type, x, y, z) {
    const R = { cabin: 4, shrine: 4, hamlet: 11, lair: 11, geode: 6, vault: 3 }[type];
    let n = 0, gaps = 0;
    for (let dz = -R; dz <= R; dz += 2)
      for (let dx = -R; dx <= R; dx += 2) {
        if ((type === 'hamlet' || type === 'lair') && dx * dx + dz * dz > R * R) continue;
        n++;
        if (open(x + dx, type === 'geode' ? y - 7 : type === 'hamlet' || type === 'lair' ? y - 2 : y - 1, z + dz)) gaps++;
      }
    if (gaps > n * 0.08) return false;
    // A vault is sealed: rock all round it, so it is found by its glow through a crack, or by digging.
    if (type === 'vault') {
      for (const [dx, dy, dz] of [[4, 2, 0], [-4, 2, 0], [0, 2, 4], [0, 2, -4], [0, 6, 0], [3, 4, 3], [-3, 4, -3]]) if (open(x + dx, y + dy, z + dz)) return false;
      return true;
    }
    if (type !== 'geode') return true;
    for (const [dx, dy, dz] of [[7, 0, 0], [-7, 0, 0], [0, 0, 7], [0, 0, -7], [0, 7, 0], [5, 4, 5], [-5, 4, -5], [5, -4, -5], [-5, -4, 5]]) if (open(x + dx, y + dy, z + dz)) return false;
    return true;
  }

  // A cell of a cabin, from its own frame (door on +z) to the world's, turned a quarter at a time.
  const turnXZ = (t, dx, dz) => [[dx, dz], [-dz, dx], [-dx, -dz], [dz, -dx]][t & 3];
  function cabinCell(s, dx, dy, dz, at = s) {
    const [a, b] = turnXZ(s.turn, dx, dz);
    return [at.x + a, at.y + dy, at.z + b];
  }

  function stampSite(s, put) {
    if (s.type === 'cabin') cabin(s, put, true);
    else if (s.type === 'shrine') shrine(s, put);
    else if (s.type === 'geode') geode(s, put);
    else if (s.type === 'mine') mine(s, put);
    else if (s.type === 'hamlet') hamlet(s, put);
    else if (s.type === 'lair') lair(s, put);
    else if (s.type === 'vault') vault(s, put);
  }

  // Seven by seven, logs at the corners, plank walls and roof, a door, two windows, a crate and a torch inside.
  function cabin(s, put, pocket) {
    const P = (dx, dy, dz, id) => put(...cabinCell(s, dx, dy, dz), id);
    const torch = (dx, dy, dz, fx, fz) => {
      const [a, b] = turnXZ(s.turn, fx, fz);
      P(dx, dy, dz, torchFor([a, 0, b]));
    };
    if (pocket)
      for (let dy = 0; dy <= 5; dy++)
        for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) P(dx, dy, dz, dy === 0 ? B.COBBLE : B.AIR);
    for (let dy = 0; dy <= 4; dy++)
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) {
          const ex = Math.abs(dx) === 3, ez = Math.abs(dz) === 3;
          let id = B.AIR;
          if (dy === 0 || dy === 4) id = B.PLANKS;
          else if (ex && ez) id = B.LOG;
          else if (ex || ez) id = B.PLANKS;
          if (dz === 3 && dx === 0 && dy <= 2 && dy > 0) id = B.AIR; // the door
          if (ex && dz === 0 && dy === 2) id = B.AIR; // the windows
          P(dx, dy, dz, id);
        }
    P(-2, 1, -2, B.CRATE);
    if (s.salt > 0.8) P(-2, 1, 2, B.CACHE);
    torch(2, 2, 0, -1, 0);
    torch(1, 2, 4, 0, 1);
    if (s.lectern) put(...s.lectern, B.LECTERN);
  }

  function shrine(s, put) {
    const { x, y, z } = s;
    for (let dy = 0; dy <= 6; dy++)
      for (let dz = -4; dz <= 4; dz++)
        for (let dx = -4; dx <= 4; dx++) {
          const ax = Math.abs(dx), az = Math.abs(dz);
          let id = dy === 0 ? (ax <= 3 && az <= 3 ? B.PILLAR : B.COBBLE) : B.AIR;
          if (ax === 2 && az === 2 && dy >= 1 && dy <= 4) id = B.PILLAR;
          if (dy === 5 && ax <= 2 && az <= 2) id = B.PILLAR;
          if (dy === 5 && ax + az === 0) id = B.RUNE;
          put(x + dx, y + dy, z + dz, id);
        }
    put(x, y + 1, z, B.PILLAR);
    put(x, y + 2, z, s.salt < 0.75 ? B.CACHE : B.CRATE);
    put(x + 3, y + 1, z, B.TORCH);
    put(x - 3, y + 1, z, B.TORCH);
  }

  // A hollow ball: deepstone outside, a shell of crystal (it lights the whole inside), air within.
  function geode(s, put) {
    const { x, y, z } = s;
    const R = 5.5;
    for (let dy = -6; dy <= 6; dy++)
      for (let dz = -6; dz <= 6; dz++)
        for (let dx = -6; dx <= 6; dx++) {
          const d = Math.hypot(dx, dy * 1.1, dz) + hash3(x + dx, y + dy, z + dz, seed + 108) * 0.5;
          if (d > R) continue;
          put(x + dx, y + dy, z + dz, d > R - 1 ? B.DEEP : d > R - 2 ? B.CRYSTAL : B.AIR);
        }
    if (s.salt < 0.6) {
      put(x, y - 3, z, B.CRYSTAL);
      put(x, y - 2, z, B.CACHE);
    }
  }

  // A corridor three wide and three high, propped every four blocks with log posts and a plank beam, a plank floor
  // where it crosses a cave, a torch on a board every eight, a crate here and there; sometimes a branch across.
  function mine(s, put) {
    const run = (along, half, ox0, oz0) => {
      const cell = (t, u) => (along === 'x' ? [ox0 + t, oz0 + u] : [ox0 + u, oz0 + t]);
      for (let t = -half; t <= half; t++) {
        for (let u = -1; u <= 1; u++) {
          const [cx, cz] = cell(t, u);
          put(cx, s.y, cz, B.PLANKS, true);
          for (let dy = 1; dy <= 3; dy++) put(cx, s.y + dy, cz, B.AIR);
        }
        // Where the two corridors cross, neither props nor furnishes (a post there stands in the other's way).
        if (s.branch && Math.abs(t) <= 2) continue;
        if (t % 4 === 0) {
          for (const u of [-1, 1]) for (let dy = 1; dy <= 2; dy++) put(...xyz(cell(t, u), s.y + dy), B.LOG);
          for (let u = -1; u <= 1; u++) put(...xyz(cell(t, u), s.y + 3), B.PLANKS);
        } else if ((t + 400) % 8 === 2) {
          const side = hash3(ox0 + t, s.y, oz0, seed + 109) < 0.5 ? 1 : -1;
          put(...xyz(cell(t, side * 2), s.y + 2), B.PLANKS);
          const [cx, cz] = cell(t, side);
          const [wx, wz] = cell(t, side * 2);
          put(cx, s.y + 2, cz, torchFor([cx - wx, 0, cz - wz]));
        } else {
          const r = hash3(ox0 + t, s.y + 1, oz0, seed + 110);
          if (r < 0.06) put(...xyz(cell(t, r < 0.03 ? 1 : -1), s.y + 1), r < 0.012 ? B.CACHE : B.CRATE);
        }
      }
    };
    const xyz = ([cx, cz], y) => [cx, y, cz];
    run(s.axis, 20, s.x, s.z);
    if (s.branch) run(s.axis === 'x' ? 'z' : 'x', 12, s.x, s.z);
  }

  // A hollow with a flat floor, paths crossing it, three cabins round a lamp post, and a logbook on the square.
  function hamlet(s, put) {
    const { x, y, z } = s;
    const R = 11.5;
    for (let dy = -1; dy <= 9; dy++)
      for (let dz = -12; dz <= 12; dz++)
        for (let dx = -12; dx <= 12; dx++) {
          const flat = (dx * dx + dz * dz) / (R * R);
          if (dy <= 0) {
            if (flat < 1) put(x + dx, y + dy, z + dz, dy < 0 ? B.STONE : Math.abs(dx) <= 1 || Math.abs(dz) <= 1 ? B.COBBLE : B.DIRT);
          } else if (flat + ((dy - 1) / 8.5) ** 2 < 1) put(x + dx, y + dy, z + dz, B.AIR);
        }
    for (let n = 0; n < 3; n++) {
      // Each cabin stands on a diagonal (clear of the paths), its door turned to the square.
      const [sx, sz] = [[1, 1], [-1, 1], [1, -1], [-1, -1]][(n + Math.floor(s.salt * 4)) % 4];
      cabin({ x: x + sx * 5, y, z: z + sz * 5, turn: sz > 0 ? 2 : 0, salt: (s.salt * 7 + n * 0.37) % 1 }, put, false);
    }
    for (let dy = 1; dy <= 3; dy++) put(x, y + dy, z, B.LOG);
    put(x, y + 4, z, B.TORCH);
    for (const [dx, dz] of [[9, 0], [-9, 0], [0, 9], [0, -9]]) {
      put(x + dx, y + 1, z + dz, B.LOG);
      put(x + dx, y + 2, z + dz, B.TORCH);
    }
    put(x - 3, y + 1, z + 1, B.CRATE);
    put(x + 3, y + 1, z - 1, B.CRATE);
    put(...s.lectern, B.LECTERN);
  }

  // A lair: a rough hollow with a floor of deepstone and gravel, glow moss in patches, rock spikes round a mound with
  // the hoard on it (three glowing caches), and two tunnels in. What lives there the game puts in when you come near.
  function lair(s, put) {
    const { x, y, z } = s;
    const R = 12;
    for (let dy = -1; dy <= 9; dy++)
      for (let dz = -13; dz <= 13; dz++)
        for (let dx = -13; dx <= 13; dx++) {
          // The wall wanders in and out by sector.
          const a = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 12);
          const rr = R * (0.82 + hash3(a, 3, 0, seed + 301 + Math.floor(s.salt * 1000)) * 0.26);
          const flat = (dx * dx + dz * dz) / (rr * rr);
          if (flat >= 1) continue;
          if (dy < 0) put(x + dx, y + dy, z + dz, B.STONE);
          else if (dy === 0) {
            const r = hash3(x + dx, y, z + dz, seed + 302);
            put(x + dx, y, z + dz, r < 0.25 ? B.GRAVEL : r < 0.32 ? B.GLOWMOSS : B.DEEP);
          } else if (flat + ((dy - 1) / 8) ** 2 < 1) put(x + dx, y + dy, z + dz, B.AIR);
        }
    // The mound and the hoard.
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) put(x + dx, y + 1, z + dz, B.DEEP);
    put(x - 1, y + 2, z, B.CACHE);
    put(x + 1, y + 2, z, B.CACHE);
    put(x, y + 2, z + 1, B.CACHE);
    // Spikes round it.
    for (let n = 0; n < 7; n++) {
      const a = (n / 7) * Math.PI * 2 + s.salt;
      const px = Math.round(x + Math.cos(a) * 6), pz = Math.round(z + Math.sin(a) * 6);
      const h = 2 + Math.floor(hash3(px, y, pz, seed + 303) * 3);
      for (let dy = 1; dy <= h; dy++) put(px, y + dy, pz, dy === h ? B.GLOWMOSS : B.DEEP);
    }
    // The ways in: two blocks wide, three high, at floor level.
    for (const [ex, ez] of s.exits) {
      const L = Math.hypot(ex - x, ez - z);
      for (let t = 0; t <= L; t += 0.5) {
        const cx = x + ((ex - x) * t) / L, cz = z + ((ez - z) * t) / L;
        for (const [ox, oz] of [[0, 0], [1, 0], [0, 1]])
          for (let dy = 1; dy <= 3; dy++) put(Math.floor(cx) + ox, y + dy, Math.floor(cz) + oz, B.AIR);
      }
    }
  }

  // A vault: a sealed room of rune stone (it glows, so a crack in the rock shows it), a cache of something good on a
  // plinth, a crate or two, and a logbook.
  function vault(s, put) {
    const { x, y, z } = s;
    for (let dy = 0; dy <= 5; dy++)
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) {
          const shell = Math.abs(dx) === 3 || Math.abs(dz) === 3 || dy === 0 || dy === 5;
          put(x + dx, y + dy, z + dz, shell ? (dy === 0 ? B.FLOOR : B.RUNE) : B.AIR);
        }
    put(x, y + 1, z, B.PILLAR);
    put(x, y + 2, z, B.CACHE);
    put(x + 2, y + 1, z + 2, B.CRATE);
    if (s.salt < 0.5) put(x + 2, y + 1, z - 2, B.CRATE);
    put(...s.lectern, B.LECTERN);
  }

  // ── The remnants (round 7, DIG-004). The play-tester: "It'd be cool to increase the number of hidden rooms too, like the
  // one I said there with just a weapons box." Small things left in the rock, unmarked, at most one in each 20-block
  // cell, decided from the cell alone (every chunk agrees) and kept inside it: wayside shrines in five shapes, sealed
  // caches, a buried stair going nowhere, a carved niche, a vent shaft, a lone statue. Each stands on rock (tried at
  // three heights in the cell, else none), and none goes where a bigger site, a shaft of daylight or a planted room is.
  // The pulse finds them (worked stone reads gold); nothing points at them.
  const REM_KINDS = [['shrine', 0.34], ['cache', 0.5], ['statue', 0.64], ['niche', 0.77], ['stair', 0.89], ['vent', 1]];
  const REM_R = { shrine: 2, cache: 1, statue: 2, niche: 2, stair: 1, vent: 1 };
  const remCache = new Map();
  const boxesMeet = (a, b) => !(a[3] < b[0] || a[0] > b[3] || a[4] < b[1] || a[1] > b[4] || a[5] < b[2] || a[2] > b[5]);
  function remnantIn(i, j, k) {
    const ck = `${i},${j},${k}`;
    if (remCache.has(ck)) return remCache.get(ck);
    let r = null;
    const h = (n) => hash3(i * 29 + n, j * 7 + 3, k, seed + 401);
    if (h(0) < 0.7) {
      const type = REM_KINDS.find(([, p]) => h(4) < p)[0];
      const R = REM_R[type];
      // (A stair runs seven blocks one way: it starts near the cell's middle so it stays inside the cell.)
      const span = type === 'stair' ? 4 : REM - 8, from = type === 'stair' ? 8 : 4;
      const x = i * REM + from + Math.floor(h(1) * span), z = k * REM + from + Math.floor(h(2) * span);
      const top = type === 'vent' ? 11 : type === 'stair' ? 9 : 5;
      for (let t = 0; t < 3 && !r; t++) {
        const y = j * REM + 2 + Math.floor(hash3(i * 29 + 3, j * 7 + t * 11, k, seed + 402) * (REM - top - 3));
        if (height(x, z) - (y + top) < 8) continue; // well under the ground, top and all
        const c = { type, x, y, z, R, salt: h(5), turn: Math.floor(h(6) * 4) };
        const reach = R + (type === 'stair' ? 7 : 1); // a stair may run any of four ways
        c.box = [x - reach, y - 1, z - reach, x + reach, y + top, z + reach];
        if (!remGrounded(c)) continue;
        if (remClashes(c)) continue;
        r = c;
      }
    }
    if (remCache.size > 40000) remCache.clear();
    remCache.set(ck, r);
    return r;
  }
  // Rock under the footprint (at most one sampled cell open); a sealed cache wants rock all round it as well.
  function remGrounded(c) {
    const { x, y, z, R } = c;
    let gaps = 0, n = 0;
    for (let dz = -R; dz <= R + (c.type === 'stair' ? 6 : 0); dz++)
      for (let dx = -R; dx <= R; dx++) {
        if ((dx + dz) & 1) continue;
        n++;
        // In the remnant's own frame, turned as it will be built; a stair's steps climb, so its ground climbs too.
        const [a, b] = turnXZ(c.turn, dx, dz);
        const lift = c.type === 'stair' ? Math.max(0, dz) : 0;
        // (Under the worked floor at y - 1; a sealed cache's floor is its own bottom layer, at y.)
        if (open(x + a, (c.type === 'cache' ? y - 1 : y - 2) + lift, z + b)) gaps++;
      }
    if (gaps > Math.max(0, Math.floor(n * 0.1))) return false;
    if (c.type === 'cache') for (const [dx, dy, dz] of [[2, 1, 0], [-2, 1, 0], [0, 1, 2], [0, 1, -2], [0, 3, 0]]) if (open(x + dx, y + dy, z + dz)) return false;
    return true;
  }
  // Clear of the bigger sites (any site cell the box reaches) and of the shafts of daylight.
  function remClashes(c) {
    const [x0, y0, z0, x1, y1, z1] = c.box;
    for (let i = Math.floor(x0 / SITE); i <= Math.floor(x1 / SITE); i++)
      for (let j = Math.floor(y0 / SITE); j <= Math.floor(y1 / SITE); j++)
        for (let k = Math.floor(z0 / SITE); k <= Math.floor(z1 / SITE); k++) {
          const s = siteIn(i, j, k);
          if (s && boxesMeet(c.box, [s.box[0] - 1, s.box[1] - 1, s.box[2] - 1, s.box[3] + 1, s.box[4] + 1, s.box[5] + 1])) return true;
        }
    for (const s of skylightsNear(c.x, c.z, 20)) if (Math.hypot(s.x - c.x, s.z - c.z) < s.r + 9 && y1 >= s.floor - 6) return true;
    return false;
  }
  // Every remnant whose cell lies in a box (for the census and the checks).
  function remnantsIn(x0, y0, z0, x1, y1, z1) {
    const out = [];
    for (let i = Math.floor(x0 / REM); i <= Math.floor(x1 / REM); i++)
      for (let j = Math.floor(y0 / REM); j <= Math.floor(y1 / REM); j++)
        for (let k = Math.floor(z0 / REM); k <= Math.floor(z1 / REM); k++) {
          const r = remnantIn(i, j, k);
          if (r) out.push(r);
        }
    return out;
  }
  function stampRemnant(c, put) {
    const P = (dx, dy, dz, id) => put(...cabinCell(c, dx, dy, dz), id);
    // A pocket of air over a worked floor: the room most of them stand in.
    const pocket = (R, H, floor = B.FLOOR) => {
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          P(dx, -1, dz, floor);
          for (let dy = 0; dy < H; dy++) P(dx, dy, dz, B.AIR);
        }
    };
    if (c.type === 'shrine') {
      const v = Math.floor(c.salt * 5);
      pocket(2, 4, v === 0 ? B.COBBLE : B.FLOOR);
      if (v === 0) {
        // A cairn.
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (Math.abs(dx) + Math.abs(dz) < 2) P(dx, 0, dz, B.COBBLE);
        P(0, 1, 0, B.COBBLE);
        P(0, 2, 0, B.PILLAR);
      } else if (v === 1) {
        // An arch over nothing.
        for (const dx of [-1, 1]) for (let dy = 0; dy <= 2; dy++) P(dx, dy, 0, B.PILLAR);
        for (let dx = -1; dx <= 1; dx++) P(dx, 3, 0, B.PILLAR);
      } else if (v === 2) {
        // An altar with a glowing stone on it.
        P(0, 0, 0, B.PILLAR);
        P(0, 1, 0, B.RUNE);
      } else if (v === 3) {
        // A ring of stubs round a box.
        for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1]]) P(dx, 0, dz, B.PILLAR);
        P(0, 0, 0, c.salt * 7 % 1 < 0.45 ? B.CACHE : B.CRATE);
      } else {
        // A post with a crate at its foot.
        for (let dy = 0; dy <= 2; dy++) P(0, dy, 0, B.PILLAR);
        P(0, 3, 0, B.RUNE);
        P(1, 0, 1, B.CRATE);
      }
    } else if (c.type === 'cache') {
      // Sealed in the rock: a box of worked stone with one glowing cache inside it, nothing else.
      for (let dy = 0; dy <= 2; dy++)
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) P(dx, dy, dz, dy === 0 ? B.FLOOR : B.PILLAR);
      P(0, 1, 0, B.CACHE);
    } else if (c.type === 'statue') {
      // A lone figure, life size, in a pocket of its own.
      pocket(2, 5);
      for (let dy = 0; dy <= 1; dy++) P(0, dy, 0, B.PILLAR);
      for (let dy = 2; dy <= 3; dy++) P(0, dy, 0, B.PILLAR);
      for (const dx of [-1, 1]) {
        P(dx, 3, 0, B.PILLAR);
        P(dx, 2, 0, B.PILLAR);
      }
      P(0, 4, 0, B.PILLAR);
    } else if (c.type === 'niche') {
      // A niche cut into the rock, framed, with a crate in it.
      for (let dz = -1; dz <= 0; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          P(dx, -1, dz, B.FLOOR);
          for (let dy = 0; dy <= 2; dy++) P(dx, dy, dz, B.AIR);
        }
      for (const dx of [-2, 2]) for (let dy = -1; dy <= 3; dy++) P(dx, dy, 1, B.PILLAR);
      for (let dx = -2; dx <= 2; dx++) P(dx, 3, 1, B.PILLAR);
      for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 2; dy++) P(dx, dy, 1, B.AIR);
      P(0, 0, -1, c.salt < 0.4 ? B.CACHE : B.CRATE);
    } else if (c.type === 'stair') {
      // A stair two wide, climbing seven steps to nowhere.
      for (let t = 0; t <= 6; t++)
        for (let dx = 0; dx <= 1; dx++) {
          P(dx, t - 1, t, B.FLOOR);
          for (let dy = t; dy <= t + 2; dy++) P(dx, dy, t, B.AIR);
        }
    } else if (c.type === 'vent') {
      // A shaft two across and ten high, ringed with stone every third block, on a worked floor.
      for (let dy = -1; dy <= 10; dy++)
        for (let dz = -1; dz <= 2; dz++)
          for (let dx = -1; dx <= 2; dx++) {
            const inside = dx >= 0 && dx <= 1 && dz >= 0 && dz <= 1;
            if (dy === -1) P(dx, dy, dz, inside ? B.FLOOR : B.COBBLE);
            else if (inside) P(dx, dy, dz, B.AIR);
            else if (dy % 3 === 0) P(dx, dy, dz, B.COBBLE);
          }
    }
  }

  // Which kind of place a cache belongs to (a vault's or a lair's is better than one lying about), and its site.
  function lootAt(x, y, z) {
    const s = siteIn(Math.floor(x / SITE), Math.floor(y / SITE), Math.floor(z / SITE));
    if (!s || (s.type !== 'vault' && s.type !== 'lair')) return null;
    const [x0, y0, z0, x1, y1, z1] = s.box;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1 ? s : null;
  }

  // Every site of these types whose centre is within r of p (for the compass and the lairs' garrisons).
  function sitesNear(p, r, types) {
    const out = [];
    for (let i = Math.floor((p.x - r) / SITE); i <= Math.floor((p.x + r) / SITE); i++)
      for (let j = Math.floor((p.y - r) / SITE); j <= Math.floor((p.y + r) / SITE); j++)
        for (let k = Math.floor((p.z - r) / SITE); k <= Math.floor((p.z + r) / SITE); k++) {
          const s = siteIn(i, j, k);
          if (s && types.includes(s.type) && Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z) <= r) out.push(s);
        }
    return out;
  }

  // ── The shafts of daylight (round 5: "it'd be nice to know there's parts of the cave you can get to that have
  // openings to the outside world, like a nice ray of light shining in"). Each 88 × 88 square of the map has one about
  // half the time: a ragged chimney from the grass down to the first cave below it (or 26–46 blocks, with no cave
  // within 70), its mouth flared, a grotto at its foot, and grass on the floor where the light lands. The grappling hook climbs
  // it; the game draws the light coming down it and shows it on the compass.
  const skyCache = new Map();
  function skylightIn(i, k) {
    const ck = `${i},${k}`;
    if (skyCache.has(ck)) return skyCache.get(ck);
    let s = null;
    const h = (n) => hash3(i * 17 + n, 911, k, seed + 211);
    if (h(0) < 0.55) {
      const x = i * SKY + 14 + Math.floor(h(1) * (SKY - 28)), z = k * SKY + 14 + Math.floor(h(2) * (SKY - 28));
      const top = height(x, z);
      const b = base();
      if (top > SEA + 3 && padE(x, z) > 2.2) {
        let bottom = null;
        for (let y = top - 8; y > top - 70; y--)
          if (open(x, y, z)) {
            bottom = y;
            break;
          }
        const alone = bottom === null;
        if (alone) bottom = top - 26 - Math.floor(h(4) * 20);
        let floor = alone ? bottom - 3 : bottom;
        if (!alone) while (floor > bottom - 40 && open(x, floor - 1, z)) floor--;
        s = { x, z, top, bottom, floor, r: 2.2 + h(3) * 1.3, alone, salt: h(5) };
      }
    }
    if (skyCache.size > 4000) skyCache.clear();
    skyCache.set(ck, s);
    return s;
  }
  // The chimney's centre and radius at a height: it jogs a little every six blocks (the jogs leave lips the hook can
  // stand you on) and flares out at the mouth.
  function shaftAt(s, y) {
    const seg = Math.floor((s.top - y) / 6);
    const ox = (hash3(seg, 1, 0, seed + 212 + Math.floor(s.salt * 997)) - 0.5) * 2.4, oz = (hash3(seg, 2, 0, seed + 212 + Math.floor(s.salt * 997)) - 0.5) * 2.4;
    const flare = Math.max(0, y - (s.top - 3)) * 0.9;
    return { cx: s.x + 0.5 + (y > s.top - 3 ? 0 : ox), cz: s.z + 0.5 + (y > s.top - 3 ? 0 : oz), r: s.r + hash3(seg, 3, 0, seed + 213) * 0.8 + flare };
  }
  function skylightsNear(x, z, r) {
    const out = [];
    for (let i = Math.floor((x - r) / SKY); i <= Math.floor((x + r) / SKY); i++)
      for (let k = Math.floor((z - r) / SKY); k <= Math.floor((z + r) / SKY); k++) {
        const s = skylightIn(i, k);
        if (s && Math.hypot(s.x - x, s.z - z) <= r) out.push(s);
      }
    return out;
  }
  function carveSkylight(s, data, ox, oy, oz) {
    const y0 = Math.max(oy, s.floor - 2), y1 = Math.min(oy + CS - 1, s.top + 12);
    if (y0 > y1) return;
    const R = Math.ceil(s.r + 6);
    const at = (x, y, z) => (x - ox) + (z - oz) * CS + (y - oy) * CS * CS;
    const inside = (x, y, z) => x >= ox && x < ox + CS && y >= oy && y < oy + CS && z >= oz && z < oz + CS;
    for (let z = Math.max(oz, s.z - R); z <= Math.min(oz + CS - 1, s.z + R); z++)
      for (let x = Math.max(ox, s.x - R); x <= Math.min(ox + CS - 1, s.x + R); x++)
        for (let y = y0; y <= y1; y++) {
          let cut = false;
          if (y >= s.bottom) {
            const c = shaftAt(s, Math.min(y, s.top + 1));
            cut = Math.hypot(x + 0.5 - c.cx, z + 0.5 - c.cz) < c.r;
          }
          // A grotto where the light lands, flat-floored, opening into the cave the shaft found (the first open cell
          // down the column can be a sliver of a narrow passage, and the light then lands nowhere).
          if (!cut && y >= s.floor) cut = Math.hypot(x - s.x, (y - (s.floor + 2.5)) * 1.5, z - s.z) < 5.5;
          if (cut) data[at(x, y, z)] = B.AIR;
        }
    // Grass where the light lands: the floor cells round the bottom with open air over them.
    for (let z = Math.max(oz, s.z - R); z <= Math.min(oz + CS - 1, s.z + R); z++)
      for (let x = Math.max(ox, s.x - R); x <= Math.min(ox + CS - 1, s.x + R); x++) {
        if (Math.hypot(x - s.x, z - s.z) > s.r + 3.5) continue;
        for (let y = s.floor - 2; y <= s.floor + 2; y++) {
          if (!inside(x, y, z) || !inside(x, y + 1, z)) continue;
          const id = data[at(x, y, z)];
          if ((id !== B.STONE && id !== B.DEEP && id !== B.DIRT && id !== B.GRAVEL) || data[at(x, y + 1, z)] !== B.AIR) continue;
          data[at(x, y, z)] = B.GRASS;
          const r = hash3(x, y, z, seed + 214);
          data[at(x, y + 1, z)] = r < 0.3 ? B.TALLGRASS : r < 0.34 ? B.POPPY : r < 0.38 ? B.DANDELION : B.AIR;
        }
      }
  }

  // ── The ship (round 7, DIG-002; it replaced round 5's plank house). The play-tester: "make the 'home base' you come back to
  // when you die a space ship, so it's like you've landed and gone out the hangar to explore the planet, but the ship
  // doesn't do anything. Make it a nice big ship for fun." About 60 blocks nose to tail, 30 across the wings, 14 high,
  // on landing legs, on the levelled pad. The nose points north (-z); the hangar is at the back, its ramp down to the
  // grass. Inside, front to back: the cockpit under a big window, a corridor of lit panels with the crew bunks (a new
  // game starts here) and the med bay (you come round here) either side, then the mess and the workshop (the ship's
  // log on a screen), then the hangar. Built once into a grid in the ship's own frame; each chunk it touches copies its
  // share. Local frame: x across (-16…16), y up from the ground's top block (1…16), z nose to tail (-31…31).
  const SHIP = { X: 16, Y: 16, Z: 31 };
  const KEEP = 0, CLEAR = 255; // in the grid: leave the cell as it is / make it air
  let theBase = null;
  function base() {
    if (!theBase) {
      const { x, z, g } = PAD;
      const at = (lx, ly, lz) => ({ x: x + lx + 0.5, y: g + ly + 0.01, z: z + lz + 0.5 });
      theBase = {
        x, y: g, z,
        // Where a new game starts (in the bunks, facing the door) and where you come round (the med bay).
        bed: { ...at(-4, 5, -16), yaw: -Math.PI / 2 },
        med: { ...at(4, 5, -16), yaw: -Math.PI / 2 },
        log: [x + 6, g + 6, z - 6],
        box: [x - SHIP.X, g + 1, z - SHIP.Z, x + SHIP.X, g + SHIP.Y, z + SHIP.Z],
        lights: [],
        grid: null
      };
      buildShip(theBase);
    }
    return theBase;
  }
  function buildShip(b) {
    const W = SHIP.X * 2 + 1, H = SHIP.Y, L = SHIP.Z * 2 + 1;
    const grid = new Uint8Array(W * H * L);
    const set = (x, y, z, id) => {
      if (Math.abs(x) > SHIP.X || y < 1 || y > SHIP.Y || Math.abs(z) > SHIP.Z) return;
      grid[(x + SHIP.X) + (z + SHIP.Z) * W + (y - 1) * W * L] = id === B.AIR ? CLEAR : id;
    };
    const get = (x, y, z) => grid[(x + SHIP.X) + (z + SHIP.Z) * W + (y - 1) * W * L];
    const box = (x0, y0, z0, x1, y1, z1, id) => {
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, id);
    };
    const DECK = 4; // the deck's own blocks; you stand at 5

    // The body: forward of z = 0 the decks (roof at 9), from z = 0 back the hangar (roof at 11). Hull walls at x = ±7,
    // dark below the window line and light above it, corners bevelled.
    for (let z = -21; z <= 23; z++) {
      const roof = z <= -1 ? 9 : 11;
      for (let y = DECK; y <= roof; y++)
        for (let x = -7; x <= 7; x++) {
          const ax = Math.abs(x);
          if (ax === 7 && (y === DECK || y === roof)) continue; // the bevel
          const shell = ax === 7 || y === DECK || y === roof || z === 23 || (z === 0 && y <= roof);
          let id = B.AIR;
          if (shell) id = y === DECK ? B.DECK : y === roof ? B.HULL : y <= 6 && ax === 7 ? B.HULL_DARK : B.HULL;
          // The forward decks' roof meets the hangar's taller front wall: the bulkhead at z = 0 is a wall, not a shell all through.
          if (z === 0 && ax < 7 && y > DECK && y < roof) id = B.HULL;
          set(x, y, z, id);
        }
      // Portholes down both sides.
      if (z % 4 === 0 && z !== 0 && z !== 23) for (const sx of [-7, 7]) set(sx, z < 0 ? 7 : 8, z, B.GLASS);
    }
    // The cockpit: the nose tapers and drops, a big window over it (glass on top, the sides and the front from the
    // window line up, a strut every third block).
    // (The shell is every cell of the shape with a face or an edge on the outside, so the tapering walls join face
    // to face, never only at a corner.)
    const nose = (z) => {
      const t = (z + 30) / 8;
      return { hw: Math.round(2 + 5 * t), roof: Math.round(6 + 3 * t), floor: z <= -28 ? DECK + 1 : DECK };
    };
    const inNose = (x, y, z) => {
      if (z >= -21) return Math.abs(x) <= 7 && y >= DECK && y <= 9; // the body behind it
      if (z < -30) return false;
      const { hw, roof, floor } = nose(z);
      const ax = Math.abs(x);
      if (ax > hw || y < floor || y > roof) return false;
      return !(ax === hw && (y === floor || y === roof) && hw > 2);
    };
    for (let z = -30; z <= -22; z++) {
      const { hw, roof, floor } = nose(z);
      for (let y = floor; y <= roof; y++)
        for (let x = -hw; x <= hw; x++) {
          if (!inNose(x, y, z)) continue;
          let shell = false;
          for (let dz = -1; dz <= 1 && !shell; dz++)
            for (let dy = -1; dy <= 1 && !shell; dy++)
              for (let dx = -1; dx <= 1 && !shell; dx++)
                if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 2 && !inNose(x + dx, y + dy, z + dz)) shell = true;
          let id = B.AIR;
          if (shell) {
            const ax = Math.abs(x);
            const strut = (ax % 3 === 0 && y >= roof - 1) || (ax >= hw - 1 && z % 3 === 0);
            if (y === floor || (y === floor + 1 && ax >= hw - 1 && y < 6)) id = B.DECK;
            else if (y >= 6 && !strut) id = B.GLASS;
            else id = y <= 6 ? B.HULL_DARK : B.HULL;
          }
          set(x, y, z, id);
        }
    }
    // Between the cockpit and the corridor, a bulkhead with a doorway.
    for (let y = DECK + 1; y <= 8; y++) for (let x = -6; x <= 6; x++) set(x, y, -21, Math.abs(x) <= 1 && y <= 7 ? B.AIR : B.HULL);
    // The partitions down the corridor (x = ±2), the walls between the forward rooms (z = -11), the doorways.
    for (let z = -20; z <= -1; z++) for (let y = DECK + 1; y <= 8; y++) for (const x of [-2, 2]) set(x, y, z, B.HULL);
    for (let y = DECK + 1; y <= 8; y++) for (const x of [-6, -5, -4, -3, 3, 4, 5, 6]) set(x, y, -11, B.HULL);
    for (const x of [-2, 2]) for (const z of [-16, -15, -6, -5]) for (const y of [5, 6]) set(x, y, z, B.AIR);
    // The doorway from the corridor into the hangar.
    for (let x = -1; x <= 1; x++) for (let y = 5; y <= 7; y++) set(x, y, 0, B.AIR);
    // Lit panels down the corridor (they light the rooms behind them too), and one in the ceiling of each room.
    for (const z of [-19, -13, -9, -3]) for (const x of [-2, 2]) set(x, 7, z, B.PANEL);
    for (const [x, z] of [[-4, -16], [4, -16], [-4, -6], [4, -6], [0, -12], [0, -4]]) set(x, 9, z, B.PANEL);

    // The crew bunks (west, forward): two bunks, an upper and a lower, along the hull; a crate of stores.
    for (const z of [-19, -18, -14, -13]) {
      set(-6, 5, z, B.BUNK);
      set(-6, 7, z, B.BUNK);
    }
    set(-3, 5, -20, B.CRATE);
    // The med bay (east, forward): two beds, a console.
    for (const z of [-19, -18, -14, -13]) set(6, 5, z, B.MEDBED);
    set(3, 5, -20, B.CONSOLE);
    set(6, 5, -12, B.CONSOLE);
    // The mess (west, aft): a table and four seats.
    box(-5, 5, -9, -4, 5, -8, B.DECK);
    for (const [x, z] of [[-6, -9], [-6, -8], [-3, -9], [-3, -8]]) set(x, 5, z, B.SEAT);
    set(-6, 5, -2, B.CRATE);
    set(-6, 5, -1, B.CRATE);
    // The workshop (east, aft): the log on a screen over a console, a bench, crates.
    set(6, 5, -6, B.CONSOLE);
    set(6, 6, -6, B.SCREEN);
    box(5, 5, -10, 6, 5, -9, B.DECK);
    set(6, 5, -2, B.CRATE);
    set(6, 5, -1, B.CRATE);
    set(6, 6, -1, B.CRATE);
    // The cockpit: a console bank under the window, two seats behind it with their backs.
    for (let x = -3; x <= 3; x++) set(x, 5, -27, B.CONSOLE);
    for (const x of [-2, 2]) {
      set(x, 5, -25, B.SEAT);
      set(x, 5, -24, B.HULL_DARK); // the seat's back
      set(x, 6, -24, B.HULL_DARK);
    }

    // The hangar: crates along the walls, a console by the door, lit panels high on the walls and in the roof,
    // hazard stripes at the ramp, and the ramp's opening in the back wall (seven wide, four high).
    for (const [x, y, z] of [[-6, 5, 3], [-6, 5, 4], [-6, 6, 3], [-5, 5, 3], [6, 5, 10], [6, 5, 11], [6, 6, 10], [-6, 5, 16]]) set(x, y, z, B.CRATE);
    set(5, 5, 1, B.CONSOLE);
    for (const z of [4, 11, 18]) for (const x of [-7, 7]) set(x, 9, z, B.PANEL);
    for (const z of [5, 12, 19]) set(0, 11, z, B.PANEL);
    for (let x = -3; x <= 3; x++) set(x, DECK, 22, B.HAZARD);
    for (let x = -3; x <= 3; x++) for (let y = 5; y <= 8; y++) set(x, y, 23, B.AIR);
    for (let y = 5; y <= 9; y++) for (const x of [-4, 4]) set(x, y, 23, B.HAZARD);
    for (let x = -4; x <= 4; x++) set(x, 9, 23, B.HAZARD);
    // The ramp: down a block every two, from the deck to the grass (no jump over one block).
    for (let x = -3; x <= 3; x++) {
      for (const z of [24, 25]) {
        set(x, 3, z, z === 24 ? B.HAZARD : B.DECK);
        box(x, 1, z, x, 2, z, B.HULL_DARK);
      }
      for (const z of [26, 27]) {
        set(x, 2, z, B.DECK);
        set(x, 1, z, B.HULL_DARK);
      }
      for (const z of [28, 29]) set(x, 1, z, z === 29 ? B.HAZARD : B.DECK);
    }

    // The wings: swept back from the hull at the window line, a dark stripe near the tip, a running light at each tip.
    for (let ax = 8; ax <= 15; ax++) {
      const z0 = -6 + Math.round((ax - 8) * 1.4), z1 = 10 + Math.round((ax - 8) * 0.5);
      for (const sx of [-1, 1])
        for (let z = z0; z <= z1; z++) {
          set(sx * ax, 6, z, ax === 13 ? B.HULL_DARK : B.HULL);
          if (ax <= 9) set(sx * ax, 5, z, B.HULL_DARK); // thicker at the root
        }
    }
    for (const sx of [-1, 1]) {
      const z0 = -6 + Math.round(7 * 1.4);
      set(sx * 15, 6, z0, B.RUNLIGHT);
      b.lights.push({ x: b.x + sx * 15 + 0.5, y: b.y + 6.5, z: b.z + z0 + 0.5, colour: sx < 0 ? 0xff5040 : 0x50ff70 });
    }
    // The engines: two nacelles behind the wings, their nozzles glowing at the back.
    for (const sx of [-1, 1]) {
      for (let ax = 8; ax <= 11; ax++)
        for (let y = 5; y <= 8; y++)
          for (let z = 11; z <= 23; z++) {
            const edge = (ax === 8 || ax === 11) && (y === 5 || y === 8);
            if (edge && z > 12) continue; // rounded off along their length
            let id = y === 5 ? B.HULL_DARK : B.HULL;
            if (z === 23) id = ax >= 9 && ax <= 10 && y >= 6 && y <= 7 ? B.NOZZLE : B.HULL_DARK;
            set(sx * ax, y, z, id);
          }
    }
    // The tail fin, with a light on top.
    for (let z = 10; z <= 22; z++) for (let y = 12; y <= 12 + Math.min(2, Math.floor((z - 10) / 4)); y++) set(0, y, z, B.HULL);
    set(0, 14, 22, B.RUNLIGHT);
    b.lights.push({ x: b.x + 0.5, y: b.y + 14.5, z: b.z + 22.5, colour: 0xffffff });
    // The landing legs: a strut and a broad foot, five of them.
    for (const [lx, lz] of [[-5, -17], [5, -17], [-5, 15], [5, 15], [0, -26]]) {
      box(lx - 1, 1, lz - 1, lx + 1, 1, lz + 1, B.HULL_DARK);
      box(lx, 2, lz, lx, DECK - 1 + (lz === -26 ? 0 : 0), lz, B.HULL_DARK);
      b.legs = [...(b.legs ?? []), [b.x + lx, b.y + 1, b.z + lz]];
    }
    // Under the hull, where nothing else stands, clear the air (the pad leaves none, but be sure).
    for (let z = -SHIP.Z; z <= SHIP.Z; z++)
      for (let x = -SHIP.X; x <= SHIP.X; x++)
        for (let y = 1; y <= SHIP.Y; y++) if (get(x, y, z) === KEEP && Math.abs(x) <= 7 && z >= -30 && z <= 23) set(x, y, z, B.AIR);
    b.grid = grid;
  }
  // Copy the ship's share of the grid into a chunk.
  function stampShip(data, ox, oy, oz) {
    const b = base();
    const W = SHIP.X * 2 + 1, L = SHIP.Z * 2 + 1;
    const x0 = Math.max(ox, b.x - SHIP.X), x1 = Math.min(ox + CS - 1, b.x + SHIP.X);
    const y0 = Math.max(oy, b.y + 1), y1 = Math.min(oy + CS - 1, b.y + SHIP.Y);
    const z0 = Math.max(oz, b.z - SHIP.Z), z1 = Math.min(oz + CS - 1, b.z + SHIP.Z);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const v = b.grid[(x - b.x + SHIP.X) + (z - b.z + SHIP.Z) * W + (y - b.y - 1) * W * L];
          if (v === KEEP) continue;
          data[(x - ox) + (z - oz) * CS + (y - oy) * CS * CS] = v === CLEAR ? B.AIR : v;
        }
  }

  // The logbook on a lectern at this cell, if there is one.
  function noteAt(x, y, z) {
    const b = base();
    if (b.log[0] === x && b.log[1] === y && b.log[2] === z) return SHIP_LOG;
    const s = siteIn(Math.floor(x / SITE), Math.floor(y / SITE), Math.floor(z / SITE));
    return s?.lectern && s.lectern[0] === x && s.lectern[1] === y && s.lectern[2] === z ? s.note : null;
  }

  // A planted room: rune-stone walls (they glow faintly, so a crack shows them), a lectern in the middle, and a
  // portal in a frame against the far wall, dormant until the stone is answered.
  function stamp(s, data, ox, oy, oz) {
    const { x: x0, y: y0, z: z0 } = s;
    if (x0 > ox + CS || x0 + ROOM.w < ox || y0 > oy + CS || y0 + ROOM.h < oy || z0 > oz + CS || z0 + ROOM.d < oz) return;
    for (let y = 0; y < ROOM.h; y++)
      for (let z = 0; z < ROOM.d; z++)
        for (let x = 0; x < ROOM.w; x++) {
          const lx = x0 + x - ox, ly = y0 + y - oy, lz = z0 + z - oz;
          if (lx < 0 || ly < 0 || lz < 0 || lx >= CS || ly >= CS || lz >= CS) continue;
          const shell = x === 0 || z === 0 || y === 0 || x === ROOM.w - 1 || z === ROOM.d - 1 || y === ROOM.h - 1;
          let id = shell ? (y === 0 ? B.FLOOR : B.RUNE) : B.AIR;
          // The portal stands one in from the z = 0 wall: frame 5 wide × 5 tall, an opening 3 × 3.
          if (z === 1 && x >= 2 && x <= 6 && y >= 1 && y <= 5) {
            const inside = x >= 3 && x <= 5 && y >= 2 && y <= 4;
            id = inside ? (s.live ? B.PORTAL : B.DORMANT) : B.FRAME;
          }
          if (x === 4 && z === 5 && y === 1) id = B.LECTERN;
          data[lx + lz * CS + ly * CS * CS] = id;
        }
  }

  // Where to put a new room. The day's rooms share out the compass round where you are (room i of n gets its own
  // slice of it), 35–100 blocks out and 14–60 below the ground there, kept 40 apart; each sits inside the rock, on
  // rock, with a wall against a cave if one is near, so it shows glowing from the dark. (Round 3 put them all within
  // 48 blocks, and a room in a cavern stood half out of the rock in the air.)
  function placeRoom(near, salt, i = 0, n = 1) {
    const slice = (Math.PI * 2) / Math.max(1, n);
    const a0 = hash3(salt, 0, 9, seed) * Math.PI * 2;
    // Rooms are 9 × 7 × 9. Their inside, every other cell, and the layer under the floor.
    const inside = [], under = [];
    for (let y = 0; y < ROOM.h; y += 2) for (let z = 0; z < ROOM.d; z += 2) for (let x = 0; x < ROOM.w; x += 2) inside.push([x, y, z]);
    for (let z = 0; z < ROOM.d; z += 2) for (let x = 0; x < ROOM.w; x += 2) under.push([x, -1, z]);
    let best = null;
    for (let tries = 0; tries < 48; tries++) {
      const a = a0 + (i + 0.15 + hash3(salt, tries, 1, seed) * 0.7) * slice;
      const dist = 35 + hash3(salt, tries, 2, seed) * 65;
      const x = Math.round(near.x + Math.cos(a) * dist);
      const z = Math.round(near.z + Math.sin(a) * dist);
      const y = Math.round(height(x, z) - 14 - ROOM.h - hash3(salt, tries, 3, seed) * 46);
      if (structures.some((s) => Math.hypot(s.x - x, (s.y - y) * 1.5, s.z - z) < 40)) continue;
      // Never inside one of their districts (DIG-007: those are built first).
      if (settle.all.length && settle.covers([x, y - 1, z, x + ROOM.w - 1, y + ROOM.h - 1, z + ROOM.d - 1], 4)) continue;
      const share = (cells) => cells.filter(([dx, dy, dz]) => open(x + dx, y + dy, z + dz)).length / cells.length;
      const air = share(inside), gap = share(under);
      // Prefer a spot whose wall touches a cave: it can be seen glowing from the dark.
      let touches = 0;
      for (const [dx, dy, dz] of [[-2, 3, 4], [10, 3, 4], [4, 3, -2], [4, 3, 10]]) if (open(x + dx, y + dy, z + dz)) touches++;
      const score = (air > 0.1 || gap > 0.05 ? -1000 : 0) - air * 200 - gap * 300 + Math.min(touches, 2) * 10;
      if (!best || score > best.score) best = { x, y, z, score };
    }
    return best ? { x: best.x, y: best.y, z: best.z } : { x: Math.round(near.x) + 40, y: Math.round(near.y) - 30, z: Math.round(near.z) };
  }

  PAD = landingSite();
  const settle = settlementEngine(seed, { open, height, siteIn, SITE, base, structures });
  return {
    settle,
    sky: true,
    height,
    heightRange,
    chunk,
    structures,
    placeRoom,
    noteAt,
    siteIn,
    sitesNear,
    lootAt,
    skylightsNear,
    remnantIn,
    remnantsIn,
    base,
    room: ROOM,
    // Where a new game starts: the ship's bunks.
    spawn() {
      return { ...base().bed };
    },
    // Where you come round after the deep gets the better of you: the med bay, pack untouched.
    medbay() {
      return { ...base().med };
    }
  };

  // Where the ship comes down: the nearest dry, open stretch near the origin that is near enough level over the whole
  // pad (no sea in it, no cave mouth), the ground set to its middle height. Spiralling out from the origin, the
  // first with no more than three blocks between its highest and lowest ground; failing that, the levellest seen.
  function landingSite() {
    const RX = 20, RZ = 35;
    const cells = [], coarse = [];
    for (let dz = -RZ; dz <= RZ; dz += 4) for (let dx = -RX; dx <= RX; dx += 4) if ((dx / RX) ** 2 + (dz / RZ) ** 2 <= 1) (dx % 8 === 0 && dz % 8 === 0 ? coarse : cells).push([dx, dz]);
    cells.unshift(...coarse); // the coarse grid first: most places fail on it, a quarter of the samples in
    let best = null;
    search: for (let r = 0; r <= 720; r += 8)
      for (let a = 0, n = r ? 12 : 1; a < n; a++) {
        const x = Math.round(Math.cos((a / n) * Math.PI * 2 + r * 0.13) * r), z = Math.round(Math.sin((a / n) * Math.PI * 2 + r * 0.13) * r);
        const hs = [];
        let ok = true, lo = Infinity, hi = -Infinity;
        for (let n = 0; n < cells.length; n++) {
          const [dx, dz] = cells[n];
          const h = rawHeight(x + dx, z + dz);
          if (h <= SEA + 1 || mouthAt(x + dx, z + dz)) {
            ok = false;
            break;
          }
          hs.push(h);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
          // Past the coarse grid, a place already worse than the best seen (or than level enough) is not worth finishing.
          if (n === coarse.length - 1 && best && hi - lo >= best.spread && hi - lo > 3) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        hs.sort((p, q) => p - q);
        const spread = hs[hs.length - 1] - hs[0];
        if (!best || spread < best.spread) best = { x, z, spread, g: hs[hs.length >> 1] };
        if (spread <= 3) break search;
      }
    if (!best) best = { x: 0, z: 0, g: Math.max(SEA + 2, rawHeight(0, 0)) };
    return { x: best.x, z: best.z, g: best.g, rx: RX, rz: RZ, outer: 1.5 };
  }
}

// Cells of a room by role (for the game: where the lectern is, which cells are the portal).
export function roomParts(s) {
  const portal = [];
  for (let y = 2; y <= 4; y++) for (let x = 3; x <= 5; x++) portal.push([s.x + x, s.y + y, s.z + 1]);
  return {
    lectern: [s.x + 4, s.y + 1, s.z + 5],
    portal,
    portalCentre: [s.x + 4.5, s.y + 3.5, s.z + 1.5],
    standIn: [s.x + 4.5, s.y + 1.01, s.z + 3.5],
    centre: [s.x + 4.5, s.y + 3.5, s.z + 4.5]
  };
}

// Smooth fields sampled on a lattice every `step` blocks (on world multiples of it) and blended trilinearly in
// between, covering n cells from (x0, y0, z0). Returns f(field, x, y, z) for world cells in that block.
function lattice(fields, x0, y0, z0, n, step) {
  const gx0 = Math.floor(x0 / step), gy0 = Math.floor(y0 / step), gz0 = Math.floor(z0 / step);
  const NX = Math.floor((x0 + n - 1) / step) - gx0 + 2;
  const NY = Math.floor((y0 + n - 1) / step) - gy0 + 2;
  const NZ = Math.floor((z0 + n - 1) / step) - gz0 + 2;
  const vals = fields.map((fn) => {
    const v = new Float32Array(NX * NY * NZ);
    for (let y = 0; y < NY; y++)
      for (let z = 0; z < NZ; z++)
        for (let x = 0; x < NX; x++) v[x + z * NX + y * NX * NZ] = fn((gx0 + x) * step, (gy0 + y) * step, (gz0 + z) * step);
    return v;
  });
  const a = NX, b = NX * NZ;
  const blend = (v, X, Y, Z, fx, fy, fz) => {
    const i = (X - gx0) + (Z - gz0) * NX + (Y - gy0) * NX * NZ;
    const x00 = v[i] + (v[i + 1] - v[i]) * fx, x10 = v[i + a] + (v[i + a + 1] - v[i + a]) * fx;
    const x01 = v[i + b] + (v[i + b + 1] - v[i + b]) * fx, x11 = v[i + b + a] + (v[i + b + a + 1] - v[i + b + a]) * fx;
    const z0v = x00 + (x10 - x00) * fz, z1v = x01 + (x11 - x01) * fz;
    return z0v + (z1v - z0v) * fy;
  };
  const f = (k, x, y, z) => {
    const X = Math.floor(x / step), Y = Math.floor(y / step), Z = Math.floor(z / step);
    return blend(vals[k], X, Y, Z, (x - X * step) / step, (y - Y * step) / step, (z - Z * step) / step);
  };
  // Every cell of the block at once, into arrays indexed x + z·n + y·n². Done axis by axis (x, then z, then y), which
  // is the same arithmetic in the same order as f, so the values are the same to the last bit.
  f.fill = () => {
    const xs = [], zs = [], ys = [];
    for (let k = 0; k < n; k++) {
      const wx = x0 + k, X = Math.floor(wx / step);
      xs.push([X - gx0, (wx - X * step) / step]);
      const wz = z0 + k, Z = Math.floor(wz / step);
      zs.push([Z - gz0, (wz - Z * step) / step]);
      const wy = y0 + k, Y = Math.floor(wy / step);
      ys.push([Y - gy0, (wy - Y * step) / step]);
    }
    return vals.map((v) => {
      // Along x, for every lattice row (Y, Z).
      const rx = new Float64Array(NY * NZ * n);
      for (let Y = 0; Y < NY; Y++)
        for (let Z = 0; Z < NZ; Z++)
          for (let x = 0; x < n; x++) {
            const [X, fx] = xs[x];
            const i = X + Z * NX + Y * NX * NZ;
            rx[x + Z * n + Y * n * NZ] = v[i] + (v[i + 1] - v[i]) * fx;
          }
      // Then along z, for every lattice layer Y.
      const rz = new Float64Array(NY * n * n);
      for (let Y = 0; Y < NY; Y++)
        for (let z = 0; z < n; z++) {
          const [Z, fz] = zs[z];
          for (let x = 0; x < n; x++) {
            const a0 = rx[x + Z * n + Y * n * NZ], a1 = rx[x + (Z + 1) * n + Y * n * NZ];
            rz[x + z * n + Y * n * n] = a0 + (a1 - a0) * fz;
          }
        }
      // Then along y.
      const out = new Float64Array(n * n * n);
      for (let y = 0; y < n; y++) {
        const [Y, fy] = ys[y];
        for (let c = 0; c < n * n; c++) {
          const a0 = rz[c + Y * n * n], a1 = rz[c + (Y + 1) * n * n];
          out[c + y * n * n] = a0 + (a1 - a0) * fy;
        }
      }
      return out;
    });
  };
  return f;
}
