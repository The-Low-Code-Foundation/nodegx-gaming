// The places a Sim lives in: the starter flat, a park, an office. Every model is loaded once, fitted to a real size, and
// drawn as an InstancedMesh per part — forty trees of one kind cost one draw call, not forty. Static things never
// recompute their matrices. Each place gives the same handle: floor, walls (dropped when they stand between the camera
// and the room, the Sims' "walls down"), the things a Sim can use and where it stands to use them, and a walk grid.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dressHome, dressHouse, dressOffice, dressCafe, dressPark, dressStreet, pondLife, lampGlow, streetLabel } from './dressing.mjs';
import { kindOf } from './game/shop.mjs';

const loader = new GLTFLoader();
const cache = new Map();
const UP = new THREE.Vector3(0, 1, 0);

// A model at height 1, centred, standing on y = 0, with each mesh's matrix relative to that.
async function unitModel(url) {
  if (!cache.has(url))
    cache.set(
      url,
      loader.loadAsync(url).then((gltf) => {
        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const c = box.getCenter(new THREE.Vector3());
        const fit = new THREE.Matrix4().makeScale(1 / size.y, 1 / size.y, 1 / size.y).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
        const parts = [];
        root.traverse((o) => o.isMesh && parts.push({ geometry: o.geometry, material: o.material, matrix: fit.clone().multiply(o.matrixWorld) }));
        if (url.includes('/furniture/')) for (const p of parts) for (const m of [p.material].flat()) polish(m);
        return { parts, size: size.clone().divideScalar(size.y) };
      })
    );
  return cache.get(url);
}

// Round 11: the furniture pack's flat materials, by name, made to look like what they are: ceramic white and glossy
// (the toilet and basins read as concrete), metal metallic, the oven's glass see-through, the near-black wood a warm
// brown. Each model file has its own materials, so this changes nothing else.
function polish(m) {
  if (m.userData.polished) return;
  m.userData.polished = true;
  switch (m.name) {
    case 'White': m.color.multiplyScalar(2.4), (m.roughness = 0.18); break;
    case 'LightMetal': case 'Metal': case 'DarkMetal': (m.metalness = 0.85), (m.roughness = 0.3), m.color.multiplyScalar(m.name === 'DarkMetal' ? 1.5 : 3); break;
    case 'Glass': Object.assign(m, { transparent: true, opacity: 0.4, roughness: 0.05 }); break;
    case 'Wood': m.color.setRGB(0.2, 0.11, 0.055), (m.roughness = 0.55); break;
    case 'KitchenTop': m.roughness = 0.28; break;
  }
}

// A model made in code (a desk, a bench), in the same shape as unitModel's.
function madeModel(parts, height) {
  const size = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    size.union(p.geometry.boundingBox.clone().applyMatrix4(p.matrix));
  }
  const s = 1 / height;
  return { parts: parts.map((p) => ({ ...p, matrix: new THREE.Matrix4().makeScale(s, s, s).multiply(p.matrix) })), size: size.getSize(new THREE.Vector3()).multiplyScalar(s) };
}
const box = (w, h, d, x, y, z, material) => ({ geometry: new THREE.BoxGeometry(w, h, d), material, matrix: new THREE.Matrix4().makeTranslation(x, y, z) });
const wood = new THREE.MeshStandardMaterial({ color: 0x9a7350, roughness: 0.8 });
const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.4 });
const deskTop = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.6 });
const DESK = madeModel([box(1.4, 0.04, 0.7, 0, 0.73, 0, deskTop), box(0.04, 0.71, 0.66, -0.66, 0.355, 0, metal), box(0.04, 0.71, 0.66, 0.66, 0.355, 0, metal), box(1.3, 0.35, 0.02, 0, 0.5, -0.3, deskTop)], 0.75);
const screen = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.3 });
// Round 11: the screen shows a desktop (windows, a chart, a page of text) instead of a black slab.
function desktopTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 80;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 128, 80);
  bg.addColorStop(0, '#2c6fb8'), bg.addColorStop(1, '#5fb0d8');
  g.fillStyle = bg, g.fillRect(0, 0, 128, 80);
  g.fillStyle = '#f4f6f8', g.fillRect(8, 8, 64, 50);
  g.fillStyle = '#3a4a5a', g.fillRect(8, 8, 64, 6);
  g.fillStyle = '#9aa8b4';
  for (let y = 20; y < 54; y += 6) g.fillRect(12, y, 30 + ((y * 7) % 24), 2);
  g.fillStyle = '#fbfbfb', g.fillRect(60, 26, 60, 44);
  g.fillStyle = '#3a4a5a', g.fillRect(60, 26, 60, 6);
  for (const [k, h, col] of [[0, 18, '#e8484a'], [1, 28, '#f2c94c'], [2, 12, '#3fa36a'], [3, 24, '#2b6cc4']]) (g.fillStyle = col), g.fillRect(68 + k * 12, 66 - h, 8, h);
  g.fillStyle = 'rgba(20,30,40,0.7)', g.fillRect(0, 74, 128, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const desktop = typeof document === 'undefined' ? screen : new THREE.MeshBasicMaterial({ map: desktopTexture() });
const MONITOR = madeModel([box(0.56, 0.34, 0.03, 0, 0.3, 0, screen), { geometry: new THREE.PlaneGeometry(0.52, 0.3), material: desktop, matrix: new THREE.Matrix4().makeTranslation(0, 0.3, 0.0155) }, box(0.05, 0.14, 0.05, 0, 0.07, -0.02, metal), box(0.22, 0.015, 0.16, 0, 0.008, -0.02, metal), box(0.42, 0.015, 0.14, 0, 0.008, 0.2, metal)], 0.47);
// A park bench (round 11: slats on cast-iron ends, where round 2's was two planks on two blocks). Same size as before.
const iron = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.55, metalness: 0.5 });
const slat = new THREE.MeshStandardMaterial({ color: 0x9a6a40, roughness: 0.7 });
const BENCH = madeModel([
  ...[-0.15, -0.05, 0.05, 0.15].map((z) => box(1.6, 0.035, 0.08, 0, 0.45, z, slat)),
  ...[0.58, 0.7, 0.82].map((y, k) => ({ geometry: new THREE.BoxGeometry(1.6, 0.08, 0.03), material: slat, matrix: new THREE.Matrix4().makeRotationX(-0.18).setPosition(0, y, -0.19 - k * 0.02) })),
  ...[-0.7, 0.7].flatMap((x) => [box(0.05, 0.43, 0.05, x, 0.215, 0.17, iron), box(0.05, 0.86, 0.05, x, 0.43, -0.18, iron), box(0.05, 0.04, 0.4, x, 0.42, 0, iron), box(0.05, 0.05, 0.36, x, 0.62, 0.0, iron)])
], 0.88);

