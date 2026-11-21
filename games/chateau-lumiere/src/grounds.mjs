// The grounds (round 3): out of the Grand Hall's front doors, open from the start. The Gardens are the hub, under the
// open sky: the château's front behind her, hedges round, gravel paths, a fountain, lamps; night and moonlight while
// cursed, a sunny morning once both its places are won. Two doors: the Rose Garden (west, an arch of roses in the
// hedge: Basile the gnome's flower beds) and the Stables (east: Étoile the pegasus foal).
// The Rose Garden is an outdoor room: buildRoom with `outdoor`, which draws grass, sky and hedges in place of a shell.
// Built from castle.mjs's parts (`kit`); the places add themselves with addPlaces / addRooms.
import * as THREE from 'three';
import { kit, addPlaces, addRooms } from './castle.mjs';
import { canvasTexture, glow, dotTexture } from './look.mjs';
import { makeGnome, makePegasus } from './friends.mjs';

const { TAU, lerp, rand, tex, Mood, commonMats, motes, lighting, mist, box, sphere, cyl, potionTable, makeHub, stone, stoneBump } = kit;

// ---------- textures ----------
const grass = () =>
  tex('grass', () =>
    canvasTexture(256, 256, (g, w) => {
      g.fillStyle = '#5a9a4a';
      g.fillRect(0, 0, w, w);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `hsl(${95 + rand() * 30}, ${40 + rand() * 25}%, ${28 + rand() * 30}%)`;
        g.fillRect(rand() * w, rand() * w, 1 + rand() * 2, 2 + rand() * 4);
      }
      for (let i = 0; i < 30; i++) {
        g.fillStyle = ['#ffffff', '#ffe14a', '#ffb3d1'][i % 3];
        g.beginPath();
        g.arc(rand() * w, rand() * w, 1.5, 0, TAU);
        g.fill();
      }
    }, { repeat: [8, 8] })
  );
const gravel = () =>
  tex('gravel', () =>
    canvasTexture(128, 128, (g, w) => {
      g.fillStyle = '#d8ccb4';
      g.fillRect(0, 0, w, w);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `hsl(${30 + rand() * 20}, ${10 + rand() * 15}%, ${55 + rand() * 30}%)`;
        g.beginPath();
        g.arc(rand() * w, rand() * w, 0.8 + rand() * 1.8, 0, TAU);
        g.fill();
      }
    }, { repeat: [1, 6] })
  );
const leaves = () =>
  tex('leaves', () =>
    canvasTexture(256, 256, (g, w) => {
      g.fillStyle = '#2f6a34';
      g.fillRect(0, 0, w, w);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = `hsl(${100 + rand() * 30}, ${35 + rand() * 25}%, ${20 + rand() * 28}%)`;
        g.beginPath();
        g.ellipse(rand() * w, rand() * w, 2 + rand() * 4, 1.5 + rand() * 2.5, rand() * 3, 0, TAU);
        g.fill();
      }
    }, { repeat: [4, 1] })
  );
const planks = () =>
  tex('planks', () =>
    canvasTexture(256, 256, (g, w) => {
      const n = 8, pw = w / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = `hsl(${24 + rand() * 8}, ${35 + rand() * 15}%, ${34 + rand() * 12}%)`;
        g.fillRect(i * pw, 0, pw, w);
        for (let k = 0; k < 30; k++) {
          g.fillStyle = `rgba(${rand() < 0.5 ? '40,20,10' : '200,150,100'},${0.06 + rand() * 0.08})`;
          g.fillRect(i * pw + rand() * pw, 0, 1, w);
        }
        g.fillStyle = 'rgba(30,15,5,0.6)';
        g.fillRect(i * pw, 0, 2, w);
        g.fillStyle = 'rgba(60,40,30,0.8)';
        g.beginPath();
        g.arc(i * pw + pw / 2, 20 + rand() * 30, 2, 0, TAU);
        g.arc(i * pw + pw / 2, w - 30 - rand() * 30, 2, 0, TAU);
        g.fill();
      }
    }, { repeat: [5, 1] })
  );
