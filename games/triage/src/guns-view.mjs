// The viewer for src/guns.mjs (public/guns-view.html). Renders once, then sets window.__ready for a screenshot.
import * as THREE from 'three';
import { buildWeapon, buildPickup, buildAmmo, WEAPON_KINDS } from './guns.mjs';

const q = new URLSearchParams(location.search);
const only = q.get('only');
const dim = q.has('dim');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Number(q.get('dpr') ?? 1));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(dim ? 0x1c1e22 : 0x8c8f93);
if (dim) {
  scene.add(new THREE.HemisphereLight(0x8a9aa8, 0x1a1c20, 0.35));
  const p = new THREE.PointLight(0xfff2d8, 6, 8, 1.4);
  p.position.set(-1.2, 1.6, 0.6);
  scene.add(p);
} else {
  scene.add(new THREE.HemisphereLight(0xe4ebf2, 0x3c3e42, 1.1));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
  key.position.set(-3, 5, 3);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.8);
  fill.position.set(4, 2, -2);
  const rim = new THREE.DirectionalLight(0xffffff, 0.7);
  rim.position.set(0, 3, -5);
  scene.add(key, fill, rim);
}
const camera = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 30), innerWidth / innerHeight, 0.01, 50);
const stats = {};
const tris = (o) => {
  let n = 0, calls = 0;
  o.traverse((m) => m.isMesh && ((n += m.geometry.attributes.position.count / 3), calls++));
  return { tris: n, calls };
};
const marker = (color, p, parent) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 6), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  m.renderOrder = 9;
  m.position.copy(p);
  parent.add(m);
};
const fit = (obj, yawDeg, pitchDeg) => {
  const bb = new THREE.Box3().setFromObject(obj);
  const c = bb.getCenter(new THREE.Vector3());
  const r = bb.getSize(new THREE.Vector3()).length() / 2;
  const yaw = THREE.MathUtils.degToRad(yawDeg), pitch = THREE.MathUtils.degToRad(pitchDeg);
  const dir = new THREE.Vector3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
  const d = q.has('dist') ? Number(q.get('dist')) : (r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * Number(q.get('zoom') ?? 0.75);
  camera.position.copy(c).addScaledVector(dir, d);
  camera.lookAt(c);
};

if (only) {
  // One weapon (or pickup:x / ammo:x), close up. Default view: from the right side (-X), a little in front, above.
  let obj;
  if (only.startsWith('pickup:')) obj = buildPickup(only.slice(7));
  else if (only.startsWith('ammo:')) obj = buildAmmo(only.slice(5));
  else {
    const w = buildWeapon(only);
    obj = w.group;
    stats[only] = { ...w.group.userData, ...tris(w.group), muzzle: w.muzzle.toArray().map((v) => +v.toFixed(4)), support: w.support?.toArray().map((v) => +v.toFixed(4)) ?? null };
    if (q.has('markers')) {
      marker(0x2060ff, new THREE.Vector3(), w.group);
      marker(0xff2020, w.muzzle, w.group);
      if (w.support) marker(0x20ff40, w.support, w.group);
    }
    if (q.has('rack') && w.pump) w.pump.position.z = -0.085;
  }
  scene.add(obj);
  fit(obj, Number(q.get('yaw') ?? (q.has('side') ? 180 : 155)), Number(q.get('pitch') ?? (q.has('side') ? 0 : 18)));
} else if (q.has('floor')) {
  // The floor pickups and the ammo, seen from a standing height a couple of metres away.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshPhongMaterial({ color: dim ? 0x5a5c60 : 0x9a9da1, shininess: 5 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const items = ['pistol', 'smg', 'shotgun', 'rifle', 'bat', 'knife'].map((k) => buildPickup(k)).concat(['pistol', 'shells', 'medkit', 'smg', 'rifle'].map((k) => buildAmmo(k)));
  items.forEach((o, i) => {
    // The weapons in a row side by side (each lies along Z), the ammo in a row in front.
    if (i < 6) o.position.set(-0.1 + i * 0.22, 0, 0);
    else o.position.set(-0.55, 0, (i - 8) * 0.42);
    scene.add(o);
  });
  camera.position.set(-2.4, 1.65, 0.0);
  camera.lookAt(0, 0, 0.0);
} else {
  // The six weapons in two columns, as if hung on a wall, seen from their right side.
  const order = ['pistol', 'knife', 'smg', 'bat', 'shotgun', 'rifle'];
  order.forEach((kind, i) => {
    const w = buildWeapon(kind);
    stats[kind] = { ...w.group.userData, ...tris(w.group), muzzle: w.muzzle.toArray().map((v) => +v.toFixed(4)), support: w.support?.toArray().map((v) => +v.toFixed(4)) ?? null };
    const col = i % 2, row = Math.floor(i / 2);
    w.group.position.set(0, 0.6 - row * 0.3, col * 1.2 - 0.75);
    scene.add(w.group);
  });
  camera.position.set(-2.9, 0.6, 0.0);
  camera.lookAt(0, 0.3, 0.0);
}
document.getElementById('info').textContent = Object.entries(stats)
  .map(([k, s]) => `${k.padEnd(8)} ${String(s.length).padEnd(6)} m  ${String(s.tris).padStart(5)} tris  ${s.calls} calls  muzzle ${s.muzzle}  support ${s.support}`)
  .join('\n');
window.__stats = stats;
renderer.render(scene, camera);
requestAnimationFrame(() => {
  renderer.render(scene, camera);
  window.__ready = true;
});
addEventListener('error', (e) => (window.__error = String(e.message)));
