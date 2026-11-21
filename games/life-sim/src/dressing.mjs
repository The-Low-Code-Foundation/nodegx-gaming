// The set dressing (round 11). The brief, 2026-10-29: "please add some more detail and realism and graphical quality to
// anywhere you can see that it's needed for the next playtest to be as polished as possible". Round 10's shots showed
// realistic people in places of flat colour: a plain floor, bare walls, no windows, a green nothing outside, a sky of one
// colour, a pond with no ducks to feed. Everything here is looked at, never used: no Sim walks round it or clicks it, so
// nothing in it is on the walk grid (world.mjs), and the game's rules don't change.
//
// What it makes: painted textures (wood, tiles, carpet, grass, gravel, paving, water); a sky that follows the clock, with
// stars at night; things on the walls (windows with a view, curtains, pictures, a clock that tells the game's time, a
// mirror, a towel, kitchen tiles and cupboards, a whiteboard and posters at the office), which drop with their wall; a
// garden and a street round the flat; ducks on the pond that come over when someone feeds them.
//
// Cheap for a low-end tablet (Intel HD 615): every texture is painted once on a canvas and shared; things repeated
// (hedges, stones, ducks) are instanced; the sky is one sphere drawn behind everything.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DOM = typeof document !== 'undefined';

// A seeded random, so the textures and the garden are the same every load (and on the tablet).
export function rand(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- textures, painted once on a canvas ----
const painted = new Map();
function canvasTexture(key, w, h, paint, { colour = true, repeat = true } = {}) {
  if (!painted.has(key)) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d'), w, h, rand(key.length * 7919 + w));
    const t = new THREE.CanvasTexture(c);
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    painted.set(key, t);
  }
  return painted.get(key);
}
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// Wooden boards, eight across, joints staggered, a grain in each.
function planks(g, S, _h, r) {
  const rows = 8, rh = S / rows;
  for (let row = 0; row < rows; row++) {
    let x = -r() * S;
    while (x < S) {
      const len = S * (0.35 + r() * 0.45);
      const l = 52 + r() * 12, hue = 30 + r() * 6;
      for (const dx of [0, S, -S]) {
        const px = x + dx;
        if (px > S || px + len < 0) continue;
        g.fillStyle = hsl(hue, 42, l);
        g.fillRect(px, row * rh, len, rh);
        // The grain: thin wavy lines along the board.
        for (let k = 0; k < 7; k++) {
          const y0 = row * rh + 3 + r() * (rh - 6);
          g.strokeStyle = hsl(hue - 4, 40, l - 10 - r() * 8, 0.35);
          g.lineWidth = 0.6 + r();
          g.beginPath();
          g.moveTo(px, y0);
          for (let s = 0; s <= len; s += 16) g.lineTo(px + s, y0 + Math.sin(s / 30 + k) * 1.4);
          g.stroke();
        }
        // A knot, now and then.
        if (r() < 0.25) {
          g.fillStyle = hsl(hue - 6, 45, l - 18, 0.5);
          g.beginPath(), g.ellipse(px + r() * len, row * rh + rh / 2, 5 + r() * 4, 2.5, 0, 0, Math.PI * 2), g.fill();
        }
        g.fillStyle = 'rgba(40,24,12,0.55)';
        g.fillRect(px, row * rh, 1.5, rh);
      }
      x += len;
    }
    g.fillStyle = 'rgba(40,24,12,0.6)';
    g.fillRect(0, row * rh, S, 1.5);
  }
}

// Square tiles in grout, each a shade apart, with a soft shine.
const tiles = (base, grout, n, spread = 4) => (g, S, _h, r) => {
  g.fillStyle = grout;
  g.fillRect(0, 0, S, S);
  const t = S / n, [h, s, l] = base;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      g.fillStyle = hsl(h, s, l + (r() - 0.5) * spread);
      g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      const shine = g.createLinearGradient(i * t, j * t, i * t + t, j * t + t);
      shine.addColorStop(0, 'rgba(255,255,255,0.12)');
      shine.addColorStop(1, 'rgba(0,0,0,0.05)');
      g.fillStyle = shine;
      g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
    }
};
// Wall tiles, laid like bricks (the kitchen's, the bathroom's).
const metro = (base) => (g, S, _h, r) => {
  g.fillStyle = '#c9c4ba';
  g.fillRect(0, 0, S, S);
  const rows = 8, th = S / rows, tw = S / 4, [h, s, l] = base;
  for (let row = 0; row < rows; row++)
    for (let k = -1; k < 5; k++) {
      const x = k * tw + (row % 2) * (tw / 2);
      g.fillStyle = hsl(h, s, l + (r() - 0.5) * 3);
      g.fillRect(x + 2, row * th + 2, tw - 4, th - 4);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x + 4, row * th + 4, tw - 8, 3);
    }
};
// Speckle: many small dots of colours near the base (carpet, gravel, asphalt).
function speckle(g, S, r, colours, n, size) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colours[Math.floor(r() * colours.length)];
    const s = size * (0.5 + r());
    g.fillRect(r() * S, r() * S, s, s);
  }
}
// Office carpet tiles: four to the texture, the pile of each turned a quarter, so they show.
function carpet(g, S, _h, r) {
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#5d6b78' : '#56636f';
      g.fillRect((i * S) / 2, (j * S) / 2, S / 2, S / 2);
    }
  speckle(g, S, r, ['#6c7a88', '#4a5560', '#7a8794', '#505c68'], 9000, 1.6);
  g.fillStyle = 'rgba(30,36,42,0.35)';
  g.fillRect(0, 0, S, 1), g.fillRect(0, S / 2, S, 1), g.fillRect(0, 0, 1, S), g.fillRect(S / 2, 0, 1, S);
}
// Lawn: blades in many greens, darker and lighter patches, a daisy here and there.
function grass(g, S, _h, r) {
  g.fillStyle = '#6f9a4f';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(60,96,40,0.18)' : 'rgba(150,180,90,0.14)';
    const x = r() * S, y = r() * S, rad = 30 + r() * 70;
    for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) g.beginPath(), g.arc(x + dx, y + dy, rad, 0, Math.PI * 2), g.fill();
  }
  for (let i = 0; i < 7000; i++) {
    const x = r() * S, y = r() * S, len = 3 + r() * 6;
    g.strokeStyle = hsl(85 + r() * 25, 35 + r() * 25, 26 + r() * 22, 0.8);
    g.lineWidth = 1;
    g.beginPath(), g.moveTo(x, y), g.lineTo(x + (r() - 0.5) * 3, y - len), g.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const x = r() * S, y = r() * S;
    g.fillStyle = '#fbfbf2';
    for (let k = 0; k < 5; k++) g.beginPath(), g.arc(x + Math.cos(k * 1.26) * 2.2, y + Math.sin(k * 1.26) * 2.2, 1.4, 0, Math.PI * 2), g.fill();
    g.fillStyle = '#f2c43a';
    g.beginPath(), g.arc(x, y, 1.2, 0, Math.PI * 2), g.fill();
  }
}
function gravel(g, S, _h, r) {
  g.fillStyle = '#cdb894';
  g.fillRect(0, 0, S, S);
  speckle(g, S, r, ['#b9a37c', '#ddc9a4', '#a8916c', '#e8d9bc', '#9c8a6a'], 12000, 2.2);
}
function asphalt(g, S, _h, r) {
  g.fillStyle = '#4a4c50';
  g.fillRect(0, 0, S, S);
  speckle(g, S, r, ['#55575c', '#3f4145', '#5e6065', '#38393c'], 14000, 1.8);
}
// Paving slabs in rows of different lengths.
const paving = (base) => (g, S, _h, r) => {
  g.fillStyle = '#8d877c';
  g.fillRect(0, 0, S, S);
  const rows = 4, rh = S / rows, [h, s, l] = base;
  for (let row = 0; row < rows; row++) {
    let x = -r() * 60;
    while (x < S) {
      const len = rh * (0.9 + r() * 0.8);
      for (const dx of [0, S]) {
        g.fillStyle = hsl(h, s, l + (r() - 0.5) * 8);
        g.fillRect(x + dx - S + 2, row * rh + 2, len - 4, rh - 4);
        g.fillRect(x + dx + 2, row * rh + 2, len - 4, rh - 4);
      }
      x += len;
    }
  }
  speckle(g, S, r, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.07)'], 5000, 2);
};

// A material with a painted texture repeating every `metres`, for a floor `w` × `d`.
function surface(key, size, paint, w, d, metres, extra = {}) {
  const map = canvasTexture(key, size, size, paint).clone();
  map.repeat.set(w / metres, d / metres);
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.85, ...extra });
}
export function floor(kind, w, d) {
  if (!DOM) return new THREE.MeshStandardMaterial({ color: 0xc9a77c });
  switch (kind) {
    case 'wood': return surface('wood', 512, planks, w, d, 1.2, { roughness: 0.55 });
    case 'kitchen': return surface('kitchen', 512, tiles([38, 18, 78], '#a8a196', 4), w, d, 1.2, { roughness: 0.35 });
    case 'bathroom': return surface('bathroom', 512, tiles([195, 30, 82], '#9fb0b8', 6), w, d, 0.9, { roughness: 0.3 });
    case 'carpet': return surface('carpet', 512, carpet, w, d, 1.0, { roughness: 1 });
    case 'grass': return surface('grass', 512, grass, w, d, 3.0, { roughness: 1 });
    case 'gravel': return surface('gravel', 512, gravel, w, d, 2.0, { roughness: 1 });
    case 'paving': return surface('paving', 512, paving([40, 8, 68]), w, d, 2.0, { roughness: 0.9 });
    case 'asphalt': return surface('asphalt', 512, asphalt, w, d, 3.0, { roughness: 0.95 });
  }
}
// A flat piece of ground (y a few mm up, so pieces lie on each other in order without fighting).
export function ground(kind, w, d, x = 0, z = 0, y = 0, turn = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), floor(kind, w, d));
  m.position.set(x, y, z);
  m.rotation.y = turn;
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  return m;
}

