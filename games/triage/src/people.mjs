// Realistic people: Rocketbox adults (MIT), converted with faces by the Life Sim (public/assets/people/). Every base body
// is loaded once, normalised to one frame and height, given its clips, and cloned for everyone else who wears it.
// Clips come from two places: Rocketbox's own motion capture, played on the person's bones directly (mocap.mjs), and
// Quaternius's Universal Animation Library (CC0), baked onto the person's slot bones (retarget.mjs) for what Rocketbox
// never captured: aiming and firing a pistol, crouch-walking, being hit, dying.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { findSlots, normalise, captureRest, bakeClip, nameSlots, resetRest } from './retarget.mjs';
import { loadMocap, fitMocap, genderOf, byKey } from './mocap.mjs';

export const HEIGHT = 1.7;
// The library clips the game bakes, out of its 46.
export const UAL_CLIPS = ['Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Shoot', 'Pistol_Reload', 'Crouch_Fwd_Loop', 'Crouch_Idle_Loop', 'Hit_Chest', 'Hit_Head', 'Death01', 'Punch_Cross', 'Punch_Jab', 'Sword_Attack', 'Idle_Loop', 'Jog_Fwd_Loop'];

const side = (s, L, R) => [[`left${s}`, L], [`right${s}`, R]];
const biped = (n) => `Bip01 ${n}`;
export const MAPS = {
  ual: Object.fromEntries([
    ['hips', 'DEF-hips'], ['spine', 'DEF-spine.001'], ['chest', 'DEF-spine.002'], ['upperChest', 'DEF-spine.003'], ['neck', 'DEF-neck'], ['head', 'DEF-head'],
    ...side('Shoulder', 'DEF-shoulder.L', 'DEF-shoulder.R'), ...side('UpperArm', 'DEF-upper_arm.L', 'DEF-upper_arm.R'),
    ...side('LowerArm', 'DEF-forearm.L', 'DEF-forearm.R'), ...side('Hand', 'DEF-hand.L', 'DEF-hand.R'), ...side('Middle', 'DEF-f_middle.01.L', 'DEF-f_middle.01.R'),
    ...side('UpperLeg', 'DEF-thigh.L', 'DEF-thigh.R'), ...side('LowerLeg', 'DEF-shin.L', 'DEF-shin.R'), ...side('Foot', 'DEF-foot.L', 'DEF-foot.R'), ...side('Toes', 'DEF-toe.L', 'DEF-toe.R')
  ]),
  rocketbox: Object.fromEntries([
    ['hips', biped('Pelvis')], ['spine', biped('Spine')], ['chest', biped('Spine1')], ['upperChest', biped('Spine2')], ['neck', biped('Neck')], ['head', biped('Head')],
    ...side('Shoulder', biped('L Clavicle'), biped('R Clavicle')), ...side('UpperArm', biped('L UpperArm'), biped('R UpperArm')),
    ...side('LowerArm', biped('L Forearm'), biped('R Forearm')), ...side('Hand', biped('L Hand'), biped('R Hand')), ...side('Middle', biped('L Finger2'), biped('R Finger2')),
    ...side('UpperLeg', biped('L Thigh'), biped('R Thigh')), ...side('LowerLeg', biped('L Calf'), biped('R Calf')), ...side('Foot', biped('L Foot'), biped('R Foot')), ...side('Toes', biped('L Toe0'), biped('R Toe0'))
  ])
};

// A track belongs to the lower body (hips, legs, the Biped root's sway) or the upper body (everything else). Aiming
// plays an upper-body clip over a lower-body walk; both halves of a clip are made once, at load.
const LOWER = /^(bip01|bip01_footsteps|ls_hips|ls_(left|right)(upperleg|lowerleg|foot|toes)|bip01_(l|r)_toe.*)$/i;
const isLower = (track) => LOWER.test(track.name.slice(0, track.name.lastIndexOf('.')).replace(/\s/g, '_'));
export function split(clip) {
  const lower = new THREE.AnimationClip(`${clip.name}/lower`, clip.duration, clip.tracks.filter(isLower));
  const upper = new THREE.AnimationClip(`${clip.name}/upper`, clip.duration, clip.tracks.filter((t) => !isLower(t)));
  lower.userData = upper.userData = clip.userData;
  return { lower, upper };
}

