// The ship's plant: her heat and her reaction mass. Two things every real spaceship lives by and most science fiction
// forgets.
//
// Heat. Everything aboard ends up as heat: the reactor running, the main drive burning, every gun that fires. In
// vacuum the only way to be rid of it is to radiate it, so she carries radiators (the layout's `radiator` mounts, the
// long ribbed panels aft), and heat sinks to soak up what the radiators cannot shed fast enough. `heat` is how full the
// sinks are, 0 to 1. The radiators shed more the hotter the sinks are, as much as they are spread and unhurt. They are
// also the most fragile thing on her, so at action stations she folds them into their housings (`foldAtStations`) and
// the sinks start to fill: a fight is on a clock. G at the helm spreads or folds them by hand. At `limit` the point
// defence (and the railguns) hold their fire and the main drive is held back until she has cooled.
//
// Reaction mass. The main drive throws propellant out of the back at `isp` seconds; when it is gone, she coasts. It
// lives in the tank compartments (`tanks`), so a hole in one of them is a leak to space.
//
// The layout's `plant` entry has every number. In the console: `__carrier.plant`: `heat`, `prop`, `dv()`,
// `toggleRadiators()`.

import * as THREE from 'three';
import { clamp } from '../util.mjs';
import { HEAT_GLOW } from './layout.mjs';

const G0 = 9.81;
const DARK = new THREE.Color('#3a1a10'), HOT = new THREE.Color('#ff7a30'), WHITE = new THREE.Color('#ffd0a0');

export class Plant {
  constructor(C, { ship, thrusters, dc, sfx }) {
    this.C = C;
    this.P = C.L.plant;
    this.ship = ship;
    this.thrusters = thrusters;
    this.dc = dc;
    this.sfx = sfx;
    this.heat = 0.12;
    this.added = 0;
    this.hot = false;
    this.warned = false;
    this.want = 1; // radiators: 1 spread, 0 folded, as ordered from the helm
    this.byHand = false; // ordered by hand since action stations: the ship leaves them as you set them
    // The radiators: the hinged objects in hull.glb (each named for its mount), how far spread, how hurt.
    this.radiators = C.L.mounts.filter((m) => m.kind === 'radiator').map((m) => {
      let obj = null;
      // (Without hull.glb, a ship whose code-built radiators fold has them by the same names: layout.mjs `buildOutside`.)
      (C.blender ?? C.outside)?.traverse((o) => !obj && o.name === m.id && (obj = o));
      return { m, obj, k: 1, health: 1, box: { x: [Math.min(...m.x), Math.max(...m.x)], y: [m.y - 1.5, m.y + 1.5], z: m.z } };
    });
    // Their glowing fins: the hull's `RadiatorHot` material, its own copy so the glow is ours to set.
    this.glow = null;
    C.blender?.traverse((o) => {
      if (o.isMesh && o.material?.name === 'RadiatorHot') {
        this.glow ??= o.material.clone();
        o.material = this.glow;
      }
    });
    // Reaction mass, shared over the tanks by their volume.
    const R = this.P.propellant;
    this.prop0 = R.mass;
    this.prop = R.mass;
    this.dry = C.L.mass - R.mass;
    const vols = R.tanks.map((id) => ship.node(id)?.vol ?? 0);
    const sum = vols.reduce((a, b) => a + b, 0) || 1;
    this.tanks = R.tanks.map((id, i) => ({ id, share: vols[i] / sum }));
    this.leaking = false;
  }

  /** Heat a gun or a system puts into the sinks now (0 to 1 of them). */
  addHeat(x) {
    this.added += x;
  }

  /** The radiator a point (ship frame) is in, if it is spread out there to be hit. */
  radiatorAt(q) {
    for (const r of this.radiators) {
      if (r.k < 0.3) continue;
      const b = r.box;
      const span = (b.x[1] - b.x[0]) * r.k;
      const x0 = b.x[0] > 0 ? b.x[0] : b.x[1] - span, x1 = b.x[0] > 0 ? b.x[0] + span : b.x[1];
      if (q.x >= x0 && q.x <= x1 && q.y >= b.y[0] && q.y <= b.y[1] && q.z >= b.z[0] && q.z <= b.z[1]) return r;
    }
    return null;
  }

  hitRadiator(r, amount) {
    const was = r.health;
    r.health = Math.max(0, r.health - amount);
    if (was > 0.4 && r.health <= 0.4) {
      const side = r.m.id.replace('radiator-', '').replace('stbd', 'starboard');
      this.C.bus?.emit('call', { id: 'radiator-damaged', side });
      this.dc?.say(null, `${side[0].toUpperCase() + side.slice(1)} radiator damaged: she sheds heat more slowly.`, 0, 5);
    }
  }

  /** G at the helm: spread or fold the radiators. */
  toggleRadiators() {
    this.want = this.want > 0.5 ? 0 : 1;
    this.byHand = true;
    this.sfx?.cue('servo', { dur: 1.5 });
    return this.want ? 'Spreading the radiators.' : 'Folding the radiators.';
  }

  /** How much more she can change her velocity on what is left, m/s (the rocket equation). */
  dv() {
    const ve = this.P.propellant.isp * G0;
    return ve * Math.log((this.dry + this.prop) / this.dry);
  }

