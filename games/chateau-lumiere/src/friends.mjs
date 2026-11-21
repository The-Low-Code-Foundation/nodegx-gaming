// The castle's friends from round 2, drawn in code (SCOPE.md §8: "mini-games with funny castle characters"):
//   makeOwl()        Archivist Hoot, the Library's owl, in round spectacles (the reading nook)
//   makeFrog()       Maestro Fig, the Music Room's frog in a tailcoat, with a baton (the piano)
//   makeButterfly()  Madame Lune, the moonlight butterfly the Midnight Moth Queen turns back into (the ball)
// Each returns { group, update(dt, t), mood(name) }: `group` stands on its origin and faces +Z; `mood('happy')` makes
// it bounce (a right answer, a finished tune), `mood('think')` tilts its head, anything else is calm.
import * as THREE from 'three';
import { canvasTexture, glow } from './look.mjs';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
function sphere(r, mat, x = 0, y = 0, z = 0, parent, seg = 20) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent?.add(m);
  return m;
}
// An eye that looks about and blinks: a white ball, an iris, a pupil, a glint, and a lid that closes over it.
function eye(r, iris, parent, x, y, z, lidColour) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  sphere(r, std(0xffffff, { roughness: 0.25 }), 0, 0, 0, g);
  const look = new THREE.Group();
  g.add(look);
  const ir = sphere(r * 0.62, std(iris, { roughness: 0.3, emissive: iris, emissiveIntensity: 0.15 }), 0, 0, r * 0.52, look);
  ir.scale.z = 0.5;
  const pu = sphere(r * 0.34, std(0x120c10, { roughness: 0.2 }), 0, 0, r * 0.74, look);
  pu.scale.z = 0.5;
  sphere(r * 0.12, new THREE.MeshBasicMaterial({ color: 0xffffff }), r * 0.18, r * 0.2, r * 0.9, look, 8);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.06, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(lidColour));
  lid.rotation.x = -Math.PI / 2 + 0.2;
  lid.scale.setScalar(1);
  g.add(lid);
  return { g, look, lid };
}

// Blinking and glancing, shared by all three.
function blinker(eyes) {
  let next = 1.5, shut = 0, gaze = 0;
  return (dt, t) => {
    next -= dt;
    if (next < 0) {
      shut = 0.14;
      next = 2 + Math.random() * 3;
    }
    shut = Math.max(0, shut - dt);
    const closed = shut > 0 ? Math.sin((shut / 0.14) * Math.PI) : 0;
    gaze += dt;
    const gx = Math.sin(t * 0.7) * 0.25, gy = Math.sin(t * 0.45 + 1) * 0.12;
    for (const e of eyes) {
      e.lid.rotation.x = -Math.PI / 2 + 0.2 + closed * 1.9;
      e.look.rotation.set(gy, gx, 0);
    }
  };
}

// ── Archivist Hoot ────────────────────────────────────────────────────────────────────────────────────────────────
const featherTex = () =>
  canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#a07a58';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 9; x++) {
        g.fillStyle = (x + y) % 2 ? '#8a6446' : '#b48c68';
        g.beginPath();
        g.arc(x * 16 + (y % 2) * 8, y * 16, 9, 0, Math.PI);
        g.fill();
      }
  });
