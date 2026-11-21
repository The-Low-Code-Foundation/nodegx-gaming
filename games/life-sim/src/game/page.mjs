// The life prototype (public/life/): realistic flatmates with needs, moods, free will, a to-do list, what they do
// together (social.mjs), and (round 9) three places: home, the office they work at, and the park. You see one place at
// a time, the one the Sim you look after is in: when they go to work, you go with them.
//   ?person=0…11 (who moves in; default 0)  ?flatmate=0…11 | none (default: anyone else, at random)  ?speed=0…3
//   ?needs=hunger:10,energy:80 (start values; ?needs2= for the flatmate)  ?freewill=0  ?start=07:30 (the clock)
//   ?seed=1 (free will's dice, for tests)  ?year=CE2 (the school year the work questions are pitched at)
//   ?colleagues=2,3,4,5 (who works at the office; default four others, at random) | none
//   ?traits=lazy,joker,neat (round 16: the first Sim's traits; ?traits2= the flatmate's; a test's URL has none otherwise)
//   ?goal=family|career|dreamHouse|popular|chef (round 16, phase 2: the first Sim's dream; ?goal2= the flatmate's;
//   ?goals=1 rolls them; a test's URL has no dreams, wants or happy points otherwise)
//   ?story=savings|friend|sweetheart|broke|inherit (round 16: how the life begins, starts.mjs; a test's URL: as before)
//   ?town=N (round 16: the town's seed; a test's URL has the classic Sunny Lane, 0, and a new game a town of its own)
// Round 10: a plain /life/ starts with "carry on, or a new game?" (a save in this browser) or the create-a-Sim screen,
// and saves as it goes. A test's URL (?seed=, ?person= or ?flatmate=) starts straight in as before and saves nothing;
// ?menu adds the start back (and saving) to a test's URL; ?save=1 saves without it.
// Round 12: two Sims in love who live together can have a baby (baby.mjs): a cot in the flat, a name on a card.
// Round 14 (town.mjs): the town — the colleagues and two neighbours live in houses you can go round to (parties most
// evenings, invited or not), houses for sale to look round and buy, an extension to build; everything in your home can
// be moved, sold or put away in the boxes, and the shop has a lot more in it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeSky, tick as tickDressing, daylight, partyDecor, weatherLook, greySky, snowman, seasonLook, eventDecor } from '../dressing.mjs';
import { CANDIDATES, loadTemplate } from '../characters.mjs';
import { buildPlace, STATIONS, MADE, measure, ghost, placementOf, houseFurniture, stallModel } from '../world.mjs';
import { Sim } from '../sim.mjs';
import { Life, SPEEDS, SKILL_LEVELS, skillLevel } from './life.mjs';
import { NEEDS, MOODLETS, EMOTIONS } from './needs.mjs';
import { OFFERS, offersFor, offerById } from './actions.mjs';
import { INTERACTIONS, interactionById, bondOf, peekBond, lockOf, friendshipLevel, romanceLevel, allBonds, setBonds, spouseOf } from './social.mjs';
import { CAREERS, START_MONEY, TASK, weekday, levelOfJob, nextLevel, careerOf, workPlaceOf, stationsOf } from './work.mjs';
import { YEARS, DEFAULT_YEAR, ask, record, topicsFor } from './school/school.mjs';
import { t } from './strings.mjs';
import { Props } from './props.mjs';
import { people } from './looks.mjs';
import { createSim, lookControls } from './create.mjs';
import { readSave, writeSave, clearSave, lifeState, restoreLife } from './save.mjs';
import { SHOP, SHOP_KINDS, shopItem, CAMP_BED, COT, PET_BED, sellPrice, LOVELY, LOOK_COST, kindOf, FLAT_FURNITURE } from './shop.mjs';
import { SIZES, EXTENSION, HOUSES, houseById, FLAT_LOOK, COLLEAGUE_HOUSES, NEIGHBOURS, awake, PARTY, INVITED, partyHouse, partyNow, GUEST, HOME_PARTY, STREET_SIZE, streetLayout, TOWN, makeTown, rollTown, townDice } from './town.mjs';
import { blankLook } from './looks.mjs';
import { makeProp, wear } from './props.mjs';
import { Baby, BABY_NEEDS, BABY_NAMES, BLANKETS, MAX_BABIES } from './baby.mjs';
import { CHILDCARE, NURSERY_CARED, careNow, careCost, nurseryOpen } from './childcare.mjs';
import { STARTS, startById, surprise } from './starts.mjs';
import { TRAITS, TRAIT_IDS, PERKS, rollTraits, cleanTraits, fits } from './traits.mjs';
import { REWARDS, rewardById, cantBuy } from './rewards.mjs';
import { rollLikes, cleanLikes, GIFT } from './likes.mjs';
import { GOALS, goalById, openGoals, rollGoal, stepsDone, STEP_POINTS, GOAL_POINTS } from './goals.mjs';
import { WANTS, WANT_SLOTS, WANT_LASTS, rollWant, wantById } from './wants.mjs';
import { DECK, EVENTS, POWER_CUT, eventById, pickEvent, pickWho, outcomeOf } from './events.mjs';
import { WEATHER, rollWeather } from './weather.mjs';
import { Pet, PETS, PET_KINDS, PET_NEEDS, MAX_PETS, ADOPT_FEE, addPets } from './pets.mjs';
import { SKILLS, SKILL_IDS, addSkills, levelsOf, FIXING, EARNING, ODD_JOB, freshSide, earnWhy } from './skills.mjs';
import { TOWNLIFE, dayOfTown, startTown, priceFor, REACH, pickReach, sociable, DRAWN } from './townlife.mjs';
import { CALENDAR, SEASONS, SEASON_IDS, seasonById, YEAR_DAYS, dateOf, yearDayOf, rollStart, startFor, rollBirthday, BIRTHDAY, PRESENT_KINDS, TOWN_EVENTS, TOWN_EVENT, PRIZES, contestPlace, townEventOn, eventOpen, WEEKEND, isWeekend } from './calendar.mjs';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
$('hint').textContent = t('ui.hint');
$('loading').textContent = t('ui.loading');

// A seeded random for tests (?seed=), Math.random otherwise.
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const random = params.has('seed') ? seeded(Number(params.get('seed'))) : Math.random;

// ---- the scene ----
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('view').appendChild(renderer.domElement);
const scene = new THREE.Scene();
// Round 11 (polish): a soft room light for the shiny things to reflect (ceramic, metal, glossy tiles: `shine` below,
// once the places are built; on every surface it was half the frame in software, and the tablet pays per pixel too),
// a sky that follows the clock, and a haze its colour so the ground fades into it instead of ending at an edge.
const pmrem = new THREE.PMREMGenerator(renderer);
const roomLight = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
const shiny = [];
const skyDome = makeSky();
scene.add(skyDome.mesh);
scene.fog = new THREE.Fog(0xcfe2ee, 24, 60);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 200);
skyDome.update(12, camera);
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { minPolarAngle: 0.45, maxPolarAngle: 1.15, minDistance: 4, enableDamping: true, screenSpacePanning: false });
const sky = new THREE.HemisphereLight(0xe6eeff, 0x8a7458, 1.4);
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
const lamp = new THREE.PointLight(0xffd9a0, 0, 9, 1.4);
lamp.position.set(-0.5, 2.3, 0.3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 2.5; // soft edges (PCF)
scene.add(sky, sun, sun.target, lamp);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- the places ----
// All three sit at the world's origin; only the one you are looking at is shown (and only the Sims in it).
const labels = Object.fromEntries(STATIONS.map((s) => [s.id, t(`station.${s.id}`)]));
// Round 14: the flat is built empty (its door only) and furnished by the page from the household's furniture (below),
// so anything in it can be moved, sold or put away. `home` is whichever home the household has now: the flat, the flat
// with an extension, or a house they bought (`rehome`). The town's houses are built the first time someone goes.
// Round 15: and Sunny Lane, the street the houses stand on (world.mjs lifeStreet). Round 16: built once the start is
// chosen, because the street is the town's (town.mjs makeTown: a new game's own, or the saved one).
const [flat, office, park] = await Promise.all([buildPlace('lifeHome', { empty: true }), buildPlace('lifeOffice', { labels }), buildPlace('lifePark')]);
let street = null;
let home = flat;
home.house = 'flat';
const places = { home, office, park };
// Round 16, phase 5.3: a career's own place (work.mjs `place`: the café), built the first time someone has that job
// (taking it, a save with it, or the morning they go), as a town house is.
const CAREER_PLACES = { cafe: 'lifeCafe', vet: 'lifeVet' };
const careerLabels = (career) => Object.fromEntries(STATIONS.map((s) => [s.id, stationName(career, s.id)]));
const workBuilding = new Map();
function careerPlace(id) {
  if (places[id]) return Promise.resolve(places[id]);
  if (!CAREER_PLACES[id]) return Promise.resolve(null);
  if (!workBuilding.has(id))
    workBuilding.set(id, (async () => {
      const p = await buildPlace(CAREER_PLACES[id], { labels: careerLabels(id) });
      shine(p);
      scene.add(p.group);
      p.group.visible = view === p;
      p.work = id;
      places[id] = p;
      workBuilding.delete(id);
      return p;
    })());
  return workBuilding.get(id);
}
// A station's name: the career's own (the café's till), or the office's.
function stationName(career, id) {
  const key = `station.${career}.${id}`;
  return career && career !== 'office' && t(key) !== key ? t(key) : t(`station.${id}`);
}
const stationJob = (career, id) => (career && career !== 'office' && t(`station.${career}.${id}.job`) !== `station.${career}.${id}.job` ? t(`station.${career}.${id}.job`) : t(`station.${id}.job`));
const workOf = (l) => (l.job ? places[workPlaceOf(l.job)] ?? office : office);
// The days a career works, in words ("Monday to Friday").
const daysWords = (career) => (t(`job.${career}.days`) !== `job.${career}.days` ? t(`job.${career}.days`) : t('ui.job.weekdays'));
// The shiny things take the room light; matte ones (walls, floors, cloth, wood) don't need it.
function shine(p) {
  p.group.traverse((o) => {
    for (const m of o.material ? [o.material].flat() : [])
      if (m.isMeshStandardMaterial && !m.envMap && (m.metalness > 0.3 || m.roughness < 0.3) && !shiny.includes(m)) (m.envMap = roomLight), shiny.push(m);
  });
}
for (const p of [home, office, park]) shine(p);
const allPlaces = () => [...new Set(Object.values(places))];
const nameOf = (p) => Object.keys(places).find((k) => places[k] === p);
for (const p of [home, office, park]) scene.add(p.group);
const place = home; // the flat as it was at the start (round 8's name, kept for the checks)
let view = null;
// `centre`: where to look (the Sim you look after, when the view goes with them); the camera keeps the place's angle.
function setView(p, centre = null) {
  if (view === p) return;
  view = p;
  for (const q of allPlaces()) q.group.visible = q === p;
  controls.target.set(...p.view.target);
  camera.position.set(...p.view.camera);
  // The flat is seen whole; anywhere bigger (round 14: a house too), the camera starts on the one you look after.
  if (centre && p.bounds.w > 8) {
    const shift = centre.clone().setY(p.view.target[1]).sub(controls.target);
    controls.target.add(shift);
    camera.position.add(shift);
  }
  controls.maxDistance = p.view.max;
  controls.update();
  Object.assign(sun.shadow.camera, { left: -p.shadow, right: p.shadow, top: p.shadow, bottom: -p.shadow, near: 1, far: 40 + p.shadow * 2 });
  sun.shadow.camera.updateProjectionMatrix();
  if (p.view.fog) [scene.fog.near, scene.fog.far] = p.view.fog;
  $('menu').hidden = true;
}
setView(home);

// ---- the Sims ----
// People 0–5 are women, 6–11 men. The flatmate is anyone else, new on every load (the brief, 10-29: "a random character on
// page load for now"); ?flatmate= picks one (the checks: 7, Hugo), ?flatmate=none lives alone, the single-Sim control.
// Math.random, never the seeded dice: drawing from those would move the first Sim's seeded choices.
const hhmm = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const NAMES = ['Ada', 'Bea', 'Cleo', 'Dora', 'Eva', 'Flo', 'Gus', 'Hugo', 'Ivan', 'Jules', 'Kofi', 'Leo'];
const quick = ['seed', 'person', 'flatmate'].some((k) => params.has(k)) && !params.has('menu');
const saving = !quick || params.has('save');
// Round 16, phase 2: dreams, wishes and happy points (goals.mjs, wants.mjs). Off on a test's URL unless asked for.
const aimsOn = !quick || params.has('goal') || params.has('goals');
// Round 16, phase 5: skills from objects (skills.mjs), not on a test URL unless `?skills=1`: the skill gains of the
// things already in the game, the new things to do and to buy. Off, seeded free will chooses as it did.
const skillsOn = !quick || params.has('skills');
if (skillsOn) addPets(OFFERS);
if (skillsOn) addSkills(OFFERS, INTERACTIONS);
// Round 16, phase 3: things happen (events.mjs), not on a test URL unless `?events=1` (or `?event=<id>`: that one, at
// once). The deck's state: when it is next looked at, what came up when, today's count, a party you were asked to.
const eventsOn = !quick || params.has('events') || params.has('event');
let forcedEvent = params.get('event');
let neighboursIn = false;
const template = await loadTemplate(CANDIDATES.find((c) => c.id === 'rocketbox'), { renderer, scene, camera });
// Every Sim is a clone of their person; the person's own body stays aside to lend its hair and clothes (looks.mjs).
const folk = people(template);

// ---- the start (round 10): carry on, or a new game made on the create-a-Sim screen ----
const YEAR_STORED = (() => {
  try {
    return localStorage.getItem('lifesim.year');
  } catch {
    return null;
  }
})();
let start = null;
if (!quick) start = await startScreen(readSave());
const saved = start?.kind === 'continue' ? start.save : null;
// Round 16, phase 6: the calendar (calendar.mjs; its date is set once the clock is, below).
const seasonForced = SEASON_IDS.includes(params.get('season')) ? params.get('season') : null;
const dateForced = params.has('date') ? Math.max(1, Math.min(YEAR_DAYS, Number(params.get('date')) || 1)) - 1 : null;
const calendarOn = !quick || params.has('calendar') || !!seasonForced || dateForced != null;
const calendar = { start: null, told: null, born: {}, cake: {}, presents: {}, events: {}, ...(saved?.calendar ?? {}) };
// Round 16, phase 3.4: the day's weather ({ day, id }: weather.mjs), rolled each morning; a test URL has sunshine unless
// `?weather=rain|snow|sun` (which keeps it so).
const weatherForced = WEATHER[params.get('weather')] ? params.get('weather') : null;
// Round 16, phase 6.1: and with the calendar on, the season's weather.
const weatherOn = !quick || !!weatherForced || calendarOn;
let weather = saved?.weather ?? null;
// The event deck's state (round 16, phase 3; `eventsOn` above).
const deck = { next: null, last: null, seen: {}, day: null, today: 0, party: null, ...(saved?.deck ?? {}) };
// Round 16, phase 4: the town lives without you (townlife.mjs), not on a test URL unless `?townlife=1`. Its state: the
// last day played out, the day someone last moved in (and when each newcomer did), the town's babies, the notice
// board's news (and how many are new to the household), whether its bonds have been started.
const townLifeOn = !quick || params.has('townlife');
const townLife = { day: null, lastNew: null, arrived: {}, babies: [], news: [], unread: 0, started: false, ...(saved?.town?.life ?? {}) };
const person = start?.kind === 'new' ? start.who : saved ? saved.lives[0].who : Number(params.get('person') ?? 0);
// Not in a saved game: everyone is who they were.
// Round 16: how this life begins (starts.mjs): chosen after making the Sim, or ?story= on a test's URL.
const story = saved ? null : startById(start?.story ?? params.get('story'));
const mate = saved ? null : params.get('flatmate') === 'none' ? null : params.has('flatmate') ? Number(params.get('flatmate')) : story && !story.mate ? null : (person + 1 + Math.floor(Math.random() * 11)) % 12;
// Round 16, phase 2: and what do they dream of? (goals.mjs) One card each, and "surprise me".
function goalCard(name) {
  return new Promise((resolve) => {
    $('card').innerHTML = `<h2>${t('goal.title', { name })}</h2><p class="intro">${t('goal.intro')}</p>${goalRows(openGoals([], skillsOn))}
      <div class="actions"><button class="go" id="goal-surprise">🎲 ${t('start.surprise')}</button></div>`;
    $('card').hidden = $('card-back').hidden = false;
    const done = (id) => (($('card').hidden = $('card-back').hidden = true), resolve(id));
    for (const b of $('card').querySelectorAll('[data-goal]')) b.onclick = () => done(b.dataset.goal);
    $('goal-surprise').onclick = () => done(rollGoal([], Math.random, skillsOn));
  });
}
// (A function, not a const: the start screen asks before this line has run.)
function goalRows(list) {
  return list.map((g) => `<div class="offer"><div class="big">${g.icon}</div><div><b>${t(`goal.${g.id}`)}</b><div>${t(`goal.${g.id}.does`)}</div></div><button class="go" data-goal="${g.id}">${t('start.pick')}</button></div>`).join('');
}
// How does it begin? The game's starts, one card each, and "surprise me".
function storyCard() {
  return new Promise((resolve) => {
    const row = (s) => `<div class="offer"><div class="big">${s.icon}</div><div><b>${t(`start.${s.id}`)}</b><div>${t(`start.${s.id}.does`, { coins: s.money })}</div></div><button class="go" data-story="${s.id}">${t('start.pick')}</button></div>`;
    $('card').innerHTML = `<h2>${t('start.title')}</h2><p class="intro">${t('start.intro')}</p>${STARTS.map(row).join('')}
      <div class="actions"><button class="go" id="story-surprise">🎲 ${t('start.surprise')}</button></div>`;
    $('card').hidden = $('card-back').hidden = false;
    const done = (s) => (($('card').hidden = $('card-back').hidden = true), resolve(s));
    for (const b of $('card').querySelectorAll('[data-story]')) b.onclick = () => done(startById(b.dataset.story));
    $('story-surprise').onclick = () => done(surprise());
  });
}
// ---- the town (round 16, town.mjs makeTown) ----
// A saved game: its town (a save from before round 16: the classic Sunny Lane, which it was). A new game: a new town,
// rolled here. A test's URL: the classic town, or ?town=N.
const townSeed = saved ? Number(saved.town?.seed ?? 0) : params.has('town') ? Number(params.get('town')) : quick ? 0 : rollTown();
makeTown(townSeed);
// Round 16, phase 4: and the town as it has changed since (townlife.mjs): which houses are lived in, which for sale.
for (const s of saved?.town?.houses ?? []) {
  const h = houseById(s.id);
  if (!h || !['lived', 'sale'].includes(s.kind)) continue;
  h.kind = s.kind;
  if (s.kind === 'sale') Object.assign(h, { price: Number(s.price) || priceFor(h.size, Math.random), name: Number(s.name) || 0 });
  else delete h.price;
}
// Where someone lives, as saved (townlife.mjs moves people), or where they were put at the start.
const homeOf = (who, start) => (houseById(saved?.town?.homes?.[who]) ? saved.town.homes[who] : start);
const streetName = () => t(`town.street.${TOWN.street}`);
const houseName = (h) => (h ? t(`house.name.${h.name}`) : '');
street = places.street = await buildPlace('lifeStreet', { ...STREET_SIZE, fronts: streetLayout(), name: streetName() });
shine(street);
scene.add(street.group);
street.group.visible = view === street;

// Carry on (a save in this browser), or a new game. With no save, straight to making a Sim.
async function startScreen(save) {
  renderer.render(scene, camera);
  if (save) {
    const names = save.lives.map((l) => l.name).join(', ');
    const when = `${t('ui.day', { day: Math.floor(save.minutes / 1440) + 1, weekday: t(`day.${Math.floor(save.minutes / 1440) % 7}`) })} · ${hhmm(save.minutes)}`;
    const choice = await new Promise((resolve) => {
      $('card').innerHTML = `<h2>${t('ui.start.title')}</h2>
        <div class="offer"><div class="big">🏠</div><div><b>${t('ui.start.carryOn', { names })}</b><div>${when} · ${t('ui.coins', { n: save.money })}</div></div><button class="go" id="start-continue">${t('ui.start.continue')}</button></div>
        <div class="offer"><div class="big">✨</div><div><b>${t('ui.start.new')}</b><div>${t('ui.start.newHint')}</div></div><button id="start-new">${t('ui.start.newButton')}</button></div>`;
      $('card').hidden = $('card-back').hidden = false;
      $('start-continue').onclick = () => resolve('continue');
      $('start-new').onclick = () => {
        $('card').innerHTML = `<h2>${t('ui.start.sure')}</h2><p class="intro">${t('ui.start.sureText', { names })}</p>
          <div class="actions"><button id="start-back">${t('ui.start.back')}</button><button class="go" id="start-yes">${t('ui.start.yes')}</button></div>`;
        $('start-back').onclick = () => resolve(startScreen(save));
        $('start-yes').onclick = () => resolve('new');
      };
    });
    if (typeof choice === 'object') return choice;
    $('card').hidden = $('card-back').hidden = true;
    if (choice === 'continue') return { kind: 'continue', save };
  }
  $('loading').textContent = '';
  for (const p of allPlaces()) p.group.visible = false;
  sun.position.set(3, 6, 5);
  sun.target.position.set(0, 0, 0);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -1, near: 1, far: 20 });
  sun.shadow.camera.updateProjectionMatrix();
  const yearNow = [params.get('year'), YEAR_STORED, DEFAULT_YEAR].find((y) => YEARS.includes(y));
  // Its own light backdrop and stand: no sky or haze there (round 11).
  const haze = scene.fog;
  scene.fog = null;
  skyDome.mesh.visible = false;
  const made = await createSim({ renderer, scene, camera, controls, folk, t, names: NAMES, years: YEARS, year: yearNow, person: Number(params.get('person') ?? Math.floor(Math.random() * 12)) });
  scene.fog = haze;
  skyDome.mesh.visible = true;
  const story = await storyCard();
  const goal = await goalCard(made.name);
  view = null;
  setView(home);
  return { kind: 'new', ...made, story: story.id, goal };
}

// A bubble a Sim, a column to click them by, and their place in the game. `body`: one already made (the create-a-Sim
// screen's); otherwise their person, dressed in `look`.
const proxyGeo = new THREE.CylinderGeometry(0.28, 0.28, 1.75, 8).translate(0, 0.875, 0);
const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
const lives = []; // who lives here (the household)
const everyone = []; // and the colleagues at the office
// ---- the household's home (round 14): which one, and how big. The flat ('flat', size 0) to begin with; a house in the
// town once bought (`paid`: what it cost, and its extensions: what it sells for when they move on). ----
let homeState = { id: saved?.home?.id ?? 'flat', size: saved?.home?.size ?? 0, paid: saved?.home?.paid ?? 0 };
// Round 16: an inherited house (starts.mjs 'inherit'): the biggest one for sale is theirs, and sells for its price.
if (story?.home === 'inherit') {
  const h = HOUSES.filter((x) => x.kind === 'sale').sort((a, b) => b.size - a.size || b.price - a.price)[0];
  homeState = { id: h.id, size: h.size, paid: h.price };
}
// A house, empty but for its door, for the household to furnish: the flat as it was made, or any size (town.mjs SIZES).
async function buildHomePlace(st) {
  const p = st.id === 'flat' && !st.size ? await buildPlace('lifeHome', { empty: true }) : await buildPlace('lifeHouse', { ...SIZES[st.size], look: st.id === 'flat' ? FLAT_LOOK : houseById(st.id).look });
  p.house = st.id;
  shine(p);
  scene.add(p.group);
  return p;
}
if (homeState.id !== 'flat' || homeState.size) {
  const p = await buildHomePlace(homeState);
  scene.remove(flat.group);
  home = places.home = p;
  view = null;
  setView(home);
}
// The money is the household's: whoever earns it, anyone can spend it.
// `childcare` (round 13): who looks after the babies while everyone is out, 'nanny' or 'nursery' (null: ask).
const household = { money: saved?.money ?? story?.money ?? START_MONEY, childcare: saved?.childcare ?? null };
// Round 16, phase 5.2: the side earnings (skills.mjs): paintings not yet sold, the vegetables, today's odd job.
household.side = skillsOn ? { ...freshSide(), ...(saved?.side ?? {}) } : null;
async function makeSim(who, at, i, { name = null, look = null, body = null, ...opts } = {}) {
  const sim = new Sim(body ?? (await folk.body(who, look)), at);
  scene.add(sim.group);
  if (sim.blob) scene.add(sim.blob);
  // Each Sim their own dice: the others' fidgets don't move the first Sim's seeded choices (the round 6 checks).
  const dice = i && params.has('seed') ? seeded(Number(params.get('seed')) + 1000 * i) : i ? Math.random : random;
  const life = new Life(sim, at, { name: name || NAMES[who] || `Sim ${i + 1}`, random: dice, ...opts });
  life.who = who;
  life.look = look;
  // A click on a Sim lands on this (an invisible column the size of a person): the body is skinned, so its triangles
  // are not where the raycaster would look for them.
  const proxy = new THREE.Mesh(proxyGeo, proxyMat);
  proxy.userData.life = life;
  life.proxy = proxy;
  sim.group.add(proxy);
  life.places = places;
  life.everyone = everyone;
  life.clock = () => minutes;
  life.onMoveIn = moveIn;
  life.onBaby = haveBaby;
  life.onDressUp = dressUp;
  life.mayLeave = mayLeave;
  life.via = via;
  life.partnerOf = (other) => partners(life, other);
  life.onArrive = arrived;
  life.onDid = wished;
  life.offerOk = (offer) => inWeather(offer) && !offerWhy(life, offer);
  // Round 16, phase 6: the season's and the weekend's leanings, and a weekend lie-in (calendar.mjs).
  if (calendarOn) (life.lean = (id, hour) => leanOf(life, id, hour)), (life.lieIn = () => lieInNow(life));
  life.needPlace = (id) => careerPlace(id);
  life.titleOf = (p) => titleOf(p);
  everyone.push(life);
  return life;
}
// Who moves in: the Sim you made (or person 0 in a test) and a flatmate at random (the brief, 10-29: "a random character
// on page load for now"; ?flatmate= picks one, ?flatmate=none lives alone, the single-Sim control), or the saved
// household. Math.random picks the flatmate, never the seeded dice: drawing from those would move the first Sim's
// seeded choices.
const members = saved
  ? saved.lives.map((s) => ({ who: s.who, name: s.name, look: s.look, s }))
  : [{ who: person, name: start?.name, look: start?.look ?? null, body: start?.body ?? null, year: start?.year, traits: start?.traits }, ...(mate != null ? [{ who: mate }] : [])];
