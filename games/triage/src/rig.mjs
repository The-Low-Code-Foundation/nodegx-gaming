// The weapon rig. Round 3 (playtest: "the way the player aims and shoots isn't very satisfying, and the gun models are
// still weird and the player isn't holding them straight … I'd like it to feel like Gears of War: really punchy
// shooting … the reloading and aiming animations are really crisp and believable").
//
// Before: the gun was parented to her right hand and pointed wherever a pistol clip's hand pointed; a long gun's left
// hand was pulled to it afterwards. Now the GUN leads and the body follows: every frame the gun is placed in the world
// (pointing at what the crosshair is on, its stock in her shoulder), then the arms are solved onto it (two-bone IK to
// each wrist), each hand is turned to hold it (palm, fingers) and its fingers curled round the grip, the spine leans
// into the aim and the head looks down it. The clips underneath only move the legs, the hips and the breathing.
//
// On top of the pose: recoil (springs on the gun: kick back, muzzle climb, a random yaw and roll), the pistol's slide,
// the shotgun's pump, and the reloads (the magazine drops, the left hand fetches a new one from her belt, seats it, hits
// the slide release or the bolt; the shotgun loads shell by shell), each one a timeline of where the left hand is and
// what happens when (rig events: the player turns them into sounds, brass, a dropped magazine).
import * as THREE from 'three';
import { reach, aimBone } from './pose.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const ORIGIN = V(0, 0, 0);
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const damp = (cur, want, rate, dt) => cur + (want - cur) * (1 - Math.exp(-rate * dt));

// How each gun is held. Hand frames are in the gun's space (x = the gun's left, y = up, z = the muzzle's way; the
// origin is where the right hand grips): `wrist` is where the hand bone sits, `fingers` the way the knuckles point from
// it, `palm` the way the palm faces. Poses are in her body's frame: x her right, y up, z forward, from her upper chest.
//   aim: where the gun is when she aims (long guns: the butt in her shoulder: `shoulder` is from her right shoulder
//   joint, x her right, y up, z forward; pointed at the target)
//   ready: walking about (muzzle down and across), sprint: the roadie run (across her chest), cover: high ready
//   rot: [pitch (+ muzzle up), yaw (+ muzzle to her left), roll (+ top to her right)] radians
const LONG_RIGHT = { wrist: V(-0.034, -0.022, -0.066), fingers: V(0.15, -0.25, 1), palm: V(1, 0.05, 0.1) };
export const HOLD = {
  pistol: {
    right: { wrist: V(-0.036, -0.022, -0.068), fingers: V(0.12, -0.2, 1), palm: V(1, 0.05, 0.12) },
    left: { wrist: V(0.056, -0.03, -0.04), fingers: V(-0.45, -0.3, 1), palm: V(-1, 0.35, 0) },
    curlR: [1.35, 1.2, 0.9], trigger: [0.45, 0.4, 0.3], thumbR: [0.25, 0.2], curlL: [1.25, 1.1, 0.8], thumbL: [0.1, 0.1],
    aim: { pos: V(0.08, 0.2, 0.44), rot: [0, 0, 0] },
    ready: { pos: V(0.1, -0.08, 0.3), rot: [-0.65, 0.12, 0] },
    sprint: { pos: V(0.1, -0.06, 0.2), rot: [-1.0, 0.25, 0] },
    cover: { pos: V(0.06, 0.08, 0.2), rot: [1.05, 0.1, 0] },
    poleR: V(0.6, -1, -0.1), poleL: V(-0.6, -1, -0.1),
    recoil: { back: 0.9, up: 0.35, pitch: 9, yaw: 1.2, roll: 1.5, k: 420, c: 0.55 }
  },
  smg: {
    right: LONG_RIGHT,
    left: { wrist: V(0.04, 0.005, 0.165), fingers: V(-0.65, 0.2, 0.75), palm: V(-0.3, 1, 0.1) },
    curlR: [1.3, 1.15, 0.9], trigger: [0.45, 0.4, 0.3], thumbR: [0.6, 0.3], curlL: [0.55, 0.5, 0.35], thumbL: [0.2, 0.2],
    shoulder: V(-0.075, -0.02, 0.07), cheek: 0.16,
    aim: { rot: [0, 0, 0] },
    ready: { shoulder: V(-0.05, -0.1, 0.1), rot: [-0.5, 0.3, 0] },
    sprint: { pos: V(0.14, -0.1, 0.18), rot: [0.5, 0.95, 0.4] },
    cover: { pos: V(0.1, -0.02, 0.22), rot: [1.0, 0.2, 0] },
    poleR: V(1, -0.6, -0.2), poleL: V(-0.3, -1, 0),
    recoil: { back: 0.5, up: 0.15, pitch: 2.6, yaw: 1.4, roll: 0.8, k: 900, c: 0.7 }
  },
  rifle: {
    right: LONG_RIGHT,
    left: { wrist: V(0.04, 0.035, 0.17), fingers: V(-0.65, 0.2, 0.75), palm: V(-0.3, 1, 0.1) },
    curlR: [1.3, 1.15, 0.9], trigger: [0.45, 0.4, 0.3], thumbR: [0.6, 0.3], curlL: [0.55, 0.5, 0.35], thumbL: [0.2, 0.2],
    shoulder: V(-0.075, -0.02, 0.07), cheek: 0.16,
    aim: { rot: [0, 0, 0] },
    ready: { shoulder: V(-0.05, -0.1, 0.1), rot: [-0.5, 0.3, 0] },
    sprint: { pos: V(0.14, -0.1, 0.18), rot: [0.5, 0.95, 0.4] },
    cover: { pos: V(0.1, -0.02, 0.22), rot: [1.0, 0.2, 0] },
    poleR: V(1, -0.6, -0.2), poleL: V(-0.3, -1, 0),
    recoil: { back: 0.75, up: 0.25, pitch: 4.2, yaw: 1.6, roll: 1.0, k: 700, c: 0.65 }
  },
  shotgun: {
    right: { wrist: V(-0.034, -0.03, -0.064), fingers: V(0.1, -0.35, 1), palm: V(1, 0.05, 0.1) },
    left: { wrist: V(0.04, -0.05, 0.285), fingers: V(-0.65, 0.2, 0.75), palm: V(-0.3, 1, 0.1), onPump: true },
    curlR: [1.35, 1.2, 0.9], trigger: [0.45, 0.4, 0.3], thumbR: [0.7, 0.4], curlL: [1.15, 1.0, 0.8], thumbL: [0.3, 0.2],
    shoulder: V(-0.075, -0.03, 0.07), cheek: 0.18,
    aim: { rot: [0, 0, 0] },
    ready: { shoulder: V(-0.05, -0.11, 0.1), rot: [-0.5, 0.3, 0] },
    sprint: { pos: V(0.14, -0.1, 0.16), rot: [0.5, 0.95, 0.4] },
    cover: { pos: V(0.1, -0.04, 0.2), rot: [1.0, 0.2, 0] },
    poleR: V(1, -0.6, -0.2), poleL: V(-0.3, -1, 0),
    recoil: { back: 1.6, up: 0.45, pitch: 11, yaw: 2.0, roll: 2.5, k: 260, c: 0.55 }
  }
};

