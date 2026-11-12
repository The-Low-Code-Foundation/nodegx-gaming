// The officer. Third person over the shoulder: walk, sprint, crouch, aim (right mouse), fire (left), reload (R),
// swing (F), take cover (Q), interact (E), torch (T), swap shoulder (V). One long gun, one pistol, one melee weapon,
// and the knife. A bite infects her: the clock to turning starts, and every bite after shortens it. Medkits stop the
// bleeding.
// Round 2 (playtest: "You can't take cover, I tried on several walls"; "ability to peek around wall corners and
// doorways when in cover"): Q against ANY wall, pillar, vending machine, counter, bed, trolley or row of chairs. Low
// cover: she crouches behind it and aiming pops her up over it. Tall cover: her back to it; she slides along it, and
// at its end (a corner, a doorway) the camera looks round it, and aiming leans her out to shoot. Melee follows the
// crosshair: the knife or the bat on the head kills. The knife strikes with the hand that holds it.
// Round 3 (playtest: "the way the player aims and shoots isn't very satisfying … the player isn't holding them straight
// … I'd like to get to a point where it feels like Gears of War"): the guns are held by the weapon rig (rig.mjs): the
// gun points at the crosshair and both hands are put on it. Firing is the rig's recoil plus the camera's: trauma shake,
// a kick that springs back, a FOV punch, brass, a flash with smoke, hit markers. Reloads are the rig's timelines, with a
// Gears active reload (R again in the sweet spot). The camera zooms in to aim, runs low and shaky (the roadie run), and
// she slams into cover instead of teleporting there.
// Round 4 (playtest: "Firing a gun is really loud, it blows your eardrums out … reflected in the sound when firing, but
// also in the way the screen shakes and the muzzle flashes. I want firing a gun to feel as powerful and dangerous and
// explosive as it does in real life"): every shot deafens her (world.ears, audio.mjs), jolts the camera back into her
// shoulder (a spring), rolls it, judders it for a tenth of a second on top of the trauma shake, and flashes the room
// (game.mjs gunPunch: the exposure, the screen, the haze). "An ability to hide when there are too many of them, running
// away and ducking under a desk": E at a desk or a bed slides her under it (the view from the floor, between its legs);
// she is not seen; right mouse holds her breath (the one standing over her notices far slower, but not for long).
import * as THREE from 'three';
import { Animator } from './people.mjs';
import { Face } from './face.mjs';
import { WEAPONS } from './weapons.mjs';
import { toCell, toWorld, isCover, isTall, walkable, CELL, HIDE } from './map.mjs';
import { slide, turnTo, angleDiff } from './move.mjs';
import { reach } from './pose.mjs';
import { WeaponRig } from './rig.mjs';

const RADIUS = 0.34;
const SPEED = { walk: 2.5, sprint: 5.6, aim: 1.5, crouch: 1.35, crouchAim: 1.0, cover: 1.6 };
const UP = new THREE.Vector3(0, 1, 0);
const LEAN = 0.72; // how far past the corner she leans to shoot
const COVER_GAP = 0.06;

export class Player {
  constructor(world, body, cell) {
    this.world = world;
    this.body = body;
    this.group = new THREE.Group();
    this.group.add(body.outer);
    const { x, z } = toWorld(cell.x, cell.z);
    this.group.position.set(x, 0, z);
    this.yaw = 0;
    world.scene.add(this.group);
    this.anim = new Animator(body);
    this.face = new Face(body.outer);
    this.face.mood = 'neutral';
    this.hand = body.outer.getObjectByName('ls_rightHand');
    this.arm = { up: body.outer.getObjectByName('ls_leftUpperArm'), low: body.outer.getObjectByName('ls_leftLowerArm'), hand: body.outer.getObjectByName('ls_leftHand') };
    this.input = { fwd: 0, side: 0, sprint: false, aim: false, fire: false, firePressed: false, reload: false, interact: false, melee: false, cover: false, torch: false, crouch: false, shoulder: false, slot: null };
    this.camYaw = Math.PI;
    this.camPitch = 0.12;
    this.shoulder = 1; // +1 right shoulder, -1 left (cover moves it to the side she faces)
    this.homeShoulder = 1; // the one V chose, restored when she leaves cover
    this.shoulderSide = 1; // where the camera actually is, eased
    this.peek = 0; // eased 0..1: the camera looking round a corner
    this.lean = 0; // eased 0..1: her body leant out past it
    this.aiming = false;
    this.aimHold = 0;
    this.crouched = false;
    this.sprinting = false;
    this.moving = false;
    this.cover = null;
    this.coverHint = null;
    this.torchOn = true;
    this.alive = true;
    this.dead = null;
    this.maxHp = 100 + world.skills.health;
    this.hp = this.maxHp;
    this.bites = 0;
    this.infected = false;
    this.turnIn = 0;
    this.bleeding = false;
    this.hurtFlash = 0;
    this.shake = 0;
    this.cooldown = 0;
    this.reloading = 0;
    this.swinging = 0;
    this.busy = 0;
    this.stepIn = 0;
    this.weapons = { pistol: { def: WEAPONS.pistol, mag: 12, reserve: 24 }, long: null, melee: null, knife: { def: WEAPONS.knife } };
    this.bank = {};
    this.current = 'pistol';
    this.prompt = null;
    this.makeGuns();
    this.rig = new WeaponRig(this);
    // The camera's eased state, its shake (trauma 0..1, squared into the shake) and its kick (a spring, visual only).
    this.cam = { dist: 2.5, side: 0.55, height: 1.55, fov: 68, fovKick: 0, kickP: 0, kickPV: 0, kickY: 0, kickYV: 0, t: 0, jolt: 0, joltV: 0, roll: 0, rollV: 0, snap: 0, snapAmp: 0 };
    // Round 4: hiding under a desk or a bed ({ at, out, yaw, kind, t, leaving }), and her breath (1 full … 0).
    this.hidden = null;
    this.breath = 1;
    this.breathHeld = false;
    this.trauma = 0;
    this.spreadNow = 0;
    this.torch = new THREE.SpotLight(0xfff2d8, 55, 26, 0.5, 0.85, 1.4);
    this.torch.castShadow = false;
    this.torchTarget = new THREE.Object3D();
    world.scene.add(this.torch, this.torchTarget);
    this.torch.target = this.torchTarget;
    this.anim.play({ full: 'idle', fade: 0 });
  }
  get pos() {
    return this.group.position;
  }
  get weapon() {
    return this.weapons[this.current] ?? this.weapons.knife;
  }
  get gunOut() {
    return !this.weapon.def.melee;
  }
  get weaponKey() {
    return Object.keys(WEAPONS).find((k) => WEAPONS[k] === this.weapon.def);
  }

