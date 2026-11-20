// What the weapons' parts share (weapons.mjs and weapons/): scratch vectors, the meshes and materials for shells,
// rounds, torpedoes and flashes, the gunnery maths (`intercept`, `leadAccel`, `dirOf`, `turn`), and the sight's `bar`.

import * as THREE from 'three';
export { THREE };
import { corvette, fighter as wren, setThrust, metal } from '../../ships.mjs';
export { corvette };
export { wren };
export { setThrust };
export { metal };
import { at, box, cyl, glow, clamp, mulberry } from '../../util.mjs';
export { at };
export { box };
export { cyl };
export { glow };
export { clamp };
export { mulberry };
import { hazardMat } from '../../decor.mjs';
export { hazardMat };

export const DEG = Math.PI / 180;
export const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
export const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
export const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
// The railguns' and the recoil's own scratch vectors (nothing they call borrows them).
export const _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _r3 = new THREE.Vector3(), _k1 = new THREE.Vector3(), _k2 = new THREE.Vector3(), _kq = new THREE.Quaternion();

export const SHELL_GEO = new THREE.BoxGeometry(1, 1, 1);
export const SHELL_OURS = new THREE.MeshBasicMaterial({ color: '#ffe2a0', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
export const SHELL_THEIRS = new THREE.MeshBasicMaterial({ color: '#ff7048', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
export const FLASH_GEO = new THREE.SphereGeometry(1, 12, 8);
export const SLED = new THREE.MeshBasicMaterial({ color: '#ff7a1a', side: THREE.DoubleSide, toneMapped: false });
export const CABLE = new THREE.MeshBasicMaterial({ color: '#8a9098', toneMapped: false });
export const BEAM_GEO = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);

/** The shell's direction in the ship's frame for a turret trained `train` and elevated `elev` (radians), standing on
 *  the side `s` (1 on top, -1 underneath): train 0 is toward the bow, elevation is away from the hull. */
export function dirOf(train, elev, s, out = new THREE.Vector3()) {
  return out.set(-Math.sin(train) * Math.cos(elev), s * Math.sin(elev), -Math.cos(train) * Math.cos(elev));
}

/** The shortest signed angle from a to b. */
export const turn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Time for a shell at `speed` to meet a target `r` away moving at `v` (both relative to the gun), or null. */
export function intercept(r, v, speed) {
  const a = v.dot(v) - speed * speed, b = 2 * r.dot(v), c = r.dot(r);
  if (Math.abs(a) < 1e-6) return c > 0 && b < 0 ? -c / b : null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
  const t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  return t > 0 ? t : null;
}

/** Where to point a gun at `speed` so its round meets a target `r` away (relative to the gun) moving at `v` and
 *  accelerating at `a` (both relative): a few rounds of guessing the flight time. Writes the aim direction into `out`
 *  and returns the flight time, or null when the round would never get there. */
export function leadAccel(r, v, a, speed, out) {
  let t = r.length() / speed;
  for (let i = 0; i < 5; i++) {
    out.copy(r).addScaledVector(v, t).addScaledVector(a, 0.5 * t * t);
    t = out.length() / speed;
    if (t > 8) return null;
  }
  out.normalize();
  return t;
}

// The point defence's tracers: hundreds of them in the air at once, so one instanced mesh, not a mesh each.
export const ROUND_MAX = 900;
export const ROUND_OURS = new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
export const TORP_BODY = new THREE.MeshLambertMaterial({ color: '#5a6068' });
export const TORP_NOSE = new THREE.MeshLambertMaterial({ color: '#c8c0a8' });
let FLARE = null;
/** A soft round glow, drawn once: a torpedo's drive seen from kilometres off. */
export function flareTex() {
  if (FLARE) return FLARE;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(200,220,255,0.8)');
  grad.addColorStop(0.5, 'rgba(120,150,255,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  FLARE = new THREE.CanvasTexture(c);
  return FLARE;
}

/** A torpedo: a slim body with a blunt warhead, and its drive, a hot blue-white star you can see from far off. -z is
 *  its nose. `ours` paints a pale band on it. */
export function torpedoMesh(ours) {
  const g = new THREE.Group();
  g.add(at(cyl(0.45, 0.45, 5, TORP_BODY, 8), 0, 0, 0, Math.PI / 2));
  g.add(at(cyl(0.05, 0.45, 1.2, TORP_NOSE, 8), 0, 0, -3.1, -Math.PI / 2));
  if (ours) g.add(at(cyl(0.47, 0.47, 0.4, TORP_NOSE, 8), 0, 0, 0.6, Math.PI / 2));
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex(), color: ours ? '#cfe0ff' : '#ffd0c0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  flare.position.z = 3.2;
  flare.scale.setScalar(9);
  g.add(flare);
  g.userData.flare = flare;
  return g;
}

/** A point defence cannon: a turntable on the sponson, a cradle that elevates, and six barrels round an axis that
 *  spin while it fires. Built in code for either hull. `yaw` turns about the mount's up, `gun` elevates; the gun's -z
 *  is the way it fires. */
export function pdcMesh(m) {
  const dark = metal('#2c3138'), grey = metal('#6e7782', { metalness: 0.5 });
  const g = new THREE.Group();
  const yaw = new THREE.Group();
  yaw.position.y = 2.0;
  yaw.add(at(cyl(1.7, 1.9, 0.9, grey, 14), 0, 0.2, 0));
  yaw.add(at(box(2.4, 1.6, 0.5, grey), 0, 1.3, 1.0), at(box(2.4, 1.6, 0.5, grey), 0, 1.3, -1.0));
  const gun = new THREE.Group();
  gun.position.y = 1.5;
  gun.add(at(box(1.3, 1.2, 2.2, dark), 0, 0, 0.4));
  const spin = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spin.add(at(cyl(0.09, 0.09, 3.6, dark, 6), Math.cos(a) * 0.32, Math.sin(a) * 0.32, -2.1, Math.PI / 2));
  }
  spin.add(at(cyl(0.45, 0.45, 0.2, grey, 10), 0, 0, -3.6, Math.PI / 2));
  gun.add(spin);
  yaw.add(gun);
  g.add(yaw);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...m.up));
  g.position.set(...m.at);
  return { g, yaw, gun, spin };
}

/** The gunnery target: a sled of three crossed day-glo panels (a corner reflector, so the directors see it too),
 *  streamed `tow` metres astern of a yellow tug on a cable. The group's origin is the sled; -z is the way it goes. */
export function sled(tow) {
  const g = new THREE.Group();
  g.add(box(16, 0.3, 16, SLED), box(0.3, 16, 16, SLED), box(16, 16, 0.3, SLED));
  g.add(at(cyl(0.25, 0.25, tow, CABLE, 5), 0, 0, -tow / 2, Math.PI / 2));
  const tug = wren({ paint: '#e0b020' });
  tug.scale.setScalar(1.6);
  tug.position.z = -tow;
  setThrust(tug, 1);
  g.add(tug);
  g.userData.tug = tug;
  return g;
}


export function bar(g, x, y, w, k, color, label) {
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(x + 32, y, w, 6);
  g.fillStyle = color;
  g.fillRect(x + 32, y, w * clamp(k, 0, 1), 6);
  g.font = '10px ui-monospace, Menlo, monospace';
  g.fillText(label, x, y + 6);
  g.font = '12px ui-monospace, Menlo, monospace';
}