// ---- the sky: one sphere drawn behind everything, coloured by the hour; stars at night ----
const SKY = [
  // [hour, top, horizon, stars, sun glow]
  [0, 0x070b1e, 0x18223e, 1, 0],
  [5, 0x0b1230, 0x26304f, 1, 0],
  [6.5, 0x41558f, 0xf0a670, 0.2, 0.8],
  [8, 0x4a86d0, 0xc8e0f0, 0, 0.6],
  [17, 0x4a86d0, 0xcfe2ee, 0, 0.6],
  [19.5, 0x3a4680, 0xf08a5a, 0.1, 1],
  [21, 0x0d1430, 0x2a2a52, 0.8, 0],
  [24, 0x070b1e, 0x18223e, 1, 0]
];
const ca = new THREE.Color(), cb = new THREE.Color();
export function skyAt(hour) {
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1][0] <= hour) i++;
  const [h0, t0, z0, s0, g0] = SKY[i], [h1, t1, z1, s1, g1] = SKY[i + 1];
  const k = THREE.MathUtils.smoothstep(hour, h0, h1);
  return {
    top: ca.set(t0).lerp(cb.set(t1), k).clone(),
    horizon: ca.set(z0).lerp(cb.set(z1), k).clone(),
    stars: s0 + (s1 - s0) * k,
    glow: g0 + (g1 - g0) * k
  };
}
export function makeSky() {
  const uniforms = {
    top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, below: { value: new THREE.Color() },
    stars: { value: 0 }, glow: { value: 0 }, sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    vertexShader: `varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 top, horizon, below; uniform float stars, glow; uniform vec3 sunDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.65, h), 0.7)) : mix(horizon, below, smoothstep(0.0, -0.15, h));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0, 0.82, 0.6) * (pow(s, 6.0) * 0.25 + pow(s, 600.0) * 2.0) * glow;
        if (stars > 0.0 && h > 0.02) {
          vec3 q = floor(d * 520.0);
          float st = step(0.9965, hash(q)) * (0.5 + 0.5 * hash(q + 7.0));
          c += vec3(st) * stars * smoothstep(0.02, 0.3, h);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return {
    mesh,
    uniforms,
    // Sets the colours for the hour; returns the horizon (the fog takes it, so the ground fades into the sky).
    update(hour, camera, sunDir) {
      const s = skyAt(hour);
      uniforms.top.value.copy(s.top);
      uniforms.horizon.value.copy(s.horizon);
      uniforms.below.value.copy(s.horizon).multiplyScalar(0.75);
      uniforms.stars.value = s.stars;
      uniforms.glow.value = s.glow;
      if (sunDir) uniforms.sunDir.value.copy(sunDir).normalize();
      mesh.position.copy(camera.position);
      return s;
    }
  };
}

// ---- what changes with time: the clocks' hands, the windows' light, the water, the ducks ----
// Each is { group (shown only while its place is), tick(dt, clock) }; the page calls `tick` every frame.
const ticking = [];
export function tick(dt, clock) {
  for (const t of ticking) if (!t.group || t.group.visible) t.tick(dt, clock);
}
// How light it is outside, 0 at night and 1 by day (the page's sun uses the same curve).
export const daylight = (hour) => THREE.MathUtils.clamp(Math.min(hour - 6, 21 - hour) / 2, 0, 1);

// Street lamps that glow after dark: a soft halo round each lamp's head and a pool of light under it (no real lights:
// one sprite and one disc each, faded in as the day goes).
export function lampGlow(group, heads) {
  if (!DOM || !heads.length) return;
  const halo = canvasTexture('halo', 64, 64, (c, S) => {
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,240,200,1)'), g.addColorStop(0.25, 'rgba(255,214,140,0.55)'), g.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = g, c.fillRect(0, 0, S, S);
  }, { repeat: false });
  const spriteMat = new THREE.SpriteMaterial({ map: halo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
  const poolMat = new THREE.MeshBasicMaterial({ map: halo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  const pool = new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2);
  for (const [x, y, z] of heads) {
    const s = new THREE.Sprite(spriteMat);
    s.position.set(x, y, z);
    s.scale.setScalar(1.6);
    const p = new THREE.Mesh(pool, poolMat);
    p.position.set(x, 0.02, z);
    group.add(s, p);
  }
  ticking.push({ group, tick: (_dt, c) => {
    const night = 1 - daylight(c.hour);
    spriteMat.opacity = night;
    poolMat.opacity = night * 0.35;
  } });
}

// ---- things on a wall: placed on the wall's inside face, dropped with the wall ----
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
const M = DOM
  ? {
      frame: mat(0xf4f1ea, { roughness: 0.5 }),
      darkFrame: mat(0x3b2a1e, { roughness: 0.6 }),
      sill: mat(0xe8e2d6, { roughness: 0.5 }),
      rail: mat(0x8a8d92, { metalness: 0.6, roughness: 0.35 }),
      chrome: mat(0xd8dde2, { metalness: 0.9, roughness: 0.15 }),
      mirror: mat(0xcfd8de, { metalness: 1, roughness: 0.04 }),
      cupboard: mat(0xf2efe8, { roughness: 0.45 }),
      worktop: mat(0x5a5048, { roughness: 0.3 }),
      handle: mat(0x6a6d72, { metalness: 0.7, roughness: 0.3 }),
      skirting: mat(0xf6f3ee, { roughness: 0.6 }),
      whiteboard: mat(0xfafafa, { roughness: 0.15 }),
      cork: mat(0xb88a5a, { roughness: 1 })
    }
  : {};
const boxMesh = (w, h, d, x, y, z, material) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
};
const planeMesh = (w, h, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
};

// Hangs `object` (its +Z the way it faces, its origin on the wall) on the inside of `wall`, at `along` (x for the back
// and front walls, z for the side ones) and height `y`. It is shown while the wall stands (world.mjs drops the walls the
// camera looks through, and `wall.userData.decor` goes with it).
export function hang(group, wall, along, y, object) {
  const n = wall.userData.normal, inward = n.clone().negate();
  object.position.copy(wall.position).addScaledVector(inward, 0.071);
  if (n.z) object.position.x = along;
  else object.position.z = along;
  object.position.y = y;
  object.rotation.y = Math.atan2(inward.x, inward.z);
  group.add(object);
  (wall.userData.decor ??= []).push(object);
  return object;
}
// The same, on the outside of the wall (a window seen from the garden).
function hangOutside(group, wall, along, y, object) {
  const n = wall.userData.normal;
  object.position.copy(wall.position).addScaledVector(n, 0.071);
  if (n.z) object.position.x = along;
  else object.position.z = along;
  object.position.y = y;
  object.rotation.y = Math.atan2(n.x, n.z);
  group.add(object);
  (wall.userData.decor ??= []).push(object);
  return object;
}

// What a window looks out on: a painted view (sky, trees and roofs for the flat; towers for the office), lit by the day.
function viewPainter(kind) {
  return (g, W, H, r) => {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#9cc8ec');
    sky.addColorStop(1, '#e6f2f8');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 4; i++) {
      const x = r() * W, y = 20 + r() * H * 0.3;
      g.beginPath(), g.ellipse(x, y, 30 + r() * 30, 9, 0, 0, Math.PI * 2), g.ellipse(x + 20, y - 6, 22, 10, 0, 0, Math.PI * 2), g.fill();
    }
    if (kind === 'city') {
      for (let x = 0; x < W; ) {
        const bw = 30 + r() * 50, bh = H * (0.3 + r() * 0.5);
        g.fillStyle = hsl(210, 10 + r() * 10, 55 + r() * 15);
        g.fillRect(x, H - bh, bw, bh);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        for (let wy = H - bh + 8; wy < H - 6; wy += 12) for (let wx = x + 5; wx < x + bw - 6; wx += 10) g.fillRect(wx, wy, 5, 6);
        x += bw + 4;
      }
    } else {
      for (let x = -20; x < W; x += 50 + r() * 40) {
        const rw = 50 + r() * 30, wallH = 40 + r() * 20;
        g.fillStyle = hsl(30, 25, 75 + r() * 10);
        g.fillRect(x, H - wallH, rw, wallH);
        g.fillStyle = hsl(10, 35, 40 + r() * 10);
        g.beginPath(), g.moveTo(x - 4, H - wallH), g.lineTo(x + rw / 2, H - wallH - 26), g.lineTo(x + rw + 4, H - wallH), g.fill();
      }
      for (let i = 0; i < 9; i++) {
        const x = r() * W, y = H - 30 - r() * 40;
        g.fillStyle = hsl(100 + r() * 30, 35, 30 + r() * 12);
        g.beginPath(), g.arc(x, y, 18 + r() * 16, 0, Math.PI * 2), g.fill();
      }
      g.fillStyle = '#6d9a50';
      g.fillRect(0, H - 14, W, 14);
    }
  };
}
// A window: frame, glass with the view behind it (dimmed at night, the night sky's blue), a sill, and curtains.
function windowPiece(w, h, { view = 'garden', curtains = 0xb85c4a, outside = false } = {}) {
  const g = new THREE.Group();
  const viewTex = canvasTexture(`view-${view}`, 256, 192, viewPainter(view), { repeat: false });
  const glass = glassFor(view, viewTex);
  const pane = planeMesh(w - 0.08, h - 0.08, glass, 0, 0, 0.005);
  pane.receiveShadow = false;
  g.add(pane);
  const t = 0.06;
  g.add(boxMesh(w, t, 0.06, 0, h / 2 - t / 2, 0.03, M.frame), boxMesh(w, t, 0.06, 0, -h / 2 + t / 2, 0.03, M.frame), boxMesh(t, h, 0.06, -w / 2 + t / 2, 0, 0.03, M.frame), boxMesh(t, h, 0.06, w / 2 - t / 2, 0, 0.03, M.frame));
  g.add(boxMesh(0.035, h - 0.1, 0.04, 0, 0, 0.02, M.frame), boxMesh(w - 0.1, 0.035, 0.04, 0, h * 0.12, 0.02, M.frame));
  g.add(boxMesh(w + 0.12, 0.04, outside ? 0.1 : 0.16, 0, -h / 2 - 0.02, outside ? 0.05 : 0.08, M.sill));
  if (!outside && curtains != null) {
    g.add(boxMesh(w + 0.6, 0.025, 0.025, 0, h / 2 + 0.12, 0.12, M.rail));
    const cloth = clothFor(curtains);
    for (const side of [-1, 1]) g.add(curtain(0.34, h + 0.35, cloth, side * (w / 2 + 0.12), -0.05, 0.1));
  }
  // Brighter by day, the night's dark blue at night.
  return g;
}
// One glass per view (brighter by day, the night's dark blue at night) and one cloth per colour, shared by every window.
const glasses = new Map(), cloths = new Map();
function glassFor(view, map) {
  if (!glasses.has(view)) {
    const glass = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
    const dark = new THREE.Color(0x1a2240), lit = new THREE.Color(0xffffff);
    ticking.push({ group: null, tick: (_dt, c) => glass.color.copy(dark).lerp(lit, daylight(c.hour)) });
    glasses.set(view, glass);
  }
  return glasses.get(view);
}
const clothFor = (colour) => (cloths.has(colour) || cloths.set(colour, mat(colour, { roughness: 0.95, side: THREE.DoubleSide })), cloths.get(colour));
// A curtain gathered in folds: a plane bent into a wave.
function curtain(w, h, material, x, y, z) {
  const geo = new THREE.PlaneGeometry(w, h, 12, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w) * Math.PI * 6) * 0.025);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Pictures for the walls, painted: hills, a sunflower, a boat at sunset, a rocket (a child's drawing), the planets, a
// table of the elements' colours.
const ART = {
  hills(g, W, H) {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#8ec5ea'), s.addColorStop(1, '#f6e7c8');
    g.fillStyle = s, g.fillRect(0, 0, W, H);
    g.fillStyle = '#f7d35a', g.beginPath(), g.arc(W * 0.75, H * 0.28, 16, 0, 7), g.fill();
    for (const [c, y, a] of [['#7fae5a', 0.62, 0.12], ['#5d8f45', 0.72, 0.1], ['#476f36', 0.84, 0.08]]) {
      g.fillStyle = c, g.beginPath(), g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, H * y + Math.sin(x / (W * a)) * 12);
      g.lineTo(W, H), g.fill();
    }
  },
  sunflower(g, W, H) {
    g.fillStyle = '#2f4f6f', g.fillRect(0, 0, W, H);
    g.fillStyle = '#4f8a3a', g.fillRect(W / 2 - 3, H * 0.45, 6, H);
    g.fillStyle = '#f2c021';
    for (let k = 0; k < 16; k++) g.beginPath(), g.ellipse(W / 2 + Math.cos(k / 2.55) * 26, H * 0.4 + Math.sin(k / 2.55) * 26, 14, 6, k / 2.55, 0, 7), g.fill();
    g.fillStyle = '#5a3a1a', g.beginPath(), g.arc(W / 2, H * 0.4, 18, 0, 7), g.fill();
    g.fillStyle = '#c8763a', g.fillRect(W * 0.2, H * 0.82, W * 0.6, H * 0.18);
  },
  sea(g, W, H) {
    const s = g.createLinearGradient(0, 0, 0, H * 0.6);
    s.addColorStop(0, '#f5946b'), s.addColorStop(1, '#fde0a8');
    g.fillStyle = s, g.fillRect(0, 0, W, H * 0.6);
    g.fillStyle = '#ffd56b', g.beginPath(), g.arc(W * 0.5, H * 0.58, 22, Math.PI, 0), g.fill();
    g.fillStyle = '#2f6f9f', g.fillRect(0, H * 0.6, W, H * 0.4);
    g.fillStyle = 'rgba(255,220,150,0.6)';
    for (let k = 0; k < 6; k++) g.fillRect(W * 0.42 + k * 3, H * 0.63 + k * 8, W * 0.16 - k * 6, 2);
    g.fillStyle = '#3a2a1e', g.beginPath(), g.moveTo(W * 0.2, H * 0.66), g.lineTo(W * 0.36, H * 0.66), g.lineTo(W * 0.33, H * 0.7), g.lineTo(W * 0.23, H * 0.7), g.fill();
    g.fillStyle = '#fff', g.beginPath(), g.moveTo(W * 0.28, H * 0.65), g.lineTo(W * 0.28, H * 0.45), g.lineTo(W * 0.35, H * 0.65), g.fill();
  },
  rocket(g, W, H) {
    g.fillStyle = '#fffdf6', g.fillRect(0, 0, W, H);
    g.lineWidth = 4, g.lineJoin = 'round';
    g.fillStyle = '#e8484a', g.strokeStyle = '#333';
    g.beginPath(), g.moveTo(W / 2, H * 0.12), g.quadraticCurveTo(W * 0.68, H * 0.35, W * 0.62, H * 0.7), g.lineTo(W * 0.38, H * 0.7), g.quadraticCurveTo(W * 0.32, H * 0.35, W / 2, H * 0.12), g.fill(), g.stroke();
    g.fillStyle = '#7cc6f2', g.beginPath(), g.arc(W / 2, H * 0.38, 12, 0, 7), g.fill(), g.stroke();
    g.fillStyle = '#f2a33a', g.beginPath(), g.moveTo(W * 0.42, H * 0.72), g.lineTo(W / 2, H * 0.92), g.lineTo(W * 0.58, H * 0.72), g.fill();
    g.fillStyle = '#f2c94c';
    for (const [x, y] of [[0.15, 0.2], [0.85, 0.3], [0.2, 0.75], [0.8, 0.8]]) g.beginPath(), g.arc(W * x, H * y, 5, 0, 7), g.fill();
  },
  planets(g, W, H) {
    g.fillStyle = '#10142e', g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    for (let k = 0; k < 60; k++) g.fillRect((k * 97) % W, (k * 53) % H, 1.5, 1.5);
    g.fillStyle = '#ffcf40', g.beginPath(), g.arc(-20, H / 2, 60, 0, 7), g.fill();
    const P = [['#b0a090', 4], ['#e8c070', 7], ['#3f8ad8', 8], ['#d0603a', 6], ['#d8a870', 18], ['#e8d090', 15], ['#8fd0e0', 11], ['#4060d0', 11]];
    let x = 50;
    for (const [c, r] of P) {
      g.fillStyle = c, g.beginPath(), g.arc(x + r, H / 2, r, 0, 7), g.fill();
      if (r === 15) (g.strokeStyle = '#c8b080'), (g.lineWidth = 2), g.beginPath(), g.ellipse(x + r, H / 2, r * 1.7, 4, -0.2, 0, 7), g.stroke();
      x += r * 2 + 8;
    }
  },
  elements(g, W, H) {
    g.fillStyle = '#f7f7f2', g.fillRect(0, 0, W, H);
    const cols = 18, cw = W / (cols + 1), ch = H / 9;
    const colour = ['#f28b82', '#fbbc04', '#fff475', '#ccff90', '#a7ffeb', '#cbf0f8', '#aecbfa', '#d7aefb'];
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < cols; col++) {
        if (row === 0 && col > 0 && col < 17) continue;
        if ((row === 1 || row === 2) && col > 1 && col < 12) continue;
        g.fillStyle = colour[(col < 2 ? 0 : col < 12 ? 3 : col < 17 ? 5 : 7) + (row % 2)];
        g.fillRect(cw * (col + 0.5) + 1, ch * (row + 1) + 1, cw - 2, ch - 2);
      }
  }
};
function picture(w, h, art, frame = M.darkFrame) {
  const g = new THREE.Group();
  const tex = canvasTexture(`art-${art}`, 256, Math.round((256 * h) / w), ART[art], { repeat: false });
  g.add(boxMesh(w + 0.06, h + 0.06, 0.03, 0, 0, 0.015, frame));
  const p = planeMesh(w, h, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), 0, 0, 0.032);
  g.add(p);
  return g;
}
// A wall clock with hands that tell the game's time.
function clock(r) {
  const g = new THREE.Group();
  const face = canvasTexture('clockface', 256, 256, (c, S) => {
    c.fillStyle = '#fbfaf6', c.fillRect(0, 0, S, S);
    c.fillStyle = '#2a2a2a';
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * Math.PI * 2, big = k % 5 === 0, r0 = S * (big ? 0.36 : 0.41), r1 = S * 0.46;
      c.lineWidth = big ? 7 : 2;
      c.strokeStyle = '#2a2a2a';
      c.beginPath(), c.moveTo(S / 2 + Math.sin(a) * r0, S / 2 - Math.cos(a) * r0), c.lineTo(S / 2 + Math.sin(a) * r1, S / 2 - Math.cos(a) * r1), c.stroke();
    }
  }, { repeat: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshStandardMaterial({ map: face, roughness: 0.4 }));
  disc.position.z = 0.03;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.08, 8, 40), M.darkFrame);
  rim.position.z = 0.03;
  const back = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 32).rotateX(Math.PI / 2), M.frame);
  back.position.z = 0.015;
  const handMat = mat(0x1e1e1e, { roughness: 0.4 });
  const hand = (len, wid) => {
    const p = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(wid, len, 0.006), handMat);
    m.position.y = len / 2 - len * 0.12;
    p.add(m);
    p.position.z = 0.04;
    return p;
  };
  const hour = hand(r * 0.55, r * 0.09), minute = hand(r * 0.82, r * 0.06);
  g.add(back, disc, rim, hour, minute);
  g.userData.live = true; // its hands move: not baked
  ticking.push({ group: null, tick: (_dt, c) => {
    minute.rotation.z = -((c.minutes % 60) / 60) * Math.PI * 2;
    hour.rotation.z = -(((c.minutes / 60) % 12) / 12) * Math.PI * 2;
  } });
  return g;
}
// A mirror: a painted reflection of a pale room with a shine across it (a real one would need the room drawn twice; on
// the tablet it isn't worth it, and a metal sheet reflects the sky's light as black).
function mirror(w, h) {
  const g = new THREE.Group();
  const tex = canvasTexture('mirror', 128, 160, (c, W, H) => {
    const a = c.createLinearGradient(0, 0, W, H);
    a.addColorStop(0, '#dfe8ec'), a.addColorStop(0.55, '#b8c6cc'), a.addColorStop(1, '#9fb0b8');
    c.fillStyle = a, c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.beginPath(), c.moveTo(W * 0.15, 0), c.lineTo(W * 0.4, 0), c.lineTo(0, H * 0.45), c.lineTo(0, H * 0.2), c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.beginPath(), c.moveTo(W * 0.55, 0), c.lineTo(W * 0.62, 0), c.lineTo(0, H * 0.8), c.lineTo(0, H * 0.72), c.fill();
  }, { repeat: false });
  g.add(boxMesh(w + 0.05, h + 0.05, 0.02, 0, 0, 0.01, M.chrome), planeMesh(w, h, new THREE.MeshBasicMaterial({ map: tex }), 0, 0, 0.022));
  return g;
}
function towelRail(towel) {
  const g = new THREE.Group();
  g.add(boxMesh(0.6, 0.02, 0.02, 0, 0, 0.08, M.chrome), boxMesh(0.02, 0.02, 0.08, -0.28, 0, 0.04, M.chrome), boxMesh(0.02, 0.02, 0.08, 0.28, 0, 0.04, M.chrome));
  const cloth = mat(towel, { roughness: 1 });
  g.add(boxMesh(0.42, 0.5, 0.03, 0, -0.24, 0.08, cloth), boxMesh(0.42, 0.06, 0.035, 0, -0.42, 0.08, mat(new THREE.Color(towel).multiplyScalar(0.8), { roughness: 1 })));
  return g;
}
// A strip of wall tiles (`w` wide, `h` high), lit like the wall.
function wallTiles(w, h, base = [40, 12, 92]) {
  const map = canvasTexture(`metro-${base.join()}`, 256, 256, metro(base)).clone();
  map.repeat.set(w / 0.6, h / 0.6);
  map.needsUpdate = true;
  return planeMesh(w, h, new THREE.MeshStandardMaterial({ map, roughness: 0.25 }), 0, 0, 0.004);
}
// Kitchen cupboards on the wall, doors with handles.
function wallCupboards(w, h = 0.62, depth = 0.34) {
  const g = new THREE.Group();
  g.add(boxMesh(w, h, depth, 0, 0, depth / 2, M.cupboard));
  const n = Math.max(1, Math.round(w / 0.5));
  for (let k = 0; k < n; k++) {
    const x = -w / 2 + (w / n) * (k + 0.5);
    g.add(boxMesh(w / n - 0.012, h - 0.012, 0.018, x, 0, depth + 0.009, M.cupboard));
    g.add(boxMesh(0.012, 0.12, 0.02, x + (k % 2 ? -1 : 1) * (w / n / 2 - 0.06), -h / 2 + 0.1, depth + 0.028, M.handle));
  }
  return g;
}
function whiteboard(w, h) {
  const g = new THREE.Group();
  const tex = canvasTexture('whiteboard', 512, Math.round((512 * h) / w), (c, W, H) => {
    c.fillStyle = '#fbfbfb', c.fillRect(0, 0, W, H);
    c.lineWidth = 4, c.lineCap = 'round';
    c.font = '600 38px system-ui, sans-serif';
    c.fillStyle = '#2b6cc4', c.fillText('3 × 4 = 12', 30, 70);
    c.fillStyle = '#c8202a', c.fillText('H₂O 💧', 30, 140);
    c.strokeStyle = '#2f9e5b';
    c.beginPath(), c.moveTo(300, H - 40);
    for (let x = 300; x < W - 30; x += 20) c.lineTo(x, H - 40 - Math.pow((x - 300) / 18, 1.6));
    c.stroke();
    c.strokeStyle = '#333', c.lineWidth = 2, c.beginPath(), c.moveTo(300, 30), c.lineTo(300, H - 40), c.lineTo(W - 20, H - 40), c.stroke();
    c.fillStyle = '#7a4cc4', c.beginPath(), c.arc(150, 220, 30, 0, 7), c.fill();
  }, { repeat: false });
  g.add(boxMesh(w + 0.05, h + 0.05, 0.025, 0, 0, 0.0125, M.chrome), planeMesh(w, h, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.2 }), 0, 0, 0.027));
  g.add(boxMesh(w * 0.6, 0.03, 0.06, 0, -h / 2 - 0.03, 0.04, M.chrome));
  return g;
}
function noticeBoard(w, h) {
  const g = new THREE.Group();
  g.add(boxMesh(w + 0.04, h + 0.04, 0.025, 0, 0, 0.0125, M.darkFrame), planeMesh(w, h, M.cork, 0, 0, 0.026));
  const r = rand(11);
  for (const c of [0xfff59d, 0xffffff, 0xa7ffeb, 0xffccbc, 0xffffff, 0xd1c4e9]) {
    const pw = 0.14 + r() * 0.08, ph = 0.16 + r() * 0.08;
    const note = planeMesh(pw, ph, mat(c, { roughness: 0.9 }), (r() - 0.5) * (w - pw), (r() - 0.5) * (h - ph), 0.028 + r() * 0.002);
    note.rotation.z = (r() - 0.5) * 0.2;
    g.add(note);
  }
  return g;
}
// Skirting boards along the foot of every wall (they stay when the walls drop: they're below the cut).
function skirting(group, walls) {
  for (const wall of walls) {
    const n = wall.userData.normal, inward = n.clone().negate();
    const len = (n.z ? wall.geometry.parameters.width : wall.geometry.parameters.depth) - 0.28;
    const b = new THREE.Mesh(new THREE.BoxGeometry(n.z ? len : 0.02, 0.09, n.z ? 0.02 : len), M.skirting);
    b.position.copy(wall.position).addScaledVector(inward, 0.08);
    b.position.y = 0.045;
    b.receiveShadow = true;
    group.add(b);
  }
}
// A flower bed: a strip of soil, leaves, and flowers of a few colours (one draw call each: the Quaternius "Flowers" read
// as blue stalks next to realistic people).
function flowerBed(group, x, z, w, d, turn = 0, seed = 1) {
  const r = rand(seed);
  const bed = new THREE.Group();
  bed.add(boxMesh(w + 0.12, 0.1, d + 0.12, 0, 0.0, 0, mat(0x8a8478, { roughness: 0.9 })));
  const soil = boxMesh(w, 0.1, d, 0, 0.02, 0, mat(0x4a3424, { roughness: 1 }));
  bed.add(soil);
  const n = Math.round(w * d * 60);
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), mat(0x4f8a3a, { roughness: 0.9, flatShading: true }), n);
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.035, 1), mat(0xffffff, { roughness: 0.6 }), n);
  const o = new THREE.Object3D(), c = new THREE.Color();
  const colours = [0xe8484a, 0xf2c94c, 0xf08ac0, 0xffffff, 0x9a6ad8, 0xf2a33a];
  for (let i = 0; i < n; i++) {
    const px = (r() - 0.5) * (w - 0.1), pz = (r() - 0.5) * (d - 0.1), hgt = 0.12 + r() * 0.16;
    o.position.set(px, 0.08 + hgt * 0.4, pz), o.scale.set(1, 0.8 + r(), 1), o.rotation.set(0, r() * 6, 0), o.updateMatrix();
    leaves.setMatrixAt(i, o.matrix);
    o.position.set(px + (r() - 0.5) * 0.04, 0.08 + hgt, pz + (r() - 0.5) * 0.04), o.scale.setScalar(0.8 + r() * 0.6), o.updateMatrix();
    heads.setMatrixAt(i, o.matrix);
    heads.setColorAt(i, c.set(colours[Math.floor(r() * colours.length)]));
  }
  leaves.castShadow = heads.castShadow = true;
  bed.add(leaves, heads);
  bed.position.set(x, 0, z);
  bed.rotation.y = turn;
  group.add(bed);
}
// The flat's walls: brick outside (the courses keep their size as a wall drops), and one painted wall inside.
function brickPainter(g, S, _h, r) {
  g.fillStyle = '#d8d0c4';
  g.fillRect(0, 0, S, S);
  const rows = 8, bh = S / rows, bw = S / 2.5;
  for (let row = 0; row < rows; row++)
    for (let k = -1; k < 4; k++) {
      const x = k * bw + (row % 2) * (bw / 2);
      g.fillStyle = hsl(10 + r() * 12, 40 + r() * 15, 38 + r() * 12);
      g.fillRect(x + 3, row * bh + 3, bw - 6, bh - 6);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(x + 3, row * bh + bh - 7, bw - 6, 4);
    }
}
function dressWalls(walls, feature) {
  for (const wall of walls) {
    const n = wall.userData.normal;
    const outer = n.x > 0 ? 0 : n.x < 0 ? 1 : n.z > 0 ? 4 : 5, inner = outer % 2 ? outer - 1 : outer + 1;
    const len = n.z ? wall.geometry.parameters.width : wall.geometry.parameters.depth;
    const map = canvasTexture('brick', 256, 256, brickPainter).clone();
    map.needsUpdate = true;
    const mats = [...wall.material];
    mats[outer] = new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
    if (n.z === -1 && feature != null) mats[inner] = mat(feature, { roughness: 0.95 });
    wall.material = mats;
    // 0.6 m of brick to a tile of the texture, across and up, as the wall rises and drops.
    wall.userData.onScale = (h) => map.repeat.set(len / 0.9, h / 0.6);
    wall.userData.onScale(wall.scale.y);
  }
}
const TREE = /Tree|Willow/;
// The garden and the street, drawn by world.mjs's `furnish` (one instanced mesh per model part) but casting no shadow:
// they stand outside the sun's shadow box, and the shadow pass would draw every one of them a second time for nothing
// (round 11's first take: the flat 315 draw calls and 189k triangles, from 184 and 32k).
async function scenery(group, furnish, P) {
  const before = new Set(group.children);
  const items = await furnish(group, P);
  for (const o of group.children) if (!before.has(o) && o.isInstancedMesh) o.castShadow = false;
  return items.filter((i) => TREE.test(i.name));
}
// Everything hung on a wall, baked into one mesh per material (round 11: a window is a dozen small pieces, and the
// office has fourteen; one draw call each would cost the tablet). The pieces' places are written into the geometry.
// Things that move (`userData.live`: a clock) stay as they are.
function bake(group, walls) {
  group.updateMatrixWorld(true);
  for (const wall of walls) {
    const keep = [], byMat = new Map();
    for (const obj of wall.userData.decor ?? []) {
      if (obj.userData.live) {
        keep.push(obj);
        continue;
      }
      obj.updateMatrixWorld(true);
      obj.traverse((o) => {
        if (!o.isMesh) return;
        const key = o.material.uuid + (o.castShadow ? 's' : '');
        if (!byMat.has(key)) byMat.set(key, { material: o.material, shadow: o.castShadow, geos: [] });
        const g = o.geometry.clone();
        byMat.get(key).geos.push(g.applyMatrix4(o.matrixWorld));
      });
      obj.removeFromParent();
    }
    for (const { material, shadow, geos } of byMat.values()) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const m = new THREE.Mesh(merged, material);
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      group.add(m);
      keep.push(m);
    }
    wall.userData.decor = keep;
  }
}
const side = (walls, x, z) => walls.find((w) => w.userData.normal.x === x && w.userData.normal.z === z);

// ---- instanced scenery (no walk grid, no clicks): trees, bushes, houses, from world.mjs's models ----
// `furnish` is world.mjs's own; passed in to keep one loader and one cache.

// ---- the flat ----
// The flat is 7 × 6 m, walls at x = ±3.5 and z = ±3. Things on the walls kept clear of what stands against them
// (world.mjs lifeHome): beds and the bookshelf at the back, the kitchen at the back right, the bathroom on the right, the
// front door on the left at z 1.45, the couch's back to the front wall.
export async function dressHome(group, walls, furnish, S) {
  if (!DOM) return [];
  const [back, left, right, front] = [side(walls, 0, -1), side(walls, -1, 0), side(walls, 1, 0), side(walls, 0, 1)];
  dressWalls(walls, 0xdfe7d6);
  // Floors: boards, the kitchen's tiles, the bathroom's.
  group.add(ground('wood', 7, 6, 0, 0, 0));
  group.add(ground('kitchen', 2.55, 1.15, 2.225, -2.425, 0.002));
  group.add(ground('bathroom', 1.1, 3.0, 2.95, 1.5, 0.002));
  skirting(group, walls);
  // The back wall: a picture over the bed, a window, a clock over the plant, the kitchen's tiles and cupboards.
  hang(group, back, -2.8, 1.5, picture(0.55, 0.42, 'hills'));
  hang(group, back, -1.6, 1.5, windowPiece(0.95, 1.05, { curtains: 0x5a7fb0 }));
  hangOutside(group, back, -1.6, 1.5, windowPiece(0.95, 1.05, { outside: true }));
  hang(group, back, 0.55, 2.05, clock(0.17));
  const splash = wallTiles(1.7, 0.6);
  hang(group, back, 1.85, 1.22, splash);
  hang(group, back, 1.85, 1.86, wallCupboards(1.6));
  // The left wall: a window over the first bed, a picture by the lamp.
  hang(group, left, -1.55, 1.5, windowPiece(1.0, 1.05, { curtains: 0x5a7fb0 }));
  hangOutside(group, left, -1.55, 1.5, windowPiece(1.0, 1.05, { outside: true }));
  hang(group, left, 2.45, 1.55, picture(0.45, 0.6, 'sunflower'));
  // The right wall: a picture by the fridge, the bathroom's tiles, a mirror over the basin, a towel.
  hang(group, right, -1.05, 1.5, picture(0.5, 0.38, 'sea'));
  hang(group, right, 1.5, 0.62, wallTiles(2.96, 1.24, [195, 25, 88]));
  hang(group, right, 0.5, 1.55, mirror(0.5, 0.62));
  hang(group, right, 0.0, 1.15, towelRail(0xe46aa0));
  // The front wall: a window behind the couch, a child's drawing of a rocket.
  hang(group, front, -1.6, 1.55, windowPiece(1.2, 1.0, { curtains: 0xc86a4a }));
  hangOutside(group, front, -1.6, 1.55, windowPiece(1.2, 1.0, { outside: true }));
  hang(group, front, 1.0, 1.5, picture(0.4, 0.5, 'rocket', M.frame));
  bake(group, walls);

  // Outside: a lawn, a path from the front door to the pavement, a road with houses across it, hedges and trees.
  group.add(ground('grass', 140, 140, 0, 0, -0.03));
  group.add(ground('paving', 4.6, 1.2, -5.8, 1.45, -0.02));
  group.add(ground('paving', 2.4, 40, -9.3, 0, -0.018));
  group.add(ground('asphalt', 6, 140, -13.5, 0, -0.022));
  const lines = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 140).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f0e6, roughness: 0.8 }));
  lines.material.map = canvasTexture('dashes', 8, 64, (c) => ((c.fillStyle = '#fff'), c.fillRect(0, 0, 8, 32)));
  lines.material.map.repeat.set(1, 140 / 3);
  lines.material.alphaMap = lines.material.map;
  lines.material.transparent = true;
  lines.position.set(-13.5, -0.015, 0);
  group.add(lines);
  // A doormat and a step at the front door; a patio by the front wall.
  group.add(ground('paving', 6.8, 1.6, 0, 3.95, -0.02));
  const mat_ = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.8), mat(0x6a4a2a, { roughness: 1 }));
  mat_.position.set(-3.2, 0.006, 1.45);
  mat_.receiveShadow = true;
  group.add(mat_);
  // A letterbox by the pavement.
  const post = new THREE.Group();
  post.add(boxMesh(0.08, 1.0, 0.08, 0, 0.5, 0, mat(0x5a4636)), boxMesh(0.32, 0.26, 0.42, 0, 1.1, 0, mat(0xc8202a, { roughness: 0.4 })));
  post.position.set(-8.0, 0, 2.35);
  group.add(post);
  const r = rand(23);
  const P = [];
  // A hedge round the garden (front and back), with a gap for the path.
  for (let x = -7.4; x <= 8.5; x += 1.4) for (const z of [-7.2, 7.4]) P.push([S('Bush_1'), x + (r() - 0.5) * 0.2, z + (r() - 0.5) * 0.2, r() * 6, 1.3 + r() * 0.3]);
  for (let z = -6.0; z <= 6.6; z += 1.4) if (Math.abs(z - 1.45) > 1.1) P.push([S('Bush_2'), -7.4 + (r() - 0.5) * 0.2, z, r() * 6, 1.2 + r() * 0.3]);
  for (let z = -6.0; z <= 6.6; z += 1.4) P.push([S('Bush_1'), 8.6 + (r() - 0.5) * 0.2, z, r() * 6, 1.3 + r() * 0.3]);
  // Trees in the corners (they step aside when they come between the camera and the flat: world.mjs), flower beds
  // along the patio and the right side, a few rocks.
  for (const [x, z, n, h] of [[7.2, -6.2, 'CommonTree_1', 6.5], [6.8, 5.6, 'BushBerries_1', 1.2], [-5.9, -6.0, 'BirchTree_1', 6.8], [-5.9, 6.2, 'CommonTree_2', 5.5], [3.6, 6.2, 'BushBerries_1', 1.0], [5.6, -1.0, 'Bush_2', 1.1]])
    P.push([S(n), x, z, r() * 6, h]);
  flowerBed(group, 0, 5.15, 6.0, 0.5, 0, 3);
  flowerBed(group, 4.15, -0.2, 4.6, 0.5, Math.PI / 2, 4);
  for (const [x, z] of [[4.8, 3.3], [-4.8, -3.6], [7.4, 1.2]]) P.push([S('Rock_Moss_2'), x, z, r() * 6, 0.35]);
  P.push([S('Streetlight_Single'), -10.3, -4, 0, 3.8], [S('Streetlight_Single'), -10.3, 8, 0, 3.8]);
  lampGlow(group, [[-10.3, 3.45, -4], [-10.3, 3.45, 8]]);
  // Houses across the road.
  // Two houses across the road (two models: each is 3.5–5k triangles in 9 parts).
  for (const [z, n] of [[-6, '2Story_Mat'], [4, '2Story_Wide_Mat']]) P.push([S(n), -21, z, Math.PI / 2, 7.5]);
  // The trees, for the camera to see past.
  return scenery(group, furnish, P);
}

// ---- a house in the town (round 14), any size ----
// Walls at x = ±w/2 and z = ±d/2; the front door on the left wall at z = d/2 − 1.55 (world.mjs lifeHouse). The town's
// houses keep their kitchen at the back on the right and their bathroom at the front on the right (world.mjs
// houseFurniture), as the flat does; the household's own home after an extension or a move keeps the flat's furniture
// where it was, in the same corners. The windows keep to the stretches of wall those leave clear. `spec.look`:
// { feature (the back wall inside), floor ('wood' | 'carpet'), curtains }; `spec.forSale`: a sign by the path.
export async function dressHouse(group, walls, furnish, S, spec) {
  if (!DOM) return [];
  const { w, d } = spec, look = spec.look ?? {};
  const [back, left, right, front] = [side(walls, 0, -1), side(walls, -1, 0), side(walls, 1, 0), side(walls, 0, 1)];
  const doorZ = d / 2 - 1.55;
  dressWalls(walls, look.feature ?? 0xdfe7d6);
  group.add(ground(look.floor ?? 'wood', w, d, 0, 0, 0));
  group.add(ground('kitchen', 2.9, 1.3, w / 2 - 1.45, -d / 2 + 0.65, 0.002));
  group.add(ground('bathroom', 1.2, 3.1, w / 2 - 0.6, d / 2 - 1.55, 0.002));
  skirting(group, walls);
  const curtains = look.curtains ?? 0x5a7fb0;
  const win = (wall, along, ww = 1.0, hh = 1.05, y = 1.5) => {
    hang(group, wall, along, y, windowPiece(ww, hh, { curtains }));
    hangOutside(group, wall, along, y, windowPiece(ww, hh, { outside: true }));
  };
  // The back wall: windows along the bedroom end, a picture, then the kitchen's tiles and cupboards in the right corner.
  const backEnd = w / 2 - 3.2;
  let x = -w / 2 + 1.6;
  for (; x < backEnd - 0.6; x += 2.6) win(back, x);
  if (x - 1.3 < backEnd - 0.5) hang(group, back, Math.min(x - 1.0, backEnd - 0.4), 1.55, picture(0.5, 0.4, 'hills'));
  hang(group, back, w / 2 - 1.45, 1.22, wallTiles(2.8, 0.6));
  hang(group, back, w / 2 - 1.45, 1.86, wallCupboards(2.6));
  // The left wall: windows clear of the front door, a picture beside it.
  for (let z = -d / 2 + 1.5; z < doorZ - 1.3; z += 2.6) win(left, z);
  hang(group, left, d / 2 - 0.55, 1.55, picture(0.4, 0.5, 'sunflower'));
  // The right wall: a window behind the dining table, the bathroom's tiles, a mirror over the basin, a clock.
  if (d >= 7) win(right, -d / 2 + 2.2, 0.9);
  hang(group, right, d / 2 - 1.55, 0.62, wallTiles(3.0, 1.24, [195, 25, 88]));
  hang(group, right, d / 2 - 2.5, 1.55, mirror(0.5, 0.62));
  hang(group, right, -d / 2 + (d >= 7 ? 3.3 : 1.6), 2.0, clock(0.17));
  // The front wall: windows, and a picture by the bathroom.
  for (let x2 = -w / 2 + 1.6; x2 < w / 2 - 3.0; x2 += 2.8) win(front, x2, 1.2, 1.0, 1.55);
  hang(group, front, w / 2 - 2.0, 1.5, picture(0.45, 0.35, 'sea'));
  bake(group, walls);

  // Outside: a lawn, a path from the front door to the pavement, the road, a hedge round the garden, trees.
  const gx0 = -w / 2 - 3.9, gx1 = w / 2 + 4.6, gz = d / 2 + 4.2;
  group.add(ground('grass', 140, 140, 0, 0, -0.03));
  group.add(ground('paving', 4.6, 1.2, -w / 2 - 2.3, doorZ, -0.02));
  group.add(ground('paving', 2.4, 60, -w / 2 - 5.8, 0, -0.018));
  group.add(ground('asphalt', 6, 140, -w / 2 - 10, 0, -0.022));
  group.add(ground('paving', w - 0.2, 1.6, 0, d / 2 + 0.95, -0.02));
  const doormat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.8), mat(0x6a4a2a, { roughness: 1 }));
  doormat.position.set(-w / 2 + 0.3, 0.006, doorZ);
  doormat.receiveShadow = true;
  group.add(doormat);
  const r = rand(31 + w * 7 + d);
  const P = [];
  for (let x3 = gx0; x3 <= gx1; x3 += 1.4) for (const z of [-gz, gz]) P.push([S('Bush_1'), x3 + (r() - 0.5) * 0.2, z + (r() - 0.5) * 0.2, r() * 6, 1.3 + r() * 0.3]);
  for (let z = -gz + 1.2; z <= gz - 0.6; z += 1.4) {
    if (Math.abs(z - doorZ) > 1.1) P.push([S('Bush_2'), gx0, z, r() * 6, 1.2 + r() * 0.3]);
    P.push([S('Bush_1'), gx1, z + (r() - 0.5) * 0.2, r() * 6, 1.3 + r() * 0.3]);
  }
  for (const [x4, z, n, h] of [[gx1 - 1.4, -gz + 1.2, 'CommonTree_3', 6.2], [gx0 + 1.6, -gz + 1.2, 'BirchTree_2', 6.5], [gx1 - 1.2, gz - 1.4, 'BushBerries_1', 1.2], [gx0 + 1.4, gz - 1.4, 'CommonTree_4', 5.4]])
    P.push([S(n), x4, z, r() * 6, h]);
  flowerBed(group, 0, d / 2 + 2.2, Math.min(w - 1, 8), 0.5, 0, 5 + w);
  flowerBed(group, w / 2 + 1.0, 0, Math.min(d - 1, 6), 0.5, Math.PI / 2, 6 + d);
  P.push([S('Streetlight_Single'), -w / 2 - 6.8, -4, 0, 3.8], [S('Streetlight_Single'), -w / 2 - 6.8, 8, 0, 3.8]);
  lampGlow(group, [[-w / 2 - 6.8, 3.45, -4], [-w / 2 - 6.8, 3.45, 8]]);
  for (const [z, n] of [[-7, '2Story_Mat'], [5, '2Story_Wide_Mat']]) P.push([S(n), -w / 2 - 17.5, z, Math.PI / 2, 7.5]);
  if (spec.forSale) {
    const sign = saleSign(spec.street);
    sign.position.set(-w / 2 - 2.0, 0, doorZ + 1.3);
    sign.rotation.y = -Math.PI / 2;
    group.add(sign);
  }
  return scenery(group, furnish, P);
}
// A "For sale" board on a post, by the path (round 14).
function saleSign(street = 'Sunny Lane') {
  const g = new THREE.Group();
  const board = canvasTexture(`forSale-${street}`, 256, 160, (c, W, H) => {
    c.fillStyle = '#fff', c.fillRect(0, 0, W, H);
    c.fillStyle = '#c8202a', c.fillRect(0, 0, W, 48);
    c.fillStyle = '#fff', c.font = 'bold 34px system-ui, sans-serif', c.textAlign = 'center', c.textBaseline = 'middle';
    c.fillText('FOR SALE', W / 2, 26);
    c.fillStyle = '#2a2a2a', c.font = '600 26px system-ui, sans-serif';
    c.fillText(street, W / 2, 88);
    c.fillText('Homes 🏡', W / 2, 126);
  }, { repeat: false });
  g.add(boxMesh(0.07, 1.5, 0.07, 0, 0.75, 0, mat(0xf2efe8)));
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.56, 0.03), [M.frame, M.frame, M.frame, M.frame, new THREE.MeshStandardMaterial({ map: board, roughness: 0.6 }), M.frame]);
  face.position.set(0, 1.25, 0.05);
  face.castShadow = true;
  g.add(face);
  return g;
}
// A party (round 14): balloons in bunches in the corners and bunting across the room, above everyone's heads. Looked
// at, never walked round: the page shows it while a party is on.
export function partyDecor(w, d) {
  const g = new THREE.Group();
  const r = rand(77 + w);
  const colours = [0xe8484a, 0xf2c94c, 0x4a90e2, 0x7ed36a, 0xf08ac0, 0x9a6ad8];
  const corners = [[-w / 2 + 0.35, -d / 2 + 0.35], [w / 2 - 0.35, -d / 2 + 0.35], [-w / 2 + 0.35, d / 2 - 0.35], [w / 2 - 3.2, d / 2 - 0.35]];
  const n = corners.length * 5;
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 16, 12).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.05 }), n);
  const strings = [];
  const o = new THREE.Object3D(), c = new THREE.Color();
  let i = 0;
  for (const [cx, cz] of corners)
    for (let k = 0; k < 5; k++, i++) {
      const top = new THREE.Vector3(cx + (r() - 0.5) * 0.45, 1.8 + r() * 0.5, cz + (r() - 0.5) * 0.45);
      o.position.copy(top), o.rotation.set(0, 0, (r() - 0.5) * 0.3), o.updateMatrix();
      balls.setMatrixAt(i, o.matrix);
      balls.setColorAt(i, c.set(colours[Math.floor(r() * colours.length)]));
      strings.push(top.x, top.y - 0.2, top.z, cx, 0.05, cz);
    }
  balls.castShadow = true;
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(strings, 3));
  g.add(balls, new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xdddddd })));
  // Bunting: two strings of little flags corner to corner.
  const flags = [], flagColours = [];
  for (const [[x0, z0], [x1, z1]] of [[[-w / 2 + 0.2, -d / 2 + 0.2], [w / 2 - 0.2, d / 2 - 0.2]], [[-w / 2 + 0.2, d / 2 - 0.2], [w / 2 - 0.2, -d / 2 + 0.2]]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), steps = Math.floor(len / 0.35);
    for (let k = 1; k < steps; k++) {
      const t = k / steps, sag = Math.sin(t * Math.PI) * 0.35;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = 2.45 - sag;
      const ux = ((x1 - x0) / len) * 0.12, uz = ((z1 - z0) / len) * 0.12;
      flags.push(x - ux, y, z - uz, x + ux, y, z + uz, x, y - 0.22, z);
      const col = c.set(colours[k % colours.length]);
      for (let v = 0; v < 3; v++) flagColours.push(col.r, col.g, col.b);
    }
  }
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute(flags, 3));
  flagGeo.setAttribute('color', new THREE.Float32BufferAttribute(flagColours, 3));
  flagGeo.computeVertexNormals();
  g.add(new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 })));
  return g;
}

// ---- the office (16 × 12 m) ----
export async function dressOffice(group, walls, furnish, S) {
  if (!DOM) return [];
  const [back, left, right, front] = [side(walls, 0, -1), side(walls, -1, 0), side(walls, 1, 0), side(walls, 0, 1)];
  group.add(ground('carpet', 16, 12, 0, 0, 0));
  group.add(ground('kitchen', 2.0, 3.4, 7.0, 3.95, 0.002));
  skirting(group, walls);
  // Big windows along the back, over the stations; a clock between the globe and the history shelves.
  for (const x of [-5.6, -2.4, 0.8]) {
    hang(group, back, x, 1.85, windowPiece(1.9, 1.1, { view: 'city', curtains: null }));
    hangOutside(group, back, x, 1.85, windowPiece(1.9, 1.1, { view: 'city', outside: true }));
  }
  hang(group, back, 2.55, 2.1, clock(0.22));
  // The left wall: windows, a notice board, the planets.
  for (const z of [-3.6, -0.4]) {
    hang(group, left, z, 1.6, windowPiece(1.8, 1.3, { view: 'city', curtains: null }));
    hangOutside(group, left, z, 1.6, windowPiece(1.8, 1.3, { view: 'city', outside: true }));
  }
  hang(group, left, 1.6, 1.5, noticeBoard(1.0, 0.7));
  hang(group, left, -5.3, 1.55, picture(0.9, 0.5, 'planets', M.frame));
  // The right wall: the whiteboard between the letters and the phone box, the elements' table, kitchen tiles.
  hang(group, right, -1.1, 1.5, whiteboard(1.5, 0.95));
  hang(group, right, -4.9, 1.6, picture(1.0, 0.56, 'elements', M.frame));
  hang(group, right, 3.55, 1.22, wallTiles(1.7, 0.6));
  hang(group, right, 3.55, 1.86, wallCupboards(1.6));
  // The front wall: windows, a picture.
  for (const x of [-4.2, 2.6]) {
    hang(group, front, x, 1.7, windowPiece(1.9, 1.2, { view: 'city', curtains: null }));
    hangOutside(group, front, x, 1.7, windowPiece(1.9, 1.2, { view: 'city', outside: true }));
  }
  hang(group, front, -0.9, 1.5, picture(0.7, 0.5, 'hills', M.frame));
  bake(group, walls);
  // Outside: a forecourt, the street, grass, trees, towers further off.
  group.add(ground('grass', 160, 160, 0, 0, -0.03));
  group.add(ground('paving', 22, 18, 0, 0, -0.02));
  group.add(ground('asphalt', 8, 160, -16, 0, -0.022));
  const r = rand(31);
  const P = [];
  for (const [x, z] of [[-10, -7.5], [-10, 7.5], [10, -7.5], [0, -8.2]]) P.push([S(['CommonTree_1', 'CommonTree_2', 'CommonTree_4'][Math.floor(r() * 3)]), x, z, r() * 6, 5.5 + r()]);
  for (let x = -9; x <= 9; x += 1.5) P.push([S('Bush_1'), x, -6.9, r() * 6, 1.0 + r() * 0.2]);
  for (const z of [-6, 0, 6]) P.push([S('Streetlight_Single'), -11.6, z, 0, 4]);
  lampGlow(group, [-6, 0, 6].map((z) => [-11.6, 3.65, z]));
  // Towers behind: one model, four of them (instancing makes the copies nearly free; each model is 9 parts).
  for (const [x, z, turn, h] of [[-10, -18, 0, 12], [2, -18, 0, 14], [12, -18, 0, 11], [-24, -2, Math.PI / 2, 13]]) P.push([S('4Story_Mat'), x, z, turn, h]);
  return scenery(group, furnish, P);
}

// ---- the park: grass, gravel paths, paving, a pond that moves, stones round it, ducks ----
export function dressPark(group) {
  if (!DOM) return;
  group.add(ground('grass', 160, 140, 0, 0, -0.03));
  group.add(ground('gravel', 36, 2.4, 0, 0, 0.004), ground('gravel', 2.4, 28, 0, 0, 0.0045));
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(4.5, 48).rotateX(-Math.PI / 2), floor('paving', 9, 9));
  plaza.position.y = 0.006;
  plaza.receiveShadow = true;
  group.add(plaza);
}
// The pond's water, its stones, and the ducks: `pond` = [x, z, radius]. Returns { water, ducks, update(dt, feeding, at) }.
export function pondLife(group, [px, pz, pr]) {
  // Water that ripples: a normal map of a few waves that tile, sliding two ways.
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const u = (i / S) * Math.PI * 2, v = (j / S) * Math.PI * 2;
      const dx = Math.cos(u * 3 + v) * 0.5 + Math.cos(u * 5 - v * 2) * 0.3 + Math.cos(u * 2 + v * 7) * 0.2;
      const dy = Math.cos(v * 4 - u) * 0.5 + Math.cos(v * 3 + u * 4) * 0.3 + Math.cos(v * 6 + u * 2) * 0.2;
      const k = (j * S + i) * 4;
      data.set([128 + dx * 60, 128 + dy * 60, 255, 255], k);
    }
  const normal = new THREE.DataTexture(data, S, S);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(3, 3);
  normal.needsUpdate = true;
  // It reflects a sky (a painted one: the room light every other surface takes showed on water as white blotches).
  const skyTex = canvasTexture('water-sky', 256, 128, (c, W, H) => {
    const a = c.createLinearGradient(0, 0, 0, H);
    a.addColorStop(0, '#5f9ad8'), a.addColorStop(0.48, '#cfe4f2'), a.addColorStop(0.52, '#6f9a58'), a.addColorStop(1, '#3d5a30');
    c.fillStyle = a, c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    for (let k = 0; k < 7; k++) c.beginPath(), c.ellipse((k * 47) % W, 18 + (k % 3) * 12, 20, 6, 0, 0, 7), c.fill();
  }, { repeat: false });
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(pr, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2f6a88, roughness: 0.12, metalness: 0.35, envMap: skyTex, envMapIntensity: 0.9, normalMap: normal, normalScale: new THREE.Vector2(0.16, 0.16), transparent: true, opacity: 0.94 })
  );
  water.position.set(px, 0.003, pz);
  water.receiveShadow = true;
  // A darker bed under it, for depth at the edges.
  const bed = new THREE.Mesh(new THREE.CircleGeometry(pr + 0.15, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3b4a32, roughness: 1 }));
  bed.position.set(px, 0.001, pz);
  group.add(bed, water);
  // Stones round the edge.
  const r = rand(5);
  const N = 64;
  const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), N);
  const o = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + r() * 0.05, rr = pr + 0.04 + r() * 0.12;
    o.position.set(px + Math.cos(a) * rr, 0.015, pz + Math.sin(a) * rr);
    o.scale.set(0.12 + r() * 0.1, 0.05 + r() * 0.06, 0.1 + r() * 0.09);
    o.rotation.set(r(), r() * 6, r());
    o.updateMatrix();
    stones.setMatrixAt(i, o.matrix);
    stones.setColorAt(i, c.setStyle(hsl(30 + r() * 30, 6 + r() * 10, 38 + r() * 18)));
  }
  stones.castShadow = stones.receiveShadow = true;
  group.add(stones);
  // The ducks: drakes (green head) and ducks (brown), made of a few round shapes, one draw call each kind.
  const duck = (head, body) => {
    const col = (g, hex) => {
      const k = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([k.r, k.g, k.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g;
    };
    return mergeGeometries([
      col(new THREE.SphereGeometry(0.1, 12, 8).scale(0.85, 0.6, 1.3).translate(0, 0.05, 0), body),
      col(new THREE.ConeGeometry(0.05, 0.12, 8).rotateX(-Math.PI / 2 - 0.5).translate(0, 0.09, -0.14), body),
      col(new THREE.SphereGeometry(0.055, 10, 8).translate(0, 0.16, 0.1), head),
      col(new THREE.SphereGeometry(0.03, 8, 6).scale(1, 0.6, 1.4).translate(0, 0.15, 0.17), 0xf0a020),
      col(new THREE.SphereGeometry(0.06, 8, 6).scale(0.9, 0.5, 1.2).translate(0, 0.08, 0.02), head === 0x2f7a3a ? 0x8a8478 : 0x7a5a3a)
    ]);
  };
  const kinds = [duck(0x2f7a3a, 0xb8b0a0), duck(0x7a5a3a, 0x9a7a5a)];
  const D = 7;
  const birds = [];
  // Drakes are the even ones, ducks the odd: as many slots as birds of each (an unset slot drew a duck at the origin).
  const meshes = kinds.map((geo, k) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), k ? Math.floor(D / 2) : Math.ceil(D / 2));
    m.castShadow = true;
    m.frustumCulled = false;
    group.add(m);
    return m;
  });
  for (let i = 0; i < D; i++) {
    const a = r() * Math.PI * 2, rad = 0.8 + r() * (pr - 1.3);
    birds.push({ mesh: meshes[i % 2], slot: Math.floor(i / 2), x: px + Math.cos(a) * rad, z: pz + Math.sin(a) * rad, heading: r() * 6, speed: 0, wander: r() * 100, phase: r() * 6 });
  }
  let t = 0;
  const place = () => {
    for (const b of birds) {
      o.position.set(b.x, 0.012 + Math.sin(t * 2 + b.phase) * 0.006, b.z);
      o.rotation.set(0, b.heading, Math.sin(t * 1.6 + b.phase) * 0.05);
      o.scale.setScalar(1);
      o.updateMatrix();
      b.mesh.setMatrixAt(b.slot, o.matrix);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  };
  place();
  return {
    water,
    birds,
    // Round 16, phase 3: the ducks' meshes (they shelter out of sight in the rain).
    ducks: meshes,
    // `feeding`: the point on the bank someone feeds from, or null. The ducks paddle about; when fed, they come over
    // and gather in front of the feeder, each a little apart.
    update(dt, feeding) {
      t += dt;
      normal.offset.set(t * 0.02, t * 0.013);
      birds.forEach((b, i) => {
        let tx, tz;
        if (feeding) {
          const toward = Math.atan2(pz - feeding.z, px - feeding.x);
          const a = toward + (i - (D - 1) / 2) * 0.22;
          const rad = 0.75 + (i % 3) * 0.3;
          tx = feeding.x + Math.cos(a) * rad;
          tz = feeding.z + Math.sin(a) * rad;
        } else {
          b.wander += dt * 0.08;
          const a = b.wander + i * 0.9;
          const rad = 0.8 + ((Math.sin(b.wander * 0.7 + i) + 1) / 2) * (pr - 1.4);
          tx = px + Math.cos(a) * rad;
          tz = pz + Math.sin(a) * rad;
        }
        const dx = tx - b.x, dz = tz - b.z, dist = Math.hypot(dx, dz);
        const want = Math.min(feeding ? 0.55 : 0.18, dist * 0.8);
        b.speed += (want - b.speed) * Math.min(1, dt * 2);
        if (dist > 0.03) {
          const goal = Math.atan2(dx, dz);
          let turn = goal - b.heading;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          b.heading += turn * Math.min(1, dt * 3);
          b.x += Math.sin(b.heading) * b.speed * dt;
          b.z += Math.cos(b.heading) * b.speed * dt;
        } else if (feeding) {
          // Arrived: face the feeder and bob for the bread.
          const face = Math.atan2(feeding.x - b.x, feeding.z - b.z);
          b.heading += Math.atan2(Math.sin(face - b.heading), Math.cos(face - b.heading)) * Math.min(1, dt * 3);
        }
        // Stay in the water.
        const ox = b.x - px, oz = b.z - pz, or = Math.hypot(ox, oz);
        if (or > pr - 0.35) (b.x = px + (ox / or) * (pr - 0.35)), (b.z = pz + (oz / or) * (pr - 0.35));
      });
      place();
    }
  };
}

// ---- Sunny Lane (round 15): the street as a place to walk down ----
// The houses' fronts in a row along the back (z = −d/2 is the front walls' face; each house goes back from there out
// of the walk grid), their front gardens, the pavement, the road, the far pavement with its lamps, and hedges and trees
// beyond. The doors, the hedges between the gardens, the lamps and the bus stop are world.mjs's (things a Sim walks
// round or uses); everything here is only looked at. `fronts`: town.mjs streetLayout(). Returns the trees (to step aside
// for the camera), a name board over each house (`labels`: id → { sprite, set(text, colour) }) and balloons at each gate
// (`balloons`: id → group, shown by the page while that house has a party) and a For sale board in each garden
// (`signs`: id → group, shown while it is for sale and not yours).
const ROOFS = [0x8a4a3a, 0x5a6470, 0x9a5a40, 0x6a5040];
// Glass seen from the street: the sky in it by day, a streak of light across it; lit warm from inside at night where
// someone lives (`lived`), dark where nobody does.
const frontGlasses = new Map();
function frontGlass(lived) {
  if (!frontGlasses.has(lived)) {
    const map = canvasTexture('frontGlass', 128, 128, (g, W, H) => {
      const sky = g.createLinearGradient(0, 0, W * 0.3, H);
      sky.addColorStop(0, '#cfe4f2'), sky.addColorStop(0.55, '#8fb2c8'), sky.addColorStop(1, '#5f7f96');
      g.fillStyle = sky, g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(), g.moveTo(W * 0.15, H), g.lineTo(W * 0.55, 0), g.lineTo(W * 0.75, 0), g.lineTo(W * 0.35, H), g.fill();
    }, { repeat: false });
    const glass = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
    const night = new THREE.Color(lived ? 0xffc46a : 0x1a2240), day = new THREE.Color(0xffffff);
    ticking.push({ group: null, tick: (_dt, c) => glass.color.copy(night).lerp(day, daylight(c.hour)) });
    frontGlasses.set(lived, glass);
  }
  return frontGlasses.get(lived);
}
function plaque(text) {
  const tex = canvasTexture(`plaque-${text}`, 128, 128, (g, W, H) => {
    g.fillStyle = '#f6f1e4', g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2a3a4a', g.lineWidth = 8, g.strokeRect(6, 6, W - 12, H - 12);
    g.fillStyle = '#2a3a4a', g.font = 'bold 76px system-ui, sans-serif', g.textAlign = 'center', g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 4);
  }, { repeat: false });
  return planeMesh(0.28, 0.28, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
}
function houseFront(group, f, z0, r, street) {
  const parts = [];
  const add = (m) => (group.add(m), parts.push(m), m);
  const storey = 2.8, h = storey * f.storeys + 0.3, depth = 6;
  // Brick for every other house, painted render (the house's own colour inside) for the rest; the flat's block brick.
  let wallMat;
  // Round 16: a seeded town says which (`look.brick`) and the roof's colour (`look.roof`).
  if (f.flat || (f.look?.brick ?? f.no % 2)) {
    const map = canvasTexture('brick', 256, 256, brickPainter).clone();
    map.needsUpdate = true;
    map.repeat.set(f.width / 0.9, h / 0.6);
    wallMat = new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  } else wallMat = mat(f.look?.feature ?? 0xe8e0d0, { roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(f.width, h, depth), wallMat);
  body.position.set(f.x, h / 2, z0 - depth / 2);
  body.castShadow = body.receiveShadow = true;
  body.userData.front = f.id;
  group.add(body);
  parts.body = body;
  const roofMat = mat(ROOFS[(f.look?.roof ?? f.no) % ROOFS.length], { roughness: 0.85 });
  if (f.flat) {
    // A flat roof with a parapet, and a sign over the entrance.
    add(boxMesh(f.width + 0.2, 0.4, depth + 0.2, f.x, h + 0.2, z0 - depth / 2, roofMat));
  } else {
    // A pitched roof: a triangle across the depth, run along the front (overhanging a little at each end).
    const s = new THREE.Shape();
    s.moveTo(-0.35, 0), s.lineTo(depth + 0.35, 0), s.lineTo(depth / 2, 2.3), s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: f.width + 0.4, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-(f.width + 0.4) / 2, 0, 0);
    const roof = new THREE.Mesh(geo, roofMat);
    roof.position.set(f.x, h, z0);
    roof.castShadow = true;
    group.add(roof);
    // A chimney.
    add(boxMesh(0.6, 1.4, 0.6, f.x + f.width * 0.3, h + 1.6, z0 - depth * 0.6, mat(0x9a6a5a)));
  }
  // The door is world.mjs's (Door_1, at x − width/2 + 1.3). Over it a little canopy, beside it the number.
  const doorX = f.x - f.width / 2 + 1.3;
  add(boxMesh(1.5, 0.08, 0.6, doorX, 2.35, z0 + 0.3, roofMat));
  const num = add(plaque(String(f.no)));
  num.position.set(doorX + 0.85, 1.75, z0 + 0.012);
  add(boxMesh(1.3, 0.12, 0.5, doorX, 0.06, z0 + 0.25, mat(0xb0a898, { roughness: 0.9 })));
  // Windows: the ground floor's right of the door, every floor above along the front.
  const glass = frontGlass(!f.sale);
  const win = (x, y, w = 1.1, hh = 1.2) => {
    const piece = windowPiece(w, hh, { outside: true });
    piece.children[0].material = glass;
    piece.position.set(x, y, z0 + 0.01);
    add(piece);
  };
  for (let x = doorX + 2.2; x < f.x + f.width / 2 - 0.8; x += 2.2) win(x, 1.45);
  for (let k = 1; k < f.storeys; k++) for (let x = f.x - f.width / 2 + 1.3; x < f.x + f.width / 2 - 0.6; x += 2.2) win(x, k * storey + 1.45);
  // The front garden: a path to the pavement, a flower bed under the window.
  group.add(ground('paving', 1.3, 2.2, doorX, z0 + 1.1, -0.02));
  flowerBed(group, (doorX + 1.0 + f.x + f.width / 2 - 0.3) / 2, z0 + 0.45, Math.max(1, f.x + f.width / 2 - 0.3 - doorX - 1.0), 0.45, 0, 40 + f.no);
  // Every house has its board, shown while it is for sale (the page's: one bought comes down, one sold goes up).
  if (!f.flat) {
    parts.sign = saleSign(street);
    parts.sign.position.set(f.x + f.width / 2 - 1.0, 0, z0 + 1.6);
    parts.sign.visible = f.sale;
    group.add(parts.sign);
  }
  if (f.flat) {
    const board = canvasTexture(`flatsSign-${street}`, 512, 96, (g, W, H) => {
      g.fillStyle = '#2f4a5a', g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff', g.font = '600 52px system-ui, sans-serif', g.textAlign = 'center', g.textBaseline = 'middle';
      g.font = `600 ${street.length > 12 ? 44 : 52}px system-ui, sans-serif`;
      g.fillText(`${street} Flats`, W / 2, H / 2 + 3);
    }, { repeat: false });
    add(planeMesh(2.6, 0.5, new THREE.MeshStandardMaterial({ map: board, roughness: 0.6 }), f.x + 0.8, 2.55, z0 + 0.012));
  }
  return parts;
}
// A name board over a house, drawn again when what it says changes.
export function streetLabel() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 96;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
  sprite.scale.set(4.4, 0.66, 1);
  sprite.renderOrder = 10;
  let last = '';
  return {
    sprite,
    set(text, colour = '#2f6b4f') {
      if (text + colour === last) return;
      last = text + colour;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.font = '600 46px system-ui, sans-serif';
      const w = Math.min(c.width - 16, g.measureText(text).width + 56);
      g.fillStyle = colour;
      g.beginPath();
      g.roundRect((c.width - w) / 2, 8, w, 80, 40);
      g.fill();
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, c.width / 2, 50, c.width - 60);
      tex.needsUpdate = true;
    }
  };
}
// Balloons tied to a gatepost: a house having a party.
function gateBalloons(seed) {
  const g = new THREE.Group();
  const r = rand(seed);
  const colours = [0xe8484a, 0xf2c94c, 0x4a90e2, 0x7ed36a, 0xf08ac0, 0x9a6ad8];
  const lines = [];
  g.add(boxMesh(0.1, 1.0, 0.1, 0, 0.5, 0, mat(0xf2efe8)));
  for (let k = 0; k < 6; k++) {
    const top = new THREE.Vector3((r() - 0.5) * 0.7, 1.9 + r() * 0.6, (r() - 0.5) * 0.5);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ color: colours[k % colours.length], roughness: 0.25 }));
    b.position.copy(top);
    b.castShadow = true;
    g.add(b);
    lines.push(top.x, top.y - 0.24, top.z, 0, 1.0, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xdddddd })));
  g.visible = false;
  return g;
}
export async function dressStreet(group, furnish, S, { w, d, fronts, name = 'Sunny Lane' }) {
  if (!DOM) return { fade: [], labels: new Map(), balloons: new Map(), signs: new Map(), hits: [] };
  const z0 = -d / 2, r = rand(57);
  // The ground: grass everywhere, the front pavement, the road and its lines, the far pavement.
  group.add(ground('grass', w + 120, 140, 0, 0, -0.03));
  group.add(ground('paving', w + 60, 2.2, 0, z0 + 3.1, -0.018));
  group.add(ground('asphalt', w + 120, 6, 0, z0 + 7.2, -0.022));
  const lines = new THREE.Mesh(new THREE.PlaneGeometry(w + 120, 0.14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f0e6, roughness: 0.8, transparent: true }));
  lines.material.map = canvasTexture('dashesX', 64, 8, (c) => ((c.fillStyle = '#fff'), c.fillRect(0, 0, 32, 8)));
  lines.material.map.repeat.set((w + 120) / 3, 1);
  lines.material.alphaMap = lines.material.map;
  lines.position.set(0, -0.015, z0 + 7.2);
  group.add(lines);
  group.add(ground('paving', w + 60, 2.2, 0, z0 + 11.3, -0.018));
  // Kerbs along both pavements.
  const kerb = mat(0xb8b2a6, { roughness: 0.9 });
  for (const z of [z0 + 4.2, z0 + 10.2]) group.add(boxMesh(w + 60, 0.08, 0.16, 0, 0.0, z, kerb));
  const looked = [];
  const labels = new Map(), balloons = new Map(), signs = new Map(), hits = [];
  for (const f of fronts) {
    const parts = houseFront(group, f, z0, r, name);
    looked.push(...parts);
    const label = streetLabel();
    label.sprite.position.set(f.x, 2.8 * f.storeys + 0.9, z0 + 0.6);
    label.sprite.userData.front = f.id;
    hits.push(parts.body, label.sprite);
    if (parts.sign) signs.set(f.id, parts.sign);
    group.add(label.sprite);
    labels.set(f.id, label);
    const b = gateBalloons(f.no * 13);
    b.position.set(f.x - f.width / 2 + 2.3, 0, z0 + 2.0);
    group.add(b);
    balloons.set(f.id, b);
  }
  bake(group, [{ userData: { decor: looked } }]);
  // Beyond the far pavement: a low hedge, trees, and the backs of the houses of the next street.
  const P = [];
  for (let x = -w / 2 - 10; x <= w / 2 + 10; x += 1.4) P.push([S('Bush_1'), x + (r() - 0.5) * 0.2, -z0 + 6.0 + (r() - 0.5) * 0.2, r() * 6, 1.1 + r() * 0.3]);
  for (let x = -w / 2; x <= w / 2; x += 9 + r() * 4) P.push([S(['CommonTree_1', 'CommonTree_3', 'BirchTree_1'][Math.floor(r() * 3)]), x, -z0 + 8.5 + r() * 2, r() * 6, 5.5 + r() * 1.5]);
  // Trees behind the houses, their tops over the roofs.
  for (let x = -w / 2; x <= w / 2; x += 7 + r() * 5) P.push([S(['CommonTree_2', 'PineTree_1', 'CommonTree_4'][Math.floor(r() * 3)]), x, z0 - 9 - r() * 3, r() * 6, 8 + r() * 2]);
  // `hits`: a click on a house's front or its name board is a click on its door (the page's).
  return { fade: await scenery(group, furnish, P), labels, balloons, signs, hits };
}

// ---- the weather (round 16, phase 3.4; game/weather.mjs says which, and its `look`) ----
// Rain or snow falling round where the camera looks, and snow lying on the ground. One draw call for what falls: the
// drops are points whose place the vertex shader works out from the time (no work on the CPU each frame), fixed in the
// world as they fall so they don't slide with the camera, and wrapped into a box round the view. One more for the snow
// on the ground. Outdoors only (the page says where: the park, the street).
export function weatherLook() {
  if (!DOM) return null;
  const N = 1400;
  const r = rand(11);
  const seeds = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) seeds[i] = r();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  const uniforms = {
    time: { value: 0 }, centre: { value: new THREE.Vector3() }, box: { value: new THREE.Vector3(34, 12, 34) },
    fall: { value: 9 }, sway: { value: 0 }, size: { value: 1 }, most: { value: 18 }, streak: { value: 1 }, colour: { value: new THREE.Color(0xcfd8e6) }, opacity: { value: 0.55 }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: `uniform float time, fall, sway, size, most; uniform vec3 centre, box;
      void main() {
        vec3 s = position * box;
        vec3 t = s + vec3(sin(time * 0.8 + position.y * 30.0) * sway, -time * fall, cos(time * 0.6 + position.x * 30.0) * sway);
        vec3 lo = centre - box * 0.5;
        vec3 w = lo + mod(t - lo, box);
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        // Not too big up close (a drop on the lens), and none right in front of the camera.
        gl_PointSize = -mv.z < 2.5 ? 0.0 : min(size * 260.0 / -mv.z, most);
      }`,
    fragmentShader: `uniform float streak, opacity; uniform vec3 colour;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = streak > 0.5 ? step(abs(c.x), 0.04) * (0.3 + 0.7 * (0.5 - c.y)) : smoothstep(0.5, 0.15, length(c));
        if (a < 0.02) discard;
        gl_FragColor = vec4(colour, a * opacity);
        #include <colorspace_fragment>
      }`
  });
  const falling = new THREE.Points(geo, material);
  falling.frustumCulled = false;
  falling.renderOrder = 5;
  falling.visible = false;
  // Snow on the ground: a white sheet just above the paths (the pond freezes over under it). The cheapest lit material,
  // and no shadows of its own (the tablet: it covers the whole screen); the shadows on the grass show through it.
  const cover = new THREE.Mesh(new THREE.CircleGeometry(70, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf4f7fb, transparent: true, opacity: 0.7, depthWrite: false }));
  cover.position.y = 0.009;
  cover.visible = false;
  const group = new THREE.Group();
  group.name = 'weather';
  group.add(falling, cover);
  let falls = null;
  return {
    group,
    // `look`: weather.mjs's; `outdoors`: the view is the park or the street.
    set(look, outdoors) {
      falls = look?.falls ?? null;
      falling.visible = outdoors && !!falls;
      cover.visible = outdoors && falls === 'snow';
      if (falls === 'rain') Object.assign(uniforms.fall, { value: 11 }), (uniforms.sway.value = 0.05), (uniforms.size.value = 1.6), (uniforms.most.value = 16), (uniforms.streak.value = 1), uniforms.colour.value.set(0xc9d4e3), (uniforms.opacity.value = 0.5);
      if (falls === 'snow') (uniforms.fall.value = 1.1), (uniforms.sway.value = 0.6), (uniforms.size.value = 0.55), (uniforms.most.value = 7), (uniforms.streak.value = 0), uniforms.colour.value.set(0xffffff), (uniforms.opacity.value = 0.9);
    },
    // Every frame: `at` is where the camera looks (the box goes with it).
    tick(dt, at) {
      if (!falling.visible) return;
      uniforms.time.value += dt;
      uniforms.centre.value.set(at.x, uniforms.box.value.y / 2, at.z);
      cover.position.x = at.x, cover.position.z = at.z;
    }
  };
}
// A grey sky for cloud and rain: the sky's colours (makeSky's uniforms, after its update) toward grey by `k` (0 to 1;
// the page scales it by the daylight, so a cloudy night stays dark), and the stars behind the clouds (`cloud`).
const GREY_TOP = new THREE.Color(0x8d96a3), GREY_LOW = new THREE.Color(0xb7bdc4);
export function greySky(uniforms, k, cloud = k) {
  uniforms.stars.value *= 1 - cloud;
  uniforms.glow.value *= 1 - cloud;
  if (!k) return;
  uniforms.top.value.lerp(GREY_TOP, k);
  uniforms.horizon.value.lerp(GREY_LOW, k);
  uniforms.below.value.lerp(GREY_LOW, k);
}
// A snowman (round 16, phase 3.4: built in the park in the snow), about a metre tall.
export function snowman() {
  const g = new THREE.Group();
  const snow = mat(0xf7f9fc, { roughness: 0.85 });
  for (const [r, y] of [[0.32, 0.28], [0.23, 0.7], [0.16, 1.0]]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), snow);
    ball.position.y = y;
    ball.castShadow = true;
    g.add(ball);
  }
  const coal = mat(0x202020);
  for (const x of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), coal);
    eye.position.set(x, 1.04, 0.145);
    g.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 8).rotateX(Math.PI / 2), mat(0xe87a2a));
  nose.position.set(0, 1.0, 0.2);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 20).rotateX(Math.PI / 2), mat(0xc23b3b, { roughness: 0.95 }));
  scarf.position.y = 0.86;
  g.add(nose, scarf);
  return g;
}

