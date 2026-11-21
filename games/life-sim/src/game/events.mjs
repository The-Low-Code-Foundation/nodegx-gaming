// Things happen (round 16, phase 3; the roadmap's 3.1): a deck of small events, a few a day, for the Sim you look
// after. Data only; the page draws one now and then (page.mjs `eventsTick`), shows it as a card with two or three
// choices, rolls the dice for how a choice turns out, and puts the outcome into what the game already has: moodlets,
// needs, bonds, coins, happy points, the tally (wishes and dreams), the life story, a guest at the door, a party, a trip
// to the park. Nothing here harms a Sim: a hassle is soggy socks or a burnt crust, and it is soon over.
// Words: strings.mjs `event.<id>` (its title), `event.<id>.text`, `event.<id>.<choice>` (a button) and
// `event.<id>.<choice>.<result>` (what happened: `good` or `bad` after the dice, `done` when there are none).
// In the words: {name} the Sim, {who} the other person, {mate} who they live with, {house} the other person's house.

// How often. The deck is looked at every `every` game minutes between `from` and `to` (minutes in the day), and an
// event comes up with the chance that makes about `perDay` a day, never sooner than `gap` after the last one, never more
// than `most` in a day, and the same one not again for `again` days.
export const DECK = { perDay: 2.5, every: 30, gap: 150, from: 8 * 60, to: 22 * 60, most: 4, again: 2 };

// An event:
//   icon, weight (how likely, 1: as likely as any), kind: 'card' (default), 'call' (the phone rings), 'knock' (at the door)
//   where     the places it can happen: 'home', 'park', 'street', 'office', 'house' (someone else's)
//   hours     [from, to): the hours of the day          days   weekdays (0 Monday … 6 Sunday)
//   traits    { trait: ×n }   goals { goal: ×n }   like: an activity (likes.mjs): ×3 when it is their favourite
//   weather   the weathers it can happen in (phase 3.4)
//   when      (c) → false: not now (no flatmate to ask, no coins to spare)
//   who       someone it is about, from the town's people: { from: 'neighbours' | 'colleagues' | 'anyone',
//             friendship: at least, house: true (one whose house is on the street), traits: { trait: ×n } }; the
//             likelier the better friends they are. No one who fits: the event does not come up.
//   choices   two or three; each:
//     id, icon, cost (coins, paid when chosen: greyed when short), when (c) → false: not offered,
//     later     a phase number: shown greyed, "when that comes" (adopting the cat waits for pets)
//     chance    how likely it goes well (dice); traits { trait: +p }; then `good` and `bad` outcomes
//     done      the outcome when there are no dice
//   an outcome: money (coins), needs { need: +n }, moodlet (theirs), whoMoodlet, mateMoodlet, friendship (with who),
//             romance (with who), mateFriendship, points (happy points), count (an id for the tally: wishes and
//             dreams), go ('park' | 'whoHouse'), invite (who comes round), party (a party at who's house tonight),
//             date (a date with who), powerCut (minutes without power at home), diary (into the life story)
// `c` (the page's): { place, hour, day, weekday, weather, traits, likes, goal, money, job, friends, romance, babies,
//   has, mate (the name of someone they live with who is here, or null), seen: { id: day } }
export const EVENTS = [
  // A neighbour at the door with a cake.
  {
    id: 'cake', icon: '🍰', kind: 'knock', where: ['home'], hours: [10, 19], weight: 1.2,
    who: { from: 'neighbours', traits: { cheerful: 2, foodie: 2, grumpy: 0.3, shy: 0.6 } },
    choices: [
      { id: 'thanks', icon: '😋', done: { friendship: 6, needs: { hunger: 25 }, moodlet: 'cake', whoMoodlet: 'goodDeed' } },
      { id: 'invite', icon: '☕', done: { friendship: 9, needs: { hunger: 25, social: 15 }, moodlet: 'cake', invite: true } },
      { id: 'later', icon: '🙂', done: { friendship: 3 } }
    ]
  },
  // The toast burns.
  {
    id: 'toast', icon: '🍞', where: ['home'], hours: [7, 11], traits: { clumsy: 2.5, foodie: 1.3 },
    choices: [
      { id: 'scrape', icon: '🔪', chance: 0.6, traits: { neat: 0.15, clumsy: -0.2 }, good: { needs: { hunger: 20 }, moodlet: 'crunchy' }, bad: { needs: { hunger: 10 }, moodlet: 'oops' } },
      { id: 'again', icon: '🍞', done: { needs: { hunger: 30, fun: -5 } } },
      { id: 'laugh', icon: '😂', done: { needs: { fun: 15, hunger: 10 }, moodlet: 'laughed' } }
    ]
  },
  // Coins in the grass at the park.
  {
    id: 'coins', icon: '🪙', where: ['park'], hours: [9, 20],
    choices: [
      { id: 'keep', icon: '👛', chance: 0.5, good: { money: 20, moodlet: 'foundCoins' }, bad: { money: 5, moodlet: 'foundCoins' } },
      { id: 'handIn', icon: '😇', done: { moodlet: 'goodDeed', points: 40 } },
      { id: 'ducks', icon: '🦆', when: (c) => c.weather !== 'rain', done: { needs: { fun: 25 }, moodlet: 'ducks', count: 'feedDucks' } }
    ]
  }
];
export const eventById = (id) => EVENTS.find((e) => e.id === id) ?? null;

