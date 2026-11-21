// Torpedoes, both ways: launched, guided (proportional navigation, the jink that settles), and what they do when they
// arrive. Part of `Weapons` (weapons.mjs).

import { THREE, at, _a, _b, torpedoMesh } from './shared.mjs';

/** Mixed into `Weapons` (weapons.mjs). */
export const torpedoParts = {
  // --- torpedoes -------------------------------------------------------------------------------------------------------

  /** A torpedo into the world at `p` with velocity `v`: `side` 'ours' (the carrier's, after the raider) or 'theirs'
   *  (the raider's, after a point in the carrier, `aim` in the ship's frame). */
  torpedo(p, v, side, aim = null) {
    const obj = torpedoMesh(side === 'ours');
    obj.traverse((o) => (o.frustumCulled = false));
    obj.position.copy(p);
    this.scene.add(obj);
    const t = { obj, pos: p.clone(), prev: p.clone(), vel: v.clone(), side, aim, t: 0, jink: new THREE.Vector3(), jinkT: 0, dead: false, acc: new THREE.Vector3() };
    this.torps.push(t);
    return t;
  },

  /** One of the raider's torpedoes, out of its tube with a push off to the side, after a compartment of the carrier's
   *  chosen by size (a big one is easier to hit). */
  launchAtCarrier(R, i) {
    const T = this.W.torpedo, r = this.rand;
    const n = this.ship.pick(), b = n.b;
    const aim = new THREE.Vector3(b.x[0] + (b.x[1] - b.x[0]) * (0.3 + 0.4 * r()), b.y[0] + (b.y[1] - b.y[0]) * (0.3 + 0.4 * r()), b.z[0] + (b.z[1] - b.z[0]) * (0.3 + 0.4 * r()));
    const side = _a.set(i % 2 ? 1 : -1, 0.3, 0).transformDirection(R.obj.matrixWorld);
    const p = R.obj.localToWorld(new THREE.Vector3(i % 2 ? 3 : -3, 0, 0));
    const v = _b.copy(R.v).add(this.body.vel).addScaledVector(side, T.push);
    this.torpedo(p, v, 'theirs', aim); // its motor lights at once: torpsFrame's ignition is the flash and the bang
  },

  /** Brace for impact: the nearest of the raider's torpedoes that will arrive within `brace.eta` seconds (on the line
   *  it is flying now) starts the call and the countdown, `this.brace = { eta }`, which the HUD shows and the brace
   *  straps answer to. It ends when no torpedo is that close (it hit, or the point defence got it). */
  braceFrame(dt) {
    const B = this.W.brace ?? { eta: 6 };
    let eta = Infinity;
    for (const t of this.torps) {
      if (t.dead || t.side !== 'theirs' || t.t < 0) continue;
      const r = _a.subVectors(this.C.frame.localToWorld(_b.copy(t.aim)), t.pos);
      const dist = r.length();
      const closing = r.dot(_b.subVectors(t.vel, this.body.vel)) / Math.max(1, dist);
      if (closing > 20) eta = Math.min(eta, dist / closing);
    }
    if (eta <= B.eta) {
      if (!this.brace) {
        this.C.bus?.emit('call', { id: 'brace' });
        this.C.bus?.emit('brace', { on: true });
        this.dc?.say(null, 'Brace, brace, brace: torpedo impact imminent.', 0, 4);
      }
      this.brace = { eta, hold: B.hold ?? 1.5 };
    } else if (this.brace && (this.brace.hold -= dt) <= 0) {
      this.brace = null;
      this.C.bus?.emit('brace', { on: false });
    } else if (this.brace) this.brace.eta = 0;
  },

  /** The carrier's tubes: the CIC fires a salvo at a raider in range, every so often, while the magazine holds. */
  tubesFrame(dt) {
    const U = this.W.tubes, R = this.raider;
    if (!U) return;
    this.tubeT -= dt;
    if (!R || R.gone || R.dead || R.target || !this.ship.power || this.tubeStock <= 0 || this.tubeT > 0) return;
    if ((this.ship.node(U.magazine)?.health ?? 100) < 20) return;
    const d = R.obj.position.distanceTo(this.C.obj.position);
    if (d < U.range[0] || d > U.range[1]) return;
    this.tubeT = U.every;
    const dir = _a.set(...U.dir).transformDirection(this.C.frame.matrixWorld);
    for (let i = 0; i < Math.min(U.salvo, this.tubeStock); i++) {
      const p = this.C.frame.localToWorld(new THREE.Vector3(...U.at[i % U.at.length]));
      this.torpedo(p, _b.copy(this.body.vel).addScaledVector(dir, this.W.torpedo.push), 'ours');
      this.flash(p, 4, '#d8e8ff', 0.3);
    }
    this.tubeStock -= Math.min(U.salvo, this.tubeStock);
    this.C.bus?.emit('call', { id: 'torpedoes-away' });
    this.dc?.say(null, 'The CIC fired a torpedo salvo at the raider.', 0, 4);
  }
};
