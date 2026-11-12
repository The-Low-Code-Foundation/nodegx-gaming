// What is in your hand: the cutter (with flares; round 7, it was a pick with torches), rubble to build with, the multitool, the grappling hook. Standard
// rounds and rubble never run out; the special ammo from the portals does (ammo.mjs says what each kind does, this
// file makes it happen). The hand is drawn on top of the world, as Minecraft's held items are: pixel drawings pushed
// out into slabs, and little voxel models, held in blocky arms.
import * as THREE from 'three';
import { B, BLOCKS, torchFor, isPlant } from './blocks.mjs';
import { sfx } from './audio.mjs';
import { makeItems, makeClaw, makeThrownTorch, handMaterials } from './items.mjs';
import { brightness } from './world.mjs';
import { STANDARD, AMMO_BY_ID } from './ammo.mjs';
// Seconds between standard rounds on auto (single shot is the round's own 0.35).
export const AUTO_COOL = 0.11;
// Where the multitool is held, right and down from the middle of the view (the hand's frame). Set so the end of the
// barrel sits where the tracer has always started (TRACER_FROM): round 8b moved the tracer onto the barrel instead,
// and the play-tester found its angle wrong; the gun moves to the tracer, not the tracer to the gun.
export const GUN_AT = [0.309, -0.207]; // solved in the game (Newton on the two screen positions); was [0.2, -0.22]
// The tracer's start, from the eye in the camera's frame (right, up), then this far along the shot.
export const TRACER_FROM = [0.12, -0.12, 0.6];
// Bullet holes: a small square drawn once, seen for six seconds (the last 1.2 fading).
const HOLE = { geo: new THREE.PlaneGeometry(0.16, 0.16), tex: null, life: 6 };
function holeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const img = g.createImageData(32, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const r = Math.hypot(x - 15.5, y - 15.5) / 15.5 + (Math.random() - 0.5) * 0.12;
      const o = (x + y * 32) * 4;
      // A black core, a scorched grey ring, chipped edges fading out.
      const [v, a] = r < 0.38 ? [8, 250] : r < 0.62 ? [40, 210] : r < 0.95 ? [70, Math.max(0, 160 * (1 - (r - 0.62) / 0.33))] : [0, 0];
      img.data.set([v, v, v, a], o);
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export const SLOTS = [
  { id: 'pick', label: 'Cutter', endless: true },
  { id: 'rubble', label: 'Rubble', endless: true },
  { id: 'gun', label: 'Multitool', ammo: 'gun', endless: true },
  { id: 'hook', label: 'Hook' }
];
// The grappling hook: how far it reaches, and how fast the claw flies out and comes back.
export const HOOK_RANGE = 48;
const HOOK_OUT = 110, HOOK_BACK = 140;
const solidId = (id) => BLOCKS[id].solid;

const UP = new THREE.Vector3(0, 1, 0);
const breakable = (id) => id !== B.AIR && Number.isFinite(BLOCKS[id].hard);
const jitter = (d, s) => (s ? d.clone().add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s)).normalize() : d.clone());

