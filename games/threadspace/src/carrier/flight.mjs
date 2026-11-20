// How a fighter flies: Newton and nothing else. Ported from the Fighter Sound Lab, as signed off on 2026-11-14.
//
// - No drag, no top speed, no assist that bleeds your speed away. Velocity only changes while something pushes.
// - The main drive burns only while the pilot holds W: it lights at `rampFrom` of full power and pushes harder the
//   longer it is held, up to `mainAcc` (3 g). Let go and it cuts. Stopping is flip and burn.
// - The manoeuvring jets are small nozzles in four blocks, each pushing from where it sits. A valve is open or shut,
//   nothing between: a correction is a pop of some length, never a throttle. Opposed nozzles on one block cancel, so
//   neither opens. They run on a small tank of cold gas; dry, they stop.
// - Attitude HOLD (the default): the mouse moves an aim; per axis the hold fires one pop to start the turn, coasts,
//   and one pop sized to stop on the aim. Silent reaction wheels trim the last bit. OFF: the jets fire only while you
//   push, and nothing stops a spin but you. Space toggles them.
// - Propellant is finite, burned through an exhaust velocity (Isp): the gauges are honest.
//
// A `Flight` knows nothing about keys. It flies from a control frame (`ctl`, below), so the player (fighter.mjs) and
// any AI pilot fly exactly the same ship: same thrust, same tanks, same pops. An AI sets `ctl.aim` (a quaternion) and
// `ctl.burn` instead of moving a mouse.
//
// Every number is the layout's `fighter.flight` (ships/carrier/).

import * as THREE from 'three';
import { clamp } from '../util.mjs';

export const ASSIST = ['HOLD', 'OFF'];
const G0 = 9.81;
const lerp = (a, b, t) => a + (b - a) * t;
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _eu = new THREE.Euler();
const _w = new THREE.Vector3();
const _a = new THREE.Vector3();
const _t = new THREE.Vector3();


/** A control frame: what the pilot (or an AI) asks for this instant. */
export function controls() {
  return {
    burn: false, // the main drive (held)
    boost: false, // hard burn: the drive past its rating (held with burn; gload.mjs)
    retro: false, // the retro jet, at the bow (held)
    slide: [0, 0], // x right, y up: -1, 0 or 1 (held)
    turn: [0, 0, 0], // keys: pitch up, yaw left, roll left, -1..1 (rad/s asks, scaled by `keyRate` / `rollRate`)
    mouse: { dx: 0, dy: 0 }, // pixels this frame (Direct mouse moves the aim itself)
    stick: null, // { x, y } -1..1 when the mouse is a virtual stick
    aim: null // a Quaternion: put the nose here (an AI's way of steering)
  };
}

export class Flight {
  /** `spec` the layout's `fighter.flight`, `body` a Rigid ({ mass, vel (world), ang (own frame) }), `mainForce` in N. */
  constructor(spec, body, mainForce) {
    this.S = spec;
    this.P = spec.hold;
    this.body = body;
    this.obj = null;
    this.mainAcc = mainForce / body.mass;
    this.I = new THREE.Vector3(...spec.inertia);
    const com = new THREE.Vector3(...spec.com);
    this.blocks = spec.blocks;
    this.noz = [];
    this.nz = {};
    for (const [id, b, dir, kind, off] of spec.nozzles) {
      const F = spec.force[kind];
      const d = new THREE.Vector3(...dir), at = new THREE.Vector3(...spec.blocks[b].at).addScaledVector(d, off);
      const push = d.clone().negate(), r = at.clone().sub(com);
      const tq = new THREE.Vector3().crossVectors(r, push.clone().multiplyScalar(F));
      const n = {
        id, block: b, at, dir: d, F, kind: 'rcs', lin: push.multiplyScalar(F / body.mass),
        ang: new THREE.Vector3(tq.x / this.I.x, tq.y / this.I.y, tq.z / this.I.z),
        throttle: 0, open: false, was: false, until: 0, flash: 0, puffT: 0
      };
      this.noz.push(n);
      this.nz[id] = n;
    }
    // The drive, as one more entry for the screens (cockpit.mjs draws `list`).
    this.main = { kind: 'main', at: new THREE.Vector3(...spec.nozzle), dir: new THREE.Vector3(0, 0, 1), throttle: 0 };
    this.list = [...this.noz, this.main];
    this.alloc = spec.alloc;
    // What each command can do flat out: the accelerations its nozzles make together (m/s², rad/s²).
    this.cap = this.alloc.map((pair, k) => pair.map((ids) => {
      let s = 0;
      for (const id of ids) s += Math.abs(k < 3 ? this.nz[id].lin.getComponent(k) : this.nz[id].ang.getComponent(k - 3));
      return s || 1e-6;
    }));
    this.T = 0;
    this.assist = 0;
    this.aim = new THREE.Quaternion();
    this.popLock = [0, 0, 0];
    this.prop = { ...spec.tank };
    this.online = false; // the drive is spun up and ready to light (the power-up, fighter.mjs)
    this.set = 0; // the drive's setting while it burns
    this.power = 0; // what it gives, lagging the setting
    this.spool = 0; // the turbopump: up in a quarter second, a couple of seconds to wind down
    this.strain = 0; // how fast the power is changing
    this.burning = false;
    this.burnT = 0;
    this.acc = new THREE.Vector3(); // own frame, m/s²
    this.angAcc = new THREE.Vector3();
    this.g = 0;
    this.load = 0;
    this.vib = 0;
    this.servo = 0;
    this.blockState = this.blocks.map((b) => ({ open: 0, p: 0, pan: b.pan }));
    this.on = { ignite: null, cutoff: null }; // sound hooks
  }

