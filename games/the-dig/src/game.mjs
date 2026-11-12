// The Dig. Dig down into an infinite deep; find the rooms Claude planted last night; answer the stone to wake the
// portal; go through to a secret world made for today; bring treasure home to the case. Nothing punishes: the
// time bars only tell you, dying costs nothing in the pack (round 5: you come round at the base, up top, and find your
// own way back down), and every session can be the first or the fifth of the day.
import * as THREE from 'three';
import { B, BLOCKS, paintAtlas, isPlant, isTorch, torchFor } from './blocks.mjs';
import { World, env } from './world.mjs';
import { Sky, raw } from './sky.mjs';
import { Selection } from './overlay.mjs';
import { itemIcons } from './items.mjs';
import { caveGenerator, roomParts } from './gen-cave.mjs';
import { secretGenerator } from './gen-secret.mjs';
import { buildDistrict, textsAt, fingerprint, blockPrint } from './districts.mjs';
import { Player } from './player.mjs';
import { makeInput, touchDevice } from './input.mjs';
import { Mobs } from './mobs.mjs';
import { Hand, SLOTS } from './weapons.mjs';
import { scan, Glows, PULSE } from './pulse.mjs';
import { makeHud, loadedAmmo } from './hud.mjs';
import { sfx, unlockAudio, setHum, setMuted, isMuted, samplesLoaded } from './audio.mjs';
import { hashString, rng } from './noise.mjs';
import { AMMO, AMMO_BY_ID, ODDS, roll } from './ammo.mjs';

const Q = new URLSearchParams(location.search);
const LITE = Q.has('lite');
const DTMAX = Number(Q.get('dtmax')) || 0.05;
const LOCAL = 'the-dig-save-v1';
const PENDING = 'the-dig-pending-answers';
// Minecraft's sky: blue overhead, paler at the horizon (the fog wears the horizon's colour).
// ?dusk=1 (round 7): the cave's sky at dusk, the daylight down to under half (the ship's lights show).
let dusk = Q.has('dusk');
const DUSK_TOP = raw(0x3c4486), DUSK_HORIZON = raw(0xe8a070);
const SKY_TOP = raw(0x7ba4ff), SKY_HORIZON = raw(0xc4dcff), BLACK = raw(0x000000), WHITE = raw(0xffffff);
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = Q.get('date') || localDate();

