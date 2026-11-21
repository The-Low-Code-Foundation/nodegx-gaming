// The crew weightless (ROADMAP phase 4): how people hold themselves where nothing has weight, and how they get about.
//
// Rocketbox's motion capture was all recorded standing on a floor, so the clips here are keyed in code, on the same
// Biped skeleton every Rocketbox person has (mocap.mjs), as rotations of its bones from the rest pose:
//
// - `nbp`: adrift, the neutral body posture of people in orbit: arms floating up in front, knees and hips bent, the
//   head a little forward. Breathing, slowly.
// - `rail*`: feet hooked in a foot rail at a console or a wall, knees a little bent, the body swaying at the ankles. The
//   upper body is Rocketbox's own capture (working at a table, talking, looking round) over keyed legs, so the hands
//   still work and the gestures still read: `railWork`, `railTalk`, `railLook`; `railIdle` has the floating arms.
// - `railBrace`: in the foot rail, hunched, both fists on the console's edge: braced for a hit.
// - Getting about, as people really do it in orbit: not swimming, but a push off, a glide and a catch, then a moment
//   holding on before the next push. `floatHold`: one hand on a hold beside them, the body loose, feet off the deck.
//   `floatPush`: crouched against the hold, then the legs and arms straighten. `floatGlide`: laid out head first, one
//   arm reaching ahead, the other along the body, legs trailing loose. `floatCatch`: both hands out ahead and the knees
//   coming up to take the stop. (`floatStep` lays the body along the way and brings it upright; the clips are the limbs.)
// - `floatBrace`: tucked and holding on hard, at a wall.
//
// A pose is a rotation per bone in the body's own frame (x the person's right, y up, -z forward), applied to that
// bone as if its parent were still at rest, then carried along by the parent (`localOf`). Bones that hinge (elbows,
// knees, fingers) take a `bend` about their own z axis instead. Arms and legs are given for the left side and mirrored.
//
// `floatIn(m, room)` makes a crew member (crew.mjs) weightless in a `float` room; `FLOATING` is the clip each standing
// pose becomes; `floatStep(m, dt)` each frame (crew.mjs `tickCrew`, career.mjs) lays a moving one along their way off
// the deck, brings them upright at the end, and at a brace call puts everyone in a brace (`crewBrace`, from the bus).
// A hit kicks them (`crewJolt`). `gimbal(C, couch)` swings an acceleration couch round to face the bow when the drive
// burns, so whoever is in it has their back to the push.

import * as THREE from 'three';

const D = Math.PI / 180;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

/** Bone names in poses, to the Biped's keys (mocap.mjs `byKey`). */
const BONE = {
  bip: 'bip01', pelvis: 'bip01pelvis', spine: 'bip01spine', spine1: 'bip01spine1', spine2: 'bip01spine2', neck: 'bip01neck', head: 'bip01head',
  clavL: 'bip01lclavicle', armL: 'bip01lupperarm', foreL: 'bip01lforearm', handL: 'bip01lhand',
  clavR: 'bip01rclavicle', armR: 'bip01rupperarm', foreR: 'bip01rforearm', handR: 'bip01rhand',
  thighL: 'bip01lthigh', calfL: 'bip01lcalf', footL: 'bip01lfoot', toeL: 'bip01ltoe0',
  thighR: 'bip01rthigh', calfR: 'bip01rcalf', footR: 'bip01rfoot', toeR: 'bip01rtoe0'
};
const FINGERS = (s) => [0, 1, 2, 3, 4].flatMap((f) => [`bip01${s}finger${f}`, `bip01${s}finger${f}1`, `bip01${s}finger${f}2`]);
/** What the keyed legs replace in a captured clip: the root, the hips, the lowest spine (the thighs hang from it) and the legs. */
const LOWER = new Set(['bip01', 'pelvis', 'spine', 'thighL', 'calfL', 'footL', 'toeL', 'thighR', 'calfR', 'footR', 'toeR'].map((k) => BONE[k]));
/** Every bone a keyed clip drives (so a cross-fade from a captured one has somewhere to go). */
const BODY = Object.keys(BONE).filter((k) => k !== 'bip');

