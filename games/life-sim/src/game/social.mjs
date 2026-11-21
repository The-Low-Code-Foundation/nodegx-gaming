// Two Sims together: what one can do with the other (a chat, a joke, a hug…), whether it goes well, and the
// relationship it grows: a friendship that can also go down, and a romance (brief answer 2: "very Disney, hugs and
// hearts"). Life (life.mjs) runs an interaction; this file says what each one is and what it does to the bond.
//
// An interaction (`act: 'social'`, the same shape as an offer in actions.mjs, plus):
//   gives        need points a game hour for the one who starts it; `partnerGives` for the other (default: the same)
//   friendship   added to the friendship when it goes well; `fail` when it does not (default -3)
//   romance      added to the romance when it goes well
//   lock         what the bond needs before it is offered: { friendship: 25 } or { romance: 40 } (shown greyed out
//                with the level it needs, so a child sees that a hug comes after being friends)
//   chance       how likely it is to go well, before the bond and the other's mood (chanceOf)
//   moodlet      for the one who starts it when it goes well; `partnerMoodlet` for the other; `failMoodlet` (who
//                started it) when it does not (default 'awkward'); `partnerFailMoodlet` likewise
//   clip         what the one who starts it does (default: talking); `react` / `failReact`: what the other does after
//   close        stand this close (metres) instead of 0.85: a hug
//   talk         a conversation: they take turns talking for the whole time, instead of saying one thing and reacting
//   icon         on its button and in the to-do list
//   free         free will may choose it (never the mean ones; flirting only once a romance has begun)
//   hearts       hearts float up when it goes well
//   after        what happens when it goes well, beyond the bond (round 9): 'date' (to the park together) or 'moveIn';
//                round 12: 'baby'
//   only         'notHousehold': offered only to someone who doesn't live with you; 'household': only to someone who does;
//                'unmarried': only when neither is married
//   dressUp      round 12: both put on wedding clothes while it goes on (the page's `onDressUp`)
//   kiss         round 12: they lean in to each other while the one who started it 'says' it (the page's `lean`)
//   cost         round 16: coins it costs, paid when it begins (a present)
//   likes        round 16 (likes.mjs): 'shared' (more when they love the same thing) or 'gift' (more from a friend)
export const INTERACTIONS = [
  { id: 'chat', icon: '💬', act: 'social', minutes: 30, talk: true, gives: { social: 130, fun: 16 }, friendship: 8, fail: 1, chance: 0.92, moodlet: 'chatted', partnerMoodlet: 'chatted', failMoodlet: null, free: true },
  { id: 'joke', icon: '😂', act: 'social', minutes: 8, clip: 'mc_talkHappy', gives: { social: 140, fun: 220 }, friendship: 5, chance: 0.7, react: 'mc_clap', moodlet: 'laughed', partnerMoodlet: 'laughed', free: true },
  { id: 'compliment', icon: '😊', act: 'social', minutes: 5, clip: 'mc_talkHappy', gives: { social: 160 }, friendship: 4, romance: 1, chance: 0.85, react: 'mc_cheer', partnerMoodlet: 'complimented', free: true },
  { id: 'wave', icon: '👋', act: 'social', minutes: 2, clip: 'mc_wave', react: 'mc_wave', gives: { social: 150 }, friendship: 1, fail: 0, chance: 1, failMoodlet: null },
  { id: 'hug', icon: '🤗', act: 'social', minutes: 4, clip: 'Idle_Loop', close: 0.5, gives: { social: 300, fun: 60 }, friendship: 6, fail: -4, chance: 0.75, lock: { friendship: 25 }, moodlet: 'hugged', partnerMoodlet: 'hugged', hearts: '🤗', free: true },
  { id: 'flirt', icon: '😍', act: 'social', minutes: 6, clip: 'mc_talkHappy', gives: { social: 180, fun: 60 }, friendship: 2, romance: 10, fail: -2, chance: 0.65, lock: { friendship: 25 }, react: 'mc_clap', moodlet: 'smitten', partnerMoodlet: 'smitten', hearts: '💕', free: 'romance' },
  { id: 'kissCheek', icon: '😘', act: 'social', minutes: 4, clip: 'Idle_Loop', close: 0.5, gives: { social: 300, fun: 120 }, friendship: 3, romance: 12, fail: -3, chance: 0.75, lock: { romance: 40 }, moodlet: 'smitten', partnerMoodlet: 'smitten', hearts: '💖', free: 'romance' },
  // Round 9 (the brief, 10-29: "you can talk, flirt, ask them to move in with you, go on a date"). What happens next is
  // Life's (`after`): a date in the park (now, or straight after work), or moving in. Asked, never chosen by free will;
  // only offered to someone it makes sense for (`only`: page.mjs).
  { id: 'askDate', icon: '🌹', act: 'social', minutes: 5, clip: 'mc_talkHappy', gives: { social: 120, fun: 40 }, friendship: 3, romance: 8, fail: -2, chance: 0.75, lock: { romance: 15 }, react: 'mc_cheer', moodlet: 'smitten', partnerMoodlet: 'smitten', hearts: '🌹', after: 'date' },
  { id: 'askMoveIn', icon: '🏠', act: 'social', minutes: 6, clip: 'mc_talkHappy', gives: { social: 150, fun: 40 }, friendship: 5, romance: 5, fail: -3, chance: 0.7, lock: { romance: 40 }, react: 'mc_cheer', hearts: '🏠', after: 'moveIn', only: 'notHousehold' },
  // Round 12 (brief answer 2: "hugs and hearts and a baby appears"): in love and living together, a cuddle, hearts,
  // and a baby in a cot (baby.mjs). It always goes well; asked, never chosen by free will.
  // Round 12 (the brief, 10-31: "the possibility to get married… a local animation where a girl character wears a nice
  // white wedding dress and the guy a suit and they kiss and then boom they're married and back to original clothes.
  // Nothing religious, purely ceremonial"). Wherever they are: dressed up (`dressUp`, page.mjs), close for a kiss,
  // rings and hearts, married, and their own clothes back. Only for two who are married to nobody (`only`).
  { id: 'marry', icon: '💍', act: 'social', minutes: 10, clip: 'Idle_Loop', close: 0.55, gives: { social: 300, fun: 200 }, friendship: 5, romance: 5, chance: 1, lock: { romance: 75 }, react: 'mc_cheer', hearts: '💍', after: 'marry', dressUp: true, kiss: true, only: 'unmarried' },
  { id: 'haveBaby', icon: '👶', act: 'social', minutes: 6, clip: 'Idle_Loop', close: 0.5, gives: { social: 250, fun: 120 }, friendship: 4, romance: 4, chance: 1, lock: { romance: 75 }, react: 'mc_cheer', moodlet: 'smitten', partnerMoodlet: 'smitten', hearts: '💞', after: 'baby', only: 'household' },
  // Round 16 (likes.mjs): talking about favourite things (better when they share one: Life `likes: 'shared'`), and a
  // present (it costs; better from a friend who knows their favourites: `likes: 'gift'`). Never a present by free will.
  { id: 'talkLikes', icon: '💞', act: 'social', minutes: 20, talk: true, gives: { social: 140, fun: 30 }, friendship: 5, fail: 0, chance: 0.9, moodlet: 'chatted', partnerMoodlet: 'chatted', failMoodlet: null, free: true, likes: 'shared' },
  { id: 'gift', icon: '🎁', act: 'social', minutes: 4, clip: 'mc_talkHappy', cost: 15, gives: { social: 150, fun: 30 }, friendship: 6, chance: 1, react: 'mc_cheer', partnerMoodlet: 'niceGift', hearts: '🎁', likes: 'gift' },
  // PG badness (brief answer 5: "insulting people ok"): fun for the one who does it, not for the other, and the
  // friendship pays. Never chosen by free will.
  { id: 'tease', icon: '😜', act: 'social', minutes: 4, clip: 'mc_talkHappy', gives: { fun: 200, social: 60 }, partnerGives: { fun: -150 }, friendship: -10, fail: -10, chance: 1, react: 'mc_talkSad', partnerMoodlet: 'teased' }
];
export const interactionById = (id) => INTERACTIONS.find((i) => i.id === id);

