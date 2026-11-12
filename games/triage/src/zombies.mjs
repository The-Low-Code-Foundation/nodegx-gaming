// The infected: fast, human, broken. They stand or wander until they see or hear the officer, then sprint. Only a shot
// (or a blade, a bat) to the head kills one. A shot in the chest knocks them back a step. Shoot a leg and they limp;
// both legs and they go down and CRAWL after her on their arms, still biting; arms gone too and they lie there and
// wriggle and snap. An arm shot out hangs. Every hit leaves a wound where it landed. Some find a door with people
// behind it and hammer on it until it gives.
// Round 2 (playtest): "it took ages to actually get bitten" — they lunge now, closing the last metre as they bite, so a
// walking officer can't simply out-step every bite; "when both legs are disabled they fall down looking as dead as
// any other dead zombie, then you walk near them and get bitten" — they crawl, lift their heads at her, growl.
// Round 3 (playtest: "really punchy shooting"): every hit snaps the part it hit back (a spring on that bone, over
// whatever clip is playing), a puff of red; a headshot takes the head off in a burst (world.tune.gore) and a kill
// throws the body back along the shot.
// Round 4 (playtest: "Their movement is very basic as well, it would be nice to experiment with some more realistic
// character movements to mix things up a bit"; "an ability to hide … taking advantage of zombie stupidness, waiting …
// until they get confused and wander off"): each one is broken its own way, procedurally over the capture: a hunch, the
// head hanging to one side, a shoulder dropped, the neck jerking and the body spasming now and then, its pace surging
// and flagging, a weave as it runs, a stumble mid-sprint, both hands reaching for her as it closes, its head tracking
// hers. And they can lose her: one that cannot see her goes to where it last saw (or heard) her, not to where she is;
// there it SEARCHES (looks round, shuffles about the spot) and, finding nothing, gives up and wanders off. Hidden under a
// desk or a bed she is not seen; one standing over her slowly notices (faster if it saw her go under, much slower if she
// holds her breath).
import * as THREE from 'three';
import { Animator } from './people.mjs';
import { Face } from './face.mjs';
import { toCell, toWorld, findPath, sightClear, walkable } from './map.mjs';
import { slide, turnTo, angleDiff } from './move.mjs';
import { aimBone, reach } from './pose.mjs';

export const PARTS = {
  head: { bones: ['ls_head'], r: 0.14, lift: 0.1 },
  torso: { bones: ['ls_chest', 'ls_spine', 'ls_upperChest'], r: 0.23, lift: 0 },
  leftArm: { bones: ['ls_leftUpperArm', 'ls_leftLowerArm'], r: 0.09, lift: 0 },
  rightArm: { bones: ['ls_rightUpperArm', 'ls_rightLowerArm'], r: 0.09, lift: 0 },
  leftLeg: { bones: ['ls_leftUpperLeg', 'ls_leftLowerLeg'], r: 0.11, lift: 0 },
  rightLeg: { bones: ['ls_rightUpperLeg', 'ls_rightLowerLeg'], r: 0.11, lift: 0 }
};
const RADIUS = 0.33;
const REACH = 1.35; // a bite lands from here
const LUNGE = 2.1; // they start the lunge from here
const CHASE_SPEED = 4.4, LURCH_SPEED = 1.0, LIMP = 0.45, CRAWL_SPEED = 0.45;
const PRONE_LIFT = 0.12, PRONE_SHIFT = 0.85; // the body on the floor: chest down, hips over the group's origin
let nextId = 1;
const DOWN = new THREE.Vector3(0, -1, 0);
const UPV = new THREE.Vector3(0, 1, 0);
const fq = new THREE.Quaternion(), fq2 = new THREE.Quaternion(), fq3 = new THREE.Quaternion();
const tw = new THREE.Vector3(), tw2 = new THREE.Vector3();
// Turn a bone by `angle` about a WORLD axis, over whatever the clip did.
function turnWorld(bone, axis, angle) {
  if (!bone?.parent || !angle) return;
  bone.getWorldQuaternion(fq);
  bone.parent.getWorldQuaternion(fq2);
  fq3.setFromAxisAngle(axis, angle);
  bone.quaternion.copy(fq2.invert().multiply(fq3.multiply(fq)));
  bone.updateMatrixWorld(true);
}

