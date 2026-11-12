// The floor plan, as text: one character per 2 m cell. Pure data and grid maths (no three.js) so a Node script can
// check it (tools/check-map.mjs). The geometry is level.mjs's.
//   #  wall             .  corridor floor (terrazzo)      ,  room floor (tiles)
//   D  swing doors: walk through, they swing shut behind you (shut, nobody sees through them)
//   O  an open archway (no door)
//   L  locked door: the trapped people's room (E opens it; the infected can break it)
//   S  the officer starts here      E  the exit (the stairwell)       R  a trapped person stands here
//   Z  an infected, wandering       z  an infected, standing          X  an infected on the floor, legs gone, crawling
//   K  a fallen officer: a body and a pistol clip
//   Low cover (blocks walking, she can crouch behind it and shoot over it):
//     T  a trolley    B  a bed    N  a counter (reception, the nurses' station)    C  a row of waiting-room chairs
//     W  a low partition (a planter)    J  a desk (round 4: she can get under it, and under a bed, to hide)
//   V  tall: a vending machine (corridor) or shelving (room). Blocks walking and seeing, like a pillar
//   c  a curtain (ward bays): walk through it; nobody sees through it
//   P  pistol ammo   G  a shotgun    A  shells     M  a medkit     U  an SMG     H  a baseball bat    Y  an M7 rifle
// Round 2 (playtest: "more interesting hospital layout, with more opportunities for finding cover and sneaking"):
// A&E. The waiting hall (pillars, chair rows, the reception desk) → the minor-injuries bays → a dark service corridor
// along the top (the sneaking route) → the ward (curtained bays round the nurses' station) → the main corridor
// (gurneys, vending machines) and its side rooms → the east corridor, the ICU, the stairs.
export const CELL = 2;
export const MAP = `
############################################
#,,,,,,#,,,,,,#,,,,,,#,,,,,,,#,,,,,,,#.....#
#,R,N,,#,,K,,,#,VV,M,#,V,V,V,#,R,,R,,#...E.#
#,,,,R,#,H,,P,#,VV,,,#,V,V,V,#,,,R,,,#.....#
#,,,,,,#,,,,,,#,,,,,,#,,,Y,,,#,,,,,,,#.....#
#,,,,,,#,,T,,,#,,,,,,#,,,,,,,#,,,,,,,#.....#
###L#######D#####D#######D#######L######D###
#.......Z....................z.............#
###D########D####D#################D##O#####
#,B,cB,cB,cB,,#,B,cB,cB,cB,cB,cB,cB,,#.#,,,#
#,,,c,,c,,c,,,#,,,c,,c,,c,,c,,c,,c,,,#.#R,B#
#,,,,,T,,,Z,,,#,,,,,Z,,,,,,,,,,,,,,,,#.L,,,#
#,A,,,,,,,,,,,#,,,,,,,,NNNNNN,,,,,,,,#X#B,R#
#,,,,,,,,,T,,,#,,,,,,,,N,,P,N,,,,,,,,#.#,,,#
######O####D###,,,,,,,,NN,,NN,,,,,,,,D.#####
#.............#,,,,,,,,,,,,,,,,z,,,,,#.#,,,#
#..z..........#,,,,WW,,,,,,,,,,,,WW,,#.#,V,#
#...#.....#...#,,,,,,,,,,,,,,,,,,,,,,#.D,,,#
#.............#,,,c,,c,,c,,c,,c,,c,,,#.#,,U#
#.CCC...CCC...#,B,cB,cB,cB,cB,cB,cB,,#.#,,,#
#.............###D#################D##.#####
#.CCC...CCC...O...............Z............#
#......Z......O...T....V...T.....T.....K...#
#...#.....#...###L######D######L#######D####
#.............#,,,,,,#,,,,,,#,,,,,,#,,,,,,,#
#.......NNNN..#,,R,,,#,VV,,,#,R,,,,#,VV,VV,#
#..........N..#,,,,,,#,VV,,,#,,,,R,#,,,,,,,#
#.S...........#,B,,,,#,,,,Z,#,,,,,,#,G,A,,M#
#......T......#,,,,,,#,,,,,,#,,B,,,#,,,,,,,#
############################################
`;
// Round 3 (playtest: "a sandbox, just one room and spawning zombies but no health damage, to practise getting into
// cover and shooting"): ?sandbox=1. One hall, 44 x 30 m, with every kind of cover: a 4 m pillar, a wall stub, a
// vending machine (tall: lean out round them), a counter, trolleys, beds, chair rows, planters (low: pop up over them).
// The infected come in from the corridor behind the top wall, through its three swing doors.
// Round 4: desks (J) to get under, beside the beds; the dark, the heartbeat, the infected that lose her and give up.
export const SANDBOX = `
######################
#....................#
#####D######D######D##
#....................#
#..TT.....#.....BB...#
#.........#..........#
#...##........V......#
#...##...........J...#
#.........NNNN.......#
#.CCC..........##....#
#.JJ...........##..T.#
#......V.............#
#..WW...J.....CCC....#
#.........S..........#
######################
`;
export const SANDBOX_LIGHTS = [[10, 9], [5, 5], [16, 6], [5, 11], [16, 12], [10, 4], [10, 1], [3, 1], [17, 1]];