// The reloads: `dur` seconds; `active` the sweet spot (a Gears active reload: R again inside it); the left hand's path
// as [t, anchor] keys (it eases between them); events at their times. Anchors: support (its place on the gun), pouch
// (her belt), below (a magazine just under the well), seat (the magazine in), slide (over the pistol's slide), bolt
// (the SMG's cocking handle, or the rifle's bolt catch), port (the shotgun's loading port).
export const RELOADS = {
  pistol: {
    dur: 1.25, active: [0.42, 0.55],
    hand: [[0, 'support'], [0.08, 'support'], [0.3, 'pouch'], [0.36, 'pouch'], [0.55, 'below'], [0.64, 'seat'], [0.72, 'slide'], [0.8, 'slide'], [0.94, 'support']],
    events: [[0.1, 'magOut'], [0.33, 'magGrab'], [0.64, 'magIn'], [0.78, 'slideRelease']]
  },
  smg: {
    dur: 1.8, active: [0.52, 0.64],
    hand: [[0, 'support'], [0.1, 'bolt'], [0.16, 'boltBack'], [0.2, 'boltBack'], [0.4, 'pouch'], [0.45, 'pouch'], [0.62, 'below'], [0.71, 'seat'], [0.8, 'boltBack'], [0.84, 'bolt'], [0.98, 'support']],
    events: [[0.15, 'boltBack'], [0.24, 'magOut'], [0.43, 'magGrab'], [0.71, 'magIn'], [0.84, 'boltSlap']]
  },
  rifle: {
    dur: 1.7, active: [0.44, 0.56],
    hand: [[0, 'support'], [0.08, 'support'], [0.3, 'pouch'], [0.36, 'pouch'], [0.55, 'below'], [0.64, 'seat'], [0.72, 'bolt'], [0.78, 'bolt'], [0.94, 'support']],
    events: [[0.1, 'magOut'], [0.33, 'magGrab'], [0.64, 'magIn'], [0.76, 'boltSlap']]
  },
  // One shell: from the port to the belt and back. A pump at the end if the gun was empty.
  shotgun: { dur: 0.5, shell: true, hand: [[0, 'port'], [0.4, 'pouch'], [0.5, 'pouch'], [0.85, 'port'], [1, 'port']], events: [[0.45, 'shellGrab'], [0.86, 'shellIn']] }
};

// Scratch for the callers; the bone helpers below have their own (a caller's `qa` passed in must survive them).
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const r1 = new THREE.Quaternion(), r2 = new THREE.Quaternion(), r3 = new THREE.Quaternion();
const m4 = new THREE.Matrix4();

