// The town (round 14). The design brief, 2026-11-11, verbatim: "Be able to expand their house or move to a bigger
// house … Be able to move, delete or add furniture … Be able to go to parties at neighbour's houses (maybe everyone they
// work with is accessible as a 'friend' to go hang out with?) … multiple houses available in the town with real NPCs,
// either colleagues or not, and be able to add those to the list of locations we can visit (invited or not? could be
// funny), and to have a select number of free houses the player can visit with the intention to buy if they have the
// money, and a furniture shop and furniture management system".
//
// Data only. The page (page.mjs) builds a house the first time someone goes there (world.mjs lifeHouse), puts the
// people who live there in it while someone from the household is visiting, and throws the parties.
import { weekday } from './work.mjs';

// How big a home can be: the flat (7 × 6 m), then each extension. A house in the town is one of these sizes too.
export const SIZES = [
  { w: 7, d: 6 },
  { w: 10, d: 6 },
  { w: 10, d: 8 },
  { w: 13, d: 8 },
  { w: 13, d: 10 }
];
// An extension to the next size, in coins (by the size it makes). The builders are quick: it is there at once.
export const EXTENSION = [0, 300, 450, 650, 900];

// Round 16: the town comes from a seed (rolled at New Game, kept in the save), so each new game has its own street:
// its name, which houses are for sale and for how much, how big each is, what it looks like, and who lives with whom.
// Town seed 0 is the classic Sunny Lane of rounds 14–15, house for house (the test URLs' town, so their checks still
// hold); `?town=` picks one. Its own dice (`townDice`), never the game's: a `?seed=` game is the same game in any town.
export const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
// A new town's seed (never 0, the classic one).
export const rollTown = () => 1 + Math.floor(Math.random() * 2147483646);
// The dice for anything else the town decides (which people are colleagues and neighbours): the same for one seed.
export const townDice = (seed, salt = 0) => seeded((seed ^ 0x5eed1e5) + salt * 7919);

// The houses. `lived`: people live there (the colleagues, and the neighbours who don't work with you: `neighbours`);
// `sale`: empty and for sale, to go and look round, and to buy. `no`: its number in the street (the flat is 1).
// `look`: dressing.mjs dressHouse (the back wall inside, the floor, the curtains) and the front (`brick`, `roof`).
// `name`: a house for sale's name (strings.mjs `house.name.N`). Filled in by makeTown (in place: it is imported).
export const HOUSES = [];
const CLASSIC = [
  { id: 'h1', no: 3, kind: 'lived', size: 1, look: { feature: 0xe8d6c4, floor: 'wood', curtains: 0xb85c4a } },
  { id: 'h2', no: 5, kind: 'lived', size: 2, look: { feature: 0xcfe0e8, floor: 'carpet', curtains: 0x4a7a5a } },
  { id: 'h3', no: 7, kind: 'lived', size: 1, look: { feature: 0xf2e2b0, floor: 'wood', curtains: 0x8a5aa0 } },
  { id: 'h4', no: 9, kind: 'lived', size: 2, neighbours: true, look: { feature: 0xd8e8c8, floor: 'wood', curtains: 0xc8902a } },
  { id: 's1', no: 2, kind: 'sale', size: 1, price: 500, name: 0, look: { feature: 0xf3dbe0, floor: 'wood', curtains: 0xd06080 } },
  { id: 's2', no: 4, kind: 'sale', size: 2, price: 1000, name: 1, look: { feature: 0xe2e8f2, floor: 'carpet', curtains: 0x3f6aa8 } },
  { id: 's3', no: 6, kind: 'sale', size: 4, price: 2000, name: 2, look: { feature: 0xe9e1cf, floor: 'wood', curtains: 0x7a5a3a } }
];
export const houseById = (id) => HOUSES.find((h) => h.id === id) ?? null;
// The flat's own look, kept when it is extended (it is dressing.mjs dressHome's sage wall while it is 7 × 6).
export const FLAT_LOOK = { feature: 0xdfe7d6, floor: 'wood', curtains: 0x5a7fb0 };

// Who lives where: the colleagues in the order the page has them (classic: the first alone at no. 3, the next two
// together at no. 5, the fourth at no. 7), and the neighbours (people who don't work with you) in h4.
export const COLLEAGUE_HOUSES = [];
export let NEIGHBOURS = 2;
// The town as made: { seed, street (strings.mjs `town.street.N`) }.
export const TOWN = { seed: 0, street: 0 };

