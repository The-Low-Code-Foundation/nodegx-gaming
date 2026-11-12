// The hospital floor, built from map.mjs. Round 2 (playtest: "better environment graphics: bullet holes, floor and roof,
// walls and doors"): photo materials (ambientCG, CC0: terrazzo in the corridors, worn tiles in the rooms, a suspended
// ceiling, plaster under two-tone paint), handrails, fresh damage and blood on the walls, signs, ward doors that swing when
// someone walks through and fall shut behind them, curtains round the ward bays, hospital beds, gurneys, counters,
// waiting-room chairs, planters, vending machines and shelving. Static pieces are merged by material (a few draw calls).
// Everything a bullet can hit is in `shootables`; what the camera must not pass through is in `solids`.
// Round 3 (playtest: "the apocalypse has just happened, so the hospital shouldn't look run down, maybe just damaged. So no
// black mold lines on the wall"): the damp streaks are gone, the paint is clean; what is on the walls now happened
// tonight: plaster cracked and chipped where something heavy hit it, wet blood, papers on the floor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CELL, LIGHTS, toWorld, isWall, isDoorway, walkable } from './map.mjs';

export const WALL_H = 3.2;
const DOOR_H = 2.2;
const params = new URLSearchParams(location.search);
const lite = params.get('lite') === '1';

