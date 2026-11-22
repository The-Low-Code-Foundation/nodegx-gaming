// The carrier's crew: realistic people (Microsoft Rocketbox, MIT; the six from assets/people, the Life Sim game's
// cast) in the ship's clothes, at the posts the layout gives them (`stations`), sitting, working at consoles, talking,
// or walking a short route. Each moves in Rocketbox's own motion capture (mocap.mjs).
//
// What they wear (`OUTFITS`): outside the drums the duty suit, a fitted pressure suit worn as working uniform (a collar
// ring, the hood and visor rolled down behind the neck, a regulator on the chest); in the drums the off-duty uniform;
// in the airless hangar the heavy vac suit with its helmet and pack. The suit and the uniform are the clothes of
// Rocketbox's soldiers (assets/people/Military_*.glb: long sleeves, trousers, boots) borrowed onto each person by the
// Life Sim wardrobe (wardrobe.mjs `dress`, `outfit.from`) and recoloured there, so folds and seams stay; the suit's
// hard parts are built here and hung on the bones (`dutyParts`, `vacParts`).
//
// A crew member stands with their feet at their origin, facing -z, like the blocky people in people.mjs.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeDressable, dress, partsOf } from './wardrobe.mjs';
import { loadMocap, fitMocap, byKey, genderOf } from './mocap.mjs';
import { at } from '../util.mjs';
import { rigOf, floatClips, FLOATING, floatIn, floatStep, footRestraint, HC } from './floating.mjs';

/** Each department's colour: the off-duty uniform's jacket, and the band under the duty suit's collar ring. */
export const DEPTS = {
  command: '#3d4c63',
  flight: '#8a7650',
  engineering: '#8a4a30',
  crew: '#5c636c'
};
/** What the crew wear. `from`: whose clothes, by gender (null: the person's own); `colours`: [top, trousers, shoes]
 *  for the wardrobe's three fabrics, from the department's colour; `parts`: the hard parts hung on the bones. */
export const OUTFITS = {
  /** The duty suit: one dark slate-blue pressure suit for everyone, the department on the collar's band. */
  duty: { from: { f: 'Military_Female_01', m: 'Military_Male_01' }, colours: () => ['#3b4350', '#3b4350', '#1c1e22'], parts: 'duty' },
  /** The off-duty uniform, in the drums: a shirt in the department's colour, dark trousers, boots. */
  uniform: { from: { f: 'Military_Female_01', m: 'Military_Male_01' }, colours: (d) => [d, '#2a2e34', '#17191c'], parts: null },
  /** The heavy vac suit (the airless hangar): dark olive green with a darker helmet and pack, the department only on
   *  the pack's band. */
  vac: { from: { f: 'Military_Female_01', m: 'Military_Male_01' }, colours: () => ['#36452f', '#2e3b29', '#191c17'], parts: 'vac' },
  /** The person's own clothes, in the department's colours (the old look; nothing aboard uses it now). */
  own: { from: null, colours: (d) => [d, '#262b33', '#141619'], parts: null }
};
/** Uniform colours per department, [top, trousers, shoes] (the off-duty uniform's). */
export const UNIFORMS = Object.fromEntries(Object.entries(DEPTS).map(([k, d]) => [k, OUTFITS.uniform.colours(d)]));
/** Which outfit a room calls for: the heavy suit where it is airless, the uniform in a drum, else the duty suit. */
export const outfitFor = (room) => (room?.vacuum ? 'vac' : room?.drum ? 'uniform' : 'duty');

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
    phong(gltf.scene);
    makeDressable(gltf.scene);
    const nodes = byKey(gltf.scene);
    const inner = new THREE.Group(), outer = new THREE.Group();
    inner.add(gltf.scene);
    outer.add(inner);
    const gender = genderOf(name);
    stand(outer, inner, nodes, HEIGHTS[gender] + (name.length % 3) * 0.03);
    const rig = rigOf(outer, nodes); // the rest pose, for the weightless clips (floating.mjs)
    const clips = fitMocap(await loadMocap(gender, CLIPS), nodes, inner.scale.x);
    return { outer, clips, rig, fclips: null };
  })();
  templates.set(name, p);
  return p;
}

