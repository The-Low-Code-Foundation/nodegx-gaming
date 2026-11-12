// The three species from the Fold, and the pressurised canisters. Each creature has one rule you can learn by
// watching it, a tell before it hurts you, and a weakness.
//   Skitter  — blind; hunts by SOUND. Chatters before it leaps. Won't cross a Tender's light.
//   Tender   — tends the crystals; harmless. Its light keeps Skitters off. Hurt it and it screams for them.
//   Bulwark  — armoured front turns bullets. Charges blind in a straight line; dazed when it hits something solid,
//              and its back is soft.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t = -b - s;
  if (t >= 0) return t;
  return -b + s >= 0 ? 0 : -1;
}
export const angleTo = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
import { buildSkitter, buildTender, buildBulwark } from './models.mjs';
import { creatureModel, hideProcedural } from './creature-models.mjs';
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...o });

export class Creature {
  constructor(world, x, z) {
    this.w = world;
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.alive = true;
    this.home = { x, z };
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    world.scene.add(this.group);
    this.seq = world.spawnSeq++;
    this.flashT = 0;
    this.skin = [];
    this.state = 'idle';
    this.stateT = 0;
  }
  setState(s) {
    this.state = s;
    this.stateT = 0;
  }
  zones() {
    return [];
  }
  hitTest(o, d, max) {
    let best = null;
    for (const z of this.zones()) {
      const t = raySphere(o, d, z.c, z.r);
      if (t >= 0 && t <= max && (!best || t < best.t)) best = { t, zone: z.name };
    }
    return best;
  }
  center() {
    return this.zones()[0].c;
  }
  faceTo(x, z, rate, dt) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    const d = angleTo(this.yaw, want);
    this.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
    return Math.abs(d);
  }
  fwd() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }
  distTo(p) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }
  hitFlash() {
    this.flashT = 0.09;
  }
  updateFlash(dt) {
    if (this.flashT <= 0) return;
    this.flashT -= dt;
    const on = this.flashT > 0;
    for (const m of this.skin) {
      m.userData.base ??= m.emissive.getHex();
      m.emissive.setHex(on ? 0x661100 : m.userData.base);
    }
  }
  remove() {
    this.w.scene.remove(this.group);
  }
}

