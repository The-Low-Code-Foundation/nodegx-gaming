// Engineering control, built as a set (sets.mjs `SETS`).

import { box, at, mat, glow } from '../../util.mjs';
import { P, G, rod, couch, desk, locker, place } from './parts.mjs';
import { MONO, text, poster, mark } from './paper.mjs';
import { pipeMat } from './structure.mjs';
import { gimbal } from '../floating.mjs';
import { bake } from '../../decor.mjs';

export function engControl(C, I, c, open = { n: [], s: [], w: [], e: [] }) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY, h = c.h ?? 3;
  // Laid out from the aft bulkhead (the window onto the reactor) and the room's middle, across its width (drawn for
  // today's ship's 16 m room: `X` scales an x across a narrower one).
  const cx = (x1 + x2) / 2, k = Math.min(1, (x2 - x1) / 16), X = (x) => cx + x * k, Z = (z) => z2 - (146 - z);
  const sideDoor = open.w.some((o) => o.kind === 'door'); // the mimic board's wall has the door in it: the board goes forward
  // The watch keepers' bank under the window onto the reactor: three desks (the layout's two posts stand at the outer
  // ones), a hazard line along the sill.
  place(I, desk(3.0, '#ffb347', ['status', 'reactor', 'status']), X(-4), Z(143.85), Math.PI);
  place(I, desk(3.0, '#ff6a2a', ['reactor', 'target', 'reactor']), X(4), Z(143.85), Math.PI);
  place(I, desk(2.2, '#ffd040', ['status', 'nav']), cx, Z(144.0), Math.PI);
  // The engineer's dais behind, its couch facing the window, repeaters on arms.
  place(I, box(3.2, 0.2, 2.4, P.dark), cx, Z(139.3), 0, { y: 0.1 });
  I.group.add(at(box(3.2, 0.02, 0.05, glow('#ffb347', 0.7)), cx, y + 0.2, Z(140.5)));
  place(I, desk(2.4, '#ffb347', ['status', 'reactor']), cx, Z(140.0), Math.PI, { y: 0.2 });
  gimbal(C, place(I, couch(mat('#5a4a30')), cx, Z(139.0), Math.PI, { y: 0.2 }), bake); // swings to face the bow for a burn
  // The mimic board down the port bulkhead: the plant as a diagram, lit.
  const mimic = C.atlas.plane(9, 1.7, (g, pw, ph) => {
    g.fillStyle = '#0c1014';
    g.fillRect(0, 0, pw, ph);
    g.strokeStyle = '#2a3440';
    g.lineWidth = 6;
    g.strokeRect(3, 3, pw - 6, ph - 6);
    const box2 = (x, yy, w, hh, label, col) => {
      g.strokeStyle = col;
      g.lineWidth = 4;
      g.strokeRect(x * pw, yy * ph, w * pw, hh * ph);
      text(g, label, (x + w / 2) * pw, (yy + hh / 2) * ph, MONO(ph * 0.07, 700), col, 'center');
    };
    const line = (pts, col) => {
      g.strokeStyle = col;
      g.lineWidth = 5;
      g.beginPath();
      pts.forEach(([a, b], i) => (i ? g.lineTo(a * pw, b * ph) : g.moveTo(a * pw, b * ph)));
      g.stroke();
    };
    box2(0.04, 0.3, 0.14, 0.4, 'REACTOR', '#ff6a2a');
    box2(0.26, 0.12, 0.12, 0.25, 'PUMP A', '#39d27a');
    box2(0.26, 0.62, 0.12, 0.25, 'PUMP B', '#39d27a');
    box2(0.46, 0.3, 0.14, 0.4, 'HEAT EXCH', '#ffb347');
    box2(0.68, 0.12, 0.12, 0.25, 'SINKS', '#ff8a5a');
    box2(0.68, 0.62, 0.12, 0.25, 'RADIATORS', '#ff8a5a');
    box2(0.86, 0.3, 0.1, 0.4, 'DRIVE', '#ff9a40');
    line([[0.18, 0.4], [0.26, 0.25]], '#58b0ff');
    line([[0.18, 0.6], [0.26, 0.75]], '#58b0ff');
    line([[0.38, 0.25], [0.46, 0.4]], '#58b0ff');
    line([[0.38, 0.75], [0.46, 0.6]], '#58b0ff');
    line([[0.6, 0.4], [0.68, 0.25]], '#ff8a5a');
    line([[0.6, 0.6], [0.68, 0.75]], '#ff8a5a');
    line([[0.8, 0.25], [0.86, 0.4]], '#ffd040');
    line([[0.8, 0.75], [0.86, 0.6]], '#ffd040');
    text(g, 'PRIMARY LOOP · NOMINAL', 0.04 * pw, 0.12 * ph, MONO(ph * 0.06, 700), '#9fb0c0');
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i === 9 ? '#ffb347' : '#39d27a';
      g.beginPath();
      g.arc((0.06 + i * 0.065) * pw, 0.92 * ph, ph * 0.025, 0, Math.PI * 2);
      g.fill();
    }
  }, 110);
  if (sideDoor) {
    I.group.add(at(mimic, cx, y + 1.95, z1 + 0.14, 0, 0, 0));
    I.group.add(at(box(9.2, 1.9, 0.06, P.black), cx, y + 1.95, z1 + 0.11));
  } else {
    I.group.add(at(mimic, x1 + 0.14, y + 1.95, (z1 + z2) / 2 - 0.5, 0, Math.PI / 2, 0));
    mark(I, x1, (z1 + z2) / 2 - 0.5, 9.2);
    I.group.add(at(box(0.06, 1.9, 9.2, P.black), x1 + 0.11, y + 1.95, (z1 + z2) / 2 - 0.5));
  }
  // The starboard bulkhead: the switchboard, cabinet after cabinet of breakers.
  for (let i = 0; i < 9; i++) {
    const z = z1 + 2.2 + i * 1.05;
    const cab = G(at(box(1.0, 2.2, 0.6, mat('#3e4650')), 0, 1.1, 0));
    for (let k = 0; k < 4; k++) cab.add(at(box(0.8, 0.02, 0.01, P.black), 0, 0.5 + k * 0.42, 0.305));
    cab.add(at(box(0.08, 0.06, 0.01, glow(i === 6 ? '#ffb347' : '#39d27a')), -0.3, 1.9, 0.31), at(box(0.4, 0.12, 0.01, P.sheet), 0.1, 1.95, 0.305));
    place(I, cab, x2 - 0.35, z, { ry: -Math.PI / 2 });
  }
  // The forward bulkhead either side of the door: suit lockers, the tool board, the fire point.
  if (sideDoor) for (let i = 0; i < 4; i++) place(I, locker(0.6), x1 + 0.3, z1 + 1.2 + i * 0.66, { ry: Math.PI / 2 });
  else for (let i = 0; i < 4; i++) place(I, locker(0.6), x1 + 0.6 + i * 0.66, z1 + 0.3);
  if (!sideDoor) place(I, G(at(box(2.2, 1.2, 0.05, mat('#4a5058')), 0, 1.5, 0), ...[...Array(12)].map((_, i) => at(box(0.05, 0.25 + (i % 3) * 0.08, 0.03, [P.red, P.yellow, P.steel][i % 3]), -0.9 + i * 0.16, 1.5, 0.04))), x2 - 2.0, z1 + 0.1, { collide: false });
  if (!sideDoor) poster(C, I, 'loose', 0.8, 0.5, X(2.0), 2.4, z1 + 0.12, 0);
  // Heavy runs overhead, and a hazard line at the window's sill.
  for (const [x, r, m] of [[-6.5, 0.16, mat('#8a7a50')], [-6.0, 0.12, pipeMat], [6.2, 0.14, pipeMat]]) I.group.add(at(rod(r, z2 - z1 - 0.2, m, 'z', 10), X(x), y + h - 0.35, (z1 + z2) / 2));
  I.group.add(at(box(12 * k, 0.04, 0.12, I.s.trim), cx, y + 0.9, z2 - 0.1));
}