export function makeOwl() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const brown = std(0xffffff, { map: featherTex(), roughness: 0.85 });
  const cream = std(0xf4e2c4, { roughness: 0.85 });
  const orange = std(0xf0a040, { roughness: 0.5 });
  const torso = sphere(0.17, brown, 0, 0.19, 0, body);
  torso.scale.set(1, 1.2, 0.95);
  const belly = sphere(0.13, cream, 0, 0.17, 0.07, body);
  belly.scale.set(1, 1.2, 0.6);
  const head = new THREE.Group();
  head.position.y = 0.4;
  body.add(head);
  const skull = sphere(0.15, brown, 0, 0, 0, head);
  skull.scale.set(1.12, 0.95, 0.95);
  for (const s of [-1, 1]) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), cream);
    disc.position.set(s * 0.062, 0.0, 0.135);
    disc.rotation.y = s * 0.25;
    head.add(disc);
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 8), brown);
    tuft.position.set(s * 0.11, 0.15, 0);
    tuft.rotation.z = -s * 0.45;
    head.add(tuft);
    const wing = sphere(0.12, brown, s * 0.16, 0.2, -0.01, body);
    wing.scale.set(0.35, 1.1, 0.85);
    wing.name = s < 0 ? 'wingL' : 'wingR';
    for (const t of [-1, 0, 1]) {
      const toe = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.04, 4, 6), orange);
      toe.rotation.x = Math.PI / 2;
      toe.position.set(s * 0.06 + t * 0.02, 0.012, 0.06);
      body.add(toe);
    }
  }
  const eyes = [-1, 1].map((s) => eye(0.045, 0xf2a019, head, s * 0.062, 0.005, 0.12, 0x9a7454));
  // Round gold spectacles: he is the archivist.
  const goldM = std(0xf3cf6b, { metalness: 0.85, roughness: 0.3 });
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.006, 6, 24), goldM);
    rim.position.set(s * 0.062, 0.005, 0.175);
    head.add(rim);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6), goldM);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, 0.02, 0.178);
  head.add(bridge);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 8), orange);
  beak.rotation.x = Math.PI / 2 + 0.6;
  beak.position.set(0, -0.045, 0.16);
  head.add(beak);
  const wings = ['wingL', 'wingR'].map((n) => body.getObjectByName(n));
  const blink = blinker(eyes);
  let mood = 'calm', moodT = 0;
  return {
    group,
    mood(m) {
      mood = m;
      moodT = 0;
    },
    update(dt, t) {
      blink(dt, t);
      moodT += dt;
      const happy = mood === 'happy' && moodT < 1.6;
      body.position.y = happy ? Math.abs(Math.sin(moodT * 9)) * 0.06 : 0;
      for (const [i, w] of wings.entries()) w.rotation.z = (i ? -1 : 1) * (happy ? 0.3 + Math.sin(moodT * 22) * 0.5 : Math.sin(t * 1.3) * 0.03);
      // An owl turns its head about, now and then all the way to one side.
      head.rotation.z = mood === 'think' ? 0.35 : Math.sin(t * 0.6) * 0.08;
      head.rotation.y = Math.sin(t * 0.33) * 0.5 * Math.max(0, Math.sin(t * 0.21));
      body.scale.y = 1 + Math.sin(t * 2) * 0.012;
    }
  };
}

// ── Maestro Fig ───────────────────────────────────────────────────────────────────────────────────────────────────
export function makeFrog() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const green = std(0x6cc24a, { roughness: 0.45 });
  const pale = std(0xd8f0a0, { roughness: 0.5 });
  const black = std(0x1a1622, { roughness: 0.55 });
  const white = std(0xffffff, { roughness: 0.6 });
  const torso = sphere(0.13, green, 0, 0.13, 0, body);
  torso.scale.set(1.15, 1, 0.95);
  const tum = sphere(0.1, white, 0, 0.12, 0.05, body);
  tum.scale.set(0.8, 1, 0.6);
  // The tailcoat: a black shell round the back, its tails hanging behind him.
  const coat = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 14, Math.PI * 0.25, Math.PI * 1.5), black);
  coat.position.y = 0.13;
  coat.scale.set(1.18, 1.03, 1);
  coat.rotation.y = Math.PI;
  body.add(coat);
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.015), black);
    tail.position.set(s * 0.04, 0.03, -0.13);
    tail.rotation.set(0.25, 0, s * 0.1);
    body.add(tail);
  }
  const head = new THREE.Group();
  head.position.y = 0.27;
  body.add(head);
  const skull = sphere(0.12, green, 0, 0, 0, head);
  skull.scale.set(1.3, 0.8, 1);
  const chin = sphere(0.1, pale, 0, -0.03, 0.04, head);
  chin.scale.set(1.3, 0.6, 0.9);
  const eyes = [-1, 1].map((s) => {
    const bulb = sphere(0.06, green, s * 0.085, 0.08, 0.02, head);
    return eye(0.048, 0xb88a2a, head, s * 0.085, 0.085, 0.045, 0x5aa83c);
  });
  // A wide smile.
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 6, 24, Math.PI * 0.8), std(0x2a4a20));
  smile.rotation.set(0, 0, Math.PI + Math.PI * 0.1);
  smile.position.set(0, 0.0, 0.105);
  smile.scale.y = 0.55;
  head.add(smile);
  // A red bow tie.
  const red = std(0xd8304a, { roughness: 0.45 });
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 4), red);
    wing.rotation.z = s * Math.PI / 2;
    wing.position.set(s * 0.025, 0.205, 0.11);
    body.add(wing);
  }
  sphere(0.014, red, 0, 0.205, 0.115, body, 8);
  // Legs folded under him, an arm holding the baton up.
  for (const s of [-1, 1]) {
    const thigh = sphere(0.06, green, s * 0.11, 0.05, 0.03, body);
    thigh.scale.set(0.8, 0.6, 1.3);
    const foot = sphere(0.035, green, s * 0.13, 0.01, 0.12, body);
    foot.scale.set(1.3, 0.35, 1.2);
  }
  const arm = new THREE.Group();
  arm.position.set(0.13, 0.17, 0.03);
  body.add(arm);
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.08, 4, 8), black);
  fore.position.y = 0.05;
  arm.add(fore);
  sphere(0.025, green, 0, 0.11, 0, arm, 10);
  const baton = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.16, 6), white);
  baton.position.set(0, 0.17, 0.03);
  baton.rotation.x = 0.4;
  arm.add(baton);
  const blink = blinker(eyes);
  let mood = 'calm', moodT = 0;
  return {
    group,
    mood(m) {
      mood = m;
      moodT = 0;
    },
    update(dt, t) {
      blink(dt, t);
      moodT += dt;
      const happy = mood === 'happy' && moodT < 1.8;
      // He conducts, all the time: a three-beat waltz with the baton.
      const beat = (t * 2.2) % 3;
      arm.rotation.z = -0.5 + Math.sin(t * 2.2 * Math.PI * (2 / 3)) * 0.35;
      arm.rotation.x = -0.2 + Math.cos(t * 2.2 * Math.PI * (2 / 3)) * 0.2;
      body.position.y = happy ? Math.abs(Math.sin(moodT * 8)) * 0.12 : beat < 0.15 ? 0.008 : 0;
      head.rotation.z = mood === 'think' ? -0.3 : Math.sin(t * 1.1) * 0.06;
      body.scale.set(1 + Math.sin(t * 3) * 0.015, 1 - Math.sin(t * 3) * 0.015, 1);
    }
  };
}

