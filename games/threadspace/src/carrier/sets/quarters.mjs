// The crew's quarters, built as a set (sets.mjs `SETS`).

import { cyl, at, mulberry } from '../../util.mjs';
import { P, G, rack, locker, messTable, place } from './parts.mjs';
import { poster } from './paper.mjs';

export function quarters(C, I, c, open) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  const port = (x1 + x2) / 2 < 0, s = port ? 1 : -1, wall = port ? x1 : x2;
  // Racks three high along the outboard wall, a double locker between each, the curtains drawn by whoever is in.
  let k = 0;
  for (let z = z1 + 1.6; z < z2 - 1.2; z += 3.2, k++) {
    place(I, rack(c.id.length * 13 + k * 7), wall + s * 0.5, z, { ry: port ? Math.PI / 2 : -Math.PI / 2 });
    place(I, locker(0.9), wall + s * 0.3, z + 1.6, { ry: port ? Math.PI / 2 : -Math.PI / 2 });
  }
  // The other side: lockers down the inboard wall where there is no door, a table with its stools in the middle.
  const inner = port ? x2 : x1;
  const side = port ? 'e' : 'w';
  for (let z = z1 + 0.6; z < z2 - 0.4; z += 0.66) {
    if (open[side].some((o) => o.a < z + 1.2 && o.b > z - 1.2)) continue;
    place(I, locker(0.6), inner - s * 0.3, z, { ry: port ? -Math.PI / 2 : Math.PI / 2 });
  }
  const t = messTable(2.6, 2, { stoolMat: P.pad });
  place(I, t, (x1 + x2) / 2 + s * 0.4, (z1 + z2) / 2 + 3.2, { ry: Math.PI / 2 });
  // A screen on the forward bulkhead, the poster asking for quiet, a kit bag or two on the deck.
  I.screen('text', (x1 + x2) / 2, 1.8, z1 + 0.14, 0, '#ffb070', 1.2, 0.7);
  poster(C, I, 'quiet', 1.1, 0.5, (x1 + x2) / 2, 2.35, z2 - 0.12, Math.PI);
  poster(C, I, 'suit', 0.62, 0.86, (x1 + x2) / 2 + 1.6, 1.6, z1 + 0.12, 0);
  const r = mulberry(c.id.length * 5);
  for (let i = 0; i < 3; i++) place(I, G(at(cyl(0.18, 0.18, 0.7, r() < 0.5 ? P.olive : P.blanket, 8), 0, 0.18, 0, 0, 0, Math.PI / 2)), wall + s * (1.3 + r() * 0.3), z1 + 1.6 + Math.floor(r() * 4) * 3.2 + 0.4, { ry: r() * 3, collide: false });
}