// Round 9: the office's work stations (one per school subject) and the park's bus stop, made in code like the desk.
const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 });
const glassMat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.8 });
const red = new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.45 });
const paper = new THREE.MeshStandardMaterial({ color: 0xfffbf0, roughness: 0.9 });
const cyl = (r, h, x, y, z, material) => ({ geometry: new THREE.CylinderGeometry(r, r * 0.9, h, 16), material, matrix: new THREE.Matrix4().makeTranslation(x, y, z) });
// A lab bench: white top, flasks of coloured water, a rack of test tubes.
const LAB_BENCH = madeModel([
  box(1.6, 0.05, 0.7, 0, 0.9, 0, white), box(1.5, 0.85, 0.6, 0, 0.43, -0.02, metal),
  cyl(0.07, 0.22, -0.5, 1.03, 0, glassMat(0x3fa7e0)), cyl(0.06, 0.18, -0.3, 1.01, 0.1, glassMat(0x6fd36a)), cyl(0.08, 0.26, 0.45, 1.05, -0.05, glassMat(0xe0559a)),
  box(0.4, 0.04, 0.12, 0.05, 0.98, -0.15, wood), ...[-0.12, -0.04, 0.04, 0.12, 0.2].map((x, k) => cyl(0.018, 0.16, x, 1.06, -0.15, glassMat([0xf2c43a, 0x3fa7e0, 0xe0559a, 0x6fd36a, 0xf08a3c][k])))
], 1.2);
// A globe on a stand: blue sea, green land (a painted texture), tilted like the Earth.
function globeTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3b7fc4';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#5fae4e';
  for (const [x, y, rx, ry] of [[40, 40, 22, 26], [62, 88, 14, 26], [128, 34, 22, 16], [134, 74, 16, 26], [190, 40, 40, 18], [214, 92, 16, 10]]) g.beginPath(), g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2), g.fill();
  g.fillStyle = '#f2f6fa';
  g.fillRect(0, 0, 256, 8), g.fillRect(0, 120, 256, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const globeMat = typeof document === 'undefined' ? white : new THREE.MeshStandardMaterial({ map: globeTexture(), roughness: 0.6 });
const GLOBE = madeModel([
  box(0.9, 0.05, 0.6, 0, 0.75, 0, wood), box(0.06, 0.73, 0.06, -0.38, 0.365, -0.24, wood), box(0.06, 0.73, 0.06, 0.38, 0.365, -0.24, wood), box(0.06, 0.73, 0.06, -0.38, 0.365, 0.24, wood), box(0.06, 0.73, 0.06, 0.38, 0.365, 0.24, wood),
  cyl(0.02, 0.18, 0, 0.86, 0, metal),
  { geometry: new THREE.SphereGeometry(0.24, 32, 16), material: globeMat, matrix: new THREE.Matrix4().makeRotationZ(0.41).setPosition(0, 1.17, 0) }
], 1.41);
// The letters desk: a desk with piles of letters and envelopes.
const LETTERS = madeModel([
  box(1.4, 0.04, 0.7, 0, 0.73, 0, deskTop), box(0.04, 0.71, 0.66, -0.66, 0.355, 0, metal), box(0.04, 0.71, 0.66, 0.66, 0.355, 0, metal),
  box(0.3, 0.12, 0.22, -0.4, 0.81, -0.1, paper), box(0.3, 0.07, 0.22, 0.0, 0.785, -0.12, paper), box(0.26, 0.04, 0.18, 0.4, 0.77, 0.05, paper), box(0.18, 0.01, 0.12, 0.15, 0.755, 0.15, red)
], 0.85);
// A red phone box: "call the London office" (English).
const PHONE_BOX = madeModel([
  box(0.95, 2.3, 0.95, 0, 1.15, 0, red), box(1.02, 0.12, 1.02, 0, 2.36, 0, red),
  box(0.7, 1.2, 0.02, 0, 1.4, 0.48, glassMat(0xbfd8e8)), box(0.5, 0.12, 0.02, 0, 2.12, 0.48, paper)
], 2.42);
// A bus stop for the park's way in and out: a pole, a blue sign, a little shelter roof.
const blue = new THREE.MeshStandardMaterial({ color: 0x2b6cc4, roughness: 0.5 });
const BUS_STOP = madeModel([cyl(0.04, 2.4, 0, 1.2, 0, metal), box(0.5, 0.5, 0.04, 0, 2.2, 0.02, blue), box(0.06, 2.1, 0.06, 0.9, 1.05, -0.3, metal), box(1.4, 0.05, 0.7, 0.55, 2.1, -0.1, new THREE.MeshStandardMaterial({ color: 0xd8ecf6, roughness: 0.1, transparent: true, opacity: 0.25, depthWrite: false }))], 2.45);
// (Round 11: the roof was 80% opaque and hid a couple arriving by bus from the camera above; now clear glass.)
// Round 16, phase 4.2: the street's notice board, by the bus stop: two posts, a little roof, a cork board with notes
// pinned to it (what has changed in the town: the page's).
const cork = new THREE.MeshStandardMaterial({ color: 0xb5835a, roughness: 0.95 });
const NOTICE_BOARD = madeModel([
  box(0.08, 2.0, 0.08, -0.7, 1.0, 0, wood), box(0.08, 2.0, 0.08, 0.7, 1.0, 0, wood), box(1.7, 0.06, 0.4, 0, 2.03, 0, wood),
  box(1.4, 0.9, 0.05, 0, 1.45, 0.02, cork),
  box(0.34, 0.26, 0.01, -0.42, 1.62, 0.05, paper), box(0.3, 0.36, 0.01, 0.02, 1.52, 0.05, paper), box(0.34, 0.24, 0.01, 0.44, 1.66, 0.05, paper),
  box(0.3, 0.22, 0.01, -0.36, 1.24, 0.05, paper), box(0.36, 0.2, 0.01, 0.4, 1.22, 0.05, paper), box(0.06, 0.06, 0.012, 0.02, 1.7, 0.056, red)
], 2.06);
// A camp bed: where someone who moves in sleeps (the flat has two beds; round 9).
const CAMP_BED = madeModel([box(0.85, 0.06, 1.9, 0, 0.3, 0, metal), box(0.8, 0.12, 1.85, 0, 0.39, 0, glassMat(0x4a6fa5)), box(0.6, 0.08, 0.3, 0, 0.49, -0.75, paper), ...[[-0.38, -0.88], [0.38, -0.88], [-0.38, 0.88], [0.38, 0.88]].map(([x, z]) => box(0.04, 0.3, 0.04, x, 0.15, z, metal))], 0.53);

// Round 10 (the playtesters' realism list, the design brief): a fridge whose door opens, a TV that looks like a TV, water in the
// shower. The fridge and the TV are made here so their moving parts (the door, the picture) are their own meshes
// (`moving`, below); the Kitchen_Fridge and TV_1 models were one solid piece each, and TV_1 is an old set with an aerial
// ("like a space satellite"). Sizes in metres, front facing +Z, centred on x and z.
const fridgeWhite = new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.35, metalness: 0.1 });
const fridgeInside = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.6, emissive: 0x9fb8cc, emissiveIntensity: 0.25 });
const shelfGlass = new THREE.MeshStandardMaterial({ color: 0xcfe6f2, roughness: 0.1, transparent: true, opacity: 0.6 });
const food = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
const FRIDGE = madeModel([
  // A cabinet open at the front: back, sides, top, bottom, a light inside, three glass shelves with food on them.
  box(0.74, 1.86, 0.03, 0, 0.93, -0.33, fridgeWhite), box(0.03, 1.86, 0.66, -0.355, 0.93, 0, fridgeWhite), box(0.03, 1.86, 0.66, 0.355, 0.93, 0, fridgeWhite),
  box(0.74, 0.04, 0.66, 0, 1.84, 0, fridgeWhite), box(0.74, 0.1, 0.66, 0, 0.05, 0, fridgeWhite), box(0.68, 1.72, 0.01, 0, 0.94, -0.31, fridgeInside),
  ...[0.5, 0.95, 1.4].map((y) => box(0.66, 0.012, 0.58, 0, y, 0, shelfGlass)),
  cyl(0.04, 0.24, -0.22, 1.08, -0.1, glassMat(0xf6f2e4)), cyl(0.04, 0.22, -0.12, 1.07, -0.12, glassMat(0xf29a3a)), box(0.18, 0.1, 0.14, 0.15, 1.01, -0.05, food(0xf5d76e)),
  box(0.22, 0.12, 0.16, -0.12, 0.57, -0.05, food(0x7ac16a)), cyl(0.07, 0.08, 0.18, 0.55, 0, food(0xd9433b)), box(0.12, 0.2, 0.08, 0.05, 1.51, -0.1, food(0x3d7dd8)), cyl(0.05, 0.12, -0.2, 1.47, 0, food(0xffffff))
], 1.9);
// The door, hinged on its left (seen from the front): a slab, a handle, and shelves on its inside.
const fridgeDoor = () => {
  const g = new THREE.Group();
  for (const p of [box(0.74, 1.86, 0.05, 0.37, 0.93, 0.025, fridgeWhite), box(0.03, 0.5, 0.04, 0.66, 1.2, 0.075, metal), box(0.6, 0.08, 0.1, 0.37, 0.7, -0.05, fridgeInside), box(0.6, 0.08, 0.1, 0.37, 1.3, -0.05, fridgeInside)]) {
    const m = new THREE.Mesh(p.geometry, p.material);
    m.applyMatrix4(p.matrix);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  return g;
};
// A flat-screen TV on a low cabinet; its picture is drawn on a canvas (`tvScreen`) and plays while someone watches.
const TV = madeModel([
  box(1.3, 0.42, 0.4, 0, 0.21, 0, wood), box(1.26, 0.02, 0.36, 0, 0.43, 0, metal), box(0.2, 0.08, 0.16, 0, 0.47, -0.02, metal), box(0.05, 0.12, 0.04, 0, 0.55, -0.04, metal),
  box(1.16, 0.68, 0.05, 0, 0.94, -0.03, screen)
], 1.28);
function tvScreen() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 144;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.62), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  mesh.position.set(0, 0.94, 0.0);
  let t = 0, drawnAt = -1, on = null;
  // A cartoon: a sky that changes with the "show", hills, a ball that bounces, clouds going by. Redrawn ten times a
  // second while on (one small texture upload), black and still when off.
  const draw = () => {
    if (!on) {
      g.fillStyle = '#0d0f12';
      g.fillRect(0, 0, 256, 144);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.beginPath(), g.ellipse(70, 30, 80, 20, -0.3, 0, Math.PI * 2), g.fill();
      return;
    }
    const show = Math.floor(t / 20) % 3;
    const skies = [['#7cc6f2', '#d8f0ff'], ['#f6a96b', '#ffe3b0'], ['#2b2f6b', '#6a5bb0']];
    const sky = g.createLinearGradient(0, 0, 0, 144);
    sky.addColorStop(0, skies[show][0]);
    sky.addColorStop(1, skies[show][1]);
    g.fillStyle = sky;
    g.fillRect(0, 0, 256, 144);
    g.fillStyle = show === 2 ? '#fdf6c9' : '#ffd84a';
    g.beginPath(), g.arc(200, 34, 16, 0, Math.PI * 2), g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let k = 0; k < 3; k++) {
      const x = ((t * 12 + k * 110) % 330) - 40;
      g.beginPath(), g.ellipse(x, 26 + k * 14, 22, 9, 0, 0, Math.PI * 2), g.ellipse(x + 16, 22 + k * 14, 16, 8, 0, 0, Math.PI * 2), g.fill();
    }
    g.fillStyle = ['#5fb85a', '#7aa84a', '#3f6a8a'][show];
    g.beginPath(), g.ellipse(60, 150, 120, 50, 0, 0, Math.PI * 2), g.ellipse(210, 156, 110, 46, 0, 0, Math.PI * 2), g.fill();
    const bx = 40 + ((t * 30) % 180), by = 110 - Math.abs(Math.sin(t * 2.6)) * 60;
    g.fillStyle = ['#e8484a', '#3d7dd8', '#f2c94c'][show];
    g.beginPath(), g.arc(bx, by, 10, 0, Math.PI * 2), g.fill();
    g.fillStyle = '#fff';
    g.beginPath(), g.arc(bx - 3, by - 3, 3, 0, Math.PI * 2), g.fill();
  };
  return {
    mesh,
    update(dt, playing) {
      if (playing !== on) (on = playing), (drawnAt = -1);
      if (on) t += dt;
      const frame = on ? Math.floor(t * 10) : 0;
      if (frame === drawnAt) return;
      drawnAt = frame;
      draw();
      tex.needsUpdate = true;
    }
  };
}
// Water from a shower head: falling streaks while someone showers, nothing otherwise.
function showerWater(head) {
  const N = 220, pos = new Float32Array(N * 6), seed = [];
  for (let i = 0; i < N; i++) seed.push({ a: Math.random() * Math.PI * 2, r: Math.random(), y: Math.random() });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.85 }));
  lines.frustumCulled = false;
  lines.visible = false;
  // A soft cone of spray round the streaks, and a wet patch on the tray.
  const spray = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.32, head.y, 20, 1, true).translate(0, -head.y / 2, 0), new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
  spray.position.copy(head);
  const wet = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9fd2f2, transparent: true, opacity: 0.35, depthWrite: false }));
  wet.position.set(head.x, 0.03, head.z);
  lines.add(spray, wet);
  spray.position.sub(lines.position);
  const fall = head.y - 0.02;
  return {
    mesh: lines,
    update(dt, on) {
      lines.visible = on;
      if (!on) return;
      for (let i = 0; i < N; i++) {
        const s = seed[i];
        s.y = (s.y + dt * 2.2) % 1;
        // The spray widens as it falls.
        const spread = 0.05 + s.y * 0.28 * s.r;
        const x = head.x + Math.cos(s.a) * spread, z = head.z + Math.sin(s.a) * spread, y = head.y - s.y * fall;
        pos.set([x, y, z, x, y - 0.12, z], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
    }
  };
}
const SHOWER_HEAD = madeModel([cyl(0.09, 0.03, 0, 0.015, 0, metal), cyl(0.015, 0.3, 0, 0.17, -0.12, metal)], 0.32);

// A telescope on a tripod (round 10's buy menu): looking through it is fun and teaches science.
const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.35, metalness: 0.6 });
const TELESCOPE = madeModel([
  ...[0, 2.1, 4.2].map((a) => ({ geometry: new THREE.CylinderGeometry(0.015, 0.015, 1.2, 8), material: wood, matrix: new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationX(0.32)).setPosition(Math.sin(a) * 0.18, 0.56, Math.cos(a) * 0.18) })),
  { geometry: new THREE.CylinderGeometry(0.06, 0.08, 0.8, 16), material: brass, matrix: new THREE.Matrix4().makeRotationX(-1.0).setPosition(0, 1.2, -0.05) },
  cyl(0.05, 0.08, 0, 1.13, 0, metal)
], 1.55);
// A cot for a baby (round 12): white bars, a mattress, a folded blanket, and a mobile of stars over it. Long along X; a
// Sim stands at its long side (+Z) to see to the baby. The baby itself is drawn by the page (props.mjs `baby`).
const cotWhite = new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 0.5 });
const COT = madeModel([
  ...[[-0.6, -0.33], [0.6, -0.33], [-0.6, 0.33], [0.6, 0.33]].map(([x, z]) => box(0.05, 0.95, 0.05, x, 0.475, z, cotWhite)),
  ...[-0.33, 0.33].flatMap((z) => [box(1.25, 0.04, 0.04, 0, 0.93, z, cotWhite), box(1.25, 0.05, 0.04, 0, 0.36, z, cotWhite)]),
  ...[-0.33, 0.33].flatMap((z) => [-0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5].map((x) => box(0.022, 0.56, 0.022, x, 0.65, z, cotWhite))),
  box(0.03, 0.6, 0.62, -0.6, 0.65, 0, cotWhite), box(0.03, 0.6, 0.62, 0.6, 0.65, 0, cotWhite),
  box(1.15, 0.1, 0.6, 0, 0.42, 0, paper), box(0.42, 0.03, 0.6, -0.34, 0.485, 0, new THREE.MeshStandardMaterial({ color: 0xbfe0d4, roughness: 0.9 })),
  cyl(0.012, 0.62, -0.62, 1.24, -0.3, cotWhite), box(0.02, 0.02, 0.62, -0.62, 1.54, -0.02, cotWhite),
  ...[[0.05, 0xf2c43a], [0.2, 0x7fb8e8], [0.35, 0xf29ab8]].map(([z, c]) => cyl(0.035, 0.012, -0.62, 1.38, z - 0.05, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })))
], 1.55);
// Round 16, phase 5 (skills.mjs): four things to buy for the new skills, made here (there is no model for them in
// the furniture pack). Each faces +Z, where the Sim stands.
const mat5 = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });
// Their boxes merged into one mesh per material (a keyboard's keys are one draw call, not ten).
function merged(parts) {
  const by = new Map();
  for (const p of parts) by.set(p.material, [...(by.get(p.material) ?? []), p.geometry.clone().applyMatrix4(p.matrix)]);
  return [...by].map(([material, list]) => ({ geometry: mergeGeometries(list), material, matrix: new THREE.Matrix4() }));
}
const [canvasWhite, soil, leaf, keysWhite, keysBlack, steel] = [mat5(0xfaf7ee, 0.9), mat5(0x5a3e2b, 1), mat5(0x5aa84a, 0.8), mat5(0xf6f6f2, 0.4), mat5(0x1c1c20, 0.4), mat5(0x8a9098, 0.4)];
// An easel: three legs, a ledge, and a canvas with a painting begun (a sky, a hill, a sun).
const EASEL = madeModel(merged([
  box(0.04, 1.7, 0.04, -0.32, 0.85, 0.05, wood), box(0.04, 1.7, 0.04, 0.32, 0.85, 0.05, wood), box(0.04, 1.6, 0.04, 0, 0.8, -0.35, wood),
  box(0.8, 0.04, 0.1, 0, 0.82, 0.1, wood), box(0.7, 0.6, 0.03, 0, 1.15, 0.1, canvasWhite),
  box(0.66, 0.26, 0.005, 0, 1.3, 0.117, mat5(0x8cc4e8)), box(0.66, 0.2, 0.005, 0, 1.0, 0.117, mat5(0x6aa84a)), box(0.1, 0.1, 0.006, 0.18, 1.33, 0.12, mat5(0xf2c94c))
]), 1.72);
// A keyboard on a stand, with a stool's worth of room in front.
const KEYBOARD = madeModel(merged([
  box(0.04, 0.75, 0.04, -0.45, 0.375, 0, metal), box(0.04, 0.75, 0.04, 0.45, 0.375, 0, metal), box(0.95, 0.03, 0.06, 0, 0.3, 0, metal),
  box(1.1, 0.08, 0.32, 0, 0.79, 0, keysBlack), box(1.0, 0.025, 0.14, 0, 0.84, 0.07, keysWhite),
  ...[-0.42, -0.34, -0.22, -0.14, -0.06, 0.06, 0.14, 0.26, 0.34, 0.42].map((x) => box(0.035, 0.025, 0.08, x, 0.86, 0.04, keysBlack))
]), 0.87);
// A raised planter of vegetables: a wooden box of soil, rows of leaves, a few carrots' tops and tomatoes.
const PLANTER = madeModel(merged([
  box(1.2, 0.45, 0.6, 0, 0.225, 0, wood), box(1.12, 0.04, 0.52, 0, 0.45, 0, soil),
  ...[-0.42, -0.21, 0, 0.21, 0.42].flatMap((x, k) => [box(0.12, 0.14 + (k % 2) * 0.06, 0.1, x, 0.53, -0.13, leaf), box(0.1, 0.1, 0.1, x + 0.05, 0.51, 0.13, leaf)]),
  ...[[-0.3, 0.13], [0.12, 0.15], [0.36, -0.1]].map(([x, z]) => box(0.06, 0.06, 0.06, x, 0.6, z, mat5(0xd8402a, 0.4)))
]), 0.68);
// A workbench: a sturdy top, a shelf, a vice, a hammer and a saw on the wall board behind.
const WORKBENCH = madeModel(merged([
  box(1.4, 0.06, 0.6, 0, 0.88, 0, wood), ...[[-0.65, -0.25], [0.65, -0.25], [-0.65, 0.25], [0.65, 0.25]].map(([x, z]) => box(0.06, 0.86, 0.06, x, 0.43, z, wood)),
  box(1.3, 0.04, 0.5, 0, 0.25, 0, wood), box(1.4, 0.7, 0.03, 0, 1.3, -0.29, mat5(0xc8a878)),
  box(0.14, 0.1, 0.1, 0.5, 0.96, 0.2, steel), box(0.05, 0.3, 0.02, -0.3, 1.35, -0.27, wood), box(0.12, 0.05, 0.03, -0.3, 1.5, -0.26, steel), box(0.36, 0.12, 0.01, 0.2, 1.3, -0.27, steel)
]), 1.65);
// Round 16, phase 5.4: the pet's basket, with a bowl in front (pets.mjs). Faces +Z, where the Sim stands.
const PET_BED = madeModel(merged([
  box(0.7, 0.12, 0.55, 0, 0.06, -0.1, mat5(0xb07a4a, 0.9)), box(0.6, 0.06, 0.45, 0, 0.13, -0.1, mat5(0xd8574a, 1)),
  box(0.7, 0.2, 0.06, 0, 0.16, -0.36, mat5(0xb07a4a, 0.9)),
  cyl(0.09, 0.06, 0.22, 0.03, 0.3, mat5(0x2b6cc4, 0.4)), cyl(0.075, 0.02, 0.22, 0.06, 0.3, mat5(0x8a5a2a, 1))
]), 0.3);
export const MADE = { CAMP_BED, FRIDGE, TV, TELESCOPE, COT, EASEL, KEYBOARD, PLANTER, WORKBENCH, PET_BED };

