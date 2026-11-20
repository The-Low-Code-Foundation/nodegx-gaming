// The hangar's dressing (sets.mjs `dressHangar`), and the airless hangar's, for no weight and no air.

import * as THREE from 'three';
import { box, cyl, at, mat } from '../../util.mjs';
import { P, G, place } from './parts.mjs';
import { poster } from './paper.mjs';

/** The hangar's dressing, after layout.mjs has put the fighters, the lanes, the bay door and the crates in. */
export function dressHangar(C, I, c) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY, h = c.h ?? 12;
  const yellow = mat('#d8a530'), deckPaint = mat('#c8ccd0');
  // Where the starboard wall is a bay door (the spin-drum carrier's hangar has one each side): nothing on it there.
  const doorE = (c.bayDoors ?? []).filter((d) => d.side === 'e');
  const onWall = (z, pad = 1) => !doorE.some((d) => z > d.from - pad && z < d.to + pad);
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
  // A catwalk along the inboard wall at the height of the second deck, with its rail; broken where the wall is a bay
  // door. Each length is reached by rungs up the wall at its ends, through a gap in its floor, and walked
  // (`C.catwalks`: main.mjs climbs the rungs and keeps you on it).
  const cw = 1.4, cy = 6.2;
  const runs = [];
  for (let z = z1 + 1, from = null; z <= z2 - 1; z += 0.5) {
    const ok = onWall(z) && z < z2 - 1;
    if (ok && from === null) from = z;
    if (!ok && from !== null) (runs.push([from, z - 0.5]), (from = null));
  }
  for (const [a, b] of runs) {
    if (b - a < 4) continue;
    const L = b - a, m = (a + b) / 2;
    I.group.add(at(box(cw, 0.08, L, P.steel), x2 - cw / 2, y + cy, m));
    for (const e of [0.5, 1.05]) I.group.add(at(box(0.04, 0.04, L, yellow), x2 - cw, y + cy + e, m));
    for (let z = a; z <= b; z += 2) I.group.add(at(box(0.04, 1.05, 0.04, P.steel), x2 - cw, y + cy + 0.53, z), at(box(cw, 0.06, 0.06, P.steel), x2 - cw / 2, y + cy - 0.15, z));
    (C.catwalks ??= []).push({ deck: c.deck, wall: x2, x: [x2 - cw, x2], z: [a, b], y: y + cy, rungs: [a + 0.6, b - 0.6] });
    for (const z of [a + 0.6, b - 0.6]) {
      // Rungs: grab bars up the wall from the deck to the catwalk, on stand-offs.
      for (let yy = 0.4; yy < cy + 1.2; yy += 0.4) I.group.add(at(box(0.08, 0.05, 0.6, yellow), x2 - 0.2, y + yy, z));
      for (const dz of [-0.32, 0.32]) I.group.add(at(box(0.16, cy + 1.2, 0.05, P.steel), x2 - 0.1, y + (cy + 1.2) / 2, z + dz));
    }
  }
  if (c.vacuum) {
    zeroG(C, I, c, { yellow });
  } else {
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
  }
  // The words on the walls.
  poster(C, I, 'hangar', 16, 3.2, x2 - 0.56, 9.4, onWall(18, 9) ? 18 : (z1 + (doorE[0]?.from ?? z2)) / 2, -Math.PI / 2);
  poster(C, I, 'clear', 9, 0.7, (x1 + x2) / 2 - 6, 9.8, z1 + 0.16, 0);
  poster(C, I, 'fod', 1.4, 0.9, x2 - 0.15, 1.7, -6.5, -Math.PI / 2);
  poster(C, I, 'burn', 0.8, 1.1, x2 - 0.15, 1.7, 5.2, -Math.PI / 2);
  // The hangar's frames: deep ribs up both long walls and across the deckhead.
  for (let z = z1 + 4; z < z2; z += 8) {
    if (onWall(z)) I.group.add(at(box(0.5, h, 0.6, I.s.trim), x2 - 0.25, y + h / 2, z));
    I.group.add(at(box(x2 - x1, 0.7, 0.5, I.s.trim), (x1 + x2) / 2, y + h - 0.35, z));
  }
}

/** The airless hangar dressed for no weight and no air (the spin-drum carrier's): everything loose is held down.
 *  Crates under cargo nets strapped to the tie-downs, at both ends; a tool chest clamped to the deck beside each pad, its
 *  tools tethered; handrail lines on posts down both sides of the centre walkway, open at each pad, with tether coils
 *  hung on them; and handholds along the bulkheads. */
