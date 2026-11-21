// The first floor (round 3): up the Grand Hall's staircase once the Ballroom is won (its thorns wither). The Starlit
// Landing is the hub: a long gallery under a ceiling painted with stars, the stairwell coming up through its floor at
// one end, and three doors: the Nursery (Captain Buttons's Toy Box), the Painting Studio (Madame Palette's colouring)
// and, at the far end, the Royal Bedchamber (great-aunt's Diary and her star map).
// Built from castle.mjs's parts (`kit`); the places add themselves with addPlaces / addRooms.
import * as THREE from 'three';
import { kit, addPlaces, addRooms } from './castle.mjs';
import { canvasTexture, glow } from './look.mjs';
import { makeSoldier, makeDiary } from './friends.mjs';

const { TAU, rand, tex, Mood, commonMats, shell, windowOn, chandelier, cobwebs, motes, lighting, sconce, mist, box, sphere, cyl, potionTable, roseUrn, makeHub, marble, parquet, damask, runner, portrait } = kit;

// A ceiling of painted stars: deep blue, gold stars and a few swirls. Dim while cursed; the stars glow once won.
const starCeiling = () =>
  tex('starCeiling', () =>
    canvasTexture(512, 512, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 20, w / 2, w / 2, w * 0.75);
      gr.addColorStop(0, '#2a3a8a');
      gr.addColorStop(1, '#141a4a');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
      for (let i = 0; i < 90; i++) {
        const x = rand() * w, y = rand() * w, r = 1.5 + rand() * (i < 12 ? 9 : 3.5);
        g.fillStyle = i % 5 ? '#ffe7a0' : '#ffffff';
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * TAU - Math.PI / 2, rr = k % 2 ? r * 0.42 : r;
          k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.fill();
      }
      g.strokeStyle = 'rgba(255, 220, 150, 0.35)';
      g.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(rand() * w, rand() * w, 30 + rand() * 50, rand() * 3, rand() * 3 + 2);
        g.stroke();
      }
    }, { repeat: [2, 5] })
  );
function starryPlane(mood, w, d, y, repeat) {
  const t = starCeiling().clone();
  t.repeat.set(...repeat);
  t.needsUpdate = true;
  const m = mood.mat({ dark: 0x2a2e50, bright: 0xffffff, map: t, emissive: [0x0a0c20, 0xffffff], ei: [0.6, 0.55], roughness: 0.9 });
  m.emissiveMap = t;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), m);
  p.position.y = y;
  return p;
}
function frame(M, mood, parent, { x, y, z, ry, w, h, map, eyes = null }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  box(w + 0.2, h + 0.2, 0.08, M.gold, 0, 0, 0, g);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mood.mat({ dark: 0x3a3a48, bright: 0xffffff, map, roughness: 0.9 }));
  pic.position.z = 0.05;
  g.add(pic);
  if (eyes) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.18, h * 0.03), mood.mat({ dark: 0x000000, bright: 0x000000, emissive: [eyes, 0x000000], ei: [2.4, 0], transparent: true, opacity: [1, 0] }));
    e.position.set(0, h * 0.05, 0.06);
    g.add(e);
  }
  parent.add(g);
  return { g, pic };
}

