// Bandits: the raider's escort fighters (ROADMAP phase 7). Part of `Weapons` (weapons.mjs).
//
// Each is a Rook fighter (ships.mjs `fighter({ rook: true })`) flown on the same `Flight` as yours (flight.mjs): the same
// thrust, tanks, jets and pops, with an AI pilot setting its control frame (`ctl.aim`, `ctl.burn`, `ctl.slide`) instead of
// keys and a mouse. Newton only, so it flies the way yours has to: point the nose along the change of velocity it
// wants and burn, then point the nose wherever it likes (at what it is shooting) while it coasts.
//
// What they do, by `state`:
//
// - `escort`: in a slot off the raider's quarter (`slots`, in its frame), matching it, until the raider starts its
//   firing passes and the carrier is inside `start` metres.
// - `strafe`: gun runs on the carrier's point defence. A run is a straight line parallel to her side, `pass` metres out
//   from a gun facing it, flown at `run` m/s past her: the nose stays on the gun and the cannon fires in bursts from
//   `fire` metres in. Past it by `extend`, it turns for a run back the other way. Their rounds hurt a point defence gun
//   they meet (`hp`, weapons/pdc.mjs), and a spread radiator; elsewhere the armour stops them. Taking the guns out is
//   how they open the way for the raider's torpedoes.
// - `fight`: your fighter. The bandit nearest you inside `engage`, and any you have hit, go for you: hold at about
//   `stand` metres, nose on your lead, firing bursts, jinking on the jets.
// - `rejoin`: back to its slot when it is low on propellant (`bingo`) or the raider is breaking off.
// - `leave`: the raid is over (the raider is gone or dead): away from the carrier, gone at `clear` metres.
//
// Every number is the layout's `weapons.bandit` (tools/carrier-v2.mjs). The point defence takes a bandit inside
// `pdc.fighterRange` once no torpedo is up; your cannon, the turrets' shells and the point defence's rounds all hit it.

import { THREE, wren, setThrust, metal, box, clamp, _a, _b, _c, _d, intercept } from './shared.mjs';
import { Flight, controls } from '../flight.mjs';
import { Rigid } from '../newton.mjs';

const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3();
const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _v = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _mm = new THREE.Matrix4();
const _n = new THREE.Vector3(), _o = new THREE.Vector3(), _up = new THREE.Vector3(), _z0 = new THREE.Vector3(), _f = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, -1);

