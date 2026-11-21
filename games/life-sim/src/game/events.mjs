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
//             friendship: at least, romance: at least, house: true (one whose house is on the street), free: true
//             (not at work now), traits: { trait: ×n } }; the likelier the better friends they are. No one who fits:
//             the event does not come up. keen: true (3.3, calls and knocks): how keen the keenest of them is (their
//             traits and the bond) makes the event itself likelier or rarer, so a chatty town rings more.
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
  },

  // ---- 3.2: gentle trouble (a hassle, soon over) ----
  // The loo won't flush (a hassle: not again for six days). Fixing it is the dice (phase 5's handiness skill will be the dice then; for now, who they are).
  {
    id: 'loo', icon: '🚽', where: ['home'], hours: [7, 22], weight: 0.8, again: 6,
    who: { from: 'neighbours' },
    choices: [
      { id: 'plumber', icon: '📞', cost: 30, done: { moodlet: 'sorted' } },
      { id: 'fix', icon: '🔧', chance: 0.5, traits: { clumsy: -0.2, neat: 0.1, bookworm: 0.1 }, good: { moodlet: 'handy', points: 30 }, bad: { moodlet: 'soggy', money: -30 } },
      { id: 'askWho', icon: '🏡', done: { friendship: 4, needs: { bladder: 100 }, moodlet: 'relief' } }
    ]
  },
  // A power cut in the evening: no telly and no oven at home for an hour and a half (POWER_CUT).
  {
    id: 'powerCut', icon: '🕯️', where: ['home'], hours: [19, 23], weight: 0.7, again: 5,
    choices: [
      { id: 'candles', icon: '🕯️', done: { moodlet: 'candlelit', mateMoodlet: 'candlelit', mateFriendship: 3, powerCut: 90 } },
      { id: 'stories', icon: '👻', when: (c) => !!c.mate, done: { moodlet: 'spooky', mateMoodlet: 'spooky', mateFriendship: 5, needs: { fun: 20 }, powerCut: 90 } },
      { id: 'bed', icon: '😴', done: { needs: { energy: 10 }, powerCut: 90 } }
    ]
  },
  // A drippy tap.
  {
    id: 'tap', icon: '🚰', where: ['home'], hours: [8, 22], weight: 0.7, again: 5, traits: { neat: 1.5 },
    choices: [
      { id: 'fix', icon: '🔧', chance: 0.6, traits: { clumsy: -0.25, neat: 0.1 }, good: { moodlet: 'handy', points: 20 }, bad: { moodlet: 'soggy' } },
      { id: 'plumber', icon: '📞', cost: 15, done: { moodlet: 'sorted' } },
      { id: 'bucket', icon: '🪣', done: { needs: { fun: -5 } } }
    ]
  },
  // Where are the keys? (A work morning.)
  {
    id: 'keys', icon: '🔑', where: ['home'], hours: [7, 9], days: [0, 1, 2, 3, 4], when: (c) => c.job > 0, traits: { messy: 2.5, neat: 0.4 },
    who: { from: 'neighbours' },
    choices: [
      { id: 'search', icon: '🔍', chance: 0.6, traits: { neat: 0.2, messy: -0.15 }, good: { moodlet: 'sorted' }, bad: { needs: { energy: -10 }, moodlet: 'oops' } },
      { id: 'mate', icon: '🙋', when: (c) => !!c.mate, done: { mateFriendship: 3, moodlet: 'sorted' } },
      { id: 'spare', icon: '🗝️', done: { friendship: 4, moodlet: 'sorted' } }
    ]
  },
  // A spider in the bath.
  {
    id: 'spider', icon: '🕷️', where: ['home'], hours: [7, 23], weight: 0.8, again: 3,
    choices: [
      { id: 'catch', icon: '🫙', chance: 0.7, traits: { shy: -0.2, sporty: 0.1, cheerful: 0.05 }, good: { moodlet: 'brave' }, bad: { moodlet: 'oops' } },
      { id: 'mate', icon: '🙋', when: (c) => !!c.mate, done: { mateFriendship: 2, mateMoodlet: 'brave' } },
      { id: 'name', icon: '🕷️', done: { needs: { fun: 10 } } }
    ]
  },
  // Music from next door, late.
  {
    id: 'noisy', icon: '🎵', where: ['home'], hours: [20, 23], weight: 0.7,
    who: { from: 'neighbours', traits: { chatty: 1.5, joker: 1.5, shy: 0.3 } },
    choices: [
      { id: 'ask', icon: '🙏', chance: 0.75, traits: { chatty: 0.1, grumpy: -0.2 }, good: { friendship: 4, needs: { energy: 5 } }, bad: { friendship: -2 } },
      { id: 'join', icon: '💃', done: { friendship: 6, needs: { fun: 30, social: 20, energy: -5 }, moodlet: 'party', count: 'party' } },
      { id: 'earplugs', icon: '😴', done: { needs: { energy: 5 } } }
    ]
  },
  // The printer jams at work.
  {
    id: 'printer', icon: '🖨️', where: ['office'], hours: [9, 17],
    who: { from: 'colleagues' },
    choices: [
      { id: 'fix', icon: '🔧', chance: 0.5, traits: { bookworm: 0.2, clumsy: -0.2 }, good: { moodlet: 'handy', points: 30 }, bad: { moodlet: 'oops' } },
      { id: 'askWho', icon: '🙋', done: { friendship: 4 } },
      { id: 'later', icon: '🤷', done: {} }
    ]
  },

  // ---- 3.2: nice surprises ----
  // A stray cat at the door. Adopting waits for pets (phase 5).
  {
    id: 'cat', icon: '🐱', kind: 'knock', where: ['home'], hours: [8, 20], weight: 0.9, traits: { cheerful: 1.3 },
    who: { from: 'neighbours' },
    choices: [
      { id: 'milk', icon: '🥛', done: { moodlet: 'catCuddle', needs: { fun: 20 } } },
      { id: 'owner', icon: '🔍', chance: 0.6, good: { friendship: 6, moodlet: 'goodDeed', points: 40 }, bad: { moodlet: 'goodDeed' } },
      { id: 'adopt', icon: '🏠', later: 5 }
    ]
  },
  // A busker.
  {
    id: 'busker', icon: '🎸', where: ['park', 'street'], hours: [10, 19], weather: ['sun'],
    choices: [
      { id: 'coin', icon: '🪙', cost: 2, done: { moodlet: 'music', needs: { fun: 15 } } },
      { id: 'dance', icon: '💃', done: { moodlet: 'danced', needs: { fun: 30, energy: -5 }, count: 'dance' } },
      { id: 'listen', icon: '👂', done: { needs: { fun: 10 } } }
    ]
  },
  // A parcel for the neighbours, left with you.
  {
    id: 'parcel', icon: '📦', where: ['home'], hours: [9, 18],
    who: { from: 'neighbours', house: true },
    choices: [
      { id: 'take', icon: '🚶', done: { friendship: 5, moodlet: 'goodDeed', go: 'whoHouse' } },
      { id: 'keep', icon: '📥', done: { friendship: 2 } }
    ]
  },
  // Free samples from a new café.
  {
    id: 'sample', icon: '🧁', where: ['park', 'street'], hours: [10, 18], traits: { foodie: 2.5 }, like: 'eat',
    choices: [
      { id: 'try', icon: '😋', chance: 0.75, traits: { foodie: 0.2 }, good: { needs: { hunger: 25 }, moodlet: 'yum' }, bad: { needs: { hunger: 10 }, moodlet: 'oops' } },
      { id: 'mate', icon: '🎁', when: (c) => !!c.mate, done: { mateFriendship: 3, mateMoodlet: 'yum' } },
      { id: 'no', icon: '🙂', done: {} }
    ]
  },
  // A raffle ticket.
  {
    id: 'raffle', icon: '🎟️', where: ['park', 'street'], hours: [10, 18], weight: 0.7, when: (c) => c.money >= 5,
    choices: [
      { id: 'buy', icon: '🎟️', cost: 5, chance: 0.2, good: { money: 60, moodlet: 'foundCoins', points: 30 }, bad: { needs: { fun: 5 } } },
      { id: 'no', icon: '🙂', done: {} }
    ]
  },
  // A kite stuck in a tree.
  {
    id: 'kite', icon: '🪁', where: ['park'], hours: [10, 18], weather: ['sun'], traits: { sporty: 1.5 },
    choices: [
      { id: 'climb', icon: '🧗', chance: 0.55, traits: { sporty: 0.25, lazy: -0.15, clumsy: -0.2 }, good: { moodlet: 'goodDeed', points: 50, needs: { energy: -5 } }, bad: { moodlet: 'oops', needs: { energy: -5 } } },
      { id: 'keeper', icon: '🧑‍🌾', done: { moodlet: 'goodDeed' } }
    ]
  },
  // Someone says something nice.
  {
    id: 'compliment', icon: '😊', where: ['park', 'street', 'office'], hours: [9, 20], goals: { popular: 1.5 },
    who: { from: 'anyone', friendship: 0, traits: { cheerful: 2, romantic: 1.5, grumpy: 0.2 } },
    choices: [
      { id: 'thanks', icon: '😊', done: { friendship: 3, moodlet: 'complimented' } },
      { id: 'back', icon: '💬', chance: 0.85, traits: { chatty: 0.1, shy: -0.2 }, good: { friendship: 6, moodlet: 'complimented', count: 'compliment' }, bad: { friendship: 1, moodlet: 'awkward' } }
    ]
  },
  // The little free library on the street.
  {
    id: 'library', icon: '📚', where: ['street'], hours: [8, 20], traits: { bookworm: 3 }, like: 'read',
    choices: [
      { id: 'take', icon: '📖', done: { moodlet: 'goodBook', needs: { fun: 15 } } },
      { id: 'swap', icon: '🔁', done: { moodlet: 'goodDeed', points: 20 } },
      { id: 'no', icon: '🙂', done: {} }
    ]
  },
  // A ball over the fence.
  {
    id: 'ball', icon: '⚽', where: ['home', 'street'], hours: [10, 19], traits: { sporty: 1.5 },
    who: { from: 'neighbours' },
    choices: [
      { id: 'kick', icon: '🦵', chance: 0.6, traits: { sporty: 0.3, clumsy: -0.2 }, good: { friendship: 4, needs: { fun: 20 }, moodlet: 'pumped' }, bad: { friendship: 2, needs: { fun: 10 }, moodlet: 'oops' } },
      { id: 'carry', icon: '🤲', done: { friendship: 3 } }
    ]
  },
  // Birds singing in the park.
  {
    id: 'birds', icon: '🐦', where: ['park'], hours: [6, 11], weather: ['sun', 'snow'], weight: 0.8, traits: { cheerful: 1.5, nightOwl: 0.5 },
    choices: [
      { id: 'whistle', icon: '🎶', chance: 0.6, good: { moodlet: 'birdsong', needs: { fun: 15 } }, bad: { needs: { fun: 10 } } },
      { id: 'listen', icon: '👂', done: { moodlet: 'birdsong' } }
    ]
  },

  // ---- 3.2: invitations ----
  // A birthday party tonight at their house: say yes and it is the evening's party (town.mjs PARTY hours), and you are
  // asked.
  {
    id: 'birthday', icon: '🎂', where: ['home', 'street', 'park', 'house'], hours: [9, 17], weight: 0.9, goals: { popular: 2 }, again: 4,
    who: { from: 'anyone', friendship: 10, house: true, traits: { chatty: 1.5, cheerful: 1.3 } },
    choices: [
      { id: 'yes', icon: '🎉', done: { friendship: 4, party: true, moodlet: 'invited', diary: true } },
      { id: 'present', icon: '🎁', cost: 15, done: { friendship: 8, party: true, moodlet: 'invited', diary: true } },
      { id: 'card', icon: '✉️', done: { friendship: 2 } }
    ]
  },
  // A wedding in the park this afternoon (one of theirs is getting married).
  {
    id: 'wedding', icon: '💒', where: ['home', 'street', 'park', 'house'], hours: [9, 14], weight: 0.6, goals: { family: 2, popular: 1.5 }, again: 5,
    who: { from: 'anyone', friendship: 25, traits: { romantic: 1.5 } },
    choices: [
      { id: 'go', icon: '💐', done: { friendship: 5, moodlet: 'weddingGuest', needs: { fun: 20, social: 20 }, count: 'party', go: 'park', diary: true } },
      { id: 'present', icon: '🎁', cost: 20, done: { friendship: 9, moodlet: 'weddingGuest', needs: { fun: 20, social: 20 }, count: 'party', go: 'park', diary: true } },
      { id: 'card', icon: '✉️', done: { friendship: 1 } }
    ]
  },
  // A talent show at the park (weekends).
  {
    id: 'talent', icon: '🎤', where: ['home', 'street', 'park'], hours: [10, 17], days: [5, 6], weather: ['sun'], weight: 0.9, traits: { joker: 2, chatty: 1.5, shy: 0.5 }, again: 3,
    choices: [
      { id: 'perform', icon: '🎤', chance: 0.5, traits: { joker: 0.2, chatty: 0.1, cheerful: 0.1, shy: -0.2 }, good: { moodlet: 'standingOvation', points: 100, money: 50, go: 'park', diary: true }, bad: { moodlet: 'gaveItAGo', points: 30, go: 'park' } },
      { id: 'watch', icon: '👏', done: { needs: { fun: 30 }, moodlet: 'laughed', go: 'park' } },
      { id: 'no', icon: '🙂', done: {} }
    ]
  },
  // A picnic in the park.
  {
    id: 'picnic', icon: '🧺', where: ['home', 'street'], hours: [10, 15], weather: ['sun'], weight: 0.8,
    who: { from: 'anyone', friendship: 25, traits: { foodie: 1.5, cheerful: 1.3 } },
    choices: [
      { id: 'go', icon: '🧺', done: { friendship: 6, needs: { hunger: 30, social: 20 }, moodlet: 'picnic', go: 'park' } },
      { id: 'no', icon: '🙂', done: { friendship: 1 } }
    ]
  },
  // A colleague's birthday at work.
  {
    id: 'officeCake', icon: '🎂', where: ['office'], hours: [10, 16], weight: 0.8,
    who: { from: 'colleagues' },
    choices: [
      { id: 'sing', icon: '🎶', done: { friendship: 5, whoMoodlet: 'party', moodlet: 'cake', needs: { fun: 15, hunger: 15 } } },
      { id: 'card', icon: '✉️', done: { friendship: 3 } },
      { id: 'slice', icon: '🍰', done: { needs: { hunger: 20 }, moodlet: 'cake' } }
    ]
  },

  // ---- 3.3: the town's people phone and knock. Who it is goes by their traits and how well they know you (`keen`) ----
  // A friend rings for a chat.
  {
    id: 'callChat', icon: '📞', kind: 'call', where: ['home', 'park', 'street', 'house'], hours: [9, 21], weight: 1.2, traits: { chatty: 1.5 },
    who: { from: 'anyone', friendship: 10, keen: true, traits: { chatty: 3, cheerful: 1.3, shy: 0.3, grumpy: 0.5 } },
    choices: [
      { id: 'chat', icon: '💬', done: { friendship: 5, needs: { social: 40, fun: 10 }, moodlet: 'goodChat', count: 'phone' } },
      { id: 'invite', icon: '🏠', when: (c) => c.place === 'home', done: { friendship: 4, invite: true } },
      { id: 'later', icon: '⏰', done: {} }
    ]
  },
  // Someone needs a hand (a wardrobe to move, a fence to paint).
  {
    id: 'callHelp', icon: '🛠️', kind: 'call', where: ['home', 'park', 'street'], hours: [10, 18], weight: 0.8, traits: { cheerful: 1.3, lazy: 0.6 },
    who: { from: 'anyone', friendship: 25, house: true, free: true, keen: true, traits: { clumsy: 2, lazy: 1.5, sporty: 0.7 } },
    choices: [
      { id: 'go', icon: '💪', done: { friendship: 8, needs: { energy: -10 }, moodlet: 'helpedOut', points: 40, go: 'whoHouse' } },
      { id: 'tip', icon: '💡', chance: 0.5, traits: { bookworm: 0.25 }, good: { friendship: 4, moodlet: 'helpedOut' }, bad: { friendship: 1 } },
      { id: 'no', icon: '🙁', done: {} }
    ]
  },
  // The news on the street (never anyone's secrets: a trumpet, a giant marrow, a parrot).
  {
    id: 'callGossip', icon: '🗞️', kind: 'call', where: ['home', 'park', 'street', 'house'], hours: [10, 21], weight: 0.9, traits: { chatty: 2, shy: 0.6 },
    who: { from: 'anyone', friendship: 10, keen: true, traits: { chatty: 3, joker: 1.5, shy: 0.2 } },
    choices: [
      { id: 'listen', icon: '👂', done: { friendship: 4, needs: { social: 30, fun: 15 }, moodlet: 'juicyNews', count: 'phone' } },
      { id: 'kind', icon: '😇', done: { friendship: 3, moodlet: 'goodDeed' } },
      { id: 'busy', icon: '⏰', done: {} }
    ]
  },
  // Come round to mine.
  {
    id: 'callCome', icon: '🏡', kind: 'call', where: ['home', 'park', 'street'], hours: [10, 20], weight: 0.9, goals: { popular: 1.5 },
    who: { from: 'anyone', friendship: 25, house: true, free: true, keen: true, traits: { chatty: 2, cheerful: 1.5, shy: 0.4 } },
    choices: [
      { id: 'go', icon: '🚶', done: { friendship: 5, go: 'whoHouse' } },
      { id: 'here', icon: '🏠', when: (c) => c.place === 'home', done: { friendship: 5, invite: true } },
      { id: 'no', icon: '🙂', done: {} }
    ]
  },
  // Someone sweet on them asks them out (a date in the park, as when asked in person).
  {
    id: 'callDate', icon: '🌹', kind: 'call', where: ['home', 'park', 'street', 'house'], hours: [10, 20], weight: 1.2, goals: { family: 2 },
    when: (c) => c.romance >= 15,
    who: { from: 'anyone', romance: 15, free: true, keen: true, traits: { romantic: 3, shy: 0.4 } },
    choices: [
      { id: 'yes', icon: '💕', done: { romance: 5, moodlet: 'smitten', date: true } },
      { id: 'no', icon: '🙂', done: { friendship: 1 } }
    ]
  },
  // A cup of sugar.
  {
    id: 'borrow', icon: '🥣', kind: 'knock', where: ['home'], hours: [9, 20],
    who: { from: 'neighbours', keen: true, traits: { foodie: 2, messy: 1.5 } },
    choices: [
      { id: 'give', icon: '🥄', done: { friendship: 5, moodlet: 'goodDeed' } },
      { id: 'bake', icon: '🧁', done: { friendship: 8, needs: { fun: 20, social: 20, hunger: 15 }, moodlet: 'cake', count: 'cook' } },
      { id: 'out', icon: '🤷', done: { friendship: 1 } }
    ]
  },
  // ---- 3.4: the weather's (weather.mjs). The kite, the picnic, the busker and the talent show want sunshine. ----
  // Caught in the rain.
  {
    id: 'caughtInRain', icon: '☔', where: ['park', 'street'], hours: [8, 21], weather: ['rain'], weight: 1.5,
    who: { from: 'anyone', free: true, traits: { cheerful: 1.5 } },
    choices: [
      { id: 'run', icon: '🏃', done: { needs: { energy: -5, hygiene: -5 } } },
      { id: 'dance', icon: '💃', done: { needs: { fun: 30, hygiene: -15 }, moodlet: 'singingInRain', count: 'dance' } },
      { id: 'umbrella', icon: '☂️', done: { friendship: 5, needs: { social: 15 } } }
    ]
  },
  // A rainbow.
  {
    id: 'rainbow', icon: '🌈', where: ['park', 'street', 'home'], hours: [12, 19], weather: ['rain'], weight: 0.8,
    choices: [
      { id: 'wish', icon: '✨', done: { moodlet: 'rainbow', points: 30 } },
      { id: 'show', icon: '👀', when: (c) => !!c.mate, done: { moodlet: 'rainbow', mateMoodlet: 'rainbow', mateFriendship: 3 } },
      { id: 'look', icon: '😊', done: { moodlet: 'rainbow' } }
    ]
  },
  // A snowball fight (or a snowman together: it stands in the park until the snow goes).
  {
    id: 'snowballs', icon: '❄️', where: ['park', 'street'], hours: [9, 18], weather: ['snow'], weight: 1.6,
    who: { from: 'anyone', free: true, traits: { joker: 2, sporty: 1.5, grumpy: 0.4 } },
    choices: [
      { id: 'fight', icon: '⛄', chance: 0.6, traits: { sporty: 0.2, lazy: -0.1 }, good: { friendship: 6, needs: { fun: 35 }, moodlet: 'laughed' }, bad: { friendship: 3, needs: { fun: 15 }, moodlet: 'brrr' } },
      { id: 'snowman', icon: '☃️', done: { friendship: 5, needs: { fun: 25 }, moodlet: 'snowman', count: 'buildSnowman' } },
      { id: 'no', icon: '🧣', done: {} }
    ]
  },
  // The ice-cream van.
  {
    id: 'iceCream', icon: '🍦', where: ['park', 'street'], hours: [12, 18], weather: ['sun'],
    choices: [
      { id: 'buy', icon: '🍦', cost: 3, done: { needs: { hunger: 15, fun: 10 }, moodlet: 'iceCream' } },
      { id: 'mate', icon: '🍨', cost: 6, when: (c) => !!c.mate, done: { needs: { hunger: 15 }, moodlet: 'iceCream', mateMoodlet: 'iceCream', mateFriendship: 3 } },
      { id: 'no', icon: '🙂', done: {} }
    ]
  },
  // Someone they hardly know drops by to say hello.
  {
    id: 'hello', icon: '👋', kind: 'knock', where: ['home'], hours: [10, 19], weight: 1.1, traits: { shy: 0.6 },
    who: { from: 'anyone', free: true, keen: true, traits: { chatty: 2.5, cheerful: 1.5, shy: 0.2 } },
    when: (c) => c.friends < 6,
    choices: [
      { id: 'in', icon: '☕', done: { friendship: 8, needs: { social: 25 }, invite: true } },
      { id: 'door', icon: '💬', done: { friendship: 4, needs: { social: 15 } } }
    ]
  }
];
// A power cut (the `powerCut` outcome): what can't be done at home until it is back.
export const POWER_CUT = { off: ['tv', 'cook'] };
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
  if (spec.romance != null && (p.romance ?? 0) < spec.romance) return 0;
  if (spec.free && !p.free) return 0;
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
  const keenest = (e) => Math.max(0, ...people.map((p) => whoWeight(e.who, p)));
  const pool = EVENTS.map((e) => [e, weightOf(e, c) * (e.who?.keen ? Math.min(3, Math.max(0.4, keenest(e) / 2)) : 1)])
    .filter(([e, k]) => k > 0 && (!e.who || keenest(e) > 0));
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
