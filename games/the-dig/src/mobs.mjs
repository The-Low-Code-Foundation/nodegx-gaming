// The things that live down there. Crawlers keep to the dark (a torch keeps them off: they will not step into
// bright light), stalkers come deeper, and their eyes glow, so you see them on the far ledges before they see you.
// Behind the portals: bugs in the research stations, robots at the ruins, beasts in the open.
// Deeper than thirty blocks, now and then, a brute: three blocks tall, no eyes, and very hard to kill with standard
// rounds. It hunts by sound: running, digging and gunfire carry; walking barely does, and bolts hardly at all. It
// cannot follow you down a tunnel one block wide.
// Round 5 ("we need more enemy hotspots … harder enemy types … maybe even some that can shoot"): more of them, more
// often; archers, bony things that keep their distance and loose arrows you can see coming and step out of; ghouls,
// big pale crawlers below 30 blocks that are not afraid of torchlight and leap the last few blocks. And lairs: a
// garrison that wakes when you come near and stays near its hoard (the game says where the lairs are).
import * as THREE from 'three';
import { BLOCKS } from './blocks.mjs';
import { brightness } from './world.mjs';

const KINDS = {
  crawler: { w: 0.45, h: 0.7, hp: 8, speed: 3.3, wander: 1.1, dmg: 2, sense: 16, body: 0x3d4a3a, eye: 0xff3322, fearsLight: true, legs: 6 },
  stalker: { w: 0.35, h: 2.2, hp: 14, speed: 3.9, wander: 1.3, dmg: 3, sense: 22, body: 0x2a2630, eye: 0x7dff5a, fearsLight: true, legs: 2 },
  bug: { w: 0.3, h: 0.45, hp: 3, speed: 5.2, wander: 2.2, dmg: 1, sense: 14, body: 0x9a5a1a, eye: 0xffd040, legs: 6 },
  robot: { w: 0.45, h: 1.7, hp: 16, speed: 2.3, wander: 0.8, dmg: 3, sense: 18, body: 0x7f8a96, eye: 0x40c8ff, legs: 2 },
  beast: { w: 0.5, h: 0.95, hp: 10, speed: 5.4, wander: 1.6, dmg: 2, sense: 20, body: 0x6b5340, eye: 0xffaa33, legs: 4 },
  archer: { w: 0.32, h: 1.95, hp: 20, speed: 3.2, wander: 1.0, dmg: 2, sense: 28, body: 0xc9c2b0, eye: 0xff6a2a, legs: 2, archer: true },
  ghoul: { w: 0.55, h: 0.95, hp: 34, speed: 4.7, wander: 1.4, dmg: 4, sense: 20, body: 0x8c9488, eye: 0xd6ff3a, legs: 6, leaps: true },
  brute: { w: 0.75, h: 3.0, hp: 360, speed: 4.6, wander: 0.9, listen: 2.4, dmg: 8, sense: 0, body: 0x26343c, eye: 0x4ff0ff, legs: 2, hears: true }
};

