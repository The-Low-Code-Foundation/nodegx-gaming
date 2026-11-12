// The character sources, each a CAST of base bodies: every base is loaded once, normalised to one frame and height,
// given the baked animation set, and readied for the GPU before it is shown. A Sim is the base itself (the first time)
// or a clone sharing its geometry and textures, recoloured where the source allows it. Nobody loads a model twice.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { findSlots, normalise, captureRest, bakeClip, nameSlots, resetRest } from './retarget.mjs';
import { vrmFaceTable } from './face.mjs';
import { makeDressable } from './wardrobe.mjs';
import { loadMocap, fitMocap, genderOf, byKey, CORE } from './mocap.mjs';

export const HEIGHT = 1.65;
// The clips the spike uses, out of the library's 46.
export const CLIP_NAMES = ['Idle_Loop', 'Walk_Loop', 'Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Exit', 'Interact', 'PickUp_Table', 'Dance_Loop', 'Idle_Talking_Loop'];

// The library clips a realistic person plays from Rocketbox's own capture instead (mocap.mjs).
const MOCAP_STANDS_IN = { Idle_Loop: 'idle', Walk_Loop: 'walk', Idle_Talking_Loop: 'talk', Dance_Loop: 'dance' };

const side = (s, L, R) => [[`left${s}`, L], [`right${s}`, R]];
const biped = (n) => `Bip01 ${n}`;

const MAPS = {
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
const VRM_BONES = {
  hips: 'hips', spine: 'spine', chest: 'chest', upperChest: 'upperChest', neck: 'neck', head: 'head',
  leftShoulder: 'leftShoulder', leftUpperArm: 'leftUpperArm', leftLowerArm: 'leftLowerArm', leftHand: 'leftHand', leftMiddle: 'leftMiddleProximal',
  rightShoulder: 'rightShoulder', rightUpperArm: 'rightUpperArm', rightLowerArm: 'rightLowerArm', rightHand: 'rightHand', rightMiddle: 'rightMiddleProximal',
  leftUpperLeg: 'leftUpperLeg', leftLowerLeg: 'leftLowerLeg', leftFoot: 'leftFoot', leftToes: 'leftToes',
  rightUpperLeg: 'rightUpperLeg', rightLowerLeg: 'rightLowerLeg', rightFoot: 'rightFoot', rightToes: 'rightToes'
};


const params = new URLSearchParams(location.search);

export const CANDIDATES = [
  {
    id: 'vrm', label: 'Anime (VRM)', source: 'pixiv VRoid sample · VRM Public Licence',
    cast: [{ name: 'sample', url: 'assets/vrm/sample-slim.vrm' }],
    recolour: true,
    async load(member, timings) {
      const t0 = performance.now();
      const buf = await (await fetch(member.url)).arrayBuffer();
      const t1 = performance.now();
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.parseAsync(buf, 'assets/vrm/');
      timings.download += t1 - t0;
      timings.parse += performance.now() - t1;
      const vrm = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      VRMUtils.combineSkeletons(vrm.scene);
      vrm.scene.traverse((o) => (o.frustumCulled = false));
      // The anime outline draws every mesh a second time, inside out. Off unless ?outline=1.
      if (params.get('outline') !== '1')
        vrm.scene.traverse((o) => {
          if (!o.isMesh || !Array.isArray(o.material)) return;
          const surface = o.material.filter((m) => !m.isOutline);
          if (surface.length === o.material.length) return;
          o.material = surface[0];
          o.geometry.clearGroups();
        });
      // Animate the model's own bones (so a clone animates too); the springs and twist constraints still run on the
      // first copy through vrm.update(), which must no longer copy the "normalised" rig over them.
      vrm.humanoid.autoUpdateHumanBones = false;
      const map = Object.fromEntries(Object.entries(VRM_BONES).map(([s, b]) => [s, vrm.humanoid.getRawBoneNode(b)]).filter(([, n]) => n));
      return { scene: vrm.scene, map, vrm };
    }
  },
  {
    id: 'rocketbox', label: 'Realistic', source: 'Microsoft Rocketbox · MIT',
    // Twelve different people (tools/people.mjs), each a GLB made by tools/convert-people.mjs, loaded as they appear.
    async castList() {
      return (await (await fetch('assets/people/index.json')).json()).people.map((p) => ({ name: p.name, url: `assets/people/${p.file}` }));
    },
    async load(member, timings) {
      const t0 = performance.now();
      const buf = await (await fetch(member.url)).arrayBuffer();
      const t1 = performance.now();
      const gltf = await new GLTFLoader().parseAsync(buf, 'assets/people/');
      timings.download += t1 - t0;
      timings.parse += performance.now() - t1;
      // The GLB's materials are PBR; Phong looks the same on these photo textures and costs the tablet less.
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        o.material = [o.material].flat().map((m) => new THREE.MeshPhongMaterial({ name: m.name, map: m.map, normalMap: m.normalMap, alphaTest: m.alphaTest, side: m.side, shininess: 8, specular: 0x141414 }));
        if (o.material.length === 1) o.material = o.material[0];
      });
      // Ready for the wardrobe (wardrobe.mjs): the dress shader with a blank mask, and the body-shape morphs.
      makeDressable(gltf.scene);
      return { scene: gltf.scene, map: MAPS.rocketbox, mocap: true };
    }
  }
];

