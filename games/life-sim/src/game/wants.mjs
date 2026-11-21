// Wants (round 16, the roadmap's 2.2): three small wishes on screen for the Sim you look after, each worth happy points
// when it comes true, replaced by a new one then, or after a day if it doesn't. Which wishes come up is weighted by who
// the Sim is (traits.mjs), what they love (likes.mjs), their dream (goals.mjs) and how things are (needs, money, a job,
// a sweetheart, the home). Data only; the page rolls them and Life's tally (`count`) says when one comes true.
// Words: strings.mjs `want.<id>`.
//
// A want:
//   did      what has to be done: an id Life counts (an offer's, an interaction's, or 'go.park', 'go.house', 'party',
//            'hostParty', 'buy', 'promoted')
//   points   happy points when it comes true
//   base     how likely it comes up (1: as likely as any)
//   traits   { trait: ×n }   goals { goal: ×n }   need: a need that makes it likelier the lower it is
//   when     (c) → false: not now (no telescope to want to look through, no sweetheart to kiss)
// Liking it (likes.mjs `activity`) makes it three times as likely; disliking it, almost never.
// `c`: { traits, likes, goal, needs, hour, money, job, friends, romance, babies, has: { shop id: true }, weather, off: [ids] }
export const WANTS = [
  { id: 'cook', icon: '🍳', did: 'cook', points: 25, traits: { foodie: 3, lazy: 0.6 }, goals: { chef: 4 }, need: 'hunger' },
  { id: 'eat', icon: '🍽️', did: 'eat', points: 15, need: 'hunger', when: (c) => c.needs.hunger < 70 },
  { id: 'pizza', icon: '🍕', did: 'eatPizza', points: 30, traits: { foodie: 2, lazy: 1.5 }, when: (c) => c.money >= 20 },
  { id: 'dance', icon: '💃', did: 'dance', points: 20, traits: { sporty: 3, lazy: 0.3, clumsy: 1.3 }, need: 'fun' },
  { id: 'stretch', icon: '🧘', did: 'stretch', points: 15, traits: { sporty: 3, lazy: 0.3 } },
  { id: 'read', icon: '📖', did: 'read', points: 20, traits: { bookworm: 3, shy: 1.5, sporty: 0.6 }, need: 'fun' },
  { id: 'study', icon: '🔬', did: 'study', points: 25, traits: { bookworm: 2.5 }, goals: { career: 2 } },
  { id: 'tv', icon: '📺', did: 'tv', points: 15, traits: { lazy: 2.5, nightOwl: 1.5, sporty: 0.5 }, need: 'fun' },
  { id: 'nap', icon: '😴', did: 'nap', points: 15, traits: { lazy: 3 }, need: 'energy' },
  { id: 'stargaze', icon: '🔭', did: 'stargaze', points: 30, traits: { nightOwl: 2.5, romantic: 2, bookworm: 1.5 }, when: (c) => c.has.telescope },
  { id: 'bath', icon: '🛁', did: 'bath', points: 25, traits: { neat: 2, lazy: 1.5 }, need: 'hygiene', when: (c) => c.has.bath },
  { id: 'washUp', icon: '🧽', did: 'washUp', points: 15, traits: { neat: 4, messy: 0.1 } },
  { id: 'fireside', icon: '🔥', did: 'warmUp', points: 20, traits: { romantic: 1.5, lazy: 1.5 }, when: (c) => c.has.fireplace },
  { id: 'newLook', icon: '👗', did: 'changeLook', points: 25, traits: { romantic: 1.5 }, when: (c) => c.has.drawers || c.has.wideDrawers },
  { id: 'park', icon: '🌳', did: 'go.park', points: 25, traits: { sporty: 1.5, cheerful: 1.5 } },
  { id: 'ducks', icon: '🦆', did: 'feedDucks', points: 30, traits: { cheerful: 2, shy: 1.3 } },
  { id: 'flowers', icon: '🌷', did: 'smellFlowers', points: 25, traits: { romantic: 2.5 } },
  { id: 'phone', icon: '📞', did: 'phone', points: 15, traits: { chatty: 3, shy: 0.6 }, need: 'social' },
  { id: 'chat', icon: '💬', did: 'chat', points: 15, traits: { chatty: 3, shy: 0.5, grumpy: 0.6 }, goals: { popular: 2 }, need: 'social' },
  { id: 'joke', icon: '😂', did: 'joke', points: 20, traits: { joker: 4, grumpy: 0.5 }, goals: { popular: 1.5 } },
  { id: 'compliment', icon: '😊', did: 'compliment', points: 20, traits: { romantic: 2, cheerful: 1.5 }, goals: { popular: 1.5 } },
  { id: 'hug', icon: '🤗', did: 'hug', points: 30, traits: { cheerful: 2, shy: 0.5, grumpy: 0.5 }, goals: { family: 1.5, popular: 1.5 }, when: (c) => c.friends > 0 },
  { id: 'talkLikes', icon: '💞', did: 'talkLikes', points: 25, traits: { chatty: 2 }, goals: { popular: 2 } },
  { id: 'gift', icon: '🎁', did: 'gift', points: 40, traits: { romantic: 2, cheerful: 1.5 }, goals: { popular: 2 }, when: (c) => c.money >= 15 && c.friends > 0 },
  { id: 'flirt', icon: '😍', did: 'flirt', points: 30, traits: { romantic: 3, shy: 0.5 }, goals: { family: 3 }, when: (c) => c.romance >= 15 },
  { id: 'kiss', icon: '😘', did: 'kissCheek', points: 40, traits: { romantic: 2.5 }, goals: { family: 2 }, when: (c) => c.romance >= 40 },
  { id: 'visit', icon: '🏡', did: 'go.house', points: 35, traits: { chatty: 2, shy: 0.4 }, goals: { popular: 3 } },
  { id: 'party', icon: '🎉', did: 'party', points: 50, traits: { chatty: 2, joker: 1.5, shy: 0.3 }, goals: { popular: 3 } },
  { id: 'hostParty', icon: '🥳', did: 'hostParty', points: 60, traits: { chatty: 2, shy: 0.2 }, goals: { popular: 3, chef: 1.5 }, when: (c) => c.money >= 40 && c.friends > 0 },
  { id: 'buy', icon: '🛒', did: 'buy', points: 40, goals: { dreamHouse: 4 }, when: (c) => c.money >= 60 },
  { id: 'workTask', icon: '📝', did: 'doTask', points: 30, goals: { career: 3 }, when: (c) => c.job > 0 },
  { id: 'promotion', icon: '🎖️', did: 'promoted', points: 80, base: 0.6, goals: { career: 3 }, when: (c) => c.job > 0 && c.job < 6 },
  { id: 'cuddleBaby', icon: '👶', did: 'cuddleBaby', points: 30, goals: { family: 3 }, when: (c) => c.babies > 0 },
  // Round 16, phase 3.4: the weather's (weather.mjs).
  { id: 'snowman', icon: '⛄', did: 'buildSnowman', points: 40, base: 4, when: (c) => c.weather === 'snow' },
  // Round 16, phase 4: given by the news (someone new in the street, townlife.mjs), never rolled (`base` 0). Done by
  // going round to the newcomer's house (the page counts 'welcome').
  { id: 'welcome', icon: '👋', did: 'welcome', points: 40, base: 0 },
  { id: 'puddles', icon: '💦', did: 'splashPuddles', points: 25, base: 2, traits: { sporty: 1.5, neat: 0.4 }, when: (c) => c.weather === 'rain' }
];
export const WANT_SLOTS = 3;
// How long a want waits to come true before another takes its place (game minutes).
export const WANT_LASTS = 1440;

