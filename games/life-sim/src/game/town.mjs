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
export const STREET = 'Sunny Lane';

// The houses. `lived`: people live there (the colleagues, and two neighbours who don't work with you: `neighbours`);
// `sale`: empty and for sale, to go and look round, and to buy. `no`: its number in the street (the flat is 1).
// `look`: dressing.mjs dressHouse (the back wall inside, the floor, the curtains).
export const HOUSES = [
  { id: 'h1', no: 3, kind: 'lived', size: 1, look: { feature: 0xe8d6c4, floor: 'wood', curtains: 0xb85c4a } },
  { id: 'h2', no: 5, kind: 'lived', size: 2, look: { feature: 0xcfe0e8, floor: 'carpet', curtains: 0x4a7a5a } },
  { id: 'h3', no: 7, kind: 'lived', size: 1, look: { feature: 0xf2e2b0, floor: 'wood', curtains: 0x8a5aa0 } },
  { id: 'h4', no: 9, kind: 'lived', size: 2, neighbours: true, look: { feature: 0xd8e8c8, floor: 'wood', curtains: 0xc8902a } },
  { id: 's1', no: 2, kind: 'sale', size: 1, price: 500, look: { feature: 0xf3dbe0, floor: 'wood', curtains: 0xd06080 } },
  { id: 's2', no: 4, kind: 'sale', size: 2, price: 1000, look: { feature: 0xe2e8f2, floor: 'carpet', curtains: 0x3f6aa8 } },
  { id: 's3', no: 6, kind: 'sale', size: 4, price: 2000, look: { feature: 0xe9e1cf, floor: 'wood', curtains: 0x7a5a3a } }
];
export const houseById = (id) => HOUSES.find((h) => h.id === id) ?? null;
// The flat's own look, kept when it is extended (it is dressing.mjs dressHome's sage wall while it is 7 × 6).
export const FLAT_LOOK = { feature: 0xdfe7d6, floor: 'wood', curtains: 0x5a7fb0 };

// Who lives where: the colleagues in the order the page has them (the first alone at no. 3, the next two together at
// no. 5, the fourth at no. 7), and two neighbours (people who don't work with you) at no. 9.
export const COLLEAGUE_HOUSES = ['h1', 'h2', 'h2', 'h3'];
export const NEIGHBOURS = 2;

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
