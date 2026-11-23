// Small signs that the ship you are in is a machine, working: what you hear and see of her systems leaning on each
// other.
//
// - The plating ticks as the sun's heat moves over it. Turn her and the side coming into the sun swells while the
//   side going into shade shrinks, and for half a minute after the hull ticks and pings as it settles (`STRESS`).
//   Held still to the sun she goes quiet.
// - The frames groan as the drive takes up the load when it lights, and tick as it lets go when it stops.
// - The lamps dip when the drive lights (the turbopumps' motors starting on the bus) and, a little, as a gun fires,
//   with a flicker, and come back (render.mjs `sag`, and the pool's lamps here). On a big ship it is less.
//
// `new Aboard(G, { view, ambience, lightPool })`, `frame(dt, { inside })` after the drive has stepped, `lamps()`
// after the light pool is updated.

import * as THREE from 'three';

/** The sun's heat: how much a turn stresses the plating (per radian of the sun moving over her), how fast the stress
 *  eases (s), and the ticks it makes (per second at a stress of 1). */
const STRESS = { perRad: 1.6, ease: 22, rate: 1.4, max: 2 };
/** A ship heavier than this (kg) has a bus big enough not to notice. */
const BIG = 5e6;

const _s = new THREE.Vector3(), _q = new THREE.Quaternion();
/** Its own dice, not the page's Math.random (`?seed=` seeds that for the scripted runs). */
const rand = (() => {
  let a = (Date.now() ^ 0xab0a) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

export class Aboard {
  constructor(G, { view, ambience, lightPool }) {
    Object.assign(this, { G, view, ambience, lightPool });
    this.sunWas = null;
    this.stress = 0;
    this.lit = false;
    this.sag = 0;
    this.flick = 0;
    this.shots = new Map(); // turret → its last recoil clock, to see a new shot
    this.big = (G.L.mass ?? 0) > BIG;
  }

  frame(dt, { inside }) {
    const { G, view } = this;
    // The sun in her frame, and how far it moved over her this frame.
    G.C.obj.getWorldQuaternion(_q).invert();
    _s.copy(view.sun.position).normalize().applyQuaternion(_q);
    if (this.sunWas) {
      const turned = this.sunWas.angleTo(_s);
      this.stress = Math.min(STRESS.max, this.stress + turned * STRESS.perRad);
    } else this.sunWas = new THREE.Vector3();
    this.sunWas.copy(_s);
    this.stress *= Math.exp(-dt / STRESS.ease);
    if (inside && !this.G.berth?.carried && rand() < dt * STRESS.rate * this.stress * this.stress) {
      // Often two or three together, running along the plating.
      const n = rand() < 0.4 ? 2 + Math.floor(rand() * 2) : 1, hz = 1200 + rand() * 2600;
      for (let i = 0; i < n; i++) this.ambience?.tick?.(0.6 + rand() * 0.5, { hz: hz * (0.9 + rand() * 0.25), at: i * (0.05 + rand() * 0.12) });
    }
    // The drive lighting or stopping.
    const sp = G.drive?.spool?.();
    const lit = !!sp?.lit;
    if (lit !== this.lit) {
      this.lit = lit;
      if (inside) {
        if (lit) {
          setTimeout(() => this.ambience?.groan?.(this.big ? 0.8 : 1.1, { f: 34 + rand() * 14, len: 2.2 }), 250);
          this.dip(this.big ? 0.25 : 0.55);
        } else for (let i = 0; i < 3; i++) this.ambience?.tick?.(0.7, { hz: 900 + rand() * 900, at: 0.6 + i * (0.4 + rand() * 0.9) });
      }
    }
    // A gun firing: a small dip.
    for (const t of G.guns?.turrets ?? []) {
      const r = t.recoilT ?? 9, was = this.shots.get(t) ?? 9;
      if (r < was && r < 0.1) this.dip(this.big ? 0.06 : 0.18);
      this.shots.set(t, r);
    }
    this.sag *= Math.exp(-dt / 0.35);
    this.flick = Math.max(0, this.flick - dt);
    // While it recovers the lamps flicker, a little.
    view.sag = this.sag * (this.flick > 0 ? 0.7 + 0.6 * rand() : 1);
  }

  /** The lamps dip by `k` (0 to 1) and come back over a second, flickering. */
  dip(k) {
    this.sag = Math.min(1, Math.max(this.sag, k));
    this.flick = 0.45;
  }

  /** After the pool is updated: its lamps dip with the rest. */
  lamps() {
    const k = 1 - 0.6 * Math.max(0, Math.min(1, this.view.sag));
    if (k > 0.999) return;
    for (const l of this.lightPool.lights) l.intensity *= k;
  }

  info() {
    return { stress: +this.stress.toFixed(2), sag: +this.sag.toFixed(2), lit: this.lit };
  }
}