// A sign over a work station: the subject's icon and name, always facing the camera.
function sign(text, icon, colour) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = '600 60px system-ui, sans-serif';
  g.font = font;
  const label = `${icon} ${text}`;
  c.width = Math.ceil(g.measureText(label).width) + 80;
  c.height = 128;
  g.font = font;
  g.fillStyle = colour;
  g.beginPath();
  g.roundRect(8, 8, c.width - 16, 112, 56);
  g.fill();
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.fillText(label, 40, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(0.42 * (c.width / c.height), 0.42, 1);
  sp.renderOrder = 10;
  return sp;
}

// Places things. Each placement: [model, x, z, turn (radians; 0 = its front faces +Z), height | {width}, use?, lift?].
// One placement, measured but not drawn: where it stands, its footprint, and (with a `use`) where a Sim stands to use it.
// The buy menu (round 10) measures a thing under the pointer this way before it is bought.
export async function measure(src, x, z, turn, fit, use = null, lift = 0) {
  const model = typeof src === 'string' ? await unitModel(src) : src;
  const s = typeof fit === 'number' ? fit : fit.width / Math.max(model.size.x, model.size.z);
  const obj = new THREE.Object3D();
  obj.position.set(x, lift || (use?.walkable ? 0.006 : 0), z);
  obj.rotation.y = turn;
  obj.scale.setScalar(s);
  obj.updateMatrix();
  const half = model.size.clone().multiplyScalar(s / 2);
  const footprint = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, half.y, 0), half.clone().multiplyScalar(2));
  footprint.applyMatrix4(new THREE.Matrix4().makeRotationY(turn).setPosition(x, 0, z));
  // A plant's leaves spread wider than its pot (`use.trim`): it stands on, and blocks, only the middle of its box.
  if (use?.trim) {
    const c = footprint.getCenter(new THREE.Vector3()), size = footprint.getSize(new THREE.Vector3());
    footprint.setFromCenterAndSize(c, size.set(size.x * use.trim, size.y, size.z * use.trim));
  }
  const item = { name: typeof src === 'string' ? src.split('/').pop().replace('.glb', '') : 'made', obj, use, footprint, half, model };
  spots([item]);
  return item;
}

// A see-through copy of a model, to show where something would go before it is bought: green where it fits, red
// where it doesn't (`tint`).
export async function ghost(src) {
  const model = typeof src === 'string' ? await unitModel(src) : src;
  const material = new THREE.MeshBasicMaterial({ color: 0x3ad16a, transparent: true, opacity: 0.45, depthWrite: false });
  const group = new THREE.Group();
  for (const p of model.parts) {
    const m = new THREE.Mesh(p.geometry, material);
    m.matrixAutoUpdate = false;
    m.matrix.copy(p.matrix);
    group.add(m);
  }
  group.userData.tint = (ok) => material.color.set(ok ? 0x3ad16a : 0xe0503a);
  return group;
}

async function furnish(group, placements) {
  const byModel = new Map();
  const items = [];
  for (const [src, x, z, turn, fit, use, lift = 0] of placements) {
    const item = await measure(src, x, z, turn, fit, use, lift);
    const { model } = item;
    delete item.model;
    items.push(item);
    if (!byModel.has(model)) byModel.set(model, []);
    byModel.get(model).push(item);
  }
  for (const [model, list] of byModel) {
    for (const part of model.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.obj.matrix.clone().multiply(part.matrix));
        // Where it is drawn, so it can be taken away again (sold: `remove`).
        (it.instances ??= []).push([mesh, i]);
      });
      const flat = list[0].use?.walkable;
      mesh.castShadow = !flat;
      mesh.receiveShadow = true;
      // A rug on the floor: pulled forward in depth, or the two fight for the same pixels.
      if (flat) Object.assign(part.material, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      mesh.userData.items = list;
      mesh.matrixAutoUpdate = false;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  spots(items);
  // A double bed (round 15): its second side, after everything placed (the page counts what it placed by position).
  for (const it of [...items]) if (it.use?.double && it.bed) items.push(twinOf(it));
  return items;
}
// The other side of a double bed: the same bed (no drawing of its own, the same footprint), a place of its own to lie
// (the far half; the first side lies on the near half), and a spot of its own to get in from, a little towards the
// foot on the same side as the first's (the far side is often against a wall). Owned and used like a bed of its own,
// so two Sims can sleep side by side; `twin` points each side at the other, `side` marks this one.
function twinOf(it) {
  const { head, feet, top, across, halfWide } = it.bed;
  const off = halfWide * 0.42;
  it.bed = { ...it.bed, feet: feet.clone().addScaledVector(across, off) };
  const twin = {
    name: it.name, obj: it.obj, use: it.use, footprint: it.footprint, half: it.half, side: true, twin: it,
    spot: it.spot.clone().addScaledVector(head, -0.6), facing: it.facing,
    bed: { head, top, across, halfWide, feet: feet.clone().addScaledVector(across, -off) }
  };
  it.twin = twin;
  return twin;
}

