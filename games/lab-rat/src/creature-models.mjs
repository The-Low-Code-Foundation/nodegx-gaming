// The Fold's real bodies: the level-1 cast from Sketchfab (credits in /credits.html), made game-ready by the Blender
// scripts in tools/blender/. Loaded once before the world is built; each creature gets its own clone with its own
// materials (so a hit flash shows on that one only) and an Anim that cross-fades between its clips.
// If a file is missing (public/assets/ is not in git: see README "Round 3"), creatureModel() returns null and the
// creature keeps its procedural body from models.mjs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// file: public/assets/creatures/<file>.glb. size: [axis, metres] it is scaled to. pose: the clip whose first frame
// is measured (a Sketchfab rig's bind pose can sit metres away from where its animations put it). ground: feet on
// y=0; otherwise centred on y=0. turn: extra yaw so its nose points +z like every creature here.
const SPEC = {
  skitter: { file: 'xenohydro-roach', size: ['z', 1.15], pose: 'Idle', ground: true, turn: 0 },
  tender: { file: 'opabinia', size: ['z', 2.6], pose: 'Swim', ground: false, turn: 0 },
  bulwark: { file: 'arang', size: ['y', 2.3], pose: 'Idle', ground: true, turn: 0 },
  grown: { file: 'living-flesh-blob', size: ['y', 1.0], pose: null, ground: true, turn: 0 }
};
const loaded = {};

export async function loadCreatureModels(base = 'assets/creatures/') {
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(SPEC).map(async ([kind, spec]) => {
    try {
      const g = await loader.loadAsync(base + spec.file + '.glb');
      g.scene.traverse((o) => { if (/^Icosphere/.test(o.name)) o.visible = false; });
      loaded[kind] = { gltf: g, fit: fit(g, spec) };
    } catch (e) {
      console.warn(`[creature-models] ${kind}: ${spec.file}.glb not loaded (${e.message}); keeping the procedural body`);
    }
  }));
  return Object.keys(loaded);
}
export const hasModel = (kind) => !!loaded[kind];

// Skinned bounds: every vertex where the skeleton actually puts it at the pose clip's first frame.
function skinnedBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const n = o.geometry.attributes.position.count, step = Math.max(1, Math.floor(n / 4000));
    for (let i = 0; i < n; i += step) {
      if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(o.geometry.attributes.position, i);
      box.expandByPoint(v.applyMatrix4(o.matrixWorld));
    }
  });
  return box;
}

function fit(g, spec) {
  const probe = SkeletonUtils.clone(g.scene);
  const clip = spec.pose && g.animations.find((a) => a.name === spec.pose);
  if (clip) { const m = new THREE.AnimationMixer(probe); m.clipAction(clip).play(); m.update(0); }
  const box = skinnedBox(probe);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = spec.size[1] / size[spec.size[0]];
  return { k, offset: new THREE.Vector3(-c.x * k, (spec.ground ? -box.min.y : -c.y) * k, -c.z * k), size: size.multiplyScalar(k) };
}

export class Anim {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = Object.fromEntries(clips.map((c) => [c.name, c]));
    this.name = null;
    this.action = null;
  }
  has(name) {
    return !!this.clips[name];
  }
  /** Cross-fade to `name` (no-op if already playing it; then only the speed follows). once: hold the last frame. */
  play(name, { fade = 0.2, speed = 1, once = false } = {}) {
    if (!this.clips[name]) return null;
    if (this.name === name) {
      this.action.timeScale = speed;
      return this.action;
    }
    const a = this.mixer.clipAction(this.clips[name]);
    a.reset();
    a.timeScale = speed;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.setEffectiveWeight(1).fadeIn(fade).play();
    if (this.action) this.action.fadeOut(fade);
    this.action = a;
    this.name = name;
    return a;
  }
  update(dt) {
    this.mixer.update(dt);
  }
}

/**
 * A fresh instance: { root (a Group, nose +z, sized and grounded), anim, mats, bone(name), pin(boneName, obj, at) }.
 * `pin` hangs `obj` off a bone so it rides the animation, placed at `at` in the model's own (sized) space.
 */
export function creatureModel(kind) {
  const L = loaded[kind];
  if (!L) return null;
  const spec = SPEC[kind];
  const inner = SkeletonUtils.clone(L.gltf.scene);
  const mats = [];
  inner.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    mats.push(o.material);
    o.castShadow = true;
    o.frustumCulled = false; // a skinned mesh's bounds are its bind pose, which can be metres off
  });
  inner.scale.setScalar(L.fit.k);
  inner.position.copy(L.fit.offset);
  const root = new THREE.Group();
  root.rotation.y = spec.turn;
  root.add(inner);
  const anim = new Anim(inner, L.gltf.animations);
  const bones = {};
  inner.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  return {
    root, anim, mats, size: L.fit.size,
    bone: (n) => bones[n],
    pin(boneName, obj, at) {
      // a holder takes the bone's frame and scale, so obj keeps animating its own position and scale freely
      const b = bones[boneName], holder = new THREE.Group();
      root.updateMatrixWorld(true);
      holder.position.copy(b.worldToLocal(root.localToWorld(at.clone())));
      const bs = new THREE.Vector3(), rs = new THREE.Vector3();
      b.getWorldScale(bs); root.getWorldScale(rs);
      holder.scale.copy(rs).divide(bs);
      holder.quaternion.copy(b.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(root.getWorldQuaternion(new THREE.Quaternion())));
      obj.position.set(0, 0, 0);
      holder.add(obj);
      b.add(holder);
    },
    /** The highest point of its rest-pose surface within r of (x, z), in the model's own sized space. */
    top(x, z, r = 0.2) {
      root.updateMatrixWorld(true);
      let best = -Infinity;
      const v = new THREE.Vector3();
      inner.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
          v.applyMatrix4(o.matrixWorld);
          if (Math.hypot(v.x - x, v.z - z) < r && v.y > best) best = v.y;
        }
      });
      return best;
    }
  };
}

/** Hide a procedural body's meshes but keep its groups (the code still moves them), except under `keep`. */
export function hideProcedural(body, keep = []) {
  const kept = new Set();
  for (const k of keep) k.traverse((o) => kept.add(o));
  body.traverse((o) => { if (o.isMesh && !kept.has(o)) o.visible = false; });
}
