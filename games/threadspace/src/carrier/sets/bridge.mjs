// The bridge, built as a set (sets.mjs `SETS`).

import { box, cyl, at, mat, glow } from '../../util.mjs';
import { screen } from '../../decor.mjs';
import { P, couch, desk, locker, place } from './parts.mjs';
import { poster } from './paper.mjs';

export function bridge(C, I, c, hooks) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  // Laid out from the helm (the layout's `helm.at`: today's ship has it 3.5 m in from the forward bulkhead), so the
  // set stands in any ship's bridge.
  const hz = C.L.helm?.at[1] ?? z1 + 3.5;
  // The helm forward, under the windows, flanked by navigation and sensors; the officer of the watch's couch on a step
  // behind; the status and comms banks on the side walls; the plot over the aft door.
  place(I, desk(3.0, '#58b0ff', ['nav', 'target', 'nav'], { low: true }), 0, hz - 1.7);
  place(I, couch(P.pad), 0, hz);
  I.use('helm', 'Take the helm', 0, hz - 0.4, () => hooks.helm?.(), { r: 2.2 });
  for (const s of [-1, 1]) {
    place(I, desk(2.4, s < 0 ? '#39d27a' : '#ff6a50', s < 0 ? ['nav', 'status'] : ['radar', 'target']), s * 4, hz + 0.3);
    place(I, couch(P.pad, { low: true }), s * 4, hz + 2);
  }
  // The command step: a low dais, its couch, two repeaters on arms.
  place(I, box(4.2, 0.18, 2.6, P.dark), 0, hz + 7, { y: 0.09, collide: false });
  I.group.add(at(box(4.2, 0.02, 0.04, glow('#2f6fc0')), 0, y + 0.18, hz + 5.7));
  place(I, couch(mat('#5a4a30')), 0, hz + 7, { y: 0.18 });
  for (const s of [-1, 1]) {
    I.group.add(at(cyl(0.03, 0.03, 0.6, P.steel, 6), s * 0.75, y + 0.9, hz + 6.4));
    I.group.add(at(screen(s < 0 ? 'status' : 'radar', '#58b0ff', 0.42, 0.28), s * 0.75, y + 1.3, hz + 6.25, -0.3, s * -0.4, 0));
    I.group.add(at(box(0.46, 0.32, 0.03, P.black), s * 0.75, y + 1.3, hz + 6.28, -0.3, s * -0.4, 0));
  }
  place(I, desk(2.6, '#ffb347', ['status', 'reactor']), x1 + 0.75, hz + 7.5, { ry: Math.PI / 2 });
  place(I, desk(2.6, '#b48cff', ['text', 'status']), x2 - 0.75, hz + 7.5, { ry: -Math.PI / 2 });
  // Overhead: a ring of repeaters over the helm, out of the line of the windows.
  I.group.add(at(box(3.4, 0.06, 0.5, P.dark), 0, y + 3.3, hz + 1.4));
  for (const s of [-1, 0, 1]) I.group.add(at(screen(['status', 'nav', 'status'][s + 1], '#58b0ff', 0.9, 0.36), s * 1.05, y + 3.05, hz + 1.62, 0.25, Math.PI, 0));
  // The aft bulkhead: the big plot over the door, lockers and the damage board either side of it.
  I.screen('map', 0, 2.65, z2 - 0.14, Math.PI, '#58b0ff', 3.2, 0.9);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) place(I, locker(0.6), s * (2.6 + k * 0.64), z2 - 0.3, { ry: Math.PI });
    poster(C, I, s < 0 ? 'burn' : 'suit', 0.62, 0.86, s < 0 ? -5.0 : 4.85, 1.55, z2 - 0.12, Math.PI);
  }
  // Grab rails along the side walls, for when she turns hard (weightless, weightless.mjs puts rails on every wall).
  if (!c.float) for (const s of [-1, 1]) I.group.add(at(box(0.04, 0.04, 9, P.chrome), s * (x2 - 0.12), y + 1.15, hz + 3));
}
