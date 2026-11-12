// The game: a floor of the hospital, the officer, the infected, the trapped; the loop that runs them; the input.
import * as THREE from 'three';
import { parse, toCell, toWorld, walkable, CELL, cellsOf, SANDBOX, SANDBOX_LIGHTS } from './map.mjs';
import { buildLevel } from './level.mjs';
import { People } from './people.mjs';
import { Player } from './player.mjs';
import { Zombie } from './zombies.mjs';
import { Survivors } from './survivors.mjs';
import { FX } from './fx.mjs';
import { HUD } from './hud.mjs';
import { Audio } from './audio.mjs';
import { PICKUPS, WEAPONS, SKILLS } from './weapons.mjs';
import { Animator } from './people.mjs';
import { Radar } from './radar.mjs';
import { Fear } from './fear.mjs';
import { Atmos } from './atmos.mjs';

const params = new URLSearchParams(location.search);
const floor = Number(params.get('floor') ?? 1);
const auto = params.get('auto') === '1';
// ?lite=1: a quarter of the pixels and few lights, for headless Chrome's software GL (the drive) and weak machines.
const lite = params.get('lite') === '1';
// ?sandbox=1 (round 3): one room, the infected come in through its doors, bites do no harm. To practise cover and
// shooting, and to tune how they feel (the ` key opens the numbers).
const sandbox = params.get('sandbox') === '1';
// Round 4: `flash` (how much a shot lights the room and the screen) and `deafen` (how much each one takes her hearing).
const TUNE_DEFAULTS = { shake: 1, kick: 1, recoil: 1, fovPunch: 1, fovHip: 68, fovAim: 48, hipDist: 2.45, aimDist: 1.2, hipSide: 0.58, aimSide: 0.66, flash: 1, deafen: 1, hitstop: true, gore: true };
const tune = { ...TUNE_DEFAULTS };
try {
  Object.assign(tune, JSON.parse(localStorage.getItem('triage.tune') ?? '{}'));
} catch {}

const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(lite ? 0.5 : Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
scene.fog = new THREE.Fog(0x05070a, 6, 30);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 80);
// (The sandbox is darker: round 4, "as atmospheric and scary as possible".)
scene.add(new THREE.HemisphereLight(0x8a9aa8, 0x1a1c20, sandbox ? 0.24 : 0.35));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const skills = Object.fromEntries(Object.keys(SKILLS).map((k) => [k, 0]));
try {
  Object.assign(skills, JSON.parse(localStorage.getItem('triage.skills') ?? '{}'));
} catch {}

// Round 2: the pause menu's settings (playtest: "Look Y is inversed, I hate that, should be an option"). Not inverted
// by default: mouse up looks up.
const settings = { invertY: false, sensitivity: 1, volume: 0.8, radar: true };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('triage.settings') ?? '{}'));
} catch {}
const saveSettings = () => {
  try {
    localStorage.setItem('triage.settings', JSON.stringify(settings));
  } catch {}
};

// Who is who (Rocketbox, MIT). The officer: a patrol officer (a security officer's uniform repainted POLICE by
// tools/convert/people.mjs). The infected and the trapped: the hospital's own staff (doctors, nurses, paramedics) and
// the people who came in that night.
const CAST = {
  officer: ['Police_Female_Patrol', 'Female_Adult_01'],
  infected: ['Medical_Male_02', 'Medical_Female_02', 'Male_Adult_06', 'Female_Adult_05', 'Medical_Male_03', 'Medical_Female_01', 'Male_Adult_08', 'Female_Adult_12'],
  trapped: ['Female_Adult_03', 'Male_Adult_04', 'Medical_Female_03', 'Male_Adult_10', 'Female_Adult_08', 'Medical_Male_01'],
  fallen: ['Security_Male_01', 'Male_Adult_16']
};

