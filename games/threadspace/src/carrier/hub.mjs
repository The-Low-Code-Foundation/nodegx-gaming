// The hub rings (the spin-drum carrier): where you change from the weightless spine to a drum. Each half has one, a
// short ring that turns with the drum round the fixed spine. Its floor is `R` from the axis and moves at about walking
// pace (ωR, 2.6 m/s at 3.7 rpm); the spin gives it a tenth of a g. You drop through a hatch in the spine's floor, catch
// a handhold as it comes by, and you are in the ring's frame: walk round it to a spoke, where the lifts stand against
// its end walls (the outer deck's on the fore wall, the inner deck's on the aft), and ride down. Coming up, a lift
// lets you out into the ring, and anywhere along it you can push off up through the seal into the spine.
//
// The ring is too tight for the drums' trick of flat segments (a lift car would straddle several), so it is one curved
// room and you walk it in your own coordinates: the walker's x is the arc length `s` round the floor (0 at the half's
// segment 0, growing the way segment numbers do), z is along the ship, y is the floor (-R). `hubPlace()` turns that
// into a frame on the spinning half, for the camera; colliders and uses are in the same (s, y, z) space, on an
// `Interior` that draws nothing (its group is never in the scene). The visible ring hangs on the half's node.

import * as THREE from 'three';
import { Interior } from '../interiors.mjs';
import { liftCar } from './drum.mjs';
import { drawSign } from '../decor.mjs';
import { box, at, mat, glow } from '../util.mjs';

const LEN = 9; // metres along the ship: the half's corridor and three metres either side, for the lift cars
const CAR = { w: 2.4, d: 1.5 };

/** The hub ring of half `hid`, built the first time it is asked for: { hid, R, circ, z, omega, dir, g, node, I, lit,
 *  cars, you }. `node` is the ring as drawn (on the half's spinning node); `you` the frame `hubPlace` moves. */
export function hubRing(C, hid) {
  C.hubs ??= new Map();
  if (C.hubs.has(hid)) return C.hubs.get(hid);
  const D = C.L.drum, h = D.halves.find((x) => x.id === hid), hv = C.drums.halves.find((x) => x.id === hid);
  const R = D.hub.r + 0.9, inner = D.hub.spineR + 0.3, zc = (h.corridor[0] + h.corridor[1]) / 2;
  const z0 = zc - LEN / 2, z1 = zc + LEN / 2, circ = 2 * Math.PI * R, step = (2 * Math.PI) / D.sides;
  const omega = (h.rpm * 2 * Math.PI) / 60;
  const node = new THREE.Group();
  node.name = `hub-${hid}`;
  node.visible = false;
  hv.node.add(node);
  // The floor (seen from inside the drum: its inner face), the seal ring round the spine overhead, the end walls.
  const floorTex = plates(), floorMat = new THREE.MeshStandardMaterial({ map: floorTex, color: '#8a929c', roughness: 0.85, side: THREE.BackSide });
  floorTex.repeat.set(Math.round(circ / 2), 3);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R, LEN, 96, 1, true), floorMat);
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(inner, inner, LEN, 48, 1, true), mat('#2a2f36'));
  const slot = new THREE.Mesh(new THREE.CylinderGeometry(inner + 0.02, inner + 0.02, 1.2, 48, 1, true), glow('#ffb347', 0.5));
  for (const m of [floor, seal, slot]) (m.rotation.x = Math.PI / 2), (m.position.z = zc), node.add(m);
  const endMat = new THREE.MeshStandardMaterial({ color: '#59616b', roughness: 0.8, side: THREE.DoubleSide });
  for (const z of [z0, z1]) node.add(at(new THREE.Mesh(new THREE.RingGeometry(inner, R, 96, 1), endMat), 0, 0, z));
  // Handrails round the ring along both end walls, at hand height, and a line of handholds round the seal.
  const rail = mat('#c9a43a');
  for (const z of [z0 + 0.2, z1 - 0.2]) node.add(at(new THREE.Mesh(new THREE.TorusGeometry(R - 1.05, 0.03, 4, 96), rail), 0, 0, z));
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2, g = new THREE.Group();
    g.rotation.z = a;
    for (const z of [zc - 1.2, zc + 1.2]) g.add(at(box(0.5, 0.05, 0.05, rail), 0, -inner - 0.12, z));
    node.add(g);
  }
  // The lamps: a glowing strip on each end wall every eighth of the way round, and pool lights at them (lights.mjs).
  const lit = { lights: [] };
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * Math.PI * 2, g = new THREE.Group();
    g.rotation.z = a;
    node.add(g);
    for (const z of [z0 + 0.05, z1 - 0.05]) g.add(at(box(1.4, 0.12, 0.04, glow('#fff1d6')), 0, -R + 2.3, z));
    const anchor = new THREE.Object3D();
    anchor.position.set(0, -R + 2.2, zc);
    g.add(anchor);
    lit.lights.push({ anchor, color: new THREE.Color('#fff1d6'), intensity: 10, distance: 9, decay: 1.6 });
  }
  // Walking: an Interior that only holds colliders and uses, in (s, y, z).
  const I = new Interior(new THREE.Group(), -R);
  I.deck = { id: `hub-${hid}`, name: `${h.name}, hub ring` };
  I.ceiling = R - inner;
  I.hub = hid;
  I.collider(-1e4, -R, z0 - 2, 1e4, -R + 3, z0 + 0.1);
  I.collider(-1e4, -R, z1 - 0.1, 1e4, -R + 3, z1 + 2);
  // The lifts: at each spoke, one against each end wall, the outer deck's forward and the inner deck's aft.
  const cars = [];
  for (const seg of D.spokes.segments) {
    const s = seg * step * R;
    D.decks.forEach((dk, i) => {
      const fore = i === 0, zc2 = fore ? z0 + CAR.d / 2 + 0.1 : z1 - CAR.d / 2 - 0.1;
      const g = new THREE.Group();
      g.rotation.z = seg * step;
      const car = liftCar({ x: 0, z: 0, w: CAR.w, d: CAR.d });
      car.position.set(0, -R, zc2);
      car.rotation.y = fore ? 0 : Math.PI; // its door faces into the ring
      g.add(car);
      const t = `LIFT · ${dk.name.toUpperCase()}`;
      const sign = C.atlas.plane(1.7, 0.24, (cg, pw, ph) => drawSign(cg, pw, ph, t, '#ffb347'), 180);
      g.add(at(sign, 0, -R + 2.75, fore ? z0 + CAR.d + 0.25 : z1 - CAR.d - 0.25, 0, fore ? 0 : Math.PI, 0));
      node.add(g);
      const dz = fore ? 1 : -1, door = zc2 + dz * (CAR.d / 2 + 0.7);
      for (const ss of [s - circ, s, s + circ]) I.collider(ss - CAR.w / 2, -R, zc2 - CAR.d / 2, ss + CAR.w / 2, -R + 2.6, zc2 + CAR.d / 2);
      const c = { s, z: door, out: door + dz * 0.7, yaw: fore ? Math.PI : 0, deck: dk.id, seg }; // `out`: where a ride up lets you out, clear of the door
      for (const ss of [s - circ, s, s + circ]) I.use(`hub-lift-${hid}${dk.id}${seg}-${ss}`, `Take the lift down to the ${dk.name.toLowerCase()}`, ss, door, () => C.hooks.drum?.('down', { half: hid, deck: dk.id, seg }), { r: 1.9 });
      cars.push(c);
    });
  }
  const you = new THREE.Group();
  hv.node.add(you);
  const hub = { hid, h, R, inner, circ, z: [z0, z1], zc, omega, dir: h.dir, g: (omega * omega * R) / 9.81, node, I, lit, cars, you, hv };
  C.hubs.set(hid, hub);
  return hub;
}

