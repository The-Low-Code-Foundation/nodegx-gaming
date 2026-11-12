// You: a junior materials analyst on the night shift. Movement, the noise your feet make, the pipe wrench and the
// security SMG (drawn in their own scene on top, so they never clip into walls).
import * as THREE from 'three';

import { makeSMG, makeWrench, makeHand, orient } from './models.mjs';
export { makeSMG, makeWrench };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, t) => {
  const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
/** A hand pose on the gun: where the wrist sits and which way the hand faces, in the gun's own space. */
const pose = (p, fwd, up, curl) => {
  const o = new THREE.Object3D();
  orient(o, fwd, up);
  return { p, q: o.quaternion.clone(), curl };
};
export const LH = {
  // under the handguard, fingers round its far side
  home: pose(V(-0.06, -0.05, -0.22), V(0.75, 0.35, -0.55), V(-0.35, -0.9, 0.1), [0.75, 0.8, 0.85, 0.9, 0.35]),
  // gone below the frame to fetch a magazine
  off: pose(V(-0.04, -0.33, 0.0), V(0.2, 0.3, -1), V(0, -1, 0.2), [0.7, 0.7, 0.75, 0.8, 0.5]),
  // pushing a fresh magazine up into the well from underneath
  mag: pose(V(-0.006, -0.252, -0.05), V(0.15, 0.35, -1), V(0, -1, 0.3), [0.65, 0.7, 0.75, 0.8, 0.55]),
  // pinching the charging handle on the left
  handle: pose(V(-0.085, -0.01, -0.09), V(0.35, 0.3, -1), V(-1, 0.1, 0), [0.95, 1, 1, 1, 0.9])
};
const RELOAD = [
  [0, 'home'], [0.15, 'home'], [0.4, 'off'], [0.72, 'off+mag'], [0.92, 'mag'], [1.02, 'mag'], [1.2, 'handle'], [1.3, 'handle'],
  [1.38, 'pulled'], [1.6, 'home']
];

export class Player {
  constructor(world) {
    this.w = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eyeH = 1.62;
    this.crouch = false;
    this.onGround = true;
    this.hp = 100;
    this.alive = true;
    this.has = { wrench: false, smg: false, shard: false };
    this.weapon = null;
    this.mag = 0;
    this.reserve = 0;
    this.cans = 0;
    this.torch = false;
    this.stepAcc = 0;
    this.bob = 0;
    this.fireCD = 0;
    this.swingT = -1;
    this.reloadT = -1;
    this.switchT = 0;
    this.recoil = 0;
    this.bloom = 0;
    this.kickPitch = 0;
    this.sway = new THREE.Vector2();
    this.flashT = 0;
    this.deathT = 0;
    this.r = 0.33;
    this.lastNoise = -9;
    this._eye = new THREE.Vector3();
    this.buildViewmodels();
  }
  eye() {
    return this._eye.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
  }
  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  buildViewmodels() {
    const w = this.w;
    this.vm = new THREE.Group();
    w.vmScene.add(this.vm);
    // the wrench, gripped like a hammer
    this.wrench = makeWrench();
    this.wrenchPivot = new THREE.Group();
    this.wrenchPivot.add(this.wrench);
    this.wrench.position.set(0, 0.0, -0.1);
    this.vm.add(this.wrenchPivot);
    const wh = makeHand(1);
    orient(wh.g, V(-0.3, 0.95, 0), V(0.95, 0.3, 0));
    wh.g.position.set(0.046, -0.036, 0.1);
    wh.curl([1, 1, 1, 1, 0.9]);
    this.wrench.add(wh.g);
    // the SMG and both hands
    this.smg = makeSMG({ viewmodel: true });
    this.gun = this.smg.userData.parts;
    this.vm.add(this.smg);
    this.rh = makeHand(1);
    orient(this.rh.g, V(0, -0.12, -1), V(1, 0, 0.12));
    this.rh.g.position.set(0.042, -0.098, 0.128);
    this.smg.add(this.rh.g);
    this.lh = makeHand(-1, { watch: true });
    this.smg.add(this.lh.g);
    this.setLeftHand(LH.home);
    // the old star sprite, now the face of the flash
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: w.T.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    flash.scale.setScalar(0.12);
    this.gun.flash.add(flash);
    this.muzzle = flash;
    // and a hot round core behind the star
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: w.T.glow, color: 0xffb860, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    core.scale.setScalar(0.09);
    this.gun.flash.add(core);
    this.kick = { z: 0, rx: 0, rz: 0, ry: 0, vz: 0, vrx: 0, vrz: 0, vry: 0 };
    this.boltT = 0;
    this.heat = 0;
    this.sprintK = 0;
    this.trig = 0;
    // brass that flies out of the port, and smoke that curls off the muzzle (both in the viewmodel's own scene)
    const brass = new THREE.MeshStandardMaterial({ color: 0xd8a84a, metalness: 1, roughness: 0.3 });
    const cg = new THREE.CylinderGeometry(0.0045, 0.0045, 0.019, 8);
    this.vmCasings = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(cg, brass);
      m.visible = false;
      w.vmScene.add(m);
      this.vmCasings.push({ m, v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
    this.vmSmoke = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: w.T.smoke, color: 0xb8b4ac, transparent: true, depthWrite: false, opacity: 0 }));
      m.visible = false;
      w.vmScene.add(m);
      this.vmSmoke.push({ m, v: new THREE.Vector3(), life: 0, max: 1 });
    }
    this.smokeT = 0;
    this.ci = 0;
    this.si = 0;
    // a crystal shard held up in the left hand: the Tender follows it
    this.shard = new THREE.Group();
    const sm = new THREE.MeshStandardMaterial({ color: 0x0a2a2a, emissive: 0x1fc8b4, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.9 });
    const sg = new THREE.OctahedronGeometry(1, 0);
    for (const [sx, sy, sz, px, py, rz] of [[0.014, 0.05, 0.014, 0, 0.03, 0.1], [0.01, 0.034, 0.01, 0.012, 0.015, -0.5], [0.009, 0.028, 0.009, -0.011, 0.012, 0.6]]) {
      const m = new THREE.Mesh(sg, sm);
      m.scale.set(sx, sy, sz);
      m.position.set(px, py, 0);
      m.rotation.z = rz;
      this.shard.add(m);
    }
    const sh = makeHand(1);
    orient(sh.g, V(0, 0.25, -1), V(0, -1, -0.25));
    sh.g.position.set(0.0, -0.012, 0.055);
    sh.curl([0.55, 0.6, 0.65, 0.7, 0.5]);
    this.shard.add(sh.g);
    this.shardMat = sm;
    this.vm.add(this.shard);
    this.wrenchPivot.visible = false;
    this.smg.visible = false;
    this.shard.visible = false;
  }
  setLeftHand(P, Q, k = 0) {
    const h = this.lh;
    if (!Q || k <= 0) {
      h.g.position.copy(P.p);
      h.g.quaternion.copy(P.q);
      h.curl(P.curl);
      return;
    }
    h.g.position.lerpVectors(P.p, Q.p, k);
    h.g.quaternion.slerpQuaternions(P.q, Q.q, k);
    h.curl(P.curl.map((c, i) => c + (Q.curl[i] - c) * k));
  }
  give(o) {
    if (o.wrench) this.has.wrench = true;
    if (o.smg) this.has.smg = true;
    if (o.mag != null) this.mag = o.mag;
    if (o.reserve != null) this.reserve = o.reserve;
    if (o.cans != null) this.cans = o.cans;
    this.equip(this.has.smg ? 'smg' : this.has.wrench ? 'wrench' : null, true);
  }
  equip(name, instant = false) {
    if (name && !this.has[name]) return;
    if (name === this.weapon) return;
    this.weapon = name;
    this.switchT = instant ? 0 : 1;
    this.swingT = -1;
    this.reloadT = -1;
    this.wrenchPivot.visible = name === 'wrench';
    this.smg.visible = name === 'smg';
    this.shard.visible = name === 'shard';
    this.w.hud.ammo();
  }
  hurt(d, from) {
    if (!this.alive || this.w.god) return;
    this.hp -= d;
    this.flashT = Math.min(1, this.flashT + d / 25);
    this.w.shake(Math.min(0.4, d / 60));
    this.w.audio.play('hurt');
    this.w.hud.health();
    if (from) this.w.hud.hitFrom(from);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deathT = 0;
      this.w.onPlayerDeath();
    }
  }
  knock(vx, vy, vz) {
    this.vel.x += vx;
    this.vel.z += vz;
    if (vy > 0) {
      this.vel.y = Math.max(this.vel.y, vy);
      this.onGround = false;
    }
  }
  heal(n) {
    this.hp = Math.min(100, this.hp + n);
    this.w.hud.health();
  }
  makeNoise(r, x = this.pos.x, z = this.pos.z) {
    this.lastNoise = this.w.time;
    this.w.noise(x, z, r, 'player');
  }
  update(dt, input) {
    const w = this.w;
    this.flashT = Math.max(0, this.flashT - dt * 1.2);
    if (!this.alive) {
      this.deathT += dt;
      this.eyeH += (0.3 - this.eyeH) * Math.min(1, dt * 5);
      this.vel.multiplyScalar(0.9);
      this.vm.visible = false;
      return;
    }
    this.vm.visible = true;
    // look (mouse deltas arrive in main; here recoil settles)
    this.pitch += this.kickPitch * dt * 14;
    this.kickPitch *= Math.max(0, 1 - dt * 14);
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    // move
    const f = input.f - input.b, s = input.r - input.l;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) {
      wx /= wl;
      wz /= wl;
    }
    const sprint = input.sprint && f > 0 && !this.crouch;
    const speed = this.crouch ? 1.9 : sprint ? 6.4 : 4.0;
    const accel = this.onGround ? 11 : 2;
    const k = Math.min(1, accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;
    if (input.jump && this.onGround && !this.crouch) {
      this.vel.y = 5.0;
      this.onGround = false;
      this.jumped = true;
    }
    if (!this.onGround) {
      this.vel.y -= 16 * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        if (this.vel.y < -3) {
          w.audio.play('step', this.pos, 1.6);
          this.makeNoise(this.crouch ? 2 : 8);
        }
        this.vel.y = 0;
        this.onGround = true;
      }
    }
    w.level.moveCircle(this.pos, this.vel.x * dt, this.vel.z * dt, this.r);
    w.pushOut(this.pos, this.r);
    const eyeTarget = this.crouch ? 1.0 : 1.62;
    this.eyeH += (eyeTarget - this.eyeH) * Math.min(1, dt * 10);
    // footsteps: the sound you make is the noise they hunt
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) {
      this.stepAcc += hs * dt;
      const stride = sprint ? 2.1 : this.crouch ? 0.95 : 1.55;
      this.bob += (hs * dt * Math.PI) / stride;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        w.audio.play('step', this.pos, this.crouch ? 0.25 : sprint ? 1.3 : 0.8);
        if (!this.crouch) this.makeNoise(sprint ? 15 : 7);
      }
    }
    this.moving = hs;
    // weapons
    this.fireCD -= dt;
    this.switchT = Math.max(0, this.switchT - dt * 4);
    this.bloom = Math.max(0, this.bloom - dt * 0.09);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    if (this.reloadT >= 0) this.updateReload(dt);
    if (this.weapon === 'wrench') this.updateWrench(dt, input);
    else if (this.weapon === 'smg') {
      if (input.fire && this.fireCD <= 0 && this.reloadT < 0 && this.switchT <= 0.2) this.fireSMG();
    } else if (this.weapon === 'shard') {
      if (input.fire && this.fireCD <= 0 && this.switchT <= 0.2) {
        input.fire = false;
        this.throwShard();
      }
    }
    this.muzzleT = (this.muzzleT ?? 0) - dt;
    this.gun.flash.visible = this.muzzleT > 0 && this.weapon === 'smg';
    this.sprinting = sprint && hs > 3;
    this.firing = this.weapon === 'smg' && input.fire && this.mag > 0 && this.reloadT < 0;
    this.placeViewmodel(dt, input);
  }
  updateWrench(dt, input) {
    const w = this.w;
    if (this.swingT < 0 && input.fire && this.fireCD <= 0 && this.switchT <= 0.2) {
      this.swingT = 0;
      this.fireCD = 0.48;
      this.struck = false;
      w.audio.play('swing');
    }
    if (this.swingT >= 0) {
      this.swingT += dt;
      if (!this.struck && this.swingT > 0.11) {
        this.struck = true;
        this.strike();
      }
      if (this.swingT > 0.42) this.swingT = -1;
    }
  }
  strike() {
    const w = this.w;
    const eye = this.eye().clone(), fwd = this.forward();
    let hit = w.hitscan(eye, fwd, 1.9);
    if (!hit || hit.kind === 'world') {
      // forgiving: the nearest creature in a cone in front, within reach (Skitters are low and quick)
      let best = null, bd = 2.2;
      for (const c of w.creatures) {
        if (!c.alive) continue;
        const z = c.zones()[0];
        const dx = z.c.x - eye.x, dy = z.c.y - eye.y, dz = z.c.z - eye.z;
        const d = Math.hypot(dx, dy, dz) - z.r;
        if (d > bd) continue;
        const cos = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / Math.hypot(dx, dy, dz);
        if (cos > 0.78) {
          best = c;
          bd = d;
        }
      }
      if (best && (!hit || bd < hit.t)) {
        const z = best.zones()[0];
        hit = { kind: 'creature', c: best, zone: best.kind === 'bulwark' ? w.bulwarkZoneFrom(best, eye) : z.name, t: bd, p: z.c.clone() };
      }
    }
    if (!hit) {
      this.makeNoise(2.5);
      return;
    }
    if (hit.kind === 'world') {
      w.audio.play('clank', hit.p);
      w.fx.sparks(hit.p, hit.n, 8, 3);
      this.makeNoise(8, hit.p.x, hit.p.z);
      this.kickPitch -= 0.04;
    } else if (hit.kind === 'canister') {
      w.audio.play('clank', hit.p);
      hit.k.hit();
      this.makeNoise(8);
    } else {
      const dmg = hit.c.kind === 'bulwark' ? (hit.zone === 'sac' ? 45 : 12) : 34;
      const res = hit.c.damage(dmg, hit.zone, this.pos, 'melee');
      if (res === 'armor') {
        w.audio.play('clank', hit.p);
        w.fx.sparks(hit.p, [-fwd.x, 0.3, -fwd.z], 12, 4);
      } else {
        w.audio.play('thunk', hit.p);
        w.fx.blood(hit.p, w.bloodColor(hit.c, hit.zone), 10, 2);
      }
      this.makeNoise(7);
      w.shake(0.05);
    }
  }
  fireSMG() {
    const w = this.w;
    if (this.mag <= 0) {
      w.audio.play('empty');
      this.fireCD = 0.3;
      if (this.reserve > 0) this.reload();
      return;
    }
    this.mag--;
    this.fireCD = 0.088;
    this.lastShot = w.time;
    const eye = this.eye().clone();
    const fwd = this.forward();
    const spread = (0.008 + this.bloom + Math.min(0.025, this.moving * 0.005) + (this.onGround ? 0 : 0.03)) * (this.crouch ? 0.6 : 1);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const up = new THREE.Vector3().crossVectors(right, fwd);
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * spread;
    const dir = fwd.clone().addScaledVector(right, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr).normalize();
    const hit = w.hitscan(eye, dir, 150);
    const end = hit ? hit.p : eye.clone().addScaledVector(dir, 150);
    // barrel position in the world, for the tracer and the casing
    const barrel = eye.clone().addScaledVector(fwd, 0.55).addScaledVector(right, 0.16).addScaledVector(up, -0.12);
    if (this.mag % 2 === 0) w.fx.tracer(barrel, end);
    w.fx.casing(eye.clone().addScaledVector(fwd, 0.35).addScaledVector(right, 0.2).addScaledVector(up, -0.1), right.clone().multiplyScalar(2.2 + Math.random()).add(new THREE.Vector3(0, 1.8, 0)).add(this.vel));
    this.muzzleT = 0.045;
    this.muzzle.material.rotation = Math.random() * 6;
    this.muzzle.scale.setScalar(0.13 + Math.random() * 0.09);
    for (const p of this.gun.petals) {
      p.scale.set(0.7 + Math.random() * 0.6, 0.6 + Math.random() * 0.9, 1);
      p.rotation.z += 0.7 + Math.random();
    }
    this.gun.flash.rotation.z = Math.random() * 6;
    // the kick: back, muzzle up, a little roll and yaw; a spring brings it home
    const K = this.kick;
    K.vz += 0.42 + Math.random() * 0.1;
    K.vrx += 0.75 + Math.random() * 0.3;
    K.vrz += (Math.random() - 0.5) * 0.9;
    K.vry += (Math.random() - 0.5) * 0.35;
    this.boltT = 1;
    this.heat = Math.min(1.5, this.heat + 0.09);
    this.ejectCasing();
    w.muzzleLight(barrel);
    w.audio.play('shot', eye);
    this.makeNoise(36);
    this.kickPitch += 0.011 + Math.random() * 0.006;
    this.yaw += (Math.random() - 0.5) * 0.008;
    this.recoil = Math.min(1, this.recoil + 0.45);
    this.bloom = Math.min(0.04, this.bloom + 0.005);
    if (hit) w.bulletHit(hit, dir, 10);
    w.hud.ammo();
    if (this.mag === 0 && this.reserve > 0) setTimeout(() => this.weapon === 'smg' && this.reloadT < 0 && this.reload(), 250);
  }
  reload() {
    if (this.weapon !== 'smg' || this.reloadT >= 0 || this.mag >= 30 || this.reserve <= 0) return;
    this.reloadT = 0;
    this.reloadStage = 0;
    this.makeNoise(3);
  }
  updateReload(dt) {
    const w = this.w;
    this.reloadT += dt;
    const marks = [0.2, 0.95, 1.4];
    while (this.reloadStage < 3 && this.reloadT > marks[this.reloadStage]) {
      w.audio.play('reload' + (this.reloadStage + 1));
      this.reloadStage++;
    }
    if (this.reloadT > 1.6) {
      const n = Math.min(30 - this.mag, this.reserve);
      this.mag += n;
      this.reserve -= n;
      this.reloadT = -1;
      w.hud.ammo();
    }
  }
  throwCan() {
    if (this.cans <= 0 || !this.alive) return;
    this.cans--;
    const fwd = this.forward();
    const o = this.eye().clone().addScaledVector(fwd, 0.4);
    const v = fwd.clone().multiplyScalar(11).add(new THREE.Vector3(0, 2.2, 0)).addScaledVector(this.vel, 0.5);
    this.w.throwCan(o, v);
    this.w.audio.play('throw');
    this.w.hud.ammo();
  }
  throwShard() {
    if (!this.has.shard || !this.alive) return;
    this.has.shard = false;
    const fwd = this.forward();
    const o = this.eye().clone().addScaledVector(fwd, 0.4);
    const v = fwd.clone().multiplyScalar(8).add(new THREE.Vector3(0, 2.4, 0)).addScaledVector(this.vel, 0.5);
    this.w.throwShard(o, v);
    this.w.audio.play('throw');
    this.equip(this.has.smg ? 'smg' : this.has.wrench ? 'wrench' : null, true);
  }
  ejectCasing() {
    const c = this.vmCasings[this.ci++ % this.vmCasings.length];
    this.gun.bolt.getWorldPosition(c.m.position);
    c.v.set(1.1 + Math.random() * 0.6, 0.9 + Math.random() * 0.5, 0.25 + Math.random() * 0.3);
    c.spin.set(Math.random() * 30, Math.random() * 10, 20 + Math.random() * 20);
    c.m.rotation.set(0, 0, Math.PI / 2);
    c.m.visible = true;
    c.life = 0.55;
  }
  updateVmFx(dt, input) {
    for (const c of this.vmCasings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.v.y -= 5 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.position.x -= input.mdx * 0.0004;
      c.m.rotation.x += c.spin.x * dt;
      c.m.rotation.z += c.spin.z * dt;
      if (c.life <= 0) c.m.visible = false;
    }
    // smoke curls off a hot barrel once you stop firing
    this.heat = Math.max(0, this.heat - dt * 0.35);
    this.smokeT -= dt;
    if (this.weapon === 'smg' && !this.firing && this.heat > 0.2 && this.smokeT <= 0) {
      this.smokeT = 0.06;
      const q = this.vmSmoke[this.si++ % this.vmSmoke.length];
      this.gun.flash.getWorldPosition(q.m.position);
      q.m.position.y += 0.01;
      q.v.set((Math.random() - 0.5) * 0.02, 0.07 + Math.random() * 0.05, 0.03);
      q.life = q.max = 0.9 + Math.random() * 0.5;
      q.a = Math.min(0.22, this.heat * 0.18);
      q.m.material.rotation = Math.random() * 6;
      q.m.visible = true;
    }
    for (const q of this.vmSmoke) {
      if (q.life <= 0) continue;
      q.life -= dt;
      const k = 1 - q.life / q.max;
      q.m.position.addScaledVector(q.v, dt);
      q.m.position.x += -input.mdx * 0.00025 + Math.sin(k * 6 + q.max * 9) * 0.0008;
      q.m.position.y += input.mdy * 0.0002;
      q.m.scale.setScalar(0.03 + k * 0.12);
      q.m.material.opacity = q.a * Math.sin(Math.min(1, k * 1.3) * Math.PI);
      if (q.life <= 0) q.m.visible = false;
    }
  }
  placeViewmodel(dt, input) {
    const t = this.w.time;
    const k = Math.min(1, this.moving / 4) * (this.onGround ? 1 : 0.2);
    const bx = Math.sin(this.bob) * 0.012 * k, by = -Math.abs(Math.cos(this.bob)) * 0.016 * k;
    // breathing, when you stand still
    const br = Math.sin(t * 1.7) * (1 - k);
    this.sway.x += (-input.mdx * 0.0006 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (input.mdy * 0.0006 - this.sway.y) * Math.min(1, dt * 10);
    this.sway.clampScalar(-0.03, 0.03);
    const sw = this.switchT * this.switchT * (3 - 2 * this.switchT);
    const drop = sw * 0.3 + (this.crouch ? 0.01 : 0);
    this.sprintK += ((this.sprinting && this.reloadT < 0 ? 1 : 0) - this.sprintK) * Math.min(1, dt * 8);
    const sk = this.sprintK;
    this.updateVmFx(dt, input);
    if (this.weapon === 'wrench') {
      const p = this.wrenchPivot;
      p.position.set(0.25 + bx + this.sway.x - sk * 0.03, -0.27 + by - drop + this.sway.y + br * 0.003 - sk * 0.04, -0.38);
      let rx = 0.25 - sw * 0.8 - sk * 0.3, ry = 0.15 + sk * 0.3, rz = -0.2;
      if (this.swingT >= 0) {
        const t = this.swingT;
        if (t < 0.09) {
          const u = t / 0.09;
          rx += u * 0.9;
          ry += u * -0.5;
          rz += u * -0.6;
        } else if (t < 0.2) {
          const u = (t - 0.09) / 0.11;
          rx += 0.9 - u * 2.3;
          ry += -0.5 + u * 1.3;
          rz += -0.6 + u * 1.4;
        } else {
          const u = Math.min(1, (t - 0.2) / 0.22);
          rx += -1.4 * (1 - u);
          ry += 0.8 * (1 - u);
          rz += 0.8 * (1 - u);
        }
      }
      p.rotation.set(rx, ry, rz);
    } else if (this.weapon === 'shard') {
      this.shard.position.set(0.15 + bx + this.sway.x, -0.19 + by - drop + this.sway.y + br * 0.003, -0.34);
      this.shard.rotation.set(0.25 - sw * 0.6, 0.4 + Math.sin(t * 0.8) * 0.1, 0.1);
      this.shardMat.emissiveIntensity = 0.55 + Math.sin(t * 2.2) * 0.12 + (this.w.singing ? 0.45 : 0);
    } else if (this.weapon === 'smg') {
      const g = this.smg, G = this.gun, K = this.kick;
      // the recoil spring (semi-implicit, a touch under-damped so it settles with a shiver)
      const kk = 300, kd = 15;
      const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
      for (let i = 0; i < n; i++)
        for (const c of ['z', 'rx', 'rz', 'ry']) {
          const v = 'v' + c;
          K[v] += (-kk * K[c] - kd * K[v]) * h;
          K[c] += K[v] * h;
        }
      // the reload: tilt the gun, drop the magazine, the left hand brings a new one, then slaps the handle
      let rz = 0, rx = 0, dy = 0, dx = 0;
      const u = this.reloadT;
      if (u >= 0) {
        const e = smooth(0, 0.25, u) * (1 - smooth(1.42, 1.6, u));
        rz = e * 0.38;
        rx = e * 0.16;
        dy = -e * 0.03;
        dx = -e * 0.03;
        // the handle pull jolts the gun
        if (u > 1.36 && u < 1.48) rx -= Math.sin(((u - 1.36) / 0.12) * Math.PI) * 0.05;
        this.animateReload(u);
      } else {
        G.mag.position.set(0, 0, 0);
        G.mag.visible = true;
        G.handle.position.z = -0.15;
        if (!this.lhHome) {
          this.setLeftHand(LH.home);
          this.lhHome = true;
        }
      }
      // the draw: it swings up from below
      rx -= sw * 0.9;
      // sprinting: the gun drops and cants
      const sx = -sk * 0.05, sy = -sk * 0.05;
      rx -= sk * 0.35;
      const ry = sk * 0.55;
      rz += sk * 0.3;
      const B = (this.vmBase ??= { x: 0.15, y: -0.17, z: -0.44, rx: 0, ry: 0.06, rz: 0 });
      g.position.set(B.x + bx + this.sway.x + dx + sx, B.y + by - drop + dy + sy + this.sway.y + br * 0.003, B.z + K.z);
      g.rotation.set(B.rx + rx + K.rx + br * 0.006, B.ry + ry + K.ry, B.rz + rz + K.rz);
      // the bolt runs back and slams home every shot; empty, it locks open
      this.boltT = Math.max(0, this.boltT - dt / 0.065);
      const open = this.mag === 0 && (u < 0 || u < 1.38) ? 1 : this.boltT;
      G.bolt.position.z = -0.03 + 0.032 * open;
      // trigger finger
      this.trig += ((this.firing ? 1 : 0) - this.trig) * Math.min(1, dt * 30);
      G.trigger.rotation.x = this.trig * 0.3;
      const rc = [0.35 + this.trig * 0.35, 1.0, 1.05, 1.1, 0.75];
      this.rh.curl(rc);
      G.counter.set(this.mag, this.mag <= 8);
      G.lightLens.emissiveIntensity = this.torch ? 4 : 0;
      // the flash shrinks over its two frames
      if (G.flash.visible) G.flash.scale.setScalar(0.8 + (this.muzzleT / 0.045) * 0.5);
      // and the viewmodel's own light flashes at the muzzle
      G.flash.getWorldPosition(this.w.vmFlash.position);
    }
  }
  animateReload(u) {
    const G = this.gun;
    this.lhHome = false;
    // which two poses the left hand is between
    const P = (name) => {
      if (name === 'off+mag') return { ...LH.off, p: LH.mag.p.clone().add(V(0, -0.2, 0.03)), q: LH.mag.q, curl: LH.mag.curl };
      if (name === 'pulled') return { ...LH.handle, p: LH.handle.p.clone().add(V(0, 0, 0.065)) };
      return LH[name];
    };
    let i = 0;
    while (i < RELOAD.length - 2 && u > RELOAD[i + 1][0]) i++;
    const [t0, a] = RELOAD[i], [t1, b] = RELOAD[i + 1];
    this.setLeftHand(P(a), P(b), smooth(t0, t1, u));
    // the old magazine drops out; the new one rides up on the hand
    if (u < 0.2) G.mag.position.set(0, 0, 0);
    else if (u < 0.6) {
      const f = u - 0.2;
      G.mag.position.set(0, -2.2 * f * f - 0.15 * f, f * 0.05);
      G.mag.rotation.x = f * 0.8;
    } else if (u < 0.72) G.mag.visible = false;
    else {
      G.mag.visible = true;
      G.mag.rotation.x = 0;
      const k = smooth(0.72, 0.92, u);
      G.mag.position.set(0, -0.2 * (1 - k), 0.03 * (1 - k));
    }
    // the charging handle goes back with the hand, then snaps forward
    G.handle.position.z = -0.15 + (u > 1.3 && u < 1.4 ? smooth(1.3, 1.38, u) * 0.065 : 0);
  }
}