const world = {
  settings, tune,
  sandbox: sandbox ? { mode: 'charge', auto: true, every: 3.5, max: lite ? 3 : 7, next: 2.5, spawned: 0, pending: 0 } : null,
  hitstop: 0,
  // Round 4: how deafened she is (0..1, audio.mjs muffles and rings by it), the shot's flash on the exposure, the
  // gun smoke hanging in the room.
  ears: 0, exposure: 0, haze: 0,
  // The shot lights the room: the exposure punched up, a flash on the screen from the muzzle, smoke in the air.
  gunPunch(size, at) {
    const k = this.tune.flash ?? 1;
    this.exposure = Math.min(2.4, this.exposure + 0.75 * size * k);
    this.fx.flash.intensity *= k;
    this.haze = Math.min(1, this.haze + 0.035 * size);
    const v = at.clone().project(this.camera);
    this.hud?.flash((v.x * 0.5 + 0.5) * 100, (0.5 - v.y * 0.5) * 100, Math.min(1, (0.5 + 0.3 * size) * k));
    // What this shot did, for the drive (the effects themselves are gone in a frame or two).
    this.lastPunch = { exposure: this.exposure, light: this.fx.flash.intensity, flash: this.hud?.flashA ?? 0, ears: this.ears };
    this.atmos?.shot(size);
  },
  scene, camera, renderer, skills, floor,
  grid: sandbox ? Object.assign(parse(SANDBOX), { lights: SANDBOX_LIGHTS }) : parse(),
  level: null, player: null, zombies: [], survivors: null, fx: null, hud: null, audio: null,
  pickups: [], corpses: [],
  score: { shots: 0, headshots: 0, kills: 0, stealthKills: 0, meleeKills: 0 },
  state: 'loading', result: null, time: 0,
  // The longest step one frame may take (s). Headless Chrome's software GL runs at 2–3 fps: the drive raises it.
  dtMax: Number(params.get('dtmax') ?? 0.05),
  // A sound at `pos` that carries `radius` metres: the infected nearby come to look; the close ones come running.
  noise(pos, radius) {
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const d = Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z);
      if (d < radius) z.alert(pos, d < radius * 0.45);
    }
  },
  // A ray against the infected (their parts) and the building (walls, floor, ceiling, doors, furniture): the nearest
  // hit, or null. A building hit carries the surface's normal (for the bullet hole); an infected hit, the bone.
  trace(origin, dir, max) {
    let best = null;
    const ray = new THREE.Raycaster(origin, dir, 0, max);
    const wall = ray.intersectObjects(this.level.shootables, false)[0];
    if (wall) {
      const normal = wall.face ? wall.face.normal.clone().transformDirection(wall.object.matrixWorld) : dir.clone().negate();
      if (normal.dot(dir) > 0) normal.negate();
      best = { point: wall.point, dist: wall.distance, normal, metal: /steel|machine|shelf|frame|rail/.test(wall.object.name) || !wall.object.name };
    }
    const oc = new THREE.Vector3();
    for (const z of this.zombies) {
      for (const s of z.spheres()) {
        oc.subVectors(s.center, origin);
        const t = oc.dot(dir);
        if (t < 0 || t > (best?.dist ?? max)) continue;
        const d2 = oc.lengthSq() - t * t;
        if (d2 > s.radius * s.radius) continue;
        const dist = t - Math.sqrt(s.radius * s.radius - d2);
        if (!best || dist < best.dist) best = { point: origin.clone().addScaledVector(dir, dist), dist, zombie: z, part: s.part, bone: s.bone, center: s.center };
      }
    }
    return best;
  },
  // Blood flung on past a hit: onto the wall or the floor behind, if one is close.
  bloodBehind(point, dir, size) {
    const ray = new THREE.Raycaster(point.clone().addScaledVector(dir, 0.3), dir.clone().add(new THREE.Vector3(0, -0.25, 0)).normalize(), 0, 3.2);
    const hit = ray.intersectObjects([this.level.walls, ...this.level.floors], false)[0];
    if (!hit?.face) return;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    this.fx.splat(hit.point, n, size * (1.2 - hit.distance / 4));
  },
  // What E would do right now.
  nearest() {
    const p = this.player;
    const c = toCell(p.pos.x, p.pos.z);
    const stealth = p.stealthTarget();
    if (stealth) return { kind: 'stealth', zombie: stealth, label: 'E · Knife it, quietly' };
    if (p.hidden) return null;
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      const d = Math.hypot(pk.pos.x - p.pos.x, pk.pos.z - p.pos.z);
      if (d < 1.4) return { kind: 'pickup', pickup: pk, label: `E · Take the ${pk.def.label.toLowerCase()}` };
    }
    for (const room of this.grid.rooms) {
      if (room.open || room.lost) continue;
      const { x, z } = toWorld(room.door.x, room.door.z);
      const d = Math.hypot(x - p.pos.x, z - p.pos.z);
      if (d < 1.9 && !room.floor.some((f) => f.x === c.x && f.z === c.z)) return { kind: 'door', room, label: `E · Open the door (${room.people.length} inside)` };
    }
    // Round 4: a desk or a bed to get under.
    const spot = p.hideSpot();
    if (spot && !p.moving) return { kind: 'hide', spot, label: `E · Hide under the ${spot.kind}` };
    return null;
  },
  promptFor() {
    return this.nearest()?.label ?? null;
  },
  interact() {
    const n = this.nearest();
    if (!n) return;
    if (n.kind === 'stealth') this.player.stealthKill(n.zombie);
    else if (n.kind === 'door') this.survivors.open(n.room);
    else if (n.kind === 'pickup') takePickup(n.pickup);
    else if (n.kind === 'hide') this.player.hide(n.spot);
  },
  over(how) {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.result = how;
    document.exitPointerLock?.();
    setTimeout(() => endScreen(), how === 'out' ? 800 : 2600);
  }
};
window.__game = world;