// Turn a bone by a world-space rotation `q`, by `w`.
function rotateWorld(bone, q, w = 1) {
  if (!bone?.parent) return;
  bone.getWorldQuaternion(r1);
  bone.parent.getWorldQuaternion(r2);
  r3.identity().slerp(q, w);
  bone.quaternion.copy(r2.invert().multiply(r3.multiply(r1)));
  bone.updateMatrixWorld(true);
}
// Set a bone's world orientation.
function setWorldQuat(bone, q) {
  bone.parent.getWorldQuaternion(r2);
  bone.quaternion.copy(r2.invert().multiply(q));
  bone.updateMatrixWorld(true);
}
// The rotation whose +Z is `fwd` and +Y is as near `up` as it can be.
function lookQuat(fwd, up, out = new THREE.Quaternion()) {
  m4.lookAt(fwd, ORIGIN, up);
  return out.setFromRotationMatrix(m4);
}
// A basis rotation taking (a1, a2) to (b1, b2): the first exactly, the second as near as it can.
function basisQuat(a1, a2, b1, b2, out = new THREE.Quaternion()) {
  const ma = new THREE.Matrix4(), mb = new THREE.Matrix4();
  const ax = a1.clone().normalize(), az = new THREE.Vector3().crossVectors(ax, a2).normalize(), ay = new THREE.Vector3().crossVectors(az, ax);
  const bx = b1.clone().normalize(), bz = new THREE.Vector3().crossVectors(bx, b2).normalize(), by = new THREE.Vector3().crossVectors(bz, bx);
  ma.makeBasis(ax, ay, az);
  mb.makeBasis(bx, by, bz);
  return out.setFromRotationMatrix(mb.multiply(ma.transpose()));
}

// A damped spring per channel: kicked by a velocity, pulled back to 0.
class Springs {
  constructor(names) {
    this.x = Object.fromEntries(names.map((n) => [n, 0]));
    this.v = Object.fromEntries(names.map((n) => [n, 0]));
    this.k = 500;
    this.c = 0.6;
  }
  kick(ch, v) {
    this.v[ch] += v;
  }
  update(dt) {
    const k = this.k, c = 2 * Math.sqrt(k) * this.c;
    // Small steps: a big dt (the headless drive) would blow a stiff spring up.
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++)
      for (const ch of Object.keys(this.x)) {
        this.v[ch] += (-k * this.x[ch] - c * this.v[ch]) * h;
        this.x[ch] += this.v[ch] * h;
      }
  }
}