export class Zombie {
  constructor(world, body, cell, { standing = false, crawler = false } = {}) {
    this.id = nextId++;
    this.world = world;
    this.body = body;
    this.group = new THREE.Group();
    this.group.add(body.outer);
    const { x, z } = toWorld(cell.x, cell.z);
    this.group.position.set(x, 0, z);
    this.yaw = Math.random() * Math.PI * 2;
    this.group.rotation.y = this.yaw;
    world.scene.add(this.group);
    this.anim = new Animator(body);
    this.face = new Face(body.outer);
    this.face.mood = 'angry';
    this.jaw = 0.8 + Math.random() * 0.2;
    const bone = (n) => body.outer.getObjectByName(n);
    this.bones = Object.fromEntries(Object.entries(PARTS).map(([p, d]) => [p, d.bones.map(bone).filter(Boolean)]));
    this.rig = {
      neck: bone('ls_neck'), head: bone('ls_head'), chest: bone('ls_chest'), spine: bone('ls_spine'),
      arm: { left: [bone('ls_leftUpperArm'), bone('ls_leftLowerArm'), bone('ls_leftHand')], right: [bone('ls_rightUpperArm'), bone('ls_rightLowerArm'), bone('ls_rightHand')] },
      leg: { left: [bone('ls_leftUpperLeg'), bone('ls_leftLowerLeg'), bone('ls_leftFoot')], right: [bone('ls_rightUpperLeg'), bone('ls_rightLowerLeg'), bone('ls_rightFoot')] }
    };
    this.limbs = { leftArm: true, rightArm: true, leftLeg: true, rightLeg: true };
    this.state = standing ? 'idle' : 'wander';
    this.alive = true;
    this.down = false;
    this.prone = 0; // 0 standing … 1 on the floor
    this.crawlPhase = Math.random() * 6;
    this.path = [];
    this.target = null;
    this.lastSeen = null;
    this.sightLost = 0;
    this.senseIn = Math.random() * 0.3;
    this.timer = 0;
    this.cooldown = 0;
    this.bangRoom = null;
    this.moanIn = 4 + Math.random() * 10;
    this.wounds = [];
    this.flinches = [];
    this.idleClip = this.pick(['sway', 'seethe', 'idle', 'rollHead', 'shakeArms', 'drunk2']);
    this.wanderClip = this.pick(['lurch', 'lurch2', 'stagger', 'walkSlow']);
    this.runClip = this.pick(['rush', 'jog', 'sprint', 'runFast2', 'rush']);
    // How this one is broken (round 4): the procedural layer over its clips.
    const sgn = () => (Math.random() < 0.5 ? -1 : 1);
    this.afflict = {
      hunch: 0.04 + Math.random() * 0.3,
      tilt: sgn() * (0.08 + Math.random() * 0.38),
      drop: sgn() * Math.random() * 0.22,
      reach: Math.random() < 0.7,
      // Its own speed: some slower, some terrible. Every one out-runs her walking (2.5 m/s) at its slowest; on average
      // she out-runs every one sprinting (5.6), and only just (round 1's "it took ages to get bitten").
      pace: 0.88 + Math.random() * 0.24,
      jerkIn: 1 + Math.random() * 4,
      stumbleIn: 2 + Math.random() * 5,
      seed: Math.random() * 100
    };
    this.notice = 0; // hidden from it: how close it is to finding her (1: found)
    this.playState();
    if (crawler) {
      this.limbs.leftLeg = this.limbs.rightLeg = false;
      this.goDown(true);
    }
  }

  pick(names) {
    const have = names.filter((n) => this.body.clips[n]);
    return have[Math.floor(Math.random() * have.length)] ?? 'Idle_Loop';
  }
  get pos() {
    return this.group.position;
  }
  get arms() {
    return (this.limbs.leftArm ? 1 : 0) + (this.limbs.rightArm ? 1 : 0);
  }
  // Where the mouth is (a crawler's head is a metre ahead of its hips).
  headPos(out = new THREE.Vector3()) {
    return this.rig.head ? this.rig.head.getWorldPosition(out) : out.copy(this.pos);
  }

  // Where each part is now, for the hit test.
  spheres() {
    if (!this.alive) return [];
    const out = [];
    for (const [part, d] of Object.entries(PARTS))
      for (const b of this.bones[part]) {
        const c = b.getWorldPosition(new THREE.Vector3());
        if (!this.prone) c.y += d.lift;
        out.push({ part, center: c, radius: d.r, zombie: this, bone: b });
      }
    return out;
  }

  playState() {
    const a = this.anim;
    if (!this.alive || this.down) return;
    switch (this.state) {
      case 'idle':
        a.play({ full: this.idleClip, fade: 0.4 });
        break;
      case 'wander':
      case 'investigate': {
        const clip = this.legFactor() < 1 ? this.pick(['lurch', 'stagger', 'lurch2']) : this.wanderClip;
        a.play({ full: clip, fade: 0.3, timeScale: this.scaleFor(clip, LURCH_SPEED * this.legFactor()) });
        break;
      }
      case 'chase': {
        const legs = this.legFactor();
        const clip = legs < 1 ? this.pick(['lurch', 'stagger', 'lurch2']) : this.runClip;
        a.play({ full: clip, fade: 0.2, timeScale: this.scaleFor(clip, CHASE_SPEED * legs) });
        break;
      }
      case 'bang':
        a.play({ full: this.body.clips.bang ? 'bang' : 'Punch_Cross', fade: 0.3 });
        break;
      default:
        break;
    }
  }

  scaleFor(clip, speed) {
    const s = this.anim.speedOf(clip) || 1;
    return Math.max(0.5, Math.min(2.2, speed / s));
  }
  legFactor() {
    const legs = (this.limbs.leftLeg ? 1 : 0) + (this.limbs.rightLeg ? 1 : 0);
    return legs === 2 ? 1 : legs === 1 ? LIMP : 0;
  }
  speed() {
    // A chase surges and flags.
    const surge = this.state === 'chase' ? 1 + 0.14 * Math.sin(this.world.time * 0.85 + this.afflict.seed) + 0.06 * Math.sin(this.world.time * 2.3 + this.afflict.seed * 2) : 1;
    return (this.state === 'chase' ? CHASE_SPEED : this.state === 'search' ? LURCH_SPEED * 0.8 : LURCH_SPEED) * this.legFactor() * this.afflict.pace * surge;
  }

