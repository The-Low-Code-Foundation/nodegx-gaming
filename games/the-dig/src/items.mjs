// What the hand holds, made the way Minecraft makes its held items: a small pixel drawing pushed out into a slab one
// pixel thick (or a little block, for rubble). The hand draws them on top of the world.
import * as THREE from 'three';
import { tileUV } from './blocks.mjs';

const C = (hex) => new THREE.Color(hex); // sRGB in, linear inside, as three's vertex colours want

// A drawing as rows of characters, each character a colour from the key ('.' is empty), into a pixel grid.
function sprite(rows, key, mirror = false) {
  if (mirror) rows = rows.map((r) => [...r].reverse().join(''));
  const h = rows.length, w = rows[0].length;
  const px = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(rows[y][x] === '.' ? null : C(key[rows[y][x]]));
  return { w, h, px };
}

// Pixels into a slab: a face front and back for each pixel, and an edge wherever a pixel has no neighbour.
// size: the edge of one pixel in metres; depth: the slab's thickness in pixels. Centred on the drawing.
export function extrude({ w, h, px }, size, depth = 1) {
  const pos = [], col = [], ind = [];
  const d = (depth * size) / 2;
  const quad = (a, b, c, e, color, f) => {
    const n = pos.length / 3;
    pos.push(...a, ...b, ...c, ...e);
    for (let k = 0; k < 4; k++) col.push(color.r * f, color.g * f, color.b * f);
    ind.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : px[x + y * w]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      if (!c) continue;
      const x0 = (x - w / 2) * size, x1 = x0 + size;
      const y1 = (h / 2 - y) * size, y0 = y1 - size;
      quad([x0, y0, d], [x1, y0, d], [x1, y1, d], [x0, y1, d], c, 1);
      quad([x1, y0, -d], [x0, y0, -d], [x0, y1, -d], [x1, y1, -d], c, 0.7);
      if (!at(x, y - 1)) quad([x0, y1, d], [x1, y1, d], [x1, y1, -d], [x0, y1, -d], c, 0.9);
      if (!at(x, y + 1)) quad([x0, y0, -d], [x1, y0, -d], [x1, y0, d], [x0, y0, d], c, 0.55);
      if (!at(x + 1, y)) quad([x1, y0, d], [x1, y0, -d], [x1, y1, -d], [x1, y1, d], c, 0.8);
      if (!at(x - 1, y)) quad([x0, y0, -d], [x0, y0, d], [x0, y1, d], [x0, y1, -d], c, 0.65);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ind);
  return g;
}

// Every material the hand uses, so the hand can light them all by the light where the player stands.
export const handMaterials = [];
const handMat = (o = {}) => {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, transparent: true, fog: false, side: THREE.DoubleSide, ...o });
  handMaterials.push(m);
  return m;
};
// The voxel models' material. Drawn into the very front of the depth range: nothing in the world comes between them
// and the eye, but their own boxes hide one another as they should (with no depth test at all, a back face drawn
// after a front one shows through it). lit: lit by the light where you stand, as the slabs are.
const voxMat = (o = {}, lit = true) => {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, fog: false, ...o });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  gl_Position.z = -gl_Position.w + 0.01 * (gl_Position.z + gl_Position.w);');
  };
  if (lit) handMaterials.push(m);
  return m;
};
const held = (geo, mat = handMat()) => {
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 999;
  m.frustumCulled = false;
  return m;
};


// Round 7: a flare, not a torch (the play-tester: "If we're from space … we're likely not using … wood fire torches … metal
// flares with white tips"): a gunmetal tube with a red band, a white-hot tip with a pale blue edge.
const TORCH = sprite([
  '................',
  '.......ww.......',
  '......wWWw......',
  '......wWWw......',
  '.......bb.......',
  '.......mn.......',
  '.......mn.......',
  '.......rr.......',
  '.......rR.......',
  '.......mn.......',
  '.......mn.......',
  '.......mn.......',
  '.......mn.......',
  '.......mn.......',
  '.......kk.......',
  '................'
], { w: '#d6f0ff', W: '#ffffff', b: '#8fd0ff', m: '#9aa2aa', n: '#5f666e', r: '#d0402c', R: '#9a2a1e', k: '#2e3238' });

