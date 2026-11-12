// The people: Dr Okafor, a survivor who follows you, and the Sweep, the soldiers who come down in the freight lift.
//   Okafor  — knows the creatures and says what she sees. She does what you do: crouch and she crouches, run and she
//             runs. She whimpers when a Skitter hunts near her, and they hear it. E tells her to wait or follow.
//             Skitters don't kill her: they knock her down and drag her to the crystals. Bullets do kill her.
//   Soldier — sees, where the Skitters hear. A red laser settles on what it is about to shoot. It shoots anything
//             from the Fold, and anyone from Sublevel C. Its gunfire is the loudest thing in the bay, and the Skitters
//             go for it.
import * as THREE from 'three';
import { Creature, angleTo } from './creatures.mjs';

import { makeHuman, bendKnees, poseRifle } from './models.mjs';
export { makeHuman };

/** Lie the figure down on its back (feet at the origin, head towards -z). */
function lie(h, k) {
  h.body.rotation.x = -Math.PI / 2 * k;
  h.body.position.y = 0.13 * k;
}

const v3 = () => new THREE.Vector3();

export class Okafor extends Creature {
  constructor(world, x, z, yaw) {
    super(world, x, z);
    this.kind = 'okafor';
    this.human = true;
    this.hp = 60;
    this.r = 0.3;
    this.yaw = yaw;
    this.crouched = true;
    this.said = new Set();
    this.whimperT = 1;
    this.stepAcc = 0;
    this.walk = 0;
    this.lastOuch = -9;
    this.lastWarn = -9;
    this.downT = 0;
    this.dragger = null;
    this.fate = null;
    this.h = makeHuman({ shirt: 0x5a4a6a, pants: 0x262830, skin: 0x5e3b26, hair: 0x0e0b08, coat: true, glasses: true, badge: true });
    this.group.add(this.h.g);
    this.skin = this.h.mats;
    this._eye = v3();
    this.setState('hide');
  }
  get down() {
    return ['down', 'dragged', 'planted', 'dead'].includes(this.state);
  }
  get standing() {
    return this.alive && !this.down;
  }
  get following() {
    return this.state === 'follow';
  }
  eye() {
    return this._eye.set(this.pos.x, this.pos.y + (this.crouched ? 1.0 : 1.55), this.pos.z);
  }
  zones() {
    this.zz ??= [{ name: 'body', c: v3(), r: 0.32 }, { name: 'head', c: v3(), r: 0.15 }];
    if (this.down) {
      const f = this.fwd();
      this.zz[0].c.set(this.pos.x - f.x * 0.8, 0.2, this.pos.z - f.z * 0.8);
      this.zz[1].c.set(this.pos.x - f.x * 1.6, 0.15, this.pos.z - f.z * 1.6);
    } else {
      this.zz[0].c.set(this.pos.x, this.crouched ? 0.75 : 1.15, this.pos.z);
      this.zz[1].c.copy(this.eye()).setY(this.eye().y + 0.1);
    }
    return this.zz;
  }
  /** Say a line once (by id). Returns true when it was said. */
  line(id, text, force = false) {
    if (this.said.has(id) || !this.alive || this.down) return false;
    // one thing at a time: a line that would talk over the last one waits its turn
    if (!force && this.w.time - (this.w.lastLineT ?? -9) < 5) return false;
    this.w.lastLineT = this.w.time;
    this.said.add(id);
    this.w.say(text, 'okafor');
    return true;
  }
  shout(text, cd = 5) {
    if (this.w.time - this.lastWarn < cd || !this.standing) return;
    this.lastWarn = this.w.time;
    this.w.say(text, 'okafor', true);
  }
  hurt(d, from, kind = 'bite') {
    if (!this.standing) return;
    this.hp -= d;
    this.hitFlash();
    this.w.fx.blood(this.zones()[0].c, 0x7a0a0a, 8, 2);
    this.w.audio.play('oof', this.zones()[0].c, 0.9);
    if (this.hp <= 0) {
      if (kind === 'bullet') this.die('shot');
      else this.goDown();
      return;
    }
    if (this.w.time - this.lastOuch > 3) {
      this.lastOuch = this.w.time;
      this.shout(['Help me!', 'Get it off!', "It's on me!"][Math.floor(Math.random() * 3)], 2);
    }
  }
  knock(vx, vy, vz) {
    this.w.level.moveCircle(this.pos, vx * 0.08, vz * 0.08, this.r);
  }
  damage(n, zone, from, kind, shooter) {
    if (!this.standing) return 'none';
    const byPlayer = !shooter;
    this.hurt(zone === 'head' ? n * 2 : n, from, kind === 'melee' ? 'melee' : 'bullet');
    if (byPlayer && this.alive) this.shout("Stop! It's me!", 3);
    if (byPlayer && !this.alive) this.fate = 'shot by you';
    return 'flesh';
  }
  goDown() {
    this.hp = 0;
    this.setState('down');
    this.downT = 0;
    this.crouched = false;
    this.w.say('No! No, get off me!', 'okafor', true);
    this.w.noise(this.pos.x, this.pos.z, 12, 'okafor', this);
    this.w.onOkaforDown?.();
  }
  getUp() {
    this.hp = 25;
    this.setState(this.lastMode ?? 'follow');
    this.dragger = null;
    this.w.lastLineT = this.w.time;
    this.w.say('They were dragging me to the crystals. Alive. They wanted me alive.', 'okafor', true);
    this.w.observe('skitter-drag');
  }
  die(how) {
    this.alive = false;
    this.fate ??= how === 'shot' ? 'shot by the Sweep' : how;
    this.setState('dead');
    this.w.onOkaforDead?.(this);
  }
  plant() {
    this.setState('planted');
    this.alive = false;
    this.fate = 'taken to the crystals';
    this.growT = 0;
    // crystals push up through her
    const mat = std({ color: 0x1a6a66, emissive: 0x2ef0d8, emissiveIntensity: 0.9, roughness: 0.15, transparent: true, opacity: 0.92 });
    this.crystalMat = mat;
    this.shards = new THREE.Group();
    const geo = new THREE.OctahedronGeometry(1, 0);
    for (let k = 0; k < 8; k++) {
      const m = new THREE.Mesh(geo, mat);
      const h = 0.25 + Math.random() * 0.45;
      m.scale.set(0.06 + Math.random() * 0.06, h, 0.06 + Math.random() * 0.06);
      m.position.set((Math.random() - 0.5) * 0.4, h * 0.6, -0.4 - Math.random() * 1.0);
      m.rotation.set((Math.random() - 0.5) * 0.8, Math.random() * 3, (Math.random() - 0.5) * 0.8);
      this.shards.add(m);
    }
    this.shards.scale.setScalar(0.01);
    this.group.add(this.shards);
    this.w.onOkaforPlanted?.(this);
  }
  /** Is a Skitter hunting close by? */
  threat(range) {
    let best = null, bd = range;
    for (const c of this.w.creatures) {
      if (!c.alive || c.kind !== 'skitter' || !['hunt', 'windup', 'leap', 'investigate'].includes(c.state)) continue;
      const d = this.distTo(c.pos);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }
  inLight() {
    return this.w.fearLights().some((L) => Math.hypot(this.pos.x - L.x, this.pos.z - L.z) < L.r);
  }
  update(dt) {
    const w = this.w, P = w.player;
    this.stateT += dt;
    this.updateFlash(dt);
    let speed = 0;
    switch (this.state) {
      case 'hide': {
        this.crouched = true;
        const d = this.distTo(P.pos);
        if (P.alive && d < 8 && w.level.roomAt(P.pos.x, P.pos.z) === 'sec' && w.level.los(P.eye(), this.eye())) {
          this.faceTo(P.pos.x, P.pos.z, 3, dt);
          if (this.stateT > 0.6) {
            this.line('greet', P.has.smg ? "Don't shoot! I'm human. Okafor, specimen care. Please, get me out of here." : "Don't shoot! I'm human. Okafor, specimen care. The guard's gun is on the desk. Take it.");
            this.setState('wait');
            this.lastMode = 'wait';
          }
        } else this.stateT = 0;
        break;
      }
      case 'wait': {
        if (P.alive && this.distTo(P.pos) < 9) this.faceTo(P.pos.x, P.pos.z, 2, dt);
        break;
      }
      case 'follow': {
        this.crouched = P.crouch;
        const d = this.distTo(P.pos);
        const f = P.forward();
        const fl = Math.hypot(f.x, f.z) || 1;
        const goal = { x: P.pos.x - (f.x / fl) * 2.0, z: P.pos.z - (f.z / fl) * 2.0 };
        const scared = this.threat(4);
        if (d > 2.5 || scared) {
          speed = scared ? 4.6 : d > 7 ? 4.6 : P.crouch ? 1.9 : 3.6;
          const tgt = scared && d < 2.5 ? { x: P.pos.x + (P.pos.x - scared.pos.x), z: P.pos.z + (P.pos.z - scared.pos.z) } : goal;
          const s = w.level.steer(this.pos, tgt, this.r);
          if (s.dist > 0.5) {
            w.level.moveCircle(this.pos, s.x * speed * dt, s.z * speed * dt, this.r);
            this.faceTo(this.pos.x + s.x, this.pos.z + s.z, 6, dt);
          } else speed = 0;
        } else this.faceTo(this.pos.x + f.x, this.pos.z + f.z, 2, dt);
        break;
      }
      case 'down': {
        this.downT += dt;
        if (this.downT > 3 && Math.floor(this.downT / 3) !== Math.floor((this.downT - dt) / 3)) {
          w.audio.play('oof', this.zones()[0].c, 0.7);
          w.noise(this.pos.x, this.pos.z, 9, 'okafor', this);
        }
        const near = w.creatures.some((c) => c.alive && c.kind === 'skitter' && this.distTo(c.pos) < 6 && !c.scared);
        if (near) this.calmT = 0;
        else this.calmT = (this.calmT ?? 0) + dt;
        if (this.calmT > 3.5) this.getUp();
        break;
      }
      case 'dragged': {
        const s = this.dragger;
        if (!s || !s.alive || s.state !== 'drag' || s.dragging !== this) {
          this.dragger = null;
          this.setState('down');
          this.downT = 0;
          this.calmT = 0;
          break;
        }
        const f = s.fwd();
        this.pos.set(s.pos.x - f.x * 0.55, 0, s.pos.z - f.z * 0.55);
        this.yaw = s.yaw + Math.PI;
        if (Math.floor(this.stateT / 2.4) !== Math.floor((this.stateT - dt) / 2.4)) w.say(['Help me!', 'Please!', 'No, no, no…'][Math.floor(Math.random() * 3)], 'okafor', true);
        break;
      }
      case 'planted': {
        this.growT += dt;
        this.shards.scale.setScalar(Math.min(1, 0.01 + this.growT / 3));
        this.crystalMat.emissiveIntensity = 0.9 * (w.crystalPulse ?? 1);
        break;
      }
    }
    // fear: a Skitter hunting close by makes her whimper, and that is a sound
    if (this.standing) {
      const t = this.threat(8);
      if (t && !this.inLight()) {
        this.whimperT -= dt;
        if (this.whimperT <= 0) {
          this.whimperT = 2.2 + Math.random() * 1.5;
          w.audio.play('whimper', this.eye(), this.crouched ? 0.5 : 0.9);
          w.noise(this.pos.x, this.pos.z, this.crouched ? 4 : 9, 'okafor', this);
        }
      } else this.whimperT = Math.min(this.whimperT, 1);
    }
    // footsteps
    if (speed > 0.5 && !this.crouched) {
      this.stepAcc += speed * dt;
      if (this.stepAcc > 1.4) {
        this.stepAcc = 0;
        w.audio.play('step', this.pos, 0.45);
        w.noise(this.pos.x, this.pos.z, speed > 4 ? 11 : 6, 'okafor', this);
      }
    }
    this.animate(dt, speed);
  }
  animate(dt, speed) {
    const h = this.h;
    this.walk += dt * speed * 2.6;
    const k = Math.min(1, speed / 3);
    if (this.down) {
      lie(h, 1);
      for (const L of h.legs) L.rotation.x = 0;
      h.arms[0].rotation.set(this.state === 'dragged' ? -2.8 : -0.3, 0, -0.3);
      h.arms[1].rotation.set(this.state === 'dragged' ? -2.6 : -0.2, 0, 0.4);
      for (const e of h.elbows) e.rotation.set(-0.2, 0, 0);
      for (const kn of h.knees) kn.rotation.x = this.state === 'dragged' ? 0.1 : 0.35;
    } else {
      lie(h, 0);
      const cr = this.crouched ? 1 : 0;
      h.body.position.y = -0.36 * cr;
      h.legs[0].rotation.x = Math.sin(this.walk) * 0.6 * k - 1.1 * cr;
      h.legs[1].rotation.x = -Math.sin(this.walk) * 0.6 * k - 0.9 * cr;
      const scared = this.state === 'hide' || this.threat(6);
      // scared, she pulls her hands up to her face; walking, her arms swing and bend a little
      h.arms[0].rotation.set(scared ? -1.0 : -Math.sin(this.walk) * 0.5 * k, 0, scared ? 0.45 : -0.08);
      h.arms[1].rotation.set(scared ? -0.95 : Math.sin(this.walk) * 0.5 * k, 0, scared ? -0.45 : 0.08);
      h.elbows[0].rotation.set(scared ? -1.9 : -0.25 - Math.max(0, Math.sin(this.walk)) * 0.4 * k, 0, 0);
      h.elbows[1].rotation.set(scared ? -1.8 : -0.25 - Math.max(0, -Math.sin(this.walk)) * 0.4 * k, 0, 0);
      bendKnees(h, cr);
      h.head.rotation.x = scared ? 0.25 : 0;
    }
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;
  }
}

// ---------------------------------------------------------------------------------------------------------------
const BARKS = {
  arrive: 'Sweep on the floor. Spread out.',
  player: ['Contact. Civilian, armed. Drop them.', 'Scientist! Weapons free.', 'There! Take them down.'],
  okafor: ['Civilian, unarmed.', 'No witnesses. Drop her.'],
  skitter: ['Contact! Small ones!', 'Movement, low!', 'Light them up!'],
  bulwark: ["Big one! Rounds aren't going in!", 'Armour on the front. Flank it!'],
  tender: ['The tall one. Burn it.', "What is that? Shoot it!"],
  down: ['Man down!', "They're in the vents!", "We've lost one!"],
  bitten: ["Get it off me!", "They're on me!"]
};
const pick = (a) => (Array.isArray(a) ? a[Math.floor(Math.random() * a.length)] : a);

export class Soldier extends Creature {
  constructor(world, x, z, post) {
    super(world, x, z);
    this.kind = 'soldier';
    this.human = true;
    this.standing = true;
    this.hp = 70;
    this.r = 0.32;
    this.yaw = 0;
    this.post = post;
    this.aw = new Map();
    this.seen = new Map();
    this.target = null;
    this.perceiveT = Math.random() * 0.1;
    this.shotT = 0;
    this.burstN = 0;
    this.cd = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1.5;
    this.walk = 0;
    this.stepAcc = 0;
    this.spotted = new Set();
    this.h = makeHuman({ shirt: 0x2a2d30, pants: 0x25282b, skin: 0x8a6a58, soldier: true });
    this.group.add(this.h.g);
    this.skin = this.h.mats;
    this._eye = v3();
    this._m = v3();
    // the laser sight: a thin red line from the muzzle to whatever it is aimed at
    const lg = new THREE.BoxGeometry(0.008, 0.008, 1);
    lg.translate(0, 0, 0.5);
    this.laser = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.laser.visible = false;
    world.scene.add(this.laser);
    this.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: world.T.glow, color: 0xff3020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.dot.scale.setScalar(0.12);
    this.dot.visible = false;
    world.scene.add(this.dot);
    this.setState('exit');
  }
  eye() {
    return this._eye.set(this.pos.x, 1.62, this.pos.z);
  }
  zones() {
    this.zz ??= [{ name: 'body', c: v3(), r: 0.34 }, { name: 'head', c: v3(), r: 0.16 }];
    if (!this.alive) {
      const f = this.fwd();
      this.zz[0].c.set(this.pos.x - f.x * 0.8, 0.2, this.pos.z - f.z * 0.8);
      this.zz[1].c.set(this.pos.x - f.x * 1.6, 0.15, this.pos.z - f.z * 1.6);
    } else {
      this.zz[0].c.set(this.pos.x, 1.15, this.pos.z);
      this.zz[1].c.set(this.pos.x, 1.68, this.pos.z);
    }
    return this.zz;
  }
  muzzlePos() {
    this.h.g.updateMatrixWorld(true);
    return this.h.muzzle.getWorldPosition(this._m);
  }
  bark(key) {
    this.w.say(pick(BARKS[key]), 'sweep', true);
  }
  hurt(d, from) {
    this.damage(d, 'body', from, 'bite', 'fold');
    if (this.alive && Math.random() < 0.3) this.bark('bitten');
  }
  /** It hears your footsteps too, and turns to look. */
  hear(n, d) {
    if (!this.alive || !n.actor || n.actor.kind === 'soldier') return;
    const a = this.aw.get(n.actor) ?? 0;
    this.aw.set(n.actor, Math.min(0.95, a + (d < 8 ? 0.35 : 0.15)));
    if (this.state === 'hold' || this.state === 'return') {
      this.searchAt = { x: n.x, z: n.z };
      this.setState('search');
    }
  }
  knock(vx, vy, vz) {
    if (this.alive) this.w.level.moveCircle(this.pos, vx * 0.1, vz * 0.1, this.r);
  }
  damage(n, zone, from, kind, shooter) {
    if (!this.alive) return 'none';
    const w = this.w;
    this.lastHitBy = shooter === 'fold' ? 'fold' : kind === 'blast' ? 'blast' : shooter ? 'sweep' : 'player';
    this.hp -= zone === 'head' ? n * 2.5 : n;
    this.hitFlash();
    w.fx.blood(this.zones()[zone === 'head' ? 1 : 0].c, 0x7a0a0a, 8, 2);
    // the player hurt it: it knows exactly where they are
    if (!shooter && (kind === 'bullet' || kind === 'melee')) {
      this.aw.set(w.player, 1.5);
      this.seen.set(w.player, { t: w.time, x: w.player.pos.x, z: w.player.pos.z });
      if (this.state === 'hold' || this.state === 'search' || this.state === 'exit') this.setState('aim');
      this.target = w.player;
    }
    if (this.hp <= 0) this.die();
    return 'flesh';
  }
  die() {
    const w = this.w;
    this.alive = false;
    this.standing = false;
    this.setState('dead');
    this.laser.visible = this.dot.visible = false;
    w.audio.play('oof', this.zones()[0].c, 1.1);
    w.onSoldierDown?.(this);
  }
  remove() {
    super.remove();
    this.w.scene.remove(this.laser);
    this.w.scene.remove(this.dot);
  }
  candidates() {
    const w = this.w, out = [];
    if (w.player.alive) out.push(w.player);
    for (const c of w.creatures) {
      if (!c.alive || c === this || c.kind === 'soldier') continue;
      if (c.kind === 'okafor' && !c.standing) continue;
      out.push(c);
    }
    return out;
  }
  aimPoint(c, out = v3()) {
    if (c === this.w.player) return out.copy(c.eye()).setY(c.eye().y - 0.35);
    return out.copy(c.zones()[0].c);
  }
  perceive(step) {
    const w = this.w, P = w.player, eye = this.eye();
    const tp = v3();
    for (const c of this.candidates()) {
      this.aimPoint(c, tp);
      const dx = tp.x - eye.x, dz = tp.z - eye.z, d = Math.hypot(dx, dz);
      let a = this.aw.get(c) ?? 0;
      const off = Math.abs(angleTo(this.yaw, Math.atan2(dx, dz)));
      const visible = d < 42 && (off < 1.15 || d < 5) && w.level.los(eye, tp);
      if (visible) {
        let rate;
        if (c === P) {
          const lit = w.playerLit();
          rate = 1.5 * (0.3 + lit) * (P.crouch ? 0.45 : 1) * (P.moving > 2 ? 1.4 : 1) * (w.time - (P.lastShot ?? -9) < 1 ? 3 : 1);
        } else if (c.kind === 'okafor') rate = 1.6 * (c.crouched ? 0.5 : 1);
        else rate = c.kind === 'skitter' ? 3.5 : 3;
        rate *= Math.max(0.15, 1 - d / 45);
        a = Math.min(1.5, a + rate * step);
        this.seen.set(c, { t: w.time, x: c.pos.x, z: c.pos.z });
      } else a = Math.max(0, a - 0.12 * step);
      this.aw.set(c, a);
    }
  }
  pickTarget() {
    const w = this.w;
    let best = null, bs = Infinity;
    for (const c of this.candidates()) {
      if ((this.aw.get(c) ?? 0) < 1) continue;
      const s = this.seen.get(c);
      if (!s || w.time - s.t > 0.4) continue;
      const d = this.distTo(c.pos);
      let score = d;
      if (c.kind === 'skitter' && d < 6) score -= 12;
      if (c.kind === 'bulwark' && ['charge', 'windup'].includes(c.state)) score -= 8;
      if (c === this.target) score -= 3;
      if (score < bs) {
        bs = score;
        best = c;
      }
    }
    return best;
  }
  spot(c) {
    const key = c === this.w.player ? 'player' : c.kind;
    if (this.spotted.has(key)) return;
    this.spotted.add(key);
    if (this.w.time - (this.w.lastSpotBark ?? -9) > 4) {
      this.w.lastSpotBark = this.w.time;
      this.bark(key);
    }
    if (key === 'okafor') this.w.observe('sweep-orders');
  }
  /** Stay in the bay and the lift. */
  allowed(x, z) {
    const r = this.w.level.roomAt(x, z);
    return r === 'bay' || r === 'lift' || r === 'door';
  }
  walkTo(dx, dz, speed, dt) {
    const before = this.pos.clone();
    this.w.level.moveCircle(this.pos, dx * speed * dt, dz * speed * dt, this.r);
    if (!this.allowed(this.pos.x, this.pos.z)) this.pos.copy(before);
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    if (moved > 0.6) {
      this.stepAcc += moved * dt;
      if (this.stepAcc > 1.5) {
        this.stepAcc = 0;
        this.w.audio.play('step', this.pos, 0.6);
        this.w.noise(this.pos.x, this.pos.z, 6, 'soldier', this);
      }
    }
    return moved;
  }
  update(dt) {
    const w = this.w;
    this.stateT += dt;
    this.cd -= dt;
    this.updateFlash(dt);
    if (!this.alive) {
      const k = Math.min(1, this.stateT * 2.5);
      lie(this.h, k);
      this.group.position.set(this.pos.x, 0, this.pos.z);
      return;
    }
    this.perceiveT -= dt;
    if (this.perceiveT <= 0) {
      this.perceiveT = 0.1;
      this.perceive(0.1);
    }
    const allow = (c) => c.room === 'bay' || c.room === 'lift' || c.room === 'door';
    let speed = 0;
    const tgt = this.target && (this.target.alive ?? true) && this.target.standing !== false ? this.target : null;
    if (!tgt) this.target = null;
    const fresh = this.pickTarget();
    switch (this.state) {
      case 'exit':
      case 'return': {
        if (fresh) {
          this.target = fresh;
          this.spot(fresh);
          this.setState('aim');
          break;
        }
        const s = w.level.steer(this.pos, this.post, this.r, 'sweep', allow);
        if (s.dist > 0.5) {
          speed = this.walkTo(s.x, s.z, 2.8, dt);
          this.faceTo(this.pos.x + s.x, this.pos.z + s.z, 5, dt);
        } else this.setState('hold');
        break;
      }
      case 'hold': {
        if (fresh) {
          this.target = fresh;
          this.spot(fresh);
          this.setState('aim');
          break;
        }
        // scan the bay
        const look = this.post.yaw + Math.sin(this.stateT * 0.5 + this.seq) * 0.7;
        this.yaw += angleTo(this.yaw, look) * Math.min(1, dt * 1.5);
        break;
      }
      case 'aim':
      case 'burst':
      case 'recover': {
        if (fresh && fresh !== this.target && (fresh.kind === 'skitter' || this.state === 'recover')) {
          this.target = fresh;
          this.spot(fresh);
          this.setState('aim');
        }
        const T = this.target;
        if (!T || !(T.alive ?? true) || T.standing === false) {
          this.target = null;
          this.setState(fresh ? 'aim' : 'return');
          if (fresh) this.target = fresh;
          break;
        }
        const seen = this.seen.get(T);
        if (!seen || w.time - seen.t > 1.2) {
          this.setState('search');
          this.searchAt = seen ? { x: seen.x, z: seen.z } : null;
          break;
        }
        const tp = this.aimPoint(T);
        const off = this.faceTo(tp.x, tp.z, 5, dt);
        // keep moving: back off from anything close, else sidestep
        let near = null;
        for (const c of w.creatures) if (c.alive && c.kind === 'skitter' && this.distTo(c.pos) < 3.2) near = c;
        if (near) {
          const dx = this.pos.x - near.pos.x, dz = this.pos.z - near.pos.z, d = Math.hypot(dx, dz) || 1;
          speed = this.walkTo(dx / d, dz / d, 2.4, dt);
        } else if (this.state !== 'aim') {
          this.strafeT -= dt;
          if (this.strafeT <= 0) {
            this.strafeT = 1.2 + Math.random() * 1.2;
            this.strafe *= -1;
          }
          const f = this.fwd();
          speed = this.walkTo(f.z * this.strafe, -f.x * this.strafe, 0.9, dt);
        }
        if (this.state === 'aim') {
          const settle = T === w.player || T.kind === 'okafor' ? 0.7 : 0.3;
          if (this.stateT > settle && off < 0.2) {
            this.setState('burst');
            this.burstN = 3 + Math.floor(Math.random() * 3);
            this.shotT = 0;
          }
        } else if (this.state === 'burst') {
          this.shotT -= dt;
          if (this.shotT <= 0 && this.burstN > 0) {
            this.shotT = 0.11;
            this.burstN--;
            this.fire(T);
          }
          if (this.burstN <= 0) {
            this.cd = 0.45 + Math.random() * 0.5;
            this.setState('recover');
          }
        } else if (this.cd <= 0) {
          this.setState('aim');
          this.stateT = 0.45; // a quicker re-aim
        }
        break;
      }
      case 'search': {
        if (fresh) {
          this.target = fresh;
          this.setState('aim');
          break;
        }
        if (!this.searchAt || this.stateT > 7) {
          this.setState('return');
          break;
        }
        const s = w.level.steer(this.pos, this.searchAt, this.r, 'sweep', allow);
        if (s.dist > 1) {
          speed = this.walkTo(s.x, s.z, 2.2, dt);
          this.faceTo(this.pos.x + s.x, this.pos.z + s.z, 4, dt);
        }
        break;
      }
    }
    this.updateLaser();
    // animate
    this.walk += dt * speed * 2.4;
    const k = Math.min(1, speed / 2.5);
    this.h.legs[0].rotation.x = Math.sin(this.walk) * 0.55 * k;
    this.h.legs[1].rotation.x = -Math.sin(this.walk) * 0.55 * k;
    bendKnees(this.h);
    this.h.lenses.emissiveIntensity = 2.0 + (this.state === 'burst' ? 0.8 : 0);
    // the rifle kicks back into the shoulder each shot, and the hands go with it
    this.kick = Math.max(0, (this.kick ?? 0) - dt * 14);
    this.h.rifle.position.z = 0.28 - this.kick * 0.05;
    this.h.rifle.rotation.x = -this.kick * 0.08;
    poseRifle(this.h);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.yaw;
  }
  updateLaser() {
    const on = ['aim', 'burst', 'recover'].includes(this.state) && this.target;
    this.laser.visible = this.dot.visible = !!on;
    if (!on) return;
    const m = this.muzzlePos();
    const tp = this.aimPoint(this.target);
    // while it aims, the laser swings onto the target; it is settled when the shooting starts
    const k = this.state === 'aim' ? Math.min(1, this.stateT / 0.6) : 1;
    const drift = (1 - k) * 1.2;
    tp.x += Math.sin(this.w.time * 7 + this.seq) * drift;
    tp.y += Math.cos(this.w.time * 5 + this.seq) * drift * 0.4;
    const dir = tp.clone().sub(m);
    let len = dir.length();
    dir.normalize();
    const hit = this.w.level.ray(m, dir, len);
    if (hit) len = hit.t;
    this.laser.position.copy(m);
    this.laser.lookAt(m.clone().add(dir));
    this.laser.scale.set(1, 1, len);
    this.dot.position.copy(m).addScaledVector(dir, len - 0.02);
  }
  fire(T) {
    const w = this.w, P = w.player;
    const m = this.muzzlePos().clone();
    const tp = this.aimPoint(T);
    const d = m.distanceTo(tp);
    let chance = 0.8 - d / 55;
    if (T === P) chance *= (P.moving > 3 ? 0.55 : 1) * (P.crouch ? 0.75 : 1) * 0.85;
    else if (T.kind === 'skitter') chance *= T.state === 'leap' ? 0.3 : 0.55; // small, low and fast
    chance = Math.max(0.1, Math.min(0.85, chance));
    const hitIt = Math.random() < chance;
    const dir = tp.clone().sub(m).normalize();
    if (!hitIt) {
      const right = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
      dir.addScaledVector(right, (Math.random() < 0.5 ? -1 : 1) * (0.04 + Math.random() * 0.06)).add(new THREE.Vector3(0, (Math.random() - 0.4) * 0.06, 0)).normalize();
    } else dir.add(new THREE.Vector3((Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.01)).normalize();
    w.audio.play('rifle', m);
    w.muzzleFlashAt(m, this.h.rifle);
    this.kick = 1;
    w.noise(this.pos.x, this.pos.z, 38, 'soldier', this);
    // the player is not in the world's hitscan; a shot at them is resolved here
    if (T === P && hitIt && w.level.los(m, tp)) {
      w.fx.tracer(m, tp);
      P.hurt(6, this.pos);
      w.audio.play('whizz', P.eye(), 0.8);
      return;
    }
    const hit = w.hitscan(m, dir, 120, this);
    const end = hit ? hit.p : m.clone().addScaledVector(dir, 120);
    w.fx.tracer(m, end);
    if (T === P && !hitIt) {
      // a near miss past your head is something you hear
      const e = P.eye(), t = dir.dot(e.clone().sub(m));
      if (t > 0 && m.clone().addScaledVector(dir, t).distanceTo(e) < 1.5) w.audio.play('whizz', e, 0.7);
    }
    if (hit) w.bulletHit(hit, dir, 12, this);
  }
}