  // A shot or a blow lands on `part`. `power` ≥ 2 knocks a standing one over for a while (a shotgun blast).
  // `at`: where it landed ({ point, bone, center } from the trace), for the wound.
  hit(part, dir, { power = 0.6, blade = false, at = null } = {}) {
    if (!this.alive) return { killed: false, part };
    const fx = this.world.fx;
    const where = at?.point ?? this.bones[part][0].getWorldPosition(new THREE.Vector3());
    if (at?.bone && this.wounds.length < 14) this.wounds.push(fx.wound(at.bone, at.center, at.point, part === 'head' ? 0.16 : part === 'torso' ? 0.15 : 0.1));
    if (part === 'head') {
      const gore = this.world.tune?.gore !== false && !blade;
      fx.blood(where, dir, gore ? 34 : 18, true);
      fx.mist?.(where, dir, gore ? 2.2 : 1.2);
      this.world.bloodBehind?.(where, dir, gore ? 1.3 : 0.9);
      // The head goes (the bone shrunk to nothing takes the skin, the hair and the wounds on it with it).
      if (gore && this.rig.head) this.rig.head.scale.setScalar(0.001);
      this.die(dir, power);
      this.world.audio?.play('headshot', this.pos);
      return { killed: true, part };
    }
    this.flinch(part, dir, power);
    fx.mist?.(where, dir, 0.8);
    fx.blood(where, dir, 8);
    this.world.bloodBehind?.(where, dir, 0.45);
    this.world.audio?.play('flesh', this.pos);
    if (part === 'torso') {
      if (power >= 2 && !this.down) this.knockdown(2.4);
      else if (!this.down) this.stagger(dir, power);
    } else {
      // A limb: out of action.
      if (this.limbs[part]) {
        this.limbs[part] = false;
        this.world.hud?.hint(`${part.replace(/([A-Z])/g, ' $1').toLowerCase()} disabled`);
      }
      if (!this.limbs.leftLeg && !this.limbs.rightLeg && !this.down) this.goDown();
      else if (!this.down) this.stagger(dir, power * 0.6);
      else if (!this.arms) this.world.hud?.hint('no limbs left: it can only bite');
    }
    // Whatever hit it, it knows where she is now (a quiet kill never gets here: the head is above).
    if (!this.dummy) this.alert(this.world.player.pos, true);
    return { killed: false, part };
  }

  stagger(dir, power) {
    if (this.down) return;
    this.state = 'stagger';
    this.timer = 0.45 + power * 0.1;
    this.knock = dir.clone().setY(0).normalize().multiplyScalar(power * 0.9);
    this.anim.play({ full: 'Hit_Chest', once: true, fade: 0.08, then: () => this.resume() });
  }

  // Blown off their feet, up again after `secs`.
  knockdown(secs) {
    this.state = 'floored';
    this.timer = secs;
    this.anim.play({ full: 'Death01', once: true, fade: 0.1 });
    this.world.audio?.play('fall', this.pos);
  }

  // Both legs gone: it pitches forward onto its chest and from then on crawls on its arms.
  goDown(already = false) {
    this.down = true;
    this.state = 'down';
    this.prone = already ? 1 : 0.001;
    this.fallV = 0;
    this.path = [];
    this.replan = 0;
    // The base pose under the procedural arms and head: standing still, legs straight.
    this.anim.play({ full: this.body.clips.Idle_Loop ? 'Idle_Loop' : this.idleClip, fade: 0.25 });
    if (!already) {
      this.world.audio?.play('fall', this.pos);
      this.world.hud?.hint('legs gone: it crawls');
    }
  }

  // A hit rocks the part it lands on: a spring on its bone (and the spine under a chest or head hit), kicked away from
  // the shot, settling in a third of a second.
  flinch(part, dir, power = 0.6) {
    const r = this.rig;
    const bone = { head: r.neck ?? r.head, torso: r.chest, leftArm: r.arm.left[0], rightArm: r.arm.right[0], leftLeg: r.leg.left[0], rightLeg: r.leg.right[0] }[part];
    if (!bone) return;
    const flat = dir.clone().setY(0);
    if (flat.lengthSq() < 1e-6) return;
    const axis = new THREE.Vector3().crossVectors(UPV, flat.normalize()).normalize();
    const k = 0.7 + Math.min(2, power) * 0.4;
    const v = { head: 11, torso: 7, leftArm: 9, rightArm: 9, leftLeg: 5, rightLeg: 5 }[part] * k;
    this.flinches.push({ bone, axis, a: 0, v });
    if ((part === 'torso' || part === 'head') && r.spine) this.flinches.push({ bone: r.spine, axis, a: 0, v: v * 0.45 });
    if (this.flinches.length > 8) this.flinches.splice(0, this.flinches.length - 8);
  }

  die(dir = null, power = 0.6) {
    // Thrown back along the shot as it drops.
    if (dir && !this.prone) this.deathPush = dir.clone().setY(0).normalize().multiplyScalar(1.6 + Math.min(2.5, power) * 0.8);
    this.alive = false;
    this.state = 'dead';
    this.world.score.kills++;
    this.world.audio?.play('zdeath', this.pos);
    // A crawler dies where it lies, as it lies; a standing one falls.
    if (!this.prone) this.anim.play({ full: 'Death01', once: true, fade: 0.08 });
    this.face.mood = 'blank';
    this.jaw = 0.25;
    const at = this.prone ? this.headPos() : this.pos;
    this.world.fx.decal(at.x, at.z, 0.6);
    if (this.bangRoom) this.bangRoom.banging = Math.max(0, (this.bangRoom.banging ?? 1) - 1);
    this.bangRoom = null;
  }

  resume() {
    if (!this.alive || this.down) return;
    this.state = this.dummy ? 'idle' : this.target ? 'chase' : this.lastSeen ? 'investigate' : 'wander';
    this.playState();
  }

  // It has lost her: to the spot, and look round it.
  search(secs = null) {
    if (!this.alive || this.down) return;
    this.state = 'search';
    this.timer = secs ?? 6 + Math.random() * 5;
    this.searchAt = this.lastSeen ? { ...this.lastSeen } : { x: this.pos.x, z: this.pos.z };
    this.path = [];
    this.lookIn = 0.6 + Math.random();
    this.anim.play({ full: this.body.clips.lookAround ? 'lookAround' : this.idleClip, fade: 0.35 });
  }
  // Tripped mid-sprint: pitched forward, arms out, still going; it catches itself.
  stumble() {
    this.state = 'stumble';
    this.timer = 0.55 + Math.random() * 0.35;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.knock = fwd.clone().multiplyScalar(this.speed() * 0.9);
    this.flinch('torso', fwd, 2.6);
    this.flinch('head', fwd, 1.4);
    // The legs stutter: the clip slows while it is off balance.
    const a = this.anim.layers.full?.action;
    if (a) ((this.stumbleTS = a.timeScale), (a.timeScale *= 0.55));
    this.world.audio?.play('fall', this.pos, { gain: 0.35 });
  }

