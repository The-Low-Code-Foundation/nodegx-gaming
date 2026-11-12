// The radar (playtest, round 2: "not revealing everything but showing at least a vague sense of the hospital layout and
// showing red dots when the player can credibly see a zombie… but especially to see where the rooms with trapped
// people are"). A circle in the corner, turned with the camera: the floor as a faint plan (the fire-escape map by the
// lifts), brighter where she has been and seen; the rooms with people still in them, always; the stairs; and a red dot
// for each infected she can actually see right now (in front of her, in the line of sight), fading when she can't.
// M switches to the whole floor, north up. A later skill can widen what she senses: `world.radarSense` (metres; an
// infected that close shows through walls).
import { CELL, toCell, toWorld, sightClear, isWall } from './map.mjs';

const PX = 7; // pixels a cell on the plan
const SEEN_FADE = 1.4;

export class Radar {
  constructor(world, el) {
    this.world = world;
    const g = world.grid;
    this.size = 190;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.size * devicePixelRatio;
    this.canvas.style.width = this.canvas.style.height = `${this.size}px`;
    el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.big = false;
    this.explored = new Uint8Array(g.w * g.h);
    // The plan, drawn once: faint everywhere (a vague sense of the layout); the explored layer is painted over it.
    this.plan = document.createElement('canvas');
    this.plan.width = g.w * PX;
    this.plan.height = g.h * PX;
    const p = this.plan.getContext('2d');
    for (let z = 0; z < g.h; z++)
      for (let x = 0; x < g.w; x++) {
        if (isWall(g, x, z)) continue;
        p.fillStyle = 'rgba(150,175,190,0.13)';
        p.fillRect(x * PX, z * PX, PX, PX);
      }
    this.seen = new Map(); // zombie → seconds since last seen (shown while < SEEN_FADE)
    this.scanIn = 0;
    this.drawIn = 0;
  }

  toggle() {
    this.big = !this.big;
    this.size = this.big ? Math.min(innerWidth, innerHeight) * 0.8 : 190;
    this.canvas.width = this.canvas.height = this.size * devicePixelRatio;
    this.canvas.style.width = this.canvas.style.height = `${this.size}px`;
    this.canvas.parentElement.classList.toggle('big', this.big);
  }

