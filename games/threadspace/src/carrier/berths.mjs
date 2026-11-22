// The ships a ship carries, seen from aboard her: the cutters on their cradles in the carrier's hangar (design/ROADMAP.md,
// phase 12). The other half of berth.mjs, which is the same berth seen from aboard the carried ship.
//
// The layout's `berths` (tools/carrier-v2.mjs): { id, ship (a folder under ships/), side, door, at [x, y, z] (where the
// carried ship's layout origin sits, in this ship's frame), yaw, out, port [x, y, z] (her docking port's door centre,
// in this ship's frame), clear }. Each carried ship is built from her own layout with `buildCarrier`, no hooks and no
// systems, her decks and machinery hidden, and stood in the hangar's group, so she is drawn whenever the hangar is.
// At her port, E takes you aboard: the voyage notes it and her page loads (src/core/voyage.mjs).
//
// A berth whose ship is out (the voyage says so, and that you are aboard her) stands empty.
//
// Each berthed ship has her upkeep (upkeep.mjs): what her last sortie did to her, read from the voyage, shown on her
// skin (scorches, then welded plates), mended, refuelled and rearmed by the hangar crew while you are about the
// carrier, with a board at her platform and a use there to work with them (hold E, with a tool kit). `frame()` each
// tick (main.mjs).

import * as THREE from 'three';
import { buildCarrier, loadHull } from './layout.mjs';
import { buildThrusterMeshes, thrustersFromLayout } from './newton.mjs';
import { loadLayout, fetchJson } from '../core/ship.mjs';
import { loadVoyage, goAboard } from '../core/voyage.mjs';
import { berthSpurs } from './sets/hangar.mjs';
import { Upkeep, UpkeepLook } from './upkeep.mjs';

/** The key a carried ship is noted under in the voyage: her host and her berth. */
export const berthKey = (hostId, berthId) => `${hostId}/${berthId}`;

export class Berths {
  /** `G`: the game in hand (main.mjs). `id`: this ship's id. `code`: true keeps the carried ships' code-built hulls. */
  constructor(G, id, { code = false } = {}) {
    this.G = G;
    this.id = id;
    this.code = code;
    this.ships = []; // { spec, P (the built ship), group, upkeep, look, use }
    const hangar = G.C.rooms.get('hangar');
    this.I = hangar && G.C.decks.get(hangar.deck);
  }

  /** Builds every berthed ship. Async: each one's layout (and hull, if she has one) is fetched. */
  async build() {
    const { L } = this.G;
    if (!this.I) return this;
    const voyage = loadVoyage();
    this.lines();
    const layouts = new Map();
    for (const spec of L.berths ?? []) {
      // Out: only while you are aboard her (nothing else flies her). A voyage left saying "out" by a page shut in
      // flight, with you aboard this ship, has her back on her cradle.
      if (!spec.ship || (voyage.ships[berthKey(this.id, spec.id)]?.out && voyage.aboard === spec.ship)) continue;
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
      this.I.use(`berth-${spec.id}`, `Go aboard the ${name}`, port[0] + inward * 1.2, port[2], () => (this.G.sfx?.cue('hiss', { vol: 0.4 }), goAboard(spec.ship, { host: this.id, berth: spec.id }, { line: 'Docking port shut behind you. Filling the lock.' })), { r: 3, y: port[1] });
      // Her upkeep: the board on her platform, beside her port, facing the gangway; E there works with the crew.
      const upkeep = new Upkeep({ L: SL, key: berthKey(this.id, spec.id), say: (t) => this.G.dc?.say(null, t, 0, 4) });
      addEventListener('pagehide', () => upkeep.save());
      const bx = port[0] + inward * 0.5, bz = port[2] - 2.6, by = port[1] + 0.5;
      const look = new UpkeepLook({ G: this.G, P, I: this.I, upkeep, board: { at: [bx, by, bz], yaw: inward > 0 ? Math.PI / 2 : -Math.PI / 2 } });
      const use = this.I.use(`upkeep-${spec.id}`, '', bx + inward * 1.2, bz, () => this.press(upkeep), { r: 1.8, y: port[1] });
      this.ships.push({ spec, P, group, upkeep, look, use });
    }
    return this;
  }