/** Mixed into `Weapons` (weapons.mjs). */
export const banditParts = {
  /** Every live enemy craft: the raider (not a target sled) and its bandits. */
  foes() {
    const R = this.raider, out = [];
    if (R && !R.gone && !R.dead && !R.target) out.push(R);
    for (const B of this.bandits) if (!B.gone && !B.dead) out.push(B);
    return out;
  },

  /** `n` escorts for raider `R`, in their slots off its quarters. */
  escorts(R, n) {
    const K = this.W.bandit;
    if (!K || !n) return;
    this.bandits = this.bandits.filter((B) => !B.gone);
    for (let i = 0; i < n; i++) this.bandits.push(this.bandit(R, i));
    this.C.bus?.emit('call', { id: 'bandits', n });
    this.dc?.say(null, `Bandits: ${n} fighters escorting the raider.`, 0, 6);
  },

  /** One bandit, at its slot off the raider, flying with it. */
  bandit(R, i) {
    const K = this.W.bandit, F = this.L.fighter;
    const obj = wren({ rook: true });
    obj.traverse((o) => o.isMesh && (o.frustumCulled = false));
    const slot = new THREE.Vector3(...K.slots[i % K.slots.length]).multiplyScalar(1 + Math.floor(i / K.slots.length));
    R.obj.updateMatrixWorld(true);
    obj.position.copy(slot).applyMatrix4(R.obj.matrixWorld);
    obj.quaternion.copy(R.obj.quaternion);
    this.scene.add(obj);
    const body = new Rigid({ mass: F.mass, size: F.size });
    body.vel.copy(R.v).add(this.body.vel);
    const flight = new Flight(F.flight, body, F.thrusters.main[0].force);
    flight.reset(obj);
    flight.online = true;
    const B = {
      kind: 'bandit', i, obj, body, flight, ctl: controls(), K, label: `BANDIT ${i + 1}`,
      hull: K.hull, centre: new THREE.Vector3(...K.centre), slot, raider: R,
      state: 'escort', run: null, burstT: 0, gunT: 0, err: new THREE.Vector3(), jinkT: 0, hitByYou: 0, byYou: 0,
      v: new THREE.Vector3(), acc: new THREE.Vector3(), smokeT: 0, gone: false, dead: false
    };
    B.pos = obj.position; // what the point defence leads (weapons/pdc.mjs): the same shape as a torpedo
    B.vel = body.vel;
    return B;
  },

  /** The carrier's extent in her own frame, once: what a bandit keeps clear of. */
  hullBox() {
    if (this._hullBox) return this._hullBox;
    const box3 = new THREE.Box3(), part = new THREE.Box3();
    const inv = _mm.copy(this.C.frame.matrixWorld).invert();
    const root = this.C.exterior ?? this.C.frame;
    root.updateMatrixWorld(true);
    // What collide.mjs counts as solid: opaque, lit, shown meshes, not the approach lane's rings.
    const solid = (m) => (Array.isArray(m) ? m : [m]).some((x) => x && !x.transparent && !x.isMeshBasicMaterial && x.blending !== THREE.AdditiveBlending);
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !solid(o.material)) return;
      for (let q = o; q && q !== root; q = q.parent) if (!q.visible || q.name === 'approach-lane') return;
      o.geometry.boundingBox ?? o.geometry.computeBoundingBox();
      part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
      box3.union(part);
    });
    if (box3.isEmpty()) box3.set(new THREE.Vector3(-35, -20, -150), new THREE.Vector3(35, 25, 150));
    return (this._hullBox = box3);
  },

  banditsFrame(dt) {
    if (!this.bandits.length) return;
    const K = this.W.bandit;
    const R = this.raider;
    for (const B of this.bandits) {
      if (B.gone || B.dead) continue;
      // What it is doing now.
      const raiderUp = R && R === B.raider && !R.gone && !R.dead;
      const dist = B.obj.position.distanceTo(this.C.obj.position);
      if (!raiderUp) B.state = 'leave';
      else if (R.wps[R.wi]?.leave || this.bingo(B)) B.state = 'rejoin';
      else if (this.wantsYou(B)) B.state = 'fight';
      else if (B.state === 'escort' ? R.wps[R.wi]?.fire && dist < K.start : B.state !== 'rejoin') B.state = 'strafe';
      if (B.state === 'leave' && dist > (K.clear ?? 6000)) {
        B.gone = true;
        B.obj.removeFromParent();
        continue;
      }
      this.pilot(B, dt);
      B.flight.frame(B.ctl, dt);
      setThrust(B.obj, B.flight.power);
      B.v.copy(B.body.vel).sub(this.body.vel);
      B.acc.copy(B.flight.acc).applyQuaternion(B.obj.quaternion);
      B.obj.updateMatrixWorld(true);
      this.banditGun(B, dt);
      // Burning once it is badly hurt.
      if (B.hull < K.hull * 0.5 && (B.smokeT -= dt) <= 0) {
        B.smokeT = 0.12;
        this.flash(_a.set((this.rand() - 0.5) * 3, 0.5, 1 + this.rand() * 2).applyMatrix4(B.obj.matrixWorld), 1 + this.rand() * 1.5, '#ff8a30', 0.4);
      }
    }
    if (this.bandits.every((B) => B.gone || B.dead)) this.bandits = [];
  },

  /** Low on propellant or jet gas (`bingo`, a fraction of either tank): back to the raider. */
  bingo(B) {
    const T = this.L.fighter.flight.tank, P = B.flight.prop, k = this.W.bandit.bingo;
    return P.main < k * T.main || P.rcs < k * T.rcs;
  },

  /** Does bandit `B` go for your fighter? The nearest bandit to her inside `engage`, and any she has hit. */
  wantsYou(B) {
    const fi = this.fighter, K = this.W.bandit;
    if (!fi?.flying || this.crippled) return false;
    const d = B.obj.position.distanceTo(fi.obj.position);
    if (d > K.engage) return false;
    if (B.hitByYou > 0) return true;
    let near = null, nd = Infinity;
    for (const o of this.bandits) {
      if (o.gone || o.dead) continue;
      const od = o.obj.position.distanceTo(fi.obj.position);
      if (od < nd) (nd = od), (near = o);
    }
    return near === B;
  },

  /** The AI pilot: works out the velocity it wants and where it wants its nose, and sets its control frame. */
  pilot(B, dt) {
    const K = this.W.bandit, R = B.raider, c = B.ctl;
    const want = _w, cv = this.body.vel; // the carrier's velocity: the strafe's frame
    let face = null; // a world point to keep the nose on while there is no burn to make (copied into `_f`)
    B.shoot = null;
    c.slide[0] = c.slide[1] = 0;
    if (B.state === 'escort' || B.state === 'rejoin') {
      R.obj.updateMatrixWorld(true);
      const slot = _p.copy(B.slot).applyMatrix4(R.obj.matrixWorld);
      const to = _t.subVectors(slot, B.obj.position);
      want.copy(R.v).add(cv).add(to.multiplyScalar(0.25).clampLength(0, 160));
      face = _f.copy(R.v).normalize().multiplyScalar(1000).add(B.obj.position);
    } else if (B.state === 'leave') {
      const away = _t.subVectors(B.obj.position, this.C.obj.position).normalize();
      want.copy(cv).addScaledVector(away, 320);
    } else if (B.state === 'fight') {
      // Your fighter: hold at about `stand` metres, nose on her lead.
      const fi = this.fighter, me = B.obj.position;
      const r = _t.subVectors(fi.obj.position, me), range = r.length();
      const u = _u.copy(r).normalize();
      want.copy(fi.body.vel).addScaledVector(u, clamp((range - K.stand) * 0.12, -90, 160));
      B.shoot = this.aimAt(B, fi.obj.position, fi.body.vel, K.gun.range);
      face = _f.copy(B.shoot?.lead ?? fi.obj.position);
      this.jinkJets(B, dt);
    } else {
      // A gun run past one of the carrier's point defence guns.
      if (!B.run || !this.runOk(B)) B.run = this.newRun(B);
      const run = B.run;
      if (run) {
        const T = this.C.frame.localToWorld(_p.copy(run.at)); // the gun, now
        const dir = _u.copy(run.dir).applyQuaternion(this.C.obj.quaternion); // along her side, the way the run goes
        const out = _y.copy(run.out).applyQuaternion(this.C.obj.quaternion); // out from her side
        // The run's line: through the point `pass` metres out from the gun, along `dir`.
        const line = _x.copy(T).addScaledVector(out, K.pass);
        const rel = _t.subVectors(B.obj.position, line);
        const along = rel.dot(dir);
        rel.addScaledVector(dir, -along); // off the line, across it
        if (!run.on) {
          // First to the start of the run, `fire` + `lead` metres short of the gun, arriving with the run's velocity.
          // Already on the line short of the gun, it starts the run there.
          const S = _v.copy(line).addScaledVector(dir, -K.fire - K.lead);
          const to = S.sub(B.obj.position), d = to.length();
          const behind = along < -K.fire - K.lead; // still short of the start: arrive there moving along the run
          want.copy(cv).addScaledVector(to.normalize(), Math.min(K.close, d * K.gain)).addScaledVector(dir, behind ? K.run * clamp(1 - d / 1500, 0, 1) : 0);
          if (rel.length() < K.lead * 0.5 && along < -K.fire * 0.5) run.on = true;
          else if (along > -K.fire * 0.5 && rel.length() < 300) B.run = null; // on the line but too late: the next one
        } else {
          // Along the line, closing on it at up to `close` m/s, `gain` per metre off it.
          const corr = _v.copy(rel).multiplyScalar(-K.gain);
          if (corr.length() > K.close) corr.setLength(K.close);
          want.copy(cv).addScaledVector(dir, K.run).add(corr);
        }
        if (along > K.extend) B.run = null; // past it: the next run back the other way
        else if (run.on && along < 0) {
          // Coming in: the nose on the gun, the cannon from `fire` metres.
          B.shoot = this.aimAt(B, T, cv, K.fire, run.g);
          face = _f.copy(B.shoot?.lead ?? T);
        }
        this.jinkJets(B, dt);
      } else want.copy(R.v).add(cv); // nothing left to strafe: fly with the raider
    }
    // Keep clear of her hull: where it will be in `look` seconds at this velocity, inside her box and `clearance`?
    this.keepClear(B, want);
    // Change velocity first: nose along the change wanted, burn once it points there. Otherwise, the nose on `face`.
    const dv = _v.subVectors(want, B.body.vel), need = dv.length();
    const nose = _n.copy(FWD).applyQuaternion(B.obj.quaternion);
    // Shooting, it puts up with a velocity well off what it wants (`shootSlack` m/s) rather than turn away to burn.
    const burnNow = need > (B.shoot?.on ? K.shootSlack : B.flight.burning ? 3 : 8);
    if (burnNow) {
      this.aimNose(c, B.obj, dv);
      c.burn = nose.dot(_o.copy(dv).normalize()) > Math.cos(0.12);
    } else {
      c.burn = false;
      if (face) this.aimNose(c, B.obj, _o.subVectors(face, B.obj.position));
      else c.aim = null;
      // Shooting, the side jets take out what they can of the rest across the nose (more than `trim` m/s of it).
      const local = _o.copy(dv).applyQuaternion(_qa.copy(B.obj.quaternion).invert());
      if (B.shoot?.on && Math.abs(local.x) > K.trim) c.slide[0] = Math.sign(local.x);
      if (B.shoot?.on && Math.abs(local.y) > K.trim) c.slide[1] = Math.sign(local.y);
    }
    // Firing: a burst while the nose is on the lead.
    if (B.shoot?.on && !c.burn) {
      const err = nose.angleTo(_o.subVectors(B.shoot.lead, B.obj.position));
      B.trigger = err < K.gun.cone;
    } else B.trigger = false;
  },

  /** The control frame's aim: the nose along `dir` (world), the bandit's up kept as near its own as it can. */
  aimNose(c, obj, dir) {
    if (dir.lengthSq() < 1e-6) return;
    const up = _up.set(0, 1, 0).applyQuaternion(obj.quaternion);
    _mm.lookAt(_z0.set(0, 0, 0), dir, up); // lookAt's z runs from the target back to the eye, so her -z, the nose, runs along dir
    c.aim = (c.aimQ ??= new THREE.Quaternion()).setFromRotationMatrix(_mm);
  },

  /** Where bandit `B` points to hit something at world `p` moving at `v`: `{ lead, on }` (`on` inside `reach`). */
  aimAt(B, p, v, reach, gun = null) {
    const K = this.W.bandit.gun;
    const me = B.obj.position, r = _c.subVectors(p, me);
    const range = r.length();
    if (range > reach * 1.3) return null;
    const rv = _d.copy(v).sub(B.body.vel);
    const tt = intercept(r, rv, K.shell);
    if (tt == null) return null;
    const lead = (B.leadP ??= new THREE.Vector3()).copy(p).addScaledVector(rv, tt).addScaledVector(B.err, range);
    return { lead, on: range < reach, range, gun };
  },

  /** Under fire (inside `near` metres of the carrier or of your fighter), a short random pop on the side jets every
   *  so often, so a gun leading it misses. Short: the jets' cold gas is a small tank, and a held slide empties it in a
   *  minute or two. */
  jinkJets(B, dt) {
    const K = this.W.bandit.jink, c = B.ctl, fi = this.fighter;
    const near = B.obj.position.distanceTo(this.C.obj.position) < K.near || (fi?.flying && B.obj.position.distanceTo(fi.obj.position) < K.near);
    if ((B.jinkT -= dt) <= 0) {
      B.jinkT = K.every[0] + this.rand() * (K.every[1] - K.every[0]);
      B.jink = near ? [Math.floor(this.rand() * 3) - 1, Math.floor(this.rand() * 3) - 1] : null;
      B.jinkOff = B.jinkT - K.pop;
    }
    if (B.jink && B.jinkT > B.jinkOff) (c.slide[0] = B.jink[0]), (c.slide[1] = B.jink[1]);
  },

  /** Its next gun run: the nearest of the carrier's point defence guns still in action, on a side facing it. */
  newRun(B) {
    const me = this.C.frame.worldToLocal(_p.copy(B.obj.position));
    let best = null, bd = Infinity;
    for (const g of this.pdcs) {
      if (g.hp < 25) continue; // shot up already
      const to = _t.subVectors(me, g.pivot);
      if (to.dot(g.up) < 0) continue; // the far side
      const d = to.length();
      if (d < bd) (bd = d), (best = g);
    }
    if (!best) return null;
    // Along her length (or across, for a gun on the bow or the stern face), coming from the side the bandit is on.
    const out = best.up.clone();
    const ax = Math.abs(out.z) > 0.7 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const side = Math.sign(_t.subVectors(me, best.pivot).dot(ax)) || 1;
    return { g: best, at: best.pivot.clone(), out, dir: ax.multiplyScalar(-side) };
  },

  runOk(B) {
    return B.run.g.hp >= 25;
  },

  /** Hold off a velocity that would take `B` into the carrier within `look` seconds: no closer than `clearance`. */
  keepClear(B, want) {
    const K = this.W.bandit, box3 = this.hullBox();
    const toShip = _qa.copy(this.C.obj.quaternion).invert();
    const p = this.C.frame.worldToLocal(_p.copy(B.obj.position));
    const v = _t.subVectors(want, this.body.vel).applyQuaternion(toShip);
    const ahead = _x.copy(p).addScaledVector(v, K.look);
    const inflate = (q) => q.x > box3.min.x - K.clearance && q.x < box3.max.x + K.clearance && q.y > box3.min.y - K.clearance && q.y < box3.max.y + K.clearance && q.z > box3.min.z - K.clearance && q.z < box3.max.z + K.clearance;
    if (!inflate(ahead) && !inflate(p)) return;
    // Out from her middle, across the line it was taking: keep the part of the velocity that does not close.
    const c = box3.getCenter(_y);
    const out = _u.subVectors(p, c);
    out.set(out.x / (box3.max.x - box3.min.x), out.y / (box3.max.y - box3.min.y), out.z / (box3.max.z - box3.min.z)).normalize();
    const closing = v.dot(out);
    if (closing < 0) v.addScaledVector(out, -closing);
    v.addScaledVector(out, 40);
    want.copy(v.applyQuaternion(this.C.obj.quaternion)).add(this.body.vel);
  },

  /** Its cannon: bursts of `burst` seconds while the nose is on, `pause` between them; each burst its own small aim
   *  error (`gun.err`), the way a real pilot's burst walks off. */
  banditGun(B, dt) {
    const G = this.W.bandit.gun;
    B.gunT = Math.max(0, B.gunT - dt);
    B.burstT -= dt;
    if (B.burstT < -G.pause[0] - this.rand() * (G.pause[1] - G.pause[0])) {
      B.burstT = G.burst[0] + this.rand() * (G.burst[1] - G.burst[0]);
      B.err.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5).multiplyScalar(2 * G.err);
    }
    if (!B.trigger || B.burstT <= 0 || B.gunT > 0) return;
    B.gunT = G.every;
    const w = B.obj, r = this.rand;
    const i = (B.barrel = 1 - (B.barrel ?? 0));
    const p = w.localToWorld((w.userData.muzzles?.[i] ?? new THREE.Vector3(0, 0, -6)).clone());
    const d = _b.set((r() - 0.5) * 2 * G.spread, (r() - 0.5) * 2 * G.spread, -1).normalize().transformDirection(w.matrixWorld);
    const s = this.fire(p, d.multiplyScalar(G.shell).add(B.body.vel), false, G.range / G.shell, G.damage[0] + r() * (G.damage[1] - G.damage[0]));
    s.bandit = true;
    s.w = 0.3;
    this.flash(p, 0.6, '#ff9a60', 0.05);
    if ((B.soundT = (B.soundT ?? 0) - G.every) <= 0) (B.soundT = 0.25), this.sfx?.play('hit', this.ear ? Math.min(900, this.ear.distanceTo(p) * 0.7) : 900);
  },

  /** A bandit's round between a and b (world) near the carrier: a point defence gun it passes close to is shot up
   *  (`pdcDamage`), a spread radiator is hurt a little; elsewhere it sparks off her armour. True if it met her. */
  strafeHit(s, a, b) {
    const G = this.W.bandit.gun;
    const A = _c.copy(a).applyMatrix4(this.inv), Bp = _d.copy(b).applyMatrix4(this.inv);
    const ab = _t.subVectors(Bp, A), L2 = Math.max(1e-9, ab.lengthSq());
    for (const g of this.pdcs) {
      if (g.hp <= 0) continue;
      const k = clamp(_u.subVectors(g.pivot, A).dot(ab) / L2, 0, 1);
      if (_x.copy(A).addScaledVector(ab, k).distanceTo(g.pivot) < G.pdcRadius) {
        const was = g.hp;
        g.hp = Math.max(0, g.hp - (G.pdcDamage[0] + this.rand() * (G.pdcDamage[1] - G.pdcDamage[0])));
        const at = this.C.frame.localToWorld(_x.clone());
        this.flash(at, 2, '#ffd090', 0.15);
        if (was >= 25 && g.hp < 25) {
          this.flash(at, 6, '#ff8a30', 0.6);
          this.C.bus?.emit('call', { id: 'pdc-down', gun: g.name });
          this.dc?.say(null, `Point defence ${g.name} is shot up.`, 0, 5);
        }
        return true;
      }
    }
    const n = Math.max(1, Math.ceil(Math.sqrt(L2) / 1.5));
    for (let i = 1; i <= n; i++) {
      const q = _x.copy(A).addScaledVector(ab, i / n);
      const rad = this.plant?.radiatorAt(q);
      if (rad) {
        this.plant.hitRadiator(rad, G.radiator);
        this.flash(this.C.frame.localToWorld(q.clone()), 1.5, '#ffb070', 0.12);
        return true;
      }
      if (this.ship.inHull(q)) {
        this.flash(this.C.frame.localToWorld(q.clone()), 1.2, '#ffd090', 0.1);
        return true;
      }
    }
    return false;
  },

  /** Bandit `B` is hit at `p` (world): its hull takes it, and at nothing it blows up. */
  banditHit(B, p, dmg, you = false, small = false) {
    B.hull -= dmg;
    if (you) (B.hitByYou++), (B.byYou++);
    this.flash(p, small ? 1.2 : 2.5, '#ffd090', 0.1);
    if (B.hull > 0) return;
    B.dead = true;
    B.killedByYou = you;
    const c = B.obj.position.clone();
    this.flash(c, 22, '#ffb050', 1.1);
    this.flash(c, 10, '#ffffff', 0.25);
    const wreck = metal('#5a2b28', { rough: 0.7 });
    for (let i = 0; i < 4; i++) {
      const piece = box(0.8 + this.rand() * 2.5, 0.4 + this.rand(), 1 + this.rand() * 3, wreck);
      piece.position.copy(c);
      this.scene.add(piece);
      this.fx.push({ kind: 'debris', mesh: piece, t: 0, life: 15, vel: B.body.vel.clone().add(new THREE.Vector3((this.rand() - 0.5) * 50, (this.rand() - 0.5) * 50, (this.rand() - 0.5) * 50)), spin: new THREE.Vector3(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5).multiplyScalar(4) });
    }
    B.obj.removeFromParent();
    this.sfx?.play('boom', this.ear ? Math.min(900, this.ear.distanceTo(c) * 0.5) : 700, 25);
    (this.kills ??= []).push({ t: this.time, who: B.label, you });
    this.C.bus?.emit('call', { id: 'splash-bandit' });
    this.dc?.say(null, you ? `Splash one bandit: yours.` : 'Splash one bandit.', 0, 5);
  },

  /** A foe (the raider or a bandit) is hit. */
  foeHit(F, p, dmg, you = false, small = false) {
    if (F.kind === 'bandit') return this.banditHit(F, p, dmg, you, small);
    return this.raiderHit(p, dmg, you, small);
  }
};