  /** After integrity.mjs has set each thruster's health for the frame, and before the helm next reads it. */
  frame(dt, { stations = false } = {}) {
    const H = this.P.heat;
    // The radiators: folded at action stations unless you have set them by hand, spread again after.
    if (!stations) this.byHand = false;
    const want = stations && H.foldAtStations && !this.byHand ? 0 : this.want;
    if (stations && H.foldAtStations && !this.byHand && !this.foldCalled) {
      this.foldCalled = true;
      this.dc?.say(null, 'Radiators folding for action. The heat sinks will fill: watch the heat.', 0, 5);
    }
    if (!stations) this.foldCalled = false;
    let spread = 0;
    for (const r of this.radiators) {
      r.k = want > r.k ? Math.min(want, r.k + dt / H.deploy) : Math.max(want, r.k - dt / H.deploy);
      if (r.obj) r.obj.scale.x = 0.06 + 0.94 * r.k; // telescoped into its housing at the spar
      spread += r.k * r.health;
    }
    spread /= Math.max(1, this.radiators.length);
    // The heat that went in this frame: the reactor at idle, the main drive as hard as it is burning, the guns.
    let main = 0, mains = 0;
    for (const t of this.thrusters) if (t.kind === 'main') (main += t.throttle), mains++;
    main /= Math.max(1, mains);
    const cap = 0.35 + 0.65 * this.ship.sys('heat'); // a hurt sink holds less
    const into = (this.ship.power ? H.base : H.base * 0.3) * dt + H.drive * main * dt + this.added;
    this.added = 0;
    const out = H.reject * (H.folded + (1 - H.folded) * spread) * (0.25 + 0.75 * this.heat) * dt;
    this.heat = clamp(this.heat + (into - out) / cap, 0, 1.05);
    // Warnings, and the limit.
    if (!this.warned && this.heat >= H.warn) {
      this.warned = true;
      this.sfx?.cue('chime');
      this.C.bus?.emit('call', { id: 'heat-warning' });
      this.dc?.say(null, 'Heat warning: the sinks are 80% full. Spread the radiators (G at the helm) or ease off.', 0, 6);
    } else if (this.warned && this.heat < H.warn - 0.1) this.warned = false;
    const wasHot = this.hot;
    this.hot = this.heat >= H.limit || (this.hot && this.heat > H.limit - 0.08);
    if (this.hot && !wasHot) {
      this.sfx?.cue('klaxon', { n: 2 });
      // A ship with railguns names them (the torpedo broadside launches cold and makes no heat).
      this.C.bus?.emit('call', { id: this.C.L.weapons?.railgun ? 'heat-full' : 'heat-full-pdc' });
      if (this.C.L.weapons?.railgun) this.dc?.say(null, 'Heat sinks full: point defence and railguns hold fire, the drive is held back.', 0, 7);
      else this.dc?.say(null, 'Heat sinks full: point defence holds fire, the drive is held back.', 0, 7);
    } else if (wasHot && !this.hot) this.C.bus?.emit('call', { id: 'heat-clear' }), this.dc?.say(null, 'Heat back under the limit: weapons free.', 0, 4);
    // Reaction mass: what the drive burned, and what leaks out of a holed tank.
    const isp = this.P.propellant.isp;
    let flow = 0;
    for (const t of this.thrusters) if (t.kind === 'main') flow += (t.force * t.throttle) / (isp * G0);
    this.prop = Math.max(0, this.prop - flow * dt);
    let leaking = false;
    for (const k of this.tanks) {
      const n = this.ship.node(k.id);
      if (n?.holes.some((h) => !h.sealed && !h.to)) {
        leaking = true;
        this.prop = Math.max(0, this.prop - this.prop0 * k.share * this.P.propellant.leak * dt);
      }
    }
    if (leaking && !this.leaking) this.C.bus?.emit('call', { id: 'propellant-leak' }), this.dc?.say(null, 'Propellant leak: a holed tank is venting reaction mass until it is sealed.', 0, 6);
    this.leaking = leaking;
    // What the heat and the tanks allow the main drive.
    const allow = this.prop <= 0 ? 0 : this.hot ? H.throttle : 1;
    for (const t of this.thrusters) if (t.kind === 'main') t.health = Math.min(t.health ?? 1, allow);
    // The glow: the fins and the heat sinks' bands, dark when she is cool, through red to orange-white when hot.
    const g = clamp(this.heat, 0, 1);
    const c = g < 0.6 ? DARK.clone().lerp(HOT, g / 0.6) : HOT.clone().lerp(WHITE, (g - 0.6) / 0.45);
    if (this.glow) {
      this.glow.emissive?.copy(c);
      this.glow.emissiveIntensity = 0.6 + 4 * g;
    }
    HEAT_GLOW.color.copy(c);
  }

  /** Rows for the cutaway's status board (integrity.mjs `status`). */
  rows() {
    const pc = (v) => `${Math.round(v * 100)}%`;
    const rad = this.radiators.reduce((s, r) => s + r.k, 0) / Math.max(1, this.radiators.length);
    return [
      ['Heat sinks', this.ship.sys('heat'), `${pc(this.heat)} full${this.hot ? ' · FULL' : ''}`],
      ['Radiators', this.radiators.reduce((s, r) => s + r.health, 0) / Math.max(1, this.radiators.length), rad > 0.95 ? 'spread' : rad < 0.05 ? 'folded' : 'moving'],
      ['Propellant', this.prop / this.prop0, `Δv ${(this.dv() / 1000).toFixed(1)} km/s${this.leaking ? ' · LEAKING' : ''}`]
    ];
  }
}
