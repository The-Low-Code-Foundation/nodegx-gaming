// The ships a ship carries, seen from aboard her: the cutters on their cradles in the carrier's hangar (design/ROADMAP.md,
// phase 12). The other half of berth.mjs, which is the same berth seen from aboard the carried ship.
//
// The layout's `berths` (tools/carrier-v2.mjs): { id, ship (a folder under ships/), side, door, at [x, y, z] (where the
// carried ship's layout origin sits, in this ship's frame), yaw, out, port [x, y, z] (her docking port's door centre,
// in this ship's frame), clear }. Each carried ship is built from her own layout with `buildCarrier`, no hooks and no
// systems, her decks and machinery hidden, and stood in the hangar's group, so she is drawn whenever the hangar is.
// At her port, E takes you aboard: the voyage notes it and her page loads (src/core/voyage.mjs).
//
// A berth whose ship is out (the voyage says so) stands empty.

import * as THREE from 'three';
import { buildCarrier, loadHull } from './layout.mjs';
import { buildThrusterMeshes, thrustersFromLayout } from './newton.mjs';
import { loadLayout, fetchJson } from '../core/ship.mjs';
import { loadVoyage, goAboard } from '../core/voyage.mjs';

/** The key a carried ship is noted under in the voyage: her host and her berth. */
export const berthKey = (hostId, berthId) => `${hostId}/${berthId}`;

export class Berths {
  /** `G`: the game in hand (main.mjs). `id`: this ship's id. `code`: true keeps the carried ships' code-built hulls. */
  constructor(G, id, { code = false } = {}) {
    this.G = G;
    this.id = id;
    this.code = code;
    this.ships = []; // { spec, P (the built ship), group }
    const hangar = G.C.rooms.get('hangar');
    this.I = hangar && G.C.decks.get(hangar.deck);
  }

  /** Builds every berthed ship. Async: each one's layout (and hull, if she has one) is fetched. */
  async build() {
    const { L, fadeThen } = this.G;
    if (!this.I) return this;
    const voyage = loadVoyage();
    const layouts = new Map();
    for (const spec of L.berths ?? []) {
      if (!spec.ship || voyage.ships[berthKey(this.id, spec.id)]?.out) continue;
      if (!layouts.has(spec.ship)) layouts.set(spec.ship, await loadLayout(`ships/${spec.ship}`, fetchJson));
      const SL = layouts.get(spec.ship);
      const P = buildCarrier(SL);
      buildThrusterMeshes(P.frame, thrustersFromLayout(SL));
      if (!this.code) await loadHull(P, `assets/${spec.ship}/hull.glb`);
      for (const I of P.decks.values()) I.group.visible = false;
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
      this.I.group.add(group);
      // Her bulk, to anyone crossing the hangar: her envelope, turned as she lies (a berth's yaw is 0 or π).
      const e = SL.envelope, flip = Math.abs(Math.cos(spec.yaw ?? 0)) < 0.5 ? null : Math.cos(spec.yaw ?? 0) < 0 ? -1 : 1;
      if (e && flip) {
        const xs = [spec.at[0] + flip * e.min[0], spec.at[0] + flip * e.max[0]], zs = [spec.at[2] + flip * e.min[2], spec.at[2] + flip * e.max[2]];
        this.I.collider(Math.min(...xs), spec.at[1] + e.min[1], Math.min(...zs), Math.max(...xs), spec.at[1] + e.max[1], Math.max(...zs));
      }
      // Her docking port, at the end of her spur of the gangway.
      const port = spec.port ?? spec.at;
      const inward = -Math.sign(port[0] || spec.out || 1); // toward the centreline, where you stand
      const name = SL.name?.toLowerCase() ?? spec.ship;
      this.I.use(`berth-${spec.id}`, `Go aboard the ${name}`, port[0] + inward * 1.2, port[2], () => fadeThen(() => goAboard(spec.ship, { host: this.id, berth: spec.id })), { r: 3, y: port[1] });
      this.ships.push({ spec, P, group });
    }
    return this;
  }

  /** Where you stand having come out of the ship in berth `id`: by her port, facing the centreline. */
  arrival(id) {
    const spec = (this.G.L.berths ?? []).find((b) => b.id === id);
    if (!spec || !this.I) return null;
    const port = spec.port ?? spec.at, inward = -Math.sign(port[0] || spec.out || 1);
    return { deck: this.I.deck.id, x: port[0] + inward * 1.6, y: spec.sill ?? undefined, z: port[2], yaw: inward > 0 ? -Math.PI / 2 : Math.PI / 2 };
  }
}
