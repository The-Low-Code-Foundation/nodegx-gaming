// What is in a Sim's hands, on the table and on the hob (round 10, the playtesters' realism list: "the avatar has nothing in
// her hands", "eating animation is weird"), the eating motion, and the parts of things that move while used (the
// fridge door, the TV picture, the shower water: world.mjs `moving`).
//
// An offer says what shows (actions.mjs): `hand` (in the right hand), `table` (on the table in front of a Sim who sits,
// or on top of the thing they stand at), `steps` (one action in parts: open the fridge, then eat what came out of it).
// Life (life.mjs) says what each Sim is showing now (`showing`); this file draws it.
import * as THREE from 'three';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
const mesh = (geometry, material, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
};
const group = (...children) => {
  const g = new THREE.Group();
  g.add(...children);
  return g;
};
const M = {
  steel: std(0xc8ccd2, { metalness: 0.7, roughness: 0.3 }),
  white: std(0xfbfbf8, { roughness: 0.35 }),
  bread: std(0xe7c27d),
  crust: std(0xc98a3c),
  lettuce: std(0x6cbf4f),
  tomato: std(0xd9433b),
  cheese: std(0xf6d24a),
  juice: std(0xf29a1e, { transparent: true, opacity: 0.85 }),
  glass: std(0xdff2fb, { transparent: true, opacity: 0.35, roughness: 0.1 }),
  cocoa: std(0x6b3f22),
  mug: std(0xd8574a),
  phone: std(0x1c1e22, { roughness: 0.3 }),
  screen: new THREE.MeshBasicMaterial({ color: 0x6fb7ff }),
  cover: std(0x2f6fd0),
  pages: std(0xfff8e8, { roughness: 0.9 }),
  pan: std(0x2a2b2e, { metalness: 0.4, roughness: 0.4 }),
  stew: std(0xc8662e),
  pizza: std(0xf2c14e),
  pepperoni: std(0xb83a2a),
  teat: std(0xe8c48a, { roughness: 0.7 }),
  teatRing: std(0x7fb8e8),
  skin: std(0xf1c6a8, { roughness: 0.6 }),
  cheek: std(0xf2a0a0, { roughness: 0.7 }),
  eye: std(0x2a2020),
  mouth: std(0xd06a72),
  sponge: std(0xe8c48a, { roughness: 0.8 }),
  icing: std(0xf7c6d9, { roughness: 0.4 }),
  candle: std(0x7fb8e8),
  flame: new THREE.MeshBasicMaterial({ color: 0xffc94a })
};

