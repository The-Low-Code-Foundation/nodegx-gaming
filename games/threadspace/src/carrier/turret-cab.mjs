// The gunner's cab: what you see from inside a turret you man (seats/gun.mjs, weapons/turrets.mjs).
//
// Built in code, in metres, whatever the mount's size: a turret mount's `scale` makes its gunhouse smaller, never the
// gunner. `u` (0 at a quarter-scale mount, 1 at a full-size one) picks between a cramped cab you fill (a small ship's
// twin mount) and a roomy armoured one (a capital ship's three-gun turret): the same parts, different room, and `sc`
// (0.8 to 1.15) sizes the machinery in it to the calibre.
//
// Two groups:
//
// - `fixed`, a child of the turret's gunhouse, so it trains with the guns and rocks with their recoil:
//   - the armoured box: plates with their stiffeners and the bolts along every seam, the vision blocks (front, sides
//     and overhead: the sight elevates to 80 degrees), the roof beams with the cable runs clipped along them, a junction
//     box, the battle lamp and a dim red instrument flood;
//   - the breech of the gun (two on a big cab) along your left knee: the barrel coming in through its mantlet, the
//     cradle, the recoil cylinders, the breech ring and its sliding block, all of which slam back with each round and
//     run out again (the block drops while the gun is back); behind it the loading tray, where the next round comes up
//     out of the hoist casing as the barrel comes ready and is rammed when you fire, the ready drum that turns a step a
//     round, the green/amber/red ready lamp, and the counter (ready rack, magazine, hoist);
//   - the gunlayer's seat (harness, footrest, pedestal), the instrument panel at your right knee (train and elevation
//     dials whose needles follow the guns, switches) and the hand wheels for laying by hand (training on the right wall,
//     elevating under the panel), turning as the mount trains and elevates;
//   - ready-use rounds in their racks (on the back wall of a big cab, along the right wall aft of a small one);
//   - the hatch in the floor behind the seat and the hoist trunk below it (`trunk`, `lid`, see `pose`).
// - `yoke`, in the scene, placed on the sight every frame: the sight head over your line of sight (twin eyepieces in
//   rubber cups, the brow pad, the knobs, the periscope tube up through the roof), the frame of the glass you look
//   through, the spade grips with the firing trigger, and the fire control repeater (weapons state, the designated
//   target, its range and closing speed). Your sight moves as fast as your hands; the gunhouse follows at the turret's
//   rate, so when you swing the sight the cab comes round after it. Zoomed (Z or the wheel) you are looking through the
//   sight's optics and see none of this.
//
// How it is lit is baked in (`relight`): each part's colour times a few lamps that are not lights (the dome lamp aft of
// the overhead block, the red floods over the instruments, daylight through the vision blocks, a dark floor), into its
// vertex colours, on one unlit material (`LIT`, and `LIT_MAP` for the stencils). The scene's fill is too low in a
// closed armoured box to show its shape, and a real light per cab would come out of the fixed pool. Then everything
// still is merged (`merge`) into one mesh per material, and what moves (`live()`) into one mesh per material of its own
// group: a cab is about thirty draw calls. The cab's materials are its own (the cutaway's planes and the hull's tints
// sit on the shared ones), with a small canvas (`atlas`) for the dial faces and the stencils.
//
// The eye point (`t.eye`, in the gunhouse's frame) sits the cab on the gunhouse roof, clear of it by the cab's own
// floor; the model's own little cab and sight there (any roof fitting) are hidden while you are in it.
//
// `pose(p, …)` is the way in: p 0 at the foot of the trunk, 1 in the seat. The hatch's armoured lid drops and slides
// forward under the deck plate before your head reaches it and shuts behind you as you sit (`lidK`); out, the other
// way. While your eye is in the trunk, the trunk's walls are drawn over everything (no depth test, last of all) and the
// gunhouse's own meshes are hidden: the trunk runs down through the gunhouse and, on a small ship, her hull, and from
// inside it you see the shaft and, through the hatch, the cab, never what the shaft passes through.
// Looks only: no seeded numbers, no shared scratch vectors, no Math.random.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => { const x = clamp(k, 0, 1); return x * x * (3 - 2 * x); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();

/** How far the hatch's lid is open for the way in at `p`: open before your head gets there, shut once you sit. */
const lidK = (p) => smooth((p - 0.1) / 0.2) * (1 - smooth((p - 0.8) / 0.16));

// The atlas: dial faces and stencils, drawn once (`R`: each one's [x, y, w, h] on it).
const AW = 512, AH = 256;
const R = {
  train: [0, 0, 128, 128], elev: [128, 0, 128, 128], recoil: [256, 0, 256, 64], ready: [256, 64, 256, 64],
  hoist: [0, 128, 128, 64], hatch: [128, 128, 128, 64], panel: [256, 128, 256, 128], plate: [0, 192, 256, 64]
};

function drawAtlas(g) {
  g.fillStyle = '#3a423c';
  g.fillRect(0, 0, AW, AH);
  const font = (px, w = 700) => `${w} ${px}px ui-monospace, Menlo, monospace`;
  // A dial: a dark face, its scale, its name. `from`/`to` the marks, `a0`/`a1` where they sit (radians, 0 at the top,
  // clockwise), `every` a numbered mark.
  const dial = ([x, y, w], name, from, to, a0, a1, every, step, label) => {
    const cx = x + w / 2, cy = y + w / 2, r = w / 2 - 4;
    g.fillStyle = '#20262a';
    g.beginPath();
    g.arc(cx, cy, r + 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0a120e';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#7fc89a';
    g.fillStyle = '#9fd8b0';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let v = from; v <= to + 1e-6; v += step) {
      const a = a0 + ((v - from) / (to - from)) * (a1 - a0), big = Math.abs(v % every) < 1e-6;
      g.lineWidth = big ? 3 : 1.5;
      g.beginPath();
      g.moveTo(cx + Math.sin(a) * r * (big ? 0.74 : 0.82), cy - Math.cos(a) * r * (big ? 0.74 : 0.82));
      g.lineTo(cx + Math.sin(a) * r * 0.94, cy - Math.cos(a) * r * 0.94);
      g.stroke();
      if (big && !(a1 - a0 >= Math.PI * 2 - 1e-6 && v === to)) {
        g.font = font(13);
        g.fillText(label(v), cx + Math.sin(a) * r * 0.56, cy - Math.cos(a) * r * 0.56);
      }
    }
    g.font = font(11, 600);
    g.fillStyle = '#6fa888';
    g.fillText(name, cx, cy + r * 0.3);
  };
  dial(R.train, 'TRAIN', 0, 360, 0, Math.PI * 2, 90, 15, (v) => String(v / 10).padStart(2, '0'));
  dial(R.elev, 'ELEV', -10, 80, -Math.PI * 0.75, Math.PI * 0.75, 30, 10, (v) => String(v));
  // Stencils: the recoil guard's danger strip, the ready rack's, the hoist's, the hatch's, the panel's switch legends,
  // and the mount's plate.
  const stripe = ([x, y, w, h], words) => {
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillStyle = '#d8b02a';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#16181a';
    for (let i = -h; i < w; i += 28) {
      g.beginPath();
      g.moveTo(x + i, y + h), g.lineTo(x + i + 14, y + h), g.lineTo(x + i + 14 + h, y), g.lineTo(x + i + h, y), g.closePath();
      g.fill();
    }
    g.fillStyle = '#16181a';
    g.fillRect(x + 40, y + 14, w - 80, h - 28);
    g.fillStyle = '#e8c23a';
    g.font = font(20, 800);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(words, x + w / 2, y + h / 2 + 1);
    g.restore();
  };
  stripe(R.recoil, 'DANGER  RECOIL');
  const stencil = ([x, y, w, h], lines, color = '#d9d4c2', bg = '#3a423c', px = 22) => {
    g.fillStyle = bg;
    g.fillRect(x, y, w, h);
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((s, i) => {
      g.font = font(i ? px * 0.62 : px, 800);
      g.fillText(s, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * px * 0.95);
    });
  };
  stencil(R.ready, ['READY USE', 'HE · KEEP RACKED'], '#e0dccb', '#2f3631');
  stencil(R.hoist, ['HOIST', 'NO HANDS'], '#e8c23a', '#24292b', 20);
  stencil(R.hatch, ['TRUNK', 'SHUT TO FIRE'], '#e8c23a', '#24292b', 18);
  // The panel's legends: a dark plate, white legends, the switches' outlines.
  {
    const [x, y, w, h] = R.panel;
    g.fillStyle = '#15191c';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#4a5258';
    g.lineWidth = 2;
    g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle = '#cfd8d0';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = font(13, 700);
    const labels = ['SIGHT', 'FAN', 'HOIST', 'FIRE'];
    labels.forEach((s, i) => {
      const cx = x + w * (0.14 + i * 0.24);
      g.fillText(s, cx, y + 24);
      g.strokeRect(cx - 12, y + 44, 24, 44);
      g.font = font(10, 600);
      g.fillText(i === 3 ? 'SAFE' : 'OFF', cx, y + 104);
      g.fillText(i === 3 ? 'LIVE' : 'ON', cx, y + 36 + 2);
      g.font = font(13, 700);
    });
  }
  stencil(R.plate, ['GUNLAYER', 'MOUNT No. 1 · LAY BY HAND ONLY ON ORDER'], '#c8c2ae', '#2a2f2c', 22);
}

