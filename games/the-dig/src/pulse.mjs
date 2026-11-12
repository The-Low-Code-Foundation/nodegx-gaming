// The pulse (round 7, DIG-003). The play-tester, 2026-11-03: "a HUD thing where you send out the wave and you see fuzzy
// coloured blobs in front of you where there's cavities … but only a fuzzy vague indicator."
//
// Hold the button about a second and let go: a ring goes out, and soft glows hang in the rock where it is hollow,
// near ones first, fading over about six seconds. Only in front of you (a cone about 100° wide, out to `reach`), plus
// a weak sphere all round so a cave under your feet still shows. No outlines, no labels; the farther a glow, the bigger
// and blurrier it is and the more it wanders from the true spot. Five colours: a plain hollow, water, lava, worked
// space (anything they built), and a chamber with one of your tasks in it (a slow violet pulse). Creatures never show.
//
// scan() is plain arithmetic over a get(x, y, z) and runs in Node too (tools/time-pulse.mjs measures it).
import * as THREE from 'three';
import { B, BLOCKS } from './blocks.mjs';

export const PULSE = {
  reach: 28, // the cone's length; tuning finds raise it later (DIG-007)
  near: 8, // the weak sphere all round
  cone: (50 * Math.PI) / 180, // half of the cone's width
  step: 2, // the sampling grid
  recharge: 12, // seconds before the next
  hold: 0.9, // seconds held before a let-go sends it
  fade: 6, // seconds a glow lasts
  speed: 26, // the ring, in blocks a second
  loud: 40 // the brute hears it this far off
};

export const KINDS = {
  hollow: { colour: 0x86acdf, label: 'hollow' },
  water: { colour: 0x3ad6c4, label: 'water' },
  lava: { colour: 0xd05a3c, label: 'lava' },
  built: { colour: 0xffc24a, label: 'worked' },
  task: { colour: 0xb98cff, label: 'your task' }
};

// Their blocks, and a site's: a hollow that touches one of these is worked space.
const BUILT = new Set([B.PLANKS, B.LOG, B.COBBLE, B.PILLAR, B.RUNE, B.FLOOR, B.LECTERN, B.FRAME, B.DORMANT, B.CRATE, B.CACHE, B.TORCH, B.WALL_TORCH_E, B.WALL_TORCH_W, B.WALL_TORCH_S, B.WALL_TORCH_N, B.METAL, B.METALFLOOR,
  // Their places (DIG-006/007): dressed stone and everything carved in it. Rubble and gravel are left out (rock does that).
  B.CARVED, B.CARVED_CRACKED, B.CARVED_DARK, B.MOSAIC, B.FRIEZE, B.TILE, B.TABLETS, B.LANTERN, B.BANNER, B.STATUE, B.STONE_DOOR, B.LAMP_NICHE, B.INSCRIBED, B.MURAL]);