// Each prop in metres, made to sit in a right hand whose palm faces the body's middle: its origin is where the fingers
// close round it. `hold` places it in the hand bone's own frame (tuned by eye on round 10's shots).
const PROPS = {
  fork: () => group(mesh(new THREE.BoxGeometry(0.016, 0.006, 0.11), M.steel, [0, 0, 0.02]), mesh(new THREE.BoxGeometry(0.03, 0.006, 0.035), M.steel, [0, 0, 0.09]), mesh(new THREE.SphereGeometry(0.024, 10, 8), M.stew, [0, 0.012, 0.1])),
  sandwich: () => group(mesh(new THREE.BoxGeometry(0.1, 0.012, 0.09), M.bread, [0, -0.02, 0.04]), mesh(new THREE.BoxGeometry(0.104, 0.008, 0.094), M.lettuce, [0, -0.01, 0.04]), mesh(new THREE.BoxGeometry(0.1, 0.006, 0.09), M.tomato, [0, -0.003, 0.04]), mesh(new THREE.BoxGeometry(0.1, 0.012, 0.09), M.bread, [0, 0.007, 0.04])),
  glass: () => group(mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.11, 14), M.glass), mesh(new THREE.CylinderGeometry(0.028, 0.025, 0.08, 14), M.juice, [0, -0.012, 0])),
  mug: () => group(mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 14), M.mug), mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.005, 14), M.cocoa, [0, 0.043, 0]), mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 12), M.mug, [0.045, 0, 0], [0, 0, Math.PI / 2])),
  phone: () => group(mesh(new THREE.BoxGeometry(0.07, 0.008, 0.145), M.phone), mesh(new THREE.PlaneGeometry(0.062, 0.13), M.screen, [0, 0.0045, 0], [-Math.PI / 2, 0, 0])),
  // Open, its spine along Z, the pages up (+Y) in a shallow V.
  book: () => group(
    mesh(new THREE.BoxGeometry(0.12, 0.014, 0.17), M.pages, [-0.062, 0.012, 0], [0, 0, 0.14]), mesh(new THREE.BoxGeometry(0.12, 0.014, 0.17), M.pages, [0.062, 0.012, 0], [0, 0, -0.14]),
    mesh(new THREE.BoxGeometry(0.13, 0.004, 0.18), M.cover, [-0.065, 0.002, 0], [0, 0, 0.14]), mesh(new THREE.BoxGeometry(0.13, 0.004, 0.18), M.cover, [0.065, 0.002, 0], [0, 0, -0.14])
  ),
  // A slice of bread to feed the ducks with (round 11).
  bread: () => group(mesh(new THREE.BoxGeometry(0.1, 0.014, 0.1), M.bread, [0, 0, 0.04]), mesh(new THREE.BoxGeometry(0.104, 0.016, 0.012), M.crust, [0, 0, 0.094]), mesh(new THREE.BoxGeometry(0.012, 0.016, 0.1), M.crust, [0.05, 0, 0.04]), mesh(new THREE.BoxGeometry(0.012, 0.016, 0.1), M.crust, [-0.05, 0, 0.04])),
  pizzaSlice: () => {
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-0.06, 0.16), new THREE.Vector2(0.06, 0.16)]);
    const slice = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false }), M.pizza, [0, 0, 0], [Math.PI / 2, 0, 0]);
    return group(slice, mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 10), M.pepperoni, [0, 0.003, 0.08]), mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), M.crust, [0, -0.004, 0.16]));
  },
  // On a table or a hob.
  plate: () => group(mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.015, 24), M.white), mesh(new THREE.SphereGeometry(0.06, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.stew, [0, 0.008, 0]), mesh(new THREE.SphereGeometry(0.03, 10, 8), M.lettuce, [0.05, 0.015, 0.03])),
  pizzaPlate: () => group(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 24), M.crust), mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.014, 24), M.pizza, [0, 0.004, 0]), ...[[0.05, 0.03], [-0.06, 0.04], [0.02, -0.07], [-0.03, -0.02]].map(([x, z]) => mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.016, 10), M.pepperoni, [x, 0.006, z]))),
  // A birthday cake (round 16, phase 6.2): pink icing, three candles lit.
  cakePlate: () => group(
    mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.015, 24), M.white), mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 24), M.sponge, [0, 0.042, 0]), mesh(new THREE.CylinderGeometry(0.113, 0.113, 0.02, 24), M.icing, [0, 0.085, 0]),
    ...[[0.04, 0], [-0.02, 0.035], [-0.02, -0.035]].flatMap(([x, z]) => [mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), M.candle, [x, 0.12, z]), mesh(new THREE.SphereGeometry(0.009, 8, 6), M.flame, [x, 0.152, z])])
  ),
  // A baby's bottle of milk (round 12).
  bottle: () => group(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 14), M.glass), mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 14), M.white, [0, -0.015, 0]), mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), M.teatRing, [0, 0.065, 0]), mesh(new THREE.ConeGeometry(0.014, 0.035, 10), M.teat, [0, 0.09, 0])),
  // A baby (round 12, baby.mjs): wrapped in a blanket of `colour` with a hood, lying on their back, along X with the
  // head at +X and the face up (+Y). `userData.face(state)`: 'awake' | 'asleep' | 'crying'.
  baby: (colour = '#f4b6c8') => {
    const wrap = std(new THREE.Color(colour), { roughness: 0.85 });
    const body = mesh(new THREE.CapsuleGeometry(0.095, 0.22, 6, 14), wrap, [-0.02, 0, 0], [0, 0, Math.PI / 2]);
    const head = mesh(new THREE.SphereGeometry(0.075, 18, 14), M.skin, [0.2, 0.025, 0]);
    // The hood: the lower part of a sphere round the head, so the face looks out of it.
    const hood = mesh(new THREE.SphereGeometry(0.09, 18, 12, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.68), wrap, [0.205, 0.02, 0], [0, 0, -0.5]);
    const eyes = [-1, 1].map((s) => mesh(new THREE.SphereGeometry(0.009, 8, 6), M.eye, [0.222, 0.092, s * 0.026]));
    const shut = [-1, 1].map((s) => mesh(new THREE.BoxGeometry(0.004, 0.003, 0.02), M.eye, [0.222, 0.098, s * 0.026]));
    const cheeks = [-1, 1].map((s) => mesh(new THREE.SphereGeometry(0.014, 8, 6), M.cheek, [0.19, 0.088, s * 0.044]));
    const mouth = mesh(new THREE.SphereGeometry(0.008, 8, 6), M.mouth, [0.168, 0.094, 0]);
    const g = group(body, head, hood, mouth, ...eyes, ...shut, ...cheeks);
    g.userData.face = (state) => {
      for (const e of eyes) e.visible = state === 'awake';
      for (const e of shut) e.visible = state !== 'awake';
      mouth.scale.set(state === 'crying' ? 1.8 : 1, 1, state === 'crying' ? 1.6 : 1);
    };
    g.userData.face('awake');
    return g;
  },
  pan: () => group(mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.06, 20, 1, true), M.pan, [0, 0.03, 0]), mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.008, 20), M.pan, [0, 0.004, 0]), mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.01, 20), M.stew, [0, 0.035, 0]), mesh(new THREE.BoxGeometry(0.22, 0.015, 0.03), M.pan, [0.22, 0.05, 0]))
};
// How each sits in the hand: [x, y, z] metres and [rx, ry, rz] radians in the right hand bone's own frame. Measured on
// a Rocketbox Biped (round 10, tests/r10/probe-axes.json): +X runs along the fingers, +Y comes out of the palm, +Z
// points along the thumb. So a cup's axis (its +Y) turns onto +Z; a phone or a book lies on the palm, screen or pages
// up (+Y), its length along the fingers.
const HOLD = {
  fork: [[0.075, 0.03, -0.02], [0, 0, 0]],
  sandwich: [[0.09, 0.035, -0.04], [0, 0, 0]],
  glass: [[0.075, 0.045, 0], [Math.PI / 2, 0, 0]],
  mug: [[0.075, 0.05, 0], [Math.PI / 2, 0, 0]],
  phone: [[0.075, 0.015, 0], [0, Math.PI / 2, 0]],
  book: [[0.08, 0.03, 0.03], [0, Math.PI / 2, 0]],
  pizzaSlice: [[0.08, 0.03, -0.02], [0, 0, 0]],
  bread: [[0.09, 0.03, -0.04], [0, 0, 0]],
  bottle: [[0.075, 0.045, 0], [Math.PI / 2, 0, 0]],
  baby: [[0.06, 0.1, 0.06], [0, 0, 0]]
};
export const PROP_NAMES = Object.keys(PROPS);
// `name` may carry one setting after a colon: 'baby:#f4b6c8' is a baby in a pink blanket.
const split = (name) => name.split(':');
export const makeProp = (name) => PROPS[split(name)[0]]?.(split(name)[1]) ?? null;

