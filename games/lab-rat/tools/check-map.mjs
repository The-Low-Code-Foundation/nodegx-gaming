// The map's checks, no browser: every room reachable from the start (doors open), every pickup, canister, crystal,
// nest home and vent stands on a floor cell a body can reach, and every usable hangs on a real wall.
//   node tools/check-map.mjs [--print]
import { Level, S, W, H, ROOMS, DOORS, PICKUPS, USABLES, CANISTERS, CRYSTALS, NEST, VENTS, START, AT, OKAFOR, GROWN, TRAIL, SWEEP, wallPos } from '../src/map.mjs';

const level = new Level();
for (const d of DOORS) level.doorOpen[d.id] = 1;
let fails = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) fails++;
};

// reachability over cells a body can stand in
const seen = new Set();
const start = [Math.floor(START.p[0] / S), Math.floor(START.p[1] / S)];
const q = [start];
seen.add(start.join());
while (q.length) {
  const [x, y] = q.shift();
  for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + ax, ny = y + ay, k = `${nx},${ny}`;
    const c = level.cell(nx, ny);
    if (seen.has(k) || !c || c.prop) continue;
    seen.add(k);
    q.push([nx, ny]);
  }
}
const reach = (x, z) => seen.has(`${Math.floor(x / S)},${Math.floor(z / S)}`);
const cellOf = (x, z) => level.cellAt(x, z);

for (const r of ROOMS) {
  let any = false;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (seen.has(`${x},${y}`)) any = true;
  check(any, `room ${r.id} is reachable`);
}
check(reach(START.p[0], START.p[1]), 'the start is on the floor');
for (const [k, a] of Object.entries(AT)) check(reach(a.p[0], a.p[1]), `?at=${k} is on the floor`);

for (const p of PICKUPS) {
  const c = cellOf(p.p[0], p.p[2]);
  const onDesk = c?.prop?.kind === 'desk';
  if (onDesk) {
    // reachable from the cell in front of the desk
    check(reach(p.p[0], p.p[2] + S), `pickup ${p.id} on the desk can be reached`);
  } else check(reach(p.p[0], p.p[2]) && !c?.prop, `pickup ${p.id} is on a reachable floor`);
}
for (const u of USABLES) {
  const w = wallPos(u.c[0], u.c[1], u.side, u.depth ?? 0.1);
  const c = level.cell(u.c[0], u.c[1]);
  const off = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[u.side];
  const behind = level.cell(u.c[0] + off[0], u.c[1] + off[1]);
  const ok = u.kind === 'vending' ? c?.prop?.kind === 'vending' : !!c && !c.prop && !behind;
  check(ok, `usable ${u.id} hangs on a wall (${w.x.toFixed(1)}, ${w.z.toFixed(1)})`);
}
for (const [x, z] of CANISTERS) check(reach(x, z) && !cellOf(x, z)?.prop, `canister at ${x},${z} is on the floor`);
for (const c of CRYSTALS) check(reach(c.p[0], c.p[1]) && cellOf(...c.p)?.room === 'garden', `crystal at ${c.p} is in the hold`);
for (const h of NEST.homes) check(reach(h[0], h[1]) && !cellOf(...h)?.prop, `nest home ${h} is on the floor`);
for (const v of [VENTS.sec, ...VENTS.bay]) {
  const w = wallPos(v.c[0], v.c[1], v.side, 0.6);
  check(reach(w.x, w.z), `vent at ${v.c} ${v.side} spawns onto the floor`);
}
check(reach(VENTS.corr.p[0], VENTS.corr.p[2]), 'the corridor vent drops onto the floor');
check(reach(...OKAFOR.p) && cellOf(...OKAFOR.p)?.room === 'sec' && !cellOf(...OKAFOR.p)?.prop, 'Okafor hides on the security office floor');
for (const g of GROWN) check(reach(...g.p) && cellOf(...g.p)?.room === 'garden' && !cellOf(...g.p)?.prop, `the grown body at ${g.p} lies in the hold`);
for (const t of TRAIL) check(reach(...t) && !cellOf(...t)?.prop, `the drag trail at ${t} is on the floor`);
for (const p of SWEEP.spawn) check(cellOf(...p)?.room === 'lift', `a soldier starts in the lift at ${p}`);
for (const p of SWEEP.posts) check(reach(p.x, p.z) && cellOf(p.x, p.z)?.room === 'bay' && !cellOf(p.x, p.z)?.prop, `a soldier's post at ${p.x},${p.z} is on the bay floor`);

if (process.argv.includes('--print')) {
  const props = { bench: 'b', tube: 'o', vending: 'v', desk: 'd', pillar: 'P', crate: 'X' };
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const c = level.cell(x, y);
      row += !c ? '#' : c.door ? 'D' : c.prop ? props[c.prop.kind] : seen.has(`${x},${y}`) ? '.' : '?';
    }
    console.log(row);
  }
}
console.log(fails ? `\n${fails} failed` : '\nall checks pass');
process.exit(fails ? 1 : 0);
