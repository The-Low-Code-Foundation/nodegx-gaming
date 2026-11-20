// A room's lamps (sets.mjs `roomLights`): coloured and as bright as the room's kind wants, laid out over what the
// room is for where a set says so.

import { lookOf } from './surfaces.mjs';

// --- the lamps -----------------------------------------------------------------------------------------------------

/** Rooms whose lamps hang over what matters in them, as [x, z] in the room's own box (0 to 1 each way). */
const LAMPS = {
  mess: [[0.54, 0.2], [0.54, 0.45], [0.54, 0.7], [0.6, 0.92]],
  galley: [[0.3, 0.25], [0.7, 0.25], [0.5, 0.75]],
  medbay: [[0.55, 0.15], [0.7, 0.42], [0.7, 0.62], [0.5, 0.88]],
  cic: [[0.5, 0.5]],
  'eng-control': [[0.25, 0.3], [0.75, 0.3], [0.25, 0.75], [0.75, 0.75]]
};

export function roomLights(I, c) {
  const L = lookOf(c);
  const [x1, x2] = c.x, [z1, z2] = c.z, h = c.h ?? 3;
  const w = x2 - x1, d = z2 - z1, big = h > 6;
  const inten = (big ? 60 : 16) * L.k, dist = big ? 34 : 12;
  if (LAMPS[c.id]) {
    for (const [u, v] of LAMPS[c.id]) I.light(x1 + w * u, z1 + d * v, L.lamp, inten, dist, I.floorY + h);
    return;
  }
  const step = big ? 16 : 8;
  const nx = Math.max(1, Math.round(w / step)), nz = Math.max(1, Math.round(d / step));
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    I.light(x1 + (w * (i + 0.5)) / nx, z1 + (d * (k + 0.5)) / nz, L.lamp, inten, dist, I.floorY + h);
  }
}