// ---- textures ------------------------------------------------------------------------------------------------------
const loader = new THREE.TextureLoader();
const loadImage = (url) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = url;
});
async function tex(name, { srgb = true, repeat = null } = {}) {
  try {
    const t = await loader.loadAsync(`assets/tex/${name}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) t.repeat.set(...repeat);
    return t;
  } catch {
    return null;
  }
}
function canvasTexture(draw, w = 256, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const rnd = (seed) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

// Hospital wall: off-white above, sage green below a dado rail, a dark vinyl skirting, scuffs. Plaster under the paint.
function wallTexture(plaster) {
  return canvasTexture((g, s) => {
    g.fillStyle = '#e4e2d6';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#93ab9a';
    g.fillRect(0, s * 0.68, s, s * 0.32);
    g.fillStyle = '#6d7f72';
    g.fillRect(0, s * 0.665, s, s * 0.018);
    g.fillStyle = '#2d3330';
    g.fillRect(0, s * 0.955, s, s * 0.045);
    if (plaster) {
      // The plaster's texture under the paint, faintly: a well-kept wall, not a stained one.
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 0.45;
      g.drawImage(plaster, 0, 0, s, s);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    const r = rnd(7);
    // Trolley scuffs along the dado, a little wear at the skirting.
    for (let i = 0; i < 50; i++) {
      g.fillStyle = `rgba(30,32,28,${r() * 0.08})`;
      g.fillRect(r() * s, s * (0.7 + r() * 0.2), 4 + r() * 40, 1 + r() * 2);
    }
    const grad = g.createLinearGradient(0, s * 0.85, 0, s * 0.955);
    grad.addColorStop(0, 'rgba(40,36,30,0)');
    grad.addColorStop(1, 'rgba(40,36,30,0.12)');
    g.fillStyle = grad;
    g.fillRect(0, s * 0.85, s, s * 0.105);
  }, 512);
}
// Painted metal recoloured: a door leaf's colour with the photo's scuffs.
function recolour(img, colour, size = 256) {
  return canvasTexture((g, s) => {
    g.fillStyle = colour;
    g.fillRect(0, 0, s, s);
    if (img) {
      g.globalCompositeOperation = 'multiply';
      g.filter = 'grayscale(1) brightness(1.9) contrast(0.8)';
      g.drawImage(img, 0, 0, s, s);
      g.filter = 'none';
      g.globalCompositeOperation = 'source-over';
    }
  }, size);
}
function signTexture(text, { bg = '#1d4f8f', fg = '#ffffff', w = 512, h = 128, arrow = '' } = {}) {
  const t = canvasTexture((g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg;
    g.font = `700 ${Math.round(h * 0.42)}px "Helvetica Neue", Arial, sans-serif`;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(`${arrow === '<' ? '← ' : ''}${text}${arrow === '>' ? ' →' : ''}`, w / 2, h / 2 + 2);
  }, w, h);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
// A smear of blood on a wall: a streak dragged down, or a handprint.
function smearTexture(kind, seed) {
  const t = canvasTexture((g, s) => {
    const r = rnd(seed);
    g.clearRect(0, 0, s, s);
    const red = () => `rgba(${70 + r() * 40},${4 + r() * 8},${4 + r() * 8},${0.6 + r() * 0.35})`;
    if (kind === 'hand') {
      for (let k = 0; k < 2; k++) {
        const cx = s * (0.35 + k * 0.3), cy = s * (0.4 + r() * 0.2);
        g.fillStyle = red();
        g.beginPath();
        g.ellipse(cx, cy, s * 0.08, s * 0.1, 0, 0, 7);
        g.fill();
        for (let f = 0; f < 5; f++) {
          const a = -2.4 + f * 0.42 + (k ? 0 : 0.1);
          g.save();
          g.translate(cx + Math.cos(a) * s * 0.1, cy + Math.sin(a) * s * 0.12);
          g.rotate(a + Math.PI / 2);
          g.fillRect(-s * 0.016, -s * 0.09, s * 0.032, s * (f === 0 ? 0.06 : 0.09));
          g.restore();
        }
        // Dragged down.
        g.fillStyle = `rgba(80,6,6,0.35)`;
        g.fillRect(cx - s * 0.06, cy, s * 0.12, s * (0.2 + r() * 0.3));
      }
    } else {
      g.fillStyle = red();
      g.beginPath();
      g.ellipse(s / 2, s * 0.3, s * 0.18, s * 0.12, r(), 0, 7);
      g.fill();
      for (let i = 0; i < 14; i++) {
        g.fillStyle = red();
        const x = s * (0.32 + r() * 0.36), w = 3 + r() * 9;
        g.fillRect(x, s * 0.3, w, s * (0.15 + r() * 0.55));
        g.beginPath();
        g.arc(x + w / 2, s * (0.3 + r() * 0.6), w * 0.7, 0, 7);
        g.fill();
      }
      for (let i = 0; i < 30; i++) {
        g.fillStyle = red();
        g.beginPath();
        g.arc(s / 2 + (r() - 0.5) * s * 0.8, s * 0.3 + (r() - 0.5) * s * 0.5, 1 + r() * 4, 0, 7);
        g.fill();
      }
    }
  }, 256);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Fresh damage: plaster cracked and chipped where something heavy hit the wall tonight (a trolley, a body, a fire
// extinguisher), the grey under the paint showing, cracks running out, a few loose flakes.
function crackTexture(seed) {
  const t = canvasTexture((g, s) => {
    const r = rnd(seed);
    g.clearRect(0, 0, s, s);
    const c = s / 2;
    // The chipped crater: an irregular patch of bare plaster with a darker core and a lit lower lip.
    const pts = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = s * (0.07 + r() * 0.09);
      pts.push([c + Math.cos(a) * d, c + Math.sin(a) * d * 0.8]);
    }
    g.fillStyle = '#a9a294';
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    const rg = g.createRadialGradient(c, c - s * 0.01, 0, c, c, s * 0.12);
    rg.addColorStop(0, 'rgba(70,66,60,0.9)');
    rg.addColorStop(1, 'rgba(120,114,104,0)');
    g.fillStyle = rg;
    g.fill();
    g.strokeStyle = 'rgba(245,242,232,0.7)';
    g.lineWidth = 2;
    g.stroke();
    // Cracks: jagged lines branching out from the crater.
    const crack = (x, y, a, len, w) => {
      g.strokeStyle = `rgba(40,38,34,${0.55 + r() * 0.3})`;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      let px = x, py = y;
      const steps = 6 + Math.floor(r() * 5);
      for (let i = 0; i < steps; i++) {
        a += (r() - 0.5) * 0.9;
        px += Math.cos(a) * (len / steps);
        py += Math.sin(a) * (len / steps);
        g.lineTo(px, py);
        if (w > 1 && r() < 0.25) crack(px, py, a + (r() < 0.5 ? 0.8 : -0.8), len * 0.4, w * 0.6);
      }
      g.stroke();
    };
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      crack(c + Math.cos(a) * s * 0.1, c + Math.sin(a) * s * 0.08, a, s * (0.18 + r() * 0.2), 1.6 + r() * 1.2);
    }
    // Flakes of paint about to fall.
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = s * (0.13 + r() * 0.08);
      g.fillStyle = `rgba(${150 + r() * 30},${146 + r() * 30},${136 + r() * 30},0.9)`;
      g.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + r() * 5, 2 + r() * 4);
    }
  }, 256);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
// A sheet of paper dropped tonight: a form, printed lines, a crease.
function paperTexture(seed) {
  const t = canvasTexture((g, s) => {
    const r = rnd(seed);
    g.fillStyle = r() < 0.3 ? '#efe7c8' : '#f2f2ee';
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(30,60,120,0.55)';
    g.fillRect(s * 0.1, s * 0.08, s * 0.5, s * 0.05);
    g.fillStyle = 'rgba(40,40,40,0.35)';
    for (let y = 0.2; y < 0.9; y += 0.05) g.fillRect(s * 0.1, s * y, s * (0.5 + r() * 0.3), 2);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.beginPath();
    g.moveTo(0, s * (0.3 + r() * 0.4));
    g.lineTo(s, s * (0.3 + r() * 0.4));
    g.stroke();
  }, 64);
  return t;
}

let furnitureCache = new Map();
async function unitModel(name) {
  if (!furnitureCache.has(name))
    furnitureCache.set(
      name,
      new GLTFLoader().loadAsync(`assets/furniture/${name}.glb`).then((gltf) => {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        gltf.scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        const wrap = new THREE.Group();
        wrap.add(gltf.scene);
        return { scene: wrap, size };
      }).catch(() => null)
    );
  return furnitureCache.get(name);
}

// Collects static pieces by material and merges them: [material key] → geometries already in world space.
class Batch {
  constructor() {
    this.parts = new Map();
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
  }
  // A geometry placed by an object frame (position, yaw) and a local offset/rotation.
  add(key, geo, frame, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    this.m.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), this.one);
    g.applyMatrix4(this.m);
    if (frame) {
      this.m.compose(this.v.set(frame.x, frame.y ?? 0, frame.z), this.q.setFromEuler(this.e.set(0, frame.yaw ?? 0, 0)), this.one);
      g.applyMatrix4(this.m);
    }
    (this.parts.get(key) ?? this.parts.set(key, []).get(key)).push(g);
  }
  build(materials, group, name) {
    const meshes = [];
    for (const [key, geos] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), materials[key]);
      mesh.name = `${name}:${key}`;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
}

export async function buildLevel(grid, scene) {
  const group = new THREE.Group();
  group.name = 'level';
  const W = grid.w * CELL, H = grid.h * CELL;
  const cell = (x, z) => grid.cells[z]?.[x] ?? '#';

  const [terrazzo, terrazzoN, tiles, tilesN, ceil, ceilN, plasterN, , , metalImg, metalN, wtiles, wtilesN] = await Promise.all([
    tex('Terrazzo001_Color'), tex('Terrazzo001_NormalGL', { srgb: false }), tex('Tiles141_Color'), tex('Tiles141_NormalGL', { srgb: false }),
    tex('OfficeCeiling001_Color'), tex('OfficeCeiling001_NormalGL', { srgb: false }), tex('Plaster003_NormalGL', { srgb: false }),
    null, null, loadImage('assets/tex/PaintedMetal004_Color.jpg'),
    tex('PaintedMetal004_NormalGL', { srgb: false }), tex('Tiles107_Color'), tex('Tiles107_NormalGL', { srgb: false })
  ]);
  const plasterImg = await loadImage('assets/tex/Plaster003_Color.jpg');

  // ---- floors: terrazzo in corridors and halls, tiles in rooms ----------------------------------------------------
  // A cell with something on it takes the floor of most of its neighbours.
  const kindOf = (x, z) => {
    const c = cell(x, z);
    if (c === ',') return 'room';
    if (c === '.' || 'DOLSE'.includes(c)) return 'hall';
    let room = 0, hall = 0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = cell(x + dx, z + dz);
        if (n === ',') room++;
        else if (n === '.') hall++;
      }
    return room > hall ? 'room' : 'hall';
  };
  const floorGeos = { hall: [], room: [] };
  for (let z = 0; z < grid.h; z++)
    for (let x = 0; x < grid.w; x++) {
      if (isWall(grid, x, z)) continue;
      const g = new THREE.PlaneGeometry(CELL, CELL);
      g.rotateX(-Math.PI / 2);
      g.translate((x + 0.5) * CELL, 0, (z + 0.5) * CELL);
      // World-space UVs: a terrazzo texture is 2.5 m, the tiles 3 m.
      const pos = g.attributes.position, uv = g.attributes.uv;
      const k = kindOf(x, z);
      const size = k === 'hall' ? 2.5 : 3;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / size, -pos.getZ(i) / size);
      floorGeos[k].push(g);
    }
  const floorMats = {
    hall: new THREE.MeshPhongMaterial({ map: terrazzo, normalMap: terrazzoN, normalScale: new THREE.Vector2(0.6, 0.6), color: terrazzo ? 0xb8bcbd : 0x8b9aa0, shininess: 70, specular: 0x3a3a3a }),
    room: new THREE.MeshPhongMaterial({ map: tiles, normalMap: tilesN, color: tiles ? 0xc9cdcf : 0x96a4a9, shininess: 35, specular: 0x222222 })
  };
  const floors = [];
  for (const k of ['hall', 'room']) {
    if (!floorGeos[k].length) continue;
    const m = new THREE.Mesh(mergeGeometries(floorGeos[k]), floorMats[k]);
    m.name = `floor:${k}`;
    m.receiveShadow = true;
    group.add(m);
    floors.push(m);
  }

  // ---- ceiling: suspended tiles, 60 cm --------------------------------------------------------------------------
  if (ceil) ceil.repeat.set(W / 3.6, H / 3.6);
  if (ceilN) ceilN.repeat.set(W / 3.6, H / 3.6);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshPhongMaterial({ map: ceil, normalMap: ceilN, color: 0x8d9090, shininess: 5 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(W / 2, WALL_H, H / 2);
  ceiling.name = 'ceiling';
  group.add(ceiling);

  // ---- walls ----------------------------------------------------------------------------------------------------
  const wallGeos = [];
  const faces = []; // every wall face that looks onto a walkable cell: { x, z, dx, dz } (dx, dz: towards the open side)
  for (let z = 0; z < grid.h; z++)
    for (let x = 0; x < grid.w; x++) {
      if (!isWall(grid, x, z)) continue;
      let open = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = cell(x + dx, z + dz);
        if (n !== '#' && grid.cells[z + dz]) {
          open = true;
          faces.push({ x, z, dx, dz, onto: n });
        }
      }
      if (!open) continue;
      const g = new THREE.BoxGeometry(CELL, WALL_H, CELL);
      g.translate((x + 0.5) * CELL, WALL_H / 2, (z + 0.5) * CELL);
      wallGeos.push(g);
    }
  const wallTex = wallTexture(plasterImg);
  const walls = new THREE.Mesh(mergeGeometries(wallGeos), new THREE.MeshPhongMaterial({ map: wallTex, normalMap: plasterN, normalScale: new THREE.Vector2(0.5, 0.5), shininess: 12, specular: 0x1a1a1a }));
  walls.name = 'walls';
  group.add(walls);
  const faceFrame = (f, out = 0.0) => {
    const c = toWorld(f.x, f.z);
    return { x: c.x + f.dx * (CELL / 2 + out), z: c.z + f.dz * (CELL / 2 + out), yaw: Math.atan2(f.dx, f.dz) };
  };
  const doorwayAt = (x, z) => isDoorway(grid, x, z);

  // Materials for the static props.
  const M = {
    steel: new THREE.MeshPhongMaterial({ color: 0xc9ced3, shininess: 90, specular: 0x888888 }),
    darkSteel: new THREE.MeshPhongMaterial({ color: 0x4a5056, shininess: 60, specular: 0x555555 }),
    rail: new THREE.MeshPhongMaterial({ color: 0xb9a27e, shininess: 40, specular: 0x333333 }),
    frame: new THREE.MeshPhongMaterial({ color: 0x5d6970, shininess: 50, specular: 0x444444 }),
    sheet: new THREE.MeshPhongMaterial({ color: 0xe9eef0, shininess: 8 }),
    blanket: new THREE.MeshPhongMaterial({ color: 0x8fb3c9, shininess: 6 }),
    mattress: new THREE.MeshPhongMaterial({ color: 0x3d5a73, shininess: 30, specular: 0x333333 }),
    bedFrame: new THREE.MeshPhongMaterial({ color: 0xdfe3e1, shininess: 50, specular: 0x444444 }),
    rubber: new THREE.MeshPhongMaterial({ color: 0x1c1d1f, shininess: 10 }),
    laminate: new THREE.MeshPhongMaterial({ color: 0x9a7f62, shininess: 30, specular: 0x222222 }),
    counterTop: new THREE.MeshPhongMaterial({ color: 0xd9d6cc, shininess: 60, specular: 0x444444 }),
    seat: new THREE.MeshPhongMaterial({ color: 0x2f5d8a, shininess: 30, specular: 0x333333 }),
    planter: new THREE.MeshPhongMaterial({ color: 0x6f6a62, shininess: 10 }),
    soil: new THREE.MeshPhongMaterial({ color: 0x2b2118 }),
    machine: new THREE.MeshPhongMaterial({ color: 0xa3262a, shininess: 60, specular: 0x444444 }),
    machineFront: new THREE.MeshPhongMaterial({ color: 0x111111, emissive: 0x9fd4ff, emissiveIntensity: 0.55, shininess: 90 }),
    shelf: new THREE.MeshPhongMaterial({ color: 0x8e979e, shininess: 40, specular: 0x333333 }),
    box: new THREE.MeshPhongMaterial({ color: 0xb59a72, shininess: 5 }),
    screen: new THREE.MeshPhongMaterial({ color: 0x0d1418, emissive: 0x2a5f7a, emissiveIntensity: 0.6, shininess: 80 }),
    green: new THREE.MeshPhongMaterial({ color: 0x3e6b3a, shininess: 5 }),
    lintel: new THREE.MeshPhongMaterial({ map: wallTex, shininess: 12 })
  };
  const batch = new Batch(); // things you can hide behind or shoot
  const trim = new Batch(); // rails, frames: shot through rarely, never cover

  // Handrails along the corridor walls (a hospital has them): a rail on brackets at 0.9 m, broken by doorways.
  for (const f of faces) {
    if (!'.SE'.includes(f.onto) && !'Zz'.includes(f.onto)) continue;
    const fr = faceFrame(f, 0.07);
    trim.add('rail', new THREE.BoxGeometry(CELL, 0.06, 0.05), fr, { y: 0.92 });
    for (const s of [-0.7, 0.7]) trim.add('rail', new THREE.BoxGeometry(0.03, 0.06, 0.08), fr, { x: s, y: 0.92, z: -0.03 });
    // Corner guards on the wall's ends next to a doorway.
  }
  // Door frames: steel posts and a wall-coloured lintel over every opening.
  const doorways = [];
  for (let z = 0; z < grid.h; z++)
    for (let x = 0; x < grid.w; x++) {
      if (!doorwayAt(x, z)) continue;
      const alongX = isWall(grid, x - 1, z) || isWall(grid, x + 1, z);
      const c = toWorld(x, z);
      const fr = { x: c.x, z: c.z, yaw: alongX ? 0 : Math.PI / 2 };
      const kind = cell(x, z);
      const open = 1.8;
      trim.add('lintel', new THREE.BoxGeometry(CELL, WALL_H - DOOR_H, CELL * 0.98), fr, { y: DOOR_H + (WALL_H - DOOR_H) / 2 });
      for (const s of [-1, 1]) trim.add('frame', new THREE.BoxGeometry(0.08, DOOR_H, 0.24), fr, { x: s * (open / 2 + 0.04), y: DOOR_H / 2 });
      trim.add('frame', new THREE.BoxGeometry(open + 0.16, 0.08, 0.24), fr, { y: DOOR_H + 0.04 });
      // Fill the gap between a narrower frame and the wall cell.
      const fill = (CELL - open) / 2 - 0.08;
      if (fill > 0.05) for (const s of [-1, 1]) trim.add('lintel', new THREE.BoxGeometry(fill, DOOR_H, CELL * 0.98), fr, { x: s * (CELL / 2 - fill / 2), y: DOOR_H / 2 });
      doorways.push({ x, z, kind, fr, alongX, open });
    }

  // ---- doors -------------------------------------------------------------------------------------------------------
  // Ward doors: two leaves with porthole windows and kick plates, swinging both ways on sprung hinges. Some are
  // propped open. Locked doors: one solid leaf with a wired-glass slot and the room's number.
  const leafMat = new THREE.MeshPhongMaterial({ map: recolour(metalImg, '#7f95a3'), normalMap: metalN, shininess: 45, specular: 0x333333 });
  const lockedMat = new THREE.MeshPhongMaterial({ map: recolour(metalImg, '#a8835e'), normalMap: metalN, shininess: 35, specular: 0x222222 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x0c1418, emissive: 0x05090b, shininess: 90, specular: 0x2a3438, transparent: true, opacity: 0.85 });
  const kickMat = new THREE.MeshPhongMaterial({ color: 0xaeb4b8, shininess: 100, specular: 0x999999 });
  const doors = []; // ward doors (swing) and locked doors
  const leaves = [];
  const r = rnd(41);
  const makeLeaf = (w, mat, window) => {
    const leaf = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, DOOR_H - 0.04, 0.05), mat);
    slab.position.set(w / 2, (DOOR_H - 0.04) / 2, 0);
    leaf.add(slab);
    const kick = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.25, 0.056), kickMat);
    kick.position.set(w / 2, 0.15, 0);
    leaf.add(kick);
    if (window === 'port') {
      const port = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 20), glassMat);
      port.rotation.x = Math.PI / 2;
      port.position.set(w / 2, 1.5, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 20), kickMat);
      ring.position.set(w / 2, 1.5, 0);
      leaf.add(port, ring);
    } else if (window === 'slot') {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.06), glassMat);
      slot.position.set(w * 0.72, 1.45, 0);
      leaf.add(slot);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.1), kickMat);
    handle.position.set(w - 0.1, 1.05, 0);
    leaf.add(handle);
    leaf.traverse((o) => o.isMesh && leaves.push(o));
    return leaf;
  };
  for (const d of doorways) {
    if (d.kind === 'O') continue;
    const frame = new THREE.Group();
    frame.position.set(d.fr.x, 0, d.fr.z);
    frame.rotation.y = d.fr.yaw;
    group.add(frame);
    if (d.kind === 'D') {
      const half = d.open / 2;
      const left = new THREE.Group(), right = new THREE.Group();
      left.position.set(-half, 0, 0);
      right.position.set(half, 0, 0);
      left.add(makeLeaf(half - 0.01, leafMat, 'port'));
      const rl = makeLeaf(half - 0.01, leafMat, 'port');
      rl.scale.x = -1;
      right.add(rl);
      frame.add(left, right);
      const state = grid.doors.get(d.z * grid.w + d.x);
      const propped = r() < 0.3;
      if (propped) state.open = 1;
      doors.push({ ...d, type: 'swing', left, right, state, propped, swing: propped ? 1 : 0, vel: 0, side: r() < 0.5 ? 1 : -1, frame });
    } else {
      const hinge = new THREE.Group();
      hinge.position.set(-d.open / 2, 0, 0);
      hinge.add(makeLeaf(d.open - 0.02, lockedMat, 'slot'));
      frame.add(hinge);
      const room = grid.rooms.find((rm) => rm.door.x === d.x && rm.door.z === d.z);
      doors.push({ ...d, type: 'locked', hinge, room, swing: 0 });
    }
  }

  // ---- curtains round the ward bays --------------------------------------------------------------------------------
  const curtainTex = canvasTexture((g, s) => {
    g.fillStyle = '#b9d3cf';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.15)' : 'rgba(60,90,90,0.12)';
      g.fillRect((i * s) / 16, 0, s / 16, s);
    }
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 6; i++) g.fillRect(0, (i * s) / 6, s, 2);
  });
  const curtainMat = new THREE.MeshPhongMaterial({ map: curtainTex, side: THREE.DoubleSide, shininess: 4, transparent: true, opacity: 0.93 });
  const curtains = [];
  for (let z = 0; z < grid.h; z++)
    for (let x = 0; x < grid.w; x++) {
      if (cell(x, z) !== 'c') continue;
      const alongZ = ['c', '#', 'B'].includes(cell(x, z - 1)) || ['c', '#', 'B'].includes(cell(x, z + 1));
      const c = toWorld(x, z);
      const pivot = new THREE.Group();
      pivot.position.set(c.x, 0, c.z);
      pivot.rotation.y = alongZ ? Math.PI / 2 : 0;
      // A pleated cloth: a plane with folds pushed in and out.
      const g = new THREE.PlaneGeometry(CELL, 2.1, 24, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 11) * 0.05);
      g.computeVertexNormals();
      const cloth = new THREE.Mesh(g, curtainMat);
      cloth.position.set(0, 0.35 + 1.05, 0);
      const rod = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.03, 0.03), M.steel);
      rod.position.y = 2.48;
      // The cloth hangs from one end: drawn back it bunches there.
      const holder = new THREE.Group();
      holder.position.x = -CELL / 2;
      cloth.position.x = CELL / 2;
      holder.add(cloth);
      pivot.add(holder, rod);
      group.add(pivot);
      curtains.push({ x, z, holder, cloth, state: grid.doors.get(z * grid.w + x) ?? grid.doors.set(z * grid.w + x, { x, z, open: 0 }).get(z * grid.w + x), drawn: 0, phase: r() * 6 });
    }

  // ---- furniture: cover and tall things -----------------------------------------------------------------------------
  const plants = await Promise.all(['Houseplant_1', 'Houseplant_3', 'Houseplant_4', 'Houseplant_6'].map(unitModel));
  const covers = [];
  const along = (x, z, ch) => {
    // Lined up with its own kind, or its long side against a wall.
    if (cell(x - 1, z) === ch || cell(x + 1, z) === ch) return true;
    if (cell(x, z - 1) === ch || cell(x, z + 1) === ch) return false;
    return isWall(grid, x, z - 1) || isWall(grid, x, z + 1);
  };
  const extras = new THREE.Group();
  for (const it of grid.items) {
    const ch = it.type;
    if (!'TBNCWVJ'.includes(ch)) continue;
    const c = toWorld(it.x, it.z);
    const ax = along(it.x, it.z, ch);
    // `yaw` turns the piece's long axis (local Z) along the run: alongX → long axis on world X.
    const fr = { x: c.x, z: c.z, yaw: ax ? Math.PI / 2 : 0 };
    if (ch === 'T') {
      // A gurney: steel frame, wheels, a blue mattress and a sheet, a side rail.
      fr.yaw += (r() - 0.5) * 0.25;
      batch.add('mattress', new THREE.BoxGeometry(0.66, 0.1, 1.85), fr, { y: 0.86 });
      batch.add('sheet', new THREE.BoxGeometry(0.69, 0.02, 1.1), fr, { y: 0.92, z: 0.3, rx: 0.02 });
      batch.add('sheet', new THREE.CylinderGeometry(0.09, 0.09, 0.45, 10), fr, { y: 0.96, z: -0.7, rz: Math.PI / 2 });
      batch.add('steel', new THREE.BoxGeometry(0.6, 0.06, 1.75), fr, { y: 0.76 });
      batch.add('steel', new THREE.BoxGeometry(0.55, 0.04, 1.4), fr, { y: 0.3 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        batch.add('steel', new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6), fr, { x: sx * 0.26, y: 0.45, z: sz * 0.78 });
        batch.add('rubber', new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), fr, { x: sx * 0.26, y: 0.07, z: sz * 0.78, rz: Math.PI / 2 });
      }
      batch.add('steel', new THREE.BoxGeometry(0.03, 0.2, 1.2), fr, { x: 0.36, y: 1.0 });
      batch.add('steel', new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6), fr, { x: -0.3, y: 1.4, z: -0.85 });
    } else if (ch === 'B') {
      // A hospital bed: head and foot boards, the frame, a mattress, a sheet and a blanket, rails, a pillow.
      const lenDir = isWall(grid, it.x, it.z - 1) ? 1 : isWall(grid, it.x, it.z + 1) ? -1 : 1;
      const fb = { ...fr, yaw: ax ? Math.PI / 2 : lenDir > 0 ? 0 : Math.PI };
      batch.add('bedFrame', new THREE.BoxGeometry(0.95, 0.12, 1.95), fb, { y: 0.48 });
      batch.add('mattress', new THREE.BoxGeometry(0.88, 0.14, 1.9), fb, { y: 0.61 });
      batch.add('sheet', new THREE.BoxGeometry(0.9, 0.03, 1.9), fb, { y: 0.69 });
      batch.add('blanket', new THREE.BoxGeometry(0.94, 0.06, 1.15), fb, { y: 0.71, z: 0.35 });
      batch.add('sheet', new THREE.BoxGeometry(0.6, 0.12, 0.35), fb, { y: 0.76, z: -0.72 });
      batch.add('bedFrame', new THREE.BoxGeometry(1.0, 0.85, 0.06), fb, { y: 0.62, z: -0.98 });
      batch.add('bedFrame', new THREE.BoxGeometry(1.0, 0.6, 0.06), fb, { y: 0.5, z: 0.98 });
      for (const s of [-1, 1]) {
        batch.add('steel', new THREE.BoxGeometry(0.03, 0.22, 0.9), fb, { x: s * 0.5, y: 0.8, z: -0.35 });
        for (const e of [-1, 1]) batch.add('rubber', new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), fb, { x: s * 0.4, y: 0.07, z: e * 0.85, rz: Math.PI / 2 });
        for (const e of [-1, 1]) batch.add('steel', new THREE.CylinderGeometry(0.025, 0.025, 0.36, 6), fb, { x: s * 0.4, y: 0.25, z: e * 0.85 });
      }
      // A drip stand by the head.
      batch.add('steel', new THREE.CylinderGeometry(0.012, 0.012, 1.9, 6), fb, { x: 0.65, y: 0.95, z: -0.8 });
      batch.add('sheet', new THREE.BoxGeometry(0.1, 0.18, 0.04), fb, { x: 0.65, y: 1.75, z: -0.8 });
    } else if (ch === 'N') {
      // A counter: a laminate front, a high pale top, a monitor now and then.
      const inX = cell(it.x - 1, it.z) === 'N' || cell(it.x + 1, it.z) === 'N';
      const fn = { x: c.x, z: c.z, yaw: inX ? 0 : Math.PI / 2 };
      batch.add('laminate', new THREE.BoxGeometry(CELL, 1.0, 0.7), fn, { y: 0.5 });
      batch.add('counterTop', new THREE.BoxGeometry(CELL + 0.02, 0.05, 0.85), fn, { y: 1.03 });
      batch.add('counterTop', new THREE.BoxGeometry(CELL + 0.02, 0.04, 0.5), fn, { y: 0.74, z: -0.5 });
      if (r() < 0.6) {
        batch.add('darkSteel', new THREE.BoxGeometry(0.5, 0.32, 0.04), fn, { x: (r() - 0.5) * 1, y: 1.28, z: 0.1 });
        batch.add('darkSteel', new THREE.BoxGeometry(0.06, 0.18, 0.06), fn, { y: 1.1, z: 0.13 });
      }
    } else if (ch === 'J') {
      // An office desk (round 4: she can get under it): a top on steel legs, open beneath, a slim drawer unit at one end,
      // a monitor, papers; its chair pushed away or knocked over.
      const fd = { ...fr, yaw: fr.yaw + (r() - 0.5) * 0.12 };
      batch.add('laminate', new THREE.BoxGeometry(0.8, 0.04, 1.6), fd, { y: 0.74 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) batch.add('darkSteel', new THREE.BoxGeometry(0.04, 0.72, 0.04), fd, { x: sx * 0.36, y: 0.36, z: sz * 0.76 });
      batch.add('darkSteel', new THREE.BoxGeometry(0.72, 0.04, 0.04), fd, { y: 0.66, z: -0.76 });
      batch.add('darkSteel', new THREE.BoxGeometry(0.72, 0.04, 0.04), fd, { y: 0.66, z: 0.76 });
      batch.add('shelf', new THREE.BoxGeometry(0.42, 0.26, 0.36), fd, { x: 0.12, y: 0.57, z: 0.52 });
      batch.add('darkSteel', new THREE.BoxGeometry(0.06, 0.4, 0.5), fd, { x: 0.05, y: 0.96, z: -0.2, ry: 0.15 });
      batch.add('screen', new THREE.BoxGeometry(0.04, 0.34, 0.52), fd, { x: 0.02, y: 0.98, z: -0.2, ry: 0.15 });
      batch.add('darkSteel', new THREE.BoxGeometry(0.16, 0.03, 0.42), fd, { x: -0.18, y: 0.775, z: -0.2 });
      batch.add('sheet', new THREE.BoxGeometry(0.22, 0.01, 0.3), fd, { x: -0.15, y: 0.765, z: 0.35, ry: r() });
      // The chair: on its side by a corner of the desk, or rolled back there (never square in front of its knee
      // space: from under the desk, that is the view out).
      const tipped = r() < 0.5;
      const cx = r() < 0.5 ? -1 : 1, cz = r() < 0.5 ? -1 : 1;
      const lx = cx * 0.62, lz = cz * 0.98;
      const fc = { x: c.x + Math.cos(fd.yaw) * lx + Math.sin(fd.yaw) * lz, z: c.z - Math.sin(fd.yaw) * lx + Math.cos(fd.yaw) * lz, yaw: r() * 6 };
      if (tipped) {
        batch.add('seat', new THREE.BoxGeometry(0.48, 0.48, 0.08), fc, { y: 0.26, rz: Math.PI / 2 - 0.15 });
        batch.add('seat', new THREE.BoxGeometry(0.08, 0.5, 0.5), fc, { x: 0.3, y: 0.25, z: 0.0, rz: 0.1 });
        batch.add('darkSteel', new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), fc, { x: -0.25, y: 0.25, rz: Math.PI / 2 });
      } else {
        batch.add('seat', new THREE.BoxGeometry(0.48, 0.08, 0.48), fc, { y: 0.48 });
        batch.add('seat', new THREE.BoxGeometry(0.46, 0.5, 0.06), fc, { y: 0.78, z: -0.24, rx: -0.15 });
        batch.add('darkSteel', new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), fc, { y: 0.26 });
        for (let i = 0; i < 5; i++) batch.add('darkSteel', new THREE.BoxGeometry(0.03, 0.03, 0.3), fc, { y: 0.06, ry: (i / 5) * Math.PI * 2, z: 0 });
      }
    } else if (ch === 'C') {
      // Waiting-room chairs: three seats on a beam.
      const inX = cell(it.x - 1, it.z) === 'C' || cell(it.x + 1, it.z) === 'C';
      const fc = { x: c.x, z: c.z, yaw: inX ? 0 : Math.PI / 2 };
      batch.add('darkSteel', new THREE.BoxGeometry(CELL - 0.1, 0.06, 0.08), fc, { y: 0.38 });
      for (const s of [-0.62, 0, 0.62]) {
        batch.add('seat', new THREE.BoxGeometry(0.52, 0.06, 0.48), fc, { x: s, y: 0.46, z: 0.03 });
        batch.add('seat', new THREE.BoxGeometry(0.52, 0.5, 0.05), fc, { x: s, y: 0.74, z: -0.22, rx: -0.12 });
      }
      for (const s of [-0.85, 0.85]) batch.add('darkSteel', new THREE.BoxGeometry(0.05, 0.4, 0.42), fc, { x: s, y: 0.2 });
    } else if (ch === 'W') {
      // A low planter.
      batch.add('planter', new THREE.BoxGeometry(CELL - 0.1, 0.85, 0.6), fr, { y: 0.425 });
      batch.add('soil', new THREE.BoxGeometry(CELL - 0.2, 0.02, 0.5), fr, { y: 0.86 });
      const plant = plants[(it.x + it.z) % plants.length];
      if (plant)
        for (const s of [-0.45, 0.45]) {
          const m = plant.scene.clone();
          const k = 0.9 / Math.max(plant.size.y, 0.01);
          m.scale.setScalar(k);
          m.position.set(c.x + (ax ? s : 0), 0.85, c.z + (ax ? 0 : s));
          extras.add(m);
        }
    } else if (ch === 'V') {
      const hall = kindOf(it.x, it.z) === 'hall';
      // Against the nearest wall.
      const wallDir = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dz]) => isWall(grid, it.x + dx, it.z + dz)) ?? [0, -1];
      const fv = { x: c.x + wallDir[0] * 0.35, z: c.z + wallDir[1] * 0.35, yaw: Math.atan2(-wallDir[0], -wallDir[1]) };
      if (hall) {
        batch.add('machine', new THREE.BoxGeometry(1.0, 1.95, 0.85), fv, { y: 0.975 });
        batch.add('machineFront', new THREE.BoxGeometry(0.62, 1.3, 0.02), fv, { x: -0.12, y: 1.15, z: 0.43 });
        batch.add('darkSteel', new THREE.BoxGeometry(0.22, 0.5, 0.03), fv, { x: 0.33, y: 1.2, z: 0.43 });
        batch.add('darkSteel', new THREE.BoxGeometry(0.62, 0.2, 0.03), fv, { x: -0.12, y: 0.3, z: 0.43 });
      } else {
        // Shelving: four shelves on posts, boxes on them.
        for (const y of [0.15, 0.65, 1.15, 1.65]) {
          batch.add('shelf', new THREE.BoxGeometry(1.8, 0.03, 0.6), fv, { y });
          for (let b = 0; b < 3; b++) if (r() < 0.75) batch.add('box', new THREE.BoxGeometry(0.35 + r() * 0.2, 0.2 + r() * 0.2, 0.4), fv, { x: -0.6 + b * 0.6, y: y + 0.13, z: (r() - 0.5) * 0.1 });
        }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) batch.add('shelf', new THREE.BoxGeometry(0.04, 1.95, 0.04), fv, { x: sx * 0.88, y: 0.975, z: sz * 0.28 });
      }
    }
    covers.push({ x: it.x, z: it.z, type: ch });
  }
  group.add(extras);
  const propMeshes = batch.build(M, group, 'props');
  const trimMeshes = trim.build(M, group, 'trim');

  // ---- signs, damp, blood --------------------------------------------------------------------------------------
  const decalGroup = new THREE.Group();
  group.add(decalGroup);
  const signs = [
    [3, 6, 'OFFICE'], [11, 6, 'STAFF ROOM'], [17, 6, 'PHARMACY'], [25, 6, 'LINEN'], [33, 6, 'SIDE ROOM'], [40, 6, 'STAIRS', '#1d7a46'],
    [3, 8, 'MINORS'], [12, 8, 'MINORS'], [17, 8, 'WARD 7'], [35, 8, 'WARD 7'], [17, 20, 'WARD 7'], [35, 20, 'WARD 7'],
    [6, 14, 'WAITING'], [11, 14, 'WAITING'], [37, 14, 'ICU →'], [39, 11, 'ICU'], [39, 17, 'X-RAY'],
    [17, 23, 'ROOM 1'], [24, 23, 'RADIOLOGY'], [31, 23, 'ROOM 3'], [39, 23, 'STORES']
  ];
  const signMats = new Map();
  for (const [x, z, text, bg] of signs) {
    if (!grid.cells[z]) continue;
    const d = doorways.find((q) => q.x === x && q.z === z);
    if (!d) continue;
    const key = `${text}|${bg ?? ''}`;
    if (!signMats.has(key)) {
      const t = signTexture(text, { bg: bg ?? '#1d4f8f' });
      signMats.set(key, new THREE.MeshPhongMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25, shininess: 30 }));
    }
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), signMats.get(key));
      const nx = d.alongX ? 0 : side, nz = d.alongX ? side : 0;
      const c = toWorld(x, z);
      // Over the door, on both faces of the wall.
      m.position.set(c.x + nx * (CELL / 2 + 0.012), DOOR_H + 0.35, c.z + nz * (CELL / 2 + 0.012));
      m.rotation.y = Math.atan2(nx, nz);
      decalGroup.add(m);
    }
  }
  // The exit: green running-man sign and a glow.
  const exitTex = signTexture('EXIT', { bg: '#12884a' });
  const exitMat = new THREE.MeshBasicMaterial({ map: exitTex });
  // Tonight's damage on the walls (no damp, no mould: the building was fine yesterday), and fresh blood.
  const crackMats = [0, 1, 2].map((i) => new THREE.MeshPhongMaterial({ map: crackTexture(31 + i), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, shininess: 4 }));
  const smearMats = [0, 1, 2, 3].map((i) => new THREE.MeshPhongMaterial({ map: smearTexture(i % 2 ? 'hand' : 'streak', 11 + i), color: 0xffd8d8, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, shininess: 90, specular: 0x552222 }));
  const rr = rnd(99);
  for (const f of faces) {
    if (f.onto === '#') continue;
    const fr = faceFrame(f, 0.01);
    if (rr() < 0.1) {
      const size = 0.5 + rr() * 0.5;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), crackMats[Math.floor(rr() * crackMats.length)]);
      m.position.set(fr.x + (f.dz ? (rr() - 0.5) * 1.0 : 0), 0.5 + rr() * 1.3, fr.z + (f.dx ? (rr() - 0.5) * 1.0 : 0));
      m.rotation.y = fr.yaw;
      m.rotateZ(rr() * 6);
      decalGroup.add(m);
    }
    if (rr() < 0.07) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), smearMats[Math.floor(rr() * smearMats.length)]);
      m.position.set(fr.x + (f.dz ? (rr() - 0.5) * 0.8 : 0) + f.dx * 0.004, 0.7 + rr() * 0.8, fr.z + (f.dx ? (rr() - 0.5) * 0.8 : 0) + f.dz * 0.004);
      m.rotation.y = fr.yaw;
      decalGroup.add(m);
    }
  }

  // Papers dropped in the panic: notes, forms, a chart.
  {
    const paperMats = [0, 1, 2, 3].map((i) => new THREE.MeshPhongMaterial({ map: paperTexture(51 + i), polygonOffset: true, polygonOffsetFactor: -1, shininess: 5 }));
    const sheet = new THREE.PlaneGeometry(0.21, 0.297);
    sheet.rotateX(-Math.PI / 2);
    for (let z = 0; z < grid.h; z++)
      for (let x = 0; x < grid.w; x++) {
        if (!walkable(grid, x, z) || rr() > 0.12) continue;
        const { x: wx, z: wz } = toWorld(x, z);
        const n = 1 + Math.floor(rr() * 3);
        for (let i = 0; i < n; i++) {
          const m = new THREE.Mesh(sheet, paperMats[Math.floor(rr() * paperMats.length)]);
          m.position.set(wx + (rr() - 0.5) * 1.6, 0.004 + i * 0.001, wz + (rr() - 0.5) * 1.6);
          m.rotation.y = rr() * 6;
          decalGroup.add(m);
        }
      }
  }

  // ---- the exit ---------------------------------------------------------------------------------------------------
  if (grid.exit) {
    const { x: wx, z: wz } = toWorld(grid.exit.x, grid.exit.z);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.3), exitMat);
    sign.position.set(wx, 2.6, wz);
    group.add(sign);
    const glow = new THREE.PointLight(0x3ddc84, 6, 8, 2);
    glow.position.set(wx, 2.4, wz);
    group.add(glow);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.25 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(wx, 0.01, wz);
    group.add(pad);
    // Stairs going up behind the sign.
    for (let i = 0; i < 6; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18 * (i + 1), 0.3), M.darkSteel);
      step.position.set(wx + 1.6, 0.09 * (i + 1), wz - 0.8 + i * 0.3);
      group.add(step);
    }
  }

  // ---- lights -------------------------------------------------------------------------------------------------
  // Ceiling panels on a grid, most dead; the ones over a real light glow. One flickers.
  const LIT = grid.lights ?? LIGHTS;
  const lit = lite ? LIT.slice(0, 2) : LIT.slice(0, 10);
  const lights = [];
  const panelOn = new THREE.MeshBasicMaterial({ color: 0xf4f7ec });
  const panelDim = new THREE.MeshPhongMaterial({ color: 0x8a8f8c, emissive: 0x1d2020, shininess: 60 });
  const panelFlicker = new THREE.MeshBasicMaterial({ color: 0xf4f7ec });
  const panelGeo = new THREE.BoxGeometry(1.2, 0.03, 0.6);
  const panels = [];
  // Round 4, the sandbox (playtest: "as atmospheric and scary as possible"): the corridor behind the doors is on the
  // emergency lighting (red, pulsing slowly: seen through the portholes and when the doors swing); a second panel in
  // the hall is dying (on, then out in stuttering bursts, buzzing); the rest a little dimmer.
  const sandboxLit = !!grid.lights;
  const emergency = [], dying = [];
  for (const [i, [x, z]] of lit.entries()) {
    const { x: wx, z: wz } = toWorld(x, z);
    const red = sandboxLit && z <= 1;
    const light = new THREE.PointLight(red ? 0xff2614 : 0xe3ecdc, red ? 9 : sandboxLit ? 13 : 16, red ? 12 : 15, 1.6);
    light.position.set(wx, WALL_H - 0.35, wz);
    group.add(light);
    lights.push(light);
    const dies = sandboxLit && i === 4;
    const mat = red ? new THREE.MeshBasicMaterial({ color: 0xff3a22 }) : i === 2 ? panelFlicker : dies ? new THREE.MeshBasicMaterial({ color: 0xf4f7ec }) : panelOn;
    const panel = new THREE.Mesh(red ? new THREE.BoxGeometry(0.5, 0.12, 0.2) : panelGeo, mat);
    panel.position.set(wx, WALL_H - (red ? 0.08 : 0.015), wz);
    group.add(panel);
    if (red) emergency.push({ light, mat, phase: i });
    if (dies) dying.push({ light, mat, on: true, next: 4, burst: 0 });
  }
  const dead = new Batch();
  for (let z = 0; z < grid.h; z++)
    for (let x = 0; x < grid.w; x++) {
      if (!walkable(grid, x, z, { throughCover: true }) || (x + z) % 3 !== 0) continue;
      if (lit.some(([lx, lz]) => Math.abs(lx - x) + Math.abs(lz - z) < 2)) continue;
      const { x: wx, z: wz } = toWorld(x, z);
      dead.add('dim', panelGeo, { x: wx, z: wz }, { y: WALL_H - 0.015 });
    }
  panels.push(...dead.build({ dim: panelDim }, group, 'panels'));
  const flicker = lights[2] ?? null;

  scene.add(group);
  const solids = [walls, ...trimMeshes.filter((m) => m.name.endsWith('lintel')), ...propMeshes.filter((m) => /machine|shelf/.test(m.name))];
  const shootables = [walls, ...floors, ceiling, ...propMeshes, ...trimMeshes, ...leaves];
  const tmp = new THREE.Vector3();
  return {
    group, walls, floors, ceiling, doors, covers, panels, lights, flicker, curtains, solids, shootables,
    // `movers`: everyone who can push a door or a curtain ({ pos }).
    update(dt, t, movers = []) {
      if (flicker) {
        const on = !(Math.random() < 0.05 || (Math.sin(t * 1.3) > 0.93 && Math.random() < 0.5));
        flicker.intensity = on ? (sandboxLit ? 13 : 16) + Math.sin(t * 7) * 1.2 : 0.5;
        panelFlicker.color.setScalar(on ? 0.95 : 0.15);
      }
      for (const e of emergency) {
        const k = 0.55 + 0.45 * Math.sin(t * 1.6 + e.phase);
        e.light.intensity = 3 + 8 * k;
        e.mat.color.setRGB(0.35 + 0.65 * k, 0.06 + 0.12 * k, 0.04 + 0.08 * k);
      }
      // The dying panel: long stretches on (humming), then it stutters out, comes back, goes, sometimes for seconds.
      for (const d of dying) {
        d.next -= dt;
        if (d.next <= 0) {
          if (d.burst > 0) {
            d.burst--;
            d.on = !d.on;
            d.next = 0.04 + Math.random() * 0.14;
          } else if (d.on) {
            d.burst = 3 + Math.floor(Math.random() * 7);
            d.next = 0.05;
            this.onDying?.(d.light.position);
          } else {
            d.on = Math.random() < 0.75;
            d.next = d.on ? 4 + Math.random() * 9 : 1.5 + Math.random() * 3;
          }
        }
        d.light.intensity = d.on ? 13 : 0.2;
        d.mat.color.setScalar(d.on ? 0.95 : 0.12);
      }
      for (const d of doors) {
        if (d.type === 'locked') {
          const target = d.room?.open || d.room?.lost ? (d.room.lost ? -1.9 : -1.6) : 0;
          d.swing += (target - d.swing) * Math.min(1, dt * 4);
          d.hinge.rotation.y = d.swing;
          continue;
        }
        // Who is in the doorway pushes it open, away from the side they came from; nobody near, the springs shut it.
        let push = 0;
        for (const m of movers) {
          const lx = m.pos.x - d.fr.x, lz = m.pos.z - d.fr.z;
          const across = d.alongX ? lz : lx, alongD = d.alongX ? lx : lz;
          if (Math.abs(alongD) > d.open / 2 + 0.2 || Math.abs(across) > 1.15) continue;
          if (d.swing < 0.15) d.side = across > 0 ? 1 : -1;
          push = Math.max(push, 1 - Math.max(0, Math.abs(across) - 0.35) / 0.8);
        }
        const target = d.propped ? 1 : push;
        if (target > d.swing) d.swing += Math.min(target - d.swing, dt * 5);
        else {
          // A sprung leaf: swings back, overshoots a little, settles.
          d.vel += (-d.swing * 30 - d.vel * 5) * dt;
          d.swing = Math.max(-0.12, d.swing + d.vel * dt);
        }
        if (target > d.swing - 0.01) d.vel = 0;
        d.state.open = Math.abs(d.swing);
        const a = d.swing * 1.45 * d.side;
        d.left.rotation.y = a;
        d.right.rotation.y = -a;
      }
      for (const c of curtains) {
        let near = false;
        const w = toWorld(c.x, c.z);
        for (const m of movers) if (Math.abs(m.pos.x - w.x) < 1.25 && Math.abs(m.pos.z - w.z) < 1.25) near = true;
        c.drawn += ((near ? 1 : 0) - c.drawn) * Math.min(1, dt * (near ? 6 : 0.6));
        c.state.open = c.drawn;
        c.holder.scale.x = 1 - c.drawn * 0.72;
        c.cloth.rotation.y = Math.sin(t * 0.7 + c.phase) * 0.03;
      }
      return tmp;
    }
  };
}
