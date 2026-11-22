// The other ships on a host's cradles, seen from a ship that is not the host: the second cutter in the carrier's
// hangar, from the cutter you are flying (design/ROADMAP.md, phase 12). berths.mjs builds the berthed ships of the ship
// you are aboard, with their docking ports to use; this is the same build for a host out in the world: for looking at
// and for bumping into (collide.mjs `Solids.addShip`), nothing to use.
//
// A berth whose ship is out (the voyage says so) stands empty, as in berths.mjs.

import * as THREE from 'three';
import { buildCarrier, loadHull } from './layout.mjs';
import { buildThrusterMeshes, thrustersFromLayout } from './newton.mjs';
import { loadLayout, fetchJson } from '../core/ship.mjs';
import { loadVoyage } from '../core/voyage.mjs';
import { berthKey } from './berths.mjs';

/** Builds one berthed ship from her layout `SL` and stands her at berth `spec` in host `H`'s hangar: no hooks, no
 *  systems, her decks and machinery hidden. Returns { spec, P (the built ship), group }, or null without a hangar. */
export async function buildBerthed(H, spec, SL, { code = false } = {}) {
  const hangar = H.rooms.get('hangar'), I = hangar && H.decks.get(hangar.deck);
  if (!I) return null;
  const P = buildCarrier(SL);
  buildThrusterMeshes(P.frame, thrustersFromLayout(SL));
  if (!code) await loadHull(P, `assets/${spec.ship}/hull.glb`);
  for (const D of P.decks.values()) D.group.visible = false;
  P.machinery.visible = false;
  P.overlay.visible = false;
  // Her layout origin at the berth's `at`: `P.obj` is her centre of mass, her frame set back from it by `com`.
  const group = new THREE.Group();
  group.name = `berthed-${spec.id}`;
  group.position.set(...spec.at);
  group.rotation.y = spec.yaw ?? 0;
  P.obj.position.set(...SL.com);
  group.add(P.obj);
  group.userData.live = true;
  I.group.add(group);
  return { spec, P, group };
}

/** Every berth of host `H` (id `hostId`) but `except` that has a ship in it. `known`: layouts already loaded, by ship
 *  id (the ship you are aboard is usually her sister). */
export async function berthedOthers(H, hostId, except, { code = false, known = {} } = {}) {
  const voyage = loadVoyage(), ships = [];
  for (const spec of H.L.berths ?? []) {
    if (spec.id === except || !spec.ship || voyage.ships[berthKey(hostId, spec.id)]?.out) continue;
    known[spec.ship] ??= await loadLayout(`ships/${spec.ship}`, fetchJson);
    const s = await buildBerthed(H, spec, known[spec.ship], { code });
    if (s) ships.push(s);
  }
  return ships;
}