  get assistName() {
    return ASSIST[this.assist];
  }
  get assistOn() {
    return this.assist === 0;
  }
  get dryRcs() {
    return this.prop.rcs <= 0;
  }
  get dryMain() {
    return this.prop.main <= 0;
  }

  /** Climbing into `obj`: the aim on her nose, every valve shut, the drive cold. */
  reset(obj, prop = null) {
    this.obj = obj;
    this.aim.copy(obj.quaternion);
    this.popLock.fill(0);
    for (const n of this.noz) (n.until = 0), (n.open = n.was = false), (n.throttle = n.flash = 0);
    this.set = this.power = this.spool = this.strain = 0;
    this.burning = false;
    this.online = false;
    if (prop) this.prop = prop;
  }

  /** The tanks topped up (on the pad). */
  refill() {
    this.prop.main = this.S.tank.main;
    this.prop.rcs = this.S.tank.rcs;
  }

  toggleAssist() {
    this.assist = (this.assist + 1) % ASSIST.length;
    if (this.obj) this.aim.copy(this.obj.quaternion);
  }

  capOf(k, sign) {
    return this.cap[k][sign >= 0 ? 0 : 1];
  }

  /** Opens these nozzles for `secs` from now (a pop), or for this frame only when secs is tiny (a held key). */
  openFor(ids, secs) {
    for (const id of ids) this.nz[id].until = Math.max(this.nz[id].until, this.T + secs);
  }

  /** Valves follow their timers. Two opposed nozzles on one block would cancel exactly, so neither opens. Dry, no jets. */
  valves() {
    for (const n of this.noz) (n.was = n.open), (n.open = this.T < n.until && this.prop.rcs > 0);
    for (const [a, b] of this.S.opposed) if (this.nz[a].open && this.nz[b].open) this.nz[a].open = this.nz[b].open = false;
    for (const n of this.noz) n.throttle = n.open ? 1 : 0;
    this.blocks.forEach((b, i) => {
      let open = 0;
      for (const n of this.noz) if (n.block === i && n.open) open = 1;
      const s = this.blockState[i];
      s.open = open;
      s.p = open ? 0.8 : 0;
    });
  }

  /** The drive's setting, power, spool and strain, toward `want` (lit or not) this frame. */
  drive(want, dt, setTo = null) {
    if (want && !this.burning) {
      this.burning = true;
      this.burnT = 0;
      this.set = setTo ?? this.P.rampFrom;
      this.on.ignite?.();
    }
    if (!want && this.burning) {
      this.burning = false;
      this.on.cutoff?.(this.burnT);
      this.set = 0;
    }
    if (this.burning) {
      this.burnT += dt;
      this.set = setTo ?? Math.min(1, this.set + this.P.rampRate * dt);
    }
    const prev = this.power;
    this.power += (this.set - this.power) * (1 - Math.exp(-dt / (this.set > this.power ? 0.16 : 0.05)));
    if (this.power < 0.003) this.power = 0;
    this.strain = lerp(this.strain, clamp(Math.abs(this.power - prev) / (Math.max(dt, 1e-4) * 1.2), 0, 1), 1 - Math.exp(-dt * 5));
    const spoolTarget = this.burning ? Math.max(0.4, this.power) : 0;
    this.spool += (spoolTarget - this.spool) * (1 - Math.exp(-dt / (spoolTarget > this.spool ? 0.25 : 2.2)));
    this.main.throttle = this.power;
  }