// The eating motion (Rocketbox has no eating clip among its 471): sitting at a table (mc_sitTable), the right arm taken
// from drinking (mc_drink), which brings the hand up to the mouth and down again. One cycle is the drink's length.
const RIGHT_ARM = /^ls_right(Shoulder|UpperArm|LowerArm|Hand|Middle)\./;
export function ensureEatClip(clips) {
  if (clips.mc_eat || !clips.mc_sitTable || !clips.mc_drink) return !!clips.mc_eat;
  const sit = clips.mc_sitTable, drink = clips.mc_drink;
  const tracks = [...sit.tracks.filter((t) => !RIGHT_ARM.test(t.name)).map((t) => t.clone().trim(0, drink.duration)), ...drink.tracks.filter((t) => RIGHT_ARM.test(t.name)).map((t) => t.clone())];
  clips.mc_eat = new THREE.AnimationClip('mc_eat', drink.duration, tracks);
  return true;
}

// Draws what every Sim is showing, and runs the moving parts of the place in view.
export class Props {
  constructor(scene) {
    this.scene = scene;
    this.held = new Map(); // life → { name, object }
    this.placed = new Map(); // life → { name, object, key }
  }

  update(everyone, view, dt) {
    for (const l of everyone) {
      ensureEatClip(l.sim.body.clips);
      const s = l.present && l.place === view ? l.showing : null;
      this.hold(l, s?.hand ?? null);
      this.put(l, s?.table ? s : null);
    }
    for (const m of view.moving) m.update(dt, everyone.some((l) => l.present && l.place === view && on(l.showing, m)));
  }