function build(kind) {
  const k = KINDS[kind];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ color: k.body });
  const eyeMat = new THREE.MeshBasicMaterial({ color: k.eye });
  const add = (w, h, d, x, y, z, m = bodyMat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  const legs = [];
  if (kind === 'crawler' || kind === 'bug' || kind === 'ghoul') {
    const s = kind === 'bug' ? 0.6 : kind === 'ghoul' ? 1.35 : 1;
    add(0.8 * s, 0.35 * s, 1.0 * s, 0, 0.42 * s, 0);
    add(0.5 * s, 0.3 * s, 0.4 * s, 0, 0.45 * s, -0.6 * s);
    add(0.09 * s, 0.09 * s, 0.05 * s, -0.12 * s, 0.5 * s, -0.81 * s, eyeMat);
    add(0.09 * s, 0.09 * s, 0.05 * s, 0.12 * s, 0.5 * s, -0.81 * s, eyeMat);
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const leg = add(0.6 * s, 0.07 * s, 0.07 * s, side * 0.6 * s, 0.25 * s, (-0.35 + Math.floor(i / 2) * 0.35) * s);
      leg.rotation.z = side * 0.6;
      legs.push(leg);
    }
    // A ghoul's back is ridged with spines.
    if (kind === 'ghoul') for (let i = 0; i < 4; i++) add(0.08, 0.28, 0.08, 0, 0.82, -0.4 + i * 0.27, eyeMat).rotation.x = 0.4;
  } else if (kind === 'archer') {
    // Bones: a thin ribbed body, a skull with two embers for eyes, a bow in the left hand.
    const bone = new THREE.MeshBasicMaterial({ color: 0x8a8476 });
    add(0.36, 0.7, 0.2, 0, 1.25, 0);
    for (let i = 0; i < 3; i++) add(0.42, 0.06, 0.24, 0, 1.12 + i * 0.18, 0, bone);
    add(0.36, 0.36, 0.36, 0, 1.8, 0);
    add(0.08, 0.06, 0.04, -0.09, 1.82, -0.19, eyeMat);
    add(0.08, 0.06, 0.04, 0.09, 1.82, -0.19, eyeMat);
    for (const side of [-1, 1]) {
      legs.push(add(0.1, 0.9, 0.1, side * 0.11, 0.45, 0));
      const arm = add(0.08, 0.75, 0.08, side * 0.24, 1.3, -0.2);
      arm.rotation.x = -1.2;
    }
    const wood = new THREE.MeshBasicMaterial({ color: 0x6a4a28 });
    const bow = add(0.05, 0.9, 0.05, -0.24, 1.38, -0.55, wood);
    bow.rotation.z = 0.15;
    add(0.01, 0.84, 0.01, -0.22, 1.38, -0.5, new THREE.MeshBasicMaterial({ color: 0xdddddd }));
  } else if (kind === 'stalker') {
    add(0.4, 1.1, 0.3, 0, 1.3, 0);
    add(0.32, 0.36, 0.32, 0, 2.02, 0);
    add(0.07, 0.05, 0.04, -0.08, 2.05, -0.17, eyeMat);
    add(0.07, 0.05, 0.04, 0.08, 2.05, -0.17, eyeMat);
    for (const side of [-1, 1]) {
      legs.push(add(0.12, 0.8, 0.12, side * 0.13, 0.4, 0));
      const arm = add(0.08, 1.0, 0.08, side * 0.28, 1.25, -0.1);
      arm.rotation.x = -0.3;
    }
  } else if (kind === 'robot') {
    add(0.7, 0.75, 0.45, 0, 1.05, 0);
    add(0.45, 0.35, 0.4, 0, 1.6, 0);
    add(0.38, 0.08, 0.04, 0, 1.62, -0.21, eyeMat);
    for (const side of [-1, 1]) legs.push(add(0.18, 0.65, 0.2, side * 0.2, 0.33, 0));
  } else if (kind === 'brute') {
    // Broad and stooped, no face: a glow through cracks in its chest, and two feelers it listens with.
    add(1.5, 1.25, 0.95, 0, 1.9, 0);
    add(0.9, 0.7, 0.8, 0, 2.75, -0.15);
    for (const [x, y, w, h] of [[-0.35, 2.1, 0.08, 0.6], [0.1, 1.95, 0.08, 0.75], [0.45, 2.2, 0.08, 0.4], [-0.1, 1.6, 0.5, 0.08]]) add(w, h, 0.04, x, y, -0.49, eyeMat);
    for (const side of [-1, 1]) {
      const f = add(0.06, 0.6, 0.06, side * 0.3, 3.3, -0.2, eyeMat);
      f.rotation.z = side * -0.35;
      legs.push(add(0.45, 1.3, 0.5, side * 0.42, 0.65, 0));
      const arm = add(0.38, 1.6, 0.4, side * 0.98, 1.65, -0.1);
      arm.rotation.x = -0.15;
    }
  } else {
    add(0.55, 0.45, 1.2, 0, 0.7, 0);
    add(0.38, 0.35, 0.45, 0, 0.85, -0.75);
    add(0.07, 0.06, 0.04, -0.1, 0.92, -0.98, eyeMat);
    add(0.07, 0.06, 0.04, 0.1, 0.92, -0.98, eyeMat);
    for (let i = 0; i < 4; i++) legs.push(add(0.13, 0.5, 0.13, (i % 2 ? 1 : -1) * 0.2, 0.25, i < 2 ? -0.45 : 0.45));
  }
  // A health bar over its head, turned to face you: shown when you hit it or put the crosshair on it, so you can tell
  // whether to fight or run. The brute's is twice as wide, with a mark every tenth of its health.
  const big = !!k.hears;
  const BW = big ? 1.6 : 0.8, BH = big ? 0.16 : 0.1;
  const flat = (w, h, color, opacity = 1) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false }));
  const bar = new THREE.Group();
  const back = flat(BW + 0.06, BH + 0.06, 0x0c0c0c, 0.7);
  const fill = flat(BW, BH, 0x5ad24a);
  fill.geometry.translate(BW / 2, 0, 0);
  fill.position.set(-BW / 2, 0, 0.002);
  bar.add(back, fill);
  if (big) for (let i = 1; i < 10; i++) {
    const t = flat(0.012, BH, 0x0c0c0c, 0.6);
    t.position.set(-BW / 2 + (BW * i) / 10, 0, 0.004);
    bar.add(t);
  }
  for (const m of bar.children) m.renderOrder = 10;
  bar.position.y = k.h + (big ? 0.55 : 0.4);
  bar.visible = false;
  g.add(bar);
  return { group: g, bodyMat, legs, bar, fill };
}

