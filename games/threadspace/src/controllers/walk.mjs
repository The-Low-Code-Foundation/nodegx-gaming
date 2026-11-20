// Walking inside something: a person in the host's frame, WASD on the floor, mouse to look, a circle that
// slides along the walls, and E on the nearest thing you are facing. The host may be flying; you don't feel it.

import * as THREE from 'three';
import { clamp } from '../util.mjs';

const EYE = 1.6;
const R = 0.38;
const SPEED = 4.2;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Walker {
  constructor(interior) {
    this.interior = interior;
    this.pos = interior.spawn.clone();
    this.yaw = interior.spawnYaw;
    this.pitch = 0;
    this.bob = 0;
    this.speed = SPEED;
    // Weightless (`float`, set by the host each frame): no floor to push on, so you pull yourself along handholds,
    // hand over hand, and coast; Shift kicks off at a push-off's speed. `vel` is your drift on the floor plane.
    this.float = false;
    this.vel = new THREE.Vector3();
    this.drift = 0;
    this.kicked = false;
    // A push along the floor (m/s², in the host's frame; set by the host each frame): a ship's main drive. Walking
    // with it is quicker and against it slower; floating, it carries you along until you take hold.
    this.shove = new THREE.Vector3();
    // How heavy you are (1 at the floor's own weight): walking spinward in a spin drum is heavier, antispinward
    // lighter (Coriolis), which the step's bob shows.
    this.heavy = 1;
  }

  moveTo(pos, yaw = this.yaw) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.vel?.set(0, 0, 0);
    this.floater?.reset();
  }

  frame(f, dt, { canMove = true, mouseGain = 0.0022 } = {}) {
    if (f.dx || f.dy) {
      this.yaw -= f.dx * mouseGain;
      this.pitch = clamp(this.pitch - f.dy * mouseGain, -1.3, 1.3);
    }
    if (f.keys.has('ArrowLeft')) this.yaw += dt * 1.8;
    if (f.keys.has('ArrowRight')) this.yaw -= dt * 1.8;
    if (f.keys.has('ArrowUp')) this.pitch = clamp(this.pitch + dt * 1.2, -1.3, 1.3);
    if (f.keys.has('ArrowDown')) this.pitch = clamp(this.pitch - dt * 1.2, -1.3, 1.3);
    if (!canMove) return;
    if (this.float) return this.floater ? this.floater.frame(this, f, dt) : this.floatFrame(f, dt); // a host's own weightless moves (the carrier's handholds)
    this.vel.set(0, 0, 0);
    let fx = 0, fz = 0;
    if (f.keys.has('KeyW')) fz -= 1;
    if (f.keys.has('KeyS')) fz += 1;
    if (f.keys.has('KeyA')) fx -= 1;
    if (f.keys.has('KeyD')) fx += 1;
    if (!fx && !fz) {
      this.bob *= Math.max(0, 1 - dt * 6);
      return;
    }
    const len = Math.hypot(fx, fz);
    fx /= len;
    fz /= len;
    const s = (f.keys.has('ShiftLeft') ? 1.6 : 1) * this.speed * dt;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // yaw 0 faces -z; turning left (positive yaw) swings the view toward -x. The view's forward is (-sin, -cos) on the
    // floor and its right is (cos, -sin); a step is fx along right and -fz along forward. (s1 had both sines' signs
    // flipped: right at 0 and 180 degrees, W walked backwards at 90 and sideways between — TS-S3-WALKAXES.)
    let dx = (fx * cos + fz * sin) * s;
    let dz = (-fx * sin + fz * cos) * s;
    const a = this.shove.length();
    if (a > 0.01 && s > 0) {
      const k = 1 + clamp(((dx * this.shove.x + dz * this.shove.z) / (s * a)) * (a / 9.81) * 1.1, -0.4, 0.4);
      (dx *= k), (dz *= k);
    }
    this.slide(dx, 0);
    this.slide(0, dz);
    this.bob += s * 2.2 * Math.sqrt(this.heavy); // heavier, shorter quicker steps; lighter, longer floatier ones
  }

  /** Weightless: hand over hand toward `HAND` m/s along where you face, a kick off to `KICK` m/s on Shift, coasting
   *  otherwise (the handholds you brush take a little off). A wall stops the drift into it. */
  floatFrame(f, dt) {
    const HAND = 1.5, KICK = 3.5, GRIP = 2.5;
    this.drift += dt;
    this.bob = 0;
    let fx = 0, fz = 0;
    if (f.keys.has('KeyW')) fz -= 1;
    if (f.keys.has('KeyS')) fz += 1;
    if (f.keys.has('KeyA')) fx -= 1;
    if (f.keys.has('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dir = len ? _v.set((fx * cos + fz * sin) / len, 0, (-fx * sin + fz * cos) / len) : null;
    const shift = f.keys.has('ShiftLeft') || f.keys.has('ShiftRight');
    if (dir && shift && !this.kicked) this.vel.copy(dir).multiplyScalar(KICK);
    else if (dir && !(this.vel.length() > HAND && this.vel.dot(dir) > 0.7 * this.vel.length())) {
      // Hand over hand: each pull takes your drift toward a hand's pace where you want to go (and brakes a drift the
      // other way). Already going that way faster, after a kick, you coast past the holds.
      _w.copy(dir).multiplyScalar(HAND).sub(this.vel);
      const k = Math.min(1, (GRIP * dt) / Math.max(1e-6, _w.length()));
      this.vel.addScaledVector(_w, k);
    } else this.vel.multiplyScalar(Math.max(0, 1 - 0.08 * dt)); // coasting
    this.vel.addScaledVector(this.shove, dt); // under a drive, nothing holds you but your hands
    this.kicked = shift && !!dir;
    const x = this.pos.x, z = this.pos.z;
    this.slide(this.vel.x * dt, 0);
    this.slide(0, this.vel.z * dt);
    if (dt > 0) {
      if (Math.abs(this.pos.x - x - this.vel.x * dt) > 1e-4) this.vel.x = 0;
      if (Math.abs(this.pos.z - z - this.vel.z * dt) > 1e-4) this.vel.z = 0;
    }
  }

  /** Moves by (dx, dz) and pushes out of any wall box; sliding comes from moving the axes one at a time. */
  slide(dx, dz) {
    const p = this.pos;
    p.x += dx;
    p.z += dz;
    const y = p.y + 0.8;
    for (const c of this.interior.colliders) {
      if (y < c.min.y || y > c.max.y + 1.2) continue;
      const nx = clamp(p.x, c.min.x, c.max.x);
      const nz = clamp(p.z, c.min.z, c.max.z);
      const ex = p.x - nx, ez = p.z - nz;
      const d2 = ex * ex + ez * ez;
      if (d2 >= R * R) continue;
      if (d2 < 1e-6) {
        // Inside the box: push out along the axis just moved.
        if (dx) p.x = dx > 0 ? c.min.x - R : c.max.x + R;
        else p.z = dz > 0 ? c.min.z - R : c.max.z + R;
        continue;
      }
      const d = Math.sqrt(d2);
      p.x = nx + (ex / d) * R;
      p.z = nz + (ez / d) * R;
    }
  }

  /** Eye position and look quaternion in the host's frame. */
  eye(target = new THREE.Vector3()) {
    const drift = this.float ? Math.sin(this.drift * 0.7) * 0.05 : 0; // weightless: a slow rise and fall, no step
    return target.set(this.pos.x, this.pos.y + EYE + Math.sin(this.bob) * 0.03 * Math.sqrt(1 / this.heavy) + drift, this.pos.z);
  }

  quat(q = new THREE.Quaternion()) {
    return q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.float ? Math.sin(this.drift * 0.4) * 0.03 : 0, 'YXZ'));
  }

  forward(t = new THREE.Vector3()) {
    return t.set(0, 0, -1).applyQuaternion(this.quat());
  }

  /** The use you are nearest and facing, or null. */
  nearestUse() {
    const eye = this.eye(_v);
    const fwd = this.forward(_w);
    let best = null;
    let score = Infinity;
    for (const u of this.interior.interactables) {
      if (u.hidden?.()) continue;
      const to = u.pos.clone().sub(eye);
      const d = to.length();
      if (d > u.r) continue;
      const dot = to.normalize().dot(fwd);
      if (dot < 0.1 && d > 1.2) continue;
      const s = d * (1.5 - dot);
      if (s < score) (score = s), (best = u);
    }
    return best;
  }

  /** Places `camera` in the world from the host's frame: at your eyes, or (`third`) over your shoulder, pulled in
   *  wherever a wall or the ceiling would come between the camera and your head. It looks the way you look, so the
   *  crosshair is where your eyes point either way. */
  placeCamera(camera, host, third = false) {
    host.updateMatrixWorld();
    const eye = this.eye(_v);
    if (third) {
      const q = this.quat();
      const want = new THREE.Vector3(0.7, 0.35, 2.7).applyQuaternion(q).add(eye);
      want.y = Math.min(want.y, this.pos.y + (this.interior.ceiling ?? 3) - 0.3);
      eye.lerp(want, this.reach(eye, want));
    }
    camera.position.copy(eye).applyMatrix4(host.matrixWorld);
    camera.quaternion.copy(host.getWorldQuaternion(new THREE.Quaternion())).multiply(this.quat());
  }

  /** How far (0–1) along the line from `a` to `b` before a collider, less a hand's width. */
  reach(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    let t = 1;
    for (const c of this.interior.colliders) {
      const hit = slab(a, d, c.min, c.max);
      if (hit !== null && hit < t) t = hit;
    }
    return Math.max(0, t - 0.2 / Math.max(len, 1e-3));
  }
}

/** Where a ray from `o` along `d` (0..1 of it) first enters the box, or null. */
function slab(o, d, min, max) {
  let t0 = 0, t1 = 1;
  for (const k of ['x', 'y', 'z']) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < min[k] || o[k] > max[k]) return null;
      continue;
    }
    let a = (min[k] - o[k]) / d[k], b = (max[k] - o[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0 > 0 ? t0 : null;
}