// Things too chunky for a slab (the multitool, the grappling hook) are little voxel models instead: boxes in a grid
// of "voxels" (V metres each), shaded per face as Minecraft shades a block. [x0, y0, z0, x1, y1, z1, colour]: x to
// the right, y up, z towards you (the muzzle is at -z). A colour of 'glow' goes into the glow model, which takes the
// loaded ammo's colour and shines in the dark.
const V = 0.0105;
// The multitool, round 5: a chunky trooper's rifle (the play-tester: "a proper starship troopers style chunky futuristic
// gun"): a long gunmetal receiver in olive armour plates, the big boxy shroud with vents, a muzzle brake, a launcher
// tube under the shroud, a fat magazine, a holo sight. What glows takes the loaded ammo's colour: the strip down each
// side, the sight's lens, the magazine's counter and the muzzle.
const GUN = '#3d4349', DARK = '#262a2e', BLACK = '#18191c', OLIVE = '#5e6849', OLIVE_D = '#4b5339', STEEL = '#8a929a', HAZARD = '#d9a52b';
const TOOL_PARTS = [
  // The receiver, its glow strip, and the armour plates above and below the strip.
  [-3.4, -3, -12, 3.4, 4, 15, GUN],
  [-3.55, 0.6, -10, 3.55, 1.6, 11, 'glow'],
  [-3.65, 1.6, -11, 3.65, 3.6, 12, OLIVE],
  [-3.65, -2.6, -11, 3.65, 0.6, 5, OLIVE],
  [3.45, 1.9, -1, 3.75, 3.3, 3.5, BLACK], // the ejection port
  // The rail along the top, toothed.
  [-2, 4, -11, 2, 5, 13, DARK],
  ...Array.from({ length: 8 }, (_, k) => [-2.25, 5, -10 + k * 3, 2.25, 5.7, -8.8 + k * 3, BLACK]),
  // The holo sight: a hood on two posts, its lens glowing.
  [-2.5, 5, 3, -1.7, 10, 7.5, DARK],
  [1.7, 5, 3, 2.5, 10, 7.5, DARK],
  [-2.5, 9.3, 3, 2.5, 10.2, 7.5, DARK],
  [-1.7, 5.7, 5, 1.7, 9.3, 5.4, 'glow'],
  // The shroud: the big boxy front, olive, with a lip along the top, black vents down the sides and a hazard band.
  [-3.3, -3.4, -32, 3.3, 3.8, -12, OLIVE_D],
  [-3.45, 2.7, -31.5, 3.45, 4.1, -12.5, OLIVE],
  ...Array.from({ length: 4 }, (_, k) => [-3.45, -2, -29.5 + k * 4, 3.45, 1.8, -27.8 + k * 4, BLACK]),
  [-3.5, -3.5, -14.5, 3.5, 3.9, -13.2, HAZARD],
  // The barrel out of the shroud, the muzzle brake (slotted, the slots glowing), the muzzle.
  [-1.3, -0.4, -40, 1.3, 2.2, -32, DARK],
  [-2.1, -1.3, -44, 2.1, 3.1, -39, BLACK],
  [-2.2, 0.2, -42.8, 2.2, 1.6, -41.6, 'glow'],
  [-2.2, 0.2, -40.8, 2.2, 1.6, -39.8, 'glow'],
  [-0.8, 0.1, -44.3, 0.8, 1.7, -44, 'glow'],
  // The launcher tube under the shroud, its front ring, and the vertical foregrip under it.
  [-1.8, -6.8, -30, 1.8, -3.4, -14, GUN],
  [-2.15, -7.2, -31.2, 2.15, -3.2, -29, BLACK],
  [-1.3, -12.5, -23, 1.3, -6.8, -19, BLACK],
  [-1.45, -12.9, -23.3, 1.45, -12.3, -18.7, DARK],
  // The magazine: a fat box ahead of the trigger, its round counter glowing.
  [-2.3, -13, -9, 2.3, -3, -2, GUN],
  [-2.45, -13.6, -9.4, 2.45, -12.6, -1.6, BLACK],
  [-2.4, -10.8, -7.6, 2.4, -8.4, -3.4, 'glow'],
  // The trigger guard and the trigger; the pistol grip, raked back in two steps.
  [-0.6, -6.2, 0, 0.6, -5.2, 6.2, BLACK],
  [-0.6, -6.2, 5.2, 0.6, -3, 6.2, BLACK],
  [-0.3, -5.2, 1.6, 0.3, -3, 2.4, STEEL],
  [-1.7, -8.4, 4.5, 1.7, -3, 9.5, BLACK],
  [-1.7, -13.5, 6.5, 1.7, -8.4, 11.5, BLACK],
  // The stock and its pad.
  [-2.6, -4.6, 15, 2.6, 3.2, 28, GUN],
  [-2.85, -6.2, 27.5, 2.85, 3.7, 30.5, BLACK]
];
// The cutter (round 7, in place of the pick; the play-tester: "Make it more like the digging tool in No Man's Sky maybe, like a
// pistol"): a chunky white-plated pistol with orange flashes, two prongs out front and a lens between them that glows
// (and a coil along the top) while it cuts. The beam leaves from the lens.
const PLATE = '#d9dde0', PLATE_D = '#aeb5bb', FLASH = '#e3782a', CORE = '#454b53', INK = '#202327';
const CUTTER_PARTS = [
  // The housing your hand is behind: white plates, an orange panel down each side.
  [-3.2, -2.6, 0, 3.2, 4, 8, PLATE],
  [-3.35, -1, 1, 3.35, 1.6, 7, FLASH],
  // The spine along the top, and its coil, glowing.
  [-1.4, 4, -3, 1.4, 5.6, 7.5, PLATE_D],
  [-0.8, 5.6, -2, 0.8, 6.3, 6.5, 'glow'],
  // The back: cooling fins.
  [-2.8, -2, 8, 2.8, 3.4, 10.5, INK],
  [-3, -0.8, 8.5, 3, -0.2, 10, PLATE_D],
  [-3, 1.2, 8.5, 3, 1.8, 10, PLATE_D],
  // The barrel, dark, and the emitter: two white prongs with orange tips, the lens between them.
  [-2.2, -1.6, -8, 2.2, 3, 0, CORE],
  [-3, -2.2, -13, -1.2, 3.4, -7, PLATE],
  [1.2, -2.2, -13, 3, 3.4, -7, PLATE],
  [-3.1, -2.4, -14.5, -1.1, 3.6, -13, FLASH],
  [1.1, -2.4, -14.5, 3.1, 3.6, -13, FLASH],
  [-1.2, -0.6, -10.5, 1.2, 2.2, -8, INK],
  [-0.9, -0.3, -11.6, 0.9, 1.9, -10.4, 'glow'],
  // The trigger and its guard; the grip, raked back, with an orange heel.
  [-0.5, -5.4, -2, 0.5, -4.4, 2, INK],
  [-0.3, -4.4, -0.6, 0.3, -2.6, 0.2, PLATE_D],
  [-1.6, -9, 1.5, 1.6, -2.6, 6.5, INK],
  [-1.6, -12.5, 3, 1.6, -9, 8, INK],
  [-1.75, -13.1, 2.6, 1.75, -12.4, 8.4, FLASH]
];