// The levels, lowest first: a friendship from -100 to 100, a romance from 0 to 100.
export const FRIENDSHIP = [
  { id: 'rivals', from: -100 },
  { id: 'notKeen', from: -40 },
  { id: 'acquaintances', from: -10 },
  { id: 'friends', from: 25 },
  { id: 'goodFriends', from: 55 },
  { id: 'bestFriends', from: 85 }
];
export const ROMANCE = [
  { id: 'none', from: 0 },
  { id: 'crush', from: 15 },
  { id: 'sweethearts', from: 40 },
  { id: 'inLove', from: 75 }
];
const levelOf = (levels, v) => levels.findLast((l) => v >= l.from);

// What two Sims are to each other. One bond a pair, the same seen from either side. Flatmates start out knowing each
// other a little.
const bonds = new Map();
export function bondOf(a, b) {
  const key = [a.name, b.name].sort().join('+');
  if (!bonds.has(key)) bonds.set(key, { friendship: 5, romance: 0, married: false });
  return bonds.get(key);
}
// Every bond, for the save (round 10), and back again: [[key, { friendship, romance }], …].
export const allBonds = () => [...bonds].map(([k, b]) => [k, { ...b }]);
export function setBonds(list) {
  bonds.clear();
  for (const [k, b] of list ?? []) bonds.set(k, { friendship: Number(b.friendship) || 0, romance: Number(b.romance) || 0, married: !!b.married });
}
export const friendshipLevel = (bond) => levelOf(FRIENDSHIP, bond.friendship);
export const romanceLevel = (bond) => levelOf(ROMANCE, bond.romance);
// Who someone is married to (round 12), of `everyone`, or null.
export const spouseOf = (life, everyone) => everyone.find((o) => o !== life && bondOf(life, o).married) ?? null;

