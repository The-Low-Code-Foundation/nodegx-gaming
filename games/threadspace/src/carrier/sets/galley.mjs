// The galley, built as a set (sets.mjs `SETS`).

import * as THREE from 'three';
import { box, cyl, at, mat, glow } from '../../util.mjs';
import { P, G, place } from './parts.mjs';
import { poster } from './paper.mjs';

export function galley(C, I, c) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  const cx = (x1 + x2) / 2;
  // The cooking line along the forward bulkhead: ranges, the combi ovens, the kettle, under one hood.
  const line = new THREE.Group();
  const W = x2 - x1 - 0.4;
  line.add(at(box(W, 0.9, 0.85, P.stainlessDk), 0, 0.45, 0), at(box(W, 0.05, 0.9, P.stainless), 0, 0.925, 0));
  for (const x of [-2.2, -1.4]) {
    line.add(at(box(0.7, 0.02, 0.6, P.black), x, 0.96, 0));
    for (const [dx, dz] of [[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]]) line.add(at(cyl(0.12, 0.12, 0.012, glow('#5a1408'), 12), x + dx, 0.975, dz));
  }
  line.add(at(cyl(0.16, 0.16, 0.24, P.chrome, 12), -2.37, 1.1, -0.15), at(cyl(0.22, 0.2, 0.14, P.dark, 12), -1.25, 1.04, 0.12));
  line.add(at(box(1.0, 1.1, 0.8, P.stainless), 0.1, 1.5, -0.02), at(box(0.7, 0.5, 0.02, P.black), 0.1, 1.55, 0.39), at(box(0.12, 0.05, 0.02, glow('#39d27a')), 0.48, 1.9, 0.39));
  line.add(at(cyl(0.42, 0.36, 0.55, P.stainless, 14), 1.4, 1.2, 0), at(box(0.12, 0.5, 0.1, P.dark), 1.9, 1.15, 0));
  line.add(at(box(0.8, 0.02, 0.6, P.stainlessDk), 2.4, 0.97, 0));
  // the hood, and its filters
  line.add(at(box(W, 0.5, 1.1, P.stainless), 0, 2.6, 0.1), at(box(W - 0.2, 0.02, 0.9, mat('#5d646c')), 0, 2.34, 0.15));
  for (let i = 0; i < 6; i++) line.add(at(box(0.04, 0.2, 0.9, P.stainlessDk), -W / 2 + 0.6 + i * (W - 1.2) / 5, 2.44, 0.15));
  place(I, line, cx, z1 + 0.5, { ry: 0, collide: true });
  // Prep along the aft bulkhead: counters, two sinks, the dishwasher, pots on the shelf over them.
  const prep = new THREE.Group();
  prep.add(at(box(W, 0.9, 0.7, P.stainlessDk), 0, 0.45, 0), at(box(W, 0.05, 0.75, P.stainless), 0, 0.925, 0));
  for (const x of [-1.6, -0.8]) prep.add(at(box(0.6, 0.03, 0.45, P.black), x, 0.94, 0.05), at(box(0.04, 0.3, 0.04, P.chrome), x, 1.1, -0.25));
  prep.add(at(box(0.9, 0.85, 0.66, P.stainless), 1.3, 0.43, 0.04), at(box(0.1, 0.04, 0.02, glow('#58b0ff')), 1.6, 0.8, 0.38));
  prep.add(at(box(W, 0.04, 0.4, P.stainless), 0, 1.75, -0.15));
  for (let i = 0; i < 6; i++) prep.add(at(cyl(0.13 + (i % 3) * 0.04, 0.13 + (i % 3) * 0.04, 0.18 + (i % 2) * 0.12, P.chrome, 10), -2.3 + i * 0.9, 1.88 + (0.09 + (i % 2) * 0.06), -0.15));
  place(I, prep, cx, z2 - 0.42, { ry: Math.PI });
  // The prep island, with a hanging rail of pans over it; tall fridges in the corners.
  const island = G(at(box(2.4, 0.9, 0.9, P.stainlessDk), 0, 0.45, 0), at(box(2.5, 0.06, 1.0, mat('#8a6a48')), 0, 0.93, 0));
  for (let i = 0; i < 4; i++) island.add(at(box(0.3, 0.06, 0.2, P.white), -0.8 + i * 0.5, 0.99, (i % 2 ? 0.2 : -0.2)));
  place(I, island, cx, z2 - 2.55);
  I.group.add(at(box(2.2, 0.04, 0.04, P.chrome), cx, y + 2.35, z2 - 2.55));
  for (let i = 0; i < 5; i++) I.group.add(at(cyl(0.15, 0.13, 0.08, P.dark, 10), cx - 0.9 + i * 0.45, y + 2.1, z2 - 2.55), at(box(0.02, 0.22, 0.02, P.chrome), cx - 0.9 + i * 0.45, y + 2.24, z2 - 2.55));
  for (const s of [-1, 1]) {
    const fr = G(at(box(0.9, 2.1, 0.75, P.stainless), 0, 1.05, 0), at(box(0.01, 2.0, 0.01, P.black), 0, 1.05, 0.38), at(box(0.03, 0.4, 0.04, P.chrome), -0.06, 1.2, 0.4), at(box(0.03, 0.4, 0.04, P.chrome), 0.06, 1.2, 0.4));
    place(I, fr, s < 0 ? x1 + 0.45 : x2 - 0.45, z2 - 2.2, { ry: s < 0 ? Math.PI / 2 : -Math.PI / 2 });
  }
  poster(C, I, 'loose', 0.8, 0.5, x1 + 0.12, 1.7, z1 + 2.6, Math.PI / 2);
}