// The grappling hook: a stubby dark launcher with yellow bands, a drum of rope on its right side, and the claw on the
// front (the claw is its own model: it leaves with the throw and comes back on the rope).
const HOOK_PARTS = [
  [-2.6, -2.2, -4, 2.6, 2.6, 10, '#3a4048'],
  [-2.7, 0, -3, 2.7, 1, 9, '#e0b030'],
  [-1.7, -1.2, -12, 1.7, 1.8, -4, '#6b737c'],
  [-2.2, -1.7, -7, 2.2, 2.3, -5.5, '#e0b030'],
  [-2.2, -1.7, -11.5, 2.2, 2.3, -10, '#e0b030'],
  // The drum: the rope wound round its core, between two flanges.
  [2.6, -2, 0.5, 4.8, 2.4, 5.5, '#c8b48a'],
  [2.6, -2.8, 0, 5.2, 3.2, 0.6, '#e0b030'],
  [2.6, -2.8, 5.4, 5.2, 3.2, 6, '#e0b030'],
  // The grip and the guard.
  [-1.5, -9.5, 5, 1.5, -2.2, 9, '#2a2d33'],
  [-0.5, -4.5, 1, 0.5, -2.2, 5, '#2a2d33'],
  // A little lamp on top, lit when the hook can reach.
  [-0.8, 2.6, 6, 0.8, 3.4, 8, 'glow']
];
const CLAW_PARTS = [
  [-0.6, -0.6, -4, 0.6, 0.6, 0, '#c0c6cc'],
  [-1.1, -1.1, -5, 1.1, 1.1, -4, '#9aa3ad'],
  // Four prongs, bent back towards you like an anchor's.
  [-0.4, 1.1, -5, 0.4, 3.2, -4, '#c0c6cc'], [-0.4, 2.4, -4, 0.4, 3.2, -2, '#e6e9ec'],
  [-0.4, -3.2, -5, 0.4, -1.1, -4, '#c0c6cc'], [-0.4, -3.2, -4, 0.4, -2.4, -2, '#e6e9ec'],
  [1.1, -0.4, -5, 3.2, 0.4, -4, '#c0c6cc'], [2.4, -0.4, -4, 3.2, 0.4, -2, '#e6e9ec'],
  [-3.2, -0.4, -5, -1.1, 0.4, -4, '#c0c6cc'], [-3.2, -0.4, -4, -2.4, 0.4, -2, '#e6e9ec']
];