const straw = () =>
  tex('straw', () =>
    canvasTexture(256, 256, (g, w) => {
      g.fillStyle = '#c8a860';
      g.fillRect(0, 0, w, w);
      for (let i = 0; i < 1600; i++) {
        g.strokeStyle = `hsl(${40 + rand() * 12}, ${50 + rand() * 25}%, ${45 + rand() * 30}%)`;
        g.lineWidth = 1 + rand();
        const x = rand() * w, y = rand() * w, a = rand() * TAU, l = 6 + rand() * 14;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
    }, { repeat: [4, 4] })
  );

// ---------- the open air ----------
// The sky: a dome shaded from the horizon up (violet night or blue morning), stars and a moon that fade as the place
// is won, a sun that rises. Drawn without fog, behind everything.
function sky(mood, scene) {
  const top = new THREE.Color(), bottom = new THREE.Color();
  const N = [new THREE.Color(0x0a0a2e), new THREE.Color(0x4a2a7a)], DAY = [new THREE.Color(0x3f8ae0), new THREE.Color(0xdcefff)];
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: top }, bottom: { value: bottom } },
    vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main() { float k = smoothstep(-0.05, 0.55, vP.y); gl_FragColor = vec4(mix(bottom, top, k), 1.0); \n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), mat);
  dome.renderOrder = -2;
  scene.add(dome);
  const pos = [];
  for (let i = 0; i < 500; i++) {
    const a = rand() * TAU, e = 0.08 + rand() * 1.3;
    pos.push(Math.cos(a) * Math.cos(e) * 80, Math.sin(e) * 80, Math.sin(a) * Math.cos(e) * 80);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xfff4d8, size: 0.55, map: dotTexture(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(starGeo, starMat));
  const moon = new THREE.Mesh(new THREE.CircleGeometry(4.2, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4dc).multiplyScalar(1.6), toneMapped: false, transparent: true, fog: false }));
  moon.position.set(-30, 32, -70);
  moon.lookAt(0, 0, 0);
  scene.add(moon);
  const moonGlow = glow(0xb8b0ff, 22, 0.8);
  moonGlow.material.fog = false;
  moonGlow.position.copy(moon.position);
  scene.add(moonGlow);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(4.6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c0).multiplyScalar(1.8), toneMapped: false, transparent: true, fog: false }));
  sun.position.set(40, 30, 60);
  sun.lookAt(0, 0, 0);
  scene.add(sun);
  mood.on((f) => {
    top.copy(N[0]).lerp(DAY[0], f);
    bottom.copy(N[1]).lerp(DAY[1], f);
    starMat.opacity = 1 - f;
    moon.material.opacity = moonGlow.material.opacity = 1 - f;
    sun.material.opacity = f;
    sun.visible = f > 0.02;
  });
}
function ground(mood, scene, w, d) {
  const t = grass().clone();
  t.repeat.set(w / 2.5, d / 2.5);
  t.needsUpdate = true;
  const g = new THREE.Mesh(new THREE.PlaneGeometry(w + 40, d + 40).rotateX(-Math.PI / 2), mood.mat({ dark: 0x2a3a3a, bright: 0xffffff, map: t, roughness: 0.95 }));
  g.receiveShadow = true;
  g.name = 'floor';
  scene.add(g);
}
// A clipped hedge from (x1, z1) to (x2, z2), `h` tall, a metre thick.
function hedge(mood, scene, x1, z1, x2, z2, h = 2.8) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const t = leaves().clone();
  t.repeat.set(len / 2.5, h / 2.5);
  t.needsUpdate = true;
  const m = box(len, h, 1, mood.mat({ dark: 0x1e2e30, bright: 0xffffff, map: t, roughness: 0.95 }), (x1 + x2) / 2, h / 2, (z1 + z2) / 2, scene);
  m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  // A rounded top.
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, len, 10, 1).rotateZ(Math.PI / 2), m.material);
  top.position.set((x1 + x2) / 2, h, (z1 + z2) / 2);
  top.rotation.y = m.rotation.y;
  scene.add(top);
  return m;
}
// Hedges all round a w × d plot, leaving gaps (each { side: 'n'|'s'|'w'|'e', at, width }) for gates and doors.
function hedgesRound(mood, scene, w, d, gaps = []) {
  const sides = { n: [[-w / 2, -d / 2 - 0.5], [w / 2, -d / 2 - 0.5]], s: [[-w / 2, d / 2 + 0.5], [w / 2, d / 2 + 0.5]], w: [[-w / 2 - 0.5, -d / 2 - 1], [-w / 2 - 0.5, d / 2 + 1]], e: [[w / 2 + 0.5, -d / 2 - 1], [w / 2 + 0.5, d / 2 + 1]] };
  for (const [side, [[x1, z1], [x2, z2]]] of Object.entries(sides)) {
    const along = side === 'n' || side === 's' ? 'x' : 'z';
    const lo = along === 'x' ? x1 : z1, hi = along === 'x' ? x2 : z2;
    const cuts = gaps.filter((g) => g.side === side).map((g) => [g.at - g.width / 2, g.at + g.width / 2]).sort((a, b) => a[0] - b[0]);
    let from = lo;
    for (const [a, b] of [...cuts, [hi, hi]]) {
      if (a - from > 0.1) along === 'x' ? hedge(mood, scene, from, z1, a, z2) : hedge(mood, scene, x1, from, x2, a);
      from = b;
    }
  }
}
// A lamp on a post: witch-green while cursed, warm once won (no light of its own: the glow and the bloom do it).
function lamp(mood, M, scene, updates, x, z, h = 2.6) {
  const post = cyl(0.05, 0.07, h, M.darkWood, x, h / 2, z, scene, 8);
  void post;
  box(0.26, 0.04, 0.26, M.gold, x, h + 0.02, z, scene);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  globe.position.set(x, h + 0.2, z);
  scene.add(globe);
  const halo = glow(0xffffff, 1.0, 1);
  halo.position.copy(globe.position);
  scene.add(halo);
  const witch = new THREE.Color(0x4dffc0), warm = new THREE.Color(0xffd08a);
  mood.on((f) => {
    globe.material.color.copy(witch).lerp(warm, f).multiplyScalar(lerp(1.6, 1.3, f));
    halo.material.color.copy(witch).lerp(warm, f).multiplyScalar(lerp(0.9, 0.35, f));
  });
  updates.push((dt, t, f) => halo.scale.setScalar(1 + Math.sin(t * 2 + x) * 0.06 * (1 - f)));
}
// A topiary in a stone pot: a ball, a cone or a spiral of three balls.
function topiary(mood, M, scene, x, z, kind = 'ball') {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  cyl(0.32, 0.25, 0.5, M.cream, 0, 0.25, 0, g, 14);
  const leaf = mood.mat({ dark: 0x1e2e28, bright: 0x3f8a3a, roughness: 0.9, flat: true });
  if (kind === 'cone') {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.4, 10), leaf);
    c.position.y = 1.2;
    c.castShadow = true;
    g.add(c);
  } else
    for (const [y, r] of kind === 'ball' ? [[1.0, 0.45]] : [[0.85, 0.36], [1.45, 0.28], [1.9, 0.2]]) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaf);
      b.position.y = y;
      b.castShadow = true;
      g.add(b);
    }
  scene.add(g);
  return g;
}
// A rose bush, straight on the ground: grey and thorny in the dark, in bloom once won.
function roseBush(mood, scene, x, z, colour = 0xff6f9a, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  const leaf = mood.mat({ dark: 0x1e2a24, bright: 0x3f8a4a, roughness: 0.85, flat: true });
  const bloom = mood.mat({ dark: 0x2a2630, bright: colour, roughness: 0.55, emissive: [0, colour], ei: [0, 0.12], flat: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), leaf);
    b.position.set(Math.cos(a) * 0.22, 0.3 + (i % 3) * 0.14, Math.sin(a) * 0.22);
    b.castShadow = true;
    g.add(b);
    const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 1), bloom);
    r.position.set(Math.cos(a) * 0.38, 0.42 + (i % 3) * 0.16, Math.sin(a) * 0.38);
    g.add(r);
  }
  scene.add(g);
  return g;
}
// Brambles: thorny loops over the ground in the dark, gone as the light reaches them.
function brambles(mood, scene, spots) {
  const m = mood.mat({ dark: 0x1c2a1e, bright: 0x2e5a34, roughness: 0.8 });
  for (const [x, z, n] of spots)
    for (let i = 0; i < n; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.3 + rand() * 0.35, 0.035, 5, 12, Math.PI * (1 + rand())), m);
      t.position.set(x + (rand() - 0.5) * 1.4, 0.2 + rand() * 0.5, z + (rand() - 0.5) * 1.4);
      t.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      scene.add(t);
      mood.item(t.position, (f) => {
        t.scale.setScalar(Math.max(0.01, 1 - f));
        t.visible = f < 0.98;
      });
    }
}
// A fountain: a round basin, a column with two bowls, water that sparkles and leaps once won.
function fountain(mood, M, scene, updates, x, z, r = 1.6) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const stoneM = mood.mat({ dark: 0x4a4a58, bright: 0xece4d8, roughness: 0.6 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.16, 10, 48), stoneM);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.5;
  g.add(rim);
  cyl(r, r + 0.05, 0.45, stoneM, 0, 0.225, 0, g, 40);
  const water = mood.mat({ dark: 0x1a2440, bright: 0x6ac0f0, roughness: 0.1, metalness: 0.2, emissive: [0x0a1030, 0x2a80c0], ei: [0.6, 0.35] });
  const surf = new THREE.Mesh(new THREE.CircleGeometry(r - 0.05, 40).rotateX(-Math.PI / 2), water);
  surf.position.y = 0.46;
  g.add(surf);
  cyl(0.14, 0.2, 1.4, stoneM, 0, 0.9, 0, g, 16);
  for (const [y, br] of [[1.0, 0.7], [1.65, 0.38]]) {
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(br, 24, 8, 0, TAU, Math.PI / 2, Math.PI / 2), stoneM);
    bowl.position.y = y + br * 0.5;
    g.add(bowl);
    const ws = new THREE.Mesh(new THREE.CircleGeometry(br * 0.95, 24).rotateX(-Math.PI / 2), water);
    ws.position.y = y + br * 0.48;
    g.add(ws);
  }
  sphere(0.1, M.gold, 0, 2.05, 0, g, 12);
  // The spray: points thrown up from the top and falling back into the bowls.
  const n = 160, drops = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) vel.push({ t: rand() * 1.4, a: rand() * TAU, s: 0.4 + rand() * 0.6 });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(drops, 3));
  const dm = new THREE.PointsMaterial({ color: 0xd8f0ff, size: 0.07, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const pts = new THREE.Points(geo, dm);
  pts.frustumCulled = false;
  g.add(pts);
  updates.push((dt, t, f) => {
    dm.opacity = 0.9 * f;
    if (f < 0.05) return;
    for (let i = 0; i < n; i++) {
      const v = vel[i];
      v.t = (v.t + dt) % 1.4;
      const k = v.t;
      drops[i * 3] = Math.cos(v.a) * v.s * k * 0.9;
      drops[i * 3 + 1] = 2.1 + 2.2 * k - 4.4 * k * k * 0.9;
      drops[i * 3 + 2] = Math.sin(v.a) * v.s * k * 0.9;
    }
    geo.attributes.position.needsUpdate = true;
  });
  scene.add(g);
  return g;
}
// The open-air dressing shared by the Gardens and the Rose Garden: the sky, the grass, the hedges round.
function outdoors({ scene, mood, W, D }, gaps) {
  sky(mood, scene);
  ground(mood, scene, W, D);
  hedgesRound(mood, scene, W, D, gaps);
}

// ── The Gardens (the hub) ─────────────────────────────────────────────────────────────────────────────────────────
function buildGarden() {
  const scene = new THREE.Scene();
  const mood = new Mood(scene);
  const M = commonMats(mood);
  const W = 18, D = 16, H = 9;
  mood.fog({ color: 0x14102a, density: 0.03 }, { color: 0xd8e8f4, density: 0.006 });
  mood.env = [0.14, 0.35];
  outdoors({ scene, mood, W, D }, [{ side: 'w', at: 0, width: 2.6 }, { side: 'e', at: 0, width: 30 }, { side: 'n', at: 0, width: 40 }]);
  lighting(mood, { sunFrom: [8, 12, 9], shadowBox: 12, ghost: [0, 2.5, 0] });
  const blockers = [], updates = [];
  // The château's front along the north side: dressed stone, tall windows lit from inside, a balustrade on top, two
  // round towers with slate cones at the corners, and the front doors in the middle.
  const [wallMap, wallBump] = [stone(), stoneBump()].map((t) => {
    const c = t.clone();
    c.repeat.set(5, 2.5);
    c.needsUpdate = true;
    return c;
  });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, 9), mood.mat({ dark: 0x3c3f52, bright: 0xf0e4d4, map: wallMap, bumpMap: wallBump, bumpScale: 1.5, roughness: 0.9 }));
  front.position.set(0, 4.5, -D / 2);
  front.receiveShadow = true;
  scene.add(front);
  box(W + 6, 0.3, 0.5, M.cream, 0, 9.1, -D / 2 + 0.1, scene);
  for (let x = -W / 2 - 2.8; x < W / 2 + 3; x += 0.4) cyl(0.06, 0.08, 0.6, M.cream, x, 9.5, -D / 2 + 0.1, scene, 6);
  box(W + 6, 0.12, 0.3, M.cream, 0, 9.85, -D / 2 + 0.1, scene);
  const pane = mood.mat({ dark: 0x1a1430, bright: 0xffe8b0, emissive: [0x7a3cff, 0xffc870], ei: [0.6, 0.5], roughness: 0.3 });
  for (const x of [-6.5, -3.6, 3.6, 6.5])
    for (const y of [1.4, 5.4]) {
      box(1.3, 2.4, 0.08, pane, x, y + 1.2, -D / 2 + 0.05, scene);
      box(1.5, 0.12, 0.2, M.cream, x, y - 0.02, -D / 2 + 0.1, scene);
      box(0.08, 2.4, 0.1, M.cream, x, y + 1.2, -D / 2 + 0.1, scene);
      box(1.3, 0.06, 0.1, M.cream, x, y + 1.5, -D / 2 + 0.1, scene);
    }
  const slate = mood.mat({ dark: 0x2a2a44, bright: 0x4a5a9a, roughness: 0.6 });
  for (const x of [-W / 2 - 1.2, W / 2 + 1.2]) {
    const tw = cyl(1.8, 1.9, 12, mood.mat({ dark: 0x3c3f52, bright: 0xf0e4d4, map: wallMap, roughness: 0.9 }), x, 6, -D / 2 - 0.4, scene, 28);
    void tw;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 28), slate);
    cone.position.set(x, 14.5, -D / 2 - 0.4);
    scene.add(cone);
    const flag = box(0.9, 0.5, 0.02, mood.mat({ dark: 0x3a2a4a, bright: 0xe0408a }), x + 0.5, 17.4, -D / 2 - 0.4, scene);
    cyl(0.03, 0.03, 1.4, M.gold, x, 17.3, -D / 2 - 0.4, scene, 6);
    updates.push((dt, t) => (flag.rotation.y = Math.sin(t * 2 + x) * 0.3));
    box(1.0, 1.8, 0.1, pane, x, 7.5, -D / 2 + 1.42, scene);
  }
  blockers.push({ minX: -W / 2 - 3.2, maxX: -W / 2 + 0.7, minZ: -D / 2 - 2.4, maxZ: -D / 2 + 1.6 }, { minX: W / 2 - 0.7, maxX: W / 2 + 3.2, minZ: -D / 2 - 2.4, maxZ: -D / 2 + 1.6 });
  // Steps up to the front doors.
  for (let i = 0; i < 3; i++) box(4.2 - i * 0.4, 0.12, 0.5, M.cream, 0, 0.06 + i * 0.12, -D / 2 + 1.5 - i * 0.45, scene);
  // The Stables, along the east side: a timber front with a red-tiled roof and a weather vane.
  const timber = planks().clone();
  timber.repeat.set(3, 1);
  timber.needsUpdate = true;
  const stableWall = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.2), mood.mat({ dark: 0x3a3236, bright: 0xffffff, map: timber, roughness: 0.85 }));
  stableWall.position.set(W / 2 + 0.02, 2.1, 0);
  stableWall.rotation.y = -Math.PI / 2;
  scene.add(stableWall);
  const roofM = mood.mat({ dark: 0x3a2a30, bright: 0xb84a3a, roughness: 0.7 });
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 8.4, 3, 1), roofM);
  roof.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  roof.scale.set(1, 1, 0.7);
  roof.position.set(W / 2 + 1.8, 4.9, 0);
  scene.add(roof);
  for (const [z, ry] of [[-4, 0], [4, Math.PI]]) {
    const end = hedge(mood, scene, W / 2, z, W / 2 + 4, z, 4.2);
    void end;
    void ry;
  }
  cyl(0.02, 0.02, 1.0, M.gold, W / 2 + 1.8, 6.9, 0, scene, 6);
  const vane = box(0.5, 0.2, 0.02, M.gold, W / 2 + 1.8, 7.3, 0, scene);
  updates.push((dt, t) => (vane.rotation.y = Math.sin(t * 0.3) * 1.2));
  // A horseshoe over the stable door, a hay bale or two beside it.
  const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 16, Math.PI * 1.4), M.gold);
  shoe.position.set(W / 2 - 0.05, 3.85, 0);
  shoe.rotation.set(0, -Math.PI / 2, -Math.PI * 0.2 + Math.PI);
  scene.add(shoe);
  const strawM = mood.mat({ dark: 0x4a4436, bright: 0xffffff, map: straw(), roughness: 1 });
  for (const [z, y] of [[2.3, 0.3], [2.9, 0.3], [2.6, 0.82]]) box(1.0, 0.55, 0.55, strawM, W / 2 - 0.6, y, z, scene).rotation.y = Math.PI / 2;
  blockers.push({ minX: W / 2 - 1.2, maxX: W / 2, minZ: 1.9, maxZ: 3.3 });
  // The Rose Garden's gate in the west hedge: an arch of roses over a door.
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 8, 24, Math.PI), mood.mat({ dark: 0x1e2e28, bright: 0x3f8a3a, roughness: 0.9 }));
  arch.position.set(-W / 2 - 0.4, 3.3, 0);
  arch.rotation.y = Math.PI / 2;
  scene.add(arch);
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI;
    sphere(0.12, mood.mat({ dark: 0x2a2630, bright: [0xff6f9a, 0xffd0e0, 0xff9ab8][i % 3], roughness: 0.6 }), -W / 2 - 0.25, 3.3 + Math.sin(a) * 1.5, Math.cos(a) * 1.5, scene, 10);
  }
  for (const s of [-1, 1]) cyl(0.12, 0.12, 3.3, mood.mat({ dark: 0x1e2e28, bright: 0x3f8a3a }), -W / 2 - 0.4, 1.65, s * 1.5, scene, 8);
  // Gravel paths: one from the château's doors to the south hedge, one across from gate to stable.
  const gv = mood.mat({ dark: 0x4a4a58, bright: 0xffffff, map: gravel(), roughness: 1 });
  const ns = new THREE.Mesh(new THREE.PlaneGeometry(2.4, D).rotateX(-Math.PI / 2), gv);
  ns.position.set(0, 0.01, 0);
  ns.receiveShadow = true;
  scene.add(ns);
  const gv2 = gravel().clone();
  gv2.repeat.set(6, 1);
  gv2.rotation = 0;
  gv2.needsUpdate = true;
  const ew = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.2).rotateX(-Math.PI / 2), mood.mat({ dark: 0x4a4a58, bright: 0xffffff, map: gv2, roughness: 1 }));
  ew.position.set(0, 0.012, 0);
  ew.receiveShadow = true;
  scene.add(ew);
  // The fountain in the middle of the cross, where the paths meet.
  fountain(mood, M, scene, updates, 0, 2.2, 1.5);
  blockers.push({ minX: -1.7, maxX: 1.7, minZ: 0.5, maxZ: 3.9 });
  // Lamps, topiaries, flower beds along the château, rose bushes, a bench.
  for (const [x, z] of [[-2.0, -4.2], [2.0, -4.2], [-2.0, 5.6], [2.0, 5.6], [-6.5, -1.4], [6.5, -1.4]]) {
    lamp(mood, M, scene, updates, x, z);
    blockers.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15, tall: false });
  }
  for (const [x, z, k] of [[-4.6, 5.0, 'spiral'], [4.6, 5.0, 'spiral'], [-7.4, 6.4, 'cone'], [7.4, 6.4, 'cone'], [-4.6, -4.6, 'ball'], [4.6, -4.6, 'ball']]) {
    topiary(mood, M, scene, x, z, k);
    blockers.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }
  const bedM = mood.mat({ dark: 0x2a2228, bright: 0x6a4430, roughness: 1 });
  const flowerCols = [0xff6f9a, 0xffe14a, 0xffffff, 0x8ab8ff, 0xff9a5a, 0xd89aff];
  for (const s of [-1, 1]) {
    box(5.5, 0.2, 1.0, bedM, s * 5.6, 0.1, -D / 2 + 0.9, scene);
    for (let i = 0; i < 16; i++) {
      const fx = s * 5.6 + (i / 15 - 0.5) * 5.0, fz = -D / 2 + 0.6 + (i % 2) * 0.5;
      const fm = mood.mat({ dark: 0x2a2630, bright: flowerCols[i % 6], roughness: 0.6 });
      cyl(0.012, 0.012, 0.4, mood.mat({ dark: 0x1e2a24, bright: 0x3f8a3a }), fx, 0.4, fz, scene, 4);
      sphere(0.08, fm, fx, 0.62, fz, scene, 8);
    }
    blockers.push({ minX: s * 5.6 - 2.8, maxX: s * 5.6 + 2.8, minZ: -D / 2, maxZ: -D / 2 + 1.5, tall: false });
  }
  for (const [x, z, c] of [[-7.6, 3.2, 0xff6f9a], [-7.6, -3.6, 0xffd0e0], [7.4, -3.6, 0xffe08a], [-3.2, 7.2, 0xff9ab8], [3.2, 7.2, 0xff6f9a]]) {
    roseBush(mood, scene, x, z, c);
    blockers.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5, tall: false });
  }
  brambles(mood, scene, [[-5, 2.5, 6], [5, 3.5, 6], [-2, -2, 4], [4.5, -5.5, 4], [-7, 6, 4]]);
  // Fireflies in the dark, butterflies of light in the day: the motes.
  const motesUpdate = motes(mood, scene, { w: W, d: D, h: 4, n: 160 });
  updates.push((dt, t, f) => motesUpdate(dt, t, f));
  updates.push(mist(mood, scene, { w: W, d: D, colour: 0x5a6aa0, thick: 0.7 }));
  // Potions on two stone plinths by the steps.
  const potionSpots = [potionTable(scene, M, blockers, -3.4, -5.4, 'heart'), potionTable(scene, M, blockers, 3.4, -5.4, 'star')];
  return makeHub({
    id: 'garden', scene, mood, M, W, D, H, blockers, updates, potionSpots,
    doorSpots: {
      rosegarden: { x: -W / 2 - 0.36, z: 0, ry: Math.PI / 2 },
      stables: { x: W / 2 - 0.14, z: 0, ry: -Math.PI / 2 },
      out: { x: 0, z: -D / 2 + 0.14, ry: 0, big: true }
    },
    spawn: { x: 0, z: -D / 2 + 2.7, face: 0 }
  });
}

