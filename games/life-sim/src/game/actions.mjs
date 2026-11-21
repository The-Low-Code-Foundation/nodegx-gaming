// What each thing offers a Sim, by its model name (world.mjs), or by its `use.offers` when the same model offers
// different things in different places (round 9: a chair at home is for eating, at the office for work). An offer:
//   id         its name in strings.mjs (`action.<id>`)
//   act        how the body does it (sim.mjs): sit · sleep · dance · interact (stand at it) · self (anywhere) · walk
//   clip       the animation while doing it (default: sitting, lying, dancing or the hands-busy "Interact")
//   minutes    how long it takes, in game minutes
//   gives      need points a game HOUR while doing it (negative takes)
//   until      stop early once this need is full (sleeping until rested)
//   slows      needs that fall slower meanwhile ({ hunger: 0.5 }: asleep, you get hungry half as fast)
//   moodlet    added when it finishes; `moodletIf` (needs before → true) to add it only sometimes
//   skill      skill points a game hour ({ science: 1 }: one level per game hour of reading, at first)
//   then       what comes next by itself ({ item: 'Chair_1', id: 'eat' }: cook, then sit down to eat)
//   offered    false: only ever reached through `then` (you eat the dinner you cooked)
//   when       (needs, hour) → false: free will does not consider it now (nobody goes back to bed at 8 am on 56%)
//   bonus      (needs, hour) → extra score for free will (bedtime)
//   cost       coins it costs, paid when it begins (round 8: a pizza); greyed out with the price when short
//   free       false: free will never chooses it (spending the money, looking for a job)
//   opens      a card the page shows when it is done ('jobs': the jobs going)
//   task       a work station's task (round 9): the page opens its questions when the Sim gets there; the game waits
//   travel     going somewhere else ('park', 'home'): walk to the door, and come out at that place's way in
//   hand       round 10: what they hold in their right hand meanwhile (props.mjs: 'fork', 'book', 'phone'…)
//   table      round 10: what stands on the table in front of them (sitting), or on the thing they use ('pan')
//   birthday   round 16, phase 6.2: only there on the birthday of someone in the household (the page: calendar.mjs)
//   steps      round 10: one action in parts, each until a share of its time (`upTo`), with its own clip, `hand`,
//              and `open` (a fridge's door open): take something out of the fridge, then eat it
// Free will (life.mjs) scores offers by `gives` alone: what doing it would do for the Sim's needs.
// Round 10: the fridge door opens, they reach in, it shuts, and they eat or drink what they took out.
// Reading a book off the shelf raises it in front of the face like a phone (mc_phone): the newspaper clip held it at
// the hip. The second step turns round from the fridge to the room (`turn`).
function FROM_FRIDGE(hand) {
  return [{ upTo: 0.3, clip: 'Interact', open: true }, { clip: 'mc_drink', hand, turn: Math.PI }];
}
export const OFFERS = {
  Bed_Single: [
    // Asleep, energy stops draining (`energy: 0`): it used to fall at the waking rate, so a 90-minute nap netted ~11
    // points (30 → 40.7, round 7) and looked like it did nothing. A night now fills the bar from ~10; a nap gives ~35.
    { id: 'sleep', act: 'sleep', minutes: 480, gives: { energy: 12 }, until: 'energy', slows: { energy: 0, hunger: 0.4, bladder: 0.4, fun: 0, social: 0.3 }, moodlet: 'rested', moodletIf: (before) => before.energy < 60,
      when: (n, h) => n.energy < 30 || (night(h) && n.energy < 85), bonus: (n, h) => (night(h) ? 0.25 : 0) },
    { id: 'nap', act: 'sleep', minutes: 90, gives: { energy: 24 }, slows: { energy: 0, hunger: 0.5, bladder: 0.5, fun: 0, social: 0.3 }, when: (n, h) => n.energy < 40 && !night(h) }
  ],
  Kitchen_Fridge: [
    { id: 'snack', act: 'interact', minutes: 10, gives: { hunger: 110 }, steps: FROM_FRIDGE('sandwich') },
    { id: 'juice', act: 'interact', minutes: 8, gives: { hunger: 30, fun: 25, bladder: -60 }, steps: FROM_FRIDGE('glass') }
  ],
  Kitchen_Oven: [
    { id: 'cook', act: 'interact', minutes: 30, gives: { fun: 8 }, then: { item: 'Chair_1', id: 'eat' }, advertises: { hunger: 160 }, table: 'pan' },
    // Round 16, phase 6.2: a birthday cake, baked (or bought by phone, below), then a slice at the table.
    { id: 'bakeCake', act: 'interact', minutes: 45, gives: { fun: 15 }, skill: { cooking: 1 }, then: { item: 'Chair_1', id: 'eatCake' }, table: 'pan', free: false, birthday: true, icon: '🎂' }
  ],
  Chair_1: [
    { id: 'eat', act: 'sit', clip: 'mc_eat', hand: 'fork', table: 'plate', minutes: 25, gives: { hunger: 180 }, until: 'hunger', moodlet: 'tasty', offered: false },
    { id: 'eatCake', act: 'sit', clip: 'mc_eat', hand: 'fork', table: 'cakePlate', minutes: 20, gives: { hunger: 90, fun: 60 }, moodlet: 'birthdayCake', offered: false, icon: '🍰' },
    { id: 'eatPizza', act: 'sit', clip: 'mc_eat', hand: 'pizzaSlice', table: 'pizzaPlate', minutes: 25, gives: { hunger: 200, fun: 50 }, until: 'hunger', moodlet: 'pizza', offered: false },
    { id: 'sitDown', act: 'sit', minutes: 30, gives: { energy: 3 } }
  ],
  Kitchen_Sink: [{ id: 'washUp', act: 'interact', minutes: 10, gives: { hygiene: 15 } }],
  Bathroom_Toilet: [{ id: 'loo', act: 'sit', minutes: 6, gives: { bladder: 1000 }, until: 'bladder', moodlet: 'relief', moodletIf: (before) => before.bladder < 30 }],
  Bathroom_Sink: [{ id: 'washHands', act: 'interact', minutes: 4, gives: { hygiene: 150 } }],
  Bathroom_Shower1: [{ id: 'shower', act: 'interact', clip: 'mc_stretch', minutes: 20, gives: { hygiene: 300 }, until: 'hygiene', moodlet: 'fresh', moodletIf: (before) => before.hygiene < 70 }],
  Couch_Medium1: [
    { id: 'tv', act: 'sit', minutes: 60, gives: { fun: 35, energy: -2 }, until: 'fun' },
    { id: 'sitDown', act: 'sit', minutes: 30, gives: { energy: 3 } }
  ],
  Bookshelf: [
    { id: 'read', act: 'interact', clip: 'mc_phone', hand: 'book', minutes: 60, gives: { fun: 18 } },
    { id: 'study', act: 'interact', clip: 'mc_phone', hand: 'book', minutes: 60, gives: { fun: 4 }, skill: { science: 1 } }
  ],
  Carpet_Round: [{ id: 'dance', act: 'dance', minutes: 45, gives: { fun: 70, energy: -8 }, until: 'fun', moodlet: 'danced' }],
  // On your Sim themselves (the "Your Sim" buttons, and free will).
  self: [
    { id: 'phone', act: 'self', clip: 'mc_phone', hand: 'phone', minutes: 30, gives: { social: 110, fun: 10 }, until: 'social', moodlet: 'goodChat', talk: true },
    { id: 'text', act: 'self', clip: 'mc_phone', hand: 'phone', minutes: 10, gives: { social: 80 } },
    { id: 'stretch', act: 'self', clip: 'mc_stretch', minutes: 5, gives: { energy: 6, fun: 6 }, offered: false },
    // Round 8: money, and a job. A pizza is ordered on the phone and eaten at the table; looking for a job ends with
    // the jobs going on a card (page.mjs), where the player chooses.
    { id: 'orderPizza', act: 'self', clip: 'mc_phone', hand: 'phone', minutes: 8, gives: {}, advertises: { hunger: 200, fun: 50 }, cost: 25, free: false, then: { item: 'Chair_1', id: 'eatPizza' }, icon: '🍕' },
    // Round 16, phase 6.2: on a birthday, a cake bought (BIRTHDAY.buy coins) and a party (the page's own: round 15).
    { id: 'orderCake', act: 'self', clip: 'mc_phone', hand: 'phone', minutes: 8, gives: {}, cost: 25, free: false, then: { item: 'Chair_1', id: 'eatCake' }, birthday: true, icon: '🎂' },
    { id: 'birthdayParty', act: 'self', clip: 'mc_phone', hand: 'phone', minutes: 10, gives: { social: 20 }, free: false, birthday: true, icon: '🥳' },
    { id: 'findJob', act: 'self', clip: 'mc_phone', hand: 'phone', minutes: 10, gives: {}, free: false, opens: 'jobs', icon: '💼' }
  ]
};