/** Rocketbox's materials as plain Phong (cheaper under the light pool than the loader's standard material). */
function phong(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.material = [o.material].flat().map((m) => new THREE.MeshPhongMaterial({ name: m.name, map: m.map, normalMap: m.normalMap, alphaTest: m.alphaTest, side: m.side, transparent: m.transparent, shininess: 8, specular: 0x141414 }));
    if (o.material.length === 1) o.material = o.material[0];
  });
}

/** A person whose clothes are lent (a soldier: assets/people/Military_*.glb), loaded once, dressable, never shown. */
const donors = new Map();
function donorOf(name) {
  if (!donors.has(name))
    donors.set(name, (async () => {
      const gltf = await new GLTFLoader().loadAsync(`assets/people/${name}.glb`);
      phong(gltf.scene);
      makeDressable(gltf.scene);
      const parts = partsOf(gltf.scene);
      if (parts.body) parts.body.userData.plain = true; // clothes by body region, the camouflage flattened (wardrobe.mjs)
      return { parts };
    })());
  return donors.get(name);
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

/** A crew member: `name` from the cast (or the cast's `i`th), of `dept`, in `outfit` (a key of `OUTFITS`: `duty`
 *  by default; `{ suit: true }` is the old way of asking for `vac`). `.play(pose)`, `.update(dt)`. */
export async function crewMember(nameOrIndex, dept = 'crew', { suit: suited = false, outfit = suited ? 'vac' : 'duty' } = {}) {
  const list = await cast();
  const name = typeof nameOrIndex === 'number' ? list[nameOrIndex % list.length] : nameOrIndex;
  const T = await template(name);
  // Always a copy: borrowed clothes and hard parts hang on the bones, and a copy of a dressed template would carry them.
  const outer = SkeletonUtils.clone(T.outer);
  const O = OUTFITS[outfit] ?? OUTFITS.duty, gender = genderOf(name), colour = DEPTS[dept] ?? DEPTS.crew;
  await dress({ outer }, { outfit: { from: O.from?.[gender] ?? null, colours: O.colours(colour) }, hair: { style: null } }, donorOf);
  if (O.parts === 'duty') dutyParts(outer, dept, gender);
  else if (O.parts === 'vac') vacParts(outer, dept);
  const root = new THREE.Group();
  // root (yaw, feet on the deck) → lean (the body's attitude, turning about its middle, weightless: floating.mjs) → turn.
  const lean = new THREE.Group();
  lean.position.y = HC;
  const turn = new THREE.Group();
  turn.rotation.y = Math.PI; // the body faces +z; a crew member faces -z
  turn.position.y = -HC;
  turn.add(outer);
  lean.add(turn);
  root.add(lean);
  root.userData.live = true;
  const mixer = new THREE.AnimationMixer(outer);
  let current = null;
  const floats = () => (T.fclips ??= floatClips(T.rig, T.clips));
  const m = {
    name, dept, outfit, root, lean, mixer, clips: T.clips, rig: T.rig, float: false, pose: null,
    /** Stands (or, weightless, holds) them in `pose`: one of the captured clips' names (crew.mjs `CLIPS`), which in a
     *  weightless room becomes its `FLOATING` clip. */
    play(pose, fade = 0.4) {
      m.pose = pose;
      m.clip(m.float ? FLOATING[pose] ?? pose : pose, fade, true);
    },
    /** Plays clip `name` (captured or weightless). `fresh`: from a random point, so a room does not breathe in step. */
    clip(name, fade = 0.4, fresh = false) {
      const clip = T.clips[name] ?? floats()[name] ?? T.clips.idle;
      const a = mixer.clipAction(clip);
      if (current === a) return;
      a.reset().fadeIn(fade).play();
      current?.fadeOut(fade);
      current = a;
      if (fresh) a.time = Math.random() * clip.duration;
    },
    mixerTime: () => current?.time ?? 0,
    speed: () => (T.clips.walk?.userData?.speed ?? 1.3) * (m.hurry ?? 1),
    /** Stops every clip, so the next `play` starts afresh (a crew member taken off a deck and used again). */
    stop() {
      mixer.stopAllAction();
      current = null;
    },
    update(dt) {
      mixer.update(dt);
    }
  };
  return m;
}

const SUIT = {
  shell: new THREE.MeshPhongMaterial({ color: '#3b4a35', shininess: 30, specular: 0x333333 }),
  visor: new THREE.MeshPhongMaterial({ color: '#1a2230', shininess: 90, specular: 0xaaaaaa, emissive: '#05070a' }),
  ring: new THREE.MeshPhongMaterial({ color: '#3a3e44', shininess: 20 }),
  pack: new THREE.MeshPhongMaterial({ color: '#2c3628', shininess: 15 }),
  lamp: new THREE.MeshBasicMaterial({ color: '#ffe6b0', toneMapped: false })
};
const deptMats = new Map();
const deptMat = (dept) => deptMats.get(dept) ?? deptMats.set(dept, new THREE.MeshPhongMaterial({ color: DEPTS[dept] ?? DEPTS.crew, shininess: 40, specular: 0x333333 })).get(dept);

/** Hangs `obj` (built in the body's frame at rest, metres, facing +z, turned as it is) on `bone`, at its rest place
 *  plus `offset`. */
function hang(bone, obj, offset) {
  if (!bone) return;
  const p = bone.getWorldPosition(new THREE.Vector3()).add(offset);
  bone.add(obj);
  obj.position.copy(bone.worldToLocal(p));
  obj.quaternion.premultiply(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
  obj.scale.setScalar(1 / bone.getWorldScale(new THREE.Vector3()).x);
}

// The duty suit's collar, made once per department and shared by everyone in it: one mesh, coloured by its vertices,
// so a suit costs one draw call more than the clothes. The collar ring the hood seals to (a flat ring round the base of
// the neck, gunmetal, with a band of the department's colour under it); the hood rolled down round the back and sides;
// the visor folded into the roll, a dark crescent showing above it. Built facing +z, the neck bone's rest place at 0.
const DUTY = {
  at: { f: new THREE.Vector3(0, 0.012, 0.008), m: new THREE.Vector3(0, 0.015, 0.01) }, // from the neck bone, by gender
  tilt: 0.25, // the front lower than the back
  collars: new Map(),
  mat: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 40, specular: 0x333333 })
};
function dutyCollar(dept) {
  if (DUTY.collars.has(dept)) return DUTY.collars.get(dept);
  const paint = (g, hex) => {
    g = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  };
  const parts = [
    paint(new THREE.TorusGeometry(0.085, 0.014, 6, 24).rotateX(Math.PI / 2), '#4c5259'),
    paint(new THREE.CylinderGeometry(0.098, 0.1, 0.018, 24, 1, true).translate(0, -0.012, 0), DEPTS[dept] ?? DEPTS.crew),
    paint(new THREE.TorusGeometry(0.098, 0.032, 8, 18, Math.PI * 1.25).rotateX(Math.PI / 2).rotateY(Math.PI * 1.125).translate(0, 0.012, -0.012), '#2f353f'),
    paint(new THREE.TorusGeometry(0.1, 0.012, 4, 14, Math.PI * 0.8).rotateX(Math.PI / 2).rotateY(Math.PI * 1.6).translate(0, 0.04, -0.018), '#141a22')
  ];
  const g = mergeGeometries(parts).rotateX(DUTY.tilt);
  DUTY.collars.set(dept, g);
  return g;
}

