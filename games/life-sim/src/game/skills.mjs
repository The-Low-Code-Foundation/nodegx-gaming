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
  easel: [{ id: 'paint', act: 'interact', clip: 'Interact', minutes: 60, gives: { fun: 45 }, skill: { painting: 1.5 }, icon: '🎨' }],
  keyboard: [{ id: 'playMusic', act: 'interact', clip: 'Interact', minutes: 45, gives: { fun: 55 }, skill: { music: 1.5 }, icon: '🎹' }],
  planter: [{ id: 'tendGarden', act: 'interact', clip: 'Interact', minutes: 30, gives: { fun: 25 }, skill: { gardening: 2 }, icon: '🌱' }],
  workbench: [{ id: 'tinker', act: 'interact', clip: 'mc_workTable', minutes: 45, gives: { fun: 35 }, skill: { handiness: 1.5 }, icon: '🔧' }]
};
// Charm from being with people: points each time one of these goes well, for the one who started it.
export const SOCIAL_CHARM = { chat: 0.15, joke: 0.2, compliment: 0.2, flirt: 0.2, talkLikes: 0.15, hug: 0.1 };
// Handiness from fixing things at home (events.mjs: the loo, the tap, the printer): each level is this much likelier to
// go well, and a try teaches `learn` points (more when it works).
export const FIXING = { perLevel: 0.07, learn: { good: 0.6, bad: 0.3 } };

// Put the skills into the game: OFFERS (actions.mjs) and INTERACTIONS (social.mjs), in place.
export function addSkills(OFFERS, INTERACTIONS) {
  for (const list of Object.values(OFFERS)) for (const o of list) if (SKILL_GAINS[o.id]) o.skill = { ...(o.skill ?? {}), ...SKILL_GAINS[o.id] };
  for (const [key, list] of Object.entries(SKILL_OFFERS)) OFFERS[key] = [...(OFFERS[key] ?? []), ...list.filter((o) => !(OFFERS[key] ?? []).some((x) => x.id === o.id))];
  for (const ix of INTERACTIONS) if (SOCIAL_CHARM[ix.id]) ix.skill = { charm: SOCIAL_CHARM[ix.id] };
}
// A Sim's skill levels: { id: level } for every skill they have points in (`level`: life.mjs skillLevel).
export const levelsOf = (skills, level) => Object.fromEntries(Object.entries(skills ?? {}).map(([id, v]) => [id, level(v)]));
