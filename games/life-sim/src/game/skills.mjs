// Skills from objects (round 16, phase 5; the roadmap's 5.1): cooking, fitness, painting, music, gardening, handiness
// and charm, next to the school subjects the work stations teach (science, maths…). Data only. A skill is points
// (Life `learn`), its level read off life.mjs `SKILL_LEVELS` (10 levels); an offer's `skill` field says how many
// points a game hour doing it gives (actions.mjs). How fast a Sim learns one is their traits' (traits.mjs `skills`:
// a sporty Sim gains fitness faster, a lazy one slower).
//
// The page switches this on (`addSkills`) in a real game, and on a test URL with `?skills=1`: the skill gains of the
// things already in the game (the oven, the rug, the drawers, a chat), the new things to do with them, and the four
// new things to buy (shop.mjs, `skills: true`: an easel, a keyboard, a vegetable planter, a workbench; made in code,
// world.mjs MADE). Off, a test URL's seeded free will chooses as it always has.
// Words: strings.mjs `skill.<id>`, `action.<offer id>`.
export const SKILLS = {
  cooking: { icon: '🍳' },
  fitness: { icon: '🏋️' },
  painting: { icon: '🎨' },
  music: { icon: '🎹' },
  gardening: { icon: '🌱' },
  handiness: { icon: '🔧' },
  charm: { icon: '😊' }
};
export const SKILL_IDS = Object.keys(SKILLS);

// Skill points a game hour, added to offers already in the game (by offer id, wherever it is offered).
export const SKILL_GAINS = {
  cook: { cooking: 2 },
  dance: { fitness: 0.6 },
  stretch: { fitness: 0.5 }
};
// New things to do with things already in the game (actions.mjs OFFERS, by its key), and with the new things to buy.
export const SKILL_OFFERS = {
  Carpet_Round: [{ id: 'workout', act: 'interact', clip: 'mc_stretch', minutes: 30, gives: { fun: 25, energy: -10, hygiene: -15 }, skill: { fitness: 2 }, icon: '🏋️' }],
  drawers: [{ id: 'practiseCharm', act: 'interact', clip: 'mc_talk', talk: true, minutes: 20, gives: { fun: 10, social: 30 }, skill: { charm: 1.5 }, icon: '🪞' }],
  // Phase 5.2: a painting finished goes on the pile (`makes`); sold online, all at once (`earn`).
  easel: [
    { id: 'paint', act: 'interact', clip: 'Interact', minutes: 60, gives: { fun: 45 }, skill: { painting: 1.5 }, makes: 'painting', icon: '🎨' },
    { id: 'sellPaintings', act: 'interact', clip: 'mc_phone', hand: 'phone', minutes: 10, gives: { fun: 10 }, free: false, earn: 'paintings', icon: '🖼️' }
  ],
  keyboard: [{ id: 'playMusic', act: 'interact', clip: 'Interact', minutes: 45, gives: { fun: 55 }, skill: { music: 1.5 }, icon: '🎹' }],
  // Phase 5.2: tending grows the vegetables (`grows`, once a day); ripe, they are picked and sold to the corner shop.
  planter: [
    { id: 'tendGarden', act: 'interact', clip: 'Interact', minutes: 30, gives: { fun: 25 }, skill: { gardening: 2 }, grows: true, icon: '🌱' },
    { id: 'pickVeg', act: 'interact', clip: 'Interact', minutes: 15, gives: { fun: 30 }, skill: { gardening: 0.5 }, earn: 'veg', icon: '🥕' }
  ],
  // Phase 5.2: playing for tips in the park (singing along to a guitar that isn't drawn), from music level 2.
  parkDance: [{ id: 'busk', act: 'interact', clip: 'mc_talk', talk: true, minutes: 60, gives: { fun: 30, social: 30, energy: -5 }, skill: { music: 0.8 }, free: false, earn: 'busk', icon: '🎸' }],
  workbench: [{ id: 'tinker', act: 'interact', clip: 'mc_workTable', minutes: 45, gives: { fun: 35 }, skill: { handiness: 1.5 }, icon: '🔧' }]
};
// Charm from being with people: points each time one of these goes well, for the one who started it.
export const SOCIAL_CHARM = { chat: 0.15, joke: 0.2, compliment: 0.2, flirt: 0.2, talkLikes: 0.15, hug: 0.1 };
// Handiness from fixing things at home (events.mjs: the loo, the tap, the printer): each level is this much likelier to
// go well, and a try teaches `learn` points (more when it works).
export const FIXING = { perLevel: 0.07, learn: { good: 0.6, bad: 0.3 } };