// ── the page ──
const renderer = new THREE.WebGLRenderer({ antialias: !touchDevice && !LITE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touchDevice ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('view').append(renderer.domElement);
if (touchDevice) document.body.classList.add('touch');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 500);
scene.add(camera);
scene.fog = new THREE.Fog(0x000000, 10, 60);
scene.background = new THREE.Color(0x000000);
const sky = new Sky(scene);
const selection = new Selection(scene);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
const RADIUS = LITE ? 2 : touchDevice ? 3 : 4;
const VRADIUS = LITE ? 1 : 2;

// The api/ calls ask a server of your own (save, answers, today's rooms, trophies: CLAUDE.md lists them). With none
// (the default), they are not made at all and the game keeps everything in this browser; ?server=1 turns them on.
const SERVER = Q.has('server');
async function api(path, opts) {
  if (path.startsWith('api/') && !SERVER) return null;
  try {
    const r = await fetch(path, opts);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const readLocal = (k, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeLocal = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

// ── the save, the day ──
const startNote = document.getElementById('startNote');
const serverSave = await api('api/save');
const localSave = readLocal(LOCAL, null);
let save = [serverSave, localSave].filter((s) => s?.seed).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0];
if (Q.has('fresh') || !save)
  save = { v: 1, seed: Number(Q.get('seed')) || ((Math.random() * 1e9) | 0), edits: [], player: null, rooms: [], lastTorch: null, pack: null };
// Rubble and standard rounds never run out (round 3); the special ammo is counted, kind by kind. The bow went in
// round 4 (the grappling hook has its slot), and its special arrows are the multitool's bolts.
const pack = Object.assign({ torches: 24, coal: 0, iron: 0, flint: 0, crystal: 0 }, save.pack ?? {});
for (const k of ['rubble', 'rounds', 'arrows']) delete pack[k];
pack.ammo = { ...(pack.ammo ?? {}) };
pack.loaded = { gun: pack.loaded?.gun ?? null };
pack.seen = [...(pack.seen ?? [])];
const takenCaches = new Set(save.caches ?? []);
// Round 5: lairs whose garrison is all dead, and vaults whose cache is taken (the compass stops showing them).
const cleared = new Set(save.cleared ?? []);

let day = await api(`api/today?date=${TODAY}`);
if (!day?.plants) day = { date: TODAY, source: 'sample', ...(await (await fetch('sample-plants.json')).json()) };
const dayKey = day.source === 'sample' ? 'sample' : day.date;
const answered = new Map(); // `${date}|${plantId}` → text
for (const a of (await api(`api/answers`)) ?? []) answered.set(`${a.date}|${a.plantId}`, a.text);
// Answers carved while the server was out of reach go now.
const pending = readLocal(PENDING, []);
for (const a of pending) answered.set(`${a.date}|${a.plantId}`, a.text);
if (pending.length) {
  const left = [];
  for (const a of pending) if (!(await post('api/answer', a))) left.push(a);
  writeLocal(PENDING, left);
}

// ── the cave ──
const cave = caveGenerator(save.seed);
const rooms = save.rooms ?? [];
for (const r of rooms) if (answered.has(`${r.date}|${r.plantId}`)) r.live = true;
const startAt = save.player?.pos ?? cave.spawn();
// Each room goes into the cave before the next is placed, so placing keeps them apart (round 1 added them all at the
// end, and two rooms could cut into each other). Round 4 spreads them out and keeps them in the rock; a room placed
// the old way and not yet answered is placed again (one already answered stays where it was found).
for (let i = rooms.length - 1; i >= 0; i--) if (!rooms[i].placed && !rooms[i].live && rooms[i].date === dayKey) rooms.splice(i, 1);
cave.structures.push(...rooms);
// ── their districts (DIG-007; districts.mjs has the why) ──
// Each district file is data; the engine builds it into the cave before the first chunk is made, and before the day's
// rooms are placed (a room keeps out of a district). Where it landed is kept in the save (SCOPE §6.3: decided once per
// player, then kept). The record is what you have read, in the order you read it; the tuning finds you have read raise
// the pulse's reach.
const placedDistricts = save.districts && typeof save.districts === 'object' ? { ...save.districts } : {};
const record = Array.isArray(save.record) ? save.record : []; // [{ d, t, on }]
const tuned = save.tuned && typeof save.tuned === 'object' ? save.tuned : {}; // district id → reach
const districts = [];
{
  const pub = await api('districts/styles.json');
  const index = await api('districts/index.json');
  for (const id of index?.districts ?? []) {
    const d = await api(`districts/${id}.json`);
    const style = pub?.styles?.find((s) => s.id === d?.style);
    if (!d || !style) continue;
    const built = buildDistrict(cave, d, style, placedDistricts[id]?.at ?? null);
    if (!built) continue;
    placedDistricts[id] = { at: built.at };
    districts.push(built);
  }
}
const districtById = new Map(districts.map((b) => [b.S.district.id, b]));
day.plants.forEach((plant, i) => {
  if (rooms.some((r) => r.date === dayKey && r.plantId === plant.id)) return;
  const at = cave.placeRoom({ x: startAt.x, y: startAt.y, z: startAt.z }, hashString(dayKey + plant.id), i, day.plants.length);
  const room = { ...at, placed: 2, date: dayKey, plantId: plant.id, plant, live: answered.has(`${dayKey}|${plant.id}`) };
  rooms.push(room);
  cave.structures.push(room);
});
let atlas = paintAtlas();
const caveWorld = new World({ generator: cave, scene, texture: atlas, radius: RADIUS, vradius: VRADIUS });
caveWorld.loadEdits(save.edits);
let world = caveWorld;

const player = new Player(camera);
player.pos.set(startAt.x, startAt.y, startAt.z);
player.yaw = save.player?.yaw ?? startAt.yaw ?? 0;
player.pitch = save.player?.pitch ?? 0;
player.health = save.player?.health ?? 20;
let lastTorch = save.lastTorch;

const mobs = new Mobs(scene, world);
mobs.caveSpawning = !Q.has('peaceful');
mobs.surface = cave.height;
mobs.safeAt = (x, y, z) => cave.settle.all.length > 0 && cave.settle.safeAt(Math.floor(x), Math.floor(y), Math.floor(z));
mobs.camera = camera;
const hand = new Hand(camera, scene, world, mobs, atlas);
hand.player = player;

// ── the HUD and the input ──
const hud = makeHud({
  // Tapping the weapon already in hand opens its ammo.
  onSlot: (i) => {
    if (i === hand.slot && SLOTS[i].ammo) return openAmmo(SLOTS[i].ammo);
    hand.select(i);
    hud.slots(hand.slot, pack);
  },
  onMenu: () => openMenu()
});
hud.ammoHint = touchDevice ? 'tap it again in the hotbar to load' : 'press its number again to load · Q swaps';
hud.lockChanged = (locked) => {
  if (!locked && started && !hud.panelOpen() && !touchDevice) openMenu();
};
hud.unlockAudio = unlockAudio;
const I = makeInput(renderer.domElement, hud);
const freeMouse = () => {
  I.release();
  if (document.pointerLockElement) document.exitPointerLock();
};
const relock = () => {
  if (!touchDevice) renderer.domElement.requestPointerLock?.();
};

// ── portals: a swirl where the opening is ──
const swirlMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 } },
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float t; varying vec2 vUv;
    void main(){ vec2 p = vUv - 0.5; float r = length(p); float a = atan(p.y, p.x);
      float s = sin(a * 3.0 + r * 22.0 - t * 3.2) * 0.5 + 0.5;
      vec3 c = mix(vec3(0.32, 0.12, 0.62), vec3(0.88, 0.66, 1.0), s) + (0.5 - r) * 0.5;
      gl_FragColor = vec4(c, 0.93); }`
});
const swirls = new Map();
function showSwirl(key, centre) {
  if (swirls.has(key)) return;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), swirlMat);
  m.position.set(...centre);
  scene.add(m);
  swirls.set(key, m);
}
function clearSwirls() {
  for (const m of swirls.values()) scene.remove(m);
  swirls.clear();
}
function caveSwirls() {
  for (const r of rooms) if (r.live) showSwirl(`${r.date}|${r.plantId}`, roomParts(r).portalCentre);
}
caveSwirls();

// ── state ──
let started = false;
let secret = null; // { gen, world, room, treasures, found }
let digTarget = null, digT = 0, digSound = 0;
let cutVoice = null; // the cutter's sound while it cuts (one continuous voice)
const quietCutter = () => {
  if (cutVoice) cutVoice.stop();
  cutVoice = null;
};
let active = Number(Q.get('minutes') || 0) * 60;
const warned = new Set();
let saveTimer = 0, stepT = 0, lavaT = 0;
let trophies = (await api('api/trophies')) ?? readLocal('the-dig-trophies', []);
const clock = new THREE.Clock();

// Standard rounds need no making now; the ore makes a few plain kinds of special ammo instead. The
// exotic ones only come from the portals, the caches and the brutes.
const RECIPES = [
  { makes: '4 flare rounds (multitool)', from: '1 iron + 1 coal', can: (p) => p.iron >= 1 && p.coal >= 1, run: (p) => { p.iron--; p.coal--; giveAmmo('flare', 4); } },
  { makes: '4 fire bolts (multitool)', from: '1 flint + 1 coal (dig gravel for flint)', can: (p) => p.flint >= 1 && p.coal >= 1, run: (p) => { p.flint--; p.coal--; giveAmmo('fire_arrow', 4); } },
  { makes: '3 drill bolts (multitool)', from: '1 crystal + 1 iron', can: (p) => p.crystal >= 1 && p.iron >= 1, run: (p) => { p.crystal--; p.iron--; giveAmmo('drill', 3); } }
];

// Ammo into the pack. A kind never had before gets the middle of the screen for a moment.
function giveAmmo(id, n) {
  const a = AMMO_BY_ID[id];
  if (!a) return;
  pack.ammo[id] = (pack.ammo[id] ?? 0) + n;
  const isNew = !pack.seen.includes(id);
  if (isNew) {
    pack.seen.push(id);
    sfx.discover();
  }
  hud.discover(a, n, isNew);
  hud.slots(hand.slot, pack);
}

function openAmmo(kind) {
  freeMouse();
  hud.ammo(kind, pack, (id) => {
    pack.loaded[kind] = id;
    hud.close();
    hud.slots(hand.slot, pack);
    relock();
  }, (mode) => {
    pack.fireMode = mode;
    hud.slots(hand.slot, pack);
  });
}
// Q: the next kind in the pack for the weapon in hand (and round to the standard).
function cycleAmmo() {
  const kind = SLOTS[hand.slot].ammo;
  if (!kind) return;
  const ids = [null, ...AMMO.filter((a) => a.for === kind && pack.ammo[a.id] > 0).map((a) => a.id)];
  const at = ids.indexOf(loadedAmmo(kind, pack).id);
  pack.loaded[kind] = ids[(at + 1) % ids.length];
  hud.slots(hand.slot, pack);
}

// A vault's cache holds what a portal's would; a lair's hoard what a brute carries. One lying about in the caves is
// mostly common. Opening a vault's cache, or a lair's last, takes the place off the compass.
function placeLoot(x, y, z) {
  const s = x === undefined || world !== caveWorld ? null : cave.lootAt(x, y, z);
  if (s?.type === 'vault') {
    cleared.add(s.key);
    hud.toast('The vault gave up its store.');
    return ODDS.portal;
  }
  if (s?.type === 'lair') return ODDS.brute;
  return ODDS.cache;
}

function crateLoot() {
  const got = [['coal', 2 + Math.floor(Math.random() * 3)]].filter(([, n]) => n > 0); // (round 7: flares are unlimited, none in crates)
  for (const [k, n] of got) pack[k] += n;
  hud.toast(`Crate: ${got.map(([k, n]) => `${n} ${k}`).join(', ')}`);
  if (Math.random() < 0.25) {
    const r = roll(Math.random, ODDS.cache);
    giveAmmo(r.id, Math.ceil(r.n / 2));
  }
}
function cacheLoot(x, y, z) {
  const r = roll(Math.random, placeLoot(x, y, z));
  giveAmmo(r.id, r.n);
}

function openMenu() {
  if (!started) return;
  I.release();
  if (document.pointerLockElement) document.exitPointerLock();
  const plants = rooms
    .filter((r) => r.date === dayKey)
    .map((r) => ({ title: r.plant.title, answered: r.live }));
  hud.menu(
    [
      { label: 'Keep digging', run: () => { hud.close(); relock(); } },
      { label: 'Craft', run: () => hud.craft(pack, RECIPES, craft) },
      { label: 'Trophy case', run: () => hud.trophies(trophies) },
      { label: 'The record', run: () => hud.record(recordEntries(), openMenu) },
      { label: isMuted() ? 'Sound on' : 'Sound off', run: () => { setMuted(!isMuted()); openMenu(); } },
      { label: 'Controls', run: () => hud.help(touchDevice) }
    ],
    { ...day, plants }
  );
}
async function textFile(path) {
  try {
    const r = await fetch(path);
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

// ── what they carved (DIG-007) ──
// A district's text, by district and text id (the secret's too).
function districtText(did, tid) {
  const b = districtById.get(did);
  const d = b?.S.district;
  return d && [...(d.texts ?? []), ...(d.secret?.texts ?? [])].find((t) => t.id === tid);
}
// The record, in the order read. A text whose district is gone from the server is left out, not marked missing.
function recordEntries() {
  return record
    .map((r) => ({ ...r, text: districtText(r.d, r.t), where: districtById.get(r.d)?.S.district.name }))
    .filter((r) => r.text);
}
function readCarved(here) {
  freeMouse();
  const d = here.S.district;
  hud.carved(here.texts, d.name, (t) => {
    if (!record.some((r) => r.d === d.id && r.t === t.id)) record.push({ d: d.id, t: t.id, on: TODAY });
    if (d.tuning?.text === t.id && !(tuned[d.id] >= d.tuning.reach)) {
      tuned[d.id] = d.tuning.reach;
      pulseReach = Math.max(pulseReach, d.tuning.reach);
      hud.toast('The pulse rings farther now.');
    }
    saveNow();
  });
}
function craft(r) {
  if (!r.can(pack)) return;
  r.run(pack);
  sfx.place();
  hud.slots(hand.slot, pack);
}

function saveNow() {
  const inCave = !secret;
  const pos = inCave ? player.pos : new THREE.Vector3(...roomParts(secret.room).standIn);
  save = {
    v: 1, seed: save.seed, savedAt: Date.now(), edits: caveWorld.editsList(), rooms, lastTorch, pack, caches: [...takenCaches], cleared: [...cleared], pins, told,
    districts: placedDistricts, record, tuned,
    player: { pos: { x: pos.x, y: pos.y, z: pos.z }, yaw: player.yaw, pitch: player.pitch, health: player.health }
  };
  writeLocal(LOCAL, save);
  post('api/save', save);
}
addEventListener('visibilitychange', () => {
  if (document.hidden && started) saveNow();
});

// ── the pulse (round 7, DIG-003; pulse.mjs has the why) ──
const glows = new Glows(scene);
const pins = Array.isArray(save.pins) ? save.pins : []; // [{ x, y, z }], yours: on the compass
const PINS_MAX = 12;
// The hints given once per cave (round 7: the pulse's, a few seconds into the first dig).
const told = save.told && typeof save.told === 'object' ? save.told : {};
let pulseReach = Math.max(PULSE.reach, ...Object.values(tuned).filter(Number.isFinite)), pulseHoldAt = null, pulseReadyAt = 0, lastPulse = null, stopCharge = null;
// An open cell counts when it is in the rock: something stops the sky over it (and that is not a tree), and it is not
// in the ship.
const TREE = new Set([B.LEAVES, B.LOG, B.BIRCH]);
function pulseHollow(x, y, z) {
  if (caveWorld.underSky(x, y, z)) return false;
  const [x0, y0, z0, x1, y1, z1] = cave.base().box;
  if (x >= x0 && x <= x1 && y >= y0 - 4 && y <= y1 && z >= z0 && z <= z1) return false;
  return !TREE.has(caveWorld.get(x, caveWorld.floorAt(x, z), z));
}
// A chamber with one of your tasks in it (DIG-012 fills these; until then, today's rooms not yet opened).
function inTaskRoom(x, y, z) {
  for (const r of rooms) {
    if (r.live || r.date !== dayKey) continue;
    if (x >= r.x && x < r.x + 9 && y >= r.y && y < r.y + 7 && z >= r.z && z < r.z + 9) return true;
  }
  return false;
}
function sendPulse(now) {
  const eye = player.eye(), dir = player.forward();
  const r = scan({ get: (x, y, z) => caveWorld.get(x, y, z), hollow: pulseHollow, task: inTaskRoom }, eye, dir, { reach: pulseReach });
  lastPulse = { ms: +r.ms.toFixed(2), samples: r.samples, open: r.open, glows: r.glows.length, at: now };
  glows.show(r.glows, now, eye);
  hud.ring();
  sfx.pulse();
  // The echoes, from the nearest few: panned by where they are, later the farther.
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  for (const g of r.glows.slice(0, 8)) {
    const v = new THREE.Vector3(g.x - eye.x, g.y - eye.y, g.z - eye.z).normalize();
    sfx.echo(g.kind, 0.3 + (g.d * 2) / 60, v.dot(right), g.d);
  }
  // It is loud: the brute hears it from about forty blocks.
  mobs.noise(player.pos, PULSE.loud, true);
  pulseReadyAt = now + PULSE.recharge;
}
// Each frame: a hold charges it (wall time), letting go when charged sends it; the button shows both.
function stepPulse(now) {
  const ready = secret ? 0 : Math.max(0, Math.min(1, 1 - (pulseReadyAt - now) / PULSE.recharge));
  if (I.pulse && pulseHoldAt === null) {
    pulseHoldAt = now;
    if (ready >= 1) stopCharge = sfx.pulseCharge(PULSE.hold);
  }
  const charge = pulseHoldAt === null || ready < 1 ? 0 : Math.min(1, (now - pulseHoldAt) / PULSE.hold);
  if (!I.pulse && pulseHoldAt !== null) {
    if (charge >= 1 && ready >= 1) sendPulse(now);
    pulseHoldAt = null;
    stopCharge?.();
    stopCharge = null;
  }
  hud.pulse(ready, charge);
  glows.update(now);
}
function pinAt(at) {
  pins.push({ x: +at.x.toFixed(1), y: +at.y.toFixed(1), z: +at.z.toFixed(1) });
  while (pins.length > PINS_MAX) pins.shift();
  sfx.place();
  hud.toast('Pinned. It is on the compass.');
  saveNow();
}
// A pin the crosshair is on (to take it off again).
function aimedPin() {
  const e = player.eye(), f = player.forward();
  let best = -1, ang = 0.06;
  pins.forEach((p, i) => {
    const a = new THREE.Vector3(p.x - e.x, p.y - e.y, p.z - e.z).angleTo(f);
    if (a < ang) [best, ang] = [i, a];
  });
  return best;
}

// ── what the crosshair is on ──
function lookTarget() {
  return world.raycast(player.eye(), player.forward(), 5);
}
function roomAtLectern(t) {
  return rooms.find((r) => roomParts(r).lectern.every((v, i) => v === [t.x, t.y, t.z][i]));
}
function nearestTreasure() {
  if (!secret) return null;
  let best = null;
  const eye = player.eye();
  for (const tr of secret.treasures) {
    if (tr.taken) continue;
    const d = tr.mesh.position.distanceTo(eye);
    if (d < 3 && (!best || d < best.d)) best = { tr, d };
  }
  return best?.tr ?? null;
}
const treasureName = (tr) => (tr.t ? tr.t.name : `${AMMO_BY_ID[tr.ammo.id].name} cache`);

// ── the stone and the portal ──
function readStone(room) {
  I.release();
  if (document.pointerLockElement) document.exitPointerLock();
  const k = `${room.date}|${room.plantId}`;
  hud.lectern(room.plant, { answered: room.live, previous: answered.get(k), date: room.date === 'sample' ? TODAY : room.date, source: room.date === 'sample' ? 'sample' : 'nightly' }, async (text) => {
    const row = { date: room.date === 'sample' ? 'sample' : room.date, plantId: room.plantId, title: room.plant.title, text };
    answered.set(k, text);
    if (!(await post('api/answer', row))) writeLocal(PENDING, [...readLocal(PENDING, []), row]);
    if (!room.live) {
      room.live = true;
      for (const [x, y, z] of roomParts(room).portal) caveWorld.set(x, y, z, B.PORTAL, { persist: false });
      caveSwirls();
      sfx.portal();
      setTimeout(() => sfx.chime(), 400);
      hud.toast('The portal woke up.');
    } else hud.toast('Carved.');
    saveNow();
  });
}

function enterSecret(room) {
  const plant = room.plant;
  const w = plant.world ?? { name: plant.title, theme: ['forest', 'field', 'tundra', 'desert', 'jungle', 'cavern'][hashString(plant.id) % 6] };
  const gen = secretGenerator(w, plant.id);
  saveNow();
  caveWorld.group.visible = false;
  glows.clear();
  mobs.clear();
  hand.clearWorldBits();
  clearSwirls();
  // Open country: draw it one chunk further than the cave.
  const sworld = new World({ generator: gen, scene, texture: paintAtlas(gen.palette, hashString(plant.id)), radius: LITE ? RADIUS : RADIUS + 1, vradius: VRADIUS });
  world = sworld;
  mobs.world = sworld;
  hand.world = sworld;
  mobs.caveSpawning = false;
  player.pos.set(gen.spawn.x, gen.spawn.y, gen.spawn.z);
  player.vel.set(0, 0, 0);
  player.fallFrom = null; // a fall in one world never lands in the other
  player.yaw = Math.PI;
  player.pitch = 0;
  showSwirl('home', gen.portalCentre);
  // Treasure: everything not already in the case, each with special ammo beside it; and caches of more ammo at the
  // places with no treasure and out in the open. The world's loot is decided by its plant, so it is the same loot
  // every visit, and a cache once taken stays taken.
  const treasures = [];
  const lr = rng(hashString(plant.id + '|loot'));
  const spots = [...gen.pois.filter((p) => p.treasure).map((p) => [p.treasure, p.item]), ...gen.strays.map((s) => [s.treasure, [s.x + 0.5, s.y + 0.8, s.z + 0.5]])];
  const loot = Array.from({ length: Math.max(3, spots.length) + 1 + Math.floor(lr() * 2) }, () => roll(lr, ODDS.portal));
  const place = (t, ammo, cacheId, at) => {
    const g = new THREE.Group();
    if (t) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: new THREE.Color(w.accent ?? '#e8b04a') }));
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      g.add(gem, core);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshBasicMaterial({ color: 0x343a46 }));
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.46), new THREE.MeshBasicMaterial({ color: 0x60ecd6 }));
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color(AMMO_BY_ID[ammo.id].color) }));
      core.position.y = 0.42;
      g.add(box, glow, core);
    }
    g.position.set(...at);
    scene.add(g);
    treasures.push({ t, ammo, cacheId, mesh: g, base: at[1], taken: false });
  };
  spots.forEach(([t, at], j) => {
    if (t && !trophies.some((x) => x.id === t.id)) place(t, loot[j] ?? null, null, at);
  });
  const open = gen.pois.filter((p) => !p.treasure).map((p) => p.item);
  for (let i = spots.length; i < loot.length; i++) {
    const cacheId = `${plant.id}#${i}`;
    let at = open.shift();
    if (!at) {
      const a = lr() * Math.PI * 2, d = 10 + lr() * 25;
      const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
      at = [x + 0.5, gen.height(x, z) + 1.4, z + 0.5];
    }
    if (!takenCaches.has(cacheId)) place(null, loot[i], cacheId, at);
  }
  // Who lives here.
  const kind = gen.enemies;
  for (const p of gen.pois) {
    if (kind === 'bugs' && p.type === 'station') for (let i = 0; i < 6; i++) mobs.add('bug', p.x + (Math.random() - 0.5) * 8, p.y + 1, p.z + (Math.random() - 0.5) * 6);
    if (kind === 'robots' && p.type !== 'station') for (let i = 0; i < 2; i++) mobs.add('robot', p.x + 3 + i, p.y + 1, p.z + 3);
    if (kind === 'robots' && p.type === 'station') mobs.add('robot', p.x + 2, p.y + 1, p.z);
    if (kind === 'bugs' && p.type !== 'station') mobs.add('bug', p.x + 3, p.y + 1, p.z + 3);
  }
  if (kind === 'beasts')
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, d = 25 + Math.random() * 30;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      mobs.add('beast', x, gen.height(Math.floor(x), Math.floor(z)) + 1.1, z);
    }
  secret = { gen, world: sworld, room, treasures, found: [], since: performance.now() };
  dark = 0;
  sfx.portal();
  hud.toast(`${gen.name}`);
  hud.toast(`Through the portal from “${plant.title}”`);
}

