// The ship's structure showing in every room (sets.mjs `dressRoom`): frames, deckhead services with their colour
// bands, lit coves.

import * as THREE from 'three';
import { box, at, mat, glow } from '../../util.mjs';
import { lookOf } from './surfaces.mjs';
import { P, rod } from './parts.mjs';

// --- every room: the structure showing ------------------------------------------------------------------------------

const BANDS = [P.green, P.blue, P.brown, P.orange];
/** Which long wall a room's deckhead services run along (null: none, the set has its own). */
const SERVICES = { galley: null, 'eng-control': null, medbay: 'w', mess: 'w', cic: 'e', bridge: 's' };
export const pipeMat = mat('#8a9098');

/** Frames, deckhead services and lit coves for an ordinary room (not a passage, not the hangar). */
export function dressRoom(C, I, c, open) {
  if (c.system === 'corridor' || c.system === 'hangar') return;
  const L = lookOf(c), S = I.s, y = I.floorY, h = c.h ?? 3;
  const [x1, x2] = c.x, [z1, z2] = c.z;
  const w = x2 - x1, d = z2 - z1;
  const alongZ = d >= w, span = alongZ ? d : w, across = alongZ ? w : d;
  const g = I.group;
  // A frame under each deckhead beam (layout.mjs `room` puts the beams every 3 m along the long way): a stiffener up each
  // long wall, with a bracket where it meets the beam. Not across a door or a window.
  const walls = alongZ ? [['w', x1, 1], ['e', x2, -1]] : [['n', z1, 1], ['s', z2, -1]];
  const c0 = alongZ ? (z1 + z2) / 2 : (x1 + x2) / 2;
  for (let t = -span / 2 + 1.5; t < span / 2 - 0.5; t += 3) {
    const a = c0 + t;
    for (const [side, line, inward] of walls) {
      if (open[side].some((o) => o.a < a + 0.45 && o.b > a - 0.45)) continue;
      if ((I.onWalls ?? []).some((m) => Math.abs((alongZ ? m.z : m.x) - a) < m.w / 2 + 0.25 && Math.abs((alongZ ? m.x : m.z) - line) < 0.6)) continue;
      const p = line + inward * 0.17;
      g.add(alongZ ? at(box(0.14, h - 0.1, 0.2, S.trim), p, y + h / 2, a) : at(box(0.2, h - 0.1, 0.14, S.trim), a, y + h / 2, p));
      g.add(alongZ ? at(box(0.34, 0.34, 0.1, S.trim), line + inward * 0.27, y + h - 0.3, a, 0, 0, inward * 0.78) : at(box(0.1, 0.34, 0.34, S.trim), a, y + h - 0.3, line + inward * 0.27, -inward * 0.78, 0, 0));
    }
  }
  // Services along the deckhead, against the long wall with fewer doors: a cable tray and two pipes, banded by what
  // they carry, hung from the beams.
  const pref = SERVICES[c.id];
  if (across >= 3.6 && pref !== null) {
    const doors = (k) => open[k].length + (open[k].some((o) => o.kind === 'window') ? 9 : 0);
    // (A preferred wall that is not one of this room's long walls, as in a drum room of the same name, is ignored.)
    const [, line, inward] = (pref && walls.find((w) => w[0] === pref)) || (doors(walls[0][0]) <= doors(walls[1][0]) ? walls[0] : walls[1]);
    const len = span - 0.1;
    const run = (off, yy, mesh) => g.add(alongZ ? at(mesh, line + inward * off, y + h - yy, c0) : at(mesh, c0, y + h - yy, line + inward * off));
    run(0.55, 0.36, alongZ ? box(0.46, 0.04, len, P.steel) : box(len, 0.04, 0.46, P.steel));
    for (const e of [-0.22, 0.22]) run(0.55 + e, 0.31, alongZ ? box(0.02, 0.1, len, P.steel) : box(len, 0.1, 0.02, P.steel));
    [[0.42, P.cable, 0.04], [0.52, P.cableG, 0.035], [0.62, P.cableO, 0.03], [0.7, P.cable, 0.045]].forEach(([o, m, r]) => run(o, 0.3, rod(r, len, m, alongZ ? 'z' : 'x', 6)));
    const pipes = [[1.0, 0.26, 0.06], [1.18, 0.3, 0.045]];
    pipes.forEach(([o, yy, r], i) => {
      run(o, yy, rod(r, len, pipeMat, alongZ ? 'z' : 'x', 8));
      for (let t = -span / 2 + 0.8 + i * 0.6; t < span / 2 - 0.4; t += 3) {
        const a = c0 + t, band = rod(r + 0.01, 0.16, BANDS[(i + Math.round(c0)) & 3], alongZ ? 'z' : 'x', 8);
        g.add(alongZ ? at(band, line + inward * o, y + h - yy, a) : at(band, a, y + h - yy, line + inward * o));
      }
    });
    for (let t = -span / 2 + 0.75; t < span / 2; t += 1.5) {
      const a = c0 + t;
      for (const o of [0.33, 0.77]) g.add(alongZ ? at(box(0.02, 0.3, 0.02, P.steel), line + inward * o, y + h - 0.17, a) : at(box(0.02, 0.3, 0.02, P.steel), a, y + h - 0.17, line + inward * o));
    }
  }
  // A lit cove along the top of every wall without a window in it.
  if (L.cove) {
    const cm = glow(new THREE.Color(L.cove).multiplyScalar(0.75).getStyle(), 1);
    for (const [side, line, a0, b0, alongX, inward] of [['n', z1, x1, x2, true, 1], ['s', z2, x1, x2, true, -1], ['w', x1, z1, z2, false, 1], ['e', x2, z1, z2, false, -1]]) {
      if (open[side].some((o) => o.kind === 'window')) continue;
      const len = b0 - a0 - 0.6, mid = (a0 + b0) / 2;
      if (len < 0.5) continue;
      g.add(alongX ? at(box(len, 0.025, 0.04, cm), mid, y + h - 0.2, line + inward * 0.19) : at(box(0.04, 0.025, len, cm), line + inward * 0.19, y + h - 0.2, mid));
    }
  }
}
