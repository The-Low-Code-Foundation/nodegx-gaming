// Builds the level's meshes from map.mjs: merged floors, walls and ceilings (corner shading baked into vertex
// colours), furniture, doors, light fixtures, signs, the crystals, the nest, the bodies.
import * as THREE from 'three';
import { S, W, H, DOORS, PROPS, LIGHTS, SIGNS, CRYSTALS, NEST, USABLES, VENTS, GROWN, TRAIL, wallPos } from './map.mjs';
import { makeHuman } from './humans.mjs';
import { creatureModel } from './creature-models.mjs';

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

class Batch {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = [];
    this.i = [];
  }
  quad(v, n, uv, col) {
    const base = this.p.length / 3;
    for (let k = 0; k < 4; k++) {
      this.p.push(...v[k]);
      this.n.push(...n);
      this.uv.push(...uv[k]);
      this.c.push(col[k], col[k], col[k]);
    }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }
}

const STYLE = {
  lab: { floor: 'tile', wall: 'lab', ceil: 'tile', vh: 3.4 },
  office: { floor: 'tile', wall: 'office', ceil: 'tile', vh: 3.4 },
  hold: { floor: 'concrete', wall: 'concrete', ceil: 'metal', vh: 2 },
  bay: { floor: 'concrete', wall: 'concrete', ceil: 'metal', vh: 2 },
  lift: { floor: 'concrete', wall: 'frame', ceil: 'tile', vh: 2 },
  door: { floor: 'concrete', wall: 'frame', ceil: 'metal', vh: 2 }
};

