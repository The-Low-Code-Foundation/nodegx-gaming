// How a new life begins (round 16, the roadmap's 1.3): chosen on the start screen after making your Sim, or "surprise
// me". Each start sets the money, the home, who else lives there and how they get on, and maybe a job. The page
// (page.mjs) applies it; the words are strings.mjs `start.<id>`, `start.<id>.does` and `start.<id>.toast`.
//
// A start:
//   icon     on its card
//   money    the household's coins to begin with
//   mate     who lives with you: null (alone), 'friend' or 'sweetheart' (someone else of the twelve, at random)
//   bond     how you and the mate get on (social.mjs: friendship −100…100, romance 0…100)
//   job      a job from day one: { career, level } (work.mjs CAREERS; level 0 is a trainee)
//   home     'flat' (the flat as it comes, all its furniture), or 'inherit': the biggest house for sale is yours, with
//            only the basics in it (`basics`, shop.mjs ids from FLAT_FURNITURE)
// A test's URL keeps the old start (a stranger as flatmate, 100 coins) unless ?story=<id> picks one.
export const STARTS = [
  { id: 'savings', icon: '💰', money: 600, mate: null, home: 'flat' },
  { id: 'friend', icon: '🛋️', money: 150, mate: 'friend', bond: { friendship: 45, romance: 0 }, home: 'flat' },
  { id: 'sweetheart', icon: '💕', money: 200, mate: 'sweetheart', bond: { friendship: 55, romance: 60 }, home: 'flat' },
  { id: 'broke', icon: '💼', money: 15, mate: null, job: { career: 'office', level: 2 }, home: 'flat' },
  { id: 'inherit', icon: '🏚️', money: 60, mate: null, home: 'inherit', basics: ['bed', 'fridge', 'oven', 'kitchenSink', 'toilet', 'basin', 'shower', 'table', 'chair'] }
];
export const startById = (id) => STARTS.find((s) => s.id === id) ?? null;
// "Surprise me": any of them, the same chance each.
export const surprise = () => STARTS[Math.floor(Math.random() * STARTS.length)];