// ── The Starlit Landing ────────────────────────────────────────────────────────────────────────────────────────────
const LW = 8, LD = 20, LH = 5.5;
const HOLE = { x: 0, z: 5.6, w: 3.0, d: 3.6 };
function buildLanding() {
  const scene = new THREE.Scene();
  const mood = new Mood(scene);
  const M = commonMats(mood);
  const W = LW, D = LD, H = LH;
  mood.fog({ color: 0x0a0a1c, density: 0.045 }, { color: 0xd8c8c4, density: 0.006 });
  mood.env = [0.12, 0.3];
  scene.add(shell(mood, M, { w: W, d: D, h: H, floorMap: marble(), floorDark: 0x5a5872, floorBright: 0xe2dcd8, wallMap: damask('#c8d4f4', '#e4ecff', 'starblue'), wallDark: 0x2e3044, wallBright: 0xdcdcec, hole: HOLE }));
  scene.add(starryPlane(mood, W, D, H - 0.02, [2, 5]));
  lighting(mood, { sunFrom: [4, 8, -3], shadowBox: 10, ghost: [0, 2, -3] });
  const blockers = [], updates = [];
  // The runner, from the stairwell to the Bedchamber's doors.
  const runnerMat = mood.mat({ dark: 0x3a3a5a, bright: 0xe8eaff, map: runner(), roughness: 0.95 });
  const carpetLen = D / 2 + HOLE.z - HOLE.d / 2 - 0.4;
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.8, carpetLen).rotateX(-Math.PI / 2), runnerMat);
  carpet.position.set(0, 0.006, -D / 2 + 0.2 + carpetLen / 2);
  carpet.receiveShadow = true;
  scene.add(carpet);
  // The stairwell: twelve steps down towards +z into warm light, its walls, a balustrade round three sides.
  const stepMat = mood.mat({ dark: 0x4a4c5a, bright: 0xf2ece2, roughness: 0.5 });
  const red = mood.mat({ dark: 0x3a1a2a, bright: 0xc4204e, roughness: 0.9 });
  const z0 = HOLE.z - HOLE.d / 2;
  for (let i = 0; i < 12; i++) {
    const z = z0 + 0.3 * (i + 0.5), top = -0.3 * (i + 1);
    box(HOLE.w, 0.3, 0.31, stepMat, 0, top - 0.15, z, scene);
    box(1.8, 0.02, 0.3, red, 0, top + 0.01, z, scene);
  }
  const wellMat = mood.mat({ dark: 0x2a2a3a, bright: 0xd8ccbc, roughness: 0.9 });
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(HOLE.d, 4), wellMat);
    side.position.set(s * HOLE.w / 2, -2, HOLE.z);
    side.rotation.y = -s * Math.PI / 2;
    scene.add(side);
  }
  const end = new THREE.Mesh(new THREE.PlaneGeometry(HOLE.w, 4), wellMat);
  end.position.set(0, -2, HOLE.z + HOLE.d / 2);
  end.rotation.y = Math.PI;
  scene.add(end);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(HOLE.w, HOLE.d).rotateX(Math.PI / 2), wellMat);
  under.position.set(0, -0.31, HOLE.z);
  void under;
  // The Hall's light coming up the stairs: a warm glow at the bottom (violet in the dark).
  const below = mood.light(new THREE.PointLight(0xffc27a, 1, 7, 1.4), { color: 0x9a7aff, intensity: 4 }, { color: 0xffc98a, intensity: 6 });
  below.position.set(0, -2.6, HOLE.z + 0.8);
  for (const [x, z, len, ry] of [[-HOLE.w / 2 - 0.08, HOLE.z, HOLE.d + 0.16, 0], [HOLE.w / 2 + 0.08, HOLE.z, HOLE.d + 0.16, 0], [0, HOLE.z + HOLE.d / 2 + 0.08, HOLE.w + 0.16, Math.PI / 2]]) {
    const rail = box(0.12, 0.08, len, M.darkWood, x, 0.95, z, scene);
    rail.rotation.y = ry;
    for (let k = -len / 2 + 0.15; k < len / 2; k += 0.32) {
      const bx = ry ? x + k : x, bz = ry ? z : z + k;
      cyl(0.035, 0.045, 0.9, M.cream, bx, 0.45, bz, scene, 6);
    }
  }
  for (const s of [-1, 1]) {
    const newel = new THREE.Group();
    newel.position.set(s * (HOLE.w / 2 + 0.08), 0, z0 - 0.05);
    box(0.24, 1.15, 0.24, M.cream, 0, 0.575, 0, newel);
    box(0.32, 0.08, 0.32, M.gold, 0, 1.17, 0, newel);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    globe.position.y = 1.36;
    newel.add(globe);
    const halo = glow(0xffffff, 0.8, 1);
    halo.position.y = 1.36;
    newel.add(halo);
    const witch = new THREE.Color(0x4dffc0), warm = new THREE.Color(0xffd08a);
    mood.on((f) => {
      globe.material.color.copy(witch).lerp(warm, f).multiplyScalar(1.6 + f * 0.6);
      halo.material.color.copy(witch).lerp(warm, f).multiplyScalar(0.9 - f * 0.3);
    });
    scene.add(newel);
  }
  blockers.push({ minX: -HOLE.w / 2 - 0.2, maxX: HOLE.w / 2 + 0.2, minZ: z0 - 0.15, maxZ: HOLE.z + HOLE.d / 2 + 0.2, tall: false });
  // Windows down the long walls near the far end, portraits nearer, urns of roses, two chandeliers, sconces.
  for (const [x, ry] of [[-W / 2 + 0.02, Math.PI / 2], [W / 2 - 0.02, -Math.PI / 2]]) windowOn(mood, M, scene, { x, z: -6.6, ry, w: 1.4, h: 2.8, sill: 1.2, curtainBright: 0x5a6ad8 });
  for (const [x, z, ry, seed] of [[-W / 2 + 0.05, 2.4, Math.PI / 2, 33], [W / 2 - 0.05, 2.4, -Math.PI / 2, 36]]) frame(M, mood, scene, { x, y: 2.9, z, ry, w: 1.0, h: 1.3, map: portrait(seed), eyes: 0xb6ff9a });
  // Great-aunt herself, a big portrait on the end wall over the stairwell: she watches over the way up.
  frame(M, mood, scene, { x: 0, y: 3.0, z: D / 2 - 0.05, ry: Math.PI, w: 1.6, h: 2.1, map: portrait(51), eyes: 0xffd27a });
  for (const [x, z] of [[-W / 2 + 0.5, -3.9], [W / 2 - 0.5, -3.9], [-W / 2 + 0.5, -8.6], [W / 2 - 0.5, -8.6]]) {
    roseUrn(mood, M, scene, x, z);
    blockers.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4, tall: false });
  }
  chandelier(mood, M, scene, { x: 0, z: -5.5, y: H - 1.3, r: 0.8, candles: 8 });
  chandelier(mood, M, scene, { x: 0, z: 0.5, y: H - 1.3, r: 0.8, candles: 8 });
  for (const z of [-0.2, -8]) for (const s of [-1, 1]) sconce(mood, M, scene, updates, { x: s * (W / 2 - 0.05), y: 2.4, z, ry: -s * Math.PI / 2 });
  cobwebs(mood, scene, [[-W / 2 + 0.05, H - 0.1, -D / 2 + 0.05, 0, 1.8], [W / 2 - 0.05, H - 0.1, -D / 2 + 0.05, -Math.PI / 2, 1.8], [W / 2 - 0.05, H - 0.1, D / 2 - 0.05, Math.PI, 1.4], [-W / 2 + 0.05, H - 0.1, 1, Math.PI / 2, 1.2]]);
  const motesUpdate = motes(mood, scene, { w: W, d: D, h: H, n: 200 });
  updates.push((dt, t, f) => motesUpdate(dt, t, f));
  updates.push(mist(mood, scene, { w: W, d: D, colour: 0x5a6aa8 }));
  const potionSpots = [potionTable(scene, M, blockers, -2.7, 1.2, 'heart'), potionTable(scene, M, blockers, 2.7, 1.2, 'star')];
  return makeHub({
    id: 'landing', scene, mood, M, W, D, H, blockers, updates, potionSpots,
    doorSpots: {
      nursery: { x: -W / 2 + 0.14, z: -2.6, ry: Math.PI / 2 },
      studio: { x: W / 2 - 0.14, z: -2.6, ry: -Math.PI / 2 },
      bedchamber: { x: 0, z: -D / 2 + 0.14, ry: 0, big: true },
      // The top of the stairs: the way back down to the Hall.
      out: { x: 0, z: z0 - 0.7, ry: Math.PI, door: false }
    },
    spawn: { x: 0, z: z0 - 1.4, face: Math.PI }
  });
}

