// What damage looks like (design/ROADMAP.md, phase 9): recipes over blaze.mjs's particles. Each takes the Blaze to
// draw in and points in that Blaze's frame. Looks only: Math.random throughout.
//
//   hullBlast   a hit on the outside of the hull: flash, fireball, sparks, a dust cloud that hangs, and the air of the
//               room behind it venting white (integrity.mjs `impact`).
//   ventOut     a hole to space breathing out its room's air, a frame at a time (integrity.mjs `holeFrame`).
//   breachIn    the same hit seen from inside: the blast through the hole, a jet of flame, shrapnel, smoke.
//   fireTick    a fire burning, a frame at a time (damage.mjs): where there is weight its flames lick upwards and its
//               smoke rolls up to the deckhead and along it; where there is none (the fixed hull floats), the flames
//               are round and dimmer and drift with the air, and the smoke spreads every way.
//   sprayTick   the extinguisher's powder, from your hands to the fire.
//   weldTick    the welder: the arc, a shower of sparks, fumes.
//   jetTick     a coolant leak: a jet of droplets and vapour off the pipe (falling where there is weight).
//   zapTick     an electrical fault: bursts of sparks; true on a frame it bursts (the caller flashes a light).
//
// The rates keep their fractions in an `acc` object the caller holds, so a slow rate still emits at a low frame rate.

import * as THREE from 'three';

const R = Math.random;
const rnd = (a, b) => a + (b - a) * R();
const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3();

/** A random point in the unit ball (not at its centre). */
function ball(out) {
  do out.set(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1);
  while (out.lengthSq() > 1 || out.lengthSq() < 1e-4);
  return out;
}

/** A random unit direction within `spread` of `dir` (0 along it, 1 about a hemisphere, 2 nearly every way). */
function cone(out, dir, spread) {
  ball(out).normalize().multiplyScalar(spread).add(dir);
  if (out.lengthSq() < 1e-6) out.copy(dir);
  return out.normalize();
}

/** How many to emit this frame at `rate` a second, keeping the fraction in `acc[key]`. */
function count(acc, key, rate, dt) {
  const x = (acc[key] ?? 0) + Math.max(0, rate) * dt;
  const n = Math.floor(x);
  acc[key] = x - n;
  return Math.min(n, 40);
}

/** A point on a disc of radius `r` round `p`, across `n`. */
function disc(out, p, n, r) {
  _t.copy(Math.abs(n.y) < 0.9 ? UP : _u.set(1, 0, 0)).cross(n).normalize();
  _s.crossVectors(n, _t);
  const a = R() * Math.PI * 2, rr = r * Math.sqrt(R());
  return out.copy(p).addScaledVector(_t, Math.cos(a) * rr).addScaledVector(_s, Math.sin(a) * rr);
}

/** A hit on the outside of the hull at `p`, `out` the way out of the plating (unit). `size` 1 a shell, about 3 a
 *  torpedo; `air` 0..1, the air in the room behind it (it vents). */
export function hullBlast(B, p, out, size = 1, air = 0) {
  const sq = Math.sqrt(size);
  // The flash: white, and gone.
  for (let i = 0; i < 3; i++) B.emit('flame', _p.copy(p).addScaledVector(out, 0.5 * size), _v.set(0, 0, 0), { life: rnd(0.12, 0.22), s0: 2 * size, s1: 9 * size, heat: 1, cool: 0.3, k: 1.6, fade: 1 });
  // The fireball: thrown out of the plating, orange going red, and gone in a second: there is no air out here to feed it.
  for (let i = 0; i < Math.round(20 * size); i++) {
    cone(_v, out, 0.9).multiplyScalar(rnd(8, 28) * sq);
    B.emit('flame', _p.copy(p).addScaledVector(_v, 0.04), _v, { life: rnd(0.5, 1.1) * (0.7 + 0.15 * size), s0: 1.5 * size, s1: rnd(5, 10) * size, heat: rnd(0.85, 1), cool: 1.4, drag: 1.2, fade: 1.2 });
  }
  // Glowing bits of the plating and the warhead, fast and far.
  for (let i = 0; i < Math.round(30 * size); i++) {
    cone(_v, out, 1.2).multiplyScalar(rnd(25, 90));
    const s = rnd(0.3, 0.6) * sq;
    B.emit('spark', p, _v, { life: rnd(0.5, 1.6), s0: s, s1: s * 0.6, heat: 1, cool: 0.8, k: 1.3 });
  }
  // The dust: paint, insulation and metal smoke, a cloud that hangs off her side.
  for (let i = 0; i < Math.round(10 * size); i++) {
    cone(_v, out, 1).multiplyScalar(rnd(2, 9) * sq);
    B.emit('smoke', p, _v, { life: rnd(4, 8), s0: 1.5 * size, s1: rnd(8, 14) * size, heat: rnd(0.25, 0.45), k: 0.5, fade: 1.2, drag: 0.15 });
  }
  if (air > 0.02) for (let i = 0; i < Math.round(12 * size * air); i++) {
    _v.copy(out).multiplyScalar(rnd(15, 40)).addScaledVector(ball(_s), 6);
    B.emit('vapour', p, _v, { life: rnd(1.5, 3), s0: 0.8, s1: rnd(5, 10) * sq, heat: 1, k: 0.45 * air, drag: 0.2 });
  }
}

