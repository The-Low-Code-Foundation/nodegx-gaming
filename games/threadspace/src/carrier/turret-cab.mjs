// The gunner's cab: what you see from inside a turret you man (seats/gun.mjs, weapons/turrets.mjs).
//
// Built in code, in metres, whatever the mount's size: a turret mount's `scale` makes its gunhouse smaller, never the
// gunner. `u` (0 at a quarter-scale mount, 1 at a full-size one) picks between a cramped cab you fill (a small ship's
// twin mount) and a roomy armoured one (a capital ship's three-gun turret): the same parts, different room.
//
// Two groups:
//
// - `fixed`, a child of the turret's gunhouse, so it trains with the guns and rocks with their recoil: the armoured
//   box with its vision blocks (front, sides and overhead: the sight elevates to 80 degrees), the seat, the hoist
//   trunk you climb in by (a hatch in the floor behind the seat), the ready shells racked on the back wall, and the
//   hoist head by your left knee: the breech slide that slams back with each round, the tray where the next shell
//   comes up out of the hoist as the barrel comes ready and is rammed when you fire, the drum that turns a step a
//   round, and a small counter (ready rack, magazine, hoist).
// - `yoke`, in the scene, placed on the sight every frame: the sight unit you look through, the hand grips, and the
//   fire control repeater (weapons state, the designated target, its range and closing speed). Your sight moves as
//   fast as your hands; the gunhouse follows at the turret's rate, so when you swing the sight the cab comes round
//   after it. Zoomed (Z or the wheel) you are looking through the sight's optics and see none of this.
//
// The eye point (`t.eye`, in the gunhouse's frame) sits the cab on the gunhouse roof, clear of it by the cab's own
// floor; the model's own little cab and sight there (any roof fitting) are hidden while you are in it.
//
// `pose(p, …)` is the way in: p 0 at the foot of the trunk, 1 in the seat. Looks only: no seeded numbers, no shared
// scratch vectors, no Math.random.

import * as THREE from 'three';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => { const x = clamp(k, 0, 1); return x * x * (3 - 2 * x); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();

let M = null;
/** The cab's own materials (never the hull's: the cutaway's planes and the hull's tints sit on those). */
function mats() {
  if (M) return M;
  const L = (color, emissive = '#0b0a09', more = {}) => new THREE.MeshLambertMaterial({ color, emissive, flatShading: true, ...more });
  M = {
    paint: L('#5a655d', '#2c312d'),
    frame: L('#3a4040', '#1c2020'),
    dark: L('#22262a', '#131517'),
    floor: L('#2c3032', '#141616'),
    trunk: L('#3a4144', '#1e2221', { side: THREE.BackSide }),
    pad: L('#4a3a2c', '#0a0806'),
    brass: L('#b89146', '#2c1e08'),
    tip: L('#30343a', '#060606'),
    hazard: L('#c9a227', '#2a2006'),
    steel: L('#8a9299', '#101214'),
    red: new THREE.MeshBasicMaterial({ color: '#ff3b2a', toneMapped: false }),
    amber: new THREE.MeshBasicMaterial({ color: '#ffb23a', toneMapped: false }),
    green: new THREE.MeshBasicMaterial({ color: '#5dff9a', toneMapped: false })
  };
  return M;
}

const bx = (g, w, h, d, m, x, y, z) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.frustumCulled = false;
  g.add(o);
  return o;
};
const cy = (g, r, h, m, x, y, z, axis = 'y', seg = 10) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  o.position.set(x, y, z);
  if (axis === 'z') o.rotation.x = Math.PI / 2;
  if (axis === 'x') o.rotation.z = Math.PI / 2;
  o.frustumCulled = false;
  g.add(o);
  return o;
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
  o.position.set(x, y, z);
  o.frustumCulled = false;
  g.add(o);
  return { c, x: c.getContext('2d'), tex, mesh: o };
}

export class TurretCab {
  /** `t` a turret of `Weapons` (its `house`, `guns`, `s`), `scene` where the yoke goes. */
  constructor(t, scene) {
    this.t = t;
    const house = t.house, s = t.s;
    house.updateMatrixWorld(true);
    const k = (this.k = house.getWorldScale(new THREE.Vector3()).x || 1);
    const u = (this.u = clamp((k - 0.25) / 0.75, 0, 1));
    // Half width, front and back from the eye, roof above it, floor and sill below it, the posts' thickness.
    const D = (this.D = { W: lerp(0.55, 1.3, u), F: lerp(0.62, 0.9, u), B: lerp(1.15, 2.1, u), H: lerp(0.38, 0.6, u), D: lerp(0.8, 0.86, u), sill: lerp(0.3, 0.34, u), post: lerp(0.05, 0.11, u), big: u > 0.5 });

    // The gunhouse's roof, and what stands on it (the model's own cab and sight): hidden while you are in yours.
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
    this.shots = 0;
    this.ramT = 9;
    this.drawT = 0;
    this.build();
    this.buildYoke();
  }

