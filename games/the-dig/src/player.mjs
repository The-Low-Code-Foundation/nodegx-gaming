// The player: a 0.6 × 1.8 box that walks, runs, jumps (and on the phone steps up a block by itself), falls and
// hurts from a long fall, swims, sinks slowly into lava (and burns), rides the grappling hook's rope, and looks
// through a first-person camera at eye height.
import * as THREE from 'three';
import { BLOCKS, B } from './blocks.mjs';

const W = 0.3, H = 1.8, EYE = 1.62;
const GRAVITY = 30, JUMP = 9.2, WALK = 4.4, RUN = 6.2;
const PULL = 19; // the grappling hook reels you in at this, blocks a second

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.health = 20;
    this.maxHealth = 20;
    this.fallFrom = null;
    this.hurtAt = -1e9;
    this.bob = 0;
    this.inLava = false;
    this.inWater = false;
    this.hook = null; // on the grappling hook's rope: { to, ledge, t, limit, stuck, last }
    this.jumpWas = false;
  }

  // Is the eye under water (or in lava)? The game tints the view by it.
  eyeIn(world) {
    return world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
  }

  eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  collides(world, x, y, z) {
    const x0 = Math.floor(x - W), x1 = Math.floor(x + W - 1e-6);
    const y0 = Math.floor(y), y1 = Math.floor(y + H - 1e-6);
    const z0 = Math.floor(z - W), z1 = Math.floor(z + W - 1e-6);
    for (let yy = y0; yy <= y1; yy++)
      for (let zz = z0; zz <= z1; zz++)
        for (let xx = x0; xx <= x1; xx++) if (BLOCKS[world.get(xx, yy, zz)].solid) return true;
    return false;
  }

  touching(world, id) {
    const x0 = Math.floor(this.pos.x - W), x1 = Math.floor(this.pos.x + W);
    const y0 = Math.floor(this.pos.y), y1 = Math.floor(this.pos.y + H);
    const z0 = Math.floor(this.pos.z - W), z1 = Math.floor(this.pos.z + W);
    for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) if (world.get(xx, yy, zz) === id) return [xx, yy, zz];
    return null;
  }

  update(dt, I, world, { aiming = false } = {}) {
    // Look.
    const sens = aiming ? 0.45 : 1;
    this.yaw -= I.look.x * sens;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - I.look.y * sens));

    I.jumpPressed = I.jump && !this.jumpWas;
    this.jumpWas = I.jump;
    // The body moves in steps of at most 1/60 s, so a fast fall never passes through a floor.
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    let fell = 0;
    for (let k = 0; k < steps; k++) fell += this.physics(dt / steps, I, world, aiming);

    // The camera.
    const moving = this.onGround && Math.hypot(this.vel.x, this.vel.z) > 0.5;
    this.bob += moving ? dt * Math.hypot(this.vel.x, this.vel.z) * 1.6 : 0;
    const e = this.eye();
    this.camera.position.set(e.x, e.y + (moving ? Math.sin(this.bob * 2) * 0.04 : 0), e.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    return { fell };
  }

  // The grappling hook has caught: reel in towards `to` (where the feet end up). ledge: `to` is standing room on top
  // of a block, and arriving there pops you onto it; otherwise you hang there a moment and let go.
  grapple(to, ledge) {
    const d = to.distanceTo(this.pos);
    this.hook = { to: to.clone(), ledge, t: 0, limit: 0.6 + d / PULL * 1.8, stuck: 0, last: this.pos.clone() };
    this.onGround = false;
  }

  // Let go of the rope. Over a ledge, a small step down onto it; jumping off, a jump with what speed you had (Spider-
  // Man's rhythm: catch, ride up, let go, catch again); otherwise a little lift, so the next throw has time.
  letGo(hop = false) {
    const g = this.hook;
    if (!g) return;
    this.hook = null;
    if (g.ledge && !hop) {
      const along = g.to.clone().sub(this.pos);
      this.vel.set(along.x * 4, 2, along.z * 4);
    } else if (hop) this.vel.multiplyScalar(0.6).setY(Math.max(this.vel.y * 0.5, JUMP * 0.8));
    else this.vel.multiplyScalar(0.35).add(new THREE.Vector3(0, 4, 0));
    this.fallFrom = null;
  }

  // One step of the pull. Straight at the target, fast; where a wall is in the way and the target is above, the rope
  // drags you up the face of it instead, so you come over the lip. A ledge lets go once you are over it; on a bare
  // wall you hang a moment below the claw (time to throw again), then drop.
  reel(dt, I) {
    const g = this.hook;
    g.t += dt;
    const to = g.to.clone().sub(this.pos);
    const d = to.length();
    if (I.jumpPressed && g.t > 0.08) return this.letGo(true), true;
    if (g.ledge && (d < 0.35 || (this.pos.y >= g.to.y - 0.05 && Math.hypot(to.x, to.z) < 0.45))) return this.letGo(), true;
    if (!g.ledge && d < 0.45) {
      g.hang = (g.hang ?? 0) + dt;
      this.vel.set(0, 0, 0);
      if (g.hang > 0.4) return this.letGo(), true;
      return false;
    }
    if (g.t > g.limit) return this.letGo(), true;
    const speed = Math.min(PULL, 4 + d * 7);
    this.vel.copy(to.multiplyScalar(speed / d));
    return false;
  }

  physics(dt, I, world, aiming) {
    // On the rope: the hook does the moving (and it stops when the rope is done or you jump off).
    if (this.hook && !this.reel(dt, I)) return this.ropeMove(dt, world);
    // Walk.
    this.inLava = !!this.touching(world, B.LAVA);
    this.inWater = !!this.touching(world, B.WATER);
    const speed = (I.sprint && I.move.z > 0 ? RUN : WALK) * (this.inLava ? 0.4 : this.inWater ? 0.55 : 1) * (aiming ? 0.6 : 1);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = (-sin * I.move.z + cos * I.move.x) * speed;
    const wz = (-cos * I.move.z - sin * I.move.x) * speed;
    const accel = this.onGround ? 14 : 4;
    this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);
    if (I.jump && this.onGround) {
      this.vel.y = JUMP;
      this.onGround = false;
    }
    // Lava: thick. You sink into it slowly, as in Minecraft; holding jump works you back up, and a bank in front
    // of you with jump held lifts you out.
    if (this.inLava) {
      if (I.jump) this.vel.y = Math.min(this.vel.y + 16 * dt, 2.4);
      this.vel.y *= Math.max(0, 1 - 6 * dt);
    }
    // Water: you sink slowly, holding jump swims you up, and at the surface it bobs you out onto a bank.
    if (this.inWater) {
      if (I.jump) this.vel.y = Math.min(this.vel.y + 30 * dt, 4);
      this.vel.y *= Math.max(0, 1 - 4 * dt);
    }
    this.vel.y -= GRAVITY * dt * (this.inLava ? 0.12 : this.inWater ? 0.12 : 1);
    this.vel.y = Math.max(this.vel.y, this.inWater ? -3 : this.inLava ? -0.8 : -50);

    // Move one axis at a time against the blocks.
    const p = this.pos;
    let nx = p.x + this.vel.x * dt;
    if (this.collides(world, nx, p.y, p.z)) {
      nx = p.x;
      this.vel.x = 0;
      this.climbOut(I);
    }
    p.x = nx;
    let nz = p.z + this.vel.z * dt;
    if (this.collides(world, p.x, p.y, nz)) {
      nz = p.z;
      this.vel.z = 0;
      this.climbOut(I);
    }
    p.z = nz;
    const ny = p.y + this.vel.y * dt;
    const wasGround = this.onGround;
    if (this.collides(world, p.x, ny, p.z)) {
      if (this.vel.y < 0) {
        p.y = Math.max(Math.floor(ny) + 1, Math.min(p.y, Math.floor(ny) + 1));
        this.onGround = true;
      }
      this.vel.y = 0;
    } else {
      p.y = ny;
      this.onGround = false;
    }

    // Fall damage, Minecraft's way: three blocks free, then a point a block.
    let fell = 0;
    if (!this.onGround && this.fallFrom === null) this.fallFrom = p.y;
    if (!this.onGround && this.fallFrom !== null && p.y > this.fallFrom) this.fallFrom = p.y;
    if (this.onGround && !wasGround && this.fallFrom !== null) {
      const d = this.fallFrom - p.y;
      if (d > 3.4 && !this.inLava && !this.inWater) fell = Math.floor(d - 3);
      this.fallFrom = null;
    }
    if (this.inLava || this.inWater) this.fallFrom = null;
    return fell;
  }

  // Moving on the rope: axis by axis against the blocks, no gravity. A wall in the way with the target above turns
  // the pull upwards (up the face); held fast for a moment, the rope gives up and lets go.
  ropeMove(dt, world) {
    const g = this.hook;
    const p = this.pos;
    let blocked = false;
    const nx = p.x + this.vel.x * dt;
    if (this.collides(world, nx, p.y, p.z)) blocked = true;
    else p.x = nx;
    const nz = p.z + this.vel.z * dt;
    if (this.collides(world, p.x, p.y, nz)) blocked = true;
    else p.z = nz;
    if (blocked && g.to.y > p.y + 0.05) this.vel.y = Math.max(this.vel.y, PULL * 0.7);
    const ny = p.y + this.vel.y * dt;
    if (!this.collides(world, p.x, ny, p.z)) p.y = ny;
    this.onGround = false;
    this.fallFrom = null;
    g.stuck = !g.hang && p.distanceTo(g.last) < PULL * dt * 0.08 ? g.stuck + dt : 0;
    g.last.copy(p);
    if (g.stuck > 0.25) this.letGo();
    return 0;
  }

  // Swimming into a bank with jump held lifts you out onto it.
  climbOut(I) {
    if ((this.inWater || this.inLava) && I.jump) this.vel.y = Math.max(this.vel.y, 7.5);
  }

  // Put the camera where the body is (also while the game is paused, after a jump between worlds).
  place() {
    const e = this.eye();
    this.camera.position.set(e.x, e.y, e.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  hurt(n, now) {
    this.health = Math.max(0, this.health - n);
    this.hurtAt = now;
  }
}