// Sample the cone (and the sphere) on a grid, keep the open cells that are under rock, group them into blobs, and say
// what each blob is. Returns glows: one per 8-block patch of a blob (so a cavern shows its shape, fuzzily), each with
// its centre, its size (samples), its distance and its kind.
//   get(x, y, z): the block there.  hollow(x, y, z, id): may this open cell count (under rock, not the ship)?
//   task(x, y, z): is it inside a chamber with one of your tasks?
export function scan({ get, hollow, task }, eye, dir, opts = {}) {
  const t0 = performance.now();
  const { reach, near, cone } = { ...PULSE, ...opts };
  // A tuned pulse (DIG-007) reaches farther on a coarser grid, so it samples about as many cells as the first one (at
  // reach 40 on the 2-block grid it took 18 ms on the worst seed; the far glows are blurred anyway).
  const step = opts.step ?? Math.max(PULSE.step, Math.round((PULSE.step * reach) / PULSE.reach));
  const cosCone = Math.cos(cone);
  const R = Math.max(reach, near);
  // The sampled box as a dense grid (typed arrays, number keys: string keys cost a cavern 9 ms).
  const gx0 = Math.floor((eye.x - R) / step) * step, gy0 = Math.floor((eye.y - R) / step) * step, gz0 = Math.floor((eye.z - R) / step) * step;
  const N = Math.ceil((2 * R) / step) + 2, NN = N * N;
  const sort = new Int8Array(N * NN); // 0 not open, 1 air, 2 water, 3 lava
  const dist = new Float32Array(N * NN);
  const cells = [];
  let samples = 0;
  for (let iy = 0; iy < N; iy++)
    for (let iz = 0; iz < N; iz++)
      for (let ix = 0; ix < N; ix++) {
        const x = gx0 + ix * step, y = gy0 + iy * step, z = gz0 + iz * step;
        const vx = x + 0.5 - eye.x, vy = y + 0.5 - eye.y, vz = z + 0.5 - eye.z;
        const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (d < 2.5 || d > R) continue; // (your own few blocks are not news)
        if (d > near && (d > reach || (vx * dir.x + vy * dir.y + vz * dir.z) / d < cosCone)) continue;
        samples++;
        const id = get(x, y, z);
        if (BLOCKS[id]?.solid || !hollow(x, y, z, id)) continue;
        const i = ix + iz * N + iy * NN;
        sort[i] = id === B.WATER ? 2 : id === B.LAVA ? 3 : 1;
        dist[i] = d;
        cells.push(i);
      }
  // Blobs: cells of the same sort touching on the grid, corners included.
  const blobOf = new Int32Array(N * NN).fill(-1);
  const glows = [];
  const NB = [];
  for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) NB.push([dx, dy, dz]);
  let blobs = 0;
  for (const start of cells) {
    if (blobOf[start] >= 0) continue;
    const kindOf = sort[start];
    const blob = [];
    const q = [start];
    blobOf[start] = blobs;
    while (q.length) {
      const i = q.pop();
      blob.push(i);
      const ix = i % N, iz = Math.floor(i / N) % N, iy = Math.floor(i / NN);
      for (const [dx, dy, dz] of NB) {
        const jx = ix + dx, jy = iy + dy, jz = iz + dz;
        if (jx < 0 || jy < 0 || jz < 0 || jx >= N || jy >= N || jz >= N) continue;
        const j = jx + jz * N + jy * NN;
        if (sort[j] !== kindOf || blobOf[j] >= 0) continue;
        blobOf[j] = blobs;
        q.push(j);
      }
    }
    blobs++;
    // The hollow you are standing in is not news (and in a cavern it would wash over the whole view): leave it out.
    if (blob.some((i) => dist[i] < 4.5)) continue;
    const at = (i) => [gx0 + (i % N) * step, gy0 + Math.floor(i / NN) * step, gz0 + (Math.floor(i / N) % N) * step];
    // What it is: a liquid by its own cells; air by what borders it (a task's chamber, then worked stone).
    let kind = kindOf === 2 ? 'water' : kindOf === 3 ? 'lava' : 'hollow';
    if (kindOf === 1) {
      const probe = blob.length <= 24 ? blob : blob.filter((_, k) => k % Math.ceil(blob.length / 24) === 0);
      if (probe.some((i) => task(...at(i)))) kind = 'task';
      else if (probe.some((i) => {
        const [x, y, z] = at(i);
        return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [2, 0, 0], [-2, 0, 0], [0, -2, 0], [0, 0, 2], [0, 0, -2]].some(([dx, dy, dz]) => BUILT.has(get(x + dx, y + dy, z + dz)));
      })) kind = 'built';
    }
    // One glow per 8-block patch of the blob, at the patch's middle.
    const patches = new Map();
    for (const i of blob) {
      const [x, y, z] = at(i);
      const pk = (Math.floor(x / 8) + 4096) * 67108864 + (Math.floor(y / 8) + 4096) * 8192 + (Math.floor(z / 8) + 4096);
      let p = patches.get(pk);
      if (!p) patches.set(pk, (p = { x: 0, y: 0, z: 0, n: 0, d: Infinity }));
      p.x += x + 0.5;
      p.y += y + 0.5;
      p.z += z + 0.5;
      p.n++;
      p.d = Math.min(p.d, dist[i]);
    }
    for (const p of patches.values()) glows.push({ x: p.x / p.n, y: p.y / p.n, z: p.z / p.n, n: p.n, d: p.d, kind });
  }
  glows.sort((a, b) => a.d - b.d);
  return { glows: glows.slice(0, 90), samples, open: cells.length, blobs, ms: performance.now() - t0 };
}

