// The rescue craft's looks (rescue.mjs flies them): a tug and a tanker built as working spacecraft, not fighters
// painted yellow. Both share a chassis: a pressurised cab forward with its window band, floodlights and docking
// lights; an open truss spine behind it carrying the propellant; manoeuvring quads at the four corners fore and aft;
// a radiator pair; and the drive at the stern. What differs is what they carry:
//
// - The tug: two spherical tanks inside the truss, and at the stern a heavy tow frame with a winch and the bar's
//   coupling. Her drive is two bells on outriggers, canted outward, so the exhaust clears whatever is on the bar
//   behind her (a real tug's engines are canted for the same reason).
// - The tanker: a long cylindrical tank of fuel for others, wrapped in its insulation and banded, a hose reel and
//   boom under her, one bell on the centre line.
//
// -z is her nose, x starboard, y up, metres. `craftMesh(kind)` returns the group; `craftThrust(o, k, t)` lights her
// drive (k 0 to 1); `o.userData.nozzles` are her bells' mouths (local), for the exhaust gas; `userData.beacon` her
// strobe. Looks only.

import * as THREE from 'three';
import { metal } from '../ships.mjs';
import { at, box, cyl, glow } from '../util.mjs';
import { hazardMat } from '../decor.mjs';
import { flareTex } from './weapons/shared.mjs';
import { motorFlame, flameFrame } from './weapons/tracers.mjs';

const WHITE = () => metal('#d9dcdf', { rough: 0.6, metalness: 0.2, plated: false });
const GREY = () => metal('#5d646d', { rough: 0.5, metalness: 0.5 });
const DARK = () => metal('#2a2e34', { rough: 0.55, metalness: 0.5, plated: false });
const GLASS = new THREE.MeshStandardMaterial({ color: '#14202c', roughness: 0.1, metalness: 0.8, emissive: '#1c3446', emissiveIntensity: 0.6, flatShading: true });
const BELL = new THREE.MeshStandardMaterial({ color: '#3b342e', roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide, flatShading: true });
const FOAM = () => metal('#d47a2e', { rough: 0.85, metalness: 0.05 }); // insulation, the colour of a launch vehicle's foam

/** A bar from `a` to `b` (local points), `r` thick: the truss's members. */
function strut(a, b, r, m) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 5), m);
  s.position.lerpVectors(a, b, 0.5);
  s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return s;
}

/** An open truss of square section `w` from z0 to z1: four longerons, a frame at each bay, a diagonal on each face. */
function truss(g, w, y, z0, z1, bays, m) {
  const h = w / 2, V = (x, yy, z) => new THREE.Vector3(x, y + yy, z);
  const corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
  for (const [x, yy] of corners) g.add(strut(V(x, yy, z0), V(x, yy, z1), 0.07, m));
  for (let i = 0; i <= bays; i++) {
    const z = z0 + ((z1 - z0) * i) / bays;
    for (let k = 0; k < 4; k++) {
      const [x0, y0] = corners[k], [x1, y1] = corners[(k + 1) % 4];
      g.add(strut(V(x0, y0, z), V(x1, y1, z), 0.05, m));
      if (i < bays) {
        const zn = z0 + ((z1 - z0) * (i + 1)) / bays;
        g.add(strut(V(x0, y0, (i % 2 ? z : zn)), V(x1, y1, (i % 2 ? zn : z)), 0.035, m));
      }
    }
  }
}

/** A manoeuvring quad: a small block with four nozzles, at `p`, facing out along x by `side`. */
function quad(g, x, y, z, side, m, dark) {
  const q = new THREE.Group();
  q.add(box(0.34, 0.34, 0.34, m));
  for (const [dx, dy, dz, rx, rz] of [[0.24 * side, 0, 0, 0, Math.PI / 2], [0, 0.24, 0, 0, 0], [0, -0.24, 0, 0, 0], [0, 0, 0.24, Math.PI / 2, 0], [0, 0, -0.24, Math.PI / 2, 0]]) {
    q.add(at(cyl(0.05, 0.09, 0.14, dark, 6), dx, dy, dz, rx, 0, rz));
  }
  q.position.set(x, y, z);
  g.add(q);
}

