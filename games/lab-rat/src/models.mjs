// Every model in the game, built from primitives in code: the gun and your hands, the three species from the Fold,
// and the people. Round 3 (visuals) moved them all here so `studio.html` can show each one on a turntable.
//
// Three tricks do most of the work:
//   organic()  welds a primitive's seams and pushes every vertex along its normal by a smooth noise, so a sphere
//              becomes a lump of flesh;
//   paint()    bakes a colour gradient into the vertices (a pale belly, a dark back, mottling), no textures needed;
//   rim()      adds a faint fresnel edge light, so a silhouette still reads in the dark without lighting the room.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------------------
// helpers

/** A smooth, deterministic 3D noise: a few incommensurate sines. Plenty for lumps and mottling. */
export function wobble(x, y, z, s = 0) {
  return (
    Math.sin(x * 1.7 + s) * Math.sin(y * 2.3 + s * 1.3) * Math.sin(z * 1.9 + s * 0.7) +
    0.5 * Math.sin(x * 4.1 - s) * Math.sin(y * 3.7 + s) * Math.sin(z * 4.3 + s * 2.1)
  );
}

/** Weld the seams, push each vertex along its normal by noise, re-smooth. The geometry loses its UVs. */
export function organic(geo, amp = 0.02, freq = 6, seed = 0) {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = wobble(x * freq, y * freq, z * freq, seed) * amp;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Bake a colour per vertex: fn(x, y, z, color) sets `color`. Pair with `vertexColors: true` and a white material. */
export function paint(geo, fn) {
  const p = geo.attributes.position, a = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), c);
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const mix = (out, a, b, k) => out.setHex(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, k)));

/** A tube along a smooth curve through `pts`, radius r0 at the start tapering to r1 at the end. */
export function taperTube(pts, r0, r1, segs = 10, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = geo.attributes.position;
  for (let i = 0; i <= segs; i++) {
    const c = curve.getPointAt(i / segs), r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** A lathe from [[radius, y], ...], bottom to top. */
const lathe = (prof, segs = 24) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), segs);

/** Add a soft fresnel edge light to a standard/physical material. Strength is the edge's emissive brightness. */
export function rim(mat, color = 0x9ab0c8, strength = 0.25, power = 2.6) {
  const u = { value: new THREE.Color(color).multiplyScalar(strength) }, pw = { value: power };
  mat.userData.rim = u;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = u;
    sh.uniforms.rimPow = pw;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimPow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += rimColor * pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), rimPow);'
      );
  };
  mat.customProgramCacheKey = () => 'rim';
  return mat;
}

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...o });
const phys = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.5, metalness: 0, ...o });

const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
  // a vertex-coloured material on a geometry with no colours would render black: give it the material's base tint
  if (mat.vertexColors && !geo.attributes.color) paint(geo, (x, y, z, c) => c.setHex(mat.userData.base ?? 0xffffff));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
};
const group = (parent, x = 0, y = 0, z = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent?.add(g);
  return g;
};

/** Turn `obj` so its local -z points along `fwd` and its local +y along (roughly) `up`. */
export function orient(obj, fwd, up) {
  const z = fwd.clone().normalize().negate();
  const y = up.clone().addScaledVector(z, -up.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return obj;
}

/** A copy of `geo` moved, turned and scaled: for merging fixed parts into one mesh (one draw call). */
function baked(geo, [x, y, z], [rx, ry, rz] = [0, 0, 0], sc = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(...sc));
  return geo.clone().applyMatrix4(m);
}

const memo = new Map();
const once = (key, fn) => (memo.has(key) ? memo.get(key) : (memo.set(key, fn()), memo.get(key)));

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Worn gunmetal: a colour map with speckle and fine bright scratches, and a roughness map where they're shinier. */
const gunTex = () =>
  once('gunTex', () => {
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const marks = [];
    for (let i = 0; i < 70; i++) marks.push([r() * 256, r() * 256, (r() - 0.5) * 40, (r() - 0.5) * 8, 0.3 + r() * 0.5]);
    const draw = (rough) => (g, w, h) => {
      g.fillStyle = rough ? '#a0a0a0' : '#8a8c90';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) {
        const v = rough ? 140 + r() * 60 : 110 + r() * 50;
        g.fillStyle = `rgba(${v},${v},${v},0.35)`;
        g.fillRect(r() * w, r() * h, 1.5, 1.5);
      }
      for (const [x, y, dx, dy, a] of marks) {
        g.strokeStyle = rough ? `rgba(40,40,40,${a})` : `rgba(220,220,225,${a * 0.6})`;
        g.lineWidth = 0.7;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + dx, y + dy);
        g.stroke();
      }
    };
    const map = canvasTex(256, 256, draw(false));
    const rough = canvasTex(256, 256, draw(true), false);
    for (const t of [map, rough]) t.repeat.set(6, 6);
    return { map, rough };
  });

/** A petal of muzzle flame: a long soft teardrop. */
export const flameTex = () =>
  once('flameTex', () =>
    canvasTex(64, 256, (g, w, h) => {
      for (let y = 0; y < h; y++) {
        const k = y / h; // 0 at the muzzle end
        const width = Math.sin(Math.min(1, k * 1.4) * Math.PI) * (1 - k * 0.35) * w * 0.5;
        const gr = g.createLinearGradient(w / 2 - width, 0, w / 2 + width, 0);
        const a = (1 - k) * 0.95;
        gr.addColorStop(0, 'rgba(255,140,40,0)');
        gr.addColorStop(0.5, `rgba(255,${200 + 55 * (1 - k)},${120 + 120 * (1 - k)},${a})`);
        gr.addColorStop(1, 'rgba(255,140,40,0)');
        g.fillStyle = gr;
        g.fillRect(0, y, w, 1);
      }
    })
  );

// ---------------------------------------------------------------------------------------------------------------
// your hands: blue nitrile gloves and the cuffs of a lab coat

const handMats = () =>
  once('handMats', () => ({
    glove: std({ color: 0x3b62c8, roughness: 0.42, metalness: 0.0 }),
    coat: std({ color: 0xc4c2ba, roughness: 0.95 }),
    cuff: std({ color: 0xa8a69e, roughness: 0.9 }),
    strap: std({ color: 0x18181a, roughness: 0.6 }),
    face: std({ color: 0x0a120a, emissive: 0x6dff8a, emissiveIntensity: 0.9, roughness: 0.3 })
  }));

/**
 * A gloved hand: the wrist at the origin, the fingers along -z, the back of the hand +y. `side` 1 is the right hand
 * (thumb on -x), -1 the left. `curl(f)` bends the fingers: f = [index, middle, ring, pinky, thumb], 0 open, ~1 a fist.
 */
