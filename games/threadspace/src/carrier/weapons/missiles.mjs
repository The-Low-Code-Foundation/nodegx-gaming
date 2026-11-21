// Heat-seeking missiles and flares (ROADMAP phase 7). Part of `Weapons` (weapons.mjs).
//
// Heat. Everything out there glows in the infrared by how hot it is (`heatSources()`, the layout's `weapons.heat`): a
// fighter a little from her hull and a lot from her drive while it burns; the raider always (its drives run on its
// passes); the carrier most of all, from her radiators as far as they are spread and the heat in her sinks; a
// torpedo while its motor burns; a flare, very bright for a few seconds. A seeker sees each as I / r² (its brightness
// at that range), and only inside its cone.
//
// Missiles (`missile`). Each fighter carries `rails` of them, yours reloaded on the pad. On the rail the seeker looks
// along her nose, or at the contact her sight has selected when that is within `offBore` of the nose; it locks the
// brightest thing it sees there above `sense`, and the HUD boxes it and the tone rises (`railsFrame`). Q fires: it
// drops off the rail, lights after `drop` s, and burns at `accel` for `burn` s, steering by proportional navigation on
// what its seeker tracks; after burnout it can still steer a little on its divert jets (`divert`, `divertDv`). In
// flight the seeker keeps to a small `gate` round what it is tracking and takes the brightest thing in it, the one it
// already has counting `hold` times as bright: so a flare that is brighter than its target, near it in the seeker's
// eye, takes the missile away, unless the seeker sees it for a flare (`reject` of the time, judged once a flare) and
// looks past it. With nothing in the gate it looks over its whole `fov` again. Armed after `arm` s, it goes off within
// `fuse` of a craft (or a flare: wasted), and is gone after `life`. It has no friend or foe: it goes for what is hot.
//
// Flares (`flares`). Every ship carries them: your fighter (G: a pair), the bandits, the raider, the carrier. Each is
// thrown out at `eject` m/s and burns at `heat` for `life` s, fading. In space a flare does not fall behind: it keeps
// the ship's velocity plus its throw, so it only works against a seeker that sees it brighter than the ship. A
// fighter's flare is brighter than her coasting, not burning: cut the drive and flare. The AI ships (`flareAI`) flare when a missile tracking them is inside `react` m, after a moment to
// notice; a bandit also cuts its drive for a few seconds. The raider's point defence fires at our missiles, and the
// carrier's at any missile homing on her.

import { THREE, at, cyl, clamp, _a, _b, _c, _d, _e, _f, _g, _m, Y, flareTex, TORP_BODY, TORP_NOSE } from './shared.mjs';
import { motorFlame, flameFrame } from './tracers.mjs';

const _h = new THREE.Vector3(), _i = new THREE.Vector3(), _j = new THREE.Vector3(), _k = new THREE.Vector3();
const _n = new THREE.Vector3(), _o = new THREE.Vector3(); // the looks' own: nothing below hands them on
const FWD = new THREE.Vector3(0, 0, -1);

/** A missile: a slim body, a seeker's dome, four tail fins, its motor's glow and its flame. -z is its nose. */
function missileMesh(ours) {
  const g = new THREE.Group();
  g.add(at(cyl(0.09, 0.09, 2.6, TORP_BODY, 6), 0, 0, 0, Math.PI / 2));
  g.add(at(cyl(0.02, 0.09, 0.3, TORP_NOSE, 6), 0, 0, -1.45, -Math.PI / 2));
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(FIN_GEO, TORP_BODY);
    fin.position.z = 1.05;
    fin.rotation.z = (i * Math.PI) / 2 + Math.PI / 4;
    g.add(fin);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex(), color: ours ? '#ffe6c0' : '#ffc0a0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.position.z = 1.5;
  glow.scale.setScalar(3);
  g.add(glow);
  g.userData.glow = glow;
  const flame = motorFlame(0.16, 7, ours ? '#ffb868' : '#ff9060');
  flame.position.z = 1.35;
  g.add(flame);
  g.userData.flame = flame;
  g.traverse((o) => (o.frustumCulled = false));
  return g;
}

