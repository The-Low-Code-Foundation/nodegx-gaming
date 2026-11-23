// The deep: how far from home you are, and what that does to everything.
//
// Near the carrier there is light and company: her lamps and her strobe, the dust and ice crystals she sheds hanging
// round her (space.mjs `dustLevel`: the motes you see stream past are her halo, not space's), flight control clear on
// the radio. Go out and it all thins. Past a couple of kilometres nothing drifts past the glass, so nothing tells you
// that you are moving but the instruments. The side of a hull away from the sun goes black (render.mjs `OUTSIDE`: no
// air scatters light out here). Flight control's voice breaks up under static. The crew go quiet, and when they talk
// it is about that. And now and then the deep shows you something:
//
//   debris     a dead fragment of somebody's ship, plating and frames, tumbling past a few hundred metres off with
//              no lights, lit on one side by the sun. It comes up on the nav plot as UNK, then DEBRIS.
//   drive      a far drive flare, a moving star, crawling across the sky for a minute, then gone dark. It is on the
//              plot, tens of kilometres out.
//   ghost      a faint return on the plot, far out, blinking, that comes to nothing. Nothing to see.
//   ping       a grain of grit on the hull: a sharp tick through the structure (ambience.mjs `ping`).
//
// None of them can hurt you: they are the deep being the deep. They only come while you are out (the cutter out of
// her berth, a fighter flying), past `RANGE.events`, with no raid on, and never in the cutaway.
//
// `k` is the deep factor: 0 inside `RANGE.near` of home, 1 past `RANGE.far`. Home is the ship that carries you (the
// host, from the cutter) or the ship you are aboard (the carrier, from her fighter): its distance from the camera.
// The crew's words are content/deep/talk.json; they speak through the announcer (core/announcer.mjs `line`), so a
// recorded clip plays when there is one. `__carrier.deep` (`info()`, `event('debris')`, `talk('far')`).

import * as THREE from 'three';
import { fetchJson } from '../core/ship.mjs';

/** Metres from home: where the deep begins and is full, the dust halo's edge, where the crew talk of distance, the
 *  line home, and where the deep's events begin. */
export const RANGE = { near: 800, far: 6000, halo: [450, 2200], farTalk: 3000, home: 1500, events: 1400, radio: 1200 };
/** Seconds: to the first event once out past `RANGE.events`, between events (shorter the deeper), and each event's
 *  weight. */
const EVENTS = { first: [25, 45], gap: [55, 120], weight: { debris: 3, drive: 2.5, ghost: 2, ping: 3.5 } };
/** The speakers whose voice comes from home over the radio (static and breaking up with range). */
const FROM_HOME = new Set(['flight', 'captain']);

/** The deep's own dice: never the page's Math.random, which `?seed=` seeds for the scripted runs (the deep must not
 *  move what they measure). */
