// The carrier's fighters as built in Blender (tools/blender/fighter_build.py → assets/carrier/fighter.glb): a space
// craft, not a jet: an armoured crew capsule under a framed canopy, propellant tanks along her flanks, radiators that
// fold up for stowage where a plane would have wings, the drive on its gimbal, a thruster quad at every manoeuvring
// cluster the physics fires, chin guns, missiles, landing gear, navigation lights and a strobe, and a cockpit with its
// seat, panel, three screens, the head-up display's glass, side consoles, stick and throttle, your legs (their own node, `legs`), and the
// placards and lit legends (one texture, `Placard` / `LampLegend`). Each fighter in the hangar is a copy with its own side
// number. (The radiators are `wingFolds` to the code: they fold the same way.)
//
// The copy carries what the rest of the code expects of a fighter (ships.mjs `fighter()`): `canopyHinge`, `wingFolds`,
// `plumes` and `halos` (empty: the drive is drawn by gas.mjs `DriveFx` at `nozzle`), `eye`, `muzzles`, parts marked `cockpitHidden` (drawn only from outside) and
// `cockpitOnly` (your legs, drawn only from the seat), plus `gear`, `strobe`, `screens` and
// `hud` for the cockpit (cockpit.mjs). If the GLB is missing, the hangar keeps the code-built Wrens.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { foldWings } from '../ships.mjs';

let proto = null;
const CANOPY = new THREE.MeshStandardMaterial({ name: 'CanopyGlass', color: '#9fb8d0', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.2 });
const COMBINER = new THREE.MeshBasicMaterial({ name: 'HudGlass', color: '#7fffb0', transparent: true, opacity: 0.012, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });

/** The canopy is a closed shell in the model, with a flat cap across the sill just below the pilot's eye. Seen through
 *  double-sided glass that cap is a band across the middle of the view, so its triangles (every corner at the shell's
 *  lowest few centimetres) are dropped. */
function openBottom(g) {
  const p = g.attributes.position;
  g.computeBoundingBox();
  const floor = g.boundingBox.min.y + 0.03;
  const idx = g.index ? g.index.array : Array.from({ length: p.count }, (_, i) => i);
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (Math.max(p.getY(a), p.getY(b), p.getY(c)) >= floor) keep.push(a, b, c);
  }
  g.setIndex(keep);
}

/** Loads the model once. False if it is not there (the hangar keeps the fighters built in code). */
export async function loadFighterModel(url = 'assets/carrier/fighter.glb') {
  try {
    proto = (await new GLTFLoader().loadAsync(url)).scene;
  } catch {
    return false;
  }
  proto.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    // Metal with nothing to reflect renders near black (no environment map): keep it mostly paint, as the hull does.
    if (!/Glass/.test(m.name)) m.metalness = Math.min(m.metalness, 0.2);
    if (m.name === 'CanopyGlass') {
      // The model's canopy is opaque and dark from inside: the seat was a closed box. Swapped for real glass, as in the
      // Fighter Sound Lab: barely there, a faint cool sheen.
      o.material = CANOPY;
      o.renderOrder = 2;
      openBottom(o.geometry);
    }
    if (m.name === 'HudGlass') {
      // The HUD combiner is glass you look through, not a lit plate: a faint green tint, additive.
      o.material = COMBINER;
      o.renderOrder = 3;
    }
    if (/^Screen/.test(m.name) || /^Lamp|^Nav|Strobe|Throat/.test(m.name)) m.toneMapped = false;
    // The cockpit's labels are read at a slant (the side consoles): keep them sharp.
    for (const t of [m.map, m.emissiveMap]) if (t) t.anisotropy = 8;
  });
  return true;
}

/** A copy of the model, `n` its side number. */
export function makeFighter(n) {
  const g = proto.clone(true);
  g.name = `fighter-${n}`;
  const get = (name) => g.getObjectByName(name);
  const u = g.userData;
  u.halos = [];
  u.plumes = [];
  u.canopyHinge = get('canopy');
  u.wingFolds = [get('wing_l'), get('wing_r')];
  u.wingFolds[0].userData.side = -1;
  u.wingFolds[1].userData.side = 1;
  u.gear = get('gear');
  u.gear.userData.home = u.gear.position.y;
  u.strobe = get('strobe');
  u.strobe.visible = false;
  u.eye = get('eye').position.clone();
  u.muzzles = ['muzzle_l', 'muzzle_r'].map((k) => get(k)?.position.clone() ?? new THREE.Vector3(0, -0.8, -5.6));
  // Your legs, boots and kneeboard: drawn only from the seat (`cockpitOnly`), so a parked fighter's seat is empty.
  const legs = get('legs');
  if (legs) {
    legs.userData.cockpitOnly = true;
    legs.visible = false;
  }
  // Each screen gets its own material, so only the fighter you are in shows yours.
  u.screens = ['mfd_l', 'mfd_c', 'mfd_r'].map((k) => {
    const m = get(k);
    m.material = m.material.clone();
    return m;
  });
  u.hud = get('hud');
  // The drive's mouth: the flame, the glow and the gas are drawn there by gas.mjs `DriveFx` when she is flown.
  u.nozzle = get('nozzle').position.clone();
  // The side number, stencilled on both sides of the nose.
  const num = String(n).padStart(2, '0');
  for (const [name, s] of [['decal_l', -1], ['decal_r', 1]]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), numberMaterial(num));
    d.position.copy(get(name).position);
    d.rotation.y = (s * Math.PI) / 2;
    g.add(d);
  }
  return g;
}

const numbers = new Map();
function numberMaterial(num) {
  if (numbers.has(num)) return numbers.get(num);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#26303a';
  x.font = '700 96px "Arial Narrow", Arial, sans-serif';
  x.textBaseline = 'middle';
  x.fillText(num, 6, 66);
  x.fillStyle = '#4fd0e0';
  x.fillRect(138, 30, 112, 14);
  x.fillStyle = '#26303a';
  x.font = '600 26px Arial, sans-serif';
  x.fillText('CVS-1', 140, 82);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
  numbers.set(num, m);
  return m;
}

/** The landing gear: 1 down, 0 up in the belly (hidden). */
export function setGear(g, k) {
  const gear = g.userData.gear;
  if (!gear) return;
  gear.position.y = gear.userData.home + (1 - k) * 0.42;
  gear.visible = k > 0.03;
}

/** Puts the Blender fighters in the hangar in place of the code-built ones, on the same spots. */
export function swapFighters(C) {
  C.fighters.forEach((old, i) => {
    const w = makeFighter(i + 1);
    w.position.copy(old.position);
    w.quaternion.copy(old.quaternion);
    w.userData.live = true;
    foldWings(w, 1);
    for (const p of [...w.userData.plumes, ...w.userData.halos]) p.visible = false;
    old.parent.add(w);
    old.removeFromParent();
    C.fighters[i] = w;
  });
}
