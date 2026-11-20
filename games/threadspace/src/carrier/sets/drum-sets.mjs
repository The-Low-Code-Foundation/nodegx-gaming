// The drums' rooms built as sets (sets.mjs `drumSet`): quarters, mess, galley and sick bay, laid out from the back
// wall toward the doorway.

import { box, cyl, at, mat, glow, mulberry } from '../../util.mjs';
import { screen } from '../../decor.mjs';
import { P, G, desk, rack, locker, messTable, place } from './parts.mjs';
import { poster } from './paper.mjs';

// --- the drum's sets ----------------------------------------------------------------------------------------------
//
// A drum room (drum.mjs) is about 9 × 9 m with one doorway, in the middle of the wall on the ring corridor. Today's sets
// were drawn for the long side rooms of the old decks, so the drum has its own, laid out from the back wall (`v`, the
// distance from it) toward the doorway, and turned to suit whichever side of the corridor the room is on.

/** The room's frame for a drum set: `Z(v)` the z `v` metres in from the back wall, `R(ry)` a turn for something drawn
 *  facing +z (toward the doorway in a fore-row room), `D` the depth from the back wall to the door's. */
function drumFrame(c) {
  const fore = c.row !== 'aft', [z1, z2] = c.z;
  return { fore, Z: (v) => (fore ? z1 + v : z2 - v), R: (ry) => (fore ? ry : Math.PI - ry), D: z2 - z1, x1: c.x[0], x2: c.x[1] };
}

/** Berths: three racks three high (two on the back wall, one on a side wall), lockers down the other side wall, a
 *  table and stools in the middle. Bunk 1 (the back wall's starboard rack, bottom berth) is where `watches.you.bunk`
 *  puts yours: (2.2, 1.3 m in from the back). */
