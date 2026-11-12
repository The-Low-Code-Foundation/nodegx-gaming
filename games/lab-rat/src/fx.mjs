// Particles (two point clouds: glowing and solid), puffs, decals, tracers, shell casings, explosions.
import * as THREE from 'three';
import { flameTex } from './models.mjs';

class Cloud {
  constructor(scene, n, { additive, size, map }) {
    this.n = n;
    this.parts = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    const m = new THREE.PointsMaterial({
      size,
      map,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(p, v, life, color, grav = 9.8, drag = 0.5, bounce = 0.3) {
    if (this.parts.length >= this.n) this.parts.shift();
    this.parts.push({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, life, max: life, r: color.r, g: color.g, b: color.b, grav, drag, bounce });
  }
  update(dt) {
    const ps = this.parts;
    let k = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.01) {
        p.y = 0.01;
        p.vy = -p.vy * p.bounce;
        p.vx *= 0.5;
        p.vz *= 0.5;
      }
      ps[k++] = p;
      const j = k - 1;
      this.pos[j * 3] = p.x;
      this.pos[j * 3 + 1] = p.y;
      this.pos[j * 3 + 2] = p.z;
      const a = Math.min(1, (p.life / p.max) * 1.6);
      this.col[j * 4] = p.r;
      this.col[j * 4 + 1] = p.g;
      this.col[j * 4 + 2] = p.b;
      this.col[j * 4 + 3] = a;
    }
    ps.length = k;
    this.geo.setDrawRange(0, k);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, T, lights) {
    this.scene = scene;
    this.T = T;
    this.lights = lights;
    this.glow = new Cloud(scene, 900, { additive: true, size: 0.07, map: T.glow });
    this.solid = new Cloud(scene, 900, { additive: false, size: 0.06, map: T.glow });
    // puffs: sprites with their own material each
    this.puffs = [];
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.smoke, transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.puffs.push({ m, life: 0 });
    }
    this.pi = 0;
    // decals: a ring buffer
    this.decals = [];
    this.di = 0;
    this.holeMat = new THREE.MeshBasicMaterial({ map: T.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.scorchMat = new THREE.MeshBasicMaterial({ map: T.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.splatMats = {};
    this.decalGeo = new THREE.PlaneGeometry(1, 1);
    // tracers
    this.tracers = [];
    // a tracer is a thin glowing rod (a GL line is one pixel wide, and vanished at a distance)
    const tm = new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const tg = new THREE.CylinderGeometry(1, 0.4, 1, 5, 1, true);
    tg.rotateX(Math.PI / 2);
    tg.translate(0, 0, 0.5);
    for (let i = 0; i < 16; i++) {
      const l = new THREE.Mesh(tg, tm);
      l.visible = false;
      l.frustumCulled = false;
      scene.add(l);
      this.tracers.push({ l, life: 0 });
    }
    // muzzle flashes in the world: a star and three crossed flame petals along the barrel
    this.flashes = [];
    const pm = new THREE.MeshBasicMaterial({ map: flameTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    const pg = new THREE.PlaneGeometry(0.16, 0.45);
    pg.translate(0, 0.225, 0);
    pg.rotateX(Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      g.visible = false;
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(pg, pm);
        m.rotation.z = (k / 3) * Math.PI;
        g.add(m);
      }
      const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      st.scale.setScalar(0.35);
      g.add(st);
      scene.add(g);
      this.flashes.push({ g, life: 0 });
    }
    this.fi = 0;
    this.ti = 0;
    // casings
    this.casings = [];
    const cg = new THREE.CylinderGeometry(0.006, 0.006, 0.022, 6);
    const cm = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.8, roughness: 0.3 });
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(cg, cm);
      m.visible = false;
      scene.add(m);
      this.casings.push({ m, v: new THREE.Vector3(), life: 0, spin: new THREE.Vector3() });
    }
    this.ci = 0;
    this.tmp = new THREE.Vector3();
    this.color = new THREE.Color();
  }
  rand(s) {
    return (Math.random() - 0.5) * 2 * s;
  }
  sparks(p, n, count = 10, speed = 5, color = 0xffc070) {
    this.color.set(color);
    for (let i = 0; i < count; i++) {
      this.tmp.set(n[0] + this.rand(0.8), n[1] + this.rand(0.8) + 0.3, n[2] + this.rand(0.8)).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      this.glow.emit(p, this.tmp, 0.2 + Math.random() * 0.35, this.color, 9.8, 1.5, 0.4);
    }
  }
  dust(p, n, color = 0x8a8478) {
    this.color.set(color);
    for (let i = 0; i < 6; i++) {
      this.tmp.set(n[0] + this.rand(0.5), n[1] + this.rand(0.5), n[2] + this.rand(0.5)).multiplyScalar(1 + Math.random() * 1.5);
      this.solid.emit(p, this.tmp, 0.4 + Math.random() * 0.4, this.color, 3, 3, 0.1);
    }
    this.puff(p, 0x7a756c, 0.35, 0.6, 0.35);
  }
  blood(p, color, count = 14, speed = 3) {
    this.color.set(color);
    for (let i = 0; i < count; i++) {
      this.tmp.set(this.rand(1), Math.random() * 1.2, this.rand(1)).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      this.solid.emit(p, this.tmp, 0.5 + Math.random() * 0.6, this.color, 9.8, 0.8, 0);
    }
    this.puff(p, color, 0.4, 0.4, 0.8);
  }
  puff(p, color, size, life, alpha = 0.6, rise = 0.3) {
    const q = this.puffs[this.pi++ % this.puffs.length];
    q.m.visible = true;
    q.m.position.copy(p);
    q.m.material.color.set(color);
    q.m.material.opacity = alpha;
    q.m.material.blending = THREE.NormalBlending;
    q.m.scale.setScalar(size);
    q.life = q.max = life;
    q.size = size;
    q.alpha = alpha;
    q.rise = rise;
    q.grow = 1.8;
    return q;
  }
  flash(p, color, size, life) {
    const q = this.puff(p, color, size, life, 1, 0);
    q.m.material.blending = THREE.AdditiveBlending;
    q.m.material.map = this.T.glow;
    q.grow = 0.5;
    q.restore = true;
  }
  decal(p, n, kind = 'hole', size = 0.12, color) {
    let mat = kind === 'hole' ? this.holeMat : kind === 'scorch' ? this.scorchMat : null;
    if (kind === 'splat') {
      mat = this.splatMats[color] ??= new THREE.MeshBasicMaterial({
        map: this.T.splat,
        color,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3
      });
    }
    let d = this.decals[this.di % 160];
    if (!d) {
      d = new THREE.Mesh(this.decalGeo, mat);
      this.scene.add(d);
      this.decals.push(d);
    }
    this.di++;
    d.material = mat;
    d.scale.setScalar(size);
    d.position.set(p.x + n[0] * 0.01, p.y + n[1] * 0.01, p.z + n[2] * 0.01);
    this.tmp.set(p.x + n[0], p.y + n[1], p.z + n[2]);
    d.lookAt(this.tmp);
    d.rotateZ(Math.random() * 6.28);
  }
  tracer(a, b) {
    const t = this.tracers[this.ti++ % this.tracers.length];
    // a short streak partway along the shot
    const d = Math.max(0.01, a.distanceTo(b));
    if (d < 2) return;
    // never closer than 1.5 m to where it started: a rod beside the camera reads as a blob, not a streak
    const k = Math.max(1.5 / d, 0.15 + Math.random() * 0.3);
    const k2 = Math.min(1, k + 3.5 / Math.max(1, d));
    t.l.position.lerpVectors(a, b, k);
    this.tmp.lerpVectors(a, b, k2);
    t.l.lookAt(this.tmp);
    t.l.scale.set(0.009, 0.009, d * (k2 - k));
    t.l.visible = true;
    t.life = 0.04;
  }
  muzzle(p, dir, size = 1) {
    const f = this.flashes[this.fi++ % this.flashes.length];
    f.g.position.copy(p);
    f.g.lookAt(this.tmp.copy(p).add(dir));
    f.g.rotateZ(Math.random() * 6);
    f.g.scale.set(size * (0.8 + Math.random() * 0.4), size * (0.8 + Math.random() * 0.4), size * (0.7 + Math.random() * 0.7));
    f.g.visible = true;
    f.life = 0.05;
  }
  casing(p, v) {
    const c = this.casings[this.ci++ % this.casings.length];
    c.m.visible = true;
    c.m.position.copy(p);
    c.v.copy(v);
    c.spin.set(this.rand(20), this.rand(20), this.rand(20));
    c.life = 3;
    c.bounced = false;
  }
  explosion(p, audio) {
    this.flash(this.tmp.copy(p).setY(p.y + 0.4), 0xffb050, 7, 0.35);
    for (let i = 0; i < 6; i++) {
      const q = this.puff(this.tmp.set(p.x + this.rand(1.2), p.y + 0.4 + Math.random() * 1.2, p.z + this.rand(1.2)), 0x2a2622, 2.2, 2.2 + Math.random(), 0.7, 0.8);
      q.grow = 2.4;
    }
    this.sparks(p, [0, 1, 0], 70, 13, 0xffa040);
    this.color.set(0x2b2b2b);
    for (let i = 0; i < 26; i++) {
      this.tmp.set(this.rand(1), Math.random() * 1.3, this.rand(1)).normalize().multiplyScalar(4 + Math.random() * 9);
      this.solid.emit(p, this.tmp, 1 + Math.random(), this.color, 12, 0.3, 0.3);
    }
    const s = this.lights.add({ pos: p.clone().setY(p.y + 1), color: 0xffa040, i: 60, d: 18, kind: 'fade', life: 0.5 });
    s.maxLife = 0.5;
    this.decal({ x: p.x, y: 0.01, z: p.z }, [0, 1, 0], 'scorch', 4.5);
  }
  update(dt) {
    this.glow.update(dt);
    this.solid.update(dt);
    for (const q of this.puffs) {
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) {
        q.m.visible = false;
        if (q.restore) {
          q.m.material.map = this.T.smoke;
          q.restore = false;
        }
        continue;
      }
      const k = 1 - q.life / q.max;
      q.m.scale.setScalar(q.size * (1 + k * q.grow));
      q.m.material.opacity = q.alpha * (1 - k);
      q.m.position.y += q.rise * dt;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) f.g.visible = false;
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.l.visible = false;
    }
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.v.y -= 9.8 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt;
      c.m.rotation.y += c.spin.y * dt;
      if (c.m.position.y < 0.01) {
        c.m.position.y = 0.01;
        c.v.y = -c.v.y * 0.3;
        c.v.x *= 0.5;
        c.v.z *= 0.5;
        c.spin.multiplyScalar(0.5);
      }
      if (c.life <= 0) c.m.visible = false;
    }
  }
}