// ── The Nursery ★★★★: Dust Bunnies → Captain Buttons and the Toy Box ─────────────────────────────────────────────
const letterBlock = (ch, bg) =>
  tex(`block-${ch}`, () =>
    canvasTexture(64, 64, (g, w) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 5;
      g.strokeRect(4, 4, w - 8, w - 8);
      g.fillStyle = '#ffffff';
      g.font = 'bold 40px Georgia, serif';
      g.textAlign = 'center';
      g.fillText(ch, w / 2, 47);
    })
  );
function furnishNursery({ scene, mood, M, blockers, updates, W, D }) {
  const pastel = (dark, bright, o = {}) => mood.mat({ dark, bright, roughness: 0.6, ...o });
  const pink = pastel(0x3a3440, 0xffc8dc), mint = pastel(0x303a38, 0xbfeedc), lemon = pastel(0x3a3a30, 0xfff0a8), sky = pastel(0x30343e, 0xb8d8ff), white = pastel(0x40404a, 0xfffaf2);
  // A round rug in the middle.
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48).rotateX(-Math.PI / 2), mood.mat({ dark: 0x2a2a3a, bright: 0xffd8e8, roughness: 1 }));
  rug.position.set(0, 0.008, -0.6);
  rug.receiveShadow = true;
  scene.add(rug);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.05, 48).rotateX(-Math.PI / 2), mood.mat({ dark: 0x30304a, bright: 0xb8d8ff, roughness: 1 }));
  ring.position.set(0, 0.01, -0.6);
  scene.add(ring);
  // The dollhouse on a low table, back left: pink walls, a blue roof, windows that light up once won.
  const dh = new THREE.Group();
  dh.position.set(-2.7, 0, -D / 2 + 0.6);
  box(1.7, 0.5, 0.8, M.wood, 0, 0.25, 0, dh);
  box(1.4, 1.0, 0.6, pink, 0, 1.0, 0, dh);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.5, 3, 1), sky);
  roof.rotation.set(0, 0, Math.PI / 2);
  roof.rotation.order = 'ZYX';
  roof.position.set(0, 1.72, 0);
  roof.scale.set(1, 1, 0.75);
  dh.add(roof);
  const lit = mood.mat({ dark: 0x1a1a24, bright: 0xffe8a0, emissive: [0, 0xffc860], ei: [0, 1.2], roughness: 1 });
  for (const [x, y] of [[-0.4, 0.8], [0.4, 0.8], [-0.4, 1.22], [0.4, 1.22]]) box(0.24, 0.22, 0.02, lit, x, y, 0.31, dh);
  box(0.26, 0.4, 0.02, M.wood, 0, 0.72, 0.31, dh);
  scene.add(dh);
  blockers.push({ minX: -3.6, maxX: -1.8, minZ: -D / 2, maxZ: -D / 2 + 1.05 });
  // The rocking horse, back right: a dappled body on two curved rockers; it rocks once the room is won.
  const horse = new THREE.Group();
  horse.position.set(3.0, 0, -D / 2 + 1.3);
  horse.rotation.y = -0.6;
  const rocker = new THREE.Group();
  horse.add(rocker);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.03, 6, 30, 0.95), M.wood);
    r.rotation.set(0, Math.PI / 2, Math.PI * 1.5 - 0.475);
    r.position.set(s * 0.16, 1.22, 0);
    rocker.add(r);
  }
  const hb = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 6, 12), white);
  hb.rotation.x = Math.PI / 2;
  hb.position.y = 0.62;
  rocker.add(hb);
  for (const [x, z] of [[-0.12, 0.25], [0.12, 0.25], [-0.12, -0.25], [0.12, -0.25]]) {
    const l = cyl(0.035, 0.03, 0.42, white, x, 0.32, z, rocker, 8);
    l.rotation.x = z > 0 ? -0.25 : 0.25;
  }
  const hn = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.28, 6, 10), white);
  hn.position.set(0, 0.88, 0.32);
  hn.rotation.x = 0.5;
  rocker.add(hn);
  const hh = sphere(0.12, white, 0, 1.06, 0.45, rocker);
  hh.scale.set(0.8, 0.85, 1.3);
  for (let i = 0; i < 6; i++) sphere(0.045, pink, 0, 1.12 - i * 0.07, 0.38 - i * 0.07, rocker, 8);
  scene.add(horse);
  blockers.push({ minX: 2.4, maxX: 3.6, minZ: -D / 2, maxZ: -D / 2 + 2.0 });
  updates.push((dt, t, f) => (rocker.rotation.x = f > 0.9 ? Math.sin(t * 1.6) * 0.12 : 0));
  // Letter blocks: scattered in the dark, a neat tower once won.
  const cols = ['#e0608a', '#4a8ad8', '#f0a92e', '#3fb59a', '#9a6ad8', '#e0408a'];
  [...'ABCDEF'].forEach((ch, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), mood.mat({ dark: 0x50505a, bright: 0xffffff, map: letterBlock(ch, cols[i]), roughness: 0.6 }));
    b.castShadow = true;
    scene.add(b);
    const from = new THREE.Vector3(1.4 + rand() * 1.6, 0.13, -D / 2 + 2.6 + rand() * 0.8), fromR = rand() * 3;
    const to = new THREE.Vector3(2.0 + (i % 2) * 0.28, 0.13 + Math.floor(i / 2) * 0.26, -D / 2 + 2.5);
    mood.item(to, (f) => {
      b.position.lerpVectors(from, to, f);
      b.rotation.set(0, fromR * (1 - f), fromR * 0.3 * (1 - f));
    });
  });
  blockers.push({ minX: 1.8, maxX: 2.5, minZ: -D / 2 + 2.3, maxZ: -D / 2 + 2.75, tall: false });
  // A little bed with a frilled canopy on the right wall, a teddy on the pillow.
  const bed = new THREE.Group();
  bed.position.set(W / 2 - 0.75, 0, 1.4);
  box(1.0, 0.45, 1.7, M.wood, 0, 0.25, 0, bed);
  box(0.94, 0.16, 1.62, white, 0, 0.55, 0, bed);
  box(0.94, 0.06, 1.1, sky, 0, 0.64, 0.25, bed);
  const pillow = box(0.6, 0.12, 0.3, white, 0, 0.66, -0.6, bed);
  void pillow;
  box(1.0, 1.0, 0.08, M.wood, 0, 0.7, -0.86, bed);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.0, 20, 1, true), mood.mat({ dark: 0x30303e, bright: 0xffe0ec, roughness: 0.9, side: THREE.DoubleSide }));
  canopy.position.set(0, 2.5, -0.5);
  bed.add(canopy);
  const teddy = new THREE.Group();
  teddy.position.set(0.15, 0.75, -0.5);
  const fur = mood.mat({ dark: 0x3a3430, bright: 0xc8905a, roughness: 0.95 });
  sphere(0.1, fur, 0, 0.1, 0, teddy, 12);
  sphere(0.075, fur, 0, 0.24, 0, teddy, 12);
  for (const s of [-1, 1]) sphere(0.03, fur, s * 0.055, 0.3, 0, teddy, 8);
  bed.add(teddy);
  scene.add(bed);
  blockers.push({ minX: W / 2 - 1.3, maxX: W / 2, minZ: 0.5, maxZ: 2.3 });
  // A shelf of toys on the back wall: teddies, a drum, a spinning top.
  const shelf = new THREE.Group();
  shelf.position.set(0.3, 1.7, -D / 2 + 0.2);
  box(2.0, 0.06, 0.3, M.wood, 0, 0, 0, shelf);
  for (const [x, kind] of [[-0.75, 'bear'], [-0.3, 'drum'], [0.15, 'bear'], [0.6, 'top']]) {
    if (kind === 'bear') {
      const t = teddy.clone();
      t.position.set(x, 0.03, 0);
      shelf.add(t);
    } else if (kind === 'drum') {
      cyl(0.12, 0.12, 0.16, mood.mat({ dark: 0x3a2a30, bright: 0xd8304a }), x, 0.11, 0, shelf, 16);
      cyl(0.125, 0.125, 0.02, M.gold, x, 0.2, 0, shelf, 16);
    } else {
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 16), mood.mat({ dark: 0x34344a, bright: 0x8ad0ff }));
      top.rotation.x = Math.PI;
      top.position.set(x, 0.14, 0);
      shelf.add(top);
      updates.push((dt, t, f) => (top.rotation.y = f > 0.9 ? t * 6 : 0));
    }
  }
  scene.add(shelf);
  // A ball on the rug's edge, a toy chest on the left wall: Captain Buttons stands on its lid once won.
  sphere(0.16, mood.mat({ dark: 0x3a3440, bright: 0xff7aa8, roughness: 0.5 }), -1.0, 0.16, 1.4, scene);
  blockers.push({ minX: -1.2, maxX: -0.8, minZ: 1.2, maxZ: 1.6, tall: false });
  const chest = new THREE.Group();
  chest.position.set(-W / 2 + 0.55, 0, 1.6);
  chest.rotation.y = Math.PI / 2;
  box(1.2, 0.6, 0.7, mood.mat({ dark: 0x2e2a3a, bright: 0x6a8ad8, roughness: 0.6 }), 0, 0.3, 0, chest);
  box(1.26, 0.08, 0.76, M.gold, 0, 0.62, 0, chest);
  for (const [x, c] of [[-0.3, lemon], [0.3, mint]]) {
    const star = sphere(0.09, c, x, 0.3, 0.36, chest, 10);
    star.scale.z = 0.3;
  }
  scene.add(chest);
  blockers.push({ minX: -W / 2, maxX: -W / 2 + 1.0, minZ: 0.95, maxZ: 2.25 });
  const soldier = makeSoldier();
  soldier.group.position.set(-W / 2 + 0.55, 0.66, 1.6);
  soldier.group.rotation.y = Math.PI / 2;
  soldier.group.scale.setScalar(1.25);
  scene.add(soldier.group);
  mood.item(soldier.group.position, (f) => (soldier.group.visible = f > 0.6));
  updates.push((dt, t, f) => f > 0.6 && soldier.update(dt, t));
  // view: where the camera stands for the game, with the heroine and Captain Buttons in the left part of the screen
  // (the game's panel covers the right).
  return { kind: 'toys', x: -2.75, z: 1.7, face: -0.95, friend: soldier, view: [[-0.4, 1.75, 3.75], [-2.51, 0.95, 0.56]] };
}