// How likely an event is now, for `c` (0: not now).
export function weightOf(e, c) {
  if (e.where && !e.where.includes(c.place)) return 0;
  if (e.hours && !(c.hour >= e.hours[0] && c.hour < e.hours[1])) return 0;
  if (e.days && !e.days.includes(c.weekday)) return 0;
  if (e.weather && !e.weather.includes(c.weather)) return 0;
  if (e.when && !e.when(c)) return 0;
  if (c.seen?.[e.id] != null && c.day - c.seen[e.id] < (e.again ?? DECK.again)) return 0;
  let k = e.weight ?? 1;
  for (const t of c.traits ?? []) k *= e.traits?.[t] ?? 1;
  if (c.goal) k *= e.goals?.[c.goal] ?? 1;
  if (e.like && c.likes?.activity === e.like) k *= 3;
  return k;
}
// How likely someone is to be the one an event is about. `p`: { friendship, traits, neighbour, colleague, house }.
export function whoWeight(spec, p) {
  if (spec.from === 'neighbours' && !p.neighbour) return 0;
  if (spec.from === 'colleagues' && !p.colleague) return 0;
  if (spec.house && !p.house) return 0;
  if (spec.friendship != null && p.friendship < spec.friendship) return 0;
  let k = 1 + Math.max(0, p.friendship) / 40;
  for (const t of p.traits ?? []) k *= spec.traits?.[t] ?? 1;
  return k;
}
const pick = (pool, random) => {
  let r = random() * pool.reduce((s, [, k]) => s + k, 0);
  for (const [x, k] of pool) if ((r -= k) <= 0) return x;
  return pool.at(-1)?.[0] ?? null;
};
// Someone for an event, of `people` ([{ life, friendship, traits, neighbour, colleague, house }]), or null.
export const pickWho = (e, people, random = Math.random) =>
  e.who ? pick(people.map((p) => [p, whoWeight(e.who, p)]).filter(([, k]) => k > 0), random)?.life ?? null : null;
// An event to happen now (and who it is about), or null. `people` as for pickWho.
export function pickEvent(c, people, random = Math.random) {
  const pool = EVENTS.map((e) => [e, weightOf(e, c)]).filter(([e, k]) => k > 0 && (!e.who || people.some((p) => whoWeight(e.who, p) > 0)));
  const e = pool.length ? pick(pool, random) : null;
  return e ? { event: e, who: pickWho(e, people, random) } : null;
}
// How likely a choice is to go well for a Sim with these traits.
export function chanceOf(choice, traits = []) {
  let p = choice.chance ?? 1;
  for (const t of traits) p += choice.traits?.[t] ?? 0;
  return Math.max(0.05, Math.min(0.95, p));
}
// How a choice turned out: { result: 'good' | 'bad' | 'done', out (the outcome) }.
export function outcomeOf(choice, traits = [], random = Math.random) {
  if (choice.chance == null) return { result: 'done', out: choice.done ?? {} };
  const good = random() < chanceOf(choice, traits);
  return { result: good ? 'good' : 'bad', out: (good ? choice.good : choice.bad) ?? {} };
}
