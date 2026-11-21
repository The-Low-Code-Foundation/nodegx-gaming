// A town that lives without you (round 16, phase 4; the roadmap's 4.1). Once a game day, in the night when nobody is
// round anyone's house, the town's day is played out as data, with nobody drawn and no animation run: the people who
// live here (the colleagues and the neighbours, never the household) spend time together, become friends, fall in
// love, marry and have babies; they move house within the street; a house goes on the market when it empties and off it
// when someone moves in; and now and then someone new comes to live here (one of the twelve people not yet in town,
// with traits, likes and a dream of their own). Nobody gets older and nothing bad happens to anyone (PG).
//
// What drives it: each person's traits (traits.mjs: a chatty Sim makes friends faster, a romantic one falls in love,
// a grumpy one takes longer), their likes (likes.mjs: two who love the same things get on), and their bonds
// (social.mjs, the same bonds the household has with them). The dice are the town's (town.mjs townDice, one roll a
// day): one town on one day goes the same way every time, so `?seed=` stays repeatable.
//
// The household is never part of it: nobody here falls for someone the household has a romance with (`taken`), and
// nobody here starts a romance with the household (that is the player's to start). The houses the household lives in
// are never moved into, and a few houses always stay on the market so the household can still buy one.
//
// The page (page.mjs townLifeTick) gathers who and what is in town, calls `dayOfTown`, then makes what changed true in
// the world: the street's boards and windows, the houses' insides (built again next visit), beds, and a newcomer's body.
// The news it returns goes on the street's notice board (4.2). Words: strings.mjs `news.<kind>`.
import { bondOf, peekBond, friendshipLevel, romanceLevel } from './social.mjs';
import { RECIPE } from './town.mjs';
import { rollTraits } from './traits.mjs';
import { rollLikes, shared } from './likes.mjs';
import { rollGoal } from './goals.mjs';
import { BABY_NAMES } from './baby.mjs';

export const TOWNLIFE = {
  at: 3 * 60, // the town's day is played out at 03:00 (everyone home, asleep, nobody visiting)
  // How likely two people are to spend time together on a day: anyone in the street, more if they live together or work
  // together. And the friendship a day together gives, before how well they get on (`getOn`).
  meet: { base: 0.25, house: 0.45, work: 0.35 },
  friendship: [3, 9],
  // Where the town's bonds begin (`startTown`), the first day: the people who live together know each other well, the
  // colleagues a little, the rest of the street hardly.
  start: { house: [30, 60], work: [10, 35], street: [0, 15] },
  // A romance can start between two who are Friends (social.mjs FRIENDSHIP), both free (married to nobody, with no
  // sweetheart of their own, and no romance with the household); `chance` a day together, times their traits.
  romance: { friends: 25, chance: 0.3, points: [5, 12] },
  // In love and good friends: married, a chance a day.
  marry: { romance: 75, friendship: 55, chance: 0.12 },
  // A married couple living together: a baby, a chance a day, up to `most`.
  baby: { chance: 0.05, most: 2 },
  // Someone sharing a house with people who aren't their partner gets a place of their own; a family with a baby in
  // the smallest size of house moves to a bigger one (when one is on the market).
  moveOut: 0.03,
  bigger: 0.12,
  // Someone new, when a house is on the market and there is someone not yet in town: a chance a day, never two within
  // `gap` days. The first one waits `first` days (the town is new to the player too).
  newcomer: { chance: 0.2, gap: 4, first: 2 },
  // Houses always left on the market for the household (never all taken by the town).
  keepForSale: 1,
  // The notice board keeps the latest this many items (and the save).
  news: 12
};

// How well two get on, from their traits and likes: about 1, from 0.3 (two who grate) to 2 (made for each other).
const GET_ON = { cheerful: 0.2, chatty: 0.2, joker: 0.1, shy: -0.15, grumpy: -0.3 };
export function getOn(a, b) {
  let k = 1 + 0.25 * shared(a.likes, b.likes).length;
  for (const t of [...(a.traits ?? []), ...(b.traits ?? [])]) k += GET_ON[t] ?? 0;
  // Two jokers laugh at each other's jokes; a joker and a grumpy one don't.
  const has = (p, t) => p.traits?.includes(t);
  if (has(a, 'joker') && has(b, 'joker')) k += 0.2;
  if ((has(a, 'joker') && has(b, 'grumpy')) || (has(b, 'joker') && has(a, 'grumpy'))) k -= 0.2;
  if (a.likes && b.likes && (a.likes.activity === b.likes.dislike || b.likes.activity === a.likes.dislike)) k -= 0.15;
  return Math.max(0.3, Math.min(2, k));
}
// How likely a romance starts, by traits: a romantic falls easily, a shy one is slower.
const FALLS = { romantic: 1.7, cheerful: 1.1, shy: 0.7, grumpy: 0.6 };
const falls = (p) => (p.traits ?? []).reduce((k, t) => k * (FALLS[t] ?? 1), 1);

