// The voxel world: 16³ chunks made by a generator on demand, the player's edits kept apart from them (so a chunk
// can be dropped and made again), and Minecraft's light: two channels of 0–15, the sky's and the blocks', where the
// sky shines straight down every column until something stops it (so a shaft you dig is lit to the bottom) and
// both spread a level a block from there. One mesh per chunk (plus one for its water), built inside a per-frame
// time budget, in whole columns from the ground up wherever the player can see the surface, so there are no holes.
import * as THREE from 'three';
import { B, BLOCKS, isOpaque, emits, filters, stopsSky, tilesOf, tileUV, tileSubUV } from './blocks.mjs';

export const CS = 16;
const M = 14; // the light margin: no light travels further than this
const S = CS + 2 * M;
const S2 = S * S;
const idx = (x, y, z) => x + z * CS + y * CS * CS;
const key = (cx, cy, cz) => `${cx},${cy},${cz}`;
const ckey = (cx, cz) => `${cx},${cz}`;
const LIQUID_TOP = 0.875;

// Minecraft's light curve (its light map at the default brightness), on 0–1. Exported for the creatures' shading.
const curve = (l) => {
  const g = l / (4 - 3 * l);
  return g + (1 - Math.pow(1 - g, 4) - g) * 0.5;
};
export const AMBIENT = 0.045;
export const brightness = (l) => AMBIENT + (1 - AMBIENT) * curve(Math.max(0, Math.min(15, l)) / 15);

// The faces: normal, the two in-plane axes, the tile slot (0 top, 1 side, 2 bottom), and Minecraft's face shade.
// u × v = n for every face, so each quad winds counter-clockwise seen from outside (round 1 had the top and bottom
// wound the other way, and they were culled: the sky showed through every bit of ground seen from above).
const FACES = [
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], t: 0, s: 1.0 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], t: 2, s: 0.5 },
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], t: 1, s: 0.6 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], t: 1, s: 0.6 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], t: 1, s: 0.8 },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], t: 1, s: 0.8 }
];
const ri = (dx, dy, dz) => dx + dz * S + dy * S2; // an offset inside the light region
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
for (const f of FACES) {
  f.dn = ri(...f.n);
  f.k = CORNERS.map(([su, sv]) => {
    const u = f.u.map((a) => a * su), v = f.v.map((a) => a * sv);
    return {
      su, sv,
      s1: ri(...u), s2: ri(...v), cc: ri(u[0] + v[0], u[1] + v[1], u[2] + v[2]),
      // The corner's place in the block: the middle of the face pushed half a block along u and v.
      p: [0, 1, 2].map((a) => 0.5 + f.n[a] * 0.5 + (u[a] + v[a]) * 0.5)
    };
  });
}
const AO = [0.5, 0.66, 0.82, 1];

// What every chunk material reads: the fog (by true distance, so the screen's edges fog as the middle does) and the
// daylight. The game sets these each frame.
export const env = {
  fogColor: { value: new THREE.Color(0x000000) },
  fogNear: { value: 40 },
  fogFar: { value: 60 },
  daylight: { value: 1 },
  time: { value: 0 }
};

const VERT = `attribute vec3 lt;
varying vec2 vUv; varying vec3 vLt; varying float vDist; varying vec3 vPos;
void main() {
  vUv = uv; vLt = lt;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `uniform sampler2D map; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform float daylight;
uniform float time; uniform float alpha;
varying vec2 vUv; varying vec3 vLt; varying float vDist; varying vec3 vPos;
float curve(float l) { float g = l / (4.0 - 3.0 * l); return mix(g, 1.0 - pow(1.0 - g, 4.0), 0.5); }
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
  float sky = curve(vLt.x) * daylight;
  float blk = curve(vLt.y);
  vec3 light = max(vec3(sky), blk * vec3(1.0, 0.92, 0.8));
  light = ${AMBIENT.toFixed(3)} + ${(1 - AMBIENT).toFixed(3)} * light;
  vec3 c = t.rgb * light * vLt.z;
#ifdef WATER
  c *= 0.94 + 0.06 * sin(vPos.x * 1.7 + vPos.z * 1.3 + time * 1.6);