export function makeHand(side = 1, { sleeve = true, watch = false } = {}) {
  const M = handMats();
  const g = new THREE.Group();
  const geo = once('handGeo', () => {
    const palm = new RoundedBoxGeometry(0.078, 0.03, 0.09, 2, 0.013);
    palm.translate(0, 0, -0.048);
    const seg = {};
    for (const [r, l] of [[0.0095, 0.036], [0.0088, 0.024], [0.0082, 0.02], [0.011, 0.034], [0.0102, 0.028]]) {
      const c = new THREE.CapsuleGeometry(r, l - r * 2, 3, 8);
      c.rotateX(Math.PI / 2);
      c.translate(0, 0, -l / 2 + r * 0.6);
      seg[`${r}/${l}`] = c;
    }
    const s = new THREE.CylinderGeometry(0.04, 0.05, 0.34, 14, 1, true);
    s.rotateX(Math.PI / 2);
    s.translate(0, 0.004, 0.19);
    const cuff = new THREE.TorusGeometry(0.04, 0.008, 6, 16);
    cuff.translate(0, 0.004, 0.025);
    const wrist = new THREE.CylinderGeometry(0.03, 0.036, 0.06, 12);
    wrist.rotateX(Math.PI / 2);
    wrist.scale(1.15, 0.8, 1);
    wrist.translate(0, 0, 0.015);
    return { palm, seg, s, cuff, wrist };
  });
  mesh(geo.palm, M.glove, g);
  mesh(geo.wrist, M.glove, g);
  if (sleeve) {
    const s = mesh(geo.s, M.coat, g);
    s.material = M.coat;
    mesh(geo.cuff, M.cuff, g);
  }
  if (watch) {
    const band = mesh(new THREE.TorusGeometry(0.034, 0.006, 6, 16), M.strap, g, 0, 0, 0.045);
    band.scale.set(1.15, 0.85, 1);
    const face = mesh(new THREE.BoxGeometry(0.03, 0.006, 0.028), M.strap, g, 0, 0.03, 0.045);
    mesh(new THREE.PlaneGeometry(0.022, 0.018), M.face, face, 0, 0.0035, 0).rotation.x = -Math.PI / 2;
  }
  const fingers = [];
  const lens = [[0.0095, 0.036], [0.0088, 0.024], [0.0082, 0.02]];
  const xs = [-0.027, -0.009, 0.009, 0.026];
  const scale = [0.95, 1.05, 1.0, 0.82];
  for (let i = 0; i < 4; i++) {
    const base = group(g, xs[i] * side, 0.002, -0.09 + (i === 3 ? 0.006 : 0) + (i === 1 ? -0.003 : 0));
    base.scale.setScalar(scale[i]);
    const segs = [];
    let parent = base, z = 0;
    for (const [r, l] of lens) {
      const j = group(parent, 0, 0, z);
      mesh(geo.seg[`${r}/${l}`], M.glove, j);
      segs.push(j);
      parent = j;
      z = -l + r * 0.6;
    }
    fingers.push(segs);
  }
  // the thumb: from the heel of the palm, angled forward and in
  const tb = group(g, -0.036 * side, -0.006, -0.03);
  tb.rotation.set(0, 0.75 * side, -0.5 * side);
  const t1 = group(tb);
  mesh(geo.seg['0.011/0.034'], M.glove, t1);
  const t2 = group(t1, 0, 0, -0.031);
  mesh(geo.seg['0.0102/0.028'], M.glove, t2);
  const thumb = [tb, t1, t2];
  const hand = { g, fingers, thumb, side };
  hand.curl = (f) => {
    for (let i = 0; i < 4; i++) {
      const c = f[i];
      fingers[i][0].rotation.x = -c * 1.05;
      fingers[i][1].rotation.x = -c * 1.35;
      fingers[i][2].rotation.x = -c * 0.9;
    }
    const t = f[4] ?? 0.3;
    t1.rotation.y = -t * 0.5 * side;
    t2.rotation.y = -t * 0.8 * side;
  };
  hand.curl([0.2, 0.2, 0.25, 0.3, 0.2]);
  return hand;
}

// ---------------------------------------------------------------------------------------------------------------
// the security SMG: points down -z, origin at the middle of the receiver

/** Extrude a side profile (x forward, y up) to `w` wide, centred, pointing down -z. */
function profile(pts, w, bevel = 0.003) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: w - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(w - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  // ExtrudeGeometry's UVs are the shape's coordinates: scale them to the texture
  return g;
}

/** The ammo counter on the back of the receiver: two amber digits on a canvas. */
function ammoCounter() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  let last = null;
  const set = (n, low = false) => {
    const key = `${n}/${low}`;
    if (key === last) return;
    last = key;
    g.fillStyle = '#050403';
    g.fillRect(0, 0, 64, 32);
    g.font = 'bold 26px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = low ? '#ff3a1a' : '#ffb43a';
    g.fillText(String(n).padStart(2, '0'), 32, 17);
    g.fillStyle = 'rgba(255,180,60,0.15)';
    for (let y = 0; y < 32; y += 2) g.fillRect(0, y, 64, 1);
    tex.needsUpdate = true;
  };
  set(30);
  return { tex, set };
}