// ── The Painting Studio ★★★★: a Smudge Sprite and the Sulky Sketchbook → Madame Palette's colouring ──────────────
const painted = (seed) =>
  tex(`painting-${seed}`, () =>
    canvasTexture(128, 128, (g, w) => {
      const r = kit.mulberry(seed);
      g.fillStyle = `hsl(${r() * 360}, 60%, 85%)`;
      g.fillRect(0, 0, w, w);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = `hsl(${r() * 360}, 70%, ${45 + r() * 25}%)`;
        g.beginPath();
        g.ellipse(r() * w, r() * w, 10 + r() * 30, 8 + r() * 22, r() * 3, 0, TAU);
        g.fill();
      }
    })
  );
function easel(mood, M, parent, { x, z, ry, w = 0.9, h = 1.1, map = null }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  for (const [lx, rz] of [[-0.32, 0.12], [0.32, -0.12]]) {
    const leg = box(0.05, 1.9, 0.05, M.wood, lx, 0.95, 0.05, g);
    leg.rotation.z = rz;
  }
  const back = box(0.05, 1.9, 0.05, M.wood, 0, 0.92, -0.32, g);
  back.rotation.x = -0.3;
  box(w + 0.1, 0.05, 0.12, M.wood, 0, 0.62, 0.08, g);
  const canvas = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), mood.mat({ dark: 0x50505a, bright: 0xffffff, map, roughness: 0.9 }));
  canvas.position.set(0, 0.62 + h / 2 + 0.02, 0.08);
  canvas.rotation.x = -0.08;
  canvas.castShadow = true;
  g.add(canvas);
  parent.add(g);
  return { g, canvas };
}
function furnishStudio({ scene, mood, M, blockers, updates, W, D }) {
  // Madame Palette's own portrait on the back wall: a lady in a beret while the room is cursed (her eyes glow); an
  // empty canvas once she has stepped out of it.
  const pf = frame(M, mood, scene, { x: -0.6, y: 2.6, z: -D / 2 + 0.06, ry: 0, w: 1.5, h: 1.9, map: portrait(61), eyes: 0xffb3d9 });
  const blank = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9), new THREE.MeshStandardMaterial({ color: 0xfaf4e6, roughness: 1, transparent: true, opacity: 0 }));
  blank.position.z = 0.055;
  pf.g.add(blank);
  mood.on((f) => (blank.material.opacity = Math.max(0, (f - 0.5) * 2)));
  // Easels about the room with paintings on them; the big one, back right, is hers.
  for (const [x, z, ry, seed] of [[-3.8, -2.6, 0.7, 4], [-3.9, 2.4, 1.4, 9], [4.1, 2.2, -1.3, 13]]) {
    easel(mood, M, scene, { x, z, ry, map: painted(seed) });
    blockers.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45 });
  }
  const paper = canvasTexture(256, 256, (g, w) => {
    g.fillStyle = '#fffaf0';
    g.fillRect(0, 0, w, w);
  });
  const main = easel(mood, M, scene, { x: 2.7, z: -2.8, ry: -0.35, w: 1.2, h: 1.2, map: paper });
  blockers.push({ minX: 2.2, maxX: 3.2, minZ: -3.4, maxZ: -2.3 });
  // The paint table: pots of every colour, brushes in a jar, a palette.
  const table = new THREE.Group();
  table.position.set(-3.3, 0, -D / 2 + 0.7);
  box(1.8, 0.06, 0.8, M.wood, 0, 0.9, 0, table);
  for (const [x, z] of [[-0.8, -0.32], [0.8, -0.32], [-0.8, 0.32], [0.8, 0.32]]) cyl(0.03, 0.03, 0.9, M.wood, x, 0.45, z, table, 6);
  const paints = [0xe0408a, 0xf0a92e, 0xffe14a, 0x3fb59a, 0x4a8ad8, 0x9a6ad8, 0xe8502a];
  paints.forEach((c, i) => {
    const pot = cyl(0.07, 0.07, 0.12, M.cream, -0.65 + i * 0.21, 0.99, -0.15, table, 12);
    void pot;
    cyl(0.062, 0.062, 0.01, mood.mat({ dark: 0x30303a, bright: c, roughness: 0.3 }), -0.65 + i * 0.21, 1.055, -0.15, table, 12);
  });
  const jar = cyl(0.08, 0.07, 0.18, mood.mat({ dark: 0x404a50, bright: 0xc8e8f0, roughness: 0.1, transparent: true, opacity: [0.6, 0.6] }), 0.55, 1.02, 0.2, table, 12);
  void jar;
  for (let i = 0; i < 5; i++) {
    const b = cyl(0.008, 0.008, 0.34, M.wood, 0.53 + (i % 3) * 0.02, 1.15, 0.18 + i * 0.01, table, 5);
    b.rotation.z = (i - 2) * 0.12;
    sphere(0.016, mood.mat({ dark: 0x30303a, bright: paints[i] }), 0.53 + (i % 3) * 0.02 - (i - 2) * 0.02, 1.32, 0.18 + i * 0.01, table, 6);
  }
  const pal = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24).rotateX(-Math.PI / 2), M.wood);
  pal.scale.set(1.3, 1, 1);
  pal.position.set(-0.2, 0.935, 0.22);
  table.add(pal);
  paints.forEach((c, i) => {
    const a = (i / paints.length) * Math.PI * 1.5 + 0.4;
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12).rotateX(-Math.PI / 2), mood.mat({ dark: 0x30303a, bright: c }));
    blob.position.set(-0.2 + Math.cos(a) * 0.19, 0.94, 0.22 + Math.sin(a) * 0.13);
    table.add(blob);
  });
  scene.add(table);
  blockers.push({ minX: -4.3, maxX: -2.3, minZ: -D / 2, maxZ: -D / 2 + 1.2 });
  // Paint splashed up the walls and over the floor in the dark (the Smudge Sprite's doing); gone once won.
  const splat = canvasTexture(128, 128, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(w / 2, w / 2, 30, 0, TAU);
    g.fill();
    for (let i = 0; i < 14; i++) {
      const a = rand() * TAU, d = 30 + rand() * 30, r = 4 + rand() * 9;
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * d, w / 2 + Math.sin(a) * d, r, 0, TAU);
      g.fill();
    }
  });
  for (let i = 0; i < 14; i++) {
    const onWall = i < 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: splat, color: [0x2a5ad0, 0x6a2a9a, 0x1a7a6a][i % 3], transparent: true, opacity: 0.8, depthWrite: false }));
    if (onWall) {
      const side = i % 2 ? 1 : -1;
      m.position.set(side * (W / 2 - 0.02), 1.2 + rand() * 2.2, -3 + rand() * 6);
      m.rotation.y = -side * Math.PI / 2;
    } else {
      m.rotation.x = -Math.PI / 2;
      m.position.set(-3 + rand() * 6, 0.012, -2.5 + rand() * 5);
    }
    m.rotation.z = rand() * 3;
    m.scale.setScalar(0.6 + rand() * 0.8);
    scene.add(m);
    mood.item(m.position, (f) => {
      m.material.opacity = 0.8 * (1 - f);
      m.visible = f < 0.98;
    });
  }
  // A dais for the model, with a vase of flowers to paint, in the middle back.
  const vase = new THREE.Group();
  vase.position.set(0.9, 0, -D / 2 + 1.0);
  cyl(0.4, 0.45, 0.6, M.cream, 0, 0.3, 0, vase, 20);
  cyl(0.12, 0.08, 0.32, mood.mat({ dark: 0x30303e, bright: 0x4a8ad8, roughness: 0.2 }), 0, 0.76, 0, vase, 16);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    cyl(0.008, 0.008, 0.4, mood.mat({ dark: 0x203020, bright: 0x3f9a4a }), Math.cos(a) * 0.05, 1.05, Math.sin(a) * 0.05, vase, 4);
    sphere(0.06, mood.mat({ dark: 0x30303a, bright: [0xff7aa8, 0xffe14a, 0xffffff, 0xff9a5a, 0xc8a0ff][i] }), Math.cos(a) * 0.1, 1.27, Math.sin(a) * 0.1, vase, 10);
  }
  scene.add(vase);
  blockers.push({ minX: 0.4, maxX: 1.4, minZ: -D / 2 + 0.5, maxZ: -D / 2 + 1.5 });
  // view: the camera for the game, the heroine, Madame Palette and the easel in the left part of the screen.
  return { kind: 'paint', x: 2.15, z: -1.75, face: Math.PI - 0.35, easel: main.canvas, palAt: [3.55, -2.0, -1.1], view: [[-0.9, 1.85, 1.2], [3.91, 1.05, -0.96]] };
}