/** A person's skeleton at rest, from a template before any clip has played (crew.mjs `template`): per Bip01 node its
 *  local rotation and position, its rotation and place in the body's frame, and its parent's key. */
export function rigOf(outer, nodes) {
  const frame = new THREE.Group();
  frame.rotation.y = Math.PI; // the body faces +z in `outer`; a crew member faces -z
  const was = outer.parent;
  frame.add(outer);
  frame.updateMatrixWorld(true);
  const rig = new Map();
  for (const [k, o] of nodes) {
    if (!k.startsWith('bip01')) continue;
    rig.set(k, {
      name: o.name, q: o.quaternion.clone(), p: o.position.clone(),
      w: o.getWorldQuaternion(new THREE.Quaternion()), // `frame` is the body's frame, and has no parent
      at: o.getWorldPosition(new THREE.Vector3()),
      parent: o.parent && [...nodes].find(([, n]) => n === o.parent)?.[0]
    });
  }
  // A move of the hips in the body's frame, in Bip01's parent's own (scaled, turned) frame: for its position track.
  const bip = nodes.get('bip01');
  const toBody = new THREE.Matrix3().setFromMatrix4(bip.parent.matrixWorld);
  rig.toLocal = toBody.invert();
  frame.remove(outer);
  was?.add(outer);
  outer.updateMatrixWorld(true);
  return rig;
}

/** The bone's rotation in the body's frame for pose entry `e` ([x, y, z] degrees, z then y then x). */
const bodyRot = (e, out) => out.setFromEuler(_e.set(e[0] * D, e[1] * D, e[2] * D, 'XYZ'));

/** Mirrors a pose's left side onto the right where the right is not given: [x, y, z] → [x, -y, -z], bends the same. */
function sym(P) {
  const out = { ...P, b: { ...P.b }, bend: { ...P.bend } };
  for (const [k, v] of Object.entries(P.b ?? {})) if (k.endsWith('L') && !(k.slice(0, -1) + 'R' in out.b)) out.b[k.slice(0, -1) + 'R'] = [v[0], -v[1], -v[2]];
  for (const [k, v] of Object.entries(P.bend ?? {})) if (k.endsWith('L') && !(k.slice(0, -1) + 'R' in out.bend)) out.bend[k.slice(0, -1) + 'R'] = v;
  out.curl = Array.isArray(P.curl) ? P.curl : [P.curl ?? 0.3, P.curl ?? 0.3];
  return out;
}

/** A pose's local rotations (key → quaternion) and the hips' move, in the body's frame (`lift`). With `ground`, the
 *  hips come down (or up) so the lower foot stays where it stood at rest. */
function solve(rig, P, ground) {
  const L = new Map(), delta = new Map(), place = new Map();
  for (const name of BODY) {
    const k = BONE[name], r = rig.get(k);
    if (!r) continue;
    const R = P.b[name] ? bodyRot(P.b[name], new THREE.Quaternion()) : new THREE.Quaternion();
    // local' = rest · (W⁻¹ R W) · bend: R about the joint in the body's frame, as if the parent were still at rest.
    const q = r.q.clone().multiply(r.w.clone().invert().multiply(R).multiply(r.w));
    if (P.bend[name]) q.multiply(_q.setFromAxisAngle(Z, P.bend[name] * D));
    L.set(k, q);
  }
  const curl = (s, a) => FINGERS(s).forEach((k, i) => rig.has(k) && L.set(k, rig.get(k).q.clone().multiply(_q.setFromAxisAngle(Z, (i < 3 ? 0.4 : 1) * a))));
  curl('l', P.curl[0]);
  curl('r', P.curl[1]);
  // Where the feet end up (forward kinematics down the legs), for the ground.
  const lift = new THREE.Vector3(...(P.lift ?? [0, 0, 0]));
  if (ground) {
    const dOf = (k) => {
      if (delta.has(k)) return delta.get(k);
      const r = rig.get(k), dp = r.parent && rig.has(r.parent) ? dOf(r.parent) : new THREE.Quaternion();
      // Δ = Δparent · W · (W⁻¹ R W · bend) · W⁻¹: the rotation that takes the bone from rest to posed, in the body's frame.
      const loc = r.q.clone().invert().multiply(L.get(k) ?? r.q);
      const d = dp.clone().multiply(r.w.clone().multiply(loc).multiply(r.w.clone().invert()));
      delta.set(k, d);
      return d;
    };
    const atOf = (k) => {
      if (place.has(k)) return place.get(k);
      const r = rig.get(k);
      if (!r.parent || !rig.has(r.parent)) return place.set(k, r.at.clone()).get(k);
      const pr = rig.get(r.parent);
      const p = atOf(r.parent).clone().add(_v.subVectors(r.at, pr.at).applyQuaternion(dOf(r.parent)));
      place.set(k, p);
      return p;
    };
    let low = Infinity;
    for (const s of ['l', 'r']) for (const k of [`bip01${s}foot`, `bip01${s}toe0`]) if (rig.has(k)) low = Math.min(low, atOf(k).y - rig.get(k).at.y);
    if (low !== Infinity) lift.y -= low;
  }
  return { L, lift };
}