// The recipe. A street name from the list; seven houses numbered 2 to 9 in any order (the flat is no. 1, and one number
// is skipped: there is never a no. 13 to worry about, nor every number); four lived in, three for sale.
export const RECIPE = {
  streets: 8, // strings.mjs town.street.0–7
  names: 10, // strings.mjs house.name.0–9
  numbers: [2, 3, 4, 5, 6, 7, 8, 9],
  // Which colleague lives in which house (with two together in one, or not), and how many neighbours (in h4).
  together: [['h1', 'h2', 'h2', 'h3'], ['h1', 'h1', 'h2', 'h3'], ['h1', 'h2', 'h3', 'h3'], ['h1', 'h2', 'h3', 'h2']],
  neighbours: [1, 2, 2],
  // The houses for sale: three sizes (SIZES index) from these, smallest first, and a price in a range by size (in
  // fifties), the classic town's 500 / 1000 / 2000 among them.
  saleSizes: [1, 1, 2, 2, 3, 4],
  prices: [null, [450, 650], [850, 1200], [1300, 1700], [1800, 2300]],
  feature: [0xe8d6c4, 0xcfe0e8, 0xf2e2b0, 0xd8e8c8, 0xf3dbe0, 0xe2e8f2, 0xe9e1cf, 0xdcd0e8, 0xf0d8c0, 0xc8e0d8, 0xe8e8d0, 0xf2cfc8],
  curtains: [0xb85c4a, 0x4a7a5a, 0x8a5aa0, 0xc8902a, 0xd06080, 0x3f6aa8, 0x7a5a3a, 0x2f7a8a, 0xa04a6a, 0x5a6a2a],
  floors: ['wood', 'wood', 'carpet'],
  roofs: 4 // dressing.mjs ROOFS
};
export function makeTown(seed = 0) {
  seed = Number(seed) | 0;
  TOWN.seed = seed;
  HOUSES.length = COLLEAGUE_HOUSES.length = 0;
  if (!seed) {
    HOUSES.push(...structuredClone(CLASSIC));
    COLLEAGUE_HOUSES.push('h1', 'h2', 'h2', 'h3');
    NEIGHBOURS = 2;
    TOWN.street = 0;
    return TOWN;
  }
  const r = seeded(seed), pick = (list) => list[Math.floor(r() * list.length)];
  const shuffle = (list) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  TOWN.street = Math.floor(r() * RECIPE.streets);
  const together = pick(RECIPE.together);
  COLLEAGUE_HOUSES.push(...together);
  NEIGHBOURS = pick(RECIPE.neighbours);
  const numbers = shuffle(RECIPE.numbers).slice(0, 7);
  const names = shuffle([...Array(RECIPE.names).keys()]);
  const saleSizes = shuffle(RECIPE.saleSizes).slice(0, 3).sort((a, b) => a - b);
  const look = () => ({ feature: pick(RECIPE.feature), floor: pick(RECIPE.floors), curtains: pick(RECIPE.curtains), brick: r() < 0.5, roof: Math.floor(r() * RECIPE.roofs) });
  for (const [k, id] of ['h1', 'h2', 'h3', 'h4'].entries()) {
    const two = id === 'h4' ? NEIGHBOURS > 1 : together.filter((x) => x === id).length > 1;
    HOUSES.push({ id, no: numbers[k], kind: 'lived', size: two ? 2 : 1 + Math.floor(r() * 2), ...(id === 'h4' ? { neighbours: true } : {}), look: look() });
  }
  for (const [k, size] of saleSizes.entries()) {
    const [lo, hi] = RECIPE.prices[size];
    HOUSES.push({ id: `s${k + 1}`, no: numbers[4 + k], kind: 'sale', size, price: lo + 50 * Math.floor(r() * ((hi - lo) / 50 + 1)), name: names[k], look: look() });
  }
  return TOWN;
}
makeTown(0);

// When people are home to be visited: awake (08:00–23:00), and not at work. Round at night and nobody comes to the door.
export const AWAKE = { from: 8 * 60, to: 23 * 60 };
export const awake = (minutes) => {
  const m = minutes % 1440;
  return m >= AWAKE.from && m < AWAKE.to;
};

// The parties: an evening at one of the lived-in houses, in turn, on Tuesdays, Thursdays, Fridays and Saturdays (day 1
// is a Monday). The ones who live there, the household's friends among the colleagues and neighbours, and anyone from
// the household who goes. Invited: someone in the household is Friends with someone who lives there (`INVITED`, the
// friendship's "Friends" level). Not invited, you can still turn up (the brief: "invited or not? could be funny").
export const PARTY = { from: 19 * 60, to: 23 * 60, days: [1, 3, 4, 5], guests: 4 };
export const INVITED = 25;
// The house throwing a party on the day of `minutes` (or null), from the lived-in houses that have someone in them.
export function partyHouse(minutes, lived) {
  if (!PARTY.days.includes(weekday(minutes)) || !lived.length) return null;
  return lived[Math.floor(minutes / 1440) % lived.length];
}
export const partyNow = (minutes) => {
  const m = minutes % 1440;
  return m >= PARTY.from && m < PARTY.to;
};

// A friend invited round (the phone, "Who lives here"): at the door a little later, staying a while, home by bedtime.
export const GUEST = { comes: 20, stays: 180 };
// A party at home: everyone the household is Friends with, for four hours, and the food costs this much.
export const HOME_PARTY = { cost: 40, minutes: 240 };

// Round 15: Sunny Lane as a place to walk down (world.mjs lifeStreet), instead of only a card. The houses' fronts stand
// in a row along the back of the street, by number, the flat's block first; a front is as wide as its house is big
// (`widths` by SIZES index). Across the road: the pavement, the lamps, and the bus stop to the park. Going from home to a
// house (or to the park) is out of the front door, along the street, and in at the other door.
export const FRONT = { flat: 8, widths: [7, 7.5, 7.5, 9, 9], gap: 1.8, from: -38 };
export const STREET_SIZE = { w: 84, d: 14 };
// Each front: { id ('flat' or a house's id), no, x (its middle), width, storeys, look, sale }.
export function streetLayout() {
  let x = FRONT.from;
  return [{ id: 'flat', no: 1, size: 0, look: FLAT_LOOK, flat: true }, ...[...HOUSES].sort((a, b) => a.no - b.no)].map((h) => {
    const width = h.flat ? FRONT.flat : FRONT.widths[h.size];
    const front = { id: h.id, no: h.no, x: x + width / 2, width, storeys: h.flat ? 3 : 2, look: h.look, sale: h.kind === 'sale', flat: !!h.flat };
    x += width + FRONT.gap;
    return front;
  });
}
