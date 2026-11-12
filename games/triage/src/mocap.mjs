// Rocketbox's own motion capture (MIT), played on a Rocketbox person's bones directly. The clips were recorded on the
// Biped skeleton every Rocketbox person has (same bones, same axes), so nothing is retargeted: a track for "Bip01 L Hand"
// drives that person's left hand, fingers and all. Women get the f_ clips, men the m_ ones.
// Made offline by tools/convert-anims.mjs (public/assets/anims/). Only Bip01's position is fitted, by leg length: a
// shorter person's body sways and bobs less.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const key = (name) => name.replace(/[^a-z0-9]/gi, '').toLowerCase();
export const byKey = (root) => {
  const map = new Map();
  root.traverse((o) => o.name && !map.has(key(o.name)) && map.set(key(o.name), o));
  return map;
};
const legLength = (nodes) => ['bip01lcalf', 'bip01lfoot'].reduce((s, k) => s + (nodes.get(k)?.position.length() ?? 0), 0);

let index;
const files = new Map();

// The clips the game needs before a person can appear; the rest load in the background (~4.7 MB a gender in all).
export const CORE = ['idle', 'walk'];

// Clips for one gender ('f' | 'm'), each file fetched once: { clips: { idle: AnimationClip, … }, rigs, travel }.
// `names` limits it to those clips (default: every clip that gender has).
export async function loadMocap(gender, names = null) {
  index ??= await (await fetch('assets/anims/index.json')).json();
  const lib = { clips: {}, rigs: {}, travel: {} };
  await Promise.all(
    index.clips
      .filter((c) => c.gender === gender && (!names || names.includes(c.name)))
      .map(async (c) => {
        if (!files.has(c.file)) files.set(c.file, new GLTFLoader().loadAsync(`assets/anims/${c.file}`));
        const gltf = await files.get(c.file);
        lib.clips[c.name] = gltf.animations[0];
        lib.rigs[c.name] = gltf.scene;
        lib.travel[c.name] = c.travel;
      })
  );
  return lib;
}

// Female_Adult_01, Police_Female_Patrol, Medical_Female_02… (round 2: the profession names put the gender second).
export const genderOf = (personName) => (/(^|_)female(_|$)/i.test(personName) ? 'f' : 'm');

// The library's clips, re-aimed at one person: tracks renamed to that person's nodes (`nodes`: key → node, read BEFORE
// the slot bones were renamed ls_*), Bip01's position scaled by leg length. Returns { name: clip }. A walk gets
// `userData.speed` in metres a second (`worldScale`: metres per model unit) from the distance its capture covered.
export function fitMocap(lib, nodes, worldScale) {
  const out = {};
  const personLeg = legLength(nodes);
  for (const [name, clip] of Object.entries(lib.clips)) {
    const s = personLeg / legLength(byKey(lib.rigs[name])) || 1;
    const tracks = [];
    for (const t of clip.tracks) {
      const dot = t.name.lastIndexOf('.');
      const target = nodes.get(key(t.name.slice(0, dot)));
      if (!target) continue;
      const prop = t.name.slice(dot + 1);
      const copy = t.clone();
      copy.name = `${target.name}.${prop}`;
      if (prop === 'position') {
        // Up and down scale with the legs; the sideways sway is kept around where this person stands at rest.
        const v = copy.values, rest = target.position;
        let mx = 0, mz = 0;
        for (let i = 0; i < v.length; i += 3) (mx += v[i]), (mz += v[i + 2]);
        mx /= v.length / 3;
        mz /= v.length / 3;
        for (let i = 0; i < v.length; i += 3) {
          v[i] = rest.x + (v[i] - mx) * s;
          v[i + 1] *= s;
          v[i + 2] = rest.z + (v[i + 2] - mz) * s;
        }
      }
      tracks.push(copy);
    }
    const fitted = new THREE.AnimationClip(name, clip.duration, tracks);
    if (lib.travel[name]) fitted.userData = { speed: lib.travel[name] * s * worldScale };
    out[name] = fitted;
  }
  return out;
}