/** A clip from keyed poses `keys` ([{ at: 0…1 of the period, …pose }]), looping every `period` seconds, over
 *  `duration` (a whole number of periods). With `donor` (a fitted captured clip), its upper body is kept and the keyed
 *  poses drive only the lower body (`LOWER`). */
export function keyedClip(name, rig, keys, { period = 4, ground = false, donor = null } = {}) {
  const duration = donor ? donor.duration : period;
  const n = donor ? Math.max(1, Math.round(duration / period)) : 1, T = duration / n;
  const poses = keys.map((k) => ({ at: k.at, ...solve(rig, sym(k), ground) }));
  const times = [];
  const at = []; // which key at each time
  for (let i = 0; i < n; i++) poses.forEach((p, j) => (times.push(i * T + p.at * T), at.push(j)));
  times.push(duration);
  at.push(0);
  const tracks = [];
  const keyed = donor ? LOWER : null;
  for (const [k, q0] of poses[0].L) {
    if (keyed && !keyed.has(k)) continue; // under a captured clip, only the legs are keyed: its hands stay its own
    const v = [];
    for (const j of at) v.push(...poses[j].L.get(k).toArray());
    tracks.push(new THREE.QuaternionKeyframeTrack(`${rig.get(k).name}.quaternion`, times, v));
  }
  const bip = rig.get('bip01');
  const pos = [];
  for (const j of at) pos.push(..._v.copy(poses[j].lift).applyMatrix3(rig.toLocal).add(bip.p).toArray());
  tracks.push(new THREE.VectorKeyframeTrack(`${bip.name}.position`, times, pos));
  tracks.push(new THREE.QuaternionKeyframeTrack(`${bip.name}.quaternion`, [0, duration], [...bip.q.toArray(), ...bip.q.toArray()]));
  if (donor) {
    for (const t of donor.tracks) {
      const bone = t.name.slice(0, t.name.lastIndexOf('.'));
      const key = bone.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (!LOWER.has(key)) tracks.push(t);
    }
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

// --- the poses ----------------------------------------------------------------------------------------------------
// Signs, in the body's frame: +x on a bone that hangs down (an arm, a thigh) swings it forward; on one that points up
// (the spine, the neck) it leans it back, so a forward lean is -x. +z on the left arm or leg brings it in to the body
// (the rest pose holds the arms 48° out). A bend is negative to flex an elbow or a knee; a finger's
// `curl` is positive to close the hand.

/** Feet in a foot rail: knees a little bent, the shins a touch back, the feet flat. */
const RAIL_LEGS = { thighL: [16, 0, -2] };
const RAIL_BEND = { calfL: -28 };
const RAIL_FEET = { footL: [12, 0, 0] };
/** The arms floating up in front, the elbows bent: how arms hang where nothing pulls them down. */
const NBP_ARMS = { armL: [44, 0, 24], clavL: [0, 0, 4] };
const NBP_ELBOW = { foreL: -46 };

export const POSES = {
  nbp: {
    period: 5.2,
    keys: [
      { at: 0, b: { ...NBP_ARMS, spine1: [-4, 0, 0], spine2: [-4, 0, 0], neck: [-12, 0, 0], head: [-6, 0, 0], thighL: [46, 0, -5], footL: [-18, 0, 0] }, bend: { ...NBP_ELBOW, calfL: -58 }, curl: 0.35 },
      { at: 0.5, b: { armL: [48, 0, 23], clavL: [0, 0, 4], spine1: [-2, 0, 0], spine2: [-3, 0, 0], neck: [-10, 0, 0], head: [-5, 0, 0], thighL: [50, 0, -6], footL: [-20, 0, 0] }, bend: { foreL: -50, calfL: -62 }, curl: 0.4 }
    ]
  },
  railIdle: {
    period: 4.6, ground: true,
    keys: [
      { at: 0, b: { ...NBP_ARMS, ...RAIL_LEGS, ...RAIL_FEET, spine1: [-3, 0, 1], neck: [-8, 0, 0] }, bend: { ...NBP_ELBOW, ...RAIL_BEND }, curl: 0.35 },
      { at: 0.5, b: { armL: [48, 0, 23], clavL: [0, 0, 4], ...RAIL_LEGS, ...RAIL_FEET, spine1: [-1, 0, -1], neck: [-6, 0, 0] }, bend: { foreL: -50, ...RAIL_BEND }, curl: 0.4 }
    ]
  },
  railBrace: {
    period: 1.6, ground: true,
    keys: [
      { at: 0, b: { thighL: [32, 0, -3], footL: [24, 0, 0], spine1: [-12, 0, 0], spine2: [-10, 0, 0], neck: [-12, 0, 0], armL: [56, 0, 34], clavL: [0, 0, 6] }, bend: { calfL: -58, foreL: -40 }, curl: 1.25 },
      { at: 0.5, b: { thighL: [33, 0, -3], footL: [25, 0, 0], spine1: [-13, 0, 0], spine2: [-10, 0, 0], neck: [-13, 0, 0], armL: [57, 0, 34], clavL: [0, 0, 6] }, bend: { calfL: -60, foreL: -42 }, curl: 1.25 }
    ]
  },
  floatHold: {
    period: 4.8,
    keys: [
      // The right hand on a hold out to the side at chest height, gripping; the left arm floating; the legs loose.
      { at: 0, b: { armR: [40, 0, 22], clavR: [0, 0, -2], armL: [26, 0, 22], spine1: [-4, 0, 2], neck: [-6, 0, 0], head: [-4, 10, 0], thighL: [34, 0, -6], thighR: [24, 0, 4], footL: [-16, 0, 0] }, bend: { foreR: -16, foreL: -38, calfL: -48, calfR: -38 }, curl: [0.3, 1.15] },
      { at: 0.5, b: { armR: [38, 0, 22], clavR: [0, 0, -2], armL: [30, 0, 20], spine1: [-2, 0, 1], neck: [-4, 0, 0], head: [-2, -6, 0], thighL: [38, 0, -5], thighR: [28, 0, 5], footL: [-18, 0, 0] }, bend: { foreR: -20, foreL: -42, calfL: -54, calfR: -44 }, curl: [0.35, 1.15] }
    ]
  },
  floatPush: {
    period: 1,
    keys: [
      // Gathered against the hold: knees and hips bent, both hands at the chest on it, the head down.
      { at: 0, b: { armL: [36, 0, 34], armR: [36, 0, -34], spine1: [-14, 0, 0], spine2: [-8, 0, 0], neck: [-10, 0, 0], thighL: [62, 0, -6], footL: [14, 0, 0] }, bend: { foreL: -110, foreR: -110, calfL: -96 }, curl: 1.1 },
      // Straightened: the push is through the legs and the arms; the right hand already reaching on ahead.
      { at: 0.7, b: { armR: [150, 0, -38], armL: [-10, 0, 38], spine1: [2, 0, 0], neck: [40, 0, 0], head: [16, 0, 0], thighL: [-4, 0, -3], footL: [-26, 0, 0] }, bend: { foreR: -12, foreL: -16, calfL: -10 }, curl: [0.3, 0.4] }
    ]
  },
  floatGlide: {
    period: 3.6,
    keys: [
      // Laid out head first (floatStep pitches the body): one arm ahead, the other along the side, the head up to
      // look where they are going, the legs trailing, one knee a little more bent than the other, toes pointed.
      { at: 0, b: { armR: [156, 0, -40], armL: [-12, 0, 40], clavR: [0, 0, -6], spine1: [3, 0, 0], neck: [44, 0, 0], head: [18, 0, 0], thighL: [-6, 0, -3], thighR: [4, 0, 2], footL: [-30, 0, 0], footR: [-24, 0, 0] }, bend: { foreR: -14, foreL: -14, calfL: -16, calfR: -34 }, curl: [0.3, 0.45] },
      { at: 0.5, b: { armR: [160, 0, -38], armL: [-8, 0, 38], clavR: [0, 0, -6], spine1: [4, 0, 1], neck: [42, 0, 0], head: [18, 0, 0], thighL: [-2, 0, -4], thighR: [0, 0, 3], footL: [-28, 0, 0], footR: [-26, 0, 0] }, bend: { foreR: -18, foreL: -18, calfL: -24, calfR: -28 }, curl: [0.35, 0.45] }
    ]
  },
  floatCatch: {
    period: 1.2,
    keys: [
      // Both hands out ahead for the hold, elbows soft, the knees coming up and the head up: taking the stop.
      { at: 0, b: { armL: [82, 0, 26], armR: [86, 0, -26], spine1: [-6, 0, 0], neck: [20, 0, 0], thighL: [40, 0, -6], footL: [-6, 0, 0] }, bend: { foreL: -24, foreR: -20, calfL: -64 }, curl: 0.6 },
      { at: 0.5, b: { armL: [78, 0, 26], armR: [82, 0, -26], spine1: [-8, 0, 0], neck: [18, 0, 0], thighL: [46, 0, -6], footL: [-6, 0, 0] }, bend: { foreL: -30, foreR: -26, calfL: -72 }, curl: 0.8 }
    ]
  },
  floatBrace: {
    period: 1.6,
    keys: [
      { at: 0, b: { thighL: [68, 0, -6], footL: [-8, 0, 0], spine1: [-12, 0, 0], spine2: [-10, 0, 0], neck: [-16, 0, 0], armL: [64, 0, 34], clavL: [0, 0, 6] }, bend: { calfL: -100, foreL: -50 }, curl: 1.25 },
      { at: 0.5, b: { thighL: [70, 0, -6], footL: [-8, 0, 0], spine1: [-13, 0, 0], spine2: [-10, 0, 0], neck: [-16, 0, 0], armL: [65, 0, 34], clavL: [0, 0, 6] }, bend: { calfL: -102, foreL: -52 }, curl: 1.25 }
    ]
  }
};
/** The captured clips that keep their upper body over feet in a foot rail. */
const RAIL_DONORS = { railWork: 'workTable', railTalk: 'talk', railLook: 'lookAround' };
const RAIL_KEYS = [
  { at: 0, b: { ...RAIL_LEGS, ...RAIL_FEET }, bend: { ...RAIL_BEND } },
  { at: 0.5, b: { thighL: [18, 0, -2], footL: [13, 0, 0] }, bend: { calfL: -31 } }
];

/** Every weightless clip for one person, from their rest pose and their fitted captured clips: { name: clip }. */
export function floatClips(rig, clips) {
  const out = {};
  for (const [name, P] of Object.entries(POSES)) out[name] = keyedClip(name, rig, P.keys, P);
  for (const [name, from] of Object.entries(RAIL_DONORS)) if (clips[from]) out[name] = keyedClip(name, rig, RAIL_KEYS, { period: 4.6, ground: true, donor: clips[from] });
  return out;
}

/** The clip a standing pose becomes weightless: a seat is an acceleration couch (strapped in, as it was). */
export const FLOATING = { idle: 'railIdle', lookAround: 'railLook', talk: 'railTalk', workTable: 'railWork', walk: 'floatHold', sitChair: 'sitChair', drift: 'nbp' };
/** And braced for a hit. */
const BRACED = { railIdle: 'railBrace', railLook: 'railBrace', railTalk: 'railBrace', railWork: 'railBrace', floatHold: 'floatBrace', floatPush: 'floatBrace', floatGlide: 'floatBrace', floatCatch: 'floatBrace', nbp: 'floatBrace', sitChair: 'sitChair' };

// --- moving them ----------------------------------------------------------------------------------------------------

/** What the whole crew answers to: a brace call (`crewBrace`, from the bus) and the last hit (`crewJolt`). */
const STATE = { brace: false, jolt: null, n: 0 };
export function crewBrace(on) {
  STATE.brace = !!on;
}
/** A hit's kick (integrity.mjs `impact` on the bus: `at` and `dir` in the ship's frame, `kind`). */
export function crewJolt({ at, dir, kind }) {
  STATE.jolt = { at: new THREE.Vector3().copy(at), dir: new THREE.Vector3().copy(dir), size: kind === 'kick' ? 1 : kind === 'shell' ? 0.35 : 0.15 };
  STATE.n++;
}

/** The body's centre over the feet, where a weightless crew member turns (`m.lean`, crew.mjs). */
export const HC = 0.95;
/** How the crew get about weightless (`floatStep`): a push off (`push` s), a glide at `glide` m/s head first and up
 *  off the deck (`y`, the body's centre), a catch over the last `catch` m, then a hold (`touch` s between the strokes
 *  of a long way, `rest` at a stop on their round). A way longer than `stroke` m is taken in strokes. Upright holding on,
 *  the body is `hold` m off the deck, a little bent over (`holdPitch`). */
const TRAVEL = { y: 1.25, glide: 1.1, push: 0.7, catch: 1.3, stroke: 6, touch: [0.5, 0.9], rest: [1.6, 3.4], turn: 2.2, hold: 0.22, holdPitch: -8, glidePitch: -80, catchPitch: -30 };

/** Makes crew member `m` weightless if `room` floats: its poses become `FLOATING`'s, and it moves by `floatStep`. */
export function floatIn(m, room) {
  m.float = !!room?.float;
  m.room = room;
  m.att = { pitch: 0, y: HC, kick: new THREE.Vector3(), kv: new THREE.Vector3(), n: STATE.n };
  m.fv = 0;
  m.go = null; // a way being travelled: { phase, t, wait, sub, v }
}

const smooth = (k) => k * k * (3 - 2 * k);
const _to = new THREE.Vector3();

/** Each frame for a weightless crew member: their clip (braced or not), a way travelled push by push along their
 *  route, settling into their work at its end, and the kick of a hit. */
export function floatStep(m, dt) {
  const A = m.att, root = m.root;
  const base = FLOATING[m.pose] ?? m.pose;
  const moving = m.route && !(m.once && m.arrived);
  // A brace: a traveller stops and gets to the nearest wall; everyone holds on hard.
  if (STATE.brace && moving && !m.wall) m.wall = wallPoint(m);
  if (!STATE.brace) m.wall = null;
  let pitch = 0, y = HC;
  if (STATE.brace) m.clip(BRACED[moving ? 'floatHold' : base] ?? base, 0.25);
  if (m.wall) {
    _v.subVectors(m.wall, root.position).setY(0);
    const d = _v.length();
    if (d > 0.02) root.position.addScaledVector(_v.normalize(), Math.min(d, dt * 1.2));
    m.go = null;
    m.fv = 0;
  } else if (moving) {
    [pitch, y] = travel(m, dt);
  } else if (m.settle > 0) {
    // At the end of the way: from holding on, down into the foot rail and into their work.
    m.settle = Math.max(0, m.settle - dt);
    const k = smooth(1 - m.settle / 1.2);
    pitch = TRAVEL.holdPitch * D * (1 - k);
    y = HC + TRAVEL.hold * (1 - k);
    if (!STATE.brace) m.clip(base, 1);
  } else if (!STATE.brace) m.clip(base);
  A.pitch += (pitch - A.pitch) * Math.min(1, dt * 2.4);
  A.y += (y - A.y) * Math.min(1, dt * 2.4);
  // A hit: the structure jumps along the blast and the body, held only by a hand or the feet, lags and swings back.
  if (STATE.n !== A.n) {
    A.n = STATE.n;
    const J = STATE.jolt;
    if (J) {
      const near = J.size / (1 + root.position.distanceTo(J.at) / 40);
      A.kv.addScaledVector(_v.copy(J.dir).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -root.rotation.y), -near * (m.strapped || m.pose === 'sitChair' ? 0.4 : 2.2));
    }
  }
  A.kv.addScaledVector(A.kick, -60 * dt).multiplyScalar(Math.max(0, 1 - 7 * dt));
  A.kick.addScaledVector(A.kv, dt);
  m.lean.position.set(A.kick.x, A.y + A.kick.y * 0.5, A.kick.z);
  m.lean.rotation.x = A.pitch + A.kick.z * 0.4;
  m.lean.rotation.z = -A.kick.x * 0.4;
}

/** One frame along a route: hold → push → glide → catch → hold. Returns the body's [pitch, centre height]. */
function travel(m, dt) {
  const root = m.root, T = TRAVEL, hurry = m.hurry ?? 1;
  const rnd = (r) => r[0] + Math.random() * (r[1] - r[0]);
  const g = (m.go ??= { phase: 'hold', t: 0, wait: rnd(T.touch), sub: null, v: 0 });
  g.t += dt;
  const goal = m.route[m.leg];
  // Where this stroke ends: the route's next point, or `stroke` metres on toward it.
  if (!g.sub) {
    _to.subVectors(goal, root.position).setY(0);
    const d = _to.length();
    g.sub = d > T.stroke * 1.3 ? root.position.clone().addScaledVector(_to.normalize(), T.stroke) : goal.clone();
    g.last = g.sub.distanceToSquared(goal) < 1e-4;
  }
  _to.subVectors(g.sub, root.position).setY(0);
  const d = _to.length();
  // Face the way (they turn while holding on, and hold the line while they glide).
  if (d > 0.05) {
    let turn = Math.atan2(-_to.x, -_to.z) - root.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    root.rotation.y += Math.sign(turn) * Math.min(Math.abs(turn), dt * T.turn * (g.phase === 'hold' ? 1 : 0.4));
    g.turn = Math.abs(turn);
  }
  const glide = T.glide * hurry;
  if (g.phase === 'hold') {
    if (!STATE.brace) m.clip('floatHold', 0.5);
    g.v = 0;
    if (g.t >= g.wait && (g.turn ?? 0) < 0.35 && d > 0.2) (g.phase = 'push'), (g.t = 0), STATE.brace || m.clip('floatPush', 0.25);
    if (d <= 0.2) arrive(m, g, rnd);
    return [T.holdPitch * D, HC + T.hold];
  }
  if (g.phase === 'push') {
    const k = Math.min(1, g.t / T.push);
    g.v = glide * smooth(k);
    if (k >= 1) g.phase = 'glide';
  } else if (g.phase === 'glide') {
    if (!STATE.brace) m.clip('floatGlide', 0.45);
    g.v = glide;
    if (d < T.catch) g.phase = 'catch';
  } else if (g.phase === 'catch') {
    if (!STATE.brace) m.clip('floatCatch', 0.4);
    g.v = Math.max(0.12, glide * (d / T.catch));
  }
  root.position.addScaledVector(_to.normalize(), Math.min(d, g.v * dt));
  if (g.phase !== 'push' && d - g.v * dt <= 0.05) {
    g.phase = 'hold';
    g.t = 0;
    arrive(m, g, rnd);
  }
  // The body: laid out by the end of the push, coming up as they catch.
  const k = g.phase === 'push' ? smooth(Math.min(1, g.t / T.push)) : 1;
  const pitch = g.phase === 'catch' ? T.catchPitch + (T.glidePitch - T.catchPitch) * Math.min(1, d / T.catch) : T.holdPitch + (T.glidePitch - T.holdPitch) * k;
  const y = HC + T.hold + (T.y - HC - T.hold) * (g.phase === 'catch' ? Math.min(1, d / T.catch) : k);
  return [pitch * D, y];
}

/** The end of a stroke: on along the way (a touch and on), or at a point of the route (a rest, the next leg), or at
 *  the end of a `once` route (into their work: `settle`). */
function arrive(m, g, rnd) {
  g.t = 0;
  const end = g.last;
  g.sub = null;
  if (!end) return void (g.wait = rnd(TRAVEL.touch));
  if (m.once && m.leg === m.route.length - 1) {
    m.arrived = true;
    m.go = null;
    m.settle = 1.2;
    m.play(m.restPose ?? 'idle', 1);
    return;
  }
  m.leg = (m.leg + 1) % m.route.length;
  g.wait = rnd(TRAVEL.rest);
}

/** A portable foot restraint for crew member `m` standing at work where there is no foot rail (the airless hangar):
 *  a short post clamped to the deck (or the gangway's grating) with a plate on top and two toe loops, their feet in
 *  it. Lifts them onto it. */
const PFR = { post: new THREE.MeshLambertMaterial({ color: '#3a4048' }), plate: new THREE.MeshLambertMaterial({ color: '#d8a530' }), loop: new THREE.MeshLambertMaterial({ color: '#202428' }) };
export function footRestraint(m, h = 0.38) {
  const g = new THREE.Group();
  const add = (w, hh, d, mat, x, y, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
    b.position.set(x, y, z);
    g.add(b);
  };
  add(0.12, h - 0.04, 0.12, PFR.post, 0, -(h + 0.04) / 2, 0);
  add(0.36, 0.03, 0.36, PFR.post, 0, -h + 0.015, 0);
  add(0.5, 0.04, 0.42, PFR.plate, 0, -0.02, 0);
  for (const x of [-0.12, 0.12]) add(0.13, 0.05, 0.05, PFR.loop, x, 0.03, -0.1);
  m.root.add(g);
  m.root.position.y += h;
  m.footPlate = g;
}

/** The nearest point a little in from a wall of the room they are in, to hold on at in a brace. */
function wallPoint(m) {
  const r = m.room, p = m.root.position;
  if (!r?.x || !r?.z) return p.clone();
  const c = [
    [p.x - r.x[0], new THREE.Vector3(r.x[0] + 0.45, p.y, p.z)],
    [r.x[1] - p.x, new THREE.Vector3(r.x[1] - 0.45, p.y, p.z)],
    [p.z - r.z[0], new THREE.Vector3(p.x, p.y, r.z[0] + 0.45)],
    [r.z[1] - p.z, new THREE.Vector3(p.x, p.y, r.z[1] - 0.45)]
  ].sort((a, b) => a[0] - b[0]);
  return c[0][1];
}

// --- couches --------------------------------------------------------------------------------------------------------

/** An acceleration couch on its gimbal (sets/parts.mjs `couch`, placed): when the drive burns (`C.push`, m/s², set by
 *  main.mjs each frame) it swings round to face the bow, so its back takes the push; when she coasts it swings back to
 *  its console. Its meshes are merged first, so it stays a few draw calls. */
export function gimbal(C, couch, bake) {
  bake?.(couch);
  couch.userData.live = true;
  const rest = couch.rotation.y;
  (C.anim ??= []).push((dt) => {
    const want = (C.push ?? 0) > 0.3 ? 0 : rest;
    let d = want - couch.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 1e-4) couch.rotation.y += Math.sign(d) * Math.min(Math.abs(d), dt * 0.9);
  });
}