// A house's price when it goes on the market: in its size's range (town.mjs RECIPE), in fifties.
export function priceFor(size, random) {
  const [lo, hi] = RECIPE.prices[size] ?? RECIPE.prices[1];
  return lo + 50 * Math.floor(random() * ((hi - lo) / 50 + 1));
}

// The first day of town life: the bonds between the town's people who have none yet (the save's are kept).
export function startTown(people, random) {
  for (let i = 0; i < people.length; i++)
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i], b = people[j];
      if (peekBond(a, b)) continue;
      const [lo, hi] = a.house && a.house === b.house ? TOWNLIFE.start.house : a.job && b.job ? TOWNLIFE.start.work : TOWNLIFE.start.street;
      bondOf(a, b).friendship = Math.round(lo + random() * (hi - lo));
    }
}
// One day of the town. `w`:
//   day       the game day (1 = the first)
//   people    the town's people (Lives: who, name, house, traits, likes; `job` for a colleague), never the household
//   household the household's Lives (for `taken`: a romance with one of them)
//   houses    town.mjs HOUSES (changed in place: kind, price, name)
//   mine(id)  the household lives there (never moved into, never put on the market)
//   still(l)  this one can't move today (in view somewhere)
//   pool      who could move to town (person numbers), `woman(n)`, and `keepWoman` (one woman kept back for the nanny)
//   babies    the town's babies ([{ parents: [name, name], name, girl, day }], added to in place)
//   lastNew   the day someone last moved in (or null); nameOf(n): a person's name
// Returns { news: [{ icon, key, vars, who: [names] }], moved: Set of Lives, houses: Set of house ids changed,
// newcomer: { who, house, traits, likes, dream } or null }.
export function dayOfTown(w, random) {
  const T = TOWNLIFE, news = [], moved = new Set(), changed = new Set();
  const say = (icon, key, vars, who = []) => news.push({ icon, key, vars, who });
  const { people, houses } = w;
  const houseOf = (id) => houses.find((h) => h.id === id);
  const living = (id) => people.filter((p) => p.house === id);
  const no = (id) => houseOf(id)?.no;
  const taken = (p) => w.household.some((h) => bondOf(h, p).romance >= 15);
  const spouse = (p) => people.find((o) => o !== p && bondOf(p, o).married) ?? null;
  const sweetheart = (p) => people.find((o) => o !== p && bondOf(p, o).romance >= 40) ?? null;
  const roll = (lo, hi) => lo + random() * (hi - lo);
  // The houses the town can move into: on the market and not the household's, smallest first; leaving `keepForSale`.
  const forSale = () => houses.filter((h) => h.kind === 'sale' && !w.mine(h.id)).sort((a, b) => a.size - b.size || a.no - b.no);
  const spare = () => Math.max(0, forSale().length - T.keepForSale);
  const takeHouse = (h) => {
    h.kind = 'lived';
    delete h.price;
    changed.add(h.id);
  };
  const usedNames = () => new Set(houses.filter((h) => h.kind === 'sale').map((h) => h.name));
  const onMarket = (h) => {
    if (h.kind !== 'lived' || w.mine(h.id) || living(h.id).length) return;
    const free = [...Array(RECIPE.names).keys()].filter((n) => !usedNames().has(n));
    h.kind = 'sale';
    h.price = priceFor(h.size, random);
    h.name = free.length ? free[Math.floor(random() * free.length)] : h.name ?? 0;
    changed.add(h.id);
    say('🪧', 'news.forSale', { no: h.no, price: h.price });
  };
  const move = (p, id) => {
    const from = p.house;
    if (from === id) return;
    p.house = id;
    moved.add(p);
    changed.add(id);
    if (from) changed.add(from), onMarket(houseOf(from));
  };

  // The day together: each pair, a chance to spend time together, and what it does to their friendship and romance.
  for (let i = 0; i < people.length; i++)
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i], b = people[j], bond = bondOf(a, b);
      const meet = T.meet.base + (a.house && a.house === b.house ? T.meet.house : 0) + (a.job && b.job ? T.meet.work : 0);
      if (random() >= meet) continue;
      const k = getOn(a, b), was = { f: friendshipLevel(bond).id, r: romanceLevel(bond).id };
      // (Slower the closer they are: best friends take a while.)
      const slow = Math.max(0.15, 1 - Math.max(0, bond.friendship) / 110);
      bond.friendship = Math.max(-100, Math.min(100, bond.friendship + roll(...T.friendship) * k * slow - (k < 0.7 ? 5 : 0)));
      // A romance: two Friends, both free.
      const free = (p, q) => !spouse(p) && !taken(p) && [null, q].includes(sweetheart(p));
      if (bond.friendship >= T.romance.friends && !bond.married && free(a, b) && free(b, a) && random() < T.romance.chance * falls(a) * falls(b) * k)
        bond.romance = Math.min(100, bond.romance + roll(...T.romance.points));
      const now = { f: friendshipLevel(bond).id, r: romanceLevel(bond).id };
      if (now.r !== was.r && ['sweethearts', 'inLove'].includes(now.r)) say(now.r === 'inLove' ? '💞' : '💗', `news.${now.r}`, { a: a.name, b: b.name }, [a.name, b.name]);
      else if (now.f !== was.f && now.f === 'bestFriends') say('🤝', 'news.bestFriends', { a: a.name, b: b.name }, [a.name, b.name]);
    }

  // Weddings: in love and good friends, married to nobody. They live together after (a house of their own if they can).
  for (let i = 0; i < people.length; i++)
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i], b = people[j], bond = bondOf(a, b);
      if (bond.married || bond.romance < T.marry.romance || bond.friendship < T.marry.friendship || spouse(a) || spouse(b) || taken(a) || taken(b)) continue;
      if (random() >= T.marry.chance) continue;
      bond.married = true;
      say('💍', 'news.married', { a: a.name, b: b.name }, [a.name, b.name]);
      if (a.house === b.house || w.still(a) || w.still(b)) continue;
      // Into the house of the one who lives alone (the bigger, if both do), else a house of their own, else together.
      const alone = [a, b].filter((p) => p.house && living(p.house).length === 1).sort((p, q) => houseOf(q.house).size - houseOf(p.house).size);
      if (alone.length) {
        const host = alone[0], mover = host === a ? b : a;
        move(mover, host.house);
        say('🏡', 'news.together', { a: mover.name, b: host.name, no: no(host.house) }, [a.name, b.name]);
      } else if (spare()) {
        const h = forSale().at(-1);
        takeHouse(h);
        move(a, h.id), move(b, h.id);
        say('🏡', 'news.newHome', { a: a.name, b: b.name, no: h.no }, [a.name, b.name]);
      } else {
        move(b, a.house);
        say('🏡', 'news.together', { a: b.name, b: a.name, no: no(a.house) }, [a.name, b.name]);
      }
    }

  // Babies: a married couple who live together.
  const couples = [];
  for (let i = 0; i < people.length; i++)
    for (let j = i + 1; j < people.length; j++) if (bondOf(people[i], people[j]).married && people[i].house && people[i].house === people[j].house) couples.push([people[i], people[j]]);
  const babiesOf = ([a, b]) => w.babies.filter((x) => x.parents.includes(a.name) && x.parents.includes(b.name));
  for (const pair of couples) {
    if (babiesOf(pair).length >= T.baby.most || random() >= T.baby.chance) continue;
    const girl = random() < 0.5, names = BABY_NAMES[girl ? 'girl' : 'boy'], inTown = new Set(w.babies.map((x) => x.name));
    const free = names.filter((n) => !inTown.has(n)), name = (free.length ? free : names)[Math.floor(random() * (free.length || names.length))];
    w.babies.push({ parents: pair.map((p) => p.name), name, girl, day: w.day });
    say('👶', 'news.baby', { a: pair[0].name, b: pair[1].name, baby: name }, pair.map((p) => p.name));
  }

  // Moving house: a family with a baby into a bigger house; someone sharing with people not their partner, a place of
  // their own.
  for (const pair of couples) {
    const h = houseOf(pair[0].house);
    if (!babiesOf(pair).length || !h || h.size > 1 || pair.some((p) => w.still(p) || moved.has(p)) || random() >= T.bigger) continue;
    const bigger = spare() ? forSale().filter((x) => x.size > h.size).at(-1) : null;
    if (!bigger) continue;
    takeHouse(bigger);
    for (const p of living(h.id).filter((p) => pair.includes(p))) move(p, bigger.id);
    say('📦', 'news.bigger', { a: pair[0].name, b: pair[1].name, no: bigger.no }, pair.map((p) => p.name));
  }
  for (const p of people) {
    if (!p.house || w.still(p) || moved.has(p)) continue;
    const others = living(p.house).filter((o) => o !== p);
    const partner = others.some((o) => bondOf(p, o).married || bondOf(p, o).romance >= 40);
    if (!others.length || partner || !spare() || random() >= T.moveOut) continue;
    const h = forSale()[0];
    takeHouse(h);
    move(p, h.id);
    say('📦', 'news.moved', { a: p.name, no: h.no }, [p.name]);
  }

  // A house nobody lives in any more (someone moved in with the household) goes on the market.
  for (const h of houses) onMarket(h);

  // Someone new: into the smallest house on the market (the household's choice of houses kept).
  let newcomer = null;
  const since = w.lastNew == null ? w.day - 1 + T.newcomer.gap - T.newcomer.first : w.day - w.lastNew;
  const pool = w.pool.filter((n) => n !== w.keepWoman);
  if (pool.length && spare() && since >= T.newcomer.gap && random() < T.newcomer.chance) {
    const who = pool[Math.floor(random() * pool.length)], h = forSale()[0];
    takeHouse(h);
    newcomer = { who, house: h.id, traits: rollTraits(random), likes: rollLikes(random), dream: rollGoal([], random) };
    say('👋', 'news.welcome', { a: w.nameOf(who), no: h.no }, [w.nameOf(who)]);
  }
  return { news, moved, houses: changed, newcomer };
}