// Round 9: the office (lifeOffice) and the park (lifePark).
Object.assign(OFFERS, {
  // A work station: the Sim stands at it while the child answers its questions (page.mjs). Never free will's: the
  // questions are the child's to answer.
  station: [{ id: 'doTask', act: 'interact', clip: 'mc_workTable', minutes: 15, gives: { fun: 6 }, task: true, free: false, icon: '📋' }],
  // Their own desk: what a Sim at work does when nothing else needs doing (free will, a small steady pull).
  desk: [{ id: 'deskWork', act: 'sit', clip: 'mc_sitTable', minutes: 60, gives: {}, bonus: () => 0.15, icon: '💻' }],
  officeFridge: [{ id: 'snack', act: 'interact', minutes: 10, gives: { hunger: 110 }, steps: FROM_FRIDGE('sandwich') }],
  officeSink: [{ id: 'hotChocolate', act: 'interact', clip: 'mc_drink', hand: 'mug', minutes: 8, gives: { hunger: 25, fun: 40 }, moodlet: 'cosy' }],
  // A rest when tired or bored, not instead of work.
  officeCouch: [{ id: 'rest', act: 'sit', minutes: 30, gives: { energy: 10, fun: 12 }, when: (n) => n.energy < 45 || n.fun < 40 }],
  // Round 16, phase 5.3: the café's tables (world.mjs lifeCafe), served between the stations' questions, as a desk.
  cafeTable: [{ id: 'serveTables', act: 'interact', clip: 'mc_talk', talk: true, minutes: 45, gives: { social: 15 }, bonus: () => 0.15, icon: '🍽️' }],
  // Round 16, phase 5.4: the vet's kennels (world.mjs lifeVet), between questions, as the café's tables are.
  vetKennel: [{ id: 'tendPatients', act: 'interact', clip: 'Interact', minutes: 45, gives: { social: 10, fun: 10 }, bonus: () => 0.15, icon: '🐾' }],
  bench: [{ id: 'sitBench', act: 'sit', minutes: 30, gives: { energy: 4, fun: 20 } }],
  ducks: [{ id: 'feedDucks', act: 'interact', minutes: 20, gives: { fun: 90 }, moodlet: 'ducks', hand: 'bread' }],
  flowers: [{ id: 'smellFlowers', act: 'interact', minutes: 5, gives: { fun: 60 } }],
  parkDance: [
    { id: 'dance', act: 'dance', minutes: 45, gives: { fun: 70, energy: -8 }, until: 'fun', moodlet: 'danced' },
    // Round 16, phase 3.4: only in that weather (`weather`, weather.mjs): a snowman (it stays until the snow goes), puddles.
    { id: 'buildSnowman', act: 'interact', clip: 'Interact', minutes: 40, gives: { fun: 85, energy: -6 }, moodlet: 'snowman', weather: 'snow', icon: '⛄' },
    { id: 'splashPuddles', act: 'dance', minutes: 20, gives: { fun: 75, hygiene: -12 }, moodlet: 'splashy', weather: 'rain', icon: '💦' }
  ],
  // Round 10: what can be bought (shop.mjs). The telescope: fun, and science at the same rate as studying. The chest of
  // drawers: a new look (clothes and hair; the page's card, `opens: 'look'`), never free will's.
  telescope: [{ id: 'stargaze', act: 'interact', minutes: 45, gives: { fun: 50 }, skill: { science: 1 }, icon: '🔭' }],
  drawers: [{ id: 'changeLook', act: 'interact', minutes: 4, gives: { fun: 15 }, free: false, opens: 'look', icon: '👗' }],
  // Round 14: the furniture shop's new things. A bath, stood in like the shower; a fire to warm up by.
  bath: [{ id: 'bath', act: 'interact', clip: 'mc_stretch', minutes: 30, gives: { hygiene: 250, fun: 40 }, until: 'hygiene', moodlet: 'fresh', moodletIf: (before) => before.hygiene < 70 }],
  fireplace: [{ id: 'warmUp', act: 'interact', clip: 'mc_stretch', minutes: 30, gives: { fun: 45, energy: 6 }, moodlet: 'cosy', icon: '🔥' }],
  // Round 12: the baby's cot (baby.mjs). `baby`: the baby's need points a game hour (as `gives` is for the Sim);
  // `babyUntil`: stop once that need of the baby's is full; `babyAfter: 'sleep'`: the baby is asleep when it ends.
  // Free will sees to a baby whose needs are low (life.mjs `score`), never a sleeping one.
  cot: [
    { id: 'feedBaby', act: 'interact', hand: 'bottle', minutes: 15, gives: { fun: 10 }, baby: { hunger: 420 }, babyUntil: 'hunger', moodlet: 'babyCare', icon: '🍼' },
    { id: 'cuddleBaby', act: 'interact', clip: 'mc_phone', hand: 'baby', minutes: 15, gives: { social: 160, fun: 40 }, baby: { cuddles: 320 }, babyUntil: 'cuddles', moodlet: 'babyCare', icon: '🤗' },
    { id: 'lullaby', act: 'interact', clip: 'mc_talk', talk: true, minutes: 15, gives: { fun: 15 }, baby: { sleep: 120 }, babyAfter: 'sleep', moodlet: 'babyCare', icon: '🎵' }
  ],
  // The ways in and out. Home's front door to the park (any time); the park's bus stop home.
  // Round 14: every house's front door: home (when it isn't yours) and the park. "Go somewhere…" (the town) is the page's.
  Door_1: [
    { id: 'goHome', act: 'travel', travel: 'home', minutes: 1, gives: {}, free: false, icon: '🏠', away: true },
    { id: 'goPark', act: 'travel', travel: 'park', minutes: 1, gives: {}, free: false, icon: '🌳' }
  ],
  busStop: [{ id: 'goHome', act: 'travel', travel: 'home', minutes: 1, gives: {}, free: false, icon: '🏠' }],
  // Round 15: Sunny Lane's bus stop, to the park (and back to your own door). The houses' doors on the street are the
  // page's (who lives there, a party, for sale: page.mjs openDoorMenu).
  streetBus: [
    { id: 'goPark', act: 'travel', travel: 'park', minutes: 1, gives: {}, free: false, icon: '🌳' },
    { id: 'goHome', act: 'travel', travel: 'home', minutes: 1, gives: {}, free: false, icon: '🏠' }
  ]
});

// Round 15: a double bed (shop.mjs bigBed): each side sleeps and naps as a single bed does. Whose side is whose is the
// page's (shareBeds); free will leaves the other side of someone's bed to their partner (life.mjs `score`).
OFFERS.doubleBed = OFFERS.Bed_Single;

const night = (h) => h >= 22 || h < 6;

export const offersFor = (item) => OFFERS[item ? item.use?.offers ?? item.name : 'self'] ?? [];
export const offerById = (itemName, id) => (OFFERS[itemName] ?? []).find((o) => o.id === id);

// The icon an action shows in the to-do list: the need it is mostly for.
export function offerIcon(offer, needIcon) {
  if (offer.icon) return offer.icon;
  if (offer.skill?.science) return '🔬';
  if (offer.act === 'walk') return '👣';
  const [best] = Object.entries(offer.advertises ?? offer.gives ?? {}).sort((a, b) => b[1] - a[1]);
  return best ? needIcon(best[0]) : '•';
}