// ── Madame Lune ───────────────────────────────────────────────────────────────────────────────────────────────────
const wingTex = () =>
  canvasTexture(256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w * 0.15, h * 0.85, 10, w * 0.15, h * 0.85, w * 1.05);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, '#c8d8ff');
    grad.addColorStop(0.75, '#7a8af0');
    grad.addColorStop(1, '#2a2a80');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(w * 0.05, h * 0.95);
    g.bezierCurveTo(w * 0.1, h * 0.1, w * 0.9, -h * 0.05, w * 0.95, h * 0.35);
    g.bezierCurveTo(w, h * 0.7, w * 0.4, h * 0.85, w * 0.05, h * 0.95);
    g.fill();
    g.fillStyle = 'rgba(255, 245, 200, 0.95)';
    for (const [x, y, r] of [[0.62, 0.3, 14], [0.78, 0.42, 9], [0.45, 0.45, 7]]) {
      g.beginPath();
      g.arc(w * x, h * y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(w * 0.06, h * 0.94);
      g.lineTo(w * (0.4 + i * 0.12), h * (0.15 + i * 0.1));
      g.stroke();
    }
  });
export function makeButterfly() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.3;
  group.add(body);
  const tex = wingTex();
  const wm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.4, emissive: 0x8090ff, emissiveMap: tex, emissiveIntensity: 0.45 });
  const wings = [];
  for (const s of [-1, 1])
    for (const [up, size] of [[1, 0.5], [-1, 0.34]]) {
      const pivot = new THREE.Group();
      body.add(pivot);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), wm);
      // The texture's root corner sits on the body; the wing spreads out to the side, up (fore) or down (hind).
      plane.position.set(s * size * 0.48, up * size * 0.45, 0);
      plane.scale.set(s, up, 1);
      pivot.add(plane);
      wings.push({ pivot, s });
    }
  const silver = std(0xdfe6ff, { metalness: 0.6, roughness: 0.3, emissive: 0x8fa0ff, emissiveIntensity: 0.3 });
  const thorax = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 6, 10), silver);
  body.add(thorax);
  const headB = sphere(0.045, silver, 0, 0.17, 0, body, 14);
  const eyes = [-1, 1].map((s) => eye(0.022, 0x6a5adf, body, s * 0.03, 0.18, 0.03, 0xdfe6ff));
  for (const s of [-1, 1]) {
    const pts = [new THREE.Vector3(s * 0.01, 0.2, 0), new THREE.Vector3(s * 0.05, 0.3, 0.02), new THREE.Vector3(s * 0.1, 0.36, 0.0)];
    const ant = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.004, 5), silver);
    body.add(ant);
    sphere(0.012, std(0xfff0b0, { emissive: 0xffe08a, emissiveIntensity: 2.2 }), s * 0.1, 0.36, 0, body, 8);
  }
  void headB;
  const halo = glow(0xa8b8ff, 1.4, 1.1);
  body.add(halo);
  const blink = blinker(eyes);
  let mood = 'calm', moodT = 0;
  return {
    group,
    mood(m) {
      mood = m;
      moodT = 0;
    },
    update(dt, t) {
      blink(dt, t);
      moodT += dt;
      const happy = mood === 'happy' && moodT < 2;
      const flap = Math.sin(t * (happy ? 16 : 7));
      for (const { pivot, s } of wings) pivot.rotation.y = s * (0.2 + flap * 0.65);
      // She floats in a slow figure of eight, higher when happy.
      body.position.set(Math.sin(t * 0.5) * 0.25, 1.3 + Math.sin(t * 1.0) * 0.1 + (happy ? 0.25 : 0), Math.sin(t * 1.0) * 0.12);
      body.rotation.z = Math.sin(t * 0.5) * 0.15;
    }
  };
}