/** Keeps `s` on the ring (0 to circ). */
export const wrap = (hub, s) => ((s % hub.circ) + hub.circ) % hub.circ;

/** Turns the frame `hub.you` to arc length `s`: in it, the floor under you is at (0, -R) and +x runs round the ring. */
export function hubPlace(hub, s) {
  hub.you.rotation.z = s / hub.R;
  hub.you.updateWorldMatrix(true, false);
  return hub.you;
}

/** The arc length of the floor straight below the fixed spine's floor now (where a handhold you catch from the spine's
 *  hatch is): the ship's -y, turned back by the half's spin. */
export function hubBelow(hub) {
  return wrap(hub, -hub.hv.node.rotation.z * hub.R);
}

/** A steel-plate floor, one 2 m plate per repeat, with a worn yellow walkway line. */
function plates() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#8a8f96';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 6, 1 + Math.random() * 3);
  }
  g.strokeStyle = '#4a4f56';
  g.lineWidth = 3;
  g.strokeRect(1, 1, 126, 126);
  g.fillStyle = 'rgba(216,165,48,0.45)';
  g.fillRect(56, 0, 16, 128);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The hatch in the spine's floor where you catch the hub ring: a frame round an opening, and below it the ring's
 *  handholds going by at the ring's speed (a strip whose texture runs, `C.anim`). */
export function hubHatch(C, I, x, z, dir, speed) {
  const y = I.floorY, frame = mat('#3a4048');
  for (const [w, d, ox, oz] of [[1.8, 0.15, 0, -0.85], [1.8, 0.15, 0, 0.85], [0.15, 1.8, -0.85, 0], [0.15, 1.8, 0.85, 0]]) I.group.add(at(box(w, 0.08, d, frame), x + ox, y + 0.04, z + oz));
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#05070a';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#c9a43a';
  for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 24, 8, 16, 48);
  g.fillStyle = 'rgba(255,241,214,0.35)';
  g.fillRect(0, 28, 256, 6);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.55), new THREE.MeshBasicMaterial({ map: tex }));
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(x, y + 0.01, z);
  I.group.add(strip);
  // The strip shows 1.55 m of ring; the texture is 4 handholds 1 m apart, so one repeat is 4 m.
  tex.repeat.set(1.55 / 4, 1);
  (C.anim ??= []).push((dt) => (tex.offset.x = (tex.offset.x - (dir * speed * dt) / 4) % 1)); // the floor below runs +x for dir 1
  const sign = C.atlas.plane(2.2, 0.26, (cg, pw, ph) => drawSign(cg, pw, ph, 'HUB RING · CATCH A HANDHOLD', '#ffb347'), 180);
  I.group.add(at(sign, x, y + 0.02, z - 1.15, -Math.PI / 2, 0, 0));
}