let M = null;
/** The cab's own materials (never the hull's: the cutaway's planes and the hull's tints sit on those). */
function mats() {
  if (M) return M;
  const L = (color, emissive = '#0b0a09', more = {}) => new THREE.MeshLambertMaterial({ color, emissive, flatShading: true, ...more });
  const B = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const c = document.createElement('canvas');
  c.width = AW;
  c.height = AH;
  drawAtlas(c.getContext('2d'));
  const atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  M = {
    paint: L('#5a655d', '#262b27'),
    plate: L('#4c564f', '#1e221f'), // the armour's inner face, a shade under the frames' paint
    frame: L('#3a4040', '#1c2020'),
    dark: L('#22262a', '#131517'),
    floor: L('#3a3f41', '#141616'),
    tread: L('#3c4144', '#171a1b'),
    trunk: L('#3a4144', '#2a2418', { side: THREE.BackSide }), // lit by its amber work lamp
    pad: L('#4a3a2c', '#0a0806'),
    strap: L('#2b2f2a', '#0a0b0a'),
    brass: L('#b89146', '#2c1e08'),
    copper: L('#a8613a', '#24120a'),
    olive: L('#59604a', '#1a1c14'),
    tip: L('#30343a', '#060606'),
    hazard: L('#c9a227', '#2a2006'),
    steel: L('#8a9299', '#101214'),
    gunmetal: L('#4a5054', '#15181a'),
    bolt: L('#6c7478', '#141618'),
    rubber: L('#17191b', '#060707'),
    cable: L('#1d2022', '#08090a'),
    cableR: L('#7a3a2a', '#1a0a06'), // a red-sleeved power cable
    redPaint: L('#9a2a22', '#2a0806'),
    stencil: L('#ffffff', '#202020', { map: atlas }), // painted on: lit like the armour
    face: new THREE.MeshBasicMaterial({ map: atlas, color: '#b8c4bc', toneMapped: false }), // the dials' faces: backlit, dim
    lens: B('#0c1a22'),
    dimRed: B('#6a1812'),
    dimAmber: B('#7a4a10'),
    needle: B('#e8f0d8'),
    red: B('#ff3b2a'),
    amber: B('#ffb23a'),
    green: B('#5dff9a'),
    LIT: new THREE.MeshBasicMaterial({ vertexColors: true }),
    LIT_MAP: new THREE.MeshBasicMaterial({ vertexColors: true, map: atlas })
  };
  return M;
}

// --- parts (everything frustum culling would get wrong at the gunhouse's scale is drawn regardless) ---------------------

const add = (g, o, x, y, z) => {
  o.position.set(x, y, z);
  o.frustumCulled = false;
  g.add(o);
  return o;
};
const bx = (g, w, h, d, m, x, y, z) => add(g, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z);
/** A cylinder, along y (or `axis` 'x' or 'z'); `r2` makes it a cone (r at its +y end, which `axis` turns to +x or +z). */
const cy = (g, r, h, m, x, y, z, axis = 'y', seg = 10, r2 = r) => {
  const o = add(g, new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), m), x, y, z);
  if (axis === 'z') o.rotation.x = Math.PI / 2;
  if (axis === 'x') o.rotation.z = -Math.PI / 2;
  return o;
};
/** A quad showing `r` of the atlas, facing +z. */
const quad = (g, w, h, m, r, x, y, z) => {
  const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes.uv;
  const [ax, ay, aw, ah] = r, u0 = ax / AW, u1 = (ax + aw) / AW, v1 = 1 - ay / AH, v0 = 1 - (ay + ah) / AH;
  uv.setXY(0, u0, v1), uv.setXY(1, u1, v1), uv.setXY(2, u0, v0), uv.setXY(3, u1, v0);
  return add(g, new THREE.Mesh(geo, m), x, y, z);
};
const grp = (g, x = 0, y = 0, z = 0) => add(g, new THREE.Group(), x, y, z);
/** Marks a group that moves: the cab's merge leaves it be, and merges it on its own (`merge`). */
const live = (o) => {
  o.userData.live = o.userData.merge = true;
  return o;
};

const _mm = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _d = new THREE.Vector3();
/** Merges every mesh under `group` (but those under another live group, or live themselves) into one mesh per
 *  material in `group`'s frame, keeping their vertex colours (decor.mjs `bake` drops them). */
function merge(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const by = new Map(), dead = [];
  group.traverse((o) => {
    if (!o.isMesh || o.userData.live || Array.isArray(o.material)) return;
    for (let q = o.parent; q && q !== group; q = q.parent) if (q.userData.live) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
    geo.applyMatrix4(_mm.multiplyMatrices(inv, o.matrixWorld));
    (by.get(o.material) ?? by.set(o.material, []).get(o.material)).push(geo);
    dead.push(o);
  });
  for (const o of dead) o.removeFromParent();
  for (const [mt, geos] of by) {
    const geo = mergeGeometries(geos, false);
    if (geo) add(group, new THREE.Mesh(geo, mt), 0, 0, 0);
  }
}

/** Bakes the cab's light into the vertex colours of every lit part under `root` (not the trunk's: `noLight`, unless
 *  `only`), in the frame of `frame` (the cab's: the eye at the origin), and puts it on the unlit material (or `mat`, and
 *  `back` for a box seen from inside). `L` the lamps and the rest. */
function relight(root, frame, L, { only = false, mat = null, back = null } = {}) {
  const m = mats();
  frame.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!src?.isMeshLambertMaterial) return;
    if (!only) for (let q = o; q; q = q.parent) if (q.userData.noLight) return;
    const base = src.color, mapped = !!src.map, flip = src.side === THREE.BackSide ? -1 : 1;
    const geo = (o.geometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry);
    _mm.multiplyMatrices(inv, o.matrixWorld);
    _n3.getNormalMatrix(_mm);
    const pos = geo.attributes.position, nor = geo.attributes.normal, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      _p.fromBufferAttribute(pos, i).applyMatrix4(_mm);
      _n.fromBufferAttribute(nor, i).applyMatrix3(_n3).normalize().multiplyScalar(flip);
      let r = L.ambient[0], g = L.ambient[1], b = L.ambient[2];
      if (L.top) {
        const k = Math.exp(-Math.max(0, L.top.y - _p.y) / L.top.fall); // light down a shaft from its top
        r += L.top.c[0] * k, g += L.top.c[1] * k, b += L.top.c[2] * k;
      }
      const day = Math.max(0, _n.dot(L.dayDir)) * (0.35 + 0.65 * clamp((_p.y - L.floor) / (L.roof - L.floor), 0, 1));
      r += L.day[0] * day, g += L.day[1] * day, b += L.day[2] * day;
      for (const l of L.lamps) {
        _d.subVectors(l.p, _p);
        const dist = _d.length() || 1e-3, ndl = Math.max(0, _n.dot(_d) / dist), k = (l.k * ndl) / (1 + (dist / l.r) ** 2);
        r += l.c[0] * k, g += l.c[1] * k, b += l.c[2] * k;
      }
      const low = 0.7 + 0.3 * clamp((_p.y - L.floor) / 0.45, 0, 1); // the deck and the feet of things, darker
      col[i * 3] = base.r * r * low;
      col[i * 3 + 1] = base.g * g * low;
      col[i * 3 + 2] = base.b * b * low;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (Array.isArray(o.material)) o.material = o.material.map((x) => (x.visible === false ? x : back));
    else o.material = mat ?? (mapped ? m.LIT_MAP : m.LIT);
  });
}
/** A row of `n` bolt heads from (x0, y0, z0) to (x1, y1, z1). */
const bolts = (g, m, s, x0, y0, z0, x1, y1, z1, n) => {
  for (let i = 0; i < n; i++) {
    const k = n > 1 ? i / (n - 1) : 0.5;
    bx(g, s, s, s, m, lerp(x0, x1, k), lerp(y0, y1, k), lerp(z0, z1, k));
  }
};

const _m = new THREE.Matrix4(), ORIGIN = new THREE.Vector3(0, 0, 0), UP = new THREE.Vector3(0, 1, 0);
/** Turns `o` (in a frame whose origin is your eye) so its +z face looks at you. */
const face = (o) => o.quaternion.setFromRotationMatrix(_m.lookAt(ORIGIN, o.position, UP));

/** A small live screen: a canvas on a quad, drawn a few times a second. */
function screen(g, w, h, px, x, y, z) {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = Math.round((px * h) / w);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  o.userData.live = true;
  add(g, o, x, y, z);
  return { c, x: c.getContext('2d'), tex, mesh: o };
}