export class Skitter extends Creature {
  constructor(world, x, z, o = {}) {
    super(world, x, z);
    this.kind = 'skitter';
    this.hp = 24;
    this.r = 0.33;
    this.leash = o.leash ?? 3;
    this.wander = null;
    this.wanderT = Math.random() * 2;
    this.cd = 0;
    this.biteCD = 0;
    this.lastSense = -99;
    this.lastHeard = -99;
    this.y = o.y ?? 0;
    this.vy = 0;
    this.chitterT = 2 + Math.random() * 6;
    this.legPhase = Math.random() * 6;
    this.speedNow = 0;
    this.target = o.target ?? null;
    this.huntT = 0;
    this.build();
    this.setState(o.state ?? 'idle');
    if (this.state === 'fall') this.afterFall = o.afterFall ?? 'sniff';
    this.group.position.set(x, this.y, z);
  }
  build() {
    const p = buildSkitter();
    this.group.add(p.body);
    this.body = p.body;
    this.legs = p.legs;
    this.jaws = p.jaws;
    this.ears = p.ears;
    this.abd = p.abd;
    this.mouthMat = p.mouthMat;
    this.skin = p.skin;
    this.earK = 0;
    // the real body (the Xenohydro Roach): the procedural rig keeps moving underneath, unseen, and carries it
    this.model = creatureModel('skitter');
    if (this.model) {
      hideProcedural(p.body);
      p.body.add(this.model.root);
      this.skin = this.model.mats;
    }
  }
  animateModel(dt) {
    const A = this.model.anim, s = this.state, sp = this.speedNow;
    if (s === 'windup') A.play('Headbutt Attack', { fade: 0.08, speed: 1.3 });
    else if (s === 'leap') A.play('Run', { fade: 0.05, speed: 2.4 });
    else if (s === 'drag') A.play('Eat', { speed: 1.3 });
    else if (sp > 0.25) A.play('Run', { speed: Math.max(0.6, Math.min(2.4, sp / 2.2)) });
    else if (this.listening || s === 'sniff') A.play('Walking Around Idle', { speed: 1.3 });
    else A.play('Idle');
    A.update(dt);
  }
  zones() {
    this.z0 ??= { name: 'body', c: new THREE.Vector3(), r: 0.42 };
    this.z0.c.set(this.pos.x, this.y + 0.3, this.pos.z);
    return [this.z0];
  }
  hear(n, d) {
    if (!this.alive || this.listening || ['windup', 'leap', 'fall', 'recover', 'dying', 'drag'].includes(this.state)) return;
    const w = this.w, t = w.time;
    if (n.actor && n.actor.standing !== false && (n.actor.alive ?? true)) {
      // footsteps, a voice, a gunshot: something alive made it, and that is what they hunt
      const was = this.prey;
      this.lastHeard = t;
      this.prey = n.actor;
      this.target = { x: n.x, z: n.z };
      if (this.state !== 'hunt' || was !== n.actor) {
        if (this.state !== 'hunt') {
          this.setState('hunt');
          this.huntT = 0;
        }
        w.audio.play('chitter', this.zones()[0].c, 0.7);
        if (n.src === 'player' && d > 2.6) w.observe('skitter-sound');
        if (n.src === 'soldier' && w.canSee(this.zones()[0].c, 28)) w.observe('sweep-gunfire');
      }
    } else if (t - this.lastSense > 1.0) {
      // a can, a blast, a scream: go and see — even mid-hunt, unless the player is right here
      this.target = { x: n.x, z: n.z };
      if (this.state !== 'investigate') this.setState('investigate');
      if (n.src === 'can') w.observe('cans-lure', this);
    }
  }
  /** Walk, keeping out of every Tender's light. */
  move(dx, dz, speed, dt) {
    let vx = dx * speed, vz = dz * speed;
    this.atEdge = false;
    this.scared = false;
    for (const L of this.w.fearLights()) {
      const ex = this.pos.x - L.x, ez = this.pos.z - L.z, d = Math.hypot(ex, ez) || 0.01;
      if (d < L.r) {
        const s = Math.max(speed, 3.5) * 1.1;
        vx = (ex / d) * s;
        vz = (ez / d) * s;
        this.scared = true;
      } else if (d < L.r + 0.7) {
        const inward = -(vx * ex + vz * ez) / d;
        if (inward > 0) {
          vx += (ex / d) * inward;
          vz += (ez / d) * inward;
          this.atEdge = true;
        }
      }
    }
    this.w.level.moveCircle(this.pos, vx * dt, vz * dt, this.r);
    const sp = Math.hypot(vx, vz);
    if (sp > 0.2) this.faceTo(this.pos.x + vx, this.pos.z + vz, 9, dt);
    this.speedNow = sp;
    return sp;
  }
  update(dt) {
    const w = this.w, P = w.player, t = w.time;
    this.stateT += dt;
    this.cd -= dt;
    this.biteCD -= dt;
    this.updateFlash(dt);
    if (!this.alive) {
      // dead: on its back, legs curled
      this.body.rotation.z += (Math.PI - this.body.rotation.z) * Math.min(1, dt * 8);
      this.body.position.y += (0.55 - this.body.position.y) * Math.min(1, dt * 8);
      for (const L of this.legs) L.hip.rotation.x += (1.1 - L.hip.rotation.x) * dt * 4;
      for (const j of this.jaws) j.rotation.x += (-0.5 - j.rotation.x) * dt * 3;
      for (const e of this.ears) e.piv.rotation.x += (-0.9 - e.piv.rotation.x) * dt * 3;
      return;
    }
    // whoever it is after: the player unless something else made the last sound it heard
    if (this.prey && (!(this.prey.alive ?? true) || (this.prey !== P && this.prey.standing === false && !(this.prey.kind === 'okafor' && this.prey.state === 'down')))) this.prey = null;
    // anyone close enough to feel through the floor
    if (!['leap', 'windup', 'fall', 'recover', 'drag', 'dying'].includes(this.state)) {
      for (const b of w.singing ? [] : w.bodies()) {
        if (b === P && P.pos.y > 1.2) continue;
        if (this.distTo(b.pos) < 2.3) {
          this.prey = b;
          this.lastSense = t;
          this.target = { x: b.pos.x, z: b.pos.z };
          if (this.state !== 'hunt') {
            this.setState('hunt');
            this.huntT = 0;
          }
          break;
        }
      }
    }
    const A = this.prey ?? P;
    const toP = this.distTo(A.pos);
    this.speedNow = 0;
    // while the crystals sing, the Skitters in the hold stop dead and listen: for those seconds they hear nothing else
    const listening = w.singing && ['idle', 'hunt', 'investigate', 'sniff'].includes(this.state) && w.level.roomAt(this.pos.x, this.pos.z) === 'garden';
    this.listening = listening;
    if (listening) {
      this.move(0, 0, 0, dt);
      this.body.rotation.x += (-0.35 - this.body.rotation.x) * Math.min(1, dt * 6);
      this.lastSense = Math.min(this.lastSense, t - 1);
    } else if (this.body.rotation.x < -0.3 && this.state !== 'windup' && this.state !== 'leap') this.body.rotation.x = 0;
    if (!listening) switch (this.state) {
      case 'fall': {
        this.vy -= 22 * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0;
          w.audio.play('thud', this.pos, 0.7);
          w.fx.dust(this.zones()[0].c, [0, 1, 0]);
          this.setState(this.afterFall);
          if (this.afterFall === 'hunt') this.target = { x: P.pos.x, z: P.pos.z };
        }
        break;
      }
      case 'idle': {
        this.wanderT -= dt;
        if (this.wanderT <= 0 || !this.wander) {
          const a = Math.random() * Math.PI * 2, rr = Math.random() * this.leash;
          this.wander = { x: this.home.x + Math.cos(a) * rr, z: this.home.z + Math.sin(a) * rr };
          this.wanderT = 2 + Math.random() * 3;
        }
        const s = w.level.steer(this.pos, this.wander, this.r);
        if (s.dist > 0.4) this.move(s.x, s.z, 1.1, dt);
        else this.move(0, 0, 0, dt);
        this.chitterT -= dt;
        if (this.chitterT <= 0) {
          this.chitterT = 4 + Math.random() * 8;
          w.audio.play('chitter', this.zones()[0].c, 0.35);
        }
        break;
      }
      case 'investigate': {
        if (!this.target) {
          this.setState('idle');
          break;
        }
        const s = w.level.steer(this.pos, this.target, this.r);
        if (s.dist < 0.9 || this.stateT > 12 || (this.atEdge && this.stateT > 2)) this.setState('sniff');
        else this.move(s.x, s.z, 4.0, dt);
        break;
      }
      case 'sniff': {
        this.move(0, 0, 0, dt);
        this.body.rotation.x = Math.sin(t * 9) * 0.12;
        if (this.stateT > 1.8) {
          this.body.rotation.x = 0;
          // stray ones settle where they are; nest ones go home
          if (Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 14 && !this.nest) this.home = { x: this.pos.x, z: this.pos.z };
          this.setState('idle');
        }
        break;
      }
      case 'hunt': {
        this.huntT += dt;
        if (!this.target) this.target = { x: A.pos.x, z: A.pos.z };
        // a person on the floor is not food: it is taken to the crystals
        if (A.kind === 'okafor' && A.state === 'down') {
          this.target = { x: A.pos.x, z: A.pos.z };
          this.lastSense = t;
        }
        if (A.kind === 'okafor' && A.state === 'down' && !A.dragger && toP < 1.4) {
          this.startDrag(A);
          break;
        }
        const sensed = t - this.lastSense < 0.35 || t - this.lastHeard < 0.6;
        const Aok = (A.alive ?? true) && A.standing !== false;
        if (Aok && toP < 3.6 && sensed && this.cd <= 0 && toP > 1.2 && w.level.los(this.zones()[0].c, A.eye())) {
          this.setState('windup');
          w.audio.play('chitter', this.zones()[0].c, 1.3);
          if (A === P && toP < 8) w.observe('skitter-leap');
          w.onSkitterWindup?.(this, A);
          break;
        }
        if (Aok && toP < 1.1 && this.biteCD <= 0) {
          this.biteCD = 0.9;
          A.hurt(4, this.pos);
          w.audio.play('splat', this.zones()[0].c, 0.6);
        }
        const s = w.level.steer(this.pos, this.target, this.r);
        if (s.dist < 0.8 && !sensed) this.setState('sniff');
        else if (this.huntT > 14 && t - this.lastSense > 4) this.setState('sniff');
        else this.move(s.x, s.z, 5.4, dt);
        if (this.atEdge && A === P && P.alive && toP < 10) {
          const inLight = w.fearLights().some((L) => Math.hypot(P.pos.x - L.x, P.pos.z - L.z) < L.r);
          if (inLight) w.observe('tender-light');
        }
        break;
      }
      case 'windup': {
        this.faceTo(A.pos.x, A.pos.z, 10, dt);
        this.body.rotation.x = -0.35 * Math.min(1, this.stateT / 0.3);
        this.body.position.y = -0.08;
        if (this.stateT > 0.45) {
          this.body.rotation.x = 0;
          this.body.position.y = 0;
          const lead = 0.22, av = A.vel ?? { x: 0, z: 0 };
          const tx = A.pos.x + av.x * lead, tz = A.pos.z + av.z * lead;
          const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz) || 1;
          const sp = Math.min(9.5, d / 0.42 + 1);
          this.vel.set((dx / d) * sp, 0, (dz / d) * sp);
          this.vy = 3.4;
          this.hitDone = false;
          this.setState('leap');
          w.audio.play('screech', this.zones()[0].c);
        }
        break;
      }
      case 'leap': {
        this.vy -= 15 * dt;
        this.y += this.vy * dt;
        w.level.moveCircle(this.pos, this.vel.x * dt, this.vel.z * dt, this.r);
        this.body.rotation.x = -0.4;
        const dy = A.pos.y + 0.8 - (this.y + 0.3);
        if (!this.hitDone && (A.alive ?? true) && A.standing !== false && this.distTo(A.pos) < 0.8 && Math.abs(dy) < 1.1) {
          this.hitDone = true;
          A.hurt(8, this.pos);
          A.knock(this.vel.x * 0.3, 1, this.vel.z * 0.3);
          this.vel.multiplyScalar(-0.25);
          w.audio.play('splat', this.zones()[0].c);
        }
        if (this.y <= 0) {
          this.y = 0;
          this.body.rotation.x = 0;
          this.setState('recover');
          this.cd = 1.3 + Math.random() * 0.8;
        }
        break;
      }
      case 'recover': {
        this.move(0, 0, 0, dt);
        if (this.stateT > 0.5) {
          this.setState('hunt');
          if (toP < 5) {
            this.lastSense = t;
            this.target = { x: A.pos.x, z: A.pos.z };
          }
        }
        break;
      }
      case 'drag': {
        // backing towards the crystals with a person in tow
        const V = this.dragging;
        if (!V || V.state !== 'dragged') {
          this.dragging = null;
          this.setState('idle');
          break;
        }
        if (this.stateT > 2 && Math.floor(this.stateT / 2) !== Math.floor((this.stateT - dt) / 2)) this.dragGoal = w.dragGoal(this.pos);
        const g = this.dragGoal;
        const s = w.level.steer(this.pos, g, this.r);
        if (s.dist < 1.7 && this.stateT < 6) {
          // at the crystal it holds her down a while before the growth takes: the last chance to get her back
          this.move(0, 0, 0, dt);
          this.body.rotation.x = Math.sin(t * 14) * 0.1;
          break;
        }
        if (s.dist < 1.7) {
          V.plant();
          this.dragging = null;
          this.home = { x: this.pos.x, z: this.pos.z };
          this.setState('idle');
          break;
        }
        this.move(s.x, s.z, 1.5, dt);
        if (this.scared) {
          // its way runs into a Tender's light: it lets go
          this.dragging = null;
          this.setState('idle');
          break;
        }
        this.faceTo(this.pos.x - s.x, this.pos.z - s.z, 6, dt);
        if (Math.floor(this.stateT * 3) !== Math.floor((this.stateT - dt) * 3)) w.fx.decal({ x: V.pos.x, y: 0.012, z: V.pos.z }, [0, 1, 0], 'splat', 0.5, 0x3a0606);
        if (w.canSee(this.zones()[0].c, 22)) w.observe('skitter-drag');
        break;
      }
    }
    if (this.scared && P.alive && toP < 16) {
      const tender = w.tenders.find((td) => td.alive);
      if (tender && w.level.los(P.eye(), tender.lanternPos)) w.observe('tender-light');
    }
    // animate
    this.legPhase += dt * (4 + this.speedNow * 3.5);
    const k = Math.min(1, this.speedNow / 3);
    for (const L of this.legs) {
      const ph = this.legPhase + (L.row + (L.side > 0 ? 1 : 0)) * Math.PI;
      L.hip.rotation.y = Math.sin(ph) * 0.45 * k;
      L.hip.rotation.x = Math.max(0, Math.cos(ph)) * 0.35 * k;
    }
    if (this.state === 'idle' || this.state === 'hunt') this.body.position.y = Math.abs(Math.sin(this.legPhase)) * 0.025 * k;
    this.mouthMat.emissiveIntensity = this.state === 'windup' ? 3 + Math.sin(t * 60) * 1.5 : 1.0 + Math.sin(t * 3 + this.seq) * 0.3;
    // the ear-fans are how it hunts: folded back at rest, they flare and quiver when it listens
    const alert = this.listening || ['hunt', 'investigate', 'sniff', 'windup', 'leap', 'drag'].includes(this.state);
    this.earK += ((alert ? 1 : 0) - this.earK) * Math.min(1, dt * 7);
    for (const e of this.ears) {
      const q = alert ? Math.sin(t * 41 + e.side * 2 + this.seq) * 0.05 : 0;
      e.piv.rotation.set(-0.6 + this.earK * 0.8 + q, 0, -e.side * (0.3 + this.earK * 0.35));
    }
    // the maw: the petals part as it chatters and gape before a leap
    const gape = this.state === 'windup' ? Math.min(1, this.stateT / 0.25) : this.state === 'leap' ? 1 : this.state === 'drag' ? 0.5 : Math.max(0, Math.sin(t * 2.3 + this.seq)) * 0.25;
    for (const j of this.jaws) j.rotation.x = 0.3 - gape * 1.0 + (gape > 0.9 ? Math.sin(t * 50) * 0.08 : 0);
    this.abd.scale.setScalar(1 + Math.sin(t * (alert ? 7 : 2.5) + this.seq) * 0.035);
    if (this.model) this.animateModel(dt);
    this.group.position.set(this.pos.x, this.y, this.pos.z);
    this.group.rotation.y = this.yaw;
  }
  startDrag(V) {
    this.dragging = V;
    V.dragger = this;
    V.setState('dragged');
    this.dragGoal = this.w.dragGoal(this.pos);
    this.setState('drag');
    this.w.audio.play('chitter', this.zones()[0].c, 1.0);
  }
  damage(n, zone, from, kind, shooter) {
    if (!this.alive) return 'none';
    this.hp -= n;
    this.hitFlash();
    const w = this.w;
    if (this.state === 'drag') {
      this.dragging = null;
      this.setState('hunt');
    }
    if (kind === 'blast' && from) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
      this.vel.set((dx / d) * 6, 0, (dz / d) * 6);
      w.level.moveCircle(this.pos, (dx / d) * 1.2, (dz / d) * 1.2, this.r);
    }
    if (this.hp <= 0) {
      this.alive = false;
      this.setState('dying');
      this.y = 0;
      w.audio.play('skdie', this.zones()[0].c);
      w.fx.blood(this.zones()[0].c, 0xc8d040, 22, 3.5);
      w.fx.decal({ x: this.pos.x, y: 0.01, z: this.pos.z }, [0, 1, 0], 'splat', 1.1, 0x7a8a10);
      this.mouthMat.emissiveIntensity = 0;
      w.onKill(this);
      return 'flesh';
    }
    // a hit wakes it up and tells it where the shooter is
    if (from && !['leap', 'windup'].includes(this.state)) {
      const by = shooter ?? w.player;
      this.prey = by;
      this.target = { x: by.pos.x, z: by.pos.z };
      this.lastSense = w.time;
      if (this.state !== 'hunt') {
        this.setState('hunt');
        this.huntT = 0;
      }
    }
    return 'flesh';
  }
}