// Ceiling lights that really light: [x, z] cells. The lite drive uses the first two. The third flickers.
export const LIGHTS = [[7, 24], [20, 21], [24, 7], [7, 17], [33, 22], [19, 11], [31, 17], [7, 11], [38, 15], [40, 3], [10, 3], [25, 25], [39, 26]];

export function parse(text = MAP) {
  const rows = text.trim().split('\n');
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const cells = rows.map((r) => r.padEnd(w, '#').split(''));
  const items = [];
  let start = null, exit = null;
  const rooms = [];
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const c = cells[z][x];
      if (c === 'S') start = { x, z };
      if (c === 'E') exit = { x, z };
      if ('ZzXKTBNCWVPGAMUHYRLJ'.includes(c)) items.push({ type: c, x, z });
    }
  // The trapped people's rooms: the floor behind each L door (the side with people on it), flood-filled without
  // crossing a door.
  const fill = (from) => {
    const seen = new Set(), queue = [from], floor = [];
    while (queue.length) {
      const p = queue.pop();
      const k = `${p.x},${p.z}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const c = cells[p.z]?.[p.x];
      if (!c || !',RBTNCWVcKMPGAUHYZzXJ'.includes(c)) continue;
      floor.push(p);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) queue.push({ x: p.x + dx, z: p.z + dz });
    }
    return floor;
  };
  for (const door of items.filter((i) => i.type === 'L')) {
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => fill({ x: door.x + dx, z: door.z + dz })).filter((f) => f.length);
    const floor = sides.find((f) => f.some((p) => cells[p.z][p.x] === 'R')) ?? sides[0] ?? [];
    rooms.push({ door, floor, people: floor.filter((p) => cells[p.z][p.x] === 'R'), open: false, lost: false });
  }
  // Swing doors: how far each stands open (level.mjs swings them); shut ones stop sight.
  const doors = new Map();
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if ('Dc'.includes(cells[z][x])) doors.set(z * w + x, { x, z, open: 0 });
  return { w, h, cells, items, start, exit, rooms, doors };
}

export const toWorld = (x, z) => ({ x: (x + 0.5) * CELL, z: (z + 0.5) * CELL });
export const toCell = (wx, wz) => ({ x: Math.floor(wx / CELL), z: Math.floor(wz / CELL) });

const WALKABLE = '.,DOcSEZzXKPGAMUHYR';
export const LOW = 'TBNCWJ';
// What she can get under and hide (round 4): a desk, a bed.
export const HIDE = 'JB';
const roomAt = (grid, x, z) => grid.rooms.find((r) => r.door.x === x && r.door.z === z);
// Can a character stand in this cell? Cover blocks walking; a locked door blocks until the room is opened, or broken in.
export function walkable(grid, x, z, { throughCover = false } = {}) {
  const c = grid.cells[z]?.[x];
  if (!c) return false;
  if (c === 'L') {
    const r = roomAt(grid, x, z);
    return !!(r && (r.open || r.lost));
  }
  if (LOW.includes(c)) return throughCover;
  return WALKABLE.includes(c);
}
// Low cover: she crouches behind it and shoots over it.
export const isCover = (grid, x, z) => LOW.includes(grid.cells[z]?.[x] ?? '');
export const isWall = (grid, x, z) => (grid.cells[z]?.[x] ?? '#') === '#';
// Tall and solid: a wall, a vending machine or shelving, a locked door still shut. She can put her back to it and peek
// round its end.
export function isTall(grid, x, z) {
  const c = grid.cells[z]?.[x] ?? '#';
  if (c === '#' || c === 'V') return true;
  if (c === 'L') return !walkable(grid, x, z);
  return false;
}
export const isDoorway = (grid, x, z) => 'DLO'.includes(grid.cells[z]?.[x] ?? '');
// Nobody sees through this cell: walls, tall things, a shut locked door, a curtain, swing doors that have fallen shut.
export function blocksSight(grid, x, z) {
  const c = grid.cells[z]?.[x] ?? '#';
  if (c === '#' || c === 'V') return true;
  if (c === 'L') return !walkable(grid, x, z);
  if (c === 'D') return (grid.doors.get(z * grid.w + x)?.open ?? 1) < 0.35;
  if (c === 'c') return (grid.doors.get(z * grid.w + x)?.open ?? 0) < 0.5;
  return false;
}

// Does a straight line between two world points cross a wall (or a locked door)? Cover blocks too when `lowCover`
// is on: a crouching officer behind a trolley. Steps through the cells the line crosses.
export function sightClear(grid, ax, az, bx, bz, { lowCover = false } = {}) {
  const dx = bx - ax, dz = bz - az;
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / (CELL * 0.35)));
  let last = null;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const c = toCell(ax + dx * t, az + dz * t);
    if (last && last.x === c.x && last.z === c.z) continue;
    last = c;
    if (blocksSight(grid, c.x, c.z)) return false;
    if (lowCover && isCover(grid, c.x, c.z)) return false;
  }
  return true;
}

// Shortest path between cells (breadth first, 4 neighbours; diagonals would cut wall corners). `avoid(x, z)` returns an
// extra cost for a cell (the trapped keep away from the infected). Returns the cells after the start, or null.
export function findPath(grid, from, to, { avoid = null, maxCost = 4000 } = {}) {
  if (from.x === to.x && from.z === to.z) return [];
  const key = (x, z) => z * grid.w + x;
  const cost = new Map([[key(from.x, from.z), 0]]);
  const prev = new Map();
  // A small binary-heap-free queue: costs are small integers, so buckets.
  const buckets = [[from]];
  let c0 = 0, found = false;
  while (c0 < buckets.length && c0 < maxCost) {
    const bucket = buckets[c0];
    if (!bucket || !bucket.length) {
      c0++;
      continue;
    }
    const p = bucket.pop();
    const pk = key(p.x, p.z);
    if (cost.get(pk) !== c0) continue;
    if (p.x === to.x && p.z === to.z) {
      found = true;
      break;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: p.x + dx, z: p.z + dz };
      if (!walkable(grid, n.x, n.z)) continue;
      const nk = key(n.x, n.z);
      const c = c0 + 1 + (avoid ? avoid(n.x, n.z) : 0);
      if (cost.has(nk) && cost.get(nk) <= c) continue;
      cost.set(nk, c);
      prev.set(nk, pk);
      (buckets[c] ??= []).push(n);
    }
  }
  if (!found) return null;
  const path = [];
  for (let k = key(to.x, to.z); k !== key(from.x, from.z); k = prev.get(k)) path.push({ x: k % grid.w, z: Math.floor(k / grid.w) });
  return path.reverse();
}

// Cells of one kind, as world points.
export const cellsOf = (grid, type) => grid.items.filter((i) => i.type === type);