export function makeSMG({ viewmodel = false } = {}) {
  const g = new THREE.Group();
  const { map, rough } = gunTex();
  const metal = phys({ color: 0x9aa0aa, map, roughnessMap: rough, metalness: 0.6, roughness: 0.36, clearcoat: 0.2 });
  const poly = std({ color: 0x2c2f33, roughness: 0.78, metalness: 0.05 });
  const polyLite = std({ color: 0x484d55, roughness: 0.7, metalness: 0.05 });
  const steel = phys({ color: 0xb8bcc2, metalness: 1, roughness: 0.22 });
  const dark = std({ color: 0x0b0b0c, roughness: 0.9 });
  const brass = phys({ color: 0xd8a84a, metalness: 1, roughness: 0.3 });
  const hazard = std({ color: 0xd9a514, roughness: 0.6 });
  const P = { metal, poly, steel };
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = g) => mesh(geo, mat, parent, x, y, z);

  // upper receiver, chamfered at the front
  add(profile([[-0.14, -0.028], [0.17, -0.028], [0.2, -0.008], [0.2, 0.018], [0.185, 0.033], [-0.115, 0.033], [-0.14, 0.015]], 0.05, 0.004), metal);
  // lower receiver and the magazine well
  add(profile([[-0.12, -0.03], [0.1, -0.03], [0.106, -0.062], [0.03, -0.068], [0.0, -0.052], [-0.12, -0.05]], 0.044, 0.004), poly);
  // the pistol grip, raked back, with a finger groove
  add(profile([[-0.06, -0.048], [-0.028, -0.05], [-0.04, -0.085], [-0.036, -0.1], [-0.045, -0.115], [-0.05, -0.16], [-0.1, -0.168], [-0.098, -0.05]], 0.034, 0.008), polyLite);
  // trigger guard and trigger
  const guard = add(new THREE.TorusGeometry(0.024, 0.0045, 6, 14, Math.PI), poly, 0, -0.052, -0.005);
  guard.rotation.set(Math.PI, Math.PI / 2, 0);
  guard.scale.set(1.15, 0.9, 1);
  const trigger = group(g, 0, -0.05, 0.002);
  add(new THREE.TorusGeometry(0.014, 0.003, 5, 8, 1.4), steel, 0, -0.0, 0, trigger).rotation.set(0, Math.PI / 2, -2.5);
  // the octagonal handguard with vent slots, round the barrel
  const hg = new THREE.CylinderGeometry(0.027, 0.027, 0.17, 8);
  hg.rotateX(Math.PI / 2);
  hg.rotateZ(Math.PI / 8);
  add(hg, polyLite, 0, 0.004, -0.27);
  for (let i = 0; i < 4; i++)
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.004, 0.009, 0.026), dark, sx * 0.025, 0.004, -0.215 - i * 0.035);
  add(new THREE.CylinderGeometry(0.028, 0.028, 0.01, 8), poly, 0, 0.004, -0.355).rotation.x = Math.PI / 2;
  // barrel and a slotted compensator
  add(new THREE.CylinderGeometry(0.0105, 0.0105, 0.07, 12), metal, 0, 0.004, -0.38).rotation.x = Math.PI / 2;
  const comp = add(new THREE.CylinderGeometry(0.0155, 0.0155, 0.045, 12), metal, 0, 0.004, -0.425);
  comp.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.008, 0.004, 0.024), dark, 0, 0.0195, -0.425).position.x = (i - 1) * 0.008;
  add(new THREE.CylinderGeometry(0.0075, 0.0075, 0.002, 10), dark, 0, 0.004, -0.4475).rotation.x = Math.PI / 2;
  // the top rail: a strip and its teeth, one merged geometry
  const teeth = [];
  for (let i = 0; i < 26; i++) {
    const t = new THREE.BoxGeometry(0.022, 0.006, 0.0055);
    t.translate(0, 0.042, 0.12 - i * 0.0125);
    teeth.push(t);
  }
  const strip = new THREE.BoxGeometry(0.016, 0.006, 0.33);
  strip.translate(0, 0.036, -0.04);
  teeth.push(strip);
  add(mergeGeometries(teeth), metal);
  // a red-dot sight: a short tube on a mount, the dot inside
  const sight = group(g, 0, 0.062, -0.03);
  sight.scale.setScalar(0.72);
  add(new THREE.BoxGeometry(0.03, 0.02, 0.05), metal, 0, -0.018, 0, sight);
  const tube = new THREE.CylinderGeometry(0.019, 0.019, 0.055, 16, 1, true);
  tube.rotateX(Math.PI / 2);
  add(tube, std({ color: 0x1a1b1d, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }), 0, 0.006, 0, sight);
  const lensM = phys({ color: 0x2a4a3a, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35, transmission: 0 });
  const lens = add(new THREE.CircleGeometry(0.018, 16), lensM, 0, 0.006, -0.024, sight);
  lens.rotation.y = Math.PI;
  const dot = add(new THREE.SphereGeometry(0.0016, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3020 }), 0, 0.006, -0.02, sight);
  dot.visible = viewmodel;
  add(new THREE.BoxGeometry(0.008, 0.012, 0.012), metal, 0.022, 0.006, 0, sight);
  add(new THREE.BoxGeometry(0.008, 0.012, 0.012), metal, 0, 0.026, 0, sight);
  // front post sight
  add(new THREE.BoxGeometry(0.004, 0.022, 0.006), metal, 0, 0.05, -0.345);
  add(new THREE.BoxGeometry(0.018, 0.008, 0.012), metal, 0, 0.038, -0.345);
  // ejection port (right side), and the bolt that moves in it
  add(new THREE.BoxGeometry(0.004, 0.022, 0.06), dark, 0.0255, 0.008, -0.03);
  const bolt = group(g, 0.023, 0.008, -0.03);
  add(new THREE.BoxGeometry(0.004, 0.018, 0.055), steel, 0, 0, 0, bolt);
  add(new THREE.BoxGeometry(0.004, 0.006, 0.02), metal, 0.002, 0.004, 0.01, bolt);
  // the charging handle: a knob on the left at the front of the receiver (the left hand slaps it on a reload)
  const handle = group(g, -0.03, 0.02, -0.15);
  add(new THREE.BoxGeometry(0.012, 0.01, 0.014), steel, -0.004, 0, 0, handle);
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.016, 8), poly, -0.016, 0, 0, handle).rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(0.003, 0.004, 0.11), dark, -0.0255, 0.02, -0.11);
  // selector, screws
  add(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 10), steel, -0.026, -0.02, 0.05).rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(0.004, 0.003, 0.012), steel, -0.0285, -0.016, 0.054).rotation.x = 0.6;
  for (const z of [0.09, -0.11]) for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.003, 0.003, 0.003, 6), steel, sx * 0.0255, -0.018, z).rotation.z = Math.PI / 2;
  // a folding wire stock
  for (const sx of [-1, 1]) {
    const strut = add(new THREE.CylinderGeometry(0.0045, 0.0045, 0.2, 8), metal, sx * 0.018, -0.01, 0.235);
    strut.rotation.x = Math.PI / 2 + 0.08;
  }
  add(new RoundedBoxGeometry(0.05, 0.1, 0.016, 2, 0.006), poly, 0, -0.03, 0.34);
  add(new THREE.BoxGeometry(0.03, 0.03, 0.03), metal, 0, -0.005, 0.14);
  // a weapon light on the left of the handguard; its lens glows when your torch is on
  const wl = group(g, -0.034, -0.008, -0.27);
  add(new THREE.CylinderGeometry(0.011, 0.011, 0.06, 12), poly, 0, 0, 0, wl).rotation.x = Math.PI / 2;
  const lightLens = std({ color: 0x222222, emissive: 0xfff2d0, emissiveIntensity: 0, roughness: 0.1 });
  add(new THREE.CircleGeometry(0.0095, 12), lightLens, 0, 0, -0.0305, wl).rotation.y = Math.PI;
  // the magazine: curved, in its own group so a reload can drop it out
  const mag = group(g, 0, 0, 0);
  add(profile([[0.035, -0.03], [0.085, -0.03], [0.105, -0.13], [0.117, -0.2], [0.071, -0.206], [0.059, -0.135]], 0.03, 0.003), poly, 0, 0, 0, mag);
  add(profile([[0.065, -0.2], [0.121, -0.196], [0.125, -0.214], [0.067, -0.222]], 0.036, 0.003), hazard, 0, 0, 0, mag);
  const rounds = add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 8), brass, 0, -0.026, -0.058, mag);
  rounds.rotation.x = Math.PI / 2;
  // the ammo counter, angled at your eye
  let counter = null;
  if (viewmodel) {
    counter = ammoCounter();
    const box = group(g, -0.018, 0.034, 0.1);
    box.rotation.set(-0.5, 0, 0);
    add(new THREE.BoxGeometry(0.03, 0.018, 0.012), poly, 0, 0, 0, box);
    add(new THREE.PlaneGeometry(0.024, 0.012), new THREE.MeshBasicMaterial({ map: counter.tex, toneMapped: false }), 0, 0, 0.0062, box);
  }
  // muzzle flash: a star facing you, and three crossed petals along the barrel
  const flash = group(g, 0, 0.004, -0.455);
  flash.visible = false;
  const petalM = new THREE.MeshBasicMaterial({ map: flameTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, toneMapped: false });
  const petals = [];
  for (let i = 0; i < 3; i++) {
    const pg = new THREE.PlaneGeometry(0.07, 0.2);
    pg.translate(0, -0.1, 0);
    pg.rotateX(-Math.PI / 2);
    pg.rotateX(Math.PI); // the muzzle end of the texture at the barrel
    const p = add(pg, petalM, 0, 0, 0, flash);
    p.rotation.z = (i / 3) * Math.PI;
    petals.push(p);
  }
  g.userData.parts = { bolt, handle, mag, trigger, flash, petals, counter, lightLens, dot, ...P };
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// the pipe wrench

export function makeWrench() {
  const g = new THREE.Group();
  const { map, rough } = gunTex();
  const steel = phys({ color: 0x9aa0a8, map, roughnessMap: rough, metalness: 0.9, roughness: 0.35 });
  const red = std({ color: 0x9a1e14, roughness: 0.55 });
  const handle = new THREE.CylinderGeometry(0.014, 0.019, 0.44, 8);
  handle.scale(1, 1, 0.7);
  mesh(handle, red, g).rotation.x = Math.PI / 2;
  // the I-beam handle edges, steel showing through chipped paint
  for (const sy of [-1, 1]) mesh(new THREE.BoxGeometry(0.03, 0.005, 0.4), steel, g, 0, sy * 0.012, 0.01);
  const hook = profile([[0.18, -0.02], [0.27, -0.02], [0.28, 0.0], [0.27, 0.075], [0.25, 0.09], [0.215, 0.085], [0.215, 0.06], [0.245, 0.055], [0.245, 0.01], [0.18, 0.012]], 0.034, 0.004);
  mesh(hook, steel, g);
  const jaw = profile([[0.2, -0.05], [0.265, -0.05], [0.285, -0.035], [0.285, -0.02], [0.2, -0.018]], 0.03, 0.004);
  mesh(jaw, steel, g);
  // the knurled adjusting nut
  const nut = new THREE.CylinderGeometry(0.019, 0.019, 0.032, 14);
  mesh(nut, steel, g, 0, -0.035, -0.19);
  for (let i = 0; i < 6; i++) mesh(new THREE.TorusGeometry(0.019, 0.002, 4, 14), steel, g, 0, -0.049 + i * 0.0055, -0.19).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.03, 0.03, 0.06), steel, g, 0, -0.005, -0.2);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// SKITTER: blind; two great ear-fans that flare when it listens; a four-petalled maw that opens before it leaps