  /**
   * One axis of the attitude hold, the way a real one flies: a pop to start the turn, a coast, one pop sized to stop
   * on the mark. Spin only changes while a valve is open; between pops the ship turns at whatever rate it has.
   * `e`: how far the aim is from the nose about this axis (rad, ship's frame).
   */
  hold(i, e, dt) {
    const P = this.P, ang = this.body.ang;
    const w = ang.getComponent(i);
    const aMin = Math.min(this.cap[3 + i][0], this.cap[3 + i][1]);
    const fine = aMin * P.minPop; // the smallest change in spin one pop can make
    if (Math.abs(e) < 0.035 && Math.abs(w) < fine * 1.5) {
      // On the mark: the reaction wheels hold it, silently. Far too weak to turn the ship, enough to trim the last bit.
      const wt = clamp(e * 3, -fine, fine);
      ang.setComponent(i, w + (wt - w) * (1 - Math.exp(-dt / 0.2)));
      return;
    }
    if (this.T < this.popLock[i]) return; // a pop is still firing
    const toward = w * e > 0, aBrake = this.capOf(3 + i, -w), stopAt = (w * w) / (2 * aBrake);
    let want;
    if (toward && Math.abs(e) <= stopAt + Math.abs(w) * dt * 2) want = 0; // time to brake: one pop, sized to stop on the aim
    else {
      const cruise = Math.sign(e) * Math.min(P.wmax[i], Math.sqrt(0.8 * aMin * Math.abs(e)));
      want = toward && Math.abs(w) >= Math.abs(cruise) * 0.6 ? w : cruise; // turning fast enough already: coast
    }
    if (want !== 0 && this.T < this.popLock[i] + P.gap) return; // a beat between pops, except to brake
    const dw = want - w;
    if (Math.abs(dw) < fine) return;
    const secs = Math.min(Math.abs(dw) / this.capOf(3 + i, dw), 0.45);
    this.openFor(this.alloc[3 + i][dw > 0 ? 0 : 1], secs);
    this.popLock[i] = this.T + secs;
  }