// ── The Royal Bedchamber ★★★★★: the Locked Diary → the Heart Locket, the Star Staff and her star map ─────────────
function furnishBedchamber({ scene, mood, M, blockers, updates, W, D, H }) {
  const rose = mood.mat({ dark: 0x30283a, bright: 0xc84a6a, roughness: 0.8 });
  const cream = mood.mat({ dark: 0x40404c, bright: 0xfff4ea, roughness: 0.8 });
  const gauze = mood.mat({ dark: 0x30303e, bright: 0xffe8f0, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: [0.85, 0.85] });
  // The four-poster bed, back right: posts, a starry canopy (its underside is great-aunt's star map), curtains.
  const bed = new THREE.Group();
  bed.position.set(2.6, 0, -D / 2 + 1.3);
  box(2.2, 0.5, 2.4, M.darkWood, 0, 0.25, 0, bed);
  box(2.1, 0.25, 2.3, cream, 0, 0.62, 0, bed);
  box(2.14, 0.08, 1.5, rose, 0, 0.77, 0.4, bed);
  for (const x of [-0.5, 0.5]) box(0.8, 0.18, 0.4, cream, x, 0.84, -0.85, bed);
  box(2.2, 1.6, 0.12, M.darkWood, 0, 1.2, -1.2, bed);
  const crest = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24, 0, Math.PI), M.gold);
  crest.position.set(0, 2.0, -1.13);
  bed.add(crest);
  for (const [x, z] of [[-1.05, -1.15], [1.05, -1.15], [-1.05, 1.15], [1.05, 1.15]]) {
    cyl(0.06, 0.07, 3.0, M.darkWood, x, 1.5, z, bed, 10);
    sphere(0.09, M.gold, x, 3.05, z, bed, 12);
  }
  box(2.3, 0.14, 2.5, M.darkWood, 0, 3.0, 0, bed);
  const sky = canvasTexture(256, 256, (g, w) => {
    g.fillStyle = '#16205a';
    g.fillRect(0, 0, w, w);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = i % 4 ? '#ffe7a0' : '#ffffff';
      g.beginPath();
      g.arc(rand() * w, rand() * w, 0.8 + rand() * 2.4, 0, TAU);
      g.fill();
    }
    g.strokeStyle = 'rgba(255,231,160,0.5)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (const [i, [x, y]] of [[40, 60], [80, 50], [120, 70], [150, 60], [170, 110], [215, 120], [200, 80]].entries()) i ? g.lineTo(x, y) : g.moveTo(x, y);
    g.stroke();
  });
  const under = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4).rotateX(Math.PI / 2), mood.mat({ dark: 0x2a2e50, bright: 0xffffff, map: sky, emissive: [0x0a0c20, 0xffffff], ei: [0.5, 0.7] }));
  under.material.emissiveMap = sky;
  under.position.y = 2.92;
  bed.add(under);
  for (const s of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(0.7, 2.6, 8, 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 18) * 0.04);
    geo.computeVertexNormals();
    const c = new THREE.Mesh(geo, gauze);
    c.position.set(s * 1.05, 1.65, 1.15);
    c.rotation.y = s * 0.2;
    bed.add(c);
  }
  scene.add(bed);
  blockers.push({ minX: 2.6 - 1.25, maxX: 2.6 + 1.25, minZ: -D / 2, maxZ: -D / 2 + 2.6 });
  // The dressing table with an oval mirror, and great-aunt's jewellery box on it, on the left wall.
  const dt = new THREE.Group();
  dt.position.set(-W / 2 + 0.45, 0, -2.4);
  dt.rotation.y = Math.PI / 2;
  box(1.4, 0.08, 0.6, cream, 0, 0.8, 0, dt);
  for (const x of [-0.6, 0.6]) box(0.18, 0.8, 0.5, cream, x, 0.4, 0, dt);
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), mood.mat({ dark: 0x2a3040, bright: 0xd8e8f8, roughness: 0.05, metalness: 0.9 }));
  mirror.scale.y = 1.3;
  mirror.position.set(0, 1.55, -0.25);
  dt.add(mirror);
  const mf = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 8, 40), M.gold);
  mf.scale.y = 1.3;
  mf.position.copy(mirror.position);
  dt.add(mf);
  const jb = new THREE.Group();
  jb.position.set(0.35, 0.84, 0.05);
  box(0.3, 0.14, 0.2, rose, 0, 0.07, 0, jb);
  const lid = box(0.32, 0.04, 0.22, M.gold, 0, 0.16, 0, jb);
  const gemM = mood.mat({ dark: 0x302030, bright: 0xff6a9a, emissive: [0, 0xff3a7a], ei: [0, 1.4] });
  sphere(0.025, gemM, 0, 0.19, 0, jb, 10);
  dt.add(jb);
  updates.push((dt2, t, f) => {
    lid.rotation.x = f > 0.9 ? -0.6 - Math.sin(t * 1.2) * 0.05 : 0;
    lid.position.z = f > 0.9 ? -0.08 : 0;
  });
  scene.add(dt);
  blockers.push({ minX: -W / 2, maxX: -W / 2 + 0.85, minZ: -3.2, maxZ: -1.6 });
  // The fireplace on the left wall nearer the door, great-aunt's portrait above it; the fire is lit once won.
  const fp = new THREE.Group();
  fp.position.set(-W / 2 + 0.3, 0, 1.6);
  fp.rotation.y = Math.PI / 2;
  const marbleM = mood.mat({ dark: 0x4a4a58, bright: 0xf2ece4, roughness: 0.3 });
  box(1.8, 0.16, 0.5, marbleM, 0, 1.3, 0.05, fp);
  for (const x of [-0.75, 0.75]) box(0.3, 1.25, 0.4, marbleM, x, 0.62, 0, fp);
  box(1.2, 1.1, 0.1, mood.mat({ dark: 0x101014, bright: 0x2a1a14 }), 0, 0.55, -0.15, fp);
  const fire = new THREE.Group();
  fire.position.set(0, 0.25, 0);
  fp.add(fire);
  for (let i = 0; i < 3; i++) {
    const log = cyl(0.05, 0.05, 0.6, M.darkWood, 0, 0.05 + i * 0.03, 0, fire, 8);
    log.rotation.set(0, i * 1.1, Math.PI / 2);
  }
  const flameM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(2), toneMapped: false, transparent: true });
  const flames = [0, 1, 2, 3].map((i) => {
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 8), flameM);
    fl.position.set(-0.18 + i * 0.12, 0.25, 0);
    fire.add(fl);
    return fl;
  });
  const fireLight = mood.light(new THREE.PointLight(0xff9a40, 0, 6, 1.6), { color: 0xff9a40, intensity: 0 }, { color: 0xffa050, intensity: 3.5 });
  fireLight.position.set(-W / 2 + 0.9, 0.7, 1.6);
  updates.push((d, t, f) => {
    fire.visible = f > 0.6;
    flames.forEach((fl, i) => (fl.scale.y = 0.8 + Math.sin(t * 9 + i * 2) * 0.25));
  });
  scene.add(fp);
  blockers.push({ minX: -W / 2, maxX: -W / 2 + 0.6, minZ: 0.6, maxZ: 2.6 });
  frame(M, mood, scene, { x: -W / 2 + 0.06, y: 2.7, z: 1.6, ry: Math.PI / 2, w: 1.1, h: 1.4, map: portrait(51), eyes: 0xffd27a });
  // A round rug, an armchair by the fire.
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48).rotateX(-Math.PI / 2), mood.mat({ dark: 0x2a2030, bright: 0xa83a5a, roughness: 1 }));
  rug.scale.set(1.3, 1, 1);
  rug.position.set(-0.3, 0.008, -0.3);
  rug.receiveShadow = true;
  scene.add(rug);
  const chair = new THREE.Group();
  chair.position.set(-3.8, 0, 3.2);
  chair.rotation.y = 2.4;
  box(0.8, 0.4, 0.8, rose, 0, 0.3, 0, chair);
  box(0.8, 0.8, 0.18, rose, 0, 0.8, -0.32, chair);
  for (const s of [-1, 1]) box(0.16, 0.3, 0.8, rose, s * 0.38, 0.6, 0, chair);
  scene.add(chair);
  blockers.push({ minX: -4.4, maxX: -3.2, minZ: 2.6, maxZ: 3.8 });
  // The Diary floats by the foot of the bed once won.
  const diary = makeDiary();
  diary.group.position.set(1.2, 0, -1.6);
  scene.add(diary.group);
  mood.item(diary.group.position, (f) => (diary.group.visible = f > 0.6));
  updates.push((d, t, f) => f > 0.6 && diary.update(d, t));
  void H;
  // view: the camera for the game, the heroine and the floating diary in the left part of the screen.
  return { kind: 'stars', x: -0.3, z: -1.2, face: 1.33, friend: diary, view: [[-1.2, 1.8, 2.9], [1.38, 1.15, -1.04]] };
}

