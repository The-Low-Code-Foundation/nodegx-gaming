// What happy points buy (round 16, the roadmap's 2.3). Each Sim spends their own points (goals.mjs steps and dreams,
// wants.mjs wishes). Data only; the page's card lists them and applies one.
//   kind 'perk'   a lasting bonus, theirs for good (traits.mjs PERKS: `perk` is its id); once each
//   kind 'item'   a thing for the home, into the boxes to put out where they like (shop.mjs id: `item`)
//   kind 'trait'  swap one of their traits for another (a card asks which, and for what)
// Words: strings.mjs `reward.<id>` and `reward.<id>.does` (a perk's are `perk.<id>`).
export const REWARDS = [
  { id: 'ironBladder', kind: 'perk', perk: 'ironBladder', icon: '🚽', cost: 400 },
  { id: 'heartyEater', kind: 'perk', perk: 'heartyEater', icon: '🥄', cost: 400 },
  { id: 'earlyBird', kind: 'perk', perk: 'earlyBird', icon: '🐦', cost: 450 },
  { id: 'quickLearner', kind: 'perk', perk: 'quickLearner', icon: '🧠', cost: 600 },
  { id: 'socialButterfly', kind: 'perk', perk: 'socialButterfly', icon: '🦋', cost: 700 },
  { id: 'sunnyDisposition', kind: 'perk', perk: 'sunnyDisposition', icon: '🌈', cost: 900 },
  { id: 'telescope', kind: 'item', item: 'telescope', icon: '🔭', cost: 350 },
  { id: 'bath', kind: 'item', item: 'bath', icon: '🛁', cost: 400 },
  { id: 'fireplace', kind: 'item', item: 'fireplace', icon: '🔥', cost: 450 },
  { id: 'bigOven', kind: 'item', item: 'bigOven', icon: '🍳', cost: 500 },
  { id: 'bigBed', kind: 'item', item: 'bigBed', icon: '🛏️', cost: 600 },
  { id: 'newTrait', kind: 'trait', icon: '🔄', cost: 800 }
];
export const rewardById = (id) => REWARDS.find((r) => r.id === id) ?? null;
// Why it can't be bought now: 'points' (not enough), 'have' (a perk they have), or null.
export const cantBuy = (r, l) => (l.points < r.cost ? 'points' : r.kind === 'perk' && l.perks.includes(r.perk) ? 'have' : null);