/** A hole to space at `p` (`out` the way out) breathing out its room's air, `k` 0..1 how hard. */
export function ventOut(B, p, out, k, dt, acc, size = 1) {
  for (let i = count(acc, 'vent', 22 * k * size, dt); i > 0; i--) {
    _v.copy(out).multiplyScalar(rnd(10, 30) * (0.4 + 0.6 * k)).addScaledVector(ball(_s), 3);
    B.emit('vapour', p, _v, { life: rnd(1, 2.2), s0: 0.3 * size, s1: rnd(3, 7) * Math.sqrt(size), heat: 1, k: 0.32 * k, drag: 0.15 });
  }
}

/** The hit from inside: the blast through the hole at `p`, `into` the way into the room. `air` 0..1 the room's air;
 *  `weight` true where things fall (the drums). */
export function breachIn(B, p, into, size = 1, air = 1, weight = false) {
  const sq = Math.sqrt(size), lit = air > 0.2;
  for (let i = 0; i < 2; i++) B.emit('flame', _p.copy(p).addScaledVector(into, 0.4), _v.set(0, 0, 0), { life: rnd(0.1, 0.16), s0: 1.5, s1: 3.2 * sq, heat: 1, cool: 0.3, k: 1.5, fade: 1 });
  // The jet of flame: the warhead's gas and what it set alight, driven in along the way the shell came.
  for (let i = 0; i < Math.round(26 * size * (0.4 + 0.6 * air)); i++) {
    cone(_v, into, 0.45).multiplyScalar(rnd(5, 15));
    B.emit('flame', p, _v, { life: rnd(0.35, 0.9) * (lit ? 1 : 0.5), s0: 0.25, s1: rnd(0.9, 1.8) * sq, heat: 1, cool: 1.4, drag: lit ? 2.2 : 0, rise: weight && lit ? 3 : 0, fade: 1.2 });
  }
  // Shrapnel: hot bits of the plating.
  for (let i = 0; i < Math.round(30 * size); i++) {
    cone(_v, into, 0.8).multiplyScalar(rnd(8, 28));
    const s = rnd(0.05, 0.09);
    B.emit('spark', p, _v, { life: rnd(0.3, 1), s0: s, s1: s, heat: 1, cool: 0.6, rise: weight ? -9.8 : 0 });
  }
  // The smoke it leaves, filling the room.
  if (air > 0.1) for (let i = 0; i < Math.round(14 * size); i++) {
    cone(_v, into, 0.9).multiplyScalar(rnd(1, 4));
    B.emit('smoke', p, _v, { life: rnd(6, 12), s0: 0.4, s1: rnd(2, 3.5) * sq, heat: rnd(0.05, 0.2), k: 0.55 * air, drag: 1, rise: weight ? 0.15 : 0, fade: 1 });
  }
}

/** A fire, one frame. `F`: { p, n (out of what is burning, into the room), r (m), size, left (0..1, what the
 *  extinguisher has left of it), weight, wind (the draft, m/s, or null), up (m from `p` to the deckhead), acc }. */
export function fireTick(B, F, dt) {
  const sq = Math.sqrt(F.size), left = Math.max(0.05, F.left), w = F.weight, acc = (F.acc ??= {});
  const wind = F.wind ?? ZERO;
  for (let i = count(acc, 'flame', 60 * F.size * left, dt); i > 0; i--) {
    disc(_p, F.p, F.n, F.r * (0.4 + 0.6 * left)).addScaledVector(F.n, 0.05);
    _v.copy(F.n).multiplyScalar(rnd(0.3, 1) * (w ? 1 : 0.6)).addScaledVector(ball(_s), 0.35);
    B.emit('flame', _p, _v, {
      life: w ? rnd(0.4, 0.8) : rnd(0.5, 1), s0: 0.15 * sq, s1: rnd(0.35, 0.65) * sq * (0.6 + 0.4 * left),
      heat: w ? rnd(0.8, 1) : rnd(0.6, 0.9), cool: 1.2, fade: 1.1, rise: w ? 2.8 : 0, drag: w ? 1.5 : 2.5, wind
    });
  }
  for (let i = count(acc, 'smoke', 5 * F.size * left + 1, dt); i > 0; i--) {
    disc(_p, F.p, F.n, F.r).addScaledVector(F.n, 0.3 * sq);
    // Where there is weight it climbs as far as the deckhead and stops there; where there is none it spreads.
    if (w) _v.set(0, Math.max(0.2, (F.up ?? 2.5) - 0.3) * 0.5, 0).addScaledVector(ball(_s), 0.5);
    else _v.copy(F.n).multiplyScalar(rnd(0.2, 0.6)).addScaledVector(ball(_s), 0.5);
    B.emit('smoke', _p, _v, { life: rnd(8, 14), s0: 0.4, s1: rnd(2.5, 4) * sq, heat: rnd(0.04, 0.15), k: 0.45, fade: 1, drag: 0.5, wind: w ? null : wind });
  }
  for (let i = count(acc, 'ember', 4 * F.size * left, dt); i > 0; i--) {
    _v.copy(F.n).multiplyScalar(rnd(0.5, 1.5)).addScaledVector(ball(_s), 0.8);
    const s = rnd(0.04, 0.07);
    B.emit('spark', disc(_p, F.p, F.n, F.r), _v, { life: rnd(1, 2.5), s0: s, s1: s * 0.5, heat: rnd(0.5, 0.9), cool: 1, drag: 0.5, rise: w ? 1.2 : 0, wind });
  }
}