const R = (() => {
  let a = (Date.now() ^ 0x5eed) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
const between = ([a, b]) => a + R() * (b - a);
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _h = new THREE.Vector3();

export class Deep {
  /** `G`: the game in hand (main.mjs). `home()`: the Object3D of home. `world`: the group outside things go in.
   *  `view`: render.mjs. `ambience`, `announcer`, `sfx`. `crew()`: who is aboard to talk, [{ id, who }]. */
  constructor(G, { home, world, view, ambience, announcer, sfx, crew = () => [] }) {
    Object.assign(this, { G, home, world, view, ambience, announcer, sfx, crew });
    this.on = G.q?.get('deep') !== '0';
    this.k = 0;
    this.range = 0;
    this.out = false;
    this.evT = between(EVENTS.first);
    this.talkT = 0;
    this.lines = null; // content/deep/talk.json
    this.said = new Set();
    this.talking = null; // an exchange being said: { lines, i, wait }
    this.wasFar = false;
    this.radioSaid = false;
    this.wreck = null; // the debris event, while it lasts
    this.drive = null; // the far drive
    this.ghost = null; // the ghost contact
    this.log = []; // what the deep did (the last 20)
    fetchJson('content/deep/talk.json').then((j) => {
      this.lines = j;
      this.talkT = between(j.first ?? [40, 60]);
    }).catch(() => {});
    // The far drive: one point that rides with the camera, as the stars do.
    this.sky = new THREE.Group();
    this.sky.name = 'deep-sky';
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    this.flare = new THREE.Points(g, new THREE.PointsMaterial({ map: softDot(), color: '#b9c8ff', size: 7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flare.frustumCulled = false;
    this.flare.renderOrder = -7;
    this.sky.add(this.flare);
    this.sky.visible = false;
    world.add(this.sky);
    // Flight control breaking up: static under the voice, and words lost from the subtitle.
    if (announcer) announcer.onStart = (item, secs) => this.radio(item, secs);
  }

  /** Each frame, after the seat has placed the camera. `out`: you are out in it (not in a berth, not aboard a ship at
   *  rest in her hangar). `quiet`: nothing is going on that the crew would talk over (no raid, no cutaway). */
  frame(dt, { camera, out, quiet, mode }) {
    const home = this.home();
    this.range = home ? camera.position.distanceTo(home.getWorldPosition(_h)) : 0;
    this.out = !!out;
    this.k = this.on ? smooth(RANGE.near, RANGE.far, this.range) : 0;
    this.view.deep = this.k;
    this.view.space.dustLevel = this.on ? 1 - smooth(RANGE.halo[0], RANGE.halo[1], this.range) : 1;
    if (this.ambience) this.ambience.deep = this.out ? this.k : 0;
    this.sky.position.copy(camera.position);
    this.frameWreck(dt, camera);
    this.frameDrive(dt);
    this.frameGhost(dt);
    this.frameTalk(dt, quiet);
    if (!this.on || !this.out || !quiet || mode === 'cutaway') return;
    // The way home: back inside the line after being well out.
    if (this.range > RANGE.farTalk) this.wasFar = true;
    else if (this.wasFar && this.range < RANGE.home) {
      this.wasFar = false;
      this.talk('home');
    }
    if (this.range < RANGE.events) return;
    if ((this.evT -= dt) <= 0) {
      this.evT = between(EVENTS.gap) * (1.25 - 0.5 * this.k);
      this.event();
    }
  }

  /** One of the deep's events (or `kind`), if it is not already happening. */
  event(kind = null) {
    const busy = { debris: !!this.wreck, drive: !!this.drive, ghost: !!this.ghost, ping: false };
    if (!kind) {
      const W = Object.entries(EVENTS.weight).filter(([k]) => !busy[k]);
      let r = R() * W.reduce((s, [, w]) => s + w, 0);
      kind = W.find(([, w]) => (r -= w) <= 0)?.[0] ?? 'ping';
    }
    if (busy[kind]) return null;
    this.log.push({ kind, range: Math.round(this.range) });
    if (this.log.length > 20) this.log.shift();
    if (kind === 'debris') this.startWreck();
    else if (kind === 'drive') this.startDrive();
    else if (kind === 'ghost') this.startGhost();
    else if (kind === 'ping') this.ping();
    return kind;
  }

  // --- debris ---------------------------------------------------------------------------------------------------

  /** A fragment of a wrecked ship, passing a few hundred metres off her bow, across it. */
  startWreck() {
    const C = this.G.C, body = this.G.body;
    const mesh = (this.wreckMesh ??= wreckMesh());
    C.obj.updateMatrixWorld(true);
    const fwd = _v.set(0, 0, -1).transformDirection(C.obj.matrixWorld).clone();
    const side = _w.set(1, 0, 0).transformDirection(C.obj.matrixWorld).clone();
    const up = new THREE.Vector3(0, 1, 0).transformDirection(C.obj.matrixWorld);
    // Its nearest point to her: ahead, off to a side, and above her bow line, where the flight deck's windows look
    // (below it is the console).
    // Of a few such points, the one the sun lights best from where you sit (a wreck against the sun is a black shape
    // you would miss; if the sun is dead ahead, so be it).
    const sun = this.view.sun.position.clone().normalize();
    let near = null, best = -2;
    for (let i = 0; i < 6; i++) {
      const ahead = 230 + R() * 270;
      const p = C.obj.position.clone().addScaledVector(fwd, ahead).addScaledVector(side, (R() - 0.5) * ahead * 1.1).addScaledVector(up, ahead * (0.06 + R() * 0.22));
      const lit = -sun.dot(_w.subVectors(p, C.obj.position).normalize());
      if (lit > best) (best = lit), (near = p);
    }
    // It moves across her line of sight: along her side axis (mostly), either way, a little up or down.
    const dir = side.clone().multiplyScalar(R() < 0.5 ? -1 : 1).addScaledVector(up, (R() - 0.5) * 0.25).normalize();
    const speed = 10 + R() * 16, before = 32 + R() * 10;
    mesh.position.copy(near).addScaledVector(dir, -speed * before);
    mesh.rotation.set(R() * 6.3, R() * 6.3, R() * 6.3);
    mesh.scale.setScalar(1.5 + R() * 0.8); // 30 to 45 m across
    this.world.add(mesh);
    this.wreck = {
      mesh, vel: dir.multiplyScalar(speed).add(body?.vel ?? _h.set(0, 0, 0)), spin: new THREE.Vector3((R() - 0.5) * 0.12, (R() - 0.5) * 0.12, (R() - 0.5) * 0.12),
      t: 0, life: before * 2 + 20, seen: false, known: false
    };
  }

  frameWreck(dt, camera) {
    const W = this.wreck;
    if (!W) return;
    W.t += dt;
    W.mesh.position.addScaledVector(W.vel, dt);
    W.mesh.rotation.x += W.spin.x * dt;
    W.mesh.rotation.y += W.spin.y * dt;
    W.mesh.rotation.z += W.spin.z * dt;
    const d = W.mesh.position.distanceTo(camera.position);
    // Called out once it is near enough to make out, a few seconds after it comes up on the plot.
    if (!W.seen && W.t > 6 && d < 1400) {
      W.seen = true;
      this.talk('debris', true);
      setTimeout(() => this.wreck === W && (W.known = true), 5000);
    }
    if (W.t > W.life || (W.t > 10 && d > 2600)) {
      W.mesh.removeFromParent();
      this.wreck = null;
    }
  }

  // --- a far drive ----------------------------------------------------------------------------------------------

  /** A drive burning far off: a moving star, somewhere ahead of her and off to a side, for a minute or so. */
  startDrive() {
    const C = this.G.C;
    C.obj.updateMatrixWorld(true);
    // Where the flight deck's windows look: up to 45° either side of her bow, a little to 30° above it; and it
    // crawls mostly across, in her frame.
    const yaw = THREE.MathUtils.degToRad((R() - 0.5) * 90), pitch = THREE.MathUtils.degToRad(3 + R() * 27);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).transformDirection(C.obj.matrixWorld);
    const across = new THREE.Vector3(R() < 0.5 ? 1 : -1, (R() - 0.5) * 0.5, 0).normalize().transformDirection(C.obj.matrixWorld);
    const along = new THREE.Vector3().crossVectors(dir, across).normalize();
    this.drive = { dir, along, rate: THREE.MathUtils.degToRad(0.15 + R() * 0.3), t: 0, life: 45 + R() * 40, out: 0, said: false };
    this.sky.visible = true;
    setTimeout(() => this.drive && this.talk('drive', true), 7000 + R() * 5000);
  }

  frameDrive(dt) {
    const D = this.drive;
    if (!D) return;
    D.t += dt;
    D.dir.applyAxisAngle(D.along, D.rate * dt);
    this.flare.geometry.attributes.position.setXYZ(0, D.dir.x * 4000, D.dir.y * 4000, D.dir.z * 4000);
    this.flare.geometry.attributes.position.needsUpdate = true;
    // It comes up over a few seconds, flickers as a drive does at that range, and at the end it cuts out.
    const up = Math.min(1, D.t / 4), cut = D.t > D.life ? Math.max(0, 1 - (D.t - D.life) / 2.5) : 1;
    this.flare.material.opacity = up * cut * (0.75 + 0.25 * Math.sin(D.t * 23) * Math.sin(D.t * 7.1));
    if (D.t > D.life && !D.said) {
      D.said = true;
      setTimeout(() => this.talk('drive-out', true), 2500);
    }
    if (cut <= 0) {
      this.drive = null;
      this.sky.visible = false;
    }
  }

  // --- a ghost contact ------------------------------------------------------------------------------------------

  /** A faint return on the plot, far out, that comes and goes and is gone. */
  startGhost() {
    const C = this.G.C;
    const b = R() * Math.PI * 2, dist = 16000 + R() * 18000;
    const at = C.obj.position.clone().add(new THREE.Vector3(Math.sin(b) * dist, (R() - 0.5) * 2000, Math.cos(b) * dist));
    this.ghost = { at, t: 0, life: 25 + R() * 20 };
    setTimeout(() => this.ghost && this.talk('ghost', true), 2500);
  }

  frameGhost(dt) {
    const H = this.ghost;
    if (!H) return;
    H.t += dt;
    if (H.t > H.life) {
      this.ghost = null;
      this.talk('ghost-gone', true);
    }
  }

  // --- grit on the hull -----------------------------------------------------------------------------------------

  ping() {
    this.ambience?.ping?.();
    if (R() < 0.6) setTimeout(() => this.talk('ping', true), 900 + R() * 600);
  }

  /** What the nav plot shows of the deep (sets/flight-deck.mjs `nav`): [{ pos, label }]. */
  contacts() {
    const out = [];
    if (this.wreck) out.push({ pos: this.wreck.mesh.position, label: this.wreck.known ? 'DEBRIS' : 'UNK' });
    if (this.drive && this.drive.t < this.drive.life) out.push({ pos: _v.copy(this.G.C.obj.position).addScaledVector(this.drive.dir, 42000).clone(), label: 'UNK DRIVE' });
    // The ghost blinks: there, not there.
    if (this.ghost && Math.sin(this.ghost.t * 2.1) + Math.sin(this.ghost.t * 0.7) > -0.3) out.push({ pos: this.ghost.at, label: 'UNK' });
    return out;
  }

  // --- the crew talking -----------------------------------------------------------------------------------------

  /** The crew's next exchange of kind `when`, if one is left that the crew aboard can say. `now`: an event's, said
   *  ahead of the quiet talk (it waits for anything already being said). */
  talk(when, now = false) {
    if (!this.lines || !this.on) return false;
    const aboard = new Map(this.crew().map((c) => [c.id, c.who]));
    if (!aboard.size) return false;
    const e = this.lines.lines.find((l) => l.when === when && !this.said.has(l.id) && l.say.every(([who]) => aboard.has(who)));
    if (!e) return false;
    if (this.talking && !now) return false;
    this.said.add(e.id);
    this.talking = { lines: e.say.map(([who, text]) => ({ who, text, label: aboard.get(who) })), i: 0, wait: 0.2 };
    this.talkT = between(this.lines.gap ?? [80, 160]);
    return true;
  }

  frameTalk(dt, quiet) {
    const T = this.talking;
    if (T) {
      if (this.announcer?.busy) return;
      if ((T.wait -= dt) > 0) return;
      const l = T.lines[T.i++];
      this.announcer?.line(l.who, l.text, { label: l.label });
      T.wait = 0.5 + R() * 0.6;
      if (T.i >= T.lines.length) this.talking = null;
      return;
    }
    if (!this.lines || !this.out || !quiet || this.range < 600) return;
    if ((this.talkT -= dt) > 0) return;
    this.talkT = 20; // nothing left to say of that kind: look again later
    const order = this.k > 0.75 ? ['deep', 'far', 'quiet'] : this.range > RANGE.farTalk ? ['far', 'quiet'] : ['quiet'];
    for (const w of order) if (this.talk(w)) break;
  }

  // --- the radio ------------------------------------------------------------------------------------------------

  /** As a line starts (the announcer's `onStart`): a voice from home, heard out here, comes through static, its words
   *  dropping out as the range grows. Returns the subtitle to show, or undefined for the line's own. */
  radio(item, secs) {
    if (!this.on || !this.out || !FROM_HOME.has(item.A.who) || this.range < RANGE.radio) return undefined;
    const k = smooth(RANGE.radio, RANGE.far * 1.3, this.range);
    this.ambience?.radioStatic?.(secs + 0.4, k);
    if (k > 0.45 && !this.radioSaid) {
      this.radioSaid = true;
      setTimeout(() => this.talk('radio', true), (secs + 1) * 1000);
    }
    if (!item.text || k < 0.3) return undefined;
    // Words lost to the static, never the first one (who is calling).
    const lose = Math.min(0.4, (k - 0.3) * 0.7);
    const words = item.text.split(' ');
    const out = words.map((w, i) => (i > 0 && R() < lose ? '…' : w)).join(' ').replace(/(… )+…/g, '…');
    return `<span class="radio-far">${out}</span>`;
  }

  info() {
    return { on: this.on, out: this.out, range: Math.round(this.range), k: +this.k.toFixed(2), dust: +this.view.space.dustLevel.toFixed(2), fill: +this.view.hemi.intensity.toFixed(2), next: +this.evT.toFixed(1), talkIn: +this.talkT.toFixed(1), wreck: !!this.wreck, drive: !!this.drive, ghost: !!this.ghost, said: [...this.said], log: this.log };
  }
}

/** A soft round point: a hot white core in a blue-violet glow (a drive's flame, a very long way off). */
function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(235,240,255,0.9)');
  r.addColorStop(0.45, 'rgba(150,160,255,0.25)');
  r.addColorStop(1, 'rgba(120,120,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A fragment of somebody's ship: a torn run of hull plating on its frames, a bent second plate, a tank and a spar.
 *  About 20 m across at scale 1 (drawn 1.5 to 2.3). Dull, scorched in places, no lights. */
function wreckMesh() {
  const g = new THREE.Group();
  g.name = 'deep-debris';
  // A little more of the sky's glow on it than the ships get (`envMapIntensity`), so its dark side is a shape and
  // not a hole in the stars.
  const paint = new THREE.MeshStandardMaterial({ color: '#7a7d82', roughness: 0.72, metalness: 0.3, envMapIntensity: 2.2 });
  const scorch = new THREE.MeshStandardMaterial({ color: '#2f2926', roughness: 0.95, metalness: 0.1, envMapIntensity: 1.5 });
  const bare = new THREE.MeshStandardMaterial({ color: '#9a968f', roughness: 0.45, metalness: 0.6, envMapIntensity: 2.5 });
  const box = (w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.rotation.set(rx, ry, rz);
    g.add(b);
    return b;
  };
  // The plating, in panels at slightly different angles (it buckled), one panel scorched.
  box(6, 0.35, 9, paint, -6, 0, 0, 0.02, 0, 0.05);
  box(6, 0.35, 9, paint, 0, 0.25, 0.4, -0.04, 0.03, -0.08);
  box(5, 0.35, 7, scorch, 5.6, 1.1, 1.2, 0.1, -0.12, -0.35);
  // The frames under it, one sheared off and sticking out.
  for (const x of [-7, -3.5, 0, 3.4]) box(0.5, 1.1, 10, bare, x, -0.7, 0.2);
  box(0.5, 1.1, 7, bare, 7.5, -1.4, -4.5, 0.4, 0.5, 0.2);
  // A second plate torn loose and bent back.
  box(4.5, 0.3, 6, paint, -3, 2.6, -5.2, 1.0, 0.2, 0.3);
  // A tank, still on its saddle, and a spar.
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 5, 14), bare);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(-2, -2.2, 2.5);
  g.add(tank);
  box(0.4, 0.4, 16, scorch, 1, -2.4, -2, 0.1, 0.35, 0);
  return g;
}