  // --- building --------------------------------------------------------------------------------------------------------

  build() {
    const m = mats(), g = this.fixed, { W, F, B, H, D, sill, post, big } = this.D;
    const fy = -D, ry = H, sy = -sill, th = 0.06;
    const zs = B * 0.5; // where the side windows end and the armour is solid to the back wall
    // The front armour and its vision block: a framed window ahead of the seat. A big cab has a quarter light each
    // side of it as well.
    const wx = big ? 0.62 : 0.4, wy = ry - (big ? 0.1 : 0.07), zf = -F - th / 2;
    bx(g, 2 * W + 2 * th, sy - fy, th, m.paint, 0, (sy + fy) / 2, zf);
    bx(g, 2 * W + 2 * th, ry - wy, th, m.paint, 0, (ry + wy) / 2, zf);
    const pw = big ? 0.2 : W - wx; // the pillar beside the block
    for (const sx of [-1, 1]) {
      bx(g, pw, wy - sy, th, m.paint, sx * (wx + pw / 2), (wy + sy) / 2, zf);
      bx(g, 0.035, wy - sy, 0.08, m.frame, sx * (wx + 0.0175), (wy + sy) / 2, -F + 0.04); // the block's jambs
    }
    bx(g, 2 * wx + 0.07, 0.035, 0.08, m.frame, 0, wy + 0.0175, -F + 0.04);
    bx(g, 2 * W, 0.03, 0.1, m.frame, 0, sy + 0.005, -F + 0.05); // the sill's rail
    // The sides: armour below the sill, a window forward, solid armour aft; the back wall.
    for (const sx of [-1, 1]) {
      bx(g, th, sy - fy, F + zs, m.paint, sx * (W + th / 2), (sy + fy) / 2, (zs - F) / 2);
      bx(g, th, ry - fy, B - zs, m.paint, sx * (W + th / 2), (ry + fy) / 2, (B + zs) / 2);
      bx(g, 0.1, 0.03, F + zs, m.frame, sx * (W - 0.05), sy + 0.005, (zs - F) / 2);
      bx(g, post, ry - sy, post, m.frame, sx * (W - post / 2), (ry + sy) / 2, -F + post / 2); // the corner posts
      bx(g, post, post, F + zs, m.frame, sx * (W - post / 2), ry - post / 2, (zs - F) / 2); // the roof's side beams
      if (big) bx(g, post * 0.7, ry - sy, post * 0.7, m.frame, sx * (W - post * 0.35), (ry + sy) / 2, (zs - F) / 2 - 0.1);
    }
    bx(g, 2 * W + 2 * th, ry - fy, th, m.paint, 0, (ry + fy) / 2, B + th / 2);
    // The roof: armour, but for the overhead vision block over your head (the sight elevates to 80 degrees).
    const ox = big ? 0.5 : 0.34, oz0 = -F + 0.08, zr = big ? 0.42 : 0.27;
    bx(g, 2 * W + 2 * th, th, B - zr, m.paint, 0, ry + th / 2, (B + zr) / 2);
    bx(g, 2 * ox, th, oz0 + F, m.paint, 0, ry + th / 2, (oz0 - F) / 2);
    for (const sx of [-1, 1]) {
      bx(g, W + th - ox, th, zr + F, m.paint, sx * (W + th + ox) / 2, ry + th / 2, (zr - F) / 2);
      bx(g, 0.035, 0.06, zr - oz0, m.frame, sx * (ox + 0.0175), ry - 0.03, (zr + oz0) / 2);
    }
    bx(g, 2 * ox + 0.07, 0.06, 0.035, m.frame, 0, ry - 0.03, oz0 - 0.0175);
    bx(g, 2 * ox + 0.07, 0.06, 0.035, m.frame, 0, ry - 0.03, zr + 0.0175);
    bx(g, 0.16, 0.03, 0.08, m.red, 0, ry - 0.02, zr + 0.3 * (B - zr)); // the battle lamp
    // The floor, with the hatch of the hoist trunk behind the seat, its cover stood open against the back wall.
    const hw = big ? 0.36 : 0.3, hz1 = B - 0.14, hz0 = hz1 - (big ? 0.7 : 0.58), hzc = (this.hz = (hz0 + hz1) / 2);
    bx(g, 2 * W, th, hz0 + F, m.floor, 0, fy - th / 2, (hz0 - F) / 2);
    bx(g, 2 * W, th, B - hz1, m.floor, 0, fy - th / 2, (B + hz1) / 2);
    for (const sx of [-1, 1]) {
      bx(g, W - hw, th, hz1 - hz0, m.floor, sx * (W + hw) / 2, fy - th / 2, hzc);
      bx(g, 0.04, 0.05, hz1 - hz0, m.hazard, sx * (hw + 0.02), fy + 0.025, hzc);
    }
    bx(g, 2 * hw + 0.08, 0.05, 0.04, m.hazard, 0, fy + 0.025, hz0 - 0.02);
    bx(g, 2 * hw, hz1 - hz0, 0.035, m.steel, 0, fy + 0.06 + (hz1 - hz0) / 2, B - 0.03).rotation.x = -0.08;
    // The trunk itself: a square shaft with rungs up its after side and a work lamp.
    const TL = (this.trunkL = 3.2);
    bx(g, 2 * hw, TL, hz1 - hz0, m.trunk, 0, fy - TL / 2 - th, hzc);
    for (let i = 0; i < 10; i++) bx(g, 0.34, 0.025, 0.025, m.steel, 0, fy - 0.2 - i * 0.3, hz1 - 0.05);
    bx(g, 0.1, 0.05, 0.02, m.amber, 0, fy - 1.3, hz0 + 0.012);
    // The seat: pan, back, bolsters and its pedestal.
    bx(g, 0.44, 0.07, 0.44, m.pad, 0, -0.6, 0.12);
    bx(g, 0.44, 0.44, 0.07, m.pad, 0, -0.38, 0.37).rotation.x = 0.1;
    for (const sx of [-1, 1]) bx(g, 0.05, 0.18, 0.4, m.frame, sx * 0.245, -0.5, 0.14);
    bx(g, 0.18, D - 0.63, 0.18, m.dark, 0, (fy - 0.63) / 2, 0.12);
    // Ready shells racked along the back wall (dressing: the count is on the hoist's counter).
    const n = big ? 7 : 2;
    for (let i = 0; i < n; i++) {
      for (const sx of [-1, 1]) {
        const x = sx * (hw + 0.12 + (i + 0.5) * (W - hw - 0.14) / n);
        cy(g, 0.045, 0.34, m.brass, x, fy + 0.2, B - 0.09);
        cy(g, 0.03, 0.1, m.tip, x, fy + 0.42, B - 0.09);
      }
    }
    for (const sx of [-1, 1]) bx(g, W - hw - 0.1, 0.03, 0.14, m.frame, sx * (W + hw + 0.1) / 2, fy + 0.3, B - 0.09);

    // The hoist head, by your left knee against the front armour: on its top the loading tray and the round on it,
    // the breech's slide, the ready drum behind them, and its counter.
    const h = (this.hoist = new THREE.Group());
    const hx = -0.36 * F - 0.12, hz = -(F - 0.2), topY = sy + 0.04;
    h.position.set(hx, topY, hz);
    g.add(h);
    bx(h, 0.4, topY - fy, 0.32, m.dark, 0, -(topY - fy) / 2, 0); // the hoist's casing, floor to sill
    bx(h, 0.42, 0.03, 0.34, m.frame, 0, 0, 0);
    bx(h, 0.11, 0.02, 0.3, m.steel, -0.13, 0.03, 0); // the loading tray
    for (const sx of [-1, 1]) bx(h, 0.012, 0.035, 0.3, m.steel, -0.13 + sx * 0.055, 0.045, 0);
    this.shell = new THREE.Group(); // the round on the tray: its case and its nose, pointing forward
    cy(this.shell, 0.038, 0.17, m.brass, 0, 0, 0.05, 'z');
    cy(this.shell, 0.03, 0.09, m.tip, 0, 0, -0.08, 'z');
    this.shellAt = new THREE.Vector3(-0.13, 0.08, 0);
    this.shell.position.copy(this.shellAt);
    h.add(this.shell);
    this.slide = bx(h, 0.075, 0.07, 0.17, m.steel, -0.02, 0.065, -0.04); // the breech's slide: back with every round
    bx(this.slide, 0.03, 0.03, 0.2, m.frame, 0, 0, -0.16);
    this.slideZ = this.slide.position.z;
    this.drum = new THREE.Group(); // the ready drum: a step a round
    this.drum.position.set(-0.07, 0.015, 0.2);
    cy(this.drum, 0.08, 0.06, m.frame, 0, 0.03, 0);
    this.drumShells = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.drumShells.push(cy(this.drum, 0.02, 0.07, m.brass, Math.cos(a) * 0.052, 0.09, Math.sin(a) * 0.052));
    }
    h.add(this.drum);
    this.lamp = bx(h, 0.03, 0.02, 0.03, m.green, 0.04, 0.025, -0.12); // green: a round up and the barrel ready
    // Its counter, standing on the casing's inboard edge, turned to you.
    const cs = lerp(0.68, 1, this.u); // smaller where it is nearer
    this.counter = screen(g, 0.15 * cs, 0.075 * cs, 256, hx + 0.125, topY + 0.02 + 0.04 * cs + 0.035 * (1 - this.u), hz + 0.04);
    const bezel = bx(g, 0.165 * cs, 0.09 * cs, 0.02, m.frame, hx + 0.125, topY + 0.02 + 0.04 * cs + 0.035 * (1 - this.u), hz + 0.04);
    for (const o of [this.counter.mesh, bezel]) face(o);
    bezel.translateZ(-0.012);
  }

  buildYoke() {
    const m = mats(), y = this.yoke;
    // The sight unit: its housing overhead on its arm, and the frame of the glass you look through.
    bx(y, 0.15, 0.065, 0.14, m.dark, 0, 0.175, -0.48);
    bx(y, 0.045, 0.3, 0.045, m.frame, 0, 0.35, -0.44);
    for (const sx of [-1, 1]) bx(y, 0.008, 0.2, 0.01, m.frame, sx * 0.085, 0.045, -0.5);
    bx(y, 0.178, 0.008, 0.01, m.frame, 0, -0.058, -0.5);
    // The hand grips on their bar, the firing key under the right thumb.
    bx(y, 0.05, 0.3, 0.05, m.dark, 0, -0.4, -0.41);
    bx(y, 0.26, 0.028, 0.032, m.frame, 0, -0.245, -0.42);
    for (const sx of [-1, 1]) cy(y, 0.02, 0.12, m.pad, sx * 0.105, -0.19, -0.42);
    bx(y, 0.022, 0.014, 0.022, m.red, 0.105, -0.125, -0.42);
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
      for (const o of this.fittings) o.visible = !on;
    }
    this.fixed.visible = on && seen;
    this.yoke.visible = on && seen;
  }

  /** The camera `p` of the way in (0 the foot of the trunk, 1 seated), given the seat's own pose (`seatP`, `seatQ`:
   *  world). Up the rungs looking up the shaft, head through the hatch, over the seat's back and down into it. */
  pose(p, camera, seatP, seatQ) {
    if (p >= 1) return;
    const { D } = this.D, hz = this.hz;
    const a = clamp(p / 0.56, 0, 1), b = smooth((p - 0.56) / 0.24), c = smooth((p - 0.8) / 0.2);
    // The climb: hand over hand, a rung at a time.
    const climb = a - 0.035 * Math.sin(a * Math.PI * 2 * 5) * (1 - a);
    _v.set(0.05 * Math.sin(a * Math.PI * 5) * (1 - a), lerp(-D - 2.5, -0.12, climb), hz);
    _v.lerp(_w.set(0, 0.1, 0.42), b).lerp(_w.set(0, 0, 0), c);
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
    // The breech's slide follows the guns' own run-back (weapons/turrets.mjs).
    const rt = t.recoilT ?? 9;
    const run = rt < 0.05 ? rt / 0.05 : Math.exp(-(rt - 0.05) * 3.2) * (1 + (rt - 0.05) * 3.2);
    this.slide.position.z = this.slideZ + 0.13 * run;
    if (t.ready < (this.lastReady ?? t.ready)) (this.shots += this.lastReady - t.ready), (this.ramT = 0); // a round went
    this.lastReady = t.ready;
    this.ramT += dt;
    // The round on the tray: rammed as you fire, the next one up out of the hoist as the barrel comes ready.
    const cool = Math.max(0, t.cool[t.barrel]);
    const up = 1 - clamp(cool / (G.reload * 0.7), 0, 1);
    const sh = this.shell;
    if (this.ramT < 0.14) {
      sh.visible = true;
      sh.position.copy(this.shellAt).z = -0.34 * (this.ramT / 0.14);
    } else {
      sh.visible = t.ready > 0 && up > 0.02;
      sh.position.copy(this.shellAt).y -= 0.2 * (1 - smooth(up));
    }
    this.lamp.material = t.out || t.ready <= 0 ? m.red : cool > 0 ? m.amber : m.green;
    const want = this.shots * (Math.PI / 3);
    this.drum.rotation.y += (want - this.drum.rotation.y) * Math.min(1, dt * 9);
    this.drumShells.forEach((o, i) => (o.visible = i < t.ready));
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