/** The extinguisher, one frame: powder from `from` at `to`. */
export function sprayTick(B, from, to, dt, acc) {
  const d = _t.subVectors(to, from);
  if (d.lengthSq() < 1e-4) return;
  d.normalize();
  for (let i = count(acc, 'spray', 80, dt); i > 0; i--) {
    cone(_v, d, 0.12).multiplyScalar(rnd(6, 10));
    B.emit('powder', _p.copy(from).addScaledVector(ball(_s), 0.04), _v, { life: rnd(0.6, 1.1), s0: 0.06, s1: rnd(0.6, 1.1), heat: rnd(0.85, 1), k: 0.5, fade: 1.4, drag: 1.8 });
  }
}

/** The welder at `p` on a surface facing `n`, one frame. */
export function weldTick(B, p, n, dt, weight, acc) {
  // The arc: a white star that flickers (its glow on the walls is the caller's light).
  B.emit('flame', p, _v.set(0, 0, 0), { life: 0.07, s0: rnd(0.25, 0.4), s1: 0.2, heat: 1, cool: 0.05, k: 1.4 });
  B.emit('spark', p, _v, { life: 0.06, s0: rnd(0.3, 0.45), s1: 0.2, heat: 1, cool: 0.2, k: 2.5 });
  for (let i = count(acc, 'weld', 110, dt); i > 0; i--) {
    cone(_v, n, 1.1).multiplyScalar(rnd(1.5, 5));
    const s = rnd(0.06, 0.11);
    B.emit('spark', p, _v, { life: rnd(0.25, 0.8), s0: s, s1: s * 0.6, heat: 1, cool: 0.7, k: 1.7, drag: 0.2, rise: weight ? -9.8 : 0 });
  }
  for (let i = count(acc, 'fume', 5, dt); i > 0; i--) {
    _v.copy(n).multiplyScalar(0.3).addScaledVector(ball(_s), 0.2);
    B.emit('smoke', p, _v, { life: rnd(3, 5), s0: 0.1, s1: rnd(0.5, 0.8), heat: 0.55, k: 0.25, drag: 0.8, rise: weight ? 0.3 : 0 });
  }
}

/** A coolant leak at `p` spraying along `dir`, `k` 0..1 how hard, one frame. */
export function jetTick(B, p, dir, dt, weight, k, acc) {
  for (let i = count(acc, 'drop', 60 * k, dt); i > 0; i--) {
    cone(_v, dir, 0.12).multiplyScalar(rnd(3.5, 6));
    const s = rnd(0.03, 0.05);
    B.emit('droplet', p, _v, { life: rnd(0.9, 1.5), s0: s, s1: s * 1.4, heat: 1, k: 0.85, fade: 0.6, drag: 0.15, rise: weight ? -9.8 : 0 });
  }
  for (let i = count(acc, 'mist', 12 * k, dt); i > 0; i--) {
    cone(_v, dir, 0.5).multiplyScalar(rnd(0.8, 2));
    B.emit('vapour', p, _v, { life: rnd(2, 3.5), s0: 0.1, s1: rnd(0.8, 1.4), heat: 1, k: 0.22, drag: 1 });
  }
}

/** An electrical fault at `p` on a panel facing `n`: now and then a burst of sparks (true when it bursts). */
export function zapTick(B, p, n, dt, weight) {
  if (R() > dt * 3) return false;
  for (let i = 0, m = Math.round(rnd(8, 18)); i < m; i++) {
    cone(_v, n, 1).multiplyScalar(rnd(1.5, 6));
    const s = rnd(0.03, 0.05);
    B.emit('spark', _p.copy(p).addScaledVector(ball(_s), 0.15), _v, { life: rnd(0.2, 0.7), s0: s, s1: s * 0.6, heat: 1, cool: 0.8, rise: weight ? -9.8 : 0 });
  }
  return true;
}