const FIN_GEO = new THREE.BoxGeometry(0.02, 0.36, 0.42).translate(0, 0.22, 0);
// A flare: a small, fierce white-pink core (magnesium burning) in a big warm halo that flickers.
const FLARE_MAT = () => new THREE.SpriteMaterial({ map: flareTex(), color: '#fff4ec', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const HALO_MAT = () => new THREE.SpriteMaterial({ map: flareTex(), color: '#ff9a50', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

/** Mixed into `Weapons` (weapons.mjs). */
export const missileParts = {
  // --- heat ------------------------------------------------------------------------------------------------------------

  /** Everything hot out there, this frame: `{ ref, pos, vel, I, side }` (world). `ref` is the thing itself (your
   *  fighter, a bandit, the raider, the string 'carrier', a torpedo, a flare); `side` is whose. */
  heatSources() {
    const H = this.W.heat, out = (this._heat ??= []);
    out.length = 0;
    const fi = this.fighter;
    if (fi?.flying && fi.obj) out.push({ ref: fi, pos: fi.obj.getWorldPosition(_h.clone()), vel: fi.body.vel, I: this.craftHeat(fi.flight, H.fighter), side: 'ours' });
    for (const B of this.bandits) if (!B.dead && !B.gone) out.push({ ref: B, pos: B.obj.position, vel: B.body.vel, I: this.craftHeat(B.flight, H.fighter), side: 'theirs' });
    const R = this.raider;
    if (R && !R.gone && !R.dead) out.push({ ref: R, pos: R.obj.position, vel: _i.copy(R.v).add(this.body.vel).clone(), I: H.raider.base + H.raider.drive, side: R.target ? 'target' : 'theirs' });
    const P = this.plant;
    let spread = 0;
    for (const r of P?.radiators ?? []) spread += r.k * r.health;
    spread /= Math.max(1, P?.radiators?.length ?? 1);
    out.push({ ref: 'carrier', pos: this.C.frame.localToWorld(_j.copy(this.com)), vel: this.body.vel, I: H.carrier.base + H.carrier.radiators * spread * (0.3 + (P?.heat ?? 0)) + H.carrier.drive * clamp((this.C.push ?? 0) / 2, 0, 1), side: 'ours' });
    for (const t of this.torps) if (!t.dead && t.t >= 0 && t.t < this.W.torpedo.burn) out.push({ ref: t, pos: t.pos, vel: t.vel, I: H.torpedo, side: t.side });
    for (const f of this.flares) if (!f.dead) out.push({ ref: f, pos: f.pos, vel: f.vel, I: f.I, side: 'flare' });
    return out;
  },

  /** A fighter's heat: its hull, its drive by power, and a little while a jet is open. */
  craftHeat(fl, H) {
    let jets = 0;
    for (const n of fl.noz) if (n.open) jets = 1;
    return H.base + H.drive * fl.power + H.jets * jets;
  },

  /** What a seeker at `p` looking along `dir` (unit) sees brightest within `cone` radians: `{ src, b }` (b = I / r²),
   *  or null. `held` (a source's ref) counts `hold` times as bright. `skip` is a ref it cannot see (its own craft);
   *  `ignore`, a set of refs it has seen through (flares it knows for flares). */
  seek(p, dir, cone, held = null, skip = null, list = this.heatSources(), ignore = null) {
    const M = this.W.missile, cosC = Math.cos(cone);
    let best = null, bb = 0;
    for (const s of list) {
      if (s.ref === skip || ignore?.has(s.ref)) continue;
      const r = _k.subVectors(s.pos, p), d = Math.max(30, r.length());
      if (r.dot(dir) / d < cosC) continue;
      const b = (s.I / (d * d)) * (s.ref === held ? M.hold : 1);
      if (b > bb) (bb = b), (best = s);
    }
    return best && bb * 1e6 >= M.sense ? { src: best, b: bb } : null;
  },

  // --- the fighter's rails ---------------------------------------------------------------------------------------------

  /** Her seeker on the rail, each frame: what it locks, the tone, and the rails reloaded on the pad. Also the warning
   *  of a missile tracking her. */
  railsFrame(dt) {
    const M = this.W.missile, fi = this.fighter;
    if (!M || !fi) return;
    if (this.rails == null || !fi.flying) this.rails = M.rails; // reloaded on the pad
    if (this.myFlares == null || !fi.flying) this.myFlares = this.W.flares.fighter.count;
    this.lock = null;
    this.seeing = 0;
    if (fi.flying && !this.crippled && this.rails > 0) {
      const w = fi.obj, p = w.getWorldPosition(_a), nose = _b.copy(FWD).transformDirection(w.matrixWorld);
      // Slaved to the selected contact when it is near the nose; along the nose otherwise.
      const sel = this.selected?.();
      let look = nose;
      if (sel) {
        const to = _c.subVectors(sel.obj.position, p).normalize();
        if (to.angleTo(nose) < M.offBore) look = to;
      }
      const s = this.seek(p, look, M.gate, this.lockRef, fi);
      if (s) (this.lock = s.src), (this.lockRef = s.src.ref), (this.seeing = Math.min(1, (s.b * 1e6) / (M.sense * 4)));
      else this.lockRef = null;
    } else this.lockRef = null;
    // A missile tracking her: the closest one, for the warning.
    this.warn = null;
    let wd = Infinity;
    for (const m of this.missiles) {
      if (m.dead || m.track !== fi || !fi.flying) continue;
      const d = m.pos.distanceTo(fi.obj.position);
      if (d < wd) (wd = d), (this.warn = { pos: m.pos, range: d, closing: -_d.subVectors(m.pos, fi.obj.position).dot(_e.subVectors(m.vel, fi.body.vel)) / Math.max(1, d) });
    }
    this.tone(dt);
  },

  /** What her seeker has locked, in a word for the HUD. */
  lockName() {
    const r = this.lock?.ref;
    if (!r) return '';
    if (r === 'carrier') return 'CARRIER';
    if (this.flares.includes(r)) return 'FLARE';
    if (this.torps.includes(r)) return 'TORPEDO';
    return r.label ?? 'HEAT';
  },

  /** The seeker's tone (a growl while it searches, a high steady tone on lock) and the missile warning's beeps, both
   *  synthesised on `sfx.ctx` and heard only in the cockpit. */
  tone(dt) {
    const ctx = this.sfx?.ctx, fi = this.fighter;
    if (!ctx || !this.sfx?.out) return;
    if (!this.toneOsc) {
      this.toneOsc = ctx.createOscillator();
      this.toneOsc.type = 'triangle';
      this.toneGain = ctx.createGain();
      this.toneGain.gain.value = 0;
      this.toneOsc.connect(this.toneGain).connect(this.sfx.out);
      this.toneOsc.start();
    }
    const inCockpit = fi?.flying && this.mode === 'fighter';
    const now = ctx.currentTime;
    this.warnT = (this.warnT ?? 0) + dt;
    let f = 0, v = 0;
    if (inCockpit && this.warn) {
      // Missile: fast beeps, faster the closer it is.
      const rate = clamp(12 - this.warn.range / 400, 3, 12);
      (f = 1400), (v = Math.sin(this.warnT * Math.PI * 2 * rate) > 0 ? 0.05 : 0);
    } else if (inCockpit && this.lock) (f = 1250), (v = 0.035);
    else if (inCockpit && this.rails > 0) (f = 380 + 60 * Math.sin(this.warnT * 37)), (v = 0.012);
    if (f) this.toneOsc.frequency.setTargetAtTime(f, now, 0.01);
    this.toneGain.gain.setTargetAtTime(v, now, 0.01);
  },

  /** Q: one missile off the rail, at what the seeker has locked (or, with no lock, wherever its seeker finds heat). */
  fireMissile() {
    const M = this.W.missile, fi = this.fighter;
    if (!M || !fi?.flying || this.crippled || this.rails <= 0) return false;
    this.rails--;
    const w = fi.obj, side = this.rails % 2 ? 1 : -1;
    w.updateWorldMatrix(true, false);
    const p = w.localToWorld(new THREE.Vector3(side * 1.6, -0.9, -1));
    const dir = _a.copy(FWD).transformDirection(w.matrixWorld);
    const drop = _b.set(0, -1, 0).transformDirection(w.matrixWorld).multiplyScalar(M.push);
    this.launchMissile(p, _c.copy(fi.body.vel).add(drop), dir, 'ours', this.lockRef, fi);
    // Off the rail: the ejector's kick through her airframe and a jolt in the seat; the motor lights a beat later
    // (missilesFrame), close under her nose.
    this.jolt = Math.max(this.jolt ?? 0, 0.45);
    this.feel?.railOff?.();
    this.dc?.say(null, this.lockRef ? 'Fox two: missile away.' : 'Fox two: missile away, no lock.', 0, 3);
    return true;
  },

  /** A missile into the world at `p` with velocity `v`, its nose along `dir`, its seeker on `track` (a heat source's
   *  ref, or null to find one), fired by `from` (which its seeker never sees). */
  launchMissile(p, v, dir, side, track, from) {
    const obj = missileMesh(side === 'ours');
    obj.position.copy(p);
    obj.quaternion.setFromRotationMatrix(_m.lookAt(p, _d.copy(p).add(dir), Y));
    this.scene.add(obj);
    const m = { obj, pos: p.clone(), prev: p.clone(), vel: v.clone(), acc: new THREE.Vector3(), dir: dir.clone(), side, track, from, t: 0, dv: 0, dead: false };
    this.missiles.push(m);
    // The ejector's puff of cold gas off the rail (looks only).
    const G = this.gas;
    for (let i = 0; G && i < 6; i++) G.emit(p, _n.copy(v).add(_o.set(Math.random() - 0.5, -Math.random(), Math.random() - 0.5).multiplyScalar(6)), 0.6 + Math.random() * 0.5, 0.3, 1.5 + Math.random(), 0.2, 0, 1);
    if (from !== this.fighter) this.sfx?.play('hit', this.ear ? this.ear.distanceTo(p) * 0.8 : 900);
    return m;
  },

  /** Every missile in flight: its seeker, its motor and divert jets steering it (PN, N = 4), and what it meets. */
  missilesFrame(dt) {
    const M = this.W.missile;
    if (!M || !this.missiles.length) return;
    const list = this.heatSources();
    for (const m of this.missiles) {
      if (m.dead) continue;
      m.t += dt;
      m.prev.copy(m.pos);
      // The seeker: keep to the gate round what it tracks; lost, look over the whole field of view.
      const cur = m.track && list.find((s) => s.ref === m.track);
      let s = null;
      if (cur) s = this.seekFor(m, _b.subVectors(cur.pos, m.pos).normalize(), M.gate, m.track, list);
      if (!s && m.t > M.drop) s = this.seekFor(m, m.dir, M.fov, null, list); // the seeker looks along its nose
      m.track = s?.src.ref ?? null;
      m.acc.set(0, 0, 0);
      const lit = m.t > M.drop && m.t < M.drop + M.burn;
      if (s && m.t > M.drop) {
        const r = _c.subVectors(s.src.pos, m.pos), vr = _d.subVectors(s.src.vel, m.vel);
        const dist = r.length(), closing = Math.max(50, -r.dot(vr) / Math.max(1, dist)), tgo = dist / closing;
        const cmd = _e.copy(r).addScaledVector(vr, tgo).multiplyScalar(4 / Math.max(0.2, tgo * tgo)); // zero-effort miss, N = 4
        const along = _f.copy(r).normalize();
        cmd.addScaledVector(along, -cmd.dot(along));
        if (lit) {
          if (cmd.length() > M.accel) cmd.setLength(M.accel);
          cmd.addScaledVector(along, Math.sqrt(Math.max(0, M.accel * M.accel - cmd.lengthSq())));
        } else if (m.dv < M.divertDv) {
          if (cmd.length() > M.divert) cmd.setLength(M.divert);
          m.dv += cmd.length() * dt;
        } else cmd.set(0, 0, 0);
        m.acc.copy(cmd);
        if (lit) m.dir.copy(cmd).normalize();
      } else if (lit) m.acc.copy(m.dir).multiplyScalar(M.accel); // no heat seen: straight on
      m.vel.addScaledVector(m.acc, dt);
      m.pos.addScaledVector(m.vel, dt);
      m.obj.position.copy(m.pos);
      m.obj.quaternion.setFromRotationMatrix(_m.lookAt(m.pos, _g.copy(m.pos).add(m.dir), Y));
      const gl = m.obj.userData.glow;
      gl.visible = lit;
      gl.scale.setScalar(this.ear ? clamp(this.ear.distanceTo(m.pos) * 0.012, 3.5, 30) : 3);
      // Its motor: lit with a bang (a flash, a ring of the first gas, the sound), a flame and a long trail of exhaust
      // while it burns (weapons/tracers.mjs). Looks only.
      if (lit && !m.lit) this.ignite(m.pos, m.dir, 1, m.vel);
      if (!lit && m.lit) this.flash(m.pos, 1.5, '#ffb070', 0.2); // burnout
      m.lit = lit;
      flameFrame(m.obj.userData.flame, lit, 1, m.t);
      if (lit) this.trail(_n.copy(m.pos).addScaledVector(m.dir, -1.6), m.dir, m.vel, 60, dt, 0.7);
      // What it meets, once it is armed: the first heat source (any side but its own launcher, and not a flare it has
      // seen through) its path passes within `fuse` of.
      for (const h of m.t > M.arm ? list : []) {
        if (h.ref === m.from || m.ignore?.has(h.ref)) continue;
        const ab = _c.subVectors(m.pos, m.prev);
        const ap = _d.subVectors(h.pos, m.prev).addScaledVector(h.vel, -dt); // where it was at the frame's start, moving on
        const k = clamp(ap.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
        if (h.ref === 'carrier') {
          // The carrier: where its path this frame enters her hull.
          if (m.pos.distanceTo(this.C.obj.position) < 320)
            for (let i = 1; i <= 4 && !m.dead; i++) if (this.ship.inHull(_e.copy(m.prev).lerp(m.pos, i / 4).applyMatrix4(this.inv))) (m.pos.lerpVectors(m.prev, m.pos, i / 4)), this.missileHit(m, h);
        } else if (ap.addScaledVector(ab, -k).length() < M.fuse) this.missileHit(m, h);
        if (m.dead) break;
      }
      if (!m.dead && m.t > M.life) this.missileGone(m);
    }
    this.missiles = this.missiles.filter((m) => !m.dead);
  },

  /** Missile `m`'s seeker, as `seek`, but each flare it takes for the brightest thing in view it judges once: `reject`
   *  of the time it knows it for a flare (its colour is wrong for a hull) and looks past it from then on. */
  seekFor(m, dir, cone, held, list) {
    const M = this.W.missile;
    for (let i = 0; i < 6; i++) {
      const s = this.seek(m.pos, dir, cone, held, m.from, list, m.ignore);
      if (!s || s.src.side !== 'flare' || m.judged?.has(s.src.ref)) return s;
      (m.judged ??= new Set()).add(s.src.ref);
      if (this.rand() >= M.reject) return s;
      (m.ignore ??= new Set()).add(s.src.ref);
    }
    return null;
  },

  /** The first missile a round from `by` ('ours': the carrier's guns; 'theirs': the raider's) can hit, whose path this
   *  frame passes within `r` of the segment a→b (the round's), or null. Her guns hit theirs and any homing on her. */
  missileHitBy(a, b, by, r) {
    for (const t of this.missiles) {
      if (t.dead || !(by === 'ours' ? t.side === 'theirs' || t.track === 'carrier' : t.side === 'ours' || t.track === this.raider)) continue;
      const A = _h.copy(a).sub(t.prev).add(t.pos), ab = _i.subVectors(b, A); // in the missile's moving frame
      const ap = _j.subVectors(t.pos, A);
      const k = clamp(ap.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
      if (ap.addScaledVector(ab, -k).length() < r) return t;
    }
    return null;
  },

  /** Missile `m` goes off at heat source `h`. */
  missileHit(m, h) {
    const M = this.W.missile, r = this.rand, dmg = M.damage[0] + r() * (M.damage[1] - M.damage[0]);
    const p = m.pos.clone();
    this.missileGone(m, true);
    const you = m.from === this.fighter;
    const ref = h.ref;
    if (ref === this.fighter) this.fighterHit(p, dmg);
    else if (ref?.kind === 'bandit') this.banditHit(ref, p, dmg, you);
    else if (ref === this.raider) {
      if (you && !ref.target) ref.byYou = (ref.byYou ?? 0) + 1;
      this.raiderHit(p, dmg * M.ship, you);
    } else if (ref === 'carrier') this.ship.arrive(_a.copy(p).applyMatrix4(this.inv), _b.copy(m.vel).sub(this.body.vel).transformDirection(this.inv), { shell: true, pen: M.carrier.pen, damage: M.carrier.damage, hole: M.carrier.hole });
    else if (ref?.obj && this.torps.includes(ref)) this.killTorp(ref, you ? 'you' : 'missile');
    else if (ref && this.flares.includes(ref)) ref.t = ref.life; // a flare: the missile is spent on it
    if (you) (this.missileLog ??= []).push({ t: this.time, on: ref === 'carrier' ? 'carrier' : ref?.label ?? (this.flares.includes(ref) ? 'flare' : 'torpedo') });
  },

  /** A missile goes off (`burst`) or burns out. */
  missileGone(m, burst = false) {
    m.dead = true;
    m.obj.removeFromParent();
    if (!burst) return;
    this.flash(m.pos, 8, '#ffd090', 0.5);
    this.flash(m.pos, 3, '#ffffff', 0.12);
    this.ring(m.pos, null, 22, '#ffc080', 0.5);
    this.sparkBurst(m.pos, 45, { speed: 150, v0: m.vel, life: 0.9, color: '#ffc070', w: 0.3 }); // the rod warhead's fragments
    this.sfx?.play('boom', this.ear ? Math.min(900, this.ear.distanceTo(m.pos) * 0.5) : 700, 14);
  },

  // --- flares ----------------------------------------------------------------------------------------------------------

  /** `n` flares from world point `p`, thrown out from a craft moving at `vel`, along `out` (unit, world) with some
   *  scatter. `kind` is the layout's `flares` entry it comes from (a fighter's are smaller than a ship's). */
  flare(p, vel, out, n = 2, kind = 'fighter') {
    const F = this.W.flares, K = F[kind] ?? F.fighter;
    for (let i = 0; i < n; i++) {
      const d = _a.copy(out).add(_b.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5).multiplyScalar(1.2)).normalize();
      const v = vel.clone().addScaledVector(d, F.eject * (0.8 + 0.4 * this.rand()));
      const sp = new THREE.Sprite(FLARE_MAT()), halo = new THREE.Sprite(HALO_MAT());
      sp.position.copy(p);
      halo.position.copy(p);
      this.scene.add(sp, halo);
      this.flares.push({ sp, halo, pos: p.clone(), vel: v, t: 0, life: F.life * (0.85 + 0.3 * this.rand()), peak: K.heat, I: K.heat, dead: false, ph: Math.random() * 10, big: kind !== 'fighter' && kind !== 'bandit' });
    }
    // The dispenser's pop: a flash and a puff of its charge (looks only).
    this.flash(p, kind === 'fighter' || kind === 'bandit' ? 1.6 : 5, '#fff0d8', 0.12);
    for (let i = 0; this.gas && i < 4; i++) this.gas.emit(p, _n.copy(vel).addScaledVector(out, 8 + 6 * Math.random()).add(_o.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6)), 0.6 + Math.random() * 0.4, 0.3, 2, 0.2, 0.3, 0);
  },

  flaresFrame(dt) {
    if (!this.flares.length) return;
    for (const f of this.flares) {
      f.t += dt;
      f.pos.addScaledVector(f.vel, dt);
      const k = 1 - f.t / f.life;
      f.I = f.peak * Math.sqrt(Math.max(0, k));
      f.sp.position.copy(f.pos);
      f.halo.position.copy(f.pos);
      // A fierce small core and a big halo, flickering hard (burning magnesium sputters, the more as it burns out),
      // shedding glittering sparks that drift off it (looks only: unseeded).
      const s = this.ear ? clamp(this.ear.distanceTo(f.pos) * 0.012, 2.2, 30) : 3;
      const kk = Math.sqrt(Math.max(0, k)), sputter = 0.12 + 0.3 * (1 - k);
      const flick = 1 - sputter + sputter * (0.5 + 0.5 * Math.sin(f.t * 47 + f.ph) * Math.sin(f.t * 19 + 2 * f.ph)) + 0.08 * Math.random();
      f.sp.scale.setScalar(s * 0.7 * (0.7 + 0.3 * kk) * flick * (f.big ? 1.6 : 1));
      f.halo.scale.setScalar(s * 2.2 * (0.6 + 0.4 * kk) * (0.9 + 0.2 * flick) * (f.big ? 1.8 : 1));
      f.sp.material.opacity = Math.max(0, Math.min(1, k * 1.5));
      f.halo.material.opacity = 0.55 * Math.max(0, Math.min(1, k * 1.5)) * flick;
      if (k > 0.05 && Math.random() < dt * 16) this.sparkBurst(f.pos, 1, { speed: 5, v0: f.vel, life: 0.7, color: '#fff0d0', w: 0.12, k: 1.2 });
      if (k <= 0) (f.dead = true), f.sp.removeFromParent(), f.halo.removeFromParent(), f.sp.material.dispose(), f.halo.material.dispose();
    }
    this.flares = this.flares.filter((f) => !f.dead);
  },

  /** G: a pair of flares from your fighter, down and out either side. */
  dropFlares() {
    const fi = this.fighter;
    if (!fi?.flying || this.myFlares <= 0) return false;
    const n = Math.min(this.W.flares.fighter.salvo, this.myFlares);
    this.myFlares -= n;
    const w = fi.obj;
    w.updateWorldMatrix(true, false);
    this.flare(w.localToWorld(_c.set(0, -1, 2)), fi.body.vel, _d.set(0, -1, 0.4).transformDirection(w.matrixWorld), n, 'fighter');
    this.sfx?.play('hit', 20);
    return true;
  },

  /** The AI ships flare when a missile tracking them is inside `react` metres, after a moment to notice (`notice`).
   *  A bandit also cuts its drive for `coast` seconds, so the flares outshine it. */
  flareAI(dt) {
    const F = this.W.flares;
    for (const m of this.missiles) {
      if (m.dead || !m.track) continue;
      const tr = m.track;
      const isB = tr.kind === 'bandit', isR = tr === this.raider && !tr.target, isC = tr === 'carrier';
      if (!isB && !isR && !isC) continue;
      const kind = isB ? 'bandit' : isR ? 'raider' : 'carrier';
      const K = F[kind];
      const pos = isC ? this.C.obj.position : tr.obj.position;
      if (m.pos.distanceTo(pos) > F.react) continue;
      m.seen ??= {};
      const key = kind;
      m.seen[key] ??= F.notice[0] + this.rand() * (F.notice[1] - F.notice[0]);
      if ((m.seen[key] -= dt) > 0) continue;
      const st = isC ? (this.carrierFlares ??= { left: K.count, t: 0 }) : (tr.flareState ??= { left: K.count, t: 0 });
      if (st.left <= 0 || (st.t -= dt) > 0) continue;
      st.t = K.every;
      const n = Math.min(K.salvo, st.left);
      st.left -= n;
      if (isB) tr.coastT = F.coast;
      const vel = isB ? tr.body.vel : isR ? _a.copy(tr.v).add(this.body.vel).clone() : this.body.vel;
      const out = _b.subVectors(m.pos, pos).normalize().negate().add(_c.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5)).normalize();
      this.flare(pos.clone(), vel, out, n, kind);
    }
  },

  /** A bandit's missile at your fighter: in its fight, when its seeker on its nose locks her, inside `range`, not more
   *  often than `every` seconds, while it has any left (`missiles`). */
  banditMissile(B, dt) {
    const K = this.W.bandit, M = this.W.missile, fi = this.fighter;
    B.missT = (B.missT ?? K.missileFirst) - dt;
    if (B.state !== 'fight' || !fi?.flying || this.crippled || (B.missiles ?? K.missiles) <= 0 || B.missT > 0) return;
    const d = B.obj.position.distanceTo(fi.obj.position);
    if (d < K.missileRange[0] || d > K.missileRange[1]) return;
    const nose = _a.copy(FWD).applyQuaternion(B.obj.quaternion);
    const s = this.seek(B.obj.position, nose, M.gate, null, B);
    if (s?.src.ref !== fi) return;
    B.missT = K.missileEvery;
    B.missiles = (B.missiles ?? K.missiles) - 1;
    const p = B.obj.localToWorld(new THREE.Vector3((B.missiles % 2 ? 1 : -1) * 3, -0.4, -1));
    const drop = _b.set(0, -1, 0).applyQuaternion(B.obj.quaternion).multiplyScalar(M.push);
    this.launchMissile(p, _c.copy(B.body.vel).add(drop), nose, 'theirs', fi, B);
    this.C.bus?.emit('call', { id: 'missile-warning' });
    this.dc?.say(null, 'Missile launch: it is tracking you. Cut your drive and flare (G).', 0, 4);
  }
};