function zeroG(C, I, c, { yellow }) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  const net = mat('#2a2d22'), strap = mat('#c8a030'), clamp = mat('#e0b030'), tether = mat('#ff7a30');
  const pads = C.L.fighters.map((f) => f.at[1]);
  const padZ = [...new Set(pads)].sort((a, b) => a - b);
  // Crates under a net: a stack of three, the net's cords across the top and down the sides, four straps to the deck.
  const netted = (x, z, ry) => {
    const g = new THREE.Group(), W = 4.6, D = 2.2, H = 3.2;
    g.add(at(box(2.2, 1.6, 2.2, mat('#5c6650')), -1.15, 0.8, 0), at(box(2.2, 1.6, 2.2, mat('#6a6248')), 1.15, 0.8, 0), at(box(2.0, 1.5, 2.0, mat('#4f5a62')), 0, 2.35, 0));
    for (let u = -W / 2; u <= W / 2 + 0.01; u += 0.46) g.add(at(box(0.03, 0.03, D + 0.06, net), u, H + 0.02, 0), at(box(0.03, H, 0.03, net), u, H / 2, D / 2 + 0.03), at(box(0.03, H, 0.03, net), u, H / 2, -D / 2 - 0.03));
    for (let v = 0.3; v < H; v += 0.46) for (const zz of [D / 2 + 0.03, -D / 2 - 0.03]) g.add(at(box(W, 0.03, 0.03, net), 0, v, zz));
    for (let w = -D / 2; w <= D / 2 + 0.01; w += 0.46) g.add(at(box(W, 0.03, 0.03, net), 0, H + 0.02, w));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(box(0.06, 0.02, 1.2, strap), sx * (W / 2 + 0.4), 0.02, sz * (D / 2 + 0.5)), at(box(0.06, H * 0.9, 0.06, strap), sx * (W / 2 + 0.02), H * 0.45, sz * (D / 2 + 0.03)));
    place(I, g, x, z, ry);
  };
  for (const s of [-1, 1]) {
    netted(s * 12.5, z1 + 6, 0);
    if (z2 - (padZ.at(-1) ?? z2) > 10) netted(s * 12.5, z2 - 6, 0);
  }
  // A tool chest clamped to the deck by each pad, toward the walkway, a tool on a tether from it to a deck ring.
  const chest = () => {
    const g = G(at(box(1.2, 1.0, 0.6, P.red), 0, 0.5, 0), ...[0.25, 0.45, 0.65, 0.85].map((yy) => at(box(1.1, 0.01, 0.01, P.black), 0, yy, 0.305)));
    for (const sx of [-0.62, 0.62]) g.add(at(box(0.08, 0.3, 0.7, clamp), sx, 0.15, 0), at(box(0.2, 0.04, 0.8, clamp), sx, 0.02, 0));
    g.add(at(cyl(0.012, 0.012, 1.3, tether, 4), 0.3, 0.55, 0.85, Math.PI / 2 - 0.3, 0, 0), at(box(0.25, 0.06, 0.08, P.steel), 0.3, 0.1, 1.45));
    return g;
  };
  for (const f of C.L.fighters) {
    const s = Math.sign(f.at[0]) || 1;
    place(I, chest(), s * 4.2, f.at[1] + 5.4, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  // Handrail lines down both sides of the centre walkway, open at each pad so the crews can cross.
  const rx = 2.8, rail = (a, b, x) => {
    if (b - a < 1) return;
    I.group.add(at(box(0.05, 0.05, b - a, yellow), x, y + 1.0, (a + b) / 2));
    for (let z = a; z <= b + 0.01; z += Math.max(1, (b - a) / Math.ceil((b - a) / 3))) I.group.add(at(box(0.06, 1.0, 0.06, P.steel), x, y + 0.5, z));
  };
  const gaps = padZ.map((z) => [z - 4.2, z + 4.2]);
  for (const x of [-rx, rx]) {
    let from = z1 + 2;
    for (const [a, b] of gaps) (rail(from, a, x), (from = b));
    rail(from, z2 - 2, x);
    // A coiled tether hung on the rail every other pad.
    padZ.forEach((z, k) => k % 2 || I.group.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 4, 14), tether), x, y + 0.82, z + 6, 0, Math.PI / 2, 0)));
  }
  // Handholds along the forward and after bulkheads, at hand height (clear of the airlock's door in the middle).
  for (const z of [z1 + 0.15, z2 - 0.15]) for (let x = x1 + 1; x < x2 - 1; x += 1.5) if (Math.abs(x) > 3.4) I.group.add(at(box(0.5, 0.05, 0.08, yellow), x, y + 1.3, z));
}