/** The duty suit's hard parts on a dressed person (facing +z in `outer`'s frame, as `stand()` left them): the collar
 *  (`dutyCollar`) on the neck bone, so a turn of the head never pushes the neck through it. The suit itself (its harness
 *  and pockets) is the borrowed soldier's clothes. */
function dutyParts(outer, dept, gender) {
  outer.updateMatrixWorld(true);
  const neck = byKey(outer).get('bip01neck');
  if (neck) hang(neck, new THREE.Mesh(dutyCollar(dept), DUTY.mat), DUTY.at[gender] ?? DUTY.at.m);
}

/** A vac suit's hard parts on a dressed person (facing +z in `outer`'s frame, as `stand()` left them): the helmet with
 *  its visor and neck ring on the head bone, the life-support pack on the upper spine, and a band of `dept`'s colour
 *  on the pack, so the deck crews' departments still read. Placed from the bones' rest positions. */
function vacParts(outer, dept) {
  outer.updateMatrixWorld(true);
  const nodes = byKey(outer), head = nodes.get('bip01head'), spine = nodes.get('bip01spine2') ?? nodes.get('bip01spine1');
  const helmet = new THREE.Group();
  helmet.add(new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 12), SUIT.shell));
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.168, 16, 10, -0.9 + Math.PI / 2, 1.8, 0.95, 0.85), SUIT.visor);
  helmet.add(visor);
  helmet.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 16), SUIT.ring), 0, -0.15, 0, Math.PI / 2, 0, 0));
  helmet.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.03), SUIT.lamp), 0.12, 0.08, 0.1));
  hang(head, helmet, new THREE.Vector3(0, 0.08, 0.02));
  const pack = new THREE.Group();
  pack.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.48, 0.16), SUIT.pack));
  pack.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.07, 0.17), deptMat(dept)), 0, 0.12, 0));
  hang(spine, pack, new THREE.Vector3(0, 0.02, -0.2));
}