// ── Round 3: the Gardens and the first floor ─────────────────────────────────────────────────────────────────────
//   makeSoldier()  Captain Buttons, the Nursery's tin soldier (the Toy Box pairs)
//   makeDiary()    great-aunt's diary, freed in the Royal Bedchamber; it floats, open, and shows her star map
//   makeGnome()    Basile, the Rose Garden's gnome (the flower beds)
//   makePegasus()  Étoile, the Stables' pegasus foal (grooming): also setLook(), mud spots to brush, eat(), fly()

// A bouncing body for the happy mood, shared by the small friends.
function moodBody() {
  let mood = 'calm', moodT = 0;
  return {
    set(m) {
      mood = m;
      moodT = 0;
    },
    tick(dt) {
      moodT += dt;
      return { happy: mood === 'happy' && moodT < 1.6, think: mood === 'think', t: moodT };
    }
  };
}

export function makeSoldier() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const red = std(0xd02a3a, { roughness: 0.35, metalness: 0.3 });
  const navy = std(0x1e2a6a, { roughness: 0.35, metalness: 0.3 });
  const gold = std(0xf3cf6b, { metalness: 0.85, roughness: 0.3 });
  const skin = std(0xffe0c8, { roughness: 0.45 });
  const black = std(0x15121a, { roughness: 0.3, metalness: 0.4 });
  const cyl = (rt, rb, h, m, x, y, z, parent = body) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), m);
    c.position.set(x, y, z);
    c.castShadow = true;
    parent.add(c);
    return c;
  };
  // Legs (navy with a gold stripe), a round red jacket with gold buttons and a white belt, the tall black hat.
  for (const s of [-1, 1]) {
    cyl(0.045, 0.045, 0.3, navy, s * 0.055, 0.17, 0);
    cyl(0.047, 0.047, 0.3, gold, s * 0.055 + s * 0.035, 0.17, 0).scale.set(0.12, 1, 0.3);
    cyl(0.05, 0.055, 0.04, black, s * 0.055, 0.02, 0.01);
  }
  cyl(0.11, 0.1, 0.26, red, 0, 0.45, 0);
  cyl(0.112, 0.112, 0.035, std(0xffffff, { roughness: 0.5 }), 0, 0.36, 0);
  for (let i = 0; i < 3; i++) sphere(0.012, gold, 0, 0.42 + i * 0.05, 0.105, body, 8);
  for (const s of [-1, 1]) {
    const ep = cyl(0.04, 0.04, 0.025, gold, s * 0.12, 0.57, 0);
    ep.rotation.z = s * 0.3;
  }
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Group();
    a.position.set(s * 0.125, 0.56, 0);
    body.add(a);
    const sl = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.15, 4, 8), red);
    sl.position.y = -0.1;
    a.add(sl);
    sphere(0.032, std(0xffffff), 0, -0.2, 0, a, 10);
    return a;
  });
  const head = new THREE.Group();
  head.position.y = 0.66;
  body.add(head);
  sphere(0.085, skin, 0, 0, 0, head);
  for (const s of [-1, 1]) {
    const cheek = sphere(0.022, std(0xff8aa0, { roughness: 0.6 }), s * 0.05, -0.02, 0.07, head, 10);
    cheek.scale.z = 0.4;
  }
  const eyes = [-1, 1].map((s) => eye(0.018, 0x2a3a7a, head, s * 0.03, 0.01, 0.075, 0xffe0c8));
  const tache = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 12, Math.PI), black);
  tache.position.set(0, -0.03, 0.082);
  tache.rotation.z = Math.PI;
  head.add(tache);
  const hat = cyl(0.075, 0.085, 0.18, black, 0, 0.13, 0, head);
  void hat;
  cyl(0.088, 0.088, 0.02, gold, 0, 0.05, 0, head);
  sphere(0.02, gold, 0, 0.17, 0.075, head, 10);
  const plume = sphere(0.03, red, 0, 0.25, 0, head, 10);
  plume.scale.set(0.7, 1.5, 0.7);
  // His wind-up key, turning in his back.
  const key = new THREE.Group();
  key.position.set(0, 0.47, -0.11);
  body.add(key);
  cyl(0.008, 0.008, 0.06, gold, 0, 0, -0.03, key).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 14), gold);
    loop.position.set(s * 0.03, 0, -0.065);
    key.add(loop);
  }
  const blink = blinker(eyes);
  const m = moodBody();
  return {
    group,
    mood: (x) => m.set(x),
    update(dt, t) {
      blink(dt, t);
      const { happy, think, t: mt } = m.tick(dt);
      key.rotation.z = t * 2;
      // He stands to attention, swinging his arms as if marching on the spot; a salute when happy.
      arms[0].rotation.x = Math.sin(t * 3) * 0.3;
      arms[1].rotation.x = happy ? -2.6 : -Math.sin(t * 3) * 0.3;
      arms[1].rotation.z = happy ? 0.5 : 0;
      body.position.y = happy ? Math.abs(Math.sin(mt * 9)) * 0.05 : Math.abs(Math.sin(t * 3)) * 0.008;
      head.rotation.z = think ? 0.25 : 0;
    }
  };
}