// Why an interaction is not on offer yet (the level it needs), or null when it is.
export function lockOf(ix, bond) {
  if (ix.lock?.friendship != null && bond.friendship < ix.lock.friendship) return { kind: 'friendship', level: levelOf(FRIENDSHIP, ix.lock.friendship).id };
  if (ix.lock?.romance != null && bond.romance < ix.lock.romance) return { kind: 'romance', level: levelOf(ROMANCE, ix.lock.romance).id };
  return null;
}

// How likely it is to go well: its own chance, better the closer they are past what it needs, and worse when the
// other is in a bad mood (a cross Sim does not want a hug).
const MOOD_BONUS = { veryHappy: 0.15, happy: 0.1, fine: 0, sad: -0.1, tired: -0.15, uncomfortable: -0.15, cross: -0.3 };
export function chanceOf(ix, bond, partnerMood) {
  const past = bond.friendship - (ix.lock?.friendship ?? 0);
  const p = ix.chance + past / 200 + (MOOD_BONUS[partnerMood] ?? 0);
  return ix.chance >= 1 ? 1 : Math.max(0.05, Math.min(0.97, p));
}

// What it did to the bond, `done` (0–1) of the way through. Returns the levels before and after, for the page.
export function applyOutcome(ix, bond, ok, done = 1) {
  const was = { friendship: friendshipLevel(bond).id, romance: romanceLevel(bond).id };
  bond.friendship = clamp(bond.friendship + (ok ? ix.friendship ?? 0 : ix.fail ?? -3) * done, -100, 100);
  bond.romance = clamp(bond.romance + (ok ? ix.romance ?? 0 : ix.romance ? -2 : 0) * done, 0, 100);
  return { was, now: { friendship: friendshipLevel(bond).id, romance: romanceLevel(bond).id } };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
