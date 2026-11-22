// Shells in flight, theirs and ours: fired, flown, meeting the carrier's radiators or hull or the raider, and the
// flashes; and the recoil every big gun puts into the ship's `Rigid`. Part of `Weapons` (weapons.mjs).

import { THREE, at, clamp, _a, _b, _c, _d, _m, Z, _k1, _k2, _kq, FLASH_GEO, turn } from './shared.mjs';
import { lookOf } from './tracers.mjs';

const _w = new THREE.Vector3(), _n = new THREE.Vector3(), _bd = new THREE.Vector3(), _bv = new THREE.Vector3();
const _hd = new THREE.Vector3(); // a round's way through your fighter (fighterHit)

/** Mixed into `Weapons` (weapons.mjs). */
export const projectileParts = {
  // --- shells --------------------------------------------------------------------------------------------------------

  /** A round in flight from `p` at `vel` (world): drawn as a tracer streak by its kind (weapons/tracers.mjs `lookOf`,
   *  from the flags its gun sets: `rail`, `cannon` and `tracer`, `bandit`, `flak`). */
  fire(p, vel, ours, life, dmg = 0) {
    const s = { pos: p.clone(), vel: vel.clone(), life, ours, dmg, inside: false, age: 0 };
    this.shells.push(s);
    return s;
  },

  shellsFrame(dt) {
    const prev = new THREE.Vector3();
    const foes = this.foes();
    const centre = this.C.obj.position;
    this.streaks.begin(); // the sparks join them in fxFrame, which draws the lot
    const eye = this.ear, ref = this.fighter?.flying ? this.fighter.body.vel : this.body.vel;
    for (const s of this.shells) {
      prev.copy(s.pos);
      s.pos.addScaledVector(s.vel, dt);
      s.life -= dt;
      s.age += dt;
      // Drawn as a tracer streak along its way as you see it (moving with the carrier, or with your fighter): it
      // grows out of the muzzle over its first metres rather than starting full length behind it.
      const K = lookOf(s);
      _w.subVectors(s.vel, ref);
      const sp = _w.length();
      if (sp > 1e-3) _w.multiplyScalar(1 / sp);
      const len = Math.min(sp * K.smear, K.max, sp * s.age + 0.5);
      if (eye) this.streaks.add(s.pos, _w, len, K.w, K.color, K.k * (s.life < 0.3 ? s.life / 0.3 : 1), eye);
      // A turret's shell: the tracer's spent compound glowing a moment where it passed.
      if (K.k > 1.5 && !s.cannon && this.gas && Math.random() < dt * 25) this.gas.emit(s.pos, _n.copy(s.vel).multiplyScalar(0.98), 0.5 + Math.random() * 0.6, 0.6, 1.6, 0.05, 0.85, 0);
      if (s.ours) {
        // The raider (or a target sled) and its bandits.
        const R = this.raider;
        let hit = R?.target && !R.gone && this.hitsFoe(R, prev, s.pos, _b) ? R : null;
        const seg = prev.distanceTo(s.pos);
        for (const F of foes) if (!hit && !F.dead && F.obj.position.distanceTo(s.pos) < 200 + seg && this.hitsFoe(F, prev, s.pos, _b)) hit = F;
        if (hit) {
          if (s.you && hit.kind !== 'bandit') hit.byYou = (hit.byYou ?? 0) + 1; // your own hits (the career counts them)
          this.foeHit(hit, _b, s.dmg, s.you);
          s.life = 0;
        } else if (s.cannon && s.pos.distanceTo(centre) < 240 && this.ship.inHull(_b.copy(s.pos).applyMatrix4(this.inv))) {
          // A fighter's round that finds the carrier: stopped by her plating, with a spark to show for it.
          this.impact(s.pos, _n.copy(s.vel).sub(this.body.vel).normalize(), 0.25, '#ffd090');
          s.life = 0;
        } else {
          // A shell or a cannon round that passes close to one of the raider's torpedoes kills it.
          const t = this.torpHit(prev, s.pos, 'theirs', s.cannon ? this.W.fighter.radius ?? 3 : 4);
          if (t) (s.life = 0), this.killTorp(t, s.you ? 'you' : 'gun');
        }
      } else if (s.flak || s.bandit) {
        // A shot at the fighter (the raider's flak, a bandit's cannon): a hit if its path this frame passes within her
        // hull's reach. A bandit's round that misses her may meet the carrier (`strafeHit`).
        const fi = this.fighter;
        if (s.bandit && (prev.distanceTo(centre) < 280 || s.pos.distanceTo(centre) < 280) && this.strafeHit(s, prev, s.pos)) s.life = 0;
        else if (fi?.flying) {
          const ab = _b.subVectors(s.pos, prev), ap = _c.subVectors(fi.obj.position, prev);
          const k = clamp(ap.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
          // She moves too: test against where she was at that moment of the frame.
          ap.addScaledVector(fi.body.vel, -(1 - k) * dt).addScaledVector(ab, -k);
          if (ap.length() < ((s.bandit ? this.W.bandit.gun.radius : this.W.raider.flak?.radius) ?? 4)) {
            this.fighterHit(_d.copy(prev).addScaledVector(ab, k), s.dmg, 0, _hd.copy(s.vel).sub(fi.body.vel));
            s.life = 0;
          }
        }
      } else if (prev.distanceTo(centre) < 280 || s.pos.distanceTo(centre) < 280) {
        if (this.hitsCarrier(s, prev, s.pos)) s.life = 0;
      }
    }
    this.shells = this.shells.filter((s) => s.life > 0);
  },

  /** Does the segment a→b (world) pass through the raider's ellipsoid? Where, in `out`. */
  hitsRaider(a, b, out) {
    return this.hitsFoe(this.raider, a, b, out);
  },

  /** Does the segment a→b (world) pass through foe `R`'s ellipsoid (its `K.size` about its `centre`)? Where, in `out`. */
  hitsFoe(R, a, b, out) {
    const size = R.K.size, o = R.centre;
    const inv = _m.copy(R.obj.matrixWorld).invert();
    const A = _c.copy(a).applyMatrix4(inv), B = _d.copy(b).applyMatrix4(inv);
    for (const P of [A, B]) P.set((P.x - o.x) / size[0], (P.y - o.y) / size[1], (P.z - o.z) / size[2]);
    const ab = out.subVectors(B, A);
    const t = clamp(-A.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
    const q = ab.multiplyScalar(t).add(A);
    if (q.length() > 1) return false;
    q.set(q.x * size[0] + o.x, q.y * size[1] + o.y, q.z * size[2] + o.z);
    out.copy(q).applyMatrix4(R.obj.matrixWorld);
    return true;
  },

  /** A raider's shell between a and b (world): through a spread radiator (it wrecks some of it and goes on), and into
   *  the hull (integrity.mjs: the armour first). */
  hitsCarrier(s, a, b) {
    const A = _c.copy(a).applyMatrix4(this.inv), B = _d.copy(b).applyMatrix4(this.inv);
    const n = Math.max(1, Math.ceil(A.distanceTo(B) / 1.2));
    const q = new THREE.Vector3();
    for (let i = 1; i <= n; i++) {
      q.lerpVectors(A, B, i / n);
      const P = this.ship.parts;
      if (P) {
        // Her machinery standing proud of the skin (carrier-damage.mjs): a turret, a gun mount or a thruster cluster
        // stops the round and takes it; a spread radiator is wrecked in part and the round goes on through.
        const part = P.at(q);
        if (part && !(part.kind === 'radiator' && s.radiator)) {
          const dir = _a.subVectors(B, A).normalize();
          if (s.torpedo && part.kind !== 'radiator') {
            this.ship.arrive(q, dir, { ...this.torpHarm(), part: { part: 'hull' } });
            return true;
          }
          P.hit(part, s.torpedo ? 60 : P.shellHp(part.kind === 'radiator' ? 0.6 : 1), q, dir);
          this.flash(this.C.frame.localToWorld(q.clone()), part.kind === 'radiator' ? 4 : 6, '#ffb070', 0.3);
          if (part.kind === 'radiator') s.radiator = true;
          else {
            this.impact(this.C.frame.localToWorld(_n.copy(q)), _w.subVectors(B, A).normalize().transformDirection(this.C.frame.matrixWorld), 1, '#ffb070');
            return true;
          }
        }
      } else if (!s.radiator && this.plant) {
        const r = this.plant.radiatorAt(q);
        if (r) {
          s.radiator = true;
          this.plant.hitRadiator(r, s.torpedo ? 0.6 : 0.2);
          this.flash(this.C.frame.localToWorld(q.clone()), 4, '#ffb070', 0.3);
        }
      }
      // What it meets: the hull, or in the drum section's open tube the sleeve, a drum or the exposed structure.
      const met = this.ship.meets ? this.ship.meets(q) : this.ship.inHull(q) && { part: 'hull' };
      if (met) {
        // A bay door in the hangar's wall: the door takes it as well as whatever is behind.
        const door = met.part === 'hull' && P?.doorAt(q);
        if (door && !s.torpedo) P.hit(door, s.torpedo ? 70 : P.shellHp(), q, _a.subVectors(B, A).normalize());
        if (s.torpedo) this.ship.arrive(q, _a.subVectors(B, A), { ...this.torpHarm(), part: met });
        else {
          this.impact(this.C.frame.localToWorld(_n.copy(q)), _w.subVectors(B, A).normalize().transformDirection(this.C.frame.matrixWorld), 1, '#ffb070');
          this.ship.arrive(q, _a.subVectors(B, A), { shell: true, part: met });
        }
        return true;
      }
    }
    return false;
  },

  /** What a torpedo does when it reaches the hull: integrity.mjs's numbers from the layout's `torpedo`. */
  torpHarm() {
    const T = this.W.torpedo, r = this.rand;
    const pick = (x) => x[0] + r() * (x[1] - x[0]);
    return { pen: pick(T.pen), damage: pick(T.damage), hole: pick(T.hole), torpedo: true };
  },

  /** A big gun's muzzle blast at `p` (world) along `d` (world, unit): what a heavy gun throws out of its muzzle in
   *  vacuum, where nothing slows it and nothing hangs. The gas is puff.mjs `muzzle` (`this.puffs`, set by main.mjs): a
   *  white star at the muzzle, a cone thrown ahead, the muzzle brake's lobes thrown out flat round the barrel, gone in a
   *  fraction of a second; and burning grains flung ahead in a cone (`sparkBurst`). `size` 1 is a turret's round; `v0`
   *  what it is carried along with (the carrier). Unseeded randoms: what you see, never what happens. */
  blast(p, d, size, color = '#ffb060', v0 = this.body?.vel) {
    d = _bd.copy(d); // callers hand in shared scratch vectors
    v0 = v0 && _bv.copy(v0);
    this.puffs?.muzzle(p, d, size, { color, v0 });
    this.sparkBurst(p, Math.round(8 + 10 * size), { dir: d, spread: 0.28, speed: 160 * size, v0, life: 0.5, color: '#ffb050', w: 0.22 * size });
  },

  flash(p, size, color, life) {
    const m = new THREE.Mesh(FLASH_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.copy(p);
    m.frustumCulled = false;
    this.scene.add(m);
    this.fx.push({ kind: 'flash', mesh: m, t: 0, life, size });
  },

  fxFrame(dt) {
    for (const e of this.fx) {
      e.t += dt;
      const k = e.t / e.life;
      if (e.kind === 'flash') {
        e.mesh.scale.setScalar(e.size * (0.4 + 0.8 * Math.sqrt(k)));
        e.mesh.material.opacity = Math.max(0, 1 - k);
      } else if (e.kind === 'ring') {
        // Out fast and fading, carried along with the gun.
        e.mesh.scale.setScalar(e.size * (0.15 + 0.85 * Math.sqrt(Math.min(1, k))));
        e.mesh.material.opacity = Math.max(0, 1 - k) ** 1.5 * 0.9;
        if (e.vel) e.mesh.position.addScaledVector(e.vel, dt);
      } else if (e.kind === 'debris') {
        e.mesh.position.addScaledVector(e.vel, dt);
        e.mesh.rotation.x += e.spin.x * dt;
        e.mesh.rotation.y += e.spin.y * dt;
        e.mesh.rotation.z += e.spin.z * dt;
      }
      if (k >= 1) {
        e.mesh.removeFromParent();
        if (e.kind === 'flash' || e.kind === 'ring') e.mesh.material.dispose();
      }
    }
    this.fx = this.fx.filter((e) => e.t < e.life);
    // The sparks, into the streak pool after the shells (shellsFrame began it), and the pool drawn.
    this.sparksFrame(dt);
    this.streaks.end();
  },

  // --- recoil --------------------------------------------------------------------------------------------------------

  /** A gun's kick: impulse `J` (world, N·s: the push on the ship, the other way from the shot) at world point `p`. It
   *  changes her velocity and, off her centre of mass, her turn; flight assist then fires her thrusters to take it out.
   *  Aboard you feel it, the harder the heavier the shot and the nearer the gun, and hear it through her structure
   *  (gunfeel.mjs: `kind` is 'cannon', 'rail', 'tube', 'pdc' or 'flak'). */
  recoil(p, J, kind = 'cannon') {
    const B = this.body, j = J.length();
    if (!B?.mass || !(j > 0)) return;
    B.vel.addScaledVector(J, 1 / B.mass);
    const local = this.C.frame.worldToLocal(_k1.copy(p));
    const d = this.ship.you ? local.distanceTo(this.ship.you) : 200;
    const tau = local.sub(this.com).cross(_k2.copy(J).applyQuaternion(this.C.frame.getWorldQuaternion(_kq).invert()));
    B.ang.x += tau.x / B.I.x;
    B.ang.y += tau.y / B.I.y;
    B.ang.z += tau.z / B.I.z;
    this.kicked = (this.kicked ?? 0) + j; // the console's tally (tests)
    this.C.bus?.emit('fire', { at: p, impulse: j });
    this.ship.shake = Math.max(this.ship.shake, (0.45 * Math.min(1, j / 2.8e6)) / (1 + d / 25) + j / 2.4e8); // the jitter: the sway is `feel`'s
    this.feel?.gun(kind, j, d, this.ship.aboard !== false);
  },

  /** A hit's shove on her: `p` and `dir` in the ship's frame, `kind` 'kick' (a torpedo), 'shell' or 'glance'; the
   *  impulse is the layout's `weapons.brace.shove`. Like a recoil it moves her and, off her centre, turns her. */
  struck(p, dir, kind) {
    const B = this.body, S = this.W.brace?.shove;
    if (!B?.mass || !S) return;
    const j = S[kind === 'kick' ? 0 : kind === 'shell' ? 1 : 2];
    if (!(j > 0)) return;
    const J = _k2.copy(dir).normalize().multiplyScalar(j);
    const tau = _k1.copy(p).sub(this.com).cross(J);
    B.ang.x += tau.x / B.I.x;
    B.ang.y += tau.y / B.I.y;
    B.ang.z += tau.z / B.I.z;
    B.vel.addScaledVector(J.applyQuaternion(this.C.frame.getWorldQuaternion(_kq)), 1 / B.mass);
  }
};