export function drumQuarters(C, I, c) {
  const { Z, R, D, x1, x2 } = drumFrame(c);
  const seed = [...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  for (const [k, x] of [[0, -2.2], [1, 2.2]]) place(I, rack(seed + k * 7), x, Z(0.5), { ry: R(0) });
  place(I, rack(seed + 21), x1 + 0.5, Z(3.6), { ry: R(Math.PI / 2) }); // along the port wall, facing in
  for (let v = 1.6; v < D - 1.4; v += 0.66) place(I, locker(0.6), x2 - 0.3, Z(v), { ry: R(-Math.PI / 2) });
  place(I, messTable(2.0, 2, { stoolMat: P.pad }), 0.4, Z(4.6), { ry: R(Math.PI / 2) });
  I.screen('text', x1 + 0.14, 1.8, Z(6.6), R(Math.PI / 2), '#ffb070', 1.0, 0.6);
  poster(C, I, 'quiet', 1.1, 0.5, 0, 2.55, Z(0.12), R(0));
  const r = mulberry(seed);
  for (let i = 0; i < 2; i++) place(I, G(at(cyl(0.18, 0.18, 0.7, r() < 0.5 ? P.olive : P.blanket, 8), 0, 0.18, 0, 0, 0, Math.PI / 2)), -2.4 + i * 4.4, Z(1.55 + r() * 0.3), { ry: r() * 3, collide: false });
}

/** A mess: the servery counter along the back wall, four tables either side of the aisle from the door, the drinks
 *  machines on a side wall. */
export function drumMess(C, I, c) {
  const { Z, R, x1, x2 } = drumFrame(c);
  const W = x2 - x1 - 1.2;
  const ctr = G(at(box(W, 0.9, 0.65, P.stainlessDk), 0, 0.45, 0), at(box(W + 0.1, 0.05, 0.7, P.stainless), 0, 0.925, 0), at(box(W, 0.04, 0.3, P.stainless), 0, 1.45, -0.18));
  for (let i = 0; i < 5; i++) ctr.add(at(box(0.5, 0.06, 0.4, P.chrome), -W / 2 + 0.8 + i * ((W - 1.6) / 4), 0.97, 0));
  ctr.add(at(cyl(0.2, 0.2, 0.55, P.chrome, 12), W / 2 - 0.4, 1.23, -0.05));
  ctr.userData.spots = [-1.2, 1.0].map((x) => ({ x, z: 0.75, yaw: 0, pose: 'workTable' })); // at the servery
  place(I, ctr, 0, Z(0.4), { ry: R(0) });
  for (const v of [2.9, 5.5]) for (const x of [-2.25, 2.25]) place(I, messTable(3.0, 2), x, Z(v), { ry: R(0) });
  const bar = G(at(box(1.8, 0.92, 0.6, P.stainlessDk), 0, 0.46, 0), at(box(1.9, 0.05, 0.65, P.stainless), 0, 0.945, 0));
  for (let i = 0; i < 2; i++) bar.add(at(box(0.6, 0.75, 0.45, P.dark), -0.45 + i * 0.9, 1.35, -0.08), at(box(0.36, 0.2, 0.02, glow(['#ffb347', '#58b0ff'][i], 0.9)), -0.45 + i * 0.9, 1.55, 0.15));
  place(I, bar, x2 - 0.35, Z(7.6), { ry: R(-Math.PI / 2) });
  poster(C, I, 'menu', 1.1, 1.4, -2.2, 2.1, Z(0.12), R(0));
  poster(C, I, 'crest', 1.2, 1.2, 2.2, 2.1, Z(0.12), R(0));
  poster(C, I, 'board', 1.4, 0.9, x1 + 0.12, 1.6, Z(6.8), R(Math.PI / 2), 7);
}

/** A galley: the cooking line under its hood along the back wall, prep counters down a side wall, the island, and the
 *  tall fridges either side of the door. */
export function drumGalley(C, I, c) {
  const { Z, R, D, x1, x2 } = drumFrame(c);
  const W = x2 - x1 - 0.4;
  const line = G(at(box(W, 0.9, 0.85, P.stainlessDk), 0, 0.45, 0), at(box(W, 0.05, 0.9, P.stainless), 0, 0.925, 0));
  for (const x of [-2.6, -1.8]) {
    line.add(at(box(0.7, 0.02, 0.6, P.black), x, 0.96, 0));
    for (const [dx, dz] of [[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]]) line.add(at(cyl(0.12, 0.12, 0.012, glow('#5a1408'), 12), x + dx, 0.975, dz));
  }
  line.add(at(box(1.0, 1.1, 0.8, P.stainless), 0, 1.5, -0.02), at(box(0.7, 0.5, 0.02, P.black), 0, 1.55, 0.39), at(box(0.12, 0.05, 0.02, glow('#39d27a')), 0.38, 1.9, 0.39));
  line.add(at(cyl(0.42, 0.36, 0.55, P.stainless, 14), 1.4, 1.2, 0), at(box(0.8, 0.02, 0.6, P.stainlessDk), 2.5, 0.97, 0));
  line.add(at(box(W, 0.5, 1.1, P.stainless), 0, 2.45, 0.1), at(box(W - 0.2, 0.02, 0.9, mat('#5d646c')), 0, 2.19, 0.15));
  line.userData.spots = [-2.2, -0.1, 2.0].map((x) => ({ x, z: 0.85, yaw: 0, pose: 'workTable' })); // at the hobs, the oven, the boiler
  place(I, line, 0, Z(0.5), { ry: R(0), collide: true });
  const len = D - 4.2;
  const prep = G(at(box(len, 0.9, 0.7, P.stainlessDk), 0, 0.45, 0), at(box(len, 0.05, 0.75, P.stainless), 0, 0.925, 0), at(box(len, 0.04, 0.4, P.stainless), 0, 1.75, -0.15));
  for (const x of [-1.0, -0.2]) prep.add(at(box(0.6, 0.03, 0.45, P.black), x, 0.94, 0.05), at(box(0.04, 0.3, 0.04, P.chrome), x, 1.1, -0.25));
  for (let i = 0; i < 4; i++) prep.add(at(cyl(0.13 + (i % 3) * 0.04, 0.13 + (i % 3) * 0.04, 0.18 + (i % 2) * 0.12, P.chrome, 10), -len / 2 + 0.5 + i * 0.9, 1.9, -0.15));
  prep.userData.spots = [-0.6].map((x) => ({ x, z: 0.75, yaw: 0, pose: 'workTable' }));
  place(I, prep, x1 + 0.4, Z(1.6 + len / 2), { ry: R(Math.PI / 2) });
  const island = G(at(box(2.2, 0.9, 0.9, P.stainlessDk), 0, 0.45, 0), at(box(2.3, 0.06, 1.0, mat('#8a6a48')), 0, 0.93, 0));
  island.userData.spots = [{ x: 0.3, z: 0.85, yaw: 0, pose: 'workTable' }];
  place(I, island, 1.0, Z(4.2), { ry: R(0) });
  for (const x of [x1 + 0.5, x2 - 0.5]) {
    const fr = G(at(box(0.9, 2.1, 0.75, P.stainless), 0, 1.05, 0), at(box(0.01, 2.0, 0.01, P.black), 0, 1.05, 0.38), at(box(0.03, 0.4, 0.04, P.chrome), 0, 1.2, 0.4));
    place(I, fr, x, Z(D - 0.45), { ry: R(Math.PI) });
  }
  poster(C, I, 'loose', 0.8, 0.5, x2 - 0.12, 1.7, Z(2.6), R(-Math.PI / 2));
}

/** A sick bay: two beds head to the back wall with their monitors and a curtain between, the treatment table, the
 *  cabinets down a side wall, the medic's desk by the door. */
export function drumMedbay(C, I, c) {
  const { Z, R, D, x1, x2 } = drumFrame(c), y = I.floorY;
  for (const x of [-2.6, 0.2]) {
    const bed = G(
      at(box(0.95, 0.5, 2.0, P.steel), 0, 0.3, 0), at(box(0.9, 0.14, 1.95, P.white), 0, 0.62, 0),
      at(box(0.92, 0.05, 1.3, mat('#9ac0d0')), 0, 0.71, 0.3), at(box(0.6, 0.1, 0.4, P.pillow), 0, 0.73, -0.75), at(box(0.95, 0.6, 0.06, P.steel), 0, 0.75, -1.02)
    );
    place(I, bed, x, Z(1.15), { ry: R(0) });
    I.group.add(at(screen('reactor', '#39d27a', 0.5, 0.34), x + 0.75, y + 1.85, Z(0.2), 0, R(0), 0));
    place(I, G(at(cyl(0.02, 0.02, 1.9, P.chrome, 6), 0, 0.95, 0), at(cyl(0.22, 0.22, 0.03, P.chrome, 5), 0, 0.03, 0), at(box(0.12, 0.2, 0.04, mat('#cfe6f0')), 0.08, 1.75, 0)), x - 0.7, Z(0.6), { collide: false });
  }
  I.group.add(at(box(0.02, 2.3, 2.2, mat('#7ab0b8')), -1.2, y + 1.65, Z(1.2)));
  const tx = 2.9, tz = Z(4.4);
  place(I, G(at(cyl(0.2, 0.3, 0.6, P.steel, 10), 0, 0.3, 0), at(box(0.7, 0.12, 2.0, P.white), 0, 0.68, 0), at(box(0.62, 0.06, 1.9, mat('#3f8f8a')), 0, 0.77, 0)), tx, tz, { ry: R(0) });
  I.group.add(at(G(at(cyl(0.02, 0.02, 0.6, P.steel, 6), 0, -0.3, 0), at(cyl(0.45, 0.3, 0.14, P.white, 18), 0, -0.65, 0), at(cyl(0.38, 0.38, 0.01, glow('#f4f8ff'), 18), 0, -0.725, 0)), tx, y + (c.h ?? 3), tz));
  for (let i = 0; i < 3; i++) place(I, G(at(box(1.0, 2.0, 0.45, P.white), 0, 1.0, 0), at(box(0.9, 0.9, 0.01, mat('#bfd8e0')), 0, 1.5, 0.23)), x1 + 0.28, Z(3.4 + i * 1.05), { ry: R(Math.PI / 2) });
  place(I, G(at(box(0.6, 1.0, 0.5, P.red), 0, 0.55, 0), at(box(0.4, 0.25, 0.3, P.dark), 0, 1.18, 0)), x2 - 0.4, Z(2.6), { ry: R(-Math.PI / 2) });
  const md = desk(1.6, '#3ac0b0', ['status', 'text']);
  md.userData.spots = [{ x: 0, z: 0.8, yaw: 0, pose: 'workTable' }]; // the medic at the desk
  place(I, md, -2.4, Z(D - 1.6), { ry: R(Math.PI) });
  poster(C, I, 'cross', 0.9, 0.9, 1.6, 2.0, Z(0.12), R(0));
  poster(C, I, 'triage', 0.7, 0.9, x2 - 0.12, 1.7, Z(5.6), R(-Math.PI / 2));
}