// Great-aunt's diary: a red leather book, open, its pages turning slowly, a soft gold glow under it; it floats.
export function makeDiary() {
  const group = new THREE.Group();
  const book = new THREE.Group();
  book.position.y = 1.4;
  group.add(book);
  const leather = std(0x9a2438, { roughness: 0.5 });
  const gold = std(0xf3cf6b, { metalness: 0.85, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0.3 });
  const paper = std(0xfbf2dc, { roughness: 0.9, side: THREE.DoubleSide });
  const writing = canvasTexture(128, 160, (g, w, h) => {
    g.fillStyle = '#fbf2dc';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(90, 50, 40, 0.6)';
    g.lineWidth = 2;
    for (let y = 18; y < h - 10; y += 11) {
      g.beginPath();
      g.moveTo(12, y);
      for (let x = 12; x < w - 12; x += 6) g.lineTo(x, y + Math.sin(x * 0.7 + y) * 1.6);
      g.stroke();
    }
  });
  const page = new THREE.MeshStandardMaterial({ map: writing, roughness: 0.9, side: THREE.DoubleSide });
  const halves = [-1, 1].map((s) => {
    const half = new THREE.Group();
    book.add(half);
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.34), leather);
    cover.position.x = s * 0.13;
    half.add(cover);
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.32), paper);
    stack.position.set(s * 0.125, 0.02, 0);
    half.add(stack);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.32).rotateX(-Math.PI / 2), page);
    top.position.set(s * 0.125, 0.036, 0);
    half.add(top);
    const corner = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.014, 0.04), gold);
    corner.position.set(s * 0.245, 0, 0.155);
    half.add(corner);
    half.rotation.z = s * -0.18;
    return half;
  });
  // A page that turns over and over, slowly.
  const turner = new THREE.Group();
  turner.position.y = 0.04;
  book.add(turner);
  const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.32).rotateX(-Math.PI / 2), page);
  leaf.position.x = 0.12;
  turner.add(leaf);
  const halo = glow(0xffd27a, 1.1, 1.0);
  book.add(halo);
  const sparkles = [];
  for (let i = 0; i < 8; i++) {
    const sp = sphere(0.008, new THREE.MeshBasicMaterial({ color: 0xfff0b0 }), 0, 0, 0, book, 6);
    sparkles.push(sp);
  }
  const m = moodBody();
  return {
    group,
    mood: (x) => m.set(x),
    update(dt, t) {
      const { happy, think } = m.tick(dt);
      book.position.y = 1.4 + Math.sin(t * 1.3) * 0.06 + (happy ? 0.15 : 0);
      book.rotation.y = Math.sin(t * 0.4) * 0.3;
      book.rotation.x = 0.5 + (think ? 0.25 : 0);
      turner.rotation.z = -((t * (happy ? 1.6 : 0.5)) % Math.PI);
      for (const [i, h] of halves.entries()) h.rotation.z = (i ? 1 : -1) * (0.18 + Math.sin(t * 1.3) * 0.05);
      sparkles.forEach((s, i) => {
        const a = t * 0.8 + (i / sparkles.length) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.3, Math.sin(t * 2 + i) * 0.08, Math.sin(a) * 0.3);
      });
    }
  };
}