addPlaces({ landing: buildLanding });
addRooms({
  nursery: {
    W: 9, D: 8, H: 4.4,
    shell: { floorMap: parquet(), floorDark: 0x3a3a48, floorBright: 0xe0ccbc, wallMap: damask('#cfe2ff', '#eef5ff', 'nursery'), wallDark: 0x30344a, wallBright: 0xdce4ee },
    windows: [{ x: -0.4, z: -4 + 0.02, ry: 0, w: 1.2, h: 2.2, sill: 1.3 }],
    curtain: 0xffb3d1,
    sconces: [[-4.44, 2.3, -1.2, Math.PI / 2], [4.44, 2.3, -1.4, -Math.PI / 2], [-2.2, 2.4, 3.94, Math.PI], [2.2, 2.4, 3.94, Math.PI]],
    mist: 0x7a6a98,
    battle: { hero: [1.7, -0.4], foes: [[-1.3, -1.5], [-2.0, -0.3]], camera: [0.4, 2.2, 3.0], look: [0.1, 0.85, -0.7] },
    furnish: furnishNursery
  },
  studio: {
    W: 10, D: 9, H: 5.5,
    shell: { floorMap: parquet(), floorDark: 0x33303e, floorBright: 0xd8c0a8, wallMap: damask('#ffe2cc', '#fff2e4', 'peach'), wallDark: 0x3a3236, wallBright: 0xece0d6 },
    windows: [{ x: -5 + 0.02, z: -0.5, ry: Math.PI / 2, w: 1.6, h: 3.2, sill: 1.0 }],
    curtain: 0x3fb59a,
    sunFrom: [-6, 8, 1],
    sconces: [[4.94, 2.6, -0.4, -Math.PI / 2], [-2.2, 2.6, 4.44, Math.PI], [2.2, 2.6, 4.44, Math.PI]],
    mist: 0x5a5a90,
    battle: { hero: [1.7, 0.1], foes: [[-1.0, -1.1], [-1.6, 0.0]], camera: [0.5, 2.4, 4.3], look: [0.25, 0.9, -0.6] },
    furnish: furnishStudio
  },
  bedchamber: {
    W: 11, D: 9, H: 5.5,
    shell: { floorMap: parquet(), floorDark: 0x2e2a36, floorBright: 0xc8a890, wallMap: damask('#f2c8d4', '#ffe4ec', 'royal'), wallDark: 0x2e2834, wallBright: 0xe8d6dc },
    windows: [{ x: -1.6, z: -4.5 + 0.02, ry: 0, w: 1.4, h: 3.0, sill: 1.1 }],
    curtain: 0x9a2a4a,
    sunFrom: [-3, 8, -5],
    sconces: [[5.44, 2.6, 0.4, -Math.PI / 2], [-2.2, 2.6, 4.44, Math.PI], [2.2, 2.6, 4.44, Math.PI]],
    mist: 0x6a4a88,
    fogDark: 0x06060e,
    battle: { hero: [1.4, 0.0], foes: [[-1.5, -1.3]], camera: [0.3, 2.5, 4.3], look: [-0.05, 1.2, -0.7] },
    furnish: furnishBedchamber
  }
});