#endif
  float f = smoothstep(fogNear, fogFar, vDist);
  gl_FragColor = vec4(mix(c, fogColor, f), alpha);
}`;

function chunkMaterial(map, water) {
  return new THREE.ShaderMaterial({
    uniforms: { ...env, map: { value: map }, alpha: { value: water ? 0.72 : 1 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: water ? { WATER: 1 } : {},
    transparent: water,
    side: water ? THREE.DoubleSide : THREE.FrontSide
  });
}

// Geometry under construction, in growable typed arrays (a chunk is rebuilt often; no garbage per face).
class Geo {
  constructor() {
    this.cap = 0;
    this.icap = 0;
    this.nv = 0;
    this.ni = 0;
    this.need(8192, 12288);
  }
  reset() {
    this.nv = 0;
    this.ni = 0;
  }
  // Room for v more vertices and i more indices.
  need(v, i) {
    const g = (a, n) => {
      if (a && n <= a.length) return a;
      const b = new (a?.constructor ?? Float32Array)(n);
      if (a) b.set(a);
      return b;
    };
    if (this.nv + v > this.cap) {
      this.cap = Math.max(this.nv + v, this.cap * 2);
      this.pos = g(this.pos, this.cap * 3);
      this.uv = g(this.uv, this.cap * 2);
      this.lt = g(this.lt, this.cap * 3);
    }
    if (this.ni + i > this.icap) {
      this.icap = Math.max(this.ni + i, this.icap * 2);
      this.ind = this.ind ? g(this.ind, this.icap) : new Uint32Array(this.icap);
    }
  }
  vert(x, y, z, u, v, sky, blk, shade) {
    const n = this.nv++;
    this.pos[n * 3] = x;
    this.pos[n * 3 + 1] = y;
    this.pos[n * 3 + 2] = z;
    this.uv[n * 2] = u;
    this.uv[n * 2 + 1] = v;
    this.lt[n * 3] = sky;
    this.lt[n * 3 + 1] = blk;
    this.lt[n * 3 + 2] = shade;
  }
  quad(a, b, c, d) {
    const i = this.ind, n = this.ni;
    i[n] = a; i[n + 1] = b; i[n + 2] = c; i[n + 3] = a; i[n + 4] = c; i[n + 5] = d;
    this.ni += 6;
  }
  build() {
    if (!this.ni) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.nv * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, this.nv * 2), 2));
    geo.setAttribute('lt', new THREE.BufferAttribute(this.lt.slice(0, this.nv * 3), 3));
    geo.setIndex(new THREE.BufferAttribute(this.nv > 65535 ? this.ind.slice(0, this.ni) : Uint16Array.from(this.ind.subarray(0, this.ni)), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, 8, 8), 14);
    return geo;
  }
}
const solidGeo = new Geo();
const waterGeo = new Geo();

export class World {
  constructor({ generator, scene, texture, radius = 4, vradius = 2 }) {
    this.gen = generator;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.material = chunkMaterial(texture, false);
    this.waterMaterial = chunkMaterial(texture, true);
    this.chunks = new Map();
    this.edits = new Map(); // chunk key → Map(index → block id)
    this.floors = new Map(); // chunk column → Int32Array(256): the highest cell that stops the sky in each column
    this.surface = new Map(); // chunk column → [lowest, highest] chunk y holding the ground there
    this.radius = radius;
    this.vradius = vradius;
    this.queue = [];
    this.wanted = new Set();
    this.plannedAt = null;
    this.region = {
      ids: new Uint8Array(S * S * S), sky: new Uint8Array(S * S * S), blk: new Uint8Array(S * S * S),
      q: new Int32Array(S * S * S * 2), floors: new Int32Array(S2)
    };
    this.onEdit = null;
    this.stats = { meshes: 0, ms: 0 }; // chunks built by the streamer, and the time they took (making their data included)
  }

  // ── data ──
  data(cx, cy, cz) {
    const k = key(cx, cy, cz);
    let c = this.chunks.get(k);
    if (c) return c;
    const data = this.gen.chunk(cx, cy, cz);
    const ed = this.edits.get(k);
    if (ed) for (const [i, id] of ed) data[i] = id;
    c = { cx, cy, cz, k, data, mesh: null, wmesh: null, dirty: true, light: null, lightConst: 0, emitters: 0 };
    for (let i = 0; i < data.length; i++) if (emits[data[i]]) c.emitters++;
    this.chunks.set(k, c);
    return c;
  }

  get(x, y, z) {
    const cx = Math.floor(x / CS), cy = Math.floor(y / CS), cz = Math.floor(z / CS);
    return this.data(cx, cy, cz).data[idx(x - cx * CS, y - cy * CS, z - cz * CS)];
  }

  // Light at a cell (for the monsters, the hand, the warnings): what the last mesh of that chunk computed.
  lightAt(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const cx = Math.floor(x / CS), cy = Math.floor(y / CS), cz = Math.floor(z / CS);
    const c = this.chunks.get(key(cx, cy, cz));
    if (!c) return 0;
    if (!c.light) return c.lightConst;
    return c.light[idx(x - cx * CS, y - cy * CS, z - cz * CS)];
  }

  // ── the sky's reach: per column, the highest cell that stops it ──
  floorAt(x, z) {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    let f = this.floors.get(ckey(cx, cz));
    if (!f) f = this.scanColumn(cx, cz);
    return f[(x - cx * CS) + (z - cz * CS) * CS];
  }

  // Is the sky open above this point? (The game darkens the background by it, not by depth alone.)
  underSky(x, y, z) {
    return !this.gen.sky || y > this.floorAt(Math.floor(x), Math.floor(z));
  }

  scanColumn(cx, cz) {
    const f = new Int32Array(256);
    const top = this.gen.heightRange(cx * CS - 3, cz * CS - 3, CS + 5)[1] + 2;
    let cy = Math.floor(top / CS);
    const stop = cy - 16; // 256 blocks: a deeper open shaft than that is lit no further
    f.fill(stop * CS - 1);
    let left = 256;
    const done = new Uint8Array(256);
    for (; cy > stop && left; cy--) {
      const d = this.data(cx, cy, cz).data;
      for (let col = 0; col < 256; col++) {
        if (done[col]) continue;
        for (let y = CS - 1; y >= 0; y--)
          if (stopsSky[d[col + y * CS * CS]]) {
            f[col] = cy * CS + y;
            done[col] = 1;
            left--;
            break;
          }
      }
    }
    if (this.floors.size > 4000) this.floors.clear();
    this.floors.set(ckey(cx, cz), f);
    return f;
  }

  // After an edit: has the sky's floor moved in this column? Returns [from, to] when it has.
  refloor(x, y, z, id, old) {
    if (!this.gen.sky) return null;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const f = this.floors.get(ckey(cx, cz));
    if (!f) return null;
    const i = (x - cx * CS) + (z - cz * CS) * CS;
    const was = f[i];
    if (stopsSky[id] && y > was) f[i] = y;
    else if (!stopsSky[id] && stopsSky[old] && y === was) {
      let yy = y - 1;
      while (yy > y - 256 && !stopsSky[this.get(x, yy, z)]) yy--;
      f[i] = yy;
    }
    return f[i] !== was ? [was, f[i]] : null;
  }

  // Many cells at once, for the drives' test rigs (round 7): written straight into the chunks, not kept as edits, the
  // sky's floors of the columns forgotten and every chunk the light could reach marked to rebuild. box: [x0, y0, z0,
  // x1, y1, z1], filled with id; then each of holes ([x0, y0, z0, x1, y1, z1, id]) on top.
  fill(box, id, holes = []) {
    const touched = new Set();
    const put = (x, y, z, v) => {
      const cx = Math.floor(x / CS), cy = Math.floor(y / CS), cz = Math.floor(z / CS);
      const c = this.data(cx, cy, cz);
      const i = idx(x - cx * CS, y - cy * CS, z - cz * CS);
      if (emits[c.data[i]]) c.emitters--;
      if (emits[v]) c.emitters++;
      c.data[i] = v;
      touched.add(c.k);
      this.floors.delete(ckey(cx, cz));
    };
    for (const [x0, y0, z0, x1, y1, z1, v] of [[...box, id], ...holes])
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(x, y, z, v);
    const [bx0, by0, bz0, bx1, by1, bz1] = box;
    for (let X = Math.floor((bx0 - M) / CS); X <= Math.floor((bx1 + M) / CS); X++)
      for (let Y = Math.floor((by0 - M - 64) / CS); Y <= Math.floor((by1 + M) / CS); Y++)
        for (let Z = Math.floor((bz0 - M) / CS); Z <= Math.floor((bz1 + M) / CS); Z++) {
          const n = this.chunks.get(key(X, Y, Z));
          if (n) n.dirty = true;
        }
    return touched.size;
  }

  set(x, y, z, id, { persist = true } = {}) {
    const cx = Math.floor(x / CS), cy = Math.floor(y / CS), cz = Math.floor(z / CS);
    const c = this.data(cx, cy, cz);
    const i = idx(x - cx * CS, y - cy * CS, z - cz * CS);
    const old = c.data[i];
    if (old === id) return;
    c.data[i] = id;
    if (emits[old]) c.emitters--;
    if (emits[id]) c.emitters++;
    if (persist) {
      let ed = this.edits.get(c.k);
      if (!ed) this.edits.set(c.k, (ed = new Map()));
      ed.set(i, id);
    }
    // Which meshes this touches: always its own and the neighbours it borders; every chunk in the light's reach
    // when the light could change (an emitter came or went, something opened or closed beside a lit cell); and
    // the whole column under it when the sky now reaches further down, or less far.
    const lit = emits[old] || emits[id] || ((isOpaque[old] !== isOpaque[id] || filters[old] !== filters[id]) && this.litAround(x, y, z));
    const r = lit ? M : 1;
    let y0 = y - r, y1 = y + r;
    const moved = this.refloor(x, y, z, id, old);
    if (moved) {
      y0 = Math.min(y0, Math.min(...moved) - M);
      y1 = Math.max(y1, Math.max(...moved) + M);
    }
    const rr = lit || moved ? M : 1;
    for (let X = Math.floor((x - rr) / CS); X <= Math.floor((x + rr) / CS); X++)
      for (let Y = Math.floor(y0 / CS); Y <= Math.floor(y1 / CS); Y++)
        for (let Z = Math.floor((z - rr) / CS); Z <= Math.floor((z + rr) / CS); Z++) {
          const n = this.chunks.get(key(X, Y, Z));
          if (n) n.dirty = true;
        }
    // Rebuild now, on the frame of the dig: this chunk, and any chunk sharing the face the cell sits on (or a hole
    // would show for a frame or two at a chunk's edge).
    this.mesh(c);
    const lx = x - cx * CS, ly = y - cy * CS, lz = z - cz * CS;
    for (const [dx, dy, dz, edge] of [[-1, 0, 0, lx === 0], [1, 0, 0, lx === CS - 1], [0, -1, 0, ly === 0], [0, 1, 0, ly === CS - 1], [0, 0, -1, lz === 0], [0, 0, 1, lz === CS - 1]]) {
      if (!edge) continue;
      const n = this.chunks.get(key(cx + dx, cy + dy, cz + dz));
      if (n && (n.mesh || n.wmesh || this.wanted.has(n.k))) this.mesh(n);
    }
    this.onEdit?.(x, y, z, id, old);
  }

  // Many cells at once (an explosion, a drill): the data and the edits for each, then every touched mesh marked and
  // the ones holding the cells rebuilt once, not once a cell.
  setMany(cells, { persist = true } = {}) {
    const touched = new Map();
    let lit = false;
    let lo = Infinity, hi = -Infinity;
    for (const [x, y, z, id] of cells) {
      const cx = Math.floor(x / CS), cy = Math.floor(y / CS), cz = Math.floor(z / CS);
      const c = this.data(cx, cy, cz);
      const i = idx(x - cx * CS, y - cy * CS, z - cz * CS);
      const old = c.data[i];
      if (old === id) continue;
      c.data[i] = id;
      if (emits[old]) c.emitters--;
      if (emits[id]) c.emitters++;
      if (persist) {
        let ed = this.edits.get(c.k);
        if (!ed) this.edits.set(c.k, (ed = new Map()));
        ed.set(i, id);
      }
      lit ||= !!(emits[old] || emits[id] || isOpaque[old] !== isOpaque[id]);
      const moved = this.refloor(x, y, z, id, old);
      lo = Math.min(lo, y, ...(moved ?? []));
      hi = Math.max(hi, y, ...(moved ?? []));
      touched.set(c.k, c);
    }
    if (!touched.size) return;
    const r = lit ? M : 1;
    const xs = cells.map((c) => c[0]), zs = cells.map((c) => c[2]);
    const [x0, x1, z0, z1] = [Math.min(...xs) - r, Math.max(...xs) + r, Math.min(...zs) - r, Math.max(...zs) + r];
    for (let X = Math.floor(x0 / CS); X <= Math.floor(x1 / CS); X++)
      for (let Y = Math.floor((lo - r) / CS); Y <= Math.floor((hi + r) / CS); Y++)
        for (let Z = Math.floor(z0 / CS); Z <= Math.floor(z1 / CS); Z++) {
          const n = this.chunks.get(key(X, Y, Z));
          if (!n) continue;
          n.dirty = true;
          // The chunks holding the cells, and their face neighbours, now; the light's further reach on later frames.
          if (touched.has(n.k) || [...touched.values()].some((c) => Math.abs(c.cx - X) + Math.abs(c.cy - Y) + Math.abs(c.cz - Z) === 1)) {
            if (n.mesh || n.wmesh || this.wanted.has(n.k)) this.mesh(n);
          }
        }
  }

  litAround(x, y, z) {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]])
      if (this.lightAt(x + dx, y + dy, z + dz) > 1) return true;
    return false;
  }

  solid(x, y, z) {
    return BLOCKS[this.get(Math.floor(x), Math.floor(y), Math.floor(z))].solid;
  }

  // ── streaming ──
  // The chunk rows holding the ground in a column (from the generator's heights, trees and buildings included).
  surfaceRows(cx, cz) {
    const k = ckey(cx, cz);
    let s = this.surface.get(k);
    if (!s) {
      const [lo, hi] = this.gen.heightRange(cx * CS, cz * CS, CS - 1);
      s = lo < -900 ? null : [Math.floor(lo / CS), Math.floor(hi / CS)];
      if (this.surface.size > 4000) this.surface.clear();
      this.surface.set(k, s);
    }
    return s;
  }

  // Which chunks to have meshes for: every column within the radius (by true distance, in blocks), from the
  // player's height ±vradius chunks, and — whenever the player is near or above the ground — from the bottom of
  // that column's ground to its top, so standing on a hill or a tower never shows the sky through missing land.
  plan(pos, look) {
    const R = this.radius * CS;
    const pcx = Math.floor(pos.x / CS), pcy = Math.floor(pos.y / CS), pcz = Math.floor(pos.z / CS);
    const V = this.vradius;
    const mine = this.surfaceRows(pcx, pcz);
    const nearGround = mine && pcy >= mine[0] - 1;
    const want = [];
    const wanted = new Set();
    const rows = new Map();
    const span = this.radius + 1;
    for (let cx = pcx - span; cx <= pcx + span; cx++)
      for (let cz = pcz - span; cz <= pcz + span; cz++) {
        const dx = Math.max(cx * CS - pos.x, 0, pos.x - (cx + 1) * CS);
        const dz = Math.max(cz * CS - pos.z, 0, pos.z - (cz + 1) * CS);
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        let lo = pcy - V, hi = pcy + V;
        const s = nearGround && this.surfaceRows(cx, cz);
        if (s) {
          lo = Math.min(lo, s[0]);
          hi = Math.max(hi, s[1]);
        }
        rows.set(ckey(cx, cz), [lo, hi]);
        // Nearest first; what is behind the player waits a little.
        const mx = (cx + 0.5) * CS - pos.x, mz = (cz + 0.5) * CS - pos.z;
        const behind = look && mx * look.x + mz * look.z < -CS ? 1.6 : 1;
        for (let cy = lo; cy <= hi; cy++) {
          const dy = Math.max(cy * CS - pos.y, 0, pos.y - (cy + 1) * CS);
          want.push([cx, cy, cz, (d2 + dy * dy * 1.5) * behind]);
          wanted.add(key(cx, cy, cz));
        }
      }
    want.sort((a, b) => a[3] - b[3]);
    this.queue = want;
    this.wanted = wanted;
    this.plannedAt = pos.clone();
    // Drop the meshes no longer wanted, and the data well out of reach (the edits keep what the player changed).
    for (const [k, c] of this.chunks) {
      if (!wanted.has(k) && (c.mesh || c.wmesh)) {
        this.drop(c);
        c.dirty = true;
      }
      const r = rows.get(ckey(c.cx, c.cz));
      const far = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > span + 2;
      if (far || (!r && Math.abs(c.cy - pcy) > V + 3) || (r && (c.cy < r[0] - 3 || c.cy > r[1] + 3))) this.chunks.delete(k);
    }
  }

  update(pos, budgetMs = 6, look = null) {
    if (!this.plannedAt || this.plannedAt.distanceToSquared(pos) > 16 || Math.floor(this.plannedAt.y / CS) !== Math.floor(pos.y / CS)) this.plan(pos, look);
    const t0 = performance.now();
    let built = 0;
    for (const [cx, cy, cz] of this.queue) {
      const c = this.data(cx, cy, cz);
      if (!c.dirty) continue;
      const t = performance.now();
      this.mesh(c);
      this.stats.meshes++;
      this.stats.ms += performance.now() - t;
      built++;
      if (performance.now() - t0 > budgetMs) break;
    }
    return built;
  }

  pending() {
    // Nothing asked for yet (or a plan thrown away by a jump) is not the same as nothing left to build.
    if (!this.queue.length || !this.plannedAt) return Infinity;
    let n = 0;
    for (const [cx, cy, cz] of this.queue) if (this.data(cx, cy, cz).dirty) n++;
    return n;
  }

  // ── light + mesh ──
  fillRegion(c) {
    const { ids } = this.region;
    const ox = c.cx * CS - M, oy = c.cy * CS - M, oz = c.cz * CS - M;
    for (let X = -1; X <= 1; X++)
      for (let Y = -1; Y <= 1; Y++)
        for (let Z = -1; Z <= 1; Z++) {
          const n = this.data(c.cx + X, c.cy + Y, c.cz + Z).data;
          const bx = (c.cx + X) * CS, by = (c.cy + Y) * CS, bz = (c.cz + Z) * CS;
          const x0 = Math.max(0, ox - bx), x1 = Math.min(CS, ox + S - bx);
          const y0 = Math.max(0, oy - by), y1 = Math.min(CS, oy + S - by);
          const z0 = Math.max(0, oz - bz), z1 = Math.min(CS, oz + S - bz);
          for (let y = y0; y < y1; y++)
            for (let z = z0; z < z1; z++) {
              const r = (bx + x0 - ox) + (bz + z - oz) * S + (by + y - oy) * S2;
              const s = x0 + z * CS + y * CS * CS;
              for (let x = 0; x < x1 - x0; x++) ids[r + x] = n[s + x];
            }
        }
  }

  // What light can reach this chunk's region: block light from emitters near it, and the sky — everywhere
  // ('all', the region is above every floor), nowhere ('none'), or in places ('some').
  lightKind(c) {
    let emitters = 0;
    for (let X = -1; X <= 1; X++)
      for (let Y = -1; Y <= 1; Y++)
        for (let Z = -1; Z <= 1; Z++) emitters += this.data(c.cx + X, c.cy + Y, c.cz + Z).emitters;
    let sky = 'none';
    if (this.gen.sky) {
      const { floors } = this.region;
      const ox = c.cx * CS - M, oy = c.cy * CS - M, oz = c.cz * CS - M;
      let lo = Infinity, hi = -Infinity;
      for (let Z = -1; Z <= 1; Z++)
        for (let X = -1; X <= 1; X++) {
          const fx = c.cx + X, fz = c.cz + Z;
          const f = this.floors.get(ckey(fx, fz)) ?? this.scanColumn(fx, fz);
          const x0 = Math.max(0, ox - fx * CS), x1 = Math.min(CS, ox + S - fx * CS);
          const z0 = Math.max(0, oz - fz * CS), z1 = Math.min(CS, oz + S - fz * CS);
          for (let z = z0; z < z1; z++)
            for (let x = x0; x < x1; x++) {
              const v = f[x + z * CS];
              floors[(fx * CS + x - ox) + (fz * CS + z - oz) * S] = v;
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
        }
      if (oy > hi) sky = 'all';
      else if (oy + S - 1 > lo) sky = 'some';
    }
    return { emitters, sky };
  }

  flood(kind) {
    const { ids, sky, blk, q, floors } = this.region;
    const spread = (light, head, tail) => {
      while (head < tail) {
        const i = q[head++];
        const l = light[i] - 1;
        if (l <= 0) continue;
        const x = i % S, z = ((i / S) | 0) % S, y = (i / S2) | 0;
        if (x > 0) tail = go(light, i - 1, l, tail);
        if (x < S - 1) tail = go(light, i + 1, l, tail);
        if (z > 0) tail = go(light, i - S, l, tail);
        if (z < S - 1) tail = go(light, i + S, l, tail);
        if (y > 0) tail = go(light, i - S2, l, tail);
        if (y < S - 1) tail = go(light, i + S2, l, tail);
      }
    };
    const go = (light, n, l, tail) => {
      const id = ids[n];
      if (isOpaque[id]) return tail;
      const v = l - filters[id];
      if (light[n] >= v) return tail;
      light[n] = v;
      q[tail++] = n;
      return tail;
    };
    // The sky: full strength straight down to each column's floor, then spreading sideways and on down.
    if (kind.sky === 'all') sky.fill(15);
    else if (kind.sky === 'none') sky.fill(0);
    else {
      sky.fill(0);
      const oy = this.regionY;
      let tail = 0;
      for (let col = 0; col < S2; col++) {
        const from = Math.max(0, floors[col] + 1 - oy);
        if (from >= S) continue;
        // Only the edge of the lit air needs to spread: the bottom of the column, and the cells beside a column
        // whose sky stops higher up (above the highest of those floors, every neighbour is lit as well).
        let edge = from;
        const x = col % S;
        if (x > 0) edge = Math.max(edge, floors[col - 1] - oy);
        if (x < S - 1) edge = Math.max(edge, floors[col + 1] - oy);
        if (col >= S) edge = Math.max(edge, floors[col - S] - oy);
        if (col < S2 - S) edge = Math.max(edge, floors[col + S] - oy);
        edge = Math.min(edge, S - 1);
        for (let y = from, i = col + from * S2; y < S; y++, i += S2) {
          sky[i] = 15;
          if (y <= edge) q[tail++] = i;
        }
      }
      spread(sky, 0, tail);
    }
    blk.fill(0);
    if (kind.emitters) {
      let tail = 0;
      for (let i = 0; i < S2 * S; i++) {
        const l = emits[ids[i]];
        if (l) {
          blk[i] = l;
          q[tail++] = i;
        }
      }
      spread(blk, 0, tail);
    }
  }

  mesh(c) {
    c.dirty = false;
    // A chunk of nothing but air, or of solid rock with rock all round it, has no faces.
    let solidCount = 0, air = 0;
    for (let i = 0; i < c.data.length; i++) {
      if (isOpaque[c.data[i]]) solidCount++;
      else if (c.data[i] === B.AIR) air++;
    }
    const kind = this.lightKind(c);
    const empty = air === CS * CS * CS;
    if (empty || (solidCount === CS * CS * CS && this.sealed(c))) {
      this.drop(c);
      c.light = null;
      c.lightConst = empty && kind.sky === 'all' ? 15 : 0;
      if (empty && kind.sky !== 'all' && (kind.emitters || kind.sky === 'some')) {
        this.fillRegion(c);
        this.regionY = c.cy * CS - M;
        this.flood(kind);
        this.keepLight(c);
      }
      return;
    }
    this.fillRegion(c);
    this.regionY = c.cy * CS - M;
    this.flood(kind);
    this.keepLight(c);
    const { ids, sky, blk } = this.region;

    const sg = solidGeo, wg = waterGeo;
    sg.reset();
    wg.reset();
    const at = (x, y, z) => (x + M) + (z + M) * S + (y + M) * S2;
    for (let y = 0; y < CS; y++)
      for (let z = 0; z < CS; z++)
        for (let x = 0; x < CS; x++) {
          const i = at(x, y, z);
          const id = ids[i];
          if (!id) continue;
          const b = BLOCKS[id];
          if (b.shape === 'none') continue;
          if (b.shape === 'torch') {
            torch(sg, x, y, z, sky[i] / 15, b.facing);
            continue;
          }
          if (b.shape === 'cross') {
            cross(sg, x, y, z, b.tiles[0], sky[i] / 15, Math.max(blk[i], b.light) / 15);
            continue;
          }
          if (b.shape === 'slab') {
            slab(sg, x, y, z, b.tiles[0], sky[i] / 15, Math.max(blk[i], b.light) / 15);
            continue;
          }
          const liquid = b.shape === 'liquid';
          const g = id === B.WATER ? wg : sg;
          // A liquid's surface sits a little below the top of its block, unless more of it lies on top.
          const low = liquid && ids[i + S2] !== id && !isOpaque[ids[i + S2]];
          const tiles = tilesOf(id);
          for (const f of FACES) {
            const nid = ids[i + f.dn];
            if (isOpaque[nid] || (liquid && nid === id)) continue;
            const a = i + f.dn;
            const uvr = tileUV(tiles[f.t]);
            g.need(4, 6);
            const base = g.nv;
            let ao0 = 0, ao1 = 0, ao2 = 0, ao3 = 0;
            for (let k = 0; k < 4; k++) {
              const K = f.k[k];
              const o1 = isOpaque[ids[a + K.s1]], o2 = isOpaque[ids[a + K.s2]], o3 = isOpaque[ids[a + K.cc]];
              let ss = sky[a], sb = blk[a], n = 1;
              if (!o1) { ss += sky[a + K.s1]; sb += blk[a + K.s1]; n++; }
              if (!o2) { ss += sky[a + K.s2]; sb += blk[a + K.s2]; n++; }
              if (!o3 && !(o1 && o2)) { ss += sky[a + K.cc]; sb += blk[a + K.cc]; n++; }
              let ls = ss / n / 15, lb = sb / n / 15;
              if (b.light) lb = Math.max(lb, b.light / 15);
              const ao = o1 && o2 ? 0 : 3 - o1 - o2 - o3;
              if (k === 0) ao0 = ao; else if (k === 1) ao1 = ao; else if (k === 2) ao2 = ao; else ao3 = ao;
              const shade = f.s * (b.light || liquid ? 1 : AO[ao]);
              const py = y + (low && K.p[1] === 1 ? LIQUID_TOP : K.p[1]);
              g.vert(x + K.p[0], py, z + K.p[2], K.su < 0 ? uvr[0] : uvr[2], K.sv < 0 ? uvr[1] : uvr[3], ls, lb, shade);
            }
            // Flip the quad's diagonal when the occlusion is lopsided (no dark streak across the face).
            if (ao0 + ao2 > ao1 + ao3) g.quad(base, base + 1, base + 2, base + 3);
            else g.quad(base + 1, base + 2, base + 3, base);
          }
        }
    this.drop(c);
    const place = (geo, mat) => {
      if (!geo) return null;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(c.cx * CS, c.cy * CS, c.cz * CS);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.group.add(m);
      return m;
    };
    c.mesh = place(sg.build(), this.material);
    c.wmesh = place(wg.build(), this.waterMaterial);
  }

  keepLight(c) {
    const { sky, blk } = this.region;
    c.light = new Uint8Array(CS * CS * CS);
    for (let y = 0; y < CS; y++)
      for (let z = 0; z < CS; z++)
        for (let x = 0; x < CS; x++) {
          const r = (x + M) + (z + M) * S + (y + M) * S2;
          c.light[idx(x, y, z)] = Math.max(sky[r], blk[r]);
        }
  }

  // Solid rock whose six neighbours' touching layers are solid too: nothing of it can be seen.
  sealed(c) {
    const sides = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [dx, dy, dz] of sides) {
      const n = this.data(c.cx + dx, c.cy + dy, c.cz + dz).data;
      for (let a = 0; a < CS; a++)
        for (let b = 0; b < CS; b++) {
          const x = dx === 1 ? 0 : dx === -1 ? CS - 1 : a;
          const y = dy === 1 ? 0 : dy === -1 ? CS - 1 : dx ? a : b;
          const z = dz === 1 ? 0 : dz === -1 ? CS - 1 : b;
          if (!isOpaque[n[idx(x, y, z)]]) return false;
        }
    }
    return true;
  }

  drop(c) {
    for (const k of ['mesh', 'wmesh']) {
      if (!c[k]) continue;
      this.group.remove(c[k]);
      c[k].geometry.dispose();
      c[k] = null;
    }
  }

  dispose() {
    for (const c of this.chunks.values()) this.drop(c);
    this.group.parent?.remove(this.group);
    this.material.dispose();
    this.waterMaterial.dispose();
  }

  // ── ray cast (Amanatides & Woo): the first block that is not air, with the face it was entered through ──
  raycast(o, d, max = 6, hit = (id) => id !== B.AIR && id !== B.PORTAL && id !== B.WATER) {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
    let tmx = sx > 0 ? (x + 1 - o.x) * tdx : sx < 0 ? (o.x - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - o.y) * tdy : sy < 0 ? (o.y - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - o.z) * tdz : sz < 0 ? (o.z - z) * tdz : Infinity;
    let n = [0, 0, 0], t = 0;
    while (t <= max) {
      const id = this.get(x, y, z);
      if (hit(id)) return { x, y, z, id, n, t };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; n = [-sx, 0, 0]; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; n = [0, -sy, 0]; }
      else { z += sz; t = tmz; tmz += tdz; n = [0, 0, -sz]; }
    }
    return null;
  }

  editsList() {
    const out = [];
    for (const [k, ed] of this.edits) {
      const [cx, cy, cz] = k.split(',').map(Number);
      for (const [i, id] of ed) {
        const x = i % CS, z = Math.floor(i / CS) % CS, y = Math.floor(i / (CS * CS));
        out.push([cx * CS + x, cy * CS + y, cz * CS + z, id]);
      }
    }
    return out;
  }

  loadEdits(list) {
    for (const [x, y, z, id] of list ?? []) {
      const cx = Math.floor(x / CS), cy = Math.floor(y / CS), cz = Math.floor(z / CS);
      const k = key(cx, cy, cz);
      let ed = this.edits.get(k);
      if (!ed) this.edits.set(k, (ed = new Map()));
      ed.set(idx(x - cx * CS, y - cy * CS, z - cz * CS), id);
    }
  }
}

// A plant: two panes crossed corner to corner, each with both sides drawn.
function cross(g, x, y, z, tile, sky, blk) {
  const [u0, v0, u1, v1] = tileUV(tile);
  for (const [ax, az, bx, bz] of [[0.15, 0.15, 0.85, 0.85], [0.15, 0.85, 0.85, 0.15]])
    for (const flip of [false, true]) {
      g.need(4, 6);
      const b = g.nv;
      const [sx, sz, ex, ez] = flip ? [bx, bz, ax, az] : [ax, az, bx, bz];
      g.vert(x + sx, y, z + sz, u0, v0, sky, blk, 0.9);
      g.vert(x + ex, y, z + ez, u1, v0, sky, blk, 0.9);
      g.vert(x + ex, y + 0.9, z + ez, u1, v1, sky, blk, 0.9);
      g.vert(x + sx, y + 0.9, z + sz, u0, v1, sky, blk, 0.9);
      g.quad(b, b + 1, b + 2, b + 3);
    }
}

// A slab (round 7: the ship's seats): the lower half of a block, a little in from its sides, lit by its own cell,
// each face shaded as a block's are.
function slab(g, x, y, z, tile, sky, blk) {
  const [u0, v0, u1, v1] = tileUV(tile);
  const x0 = x + 0.06, x1 = x + 0.94, z0 = z + 0.06, z1 = z + 0.94, y0 = y, y1 = y + 0.5;
  const vh = v0 + (v1 - v0) * 0.5; // the sides take the tile's lower half
  const faces = [
    [[[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], 1, v1],
    [[[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], 0.5, v1],
    [[[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 0.6, vh],
    [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 0.6, vh],
    [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0.8, vh],
    [[[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0.8, vh]
  ];
  for (const [q, shade, top] of faces) {
    g.need(4, 6);
    const b = g.nv;
    g.vert(...q[0], u0, v0, sky, blk, shade);
    g.vert(...q[1], u1, v0, sky, blk, shade);
    g.vert(...q[2], u1, top, sky, blk, shade);
    g.vert(...q[3], u0, top, sky, blk, shade);
    g.quad(b, b + 1, b + 2, b + 3);
  }
}

// A torch: a stick of wood with the flame on top, cut from the torch tile, always bright. One on a wall leans out
// from it, its foot against the wall, as Minecraft's do.
function torch(g, x, y, z, sky, facing) {
  const from = g.nv;
  box(g, x + 0.4375, y, z + 0.4375, x + 0.5625, y + 0.625, z + 0.5625, tileSubUV('torch', 7, 6, 9, 16), sky);
  box(g, x + 0.4375, y + 0.625, z + 0.4375, x + 0.5625, y + 0.75, z + 0.5625, tileSubUV('torch', 7, 2, 9, 5), sky);
  if (!facing) return;
  for (let v = from; v < g.nv; v++) {
    const up = (g.pos[v * 3 + 1] - y) / 0.75;
    const back = 0.36 - 0.26 * up;
    g.pos[v * 3] -= facing[0] * back;
    g.pos[v * 3 + 1] += 0.2;
    g.pos[v * 3 + 2] -= facing[2] * back;
  }
}
function box(g, x0, y0, z0, x1, y1, z1, [u0, v0, u1, v1], sky) {
  const quads = [
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
    [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]
  ];
  for (const q of quads) {
    g.need(4, 6);
    const b = g.nv;
    g.vert(...q[0], u0, v0, sky, 1, 1);
    g.vert(...q[1], u1, v0, sky, 1, 1);
    g.vert(...q[2], u1, v1, sky, 1, 1);
    g.vert(...q[3], u0, v1, sky, 1, 1);
    g.quad(b, b + 1, b + 2, b + 3);
  }
}