// Where a Sim stands to use a thing: in front of it, facing it (to sit, backed up to it, facing the way it faces).
function spots(items) {
  for (const it of items) {
    if (!it.use) continue;
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, it.obj.rotation.y);
    const gap = it.use.act === 'sit' ? 0.05 : it.use.act === 'dance' ? -it.half.z : 0.45;
    it.spot = it.obj.position.clone().setY(0).addScaledVector(fwd, it.half.z + gap);
    it.facing = it.use.act === 'sit' ? Math.atan2(fwd.x, fwd.z) : Math.atan2(-fwd.x, -fwd.z);
    // Used from inside (a shower): stand in the middle, facing out.
    if (it.use.inside) (it.spot = it.footprint.getCenter(new THREE.Vector3()).setY(0)), (it.facing = Math.atan2(fwd.x, fwd.z));
    if (it.use.act === 'sleep') {
      // Lie along the bed, head at its headboard (the back of the model: every bed's front faces +Z); get in from the
      // side facing the room. Round 15: the headboard, not the end nearer a wall (a bed out in the room had its sleeper
      // lying with their feet on the pillow).
      const b = it.footprint, back = fwd.clone().negate(), alongX = Math.abs(back.x) > Math.abs(back.z);
      const c = b.getCenter(new THREE.Vector3());
      const head = alongX ? new THREE.Vector3(Math.sign(back.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(back.z));
      const across = alongX ? new THREE.Vector3(0, 0, -Math.sign(c.z) || 1) : new THREE.Vector3(-Math.sign(c.x) || 1, 0, 0);
      const halfLong = (alongX ? b.max.x - b.min.x : b.max.z - b.min.z) / 2, halfWide = (alongX ? b.max.z - b.min.z : b.max.x - b.min.x) / 2;
      it.bed = { head, feet: c.clone().setY(0).addScaledVector(head, -halfLong + 0.32), top: b.max.y, across, halfWide };
      it.spot = c.clone().setY(0).addScaledVector(across, halfWide + 0.3);
      it.facing = Math.atan2(-across.x, -across.z);
    }
  }
}

function plane(w, d, color, y = 0, x = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  m.position.set(x, y, z);
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  return m;
}

function makeWalls(group, w, d, h = 2.6) {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1e9dc, roughness: 0.95 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 0.9 });
  const walls = [];
  for (const [x, z, len, nx, nz] of [[0, -d / 2, w, 0, -1], [0, d / 2, w, 0, 1], [-w / 2, 0, d, -1, 0], [w / 2, 0, d, 1, 0]]) {
    const geo = new THREE.BoxGeometry(nx ? 0.14 : len + 0.14, 1, nx ? len + 0.14 : 0.14).translate(0, 0.5, 0);
    const wall = new THREE.Mesh(geo, [wallMat, wallMat, capMat, wallMat, wallMat, wallMat]);
    wall.position.set(x, 0, z);
    wall.castShadow = wall.receiveShadow = true;
    wall.userData.normal = new THREE.Vector3(nx, 0, nz);
    wall.scale.y = h;
    wall.userData.full = h;
    group.add(wall);
    walls.push(wall);
  }
  return walls;
}

// A seeded random, so the park is the same park every time (and on the tablet).
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const F = (n) => `assets/furniture/${n}.glb`;
const S = (n) => `assets/scenery/${n}.glb`;
const Q = Math.PI / 2;

// ---- the starter flat (7 × 6 m) ----
// `change` (the life prototype's flat): `drop` some things by model name, `move` some ({ name: [x, z] }), `add` more.
async function home(group, change = {}) {
  const w = 7, d = 6;
  // Round 11: the life game's flat brings its own floors and garden (dressing.mjs).
  if (!change.dressed) group.add(plane(40, 40, 0x7fa36b, -0.02), plane(w, d, 0xc9a77c));
  const walls = makeWalls(group, w, d);
  const placements = [
    [F('Bed_Single'), -2.55, -1.9, 0, 0.62, { act: 'sleep', label: 'Sleep' }],
    [F('NightStand_1'), -1.55, -2.65, 0, 0.55],
    [F('Drawer_3'), -3.15, 0.1, Q, 0.8, { act: 'interact', label: 'Change clothes' }],
    [F('Bookshelf'), -0.4, -2.75, 0, 1.9, { act: 'pickup', label: 'Read a book' }],
    [F('Houseplant_6'), 0.55, -2.7, 0, 1.1],
    [F('Kitchen_Fridge'), 3.1, -2.6, 0, 1.9, { act: 'interact', label: 'Get food' }],
    [F('Kitchen_Oven'), 2.25, -2.65, 0, 0.92, { act: 'interact', label: 'Cook' }],
    [F('Kitchen_Sink'), 1.45, -2.65, 0, 0.92, { act: 'interact', label: 'Wash up' }],
    [F('Table_RoundSmall'), 1.9, -0.2, 0, 0.75],
    [F('Chair_1'), 1.9, 0.55, 2 * Q, 0.95, { act: 'sit', label: 'Eat' }],
    [F('Couch_Medium1'), -1.6, 1.9, 2 * Q, 0.85, { act: 'sit', label: 'Watch TV' }],
    [F('Carpet_Round'), -0.6, 0.3, 0, { width: 2.2 }, { act: 'dance', label: 'Dance', walkable: true }],
    [F('Light_Floor1'), -2.9, 2.5, 0, 1.6],
    [F('Houseplant_3'), 3.1, 2.5, 0, 0.9],
    [F('Bathroom_Toilet'), 3.05, 1.35, 3 * Q, 0.8],
    [F('Bathroom_Sink'), 3.15, 0.5, 3 * Q, 0.9, { act: 'interact', label: 'Wash hands' }]
  ];
  const named = (p) => p[0].split('/').pop().replace('.glb', '');
  const items = await furnish(group, [
    // Round 14: `none` — the flat with nothing in it but what `add` brings (the page furnishes it: shop.mjs FLAT_FURNITURE).
    ...(change.none ? [] : placements.filter((p) => !change.drop?.includes(named(p))).map((p) => (change.move?.[named(p)] ? [p[0], ...change.move[named(p)], ...p.slice(3)] : p))),
    ...(change.add ?? [])
  ]);
  return { w, d, walls, items, cell: 0.25, view: { target: [0, 0.7, 0], camera: [7.5, 7.5, 9], max: 18, fog: [24, 60] }, starts: [[0, 1], [-0.6, -0.6], [1.0, 1.6], [-1.6, 0.4], [0.4, -1.4], [2.6, 1.0]] };
}

// ---- the life prototype's flat (public/life/): the starter flat with a shower and a TV; the rug out of the TV's way.
// The shower is walked into (`inside`), so it is `walkable` (its tray does not block the walk grid).
// Two beds for two flatmates (round 7): the second along the left wall where the chest of drawers was (the game has no
// use for it yet), its head towards the couch end; the TV a little to the right to leave its side free to get in.
// Round 10: the fridge and the TV are the made ones above (a door that opens, a flat screen that plays), and the shower
// has a head that water comes out of (`moving`: buildPlace).
// Round 11: dressed (dressing.mjs): boards and tiles, windows, pictures, a clock, kitchen cupboards, a garden and a street.
// Round 14: `{ empty: true }` — only the front door: what stands in it is the household's furniture, which the page
// places (shop.mjs FLAT_FURNITURE, in the same places as here), so any of it can be moved, sold or put away.
const DOOR = (x, z) => [F('Door_1'), x, z, Q, 2.05, { act: 'door', label: 'Front door' }];
async function lifeHome(group, options = {}) {
  if (options.empty) {
    const p = await home(group, { dressed: true, none: true, add: [DOOR(-3.4, 1.45)] });
    p.fade = await dressHome(group, p.walls, furnish, S);
    return p;
  }
  const p = await home(group, {
    dressed: true,
    drop: ['Houseplant_3', 'Bathroom_Toilet', 'Drawer_3', 'Kitchen_Fridge'],
    move: { Carpet_Round: [0.35, 1.55] },
    add: [
      [FRIDGE, 3.1, -2.62, 0, 1.9, { act: 'interact', label: 'Get food', offers: 'Kitchen_Fridge', moving: 'fridge' }],
      [F('Bathroom_Toilet'), 3.05, 1.35, 3 * Q, 0.8, { act: 'sit', label: 'Use the loo' }],
      [F('Bathroom_Shower1'), 2.95, 2.45, 3 * Q, 2.0, { act: 'interact', label: 'Shower', inside: true, walkable: true, offers: 'Bathroom_Shower1', moving: 'shower' }],
      [TV, -1.35, -0.25, 0, 1.28, { moving: 'tv' }],
      [F('Bed_Single'), -2.55, 0.35, 2 * Q, 0.62, { act: 'sleep', label: 'Sleep' }],
      // The front door (round 8): in the left wall between the second bed and the lamp. A Sim with a job walks to
      // it and is out of the flat until the work day ends.
      [F('Door_1'), -3.4, 1.45, Q, 2.05, { act: 'door', label: 'Front door' }]
    ]
  });
  p.fade = await dressHome(group, p.walls, furnish, S);
  return p;
}

