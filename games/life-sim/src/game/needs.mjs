// What a Sim needs, and how they feel about it. All numbers are in GAME time (life.mjs: one game minute a second at
// normal speed). No need ever harms a Sim: at the bottom of a bar they drop everything to see to it (life.mjs).

// Each need runs 0–100 (full) and falls by `decay` points a game hour. Roughly: hungry ~5 h after a meal, the loo
// every ~4 h, a shower a day, tired after ~16 h awake.
export const NEEDS = [
  { id: 'hunger', icon: '🍎', decay: 9 },
  { id: 'energy', icon: '⚡', decay: 4.5 },
  { id: 'bladder', icon: '🚽', decay: 11 },
  { id: 'hygiene', icon: '🫧', decay: 3.5 },
  { id: 'fun', icon: '🎈', decay: 7 },
  { id: 'social', icon: '💬', decay: 4 }
];
export const NEED_IDS = NEEDS.map((n) => n.id);
export const needIcon = (id) => NEEDS.find((n) => n.id === id)?.icon ?? '';

// How much a need's level bothers a Sim, 0 (full) to 1 (empty), steeper near the bottom: going from 10 to 40 is worth
// far more than from 60 to 90, so the emptiest bar wins (The Sims' "motive curves", one curve for all).
export const urge = (v) => ((100 - Math.max(0, Math.min(100, v))) / 100) ** 2.2;

// Moodlets: little feelings with a cause, each pushing one emotion by `weight`. Two kinds:
//  - from a need (`when(needs, on)`): there while the need is low (or all are high), gone when it is not;
//  - from something that happened (`minutes`): added by an action, fading after that much game time.
// Emotions: happy, sad, cross, tired, uncomfortable. The strongest wins (moodOf).
export const MOODLETS = {
  hungry: { emotion: 'uncomfortable', weight: 1, icon: '🍽️', when: (n) => n.hunger < 25 && n.hunger >= 8 },
  starving: { emotion: 'cross', weight: 3, icon: '😫', when: (n) => n.hunger < 8 },
  sleepy: { emotion: 'tired', weight: 2, icon: '😴', when: (n) => n.energy < 20 },
  loo: { emotion: 'uncomfortable', weight: 2, icon: '🚽', when: (n) => n.bladder < 20 },
  stinky: { emotion: 'uncomfortable', weight: 1, icon: '🧦', when: (n) => n.hygiene < 20 },
  bored: { emotion: 'sad', weight: 1, icon: '🥱', when: (n) => n.fun < 20 },
  lonely: { emotion: 'sad', weight: 2, icon: '💭', when: (n) => n.social < 15 },
  // With a margin (on above 72, off below 65): at one line it switched on and off as a bar crossed it, and the mood
  // flickered between Happy and Fine (round 6). `on`: they have it now.
  great: { emotion: 'happy', weight: 1, icon: '🌟', when: (n, on) => NEED_IDS.every((id) => n[id] > (on ? 65 : 72)) },
  tasty: { emotion: 'happy', weight: 1, icon: '😋', minutes: 240 },
  rested: { emotion: 'happy', weight: 1, icon: '🛏️', minutes: 360 },
  fresh: { emotion: 'happy', weight: 1, icon: '🚿', minutes: 180 },
  danced: { emotion: 'happy', weight: 2, icon: '💃', minutes: 120 },
  goodChat: { emotion: 'happy', weight: 1, icon: '☎️', minutes: 180 },
  learned: { emotion: 'happy', weight: 1, icon: '💡', minutes: 120 },
  relief: { emotion: 'happy', weight: 1, icon: '😌', minutes: 45 },
  wokenUp: { emotion: 'cross', weight: 1, icon: '😤', minutes: 90 },
  // From being with someone (social.mjs).
  chatted: { emotion: 'happy', weight: 1, icon: '💬', minutes: 180 },
  laughed: { emotion: 'happy', weight: 1, icon: '😂', minutes: 120 },
  complimented: { emotion: 'happy', weight: 1, icon: '😊', minutes: 120 },
  hugged: { emotion: 'happy', weight: 2, icon: '🤗', minutes: 180 },
  smitten: { emotion: 'happy', weight: 2, icon: '💕', minutes: 240 },
  awkward: { emotion: 'uncomfortable', weight: 1, icon: '😬', minutes: 60 },
  teased: { emotion: 'cross', weight: 2, icon: '😤', minutes: 120 },
  // From work and money (work.mjs, round 8).
  promoted: { emotion: 'happy', weight: 2, icon: '🎉', minutes: 1440 },
  pizza: { emotion: 'happy', weight: 1, icon: '🍕', minutes: 240 },
  // Round 9: the office, the park, a date, moving in.
  cosy: { emotion: 'happy', weight: 1, icon: '☕', minutes: 120 },
  ducks: { emotion: 'happy', weight: 1, icon: '🦆', minutes: 180 },
  goodWork: { emotion: 'happy', weight: 1, icon: '⭐', minutes: 240 },
  date: { emotion: 'happy', weight: 2, icon: '🌹', minutes: 480 },
  movedIn: { emotion: 'happy', weight: 2, icon: '🏠', minutes: 1440 },
  // Round 10: at home in a flat made lovely (shop.mjs `beauty`); a new look from the chest of drawers.
  lovelyHome: { emotion: 'happy', weight: 1, icon: '🌸', minutes: 60 },
  newLook: { emotion: 'happy', weight: 1, icon: '👗', minutes: 360 },
  // Round 12: a baby (baby.mjs).
  newBaby: { emotion: 'happy', weight: 3, icon: '👶', minutes: 2880 },
  babyCare: { emotion: 'happy', weight: 1, icon: '🍼', minutes: 120 },
  justMarried: { emotion: 'happy', weight: 3, icon: '💍', minutes: 2880 },
  // Round 14: a party (at a friend's, or yours), and turning up at one nobody asked you to.
  party: { emotion: 'happy', weight: 2, icon: '🎉', minutes: 300 },
  gatecrasher: { emotion: 'happy', weight: 1, icon: '🙊', minutes: 240 }
};

export const EMOTIONS = {
  veryHappy: { icon: '😄', face: 'happy' },
  happy: { icon: '🙂', face: 'cheerful' },
  fine: { icon: '😌', face: 'neutral' },
  sad: { icon: '😢', face: 'sad' },
  cross: { icon: '😠', face: 'angry' },
  tired: { icon: '😴', face: 'sleepy' },
  uncomfortable: { icon: '😣', face: 'uncomfortable' }
};

// The Sim's emotion from their moodlets: the strongest bad feeling if it is at least as strong as the good ones,
// otherwise happy (very happy from 3), otherwise fine.
export function moodOf(active) {
  const sum = {};
  for (const id of active) {
    const m = MOODLETS[id];
    sum[m.emotion] = (sum[m.emotion] ?? 0) + m.weight;
  }
  const happy = sum.happy ?? 0;
  const [worst, w] = Object.entries(sum).filter(([e]) => e !== 'happy').sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  if (worst && w >= happy) return { emotion: worst, strength: w - happy };
  if (happy >= 3) return { emotion: 'veryHappy', strength: happy };
  if (happy >= 1) return { emotion: 'happy', strength: happy };
  return { emotion: 'fine', strength: 0 };
}
