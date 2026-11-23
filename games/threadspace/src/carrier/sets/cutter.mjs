// A small ship's rooms, built as sets (sets.mjs `SETS`): the flight deck, the crew space, the galley and mess nook,
// and engineering control of a ship of the cutter's size (ships/cutter/, tools/cutter.mjs). Each is laid out from its
// own box and the layout's `helm` and `couches`, so it stands in any small ship that has rooms by these ids.
// Weightless rooms: no chairs, foot rails where someone works, the couches for a burn.

import * as THREE from 'three';
import { box, cyl, at, mat, glow } from '../../util.mjs';
import { P, couch, desk, locker, messTable, place } from './parts.mjs';

// The flight deck: its stations, live screens and switches are a module of their own (sets/flight-deck.mjs).
export { flightDeck } from './flight-deck.mjs';

/** The crew space: four bunks (weightless: sleeping bags on boards, two a wall bay) down the outboard wall, a locker
 *  each on the end wall. */
export function crewSpace(C, I, c, hooks, open = { n: [], s: [], w: [], e: [] }) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  // The wall away from the door is the bunks' wall.
  const doorE = open.e.some((o) => o.kind === 'door'), wx = doorE ? x1 : x2, s = doorE ? 1 : -1, ry = doorE ? Math.PI / 2 : -Math.PI / 2;
  const n = 4, len = z2 - z1 - 0.6;
  for (let i = 0; i < n; i++) {
    const z = z1 + 0.3 + (len * (i + 0.5)) / n;
    const g = bunk();
    g.position.set(wx + s * 0.12, y, z);
    g.rotation.y = ry;
    I.group.add(g);
    if (i) I.group.add(at(box(0.5, 2.3, 0.05, mat('#7a828c')), wx + s * 0.3, y + 1.2, z1 + 0.3 + (len * i) / n)); // a privacy fin between bunks
  }
  for (let k = 0; k < 2; k++) place(I, locker(0.6), (doorE ? x2 : x1) - s * (0.75 + k * 0.64), z1 + 0.32, 0);
  for (let k = 0; k < 2; k++) place(I, locker(0.6), (doorE ? x2 : x1) - s * (0.75 + k * 0.64), z2 - 0.32, Math.PI);
}

/** A weightless bunk: a padded board on the wall, a sleeping bag strapped to it, a reading lamp and a pocket. Its back
 *  is at z = 0 and it faces +z. */
function bunk() {
  const g = [at(box(0.9, 2.05, 0.05, mat('#5b626c')), 0, 1.2, 0.03), at(box(0.7, 1.8, 0.2, mat('#4d6a86')), 0, 1.12, 0.14), at(box(0.52, 0.3, 0.16, mat('#c9c4b6')), 0, 2.06, 0.13),
    at(box(0.16, 0.05, 0.06, glow('#ffe2b0')), 0.32, 2.3, 0.06), at(box(0.3, 0.22, 0.04, mat('#3a4a60')), -0.3, 0.45, 0.07)];
  for (const yy of [0.6, 1.25, 1.75]) g.push(at(box(0.76, 0.05, 0.02, mat('#c8a030')), 0, yy, 0.25));
  const o = new THREE.Group();
  o.add(...g);
  return o;
}

/** The galley and mess nook: a counter with the oven and water point down the outboard wall, a small table to stand
 *  at (foot rails, no stools), stores lockers. */
export function messNook(C, I, c, hooks, open = { n: [], s: [], w: [], e: [] }) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  const doorW = open.w.some((o) => o.kind === 'door'), wx = doorW ? x2 : x1, s = doorW ? -1 : 1, cz = (z1 + z2) / 2;
  // The counter: a steel top, the oven and the water point on it, lockers over it.
  place(I, box(0.6, 0.95, z2 - z1 - 0.5, P.steel), wx + s * 0.4, cz, 0, { y: 0.475 });
  I.group.add(at(box(0.62, 0.04, z2 - z1 - 0.5, mat('#2a3442')), wx + s * 0.4, y + 0.97, cz));
  I.group.add(at(box(0.45, 0.4, 0.55, P.dark), wx + s * 0.38, y + 1.2, cz - 0.7), at(box(0.02, 0.24, 0.36, glow('#ffb347', 0.8)), wx + s * 0.62, y + 1.2, cz - 0.7));
  I.group.add(at(cyl(0.12, 0.12, 0.45, mat('#4a7088'), 10), wx + s * 0.38, y + 1.22, cz + 0.6));
  I.group.add(at(box(0.4, 0.5, z2 - z1 - 0.7, mat('#4a5a6e')), wx + s * 0.3, y + 2.3, cz));
  // The table, across the room's inboard half: you stand at it.
  place(I, messTable(1.4, 2, { stools: false }), (doorW ? x1 : x2) - s * 1.25, z1 + 0.75, 0);
}

/** Engineering control: the engineer's console under the window onto the reactor, the plant's boards either side, a
 *  couch for a burn. */
export function engRoom(C, I, c, hooks, open = { n: [], s: [], w: [], e: [] }) {
  const [x1, x2] = c.x, [z1, z2] = c.z, cx = (x1 + x2) / 2;
  const aft = open.s.some((o) => o.kind === 'window'); // the window's wall is the console's
  const wz = aft ? z2 : z1, s = aft ? -1 : 1;
  place(I, desk(2.6, '#ffb347', ['status', 'reactor', 'status']), cx, wz + s * 0.75, aft ? Math.PI : 0);
  place(I, desk(1.5, '#ff6a2a', ['reactor', 'target']), x1 + 0.45, (z1 + z2) / 2 + 0.2, Math.PI / 2);
  place(I, desk(1.5, '#ffd040', ['status', 'nav']), x2 - 0.45, (z1 + z2) / 2 + 0.2, -Math.PI / 2);
  place(I, couch(mat('#5a4a30'), { low: true }), cx + 1.9, wz + s * 2.5, aft ? Math.PI : 0);
  for (let k = 0; k < 2; k++) place(I, locker(0.6), x1 + 0.75 + k * 0.64, (aft ? z1 : z2) - s * 0.32, aft ? 0 : Math.PI);
}