// ---- a park (36 × 28 m walkable) with buildings around it ----
async function park(group, life = false) {
  const w = 36, d = 28;
  const r = rng(7);
  // Round 11: the life game's park is dressed (grass, gravel, paving; the pond's water, stones and ducks come with the
  // stump you feed them from: `moving: 'ducks'`).
  if (life) dressPark(group);
  else {
    group.add(plane(90, 80, 0x79a35f, -0.02), plane(w, 2.4, 0xcdb894, 0.004), plane(2.4, d, 0xcdb894, 0.004));
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(4.5, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.9 }));
    plaza.position.y = 0.006;
    const pond = new THREE.Mesh(new THREE.CircleGeometry(3.6, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4f86b5, roughness: 0.2, metalness: 0.1 }));
    pond.position.set(-10, 0.008, -7);
    for (const m of [plaza, pond]) (m.receiveShadow = true), (m.matrixAutoUpdate = false), m.updateMatrix(), group.add(m);
  }

  const P = [];
  const clear = (x, z, pad) => Math.abs(x) > 1.2 + pad && Math.abs(z) > 1.2 + pad && Math.hypot(x, z) > 4.5 + pad && Math.hypot(x + 10, z + 7) > 3.6 + pad && Math.abs(x) < w / 2 - 0.6 && Math.abs(z) < d / 2 - 0.6;
  const scatter = (models, n, hMin, hMax, pad, use) => {
    for (let placed = 0, tries = 0; placed < n && tries < n * 40; tries++) {
      const x = (r() - 0.5) * w, z = (r() - 0.5) * d;
      if (!clear(x, z, pad) || P.some((p) => Math.hypot(p[1] - x, p[2] - z) < pad + 0.4)) continue;
      P.push([S(models[Math.floor(r() * models.length)]), x, z, r() * Math.PI * 2, hMin + r() * (hMax - hMin), use]);
      placed++;
    }
  };
  // Willows round the pond, lily pads on it.
  for (let i = 0; i < 4; i++) P.push([S('Willow_1'), -10 + Math.cos(i * 1.7 + 0.4) * 5.2, -7 + Math.sin(i * 1.7 + 0.4) * 5.2, r() * 6, 5.5]);
  for (let i = 0; i < 7; i++) P.push([S('Lilypad'), -10 + Math.cos(i * 0.9) * (1 + r() * 2), -7 + Math.sin(i * 0.9) * (1 + r() * 2), r() * 6, { width: 0.6 }, { walkable: true }]);
  // Benches facing the paths, lamps beside them.
  for (const [x, z, turn] of [[-6, 2, Math.PI], [-12, 2, Math.PI], [6, -2, 0], [12, -2, 0], [2, 7, -Q], [-2, -8, Q], [2, -11, -Q], [-2, 11, Q], [3.3, 3.3, -Q * 1.5], [-3.3, -3.3, Q * 0.5]])
    P.push([BENCH, x, z, turn, 0.88, { act: 'sit', label: 'Sit on the bench', offers: 'bench' }]);
  const LAMPS = [[-9, 1.8], [9, -1.8], [1.8, 9], [-1.8, -9], [-16, 1.8], [16, -1.8], [1.8, -12.5], [-1.8, 12.5], [4.2, 1.8], [-4.2, -1.8]];
  for (const [x, z] of LAMPS) P.push([S('Streetlight_Single'), x, z, 0, 3.6]);
  if (life) lampGlow(group, LAMPS.map(([x, z]) => [x, 3.25, z]));
  // Feed the ducks: a spot on the pond's edge (a stump to stand by).
  P.push([S('TreeStump'), -6.2, -7, 0, 0.35, { act: 'interact', label: 'Feed the ducks', offers: 'ducks', ...(life && { moving: 'ducks', pond: [-10, -7, 3.6] }) }]);
  // The dance floor: the plaza's centre.
  P.push([F('Carpet_Round'), 0, 0, 0, { width: 3 }, { act: 'dance', label: 'Dance', walkable: true, offers: 'parkDance' }]);
  // The life game's way in and out (round 9): a bus stop on the east path, clear of the town's buildings.
  if (life) P.push([BUS_STOP, 9.5, -1.7, -Q, 2.45, { act: 'door', label: 'Bus stop', offers: 'busStop' }]);
  // Scattered last, clear of everything placed above.
  scatter(['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'BirchTree_1', 'BirchTree_2', 'PineTree_1'], 34, 4.5, 7.5, 1.2);
  scatter(['Bush_1', 'Bush_2', 'BushBerries_1'], 30, 0.7, 1.2, 0.6);
  scatter(['Rock_1', 'Rock_Moss_2', 'TreeStump'], 14, 0.3, 0.7, 0.5);
  scatter(['Plant_3'], 14, 0.4, 0.7, 0.4);
  scatter(['Grass'], 40, 0.25, 0.4, 0.2, { walkable: true });
  scatter(['Flowers'], 16, 0.35, 0.5, 0.5, { act: 'interact', label: 'Smell the flowers', offers: 'flowers' });
  // The town around it, outside the walkable square.
  const B = ['2Story_Mat', '3Story_Balcony_Mat', '4Story_Mat', '2Story_Wide_Mat', '3Story_Slim_Mat', '2Story_Columns_Mat'];
  for (let i = 0; i < 6; i++) P.push([S(B[i]), -15 + i * 6.5, -d / 2 - 6, 0, 7 + (i % 3) * 2.5]);
  for (let i = 0; i < 4; i++) P.push([S(B[(i + 2) % 6]), -w / 2 - 6, -8 + i * 6.5, Q, 7 + (i % 2) * 3]);
  for (let i = 0; i < 4; i++) P.push([S(B[(i + 4) % 6]), w / 2 + 6, -8 + i * 6.5, -Q, 7 + ((i + 1) % 3) * 2.5]);
  const items = await furnish(group, P);
  items.push({ name: 'pond', footprint: new THREE.Box3(new THREE.Vector3(-13.6, 0, -10.6), new THREE.Vector3(-6.4, 0.1, -3.4)) });
  // The life game looks closer (round 9: from round 2's whole-park view the trees hid a couple on a date).
  return { w, d, walls: [], items, cell: 0.5, view: life ? { target: [0, 0.5, 2], camera: [6, 10.5, 10], max: 30, fog: [34, 95] } : { target: [0, 0.5, 2], camera: [15, 14, 20], max: 48 }, starts: [], shadow: life ? 10 : 14 };
}

// ---- an open-plan office (22 × 14 m) ----
async function office(group) {
  const w = 22, d = 14;
  group.add(plane(60, 60, 0x9aa38f, -0.02), plane(w, d, 0x6f7f8f));
  const walls = makeWalls(group, w, d, 3);
  const P = [];
  for (const z of [-3.6, -0.4, 2.8])
    for (const x of [-8.5, -5.5, -2.5, 0.5]) {
      P.push([DESK, x, z, 0, 0.75]);
      P.push([MONITOR, x - 0.15, z - 0.12, 0, 0.47, null, 0.75]);
      P.push([F('Light_Desk'), x + 0.5, z - 0.15, 0, 0.45, null, 0.75]);
      P.push([F('Chair_1'), x, z + 0.75, 2 * Q, 0.95, { act: 'sit', label: 'Work' }]);
      P.push([F('Trashcan_Small1'), x + 0.62, z + 0.35, 0, 0.35]);
    }
  // A meeting corner, a lounge with a TV, a kitchen strip.
  for (const [tx, tz] of [[5.5, -3.8], [5.5, 0.6]]) {
    P.push([F('Table_RoundSmall'), tx, tz, 0, 0.75]);
    for (let k = 0; k < 4; k++) {
      const a = k * Q;
      P.push([F('Chair_1'), tx + Math.sin(a) * 0.95, tz + Math.cos(a) * 0.95, a + Math.PI, 0.95, { act: 'sit', label: 'Meeting' }]);
    }
  }
  P.push([F('Couch_Large1'), 8.6, 4.4, Math.PI, 0.85, { act: 'sit', label: 'Relax' }], [F('Couch_Medium1'), 6.0, 4.6, Math.PI, 0.85, { act: 'sit', label: 'Relax' }]);
  P.push([S('TV_1'), 7.4, 6.5, Math.PI, { width: 1.4 }], [F('Carpet_Round'), 7.4, 5.3, 0, { width: 3 }, { walkable: true }]);
  P.push([F('Kitchen_Fridge'), 10.4, -5.0, -Q, 1.9, { act: 'interact', label: 'Get a snack' }], [F('Kitchen_Sink'), 10.5, -3.9, -Q, 0.92, { act: 'interact', label: 'Make coffee' }]);
  P.push([F('Kitchen_2Drawers'), 10.5, -3.1, -Q, 0.92], [F('Kitchen_Oven'), 10.5, -2.3, -Q, 0.92, { act: 'interact', label: 'Heat lunch' }]);
  for (const x of [-10, -8.6, -7.2]) P.push([F('Bookshelf'), x, -6.7, 0, 1.9, { act: 'pickup', label: 'Find a file' }]);
  for (const z of [-4.5, -2.5]) P.push([F('Shelf_Large'), -10.6, z, Q, 1.8]);
  for (const x of [-5.5, -3]) P.push([F('Drawer_3'), x, -6.7, 0, 1.0, { act: 'interact', label: 'File papers' }]);
  for (const [x, z, n] of [[-10.4, 6.4, 'Houseplant_1'], [-1.5, 6.4, 'Houseplant_4'], [3.6, 6.4, 'Houseplant_6'], [10.4, 6.4, 'Houseplant_3'], [-10.4, 1.5, 'Houseplant_4'], [10.4, 1.8, 'Houseplant_1'], [3.6, -6.4, 'Houseplant_6'], [-0.5, -6.4, 'Houseplant_3'], [-10.4, -6.4, 'Houseplant_1'], [10.4, -6.4, 'Houseplant_4']])
    P.push([F(n), x, z, 0, 1.2]);
  for (const [x, z] of [[-10.3, 4], [3.6, 2.8], [10.3, 6.4], [3.6, -2]]) P.push([F('Light_Floor1'), x, z, 0, 1.7]);
  const items = await furnish(group, P);
  return { w, d, walls, items, cell: 0.25, view: { target: [0, 0.6, 0], camera: [12, 12, 15], max: 32 }, starts: [] };
}

// ---- the life game's office (round 9, 16 × 12 m): where a Sim with a job goes, and you follow them ----
// The brief, 10-29: "something like Among Us where there are job stations and you go round doing the different jobs. Maybe
// that's how you pick maths or geography etc, by choosing the associated work station?" Six stations, one a subject, each
// with a sign over it; a desk each for six people (a Sim's own work when nothing else is on); a kitchen corner and a
// couch. `offers` names the thing's offers in actions.mjs (the same chair offers different things at home and here).
export const STATIONS = [
  { id: 'maths', icon: '🔢', colour: '#2b6cc4' },
  { id: 'science', icon: '🔬', colour: '#2f9e5b' },
  { id: 'geography', icon: '🌍', colour: '#1f8a8a' },
  { id: 'french', icon: '📝', colour: '#7a4cc4' },
  { id: 'english', icon: '☎️', colour: '#c8202a' },
  { id: 'history', icon: '🏺', colour: '#a8682a' }
];
async function lifeOffice(group, { labels = {} } = {}) {
  const w = 16, d = 12;
  const walls = makeWalls(group, w, d);
  const st = (id) => ({ act: 'interact', label: labels[id] ?? id, offers: 'station', station: id });
  const P = [
    [F('Door_1'), -7.9, 3.6, Q, 2.05, { act: 'door', label: 'Way out', offers: 'officeDoor' }],
    // The stations: four along the back wall, two on the right.
    [DESK, -5.6, -5.45, 0, 0.75, st('maths')],
    [MONITOR, -5.95, -5.6, 0.15, 0.47, null, 0.75],
    [MONITOR, -5.25, -5.6, -0.15, 0.47, null, 0.75],
    [LAB_BENCH, -2.4, -5.5, 0, 1.2, st('science')],
    [GLOBE, 0.8, -5.4, 0, 1.41, st('geography')],
    [F('Bookshelf'), 4.2, -5.75, 0, 1.9, st('history')],
    [F('Bookshelf'), 5.4, -5.75, 0, 1.9],
    [LETTERS, 7.45, -2.8, -Q, 0.85, st('french')],
    [F('Light_Desk'), 7.6, -3.3, -Q, 0.45, null, 0.73],
    [PHONE_BOX, 7.4, 0.6, -Q, 2.42, st('english')],
    // The kitchen corner and a couch to rest on.
    [FRIDGE, 7.4, 4.9, -Q, 1.9, { act: 'interact', label: 'Get a snack', offers: 'officeFridge', moving: 'fridge' }],
    [F('Kitchen_Sink'), 7.45, 3.95, -Q, 0.92, { act: 'interact', label: 'Hot chocolate', offers: 'officeSink' }],
    [F('Kitchen_2Drawers'), 7.45, 3.15, -Q, 0.92],
    [F('Couch_Medium1'), 2.6, 5.35, Math.PI, 0.85, { act: 'sit', label: 'Have a rest', offers: 'officeCouch' }],
    [F('Carpet_Round'), 2.6, 4.0, 0, { width: 2.2 }, { walkable: true }],
    [F('Houseplant_1'), -7.4, -5.4, 0, 1.2], [F('Houseplant_4'), 6.6, -5.5, 0, 1.2], [F('Houseplant_6'), -7.4, 5.4, 0, 1.2], [F('Houseplant_3'), 0.6, 5.5, 0, 0.9],
    [F('Light_Floor1'), 4.4, 5.5, 0, 1.7], [F('Trashcan_Small1'), 7.5, 2.4, 0, 0.35]
  ];
  // A desk each: two rows of three, the chair on the near side. The game hands them out (page.mjs).
  for (const z of [-1.6, 1.8])
    for (const x of [-4.6, -1.8, 1.0]) {
      P.push([DESK, x, z, 0, 0.75]);
      P.push([MONITOR, x - 0.15, z - 0.12, 0, 0.47, null, 0.75]);
      P.push([F('Chair_1'), x, z + 0.75, 2 * Q, 0.95, { act: 'sit', label: 'Work at the desk', offers: 'desk' }]);
    }
  const items = await furnish(group, P);
  // Round 11: carpet tiles, windows on the city, a whiteboard, a clock, posters, the street outside (dressing.mjs).
  const fade = await dressOffice(group, walls, furnish, S);
  // The signs, over each station.
  for (const it of items) {
    const s = STATIONS.find((x) => x.id === it.use?.station);
    if (!s || typeof document === 'undefined') continue;
    const sp = sign(labels[s.id] ?? s.id, s.icon, s.colour);
    sp.position.set(it.obj.position.x, 2.75, it.obj.position.z);
    sp.userData.station = s.id;
    group.add(sp);
    it.sign = sp;
  }
  return { w, d, walls, items, cell: 0.25, view: { target: [0, 0.6, 0.5], camera: [9, 10, 13], max: 26, fog: [30, 80] }, starts: [], shadow: 10, fade };
}

// ---- the café (round 16, phase 5.3; work.mjs CAREERS.cafe, 10 × 8 m) ----
// Where the café chef works: built the first time someone has the job (page.mjs). Four stations (the till, the oven,
// the menu board, the spice shelf: a school subject each, as at the office, with the café's own names: `labels`), the
// tables to serve between questions (what free will does there, as at a desk), a fridge and a sink for a snack and a
// hot chocolate. The kitchen along the back.
const chalk = mat5(0x2e3a34, 0.95);
// The till on its counter: a box, a little screen, a drawer.
const TILL = madeModel(merged([
  box(1.5, 0.95, 0.6, 0, 0.475, 0, wood), box(1.56, 0.05, 0.66, 0, 0.975, 0, deskTop),
  box(0.36, 0.16, 0.3, 0.3, 1.08, -0.05, metal), box(0.26, 0.16, 0.02, 0.3, 1.22, -0.12, screen), box(0.3, 0.05, 0.24, 0.3, 1.025, 0.12, steel),
  box(0.2, 0.2, 0.2, -0.45, 1.1, 0, glassMat(0xf2d8a0))
]), 1.3);
// A chalk menu board on legs (the day's specials, written for the tourists).
const MENU_BOARD = madeModel(merged([
  box(0.05, 1.5, 0.05, -0.45, 0.75, -0.08, wood), box(0.05, 1.5, 0.05, 0.45, 0.75, -0.08, wood),
  box(0.95, 0.75, 0.04, 0, 1.05, 0, wood), box(0.85, 0.65, 0.01, 0, 1.05, 0.025, chalk),
  ...[1.25, 1.12, 0.99, 0.86].map((y, k) => box(0.5 - (k % 2) * 0.15, 0.02, 0.005, -0.1, y, 0.032, canvasWhite))
]), 1.5);
async function lifeCafe(group, { labels = {} } = {}) {
  const w = 10, d = 8;
  const walls = makeWalls(group, w, d);
  const st = (id) => ({ act: 'interact', label: labels[id] ?? id, offers: 'station', station: id });
  const serve = { act: 'interact', label: 'Serve', offers: 'cafeTable' };
  const P = [
    [F('Door_1'), -4.9, 2.4, Q, 2.05, { act: 'door', label: 'Way out', offers: 'officeDoor' }],
    // The kitchen along the back: fridge, oven (science), sink, drawers; the spice shelf (geography) at the end.
    [FRIDGE, -4.3, -3.5, 0, 1.9, { act: 'interact', label: 'Get a snack', offers: 'officeFridge', moving: 'fridge' }],
    [F('Kitchen_2Drawers'), -3.45, -3.55, 0, 0.92],
    [F('Kitchen_Oven_Large'), -2.4, -3.55, 0, 0.92, st('science')],
    [F('Kitchen_3Drawers'), -1.35, -3.55, 0, 0.92],
    [F('Kitchen_Sink'), -0.45, -3.55, 0, 0.92, { act: 'interact', label: 'Hot chocolate', offers: 'officeSink' }],
    [F('Shelf_Large'), 1.2, -3.6, 0, 1.8, st('geography')],
    // The till (maths) and the menu board (English) by the door.
    [TILL, -2.6, 0.2, 0, 1.3, st('maths')],
    [MENU_BOARD, -4.2, -0.6, Q, 1.5, st('english')],
    // The tables: three, two chairs each (only looked at), and served.
    ...[[1.2, 0.2], [3.4, -1.4], [3.2, 2.0]].flatMap(([x, z]) => [
      [F('Table_RoundSmall'), x, z, 0, 0.75, serve],
      [F('Chair_1'), x - 0.75, z, Q, 0.95], [F('Chair_1'), x + 0.75, z, -Q, 0.95]
    ]),
    [F('Houseplant_4'), 4.5, -3.5, 0, 1.2], [F('Houseplant_6'), 4.5, 3.4, 0, 1.2], [F('Light_Floor1'), -4.4, 3.4, 0, 1.7], [F('Trashcan_Small1'), -0.2, 3.6, 0, 0.35]
  ];
  const items = await furnish(group, P);
  const fade = await dressCafe(group, walls, furnish, S, { w, d });
  for (const it of items) {
    const s = STATIONS.find((x) => x.id === it.use?.station);
    if (!s || typeof document === 'undefined') continue;
    const sp = sign(labels[s.id] ?? s.id, s.icon, s.colour);
    sp.position.set(it.obj.position.x, 2.55, it.obj.position.z);
    sp.userData.station = s.id;
    group.add(sp);
    it.sign = sp;
  }
  return { w, d, walls, items, cell: 0.25, view: { target: [0, 0.6, 0.3], camera: [6, 8.5, 10], max: 20, fog: [30, 80] }, starts: [], shadow: 7, fade };
}

// ---- the life game's park: round 2's park, with a bus stop to come and go by, and things to do on a date ----
async function lifePark(group) {
  const p = await park(group, true);
  return p;
}

// ---- a house in the town (round 14) ----
// The design brief, 2026-11-11: "multiple houses available in the town with real NPCs … a select number of free houses
// the player can visit with the intention to buy". Any size (town.mjs SIZES); the front door on the left wall, d/2 − 1.55
// towards the front (the flat's is at 1.45 of 3). `spec`:
//   w, d        the floor, in metres
//   furniture   what stands in it: shop things ({ id, x, z, turn }, shop.mjs). A neighbour's house: houseFurniture().
//               A house for sale: nothing. The household's own home: nothing here; the page places their furniture.
//   look        dressing.mjs dressHouse: { feature, floor, curtains }; forSale: a sign by the path
async function lifeHouse(group, spec) {
  const { w, d } = spec;
  const walls = makeWalls(group, w, d);
  const items = await furnish(group, [DOOR(-w / 2 + 0.1, d / 2 - 1.55), ...(spec.furniture ?? []).map(placementOf)]);
  const fade = await dressHouse(group, walls, furnish, S, spec);
  const k = Math.max(w / 7, d / 6);
  return {
    w, d, walls, items, fade, cell: 0.25, shadow: Math.max(w, d) / 2 + 1.5, starts: [],
    view: { target: [0, 0.7, 0], camera: [7.5 * k, 7.5 * Math.min(k, 1.35), 9 * k], max: 18 * k, fog: [24 * k, 60 * k] }
  };
}
// ---- Sunny Lane (round 15): the street, a place to walk down ----
// The brief's round-14 list: "The street to walk down instead of the town card (a fifth place: the houses' fronts, the
// bus)". Each house's front door (Door_1 in its front wall, facing the street: `use.front` is the house's id, or 'flat'),
// low hedges between the front gardens (so the way from one door to the next is out along the pavement), lamps across
// the road, and the bus stop to the park. Which door goes where is the page's (`doorTo`, `doorFor`): it knows whose
// home is whose. `spec`: { w, d, fronts } (town.mjs STREET_SIZE and streetLayout()).
async function lifeStreet(group, { w, d, fronts, name }) {
  const z0 = -d / 2, P = [];
  for (const [k, f] of fronts.entries()) {
    P.push([F('Door_1'), f.x - f.width / 2 + 1.3, z0 + 0.06, 0, 2.05, { act: 'door', label: `No. ${f.no}`, offers: 'streetDoor', front: f.id }]);
    // A hedge between this garden and the next.
    const next = fronts[k + 1];
    if (next) for (const z of [z0 + 0.4, z0 + 1.3]) P.push([S('Bush_2'), (f.x + f.width / 2 + next.x - next.width / 2) / 2, z, k + z, 0.95]);
  }
  const lamps = [];
  for (let x = -w / 2 + 6; x < w / 2 - 2; x += 12) if (Math.abs(x - (fronts[0].x + fronts[fronts.length - 1].x) / 2) > 2) lamps.push([x, z0 + 12.1]);
  for (const [x, z] of lamps) P.push([S('Streetlight_Single'), x, z, Math.PI, 3.8]);
  lampGlow(group, lamps.map(([x, z]) => [x, 3.45, z]));
  // The bus stop on the far pavement, halfway along (no Sim walks the whole street to catch the bus), facing the road.
  const mid = (fronts[0].x + fronts[fronts.length - 1].x) / 2;
  P.push([BUS_STOP, mid, z0 + 11.4, Math.PI, 2.45, { act: 'door', label: 'Bus stop', offers: 'streetBus' }]);
  // Round 16, phase 4.2: the notice board beside it, facing the houses, with a name board over it (the page's).
  P.push([NOTICE_BOARD, mid + 3.2, z0 + 11.2, Math.PI, 2.06, { act: 'look', label: 'Notice board', offers: 'streetBoard', board: true }]);
  const items = await furnish(group, P);
  const dressed = await dressStreet(group, furnish, S, { w, d, fronts, name });
  const boardLabel = typeof document === 'undefined' ? null : streetLabel();
  if (boardLabel) {
    boardLabel.sprite.position.set(mid + 3.2, 3.0, z0 + 11.2);
    boardLabel.sprite.scale.multiplyScalar(0.7);
    boardLabel.sprite.userData.board = true;
    group.add(boardLabel.sprite);
  }
  return {
    w, d, walls: [], items, cell: 0.5, starts: [], shadow: 12, fade: dressed.fade, street: { fronts, labels: dressed.labels, balloons: dressed.balloons, signs: dressed.signs, hits: [...dressed.hits, ...(boardLabel ? [boardLabel.sprite] : [])], board: boardLabel },
    view: { target: [0, 3, -4], camera: [5, 13.5, 22], max: 34, fog: [44, 120] }
  };
}
// A shop thing ({ id, x, z, turn, width? }, as saved) as `furnish` places it.
export function placementOf(e) {
  const s = kindOf(e.id);
  return [s.made ? MADE[s.made] : F(s.model), e.x, e.z, e.turn ?? 0, e.width ? { width: e.width } : s.fit, s.use ? { ...s.use } : undefined];
}
// What a neighbour's house has in it (round 14), for its size and how many live there (1 or 2): as the flat is laid
// out, against the same walls. Beds and a bookshelf at the back on the left, the kitchen at the back on the right, a
// table and chairs in front of it, the bathroom at the front on the right, a sofa facing the TV at the front on the
// left, a rug to dance on, a lamp and plants; a bigger house a fireplace and an armchair too. `seed` varies the plants.
export function houseFurniture(w, d, n = 1, seed = 1) {
  const L = -w / 2, R = w / 2, B = -d / 2, Fr = d / 2;
  const r = rng(seed);
  const plant = () => ['plant', 'tallPlant', 'bushyPlant', 'flowerPot'][Math.floor(r() * 4)];
  const out = [
    ['bed', L + 0.95, B + 1.1, 0], ['nightstand', L + 1.95, B + 0.42, 0],
    ...(n > 1 ? [['bed', L + 2.95, B + 1.1, 0], ['bookshelf', L + 4.15, B + 0.25, 0]] : [['bookshelf', L + 2.75, B + 0.25, 0]]),
    ['fridge', R - 0.45, B + 0.45, 0], ['oven', R - 1.3, B + 0.42, 0], ['kitchenSink', R - 2.1, B + 0.42, 0], ['cupboard', R - 2.8, B + 0.42, 0],
    // The chairs tucked under the table's edge, as the flat's is (a round table 1.3 m across).
    ['table', R - 2.6, B + 2.6, 0], ['chair', R - 2.6, B + 3.35, 2 * Q], ['chair2', R - 2.6, B + 1.85, 0],
    ['toilet', R - 0.45, Fr - 1.65, 3 * Q], ['shower', R - 0.62, Fr - 0.62, 3 * Q], ['basin', R - 0.35, Fr - 2.55, 3 * Q],
    ['couch', L + 2.6, Fr - 0.6, 2 * Q], ['tv', L + 2.6, Fr - 3.0, 0], ['rug', 0.6, Fr - 2.1, 0],
    ['lamp', L + 0.45, Fr - 0.4, 0], [plant(), R - 3.6, B + 0.5, 0], [plant(), L + 4.2, Fr - 0.5, 0]
  ];
  if (w >= 13) out.push(['fireplace', 0.6, B + 0.32, 0], ['smallCouch', 0.6, B + 1.7, 0], [plant(), -0.6, B + 0.5, 0]);
  return out.map(([id, x, z, turn]) => ({ id, x, z, turn }));
}

export const PLACES = { home, park, office, lifeHome, lifeOffice, lifeCafe, lifePark, lifeHouse, lifeStreet };

// Builds a place into its own group (call once; switching places adds/removes the group).
export async function buildPlace(name, options) {
  const group = new THREE.Group();
  group.name = name;
  const p = await PLACES[name](group, options);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  floor.name = 'floor';
  floor.position.y = 0.01;
  floor.updateMatrix();
  floor.matrixAutoUpdate = false;
  group.add(floor);
  const grid = makeGrid(p.items, p.w, p.d, p.cell);
  // Trees that may stand between the camera and the Sims (round 11): the park's, and the garden's round the flat.
  const fade = [...(p.fade ?? []), ...p.items.filter((i) => /Tree|Willow/.test(i.name) && i.instances)];
  const look = new THREE.Vector3();
  const moving = [];
  const addMoving = (items) => {
    for (const it of items) if (it.use?.moving && typeof document !== 'undefined') moving.push(movingPart(group, it));
  };
  addMoving(p.items);
  return {
    name, group, floor, grid, walls: p.walls, items: p.items.filter((i) => i.obj), view: p.view, bounds: { w: p.w, d: p.d }, starts: p.starts,
    clickable: group.children.filter((c) => c.isInstancedMesh && c.userData.items?.some((i) => i.use?.act || i.use?.decor)),
    door: p.items.find((i) => i.use?.act === 'door') ?? null,
    // Round 15: the street's fronts, name boards and party balloons (dressing.mjs dressStreet).
    street: p.street ?? null,
    shadow: p.shadow ?? 6,
    // The parts that move (round 10): { item, kind: 'fridge' | 'tv' | 'shower', update(dt, on) }. The page says when each
    // is on (the door open, the picture playing, the water running).
    moving,
    // Something new in a place already built (round 9: a camp bed for someone who moves in; round 10: what is bought):
    // drawn, usable, walked round.
    async add(placements) {
      const items = await furnish(group, placements);
      p.items.push(...items);
      this.items.push(...items);
      for (const it of items) grid.block(it);
      addMoving(items);
      this.clickable = group.children.filter((c) => c.isInstancedMesh && c.userData.items?.some((i) => (i.use?.act || i.use?.decor) && !i.gone));
      return items;
    },
    // Takes one thing away (sold, or a camp bed folded away): no longer drawn, used or walked round.
    remove(item) {
      for (const [mesh, i] of item.instances ?? []) {
        mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
        mesh.instanceMatrix.needsUpdate = true;
      }
      item.gone = true;
      // A double bed's other side goes too (round 15).
      if (item.twin) item.twin.gone = true;
      for (const it of [item, item.twin]) for (const list of [p.items, this.items]) if (it && list.includes(it)) list.splice(list.indexOf(it), 1);
      // Round 14: its moving part too (a TV sold kept playing in the air; a shower moved left its water behind).
      for (const m of moving.filter((m) => m.item === item)) {
        for (const o of m.parts ?? []) o.removeFromParent();
        moving.splice(moving.indexOf(m), 1);
      }
      grid.rebuild(p.items);
      this.clickable = group.children.filter((c) => c.isInstancedMesh && c.userData.items?.some((i) => (i.use?.act || i.use?.decor) && !i.gone));
    },
    // Would `item` (from `measure`) fit here? Inside the walls, on free floor (a little room round it), its own spot free,
    // and every spot a Sim uses (and the way in) still reachable from the door with it there. `except`: things to
    // leave out (the camp bed a new bed replaces).
    fits(item, except = []) {
      // A double bed's other side goes with it (moving the bed, it is not in its own way).
      except = [...except, ...except.map((i) => i?.twin).filter(Boolean)];
      const others = p.items.filter((i) => !except.includes(i) && !i.gone);
      const users = others.filter((i) => i.spot && i.use?.act && !i.use.walkable && i.use.act !== 'door');
      if (item.spot && item.use?.act) users.push(item);
      const r = grid.fits(item, users.map((i) => i.spot), this.door?.spot ?? null, except);
      // Which thing it would cut off (for the page, and for a test to name).
      if (r.which != null) r.what = users[r.which];
      return r;
    },
    // Drop the walls the camera looks through; move aside the trees it looks through (round 11).
    update(camera, target) {
      if (target) fadeTrees(fade, camera, target);
      if (!p.walls.length) return;
      camera.getWorldDirection(look);
      look.y = 0;
      look.normalize();
      for (const wall of p.walls) {
        const target = wall.userData.normal.dot(look) < -0.25 ? 0.18 : wall.userData.full;
        wall.scale.y += (target - wall.scale.y) * 0.25;
        // What hangs on it (round 11: windows, pictures, cupboards) goes with it.
        const up = wall.scale.y > wall.userData.full * 0.8;
        for (const o of wall.userData.decor ?? []) o.visible = up;
        wall.userData.onScale?.(wall.scale.y);
      }
    },
    // A free spot to start a Sim on.
    freeSpot(i) {
      const s = p.starts[i];
      if (s) return new THREE.Vector3(s[0], 0, s[1]);
      const r = rng(100 + i);
      for (let k = 0; k < 200; k++) {
        const v = new THREE.Vector3((r() - 0.5) * (p.w - 2), 0, (r() - 0.5) * (p.d - 2));
        if (grid.free(v)) return v;
      }
      return new THREE.Vector3();
    }
  };
}

// The Sims' way with trees in the way (round 11): a tree whose trunk is near the line from the camera to what it looks
// at, and tall enough to reach that line, is taken out of the picture until the camera moves on. Its instances are
// zeroed and put back from the matrices they had.
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const seg = new THREE.Vector3(), rel = new THREE.Vector3(), ndc = new THREE.Vector3();
function fadeTrees(trees, camera, target) {
  if (!trees.length) return;
  const eye = camera.position, far = eye.distanceTo(target);
  camera.updateMatrixWorld();
  seg.subVectors(target, eye);
  const len2 = seg.x * seg.x + seg.z * seg.z;
  for (const t of trees) {
    const c = t.obj.position;
    rel.subVectors(c, eye);
    // The nearest point of the line (in plan) to the trunk, from the camera's end (0) to the target's (1).
    const k = THREE.MathUtils.clamp((rel.x * seg.x + rel.z * seg.z) / (len2 || 1), 0, 1.15);
    const dx = rel.x - seg.x * k, dz = rel.z - seg.z * k;
    const crown = Math.max(t.half.x, t.half.z) * 0.85 + 0.4;
    const yThere = eye.y + seg.y * Math.min(k, 1);
    // Near the camera the line runs high, but a crown there still fills the bottom of the picture: allow for it.
    let hide = Math.hypot(dx, dz) < crown && yThere < t.footprint.max.y + 0.3;
    // Or its crown fills the middle of the picture, nearer than what the camera looks at.
    if (!hide && eye.distanceTo(c) < far + 1) {
      ndc.set(c.x, t.footprint.max.y * 0.6, c.z).project(camera);
      hide = Math.abs(ndc.x) < 0.6 && ndc.y < 0.6 && ndc.y > -1.3 && ndc.z < 1;
    }
    if (hide === !!t.faded) continue;
    t.faded = hide;
    t.saved ??= t.instances.map(([mesh, i]) => mesh.getMatrixAt(i, new THREE.Matrix4()));
    t.instances.forEach(([mesh, i], j) => {
      mesh.setMatrixAt(i, hide ? ZERO : t.saved[j]);
      mesh.instanceMatrix.needsUpdate = true;
    });
  }
}

// A part that moves (round 10), drawn beside its thing in the place's group: the fridge's door on its hinge, the TV's
// picture, the shower's water. `update(dt, on)` eases the door open or shut, plays the picture, runs the water.
function movingPart(group, it) {
  const holder = new THREE.Group();
  holder.matrixAutoUpdate = false;
  holder.matrix.copy(it.obj.matrix);
  holder.matrixWorldNeedsUpdate = true;
  group.add(holder);
  const made = (m) => ((m.parts = [holder, ...(m.parts ?? [])]), m);
  // In metres again inside (a made model is placed at the height it was made at: its scale undone here).
  const inner = new THREE.Group();
  inner.scale.setScalar(1 / it.obj.scale.x);
  holder.add(inner);
  if (it.use.moving === 'fridge') {
    // Hinged on the left of the front, opening outwards (to -1.9 rad: a little past square).
    const hinge = new THREE.Group();
    hinge.position.set(-0.37, 0, 0.33);
    hinge.add(fridgeDoor());
    inner.add(hinge);
    let open = 0;
    return made({ item: it, kind: 'fridge', hinge, get open() { return open; }, update(dt, on) {
      open += (on ? 1 : -1) * dt * 2.2;
      open = Math.max(0, Math.min(1, open));
      hinge.rotation.y = -1.9 * (open * open * (3 - 2 * open));
    } });
  }
  if (it.use.moving === 'tv') {
    const tv = tvScreen();
    tv.mesh.position.z = 0.001;
    inner.add(tv.mesh);
    tv.update(0, false);
    return made({ item: it, kind: 'tv', screen: tv.mesh, update: tv.update });
  }
  if (it.use.moving === 'shower') {
    // The head over the middle of the tray, a little towards the back; the water from there to the floor (world space:
    // the water is drawn in the place's group, not the scaled holder).
    const back = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, it.obj.rotation.y);
    const c = it.footprint.getCenter(new THREE.Vector3());
    const head = new THREE.Vector3(c.x, 2.02, c.z).addScaledVector(back, 0.16);
    const headMesh = new THREE.Group();
    for (const p of SHOWER_HEAD.parts) {
      const m = new THREE.Mesh(p.geometry, p.material);
      m.applyMatrix4(p.matrix);
      headMesh.add(m);
    }
    headMesh.scale.setScalar(0.32);
    headMesh.position.copy(head);
    headMesh.rotation.y = it.obj.rotation.y;
    group.add(headMesh);
    const water = showerWater(head);
    group.add(water.mesh);
    return made({ item: it, kind: 'shower', water: water.mesh, update: water.update, parts: [headMesh, water.mesh] });
  }
  if (it.use.moving === 'ducks') {
    // Round 11: the pond's ducks (dressing.mjs), who come over to the stump while someone feeds them from it.
    const pond = pondLife(group, it.use.pond);
    const at = { x: it.obj.position.x, z: it.obj.position.z };
    return { item: it, kind: 'ducks', pond, update: (dt, on) => pond.update(dt, on ? at : null) };
  }
  return made({ item: it, kind: it.use.moving, update() {} });
}

