// A look at the cast, outside the game: people in a row in a plain lit room, playing an idle. For checking a converted
// person by eye (tools/convert-people.mjs) — textures on the uniform, no stray props, the face, the feet on the floor.
//   /people-view.html?who=Police_Female_Patrol,Medical_Female_01&cam=front|three|back|close|closeback|body|bodyback&expr=happy&clip=idle
// `window.viewReady` turns true once everyone stands; `window.viewInfo` says where each one's feet and head are.
import * as THREE from 'three';
import { People, Animator } from './people.mjs';

const q = new URLSearchParams(location.search);
const NEW = ['Police_Female_Patrol', 'Police_Female_01', 'Security_Female_01', 'Medical_Female_01', 'Medical_Female_02', 'Medical_Female_03', 'Medical_Male_01', 'Medical_Male_02', 'Medical_Male_03', 'Security_Male_01'];
const who = (q.get('who') ?? NEW.join(',')).split(',').filter(Boolean);
const cam = q.get('cam') ?? 'front';
const expr = q.get('expr');
const clip = q.get('clip') ?? 'idle';
const SPACING = 0.85;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.getElementById('view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8a8f96);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100);

// The room: a pale floor with a grid of tiles (to read where the feet are), a back wall.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(30, 60, 0x777777, 0x999999);
grid.position.y = 0.002;
scene.add(grid);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 8), new THREE.MeshStandardMaterial({ color: 0xd8d6d0, roughness: 1 }));
wall.position.set(0, 4, -3);
scene.add(wall);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
scene.add(sun);

const people = new People({ renderer, scene, camera });
const label = document.getElementById('label');
const anims = [];
const bodies = [];
const width = (who.length - 1) * SPACING;
for (const [i, name] of who.entries()) {
  label.textContent = `Loading ${name}…`;
  const body = await people.spawn(name);
  body.outer.position.set(i * SPACING - width / 2, 0, 0);
  scene.add(body.outer);
  const anim = new Animator(body);
  anim.play({ full: body.clips[clip] ? clip : 'idle', fade: 0 });
  anims.push(anim);
  bodies.push(body);
  if (expr)
    body.outer.traverse((o) => {
      if (o.morphTargetDictionary?.[expr] !== undefined) o.morphTargetInfluences[o.morphTargetDictionary[expr]] = 1;
    });
}
label.textContent = who.map((n, i) => `${i + 1}. ${n} (${bodies[i].gender})`).join('   ') + (expr ? `   face: ${expr}` : '');

// Cameras: the whole row from the front or three-quarters, or a close-up of the first person's head and chest.
const fit = (from, at, fov = 35) => {
  camera.fov = fov;
  camera.position.copy(from);
  camera.lookAt(at);
  camera.updateProjectionMatrix();
};
const dist = Math.max(3.2, (width + 1.2) / (2 * Math.tan(THREE.MathUtils.degToRad(35 / 2)) * camera.aspect)) + 0.6;
const first = bodies[0].outer.position;
if (cam === 'front') fit(new THREE.Vector3(0, 1.0, dist), new THREE.Vector3(0, 0.88, 0));
else if (cam === 'back') fit(new THREE.Vector3(0, 1.0, -dist), new THREE.Vector3(0, 0.88, 0));
else if (cam === 'three') fit(new THREE.Vector3(dist * 0.7, 1.3, dist * 1.05), new THREE.Vector3(0, 0.85, 0));
else if (cam === 'close') fit(new THREE.Vector3(first.x + 0.35, 1.58, 0.95), new THREE.Vector3(first.x, 1.5, 0), 30);
else if (cam === 'closeback') fit(new THREE.Vector3(first.x - 0.3, 1.55, -1.25), new THREE.Vector3(first.x, 1.35, 0), 30);
else if (cam === 'body') fit(new THREE.Vector3(first.x + 1.4, 1.1, 2.6), new THREE.Vector3(first.x, 0.88, 0), 35);
else if (cam === 'bodyback') fit(new THREE.Vector3(first.x - 1.4, 1.1, -2.6), new THREE.Vector3(first.x, 0.88, 0), 35);

const clock = new THREE.Timer();
let frames = 0;
renderer.setAnimationLoop(() => {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const a of anims) a.update(dt);
  renderer.render(scene, camera);
  if (++frames === 30) {
    // Where each one stands: the lowest and highest skinned vertex (feet on the floor = min y ≈ 0).
    window.viewInfo = bodies.map((b) => {
      const box = new THREE.Box3();
      b.outer.updateMatrixWorld(true);
      b.outer.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        o.computeBoundingBox();
        box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
      });
      return { name: b.name, gender: b.gender, minY: +box.min.y.toFixed(3), maxY: +box.max.y.toFixed(3) };
    });
    window.viewReady = true;
  }
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