// Basile the gnome: a tall red hat, a white beard, a round nose, a blue coat, little boots, a watering can.
export function makeGnome() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const blue = std(0x3a5ac8, { roughness: 0.6 });
  const red = std(0xd8303a, { roughness: 0.55 });
  const beard = std(0xf8f4ec, { roughness: 0.9 });
  const skin = std(0xffc8a8, { roughness: 0.5 });
  const brown = std(0x6a4024, { roughness: 0.7 });
  const coat = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.32, 20), blue);
  coat.position.y = 0.2;
  coat.castShadow = true;
  body.add(coat);
  sphere(0.06, brown, -0.07, 0.04, 0.03, body, 10).scale.set(1, 0.6, 1.4);
  sphere(0.06, brown, 0.07, 0.04, 0.03, body, 10).scale.set(1, 0.6, 1.4);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.014, 6, 24), brown);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.2;
  body.add(belt);
  const head = new THREE.Group();
  head.position.y = 0.42;
  body.add(head);
  sphere(0.085, skin, 0, 0, 0, head);
  const b = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 16), beard);
  b.rotation.x = Math.PI;
  b.position.set(0, -0.1, 0.04);
  head.add(b);
  sphere(0.032, std(0xff9a88, { roughness: 0.4 }), 0, -0.005, 0.085, head, 12);
  const eyes = [-1, 1].map((s) => eye(0.016, 0x3a6a3a, head, s * 0.035, 0.03, 0.07, 0xffc8a8));
  for (const s of [-1, 1]) {
    const brow = sphere(0.02, beard, s * 0.04, 0.06, 0.07, head, 8);
    brow.scale.set(1.4, 0.5, 0.6);
  }
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 20), red);
  hat.position.y = 0.2;
  hat.rotation.z = 0.15;
  head.add(hat);
  // The watering can in his right hand.
  const can = new THREE.Group();
  can.position.set(0.17, 0.2, 0.06);
  body.add(can);
  const tin = std(0x9ac8b8, { metalness: 0.6, roughness: 0.35 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.09, 14), tin);
  can.add(pot);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.12, 8), tin);
  spout.position.set(0.06, 0.03, 0);
  spout.rotation.z = -1.0;
  can.add(spout);
  const blink = blinker(eyes);
  const m = moodBody();
  return {
    group,
    can,
    mood: (x) => m.set(x),
    update(dt, t) {
      blink(dt, t);
      const { happy, think, t: mt } = m.tick(dt);
      body.position.y = happy ? Math.abs(Math.sin(mt * 9)) * 0.08 : 0;
      head.rotation.z = think ? 0.3 : Math.sin(t * 0.9) * 0.06;
      hat.rotation.z = 0.15 + Math.sin(t * 1.7) * 0.06;
      can.rotation.z = happy ? -0.6 : Math.sin(t * 0.8) * 0.05;
    }
  };
}