// A walk grid over the floor: footprints (padded) are blocked, except things you walk on. A* with a binary heap.
function makeGrid(items, W, D, CELL) {
  const cols = Math.round(W / CELL), rows = Math.round(D / CELL);
  const blocked = new Uint8Array(cols * rows);
  const pad = 0.22;
  const cellsOf = (b, pad) => [
    Math.max(0, Math.floor((b.min.x - pad + W / 2) / CELL)), Math.min(cols - 1, Math.floor((b.max.x + pad + W / 2) / CELL)),
    Math.max(0, Math.floor((b.min.z - pad + D / 2) / CELL)), Math.min(rows - 1, Math.floor((b.max.z + pad + D / 2) / CELL))
  ];
  const block = (it, into = blocked) => {
    if (it.use?.walkable) return;
    const [c0, c1, r0, r1] = cellsOf(it.footprint, pad);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) into[r * cols + c] = 1;
  };
  const border = (into) => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) into[r * cols + c] = 1;
  };
  for (const it of items) block(it);
  border(blocked);
  const cell = (p) => [Math.min(cols - 1, Math.max(0, Math.floor((p.x + W / 2) / CELL))), Math.min(rows - 1, Math.max(0, Math.floor((p.z + D / 2) / CELL)))];
  const centre = (c, r) => new THREE.Vector3(-W / 2 + (c + 0.5) * CELL, 0, -D / 2 + (r + 0.5) * CELL);
  const g = new Float32Array(cols * rows), came = new Int32Array(cols * rows), closed = new Uint8Array(cols * rows);
  function lineFree(a, b) {
    const n = Math.ceil(a.distanceTo(b) / (CELL / 2));
    for (let i = 1; i < n; i++) {
      const [c, r] = cell(a.clone().lerp(b, i / n));
      if (blocked[r * cols + c]) return false;
    }
    return true;
  }
  // The cells reachable from `from` on `grid` (a flood fill, eight ways like the paths).
  // From the free cell nearest `from`: the door's spot can sit in the padding round the bed beside it (the flat's
  // front door does), and a fill from a blocked cell reaches nothing.
  const reach = (grid, from) => {
    const seen = new Uint8Array(cols * rows);
    let [fc, fr] = cell(from);
    let best = Infinity;
    for (let dr = -4; dr <= 4; dr++)
      for (let dc = -4; dc <= 4; dc++) {
        const c = cell(from)[0] + dc, r = cell(from)[1] + dr, d = dr * dr + dc * dc;
        if (c > 0 && r > 0 && c < cols - 1 && r < rows - 1 && !grid[r * cols + c] && d < best) (best = d), (fc = c), (fr = r);
      }
    const stack = [fr * cols + fc];
    seen[stack[0]] = 1;
    while (stack.length) {
      const cur = stack.pop(), cc = cur % cols, cr = Math.floor(cur / cols);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nc = cc + dc, nr = cr + dr, n = nr * cols + nc;
          if ((!dr && !dc) || nc < 0 || nr < 0 || nc >= cols || nr >= rows || seen[n] || grid[n]) continue;
          if (dr && dc && (grid[cr * cols + nc] || grid[nr * cols + cc])) continue;
          seen[n] = 1;
          stack.push(n);
        }
    }
    return seen;
  };
  // The biggest open area of the floor (the room, not a pocket): what Sims walk round. The front door's own spot is in
  // such a pocket (they walk out through the padding), so the room is measured, not the way from the door.
  const largest = (grid) => {
    const done = new Uint8Array(cols * rows);
    let best = null, size = 0;
    for (let i = 0; i < cols * rows; i++) {
      if (grid[i] || done[i]) continue;
      const seen = reach(grid, new THREE.Vector3(-W / 2 + ((i % cols) + 0.5) * CELL, 0, -D / 2 + (Math.floor(i / cols) + 0.5) * CELL));
      let n = 0;
      for (let k = 0; k < seen.length; k++) if (seen[k]) (done[k] = 1), n++;
      if (n > size) (size = n), (best = seen);
    }
    return best ?? new Uint8Array(cols * rows);
  };
  return {
    block,
    // Everything blocked again from scratch (something taken away).
    rebuild(list) {
      blocked.fill(0);
      for (const it of list) block(it);
      border(blocked);
    },
    // Would `item` fit (round 10's buy menu)? Its footprint inside the floor and on nothing else; then, with it there
    // (and `except` gone: what it replaces or where it is moved from), every spot in `spots` that can be reached today
    // still can be, and its own spot too. "Reached": in the biggest open area of the floor (`largest`).
    fits(item, spots, door, except = []) {
      const b = item.footprint, wall = 0.07; // half a wall's thickness: up against its inner face is fine
      if (b.min.x < -W / 2 + wall || b.max.x > W / 2 - wall || b.min.z < -D / 2 + wall || b.max.z > D / 2 - wall) return { ok: false, why: 'wall' };
      const now = except.length ? blocked.slice() : blocked;
      if (except.length) {
        now.fill(0);
        for (const it of items) if (!except.includes(it) && !it.gone) block(it, now);
        border(now);
      }
      // Not on top of anything (their own boxes, not the walking room round them: that is the reach test below). A
      // rug under a table is fine; a rug can't go under one.
      const overlap = (o) => b.min.x < o.max.x - 0.02 && b.max.x > o.min.x + 0.02 && b.min.z < o.max.z - 0.02 && b.max.z > o.min.z + 0.02;
      // Round 14: a shower or a bath is walked into (`walkable`) but nothing goes on it (`solid`).
      for (const o of items) if (!o.gone && !except.includes(o) && o.obj && (!o.use?.walkable || o.use.solid) && overlap(o.footprint)) return { ok: false, why: 'taken' };
      // Or where a Sim stands to use something.
      for (const o of items) if (!o.gone && !except.includes(o) && o.spot && o.use?.act && !o.use.walkable && b.min.x < o.spot.x && b.max.x > o.spot.x && b.min.z < o.spot.z && b.max.z > o.spot.z) return { ok: false, why: 'taken' };
      const after = now.slice();
      block(item, after);
      if (!door) return { ok: true };
      // A spot is reached when its cell, or one beside it, is (a chair's spot touches the chair). Only the spots that
      // could be reached before count: the new thing must not cut any of them off.
      // Round 14: its own spot within two cells. A thing sat on (a loo, a chair) has its spot just in front of it, inside
      // its own padding; whether a cell beside the spot is free then hung on how the grid lined up with the walls: a loo
      // that fitted the 7 m flat fitted nowhere in a 10 m one (parked-lifesim-r14-loonowhere).
      const reached = (seen, s, k = 1) => {
        const [c, r] = cell(s);
        for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) if (seen[(r + dr) * cols + (c + dc)]) return true;
        return false;
      };
      // "Before" is the floor as it is now, `except` and all: a new bed in the camp bed's place, or a thing moved, must
      // leave no spot worse off than today; it is not held to a floor without the thing it replaces.
      const before = largest(blocked), seen = largest(after);
      for (const [k, s] of spots.entries()) if (s === item.spot ? !reached(seen, s, 2) : !reached(seen, s) && reached(before, s)) return { ok: false, why: 'blocks', which: k };
      return { ok: true };
    },
    free(p) {
      const [c, r] = cell(p);
      return !blocked[r * cols + c];
    },
    // The goal may be blocked (a chair's spot touches the chair): the path ends at the goal itself.
    path(from, to) {
      const [sc, sr] = cell(from), [gc, gr] = cell(to);
      const start = sr * cols + sc, goal = gr * cols + gc;
      g.fill(Infinity);
      came.fill(-1);
      closed.fill(0);
      g[start] = 0;
      const h = (i) => Math.hypot((i % cols) - gc, Math.floor(i / cols) - gr);
      const heap = [[h(start), start]];
      const push = (e) => {
        heap.push(e);
        for (let i = heap.length - 1; i > 0; ) {
          const p = (i - 1) >> 1;
          if (heap[p][0] <= heap[i][0]) break;
          [heap[p], heap[i]] = [heap[i], heap[p]];
          i = p;
        }
      };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          for (let i = 0; ; ) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === i) break;
            [heap[m], heap[i]] = [heap[i], heap[m]];
            i = m;
          }
        }
        return top;
      };
      while (heap.length) {
        const [, cur] = pop();
        if (closed[cur]) continue;
        closed[cur] = 1;
        if (cur === goal) break;
        const cc = cur % cols, cr = Math.floor(cur / cols);
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nc = cc + dc, nr = cr + dr;
            if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
            const n = nr * cols + nc;
            if ((blocked[n] && n !== goal) || closed[n]) continue;
            if (dr && dc && (blocked[cr * cols + nc] || blocked[nr * cols + cc]) && n !== goal) continue;
            const cost = g[cur] + (dr && dc ? 1.414 : 1);
            if (cost < g[n]) {
              g[n] = cost;
              came[n] = cur;
              push([cost + h(n), n]);
            }
          }
      }
      if (came[goal] === -1 && goal !== start) return [to.clone()];
      const cells = [];
      for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.unshift(i);
      const pts = cells.map((i) => centre(i % cols, Math.floor(i / cols)));
      pts[pts.length - 1] = to.clone();
      const out = [];
      let anchor = from.clone();
      for (let i = 0; i < pts.length; i++) {
        const next = pts[i + 1];
        if (next && lineFree(anchor, next)) continue;
        out.push(pts[i]);
        anchor = pts[i];
      }
      return out;
    }
  };
}