// ── The Rose Garden ★★: two Bramble Moths → Basile the gnome and his flower beds ───────────────────────────────────
// The flower bed of the mini-game: six planting spots in a row in a raised wooden bed. For flowers.mjs:
//   plant(i, seed) shows a seedling of that seed in spot i (null clears it); grow(i) grows it into its flower
//   (resolves when open); water(i) a shower of drops; clear() empties the bed.
export const SEEDS = {
  rose: { name: 'Rose', colour: 0xff4f7a, shape: 'rose' },
  daisy: { name: 'Daisy', colour: 0xffffff, shape: 'daisy' },
  tulip: { name: 'Tulip', colour: 0xff8ac0, shape: 'tulip' },
  bluebell: { name: 'Bluebell', colour: 0x6a8aff, shape: 'bell' },
  sunflower: { name: 'Sunflower', colour: 0xffd23a, shape: 'daisy', big: true }
};
function makeFlower(seed) {
  const s = SEEDS[seed];
  const g = new THREE.Group();
  const stemM = new THREE.MeshStandardMaterial({ color: 0x3f9a4a, roughness: 0.7 });
  const petalM = new THREE.MeshStandardMaterial({ color: s.colour, roughness: 0.5, emissive: s.colour, emissiveIntensity: 0.12, side: THREE.DoubleSide });
  const h = s.big ? 0.85 : 0.5;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, h, 6), stemM);
  stem.position.y = h / 2;
  g.add(stem);
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), stemM);
    leaf.scale.set(1.4, 0.3, 0.6);
    leaf.position.set(side * 0.05, h * 0.4, 0);
    leaf.rotation.z = side * 0.5;
    g.add(leaf);
  }
  const head = new THREE.Group();
  head.position.y = h;
  g.add(head);
  if (s.shape === 'rose') {
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8, 0, Math.PI), petalM);
      const a = (i / 9) * TAU * 1.6;
      p.position.set(Math.cos(a) * (0.015 + i * 0.006), 0.02 + i * 0.004, Math.sin(a) * (0.015 + i * 0.006));
      p.rotation.y = -a;
      head.add(p);
    }
  } else if (s.shape === 'tulip') {
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10, 0, TAU, 0, Math.PI * 0.62), petalM);
    cup.rotation.x = Math.PI;
    cup.position.y = 0.07;
    head.add(cup);
  } else if (s.shape === 'bell') {
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.06, 10, 1, true), petalM);
      b.position.set(0.04 * Math.sin(i), -0.06 * i, 0.04 * Math.cos(i * 2));
      head.add(b);
    }
  } else {
    const n = s.big ? 16 : 12, r = s.big ? 0.12 : 0.07;
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 8, 6), petalM);
      const a = (i / n) * TAU;
      p.scale.set(1.2, 0.2, 0.45);
      p.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      p.rotation.y = -a;
      head.add(p);
    }
    const mid = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 12, 8), new THREE.MeshStandardMaterial({ color: s.big ? 0x6a4020 : 0xffd23a, roughness: 0.8 }));
    mid.scale.y = 0.5;
    head.add(mid);
  }
  head.rotation.x = 0.35;
  return g;
}
function flowerBed(mood, M, scene, updates, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const soil = mood.mat({ dark: 0x2a2024, bright: 0x5a3a28, roughness: 1 });
  box(3.4, 0.36, 0.8, M.wood, 0, 0.18, 0, g);
  box(3.3, 0.04, 0.7, soil, 0, 0.37, 0, g);
  scene.add(g);
  const N = 6, at = (i) => new THREE.Vector3(-1.4 + i * 0.56, 0.39, 0);
  const spots = [];
  for (let i = 0; i < N; i++) {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6, 0, TAU, 0, Math.PI / 2), soil);
    mound.scale.y = 0.4;
    mound.position.copy(at(i));
    g.add(mound);
    spots.push({ seed: null, sprout: null, flower: null, grow: 0 });
  }
  const sproutM = new THREE.MeshStandardMaterial({ color: 0x5ac85a, roughness: 0.6 });
  const dropsM = new THREE.PointsMaterial({ color: 0x9ad8ff, size: 0.05, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const showers = [];
  const growing = [];
  updates.push((dt) => {
    for (const gr of [...growing]) {
      gr.t = Math.min(1, gr.t + dt / 1.2);
      const k = 1 - Math.pow(1 - gr.t, 3);
      gr.f.scale.setScalar(Math.max(0.01, k * 1.0));
      gr.f.rotation.y = (1 - k) * 2;
      if (gr.t >= 1) {
        growing.splice(growing.indexOf(gr), 1);
        gr.res();
      }
    }
    for (const sh of [...showers]) {
      sh.t += dt;
      const p = sh.pts.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, 0.9 - ((sh.t * 1.6 + (i % 7) * 0.13) % 0.5));
      p.needsUpdate = true;
      sh.pts.material.opacity = Math.max(0, 1 - sh.t / 1.4);
      if (sh.t > 1.4) {
        sh.pts.removeFromParent();
        showers.splice(showers.indexOf(sh), 1);
      }
    }
  });
  const api = {
    slots: N,
    worldAt: (i) => g.localToWorld(at(i).clone()),
    plant(i, seed) {
      const sp = spots[i];
      sp.sprout?.removeFromParent();
      sp.flower?.removeFromParent();
      sp.sprout = sp.flower = null;
      sp.seed = seed;
      if (!seed) return;
      const sprout = new THREE.Group();
      for (const s of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), sproutM);
        l.scale.set(1.3, 0.3, 0.6);
        l.position.set(s * 0.035, 0.06, 0);
        l.rotation.z = s * 0.5;
        sprout.add(l);
      }
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.07, 5), sproutM);
      st.position.y = 0.035;
      sprout.add(st);
      // A little tag in the seed's colour, so she can see what she planted.
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.005), new THREE.MeshStandardMaterial({ color: SEEDS[seed].colour, emissive: SEEDS[seed].colour, emissiveIntensity: 0.3 }));
      tag.position.set(0.07, 0.07, 0.06);
      sprout.add(tag);
      cyl(0.003, 0.003, 0.08, M.wood, 0.07, 0.04, 0.06, sprout, 4);
      sprout.position.copy(at(i));
      g.add(sprout);
      sp.sprout = sprout;
    },
    grow(i) {
      const sp = spots[i];
      if (!sp.seed) return Promise.resolve();
      sp.sprout?.removeFromParent();
      sp.sprout = null;
      const f = makeFlower(sp.seed);
      f.position.copy(at(i));
      f.scale.setScalar(0.01);
      g.add(f);
      sp.flower = f;
      return new Promise((res) => growing.push({ f, t: 0, res }));
    },
    water(i) {
      const pos = new Float32Array(21 * 3);
      const c = at(i);
      for (let k = 0; k < 21; k++) pos.set([c.x + (rand() - 0.5) * 0.3, 0.9, c.z + (rand() - 0.5) * 0.3], k * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, dropsM.clone());
      g.add(pts);
      showers.push({ pts, t: 0 });
    },
    clear() {
      for (let i = 0; i < N; i++) api.plant(i, null);
    }
  };
  return api;
}
function furnishRoseGarden({ scene, mood, M, blockers, updates, W, D }) {
  // Rose bushes round the edges, an arbour of roses at the back with a bench, a birdbath.
  const cols = [0xff4f7a, 0xffd0e0, 0xffe08a, 0xff9ab8, 0xffffff];
  for (const [i, [x, z]] of [[-5.2, -4.4], [-3.6, -4.6], [3.8, -4.6], [5.2, -3.4], [-5.3, 1.6], [-5.3, 3.6], [5.3, 2.6], [5.0, 4.4]].entries()) {
    roseBush(mood, scene, x, z, cols[i % 5], 1.15);
    blockers.push({ minX: x - 0.55, maxX: x + 0.55, minZ: z - 0.55, maxZ: z + 0.55, tall: false });
  }
  const arbour = new THREE.Group();
  arbour.position.set(-0.6, 0, -D / 2 + 0.7);
  const green = mood.mat({ dark: 0x1e2e28, bright: 0x3f8a3a, roughness: 0.9 });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.1, 8, 24, Math.PI), green);
  arch.position.y = 2.2;
  arbour.add(arch);
  for (const s of [-1, 1]) cyl(0.1, 0.1, 2.2, green, s * 1.3, 1.1, 0, arbour, 8);
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    sphere(0.1, mood.mat({ dark: 0x2a2630, bright: cols[i % 5], roughness: 0.6 }), Math.cos(a) * 1.3, 2.2 + Math.sin(a) * 1.3, 0.08, arbour, 8);
  }
  box(1.6, 0.08, 0.45, M.wood, 0, 0.5, -0.05, arbour);
  box(1.6, 0.5, 0.06, M.wood, 0, 0.8, -0.25, arbour);
  for (const s of [-1, 1]) box(0.08, 0.5, 0.4, M.wood, s * 0.7, 0.25, -0.05, arbour);
  scene.add(arbour);
  blockers.push({ minX: -2.0, maxX: 0.8, minZ: -D / 2, maxZ: -D / 2 + 1.2 });
  const bath = new THREE.Group();
  bath.position.set(4.2, 0, 0.6);
  const stoneM = mood.mat({ dark: 0x4a4a58, bright: 0xece4d8, roughness: 0.6 });
  cyl(0.12, 0.2, 0.9, stoneM, 0, 0.45, 0, bath, 12);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 8, 0, TAU, Math.PI / 2, Math.PI / 2), stoneM);
  bowl.position.y = 1.15;
  bath.add(bowl);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2), mood.mat({ dark: 0x1a2440, bright: 0x6ac0f0, roughness: 0.1, emissive: [0x0a1030, 0x2a80c0], ei: [0.5, 0.3] }));
  water.position.y = 1.13;
  bath.add(water);
  scene.add(bath);
  blockers.push({ minX: 3.7, maxX: 4.7, minZ: 0.1, maxZ: 1.1 });
  brambles(mood, scene, [[-2.5, -1, 8], [1.5, 2, 6], [3, -3, 6], [-3.5, 3, 5]]);
  // The flower bed (the mini-game's), front right; Basile behind it once won.
  const bed = flowerBed(mood, M, scene, updates, 2.4, -D / 2 + 1.4);
  blockers.push({ minX: 0.6, maxX: 4.2, minZ: -D / 2 + 0.9, maxZ: -D / 2 + 1.9 });
  const gnome = makeGnome();
  gnome.group.position.set(1.7, 0, -D / 2 + 0.65);
  gnome.group.rotation.y = 0.77;
  gnome.group.scale.setScalar(1.6);
  scene.add(gnome.group);
  mood.item(gnome.group.position, (f) => (gnome.group.visible = f > 0.6));
  updates.push((dt, t, f) => f > 0.6 && gnome.update(dt, t));
  // She stands at the bed's near end; the camera looks along the bed from the east, so she, the seedlings and Basile
  // (behind the bed, with his can) are all in the left part of the screen, clear of the game's panel.
  const x = 3.0, z = -D / 2 + 3.35;
  return { kind: 'flowers', x, z, face: -2.47, friend: gnome, bed, view: [[5.5, 2.8, -D / 2 + 4.6], [2.6, 0.4, -D / 2 + 1.2]] };
}