/** A hand wheel of radius `r` in the xy plane (its axle along z): rim, three spokes, the crank handle. */
function handWheel(g, r, m, x, y, z) {
  const spin = grp(g, x, y, z);
  const s = r / 0.07;
  add(spin, new THREE.Mesh(new THREE.TorusGeometry(r, 0.009 * s, 6, 18), m.steel), 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    bx(spin, 0.012 * s, r, 0.008 * s, m.steel, -Math.sin(a) * r * 0.5, Math.cos(a) * r * 0.5, 0).rotation.z = a;
  }
  cy(spin, 0.016 * s, 0.03 * s, m.steel, 0, 0, -0.01 * s, 'z'); // the hub
  cy(spin, 0.011 * s, 0.06 * s, m.rubber, r * 0.95, 0, 0.035 * s, 'z'); // the crank's handle
  return live(spin);
}

export class TurretCab {
  /** `t` a turret of `Weapons` (its `house`, `guns`, `s`), `scene` where the yoke goes. */
  constructor(t, scene) {
    this.t = t;
    const house = t.house, s = t.s;
    house.updateMatrixWorld(true);
    const k = (this.k = house.getWorldScale(new THREE.Vector3()).x || 1);
    const u = (this.u = clamp((k - 0.25) / 0.75, 0, 1));
    this.sc = lerp(0.8, 1.15, u);
    // Half width, front and back from the eye, roof above it, floor and sill below it, the posts' thickness.
    const D = (this.D = { W: lerp(0.55, 1.3, u), F: lerp(0.62, 0.9, u), B: lerp(1.15, 2.1, u), H: lerp(0.38, 0.6, u), D: lerp(0.8, 0.86, u), sill: lerp(0.3, 0.34, u), post: lerp(0.05, 0.11, u), big: u > 0.5 });

    // The gunhouse's roof, and what stands on it (the model's own cab and sight): hidden while you are in yours. All
    // its own meshes are hidden while your eye is in the trunk, which runs down through it.
    let top = 4.4, best = -1;
    const kids = [];
    for (const o of house.children) {
      if (o === t.guns || !o.isMesh) continue;
      o.updateMatrix();
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = new THREE.Box3().copy(o.geometry.boundingBox).applyMatrix4(o.matrix);
      const size = b.getSize(new THREE.Vector3()), vol = size.x * size.y * size.z;
      kids.push({ o, b });
      if (vol > best) (best = vol), (top = Math.max(s * b.min.y, s * b.max.y));
    }
    this.fittings = kids.filter(({ b }) => s * (b.min.y + b.max.y) * 0.5 > top - 0.4).map(({ o }) => o);
    this.houseMeshes = kids.map(({ o }) => o);
    t.eye = new THREE.Vector3(Math.max(0, Math.min(3, 5 - D.W / k)), s * (top + (D.D + 0.05) / k), -3.1 + D.F / k);

    const fixed = (this.fixed = new THREE.Group());
    fixed.name = 'gunner-cab';
    fixed.position.copy(t.eye);
    fixed.rotation.z = s < 0 ? Math.PI : 0; // a ventral turret: the same cab the other way up, not its mirror image
    fixed.scale.setScalar(1 / k);
    fixed.visible = false;
    house.add(fixed);
    const yoke = (this.yoke = new THREE.Group());
    yoke.name = 'gunner-yoke';
    yoke.visible = false;
    scene.add(yoke);
    this.on = false;
    this.inTrunk = false;
    this.lidAt = -1;
    this.shots = 0;
    this.ramT = 9;
    this.drawT = 0;
    this.build();
    this.buildYoke();
    // Lit, then merged: each moving group on its own (the innermost first), then the rest.
    const L = this.lighting();
    relight(fixed, fixed, L);
    relight(yoke, yoke, L);
    // The trunk: its own copies of the unlit material (drawn over everything while you are in it: `setTrunk`), lit by
    // its work lamp and what comes down through the hatch.
    const tw = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, transparent: true }), tr = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true });
    relight(this.trunk, fixed, this.trunkLight, { only: true, mat: tr, back: tw });
    this.trunkMats = [tw, tr, this.trunkMats[2]];
    const groups = [];
    fixed.traverse((o) => {
      if (!o.userData.merge) return;
      let depth = 0;
      for (let q = o; q !== fixed; q = q.parent) depth++;
      groups.push([depth, o]);
    });
    for (const [, o] of groups.sort((a, b) => b[0] - a[0])) merge(o);
    merge(fixed);
    merge(yoke);
    this.setLid(0);
  }

  // --- building --------------------------------------------------------------------------------------------------------

  /** The cab's light (see `relight`), in its frame: a warm dome lamp aft of the overhead block, a red flood in each
   *  forward corner over the instruments, daylight in through the vision blocks (from ahead and above), and a little
   *  fill. */
  lighting() {
    const { W, F, B, H, D, post, big } = this.D, zr = big ? 0.42 : 0.27, V = (x, y, z) => new THREE.Vector3(x, y, z);
    return {
      floor: -D, roof: H,
      ambient: [0.3, 0.31, 0.35],
      day: [0.55, 0.62, 0.75], dayDir: V(0, 0.55, -0.83).normalize(),
      lamps: [
        { p: V(0, H - 0.08, zr + 0.25 * (B - zr)), c: [1.0, 0.8, 0.58], k: big ? 1.9 : 1.4, r: big ? 1.1 : 0.75 },
        ...[-1, 1].map((sx) => ({ p: V(sx * (W - post - 0.08), H - post - 0.08, -F + post + 0.1), c: [1.0, 0.24, 0.16], k: 0.9, r: 0.55 }))
      ]
    };
  }

  build() {
    this.armour();
    this.breech();
    this.seatAndPanel();
    this.racks();
    this.hatch();
  }

  /** The armoured box: plates, vision blocks, roof, stiffeners, bolts, cable runs, lamps. */
  armour() {
    const m = mats(), g = this.fixed, { W, F, B, H, D, sill, post, big } = this.D, sc = this.sc;
    const fy = -D, ry = H, sy = -sill, th = 0.06;
    const zs = (this.zs = B * 0.5); // where the side windows end and the armour is solid to the back wall
    // The front armour and its vision block: a framed window ahead of the seat. A big cab has a quarter light each
    // side of it as well.
    const wx = big ? 0.62 : 0.4, wy = ry - (big ? 0.1 : 0.07), zf = -F - th / 2;
    bx(g, 2 * W + 2 * th, sy - fy, th, m.plate, 0, (sy + fy) / 2, zf);
    bx(g, 2 * W + 2 * th, ry - wy, th, m.plate, 0, (ry + wy) / 2, zf);
    const pw = big ? 0.2 : W - wx; // the pillar beside the block
    for (const sx of [-1, 1]) {
      bx(g, pw, wy - sy, th, m.plate, sx * (wx + pw / 2), (wy + sy) / 2, zf);
      bx(g, 0.035, wy - sy, 0.08, m.frame, sx * (wx + 0.0175), (wy + sy) / 2, -F + 0.04); // the block's jambs
    }
    bx(g, 2 * wx + 0.07, 0.035, 0.08, m.frame, 0, wy + 0.0175, -F + 0.04);
    bx(g, 2 * W, 0.03, 0.1, m.frame, 0, sy + 0.005, -F + 0.05); // the sill's rail
    // The sides: armour below the sill, a window forward, solid armour aft; the back wall.
    for (const sx of [-1, 1]) {
      bx(g, th, sy - fy, F + zs, m.plate, sx * (W + th / 2), (sy + fy) / 2, (zs - F) / 2);
      bx(g, th, ry - fy, B - zs, m.plate, sx * (W + th / 2), (ry + fy) / 2, (B + zs) / 2);
      bx(g, 0.1, 0.03, F + zs, m.frame, sx * (W - 0.05), sy + 0.005, (zs - F) / 2);
      bx(g, post, ry - sy, post, m.frame, sx * (W - post / 2), (ry + sy) / 2, -F + post / 2); // the corner posts
      bx(g, post, post, F + zs, m.frame, sx * (W - post / 2), ry - post / 2, (zs - F) / 2); // the roof's side beams
      bx(g, post, ry - sy, post, m.frame, sx * (W - post / 2), (ry + sy) / 2, zs + post / 2); // the window's after post
      if (big) bx(g, post * 0.7, ry - sy, post * 0.7, m.frame, sx * (W - post * 0.35), (ry + sy) / 2, (zs - F) / 2 - 0.1);
    }
    bx(g, 2 * W + 2 * th, ry - fy, th, m.plate, 0, (ry + fy) / 2, B + th / 2);
    // The roof: armour, but for the overhead vision block over your head (the sight elevates to 80 degrees).
    const ox = big ? 0.5 : 0.34, oz0 = -F + 0.08, zr = big ? 0.42 : 0.27;
    bx(g, 2 * W + 2 * th, th, B - zr, m.plate, 0, ry + th / 2, (B + zr) / 2);
    bx(g, 2 * ox, th, oz0 + F, m.plate, 0, ry + th / 2, (oz0 - F) / 2);
    for (const sx of [-1, 1]) {
      bx(g, W + th - ox, th, zr + F, m.plate, sx * (W + th + ox) / 2, ry + th / 2, (zr - F) / 2);
      bx(g, 0.035, 0.06, zr - oz0, m.frame, sx * (ox + 0.0175), ry - 0.03, (zr + oz0) / 2);
    }
    bx(g, 2 * ox + 0.07, 0.06, 0.035, m.frame, 0, ry - 0.03, oz0 - 0.0175);
    bx(g, 2 * ox + 0.07, 0.06, 0.035, m.frame, 0, ry - 0.03, zr + 0.0175);
    // Roof beams across, aft of the overhead block.
    for (let z = zr + 0.35; z < B - 0.1; z += big ? 0.55 : 0.4) bx(g, 2 * W, post * 0.8, post * 0.7, m.frame, 0, ry - post * 0.4, z);

    // The stiffeners: ribs up the side walls (below the sill where there is a window over them, full height aft) and
    // across the back wall and the front plate under the sill.
    const rd = 0.045 * sc, rt = 0.03 * sc;
    for (const sx of [-1, 1]) {
      for (let z = -F + 0.28; z < B - 0.12; z += big ? 0.42 : 0.3) {
        const tall = z > zs + post;
        if (Math.abs(z - zs - post / 2) < 0.08) continue;
        bx(g, rd, (tall ? ry - post : sy) - fy, rt, m.frame, sx * (W - rd / 2), ((tall ? ry - post : sy) + fy) / 2, z);
      }
      bx(g, rd, rt, B - zs, m.frame, sx * (W - rd / 2), (sy + fy) / 2 + 0.06, (B + zs) / 2); // a stringer aft
    }
    bx(g, 2 * W, rt, rd, m.frame, 0, sy + 0.04, B - rd / 2);
    for (const sx of [-1, 1]) bx(g, rt, ry - sy - post, rd, m.frame, sx * W * 0.62, (ry - post + sy) / 2, B - rd / 2);
    bx(g, 2 * W, rt, rd, m.frame, 0, (sy + fy) / 2, -F + rd / 2);
    // Bolts: along each plate's seams (the sill line, the floor, the roof edge, the back wall's corners).
    const bs = 0.02 * sc, per = big ? 9 : 11; // a head, and how many a metre
    const row = (x0, y0, z0, x1, y1, z1) => bolts(g, m.bolt, bs, x0, y0, z0, x1, y1, z1, Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0, z1 - z0) * per)));
    for (const sx of [-1, 1]) {
      const x = sx * (W - bs / 2);
      row(x, fy + 0.04, -F + 0.06, x, fy + 0.04, B - 0.06);
      row(x, sy - 0.035, -F + 0.06, x, sy - 0.035, zs - 0.04);
      row(x, ry - post - 0.03, zs + post + 0.04, x, ry - post - 0.03, B - 0.06);
      row(sx * (W - 0.05), fy + 0.08, B - bs / 2, sx * (W - 0.05), ry - post - 0.05, B - bs / 2);
      row(sx * (wx + 0.06), sy + 0.02, -F + bs / 2 + 0.002, sx * (wx + 0.06), wy - 0.04, -F + bs / 2 + 0.002); // round the block
    }
    row(-W + 0.08, sy - 0.03, -F + bs / 2, W - 0.08, sy - 0.03, -F + bs / 2);
    row(-W + 0.08, fy + 0.05, B - bs / 2, W - 0.08, fy + 0.05, B - bs / 2);
    // Cable runs: a loom clipped along each roof beam, dropping down the forward corner posts to the counter (left) and
    // the instrument panel (right); a red-sleeved feed along the deck from the hoist to a junction box on the back wall.
    const cr = 0.012 * sc;
    for (const sx of [-1, 1]) {
      const x = sx * (W - post - cr * 1.5), y = ry - post - cr;
      cy(g, cr, B + F - 0.2, m.cable, x, y, (B - F) / 2, 'z', 6);
      cy(g, cr * 0.75, B + F - 0.3, m.cableR, x - sx * cr * 1.8, y + cr * 0.3, (B - F) / 2 + 0.05, 'z', 6);
      for (let z = -F + 0.2; z < B - 0.1; z += 0.28) bx(g, cr * 5, cr * 1.2, 0.012, m.frame, x - sx * cr, y - cr * 0.6, z);
      cy(g, cr, ry - post - sy + 0.02, m.cable, sx * (W - post - cr * 1.5), (ry - post + sy) / 2 - 0.01, -F + post + cr * 2, 'y', 6);
    }
    cy(g, cr * 1.3, B - 0.3 + F * 0.2, m.cableR, -W + 0.05, fy + cr * 1.3 + 0.01, (B - 0.3 - F * 0.2) / 2 + 0.05, 'z', 6);
    const jx = W * 0.62 - 0.12 * sc;
    bx(g, 0.16 * sc, 0.12 * sc, 0.06 * sc, m.dark, -jx, sy + 0.14 * sc, B - 0.03 * sc); // the junction box
    bx(g, 0.02 * sc, 0.012 * sc, 0.004, m.dimAmber, -jx + 0.05 * sc, sy + 0.17 * sc, B - 0.062 * sc);
    cy(g, cr * 1.3, ry - sy - 0.2 * sc, m.cableR, -jx, (ry + sy + 0.2 * sc) / 2, B - 0.03, 'y', 6);
    // The battle lamp in its cage, and a dim red flood over the instruments for the dark.
    const lz = zr + 0.3 * (B - zr);
    bx(g, 0.16, 0.03, 0.08, m.red, 0, ry - 0.02, lz);
    for (const sx of [-1, 1]) bx(g, 0.008, 0.045, 0.1, m.frame, sx * 0.09, ry - 0.025, lz);
    bx(g, 0.19, 0.008, 0.008, m.frame, 0, ry - 0.045, lz);
    for (const sx of [-1, 1]) {
      bx(g, 0.09 * sc, 0.04 * sc, 0.05 * sc, m.dark, sx * (W - post - 0.06 * sc), ry - post - 0.03 * sc, -F + post + 0.06 * sc);
      bx(g, 0.07 * sc, 0.006, 0.035 * sc, m.dimRed, sx * (W - post - 0.06 * sc), ry - post - 0.052 * sc, -F + post + 0.06 * sc);
    }
    // The deck: tread plate strips ahead of the seat.
    for (let i = 0; i < 3; i++) bx(g, 2 * W - 0.2, 0.006, 0.06, m.tread, 0, fy + 0.003, -F + 0.18 + i * (F - 0.2) / 3);
  }

  /** The gun's breech along your left knee (a big cab sees the next gun's too), the tray and the hoist behind it. */
  breech() {
    const m = mats(), g = this.fixed, { W, F, D, sill, big } = this.D, sc = this.sc, u = this.u;
    const fy = -D, sy = -sill;
    const bw = 0.16 * sc, bh = 0.17 * sc, bl = 0.18 * sc; // the breech ring
    const gx = (this.gx = -(W * 0.55 + 0.04)), gy = sy - 0.025 - bh / 2;
    const bz0 = -F + 0.3 * sc, bz1 = bz0 + bl, tl = 0.26 * sc, tz1 = bz1 + tl;
    const rl = (this.rl = 0.12 * sc); // how far the gun runs back
    this.recoils = [];
    for (let n = 0; n < (big ? 2 : 1); n++) {
      const x = gx - n * 0.42;
      // Fixed: the mantlet sleeve where the barrel comes through the front armour, the cradle, the recoil cylinders.
      cy(g, 0.068 * sc, 0.16 * sc, m.gunmetal, x, gy, -F + 0.08 * sc, 'z', 12);
      cy(g, 0.078 * sc, 0.025 * sc, m.frame, x, gy, -F + 0.012, 'z', 12);
      bx(g, bw * 0.9, 0.035 * sc, bz1 + F - 0.1 * sc, m.frame, x, gy - bh / 2 - 0.02 * sc, (bz1 - F + 0.1 * sc) / 2);
      for (const sx of [-1, 1]) {
        cy(g, 0.026 * sc, bz0 + F - 0.1 * sc, m.gunmetal, x + sx * 0.078 * sc, gy + 0.012 * sc, (bz0 - F + 0.1 * sc) / 2, 'z', 10);
        cy(g, 0.03 * sc, 0.018 * sc, m.frame, x + sx * 0.078 * sc, gy + 0.012 * sc, bz0 - 0.03 * sc, 'z', 10);
        bx(g, 0.012 * sc, bh * 0.75, bz1 + F - 0.12 * sc, m.frame, x + sx * (bw * 0.5 + 0.01 * sc), gy - 0.02 * sc, (bz1 - F + 0.12 * sc) / 2); // the cradle's cheeks
      }
      // What recoils: the barrel's jacket, the breech ring, the recoil cylinders' piston rods, and the block in the
      // ring (which drops while the gun is back: `block`).
      const rec = grp(g, 0, 0, 0);
      cy(rec, 0.045 * sc, bz0 + F + 0.1, m.gunmetal, x, gy, (bz0 - F - 0.1) / 2, 'z', 12);
      cy(rec, 0.056 * sc, 0.12 * sc, m.gunmetal, x, gy, bz0 - 0.06 * sc, 'z', 12);
      bx(rec, bw, bh, bl, m.gunmetal, x, gy, (bz0 + bz1) / 2);
      bx(rec, bw + 0.012, 0.03 * sc, bl * 0.5, m.steel, x, gy + bh / 2, bz0 + bl * 0.3); // a lifting lug
      for (const sx of [-1, 1]) cy(rec, 0.011 * sc, rl + 0.04 * sc, m.steel, x + sx * 0.078 * sc, gy + 0.012 * sc, bz0 - (rl + 0.04 * sc) / 2, 'z', 6);
      const lever = bx(rec, 0.016 * sc, 0.016 * sc, 0.16 * sc, m.steel, x + bw / 2 + 0.012 * sc, gy + bh * 0.25, bz1 - 0.02 * sc); // the breech's hand lever
      lever.rotation.x = -0.35;
      bx(rec, 0.03 * sc, 0.04 * sc, 0.03 * sc, m.rubber, x + bw / 2 + 0.012 * sc, gy + bh * 0.25 + 0.03 * sc, bz1 + 0.05 * sc);
      const block = grp(rec, x, gy - bh * 0.08, bz1 - bl * 0.22);
      bx(block, bw * 0.66, bh * 0.62, bl * 0.46, m.steel, 0, 0, 0);
      bx(block, bw * 0.4, bh * 0.12, 0.006, m.dark, 0, -bh * 0.1, bl * 0.23 + 0.003); // the firing pin's housing
      live(block);
      live(rec);
      this.recoils.push({ rec, block, by: block.position.y });
      // A stencilled guard rail between the gun and you, on the inboard side of the run-back.
      if (n === 0) {
        const gx1 = x + bw / 2 + 0.05 * sc;
        bx(g, 0.02 * sc, 0.02 * sc, bl + tl, m.hazard, gx1, sy - 0.035, (bz0 + tz1) / 2);
        for (const z of [bz0 + 0.02, tz1 - 0.02]) bx(g, 0.02 * sc, sy - 0.035 - (gy - bh / 2), 0.02 * sc, m.frame, gx1, (sy - 0.035 + gy - bh / 2) / 2, z);
        const lab = quad(g, Math.min(0.22, bl + tl - 0.06), 0.05 * sc, m.stencil, R.recoil, gx1 + 0.012 * sc, gy + 0.005, (bz0 + tz1) / 2);
        lab.rotation.y = Math.PI / 2;
      }
    }
    // The loading tray behind the breech and the hoist casing under it, from the deck.
    const hx = gx, ty = gy - 0.045 * sc;
    bx(g, 0.18 * sc, ty - 0.035 * sc - fy, tl + 0.04, m.dark, hx, (ty - 0.035 * sc + fy) / 2, (bz1 + tz1) / 2 + 0.02);
    bx(g, 0.2 * sc, 0.025, tl + 0.06, m.frame, hx, ty - 0.035 * sc, (bz1 + tz1) / 2 + 0.02);
    const hl = quad(g, 0.1 * sc, 0.05 * sc, m.stencil, R.hoist, hx + 0.091 * sc, (ty + fy) / 2 + 0.04 * sc, (bz1 + tz1) / 2 + 0.02);
    hl.rotation.y = Math.PI / 2;
    for (let i = 0; i < 4; i++) bx(g, 0.004, 0.012 * sc, tl - 0.04, m.frame, hx + 0.091 * sc, fy + 0.08 + i * 0.05 * sc, (bz1 + tz1) / 2 + 0.02); // louvres
    bx(g, 0.11 * sc, 0.012, tl, m.steel, hx, ty, (bz1 + tz1) / 2);
    for (const sx of [-1, 1]) bx(g, 0.012, 0.035 * sc, tl, m.steel, hx + sx * 0.055 * sc, ty + 0.015 * sc, (bz1 + tz1) / 2);
    // The round on the tray: its case, driving band, body and nose, pointing forward.
    const r = 0.038 * sc;
    const sh = (this.shell = grp(g));
    cy(sh, r, 0.15 * sc, m.brass, 0, 0, 0.05 * sc, 'z');
    cy(sh, r * 1.06, 0.012 * sc, m.copper, 0, 0, -0.03 * sc, 'z');
    cy(sh, r * 0.95, 0.07 * sc, m.olive, 0, 0, -0.07 * sc, 'z');
    cy(sh, r * 0.97, 0.008 * sc, m.hazard, 0, 0, -0.085 * sc, 'z');
    cy(sh, r * 0.95, 0.06 * sc, m.tip, 0, 0, -0.135 * sc, 'z', 10, r * 0.25);
    this.shellAt = new THREE.Vector3(hx, ty + 0.006 + r, (bz1 + tz1) / 2);
    this.ramTo = bz1 - 0.15 * sc;
    this.shellDrop = 0.2 * sc;
    sh.position.copy(this.shellAt);
    live(sh);
    // The ready drum: a step a round, on the casing's after end.
    this.drum = grp(g, hx, ty - 0.02 * sc, tz1 + 0.075 * sc);
    cy(this.drum, 0.07 * sc, 0.05 * sc, m.frame, 0, 0.025 * sc, 0, 'y', 12);
    cy(this.drum, 0.02 * sc, 0.03 * sc, m.steel, 0, 0.06 * sc, 0);
    this.drumShells = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.drumShells.push(cy(this.drum, 0.017 * sc, 0.06 * sc, m.brass, Math.cos(a) * 0.046 * sc, 0.075 * sc, Math.sin(a) * 0.046 * sc));
    }
    this.drum.userData.live = true;
    // The ready lamp: green, a round up and the barrel ready.
    this.lamp = bx(g, 0.03 * sc, 0.02, 0.03 * sc, m.green, gx + bw / 2 + 0.02 * sc, gy - bh / 2 - 0.01, bz0 - 0.03 * sc);
    this.lamp.userData.live = true;
    // The counter, on a stalk off the cradle, turned to you.
    const cs = lerp(0.68, 1, u); // smaller where it is nearer
    const cx = gx + bw / 2 + 0.075 * cs + 0.03, cyy = sy + 0.02 + 0.04 * cs, cz = bz0 + 0.03;
    this.counter = screen(g, 0.15 * cs, 0.075 * cs, 256, cx, cyy, cz);
    const bezel = bx(g, 0.165 * cs, 0.09 * cs, 0.02, m.frame, cx, cyy, cz);
    for (const o of [this.counter.mesh, bezel]) face(o);
    bezel.translateZ(-0.012);
    bx(g, 0.02, cyy - gy, 0.02, m.frame, cx, (cyy + gy) / 2 - 0.02, cz + 0.02);
  }

  /** The gunlayer's seat, the instrument panel at your right knee and the hand wheels. */
  seatAndPanel() {
    const m = mats(), g = this.fixed, { W, F, D, sill } = this.D, sc = this.sc;
    const fy = -D, sy = -sill;
    // The seat: pan and back on a frame, stitched pads, side bolsters, the harness, the pedestal and its base plate,
    // the height lever, the footrest.
    bx(g, 0.46, 0.03, 0.46, m.frame, 0, -0.65, 0.12);
    bx(g, 0.44, 0.07, 0.44, m.pad, 0, -0.6, 0.12);
    const back = grp(g, 0, -0.38, 0.37);
    back.rotation.x = 0.1;
    bx(back, 0.44, 0.44, 0.07, m.pad, 0, 0, 0);
    bx(back, 0.46, 0.46, 0.025, m.frame, 0, 0, 0.045);
    for (const y of [-0.09, 0.06]) bx(back, 0.4, 0.006, 0.004, m.dark, 0, y, -0.036);
    for (const sx of [-1, 1]) bx(back, 0.05, 0.4, 0.016, m.strap, sx * 0.1, -0.02, -0.043); // the harness straps
    bx(g, 0.36, 0.035, 0.016, m.strap, 0, -0.55, -0.1); // the lap belt across the front of the pan
    bx(g, 0.06, 0.045, 0.02, m.steel, 0, -0.55, -0.11); // its buckle
    for (const sx of [-1, 1]) bx(g, 0.05, 0.18, 0.4, m.frame, sx * 0.245, -0.5, 0.14);
    bx(g, 0.18, D - 0.67, 0.18, m.dark, 0, (fy - 0.67) / 2, 0.12);
    bx(g, 0.34, 0.02, 0.34, m.frame, 0, fy + 0.01, 0.12);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, 0.025, 0.02, 0.025, m.bolt, sx * 0.14, fy + 0.025, 0.12 + sz * 0.14);
    const lever = bx(g, 0.015, 0.015, 0.14, m.steel, 0.12, -0.7, 0.0);
    lever.rotation.x = 0.4;
    bx(g, 0.03, 0.03, 0.04, m.rubber, 0.12, -0.675, -0.07);
    bx(g, 0.34, 0.025, 0.025, m.steel, 0, fy + 0.14, -0.32); // the footrest bar
    for (const sx of [-1, 1]) bx(g, 0.02, 0.14, 0.02, m.frame, sx * 0.16, fy + 0.07, -0.32);
    // The instrument panel at your right knee: the train and elevation dials, their needles following the mount, and
    // the switches, under the red flood; the mount's plate under it.
    const px0 = 0.1, px1 = Math.min(W - 0.07, 0.75), pw = px1 - px0, py = sy - 0.1 * sc;
    const ip = grp(g, (px0 + px1) / 2, py, -F + 0.11);
    face(ip);
    const ph = 0.15 * sc;
    bx(ip, pw, ph, 0.03, m.dark, 0, 0, -0.016);
    bx(ip, pw + 0.02, ph + 0.02, 0.02, m.frame, 0, 0, -0.03);
    const ds = Math.min(0.085 * sc, ph - 0.03), dx0 = -pw / 2 + ds / 2 + 0.02;
    this.needles = [];
    ['train', 'elev'].forEach((k, i) => {
      const x = dx0 + i * (ds + 0.015);
      quad(ip, ds, ds, m.face, R[k], x, 0.005, 0.002);
      bx(ip, ds + 0.012, 0.008, 0.01, m.frame, x, ds / 2 + 0.006, 0.004); // the bezel's lip
      const pv = grp(ip, x, 0.005, 0.004);
      bx(pv, 0.004 * sc, ds * 0.38, 0.003, m.needle, 0, ds * 0.17, 0);
      bx(pv, 0.01, 0.01, 0.004, m.frame, 0, 0, 0.001);
      this.needles.push({ k, pv: live(pv) });
    });
    const lw = Math.max(0.06, pw - 2 * (ds + 0.015) - 0.03), lx = pw / 2 - lw / 2 - 0.012;
    quad(ip, lw, Math.min(ph - 0.02, lw * 0.5), m.face, R.panel, lx, 0, 0.002);
    for (let i = 0; i < 4; i++) {
      const sw = bx(ip, 0.006 * sc, 0.022 * sc, 0.006 * sc, m.steel, lx - lw / 2 + lw * (0.14 + i * 0.24), i === 3 ? -0.004 : 0.006, 0.012);
      sw.rotation.x = i === 3 ? 0.5 : -0.5;
      if (i === 3) bx(ip, 0.03 * sc, 0.004, 0.024 * sc, m.redPaint, lx - lw / 2 + lw * 0.86, 0.016 * sc, 0.014); // the fire switch's guard
    }
    bx(ip, 0.012, 0.012, 0.004, m.dimAmber, pw / 2 - 0.02, ph / 2 - 0.018, 0.002);
    quad(g, Math.min(0.2, pw * 0.7), 0.05 * sc, m.stencil, R.plate, (px0 + px1) / 2 - pw * 0.15, py - ph - 0.06 * sc, -F + 0.003);
    // The hand wheels, for laying her by hand: elevating under the panel (its axle toward you), training on the right
    // wall (its axle athwart).
    const wr = 0.07 * sc;
    const ew = grp(g, (px0 + px1) / 2 + pw * 0.22, py - ph / 2 - 0.13 * sc, -F + 0.2);
    bx(g, 0.03, 0.03, 0.18, m.frame, ew.position.x, ew.position.y, -F + 0.1);
    this.elevWheel = handWheel(ew, wr, m, 0, 0, 0);
    const tw = grp(g, W - 0.11 * sc, fy + 0.42 * sc + 0.05, -0.04);
    tw.rotation.y = -Math.PI / 2;
    bx(g, 0.1 * sc, 0.03, 0.03, m.frame, W - 0.06 * sc, tw.position.y, tw.position.z);
    this.trainWheel = handWheel(tw, wr, m, 0, 0, 0);
  }

  /** Ready-use rounds racked upright: on the back wall either side of the hatch in a big cab, along the right wall
   *  aft in a small one; and a fire extinguisher on the left wall. */
  racks() {
    const m = mats(), g = this.fixed, { W, B, D, big } = this.D, sc = this.sc;
    const fy = -D, hw = big ? 0.36 : 0.3;
    const r = 0.04 * sc, hc = 0.16 * sc, hb = 0.08 * sc, hn = 0.06 * sc;
    const round = (x, z) => {
      cy(g, r, hc, m.brass, x, fy + 0.04 + hc / 2, z);
      cy(g, r * 1.06, 0.012 * sc, m.copper, x, fy + 0.04 + hc + 0.006 * sc, z);
      cy(g, r * 0.95, hb, m.olive, x, fy + 0.04 + hc + hb / 2 + 0.006 * sc, z);
      cy(g, r * 0.97, 0.008 * sc, m.hazard, x, fy + 0.04 + hc + 0.03 * sc, z);
      cy(g, r * 0.25, hn, m.tip, x, fy + 0.04 + hc + hb + hn / 2 + 0.006 * sc, z, 'y', 10, r * 0.95);
    };
    const top = fy + 0.04 + hc + hb + hn;
    if (big) {
      const n = 7;
      for (const sx of [-1, 1]) {
        const x0 = hw + 0.12, x1 = W - 0.06, cx = sx * (x0 + x1) / 2, w = x1 - x0, z = B - 0.1;
        for (let i = 0; i < n; i++) round(sx * (x0 + ((i + 0.5) * w) / n), z);
        for (const y of [fy + 0.03, fy + 0.04 + hc * 0.75]) bx(g, w + 0.04, 0.03, 0.06, m.frame, cx, y, z + 0.02); // the rails and clips
        bx(g, w + 0.02, 0.03, 0.012, m.strap, cx, fy + 0.04 + hc + hb * 0.5, z - r - 0.006); // the strap across
        quad(g, Math.min(0.32, w * 0.6), 0.075, m.stencil, R.ready, cx, top + 0.08, B - 0.002).rotation.y = Math.PI;
      }
    } else {
      const n = 6, z0 = 0.12, z1 = B - 0.12, x = W - 0.07;
      for (let i = 0; i < n; i++) round(x, z0 + ((i + 0.5) * (z1 - z0)) / n);
      for (const y of [fy + 0.03, fy + 0.04 + hc * 0.75]) bx(g, 0.06, 0.03, z1 - z0 + 0.04, m.frame, x + 0.015, y, (z0 + z1) / 2);
      bx(g, 0.012, 0.03, z1 - z0 + 0.02, m.strap, x - r - 0.006, fy + 0.04 + hc + hb * 0.5, (z0 + z1) / 2);
      quad(g, 0.24, 0.06, m.stencil, R.ready, W - 0.002, top + 0.07, (z0 + z1) / 2).rotation.y = -Math.PI / 2;
    }
    // The extinguisher, in its bracket on the left wall aft.
    const ex = -W + 0.06 * sc, ez = big ? B - 0.5 : B - 0.3;
    cy(g, 0.045 * sc, 0.3 * sc, m.redPaint, ex, fy + 0.25 * sc, ez);
    cy(g, 0.02 * sc, 0.05 * sc, m.dark, ex, fy + 0.42 * sc, ez);
    bx(g, 0.012, 0.014, 0.1 * sc, m.frame, ex - 0.04 * sc, fy + 0.3 * sc, ez);
  }

  /** The hatch in the floor behind the seat, its lid, and the hoist trunk under it. */
  hatch() {
    const m = mats(), g = this.fixed, { W, F, B, D, big } = this.D;
    const fy = -D, th = 0.06;
    const hw = (this.hw = big ? 0.36 : 0.3), hz1 = B - 0.14, hz0 = hz1 - (big ? 0.7 : 0.58), hzc = (this.hz = (hz0 + hz1) / 2);
    this.hzs = [hz0, hz1];
    // The deck, round the hole.
    bx(g, 2 * W, th, hz0 + F, m.floor, 0, fy - th / 2, (hz0 - F) / 2);
    bx(g, 2 * W, th, B - hz1, m.floor, 0, fy - th / 2, (B + hz1) / 2);
    for (const sx of [-1, 1]) {
      bx(g, W - hw, th, hz1 - hz0, m.floor, sx * (W + hw) / 2, fy - th / 2, hzc);
      bx(g, 0.04, 0.03, hz1 - hz0 + 0.08, m.hazard, sx * (hw + 0.02), fy + 0.015, hzc); // the coaming, striped
    }
    bx(g, 2 * hw + 0.08, 0.03, 0.04, m.hazard, 0, fy + 0.015, hz0 - 0.02);
    bx(g, 2 * hw + 0.08, 0.03, 0.04, m.hazard, 0, fy + 0.015, hz1 + 0.02);
    quad(g, 2 * hw * 0.7, 0.06, m.stencil, R.hatch, 0, fy + 0.11, B - 0.002).rotation.y = Math.PI;
    // The collar under the deck plate the lid slides along (open forward, where the lid goes).
    const yT = (this.yT = fy - th - 0.06); // the trunk's top
    for (const sx of [-1, 1]) bx(g, 0.02, fy - th - yT, hz1 - hz0 + 0.04, m.frame, sx * (hw + 0.01), (fy - th + yT) / 2, hzc);
    bx(g, 2 * hw + 0.04, fy - th - yT, 0.02, m.frame, 0, (fy - th + yT) / 2, hz1 + 0.01);
    // The lid: an armoured plate flush with the deck when shut, its ribs under it, a recessed handle on top. Opening,
    // it drops into the collar and slides forward under the deck plate (`setLid`).
    const lid = (this.lid = grp(g, 0, fy - 0.025, hzc));
    const lw = 2 * hw - 0.01, ll = hz1 - hz0 - 0.01;
    bx(lid, lw, 0.05, ll, m.paint, 0, 0, 0);
    for (const sx of [-1, 1]) bx(lid, 0.04, 0.035, ll - 0.04, m.frame, sx * hw * 0.45, -0.042, 0);
    bx(lid, lw - 0.04, 0.035, 0.04, m.frame, 0, -0.042, 0);
    bx(lid, 0.16, 0.012, 0.04, m.steel, 0, 0.026, ll * 0.3);
    for (const sz of [-1, 1]) bx(lid, lw, 0.004, 0.03, m.hazard, 0, 0.026, sz * (ll / 2 - 0.02));
    bolts(lid, m.bolt, 0.018, -lw / 2 + 0.03, 0.027, -ll / 2 + 0.06, -lw / 2 + 0.03, 0.027, ll / 2 - 0.06, 5);
    bolts(lid, m.bolt, 0.018, lw / 2 - 0.03, 0.027, -ll / 2 + 0.06, lw / 2 - 0.03, 0.027, ll / 2 - 0.06, 5);
    live(lid);
    this.lidHome = lid.position.clone();
    this.lidSlide = hz1 - hz0 + 0.005;
    this.lidDrop = th + 0.005;
    // The trunk: a square shaft down from under the collar, open at the top, rungs up its after side, a work lamp. Its
    // own materials: while your eye is in it they are drawn over everything (`setTrunk`).
    const TL = (this.trunkL = 3.2);
    const tr = (this.trunk = grp(g));
    tr.userData.noLight = true;
    const wall = m.trunk.clone(), none = new THREE.MeshBasicMaterial({ visible: false });
    add(tr, new THREE.Mesh(new THREE.BoxGeometry(2 * hw, TL, hz1 - hz0), [wall, wall, none, wall, wall, wall]), 0, yT - TL / 2, hzc);
    const rungs = grp(tr);
    // Its frames (drawn first: the rungs go over them, and nothing in here is depth tested while you climb).
    for (let y = yT - 0.5; y > yT - TL + 0.2; y -= 0.8) {
      for (const sx of [-1, 1]) bx(rungs, 0.03, 0.05, hz1 - hz0, m.frame, sx * (hw - 0.015), y, hzc);
      bx(rungs, 2 * hw, 0.05, 0.03, m.frame, 0, y, hz0 + 0.015);
    }
    for (let i = 0; i < 10; i++) bx(rungs, 0.34, 0.025, 0.025, m.steel, 0, yT - 0.12 - i * 0.3, hz1 - 0.05);
    for (const sx of [-1, 1]) bx(rungs, 0.02, TL - 0.1, 0.02, m.steel, sx * 0.18, yT - TL / 2, hz1 - 0.04);
    live(rungs);
    const lampMat = m.amber.clone();
    lampMat.transparent = true;
    bx(tr, 0.1, 0.05, 0.02, lampMat, 0, yT - 1.0, hz0 + 0.012);
    tr.userData.live = true;
    this.trunkMats = [wall, null, lampMat]; // (the walls' and rungs' are made when it is lit)
    this.trunkLight = {
      floor: yT - TL, roof: yT, ambient: [0.22, 0.22, 0.24], day: [0, 0, 0], dayDir: new THREE.Vector3(0, 1, 0),
      top: { y: yT, fall: 0.7, c: [0.9, 0.85, 0.8] },
      lamps: [{ p: new THREE.Vector3(0, yT - 1.0, hz0 + 0.05), c: [1.0, 0.62, 0.28], k: 1.6, r: 0.55 }]
    };
  }

  buildYoke() {
    const m = mats(), y = this.yoke;
    // The sight head over your line of sight: its housing and front shroud, the periscope tube up through the roof, the
    // twin eyepieces in their rubber cups (you lean into them to look through the optics: Z), the brow pad, the
    // magnification and graticule knobs, the graticule lamp.
    bx(y, 0.2, 0.085, 0.16, m.dark, 0, 0.165, -0.47);
    bx(y, 0.22, 0.1, 0.03, m.frame, 0, 0.17, -0.56);
    bx(y, 0.16, 0.02, 0.12, m.frame, 0, 0.215, -0.47);
    cy(y, 0.036, 0.36, m.frame, 0, 0.39, -0.5);
    cy(y, 0.046, 0.03, m.steel, 0, 0.225, -0.5);
    cy(y, 0.046, 0.02, m.steel, 0, 0.42, -0.5);
    for (const sx of [-1, 1]) {
      cy(y, 0.022, 0.06, m.dark, sx * 0.034, 0.122, -0.41, 'z');
      cy(y, 0.027, 0.03, m.rubber, sx * 0.034, 0.122, -0.375, 'z');
      cy(y, 0.016, 0.004, m.lens, sx * 0.034, 0.122, -0.359, 'z');
      cy(y, 0.019, 0.026, m.steel, sx * 0.112, 0.17, -0.47, 'x');
      bx(y, 0.006, 0.026, 0.006, m.frame, sx * 0.126, 0.17, -0.47);
    }
    bx(y, 0.15, 0.028, 0.04, m.rubber, 0, 0.168, -0.39);
    // The frame of the glass you look through.
    for (const sx of [-1, 1]) bx(y, 0.008, 0.2, 0.01, m.frame, sx * 0.085, 0.045, -0.5);
    bx(y, 0.178, 0.008, 0.01, m.frame, 0, -0.058, -0.5);
    // The spade grips on their bar: rubber sleeves, the firing trigger under the right thumb, the safety under the left.
    bx(y, 0.05, 0.3, 0.05, m.dark, 0, -0.4, -0.41);
    bx(y, 0.26, 0.028, 0.032, m.frame, 0, -0.245, -0.42);
    for (const sx of [-1, 1]) {
      const grip = cy(y, 0.02, 0.12, m.rubber, sx * 0.105, -0.19, -0.42);
      grip.rotation.x = -0.25;
      cy(y, 0.024, 0.012, m.frame, sx * 0.105, -0.25, -0.405);
      bx(y, 0.03, 0.03, 0.03, m.frame, sx * 0.105, -0.13, -0.435);
    }
    bx(y, 0.022, 0.014, 0.022, m.red, 0.105, -0.11, -0.44);
    bx(y, 0.018, 0.012, 0.018, m.amber, -0.105, -0.112, -0.44);
    // The fire control repeater, on an arm to your right.
    this.repeater = screen(y, 0.135, 0.085, 320, 0.215, -0.2, -0.5);
    const bezel = bx(y, 0.15, 0.1, 0.02, m.frame, 0.215, -0.2, -0.5);
    for (const o of [this.repeater.mesh, bezel]) face(o);
    bezel.translateZ(-0.012);
    bx(y, 0.1, 0.02, 0.02, m.frame, 0.16, -0.255, -0.45);
  }

  // --- showing ---------------------------------------------------------------------------------------------------------

  /** In the cab (`on`), and whether you see it (`seen`: not when you are looking through the sight's optics). */
  show(on, seen = on) {
    if (this.on !== on) {
      this.on = on;
      if (!on) this.setTrunk(false), this.setLid(0);
      for (const o of this.fittings) o.visible = !on;
    }
    this.fixed.visible = on && seen;
    this.yoke.visible = on && seen;
  }

  /** The hatch's lid `k` open (0 shut, 1 open): it drops into its collar, then slides forward under the deck. */
  setLid(k) {
    if (Math.abs(k - this.lidAt) < 1e-4) return;
    this.lidAt = k;
    this.lid.position.copy(this.lidHome);
    this.lid.position.y -= this.lidDrop * smooth(k / 0.3);
    this.lid.position.z -= this.lidSlide * smooth((k - 0.25) / 0.75);
    this.trunk.visible = k > 0.001 || this.inTrunk; // shut, it hides the trunk: nothing to draw
  }

  /** Your eye is in the trunk (`on`): its walls are drawn last, over everything, and the gunhouse's meshes and whatever
   *  else of the ship the trunk runs down through (`inTheWay`) are hidden: from in here you see the shaft and, up
   *  through the hatch, the cab. */
  setTrunk(on) {
    if (this.inTrunk === on) return;
    this.inTrunk = on;
    if (on) for (const o of (this.hidden = this.inTheWay())) o.visible = false;
    else for (const o of this.hidden ?? []) o.visible = true;
    if (!on) this.hidden = null;
    // No depth test, and drawn after everything, the stars and sparks too (they are in the transparent list, which is
    // drawn after the opaque one whatever its order: so are the trunk's materials, at opacity 1).
    for (const mt of this.trunkMats) mt.depthTest = !on;
    this.trunk.traverse((o) => o.isMesh && (o.renderOrder = on ? (Array.isArray(o.material) ? 1000 : 1001) : 0));
    for (const o of this.houseMeshes) o.visible = !on && !(this.on && this.fittings.includes(o));
    if (on) this.trunk.visible = true;
  }

  /** The ship's meshes (not the cab's) whose boxes reach into the trunk: on a small ship her hull and its fittings,
   *  which the trunk runs down through, and any in the gunhouse. */
  inTheWay() {
    let root = this.t.house;
    while (root.parent && !root.parent.isScene) root = root.parent;
    root.updateMatrixWorld(true);
    const walls = this.trunk.children.find((o) => Array.isArray(o.material));
    const T = new THREE.Box3().setFromObject(walls), b = new THREE.Box3(), out = [];
    root.traverseVisible((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      for (let q = o; q; q = q.parent) if (q === this.fixed) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).intersectsBox(T)) out.push(o);
    });
    return out;
  }

  /** The camera `p` of the way in (0 the foot of the trunk, 1 seated), given the seat's own pose (`seatP`, `seatQ`:
   *  world). Up the rungs looking up the shaft, head through the hatch (its lid sliding clear first), over the seat's
   *  back and down into it, the lid shutting behind you. Called every frame in the gun seat; at 1 it only shuts up. */
  pose(p, camera, seatP, seatQ) {
    this.setLid(lidK(p));
    if (p >= 1) return void this.setTrunk(false);
    const { D } = this.D, hz = this.hz;
    const a = clamp(p / 0.56, 0, 1), b = smooth((p - 0.56) / 0.24), c = smooth((p - 0.8) / 0.2);
    // The climb: hand over hand, a rung at a time.
    const climb = a - 0.035 * Math.sin(a * Math.PI * 2 * 5) * (1 - a);
    _v.set(0.05 * Math.sin(a * Math.PI * 5) * (1 - a), lerp(-D - 2.5, -0.12, climb), hz);
    _v.lerp(_w.set(0, 0.1, 0.42), b).lerp(_w.set(0, 0, 0), c);
    this.setTrunk(_v.y < this.yT + 0.02);
    this.fixed.localToWorld(_v);
    camera.position.copy(_v);
    // Looking up the shaft, then level as your head comes through, then onto the sight.
    this.fixed.getWorldQuaternion(_q);
    _q.multiply(_q2.setFromEuler(_e.set(lerp(1.05, 0.0, smooth((a - 0.45) / 0.55)) - 0.25 * b * (1 - c), 0, 0)));
    camera.quaternion.copy(_q).slerp(seatQ, smooth((p - 0.62) / 0.38));
  }

  // --- each frame ------------------------------------------------------------------------------------------------------

  /** `guns` the ship's `Weapons`; `seatP`, `seatQ` where the sight is (world). */
  frame(dt, guns, seatP, seatQ) {
    const t = this.t, G = guns.W.gun, m = mats();
    this.yoke.position.copy(seatP);
    this.yoke.quaternion.copy(seatQ);
    // The gun follows the turret's own run-back (weapons/turrets.mjs): back in a twentieth of a second, out over one,
    // the block dropping while it is back.
    const rt = t.recoilT ?? 9;
    const run = rt < 0.05 ? rt / 0.05 : Math.exp(-(rt - 0.05) * 3.2) * (1 + (rt - 0.05) * 3.2);
    for (const r of this.recoils) {
      r.rec.position.z = this.rl * run;
      r.block.position.y = r.by - 0.07 * this.sc * clamp(run * 1.8, 0, 1);
    }
    if (t.ready < (this.lastReady ?? t.ready)) (this.shots += this.lastReady - t.ready), (this.ramT = 0); // a round went
    this.lastReady = t.ready;
    this.ramT += dt;
    // The round on the tray: rammed as you fire, the next one up out of the hoist as the barrel comes ready.
    const cool = Math.max(0, t.cool[t.barrel]);
    const up = 1 - clamp(cool / (G.reload * 0.7), 0, 1);
    const sh = this.shell;
    if (this.ramT < 0.14) {
      sh.visible = true;
      sh.position.copy(this.shellAt).z = lerp(this.shellAt.z, this.ramTo, this.ramT / 0.14);
    } else {
      sh.visible = t.ready > 0 && up > 0.02;
      sh.position.copy(this.shellAt).y -= this.shellDrop * (1 - smooth(up));
    }
    this.lamp.material = t.out || t.ready <= 0 ? m.red : cool > 0 ? m.amber : m.green;
    const want = this.shots * (Math.PI / 3);
    this.drum.rotation.y += (want - this.drum.rotation.y) * Math.min(1, dt * 9);
    this.drumShells.forEach((o, i) => (o.visible = i < t.ready));
    // The dials and the hand wheels follow the mount (the train dial in tens of degrees, 0 dead ahead).
    for (const n of this.needles) {
      if (n.k === 'train') n.pv.rotation.z = t.train;
      else n.pv.rotation.z = -(-Math.PI * 0.75 + ((t.elev * 57.2958 + 10) / 90) * Math.PI * 1.5);
    }
    this.trainWheel.rotation.z = t.train * 8;
    this.elevWheel.rotation.z = t.elev * 14;
    if ((this.drawT -= dt) <= 0) {
      this.drawT = 0.15;
      this.drawCounter(guns);
      this.drawRepeater(guns);
    }
  }

  drawCounter(guns) {
    const { c, x, tex } = this.counter, t = this.t, G = guns.W.gun;
    x.fillStyle = '#06100c';
    x.fillRect(0, 0, c.width, c.height);
    const bad = t.hoist.startsWith('stopped') || t.out;
    x.fillStyle = t.ready <= 0 ? '#ff5a4a' : '#ffc24a';
    x.font = 'bold 60px ui-monospace, Menlo, monospace';
    x.textBaseline = 'middle';
    x.fillText(String(t.ready).padStart(2, '0'), 12, 44);
    x.font = '22px ui-monospace, Menlo, monospace';
    x.fillStyle = '#8fd8b0';
    x.fillText(`/${G.rack} READY`, 92, 30);
    x.fillText(`MAG ${t.stock}`, 92, 60);
    x.fillStyle = bad ? '#ff5a4a' : t.hoist === 'running' ? '#7dffb0' : '#8fd8b0';
    x.font = '20px ui-monospace, Menlo, monospace';
    x.fillText(`HOIST ${(t.hoist.split(':')[0] || '').toUpperCase()}`, 12, 104);
    tex.needsUpdate = true;
  }

  drawRepeater(guns) {
    const { c, x, tex } = this.repeater, I = guns.gunner;
    x.fillStyle = '#050b10';
    x.fillRect(0, 0, c.width, c.height);
    if (!I) return void (tex.needsUpdate = true);
    const col = { hold: '#ff5a4a', tight: '#ffc24a', free: '#7dffb0' }[I.state];
    x.textBaseline = 'middle';
    x.fillStyle = col;
    x.fillRect(0, 0, c.width, 58);
    x.fillStyle = '#04080a';
    x.font = 'bold 34px ui-monospace, Menlo, monospace';
    x.textAlign = 'center';
    x.fillText(I.stateName, c.width / 2, 31);
    x.textAlign = 'left';
    x.font = '24px ui-monospace, Menlo, monospace';
    x.fillStyle = I.target ? '#e8f4ff' : '#6c7c88';
    x.fillText(I.target ? `TGT ${I.target}` : 'NO TARGET', 12, 86);
    if (I.target) {
      x.fillStyle = '#8fc4ff';
      x.fillText(`RNG ${I.rangeText}`, 12, 120);
      x.fillText(`CLS ${I.closing >= 0 ? '+' : '-'}${Math.abs(Math.round(I.closing))} m/s`, 12, 152);
      x.fillText(`BRG ${String(I.bearing).padStart(3, '0')}  EL ${I.elevation >= 0 ? '+' : '-'}${Math.abs(I.elevation)}`, 12, 184);
    }
    tex.needsUpdate = true;
  }
}
