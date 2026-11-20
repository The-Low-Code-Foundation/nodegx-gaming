// Point defence: the automatic gatlings that take the nearest torpedo (or the raider), their rounds, and the raider's
// own point defence against ours. Part of `Weapons` (weapons.mjs).

import { at, clamp, DEG, _a, _b, _c, _d, _e, _f, _g, _q, _m, Z, turn, leadAccel, ROUND_MAX } from './shared.mjs';

/** Mixed into `Weapons` (weapons.mjs). */
export const pdcParts = {
  // --- point defence -------------------------------------------------------------------------------------------------

  /** One tracer (a burst of rounds) from `p` at velocity `v`, world. `side` is whose it is. */
  round(p, v, side, life, dmg = 0) {
    if (this.pdRounds.length >= ROUND_MAX) return;
    this.pdRounds.push({ pos: p.clone(), prev: p.clone(), vel: v.clone(), side, life, dmg });
  },

  /** The carrier's point defence: each gun picks the nearest torpedo inbound (or, with none, the raider when it is
   *  close) inside its arc and reach, slews onto the lead, and fires while it is laid. */
  pdcFrame(dt) {
    const P = this.W.pdc;
    if (!P) return;
    const R = this.raider;
    const raiderLive = R && !R.gone && !R.dead && !R.target;
    const hot = this.plant?.hot;
    const cosArc = Math.cos(P.arc * DEG);
    const toShip = _q.copy(this.C.obj.quaternion).invert(); // world to the ship's frame (C.frame only shifts it)
    for (const g of this.pdcs) {
      const mag = this.ship.node(g.m.magazine)?.health ?? 100;
      const health = g.node ? g.node.health : 100;
      g.ok = health >= 25 && mag >= 15 && this.ship.power;
      g.why = !this.ship.power ? 'no power' : health < 25 ? 'wrecked' : mag < 15 ? 'magazine wrecked' : g.stock <= 0 ? 'empty' : hot ? 'heat' : '';
      g.firing = false;
      const pivot = this.C.frame.localToWorld(_a.copy(g.pivot));
      const up = _b.copy(g.up).applyQuaternion(this.C.obj.quaternion);
      // The nearest threat it can bear on.
      let best = null, bd = Infinity;
      if (g.ok) {
        for (const t of this.torps) {
          if (t.dead || t.side !== 'theirs') continue;
          const d = t.pos.distanceTo(pivot);
          if (d < P.range && d < bd && _c.subVectors(t.pos, pivot).normalize().dot(up) > cosArc) (best = t), (bd = d);
        }
        if (!best && raiderLive) {
          const d = R.obj.position.distanceTo(pivot);
          if (d < P.raiderRange && _c.subVectors(R.obj.position, pivot).normalize().dot(up) > cosArc) best = R;
        }
      }
      g.target = best;
      let want = null;
      if (best) {
        const isT = best !== R;
        const r = _c.subVectors(isT ? best.pos : R.obj.position, pivot);
        const v = _d.copy(isT ? best.vel : _e.copy(R.v).add(this.body.vel)).sub(this.body.vel); // its rounds keep her velocity
        const a = isT ? best.acc : _f.set(0, 0, 0);
        if (leadAccel(r, v, a, P.speed, _g) != null) want = _g.clone();
      }
      // Slew the gun toward the lead (or home), at its rate, in the mount's own frame.
      if (want) {
        const local = want.clone().applyQuaternion(toShip).applyQuaternion(g.inv);
        const yaw = Math.atan2(-local.x, -local.z), elev = Math.asin(clamp(local.y, -1, 1));
        const m = P.slew * DEG * dt;
        g.yawA += clamp(turn(g.yawA, yaw), -m, m);
        g.elev += clamp(elev - g.elev, -m, m);
        g.laid = Math.abs(turn(g.yawA, yaw)) < 0.03 && Math.abs(elev - g.elev) < 0.03;
      } else {
        const m = P.slew * DEG * dt * 0.3;
        g.elev += clamp(0.3 - g.elev, -m, m);
        g.laid = false;
      }
      g.yaw.rotation.y = g.yawA;
      g.gun.rotation.x = g.elev;
      g.spinV = Math.max(0, g.spinV - dt * 30);
      g.coolT = Math.max(g.coolT - dt, -1 / P.rate); // idle, it is ready to fire, not owed a backlog of rounds
      if (want && g.laid && g.ok && !hot && g.stock > 0) {
        g.firing = true;
        g.spinV = 60;
        while (g.coolT <= 0) {
          g.coolT += 1 / P.rate;
          g.stock--;
          const d = _c.copy(want);
          d.x += (this.rand() - 0.5) * 2 * P.spread;
          d.y += (this.rand() - 0.5) * 2 * P.spread;
          d.z += (this.rand() - 0.5) * 2 * P.spread;
          d.normalize();
          const muzzle = _d.copy(pivot).addScaledVector(d, 3.6);
          this.round(muzzle, _e.copy(d).multiplyScalar(P.speed).add(this.body.vel), 'ours', P.range / P.speed + 0.3, P.damage);
          this.plant?.addHeat(P.heat);
        }
        if ((g.soundT = (g.soundT ?? 0) - dt) <= 0) (g.soundT = 0.18), this.sfx?.play('hit', this.ear ? Math.min(900, this.ear.distanceTo(pivot) * 0.7) : 600);
      } else g.coolT = Math.max(g.coolT, 0);
      g.spin.rotation.z += g.spinV * dt;
    }
  },

  /** The raider's point defence: its turrets hose the carrier's torpedoes when they come within reach. */
  raiderPdc(R, dt) {
    const P = R.K.pdc;
    const guns = R.obj.userData.turrets ?? [];
    let best = null, bd = Infinity;
    for (const t of this.torps) {
      if (t.dead || t.side !== 'ours') continue;
      const d = t.pos.distanceTo(R.obj.position);
      if (d < P.range && d < bd) (best = t), (bd = d);
    }
    if (!best) return;
    R.pdcT -= dt;
    const own = _a.copy(R.v).add(this.body.vel);
    while (R.pdcT <= 0) {
      R.pdcT += 1 / P.rate;
      const gun = guns[Math.floor(this.rand() * guns.length)];
      const muzzle = gun ? gun.pitch.localToWorld(gun.tip.clone()) : R.obj.position.clone();
      const r = _b.subVectors(best.pos, muzzle), v = _c.subVectors(best.vel, own);
      if (leadAccel(r, v, best.acc, P.speed, _d) == null) continue;
      _d.x += (this.rand() - 0.5) * 2 * P.spread;
      _d.y += (this.rand() - 0.5) * 2 * P.spread;
      _d.z += (this.rand() - 0.5) * 2 * P.spread;
      this.round(muzzle, _e.copy(_d.normalize()).multiplyScalar(P.speed).add(own), 'theirs', P.range / P.speed + 0.3);
    }
  },

  /** Every tracer in the air: what it meets (a torpedo of the other side, or the raider), and drawing them all. */
  roundsFrame(dt) {
    const R = this.raider;
    const raiderLive = R && !R.gone && !R.dead && !R.target;
    const radius = this.W.pdc?.radius ?? 3;
    const M = this.roundMesh;
    let n = 0;
    for (const r of this.pdRounds) {
      r.prev.copy(r.pos);
      r.pos.addScaledVector(r.vel, dt);
      r.life -= dt;
      const t = this.torpHit(r.prev, r.pos, r.side === 'ours' ? 'theirs' : 'ours', radius);
      if (t) {
        this.killTorp(t, r.side === 'ours' ? 'pdc' : 'raider');
        r.life = 0;
      } else if (r.side === 'ours' && raiderLive && r.dmg && r.pos.distanceTo(R.obj.position) < 80 && this.hitsRaider(r.prev, r.pos, _b)) {
        this.raiderHit(_b, r.dmg, false, true);
        r.life = 0;
      }
      if (r.life <= 0) continue;
      // A streak along its way past the carrier.
      _a.subVectors(r.vel, this.body.vel);
      const len = Math.min(_a.length() * 0.025, 26);
      _q.setFromUnitVectors(Z, _a.normalize());
      _m.compose(r.pos, _q, _c.set(0.35, 0.35, len));
      M.setMatrixAt(n++, _m);
    }
    this.pdRounds = this.pdRounds.filter((r) => r.life > 0);
    M.count = n;
    M.instanceMatrix.needsUpdate = true;
  }
};