function leaveSecret() {
  const s = secret;
  for (const tr of s.treasures) scene.remove(tr.mesh);
  mobs.clear();
  hand.clearWorldBits();
  clearSwirls();
  s.world.dispose();
  secret = null;
  world = caveWorld;
  caveWorld.group.visible = true;
  mobs.world = caveWorld;
  hand.world = caveWorld;
  mobs.caveSpawning = !Q.has('peaceful');
  caveSwirls();
  const p = roomParts(s.room);
  player.pos.set(...p.standIn);
  player.vel.set(0, 0, 0);
  player.fallFrom = null;
  player.yaw = Math.PI;
  dark = 1;
  hud.vitals(player.health, player.maxHealth, cave.height(Math.floor(player.pos.x), Math.floor(player.pos.z)) - player.pos.y);
  sfx.portal();
  I.release();
  if (document.pointerLockElement) document.exitPointerLock();
  saveNow();
  hud.home({ world: s.gen.name, found: s.found, minutes: Math.round(active / 60) }, () => {
    started = false;
    showStart('The cave will be here. Come back any time.', 'Keep digging');
  }, () => relock());
}

function takeTreasure(tr) {
  tr.taken = true;
  scene.remove(tr.mesh);
  if (tr.t) {
    const t = { ...tr.t, world: secret.gen.name, plant: secret.room.plant.title, date: TODAY, at: new Date().toISOString() };
    trophies = [...trophies, t];
    secret.found.push(t);
    writeLocal('the-dig-trophies', trophies);
    post('api/trophies', { trophy: t });
    sfx.chime();
    hud.toast(`Found: ${t.name}`);
  }
  if (tr.ammo) {
    const a = AMMO_BY_ID[tr.ammo.id];
    giveAmmo(a.id, tr.ammo.n);
    secret.found.push({ name: `${a.name} × ${tr.ammo.n}`, description: a.text });
  }
  if (tr.cacheId) takenCaches.add(tr.cacheId);
}