const skGeo = () =>
  once('skitter', () => {
    const G = {};
    const pale = 0xb8a68c, dark = 0x2e2026, sick = 0x8a9a5a;
    // thorax and head, one lump
    let thorax = new THREE.SphereGeometry(1, 28, 18);
    thorax.scale(0.21, 0.15, 0.27);
    thorax = organic(thorax, 0.018, 9, 1);
    G.thorax = paint(thorax, (x, y, z, c) => mix(c, pale, dark, 0.45 + y * 7 + wobble(x * 20, y * 20, z * 20, 3) * 0.45));
    let abd = new THREE.SphereGeometry(1, 28, 18);
    abd.scale(0.25, 0.2, 0.32);
    abd = organic(abd, 0.022, 8, 2);
    G.abd = paint(abd, (x, y, z, c) => {
      const band = Math.sin(z * 38) * 0.5 + 0.5;
      mix(c, pale, dark, 0.4 + y * 5.5 + band * 0.35 + wobble(x * 18, y * 18, z * 18, 5) * 0.3);
      if (y < -0.05) c.lerp(new THREE.Color(sick), 0.3);
    });
    let head = new THREE.SphereGeometry(1, 24, 16);
    head.scale(0.15, 0.135, 0.16);
    head = organic(head, 0.015, 14, 4);
    G.head = paint(head, (x, y, z, c) => {
      mix(c, 0xe8c8b8, 0x8a5a58, 0.35 + y * 4 + wobble(x * 30, y * 30, z * 30) * 0.25);
      // veins under the blind dome
      if (Math.abs(Math.sin(x * 60 + Math.sin(z * 40) * 2)) < 0.12 && y > -0.02) c.lerp(new THREE.Color(0x7a2a3a), 0.45);
    });
    // the dorsal shell plates
    G.plate = new THREE.SphereGeometry(1, 18, 8, 0, TAU, 0, Math.PI * 0.42);
    G.plate.scale(0.23, 0.11, 0.17);
    // a mandible petal: a curved, flattened cone, its base at the origin, pointing +z
    const jaw = new THREE.ConeGeometry(0.045, 0.12, 7, 3);
    jaw.translate(0, 0.06, 0);
    jaw.rotateX(Math.PI / 2);
    jaw.scale(1.6, 0.5, 1);
    // curl the tip inward, like a hooked claw
    const jp = jaw.attributes.position;
    for (let i = 0; i < jp.count; i++) jp.setY(i, jp.getY(i) - (jp.getZ(i) / 0.12) ** 2 * 0.03);
    jaw.computeVertexNormals();
    G.jaw = jaw;
    G.maw = new THREE.CircleGeometry(0.065, 16);
    // ear-fan: a sector in the y/z plane spreading up and back, with ribs
    const fan = new THREE.CircleGeometry(0.3, 16, Math.PI / 2 - 0.25, 1.55);
    fan.rotateY(-Math.PI / 2);
    G.fan = paint(fan, (x, y, z, c) => {
      const r = Math.hypot(y, z), a = Math.atan2(y, z);
      mix(c, 0x5a1a2a, 0xffa8a0, r / 0.3 - Math.abs(Math.sin(a * 7)) * 0.4);
    });
    const ribs = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 - 0.2 + (i / 5) * 1.45;
      ribs.push(taperTube([V3(0, 0, 0), V3(0, Math.sin(a) * 0.15, Math.cos(a) * 0.15), V3(0, Math.sin(a) * 0.305, Math.cos(a) * 0.305)], 0.009, 0.002, 5, 4));
    }
    G.ribs = mergeGeometries(ribs);
    G.spine = taperTube([V3(0, 0, 0), V3(0, 0.07, -0.03), V3(0, 0.12, -0.1)], 0.018, 0.001, 6, 5);
    G.spiracle = new THREE.SphereGeometry(0.016, 8, 6);
    // legs: one thigh shape, and a shin per row (front reach forward, back ones back)
    G.thigh = (side) => taperTube([V3(0, 0, 0), V3(side * 0.12, 0.14, 0), V3(side * 0.31, 0.18, 0)], 0.028, 0.017, 8, 6);
    G.shin = (side, row) => {
      const zf = [0.13, 0, -0.13][row];
      return taperTube([V3(0, 0, 0), V3(side * 0.08, -0.12, zf * 0.4), V3(side * 0.1, -0.33, zf * 0.8), V3(side * 0.08, -0.5, zf)], 0.017, 0.0015, 10, 6);
    };
    G.knee = new THREE.SphereGeometry(0.024, 8, 6);
    G.thighs = { [-1]: G.thigh(-1), [1]: G.thigh(1) };
    // the knee and shin of each leg, one geometry
    G.shins = {};
    for (const s of [-1, 1]) for (const r of [0, 1, 2]) G.shins[`${s}/${r}`] = mergeGeometries([G.knee, G.shin(s, r)]);
    // the fixed shell (back plates and spines) and the spiracles, merged
    const shell = [];
    for (let i = 0; i < 4; i++) {
      const k = 1 - Math.abs(i - 1.5) * 0.12;
      shell.push(baked(G.plate, [0, 0.4 + (i === 0 ? -0.04 : 0.02) - i * 0.005, 0.12 - i * 0.15], [-0.2 - i * 0.08, 0, 0], [k, k, k]));
    }
    for (let i = 0; i < 4; i++) shell.push(baked(G.spine, [(i % 2 ? 1 : -1) * 0.07, 0.5 - i * 0.02, -0.25 - Math.floor(i / 2) * 0.14], [0, 0, (i % 2 ? -1 : 1) * 0.3]));
    G.shell = mergeGeometries(shell);
    const sp = [];
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) sp.push(baked(G.spiracle, [sx * 0.2, 0.34, -0.18 - i * 0.12], [0, 0, 0], [0.6, 1, 1.4]));
    G.spiracles = mergeGeometries(sp);
    G.fanRibs = G.ribs;
    return G;
  });

export function buildSkitter() {
  const G = skGeo();
  const skin = rim(std({ color: 0xffffff, vertexColors: true, roughness: 0.38, metalness: 0.05 }), 0xc8e08a, 0.16);
  const shell = rim(phys({ color: 0x4a3640, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.2 }), 0xc8e08a, 0.22);
  const leg = rim(std({ color: 0x6a5048, roughness: 0.4 }), 0xc8e08a, 0.16);
  const fan = rim(std({ color: 0xffffff, vertexColors: true, roughness: 0.55, transparent: true, opacity: 0.85, side: THREE.DoubleSide, emissive: 0x200408 }), 0xff9090, 0.25);
  const glow = std({ color: 0x222200, emissive: 0xc8ff3a, emissiveIntensity: 1.2 });
  const body = new THREE.Group();
  mesh(G.thorax, skin, body, 0, 0.31, 0.06);
  const abd = mesh(G.abd, skin, body, 0, 0.36, -0.28);
  abd.rotation.x = -0.28;
  mesh(G.shell, shell, body);
  mesh(G.spiracles, glow, body);
  const head = group(body, 0, 0.31, 0.36);
  mesh(G.head, skin, head);
  // the maw: four petals round a glowing throat
  mesh(G.maw, glow, head, 0, -0.01, 0.163);
  const jaws = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const piv = group(head, 0, -0.01, 0.15);
    piv.rotation.z = a - Math.PI / 2;
    const j = group(piv, 0, 0.05, 0);
    mesh(G.jaw, shell, j);
    jaws.push(j);
  }
  // the ear-fans: how it hunts
  const ears = [];
  for (const side of [-1, 1]) {
    const piv = group(head, side * 0.11, 0.06, -0.02);
    piv.rotation.set(-0.3, 0, -side * 0.4);
    mesh(G.fan, fan, piv);
    mesh(G.ribs, shell, piv);
    ears.push({ piv, side });
  }
  // six legs
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1, row = i % 3;
    const hip = group(body, side * 0.15, 0.31, 0.2 - row * 0.2);
    mesh(G.thighs[side], leg, hip);
    mesh(G.shins[`${side}/${row}`], shell, hip, side * 0.31, 0.18, 0);
    legs.push({ hip, side, row });
  }
  return { body, legs, jaws, ears, abd, mouthMat: glow, skin: [skin, shell, fan, leg] };
}

// ---------------------------------------------------------------------------------------------------------------
// TENDER: a gardener. A ribbed translucent stem with a light running up its spine, a lily-bell hood over a lantern
// organ, two long arms with three fingers that reach for the crystals, and feelers trailing under it.

