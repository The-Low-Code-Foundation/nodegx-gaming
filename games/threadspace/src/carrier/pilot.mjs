// The crew at the helm: a pilot who flies the ship you are aboard by Newton's rules (design/ROADMAP.md, phases 13, 14
// and 16: the commander flies the first sorties and you ride along; later you give orders and the crew fly them).
//
// It flies the real controls. Each frame it hands the helm the same six numbers a person's keys and stick make (an
// acceleration along her x, y, z and a turn about them, each -1 to 1: `Helm.frame`'s `f.u`, with `f.jets` for "main
// drive shut", which is what docking mode is), and from there it is the one code path: the flight assist, then
// `Thrusters.allocate`, then `step`. So the jets and the drive that fire are hers, the puffs show, the drive's push is
// felt aboard, the tanks drain, and a hurt thruster or a hot plant holds the pilot back exactly as it would you.
// Nothing here sets a position or a velocity.
//
// A plan is a list of legs, flown in order (`pilot.fly(plan)`):
//
//   { do: 'launch' }                 on the cradle: ask flight control (L), ride the cradle out, take her at the
//                                    hand-over and bring her to rest abeam the berth, `standoff` metres off the door
//   { do: 'goto', at: [x, y, z], speed?, stop?, frame? }
//                                    a point in the host's frame (her layout's: x starboard, y up, -z her bow), or in
//                                    `frame` (see `hostFrame`). At rest there, or with `stop: false` through it at
//                                    `speed` m/s. A short hop is flown on the jets alone; a long one is turn, burn,
//                                    coast, flip, burn, then the jets for the last metres. A straight line that would
//                                    pass through the host's keep-out goes round by one or two waypoints (`route`).
//   { do: 'hold', secs, at? }        keep station (where she is, or at `at`) for `secs`
//   { do: 'turn', to }               `to`: 'prograde', 'retrograde', 'host-parallel', or an attitude in the frame
//                                    ([x, y, z, w] or a Quaternion)
//   { do: 'recover' }                to the lane's holding point, parallel to the host, request recovery (L), slide in
//                                    down the lane to the cradle's arms, by the rules and tolerances you get
//                                    (recovery.mjs). Waved off, it backs out and comes again; waved off twice, it
//                                    hands her to flight control (`berth.takeIn()`).
//
// What it says: `pilot-leg` { leg, i, n } on the bus at the start of each leg, `pilot-done` { ok, why } at the end, and
// the pilot's own calls through the announcer (content/announcements/pilot-*.json).
//
// Skill (`pilot.skill`, 0 to 1; the first game's 1 to 10 pilot stat is taken too) changes what the pilot's hands do,
// never what the ship does: how late it reacts (`react`: it decides, then holds that for a moment), how well it reads
// where she is (a slow wandering error in position, speed and attitude, from its own seeded numbers), how hard it
// burns and brakes, how fast it slides, how wide it gives the host. See `tune()`.
//
// Not here yet: a host under way or turning (the frame's velocity is read, but the lane and the route are worked out
// as if she holds still), other ships in the way, anything in a fight.

import * as THREE from 'three';
import { clamp } from '../util.mjs';
import { LANE } from './recovery.mjs';
import { KEYS } from './hud.mjs';