export function buildLevel(level, T, scene, lights) {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  const M = {
    'floor:tile': std({ map: T.floorTile, vertexColors: true, roughness: 0.55 }),
    'floor:concrete': std({ map: T.floorConcrete, vertexColors: true, roughness: 0.8 }),
    'wall:office': std({ map: T.wallOffice, vertexColors: true }),
    'wall:lab': std({ map: T.wallLab, vertexColors: true, roughness: 0.5 }),
    'wall:concrete': std({ map: T.wallConcrete, vertexColors: true }),
    'wall:frame': std({ color: 0x4a4f54, map: T.wallConcrete, vertexColors: true, metalness: 0.3, roughness: 0.6 }),
    'ceil:tile': std({ map: T.ceilTile, vertexColors: true }),
    'ceil:metal': std({ map: T.ceilMetal, vertexColors: true })
  };
  const batches = {};
  const B = (k) => (batches[k] ??= new Batch());
  const solidStatic = (x, y) => {
    const c = level.cell(x, y);
    return !c || (c.prop && c.prop.kind === 'pillar');
  };
  const cornerAO = (gx, gy) => {
    let n = 0;
    for (const [ax, ay] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (solidStatic(gx + ax, gy + ay)) n++;
    return [1, 0.78, 0.6, 0.5, 0.45][n];
  };
  const wallCol = (y, h) => (y <= 0.01 ? 0.45 : y <= 1.21 ? 0.88 : y >= h - 0.01 ? 0.8 : 1);

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = level.cell(x, y);
      if (!c) continue;
      const st = STYLE[c.style];
      const x0 = x * S, x1 = x0 + S, z0 = y * S, z1 = z0 + S;
      const a = [cornerAO(x, y), cornerAO(x, y + 1), cornerAO(x + 1, y + 1), cornerAO(x + 1, y)];
      B('floor:' + st.floor).quad(
        [[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]],
        [0, 1, 0],
        [[x, -y], [x, -y - 1], [x + 1, -y - 1], [x + 1, -y]],
        a
      );
      const h = c.h;
      const ca = a.map((v) => 0.55 + 0.35 * v);
      B('ceil:' + st.ceil).quad(
        [[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]],
        [0, -1, 0],
        [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]],
        [ca[0], ca[3], ca[2], ca[1]]
      );
      // walls: against solid neighbours, and the strip above a lower neighbour (a lintel over a doorway)
      const sides = [
        { nb: level.cell(x, y - 1), n: [0, 0, 1], bl: [x0, z0], br: [x1, z0], u: [x, x + 1] },
        { nb: level.cell(x, y + 1), n: [0, 0, -1], bl: [x1, z1], br: [x0, z1], u: [-x - 1, -x] },
        { nb: level.cell(x - 1, y), n: [1, 0, 0], bl: [x0, z1], br: [x0, z0], u: [-y - 1, -y] },
        { nb: level.cell(x + 1, y), n: [-1, 0, 0], bl: [x1, z0], br: [x1, z1], u: [y, y + 1] }
      ];
      for (const s of sides) {
        let from;
        if (!s.nb) from = 0;
        else if (s.nb.h < h - 0.01) from = s.nb.h;
        else continue;
        const cuts = from === 0 && h > 1.3 ? [0, 1.2, h] : [from, h];
        const key = 'wall:' + (from > 0 && c.style === 'door' ? 'frame' : st.wall);
        for (let k = 0; k < cuts.length - 1; k++) {
          const ya = cuts[k], yb = cuts[k + 1];
          const ca2 = from > 0 ? 0.85 : wallCol(ya, h), cb2 = from > 0 ? 0.85 : wallCol(yb, h);
          B(key).quad(
            [[s.bl[0], ya, s.bl[1]], [s.br[0], ya, s.br[1]], [s.br[0], yb, s.br[1]], [s.bl[0], yb, s.bl[1]]],
            s.n,
            [[s.u[0], ya / st.vh], [s.u[1], ya / st.vh], [s.u[1], yb / st.vh], [s.u[0], yb / st.vh]],
            [ca2, ca2, cb2, cb2]
          );
        }
      }
    }
  for (const [k, b] of Object.entries(batches)) {
    const m = b.mesh(M[k]);
    m.name = k;
    scene.add(m);
  }

  const out = { doors: {}, fixtures: [], crystals: [], usables: {}, vents: {}, materials: M };
  const r = rng(7);

  // ---- furniture ----
  const metal = std({ color: 0x55595e, metalness: 0.5, roughness: 0.45 });
  const darkMetal = std({ color: 0x2c2f33, metalness: 0.4, roughness: 0.5 });
  const resin = std({ color: 0x1e2226, roughness: 0.35 });
  const cabinet = std({ color: 0x8d9296, roughness: 0.6, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xa8dce8, transparent: true, opacity: 0.22, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
  const ooze = std({ color: 0x5fff6a, emissive: 0x2aff40, emissiveIntensity: 0.7, roughness: 0.2, transparent: true, opacity: 0.85 });
  const paper = std({ color: 0xe8e6dc, roughness: 0.9 });
  const add = (geo, mat, x, y, z, ry = 0, parent = scene) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    parent.add(m);
    return m;
  };
  for (const p of PROPS) {
    const [cx, cy] = p.c;
    const x = cx * S, z = cy * S, ch = level.cell(cx, cy).h;
    if (p.kind === 'bench') {
      add(new THREE.BoxGeometry(2, 0.86, 1.2), cabinet, x + 1, 0.43, z + 1);
      add(new THREE.BoxGeometry(2.02, 0.06, 1.34), resin, x + 1, 0.92, z + 1);
      for (let k = 0; k < 5; k++) {
        const rr = 0.03 + r() * 0.04, hh = 0.08 + r() * 0.18;
        const liquid = r() < 0.4;
        add(new THREE.CylinderGeometry(rr, rr, hh, 10), liquid ? ooze : glass, x + 0.2 + r() * 1.6, 0.95 + hh / 2, z + 0.5 + r() * 1.0);
      }
      add(new THREE.BoxGeometry(0.32, 0.005, 0.24), paper, x + 0.4 + r() * 1.2, 0.953, z + 0.6 + r() * 0.8, r() * 3);
      if (r() < 0.6) add(new THREE.BoxGeometry(0.35, 0.3, 0.3), darkMetal, x + 0.3 + r() * 1.4, 1.1, z + 1);
    } else if (p.kind === 'tube') {
      const cxw = x + 1, czw = z + 1;
      add(new THREE.CylinderGeometry(0.8, 0.85, 0.28, 28), darkMetal, cxw, 0.14, czw);
      add(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 28), darkMetal, cxw, ch - 0.15, czw);
      add(new THREE.CylinderGeometry(0.72, 0.72, 2.6, 28, 1, true, 0.9, 3.9), glass, cxw, 1.6, czw);
      add(new THREE.CylinderGeometry(0.72, 0.72, 0.5, 28, 1, true, 4.8, 1.0), glass, cxw, 2.65, czw);
      add(new THREE.CylinderGeometry(0.68, 0.68, 0.04, 28), ooze, cxw, 0.3, czw);
      for (let k = 0; k < 4; k++) add(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), metal, cxw + Math.cos(k * 1.57) * 0.55, ch - 0.6, czw + Math.sin(k * 1.57) * 0.55);
      for (let k = 0; k < 14; k++) {
        const sh = add(new THREE.PlaneGeometry(0.08 + r() * 0.18, 0.06 + r() * 0.12), glass, cxw + (r() - 0.3) * 2.4, 0.012, czw + (r() - 0.2) * 2.4);
        sh.rotation.x = -Math.PI / 2;
        sh.rotation.z = r() * 6;
      }
    } else if (p.kind === 'vending') {
      const body = std({ color: 0x7a1d18, roughness: 0.5, metalness: 0.2 });
      add(new THREE.BoxGeometry(1.5, 2.0, 0.95), body, x + 1, 1.0, z + 0.475);
      const front = add(
        new THREE.PlaneGeometry(1.36, 1.86),
        std({ map: T.vending, emissive: 0xffffff, emissiveMap: T.vending, emissiveIntensity: 0.4, roughness: 0.3 }),
        x + 1, 1.0, z + 0.951
      );
      out.vendingFront = front;
    } else if (p.kind === 'desk') {
      const wood = std({ color: 0x6b5a48, roughness: 0.7 });
      add(new THREE.BoxGeometry(1.8, 0.05, 0.95), wood, x + 1, 0.78, z + 0.5);
      for (const [lx, lz] of [[0.15, 0.1], [1.85, 0.1], [0.15, 0.9], [1.85, 0.9]]) add(new THREE.BoxGeometry(0.05, 0.76, 0.05), metal, x + lx, 0.38, z + lz);
      add(new THREE.BoxGeometry(0.5, 0.38, 0.4), std({ color: 0xc8c2b0 }), x + 0.35, 1.0, z + 0.3);
      add(new THREE.BoxGeometry(0.42, 0.005, 0.3), paper, x + 1.4, 0.81, z + 0.6, 0.3);
      const chair = add(new THREE.BoxGeometry(0.5, 0.08, 0.5), darkMetal, x + 0.4, 0.2, z + 2.6, 0.8);
      chair.rotation.z = 1.3;
    } else if (p.kind === 'pillar') {
      const mat = std({ map: T.wallConcrete.clone(), vertexColors: false });
      mat.map.repeat.set(0.8, ch / 2);
      mat.map.needsUpdate = true;
      add(new THREE.BoxGeometry(1.6, ch, 1.6), mat, x + 1, ch / 2, z + 1);
      const hz = std({ map: T.hazard.clone() });
      hz.map.repeat.set(3, 1);
      hz.map.needsUpdate = true;
      add(new THREE.BoxGeometry(1.62, 0.6, 1.62), hz, x + 1, 0.3, z + 1);
    } else if (p.kind === 'crate') {
      const mat = std({ map: T.crate });
      add(new THREE.BoxGeometry(1.9, 1.9, 1.9), mat, x + 1, 0.95, z + 1, r() * 0.06);
      if (p.top > 2) add(new THREE.BoxGeometry(1.8, 1.8, 1.8), mat, x + 1, 2.8, z + 1, 0.12);
    }
  }

  // ---- doors ----
  const doorMat = std({ map: T.door, metalness: 0.4, roughness: 0.5 });
  for (const d of DOORS) {
    const xs = d.cells.map((c) => c[0]), ys = d.cells.map((c) => c[1]);
    const alongZ = new Set(xs).size === 1; // the cells run along z, so you walk through it along x
    const span = d.cells.length * S;
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(span, d.h, 0.22), doorMat);
    g.add(slab);
    if (alongZ) {
      g.position.set(xs[0] * S + S / 2, d.h / 2, (Math.min(...ys) * S + (Math.max(...ys) + 1) * S) / 2);
      g.rotation.y = Math.PI / 2;
    } else g.position.set((Math.min(...xs) * S + (Math.max(...xs) + 1) * S) / 2, d.h / 2, ys[0] * S + S / 2);
    scene.add(g);
    // a status lamp on each face
    const lampMat = std({ color: 0x111111, emissive: 0xff2010, emissiveIntensity: 2 });
    for (const sgn of [1, -1]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), lampMat);
      lamp.position.set(span / 2 + 0.25, 0.4, sgn * 0.9);
      g.add(lamp);
    }
    out.doors[d.id] = { def: d, group: g, slab, lampMat, alongZ, center: new THREE.Vector3(g.position.x, 0, g.position.z) };
  }

  // ---- light fixtures (their glow follows the light) ----
  // A point light a few centimetres from a surface burns a white hole in it (irradiance goes as 1/d²), and the bloom
  // then smears that hole across the screen. So the light itself hangs at least half a metre clear of the ceiling and
  // of any wall; only the fixture you see sits on the surface.
  const clearOf = (p) => {
    const q = new THREE.Vector3(...p);
    const h = level.heightAt(q.x, q.z);
    q.y = Math.min(q.y, h - 0.9);
    const cx = Math.floor(q.x / S), cz = Math.floor(q.z / S), m = 0.6;
    if (!level.cell(cx - 1, cz) && q.x - cx * S < m) q.x = cx * S + m;
    if (!level.cell(cx + 1, cz) && (cx + 1) * S - q.x < m) q.x = (cx + 1) * S - m;
    if (!level.cell(cx, cz - 1) && q.z - cz * S < m) q.z = cz * S + m;
    if (!level.cell(cx, cz + 1) && (cz + 1) * S - q.z < m) q.z = (cz + 1) * S - m;
    return q;
  };
  const shaftTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  })();
  for (const L of LIGHTS) {
    const src = lights.add({ ...L, pos: clearOf(L.p) });
    if (!L.fixture) continue;
    const col = new THREE.Color(L.color);
    const mat = std({ color: 0x222222, emissive: col, emissiveIntensity: 1.5 });
    if (L.fixture === 'lamp') {
      // a faint cone of lit dust under the big lamps
      const hgt = L.p[1] - 0.1;
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, hgt * 0.42, hgt, 24, 1, true),
        new THREE.MeshBasicMaterial({ map: shaftTex, color: col, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
      );
      cone.position.set(L.p[0], hgt / 2, L.p[2]);
      scene.add(cone);
      src.shaft = cone.material;
      src.shaftK = L.p[1] > 7 ? 0.07 : 0.05;
    }
    let m;
    if (L.fixture === 'tube') {
      m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.22), mat);
      m.position.set(L.p[0], level.heightAt(L.p[0], L.p[2]) - 0.04, L.p[2]);
    } else if (L.fixture === 'beacon') {
      m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      m.position.set(L.p[0], L.p[1] + 0.05, L.p[2]);
      m.rotation.x = Math.PI;
    } else {
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.25, 16), mat);
      m.position.set(L.p[0], L.p[1] + 0.2, L.p[2]);
    }
    scene.add(m);
    src.fixture = mat;
  }

  // ---- signs ----
  for (const s of SIGNS) {
    const w = s.small ? 1.2 : 1.7, h = s.small ? 0.22 : 0.32;
    const t = T.sign(s.text, s.small);
    const m = add(new THREE.PlaneGeometry(w, h), std({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.22 }), s.p[0], s.p[1], s.p[2], s.rotY);
    m.renderOrder = 1;
  }

  // ---- usables ----
  for (const u of USABLES) {
    const wp = wallPos(u.c[0], u.c[1], u.side, u.depth ?? 0.1);
    const g = new THREE.Group();
    g.position.set(wp.x, 0, wp.z);
    g.rotation.y = wp.rotY;
    scene.add(g);
    const rec = { def: u, group: g, pos: new THREE.Vector3(wp.x, 1.1, wp.z), used: false };
    if (u.kind === 'terminal') {
      add(new THREE.BoxGeometry(1.2, 0.05, 0.7), resin, 0, 0.78, 0.35, 0, g);
      add(new THREE.BoxGeometry(1.1, 0.74, 0.6), cabinet, 0, 0.37, 0.32, 0, g);
      add(new THREE.BoxGeometry(0.5, 0.42, 0.45), std({ color: 0xbdb7a5 }), 0, 1.03, 0.3, 0, g);
      add(new THREE.PlaneGeometry(0.4, 0.3), std({ map: T.screen, emissive: 0xffffff, emissiveMap: T.screen, emissiveIntensity: 0.75 }), 0, 1.05, 0.526, 0, g);
      add(new THREE.BoxGeometry(0.45, 0.02, 0.16), darkMetal, 0, 0.81, 0.62, 0, g);
      rec.pos.set(wp.x + Math.sin(wp.rotY) * 0.5, 1.05, wp.z + Math.cos(wp.rotY) * 0.5);
    } else if (u.kind === 'vending') {
      rec.pos.set(wp.x, 1.1, wp.z + 0.05);
    } else if (u.kind === 'medkit') {
      const front = std({ map: T.cross, emissive: 0xffffff, emissiveMap: T.cross, emissiveIntensity: 0.3 });
      add(new THREE.BoxGeometry(0.46, 0.36, 0.14), std({ color: 0xe9e9e4 }), 0, 1.2, 0.07, 0, g);
      add(new THREE.PlaneGeometry(0.4, 0.3), front, 0, 1.2, 0.142, 0, g);
      rec.front = front;
      rec.pos.set(wp.x, 1.2, wp.z);
    } else if (u.kind === 'gatectl' || u.kind === 'breaker') {
      const big = u.kind === 'breaker';
      add(new THREE.BoxGeometry(big ? 0.7 : 0.6, big ? 1.0 : 0.8, 0.22), std({ color: 0x5b6066, metalness: 0.4, roughness: 0.5 }), 0, 1.3, 0.11, 0, g);
      const lamp = std({ color: 0x111111, emissive: 0xff2010, emissiveIntensity: 2.5 });
      add(new THREE.SphereGeometry(0.05, 10, 8), lamp, 0.2, 1.68, 0.23, 0, g);
      rec.lamp = lamp;
      if (big) {
        const lever = new THREE.Group();
        lever.position.set(0, 1.3, 0.24);
        g.add(lever);
        const arm = add(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), metal, 0, 0.2, 0, 0, lever);
        add(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 10), std({ color: 0xb02018 }), 0, 0.41, 0, 0, lever).rotation.z = Math.PI / 2;
        arm.userData = {};
        lever.rotation.x = -0.5;
        rec.lever = lever;
      } else {
        add(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16), std({ color: 0xb02018, emissive: 0x400000 }), 0, 1.25, 0.25, 0, g).rotation.x = Math.PI / 2;
      }
      rec.pos.set(wp.x, 1.3, wp.z);
    }
    out.usables[u.id] = rec;
  }

  // ---- vents ----
  const grilleMat = std({ map: T.grille, metalness: 0.4 });
  {
    const v = VENTS.corr;
    const m = add(new THREE.PlaneGeometry(0.9, 0.9), grilleMat, v.p[0], v.p[1] - 0.01, v.p[2]);
    m.rotation.x = Math.PI / 2;
    out.vents.corr = m;
  }
  const wallVent = (v, key) => {
    const wp = wallPos(v.c[0], v.c[1], v.side, 0.012);
    const m = add(new THREE.PlaneGeometry(0.8, 0.5), grilleMat, wp.x, 0.45, wp.z, wp.rotY);
    out.vents[key] = m;
    return m;
  };
  wallVent(VENTS.sec, 'sec');
  VENTS.bay.forEach((v, i) => wallVent(v, 'bay' + i));

  // ---- crystals: clusters of glowing shards; the Tender's six can brighten ----
  for (const c of CRYSTALS) out.crystals.push(makeCrystal(c, T, scene, r));

  // ---- the nest: a mound of growth with glowing pods ----
  {
    const flesh = std({ color: 0x4a3a34, roughness: 0.55 });
    const pod = std({ color: 0x334411, emissive: 0xb8ff40, emissiveIntensity: 0.9 });
    const g = new THREE.Group();
    g.position.set(NEST.p[0], 0, NEST.p[1]);
    for (let k = 0; k < 16; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.3 + r() * 0.5, 12, 9), flesh);
      m.scale.y = 0.35 + r() * 0.3;
      m.position.set((r() - 0.5) * 3, 0.05, (r() - 0.5) * 3);
      g.add(m);
    }
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.1 + r() * 0.08, 10, 8), pod);
      m.position.set((r() - 0.5) * 2.6, 0.25 + r() * 0.15, (r() - 0.5) * 2.6);
      g.add(m);
    }
    scene.add(g);
  }

  // ---- growth creeping in the hold: one instanced mesh of glowing nodules along the walls ----
  {
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const mat = std({ color: 0x23302c, emissive: 0x1d8f7c, emissiveIntensity: 0.6, roughness: 0.5 });
    const N = 260;
    const inst = new THREE.InstancedMesh(geo, mat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    let k = 0;
    while (k < N) {
      // pick a hold floor cell next to a wall, put a nodule at the foot of that wall
      const x = 18 + Math.floor(r() * 22), y = 14 + Math.floor(r() * 13);
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([ax, ay]) => !level.cell(x + ax, y + ay));
      if (!dirs.length) continue;
      const [ax, ay] = dirs[Math.floor(r() * dirs.length)];
      const s = 0.08 + r() * 0.3;
      const along = r() * S;
      const px = ax ? x * S + (ax > 0 ? S : 0) - ax * s * 0.5 : x * S + along;
      const pz = ay ? y * S + (ay > 0 ? S : 0) - ay * s * 0.5 : y * S + along;
      ps.set(px, r() < 0.7 ? s * 0.3 : r() * 3.5, pz);
      sc.set(s, s * (0.6 + r() * 0.6), s);
      m4.compose(ps, q, sc);
      inst.setMatrixAt(k++, m4);
    }
    scene.add(inst);
  }

  // ---- the bodies: the scientist in the lab, the guard in the office ----
  const blood = new THREE.MeshBasicMaterial({ map: T.splat, color: 0x3a0606, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const body = (x, z, ry, shirt, legs, skin) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const s = std({ color: shirt }), l = std({ color: legs }), k = std({ color: skin });
    const part = (geo, mat, px, py, pz, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, 0, rz);
      g.add(m);
    };
    part(new THREE.BoxGeometry(0.42, 0.2, 0.62), s, 0, 0.12, 0);
    part(new THREE.SphereGeometry(0.12, 12, 10), k, 0.04, 0.12, 0.45);
    part(new THREE.CylinderGeometry(0.07, 0.06, 0.62, 8), l, -0.12, 0.08, -0.62, Math.PI / 2);
    part(new THREE.CylinderGeometry(0.07, 0.06, 0.62, 8), l, 0.16, 0.08, -0.6, Math.PI / 2, 0.3);
    part(new THREE.CylinderGeometry(0.05, 0.045, 0.55, 8), s, -0.34, 0.07, 0.2, Math.PI / 2, 0.9);
    part(new THREE.CylinderGeometry(0.05, 0.045, 0.55, 8), s, 0.34, 0.07, 0.05, Math.PI / 2, -0.4);
    scene.add(g);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), blood);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x + 0.2, 0.011, z + 0.1);
    scene.add(pool);
  };
  body(10.4, 19.6, 2.2, 0xe4e2da, 0x2e3440, 0xc49a7a); // a colleague, white coat
  body(31, 5.4, -0.7, 0x4a5a6e, 0x232a33, 0x8a6248); // the guard
  {
    const smear = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), blood);
    smear.position.set(38.4, 1.5, 12.02);
    scene.add(smear);
  }

  // ---- the taken: bodies at the crystals with the growth coming up through them, and the trail to them ----
  for (const b of GROWN) {
    const h = makeHuman(b.kind === 'guard' ? { shirt: 0x4a5a6e, pants: 0x232a33, skin: 0x8a6248 } : { shirt: 0x6a7060, pants: 0x30343a, skin: 0xc49a7a, coat: true });
    h.body.rotation.x = -Math.PI / 2;
    h.body.position.y = 0.13;
    h.arms[0].rotation.set(-2.6, 0, -0.3);
    h.arms[1].rotation.set(-0.4, 0, 0.5);
    h.g.position.set(b.p[0], 0, b.p[1]);
    h.g.rotation.y = b.ry;
    for (const m of h.mats) m.color.multiplyScalar(0.7);
    scene.add(h.g);
    const c = makeCrystal({ p: [0, 0], grown: true }, T, null, r);
    c.group.position.set(0, 0, -0.9);
    h.g.add(c.group);
    c.def = { p: [b.p[0] - Math.sin(b.ry) * 0.9, b.p[1] - Math.cos(b.ry) * 0.9], grown: true };
    out.crystals.push(c);
    // the growth itself (the Living Flesh Blob): it comes up out of the chest and breathes
    const blob = creatureModel('grown');
    if (blob) {
      blob.root.position.set(0.05, 0, -0.25);
      blob.root.rotation.y = r() * Math.PI * 2;
      blob.root.scale.setScalar(0.85 + r() * 0.3);
      h.g.add(blob.root);
      blob.anim.play(Object.keys(blob.anim.clips)[0]);
      blob.anim.mixer.setTime(r() * 3);
    }
    out.grown ??= [];
    out.grown.push({ def: b, pos: new THREE.Vector3(b.p[0], 0.4, b.p[1]), anim: blob?.anim });
  }
  {
    const smear = new THREE.MeshBasicMaterial({ map: T.splat, color: 0x2e0505, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let i = 0; i < TRAIL.length - 1; i++) {
      const [ax, az] = TRAIL[i], [bx, bz] = TRAIL[i + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 0.9);
      for (let k = 0; k < n; k++) {
        const u = k / n;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55 + r() * 0.3, 1.1 + r() * 0.4), smear);
        m.rotation.set(-Math.PI / 2, 0, Math.atan2(bx - ax, bz - az) + (r() - 0.5) * 0.4);
        m.position.set(ax + (bx - ax) * u + (r() - 0.5) * 0.2, 0.011 + i * 0.0001, az + (bz - az) * u + (r() - 0.5) * 0.2);
        scene.add(m);
      }
    }
  }

  // ---- clutter: pipes along the ceilings, cabinets, papers, notices. The building should look used. ----
  {
    const pipeMat = std({ color: 0x5c6166, metalness: 0.6, roughness: 0.45 });
    const rustMat = std({ color: 0x6a4a36, metalness: 0.3, roughness: 0.7 });
    const pipe = (ax, ay, az, bx, by, bz, rad, mat = pipeMat) => {
      const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz), len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 10), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      scene.add(m);
      // a bracket every few metres
      for (let k = 1.5; k < len; k += 3) {
        const p = a.clone().lerp(b, k / len);
        const br = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), darkMetal);
        br.position.set(p.x, p.y + 0.15 + rad, p.z);
        scene.add(br);
      }
    };
    pipe(20, 2.55, 12.3, 63.7, 2.55, 12.3, 0.06);
    pipe(20, 2.75, 12.55, 63.7, 2.75, 12.55, 0.04, rustMat);
    pipe(63.7, 2.55, 12.3, 63.7, 2.55, 26, 0.06);
    pipe(36, 6.0, 28.45, 80, 6.0, 28.45, 0.2, rustMat);
    pipe(36, 5.5, 28.4, 80, 5.5, 28.4, 0.09);
    pipe(82.4, 6.8, 18, 82.4, 6.8, 48, 0.16);
    pipe(109.6, 6.5, 18, 109.6, 6.5, 48, 0.12, rustMat);
    pipe(2.3, 3.0, 6.3, 17.7, 3.0, 6.3, 0.05);
    // filing cabinets against the security office's east wall
    for (const z of [6.4, 7.3]) {
      add(new THREE.BoxGeometry(0.5, 1.32, 0.86), cabinet, 39.7, 0.66, z, Math.PI / 2);
      for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.02, 0.025, 0.2), darkMetal, 39.44, 0.2 + k * 0.32, z);
    }
    // papers on the floor where people ran
    for (const [x0, z0, x1, z1, n] of [[4, 8, 16, 20, 14], [22, 12.6, 58, 15.4, 16], [29, 3, 39, 9, 10], [61, 17, 63, 25, 5]]) {
      for (let k = 0; k < n; k++) {
        const m = add(new THREE.PlaneGeometry(0.21, 0.29), paper, x0 + r() * (x1 - x0), 0.006 + k * 0.0002, z0 + r() * (z1 - z0));
        m.rotation.set(-Math.PI / 2, 0, r() * 6);
      }
    }
    // notices on the walls
    const notice = (lines, accent) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 340;
      const g = c.getContext('2d');
      g.fillStyle = '#e8e2d0';
      g.fillRect(0, 0, 256, 340);
      g.fillStyle = accent;
      g.fillRect(0, 0, 256, 54);
      g.fillStyle = '#fff';
      g.font = 'bold 26px Helvetica, Arial, sans-serif';
      g.fillText(lines[0], 14, 37);
      g.fillStyle = '#2a2622';
      g.font = '17px Helvetica, Arial, sans-serif';
      lines.slice(1).forEach((l, i) => g.fillText(l, 14, 92 + i * 26));
      g.fillStyle = 'rgba(60,40,20,0.12)';
      for (let i = 0; i < 40; i++) g.fillRect(r() * 256, r() * 340, 2 + r() * 30, 1 + r() * 3);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return std({ map: t, roughness: 0.9 });
    };
    const posters = [
      [notice(['SPECIMEN CARE', 'Report every anomaly,', 'however small, to', 'Dr A. Okafor, ext 4471.', '', 'Do not feed the', 'specimens. Do not', 'name the specimens.'], '#2a6a66'), 2.02, 1.6, 12.5, Math.PI / 2],
      [notice(['LANTERN', 'is a need-to-know', 'programme.', '', 'If you do not know,', 'you do not need to.', '', '— Office of the Director'], '#7a1d18'), 46, 1.6, 15.98, Math.PI],
      [notice(['SECURITY', 'Sublevel C night roster', '', '22:00  Kowalski', '22:00  Imre', '02:00  Kowalski', '02:00  (vacant)'], '#3a4a5e'), 28.02, 1.6, 6.5, Math.PI / 2],
      [notice(['EVACUATION', 'In the event of a', 'containment failure', 'proceed to the', 'EAST FREIGHT LIFT.', '', 'Await the response', 'team. Do not resist.'], '#a87a10'), 63.98, 1.6, 21, -Math.PI / 2]
    ];
    for (const [mat, x, y, z, ry] of posters) add(new THREE.PlaneGeometry(0.5, 0.66), mat, x, y, z, ry);
  }

  // ---- the bay: hazard lines around the containment pen, bent bars where it was broken open ----
  {
    const hz = new THREE.MeshStandardMaterial({ map: T.hazard.clone(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 });
    hz.map.repeat.set(8, 1);
    hz.map.needsUpdate = true;
    const line = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), hz);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      scene.add(m);
    };
    line(99.5, 35.5, 9, 0.25);
    line(99.5, 43.5, 9, 0.25);
    line(95.1, 39.5, 0.25, 8);
    line(103.9, 39.5, 0.25, 8);
    for (let k = 0; k < 7; k++) {
      const bar = add(new THREE.CylinderGeometry(0.04, 0.04, 2.2 + r(), 8), metal, 95 + r() * 9, 0.05, 35 + r() * 9, r() * 3);
      bar.rotation.z = Math.PI / 2;
    }
  }

  return out;
}

