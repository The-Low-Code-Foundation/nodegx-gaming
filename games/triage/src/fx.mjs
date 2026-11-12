// Effects: muzzle flashes, tracers, blood, floor pools, hit sparks. Round 2: bullet holes and dust where a shot hits a
// surface, blood sprayed onto the wall behind a hit, and wounds that stay on the infected's bodies where they were shot.
// Everything pooled and capped.
// Round 3 (playtest: "really punchy shooting where you feel like the whole screen is shaking"): a muzzle flash you see
// (a star at the muzzle and the flame out of its sides, a light that lights the room, a puff of smoke after), brass that
// flies out of the port, bounces and rings on the floor, the empty magazine falling, plaster chips and a flash where a
// bullet hits a wall, a mist of blood where it hits one of them.
// Round 4 (playtest: "I want firing a gun to feel as powerful and dangerous and explosive as it does in real life"): the
// flash lights the whole room for a frame (a far brighter, far wider light), a bigger star and flame, burning grains
// thrown out of the muzzle, and the smoke is a real cloud that hangs in the air and drifts up (the room fills with it:
// world.haze, atmos.mjs).
import * as THREE from 'three';
import { gunMaterials } from './guns.mjs';

function canvas(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// A bullet hole: a black core, a ring of chipped paint, cracks.
const holeTexture = () =>
  canvas((g, s) => {
    const c = s / 2;
    const rg = g.createRadialGradient(c, c, 0, c, c, c);
    rg.addColorStop(0, 'rgba(0,0,0,1)');
    rg.addColorStop(0.16, 'rgba(10,10,10,1)');
    rg.addColorStop(0.22, 'rgba(90,85,78,0.95)');
    rg.addColorStop(0.42, 'rgba(160,155,145,0.55)');
    rg.addColorStop(0.62, 'rgba(60,58,54,0.25)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(20,20,20,0.7)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * 7;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * s * 0.12, c + Math.sin(a) * s * 0.12);
      g.lineTo(c + Math.cos(a + 0.2) * s * (0.25 + Math.random() * 0.2), c + Math.sin(a + 0.2) * s * (0.25 + Math.random() * 0.2));
      g.stroke();
    }
  });
// A spray of blood: a dense centre, droplets flung outward, some streaks.
const splatTexture = (seed) =>
  canvas((g, s) => {
    let k = seed * 9301 + 49297;
    const r = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
    const c = s / 2;
    const red = (a) => `rgba(${90 + r() * 50},${r() * 10},${r() * 10},${a})`;
    for (let i = 0; i < 6; i++) {
      g.fillStyle = red(0.85);
      g.beginPath();
      g.ellipse(c + (r() - 0.5) * s * 0.2, c + (r() - 0.5) * s * 0.2, s * (0.08 + r() * 0.1), s * (0.06 + r() * 0.08), r() * 3, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 40; i++) {
      const a = r() * 7, d = s * (0.12 + r() * 0.36);
      g.fillStyle = red(0.6 + r() * 0.4);
      g.beginPath();
      g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 1 + r() * s * 0.025, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 8; i++) {
      const a = r() * 7;
      g.strokeStyle = red(0.55);
      g.lineWidth = 1 + r() * 3;
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(c + Math.cos(a) * s * (0.25 + r() * 0.2), c + Math.sin(a) * s * (0.25 + r() * 0.2));
      g.stroke();
    }
  });
// A wound on a body: a dark wet centre in a red stain.
const woundTexture = () =>
  canvas((g, s) => {
    const c = s / 2;
    const rg = g.createRadialGradient(c, c, 0, c, c, c);
    rg.addColorStop(0, 'rgba(20,0,0,1)');
    rg.addColorStop(0.25, 'rgba(70,3,3,1)');
    rg.addColorStop(0.55, 'rgba(120,8,8,0.85)');
    rg.addColorStop(1, 'rgba(110,5,5,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 40},0,0,${0.5 + Math.random() * 0.5})`;
      g.beginPath();
      const a = Math.random() * 7, d = s * (0.2 + Math.random() * 0.28);
      g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 1 + Math.random() * 3, 0, 7);
      g.fill();
    }
    // A run downwards.
    g.fillStyle = 'rgba(100,4,4,0.7)';
    g.fillRect(c - 3, c, 6, s * 0.45);
  });

// The flash: a hot core and spikes (a star), drawn once; additive.
const flashTexture = () =>
  canvas((g, s) => {
    const c = s / 2;
    const rg = g.createRadialGradient(c, c, 0, c, c, c);
    rg.addColorStop(0, 'rgba(255,255,240,1)');
    rg.addColorStop(0.12, 'rgba(255,230,160,1)');
    rg.addColorStop(0.35, 'rgba(255,150,40,0.55)');
    rg.addColorStop(1, 'rgba(255,90,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      const L = s * (0.32 + Math.random() * 0.18);
      g.save();
      g.translate(c, c);
      g.rotate(a);
      const lg = g.createLinearGradient(0, 0, L, 0);
      lg.addColorStop(0, 'rgba(255,220,140,0.9)');
      lg.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(0, -s * 0.03);
      g.lineTo(L, 0);
      g.lineTo(0, s * 0.03);
      g.fill();
      g.restore();
    }
  }, 128);
// The flame out of the muzzle seen from the side: a teardrop, hot at the root.
const coneTexture = () =>
  canvas((g, s) => {
    const lg = g.createLinearGradient(0, 0, s, 0);
    lg.addColorStop(0, 'rgba(255,250,220,1)');
    lg.addColorStop(0.3, 'rgba(255,200,90,0.85)');
    lg.addColorStop(1, 'rgba(255,90,10,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(0, s * 0.5);
    g.quadraticCurveTo(s * 0.35, s * 0.15, s, s * 0.5);
    g.quadraticCurveTo(s * 0.35, s * 0.85, 0, s * 0.5);
    g.fill();
  }, 128);
const softTexture = (r, g2, b) =>
  canvas((g, s) => {
    const c = s / 2;
    const rg = g.createRadialGradient(c, c, 0, c, c, c);
    rg.addColorStop(0, `rgba(${r},${g2},${b},0.8)`);
    rg.addColorStop(0.5, `rgba(${r},${g2},${b},0.35)`);
    rg.addColorStop(1, `rgba(${r},${g2},${b},0)`);
    g.fillStyle = rg;
    g.fillRect(0, 0, s, s);
  }, 64);

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.live = [];
    this.flash = new THREE.PointLight(0xffc27a, 0, 24, 1.4);
    scene.add(this.flash);
    this.flashLeft = 0;
    this.bloodMat = new THREE.MeshBasicMaterial({ color: 0x5a0a0a, transparent: true, opacity: 0.9, depthWrite: false });
    this.decalMat = new THREE.MeshPhongMaterial({ color: 0x3a0606, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, shininess: 80, specular: 0x331111 });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0 });
    this.dustMat = new THREE.MeshBasicMaterial({ color: 0xb8b2a6, transparent: true, opacity: 0.5, depthWrite: false });
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.8 });
    this.dot = new THREE.SphereGeometry(0.035, 6, 4);
    this.puff = new THREE.SphereGeometry(0.06, 6, 4);
    this.decals = [];
    this.holes = [];
    this.splats = [];
    this.holeMat = new THREE.MeshPhongMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, shininess: 0 });
    this.splatMats = [1, 2, 3, 4].map((i) => new THREE.MeshPhongMaterial({ map: splatTexture(i), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, shininess: 40, specular: 0x220000 }));
    this.woundMat = new THREE.MeshPhongMaterial({ map: woundTexture(), color: 0x8c7c7c, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, shininess: 70, specular: 0x2a1010, side: THREE.DoubleSide });
    this.quad = new THREE.PlaneGeometry(1, 1);
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    this.flashTex = flashTexture();
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, ...add, color: 0xffffff }));
    this.flashSprite.visible = false;
    scene.add(this.flashSprite);
    // The side flames: two crossed planes along the barrel.
    const coneMat = new THREE.MeshBasicMaterial({ map: coneTexture(), ...add, side: THREE.DoubleSide });
    this.cone = new THREE.Group();
    for (const r of [0, Math.PI / 2]) {
      const g = new THREE.PlaneGeometry(1, 0.5);
      g.translate(0.5, 0, 0);
      g.rotateY(-Math.PI / 2); // the flame runs along +Z
      g.rotateZ(r);
      this.cone.add(new THREE.Mesh(g, coneMat));
    }
    this.cone.visible = false;
    scene.add(this.cone);
    // (Unlit: kept dim, or in a dark room it glows.)
    this.smokeMat = new THREE.SpriteMaterial({ map: softTexture(170, 168, 160), color: 0x7a7874, transparent: true, depthWrite: false, opacity: 0.35 });
    this.mistMat = new THREE.SpriteMaterial({ map: softTexture(140, 6, 6), transparent: true, depthWrite: false, opacity: 0.9 });
    this.sparkFlashMat = new THREE.SpriteMaterial({ map: this.flashTex, ...add, color: 0xffd6a0 });
    this.chipMat = new THREE.MeshPhongMaterial({ color: 0xcfcabd, shininess: 4 });
    this.chipGeo = new THREE.BoxGeometry(0.018, 0.012, 0.014);
    this.casings = [];
  }

  // The shot: the flash at the muzzle pointing along `dir`, the light, smoke after. `size` 1 is a pistol.
  muzzle(at, dir = null, size = 1) {
    // A little in front of the muzzle and towards her, so the light falls on her, the gun and the walls round her.
    this.flash.position.copy(at).addScaledVector(dir ?? new THREE.Vector3(), 0.25).add(new THREE.Vector3(0, 0.1, 0));
    this.flash.intensity = 420 * size * (0.85 + Math.random() * 0.3);
    this.flash.distance = 18 + 8 * size;
    this.flash.color.setHSL(0.08 + Math.random() * 0.03, 1, 0.68);
    this.flashLeft = 0.06;
    const fs = this.flashSprite;
    fs.position.copy(at).addScaledVector(dir ?? new THREE.Vector3(), 0.04);
    fs.material.rotation = Math.random() * Math.PI * 2;
    fs.scale.setScalar((0.42 + Math.random() * 0.22) * size);
    fs.visible = true;
    if (dir) {
      this.cone.position.copy(at);
      this.cone.lookAt(at.clone().add(dir));
      this.cone.rotateZ(Math.random() * Math.PI);
      this.cone.scale.set((0.32 + Math.random() * 0.16) * size, (0.32 + Math.random() * 0.16) * size, (0.42 + Math.random() * 0.3) * size);
      this.cone.visible = true;
    }
    this.flashShow = 0.04;
    // Seen in at least one drawn frame, however slow the frames are.
    this.flashFresh = true;
    // The cloud: puffs out of the muzzle that billow, hang and drift up; more for a shotgun.
    for (let i = 0; i < (size > 1.3 ? 5 : 3); i++) {
      const m = new THREE.Sprite(this.smokeMat.clone());
      m.position.copy(at).addScaledVector(dir ?? new THREE.Vector3(), 0.05 + i * 0.12);
      m.scale.setScalar(0.1 * size);
      m.material.rotation = Math.random() * 6;
      this.scene.add(m);
      const v = (dir ? dir.clone().multiplyScalar(0.8 + i * 0.6) : new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.18 + Math.random() * 0.15, (Math.random() - 0.5) * 0.25));
      const life = 2.2 + Math.random() * 1.8;
      this.live.push({ obj: m, left: life, total: life, v, kind: 'smoke', grow: 9 * size, base: 0.1 * size, alpha: 0.32, rise: 0.12 });
    }
    // Burning grains of powder out of the muzzle.
    if (dir)
      for (let i = 0; i < Math.round(4 * size); i++) {
        const m = new THREE.Mesh(this.dot, this.sparkMat);
        m.position.copy(at);
        m.scale.setScalar(0.25 + Math.random() * 0.25);
        const v = dir.clone().multiplyScalar(6 + Math.random() * 8).add(new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5));
        this.scene.add(m);
        this.live.push({ obj: m, left: 0.12 + Math.random() * 0.1, total: 0.2, v, kind: 'drop', gravity: true });
      }
  }

  // A spent case thrown out of the ejection port: it tumbles, hits the floor, rings, bounces and rolls to a stop.
  // kind: pistol | rifle | shell.
  shellMesh(kind = 'shell') {
    const M = gunMaterials();
    const g = new THREE.Group();
    if (kind === 'shell') {
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.052, 10), M.hull);
      hull.position.y = 0.008;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.0112, 0.0112, 0.016, 10), M.brass);
      base.position.y = -0.026;
      g.add(hull, base);
    } else {
      const len = kind === 'rifle' ? 0.045 : 0.019, r = kind === 'rifle' ? 0.0048 : 0.0049;
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(r * (kind === 'rifle' ? 0.65 : 1), r, len, 8), M.brass));
    }
    return g;
  }
  casing(at, dir, kind = 'pistol', audio = null) {
    let c;
    if (this.casings.length >= 60) {
      c = this.casings.shift();
      c.obj.removeFromParent();
    }
    const obj = this.shellMesh(kind);
    obj.position.copy(at);
    obj.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.scene.add(obj);
    const speed = kind === 'shell' ? 2.2 : 2.8 + Math.random() * 1.2;
    c = {
      obj, kind, audio, rested: false, age: 0,
      v: dir.clone().multiplyScalar(speed).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.6, (Math.random() - 0.5) * 0.6)),
      w: new THREE.Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40),
      bounces: 0
    };
    this.casings.push(c);
  }
  // The magazine she dropped: a copy of it falls from where it was, turning over.
  dropMag(mag, axis) {
    if (!mag) return;
    mag.updateMatrixWorld(true);
    const obj = mag.clone();
    obj.visible = true;
    mag.matrixWorld.decompose(obj.position, obj.quaternion, obj.scale);
    this.scene.add(obj);
    const down = (axis ?? new THREE.Vector3(0, -1, 0)).clone().transformDirection(mag.parent.matrixWorld);
    this.casings.push({ obj, kind: 'mag', rested: false, age: 0, v: down.multiplyScalar(1.6), w: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6), bounces: 0, audio: null });
  }
  // A puff of red where a bullet goes into one of them.
  mist(at, dir, size = 1) {
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Sprite(this.mistMat.clone());
      m.position.copy(at);
      m.material.rotation = Math.random() * 6;
      this.scene.add(m);
      const v = dir.clone().multiplyScalar(0.8 + i * 0.8).add(new THREE.Vector3(0, 0.2, 0));
      this.live.push({ obj: m, left: 0.3 + i * 0.1, total: 0.3 + i * 0.1, v, kind: 'smoke', grow: 5 * size, base: 0.1 * size, alpha: 0.85 });
    }
  }

  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, this.tracerMat.clone());
    this.scene.add(line);
    this.live.push({ obj: line, left: 0.08, total: 0.08, kind: 'tracer' });
  }

  blood(at, dir, n = 10, big = false) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.dot, this.bloodMat);
      m.position.copy(at);
      m.scale.setScalar(big ? 1.5 + Math.random() : 0.6 + Math.random() * 0.8);
      const v = dir.clone().multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3));
      this.scene.add(m);
      this.live.push({ obj: m, left: 0.7, total: 0.7, v, kind: 'drop', gravity: true });
    }
  }

  spark(at) {
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(this.dot, this.sparkMat);
      m.position.copy(at);
      m.scale.setScalar(0.5);
      const v = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4);
      this.scene.add(m);
      this.live.push({ obj: m, left: 0.3, total: 0.3, v, kind: 'drop', gravity: true });
    }
  }

  // A flat thing stuck to a surface at `at`, facing along `normal`, pooled in `list` up to `cap`.
  stick(list, cap, mat, at, normal, size, lift = 0.006) {
    let m;
    if (list.length >= cap) {
      m = list.shift();
      m.material = mat;
    } else {
      m = new THREE.Mesh(this.quad, mat);
      m.renderOrder = 2;
      this.scene.add(m);
    }
    m.position.copy(at).addScaledVector(normal, lift);
    m.lookAt(at.clone().add(normal));
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(size);
    list.push(m);
    return m;
  }

  // Where a bullet hit the building: a hole, a puff of plaster, sparks off metal.
  hole(at, normal, { metal = false } = {}) {
    this.stick(this.holes, 220, this.holeMat, at, normal, 0.07 + Math.random() * 0.03);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(this.puff, this.dustMat.clone());
      m.position.copy(at).addScaledVector(normal, 0.03);
      const v = normal.clone().multiplyScalar(0.6 + Math.random() * 1.2).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.5, (Math.random() - 0.5) * 0.6));
      this.scene.add(m);
      this.live.push({ obj: m, left: 0.6, total: 0.6, v, kind: 'dust', grow: 2.5 });
    }
    if (metal) this.spark(at);
    // A flash where it hits, and chips of plaster (or paint) flying off.
    const fl = new THREE.Sprite(this.sparkFlashMat);
    fl.position.copy(at).addScaledVector(normal, 0.02);
    fl.scale.setScalar(metal ? 0.22 : 0.14);
    this.scene.add(fl);
    this.live.push({ obj: fl, left: 0.04, total: 0.04, kind: 'flash' });
    for (let i = 0; i < (metal ? 2 : 5); i++) {
      const m = new THREE.Mesh(this.chipGeo, this.chipMat);
      m.position.copy(at).addScaledVector(normal, 0.02);
      m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      m.scale.setScalar(0.6 + Math.random());
      const v = normal.clone().multiplyScalar(1.5 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2));
      this.scene.add(m);
      this.live.push({ obj: m, left: 1.2, total: 1.2, v, kind: 'chip', gravity: true });
    }
  }

  // Blood flung onto a wall or the floor behind something that was hit.
  splat(at, normal, size = 0.5) {
    this.stick(this.splats, 90, this.splatMats[Math.floor(Math.random() * this.splatMats.length)], at, normal, size * (0.7 + Math.random() * 0.6), 0.008);
  }

  // A wound that stays on a body: stuck to the bone it hit (so it moves with the arm, the head), where the shot landed.
  // `center` is the bone's position, `at` the point on the hit sphere; the mark goes on the skin between them.
  wound(bone, center, at, size = 0.12) {
    const out = at.clone().sub(center);
    const len = out.length() || 1;
    out.divideScalar(len);
    const skin = center.clone().addScaledVector(out, len * 0.62);
    const m = new THREE.Mesh(this.quad, this.woundMat);
    m.position.copy(skin);
    m.lookAt(skin.clone().add(out));
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.setScalar(size * (0.8 + Math.random() * 0.5));
    m.renderOrder = 3;
    this.scene.add(m);
    m.updateMatrixWorld(true);
    bone.attach(m);
    return m;
  }

  // A dark pool on the floor. Kept (they tell the story of the fight); capped.
  decal(x, z, r = 0.5) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 14), this.decalMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 6;
    m.scale.set(1, 0.6 + Math.random() * 0.8, 1);
    m.position.set(x, 0.012, z);
    this.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > 80) {
      const old = this.decals.shift();
      old.removeFromParent();
      old.geometry.dispose();
    }
    return m;
  }

  update(dt) {
    if (this.flashFresh) this.flashFresh = false;
    else {
      if (this.flashLeft > 0) {
        this.flashLeft -= dt;
        this.flash.intensity *= Math.exp(-dt * 30);
        if (this.flashLeft <= 0) this.flash.intensity = 0;
      }
      if (this.flashShow > 0) {
        this.flashShow -= dt;
        if (this.flashShow <= 0) this.flashSprite.visible = this.cone.visible = false;
      }
    }
    for (const c of this.casings) {
      if (c.rested) {
        c.age += dt;
        continue;
      }
      c.age += dt;
      const steps = Math.max(1, Math.ceil(dt / 0.01));
      const h = dt / steps;
      for (let i = 0; i < steps && !c.rested; i++) {
        c.v.y -= 9.8 * h;
        c.obj.position.addScaledVector(c.v, h);
        c.obj.rotation.x += c.w.x * h;
        c.obj.rotation.y += c.w.y * h;
        c.obj.rotation.z += c.w.z * h;
        const floor = c.kind === 'mag' ? 0.02 : 0.006;
        if (c.obj.position.y < floor) {
          c.obj.position.y = floor;
          if (c.v.y < -0.4) {
            // A bounce: it rings (brass), clacks (a magazine), thuds (a shell).
            if (c.kind === 'mag') c.bounces === 0 && this.audio?.play('magDrop', c.obj.position);
            else if (c.bounces < 3) c.audio?.play(c.kind === 'shell' ? 'shellDrop' : 'casing', c.obj.position);
            c.bounces++;
            c.v.y *= -0.32;
            c.v.x *= 0.6;
            c.v.z *= 0.6;
            c.w.multiplyScalar(0.5);
          } else {
            // Rolling to a stop, lying on its side.
            c.v.set(c.v.x * 0.9, 0, c.v.z * 0.9);
            c.w.set(0, c.w.y * 0.9, 0);
            if (c.v.lengthSq() < 0.002) {
              c.rested = true;
              if (c.kind !== 'mag') c.obj.rotation.set(Math.PI / 2, c.obj.rotation.y, 0);
            }
          }
        }
      }
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.left -= dt;
      if (e.left <= 0) {
        e.obj.removeFromParent();
        if (e.kind === 'tracer') e.obj.geometry.dispose();
        if (e.kind === 'dust' || e.kind === 'smoke') e.obj.material.dispose();
        this.live.splice(i, 1);
        continue;
      }
      if (e.v) {
        if (e.gravity) e.v.y -= 9.8 * dt;
        else e.v.multiplyScalar(Math.max(0, 1 - dt * 4));
        if (e.rise) e.v.y += e.rise * dt;
        e.obj.position.addScaledVector(e.v, dt);
        if (e.obj.position.y < 0.02) {
          e.obj.position.y = 0.02;
          e.v.set(0, 0, 0);
        }
      }
      if (e.kind === 'tracer') e.obj.material.opacity = (e.left / e.total) * 0.8;
      if (e.kind === 'dust') {
        e.obj.scale.setScalar(1 + (1 - e.left / e.total) * e.grow);
        e.obj.material.opacity = (e.left / e.total) * 0.45;
      }
      if (e.kind === 'smoke') {
        const k = 1 - e.left / e.total;
        e.obj.scale.setScalar(e.base * (1 + k * e.grow));
        e.obj.material.opacity = (e.left / e.total) * e.alpha;
      }
    }
  }
}
