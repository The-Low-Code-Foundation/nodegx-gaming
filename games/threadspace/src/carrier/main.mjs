// The carrier prototype (carrier.html): a 400 m ship you walk around inside, fly from her bridge with real inertia,
// and look into through a cutaway, and a fighter you launch from her hangar (fighter.mjs). Four seats: walking (first
// person), the helm, the fighter, a gun turret (weapons.mjs), and the cutaway.
//
// The ship keeps flying whatever seat you are in: walk away from the helm with her turning and she goes on turning
// (with flight assist on, the helm's assist brings her to rest on her own). Inside, you never feel it: the decks are
// in her frame (layout.mjs), and the world goes past the windows and the open bay.
//
//   ?at=bridge|helm|hangar|engineering|mess|fighter|gun|gun-ventral   start there   ?view=cutaway   start in the cutaway
//   ?debug=1   T in a fighter refills her tanks anywhere (normally they are topped up on the pad after a landing)
//   __carrier in the console: the ship, the helm, the walker, the fighter, go(roomId), info() (draw calls, triangles,
//   frame time)

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from '../input.mjs';
import { Space } from '../space.mjs';
import { LightPool } from '../lights.mjs';
import { Walker } from '../controllers/walk.mjs';
import { station } from '../scenery.mjs';
import { buildCarrier, roomAt, loadHull, machineryFrame } from './layout.mjs';
import { frameOf, sideOf } from './wayfinding.mjs';
import { Rigid, Thrusters, Helm, thrustersFromLayout, buildThrusterMeshes, updatePlumes } from './newton.mjs';
import { Cutaway } from './cutaway.mjs';
import { CarrierHud } from './hud.mjs';
import { tickCrew } from './crew.mjs';
import { Fighter } from './fighter.mjs';
import { loadFighterModel, swapFighters } from './fighter-model.mjs';
import { Approach } from './approach.mjs';
import { Cockpit } from './cockpit.mjs';
import { DamageControl } from './damage.mjs';
import { Integrity } from './integrity.mjs';
import { Weapons } from './weapons.mjs';
import { Sfx } from '../sfx.mjs';
import { Gas } from './gas.mjs';
import { FlightAudio } from './flight-audio.mjs';
import { Career } from './career.mjs';
import { Routine, fmt } from './watch.mjs';
import { Voices } from './voice.mjs';

const L = await (await fetch('ships/carrier.layout.json')).json();
const K = await (await fetch('ships/carrier.career.json')).json(); // your first week aboard (career.mjs)
const W = await (await fetch('ships/carrier.watches.json')).json(); // the ship's routine: clock, watches, muster (watch.mjs)
const q = new URLSearchParams(location.search);

