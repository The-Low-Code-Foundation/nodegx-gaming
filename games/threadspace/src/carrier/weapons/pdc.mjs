// Point defence, in two kinds: the close-in guns (rotary cannon for torpedoes and missiles) and the flak guns (fused
// shells for fighters), their rounds and bursts, and the raider's own point defence against ours. Part of `Weapons` (weapons.mjs).

import { THREE, at, clamp, DEG, _a, _b, _c, _d, _e, _f, _g, _q, _m, Z, turn, leadAccel, ROUND_MAX } from './shared.mjs';
import { LOOK, streakMatrix } from './tracers.mjs';

const _col = new THREE.Color();

/** Mixed into `Weapons` (weapons.mjs). */
export const pdcParts = {
  // --- point defence -------------------------------------------------------------------------------------------------

  /** One tracer (a burst of rounds) from `p` at velocity `v`, world. `side` is whose it is. */
  round(p, v, side, life, dmg = 0) {
    if (this.pdRounds.length >= ROUND_MAX) return null;
    const r = { pos: p.clone(), prev: p.clone(), vel: v.clone(), side, life, dmg };
    this.pdRounds.push(r);
    return r;
  },

  /** What point defence gun `g` would fire at now, inside its arc and reach: a close-in gun takes the nearest torpedo
   *  inbound or missile homing on her, then a bandit inside `fighterRange` (and the raider inside `raiderRange`, if it
   *  has one); a flak gun the nearest bandit, then a torpedo between `torpRange` (beyond the close-in guns), then the
   *  raider. `P` is the gun's numbers (`pdc` or `flak`), `pivot` and `up` in the world. */
  pdTarget(g, P, pivot, up, cosArc, R) {
    let best = null, bd = Infinity;
    const bears = (p, reach, near = 0) => {
      const d = p.distanceTo(pivot);
      if (d < reach && d >= near && d < bd && _c.subVectors(p, pivot).normalize().dot(up) > cosArc) return d;
      return null;
    };
    const torps = (reach, near = 0) => {
      for (const t of this.torps) {
        if (t.dead || t.side !== 'theirs') continue;
        const d = bears(t.pos, reach, near);
        if (d != null) (best = t), (bd = d);
      }
    };
    const bandits = (reach) => {
      for (const B of this.bandits) {
        if (B.dead || B.gone) continue;
        const d = bears(B.pos, reach);
        if (d != null) (best = B), (bd = d);
      }
    };
    const raider = (reach) => {
      if (!R || !reach) return;
      const d = bears(R.obj.position, reach);
      if (d != null) best = R;
    };
    if (g.type === 'flak') {
      bandits(P.range);
      if (!best && P.torpRange) torps(P.torpRange[1], P.torpRange[0]);
      if (!best) raider(P.raiderRange);
      return best;
    }
    torps(P.range);
    for (const t of this.missiles) {
      if (t.dead || t.track !== 'carrier') continue; // a heat-seeker homing on her, whoever fired it
      const d = bears(t.pos, P.range);
      if (d != null) (best = t), (bd = d);
    }
    if (!best) bandits(P.fighterRange ?? 0);
    if (!best) raider(P.raiderRange);
    return best;
  },

  /** The carrier's point defence, in two kinds (the mount's `gun`): close-in guns, rotary cannon for torpedoes and
   *  missiles (the layout's `pdc`), and flak guns, twin guns firing fused shells for fighters (`flak`). Each gun picks
   *  its target (`pdTarget`), slews onto the lead, and fires while it is laid. A gun the bandits have shot up (`hp`
   *  under 25) is out of action. */
  pdcFrame(dt) {
    if (!this.W.pdc) return;
    const R = this.raider;
    const raiderLive = R && !R.gone && !R.dead && !R.target;
    const hot = this.plant?.hot;
    const toShip = _q.copy(this.C.obj.quaternion).invert(); // world to the ship's frame (C.frame only shifts it)
    for (const g of this.pdcs) {
      const flak = g.type === 'flak';
      const P = flak ? this.W.flak : this.W.pdc;
      const cosArc = Math.cos(P.arc * DEG);
      const mag = this.ship.node(g.m.magazine)?.health ?? 100;
      const health = g.node ? g.node.health : 100;
      g.ok = health >= 25 && mag >= 15 && g.hp >= 25 && this.ship.power;
      g.why = !this.ship.power ? 'no power' : health < 25 ? 'wrecked' : g.hp < 25 ? 'shot up' : mag < 15 ? 'magazine wrecked' : g.stock <= 0 ? 'empty' : hot ? 'heat' : '';
      g.firing = false;
      // Mended by the repair drones (carrier-repair.mjs); without them, `repair` hit points a second between raids.
      if (!this.ship.repair && g.hp < 100 && (!R || R.gone)) g.hp = Math.min(100, g.hp + dt * (this.W.pdc.repair ?? 0));
      const pivot = this.C.frame.localToWorld(_a.copy(g.pivot));
      const up = _b.copy(g.up).applyQuaternion(this.C.obj.quaternion);
      const best = g.ok ? this.pdTarget(g, P, pivot, up, cosArc, raiderLive ? R : null) : null;
      g.target = best;
      let want = null, tof = 0;
      if (best) {
        const isT = best !== R;
        const r = _c.subVectors(isT ? best.pos : R.obj.position, pivot);
        const v = _d.copy(isT ? best.vel : _e.copy(R.v).add(this.body.vel)).sub(this.body.vel); // its rounds keep her velocity
        const a = isT ? best.acc ?? _f.set(0, 0, 0) : _f.set(0, 0, 0);
        tof = leadAccel(r, v, a, P.speed, _g);
        if (tof != null) want = _g.clone();
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
        if (flak) this.flakFire(g, P, pivot, want, tof);
        else this.closeFire(g, P, pivot, want, best, dt);
      } else g.coolT = Math.max(g.coolT, 0);
      g.spin.rotation.z += g.spinV * dt;
      if (g.barrels) {
        // The flak gun's barrels run back as each fires and out again.
        for (let i = 0; i < 2; i++) {
          const rt = (g.runT[i] += dt);
          g.barrels[i].position.z = rt < 0.04 ? (rt / 0.04) * 0.6 : 0.6 * Math.exp(-(rt - 0.04) * 6);
        }
      }
    }
  },

  /** A close-in gun laid on `best`: a burst of tracers at `rate` along `want` (world, unit). */
  closeFire(g, P, pivot, want, best, dt) {
    g.spinV = 60;
    // A fighter is small and jinking: the fire control's track of one is rougher (`fighterSpread`).
    const spread = best.kind === 'bandit' ? P.fighterSpread ?? P.spread : P.spread;
    while (g.coolT <= 0) {
      g.coolT += 1 / P.rate;
      g.stock--;
      const d = _c.copy(want);
      d.x += (this.rand() - 0.5) * 2 * spread;
      d.y += (this.rand() - 0.5) * 2 * spread;
      d.z += (this.rand() - 0.5) * 2 * spread;
      d.normalize();
      const muzzle = _d.copy(pivot).addScaledVector(d, 3.6);
      const rd = this.round(muzzle, _e.copy(d).multiplyScalar(P.speed).add(this.body.vel), 'ours', P.range / P.speed + 0.3, P.damage);
      if (rd) rd.fdmg = P.fighterDamage ?? 0; // what it does to a bandit it passes close to
      this.plant?.addHeat(P.heat);
    }
    // The muzzle's flicker while it hoses (a flash every few rounds, not every one: they are hundreds a second).
    if ((g.flashT = (g.flashT ?? 0) - dt) <= 0) {
      g.flashT = 0.06 + 0.03 * Math.random();
      const sc = g.m.scale ?? 1, m = _d.copy(pivot).addScaledVector(want, 3.8 * sc);
      this.puffs?.muzzle(m, want, 0.24 * sc, { color: '#ffc880', v0: this.body?.vel, lite: true });
      if (Math.random() < 0.4) this.sparkBurst(m, 2, { dir: want, spread: 0.2, speed: 90, v0: this.body?.vel, life: 0.25, color: '#ffd080', w: 0.1 });
    }
    if ((g.soundT = (g.soundT ?? 0) - dt) <= 0) {
      g.soundT = 0.18;
      this.sfx?.play('hit', this.ear ? Math.min(900, this.ear.distanceTo(pivot) * 0.7) : 600);
      if (this.feel && this.ship.you) this.feel.gun('pdc', 0, this.C.frame.worldToLocal(new THREE.Vector3().copy(pivot)).distanceTo(this.ship.you), this.ship.aboard !== false);
    }
  },

  /** A flak gun laid on its target: a shell from each barrel in turn at `rate`, fused for the meeting `tof` seconds
   *  out (off by up to `fuseErr` of it). It bursts there or nearer a target (`roundsFrame`, `flakBurst`). */
  flakFire(g, P, pivot, want, tof) {
    while (g.coolT <= 0) {
      g.coolT += 1 / P.rate;
      g.stock--;
      const d = _c.copy(want);
      d.x += (this.rand() - 0.5) * 2 * P.spread;
      d.y += (this.rand() - 0.5) * 2 * P.spread;
      d.z += (this.rand() - 0.5) * 2 * P.spread;
      d.normalize();
      const i = g.barrel;
      g.barrel = 1 - i;
      g.runT[i] = 0;
      const muzzle = _d.copy(pivot).addScaledVector(d, 6.4);
      const fuse = tof * (1 + (this.rand() - 0.5) * 2 * P.fuseErr);
      const rd = this.round(muzzle, _e.copy(d).multiplyScalar(P.speed).add(this.body.vel), 'ours', fuse);
      if (rd) rd.flak = true;
      this.plant?.addHeat(P.heat);
      this.puffs?.muzzle(muzzle, d, 0.45 * (g.m.scale ?? 1), { color: '#ffb870', v0: this.body?.vel });
      this.sparkBurst(muzzle, 5, { dir: d, spread: 0.25, speed: 110, v0: this.body?.vel, life: 0.35, color: '#ffb060', w: 0.14 });
      if (P.shellMass) this.recoil(muzzle, _e.copy(d).multiplyScalar(-P.speed * P.shellMass), 'flak');
      if ((g.soundT = (g.soundT ?? 0) - 1 / P.rate) <= 0) {
        g.soundT = 0.3;
        this.sfx?.play('boom', this.ear ? this.ear.distanceTo(muzzle) * 0.8 : 900, 7);
      }
    }
  },

  /** A flak shell bursts at `p` (world): its splinters hit a bandit inside `burst` m with a chance of (1 − d / `burst`)²
   *  (so a near burst nearly always, a far one seldom), each hit `damage`; they hurt the raider when it is that close to
   *  its hull, and kill a torpedo or a missile homing on her inside `torpKill` m. */
  flakBurst(p) {
    const F = this.W.flak;
    for (const B of this.bandits) {
      if (B.dead || B.gone) continue;
      const d = B.pos.distanceTo(p);
      if (d < F.burst && this.rand() < (1 - d / F.burst) ** 2) this.banditHit(B, B.pos, F.damage, false, true, 'flak');
    }
    for (const t of this.torps) if (!t.dead && t.side === 'theirs' && t.pos.distanceTo(p) < F.torpKill) this.killTorp(t, 'flak');
    for (const t of this.missiles) if (!t.dead && t.track === 'carrier' && t.pos.distanceTo(p) < F.torpKill) this.missileGone(t, true);
    const R = this.raider;
    if (R && !R.gone && !R.dead && !R.target) {
      const s = R.K.size ?? [20, 10, 40];
      _f.copy(p);
      R.obj.worldToLocal(_f).sub(R.centre ?? _c.set(0, 0, 0));
      const k = Math.hypot(_f.x / (s[0] + F.burst), _f.y / (s[1] + F.burst), _f.z / (s[2] + F.burst));
      if (k < 1) this.raiderHit(p, F.raiderDamage, false, true);
    }
    // The burst: a hot flash, its splinters flying out every way (the streaks), and a puff of gas that hangs and
    // spreads.
    this.flash(p, 7, '#ffb060', 0.2);
    this.flash(p, 3, '#ffffff', 0.06);
    this.sparkBurst(p, 26, { speed: 170, v0: this.body?.vel, life: 0.45, color: '#ffc070', w: 0.16, k: 1.6 });
    const G = this.gas, v0 = this.body?.vel;
    if (G) {
      for (let i = 0; i < 8; i++) {
        const v = _d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(30);
        if (v0) v.add(v0);
        G.emit(p, v, 1 + Math.random(), 0.6, 5 + 4 * Math.random(), 0.2, 0.3, 0);
      }
    }
    if (this.ear) this.sfx?.play('boom', this.ear.distanceTo(p) * 0.7, 5);
  },

  /** The raider's point defence: its turrets hose the carrier's torpedoes, and your fighter's missiles, when they
   *  come within reach. */
  raiderPdc(R, dt) {
    const P = R.K.pdc;
    const guns = R.obj.userData.turrets ?? [];
    let best = null, bd = Infinity;
    for (const t of [...this.torps, ...this.missiles]) {
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
      if (r.flak) {
        // A flak shell: its proximity fuse (a bandit or a torpedo passing within `prox`), or its time fuse.
        const F = this.W.flak;
        let at = r.life <= 0 ? r.pos : null;
        if (!at) {
          const ab = _b.subVectors(r.pos, r.prev), L2 = Math.max(1e-9, ab.lengthSq());
          for (const T of [...this.bandits, ...this.torps]) {
            if (T.dead || T.gone || (T.side && T.side !== 'theirs')) continue;
            if (T.pos.distanceTo(r.pos) > 80) continue;
            const k = clamp(_c.subVectors(T.pos, r.prev).dot(ab) / L2, 0, 1);
            if (_d.copy(r.prev).addScaledVector(ab, k).distanceTo(T.pos) < F.prox) {
              at = _d;
              break;
            }
          }
        }
        if (at) {
          this.flakBurst(at.clone());
          r.life = 0;
          continue;
        }
      } else {
      const t = this.torpHit(r.prev, r.pos, r.side === 'ours' ? 'theirs' : 'ours', radius);
      const mi = !t && this.missiles.length ? this.missileHitBy(r.prev, r.pos, r.side, this.W.missile.hitBy) : null;
      if (t) {
        this.killTorp(t, r.side === 'ours' ? 'close' : 'raider');
        r.life = 0;
      } else if (mi) {
        this.missileGone(mi, true); // shot down
        r.life = 0;
      } else if (r.side === 'ours' && raiderLive && r.dmg && r.pos.distanceTo(R.obj.position) < 80 && this.hitsRaider(r.prev, r.pos, _b)) {
        this.raiderHit(_b, r.dmg, false, true);
        r.life = 0;
      } else if (r.side === 'ours' && r.fdmg && this.bandits.length) {
        // A burst that passes within `radius` of a bandit.
        for (const B of this.bandits) {
          if (B.dead || B.gone || B.pos.distanceTo(r.pos) > 60) continue;
          const ab = _b.subVectors(r.pos, r.prev), ap = _c.subVectors(B.pos, r.prev);
          const k = clamp(ap.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
          if (ap.addScaledVector(ab, -k).length() < radius) {
            this.banditHit(B, _d.copy(r.prev).addScaledVector(ab, k), r.fdmg, false, true, 'close');
            r.life = 0;
            break;
          }
        }
      }
      }
      if (r.life <= 0 || !this.ear) continue;
      // A tracer streak along its way as you see it (weapons/tracers.mjs), growing out of the muzzle.
      r.age = (r.age ?? 0) + dt;
      const K = r.flak ? LOOK.pdflak : r.side === 'ours' ? LOOK.pdc : LOOK.pdTheirs;
      _a.subVectors(r.vel, this.fighter?.flying ? this.fighter.body.vel : this.body.vel);
      const sp = _a.length();
      if (sp > 1e-3) _a.multiplyScalar(1 / sp);
      M.setMatrixAt(n, streakMatrix(_m, r.pos, _a, Math.min(sp * K.smear, K.max, sp * r.age + 0.5), K.w, this.ear));
      M.setColorAt(n++, _col.set(K.color).multiplyScalar(K.k));
    }
    this.pdRounds = this.pdRounds.filter((r) => r.life > 0);
    M.count = n;
    M.instanceMatrix.needsUpdate = true;
    if (M.instanceColor) M.instanceColor.needsUpdate = true;
  }
};