// ── dig, place, use ──
// A dug cell beside water (or under it) fills with it; what stood on the block or hung from it comes down.
const SIDES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
function supported(x, y, z, id) {
  const f = BLOCKS[id].facing;
  const [sx, sy, sz] = f ? [x - f[0], y, z - f[2]] : [x, y - 1, z];
  return BLOCKS[world.get(sx, sy, sz)].solid;
}
function breakBlock(t) {
  const b = BLOCKS[t.id];
  const wet = SIDES.some(([dx, dy, dz]) => world.get(t.x + dx, t.y + dy, t.z + dz) === B.WATER);
  world.set(t.x, t.y, t.z, wet ? B.WATER : B.AIR);
  for (const [dx, dy, dz] of SIDES) {
    const x = t.x + dx, y = t.y + dy, z = t.z + dz;
    const id = world.get(x, y, z);
    if (!isPlant[id] && !isTorch[id]) continue;
    if (supported(x, y, z, id)) continue;
    world.set(x, y, z, B.AIR);
  }
  sfx.break();
  hand.burst(new THREE.Vector3(t.x + 0.5, t.y + 0.5, t.z + 0.5), 0x8a7a6a, 8);
  if (b.drop === 'crate') crateLoot();
  else if (b.drop === 'cache') cacheLoot(t.x, t.y, t.z);
  else if (b.drop === 'gravel') {
    if (Math.random() < 0.4) {
      pack.flint++;
      hud.toast('+1 flint');
    }
  } else if (b.drop === 'rubble') {
    // Rubble never runs out: nothing to count.
  } else if (b.drop) {
    pack[b.drop] = (pack[b.drop] ?? 0) + 1;
    hud.toast(`+1 ${b.drop}`);
  }
  hud.slots(hand.slot, pack);
}

let flares = 0; // set in the world this session (for the drives: flares are unlimited, so the pack does not count them)
function place(what) {
  const t = lookTarget();
  if (!t) {
    // A flare with nothing near to stick it to is thrown, and lands on the first floor it meets. (Round 7: flares
    // are unlimited, the play-tester: "no more crafting torches, they should be unlimited".)
    if (what !== 'torch') return;
    const into = world;
    hand.throwTorch(player.eye(), player.forward(), (cell) => {
      if (!cell || world !== into) return;
      world.set(...cell, B.TORCH);
      flares++;
      if (world === caveWorld) lastTorch = cell;
      sfx.torch();
    });
    hand.fired.torch = (hand.fired.torch ?? 0) + 1;
    return hud.slots(hand.slot, pack);
  }
  const x = t.x + t.n[0], y = t.y + t.n[1], z = t.z + t.n[2];
  const here = world.get(x, y, z);
  if (here !== B.AIR && here !== B.LAVA && here !== B.WATER && !isPlant[here]) return;
  if (what === 'torch') {
    if (here === B.LAVA || here === B.WATER) return;
    // On the floor, or leaning off a wall; never hanging from a ceiling, never on a plant or a flare.
    const id = torchFor(t.n);
    if (!id || !BLOCKS[t.id].solid) return;
    world.set(x, y, z, id);
    flares++;
    if (world === caveWorld) lastTorch = [x, y, z];
    sfx.torch();
  } else {
    // Not inside the player.
    const p = player.pos;
    if (x + 1 > p.x - 0.3 && x < p.x + 0.3 && z + 1 > p.z - 0.3 && z < p.z + 0.3 && y + 1 > p.y && y < p.y + 1.8) return;
    world.set(x, y, z, B.COBBLE);
    sfx.place();
  }
  hud.slots(hand.slot, pack);
}

// Round 5: in the cave you come round at the base, up top (round 7: in the ship's med bay) (the play-tester: "it increases the stakes and reduces the
// possibility of 'exploration is too easy'"). The pack is untouched; the way down is yours to find again. Behind a
// portal you come round at the landing, as before.
function respawn() {
  let at = null;
  if (secret) at = [secret.gen.spawn.x, secret.gen.spawn.y, secret.gen.spawn.z];
  else {
    const s = cave.medbay();
    at = [s.x, s.y, s.z];
    world.plannedAt = null;
    player.yaw = s.yaw;
    player.pitch = 0;
  }
  player.pos.set(...at);
  player.vel.set(0, 0, 0);
  player.health = player.maxHealth;
  player.fallFrom = null;
  hand.dropHook();
  deaths++;
  hud.flash(0.9);
  hud.toast(secret ? 'You came round at the landing.' : 'You came round in the med bay. Everything is still in your pack.');
  if (!secret && deaths === 1) setTimeout(() => hud.toast('The shafts of daylight go back down: from the ship, look for the light on the ground.'), 2600);
}
let deaths = 0;