  /** One step of free flight from control frame `ctl` (see `controls()`). Moves `obj` and the body. */
  frame(ctl, dt) {
    this.T += dt;
    const P = this.P, obj = this.obj, b = this.body;
    // The main drive. Held: it lights, and the longer it is held the harder it pushes. Let go: it cuts.
    this.drive(!!ctl.burn && this.online && this.prop.main > 0, dt);

    // The hand. Direct mouse moves the aim; a virtual stick (or the keys) asks for a turn rate.
    const mx = ctl.mouse?.dx ?? 0, my = ctl.mouse?.dy ?? 0;
    const st = ctl.stick;
    const direct = !st && !ctl.aim;
    const move = st ? Math.hypot(mx, my) / Math.max(dt, 1e-4) / 900 : Math.hypot(mx, my) / Math.max(dt, 1e-4) / 650;
    this.servo = lerp(this.servo, clamp(move, 0, 1), 1 - Math.exp(-dt / 0.08));
    const ask = [
      (st ? st.y * P.wmax[0] * 0.8 : 0) + ctl.turn[0] * P.keyRate,
      (st ? -st.x * P.wmax[1] * 0.8 : 0) + ctl.turn[1] * P.keyRate,
      ctl.turn[2] * P.rollRate
    ];

    if (this.assist === 0) {
      // HOLD: the aim moves; the ship pops to start turning towards it, coasts, and pops once to stop on it.
      if (ctl.aim) this.aim.copy(ctl.aim);
      else {
        _q.setFromEuler(_eu.set((direct ? -my * P.sens : 0) + ask[0] * dt, (direct ? -mx * P.sens : 0) + ask[1] * dt, ask[2] * dt, 'YXZ'));
        this.aim.multiply(_q).normalize();
      }
      const off = obj.quaternion.angleTo(this.aim);
      if (off > P.lead) {
        // The aim stays within reach.
        _q2.copy(this.aim);
        this.aim.copy(obj.quaternion).slerp(_q2, P.lead / off);
      }
      _q2.copy(obj.quaternion).invert().multiply(this.aim);
      let s = _q2.w < 0 ? -2 : 2;
      if (!ask[2]) {
        // The aim is where you point, not how you are rolled: unless you roll, spin it to match the ship.
        this.aim.multiply(_q.setFromAxisAngle(_w.set(0, 0, 1), -_q2.z * s));
        _q2.copy(obj.quaternion).invert().multiply(this.aim);
        s = _q2.w < 0 ? -2 : 2;
      }
      this.hold(0, _q2.x * s, dt);
      this.hold(1, _q2.y * s, dt);
      this.hold(2, _q2.z * s, dt);
    } else {
      // OFF: the pilot's hand on the valves. A turn fires for as long as you push; nothing stops the spin but you.
      this.aim.copy(obj.quaternion);
      const raw = [
        ask[0] / P.keyRate - (direct ? my / Math.max(dt, 1e-4) / 650 : 0),
        ask[1] / P.keyRate - (direct ? mx / Math.max(dt, 1e-4) / 650 : 0),
        ask[2]
      ];
      for (let i = 0; i < 3; i++) if (Math.abs(raw[i]) > 0.15) this.openFor(this.alloc[3 + i][raw[i] > 0 ? 0 : 1], 1e-4);
    }
    // Slides and the retro jet fire while held. They are small: they nudge, they do not stop you.
    const [sx, sy] = ctl.slide;
    if (sx) this.openFor(this.alloc[0][sx > 0 ? 0 : 1], 1e-4);
    if (sy) this.openFor(this.alloc[1][sy > 0 ? 0 : 1], 1e-4);
    if (ctl.retro) this.openFor(this.alloc[2][0], 1e-4);
    this.valves();

    // Hard burn: the drive's push rises past its rating while boost is held with it (`boost` times, over `spool` s).
    const B = this.boostSpec;
    const hard = !!ctl.boost && this.burning;
    this.boostK = B ? clamp((this.boostK ?? 0) + (hard ? dt / B.spool : -dt * 3), 0, 1) : 0;
    const push = this.power * this.mainAcc * (1 + (B ? (B.boost - 1) * this.boostK : 0));
    // The pushes: the open nozzles, and the main drive along the axis. Each costs propellant.
    const la = _a.set(0, 0, -push), aa = _t.set(0, 0, 0);
    let flow = 0;
    for (const n of this.noz) if (n.open) (la.add(n.lin), aa.add(n.ang), (flow += n.F / (this.S.isp.rcs * G0)));
    this.prop.rcs = Math.max(0, this.prop.rcs - flow * dt);
    this.prop.main = Math.max(0, this.prop.main - ((push * b.mass) / (this.S.isp.main * G0)) * dt);
    this.acc.copy(la);
    this.angAcc.copy(aa);
    b.ang.addScaledVector(aa, dt);
    const turn = b.ang.length() * dt;
    if (turn > 1e-9) obj.quaternion.multiply(_q.setFromAxisAngle(_w.copy(b.ang).normalize(), turn)).normalize();
    b.vel.addScaledVector(_w.copy(la).applyQuaternion(obj.quaternion), dt);
    obj.position.addScaledVector(b.vel, dt);
    this.feel(dt);
  }

  /** A step with someone else flying her (the launch run, flight control's path, the pad): the drive at `power`, and
   *  short lift pops from the belly jets every `hover` seconds (0: none). No physics: the caller moves her. */
  carried(dt, { power = 0, hover = 0 } = {}) {
    this.T += dt;
    this.drive(power > 0.01, dt, power > 0.01 ? power : null);
    if (hover > 0 && this.T % hover < dt) this.openFor(this.alloc[1][0], 0.08);
    this.valves();
    this.acc.set(0, 0, -this.power * this.mainAcc);
    this.angAcc.set(0, 0, 0);
    this.feel(dt);
  }

  /** The load on the frame and the vibration, for the airframe's sound and the g meter. */
  feel(dt) {
    const g = this.acc.length() / G0;
    this.g = lerp(this.g, g, 1 - Math.exp(-dt / 1.1));
    this.load = clamp((g / 3.2) * 0.75 + (this.angAcc.length() / 2.5) * 0.35 + this.strain * 0.3, 0, 1);
    this.vib = clamp(this.power * 0.85 + this.strain * 0.3, 0, 1);
  }

  /** Her velocity relative to `ref`, in her own frame (x starboard, y up, -z ahead). */
  localVel(t = new THREE.Vector3(), ref = null) {
    t.copy(this.body.vel);
    if (ref) t.sub(ref);
    return this.obj ? t.applyQuaternion(_q.copy(this.obj.quaternion).invert()) : t;
  }

  /** The aim's nose direction in the world. */
  aimDir(t = new THREE.Vector3()) {
    return t.set(0, 0, -1).applyQuaternion(this.aim);
  }
}