  // What she has seen of the floor: cells in her line of sight within 14 m join the explored plan.
  scan() {
    const g = this.world.grid, p = this.world.player;
    const c = toCell(p.pos.x, p.pos.z);
    const ctx = this.plan.getContext('2d');
    const R = 7;
    for (let z = c.z - R; z <= c.z + R; z++)
      for (let x = c.x - R; x <= c.x + R; x++) {
        if (x < 0 || z < 0 || x >= g.w || z >= g.h) continue;
        const k = z * g.w + x;
        if (this.explored[k]) continue;
        const w = toWorld(x, z);
        if (Math.hypot(w.x - p.pos.x, w.z - p.pos.z) > 14) continue;
        const wall = isWall(g, x, z);
        // A wall is seen when the cell in front of it is.
        if (!sightClear(g, p.pos.x, p.pos.z, w.x, w.z)) {
          if (!wall) continue;
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
            const n = toWorld(x + dx, z + dz);
            return !isWall(g, x + dx, z + dz) && this.explored[(z + dz) * g.w + x + dx];
          });
          if (!near) continue;
        }
        this.explored[k] = 1;
        ctx.fillStyle = wall ? 'rgba(210,225,235,0.75)' : 'rgba(120,150,165,0.42)';
        ctx.fillRect(x * PX, z * PX, PX, PX);
      }
  }

  // Can she credibly see this one? In front of her (the camera's view and a little more), in the line of sight, not far.
  sees(z) {
    const p = this.world.player;
    const at = z.down ? z.headPos() : z.pos;
    const dx = at.x - p.pos.x, dz = at.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    const sense = this.world.radarSense ?? 0;
    if (d < sense) return true;
    if (d > 28) return false;
    if (d > 3) {
      // The camera's forward on the floor.
      const f = { x: Math.sin(p.camYaw), z: Math.cos(p.camYaw) };
      if ((dx * f.x + dz * f.z) / d < Math.cos(1.3)) return false;
    }
    // From her eyes, or from where the camera is looking round a corner.
    const eye = { x: p.pos.x, z: p.pos.z };
    if (p.cover && p.peek > 0.5) (eye.x += p.cover.tUnit.x * p.cover.edge * 0.75 * p.peek), (eye.z += p.cover.tUnit.z * p.cover.edge * 0.75 * p.peek);
    return sightClear(this.world.grid, eye.x, eye.z, at.x, at.z, { lowCover: z.down });
  }

  update(dt) {
    const p = this.world.player;
    if (!p) return;
    this.scanIn -= dt;
    if (this.scanIn <= 0) {
      this.scanIn = 0.25;
      this.scan();
      for (const z of this.world.zombies) {
        if (!z.alive) {
          this.seen.delete(z);
          continue;
        }
        if (this.sees(z)) this.seen.set(z, 0);
      }
    }
    for (const [z, t] of this.seen) this.seen.set(z, t + dt);
    this.drawIn -= dt;
    if (this.drawIn > 0) return;
    this.drawIn = 1 / 20;
    this.draw();
  }

  draw() {
    const { ctx, size } = this;
    const dpr = devicePixelRatio;
    const g = this.world.grid, p = this.world.player;
    const W = size * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2 - 2 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6,10,14,0.72)';
    ctx.fill();
    ctx.clip();
    // World metres → radar pixels.
    const scale = this.big ? (W * 0.92) / Math.max(g.w, g.h) / CELL : (PX * dpr) / CELL * 0.62;
    ctx.translate(W / 2, W / 2);
    // Turned so the way the camera looks is up (the big map: north up, centred on the floor).
    if (!this.big) ctx.rotate(Math.PI + p.camYaw);
    ctx.scale(scale, scale);
    // Map rows run +Z downwards on the canvas; world +Z is also down here (the rotation turns it to her view).
    if (this.big) ctx.translate(-(g.w * CELL) / 2, -(g.h * CELL) / 2);
    else ctx.translate(-p.pos.x, -p.pos.z);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.plan, 0, 0, g.w * CELL, g.h * CELL);
    const t = performance.now() / 1000;
    const dot = (x, z, r, fill, stroke) => {
      ctx.beginPath();
      ctx.arc(x, z, r / scale, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    };
    // The stairs.
    if (g.exit) {
      const e = toWorld(g.exit.x, g.exit.z);
      dot(e.x, e.z, 6 * dpr, '#3ddc84');
    }
    // The rooms with people in them: always shown, pulsing; lost ones a dull red.
    for (const room of g.rooms) {
      const left = this.world.survivors?.list.filter((s) => s.room === room && s.state === 'trapped').length ?? room.people.length;
      const c = room.floor.reduce((a, f) => ({ x: a.x + f.x, z: a.z + f.z }), { x: 0, z: 0 });
      const cx = (c.x / room.floor.length + 0.5) * CELL, cz = (c.z / room.floor.length + 0.5) * CELL;
      if (room.lost) dot(cx, cz, 4 * dpr, 'rgba(160,40,40,0.8)');
      else if (!room.open && left) {
        const pulse = 5 + Math.sin(t * 4) * 1.5;
        dot(cx, cz, (pulse + 2) * dpr, 'rgba(255,211,77,0.18)');
        dot(cx, cz, 4.5 * dpr, '#ffd34d', 'rgba(0,0,0,0.6)');
        const door = toWorld(room.door.x, room.door.z);
        dot(door.x, door.z, 2.2 * dpr, 'rgba(255,211,77,0.75)');
      }
    }
    // The infected she can see (or just saw).
    for (const [z, since] of this.seen) {
      if (since > SEEN_FADE || !z.alive) continue;
      const a = 1 - since / SEEN_FADE;
      const at = z.down ? z.headPos() : z.pos;
      dot(at.x, at.z, (z.down ? 3 : 4) * dpr, `rgba(255,60,60,${a})`, `rgba(0,0,0,${a * 0.6})`);
    }
    // Her: an arrow the way the camera looks.
    ctx.save();
    ctx.translate(p.pos.x, p.pos.z);
    ctx.rotate(-p.camYaw);
    ctx.beginPath();
    const s = (7 * dpr) / scale;
    ctx.moveTo(0, s);
    ctx.lineTo(s * 0.65, -s * 0.6);
    ctx.lineTo(0, -s * 0.25);
    ctx.lineTo(-s * 0.65, -s * 0.6);
    ctx.closePath();
    ctx.fillStyle = '#e8ecef';
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2 - 2 * dpr, 0, Math.PI * 2);
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = 'rgba(150,170,185,0.5)';
    ctx.stroke();
  }
}
