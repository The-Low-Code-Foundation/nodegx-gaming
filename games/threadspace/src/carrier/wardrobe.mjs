// Copied unchanged from the Life Sim game (games/life-sim/src/wardrobe.mjs): the carrier's crew use its clothes
// recolouring (crew.mjs dresses each person in a department's uniform colours). Outfit and hair borrowing come along
// unused. Keep the two copies in step by hand if either changes.
// Customising a realistic (Rocketbox) person without touching their face: body weight and height, hair colour and
// style, clothes colours, and whole outfits borrowed from another person.
//
// Rocketbox paints skin AND clothes into one photo texture, so before anything can be recoloured something has to know
// which texel is which. `analyse` reads that off each person's own texture, guided by which bone each triangle hangs
// from, into a MASK texture the shader reads: for the body, one channel per fabric (up to three) plus one for skin; for
// the head, one for hair. A borrowed outfit or hairstyle is the other person's mesh bound to this person's skeleton
// by bone name, with the OTHER person's inverse bind matrices: each vertex keeps its place relative to its bones.
import * as THREE from 'three';

const PART = (name = '') => (/_opacity$/i.test(name) ? 'hair' : /_head$/i.test(name) ? 'head' : /_body$/i.test(name) ? 'body' : null);
const bare = (rb) => rb.replace(/^Bip01[_ ]/, '');
const side = (rb) => bare(rb).replace(/^[LR]_/, '');

// ---------------------------------------------------------------------------------------------------------------
// 1. At load: the dress shader (blank mask until someone customises) and two body-shape morphs on every person.

const BLANK = new THREE.DataTexture(new Uint8Array(4), 1, 1);
BLANK.needsUpdate = true;
const UNIFORMS = new WeakMap();
export function uniformsOf(material) {
  let u = UNIFORMS.get(material);
  if (!u)
    UNIFORMS.set(material, (u = {
      wInset: { value: 0 }, wFillSkin: { value: new THREE.Color() }, wAxisAt: { value: new THREE.Vector3() }, wAxis: { value: new THREE.Vector3(0, 0, 1) }, wNeckK: { value: 1 },
      wMask: { value: BLANK }, wAll: { value: 0 }, wCut: { value: 0 }, wOn: { value: new THREE.Vector3() }, wLum: { value: new THREE.Vector3(1, 1, 1) },
      wCol0: { value: new THREE.Color() }, wCol1: { value: new THREE.Color() }, wCol2: { value: new THREE.Color() }, wSkin: { value: new THREE.Color(1, 1, 1) }
    }));
  return u;
}
// Recolouring keeps the photo's light and shade: a texel becomes the new colour times how much brighter or darker it is
// than its fabric's average (`wLum`), so folds, stitching and denim grain survive a new colour.
// `wInset` pushes a surface in along its normals (before skinning), so a borrowed piece sits just under this person's own.
// With W_FILL (a borrowed neck only), every texel is skin, the push is weighted per vertex (`wNeckW.x`), the neck is
// drawn in towards its axis or let out to this person's neck size (`wNeckK`, weighted by `wNeckW.y`), and the hair
// channel is painted over with what each vertex says belongs there (`wFill`: skin, or one of the three fabrics).
function dressShader(shader) {
  Object.assign(shader.uniforms, uniformsOf(this));
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
uniform float wInset;
#ifdef W_FILL
uniform vec3 wAxisAt, wAxis;
uniform float wNeckK;
attribute vec4 wFill;
attribute vec2 wNeckW;
varying vec4 vFill;
#endif`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef W_FILL
vFill = wFill;
vec3 wRel = transformed - wAxisAt, wAlong = wAxis * dot( wRel, wAxis );
transformed = wAxisAt + wAlong + ( wRel - wAlong ) * mix( 1.0, wNeckK, wNeckW.y ) - normal * wInset * wNeckW.x;
#else
transformed -= normal * wInset;
#endif`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D wMask;\nuniform float wAll, wCut;\nuniform vec3 wOn, wLum, wCol0, wCol1, wCol2, wSkin, wFillSkin;\n#ifdef W_FILL\nvarying vec4 vFill;\n#endif')
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
#ifdef USE_MAP
{
  vec4 wm = texture2D( wMask, vMapUv );
  if ( wCut > 0.5 && wm.r < 0.5 ) discard;
  wm.r = max( wm.r, wAll );
  vec3 c = diffuseColor.rgb;
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
#ifdef W_FILL
  c *= wSkin;
  vec3 fill = vFill.x * wFillSkin + vFill.y * wCol0 + vFill.z * wCol1 + vFill.w * wCol2;
  c = mix( c, fill / max( 1e-3, dot( vFill, vec4( 1.0 ) ) ), wm.r );
#else
  c = mix( c, c * wSkin, wm.a );
  c = mix( c, wCol0 * pow( clamp( l / wLum.x, 0.0, 3.0 ), 0.8 ), wm.r * wOn.x );
  c = mix( c, wCol1 * pow( clamp( l / wLum.y, 0.0, 3.0 ), 0.8 ), wm.g * wOn.y );
  c = mix( c, wCol2 * pow( clamp( l / wLum.z, 0.0, 3.0 ), 0.8 ), wm.b * wOn.z );
#endif
  diffuseColor.rgb = c;
}
#endif`
    );
}
function dressClone(material) {
  const c = material.clone();
  c.onBeforeCompile = dressShader;
  return c;
}

// How much of the body's mass each bone carries (Rocketbox is a 3ds Max Biped). Head, hands and feet: none.
const MASS = { Pelvis: 1, Spine: 1, Spine1: 0.95, Spine2: 0.7, Neck: 0.25, Clavicle: 0.45, UpperArm: 0.7, Forearm: 0.35, Thigh: 1, Calf: 0.45 };

// Bone positions in the bind pose, in the frame the skinning works in (bindMatrix · position).
function bindFrame(mesh) {
  const at = {};
  mesh.skeleton.bones.forEach((b, i) => (at[b.userData.rb] = new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[i].clone().invert())));
  return at;
}

// Marks a freshly loaded person dressable: remembers each bone's Rocketbox name (the game renames the animated ones),
// gives every material the dress shader, and adds the "heavy" and "slim" morphs.
export function makeDressable(scene) {
  const meshes = [];
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    meshes.push(o);
    for (const b of o.skeleton.bones) b.userData.rb ??= b.name;
    o.userData.part = PART([o.material].flat()[0]?.name);
    for (const m of [o.material].flat()) m.onBeforeCompile = dressShader;
  });
  addShapeMorphs(meshes);
}