  // The weapons on her right hand (guns.mjs's models when there; plain shapes otherwise); the one in use is visible.
  makeGuns() {
    const kit = this.world.gunKit;
    this.gunInfo = {};
    this.guns = {};
    for (const k of ['pistol', 'shotgun', 'smg', 'rifle', 'bat', 'knife']) {
      const built = kit?.buildWeapon?.(k);
      if (built) {
        this.guns[k] = built.group;
        this.gunInfo[k] = built;
      }
    }
    if (Object.keys(this.guns).length < 6) {
      const dark = new THREE.MeshPhongMaterial({ color: 0x40464d, shininess: 90, specular: 0x666666 });
      const wood = new THREE.MeshPhongMaterial({ color: 0x5a3a22 });
      const mk = (parts) => {
        const g = new THREE.Group();
        for (const [w, h, d, x, y, z, m] of parts) {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m ?? dark);
          mesh.position.set(x, y, z);
          g.add(mesh);
        }
        return g;
      };
      const plain = {
        pistol: mk([[0.035, 0.05, 0.2, 0, 0.03, 0.1], [0.035, 0.11, 0.04, 0, -0.04, 0.02]]),
        shotgun: mk([[0.035, 0.045, 0.75, 0, 0.02, 0.35], [0.045, 0.1, 0.2, 0, -0.03, 0.05, wood], [0.05, 0.08, 0.28, 0, 0.0, -0.18, wood]]),
        smg: mk([[0.04, 0.07, 0.42, 0, 0.0, 0.2], [0.03, 0.14, 0.04, 0, -0.1, 0.1], [0.03, 0.05, 0.18, 0, 0.02, -0.12]]),
        rifle: mk([[0.035, 0.06, 0.78, 0, 0.01, 0.35], [0.03, 0.16, 0.05, 0, -0.1, 0.12], [0.045, 0.08, 0.26, 0, -0.01, -0.18]]),
        bat: mk([[0.05, 0.05, 0.85, 0, 0, 0.4, wood], [0.035, 0.035, 0.2, 0, 0, -0.1, wood]]),
        knife: mk([[0.012, 0.03, 0.16, 0, 0, 0.1, new THREE.MeshPhongMaterial({ color: 0xc8ccd0, shininess: 120 })], [0.02, 0.025, 0.09, 0, 0, -0.03]])
      };
      for (const k of Object.keys(plain)) if (!this.guns[k]) this.guns[k] = plain[k];
    }
    // Rocketbox's hand bone points along +X towards the fingers; the barrel goes with it.
    // The hand bone lives in the rig's own units (Rocketbox: centimetres, scaled to metres above it), so the mount
    // undoes that scale, or a 20 cm pistol is 3 mm long. The offset is in the hand's units too.
    this.gunMount = new THREE.Group();
    this.body.outer.updateMatrixWorld(true);
    const s = this.hand ? this.hand.getWorldScale(new THREE.Vector3()).x || 1 : 1;
    this.gunMount.scale.setScalar(1 / s);
    this.gunMount.position.set(0.08 / s, -0.03 / s, 0.0);
    this.gunMount.rotation.set(0, Math.PI / 2, 0);
    for (const g of Object.values(this.guns)) (g.visible = false), this.gunMount.add(g);
    this.hand?.add(this.gunMount);
    this.showGun();
  }
  showGun() {
    const key = this.weaponKey;
    for (const [k, g] of Object.entries(this.guns)) g.visible = k === key;
  }

  // Where the bullet leaves: the gun's muzzle in the world.
  muzzle() {
    const key = this.weaponKey;
    const g = this.guns[key];
    g.updateMatrixWorld(true);
    const m = this.gunInfo[key]?.muzzle?.clone() ?? new THREE.Vector3(0, 0.02, key === 'pistol' ? 0.17 : 0.6);
    g.localToWorld(m);
    return m;
  }

  // Camera: the rig sits over her shoulder; aiming pulls it in; in cover at a corner it looks round it.
  cameraVectors() {
    const dir = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
    const right = new THREE.Vector3().crossVectors(dir, UP).normalize();
    return { dir, right };
  }

  // Round 3: Gears' camera. Over the right shoulder with her on the left of the screen; aiming pulls it in tight and
  // narrows the view (a zoom, quick); the roadie run drops it low and close and shakes it; every shot shakes it (trauma),
  // kicks it up (a spring that comes back) and punches the field of view. world.tune holds the numbers (the sandbox's
  // tuning panel, ` key).
  addTrauma(t) {
    this.trauma = Math.min(1, this.trauma + t * (this.world.tune?.shake ?? 1));
  }
  placeCamera(camera, dt) {
    const T = this.world.tune ?? {};
    const C = this.cam;
    C.t += dt;
    const { dir, right } = this.cameraVectors();
    const aim = this.aiming && this.alive;
    const roadie = this.sprinting && this.moving;
    const low = this.crouched && !((this.aiming || this.aimHold > 0) && this.cover);
    const rate = aim ? 16 : 9;
    const ease = (k, want, r = rate) => (C[k] += (want - C[k]) * (1 - Math.exp(-r * dt)));
    ease('dist', aim ? T.aimDist ?? 1.2 : roadie ? 1.9 : T.hipDist ?? 2.45);
    ease('side', aim ? T.aimSide ?? 0.66 : roadie ? 0.42 : T.hipSide ?? 0.58);
    ease('height', low ? 1.12 : roadie ? 1.32 : aim ? 1.6 : 1.56, 8);
    ease('fov', aim ? T.fovAim ?? 48 : roadie ? 76 : T.fovHip ?? 68, aim ? 16 : 7);
    C.fovKick *= Math.exp(-14 * dt);
    // The kick: a spring pulling the view back down after a shot.
    const k = 260, c = 2 * Math.sqrt(k) * 0.7;
    for (let i = 0, n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n; i < n; i++) {
      C.kickPV += (-k * C.kickP - c * C.kickPV) * h;
      C.kickP += C.kickPV * h;
      C.kickYV += (-k * C.kickY - c * C.kickYV) * h;
      C.kickY += C.kickYV * h;
      // Round 4: the jolt back into her shoulder and the roll, stiffer springs.
      C.joltV += (-420 * C.jolt - 2 * Math.sqrt(420) * 0.5 * C.joltV) * h;
      C.jolt += C.joltV * h;
      C.rollV += (-300 * C.roll - 2 * Math.sqrt(300) * 0.45 * C.rollV) * h;
      C.roll += C.rollV * h;
    }
    C.snap = Math.max(0, C.snap - dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    if (this.hidden) return this.placeHiddenCamera(camera, dt);
    const height = C.height;
    // The shoulder eases across when it changes.
    this.shoulderSide += (this.shoulder - this.shoulderSide) * Math.min(1, dt * 6);
    const pivot = this.pos.clone().add(new THREE.Vector3(0, height, 0)).addScaledVector(right, C.side * this.shoulderSide);
    // The roadie run: the camera bobs with her stride.
    if (roadie) pivot.y += Math.abs(Math.sin(C.t * 7.5)) * 0.06 - 0.03;
    // Peeking: the camera slides past the corner while she stays hidden.
    if (this.cover && this.peek > 0.01) pivot.addScaledVector(this.cover.tUnit, this.cover.edge * 0.75 * this.peek);
    const want = C.dist;
    let dist = want;
    // Pull in when a wall (or something tall) is between the pivot and the camera.
    const ray = new THREE.Raycaster(pivot, dir.clone().negate(), 0, want + 0.3);
    const hits = ray.intersectObjects(this.world.level.solids ?? [this.world.level.walls], false);
    if (hits.length) dist = Math.max(0.45, hits[0].distance - 0.25);
    this.camDist = this.camDist === undefined ? dist : dist < this.camDist ? dist : this.camDist + (dist - this.camDist) * Math.min(1, dt * 6);
    const camPos = pivot.clone().addScaledVector(dir, -this.camDist);
    // The jolt: the gun's blast drives the view back and up.
    camPos.addScaledVector(dir, -C.jolt * 0.07).add(new THREE.Vector3(0, C.jolt * 0.018, 0));
    // Shake: smooth noise (sums of sines at odd rates), scaled by trauma squared, on top of a bite's jolt.
    const sh = this.trauma * this.trauma + (roadie ? 0.04 : 0);
    const n = (a, b) => Math.sin(C.t * a + b) * 0.6 + Math.sin(C.t * a * 1.73 + b * 2.1) * 0.4;
    if (this.shake > 0) camPos.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0));
    camPos.addScaledVector(right, n(31, 1) * sh * 0.03).add(new THREE.Vector3(0, n(37, 4) * sh * 0.03, 0));
    this.camPos = camPos.clone();
    camera.position.copy(camPos);
    camera.lookAt(pivot.clone().addScaledVector(dir, 8));
    // The judder: for a tenth of a second after a shot, a hard random shake (the blast through her arms).
    const jud = C.snap > 0 ? C.snapAmp * (C.snap / 0.11) : 0;
    camera.rotateX(C.kickP + n(29, 7) * sh * 0.06 + (Math.random() - 0.5) * jud);
    camera.rotateY(C.kickY + n(23, 3) * sh * 0.055 + (Math.random() - 0.5) * jud);
    camera.rotateZ(n(19, 9) * sh * 0.08 + C.roll);
    // Fear (fear.mjs): the view throbs a little with her heartbeat.
    const fov = C.fov + C.fovKick - (this.world.fear?.pulse ?? 0) * (this.world.fear?.level ?? 0) * 1.4;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // The torch sits by the camera and lights where she looks.
    this.torch.position.copy(camPos).addScaledVector(right, 0.2 * this.shoulderSide);
    this.torch.visible = this.torchOn;
    this.torchTarget.position.copy(pivot).addScaledVector(dir, 10);
  }

  // The aim: from the camera through the crosshair, without the shake and the kick (they are felt, not aimed).
  aimRay(camera) {
    const { dir } = this.cameraVectors();
    const origin = (this.camPos ?? camera.position).clone();
    return { origin, dir: dir.clone().normalize() };
  }

  // Fire the current gun: one ray per pellet from the camera, spread by the weapon and by aiming.
  fire(camera) {
    const w = this.weapon;
    const def = w.def;
    if (def.melee) return this.swing();
    // A shotgun loading shell by shell stops after this shell when she fires.
    if (this.rig.reload?.def.shell) {
      this.rig.reload.stop = true;
      return;
    }
    if (this.cooldown > 0 || this.reloading > 0 || this.busy > 0 || this.sprinting) return;
    if (w.mag <= 0) {
      this.cooldown = 0.25;
      if (w.reserve > 0) this.reload();
      else this.world.audio?.play('empty');
      return;
    }
    w.mag--;
    this.cooldown = def.rate;
    this.aimHold = 0.7;
    const T = this.world.tune ?? {};
    const skill = def.hands === 1 ? this.world.skills.oneHanded : this.world.skills.twoHanded;
    // Spread grows as a burst goes on (the SMG's and the rifle's bloom) and settles between shots.
    this.bloom = Math.min(1, (this.bloom ?? 0) + (def.auto ? 0.12 : 0.25));
    const spread = (this.aiming ? def.aimSpread : def.spread) * (1 - Math.min(0.7, skill)) * (this.crouched ? 0.7 : 1) * (this.moving ? 1.6 : 1) * (1 + this.bloom * 0.8);
    const kind = def.ammoType === 'shells' ? 'shotgun' : def.ammoType === 'smg' ? 'smg' : def.ammoType === 'rifle' ? 'rifle' : 'shot';
    const audio = this.world.audio;
    if (audio?.gunshot) audio.gunshot(kind);
    else audio?.play(kind);
    // Under every shot, a body: the low thump you feel, and the mechanism.
    audio?.play(def.pellets > 1 ? 'thumpBig' : 'thump');
    audio?.play('mech');
    this.world.score.shots++;
    // Her ears (round 4): every shot in a closed room takes some of her hearing; a burst takes more.
    const ear = ({ shot: 0.2, smg: 0.085, rifle: 0.24, shotgun: 0.4 }[kind] ?? 0.2) * (T.deafen ?? 1);
    this.world.ears = Math.min(1, (this.world.ears ?? 0) + ear * (1 - (this.world.ears ?? 0) * 0.3));
    audio?.deafen?.(this.world.ears, ear);
    // The punch: trauma for the shake, the view kicked up (most of it springs back; a little stays: the climb), the
    // field of view punched out; round 4: harder, the jolt back, the roll, the judder.
    const punch = { pistol: [0.46, 0.042, 3.4], smg: [0.21, 0.016, 1.3], rifle: [0.36, 0.03, 2.4], shotgun: [1.0, 0.095, 9] }[this.weaponKey] ?? [0.4, 0.03, 3];
    const kick = T.kick ?? 1;
    const blast = { pistol: 1, smg: 0.5, rifle: 0.85, shotgun: 2.1 }[this.weaponKey] ?? 1;
    this.addTrauma(punch[0]);
    this.cam.joltV += blast * 9 * kick;
    this.cam.rollV += (Math.random() < 0.5 ? -1 : 1) * blast * 0.5 * kick;
    this.cam.snap = 0.11;
    this.cam.snapAmp = 0.022 * blast * (T.shake ?? 1);
    this.cam.kickPV += punch[1] * 22 * kick;
    this.cam.kickYV += (Math.random() - 0.5) * punch[1] * 14 * kick;
    this.camPitch = Math.min(0.8, this.camPitch + punch[1] * 0.15 * kick);
    this.camYaw += (Math.random() - 0.5) * punch[1] * 0.15 * kick;
    this.cam.fovKick += punch[2] * (T.fovPunch ?? 1);
    this.rig.fire();
    const { origin, dir } = this.aimRay(camera);
    const muzzle = this.muzzle();
    const gunDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.rig.gunQ);
    const flashSize = def.pellets > 1 ? 1.6 : def.ammoType === 'rifle' ? 1.2 : def.ammoType === 'smg' ? 0.85 : 1;
    this.world.fx.muzzle(muzzle, gunDir, flashSize);
    this.world.gunPunch?.(flashSize, muzzle);
    if (this.weaponKey !== 'shotgun') {
      const port = this.rig.port();
      if (port) this.world.fx.casing(port.at, port.dir, this.weaponKey === 'rifle' ? 'rifle' : 'pistol', this.world.audio);
    }
    let marked = null;
    const hitsOnZombie = new Map();
    for (let i = 0; i < def.pellets; i++) {
      const d = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread)).normalize();
      const hit = this.world.trace(origin, d, 60);
      const end = hit ? hit.point : origin.clone().addScaledVector(d, 60);
      this.world.fx.tracer(muzzle, end);
      if (!hit) continue;
      if (hit.zombie) {
        hitsOnZombie.set(hit.zombie, (hitsOnZombie.get(hit.zombie) ?? 0) + 1);
        const r = hit.zombie.hit(hit.part, d, { power: def.knock, at: hit });
        this.world.score.hits = (this.world.score.hits ?? 0) + (i === 0 || def.pellets === 1 ? 1 : 0);
        if (r.killed) {
          this.world.score.headshots++;
          marked = 'kill';
          // A headshot kill: a heartbeat of slow time.
          if (T.hitstop !== false) this.world.hitstop = Math.max(this.world.hitstop ?? 0, def.pellets > 1 ? 0.09 : 0.06);
        } else marked ??= hit.part === 'head' ? 'kill' : 'hit';
      } else {
        this.world.fx.hole(end, hit.normal ?? d.clone().negate(), { metal: hit.metal });
        if (i === 0 || Math.random() < 0.3) this.world.audio?.play('impact', end);
      }
    }
    if (marked) {
      this.world.hud?.hitmark(marked);
      this.world.audio?.play(marked === 'kill' ? 'killmark' : 'hitmark');
    }
    // A shotgun blast that lands most of its pellets knocks one over.
    for (const [z, n] of hitsOnZombie) if (def.pellets > 1 && n >= 4 && z.alive && !z.down) z.knockdown(2.2);
    this.world.noise(this.pos, def.noise * (1 - this.world.skills.stealth * 0.5));
    this.world.hud?.kick();
  }

  // R: the rig's reload (its timeline moves the hands, drops the magazine, seats the new one). R again while it runs:
  // the active reload (in the sweet spot: fast; outside it: a fumble).
  reload() {
    const w = this.weapon;
    if (this.rig.reload) {
      const r = this.rig.activeReload();
      if (r !== null) {
        this.world.hud?.activeReload(r);
        this.world.audio?.play(r ? 'perfect' : 'fumble');
      }
      return;
    }
    if (w.def.melee || this.reloading > 0 || w.reserve <= 0 || w.mag >= w.def.mag || this.sprinting) return;
    const total = this.rig.startReload(w);
    if (!total) return;
    this.reloading = total;
    this.reloadWeapon = w;
    this.world.hud?.reloadStart(this.rig.reload);
  }
  finishReload() {}
  // What the rig's timelines did this frame: sounds, brass, the magazine on the floor, the ammo counts.
  rigEvents() {
    const audio = this.world.audio, fx = this.world.fx;
    const w = this.reloadWeapon ?? this.weapon;
    for (const { name, data } of this.rig.events.splice(0)) {
      switch (name) {
        case 'magOut':
          // The rounds left in it go back in the pouch (a game kindness); the empty one falls.
          w.reserve += w.mag;
          w.mag = 0;
          audio?.play('magout');
          fx.dropMag?.(data.mag, data.axis);
          break;
        case 'magGrab':
          audio?.play('grab');
          break;
        case 'magIn': {
          const take = Math.min(w.def.mag, w.reserve);
          w.mag += take;
          w.reserve -= take;
          audio?.play('magin');
          this.addTrauma(0.08);
          break;
        }
        case 'shellIn':
          if (w.reserve > 0 && w.mag < w.def.mag) (w.mag++, w.reserve--);
          audio?.play('load');
          break;
        case 'slide':
        case 'cock':
          audio?.play('mech');
          audio?.play('slide');
          break;
        case 'slap':
          audio?.play('slap');
          this.addTrauma(0.1);
          break;
        case 'rack':
          audio?.play('rack');
          break;
        case 'pumpBack': {
          audio?.play('rack');
          const port = this.rig.port();
          if (port) fx.casing(port.at, port.dir, 'shell', audio);
          break;
        }
        case 'reloadDone':
          this.reloading = 0;
          this.reloadWeapon = null;
          this.world.hud?.reloadEnd();
          break;
      }
    }
  }

  // A swing with the bat or a strike with the knife (F, or fire with either in hand). The right hand holds them, so the
  // right hand strikes: a cross for the knife, the sword cut for the bat.
  swing() {
    if (this.swinging > 0 || this.busy > 0) return;
    const def = this.weapon.def.melee ? this.weapon.def : WEAPONS.knife;
    // F with a gun out: the knife comes out for the strike, and goes back after.
    if (!this.weapon.def.melee) {
      this.swingFrom = this.current;
      this.current = 'knife';
      this.showGun();
    } else this.swingFrom = null;
    this.swinging = def.swing;
    this.swingHitAt = def.swing * 0.45;
    this.swingDef = def;
    this.world.audio?.play('swing');
    this.cover = this.cover?.kind === 'low' ? this.cover : null;
    const clip = def === WEAPONS.knife ? 'Punch_Cross' : 'Sword_Attack';
    this.anim.play({ full: clip, once: true, fade: 0.06, timeScale: def === WEAPONS.knife ? 1.7 : 1.5, then: () => this.anim.play({ full: this.idleClip(), fade: 0.15 }) });
  }
  landSwing() {
    const def = this.swingDef;
    const strength = 1 + this.world.skills.melee;
    const reachM = def.reach * (1 + 0.1 * strength);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    // The blow is what makes the noise (not the wind-up: the one she is stabbing would turn before the blade landed).
    this.world.noise(this.pos, def.noise);
    // What the crosshair is on, if it is within arm's reach of her: that part is what gets hit.
    let target = null, part = 'torso', at = null;
    const { origin, dir } = this.aimRay(this.world.camera);
    const hit = this.world.trace(origin, dir, (this.camDist ?? 3) + reachM + 1);
    if (hit?.zombie && hit.zombie.alive) {
      const z = hit.zombie;
      const d = Math.hypot(hit.point.x - this.pos.x, hit.point.z - this.pos.z);
      if (d <= reachM + 0.35) (target = z), (part = hit.part), (at = hit);
    }
    if (!target) {
      // Nothing under the crosshair: whatever is in front of her, in the body.
      let best = null;
      for (const z of this.world.zombies) {
        if (!z.alive) continue;
        const zp = z.down ? z.headPos() : z.pos;
        const to = new THREE.Vector3(zp.x - this.pos.x, 0, zp.z - this.pos.z);
        const d = to.length();
        if (d > reachM + (z.down ? 0.3 : 0) || to.normalize().dot(fwd) < 0.55) continue;
        if (!best || d < best.d) best = { z, d };
      }
      target = best?.z ?? null;
      // One on the floor: you stab down at its head.
      if (target?.down) part = 'head';
    }
    if (!target) return;
    // A blade or a bat doesn't need a marksman: a strike whose aim passes near the head is a strike to the head.
    if (part !== 'head') {
      const head = target.headPos().clone();
      if (!target.down) head.y += 0.08;
      const along = head.clone().sub(origin).dot(dir);
      const miss = origin.clone().addScaledVector(dir, along).distanceTo(head);
      if (along > 0 && miss < 0.28) part = 'head';
    }
    const stunned = target.state === 'stagger' || target.state === 'floored' || target.down;
    if (part === 'head' || (stunned && def === WEAPONS.bat && Math.random() < 0.6 * strength)) {
      target.hit('head', fwd, { blade: def === WEAPONS.knife, at: part === 'head' ? at : null });
      this.world.score.meleeKills++;
      this.world.audio?.play(def === WEAPONS.bat ? 'bat' : 'stab', target.pos);
    } else {
      target.hit(part, fwd, { power: 0.6 * strength * (def === WEAPONS.bat ? 1.6 : 0.5), blade: true, at });
      if (def === WEAPONS.bat) {
        target.timer = Math.max(target.timer, def.stun * strength * 0.5);
        this.world.audio?.play('bat', target.pos);
      }
    }
  }

  // A knife to the head of an infected that has not seen her: crouched, behind it, close.
  stealthTarget() {
    if (!this.crouched || this.busy > 0) return null;
    let best = null;
    for (const z of this.world.zombies) {
      if (!z.alive || z.state === 'chase' || z.state === 'attack' || z.state === 'stagger') continue;
      const zp = z.down ? z.headPos() : z.pos;
      const dx = zp.x - this.pos.x, dz = zp.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.5) continue;
      // Behind it: it faces away from her (one on the floor: anywhere but in front of its mouth).
      const behind = Math.abs(angleDiff(z.yaw, Math.atan2(-dx, -dz))) > (z.down ? 1.0 : 1.7);
      if (!behind) continue;
      if (!best || d < best.d) best = { z, d };
    }
    return best?.z ?? null;
  }
  stealthKill(z) {
    this.busy = 0.9;
    const zp = z.down ? z.headPos() : z.pos;
    this.yaw = Math.atan2(zp.x - this.pos.x, zp.z - this.pos.z);
    this.cover = null;
    if (this.current !== 'knife') {
      this.swingFrom = this.current;
      this.current = 'knife';
      this.showGun();
    }
    this.world.audio?.play('stab');
    this.anim.play({ full: 'Punch_Cross', once: true, fade: 0.05, timeScale: 1.4, then: () => this.anim.play({ full: this.idleClip(), fade: 0.15 }) });
    setTimeout(() => {
      if (z.alive) {
        z.hit('head', new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), { blade: true });
        this.world.score.stealthKills++;
      }
      if (this.swingFrom) (this.current = this.swingFrom), (this.swingFrom = null), this.showGun();
    }, 260);
  }

  // ---- cover ------------------------------------------------------------------------------------------------------
  // The cover surface she could take from here: the nearest face of a wall, a tall thing or low cover beside her cell,
  // preferring the one the camera looks at. Returns the run of that surface (how far it goes either way along it).
  findCover() {
    const g = this.world.grid;
    const c = toCell(this.pos.x, this.pos.z);
    const { dir } = this.cameraVectors();
    let best = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = { x: c.x + dx, z: c.z + dz };
      const low = isCover(g, nb.x, nb.z), tall = isTall(g, nb.x, nb.z);
      if (!low && !tall) continue;
      const nAxis = dx ? 'x' : 'z', tAxis = dx ? 'z' : 'x';
      const d = dx || dz;
      const face = d > 0 ? (c[nAxis] + 1) * CELL : c[nAxis] * CELL;
      const gap = Math.abs(face - this.pos[nAxis]);
      if (gap > 1.35) continue;
      const score = gap - 0.6 * (dir.x * dx + dir.z * dz);
      if (best && score >= best.score) continue;
      // The run: along the surface while it is the same kind of cover and she has floor to stand on.
      const same = (i) => {
        const q = { ...nb, [tAxis]: i };
        return low ? isCover(g, q.x, q.z) : isTall(g, q.x, q.z);
      };
      const stand = (i) => walkable(g, tAxis === 'x' ? i : c.x, tAxis === 'z' ? i : c.z);
      let lo = nb[tAxis], hi = nb[tAxis];
      while (same(lo - 1) && stand(lo - 1)) lo--;
      while (same(hi + 1) && stand(hi + 1)) hi++;
      // An end she can peek round: past it the surface stops and there is floor both beside and beyond it.
      const open = (i) => stand(i) && walkable(g, tAxis === 'x' ? i : nb.x, tAxis === 'z' ? i : nb.z, { throughCover: low });
      const n = { x: -dx, z: -dz };
      best = {
        score, gap, kind: low ? 'low' : 'tall', nAxis, tAxis, n, d,
        tUnit: new THREE.Vector3(tAxis === 'x' ? 1 : 0, 0, tAxis === 'z' ? 1 : 0),
        standN: face - d * (RADIUS + COVER_GAP),
        min: lo * CELL, max: (hi + 1) * CELL,
        peekLo: open(lo - 1), peekHi: open(hi + 1),
        edge: 0, side: 1, cell: nb
      };
    }
    return best;
  }

  toggleCover() {
    if (this.cover) return this.leaveCover('left cover');
    const best = this.findCover();
    if (!best) {
      this.world.hud?.hint('no cover here: get next to a wall, a counter, a bed or a trolley');
      return;
    }
    this.cover = best;
    // She doesn't appear there: she goes, fast, and hits it (moveInCover eases her the last of the way).
    best.at = Math.max(best.min + 0.3, Math.min(best.max - 0.3, this.pos[best.tAxis]));
    best.snap = Math.min(1, best.gap / 1.2);
    if (this.reloading <= 0) this.rig.recoil.kick('body', -2);
    // Face along the surface the way the camera looks (tall) or into it (low).
    const { right } = this.cameraVectors();
    best.side = right.dot(best.tUnit) >= 0 ? 1 : -1;
    this.crouched = best.kind === 'low';
    this.world.audio?.play('slam');
    this.addTrauma(0.22 + best.snap * 0.25);
    this.cam.kickPV -= 0.6;
    this.world.hud?.hint(best.kind === 'low' ? 'in cover · aim to pop up and shoot · Q to leave' : 'in cover · slide along it · at a corner or a door, look round it; aim to lean out · Q to leave');
  }
  leaveCover(msg) {
    this.cover = null;
    this.lean = 0;
    this.shoulder = this.homeShoulder;
    if (msg) this.world.hud?.hint(msg);
  }

  // Moving while in cover: only along it, stopping at its ends. Returns the speed moved.
  moveInCover(dt, move, inAimPose) {
    const cv = this.cover;
    // Pushing away from the surface (or sprinting) leaves it.
    const away = move.x * cv.n.x + move.z * cv.n.z;
    if (away > 0.75 || (this.input.sprint && move.lengthSq() > 0)) {
      this.leaveCover();
      return -1;
    }
    const along = move.x * cv.tUnit.x + move.z * cv.tUnit.z;
    const lo = cv.min + (cv.kind === 'low' ? 0.2 : 0.3), hi = cv.max - (cv.kind === 'low' ? 0.2 : 0.3);
    // The base position along the surface (without the lean).
    cv.at = cv.at ?? Math.max(lo, Math.min(hi, this.pos[cv.tAxis]));
    let speed = 0;
    if (Math.abs(along) > 0.3 && !(inAimPose && cv.edge && this.lean > 0.2)) {
      speed = (this.crouched ? SPEED.crouch : SPEED.cover) * Math.sign(along);
      cv.at = Math.max(lo, Math.min(hi, cv.at + speed * dt));
      cv.side = Math.sign(along);
    }
    // At an end she can see round?
    cv.edge = cv.at >= hi - 0.05 && cv.peekHi ? 1 : cv.at <= lo + 0.05 && cv.peekLo ? -1 : 0;
    if (cv.edge) cv.side = cv.edge;
    // Lean out past the corner to shoot (tall cover); pop up over it (low cover: the crouch below does that).
    const leanWant = cv.kind === 'tall' && cv.edge && inAimPose ? 1 : 0;
    this.lean += (leanWant - this.lean) * Math.min(1, dt * 9);
    this.peek += ((cv.edge && !inAimPose ? 1 : 0) - this.peek) * Math.min(1, dt * 5);
    const target = { x: this.pos.x, z: this.pos.z };
    target[cv.nAxis] = cv.standN + cv.n[cv.nAxis] * 0.12 * this.lean;
    target[cv.tAxis] = cv.at + cv.edge * LEAN * this.lean;
    // Into the cover fast (a slam), then held there.
    const k = 1 - Math.exp(-dt * 28);
    slide(this.world.grid, this.pos, (target.x - this.pos.x) * k, (target.z - this.pos.z) * k, RADIUS * 0.8);
    // The camera's shoulder follows the side she faces.
    const { right } = this.cameraVectors();
    this.shoulder = right.dot(cv.tUnit) * cv.side >= 0 ? 1 : -1;
    return Math.abs(speed);
  }

  // ---- hiding (round 4) ------------------------------------------------------------------------------------------
  // A desk or a bed beside her she can get under: { cell, at (its middle), out (where she is), yaw (looking out) }.
  hideSpot() {
    if (this.hidden || this.busy > 0 || this.swinging > 0) return null;
    const g = this.world.grid;
    const c = toCell(this.pos.x, this.pos.z);
    let best = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = { x: c.x + dx, z: c.z + dz };
      const ch = g.cells[nb.z]?.[nb.x];
      if (!ch || !HIDE.includes(ch)) continue;
      const nAxis = dx ? 'x' : 'z';
      const face = (dx || dz) > 0 ? (c[nAxis] + 1) * CELL : c[nAxis] * CELL;
      const gap = Math.abs(face - this.pos[nAxis]);
      if (gap > 1.1 || (best && gap >= best.gap)) continue;
      const mid = toWorld(nb.x, nb.z);
      // Under it, a little way in from the side she came in by; looking out of that side.
      const at = { x: mid.x - dx * 0.25, z: mid.z - dz * 0.25 };
      best = { cell: nb, ch, gap, at, out: { x: this.pos.x, z: this.pos.z }, yaw: Math.atan2(-dx, -dz), kind: ch === 'B' ? 'bed' : 'desk' };
    }
    return best;
  }
  hide(spot) {
    if (!spot) return;
    if (this.cover) this.leaveCover();
    this.hidden = { ...spot, t: 0, leaving: false, torch: this.torchOn };
    this.busy = 0.55;
    this.aiming = false;
    this.crouched = true;
    this.torchOn = false;
    if (this.reloading > 0) (this.rig.cancelReload(), (this.reloading = 0), (this.reloadWeapon = null), this.world.hud?.reloadEnd());
    this.camYaw = spot.yaw;
    this.camPitch = -0.02;
    this.world.audio?.play('grab');
    this.world.audio?.play('slam', null, { gain: 0.35 });
    // One that sees her go under knows where she is.
    for (const z of this.world.zombies) if (z.alive && z.seesNow && Math.hypot(z.pos.x - this.pos.x, z.pos.z - this.pos.z) < 12) z.sawHide = true;
    this.world.hud?.hint(`under the ${spot.kind} · right mouse: hold your breath · E to come out`);
  }
  // Out again, the way she came (or the other side, if one of them is standing there). `pulled`: found and dragged out.
  leaveHide(pulled = false) {
    const h = this.hidden;
    if (!h) return;
    const g = this.world.grid;
    const blocked = (pt) => this.world.zombies.some((z) => z.alive && Math.hypot(z.pos.x - pt.x, z.pos.z - pt.z) < 0.8);
    let out = h.out;
    if (!pulled && blocked(out)) {
      const mid = toWorld(h.cell.x, h.cell.z);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = { x: h.cell.x + dx, z: h.cell.z + dz };
        const pt = { x: mid.x + dx * CELL * 0.75, z: mid.z + dz * CELL * 0.75 };
        if (walkable(g, c.x, c.z) && !blocked(pt)) {
          out = pt;
          break;
        }
      }
    }
    this.pos.set(out.x, 0, out.z);
    this.torchOn = h.torch;
    this.hidden = null;
    this.breathHeld = false;
    this.body.outer.visible = true;
    this.rig.root.visible = true;
    this.showGun();
    this.busy = pulled ? 0.3 : 0.4;
    this.yaw = h.yaw;
    this.camYaw = h.yaw;
    this.camDist = undefined;
    if (!pulled) this.world.audio?.play('grab');
  }
  // One of them found her under there.
  foundBy(z) {
    if (!this.hidden) return;
    this.world.audio?.play('snarl', z.pos, { gain: 1.3 });
    this.world.audio?.play('sting');
    this.addTrauma(0.6);
    this.leaveHide(true);
    z.lostHer = false;
    z.alert(this.pos, true);
    this.world.hud?.toast('It found you', 'bad');
  }
  // Under there: she can look out (not far round), hold her breath, come out. Nothing else.
  updateHidden(dt, camera) {
    const h = this.hidden;
    const inp = this.input;
    h.t = Math.min(1, h.t + dt * 2.2);
    // Sliding under: from where she stood to under the middle; then the body is out of the view.
    const k = h.t * h.t * (3 - 2 * h.t);
    this.pos.set(h.out.x + (h.at.x - h.out.x) * k, 0, h.out.z + (h.at.z - h.out.z) * k);
    this.body.outer.visible = h.t < 0.6;
    this.rig.root.visible = false;
    this.group.rotation.y = this.yaw = h.yaw;
    this.anim.play({ full: this.idleClip(), fade: 0.2 });
    this.rig.update(dt, { on: false });
    for (const key of ['fire', 'firePressed', 'reload', 'melee', 'cover', 'slot', 'crouch', 'torch', 'shoulder']) inp[key] = key === 'slot' ? null : false;
    if (inp.interact) {
      inp.interact = false;
      if (h.t >= 1) this.leaveHide();
      if (!this.hidden) return this.placeCamera(camera, dt);
    }
    // Her breath: held while the right mouse is (it runs out in seven seconds, then she gasps, loud).
    const want = inp.aim && this.breath > 0;
    if (want && !this.breathHeld) this.world.audio?.play('breathIn', null, { gain: 0.6 });
    if (!want && this.breathHeld) this.world.audio?.play('breathOut', null, { gain: 0.8 });
    this.breathHeld = want;
    if (this.breathHeld) {
      this.breath = Math.max(0, this.breath - dt / 7);
      if (this.breath <= 0) {
        this.breathHeld = false;
        inp.aim = false;
        this.world.audio?.play('gasp');
        this.world.noise(this.pos, 5);
        for (const z of this.world.zombies) if (z.alive && Math.hypot(z.pos.x - this.pos.x, z.pos.z - this.pos.z) < 5) z.notice += 0.55;
      }
    } else this.breath = Math.min(1, this.breath + dt / 4);
    this.moving = this.sprinting = this.aiming = false;
    this.placeCamera(camera, dt);
    this.prompt = h.t >= 1 ? `E · Come out${this.breathHeld ? '' : ' · right mouse: hold your breath'}` : null;
    this.coverHint = null;
  }
  // The view from under it: on the floor, looking out between its legs, a little room to look round.
  placeHiddenCamera(camera, dt) {
    const h = this.hidden;
    const C = this.cam;
    const span = 1.05;
    const off = angleDiff(h.yaw, this.camYaw);
    if (Math.abs(off) > span) this.camYaw = h.yaw + Math.sign(off) * span;
    this.camPitch = Math.max(-0.25, Math.min(0.28, this.camPitch));
    const { dir } = this.cameraVectors();
    const low = h.kind === 'bed' ? 0.24 : 0.36;
    // Her breathing moves the view; held, it is still.
    const breathe = this.breathHeld ? 0 : Math.sin(C.t * (2 + (this.world.fear?.level ?? 0) * 3)) * 0.008;
    const eye = new THREE.Vector3(h.at.x, low + breathe, h.at.z).addScaledVector(new THREE.Vector3(Math.sin(h.yaw), 0, Math.cos(h.yaw)), 0.05);
    // Easing down there from the shoulder camera as she slides under.
    const k = h.t * h.t * (3 - 2 * h.t);
    const from = this.camPos ?? eye;
    const pos = from.clone().lerp(eye, k);
    camera.position.copy(pos);
    camera.lookAt(pos.clone().add(dir));
    const sh = this.trauma * this.trauma;
    camera.rotateZ(Math.sin(C.t * 19) * sh * 0.05);
    const fov = 64 - (this.world.fear?.pulse ?? 0) * (this.world.fear?.level ?? 0) * 1.6;
    if (Math.abs(camera.fov - fov) > 0.01) ((camera.fov = fov), camera.updateProjectionMatrix());
    if (k >= 1) this.camPos = pos.clone();
    this.torch.visible = false;
  }

  // A bite. `grabbed`: it still has arms (a worse bite).
  bitten(zombie, grabbed) {
    if (!this.alive) return;
    if (this.hidden) this.leaveHide(true);
    // The sandbox: no damage. She feels it (a jolt, a flash) and it is counted.
    if (this.world.sandbox) {
      this.hurtFlash = 0.6;
      this.addTrauma(0.35);
      this.world.audio?.play('hurt');
      this.world.score.bites = (this.world.score.bites ?? 0) + 1;
      return;
    }
    const res = Math.min(0.75, this.world.skills.resistance);
    this.hp -= grabbed ? 18 : 12;
    this.bites++;
    this.bleeding = true;
    this.hurtFlash = 1;
    this.shake = Math.max(this.shake, 0.18);
    this.world.audio?.play('hurt');
    if (!this.infected) {
      this.infected = true;
      this.turnIn = 240 * (1 + res);
      this.world.hud?.toast("You're bitten. You're infected. Save as many as you can.", 'bad', 5000);
    } else {
      this.turnIn -= 45 * (1 - res);
      this.world.hud?.toast('Bitten again: less time.', 'bad');
    }
    this.leaveCover();
    // Shoved back a step.
    const away = new THREE.Vector3().subVectors(this.pos, zombie.pos).setY(0).normalize();
    slide(this.world.grid, this.pos, away.x * 0.5, away.z * 0.5, RADIUS);
    if (this.gunOut) this.anim.play({ lower: this.lowerClip(), upper: 'Hit_Chest', once: true, fade: 0.05, then: () => this.aimPose() });
    else this.anim.play({ full: 'Hit_Chest', once: true, fade: 0.05, then: () => this.anim.play({ full: this.idleClip(), fade: 0.1 }) });
    if (this.hp <= 0) this.die('killed');
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.bleeding = false;
    this.world.audio?.play('heal');
  }

  die(how) {
    if (!this.alive) return;
    this.alive = false;
    this.dead = how;
    this.cover = null;
    this.anim.play({ full: how === 'turned' ? (this.body.clips.sway ? 'sway' : 'Idle_Loop') : 'Death01', once: how !== 'turned', fade: 0.2 });
    this.face.mood = how === 'turned' ? 'angry' : 'blank';
    this.torchOn = false;
    // The gun falls from her hands.
    for (const g of Object.values(this.guns)) g.visible = false;
    this.rig.cancelReload();
    this.world.over(how);
  }

  idleClip() {
    return this.crouched ? (this.body.clips.crouchIdle ? 'crouchIdle' : 'Crouch_Idle_Loop') : this.body.clips.idle ? 'idle' : 'Idle_Loop';
  }
  lowerClip() {
    if (this.crouched) return this.moving ? 'Crouch_Fwd_Loop' : this.body.clips.crouchIdle ? 'crouchIdle' : 'Crouch_Idle_Loop';
    return this.moving ? (this.body.clips.walk ? 'walk' : 'Jog_Fwd_Loop') : this.body.clips.idle ? 'idle' : 'Idle_Loop';
  }
  aimPose() {
    if (!this.alive) return;
    this.anim.play({ lower: this.lowerClip(), upper: 'Pistol_Aim_Neutral', fade: 0.15 });
  }

  switchTo(slot) {
    if (!this.weapons[slot]) return;
    if (this.reloading > 0) {
      this.rig.cancelReload();
      this.reloading = 0;
      this.reloadWeapon = null;
      this.world.hud?.reloadEnd();
    }
    this.current = slot;
    this.swingFrom = null;
    this.showGun();
    this.world.hud?.hint(this.weapon.def.name);
    this.aimHold = 0;
  }

  update(dt, camera) {
    this.anim.update(dt);
    this.face.update(dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    this.shake = Math.max(0, this.shake - dt * 0.6);
    if (!this.alive) {
      this.placeCamera(camera, dt);
      return;
    }
    const inp = this.input;
    this.cooldown -= dt;
    this.busy -= dt;
    this.aimHold -= dt;
    // A reload ends when the rig's timeline does (an active reload shortens it, a fumble lengthens it).
    if (this.reloading > 0 && !this.rig.reload) this.reloading = 0;
    if (this.swinging > 0) {
      this.swinging -= dt;
      if (this.swingHitAt !== null && this.swinging <= this.swingDef.swing - this.swingHitAt) {
        this.landSwing();
        this.swingHitAt = null;
      }
      if (this.swinging <= 0 && this.swingFrom) {
        this.current = this.swingFrom;
        this.swingFrom = null;
        this.showGun();
      }
    }
    // Infection and bleeding.
    if (this.infected) {
      this.turnIn -= dt;
      if (this.turnIn <= 0) return this.die('turned');
    }
    if (this.bleeding) {
      this.hp -= dt * 0.7;
      if (this.hp <= 0) return this.die('bled');
    }

    if (this.hidden) return this.updateHidden(dt, camera);
    // One-shot inputs.
    if (inp.slot) {
      this.switchTo(inp.slot);
      inp.slot = null;
    }
    if (inp.crouch) {
      inp.crouch = false;
      if (this.cover?.kind === 'low') this.leaveCover();
      else {
        this.crouched = !this.crouched;
        if (this.body.clips[this.crouched ? 'crouchIn' : 'crouchOut']) this.busy = Math.max(this.busy, 0.3);
      }
    }
    if (inp.cover) {
      inp.cover = false;
      this.toggleCover();
    }
    if (inp.shoulder) {
      inp.shoulder = false;
      if (!this.cover) this.shoulder = this.homeShoulder = -this.homeShoulder;
    }
    if (inp.torch) {
      inp.torch = false;
      this.torchOn = !this.torchOn;
    }
    if (inp.reload) {
      inp.reload = false;
      this.reload();
    }
    this.bloom = Math.max(0, (this.bloom ?? 0) - dt * (this.weapon.def.auto ? 2.2 : 3));
    if (inp.melee) {
      inp.melee = false;
      this.swing();
    }
    if (inp.interact) {
      inp.interact = false;
      this.world.interact();
    }
    const aimWanted = inp.aim && this.gunOut && this.busy <= 0 && !this.sprinting;
    this.aiming = aimWanted;
    const inAimPose = (this.aiming || this.aimHold > 0 || this.reloading > 0) && this.gunOut;
    if (inp.fire && (inp.firePressed || this.weapon.def.auto)) {
      inp.firePressed = false;
      if (this.gunOut) this.fire(camera);
      else this.swing();
    }

    // Movement, relative to the camera.
    const { dir, right } = this.cameraVectors();
    const fwd = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const move = new THREE.Vector3().addScaledVector(fwd, inp.fwd).addScaledVector(right, inp.side);
    const wantMove = move.lengthSq() > 0 && this.busy <= 0 && this.swinging <= 0;
    if (wantMove) move.normalize();
    let speed = 0;
    if (this.cover) {
      const s = this.moveInCover(dt, wantMove ? move : new THREE.Vector3(), inAimPose);
      if (s >= 0) speed = s;
    }
    if (!this.cover) {
      this.peek += (0 - this.peek) * Math.min(1, dt * 5);
      this.lean = 0;
      this.sprinting = wantMove && inp.sprint && !this.crouched && !inp.aim && !(inp.fire && this.gunOut);
      speed = !wantMove ? 0 : this.sprinting ? SPEED.sprint : this.crouched ? (inAimPose ? SPEED.crouchAim : SPEED.crouch) : inAimPose ? SPEED.aim : SPEED.walk;
      if (speed > 0) slide(this.world.grid, this.pos, move.x * speed * dt, move.z * speed * dt, RADIUS);
    } else this.sprinting = false;
    this.moving = speed > 0;
    // Not through the infected either (a crawler's body is underfoot: only its middle pushes).
    for (const z of this.world.zombies) {
      if (!z.alive) continue;
      const dx = this.pos.x - z.pos.x, dz = this.pos.z - z.pos.z;
      const d = Math.hypot(dx, dz);
      const min = z.down ? 0.45 : 0.65;
      if (d < min && d > 1e-3) slide(this.world.grid, this.pos, (dx / d) * (min - d), (dz / d) * (min - d), RADIUS);
    }
    // Footsteps (crouched: silent).
    if (this.moving && !this.crouched) {
      this.stepIn -= dt * speed;
      if (this.stepIn <= 0) {
        this.stepIn = 1.25;
        this.world.audio?.play('step');
      }
    }
    // Facing: the camera when aiming; along the surface in tall cover, into it in low cover; the way she walks otherwise.
    if (inAimPose) this.yaw = turnTo(this.yaw, this.camYaw, dt * 14);
    else if (this.cover?.kind === 'tall') {
      const cv = this.cover;
      const f = cv.tUnit.clone().multiplyScalar(cv.side).addScaledVector(new THREE.Vector3(cv.n.x, 0, cv.n.z), 0.35);
      this.yaw = turnTo(this.yaw, Math.atan2(f.x, f.z), dt * 10);
    } else if (this.cover) this.yaw = turnTo(this.yaw, Math.atan2(-this.cover.n.x, -this.cover.n.z), dt * 10);
    else if (this.moving) this.yaw = turnTo(this.yaw, Math.atan2(move.x, move.z), dt * 12);
    this.group.rotation.y = this.yaw;
    // Behind low cover, aiming stands her up to shoot over it; the rest of the time she keeps down.
    if (this.cover?.kind === 'low') this.crouched = !inAimPose;

    // Animation.
    if (this.busy <= 0 && this.swinging <= 0) {
      // The legs and the breathing come from the clips; with a gun out the rig has her arms, her aim and her reloads.
      const clip = !this.moving ? this.idleClip() : this.crouched ? 'Crouch_Fwd_Loop' : this.sprinting ? (this.body.clips.sprint ? 'sprint' : 'Jog_Fwd_Loop') : this.body.clips.walk ? 'walk' : 'Jog_Fwd_Loop';
      const ts = this.moving ? Math.max(0.6, Math.min(1.8, speed / (this.anim.speedOf(clip) || speed))) : 1;
      if (this.gunOut) this.anim.play({ full: clip, fade: 0.2, timeScale: ts });
      else if (inAimPose) {
        this.anim.play({ lower: this.lowerClip(), upper: 'Pistol_Aim_Neutral', fade: 0.15, timeScale: 1 });
        this.setLowerSpeed(speed);
      } else this.anim.play({ full: clip, fade: 0.2, timeScale: ts });
    }
    // The rig: the gun where she aims, her hands on it. Off for the knife and the bat, a swing, a stealth kill, death.
    this.world.camera.updateMatrixWorld();
    const ar = this.aimRay(this.world.camera);
    const ah = this.world.trace(ar.origin, ar.dir, 60);
    this.rig.aimPoint.copy(ah && ah.dist > (this.camDist ?? 2) + 0.6 ? ah.point : ar.origin.clone().addScaledVector(ar.dir, 30));
    this.rig.update(dt, {
      on: this.gunOut && this.swinging <= 0 && this.busy <= 0 && this.alive,
      // Reloads happen up in front of her, where the camera sees them (the rig tilts the gun from the aim).
      aim: inAimPose || this.aiming,
      sprint: this.sprinting,
      cover: !!this.cover && !inAimPose
    });
    this.rigEvents();
    this.spreadNow = (this.aiming ? this.weapon.def.aimSpread ?? 0 : this.weapon.def.spread ?? 0) * (this.moving ? 1.6 : 1) * (1 + (this.bloom ?? 0) * 0.8);
    this.placeCamera(camera, dt);
    this.coverHint = !this.cover && this.world.state === 'playing' ? this.findCover() : null;
    this.prompt = this.world.promptFor() ?? (this.coverHint && this.coverHint.gap < 0.75 && !this.moving ? 'Q · Take cover' : null);
  }

  // A long gun is held in two hands: the left hand goes to its handguard, its pump, the bat's grip.
  supportHand() {
    const info = this.gunInfo[this.weaponKey];
    if (!info?.support || !this.arm.up || this.swinging > 0 || this.busy > 0 || this.reloading > 0) return;
    const g = this.guns[this.weaponKey];
    this.body.outer.updateMatrixWorld(true);
    const target = g.localToWorld(info.support.clone());
    const pole = new THREE.Vector3(Math.sin(this.yaw + 1.9), -0.6, Math.cos(this.yaw + 1.9));
    reach(this.arm.up, this.arm.low, this.arm.hand, target, pole, 1);
  }

  setLowerSpeed(speed) {
    const lower = this.anim.layers.lower;
    if (!lower) return;
    const clip = lower.name.replace('/lower', '');
    const s = this.anim.speedOf(clip);
    lower.action.timeScale = this.moving && s ? Math.max(0.6, Math.min(1.6, speed / s)) : 1;
  }
}