// How likely each want is now, for `c`.
export function weightOf(w, c) {
  if (w.when && !w.when(c)) return 0;
  // Round 16, phase 3: not something that can't be done now (the weather's, a power cut's).
  if (c.off?.includes(w.did)) return 0;
  let k = w.base ?? 1;
  for (const t of c.traits) k *= w.traits?.[t] ?? 1;
  if (c.goal) k *= w.goals?.[c.goal] ?? 1;
  if (c.likes?.activity === w.did) k *= 3;
  if (c.likes?.dislike === w.did) k *= 0.1;
  if (w.need) k *= 1 + Math.max(0, 70 - (c.needs[w.need] ?? 70)) / 35;
  return k;
}
// A new want, not one of `taken` (ids), at random by weight (`random`: the dice; never the game's seeded ones).
export function rollWant(c, taken = [], random = Math.random) {
  const pool = WANTS.filter((w) => !taken.includes(w.id)).map((w) => [w, weightOf(w, c)]).filter(([, k]) => k > 0);
  let r = random() * pool.reduce((s, [, k]) => s + k, 0);
  for (const [w, k] of pool) if ((r -= k) <= 0) return w;
  return pool.at(-1)?.[0] ?? null;
}
export const wantById = (id) => WANTS.find((w) => w.id === id) ?? null;