  hold(l, name) {
    const now = this.held.get(l);
    if ((now?.name ?? null) === name) return;
    now?.object.removeFromParent();
    this.held.delete(l);
    if (!name) return;
    const hand = l.sim.body.outer.getObjectByName('ls_rightHand');
    const object = makeProp(name);
    if (!hand || !object) return;
    const [[x, y, z], [rx, ry, rz]] = HOLD[split(name)[0]] ?? [[0.08, 0, 0.04], [0, 0, 0]];
    // The bone is in the model's units (centimetres scaled down): undo its scale so the prop stays in metres.
    l.sim.body.outer.updateMatrixWorld(true);
    const k = 1 / hand.getWorldScale(new THREE.Vector3()).x;
    const holder = new THREE.Group();
    holder.scale.setScalar(k);
    holder.add(object);
    object.position.set(x, y, z);
    object.rotation.set(rx, ry, rz);
    hand.add(holder);
    this.held.set(l, { name, object: holder });
  }

  // On the table in front of a Sim who sits (their plate), or on top of the thing they stand at (the pan on the hob).
  put(l, s) {
    const key = s ? `${s.table}|${s.offer}` : null;
    const now = this.placed.get(l);
    if ((now?.key ?? null) === key) return;
    now?.object.removeFromParent();
    this.placed.delete(l);
    if (!s) return;
    const object = makeProp(s.table);
    if (!object) return;
    const sim = l.sim, item = s.item;
    if (s.sits) {
      const fwd = new THREE.Vector3(Math.sin(sim.group.rotation.y), 0, Math.cos(sim.group.rotation.y));
      // Where they stand to sit is already at the table's edge (the chair is behind them): just past it.
      object.position.copy(sim.position).addScaledVector(fwd, 0.16).setY(0.765);
    } else if (item) {
      const c = item.footprint.getCenter(new THREE.Vector3());
      object.position.set(c.x, item.footprint.max.y + 0.002, c.z);
      object.rotation.y = item.obj.rotation.y;
    }
    this.scene.add(object);
    this.placed.set(l, { key, object });
  }
}

// Is this moving part on for what a Sim is showing? The fridge door while they take something out; the TV while they
// watch it (from the couch: any TV in the place); the water while they shower.
function on(s, m) {
  if (!s) return false;
  if (m.kind === 'fridge') return s.item === m.item && s.open;
  if (m.kind === 'tv') return s.offer === 'tv';
  if (m.kind === 'shower') return s.item === m.item && s.offer === 'shower';
  if (m.kind === 'ducks') return s.item === m.item;
  return false;
}