export class Tender extends Creature {
  constructor(world, crystals) {
    super(world, crystals[0].def.p[0] + 1.5, crystals[0].def.p[1] + 1.5);
    this.kind = 'tender';
    this.hp = 70;
    this.r = 0.4;
    this.crystals = crystals;
    this.wp = 0;
    this.lightR = 5.2;
    this.scaredT = 0;
    this.bob = Math.random() * 6;
    this.lanternPos = new THREE.Vector3();
    this.build();
    // its light hangs under the lantern, clear of the hood (a light inside the hood burns it white)
    this.lightPos = new THREE.Vector3();
    this.light = world.lights.add({ pos: this.lightPos, color: 0x8ff8ec, i: 6, d: 11 });
    this.setState('drift');
  }
  build() {
    const p = buildTender();
    this.group.add(p.body);
    this.body = p.body;
    this.lanternMat = p.lanternMat;
    this.veinMat = p.veinMat;
    this.beadMat = p.beadMat;
    this.tendrils = p.tendrils;
    this.arms = p.arms;
    this.roots = p.roots;
    this.skin = p.skin;
    // the real body (the Opabinia): it swims at head height, and the light it keeps comes off its own skin
    this.model = creatureModel('tender');
    if (this.model) {
      hideProcedural(p.body);
      this.model.root.position.y = Tender.SWIM_Y;
      p.body.add(this.model.root);
      this.skin = this.model.mats;
      for (const m of this.model.mats) {
        m.emissive.setHex(0x2fae9e);
        if (m.map) m.emissiveMap = m.map;
        m.emissiveIntensity = 0.6;
        m.needsUpdate = true;
      }
    }
    // the pool of light on the floor: the circle the Skitters won't cross
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(this.lightR, 40),
      new THREE.MeshBasicMaterial({ map: this.w.T.glow, color: 0x2fae9e, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.025;
    this.disc = disc;
    this.group.add(disc);
  }
  static SWIM_Y = 1.75;
  animateModel(dt) {
    const A = this.model.anim, s = this.state;
    if (!this.alive) A.play('Die', { once: true, fade: 0.3 });
    else if (this.screamT > 0) A.play('Scream', { once: true, fade: 0.1 });
    else if (s === 'tend' || s === 'plant') A.play('Tend', { fade: 0.6 });
    else A.play('Swim', { fade: 0.4, speed: s === 'flee' ? 2.2 : s === 'follow' ? 1.4 : 1 });
    A.update(dt);
  }
  get fear() {
    if (!this.alive || this.scaredT > 0) return null;
    return { x: this.pos.x, z: this.pos.z, r: this.lightR };
  }
  zones() {
    this.zz ??= [
      { name: 'body', c: new THREE.Vector3(), r: 0.32 },
      { name: 'lantern', c: new THREE.Vector3(), r: 0.42 }
    ];
    const y = this.group.position.y;
    if (this.model) {
      // a long swimmer: its body at swimming height, and the 'lantern' zone is its head, where the eyes are
      const f = this.fwd();
      this.zz[0].r = 0.45;
      this.zz[0].c.set(this.pos.x - f.x * 0.3, y + Tender.SWIM_Y, this.pos.z - f.z * 0.3);
      this.zz[1].c.set(this.pos.x + f.x * 0.95, y + Tender.SWIM_Y, this.pos.z + f.z * 0.95);
      return this.zz;
    }
    this.zz[0].c.set(this.pos.x, y + 1.2, this.pos.z);
    this.zz[1].c.set(this.pos.x, y + 2.15, this.pos.z);
    return this.zz;
  }
  update(dt) {
    const w = this.w, t = w.time;
    this.stateT += dt;
    this.updateFlash(dt);
    this.bob += dt;
    if (!this.alive) {
      if (this.model) {
        // it rolls belly-up (its Die clip) and sinks to the floor
        this.model.root.position.y += (0.3 - this.model.root.position.y) * Math.min(1, dt * 1.5);
        this.animateModel(dt);
      } else this.body.rotation.z += (1.45 - this.body.rotation.z) * Math.min(1, dt * 2);
      this.group.position.y += (0 - this.group.position.y) * Math.min(1, dt * 3);
      this.lanternPos.set(this.pos.x, 0.3, this.pos.z);
      return;
    }
    this.screamT = (this.screamT ?? 0) - dt;
    this.scaredT -= dt;
    const scared = this.scaredT > 0;
    const allow = null;
    // a crystal shard draws it: one lying on the floor, or one in your hand
    let bait = scared ? null : w.shardBait(this);
    if (bait) {
      this.lastBait = bait;
      this.lastBaitT = t;
    } else if (this.state === 'follow' && this.lastBait && !this.lastBait.ground && t - this.lastBaitT < 4) bait = this.lastBait;
    if (bait && ['drift', 'tend', 'follow'].includes(this.state)) {
      if (this.state !== 'follow') {
        this.setState('follow');
        w.audio.play('chime', this.lanternPos, 0.6);
      }
      if (w.canSee(this.lanternPos, 20)) w.observe('tender-shard');
    } else if (this.state === 'follow') this.setState('drift');
    // while the crystals sing, it stops and lifts its lantern
    const hush = w.singing;
    if (hush) {
      // nothing moves
    } else if (this.state === 'follow') {
      const keep = bait.ground ? 0.8 : 2.4;
      const s = w.level.steer(this.pos, bait, this.r);
      if (s.dist > keep) {
        const sp = s.dist > 7 ? 3.0 : 2.2;
        w.level.moveCircle(this.pos, s.x * sp * dt, s.z * sp * dt, this.r);
        this.faceTo(this.pos.x + s.x, this.pos.z + s.z, 2.0, dt);
      } else if (bait.ground) {
        this.setState('plant');
        this.planting = bait.ground;
        bait.ground.claimed = true;
      }
    } else if (this.state === 'plant') {
      this.faceTo(this.planting.pos.x, this.planting.pos.z, 2, dt);
      if (this.stateT > 2.5) {
        this.tendTarget = w.growShard(this.planting);
        this.planting = null;
        this.setState('tend');
        w.audio.play('chime', this.lanternPos);
      }
    } else if (this.state === 'drift' || this.state === 'flee') {
      let goal;
      if (this.state === 'flee') {
        // the waypoint furthest from the player
        let best = -1;
        for (const c of this.crystals) {
          if (!c.def.tended) continue;
          const d = Math.hypot(c.def.p[0] - w.player.pos.x, c.def.p[1] - w.player.pos.z);
          if (d > best) {
            best = d;
            goal = { x: c.def.p[0] + 1.2, z: c.def.p[1] + 1.2 };
          }
        }
        if (!scared) this.setState('drift');
      } else {
        const c = this.crystals[this.wp];
        goal = { x: c.def.p[0] + 1.2, z: c.def.p[1] + 1.2 };
      }
      const s = w.level.steer(this.pos, goal, this.r, 'all', allow);
      const speed = this.state === 'flee' ? 2.6 : 1.4;
      if (s.dist > 0.6) {
        w.level.moveCircle(this.pos, s.x * speed * dt, s.z * speed * dt, this.r);
        this.faceTo(this.pos.x + s.x, this.pos.z + s.z, 1.5, dt);
      } else if (this.state === 'drift') {
        this.setState('tend');
        const c = this.crystals[this.wp];
        c.glow = 2.0;
        w.audio.play('chime', this.lanternPos);
        const P = w.player;
        if (P.alive && Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < 18 && w.level.los(P.eye(), this.lanternPos)) w.observe('tender-crystal');
      }
    } else if (this.state === 'tend') {
      const c = this.tendTarget ?? this.crystals[this.wp];
      this.faceTo(c.def.p[0], c.def.p[1], 1.5, dt);
      c.glow = Math.max(c.glow, 1.8);
      if (this.stateT > (this.tendTarget ? 14 : 6)) {
        if (this.tendTarget) this.tendTarget = null;
        else this.wp = (this.wp + 1) % 6;
        this.setState('drift');
      }
    }
    // the light: steady teal; out and reddish while it is frightened
    const k = scared ? 0.25 + 0.15 * Math.sin(t * 20) : 1;
    this.light.scale = k;
    this.light.color.setHex(scared ? 0xff7070 : 0x8ff8ec);
    this.lanternMat.emissiveIntensity = 1.3 * k;
    this.disc.material.opacity = scared ? 0.06 : 0.5 + Math.sin(t * 1.3) * 0.05;
    // float and sway (and rise while the crystals sing)
    this.lift = (this.lift ?? 0) + ((hush ? 0.6 : 0) - (this.lift ?? 0)) * Math.min(1, dt * 2);
    const y = 0.28 + Math.sin(this.bob * 1.1) * 0.12 + this.lift;
    if (hush) this.lanternMat.emissiveIntensity = 1.7;
    if (this.model) {
      for (const m of this.model.mats) if (this.flashT <= 0) m.emissiveIntensity = 0.55 * k + (hush ? 0.6 : 0);
      this.animateModel(dt);
    }
    this.group.position.set(this.pos.x, y, this.pos.z);
    this.group.rotation.y = this.yaw;
    this.disc.position.y = 0.025 - y;
    if (this.model) {
      // the light hangs under its belly, far enough below it not to burn the skin white
      this.lanternPos.set(this.pos.x, y + Tender.SWIM_Y, this.pos.z);
      this.lightPos.set(this.pos.x, y + Tender.SWIM_Y - 0.8, this.pos.z);
    } else {
      this.lanternPos.set(this.pos.x, y + 2.15, this.pos.z);
      this.lightPos.set(this.pos.x, y + 1.35, this.pos.z);
    }
    for (const td of this.tendrils) {
      td.piv.rotation.x = Math.sin(t * 1.2 + td.ph) * 0.25 + (this.state === 'tend' ? 0.3 : 0);
      td.piv.rotation.z = Math.cos(t * 0.9 + td.ph) * 0.2 + (scared ? Math.sin(t * 13 + td.ph) * 0.15 : 0);
    }
    // the arms: they reach down to the crystal it tends, fold up when it is frightened, and drift otherwise
    this.reachK = (this.reachK ?? 0) + (((this.state === 'tend' ? 1 : 0) - (this.reachK ?? 0)) * Math.min(1, dt * 2));
    for (const a of this.arms) {
      const r = this.reachK, f = scared ? 1 : 0;
      a.sh.rotation.set(-0.35 - r * 0.75 - f * 1.6 + Math.sin(t * 0.9 + a.side) * 0.06, 0, a.side * (0.25 - r * 0.12 + f * 0.3));
      a.el.rotation.set(-0.45 - r * 0.45 - f * 1.2 + Math.sin(t * 1.3 + a.side) * 0.1, 0, 0);
      a.fingers.forEach((fg, i) => (fg.rotation.x = 0.3 + r * Math.sin(t * 3 + i * 2) * 0.35 + f * 0.6));
    }
    for (const rt of this.roots) rt.piv.rotation.z = Math.sin(t * 1.5 + rt.ph) * 0.12 + (hush ? 0.3 : 0);
    this.veinMat.emissiveIntensity = 0.9 * k + (hush ? 0.8 : 0) + Math.max(0, Math.sin(t * 2 - 1)) * 0.2;
    this.beadMat.emissiveIntensity = 2.0 * k + (hush ? 1 : 0);
  }
  damage(n, zone, from, kind, shooter) {
    if (!this.alive) return 'none';
    const w = this.w;
    this.hp -= n;
    this.hitFlash();
    w.fx.blood(this.zones()[zone === 'lantern' ? 1 : 0].c, 0x70e8ff, 14, 2.5);
    if (this.hp <= 0) {
      this.alive = false;
      this.light.on = false;
      this.lanternMat.emissiveIntensity = 0;
      this.veinMat.emissiveIntensity = 0;
      this.beadMat.emissiveIntensity = 0;
      this.disc.visible = false;
      w.audio.play('scream', this.lanternPos, 1.2);
      w.noise(this.pos.x, this.pos.z, 45, 'tender');
      for (const c of this.crystals) c.dead = true;
      this.killedBy = shooter ? 'the Sweep' : 'you';
      if (!shooter) w.observe('tender-killed');
      w.onKill(this);
      return 'flesh';
    }
    if (this.scaredT <= 0) {
      this.screamT = 1.6;
      w.audio.play('scream', this.lanternPos);
      w.noise(this.pos.x, this.pos.z, 40, 'tender');
    }
    this.scaredT = 7;
    this.setState('flee');
    return 'flesh';
  }
}

export class Bulwark extends Creature {
  constructor(world, x, z, yaw = 0) {
    super(world, x, z);
    this.kind = 'bulwark';
    this.hp = 420;
    this.maxHp = 420;
    this.r = 0.95;
    this.yaw = yaw;
    this.cd = 1;
    this.seeT = 0;
    this.sees = false;
    this.stompT = 0;
    this.walk = 0;
    this.build();
    this.setState('dormant');
  }
  build() {
    const p = buildBulwark();
    this.group.add(p.body);
    this.body = p.body;
    this.legs = p.legs;
    this.sac = p.sac;
    this.sacMat = p.sacMat;
    this.jaw = p.jaw;
    this.eyeM = p.eyeM;
    this.skin = p.skin;
    // the real body (the Arang, rigged in tools/blender/arang_rig.py); the glowing sac, its weak spot, stays and
    // rides its back on the pelvis bone
    this.model = creatureModel('bulwark');
    if (this.model) {
      hideProcedural(p.body, [p.sac]);
      p.body.add(this.model.root);
      // smaller than the procedural one and half sunk into the hide: a growth on its back, not a balloon
      this.model.pin('pelvis', p.sac, new THREE.Vector3(0, this.model.top(0, -0.55, 0.25) - 0.16, -0.55));
      p.sac.parent.scale.multiplyScalar(0.6);
      this.skin = this.model.mats;
    }
  }
  animateModel(dt, moving) {
    const A = this.model.anim, s = this.state;
    if (!this.alive) A.play('Die', { once: true, fade: 0.15 });
    else if (s === 'dormant') A.play('Idle', { speed: 0.5 });
    else if (s === 'wake') A.play('Bite', { once: true, fade: 0.15, speed: 0.7 });
    else if (s === 'swipe') A.play('Bite', { once: true, fade: 0.1, speed: 1.1 });
    else if (s === 'stunned') A.play('Stagger', { fade: 0.1 });
    else if (s === 'charge') A.play('Charge', { fade: 0.15, speed: Math.max(0.8, moving / 7) });
    else if (s === 'windup') A.play('Charge', { fade: 0.25, speed: 0.35 });
    else if (moving > 0.1) A.play(moving > 3 ? 'Run' : 'Walk', { fade: 0.25, speed: Math.max(0.6, moving / (moving > 3 ? 6 : 1.9)) });
    else A.play('Idle');
    A.update(dt);
  }
  zones() {
    this.zz ??= [
      { name: 'body', c: new THREE.Vector3(), r: 1.05 },
      { name: 'plates', c: new THREE.Vector3(), r: 0.85 },
      { name: 'sac', c: new THREE.Vector3(), r: 0.55 }
    ];
    const f = this.fwd(), y = this.body.position.y;
    this.zz[0].c.set(this.pos.x, 1.3 + y, this.pos.z);
    if (this.model) {
      // the armour is its great head; the sac is wherever its back has carried it this frame
      this.zz[1].c.set(this.pos.x + f.x * 0.95, 1.45 + y, this.pos.z + f.z * 0.95);
      this.sac.getWorldPosition(this.zz[2].c);
      this.zz[2].r = 0.38;
      return this.zz;
    }
    this.zz[1].c.set(this.pos.x + f.x * 0.85, 1.22 + y, this.pos.z + f.z * 0.85);
    this.zz[2].c.set(this.pos.x - f.x * 1.15, 1.78 + y, this.pos.z - f.z * 1.15);
    return this.zz;
  }
  eye() {
    return new THREE.Vector3(this.pos.x, 1.4, this.pos.z);
  }
  hitTest(o, d, max) {
    const best = super.hitTest(o, d, max);
    if (!this.model || !best || best.zone !== 'body') return best;
    // On the Arang the sac sits ON the hide, inside the body's sphere: a ray that reaches it hit the sac (the plates
    // still win if they come first, which super already decided).
    const z = this.zones()[2], t = raySphere(o, d, z.c, z.r);
    return t >= 0 && t <= max ? { t, zone: 'sac' } : best;
  }
  wake() {
    if (this.state !== 'dormant') return;
    this.setState('wake');
    this.w.audio.play('roar', this.eye(), 1.1);
    this.w.onBulwarkWake?.();
  }
  update(dt) {
    const w = this.w, P = w.player, t = w.time;
    this.stateT += dt;
    this.cd -= dt;
    this.updateFlash(dt);
    const sacPulse = this.state === 'stunned' ? 3.5 + Math.sin(t * 14) * 1.2 : 1.1 + Math.sin(t * 2.2) * 0.3;
    this.sacMat.emissiveIntensity = this.alive ? sacPulse : Math.max(0, this.sacMat.emissiveIntensity - dt);
    this.sac.scale.setScalar(this.alive ? 1 + Math.sin(t * (this.state === 'stunned' ? 9 : 2.2)) * (this.state === 'stunned' ? 0.07 : 0.035) : 0.92);
    this.eyeM.emissiveIntensity = this.alive ? (this.state === 'dormant' ? 0.4 : this.state === 'stunned' ? 0.6 + Math.random() * 0.8 : 2.2) : 0;
    const roar = ['wake', 'swipe', 'charge', 'windup'].includes(this.state) || !this.alive;
    this.jaw.rotation.x += ((roar ? 0.45 : 0.05) - this.jaw.rotation.x) * Math.min(1, dt * 6);
    if (!this.alive) {
      if (this.model) return this.animateModel(dt, 0);
      this.body.rotation.z += (0.5 - this.body.rotation.z) * Math.min(1, dt * 2);
      this.body.position.y += (-0.5 - this.body.position.y) * Math.min(1, dt * 2);
      return;
    }
    this.seeT -= dt;
    if (this.seeT <= 0) {
      this.seeT = 0.15;
      // it goes for whatever moves that it can see, the nearest first: you, a soldier, anyone
      let best = null, bd = 32;
      for (const b of w.bodies()) {
        const d = this.distTo(b.pos);
        if (d < bd && w.level.los(this.eye(), b.eye())) {
          bd = d;
          best = b;
        }
      }
      this.sees = !!best;
      if (best && this.state !== 'charge' && this.state !== 'windup') this.foe = best;
    }
    if (this.foe && (!(this.foe.alive ?? true) || this.foe.standing === false)) this.foe = null;
    const F = this.foe ?? P;
    const toP = this.distTo(F.pos);
    const allow = (c) => c.room === 'bay';
    let moving = 0;
    switch (this.state) {
      case 'dormant': {
        this.body.position.y = -0.25 + Math.sin(t * 1.2) * 0.03;
        if (P.alive && w.level.roomAt(P.pos.x, P.pos.z) === 'bay' && P.pos.x > 84) this.wake();
        break;
      }
      case 'wake': {
        this.body.position.y += (0 - this.body.position.y) * dt * 3;
        this.faceTo(F.pos.x, F.pos.z, 1.5, dt);
        if (this.stateT > 1.6) {
          this.setState('stalk');
          this.cd = 0.4;
        }
        break;
      }
      case 'stalk': {
        this.body.position.y += (0 - this.body.position.y) * dt * 4;
        const off = this.sees ? this.faceTo(F.pos.x, F.pos.z, 2.0, dt) : 9;
        if ((F.alive ?? true) && toP < 2.9 && this.cd <= 0) {
          this.setState('swipe');
          w.audio.play('snort', this.eye());
          break;
        }
        if (this.sees && toP > 4 && toP < 26 && this.cd <= 0 && off < 0.25) {
          this.setState('windup');
          w.audio.play('roar', this.eye(), 0.8);
          break;
        }
        if (toP > 2.4) {
          // close in until it can swipe (swipe range is 2.9)
          const s = w.level.steer(this.pos, F.pos, this.r, 'bay', allow);
          const before = this.pos.clone();
          w.level.moveCircle(this.pos, s.x * 1.9 * dt, s.z * 1.9 * dt, this.r);
          if (w.level.roomAt(this.pos.x, this.pos.z) !== 'bay') this.pos.copy(before);
          if (!this.sees) this.faceTo(this.pos.x + s.x, this.pos.z + s.z, 2.0, dt);
          moving = 1.9;
        }
        break;
      }
      case 'windup': {
        // tracks you for most of the wind-up, then commits
        if (this.stateT < 0.7) this.faceTo(F.pos.x, F.pos.z, 2.6, dt);
        this.body.position.y = -0.18 * Math.min(1, this.stateT / 0.4);
        this.body.rotation.x = 0.12;
        if (Math.floor(this.stateT * 6) !== Math.floor((this.stateT - dt) * 6)) w.fx.dust(new THREE.Vector3(this.pos.x, 0.1, this.pos.z), [0, 1, 0]);
        if (this.stateT > 1.0) {
          this.body.rotation.x = 0;
          this.chargeDir = this.fwd();
          this.traveled = 0;
          this.speed = 0;
          this.hitPlayer = false;
          this.hitSet = new Set();
          this.setState('charge');
        }
        break;
      }
      case 'charge': {
        this.speed = Math.min(13, this.speed + 40 * dt);
        const dx = this.chargeDir.x * this.speed * dt, dz = this.chargeDir.z * this.speed * dt;
        const before = this.pos.clone();
        w.level.moveCircle(this.pos, dx, dz, this.r);
        let blocked = w.level.roomAt(this.pos.x, this.pos.z) !== 'bay';
        if (blocked) this.pos.copy(before);
        const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
        this.traveled += moved;
        moving = this.speed;
        this.body.position.y = -0.1;
        this.stompT -= dt;
        if (this.stompT <= 0) {
          this.stompT = 0.22;
          w.audio.play('stomp', this.pos, 0.9);
          const d = this.distTo(P.pos);
          if (d < 14) w.shake(0.06 * (1 - d / 14));
        }
        for (const b of w.bodies()) {
          if (this.hitSet.has(b) || this.distTo(b.pos) >= this.r + 0.6) continue;
          this.hitSet.add(b);
          this.hitPlayer = true;
          b.hurt(30, this.pos);
          b.knock(this.chargeDir.x * 10, 3.5, this.chargeDir.z * 10);
          w.audio.play('thunk', b.pos, 1.3);
          if (b !== P && w.canSee(b.pos.clone().setY(1), 30)) w.observe('bulwark-anything');
        }
        for (const can of w.canisters) {
          if (!can.alive) continue;
          if (Math.hypot(can.pos.x - this.pos.x, can.pos.z - this.pos.z) < this.r + 0.55) {
            can.explode();
            this.impact();
            return;
          }
        }
        if (blocked || (this.stateT > 0.2 && moved < this.speed * dt * 0.4)) {
          this.impact();
          break;
        }
        if (this.traveled > 28 || (this.hitPlayer && this.traveled > 3)) {
          this.setState('stalk');
          this.cd = 1.6;
        }
        break;
      }
      case 'stunned': {
        this.body.rotation.z = Math.sin(this.stateT * 5) * 0.12;
        this.body.position.y = -0.2;
        if (this.stateT > 3.2) {
          this.body.rotation.z = 0;
          this.setState('stalk');
          this.cd = 1.0;
          w.audio.play('snort', this.eye());
        }
        break;
      }
      case 'swipe': {
        this.faceTo(F.pos.x, F.pos.z, 3, dt);
        this.body.rotation.x = this.stateT < 0.5 ? -0.15 : 0.25;
        if (this.stateT > 0.5 && !this.swung) {
          this.swung = true;
          const f = this.fwd();
          for (const b of w.bodies()) {
            const dx = b.pos.x - this.pos.x, dz = b.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
            if (d < 3.3 && (dx * f.x + dz * f.z) / d > 0.3) {
              b.hurt(22, this.pos);
              b.knock((dx / d) * 7, 2.5, (dz / d) * 7);
              w.audio.play('thunk', b.pos, 1.2);
            }
          }
        }
        if (this.stateT > 0.9) {
          this.swung = false;
          this.body.rotation.x = 0;
          this.setState('stalk');
          this.cd = 1.1;
        }
        break;
      }
    }
    // legs
    this.walk += dt * moving * 1.6;
    for (const L of this.legs) L.hip.rotation.x = moving > 0.1 ? Math.sin(this.walk + L.ph) * 0.5 : L.hip.rotation.x * 0.9;
    if (this.model) {
      this.body.rotation.x = 0; // the swipe's lean is in its Bite clip
      this.animateModel(dt, moving);
    }
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.yaw;
  }
  impact() {
    const w = this.w, P = w.player;
    this.setState('stunned');
    w.audio.play('boom', this.zones()[1].c, 1.2);
    w.audio.play('roar', this.eye(), 0.6);
    const f = this.fwd();
    const front = new THREE.Vector3(this.pos.x + f.x * 1.6, 1.0, this.pos.z + f.z * 1.6);
    w.fx.sparks(front, [-f.x, 0.5, -f.z], 24, 6);
    w.fx.dust(front, [-f.x, 0.3, -f.z], 0x7a756c);
    w.fx.dust(front.clone().setY(2), [-f.x, 0.3, -f.z], 0x7a756c);
    const d = this.distTo(P.pos);
    if (d < 20) w.shake(0.35 * (1 - d / 20));
    w.noise(this.pos.x, this.pos.z, 25, 'boom');
    w.observe('bulwark-stun');
  }
  damage(n, zone, from, kind, shooter) {
    if (!this.alive) return 'none';
    const w = this.w;
    if (shooter && this.state !== 'charge' && this.state !== 'windup') this.foe = shooter;
    if (kind === 'blast') {
      this.hp -= n;
      this.hitFlash();
      if (n > 25 && this.state !== 'stunned') {
        this.setState('stunned');
        w.audio.play('roar', this.eye(), 0.9);
      }
    } else if (zone === 'plates') {
      if (this.state === 'dormant') this.wake();
      if (!shooter) w.observe('bulwark-plates');
      return 'armor';
    } else {
      this.hp -= zone === 'sac' ? n : n * 0.25;
      this.hitFlash();
      if (zone === 'sac') this.sacMat.emissiveIntensity = 6;
    }
    if (this.state === 'dormant') this.wake();
    if (this.hp <= 0) {
      this.alive = false;
      this.setState('dead');
      w.audio.play('roar', this.eye(), 1.3);
      w.fx.blood(this.zones()[2].c, 0xff8a20, 40, 4);
      w.fx.decal({ x: this.pos.x, y: 0.01, z: this.pos.z }, [0, 1, 0], 'splat', 3.2, 0x8a3a08);
      w.onKill(this);
    }
    return 'flesh';
  }
}

export class Canister {
  constructor(world, x, z) {
    this.w = world;
    this.pos = new THREE.Vector3(x, 0, z);
    this.alive = true;
    this.fuse = -1;
    this.c = new THREE.Vector3(x, 0.65, z);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const red = std({ color: 0xa8231b, roughness: 0.4, metalness: 0.3 });
    const white = std({ color: 0xe8e4d8, roughness: 0.5 });
    const steel = std({ color: 0x8a8f94, roughness: 0.3, metalness: 0.7 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.1, 18), red);
    body.position.y = 0.55;
    g.add(body);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), red);
    cap.position.y = 1.1;
    g.add(cap);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.12, 18), white);
    band.position.y = 0.8;
    g.add(band);
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), steel);
    valve.position.y = 1.48;
    g.add(valve);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 14), steel);
    wheel.position.y = 1.56;
    wheel.rotation.x = Math.PI / 2;
    g.add(wheel);
    g.rotation.y = Math.random() * 6;
    world.scene.add(g);
    this.group = g;
  }
  hitTest(o, d, max) {
    const t = raySphere(o, d, this.c, 0.45);
    return t >= 0 && t <= max ? { t, zone: 'body' } : null;
  }
  hit() {
    if (!this.alive) return;
    if (this.fuse < 0) {
      this.fuse = 1.1;
      this.w.audio.play('hiss', this.c);
    } else this.fuse = Math.min(this.fuse, 0.2);
  }
  update(dt) {
    if (!this.alive || this.fuse < 0) return;
    this.fuse -= dt;
    this.w.fx.puff(new THREE.Vector3(this.pos.x, 1.3, this.pos.z), 0xe0e8e8, 0.25, 0.5, 0.5, 1.5);
    this.group.position.x = this.pos.x + (Math.random() - 0.5) * 0.03;
    if (this.fuse <= 0) this.explode();
  }
  explode() {
    if (!this.alive) return;
    this.alive = false;
    this.group.visible = false;
    this.w.explosion(this.c.clone(), 6.5, 120);
  }
}

export { UP };