export class WeaponRig {
  constructor(player) {
    this.p = player;
    const o = player.body.outer;
    const b = (n) => o.getObjectByName(n);
    this.bones = {
      hips: b('ls_hips'), spine: b('ls_spine'), chest: b('ls_chest'), upperChest: b('ls_upperChest'), neck: b('ls_neck'), head: b('ls_head'),
      R: { clav: b('ls_rightShoulder'), up: b('ls_rightUpperArm'), low: b('ls_rightLowerArm'), hand: b('ls_rightHand') },
      L: { clav: b('ls_leftShoulder'), up: b('ls_leftUpperArm'), low: b('ls_leftLowerArm'), hand: b('ls_leftHand') }
    };
    this.ok = !!(this.bones.R.hand && this.bones.L.hand && this.bones.upperChest && this.bones.head);
    o.updateMatrixWorld(true);
    // Each hand: its fingers (chains of bones off the hand, thumb first), their rest rotations, and the hand's own
    // axes measured from its bones (fingers: towards the middle finger's root; palm: from the thumb's side).
    for (const side of ['R', 'L']) {
      const H = this.bones[side];
      if (!H.hand) continue;
      const roots = H.hand.children.filter((c) => c.isBone);
      const chains = roots.map((r) => {
        const chain = [r];
        for (let c = r.children.find((x) => x.isBone); c; c = c.children.find((x) => x.isBone)) chain.push(c);
        return chain;
      });
      // The thumb is the root nearest the wrist, sideways; the middle finger the root furthest along.
      const local = (bone) => H.hand.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
      const byReach = [...chains].sort((a, c) => local(c[0]).length() - local(a[0]).length());
      const named = (k) => chains.find((ch) => new RegExp(`Finger${k}$`).test(ch[0].name.replace(/^ls_(left|right)Middle$/, 'Finger2')));
      const thumb = named(0) ?? byReach[byReach.length - 1];
      const middle = named(2) ?? byReach[0];
      H.fingers = chains.filter((c) => c !== thumb);
      H.index = named(1) ?? null;
      H.thumb = thumb;
      H.rest = new Map();
      for (const ch of chains) for (const bone of ch) H.rest.set(bone, bone.quaternion.clone());
      const f = local(middle[0]).normalize();
      // The palm: square to the line of the knuckles (index to little finger) and the fingers, on the side the thumb
      // sits (a thumb's root is set in towards the palm).
      const index = named(1) ?? byReach[1], little = named(4) ?? byReach[byReach.length - 2];
      const across = local(index[0]).sub(local(little[0])).normalize();
      const n = new THREE.Vector3().crossVectors(across, f).normalize();
      const tl = local(thumb[0]);
      const tIn = tl.clone().addScaledVector(across, -tl.dot(across)).addScaledVector(f, -tl.dot(f));
      H.lf = f;
      H.lp = tIn.dot(n) >= 0 ? n : n.negate();
      H.across = across;
    }
    // The head's forward in its own space (she stands facing her group's +Z at load).
    if (this.bones.head) {
      const fwd = V(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      this.headFwd = fwd.applyQuaternion(this.bones.head.getWorldQuaternion(new THREE.Quaternion()).invert());
    }
    // Where the guns live while held: in the world, placed every frame.
    this.root = new THREE.Group();
    this.root.name = 'gunRoot';
    player.world.scene.add(this.root);
    this.recoil = new Springs(['back', 'up', 'pitch', 'yaw', 'roll', 'body']);
    this.w = 0; // the rig's weight (0: the clips have her arms)
    this.aimW = 0;
    this.sprintW = 0;
    this.coverW = 0;
    this.reloadW = 0;
    this.leftW = 1; // the left hand on the gun (0: it hangs, a one-handed moment)
    this.slideT = 1; // time since the slide went back
    this.slideLocked = false;
    this.pumpT = 9;
    this.pumpEjected = true;
    this.boltBack = 0;
    this.reload = null;
    this.aimPoint = V(0, 1.4, 10);
    this.gunQ = new THREE.Quaternion();
    this.gunP = V();
    this.held = null; // a magazine or a shell in her left hand
    this.events = [];
  }

  get gun() {
    return this.p.guns[this.p.weaponKey];
  }
  get info() {
    return this.p.gunInfo[this.p.weaponKey];
  }
  get hold() {
    return HOLD[this.p.weaponKey] ?? null;
  }

  // A shot: the springs get their kick, the slide goes back, the pump is due.
  fire() {
    const h = this.hold;
    if (!h) return;
    const r = h.recoil, s = this.p.world.tune?.recoil ?? 1, R = this.recoil;
    R.k = r.k;
    R.c = r.c;
    const rnd = (a) => (Math.random() * 2 - 1) * a;
    R.kick('back', r.back * s);
    R.kick('up', r.up * s);
    R.kick('pitch', r.pitch * s * (0.85 + Math.random() * 0.3));
    R.kick('yaw', rnd(r.yaw) * s);
    R.kick('roll', rnd(r.roll) * s);
    R.kick('body', r.back * s * 2.2);
    this.slideT = 0;
    if (this.p.weaponKey === 'shotgun') ((this.pumpT = 0), (this.pumpEjected = false));
  }

  // R: start the reload for the gun in her hands.
  startReload(w) {
    const key = this.p.weaponKey;
    const def = RELOADS[key];
    if (!def) return 0;
    this.reload = { key, def, t: 0, wasEmpty: w.mag === 0, fired: new Set(), active: null, shellsLeft: def.shell ? Math.min(w.def.mag - w.mag, w.reserve) : 0, pumpAfter: def.shell && w.mag === 0 };
    const total = def.shell ? def.dur * this.reload.shellsLeft + (this.reload.pumpAfter ? 0.45 : 0) : def.dur;
    return total;
  }
  // R again during a reload: in the sweet spot, the rest of it goes fast; outside it, a fumble.
  activeReload() {
    const r = this.reload;
    if (!r || r.active !== null || !r.def.active) return null;
    const [a, b] = r.def.active;
    r.active = r.t >= a && r.t <= b;
    return r.active;
  }
  cancelReload() {
    this.reload = null;
    if (this.held) this.held.visible = false;
    const info = this.info;
    if (info?.mag) info.mag.visible = true;
  }

  emit(name, data) {
    this.events.push({ name, data });
  }

  // ---- the pose ---------------------------------------------------------------------------------------------------
  update(dt, state) {
    if (!this.ok) return;
    const p = this.p;
    const key = p.weaponKey;
    const h = HOLD[key];
    const on = !!h && state.on;
    this.w = damp(this.w, on ? 1 : 0, on ? 14 : 10, dt);
    this.aimW = damp(this.aimW, state.aim ? 1 : 0, state.aim ? 22 : 12, dt);
    this.sprintW = damp(this.sprintW, state.sprint ? 1 : 0, 9, dt);
    this.coverW = damp(this.coverW, state.cover ? 1 : 0, 8, dt);
    this.recoil.update(dt);
    this.slideT += dt;
    this.pumpT += dt;
    // Where the guns are: in the rig's root while it holds them.
    for (const [k, g] of Object.entries(p.guns)) if (HOLD[k] && g.parent !== this.root) this.root.add(g);
    const gun = this.gun;
    if (!h || !gun || this.w < 0.01) {
      if (this.held) this.held.visible = false;
      return;
    }
    const info = this.info;
    this.advanceReload(dt, info);
    const o = p.body.outer;
    o.updateMatrixWorld(true);
    const B = this.bones;
    const yaw = p.yaw;
    const fwd = V(Math.sin(yaw), 0, Math.cos(yaw));
    const right = V(-Math.cos(yaw), 0, Math.sin(yaw));
    const W = this.w;

    // 1. The spine: lean into the aim (pitch), shoulders square to it; recoil rocks her back.
    const chestPos = B.upperChest.getWorldPosition(V());
    const toAim = this.aimPoint.clone().sub(chestPos);
    const aimDir = toAim.clone().normalize();
    const pitch = Math.asin(Math.max(-0.95, Math.min(0.95, aimDir.y)));
    const lean = (this.aimW * 0.8 + 0.25) * pitch - this.recoil.x.body * 0.25;
    const axis = right.clone();
    // A long gun blades her (left shoulder forward, the stock side back), so the left hand reaches the handguard.
    const twist = (h.shoulder ? 0.62 : 0.08) * (0.4 + 0.6 * this.aimW) * (1 - this.sprintW);
    for (const bone of [B.spine, B.chest, B.upperChest]) {
      qa.setFromAxisAngle(axis, -lean * 0.3 * W);
      rotateWorld(bone, qa);
      qb.setFromAxisAngle(UP, -twist * 0.33 * W);
      rotateWorld(bone, qb);
    }
    // 2. The gun's place: each pose, blended.
    const frame = this.frame(B.upperChest.getWorldPosition(V()), fwd, right);
    frame.rShoulder = B.R.up.getWorldPosition(V());
    const base = this.pose(h, 'ready', frame, fwd);
    const aim = this.pose(h, 'aim', frame, fwd);
    const blend = (a, b, t) => {
      a.pos.lerp(b.pos, t);
      a.q.slerp(b.q, t);
    };
    blend(base, aim, this.aimW * (1 - this.sprintW));
    if (this.coverW > 0.001 && h.cover) blend(base, this.pose(h, 'cover', frame, fwd), this.coverW * (1 - this.aimW));
    if (this.sprintW > 0.001) blend(base, this.pose(h, 'sprint', frame, fwd), this.sprintW);
    // The reload's tilt: the well turned to the left hand, the gun brought in and up.
    const rw = this.reloadW = damp(this.reloadW, this.reload ? 1 : 0, 14, dt);
    if (rw > 0.001) {
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35 * rw, 0.25 * rw, 0.55 * rw, 'YXZ'));
      base.q.multiply(tilt);
      base.pos.addScaledVector(fwd, -0.07 * rw).addScaledVector(right, -0.03 * rw).addScaledVector(UP, -0.05 * rw);
    }
    // Recoil, in the gun's own frame: back along the barrel, up, the muzzle climbing, a little yaw and roll.
    const R = this.recoil.x;
    const gFwd = V(0, 0, 1).applyQuaternion(base.q), gUp = V(0, 1, 0).applyQuaternion(base.q);
    base.pos.addScaledVector(gFwd, -R.back * 0.05).addScaledVector(gUp, R.up * 0.04);
    base.q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-R.pitch * 0.05, R.yaw * 0.05, R.roll * 0.05, 'YXZ')));
    this.gunP.copy(base.pos);
    this.gunQ.copy(base.q);
    gun.position.copy(base.pos);
    gun.quaternion.copy(base.q);
    gun.updateMatrixWorld(true);

    // 3. The moving parts: the slide, the pump, the bolt, the magazine.
    if (info?.slide) {
      const t = this.slideT;
      const back = this.slideLocked ? 1 : t < 0.022 ? t / 0.022 : t < 0.075 ? 1 - smooth(0.022, 0.075, t) : 0;
      info.slide.position.z = -info.slideTravel * back;
    }
    if (info?.pump) {
      const t = this.pumpT - 0.16;
      const s = this.reload?.pumping ?? (t < 0 ? 0 : t < 0.11 ? smooth(0, 0.11, t) : t < 0.24 ? 1 - smooth(0.11, 0.24, t) : 0);
      info.pump.position.z = -0.085 * s;
      // Once past 0.1 s (round 4: a window 0.1–0.3 s was stepped over whole by any frame longer than 0.2 s, and the
      // hull never came out). Armed again by the shot (`fire`), not by `t < 0`, which a long frame skips too.
      if (t > 0.1 && !this.pumpEjected) (this.pumpEjected = true), this.emit('pumpBack');
    }
    if (info?.bolt) info.bolt.position.z = -info.boltTravel * this.boltBack;
    gun.updateMatrixWorld(true);

    // 4. The arms onto it.
    const rightT = this.handTarget(h.right, gun);
    let leftT = this.handTarget(h.left, gun, h.left.onPump ? info.pump : null);
    if (this.reload) leftT = this.reloadHand(leftT, gun, info, frame);
    const pole = (v) => V().addScaledVector(right, v.x).addScaledVector(UP, v.y).addScaledVector(fwd, v.z).normalize();
    // The shoulders come forward a little to reach (a stock in the shoulder, two hands out on a pistol).
    aimBone(B.R.clav, B.R.up, rightT.pos.clone().sub(B.R.clav.getWorldPosition(V())).normalize().lerp(B.R.up.getWorldPosition(V()).sub(B.R.clav.getWorldPosition(V())).normalize(), 0.8), 0.25 * W);
    aimBone(B.L.clav, B.L.up, leftT.pos.clone().sub(B.L.clav.getWorldPosition(V())).normalize().lerp(B.L.up.getWorldPosition(V()).sub(B.L.clav.getWorldPosition(V())).normalize(), 0.5), 0.55 * W * this.leftW);
    this.lastRight = rightT.pos;
    this.lastLeft = leftT.pos;
    reach(B.R.up, B.R.low, B.R.hand, rightT.pos, pole(h.poleR), W);
    this.orient(B.R, rightT, W);
    const lw = W * this.leftW;
    if (lw > 0.01) {
      reach(B.L.up, B.L.low, B.L.hand, leftT.pos, pole(this.reload ? V(-0.5, -1, -0.3) : h.poleL), lw);
      this.orient(B.L, leftT, lw);
    }
    // 5. Fingers: round the grip, the index on the trigger; the left hand's round the handguard or the right hand.
    this.curl(B.R, h.curlR, h.trigger, h.thumbR, W);
    this.curl(B.L, this.reload ? [0.9, 0.8, 0.6] : h.curlL, null, h.thumbL, lw);
    // 6. The head: looks down the gun; with a stock, the cheek drops onto it.
    if (B.head && this.headFwd) {
      B.head.updateMatrixWorld(true);
      const cur = this.headFwd.clone().applyQuaternion(B.head.getWorldQuaternion(qa));
      const want = this.aimPoint.clone().sub(B.head.getWorldPosition(V())).normalize();
      if (this.aimW < 0.5 && !this.reload) want.lerp(fwd.clone().setY(want.y * 0.5), 0.5).normalize();
      if (this.reload) want.lerp(gun.localToWorld(V(0.04, -0.05, 0.05)).sub(B.head.getWorldPosition(V())).normalize(), 0.6 * rw).normalize();
      qb.setFromUnitVectors(cur, want);
      if (B.neck) rotateWorld(B.neck, qb, 0.35 * W);
      const cur2 = this.headFwd.clone().applyQuaternion(B.head.getWorldQuaternion(qa));
      qb.setFromUnitVectors(cur2, want);
      rotateWorld(B.head, qb, 0.75 * W);
      if (h.cheek) {
        qb.setFromAxisAngle(want, -h.cheek * this.aimW * (1 - this.sprintW));
        rotateWorld(B.head, qb, W);
      }
    }
    // The held magazine or shell, in her left hand.
    if (this.held?.visible) this.placeHeld(gun, info);
  }

  // Her chest's frame: x her right, y up, z forward.
  frame(origin, fwd, right) {
    return { origin, fwd, right };
  }
  // One pose's gun transform. Long guns aim from the shoulder: the butt there, the barrel at the aim point.
  pose(h, name, F, fwd) {
    const P = h[name] ?? h.ready;
    const at = (v) => F.origin.clone().addScaledVector(F.right, v.x).addScaledVector(UP, v.y).addScaledVector(F.fwd, v.z);
    const atS = (v) => F.rShoulder.clone().addScaledVector(F.right, v.x).addScaledVector(UP, v.y).addScaledVector(F.fwd, v.z);
    const [pitch, yaw, roll] = P.rot ?? [0, 0, 0];
    const info = this.info;
    let dir, q = new THREE.Quaternion(), pos;
    if (name === 'aim') {
      const butt = h.shoulder && info?.butt ? atS(h.shoulder) : null;
      const from = butt ?? at(P.pos);
      // A stock: aim from the cheek, a little above the butt; a pistol: from her eyes, roughly.
      dir = this.aimPoint.clone().sub(from.clone().addScaledVector(UP, butt ? 0.08 : 0.05)).normalize();
      // Never aim back through herself.
      if (dir.dot(fwd) < 0.2) dir.addScaledVector(fwd, 0.2 - dir.dot(fwd)).normalize();
      lookQuat(dir, UP, q);
      if (butt) pos = butt.clone().sub(info.butt.clone().applyQuaternion(q));
      else pos = from;
      return { pos, q };
    }
    // The others: relative to her facing, pitched and turned by the pose.
    lookQuat(fwd, UP, q);
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, roll, 'YXZ')));
    if (P.shoulder && info?.butt) pos = atS(P.shoulder).sub(info.butt.clone().applyQuaternion(q));
    else pos = at(P.pos ?? V(0.1, 0, 0.3));
    return { pos, q };
  }

  // A hand frame on the gun (or on its pump) → where the wrist goes and how the hand turns, in the world.
  handTarget(hf, gun, pump = null) {
    const wrist = hf.wrist.clone();
    if (pump) wrist.z += pump.position.z;
    const gq = gun.getWorldQuaternion(new THREE.Quaternion());
    return { pos: gun.localToWorld(wrist), F: hf.fingers.clone().normalize().applyQuaternion(gq), P: hf.palm.clone().normalize().applyQuaternion(gq) };
  }
  orient(H, t, w) {
    const q = basisQuat(H.lf, H.lp, t.F, t.P);
    // q maps the hand's local axes to the wanted world ones: that is the hand's world rotation.
    const cur = H.hand.getWorldQuaternion(new THREE.Quaternion());
    setWorldQuat(H.hand, cur.slerp(q, w));
  }
  curl(H, curl, trigger, thumb, w) {
    if (!H.fingers || w < 0.01) return;
    H.hand.updateMatrixWorld(true);
    const palm = H.lp.clone().applyQuaternion(H.hand.getWorldQuaternion(new THREE.Quaternion()));
    const one = (chain, angles) => {
      for (let i = 0; i < chain.length; i++) {
        const bone = chain[i];
        bone.quaternion.copy(H.rest.get(bone));
        bone.updateMatrixWorld(true);
        const next = chain[i + 1];
        const a = bone.getWorldPosition(V());
        const d = next ? next.getWorldPosition(V()).sub(a) : a.clone().sub(chain[i - 1]?.getWorldPosition(V()) ?? H.hand.getWorldPosition(V()));
        const ax = V().crossVectors(d.normalize(), palm).normalize();
        if (ax.lengthSq() < 0.5) continue;
        qa.setFromAxisAngle(ax, (angles[Math.min(i, angles.length - 1)] ?? 0) * w);
        rotateWorld(bone, qa);
      }
    };
    for (const ch of H.fingers) one(ch, trigger && ch === H.index ? trigger : curl);
    if (H.thumb) one(H.thumb, thumb ?? [0.2, 0.2]);
  }

  // ---- reloads ----------------------------------------------------------------------------------------------------
  advanceReload(dt, info) {
    const r = this.reload;
    if (!r) return;
    const speed = r.active === true ? 2.6 : r.active === false ? 0.7 : 1;
    // The pump that ends a shotgun reload from empty.
    if (r.def.shell && r.shellsLeft <= 0) {
      r.pumpT = (r.pumpT ?? 0) + dt;
      const t = r.pumpT;
      r.pumping = t < 0.15 ? smooth(0, 0.15, t) : t < 0.3 ? 1 - smooth(0.15, 0.3, t) : 0;
      if (t > 0.15 && !r.racked) (r.racked = true), this.emit('rack');
      if (!r.pumpAfter || t > 0.4) this.finishReload();
      return;
    }
    r.t += (dt * speed) / r.def.dur;
    for (const [at, name] of r.def.events) {
      const key = `${name}@${at}`;
      if (r.t >= at && !r.fired.has(key)) {
        r.fired.add(key);
        this.reloadEvent(name, r, info);
      }
    }
    if (r.t >= 1) {
      if (r.def.shell) {
        r.shellsLeft--;
        r.fired.clear();
        r.t = 0;
        // Fire pressed during a shell reload: it stops after this shell.
        if (r.stop) r.shellsLeft = 0;
        if (r.shellsLeft <= 0 && !(r.pumpAfter && r.loaded > 0)) this.finishReload();
      } else this.finishReload();
    }
  }
  finishReload() {
    const r = this.reload;
    this.reload = null;
    if (this.held) this.held.visible = false;
    this.emit('reloadDone', r);
  }
  reloadEvent(name, r, info) {
    switch (name) {
      case 'magOut':
        if (info?.mag) {
          info.mag.visible = false;
          this.emit('magOut', { mag: info.mag, axis: info.magAxis });
        }
        if (r.wasEmpty && info?.slide) this.slideLocked = true;
        break;
      case 'magGrab':
        this.hold_(info, 'mag');
        this.emit('magGrab');
        break;
      case 'magIn':
        if (this.held) this.held.visible = false;
        if (info?.mag) info.mag.visible = true;
        this.recoil.kick('up', 0.5);
        this.recoil.kick('pitch', -2);
        this.emit('magIn', r);
        break;
      case 'slideRelease':
        if (this.slideLocked) {
          this.slideLocked = false;
          this.slideT = 0.022;
          this.recoil.kick('back', 0.4);
          this.emit('slide');
        }
        break;
      case 'boltBack':
        this.boltBack = 1;
        this.emit('cock');
        break;
      case 'boltSlap':
        this.boltBack = 0;
        this.recoil.kick('roll', 3);
        this.recoil.kick('back', 0.4);
        this.emit('slap', r);
        break;
      case 'shellGrab':
        this.hold_(info, 'shell');
        break;
      case 'shellIn':
        if (this.held) this.held.visible = false;
        r.loaded = (r.loaded ?? 0) + 1;
        this.recoil.kick('up', 0.25);
        this.emit('shellIn', r);
        break;
    }
  }
  // Something in her left hand: a magazine like the gun's, or a shell.
  hold_(info, kind) {
    if (this.held) this.held.removeFromParent();
    let obj;
    if (kind === 'mag' && info?.mag) {
      obj = new THREE.Group();
      const c = info.mag.clone();
      c.visible = true;
      c.position.set(0, 0, 0);
      obj.add(c);
    } else {
      obj = this.p.world.fx?.shellMesh?.() ?? new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.068, 10), new THREE.MeshPhongMaterial({ color: 0xa52a22 }));
    }
    obj.userData.kind = kind;
    this.p.world.scene.add(obj);
    this.held = obj;
  }
  // Where the magazine's floor sits on the gun (its lowest point along the drop axis), in the gun's space.
  magBottom(info) {
    if (info._bottom) return info._bottom;
    const mag = info.mag;
    const box = new THREE.Box3();
    const parent = mag.parent;
    const save = mag.position.clone();
    mag.position.set(0, 0, 0);
    parent.updateMatrixWorld(true);
    const inv = parent.matrixWorld.clone().invert();
    mag.traverse((m) => {
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld.clone().premultiply(inv)));
    });
    mag.position.copy(save);
    const c = box.getCenter(V());
    info._bottom = V(c.x, box.min.y, c.z + (info.magAxis?.z ?? 0) * 0.5 * (box.max.y - box.min.y));
    return info._bottom;
  }
  // The left hand's target during a reload: eased between the anchors of the timeline.
  reloadHand(support, gun, info, F) {
    const r = this.reload;
    const keys = r.def.hand;
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1][0] <= r.t) i++;
    const [t0, a0] = keys[i];
    const [t1, a1] = keys[Math.min(i + 1, keys.length - 1)];
    const s = t1 > t0 ? smooth(t0, t1, r.t) : 1;
    const A = this.anchor(a0, support, gun, info, F), Bk = this.anchor(a1, support, gun, info, F);
    return { pos: A.pos.lerp(Bk.pos, s), F: A.F.lerp(Bk.F, s).normalize(), P: A.P.lerp(Bk.P, s).normalize() };
  }
  anchor(name, support, gun, info, F) {
    const gq = gun.getWorldQuaternion(new THREE.Quaternion());
    const g = (x, y, z) => gun.localToWorld(V(x, y, z));
    const dir = (x, y, z) => V(x, y, z).normalize().applyQuaternion(gq);
    switch (name) {
      case 'pouch': {
        // Her belt, front left.
        const hip = this.bones.hips.getWorldPosition(V());
        return { pos: hip.addScaledVector(F.right, -0.17).addScaledVector(F.fwd, 0.1).addScaledVector(UP, 0.02), F: V(0, -1, 0).addScaledVector(F.fwd, 0.3).normalize(), P: F.right.clone() };
      }
      case 'below':
      case 'seat': {
        if (!info?.mag || !info.magAxis) return { pos: support.pos.clone(), F: support.F.clone(), P: support.P.clone() };
        const bottom = this.magBottom(info).clone().addScaledVector(info.magAxis, name === 'below' ? 0.13 : 0);
        // The palm under the magazine's floor, fingers along the gun.
        const at = bottom.addScaledVector(V(0, 0, -1), 0.075).addScaledVector(V(0, -1, 0), 0.025).addScaledVector(V(1, 0, 0), 0.01);
        return { pos: gun.localToWorld(at), F: dir(-0.1, 0.25, 1), P: dir(0, 1, 0) };
      }
      case 'slide':
        // Over the top of the slide's rear: the hand on it, fingers to the gun's right.
        return { pos: g(0.05, 0.11, -0.07), F: dir(-1, -0.2, 0.3), P: dir(0, -1, 0) };
      case 'bolt':
      case 'boltBack': {
        if (this.p.weaponKey === 'smg') return { pos: g(0.075, 0.1, name === 'boltBack' ? 0.16 : 0.2), F: dir(-0.2, 0.1, 1), P: dir(-1, 0, 0) };
        // The rifle's bolt catch: the heel of the left hand slaps it.
        return { pos: g(0.07, 0.03, 0.0), F: dir(-0.2, 0.3, 1), P: dir(-1, 0, 0) };
      }
      case 'port': {
        const lp = info?.loadPort ?? V(0, 0, 0.12);
        return { pos: g(lp.x + 0.02, lp.y - 0.06, lp.z - 0.06), F: dir(0, 0.5, 1), P: dir(0, 1, 0) };
      }
      default:
        return { pos: support.pos.clone(), F: support.F.clone(), P: support.P.clone() };
    }
  }
  placeHeld(gun, info) {
    const H = this.bones.L.hand;
    const hq = H.getWorldQuaternion(new THREE.Quaternion());
    const F = H.parent ? this.bones.L.lf.clone().applyQuaternion(hq) : V(0, 0, 1);
    const P = this.bones.L.lp.clone().applyQuaternion(hq);
    const grasp = H.getWorldPosition(V()).addScaledVector(F, 0.075).addScaledVector(P, 0.03);
    const gq = gun.getWorldQuaternion(new THREE.Quaternion());
    if (this.held.userData.kind === 'mag') {
      // The magazine's floor on her palm, upright with the gun.
      const bottom = this.magBottom(info).clone().applyQuaternion(gq);
      this.held.position.copy(grasp).sub(bottom);
      this.held.quaternion.copy(gq);
    } else {
      this.held.position.copy(grasp);
      this.held.quaternion.copy(gq).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
    }
  }

  // The muzzle, the ejection port and which way brass flies, in the world.
  port() {
    const gun = this.gun, info = this.info;
    if (!gun || !info?.eject) return null;
    gun.updateMatrixWorld(true);
    const gq = gun.getWorldQuaternion(new THREE.Quaternion());
    return { at: gun.localToWorld(info.eject.clone()), dir: V(-1, 0.75, -0.25).normalize().applyQuaternion(gq) };
  }
}