let library;
async function loadLibrary() {
  if (library) return library;
  const gltf = await new GLTFLoader().loadAsync('assets/anim/AnimationLibrary_Godot_Standard.gltf');
  const outer = new THREE.Group(), inner = new THREE.Group();
  inner.add(gltf.scene);
  outer.add(inner);
  const slots = findSlots(gltf.scene, MAPS.ual);
  normalise(outer, inner, slots, 1);
  library = { root: gltf.scene, slots, rest: captureRest(slots), clips: gltf.animations.filter((c) => UAL_CLIPS.includes(c.name)) };
  return library;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// Before a body is first drawn: upload its textures and compile its shaders, so the first frame that shows it does not freeze.
async function prepare(object, { renderer, scene, camera }) {
  const textures = new Set();
  object.traverse((o) => {
    for (const m of [o.material ?? []].flat()) for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
  });
  for (const t of textures) {
    renderer.initTexture(t);
    await nextFrame();
  }
  await renderer.compileAsync(object, camera, scene);
}

// A copy of a body sharing its geometry and textures; the meshes that shared one skeleton in it share one in the copy.
function cloneBody(source) {
  const outer = SkeletonUtils.clone(source);
  const one = new Map();
  const walk = (a, b) => {
    if (a.isSkinnedMesh) {
      if (!one.has(a.skeleton)) one.set(a.skeleton, b.skeleton);
      else b.skeleton = one.get(a.skeleton);
    }
    a.children.forEach((c, i) => walk(c, b.children[i]));
  };
  walk(source, outer);
  return outer;
}

export class People {
  constructor(gpu) {
    this.gpu = gpu;
    this.bases = new Map();
    this.cast = null;
  }

  async list() {
    this.cast ??= (await (await fetch('assets/people/index.json')).json()).people;
    return this.cast;
  }

  // The base body for a cast member (by name or index), loaded once.
  async base(who) {
    const cast = await this.list();
    const member = typeof who === 'number' ? cast[who % cast.length] : cast.find((p) => p.name === who) ?? cast[0];
    if (!this.bases.has(member.name)) this.bases.set(member.name, this.loadBase(member));
    return this.bases.get(member.name);
  }

  async loadBase(member) {
    const lib = await loadLibrary();
    const gltf = await new GLTFLoader().loadAsync(`assets/people/${member.file}`);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = true;
      o.material = [o.material].flat().map((m) => new THREE.MeshPhongMaterial({ name: m.name, map: m.map, normalMap: m.normalMap, alphaTest: m.alphaTest, side: m.side, shininess: 6, specular: 0x111111 }));
      if (o.material.length === 1) o.material = o.material[0];
    });
    await nextFrame();
    const outer = new THREE.Group(), inner = new THREE.Group();
    inner.add(gltf.scene);
    outer.add(inner);
    const slots = findSlots(gltf.scene, MAPS.rocketbox);
    normalise(outer, inner, slots, HEIGHT);
    const rest = captureRest(slots);
    const nodes = byKey(gltf.scene);
    nameSlots(slots);
    const clips = {};
    for (const clip of lib.clips) {
      clips[clip.name] = bakeClip(clip, lib, { slots, rest });
      await nextFrame();
    }
    resetRest(slots, rest);
    const gender = genderOf(member.name);
    const fitted = fitMocap(await loadMocap(gender), nodes, inner.scale.x);
    for (const [name, clip] of Object.entries(fitted)) clips[name] = clip;
    for (const name of Object.keys(clips)) Object.assign(clips, { [`${name}/lower`]: split(clips[name]).lower, [`${name}/upper`]: split(clips[name]).upper });
    await prepare(outer, this.gpu);
    // Round 4 (playtest: "when the zombies respawn, they appear with no heads because you shot the heads off in the first
    // wave. Some of them also come in with their legs inside the floor"): every clone was copied from the base body, and
    // the base body is the FIRST person to wear it, alive in the game: its head shrunk by a headshot, its wounds, its
    // body laid flat, its frozen root wherever its last clip left it all went into every copy after. The copies now come
    // from a template taken here, in the rest pose, that nothing ever plays or shoots.
    const template = cloneBody(outer);
    const body = { outer, inner, slots, clips, name: member.name, gender, used: false, template };
    return body;
  }

  // A body for one character: the base itself the first time, then clones sharing its geometry and textures. `tint`
  // (a colour) greys the skin and clothes: the infected.
  async spawn(who, { tint = null } = {}) {
    const base = await this.base(who);
    let outer;
    if (!base.used) ((base.used = true), (outer = base.outer));
    else {
      outer = cloneBody(base.template);
      outer.traverse((o) => {
        if (o.isBone && !o.name.startsWith('ls_')) (o.matrixAutoUpdate = false), o.updateMatrix();
      });
    }
    const own = [];
    if (tint) {
      const copies = new Map();
      outer.traverse((o) => {
        if (!o.isMesh) return;
        o.material = [o.material].flat().map((m) => {
          if (!copies.has(m)) {
            const c = m.clone();
            c.color.copy(tint);
            copies.set(m, c);
            own.push(c);
          }
          return copies.get(m);
        });
        if (o.material.length === 1) o.material = o.material[0];
      });
    }
    return { outer, clips: base.clips, name: base.name, gender: base.gender, own };
  }
}