// Rounder or thinner: each vertex moves along the body's surface normal by how much mass its bones carry, the belly
// further forward when heavier. Normals are averaged over every vertex at one place (body and head meet at the neck,
// UV seams split vertices), or seams would open. Hair cards move straight out from the body's axis instead.
function addShapeMorphs(meshes) {
  const body = meshes.find((m) => m.userData.part === 'body') ?? meshes[0];
  if (!body) return;
  const at = bindFrame(body);
  const pelvis = at.Bip01_Pelvis, up = at.Bip01_Head.clone().sub(pelvis).normalize();
  const left = at.Bip01_L_UpperArm.clone().sub(at.Bip01_R_UpperArm);
  left.sub(up.clone().multiplyScalar(left.dot(up))).normalize();
  const fwd = new THREE.Vector3().crossVectors(left, up);
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  const per = meshes.map((mesh) => {
    const g = mesh.geometry, n = g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    const nm = new THREE.Matrix3().getNormalMatrix(mesh.bindMatrix);
    for (let i = 0; i < n; i++) {
      P.fromBufferAttribute(g.attributes.position, i).applyMatrix4(mesh.bindMatrix).toArray(pos, i * 3);
      N.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize().toArray(nor, i * 3);
    }
    return { mesh, n, pos, nor };
  });
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < per[0].n; i++) {
    const h = P.fromArray(per[0].pos, i * 3).dot(up);
    lo = Math.min(lo, h), hi = Math.max(hi, h);
  }
  const H = hi - lo, k = 0.03 * H, q = H * 0.002;
  const key = (a, i) => `${Math.round(a[i] / q)},${Math.round(a[i + 1] / q)},${Math.round(a[i + 2] / q)}`;
  const sums = new Map();
  for (const p of per) {
    if (p.mesh.userData.part === 'hair') continue;
    for (let i = 0; i < p.n; i++) {
      const kk = key(p.pos, i * 3), s = sums.get(kk) ?? sums.set(kk, [0, 0, 0]).get(kk);
      s[0] += p.nor[i * 3], s[1] += p.nor[i * 3 + 1], s[2] += p.nor[i * 3 + 2];
    }
  }
  const D = new THREE.Vector3();
  for (const p of per) {
    const { mesh, n, pos } = p, g = mesh.geometry;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton.bones;
    const heavy = new Float32Array(n * 3), slim = new Float32Array(n * 3);
    const back = new THREE.Matrix3().setFromMatrix4(mesh.bindMatrix.clone().invert());
    const hair = mesh.userData.part === 'hair';
    for (let i = 0; i < n; i++) {
      let mass = 0, torso = 0;
      for (let j = 0; j < 4; j++) {
        const w = sw.getComponent(i, j);
        if (!w) continue;
        const name = bones[si.getComponent(i, j)].userData.rb;
        mass += w * (MASS[side(name)] ?? 0);
        if (/^(Pelvis|Spine|Spine1)$/.test(bare(name))) torso += w;
      }
      if (mass < 1e-4) continue;
      P.fromArray(pos, i * 3);
      if (hair) D.copy(P).sub(pelvis).addScaledVector(up, -P.clone().sub(pelvis).dot(up));
      else D.fromArray(sums.get(key(pos, i * 3)));
      if (D.lengthSq() < 1e-12) continue;
      D.normalize();
      const front = Math.max(0, D.dot(fwd));
      D.applyMatrix3(back);
      N.copy(D).multiplyScalar(k * mass * (1 + 1.4 * torso * front * front)).toArray(heavy, i * 3);
      N.copy(D).multiplyScalar(-k * 0.45 * mass * (1 + 0.3 * torso * front)).toArray(slim, i * 3);
    }
    const ma = g.morphAttributes;
    if (!ma.position?.length) (ma.position = []), (g.morphTargetsRelative = true), (mesh.morphTargetInfluences = []), (mesh.morphTargetDictionary = {});
    const add = (name, data) => {
      const a = new THREE.Float32BufferAttribute(data, 3);
      a.name = name;
      mesh.morphTargetDictionary[name] = ma.position.length;
      ma.position.push(a);
      ma.normal?.push(new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      mesh.morphTargetInfluences.push(0);
    };
    add('heavy', heavy);
    add('slim', slim);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Reading a person's textures: which texel is skin, which fabric, which hair. Cached per geometry (clones share).

const LIN = Float32Array.from({ length: 256 }, (_, i) => ((i /= 255) <= 0.04045 ? i / 12.92 : ((i + 0.055) / 1.055) ** 2.4));
const fLab = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function toLab(r, g, b, out, o) {
  const R = LIN[Math.round(r)], G = LIN[Math.round(g)], B = LIN[Math.round(b)];
  const x = fLab((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.9505), y = fLab(0.2126 * R + 0.7152 * G + 0.0722 * B), z = fLab((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.089);
  out[o] = 116 * y - 16, out[o + 1] = 500 * (x - y), out[o + 2] = 200 * (y - z);
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c.getContext('2d', { willReadFrequently: true });
}
function imagePixels(image, size) {
  const g = canvas(size);
  g.drawImage(image, 0, 0, size, size);
  return g.getImageData(0, 0, size, size).data;
}
// Paints triangles into UV space, one code per triangle (0 = skip); returns the code under every texel (0 = none).
// Each triangle is also stroked 2 px wide, so texture filtering at an island's edge still finds the mask.
function rasterise(size, geo, codeOf, order) {
  const g = canvas(size), uv = geo.attributes.uv, idx = geo.index.array, paths = new Map();
  for (let t = 0; t < idx.length / 3; t++) {
    const c = codeOf(t);
    if (!c) continue;
    const p = paths.get(c) ?? paths.set(c, new Path2D()).get(c);
    for (let v = 0; v < 3; v++) p[v ? 'lineTo' : 'moveTo'](uv.getX(idx[t * 3 + v]) * size, uv.getY(idx[t * 3 + v]) * size);
    p.closePath();
  }
  g.lineWidth = 2;
  g.lineJoin = 'round';
  for (const c of order.filter((c) => paths.has(c))) {
    g.fillStyle = g.strokeStyle = `rgb(${c * 10},0,0)`;
    g.fill(paths.get(c));
    g.stroke(paths.get(c));
  }
  const d = g.getImageData(0, 0, size, size).data, out = new Uint8Array(size * size);
  for (let i = 0; i < out.length; i++) if (d[i * 4 + 3] > 160) out[i] = Math.round(d[i * 4] / 10);
  return out;
}
// Lab of every covered texel after a 5×5 blur over covered neighbours only (the black outside an island would
// otherwise darken every edge into a "fabric" of its own).
function blurredLab(px, cover, size, r = 2) {
  const n = size * size, acc = new Float32Array(n * 4), tmp = new Float32Array(n * 4), lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) if (cover[i]) (acc[i * 4] = px[i * 4]), (acc[i * 4 + 1] = px[i * 4 + 1]), (acc[i * 4 + 2] = px[i * 4 + 2]), (acc[i * 4 + 3] = 1);
  const pass = (src, dst, dx, dy) => {
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let a = 0, b = 0, c = 0, w = 0;
        for (let k = -r; k <= r; k++) {
          const xx = x + k * dx, yy = y + k * dy;
          if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
          const j = (yy * size + xx) * 4;
          a += src[j], b += src[j + 1], c += src[j + 2], w += src[j + 3];
        }
        const o = (y * size + x) * 4;
        dst[o] = a, dst[o + 1] = b, dst[o + 2] = c, dst[o + 3] = w;
      }
  };
  pass(acc, tmp, 1, 0);
  pass(tmp, acc, 0, 1);
  for (let i = 0; i < n; i++) if (cover[i] && acc[i * 4 + 3]) toLab(acc[i * 4] / acc[i * 4 + 3], acc[i * 4 + 1] / acc[i * 4 + 3], acc[i * 4 + 2] / acc[i * 4 + 3], lab, i * 3);
  return lab;
}
const median = (list) => (list.sort((a, b) => a - b), list[Math.floor(list.length / 2)] ?? 0);
const medianLab = (lab, pick) => {
  const L = [], A = [], B = [];
  for (const i of pick) L.push(lab[i * 3]), A.push(lab[i * 3 + 1]), B.push(lab[i * 3 + 2]);
  return L.length ? [median(L), median(A), median(B)] : null;
};
const dist = (lab, i, ref, wL = 0.5) => Math.hypot((lab[i * 3] - ref[0]) * wL, lab[i * 3 + 1] - ref[1], lab[i * 3 + 2] - ref[2]);
// The average colour (linear) of the texels picked, from the unblurred photo.
function meanLinear(px, pick) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const i of pick) (r += LIN[px[i * 4]]), (g += LIN[px[i * 4 + 1]]), (b += LIN[px[i * 4 + 2]]), n++;
  return n ? new THREE.Color(r / n, g / n, b / n) : new THREE.Color(0.5, 0.5, 0.5);
}
const lum = (c) => Math.max(1e-3, 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
function maskTexture(data, size) {
  const t = new THREE.DataTexture(data, size, size);
  Object.assign(t, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, needsUpdate: true });
  return t;
}

// Per triangle: the bone carrying most of its three vertices' weight.
function dominantBones(mesh) {
  const g = mesh.geometry, idx = g.index.array, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton.bones;
  const out = new Array(idx.length / 3), sum = new Map();
  for (let t = 0; t < out.length; t++) {
    sum.clear();
    for (let v = 0; v < 3; v++) for (let j = 0; j < 4; j++) {
      const w = sw.getComponent(idx[t * 3 + v], j), b = si.getComponent(idx[t * 3 + v], j);
      if (w) sum.set(b, (sum.get(b) ?? 0) + w);
    }
    let best = -1, bw = 0;
    for (const [b, w] of sum) if (w > bw) (best = b), (bw = w);
    out[t] = bones[best]?.userData.rb ?? '';
  }
  return out;
}