// ── The Stables ★★★: two Mud Sprites → Étoile the pegasus foal and her grooming ───────────────────────────────────
function furnishStables({ scene, mood, M, blockers, updates, W, D }) {
  const strawM = mood.mat({ dark: 0x4a4436, bright: 0xffffff, map: straw(), roughness: 1 });
  // Stalls along the back wall: plank partitions, a half door each; Étoile's in the middle has a gold star on it.
  const stallM = mood.mat({ dark: 0x2e2a2c, bright: 0x9a6a44, roughness: 0.7 });
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    box(0.12, 1.6, 2.2, stallM, x, 0.8, -D / 2 + 1.1, scene);
    cyl(0.07, 0.07, 3.2, M.darkWood, x, 1.6, -D / 2 + 2.2, scene, 8);
    blockers.push({ minX: x - 0.15, maxX: x + 0.15, minZ: -D / 2, maxZ: -D / 2 + 2.3 });
  }
  box(W, 0.14, 0.14, M.darkWood, 0, 3.2, -D / 2 + 2.2, scene);
  for (const x of [-3.0, 3.0]) {
    box(2.8, 1.1, 0.08, stallM, x, 0.55, -D / 2 + 2.2, scene);
    blockers.push({ minX: x - 1.4, maxX: x + 1.4, minZ: -D / 2 + 2.0, maxZ: -D / 2 + 2.4 });
  }
  const star = new THREE.Mesh(new THREE.CircleGeometry(0.2, 5), mood.mat({ dark: 0x5a5444, bright: 0xf2c96b, metalness: 0.7, roughness: 0.3, emissive: [0, 0x806020], ei: [0, 0.4] }));
  star.position.set(0, 2.6, -D / 2 + 2.15);
  scene.add(star);
  // Hay: bales stacked in the corners, a hay rack in each side stall, straw over the floor of the stalls.
  for (const [x, z, y, ry] of [[-W / 2 + 0.7, 1.2, 0.3, 0], [-W / 2 + 0.7, 2.0, 0.3, 0], [-W / 2 + 0.7, 1.6, 0.85, 0.2], [W / 2 - 0.7, 1.5, 0.3, Math.PI / 2], [W / 2 - 0.7, 2.5, 0.3, Math.PI / 2]]) {
    const b = box(1.0, 0.55, 0.6, strawM, x, y, z, scene);
    b.rotation.y = ry;
  }
  blockers.push({ minX: -W / 2, maxX: -W / 2 + 1.3, minZ: 0.7, maxZ: 2.5 }, { minX: W / 2 - 1.3, maxX: W / 2, minZ: 0.9, maxZ: 3.1 });
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, 2.1).rotateX(-Math.PI / 2), strawM);
  bed.position.set(0, 0.015, -D / 2 + 1.1);
  scene.add(bed);
  // Horseshoes and a saddle on the left wall, a bucket and a brush by Étoile's stall.
  for (let i = 0; i < 4; i++) {
    const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 14, Math.PI * 1.4), M.gold);
    shoe.position.set(-W / 2 + 0.04, 2.2, -1.0 + i * 0.4);
    shoe.rotation.set(0, Math.PI / 2, Math.PI * 0.8);
    scene.add(shoe);
  }
  const saddle = new THREE.Group();
  saddle.position.set(-W / 2 + 0.3, 1.3, 2.9);
  box(0.4, 0.06, 0.06, M.darkWood, -0.1, 0, 0, saddle);
  const seat = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 8, 0, TAU, 0, Math.PI / 2), mood.mat({ dark: 0x2a1e1a, bright: 0x8a3a2a, roughness: 0.5 }));
  seat.scale.set(1.3, 0.5, 0.9);
  seat.position.y = 0.02;
  saddle.add(seat);
  scene.add(saddle);
  const bucket = new THREE.Group();
  bucket.position.set(1.3, 0, -D / 2 + 2.9);
  cyl(0.2, 0.16, 0.32, mood.mat({ dark: 0x30343a, bright: 0x8ab0c8, metalness: 0.5, roughness: 0.4 }), 0, 0.16, 0, bucket, 14);
  const carrots = [];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 8), mood.mat({ dark: 0x4a3020, bright: 0xff8a2a }));
    c.position.set(Math.cos(i) * 0.08, 0.34, Math.sin(i) * 0.08);
    c.rotation.set(Math.PI + 0.3 * Math.sin(i * 3), 0, 0.3 * Math.cos(i * 2));
    bucket.add(c);
    carrots.push(c);
  }
  scene.add(bucket);
  blockers.push({ minX: 1.05, maxX: 1.55, minZ: -D / 2 + 2.65, maxZ: -D / 2 + 3.15, tall: false });
  // Lanterns hung from the beam; dust motes in the light.
  for (const x of [-3, 3]) {
    cyl(0.01, 0.01, 0.4, M.darkWood, x, 3.0, -D / 2 + 2.2, scene, 4);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    l.position.set(x, 2.75, -D / 2 + 2.2);
    scene.add(l);
    const h = glow(0xffd08a, 0.8, 1);
    h.position.copy(l.position);
    scene.add(h);
    const witch = new THREE.Color(0x4dffc0), warm = new THREE.Color(0xffd08a);
    mood.on((f) => {
      l.material.color.copy(witch).lerp(warm, f).multiplyScalar(1.6);
      h.material.color.copy(witch).lerp(warm, f).multiplyScalar(0.8);
    });
  }
  // Étoile, in her stall, once won.
  const pony = makePegasus();
  pony.group.position.set(0, 0, -D / 2 + 1.25);
  pony.group.rotation.y = 1.15; // side-on to the grooming camera, her muddy left flank towards it
  pony.group.scale.setScalar(1.15);
  scene.add(pony.group);
  mood.item(pony.group.position, (f) => (pony.group.visible = f > 0.6));
  updates.push((dt, t, f) => f > 0.6 && pony.update(dt, t));
  blockers.push({ minX: -1.4, maxX: 1.4, minZ: -D / 2, maxZ: -D / 2 + 2.0 });
  // view: the grooming camera, with her and Étoile in the left part of the screen (the game's panel covers the right).
  const x = 1.1, z = -D / 2 + 2.5;
  return { kind: 'pony', x, z, face: -1.9, friend: pony, carrots, view: [[-1.6, 1.75, -D / 2 + 4.8], [1.07, 0.85, -D / 2 + 2.24]] };
}

