// The weapons, modelled: side profiles drawn as shapes and extruded across the gun with a small bevel (the edges
// catch the light), cylinders for barrels and tubes, a lathe for the bat. No downloaded assets: the wood grain, the
// polymer stipple and the bat's grip tape are drawn on canvases here.
//
// Convention (the hand mount relies on it): metres; the origin is where the right hand grips (the pistol grip, the
// shotgun's wrist, the bat's handle end, the knife's handle); the barrel or blade points along +Z; +Y is up (the
// sights); the gun is centred on X (its width runs along X). The gun's right side (ejection ports) is -X.
//
//   buildWeapon(kind) → { group, muzzle, support, pump }   kind: pistol | smg | shotgun | rifle | bat | knife
//   buildPickup(kind) → a Group: that weapon on its side on the floor (origin at floor level, centred)
//   buildAmmo(kind)   → a Group on the floor: pistol (a box of 9 mm + a magazine), shells, medkit, smg, rifle
//
// Each weapon is a few meshes, one per material (parts that share a material are merged); the shotgun's pump is its
// own child so it can slide back along -Z for the rack.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------------------------------------------
// Textures, drawn once.

let TEX = null;
function textures() {
  if (TEX) return TEX;
  const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const tex = (c, rx, ry, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  // A seeded random, so every load draws the same grain.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Wood: grain lines along u (the gun's length), periodic in both directions so it tiles.
  const wood = (base, dark, light) => {
    const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const y0 = rnd() * H, amp = 2 + rnd() * 7, k = 1 + Math.floor(rnd() * 3), ph = rnd() * 6.28;
      g.strokeStyle = rnd() < 0.75 ? dark : light;
      g.globalAlpha = 0.08 + rnd() * 0.25;
      g.lineWidth = 0.6 + rnd() * 2.6;
      for (const dy of [-H, 0, H]) {
        g.beginPath();
        for (let x = 0; x <= W; x += 8) {
          const y = y0 + dy + Math.sin((x / W) * Math.PI * 2 * k + ph) * amp + Math.sin((x / W) * Math.PI * 2 * (k + 2) + ph * 2) * amp * 0.3;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
    }
    // Pores: short dark dashes along the grain.
    g.fillStyle = dark;
    for (let i = 0; i < 900; i++) {
      g.globalAlpha = 0.1 + rnd() * 0.25;
      g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 1);
    }
    g.globalAlpha = 1;
    return c;
  };
  // Noise for a stippled polymer / rubber bump map.
  const stipple = () => {
    const N = 128, c = canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const v = 90 + rnd() * 140;
      img.data.set([v, v, v, 255], i * 4);
    }
    g.putImageData(img, 0, 0);
    return c;
  };
  // Grip tape: a dark band with the overlapping edge running diagonally, so one tile is one turn of the spiral.
  const tape = () => {
    const N = 128, c = canvas(N, N), g = c.getContext('2d');
    g.fillStyle = '#26272a';
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = rnd() < 0.5 ? '#1b1c1e' : '#323438';
      g.fillRect(rnd() * N, rnd() * N, 1.5, 1.5);
    }
    g.lineWidth = 10;
    for (const off of [-N, 0, N]) {
      g.strokeStyle = '#121314';
      g.beginPath();
      g.moveTo(off, N);
      g.lineTo(off + N, 0);
      g.stroke();
      g.strokeStyle = 'rgba(90,92,96,0.55)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(off + 6, N);
      g.lineTo(off + N + 6, 0);
      g.stroke();
      g.lineWidth = 10;
    }
    return c;
  };
  // Box UVs are in metres: repeat = tiles per metre.
  TEX = {
    walnut: tex(wood('#6b4226', '#2e1a0e', '#8a5a34'), 2.6, 9),
    ash: tex(wood('#c9975c', '#7a5130', '#e0b57e'), 2.2, 8),
    stipple: tex(stipple(), 45, 45, false),
    tape: tex(tape(), 1, 8)
  };
  return TEX;
}

// ---------------------------------------------------------------------------------------------------------------
// Materials, shared by every weapon (one shader program each).