// Per triangle: the weight its three vertices put, in all, on the bones whose names match.
function weightOn(mesh, re) {
  const g = mesh.geometry, idx = g.index.array, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const hit = mesh.skeleton.bones.map((b) => re.test(bare(b.userData.rb)));
  return Array.from({ length: idx.length / 3 }, (_, t) => {
    let w = 0;
    for (let v = 0; v < 3; v++) for (let j = 0; j < 4; j++) if (hit[si.getComponent(idx[t * 3 + v], j)]) w += sw.getComponent(idx[t * 3 + v], j);
    return w;
  });
}

// Triangles in one connected piece share a component number. Joined by POSITION, not vertex: UV seams split vertices.
function components(geo) {
  const pos = geo.attributes.position, idx = geo.index.array, n = pos.count;
  geo.computeBoundingBox();
  const q = geo.boundingBox.getSize(new THREE.Vector3()).length() * 1e-4;
  const parent = Int32Array.from({ length: n }, (_, i) => i), byPlace = new Map();
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a, b) => (parent[find(a)] = find(b));
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) / q)},${Math.round(pos.getY(i) / q)},${Math.round(pos.getZ(i) / q)}`;
    if (byPlace.has(k)) join(i, byPlace.get(k));
    else byPlace.set(k, i);
  }
  for (let t = 0; t < idx.length; t += 3) join(idx[t], idx[t + 1]), join(idx[t], idx[t + 2]);
  return Array.from({ length: idx.length / 3 }, (_, t) => find(idx[t * 3]));
}

const REGION = { top: 1, legs: 2, feet: 3, hands: 4, hips: 5 };
const regionOf = (rb) => {
  const b = side(rb);
  if (/^(Hand|Finger)/.test(b)) return REGION.hands;
  if (/^(Foot|Toe)/.test(b)) return REGION.feet;
  if (/^(Thigh|Calf)/.test(b)) return REGION.legs;
  if (b === 'Pelvis') return REGION.hips;
  return REGION.top;
};

// k-means on Lab (lightness counted at a third: the same cloth in a fold and in the light is one fabric), seeded by
// farthest points (deterministic). Returns the centres and the members of each.
const FEAT_L = 0.35;
function kmeans(lab, texels, K) {
  const sample = texels.filter((_, j) => j % 3 === 0);
  if (!sample.length) return [];
  const f = (i) => [lab[i * 3] * FEAT_L, lab[i * 3 + 1], lab[i * 3 + 2]];
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const mean = [0, 1, 2].map((o) => sample.reduce((s, i) => s + f(i)[o], 0) / sample.length);
  const centres = [];
  for (let c = 0; c < Math.min(K, sample.length); c++) {
    const from = centres.length ? centres : [mean];
    let best = sample[0], bd = -1;
    for (const i of sample) {
      const p = f(i), d = Math.min(...from.map((q) => d2(p, q)));
      if (d > bd) (bd = d), (best = i);
    }
    centres.push(f(best));
  }
  const nearest = (p) => {
    let best = 0, bd = Infinity;
    centres.forEach((c, j) => {
      const d = d2(p, c);
      if (d < bd) (bd = d), (best = j);
    });
    return best;
  };
  for (let it = 0; it < 10; it++) {
    const s = centres.map(() => [0, 0, 0, 0]);
    for (const i of sample) {
      const p = f(i), c = nearest(p);
      s[c][0] += p[0], s[c][1] += p[1], s[c][2] += p[2], s[c][3]++;
    }
    s.forEach((v, c) => v[3] && (centres[c] = [v[0] / v[3], v[1] / v[3], v[2] / v[3]]));
  }
  const members = centres.map(() => []);
  for (const i of texels) members[nearest(f(i))].push(i);
  return centres.map((centre, j) => ({ centre, texels: members[j] })).sort((a, b) => b.texels.length - a.texels.length);
}
const featDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const featOf = (lab, i) => [lab[i * 3] * FEAT_L, lab[i * 3 + 1], lab[i * 3 + 2]];

// The body: skin is whatever looks like the hands (always bare in Rocketbox). The rest is three fabrics, one per
// region: the top (torso and arms), the bottoms (legs) and the shoes (feet). Within a region, the biggest colour
// cluster is its fabric, with any cluster close to it (light and dark denim); a cluster far from it (a belt, a logo,
// a collar of another colour) keeps its own colour. The hips go to whichever of top or bottoms they look like.
const FABRICS = [['Top', REGION.top], ['Bottoms', REGION.legs], ['Shoes', REGION.feet]];
function analyseBody(mesh) {
  const S = 512, n = S * S, geo = mesh.geometry;
  const px = imagePixels(mesh.material.map.image, S);
  const bones = dominantBones(mesh);
  const region = rasterise(S, geo, (t) => regionOf(bones[t]), [5, 1, 2, 3, 4]);
  const lab = blurredLab(px, region, S);
  const hands = [];
  for (let i = 0; i < n; i++) if (region[i] === REGION.hands) hands.push(i);
  const skin = medianLab(lab, hands) ?? [70, 12, 18];
  // label: 0 skin, 1–3 a fabric (channel + 1), 4 left as it is, 255 not part of the body
  const label = new Uint8Array(n).fill(255);
  const byRegion = new Map();
  for (let i = 0; i < n; i++) {
    if (!region[i]) continue;
    if (Math.hypot(lab[i * 3 + 1] - skin[1], lab[i * 3 + 2] - skin[2]) < 9 && Math.abs(lab[i * 3] - skin[0]) < 25) label[i] = 0;
    else {
      label[i] = 4;
      (byRegion.get(region[i]) ?? byRegion.set(region[i], []).get(region[i])).push(i);
    }
  }
  const centres = [];
  FABRICS.forEach(([, r], ch) => {
    const clusters = kmeans(lab, byRegion.get(r) ?? [], 3);
    if (!clusters.length) return;
    const main = clusters[0].centre;
    centres[ch] = main;
    for (const c of clusters) if (featDist(c.centre, main) < 24) for (const i of c.texels) label[i] = ch + 1;
  });
  // The hips go to the top or the bottoms; trouser cuffs hang from the feet, so a foot texel that looks like the
  // bottoms is the bottoms.
  const nearer = (i, chans) => {
    const p = featOf(lab, i), d = chans.map((ch) => (centres[ch] ? featDist(p, centres[ch]) : Infinity));
    const j = d.indexOf(Math.min(...d));
    if (d[j] < 24) label[i] = chans[j] + 1;
  };
  for (const i of byRegion.get(REGION.hips) ?? []) nearer(i, [0, 1]);
  for (const i of byRegion.get(REGION.feet) ?? []) nearer(i, [1, 2]);
  // A 5×5 majority vote, so a fabric is not speckled with stray texels of another.
  const voted = label.slice(), votes = new Uint16Array(5);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (label[i] === 255) continue;
      votes.fill(0);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
          const l = label[yy * S + xx];
          if (l !== 255) votes[l]++;
        }
      let best = label[i];
      for (let l = 0; l < 5; l++) if (votes[l] > votes[best]) best = l;
      voted[i] = best;
    }
  const mask = new Uint8Array(n * 4), members = [[], [], []];
  let covered = 0;
  for (let i = 0; i < n; i++) {
    const l = voted[i];
    if (l === 255) continue;
    covered++;
    if (l === 0) mask[i * 4 + 3] = 255;
    else if (l <= 3) (mask[i * 4 + l - 1] = 255), members[l - 1].push(i);
  }
  const fabrics = FABRICS.map(([name], ch) => {
    const mean = meanLinear(px, members[ch]);
    return { channel: ch, name, mean, lum: lum(mean), share: members[ch].length / covered };
  }).filter((f) => f.share >= 0.015);
  return { kind: 'body', mask: maskTexture(mask, S), labels: voted, size: S, fabrics, skin: meanLinear(px, hands), skinLab: skin, covered };
}

// The head: hair is whatever looks more like the top of the skull than like the cheeks. Eyes, teeth, tongue and lips
// never count. Separate pieces of the head mesh that are mostly hair (a ponytail, a bun) are the head's hair pieces.
function analyseHead(mesh, cards) {
  const hasCards = !!cards;
  const S = 512, n = S * S, geo = mesh.geometry, idx = geo.index.array, tris = idx.length / 3;
  const px = imagePixels(mesh.material.map.image, S);
  const bones = dominantBones(mesh);
  const comp = components(geo);
  const count = new Map();
  for (const c of comp) count.set(c, (count.get(c) ?? 0) + 1);
  const main = [...count].sort((a, b) => b[1] - a[1])[0][0];
  const at = bindFrame(mesh);
  const up = at.Bip01_Head.clone().sub(at.Bip01_Pelvis).normalize();
  const brow = at.Bip01_MMiddleEyebrow ?? at.Bip01_Head;
  const P = new THREE.Vector3(), height = (v) => P.fromBufferAttribute(geo.attributes.position, v).applyMatrix4(mesh.bindMatrix).dot(up);
  let top = -Infinity;
  for (let v = 0; v < geo.attributes.position.count; v++) top = Math.max(top, height(v));
  const scalpLine = brow.dot(up) + 0.55 * (top - brow.dot(up));
  const NEVER = /^(LEye|REye|MTongue|MUpperLip|MBottomLip|LUpperlip|RUpperlip|LMouthBottom|RMouthBottom|LMouthCorner|RMouthCorner)$/;
  // The head bone outweighs the face bones nearly everywhere, so the skin sample is any triangle with real weight on
  // a cheek, the nose or the jaw muscles.
  const faceSkin = weightOn(mesh, /^(LCheek|RCheek|LMasseter|RMasseter|MNose)$/);
  // codes: 1 head, 2 cheeks (skin sample), 3 scalp (hair sample), 4 never hair
  const code = (t) => {
    const b = bare(bones[t]);
    if (NEVER.test(b)) return 4;
    if (faceSkin[t] > 0.6) return 2;
    if (comp[t] === main && b === 'Head' && [0, 1, 2].every((v) => height(idx[t * 3 + v]) > scalpLine)) return 3;
    return 1;
  };
  const codes = Array.from({ length: tris }, (_, t) => code(t));
  const cover = rasterise(S, geo, (t) => codes[t], [1, 2, 3, 4]);
  debug.head = { cover, S, scalpLine, top, brow: brow.dot(up), codes: [1, 2, 3, 4].map((c) => codes.filter((x) => x === c).length) };
  const lab = blurredLab(px, cover, S);
  const pick = (c) => {
    const l = [];
    for (let i = 0; i < n; i++) if (cover[i] === c) l.push(i);
    return l;
  };
  const cheeks = pick(2), scalp = pick(3);
  const skin = medianLab(lab, cheeks) ?? [70, 12, 18], gap = (ref) => Math.hypot(...ref.map((v, o) => v - skin[o]));
  let hairRef = medianLab(lab, scalp) ?? skin;
  // How sure the hair mask can be: how far the hair's colour is from the skin's. Light blond on fair skin is close; with
  // hair cards, their colour is a truer reference than the top of the skull.
  const scalpGap = gap(hairRef), cardLab = [0, 0, 0];
  if (cards) {
    const c = cards.lin.clone().convertLinearToSRGB();
    toLab(c.r * 255, c.g * 255, c.b * 255, cardLab, 0);
  }
  const cardGap = cards ? gap(cardLab) : 0;
  if (cardGap > scalpGap) hairRef = cardLab;
  // Below this the mask cannot tell hair from skin (Man 16's light-blond crop, Woman 1's blonde: 11–15; the others 34+),
  // and a style lent from it is mostly skin cut into patches.
  const sure = Math.max(scalpGap, cardGap) >= 25;
  // Bald: the top of the skull is the colour of the cheeks, and there are no hair cards. (Blonde hair on fair skin
  // comes close to the cheeks too, so a person with cards is never bald.)
  const bald = !hasCards && Math.hypot(...hairRef.map((v, o) => v - skin[o])) < 12;
  const hair = new Float32Array(n);
  if (!bald)
    for (let i = 0; i < n; i++) {
      if (!cover[i] || cover[i] === 4) continue;
      const dh = dist(lab, i, hairRef), ds = dist(lab, i, skin);
      const s = (ds - dh) / (ds + dh + 1e-3);
      hair[i] = Math.min(1, Math.max(0, (s + 0.1) / 0.3));
    }
  // Pieces other than the main head: hair if most of their surface reads as hair, otherwise never hair (eyes, teeth).
  const uv = geo.attributes.uv, score = new Map();
  for (let t = 0; t < tris; t++) {
    if (comp[t] === main) continue;
    let u = 0, v = 0;
    for (let k = 0; k < 3; k++) (u += uv.getX(idx[t * 3 + k]) / 3), (v += uv.getY(idx[t * 3 + k]) / 3);
    const i = Math.min(S - 1, Math.max(0, Math.floor(v * S))) * S + Math.min(S - 1, Math.max(0, Math.floor(u * S)));
    const s = score.get(comp[t]) ?? score.set(comp[t], [0, 0]).get(comp[t]);
    s[0] += hair[i], s[1]++;
  }
  const hairPiece = new Set([...score].filter(([, s]) => s[0] / s[1] > 0.5).map(([c]) => c));
  const notHair = rasterise(S, geo, (t) => (comp[t] !== main && !hairPiece.has(comp[t]) ? 1 : 0), [1]);
  // A beard is hair too, but it belongs to the face: anything hanging from the jaw, mouth or cheeks stays behind.
  const face = weightOn(mesh, /^(LInnerEyebrow|RInnerEyebrow|LOuterEyebrow|ROuterEyebrow|MMiddleEyebrow|LEyeBlinkTop|REyeBlinkTop|LEyeBlinkBottom|REyeBlinkBottom|MNose|MJaw|LMasseter|RMasseter|LCheek|RCheek|LMouthCorner|RMouthCorner|LMouthBottom|RMouthBottom|MBottomLip|MUpperLip|LUpperlip|RUpperlip|LCaninus|RCaninus)$/);
  // The mask: all hair in red; the scalp's hair only (no brows, no beard) in green, for a borrowed style's colour. Beard is what hangs from the face's
  // bones, or lies in front of the neck below the nose (under the chin hangs from the head bone).
  const eyesAt = at.Bip01_LEye.clone().add(at.Bip01_REye).multiplyScalar(0.5), headAt = at.Bip01_Head;
  const fwd = eyesAt.clone().sub(headAt), noseH = (at.Bip01_MNose ?? eyesAt).dot(up);
  fwd.sub(up.clone().multiplyScalar(fwd.dot(up))).normalize();
  const chin = (t) => {
    const c = new THREE.Vector3();
    for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(geo.attributes.position, idx[t * 3 + k]).applyMatrix4(mesh.bindMatrix));
    c.divideScalar(3);
    return c.dot(up) < noseH && c.clone().sub(headAt).dot(fwd) > 0;
  };
  const faceCover = rasterise(S, geo, (t) => (face[t] >= 0.3 || chin(t) ? 1 : 0), [1]);
  const mask = new Uint8Array(n * 4), hairTexels = [];
  for (let i = 0; i < n; i++) {
    const h = notHair[i] ? 0 : hair[i];
    mask[i * 4] = Math.round(h * 255);
    // (The top of the skull counts as scalp hair whatever it looks like: under a borrowed style, bare scalp showing
    // through its gaps would read as a hole.)
    if (!faceCover[i]) mask[i * 4 + 1] = cover[i] === 3 ? 255 : mask[i * 4];
    if (h > 0.8) hairTexels.push(i);
  }
  // What this head lends as a hairstyle: its hair pieces, and the CAP — the triangles of the head itself that are
  // painted or sculpted hair (a bob, an afro, a crop are modelled into the head, not hung on it as cards). The cap is
  // cut along the hairline by the hair mask when it is worn.
  const islandTris = [], keepTris = [], styleTris = [], bareTris = [];
  const hairAt = (t) => {
    let u = 0, v = 0;
    for (let k = 0; k < 3; k++) (u += uv.getX(idx[t * 3 + k]) / 3), (v += uv.getY(idx[t * 3 + k]) / 3);
    return hair[Math.min(S - 1, Math.max(0, Math.floor(v * S))) * S + Math.min(S - 1, Math.max(0, Math.floor(u * S)))];
  };
  for (let t = 0; t < tris; t++) {
    const piece = hairPiece.has(comp[t]);
    (piece ? islandTris : keepTris).push(t);
    const style = !bald && (piece || (comp[t] === main && codes[t] !== 4 && face[t] < 0.3 && hairAt(t) > 0.5));
    if (style) styleTris.push(t);
    else bareTris.push(t);
  }
  // The neck and the chest down to this person's own neckline are part of the head mesh, cut to meet their own top
  // (and where long hair is modelled onto the neck, back or shoulders, there is no skin under it). A borrowed outfit
  // takes the lender's piece with it (`neckTris`: from a third of the way up the neck down, less any hair standing
  // off the neck itself, where this person keeps their own skin instead; hair lying lower is painted over as shirt or skin), and this person's skin from just above the base of the
  // neck down comes off (`chestTris`), so it cannot poke through a higher collar nor patch the lender's: unless the
  // lender has hair there instead of skin (`chestOff`). `hairNear`: where the lender's hair lies, near the neck.
  // Heights, not bones: some people's necks hang from the spine. Small separate pieces count (a pendant, a patch of
  // skin), hair pieces do not.
  const styled = new Set(styleTris), neckTris = [], chestTris = [], hairNear = [];
  const neckH = at.Bip01_Neck.dot(up), headH = at.Bip01_Head.dot(up), length = headH - neckH;
  const cut = neckH + 0.1 * length, lend = neckH + 0.35 * length;
  // The neck's axis (from its base towards the head) and its radius, measured on the skin of its middle.
  const axis = at.Bip01_Head.clone().sub(at.Bip01_Neck).normalize(), radial = (p) => {
    const d = p.clone().sub(at.Bip01_Neck);
    return d.sub(axis.clone().multiplyScalar(d.dot(axis))).length();
  };
  const place = (v) => new THREE.Vector3().fromBufferAttribute(geo.attributes.position, v).applyMatrix4(mesh.bindMatrix);
  const centre = (t) => place(idx[t * 3]).add(place(idx[t * 3 + 1])).add(place(idx[t * 3 + 2])).divideScalar(3);
  const radii = [];
  for (const t of keepTris)
    if (comp[t] === main && !styled.has(t))
      for (let k = 0; k < 3; k++) {
        const p = place(idx[t * 3 + k]), hv = p.dot(up);
        if (hv > neckH + 0.3 * length && hv < neckH + 0.7 * length) radii.push(radial(p));
      }
  const radius = median(radii);
  for (let t = 0; t < tris; t++) {
    if (codes[t] === 4 || hairPiece.has(comp[t])) continue;
    const h = [0, 1, 2].map((v) => height(idx[t * 3 + v])), low = Math.min(...h);
    // (Only hair from half a neck's length below its base up: lower, "hair" is more often dark skin misread.)
    if (styled.has(t) && low < lend && Math.max(...h) > neckH - 0.5 * length) hairNear.push(t);
    // Hair standing off the neck stays behind (a hood, otherwise); a hairline or stubble lying on it comes along, as skin.
    const r = styled.has(t) && Math.max(...h) > neckH ? radial(centre(t)) : 0;
    if (low < lend && !(r > 1.15 * radius && r < 2 * radius)) neckTris.push(t);
    if (low < cut && !styled.has(t)) chestTris.push(t);
  }
  // Mean skin of the neck and chest (not the cheeks: a face is often ruddier), to match a borrowed neck to this one.
  const lent = new Set(neckTris), neckCover = rasterise(S, geo, (t) => (lent.has(t) && !styled.has(t) ? 1 : 0), [1]), neckSkin = [];
  for (let i = 0; i < n; i++) if (neckCover[i] && hair[i] < 0.2) neckSkin.push(i);
  const inset = 0.005 * at.Bip01_Head.distanceTo(at.Bip01_Pelvis), neck = { up, height: neckH, length, lend, at: at.Bip01_Neck.clone(), axis, radial, radius, skin: meanLinear(px, neckSkin) };
  const hairLin = meanLinear(px, hairTexels);
  // How much hair each vertex sits on: a borrowed style only covers where its hair is solid.
  const vertexHair = new Float32Array(uv.count);
  for (let v = 0; v < uv.count; v++) vertexHair[v] = hair[Math.min(S - 1, Math.max(0, Math.floor(uv.getY(v) * S))) * S + Math.min(S - 1, Math.max(0, Math.floor(uv.getX(v) * S)))];
  return { kind: 'head', scalpGap, cardGap, lendsHair: sure && !bald, vertexHair, mask: maskTexture(mask, S), bald, hairLin, hairLum: lum(hairLin), skin: meanLinear(px, cheeks), islandTris, keepTris, styleTris, bareTris, neckTris, chestTris, hairNear, inset, neck, frame: headFrame(mesh), pieces: count.size, hairPieces: hairPiece.size };
}

// Landmarks in the head bone's own frame, from the face's bones: what a borrowed hairstyle is fitted to. The eyes
// place it; the width of the jaw and the height of the eyes above the neck size it. (A box round the skull would
// measure the hair too: an afro is a big skull.)
function headFrame(mesh) {
  const hb = mesh.skeleton.bones.findIndex((b) => b.userData.rb === 'Bip01_Head');
  const inv = mesh.skeleton.boneInverses[hb], at = bindFrame(mesh), local = (n) => at[n].clone().applyMatrix4(inv);
  const eyes = local('Bip01_LEye').add(local('Bip01_REye')).multiplyScalar(0.5);
  return { eyes, jaw: local('Bip01_LMasseter').distanceTo(local('Bip01_RMasseter')), rise: eyes.length() };
}

// The hair cards (Rocketbox's alpha-tested "opacity" material) also carry the eyelashes: those are the triangles the
// blink moves, or that hang from the eyelid bones. They stay with the face when the hairstyle changes.
function analyseCards(mesh) {
  const S = 512, geo = mesh.geometry, idx = geo.index.array, tris = idx.length / 3;
  const bones = dominantBones(mesh);
  const blink = geo.morphAttributes.position?.[mesh.morphTargetDictionary?.blink];
  const moved = (v) => blink && Math.abs(blink.getX(v)) + Math.abs(blink.getY(v)) + Math.abs(blink.getZ(v)) > 1e-5;
  const lashTris = [], cardTris = [];
  for (let t = 0; t < tris; t++) {
    const lash = /Eye/.test(bones[t]) || [0, 1, 2].some((k) => moved(idx[t * 3 + k]));
    (lash ? lashTris : cardTris).push(t);
  }
  const cards = new Set(cardTris);
  const cover = rasterise(S, geo, (t) => (cards.has(t) ? 1 : 0), [1]);
  const px = imagePixels(mesh.material.map.image, S), pick = [];
  for (let i = 0; i < S * S; i++) if (cover[i] && px[i * 4 + 3] > 128) pick.push(i);
  const lin = meanLinear(px, pick);
  return { kind: 'cards', lashTris, cardTris, lin, lum: lum(lin) };
}

const ANALYSES = new WeakMap();
const OWN_GEOMETRY = new WeakMap();
export const debug = {};
export const timings = { analyse: 0, analyses: 0, graft: 0 };
// The analysis of one part of a person (cached: a clone shares its source's geometry, so it shares this too).
export function analyse(mesh) {
  const geo = OWN_GEOMETRY.get(mesh) ?? mesh.geometry;
  if (ANALYSES.has(geo)) return ANALYSES.get(geo);
  const t0 = performance.now();
  const view = geo === mesh.geometry ? mesh : Object.assign(Object.create(mesh), { geometry: geo });
  const fn = { body: analyseBody, head: analyseHead, hair: analyseCards }[mesh.userData.part];
  const cards = mesh.userData.part === 'head' && mesh.parent?.children.find((o) => o.userData.part === 'hair' && !o.userData.graft);
  const a = fn ? fn(view, cards ? analyse(cards) : null) : null;
  a && (a.ms = performance.now() - t0);
  timings.analyse += performance.now() - t0;
  timings.analyses++;
  ANALYSES.set(geo, a);
  return a;
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Wearing it: a look applied to one body (a Sim's), with its own materials so nobody else changes.

const SUBSETS = new WeakMap();
// The same vertices with only some triangles: shares every attribute (and its GPU buffer) with the source.
// (`position`, if given, replaces the positions: a pressed-down hairstyle.)
function subset(geo, tris, tag, position = null) {
  const cache = SUBSETS.get(geo) ?? SUBSETS.set(geo, new Map()).get(geo);
  if (cache.has(tag)) return cache.get(tag);
  const g = new THREE.BufferGeometry(), idx = geo.index.array, out = new Uint32Array(tris.length * 3);
  tris.forEach((t, j) => out.set(idx.subarray(t * 3, t * 3 + 3), j * 3));
  for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, k === 'position' && position ? position : a);
  g.morphAttributes = geo.morphAttributes;
  g.morphTargetsRelative = geo.morphTargetsRelative;
  g.setIndex(new THREE.BufferAttribute(out, 1));
  cache.set(tag, g);
  return g;
}

// Which of this person's chest triangles come off under a borrowed outfit: all of them, except where the lender has
// hair rather than skin (within ~4 cm; both compared in their own neck bone's frame).
const CHEST = new Map();
function chestOff(mine, mineInfo, theirs, theirInfo) {
  const key = `${mine.geometry.uuid}:${theirs.geometry.uuid}`;
  if (CHEST.has(key)) return CHEST.get(key);
  const local = (mesh, geo) => {
    const nb = mesh.skeleton.bones.findIndex((b) => b.userData.rb === 'Bip01_Neck');
    const m = mesh.skeleton.boneInverses[nb].clone().multiply(mesh.bindMatrix), pos = geo.attributes.position;
    return (v) => new THREE.Vector3().fromBufferAttribute(pos, v).applyMatrix4(m);
  };
  const W = local(mine, OWN_GEOMETRY.get(mine) ?? mine.geometry), D = local(theirs, theirs.geometry);
  const wIdx = (OWN_GEOMETRY.get(mine) ?? mine.geometry).index.array, dIdx = theirs.geometry.index.array;
  const hair = [...new Set(theirInfo.hairNear.flatMap((t) => [dIdx[t * 3], dIdx[t * 3 + 1], dIdx[t * 3 + 2]]))].map(D);
  const r2 = (0.6 * mineInfo.neck.length) ** 2, out = new Set();
  for (const t of mineInfo.chestTris) {
    const c = W(wIdx[t * 3]).add(W(wIdx[t * 3 + 1])).add(W(wIdx[t * 3 + 2])).divideScalar(3);
    if (!hair.some((p) => p.distanceToSquared(c) < r2)) out.add(t);
  }
  CHEST.set(key, out);
  return out;
}

// A lender's neck piece, ready to wear: per vertex, what fills any of their hair lying on it (`wFill`: skin on the neck
// itself, else whatever their own top has nearest, skin or one of its fabrics: under long hair down the back there is
// no shirt, so the shirt is continued), and how far to push it in (`wNeckW.x`: none along the seam where it meets their
// top, or a gap opens there; full from the base of the neck up, where it hides under this person's neck), and how much
// of it is neck, to be fitted to this person's neck size (`wNeckW.y`: the push, but only near the neck's axis).
const NECKS = new WeakMap();
function neckPiece(donor) {
  const geo = donor.head.geometry;
  if (NECKS.has(geo)) return NECKS.get(geo);
  const dh = analyse(donor.head), body = analyse(donor.body), g = subset(geo, dh.neckTris, 'neck');
  const n = geo.attributes.position.count, idx = geo.index.array, { up, height, length, radial, radius } = dh.neck;
  const at = (mesh, v) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, v).applyMatrix4(mesh.bindMatrix);
  const mine = [...new Set(dh.neckTris.flatMap((t) => [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]]))];
  const P = new Map(mine.map((v) => [v, at(donor.head, v)]));
  // The seam: the piece's open edges, all but its own top cut (a crew neck's collar rises above the base of the neck at
  // the sides and back). Edges are matched by place: UV seams split vertices.
  const q = length * 0.01, key = (v) => P.get(v).toArray().map((x) => Math.round(x / q)).join(',');
  const edges = new Map();
  for (const t of dh.neckTris)
    for (let k = 0; k < 3; k++) {
      const a = idx[t * 3 + k], b = idx[t * 3 + ((k + 1) % 3)], e = [key(a), key(b)].sort().join('|');
      const r = edges.get(e) ?? edges.set(e, { n: 0, a, b }).get(e);
      r.n++;
    }
  const seam = [];
  for (const { n: c, a, b } of edges.values()) if (c === 1) for (const v of [a, b]) if (P.get(v).dot(up) < dh.neck.lend - 0.05 * length) seam.push(P.get(v));
  // The lender's top: each of its vertices with what it is there (0 skin, 1–3 a fabric).
  const bg = donor.body.geometry, buv = bg.attributes.uv, S = body.size;
  const near = [...new Set(bg.index.array)].map((v) => {
    const i = Math.min(S - 1, Math.max(0, Math.floor(buv.getY(v) * S))) * S + Math.min(S - 1, Math.max(0, Math.floor(buv.getX(v) * S)));
    const l = body.labels[i];
    return { p: at(donor.body, v), fill: l >= 1 && l <= 3 ? l : 0 };
  });
  const fill = new Float32Array(n * 4), w = new Float32Array(n * 2), R = 0.3 * length;
  let cape = 0;
  for (const v of mine) {
    const p = P.get(v);
    let d = Infinity;
    for (const s of seam) d = Math.min(d, s.distanceToSquared(p));
    w[v * 2] = (seam.length ? THREE.MathUtils.smoothstep(Math.sqrt(d), 0, R) : 1) * THREE.MathUtils.smoothstep(p.dot(up), height - 0.5 * length, height);
    w[v * 2 + 1] = dh.vertexHair[v] < 0.5 ? w[v * 2] * THREE.MathUtils.smoothstep(radial(p), 2 * radius, 1.4 * radius) : 0;
    let best = null, bd = Infinity;
    if (radial(p) > 1.3 * radius)
      for (const b of near) {
        const dd = b.p.distanceToSquared(p);
        if (dd < bd) (bd = dd), (best = b);
      }
    fill[v * 4 + (best?.fill ?? 0)] = 1;
    if (best?.fill && dh.vertexHair[v] > 0.5) cape++;
  }
  // Hair standing in for the lender's shirt: their top has a hole under their hair, and nothing borrowed fills it well.
  g.userData.cape = cape / mine.length;
  g.setAttribute('wFill', new THREE.BufferAttribute(fill, 4));
  g.setAttribute('wNeckW', new THREE.BufferAttribute(w, 2));
  NECKS.set(geo, g);
  return g;
}

const STATE = new WeakMap();
function stateOf(body) {
  let s = STATE.get(body);
  if (s) return s;
  const parts = {};
  body.outer.traverse((o) => {
    if (!o.isSkinnedMesh || o.userData.graft || !o.userData.part) return;
    parts[o.userData.part] = o;
    OWN_GEOMETRY.set(o, o.geometry);
    o.material = dressClone(o.material);
  });
  const bones = new Map();
  body.outer.traverse((o) => o.isBone && bones.set(o.userData.rb ?? o.name, o));
  STATE.set(body, (s = { parts, bones, grafts: {}, applied: {} }));
  return s;
}

const GRAFT_SOURCE = new WeakMap();
// Another person's mesh on this person's skeleton: bones matched by name, the OTHER person's inverse bind matrices
// kept, so each vertex sits where it sat relative to its bones. `fit` re-fits the head bone's (a borrowed hairstyle
// to this skull).
function graft(s, near, donorMesh, geometry, fit) {
  const bones = donorMesh.skeleton.bones.map((b) => s.bones.get(b.userData.rb));
  if (bones.some((b) => !b)) throw new Error('the borrowed part hangs from a bone this person does not have');
  const inverses = donorMesh.skeleton.boneInverses.map((m, i) => (fit && donorMesh.skeleton.bones[i].userData.rb === 'Bip01_Head' ? m.clone().premultiply(fit) : m.clone()));
  const mesh = new THREE.SkinnedMesh(geometry, dressClone(donorMesh.material));
  mesh.morphTargetDictionary = { ...donorMesh.morphTargetDictionary };
  mesh.morphTargetInfluences = new Array(geometry.morphAttributes.position?.length ?? 0).fill(0);
  mesh.bind(new THREE.Skeleton(bones, inverses), donorMesh.bindMatrix.clone());
  mesh.frustumCulled = false;
  mesh.castShadow = near.castShadow;
  mesh.userData = { graft: true, part: donorMesh.userData.part };
  GRAFT_SOURCE.set(mesh, donorMesh);
  near.parent.add(mesh);
  return mesh;
}
function dropGrafts(s, key) {
  for (const m of s.grafts[key] ?? []) {
    m.removeFromParent();
    m.material.dispose();
    m.skeleton.dispose();
  }
  delete s.grafts[key];
}
// Every vertex of a head in its head bone's own frame.
function headLocal(mesh, geo) {
  const hb = mesh.skeleton.bones.findIndex((b) => b.userData.rb === 'Bip01_Head');
  const m = mesh.skeleton.boneInverses[hb].clone().multiply(mesh.bindMatrix), pos = geo.attributes.position;
  const out = new Float32Array(pos.count * 3), P = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) P.fromBufferAttribute(pos, v).applyMatrix4(m).toArray(out, v * 3);
  return out;
}
// This person's own hair, pressed down under a borrowed style: seen from the middle of the head, every vertex of their
// hair that reaches further out than the borrowed hair does in that direction (less a margin) is moved in to just
// under it, but never more than ~1.3 cm (hair hanging far below the borrowed style would be dragged into the skull
// and stretch into spikes). Nothing is taken off, so nothing can leave a hole: where the borrowed hair is patchy, its
// hairline higher or this person's hair longer, their own hair shows, in the borrowed style's colour. Returns the
// moved positions (or null: nothing moved).
const PRESSED = new Map();
function pressing(mine, mineInfo, theirs, theirInfo, fit) {
  const key = `${mine.geometry.uuid}:${theirs.geometry.uuid}`;
  if (PRESSED.has(key)) return PRESSED.get(key);
  const own = OWN_GEOMETRY.get(mine) ?? mine.geometry;
  const W = headLocal(mine, own), D = headLocal(theirs, theirs.geometry);
  const wIdx = own.index.array, dIdx = theirs.geometry.index.array;
  const verts = (idx, tris) => new Set(tris.flatMap((t) => [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]]));
  const capW = verts(wIdx, mineInfo.styleTris), capD = verts(dIdx, theirInfo.styleTris);
  const c = new THREE.Vector3();
  for (const v of capW) c.x += W[v * 3], c.y += W[v * 3 + 1], c.z += W[v * 3 + 2];
  c.divideScalar(Math.max(1, capW.size)).add(mineInfo.frame.eyes).multiplyScalar(0.5);
  const AZ = 32, EL = 16, reach = new Float32Array(AZ * EL), q = new THREE.Vector3();
  const bin = (v) => {
    const r = v.length(), el = Math.acos(Math.max(-1, Math.min(1, v.y / r))), az = Math.atan2(v.z, v.x) + Math.PI;
    return Math.min(EL - 1, Math.floor((el / Math.PI) * EL)) * AZ + Math.min(AZ - 1, Math.floor((az / (2 * Math.PI)) * AZ));
  };
  for (const v of capD) {
    if (theirInfo.vertexHair[v] < 0.8) continue;
    q.fromArray(D, v * 3).applyMatrix4(fit).sub(c);
    const b = bin(q);
    reach[b] = Math.max(reach[b], q.length());
  }
  // The lowest reach among a direction and its neighbours (where they have any), so a vertex pressed under one bin is
  // under the next one too.
  const low = reach.map((r, b) => {
    if (!r) return 0;
    const e = Math.floor(b / AZ), a = b % AZ;
    let m = r;
    for (let de = -1; de <= 1; de++)
      for (let da = -1; da <= 1; da++) {
        const ee = e + de;
        if (ee < 0 || ee >= EL) continue;
        const rr = reach[ee * AZ + ((a + da + AZ) % AZ)];
        if (rr) m = Math.min(m, rr);
      }
    return m;
  });
  const margin = 0.05 * mineInfo.frame.jaw, most = 0.12 * mineInfo.frame.jaw, back = new THREE.Matrix4();
  const hb = mine.skeleton.bones.findIndex((b) => b.userData.rb === 'Bip01_Head');
  back.copy(mine.skeleton.boneInverses[hb]).multiply(mine.bindMatrix).invert();
  const pos = new Float32Array(own.attributes.position.array), floor = mineInfo.neck.height + 0.35 * mineInfo.neck.length;
  const P = new THREE.Vector3();
  let moved = 0;
  for (const v of capW) {
    // Only the head's hair: below the neck, "hair" is a dark mark on the skin as often as it is hair.
    if (P.fromBufferAttribute(own.attributes.position, v).applyMatrix4(mine.bindMatrix).dot(mineInfo.neck.up) < floor) continue;
    q.fromArray(W, v * 3).sub(c);
    const r = low[bin(q)], len = q.length();
    if (!r || len <= r - margin) continue;
    q.multiplyScalar((len - Math.min(most, len - (r - margin))) / len).add(c).applyMatrix4(back).toArray(pos, v * 3);
    moved++;
  }
  const out = moved ? new THREE.BufferAttribute(pos, 3) : null;
  PRESSED.set(key, out);
  return out;
}

// Maps the donor's head frame onto this person's: their eyes onto these eyes, scaled by face size (within reason),
// and 2% larger still so a borrowed cap sits just outside this person's own scalp instead of fighting it.
function headFit(mine, theirs) {
  const k = Math.min(1.1, Math.max(0.92, (mine.jaw / theirs.jaw + mine.rise / theirs.rise) / 2)) * 1.02;
  return new THREE.Matrix4().makeTranslation(mine.eyes.x, mine.eyes.y, mine.eyes.z).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(-theirs.eyes.x, -theirs.eyes.y, -theirs.eyes.z));
}

// A look: { weight: -1 (slim) … 1 (heavy), height: 0.9 … 1.1,
//           hair: { style: <person name> | null, colour: '#hex' | null },
//           outfit: { from: <person name> | null, colours: ['#hex' | null, …] (one per fabric channel) } }
// `donorOf(name)` resolves to { parts: { body, head, hair } } of a loaded, dressable person.
export async function dress(body, look, donorOf) {
  const t0 = performance.now();
  const s = stateOf(body), { parts } = s;
  const graftsBefore = performance.now();

  const head = parts.head && analyse(parts.head), cards = parts.hair && analyse(parts.hair);
  const outfitFrom = look.outfit?.from ?? null;
  if (s.applied.outfit !== outfitFrom) {
    dropGrafts(s, 'outfit');
    if (outfitFrom) {
      const d = await donorOf(outfitFrom), list = [graft(s, parts.body, d.parts.body, d.parts.body.geometry)];
      // The lender's neck and chest, made to meet this outfit, in this person's skin, just inside this person's neck.
      const dh = parts.head && d.parts.head && analyse(d.parts.head);
      if (dh?.neckTris.length) {
        const neck = graft(s, parts.head, d.parts.head, neckPiece(d.parts));
        // Its skin tinted to this person's; any of the lender's hair lying on it painted over (`neckPiece`), without
        // the hair's bumps. Both sides drawn: where a wider neck stands round a thinner one, the gap shows skin, not sky.
        Object.assign(neck.material, { defines: { ...neck.material.defines, W_FILL: '' }, normalMap: null, side: THREE.DoubleSide });
        const u = uniformsOf(neck.material);
        (u.wMask.value = dh.mask), (u.wInset.value = dh.inset), u.wFillSkin.value.copy(head.neck.skin);
        // The neck axis in the piece's own space (its bind matrix undone), and the two necks' sizes.
        const back = d.parts.head.bindMatrix.clone().invert();
        u.wAxisAt.value.copy(dh.neck.at).applyMatrix4(back);
        u.wAxis.value.copy(dh.neck.axis).transformDirection(back);
        u.wNeckK.value = head.neck.radius / dh.neck.radius;
        u.wSkin.value.setRGB(...['r', 'g', 'b'].map((c) => Math.min(3, Math.max(0.3, head.neck.skin[c] / dh.neck.skin[c]))));
        list.push(neck);
      }
      s.grafts.outfit = list;
    }
    parts.body.visible = !outfitFrom;
    s.applied.outfit = outfitFrom;
  }

  const style = look.hair?.style ?? null;
  let donorHair = null, pressed = null;
  if (s.applied.hair !== style) {
    dropGrafts(s, 'hair');
    if (style) {
      const d = await donorOf(style);
      const dh = analyse(d.parts.head), fit = headFit(head.frame, dh.frame), list = [];
      if (parts.hair) parts.hair.geometry = subset(OWN_GEOMETRY.get(parts.hair), cards.lashTris, 'lashes');
      // This person's own hair cards and hair pieces come off, the hair modelled into their head is pressed down under
      // the borrowed style, and the borrowed one goes on.
      if (parts.head) pressed = pressing(parts.head, head, d.parts.head, dh, fit);
      if (d.parts.hair) list.push(graft(s, parts.head, d.parts.hair, subset(d.parts.hair.geometry, analyse(d.parts.hair).cardTris, 'cards'), fit));
      if (dh.styleTris.length) list.push(graft(s, parts.head, d.parts.head, subset(d.parts.head.geometry, dh.styleTris, 'hair-cap'), fit));
      s.grafts.hair = list;
    } else if (parts.hair) parts.hair.geometry = OWN_GEOMETRY.get(parts.hair);
    s.applied.hair = style;
    s.applied.pressed = pressed;
  }
  // The head: all of it, less its own hairstyle's pieces under a borrowed one (the rest of its hair pressed down), less
  // its chest under a borrowed outfit.
  const headTag = `${style}|${outfitFrom}`;
  if (parts.head && s.applied.headTag !== headTag) {
    const lender = outfitFrom && (await donorOf(outfitFrom)).parts.head;
    const own = OWN_GEOMETRY.get(parts.head), gone = new Set(lender ? chestOff(parts.head, head, lender, analyse(lender)) : []);
    pressed = s.applied.pressed;
    if (style) for (const t of head.islandTris) gone.add(t);
    const all = Array.from({ length: own.index.count / 3 }, (_, t) => t);
    parts.head.geometry = gone.size || pressed ? subset(own, all.filter((t) => !gone.has(t)), `head:${headTag}`, pressed) : own;
    s.applied.headTag = headTag;
  }
  timings.graft += performance.now() - graftsBefore;
  if (style) donorHair = analyse((await donorOf(style)).parts.head);

  // Clothes colours, and the skin of a borrowed outfit's arms and hands matched to this person's.
  const clothes = s.grafts.outfit?.[0] ?? parts.body;
  const info = analyse(GRAFT_SOURCE.get(clothes) ?? clothes);
  const u = uniformsOf(clothes.material);
  u.wMask.value = info.mask;
  for (let ch = 0; ch < 3; ch++) {
    const f = info.fabrics.find((x) => x.channel === ch), colour = look.outfit?.colours?.[ch];
    u.wOn.value.setComponent(ch, f && colour ? 1 : 0);
    u.wLum.value.setComponent(ch, f?.lum ?? 1);
    if (colour) u[`wCol${ch}`].value.set(colour);
  }
  // A borrowed neck continues the top under the lender's hair, in the top's colours.
  const neck = s.grafts.outfit?.[1];
  if (neck) for (let ch = 0; ch < 3; ch++) {
    const colour = look.outfit?.colours?.[ch], f = info.fabrics.find((x) => x.channel === ch);
    const v = uniformsOf(neck.material)[`wCol${ch}`].value;
    if (colour) v.set(colour);
    else v.copy(f?.mean ?? head.skin);
  }
  if (clothes !== parts.body) {
    const mine = analyse(parts.body).skin, theirs = info.skin;
    u.wSkin.value.setRGB(mine.r / theirs.r, mine.g / theirs.g, mine.b / theirs.b);
    u.wSkin.value.r = Math.min(3, Math.max(0.3, u.wSkin.value.r)), (u.wSkin.value.g = Math.min(3, Math.max(0.3, u.wSkin.value.g))), (u.wSkin.value.b = Math.min(3, Math.max(0.3, u.wSkin.value.b)));
  }

  // Hair colour: the painted hair on the head, the cards, and any borrowed pieces.
  const chosen = look.hair?.colour ? new THREE.Color(look.hair.colour) : null;
  const setHair = (mat, { mask = BLANK, all = 0, cut = 0, colour, lumValue }) => {
    const v = uniformsOf(mat);
    v.wMask.value = mask;
    v.wAll.value = all;
    v.wCut.value = cut;
    v.wOn.value.x = colour ? 1 : 0;
    if (colour) v.wCol0.value.copy(colour);
    v.wLum.value.x = lumValue;
  };
  // A chosen colour paints all of this person's painted hair, brows and beard too; a borrowed style with none chosen
  // paints only the hair on their scalp (green channel) in its colour, so what shows of theirs matches it.
  if (parts.head) {
    setHair(parts.head.material, { mask: head.mask, colour: head.bald ? null : chosen, lumValue: head.hairLum });
    const v = uniformsOf(parts.head.material), scalp = !chosen && !head.bald && donorHair ? donorHair.hairLin : null;
    v.wOn.value.y = scalp ? 1 : 0;
    v.wLum.value.y = head.hairLum;
    if (scalp) v.wCol1.value.copy(scalp);
  }
  if (parts.hair) setHair(parts.hair.material, { all: 1, colour: style ? null : chosen, lumValue: cards.lum });
  for (const g of s.grafts.hair ?? []) {
    const a = analyse(GRAFT_SOURCE.get(g));
    if (a.kind === 'cards') setHair(g.material, { all: 1, colour: chosen, lumValue: a.lum });
    else setHair(g.material, { mask: a.mask, cut: 1, colour: chosen, lumValue: a.hairLum });
  }

  // Body shape and height.
  const w = Math.max(-1, Math.min(1, look.weight ?? 0));
  body.outer.traverse((o) => {
    const d = o.morphTargetDictionary;
    if (!o.isSkinnedMesh || d?.heavy === undefined) return;
    o.morphTargetInfluences[d.heavy] = Math.max(0, w);
    o.morphTargetInfluences[d.slim] = Math.max(0, -w);
  });
  body.outer.scale.setScalar(look.height ?? 1);
  return { ms: performance.now() - t0, fabrics: info.fabrics, bald: head?.bald ?? true };
}

// What a person offers: their fabrics (for the colour pickers), whether they have hair to lend (`lendsHair`: not bald,
// and a mask sure of where their hair is), and how much of their outfit is their own hair standing in for a shirt
// (`cape`, 0–1).
export function describe(parts) {
  const body = parts.body && analyse(parts.body), head = parts.head && analyse(parts.head), cards = parts.hair && analyse(parts.hair);
  const cape = body && head ? neckPiece(parts).userData.cape : 0;
  return { fabrics: body?.fabrics ?? [], bald: head?.bald ?? true, hairCards: cards?.cardTris.length ?? 0, hairPieces: head?.hairPieces ?? 0, hairColour: head?.hairLin, lendsHair: head?.lendsHair ?? false, cape };
}
export function partsOf(root) {
  const parts = {};
  root.traverse((o) => o.isSkinnedMesh && o.userData.part && !o.userData.graft && (parts[o.userData.part] = o));
  return parts;
}