const tdGeo = () =>
  once('tender', () => {
    const G = {};
    const prof = [];
    for (let i = 0; i <= 30; i++) {
      const y = 0.22 + (i / 30) * 1.68;
      let r = 0.07 + 0.1 * Math.exp(-((y - 0.42) ** 2) / 0.02) + 0.012 * Math.sin(y * 42) - (y - 0.22) * 0.012;
      if (y > 1.82) r += (y - 1.82) * 0.8;
      prof.push([Math.max(0.03, r), y]);
    }
    prof.unshift([0.001, 0.2]);
    G.stem = paint(lathe(prof, 20), (x, y, z, c) => mix(c, 0x2a6a78, 0xcfe8f0, (y - 0.2) / 1.7));
    G.spine = new THREE.CylinderGeometry(0.018, 0.024, 1.6, 8);
    G.spine.translate(0, 1.05, 0);
    // the hood: a bell with a scalloped rim curling in
    const hp = [[0.001, 2.64], [0.14, 2.61], [0.28, 2.53], [0.4, 2.39], [0.48, 2.22], [0.52, 2.08], [0.5, 1.99], [0.45, 1.96]].reverse();
    const hood = lathe(hp, 64);
    const p = hood.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const k = Math.max(0, (2.25 - y) / 0.3);
      const s = 1 + 0.07 * Math.sin(a * 9) * k;
      p.setXYZ(i, x * s, y + 0.05 * Math.cos(a * 9) * k, z * s);
    }
    hood.computeVertexNormals();
    G.hood = paint(hood, (x, y, z, c) => {
      const a = Math.atan2(z, x);
      mix(c, 0xe8c0e0, 0x6a3a6a, (2.6 - y) / 0.7 - Math.abs(Math.sin(a * 9)) * 0.3);
    });
    let mem = new THREE.SphereGeometry(0.29, 24, 18);
    mem = organic(mem, 0.012, 12, 5);
    G.membrane = mem;
    G.core = new THREE.IcosahedronGeometry(0.15, 2);
    const ribs = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ribs.push(taperTube([V3(Math.cos(a) * 0.1, 1.88, Math.sin(a) * 0.1), V3(Math.cos(a) * 0.3, 2.1, Math.sin(a) * 0.3), V3(Math.cos(a) * 0.24, 2.36, Math.sin(a) * 0.24)], 0.014, 0.008, 8, 5));
    }
    G.ribs = mergeGeometries(ribs);
    G.collar = new THREE.TorusGeometry(0.13, 0.04, 8, 24);
    G.collar.rotateX(Math.PI / 2);
    G.collar.translate(0, 1.9, 0);
    // a hanging tendril per length bucket
    G.tendril = (len) => taperTube([V3(0, 0, 0), V3(0.03, -len * 0.35, 0.02), V3(-0.02, -len * 0.7, -0.03), V3(0.01, -len, 0)], 0.016, 0.003, 12, 5);
    G.tendrils = [0.9, 1.15, 1.4, 1.65].map((l) => ({ l, geo: G.tendril(l) }));
    G.bead = new THREE.SphereGeometry(0.022, 8, 6);
    // the arms: upper, fore, finger; their pivots at the top
    G.upper = taperTube([V3(0, 0, 0), V3(0, -0.22, 0.01), V3(0, -0.46, 0)], 0.028, 0.02, 8, 6);
    G.fore = taperTube([V3(0, 0, 0), V3(0, -0.24, 0.0), V3(0, -0.48, 0)], 0.02, 0.012, 8, 6);
    G.finger = taperTube([V3(0, 0, 0), V3(0, -0.07, 0.01), V3(0, -0.15, 0.04)], 0.008, 0.002, 6, 4);
    G.joint = new THREE.SphereGeometry(0.03, 8, 6);
    // feelers under the stem
    G.root = taperTube([V3(0, 0, 0), V3(0.12, -0.06, 0), V3(0.24, -0.16, 0), V3(0.3, -0.2, 0)], 0.022, 0.004, 10, 5);
    return G;
  });

export function buildTender() {
  const G = tdGeo();
  const flesh = rim(phys({ color: 0xffffff, vertexColors: true, roughness: 0.25, transparent: true, opacity: 0.78, emissive: 0x0a2228, clearcoat: 0.6 }), 0x9ff0ff, 0.25);
  flesh.userData.base = 0x9ac8d8;
  const hood = rim(std({ color: 0xffffff, vertexColors: true, roughness: 0.4, transparent: true, opacity: 0.82, side: THREE.DoubleSide, emissive: 0x1e0a1a }), 0xffb0e8, 0.3);
  hood.userData.base = 0xb07ab0;
  const lanternMat = std({ color: 0x113333, emissive: 0x9ffcf0, emissiveIntensity: 1.2 });
  const veinMat = std({ color: 0x0a2020, emissive: 0x4fe8d8, emissiveIntensity: 0.9 });
  const beadMat = std({ color: 0x0a2020, emissive: 0x8ffff0, emissiveIntensity: 2.0 });
  const membrane = phys({ color: 0xbff0f0, roughness: 0.08, transparent: true, opacity: 0.32, clearcoat: 1, emissive: 0x0a3030, depthWrite: false });
  const body = new THREE.Group();
  mesh(G.spine, veinMat, body);
  mesh(G.stem, flesh, body);
  mesh(G.collar, flesh, body);
  mesh(G.ribs, flesh, body);
  const lantern = group(body, 0, 2.15, 0);
  const core = mesh(G.core, lanternMat, lantern);
  mesh(G.membrane, membrane, lantern);
  mesh(G.hood, hood, body);
  const tendrils = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.2;
    const piv = group(body, Math.cos(a) * 0.46, 2.0, Math.sin(a) * 0.46);
    const T = G.tendrils[i % 4];
    mesh(T.geo, hood, piv);
    mesh(G.bead, beadMat, piv, 0.01, -T.l, 0);
    tendrils.push({ piv, a, ph: i * 1.7 });
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = group(body, side * 0.1, 1.72, 0.05);
    mesh(G.joint, flesh, sh);
    mesh(G.upper, flesh, sh);
    const el = group(sh, 0, -0.46, 0);
    mesh(G.joint, flesh, el).scale.setScalar(0.75);
    mesh(G.fore, flesh, el);
    const hand = group(el, 0, -0.48, 0);
    const fingers = [];
    for (let f = 0; f < 3; f++) {
      const fp = group(hand);
      fp.rotation.set(0, ((f - 1) * TAU) / 3, 0);
      const fq = group(fp);
      mesh(G.finger, flesh, fq);
      mesh(G.bead, beadMat, fq, 0, -0.15, 0.04).scale.setScalar(0.45);
      fingers.push(fq);
    }
    arms.push({ sh, el, hand, fingers, side });
  }
  const roots = [];
  for (let i = 0; i < 6; i++) {
    const piv = group(body, 0, 0.24, 0);
    piv.rotation.y = (i / 6) * TAU;
    mesh(G.root, flesh, piv);
    mesh(G.bead, beadMat, piv, 0.3, -0.2, 0).scale.setScalar(0.6);
    roots.push({ piv, ph: i * 1.1 });
  }
  return { body, lanternMat, veinMat, beadMat, core, tendrils, arms, roots, skin: [flesh, hood] };
}

// ---------------------------------------------------------------------------------------------------------------
// BULWARK: a bull of a thing behind a shield of overlapping plates; its head hangs low under a horned brow; on its
// back, caged in bone, the glowing sac.

