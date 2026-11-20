// Shells in flight, theirs and ours: fired, flown, meeting the carrier's radiators or hull or the raider, and the
// flashes; and the recoil every big gun puts into the ship's `Rigid`. Part of `Weapons` (weapons.mjs).

import { THREE, at, clamp, _a, _b, _c, _d, _m, Z, _k1, _k2, _kq, SHELL_GEO, SHELL_OURS, SHELL_THEIRS, FLASH_GEO, turn } from './shared.mjs';

/** Mixed into `Weapons` (weapons.mjs). */
export const projectileParts = {
  // --- shells --------------------------------------------------------------------------------------------------------

  fire(p, vel, ours, life, dmg = 0) {
    const mesh = new THREE.Mesh(SHELL_GEO, ours ? SHELL_OURS : SHELL_THEIRS);
    mesh.frustumCulled = false;
    mesh.position.copy(p);
    this.scene.add(mesh);
    const s = { mesh, pos: p.clone(), vel: vel.clone(), life, ours, dmg, inside: false };
    this.shells.push(s);
    return s;
  },

  shellsFrame(dt) {
    const prev = new THREE.Vector3();
    const R = this.raider;
    const centre = this.C.obj.position;
    for (const s of this.shells) {
      prev.copy(s.pos);
      s.pos.addScaledVector(s.vel, dt);
      s.life -= dt;
      // Drawn as a streak along its way past the carrier (you are almost always moving with her).
      _a.subVectors(s.vel, this.body.vel);
      const sp = _a.length();
      s.mesh.position.copy(s.pos);
      s.mesh.quaternion.setFromUnitVectors(Z, _a.normalize());
      const len = Math.min(sp * (s.rail ? 0.012 : 0.03), s.rail ? 110 : 40), w = s.w ?? (s.ours ? 0.7 : 1.1);
      s.mesh.scale.set(w, w, len);
      if (s.ours) {
        if (R && !R.gone && !R.dead && this.hitsRaider(prev, s.pos, _b)) {
          if (s.you) R.byYou = (R.byYou ?? 0) + 1; // your own hits (the career counts them)
          this.raiderHit(_b, s.dmg, s.you);
          s.life = 0;
        } else if (s.cannon && s.pos.distanceTo(centre) < 240 && this.ship.inHull(_b.copy(s.pos).applyMatrix4(this.inv))) {
          // A fighter's round that finds the carrier: stopped by her plating, with a spark to show for it.
          this.flash(s.pos, 1.5, '#ffd090', 0.12);
          s.life = 0;
        } else {
          // A shell or a cannon round that passes close to one of the raider's torpedoes kills it.
          const t = this.torpHit(prev, s.pos, 'theirs', s.cannon ? this.W.fighter.radius ?? 3 : 4);
          if (t) (s.life = 0), this.killTorp(t, s.you ? 'you' : 'gun');
        }
      } else if (s.flak) {
        // A shot at the fighter: a hit if its path this frame passes within her hull's reach.
        const fi = this.fighter;
        if (fi?.flying) {
          const ab = _b.subVectors(s.pos, prev), ap = _c.subVectors(fi.obj.position, prev);
          const k = clamp(ap.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
          // She moves too: test against where she was at that moment of the frame.
          ap.addScaledVector(fi.body.vel, -(1 - k) * dt).addScaledVector(ab, -k);
          if (ap.length() < (this.W.raider.flak?.radius ?? 4)) {
            this.fighterHit(_d.copy(prev).addScaledVector(ab, k), s.dmg);
            s.life = 0;
          }
        }
      } else if (prev.distanceTo(centre) < 280 || s.pos.distanceTo(centre) < 280) {
        if (this.hitsCarrier(s, prev, s.pos)) s.life = 0;
      }
    }
    for (const s of this.shells) if (s.life <= 0) s.mesh.removeFromParent();
    this.shells = this.shells.filter((s) => s.life > 0);
  },

  /** Does the segment a→b (world) pass through the raider's ellipsoid? Where, in `out`. */
  hitsRaider(a, b, out) {
    const R = this.raider, size = R.K.size, o = R.centre;
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
      if (!s.radiator && this.plant) {
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
        if (s.torpedo) this.ship.arrive(q, _a.subVectors(B, A), { ...this.torpHarm(), part: met });
        else this.ship.arrive(q, _a.subVectors(B, A), { shell: true, part: met });
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
      } else if (e.kind === 'debris') {
        e.mesh.position.addScaledVector(e.vel, dt);
        e.mesh.rotation.x += e.spin.x * dt;
        e.mesh.rotation.y += e.spin.y * dt;
        e.mesh.rotation.z += e.spin.z * dt;
      }
      if (k >= 1) {
        e.mesh.removeFromParent();
        if (e.kind === 'flash') e.mesh.material.dispose();
      }
    }
    this.fx = this.fx.filter((e) => e.t < e.life);
  },

  // --- recoil --------------------------------------------------------------------------------------------------------

  /** A gun's kick: impulse `J` (world, N·s: the push on the ship, the other way from the shot) at world point `p`. It
   *  changes her velocity and, off her centre of mass, her turn; flight assist then fires her thrusters to take it out.
   *  Aboard you feel it, the harder the heavier the shot and the nearer the gun. */
  recoil(p, J) {
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
    this.ship.shake = Math.max(this.ship.shake, Math.min(1, j / 2.8e6) / (1 + d / 25) + j / 1.2e8);
  }
};