// Plays clips on one body: a full-body clip, or a lower-body clip under an upper-body one (aiming while walking).
export class Animator {
  constructor(body) {
    this.body = body;
    this.mixer = new THREE.AnimationMixer(body.outer);
    this.actions = {};
    this.layers = { full: null, lower: null, upper: null };
    this.onDone = null;
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.onDone?.action) {
        const then = this.onDone.then;
        this.onDone = null;
        then?.();
      }
    });
  }

  action(name) {
    if (!this.actions[name] && this.body.clips[name]) this.actions[name] = this.mixer.clipAction(this.body.clips[name]);
    return this.actions[name] ?? null;
  }

  speedOf(name) {
    return this.body.clips[name]?.userData?.speed ?? 0;
  }

  // `full` = one clip for the whole body. Or `lower` + `upper` = two clips, one per half.
  play({ full = null, lower = null, upper = null, fade = 0.2, once = false, timeScale = 1, then = null }) {
    const want = full ? { full, lower: null, upper: null } : { full: null, lower: lower && `${lower}/lower`, upper: upper && `${upper}/upper` };
    for (const layer of ['full', 'lower', 'upper']) {
      const name = want[layer];
      const current = this.layers[layer];
      if (name && current?.name === name && !once) continue;
      const next = name ? this.action(name) : null;
      if (next) {
        next.reset();
        next.setLoop(once && layer !== 'lower' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = once;
        next.timeScale = timeScale;
        next.enabled = true;
        next.setEffectiveWeight(1);
        if (current?.action && current.action !== next && fade > 0) next.crossFadeFrom(current.action, fade, false).play();
        else {
          current?.action?.stop();
          next.play();
        }
        if (once && layer !== 'lower') this.onDone = { action: next, then };
      } else if (current?.action) {
        if (fade > 0) current.action.fadeOut(fade);
        else current.action.stop();
      }
      this.layers[layer] = next ? { name, action: next } : null;
    }
    // Two halves fading in over a full clip, or a full clip over two halves: the other side fades out.
    if (full) for (const l of ['lower', 'upper']) if (this.layers[l]) (fade > 0 ? this.layers[l].action.fadeOut(fade) : this.layers[l].action.stop()), (this.layers[l] = null);
    if (!full && this.layers.full) (fade > 0 ? this.layers.full.action.fadeOut(fade) : this.layers.full.action.stop()), (this.layers.full = null);
  }

  update(dt) {
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body.outer);
  }
}