const bwGeo = () =>
  once('bulwark', () => {
    const G = {};
    let torso = new THREE.SphereGeometry(1, 40, 28);
    torso.scale(0.95, 0.8, 1.25);
    torso = organic(torso, 0.055, 2.6, 7);
    G.torso = paint(torso, (x, y, z, c) => {
      mix(c, 0x7a6656, 0x2e2622, 0.45 + y * 0.7 + wobble(x * 5, y * 5, z * 5, 2) * 0.2);
      const wr = Math.sin(z * 22 + Math.sin(x * 6) * 2) * 0.5 + 0.5;
      c.multiplyScalar(0.85 + wr * 0.18);
    });
    let hump = new THREE.SphereGeometry(0.62, 28, 18);
    hump = organic(hump, 0.05, 4, 3);
    G.hump = paint(hump, (x, y, z, c) => mix(c, 0x4a3c34, 0x221c1a, 0.4 + y * 1.2));
    // a shield plate: a shallow pentagon with bevelled edges, its face +z
    const s = new THREE.Shape();
    const w = 0.5, h = 0.56;
    s.moveTo(-w / 2, h / 2);
    s.lineTo(w / 2, h / 2);
    s.lineTo(w / 2 + 0.02, -h * 0.2);
    s.lineTo(0, -h / 2);
    s.lineTo(-w / 2 - 0.02, -h * 0.2);
    s.closePath();
    G.plate = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 3 });
    G.plate.computeVertexNormals();
    G.ridge = new THREE.CylinderGeometry(0.018, 0.03, 0.42, 6);
    G.stud = new THREE.ConeGeometry(0.045, 0.12, 6);
    G.stud.rotateX(Math.PI / 2);
    // the brow: a big horned plate over the head
    const b = new THREE.Shape();
    b.moveTo(-0.55, 0.2);
    b.quadraticCurveTo(0, 0.42, 0.55, 0.2);
    b.lineTo(0.42, -0.25);
    b.quadraticCurveTo(0, -0.12, -0.42, -0.25);
    b.closePath();
    G.brow = new THREE.ExtrudeGeometry(b, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 });
    G.horn = taperTube([V3(0, 0, 0), V3(0, 0.12, 0.18), V3(0, 0.32, 0.28)], 0.075, 0.006, 10, 8);
    G.hornS = (sx) => taperTube([V3(0, 0, 0), V3(sx * 0.15, 0.04, 0.12), V3(sx * 0.3, 0.16, 0.12)], 0.06, 0.005, 10, 8);
    let head = new THREE.SphereGeometry(1, 24, 16);
    head.scale(0.3, 0.25, 0.38);
    head = organic(head, 0.025, 9, 9);
    G.head = paint(head, (x, y, z, c) => mix(c, 0x6a584a, 0x2a2220, 0.5 + y * 2.5));
    let jaw = new THREE.SphereGeometry(1, 18, 10, 0, TAU, Math.PI / 2, Math.PI / 2);
    jaw.scale(0.24, 0.16, 0.32);
    G.jaw = jaw;
    G.tusk = (sx) => taperTube([V3(0, 0, 0), V3(sx * 0.12, 0.02, 0.2), V3(sx * 0.2, 0.2, 0.34), V3(sx * 0.14, 0.38, 0.36)], 0.06, 0.008, 12, 8);
    G.eye = new THREE.SphereGeometry(0.03, 8, 6);
    // dorsal spines and the bone cage over the sac
    G.spine = (l) => taperTube([V3(0, 0, 0), V3(0, l * 0.6, -l * 0.2), V3(0, l, -l * 0.6)], 0.07 * l + 0.02, 0.004, 8, 6);
    const ribs = [];
    for (let i = 0; i < 3; i++) {
      const z = -0.82 - i * 0.28, r = 0.55 - Math.abs(i - 1) * 0.08;
      ribs.push(taperTube([V3(-0.6, 1.5, z + 0.1), V3(-r * 0.7, 2.1, z), V3(0, 2.38 - Math.abs(i - 1) * 0.06, z - 0.03), V3(r * 0.7, 2.1, z), V3(0.6, 1.5, z + 0.1)], 0.045, 0.045, 18, 7));
    }
    G.cage = mergeGeometries(ribs);
    let sac = new THREE.SphereGeometry(0.56, 30, 22);
    sac = organic(sac, 0.04, 6, 11);
    G.sac = sac;
    G.sacCore = new THREE.IcosahedronGeometry(0.4, 3);
    // veins over the sac
    const veins = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, ph = -0.1 + t * 2.4;
        const r = 0.57 + Math.sin(t * 9 + i) * 0.015;
        pts.push(V3(Math.cos(a + Math.sin(t * 5 + i) * 0.25) * Math.sin(ph) * r, Math.cos(ph) * r, Math.sin(a + Math.sin(t * 5 + i) * 0.25) * Math.sin(ph) * r));
      }
      veins.push(taperTube(pts, 0.016, 0.006, 16, 4));
    }
    G.veins = mergeGeometries(veins);
    G.tail = taperTube([V3(0, 0, 0), V3(0, -0.1, -0.25), V3(0, -0.3, -0.42), V3(0, -0.5, -0.45)], 0.2, 0.04, 12, 10);
    // legs: a pillar with a knee, a broad foot, three claws
    G.upper = taperTube([V3(0, 0.15, 0), V3(0, -0.2, 0.05), V3(0, -0.5, 0)], 0.25, 0.19, 8, 12);
    G.lower = (front) => taperTube([V3(0, -0.5, 0), V3(0, -0.75, front ? -0.06 : 0.08), V3(0, -0.96, 0)], 0.19, 0.17, 8, 12);
    G.knee = new THREE.SphereGeometry(0.2, 14, 10);
    G.foot = new THREE.CylinderGeometry(0.22, 0.27, 0.12, 14);
    G.claw = taperTube([V3(0, 0, 0), V3(0, 0.01, 0.1), V3(0, -0.04, 0.18)], 0.05, 0.004, 6, 6);
    return G;
  });

export function buildBulwark() {
  const G = bwGeo();
  const hide = rim(std({ color: 0xffffff, vertexColors: true, roughness: 0.72 }), 0xffa070, 0.14);
  hide.userData.base = 0x4a3c34;
  const plate = rim(phys({ color: 0x2e3640, roughness: 0.3, metalness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.35 }), 0x9ab8d8, 0.22);
  const bone = std({ color: 0xd8cfb0, roughness: 0.55 });
  const ridgeM = rim(phys({ color: 0x46525e, roughness: 0.35, metalness: 0.35, clearcoat: 0.6 }), 0x9ab8d8, 0.2);
  const sacMat = std({ color: 0x552200, emissive: 0xff7a1a, emissiveIntensity: 1.2, roughness: 0.3 });
  const sacSkin = phys({ color: 0xff9a50, roughness: 0.15, transparent: true, opacity: 0.45, clearcoat: 1, emissive: 0x401000, depthWrite: false });
  const veinM = std({ color: 0x3a0a04, roughness: 0.5, emissive: 0x200400 });
  const eyeM = std({ color: 0x220800, emissive: 0xffa040, emissiveIntensity: 2.2 });
  const body = new THREE.Group();
  mesh(G.torso, hide, body, 0, 1.35, 0);
  mesh(G.hump, hide, body, 0, 1.92, -0.25);
  for (let i = 0; i < 5; i++) {
    const sp = mesh(G.spine(0.55 - Math.abs(i - 1.5) * 0.07), bone, body, 0, 2.28 - i * 0.04, 0.45 - i * 0.22);
    sp.rotation.x = 0.2;
  }
  // the shield: two overlapping rows, bottom first
  for (const [row, n, y, zb, tilt, R] of [[0, 5, 1.12, 0.98, 0.1, 1.0], [1, 4, 1.6, 0.86, -0.42, 0.9]]) {
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.42;
      const p = mesh(G.plate, plate, body, Math.sin(a) * R, y, zb + Math.cos(a) * 0.34);
      p.rotation.order = 'YXZ';
      p.rotation.set(tilt, a, 0);
      const st = mesh(G.stud, bone, p, 0, 0.1, 0.1);
      st.scale.setScalar(row ? 0.9 : 0.75);
      const rd = mesh(G.ridge, ridgeM, p, 0, -0.04, 0.08);
      rd.scale.set(1.2, 0.85, 0.5);
    }
  }
  // the brow and its horns
  const brow = mesh(G.brow, plate, body, 0, 1.92, 0.98);
  brow.rotation.x = 0.5;
  mesh(G.horn, bone, brow, 0, 0.2, 0.1).rotation.x = -0.4;
  for (const sx of [-1, 1]) mesh(G.hornS(sx), bone, brow, sx * 0.42, 0.14, 0.1);
  // the head, low and forward
  const head = group(body, 0, 0.78, 1.32);
  mesh(G.head, hide, head);
  const jaw = mesh(G.jaw, hide, head, 0, -0.06, 0.02);
  for (const sx of [-1, 1]) {
    mesh(G.tusk(sx), bone, head, sx * 0.17, -0.06, 0.12);
    for (let k = 0; k < 2; k++) mesh(G.eye, eyeM, head, sx * (0.16 + k * 0.05), 0.1 - k * 0.04, 0.25 - k * 0.07).scale.setScalar(1 - k * 0.3);
  }
  // the sac in its cage
  mesh(G.cage, bone, body);
  const sac = group(body, 0, 1.78, -1.12);
  const core = mesh(G.sacCore, sacMat, sac);
  mesh(G.veins, veinM, sac);
  mesh(G.sac, sacSkin, sac);
  const tail = mesh(G.tail, hide, body, 0, 1.25, -1.2);
  // four legs
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const hip = group(body, sx * 0.7, 1.05, sz * 0.62);
    mesh(G.upper, hide, hip);
    mesh(G.knee, hide, hip, 0, -0.5, 0);
    mesh(G.lower(sz > 0), hide, hip);
    mesh(G.foot, plate, hip, 0, -1.0, 0.03);
    for (let c = 0; c < 3; c++) {
      const cl = mesh(G.claw, bone, hip, (c - 1) * 0.12, -1.02, 0.18);
      cl.rotation.y = (c - 1) * 0.35;
    }
    legs.push({ hip, ph: sx * sz > 0 ? 0 : Math.PI });
  }
  return { body, legs, sac, sacCore: core, sacMat, jaw, head, tail, eyeM, skin: [hide] };
}