const canvas = document.getElementById('view');
const fadeEl = document.getElementById('fade');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor('#02030a');
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.2, 20000);
const hemi = new THREE.HemisphereLight('#9fb4d8', '#1a1410', 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
sun.position.set(0.6, 0.8, 0.3);
scene.add(sun);
const lightPool = new LightPool(scene);
// Out in a fighter the view goes through bloom, so the drive's flame and the jets' glints glow. One NaN or Inf pixel
// (a particle past its life, a pow of a negative number) smeared by the bloom blacks out the whole frame, so a scrub
// pass zeroes any such pixel, and caps the rest, before the bloom sees them. Aboard, the plain render is kept.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.); gl_FragColor = min(c, vec4(64.)); }'
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const space = new Space(scene, renderer, sun);

// Somewhere to leave from: the station she was docked at, a kilometre off her port bow.
const dock = station({ seed: 3 });
dock.position.set(-900, -80, -1300);
dock.rotation.y = 0.6;
// Its own copies of the shared materials: the cutaway's planes go on the carrier's materials, not the station's.
dock.traverse((o) => {
  if (o.material) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
});
scene.add(dock);

let mode = 'walk';
let helmView = 'bridge';
let deckNow = L.spawn.deck;
let fading = false;
let bayK = 0, bayWant = 0;

const hooks = {
  ladder: (l, end) => {
    if (!ship.hatchOpen(l)) return dc.say(null, "The hatch won't open: the compartment on the other side has lost its air.");
    const to = l[end === 'a' ? 'b' : 'a'];
    fadeThen(() => goDeck(to.deck, to.at[0], to.at[1], to.yaw ?? walker.yaw));
  },
  // The career keeps the helm and the fighters shut until you have earned them (career.mjs).
  helm: () => (career.allows('helm') ? setMode('helm') : career.refuse('helm')),
  bay: () => setBay(bayWant ? 0 : 1),
  fighter: (i) => (career.allows('fighters') ? fadeThen(() => boardFighter(i)) : career.refuse('fighters')),
  kit: (k) => dc.take(k)
};

function setBay(v) {
  bayWant = v;
  if (bayUse) bayUse.label = bayWant ? 'Close the bay doors' : 'Open the bay doors';
}

const C = buildCarrier(L, hooks);
scene.add(C.obj);
const thrusterList = thrustersFromLayout(L);
buildThrusterMeshes(C.frame, thrusterList);
const blenderHull = q.get('hull') !== 'code' && (await loadHull(C)); // ?hull=code shows the lofted hull instead
// The fighters as built in Blender (fighter-model.mjs), with their cockpits; ?fighter=code keeps the code-built Wrens.
const blenderFighters = q.get('fighter') !== 'code' && (await loadFighterModel());
if (blenderFighters) swapFighters(C);
const body = new Rigid({ mass: L.mass, size: [68, 34, L.length] });
const thrusters = new Thrusters(thrusterList, body);
const helm = new Helm(C.obj, body, thrusters);
const bayUse = C.decks.get(3)?.interactables.find((u) => u.id === 'bay');
// Gas in vacuum (gas.mjs): what the fighter's drive and jets throw out, and the carrier's own, each in its own pool.
const gas = new Gas(scene, 2600);
const carrierGas = new Gas(scene, 4000);
// The fighter's sound: live DSP worklets fed from her flight (flight-audio.mjs), on the page's AudioContext.
const sfx = new Sfx();
const flightAudio = new FlightAudio(sfx);
const fighter = new Fighter(C, scene, { gas, audio: flightAudio, debug: q.get('debug') === '1' });
const approach = new Approach(C); // the lane of rings you fly back aboard down
const cockpit = new Cockpit(document.getElementById('c-fhud'));

/** Into fighter `i`: her lane, her screens, and flight control opens the bay for a pilot in a seat. */
function boardFighter(i) {
  fighter.board(i);
  approach.setPad(fighter.home.pos.z);
  cockpit.attach(fighter.obj);
  setMode('fighter');
  setBay(1);
}
// Damage control: fires, faults and leaks called out over the speakers (damage.mjs), started by hits. The ship's
// integrity (integrity.mjs): each compartment's air and health, the raids whose shells hole her, the pressure doors and
// the repair drones. ?dc=0 means no raids (a drill can still be called from the damage control centre); ?voice=0 keeps
// everyone quiet: the speakers keep to alarms, and nobody speaks.
// The voices (voice.mjs): recorded clips where there are some (assets/voice/), the browser's speech for the rest.
const voices = new Voices({ on: q.get('voice') !== '0' });
const dc = new DamageControl(C, { sfx, auto: false, voices });
const autoRaids = q.get('dc') !== '0';
const ship = new Integrity(C, {
  dc, sfx, thrusters: thrusterList, auto: autoRaids,
  hooks: {
    // Blacked out: carried into `room`, coming round on its floor.
    rescue: (room, done) => fadeThen(() => {
      setMode('walk');
      goDeck(room.deck, (room.x[0] + room.x[1]) / 2, (room.z[0] + room.z[1]) / 2, walker.yaw);
      done();
    }),
    // A raid is a raider you can see and fight (weapons.mjs).
    raid: (from) => guns.raid(from)
  }
});
dc.airOf = (id) => ship.airOf(id);
// The guns, the shields and the raider (weapons.mjs). The hatches to the turrets sit you in one.
const guns = new Weapons(C, scene, {
  ship, body, sfx, dc,
  hooks: {
    man: (t) => (career.allows('guns') ? fadeThen(() => manTurret(t)) : career.refuse('guns')),
    // A fighter shot dead in space: flight control takes her, from wherever she is, and brings her in.
    crippled: () => {
      setBay(1);
      fighter.land();
    }
  }
});
// The career: orders from the officers, drills, promotions, and the ship opening up as you earn it. Free roam (any
// `?at=` or `?view=`, or the start screen's button) has everything open.
const career = new Career(C, K, { dc, ship, guns, fighter, obj: C.obj, body, sfx, voices });

// The ship's routine (watch.mjs): the clock and the bells, the watches, the crew at their posts by watch, the watch
// bill, your bunk and your section's muster. ?crew=0 leaves the crew ashore (the officers still come aboard).
const routine = new Routine(C, W, { sfx, crew: q.get('crew') !== '0', ship, dc });
const crew = routine.crew;
career.routine = routine;
routine.voices = voices;
const sleepEl = document.getElementById('c-sleep');
routine.tell = (who, text, secs = 6) => (career.on ? career.tell(who, text, secs) : routine.note(who ? `${who.name}: ${text}` : text, secs));
routine.onTurnIn = (go) => {
  // Lights out, the hours go by, and someone shakes your bunk.
  fading = true;
  fadeEl.classList.add('on');
  setTimeout(() => {
    go();
    sleepEl.textContent = `You sleep. ${fmt(routine.t)}: someone shakes your bunk.`;
    sleepEl.hidden = false;
    setTimeout(() => {
      sleepEl.hidden = true;
      fadeEl.classList.remove('on');
      career.woke();
      if (career.on) career.save();
      setTimeout(() => (fading = false), 300);
    }, 2400);
  }, 500);
};
routine.onMuster = (present, leader, line) => career.musterCalled(present, leader, line);

function manTurret(t) {
  guns.man(t);
  setMode('gun');
}
dc.onEnd = (job, ok) => {
  if (ok) ship.mended(job.room.id);
  career.jobEnded(job, ok);
};

const walker = new Walker(C.decks.get(deckNow));
walker.speed = 4.6;
goDeck(L.spawn.deck, L.spawn.at[0], L.spawn.at[1], L.spawn.yaw);

const input = new Input(canvas);
const cut = new Cutaway(C, camera, canvas, document.getElementById('c-labels'));
const hud = new CarrierHud(cut);
hud.onLevel = (i) => cut.setLevel(i);
let modeBefore = 'walk';

input.onAction = (code) => {
  if (fading) return;
  if (code === 'Tab') return setMode(mode === 'cutaway' ? modeBefore : 'cutaway');
  if (mode === 'cutaway') {
    if (code.startsWith('Digit')) cut.setLevel(Number(code.slice(5)) - 1);
    if (code === 'KeyM') cut.setLevel(cut.levels.length - 1);
    return;
  }
  if (routine.billOpen) {
    // The watch bill is up: E or B puts it away.
    if (code === 'KeyE' || code === 'KeyB') routine.closeBill();
    return;
  }
  if (mode === 'walk' && code === 'KeyB') routine.read || !career.on ? routine.openBill() : routine.tell(null, 'You have not read the watch bill yet: it is on the board outside the ship\'s office.', 5);
  else if (mode === 'walk' && code === 'KeyE') walker.nearestUse()?.use();
  else if (mode === 'fighter' && code === 'KeyV') fighter.view = fighter.view === 'cockpit' ? 'chase' : 'cockpit';
  else if (mode === 'fighter' && code === 'KeyM') fighter.toggleMouse();
  else if (mode === 'fighter' && code === 'KeyT') fighter.debugRefill();
  else if (mode === 'fighter' && code === 'KeyE') {
    if (fighter.phase === 'seated')
      fadeThen(() => {
        cockpit.detach();
        const s = fighter.leave();
        setMode('walk');
        goDeck(3, s.x, s.z, s.yaw);
      });
    else if (fighter.canLand(body.vel)) {
      setBay(1);
      fighter.land();
    }
  } else if (mode === 'gun' && code === 'KeyE') {
    fadeThen(() => {
      const s = guns.leave();
      setMode('walk');
      goDeck(s.deck, s.at[0], s.at[1], s.yaw ?? walker.yaw);
    });
  } else if (mode === 'gun' && code === 'KeyZ') guns.zoomStep();
  else if (mode === 'helm' && code === 'KeyE') {
    setMode('walk');
    goDeck(1, L.helm.at[0], L.helm.at[1] + 1.4, 0);
  } else if (mode === 'helm' && code === 'KeyV') helmView = helmView === 'bridge' ? 'chase' : 'bridge';
};

function setMode(m) {
  if (m === mode) return;
  if (mode === 'cutaway') cut.exit();
  if (m === 'cutaway') {
    modeBefore = mode;
    input.unlock();
    input.lockAllowed = false;
    cut.enter();
  } else input.lockAllowed = true;
  mode = m;
  hud.mode(m);
}

function goDeck(id, x, z, yaw) {
  const I = C.decks.get(id);
  deckNow = id;
  walker.interior = I;
  walker.moveTo(new THREE.Vector3(x, I.floorY, z), yaw);
}

function fadeThen(fn) {
  fading = true;
  fadeEl.classList.add('on');
  setTimeout(() => {
    fn();
    fadeEl.classList.remove('on');
    setTimeout(() => (fading = false), 300);
  }, 380);
}

// --- the frame -------------------------------------------------------------------------------------------------------

const IDLE = { keys: new Set(), dx: 0, dy: 0, wheel: 0, clicked: false, trigger: false };
const chasePos = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
let last = performance.now(), time = 0, avgDt = 1 / 60, saveT = 15;

function resize() {
  // Never zero: a hidden page measures 0 × 0, and a zero-sized bloom target is an incomplete framebuffer.
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
resize();

function frame() {
  const now = performance.now();
  tick(Math.min(0.1, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
}

/** One step of everything, then a render. The page calls it every animation frame; `__carrier.tick()` can call it by
 *  hand (a hidden tab gets no animation frames). */
function tick(dt) {
  time += dt;
  avgDt += (dt - avgDt) * 0.05;
  const f = input.frame();

  if (mode === 'walk') walker.frame(f, dt, { canMove: !fading && !routine.billOpen });
  helm.frame(mode === 'helm' ? f : IDLE, dt, mode === 'helm');
  fighter.frame(mode === 'fighter' ? f : IDLE, dt, mode === 'fighter', { carrier: body, bayOpen: bayK >= 1 });
  // The approach lane: lit while you are out in her, and flight control catches you at its end.
  const lane = approach.frame(dt, fighter, body, mode !== 'walk' && (fighter.flying || fighter.phase === 'landing'));
  if (mode === 'fighter' && fighter.flying && lane.call === 'catch' && bayK >= 1) fighter.capture(lane);
  updatePlumes(thrusterList, time, carrierGas, dt);
  carrierGas.stepTick();
  gas.frame(dt, time);
  carrierGas.frame(dt, time);
  flightAudio.setActive(mode === 'fighter' && fighter.aboard);
  flightAudio.frame(fighter.flight);
  machineryFrame(C, time, { power: ship.power, reactor: ship.sys('reactor') });
  ship.auto = autoRaids && career.allows('raids'); // raiders come by themselves once you are a gunner
  dc.frame(dt, f, walker, mode);
  ship.frame(dt, f, walker, mode);
  if (bayK !== bayWant) {
    bayK = bayWant > bayK ? Math.min(1, bayK + dt / 6) : Math.max(0, bayK - dt / 6);
    C.bayDoor?.set(bayK);
    if (C.bayPanel) C.bayPanel.position.y = C.bayPanel.userData.home + bayK * C.bayPanel.userData.travel;
  }
  C.obj.updateMatrixWorld(true);
  guns.fly(fighter, mode === 'fighter' && !fading && f.trigger); // her cannon: the mouse button, out in space
  guns.frame(dt, mode === 'gun' ? f : IDLE, mode, camera);

  // Which decks are drawn: the one you stand on; the bridge from the helm; none from the chase view; the hangar deck
  // from a fighter (you are in it, or you can see into it through the open bay); all in the cutaway.
  for (const [id, I] of C.decks) {
    I.group.visible = mode === 'cutaway' || (mode === 'walk' && id === deckNow) || (mode === 'helm' && helmView === 'bridge' && id === 1) || (mode === 'fighter' && id === 3);
  }
  C.machinery.visible = mode !== 'helm' || helmView === 'bridge';
  tickCrew(crew, dt, (d) => C.decks.get(d).group.visible);
  career.tickPeople(dt, (d) => C.decks.get(d).group.visible);

  if (mode === 'walk') {
    walker.placeCamera(camera, C.frame);
    const I = C.decks.get(deckNow);
    const r = roomAt(C, deckNow, walker.pos.x, walker.pos.z);
    hud.where(`${I.deck.name}${r ? ' · ' + r.name : ''} · frame ${frameOf(L, walker.pos.z)}, ${sideOf(walker.pos.x)}`);
    hud.use(fading ? null : walker.nearestUse());
    C.decks.get(deckNow).tick(dt);
  } else if (mode === 'helm') {
    const hurt = (ship.power ? '' : ' · emergency power') + (ship.driveFactor < 0.99 ? ` · main drive ${Math.round(ship.driveFactor * 100)}%` : '');
    hud.where(`At the helm · ${helmView === 'bridge' ? 'bridge view' : 'outside view'}${hurt}`);
    hud.use(null);
    hud.helm(helm);
    if (helmView === 'bridge') {
      camera.position.set(...L.helm.eye);
      C.frame.localToWorld(camera.position);
      camera.quaternion.copy(C.obj.getWorldQuaternion(_q));
    } else {
      // Behind and above her, a little lagging, looking past her toward where she points.
      const want = C.obj.localToWorld(_v.set(0, 150, 620));
      if (chasePos.lengthSq() === 0) chasePos.copy(want);
      chasePos.lerp(want, Math.min(1, dt * 3));
      camera.position.copy(chasePos);
      camera.up.set(0, 1, 0).applyQuaternion(C.obj.quaternion);
      camera.lookAt(C.obj.localToWorld(_v.set(0, 0, -180)));
    }
  } else if (mode === 'fighter') {
    fighter.placeCamera(camera, dt);
    fighterHud(dt);
  } else if (mode === 'gun') {
    guns.placeCamera(camera, dt);
    hud.where(guns.where());
    hud.use(null);
  } else {
    const you = new THREE.Vector3(walker.pos.x, walker.pos.y, walker.pos.z);
    cut.frame(dt, you);
    dc.markScale = career.markScale = cut.pin.scale.x;
    const lv = cut.levels[cut.level];
    hud.where(`Cutaway · ${lv.name}`);
    hud.use(null);
  }
  // A hit shakes you, the harder the nearer it struck (aboard only: from outside you see it instead).
  if (ship.shake > 0.01 && (mode === 'walk' || mode === 'gun' || (mode === 'helm' && helmView === 'bridge'))) {
    const s = ship.shake;
    camera.position.x += (Math.random() - 0.5) * s * 0.12;
    camera.position.y += (Math.random() - 0.5) * s * 0.12;
    camera.rotateZ((Math.random() - 0.5) * s * 0.02);
  }
  // A hit on your fighter throws you about in the seat.
  if (mode === 'fighter' && guns.jolt > 0.01) {
    camera.rotateZ((Math.random() - 0.5) * guns.jolt * 0.05);
    camera.rotateX((Math.random() - 0.5) * guns.jolt * 0.03);
  }
  const roomNow = mode === 'walk' ? roomAt(C, deckNow, walker.pos.x, walker.pos.z)?.id : null;
  routine.rankName = career.on ? career.rank : null;
  routine.frame(dt, { mode, deck: deckNow, room: roomNow, x: walker.pos.x, z: walker.pos.z });
  if (mode !== 'walk') routine.closeBill();
  career.frame(dt, { mode, deck: deckNow, room: roomNow });
  // The clock is kept with the career, now and then as well as at each order.
  if (career.on && (saveT -= dt) <= 0) (saveT = 15), career.save();
  if (mode !== 'helm' || helmView === 'bridge') chasePos.set(0, 0, 0);
  if (mode !== 'cutaway' && !(mode === 'helm' && helmView === 'chase') && !(mode === 'fighter' && fighter.view === 'chase')) camera.up.set(0, 1, 0);
  if (mode !== 'fighter') cockpit.hide();
  // A little wider from the cockpit, so the panel's screens are in view.
  const fov = mode === 'gun' ? guns.fov() : mode === 'fighter' && fighter.view === 'cockpit' ? 76 : 70;
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  // The fill and the sun stand in for the ship's own lighting aboard: on emergency power they go down with the lamps.
  const dark = mode === 'walk' && !ship.power;
  hemi.intensity = mode === 'cutaway' ? 1.8 : dark ? 0.2 : 0.9;
  sun.intensity = dark ? 0.25 : 1.6;
  space.frame(camera, dt);
  const lit = [...C.decks.values()].filter((I) => I.group.visible);
  lightPool.update(camera.position, mode === 'cutaway' ? [] : lit);
  routine.light(lightPool, hemi, { mode, room: roomNow }); // night: red lighting in the passages
  gas.setView(camera, renderer.domElement.height);
  carrierGas.setView(camera, renderer.domElement.height);
  // Out in a fighter, the lab's look: ACES tone mapping (applied by the composer's output pass only) and bloom.
  if (mode === 'fighter') {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    composer.render();
  } else {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(scene, camera);
  }
}

hud.mode(mode);

const PROMPTS = {
  launch: { key: '', label: 'Launching: the lane runs you out through the bay' },
  landing: { key: '', label: 'Flight control has you: bringing you in' },
  turn: { key: '', label: 'On the pad: turning you round for the next launch' }
};
const _p = new THREE.Vector3();
const _f = new THREE.Vector3();
const FOE = {}; // what the fighter's sight shows of the raider (weapons.mjs `foe`)
const range = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(2)} km`);

/** How a landing you flew yourself went: speed and how far off the line when flight control caught you. */
function grade(l) {
  const word = l.speed < 6 && l.off < 1.5 ? 'Textbook.' : l.speed < 9 && l.off < 3 ? 'Good landing.' : 'Firm, but down.';
  return `Landed: ${l.speed.toFixed(1)} m/s, ${l.off.toFixed(1)} m off the line. ${word}`;
}

/** The fighter's instruments: the HUD and the screens (cockpit.mjs), the prompt, and the panel from the chase view. */
function fighterHud(dt) {
  const ph = fighter.phase;
  hud.mode(fighter.flying ? 'fighter' : 'pad');
  // From the cockpit the HUD and the screens carry it all; from behind her, the panel at the side does.
  hud.helmEl.hidden = !(fighter.flying && (fighter.view === 'chase' || !blenderFighters));
  const fl = fighter.flight;
  hud.where(fighter.flying ? `Fighter · ${fl.assistOn ? 'attitude hold: the mouse moves the aim' : 'hold off: your hand on the valves'} · mouse ${fighter.mouseMode}` : ph === 'landing' ? 'Fighter · on approach' : 'Fighter · in the hangar');
  if (ph === 'seated') hud.use(fighter.refuelT > 0 ? { key: '', label: 'The deck crew are topping up your tanks' } : !fl.online ? { key: '', label: 'The drive is spinning up' } : bayK >= 1 ? { key: 'W', label: 'Launch (hold)' } : { key: '', label: 'Flight control is opening the bay doors' });
  else if (ph === 'flying') hud.use(fighter.canLand(body.vel) && !approach.state.inLane ? { label: 'Hand over: flight control brings you in' } : null);
  else if (ph === 'turn' && fighter.lastLanding?.manual) hud.use({ key: '', label: grade(fighter.lastLanding) });
  else hud.use(PROMPTS[ph] ?? null);
  const lane = approach.state;
  const gate = fighter.gateWorld(_p);
  const rel = _f.copy(fighter.body.vel).sub(body.vel);
  const to = gate.clone().sub(fighter.obj.getWorldPosition(new THREE.Vector3()));
  const dist = to.length();
  const closing = dist > 0.1 ? rel.dot(to) / dist : 0;
  if (fighter.flying) hud.helm(fl, { dist, closing, ref: body.vel });
  if (!fighter.obj) return cockpit.hide();
  // Where to fly: down the lane once you are on it, to its far ring until then.
  const entry = approach.pointAt(approach.len);
  const entryDist = entry.distanceTo(fighter.obj.getWorldPosition(new THREE.Vector3()));
  const aim = lane.inLane ? { point: approach.pointAt(Math.max(0, lane.along - 80)), label: `BAY ${range(dist)}` } : { point: entry, label: `LANE ${range(entryDist)}` };
  cockpit.frame(dt, {
    fighter, carrier: body, C, lane, approach, camera, aim, bayDist: dist, closing, entryDist,
    cockpit: fighter.view === 'cockpit', bayOpen: bayK >= 1, pad: fighter.index + 1,
    foe: fighter.flying ? guns.foe(FOE) : null, rounds: guns.rounds, roundsMax: L.weapons.fighter?.rounds,
    hull: guns.fhull != null ? guns.fhull / L.weapons.fighter.hull : 1
  });
}

// --- start ---------------------------------------------------------------------------------------------------------

const AT = {
  bridge: [1, 0, -140, 0], hangar: [3, -2, 0, Math.PI / 2], engineering: [3, 0, 134, Math.PI], mess: [2, 0, -70, -Math.PI / 2]
};
if (q.get('at') === 'helm') {
  goDeck(1, 0, -144.6, 0);
  setMode('helm');
} else if (q.get('at') === 'fighter') {
  goDeck(3, -2, 0, Math.PI / 2);
  boardFighter(1);
} else if (q.get('at') === 'gun' || q.get('at') === 'gun-ventral') {
  const t = guns.turrets[q.get('at') === 'gun' ? 0 : 1];
  goDeck(t.spec.from.deck, t.spec.from.at[0], t.spec.from.at[1], t.spec.from.yaw);
  manTurret(t);
} else if (AT[q.get('at')]) goDeck(...AT[q.get('at')]);
if (q.get('view') === 'cutaway') setMode('cutaway');

const startEl = document.getElementById('c-start');
const boardBtn = document.getElementById('c-board');
const againBtn = document.getElementById('c-again');
const saved = Career.saved(K);
if (saved?.i) {
  boardBtn.textContent = `Carry on as ${saved.rank.toLowerCase()}`;
  againBtn.hidden = false;
}
/** Off the start screen: into the career (fresh or carried on), or free roam. */
function go(how) {
  startEl.hidden = true;
  sfx.start(); // sound needs a click to start
  flightAudio.init();
  if (how === 'free') career.free();
  else {
    const at = career.begin(how === 'fresh');
    goDeck(at.deck, at.x, at.z, at.yaw);
  }
  if (mode !== 'cutaway') input.lock();
}
boardBtn.addEventListener('click', () => go('carry-on'));
againBtn.addEventListener('click', () => go('fresh'));
document.getElementById('c-free').addEventListener('click', () => go('free'));
if (q.has('at') || q.has('view')) startEl.hidden = true;
// Started without the start screen (?at=, ?view=): sound starts with the first click or key.
const wake = () => {
  sfx.start();
  flightAudio.init();
};
window.addEventListener('pointerdown', wake, { once: true });
window.addEventListener('keydown', wake, { once: true });

window.__carrier = {
  C, L, K, W, crew, routine, body, helm, thrusters, walker, renderer, camera, cut, fighter, dc, ship, guns, sfx, approach, cockpit, career, voices,
  gas, carrierGas, flightAudio, composer, bloom,
  mode: () => mode,
  tick: (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) tick(dt);
    return window.__carrier.info();
  },
  view: (v) => (helmView = v),
  /** Opens the bay doors at once (the doors normally take six seconds). */
  bayNow() {
    setBay(1);
    bayK = 1;
    C.bayDoor?.set(1);
    if (C.bayPanel) C.bayPanel.position.y = C.bayPanel.userData.home + C.bayPanel.userData.travel;
  },
  setMode,
  go(roomId) {
    const c = C.rooms.get(roomId);
    if (!c || c.access !== 'walk') return false;
    setMode('walk');
    goDeck(c.deck, (c.x[0] + c.x[1]) / 2, (c.z[0] + c.z[1]) / 2, walker.yaw);
    return true;
  },
  /** Sets the ship's clock: `__carrier.time('17:55')` (today), or `time('06:00', 2)` (day 2). */
  time(hhmm, day = Math.floor(routine.t / 86400) + 1) {
    const [h, m] = hhmm.split(':').map(Number);
    routine.setTime((day - 1) * 86400 + h * 3600 + m * 60);
    return fmt(routine.t);
  },
  blenderHull,
  info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, frameMs: +(avgDt * 1000).toFixed(1), mode, deck: deckNow, fighter: fighter.phase })
};

frame();