for (const [i, m] of members.entries()) {
  const life = await makeSim(m.who, home, i, { household, name: m.name, look: m.look, body: m.body });
  // The flatmate starts on the rug (the second start spot is behind the TV in this flat).
  life.sim.position.copy(home.freeSpot(i === 0 ? 0 : i === 1 ? 2 : i + 1));
  const startNeeds = params.get(i ? 'needs2' : 'needs');
  if (startNeeds) for (const kv of startNeeds.split(',')) life.needs[kv.split(':')[0]] = Number(kv.split(':')[1]);
  if (m.s) restoreLife(life, m.s, saved.minutes);
  // Round 16, phase 5.3: a saved job somewhere else than the office (the café): that place built now, ready for the day.
  if (life.job && CAREERS[life.job.career] && workPlaceOf(life.job) !== 'office') await careerPlace(workPlaceOf(life.job));
  if (m.year) life.year = m.year;
  // Round 16 (traits.mjs): who they are. A new game: the ones chosen on the make-your-Sim screen (or rolled), and any
  // three for the flatmate. A test's URL: none unless ?traits= (so a seeded test's free will chooses as it did).
  // And (likes.mjs) their favourites; none on a test's URL, for the same reason.
  if (!m.s) life.likes = quick ? null : rollLikes();
  // A save from before round 16 (v1, v2): three traits and favourites for each of them now (save.mjs).
  if (m.s && !cleanTraits(life.traits).length) life.traits = rollTraits();
  if (m.s && !cleanLikes(life.likes)) life.likes = rollLikes();
  // Round 16, phase 2: their dream (chosen on the start screen, or rolled; the flatmate's rolled). `quiet`: steps that
  // are already true when it begins are ticked off without points (a Team member's first career steps).
  if (!m.s && aimsOn) {
    const asked = i === 0 ? start?.goal ?? params.get('goal') : params.get('goal2');
    const id = goalById(asked) && !goalById(asked).later && (skillsOn || !goalById(asked).skills) ? asked : rollGoal([], Math.random, skillsOn);
    life.goal = id ? { id, step: 0, quiet: true } : null;
  }
  if (!m.s) life.traits = params.has(i ? 'traits2' : 'traits') ? cleanTraits(params.get(i ? 'traits2' : 'traits').split(',')) : quick ? [] : rollTraits(Math.random, cleanTraits(m.traits));
  life.freeWill = params.get('freewill') !== '0';
  lives.push(life);
}
if (saved) setBonds(saved.bonds);
// Round 16: how the household get on at the start, and a job from day one (starts.mjs).
if (story?.bond && lives[1]) Object.assign(bondOf(lives[0], lives[1]), story.bond);
if (story?.job) lives[0].job = { ...story.job, performance: 0, lastDay: -1 };
// What stands in the household's home, in order: saved, and put back. Round 14: all of it, the flat's own things too
// (shop.mjs FLAT_FURNITURE, `base`: they came with the flat, and make it no lovelier), so anything can be moved, sold
// or put in the boxes. `extras` (round 10's name, the checks'): what was added, bought or a cot or a camp bed.
// `storage`: the boxes, things put away to put out again (shop.mjs ids).
const furniture = [];
const extras = () => furniture.filter((e) => !e.base);
const storage = Array.isArray(saved?.storage) ? saved.storage.filter((id) => kindOf(id)) : [];
// The flat's own things among them (ids, once each): put out again, they are still the flat's own (no lovelier).
const boxedBase = Array.isArray(saved?.boxedBase) ? [...saved.boxedBase] : [];
const srcOf = (s) => (s.made ? MADE[s.made] : `assets/furniture/${s.model}.glb`);
// Placed in one go (one instanced mesh a model, as world.mjs furnishes a place).
async function placeFurniture(list) {
  const ok = list.filter((e) => kindOf(e.id));
  const items = await home.add(ok.map(placementOf));
  // The shiny ones (the loo's ceramic, the fridge's metal) take the room light, as the places' own things do.
  shine(home);
  return ok.map((e, i) => {
    const s = kindOf(e.id), item = items[i];
    Object.assign(item, { bought: s, beauty: e.base ? 0 : s.beauty ?? 0 });
    furniture.push({ id: e.id, x: e.x, z: e.z, turn: e.turn ?? 0, ...(e.width ? { width: e.width } : {}), ...(e.base ? { base: true } : {}), item });
    return item;
  });
}
const placeExtra = async (e) => (await placeFurniture([e]))[0];
const entryOf = (item) => furniture.find((e) => e.item === item) ?? null;
function removeExtra(item) {
  const k = furniture.findIndex((e) => e.item === item);
  if (k >= 0) furniture.splice(k, 1);
  for (const l of everyone) if (l.home === item || (item.twin && l.home === item.twin)) l.home = null;
  home.remove(item);
}
// ---- a double bed (round 15) ----
// A couple who live together (married, or in love) share a double bed when there is one: a side each, their own beds
// left free (a camp bed is folded away). Checked a few times a second, so it happens when the bed is bought, moved, or
// carried to a new home, and when two fall in love or marry. The other side of anyone else's bed is left alone.
const partners = (a, b) => a !== b && lives.includes(a) && lives.includes(b) && (bondOf(a, b).married || romanceLevel(bondOf(a, b)).id === 'inLove');
function shareBeds() {
  const doubles = home.items.filter((i) => i.twin && !i.side && !i.gone);
  if (!doubles.length) return;
  for (const [k, a] of lives.entries())
    for (const b of lives.slice(k + 1)) {
      if (!partners(a, b)) continue;
      const theirs = (d) => [d.owner, d.twin.owner].every((o) => !o || o === a || o === b);
      const bed = doubles.find((d) => [d.owner, d.twin.owner].includes(a) && theirs(d)) ?? doubles.find((d) => [d.owner, d.twin.owner].includes(b) && theirs(d)) ?? doubles.find(theirs);
      if (!bed || (a.home === bed || a.home === bed.twin) && (b.home === bed || b.home === bed.twin)) continue;
      // Whoever has a side keeps it.
      const [first, second] = bed.owner === b || bed.twin.owner === a ? [b, a] : [a, b];
      for (const l of [a, b]) {
        const old = l.home;
        if (!old || old === bed || old === bed.twin) continue;
        old.owner = null;
        l.home = null;
        if (old.bought?.id === 'campBed') removeExtra(old);
      }
      bed.owner = first, first.home = bed;
      bed.twin.owner = second, second.home = bed.twin;
      toast(t('ui.bed.share', { a: first.name, b: second.name }));
      save();
    }
}
// A click on a double bed: the side that is theirs, or the one free.
const sideFor = (l, item) => (!item?.twin || item.side ? item : item.twin.owner === l || (item.owner && item.owner !== l) || (item.user && item.user !== l.sim) ? item.twin : item);
// A new game: the flat as it comes. A round-13 save (v1): the flat as it came, and what they had added to it.
// Round 16: an inherited house has only the basics in it (starts.mjs), spread out from where they stand in the flat
// to the same walls of the bigger house, each where it fits.
if (!saved && story?.home === 'inherit') {
  const { w, d } = home.bounds, out = (v, half, next) => (Math.abs(v) >= half - 1.0 ? v + Math.sign(v) * (next - half) : v * (next / half));
  const basics = FLAT_FURNITURE.filter((e) => story.basics.includes(e.id) && (e.id !== 'bed' || e.z < 0 || lives.length > 1));
  for (const e of basics) {
    const spot = await fitSpot(kindOf(e.id), { ...e, x: out(e.x, 3.5, w / 2), z: out(e.z, 3, d / 2) }, 6);
    if (spot) await placeFurniture([{ ...e, ...spot, base: true }]);
  }
} else await placeFurniture(saved?.furniture ?? [...FLAT_FURNITURE.map((e) => ({ ...e, base: true })), ...(saved?.extras ?? [])]);

// ---- a wedding (round 12, social.mjs `marry`) ----
// Wedding clothes for as long as it lasts: a bride's outfit all white with a long skirt, a veil and flowers; a groom's
// a dark suit with a bow tie and a rose (props.mjs `wear`). Then their own clothes again, as they were.
const BRIDE = ['#fbf8f2', '#fbf8f2', '#fbf8f2'], GROOM = ['#1f2a44', '#1f2a44', '#15181f'];
const isWoman = (l) => /^Female/.test(folk.cast[l.who]?.name ?? '');
// `later`: just married, so the clothes stay on a moment for the hearts (real time: it is a moment to see).
function dressUp(list, on, later = false) {
  for (const l of list) {
    clearTimeout(l.undressLater);
    if (!on && later) {
      l.undressLater = setTimeout(() => dressUp([l], false), 3000);
      continue;
    }
    l.undress?.();
    l.undress = null;
    const own = l.look ?? blankLook();
    if (!on) {
      folk.redress(l.sim.body, own);
      continue;
    }
    const kind = isWoman(l) ? 'bride' : 'groom';
    folk.redress(l.sim.body, { ...structuredClone(own), outfit: { from: own.outfit?.from ?? null, colours: kind === 'bride' ? BRIDE : GROOM } });
    l.undress = wear(l.sim, kind);
  }
}

// A kiss (round 12, an interaction's `kiss`): Rocketbox has no kissing clip, so while it is 'said' the two lean in to
// each other from the spine, on top of whatever the body plays, and straighten up after. `leanTo` remembers what was
// set: a frame where the clip did not write the spine again must not lean twice.
const leanQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), leanAxis = new THREE.Vector3();
function lean(l, dt) {
  const d = l.doing, ld = d?.role === 'partner' ? d.lead : d;
  const want = ld?.offer.kiss && ld.started && ld.phase === 'say' ? 1 : 0;
  l.kissLean = (l.kissLean ?? 0) + (want - (l.kissLean ?? 0)) * Math.min(1, dt * 2.5);
  const spine = l.sim.body.outer.getObjectByName('ls_spine');
  if (!spine) return;
  if (l.leanTo && spine.quaternion.equals(l.leanTo)) spine.quaternion.copy(l.leanFrom);
  l.leanTo = null;
  if (l.kissLean < 0.01) return;
  l.leanFrom = spine.quaternion.clone();
  const turn = l.sim.group.rotation.y;
  leanAxis.set(Math.cos(turn), 0, -Math.sin(turn)); // up × forward: tips the top of the body forward
  spine.parent.updateWorldMatrix(true, false);
  spine.parent.getWorldQuaternion(parentQ);
  leanQ.setFromAxisAngle(leanAxis, 0.24 * l.kissLean);
  spine.quaternion.premultiply(parentQ.clone().invert().multiply(leanQ).multiply(parentQ));
  l.leanTo = spine.quaternion.clone();
}

