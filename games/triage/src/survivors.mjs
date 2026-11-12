// The trapped: people hiding in locked rooms. Open the door and they thank you and run for the exit, dodging the
// infected on the way; once out they are safe, and nothing can kill them. Leave a room too long with an infected
// hammering at its door and the door gives.
import * as THREE from 'three';
import { Animator } from './people.mjs';
import { Face } from './face.mjs';
import { toCell, toWorld, findPath } from './map.mjs';
import { slide, turnTo } from './move.mjs';

const FLEE_SPEED = 3.6;

export class Survivor {
  constructor(world, body, cell, room) {
    this.world = world;
    this.body = body;
    this.room = room;
    this.group = new THREE.Group();
    this.group.add(body.outer);
    const { x, z } = toWorld(cell.x, cell.z);
    this.group.position.set(x, 0, z);
    const door = toWorld(room.door.x, room.door.z);
    this.yaw = Math.atan2(door.x - x, door.z - z) + (Math.random() - 0.5) * 0.8;
    this.group.rotation.y = this.yaw;
    world.scene.add(this.group);
    this.anim = new Animator(body);
    this.face = new Face(body.outer);
    this.face.mood = Math.random() < 0.5 ? 'sad' : 'surprised';
    this.state = 'trapped';
    this.path = null;
    this.replan = 0;
    const idle = ['nervous', 'listenDoor', 'cough', 'idle'].filter((n) => body.clips[n]);
    this.anim.play({ full: idle[Math.floor(Math.random() * idle.length)] ?? 'Idle_Loop', fade: 0 });
  }
  get pos() {
    return this.group.position;
  }

  free() {
    if (this.state !== 'trapped') return;
    this.state = 'fleeing';
    this.face.mood = 'happy';
    this.path = null;
    this.replan = 0;
    const run = ['jog', 'sprint', 'Jog_Fwd_Loop'].filter((n) => this.body.clips[n])[0];
    this.runClip = run;
    this.anim.play({ full: run, fade: 0.3, timeScale: Math.max(0.6, Math.min(1.8, FLEE_SPEED / (this.anim.speedOf(run) || 3))) });
  }

  die() {
    if (this.state === 'dead' || this.state === 'saved') return;
    this.state = 'dead';
    this.face.mood = 'blank';
    this.anim.play({ full: 'Death01', once: true, fade: 0.1 });
    this.world.fx.decal(this.pos.x, this.pos.z, 0.5);
  }

  update(dt) {
    this.anim.update(dt);
    this.face.update(dt);
    if (this.state !== 'fleeing') return;
    const grid = this.world.grid;
    this.replan -= dt;
    if (this.replan <= 0 || !this.path) {
      this.replan = 1.2;
      const live = this.world.zombies.filter((z) => z.alive);
      const avoid = (x, z) => {
        const { x: wx, z: wz } = toWorld(x, z);
        let c = 0;
        for (const zb of live) {
          const d = Math.hypot(zb.pos.x - wx, zb.pos.z - wz);
          if (d < 4.5) c += d < 2 ? 14 : 5;
        }
        return c;
      };
      this.path = findPath(grid, toCell(this.pos.x, this.pos.z), grid.exit, { avoid }) ?? [];
    }
    if (!this.path.length) {
      this.state = 'saved';
      this.world.survivors.saved(this);
      return;
    }
    const next = this.path[0];
    const { x, z } = toWorld(next.x, next.z);
    let dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35) {
      this.path.shift();
      return;
    }
    // A sidestep around an infected in the way: they are quick, and nothing touches them now.
    for (const zb of this.world.zombies) {
      if (!zb.alive) continue;
      const ox = this.pos.x - zb.pos.x, oz = this.pos.z - zb.pos.z;
      const od = Math.hypot(ox, oz);
      if (od < 1.4 && od > 1e-3) ((dx += (ox / od) * 1.5), (dz += (oz / od) * 1.5));
    }
    const dd = Math.hypot(dx, dz);
    this.yaw = turnTo(this.yaw, Math.atan2(dx, dz), dt * 8);
    const step = FLEE_SPEED * dt;
    slide(grid, this.pos, (dx / dd) * step, (dz / dd) * step, 0.3);
    this.group.rotation.y = this.yaw;
  }
}

export class Survivors {
  constructor(world) {
    this.world = world;
    this.list = [];
    this.counts = { saved: 0, lost: 0 };
  }
  async populate(people, pick = (i) => 6 + ((i * 5) % 6)) {
    const grid = this.world.grid;
    let n = 0;
    for (const [i, room] of grid.rooms.entries()) {
      room.index = i + 1;
      room.doorHp = 28;
      room.banging = 0;
      for (const cell of room.people) {
        const body = await people.spawn(pick(n++));
        this.list.push(new Survivor(this.world, body, cell, room));
      }
    }
  }
  get total() {
    return this.list.length;
  }
  get trapped() {
    return this.list.filter((s) => s.state === 'trapped').length;
  }
  open(room) {
    if (room.open || room.lost) return false;
    room.open = true;
    this.world.audio?.play('door');
    const people = this.list.filter((s) => s.room === room);
    for (const s of people) s.free();
    this.world.hud?.toast(people.length === 1 ? '"Thank you! Go, go!"' : `"Thank you!" · ${people.length} people run for the stairs`);
    return true;
  }
  lose(room) {
    if (room.lost || room.open) return;
    room.lost = true;
    room.banging = 0;
    const people = this.list.filter((s) => s.room === room);
    for (const s of people) s.die();
    this.counts.lost += people.length;
    this.world.audio?.play('scream');
    this.world.hud?.toast(`Room ${room.index}: the door gave. ${people.length} lost.`, 'bad');
  }
  saved(s) {
    this.counts.saved++;
    s.group.visible = false;
    this.world.hud?.toast('One out of the building', 'good');
  }
  update(dt) {
    for (const s of this.list) s.update(dt);
  }
}
