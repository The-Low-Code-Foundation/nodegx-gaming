// The cutter's flight deck (sets/cutter.mjs `flightDeck`, the `flight-deck` room): a small warship's bridge, its
// stations built like the real thing, and its screens live.
//
//   - The pilot, under the windows: a console with a sloped switch shelf (DRIVE, SYSTEMS), a throttle quadrant and a
//     side stick, and the instrument panel behind it: the FLIGHT display and a NAV repeater in bezels, two standby
//     dials, and the glareshield with its annunciator strip. The overhead panel above her (ELECTRICAL, LIFE SUPPORT,
//     PROPELLANT, LIGHTS). E at the couch takes the helm, as before.
//   - The gunner, on the starboard wall: WEAPONS, a FIRE CONTROL panel (the selector shows the weapons state), and the
//     turret's switches. E: the weapons state, round AUTO, HOLD, TIGHT, FREE (firecontrol.mjs `order` / `auto`), only
//     with the career's `firecontrol` unlock (else the career's refusal).
//   - The commander, on the port wall: NAV PLOT and CREW, a comms panel and a handset. E at the plot lays in a
//     waypoint or clears it (helmsight.mjs `toggleNav`, the helm's N: with the `helm` unlock); E at the crew screen
//     shows or hides the orders card (crew-orders.mjs `key('KeyO')`, as O does).
//   - The after bulkhead: the DAMAGE CONTROL board (every compartment in plan, by its health and its air) to
//     starboard of the door, the ENGINEERING panel to port (PLANT, the radiator switch, the main bus). E at the switch
//     spreads or folds the radiators (plant.mjs `toggleRadiators`, the helm's G).
//
// Every verb is the system's own; nothing here keeps state of its own. The screens are one canvas (`SCREENS`, regions
// `S`) on one unlit material, redrawn four times a second, and only while you are on the flight deck or at her helm;
// the engraved legends of every panel are a second canvas, drawn once, on one lit material. Each is a single merged
// mesh. The selector's pointer and the radiator lever move with what they show (two small live meshes); the rest is
// boxes and cylinders on the sets' palette, baked with the room. No lights: the room's own lamps light it.
//
// The live numbers come through `hooks.game()` (main.mjs `G`); a cutter built without it (carried in the host's
// hangar, seen from outside) shows her screens on standby.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, at, mat, glow } from '../../util.mjs';
import { P, couch, place } from './parts.mjs';
import { mark, text, MONO } from './paper.mjs';
import { HELM_ORDERS } from '../crew-orders.mjs';

// --- the two canvases ------------------------------------------------------------------------------------------------

const SCREENS = 1024; // px, square
/** The live screens' regions on `SCREENS`: [x, y, w, h] px. */
const S = {
  flight: [0, 0, 512, 300], nav: [512, 0, 512, 300],
  weapons: [0, 300, 512, 300], crew: [512, 300, 512, 300],
  status: [0, 600, 640, 360], plant: [640, 600, 384, 360],
  annun: [0, 960, 1024, 64]
};
const FACES = 1024; // px, square: the legends, packed as they are asked for
const PPM = 520; // legend pixels a metre
const WALL = 0.1; // the lining's face, in from a room's box (as the wall screens stand)

const BG = '#040a0f', GRID = 'rgba(90,170,255,0.16)', DIM = '#4f6b80', TEXT = '#cfe8ff';
const GREEN = '#7dffb0', AMBER = '#ffc24a', RED = '#ff5a4a', BLUE = '#8fc4ff';
const ENGRAVE = '#e6e9ea', PANEL = '#2b3138';