// ── drawing them: soft additive sprites over the rock (no depth test), each fading in when the ring reaches it ──
let glowTex = null;
function texture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export class Glows {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.renderOrder = 20;
    scene.add(this.group);
    this.live = []; // { g (the glow), sprites, t0, x, y, z }
  }
  // A new pulse: replace what is showing. now in seconds.
  show(glows, now, eye) {
    this.clear();
    for (const g of glows) {
      const k = KINDS[g.kind];
      // The farther, the bigger, the blurrier, and the further it wanders from the true spot.
      const wander = 0.6 + g.d * 0.09;
      const size = (1.4 + Math.cbrt(g.n) * 1.5) * (1 + g.d / 22);
      const seed = Math.sin(g.x * 12.9898 + g.y * 78.233 + g.z * 37.719) * 43758.5453;
      const r = (i) => ((Math.sin(seed + i * 17.13) * 43758.5453) % 1 + 1) % 1 - 0.5;
      const at = new THREE.Vector3(g.x + r(1) * wander, g.y + r(2) * wander * 0.6, g.z + r(3) * wander);
      const sprites = [];
      // A few overlapping blobs, not one disc: fuzzier.
      const parts = g.n > 6 ? 3 : 2;
      for (let i = 0; i < parts; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(), color: k.colour, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        sp.position.set(at.x + r(4 + i) * size * 0.35, at.y + r(7 + i) * size * 0.25, at.z + r(10 + i) * size * 0.35);
        sp.scale.setScalar(size * (i ? 0.7 : 1));
        sp.renderOrder = 20;
        this.group.add(sp);
        sprites.push(sp);
      }
      this.live.push({ g, sprites, t0: now + g.d / PULSE.speed, at, phase: r(13) * 6 });
    }
  }
  // Each frame: fade in when the ring gets there, hold, fade out; drift a little; a task's chamber breathes.
  update(now) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i];
      const t = now - l.t0;
      if (t > PULSE.fade) {
        for (const sp of l.sprites) (this.group.remove(sp), sp.material.dispose());
        this.live.splice(i, 1);
        continue;
      }
      let a = t < 0 ? 0 : t < 0.25 ? t / 0.25 : t > PULSE.fade - 2 ? (PULSE.fade - t) / 2 : 1;
      if (l.g.kind === 'task') a *= 0.65 + 0.35 * Math.sin(now * 2.2 + l.phase);
      // Kept dim enough that overlapping glows add up to their colour, not to white.
      const base = 0.34 + Math.min(0.22, Math.cbrt(l.g.n) * 0.05);
      l.sprites.forEach((sp, j) => {
        sp.material.opacity = a * base * (j ? 0.6 : 1);
        sp.position.y += Math.sin(now * 0.7 + l.phase + j) * 0.002;
      });
    }
  }
  clear() {
    for (const l of this.live) for (const sp of l.sprites) (this.group.remove(sp), sp.material.dispose());
    this.live = [];
  }
  // The glow nearest the crosshair, within `cone` radians of it, and showing (for pinning).
  aimed(eye, dir, cone = 0.09) {
    let best = null;
    for (const l of this.live) {
      if (l.sprites[0].material.opacity < 0.05) continue;
      const v = l.at.clone().sub(eye);
      const ang = v.angleTo(dir);
      if (ang < cone && (!best || ang < best.ang)) best = { ang, at: l.at.clone(), kind: l.g.kind, d: v.length() };
    }
    return best;
  }
  // For the drives: what is showing.
  list() {
    // x, y, z: where its brightest sprite is drawn; tx, ty, tz: the hollow's true middle.
    return this.live.map((l) => {
      const p = l.sprites[0].position;
      return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), tx: +l.g.x.toFixed(1), ty: +l.g.y.toFixed(1), tz: +l.g.z.toFixed(1), kind: l.g.kind, d: +l.g.d.toFixed(1), n: l.g.n, on: +l.sprites[0].material.opacity.toFixed(2) };
    });
  }
}
