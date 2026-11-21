// Personality (round 16, the roadmap's 1.4): three traits each, so no two Sims live the same day. Data only; Life
// (life.mjs) reads it: how fast their needs fall, what free will likes doing, how their chats go, and moodlets of their
// own. Words: strings.mjs `trait.<id>` and `trait.<id>.does`; the moodlets are needs.mjs's (`trait: true`).
//
// A trait:
//   icon       beside its name (the make-your-Sim screen, the friends card)
//   opposite   a trait it can't go with (nobody is both neat and messy)
//   decay      { need: ×n }: that need falls n times as fast (1 = like anyone)
//   nightDecay { need: ×n } between 21:00 and 03:00 only; `morningDecay` between 06:00 and 11:00
//   likes      { offer or interaction id: ×n }: free will scores it n times (0.5: less keen)
//   social     ×n on every friendly thing to do with someone (chat, joke, hug…)
//   chance     { interaction id or 'any': +p }: how likely it goes well when they start it
//   received   { interaction id or 'any': +p }: and when someone does it to them
//   always     a moodlet they always have (`when` on the moodlet: only while that holds)
//   after      { offer id: moodlet, or { moodlet, chance } }: added when they finish it
//   ignores    need moodlets they don't feel (messy: never "stinky")
//   learn      ×n skill points (bookworm)
// Nothing here harms a Sim: a grumpy Sim grumbles, a clumsy one says "oops".
export const TRAITS = {
  cheerful: { icon: '😄', opposite: 'grumpy', always: 'sunny', received: { any: 0.05 } },
  grumpy: { icon: '😒', opposite: 'cheerful', decay: { social: 0.75 }, always: 'grumbly', received: { any: -0.08, joke: -0.1 }, likes: { tv: 1.3 } },
  foodie: { icon: '🍝', decay: { hunger: 1.2 }, likes: { cook: 1.8, eat: 1.4, eatPizza: 1.6, snack: 1.3, hotChocolate: 1.5 }, after: { eat: 'yum', eatPizza: 'yum' } },
  lazy: { icon: '🛋️', opposite: 'sporty', decay: { energy: 1.2 }, likes: { tv: 1.5, sitDown: 1.6, nap: 1.6, rest: 1.5, sitBench: 1.4, dance: 0.6, stretch: 0.5, washUp: 0.6 }, after: { nap: 'cosyNap' } },
  sporty: { icon: '🏃', opposite: 'lazy', decay: { energy: 0.85, hygiene: 1.15 }, likes: { dance: 1.8, stretch: 2.2, tv: 0.7 }, after: { dance: 'pumped', stretch: 'pumped' } },
  bookworm: { icon: '📚', likes: { read: 2, study: 1.8, stargaze: 1.6, dance: 0.8 }, learn: 1.3, after: { read: 'goodBook' } },
  chatty: { icon: '🗣️', opposite: 'shy', decay: { social: 1.3 }, social: 1.5, likes: { phone: 1.6, text: 1.3 }, chance: { chat: 0.05 } },
  shy: { icon: '🙈', opposite: 'chatty', decay: { social: 0.7 }, social: 0.7, likes: { read: 1.3, phone: 0.7 }, chance: { any: -0.05 }, after: { read: 'quietTime' } },
  romantic: { icon: '🌹', likes: { flirt: 2, kissCheek: 1.8, compliment: 1.5, stargaze: 1.4 }, chance: { flirt: 0.1, askDate: 0.1 }, received: { flirt: 0.05 } },
  joker: { icon: '🤡', likes: { joke: 2.2, tv: 1.2 }, chance: { joke: 0.15 }, received: { joke: 0.1 } },
  neat: { icon: '🧽', opposite: 'messy', decay: { hygiene: 1.15 }, likes: { washUp: 1.8, shower: 1.4, washHands: 1.4, bath: 1.4 }, after: { washUp: 'spotless' } },
  messy: { icon: '🧦', opposite: 'neat', decay: { hygiene: 0.85 }, likes: { washUp: 0.4, shower: 0.8 }, ignores: ['stinky'] },
  nightOwl: { icon: '🦉', nightDecay: { energy: 0.5 }, morningDecay: { energy: 1.4 }, likes: { stargaze: 1.8, tv: 1.2 }, after: { stargaze: 'starry' } },
  clumsy: { icon: '🤕', likes: { dance: 1.2 }, chance: { any: -0.03 }, after: { cook: { moodlet: 'oops', chance: 0.3 }, washUp: { moodlet: 'oops', chance: 0.2 }, dance: { moodlet: 'oops', chance: 0.15 } } }
};
export const TRAIT_IDS = Object.keys(TRAITS);
// Round 16, phase 2: lasting bonuses bought with happy points (rewards.mjs). The same fields as a trait; Life reads a
// Sim's traits and perks together. Words: strings.mjs `perk.<id>`, `perk.<id>.does`.
export const PERKS = {
  ironBladder: { icon: '🚽', decay: { bladder: 0.75 } },
  quickLearner: { icon: '🧠', learn: 1.5 },
  socialButterfly: { icon: '🦋', decay: { social: 0.85 }, chance: { any: 0.08 } },
  earlyBird: { icon: '🐦', morningDecay: { energy: 0.6 } },
  heartyEater: { icon: '🥄', decay: { hunger: 0.85 } },
  sunnyDisposition: { icon: '🌈', always: 'sunny' }
};
// A trait's or a perk's fields, by id.
const def = (id) => TRAITS[id] ?? PERKS[id] ?? {};
export const PER_SIM = 3;