export class Mobs {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.spawnTimer = 0;
    this.caveSpawning = false;
    this.surface = () => 0;
    this.bruteOdds = 0.05; // a chance each spawn tick (1 s) while none is about (round 4: 0.035 a 1.5 s tick)
    this.arrows = []; // the archers' arrows in flight, and stuck in the walls a while
    this.camera = null; // set by the game: the health bars turn to face it
    this.looked = null; // the creature under the crosshair, set by the game each frame
  }

  // The health bar: how full, its colour (green, then yellow under half, red under a quarter), facing the camera.
  // It stays up six seconds after a hit, and while the crosshair is on the creature.
  showBar(m, dt) {
    if (m === this.looked) m.barT = Math.max(m.barT, 0.4);
    m.barT -= dt;
    m.bar.visible = m.barT > 0;
    if (!m.bar.visible) return;
    const f = Math.max(0, Math.min(1, m.hp / m.k.hp));
    m.fill.scale.x = Math.max(0.001, f);
    m.fill.material.color.setHex(f > 0.5 ? 0x5ad24a : f > 0.25 ? 0xffc83a : 0xff4030);
    if (this.camera) m.bar.quaternion.copy(m.group.quaternion).invert().multiply(this.camera.quaternion);
  }

  add(kind, x, y, z) {
    const k = KINDS[kind];
    const { group, bodyMat, legs, bar, fill } = build(kind);
    group.position.set(x, y, z);
    this.scene.add(group);
    const m = { kind, k, group, bodyMat, legs, bar, fill, barT: 0, pos: group.position, vel: new THREE.Vector3(), hp: k.hp, heading: Math.random() * 6.28, think: 0, attackAt: 0, onGround: false, growlAt: performance.now() / 1000 + Math.random() * 6, hurtFlash: 0, phase: Math.random() * 6 };
    this.list.push(m);
    return m;
  }

  clear() {
    for (const m of this.list) this.scene.remove(m.group);
    for (const a of this.arrows) this.scene.remove(a.mesh);
    this.list = [];
    this.arrows = [];
  }

  remove(m) {
    this.scene.remove(m.group);
    const i = this.list.indexOf(m);
    if (i >= 0) this.list.splice(i, 1);
  }

  // A sound: who hears it (a brute in range turns to it). fromPlayer: the sound gives the player's place away.
  noise(at, radius, fromPlayer = false) {
    for (const m of this.list) {
      if (!m.k.hears) continue;
      const d = Math.hypot(at.x - m.pos.x, at.y - m.pos.y, at.z - m.pos.z);
      if (d > radius) continue;
      m.heard = new THREE.Vector3(at.x, at.y, at.z);
      m.calm = 9;
      // Close and loud, or heard twice running: it knows it is you.
      m.state = fromPlayer && (d < radius * 0.55 || m.state !== 'idle') ? 'hunt' : m.state === 'hunt' ? 'hunt' : 'listen';
    }
  }

  // The brutes that are listening for you or after you (the compass shows them).
  alert() {
    return this.list.filter((m) => m.k.hears && m.state !== 'idle');
  }

  solidAt(x, y, z) {
    return BLOCKS[this.world.get(Math.floor(x), Math.floor(y), Math.floor(z))].solid;
  }

  collides(m, x, y, z) {
    const w = m.k.w;
    for (let yy = Math.floor(y); yy <= Math.floor(y + m.k.h - 0.01); yy++)
      for (const [dx, dz] of [[-w, -w], [w, -w], [-w, w], [w, w]]) if (this.solidAt(x + dx, yy, z + dz)) return true;
    return false;
  }

  sees(m, eye) {
    const from = new THREE.Vector3(m.pos.x, m.pos.y + m.k.h * 0.8, m.pos.z);
    const d = eye.clone().sub(from);
    const dist = d.length();
    const hit = this.world.raycast(from, d.normalize(), dist, (id) => BLOCKS[id].opaque);
    return !hit;
  }

  // Cave spawning: out of sight in the dark, 18–40 blocks off, below the surface.
  spawnCave(player, dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 1;
    const depth = this.surface(player.pos.x, player.pos.z) - player.pos.y;
    if (depth < 10) return;
    if (depth > 30 && !this.list.some((m) => m.kind === 'brute') && Math.random() < this.bruteOdds) this.spawnBrute(player);
    // Round 5: more of them (the cap was 3 + depth/30, at most 9), and now and then two together.
    const cap = Math.min(14, 5 + Math.floor(depth / 18));
    const wild = this.list.filter((m) => m.kind !== 'brute' && !m.lair).length;
    if (wild >= cap) return;
    const n = wild + 1 < cap && Math.random() < 0.3 ? 2 : 1;
    for (let k = 0; k < n; k++) this.spawnOne(player, depth);
  }

  // Who comes, by depth: crawlers near the top; archers from the start; ghouls below 30; stalkers below 60.
  pickKind(depth) {
    const r = Math.random();
    if (depth < 30) return r < 0.72 ? 'crawler' : 'archer';
    if (depth < 60) return r < 0.45 ? 'crawler' : r < 0.75 ? 'archer' : 'ghoul';
    return r < 0.3 ? 'crawler' : r < 0.52 ? 'stalker' : r < 0.77 ? 'archer' : 'ghoul';
  }

  spawnOne(player, depth) {
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2, d = 16 + Math.random() * 22;
      const x = Math.floor(player.pos.x + Math.cos(a) * d), z = Math.floor(player.pos.z + Math.sin(a) * d);
      for (let dy = -12; dy <= 12; dy++) {
        const y = Math.floor(player.pos.y) + dy;
        if (this.world.get(x, y, z) !== 0 || this.world.get(x, y + 1, z) !== 0 || !BLOCKS[this.world.get(x, y - 1, z)].solid) continue;
        if (this.world.lightAt(x, y, z) > 4) continue;
        if (y > this.surface(x, z) - 8) continue;
        if (this.safeAt?.(x, y, z)) continue; // DIG-007: never in a room they will not enter
        const kind = this.pickKind(depth);
        if (KINDS[kind].h > 2 && this.world.get(x, y + 2, z) !== 0) continue;
        this.add(kind, x + 0.5, y, z + 0.5);
        return;
      }
    }
  }

  // A brute wants room: a floor three wide under four blocks of air, out of sight, 26–44 blocks off.
  spawnBrute(player) {
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 18;
      const x = Math.floor(player.pos.x + Math.cos(a) * d), z = Math.floor(player.pos.z + Math.sin(a) * d);
      for (let dy = -14; dy <= 14; dy++) {
        const y = Math.floor(player.pos.y) + dy;
        let ok = true;
        for (let dz = -1; dz <= 1 && ok; dz++)
          for (let dx = -1; dx <= 1 && ok; dx++) {
            if (!BLOCKS[this.world.get(x + dx, y - 1, z + dz)].solid) ok = false;
            for (let h = 0; h < 4 && ok; h++) if (this.world.get(x + dx, y + h, z + dz) !== 0) ok = false;
          }
        if (!ok || y > this.surface(x, z) - 20 || this.safeAt?.(x, y, z)) continue;
        this.add('brute', x + 0.5, y, z + 0.5);
        return true;
      }
    }
    return false;
  }

  update(dt, player, now, hooks) {
    if (this.caveSpawning) this.spawnCave(player, dt);
    this.lastPlayer = player.pos;
    const eye = player.eye();
    this.stepArrows(dt, player, hooks);
    for (const m of [...this.list]) {
      const k = m.k;
      const toP = new THREE.Vector3(player.pos.x - m.pos.x, 0, player.pos.z - m.pos.z);
      const dist = Math.hypot(toP.x, player.pos.y - m.pos.y, toP.z);
      // Out of range they go (a lair's garrison only far off: it wakes again when you come back).
      if (this.caveSpawning && dist > (m.lair ? 110 : k.hears ? 90 : 70)) {
        this.remove(m);
        continue;
      }
      // Burning and frozen (the special ammo's doing).
      if (m.burn > 0) {
        m.burn -= dt;
        m.burnTick = (m.burnTick ?? 0) + dt;
        if (m.burnTick > 0.5) {
          m.burnTick = 0;
          m.hp -= 2;
          m.hurtFlash = 0.6;
          m.barT = Math.max(m.barT, 3);
          if (m.hp <= 0) {
            hooks.killed(m);
            continue;
          }
        }
      }
      this.showBar(m, dt);
      if (m.frozen > 0) {
        m.frozen -= dt;
        m.vel.set(0, Math.min(0, m.vel.y - 30 * dt), 0);
        m.bodyMat.color.setHex(0xbfe8ff);
        continue;
      }
      m.think -= dt;
      if (m.think <= 0) {
        m.think = 0.25 + Math.random() * 0.2;
        m.chasing = dist < k.sense && this.sees(m, eye);
        if (!m.chasing && Math.random() < 0.3) m.heading = Math.random() * Math.PI * 2;
      }
      let speed = m.chasing ? k.speed : k.wander;
      let dir = m.chasing ? Math.atan2(toP.x, toP.z) : m.heading;
      // A lair's garrison keeps near its hoard unless it is after you, and goes back when it loses you.
      if (m.home && !m.chasing && Math.hypot(m.home.x - m.pos.x, m.home.z - m.pos.z) > 8) dir = Math.atan2(m.home.x - m.pos.x, m.home.z - m.pos.z);
      // An archer keeps its distance: closes in from far off, backs away up close, and sidesteps in between, loosing
      // an arrow when it has a clear shot (it draws first, so there is a moment to see it coming).
      if (k.archer && m.chasing) {
        if (dist < 7) dir += Math.PI;
        else if (dist < 20) {
          dir += (m.side ??= Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
          speed = k.wander;
          if (Math.random() < dt * 0.4) m.side = -m.side;
        }
        if (dist < 30 && now > (m.shootAt ?? 0)) {
          if (!m.drawing) {
            m.drawing = now + 0.75;
          } else if (now > m.drawing) {
            m.drawing = 0;
            m.shootAt = now + 1.9 + Math.random() * 1.2;
            this.loose(m, player, dist);
            hooks.shoot?.(dist);
          }
        }
      } else if (k.archer) m.drawing = 0;
      if (m.drawing) speed = 0;
      // A ghoul leaps the last few blocks.
      if (k.leaps && m.chasing && m.onGround && dist > 2.5 && dist < 7 && now > (m.leapAt ?? 0) && Math.abs(player.pos.y - m.pos.y) < 2) {
        m.leapAt = now + 2.5;
        m.vel.y = 7.5;
        const l = toP.clone().normalize().multiplyScalar(9);
        m.vel.x = l.x;
        m.vel.z = l.z;
        m.leaping = 0.45;
      }
      if (k.hears) {
        // It goes where it last heard something; right up close it smells you; with nothing new it calms down.
        if (dist < 3.2) {
          m.state = 'hunt';
          m.heard = player.pos.clone();
          m.calm = 9;
        }
        m.calm = (m.calm ?? 0) - dt;
        if (m.calm <= 0) m.state = 'idle';
        m.state ??= 'idle';
        if (m.state !== 'idle' && m.heard) {
          const tx = m.heard.x - m.pos.x, tz = m.heard.z - m.pos.z;
          if (Math.hypot(tx, tz) > 1.2) {
            dir = Math.atan2(tx, tz);
            speed = m.state === 'hunt' ? k.speed : k.listen;
          } else speed = 0;
        }
        // Finding you, it roars.
        if (m.state === 'hunt' && m.was !== 'hunt') hooks.roar?.(m, dist);
        m.was = m.state;
        // Its steps carry.
        if (Math.hypot(m.vel.x, m.vel.z) > 0.5 && now > (m.stepAt ?? 0)) {
          m.stepAt = now + (m.state === 'hunt' ? 0.42 : 0.8);
          hooks.thud?.(dist);
        }
      }
      // The cave things will not walk into torchlight; caught in it, they back off.
      if (k.fearsLight) {
        const here = this.world.lightAt(m.pos.x, m.pos.y + 0.5, m.pos.z);
        const ax = m.pos.x + Math.sin(dir) * 1.2, az = m.pos.z + Math.cos(dir) * 1.2;
        const ahead = this.world.lightAt(ax, m.pos.y + 0.5, az);
        if (here >= 11) {
          dir += Math.PI;
          speed = k.speed;
        } else if (ahead >= 10) speed = 0;
      }
      // Nor into a room that came through the collapse whole and is safe (DIG-006/007); one
      // already in it turns back out. Every kind, the brute too.
      if (this.safeAt) {
        const ax = m.pos.x + Math.sin(dir) * 1.2, az = m.pos.z + Math.cos(dir) * 1.2;
        if (this.safeAt(m.pos.x, m.pos.y + 0.5, m.pos.z)) {
          dir += Math.PI;
          speed = k.speed;
        } else if (this.safeAt(ax, m.pos.y + 0.5, az)) speed = 0;
      }
      const vx = Math.sin(dir) * speed, vz = Math.cos(dir) * speed;
      if ((m.leaping = Math.max(0, (m.leaping ?? 0) - dt)) <= 0) {
        m.vel.x += (vx - m.vel.x) * Math.min(1, 8 * dt);
        m.vel.z += (vz - m.vel.z) * Math.min(1, 8 * dt);
      }
      m.vel.y -= 30 * dt;
      // Move, stepping up one block when blocked.
      const nx = m.pos.x + m.vel.x * dt;
      if (!this.collides(m, nx, m.pos.y, m.pos.z)) m.pos.x = nx;
      else if (m.onGround && !this.collides(m, nx, m.pos.y + 1.05, m.pos.z)) m.vel.y = 8.5;
      else m.heading += 1.5;
      const nz = m.pos.z + m.vel.z * dt;
      if (!this.collides(m, m.pos.x, m.pos.y, nz)) m.pos.z = nz;
      else if (m.onGround && !this.collides(m, m.pos.x, m.pos.y + 1.05, nz)) m.vel.y = 8.5;
      else m.heading -= 1.5;
      const ny = m.pos.y + Math.max(-1, m.vel.y * dt);
      if (this.collides(m, m.pos.x, ny, m.pos.z)) {
        if (m.vel.y < 0) {
          m.pos.y = Math.floor(ny) + 1;
          m.onGround = true;
        }
        m.vel.y = 0;
      } else {
        m.pos.y = ny;
        m.onGround = false;
      }
      if (m.pos.y < -2000) this.remove(m);
      // Face where it is going (an archer faces you while it draws); legs scuttle.
      m.group.rotation.y = (k.archer && m.chasing ? Math.atan2(toP.x, toP.z) : Math.atan2(m.vel.x, m.vel.z)) + Math.PI;
      m.phase += dt * Math.hypot(m.vel.x, m.vel.z) * 3;
      m.legs.forEach((l, i) => (l.rotation.x = Math.sin(m.phase + i * 1.7) * 0.5));
      // Lit by the world's light like the blocks are.
      const l = this.world.lightAt(m.pos.x, m.pos.y + 0.5, m.pos.z);
      const b = brightness(l);
      m.hurtFlash = Math.max(0, m.hurtFlash - dt * 4);
      m.bodyMat.color.setHex(k.body).multiplyScalar(b).lerp(new THREE.Color(1, 0.2, 0.1), m.hurtFlash);
      if (m.burn > 0) m.bodyMat.color.lerp(new THREE.Color(1, 0.5, 0.1), 0.35 + Math.sin(now * 20) * 0.15);
      // Attack.
      if (dist < k.w + 0.9 && Math.abs(player.pos.y - m.pos.y) < (k.hears ? 2.6 : 1.6) && now > m.attackAt) {
        m.attackAt = now + (k.hears ? 1.4 : 0.9);
        hooks.bite(k.dmg, m);
        if (k.hears) player.vel.add(new THREE.Vector3(-toP.x, 0, -toP.z).normalize().multiplyScalar(9)).add(new THREE.Vector3(0, 5, 0));
      }
      if ((m.chasing || m.state === 'hunt') && now > m.growlAt) {
        m.growlAt = now + 3 + Math.random() * 5;
        hooks.growl(dist, m);
      }
    }
  }

  // An archer's arrow, aimed to drop onto where you are standing (and a little ahead of where you are going).
  loose(m, player, dist) {
    const from = new THREE.Vector3(m.pos.x, m.pos.y + 1.45, m.pos.z);
    const lead = Math.min(0.5, dist / 30);
    const to = new THREE.Vector3(player.pos.x + player.vel.x * lead, player.pos.y + 1.1, player.pos.z + player.vel.z * lead);
    const SPEED = 24, G = 14;
    const dx = Math.hypot(to.x - from.x, to.z - from.z), dy = to.y - from.y;
    // The lower of the two angles that reach (a flat shot when it cannot reach at all).
    const v2 = SPEED * SPEED, disc = v2 * v2 - G * (G * dx * dx + 2 * dy * v2);
    const ang = disc >= 0 ? Math.atan((v2 - Math.sqrt(disc)) / (G * dx)) : Math.PI / 4;
    const spread = (Math.random() - 0.5) * 0.04;
    const yaw = Math.atan2(to.x - from.x, to.z - from.z) + spread;
    const vel = new THREE.Vector3(Math.sin(yaw) * Math.cos(ang), Math.sin(ang), Math.cos(yaw) * Math.cos(ang)).multiplyScalar(SPEED);
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.7), new THREE.MeshBasicMaterial({ color: 0xb8a078 })));
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.1), new THREE.MeshBasicMaterial({ color: 0xff7a3a, fog: false }));
    tip.position.z = 0.33;
    mesh.add(tip);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.arrows.push({ mesh, pos: from, vel, age: 0, stuck: false });
  }

  stepArrows(dt, player, hooks) {
    for (const a of [...this.arrows]) {
      a.age += dt;
      if (a.stuck) {
        if (a.age > 8) this.dropArrow(a);
        continue;
      }
      a.vel.y -= 14 * dt;
      const step = a.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const d = step.clone().normalize();
      const block = this.world.raycast(a.pos, d, len, (id) => BLOCKS[id].solid);
      // You: a box round the body.
      const p = player.pos;
      const end = a.pos.clone().add(step);
      const near = (q) => Math.abs(q.x - p.x) < 0.45 && Math.abs(q.z - p.z) < 0.45 && q.y > p.y - 0.1 && q.y < p.y + 1.9;
      if (near(end) || near(a.pos.clone().addScaledVector(step, 0.5))) {
        hooks.bite(3, null);
        this.dropArrow(a);
        continue;
      }
      if (block) {
        a.pos.addScaledVector(d, Math.max(0, block.t - 0.2));
        a.mesh.position.copy(a.pos);
        a.stuck = true;
        a.age = 0;
        continue;
      }
      a.pos.add(step);
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(a.pos.clone().add(a.vel));
      if (a.age > 6) this.dropArrow(a);
    }
  }

  dropArrow(a) {
    this.scene.remove(a.mesh);
    this.arrows.splice(this.arrows.indexOf(a), 1);
  }

  // The nearest creature a ray hits within max (a box test against each one).
  rayHit(o, d, max) {
    let best = null;
    for (const m of this.list) {
      const w = m.k.w + 0.15;
      const min = [m.pos.x - w, m.pos.y, m.pos.z - w], mx = [m.pos.x + w, m.pos.y + m.k.h, m.pos.z + w];
      let t0 = 0, t1 = max;
      const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
      let ok = true;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(dd[a]) < 1e-9) {
          if (oo[a] < min[a] || oo[a] > mx[a]) ok = false;
          continue;
        }
        let ta = (min[a] - oo[a]) / dd[a], tb = (mx[a] - oo[a]) / dd[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) ok = false;
      }
      if (ok && (!best || t0 < best.t)) best = { mob: m, t: t0, head: o.y + d.y * t0 > m.pos.y + m.k.h * 0.78 };
    }
    return best;
  }

  // Every creature a ray passes through within max, nearest first (the laser goes through them all).
  rayHitAll(o, d, max) {
    const out = [];
    const keep = this.list;
    for (const m of keep) {
      this.list = [m];
      const h = this.rayHit(o, d, max);
      if (h) out.push(h);
    }
    this.list = keep;
    return out.sort((a, b) => a.t - b.t);
  }

  damage(m, n) {
    m.hp -= n;
    m.hurtFlash = 1;
    m.barT = 6;
    m.chasing = true;
    if (m.k.hears) {
      // Hit, it knows where it came from.
      m.state = 'hunt';
      m.calm = 9;
      if (this.lastPlayer) m.heard = this.lastPlayer.clone();
    } else m.vel.y = 4;
    return m.hp <= 0;
  }
}