  // Something to go and look at (a noise), or someone seen (`seen`).
  alert(point, seen) {
    if (!this.alive || this.state === 'floored') return;
    if (this.down) {
      if (seen && !this.target) this.world.audio?.play('snarl', this.pos);
      if (seen) this.target = this.world.player;
      this.lastSeen = { x: point.x, z: point.z };
      return;
    }
    // Mid-bite, reeling, getting up: it already has her; seeing her again must not cancel what it is doing. (Round 1's
    // "it took ages to get bitten": the quarter-second look put every attack straight back into the chase.)
    if (['attack', 'stagger', 'rising', 'stumble'].includes(this.state)) {
      if (seen) this.target = this.world.player;
      return;
    }
    if (seen) ((this.lostHer = false), (this.lastSeen = { x: point.x, z: point.z }));
    if (seen) {
      if (this.state !== 'chase') {
        this.world.audio?.play('snarl', this.pos);
        this.state = 'chase';
        this.target = this.world.player;
        this.sightLost = 0;
        this.path = [];
        this.replan = 0;
        this.playState();
      }
    } else if (this.state === 'chase') {
      // Chasing blind: a noise tells it where she went.
      this.lastSeen = { x: point.x, z: point.z };
    } else {
      this.lastSeen = { x: point.x, z: point.z };
      if (this.state !== 'investigate') {
        this.state = 'investigate';
        this.path = null;
        this.playState();
      } else this.path = null;
    }
    if (this.bangRoom) (this.bangRoom.banging = Math.max(0, (this.bangRoom.banging ?? 1) - 1)), (this.bangRoom = null);
  }

