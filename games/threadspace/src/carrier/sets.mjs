// The carrier's rooms dressed as places, not boxes. layout.mjs builds the walls and calls in here for three things:
//
// - `roomSurfaces(c)`: the room's walls, deck and deckhead. Five wall finishes (panelled, padded, bare structure, tile,
//   and the passages' own), three decks (plating, tread plate, non-slip), each a canvas texture tinted per kind of room,
//   with the grime and scuffs a lived-in ship collects low down. `LOOK` says which room gets what, and its lamps.
// - `roomLights(I, c)`: the lamps, coloured and as bright as the room's kind wants (the command spaces dim, the galley
//   and the sick bay bright), and laid out over what the room is for where a set says so.
// - `dressRoom(C, I, c, open)`: the ship's structure showing in every room: a frame (a stiffener up each long wall
//   under each deckhead beam), the cable tray and pipe runs along the deckhead with their colour bands, and lit coves.
// - `SETS[id](C, I, c, hooks, open)`: the rooms that are built as a set of their own: the bridge, the CIC, the mess and
//   the galley, the crew's quarters, the sick bay and engineering control; `dressHangar` adds to the hangar.
//
// Everything is boxes and cylinders on a small shared palette, so a room still bakes into a dozen meshes (decor.mjs
// `bake`). Posters and notices are drawn on a lit atlas (`C.paper`): one material for every printed sheet aboard. The
// few things that move (the CIC's plot) are `userData.live` and ticked by `setsFrame`.

import { rack, locker, messTable, shelfRack } from './sets/parts.mjs';
import { poster } from './sets/paper.mjs';
import { bridge } from './sets/bridge.mjs';
import { cic } from './sets/cic.mjs';
import { mess } from './sets/mess.mjs';
import { galley } from './sets/galley.mjs';
import { quarters } from './sets/quarters.mjs';
import { medbay } from './sets/medbay.mjs';
import { engControl } from './sets/eng-control.mjs';
import { drumQuarters, drumMess, drumGalley, drumMedbay } from './sets/drum-sets.mjs';
export { P, couch, desk } from './sets/parts.mjs';
export { dressHangar } from './sets/hangar.mjs';
export { dressRoom } from './sets/structure.mjs';
export { lookKey, lookOf, roomSurfaces } from './sets/surfaces.mjs';
export { roomLights } from './sets/lamps.mjs';

// --- the sets ------------------------------------------------------------------------------------------------------

/** One set per room id. Each takes (C, I, c, hooks, open) like layout.mjs `furnish`. */
export const SETS = {
  bridge, cic, mess, galley, medbay, 'eng-control': (C, I, c, h, open) => engControl(C, I, c, open),
  'quarters-a': (C, I, c, h, open) => quarters(C, I, c, open),
  'quarters-b': (C, I, c, h, open) => quarters(C, I, c, open),
  'quarters-c': (C, I, c, h, open) => quarters(C, I, c, open)
};

/** The set for drum room `c`, by what the room is for (the galley by name), or null for its fit. */
export function drumSet(c) {
  if (c.id === 'galley') return drumGalley;
  return { berths: drumQuarters, mess: drumMess, medical: drumMedbay }[c.use] ?? null;
}

/** Each frame: what moves in the sets. */
export function setsFrame(C, dt, t) {
  for (const f of C.anim ?? []) f(dt, t);
}

export { messTable, locker, rack, shelfRack, poster };