// Pickups on the floor: the thing itself (guns.mjs's models) on a faint ring; a glowing box if there is no model.
const pickupMat = { ammo: 0xe0c060, weapon: 0x80c0ff, medkit: 0xff6a6a };
function addPickup(def, x, z, extra = {}) {
  const g = new THREE.Group();
  const kit = world.gunKit;
  const model = def.kind === 'weapon' ? kit?.buildPickup?.(def.weapon) : kit?.buildAmmo?.(def.kind === 'medkit' ? 'medkit' : def.ammoType === 'shells' ? 'shells' : 'pistol');
  if (model) {
    g.add(model);
    g.userData.still = true;
    model.rotation.y = Math.random() * 6;
  } else {
    const box = new THREE.Mesh(new THREE.BoxGeometry(def.kind === 'weapon' ? 0.7 : 0.3, 0.14, 0.22), new THREE.MeshPhongMaterial({ color: pickupMat[def.kind], emissive: pickupMat[def.kind], emissiveIntensity: 0.35 }));
    box.position.y = 0.12;
    g.add(box);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.5, 32), new THREE.MeshBasicMaterial({ color: pickupMat[def.kind], transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);
  g.position.set(x, 0, z);
  scene.add(g);
  const pk = { def, pos: g.position, obj: g, taken: false, ...extra };
  world.pickups.push(pk);
  return pk;
}
function takePickup(pk) {
  const p = world.player;
  const def = pk.def;
  if (def.kind === 'medkit') {
    if (p.hp >= p.maxHp && !p.bleeding) return world.hud.hint('you are not hurt');
    p.heal(def.amount);
    world.hud.toast('Medkit: patched up, bleeding stopped', 'good');
  } else if (def.kind === 'ammo') {
    const w = Object.values(p.weapons).find((w) => w?.def.ammoType === def.ammoType);
    if (w) w.reserve += def.amount;
    else p.bank[def.ammoType] = (p.bank[def.ammoType] ?? 0) + def.amount;
    world.hud.toast(`+${def.amount} ${def.label.toLowerCase()}`);
    world.audio.play('pickup');
  } else if (def.kind === 'weapon') {
    const wd = WEAPONS[def.weapon];
    const slot = wd.slot;
    const old = p.weapons[slot];
    if (old) {
      // The old one goes on the floor here, with its ammo.
      const back = { kind: 'weapon', weapon: Object.keys(WEAPONS).find((k) => WEAPONS[k] === old.def), label: old.def.name };
      addPickup(back, p.pos.x, p.pos.z, { mag: old.mag, reserve: old.reserve });
    }
    p.weapons[slot] = wd.melee ? { def: wd } : { def: wd, mag: pk.mag ?? wd.mag, reserve: (pk.reserve ?? wd.reserve) + (p.bank[wd.ammoType] ?? 0) };
    if (!wd.melee) p.bank[wd.ammoType] = 0;
    p.switchTo(slot);
    world.hud.toast(`${wd.name}${old ? `, swapped for the ${old.def.name.toLowerCase()}` : ''}`);
    world.audio.play('pickup');
  }
  pk.taken = true;
  pk.obj.removeFromParent();
}

let people = null, who = null;
const tint = new THREE.Color(0x5a665b);
async function build() {
  const grid = world.grid;
  world.fx = new FX(scene);
  world.audio = new Audio(world);
  world.fx.audio = world.audio;
  world.hud = new HUD(world);
  world.level = await buildLevel(grid, scene);
  // The dying light buzzes as it stutters.
  world.level.onDying = (at) => world.audio?.play('zap', at);
  world.gunKit = await import('./guns.mjs').catch(() => null);
  people = new People({ renderer, scene, camera });
  const cast = (await people.list()).map((p) => p.name);
  who = (names, i) => {
    const have = names.filter((n) => cast.includes(n));
    return have.length ? have[i % have.length] : 1 + (i % 11);
  };
  // The officer.
  world.player = new Player(world, await people.spawn(who(CAST.officer, 0)), grid.start);
  world.survivors = new Survivors(world);
  await world.survivors.populate(people, (i) => who(CAST.trapped, i));
  // The infected: the map's, plus two more a floor, greyed.
  const spawns = [...cellsOf(grid, 'Z').map((c) => ({ ...c, standing: false })), ...cellsOf(grid, 'z').map((c) => ({ ...c, standing: true })), ...cellsOf(grid, 'X').map((c) => ({ ...c, crawler: true }))];
  for (let i = 0; i < (sandbox ? 0 : (floor - 1) * 2); i++) {
    const corridor = [];
    for (let z = 0; z < grid.h; z++) for (let x = 0; x < grid.w; x++) if (grid.cells[z][x] === '.' && Math.hypot(x - grid.start.x, z - grid.start.z) > 8) corridor.push({ x, z });
    spawns.push({ ...corridor[Math.floor(Math.random() * corridor.length)], standing: Math.random() < 0.5 });
  }
  if (params.get('nozombies') !== '1') {
    let n = 0;
    for (const s of spawns) {
      const body = await people.spawn(who(CAST.infected, n++), { tint });
      world.zombies.push(new Zombie(world, body, s, { standing: s.standing, crawler: s.crawler }));
    }
  }
  // Fallen officers: a body, a pool, their spare clips.
  for (const k of cellsOf(grid, 'K')) {
    const { x, z } = toWorld(k.x, k.z);
    const body = await people.spawn(who(CAST.fallen, world.corpses.length));
    const g = new THREE.Group();
    g.add(body.outer);
    g.position.set(x + 0.3, 0, z);
    g.rotation.y = Math.random() * 6;
    scene.add(g);
    const anim = new Animator(body);
    anim.play({ full: 'Death01', once: true, fade: 0 });
    anim.update(5);
    world.corpses.push({ group: g, anim });
    world.fx.decal(x, z, 0.8);
    addPickup(PICKUPS.K, x - 0.4, z + 0.3);
  }
  for (const it of grid.items) {
    if (!'PAGUHMY'.includes(it.type)) continue;
    const { x, z } = toWorld(it.x, it.z);
    addPickup(PICKUPS[it.type], x, z);
  }
  if (sandbox) {
    // Every gun, ammo without end; the first infected's body loaded now so the first spawn does not stall.
    const p = world.player;
    p.weapons.pistol.reserve = 999;
    p.weapons.long = { def: WEAPONS.rifle, mag: WEAPONS.rifle.mag, reserve: 999 };
    p.weapons.melee = { def: WEAPONS.bat };
    await people.base(who(CAST.infected, 0));
    document.body.classList.add('sandbox');
    world.hud.sandboxPanel?.();
  }
  world.fear = new Fear(world);
  world.atmos = new Atmos(world, { lite });
  world.radar = new Radar(world, document.getElementById('radar'));
  world.radar.canvas.parentElement.hidden = !settings.radar;
  applyVolume();
  world.state = 'title';
  document.getElementById('loading').hidden = true;
  if (auto) start();
  else if (sandbox) world.hud.sandboxTitle(start);
  else world.hud.title(start);
}

// ---- the sandbox: the infected through the doors ---------------------------------------------------------------------
// Modes: charge (they come running, knowing where she is), walk (they shamble towards her), still (targets standing
// about the room). Z one, X five, K clears them, B automatic on/off, N the mode.
const MODES = ['charge', 'walk', 'still'];
async function spawnZombie() {
  const S = world.sandbox;
  if (!S || !people || world.zombies.filter((z) => z.alive).length + S.pending >= S.max + 6) return;
  S.pending++;
  try {
    const grid = world.grid;
    const p = world.player;
    let cell;
    if (S.mode === 'still') {
      const free = [];
      for (let z = 3; z < 9; z++) for (let x = 1; x < grid.w - 1; x++) if (walkable(grid, x, z) && Math.hypot(x - toCell(p.pos.x, p.pos.z).x, z - toCell(p.pos.x, p.pos.z).z) > 3) free.push({ x, z });
      cell = free[Math.floor(Math.random() * free.length)];
    } else {
      // Out of sight, in the corridor behind the doors.
      const x = 1 + Math.floor(Math.random() * (grid.w - 2));
      cell = { x, z: 1 };
    }
    const body = await people.spawn(who(CAST.infected, S.spawned++), { tint });
    const z = new Zombie(world, body, cell, { standing: S.mode === 'still' });
    z.sandboxMode = S.mode;
    if (S.mode === 'still') {
      z.dummy = true;
      z.yaw = Math.atan2(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
    } else if (p.hidden) {
      // She is under something: they come in not knowing where she is.
      z.lostHer = true;
    } else if (S.mode === 'charge') z.alert(p.pos, true);
    else {
      z.lastSeen = { x: p.pos.x, z: p.pos.z };
      z.state = 'investigate';
      z.path = null;
      z.playState();
    }
    world.zombies.push(z);
  } finally {
    S.pending--;
  }
}
// For the drive.
world.sandboxSpawn = () => spawnZombie();
world.sandboxKey = (code) => sandboxKey(code);
function sandboxTick(dt) {
  const S = world.sandbox;
  if (!S) return;
  const p = world.player;
  for (const w of Object.values(p.weapons)) if (w && !w.def.melee) w.reserve = Math.max(w.reserve, 999);
  const alive = world.zombies.filter((z) => z.alive);
  if (S.auto) {
    S.next -= dt;
    if (S.next <= 0) {
      S.next = S.every;
      if (alive.length + S.pending < S.max) spawnZombie();
    }
  }
  // The hunters never lose her; the walkers keep coming to where she is.
  S.seek = (S.seek ?? 0) - dt;
  if (S.seek <= 0) {
    S.seek = 1;
    for (const z of alive) {
      // Round 4: not while she is hidden, and not once one has lost her and given up (then it has only its eyes and
      // ears, like anywhere else: "taking advantage of zombie stupidness").
      if (p.hidden || z.lostHer) {
        if (z.down && !z.lostHer && !p.hidden) z.target = p;
        continue;
      }
      if (z.sandboxMode === 'charge' && z.state !== 'chase' && !['attack', 'stagger', 'floored', 'rising', 'search', 'stumble'].includes(z.state) && !z.down) z.alert(p.pos, true);
      else if (z.sandboxMode === 'walk' && (z.state === 'wander' || z.state === 'idle' || z.state === 'investigate')) {
        z.lastSeen = { x: p.pos.x, z: p.pos.z };
        if (z.state !== 'investigate') ((z.state = 'investigate'), z.playState());
        z.path = null;
      } else if (z.down) z.target = p;
    }
  }
  // The dead: the last ten stay where they fell, the rest go.
  const dead = world.zombies.filter((z) => !z.alive);
  for (const z of dead.slice(0, Math.max(0, dead.length - 10))) {
    z.dispose();
    world.zombies.splice(world.zombies.indexOf(z), 1);
  }
}
function sandboxKey(code) {
  const S = world.sandbox;
  if (code === 'KeyZ') spawnZombie();
  else if (code === 'KeyX') for (let i = 0; i < 5; i++) setTimeout(spawnZombie, i * 350);
  else if (code === 'KeyK') {
    for (const z of [...world.zombies]) {
      z.dispose();
      world.zombies.splice(world.zombies.indexOf(z), 1);
    }
  } else if (code === 'KeyB') {
    S.auto = !S.auto;
    world.hud.toast(S.auto ? 'They keep coming' : 'No more unless you call them (Z, X)');
  } else if (code === 'KeyN') {
    S.mode = MODES[(MODES.indexOf(S.mode) + 1) % MODES.length];
    world.hud.toast({ charge: 'Charge: they come running (until they lose you)', walk: 'Walk: they shamble at you', still: 'Still: targets standing about the room' }[S.mode]);
  } else return false;
  return true;
}
// The tuning panel (`): the camera's and the guns' numbers, live, kept in localStorage.
function toggleTune() {
  const open = world.hud.tunePanel(tune, TUNE_DEFAULTS, () => {
    try {
      localStorage.setItem('triage.tune', JSON.stringify(tune));
    } catch {}
  });
  world.tuneOpen = open;
  if (open) document.exitPointerLock?.();
  else if (!auto) canvas.requestPointerLock?.();
}

function start() {
  world.state = 'playing';
  world.audio.wake();
  applyVolume();
  if (!auto) renderer.domElement.requestPointerLock?.();
  world.hud.toast(`Floor ${floor}. ${world.survivors.total} people are still in the rooms.`, '', 4500);
}
function applyVolume() {
  world.audio?.setVolume?.(settings.volume);
  if (world.audio?.master && !world.audio.setVolume) world.audio.master.gain.value = settings.volume;
}

// Paused: Esc (the mouse is freed) or P. Resume, the settings, restart, the controls.
function pause() {
  if (world.state !== 'playing') return;
  world.state = 'paused';
  for (const k of Object.keys(held)) held[k] = false;
  Object.assign(world.player.input, { fwd: 0, side: 0, sprint: false, aim: false, fire: false });
  world.hud.pause(settings, {
    resume() {
      world.state = 'playing';
      last = performance.now();
      if (!auto) canvas.requestPointerLock?.();
    },
    change(key, value) {
      settings[key] = value;
      saveSettings();
      if (key === 'volume') applyVolume();
      if (key === 'radar') world.radar.canvas.parentElement.hidden = !value;
    },
    restart() {
      location.reload();
    }
  });
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && world.state === 'playing' && !auto && !world.tuneOpen) pause();
});