  // Can it see her right now? (Eyes in its head; a crawler's are low, so cover hides her from it too.)
  sees(p) {
    // Under a desk or a bed she is not seen (one standing over her notices her slowly: update()).
    if (p.hidden) return false;
    const eye = this.prone ? this.headPos() : this.pos;
    const dx = p.pos.x - eye.x, dz = p.pos.z - eye.z;
    const dist = Math.hypot(dx, dz);
    const stealth = 1 - this.world.skills.stealth;
    let range = (p.crouched ? 7 : 14) * stealth;
    if (p.torchOn) range *= 1.35;
    const facing = Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz)));
    const inView = facing < (this.state === 'chase' || this.target ? 2.8 : this.state === 'search' ? 2.2 : 1.15);
    return dist < range && inView && sightClear(this.world.grid, eye.x, eye.z, p.pos.x, p.pos.z, { lowCover: p.crouched || this.prone > 0.5 });
  }

  // Eyes and ears: every quarter second.
  sense() {
    const p = this.world.player;
    if (!p.alive) return;
    const dist = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    this.seesNow = this.sees(p);
    if (this.seesNow) {
      this.lastSeen = { x: p.pos.x, z: p.pos.z };
      this.sightLost = 0;
      if (this.state !== 'chase') this.alert(p.pos, true);
    } else if (this.state === 'chase' || (this.down && this.target)) {
      this.sightLost += 0.25;
      // It runs on to where it last saw her (chase); there, or after a while blind, it searches.
      if (this.sightLost > 6) {
        this.target = null;
        if (!this.down) this.search();
      }
    }
    // Footsteps.
    const stealth = 1 - this.world.skills.stealth;
    const hear = (p.sprinting ? 7 : p.moving && !p.crouched ? 3 : 0) * stealth;
    // (Chasing blind, her footsteps tell it where she went: round 4.)
    if (dist < hear && p.moving) this.alert(p.pos, dist < 2.5);
  }

  // Walk the path; true when the end is reached.
  follow(dt, speed) {
    if (!this.path || !this.path.length) return true;
    const next = this.path[0];
    const { x, z } = toWorld(next.x, next.z);
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35) {
      this.path.shift();
      return this.path.length === 0;
    }
    this.yaw = turnTo(this.yaw, Math.atan2(dx, dz), dt * (this.down ? 2 : 6));
    // A crawler only moves the way it faces.
    const step = Math.min(d, speed * dt) * (this.down ? Math.max(0, Math.cos(angleDiff(this.yaw, Math.atan2(dx, dz)))) : 1);
    slide(this.world.grid, this.pos, (this.down ? Math.sin(this.yaw) : dx / d) * step, (this.down ? Math.cos(this.yaw) : dz / d) * step, RADIUS);
    return false;
  }

  planTo(cell) {
    const from = toCell(this.pos.x, this.pos.z);
    this.path = findPath(this.world.grid, from, cell) ?? [];
  }

  update(dt) {
    // A crawler that died stays exactly as it fell: no more clip.
    if (this.alive || !this.prone) this.anim.update(dt);
    this.face.talking = false;
    this.face.update(dt);
    // The jaw hangs: the talk channel held open; snapping when it's on the floor and she's near.
    const snap = this.down && this.alive && this.target ? 0.35 * Math.max(0, Math.sin(this.world.time * 9 + this.id)) : 0;
    for (const b of this.face.channels.talk ?? []) b.mesh.morphTargetInfluences[b.index] = Math.max(b.mesh.morphTargetInfluences[b.index], Math.min(1, this.jaw - snap));
    if (!this.dressed && this.world.time > 0.3) this.dress();
    if (!this.alive) {
      if (this.deathPush) {
        slide(this.world.grid, this.pos, this.deathPush.x * dt, this.deathPush.z * dt, RADIUS);
        this.deathPush.multiplyScalar(Math.exp(-dt * 5));
        if (this.deathPush.lengthSq() < 0.01) this.deathPush = null;
      }
      return;
    }
    this.cooldown -= dt;
    this.senseIn -= dt;
    // A sandbox target (`dummy`) stands and takes it.
    if (this.senseIn <= 0 && this.state !== 'floored' && !this.dummy) {
      this.senseIn = 0.25;
      this.sense();
    }
    // Now and then, a moan (the quiet ones give themselves away).
    this.moanIn -= dt;
    if (this.moanIn <= 0) {
      this.moanIn = 6 + Math.random() * 12;
      if (this.state !== 'chase') this.world.audio?.play('moan', this.pos);
    }
    const p = this.world.player;
    const toP = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
    const dist = toP.length();
    // She is hidden: standing over her, it slowly notices (fast if it saw her go under; slow if she holds her breath).
    if (p.hidden && !this.dummy && this.state !== 'floored') {
      const at = p.hidden.at;
      const eye = this.prone ? this.headPos() : this.pos;
      const d = Math.hypot(at.x - eye.x, at.z - eye.z);
      if (d < 1.7) {
        const rate = (this.sawHide ? 1.1 : 0.22) * (p.breathHeld ? 0.2 : 1) * (this.state === 'search' ? 1.5 : 1) * Math.min(1, (1.8 - d) / 0.8);
        this.notice += dt * rate;
        if (this.notice >= 1) {
          this.notice = 0;
          p.foundBy(this);
        }
      } else this.notice = Math.max(0, this.notice - dt * 0.25);
    } else this.notice = Math.max(0, this.notice - dt * 0.5);
    // The spasms: the neck jerks, the body twitches (more often when it has her).
    if (!this.down && this.state !== 'floored') {
      this.afflict.jerkIn -= dt;
      if (this.afflict.jerkIn <= 0) {
        const hot = this.state === 'chase' || this.state === 'attack';
        this.afflict.jerkIn = (hot ? 0.7 : 1.5) + Math.random() * (hot ? 2.5 : 5);
        const a = Math.random() * Math.PI * 2;
        const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        this.flinch(Math.random() < 0.7 ? 'head' : 'torso', dir, 0.5 + Math.random() * 1.1);
        if (Math.random() < 0.3) this.flinch(Math.random() < 0.5 ? 'leftArm' : 'rightArm', dir, 0.8);
      }
    }

    switch (this.state) {
      case 'idle':
        break;
      case 'wander':
        if (!this.path || !this.path.length) {
          this.timer -= dt;
          if (this.timer <= 0) this.pickWander();
          break;
        }
        if (this.follow(dt, this.speed())) {
          // Arrived. At a door with people behind it: hammer on it.
          if (this.wanderDoor && !this.wanderDoor.open && !this.wanderDoor.lost) {
            this.state = 'bang';
            this.bangRoom = this.wanderDoor;
            this.bangRoom.banging = (this.bangRoom.banging ?? 0) + 1;
            const { x, z } = toWorld(this.bangRoom.door.x, this.bangRoom.door.z);
            this.yaw = Math.atan2(x - this.pos.x, z - this.pos.z);
            this.world.hud?.alarm(this.bangRoom);
            this.world.audio?.play('bang', this.pos);
          } else this.timer = 1 + Math.random() * 3;
          this.wanderDoor = null;
          this.playState();
        }
        break;
      case 'bang': {
        const room = this.bangRoom;
        if (!room || room.open || room.lost) {
          this.bangRoom = null;
          this.state = 'wander';
          this.timer = 0.5;
          this.playState();
          break;
        }
        room.doorHp -= dt;
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = 1.1;
          this.world.audio?.play('bang', this.pos);
        }
        if (room.doorHp <= 0) {
          this.world.survivors.lose(room);
          this.bangRoom = null;
          this.state = 'wander';
          this.timer = 2;
          this.playState();
        }
        break;
      }
      case 'investigate':
        if (this.path === null && this.lastSeen) this.planTo(toCell(this.lastSeen.x, this.lastSeen.z));
        if (!this.path || this.follow(dt, this.speed())) {
          this.timer -= dt;
          if (this.path && this.path.length === 0 && this.timer <= -0.01) {
            // Look around the spot a moment, then back to wandering.
            this.search(2.5 + Math.random() * 2.5);
          }
          if (this.timer < -10) this.timer = 2;
        }
        break;
      case 'chase': {
        this.replan = (this.replan ?? 0) - dt;
        if (dist < LUNGE && this.cooldown <= 0 && p.alive && !p.hidden) {
          this.attack();
          break;
        }
        // Where it is running: her, if it can see her (or has only just lost her round a corner, 0.75 s); else where it
        // last saw or heard her. A hidden officer is never the goal.
        const blind = !this.seesNow && (this.sightLost > 0.75 || p.hidden);
        const goal = blind && this.lastSeen ? this.lastSeen : p.pos;
        const toG = new THREE.Vector3(goal.x - this.pos.x, 0, goal.z - this.pos.z);
        const gd = toG.length();
        if (blind && gd < 1.1) {
          this.search();
          break;
        }
        if (this.replan <= 0 || !this.path?.length) {
          this.replan = 0.4;
          const straight = gd < 6 && sightClear(this.world.grid, this.pos.x, this.pos.z, goal.x, goal.z);
          this.path = straight ? [toCell(goal.x, goal.z)] : findPath(this.world.grid, toCell(this.pos.x, this.pos.z), toCell(goal.x, goal.z)) ?? [];
          this.direct = straight;
        }
        // Now and then, flat out, it trips over its own feet.
        this.afflict.stumbleIn -= dt;
        if (this.afflict.stumbleIn <= 0) {
          this.afflict.stumbleIn = 3 + Math.random() * 7;
          if (gd > 3.5 && this.legFactor() === 1 && Math.random() < 0.45) {
            this.stumble();
            break;
          }
        }
        if (this.direct && gd > 0.05) {
          // A weave: never a straight line at her.
          const weave = Math.sin(this.world.time * 2.1 + this.afflict.seed) * 0.32 * Math.min(1, gd / 6);
          const dx = toG.x / gd + (toG.z / gd) * weave, dz = toG.z / gd - (toG.x / gd) * weave;
          const dl = Math.hypot(dx, dz);
          this.yaw = turnTo(this.yaw, Math.atan2(dx, dz), dt * 7);
          const step = Math.min(gd - (blind ? 0.2 : 0.7), this.speed() * dt);
          if (step > 0) slide(this.world.grid, this.pos, (dx / dl) * step, (dz / dl) * step, RADIUS);
        } else this.follow(dt, this.speed());
        break;
      }
      case 'stumble':
        // Pitched forward, still going, arms out, catching itself.
        this.timer -= dt;
        if (this.knock) {
          slide(this.world.grid, this.pos, this.knock.x * dt, this.knock.z * dt, RADIUS);
          this.knock.multiplyScalar(Math.exp(-dt * 2.4));
        }
        if (this.timer <= 0) {
          const a = this.anim.layers.full?.action;
          if (a && this.stumbleTS) a.timeScale = this.stumbleTS;
          this.resume();
        }
        break;
      case 'search': {
        // Where she was: it looks round, shuffles about the spot, sniffs. Then it gives up.
        this.timer -= dt;
        if (this.path?.length) {
          if (this.follow(dt, this.speed())) this.anim.play({ full: this.body.clips.lookAround ? 'lookAround' : this.idleClip, fade: 0.4 });
        } else {
          this.lookIn -= dt;
          this.yaw += Math.sin(this.world.time * 1.3 + this.afflict.seed) * dt * 0.9;
          if (this.lookIn <= 0) {
            this.lookIn = 1.6 + Math.random() * 2.2;
            const c = toCell(this.searchAt.x, this.searchAt.z);
            for (let i = 0; i < 8; i++) {
              const t = { x: c.x + Math.floor(Math.random() * 3) - 1, z: c.z + Math.floor(Math.random() * 3) - 1 };
              if (!walkable(this.world.grid, t.x, t.z)) continue;
              this.path = findPath(this.world.grid, toCell(this.pos.x, this.pos.z), t) ?? [];
              if (this.path.length) {
                const clip = this.wanderClip;
                this.anim.play({ full: clip, fade: 0.3, timeScale: this.scaleFor(clip, this.speed()) });
                break;
              }
            }
            if (Math.random() < 0.35) this.world.audio?.play('growl', this.pos, { gain: 0.6 });
          }
        }
        if (this.timer <= 0) {
          // Nothing. It forgets her and wanders off.
          this.lostHer = true;
          this.sawHide = false;
          this.target = null;
          this.state = 'wander';
          this.timer = 0.3 + Math.random();
          this.path = [];
          this.world.audio?.play('moan', this.pos);
          this.playState();
        }
        break;
      }
      case 'attack': {
        // The lunge: it keeps coming as it bites, so stepping back half a metre doesn't save her.
        this.timer -= dt;
        this.yaw = turnTo(this.yaw, Math.atan2(toP.x, toP.z), dt * 12);
        if (dist > 0.75) {
          const step = Math.min(dist - 0.75, CHASE_SPEED * 0.85 * this.legFactor() * dt);
          slide(this.world.grid, this.pos, (toP.x / dist) * step, (toP.z / dist) * step, RADIUS);
        }
        if (this.timer <= 0 && !this.bit) {
          this.bit = true;
          // Where she is now, after this frame's lunge (round 4: the distance from before it was a frame stale, and at
          // the drive's 0.3 s frames a lunge that had closed on her missed by a few centimetres every time).
          const now = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
          if (now < REACH + 0.4 && sightClear(this.world.grid, this.pos.x, this.pos.z, p.pos.x, p.pos.z)) p.bitten(this, this.arms > 0);
        }
        break;
      }
      case 'stagger':
        this.timer -= dt;
        if (this.knock) {
          slide(this.world.grid, this.pos, this.knock.x * dt * 3, this.knock.z * dt * 3, RADIUS);
          this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
        }
        break;
      case 'floored':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.target = this.world.player;
          this.anim.play({ full: this.body.clips.crouchOut ? 'crouchOut' : 'Idle_Loop', once: true, fade: 0.2, then: () => this.resume() });
          this.state = 'rising';
        }
        break;
      case 'rising':
        break;
      case 'down':
        this.updateDown(dt, p);
        break;
    }
    // Keep the infected apart.
    if (!this.down)
      for (const o of this.world.zombies) {
        if (o === this || !o.alive || o.down) continue;
        const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7 && d > 1e-3) slide(this.world.grid, this.pos, (dx / d) * (0.7 - d) * 0.5, (dz / d) * (0.7 - d) * 0.5, RADIUS);
      }
    this.group.rotation.y = this.yaw;
    this.pose(dt);
  }

  // On the floor: pitch forward, then crawl towards her if it has arms and knows where she is; bite what it reaches.
  updateDown(dt, p) {
    if (this.prone < 1) {
      this.fallV += dt * 5;
      this.prone = Math.min(1, this.prone + this.fallV * dt * 2.2);
      if (this.prone >= 1) this.world.fx.decal(this.pos.x, this.pos.z, 0.45);
      return;
    }
    const mouth = this.headPos();
    const near = Math.hypot(p.pos.x - mouth.x, p.pos.z - mouth.z);
    if (near < 0.95 && this.cooldown <= 0 && p.alive) {
      // It gets her ankle.
      this.cooldown = 2.0;
      this.world.audio?.play('bite', this.pos);
      p.bitten(this, false);
    }
    this.crawling = false;
    if (!this.arms || !this.target && !this.lastSeen) return;
    // Crawl: along a path to her (or to where it last saw her), slowly, in pulls.
    this.replan -= dt;
    const goal = this.target ? p.pos : this.lastSeen;
    if (this.replan <= 0) {
      this.replan = 0.8;
      const straight = sightClear(this.world.grid, this.pos.x, this.pos.z, goal.x, goal.z);
      this.path = straight ? [toCell(goal.x, goal.z)] : findPath(this.world.grid, toCell(this.pos.x, this.pos.z), toCell(goal.x, goal.z)) ?? [];
    }
    if (near < 0.6) return;
    // The pull is in the stroke: fast while an arm drags, almost still while it reaches.
    const stroke = Math.max(0, Math.sin(this.crawlPhase * 2));
    const speed = CRAWL_SPEED * (this.arms === 2 ? 1 : 0.55) * (0.25 + stroke * 1.5);
    this.crawlPhase += dt * (this.arms === 2 ? 3.2 : 2.2);
    this.crawling = true;
    if (this.follow(dt, speed) && !this.target) this.lastSeen = null;
    this.crawlSound = (this.crawlSound ?? 1) - dt;
    if (this.crawlSound <= 0) {
      this.crawlSound = 1.4 + Math.random();
      this.world.audio?.play('crawl', this.pos);
    }
  }

  // What happened to them before she got here: blood round the mouth and down the front, a bite or two on the arms.
  dress() {
    this.dressed = true;
    const fx = this.world.fx;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const mark = (bone, dir, out, size) => {
      if (!bone) return;
      const c = bone.getWorldPosition(new THREE.Vector3());
      this.wounds.push(fx.wound(bone, c, c.clone().addScaledVector(dir.normalize(), out), size));
    };
    mark(this.rig.head, fwd.clone().add(new THREE.Vector3(0, -0.9, 0)), 0.16, 0.13);
    mark(this.rig.chest, fwd.clone().add(new THREE.Vector3(Math.random() - 0.5, -0.2, 0)), 0.3, 0.2);
    if (Math.random() < 0.7) mark(this.rig.spine, fwd.clone().add(new THREE.Vector3(Math.random() - 0.5, 0.3, 0)), 0.28, 0.17);
    const arm = this.rig.arm[Math.random() < 0.5 ? 'left' : 'right'][1];
    if (arm) mark(arm, new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.12, 0.1);
  }

  // The procedural layer over the clip: the body on the floor, arms that crawl, hang or flail, a head that looks at her.
  pose(dt) {
    const outer = this.body.outer;
    const pr = this.prone;
    // The flinches, over the clip.
    if (this.flinches.length) {
      outer.updateMatrixWorld(true);
      const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
      for (let i = this.flinches.length - 1; i >= 0; i--) {
        const f = this.flinches[i];
        for (let j = 0; j < n; j++) {
          f.v += (-260 * f.a - 22 * f.v) * h;
          f.a += f.v * h;
        }
        if (Math.abs(f.a) < 0.002 && Math.abs(f.v) < 0.05) {
          this.flinches.splice(i, 1);
          continue;
        }
        turnWorld(f.bone, f.axis, f.a);
      }
    }
    // How it is broken: the hunch, the head hanging, a dropped shoulder; leaning into a sprint; the head tracking hers;
    // both hands reaching for her as it closes.
    if (!pr && this.alive && this.state !== 'floored' && this.state !== 'rising') {
      const A = this.afflict, t = this.world.time;
      const fwdA = tw.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const rightA = tw2.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const hot = this.state === 'chase' || this.state === 'attack';
      const lean = A.hunch + (hot ? 0.16 : 0) + (this.state === 'stumble' ? 0.35 : 0);
      turnWorld(this.rig.spine, rightA, lean * 0.45);
      turnWorld(this.rig.chest, rightA, lean * 0.4);
      turnWorld(this.rig.chest, fwdA, A.drop + Math.sin(t * 0.9 + A.seed) * 0.04);
      turnWorld(this.rig.neck, fwdA, A.tilt + Math.sin(t * 0.6 + A.seed) * 0.12);
      const p = this.world.player;
      if (this.rig.neck && this.rig.head && (hot || this.state === 'search')) {
        const head = this.rig.head.getWorldPosition(new THREE.Vector3());
        const want = hot ? new THREE.Vector3(p.pos.x - head.x, 1.5 - head.y, p.pos.z - head.z) : new THREE.Vector3(Math.sin(this.yaw + Math.sin(t * 1.7 + A.seed) * 1.1), -0.15, Math.cos(this.yaw + Math.sin(t * 1.7 + A.seed) * 1.1));
        if (want.lengthSq() > 1e-4 && want.clone().setY(0).normalize().dot(fwdA) > -0.2) aimBone(this.rig.neck, this.rig.head, want.normalize(), hot ? 0.45 : 0.3);
      }
      const dist = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      const grab = A.reach && (hot || this.state === 'stumble') ? Math.max(0, Math.min(1, (5.5 - dist) / 3)) * 0.85 + (this.state === 'stumble' ? 0.6 : 0) : 0;
      if (grab > 0.02 && !p.hidden) {
        const to = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize();
        for (const side of ['left', 'right']) {
          if (!this.limbs[`${side}Arm`]) continue;
          const [up, low, hand] = this.rig.arm[side];
          if (!up) continue;
          const s = side === 'left' ? 1 : -1;
          const shoulder = up.getWorldPosition(new THREE.Vector3());
          const claw = Math.sin(t * 7 + s * 1.3 + A.seed) * 0.07;
          const target = shoulder.clone().addScaledVector(to, 0.5 + claw).addScaledVector(rightA, s * 0.12).add(new THREE.Vector3(0, -0.08 + Math.sin(t * 5 + s) * 0.05, 0));
          reach(up, low, hand, target, new THREE.Vector3(0, -1, 0).addScaledVector(rightA, s * 0.7), Math.min(1, grab));
        }
      }
    }
    if (pr > 0) {
      const e = pr * pr * (3 - 2 * pr);
      outer.rotation.x = e * Math.PI / 2;
      outer.position.set(0, e * PRONE_LIFT, -e * PRONE_SHIFT);
    }
    const anyLimp = this.arms < 2;
    if (!pr && !anyLimp) return;
    outer.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const t = this.world.time;
    for (const side of ['left', 'right']) {
      const [up, low, hand] = this.rig.arm[side];
      const s = side === 'left' ? 1 : -1; // the person's left is the group's +X
      const alive = this.limbs[`${side}Arm`];
      if (!alive) {
        // Limp: hangs (standing), or lies along the body (on the floor), swinging a little.
        const dir = pr > 0.5 ? fwd.clone().multiplyScalar(-0.75).add(new THREE.Vector3(0, -0.5, 0)).addScaledVector(right, s * 0.2) : DOWN.clone().addScaledVector(fwd, 0.08 + Math.sin(t * 3 + s) * 0.05).addScaledVector(right, s * 0.12);
        aimBone(up, low, dir, 0.9);
        aimBone(low, hand, dir, 0.9);
        continue;
      }
      if (pr < 0.6 || !this.alive) continue;
      // Crawling: the hand reaches ahead, plants, drags back past the shoulder, lifts, reaches again. The arms alternate.
      const ph = this.crawlPhase + (s > 0 ? 0 : Math.PI);
      const shoulder = up.getWorldPosition(new THREE.Vector3());
      const reachOut = this.crawling || this.target ? 1 : 0.35;
      const f = Math.cos(ph) * 0.32 * reachOut + 0.18;
      const lift = Math.max(0, -Math.sin(ph)) * 0.16 * reachOut;
      const target = shoulder.clone().addScaledVector(fwd, f + 0.15).addScaledVector(right, s * 0.22);
      target.y = 0.04 + lift;
      reach(up, low, hand, target, new THREE.Vector3(0, 1, 0).addScaledVector(right, s * 0.8), pr);
    }
    if (pr > 0.6 && this.rig.neck && this.rig.head) {
      // The head lifts towards her (or swings, hunting) instead of lying face down.
      const p = this.world.player;
      const head = this.rig.head.getWorldPosition(new THREE.Vector3());
      const look = this.target ? new THREE.Vector3(p.pos.x - head.x, 0.9, p.pos.z - head.z).normalize() : fwd.clone().add(new THREE.Vector3(Math.sin(t * 0.8 + this.id) * 0.4, 0.45, 0)).normalize();
      if (look.dot(fwd) < 0.2) look.addScaledVector(fwd, 0.6).normalize();
      aimBone(this.rig.neck, this.rig.head, look, 0.7);
      // No arms left: it writhes, the shoulders rolling.
      if (!this.arms && this.alive && this.rig.chest) {
        const roll = Math.sin(t * 6.5 + this.id) * 0.35 + Math.sin(t * 2.3) * 0.2;
        this.rig.chest.rotateY(roll * 0.5);
        this.rig.spine?.rotateY(-roll * 0.3);
        this.rig.chest.updateMatrixWorld(true);
      }
      // The legs drag (and twitch).
      for (const side of ['left', 'right']) {
        const [thigh, shin, foot] = this.rig.leg[side];
        const tw = this.alive ? Math.sin(t * (this.arms ? 2 : 7) + (side === 'left' ? 0 : 2)) * 0.1 : 0;
        aimBone(thigh, shin, fwd.clone().multiplyScalar(-1).add(new THREE.Vector3(0, -0.15 + tw, 0)).addScaledVector(right, side === 'left' ? 0.12 : -0.12), pr * 0.8);
        aimBone(shin, foot, fwd.clone().multiplyScalar(-1).add(new THREE.Vector3(0, -0.1 + tw * 0.5, 0)), pr * 0.8);
      }
    }
  }

  attack() {
    this.state = 'attack';
    this.timer = 0.36;
    this.bit = false;
    this.cooldown = this.arms ? 1.3 : 1.9;
    this.world.audio?.play('bite', this.pos);
    this.anim.play({ full: 'Punch_Cross', once: true, fade: 0.08, timeScale: 1.4, then: () => this.resume() });
  }

  pickWander() {
    const grid = this.world.grid;
    // Some of the time: a door with people behind it, if one is near enough.
    const rooms = grid.rooms.filter((r) => !r.open && !r.lost && (r.banging ?? 0) < 2);
    if (rooms.length && Math.random() < 0.35) {
      const room = rooms[Math.floor(Math.random() * rooms.length)];
      const outside = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({ x: room.door.x + dx, z: room.door.z + dz })).find((c) => walkable(grid, c.x, c.z) && !room.floor.some((f) => f.x === c.x && f.z === c.z));
      if (outside) {
        const path = findPath(grid, toCell(this.pos.x, this.pos.z), outside);
        if (path && path.length < 40) {
          this.path = path;
          this.wanderDoor = room;
          this.playState();
          return;
        }
      }
    }
    for (let i = 0; i < 12; i++) {
      const c = toCell(this.pos.x, this.pos.z);
      const t = { x: c.x + Math.floor(Math.random() * 13) - 6, z: c.z + Math.floor(Math.random() * 13) - 6 };
      if (!walkable(grid, t.x, t.z)) continue;
      const path = findPath(grid, c, t);
      if (path && path.length) {
        this.path = path;
        this.wanderDoor = null;
        this.playState();
        return;
      }
    }
    this.timer = 2;
  }

  dispose() {
    this.anim.dispose();
    this.group.removeFromParent();
    for (const m of this.body.own ?? []) m.dispose();
  }
}