// Phase 5.2: earning from skills, kept modest next to a job (the office pays 60 coins a day at first, 280 at the top,
// plus the stations' coins). `lv`: the skill's level.
//   paintings  each painting finished is worth `worth(lv)` (the painter's level then); the pile holds `most`, sold at once
//   veg        the planter grows `grow(lv)` the first time it is tended each day; at 100 it is ripe: picked and sold for
//              `worth(lv)`. One planter's crop for the household (a second planter doesn't grow a second crop)
//   busk       coins an hour in the park, from level `from` (cut short: the share played)
//   oddJob     one a day on the notice board, a neighbour's: `pay(lv)` from handiness level `from`; what needs doing is
//              one of `jobs` (strings.mjs `earn.job.<id>`)
export const EARNING = {
  paintings: { worth: (lv) => 4 + 3 * lv, most: 10 },
  veg: { grow: (lv) => 34 + 6 * lv, worth: (lv) => 10 + 4 * lv },
  busk: { from: 2, tips: (lv) => 2 + 3 * lv },
  oddJob: { from: 2, pay: (lv) => 15 + 6 * lv, jobs: ['shelf', 'fence', 'bike', 'gate', 'door'] }
};
// The odd job itself, done at the neighbour's (the page queues it when they get there).
export const ODD_JOB = { id: 'oddJob', act: 'self', clip: 'mc_workTable', minutes: 90, gives: { fun: 15, energy: -8 }, skill: { handiness: 1 }, free: false, earn: 'oddJob', icon: '🔨' };
// The household's side earnings, as a new game (or a save from before) starts them.
export const freshSide = () => ({ paintings: [], veg: 0, vegDay: -1, oddJob: null, earned: 0 });
// Why an earning thing can't be done now (a strings.mjs key), or null. `levels`: the Sim's skill levels.
export function earnWhy(offer, side, levels) {
  if (offer.earn === 'paintings' && !side.paintings.length) return 'earn.why.noPaintings';
  if (offer.earn === 'veg' && side.veg < 100) return 'earn.why.notRipe';
  if (offer.earn === 'busk' && (levels.music ?? 0) < EARNING.busk.from) return 'earn.why.busk';
  return null;
}

// Put the skills into the game: OFFERS (actions.mjs) and INTERACTIONS (social.mjs), in place.
export function addSkills(OFFERS, INTERACTIONS) {
  for (const list of Object.values(OFFERS)) for (const o of list) if (SKILL_GAINS[o.id]) o.skill = { ...(o.skill ?? {}), ...SKILL_GAINS[o.id] };
  for (const [key, list] of Object.entries(SKILL_OFFERS)) OFFERS[key] = [...(OFFERS[key] ?? []), ...list.filter((o) => !(OFFERS[key] ?? []).some((x) => x.id === o.id))];
  for (const ix of INTERACTIONS) if (SOCIAL_CHARM[ix.id]) ix.skill = { charm: SOCIAL_CHARM[ix.id] };
}
// A Sim's skill levels: { id: level } for every skill they have points in (`level`: life.mjs skillLevel).
export const levelsOf = (skills, level) => Object.fromEntries(Object.entries(skills ?? {}).map(([id, v]) => [id, level(v)]));