function endScreen() {
  const s = world.survivors;
  const p = world.player;
  const points = s.counts.saved + (p.bites === 0 && world.result === 'out' ? 2 : 0) + (world.score.stealthKills >= 3 ? 1 : 0);
  if (world.result === 'out') world.audio.play('win');
  world.hud.end(world.result, world.score, skills, points, (sk) => {
    localStorage.setItem('triage.skills', JSON.stringify(sk));
    const next = new URLSearchParams(location.search);
    next.set('floor', String(world.result === 'out' ? floor + 1 : floor));
    location.search = next.toString();
  });
}

// Input: pointer lock for the mouse; keys for the rest. The drive sets `__game.player.input` directly.
const canvas = renderer.domElement;
canvas.addEventListener('click', () => {
  if (world.tuneOpen) toggleTune();
  if (world.state === 'playing' && !auto && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});
addEventListener('mousemove', (e) => {
  if (world.state !== 'playing' || !world.player?.alive) return;
  if (document.pointerLockElement !== canvas && !auto) return;
  const p = world.player;
  const s = (p.aiming ? 0.0016 : 0.0026) * settings.sensitivity;
  p.camYaw -= e.movementX * s;
  // Mouse up looks up (unless the setting says otherwise).
  p.camPitch = Math.max(-0.6, Math.min(0.8, p.camPitch - e.movementY * s * (settings.invertY ? -1 : 1)));
});
addEventListener('mousedown', (e) => {
  if (world.state !== 'playing') return;
  const inp = world.player.input;
  if (e.button === 2) inp.aim = true;
  if (e.button === 0 && (document.pointerLockElement === canvas || auto)) ((inp.fire = true), (inp.firePressed = true));
});
addEventListener('mouseup', (e) => {
  const inp = world.player?.input;
  if (!inp) return;
  if (e.button === 2) inp.aim = false;
  if (e.button === 0) inp.fire = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());
const KEYS = { KeyW: ['fwd', 1], KeyS: ['fwd', -1], KeyA: ['side', -1], KeyD: ['side', 1], ArrowUp: ['fwd', 1], ArrowDown: ['fwd', -1], ArrowLeft: ['side', -1], ArrowRight: ['side', 1] };
const held = {};
addEventListener('keydown', (e) => {
  if (world.state !== 'playing' || !world.player) return;
  const inp = world.player.input;
  if (sandbox && e.code === 'Backquote') return toggleTune();
  if (sandbox && !e.repeat && sandboxKey(e.code)) return;
  // The sandbox: 2 again changes the long gun (SMG, shotgun, rifle).
  if (sandbox && e.code === 'Digit2' && world.player.current === 'long' && !e.repeat) {
    const order = ['smg', 'shotgun', 'rifle'];
    const p = world.player;
    const next = order[(order.indexOf(Object.keys(WEAPONS).find((k) => WEAPONS[k] === p.weapons.long.def)) + 1) % order.length];
    p.weapons.long = { def: WEAPONS[next], mag: WEAPONS[next].mag, reserve: 999 };
    p.switchTo('long');
    return;
  }
  if (KEYS[e.code]) {
    held[e.code] = true;
    e.preventDefault();
  } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') inp.sprint = true;
  else if (e.code === 'KeyC' || e.code === 'ControlLeft') inp.crouch = true;
  else if (e.code === 'KeyQ') inp.cover = true;
  else if (e.code === 'KeyV') inp.shoulder = true;
  else if (e.code === 'KeyM') world.radar?.toggle();
  else if (e.code === 'KeyP' || e.code === 'Escape') pause();
  else if (e.code === 'KeyT') inp.torch = true;
  else if (e.code === 'KeyR') inp.reload = true;
  else if (e.code === 'KeyF') inp.melee = true;
  else if (e.code === 'KeyE') inp.interact = true;
  else if (e.code === 'Digit1') inp.slot = 'pistol';
  else if (e.code === 'Digit2') inp.slot = 'long';
  else if (e.code === 'Digit3') inp.slot = 'melee';
  else if (e.code === 'Digit4') inp.slot = 'knife';
  else if (e.code === 'Space') inp.aim = !inp.aim;
});
addEventListener('keyup', (e) => {
  const inp = world.player?.input;
  if (!inp) return;
  if (KEYS[e.code]) held[e.code] = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') inp.sprint = false;
});
function readHeld() {
  const inp = world.player.input;
  if (world.driven) return;
  let fwd = 0, side = 0;
  for (const [code, [axis, v]] of Object.entries(KEYS)) if (held[code]) axis === 'fwd' ? (fwd += v) : (side += v);
  inp.fwd = Math.sign(fwd);
  inp.side = Math.sign(side);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(world.dtMax, (now - last) / 1000);
  last = now;
  if (world.state === 'loading') return;
  // Hit-stop: a headshot kill holds time for a heartbeat.
  if (world.hitstop > 0) {
    world.hitstop -= dt;
    dt *= 0.12;
  }
  if (world.state === 'playing') sandboxTick(dt);
  world.time += dt;
  const running = world.state === 'playing' || world.state === 'over';
  if (running) {
    readHeld();
    const t0 = performance.now();
    world.player.update(dt, camera);
    // The drive's camera (a side view of her grip, say): { pos: [x,y,z], look: [x,y,z], fov }.
    if (world.debugCam) {
      camera.position.set(...world.debugCam.pos);
      camera.lookAt(...world.debugCam.look);
      if (world.debugCam.fov && camera.fov !== world.debugCam.fov) ((camera.fov = world.debugCam.fov), camera.updateProjectionMatrix());
    }
    const t1 = performance.now();
    for (const z of world.zombies) z.update(dt);
    const t2 = performance.now();
    world.survivors.update(dt);
    for (const c of world.corpses) c.anim.update(dt);
    const movers = [world.player, ...world.zombies.filter((z) => z.alive && !z.down), ...world.survivors.list.filter((s) => s.state === 'fleeing')];
    world.level.update(dt, world.time, movers);
    world.fx.update(dt);
    world.fear.update(dt);
    world.atmos.update(dt);
    world.audio?.tick?.(dt);
    world.ears = Math.max(0, world.ears - dt * 0.16);
    world.haze = Math.max(0, world.haze - dt * 0.02);
    if (settings.radar) world.radar.update(dt);
    const t3 = performance.now();
    // Where the frame went (ms), for the drive and the README: the slowest frame so far, by section.
    const cost = { player: t1 - t0, zombies: t2 - t1, rest: t3 - t2 };
    if (!world.prof || t3 - t0 > world.prof.total) world.prof = { total: t3 - t0, ...cost, at: world.time };
    world.frames = (world.frames ?? 0) + 1;
    for (const pk of world.pickups) if (!pk.taken && !pk.obj.userData.still) pk.obj.rotation.y += dt;
    // The stairs.
    if (world.state === 'playing') {
      const c = toCell(world.player.pos.x, world.player.pos.z);
      if (world.grid.exit && c.x === world.grid.exit.x && c.z === world.grid.exit.z) world.over('out');
      // (The heartbeat is fear.mjs's now: the clock running out is one more thing it hears.)
    }
    world.hud.update(dt);
    const t4 = performance.now();
    if (t4 - t0 > 400) (world.slow ??= []).push({ at: +world.time.toFixed(1), ...cost, hud: +(t4 - t3).toFixed(0), total: +(t4 - t0).toFixed(0) });
  } else if (world.state === 'title') {
    // A slow look at the ward behind the title.
    world.player.camYaw += dt * 0.08;
    world.player.placeCamera(camera, dt);
    world.player.anim.update(dt);
    for (const z of world.zombies) z.update(dt);
    world.level.update(dt, world.time);
  }
  // The shot's flash on the whole picture, drawn at least once, then gone in a few hundredths of a second.
  renderer.toneMappingExposure = 1 + world.exposure;
  const r0 = performance.now();
  renderer.render(scene, camera);
  const r1 = performance.now();
  world.exposure *= Math.exp(-dt * 24);
  if (world.exposure < 0.01) world.exposure = 0;
  world.renderMs = r1 - r0;
  if (r1 - r0 > 400) (world.slow ??= []).push({ at: +world.time.toFixed(1), render: +(r1 - r0).toFixed(0) });
}
requestAnimationFrame(frame);
build().catch((e) => {
  console.error(e);
  document.getElementById('loading').textContent = `Could not load: ${e.message}`;
});
