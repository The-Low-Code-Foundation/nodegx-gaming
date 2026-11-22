// The recovery lane: how you fly a carried ship (the cutter) home to her berth yourself (design/ROADMAP.md, phase 12).
// The fighter's lane (approach.mjs) is flown nose first; a ship in a berth lies parallel to her mothership's axis and
// goes in and out sideways, so this lane is flown sideways: stop at the holding point abeam the berth, parallel to
// the host, bow the berth's way; then slide in on the side jets down a line of gates, slowing as she closes; through
// the last gate, where the cradle's arms reach, slowly, on the line and square, and the arms take her (`Berth.capture`).
// Too fast, off the line or askew there, and flight control waves her off: back out and come again.
//
// Everything is in the host's frame, so it moves and turns with her. The lane runs straight out from the berth along
// the host's beam (x), through the berthed ship's centre of mass (`berth.home`):
//
//   along    metres out from the last gate, which stands where the cradle hands her over at a launch (her centre
//            `spec.clear` from the host's centreline, clear of the hull). `LANE.len` out is the holding point.
//   fore, up metres off the line: along the host's axis (+ is toward the host's stern) and up.
//   closing  m/s toward the host along the lane. `wantAt(along)` is what the lane asks for there.
//   yaw, pitch, roll   degrees her attitude is off the berth's (`spec.yaw`: 0 bow forward, π bow aft); `align` is the
//            whole angle.
//
// The gates are frames the shape of her side (her envelope's length by its height, a little clear all round, wider
// further out), each with a chevron at the end her bow goes, and a centre line. From her flight deck you look along
// her own axis, across the lane, so beside the gates there is a fence of posts ahead of her bow, one per gate, on a
// line at the helm's eye height: on the line and level, the fence lies across the middle of the view, and the posts
// pass as she slides. A gate and its post share a light, coloured as the fighter's rings are (approach.mjs `lightLane`).
//
// Flight control (`request()`, L at the helm, through berth.mjs `key()`): in the lane's catchment the first L is
// "request recovery": the door goes up and the lane is lit. L again hands her to flight control (the automatic
// recovery, `Berth.takeIn`), as L anywhere outside the catchment does. `state.call` and `state.text` are what flight
// control wants next; helmsight.mjs draws `draw()`, the docking display.
//
// Looks only, and unseeded: its own scratch vectors, no random numbers.

import * as THREE from 'three';
import { clamp } from '../util.mjs';
import { COLOR, laneMat, lightLane } from './approach.mjs';

export const LANE = {
  len: 260, // metres from the last gate out to the holding point (about 300 m off the host's centreline)
  gates: [0, 20, 40, 70, 100, 140, 180, 220, 260],
  margin: [3, 1.6], // the frame's clearance round her side profile at the last gate: along her, and above and below
  flare: 0.5, // a gate is this much bigger at the holding point
  fence: 60, // metres ahead of her bow where the fence of posts stands
  want: { door: 0.5, per: 0.022, max: 6 }, // the closing speed asked for: 0.5 m/s at the last gate, rising 0.022 m/s a metre out
  tol: { off: [1.5, 0.03], align: [3, 0.04], drift: [0.3, 0.01] }, // on the line: [at the last gate, more per metre out]
  catch: { along: 1.5, speed: 1, off: [1.5, 1.2], align: 3, drift: 0.4 }, // what the cradle's arms will take
  arm: 30, // she must have been this far out since the approval (or a wave-off) before the arms will try
  hold: 25, // inside this with the door not yet up: hold there
  catchment: { beyond: 100, off: 100, speed: 10 }, // where L means "request recovery"
  show: 1500, // the lane and the display are up inside this range of the holding point
  lapse: 700 // an approval lapses (the door shuts) when she goes this far from the holding point
};

/** The closing speed the lane asks for `along` metres out. */
export const wantAt = (along) => clamp(LANE.want.door + along * LANE.want.per, LANE.want.door, LANE.want.max);
const tolAt = (t, along) => t[0] + Math.max(0, along) * t[1];