/** A drive bell at `p`, firing along `dir` (local, unit), with its flame. */
function bell(g, p, dir, r, len, flameColor) {
  const b = new THREE.Group();
  b.add(at(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r, len, 14, 1, true), BELL), 0, 0, len / 2, Math.PI / 2));
  b.add(at(cyl(r * 0.4, r * 0.45, 0.4, DARK(), 10), 0, 0, -0.1, Math.PI / 2));
  const fl = motorFlame(r * 0.85, len * 4, flameColor);
  fl.position.z = len;
  b.add(fl);
  b.position.copy(p);
  b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  g.add(b);
  g.userData.flames.push(fl);
  g.userData.nozzles.push({ at: new THREE.Vector3().copy(p).addScaledVector(dir, len), dir: dir.clone() });
}

/** The cab: a pressure hull forward of the truss, its window band, the docking lights and floodlights. */
function cab(g, paint, len, z) {
  const w = 3.2, h = 2.6, body = metal(paint, { rough: 0.45, metalness: 0.2, plated: false }), white = WHITE(), dark = DARK();
  g.add(at(box(w, h, len, body), 0, 0, z));
  // The nose: chamfered, a lower and an upper slope over a flat face.
  g.add(at(box(w * 0.86, h * 0.72, 0.6, body), 0, -0.05, z - len / 2 - 0.3));
  g.add(at(box(w * 0.7, h * 0.3, 0.35, white), 0, -0.5, z - len / 2 - 0.7));
  // The windows: a band across the nose and down the sides' forward half.
  g.add(at(box(w * 0.8, 0.55, 0.05, GLASS), 0, 0.35, z - len / 2 - 0.62));
  for (const s of [-1, 1]) g.add(at(box(0.05, 0.42, len * 0.5, GLASS), s * (w / 2 + 0.01), 0.55, z - len * 0.2));
  // Hazard stripes along the cab's lower edge: she is a working craft, painted to be seen.
  const hz = hazardMat();
  for (const s of [-1, 1]) g.add(at(box(0.04, 0.22, len, hz), s * (w / 2 + 0.02), -h / 2 + 0.2, z));
  // A dish and a whip on top, the docking target on the nose.
  g.add(at(cyl(0.05, 0.05, 0.6, dark, 5), 0.8, h / 2 + 0.3, z + 0.4));
  g.add(at(cyl(0.45, 0.08, 0.18, white, 12), 0.8, h / 2 + 0.66, z + 0.4, 0.4));
  g.add(at(cyl(0.02, 0.02, 1.4, dark, 4), -0.9, h / 2 + 0.7, z + 0.8));
  // Floodlights either side of the nose, and her navigation lights: red to port, green to starboard.
  for (const s of [-1, 1]) {
    g.add(at(cyl(0.14, 0.18, 0.12, glow('#fff6dc'), 10), s * 1.25, -0.6, z - len / 2 - 0.55, Math.PI / 2));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glow(s < 0 ? '#ff3030' : '#30ff60')), s * (w / 2 + 0.06), 0.1, z - len / 2 + 0.2));
  }
  // Quads at the cab's four corners.
  for (const s of [-1, 1]) for (const y of [-1, 1]) quad(g, s * (w / 2 + 0.22), y * (h / 2 - 0.2), z + len / 2 - 0.4, s, GREY(), dark);
}

/** A radiator pair on short arms, either side of the truss at `z`. */
function radiators(g, y, z, span, len) {
  const fin = metal('#e8ebee', { rough: 0.3, metalness: 0.1, plated: false }), arm = GREY();
  for (const s of [-1, 1]) {
    g.add(at(box(span, 0.05, len, fin), s * (1.6 + span / 2), y, z));
    g.add(at(box(1.0, 0.12, 0.12, arm), s * 1.5, y, z));
    for (let i = -2; i <= 2; i++) g.add(at(box(span, 0.07, 0.04, arm), s * (1.6 + span / 2), y, z + (i * len) / 5));
  }
}