const pct = (v) => `${Math.round(v * 100)}%`;
const km = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(d < 10000 ? 2 : 1)} km`);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const JOB = { helm: 'HELM', gun: 'GUN', repair: 'REPAIRS', standby: 'STANDBY' };
const FC_CYCLE = ['auto', 'hold', 'tight', 'free'];
const FC_COL = { hold: RED, tight: AMBER, free: GREEN };
const STOP = 0.75; // radians between a selector's stops

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4();

// --- building ---------------------------------------------------------------------------------------------------------

/** The quads of one canvas, collected while the stations are built and merged into one mesh at the end. */
class Sheet {
  constructor(size, material) {
    this.c = document.createElement('canvas');
    this.c.width = this.c.height = size;
    this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.material = material(this.tex);
    this.quads = [];
    this.pack = { x: 0, y: 0, row: 0 };
  }

  /** A quad `w` × `h` m showing region `r` ([x, y, w, h] px), at `o` (an empty Object3D in the station's group). */
  quad(o, w, h, r) {
    this.quads.push({ o, w, h, r });
  }

  /** Room for a legend `pw` × `ph` px: the next free place on the sheet. */
  alloc(pw, ph) {
    const K = this.pack, size = this.c.width;
    if (K.x + pw > size) (K.x = 0), (K.y += K.row + 2), (K.row = 0);
    const r = [K.x, K.y, pw, ph];
    K.x += pw + 2;
    K.row = Math.max(K.row, ph);
    return r;
  }

  /** One mesh of every quad, in `root`'s frame (the deck's group). */
  build(root) {
    const size = this.c.width, geos = [];
    for (const { o, w, h, r } of this.quads) {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv;
      const [u0, u1, v0, v1] = [r[0] / size, (r[0] + r[2]) / size, 1 - (r[1] + r[3]) / size, 1 - r[1] / size];
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      g.applyMatrix4(rel(o, root));
      geos.push(g);
      o.removeFromParent();
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos), this.material);
    mesh.userData.live = true; // its own mesh: the room's bake leaves it be
    root.add(mesh);
    this.tex.needsUpdate = true;
    return mesh;
  }
}

/** `o`'s matrix in `root`'s frame (up through its parents; nothing need be in the scene yet). */
function rel(o, root) {
  const M = new THREE.Matrix4();
  for (let p = o; p && p !== root; p = p.parent) p.updateMatrix(), M.premultiply(p.matrix);
  return M;
}

/** An empty marker in `g` at (x, y, z), turned `rx` about x. */
const pin = (g, x, y, z, rx = 0) => {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.rotation.x = rx;
  g.add(o);
  return o;
};

const M = {
  body: mat('#272d35'), face: mat('#1b2027'), bezel: mat('#101317'), lip: mat('#3a424c'), shelf: mat('#2b3442'),
  knob: mat('#c9ccd0'), guard: mat('#b8322c'), stripe: mat('#d8a530'), handset: mat('#191b1f'), cord: mat('#0f1012')
};

/** A screen in a bezel on face `g` (which faces +z), centred at (x, y): the frame, a lip round it, a row of soft keys
 *  under it, and the screen itself, region `r` of the screens' sheet. */
function bezel(F, g, x, y, w, h, r) {
  g.add(at(box(w + 0.07, h + 0.1, 0.03, M.bezel), x, y - 0.012, 0.015));
  for (const s of [-1, 1]) {
    g.add(at(box(w + 0.07, 0.012, 0.012, M.lip), x, y - 0.012 + s * (h / 2 + 0.05), 0.034));
    g.add(at(box(0.012, h + 0.1, 0.012, M.lip), x + s * (w / 2 + 0.035), y - 0.012, 0.034));
  }
  const n = Math.max(3, Math.round(w / 0.09));
  for (let i = 0; i < n; i++) g.add(at(box(0.03, 0.014, 0.01, P.grey), x - w / 2 + (w * (i + 0.5)) / n, y - h / 2 - 0.03, 0.033));
  F.screens.quad(pin(g, x, y, 0.0315), w, h, r);
}

/** A switch panel on face `g` at (x, y), `w` × `h` m: a plate with its title and a legend under every item, engraved
 *  (the legends' sheet), and the switches themselves. `items`: { kind: 'toggle' | 'guard' | 'rotary' | 'lamp' | 'push'
 *  | 'breaker', label, color }, laid out `per` to a row. Returns the items' markers, for a live part to hang on. */
function switchPanel(F, g, x, y, w, h, title, items, { per = items.length, color = PANEL } = {}) {
  g.add(at(box(w, h, 0.012, M.face), x, y, 0.006));
  const rows = Math.ceil(items.length / per), th = 0.034;
  const cw = w / per, rh = (h - th - 0.01) / rows;
  // The engraved plate: its title on a band, each item's legend under where it sits.
  const pw = Math.round(w * PPM), ph = Math.round(h * PPM), r = F.faces.alloc(pw, ph);
  const c = F.faces.g, k = PPM;
  c.save();
  c.translate(r[0], r[1]);
  c.fillStyle = color;
  c.fillRect(0, 0, pw, ph);
  c.strokeStyle = 'rgba(255,255,255,0.22)';
  c.lineWidth = 2;
  c.strokeRect(2, 2, pw - 4, ph - 4);
  c.fillStyle = '#1a1e23';
  c.fillRect(4, 4, pw - 8, th * k - 4);
  text(c, title, pw / 2, (th * k) / 2 + 2, MONO(th * k * 0.62, 800), ENGRAVE, 'center', pw - 12);
  const out = [];
  items.forEach((it, i) => {
    const col = i % per, row = Math.floor(i / per);
    const ix = -w / 2 + cw * (col + 0.5), iy = h / 2 - th - 0.01 - rh * (row + 0.42);
    const lx = (ix + w / 2) * k, ly = (h / 2 - iy + rh * 0.36) * k;
    if (it.label) text(c, it.label, lx, ly, MONO(Math.min(cw * k * 0.17, rh * k * 0.2), 700), ENGRAVE, 'center', cw * k - 6);
    if (it.kind === 'guard' || it.kind === 'rotary') {
      // A box round it (yellow and black for a guarded switch).
      c.strokeStyle = it.kind === 'guard' ? '#d8a530' : 'rgba(255,255,255,0.4)';
      c.lineWidth = 3;
      c.strokeRect(lx - cw * k * 0.36, (h / 2 - iy) * k - rh * k * 0.36, cw * k * 0.72, rh * k * 0.56);
    }
    if (it.kind === 'rotary' && it.stops) {
      // The selector's stops round its knob.
      // (On an arc above it, `STOP` apart: the pointer turns the same angle to each, `selectorAngle`.)
      it.stops.forEach((s, j) => {
        const a = (j - (it.stops.length - 1) / 2) * STOP;
        text(c, s, lx + Math.sin(a) * cw * k * 0.4, (h / 2 - iy) * k - Math.cos(a) * rh * k * 0.3, MONO(rh * k * 0.12, 800), it.colors?.[j] ?? ENGRAVE, 'center');
      });
    }
    out.push(item(g, x + ix, y + iy, it));
  });
  c.restore();
  F.faces.quad(pin(g, x, y, 0.0125), w, h, r);
  return out;
}

/** One switch on a panel face at (x, y): its body, and its marker (what moves hangs on it). */
function item(g, x, y, it) {
  const o = pin(g, x, y, 0.012);
  switch (it.kind) {
    case 'toggle':
    case 'guard': {
      o.add(at(cyl(0.008, 0.008, 0.008, P.chrome, 8), 0, 0, 0.004, Math.PI / 2, 0, 0));
      if (!it.bare) o.add(at(box(0.005, 0.005, 0.03, P.chrome), 0, 0.006, 0.016, -0.45, 0, 0)); // `bare`: its lever is live
      if (it.kind === 'guard') o.add(at(box(0.026, 0.03, 0.022, M.guard), 0, 0.004, 0.014));
      break;
    }
    case 'rotary':
      o.add(at(cyl(0.02, 0.022, 0.016, P.black, 12), 0, 0, 0.008, Math.PI / 2, 0, 0));
      break;
    case 'push':
      o.add(at(box(0.024, 0.016, 0.01, glow(it.color ?? '#3a8ad0', 0.95)), 0, 0, 0.005));
      break;
    case 'breaker':
      o.add(at(cyl(0.006, 0.006, 0.014, P.black, 8), 0, 0, 0.007, Math.PI / 2, 0, 0));
      break;
    case 'lamp':
    default:
      o.add(at(cyl(0.008, 0.008, 0.008, glow(it.color ?? '#39d27a'), 8), 0, 0, 0.004, Math.PI / 2, 0, 0));
  }
  return o;
}

/** A dial on a face: a bezel ring and a dark face with a needle. */
function dial(g, x, y, r, needle = 0.6) {
  g.add(at(cyl(r + 0.008, r + 0.008, 0.02, M.bezel, 16), x, y, 0.01, Math.PI / 2, 0, 0));
  g.add(at(cyl(r, r, 0.004, mat('#0d1418'), 16), x, y, 0.022, Math.PI / 2, 0, 0));
  g.add(at(box(0.004, r * 0.85, 0.003, glow('#e8f0f0')), x + Math.sin(needle) * r * 0.42, y + Math.cos(needle) * r * 0.42, 0.026, 0, 0, -needle));
}

/** A console's carcass: a body to `bh` high and `d` deep, its back at local z `z0`, a toe kick, cheeks, and a switch
 *  shelf sloping toward whoever works it. Returns the shelf's face group (its +z up and toward you). */
function carcass(g, w, d, z0, bh = 0.64) {
  g.add(at(box(w, bh, d, M.body), 0, bh / 2, z0 + d / 2));
  g.add(at(box(w - 0.04, 0.06, 0.06, P.black), 0, 0.03, z0 + d + 0.02)); // toe kick
  for (const s of [-1, 1]) g.add(at(box(0.05, bh + 0.08, d + 0.08, P.steel), s * (w / 2 + 0.02), (bh + 0.08) / 2, z0 + d / 2 + 0.02));
  const shelf = new THREE.Group();
  shelf.position.set(0, bh + 0.02, z0 + d - 0.08);
  shelf.rotation.x = -Math.PI / 2 + 0.22;
  shelf.add(at(box(w, 0.36, 0.035, M.shelf), 0, 0, -0.018));
  shelf.add(at(box(w, 0.02, 0.05, P.dark), 0, -0.18, -0.01)); // its rounded front edge, to rest a wrist on
  g.add(shelf);
  return shelf;
}

/** An upright instrument panel behind a console: a face `w` × `h` at height `y`, its back toward local -z, leant back
 *  `lean`. Returns the face group (+z toward you). */
function panelFace(g, w, h, y, z, lean = -0.3) {
  const f = new THREE.Group();
  f.position.set(0, y, z);
  f.rotation.x = lean;
  f.add(at(box(w, h, 0.05, M.face), 0, 0, -0.025));
  f.add(at(box(w + 0.04, 0.03, 0.08, M.lip), 0, h / 2 + 0.015, -0.01)); // its top rail
  g.add(f);
  return f;
}

// --- the set ---------------------------------------------------------------------------------------------------------

export function flightDeck(C, I, c, hooks) {
  const [x1, x2] = c.x, [, z2] = c.z, y0 = I.floorY, L = C.L;
  const [hx, hz] = L.helm?.at ?? [0, c.z[0] + 2];
  const K = L.couches ?? {};
  const F = {
    screens: new Sheet(SCREENS, (map) => new THREE.MeshBasicMaterial({ map, toneMapped: false })),
    faces: new Sheet(FACES, (map) => new THREE.MeshLambertMaterial({ map }))
  };
  const live = {}; // what moves: the selector's pointer, the radiator lever
  const uses = []; // [marker, id, label, fn, r]

  // The pilot: the console under the windows, the couch behind it. E at the couch takes the helm.
  {
    const g = new THREE.Group();
    const shelf = carcass(g, 1.8, 0.46, -0.42);
    switchPanel(F, shelf, -0.43, 0.02, 0.5, 0.26, 'DRIVE', [
      { kind: 'guard', label: 'MASTER ARM' }, { kind: 'toggle', label: 'MAIN' }, { kind: 'toggle', label: 'RCS' }, { kind: 'toggle', label: 'GIMBAL' },
      { kind: 'lamp', label: 'ARMED', color: '#ffb347' }, { kind: 'lamp', label: 'IGN', color: '#39d27a' }, { kind: 'lamp', label: 'RCS', color: '#39d27a' }, { kind: 'push', label: 'TRIM', color: '#3a6ea8' }
    ], { per: 4 });
    switchPanel(F, shelf, 0.43, 0.02, 0.5, 0.26, 'SYSTEMS', [
      { kind: 'toggle', label: 'RADS' }, { kind: 'toggle', label: 'XPDR' }, { kind: 'toggle', label: 'NAV LT' }, { kind: 'toggle', label: 'COMMS' },
      { kind: 'push', label: 'MSTR CAUT', color: '#ffb347' }, { kind: 'push', label: 'DOCK', color: '#3a8ad0' }, { kind: 'lamp', label: 'LINK', color: '#39d27a' }, { kind: 'push', label: 'ACK', color: '#a8322c' }
    ], { per: 4 });
    // The throttle quadrant (left hand) and the side stick (right), at the shelf's front corners.
    g.add(at(box(0.12, 0.08, 0.22, P.dark), -0.82, 0.7, 0.02), at(box(0.03, 0.14, 0.03, P.chrome), -0.82, 0.8, -0.02, -0.3, 0, 0), at(box(0.07, 0.04, 0.05, P.black), -0.82, 0.87, -0.05));
    g.add(at(cyl(0.05, 0.06, 0.05, P.dark, 10), 0.82, 0.69, 0.04), at(cyl(0.016, 0.02, 0.16, P.black, 8), 0.82, 0.79, 0.04), at(box(0.05, 0.08, 0.06, P.rubber), 0.82, 0.89, 0.05, 0.2, 0, 0));
    // The instrument panel: FLIGHT and a NAV repeater in their bezels, the standby dials between, the glareshield
    // over it with the annunciators along its lip.
    const f = panelFace(g, 1.76, 0.46, 0.9, -0.36, -0.45);
    bezel(F, f, -0.47, -0.01, 0.62, 0.363, S.flight);
    bezel(F, f, 0.47, -0.01, 0.62, 0.363, S.nav);
    dial(f, 0, 0.08, 0.045, -0.4);
    dial(f, 0, -0.07, 0.045, 1.1);
    const glare = new THREE.Group();
    glare.position.set(0, 0.24, 0.02);
    glare.add(at(box(1.84, 0.035, 0.24, M.body), 0, 0.02, 0.06));
    glare.add(at(box(1.84, 0.07, 0.02, P.black), 0, -0.012, 0.18));
    f.add(glare);
    F.screens.quad(pin(glare, 0, -0.012, 0.191), 1.6, 0.05, S.annun);
    place(I, g, hx, hz - 1.25);
    place(I, couch(P.pad, { low: true }), hx, hz);
    I.use('helm', 'Take the helm', hx, hz - 0.3, () => hooks.helm?.(), { r: 1.6 });

    // The overhead panel over her head, hung from the deckhead and sloped down toward her: three panels of switches.
    const o = new THREE.Group();
    o.position.set(hx, y0 + 2.86, hz - 0.62);
    const hang = new THREE.Group();
    hang.add(at(box(1.5, 0.08, 0.62, M.body), 0, 0.06, 0));
    o.add(hang);
    const ov = new THREE.Group();
    ov.position.set(0, -0.06, 0.02);
    ov.rotation.x = Math.PI / 2 - 0.5; // its face down and toward the couch, its legends upright to a head tipped back
    ov.add(at(box(1.46, 0.56, 0.03, M.face), 0, 0, -0.016));
    o.add(ov);
    switchPanel(F, ov, -0.48, 0, 0.46, 0.5, 'ELECTRICAL', [
      { kind: 'breaker', label: 'BUS A' }, { kind: 'breaker', label: 'BUS B' }, { kind: 'breaker', label: 'ESS' }, { kind: 'toggle', label: 'BATT' },
      { kind: 'toggle', label: 'GEN 1' }, { kind: 'toggle', label: 'GEN 2' }, { kind: 'guard', label: 'X-TIE' }, { kind: 'lamp', label: 'EMERG', color: '#a8322c' }
    ], { per: 4 });
    switchPanel(F, ov, 0, 0, 0.46, 0.5, 'LIFE SUPPORT', [
      { kind: 'toggle', label: 'SCRUB' }, { kind: 'toggle', label: 'O2 FEED' }, { kind: 'toggle', label: 'FANS' }, { kind: 'rotary', label: 'TEMP' },
      { kind: 'lamp', label: 'PRESS', color: '#39d27a' }, { kind: 'lamp', label: 'CO2', color: '#39d27a' }, { kind: 'guard', label: 'VENT' }, { kind: 'push', label: 'ALARM', color: '#a8322c' }
    ], { per: 4 });
    switchPanel(F, ov, 0.48, 0, 0.46, 0.5, 'PROPELLANT', [
      { kind: 'toggle', label: 'PORT' }, { kind: 'toggle', label: 'STBD' }, { kind: 'toggle', label: 'KEEL' }, { kind: 'toggle', label: 'XFEED' },
      { kind: 'breaker', label: 'PUMP 1' }, { kind: 'breaker', label: 'PUMP 2' }, { kind: 'guard', label: 'DUMP' }, { kind: 'lamp', label: 'LOW', color: '#ffb347' }
    ], { per: 4 });
    I.group.add(o);
  }

  // The gunner, on the starboard wall: the WEAPONS screen and the FIRE CONTROL panel, the turret's switches on the
  // shelf. E: the weapons state.
  if (K.gunner) {
    place(I, couch(P.pad, { low: true }), K.gunner[0], K.gunner[1]);
    const g = new THREE.Group();
    const shelf = carcass(g, 1.3, 0.34, -0.34, 0.7);
    switchPanel(F, shelf, -0.25, 0.02, 0.56, 0.24, 'TURRET', [
      { kind: 'toggle', label: 'POWER' }, { kind: 'toggle', label: 'HOIST' }, { kind: 'toggle', label: 'TRAIN LK' }, { kind: 'toggle', label: 'ELEV LK' },
      { kind: 'lamp', label: 'READY', color: '#39d27a' }, { kind: 'lamp', label: 'HOT', color: '#ffb347' }, { kind: 'push', label: 'SAFE', color: '#3a8ad0' }, { kind: 'lamp', label: 'FAULT', color: '#a8322c' }
    ], { per: 4 });
    g.add(at(cyl(0.05, 0.05, 0.04, P.dark, 10), 0.35, 0.76, 0.02), at(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), P.black), 0.35, 0.79, 0.02)); // the trackball
    g.add(at(box(1.3, 0.28, 0.06, M.body), 0, 0.85, -0.31)); // the riser from the shelf up to the panel
    const f = panelFace(g, 1.3, 0.5, 1.2, -0.29, -0.2);
    bezel(F, f, -0.25, -0.01, 0.66, 0.387, S.weapons);
    const fc = switchPanel(F, f, 0.4, 0, 0.36, 0.44, 'FIRE CONTROL', [
      { kind: 'rotary', label: 'STATE', stops: ['AUTO', 'HOLD', 'TIGHT', 'FREE'], colors: [ENGRAVE, '#ff7a6a', '#ffc24a', '#7dffb0'] },
      { kind: 'guard', label: 'MASTER ARM' }, { kind: 'lamp', label: 'DESIG', color: '#ffb347' }
    ], { per: 1, color: '#31272a' });
    const ptr = new THREE.Group();
    ptr.add(at(box(0.006, 0.026, 0.006, glow('#ffffff')), 0, 0.012, 0.02));
    ptr.userData.live = true;
    fc[0].add(ptr);
    live.selector = ptr;
    const p = place(I, g, x2 - 0.45, K.gunner[1] - 0.25, -Math.PI / 2);
    mark(I, x2, K.gunner[1] - 0.25, 1.4);
    uses.push([fc[0], 'fire-control', () => fcLabel(hooks.game?.()), () => fcUse(hooks.game?.()), 1.4]);
    void p;
  }

  // The commander, on the port wall: the NAV PLOT and the CREW, the comms panel and its handset. E at the plot lays
  // in a waypoint (or clears it); E at the crew shows the orders card.
  if (K.commander) {
    place(I, couch(mat('#5a4a30'), { low: true }), K.commander[0], K.commander[1]);
    const g = new THREE.Group();
    const shelf = carcass(g, 1.3, 0.34, -0.34, 0.7);
    switchPanel(F, shelf, -0.2, 0.02, 0.66, 0.24, 'COMMS', [
      { kind: 'toggle', label: 'NET 1' }, { kind: 'toggle', label: 'NET 2' }, { kind: 'toggle', label: 'HOST' }, { kind: 'toggle', label: 'INTERCOM' }, { kind: 'rotary', label: 'VOL' },
      { kind: 'push', label: 'ALL HANDS', color: '#ffb347' }, { kind: 'push', label: 'ACTION', color: '#a8322c' }, { kind: 'lamp', label: 'TX', color: '#39d27a' }, { kind: 'lamp', label: 'RX', color: '#39d27a' }, { kind: 'push', label: 'CRYPTO', color: '#3a6ea8' }
    ], { per: 5 });
    // The handset in its cradle at the shelf's end, its curly cord.
    g.add(at(box(0.08, 0.05, 0.12, P.dark), 0.42, 0.76, 0.0), at(box(0.05, 0.04, 0.2, M.handset), 0.42, 0.8, 0.0), at(cyl(0.012, 0.012, 0.3, M.cord, 6), 0.48, 0.62, -0.05));
    g.add(at(box(1.3, 0.28, 0.06, M.body), 0, 0.85, -0.31)); // the riser from the shelf up to the panel
    const f = panelFace(g, 1.3, 0.5, 1.2, -0.29, -0.2);
    bezel(F, f, -0.31, -0.01, 0.6, 0.352, S.nav);
    bezel(F, f, 0.33, -0.01, 0.6, 0.352, S.crew);
    const p = place(I, g, x1 + 0.45, K.commander[1] - 0.25, Math.PI / 2);
    mark(I, x1, K.commander[1] - 0.25, 1.4);
    uses.push([pin(f, -0.31, 0, 0.04), 'nav-plot', () => navLabel(hooks.game?.()), () => navUse(hooks.game?.()), 1.7]);
    uses.push([pin(f, 0.33, 0, 0.04), 'crew-orders', () => (hooks.game?.()?.orders?.open ? 'Close the orders card' : 'Crew orders'), () => {
      const G = hooks.game?.();
      G?.orders?.key('KeyO', G.mode());
    }, 1.7]);
    void p;
  }

  // The after bulkhead, beside the door: the damage control board to starboard, the engineering panel to port.
  {
    // (High enough to clear the puffer's filler under it.)
    const g = new THREE.Group();
    g.add(at(box(1.04, 0.7, 0.05, M.body), 0, 2.1, 0.025));
    const f = new THREE.Group();
    f.position.z = 0.05;
    g.add(f);
    bezel(F, f, 0, 2.11, 0.9, 0.506, S.status);
    switchPanel(F, f, 0, 2.5, 0.6, 0.07, 'DAMAGE CONTROL', [], { color: '#3a2a22' });
    place(I, g, x2 - 0.85, z2 - WALL, Math.PI, { collide: false });
    mark(I, x2 - 0.85, z2 - 0.13, 1.1);
  }
  {
    const g = new THREE.Group();
    g.add(at(box(1.02, 1.0, 0.1, M.body), 0, 1.6, 0.05));
    const f = new THREE.Group();
    f.position.z = 0.1;
    g.add(f);
    bezel(F, f, -0.22, 1.83, 0.42, 0.394, S.plant);
    const rad = switchPanel(F, f, 0.27, 1.83, 0.34, 0.46, 'RADIATORS', [
      { kind: 'guard', label: 'SPREAD / FOLD', bare: true }, { kind: 'lamp', label: 'DEPLOYED', color: '#39d27a' }
    ], { per: 1, color: '#2a3236' });
    switchPanel(F, f, 0, 1.36, 0.92, 0.3, 'MAIN BUS', [
      { kind: 'breaker', label: 'REACTOR' }, { kind: 'breaker', label: 'DRIVE' }, { kind: 'breaker', label: 'RCS' }, { kind: 'breaker', label: 'TURRET' },
      { kind: 'breaker', label: 'PDC' }, { kind: 'breaker', label: 'LIFE SUP' }, { kind: 'breaker', label: 'SENSORS' }, { kind: 'breaker', label: 'HOIST' }
    ], { per: 8 });
    // The radiator switch's lever (live: it shows which way they were ordered).
    const lever = new THREE.Group();
    lever.add(at(box(0.008, 0.008, 0.045, P.chrome), 0, 0, 0.026), at(box(0.012, 0.012, 0.012, P.black), 0, 0, 0.05));
    lever.userData.live = true;
    rad[0].add(lever);
    live.lever = lever;
    place(I, g, x1 + 0.95, z2 - WALL, Math.PI, { collide: false });
    mark(I, x1 + 0.95, z2 - 0.13, 1.1);
    uses.push([rad[0], 'radiators', () => (hooks.game?.()?.plant?.want ? 'Fold the radiators' : 'Spread the radiators'), () => radUse(hooks.game?.()), 1.2]);
  }

  // The quads into their two meshes, and the uses where their markers ended up.
  for (const [o, id, label, fn, r] of uses) {
    const p = _v.setFromMatrixPosition(rel(o, I.group));
    const u = I.use(id, '', p.x, p.z, fn, { r, y: p.y });
    Object.defineProperty(u, 'label', { get: label });
  }
  F.faces.tex.needsUpdate = true;
  F.screens.build(I.group);
  F.faces.build(I.group);

  // The screens: standby until somebody is here, then four times a second from the game.
  const screens = new Screens(F.screens, C, live);
  screens.draw(null);
  let t = 0;
  (C.anim ??= []).push((dt) => {
    if ((t -= dt) > 0) return;
    t = 0.25;
    const G = hooks.game?.();
    if (!G || (G.mode() !== 'helm' && G.walk?.roomNow?.() !== 'flight-deck')) return;
    screens.draw(G);
  });
}

// --- the uses: each the system's own verb -----------------------------------------------------------------------------

const tell = (G, t) => (G?.helmSight?.say(t, 4), G?.dc?.say(null, t, 0, 4));

function fcLabel(G) {
  const fc = G?.guns?.fireControl;
  if (!fc) return 'Fire control';
  const now = fc.ordered ? fc.state : 'auto';
  const next = FC_CYCLE[(FC_CYCLE.indexOf(now) + 1) % FC_CYCLE.length];
  return `Fire control (${now === 'auto' ? 'auto' : `weapons ${now}`}): ${next === 'auto' ? 'hand it back to the raid' : `weapons ${next}`}`;
}

function fcUse(G) {
  const fc = G?.guns?.fireControl;
  if (!fc) return tell(G, 'Fire control is not up yet.');
  if (G.career && !G.career.allows('firecontrol')) return G.career.refuse('firecontrol');
  const now = fc.ordered ? fc.state : 'auto';
  const next = FC_CYCLE[(FC_CYCLE.indexOf(now) + 1) % FC_CYCLE.length];
  if (next === 'auto') {
    fc.auto();
    return tell(G, 'Fire control back to the raid: the gunners follow it.');
  }
  const R = G.guns.raider, target = next === 'tight' && R && !R.gone && !R.dead ? R : undefined;
  fc.order(next, { by: 'you', target });
  tell(G, `Weapons ${next}${target ? `, the ${target.target ? 'target' : 'raider'} designated` : ''}.`);
}

function navLabel(G) {
  return G?.helmSight?.nav ? `Clear waypoint ${G.helmSight.nav.name}` : 'Lay in a waypoint';
}

function navUse(G) {
  if (!G?.helmSight) return;
  if (G.career && !G.career.allows('helm')) return G.career.refuse('helm');
  G.helmSight.toggleNav();
  tell(G, G.helmSight.msg?.text ?? '');
}

function radUse(G) {
  if (!G?.plant) return;
  tell(G, G.plant.toggleRadiators());
}

// --- the screens --------------------------------------------------------------------------------------------------------

class Screens {
  constructor(sheet, C, live) {
    Object.assign(this, { sheet, C, live, g: sheet.g });
  }

  /** Every screen from `G` (null: on standby). */
  draw(G) {
    const g = this.g;
    for (const [k, r] of Object.entries(S)) {
      g.save();
      g.translate(r[0], r[1]);
      g.beginPath();
      g.rect(0, 0, r[2], r[3]);
      g.clip();
      g.fillStyle = k === 'annun' ? '#0b0d10' : BG;
      g.fillRect(0, 0, r[2], r[3]);
      if (G) this[k](g, r[2], r[3], G);
      else this.standby(g, r[2], r[3], k);
      g.restore();
    }
    this.sheet.tex.needsUpdate = true;
    if (G) this.moving(G);
  }

  /** The selector's pointer and the radiator lever, to what they show. */
  moving(G) {
    const fc = G.guns?.fireControl;
    if (this.live.selector) this.live.selector.rotation.z = -(FC_CYCLE.indexOf(fc?.ordered ? fc.state : 'auto') - 1.5) * STOP;
    if (this.live.lever) this.live.lever.rotation.x = G.plant?.want ? -0.5 : 0.5;
  }

  standby(g, w, h, k) {
    if (k === 'annun') return;
    grid(g, w, h);
    text(g, k.toUpperCase(), w / 2, h / 2 - 10, MONO(26, 800), DIM, 'center');
    text(g, 'STANDBY', w / 2, h / 2 + 22, MONO(16, 700), DIM, 'center');
  }

  /** Heading, attitude and speed against her reference (the host when she has a berth), the drive. */
  flight(g, w, h, G) {
    const { body, helm, berth } = G, Q = this.C.obj.quaternion;
    const hostQ = berth?.H?.obj ? berth.H.obj.getWorldQuaternion(_q).invert() : _q.identity();
    const fwd = _v.set(0, 0, -1).applyQuaternion(Q).applyQuaternion(hostQ);
    const hdg = ((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI + 360) % 360, pitch = (Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180) / Math.PI;
    const who = G.mode() === 'helm' ? 'YOU HAVE HER' : G.pilot?.busy ? `PILOT · ${(G.pilot.phase || 'flying').toUpperCase()}` : berth && berth.phase !== 'out' ? `BERTH · ${berth.phase.toUpperCase()}` : 'HANDS OFF';
    head(g, w, 'FLIGHT', who, G.mode() === 'helm' ? GREEN : TEXT);
    // The heading tape.
    g.strokeStyle = DIM;
    g.fillStyle = TEXT;
    g.lineWidth = 1.5;
    const tapeY = 52, span = 90, px = w / span;
    for (let d = Math.ceil((hdg - span / 2) / 5) * 5; d <= hdg + span / 2; d += 5) {
      const x = w / 2 + (d - hdg) * px, major = d % 30 === 0;
      g.beginPath();
      g.moveTo(x, tapeY + 18);
      g.lineTo(x, tapeY + (major ? 4 : 11));
      g.stroke();
      if (major) text(g, String(((d % 360) + 360) % 360).padStart(3, '0'), x, tapeY - 6, MONO(16, 700), DIM, 'center');
    }
    g.fillStyle = GREEN;
    g.fillRect(w / 2 - 34, tapeY - 18, 68, 22);
    text(g, String(Math.round(hdg) % 360).padStart(3, '0'), w / 2, tapeY - 7, MONO(18, 800), BG, 'center');
    // The attitude: a horizon in a window, tilted by her roll and moved by her pitch.
    const up = _w.set(0, 1, 0).applyQuaternion(Q).applyQuaternion(hostQ), right = new THREE.Vector3(1, 0, 0).applyQuaternion(Q).applyQuaternion(hostQ);
    const roll = Math.atan2(-right.y, up.y);
    const ax = 20, ay = 86, aw = 190, ah = 190, cx = ax + aw / 2, cy = ay + ah / 2;
    g.save();
    g.beginPath();
    g.rect(ax, ay, aw, ah);
    g.clip();
    g.translate(cx, cy + pitch * 3);
    g.rotate(roll);
    g.fillStyle = '#123a5a';
    g.fillRect(-300, -600, 600, 600);
    g.fillStyle = '#3a2a18';
    g.fillRect(-300, 0, 600, 600);
    g.strokeStyle = '#e8f0f0';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-300, 0);
    g.lineTo(300, 0);
    g.stroke();
    g.lineWidth = 1;
    for (const p of [-20, -10, 10, 20]) {
      g.beginPath();
      g.moveTo(-24, -p * 3);
      g.lineTo(24, -p * 3);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = AMBER;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 44, cy);
    g.lineTo(cx - 14, cy);
    g.lineTo(cx - 8, cy + 8);
    g.moveTo(cx + 44, cy);
    g.lineTo(cx + 14, cy);
    g.lineTo(cx + 8, cy + 8);
    g.stroke();
    g.strokeStyle = DIM;
    g.lineWidth = 1;
    g.strokeRect(ax, ay, aw, ah);
    text(g, `PITCH ${pitch >= 0 ? '+' : ''}${pitch.toFixed(0)}°`, ax + 4, ay + ah + 10, MONO(15, 600), DIM);
    // Her speed against the reference, in her own frame.
    const ref = helm?.ref ?? berth?.hostVel;
    const v = _v.copy(body?.vel ?? _v.set(0, 0, 0));
    if (ref) v.sub(ref);
    const speed = v.length();
    v.applyQuaternion(_q.copy(Q).invert());
    const rx = 232;
    text(g, berth ? 'AGAINST HOST' : 'AGAINST LOCAL', rx, 96, MONO(16, 700), DIM);
    text(g, `${speed.toFixed(speed < 10 ? 2 : 1)} m/s`, rx, 124, MONO(28, 800), speed > 50 ? AMBER : GREEN);
    const rows = [['FWD', -v.z], ['STBD', v.x], ['UP', v.y]];
    rows.forEach(([n, val], i) => {
      const y = 158 + i * 24;
      text(g, n, rx, y, MONO(16, 700), DIM);
      bar(g, rx + 52, y - 7, 150, 14, Math.max(-1, Math.min(1, val / 20)), val >= 0 ? BLUE : AMBER, true);
      text(g, val.toFixed(1), rx + 266, y, MONO(16, 700), TEXT, 'right');
    });
    const host = berth?.H?.obj?.position;
    if (host) text(g, `HOST ${km(host.distanceTo(this.C.obj.position))}`, rx, 236, MONO(17, 700), TEXT);
    const ship = G.ship, drive = ship?.driveFactor ?? 1;
    text(g, `DRIVE ${drive > 0.99 ? 'READY' : drive <= 0 ? 'OFFLINE' : pct(drive)}`, rx, 262, MONO(17, 700), drive > 0.99 ? GREEN : drive <= 0 ? RED : AMBER);
    text(g, ship?.power === false ? 'EMERG PWR' : 'MAIN PWR', rx + 150, 262, MONO(17, 700), ship?.power === false ? RED : GREEN);
  }

  /** The plot: her contacts from above, ship up the screen, and the waypoint's numbers. */
  nav(g, w, h, G) {
    const N = G.helmSight?.nav;
    head(g, w, 'NAV PLOT', N ? `WPT ${N.name}` : 'NO WAYPOINT', N ? GREEN : DIM);
    const pos = this.C.obj.position, inv = _q.copy(this.C.obj.quaternion).invert();
    const dots = [];
    const add = (p, kind, label) => p && dots.push({ l: _w.subVectors(p, pos).applyQuaternion(inv).clone(), kind, label });
    if (G.berth?.H?.obj) add(G.berth.H.obj.position, 'host', 'HOST');
    const R = G.guns?.raider;
    if (R && !R.gone && !R.dead) add(R.obj.position, 'hostile', R.target ? 'SLED' : 'RAIDER');
    for (const B of G.guns?.bandits ?? []) if (!B.gone && !B.dead) add(B.obj?.position, 'bandit', '');
    for (const tp of G.guns?.torps ?? []) if (!tp.dead) add(tp.pos, tp.side === 'theirs' ? 'torp' : 'ours', '');
    if (N) add(N.at, 'wpt', N.name);
    for (const c of G.deep?.contacts() ?? []) add(c.pos, 'unknown', c.label); // what the deep shows (deep.mjs)
    const far = Math.max(400, ...dots.map((d) => Math.hypot(d.l.x, d.l.z)));
    const scale = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000].find((s) => s >= far * 1.05) ?? far * 1.1;
    const R0 = 118, cx = 20 + R0, cy = 40 + R0 + 4;
    g.strokeStyle = GRID;
    g.lineWidth = 1;
    for (const k of [1 / 3, 2 / 3, 1]) (g.beginPath(), g.arc(cx, cy, R0 * k, 0, Math.PI * 2), g.stroke());
    g.beginPath();
    g.moveTo(cx - R0, cy);
    g.lineTo(cx + R0, cy);
    g.moveTo(cx, cy - R0);
    g.lineTo(cx, cy + R0);
    g.stroke();
    text(g, km(scale), cx + R0 - 4, cy + R0 - 8, MONO(15, 600), DIM, 'right');
    // Her, at the centre, bow up.
    g.fillStyle = GREEN;
    g.beginPath();
    g.moveTo(cx, cy - 9);
    g.lineTo(cx - 6, cy + 7);
    g.lineTo(cx + 6, cy + 7);
    g.fill();
    for (const d of dots) {
      const k = R0 / scale, x = cx + d.l.x * k, y = cy + d.l.z * k;
      const col = { host: BLUE, hostile: RED, bandit: RED, torp: RED, ours: GREEN, wpt: GREEN, unknown: AMBER }[d.kind];
      g.fillStyle = g.strokeStyle = col;
      g.lineWidth = 2;
      if (d.kind === 'host') g.strokeRect(x - 6, y - 6, 12, 12);
      else if (d.kind === 'hostile') (g.beginPath(), g.moveTo(x, y - 8), g.lineTo(x + 8, y), g.lineTo(x, y + 8), g.lineTo(x - 8, y), g.closePath(), g.stroke());
      else if (d.kind === 'unknown') (g.beginPath(), g.arc(x, y, 6, 0, Math.PI * 2), g.stroke())
      else if (d.kind === 'wpt') (g.beginPath(), g.arc(x, y, 7, 0, Math.PI * 2), g.stroke(), g.beginPath(), g.arc(x, y, 2, 0, Math.PI * 2), g.fill());
      else g.fillRect(x - 3, y - 3, 6, 6);
      if (d.label) text(g, d.label, x + 11, y, MONO(14, 700), col);
    }
    // The waypoint's numbers, as the helm's sight has them.
    const tx = 2 * R0 + 40;
    if (!N) {
      text(g, 'No waypoint laid in.', tx, 76, MONO(17, 600), DIM);
      text(g, 'E here, or N at', tx, 104, MONO(16, 600), DIM);
      text(g, 'the helm, lays one', tx, 122, MONO(16, 600), DIM);
      text(g, 'in 15 km off.', tx, 140, MONO(16, 600), DIM);
    } else {
      const call = { cruise: ['CRUISE', GREEN], flip: ['FLIP AND BURN', AMBER], brake: ['BURN TO STOP', AMBER], over: ['OVERSHOOT', RED] }[N.call] ?? ['—', DIM];
      text(g, 'RANGE', tx, 64, MONO(15, 700), DIM);
      text(g, km(N.range ?? 0), tx, 86, MONO(24, 800), TEXT);
      text(g, 'CLOSING', tx, 116, MONO(15, 700), DIM);
      text(g, `${(N.closing ?? 0).toFixed(1)} m/s`, tx, 136, MONO(18, 800), (N.closing ?? 0) >= 0 ? TEXT : AMBER);
      text(g, 'TO STOP', tx, 164, MONO(15, 700), DIM);
      text(g, km(N.stop ?? 0), tx, 184, MONO(18, 800), TEXT);
      bar(g, tx, 200, w - tx - 16, 10, clamp01((N.stop ?? 0) / Math.max(1, N.range ?? 1)), N.call === 'over' ? RED : N.call === 'cruise' ? GREEN : AMBER);
      g.fillStyle = call[1];
      g.fillRect(tx, 226, w - tx - 16, 30);
      text(g, call[0], tx + (w - tx - 16) / 2, 242, MONO(15, 800), BG, 'center', w - tx - 24);
    }
  }

  /** The weapons state and the target, each gun's rounds, the point defence, the tubes. */
  weapons(g, w, h, G) {
    const W = G.guns, fc = W?.fireControl;
    head(g, w, 'WEAPONS', fc?.ordered ? `ORDERED · ${String(fc.by).toUpperCase()}` : 'FIRE CONTROL AUTO', fc?.ordered ? AMBER : DIM);
    const st = fc?.state ?? 'hold';
    g.fillStyle = FC_COL[st];
    g.fillRect(12, 40, w - 24, 40);
    text(g, { hold: 'WEAPONS HOLD', tight: 'WEAPONS TIGHT', free: 'WEAPONS FREE' }[st], w / 2, 61, MONO(24, 900), BG, 'center');
    const D = fc?.designated, R = W?.raider;
    const range = D?.ref?.obj?.position ?? D?.ref?.pos;
    text(g, `TARGET ${D ? D.label : 'NONE'}${range ? ` · ${km(range.distanceTo(this.C.obj.position))}` : ''}`, 14, 98, MONO(17, 700), D ? AMBER : DIM);
    if (R && !R.gone && !R.dead && !D) text(g, `CONTACT ${R.target ? 'SLED' : 'RAIDER'} · IDENTIFYING`, 14, 118, MONO(16, 700), AMBER);
    // Each turret: rounds in the ready rack and below, the hoist, who is on it.
    let y = 140;
    text(g, 'GUN', 14, y, MONO(15, 700), DIM);
    text(g, 'READY', 120, y, MONO(15, 700), DIM);
    text(g, 'MAG', 210, y, MONO(15, 700), DIM);
    text(g, 'HOIST', 280, y, MONO(15, 700), DIM);
    text(g, 'CREW', 400, y, MONO(15, 700), DIM);
    const rack = W?.W?.gun?.rack ?? 0;
    (W?.turrets ?? []).forEach((t, i) => {
      y += 24;
      text(g, `TURRET ${i + 1}`, 14, y, MONO(17, 700), TEXT);
      text(g, `${t.ready}/${rack}`, 120, y, MONO(17, 800), t.ready <= 0 ? RED : t.ready < rack ? AMBER : GREEN);
      text(g, String(t.stock), 210, y, MONO(17, 700), t.stock <= 0 ? RED : TEXT);
      const hoist = String(t.hoist ?? '').split(':')[0].toUpperCase();
      text(g, t.out ? 'OUT' : hoist || '—', 280, y, MONO(16, 700), t.out || hoist.startsWith('STOP') ? RED : hoist === 'RUNNING' ? GREEN : TEXT, 'left', 110);
      text(g, G.mode() === 'gun' ? 'YOU' : t.unmanned ? 'NONE' : t.layed ? 'LAID ON' : 'MANNED', 400, y, MONO(16, 700), t.unmanned && G.mode() !== 'gun' ? AMBER : GREEN);
    });
    // Point defence and tubes, a line each.
    const pd = W?.pdcs ?? [];
    if (pd.length) {
      y += 30;
      const up = pd.filter((p) => (p.hp ?? 100) >= 25).length, rounds = pd.reduce((s, p) => s + (p.stock ?? 0), 0);
      text(g, `PDC ${up}/${pd.length} UP · ${rounds} RDS`, 14, y, MONO(17, 700), up < pd.length ? AMBER : TEXT);
    }
    if (W?.W?.tubes) {
      y += 24;
      text(g, `TUBES ${W.tubeStock} TORPEDOES`, 14, y, MONO(17, 700), W.tubeStock ? TEXT : AMBER);
    }
    text(g, 'E: FIRE CONTROL', w - 14, h - 14, MONO(15, 700), DIM, 'right');
  }

  /** Each hand: their job and what they are doing, and the helm's order. */
  crew(g, w, h, G) {
    const O = G.orders, mode = G.mode();
    const order = HELM_ORDERS.find((o) => o.id === O?.helmOrder);
    head(g, w, 'CREW', `HELM ORDER · ${(order?.word ?? 'HANDS OFF').toUpperCase()}`, TEXT);
    if (!O) return text(g, 'No crew aboard.', 16, 80, MONO(15, 600), DIM);
    O.crew.forEach((c, i) => {
      const y = 62 + i * 64;
      g.fillStyle = 'rgba(90,170,255,0.08)';
      g.fillRect(10, y - 18, w - 20, 56);
      text(g, c.who, 20, y, MONO(17, 800), TEXT, 'left', 230);
      text(g, c.post.toUpperCase(), 20, y + 22, MONO(15, 600), DIM, 'left', 230);
      const job = JOB[c.job] ?? c.job.toUpperCase();
      g.fillStyle = { helm: BLUE, gun: RED, repair: AMBER }[c.job] ?? DIM;
      g.fillRect(262, y - 12, 92, 22);
      text(g, job, 308, y - 1, MONO(16, 900), BG, 'center', 88);
      text(g, O.doing(c, mode), 262, y + 24, MONO(15, 600), TEXT, 'left', w - 280);
    });
    text(g, O.open ? 'E: CLOSE ORDERS CARD' : 'E: ORDERS CARD (O)', w - 14, h - 14, MONO(15, 700), DIM, 'right');
  }

  /** The damage control board: every compartment in plan, bow to the right, by its health and its air. */
  status(g, w, h, G) {
    const ship = G.ship;
    head(g, w, 'DAMAGE CONTROL', ship?.power === false ? 'EMERGENCY POWER' : 'MAIN POWER', ship?.power === false ? RED : GREEN);
    if (!ship?.nodes) return;
    const A = ship.N?.air ?? {}, nominal = A.nominal ?? 101, unsafe = A.unsafe ?? 60;
    const nodes = [...ship.nodes.values()].filter((n) => n.b);
    let xa = Infinity, xb = -Infinity, za = Infinity, zb = -Infinity;
    for (const n of nodes) (xa = Math.min(xa, n.b.x[0])), (xb = Math.max(xb, n.b.x[1])), (za = Math.min(za, n.b.z[0])), (zb = Math.max(zb, n.b.z[1]));
    const mx = 14, my = 44, mw = w - 28, mh = 190; // the plan across the top, the figures under it
    const k = Math.min(mw / (zb - za), mh / (xb - xa));
    const ox = mx + (mw - (zb - za) * k) / 2, oy = my + (mh - (xb - xa) * k) / 2;
    nodes.sort((a, b) => (b.b.x[1] - b.b.x[0]) * (b.b.z[1] - b.b.z[0]) - (a.b.x[1] - a.b.x[0]) * (a.b.z[1] - a.b.z[0]));
    let holes = 0, worst = [];
    for (const n of nodes) {
      const px = ox + (zb - n.b.z[1]) * k, py = oy + (n.b.x[0] - xa) * k, pw = (n.b.z[1] - n.b.z[0]) * k, ph = (n.b.x[1] - n.b.x[0]) * k;
      const hp = n.health / 100;
      g.fillStyle = hp >= 0.8 ? 'rgba(57,210,122,0.28)' : hp >= 0.5 ? 'rgba(255,194,74,0.45)' : 'rgba(255,90,74,0.6)';
      g.fillRect(px, py, pw, ph);
      g.strokeStyle = hp >= 0.8 ? 'rgba(125,255,176,0.55)' : hp >= 0.5 ? AMBER : RED;
      g.lineWidth = 1;
      g.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      if (n.air < unsafe && !n.c.vacuum) {
        // No air: hatched blue.
        g.save();
        g.beginPath();
        g.rect(px, py, pw, ph);
        g.clip();
        g.strokeStyle = 'rgba(143,196,255,0.8)';
        for (let s = -ph; s < pw; s += 7) (g.beginPath(), g.moveTo(px + s, py + ph), g.lineTo(px + s + ph, py), g.stroke());
        g.restore();
      }
      holes += n.holes?.length ?? 0;
      if (n.holes?.length) {
        g.strokeStyle = RED;
        g.lineWidth = 2;
        const cx = px + pw / 2, cy = py + ph / 2;
        g.beginPath();
        g.moveTo(cx - 5, cy - 5);
        g.lineTo(cx + 5, cy + 5);
        g.moveTo(cx + 5, cy - 5);
        g.lineTo(cx - 5, cy + 5);
        g.stroke();
      }
      if (n.health < 95 || n.air < nominal * 0.9) worst.push(n);
    }
    text(g, 'BOW ▶', mx + mw, my - 6, MONO(14, 700), DIM, 'right');
    // The figures, and the worst of them in two columns.
    const ty = my + mh + 22, ls = ship.lsFactor ?? 1;
    const low = nodes.filter((n) => n.c.access === 'walk' && !n.c.vacuum).reduce((a, n) => (!a || n.air < a.air ? n : a), null);
    text(g, `LIFE SUP ${pct(ls)}`, 14, ty, MONO(17, 800), ls < 0.6 ? RED : ls < 0.95 ? AMBER : GREEN);
    text(g, `HOLES ${holes}`, 230, ty, MONO(17, 800), holes ? RED : GREEN);
    text(g, `LOWEST AIR ${low ? Math.round(low.air) : nominal} kPa`, w - 14, ty, MONO(17, 800), low && low.air < unsafe ? RED : low && low.air < nominal * 0.9 ? AMBER : GREEN, 'right');
    g.fillStyle = GRID;
    g.fillRect(14, ty + 14, w - 28, 1);
    worst.sort((a, b) => a.health - b.health);
    if (!worst.length) text(g, 'ALL COMPARTMENTS SOUND', 14, ty + 36, MONO(16, 800), GREEN);
    worst.slice(0, 6).forEach((n, i) => {
      const x = 14 + (i % 2) * ((w - 28) / 2), y = ty + 36 + Math.floor(i / 2) * 24, cw = (w - 28) / 2 - 16;
      text(g, (n.c.name ?? n.c.id).toUpperCase(), x, y, MONO(15, 700), TEXT, 'left', cw - 90);
      const air = n.air < unsafe ? ' NO AIR' : '';
      text(g, `${Math.round(n.health)}%${air}`, x + cw, y, MONO(15, 800), n.health < 50 || air ? RED : n.health < 80 ? AMBER : TEXT, 'right');
    });
  }

  /** Heat, the radiators, the reaction mass, the reactor and the drive. */
  plant(g, w, h, G) {
    const P0 = G.plant, ship = G.ship;
    head(g, w, 'PLANT', ship?.power === false ? 'EMERG' : 'MAIN', ship?.power === false ? RED : GREEN);
    if (!P0) return;
    const rows = [];
    rows.push(['HEAT SINKS', P0.heat, `${pct(P0.heat)}${P0.hot ? ' FULL' : ''}`, P0.hot || P0.heat > 0.85 ? RED : P0.heat > 0.6 ? AMBER : GREEN]);
    const n = Math.max(1, P0.radiators.length), k = P0.radiators.reduce((s, r) => s + r.k, 0) / n, rh = P0.radiators.reduce((s, r) => s + r.health, 0) / n;
    rows.push(['RADIATORS', k, `${k > 0.95 ? 'SPREAD' : k < 0.05 ? 'FOLDED' : 'MOVING'} · ${pct(rh)}`, rh < 0.5 ? RED : k < 0.5 ? AMBER : GREEN]);
    const pf = P0.prop / P0.prop0;
    rows.push(['PROPELLANT', pf, `Δv ${(P0.dv() / 1000).toFixed(1)} km/s${P0.leaking ? ' LEAK' : ''}`, P0.leaking || pf < 0.15 ? RED : pf < 0.35 ? AMBER : GREEN]);
    const re = ship?.sys('reactor') ?? 1;
    rows.push(['REACTOR', re, pct(re), re < 0.5 ? RED : re < 0.8 ? AMBER : GREEN]);
    const dr = ship?.driveFactor ?? 1;
    rows.push(['DRIVE', dr, dr <= 0 ? 'OFFLINE' : pct(dr), dr <= 0 ? RED : dr < 0.99 ? AMBER : GREEN]);
    rows.forEach(([name, v, note, col], i) => {
      const y = 62 + i * 52;
      text(g, name, 14, y, MONO(16, 700), DIM);
      text(g, note, w - 14, y, MONO(16, 700), col, 'right', w - 150);
      bar(g, 14, y + 12, w - 28, 14, clamp01(v), col);
    });
    text(g, P0.want ? 'E: FOLD RADIATORS' : 'E: SPREAD RADIATORS', w - 14, h - 14, MONO(15, 700), DIM, 'right');
  }

  /** The annunciators: lit amber or red while something is wrong. */
  annun(g, w, h, G) {
    const P0 = G.plant, ship = G.ship, fc = G.guns?.fireControl, A = ship?.N?.air ?? {};
    const k = P0 ? P0.radiators.reduce((s, r) => s + r.k, 0) / Math.max(1, P0.radiators.length) : 1;
    const airLow = ship?.nodes && [...ship.nodes.values()].some((n) => n.c.access === 'walk' && !n.c.vacuum && n.air < (A.unsafe ?? 60));
    const holed = ship?.holes?.length > 0;
    const cells = [
      ['HEAT HIGH', P0 && (P0.hot || P0.heat > 0.75), RED],
      ['RADS FOLDED', k < 0.5, AMBER],
      ['PROP LOW', P0 && P0.prop / P0.prop0 < 0.2, AMBER],
      ['EMERG PWR', ship?.power === false, RED],
      ['AIR LOW', airLow, RED],
      ['HULL BREACH', holed, RED],
      [fc?.state === 'free' ? 'WPNS FREE' : 'WPNS TIGHT', fc && fc.state !== 'hold', fc?.state === 'free' ? RED : AMBER]
    ];
    const caution = cells.some((c) => c[1]);
    cells.unshift(['MASTER CAUTION', caution, AMBER]);
    const cw = w / cells.length;
    cells.forEach(([name, on, col], i) => {
      const x = i * cw;
      g.fillStyle = on ? col : '#1a1d21';
      g.fillRect(x + 3, 4, cw - 6, h - 8);
      text(g, name, x + cw / 2, h / 2 + 1, MONO(17, 900), on ? '#140c08' : '#3d434a', 'center', cw - 14);
    });
  }
}

// --- drawing ------------------------------------------------------------------------------------------------------------

function grid(g, w, h) {
  g.strokeStyle = GRID;
  g.lineWidth = 1;
  for (let x = 0; x < w; x += 32) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, h), g.stroke());
  for (let y = 0; y < h; y += 32) (g.beginPath(), g.moveTo(0, y), g.lineTo(w, y), g.stroke());
}

/** A screen's title bar, with a note on its right. */
function head(g, w, title, note, col = TEXT) {
  g.fillStyle = 'rgba(90,170,255,0.14)';
  g.fillRect(0, 0, w, 30);
  text(g, title, 12, 16, MONO(16, 900), TEXT);
  if (note) text(g, note, w - 12, 16, MONO(13, 800), col, 'right', w * 0.6);
}

/** A bar `k` (0 to 1) full; `signed`: from the middle, -1 to 1. */
function bar(g, x, y, w, h, k, col, signed = false) {
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(x, y, w, h);
  g.fillStyle = col;
  if (signed) {
    const m = x + w / 2;
    g.fillRect(k >= 0 ? m : m + k * (w / 2), y, Math.abs(k) * (w / 2), h);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(m - 0.5, y - 2, 1, h + 4);
  } else g.fillRect(x, y, w * k, h);
}