let library;
// The animation source: Quaternius's Universal Animation Library (CC0), its mannequin never shown.
async function loadLibrary() {
  if (library) return library;
  const gltf = await new GLTFLoader().loadAsync('assets/anim/AnimationLibrary_Godot_Standard.gltf');
  const outer = new THREE.Group(), inner = new THREE.Group();
  inner.add(gltf.scene);
  outer.add(inner);
  const slots = findSlots(gltf.scene, MAPS.ual);
  normalise(outer, inner, slots, 1);
  library = { root: gltf.scene, slots, rest: captureRest(slots), clips: gltf.animations.filter((c) => CLIP_NAMES.includes(c.name)) };
  return library;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

// Before a body is first drawn: upload its textures one a frame, and compile its shaders off the main thread where the
// browser can (KHR_parallel_shader_compile). Otherwise both happen inside the first frame that shows it — the freeze.
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

// Loads a candidate's first person and bakes the animation set onto them; the rest of the cast loads when a Sim needs
// them (`spawn`). Reports what each step cost.
export async function loadTemplate(candidate, gpu) {
  const timings = { download: 0, parse: 0, prepare: 0, bake: 0, people: 0 };
  // The longest frame gap inside each stage (main.mjs hands in `probe`): which stage freezes the screen.
  const gaps = (timings.gaps = {});
  const probe = (stage) => gpu.probe && (gaps[stage] = Math.max(gaps[stage] ?? 0, gpu.probe()));
  gpu.probe?.();
  const lib = await loadLibrary();
  const cast = candidate.cast ?? (await candidate.castList());

  async function loadBase(member) {
    const raw = await candidate.load(member, timings);
    await nextFrame();
    probe('load');
    const outer = new THREE.Group(), inner = new THREE.Group();
    inner.add(raw.scene);
    outer.add(inner);
    const slots = findSlots(raw.scene, raw.map);
    normalise(outer, inner, slots, HEIGHT);
    const rest = captureRest(slots);
    // Every bone by its original name, before the slot bones become ls_*: Rocketbox's own clips address them all.
    const nodes = raw.mocap ? byKey(raw.scene) : null;
    nameSlots(slots);
    // One clip a frame: baking a cast in one go held the screen for 100 ms+ on a fast Mac.
    const clips = {};
    for (const clip of lib.clips) {
      const tc = performance.now();
      clips[clip.name] = bakeClip(clip, lib, { slots, rest });
      timings.bake += performance.now() - tc;
      await nextFrame();
    }
    resetRest(slots, rest);
    // A realistic person stands, walks, talks and dances in Rocketbox's own motion capture (mocap.mjs): Quaternius's
    // idle is a game hero's, feet apart and arms out, and read as "ready to fight". ?mocap=0 for the old clips.
    // Standing and walking first; the rest (talking, dancing, yawning…) joins `clips` when it has loaded, and a Sim
    // asking for one before then stands (sim.mjs). Clones share `clips`, so they get them too.
    if (nodes && params.get('mocap') !== '0') {
      const gender = genderOf(member.name), scale = inner.scale.x;
      const add = (lib) => {
        const fitted = fitMocap(lib, nodes, scale);
        for (const [name, clip] of Object.entries(fitted)) clips[`mc_${name}`] ??= clip;
        for (const [ours, theirs] of Object.entries(MOCAP_STANDS_IN)) if (fitted[theirs]) clips[ours] = clips[`mc_${theirs}`];
      };
      add(await loadMocap(gender, CORE));
      loadMocap(gender).then(add);
    }
    await nextFrame();
    probe('bake');
    const t = performance.now();
    await prepare(outer, gpu);
    timings.prepare += performance.now() - t;
    probe('prepare');
    timings.people++;
    const faceTable = raw.vrm ? vrmFaceTable(raw.vrm, outer) : null;
    return { body: { outer, inner, slots, vrm: raw.vrm, clips, faceTable }, used: false, missing: Object.keys(MAPS.ual).filter((s) => !slots[s]) };
  }

  const bases = [await loadBase(cast[0])];
  return {
    candidate, bases, timings, cast, first: bases[0].body, missing: bases[0].missing,
    // A body for Sim number `i`: cast member i the first time (loaded now if need be); past the end of the cast, a
    // clone sharing a member's geometry and textures.
    async spawn(i) {
      if (i < cast.length && !bases[i]) bases[i] = await loadBase(cast[i]);
      const base = bases[i % cast.length] ?? bases[0];
      if (!base.used) return ((base.used = true), base.body);
      const outer = SkeletonUtils.clone(base.body.outer);
      shareSkeletons(base.body.outer, outer);
      // A VRM carries a second, "normalised" copy of its skeleton for three-vrm; a clone never uses it, and every
      // node in it would still be updated each frame.
      if (base.body.vrm) outer.getObjectByName(base.body.vrm.humanoid.normalizedHumanBonesRoot.name)?.removeFromParent();
      // A VRM clone's springs don't run, so its hair, skirt and twist bones never move against their parents: compose
      // their matrices once instead of every frame (bones the animation drives are the `ls_` ones). Not a realistic
      // person's: Rocketbox's motion capture drives every Biped bone by name (fingers, twists, the third spine bone),
      // and since round 10 every Sim in the game is a clone (the base stays clean to lend its clothes and hair).
      if (base.body.vrm)
        outer.traverse((o) => {
          if (o.isBone && !o.name.startsWith('ls_')) (o.matrixAutoUpdate = false), o.updateMatrix();
        });
      const own = candidate.recolour ? recolour(outer, i) : [];
      return { outer, vrm: null, clips: base.body.clips, faceTable: base.body.faceTable, clone: true, own };
    }
  };
}

// SkeletonUtils.clone gives every skinned mesh its OWN skeleton, even where the source's meshes shared one: a VRM
// clone then updated and uploaded 13 skeletons a frame instead of one. Give the clone's meshes back one per source.
function shareSkeletons(source, clone) {
  const one = new Map();
  const walk = (a, b) => {
    if (a.isSkinnedMesh) {
      if (!one.has(a.skeleton)) one.set(a.skeleton, b.skeleton);
      else b.skeleton = one.get(a.skeleton);
    }
    a.children.forEach((c, i) => walk(c, b.children[i]));
  };
  walk(source, clone);
}

// A clone's own colours: hair, top, bottoms, shoes and skin each from a palette, on copies of the materials (same
// shader program, so nothing recompiles). The geometry and textures stay shared.
const PALETTES = {
  HAIR: ['#3b2417', '#1d1a1a', '#e0b56a', '#9a3f1f', '#5a6fd0', '#f0e6dc', '#c95b8a'],
  Tops: ['#ffffff', '#e85d75', '#3d7dd8', '#f2c14e', '#5bbf8a', '#7a4fd1', '#ff8c42'],
  Bottoms: ['#2a2a2a', '#3a4a7a', '#7a5230', '#5b6b4b', '#c0c0c8', '#8a2d3a'],
  Shoes: ['#ffffff', '#222222', '#c0392b', '#2e86de', '#8e6b4e'],
  SKIN: ['#ffffff', '#f6dcc8', '#e2b896', '#b98260', '#8a5a3c']
};
function recolour(outer, i) {
  // A small hash per (person, part), so every person draws their own mix.
  const pick = (list, k) => {
    let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    return list[((h ^ (h >>> 12)) >>> 0) % list.length];
  };
  const copies = new Map();
  outer.traverse((o) => {
    if (!o.isMesh) return;
    o.material = [o.material].flat().map((m) => {
      const key = Object.keys(PALETTES).find((k) => m.name?.includes(k));
      if (!key) return m;
      if (!copies.has(m)) {
        const c = m.clone();
        const colour = new THREE.Color(pick(PALETTES[key], Object.keys(PALETTES).indexOf(key)));
        c.color.copy(colour);
        if (c.shadeColorFactor) c.shadeColorFactor.copy(colour).multiplyScalar(0.75);
        copies.set(m, c);
      }
      return copies.get(m);
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  return [...copies.values()];
}

// Removes every Sim body and frees what the template owns (clones share it, so they only drop their own materials).
export function disposeTemplate(template, bodies) {
  for (const b of bodies) {
    b.outer.removeFromParent();
    for (const m of b.own ?? []) m.dispose();
  }
  for (const base of template.bases) {
    if (!base) continue;
    const { body } = base;
    body.outer.removeFromParent();
    if (body.vrm) VRMUtils.deepDispose(body.vrm.scene);
    else
      body.outer.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        for (const m of [o.material].flat()) {
          for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
          m.dispose();
        }
      });
  }
}

// The materials a person could recolour, for the colours panel.
export function materialsOf(body) {
  const seen = new Map();
  body.outer.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [o.material].flat()) if (m.color && !seen.has(m.name || m.uuid)) seen.set(m.name || m.uuid, m);
  });
  return [...seen.entries()].map(([name, material]) => ({ name, material }));
}