let bruteHeard = false, bruteTold = false;
const hooks = {
  hitMarker: (h) => hud.hitMarker(h),
  flash: (o) => hud.flash(o),
  toast: (t) => hud.toast(t),
  killed: (m) => {
    mobs.remove(m);
    if (m.lair) {
      const g = garrisons.get(m.lair);
      if (g) g.killed++;
    }
    if (m.kind === 'brute') {
      hud.toast('The brute is down. It was carrying something.');
      const r = roll(Math.random, ODDS.brute);
      giveAmmo(r.id, r.n);
      return;
    }
    if (m.kind === 'robot' && Math.random() < 0.2) {
      const r = roll(Math.random, ODDS.robot);
      return giveAmmo(r.id, Math.ceil(r.n / 3));
    }
    if (m.kind === 'ghoul' && Math.random() < 0.3) {
      const r = roll(Math.random, ODDS.cache);
      return giveAmmo(r.id, Math.ceil(r.n / 2));
    }
    const drop = { crawler: ['coal', 0.4], stalker: ['iron', 0.5], archer: ['flint', 0.5] }[m.kind];
    if (drop && Math.random() < drop[1]) {
      pack[drop[0]] += 1;
      hud.toast(`+1 ${drop[0]}`);
      hud.slots(hand.slot, pack);
    }
  },
  bite: (n) => {
    player.hurt(n, performance.now() / 1000);
    sfx.hurt();
    hud.hurt();
  },
  growl: (d, m) => sfx.creature(m?.kind, 'growl', d),
  // A brute's footsteps; the first time they are near, a word about it (once a session).
  thud: (d) => {
    sfx.thud(d);
    if (d < 32 && !bruteTold) {
      bruteTold = true;
      hud.toast('The ground is thumping. Something very big is down here, listening.');
    }
  },
  // A blast or a drill broke a crate or a cache: what was inside still counts.
  loot: (id, x, y, z) => (id === B.CACHE ? cacheLoot(x, y, z) : crateLoot()),
  // The creatures' voices: the recordings (the robots keep the made-up growl).
  shoot: (d) => sfx.bow(d),
  roar: (m, d) => sfx.creature(m.kind, 'roar', d)
};
hand.hooks = hooks;

// ── the air: the sky's colours, how dark it is, how far you see ──
// Under open sky (even at the bottom of a shaft) the sky shows; shut in underground it dims to black. The fog sits
// just inside the edge of what is built, so the edge never shows; under water it closes in, blue.
let dark = 0;
function atmosphere(dt) {
  const R = world.radius * 16;
  let top = dusk ? DUSK_TOP : SKY_TOP, horizon = dusk ? DUSK_HORIZON : SKY_HORIZON, open = true, target = 0;
  if (secret) {
    top = raw(secret.gen.skyColor);
    horizon = top.clone().lerp(WHITE, 0.35);
    open = secret.gen.sky;
  } else {
    const e = player.eye();
    const depth = cave.height(Math.floor(e.x), Math.floor(e.z)) - e.y;
    target = caveWorld.underSky(e.x, e.y, e.z) ? 0 : Math.max(0, Math.min(1, (depth - 1) / 8));
  }
  dark += (target - dark) * Math.min(1, dt * 2.5);
  let fog = horizon.clone().lerp(BLACK, dark);
  let near = R - 24, far = R - 2;
  const inside = player.eyeIn(world);
  if (inside === B.WATER) [fog, near, far] = [raw(0x0c2a6a).lerp(BLACK, dark * 0.7), 0, 22];
  else if (inside === B.LAVA) [fog, near, far] = [raw(0xd0501a), 0, 2.5];
  env.fogColor.value.copy(fog);
  env.daylight.value = dusk && !secret ? 0.42 : 1;
  env.fogNear.value = near;
  env.fogFar.value = far;
  sky.set(top, horizon, inside === B.WATER ? 1 : dark, open);
  // three's own fog, for the creatures and the bits in the air: the same colour (it reads colours as sRGB).
  scene.fog.color.setRGB(fog.r, fog.g, fog.b, THREE.SRGBColorSpace);
  scene.fog.near = near;
  scene.fog.far = far;
  scene.background.copy(scene.fog.color);
}

// ── the lairs: a garrison wakes when you come within 40 blocks of one not yet cleared, and keeps near its hoard.
// Walk away and it is gone (what you killed stays killed); come back and the rest are waiting. ──
const garrisons = new Map(); // lair key → { total, killed, mobs }
let lairT = 0;
function wakeLairs(dt) {
  if ((lairT -= dt) > 0 || secret || !mobs.caveSpawning) return;
  lairT = 0.5;
  for (const [key, g] of garrisons) {
    if (g.asleep || g.mobs.some((m) => mobs.list.includes(m))) continue;
    if (g.killed >= g.total) {
      cleared.add(key);
      hud.toast('The lair is quiet. The hoard is yours.');
    }
    // Every one of them gone: killed (it is cleared), or left behind out of range (it sleeps till you come back).
    g.mobs = [];
    g.asleep = true;
  }
  for (const s of cave.sitesNear(player.pos, 40, ['lair'])) {
    if (cleared.has(s.key)) continue;
    let g = garrisons.get(s.key);
    if (g && !g.asleep) continue;
    if (!g) {
      // Four crawlers, three archers, two ghouls; deep ones keep a brute as well.
      const kinds = ['crawler', 'crawler', 'crawler', 'crawler', 'archer', 'archer', 'archer', 'ghoul', 'ghoul'];
      if (cave.height(s.x, s.z) - s.y > 45 && s.salt < 0.5) kinds.push('brute');
      g = { kinds, total: kinds.length, killed: 0, mobs: [] };
      garrisons.set(s.key, g);
    }
    g.asleep = false;
    const left = g.kinds.slice(g.killed);
    left.forEach((kind, n) => {
      const a = (n / left.length) * Math.PI * 2 + Math.random() * 0.5, d = kind === 'brute' ? 8 : 3 + Math.random() * 6;
      const m = mobs.add(kind, s.x + 0.5 + Math.cos(a) * d, s.y + 1.05, s.z + 0.5 + Math.sin(a) * d);
      m.lair = s.key;
      m.home = new THREE.Vector3(s.x + 0.5, s.y + 1, s.z + 0.5);
      g.mobs.push(m);
    });
    hud.toast('Something is nesting nearby. A lot of somethings.');
  }
}

// ── the ship's running lights (round 7): a soft glow at each wingtip and on the tail fin, blinking ──
const shipLights = new THREE.Group();
{
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g2 = c.getContext('2d');
  const grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  for (const l of cave.base().lights) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: l.colour, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sp.position.set(l.x, l.y, l.z);
    sp.scale.setScalar(2.2);
    shipLights.add(sp);
  }
  scene.add(shipLights);
}
function blinkShipLights(now) {
  shipLights.visible = !secret;
  // A short bright flash once every 1.4 s, the tail a beat after the wings.
  shipLights.children.forEach((sp, i) => {
    const ph = (now / 1.4 + (i === 2 ? 0.5 : 0)) % 1;
    sp.material.opacity = ph < 0.12 ? 1 : 0.18;
  });
}

