// The carrier's crew: realistic people (Microsoft Rocketbox, MIT; the six from assets/people, the Life Sim game's
// cast) in department uniforms, at the posts the layout gives them (`stations`), sitting, working at consoles, talking,
// or walking a short route. Each moves in Rocketbox's own motion capture (mocap.mjs); each uniform is the person's own
// clothes recoloured by the Life Sim wardrobe (wardrobe.mjs), so folds and seams stay.
//
// A crew member stands with their feet at their origin, facing -z, like the blocky people in people.mjs.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { makeDressable, dress } from './wardrobe.mjs';
import { loadMocap, fitMocap, byKey, genderOf } from './mocap.mjs';

/** Uniform colours per department: [top, trousers, shoes]. The top says the department. */
export const UNIFORMS = {
  command: ['#3d4c63', '#262b33', '#141619'],
  flight: ['#7a6c52', '#2c3036', '#141619'],
  engineering: ['#7c4630', '#302d2a', '#141619'],
  crew: ['#5a6068', '#2a2e34', '#141619']
};
const CLIPS = ['idle', 'walk', 'sitChair', 'workTable', 'talk', 'lookAround'];
const HEIGHTS = { f: 1.66, m: 1.78 };

let castList;
const templates = new Map();

async function cast() {
  castList ??= (await (await fetch('assets/people/index.json')).json()).people.map((p) => p.name);
  return castList;
}

/** One person loaded, stood up straight at their height, feet on the floor, with their clips fitted to them. */
async function template(name) {
  if (templates.has(name)) return templates.get(name);
  const p = (async () => {
    const gltf = await new GLTFLoader().loadAsync(`assets/people/${name}.glb`);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.material = [o.material].flat().map((m) => new THREE.MeshPhongMaterial({ name: m.name, map: m.map, normalMap: m.normalMap, alphaTest: m.alphaTest, side: m.side, transparent: m.transparent, shininess: 8, specular: 0x141414 }));
      if (o.material.length === 1) o.material = o.material[0];
    });
    makeDressable(gltf.scene);
    const nodes = byKey(gltf.scene);
    const inner = new THREE.Group(), outer = new THREE.Group();
    inner.add(gltf.scene);
    outer.add(inner);
    const gender = genderOf(name);
    stand(outer, inner, nodes, HEIGHTS[gender] + (name.length % 3) * 0.03);
    const clips = fitMocap(await loadMocap(gender, CLIPS), nodes, inner.scale.x);
    return { outer, clips, used: false };
  })();
  templates.set(name, p);
  return p;
}

/** Turns the body to face +z (left along +x), scales it to `height` and puts the feet on y = 0 under the hips. */
function stand(outer, inner, nodes, height) {
  outer.updateMatrixWorld(true);
  const p = (k) => nodes.get(k).getWorldPosition(new THREE.Vector3());
  const feet = p('bip01lfoot').add(p('bip01rfoot')).multiplyScalar(0.5);
  const up = p('bip01head').sub(feet).normalize();
  const left = p('bip01lupperarm').sub(p('bip01rupperarm'));
  left.sub(up.clone().multiplyScalar(left.dot(up))).normalize();
  const fwd = new THREE.Vector3().crossVectors(left, up);
  inner.quaternion.premultiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, fwd)).invert());
  const measure = () => {
    outer.updateMatrixWorld(true);
    const box = new THREE.Box3();
    inner.traverse((o) => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) o.boundingBox = null;
      box.expandByObject(o);
    });
    return box;
  };
  let box = measure();
  inner.scale.multiplyScalar(height / (box.max.y - box.min.y));
  box = measure();
  const hips = p('bip01pelvis');
  inner.position.add(new THREE.Vector3(-hips.x, -box.min.y, -hips.z));
  outer.updateMatrixWorld(true);
}