addPlaces({ garden: buildGarden });
addRooms({
  rosegarden: {
    W: 12, D: 11, H: 6,
    outdoor: (ctx) => outdoors(ctx, [{ side: 's', at: 0, width: 2.4 }]),
    fogDark: 0x14102a, fogBright: 0xd8e8f4, fogDensity: 0.04,
    sunFrom: [6, 10, 6],
    chandelier: false,
    mist: 0x5a6aa0,
    battle: { hero: [1.8, -0.6], foes: [[-1.5, -1.6], [-2.0, -0.2]], camera: [0.6, 2.3, 3.8], look: [0.2, 0.9, -1.0] },
    furnish: furnishRoseGarden
  },
  stables: {
    W: 10, D: 8, H: 5,
    shell: { floorMap: straw(), floorDark: 0x3a3430, floorBright: 0xc8b090, wallMap: planks(), wallDark: 0x2e2a2c, wallBright: 0xe8d0b8, ceilingDark: 0x1a1414, ceilingBright: 0x6a4a34, plain: true },
    windows: [{ x: 5 - 0.02, z: -0.6, ry: -Math.PI / 2, w: 1.2, h: 1.6, sill: 1.4 }],
    curtain: 0x3f8a4a,
    sunFrom: [6, 7, 1],
    sconces: [[-4.94, 2.2, -0.2, Math.PI / 2], [-2.2, 2.2, 3.94, Math.PI], [2.2, 2.2, 3.94, Math.PI]],
    chandelier: false,
    mist: 0x6a5a48,
    battle: { hero: [2.0, 0.2], foes: [[-1.3, -0.8], [-1.9, 0.2]], camera: [0.5, 2.2, 3.7], look: [0.2, 0.85, -0.4] },
    furnish: furnishStables
  }
});