// ---------------------------------------------------------------------------------------------------------------
// PEOPLE: knees and elbows now, faces, hands. Facing +z, feet at the origin.

/**
 * Two-bone reach: turn `sh` (shoulder) and `el` (elbow) so a hand at the end of an arm (upper `a`, fore `b`, both
 * hanging down -y at rest) lands on `target`, all in the shoulder's parent's space. `pole` is where the elbow points.
 */
const _q = new THREE.Quaternion(), _down = V3(0, -1, 0);
export function reach(sh, el, target, a, b, pole) {
  const S = sh.position;
  const d0 = target.clone().sub(S);
  const d = Math.min(d0.length(), a + b - 1e-3);
  const dir = d0.normalize();
  const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const w = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const u = dir.clone().multiplyScalar(cosA).addScaledVector(w, sinA);
  sh.quaternion.setFromUnitVectors(_down, u);
  const E = S.clone().addScaledVector(u, a);
  const f = S.clone().addScaledVector(dir, d).sub(E).normalize();
  // the forearm direction in the shoulder's frame
  f.applyQuaternion(_q.copy(sh.quaternion).invert());
  el.quaternion.setFromUnitVectors(_down, f);
}

const humanGeo = () =>
  once('human', () => {
    const G = {};
    const cap = (r, l) => {
      const c = new THREE.CapsuleGeometry(r, l, 4, 10);
      c.translate(0, -l / 2 - r * 0.4, 0);
      return c;
    };
    G.thigh = cap(0.088, 0.32);
    G.shin = cap(0.068, 0.33);
    G.upper = cap(0.054, 0.21);
    G.fore = cap(0.046, 0.2);
    G.boot = new RoundedBoxGeometry(0.12, 0.1, 0.27, 2, 0.035);
    G.pelvis = new RoundedBoxGeometry(0.34, 0.17, 0.21, 2, 0.06);
    const chest = new THREE.CylinderGeometry(0.2, 0.155, 0.52, 14, 3);
    chest.scale(1, 1, 0.62);
    G.chest = chest;
    G.shoulder = new THREE.SphereGeometry(0.07, 12, 8);
    G.neck = new THREE.CylinderGeometry(0.052, 0.06, 0.1, 10);
    let skull = new THREE.SphereGeometry(0.112, 22, 16);
    skull.scale(0.92, 1.08, 1.02);
    G.skull = skull;
    const jaw = new THREE.SphereGeometry(0.085, 14, 10);
    jaw.scale(0.95, 0.82, 1.05);
    G.jaw = jaw;
    const nose = new THREE.ConeGeometry(0.018, 0.045, 4);
    nose.rotateX(-0.35 + Math.PI / 2);
    G.nose = nose;
    G.ear = new THREE.SphereGeometry(0.026, 8, 6);
    G.ear.scale(0.45, 1, 0.75);
    G.eye = new THREE.SphereGeometry(0.0125, 8, 6);
    G.brow = new THREE.BoxGeometry(0.04, 0.008, 0.012);
    G.hand = new RoundedBoxGeometry(0.06, 0.09, 0.032, 2, 0.014);
    G.hand.translate(0, -0.045, 0);
    G.thumb = cap(0.012, 0.03);
    // the coat's skirt: an open cylinder with a gap at the front
    G.skirt = new THREE.CylinderGeometry(0.2, 0.26, 0.6, 18, 1, true, 0.42, TAU - 0.84);
    G.coatChest = new THREE.CylinderGeometry(0.215, 0.18, 0.54, 16, 1, true, 0.3, TAU - 0.6);
    G.coatChest.scale(1, 1, 0.68);
    // a close crop of hair
    let hair = new THREE.SphereGeometry(0.122, 28, 20, 0, TAU, 0, Math.PI * 0.52);
    hair = organic(hair, 0.006, 70, 2);
    hair.scale(0.95, 1.08, 1.06);
    G.hair = hair;
    G.lensRing = new THREE.TorusGeometry(0.024, 0.0035, 6, 18);
    // soldier kit
    G.helmet = new THREE.SphereGeometry(0.142, 22, 14, 0, TAU, 0, Math.PI * 0.55);
    G.helmet.scale(1.02, 0.98, 1.1);
    G.brim = new THREE.TorusGeometry(0.14, 0.012, 6, 22);
    G.brim.rotateX(Math.PI / 2);
    G.brim.scale(1.02, 1, 1.1);
    G.nvg = new THREE.CylinderGeometry(0.022, 0.025, 0.07, 12);
    G.nvg.rotateX(Math.PI / 2);
    G.mask = new RoundedBoxGeometry(0.15, 0.1, 0.1, 2, 0.04);
    G.filter = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12);
    G.filter.rotateX(Math.PI / 2);
    G.vest = new RoundedBoxGeometry(0.44, 0.44, 0.31, 2, 0.05);
    G.pouch = new RoundedBoxGeometry(0.085, 0.13, 0.06, 2, 0.015);
    G.pack = new RoundedBoxGeometry(0.3, 0.38, 0.15, 2, 0.04);
    G.kneepad = new RoundedBoxGeometry(0.12, 0.12, 0.06, 2, 0.025);
    return G;
  });

/** The Sweep's carbine: points +z (the soldier faces +z), `muzzle` at the front. */
function makeRifle() {
  const rifle = new THREE.Group();
  const gun = phys({ color: 0x1c1d20, metalness: 0.55, roughness: 0.42, clearcoat: 0.1 });
  const poly = std({ color: 0x2a2c26, roughness: 0.8 });
  const add = (geo, mat, x, y, z) => mesh(geo, mat, rifle, x, y, z);
  add(new RoundedBoxGeometry(0.055, 0.075, 0.36, 2, 0.01), gun, 0, 0, 0.02);
  const hg = new THREE.CylinderGeometry(0.03, 0.03, 0.24, 8);
  hg.rotateX(Math.PI / 2);
  add(hg, poly, 0, 0.005, 0.3);
  const bar = new THREE.CylinderGeometry(0.011, 0.011, 0.14, 8);
  bar.rotateX(Math.PI / 2);
  add(bar, gun, 0, 0.005, 0.48);
  const brake = new THREE.CylinderGeometry(0.017, 0.017, 0.05, 8);
  brake.rotateX(Math.PI / 2);
  add(brake, gun, 0, 0.005, 0.56);
  // a curved magazine
  const m = profile([[0.0, -0.03], [0.05, -0.03], [0.07, -0.12], [0.085, -0.19], [0.04, -0.2], [0.028, -0.125]], 0.03, 0.003);
  m.rotateY(Math.PI); // profile() points -z; the soldier's gun points +z
  add(m, poly, 0, 0, 0.0);
  const grip = profile([[-0.06, -0.035], [-0.03, -0.035], [-0.05, -0.14], [-0.085, -0.135]], 0.03, 0.006);
  grip.rotateY(Math.PI);
  add(grip, poly, 0, 0, 0);
  // stock
  add(new RoundedBoxGeometry(0.045, 0.1, 0.22, 2, 0.015), poly, 0, -0.02, -0.25);
  // optic and the laser module
  add(new RoundedBoxGeometry(0.04, 0.05, 0.1, 2, 0.01), gun, 0, 0.065, 0.02);
  add(new THREE.BoxGeometry(0.03, 0.03, 0.08), gun, 0.04, -0.01, 0.3);
  add(new THREE.CircleGeometry(0.009, 10), std({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 2.2 }), 0.04, -0.01, 0.341);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.005, 0.6);
  rifle.add(muzzle);
  return { rifle, muzzle };
}

/** The carbine for a Rocketbox soldier (people-models.mjs): userData.grip and .fore are where the hands go. */
export function makeRifleForPeople() {
  const { rifle, muzzle } = makeRifle();
  const grip = new THREE.Object3D(), fore = new THREE.Object3D();
  grip.position.set(0, -0.05, 0.03);
  fore.position.set(0, -0.03, 0.18);
  rifle.add(grip, fore);
  rifle.userData = { grip, fore };
  return { rifle, muzzle };
}