/** A crew member: `name` from the cast (or the cast's `i`th), in `dept`'s uniform. `.play(pose)`, `.update(dt)`. */
export async function crewMember(nameOrIndex, dept = 'crew') {
  const list = await cast();
  const name = typeof nameOrIndex === 'number' ? list[nameOrIndex % list.length] : nameOrIndex;
  const T = await template(name);
  const outer = T.used ? SkeletonUtils.clone(T.outer) : T.outer;
  T.used = true;
  await dress({ outer }, { outfit: { from: null, colours: UNIFORMS[dept] ?? UNIFORMS.crew }, hair: { style: null } }, null);
  const root = new THREE.Group();
  const turn = new THREE.Group();
  turn.rotation.y = Math.PI; // the body faces +z; a crew member faces -z
  turn.add(outer);
  root.add(turn);
  root.userData.live = true;
  const mixer = new THREE.AnimationMixer(outer);
  let current = null;
  const m = {
    name, dept, root, mixer, clips: T.clips,
    play(pose, fade = 0.4) {
      const clip = T.clips[pose] ?? T.clips.idle;
      const a = mixer.clipAction(clip);
      if (current === a) return;
      a.reset().fadeIn(fade).play();
      current?.fadeOut(fade);
      current = a;
      // Different people at different points in the same clip, so a room does not breathe in step.
      a.time = Math.random() * clip.duration;
    },
    speed: () => T.clips.walk?.userData?.speed ?? 1.3,
    update(dt) {
      mixer.update(dt);
    }
  };
  return m;
}

/** Puts the layout's crew at their posts on the decks (each deck's `Interior` group, so a deck you are not on hides its
 *  crew with it). Loads in the background: the ship is walkable before anyone is aboard. Returns the list as it fills. */
export function boardCrew(C) {
  const crew = [];
  C.L.stations.forEach((s, k) => placeCrew(C, s, k).then((m) => crew.push(m), () => {}));
  return crew;
}

/** The cast's `k`th person at post `s` (a `stations` entry, or any { room, at, yaw, pose, dept, route }). Resolves to
 *  the crew member, standing in their deck's group; rejects if they could not be loaded. */
export function placeCrew(C, s, k) {
  const room = C.rooms.get(s.room);
  const I = C.decks.get(room.deck);
  return crewMember(k, s.dept).then((m) => {
    m.root.position.set(s.at[0], I.floorY, s.at[1]);
    m.root.rotation.y = s.yaw ?? 0;
    I.group.add(m.root);
    if (C.clipPlanes) m.root.traverse((o) => o.material && [o.material].flat().forEach((x) => (x.clippingPlanes = C.clipPlanes)));
    m.deck = room.deck;
    m.route = s.route ? s.route.map(([x, z]) => new THREE.Vector3(x, I.floorY, z)) : null;
    m.leg = 1;
    m.play(m.route ? 'walk' : s.pose);
    return m;
  }).catch((e) => {
    console.warn('crew member could not come aboard', e);
    throw e;
  });
}

/** Takes a crew member off the deck. */
export function removeCrew(m) {
  m.mixer.stopAllAction();
  m.root.removeFromParent();
}

/** Each frame for the crew on visible decks: the clips play, and anyone with a route walks it, turning at each end. */
export function tickCrew(crew, dt, visibleDeck) {
  for (const m of crew) {
    if (!visibleDeck(m.deck)) continue;
    m.update(dt);
    if (!m.route) continue;
    const goal = m.route[m.leg];
    const to = goal.clone().sub(m.root.position);
    const d = to.length();
    if (d < 0.2) {
      // A route marked `once` (a muster marching off) stops at its end.
      if (m.once && m.leg === m.route.length - 1) {
        if (!m.arrived) (m.arrived = true), m.play('idle');
        continue;
      }
      m.leg = (m.leg + 1) % m.route.length;
      continue;
    }
    const want = Math.atan2(-to.x, -to.z); // yaw that faces `to` (0 faces -z)
    let turn = want - m.root.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    m.root.rotation.y += Math.sign(turn) * Math.min(Math.abs(turn), dt * 2.5);
    if (Math.abs(turn) < 0.5) m.root.position.addScaledVector(to.normalize(), Math.min(d, m.speed() * dt));
  }
}