/** A cluster of glowing shards. Small ones can be broken off for a shard; grown ones come up out of the dead. */
export function makeCrystal(c, T, scene, r = Math.random) {
  const shardGeo = (makeCrystal.geo ??= new THREE.OctahedronGeometry(1, 0));
  const mat = new THREE.MeshStandardMaterial({ color: 0x0e3a38, emissive: 0x2ef0d8, emissiveIntensity: 0.75, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
  const g = new THREE.Group();
  g.position.set(c.p[0], 0, c.p[1]);
  const n = c.small || c.grown ? 5 : c.seed ? 3 : 7, sc = c.small ? 0.55 : c.grown ? 0.6 : c.seed ? 0.45 : 1;
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(shardGeo, mat);
    const hgt = (0.5 + r() * 1.0) * sc;
    m.scale.set((0.1 + r() * 0.12) * sc, hgt, (0.1 + r() * 0.12) * sc);
    m.position.set((r() - 0.5) * 0.9 * sc, hgt * 0.7, (r() - 0.5) * 0.9 * sc);
    m.rotation.set((r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7);
    g.add(m);
  }
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(4 * sc, 4 * sc),
    new THREE.MeshBasicMaterial({ map: T.glow, color: 0x1fbfa8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.02;
  g.add(pool);
  if (scene) scene.add(g);
  return { def: c, group: g, mat, pool: pool.material, glow: 1, base: 0.75 };
}

/**
 * A fixed pool of point lights handed to whichever light sources matter most to the camera this frame. The light
 * count never changes, so no shader ever recompiles.
 */
export class LightRig {
  constructor(scene, n = 10, gain = 3) {
    this.gain = gain;
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      scene.add(l);
      this.pool.push(l);
    }
    this.sources = [];
  }
  add(def) {
    const s = {
      pos: def.pos ?? new THREE.Vector3(...def.p),
      color: new THREE.Color(def.color),
      base: def.i,
      d: def.d,
      kind: def.kind ?? 'steady',
      group: def.group ?? null,
      on: true,
      scale: 1,
      phase: Math.random() * 100,
      cur: 0,
      fixture: null,
      life: def.life ?? Infinity,
      assigned: false
    };
    this.sources.push(s);
    return s;
  }
  remove(s) {
    const i = this.sources.indexOf(s);
    if (i >= 0) this.sources.splice(i, 1);
  }
  update(t, dt, cam) {
    const hash = (n) => {
      const x = Math.sin(n * 127.1) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let i = this.sources.length - 1; i >= 0; i--) {
      const s = this.sources[i];
      if (s.life !== Infinity) {
        s.life -= dt;
        if (s.life <= 0) {
          this.sources.splice(i, 1);
          continue;
        }
      }
      let k = 1;
      if (s.kind === 'pulse') k = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.4 + s.phase));
      else if (s.kind === 'flicker') {
        if (hash(Math.floor(t * 0.8 + s.phase)) < 0.18) k = 0.06;
        else if (hash(Math.floor(t * 14 + s.phase)) < 0.14) k = 0.2;
      } else if (s.kind === 'beacon') k = 0.12 + 0.88 * Math.pow(Math.max(0, Math.sin(t * 3.6 + s.phase)), 5);
      else if (s.kind === 'fade') k = Math.max(0, s.life / (s.maxLife ?? 1));
      s.cur = s.on ? s.base * s.scale * k : 0;
      if (s.fixture) s.fixture.emissiveIntensity = s.base > 0 ? 2.6 * (s.cur / s.base) : 0;
      if (s.shaft) s.shaft.opacity = s.base > 0 ? s.shaftK * (s.cur / s.base) : 0;
      const dx = s.pos.x - cam.x, dy = s.pos.y - cam.y, dz = s.pos.z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const reach = s.d + 14;
      s.score = s.cur > 0 && d2 < reach * reach ? (s.base * s.scale) / (1 + d2 / (s.d * s.d)) * (s.assigned ? 1.3 : 1) : 0;
    }
    const ranked = this.sources.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
    for (const s of this.sources) s.assigned = false;
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i], s = ranked[i];
      if (!s) {
        l.intensity = 0;
        continue;
      }
      s.assigned = true;
      l.position.copy(s.pos);
      l.color.copy(s.color);
      l.intensity = s.cur * this.gain;
      l.distance = s.d;
    }
  }
}