function tug(g) {
  const grey = GREY(), white = WHITE(), dark = DARK();
  cab(g, '#d9a01c', 3.6, -5.6);
  truss(g, 2.4, 0, -3.8, 4.4, 4, grey);
  // Two spherical propellant tanks in the truss, and the avionics box on top.
  for (const z of [-1.8, 1.6]) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 10), white), 0, 0, z));
  g.add(at(box(1.4, 0.6, 2.2, grey), 0, 1.5, -0.2));
  radiators(g, 1.25, 0.2, 2.2, 3.2);
  // The thrust frame at the stern, the outriggers and the two canted bells.
  g.add(at(box(2.8, 2.8, 0.3, dark), 0, 0, 4.55));
  for (const s of [-1, 1]) {
    g.add(at(box(2.2, 0.35, 0.5, grey), s * 1.9, 0, 4.4));
    g.add(at(cyl(0.45, 0.45, 1.0, grey, 10), s * 3.0, 0, 4.3, Math.PI / 2));
    bell(g, new THREE.Vector3(s * 3.0, 0, 4.8), new THREE.Vector3(s * 0.31, 0, 0.95).normalize(), 0.7, 1.5, '#ffb070');
    quad(g, s * 1.62, 1.42, 3.6, s, grey, dark);
    quad(g, s * 1.62, -1.42, 3.6, s, grey, dark);
  }
  // The tow frame: an A-frame off the thrust frame to the coupling, striped, with the winch drum across it.
  const hz = hazardMat();
  for (const s of [-1, 1]) for (const y of [-1, 1]) g.add(strut(new THREE.Vector3(s * 1.1, y * 1.1, 4.7), new THREE.Vector3(0, 0.1, 5.15), 0.11, hz));
  g.add(at(cyl(0.42, 0.42, 1.8, dark, 12), 0, 0.1, 4.95, 0, 0, Math.PI / 2));
  g.add(at(cyl(0.25, 0.35, 0.4, metal('#c8c8c8', { metalness: 0.8, plated: false }), 12), 0, 0.1, 5.25, Math.PI / 2));
}

function tanker(g) {
  const grey = GREY(), white = WHITE(), dark = DARK(), foam = FOAM();
  cab(g, '#e6e8ea', 3.6, -7.6);
  truss(g, 3.6, 0, -5.8, 6.6, 6, grey);
  // The cargo tank: a long cylinder in its foam, banded, with domed ends.
  g.add(at(cyl(1.55, 1.55, 9.4, foam, 20), 0, 0, 0.4, Math.PI / 2));
  for (const z of [-4.3, 5.1]) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(1.55, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), foam), 0, 0, z, z < 0 ? -Math.PI / 2 : Math.PI / 2));
  for (const z of [-3.4, -1, 1.4, 3.8]) g.add(at(cyl(1.6, 1.6, 0.16, dark, 20), 0, 0, z, Math.PI / 2));
  g.add(at(box(0.12, 0.12, 9.4, white), 0, 1.6, 0.4)); // the feed line along her back
  radiators(g, 1.95, -0.2, 2.6, 4);
  // The hose reel and its boom down to the hose's mouth (rescue.mjs `hoseAt`: 0, -3.6, 2.2).
  g.add(at(box(1.6, 0.5, 1.6, grey), 0, -1.9, 2.2));
  g.add(at(cyl(0.6, 0.6, 1.1, dark, 14), 0, -2.5, 2.2, 0, 0, Math.PI / 2));
  g.add(at(box(0.22, 1.1, 0.22, hazardMat()), 0, -3.05, 2.2));
  g.add(at(cyl(0.16, 0.24, 0.3, metal('#c8c8c8', { metalness: 0.8, plated: false }), 10), 0, -3.6, 2.2));
  // The thrust frame and one bell, and the quads at the stern.
  g.add(at(box(3.8, 3.8, 0.3, dark), 0, 0, 6.75));
  bell(g, new THREE.Vector3(0, 0, 6.95), new THREE.Vector3(0, 0, 1), 0.95, 1.9, '#ffb070');
  for (const s of [-1, 1]) for (const y of [-1, 1]) quad(g, s * 2.02, y * 2.02, 6.2, s, grey, dark);
}

/** A rescue craft, `kind` 'tug' or 'tanker'. -z is her nose. */
export function craftMesh(kind) {
  const g = new THREE.Group();
  g.userData.flames = [];
  g.userData.nozzles = [];
  if (kind === 'tanker') tanker(g);
  else tug(g);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex(), color: '#ffb030', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  beacon.position.set(0, 1.9, kind === 'tanker' ? -7.2 : -5.2);
  g.add(beacon);
  g.userData.beacon = beacon;
  g.traverse((o) => (o.frustumCulled = false));
  return g;
}

/** Her drive lit at `k` (0 to 1), flickering with `t`. */
export function craftThrust(o, k, t) {
  for (const f of o.userData.flames ?? []) flameFrame(f, k > 0.03, Math.min(1, 0.35 + k), t);
}