export class Hand {
  constructor(camera, scene, world, mobs, atlas) {
    this.camera = camera;
    this.scene = scene;
    this.world = world;
    this.mobs = mobs;
    this.player = null; // set by the game
    this.hooks = null; // set by the game
    this.root = new THREE.Group();
    camera.add(this.root);
    this.m = makeItems(atlas);
    camera.add(this.m.torch);
    for (const k of ['pick', 'rubble', 'rifle', 'hook']) {
      this.root.add(this.m[k]);
      this.m[k].visible = false;
    }
    // The hook out in the world: the claw, and the rope back to the launcher's nose.
    this.claw = makeClaw();
    this.rope = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), new THREE.MeshBasicMaterial({ color: 0xd8c8a0 }));
    this.hk = null; // { phase: 'out' | 'held' | 'back', pos, end, hit, dir }
    this.slot = 0;
    this.swing = 0;
    this.cooldown = 0;
    this.aimT = 0;
    // The recoil: a spring the shot kicks (the gun back and up, the view up a touch), which settles in a quarter second.
    this.kick = 0;
    this.kickV = 0;
    this.roll = 0;
    this.camKick = 0;
    this.camKickV = 0;
    this.shake = 0;
    this.casings = []; // spent cases, out in the world
    this.thrown = []; // flares in the air
    // The cutter's beam (round 7): a bright core inside a softer sheath, from the lens to what it is cutting.
    const beamGeo = new THREE.BoxGeometry(1, 1, 1);
    beamGeo.translate(0, 0, 0.5); // along +z: lookAt turns an object's +z to the target
    this.cutBeam = new THREE.Group();
    // (Warm, not white: a white additive line vanished against grass in daylight.)
    for (const [w, col, op] of [[0.026, 0xffe08a, 1], [0.06, 0xff7a1a, 0.7]]) {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.scale.set(w, w, 1);
      m.renderOrder = 1002;
      this.cutBeam.add(m);
    }
    this.cutBeam.visible = false;
    scene.add(this.cutBeam);
    this.sparkT = 0;
    this.shots = []; // in flight (and bolts stuck in walls)
    this.particles = [];
    this.fx = []; // explosions, beams, bolts, black holes: each steps itself and says when it is done
    this.fired = { gun: 0, hook: 0 };
    this.select(0);
  }

  get id() {
    return SLOTS[this.slot].id;
  }

  weapon() {
    return this.id === 'gun' || this.id === 'hook' ? this.id : null;
  }

  select(i) {
    this.slot = (i + SLOTS.length) % SLOTS.length;
    const show = { pick: 'pick', rubble: 'rubble', gun: 'rifle', hook: 'hook' }[this.id];
    for (const k of ['pick', 'rubble', 'rifle', 'hook']) this.m[k].visible = k === show;
    this.m.torch.visible = this.id === 'pick';
  }

  // What is loaded: the special kind picked for this weapon while any is left, or the standard.
  ammoFor(kind, pack) {
    const id = pack.loaded?.[kind];
    return id && pack.ammo?.[id] > 0 && AMMO_BY_ID[id] ? AMMO_BY_ID[id] : STANDARD[kind];
  }

  spend(kind, pack, a) {
    if (!a.id) return;
    pack.ammo[a.id]--;
    if (pack.ammo[a.id] > 0) return;
    delete pack.ammo[a.id];
    pack.loaded[kind] = null;
    this.hooks.toast(`That was the last ${a.name}. Back to standard rounds.`);
  }

  // Fire what is in hand: the multitool, or the grappling hook.
  trigger(pack, eye, dir, aiming) {
    if (this.id === 'hook') return this.throwHook(eye, dir);
    if (this.id !== 'gun' || this.cooldown > 0) return null;
    const a = this.ammoFor('gun', pack);
    // Standard rounds on auto: quicker, with a lighter kick per shot.
    const auto = !a.id && pack.fireMode === 'auto';
    this.cooldown = auto ? AUTO_COOL : a.cool;
    // The kick: harder for a heavy shot, a little to one side or the other each time.
    const heavy = !a.fire.ray || (a.fire.pellets ?? 1) > 1 ? 1.5 : a.id ? 1.2 : 1;
    this.kickV += 9 * heavy * (aiming ? 0.6 : 1) * (auto ? 0.55 : 1);
    this.camKickV += 0.55 * heavy * (aiming ? 0.5 : 1) * (auto ? 0.45 : 1);
    this.roll = (Math.random() - 0.5) * 0.12 * heavy;
    const f = this.m.flash;
    f.visible = true;
    f.rotation.z = Math.random() * Math.PI;
    f.scale.setScalar(0.85 + Math.random() * 0.4 + (heavy - 1) * 0.5);
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => (f.visible = false), 55);
    if (a.fire.beam) sfx.laser();
    else if (a.fire.ray) sfx.gun((a.fire.pellets ?? 1) > 1 ? 'shotgun' : a.id ? 'heavy' : 'standard');
    else sfx.launch();
    if (a.fire.ray && !a.fire.beam) this.eject();
    this.fired.gun++;
    this.spend('gun', pack, a);
    this.mobs.noise(eye, a.loud, true);
    this.release(a, eye, dir, aiming ? 0.002 : 0.02);
    this.hooks.flash(a.id ? 0.2 : 0.12);
    return null;
  }

  // ── the grappling hook ──
  // What the hook would catch on from here, if anything: the first solid block within its reach.
  hookReach(eye, dir) {
    return this.world.raycast(eye, dir, HOOK_RANGE, solidId);
  }

  // Throw the claw. It flies to the rock the crosshair is on and catches; with nothing in reach it flies out to the
  // end of the rope and comes back. A throw while already on the rope lets go of the old one (that is how you
  // climb: catch, ride up, throw again before you fall).
  throwHook(eye, dir) {
    if (this.cooldown > 0 || this.hk?.phase === 'out') return null;
    this.cooldown = 0.12;
    const hit = this.hookReach(eye, dir);
    if (this.player.hook) this.player.letGo();
    const from = this.nose();
    this.hk = { phase: 'out', pos: from, end: eye.clone().addScaledVector(dir, hit ? Math.max(0, hit.t - 0.02) : HOOK_RANGE), hit, dir: dir.clone() };
    this.claw.position.copy(from);
    this.claw.lookAt(this.hk.end);
    this.scene.add(this.claw, this.rope);
    this.m.claw.visible = false;
    this.fired.hook++;
    sfx.bow();
    this.mobs.noise(eye, 4, true);
    return null;
  }

  // Where the rope leaves the launcher, in the world.
  cutterNose() {
    this.camera.updateMatrixWorld(true);
    return this.m.cutterNose.getWorldPosition(new THREE.Vector3());
  }

  nose() {
    this.camera.updateMatrixWorld(true);
    return this.m.nose.getWorldPosition(new THREE.Vector3());
  }

  // Where the hook takes you once it has caught. On the block's top, or on top of it and up to two more above it
  // when the face it caught is a side (a ledge's lip): standing room there means you end up standing on it.
  // Otherwise you hang just off the face, below the claw, and let go.
  catchAt(hit, at) {
    const W = this.world, pl = this.player;
    const solid = (x, y, z) => BLOCKS[W.get(x, y, z)].solid;
    if (hit.n[1] >= 0)
      for (let k = 0; k <= 2; k++) {
        const y = hit.y + k;
        if (!solid(hit.x, y, hit.z)) break;
        if (!pl.collides(W, hit.x + 0.5, y + 1.01, hit.z + 0.5)) return { to: new THREE.Vector3(hit.x + 0.5, y + 1.01, hit.z + 0.5), ledge: true };
      }
    const n = new THREE.Vector3(...hit.n);
    const to = at.clone().addScaledVector(n, 0.45);
    to.y -= hit.n[1] < 0 ? 1.95 : 1.3;
    for (let k = 0; k < 4 && pl.collides(W, to.x, to.y, to.z); k++) to.addScaledVector(n, 0.4).y -= hit.n[1] < 0 ? 0.4 : 0;
    return { to, ledge: false };
  }

  stepHook(dt) {
    const h = this.hk;
    if (!h) return;
    const nose = this.nose();
    if (h.phase === 'out') {
      const to = h.end.clone().sub(h.pos);
      const d = to.length();
      if (d <= HOOK_OUT * dt) {
        h.pos.copy(h.end);
        if (h.hit) {
          const { to: target, ledge } = this.catchAt(h.hit, h.end);
          this.player.grapple(target, ledge);
          h.phase = 'held';
          sfx.thunk();
          this.burst(h.end, 0x9a8a7a, 5, 0.6);
        } else h.phase = 'back';
      } else h.pos.addScaledVector(to, (HOOK_OUT * dt) / d);
    } else if (h.phase === 'held') {
      if (!this.player.hook) h.phase = 'back';
    } else {
      const to = nose.clone().sub(h.pos);
      const d = to.length();
      if (d <= HOOK_BACK * dt + 0.3) {
        this.hk = null;
        this.scene.remove(this.claw, this.rope);
        this.m.claw.visible = true;
        return;
      }
      h.pos.addScaledVector(to, (HOOK_BACK * dt) / d);
    }
    this.claw.position.copy(h.pos);
    if (h.phase === 'out') this.claw.lookAt(h.end);
    const len = nose.distanceTo(h.pos);
    this.rope.position.copy(nose).lerp(h.pos, 0.5);
    this.rope.scale.set(1, 1, Math.max(0.01, len));
    this.rope.lookAt(h.pos);
  }

  release(a, eye, dir, spread) {
    const n = a.fire.pellets ?? 1;
    for (let k = 0; k < n; k++) {
      const d = jitter(dir, (a.fire.spread ?? 0) + spread);
      if (a.fire.ray) this.ray(a, eye, d);
      else this.launch(a, eye.clone().addScaledVector(dir, 0.6), d);
    }
  }

  // ── instant shots ──
  ray(a, eye, d) {
    const f = a.fire;
    const solid = (id) => BLOCKS[id].solid || BLOCKS[id].opaque;
    // The laser burns through a few blocks first.
    for (let k = 0; k < (f.burn ?? 0); k++) {
      const b = this.world.raycast(eye, d, f.ray, solid);
      if (!b || !breakable(b.id)) break;
      this.world.set(b.x, b.y, b.z, B.AIR);
      this.loot(b.id, b.x, b.y, b.z);
    }
    const block = this.world.raycast(eye, d, f.ray, solid);
    const end = block ? block.t : f.ray;
    const hits = f.pierce ? this.mobs.rayHitAll(eye, d, end) : [this.mobs.rayHit(eye, d, end)].filter(Boolean);
    const muzzle = this.muzzle(eye, d);
    this.lastMuzzle = muzzle.clone();
    const stop = hits.length && !f.pierce ? hits[0].t : end;
    const p = eye.clone().addScaledVector(d, Math.max(0, stop - 0.05));
    if (f.beam) this.beam(muzzle, p, a.color, 0.18, 0.05);
    else this.beam(muzzle, p, a.id ? a.color : '#fff2c0', 0.05, 0.012);
    for (const h of hits) {
      if (f.dmg) this.hurt(h.mob, h.head ? f.dmg * 3 : f.dmg, h.head);
      this.burst(eye.clone().addScaledVector(d, h.t), 0x9a2a1a, 8);
    }
    if (!hits.length && block) {
      this.burst(p, 0xbbbbbb, 6);
      if (!f.beam) this.bulletHole(eye.clone().addScaledVector(d, block.t), block);
    }
    const first = hits[0] && !f.pierce ? hits[0] : null;
    this.impact(a, p, { mob: first?.mob, block: first ? null : block, dir: d });
  }

  // Where a shot leaves the multitool, in the world: the end of the barrel as it is drawn (the muzzle flash sits
  // there), so the tracer comes out of the barrel. With the sight up the gun is hidden: just under the eye.
  muzzle(eye, d) {
    if (this.id === 'gun' && this.root.visible) {
      this.camera.updateMatrixWorld(true);
      this.root.updateMatrixWorld(true);
      return this.m.flash.getWorldPosition(new THREE.Vector3());
    }
    return eye.clone().add(new THREE.Vector3(0, -0.06, 0).applyQuaternion(this.camera.quaternion)).addScaledVector(d, 0.6);
  }

  // A bullet hole where a round hit a block: a dark mark flat on the face, gone after a few seconds (or with the
  // block). At most forty at once; the oldest goes first.
  bulletHole(at, block) {
    if (!HOLE.tex) HOLE.tex = holeTexture();
    const m = new THREE.Mesh(HOLE.geo, new THREE.MeshBasicMaterial({ map: HOLE.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true }));
    const n = new THREE.Vector3(...block.n);
    m.position.copy(at).addScaledVector(n, 0.012);
    m.lookAt(m.position.clone().add(n));
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(0.8 + Math.random() * 0.4);
    this.scene.add(m);
    const holes = this.fx.filter((f) => f.hole);
    if (holes.length >= 40) holes[0].t = HOLE.life;
    const fx = { mesh: m, hole: true, t: 0, step: (dt) => {
      fx.t += dt;
      m.material.opacity = Math.min(1, (HOLE.life - fx.t) / 1.2);
      return fx.t < HOLE.life && this.world.get(block.x, block.y, block.z) === block.id;
    } };
    this.fx.push(fx);
  }

  // ── things that fly: bolts, rockets, bombs ──
  launch(a, pos, dir) {
    const f = a.fire;
    const arrow = !!f.bolt;
    let mesh;
    if (arrow) {
      mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.7), new THREE.MeshBasicMaterial({ color: 0xc8b08a })));
      if (a.id) {
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.14), new THREE.MeshBasicMaterial({ color: a.color, fog: false }));
        tip.position.z = 0.33;
        mesh.add(tip);
      }
    } else {
      const s = f.size ?? 0.1;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s * 1.8), new THREE.MeshBasicMaterial({ color: a.color, fog: false }));
    }
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const speed = arrow ? 46 : f.speed;
    this.shots.push({
      a, mesh, pos: pos.clone(), vel: dir.clone().multiplyScalar(speed), arrow, gravity: arrow ? 14 : f.gravity ?? 0,
      bounce: f.bounce ?? 0, fuse: f.fuse ?? (arrow ? 12 : 8), homing: f.homing ?? 0, dmg: f.dmg ?? 0,
      age: 0, stuck: false, puff: 0
    });
  }

  stepShots(dt) {
    for (const s of [...this.shots]) {
      s.age += dt;
      if (s.stuck) {
        if (s.age > 30) this.dropShot(s);
        continue;
      }
      if (s.homing) {
        const target = this.nearestAhead(s.pos, s.vel, 30);
        if (target) {
          const speed = s.vel.length();
          const want = target.clone().sub(s.pos).normalize().multiplyScalar(speed);
          s.vel.lerp(want, Math.min(1, dt * s.homing * 0.5));
        }
      }
      s.vel.y -= s.gravity * dt;
      const step = s.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const d = step.clone().normalize();
      const block = this.world.raycast(s.pos, d, len, (id) => BLOCKS[id].solid);
      const mob = this.mobs.rayHit(s.pos, d, block ? block.t : len);
      if (mob) {
        const at = s.pos.clone().addScaledVector(d, mob.t);
        if (s.dmg) this.hurt(mob.mob, mob.head ? s.dmg * 2 : s.dmg, mob.head);
        this.burst(at, 0x9a2a1a, 6);
        this.impact(s.a, at, { mob: mob.mob, dir: d });
        this.dropShot(s);
        continue;
      }
      if (block) {
        if (s.bounce > 0) {
          // Off the face it hit, losing a little each time.
          s.bounce--;
          s.pos.addScaledVector(d, Math.max(0, block.t - 0.05));
          const n = new THREE.Vector3(...block.n);
          s.vel.addScaledVector(n, -2 * s.vel.dot(n)).multiplyScalar(0.7);
          sfx.thunk();
          continue;
        }
        const at = s.pos.clone().addScaledVector(d, Math.max(0, block.t - 0.05));
        this.impact(s.a, at, { block, dir: d });
        if (s.arrow) {
          // Arrows stay in the wall a while (there are always more).
          s.pos.addScaledVector(d, Math.max(0, block.t - 0.25));
          s.mesh.position.copy(s.pos);
          s.stuck = true;
          s.age = 0;
          sfx.thunk();
        } else this.dropShot(s);
        continue;
      }
      s.pos.add(step);
      s.mesh.position.copy(s.pos);
      s.mesh.lookAt(s.pos.clone().add(s.vel));
      if (s.a.fire.trail && (s.puff -= dt) <= 0) {
        s.puff = 0.03;
        this.burst(s.pos, 0x8a8a8a, 1, 0.6);
      }
      if (s.age > s.fuse) {
        this.impact(s.a, s.pos.clone(), { dir: d });
        this.dropShot(s);
      }
    }
  }

  dropShot(s) {
    this.scene.remove(s.mesh);
    const i = this.shots.indexOf(s);
    if (i >= 0) this.shots.splice(i, 1);
  }

  nearestAhead(pos, vel, range) {
    let best = null, bd = range;
    const v = vel.clone().normalize();
    for (const m of this.mobs.list) {
      const c = new THREE.Vector3(m.pos.x, m.pos.y + m.k.h / 2, m.pos.z);
      const to = c.clone().sub(pos);
      const d = to.length();
      if (d < bd && to.normalize().dot(v) > 0.2) [best, bd] = [c, d];
    }
    return best;
  }

  // ── what a shot does where it lands ──
  impact(a, p, { mob = null, block = null, dir }) {
    const h = a.hit;
    if (!h) return;
    const cell = block ? [block.x + block.n[0], block.y + block.n[1], block.z + block.n[2]] : null;
    if (h.burn && mob) mob.burn = Math.max(mob.burn ?? 0, h.burn);
    if (h.freeze) {
      for (const m of this.mobsNear(p, h.freeze.r)) m.frozen = h.freeze.s;
      if (mob) mob.frozen = h.freeze.s;
      this.burst(p, 0xbff0ff, 14, 1.2);
      sfx.freeze();
    }
    if (h.chain && mob) this.chain(mob, h.chain.n, h.chain.dmg, a.color);
    if (h.torch && block && BLOCKS[block.id].solid && this.world.get(...cell) === B.AIR) {
      const id = torchFor(block.n);
      if (id) {
        this.world.set(...cell, id);
        sfx.torch();
      }
    }
    if (h.blink) this.blink(cell ?? [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)]);
    if (h.bridge) this.bridge(p, block);
    if (h.bore && block) this.bore(p, dir, h.bore);
    if (h.shaft && block) this.shaft(block, h.shaft);
    if (h.blast) this.explode(p, h.blast.r, h.blast.dmg, h.blast.quiet);
    if (h.cluster)
      for (let k = 0; k < h.cluster.n; k++) {
        const d = new THREE.Vector3(Math.random() - 0.5, 0.6 + Math.random() * 0.6, Math.random() - 0.5).normalize();
        this.launch({ color: a.color, fire: { speed: 7 + Math.random() * 4, gravity: 14, fuse: 0.9 + Math.random() * 0.8, size: 0.09 }, hit: { blast: { r: h.cluster.r, dmg: h.cluster.dmg } } }, p.clone().add(new THREE.Vector3(0, 0.4, 0)), d);
      }
    if (h.singularity) this.singularity(p, h.singularity);
    if (h.lightning) this.storm(p, h.lightning);
    if (h.starfall)
      for (let k = 0; k < h.starfall.n; k++) {
        const r = Math.sqrt(Math.random()) * h.starfall.r, t = Math.random() * Math.PI * 2;
        const from = p.clone().add(new THREE.Vector3(Math.cos(t) * r, 16 + Math.random() * 10, Math.sin(t) * r));
        this.launch({ color: '#fff0a0', fire: { speed: 26, gravity: 6, size: 0.18, trail: true }, hit: { blast: { r: 2, dmg: h.starfall.dmg } } }, from, new THREE.Vector3((Math.random() - 0.5) * 0.1, -1, (Math.random() - 0.5) * 0.1).normalize());
      }
  }

  hurt(m, n, head = false) {
    if (!this.mobs.list.includes(m) || n <= 0) return;
    const dead = this.mobs.damage(m, n);
    sfx.hit();
    const d = this.player ? m.pos.distanceTo(this.player.pos) : 10;
    if (dead || !(m.voiceAt > performance.now())) {
      m.voiceAt = performance.now() + 450;
      sfx.creature(m.kind, dead ? 'die' : 'hurt', d);
    }
    this.hooks.hitMarker(head);
    if (dead) this.hooks.killed(m);
  }

  mobsNear(p, r) {
    return this.mobs.list.filter((m) => Math.hypot(m.pos.x - p.x, m.pos.y + m.k.h / 2 - p.y, m.pos.z - p.z) < r + m.k.w);
  }

  // What a blast or a drill uncovers: a crate or a cache it breaks still gives what is inside.
  loot(id, x, y, z) {
    if (id === B.CACHE || id === B.CRATE) this.hooks.loot(id, x, y, z);
  }

  explode(p, r, dmg, quiet = false) {
    const cells = [];
    const R = Math.ceil(r);
    const cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z);
    for (let dy = -R; dy <= R; dy++)
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          if (Math.hypot(dx, dy, dz) > r + (Math.random() - 0.5) * 0.8) continue;
          const id = this.world.get(cx + dx, cy + dy, cz + dz);
          if (!breakable(id)) continue;
          cells.push([cx + dx, cy + dy, cz + dz, B.AIR]);
          this.loot(id, cx + dx, cy + dy, cz + dz);
        }
    this.world.setMany(cells);
    for (const m of this.mobsNear(p, r + 1)) {
      const c = new THREE.Vector3(m.pos.x, m.pos.y + m.k.h / 2, m.pos.z);
      const d = c.distanceTo(p);
      const f = Math.max(0, 1 - d / (r + 1));
      m.vel.add(c.sub(p).normalize().multiplyScalar(8 * f)).add(new THREE.Vector3(0, 5 * f, 0));
      this.hurt(m, Math.round(dmg * f));
    }
    const pl = this.player;
    if (quiet) {
      this.burst(p, 0x80ffd0, 30, 2);
      sfx.break();
      return;
    }
    if (pl) {
      const body = pl.pos.clone().add(new THREE.Vector3(0, 0.9, 0));
      const d = body.distanceTo(p);
      const f = Math.max(0, 1 - d / (r + 1.5));
      if (f > 0) {
        this.hooks.bite(Math.min(6, Math.ceil(f * 8)));
        pl.vel.add(body.sub(p).normalize().multiplyScalar(9 * f));
      }
      this.shake = Math.max(this.shake, Math.min(1, (r * 3) / Math.max(4, d)));
      this.hooks.flash(Math.min(0.9, (r * 3) / Math.max(6, d)));
    }
    // The fireball, and what it throws.
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
    ball.position.copy(p);
    this.scene.add(ball);
    let t = 0;
    this.fx.push({
      mesh: ball,
      step: (dt) => {
        t += dt;
        const k = Math.min(1, t / 0.18);
        ball.scale.setScalar(0.2 + r * k);
        ball.material.opacity = 0.9 * Math.max(0, 1 - (t - 0.12) / 0.45);
        ball.material.color.setHex(t < 0.1 ? 0xfff0c0 : 0xff8030);
        return t < 0.6;
      }
    });
    this.burst(p, 0x5a5048, Math.min(60, 10 + r * 6), 1 + r * 0.4);
    this.burst(p, 0xff9a40, Math.min(30, 6 + r * 3), 1 + r * 0.3);
    sfx.boom(r);
    this.mobs.noise(p, 20 + r * 6, false);
  }

  // A tunnel w wide and h high from where the shot landed, onwards along the shot. Shot level, its floor is the
  // block below where it hit, so one fired at eye height makes a tunnel you can walk into.
  bore(p, dir, { len, w, h }) {
    const d = dir.clone().normalize();
    const level = Math.abs(d.y) < 0.7;
    let right = new THREE.Vector3().crossVectors(d, UP);
    if (right.lengthSq() < 0.01) right.set(1, 0, 0);
    right.normalize();
    const side = level ? UP : new THREE.Vector3().crossVectors(right, d).normalize();
    const bs = level ? (h === 2 ? [-1, 0] : h === 3 ? [-1, 0, 1] : [0]) : Array.from({ length: h }, (_, i) => i - (h - 1) / 2);
    const as = Array.from({ length: w }, (_, i) => i - (w - 1) / 2);
    const seen = new Set();
    const cells = [];
    const start = p.clone().addScaledVector(d, 0.05);
    for (let t = 0; t <= len; t += 0.4) {
      const c = start.clone().addScaledVector(d, t);
      for (const a of as)
        for (const b of bs) {
          const q = c.clone().addScaledVector(right, a);
          const x = Math.floor(q.x), y = level ? Math.floor(c.y) + b : Math.floor(q.y + side.y * b), z = Math.floor(q.z + (level ? 0 : side.z * b));
          const k = `${x},${y},${z}`;
          if (seen.has(k)) continue;
          seen.add(k);
          const id = this.world.get(x, y, z);
          if (!breakable(id)) continue;
          cells.push([x, y, z, B.AIR]);
          this.loot(id, x, y, z);
        }
    }
    this.world.setMany(cells);
    this.burst(p, 0x8a7a6a, 16, 1.2);
    sfx.drill();
  }

  // Straight down from the block it hit, with a torch on the wall every eight blocks.
  shaft(block, { depth, w }) {
    const half = Math.floor(w / 2);
    const cells = [];
    for (let y = block.y; y > block.y - depth; y--) {
      for (let dz = -half; dz <= half; dz++)
        for (let dx = -half; dx <= half; dx++) {
          const id = this.world.get(block.x + dx, y, block.z + dz);
          if (!breakable(id)) continue;
          cells.push([block.x + dx, y, block.z + dz, B.AIR]);
          this.loot(id, block.x + dx, y, block.z + dz);
        }
      if ((block.y - y) % 8 === 4 && BLOCKS[this.world.get(block.x + half + 1, y, block.z)].solid) cells.push([block.x + half, y, block.z, B.WALL_TORCH_W]);
    }
    this.world.setMany(cells);
    this.burst(new THREE.Vector3(block.x + 0.5, block.y + 0.5, block.z + 0.5), 0x8a7a6a, 20, 1.5);
    sfx.drill();
  }

  // Rubble from the block under your feet to where the shot landed: level, unless it landed on top of something,
  // when the bridge climbs or falls to meet it.
  bridge(p, block) {
    const pl = this.player;
    const x0 = pl.pos.x, z0 = pl.pos.z, y0 = Math.floor(pl.pos.y) - 1;
    const y1 = block && block.n[1] === 1 ? block.y : y0;
    const L = Math.hypot(p.x - x0, p.z - z0);
    const n = Math.ceil(L * 3);
    const cells = [];
    const seen = new Set();
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = Math.floor(x0 + (p.x - x0) * t), z = Math.floor(z0 + (p.z - z0) * t), y = Math.round(y0 + (y1 - y0) * t);
      const key = `${x},${y},${z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const id = this.world.get(x, y, z);
      if (id === B.AIR || id === B.WATER || id === B.LAVA || BLOCKS[id].shape === 'cross') cells.push([x, y, z, B.COBBLE]);
    }
    this.world.setMany(cells);
    sfx.place();
  }

  blink(cell) {
    const pl = this.player;
    const [x, y, z] = cell;
    for (const dy of [0, 1, -1, 2, -2, 3]) {
      if (pl.collides(this.world, x + 0.5, y + dy, z + 0.5)) continue;
      pl.pos.set(x + 0.5, y + dy, z + 0.5);
      pl.vel.set(0, 0, 0);
      pl.fallFrom = null;
      this.world.plannedAt = null;
      sfx.portal();
      this.hooks.flash(0.5);
      return;
    }
  }

  chain(from, n, dmg, color) {
    const hit = [from];
    let cur = from;
    for (let k = 0; k < n; k++) {
      let next = null, bd = 9;
      for (const m of this.mobs.list) {
        if (hit.includes(m)) continue;
        const d = m.pos.distanceTo(cur.pos);
        if (d < bd) [next, bd] = [m, d];
      }
      if (!next) break;
      const at = (m) => new THREE.Vector3(m.pos.x, m.pos.y + m.k.h * 0.6, m.pos.z);
      this.bolt(at(cur), at(next), color, 0.25);
      this.hurt(next, dmg);
      hit.push(next);
      cur = next;
    }
    sfx.zap();
  }

  storm(p, { n, r, dmg }) {
    let left = n, wait = 0;
    this.fx.push({
      step: (dt) => {
        if ((wait -= dt) > 0) return true;
        wait = 0.18;
        const a = Math.random() * Math.PI * 2, d = r ? Math.sqrt(Math.random()) * r : 0;
        const top = new THREE.Vector3(p.x + Math.cos(a) * d, p.y + 14, p.z + Math.sin(a) * d);
        const ground = this.world.raycast(top, new THREE.Vector3(0, -1, 0), 30, (id) => BLOCKS[id].solid);
        const at = ground ? top.clone().add(new THREE.Vector3(0, -ground.t, 0)) : top.clone().add(new THREE.Vector3(0, -14, 0));
        this.bolt(at.clone().add(new THREE.Vector3(0, 22, 0)), at, '#dff0ff', 0.3, 7);
        for (const m of this.mobsNear(at, 2.5)) {
          m.burn = Math.max(m.burn ?? 0, 3);
          this.hurt(m, dmg);
        }
        this.burst(at, 0xdff0ff, 10, 1.5);
        this.hooks.flash(0.25);
        sfx.thunder();
        this.mobs.noise(at, 40, false);
        return --left > 0;
      }
    });
  }

  singularity(p, { s, r, then }) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: 0xa070ff, transparent: true, opacity: 0.85, fog: false }));
    g.add(core, ring);
    g.position.copy(p);
    this.scene.add(g);
    let t = 0;
    sfx.portal();
    this.fx.push({
      mesh: g,
      step: (dt) => {
        t += dt;
        ring.rotation.x += dt * 4;
        ring.rotation.y += dt * 3;
        g.scale.setScalar(1 + Math.sin(t * 9) * 0.1 + t * 0.3);
        for (const m of this.mobsNear(p, r)) {
          const to = p.clone().sub(m.pos);
          to.y -= m.k.h / 2;
          const d = to.length();
          if (d > 0.3) m.pos.addScaledVector(to.normalize(), Math.min(d, 7 * dt));
          m.vel.set(0, 0, 0);
        }
        if (Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2;
          const from = p.clone().add(new THREE.Vector3(Math.cos(a) * 4, (Math.random() - 0.5) * 3, Math.sin(a) * 4));
          this.burst(from, 0xa070ff, 1, 0.2);
        }
        if (t < s) return true;
        this.explode(p, then.r, then.dmg);
        return false;
      }
    });
  }

  // A straight line of light (a laser, a tracer), fading.
  beam(a, b, color, life, width) {
    const len = a.distanceTo(b);
    if (len < 0.01) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, width, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
    m.position.copy(a).lerp(b, 0.5);
    m.lookAt(b);
    this.scene.add(m);
    let t = 0;
    this.fx.push({ mesh: m, step: (dt) => ((t += dt), (m.material.opacity = 0.9 * (1 - t / life)), t < life) });
  }

  // A jagged line (lightning, an arc between creatures).
  bolt(a, b, color, life, kinks = 4) {
    const pts = [a.clone()];
    for (let k = 1; k < kinks; k++) {
      const q = a.clone().lerp(b, k / kinks);
      pts.push(q.add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.2)));
    }
    pts.push(b.clone());
    for (let k = 0; k < pts.length - 1; k++) this.beam(pts[k], pts[k + 1], color, life, 0.07);
  }

  burst(at, color, n, speed = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color }));
      m.position.copy(at);
      this.scene.add(m);
      this.particles.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 4 * speed, Math.random() * 4 * speed, (Math.random() - 0.5) * 4 * speed), life: 0.5 + Math.random() * 0.4 });
    }
  }

  // A spent case out of the port: brass, spinning off to the right, bouncing once on whatever it meets.
  eject() {
    this.camera.updateMatrixWorld(true);
    const at = this.m.port.getWorldPosition(new THREE.Vector3());
    const q = this.camera.quaternion;
    const v = new THREE.Vector3(2.2 + Math.random(), 1.8 + Math.random(), 0.6).applyQuaternion(q);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.06), new THREE.MeshBasicMaterial({ color: 0xc9a040 }));
    m.position.copy(at);
    this.scene.add(m);
    this.casings.push({ m, v, spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, 0), life: 1.4, bounced: false });
  }

  // A torch thrown where there is nothing near to stick it to (round 5: "a nice throw arc so you can throw torches
  // into holes"). It tumbles end over end and lands on the first floor it meets: off a wall it drops, off a ceiling it
  // falls, and on a floor it stands, lit. Into water or lava it goes out. onLand(cell) puts it in the world; onLand(null)
  // says it was lost.
  throwTorch(eye, dir, onLand) {
    const mesh = makeThrownTorch();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const pos = eye.clone().addScaledVector(dir, 0.5).addScaledVector(right, 0.18).add(new THREE.Vector3(0, -0.15, 0));
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.thrown.push({ mesh, pos, vel: dir.clone().multiplyScalar(15).add(new THREE.Vector3(0, 3.5, 0)), age: 0, spark: 0, onLand });
    this.swing = 0;
    this.throwT = 0.25;
    sfx.whoosh();
  }

  stepThrown(dt) {
    const W = this.world;
    const stops = (id) => BLOCKS[id].solid || id === B.WATER || id === B.LAVA;
    for (const t of [...this.thrown]) {
      t.age += dt;
      t.vel.y -= 25 * dt;
      const step = t.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const d = step.clone().normalize();
      const hit = len > 0 ? W.raycast(t.pos, d, len, stops) : null;
      let done = false;
      if (hit) {
        t.pos.addScaledVector(d, Math.max(0, hit.t - 0.05));
        if (hit.id === B.WATER || hit.id === B.LAVA) {
          this.burst(t.pos, 0x9a9a9a, 6, 0.5);
          sfx.torch();
          t.onLand(null);
          done = true;
        } else if (hit.n[1] === 1) {
          const cell = [hit.x, hit.y + 1, hit.z];
          const here = W.get(...cell);
          if (here === B.AIR || isPlant[here]) {
            t.onLand(cell);
            sfx.place();
            done = true;
          } else t.vel.set(0, -2, 0);
        } else {
          // Off a wall or a ceiling: it loses its way and drops.
          const n = new THREE.Vector3(...hit.n);
          t.vel.addScaledVector(n, -1.25 * t.vel.dot(n)).multiplyScalar(0.25);
          if (hit.n[1] === -1) t.vel.y = -1;
          sfx.thunk();
        }
      } else t.pos.add(step);
      if (!done && t.age > 8) {
        t.onLand(null);
        done = true;
      }
      if (done) {
        this.scene.remove(t.mesh);
        this.thrown.splice(this.thrown.indexOf(t), 1);
        continue;
      }
      t.mesh.position.copy(t.pos);
      t.mesh.rotation.x += dt * 11;
      if ((t.spark -= dt) <= 0) {
        t.spark = 0.04;
        this.burst(t.pos, 0xffc040, 1, 0.3);
      }
    }
  }

  update(dt, I, { digging, aiming, scoped, pack, player, digAt }) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    // The recoil springs: stiff, a little under-damped, so the gun snaps back with the faintest bounce. Stepped in
    // small slices (velocity first), so a slow frame cannot make them overshoot.
    const n = Math.ceil(dt / 0.006), h = dt / n;
    for (let s = 0; s < n; s++) {
      this.kickV += (-260 * this.kick - 24 * this.kickV) * h;
      this.kick += this.kickV * h;
      this.camKickV += (-120 * this.camKick - 18 * this.camKickV) * h;
      this.camKick += this.camKickV * h;
    }
    this.roll *= Math.max(0, 1 - dt * 10);
    this.throwT = Math.max(0, (this.throwT ?? 0) - dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.aimT += ((aiming ? 1 : 0) - this.aimT) * Math.min(1, dt * 12);
    // The hand's pose. Through the scope there is no hand: the sight is the whole screen.
    this.root.visible = !scoped;
    this.swing = digging ? this.swing + dt * 9 : 0;
    const walk = Math.hypot(player.vel.x, player.vel.z) > 0.5 && player.onGround ? player.bob : 0;
    const sway = Math.sin(walk * 2) * 0.012;
    const r = this.root;
    // Round 5 brought everything in closer, to a normal FPS size.
    if (this.id === 'pick') {
      // The cutter, held like a pistol; it hums and shivers while it cuts. A throw is a quick flick of the flare hand.
      const buzz = digging ? (Math.random() - 0.5) * 0.006 : 0;
      r.position.set(0.24 + buzz, -0.25 + sway + buzz, -0.34 + (digging ? 0.012 : 0));
      r.rotation.set(digging ? 0.02 : 0, 0, 0);
      this.m.cutterGlow.color.setHex(digging ? (Math.random() < 0.5 ? 0xffe6b0 : 0xffb860) : 0xc0702c);
      this.m.torch.position.set(-0.3, -0.27 + Math.sin(((this.throwT ?? 0) / 0.25) * Math.PI) * 0.12, -0.5 - (this.throwT ?? 0) * 0.4);
    } else if (this.id === 'rubble') {
      r.position.set(0.3, -0.3 + sway, -0.45);
      r.rotation.set(0.2 - Math.abs(Math.sin(this.swing)) * 0.5, 0.6, 0);
    } else if (this.id === 'gun') {
      // Raising the sight brings the tool in to the middle and low, never up across the view. A shot kicks it back
      // and up and rolls it a little.
      const a = this.aimT, k = this.kick;
      r.position.set(GUN_AT[0] * (1 - a), GUN_AT[1] - 0.07 * a + sway * (1 - a) + k * 0.012, -0.3 + k * 0.05);
      r.rotation.set(k * 0.1, 0, this.roll * Math.min(1, Math.abs(k) * 4));
      this.m.glowMat.color.set(this.ammoFor('gun', pack).color);
    } else {
      // The hook kicks up a little when it throws; its lamp lights when it can reach.
      const kick = this.hk?.phase === 'out' ? 0.08 : 0;
      r.position.set(0.22, -0.23 + sway, -0.3);
      r.rotation.set(kick, 0, 0);
      this.m.lampMat.color.setHex(this.reach ? 0xffd27a : 0x4a4a4a);
    }
    // The beam: from the lens to the spot being cut, flickering, throwing sparks.
    this.cutBeam.visible = !!(digging && digAt && this.id === 'pick' && !scoped);
    if (this.cutBeam.visible) {
      const from = this.cutterNose();
      this.cutBeam.position.copy(from);
      this.cutBeam.lookAt(digAt);
      const len = from.distanceTo(digAt);
      const flick = 0.8 + Math.random() * 0.4;
      this.cutBeam.children.forEach((m, i) => m.scale.set((i ? 0.06 : 0.026) * flick, (i ? 0.06 : 0.026) * flick, len));
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = 0.07;
        this.burst(digAt, Math.random() < 0.5 ? 0xffc070 : 0xfff0d0, 2, 0.5);
      }
    }
    // Held things are lit by the light where you stand, as everything else is.
    const b = brightness(this.world.lightAt(player.pos.x, player.pos.y + 1.6, player.pos.z));
    for (const m of handMaterials) m.color.setRGB(b, b, b, THREE.SRGBColorSpace);
    this.stepShots(dt);
    this.stepHook(dt);
    this.stepThrown(dt);
    for (const c of [...this.casings]) {
      c.life -= dt;
      c.v.y -= 18 * dt;
      const next = c.m.position.clone().addScaledVector(c.v, dt);
      if (!c.bounced && BLOCKS[this.world.get(Math.floor(next.x), Math.floor(next.y), Math.floor(next.z))].solid) {
        c.bounced = true;
        c.v.multiplyScalar(-0.3).y = 1.5;
      } else c.m.position.copy(next);
      c.m.rotation.x += c.spin.x * dt;
      c.m.rotation.y += c.spin.y * dt;
      if (c.life <= 0) {
        this.scene.remove(c.m);
        this.casings.splice(this.casings.indexOf(c), 1);
      }
    }
    for (const f of [...this.fx])
      if (!f.step(dt)) {
        if (f.mesh) this.scene.remove(f.mesh);
        this.fx.splice(this.fx.indexOf(f), 1);
      }
    for (const p of [...this.particles]) {
      p.life -= dt;
      p.v.y -= 12 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.life <= 0) {
        this.scene.remove(p.m);
        this.particles.splice(this.particles.indexOf(p), 1);
      }
    }
  }

  // Let the hook go wherever it is: in flight it would still catch when it got there and pull you to it, from
  // wherever you are by then (round 7: dying with the hook out pulled you out of the med bay towards where you died).
  dropHook() {
    if (this.hk) this.scene.remove(this.claw, this.rope);
    this.hk = null;
    this.m.claw.visible = true;
    if (this.player) this.player.hook = null;
  }

  clearWorldBits() {
    this.cutBeam.visible = false;
    if (this.hk) this.scene.remove(this.claw, this.rope);
    this.hk = null;
    this.m.claw.visible = true;
    if (this.player) this.player.hook = null;
    for (const s of this.shots) this.scene.remove(s.mesh);
    for (const p of this.particles) this.scene.remove(p.m);
    for (const f of this.fx) if (f.mesh) this.scene.remove(f.mesh);
    for (const c of this.casings) this.scene.remove(c.m);
    // A torch still in the air when the world changes comes back to the pack.
    for (const t of this.thrown) {
      this.scene.remove(t.mesh);
      t.onLand(null, true);
    }
    this.shots = [];
    this.particles = [];
    this.fx = [];
    this.casings = [];
    this.thrown = [];
  }
}