const mulberry = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const lerp = (a, b, k) => a + (b - a) * k;
const NONE = new Set();
const ZERO = new THREE.Vector3();
const _p = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _aim = new THREE.Quaternion(), _fq = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const km = (d) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`);

/** A reference frame a leg is flown in: here the host's (her layout's frame). `toWorld` and `toLocal` change the vector
 *  they are given; `quat(out)` is its attitude and `vel` its velocity, both in the world. */
export function hostFrame(berth) {
  const H = berth.H;
  return {
    name: 'host',
    toWorld: (v) => (H.obj.updateMatrixWorld(true), H.frame.localToWorld(v)),
    toLocal: (v) => (H.obj.updateMatrixWorld(true), H.frame.worldToLocal(v)),
    quat: (out) => H.obj.getWorldQuaternion(out),
    vel: berth.hostVel
  };
}

/** What a flown ship keeps out of round `HL` (a layout): boxes in her layout's frame, from her hull's sections (so
 *  the drums' great width is only where the drums are) and her radiators. */
export function keepOut(HL) {
  const boxes = [], main = HL.hull.main;
  for (let i = 0; i + 1 < main.length; i++) {
    const a = main[i], b = main[i + 1], w = Math.max(a.w, b.w) / 2, h = Math.max(a.h, b.h) / 2, y = ((a.y ?? 0) + (b.y ?? 0)) / 2;
    boxes.push({ min: [-w, y - h, a.z], max: [w, y + h, b.z] });
  }
  for (const m of HL.mounts ?? []) if (m.kind === 'radiator' && m.x && m.z) boxes.push({ min: [Math.min(...m.x), (m.y ?? 0) - 3, m.z[0]], max: [Math.max(...m.x), (m.y ?? 0) + 3, m.z[1]] });
  const all = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const b of boxes) for (let k = 0; k < 3; k++) (all.min[k] = Math.min(all.min[k], b.min[k])), (all.max[k] = Math.max(all.max[k], b.max[k]));
  return { boxes, all };
}

/** Whether `p` is inside box `b` grown by `m`. */
const inside = (b, p, m) => p.x > b.min[0] - m && p.x < b.max[0] + m && p.y > b.min[1] - m && p.y < b.max[1] + m && p.z > b.min[2] - m && p.z < b.max[2] + m;

/** Whether the straight line from `a` to `b` stays out of every box grown by `m` (the slab test). */
function segClear(boxes, a, b, m) {
  for (const B of boxes) {
    let t0 = 0, t1 = 1, hit = true;
    for (let k = 0; k < 3 && hit; k++) {
      const p = a.getComponent(k), d = b.getComponent(k) - p, lo = B.min[k] - m, hi = B.max[k] + m;
      if (Math.abs(d) < 1e-9) hit = p > lo && p < hi;
      else {
        const u = (lo - p) / d, v = (hi - p) / d;
        t0 = Math.max(t0, Math.min(u, v));
        t1 = Math.min(t1, Math.max(u, v));
        hit = t0 < t1;
      }
    }
    if (hit) return false;
  }
  return true;
}

/** The way from `a` to `b` round the keep-out `K`, each line of it `m` clear of every box: the points to fly to in
 *  turn, ending with `b`; or null when `b` itself is inside. A start that is inside (just handed over off the door)
 *  first goes straight out the nearest way. The waypoints are tried from the corners, edges and faces of the whole
 *  keep-out's box grown by `m` and half as much again, and at `a`'s and `b`'s own places along it: one if one will
 *  do, two if not, the shortest way that is clear. */
export function route(K, a, b, m) {
  if (K.boxes.some((B) => inside(B, b, m))) return null;
  const out = [];
  let from = a.clone();
  for (let i = 0; i < 4; i++) {
    const B = K.boxes.find((x) => inside(x, from, m));
    if (!B) break;
    // Out through the nearest face.
    let best = Infinity, k = 0, s = 1;
    for (let j = 0; j < 3; j++) for (const sg of [-1, 1]) {
      const pen = sg > 0 ? B.max[j] + m - from.getComponent(j) : from.getComponent(j) - (B.min[j] - m);
      if (pen < best) (best = pen), (k = j), (s = sg);
    }
    from = from.clone().setComponent(k, s > 0 ? B.max[k] + m + 5 : B.min[k] - m - 5);
    out.push(from);
  }
  if (segClear(K.boxes, from, b, m)) return [...out, b.clone()];
  const g = m * 1.5 + 20, lo = K.all.min.map((x) => x - g), hi = K.all.max.map((x) => x + g), mid = lo.map((x, i) => (x + hi[i]) / 2);
  const cands = [];
  for (const sx of [-1, 0, 1]) for (const sy of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
    if (!sx && !sy && !sz) continue;
    const pick = (s, k) => (s < 0 ? lo[k] : s > 0 ? hi[k] : mid[k]);
    cands.push(new THREE.Vector3(pick(sx, 0), pick(sy, 1), pick(sz, 2)));
    // Over, under or round her at the start's and the end's own place along her (and across her), not only her middle.
    if (!sz && (sx || sy)) for (const z of [from.z, b.z, (from.z + b.z) / 2]) cands.push(new THREE.Vector3(pick(sx, 0), pick(sy, 1), clamp(z, lo[2], hi[2])));
    if (!sx && (sy || sz)) for (const x of [from.x, b.x]) cands.push(new THREE.Vector3(clamp(x, lo[0], hi[0]), pick(sy, 1), pick(sz, 2)));
  }
  let best = null, len = Infinity;
  const ok = (p, q) => segClear(K.boxes, p, q, m);
  const first = cands.filter((c) => ok(from, c)), last = cands.filter((c) => ok(c, b));
  for (const c of first) {
    if (!last.includes(c)) continue;
    const l = from.distanceTo(c) + c.distanceTo(b);
    if (l < len) (len = l), (best = [c]);
  }
  if (!best) for (const c of first) for (const e of last) {
    if (c === e) continue;
    const l = from.distanceTo(c) + c.distanceTo(e) + e.distanceTo(b);
    if (l < len && ok(c, e)) (len = l), (best = [c, e]);
  }
  return best ? [...out, ...best.map((c) => c.clone()), b.clone()] : null;
}

export class Pilot {
  /** `G`: the game in hand (main.mjs), with `berth` made (a carried ship's page). `skill` 0 to 1 (or 1 to 10), `seed`
   *  for the pilot's own random numbers, `who` has the helm when it flies (the HUD's word: "Commander has the helm"). */
  constructor(G, { skill = 0.8, seed = 1, who = 'Commander' } = {}) {
    this.G = G;
    this.C = G.C;
    this.body = G.body;
    this.helm = G.helm;
    this.thr = G.helm.thr;
    this.berth = G.berth;
    this.lane = G.berth.lane;
    this.frame0 = hostFrame(G.berth);
    this.keep = keepOut(G.berth.H.L);
    this.who = who;
    this.seed = seed;
    this.rand = mulberry(seed);
    this.skill = skill;
    this.busy = false;
    this.plan = [];
    this.i = -1;
    this.leg = null;
    this.log = []; // each leg flown: { do, secs, err, speed, prop, … } (tools/carrier-check.mjs reads it)
    this.phase = ''; // what it is doing now, for the HUD
    this.raw = new Array(6).fill(0); // what it wants this frame
    this.u = new Array(6).fill(0); // what its hands are giving (decided `react` seconds apart)
    /** The input frame the helm takes while it flies: no keys, no stick, the command whole. */
    this.cmd = { keys: NONE, dx: 0, dy: 0, wheel: 0, clicked: false, trigger: false, u: this.u, jets: true };
    this.rawJets = true;
    this.since = 0;
    this.t = 0;
    this.v = new THREE.Vector3(); // her velocity against the frame, in the world, as the pilot reads it
    this.p = new THREE.Vector3(); // and her place
    this.bias = { p: new THREE.Vector3(), v: new THREE.Vector3(), a: new THREE.Vector3(), tp: new THREE.Vector3(), tv: new THREE.Vector3(), ta: new THREE.Vector3(), t: 0 };
    G.helmSight.pilot = this; // the helm's sight says who has her (helmsight.mjs)
    // The key that hands her to the pilot for a circuit, at the helm (seats/helm.mjs).
    if (!KEYS.helm.includes('circuit')) KEYS.helm = KEYS.helm.replace(' · <b>view</b> V', ` · <b>${who.toLowerCase()} flies a circuit</b> J (again: you have her) · <b>view</b> V`);
    if (G.mode() === 'helm') G.hud.keysEl.innerHTML = KEYS.helm;
  }

  get hasHelm() {
    return this.busy;
  }

  get skill() {
    return this._skill;
  }

  /** 0 (a first-week hand) to 1 (as good as she can be flown); over 1 is the first game's 1 to 10 pilot stat. */
  set skill(x) {
    x = +x;
    if (!Number.isFinite(x)) x = 0.8;
    this._skill = clamp(x > 1 ? (x - 1) / 9 : x, 0, 1);
    this.K = this.tune(this._skill);
  }

  /** What skill `s` makes of the pilot's hands. Every number here is an input to the controls, none a rule of flight. */
  tune(s) {
    const react = lerp(0.45, 0.05, s);
    const rough = (1 - s) ** 1.5;
    return {
      react, // seconds between decisions: what its hands give is held that long
      tauV: Math.max(0.5, react * 2.2), // how sharply it chases a speed, s (looser when it reacts late, or it would hunt)
      tauW: Math.max(0.35, react * 1.8), // and a turn rate
      tauA: lerp(1.6, 0.9, s), // how gently it closes the last of a turn, s
      tauP: lerp(5, 2.6, s), // and the last metres to a point
      turn: lerp(0.45, 0.85, s), // of her turning power, how much it plans a turn on
      brake: lerp(0.4, 0.8, s), // of her jets, how much it plans a stop on
      thr: lerp(0.35, 0.85, s), // main drive throttle for a burn
      vMax: lerp(60, 220, s), // m/s it will not pass on the drive, near a host
      vJets: lerp(6, 16, s), // nor on the jets
      hop: 380, // metres: nearer than this it goes on the jets alone
      margin: lerp(90, 38, s), // metres it keeps every line clear of the host
      standoff: lerp(250, 125, s), // metres off the door it takes her after a launch
      slide: lerp(0.55, 1, s), // of the lane's asking speed, how fast it slides in
      tol: lerp(8, 1.5, s), // metres: "there"
      errP: rough * 3.4, errV: rough * 0.6, errA: rough * 0.04 // how far off its reading of place (m), speed (m/s) and attitude (rad) wanders
    };
  }

  /** Flies `plan` (a list of legs, or one). Returns at once; `busy` until it ends. `opts`: `who`, `skill`. */
  fly(plan, opts = {}) {
    if (this.busy) this.end(false, 'a new plan');
    if (opts.who) this.who = opts.who;
    if (opts.skill != null) this.skill = opts.skill;
    this.plan = (Array.isArray(plan) ? plan : [plan]).map((l) => ({ ...l }));
    if (!this.plan.length) return this;
    this.rand = mulberry(this.seed);
    this.log = [];
    this.i = -1;
    this.busy = true;
    this.since = Infinity;
    this.u.fill(0);
    this.assistWas = this.helm.assist;
    this.helm.assist = 1; // the turn assist on, the drift assist off: a coast stays a coast
    this.helm.dockMode(false);
    this.next();
    return this;
  }

  /** Stops the plan and gives the helm back. The helm's own turn assist brings her rates to rest. */
  abort(why = 'aborted') {
    if (this.busy) this.end(false, why);
  }

  /** Take her out 2 km abeam, hold 20 s, bring her home: what the helm's J asks for. */
  circuit(dist = 2000, secs = 20) {
    const b = this.berth, out = [];
    if (b.phase !== 'out') out.push({ do: 'launch' });
    out.push({ do: 'goto', at: [b.spec.out * dist, b.home.y, b.home.z] }, { do: 'turn', to: 'host-parallel' }, { do: 'hold', secs }, { do: 'recover' });
    return out;
  }

  /** J at the helm: the pilot takes her for a circuit, or gives her back. Returns what was said. */
  key() {
    const say = (t, s = 4) => (this.G.helmSight.say(t, s), t);
    if (this.busy) {
      this.abort('the helm was taken back');
      return say(this.berth.carried ? `${this.who} stands down.` : 'You have the helm.');
    }
    if (['recover', 'capture', 'closing'].includes(this.berth.phase)) return say('Flight control has her.', 2);
    this.fly(this.circuit());
    return say(`${this.who} has the helm: out 2 km abeam, hold, and home. J takes her back.`, 5);
  }

  /** A line for the helm's HUD while it flies. */
  status() {
    if (!this.busy) return '';
    return `${this.who} has the helm${this.phase ? ` · ${this.phase}` : ''}`;
  }

  // --- the plan ---------------------------------------------------------------------------------------------------

  /** The leg in hand into `log`: how long, how near and how slow at its end, the reaction mass it took. */
  record() {
    const L = this.leg, P = this.G.plant, r = (x, n = 1000) => Math.round(x * n) / n;
    if (L) this.log.push({ do: L.do, secs: r(L.t, 100), ...(L.err != null ? { err: r(L.err), speed: r(L.speed) } : {}), prop: r((L.prop0 ?? 0) - (P?.prop ?? 0), 10), ...(L.note ?? {}) });
  }

  next() {
    const P = this.G.plant;
    this.record();
    this.i++;
    if (this.i >= this.plan.length) return this.end(true, 'done');
    const L = (this.leg = this.plan[this.i]);
    L.t = 0;
    L.ph = 'start';
    L.prop0 = P?.prop ?? 0;
    L.F = L.frame ?? this.frame0;
    this.phase = L.do;
    this.C.bus?.emit('pilot-leg', { leg: L, i: this.i, n: this.plan.length });
  }

  end(ok, why) {
    this.busy = false;
    this.leg = null;
    this.phase = '';
    this.u.fill(0);
    this.helm.assist = Math.max(1, this.assistWas ?? 1);
    this.C.bus?.emit('pilot-done', { ok, why });
  }

  /** The leg failed: the plan stops here. */
  fail(why) {
    if (this.leg) this.leg.note = { ...(this.leg.note ?? {}), failed: why };
    this.G.helmSight.say(`${this.who}: ${why}. You have the helm.`, 6);
    this.record();
    this.end(false, why);
  }

  /** Each frame, before the helm's (main.mjs `tick`). Returns the input frame for `Helm.frame`, or null when the
   *  pilot is not flying her this frame (no plan, or her berth is carrying her). */
  frame(dt) {
    if (!this.busy) return null;
    const L = this.leg, K = this.K, F = L.F;
    this.t += dt;
    L.t += dt;
    // Where she is and how she moves against the frame, as the pilot reads it: a slow wandering error on each.
    const B = this.bias;
    if ((B.t -= dt) <= 0) {
      B.t = 2 + this.rand() * 3;
      const roll = (v, k) => v.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5).multiplyScalar(2 * k);
      roll(B.tp, K.errP), roll(B.tv, K.errV), roll(B.ta, K.errA);
    }
    const ease = Math.min(1, dt / 1.5);
    B.p.lerp(B.tp, ease), B.v.lerp(B.tv, ease), B.a.lerp(B.ta, ease);
    this.p.copy(this.C.obj.position).add(B.p);
    this.v.copy(this.body.vel).sub(F.vel).add(B.v);
    this.raw.fill(0);
    this.rawJets = true;
    const leg = this.leg;
    if (typeof this[`fly_${L.do}`] !== 'function') return this.fail(`no such leg as "${L.do}"`), null;
    this[`fly_${L.do}`](L, dt);
    if (!this.busy) return null;
    if (this.leg === leg && L.t > (L.max ?? 1500)) return this.fail(`${L.do} took too long`), null;
    if (this.berth.carried) return (this.since = Infinity), this.u.fill(0), null;
    // Its hands: what it decided, held until it decides again.
    if ((this.since += dt) >= K.react) {
      this.since = 0;
      for (let i = 0; i < 6; i++) this.u[i] = clamp(this.raw[i], -1, 1);
      this.cmd.jets = this.rawJets;
    }
    return this.cmd;
  }

  // --- the pilot's hands ------------------------------------------------------------------------------------------

  /** Turn toward the attitude `aim` (world). Returns how far off she is, radians. */
  steer(aim) {
    const K = this.K, w = this.body.ang, raw = this.raw;
    const e = _q.copy(this.C.obj.quaternion).invert().multiply(aim);
    if (e.w < 0) e.set(-e.x, -e.y, -e.z, -e.w);
    const sn = Math.hypot(e.x, e.y, e.z), ang = 2 * Math.atan2(sn, e.w);
    _e.set(e.x, e.y, e.z).multiplyScalar(sn > 1e-9 ? ang / sn : 0).add(this.bias.a);
    for (let i = 0; i < 3; i++) {
      const x = _e.getComponent(i), cap = this.thr.capOf(3 + i, x, true) || 1e-6;
      // The rate that closes on it: as fast as she can still stop from, and gently at the end.
      const want = Math.sign(x) * Math.min(Math.abs(x) / K.tauA, Math.sqrt(2 * cap * K.turn * Math.abs(x)));
      raw[3 + i] = clamp((want - w.getComponent(i)) / (cap * K.tauW), -1, 1);
    }
    return ang;
  }

  /** The attitude with her nose along `dir` (world) and her head toward the frame's up. */
  nose(dir, F, out = _aim) {
    F.quat(_fq);
    _up.set(0, 1, 0).applyQuaternion(_fq);
    _n.copy(dir).normalize();
    if (Math.abs(_n.dot(_up)) > 0.95) _up.set(0, 0, 1).applyQuaternion(_fq);
    return out.setFromRotationMatrix(_m.lookAt(ZERO, _n, _up));
  }

  /** On the jets, chase the velocity `want` (world, against the frame). `axes`: which of her own axes ([x, y, z]). */
  push(want, axes = null) {
    const K = this.K, raw = this.raw;
    const dv = _d.copy(want).sub(this.v).applyQuaternion(_qi.copy(this.C.obj.quaternion).invert());
    for (let i = 0; i < 3; i++) {
      if (axes && !axes[i]) continue;
      const x = dv.getComponent(i);
      if (Math.abs(x) < 1e-4) continue;
      raw[i] = clamp(x / ((this.thr.capOf(i, x, true) || 1e-6) * K.tauV), -1, 1);
    }
  }

  /** On the jets, fly to the point `T` (world) and stop there: never faster than `vmax`, nor than she can stop from.
   *  Returns the distance to go. */
  goPoint(T, vmax) {
    const K = this.K, to = _r.copy(T).sub(this.p), d = to.length();
    const a = Math.min(this.thr.capOf(0, 1, true), this.thr.capOf(1, 1, true), this.thr.capOf(2, 1, true)) * K.brake;
    const v = Math.min(vmax, d / K.tauP, Math.sqrt(2 * a * d));
    this.push(d > 1e-6 ? to.multiplyScalar(v / d) : to.set(0, 0, 0));
    return d;
  }

  /** How far she really is from `T` and how fast she really goes (what a leg records, not what the pilot reads). */
  truth(L, T) {
    L.err = this.C.obj.position.distanceTo(T);
    L.speed = _t.copy(this.body.vel).sub(L.F.vel).length();
  }

  /** The main drive's push as it is now, m/s² at full throttle (hurt, hot or dry: helmsight.mjs `mainAcc`). */
  mainAcc() {
    let a = 0;
    for (const t of this.thr.list) if (t.kind === 'main') a += -t.c[2] * (t.health ?? 1);
    return a;
  }

  /** Seconds to turn her end for end. */
  flipTime() {
    const a = Math.min(this.thr.capOf(3, 1, true), this.thr.capOf(4, 1, true)) * this.K.turn;
    return 2 * Math.sqrt(Math.PI / Math.max(1e-5, a)) + 2 * this.K.tauA + this.K.react;
  }

  // --- the legs ---------------------------------------------------------------------------------------------------

  /** On the cradle: ask, ride it out, then to rest abeam the berth. */
  fly_launch(L) {
    const b = this.berth, K = this.K, F = L.F;
    if (L.ph === 'start') {
      if (b.phase === 'berthed') {
        this.C.bus?.emit('call', { id: 'pilot-standby' });
        b.key();
      } else if (b.phase !== 'opening' && b.phase !== 'launch' && b.phase !== 'out') return this.fail('she is not on her cradle');
      L.ph = 'cradle';
      L.at = new THREE.Vector3(b.spec.out * (Math.abs(b.spec.clear) + (L.standoff ?? K.standoff)), b.home.y, b.home.z);
    }
    if (L.ph === 'cradle') {
      this.phase = b.phase === 'opening' ? 'launch · bay door opening' : 'launch · on the cradle';
      if (b.phase !== 'out') return;
      this.C.bus?.emit('call', { id: 'pilot-clear' });
      L.ph = 'away';
    }
    // Hers now: out along the berth's line on the jets, bow as the berth had it, to rest.
    const T = F.toWorld(_p.copy(L.at));
    this.steer(this.lane.aim());
    const d = this.goPoint(T, K.vJets);
    this.phase = `clear of the bay · ${km(d)} to station`;
    if (d < K.tol && this.v.length() < 0.2) (this.truth(L, T), this.next());
  }

  /** A point in the frame: the route, then each stretch of it. */
  fly_goto(L, dt) {
    const F = L.F, K = this.K;
    if (L.ph === 'start') {
      const from = F.toLocal(this.C.obj.position.clone()), to = new THREE.Vector3(...L.at);
      // The keep-out is the host's: a leg in another frame is flown straight.
      L.pts = F === this.frame0 ? route(this.keep, from, to, L.margin ?? K.margin) : [to];
      if (!L.pts) return this.fail('no clear way to that point');
      L.note = { via: L.pts.length - 1 };
      L.k = 0;
      L.ph = 'plan';
    }
    const last = L.k === L.pts.length - 1, through = last && L.stop === false;
    const T = F.toWorld(_p.copy(L.pts[L.k])), done = this.stretch(L, T, { vEnd: through ? L.speed ?? this.v.length() : 0, through, tol: last ? K.tol : 20, vTol: last ? 0.2 : 2, speed: L.speed }, dt);
    if (!done) return;
    if (!last) return (L.k++, (L.ph = 'plan'));
    this.truth(L, T);
    if (!through) this.C.bus?.emit('call', { id: 'pilot-station' });
    this.next();
  }

  /** One straight stretch to `T` (world). `o`: `vEnd` the speed to have there, `through` (do not stop), `tol` and
   *  `vTol` for "there", `speed` a cap. Returns true when she is there. */
  stretch(L, T, o) {
    const K = this.K, F = L.F, raw = this.raw;
    const to = _r.copy(T).sub(this.p), d = to.length(), rhat = _a.copy(to).multiplyScalar(1 / Math.max(d, 1e-6));
    const sp = this.v.length(), vc = this.v.dot(rhat);
    const aFull = this.mainAcc(), aBurn = aFull * K.thr;
    if (L.ph === 'plan') {
      // A short hop, or no drive to speak of: the jets alone. Else turn, burn, flip, burn.
      L.ph = d < (L.hop ?? K.hop) || aFull < 1 ? 'jets' : 'turn';
      L.hold = F.quat(new THREE.Quaternion()).invert().multiply(this.C.obj.quaternion); // the attitude she has, in the frame
      L.called = false;
    }
    if (L.ph === 'jets') {
      this.steer(_aim.copy(F.quat(_fq)).multiply(L.hold));
      if (o.through) {
        // Through the point at the speed asked: along the line to it, no stop.
        this.push(_t.copy(rhat).multiplyScalar(Math.min(o.vEnd, K.vJets)));
        this.phase = `to the point · ${km(d)}`;
        return d < o.tol || (d < 200 && vc < 0);
      }
      this.goPoint(T, Math.min(o.speed ?? Infinity, K.vJets));
      this.phase = `on the jets · ${km(d)} to go`;
      return d < o.tol && sp < o.vTol;
    }
    // What stopping costs from the closing speed she has: the flip (coasting), then the burn; and the jets' last metres.
    const vCap = o.through ? o.vEnd : Math.min(o.speed ?? Infinity, K.vMax);
    const short = 35 + K.tol, light = this.G.drive?.delay?.() ?? 0;
    const stop = vc > o.vEnd + 1 ? vc * (this.flipTime() + light) + (vc * vc - o.vEnd * o.vEnd) / (2 * aBurn * 0.85) + short : 0;
    // Across the line to the point, the jets take out what drift there is (her own x and y: the drive has z).
    const across = () => this.push(_t.copy(rhat).multiplyScalar(vc), [1, 1, 0]);
    if (L.ph === 'turn' || L.ph === 'burn' || L.ph === 'coast') {
      // The nose along the change of velocity she needs: at the point, less whatever she has across the line to it.
      const ang = this.steer(this.nose(_b.copy(rhat).multiplyScalar(Math.max(vc, 0) + 30).sub(this.v), F));
      if (L.ph === 'turn') {
        this.phase = `turning to burn · ${km(d)} to go`;
        if (ang < 0.05 && this.body.ang.length() < 0.02) L.ph = 'burn';
        return false;
      }
      across();
      if (L.ph === 'burn') {
        if (!L.called) (L.called = true), this.C.bus?.emit('call', { id: 'pilot-burn', what: 'Burning.' });
        this.phase = `burning · ${km(d)} to go · ${Math.round(sp)} m/s`;
        if (ang < 0.12) (raw[2] = -K.thr), (this.rawJets = false);
        if (vc >= vCap) L.ph = 'coast';
      } else this.phase = `coasting · ${km(d)} to go · ${Math.round(sp)} m/s`;
      if (o.through) return d < o.tol || (d < 400 && vc < 0);
      if (stop >= d) {
        L.ph = 'flip';
        this.C.bus?.emit('call', { id: 'pilot-turnover' });
      }
      return false;
    }
    if (L.ph === 'flip' || L.ph === 'brake') {
      // Tail first: the nose against the way she is going.
      const ang = sp > 1.5 ? this.steer(this.nose(_b.copy(this.v).negate(), F)) : (this.steer(this.C.obj.quaternion), 0);
      across();
      // The push it takes to be at `vEnd` a little short of the point.
      const need = (vc * vc - o.vEnd * o.vEnd) / (2 * Math.max(d - short, 1));
      if (L.ph === 'flip') {
        this.phase = `turning over · ${km(d)} to go · ${Math.round(sp)} m/s`;
        if (ang < 0.06 && this.body.ang.length() < 0.03 && need >= aBurn * 0.8) {
          L.ph = 'brake';
          this.C.bus?.emit('call', { id: 'pilot-burn', what: 'Braking.' });
        }
      } else {
        this.phase = `braking · ${km(d)} to go · ${Math.round(sp)} m/s`;
        if (ang < 0.2) (raw[2] = -clamp(need / Math.max(aFull, 1e-6), 0, 1)), (this.rawJets = false);
      }
      // Slow enough for the jets (or gone past, or stopped short): they take her the rest of the way.
      if (sp <= Math.max(o.vEnd, 3) || vc <= 0.5) {
        L.ph = 'jets';
        L.hold = F.quat(new THREE.Quaternion()).invert().multiply(this.C.obj.quaternion);
      }
      return false;
    }
    return false;
  }

  /** Keep station for `secs`: where she is and as she lies, or at `at`. */
  fly_hold(L) {
    const F = L.F;
    if (L.ph === 'start') {
      L.ph = 'hold';
      L.pt = L.at ? new THREE.Vector3(...L.at) : F.toLocal(this.C.obj.position.clone());
      L.hold = F.quat(new THREE.Quaternion()).invert().multiply(this.C.obj.quaternion);
    }
    const T = F.toWorld(_p.copy(L.pt));
    this.steer(_aim.copy(F.quat(_fq)).multiply(L.hold));
    this.goPoint(T, this.K.vJets);
    this.phase = `on station · ${Math.max(0, Math.ceil((L.secs ?? 0) - L.t))} s`;
    if (L.t >= (L.secs ?? 0)) (this.truth(L, T), this.next());
  }

  /** Turn her: `to` 'prograde', 'retrograde', 'host-parallel', or an attitude in the frame. */
  fly_turn(L) {
    const F = L.F, to = L.to;
    let aim;
    if (to === 'prograde' || to === 'retrograde') {
      if (this.v.length() < 0.5) return this.next(); // no way on her to turn along
      aim = this.nose(_b.copy(this.v).multiplyScalar(to === 'prograde' ? 1 : -1), F);
    } else if (to === 'host-parallel' || to == null) aim = F === this.frame0 ? this.lane.aim() : F.quat(_aim);
    else aim = _aim.copy(F.quat(_fq)).multiply(to.isQuaternion ? to : _q.set(...to).normalize());
    const ang = this.steer(_aim.copy(aim));
    this.phase = `turning · ${Math.round((ang * 180) / Math.PI)}° to go`;
    if (ang < 0.012 && this.body.ang.length() < 0.004) {
      L.note = { off: Math.round(((ang * 180) / Math.PI) * 100) / 100 };
      this.next();
    }
  }

  /** Home: the holding point, parallel, the request, the slide, the cradle's arms. */
  fly_recover(L, dt) {
    const b = this.berth, R = this.lane, K = this.K, F = this.frame0;
    L.F = F; // the lane is the host's
    if (L.ph === 'start') {
      if (b.phase !== 'out') return b.carried && b.phase !== 'berthed' ? (L.ph = 'aboard') : this.fail('she is not out');
      this.C.bus?.emit('call', { id: 'pilot-home' });
      L.note = { waveoffs: 0 };
      const s = R.measure();
      // Already in the lane, well out: ask from here. Else to the holding point first.
      L.ph = s.off < 4 && s.along > LANE.arm + 20 && s.along < LANE.len + 40 && s.speed < 1 ? 'square' : 'transit';
      L.go = { F, at: [R.out * (R.clear + LANE.len), b.home.y, b.home.z], ph: 'start', t: 0 };
    }
    if (L.ph === 'aboard') {
      // The cradle (or flight control) has her: nothing to fly.
      this.phase = b.phase === 'berthed' ? 'on the cradle' : b.status();
      if (b.phase === 'berthed') {
        L.note = { ...L.note, recovery: { ...(b.lastRecovery ?? {}) } };
        L.err = 0, (L.speed = 0);
        this.next();
      } else if (b.phase === 'out') L.ph = 'square'; // (flight control would not take her: fly it)
      return;
    }
    if (b.phase !== 'out') {
      if (b.phase === 'capture') this.C.bus?.emit('call', { id: 'pilot-captured' });
      return (L.ph = 'aboard');
    }
    const s = R.state, aim = R.aim();
    if (L.ph === 'transit') {
      // The holding point, by the same road as any point (round the host if she is in the way), to rest.
      const G = L.go;
      if (G.ph === 'start') {
        G.pts = route(this.keep, F.toLocal(this.C.obj.position.clone()), new THREE.Vector3(...G.at), K.margin);
        if (!G.pts) return this.fail('no clear way to the lane');
        G.k = 0;
        G.ph = 'plan';
      }
      const last = G.k === G.pts.length - 1;
      const T = F.toWorld(_p.copy(G.pts[G.k]));
      if (!this.stretch(Object.assign(G, { F }), T, { vEnd: 0, through: false, tol: last ? Math.max(3, K.tol) : 20, vTol: last ? 0.3 : 2 }, dt)) return;
      if (!last) return (G.k++, (G.ph = 'plan'));
      L.ph = 'square';
      return;
    }
    // From here on the jets only, her bow as the berth lies, and the lane's own numbers (recovery.mjs `state`): `along`
    // metres out from the last gate, `fore` and `up` off the line, `closing` toward the host.
    const off = this.steer(aim);
    const hq = F.quat(_fq);
    const slide = (closing, k = 0.2, m = 1) => this.push(_t.set(-R.out * closing, clamp(-s.up * k, -m, m), clamp(-s.fore * k, -m, m)).applyQuaternion(hq));
    const station = (along, vmax) => slide(clamp((s.along - along) * 0.15, -vmax, vmax), 0.15, 2);
    if (L.ph === 'square') {
      // Parallel to her, at rest, on the line: then ask.
      L.at0 ??= clamp(s.along, LANE.arm + 20, LANE.len);
      station(L.at0, 3);
      this.phase = `at the holding point · squaring up ${s.align.toFixed(1)}°`;
      if (off < 0.02 && s.speed < 0.25 && s.off < 3 && this.body.ang.length() < 0.005) {
        if (!R.approved) b.key(); // L: request recovery
        if (!R.approved) return this.handOver(L, 'flight control would not clear her from there');
        L.ph = 'slide';
        this.C.bus?.emit('call', { id: 'pilot-line' });
      }
      return;
    }
    if (L.ph === 'slide') {
      if (R.waved) {
        L.note.waveoffs = R.waveoffs;
        if (R.waveoffs >= 2) return this.handOver(L, 'waved off twice');
        this.C.bus?.emit('call', { id: 'pilot-waveoff' });
        L.ph = 'back';
        return;
      }
      if (!R.approved) return (L.ph = 'square'), (L.at0 = null); // the approval lapsed: ask again
      // Down the lane a little under the speed it asks, easing onto the line; short of the door until it is up.
      const want = Math.min(s.want * K.slide * 0.9, Math.max(0.3, s.along * 0.15 + 0.3));
      if (!s.doorOpen && s.along < LANE.hold + 25) station(LANE.hold + 10, want);
      else slide(want);
      this.phase = `on the line · gate ${Math.round(s.along)} m`;
      return;
    }
    if (L.ph === 'back') {
      // Waved off: back out past where the arms will try again, stop, and come again.
      station(LANE.arm + 18, 3);
      this.phase = `waved off · backing out · gate ${Math.round(s.along)} m`;
      if (s.along > LANE.arm + 12 && s.speed < 0.3 && !R.waved) L.ph = 'slide';
    }
  }

  /** Flight control's to bring in (`berth.takeIn()`), with why. */
  handOver(L, why) {
    L.note = { ...L.note, handed: why };
    this.berth.takeIn();
    if (this.berth.phase === 'out') return this.fail(`${why}, and flight control cannot take her from here`);
    L.ph = 'aboard';
  }
}