// ---- babies (round 12, baby.mjs) ----
// Each in their own cot (an extra, like a camp bed: moved like something bought, never sold), drawn lying in it, out
// of it while someone cuddles them (they are in that Sim's arms: props.mjs).
const babies = [];
const newBabies = []; // born, waiting for the welcome card (their name)
function addBaby(baby, cot) {
  baby.cot = cot;
  cot.baby = baby;
  if (!baby.mesh) dressBaby(baby);
  if (!baby.bubble) makeBubble(baby);
  if (!babies.includes(baby)) babies.push(baby);
}
// The baby in their blanket's colour (again when it is changed on the welcome card).
function dressBaby(baby) {
  baby.mesh?.removeFromParent();
  baby.mesh = makeProp(`baby:${baby.colour}`);
  baby.mesh.rotation.order = 'YXZ';
  home.group.add(baby.mesh);
}
// "Have a baby" went well (life.mjs haveBaby): a cot where it fits, the baby in it, and the welcome card.
async function haveBaby(a, b) {
  if (babies.length >= MAX_BABIES) return;
  const baby = new Baby({ girl: Math.random() < 0.5, parents: [a.name, b.name], born: minutes });
  babies.push(baby);
  a.events.push({ key: 'ui.baby.born', vars: { name: a.name, other: b.name } });
  addBaby(baby, await placeExtra(await spotFor(COT, { id: 'cot', x: -0.6, z: -1.6, turn: 0 })));
  newBabies.push(baby);
}
// The cot they lie in: its place among what was added (a v1 save), or in the furniture (v2).
for (const s of saved?.babies ?? []) {
  const e = (saved.v >= 2 ? furniture : extras())[s.cot];
  if (e?.item && e.id === 'cot') addBaby(new Baby(s), e.item);
}
// ---- a pet (round 16, phase 5.4: pets.mjs) ----
// One a household, in its basket at home (shop.mjs PET_BED, placed with the furniture, moved like a cot). It walks
// about the home on the walk grid (Idle and Walking clips), comes to its basket when someone sees to it, and curls up
// there at night. Click it (or the basket) for what can be done for it. Drawn only when you look at home.
const pets = [];
const newPets = []; // adopted, waiting for their name on the welcome card
const petLoader = new GLTFLoader();
const petModels = {};
const PET_NIGHT = (h) => h >= 22 || h < 7;
async function drawPet(pet) {
  const def = PETS[pet.kind];
  petModels[pet.kind] ??= petLoader.loadAsync(def.model);
  const gltf = await petModels[pet.kind];
  const body = SkeletonUtils.clone(gltf.scene);
  const box = new THREE.Box3().setFromObject(body), size = box.getSize(new THREE.Vector3());
  const k = def.height / size.y;
  body.scale.setScalar(k);
  body.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
  // The models face +X; the game's things face +Z.
  const inner = new THREE.Group();
  inner.rotation.y = -Math.PI / 2;
  inner.add(body);
  const group = new THREE.Group();
  group.add(inner);
  body.traverse((o) => o.isMesh && ((o.castShadow = true), (o.frustumCulled = false)));
  // A click on it (an invisible box its size) is a click on its basket.
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.35, def.height, Math.max(size.x, size.z) * k), proxyMat);
  proxy.position.y = def.height / 2;
  proxy.userData.petBed = pet.bed;
  group.add(proxy);
  scene.add(group);
  const mixer = new THREE.AnimationMixer(body);
  const clip = (n) => mixer.clipAction(gltf.animations.find((a) => a.name === n));
  Object.assign(pet, { mesh: group, proxy, mixer, idle: clip('Idle'), walking: clip('Walking'), path: [], wait: 2, playing: null });
  pet.mesh.position.copy(pet.bed.spot);
  petPlay(pet, 'idle');
  if (!pet.bubble) makeBubble(pet);
}
function petPlay(pet, which) {
  if (pet.playing === which) return;
  const next = pet[which], was = pet.playing && pet[pet.playing];
  next.reset().play();
  if (was) next.crossFadeFrom(was, 0.25, false);
  pet.playing = which;
}
// Its basket placed again (moved, or the household moved house: a new item each time). `jump`: it is there at once.
function rebed(pet, item, jump = false) {
  item.pet = pet;
  pet.bed = item;
  if (pet.proxy) pet.proxy.userData.petBed = item;
  pet.path = [];
  if (jump && pet.mesh) pet.mesh.position.copy(item.spot).setY(0);
}
// Where it lies in its basket.
const basketAt = (pet) => pet.bed.obj.position.clone().setY(0);
// Its basket, and its welcome card. `kind` null: the shelter's card (the cat or the dog, for the fee).
async function adoptPet(kind, fee = 0) {
  if (pets.length >= MAX_PETS || !home) return null;
  household.money -= fee;
  const pet = new Pet({ kind, adopted: minutes });
  const bed = await placeExtra(await spotFor(PET_BED, { id: 'petBed', x: 1.4, z: 1.2, turn: 0 }));
  bed.pet = pet;
  pet.bed = bed;
  pets.push(pet);
  await drawPet(pet);
  newPets.push(pet);
  save();
  return pet;
}
function petCard(pet) {
  let name = '';
  const def = PETS[pet.kind];
  let hint = def.names[Math.floor(Math.random() * def.names.length)];
  const draw = () => {
    openCard(sel, 'pet', `<h2>${def.icon} ${t(`pet.welcome.${pet.kind}`)}</h2><p class="intro">${t('pet.intro', { names: lives.map((l) => l.name).join(' & ') })}</p>
      <div class="levels baby-name"><span>${t('ui.baby.name')}</span><input id="pet-name" maxlength="14" placeholder="${hint}" value="${name}"><button id="pet-dice" title="${t('ui.baby.another')}">🎲</button></div>
      <div class="actions"><button class="go" id="pet-welcome">${t('pet.home')}</button></div>`);
    $('pet-name').oninput = () => (name = cleanName($('pet-name').value));
    $('pet-dice').onclick = () => ((hint = def.names[Math.floor(Math.random() * def.names.length)]), draw());
    $('pet-welcome').onclick = () => {
      pet.name = name || hint;
      closeCard();
      toast(t('pet.homeNow', { name: pet.name }));
      for (const l of lives) l.count('pet');
      milestone(def.icon, 'pet.diary', { name: pet.name, kind: t(`pet.${pet.kind}`) });
      save();
    };
  };
  draw();
}
// The shelter, by phone (the `adoptPet` offer's card): the cat or the dog.
function openPets(l) {
  l.card = null;
  const rows = PET_KINDS.map((k) => `<div class="offer"><div class="big">${PETS[k].icon}</div><div><b>${t(`pet.${k}`)}</b><div>${t(`pet.${k}.does`)}</div></div>
      <button class="go" data-kind="${k}" ${household.money < ADOPT_FEE || pets.length >= MAX_PETS ? 'disabled' : ''}>${t('pet.adopt')} <span class="cost">${t('ui.cost', { cost: ADOPT_FEE })}</span></button></div>`).join('');
  openCard(l, 'pets', `<h2>🐾 ${t('pet.shelter')}</h2><p class="intro">${t('pet.shelter.intro')}</p>${rows}<div class="actions"><button id="card-close">${t('ui.card.notNow')}</button></div>`);
  $('card-close').onclick = closeCard;
  for (const b of $('card').querySelectorAll('[data-kind]')) b.onclick = () => (closeCard(), adoptPet(b.dataset.kind, ADOPT_FEE));
}
// Each frame (`dt` game minutes, the walk's seconds): where it goes. Seen to: at its basket, facing whoever it is. At
// night: in its basket. Otherwise a wander to a free spot now and then, and a sit in between.
const petLook = new THREE.Vector3();
function drawPets(dt) {
  for (const pet of pets) {
    if (!pet.mesh) continue;
    pet.mesh.visible = view === home && !!pet.bed && !pet.bed.gone;
    pet.mixer.update(dt);
    const carer = everyone.find((l) => l.present && l.place === home && l.doing?.item === pet.bed && l.doing.started);
    const night = PET_NIGHT((minutes % 1440) / 60);
    const goal = carer || night ? basketAt(pet) : null;
    if (goal && pet.mesh.position.distanceTo(goal) > 0.15 && (!pet.path.length || pet.path.at(-1).distanceTo(goal) > 0.15)) pet.path = home.grid.path(pet.mesh.position, goal).concat(goal);
    if (!goal && !pet.path.length && (pet.wait -= dt) <= 0) {
      const there = new THREE.Vector3((Math.random() - 0.5) * (home.bounds.w - 1.5), 0, (Math.random() - 0.5) * (home.bounds.d - 1.5));
      if (home.grid.free(there) && there.distanceTo(pet.mesh.position) < 4) pet.path = home.grid.path(pet.mesh.position, there);
      pet.wait = 4 + Math.random() * 8;
    }
    const next = pet.path[0];
    if (next) {
      petPlay(pet, 'walking');
      petLook.copy(next).sub(pet.mesh.position).setY(0);
      const d = petLook.length(), step = PETS[pet.kind].speed * dt;
      if (d <= step) pet.mesh.position.copy(next).setY(0), pet.path.shift();
      else pet.mesh.position.addScaledVector(petLook.divideScalar(d), step);
      if (d > 0.01) pet.mesh.rotation.y = Math.atan2(petLook.x, petLook.z);
    } else {
      petPlay(pet, 'idle');
      if (carer) pet.mesh.rotation.y = Math.atan2(carer.sim.position.x - pet.mesh.position.x, carer.sim.position.z - pet.mesh.position.z);
    }
  }
}
// The pets' needs, and the household glad of a happy pet (at home).
function petsTick(min) {
  for (const pet of pets) {
    pet.tick(min);
    if (pet.happy) for (const l of lives) if (l.present && l.place === home && !l.timed.has('happyPet')) l.addMoodlet('happyPet');
  }
}
for (const s of saved?.pets ?? []) {
  const e = furniture[s.bed];
  if (e?.item && e.id === 'petBed' && PETS[s.kind]) {
    const pet = new Pet(s);
    pet.bed = e.item;
    e.item.pet = pet;
    pets.push(pet);
    drawPet(pet);
  }
}
const babyAt = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
function drawBabies(seconds) {
  const held = new Set(everyone.filter((l) => l.present && l.place === home && l.showing?.offer === 'cuddleBaby').map((l) => l.showing.item));
  for (const b of babies) {
    const m = b.mesh, cot = b.cot;
    // Just born: the cot is still being put in.
    if (!m) continue;
    m.visible = view === home && !held.has(cot) && !b.away;
    if (!m.visible) continue;
    const turn = cot.obj.rotation.y;
    m.position.set(0.03, 0.565, 0).applyAxisAngle(UP, turn).add(cot.obj.position);
    // Breathing, slower asleep; a wriggle while crying.
    b.wiggle = (b.wiggle ?? 0) + seconds;
    const state = b.state;
    m.userData.face(state);
    m.scale.set(1, 1 + Math.sin(b.wiggle * (state === 'asleep' ? 1.6 : 3)) * 0.03, 1);
    m.rotation.set(state === 'crying' ? Math.sin(b.wiggle * 9) * 0.08 : 0, turn, 0);
  }
}
// The welcome card: a girl or a boy, a name (typed, or one suggested), a blanket colour. The game waits.
const cleanName = (s) => s.replace(/[<>&"]/g, '').trim().slice(0, 14);
function babyCard(b) {
  const pick = () => BABY_NAMES[b.girl ? 'girl' : 'boy'][Math.floor(Math.random() * 10)];
  let name = '', hint = pick();
  const draw = () => {
    openCard(sel, 'baby', `<h2>👶 ${t('ui.baby.title')}</h2><p class="intro">${t('ui.baby.intro', { a: b.parents[0], b: b.parents[1] })}</p>
      <div class="levels"><span>${t('ui.baby.is')}</span><button data-girl="1" class="${b.girl ? 'on' : ''}">👧 ${t('ui.baby.girl')}</button><button data-girl="0" class="${b.girl ? '' : 'on'}">👦 ${t('ui.baby.boy')}</button></div>
      <div class="levels baby-name"><span>${t('ui.baby.name')}</span><input id="baby-name" maxlength="14" placeholder="${hint}" value="${name}"><button id="baby-dice" title="${t('ui.baby.another')}">🎲</button></div>
      <div class="levels"><span>${t('ui.baby.blanket')}</span>${BLANKETS.map((c) => `<button data-colour="${c}" class="swatch ${c === b.colour ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div>
      <div class="actions"><button class="go" id="baby-welcome">${t('ui.baby.welcome')}</button></div>`);
    $('baby-name').oninput = () => (name = cleanName($('baby-name').value));
    for (const el of $('card').querySelectorAll('[data-girl]'))
      el.onclick = () => {
        const girl = el.dataset.girl === '1';
        if (girl === b.girl) return;
        // The blanket follows, unless one was chosen.
        if (b.colour === BLANKETS[b.girl ? 0 : 1]) (b.colour = BLANKETS[girl ? 0 : 1]), dressBaby(b);
        b.girl = girl;
        hint = pick();
        draw();
      };
    $('baby-dice').onclick = () => ((name = pick()), draw());
    for (const el of $('card').querySelectorAll('[data-colour]')) el.onclick = () => ((b.colour = el.dataset.colour), dressBaby(b), draw());
    $('baby-welcome').onclick = () => {
      b.name = name || hint;
      closeCard();
      toast(t('ui.baby.home', { name: b.name }));
      save();
    };
  };
  draw();
}

// ---- childcare (round 13, childcare.mjs): a baby is never home alone ----
// The last grown-up out of the door goes only if someone will look after the babies (Life `mayLeave`): the nanny, who
// comes to the flat (a person you can watch at the cot), or the nursery, where the babies go with them. With neither
// possible now (not chosen yet; the nursery shut), a card asks: choose one, or stay at home. Whoever comes home first
// takes over: the nanny is paid and goes, the babies come back from the nursery.
let caring = null; // { kind: 'nanny' | 'nursery', since (game minutes) }
let careAsk = null; // { life, entry }: someone at the door, waiting for the card
let nurseryPaidDay = -1;
let nanny = null; // her Life, made the first time she is needed
const babyNames = () => babies.filter((b) => b.name).map((b) => b.name).join(' & ') || t('ui.care.theBaby');
const someoneHome = (but = null) => lives.some((l) => l !== but && l.present && l.place === home);
// Paid from the purse; short of coins, what there is (no debt in this game).
function payCare(cost) {
  const paid = Math.min(cost, household.money);
  household.money -= paid;
  return paid;
}
function mayLeave(l, d) {
  if (!babies.length || someoneHome(l)) return true;
  const kind = careAsk ? null : careNow(household.childcare, minutes);
  const entry = { offer: d.offer, item: d.item, by: d.by, endsAt: d.endsAt, why: d.why };
  // The nanny not here yet (her first time: she is loaded): they wait at the door for her.
  if (kind === 'nanny' && !nanny) {
    nannyLife().then(() => goAgain(l, entry));
    return false;
  }
  if (kind) return beginCare(kind, l), true;
  if (!careAsk) careAsk = { life: l, entry };
  renderCards();
  return false;
}
// Out of the door again, now that someone can look after the babies: before anything they chose meanwhile.
function goAgain(l, entry) {
  l.queue.unshift(entry);
  if (l.doing && l.doing.by === 'self') l.stop('you');
}
function beginCare(kind, leaver = null) {
  caring = { kind, since: minutes };
  if (kind === 'nursery') {
    for (const b of babies) b.goAway('nursery');
    const day = Math.floor(minutes / 1440);
    const paid = nurseryPaidDay === day ? null : payCare(CHILDCARE.nursery.perDay);
    nurseryPaidDay = day;
    toast(t('ui.care.nursery.drop', { name: leaver?.name ?? '', baby: babyNames() }) + (paid != null ? ` (−${paid} 🪙)` : ''));
    return;
  }
  if (!nanny) return void nannyLife().then(() => caring?.kind === 'nanny' && nannyArrives());
  nannyArrives();
}
function nannyArrives() {
  const n = nanny;
  // Still here from last time (gone out again before she left): she stays.
  if (n.present && n.place === home) {
    n.queue = [];
    if (n.doing?.offer.travel) (n.doing = null), n.sim.finish();
  } else {
    n.present = true;
    n.arrive(home);
  }
  toast(t('ui.care.nanny.comes', { nanny: n.name, baby: babyNames() }));
}
function endCare() {
  const c = caring;
  caring = null;
  const back = lives.find((l) => l.present && l.place === home);
  if (c.kind === 'nursery') {
    for (const b of babies) b.home(NURSERY_CARED);
    return toast(t('ui.care.nursery.back', { name: back?.name ?? '', baby: babyNames() }));
  }
  const paid = payCare(careCost('nanny', c.since, minutes));
  if (nanny) {
    if (nanny.doing) nanny.stop('home');
    nanny.queue = [{ offer: { id: 'goHome', act: 'travel', travel: 'away', minutes: 1, gives: {}, icon: '🏠', free: false }, by: 'self' }];
  }
  toast(t('ui.care.nanny.paid', { nanny: nanny?.name ?? '', coins: paid }));
}
// Every step: whoever is home takes over; and, should the babies ever be on their own some other way, the nanny comes.
// Someone home again while the card waits (back from the park for the loo): no question any more, out they go.
function minding() {
  if (!babies.length) return;
  if (careAsk && someoneHome(careAsk.life)) {
    const { life: l, entry } = careAsk;
    careAsk = null;
    if (card?.kind === 'care') closeCard();
    goAgain(l, entry);
  }
  const anyone = someoneHome();
  if (anyone && caring) endCare();
  else if (!anyone && !caring && !careAsk) beginCare(careNow(household.childcare, minutes) ?? 'nanny');
}
// The nanny: someone who is neither in the household nor at the office, a woman if one is free. Not clickable.
let nannyMade = null;
function nannyLife() {
  return (nannyMade ??= (async () => {
    const taken = new Set([...lives, ...colleagues, ...neighbours].map((l) => l.who));
    const free = [...Array(12).keys()].filter((n) => !taken.has(n));
    const women = free.filter((n) => /^Female/.test(folk.cast[n]?.name ?? ''));
    const pool = women.length ? women : free.length ? free : [0];
    const who = pool[Math.floor(Math.random() * pool.length)];
    const n = await makeSim(who, home, 20, { household: { money: 0 } });
    Object.assign(n, { homePlace: null, present: false, carer: true, freeWill: true });
    for (const id of Object.keys(n.needs)) n.needs[id] = 90;
    n.proxy.userData.life = null;
    n.sim.group.visible = false;
    makeBubble(n);
    return (nanny = n);
  })());
}
// The card: who looks after the babies while they are out. The game waits. Choosing one is remembered.
function careCard() {
  const { life: l, entry } = careAsk;
  const open = nurseryOpen(minutes), work = entry.by === 'job';
  const row = (kind, price, note, ok = true) => `<div class="offer"><div class="big">${CHILDCARE[kind].icon}</div><div><b>${t(`ui.care.${kind}`)}</b><div>${price} · ${note}</div></div>
    <button class="go" data-care="${kind}" ${ok ? '' : 'disabled'}>${t('ui.care.choose')}</button></div>`;
  openCard(l, 'care', `<h2>👶 ${t('ui.care.title', { baby: babyNames() })}</h2><p class="intro">${t('ui.care.intro', { name: l.name, baby: babyNames() })}</p>
    ${row('nanny', t('ui.care.nanny.price', { coins: CHILDCARE.nanny.perHour }), t('ui.care.nanny.note'))}
    ${row('nursery', t('ui.care.nursery.price', { coins: CHILDCARE.nursery.perDay }), open ? t('ui.care.nursery.note', { from: hhmm(CHILDCARE.nursery.opens), to: hhmm(CHILDCARE.nursery.closes) }) : t('ui.care.nursery.shut', { from: hhmm(CHILDCARE.nursery.opens) }), open)}
    <div class="actions"><button id="care-stay">🏠 ${t(work ? 'ui.care.stay.work' : 'ui.care.stay', { name: l.name })}</button></div>`);
  for (const b of $('card').querySelectorAll('[data-care]'))
    b.onclick = () => {
      household.childcare = b.dataset.care;
      if (b.dataset.care === 'nanny') nannyLife();
      careAsk = null;
      closeCard();
      goAgain(l, entry);
      save();
    };
  $('care-stay').onclick = () => {
    careAsk = null;
    closeCard();
    toast(t(work ? 'ui.care.stayed.work' : 'ui.care.stayed', { name: l.name, baby: babyNames() }));
  };
}
// A bed each: free will leaves the other's alone (you can still send anyone to either). A saved game: the beds they had.
const beds = home.items.filter((i) => i.name === 'Bed_Single');
// Round 15: a double bed counts once here (its other side is `side`, saved as `side: 1` on whoever sleeps there), so a
// save from before keeps its numbers.
const sleepers = () => home.items.filter((i) => i.use?.act === 'sleep' && !i.side);
if (saved) saved.lives.forEach((s, i) => { let b = sleepers()[s.bed]; if (b && s.side && b.twin) b = b.twin; if (b) (b.owner = lives[i]), (lives[i].home = b); });
else if (lives.length > 1) lives.forEach((l, i) => beds[i] && ((beds[i].owner = l), (l.home = beds[i])));
const [life] = lives;
const sim = life.sim;
// The Sim you look after: the panels show them, your clicks are for them. The others get on with their lives.
let sel = life;
$('freewill').checked = life.freeWill;
$('freewill').onchange = () => lives.forEach((l) => (l.freeWill = $('freewill').checked));

// The desks at the office: one each, handed out as people start there (the first six).
const desks = office.items.filter((i) => i.use?.offers === 'desk');
const giveDesk = (l) => {
  if (desks.some((d) => d.owner === l)) return;
  const free = desks.find((d) => !d.owner);
  if (free) free.owner = l;
};

// Round 16: someone else's traits: as saved, or rolled (in a seeded town by its dice, so they are the same people
// every time the town is played).
const npcTraits = (who) => {
  const was = cleanTraits(saved?.traits?.[who]);
  return was.length ? was : rollTraits(TOWN.seed ? townDice(TOWN.seed, 100 + who) : Math.random);
};
const npcLikes = (who) => cleanLikes(saved?.likes?.[who]) ?? rollLikes(TOWN.seed ? townDice(TOWN.seed, 200 + who) : Math.random);
// The colleagues (round 9): four other people who work at the office, there on work days from 08:30 to 15:00, each
// with free will. Loaded once the flat is up (they are not needed before the first work day). Math.random picks them,
// never the seeded dice. ?colleagues=2,3 pins them; ?colleagues=none: nobody.
const colleagues = [];
async function loadColleagues() {
  const taken = new Set(lives.map((l) => l.who));
  const pinned = params.get('colleagues');
  let who;
  // A saved game: the same colleagues, at the same levels.
  if (saved) who = (saved.colleagues ?? []).map((c) => c.who).filter((n) => !taken.has(n));
  else if (pinned === 'none') who = [];
  else if (pinned) who = pinned.split(',').map(Number).filter((n) => !taken.has(n));
  else {
    const pool = [...Array(12).keys()].filter((n) => !taken.has(n));
    // Round 16: a seeded town picks them (the same people for the same town and household); the classic one at random.
    const dice = TOWN.seed ? townDice(TOWN.seed, 1) : Math.random;
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(dice() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    who = pool.slice(0, 4);
  }
  for (const [k, n] of who.entries()) {
    const c = await makeSim(n, office, 10 + k, { household: { money: 0 } });
    c.homePlace = null;
    c.present = false;
    // They come in a few minutes apart, not in a crowd at the door.
    c.lateBy = 4 + k * 9;
    c.sim.group.visible = false;
    c.freeWill = true;
    c.traits = npcTraits(n);
    c.likes = npcLikes(n);
    // They have worked there a while: some higher up than others.
    c.job = { career: 'office', level: Math.floor((TOWN.seed ? townDice(TOWN.seed, 10 + k) : Math.random)() * 4), performance: 0, lastDay: -1 };
    const was = saved?.colleagues?.find((x) => x.who === n);
    if (was?.job) c.job = { ...was.job, lastDay: -1 };
    giveDesk(c);
    // Round 14: where they live (town.mjs): you can go round, outside work.
    c.house = homeOf(n, COLLEAGUE_HOUSES[k] ?? 'h3');
    colleagues.push(c);
    makeBubble(c);
  }
}

// Someone moves in (social.mjs "Ask to move in"): into "Who lives here", with a bed. The flat has two; a third
// person gets a camp bed in the free floor by the bookshelf (round 9; a real bed is something to buy later).
async function moveIn(other) {
  if (lives.includes(other)) return;
  lives.push(other);
  // Round 14: a neighbour can move in too (not a colleague: `indexOf` -1 took the last colleague away).
  for (const list of [colleagues, neighbours]) if (list.includes(other)) list.splice(list.indexOf(other), 1);
  other.house = null;
  guests.splice(0, guests.length, ...guests.filter((g) => g.life !== other));
  other.freeWill = $('freewill').checked;
  // Met at their own house (round 14): they come home with you.
  if (other.present && other.place !== home && !other.shift) other.queue.push({ offer: GO_HOME, by: 'self' });
  let bed = home.items.find((i) => i.use?.act === 'sleep' && !i.owner && !i.side);
  // By the bookshelf (round 9), or, with things bought since, wherever it fits.
  if (!bed) bed = await placeExtra(await spotFor(CAMP_BED, { id: 'campBed', x: 0.2, z: -1.2, turn: Math.PI / 2 }));
  bed.owner = other;
  other.home = bed;
  for (const l of lives) if (!l.home) {
    const b = home.items.find((i) => i.use?.act === 'sleep' && !i.owner && !i.side);
    if (b) (b.owner = l), (l.home = b);
  }
  save();
}
// Where `s` (a shop item) fits in the flat: `want` if it does there, else the first free place, scanning the floor.
async function spotFor(s, want) {
  const at = async (x, z, turn) => (home.fits(await measure(srcOf(s), x, z, turn, s.fit, s.use)).ok ? { id: want.id, x, z, turn } : null);
  const first = await at(want.x, want.z, want.turn);
  if (first) return first;
  for (let z = -2.4; z <= 2.4; z += 0.5)
    for (let x = -2.9; x <= 2.9; x += 0.5) for (const turn of [0, Math.PI / 2]) {
      const ok = await at(x, z, turn);
      if (ok) return ok;
    }
  return want;
}

// ---- the town (round 14, town.mjs) ----
// The design brief, 11-11: "multiple houses available in the town with real NPCs, either colleagues or not … parties
// at neighbour's houses … everyone they work with is accessible as a 'friend' to go hang out with … invited or not?
// could be funny … free houses the player can visit with the intention to buy". A house is built the first time someone
// goes there. The people who live in it are there only while someone from the household is (as the colleagues are at
// the office only on work days): they come into view when you arrive, and go when you leave.
const GO_HOME = { id: 'goHome', act: 'travel', travel: 'home', minutes: 1, gives: {}, icon: '🏠', free: false };
const GO_AWAY = { id: 'goHome', act: 'travel', travel: 'away', minutes: 1, gives: {}, icon: '🏠', free: false };
const goTo = (id) => ({ id: 'goVisit', act: 'travel', travel: id, minutes: 1, gives: {}, icon: houseById(id)?.kind === 'sale' ? '🪧' : '🏡', free: false });
const neighbours = [];
const guests = []; // { life, comesAt, until, arrived }: friends invited round to your home
let homeParty = null; // { until, decor }
const npcs = () => [...colleagues, ...neighbours];
const residentsOf = (id) => npcs().filter((l) => l.house === id);
const owned = (id) => homeState.id === id;
// Their names, for the house's name: "Dora's house", "Dora and Kofi's house".
function houseTitle(id) {
  const h = houseById(id);
  if (owned(id)) return t('place.home');
  if (h.kind === 'sale') return houseName(houseById(id));
  const names = residentsOf(id).map((l) => l.name);
  return names.length ? t(names.length > 1 ? 'house.of2' : 'house.of', { a: names[0], b: names[1] }) : t('house.empty', { no: h.no });
}
// The two neighbours who don't work with you (no. 9): anyone not in the household, not a colleague, and not the nanny
// (a woman is left free for her when one can be). Loaded the first time they are needed; kept in the save.
let neighboursMade = null;
function loadNeighbours() {
  return (neighboursMade ??= (async () => {
    await colleaguesLoaded;
    const taken = new Set([...lives, ...colleagues, ...(nanny ? [nanny] : [])].map((l) => l.who));
    let who = (saved?.town?.neighbours ?? []).filter((n) => !taken.has(n));
    if (!saved?.town) {
      const free = [...Array(12).keys()].filter((n) => !taken.has(n));
      const dice = TOWN.seed ? townDice(TOWN.seed, 2) : Math.random;
      for (let i = free.length - 1; i > 0; i--) {
        const j = Math.floor(dice() * (i + 1));
        [free[i], free[j]] = [free[j], free[i]];
      }
      const woman = (n) => /^Female/.test(folk.cast[n]?.name ?? '');
      // Keep one woman back for the nanny when there is one to keep.
      const keep = free.filter(woman).length === 1 ? free.find(woman) : null;
      who = free.filter((n) => n !== keep).slice(0, NEIGHBOURS);
    }
    for (const [k, n] of who.entries()) {
      const l = await makeSim(n, park, 30 + k, { household: { money: 0 } });
      Object.assign(l, { homePlace: null, present: false, house: homeOf(n, 'h4'), freeWill: true, traits: npcTraits(n), likes: npcLikes(n) });
      // Round 16, phase 4: someone who moved to town (townlife.mjs) has a dream, and the day they came.
      Object.assign(l, { dream: saved?.town?.dreams?.[n] ?? null, newcomer: townLife.arrived[n] ?? null });
      l.sim.group.visible = false;
      makeBubble(l);
      neighbours.push(l);
    }
    return neighbours;
  })());
}
// A house of the town, built the first time it is needed (empty and with a sign when it is for sale).
const building = new Map();
function housePlace(id) {
  if (owned(id)) return Promise.resolve(home);
  if (places[id]) return Promise.resolve(places[id]);
  if (!building.has(id))
    building.set(id, (async () => {
      const h = houseById(id), { w, d } = SIZES[h.size], living = residentsOf(id);
      const furnished = h.kind === 'lived' ? houseFurniture(w, d, Math.max(1, Math.min(2, living.length)), h.no) : [];
      const p = await buildPlace('lifeHouse', { w, d, look: h.look, forSale: h.kind === 'sale', furniture: furnished, street: streetName() });
      p.house = id;
      shine(p);
      scene.add(p.group);
      p.group.visible = view === p;
      // A bed each for whoever lives there.
      const sleep = p.items.filter((i) => i.use?.act === 'sleep' && !i.side);
      living.forEach((l, i) => sleep[i] && ((sleep[i].owner = l), (l.home = sleep[i])));
      places[id] = p;
      building.delete(id);
      return p;
    })());
  return building.get(id);
}
const titleOf = (p) => (p === home ? t('place.home') : p.house ? houseTitle(p.house) : p === street ? streetName() : t(`place.${nameOf(p)}`));
// ---- Sunny Lane, the street (round 15) ----
// The brief's round-14 list: "The street to walk down instead of the town card (a fifth place: the houses' fronts, the
// bus)". Home to a house, a house to home or to another house, and home to the park and back all go along it (Life
// `via`): out of one front door, down the pavement, in at the other (the park's is the bus stop). The office stays the
// bus's, straight there and back, as it was. A click on a house's door, its front or its name board says who lives there
// and what you can do: knock, go to the party (invited or not), look round, buy, go in.
const frontDoor = (id) => street.items.find((i) => i.use?.front === id) ?? null;
const busStop = street.items.find((i) => i.use?.offers === 'streetBus');
const homeFront = () => homeState.id; // 'flat', or the id of the house they bought
const inTown = (p) => !!p && (p === home || !!p.house);
street.doorTo = (to) => (to === 'home' ? frontDoor(homeFront()) : houseById(to) ? frontDoor(to) : busStop);
street.doorFor = (from) => (from === home ? frontDoor(homeFront()) : from?.house ? frontDoor(from.house) : busStop);
function via(from, to) {
  const there = places[to];
  if (from === street || !there) return null;
  return (inTown(from) && (inTown(there) || there === park)) || (from === park && inTown(there)) ? 'street' : null;
}
// The name boards over the houses (who lives there, a party, for sale, yours) and the balloons at a party's gate.
function streetTick() {
  if (view !== street) return;
  for (const f of street.street.fronts) {
    const label = street.street.labels.get(f.id), h = houseById(f.id), mine = homeFront() === f.id;
    const party = mine ? !!homeParty : !!h && partyAt(f.id);
    street.street.balloons.get(f.id).visible = party;
    const sign = street.street.signs.get(f.id);
    if (sign) sign.visible = !mine && h?.kind === 'sale';
    if (mine) label.set(`${party ? '🎉' : '🏠'} ${f.no} · ${t('place.home')}`, '#2f6b4f');
    else if (!h) label.set(`🏢 ${f.no} · ${t('street.flats', { street: streetName() })}`, '#56636e');
    else if (h.kind === 'sale') label.set(`🪧 ${f.no} · ${houseName(h)} · ${t('ui.cost', { cost: h.price })}`, '#b5473c');
    else label.set(`${party ? '🎉' : '🏡'} ${f.no} · ${houseTitle(f.id)}`, party ? '#7a4ab0' : '#3a6a9a');
  }
  // Round 16, phase 4.2: the notice board's, with how much is new.
  street.street.board?.set(`📰 ${t('news.board')}${townLife.unread ? ` · ${t('news.unread', { n: townLife.unread })}` : ''}`, townLife.unread ? '#b5473c' : '#56636e');
}
// What a house's door offers, for the one you look after (who may be at home, or anywhere: they walk round).
function openDoorMenu(item, x, y) {
  const id = item.use.front, f = street.street.fronts.find((g) => g.id === id), h = houseById(id), who = sel;
  const rows = [];
  const btn = (key, label, on = true, note = '') => `<button data-${key} ${on ? '' : 'disabled'}>${label}${note ? `<span class="gain">${note}</span>` : ''}</button>`;
  let head;
  if (homeFront() === id) {
    head = `🏠 ${t('place.home')}<small>${f.no} ${streetName()}</small>`;
    rows.push(btn('home', `🏠 ${t('street.goIn')}`, who.place !== home));
  } else if (!h) {
    head = `🏢 ${t('street.flats', { street: streetName() })}<small>${f.no} ${streetName()}</small>`;
    rows.push(btn('none', t('street.movedOut'), false));
  } else if (h.kind === 'sale') {
    const cost = buyCost(id);
    head = `🪧 ${houseName(houseById(id))}<small>${f.no} ${streetName()} · ${t('town.forSale')} · ${t('town.size', SIZES[h.size])}</small>`;
    rows.push(btn('visit', `👀 ${t('town.look')}`, who.place !== places[id]), btn('buy', `🏡 ${t('ui.sale.buy')}`, household.money >= cost, t('ui.cost', { cost: Math.max(0, cost) })));
  } else {
    const v = visitState(id), party = partyAt(id), living = residentsOf(id);
    const tots = babiesAt(id).map((b) => b.name);
    head = `${party ? '🎉' : '🏡'} ${houseTitle(id)}<small>${f.no} ${streetName()}${living.length ? ` · ${living.map((l) => l.name).join(', ')}` : ''}${tots.length ? ` 👶 ${tots.join(', ')}` : ''}</small>`;
    const label = party ? (invited(id) ? `🎉 ${t('street.party')}` : `🙊 ${t('street.crash')}`) : `🚪 ${t('street.knock')}`;
    const here = who.place === places[id];
    rows.push(btn('visit', label, v.ok && !here, here ? '' : v.ok ? '' : t(`town.why.${v.why}`)));
  }
  rows.push(btn('town', `🗺️ ${t('ui.town.map')}`));
  $('menu').innerHTML = `<div class="with">${head}</div>${rows.join('')}`;
  const on = (key, fn) => {
    const b = $('menu').querySelector(`[data-${key}]`);
    if (b) b.onclick = () => (($('menu').hidden = true), fn());
  };
  on('home', () => who.command(GO_HOME));
  on('visit', () => goVisit(id));
  on('buy', () => openBuy(id));
  on('town', () => openTown());
  showMenu(x, y, rows.length + 1);
}
// At home to visit now: awake, not at work, not round somewhere else.
// Round 16, phase 5.3: by the career's own days (the café works Wednesday to Sunday); the office's as it was.
const workDayNow = (l) => l.job && careerOf(l.job).days.includes(weekday(minutes)) && (minutes % 1440) >= Math.min(8 * 60, careerOf(l.job).leave) && (minutes % 1440) < careerOf(l.job).ends;
function homeNow(l) {
  if (!l.house || l.shift || !awake(minutes) || workDayNow(l)) return false;
  return !(l.present && l.place !== places[l.house]);
}
// Can someone go round now? { ok, why } — the town card says why not.
function visitState(id) {
  const h = houseById(id);
  if (owned(id)) return { ok: false, why: 'yours' };
  if (h.kind === 'sale') return { ok: true, why: 'sale' };
  const living = residentsOf(id);
  if (!living.length) return { ok: false, why: 'nobody' };
  if (!awake(minutes)) return { ok: false, why: 'asleep' };
  if (partyAt(id)) return { ok: true, why: 'party' };
  if (living.some(homeNow)) return { ok: true, why: 'home' };
  // Round somewhere else (at a party, or at yours), or at work.
  return { ok: false, why: living.some((l) => l.shift || workDayNow(l)) ? 'atWork' : 'out' };
}
// The parties: an evening at one of the lived-in houses (town.mjs PARTY), and who is invited.
const livedIn = () => HOUSES.filter((h) => h.kind === 'lived' && residentsOf(h.id).length).map((h) => h.id);
// Round 16, phase 3: a birthday party you said yes to (events.mjs) is tonight's party.
const askedParty = () => (deck.party?.day === Math.floor(minutes / 1440) && residentsOf(deck.party.id).length ? deck.party.id : null);
const partyToday = () => (colleaguesIn ? askedParty() ?? partyHouse(minutes, livedIn()) : null);
const partyAt = (id) => partyNow(minutes) && partyToday() === id;
const invited = (id) => askedParty() === id || residentsOf(id).some((r) => lives.some((l) => bondOf(l, r).friendship >= INVITED));
// Who else comes: the household's best friends among everyone else who is free, a few of them.
function partyGuests(id) {
  const best = (l) => Math.max(...lives.map((h) => bondOf(h, l).friendship));
  return npcs().filter((l) => l.house !== id && !l.shift && !guests.some((g) => g.life === l)).sort((a, b) => best(b) - best(a) || a.who - b.who).slice(0, PARTY.guests);
}
// Someone in view (they live there, or came to the party), or not.
// At a party (`party`), they come fed, rested and in the mood for fun and company: they dance, chat and joke, not study
// or cook dinner in someone else's kitchen.
function appear(l, p, inside = true, party = false) {
  if (l.doing) l.stop('away');
  l.queue = [];
  l.present = true;
  for (const id of Object.keys(l.needs)) l.needs[id] = Math.max(l.needs[id], 60 + Math.random() * 30);
  if (party) Object.assign(l.needs, { energy: Math.max(l.needs.energy, 85), hunger: Math.max(l.needs.hunger, 75), fun: 25 + Math.random() * 15, social: 25 + Math.random() * 15 });
  l.arrive(p);
  if (inside) l.sim.position.copy(p.freeSpot(npcs().indexOf(l) + 1));
}
function vanish(l) {
  if (l.doing) l.stop('away');
  l.queue = [];
  l.travel('away');
}
function sendHome(l, key) {
  if (l.doing && l.doing.by !== 'job') l.stop('home');
  l.queue = l.queue.filter((e) => e.by === 'job');
  l.queue.unshift({ offer: GO_HOME, by: 'self' });
  if (key) toast(t(key, { name: l.name }));
}
// Arriving somewhere (Life `onArrive`): a welcome at a friend's, a party's welcome (or a gatecrasher's), a house to buy.
function arrived(l, p) {
  // Round 16: where they have been (wants, dreams).
  if (lives.includes(l)) l.count(`go.${p === park ? 'park' : p === office ? 'office' : p === street ? 'street' : p === home ? 'home' : p.work ?? 'house'}`);
  if (!lives.includes(l) || !p.house || p === home) return;
  l.visitOver = false;
  const id = p.house, h = houseById(id);
  if (h.kind === 'sale') return toast(t('ui.sale.look', { name: l.name, house: houseTitle(id), price: h.price }));
  const host = residentsOf(id).find(homeNow) ?? residentsOf(id)[0];
  if (!host) return;
  // Round 16, phase 5.2: come to do the odd job.
  if (l.oddJob === id && household.side?.oddJob?.house === id && !household.side.oddJob.done) l.queue.unshift({ offer: ODD_JOB, by: 'you' });
  l.oddJob = null;
  // Round 16, phase 4: saying hello to someone new in the street (a wish the news gives).
  if (residentsOf(id).some((r) => r.newcomer != null && Math.floor(minutes / 1440) + 1 - r.newcomer <= 7)) l.count('welcome');
  if (partyAt(id)) {
    const asked = invited(id);
    bondOf(l, host).friendship += asked ? 3 : -3;
    l.addMoodlet(asked ? 'party' : 'gatecrasher');
    l.count('party');
    toast(t(asked ? 'ui.party.welcome' : 'ui.party.crash', { name: l.name, host: host.name }));
  } else toast(t('ui.visit.welcome', { name: l.name, host: host.name }));
}
// Every step: who is where in the town. A house with someone from the household in it has its people in view (and,
// during its party, the guests); the others are out of sight. Late at night everyone is sent home.
let partyNoted = -1;
function townTick() {
  if (!colleaguesIn) return;
  const day = Math.floor(minutes / 1440), host = partyToday();
  // The day's invitation (once a day, from 09:00): who is having a party, and whether you're asked.
  if (host && partyNoted !== day && (minutes % 1440) >= 9 * 60 && (minutes % 1440) < PARTY.to) {
    partyNoted = day;
    toast(t(invited(host) ? 'ui.party.invite' : 'ui.party.notInvited', { house: houseTitle(host), from: hhmm(PARTY.from) }));
  }
  for (const h of HOUSES) {
    const p = places[h.id];
    if (!p || p === home) continue;
    const party = partyAt(h.id);
    if (p.decor) p.decor.visible = party;
    else if (party) (p.decor = partyDecor(p.bounds.w, p.bounds.d)), p.group.add(p.decor);
    if (h.kind !== 'lived') continue;
    const visitors = lives.filter((l) => l.present && l.place === p);
    const want = new Set();
    if (visitors.length) {
      for (const r of residentsOf(h.id)) if (homeNow(r)) want.add(r);
      // Round 16, phase 4.4: no more drawn in one place than DRAWN.most (townlife.mjs); the other guests stay data.
      if (party) for (const g of partyGuests(h.id).slice(0, Math.max(0, DRAWN.most - visitors.length - want.size))) want.add(g);
    }
    for (const n of npcs()) {
      const here = n.present && n.place === p;
      if (here && !want.has(n) && !n.shift) vanish(n);
      else if (!here && want.has(n) && !n.present) appear(n, p, n.house === h.id, party);
    }
    // Bedtime: the visitors go home (once each: you can send them back). The party's last evening says so.
    if (party) p.partyDay = Math.floor(minutes / 1440);
    if (!awake(minutes)) for (const l of visitors) if (!l.visitOver) (l.visitOver = true), sendHome(l, p.partyDay === Math.floor((minutes - 60) / 1440) ? 'ui.party.over' : 'ui.visit.late');
    // A house the town changed while someone was in it (townlife.mjs): built again once they have gone.
    if (p.stale && !inUse(p)) dropHouse(h.id);
  }
  guestsTick();
  townLifeTick();
  reachTick();
  calendarTick();
}
// ---- the town lives without you (round 16, phase 4; townlife.mjs) ----
// Once a game day, at 03:00 (TOWNLIFE.at), the town's day is played out as data: nobody is drawn and no animation
// runs (the people out of sight are Lives with no body updated, as the colleagues are off work). The first day starts
// the bonds between the town's people; each day after that, `dayOfTown`. What changed is then made true here: a
// house's inside is built again the next time someone goes (with the beds of whoever lives there now), the street's
// boards follow the houses (streetTick), and a newcomer is made (a body, hidden until met, as the neighbours are).
const arriving = new Map(); // who → { house, dream, traits, likes }: a newcomer whose body is still being made
const inUse = (p) => view === p || everyone.some((l) => l.present && l.place === p);
function dropHouse(id) {
  const p = places[id];
  if (!p || p === home) return;
  if (inUse(p)) return void (p.stale = true);
  scene.remove(p.group);
  for (const l of everyone) if (l.home && p.items.includes(l.home)) l.home = null;
  delete places[id];
}
// Who could move to town: the twelve people, less the household, the town, the nanny, and whoever is on the way (one
// woman kept back for a nanny not yet needed, as loadNeighbours does).
function townPool() {
  const taken = new Set([...lives, ...npcs(), ...(nanny ? [nanny] : [])].map((l) => l.who));
  for (const n of arriving.keys()) taken.add(n);
  const free = [...Array(12).keys()].filter((n) => !taken.has(n));
  const woman = (n) => /^Female/.test(folk.cast[n]?.name ?? '');
  return { pool: free, keepWoman: !nanny && free.filter(woman).length === 1 ? free.find(woman) : null };
}
function townLifeTick() {
  if (!townLifeOn || !neighboursIn || moving) return;
  const today = Math.floor(minutes / 1440) + 1, target = (minutes % 1440) >= TOWNLIFE.at ? today : today - 1;
  // A new game, or a save from before phase 4: the town starts living from today (no days played out behind you).
  if (townLife.day == null) townLife.day = target;
  while (townLife.day < target) playTownDay(++townLife.day);
}
function playTownDay(day) {
  if (!townLife.started) {
    startTown(npcs(), townDice(TOWN.seed, 6999));
    townLife.started = true;
  }
  const { pool, keepWoman } = townPool();
  // Never the household's home, a house one of them is in, or one a newcomer is moving into.
  const mine = (id) => owned(id) || (places[id] && inUse(places[id])) || [...arriving.values()].some((a) => a.house === id);
  const out = dayOfTown({ day, people: npcs(), household: lives, houses: HOUSES, mine, still: (l) => l.present, pool, keepWoman, babies: townLife.babies, lastNew: townLife.lastNew, nameOf: (n) => NAMES[n] }, townDice(TOWN.seed, 7000 + day));
  for (const l of out.moved) l.home = null;
  for (const id of out.houses) dropHouse(id);
  if (out.newcomer) {
    townLife.lastNew = day;
    out.news.find((n) => n.key === 'news.welcome').vars.dream = out.newcomer.dream;
    welcome(out.newcomer, day);
  }
  for (const n of out.news) tellNews(n, day);
  save();
  return out;
}
// Someone new in the street: one of the twelve, with their own traits, likes and dream; a body, hidden until met.
async function welcome({ who, house, traits, likes, dream }, day) {
  arriving.set(who, { house, dream, traits, likes });
  townLife.arrived[who] = day;
  const l = await makeSim(who, park, 40 + who, { household: { money: 0 } });
  Object.assign(l, { homePlace: null, present: false, house, freeWill: true, traits, likes, dream, newcomer: day });
  l.sim.group.visible = false;
  makeBubble(l);
  neighbours.push(l);
  arriving.delete(who);
  save();
}
// The notice board's news (4.2). Someone the household is Friends with: told, and glad for them (a moodlet). Someone
// new: everyone hears, and a wish to go round and say hello (not for the shy).
const GLAD = ['news.birthday', 'news.sweethearts', 'news.inLove', 'news.married', 'news.baby', 'news.bestFriends', 'news.newHome', 'news.bigger'];
const newsText = (n) => t(n.key, { ...n.vars, dream: n.vars.dream ? t(`goal.${n.vars.dream}`) : '', event: n.vars.event ? t(n.vars.event) : '', where: n.vars.where ? t(n.vars.where) : '' });
function tellNews(n, day) {
  townLife.news.unshift({ day, icon: n.icon, key: n.key, vars: { ...n.vars }, who: [...n.who] });
  townLife.news.length = Math.min(townLife.news.length, TOWNLIFE.news);
  townLife.unread = Math.min(TOWNLIFE.news, townLife.unread + 1);
  const known = npcs().filter((o) => n.who.includes(o.name));
  const knows = lives.filter((h) => known.some((o) => (peekBond(h, o)?.friendship ?? 0) >= INVITED));
  if (GLAD.includes(n.key)) for (const h of knows) h.addMoodlet('gladForThem');
  if (knows.length || n.key === 'news.welcome' || n.key === 'news.townEvent') toast(`📰 ${newsText(townLife.news[0])}`);
  if (n.key === 'news.welcome' && aimsOn) for (const h of lives) if (!h.traits?.includes('shy')) giveWant(h, 'welcome');
}
// A wish given (not rolled): in the place of the oldest, for two days.
function giveWant(l, id) {
  l.wants = (l.wants ?? []).filter((w) => w.id !== id);
  if (l.wants.length >= WANT_SLOTS) l.wants.shift();
  l.wants.push({ id, until: minutes + 2 * WANT_LASTS });
}
// ---- the town comes to you (round 16, phase 4.3; townlife.mjs REACH) ----
// Someone there with the Sim you play starts something with them now and then, by their traits and the bond. Gentle:
// a look every REACH.every game minutes, a gap between two, a few a day; never with a card open (a question at a
// work station), never at work's own business, asleep, busy with something you asked or on the way somewhere.
let reachAt = 0;
const reached = new Map(); // a household Sim → { day, n, last }
function reachTick() {
  if (!townLifeOn || card || minutes < reachAt) return;
  reachAt = minutes + REACH.every;
  const day = Math.floor(minutes / 1440);
  for (const you of lives) {
    if (!you.present || you.card || you.doing?.by === 'job' || you.doing?.by === 'you' || you.doing?.other) continue;
    const st = reached.get(you)?.day === day ? reached.get(you) : { day, n: 0, last: -1e9 };
    reached.set(you, st);
    if (st.n >= REACH.perDay || minutes - st.last < REACH.gap) continue;
    for (const them of npcs()) {
      if (!them.present || them.place !== you.place || them.critical || them.card || them.doing?.other || (them.doing && them.doing.by !== 'self')) continue;
      if (you.busyFor(them) || Math.random() >= REACH.chance * sociable(them)) continue;
      // Married to someone else (than the other one): no flirting, from them or with them.
      const married = (p) => {
        const s = spouseOf(p, everyone);
        return !!s && s !== (p === them ? you : them);
      };
      const ix = pickReach(them, you, bondOf(them, you), { married, lockOf, interactionById }, Math.random);
      if (!ix) continue;
      if (them.doing) them.stop('other');
      them.queue = them.queue.filter((e) => e.by === 'job');
      them.start({ offer: ix, other: you, by: 'self', why: 'social' });
      them.think(ix.hearts ?? ix.icon, `action.${ix.id}`);
      toast(t(`ui.reach.${ix.id}`, { a: them.name, b: you.name }));
      st.n++;
      st.last = minutes;
      window.__life.lastReach = { from: them.name, to: you.name, ix: ix.id, at: minutes };
      break;
    }
  }
}
// The babies of the town who live in a house (with their parents).
const babiesAt = (id) => townLife.babies.filter((b) => residentsOf(id).some((r) => b.parents.includes(r.name)));
// Friends round to yours (the phone, "Who lives here"): at the door a little later, a while with you, then home.
// A party at home: everyone the household is Friends with.
function inviteOver(other, quiet = false, stay = GUEST.stays) {
  if (lives.includes(other) || guests.some((g) => g.life === other)) return false;
  if (!awake(minutes) || other.shift || workDayNow(other)) {
    if (!quiet) toast(t('ui.guest.cant', { name: other.name }));
    return false;
  }
  guests.push({ life: other, comesAt: minutes + GUEST.comes + (quiet ? Math.random() * 25 : 0), until: minutes + GUEST.comes + stay, arrived: false });
  if (!quiet) toast(t('ui.guest.asked', { name: sel.name, other: other.name }));
  return true;
}
async function throwParty(who = sel) {
  if (homeParty || household.money < HOME_PARTY.cost) return;
  await loadNeighbours();
  const friends = npcs().filter((l) => lives.some((h) => bondOf(h, l).friendship >= INVITED));
  household.money -= HOME_PARTY.cost;
  homeParty = { until: minutes + HOME_PARTY.minutes, decor: partyDecor(home.bounds.w, home.bounds.d) };
  home.group.add(homeParty.decor);
  for (const l of lives) if (l.present && l.place === home) l.addMoodlet('party');
  who.count('hostParty');
  milestone('🥳', birthdayToday(who) ? 'diary.birthdayParty' : 'diary.party', { name: who.name });
  const came = friends.filter((f) => inviteOver(f, true, HOME_PARTY.minutes));
  toast(t(came.length ? 'ui.party.home' : 'ui.party.homeNobody', { n: came.length }));
  save();
}
function guestsTick() {
  const someone = lives.some((l) => l.present && l.place === home);
  if (homeParty && (minutes >= homeParty.until || !awake(minutes))) {
    homeParty.decor.removeFromParent();
    homeParty = null;
    toast(t('ui.party.homeOver'));
  }
  for (const g of [...guests]) {
    const l = g.life;
    const over = minutes >= g.until || !awake(minutes) || (g.arrived && !someone);
    if (over) {
      if (l.present && l.place === home) {
        if (l.doing) l.stop('home');
        l.queue = [GO_AWAY].map((offer) => ({ offer, by: 'self' }));
        if (someone) toast(t('ui.guest.bye', { name: l.name }));
      }
      guests.splice(guests.indexOf(g), 1);
      continue;
    }
    // Round 16, phase 4.4: not past DRAWN.most at home (they come in when someone goes).
    const full = everyone.filter((o) => o.present && o.place === home).length >= DRAWN.most;
    if (!g.arrived && !full && minutes >= g.comesAt && someone && !l.shift && !(l.present && l.place !== home && lives.some((h) => h.present && h.place === l.place))) {
      g.arrived = true;
      appear(l, home, false, !!homeParty);
      toast(t('ui.guest.here', { name: l.name }));
    }
  }
}
// ---- a bigger home: an extension, or a house bought (round 14) ----
// The household's furniture goes with them: what stood against a wall stands against the same wall (it moves with it),
// the rest keeps its place in the room as the room grows (the TV in front of the sofa); then the nearest place it fits;
// what fits nowhere goes in the boxes.
// `v` along a wall `half` from the middle, in a room growing to `next`: a metre from the wall or nearer, with the wall.
const along = (v, half, next) => (Math.abs(v) >= half - 1.0 ? v + Math.sign(v) * (next - half) : v * (next / half));
// The babies go in their cots. Everyone at home stops what they were doing and stands by the new front door.
async function fitSpot(s, e, tries = 3) {
  const at = async (x, z, turn) => (home.fits(await measure(srcOf(s), x, z, turn, e.width ? { width: e.width } : s.fit, s.use ? { ...s.use } : null)).ok ? { x, z, turn } : null);
  const first = await at(e.x, e.z, e.turn ?? 0);
  if (first) return first;
  // A few centimetres first: the flat's own things stood a little into its walls (they were never fitted).
  for (const d of [0.05, 0.1, 0.15, 0.2, 0.3])
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ok = await at(e.x + dx * d, e.z + dz * d, e.turn ?? 0);
      if (ok) return ok;
    }
  for (let r = 0.5; r <= tries; r += 0.5)
    for (let k = 0; k < 8 * r; k++) {
      const a = (k / (8 * r)) * Math.PI * 2;
      for (const turn of [e.turn ?? 0, (e.turn ?? 0) + Math.PI / 2]) {
        const ok = await at(Math.round((e.x + Math.cos(a) * r) * 4) / 4, Math.round((e.z + Math.sin(a) * r) * 4) / 4, turn % (Math.PI * 2));
        if (ok) return ok;
      }
    }
  return null;
}
let moving = false;
async function rehome(st) {
  if (moving) return;
  moving = true;
  const was = speed;
  setSpeed(0);
  $('loading').textContent = t('ui.moving');
  const old = home, from = old.bounds;
  const p = await buildHomePlace(st);
  // Stop what anyone is doing with the old home's things.
  const there = everyone.filter((l) => l.present && l.place === old);
  for (const l of there) if (l.doing && l.doing.by !== 'job') l.stop('move');
  for (const l of everyone) l.queue = l.queue.filter((e) => !e.item || !old.items.includes(e.item));
  const van = furniture.splice(0).map((e) => ({ e, owner: e.item.owner ?? null, twinOwner: e.item.twin?.owner ?? null, baby: e.item.baby ?? null, pet: e.item.pet ?? null }));
  for (const l of everyone) if (l.home && old.items.includes(l.home)) l.home = null;
  scene.remove(old.group);
  // The house bought may be the one they are looking round (bought at its own front door): whoever is in it comes into
  // the new home, and the view with them. Its old names go (it is `home` now; the home left is for sale again).
  const looking = places[st.id] && places[st.id] !== old ? places[st.id] : null;
  const visitors = looking ? everyone.filter((l) => l.present && l.place === looking) : [];
  for (const l of visitors) if (l.doing && l.doing.by !== 'job') l.stop('move');
  if (looking) scene.remove(looking.group);
  for (const k of Object.keys(places)) if (k !== 'home' && (places[k] === old || places[k] === looking)) delete places[k];
  home = places.home = p;
  for (const l of everyone) if (l.homePlace === old) l.homePlace = p;
  homeState = { ...st };
  const to = p.bounds;
  const boxed = [];
  // The cots first (a baby must have one), then the beds, then the rest.
  const order = [...van].sort((a, b) => (b.baby ? 2 : b.e.id.match(/bed/i) ? 1 : 0) - (a.baby ? 2 : a.e.id.match(/bed/i) ? 1 : 0));
  for (const { e, owner, twinOwner, baby, pet } of order) {
    const s = kindOf(e.id), want = { ...e, x: along(e.x, from.w / 2, to.w / 2), z: along(e.z, from.d / 2, to.d / 2) };
    // A cot, a camp bed or a pet's basket is never boxed: somewhere nearer the middle if not where it was.
    const spot = (await fitSpot(s, want)) ?? (baby || pet || e.id === 'campBed' ? await fitSpot(s, { ...want, x: 0, z: 0 }, 6) : null);
    if (!spot) {
      if (e.id !== 'campBed' && e.id !== 'cot' && e.id !== 'petBed') boxed.push(e.id), storage.push(e.id), e.base && boxedBase.push(e.id);
      continue;
    }
    const item = await placeExtra({ ...e, ...spot });
    if (owner) (item.owner = owner), (owner.home = item);
    if (twinOwner && item.twin) (item.twin.owner = twinOwner), (twinOwner.home = item.twin);
    if (baby) addBaby(baby, item), home.group.add(baby.mesh);
    if (pet) rebed(pet, item, true);
  }
  for (const l of [...there, ...visitors]) l.arrive(p);
  if (view === old || view === looking || there.includes(sel) || visitors.includes(sel)) (view = null), setView(p);
  $('loading').textContent = '';
  moving = false;
  setSpeed(was);
  save();
  return boxed;
}
async function extendHome() {
  const next = homeState.size + 1, cost = EXTENSION[next];
  if (!SIZES[next] || household.money < cost) return;
  household.money -= cost;
  const boxed = await rehome({ ...homeState, size: next, paid: homeState.paid + cost });
  toast(t('ui.extend.done', { w: SIZES[next].w, d: SIZES[next].d }));
  milestone('📐', 'diary.extended', { w: SIZES[next].w, d: SIZES[next].d });
  if (boxed?.length) toast(t('ui.move.boxed', { n: boxed.length }));
}
// Buying a house: the one you live in now is sold for what it cost you (the flat is rented: nothing back).
const buyCost = (id) => houseById(id).price - homeState.paid;
async function buyHouse(id) {
  const h = houseById(id);
  if (h.kind !== 'sale' || owned(id) || household.money < buyCost(id)) return;
  household.money -= buyCost(id);
  const boxed = await rehome({ id, size: h.size, paid: h.price });
  toast(t('ui.move.done', { house: houseName(houseById(id)) }));
  milestone('🔑', 'diary.moved', { house: houseName(houseById(id)) });
  if (boxed?.length) toast(t('ui.move.boxed', { n: boxed.length }));
}

// The clock: game minutes since midnight of day 1.
const [h0, m0] = (params.get('start') ?? '07:30').split(':').map(Number);
let minutes = saved?.minutes ?? h0 * 60 + m0;
let speed = Number(params.get('speed') ?? 1);
// ---- the calendar (round 16, phase 6; calendar.mjs) ----
// On in a game; on a test URL only with ?calendar=1, ?season=<spring|summer|autumn|winter> (today its first day) or
// ?date=<1 to 28> (today that day of the year). `calendar`: `start` (the day of the year the game began on: a new
// game's by the town's dice; a save from before phase 6 makes the day it loads the first day of spring), `told` (the
// season last announced), `cake` / `presents` (whose birthday has had them, by year), `events` (each town event's
// state, by year: advertised, entered).
const today0 = Math.floor(minutes / 1440);
if (seasonForced || dateForced != null) calendar.start = startFor(today0, dateForced ?? yearDayOf(seasonForced, 1));
else if (calendar.start == null) calendar.start = saved ? startFor(today0, 0) : rollStart(TOWN.seed ? townDice(TOWN.seed, 7999) : Math.random);
const dateNow = () => dateOf(Math.floor(minutes / 1440), calendar.start);
const seasonNow = () => (calendarOn ? dateNow().season : null);
const weekendNow = () => calendarOn && isWeekend(weekday(minutes));
const yearKey = () => `${dateNow().year}`;
// The day's date for the clock: "🌸 Spring 3".
const dateText = () => {
  const d = dateNow();
  return t('season.date', { icon: seasonById(d.season).icon, season: t(`season.${d.season}`), n: d.dayOfSeason });
};
// Round 16, phase 6.2: everyone's birthday, a day of the year. The town's people's (and the flatmate's, and anyone who
// moves in) by the town's dice, so the same town has the same birthdays; the Sim you made, as chosen on that screen.
// A save from before phase 6: the town's roll for each of them. ?birthday=today (or 1 to 28) on a test URL: the first
// Sim's is today (that day). Nobody gets older: a birthday is cake, presents and friends.
const npcBirthday = (who) => rollBirthday(townDice(TOWN.seed, 300 + who));
const birthdayOf = (l) => (Number.isInteger(l.birthday) ? l.birthday : npcBirthday(l.who));
if (calendarOn) {
  const asked = params.get('birthday');
  if (!saved && Number.isInteger(start?.birthday)) lives[0].birthday = start.birthday;
  if (asked) lives[0].birthday = asked === 'today' ? dateNow().yearDay : Math.max(1, Math.min(YEAR_DAYS, Number(asked) || 1)) - 1;
  for (const l of lives) l.birthday = birthdayOf(l);
}
const birthdayToday = (l) => calendarOn && birthdayOf(l) === dateNow().yearDay;
// Is it the birthday of someone in the household today (the cake and the party are there: actions.mjs `birthday`)?
const birthdayHere = () => lives.some(birthdayToday);
// Day 1 is a Monday (work.mjs: the work days are Monday to Friday).
const clockText = () => `${t('ui.day', { day: Math.floor(minutes / 1440) + 1, weekday: t(`day.${weekday(minutes)}`) })} · ${hhmm(minutes)}`;
const SPEED_ICONS = ['⏸', '▶', '⏩', '⏭'];
$('speeds').innerHTML = SPEEDS.map((_, i) => `<button data-speed="${i}" title="${t(i ? `ui.speed.${i}` : 'ui.speed.pause')}">${SPEED_ICONS[i]}</button>`).join('');
const setSpeed = (i) => {
  speed = i;
  for (const b of $('speeds').children) b.classList.toggle('on', Number(b.dataset.speed) === i);
};
for (const b of $('speeds').children) b.onclick = () => setSpeed(Number(b.dataset.speed));
setSpeed(speed);
addEventListener('keydown', (e) => {
  if (placing) {
    if (e.key === 'r' || e.key === 'R') turnPlacing();
    if (e.key === 'Escape') stopPlacing();
    return;
  }
  if (card) return; // a card is open: the game waits for it
  if (e.key === ' ') setSpeed(speed ? 0 : 1);
  if (['1', '2', '3'].includes(e.key)) setSpeed(Number(e.key));
});

// Day and night: the sky, the sun and a lamp that comes on in the evening at home, from the clock.
// Round 11: the sun crosses the sky (east in the morning, west in the evening, warmer and lower at either end), so the
// shadows turn through the day; the sky's colours and the haze follow the hour.
const sunWarm = new THREE.Color(0xffb27a), sunNoon = new THREE.Color(0xfff2dd), sunOffset = new THREE.Vector3();
function light() {
  const hour = (minutes % 1440) / 60;
  const day = daylight(hour); // 0 at night, 1 from 8 to 19
  const arc = THREE.MathUtils.clamp((hour - 6) / 15, 0, 1) * Math.PI; // 0 at 06:00, π at 21:00
  const high = Math.sin(arc);
  sunOffset.set(Math.cos(arc) * 7, 6 + 5 * high, 6);
  skyDome.update(hour, camera, sunOffset);
  // Round 16, phase 3.4: grey for rain and snow (not at night: it is dark anyway), and less sun.
  const wl = WEATHER[weatherNow()].look;
  greySky(skyDome.uniforms, wl.grey * day, wl.grey);
  scene.fog.color.copy(skyDome.uniforms.horizon.value);
  sky.intensity = 0.45 + 0.95 * day;
  sun.intensity = 2.2 * day * wl.sun;
  sun.color.copy(sunWarm).lerp(sunNoon, Math.min(1, high * 1.6));
  for (const m of shiny) m.envMapIntensity = 0.25 + 0.6 * day;
  lamp.intensity = view.house ? 6 * (1 - day) : 0;
  // Round 16, phase 3: a power cut at home, after dark: no lamp, and dimmer.
  if (deck.powerOff > minutes && view === home) (lamp.intensity = 0), (sky.intensity *= 0.35 + 0.65 * day);
}

// ---- where: the places, and who is in each. You see the one the Sim you look after is in ----
const PLACE_ICONS = { home: '🏠', office: '🏢', park: '🌳', street: '🏘️', cafe: '☕', vet: '🐾' };
let followed = null; // the place sel was in last frame: when it changes, the view goes with them
// Round 14: a house in the town shows here while someone from the household is in it (or you are looking at it), and
// 🗺️ Town opens the street: who lives where, the parties, the houses for sale, an extension.
function renderPlaces() {
  const shown = [home, office, park, street, ...allPlaces().filter((p) => (p.house || p.work) && p !== home && (view === p || lives.some((l) => l.present && l.place === p)))];
  $('places').innerHTML = shown
    .map((p) => {
      const k = nameOf(p);
      const here = [...lives, ...(nanny ? [nanny] : [])].filter((l) => l.present && l.place === p).map((l) => (l.carer ? `${CHILDCARE.nanny.icon} ${l.name}` : l.name)).join(', ');
      const icon = PLACE_ICONS[k] ?? (partyAt(p.house) ? '🎉' : houseById(p.house)?.kind === 'sale' ? '🪧' : '🏡');
      return `<button data-place="${k}" class="${view === p ? 'on' : ''}">${icon} ${titleOf(p)}${here ? `<small>${here}</small>` : ''}</button>`;
    })
    .join('') + `<button data-town title="${t('ui.town.map')}">🗺️</button>`;
  for (const b of $('places').children) b.onclick = () => (b.dataset.town != null ? openTown() : setView(places[b.dataset.place]));
}
// In the office and the park the camera keeps the one you look after in the middle (the flat is small enough to see whole).
const follow = new THREE.Vector3();
function followSel() {
  if (sel.place !== followed) {
    followed = sel.place;
    if (sel.present) setView(sel.place, sel.sim.position);
  }
  if (view.bounds.w <= 8 || sel.place !== view || !sel.present || card) return;
  follow.copy(sel.sim.position).setY(controls.target.y).sub(controls.target).multiplyScalar(0.04);
  if (follow.lengthSq() < 1e-6) return;
  controls.target.add(follow);
  camera.position.add(follow);
}

// ---- clicking: a thing → its menu; the floor → go there; someone → what to do with them ----
const ray = new THREE.Raycaster();
const inView = (l) => l.present && l.place === view;
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  down = [e.clientX, e.clientY];
  $('menu').hidden = true;
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  // Placing something bought: the click puts it down (or says why it can't go there).
  if (placing) return placeHere(e.clientX, e.clientY);
  // Not where they are: the click is only for looking. Round 15: on the street, a house's door (or the bus stop) still
  // answers: the one you look after walks there from wherever they are.
  const away = sel.place !== view || !sel.present;
  if (away && view !== street) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  // Round 14: everything in the home can be clicked (to move, box or sell it), so something with nothing to do with it
  // (the TV, a plant) no longer stops a click on what stands behind it (a cot behind the TV: parked-lifesim-r14-tvcot).
  // It is the click's only if nothing usable is further along.
  let only = null;
  const fronts = view.street?.hits ?? [];
  const targets = away ? [...view.clickable, ...fronts] : [...everyone.filter((l) => inView(l) && !l.carer).map((l) => l.proxy), ...pets.filter((p) => p.mesh?.visible).map((p) => p.proxy), view.floor, ...view.clickable, ...fronts];
  for (const h of ray.intersectObjects(targets, false)) {
    const who = h.object.userData.life;
    if (who) return who === sel ? undefined : openSocialMenu(who, e.clientX, e.clientY);
    const item = h.object.isInstancedMesh ? h.object.userData.items[h.instanceId] : h.object.userData.front ? frontDoor(h.object.userData.front) : h.object.userData.petBed ?? null;
    if (item?.gone) continue;
    // Round 16, phase 4.2: the notice board (or its name board): what has changed in the town. Read from anywhere.
    if (item?.use?.board || h.object.userData.board) return openNews();
    if (item?.use?.front) return openDoorMenu(item, e.clientX, e.clientY);
    if (away && item?.use?.offers !== 'streetBus') continue;
    if (item && offersFor(item).length) return openMenu(item, e.clientX, e.clientY);
    if (item && item.bought && item.bought.id !== 'campBed') {
      only ??= item;
      continue;
    }
    if (h.object === view.floor) {
      if (only) return openMenu(only, e.clientX, e.clientY);
      if (view.grid.free(h.point)) openMenu(null, e.clientX, e.clientY, h.point.setY(0));
      return;
    }
  }
  if (only) openMenu(only, e.clientX, e.clientY);
});
function openMenu(item, x, y, point = null) {
  const atHome = view === home;
  // Round 14: a front door's "Go home" is for anyone's door but your own.
  const offers = item ? offersFor(item).filter((o) => o.offered !== false && !(o.baby && item.baby?.away) && !(o.away && atHome) && inWeather(o) && (!o.birthday || birthdayHere())) : [{ id: 'goHere', act: 'walk' }];
  const gain = (o) =>
    Object.entries(o.advertises ?? o.gives ?? {})
      .filter(([, v]) => v > 0)
      .map(([id]) => NEEDS.find((n) => n.id === id).icon)
      .join('') + (o.skill ? [...new Set(Object.keys(o.skill).map((id) => SKILL_ICONS[id] ?? '🔬'))].join('') : '');
  // A work station says what its job is and the subject it asks.
  const st = item?.use?.station;
  const baby = item?.baby;
  const head = st
    ? `<div class="with">${STATIONS.find((s) => s.id === st).icon} ${stationName(sel.job?.career, st)}<small>${t(`subject.${st}`)} · ${stationJob(sel.job?.career, st)}</small></div>`
    : baby ? `<div class="with">👶 ${baby.name}<small>${t(`ui.baby.state.${baby.state}`)}${baby.crying ? ` · ${t(`baby.need.${baby.crying}`)}` : ''}</small></div>` : '';
  // Anything in the home (round 10: what was bought; round 14: all of it): moved, put away in the boxes, or sold back
  // for half. Not while someone uses it or sleeps in it, and never the last loo, fridge or shower. A cot (round 12)
  // only moves (a baby is in it); the camp bed does none of these.
  const bought = atHome && item?.bought && item.bought.id !== 'campBed' && entryOf(item) ? item.bought : null;
  const keep = bought && (item.user || item.owner ? t('ui.shop.inUse') : lastNeed(item) ? t(`ui.shop.need.${bought.need}`) : '');
  const extra = bought
    ? `<button data-move>↔ ${t('ui.shop.move')}</button>${bought.price ? `<button data-store ${keep ? 'disabled' : ''}>📥 ${t('ui.shop.store')}<span class="gain">${keep || ''}</span></button><button data-sell ${keep ? 'disabled' : ''}>📦 ${t('ui.shop.sell')}<span class="gain">${keep || `+${t('ui.cost', { cost: sellPrice(bought) })}`}</span></button>` : ''}`
    : '';
  // A way out (a front door, the bus stop): anywhere in the town (round 14); and a house for sale's door: buy it.
  const out = item && (item.use?.act === 'door' || item.use?.offers === 'busStop' || item.use?.offers === 'streetBus');
  const sale = out && view.house && houseById(view.house)?.kind === 'sale' && !owned(view.house) ? houseById(view.house) : null;
  const doorRows = out ? `<button data-town>🗺️ ${t('ui.town.go')}</button>${sale ? `<button data-buyhouse>🏡 ${t('ui.sale.buy')}<span class="gain">${t('ui.cost', { cost: sale.price })}</span></button>` : ''}` : '';
  // Round 16, phase 3: greyed when it can't be done now (a power cut), with why.
  const why = (o) => offerWhy(sel, o);
  $('menu').innerHTML = head + offers.map((o, i) => `<button data-i="${i}" ${why(o) ? 'disabled' : ''}>${o.baby ? `${o.icon} ` : ''}${t(`action.${o.id}`)}<span class="gain">${why(o) ? t(why(o)) : o.task ? '🪙' : o.earn ? earnGain(o) : gain(o)}</span></button>`).join('') + extra + doorRows;
  for (const b of $('menu').querySelectorAll('button[data-i]'))
    b.onclick = () => {
      sel.command(offers[b.dataset.i], sideFor(sel, item), point);
      $('menu').hidden = true;
    };
  if (bought) {
    $('menu').querySelector('[data-move]').onclick = () => (($('menu').hidden = true), startPlacing(bought, item));
    const sellButton = $('menu').querySelector('[data-sell]');
    if (sellButton) sellButton.onclick = () => (($('menu').hidden = true), sell(item));
    const storeButton = $('menu').querySelector('[data-store]');
    if (storeButton) storeButton.onclick = () => (($('menu').hidden = true), store(item));
  }
  if (out) $('menu').querySelector('[data-town]').onclick = () => (($('menu').hidden = true), openTown());
  if (sale) $('menu').querySelector('[data-buyhouse]').onclick = () => (($('menu').hidden = true), openBuy(sale.id));
  showMenu(x, y, offers.length + (head ? 1 : 0) + (bought ? (bought.price ? 3 : 1) : 0) + (out ? (sale ? 2 : 1) : 0));
}
// Round 16, phase 5.2: what an earning thing would bring in now.
function earnGain(o) {
  const side = household.side, lv = (id) => skillLevel(sel.skills[id] ?? 0);
  if (o.earn === 'paintings') return `+${t('ui.cost', { cost: side.paintings.reduce((a, b) => a + b, 0) })}`;
  if (o.earn === 'veg') return `+${t('ui.cost', { cost: Math.round(EARNING.veg.worth(lv('gardening')) * (household.crop?.worth ?? 1)) })}`;
  if (o.earn === 'busk') return t('earn.perHour', { coins: EARNING.busk.tips(lv('music')) });
  return '🪙';
}
function showMenu(x, y, rows) {
  Object.assign($('menu').style, { left: `${Math.min(x, innerWidth - 240)}px`, top: `${Math.max(8, Math.min(y, innerHeight - 46 * rows - 40))}px` });
  $('menu').hidden = false;
}
// Clicking someone else: what your Sim can do with them. The ones the friendship isn't ready for are shown greyed,
// with the level they need ("Needs: Friends"), so the way to a hug is there to see. Asking someone to move in is only
// for someone who doesn't live with you.
function openSocialMenu(other, x, y) {
  const bond = bondOf(sel, other);
  const busy = other.busyFor(sel);
  const asleep = busy === 'asleep' || busy === 'away';
  const shown = INTERACTIONS.filter((ix) =>
    ix.only === 'notHousehold' ? !lives.includes(other) : ix.only === 'household' ? lives.includes(other) : ix.only === 'unmarried' ? !spouseOf(sel, everyone) && !spouseOf(other, everyone) : true
  );
  const head = `<div class="with">${t('ui.menu.with', { name: other.name })}<small>${t(`friendship.${friendshipLevel(bond).id}`)}${bond.married ? ` · 💍 ${t('ui.married.short')}` : bond.romance > 0 ? ` · 💗 ${t(`romance.${romanceLevel(bond).id}`)}` : ''}</small>${traitLine(other)}</div>`;
  const rows = asleep
    ? `<div class="note">${t(`ui.busy.${busy}`, { name: other.name })}</div>`
    : shown
        .map((ix) => {
          const lock = lockOf(ix, bond);
          // A baby needs a cot, and the flat has room for MAX_BABIES (round 12).
          const full = !lock && ix.after === 'baby' && babies.length >= MAX_BABIES;
          const why = lock ? `<span class="gain">🔒 ${t('ui.locked', { level: t(`${lock.kind}.${lock.level}`) })}</span>` : full ? `<span class="gain">🔒 ${t('ui.baby.full')}</span>` : '';
          // Round 16: a present costs (greyed out when the coins are short).
          const short = !lock && !full && ix.cost && household.money < ix.cost;
          const price = ix.cost ? ` <span class="cost">${t('ui.cost', { cost: ix.cost })}</span>` : '';
          return `<button data-id="${ix.id}" ${lock || full || short ? 'disabled' : ''}>${ix.icon} ${t(`action.${ix.id}`)}${price}${why}</button>`;
        })
        .join('');
  $('menu').innerHTML = head + rows;
  for (const b of $('menu').querySelectorAll('button'))
    b.onclick = () => {
      sel.command(interactionById(b.dataset.id), null, null, other);
      $('menu').hidden = true;
    };
  showMenu(x, y, asleep ? 2 : shown.length + 1);
}
// Your Sim's own things to do. One that costs shows its price, and waits greyed out until there is the money; looking
// for a job is there until they have one.
const SELF = offersFor(null).filter((o) => o.offered !== false);
$('self').innerHTML = SELF.map((o, i) => `<button data-i="${i}" data-id="${o.id}">${o.icon ?? (o.id === 'phone' ? '📞' : '📱')} ${t(`action.${o.id}`)}${o.cost ? ` <span class="cost">${t('ui.cost', { cost: o.cost })}</span>` : ''}</button>`).join('');
for (const b of $('self').children) b.onclick = () => sel.command(SELF[b.dataset.i]);
function renderSelf() {
  // The buy menu: at home (what is bought goes in the flat), not while placing.
  $('buy').hidden = view !== home || !!placing;
  $('buy').disabled = !!card;
  for (const b of $('self').children) {
    const o = SELF[b.dataset.i];
    // A pizza is delivered to the flat; a job is looked for once.
    b.hidden = (o.id === 'findJob' && !!sel.job) || ((o.id === 'orderPizza' || o.id === 'orderCake') && sel.place !== home) || (o.id === 'adoptPet' && pets.length >= MAX_PETS) || (o.birthday && !birthdayHere());
    b.disabled = (!!o.cost && household.money < o.cost) || (o.id === 'birthdayParty' && (household.money < HOME_PARTY.cost || !!homeParty));
    b.title = b.disabled ? t('ui.money.short', { name: sel.name, cost: o.cost }) : '';
  }
}

// Who lives here: click someone to look after them. The bonds between them, and the friends they have at work.
function select(l) {
  sel = l;
  $('menu').hidden = true;
  renderYear();
}
$('people').innerHTML = `<h2>${t('ui.people')}</h2><div class="row" id="who"></div><div id="babies"></div><div id="bonds"></div><div id="workmates"></div>`;
const bondRows = (a, b) => {
  const bond = bondOf(a, b);
  const f = bond.friendship;
  // Friendship runs -100…100 from the middle of its bar; romance 0…100, shown once there is any or they are friends.
  const fBar = `<div class="bar two"><i style="left:${f < 0 ? 50 + f / 2 : 50}%;width:${Math.abs(f) / 2}%;background:${f < 0 ? '#e05a47' : '#4caf50'}"></i></div>`;
  const romance = bond.romance > 0 || f >= 25
    ? `<div class="bond"><span>💗</span><span>${t('ui.romance')}</span><b>${t(`romance.${romanceLevel(bond).id}`)}</b><div class="bar"><i style="width:${bond.romance}%;background:#e46aa0"></i></div></div>`
    : '';
  return `<div class="pair">${a.name} & ${b.name}${bond.married ? ` · 💍 ${t('ui.married.short')}` : ''}</div><div class="bond"><span>🤝</span><span>${t('ui.friendship')}</span><b>${t(`friendship.${friendshipLevel(bond).id}`)}</b>${fBar}</div>${romance}`;
};
// Round 16: someone's traits in a line (the friends card, the Sim you look after, the menu over someone).
// And their favourites (likes.mjs), once you know them: your own household, or a friend.
const likeLine = (l) => (l?.likes ? `<div class="traitline">❤️ ${['food', 'colour', 'activity'].map((k) => t(`like.${k}.${l.likes[k]}`)).join(' · ')} · 👎 ${t(`like.activity.${l.likes.dislike}`)}</div>` : '');
const knowsLikes = (l) => lives.includes(l) || lives.some((h) => bondOf(h, l).friendship >= GIFT.knows);
const traitLine = (l) =>
  (l?.perks?.length ? `<div class="traitline">${l.perks.map((id) => `${PERKS[id]?.icon ?? '🏅'} ${t(`perk.${id}`)}`).join(' · ')}</div>` : '') +
  (l?.traits?.length ? `<div class="traitline" title="${l.traits.map((id) => t(`trait.${id}.does`)).join(' · ')}">${l.traits.map((id) => `${TRAITS[id].icon} ${t(`trait.${id}`)}`).join(' · ')}</div>` : '') +
  (l?.likes ? (knowsLikes(l) ? likeLine(l) : `<div class="traitline">❤️ ${t('ui.likes.unknown')}</div>`) : '');
let friendsShown = null;
function renderPeople() {
  $('who').innerHTML = lives.map((l, i) => `<button data-i="${i}" class="${l === sel ? 'on' : ''}" title="${t('ui.people.hint')}"><span class="face">${EMOTIONS[l.mood.emotion].icon}</span>${l.name}</button>`).join('');
  for (const b of $('who').children) b.onclick = () => select(lives[b.dataset.i]);
  // The babies (round 12): how each is, and their three needs. Round 13: who is looking after them while everyone is
  // out (the nanny, the nursery), and the household's choice, changed here.
  const named = babies.filter((b) => b.name);
  const where = caring?.kind === 'nursery' ? `${CHILDCARE.nursery.icon} ${t('ui.care.atNursery')}` : caring && nanny?.present ? `${CHILDCARE.nanny.icon} ${t('ui.care.withNanny', { nanny: nanny.name })}` : '';
  const choice = Object.keys(CHILDCARE).map((k) => `<button data-care="${k}" class="${household.childcare === k ? 'on' : ''}">${CHILDCARE[k].icon} ${t(`ui.care.${k}.short`)}</button>`).join('');
  const babiesHtml = named
    .map((b) => `<div class="baby"><div class="who"><span class="face">${b.away ? CHILDCARE.nursery.icon : b.asleep ? '😴' : b.crying ? '😭' : '😊'}</span><b>${b.name}</b><small>${t(b.girl ? 'ui.baby.girl' : 'ui.baby.boy')}</small></div>${BABY_NEEDS.map((n) => `<div class="need" title="${t(`baby.need.${n.id}`)}"><span class="icon">${n.icon}</span><div class="bar"><i style="width:${b.needs[n.id]}%;background:${barColour(b.needs[n.id])}"></i></div></div>`).join('')}</div>`)
    .join('') + (named.length ? `<div class="care">${where ? `<div class="where">${where}</div>` : ''}<div class="choice"><span title="${t('ui.care.hint')}">${t('ui.care.when')}</span>${choice}</div></div>` : '');
  if ($('babies').innerHTML !== babiesHtml) $('babies').innerHTML = babiesHtml;
  for (const b of $('babies').querySelectorAll('[data-care]'))
    b.onclick = () => {
      household.childcare = b.dataset.care;
      if (b.dataset.care === 'nanny') nannyLife();
      save();
    };
  const bondsHtml = traitLine(sel) + lives.flatMap((a, i) => lives.slice(i + 1).map((b) => bondRows(a, b))).join('');
  if ($('bonds').innerHTML !== bondsHtml) $('bonds').innerHTML = bondsHtml;
  // The colleagues and neighbours the one you look after has got to know (talked to at least once). Round 14 (the brief:
  // "everyone they work with is accessible as a 'friend' to go hang out with"): go round to theirs 🏡, or ask them
  // round 📞.
  const known = npcs().filter((c) => { const b = bondOf(sel, c); return b.friendship !== 5 || b.romance > 0; });
  const friendsHtml = known.length
    ? `<h3>${t('ui.friends')}</h3>${known.map((c) => `<div class="friend">${bondRows(sel, c)}${traitLine(c)}<div class="friend-go"><small>${t(c.job ? 'ui.friend.colleague' : 'ui.friend.neighbour')}</small><button data-visit="${c.house}" title="${t('ui.friend.visit', { name: c.name })}" ${visitState(c.house).ok ? '' : 'disabled'}>🏡 ${t('ui.friend.visitShort')}</button><button data-invite="${c.name}" title="${t('ui.friend.invite', { name: c.name })}" ${homeNow(c) && !guests.some((g) => g.life === c) ? '' : 'disabled'}>📞 ${t('ui.friend.inviteShort')}</button></div></div>`).join('')}`
    : '';
  if (friendsShown !== friendsHtml) {
    $('workmates').innerHTML = friendsShown = friendsHtml;
    for (const b of $('workmates').querySelectorAll('[data-visit]')) b.onclick = () => goVisit(b.dataset.visit);
    for (const b of $('workmates').querySelectorAll('[data-invite]')) b.onclick = () => inviteOver(npcs().find((c) => c.name === b.dataset.invite));
  }
}

// ---- the panels ----
const barColour = (v) => (v > 60 ? '#4caf50' : v > 30 ? '#e6b729' : '#e05a47');
$('needs').innerHTML = NEEDS.map((n) => `<div class="need"><span class="icon">${n.icon}</span><span>${t(`need.${n.id}`)}</span><div class="bar"><i id="need-${n.id}"></i></div></div>`).join('');
const SKILL_ICONS = { science: '🔬', maths: '🔢', geography: '🌍', french: '📝', english: '☎️', history: '🏺', ...Object.fromEntries(SKILL_IDS.map((id) => [id, SKILLS[id].icon])) };
// ---- dreams (round 16, phase 2: goals.mjs) ----
// What a dream's steps are tested on (goals.mjs, its top): a Sim's friends and romances, the household, the home.
function factsOf(l) {
  const bonds = everyone.filter((o) => o !== l && !o.carer).map((o) => peekBond(l, o)).filter(Boolean);
  const has = {};
  for (const e of furniture) has[e.id] = true;
  return {
    friends: bonds.filter((b) => b.friendship >= 25).length,
    goodFriends: bonds.filter((b) => b.friendship >= 55).length,
    bestFriends: bonds.filter((b) => b.friendship >= 85).length,
    romance: Math.max(0, ...bonds.map((b) => b.romance)),
    married: bonds.some((b) => b.married),
    together: lives.some((o) => partners(l, o)),
    babies: babies.length,
    job: l.job ? l.job.level + 1 : 0,
    homeSize: homeState.size,
    ownHouse: homeState.id !== 'flat',
    beauty: beauty(),
    things: extras().length,
    has,
    science: skillLevel(l.skills.science ?? 0),
    // Round 16, phase 5: every skill's level (skills.mjs).
    skills: levelsOf(l.skills, skillLevel),
    tally: l.tally
  };
}
// Every few moments: a step done is happy points and a toast; the last one, the dream come true.
function checkGoals() {
  if (!aimsOn) return;
  for (const l of lives) {
    const g = goalById(l.goal?.id);
    if (!g) continue;
    const n = stepsDone(l.goal, factsOf(l));
    if (l.goal.quiet) {
      l.goal.step += n;
      delete l.goal.quiet;
    } else
      for (let k = 0; k < n; k++) {
        const st = g.steps[l.goal.step++];
        l.points += STEP_POINTS;
        toast(t('goal.stepDone', { name: l.name, step: t(`goal.${g.id}.${st.id}`), points: STEP_POINTS }));
        milestone(st.icon, 'diary.step', { name: l.name, step: `goal.${g.id}.${st.id}`, goal: `goal.${g.id}` });
      }
    if (l.goal.step >= g.steps.length) dreamComeTrue(l, g);
    else if (n) save();
  }
}
// The celebration: points, hearts and a moodlet for everyone at home, and a card to choose the next dream.
function dreamComeTrue(l, g) {
  l.points += GOAL_POINTS;
  l.goalsDone.push(g.id);
  l.goal = null;
  for (const o of lives) if (o.present && o.place === l.place) o.hearts.push({ icon: '🏆' }, { icon: '🎉' });
  l.addMoodlet('dreamComeTrue');
  milestone('🏆', 'diary.dream', { name: l.name, goal: `goal.${g.id}` });
  save();
  openGoalPicker(l, g);
}
function openGoalPicker(l, done = null) {
  if (card) closeCard();
  const open = openGoals(l.goalsDone, skillsOn);
  const head = done ? `<h2>🎉 ${t('goal.cameTrue', { name: l.name, goal: t(`goal.${done.id}`) })}</h2><p class="intro">${t('goal.cameTrueText', { name: l.name, points: GOAL_POINTS })}</p>` : `<h2>${t('goal.title', { name: l.name })}</h2>`;
  openCard(l, 'goal', `${head}${open.length ? `<p class="intro">${t('goal.next', { name: l.name })}</p>${goalRows(open)}` : `<p class="intro">${t('goal.allDone', { name: l.name })}</p>`}
    <div class="actions"><button id="goal-later">${t('goal.later')}</button>${open.length ? `<button class="go" id="goal-roll">🎲 ${t('start.surprise')}</button>` : ''}</div>`);
  const pick = (id) => {
    closeCard();
    if (!id) return;
    l.goal = { id, step: 0, quiet: true };
    toast(t('goal.chosen', { name: l.name, goal: t(`goal.${id}`) }));
    milestone(goalById(id).icon, 'diary.newGoal', { name: l.name, goal: `goal.${id}` });
    save();
  };
  for (const b of $('card').querySelectorAll('[data-goal]')) b.onclick = () => pick(b.dataset.goal);
  $('goal-roll')?.addEventListener('click', () => pick(rollGoal(l.goalsDone, Math.random, skillsOn)));
  $('goal-later').onclick = closeCard;
}
// ---- wishes (round 16, phase 2: wants.mjs) ----
// Three for each Sim in the household, weighted by who they are and how things are; a new one when one comes true, or
// after a day. Math.random rolls them, never the seeded dice (a test's free will must choose as it did).
function wantCtx(l) {
  const f = factsOf(l);
  return { traits: l.traits, likes: l.likes, goal: l.goal?.id ?? null, needs: l.needs, hour: (minutes % 1440) / 60, money: household.money, job: f.job, friends: f.friends, romance: f.romance, babies: f.babies, has: f.has, weather: weatherNow(), season: seasonNow(), off: offNow(), skills: skillsOn ? f.skills : null };
}
function wantsTick() {
  if (!aimsOn) return;
  for (const l of lives) {
    const kept = l.wants.filter((w) => wantById(w.id) && w.until > minutes);
    if (kept.length === l.wants.length && kept.length >= WANT_SLOTS) continue;
    l.wants = kept;
    while (l.wants.length < WANT_SLOTS) {
      const w = rollWant(wantCtx(l), l.wants.map((x) => x.id));
      if (!w) break;
      l.wants.push({ id: w.id, until: minutes + WANT_LASTS });
    }
  }
}
// Life `count` tells us what was done: a wish that was for it comes true.
function wished(l, id) {
  if (id === 'buildSnowman') buildSnowman(l);
  // Round 16, phase 6.4: up after a weekend lie-in.
  if (id === 'sleep' && lives.includes(l) && offToday(l) && (minutes % 1440) >= WEEKEND.lieIn * 60 && (minutes % 1440) < (WEEKEND.lieIn + 1.5) * 60) l.addMoodlet('lieIn');
  // Round 16, phase 6.2: a birthday cake baked or bought, and a birthday party (the household's own: round 15).
  if (id === 'bakeCake' || id === 'orderCake') birthdayCake(l, id === 'bakeCake' ? 'baked' : 'bought');
  // Round 16, phase 6.3: the town event's contest.
  if (id === 'enterContest' && lives.includes(l)) enterContest(l);
  if (id === 'birthdayParty' && lives.includes(l)) {
    if (homeParty) toast(t('town.partyOn'));
    else if (household.money < HOME_PARTY.cost) toast(t('ui.money.short', { name: l.name, cost: HOME_PARTY.cost }));
    else throwParty(l);
  }
  // Round 16, phase 5.2: the neighbour helped is glad of it.
  if (id === 'oddJob' && l.place?.house) for (const r of residentsOf(l.place.house)) bondOf(l, r).friendship += 6;
  if (!aimsOn || !lives.includes(l)) return;
  const k = l.wants.findIndex((w) => wantById(w.id)?.did === id);
  if (k < 0) return;
  const w = wantById(l.wants[k].id);
  l.wants.splice(k, 1);
  l.points += w.points;
  l.addMoodlet('wishCameTrue');
  toast(t('want.done', { name: l.name, want: t(`want.${w.id}`), points: w.points }));
}
// Not that one: another in its place.
function dropWant(l, id) {
  l.wants = l.wants.filter((w) => w.id !== id);
  const w = rollWant(wantCtx(l), [...l.wants.map((x) => x.id), id]);
  if (w) l.wants.push({ id: w.id, until: minutes + WANT_LASTS });
}
// The Aims panel: the dream and how far along, the happy points (round 16, phase 2).
let aimsShown = null;
function renderAims() {
  $('aims-panel').hidden = !aimsOn || !lives.includes(sel);
  if ($('aims-panel').hidden) return;
  const g = goalById(sel.goal?.id);
  const dots = g ? g.steps.map((st, k) => `<span class="${k < sel.goal.step ? 'done' : k === sel.goal.step ? 'next' : ''}" title="${t(`goal.${g.id}.${st.id}`)}">${st.icon}</span>`).join('') : '';
  const goalHtml = g
    ? `<div class="goal"><b>${g.icon} ${t(`goal.${g.id}`)}</b><div class="steps">${dots}</div><small>${t('goal.nextStep', { step: t(`goal.${g.id}.${g.steps[Math.min(sel.goal.step, g.steps.length - 1)].id}`) })}</small></div>`
    : `<div class="goal"><button id="aims-pick">🌠 ${t('goal.pick')}</button></div>`;
  const wants = sel.wants.map((w) => wantById(w.id)).filter(Boolean)
    .map((w) => `<div class="want"><span class="icon">${w.icon}</span><span>${t(`want.${w.id}`)}</span><small>+${w.points}</small><button data-drop="${w.id}" title="${t('want.drop')}">✖</button></div>`).join('');
  const html = `${goalHtml}<h3>${t('want.title')}</h3><div class="wants">${wants}</div><div class="points">🌟 ${t('ui.points', { n: sel.points })} <button id="aims-spend">🎁 ${t('reward.spend')}</button></div><button id="aims-diary">📖 ${t('diary.button')}</button>`;
  if (html === aimsShown) return;
  $('aims').innerHTML = aimsShown = html;
  $('aims-pick')?.addEventListener('click', () => openGoalPicker(sel));
  for (const b of $('aims').querySelectorAll('[data-drop]')) b.onclick = () => dropWant(sel, b.dataset.drop);
  $('aims-spend').onclick = () => openRewards(sel);
  $('aims-diary').onclick = openDiary;
}
// ---- what happy points buy (round 16, phase 2: rewards.mjs) ----
function openRewards(l) {
  if (card || placing) return;
  const row = (r) => {
    const why = cantBuy(r, l);
    const name = r.kind === 'perk' ? t(`perk.${r.perk}`) : t(`reward.${r.id}`), does = r.kind === 'perk' ? t(`perk.${r.perk}.does`) : t(`reward.${r.id}.does`);
    return `<div class="offer"><div class="big">${r.icon}</div><div><b>${name}</b><div>${does}</div></div><button class="go" data-reward="${r.id}" ${why ? 'disabled' : ''}>${why === 'have' ? t('reward.have') : `🌟 ${r.cost}`}</button></div>`;
  };
  openCard(l, 'rewards', `<h2>🎁 ${t('reward.title', { name: l.name })}</h2><p class="intro">${t('reward.intro', { name: l.name, n: l.points })}</p>
    <h3>${t('reward.kind.perk')}</h3>${REWARDS.filter((r) => r.kind === 'perk').map(row).join('')}
    <h3>${t('reward.kind.item')}</h3>${REWARDS.filter((r) => r.kind === 'item').map(row).join('')}
    <h3>${t('reward.kind.trait')}</h3>${REWARDS.filter((r) => r.kind === 'trait').map(row).join('')}
    <div class="actions"><button id="card-close">${t('ui.close')}</button></div>`);
  $('card-close').onclick = closeCard;
  for (const b of $('card').querySelectorAll('[data-reward]')) b.onclick = () => buyReward(l, rewardById(b.dataset.reward));
}
function buyReward(l, r) {
  if (!r || cantBuy(r, l)) return;
  if (r.kind === 'trait') return swapTrait(l, r);
  l.points -= r.cost;
  closeCard();
  if (r.kind === 'perk') {
    l.perks.push(r.perk);
    toast(t('reward.gotPerk', { name: l.name, perk: t(`perk.${r.perk}`) }));
    milestone(r.icon, 'diary.perk', { name: l.name, perk: `perk.${r.perk}` });
  } else {
    storage.push(r.item);
    toast(t('reward.boxed', { name: l.name, item: t(`shop.${r.item}`) }));
  }
  save();
}
// A new trait: which one goes, then which one comes (one that goes with the other two).
function swapTrait(l, r) {
  const ask = (html) => (($('card').innerHTML = html), $('card'));
  const el = ask(`<h2>🔄 ${t('reward.swap.title', { name: l.name })}</h2><p class="intro">${t('reward.swap.which')}</p>
    <div class="chips traits">${l.traits.map((id) => `<button data-out="${id}">${TRAITS[id].icon} ${t(`trait.${id}`)}</button>`).join('')}</div>
    <div class="actions"><button id="card-close">${t('ui.close')}</button></div>`);
  $('card-close').onclick = closeCard;
  for (const b of el.querySelectorAll('[data-out]'))
    b.onclick = () => {
      const keep = l.traits.filter((id) => id !== b.dataset.out);
      const can = TRAIT_IDS.filter((id) => id !== b.dataset.out && fits(keep, id));
      ask(`<h2>🔄 ${t('reward.swap.title', { name: l.name })}</h2><p class="intro">${t('reward.swap.for', { trait: t(`trait.${b.dataset.out}`) })}</p>
        <div class="chips traits">${can.map((id) => `<button data-in="${id}" title="${t(`trait.${id}.does`)}">${TRAITS[id].icon} ${t(`trait.${id}`)}</button>`).join('')}</div>
        <div class="actions"><button id="card-close">${t('ui.close')}</button></div>`);
      $('card-close').onclick = closeCard;
      for (const c of $('card').querySelectorAll('[data-in]'))
        c.onclick = () => {
          l.points -= r.cost;
          l.traits = l.traits.map((id) => (id === b.dataset.out ? c.dataset.in : id));
          closeCard();
          toast(t('reward.swapped', { name: l.name, was: t(`trait.${b.dataset.out}`), now: t(`trait.${c.dataset.in}`) }));
          milestone(TRAITS[c.dataset.in].icon, 'diary.trait', { name: l.name, trait: `trait.${c.dataset.in}` });
          save();
        };
    };
}
// ---- the life story (round 16, phase 2) ----
// The household's big moments, in order: how it began, dreams and their steps, a job, promotions, best friends, falling
// in love, a wedding, a baby, moving house, a party, a perk or a new trait. Saved (`diary`); the 📖 card reads it.
// `vars` as in a toast: a value with a dot in it is a key of its own ('goal.chef').
const diary = Array.isArray(saved?.diary) ? saved.diary.slice(-300) : [];
function milestone(icon, key, vars = {}) {
  diary.push({ at: Math.floor(minutes), icon, key, vars });
  if (diary.length > 300) diary.shift();
}
// The household's news that is a milestone (Life events, by key): its icon, and (optional) when it counts.
const MILESTONES = {
  'ui.job.taken': { icon: '💼' },
  'ui.job.promoted': { icon: '🎖️' },
  'ui.married': { icon: '💍' },
  'ui.baby.born': { icon: '👶' },
  'ui.movedIn': { icon: '🏠' },
  'ui.bond.friendship': { icon: '🤝', when: (v) => /goodFriends|bestFriends/.test(v.level) },
  'ui.bond.romance': { icon: '💕', when: (v) => /sweethearts|inLove/.test(v.level) },
  'ui.levelUp': { icon: '🔬', when: (v) => v.level % 3 === 0 }
};
const keyVars = (vars) => Object.fromEntries(Object.entries(vars ?? {}).map(([k, v]) => [k, typeof v === 'string' && v.includes('.') ? t(v) : v]));
// Round 16, phase 4.2: the street's notice board, the town's news (townlife.mjs), newest first.
function openNews() {
  if (card || placing) return;
  const rows = townLife.news.map((n, k) => `<div class="diary-row${k < townLife.unread ? ' new' : ''}"><span class="when">${t('ui.day.short', { day: n.day })}</span><span class="icon">${n.icon}</span><span>${newsText(n)}</span></div>`).join('');
  townLife.unread = 0;
  const job = skillsOn ? oddJobRow() : '';
  openCard(sel, 'news', `<h2>📰 ${t('news.title', { street: streetName() })}</h2>${job}${rows || `<p class="intro">${t(townLifeOn ? 'news.empty' : 'news.quiet')}</p>`}
    <div class="actions"><button id="card-close">${t('ui.close')}</button></div>`);
  $('card-close').onclick = closeCard;
  $('card').querySelector('[data-oddjob]')?.addEventListener('click', () => {
    sel.oddJob = household.side.oddJob.house;
    goVisit(household.side.oddJob.house);
  });
  save();
}
// Round 16, phase 5.2: today's odd job on the board, a neighbour's (one a day, whoever is at home to be helped), and
// the button to go and do it: greyed with why (handiness too low, done, nobody in).
function oddJobToday() {
  const side = household.side, day = Math.floor(minutes / 1440);
  if (side.oddJob?.day !== day) {
    const homes = livedIn().filter((id) => !owned(id));
    const jobs = EARNING.oddJob.jobs;
    side.oddJob = homes.length ? { day, house: homes[Math.floor(Math.random() * homes.length)], job: jobs[Math.floor(Math.random() * jobs.length)], done: false } : { day, house: null };
  }
  return side.oddJob;
}
function oddJobRow() {
  const job = oddJobToday();
  if (!job.house) return '';
  const host = residentsOf(job.house)[0], level = skillLevel(sel.skills.handiness ?? 0), v = visitState(job.house);
  const why = job.done ? t('earn.oddJob.done') : level < EARNING.oddJob.from ? t('earn.why.oddJob', { level: EARNING.oddJob.from }) : !v.ok ? t(`town.why.${v.why}`) : '';
  return `<div class="diary-row new"><span class="icon">🔨</span><span>${t('earn.oddJob.ask', { name: host?.name ?? '', house: houseTitle(job.house), job: t(`earn.job.${job.job}`), coins: EARNING.oddJob.pay(level) })}</span></div>
    <div class="actions"><button class="go" data-oddjob ${why ? 'disabled' : ''}>🔨 ${t('earn.oddJob.go', { name: sel.name })}${why ? ` <small>${why}</small>` : ''}</button></div>`;
}
function openDiary() {
  if (card || placing) return;
  const rows = [...diary].reverse().map((d) => `<div class="diary-row"><span class="when">${t('ui.day.short', { day: Math.floor(d.at / 1440) + 1 })} · ${hhmm(d.at)}</span><span class="icon">${d.icon}</span><span>${t(d.key, keyVars(d.vars))}</span></div>`).join('');
  openCard(sel, 'diary', `<h2>📖 ${t('diary.title', { names: lives.map((l) => l.name).join(', ') })}</h2>${rows || `<p class="intro">${t('diary.empty')}</p>`}
    <div class="actions"><button id="card-close">${t('ui.close')}</button></div>`);
  $('card-close').onclick = closeCard;
}
// ---- things happen (round 16, phase 3: events.mjs) ----
// Now and then a small event for the Sim you look after: a card with two or three choices, the dice, and what came of it
// put into what the game already has (moodlets, needs, bonds, coins, happy points, the tally, the life story, a guest, a
// party, a trip). Never while a card is open, at a work station, asleep, or on the way somewhere.
const placeKey = (p) => (p === home ? 'home' : p === park ? 'park' : p === office ? 'office' : p === street ? 'street' : p?.house ? 'house' : p?.work ?? null);
function weatherNow() {
  if (weatherForced) return weatherForced;
  if (!weatherOn) return 'sun';
  const day = Math.floor(minutes / 1440);
  if (weather?.day !== day) weather = { day, id: rollWeather(Math.random, calendarOn ? seasonById(seasonNow()).weather : null), told: false };
  return weather.id;
}
// Once a day, what the weather is (a toast), and how it looks: rain or snow outdoors, no ducks on the pond in the rain;
// the snowmen melt when the snow goes.
const weatherFx = weatherLook();
if (weatherFx) scene.add(weatherFx.group);
const ducks = park.moving.find((m) => m.kind === 'ducks')?.pond.ducks ?? [];
const snowmen = [];
function weatherTick() {
  const id = weatherNow();
  if (weatherOn && weather && !weather.told && (minutes % 1440) >= 6 * 60) (weather.told = true), toast(t('weather.today', { icon: WEATHER[id].icon, weather: t(`weather.${id}`) }));
  weatherFx?.set(WEATHER[id].look, view === park || (!!street && view === street));
  for (const m of ducks) m.visible = id !== 'rain';
  if (id !== 'snow') for (const s of snowmen.splice(0)) s.removeFromParent();
}
// ---- the calendar's day (round 16, phase 6; calendar.mjs) ----
// Each step (townTick): a new season recolours the garden and the park (dressing.mjs seasonLook, nothing new drawn),
// sets the planter's crop (life.mjs, `household.crop`), and is announced once.
let seasonShown = null;
function calendarTick() {
  if (!calendarOn) return;
  const d = dateNow();
  birthdaysTick(d);
  townEventsTick(d);
  weekendTick();
  if (d.season !== seasonShown) {
    seasonLook(d.season);
    household.crop = seasonById(d.season).crop;
    const first = seasonShown == null;
    seasonShown = d.season;
    const told = `${d.year}.${d.season}`;
    if (calendar.told !== told) {
      calendar.told = told;
      toast(t(first ? 'season.now' : 'season.new', { icon: seasonById(d.season).icon, season: t(`season.${d.season}`) }));
    }
  }
}
// The day's birthdays (6.2), once a day from BIRTHDAY.at: someone in the household's is told, and their friends bring
// presents; a townsperson's goes on the notice board. `calendar.day`: the last day done (a reload doesn't do it twice).
function birthdaysTick(d) {
  const day = Math.floor(minutes / 1440);
  if (calendar.day === day || (minutes % 1440) < BIRTHDAY.at * 60) return;
  calendar.day = day;
  for (const l of lives) if (birthdayOf(l) === d.yearDay) birthday(l);
  if (townLifeOn) for (const o of npcs()) if (!lives.includes(o) && birthdayOf(o) === d.yearDay) tellNews({ icon: '🎂', key: 'news.birthday', vars: { a: o.name }, who: [o.name] }, day + 1);
}
function birthday(l) {
  l.addMoodlet('birthday');
  toast(t('birthday.today', { name: l.name }));
  milestone('🎂', 'diary.birthday', { name: l.name });
  if (aimsOn) giveWant(l, 'birthdayCake');
  // Presents from their closest friends in the town, each one of their favourite things (likes.mjs), as a friend knows.
  const friends = npcs().filter((o) => !lives.includes(o) && (peekBond(l, o)?.friendship ?? 0) >= BIRTHDAY.friends)
    .sort((a, b) => peekBond(l, b).friendship - peekBond(l, a).friendship).slice(0, BIRTHDAY.most);
  for (const [k, o] of friends.entries()) {
    const kind = PRESENT_KINDS[(birthdayOf(l) + k) % PRESENT_KINDS.length];
    bondOf(l, o).friendship += BIRTHDAY.presentFriendship;
    l.addMoodlet('present');
    toast(l.likes ? t(`birthday.present.${kind}`, { a: o.name, b: l.name, thing: t(`like.${kind}.${l.likes[kind]}`) }) : t('birthday.present', { a: o.name, b: l.name }));
  }
  if (friends.length) milestone('🎁', 'diary.presents', { name: l.name, n: friends.length });
  window.__life.lastBirthday = { name: l.name, presents: friends.map((o) => o.name), at: minutes };
}
// The birthday cake (baked or bought: actions.mjs `bakeCake`, `orderCake`): whoever's birthday it is blows out the
// candles, once a birthday (`calendar.cake`: the year each one last had it).
function birthdayCake(by, how) {
  for (const l of lives.filter(birthdayToday)) {
    if (calendar.cake[l.name] === yearKey()) continue;
    calendar.cake[l.name] = yearKey();
    l.addMoodlet('birthdayCake');
    l.count('birthdayCake');
    milestone('🎂', `diary.cake.${how}`, { name: l.name, by: by.name });
    toast(t('birthday.candles', { name: l.name }));
  }
}
// ---- the town's events (round 16, phase 6.3; calendar.mjs TOWN_EVENTS) ----
// One a season. On the notice board TOWN_EVENT.ahead days before; on the morning, told, with a wish to go; its stalls
// up at its place (round the park's plaza, or along the street's far pavement) from a little before it opens until it
// closes, under bunting or fairy lights. While someone from the household is there, up to TOWN_EVENT.people of the
// town's people come (each to a stall first, then as they like); the rest of the town stays data. Going counts
// 'townEvent'; the show's contest gives a rosette, coins and happy points by how good they are at its skill (PRIZES).
// `calendar.events[id]`: the game day it was advertised for, the day it was told, who went and who entered (by day).
let fair = null, fairBusy = false; // the event up now: { e, place, items, decor, people }
const eventPlace = (e) => (e.place === 'street' ? street : park);
const evName = (e) => t(`townEvent.${e.id}`);
function stallSpots(e) {
  if (e.place === 'street') {
    const fr = street.street.fronts, mid = (fr[0].x + fr[fr.length - 1].x) / 2, z = -STREET_SIZE.d / 2 + 11.3;
    return [[mid - 5, z, Math.PI], [mid - 7.5, z, Math.PI], [mid + 6.5, z, Math.PI]];
  }
  return [113, 162, -45].map((a) => {
    const x = 3.8 * Math.cos((a * Math.PI) / 180), z = 3.8 * Math.sin((a * Math.PI) / 180);
    return [x, z, Math.atan2(-x, -z)];
  });
}
function decorLine(e) {
  if (e.place === 'street') {
    const fr = street.street.fronts, mid = (fr[0].x + fr[fr.length - 1].x) / 2, z = -STREET_SIZE.d / 2 + 12.7;
    return [-12, -6, 0, 6, 12].map((dx) => [mid + dx, z]);
  }
  return [67.5, 112.5, 157.5, 247.5, 292.5, 337.5, 67.5].map((a) => [5 * Math.cos((a * Math.PI) / 180), 5 * Math.sin((a * Math.PI) / 180)]);
}
function townEventsTick(d) {
  const hour = (minutes % 1440) / 60, day = Math.floor(minutes / 1440);
  if (hour >= BIRTHDAY.at)
    for (const e of TOWN_EVENTS) {
      const until = (yearDayOf(e.season, e.day) - d.yearDay + YEAR_DAYS) % YEAR_DAYS, st = (calendar.events[e.id] ??= {});
      if (until < 1 || until > TOWN_EVENT.ahead || st.advertised === day + until) continue;
      st.advertised = day + until;
      const news = { icon: e.icon, key: 'news.townEvent', vars: { event: `townEvent.${e.id}`, where: `townEvent.where.${e.place}`, when: t(until === 1 ? 'townEvent.tomorrow' : 'townEvent.inDays', { n: until, day: t(`day.${weekday(minutes + until * 1440)}`) }), from: hhmm(e.hours[0] * 60) }, who: [] };
      if (townLifeOn) tellNews(news, day + 1);
      else toast(`📰 ${newsText(news)}`);
    }
  const e = townEventOn(d), st = e && (calendar.events[e.id] ??= {});
  if (e && st.told !== day && hour >= BIRTHDAY.at) {
    st.told = day;
    toast(t('townEvent.today', { icon: e.icon, event: evName(e), where: t(`townEvent.where.${e.place}`), from: hhmm(e.hours[0] * 60), to: hhmm(e.hours[1] * 60) }));
    if (aimsOn) for (const l of lives) giveWant(l, 'townEvent');
  }
  const up = !!e && hour >= e.hours[0] - TOWN_EVENT.before && hour < e.hours[1];
  if (up && !fair && !fairBusy) setUpFair(e);
  else if (!up && fair) takeDownFair();
  else if (fair && eventOpen(fair.e, hour)) fairPeople(day);
}
async function setUpFair(e) {
  fairBusy = true;
  const place = eventPlace(e), spots = stallSpots(e);
  const items = await place.add(e.stalls.map((kind, k) => [stallModel(kind), spots[k][0], spots[k][1], spots[k][2], 2.33, { act: 'interact', label: t(`townEvent.stall.${kind}`), offers: `stall_${kind}`, stall: kind }]));
  const decor = eventDecor(e.decor, decorLine(e));
  place.group.add(decor);
  fair = { e, place, items, decor, people: [] };
  fairBusy = false;
}
function takeDownFair() {
  const { e, place, items, decor } = fair;
  for (const l of everyone) {
    if (items.includes(l.doing?.item)) l.stop('away');
    l.queue = l.queue.filter((q) => !items.includes(q.item));
  }
  for (const o of fair.people) if (o.present && o.place === place && !lives.includes(o)) vanish(o);
  for (const it of items) place.remove(it);
  decor.removeFromParent();
  if (lives.some((l) => l.present && l.place === place)) toast(t('townEvent.over', { icon: e.icon, event: evName(e) }));
  fair = null;
}
// While it's open: the town's people there while someone from the household is (and gone when they go), and going counts.
function fairPeople(day) {
  const { e, place, items } = fair, st = calendar.events[e.id];
  const here = lives.filter((l) => l.present && l.place === place);
  for (const l of here) {
    st.went ??= {};
    if (st.went[l.name] === day) continue;
    st.went[l.name] = day;
    l.count('townEvent');
    l.addMoodlet('townEvent');
    milestone(e.icon, 'diary.townEvent', { name: l.name, event: evName(e) });
  }
  const free = (o) => !lives.includes(o) && !o.carer && !o.shift && !workDayNow(o) && !guests.some((g) => g.life === o) && (!o.present || o.place === place);
  const want = here.length ? npcs().filter(free).sort((a, b) => ((a.who * 7 + day) % 13) - ((b.who * 7 + day) % 13)).slice(0, TOWN_EVENT.people) : [];
  for (const o of fair.people) if (!want.includes(o) && o.present && o.place === place) vanish(o);
  for (const [k, o] of want.entries()) {
    if (o.present && o.place === place) continue;
    appear(o, place, false);
    const item = items[k % items.length], [x, z] = [item.obj?.position.x ?? 0, item.obj?.position.z ?? 0];
    const v = new THREE.Vector3(x * 0.6 + (Math.random() - 0.5) * 2, 0, z * (e.place === 'street' ? 1 : 0.6) - (e.place === 'street' ? 1.5 : 0) + (Math.random() - 0.5) * 2);
    if (place.grid.free(v)) o.sim.position.copy(v);
    const offer = offersFor(item).find((x) => x.free !== false && !x.cost);
    if (offer) o.queue.push({ offer, item, by: 'self' });
  }
  if (want.length && !fair.people.length) toast(t('townEvent.crowd', { icon: e.icon, event: evName(e) }));
  fair.people = want;
}
// The show's contest (a skill's): once a Sim a day; a rosette, coins and happy points by how good they are.
function enterContest(l) {
  if (!fair) return;
  const e = fair.e, st = calendar.events[e.id], day = Math.floor(minutes / 1440), contest = t(`townEvent.contest.${e.id}`);
  st.entered ??= {};
  if (st.entered[l.name] === day) return toast(t('townEvent.contest.again', { name: l.name, contest }));
  st.entered[l.name] = day;
  const place = contestPlace(skillLevel(l.skills[e.contest] ?? 0), Math.random);
  window.__life.lastContest = { name: l.name, event: e.id, skill: e.contest, place };
  if (!place) return toast(t('townEvent.contest.none', { name: l.name, contest, skill: t(`skill.${e.contest}`) }));
  const coins = PRIZES.coins[place - 1];
  household.money += coins;
  if (aimsOn) l.points += PRIZES.points[place - 1];
  l.addMoodlet('rosette');
  milestone('🏅', 'diary.rosette', { name: l.name, place: t(`townEvent.place.${place}`), contest, event: evName(e) });
  toast(t('townEvent.contest.won', { name: l.name, place: t(`townEvent.place.${place}`), contest, coins }));
}
// ---- weekends (round 16, phase 6.4; calendar.mjs WEEKEND) ----
// Saturday and Sunday, for whoever isn't working that day (a career's own days: work.mjs, the café and the vet work
// Saturdays): a lie-in, free will keener on naps, the telly, reading, cooking and dancing (and less on study), an
// outing in the late morning (the park, or round to a friend's), and the phone and the door busier (events.mjs).
// The market and the kick-about in the park come up only then (events.mjs `days`).
const worksToday = (l) => !!l.job && careerOf(l.job).days.includes(weekday(minutes));
const offToday = (l) => weekendNow() && !worksToday(l);
// How much keener free will is on an offer now: the season's (calendar.mjs SEASONS `lean`), and the weekend's.
function leanOf(l, id, hour) {
  const k = seasonById(seasonNow()).lean[id] ?? 1;
  return offToday(l) ? k * (WEEKEND.lean[id] ?? 1) : k;
}
// Asleep until WEEKEND.lieIn o'clock (Life: the night's sleep doesn't end before then, rested or not).
function lieInNow(l) {
  return offToday(l) && (minutes % 1440) < WEEKEND.lieIn * 60;
}
// The weekend's outing, once a weekend day at WEEKEND.outing.at: each one at home with free will on and nothing asked of
// them may fancy the park, or a friend's (one they are Friends with who is in).
function weekendTick() {
  const day = Math.floor(minutes / 1440), hour = (minutes % 1440) / 60;
  if (!weekendNow() || calendar.outing === day || hour < WEEKEND.outing.at || hour >= WEEKEND.outing.at + 2) return;
  calendar.outing = day;
  const wd = t(`day.${weekday(minutes)}`);
  for (const l of lives) {
    if (!l.freeWill || !l.present || l.place !== home || worksToday(l) || l.card || l.doing?.by === 'you' || l.queue.some((q) => q.by === 'you') || l.doing?.offer.act === 'sleep') continue;
    const r = Math.random();
    if (r < WEEKEND.outing.park) {
      l.queue.push({ offer: offerById('Door_1', 'goPark'), by: 'self' });
      toast(t('weekend.park', { name: l.name, day: wd }));
    } else if (r < WEEKEND.outing.park + WEEKEND.outing.visit) {
      const f = npcs().filter((o) => !lives.includes(o) && o.house && (peekBond(l, o)?.friendship ?? 0) >= WEEKEND.outing.friends && homeNow(o)).sort((a, b) => peekBond(l, b).friendship - peekBond(l, a).friendship)[0];
      if (!f) continue;
      housePlace(f.house).then(() => l.queue.push({ offer: goTo(f.house), by: 'self' }));
      toast(t('weekend.visit', { name: l.name, other: f.name, day: wd }));
    }
    window.__life.lastOuting = { name: l.name, r, day };
  }
}
// A snowman where they built it (the park's `buildSnowman`), three at most.
function buildSnowman(l) {
  if (l.place !== park || weatherNow() !== 'snow') return;
  const s = snowman();
  s.position.copy(l.sim.position).add(new THREE.Vector3(0, 0, 0.75).applyQuaternion(l.sim.group.quaternion)).setY(0);
  s.rotation.y = l.sim.group.rotation.y + Math.PI;
  park.group.add(s);
  snowmen.push(s);
  if (snowmen.length > 3) snowmen.shift().removeFromParent();
}
const mateOf = (l) => lives.find((o) => o !== l && !o.carer && o.present && o.place === l.place) ?? null;
function eventCtx(l) {
  const f = factsOf(l);
  return {
    place: placeKey(l.place), hour: (minutes % 1440) / 60, day: Math.floor(minutes / 1440), weekday: weekday(minutes), weather: weatherNow(), season: seasonNow(), weekend: weekendNow(),
    traits: l.traits, likes: l.likes, goal: l.goal?.id ?? null, money: household.money, job: f.job, friends: f.friends, romance: f.romance,
    babies: f.babies, has: f.has, mate: mateOf(l)?.name ?? null, seen: deck.seen
  };
}
// The town's people an event can be about, and how they stand with `l`.
const eventPeople = (l) =>
  npcs().filter((o) => !lives.includes(o) && !o.carer).map((o) => ({
    life: o, friendship: peekBond(l, o)?.friendship ?? 0, romance: peekBond(l, o)?.romance ?? 0, traits: o.traits, neighbour: neighbours.includes(o), colleague: colleagues.includes(o),
    free: !o.shift && !workDayNow(o) && !guests.some((g) => g.life === o),
    // Round 16, phase 6.2: with the calendar on, a birthday party or cake at work is on their birthday only.
    birthday: calendarOn ? birthdayToday(o) : undefined,
    house: !!o.house && HOUSES.some((h) => h.id === o.house && h.kind === 'lived')
  }));
// Round 16, phase 3: why an offer isn't there now (a key for the menu's note), or null: in a power cut at home, the telly
// and the oven.
function offerWhy(l, offer) {
  if (deck.powerOff > minutes && l.place === home && POWER_CUT.off.includes(offer.id)) return 'event.powerOff';
  // Round 16, phase 3.4: the weather's (no ducks to feed in the rain).
  const w = weatherNow();
  if (WEATHER[w].off.includes(offer.id)) return `weather.${w}.off`;
  // Round 16, phase 5.4: one pet a household.
  if (offer.id === 'adoptPet' && pets.length >= MAX_PETS) return 'pet.have';
  // Round 16, phase 5.2: no paintings to sell yet, the vegetables not ripe, not good enough at music to busk.
  if (offer.earn && household.side && lives.includes(l)) return earnWhy(offer, household.side, levelsOf(l.skills, skillLevel));
  return null;
}
// An offer only in one weather (actions.mjs `weather`: a snowman) isn't there at all in another.
const inWeather = (offer) => !offer.weather || offer.weather === weatherNow();
// What isn't on offer now, by id (wishes for them don't come up).
const offNow = () => [...WEATHER[weatherNow()].off, ...(deck.powerOff > minutes ? POWER_CUT.off : [])];
const eventFree = (l) => l.present && !l.card && !l.doing?.offer.task && l.doing?.offer.act !== 'sleep' && l.doing?.offer.act !== 'travel';
function eventsTick() {
  if (!eventsOn || !colleaguesIn || card || placing || moving || !eventFree(sel)) return;
  if (forcedEvent && neighboursIn) {
    const e = eventById(forcedEvent);
    forcedEvent = null;
    if (e) return openEvent(e, pickWho(e, eventPeople(sel)));
  }
  if (deck.powerOff && minutes >= deck.powerOff) (deck.powerOff = 0), toast(t('event.powerBack'));
  const day = Math.floor(minutes / 1440);
  if (deck.day !== day) Object.assign(deck, { day, today: 0 });
  deck.next ??= minutes + 60;
  if (minutes < deck.next) return;
  deck.next = minutes + DECK.every;
  const m = minutes % 1440;
  if (m < DECK.from || m >= DECK.to || deck.today >= DECK.most || minutes - (deck.last ?? -1e9) < DECK.gap) return;
  // The chance a look brings one: `perDay` over the looks in a day that aren't in the gap after one.
  // Round 16, phase 6.4: a few more at the weekend (events.mjs DECK `weekend`).
  const perDay = DECK.perDay * (weekendNow() ? DECK.weekend.perDay : 1);
  if (Math.random() >= perDay / ((DECK.to - DECK.from - perDay * DECK.gap) / DECK.every)) return;
  const got = pickEvent(eventCtx(sel), eventPeople(sel));
  if (got) openEvent(got.event, got.who);
}
// The card. `who`: the person it is about (or null).
function openEvent(e, who = null, l = sel) {
  const day = Math.floor(minutes / 1440);
  if (deck.day !== day) Object.assign(deck, { day, today: 0 });
  deck.seen[e.id] = day;
  deck.today++;
  deck.last = minutes;
  const c = eventCtx(l), mate = mateOf(l);
  const vars = { name: l.name, who: who?.name ?? '', mate: mate?.name ?? '', house: who?.house ? houseTitle(who.house) : '' };
  const head = e.kind === 'call' ? `📞 ${t('event.ringing', vars)}` : e.kind === 'knock' ? `🚪 ${t('event.knock', vars)}` : '';
  const shown = e.choices.filter((ch) => !ch.when || ch.when(c));
  const buttons = shown
    .map((ch, i) => {
      const short = ch.cost && household.money < ch.cost;
      // Round 16, phase 5.4: keeping the cat, with pets on (and no pet yet).
      const later = ch.later && !(ch.pets && skillsOn);
      const full = ch.pets && skillsOn && pets.length >= MAX_PETS;
      return `<button data-i="${i}" ${short || later || full ? 'disabled' : ''}>${ch.icon} ${t(`event.${e.id}.${ch.id}`, vars)}${ch.cost ? ` <span class="cost">${t('ui.cost', { cost: ch.cost })}</span>` : ''}${later ? ` <small>${t('event.later')}</small>` : full ? ` <small>${t('pet.have')}</small>` : ''}</button>`;
    })
    .join('');
  openCard(l, 'event', `<h2>${e.icon} ${t(`event.${e.id}`, vars)}</h2>${head ? `<p class="ring">${head}</p>` : ''}<p class="intro">${t(`event.${e.id}.text`, vars)}</p><div class="choices">${buttons}</div>`);
  for (const b of $('card').querySelectorAll('.choices button'))
    b.onclick = () => {
      const ch = shown[b.dataset.i];
      if (ch.cost) household.money -= ch.cost;
      const { result, out } = outcomeOf(ch, l.kit, Math.random, skillsOn ? levelsOf(l.skills, skillLevel) : {});
      const bits = eventOutcome(l, e, who, mate, out);
      // Round 16, phase 5: a try at fixing something teaches handiness (more when it works).
      if (skillsOn && ch.skill) for (const id of Object.keys(ch.skill)) l.learn(id, FIXING.learn[result === 'good' ? 'good' : 'bad']);
      $('card').querySelector('.choices').outerHTML = `<div class="result ${result === 'bad' ? 'no' : 'yes'}"><b>${t(`event.${e.id}.${ch.id}.${result}`, vars)}</b>${bits.length ? `<div class="bits">${bits.join(' · ')}</div>` : ''}</div>
        <div class="actions"><button id="card-close" class="go">${t('event.ok')}</button></div>`;
      $('card-close').onclick = closeCard;
      window.__life.lastEvent = { id: e.id, choice: ch.id, result, who: who?.name ?? null };
    };
}
// Friendship (and romance) between two, with the toast when it reaches a new level (Life's, for the life story too).
function befriend(a, b, friendship = 0, romance = 0) {
  const bond = bondOf(a, b);
  const was = { friendship: friendshipLevel(bond).id, romance: romanceLevel(bond).id };
  bond.friendship = Math.max(-100, Math.min(100, bond.friendship + friendship));
  bond.romance = Math.max(0, Math.min(100, bond.romance + romance));
  for (const kind of ['friendship', 'romance']) {
    const now = (kind === 'friendship' ? friendshipLevel : romanceLevel)(bond).id;
    if (now !== was[kind]) a.events.push({ key: `ui.bond.${kind}`, vars: { a: a.name, b: b.name, level: `${kind}.${now}` } });
  }
}
// What came of a choice; returns what to say under it ("+20 🪙 · 🍰 Cake").
function eventOutcome(l, e, who, mate, out) {
  const bits = [];
  if (out.money) {
    household.money = Math.max(0, household.money + out.money);
    bits.push(`${out.money > 0 ? '+' : ''}${out.money} 🪙`);
  }
  for (const [k, v] of Object.entries(out.needs ?? {})) l.needs[k] = Math.max(0, Math.min(100, l.needs[k] + v));
  if (out.moodlet) {
    l.addMoodlet(out.moodlet);
    bits.push(`${MOODLETS[out.moodlet].icon} ${t(`moodlet.${out.moodlet}`)}`);
  }
  if (out.whoMoodlet && who) who.addMoodlet(out.whoMoodlet);
  if (out.mateMoodlet && mate) mate.addMoodlet(out.mateMoodlet);
  if (who && (out.friendship || out.romance)) {
    befriend(l, who, out.friendship ?? 0, out.romance ?? 0);
    bits.push(`${out.romance ? '💗' : '🤝'} ${who.name} ${out.friendship >= 0 || out.romance ? '+' : ''}${(out.friendship ?? 0) + (out.romance ?? 0)}`);
  }
  if (mate && (out.mateFriendship || out.mateRomance)) {
    befriend(l, mate, out.mateFriendship ?? 0, out.mateRomance ?? 0);
    bits.push(`${out.mateRomance ? '💗' : '🤝'} ${mate.name}`);
  }
  if (out.points && aimsOn) {
    l.points += out.points;
    bits.push(`+${out.points} 🌟`);
  }
  if (out.count) l.count(out.count);
  if (out.adopt && skillsOn) adoptPet(out.adopt);
  if (out.diary) milestone(e.icon, `event.${e.id}.diary`, { name: l.name, who: who?.name ?? '' });
  if (out.invite && who && inviteOver(who, true)) guests.at(-1).comesAt = minutes;
  if (out.party && who?.house) deck.party = { id: who.house, day: Math.floor(minutes / 1440) };
  if (out.date && who) l.planDate(who);
  if (out.powerCut) deck.powerOff = minutes + out.powerCut;
  // Off somewhere (on the to-do list: they go when the card is closed). A house is built first, the first time.
  if (out.go === 'park' && l.place !== park) l.command(offerById('Door_1', 'goPark'));
  if (out.go === 'whoHouse' && who?.house && l.place !== places[who.house]) loadNeighbours().then(() => housePlace(who.house)).then(() => l.command(goTo(who.house)));
  return bits;
}

function renderPanels() {
  $('clock').textContent = (weatherOn ? `${clockText()} · ${WEATHER[weatherNow()].icon}` : clockText()) + (calendarOn ? ` · ${dateText()}` : '');
  renderAims();
  $('money').textContent = t('ui.coins', { n: household.money });
  renderJob();
  renderSelf();
  renderPlaces();
  for (const n of NEEDS) {
    const v = sel.needs[n.id];
    Object.assign($(`need-${n.id}`).style, { width: `${v}%`, backgroundColor: barColour(v) });
  }
  const emo = sel.mood.emotion;
  $('mood').innerHTML = `<span class="face">${EMOTIONS[emo].icon}</span><span>${t(`emotion.${emo}`)}</span>`;
  $('moodlets').innerHTML = sel.moodlets
    .map((id) => {
      const m = MOODLETS[id];
      const left = sel.timed.get(id);
      const time = left ? `<small>${left >= 60 ? `${Math.round(left / 60)} h` : `${Math.ceil(left)} min`}</small>` : '';
      return `<span class="moodlet ${m.emotion === 'happy' ? '' : 'bad'}" title="${t(`moodlet.${id}.text`)}">${m.icon} ${t(`moodlet.${id}`)} ${time}</span>`;
    })
    .join('');
  // Science always (the bookshelf); the others once they have begun.
  $('skills').innerHTML = Object.keys(SKILL_ICONS)
    .filter((id) => id === 'science' || sel.skills[id] > 0)
    .map((id) => {
      const v = sel.skills[id] ?? 0, lvl = skillLevel(v);
      const into = lvl >= 10 ? 1 : (v - SKILL_LEVELS[lvl]) / (SKILL_LEVELS[lvl + 1] - SKILL_LEVELS[lvl]);
      return `<div class="skill" data-skill="${id}"><span>${SKILL_ICONS[id]}</span><span>${t(`skill.${id}`)}</span><b>${lvl}</b><div class="bar"><i style="width:${into * 100}%"></i></div></div>`;
    })
    .join('') + (household.side && (household.side.paintings.length || household.side.veg || household.side.earned) ? `<div class="traitline">${t('earn.panel', { n: household.side.paintings.length, veg: Math.round(household.side.veg), coins: household.side.earned })}</div>` : '');
  const plan = sel.plan;
  $('todo').innerHTML = plan.length
    ? plan
        .map((e, i) => {
          const progress = e.now && e.started && Number.isFinite(e.length ?? e.offer.minutes) ? `<div class="progress"><i style="width:${Math.min(100, (e.minutes / (e.length ?? e.offer.minutes)) * 100)}%"></i></div>` : '';
          return `<div class="task ${e.now ? 'now' : ''}" data-i="${e.now ? -1 : i - (plan[0].now ? 1 : 0)}" title="${t('ui.queue.cancel')}">${e.icon}<small>${t(`action.${e.offer.id}`)}</small>${e.other ? `<span class="with">${e.other.name}</span>` : ''}${e.by === 'self' || e.by === 'partner' ? '<span class="by">💭</span>' : ''}${e.by === 'job' ? '<span class="by">🔒</span>' : ''}${progress}</div>`;
        })
        .join('')
    : `<div class="empty">${t('ui.queue.empty')}</div>`;
  for (const el of $('todo').querySelectorAll('.task')) el.onclick = () => sel.cancel(Number(el.dataset.i));
}

// The Job panel: the job, its pay and hours, the promotion bar; at work, the stations (Among Us's task list: each with
// how many times it was done today; click one to go and do it) and what today has earned.
function renderJob() {
  const job = sel.job;
  if (!job) {
    $('job').innerHTML = `<div class="none">${t('ui.job.none')}</div><p>${t('ui.job.none.hint')}</p>`;
    return;
  }
  const c = careerOf(job), lvl = levelOfJob(job), next = nextLevel(job);
  const when = sel.shift ? t('ui.job.atWork', { time: hhmm(sel.shift.endsAt) }) : t('ui.job.next', { weekday: t(`day.${nextWorkDay(job)}`), time: hhmm(c.leave) });
  const promo = next ? `<div class="promo"><span>${t('ui.job.promotion')}</span><div class="bar"><i style="width:${job.performance}%"></i></div></div>` : `<div class="note">${t('ui.job.top')}</div>`;
  const stations = sel.shift
    ? `<div class="stations"><div class="line">${t('ui.job.today', { right: sel.today.right, coins: sel.today.coins })}</div>${STATIONS.filter((s) => stationsOf(job, STATIONS.map((x) => x.id)).includes(s.id)).map((s) => {
        const n = sel.today.tasks[s.id] ?? 0;
        return `<button data-station="${s.id}" class="${n ? 'done' : ''}">${s.icon} ${t(`subject.${s.id}`)}${n ? ` <b>✓${n > 1 ? n : ''}</b>` : ''}</button>`;
      }).join('')}</div>`
    : `<p class="hint">${t('ui.job.tasksHint')}</p>`;
  $('job').innerHTML = `<div class="title">${c.icon} <b>${t(`job.${job.career}.${lvl.id}`)}</b></div>
    <div class="line">${t('ui.job.pay', { pay: lvl.pay })} · ${t('ui.job.hours', { from: hhmm(c.starts), to: hhmm(c.ends), days: daysWords(job.career) })}</div>
    <div class="line">${when}</div>${promo}${stations}
    ${sel.shift || sel.doing?.by === 'job' ? '' : `<button class="quit" id="quit-job">${t('ui.job.quitButton')}</button>`}`;
  for (const b of $('job').querySelectorAll('[data-station]'))
    b.onclick = () => {
      const item = workOf(sel).items.find((i) => i.use?.station === b.dataset.station);
      sel.command(offersFor(item)[0], item);
    };
  if ($('quit-job')) $('quit-job').onclick = () => sel.quitJob();
}
// The next day they go in: today if it is a work day and they haven't gone yet.
function nextWorkDay(job) {
  const c = careerOf(job), today = Math.floor(minutes / 1440);
  for (let k = 0; k < 8; k++) {
    const day = today + k;
    if (c.days.includes(day % 7) && !(k === 0 && (job.lastDay === day || minutes % 1440 >= c.ends - 30))) return day % 7;
  }
  return c.days[0];
}

// ---- cards: the jobs going, and a work station's questions ----
// The game waits while a card is open (no clock on a question: time pressure puts young players off), and goes on at the
// speed it was at when the card is closed.
let card = null; // { life, kind, speed }
function openCard(life, kind, html) {
  card = { life, kind, speed: card?.speed ?? speed };
  setSpeed(0);
  $('card').innerHTML = html;
  $('card').hidden = false;
  $('card-back').hidden = false;
}
function closeCard() {
  if (!card) return;
  $('card').hidden = $('card-back').hidden = true;
  setSpeed(card.speed);
  card = null;
}
function openJobs(life) {
  life.card = null;
  const rows = Object.entries(CAREERS)
    .filter(([, c]) => !c.skills || skillsOn)
    .map(([id, c]) => {
      const lvl = c.levels[0];
      return `<div class="offer"><div class="big">${c.icon}</div><div><b>${t('ui.card.jobs.offer', { job: t(`job.${id}.${lvl.id}`), place: t(`job.${id}.place`) })}</b>
        <div>${t('ui.job.pay', { pay: lvl.pay })} · ${t('ui.job.hours', { from: hhmm(c.starts), to: hhmm(c.ends), days: daysWords(id) })}</div></div>
        <button class="go" data-career="${id}">${t('ui.card.take')}</button></div>`;
    })
    .join('');
  openCard(life, 'jobs', `<h2>${t('ui.card.jobs.title')}</h2>${rows}<div class="actions"><button id="card-close">${t('ui.card.notNow')}</button></div>`);
  for (const b of $('card').querySelectorAll('[data-career]'))
    b.onclick = () => {
      life.takeJob(b.dataset.career);
      if (workPlaceOf(life.job) === 'office') giveDesk(life);
      else careerPlace(workPlaceOf(life.job));
      closeCard();
    };
  $('card-close').onclick = closeCard;
}

// A work station (round 9). The brief, 10-29: "let the kids choose what they want to practise, and make the menu level
// based like CE2 / 6eme for each player, and within that the sub topics". The station is the subject; the card asks
// the level (each Sim keeps their own, so each player can have theirs) and the topic, then TASK.questions questions in a
// row. A right answer pays at once; a wrong one shows the right answer and why, and costs nothing.
const yearOf = (l) => l.year ?? year;
function openStation(life) {
  const station = life.card.station;
  const s = STATIONS.find((x) => x.id === station);
  const head = `<h2>${s.icon} ${stationName(life.job?.career, station)}</h2><p class="intro">${t(`subject.${station}`)} · ${stationJob(life.job?.career, station)}</p>`;
  let round = { right: 0, asked: 0 };
  const done = (more) => {
    life.taskDone(station, round.right, round.asked, more);
    round = { right: 0, asked: 0 };
  };
  const choose = () => {
    const y = yearOf(life);
    const topics = topicsFor(station, y);
    const levels = YEARS.map((v) => `<button data-year="${v}" class="${v === y ? 'on' : ''}">${v}</button>`).join('');
    const rows = [`<button data-topic="" class="mix">🎲 ${t('ui.card.station.mix')}</button>`, ...topics.map((tp) => `<button data-topic="${tp.id}">${tp.name}${tp.above ? ` <small>${t('ui.card.station.from', { year: tp.from })}</small>` : ''}</button>`)].join('');
    openCard(life, 'station', `${head}<div class="levels"><span>${t('ui.card.station.level')}</span>${levels}</div>
      <p class="what">${t('ui.card.station.what', { name: life.name })}</p><div class="topics">${rows}</div>
      <div class="actions"><button id="card-close">${t('ui.card.notNow')}</button></div>`);
    for (const b of $('card').querySelectorAll('[data-year]'))
      b.onclick = () => {
        life.year = b.dataset.year;
        if (life === sel) renderYear();
        choose();
      };
    for (const b of $('card').querySelectorAll('[data-topic]')) b.onclick = () => question(b.dataset.topic || null, 1);
    $('card-close').onclick = () => (done(false), closeCard());
  };
  const question = (topic, n) => {
    const q = (life.question = ask({ subject: station, topic, year: yearOf(life) }));
    openCard(life, 'station', `${head}<p class="count">${t('ui.card.station.count', { n, of: TASK.questions })}</p>
      <p class="question">${q.prompt}</p><div class="answers">${q.choices.map((c, i) => `<button data-i="${i}">${c}</button>`).join('')}</div>
      <p class="calm">${t('ui.card.station.calm')}</p>`);
    for (const b of $('card').querySelectorAll('.answers button'))
      b.onclick = () => {
        const right = Number(b.dataset.i) === q.answer;
        for (const x of $('card').querySelectorAll('.answers button')) {
          x.disabled = true;
          if (Number(x.dataset.i) === q.answer) x.classList.add('right');
          else if (x === b) x.classList.add('wrong');
        }
        record(q, right);
        const coins = life.taskAnswer(station, right);
        round.asked++;
        round.right += right ? 1 : 0;
        life.question = { ...q, chose: Number(b.dataset.i), right };
        const last = n >= TASK.questions;
        $('card').querySelector('.calm').outerHTML = `<div class="result ${right ? 'yes' : 'no'}"><b>${right ? `🎉 ${t('ui.card.station.right', { coins })}` : t('ui.card.station.wrong', { answer: q.choices[q.answer] })}</b> ${q.explain ?? ''}</div>
          <div class="actions"><button id="card-next" class="go">${last ? t('ui.card.station.done') : t('ui.card.station.next')}</button></div>`;
        $('card-next').onclick = () => (last ? summary(topic) : question(topic, n + 1));
      };
  };
  const summary = (topic) => {
    const { right, asked } = round;
    const coins = right * TASK.pay(life.job?.level ?? 0);
    openCard(life, 'station', `${head}<div class="result ${right * 3 >= asked * 2 ? 'yes' : 'no'}"><b>${right === asked ? '🌟 ' : ''}${t('ui.card.station.done')}</b> ${t('ui.card.station.summary', { right, of: asked, coins })}</div>
      <div class="actions"><button id="card-again">${t('ui.card.station.again')}</button><button id="card-close" class="go">${t('ui.card.station.finish')}</button></div>`);
    $('card-again').onclick = () => (done(true), question(topic, 1));
    $('card-close').onclick = () => (done(false), closeCard());
  };
  choose();
}
// A card someone is owed: the jobs after looking on the phone; a station's questions when the Sim you look after gets
// there (someone else's waits until you look after them).
function renderCards() {
  if (card || placing) return;
  if (sel.card?.kind === 'station') return openStation(sel);
  if (sel.card === 'look') return openLook(sel);
  if (newBabies.length) return babyCard(newBabies.shift());
  if (newPets.length) return petCard(newPets.shift());
  for (const l of [sel, ...lives.filter((o) => o !== sel)]) if (l.card === 'pets') return openPets(l);
  if (careAsk) return careCard();
  for (const l of [sel, ...lives.filter((o) => o !== sel)]) if (l.card === 'jobs') return openJobs(l);
}

// The school year the questions are pitched at: ?year=, else the last one chosen on this device, else CE2. Each Sim can
// have their own (the station card, or this setting for the one you look after).
const stored = (() => {
  try {
    return localStorage.getItem('lifesim.year');
  } catch {
    return null;
  }
})();
let year = [params.get('year'), stored, DEFAULT_YEAR].find((y) => YEARS.includes(y));
// A new game: the year chosen on the create-a-Sim screen, remembered on this device.
if (start?.kind === 'new' && YEARS.includes(start.year)) {
  year = start.year;
  try {
    localStorage.setItem('lifesim.year', year);
  } catch {}
}
$('settings').innerHTML = `<h2>${t('ui.settings')}</h2><label class="setting"><span>${t('ui.year')}</span><select id="year">${YEARS.map((y) => `<option value="${y}">${t(`year.${y}`)}</option>`).join('')}</select></label>
  ${saving ? `<div class="saved" id="saved"></div><button id="new-game">✨ ${t('ui.start.new')}</button>` : ''}`;
function renderYear() {
  $('year').value = yearOf(sel);
}
renderYear();
$('year').onchange = () => {
  sel.year = $('year').value;
  if (sel === life) {
    year = sel.year;
    try {
      localStorage.setItem('lifesim.year', year);
    } catch {}
  }
};

// ---- saving (round 10, save.mjs) ----
// Every game hour, after anything bought, sold or changed, and when the page is put away. Not in a test's URL.
let savedAt = null;
function snapshot() {
  const beds = sleepers();
  return {
    minutes, money: household.money, childcare: household.childcare, year,
    lives: lives.map((l) => ({ ...lifeState(l), bed: beds.indexOf(l.home?.side ? l.home.twin : l.home), ...(l.home?.side ? { side: 1 } : {}) })),
    // Before they have loaded (the first save comes straight away), the ones the save had.
    colleagues: colleaguesIn ? colleagues.map((c) => ({ who: c.who, job: c.job && { ...c.job } })) : saved?.colleagues ?? [],
    bonds: allBonds(),
    // Round 14 (v2): everything in the home, where it is; the boxes; which home, and how big; the neighbours.
    furniture: furniture.map(({ item, ...e }) => e),
    // What was added (round 10's name; read by its check and by nothing else since v2).
    extras: extras().map(({ id, x, z, turn }) => ({ id, x, z, turn })),
    storage: [...storage],
    boxedBase: [...boxedBase],
    home: { ...homeState },
    // Round 16, phase 4 (v6): who lives where, which houses are for sale (and for how much), the newcomers' dreams,
    // and town life's own state. Before the neighbours have loaded, the ones the save had (as for the colleagues).
    town: {
      seed: TOWN.seed,
      neighbours: neighboursIn ? [...neighbours.map((n) => n.who), ...arriving.keys()] : saved?.town?.neighbours ?? [],
      homes: neighboursIn ? Object.fromEntries([...npcs().map((l) => [l.who, l.house]), ...[...arriving].map(([n, a]) => [n, a.house])]) : saved?.town?.homes ?? {},
      houses: HOUSES.map(({ id, kind, price, name }) => ({ id, kind, price, name })),
      dreams: { ...(saved?.town?.dreams ?? {}), ...Object.fromEntries(npcs().filter((l) => l.dream).map((l) => [l.who, l.dream])), ...Object.fromEntries([...arriving].map(([n, a]) => [n, a.dream])) },
      life: { ...townLife, arrived: { ...townLife.arrived }, babies: townLife.babies.map((b) => ({ ...b, parents: [...b.parents] })), news: townLife.news.map((n) => ({ ...n, vars: { ...n.vars }, who: [...n.who] })) }
    },
    story: story?.id ?? saved?.story ?? null,
    // Round 16, phase 2: the life story.
    diary: diary.slice(),
    // Round 16, phase 3: the event deck.
    deck: { ...deck, seen: { ...deck.seen } },
    weather: weather && { ...weather },
    // Round 16, phase 6 (v8): the calendar.
    calendar: structuredClone(calendar),
    // Round 16, phase 5 (v7): the side earnings.
    side: household.side && { ...household.side, paintings: [...household.side.paintings], oddJob: household.side.oddJob && { ...household.side.oddJob } },
    // Round 16: everyone else's traits, by person (the household's are in `lives`).
    traits: { ...(saved?.traits ?? {}), ...Object.fromEntries(npcs().map((l) => [l.who, [...(l.traits ?? [])]])), ...Object.fromEntries([...arriving].map(([n, a]) => [n, [...a.traits]])) },
    likes: { ...(saved?.likes ?? {}), ...Object.fromEntries(npcs().filter((l) => l.likes).map((l) => [l.who, { ...l.likes }])), ...Object.fromEntries([...arriving].map(([n, a]) => [n, { ...a.likes }])) },
    // Each baby, with the cot they lie in (its place in `furniture`).
    babies: babies.filter((b) => b.cot).map((b) => ({ ...b.saved(), cot: furniture.findIndex((e) => e.item === b.cot) })),
    // Round 16, phase 5.4 (v7): the pet, with its basket's place in `furniture`.
    pets: pets.filter((p) => p.bed && p.name).map((p) => ({ ...p.saved(), bed: furniture.findIndex((e) => e.item === p.bed) }))
  };
}
function save() {
  if (!saving) return false;
  const ok = writeSave(snapshot());
  if (ok) savedAt = minutes;
  if ($('saved')) $('saved').textContent = ok ? t('ui.saved', { when: clockText() }) : t('ui.saved.no');
  return ok;
}
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => document.hidden && save());
if ($('new-game'))
  $('new-game').onclick = () => {
    const names = lives.map((l) => l.name).join(', ');
    openCard(sel, 'newGame', `<h2>${t('ui.start.sure')}</h2><p class="intro">${t('ui.start.sureText', { names })}</p>
      <div class="actions"><button id="card-close">${t('ui.start.back')}</button><button class="go" id="new-yes">${t('ui.start.yes')}</button></div>`);
    $('card-close').onclick = closeCard;
    $('new-yes').onclick = () => {
      clearSave();
      removeEventListener('pagehide', save);
      location.href = location.pathname;
    };
  };

// ---- buying (round 10, shop.mjs) ----
// The buy menu is a card (the game waits); buying something picks it up: a see-through copy follows the pointer over
// the floor, green where it fits and red where it doesn't, ↻ turns it, a click puts it down and pays. Something bought
// can be moved or sold back for half (its menu).
let shopTab = 'sleep';
const beauty = () => furniture.reduce((sum, e) => sum + (e.item.beauty ?? 0), 0);
function openShop() {
  if (card || placing) return;
  const b = beauty();
  // Round 14: the boxes (what was put away) are a tab of their own while there is something in them.
  if (shopTab === 'boxes' && !storage.length) shopTab = 'sleep';
  const kinds = [...SHOP_KINDS, ...(storage.length ? ['boxes'] : [])];
  const tabs = kinds.map((k) => `<button data-kind="${k}" class="${k === shopTab ? 'on' : ''}">${k === 'boxes' ? `📦 ${t('shop.kind.boxes', { n: storage.length })}` : t(`shop.kind.${k}`)}</button>`).join('');
  const rows = shopTab === 'boxes'
    ? [...new Set(storage)].map((id) => {
        const s = kindOf(id), n = storage.filter((x) => x === id).length;
        return `<div class="offer"><div class="big">${s.icon}</div><div><b>${t(`shop.${id}`)}${n > 1 ? ` ×${n}` : ''}</b><div>${t(`shop.${id}.does`)}</div></div>
          <button class="go" data-unbox="${id}">${t('ui.shop.unbox')}</button></div>`;
      }).join('')
    : SHOP.filter((s) => s.kind === shopTab && (!s.skills || skillsOn))
    .map((s) => {
      const short = household.money < s.price;
      return `<div class="offer"><div class="big">${s.icon}</div><div><b>${t(`shop.${s.id}`)}</b><div>${t(`shop.${s.id}.does`)}${s.beauty ? ` · 🌸 ${t('ui.shop.lovely')}` : ''}</div></div>
        <button class="go" data-buy="${s.id}" ${short ? `disabled title="${t('ui.money.short', { name: sel.name, cost: s.price })}"` : ''}>${t('ui.cost', { cost: s.price })}</button></div>`;
    })
    .join('');
  openCard(sel, 'shop', `<h2>🛒 ${t('ui.shop.title')}</h2><p class="intro">${t('ui.shop.intro', { coins: household.money })}</p>
    <p class="lovely">🌸 ${t('ui.shop.howLovely')} <b>${'✿'.repeat(Math.min(b, 6))}${'·'.repeat(Math.max(0, 6 - b))}</b> ${b >= LOVELY ? t('ui.shop.lovelyYes') : t('ui.shop.lovelyNo', { n: LOVELY - b })}</p>
    <div class="tabs">${tabs}</div><div class="rows">${rows}</div><div class="actions"><button id="card-close">${t('ui.shop.done')}</button></div>`);
  for (const el of $('card').querySelectorAll('[data-kind]')) el.onclick = () => ((shopTab = el.dataset.kind), closeCard(), openShop());
  for (const el of $('card').querySelectorAll('[data-buy]')) el.onclick = () => startPlacing(shopItem(el.dataset.buy));
  for (const el of $('card').querySelectorAll('[data-unbox]')) el.onclick = () => startPlacing(kindOf(el.dataset.unbox), null, true);
  $('card-close').onclick = closeCard;
}
$('buy').textContent = `🛒 ${t('ui.shop.button')}`;
$('buy').onclick = openShop;

// ---- the town card (round 14): Sunny Lane, house by house. The game waits while it is open. ----
// Your home (and an extension), who lives in each house (and whether they're in, a party tonight, invited or not), the
// houses for sale (go and look round; buy), the park, a party at yours. "Go" sends the one you look after.
function openTown() {
  if (card || placing || moving) return;
  const who = sel, money = household.money;
  const busy = !!who.shift || who.doing?.by === 'job' || !who.present;
  const size = (n) => t('town.size', SIZES[n]);
  const row = (icon, title, note, buttons) => `<div class="offer"><div class="big">${icon}</div><div><b>${title}</b><div>${note}</div></div><div class="btns">${buttons}</div></div>`;
  const next = SIZES[homeState.size + 1], ext = EXTENSION[homeState.size + 1];
  const yourNo = homeState.id === 'flat' ? 1 : houseById(homeState.id).no;
  const rows = [
    row('🏠', t('town.yours', { no: yourNo, street: streetName() }), `${homeState.id === 'flat' ? t('town.flat') : houseName(houseById(homeState.id))} · ${size(homeState.size)}`,
      next ? `<button class="go" data-extend ${money < ext ? 'disabled' : ''}>🔨 ${t('town.extend', next)} <small>${t('ui.cost', { cost: ext })}</small></button>` : `<small>${t('town.biggest')}</small>`)
  ];
  for (const h of [...HOUSES].sort((a, b) => a.no - b.no)) {
    if (owned(h.id)) continue;
    const v = visitState(h.id), addr = `${h.no} ${streetName()}`;
    if (h.kind === 'sale') {
      const cost = buyCost(h.id);
      rows.push(row('🪧', `${houseName(h)} <small>${addr}</small>`, `${t('town.forSale')} · ${size(h.size)} · ${t('ui.cost', { cost: h.price })}${homeState.paid ? ` · ${t('town.trade', { cost: Math.max(0, cost) })}` : ''}`,
        `<button data-go="${h.id}" ${busy ? 'disabled' : ''}>👀 ${t('town.look')}</button><button class="go" data-buyhouse="${h.id}" ${money < cost ? `disabled title="${t('ui.money.short', { name: who.name, cost })}"` : ''}>🏡 ${t('town.buy')}</button>`));
      continue;
    }
    const living = residentsOf(h.id);
    const tots = babiesAt(h.id).map((b) => b.name);
    const people = living.map((l) => `${l.name} <small>(${t(`friendship.${friendshipLevel(bondOf(who, l)).id}`)}${l.job ? ` · ${t('ui.friend.colleague')}` : ''})</small>`).join(', ') + (tots.length ? ` 👶 <small>${t('town.babies', { names: tots.join(', ') })}</small>` : '');
    const party = partyToday() === h.id && (minutes % 1440) < PARTY.to
      ? ` · 🎉 ${t(partyAt(h.id) ? 'town.partyNow' : 'town.partyTonight', { from: hhmm(PARTY.from) })} ${invited(h.id) ? `✉️ ${t('town.invited')}` : `🙊 ${t('town.notInvited')}`}` : '';
    rows.push(row(partyAt(h.id) ? '🎉' : '🏡', `${houseTitle(h.id)} <small>${addr}</small>`, `${people || t('town.nobody')}${party} · ${t(`town.why.${v.why}`)}`,
      `<button class="go" data-go="${h.id}" ${v.ok && !busy ? '' : 'disabled'}>${partyAt(h.id) ? '🎉' : '🚶'} ${t('town.go')}</button>`));
  }
  rows.push(row('🌳', t('place.park'), t('town.park'), `<button data-park ${busy ? 'disabled' : ''}>🚶 ${t('town.go')}</button>`));
  const partyButton = homeParty ? `<small>🎉 ${t('town.partyOn')}</small>` : `<button data-party ${money < HOME_PARTY.cost || !awake(minutes) ? 'disabled' : ''}>🎉 ${t('town.throwParty')} <small>${t('ui.cost', { cost: HOME_PARTY.cost })}</small></button>`;
  openCard(who, 'town', `<h2>🗺️ ${streetName()}</h2><p class="intro">${t(busy ? 'town.introBusy' : 'town.intro', { name: who.name, coins: money })}</p>
    <div class="rows town">${rows.join('')}</div><div class="actions">${partyButton}<button id="card-close">${t('ui.shop.done')}</button></div>`);
  $('card-close').onclick = closeCard;
  for (const b of $('card').querySelectorAll('[data-go]')) b.onclick = () => goVisit(b.dataset.go);
  for (const b of $('card').querySelectorAll('[data-buyhouse]')) b.onclick = () => (closeCard(), openBuy(b.dataset.buyhouse));
  $('card').querySelector('[data-park]')?.addEventListener('click', () => (closeCard(), who.command(offerById('Door_1', 'goPark'))));
  $('card').querySelector('[data-extend]')?.addEventListener('click', () => (closeCard(), openExtend()));
  $('card').querySelector('[data-party]')?.addEventListener('click', () => (closeCard(), throwParty()));
}
// Off to a house in the town: built first if it hasn't been (a second, the first time), then out of the door.
async function goVisit(id) {
  const who = sel;
  closeCard();
  if (!id || owned(id)) return;
  await loadNeighbours();
  await housePlace(id);
  who.command(goTo(id));
}
// Sure? cards: buying a house, building an extension.
function openBuy(id) {
  const h = houseById(id), cost = buyCost(id);
  if (card || !h || owned(id)) return;
  const back = homeState.paid ? t('ui.sale.sellOld', { coins: homeState.paid }) : t('ui.sale.rented');
  openCard(sel, 'buy', `<h2>🏡 ${t('ui.sale.title', { house: houseName(houseById(id)) })}</h2><p class="intro">${t('ui.sale.intro', { size: t('town.size', SIZES[h.size]), price: h.price })} ${back}</p>
    <p class="intro">${t('ui.sale.van')}</p>
    <div class="actions"><button id="card-close">${t('ui.start.back')}</button><button class="go" id="buy-yes" ${household.money < cost ? 'disabled' : ''}>🏡 ${t('ui.sale.yes', { cost: Math.max(0, cost) })}</button></div>`);
  $('card-close').onclick = closeCard;
  $('buy-yes').onclick = () => (closeCard(), buyHouse(id));
}
function openExtend() {
  const next = SIZES[homeState.size + 1], cost = EXTENSION[homeState.size + 1];
  if (card || !next) return;
  openCard(sel, 'extend', `<h2>🔨 ${t('ui.extend.title')}</h2><p class="intro">${t('ui.extend.intro', { from: t('town.size', SIZES[homeState.size]), to: t('town.size', next), cost })}</p>
    <div class="actions"><button id="card-close">${t('ui.start.back')}</button><button class="go" id="extend-yes" ${household.money < cost ? 'disabled' : ''}>🔨 ${t('ui.extend.yes', { cost })}</button></div>`);
  $('card-close').onclick = closeCard;
  $('extend-yes').onclick = () => (closeCard(), extendHome());
}

let placing = null; // { s, move (the item being moved), turn, ghost, item (measured here), ok, why, speed }
async function startPlacing(s, move = null, fromBox = false) {
  const was = card?.speed ?? speed;
  closeCard();
  setView(home);
  const g = await ghost(srcOf(s));
  scene.add(g);
  g.visible = false;
  placing = { s, move, fromBox, turn: move ? entryOf(move)?.turn ?? 0 : 0, ghost: g, item: null, ok: false, speed: was };
  setSpeed(0);
  $('place-bar').innerHTML = `<span>${s.icon} ${t(move ? 'ui.place.moving' : fromBox ? 'ui.place.unboxing' : 'ui.place.buying', { thing: t(`shop.${s.id}`), cost: s.price })}</span><button id="place-turn">↻ ${t('ui.place.turn')}</button><button id="place-stop">✕ ${t(move || fromBox ? 'ui.place.stopMove' : 'ui.place.stop')}</button><small id="place-why"></small>`;
  $('place-bar').hidden = false;
  $('place-turn').onclick = turnPlacing;
  $('place-stop').onclick = stopPlacing;
  // Start it where it is (moving) or in the middle of the floor.
  const at = move ? move.obj.position : new THREE.Vector3(0.3, 0, 0.2);
  await hover(at.x, at.z);
}
function stopPlacing() {
  if (!placing) return;
  placing.ghost.removeFromParent();
  $('place-bar').hidden = true;
  setSpeed(placing.speed);
  placing = null;
}
function turnPlacing() {
  if (!placing) return;
  placing.turn = (placing.turn + Math.PI / 2) % (Math.PI * 2);
  if (placing.item) hover(placing.item.obj.position.x, placing.item.obj.position.z);
}
// What a new bed replaces: the camp bed of whoever sleeps on it.
const campBedNow = () => furniture.find((e) => e.id === 'campBed')?.item ?? null;
let hoverTicket = 0;
async function hover(x, z) {
  const p = placing;
  if (!p) return;
  const snap = (v) => Math.round(v / 0.25) * 0.25;
  const ticket = ++hoverTicket;
  const item = await measure(srcOf(p.s), snap(x), snap(z), p.turn, p.s.fit, p.s.use ? { ...p.s.use } : null);
  if (ticket !== hoverTicket || placing !== p) return;
  const except = [p.move, p.s.id === 'bed' ? campBedNow() : null].filter(Boolean);
  const { ok, why } = home.fits(item, except);
  Object.assign(p, { item, ok, why });
  p.ghost.matrixAutoUpdate = false;
  p.ghost.matrix.copy(item.obj.matrix);
  p.ghost.visible = true;
  p.ghost.userData.tint(ok);
  $('place-why').textContent = ok ? t('ui.place.ok') : t(`ui.place.${why}`);
}
const floorAt = (cx, cy) => {
  ray.setFromCamera(new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
  return ray.intersectObject(home.floor, false)[0]?.point ?? null;
};
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!placing || e.buttons) return;
  const at = floorAt(e.clientX, e.clientY);
  if (at) hover(at.x, at.z);
});
async function placeHere(cx, cy) {
  const p = placing;
  const at = floorAt(cx, cy);
  if (!p || !at) return;
  await hover(at.x, at.z);
  if (placing !== p) return;
  if (!p.ok) return toast(t(`ui.place.${p.why}`));
  const { x, z } = p.item.obj.position;
  if (!p.move && !p.fromBox && household.money < p.s.price) return toast(t('ui.money.short', { name: sel.name, cost: p.s.price }));
  stopPlacing();
  // A thing moved keeps who it belongs to (a bed's sleeper), and stays one of the flat's own (`base`) if it was.
  const owner = p.move?.owner ?? null, twinOwner = p.move?.twin?.owner ?? null;
  const was = p.move ? entryOf(p.move) : null;
  if (p.move) removeExtra(p.move);
  let base = !!was?.base;
  if (p.fromBox) {
    storage.splice(storage.indexOf(p.s.id), 1);
    if (boxedBase.includes(p.s.id)) (base = true), boxedBase.splice(boxedBase.indexOf(p.s.id), 1);
  } else if (!p.move) (household.money -= p.s.price), sel.count('buy');
  const item = await placeExtra({ id: p.s.id, x, z, turn: p.turn, ...(was?.width ? { width: was.width } : {}), ...(base ? { base: true } : {}) });
  if (owner) (item.owner = owner), (owner.home = item);
  if (twinOwner && item.twin) (item.twin.owner = twinOwner), (twinOwner.home = item.twin);
  // A cot moved keeps its baby; a basket its pet.
  if (p.move?.baby) addBaby(p.move.baby, item);
  if (p.move?.pet) rebed(p.move.pet, item);
  // A new bed: for whoever slept on the camp bed (folded away), or anyone without a bed.
  if (!p.move && item.use?.act === 'sleep') {
    const camp = campBedNow();
    const sleeper = (camp && lives.find((l) => l.home === camp)) ?? lives.find((l) => !l.home);
    if (sleeper) {
      if (camp && sleeper.home === camp) removeExtra(camp);
      item.owner = sleeper;
      sleeper.home = item;
      toast(t('ui.shop.bedFor', { name: sleeper.name }));
    }
  }
  toast(t(p.move ? 'ui.shop.moved' : p.fromBox ? 'ui.shop.unboxed' : 'ui.shop.bought', { thing: t(`shop.${p.s.id}`) }));
  save();
}
// The last loo, fridge or shower/bath in the home (shop.mjs `need`): it can be moved, not sold or put away.
const lastNeed = (item) => !!item?.bought?.need && furniture.filter((e) => kindOf(e.id).need === item.bought.need).length <= 1;
// Round 14: put away in the boxes (free), to put out again from the shop's 📦 tab.
function store(item) {
  const e = entryOf(item);
  if (!e || !item.bought?.price || item.user || item.owner || lastNeed(item)) return;
  storage.push(e.id);
  if (e.base) boxedBase.push(e.id);
  removeExtra(item);
  toast(t('ui.shop.stored', { thing: t(`shop.${e.id}`) }));
  save();
}
function sell(item) {
  if (!item?.bought?.price || item.user || item.owner || lastNeed(item)) return;
  household.money += sellPrice(item.bought);
  removeExtra(item);
  toast(t('ui.shop.sold', { thing: t(`shop.${item.bought.id}`), coins: sellPrice(item.bought) }));
  save();
}
function toast(text) {
  const el = document.createElement('div');
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
// A flat lovely enough (what is bought: shop.mjs `beauty`) cheers up whoever is at home.
let lovelySaid = false;
function lovely() {
  if (beauty() < LOVELY) return;
  for (const l of lives) if (l.present && l.place === home) l.timed.set('lovelyHome', Math.max(l.timed.get('lovelyHome') ?? 0, 30));
  if (!lovelySaid) (lovelySaid = true), toast(t('ui.shop.lovelyNow'));
}

// ---- a new look (round 10): the chest of drawers' card ----
// Clothes and hair (the body was chosen when the Sim was made), tried on live, kept for LOOK_COST, or put back. The card
// sits at the side and the camera comes close, so the Sim is seen while you choose.
function openLook(l) {
  l.card = null;
  const before = structuredClone(l.look ?? blankLook());
  const look = structuredClone(before);
  const keepCam = { target: controls.target.clone(), camera: camera.position.clone(), min: controls.minDistance };
  const p = l.sim.position, away = new THREE.Vector3(-p.x, 0, 1.2 - p.z).normalize();
  controls.minDistance = 1;
  controls.target.set(p.x, 1.05, p.z);
  camera.position.set(p.x + away.x * 2.4 + 0.4, 1.7, p.z + away.z * 2.4);
  controls.update();
  openCard(l, 'look', `<h2>👗 ${t('ui.look.title', { name: l.name })}</h2><div id="look-rows" class="look"></div>
    <div class="actions"><button id="look-cancel">${t('ui.look.cancel')}</button><button class="go" id="look-keep"></button></div>`);
  $('card').classList.add('side');
  $('card-back').classList.add('clear');
  const changed = () => JSON.stringify(look) !== JSON.stringify(before);
  const updateKeep = () => {
    const short = household.money < LOOK_COST;
    $('look-keep').disabled = !changed() || short;
    $('look-keep').textContent = short ? t('ui.money.short', { name: l.name, cost: LOOK_COST }) : t('ui.look.keep', { cost: LOOK_COST });
  };
  const ctl = lookControls($('look-rows'), {
    folk, t, who: l.who, look, names: NAMES,
    onChange: async () => {
      ctl.fabrics((await folk.redress(l.sim.body, look)).fabrics);
      updateKeep();
    }
  });
  folk.redress(l.sim.body, look).then((r) => ctl.fabrics(r.fabrics));
  updateKeep();
  const close = () => {
    $('card').classList.remove('side');
    $('card-back').classList.remove('clear');
    controls.minDistance = keepCam.min;
    controls.target.copy(keepCam.target);
    camera.position.copy(keepCam.camera);
    closeCard();
  };
  $('look-cancel').onclick = async () => {
    await folk.redress(l.sim.body, before);
    close();
  };
  $('look-keep').onclick = () => {
    household.money -= LOOK_COST;
    l.look = look;
    l.addMoodlet('newLook');
    close();
    save();
  };
}

// Over each head: a thought bubble, and hearts floating up after a hug or a flirt that went well. Over the head of the
// one you look after, a green diamond (who your clicks are for).
const headPos = new THREE.Vector3();
const screenOf = (l, up) => {
  l.sim.head.getWorldPosition(headPos);
  headPos.y += up;
  headPos.project(camera);
  return [((headPos.x + 1) / 2) * innerWidth, ((1 - headPos.y) / 2) * innerHeight];
};
function makeBubble(l) {
  l.bubble = document.createElement('div');
  l.bubble.className = 'bubble';
  l.bubble.hidden = true;
  $('bubbles').appendChild(l.bubble);
}
for (const l of lives) makeBubble(l);
const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.09).scale(0.8, 1.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x3ad16a, emissive: 0x1f8a3d, roughness: 0.35 }));
scene.add(marker);
function renderBubbles(now) {
  const placed = [];
  for (const l of everyone) {
    const th = l.thought;
    if (!th || !l.sim.head || !l.sim.group.visible) {
      l.bubble.hidden = true;
      continue;
    }
    let [x, y] = screenOf(l, 0.5);
    const html = `<span class="icon">${th.icon}</span><span>${t(th.key, { name: l.name })}</span>`;
    // Two Sims thinking the same thing side by side ("This is so romantic." on a date): one bubble says it for both
    // (round 11; round 10's shots had two of the same, one on top of the other).
    if (placed.some(([px, py, , said]) => said === html && Math.abs(px - x) < 160 && Math.abs(py - y) < 120)) {
      l.bubble.hidden = true;
      continue;
    }
    // Two Sims side by side (a chat, a hug): the second bubble goes above the first instead of on top of it.
    for (const [px, py, pw] of placed) if (Math.abs(px - x) < pw && Math.abs(py - y) < 44) y = py - 48;
    l.bubble.hidden = false;
    if (l.bubble.innerHTML !== html) l.bubble.innerHTML = html;
    Object.assign(l.bubble.style, { left: `${x}px`, top: `${y}px` });
    placed.push([x, y, l.bubble.offsetWidth || 200, html]);
  }
  for (const l of everyone)
    for (const h of l.hearts.splice(0)) {
      if (!l.sim.group.visible) continue;
      const [x, y] = screenOf(l, 0.3);
      for (let k = 0; k < 5; k++) {
        const el = document.createElement('div');
        el.className = 'heart';
        el.textContent = k ? '❤️' : h.icon;
        Object.assign(el.style, { left: `${x + (k - 2) * 16}px`, top: `${y}px`, animationDelay: `${k * 0.15}s` });
        $('bubbles').appendChild(el);
        setTimeout(() => el.remove(), 2600);
      }
    }
  // Over a baby's cot: crying (and for what), or asleep.
  for (const b of babies) {
    if (!b.bubble) continue;
    const say = b.mesh.visible && b.name ? (b.crying ? [BABY_NEEDS.find((n) => n.id === b.crying).icon, `baby.cry.${b.crying}`] : b.asleep ? ['💤', 'baby.asleep'] : null) : null;
    b.bubble.hidden = !say;
    if (!say) continue;
    b.mesh.getWorldPosition(babyAt);
    babyAt.y += 0.55;
    babyAt.project(camera);
    const html = `<span class="icon">${say[0]}</span><span>${t(say[1], { name: b.name })}</span>`;
    if (b.bubble.innerHTML !== html) b.bubble.innerHTML = html;
    Object.assign(b.bubble.style, { left: `${((babyAt.x + 1) / 2) * innerWidth}px`, top: `${((1 - babyAt.y) / 2) * innerHeight}px` });
  }
  // Round 16, phase 5.4: over a sulking pet, what it wants.
  for (const p of pets) {
    if (!p.bubble) continue;
    const want = p.mesh?.visible && p.name && p.sulking ? PET_NEEDS.find((n) => n.id === p.sulking) : null;
    p.bubble.hidden = !want;
    if (!want) continue;
    p.mesh.getWorldPosition(babyAt);
    babyAt.y += PETS[p.kind].height + 0.35;
    babyAt.project(camera);
    const html = `<span class="icon">${want.icon}</span><span>${t(`pet.wants.${want.id}`, { name: p.name })}</span>`;
    if (p.bubble.innerHTML !== html) p.bubble.innerHTML = html;
    Object.assign(p.bubble.style, { left: `${((babyAt.x + 1) / 2) * innerWidth}px`, top: `${((1 - babyAt.y) / 2) * innerHeight}px` });
  }
  marker.visible = sel.sim.group.visible;
  sel.sim.head?.getWorldPosition(marker.position);
  marker.position.y += 0.3 + Math.sin(now / 400) * 0.03;
  marker.rotation.y = now / 700;
}
// The household's news, and a colleague's only when it is about someone who lives here (a date, moving in).
function renderToasts() {
  for (const b of babies) for (const ev of b.events.splice(0)) if (b.name) toast(t(ev.key, ev.vars));
  for (const p of pets) for (const ev of p.events.splice(0)) if (p.name) toast(t(ev.key, ev.vars));
  for (const l of everyone)
    for (const ev of l.events.splice(0)) {
      if (!lives.includes(l) && !/date|movedIn/.test(ev.key)) continue;
      // Round 16: a milestone goes in the life story too.
      const m = MILESTONES[ev.key];
      if (m && (!m.when || m.when(ev.vars ?? {}))) milestone(m.icon, ev.key, ev.vars);
      const el = document.createElement('div');
      // A value with a dot in it is itself a key (a level's name: 'friendship.friends').
      const vars = Object.fromEntries(Object.entries(ev.vars ?? {}).map(([k, v]) => [k, typeof v === 'string' && v.includes('.') ? t(v) : v]));
      el.textContent = t(ev.key, vars);
      $('toasts').appendChild(el);
      setTimeout(() => el.remove(), 3500);
    }
}

// ---- the loop ----
const props = new Props(scene);
const timer = new THREE.Timer();
let uiAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.1);
  const gameDt = dt * SPEEDS[speed]; // game minutes; also the Sim's animation seconds (1 game minute = 1 s at normal)
  minutes += gameDt;
  for (const l of everyone) if (l.present) l.sim.update(gameDt, []);
  for (const l of everyone) if (l.present) lean(l, dt);
  for (const l of everyone) l.tick(gameDt, dt);
  minding();
  townTick();
  for (const b of babies) b.tick(gameDt, (minutes % 1440) / 60);
  petsTick(gameDt);
  drawPets(gameDt);
  // Round 14: the blob shadow too (it was only hidden by a Sim's own update, which someone out of sight never gets: a
  // shadow lay in the middle of every floor).
  for (const l of everyone) if (!(l.sim.group.visible = inView(l)) && l.sim.blob) l.sim.blob.visible = false;
  // What is in their hands and on the table; the fridge door, the TV picture, the shower water (round 10), in real time
  // (at ⏭ a fridge visit is a quarter of a second of game time: the door would never get open).
  props.update(everyone, view, dt);
  drawBabies(dt);
  followSel();
  view.update(camera, controls.target);
  controls.update();
  light();
  sun.target.position.copy(controls.target).setY(0);
  sun.position.copy(sun.target.position).add(sunOffset);
  tickDressing(dt, { minutes, hour: (minutes % 1440) / 60 });
  weatherFx?.tick(dt, controls.target);
  renderer.render(scene, camera);
  renderBubbles(now);
  if (now - uiAt > 250) {
    uiAt = now;
    lovely();
    if (Math.floor(minutes / 60) !== Math.floor((savedAt ?? -60) / 60)) save();
    renderPanels();
    streetTick();
    shareBeds();
    checkGoals();
    wantsTick();
    eventsTick();
    weatherTick();
    renderPeople();
    renderToasts();
    renderCards();
  }
}
$('loading').textContent = '';
requestAnimationFrame(frame);
let colleaguesIn = false;
const colleaguesLoaded = loadColleagues().then(() => (colleaguesIn = true));
// A household that has a nanny: she is ready before she is needed (the first time she is loaded, ~a second).
colleaguesLoaded.then(() => household.childcare === 'nanny' && babies.length && nannyLife());
// Round 14: the two neighbours, after the nanny (who must not be one of them).
const neighboursLoaded = colleaguesLoaded.then(() => nannyMade).then(loadNeighbours);
neighboursLoaded.then(() => (neighboursIn = true));

// For tests: the game's own steps without drawing, `n` game minutes in steps of one (a headless Chrome draws a few
// frames a second, and a day at work at ⏭ ran out of time in round 8). The cards still stop it: it waits for no one.
function advance(n) {
  for (let k = 0; k < n && !card; k++) {
    minutes += 1;
    for (const l of everyone) if (l.present) l.sim.update(1, []);
    for (const l of everyone) l.tick(1, 1 / 60);
    minding();
    townTick();
    for (const b of babies) b.tick(1, (minutes % 1440) / 60);
    petsTick(1);
    // Round 14: the blob shadow too (it was only hidden by a Sim's own update, which someone out of sight never gets: a
  // shadow lay in the middle of every floor).
  for (const l of everyone) if (!(l.sim.group.visible = inView(l)) && l.sim.blob) l.sim.blob.visible = false;
    followSel();
    renderCards();
  }
}

// For tests (tests/*.json): an offer by thing and id.
window.__offerOf = offerById;
window.__offerOfSocial = interactionById;
window.__life = {
  life, sim, lives, everyone, colleagues, place, places, camera, controls, renderer, t, bondOf, select, beds, household, ask, closeCard, openStation, setView, desks, props,
  get card() { return card; }, get year() { return year; }, get speed() { return speed; }, get view() { return nameOf(view); },
  get sel() { return sel; }, colleaguesLoaded, town: TOWN, HOUSES, streetName, story,
  // Round 16, phase 2.
  factsOf, checkGoals, openGoalPicker, aimsOn, wantsTick, wantCtx, wished, openRewards, buyReward, diary, openDiary, milestone,
  // Round 16, phase 3.
  eventsOn, deck, eventsTick, openEvent, eventCtx, eventPeople, EVENTS, eventById, lastEvent: null, openMenu, offerWhy,
  // Round 16, phase 5.
  pets, adoptPet, drawPets, PETS, openPets,
  skillsOn, SKILLS, placeExtra, spotFor, shopItem, oddJobToday, EARNING, ODD_JOB, earnGain, careerPlace, workOf, openJobs, openStation,
  // Round 16, phase 4.
  townLifeOn, townLife, townLifeTick, playTownDay, TOWNLIFE, babiesAt, newsText, npcs, openNews, reachTick, REACH, DRAWN, lastReach: null,
  // Round 16, phase 6.
  calendarOn, calendar, dateNow, seasonNow, weekendNow, calendarTick, SEASONS, TOWN_EVENTS, birthdayOf, birthdayToday, birthdayHere, npcBirthday, get fair() { return fair; }, townEventsTick, weekendTick, leanOf, lieInNow, offToday,
  weatherNow, weatherTick, get weather() { return weather && { ...weather }; }, set weatherId(id) { weather = { day: Math.floor(minutes / 1440), id, told: true }; }, snowmen, weatherFx, ducks,
  folk, get extras() { return extras(); }, furniture, storage, save, snapshot, openShop, startPlacing, stopPlacing, turnPlacing, placeHere, hover, sell, beauty, openLook, get home() { return home; }, saving,
  get placing() { return placing; }, get start() { return start?.kind ?? null; },
  setSpeed, advance, get minutes() { return minutes; }, set minutes(v) { minutes = v; },
  babies, haveBaby, get newBabies() { return newBabies.length; }, dressUp, spouseOf: (l) => spouseOf(l, everyone),
  get caring() { return caring && { ...caring }; }, get nanny() { return nanny; }, get careAsk() { return !!careAsk; }, nannyLife,
  // Round 14: the town.
  measure, kindOf, srcOf,
  // Round 15: the street.
  street, via, frontDoor, openDoorMenu, streetTick, shareBeds, sideFor, partners, sleepers,
  neighbours, neighboursLoaded, guests, get homeState() { return { ...homeState }; }, get homeParty() { return !!homeParty; }, housePlace, residentsOf, visitState,
  partyToday, partyAt, invited, openTown, goVisit, openBuy, buyHouse, openExtend, extendHome, inviteOver, throwParty, store, rehome, homeNow, titleOf, get moving() { return moving; },
  ready: true
};
colleaguesLoaded.then(() => (window.__life.colleaguesReady = true));
// Round 16, phase 2: a save from before the life story (v3 or older) starts one now.
if (saved && !Array.isArray(saved.diary)) milestone('📖', 'diary.before', { names: lives.map((l) => l.name).join(', ') });
// The life story begins (a new game): who, how, and their dreams.
if (!saved) {
  milestone(story?.icon ?? '🏠', story ? 'diary.start' : 'diary.startPlain', { name: life.name, mate: lives[1]?.name ?? '', story: story ? `start.${story.id}` : '' });
  for (const l of lives) if (l.goal) milestone(goalById(l.goal.id).icon, 'diary.newGoal', { name: l.name, goal: `goal.${l.goal.id}` });
}
// Round 16: how this life began, said once (a new game, or a test's ?story=).
if (story) toast(t(`start.${story.id}.toast`, { name: life.name, mate: lives[1]?.name ?? '', house: houseName(houseById(homeState.id)), coins: household.money }));