  /** E at a ship's upkeep board: says what is missing (holding E does the work, `frame`). */
  press(upkeep) {
    const dc = this.G.dc;
    if (!upkeep.hurt().length) return dc?.say(null, upkeep.held() ?? 'Nothing to mend on her: the hangar crew are seeing to her tanks and magazines.', 0, 4);
    if (dc && !dc.carry.has('toolkit')) dc.say(null, `You need ${dc.D.kits.toolkit?.name ?? 'a tool kit'} to work on her. ${dc.whereKit('toolkit')}`);
  }

  /** Each frame: the hangar crew at every berthed ship, you with them if you hold E at her board with a tool kit. */
  frame(dt, f, walker, mode) {
    const kit = !this.G.dc || this.G.dc.carry.has('toolkit');
    for (const s of this.ships) {
      const here = mode === 'walk' && walker.nearestUse() === s.use;
      const top = s.upkeep.hurt()[0];
      const on = here && kit && !!top && f.keys.has('KeyE');
      s.upkeep.frame(dt, { working: true, you: on });
      s.look.frame(dt);
      const name = s.P.L.name?.toLowerCase() ?? 'ship';
      s.use.label = !top ? `The ${name}'s upkeep: ${s.upkeep.held() ? 'refuelling' : 'ready to fly'}` : !kit ? `The ${name}'s ${s.upkeep.nameOf(top.id)} needs mending (${Math.round(top.h)}%): you need a tool kit` : on ? `Working on her ${s.upkeep.nameOf(top.id)} with the hangar crew: ${Math.round(top.h)}%` : `Hold E: work on her ${s.upkeep.nameOf(top.id)} with the hangar crew (${Math.round(top.h)}%)`;
    }
  }

  /** The way up to each berth's platform and back: E at the foot of its ramp hauls you up a guide line to the port, E
   *  on the platform takes you back down to the gangway (seats/walk.mjs `startLine`). The ramp's rails are still there
   *  to pull yourself along; this is the quick way. */
  lines() {
    const { C } = this.G, hangar = C.rooms.get('hangar'), I = this.I;
    const lock = C.L.doors.find((d) => d.between.includes(hangar.id) && d.between.some((id) => C.rooms.get(id)?.airlock));
    const gx = lock?.at ?? 0, gy = I.floorY + 0.35;
    for (const q of berthSpurs(C, hangar, gx, gy)) {
      const top = { x: q.x1 - q.s * 0.9, y: q.py, z: q.pz }, foot = { x: gx + q.s * 0.3, y: gy, z: q.zr - 0.6 };
      const faceShip = q.s > 0 ? -Math.PI / 2 : Math.PI / 2;
      I.use(`berth-up-${q.b.id}`, 'Haul yourself up the line to the docking port', foot.x, foot.z, () => this.G.walk.startLine(top, faceShip), { r: 2.6, y: gy + 1.2 });
      I.use(`berth-down-${q.b.id}`, 'Go down the line to the gangway', top.x - q.s * 0.9, top.z - 0.9, () => this.G.walk.startLine(foot, 0), { r: 1.6, y: q.py + 1.2 });
    }
  }

  /** Where you stand having come out of the ship in berth `id`: by her port, facing the centreline. */
  arrival(id) {
    const spec = (this.G.L.berths ?? []).find((b) => b.id === id);
    if (!spec || !this.I) return null;
    const port = spec.port ?? spec.at, inward = -Math.sign(port[0] || spec.out || 1);
    return { deck: this.I.deck.id, x: port[0] + inward * 1.6, y: spec.sill ?? undefined, z: port[2], yaw: inward > 0 ? -Math.PI / 2 : Math.PI / 2 };
  }
}
