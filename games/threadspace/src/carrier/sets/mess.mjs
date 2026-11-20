// The mess, built as a set (sets.mjs `SETS`).

import { box, cyl, at, glow } from '../../util.mjs';
import { P, G, messTable, place } from './parts.mjs';
import { poster, wallScreen } from './paper.mjs';

export function mess(C, I, c) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  // Tables across the room, stools bolted either side; the first row's inboard stool is where a hand sits at dinner
  // (the layout's station).
  const tx = x1 + 5.4, len = 4.2;
  for (const z of [z1 + 3.35, z1 + 7.65, z1 + 11.95]) place(I, messTable(len, 3), tx, z);
  // The aft end: the drinks bar and the tray return.
  const bar = G(at(box(4.4, 0.92, 0.7, P.stainlessDk), 0, 0.46, 0), at(box(4.5, 0.05, 0.75, P.stainless), 0, 0.945, 0));
  for (let i = 0; i < 3; i++) {
    const x = -1.5 + i * 1.5;
    bar.add(at(box(0.6, 0.75, 0.5, P.dark), x, 1.35, -0.1));
    bar.add(at(box(0.36, 0.2, 0.02, glow(['#ffb347', '#58b0ff', '#e0e0e0'][i], 0.9)), x, 1.55, 0.16));
    bar.add(at(box(0.18, 0.02, 0.2, P.black), x, 1.02, 0.05));
  }
  place(I, bar, tx, z2 - 0.4, { ry: Math.PI });
  place(I, G(at(box(1.4, 1.4, 0.5, P.steel), 0, 0.7, 0), ...[0.3, 0.55, 0.8, 1.05].map((yy) => at(box(1.3, 0.04, 0.45, P.light), 0, yy, 0.02))), x2 - 0.35, z2 - 2.6, { ry: -Math.PI / 2 });
  // The outboard wall: a long counter (condiments, cutlery, the urn), the menu over it.
  const ctr = G(at(box(5.2, 0.9, 0.6, P.stainlessDk), 0, 0.45, 0), at(box(5.3, 0.05, 0.65, P.stainless), 0, 0.925, 0));
  ctr.add(at(cyl(0.2, 0.2, 0.55, P.chrome, 12), -1.8, 1.23, 0), at(box(0.06, 0.06, 0.12, P.dark), -1.8, 1.08, 0.22));
  for (let i = 0; i < 6; i++) ctr.add(at(box(0.28, 0.14, 0.2, [P.red, P.white, P.yellow, P.green][i & 3]), -0.6 + i * 0.36, 1.02, 0));
  place(I, ctr, x2 - 0.35, z1 + 6.5, { ry: -Math.PI / 2 });
  poster(C, I, 'menu', 1.1, 1.4, x2 - 0.13, 1.95, z1 + 6.5, -Math.PI / 2);
  wallScreen(I, 'status', x2 - 0.15, 2.0, z1 + 10.6, -Math.PI / 2, '#e0b060', 1.6, 0.8);
  // The forward bulkhead: the ship's crest and the notice board.
  poster(C, I, 'crest', 1.7, 1.7, tx + 0.4, 1.75, z1 + 0.12, 0);
  poster(C, I, 'board', 1.6, 1.0, x2 - 1.6, 1.6, z1 + 0.12, 0, 7);
  poster(C, I, 'breach', 1.0, 0.62, x1 + 2.6, 2.0, z1 + 0.12, 0);
  // The inboard wall, either side of the door.
  poster(C, I, 'loose', 0.8, 0.5, x1 + 0.12, 1.7, z1 + 3.4, Math.PI / 2);
  poster(C, I, 'burn', 0.62, 0.86, x1 + 0.12, 1.6, z2 - 3.2, Math.PI / 2);
}