// Three traits that go together, at random (`random`: the dice to use; `keep`: ones already chosen).
export function rollTraits(random = Math.random, keep = []) {
  const out = [...keep];
  const pool = TRAIT_IDS.filter((id) => !out.includes(id));
  while (out.length < PER_SIM && pool.length) {
    const id = pool.splice(Math.floor(random() * pool.length), 1)[0];
    if (!out.some((o) => TRAITS[o].opposite === id || TRAITS[id].opposite === o)) out.push(id);
  }
  return out;
}
// Can `id` join `list`? Not twice, not with its opposite, not past three.
export const fits = (list, id) => !list.includes(id) && list.length < PER_SIM && !list.some((o) => TRAITS[o].opposite === id || TRAITS[id].opposite === o);
// Keep only real traits that go together (a save, a URL).
export const cleanTraits = (list) => (Array.isArray(list) ? list : []).reduce((out, id) => (TRAITS[id] && fits(out, id) ? [...out, id] : out), []);

// What Life asks. `traits`: a Sim's trait ids.
const night = (h) => h >= 21 || h < 3;
const morning = (h) => h >= 6 && h < 11;
export function decayOf(traits, need, hour) {
  let k = 1;
  for (const id of traits) {
    const tr = def(id);
    k *= tr.decay?.[need] ?? 1;
    if (night(hour)) k *= tr.nightDecay?.[need] ?? 1;
    if (morning(hour)) k *= tr.morningDecay?.[need] ?? 1;
  }
  return k;
}
// How keen free will is on an offer (social: a friendly thing to do with someone).
export function likingOf(traits, id, social = false) {
  let k = 1;
  for (const t of traits) k *= (def(t).likes?.[id] ?? 1) * (social ? def(t).social ?? 1 : 1);
  return k;
}
// How much likelier an interaction goes well: the one who starts it, and the one it is done to.
export function chanceBonus(starter, receiver, id) {
  let p = 0;
  for (const t of starter) p += (def(t).chance?.[id] ?? 0) + (def(t).chance?.any ?? 0);
  for (const t of receiver) p += (def(t).received?.[id] ?? 0) + (def(t).received?.any ?? 0);
  return p;
}
export const alwaysOf = (traits) => traits.map((t) => def(t).always).filter(Boolean);
export const ignoredBy = (traits) => new Set(traits.flatMap((t) => def(t).ignores ?? []));
// The moodlets that finishing `offerId` gives them: [{ moodlet, chance }].
export const afterOf = (traits, offerId) => traits.map((t) => def(t).after?.[offerId]).filter(Boolean).map((a) => (typeof a === 'string' ? { moodlet: a, chance: 1 } : a));
export const learnOf = (traits) => traits.reduce((k, t) => k * (def(t).learn ?? 1), 1);