/** A person facing +z, feet at the origin. Returns the parts the animations turn. */
export function makeHuman({ shirt, pants, skin, hair = 0x1a1410, coat = false, soldier = false, glasses = false, badge = false }) {
  const G = humanGeo();
  const g = new THREE.Group();
  const body = group(g);
  const rimC = soldier ? 0x6a8a6a : 0x9ab0c8;
  const mShirt = rim(std({ color: shirt, roughness: 0.85 }), rimC, 0.12);
  const mPants = rim(std({ color: pants, roughness: 0.85 }), rimC, 0.12);
  const mSkin = rim(std({ color: skin, roughness: 0.55 }), 0xffc8a0, 0.1);
  const mats = [mShirt, mPants, mSkin];
  const mBoot = std({ color: soldier ? 0x111214 : 0x2a2420, roughness: 0.6 });
  const mCoat = coat ? rim(std({ color: 0xe6e4dc, roughness: 0.88, side: THREE.DoubleSide }), 0xffffff, 0.12) : null;
  if (mCoat) mats.push(mCoat);
  const dark = std({ color: 0x1b1d20, roughness: 0.6 });
  const olive = rim(std({ color: 0x2f352a, roughness: 0.8 }), 0x6a8a6a, 0.12);
  if (soldier) mats.push(dark, olive);
  const mGlove = soldier ? std({ color: 0x18191a, roughness: 0.7 }) : mSkin;
  // legs, with knees
  const legs = [], knees = [];
  for (const sx of [-1, 1]) {
    const hip = group(body, sx * 0.1, 0.95, 0);
    mesh(G.thigh, mPants, hip);
    const knee = group(hip, 0, -0.46, 0);
    mesh(G.shin, mPants, knee);
    mesh(G.boot, mBoot, knee, 0, -0.44, 0.045);
    if (soldier) mesh(G.kneepad, dark, knee, 0, -0.02, 0.06);
    legs.push(hip);
    knees.push(knee);
  }
  mesh(G.pelvis, mPants, body, 0, 0.98, 0);
  mesh(G.chest, mShirt, body, 0, 1.31, 0);
  mesh(G.neck, mSkin, body, 0, 1.6, 0);
  // the head
  const head = group(body, 0, 1.6, 0.0);
  mesh(G.skull, mSkin, head, 0, 0.11, 0);
  mesh(G.jaw, mSkin, head, 0, 0.055, 0.025);
  mesh(G.nose, mSkin, head, 0, 0.1, 0.112);
  const eyeM = std({ color: 0x0a0806, roughness: 0.2 });
  for (const sx of [-1, 1]) {
    mesh(G.ear, mSkin, head, sx * 0.104, 0.1, 0);
    mesh(G.eye, eyeM, head, sx * 0.038, 0.123, 0.094);
    mesh(G.brow, std({ color: hair }), head, sx * 0.04, 0.145, 0.1).rotation.z = sx * -0.15;
  }
  // arms, with elbows and hands
  const arms = [], elbows = [];
  for (const sx of [-1, 1]) {
    const sh = group(body, sx * 0.235, 1.5, 0);
    mesh(G.shoulder, coat ? mCoat : soldier ? olive : mShirt, sh);
    mesh(G.upper, coat ? mCoat : mShirt, sh);
    const el = group(sh, 0, -0.29, 0);
    mesh(G.fore, coat ? mCoat : mShirt, el);
    const hand = group(el, 0, -0.27, 0);
    mesh(G.hand, mGlove, hand);
    mesh(G.thumb, mGlove, hand, -sx * 0.03, -0.01, 0.015).rotation.z = sx * 0.5;
    arms.push(sh);
    elbows.push(el);
  }
  if (coat) {
    mesh(G.coatChest, mCoat, body, 0, 1.3, -0.003);
    mesh(G.skirt, mCoat, body, 0, 0.78, 0);
    for (const sx of [-1, 1]) {
      const lap = mesh(new THREE.BoxGeometry(0.06, 0.26, 0.012), mCoat, body, sx * 0.075, 1.44, 0.122);
      lap.rotation.set(0.08, sx * 0.2, sx * 0.32);
    }
    const pocket = mesh(new THREE.BoxGeometry(0.08, 0.075, 0.008), mCoat, body, -0.1, 1.38, 0.115);
    for (const [i, c] of [[0, 0x1a3a8a], [1, 0x111111], [2, 0xb02020]]) mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.06, 6), std({ color: c }), pocket, -0.022 + i * 0.012, 0.035, 0.002);
  }
  if (badge) {
    const b = mesh(new THREE.BoxGeometry(0.05, 0.07, 0.004), std({ color: 0xf0f0ea, roughness: 0.4 }), body, 0.11, 1.36, 0.13);
    mesh(new THREE.BoxGeometry(0.05, 0.014, 0.005), std({ color: 0x2060c0 }), b, 0, 0.026, 0.0005);
    mesh(new THREE.BoxGeometry(0.02, 0.024, 0.005), std({ color: 0x8a7060 }), b, -0.01, -0.004, 0.0005);
  }
  let rifle = null, muzzle = null, lenses = null;
  if (soldier) {
    mesh(G.vest, olive, body, 0, 1.32, 0);
    for (let i = 0; i < 3; i++) mesh(G.pouch, olive, body, (i - 1) * 0.1, 1.2, 0.17);
    mesh(G.pouch, dark, body, 0.15, 1.42, 0.16).scale.set(0.8, 0.7, 1);
    mesh(G.pack, olive, body, 0, 1.33, -0.22);
    const ant = mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.5, 5), dark, body, 0.1, 1.72, -0.25);
    ant.rotation.x = -0.15;
    // the helmet, a gas mask, and the night-vision tubes: the Sweep's green eyes
    mesh(G.helmet, dark, head, 0, 0.13, -0.008);
    mesh(G.brim, dark, head, 0, 0.13, -0.008);
    mesh(G.mask, dark, head, 0, 0.045, 0.075);
    mesh(G.filter, olive, head, 0, 0.03, 0.14);
    mesh(new THREE.BoxGeometry(0.1, 0.03, 0.04), dark, head, 0, 0.2, 0.12);
    lenses = std({ color: 0x0a1a08, emissive: 0x7dff4a, emissiveIntensity: 2.2, roughness: 0.2 });
    for (const sx of [-1, 1]) {
      mesh(G.nvg, dark, head, sx * 0.038, 0.135, 0.135);
      mesh(new THREE.CircleGeometry(0.019, 12), lenses, head, sx * 0.038, 0.135, 0.171);
    }
    ({ rifle, muzzle } = makeRifle());
    rifle.position.set(0.09, 1.3, 0.28);
    body.add(rifle);
  } else {
    const hm = std({ color: hair, roughness: 0.95 });
    mesh(G.hair, hm, head, 0, 0.115, -0.006);
    if (glasses) {
      const fm = std({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.6 });
      for (const sx of [-1, 1]) mesh(G.lensRing, fm, head, sx * 0.04, 0.122, 0.112);
      mesh(new THREE.BoxGeometry(0.022, 0.004, 0.004), fm, head, 0, 0.126, 0.114);
      for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.004, 0.004, 0.1), fm, head, sx * 0.066, 0.124, 0.065);
    }
  }
  const h = { g, body, legs, knees, arms, elbows, head, rifle, muzzle, lenses, mats, soldier };
  if (soldier) poseRifle(h);
  return h;
}

/** Put a soldier's hands on its rifle: right on the grip, left on the handguard. */
export function poseRifle(h) {
  const r = h.rifle;
  const grip = V3(r.position.x, r.position.y - 0.05, r.position.z + 0.05);
  const fore = V3(r.position.x - 0.01, r.position.y - 0.02, r.position.z + 0.3);
  reach(h.arms[1], h.elbows[1], grip, 0.29, 0.29, V3(1, -0.6, -0.4));
  reach(h.arms[0], h.elbows[0], fore, 0.29, 0.29, V3(-1, -0.8, 0));
}

/** Bend the knees to match the hips: a leg swung back bends at the knee; a crouch folds it. */
export function bendKnees(h, crouch = 0) {
  for (let i = 0; i < 2; i++) {
    const hip = h.legs[i].rotation.x;
    h.knees[i].rotation.x = Math.max(0, hip) * 1.1 + crouch * 2.0 + 0.04;
  }
}