// Wedding clothes (round 12, the brief, 10-31: "a girl character wears a nice white wedding dress and the guy a suit and
// they kiss and then boom they're married and back to original clothes"). None of the twelve people wears a dress, so
// the page recolours their own outfit (white for a bride, a dark suit for a groom: looks.mjs) and this adds what the
// outfit can't be: a long white skirt and sash, a veil and a crown of flowers; a bow tie and a white rose. Worn only
// for the ceremony, standing still: each piece is placed round the body as it stands, then hung on the bone it moves
// with (`attach` keeps where it is). `wear(sim, 'bride' | 'groom')` → a function that takes it all off again.
const W = {
  satin: std(0xfbf8f2, { roughness: 0.42, side: THREE.DoubleSide }),
  sash: std(0xe8d6a8, { roughness: 0.4, metalness: 0.2 }),
  veil: std(0xffffff, { roughness: 0.6, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }),
  shirt: std(0xf7f7f4, { roughness: 0.6, side: THREE.DoubleSide }),
  petal: std(0xffffff, { roughness: 0.7 }),
  pink: std(0xf2a6c0, { roughness: 0.7 }),
  leaf: std(0x6ca05a, { roughness: 0.7 }),
  tie: std(0x15181f, { roughness: 0.5 })
};
const flower = (petal, r = 0.016) => group(mesh(new THREE.SphereGeometry(r, 10, 8), petal), ...[0, 1, 2, 3, 4].map((k) => mesh(new THREE.SphereGeometry(r * 0.7, 8, 6), petal, [Math.cos(k * 1.26) * r * 0.9, -r * 0.2, Math.sin(k * 1.26) * r * 0.9])));
export function wear(sim, kind) {
  const outer = sim.body.outer;
  sim.group.updateMatrixWorld(true);
  const bone = (...names) => names.map((n) => outer.getObjectByName(n)).find(Boolean) ?? outer;
  const at = (b) => b.getWorldPosition(new THREE.Vector3());
  const turn = sim.group.rotation.y, fwd = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn)), side = new THREE.Vector3(Math.cos(turn), 0, -Math.sin(turn));
  const head = bone('ls_head'), chest = bone('ls_upperChest', 'ls_chest', 'ls_spine'), hips = bone('ls_hips', 'ls_root');
  const h = at(head), base = sim.position;
  const pieces = [];
  const hang = (object, on, where, rotY = turn) => {
    object.position.copy(where);
    object.rotation.y = rotY;
    object.updateMatrixWorld(true);
    on.attach(object);
    pieces.push(object);
  };
  if (kind === 'bride') {
    // The skirt: from the waist (above the hips) to the floor, close at the top and flaring out below: an A-line, oval
    // (a body is narrower front to back than side to side), so it neither stands off the hips nor runs into the other.
    const top = at(hips).y + 0.2;
    const profile = Array.from({ length: 14 }, (_, k) => {
      const f = k / 13;
      return new THREE.Vector2(0.135 + 0.06 * Math.min(1, f * 4) + 0.24 * f ** 1.8, top - f * (top - 0.02));
    });
    const skirt = group(mesh(new THREE.LatheGeometry(profile, 40), W.satin), mesh(new THREE.TorusGeometry(0.14, 0.018, 8, 32), W.sash, [0, top - 0.01, 0], [Math.PI / 2, 0, 0]));
    skirt.scale.set(1, 1, 0.78);
    hang(skirt, hips, new THREE.Vector3(base.x, 0, base.z));
    // The veil down the back of the head, and the crown of flowers.
    const veil = mesh(new THREE.SphereGeometry(0.13, 24, 12, 0, Math.PI, 0.25, 1.75), W.veil, [0, 0, 0], [0, Math.PI, 0]);
    veil.scale.set(1.15, 2.6, 1.1);
    veil.position.y = -0.12;
    const crown = group(...Array.from({ length: 10 }, (_, k) => {
      const a = (k / 10) * Math.PI * 2, f = flower(k % 3 === 1 ? W.pink : W.petal);
      f.position.set(Math.cos(a) * 0.085, 0, Math.sin(a) * 0.085);
      return f;
    }));
    crown.position.y = 0.06;
    hang(group(veil, crown), head, h.clone().addScaledVector(UP, 0.1).addScaledVector(fwd, -0.01));
  } else {
    // A white shirt front under a bow tie at the collar, a white rose on the lapel.
    const v = new THREE.Shape([new THREE.Vector2(-0.065, 0), new THREE.Vector2(0.065, 0), new THREE.Vector2(0, -0.22)]);
    const front = mesh(new THREE.ShapeGeometry(v), W.shirt, [0, 0, 0], [-0.12, 0, 0]);
    hang(front, chest, h.clone().addScaledVector(UP, -0.16).addScaledVector(fwd, 0.105));
    const tie = group(mesh(new THREE.ConeGeometry(0.025, 0.05, 8), W.tie, [0.024, 0, 0], [0, 0, Math.PI / 2]), mesh(new THREE.ConeGeometry(0.025, 0.05, 8), W.tie, [-0.024, 0, 0], [0, 0, -Math.PI / 2]), mesh(new THREE.SphereGeometry(0.01, 8, 6), W.tie));
    hang(tie, chest, h.clone().addScaledVector(UP, -0.17).addScaledVector(fwd, 0.115));
    const rose = group(flower(W.petal, 0.02), mesh(new THREE.SphereGeometry(0.014, 6, 4), W.leaf, [0.01, -0.02, 0]));
    hang(rose, chest, h.clone().addScaledVector(UP, -0.3).addScaledVector(fwd, 0.11).addScaledVector(side, 0.09));
  }
  return () => pieces.forEach((p) => p.removeFromParent());
}
const UP = new THREE.Vector3(0, 1, 0);