let MATS = null;
export function gunMaterials() {
  if (MATS) return MATS;
  const t = textures();
  const P = (o) => new THREE.MeshPhongMaterial({ vertexColors: true, ...o });
  MATS = {
    metal: P({ color: 0x2e3135, specular: 0x7a7a7a, shininess: 70 }), // blued / nitrided steel
    barrel: P({ color: 0x4d5156, specular: 0x9a9a9a, shininess: 80 }), // a bolt or barrel hood seen through a port
    alu: P({ color: 0x35383c, specular: 0x5c5f63, shininess: 45 }), // hard-anodised aluminium (AR receivers, mags)
    steel: P({ color: 0x8e9297, specular: 0xbbbbbb, shininess: 90 }), // bright bits: barrel hood, bolt, pins
    polymer: P({ color: 0x2f3134, specular: 0x333333, shininess: 18, bumpMap: t.stipple, bumpScale: 0.6 }),
    rubber: P({ color: 0x18191a, specular: 0x151515, shininess: 6, bumpMap: t.stipple, bumpScale: 1.2 }),
    walnut: P({ color: 0xffffff, map: t.walnut, specular: 0x3b2a1a, shininess: 34 }),
    ash: P({ color: 0xffffff, map: t.ash, specular: 0x3f3424, shininess: 30 }),
    tape: P({ color: 0xffffff, map: t.tape, specular: 0x1e1e1e, shininess: 8 }),
    blade: P({ color: 0xc3c8cd, specular: 0xffffff, shininess: 150 }),
    black: P({ color: 0x060606, specular: 0x000000, shininess: 2 }),
    white: P({ color: 0xe9e6dc, specular: 0x222222, shininess: 10 }),
    brass: P({ color: 0xb48c3c, specular: 0xffe2a0, shininess: 70 }),
    hull: P({ color: 0xa52a22, specular: 0x553333, shininess: 40 }), // a shotgun shell's red plastic
    caseWhite: P({ color: 0xeeeeea, specular: 0x444444, shininess: 30 }),
    green: P({ color: 0x15965a, specular: 0x224433, shininess: 20 }),
    grey: P({ color: 0x8a9096, specular: 0x555555, shininess: 40 })
  };
  return MATS;
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry helpers. A path is [[z, y], …] with ['q', cz, cy, z, y] for a quadratic curve and
// ['c', c1z, c1y, c2z, c2y, z, y] for a cubic; the first point is the start.

function trace(p, path) {
  path.forEach((e, i) => {
    if (i === 0) p.moveTo(e[0], e[1]);
    else if (e[0] === 'q') p.quadraticCurveTo(e[1], e[2], e[3], e[4]);
    else if (e[0] === 'c') p.bezierCurveTo(e[1], e[2], e[3], e[4], e[5], e[6]);
    else p.lineTo(e[0], e[1]);
  });
  return p;
}
function shapeOf(path, holes = []) {
  const s = trace(new THREE.Shape(), path);
  for (const h of holes) s.holes.push(trace(new THREE.Path(), h));
  return s;
}
function extrude(path, width, o) {
  const b = Math.min(o.bevel ?? 0.0015, width * 0.3);
  const geo = new THREE.ExtrudeGeometry(shapeOf(path, o.holes), {
    depth: Math.max(1e-4, width - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b, // the walls sit on the drawn outline; the bevel eats into the caps
    bevelSegments: o.segs ?? 2,
    curveSegments: o.curve ?? 5,
    steps: 1
  });
  return { geo, b };
}
// A side profile in (z, y), extruded across the gun (X), centred on o.x.
function side(path, width, o = {}) {
  const { geo, b } = extrude(path, width, o);
  const c = width / 2 - b + (o.x ?? 0);
  geo.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, c, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  return geo;
}
// A front profile in (x, y), extruded along +Z from o.z.
function front(path, depth, o = {}) {
  const { geo, b } = extrude(path, depth, o);
  geo.translate(0, 0, (o.z ?? 0) + b);
  return geo;
}
// A plan profile in (z, x), extruded up (Y) from o.y.
function plan(path, height, o = {}) {
  const { geo, b } = extrude(path, height, o);
  geo.applyMatrix4(new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, (o.y ?? 0) + b, 1, 0, 0, 0, 0, 0, 0, 1));
  return geo;
}
// A cylinder along Z: radius r0 at z0, r1 at z1.
function cylZ(r0, r1, z0, z1, y = 0, x = 0, seg = 20, open = false) {
  const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, seg, 1, open);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, (z0 + z1) / 2);
  return g;
}
// A cylinder along X, from x0 to x1.
function cylX(r, x0, x1, y, z, seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, x1 - x0, seg);
  g.rotateZ(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, z);
  return g;
}
function cylY(r, y0, y1, x, z, seg = 16) {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg);
  g.translate(x, (y0 + y1) / 2, z);
  return g;
}
// A lathe around the Z axis: [[r, z], …] with z increasing.
function latheZ(pts, seg = 20, y = 0) {
  const g = new THREE.LatheGeometry(
    pts.map(([r, z]) => new THREE.Vector2(r, z)),
    seg
  );
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
// A strap of n bumps from a to b (finger grooves, a palm swell): positive amp bulges outward for a path traced
// clockwise in (z, y), which every outline here is.
function bumps(a, b, n, amp) {
  const out = [];
  const dz = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dz, dy), nz = -dy / L, ny = dz / L;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
    out.push(['q', a[0] + dz * tm + nz * amp * 2, a[1] + dy * tm + ny * amp * 2, a[0] + dz * t1, a[1] + dy * t1]);
  }
  return out;
}
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Normals smoothed across shallow angles, hard across creases. three's toCreasedNormals hashes positions to 1/100 of a
// unit, which is a centimetre here: it runs on the geometry scaled to millimetres.
function crease(g, angle) {
  g.scale(1000, 1000, 1000);
  const r = toCreasedNormals(g, angle);
  r.scale(0.001, 0.001, 0.001);
  return r;
}
// UVs projected on the axis each face looks along, in metres (wood grain and stipple keep one scale on every part).
function boxUV(g) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), v = new THREE.Vector3();
  for (let f = 0; f < p.count; f += 3) {
    a.fromBufferAttribute(p, f);
    b.fromBufferAttribute(p, f + 1);
    c.fromBufferAttribute(p, f + 2);
    n.subVectors(c, b).cross(v.subVectors(a, b));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(p, f + k);
      const [u, w] = ax >= ay && ax >= az ? [v.z, v.y] : ay >= az ? [v.z, v.x] : [v.x, v.y];
      uv[(f + k) * 2] = u;
      uv[(f + k) * 2 + 1] = w;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
// Vertex colours: 1, lifted on the bevels between a side and an edge (wear) or by a custom function.
function colours(g, wear, fn) {
  const n = g.attributes.normal, p = g.attributes.position, col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    let k = 1;
    if (wear) {
      const ax = Math.abs(n.getX(i));
      k += wear * Math.max(0, 1 - Math.abs(ax - 0.6) / 0.3);
    }
    if (fn) k *= fn(p.getX(i), p.getY(i), p.getZ(i));
    col.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// The parts of one weapon, merged per material at the end.
class Kit {
  constructor() {
    this.parts = [];
  }
  // o: { wear, crease (radians, false for flat), keepUV, mod(position attribute), shade(x,y,z) → colour factor, to }
  add(geo, mat, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    g.clearGroups();
    if (o.mod) o.mod(g.attributes.position);
    g = o.crease === false ? (g.computeVertexNormals(), g) : crease(g, o.crease ?? 0.8);
    if (!o.keepUV || !g.attributes.uv) boxUV(g);
    colours(g, o.wear ?? 0, o.shade);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    this.parts.push({ g, mat, to: o.to ?? 'body' });
  }
  // Every part moved so the grip is the origin, merged per material into meshes under the named groups.
  finish(grip, groups) {
    const mats = gunMaterials();
    const byKey = new Map();
    let tris = 0;
    for (const { g, mat, to } of this.parts) {
      g.translate(-grip.x, -grip.y, -grip.z);
      tris += g.attributes.position.count / 3;
      const key = `${to}|${mat}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(g);
    }
    for (const [key, list] of byKey) {
      const [to, mat] = key.split('|');
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mats[mat]);
      mesh.name = mat;
      if (!groups[to]) {
        groups[to] = new THREE.Group();
        groups[to].name = to;
        groups.body.add(groups[to]);
      }
      groups[to].add(mesh);
      for (const g of list) g.dispose();
    }
    return tris;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The weapons. Each builder draws in its own handy coordinates and names the grip point; finish() moves it to 0.

function pistol(k) {
  // A Glock 17-like service pistol: 202 mm long, polymer frame, matte black slide, bore 52 mm above the grip centre.
  const W = 0.025;
  // Round 3: the slide is its own part (`to: 'slide'`): it snaps back and forward with every shot, and locks back empty.
  const SL = { to: 'slide' };
  k.add(side([[-0.030, 0.041], [-0.030, 0.064], [-0.026, 0.068], [0.140, 0.068], [0.1565, 0.058], [0.1565, 0.041]], W, { bevel: 0.0024, segs: 3 }), 'metal', { wear: 0.9, ...SL });
  // Rear serrations: grooves on both sides of the slide.
  for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) k.add(box(0.0006, 0.018, 0.0011, sx * 0.01255, 0.0535, -0.0265 + i * 0.0026), 'black', { crease: false, ...SL });
  // Ejection port with the barrel hood showing through it (on top, offset to the right).
  k.add(box(0.0185, 0.0007, 0.046, -0.0025, 0.0681, 0.052), 'black', { crease: false, ...SL });
  k.add(box(0.0155, 0.0009, 0.042, -0.0028, 0.0684, 0.052), 'barrel', { crease: false });
  k.add(box(0.0007, 0.010, 0.044, -0.0124, 0.0625, 0.052), 'black', { crease: false, ...SL });
  k.add(box(0.0007, 0.008, 0.040, -0.0128, 0.0625, 0.052), 'barrel', { crease: false });
  // Muzzle: the barrel's crown in the slide's nose, and the bore.
  k.add(cylZ(0.0068, 0.0068, 0.152, 0.1568, 0.0515, 0, 18), 'barrel');
  k.add(cylZ(0.0046, 0.0046, 0.1568, 0.1571, 0.0515, 0, 16), 'black', { crease: false });
  // Sights: a U-notch rear and a post front, with white dots.
  k.add(front([[-0.0095, 0], [0.0095, 0], [0.0095, 0.0065], [0.0022, 0.0065], [0.0022, 0.0032], ['q', 0.0022, 0.0018, 0, 0.0018], ['q', -0.0022, 0.0018, -0.0022, 0.0032], [-0.0022, 0.0065], [-0.0095, 0.0065]], 0.008, { z: -0.0255, bevel: 0.0007 }).translate(0, 0.0675, 0), 'metal', { wear: 0.4, ...SL });
  k.add(box(0.0035, 0.0055, 0.006, 0, 0.0705, 0.134), 'metal', SL);
  k.add(box(0.0016, 0.0016, 0.0004, 0, 0.0716, 0.1308), 'white', { crease: false, ...SL });
  for (const sx of [-1, 1]) k.add(box(0.0016, 0.0016, 0.0004, sx * 0.005, 0.0716, -0.0177), 'white', { crease: false, ...SL });
  // Frame, in three widths: the dust cover under the slide, the trigger guard, the grip.
  k.add(side([[-0.031, 0.0408], [0.140, 0.0408], [0.1425, 0.032], [0.136, 0.0225], [0.030, 0.0225], [0.010, 0.026], [-0.031, 0.030]], 0.023, { bevel: 0.0015 }), 'polymer', { wear: 0.25 });
  // Accessory rail grooves on the dust cover.
  for (const sx of [-1, 1]) k.add(box(0.0006, 0.0018, 0.044, sx * 0.01155, 0.027, 0.112), 'black', { crease: false });
  k.add(
    side([[0.018, 0.026], [0.087, 0.026], [0.084, 0.0], [0.089, -0.008], [0.083, -0.0135], ['q', 0.060, -0.0175, 0.030, -0.0165], [0.018, -0.016]], 0.016, {
      holes: [[[0.0755, 0.0165], [0.0755, -0.0035], ['q', 0.0755, -0.0095, 0.0695, -0.0095], [0.036, -0.0095], ['q', 0.0275, -0.0095, 0.0275, 0.0], [0.0275, 0.0165]]],
      bevel: 0.0016
    }),
    'polymer',
    { wear: 0.3 }
  );
  const fTop = [0.0245, -0.016], fBot = [0.0045, -0.079], bBot = [-0.0505, -0.0785], bTop = [-0.021, 0.010];
  k.add(
    side([[-0.030, 0.034], [0.026, 0.034], [0.026, -0.010], fTop, ...bumps(fTop, fBot, 3, 0.0014), [0.0075, -0.080], [-0.0535, -0.080], bBot, ...bumps(bBot, bTop, 1, 0.0028), ['q', -0.024, 0.023, -0.038, 0.0265], [-0.0385, 0.031], [-0.033, 0.034]], 0.0295, { bevel: 0.0042, segs: 3, curve: 5 }),
    'polymer',
    { wear: 0.2 }
  );
  // The magazine (its own part, `to: 'mag'`): the body up inside the grip along its rake, the floorplate below it.
  const MG = { to: 'mag' };
  k.add(side([[-0.046, -0.080], [0.002, -0.080], [0.022, 0.020], [-0.026, 0.020]], 0.022, { bevel: 0.0015 }), 'polymer', MG);
  k.add(side([[-0.0545, -0.0798], [0.0085, -0.0798], [0.0085, -0.0845], [0.004, -0.0868], [-0.0505, -0.0868], [-0.0545, -0.0845]], 0.031, { bevel: 0.0018 }), 'polymer', { wear: 0.2, ...MG });
  k.add(cylZ(0.0045, 0.0045, -0.012, 0.0125, 0.023, 0, 10), 'brass', MG);
  // The trigger.
  k.add(side([[0.0445, 0.0215], [0.0505, 0.0215], ['q', 0.0505, 0.006, 0.0465, -0.0035], [0.0415, -0.0035], ['q', 0.0445, 0.006, 0.0445, 0.0215]], 0.0065, { bevel: 0.0012 }), 'polymer');
  // Slide stop (left) and takedown lever (both sides).
  k.add(box(0.0016, 0.0035, 0.014, 0.0123, 0.0385, 0.040), 'metal');
  for (const sx of [-1, 1]) k.add(box(0.0012, 0.003, 0.006, sx * 0.0118, 0.0345, 0.071), 'metal');
  return { grip: V3(0, 0, 0), muzzle: V3(0, 0.0515, 0.1571), support: null, eject: V3(-0.012, 0.066, 0.052), magAxis: V3(0, -0.98, -0.199), slideTravel: 0.032 };
}

function smg(k) {
  // An MP5-like 9 mm SMG with its stock retracted: 570 mm. Bore 72 mm above the grip centre.
  const bore = 0.072;
  // Receiver: a stamped tube with a raised rib along each side.
  k.add(side([[-0.106, 0.048], [-0.106, 0.104], ['q', -0.106, 0.1125, -0.097, 0.1125], [0.150, 0.1125], [0.150, 0.088], [0.140, 0.084], [0.140, 0.048]], 0.044, { bevel: 0.008, segs: 3 }), 'metal', { wear: 0.6 });
  for (const sx of [-1, 1]) k.add(box(0.002, 0.004, 0.225, sx * 0.0222, 0.093, 0.020), 'metal');
  // Ejection port on the right with the bolt behind it.
  k.add(box(0.0008, 0.016, 0.040, -0.0222, 0.088, 0.035), 'black', { crease: false });
  k.add(box(0.0008, 0.010, 0.032, -0.0226, 0.088, 0.035), 'barrel', { crease: false });
  // Cocking tube over the barrel, out to the front sight.
  k.add(cylZ(0.0115, 0.0115, 0.140, 0.300, 0.1005, 0, 20), 'metal', { wear: 0 });
  k.add(cylZ(0.0125, 0.0125, 0.300, 0.308, 0.1005, 0, 20), 'metal');
  // Cocking handle on the left, folded forward.
  k.add(cylX(0.0028, 0.010, 0.036, 0.104, 0.250, 10), 'metal', { to: 'bolt' });
  k.add(cylX(0.0055, 0.034, 0.042, 0.104, 0.250, 12), 'polymer', { to: 'bolt' });
  // Handguard: slim polymer, flared at the front, with grooves along the sides.
  k.add(side([[0.130, 0.093], [0.290, 0.093], ['q', 0.297, 0.093, 0.297, 0.085], [0.297, 0.050], ['q', 0.297, 0.038, 0.288, 0.038], ['q', 0.280, 0.045, 0.266, 0.046], [0.142, 0.042], [0.130, 0.044]], 0.040, { bevel: 0.009, segs: 3 }), 'polymer', { wear: 0.25 });
  for (const sx of [-1, 1]) for (const y of [0.060, 0.070]) k.add(box(0.0007, 0.0022, 0.104, sx * 0.0201, y, 0.212), 'black', { crease: false });
  // Barrel, three lugs and the crown.
  k.add(cylZ(0.0095, 0.0095, 0.290, 0.350, bore, 0, 20), 'metal');
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    k.add(box(0.005, 0.005, 0.012, Math.cos(a) * 0.0105, bore + Math.sin(a) * 0.0105, 0.342), 'metal');
  }
  k.add(cylZ(0.0098, 0.0092, 0.350, 0.362, bore, 0, 20), 'metal', { wear: 0 });
  k.add(cylZ(0.0045, 0.0045, 0.362, 0.3623, bore, 0, 14), 'black', { crease: false });
  // Front sight: a hooded ring on a base on the cocking tube, with the post inside.
  {
    const ring = new THREE.TorusGeometry(0.0105, 0.0026, 8, 22);
    ring.translate(0, 0.128, 0.292);
    k.add(ring, 'metal', { crease: 1.2 });
    k.add(box(0.012, 0.012, 0.016, 0, 0.115, 0.292), 'metal');
    k.add(box(0.0018, 0.008, 0.003, 0, 0.122, 0.292), 'metal');
  }
  // Rear drum sight on its mount.
  k.add(box(0.026, 0.008, 0.026, 0, 0.1165, -0.082), 'metal');
  k.add(cylX(0.0105, -0.011, 0.011, 0.128, -0.082, 18), 'metal', { crease: 1.0 });
  for (const sx of [-1, 1]) k.add(box(0.003, 0.016, 0.010, sx * 0.010, 0.128, -0.068), 'metal');
  // Magazine well and the curved 30-round magazine.
  k.add(side([[0.046, 0.050], [0.100, 0.050], [0.100, 0.026], [0.046, 0.026]], 0.036, { bevel: 0.003 }), 'metal', { wear: 0.5 });
  k.add(side([[0.053, 0.046], [0.092, 0.046], ['q', 0.094, -0.045, 0.127, -0.119], [0.131, -0.124], [0.098, -0.134], ['q', 0.060, -0.048, 0.053, 0.046]], 0.024, { bevel: 0.002, curve: 10 }), 'metal', { wear: 0.8, to: 'mag' });
  // Lower: the polymer trigger group with the grip, the guard and the trigger.
  const fTop = [0.0235, -0.004], fBot = [0.001, -0.080], bBot = [-0.046, -0.082], bTop = [-0.0175, 0.028];
  k.add(
    side([[-0.088, 0.054], [0.048, 0.054], [0.054, 0.032], ['q', 0.054, -0.006, 0.040, -0.009], ['q', 0.030, -0.010, fTop[0], fTop[1]], ...bumps(fTop, fBot, 3, 0.0013), [0.003, -0.083], [-0.047, -0.086], bBot, ...bumps(bBot, bTop, 1, 0.003), ['q', -0.022, 0.036, -0.050, 0.036], [-0.088, 0.040]], 0.032, {
      holes: [[[0.025, 0.036], [0.045, 0.036], ['q', 0.047, 0.004, 0.036, 0.0], [0.030, 0.0], ['q', 0.0255, 0.004, 0.025, 0.010]]],
      bevel: 0.0045,
      segs: 3,
      curve: 5
    }),
    'polymer',
    { wear: 0.2 }
  );
  k.add(side([[0.034, 0.040], [0.040, 0.040], ['q', 0.041, 0.020, 0.036, 0.010], [0.032, 0.010], ['q', 0.035, 0.022, 0.034, 0.040]], 0.006, { bevel: 0.001 }), 'metal');
  k.add(box(0.003, 0.010, 0.012, 0.0175, 0.044, -0.030), 'metal'); // selector
  // Retracted stock: two struts along the receiver and the curved butt plate with its rubber pad.
  for (const sx of [-1, 1]) k.add(cylZ(0.0045, 0.0045, -0.192, -0.020, 0.090, sx * 0.0245, 12), 'metal');
  k.add(side([[-0.196, 0.104], [-0.186, 0.104], ['q', -0.176, 0.040, -0.186, -0.030], [-0.196, -0.030], ['q', -0.188, 0.040, -0.196, 0.104]], 0.056, { bevel: 0.004, curve: 8 }), 'metal', { wear: 0.6 });
  k.add(side([[-0.204, 0.100], [-0.195, 0.104], ['q', -0.187, 0.040, -0.195, -0.030], [-0.204, -0.028], ['q', -0.196, 0.040, -0.204, 0.100]], 0.054, { bevel: 0.004, curve: 8 }), 'rubber');
  k.add(box(0.058, 0.010, 0.016, 0, 0.090, -0.186), 'metal');
  return { grip: V3(0, 0, 0), muzzle: V3(0, bore, 0.3625), support: V3(0, 0.05, 0.215), eject: V3(-0.023, 0.088, 0.035), magAxis: V3(0, -1, 0.12), boltTravel: 0.07, butt: V3(0, 0.037, -0.205) };
}

function shotgun(k, pumpKit) {
  // A Remington 870-like pump: 18.5" barrel, walnut stock and forend, ~1.0 m. Drawn with the wrist at about
  // (0.0, 0.025); the bore sits 33 mm above it.
  const bore = 0.058, tube = 0.030;
  // Receiver.
  k.add(side([[0.030, 0.012], [0.030, 0.066], ['q', 0.033, 0.080, 0.050, 0.080], [0.232, 0.080], ['q', 0.237, 0.080, 0.237, 0.075], [0.237, 0.017], [0.226, 0.010], [0.030, 0.010]], 0.034, { bevel: 0.0028, segs: 3 }), 'metal', { wear: 0.9 });
  // Ejection port (right) with the bolt, and the trigger-plate pins.
  k.add(box(0.0008, 0.024, 0.074, -0.0172, 0.058, 0.150), 'black', { crease: false });
  k.add(box(0.0008, 0.015, 0.030, -0.0176, 0.060, 0.128), 'barrel', { crease: false });
  for (const z of [0.070, 0.165]) k.add(cylX(0.0028, -0.0175, 0.0175, 0.020, z, 12), 'steel');
  // Barrel with a bead, and the magazine tube with its cap, joined by the barrel ring.
  k.add(cylZ(0.0108, 0.0105, 0.230, 0.700, bore, 0, 22), 'metal', { wear: 0 });
  k.add(cylZ(0.0106, 0.0106, 0.699, 0.701, bore, 0, 22), 'steel');
  k.add(cylZ(0.0090, 0.0090, 0.7012, 0.7015, bore, 0, 18), 'black', { crease: false });
  {
    const bead = new THREE.SphereGeometry(0.0023, 10, 6);
    bead.translate(0, bore + 0.0115, 0.690);
    k.add(bead, 'brass', { crease: 1.2 });
  }
  k.add(cylZ(0.0115, 0.0115, 0.230, 0.565, tube, 0, 20), 'metal');
  k.add(latheZ([[0.0001, 0.590], [0.006, 0.5895], [0.010, 0.5875], [0.0125, 0.584], [0.0128, 0.578], [0.0128, 0.565], [0.0115, 0.563]].reverse(), 20, tube), 'metal', { crease: 1.0 });
  k.add(cylZ(0.0135, 0.0135, 0.548, 0.561, tube, 0, 20), 'metal');
  k.add(cylZ(0.0125, 0.0125, 0.548, 0.561, bore, 0, 20), 'metal');
  k.add(box(0.012, bore - tube, 0.013, 0, (bore + tube) / 2, 0.5545), 'metal');
  // Sling swivel on the magazine cap.
  {
    const ring = new THREE.TorusGeometry(0.008, 0.0014, 5, 10);
    ring.rotateY(Math.PI / 2);
    ring.translate(0, tube - 0.020, 0.578);
    k.add(ring, 'steel', { crease: 1.2 });
    k.add(box(0.004, 0.008, 0.006, 0, tube - 0.012, 0.578), 'metal');
  }
  // Trigger plate with the guard, the trigger and the cross-bolt safety.
  k.add(
    side([[0.026, 0.0135], [0.142, 0.0135], [0.142, 0.006], ['q', 0.140, -0.030, 0.110, -0.031], [0.068, -0.031], ['q', 0.044, -0.031, 0.030, -0.010], [0.026, -0.004]], 0.019, {
      holes: [[[0.068, 0.006], [0.126, 0.006], ['q', 0.125, -0.020, 0.104, -0.022], [0.077, -0.022], ['q', 0.066, -0.022, 0.066, -0.010]]],
      bevel: 0.0018
    }),
    'metal',
    { wear: 0.7 }
  );
  k.add(side([[0.083, 0.010], [0.089, 0.010], ['q', 0.090, -0.006, 0.085, -0.016], [0.081, -0.016], ['q', 0.084, -0.004, 0.083, 0.010]], 0.006, { bevel: 0.001 }), 'steel');
  k.add(cylX(0.0032, -0.012, 0.012, 0.004, 0.137, 12), 'steel');
  // Stock: walnut, thinner at the wrist, a black recoil pad.
  const taper = (p) => {
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * lerp(0.84, 1, smooth(0.03, -0.09, p.getZ(i))));
  };
  k.add(
    side([[0.034, 0.072], ['q', 0.012, 0.070, -0.050, 0.034], [-0.262, 0.011], ['q', -0.268, 0.0105, -0.269, 0.005], [-0.278, -0.124], ['q', -0.279, -0.131, -0.270, -0.131], ['q', -0.160, -0.084, -0.060, -0.022], ['q', -0.020, -0.004, 0.030, 0.006], [0.034, 0.006]], 0.041, { bevel: 0.0085, segs: 2, curve: 6 }),
    'walnut',
    { mod: taper, crease: 1.0 }
  );
  k.add(side([[-0.2605, 0.0115], [-0.2795, 0.0115], ['q', -0.2830, 0.008, -0.2900, -0.125], ['q', -0.2905, -0.1335, -0.282, -0.1335], [-0.270, -0.1325], ['q', -0.278, -0.131, -0.277, -0.124], [-0.267, 0.005]], 0.0425, { bevel: 0.005, curve: 4 }), 'rubber');
  {
    const ring = new THREE.TorusGeometry(0.008, 0.0014, 5, 10);
    ring.rotateY(Math.PI / 2);
    ring.translate(0, -0.120, -0.212);
    k.add(ring, 'steel', { crease: 1.2 });
  }
  // Pump: a grooved walnut forend around the tube, oval (taller than wide) so the barrel sits in its top.
  const pts = [[0.012, 0.325], [0.0215, 0.325], [0.0250, 0.331]];
  const z0 = 0.345, n = 7, pitch = 0.02;
  for (let i = 0; i < n; i++) {
    const z = z0 + i * pitch;
    pts.push([0.0255, z], [0.0255, z + pitch - 0.0055], [0.0228, z + pitch - 0.004], [0.0228, z + pitch - 0.0015]);
  }
  pts.push([0.0255, z0 + n * pitch], [0.0255, 0.497], [0.0242, 0.502], [0.021, 0.505], [0.012, 0.505]);
  const forend = latheZ(pts, 16);
  forend.scale(1, 1.3, 1);
  forend.translate(0, tube + 0.007, 0);
  pumpKit.add(forend, 'walnut', { crease: 0.9 });
  return { grip: V3(0, 0.025, -0.004), muzzle: V3(0, bore, 0.7015), support: V3(0, tube + 0.005, 0.415), eject: V3(-0.018, 0.058, 0.150), loadPort: V3(0, 0.005, 0.12), butt: V3(0, -0.06, -0.28) };
}

function rifle(k) {
  // An M4-like carbine: carry handle, round ribbed handguard, A-frame front sight, birdcage, stock pulled out: 0.86 m.
  const bore = 0.068;
  // Upper receiver.
  k.add(side([[-0.074, 0.046], [-0.074, 0.082], ['q', -0.074, 0.087, -0.069, 0.087], [0.128, 0.087], [0.132, 0.082], [0.132, 0.046]], 0.026, { bevel: 0.0025, segs: 3 }), 'alu', { wear: 0.8 });
  // Carry handle with the rear sight housing.
  k.add(
    side([[-0.068, 0.0865], [-0.068, 0.118], [-0.061, 0.128], [-0.041, 0.128], [-0.036, 0.124], [0.086, 0.124], ['q', 0.098, 0.124, 0.100, 0.112], [0.105, 0.0865]], 0.019, {
      holes: [[[-0.026, 0.093], [0.083, 0.093], ['q', 0.091, 0.093, 0.090, 0.101], [0.088, 0.115], [-0.022, 0.115], ['q', -0.029, 0.115, -0.029, 0.107]]],
      bevel: 0.002,
      segs: 2
    }),
    'alu',
    { wear: 0.8 }
  );
  k.add(cylX(0.0055, -0.0125, 0.0125, 0.112, -0.052, 14), 'alu'); // windage drum
  k.add(box(0.004, 0.006, 0.004, 0, 0.1305, -0.060), 'alu'); // aperture
  // Charging handle, forward assist, ejection port with the bolt, brass deflector.
  k.add(box(0.030, 0.006, 0.008, 0, 0.083, -0.078), 'alu', { to: 'bolt' });
  k.add(cylZ(0.0065, 0.0065, -0.062, -0.030, 0.074, -0.0145, 14), 'alu');
  k.add(cylZ(0.0075, 0.0075, -0.070, -0.062, 0.074, -0.0145, 14), 'alu');
  k.add(box(0.0008, 0.016, 0.060, -0.0131, 0.068, 0.020), 'black', { crease: false });
  k.add(box(0.0008, 0.009, 0.028, -0.0135, 0.069, 0.004), 'barrel', { crease: false });
  k.add(box(0.006, 0.014, 0.010, -0.014, 0.074, -0.018), 'alu');
  // Lower receiver with the magazine well; guard; grip.
  k.add(side([[-0.074, 0.0465], [0.130, 0.0465], [0.130, 0.030], [0.124, 0.022], [0.126, -0.018], [0.121, -0.025], [0.056, -0.025], [0.056, -0.008], [0.052, 0.016], [-0.030, 0.016], [-0.058, 0.014], ['q', -0.074, 0.018, -0.074, 0.032]], 0.025, { bevel: 0.002, segs: 2 }), 'alu', { wear: 0.8 });
  k.add(
    side([[-0.004, 0.020], [0.056, 0.020], [0.056, -0.003], ['q', 0.056, -0.0125, 0.047, -0.0125], [0.006, -0.0125], [-0.004, -0.004]], 0.016, {
      holes: [[[0.014, 0.0165], [0.052, 0.0165], [0.052, -0.0035], ['q', 0.052, -0.0085, 0.047, -0.0085], [0.017, -0.0085], ['q', 0.014, -0.0085, 0.014, -0.004]]],
      bevel: 0.0014
    }),
    'alu',
    { wear: 0.5 }
  );
  k.add(side([[0.030, 0.017], [0.0355, 0.017], ['q', 0.036, 0.004, 0.032, -0.004], [0.0285, -0.004], ['q', 0.031, 0.006, 0.030, 0.017]], 0.006, { bevel: 0.001 }), 'steel');
  const fTop = [0.012, 0.016], fBot = [-0.0375, -0.090], bBot = [-0.0775, -0.090], bTop = [-0.0285, 0.016];
  k.add(side([fTop, ...bumps(fTop, fBot, 2, 0.0022), ['q', -0.040, -0.096, -0.058, -0.096], ['q', -0.076, -0.096, bBot[0], bBot[1]], ...bumps(bBot, bTop, 1, 0.002), [-0.050, 0.016]], 0.030, { bevel: 0.0045, segs: 3 }), 'polymer', { wear: 0.2 });
  // Pins, selector (left), bolt catch (left), magazine release (right).
  for (const [z, y] of [[0.123, 0.040], [-0.060, 0.040], [0.010, 0.030], [0.030, 0.030]]) k.add(cylX(0.0024, -0.0130, 0.0130, y, z, 10), 'steel');
  k.add(box(0.002, 0.006, 0.016, 0.0132, 0.032, -0.036), 'alu');
  k.add(box(0.002, 0.012, 0.008, 0.0132, 0.030, 0.064), 'alu');
  k.add(cylX(0.0045, -0.0145, -0.012, 0.010, 0.058, 12), 'alu');
  // Magazine: a curved 30-rounder.
  k.add(side([[0.060, 0.020], [0.118, 0.020], ['q', 0.120, -0.075, 0.150, -0.158], [0.154, -0.161], [0.151, -0.168], [0.096, -0.186], [0.092, -0.180], ['q', 0.062, -0.085, 0.060, 0.020]], 0.0215, { bevel: 0.0017, curve: 10 }), 'alu', { wear: 1.0, to: 'mag' });
  for (const sx of [-1, 1]) k.add(side([[0.072, -0.030], [0.106, -0.030], ['q', 0.110, -0.090, 0.134, -0.148], [0.110, -0.156], ['q', 0.084, -0.090, 0.072, -0.030]], 0.0008, { bevel: 0, curve: 8, x: sx * 0.0109 }), 'metal', { crease: false, to: 'mag' });
  // Handguard: round, ribbed along its length, between the delta ring and the cap.
  {
    const hg = new THREE.CylinderGeometry(0.0255, 0.0245, 0.168, 32, 1, true);
    const p = hg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const step = Math.round((a / (Math.PI * 2)) * 32);
      const s = step % 2 === 0 ? 1 : 0.93;
      p.setX(i, p.getX(i) * s);
      p.setZ(i, p.getZ(i) * s);
    }
    hg.rotateX(Math.PI / 2);
    hg.translate(0, bore - 0.002, 0.134 + 0.084);
    k.add(hg, 'polymer', { crease: 0.3 });
  }
  k.add(latheZ([[0.020, 0.128], [0.0305, 0.129], [0.031, 0.133], [0.029, 0.136], [0.0262, 0.137]], 24, bore - 0.002), 'alu', { crease: 1.0 });
  k.add(cylZ(0.0265, 0.0255, 0.301, 0.309, bore - 0.002, 0, 24), 'metal');
  // Barrel: the M4 step, the A-frame front sight with its bayonet lug and swivel, the birdcage.
  k.add(cylZ(0.0095, 0.0095, 0.300, 0.395, bore, 0, 20), 'metal');
  k.add(cylZ(0.0082, 0.0082, 0.395, 0.448, bore, 0, 20), 'metal');
  // The A-frame: a base around the barrel, two ears guarding the post.
  k.add(side([[0.312, 0.054], [0.346, 0.054], [0.346, 0.080], [0.338, 0.0905], [0.316, 0.0905], [0.312, 0.082]], 0.020, { bevel: 0.0016 }), 'metal', { wear: 0.6 });
  for (const sx of [-1, 1]) k.add(side([[0.317, 0.089], [0.337, 0.089], [0.331, 0.128], [0.323, 0.128]], 0.0032, { bevel: 0.0008, x: sx * 0.0078 }), 'metal', { wear: 0.6 });
  k.add(box(0.0024, 0.032, 0.0024, 0, 0.106, 0.327), 'metal');
  k.add(box(0.010, 0.010, 0.020, 0, 0.049, 0.355), 'metal');
  {
    const ring = new THREE.TorusGeometry(0.0085, 0.0015, 5, 10);
    ring.rotateY(Math.PI / 2);
    ring.translate(0, 0.040, 0.330);
    k.add(ring, 'steel', { crease: 1.2 });
  }
  k.add(cylZ(0.0108, 0.0108, 0.448, 0.492, bore, 0, 20), 'metal', { wear: 0 });
  k.add(cylZ(0.0062, 0.0062, 0.4921, 0.4924, bore, 0, 14), 'black', { crease: false });
  for (const a of [Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6, -Math.PI / 6, (-5 * Math.PI) / 6]) {
    const slot = box(0.0006, 0.0034, 0.024, 0.0108, 0, 0.474);
    slot.rotateZ(a);
    slot.translate(0, bore, 0);
    k.add(slot, 'black', { crease: false });
  }
  // Buffer tube and the collapsible stock, pulled out.
  k.add(cylZ(0.0148, 0.0148, -0.330, -0.074, 0.062, 0, 20), 'alu');
  k.add(cylZ(0.0172, 0.0172, -0.090, -0.078, 0.062, 0, 16), 'alu');
  k.add(side([[-0.215, 0.079], [-0.342, 0.083], ['q', -0.352, 0.083, -0.353, 0.076], [-0.361, -0.049], ['q', -0.362, -0.057, -0.353, -0.057], [-0.336, -0.053], ['q', -0.296, -0.004, -0.262, 0.040], [-0.228, 0.045], ['q', -0.215, 0.047, -0.215, 0.058]], 0.038, {
    bevel: 0.003,
    segs: 2
  }), 'polymer', { wear: 0.3 });
  k.add(side([[-0.352, 0.084], [-0.362, 0.084], [-0.372, -0.058], [-0.362, -0.060]], 0.042, { bevel: 0.003 }), 'rubber');
  {
    const ring = new THREE.TorusGeometry(0.008, 0.0014, 5, 10);
    ring.rotateY(Math.PI / 2);
    ring.translate(0, -0.056, -0.336);
    k.add(ring, 'steel', { crease: 1.2 });
  }
  return { grip: V3(0, -0.032, -0.032), muzzle: V3(0, bore, 0.4924), support: V3(0, bore - 0.020, 0.215), eject: V3(-0.014, 0.069, 0.012), magAxis: V3(0, -1, 0.08), boltTravel: 0.06, butt: V3(0, 0.012, -0.37) };
}

function bat(k) {
  // A 33" wooden bat (0.84 m): knob, a thin handle, the taper and the barrel, a rounded end. Grip tape on the handle.
  // Drawn from the knob's end at z = 0; the right hand holds just above the knob.
  const prof = [[0.0001, 0], [0.016, 0.0005], [0.0235, 0.003], [0.0265, 0.007], [0.0262, 0.0105], [0.020, 0.0135], [0.0145, 0.016], [0.0128, 0.020], [0.0124, 0.060], [0.0127, 0.170], [0.0136, 0.270], [0.0158, 0.350], [0.0205, 0.440], [0.0262, 0.520], [0.0308, 0.590], [0.0330, 0.660], [0.0336, 0.740], [0.0332, 0.795], [0.0315, 0.818], [0.0275, 0.831], [0.020, 0.8385], [0.010, 0.8415], [0.0001, 0.842]];
  k.add(latheZ(prof, 22), 'ash', { crease: 1.2 });
  // The tape, a wrap over the handle with tapered ends.
  const tapePts = [[0.0127, 0.019], [0.0141, 0.022]];
  for (let z = 0.03; z <= 0.20; z += 0.02) tapePts.push([0.0124 + (0.0003 * (z - 0.06)) / 0.11 + 0.0014, z]);
  tapePts.push([0.0143, 0.212], [0.0128, 0.216]);
  k.add(latheZ(tapePts, 22), 'tape', { crease: 1.2, keepUV: true });
  return { grip: V3(0, 0, 0.045), muzzle: V3(0, 0, 0.842), support: V3(0, 0, 0.135) };
}

function knife(k) {
  // A combat knife: 17 cm clip-point steel blade, edge down (-Y), a black grip with finger grooves, a crossguard.
  const spine = 0.0105, tip = [0.228, -0.002], g0 = [0.0665, -0.0062];
  // The flat of the blade (spine to the grind line) and the ground bevel (grind line to the edge), so the grind line
  // is a real edge in the mesh. Both thin towards the point.
  const toTip = (z) => lerp(1, 0.25, smooth(0.15, 0.228, z));
  const edgeY = (z) => (z < 0.168 ? -0.0198 : lerp(-0.0205, -0.002, (z - 0.168) / 0.06));
  const grindY = (z) => lerp(g0[1], tip[1], (z - g0[0]) / (tip[0] - g0[0]));
  k.add(side([[0.056, spine], [0.165, spine], ['q', 0.192, spine, ...tip], g0, [0.056, g0[1]]], 0.0055, { bevel: 0.0003, segs: 1, curve: 10 }), 'blade', {
    mod: (p) => {
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * toTip(p.getZ(i)));
    },
    crease: 0.35
  });
  k.add(side([g0, tip, ['q', 0.206, -0.0195, 0.168, -0.0205], [0.076, -0.0195], ['q', 0.068, -0.0195, 0.0665, -0.0145], [0.056, -0.0145], [0.056, g0[1]]], 0.0055, { bevel: 0.0003, segs: 1, curve: 10 }), 'blade', {
    mod: (p) => {
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), z = p.getZ(i);
        if (z <= g0[0] + 1e-4) continue;
        const t = Math.min(1, Math.max(0, (y - edgeY(z)) / Math.max(1e-5, grindY(z) - edgeY(z))));
        p.setX(i, p.getX(i) * lerp(0.1, 1, t) * toTip(z));
      }
    },
    crease: 0.35,
    shade: () => 1.12
  });
  // Guard, grip with finger grooves, pommel.
  k.add(front([[0.0125, -0.004], ['q', 0.0125, 0.020, 0, 0.020], ['q', -0.0125, 0.020, -0.0125, -0.004], ['q', -0.0125, -0.028, 0, -0.028], ['q', 0.0125, -0.028, 0.0125, -0.0045]], 0.007, { z: 0.050, bevel: 0.0015 }), 'metal', { wear: 0.5 });
  const gTop = [[-0.060, 0.010], [0.050, 0.0115], [0.050, -0.0135]];
  const grooves = [['q', 0.042, -0.0105, 0.033, -0.0155], ['q', 0.024, -0.0195, 0.015, -0.0150], ['q', 0.006, -0.0110, -0.003, -0.0155], ['q', -0.012, -0.0195, -0.021, -0.0150], ['q', -0.034, -0.0120, -0.052, -0.0150]];
  k.add(side([...gTop, ...grooves, ['q', -0.060, -0.016, -0.0605, -0.006], ['q', -0.0605, 0.009, -0.0602, 0.0099]], 0.0225, { bevel: 0.0045, segs: 3, curve: 5 }), 'rubber');
  k.add(front([[0.011, -0.004], ['q', 0.011, 0.012, 0, 0.012], ['q', -0.011, 0.012, -0.011, -0.004], ['q', -0.011, -0.020, 0, -0.020], ['q', 0.011, -0.020, 0.011, -0.0045]], 0.010, { z: -0.069, bevel: 0.0028, segs: 3 }), 'metal', { wear: 0.5 });
  return { grip: V3(0, 0, 0), muzzle: V3(0, -0.002, 0.228), support: null };
}

const BUILDERS = { pistol, smg, shotgun, rifle, bat, knife };

export function buildWeapon(kind) {
  const build = BUILDERS[kind];
  if (!build) throw new Error(`buildWeapon: no weapon "${kind}"`);
  const group = new THREE.Group();
  group.name = `weapon:${kind}`;
  const k = new Kit();
  const pk = new Kit();
  const spec = build(k, pk);
  let pump = null;
  const groups = { body: group };
  let tris = k.finish(spec.grip, groups);
  if (pk.parts.length) {
    pump = new THREE.Group();
    pump.name = 'pump';
    group.add(pump);
    tris += pk.finish(spec.grip, { body: pump });
  }
  const shift = (v) => v && v.clone().sub(spec.grip);
  const bb = new THREE.Box3().setFromObject(group);
  group.userData = { kind, length: +(bb.max.z - bb.min.z).toFixed(3), tris };
  // Round 3: the moving parts for the weapon rig (rig.mjs): the slide, the magazine, the charging handle; where the
  // brass leaves (eject), which way the magazine drops (magAxis), the shotgun's loading port, the stock's butt.
  return {
    group, muzzle: shift(spec.muzzle), support: shift(spec.support), pump,
    slide: groups.slide ?? null, mag: groups.mag ?? null, bolt: groups.bolt ?? null,
    eject: shift(spec.eject), loadPort: shift(spec.loadPort), butt: shift(spec.butt),
    magAxis: spec.magAxis?.clone().normalize() ?? null, slideTravel: spec.slideTravel ?? 0, boltTravel: spec.boltTravel ?? 0
  };
}

// ---------------------------------------------------------------------------------------------------------------
// On the floor.

// Puts an object's bounding box on the floor, centred on the origin.
function onFloor(obj) {
  const g = new THREE.Group();
  g.add(obj);
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(obj);
  const c = bb.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= bb.min.y;
  return g;
}

export function buildPickup(kind) {
  const { group } = buildWeapon(kind);
  // Lying on its right side (the ejection port down), the left side up.
  group.rotation.z = Math.PI / 2;
  const g = onFloor(group);
  g.name = `pickup:${kind}`;
  return g;
}

function meshes(k) {
  const g = new THREE.Group();
  k.finish(V3(0, 0, 0), { body: g });
  return g;
}

// A magazine drawn upright in (z, y) and the profile of its follower lips.
function glockMag(k, x = 0) {
  // Upright: the floorplate at y = 0, the feed lips at the top with a round showing.
  k.add(side([[-0.019, 0.0], [0.019, 0.0], [0.019, 0.007], [0.016, 0.009], [0.016, 0.127], [-0.016, 0.127], [-0.016, 0.009], [-0.019, 0.007]], 0.022, { bevel: 0.0015, x }), 'polymer', { wear: 0.2 });
  k.add(cylZ(0.0045, 0.0045, -0.010, 0.006, 0.1285, x, 12), 'brass');
}

function ammoLabel(text, sub, bg, fg) {
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 160 });
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = fg;
  g.fillRect(0, 104, 256, 22);
  g.font = 'bold 56px Arial, Helvetica, sans-serif';
  g.textAlign = 'center';
  g.fillText(text, 128, 78);
  g.fillStyle = bg;
  g.font = 'bold 16px Arial, Helvetica, sans-serif';
  g.fillText(sub, 128, 121);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function labelledBox(w, h, d, label, side) {
  const lab = new THREE.MeshPhongMaterial({ map: label, shininess: 12, specular: 0x222222 });
  const s = new THREE.MeshPhongMaterial({ color: side, shininess: 10, specular: 0x222222 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [s, s, lab, s, s, s]);
  m.position.y = h / 2;
  return m;
}

function shell(k, len = 0.068) {
  // A 12-gauge shell along +Z from 0: a brass head with its rim, the red hull, the crimp.
  k.add(cylZ(0.0112, 0.0112, 0, 0.0018, 0, 0, 18), 'brass');
  k.add(cylZ(0.0104, 0.0104, 0.0018, 0.016, 0, 0, 18), 'brass');
  k.add(cylZ(0.0101, 0.0101, 0.016, len - 0.002, 0, 0, 18), 'hull', { crease: 0.6 });
  k.add(cylZ(0.0101, 0.0088, len - 0.002, len, 0, 0, 18), 'hull');
  k.add(cylZ(0.0025, 0.0025, -0.0002, 0, 0, 0, 10), 'steel', { crease: false }); // primer
}

export function buildAmmo(kind) {
  const root = new THREE.Group();
  root.name = `ammo:${kind}`;
  if (kind === 'pistol') {
    // A box of fifty 9 mm and a spare magazine beside it.
    const b = labelledBox(0.064, 0.036, 0.112, ammoLabel('9mm', '50 CARTRIDGES · LUGER', '#1f3f6d', '#e3b23c'), 0x1f3f6d);
    b.rotation.y = Math.PI / 2;
    b.position.set(-0.03, 0, 0);
    root.add(b);
    const k = new Kit();
    glockMag(k);
    const mag = meshes(k);
    mag.rotation.set(0, 0.35, Math.PI / 2);
    const m = onFloor(mag);
    m.position.set(0.075, 0, 0.0);
    root.add(m);
  } else if (kind === 'shells') {
    const b = labelledBox(0.075, 0.065, 0.085, ammoLabel('12 GA', '00 BUCK · 2¾" · 10 SHELLS', '#8f1d18', '#f0e6d0'), 0x8f1d18);
    b.rotation.y = 0.3;
    root.add(b);
    for (const [x, z, a] of [[0.085, -0.03, 0.4], [0.10, 0.02, -0.25], [0.07, 0.06, 1.2], [-0.07, 0.07, 2.4]]) {
      const k = new Kit();
      shell(k);
      const s = meshes(k);
      s.position.set(x, 0.0104, z);
      s.rotation.y = a;
      root.add(s);
    }
  } else if (kind === 'medkit') {
    // A white first-aid case with a green cross, a grey handle and two latches.
    const k = new Kit();
    const L = 0.32, D = 0.21, r = 0.03;
    const rr = [[-L / 2 + r, -D / 2], [L / 2 - r, -D / 2], ['q', L / 2, -D / 2, L / 2, -D / 2 + r], [L / 2, D / 2 - r], ['q', L / 2, D / 2, L / 2 - r, D / 2], [-L / 2 + r, D / 2], ['q', -L / 2, D / 2, -L / 2, D / 2 - r], [-L / 2, -D / 2 + r], ['q', -L / 2, -D / 2, -L / 2 + r, -D / 2]];
    k.add(plan(rr, 0.068, { y: 0, bevel: 0.008, segs: 3 }), 'caseWhite');
    k.add(plan(rr, 0.034, { y: 0.0685, bevel: 0.008, segs: 3 }), 'caseWhite');
    const a = 0.028, c = 0.085;
    k.add(plan([[-a, -c], [a, -c], [a, -a], [c, -a], [c, a], [a, a], [a, c], [-a, c], [-a, a], [-c, a], [-c, -a], [-a, -a]], 0.0025, { y: 0.1018, bevel: 0.0008 }), 'green');
    // Handle on the front long side (+X), latches beside it.
    k.add(side([[-0.055, 0.050], [0.055, 0.050], ['q', 0.060, 0.050, 0.060, 0.044], [0.060, 0.030], [0.048, 0.030], [0.048, 0.038], [-0.048, 0.038], [-0.048, 0.030], [-0.060, 0.030], [-0.060, 0.044], ['q', -0.060, 0.050, -0.055, 0.050]], 0.016, { bevel: 0.003, x: D / 2 + 0.006 }), 'grey');
    for (const z of [-0.105, 0.105]) k.add(box(0.008, 0.026, 0.022, D / 2 + 0.002, 0.068, z), 'grey');
    const g = meshes(k);
    g.rotation.y = Math.PI / 2;
    root.add(g);
  } else if (kind === 'smg' || kind === 'rifle') {
    // Two spare magazines.
    for (const [i, x] of [[0, -0.035], [1, 0.035]]) {
      const k = new Kit();
      if (kind === 'smg') k.add(side([[0.053, 0.046], [0.092, 0.046], ['q', 0.094, -0.045, 0.127, -0.119], [0.131, -0.124], [0.098, -0.134], ['q', 0.060, -0.048, 0.053, 0.046]], 0.024, { bevel: 0.002, curve: 10 }), 'metal', { wear: 0.8 });
      else k.add(side([[0.060, 0.065], [0.118, 0.065], ['q', 0.120, -0.075, 0.150, -0.158], [0.154, -0.161], [0.151, -0.168], [0.096, -0.186], [0.092, -0.180], ['q', 0.062, -0.085, 0.060, 0.065]], 0.0215, { bevel: 0.0017, curve: 10 }), 'alu', { wear: 1.0 });
      const m = meshes(k);
      m.rotation.set(0, 0, Math.PI / 2);
      const f = onFloor(m);
      f.position.x = x;
      f.position.z = i * 0.02;
      root.add(f);
    }
  } else throw new Error(`buildAmmo: no ammo "${kind}"`);
  return onFloor(root);
}

export const WEAPON_KINDS = Object.keys(BUILDERS);