const RED = '#ff4030', AMBER = '#ffb030', GREEN = '#40ff80', CYAN = '#4fd0e0', TEXT = '#cfe8ff';
const DEG = 180 / Math.PI;
const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _hq = new THREE.Quaternion(), _hi = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _qe = new THREE.Quaternion(), _aim = new THREE.Quaternion();
const _e = new THREE.Euler();
const m1 = (x) => (Math.abs(x) < 0.05 ? 0 : x).toFixed(1);

export class Recovery {
  /** `C`, `body`, `helm`: the ship you fly, her Rigid and her Helm. `berth`: her Berth (its host, spec and doors). */
  constructor({ C, body, helm, berth }) {
    Object.assign(this, { C, body, helm, berth });
    const { spec, H } = berth;
    this.out = spec.out;
    this.clear = Math.abs(spec.clear);
    this.time = 0;
    this.approved = false; // flight control has the door up for you
    this.armed = false; // far enough out since then for the arms to try
    this.waved = null; // a wave-off: why
    this.waveoffs = 0;
    this.t0 = 0; // when she last left the holding point (the grade's clock)
    this.said = {};
    this.state = { active: false, along: Infinity, fore: 0, up: 0, off: 0, closing: 0, vFore: 0, vUp: 0, drift: 0, speed: 0, want: 0, yaw: 0, pitch: 0, roll: 0, align: 0, gate: 0, cradle: 0, dist: Infinity, inLane: false, catchment: false, door: 0, doorOpen: false, call: 'far', text: '', tone: CYAN };
    // Her side profile, from her envelope, as she lies in the berth: its middle off her centre of mass, its size.
    const E = C.L.envelope, com = C.L.com;
    const mid = E ? new THREE.Vector3((E.min[0] + E.max[0]) / 2 - com[0], (E.min[1] + E.max[1]) / 2 - com[1], (E.min[2] + E.max[2]) / 2 - com[2]).applyQuaternion(berth.qBerth) : new THREE.Vector3();
    const size = E?.size ?? [C.L.length / 3, C.L.length / 4, C.L.length];
    const bow = new THREE.Vector3(0, 0, -1).applyQuaternion(berth.qBerth).z < 0 ? -1 : 1; // which way along the host her bow lies
    this.bow = bow;
    this.profile = { mid, len: size[2], h: size[1] };
    const eye = (C.L.helm?.eye?.[1] ?? 0) - com[1];
    const fenceZ = mid.z + bow * (size[2] / 2 + LANE.fence);

    const g = (this.group = new THREE.Group());
    g.name = 'approach-lane'; // collide.mjs leaves anything under this name out of the solids
    g.visible = false;
    g.position.copy(berth.home);
    this.gates = [];
    const box = (m, w, h, l, x, y, z, parent, rx = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);
      o.position.set(x, y, z);
      o.rotation.x = rx;
      parent.add(o);
      return o;
    };
    for (const a of LANE.gates) {
      const m = laneMat(), gate = new THREE.Group();
      const k = 1 + (a / LANE.len) * LANE.flare, t = 0.28 + a * 0.0025; // further out: a bigger frame, drawn thicker
      const hl = (size[2] / 2 + LANE.margin[0]) * k, hh = (size[1] / 2 + LANE.margin[1]) * k;
      // The frame, her side profile: top and bottom broken at their middles, a square stern, and a bow that comes to
      // a point (open at the tip, so the view ahead from her flight deck stays clear).
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) box(m, t, t, hl * 0.8, 0, mid.y + sy * hh, mid.z + sz * hl * 0.6, gate);
      for (const sy of [-1, 1]) box(m, t, hh * 0.7, t, 0, mid.y + sy * hh * 0.65, mid.z - bow * hl, gate);
      const run = hh * 0.9, rise = hh * 0.7, slant = Math.hypot(run, rise);
      for (const sy of [-1, 1]) box(m, t, t, slant, 0, mid.y + sy * (hh - rise / 2), mid.z + bow * (hl + run / 2), gate, sy * bow * Math.atan2(rise, run));
      // Her post on the fence ahead of the bow, at the helm's eye height (thin: it is always seen from near): the last
      // gate's is a pair.
      box(m, 0.3, 5 * k, 0.3, 0, eye, fenceZ, gate);
      if (a === 0) for (const sx of [-1, 1]) box(m, 0.3, 2.4, 0.3, sx * 1.4, eye, fenceZ, gate);
      gate.position.x = this.out * (this.clear + a) - berth.home.x;
      gate.userData = { along: a, mat: m };
      g.add(gate);
      this.gates.push(gate);
    }
    // The centre line, from the cradle out to the holding point, and the fence's rail.
    this.lineMat = laneMat();
    this.lineMat.opacity = 0.3;
    for (let a = -berth.run + 4; a < LANE.len; a += 12) box(this.lineMat, 5, 0.22, 0.22, this.out * (this.clear + a + 2.5) - berth.home.x, 0, 0, g);
    for (let a = 0; a < LANE.len; a += 8) box(this.lineMat, 3, 0.18, 0.18, this.out * (this.clear + a + 1.5) - berth.home.x, eye, fenceZ, g);
    H.frame.add(g);
  }

  /** The attitude the berth wants, in the world (the helm's heading hold aims at it). */
  aim() {
    return _aim.copy(this.berth.H.obj.getWorldQuaternion(_hq)).multiply(this.berth.qBerth);
  }

  /** K at the helm: docking mode on or off (newton.mjs `Helm.dockMode`). Out only. Returns what was said. */
  toggleDock() {
    const { helm, berth } = this;
    if (berth.phase !== 'out') return berth.tell('Docking mode is for when she is out.', 2);
    if (helm.dock?.on) {
      helm.dockMode(false);
      return berth.tell('Docking mode off.', 2);
    }
    helm.dockMode(true, { aim: () => this.aim() });
    return berth.tell('Docking mode: the slide keys set a speed against her (0.1 m/s a tap), X zero. H holds the berth’s heading.', 5);
  }

  /** H at the helm: hold the berth's heading (docking mode comes on with it), or let it go. */
  toggleHold() {
    const { helm, berth } = this;
    if (berth.phase !== 'out') return berth.tell('Heading hold is for when she is out.', 2);
    if (!helm.dock?.on) helm.dockMode(true, { aim: () => this.aim() });
    helm.dock.hold = !helm.dock.hold;
    return berth.tell(helm.dock.hold ? `Docking mode: holding the berth’s heading, bow ${this.bow < 0 ? 'forward' : 'aft'} along her.` : 'Heading hold off.', 3);
  }

  /** L at the helm, out (berth.mjs `key`). In the catchment and not yet approved: recovery approved, door up, the
   *  lane lit; returns what flight control says. Otherwise null: the berth hands her to flight control (`takeIn`). */
  request() {
    if (this.berth.phase !== 'out' || this.approved) return null;
    const s = this.measure();
    if (!s.catchment) return null;
    this.approved = true;
    this.waved = null;
    this.waveoffs = 0;
    this.armed = s.along >= LANE.arm;
    this.t0 = this.time;
    this.said = {};
    this.berth.hostDoors.setBay(1);
    this.C.bus?.emit('call', { id: 'recover-approved' });
    return 'Flight control: recovery approved, door opening. Fly her down the lane (L again: we take her in).';
  }

  /** Where she is on the lane, into `state`. */
  measure() {
    const { berth: b, C } = this, s = this.state, o = this.out, H = b.H;
    H.obj.updateMatrixWorld(true);
    const p = H.frame.worldToLocal(_p.copy(C.obj.position));
    s.along = o * p.x - this.clear;
    s.fore = p.z - b.home.z;
    s.up = p.y - b.home.y;
    s.off = Math.hypot(s.fore, s.up);
    s.dist = Math.hypot(s.along - LANE.len, s.fore, s.up);
    const hi = _hi.copy(H.obj.getWorldQuaternion(_hq)).invert();
    const v = _v.copy(this.body.vel).sub(b.hostVel).applyQuaternion(hi);
    s.closing = -o * v.x;
    s.vFore = v.z;
    s.vUp = v.y;
    s.drift = Math.hypot(v.z, v.y);
    s.speed = v.length();
    const qr = _qr.copy(hi).multiply(C.obj.quaternion); // her attitude in the host's frame
    const e = _qe.copy(b.qBerth).invert().multiply(qr); // and off the berth's
    _e.setFromQuaternion(e, 'YXZ');
    s.yaw = _e.y * DEG;
    s.pitch = _e.x * DEG;
    s.roll = _e.z * DEG;
    s.align = 2 * Math.acos(Math.min(1, Math.abs(e.w))) * DEG;
    s.gate = s.along;
    s.cradle = s.along + b.run;
    s.want = wantAt(Math.max(0, s.along));
    s.inLane = s.along > -5 && s.along < LANE.len + 40 && s.off < 12 + Math.max(0, s.along) * 0.12;
    const K = LANE.catchment;
    s.catchment = s.along > -5 && s.along < LANE.len + K.beyond && s.off < K.off && s.speed < K.speed;
    s.door = b.hostDoors.kOf(b.spec.door);
    s.doorOpen = !!b.hostDoors.openOn(b.spec.door);
    return s;
  }

  /** Which of her own controls moves her along `d` (a direction in the host's frame): the word and the key. */
  way(x, y, z) {
    const d = _d.set(x, y, z).applyQuaternion(_qe.copy(_qr).invert());
    const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
    if (ax >= ay && ax >= az) return d.x > 0 ? 'to starboard (D)' : 'to port (A)';
    if (ay >= az) return d.y > 0 ? 'up (R)' : 'down (F)';
    return d.z < 0 ? 'ahead (W)' : 'astern (S)';
  }

  /** What the arms would refuse her for at the last gate, or null. */
  refusal(s) {
    const K = LANE.catch;
    if (!s.doorOpen) return 'the door is not up';
    if (s.closing > K.speed) return `too fast: ${s.closing.toFixed(1)} m/s, ${K.speed} at most`;
    if (s.closing < -0.05) return 'going the wrong way';
    if (Math.abs(s.fore) > K.off[0] || Math.abs(s.up) > K.off[1]) return `off the line: ${s.off.toFixed(1)} m`;
    if (s.align > K.align) return `not square: ${s.align.toFixed(1)}° off`;
    if (s.drift > K.drift) return `drifting across: ${s.drift.toFixed(1)} m/s`;
    return null;
  }

  /** The approach as it stood at the last gate: what `berth.lastRecovery` keeps. */
  grade(s) {
    const K = LANE.catch, W = LANE.want.door;
    const k = Math.max(Math.max(0, s.closing - W) / (K.speed - W), Math.abs(s.fore) / K.off[0], Math.abs(s.up) / K.off[1], s.align / K.align, s.drift / K.drift);
    const r = (x, n = 100) => Math.round(x * n) / n;
    return { grade: k < 0.4 ? 'clean' : k < 0.75 ? 'fair' : 'rough', closing: r(s.closing), off: r(s.off), fore: r(s.fore), up: r(s.up), align: r(s.align), yaw: r(s.yaw), pitch: r(s.pitch), roll: r(s.roll), drift: r(s.drift), secs: r(this.time - this.t0, 10), waveoffs: this.waveoffs };
  }

  /** What flight control wants next: `call`, `text` and `tone` into `s`. */
  talk(s) {
    const T = LANE.tol;
    const say = (call, text, tone) => ((s.call = call), (s.text = text), (s.tone = tone), s);
    if (!this.approved) {
      if (s.catchment) return say('ask', 'L: request recovery', CYAN);
      return say('far', s.speed >= LANE.catchment.speed && s.dist < 400 ? `slow to under ${LANE.catchment.speed} m/s against her` : `fly to the holding point: ${Math.round(s.dist)} m (L here: flight control takes her in)`, CYAN);
    }
    if (this.waved) return say('wave', `WAVE OFF: back out ${this.way(this.out, 0, 0)} past ${LANE.arm} m (${Math.max(0, Math.round(LANE.arm - s.along))} to go)`, RED);
    if (!this.armed) return say('back', `back out ${this.way(this.out, 0, 0)} to ${LANE.arm} m, then come in: ${Math.max(0, Math.round(LANE.arm - s.along))} m to go`, AMBER);
    if (!s.inLane) return say('lane', `fly to the lane: ${s.off > 12 ? `${Math.round(s.off)} m off the line` : `${Math.round(s.dist)} m to the holding point`}`, CYAN);
    const tolA = tolAt(T.align, s.along), tolO = tolAt(T.off, s.along), tolD = tolAt(T.drift, s.along);
    if (s.align > tolA) {
      const worst = Math.abs(s.yaw) >= Math.abs(s.pitch) && Math.abs(s.yaw) >= Math.abs(s.roll) ? `turn ${s.yaw > 0 ? 'right' : 'left'} ${Math.abs(s.yaw).toFixed(0)}°` : Math.abs(s.pitch) >= Math.abs(s.roll) ? `nose ${s.pitch > 0 ? 'down' : 'up'} ${Math.abs(s.pitch).toFixed(0)}°` : `roll ${s.roll > 0 ? 'right' : 'left'} ${Math.abs(s.roll).toFixed(0)}°`;
      return say('turn', `turn to parallel, bow ${this.bow < 0 ? 'forward' : 'aft'} along her: ${worst} (H holds it)`, s.align > tolA * 3 ? RED : AMBER);
    }
    if (s.along < LANE.hold && !s.doorOpen) return say('hold', s.closing > 0.15 ? `hold there (X): door opening ${Math.round(s.door * 100)}%` : `hold there: door opening ${Math.round(s.door * 100)}%`, s.closing > 0.15 ? RED : AMBER);
    if (s.off > tolO) {
      const text = Math.abs(s.fore) / T.off[0] >= Math.abs(s.up) / T.off[0] ? `ease ${this.way(0, 0, -Math.sign(s.fore))} ${Math.abs(s.fore).toFixed(1)} m` : `ease ${this.way(0, -Math.sign(s.up), 0)} ${Math.abs(s.up).toFixed(1)} m`;
      return say('line', `off the line: ${text}`, s.off > tolO * 3 ? RED : AMBER);
    }
    if (s.closing > s.want * 1.8 + 0.5) return say('fast', `slow: ${s.closing.toFixed(1)}, want ${s.want.toFixed(1)}`, RED);
    if (s.closing > s.want * 1.25 + 0.15) return say('slow', `slow: ${s.closing.toFixed(1)}, want ${s.want.toFixed(1)}`, AMBER);
    if (s.drift > tolD) return say('drift', `stop your drift: ${s.drift.toFixed(1)} m/s ${Math.abs(s.vFore) >= Math.abs(s.vUp) ? this.way(0, 0, Math.sign(s.vFore)) : this.way(0, Math.sign(s.vUp), 0)}`.replace(/ \(\w\)$/, ''), AMBER);
    if (s.closing < Math.min(0.2, s.want * 0.4)) return say('good', `on the line: slide ${this.way(-this.out, 0, 0)}, want ${s.want.toFixed(1)} m/s`, GREEN);
    return say('good', `on the line: ${s.closing.toFixed(1)}, want ${s.want.toFixed(1)}`, GREEN);
  }

  /** Every frame, after the helm has moved her. `show`: at the helm, so the lane is lit. */
  frame(dt, show) {
    const { berth: b, helm } = this, s = this.state;
    this.time += dt;
    if (b.phase !== 'out') {
      if (helm.dock) helm.dockMode(false); // carried: the jets are shut
      this.approved = this.armed = false;
      this.waved = null;
      s.active = false;
      // The arms have her: the lane stays lit green until she is on the cradle.
      this.group.visible = show && b.phase === 'capture';
      if (this.group.visible) for (const g of this.gates) g.userData.mat.color.set(GREEN), (g.userData.mat.opacity = 0.5);
      return s;
    }
    this.measure();
    s.active = s.dist < LANE.show;
    if (this.approved) {
      // The grade's clock runs from when she last left the holding point.
      if (s.along >= LANE.len - 20) this.t0 = this.time;
      if (s.along >= LANE.arm) {
        if (this.waved && this.said.wave) this.said = {};
        this.armed = true;
        this.waved = null;
      }
      if (s.dist > LANE.lapse) {
        this.approved = false;
        b.hostDoors.setBay(0);
        b.say('Flight control: recovery cancelled, door closing. Call again from the lane.', 4);
      } else if (this.armed && !this.waved && s.along < LANE.catch.along) {
        // Through the last gate: the arms take her, or flight control waves her off.
        const why = this.refusal(s);
        if (!why) {
          const G = this.grade(s);
          b.capture(G);
          b.say(`The cradle has her. ${G.grade[0].toUpperCase()}${G.grade.slice(1)} approach: ${G.closing.toFixed(1)} m/s, ${G.off.toFixed(1)} m off, ${G.align.toFixed(1)}°, ${Math.round(G.secs)} s from the holding point.`, 8);
          this.C.bus?.emit('call', { id: 'recover-captured', grade: G.grade[0].toUpperCase() + G.grade.slice(1) });
          this.group.visible = show;
          return s;
        }
        this.waved = why;
        this.armed = false;
        this.waveoffs++;
        this.said.wave = true;
        b.say(`Flight control: wave off, wave off. ${why[0].toUpperCase()}${why.slice(1)}. Back out and come again.`, 6);
        this.C.bus?.emit('call', { id: 'recover-waveoff' });
      }
    }
    this.talk(s);
    if (this.approved && s.call === 'good' && !this.said.line && s.along < LANE.len + 20) {
      this.said.line = true;
      this.C.bus?.emit('call', { id: 'recover-line' });
    }
    this.group.visible = show && s.active;
    if (!this.group.visible) return s;
    if (this.waved) for (const g of this.gates) g.userData.mat.color.set(RED), (g.userData.mat.opacity = 0.75);
    else lightLane(this.gates, s.along, this.approved && s.inLane, s.tone);
    // The gate she is in is all round her, edge on from her flight deck: nearly out, so it does not bar the view.
    for (const g of this.gates) g.userData.mat.opacity *= clamp(Math.abs(g.userData.along - s.along) / 14, 0.1, 1);
    this.lineMat.color.set(this.waved ? RED : this.approved ? (s.call === 'good' ? GREEN : COLOR.idle) : COLOR.idle);
    this.lineMat.opacity = this.approved ? 0.6 : 0.3;
    return s;
  }

  // --- the docking display (helmsight.mjs calls it over the helm's view) ----------------------------------------------

  /** `g`: the helm sight's 2D context, `w` × `h` its size; `project(worldPoint)` gives a screen point or null. */
  draw(g, w, h, project) {
    const s = this.state, b = this.berth, D = this.helm.dock;
    if (b.phase !== 'out' || !s.active) return;
    const K = LANE.catch;
    // The holding point in the view, until she is in the lane.
    if (!s.inLane) {
      const P = project(b.H.frame.localToWorld(_p.set(this.out * (this.clear + LANE.len), b.home.y, b.home.z)));
      if (P) {
        g.strokeStyle = g.fillStyle = CYAN;
        g.beginPath();
        g.moveTo(P.x, P.y - 10), g.lineTo(P.x + 10, P.y), g.lineTo(P.x, P.y + 10), g.lineTo(P.x - 10, P.y), g.closePath();
        g.stroke();
        g.fillText(`HOLD ${Math.round(s.dist)} m`, P.x + 14, P.y + 4);
      }
    }
    // What flight control wants, large, under the top of the view.
    g.font = '600 15px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    const tw = g.measureText(s.text).width;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(w / 2 - tw / 2 - 10, h * 0.16 - 17, tw + 20, 24);
    g.fillStyle = s.tone === CYAN ? TEXT : s.tone;
    g.fillText(s.text, w / 2, h * 0.16);
    // The panel, on the left: the cross-pointer, then the numbers.
    const x0 = 18, y0 = Math.max(96, h * 0.2), pw = 268, R = 62, cx = x0 + pw / 2, cy = y0 + 34 + R;
    g.font = '12px ui-monospace, Menlo, monospace';
    g.textAlign = 'left';
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(x0, y0, pw, 34 + R * 2 + 148);
    g.fillStyle = this.waved ? RED : this.approved ? GREEN : TEXT;
    g.fillText(`RECOVERY · ${b.spec.side ?? b.spec.id} berth · ${this.waved ? 'WAVE OFF' : this.approved ? 'APPROVED' : 'L requests'}`, x0 + 10, y0 + 18);
    // Looking down the lane at the host: across is along her (her own bow to the left or right as the berth has it),
    // up is up. The box is 5 m each way; the inner one is what the arms will take. The dot is her, the line her drift.
    const span = Math.max(5, Math.min(40, Math.ceil(s.off / 5) * 5)), px = R / span;
    g.strokeStyle = 'rgba(207,232,255,0.5)';
    g.lineWidth = 1;
    g.strokeRect(cx - R, cy - R, R * 2, R * 2);
    g.beginPath();
    g.moveTo(cx - R, cy), g.lineTo(cx + R, cy), g.moveTo(cx, cy - R), g.lineTo(cx, cy + R);
    g.stroke();
    const ok = Math.abs(s.fore) <= K.off[0] && Math.abs(s.up) <= K.off[1];
    g.strokeStyle = ok ? GREEN : AMBER;
    g.strokeRect(cx - K.off[0] * px, cy - K.off[1] * px, K.off[0] * 2 * px, K.off[1] * 2 * px);
    // Across the box, her bow's end is to the left: the offsets read as her own ahead and astern.
    const sx = -this.bow, dx = clamp(s.fore * sx * px, -R, R), dy = clamp(-s.up * px, -R, R);
    g.save();
    g.translate(cx + dx, cy + dy);
    g.strokeStyle = g.fillStyle = ok ? GREEN : AMBER;
    g.beginPath();
    g.moveTo(0, 0), g.lineTo(clamp(s.vFore * sx * 40, -R, R), clamp(-s.vUp * 40, -R, R)); // drift: 40 px a m/s
    g.stroke();
    g.rotate(clamp(s.pitch, -45, 45) / DEG); // her side profile, tipped by her pitch
    g.strokeRect(-13, -3, 26, 6);
    g.beginPath();
    g.moveTo(-13, -3), g.lineTo(-18, 0), g.lineTo(-13, 3); // her bow
    g.stroke();
    g.restore();
    g.fillStyle = 'rgba(207,232,255,0.6)';
    g.fillText(`±${span} m`, cx + R - 38, cy + R - 5);
    g.fillText('bow', cx - R + 4, cy - R + 13);
    const row = (i) => cy + R + 20 + i * 17;
    const line = (i, text, col = TEXT) => ((g.fillStyle = col), g.fillText(text, x0 + 10, row(i)));
    const tolA = Math.max(K.align, tolAt(LANE.tol.align, s.along));
    const col3 = (v, t) => (Math.abs(v) <= t ? GREEN : Math.abs(v) <= t * 3 ? AMBER : RED);
    line(0, `gate ${Math.round(s.gate)} m  ·  cradle ${Math.round(s.cradle)} m`);
    line(1, `closing ${s.closing >= 0 ? '+' : ''}${s.closing.toFixed(2)} m/s  ·  want ${s.want.toFixed(1)}`, s.along > 400 ? TEXT : s.closing > s.want * 1.8 + 0.5 ? RED : s.closing > s.want * 1.25 + 0.15 ? AMBER : GREEN);
    const fa = (v) => (v * this.bow > 0 ? 'ahead' : 'astern'); // her own word for an offset along the host
    line(2, `off line ${Math.abs(s.fore).toFixed(1)} m ${fa(s.fore)}  ·  ${Math.abs(s.up).toFixed(1)} m ${s.up >= 0 ? 'high' : 'low'}`, ok ? GREEN : col3(s.off, tolAt(LANE.tol.off, s.along)));
    line(3, `drift ${Math.abs(s.vFore).toFixed(2)} ${fa(s.vFore)}  ·  ${Math.abs(s.vUp).toFixed(2)} ${s.vUp >= 0 ? 'up' : 'down'} m/s`, col3(s.drift, Math.max(K.drift, tolAt(LANE.tol.drift, s.along))));
    line(4, `yaw ${m1(s.yaw)}°  pitch ${m1(s.pitch)}°  roll ${m1(s.roll)}°`, col3(s.align, tolA));
    line(5, `door ${s.doorOpen ? 'open' : s.door > 0.01 ? `${Math.round(s.door * 100)}%` : 'shut'}${this.approved && s.along >= LANE.arm ? `  ·  ${Math.round(this.time - this.t0)} s` : ''}`, s.doorOpen ? GREEN : TEXT);
    if (D?.on) line(6, `DOCKING  set ${m1(D.set.x)} stbd  ${m1(D.set.y)} up  ${m1(-D.set.z)} ahead${D.hold ? '  ·  HDG HOLD' : ''}`, GREEN);
    else line(6, 'docking mode off: K  ·  heading hold: H', AMBER);
  }
}