/** Puts the layout's crew at their posts on the decks (each deck's `Interior` group, so a deck you are not on hides its
 *  crew with it). Loads in the background: the ship is walkable before anyone is aboard. Returns the list as it fills. */
export function boardCrew(C) {
  const crew = [];
  // A station that names a person the career has brought aboard (`C.named`, career.mjs `place`) is theirs.
  C.L.stations.forEach((s, k) => C.named?.has(s.person) || placeCrew(C, s, k).then((m) => crew.push(m), () => {}));
  return crew;
}

/** The cast's `k`th person at post `s` (a `stations` entry, or any { room, at, yaw, pose, dept, route }). Resolves to
 *  the crew member, standing in their deck's group; rejects if they could not be loaded. */
export function placeCrew(C, s, k) {
  const room = C.rooms.get(s.room);
  const I = C.interiorOf(room, s.seg); // a drum room's is its segment's (drum.mjs)
  // What the room calls for (`outfitFor`): the heavy suit in the airless hangar, the uniform in a drum, else the duty suit.
  return crewMember(k, s.dept, { outfit: s.outfit ?? (s.suit ? 'vac' : outfitFor(room)) }).then((m) => {
    m.root.position.set(s.at[0], I.floorY, s.at[1]);
    m.root.rotation.y = s.yaw ?? 0;
    I.group.add(m.root);
    if (C.clipPlanes) m.root.traverse((o) => o.material && [o.material].flat().forEach((x) => (x.clippingPlanes = C.clipPlanes)));
    m.deck = room.deck;
    floatIn(m, room); // a weightless room (floating.mjs)
    m.route = s.route ? s.route.map(([x, z]) => new THREE.Vector3(x, I.floorY, z)) : null;
    m.leg = 1;
    // At work where nothing has weight and there is no foot rail (the airless hangar): their feet in a foot restraint.
    if (m.float && room.vacuum && !m.route && s.pose !== 'sitChair') footRestraint(m);
    m.play(m.route ? 'walk' : s.pose);
    return m;
  }).catch((e) => {
    console.warn('crew member could not come aboard', e);
    throw e;
  });
}

/** Takes a crew member off the deck. */
export function removeCrew(m) {
  m.stop();
  m.root.removeFromParent();
}

/** Each frame for the crew on visible decks: the clips play, and anyone with a route walks it, turning at each end. */
export function tickCrew(crew, dt, visibleDeck) {
  for (const m of crew) {
    if (!visibleDeck(m.deck)) continue;
    m.update(dt);
    if (m.float) {
      floatStep(m, dt); // weightless: their own way of getting about (floating.mjs)
      continue;
    }
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