// Étoile, a pegasus foal: white, long-legged, a mane and tail, little wings. For the grooming game:
//   setLook({ mane, ribbon, blanket, hooves, sparkle }) colours (null = none), `mud` (the spots of mud on her coat:
//   meshes to tap; brush(mesh) clears one), eat() (head down to the bucket), fly() (a little flight, resolves on landing).
export function makePegasus() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const coat = std(0xfbf8ff, { roughness: 0.55 });
  const pink = std(0xffd0e0, { roughness: 0.5 });
  const hoofM = std(0xc8b0d8, { roughness: 0.4, metalness: 0.2 });
  const maneM = std(0xffa8d0, { roughness: 0.6 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 8, 16), coat);
  torso.rotation.z = Math.PI / 2;
  torso.rotation.y = Math.PI / 2;
  torso.position.y = 0.78;
  torso.castShadow = true;
  body.add(torso);
  // Legs: thin, long (she is a foal), with hooves.
  const legs = [];
  for (const [x, z] of [[-0.11, 0.24], [0.11, 0.24], [-0.11, -0.24], [0.11, -0.24]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.72, z);
    body.add(leg);
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.56, 4, 10), coat);
    l.position.y = -0.33;
    l.castShadow = true;
    leg.add(l);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.07, 12), hoofM);
    hoof.position.y = -0.68;
    leg.add(hoof);
    legs.push(leg);
  }
  // The neck and head, up and forward (+z).
  const neck = new THREE.Group();
  neck.position.set(0, 0.88, 0.3);
  body.add(neck);
  const n = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 6, 12), coat);
  n.position.set(0, 0.18, 0.06);
  n.rotation.x = 0.45;
  neck.add(n);
  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.15);
  neck.add(head);
  const skull = sphere(0.13, coat, 0, 0, 0, head);
  skull.scale.set(0.95, 1, 1.05);
  const muzzle = sphere(0.09, pink, 0, -0.07, 0.14, head);
  muzzle.scale.set(1, 0.85, 1.1);
  for (const s of [-1, 1]) {
    sphere(0.012, std(0x8a4a6a), s * 0.035, -0.06, 0.235, head, 8);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 8), coat);
    ear.position.set(s * 0.07, 0.13, -0.02);
    ear.rotation.z = -s * 0.25;
    head.add(ear);
  }
  const eyes = [-1, 1].map((s) => eye(0.04, 0x6a4ad8, head, s * 0.085, 0.03, 0.08, 0xfbf8ff));
  for (const e of eyes) e.g.rotation.y = (e.g.position.x > 0 ? 1 : -1) * 0.5;
  // The mane: a crest of soft lumps down the neck, and a forelock; the tail: a fan of them.
  const maneBits = [];
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const bit = sphere(0.055 - k * 0.012, maneM, 0, 0.5 - k * 0.42, 0.08 - k * 0.2, neck, 10);
    bit.scale.set(0.7, 1.2, 1);
    maneBits.push(bit);
  }
  const forelock = sphere(0.05, maneM, 0, 0.12, 0.1, head, 10);
  forelock.scale.set(1, 0.6, 1.2);
  maneBits.push(forelock);
  const tail = new THREE.Group();
  tail.position.set(0, 0.86, -0.42);
  body.add(tail);
  for (let i = 0; i < 6; i++) {
    const bit = sphere(0.06 - i * 0.004, maneM, 0, -i * 0.08, -i * 0.03, tail, 10);
    bit.scale.set(0.8, 1.4, 0.8);
    maneBits.push(bit);
  }
  // A ribbon (a bow on the forelock), a blanket over her back: hidden until picked.
  const ribbonM = std(0xff5f9e, { roughness: 0.5 });
  const ribbon = new THREE.Group();
  ribbon.position.set(0, 0.17, 0.02);
  head.add(ribbon);
  for (const s of [-1, 1]) {
    const loop = sphere(0.04, ribbonM, s * 0.04, 0, 0, ribbon, 10);
    loop.scale.set(1.1, 0.7, 0.4);
  }
  const blanketM = std(0x7a5ad8, { roughness: 0.8, side: THREE.DoubleSide });
  const blanket = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.4, 20, 1, true, -Math.PI * 0.55, Math.PI * 1.1), blanketM);
  blanket.rotation.x = Math.PI / 2;
  blanket.position.set(0, 0.79, -0.02);
  body.add(blanket);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.236, 0.012, 6, 30, Math.PI * 1.1), std(0xf3cf6b, { metalness: 0.7, roughness: 0.3 }));
  trim.rotation.set(0, 0, Math.PI * 0.5 - Math.PI * 0.55 + Math.PI);
  trim.position.set(0, 0.79, 0.18);
  body.add(trim);
  // Wings on her shoulders, feathers fanned.
  const wingM = std(0xffffff, { roughness: 0.45, emissive: 0xffe8f4, emissiveIntensity: 0.12, side: THREE.DoubleSide });
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(s * 0.17, 0.94, 0.12);
    body.add(w);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22 - i * 0.025, 4, 8), wingM);
      f.position.set(s * (0.1 + i * 0.012), 0.06 + i * 0.012, -0.05 - i * 0.05);
      f.rotation.set(-0.5 - i * 0.2, 0, -s * (1.0 + i * 0.05));
      w.add(f);
    }
    return w;
  });
  // The mud: brown splotches on her coat (flattened spheres on the body's surface), all on her left flank (-x), the
  // side the Stables turn towards the camera, so every one can be tapped.
  const mudM = std(0x6a4a2a, { roughness: 1 });
  const mud = [];
  for (const [x, y, z] of [[-0.2, 0.82, 0.14], [-0.21, 0.86, -0.12], [-0.19, 0.72, -0.3], [-0.18, 0.68, 0.28], [-0.08, 0.99, -0.18], [-0.2, 0.6, -0.04], [-0.15, 0.38, 0.24], [-0.15, 0.32, -0.24]]) {
    const spot = sphere(0.07, mudM, x, y, z, body, 10);
    const out = new THREE.Vector3(x, y - 0.78, z).normalize();
    spot.scale.set(1, 1, 0.35);
    spot.lookAt(spot.position.clone().add(out));
    spot.userData.mud = true;
    mud.push(spot);
  }
  const sparkleM = new THREE.MeshBasicMaterial({ color: 0xfff0b0 });
  const sparkle = new THREE.Group();
  for (let i = 0; i < 14; i++) sphere(0.012, sparkleM, (Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8, sparkle, 6);
  body.add(sparkle);
  const blink = blinker(eyes);
  const m = moodBody();
  let eating = 0, flying = null;
  const api = {
    group,
    mud,
    mood: (x) => m.set(x),
    setLook({ mane = '#ffa8d0', ribbon: r = null, blanket: bl = null, hooves = '#c8b0d8', sparkle: sp = false } = {}) {
      maneM.color.set(mane);
      ribbon.visible = !!r;
      if (r) ribbonM.color.set(r);
      blanket.visible = trim.visible = !!bl;
      if (bl) blanketM.color.set(bl);
      hoofM.color.set(hooves);
      sparkle.visible = sp;
    },
    resetMud() {
      for (const s of mud) s.visible = true;
    },
    brush(spot) {
      if (!spot?.visible) return false;
      spot.visible = false;
      return true;
    },
    get mudLeft() {
      return mud.filter((s) => s.visible).length;
    },
    eat() {
      eating = 2.2;
    },
    fly() {
      return new Promise((res) => (flying = { t: 0, res }));
    },
    update(dt, t) {
      blink(dt, t);
      const { happy, think, t: mt } = m.tick(dt);
      eating = Math.max(0, eating - dt);
      const munch = eating > 0 ? Math.min(1, eating, 2.2 - eating + 0.3) : 0;
      neck.rotation.x = munch * 1.0 + (think ? 0.15 : Math.sin(t * 0.7) * 0.04);
      head.rotation.x = munch * 0.4 + (eating > 0 ? Math.sin(t * 14) * 0.05 : 0);
      head.rotation.z = think ? 0.25 : 0;
      tail.rotation.x = 0.3 + Math.sin(t * 2.4) * 0.15;
      tail.rotation.y = Math.sin(t * 1.7) * 0.3;
      let lift = happy ? Math.abs(Math.sin(mt * 8)) * 0.06 : 0, flap = happy ? 0.6 : 0;
      if (flying) {
        flying.t += dt;
        const k = flying.t / 3.2;
        lift = Math.sin(Math.min(1, k) * Math.PI) * 1.4;
        flap = 1;
        body.rotation.y = k * Math.PI * 2;
        if (k >= 1) {
          body.rotation.y = 0;
          const r = flying.res;
          flying = null;
          r();
        }
      }
      body.position.y = lift;
      for (const [i, w] of wings.entries()) w.rotation.z = (i ? -1 : 1) * (flap ? 0.3 + Math.sin(t * 18) * 0.7 * flap : Math.sin(t * 1.2) * 0.05);
      // Legs tuck up in the air; a happy hop otherwise.
      for (const [i, l] of legs.entries()) l.rotation.x = flying ? (i < 2 ? -0.6 : 0.6) : 0;
      sparkle.rotation.y = t * 0.6;
    }
  };
  api.setLook();
  return api;
}