// ── the shafts of daylight: a column of light down each one near you (seen from the caves; faint from up top) ──
const beamMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 }, k: { value: 1 } },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float t; uniform float k; varying vec2 vUv; varying vec3 vP;
    void main(){
      // Brightest up at the mouth, fading down the shaft; soft streaks that drift; a soft edge top and bottom.
      float down = vUv.y;
      float streak = 0.65 + 0.35 * sin(vUv.x * 37.0 + t * 0.35) * sin(vUv.x * 13.0 - t * 0.2 + vP.y * 0.05);
      float a = (0.22 + 0.78 * down) * streak * smoothstep(0.0, 0.08, down) * smoothstep(1.0, 0.94, down);
      gl_FragColor = vec4(vec3(1.0, 0.95, 0.78) * a * 0.5 * k, 1.0);
    }`
});
const beams = new Map(); // skylight key → mesh
let beamT = 0;
function skyBeams(dt) {
  if ((beamT -= dt) <= 0) {
    beamT = 1;
    const want = new Set();
    if (!secret)
      for (const s of cave.skylightsNear(player.pos.x, player.pos.z, 130)) {
        const key = `${s.x},${s.z}`;
        want.add(key);
        if (beams.has(key)) continue;
        // A cone from the mouth (a little wider) to the grotto floor, with motes of dust drifting in it.
        const h = s.top + 1 - s.floor;
        const g = new THREE.Group();
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(s.r + 0.6, s.r + 1.6, h, 20, 1, true), beamMat);
        cone.position.y = h / 2;
        g.add(cone);
        const n = 60, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s.r;
          pos.set([Math.cos(a) * r, Math.random() * h, Math.sin(a) * r], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const motes = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff2c8, size: 0.06, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        g.add(motes);
        // The daylight at the top: a disc of sky over the mouth, seen only from below (underground the sky is black,
        // and looking up a shaft has to show the way out).
        const lid = new THREE.Mesh(new THREE.CircleGeometry(s.r + 2.5, 24), new THREE.MeshBasicMaterial({ color: 0xd8e8ff, fog: false }));
        lid.rotation.x = Math.PI / 2;
        lid.position.y = s.top + 1.6 - s.floor;
        g.add(lid);
        g.position.set(s.x + 0.5, s.floor, s.z + 0.5);
        g.userData = { motes, h };
        scene.add(g);
        beams.set(key, g);
      }
    for (const [key, g] of beams)
      if (!want.has(key)) {
        scene.remove(g);
        beams.delete(key);
      }
  }
  // Strong in the dark, faint in the open air.
  beamMat.uniforms.k.value = 0.25 + dark * 0.75;
  beamMat.uniforms.t.value = performance.now() / 1000;
  for (const g of beams.values()) {
    const p = g.userData.motes.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) - dt * 0.25;
      if (y < 0) y += g.userData.h;
      p.setY(i, y);
    }
    p.needsUpdate = true;
  }
}

// ── the compass: where the rooms are (and, behind a portal, the way home and what is left to find) ──
const toDeg = 180 / Math.PI;
function compass() {
  const e = player.eye();
  const marks = [];
  const mark = (x, y, z, kind) => {
    const dx = x - e.x, dz = z - e.z;
    marks.push({ bearing: (Math.atan2(dx, -dz) * toDeg + 360) % 360, dy: y - e.y, dist: Math.hypot(dx, y - e.y, dz), kind });
  };
  if (!secret) {
    // Round 7 (R2, "Keep it as you stated"): north, east, south, west, your depth, the ship and your own pins. The
    // rooms, portals, vaults, lairs, shafts of daylight and the brute are off it: the pulse and your ears find them,
    // and the day's rooms still hum close up.
    const b = cave.base();
    const under = cave.height(Math.floor(e.x), Math.floor(e.z)) - e.y > 4;
    if (Math.hypot(b.x - e.x, b.z - e.z) > 40 || under) mark(b.x + 0.5, b.y + 6, b.z + 0.5, 'base');
    for (const p of pins) mark(p.x, p.y, p.z, 'pin');
  } else {
    mark(...secret.gen.portalCentre, 'home');
    for (const t of secret.treasures) if (!t.taken) mark(t.mesh.position.x, t.base, t.mesh.position.z, t.t ? 'treasure' : 'cache');
  }
  hud.compass(((-player.yaw * toDeg) % 360 + 360) % 360, marks);
}

// ── the frame ──
let frames = 0;
function frame() {
  frames++;
  const dt = Math.min(clock.getDelta(), DTMAX);
  const now = performance.now() / 1000;
  swirlMat.uniforms.t.value = now;
  blinkShipLights(now);
  const paused = !started || hud.panelOpen();
  if (!paused) step(dt, now);
  else {
    quietCutter();
    I.consume();
    player.place();
  }
  world.update(player.pos, paused ? 12 : touchDevice ? 4 : 6, player.forward());
  atmosphere(dt);
  env.time.value = now;
  sky.update(camera, now);
  renderer.render(scene, camera);
}

// Mining speed: twice round 2's (the play-tester: "cut in half the time it takes to mine a block").
const DIG_SPEED = 2;
let fire = 0, fireT = 0;

function step(dt, now) {
  I.frame(hand.weapon(), hand.id);
  // The number of the weapon already in hand opens its ammo.
  if (I.slot !== null && I.slot === hand.slot && SLOTS[I.slot].ammo) {
    openAmmo(SLOTS[I.slot].ammo);
    return I.consume();
  }
  if (I.slot !== null) hand.select(I.slot);
  if (I.wheel) hand.select(hand.slot + I.wheel);
  if (I.cycle) cycleAmmo();
  if (I.slot !== null || I.wheel) hud.slots(hand.slot, pack);
  if (I.craft || I.trophies) {
    freeMouse();
    if (I.craft) hud.craft(pack, RECIPES, craft);
    else hud.trophies(trophies);
    return I.consume();
  }

  const aiming = hand.id === 'gun' && I.aim;
  const wasGround = player.onGround;
  const { fell } = player.update(dt, I, world, { aiming });
  if (fell > 0) {
    player.hurt(fell, now);
    sfx.hurt();
    hud.hurt();
  }
  if (player.onGround && !wasGround) mobs.noise(player.pos, 6, true);
  stepPulse(now);
  // Lava burns while you are in it, and you keep burning a few seconds after; water puts it out.
  if (player.inLava) {
    fire = 4;
    lavaT += dt;
    if (lavaT > 0.5) {
      lavaT = 0;
      player.hurt(2, now);
      sfx.hurt();
      hud.hurt();
    }
  } else if (fire > 0) {
    fire = player.inWater ? 0 : fire - dt;
    fireT += dt;
    if (fireT > 1) {
      fireT = 0;
      player.hurt(1, now);
      sfx.hurt();
      hud.hurt();
    }
  }
  hud.burning(player.inLava || fire > 0);
  // Footsteps: running carries a long way (a brute hears it); walking hardly at all.
  const speedNow = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround && speedNow > 1) {
    stepT += dt * speedNow;
    if (stepT > 1.9) {
      stepT = 0;
      sfx.step();
      mobs.noise(player.pos, speedNow > 5 ? 18 : 4, true);
    }
  }
  // The multitool's kick lifts the view a touch and lets it settle.
  if (hand.camKick) camera.rotation.x += hand.camKick * 0.09;
  if (hand.shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.14).multiplyScalar(hand.shake));
  camera.fov += ((aiming ? 22 : 72) - camera.fov) * Math.min(1, dt * 14);
  camera.updateProjectionMatrix();
  const scoped = aiming && camera.fov < 34;
  hud.scope(scoped);

  // Dig (with the pick or rubble in hand), place, fire.
  const target = lookTarget();
  const weapon = hand.weapon();
  let digging = false;
  if (!weapon && I.primary && target && Number.isFinite(BLOCKS[target.id].hard)) {
    digging = true;
    if (!digTarget || digTarget.x !== target.x || digTarget.y !== target.y || digTarget.z !== target.z) {
      digTarget = target;
      digT = 0;
    }
    digT += (dt * DIG_SPEED) / BLOCKS[target.id].hard;
    const hardness = Math.min(1, BLOCKS[target.id].hard / 1.5);
    if (hand.id === 'pick') {
      if (!cutVoice) cutVoice = sfx.cutter(hardness);
      else cutVoice.set(hardness);
    } else quietCutter();
    digSound -= dt;
    if (digSound <= 0) {
      digSound = 0.24;
      if (hand.id !== 'pick') sfx.dig(hardness);
      mobs.noise(player.pos, 12, true);
    }
    if (digT >= 1) {
      breakBlock(target);
      digTarget = null;
      digT = 0;
    }
  } else {
    digTarget = null;
    digT = 0;
    quietCutter();
  }
  hud.crack(digging ? Math.min(1, digT) : 0);
  selection.update(target, digging ? Math.min(1, digT) : 0);
  if (I.place) {
    if (I.place === 'torch') place('torch');
    else if (weapon) {
      // Right mouse with a weapon is aim, not place.
    } else place(hand.id === 'rubble' ? 'rubble' : 'torch');
  }
  // Standard rounds may be set to fire while held (the Load menu's switch); special ammo is always one press, one
  // shot, so a held trigger never empties the rare kinds.
  const auto = hand.id === 'gun' && pack.fireMode === 'auto' && !loadedAmmo('gun', pack).id;
  if (weapon && (I.primaryDown || (I.primary && auto))) {
    const msg = hand.trigger(pack, player.eye(), player.forward(), aiming);
    if (msg) hud.toast(msg);
    hud.slots(hand.slot, pack);
  }
  // The creature under the crosshair (its health bar shows), up to the first block in the way.
  const fwd = player.forward();
  const wall = world.raycast(player.eye(), fwd, 60, (id) => BLOCKS[id].opaque);
  mobs.looked = mobs.rayHit(player.eye(), fwd, wall ? wall.t : 60)?.mob ?? null;
  // The hook's ring and lamp: lit when it can reach what the crosshair is on.
  hand.reach = hand.id === 'hook' && !!hand.hookReach(player.eye(), player.forward());
  hud.hookRing(hand.id === 'hook', hand.reach);

  // What can be used here.
  let use = null, useLabel = null;
  if (target?.id === B.LECTERN || (target?.id === B.SCREEN && !secret)) {
    if (!secret) {
      const room = target.id === B.LECTERN && roomAtLectern(target);
      const note = !room && cave.noteAt(target.x, target.y, target.z);
      if (room) [use, useLabel] = [() => readStone(room), 'Read'];
      else if (note) [use, useLabel] = [() => (freeMouse(), hud.note(note, target.id === B.SCREEN ? 'On the ship' : 'Left down here')), 'Read'];
    } else {
      const poi = secret.gen.pois.find((p) => p.lectern && p.lectern.every((v, i) => v === [target.x, target.y, target.z][i]));
      if (poi) [use, useLabel] = [() => (I.release(), document.pointerLockElement && document.exitPointerLock(), hud.note(poi.note, secret.gen.name)), 'Read'];
    }
  }
  // What they carved: a lintel, a caption, a shelf of tablets (DIG-007).
  if (!use && !secret && target && (target.id === B.INSCRIBED || target.id === B.TABLETS)) {
    const here = textsAt(cave, target.x, target.y, target.z);
    if (here) [use, useLabel] = [() => readCarved(here), 'Read'];
  }
  const tr = nearestTreasure();
  if (tr) [use, useLabel] = [() => takeTreasure(tr), 'Take'];
  // The pulse's glows: look at one and pin it (on the phone the Use button says Pin); look at a pin to take it off.
  if (!use && !secret) {
    const g = glows.aimed(player.eye(), player.forward());
    const old = aimedPin();
    if (g) [use, useLabel] = [() => pinAt(g.at), 'Pin'];
    else if (old >= 0) [use, useLabel] = [() => (pins.splice(old, 1), saveNow(), hud.toast('Pin taken off.')), 'Unpin'];
  }
  hud.context({ hand: hand.id, use: useLabel });
  // On the phone the Use button carries the verb; the prompt only names a treasure.
  hud.prompt(useLabel ? (touchDevice ? (tr ? treasureName(tr) : null) : `E — ${useLabel.toLowerCase()} ${tr ? treasureName(tr) : 'it'}`) : null);
  if (I.use && use) use();

  // The portals.
  const inPortal = player.touching(world, B.PORTAL);
  if (inPortal) {
    if (secret) return leaveSecret(), I.consume();
    const room = rooms.find((r) => r.live && roomParts(r).portal.some((c) => c[0] === inPortal[0] && c[1] === inPortal[1] && c[2] === inPortal[2]));
    if (room) return enterSecret(room), I.consume();
  }

  mobs.update(dt, player, now, hooks);
  const digAt = digging ? player.eye().addScaledVector(player.forward(), target.t) : null;
  hand.update(dt, I, { digging, aiming, scoped, pack, player, digAt });
  wakeLairs(dt);
  skyBeams(dt);
  compass();
  if (secret)
    for (const t of secret.treasures) {
      if (t.taken) continue;
      t.mesh.rotation.y += dt * 1.4;
      t.mesh.position.y = t.base + Math.sin(now * 2 + t.base) * 0.12;
    }

  // The hum of the nearest room that is still waiting for an answer.
  if (!secret) {
    let near = Infinity;
    for (const r of rooms) {
      if (r.live) continue;
      const c = roomParts(r).centre;
      near = Math.min(near, Math.hypot(c[0] - player.pos.x, c[1] - player.pos.y, c[2] - player.pos.z));
    }
    setHum(Math.max(0, 1 - near / 40));
  } else setHum(0);

  // Health comes back on its own after a while.
  if (now - player.hurtAt > 8 && player.health < player.maxHealth) player.health = Math.min(player.maxHealth, player.health + dt * 0.5);
  if (player.health <= 0) {
    fire = 0;
    respawn();
  }

  if (!secret) hud.vitals(player.health, player.maxHealth, cave.height(Math.floor(player.pos.x), Math.floor(player.pos.z)) - player.pos.y);
  else {
    hud.vitals(player.health, player.maxHealth, 0);
    hud.el.depth.textContent = secret.gen.name;
  }

  // The time bars: told, never stopped.
  active += dt;
  const mins = active / 60;
  for (const [m, level, text] of [
    [15, 'yellow', '15 minutes in. Just so you know.'],
    [30, 'orange', '30 minutes in. Your call.'],
    [45, 'red', '45 minutes. Still your call: the cave keeps everything exactly as it is.']
  ])
    if (mins >= m && !warned.has(m)) {
      warned.add(m);
      hud.warn(level, text);
      sfx.soft();
    }

  saveTimer += dt;
  if (saveTimer > 20) {
    saveTimer = 0;
    saveNow();
  }
  I.consume();
}

// ── start ──
const startEl = document.getElementById('start');
const startBtn = document.getElementById('startBtn');
function showStart(note, label) {
  startNote.textContent = note;
  startBtn.textContent = label;
  startEl.hidden = false;
}
document.getElementById('startHelp').textContent = touchDevice
  ? 'Left thumb moves. Right thumb looks. The buttons by ▲ do what is in hand: Dig, Flare, Place, Fire.'
  : 'WASD to move, the mouse to look. Hold the left button to cut; right places a flare.';
startBtn.onclick = () => {
  unlockAudio();
  startEl.hidden = true;
  started = true;
  relock();
  if (!introduced) {
    introduced = true;
    const n = rooms.filter((r) => r.date === dayKey && !r.live).length;
    hud.toast(day.source === 'nightly' ? `Last night, Claude planted ${n} room${n === 1 ? '' : 's'} in the deep. Listen for the hum.` : day.source === 'older' ? 'No new rooms last night. Yesterday’s are still down there.' : `${n} sample rooms are waiting in the deep. Listen for the hum.`);
    if (!told.pulse) {
      told.pulse = true;
      setTimeout(() => hud.toast(touchDevice ? 'Pulse, above ▲: hold it a second and let go. The rock shows where it is hollow.' : 'R is the pulse: hold it a second and let go. The rock shows where it is hollow.'), 4200);
    }
    // ?where=1 (a tester's hint, off unless asked for; R2 keeps the compass bare): which way each district lies from
    // the ship, how far and how deep, by the compass's own bearing (north is -z, east is +x).
    if (Q.has('where')) {
      const b = cave.base();
      const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
      const lines = districts.map((d, i) => {
        const dx = d.at.x - b.x, dz = d.at.z - b.z;
        const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
        const down = Math.round(cave.height(d.at.x, d.at.z) - d.at.y);
        return `${i === 0 ? 'The first district' : `District ${i + 1}`}: about ${Math.round(Math.hypot(dx, dz))} blocks ${POINTS[Math.round(bearing / 45) % 8]} of the ship (bearing ${Math.round(bearing)}°), its heart about ${down} blocks under the ground there.`;
      });
      freeMouse();
      hud.note({ title: 'Where the districts are', text: lines.length ? lines.join('\n') : 'No district found a place in this cave.' }, 'A hint (?where=1)');
    }
  }
};
let introduced = false;

renderer.setAnimationLoop(frame);
// Build the ground under your feet before letting you in.
startNote.textContent = 'Building the ground under your feet…';
const until = performance.now() + 6000;
while (caveWorld.pending() > 0 && performance.now() < until) {
  caveWorld.update(player.pos, 40);
  await new Promise((r) => setTimeout(r, 0));
}
if (player.collides(world, player.pos.x, player.pos.y, player.pos.z)) {
  while (player.collides(world, player.pos.x, player.pos.y, player.pos.z)) player.pos.y += 1;
}
hud.setIcons(itemIcons(atlas));
hud.slots(hand.slot, pack);
const waiting = rooms.filter((r) => r.date === dayKey && !r.live).length;
startNote.textContent =
  day.source === 'nightly'
    ? `${waiting} new room${waiting === 1 ? '' : 's'} planted last night.${day.note ? ' ' + day.note : ''}`
    : day.source === 'older'
      ? `No new rooms last night. The ones from ${day.date} are still down there.`
      : 'Sample rooms: plant your own in sample-plants.json.';
startBtn.disabled = false;
if (Q.has('auto')) startBtn.click();

// ── for the drives (tests) ──
window.__dig = {
  state: () => ({
    pos: player.pos.toArray().map((v) => +v.toFixed(2)), health: player.health, pack: JSON.parse(JSON.stringify(pack)), inSecret: !!secret,
    fired: { ...hand.fired }, cutting: !!cutVoice, fireMode: pack.fireMode ?? 'single', grapple: !!player.hook, hook: hand.hk?.phase ?? null, reach: !!hand.reach, vel: player.vel.toArray().map((v) => +v.toFixed(2)), scoped: !hand.root.visible && hand.id === 'gun', burning: fire > 0 || player.inLava, inLava: player.inLava,
    caches: secret?.treasures.filter((t) => !t.taken && !t.t).length ?? null,
    world: secret?.gen.name ?? 'cave', meshes: world.group.children.length, pending: world.pending(), rooms: rooms.map((r) => ({ id: r.plantId, date: r.date, live: r.live, x: r.x, y: r.y, z: r.z })),
    mobs: mobs.list.map((m) => m.kind), treasures: secret?.treasures.filter((t) => !t.taken && t.t).length ?? null, trophies: trophies.length,
    warned: [...warned], slot: hand.id, target: lookTarget()?.id ?? null, light: world.lightAt(player.pos.x, player.pos.y + 1, player.pos.z),
    panel: !hud.el.panel.hidden, edits: caveWorld.editsList().length, source: day.source,
    meshMs: +(world.stats.ms / Math.max(1, world.stats.meshes)).toFixed(2), built: world.stats.meshes,
    thrown: hand.thrown.length, beams: beams.size, garrisons: [...garrisons].map(([k, g]) => ({ k, total: g.total, killed: g.killed, alive: g.mobs.filter((m) => mobs.list.includes(m)).length })),
    cleared: [...cleared], deaths, flares, pins: pins.length, pulse: lastPulse, glows: glows.list(), sounds: samplesLoaded(), kick: +hand.kick.toFixed(3)
  }),
  teleport: (x, y, z, yaw, pitch) => {
    world.plannedAt = null; // plan round the new place on the next frame (and say nothing is built until then)
    player.pos.set(x, y, z);
    player.vel.set(0, 0, 0);
    hand.dropHook();
    player.fallFrom = null;
    if (yaw !== undefined) player.yaw = yaw;
    if (pitch !== undefined) player.pitch = pitch;
  },
  toRoom: (i = 0) => {
    world.plannedAt = null;
    hand.dropHook();
    const r = rooms.filter((x) => x.date === dayKey)[i];
    const p = roomParts(r);
    player.pos.set(...p.standIn);
    player.vel.set(0, 0, 0);
    player.fallFrom = null;
    player.yaw = Math.PI; // facing +z, at the lectern (the portal is behind you)
    player.pitch = -0.5;
    return p;
  },
  read: () => {
    const t = lookTarget();
    const room = t && roomAtLectern(t);
    if (room) readStone(room);
    return !!room;
  },
  warp: (minutes) => (active += minutes * 60),
  mobs,
  give: giveAmmo,
  player,
  frames: () => frames,
  cave,
  input: I,
  hud,
  world: () => world,
  pack,
  hand,
  save: saveNow,
  takeAll: () => {
    for (const t of secret?.treasures ?? []) if (!t.taken) takeTreasure(t);
  },
  goHome: () => secret && leaveSecret(),
  place,
  respawn,
  dusk: (on = true) => (dusk = on),
  // The colour on screen at a world point (render, then read the pixels in the same task), with its hue in degrees.
  pixelAt: (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).project(camera);
    if (v.z > 1) return null;
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const px = Math.round(((v.x + 1) / 2) * W), py = Math.round(((v.y + 1) / 2) * H);
    const buf = new Uint8Array(4 * 9);
    gl.readPixels(px - 1, py - 1, 3, 3, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 9; i++) (r += buf[i * 4], g += buf[i * 4 + 1], b += buf[i * 4 + 2]);
    [r, g, b] = [r / 9, g / 9, b / 9];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let hue = 0;
    if (mx > mn) hue = mx === r ? ((g - b) / (mx - mn)) * 60 : mx === g ? (2 + (b - r) / (mx - mn)) * 60 : (4 + (r - g) / (mx - mn)) * 60;
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), hue: Math.round((hue + 360) % 360), on: v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1 };
  },
  // A test rig (round 7): a solid box of stone with hollows carved in it, straight into the chunks.
  rig: (box, id, holes) => world.fill(box, id, holes),
  // The pulse, for the drives: send one now (as a hold and let-go would), read when it can go again, set its reach.
  pulse: () => sendPulse(performance.now() / 1000),
  pulseReady: () => Math.max(0, pulseReadyAt - performance.now() / 1000),
  pulseReach: (r) => (r ? (pulseReach = r) : pulseReach),
  compassMarks: () => { compass(); return [...document.querySelectorAll('#marks .mk:not([hidden])')].map((m) => m.className.replace('mk ', '').split(' ')[0]); },
  ship: () => {
    const b = cave.base();
    return { x: b.x, y: b.y, z: b.z, bed: b.bed, med: b.med, log: b.log, legs: b.legs, lights: b.lights.length };
  },
  // Open, level ground with nothing standing on it, clear of the ship (round 7; 18 blocks from round 5's house): where the drives written
  // before round 5 (when the game started in a clearing, not in a house) stand to dig, build and look at the sky.
  clearing: () => {
    const b = cave.base();
    for (let r = 42; r < 200; r += 3)
      for (let a = 0; a < 16; a++) {
        const x = Math.round(b.x + Math.cos((a / 16) * Math.PI * 2) * r), z = Math.round(b.z + Math.sin((a / 16) * Math.PI * 2) * r);
        const h = cave.height(x, z);
        if (h <= 4) continue;
        let ok = true;
        for (let dz = -4; dz <= 4 && ok; dz++)
          for (let dx = -4; dx <= 4 && ok; dx++) {
            const hh = cave.height(x + dx, z + dz);
            const top = world.get(x + dx, hh, z + dz);
            if (Math.abs(hh - h) > 1 || !BLOCKS[top].solid || top === B.LEAVES || top === B.LOG || top === B.BIRCH) ok = false;
            for (let y = hh + 1; y <= hh + 10 && ok; y++) {
              const id = world.get(x + dx, y, z + dz);
              if (id !== B.AIR && !isPlant[id]) ok = false;
            }
          }
        if (ok) return [x + 0.5, h + 1.01, z + 0.5];
      }
    return null;
  },
  heightAt: (x, z) => cave.height(x, z),
  // DIG-007: the districts as built here (ids, places, the readable spots and which texts are on them, the road's
  // ends, the chamber, the fingerprints), the record, and reading what is under the crosshair.
  districts: () => districts.map((b) => ({
    id: b.S.district.id, at: b.at, box: b.S.box, print: fingerprint(b), blocks: blockPrint(cave, b.S), left: b.left.length, tuning: b.S.district.tuning ?? null,
    roadEnds: b.S.roadEnds, chamber: b.S.chamber ? { box: b.S.chamber.box, at: b.S.chamber.anchor.at, way: b.S.chamber.way } : null,
    spaces: b.S.spaces.map((s) => ({ kind: s.kind, box: s.box, whole: !!s.whole, level: s.level })),
    anchors: b.S.anchors.map((a) => ({ n: a.n, kind: a.kind, at: a.at, secret: !!a.secret, space: a.space, texts: (b.texts.get(a.n) ?? []).map((t) => t.id) }))
  })),
  record: () => record.map((r) => ({ d: r.d, t: r.t, on: r.on })),
  menu: () => openMenu(),
  tuned: () => ({ ...tuned }),
  readCarved: () => {
    const t = lookTarget();
    const here = t && textsAt(cave, t.x, t.y, t.z);
    if (here) readCarved(here);
    return !!here;
  },
  safeAt: (x, y, z) => cave.settle.safeAt(x, y, z),
  // Stand in front of a cell and look at it: the open side (at its height, or just under it), feet on the first floor.
  faceCell: (x, y, z) => {
    for (const dy of [0, -1, -2]) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const sx = x + dx * 2, sz = z + dz * 2;
        if (world.get(x + dx, y + dy, z + dz) !== B.AIR || world.get(sx, y + dy, sz) !== B.AIR) continue;
        let fy = y + dy;
        while (fy > y - 8 && !BLOCKS[world.get(sx, fy - 1, sz)].solid) fy--;
        if (!BLOCKS[world.get(sx, fy - 1, sz)].solid) continue;
        world.plannedAt = null;
        hand.dropHook();
        player.pos.set(sx + 0.5, fy + 0.01, sz + 0.5);
        player.vel.set(0, 0, 0);
        player.fallFrom = null;
        const e = player.eye(), tx = x + 0.5 - e.x, ty = y + 0.5 - e.y, tz = z + 0.5 - e.z;
        player.yaw = Math.atan2(-tx, -tz);
        player.pitch = Math.atan2(ty, Math.hypot(tx, tz));
        return [sx, fy, sz];
      }
    }
    return null;
  }
};
