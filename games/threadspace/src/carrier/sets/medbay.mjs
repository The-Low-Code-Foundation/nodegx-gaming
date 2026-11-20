// The sick bay, built as a set (sets.mjs `SETS`).

import { box, cyl, at, mat, glow } from '../../util.mjs';
import { screen } from '../../decor.mjs';
import { P, G, couch, desk, place } from './parts.mjs';
import { poster } from './paper.mjs';

export function medbay(C, I, c) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  // The ward: three beds head to the outboard wall, each with its monitor on an arm and a curtain on a track.
  for (let i = 0; i < 3; i++) {
    const z = z1 + 5.2 + i * 3.2;
    const bed = G(
      at(box(2.0, 0.5, 0.95, P.steel), 0, 0.3, 0), at(box(1.95, 0.14, 0.9, P.white), 0, 0.62, 0),
      at(box(1.3, 0.05, 0.92, mat('#9ac0d0')), 0.3, 0.71, 0), at(box(0.4, 0.1, 0.6, P.pillow), -0.75, 0.73, 0),
      at(box(0.06, 0.6, 0.95, P.steel), -1.02, 0.75, 0), at(box(1.2, 0.04, 0.03, P.chrome), 0.2, 0.9, 0.5), at(box(1.2, 0.04, 0.03, P.chrome), 0.2, 0.9, -0.5)
    );
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.4, 0.4]) bed.add(at(cyl(0.05, 0.05, 0.06, P.black, 8), sx, 0.05, sz, Math.PI / 2, 0, 0));
    place(I, bed, x2 - 1.1, z, { ry: Math.PI });
    I.group.add(at(cyl(0.03, 0.03, 0.9, P.steel, 6), x2 - 0.25, y + 1.7, z - 0.7), at(box(0.6, 0.05, 0.05, P.steel), x2 - 0.5, y + 2.15, z - 0.7));
    I.group.add(at(screen('reactor', '#39d27a', 0.5, 0.34), x2 - 0.8, y + 1.85, z - 0.7, 0, -Math.PI / 2 + 0.4, 0));
    I.group.add(at(box(0.56, 0.4, 0.04, P.black), x2 - 0.82, y + 1.85, z - 0.72, 0, -Math.PI / 2 + 0.4, 0));
    // the IV pole
    place(I, G(at(cyl(0.02, 0.02, 1.9, P.chrome, 6), 0, 0.95, 0), at(cyl(0.22, 0.22, 0.03, P.chrome, 5), 0, 0.03, 0), at(box(0.12, 0.2, 0.04, mat('#cfe6f0')), 0.08, 1.75, 0)), x2 - 2.3, z + 0.65, { collide: false });
    if (i < 2) {
      I.group.add(at(box(0.03, 0.03, 2.4, P.chrome), x2 - 1.2, y + 2.85, z + 1.6, 0, Math.PI / 2, 0));
      const cl = 0.6 + (i * 0.7);
      I.group.add(at(box(cl, 2.3, 0.02, mat('#7ab0b8')), x2 - 0.4 - cl / 2, y + 1.65, z + 1.6));
    }
  }
  // The treatment bay aft: the table under its lamp, the trolley, the cabinets, the crash cart, the oxygen.
  const tz = z2 - 2.8, tx = (x1 + x2) / 2 + 0.6;
  place(I, G(at(cyl(0.2, 0.3, 0.6, P.steel, 10), 0, 0.3, 0), at(box(0.7, 0.12, 2.0, P.white), 0, 0.68, 0), at(box(0.62, 0.06, 1.9, mat('#3f8f8a')), 0, 0.77, 0)), tx, tz);
  const lamp = G(at(cyl(0.02, 0.02, 0.6, P.steel, 6), 0, -0.3, 0), at(cyl(0.45, 0.3, 0.14, P.white, 18), 0, -0.65, 0), at(cyl(0.38, 0.38, 0.01, glow('#f4f8ff'), 18), 0, -0.725, 0));
  I.group.add(at(lamp, tx, y + 3, tz));
  place(I, G(at(box(0.9, 0.04, 0.5, P.chrome), 0, 0.9, 0), at(box(0.9, 0.04, 0.5, P.chrome), 0, 0.4, 0), ...[[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]].map(([a, b]) => at(box(0.03, 0.9, 0.03, P.chrome), a, 0.45, b)), at(box(0.3, 0.04, 0.2, P.steel), -0.2, 0.94, 0)), tx - 1.6, tz + 0.6);
  for (let i = 0; i < 4; i++) {
    const cab = G(at(box(1.0, 2.0, 0.45, P.white), 0, 1.0, 0), at(box(0.9, 0.9, 0.01, mat('#bfd8e0')), 0, 1.5, 0.23), at(box(0.01, 0.8, 0.01, P.grey), 0, 0.5, 0.23));
    if (i === 1) cab.add(at(box(0.2, 0.06, 0.012, P.green), 0, 1.75, 0.235), at(box(0.06, 0.2, 0.012, P.green), 0, 1.75, 0.235));
    place(I, cab, x1 + 1.2 + i * 1.05, z2 - 0.28, { ry: Math.PI });
  }
  place(I, G(at(box(0.6, 1.0, 0.5, P.red), 0, 0.55, 0), ...[0.3, 0.55, 0.8].map((yy) => at(box(0.56, 0.02, 0.01, P.black), 0, yy, 0.255)), at(box(0.4, 0.25, 0.3, P.dark), 0, 1.18, 0)), x2 - 0.5, z2 - 1.0, { ry: -Math.PI / 2 });
  for (let i = 0; i < 3; i++) I.group.add(at(cyl(0.11, 0.11, 1.2, P.green, 10), x2 - 0.2, y + 0.6, z2 - 2.2 - i * 0.26), at(cyl(0.04, 0.04, 0.12, P.chrome, 6), x2 - 0.2, y + 1.26, z2 - 2.2 - i * 0.26));
  // The medic's desk by the door, the waiting bench, the cross and the triage chart.
  place(I, desk(1.6, '#3ac0b0', ['status', 'text']), x1 + 2.2, z1 + 0.5);
  place(I, couch(mat('#3f7f8a'), { low: true }), x1 + 2.2, z1 + 1.5);
  place(I, G(at(box(2.4, 0.45, 0.45, P.pad), 0, 0.23, 0), at(box(2.4, 0.5, 0.08, P.pad), 0, 0.7, -0.2)), x2 - 1.6, z1 + 0.4);
  poster(C, I, 'cross', 0.9, 0.9, x2 - 1.6, 1.85, z1 + 0.12, 0);
  poster(C, I, 'triage', 0.7, 0.9, x1 + 0.12, 1.7, z2 - 3.6, Math.PI / 2);
}