// Boxes into one geometry with vertex colours, faces shaded as Minecraft shades a block's sides. which: 'body' (every
// part but the glow), 'glow' (only the glow, in white, for the glow material to colour).
const FACE_SHADE = [0.8, 0.62, 1, 0.5, 0.9, 0.7]; // BoxGeometry's order: +x, -x, +y, -y, +z, -z
function voxels(parts, which = 'body', size = V) {
  const geos = [];
  for (const [x0, y0, z0, x1, y1, z1, col] of parts) {
    if ((col === 'glow') !== (which === 'glow')) continue;
    const g = new THREE.BoxGeometry((x1 - x0) * size, (y1 - y0) * size, (z1 - z0) * size);
    g.translate(((x0 + x1) / 2) * size, ((y0 + y1) / 2) * size, ((z0 + z1) / 2) * size);
    const c = col === 'glow' ? new THREE.Color(1, 1, 1) : C(col);
    const cols = [];
    for (let f = 0; f < 6; f++) {
      const k = col === 'glow' ? 0.75 + FACE_SHADE[f] * 0.25 : FACE_SHADE[f];
      for (let v = 0; v < 4; v++) cols.push(c.r * k, c.g * k, c.b * k);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geos.push(g.toNonIndexed());
  }
  return mergeGeometries(geos);
}
function mergeGeometries(geos) {
  const pos = [], col = [];
  for (const g of geos) {
    pos.push(...g.attributes.position.array);
    col.push(...g.attributes.color.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
// A thrown torch, out in the world: the held torch's pixels, full size, burning bright whatever the light.
export function makeThrownTorch() {
  const m = new THREE.Mesh(extrude(TORCH, 0.04, 2), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  const g = new THREE.Group();
  m.position.y = -0.1;
  g.add(m);
  return g;
}

// The claw out in the world, on the end of the rope: the same boxes, bigger, lit like the world is.
export function makeClaw() {
  return new THREE.Mesh(voxels(CLAW_PARTS, 'body', 0.03), new THREE.MeshBasicMaterial({ vertexColors: true }));
}

// The muzzle flash: a white-hot star with a long spike forward, drawn once into a canvas and shown on crossed quads.
function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  rad.addColorStop(0, 'rgba(255,255,240,1)');
  rad.addColorStop(0.25, 'rgba(255,220,140,0.9)');
  rad.addColorStop(0.6, 'rgba(255,140,40,0.35)');
  rad.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 64, 64);
  // Spikes.
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 6; k++) {
    g.save();
    g.translate(32, 32);
    g.rotate((k / 6) * Math.PI * 2 + 0.3);
    const lg = g.createLinearGradient(0, 0, 30, 0);
    lg.addColorStop(0, 'rgba(255,240,200,0.9)');
    lg.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(0, -3);
    g.lineTo(30, 0);
    g.lineTo(0, 3);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeItems(atlas) {
  const PX = 0.021; // a pixel, in metres, held at arm's length
  // The cutter (it keeps the pick's slot and name inside the code: 'pick').
  const pick = new THREE.Group();
  const cutterGlow = voxMat({ color: 0xffb860 }, false);
  pick.add(held(voxels(CUTTER_PARTS), voxMat()));
  const lens = held(voxels(CUTTER_PARTS, 'glow'), cutterGlow);
  lens.renderOrder = 1000;
  pick.add(lens);
  pick.scale.setScalar(0.95);
  pick.position.set(0.02, 0.0, -0.1);
  pick.rotation.set(0.04, 0.14, 0.04);
  const cutterNose = new THREE.Object3D();
  cutterNose.position.set(0, 0.8 * V, -12 * V);
  pick.add(cutterNose);
  // The torches ride in the other hand, low on the left (the hand puts this one on the camera, not on the pick).
  const torch = new THREE.Group();
  const torchMesh = held(extrude(TORCH, PX * 0.55));
  torchMesh.rotation.set(0.15, 0.45, 0.12);
  torch.add(torchMesh);
  torch.position.set(-0.36, -0.3, -0.62);

  // Rubble: a little cobble block, textured like the one in the world.
  const rubble = new THREE.Group();
  const [u0, v0, u1, v1] = tileUV('cobble');
  const cube = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const uv = cube.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
  const shades = [0.6, 0.6, 1, 0.5, 0.8, 0.8];
  const colors = [];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) colors.push(shades[f], shades[f], shades[f]);
  cube.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const tex = atlas.clone();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const cobbleMat = handMat({ map: tex });
  rubble.add(held(cube, cobbleMat));

  // The multitool: a voxel model pointing into the screen, its glass glowing the colour of what is loaded.
  const rifle = new THREE.Group();
  const glowMat = voxMat({ color: 0x6ad8ff }, false);
  const toolMesh = held(voxels(TOOL_PARTS), voxMat());
  const toolGlow = held(voxels(TOOL_PARTS, 'glow'), glowMat);
  toolGlow.renderOrder = 1000;
  rifle.add(toolMesh, toolGlow);
  // The flash: a star facing you, and two long quads crossing along the barrel (a jet of flame seen from behind).
  const flashMat = new THREE.MeshBasicMaterial({ map: flashTexture(), depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
  const flash = new THREE.Group();
  const star = held(new THREE.PlaneGeometry(0.2, 0.2), flashMat);
  const jet = new THREE.PlaneGeometry(0.1, 0.32);
  jet.rotateX(Math.PI / 2);
  jet.translate(0, 0, -0.1);
  const jetA = held(jet, flashMat), jetB = held(jet.clone().rotateZ(Math.PI / 2), flashMat);
  for (const m of [star, jetA, jetB]) m.renderOrder = 1001;
  flash.add(star, jetA, jetB);
  flash.position.set(0, 0.9 * V, -45 * V);
  flash.visible = false;
  rifle.add(flash);
  // Where the spent cases fly out (the port on the right side).
  const port = new THREE.Object3D();
  port.position.set(3.8 * V, 2.6 * V, 1.2 * V);
  rifle.add(port);

  // The grappling hook: the launcher, and the claw on its nose (hidden while the claw is out on the rope). The lamp on
  // top lights when the hook can reach what the crosshair is on.
  const hook = new THREE.Group();
  const lampMat = voxMat({ color: 0x555555 }, false);
  hook.add(held(voxels(HOOK_PARTS), voxMat()));
  const lamp = held(voxels(HOOK_PARTS, 'glow'), lampMat);
  lamp.renderOrder = 1000;
  hook.add(lamp);
  const claw = held(voxels(CLAW_PARTS), voxMat());
  claw.position.z = -12 * V;
  hook.add(claw);
  // Where the rope leaves from.
  const nose = new THREE.Object3D();
  nose.position.set(0, 0.3 * V, -13 * V);
  hook.add(nose);

  // Arms, Minecraft's: a skin-coloured block with the sleeve near the shoulder, from the fist to off the screen.
  // Each is placed from where the hand grips to a point off the bottom of the screen (in the held thing's frame,
  // so it swings with it).
  const arm = (grip, toward, parent) => {
    const a = makeArm();
    a.position.set(...grip);
    a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...toward).sub(new THREE.Vector3(...grip)).normalize());
    parent.add(a);
    return a;
  };
  arm([0.0, -8 * V, 4.5 * V], [0.3, -0.6, 0.3], pick);
  arm([0.05, -0.1, 0.05], [0.12, -0.75, 0.3], rubble);
  arm([0.0, -10 * V, 8.5 * V], [0.32, -0.62, 0.3], rifle);
  arm([0.0, -9.5 * V, -21 * V], [-0.6, -0.55, 0.05], rifle);
  arm([0.0, -6.5 * V, 7 * V], [0.3, -0.6, 0.3], hook);
  // Round 5: life size, as an FPS holds a rifle (round 4 held them at 0.7 and 0.65 of it, and the play-tester found them
  // "strangely small"): low on the right, the stock back past the bottom of the screen, turned in towards the
  // crosshair so the side shows.
  rifle.scale.setScalar(1);
  rifle.position.set(-0.04, -0.01, -0.2);
  rifle.rotation.set(0.03, 0.16, 0.05);
  hook.scale.setScalar(1.15);
  hook.position.set(-0.03, 0.04, -0.1);
  hook.rotation.set(0.03, 0.2, 0.06);
  arm([0.0, -0.06, 0.0], [-0.32, -0.55, 0.4], torch);
  return { pick, torch, rubble, rifle, flash, port, glowMat, hook, claw, nose, lampMat, cobbleMat, cutterGlow, cutterNose };
}

const SKIN = C('#c48a64'), SKIN_DARK = C('#a8714f'), SLEEVE = C('#3c8fb0');
function makeArm() {
  const g = new THREE.Group();
  const W = 0.095;
  // Faces in BoxGeometry's order (+x, -x, +y, -y, +z, -z), shaded as Minecraft shades a block's sides.
  const shades = [0.8, 0.62, 1, 0.5, 0.9, 0.7];
  const part = (len, y0, color, endColor) => {
    const geo = new THREE.BoxGeometry(W, len, W);
    geo.translate(0, y0 + len / 2, 0);
    const col = [];
    for (let f = 0; f < 6; f++) {
      const c = f === 3 && endColor ? endColor : color;
      for (let k = 0; k < 4; k++) col.push(c.r * shades[f], c.g * shades[f], c.b * shades[f]);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // One-sided: with no depth test, a box drawn from both sides shows its back through its front.
    const m = held(geo, handMat({ side: THREE.FrontSide }));
    m.renderOrder = 998;
    g.add(m);
  };
  part(0.3, -0.03, SKIN, SKIN_DARK);
  part(0.26, 0.27, SLEEVE);
  return g;
}

// The hotbar's pictures, drawn from the same pixels and boxes as the held things: [the cutter (with a flare), rubble, the
// multitool, the grappling hook].
export function itemIcons(atlas) {
  const draw = ({ w, h, px }, g, ox, oy, scale) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = px[x + y * w];
        if (!c) continue;
        g.fillStyle = `#${c.getHexString(THREE.SRGBColorSpace)}`;
        g.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
  };
  const canvas = (fn) => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    fn(g);
    return c.toDataURL();
  };
  // Rubble as Minecraft shows a block: a little cube seen from above, three faces shaded.
  const cube = (g) => {
    const img = atlas.image;
    const [u0, , , v1] = tileUV('cobble');
    const sx = Math.round(u0 * img.width), sy = Math.round((1 - v1) * img.height);
    const face = (a, b, c, d, e, f, shade) => {
      g.save();
      g.setTransform(a, b, c, d, e, f);
      g.drawImage(img, sx, sy, 16, 16, 0, 0, 16, 16);
      g.fillStyle = `rgba(0,0,0,${1 - shade})`;
      g.fillRect(0, 0, 16, 16);
      g.restore();
    };
    face(0.85, 0.42, -0.85, 0.42, 16, 2, 1);
    face(0.85, 0.42, 0, 0.9, 2.4, 8.8, 0.8);
    face(0.85, -0.42, 0, 0.9, 16, 15.5, 0.6);
  };
  // A voxel model seen from its right side, muzzle to the right, the far boxes drawn first.
  const side = (parts, glow) => (g) => {
    let z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of parts) [z0, z1, y0, y1] = [Math.min(z0, p[2]), Math.max(z1, p[5]), Math.min(y0, p[1]), Math.max(y1, p[4])];
    const k = Math.min(30 / (z1 - z0), 30 / (y1 - y0));
    const ox = 16 - ((z1 - z0) * k) / 2, oy = 16 - ((y1 - y0) * k) / 2;
    for (const [, py0, pz0, x1, py1, pz1, col] of [...parts].sort((a, b) => a[3] - b[3])) {
      const c = C(col === 'glow' ? glow : col).multiplyScalar(col === 'glow' ? 1 : 0.85);
      g.fillStyle = `#${c.getHexString(THREE.SRGBColorSpace)}`;
      g.fillRect(ox + (z1 - pz1) * k, oy + (y1 - py1) * k, Math.max(1, (pz1 - pz0) * k), Math.max(1, (py1 - py0) * k));
    }
  };
  return [
    canvas((g) => { side(CUTTER_PARTS, '#ffb860')(g); draw(TORCH, g, -3, 14, 1.1); }),
    canvas(cube),
    canvas(side(TOOL_PARTS, '#6ad8ff')),
    canvas(side([...HOOK_PARTS, ...CLAW_PARTS.map(([a, b, c, d, e, f, col]) => [a, b, c - 12, d, e, f - 12, col])], '#ffd27a'))
  ];
}

// Minecraft's hearts (9 × 9): full, half, empty.
export function heartIcons() {
  const rows = ['.##...##.', '#rr#.#rw#', '#rrr#rrw#', '#rrrrrrr#', '#rrrrrrr#', '.#rrrrr#.', '..#rrr#..', '...#r#...', '....#....'];
  const make = (fill) => {
    const c = document.createElement('canvas');
    c.width = c.height = 9;
    const g = c.getContext('2d');
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        const full = fill === 'full' || (fill === 'half' && x < 4);
        g.fillStyle = ch === '#' ? '#1a0606' : !full ? '#3a1010' : ch === 'w' ? '#ffd0d0' : '#e2241c';
        g.fillRect(x, y, 1, 1);
      })
    );
    return c.toDataURL();
  };
  return { full: make('full'), half: make('half'), empty: make('empty') };
}
