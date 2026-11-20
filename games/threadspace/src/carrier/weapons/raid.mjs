// The raider (a Rook corvette) and the gunnery drill's towed target: sending them, flying their passes, their guns
// and torpedo salvos, hits on them, and the raid's end. Part of `Weapons` (weapons.mjs).

import { THREE, corvette, setThrust, metal, at, box, clamp, _a, _b, _c, _d, _q, _m, intercept, sled } from './shared.mjs';

/** Mixed into `Weapons` (weapons.mjs). */
export const raidParts = {
  // --- the raid ------------------------------------------------------------------------------------------------------

  /** The waypoints of `n` firing passes down the side `from`, `d` metres off, in the ship's frame: in from ahead, bow
   *  to stern and back, then away. */
  passes(from, d, n) {
    const sideways = from === 'port' || from === 'starboard';
    const sign = from === 'port' || from === 'below' ? -1 : 1;
    // A point `out` metres off her side, `z` along her, in the ship's frame.
    const pt = (out, z) => new THREE.Vector3(sideways ? sign * out : 0, sideways ? this.com.y : this.com.y + sign * out, z);
    const wps = [{ p: pt(d + 1800, -2600) }];
    for (let i = 0; i < n; i++) {
      const dz = i % 2 ? -1 : 1; // bow to stern, then back
      wps.push({ p: pt(d, -1000 * dz), fire: true }, { p: pt(d, 1000 * dz), fire: true });
      wps.push({ p: pt(d + 700, 1900 * dz) }, { p: pt(d + 1700, 1700 * dz) }, { p: pt(d + 1200, 1150 * dz) });
    }
    const last = n % 2 ? 1 : -1;
    wps.push({ p: pt(d + 7000, 5000 * last), leave: true });
    return wps;
  },

  /** Puts `obj` at the first waypoint, flying for the second. `K` is its entry in the layout's `weapons` (its speed,
   *  its size, what it carries); `more` is what makes it a raider or a target. */
  contact(obj, K, from, wps, more) {
    obj.traverse((o) => o.isMesh && (o.frustumCulled = false));
    const start = this.C.frame.localToWorld(wps[0].p.clone());
    obj.position.copy(start);
    this.scene.add(obj);
    const fwd = this.C.frame.localToWorld(wps[1].p.clone()).sub(start).normalize();
    this.raider = {
      obj, K, from, sinceHit: 99, rel: fwd.multiplyScalar(K.speed), wps, wi: 0, gunT: 2 + this.rand() * 2,
      jink: new THREE.Vector3(), jinkT: 0, weave: new THREE.Vector3(), v: fwd.clone(), gone: false, dead: false, smokeT: 0, ...more
    };
    return this.raider;
  },

  /** A raider comes in from `from` (port, starboard, above, below) for `passes` firing passes. */
  raid(from = 'port', passes = this.W.raider.passes) {
    if (this.raider && !this.raider.gone) {
      if (!this.raider.target) return this.raider;
      this.endRaid(); // a target still out is cut loose: the real thing has turned up
    }
    const R = this.W.raider;
    const d = R.standoff[0] + this.rand() * (R.standoff[1] - R.standoff[0]);
    const obj = corvette();
    setThrust(obj, 1);
    this.tubeT = this.W.tubes?.first ?? 6; // the CIC needs a firing solution before its first salvo
    for (const b of Object.values(this.broad ?? {})) b.t = Math.max(b.t, this.W.broadside.first ?? 20);
    return this.contact(obj, R, from, this.passes(from, d, passes), {
      label: 'RAIDER', centre: new THREE.Vector3(0, 1, -6), hull: R.hull,
      torpLeft: R.torpedo?.stock ?? 0, torpT: 3 + this.rand() * 3, pdcT: 0, pdcAim: null
    });
  },

  /** A gunnery drill: a tug streams a target sled down the side `from` on straight, steady passes (the layout's
   *  `weapons.target`). Nothing shoots back, the gun crews hold their fire, and every hit on the sled is counted
   *  (`raider.hits`, and `byYou` for your own). `dismiss()` sends the tug home early. */
  drill(from = 'starboard', passes = this.W.target.passes) {
    if (this.raider && !this.raider.gone) return this.raider;
    const T = this.W.target;
    const d = T.standoff[0] + this.rand() * (T.standoff[1] - T.standoff[0]);
    return this.contact(sled(T.tow), T, from, this.passes(from, d, passes), {
      target: true, label: 'TARGET', centre: new THREE.Vector3(), hull: Infinity, shield: 0, hits: 0, strobeT: 0
    });
  },

  /** The contact breaks off now (a target tug sent home once the shoot is done). */
  dismiss() {
    const R = this.raider;
    if (R && !R.gone && !R.dead) R.wi = R.wps.length - 1;
  },

  raiderFrame(dt) {
    const R = this.raider;
    if (!R || R.gone) return;
    const K = R.K;
    if (R.dead) return;
    // Steer for the next waypoint, which is in the carrier's frame (it moves and turns with her).
    const wp = R.wps[R.wi];
    const target = this.C.frame.localToWorld(_a.copy(wp.p));
    const to = _b.subVectors(target, R.obj.position);
    if (to.length() < 160 && R.wi < R.wps.length - 1) R.wi++;
    const want = _c.copy(to).normalize().multiplyScalar(K.speed * (wp.leave ? 1.6 : 1));
    const dv = _d.subVectors(want, R.rel);
    const step = K.accel * dt;
    if (dv.length() > step) dv.setLength(step);
    R.rel.add(dv);
    // Jinking: a sideways push that changes every second or two, so a long shot (seconds in flight) misses and a close
    // one does not.
    if ((R.jinkT -= dt) <= 0) {
      R.jinkT = 1.2 + this.rand() * 1.6;
      R.jink.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5);
      R.jink.addScaledVector(R.rel, -R.jink.dot(R.rel) / Math.max(1, R.rel.lengthSq())).setLength(K.jink ?? 0);
      if (R.weave.dot(R.jink) > 0 && this.rand() < 0.6) R.jink.negate(); // weave back and forth, not off in a line
    }
    R.weave.addScaledVector(R.jink, dt).multiplyScalar(1 - Math.min(1, dt * 0.4));
    if (R.weave.length() > 45) R.weave.setLength(45);
    R.v.copy(R.rel).add(R.weave); // its whole velocity past her: what a gun has to lead
    R.obj.position.addScaledVector(R.v, dt).addScaledVector(this.body.vel, dt);
    // Nose along its way past her, banking into the turn.
    _m.lookAt(_a.copy(R.obj.position), _b.copy(R.obj.position).add(R.rel), _c.copy(this.C.obj.up).applyQuaternion(this.C.obj.quaternion));
    _q.setFromRotationMatrix(_m);
    R.obj.quaternion.slerp(_q, Math.min(1, dt * 2.5));
    R.obj.updateMatrixWorld(true);
    R.sinceHit += dt;
    // Its turrets track the carrier.
    const centre = this.C.obj.position;
    for (const t of R.obj.userData.turrets ?? []) {
      t.yaw.worldToLocal(_a.copy(centre));
      t.yaw.rotation.y = Math.atan2(-_a.x, -_a.z) + t.yaw.rotation.y;
      t.pitch.rotation.x = clamp(Math.atan2(_a.y, Math.hypot(_a.x, _a.z)), -0.2, 0.8);
    }
    const dist = R.obj.position.distanceTo(centre);
    // Its torpedoes: a salvo every so often while the carrier is in their reach, until it has none left.
    const T = K.torpedo;
    if (T && !R.target && !wp.leave && R.torpLeft > 0 && (R.torpT -= dt) <= 0 && dist > T.range[0] && dist < T.range[1]) {
      R.torpT = T.every * (0.8 + 0.4 * this.rand());
      for (let i = 0; i < Math.min(T.salvo, R.torpLeft); i++) this.launchAtCarrier(R, i);
      R.torpLeft -= Math.min(T.salvo, R.torpLeft);
      if (!this.torpCalled || this.time - this.torpCalled > 12) {
        this.torpCalled = this.time;
        this.C.bus?.emit('call', { id: 'torpedoes-inbound' });
        this.dc?.say(null, 'Torpedoes inbound: point defence tracking.', 0, 5);
      }
    }
    // Its own point defence against the carrier's torpedoes.
    if (K.pdc) this.raiderPdc(R, dt);
    // Its guns, on a pass.
    R.gunT -= dt;
    if (K.gun && wp.fire && dist < K.gun.range && R.gunT <= 0) {
      R.gunT = K.gun.every[0] + this.rand() * (K.gun.every[1] - K.gun.every[0]);
      this.raiderShot(R);
    }
    // Its turrets turn on a fighter that comes within reach: light, quick shots, led for how she is flying now.
    const fi = this.fighter;
    if (K.flak && fi?.flying && !this.crippled && !wp.leave && (R.flakT = (R.flakT ?? 1.5) - dt) <= 0 && fi.obj.position.distanceTo(R.obj.position) < K.flak.range) {
      R.flakT = K.flak.every[0] + this.rand() * (K.flak.every[1] - K.flak.every[0]);
      this.flakShot(R, fi);
    }
    if (wp.leave && dist > (K.clear ?? 5500)) R.target ? this.endRaid(null, 'The target tug is clear.') : this.endRaid('raider-off', 'The raider is breaking off.');
    // A target's strobe, so you can find it against the stars.
    if (R.target && !R.gone && (R.strobeT -= dt) <= 0) {
      R.strobeT = 1.2;
      this.flash(R.obj.position, 7, '#ffffff', 0.12);
    }
    // Burning once its hull is badly hurt.
    if (!R.target && R.hull < K.hull * 0.5 && (R.smokeT -= dt) <= 0) {
      R.smokeT = 0.08;
      _a.set((this.rand() - 0.5) * 16, 4, (this.rand() - 0.2) * 40).applyMatrix4(R.obj.matrixWorld);
      this.flash(_a, 2 + this.rand() * 3, '#ff8a30', 0.5);
    }
  },

  /** One shell from the raider, aimed into a compartment chosen by size, led for how it and the carrier are moving. */
  raiderShot(R) {
    const K = R.K, r = this.rand;
    const n = this.ship.pick();
    const b = n.b;
    _a.set(b.x[0] + (b.x[1] - b.x[0]) * (0.2 + 0.6 * r()), b.y[0] + (b.y[1] - b.y[0]) * (0.2 + 0.6 * r()), b.z[0] + (b.z[1] - b.z[0]) * (0.2 + 0.6 * r()));
    const aim = this.C.frame.localToWorld(_a);
    const turrets = R.obj.userData.turrets ?? [];
    const t = turrets[Math.floor(r() * turrets.length)];
    const muzzle = t ? t.pitch.localToWorld(t.tip.clone()) : R.obj.position.clone();
    // The shell's speed past her is its own plus the raider's: lead so that sum points at the target.
    const u = _b.subVectors(aim, muzzle).normalize();
    const rel = R.v, s = K.gun.shell;
    const ur = u.dot(rel);
    const k = ur + Math.sqrt(Math.max(0, ur * ur - rel.lengthSq() + s * s));
    const dir = _c.copy(u).multiplyScalar(k).sub(rel).divideScalar(s);
    dir.x += (r() - 0.5) * 2 * K.gun.spread;
    dir.y += (r() - 0.5) * 2 * K.gun.spread;
    dir.z += (r() - 0.5) * 2 * K.gun.spread;
    dir.normalize();
    const vel = dir.multiplyScalar(s).add(R.v).add(this.body.vel);
    this.fire(muzzle, vel, false, K.gun.range / s + 1);
    this.flash(muzzle, 2.5, '#ff9a60', 0.15);
    this.sfx?.play('turbolaser', this.ear ? this.ear.distanceTo(muzzle) * 0.6 : 800);
  },

  /** One shot from the raider at the fighter: aimed where she will be if she flies on as she is, so a fighter that
   *  keeps changing her velocity is missed and one that flies straight is not. */
  flakShot(R, fi) {
    const K = R.K.flak, r = this.rand;
    const turrets = R.obj.userData.turrets ?? [];
    const t = turrets[Math.floor(r() * turrets.length)];
    const muzzle = t ? t.pitch.localToWorld(t.tip.clone()) : R.obj.position.clone();
    const own = _a.copy(R.v).add(this.body.vel); // the raider's velocity in the world: its shells keep it
    const to = _b.subVectors(fi.obj.position, muzzle);
    const tt = intercept(to, _c.copy(fi.body.vel).sub(own), K.shell);
    if (tt == null) return;
    const dir = to.addScaledVector(_c, tt).normalize();
    dir.x += (r() - 0.5) * 2 * K.spread;
    dir.y += (r() - 0.5) * 2 * K.spread;
    dir.z += (r() - 0.5) * 2 * K.spread;
    const s = this.fire(muzzle, dir.normalize().multiplyScalar(K.shell).add(own), false, K.range / K.shell + 1, K.damage[0] + r() * (K.damage[1] - K.damage[0]));
    s.flak = true;
    s.w = 0.5;
    this.flash(muzzle, 1.6, '#ff9a60', 0.1);
    this.sfx?.play('turbolaser', this.ear ? this.ear.distanceTo(muzzle) * 0.8 : 900);
  },

  /** The fighter is hit: her hull takes it (the layout's `weapons.fighter.hull`), she is thrown about, and at nothing
   *  she is dead in space: flight control takes her and brings her in (`hooks.crippled`). She is mended on her pad. */
  fighterHit(p, dmg) {
    this.fhull = Math.max(0, this.fhull - dmg);
    this.jolt = 1;
    this.flash(p, 3, '#ffb070', 0.3);
    this.flash(p, 1.5, '#ffffff', 0.1);
    this.sfx?.play('boom', 30, 12);
    if (this.fhull > 0 || this.crippled) return;
    this.crippled = true;
    this.C.bus?.emit('call', { id: 'fighter-down' });
    this.dc?.say(null, 'You are hit and dead in space: flight control is bringing you in.', 0, 8);
    this.C.bus?.emit('fighter-down');
  },

  /** The raid is over: `call` is the announcement (an id), `text` the card's line. */
  endRaid(call, text) {
    const R = this.raider;
    if (!R || R.gone) return;
    R.gone = true;
    if (!R.dead) R.obj.removeFromParent();
    this.ship.raidOver();
    if (call) this.C.bus?.emit('call', { id: call });
    if (text) this.dc?.say(null, text, 0, 6);
  },

  /** The raider is hit at `p` (world): its hull takes it, and at nothing it blows up. */
  raiderHit(p, dmg, you = false, small = false) {
    const R = this.raider, K = R.K;
    R.sinceHit = 0;
    if (R.target) {
      // The sled: a hit is a burst on it and a mark on the score. It is not there to be sunk.
      R.hits++;
      this.flash(p, 10, '#ffc070', 0.5);
      this.flash(p, 5, '#ffffff', 0.15);
      this.sfx?.play('boom', this.ear ? Math.min(900, this.ear.distanceTo(p) * 0.5) : 600, 10);
      return;
    }
    R.hull -= dmg;
    if (small) this.flash(p, 1.6, '#ffd090', 0.08); // a point defence round: a spark on its armour
    else {
      this.flash(p, 9, '#ffc070', 0.45);
      this.flash(p, 5, '#ffffff', 0.12);
    }
    if (R.hull > 0) return;
    // Destroyed: a fireball, and the wreck in pieces.
    R.dead = true;
    R.killedByYou = you;
    const c = R.obj.position.clone();
    this.flash(c, 70, '#ffb050', 1.6);
    this.flash(c, 35, '#ffffff', 0.4);
    for (let i = 0; i < 6; i++) this.flash(_a.copy(c).add(new THREE.Vector3((this.rand() - 0.5) * 30, (this.rand() - 0.5) * 16, (this.rand() - 0.5) * 70)), 20 + this.rand() * 20, '#ff7a30', 0.9 + this.rand());
    const wreck = metal('#5a3634', { rough: 0.7 });
    const vel = R.v.clone().add(this.body.vel);
    for (let i = 0; i < 7; i++) {
      const piece = box(4 + this.rand() * 10, 3 + this.rand() * 6, 6 + this.rand() * 18, wreck);
      piece.position.copy(c).add(new THREE.Vector3((this.rand() - 0.5) * 16, (this.rand() - 0.5) * 8, (this.rand() - 0.5) * 60));
      this.scene.add(piece);
      this.fx.push({ kind: 'debris', mesh: piece, t: 0, life: 25, vel: vel.clone().add(new THREE.Vector3((this.rand() - 0.5) * 70, (this.rand() - 0.5) * 70, (this.rand() - 0.5) * 70)), spin: new THREE.Vector3(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5).multiplyScalar(2) });
    }
    R.obj.removeFromParent();
    this.sfx?.play('boom', this.ear ? Math.min(900, this.ear.distanceTo(c) * 0.5) : 600, 60);
    this.endRaid('splash', 'Splash one: the raider is destroyed.');
  }
};
