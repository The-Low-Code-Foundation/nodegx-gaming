// Life goals (round 16, the roadmap's 2.1): a dream chosen at the start (or rolled), a chain of steps toward it, happy
// points for each step, and a celebration at the end, after which you pick another. Data only: each step is a test on
// the Sim's facts, which the page gathers (page.mjs `factsOf`):
//   friends, goodFriends, bestFriends   how many people they are Friends / Good friends / Best friends with
//   romance        their strongest romance (0–100)        married      married to someone
//   together       in love with someone they live with   babies       babies in the household
//   job            0 no job, 1 trainee … 6 boss            homeSize     the home's size (town.mjs SIZES index)
//   ownHouse       they have bought a house                beauty       how lovely the home is (shop.mjs `beauty`)
//   things         things bought for the home              has          { shop id: true } what stands in the home
//   science        their science level                     tally        { what: times } what they have done (Life `count`)
//   skills         round 16, phase 5: { skill: level } (skills.mjs; cooking, painting…)
// Words: strings.mjs `goal.<id>`, `goal.<id>.does`, `goal.<id>.<step>`.
// Phase 5 adds skills (skills.mjs): the master chef climbs the cooking skill (meals cooked are what teach it).
export const GOALS = [
  {
    id: 'family', icon: '👨‍👩‍👧',
    steps: [
      { id: 'crush', icon: '💗', test: (f) => f.romance >= 15 },
      { id: 'sweetheart', icon: '🌹', test: (f) => f.romance >= 40 },
      { id: 'together', icon: '🏠', test: (f) => f.together || f.married },
      { id: 'married', icon: '💍', test: (f) => f.married },
      { id: 'baby', icon: '👶', test: (f) => f.babies >= 1 },
      { id: 'twoBabies', icon: '👶👶', test: (f) => f.babies >= 2 }
    ]
  },
  {
    id: 'career', icon: '💼',
    steps: [
      { id: 'job', icon: '📋', test: (f) => f.job >= 1 },
      { id: 'assistant', icon: '📎', test: (f) => f.job >= 2 },
      { id: 'teamMember', icon: '🤝', test: (f) => f.job >= 3 },
      { id: 'teamLeader', icon: '📣', test: (f) => f.job >= 4 },
      { id: 'manager', icon: '📊', test: (f) => f.job >= 5 },
      { id: 'boss', icon: '👑', test: (f) => f.job >= 6 }
    ]
  },
  {
    id: 'dreamHouse', icon: '🏡',
    steps: [
      { id: 'threeThings', icon: '🛒', test: (f) => f.things >= 3 },
      { id: 'lovely', icon: '🌸', test: (f) => f.beauty >= 3 },
      { id: 'moreRoom', icon: '📐', test: (f) => f.homeSize >= 1 || f.ownHouse },
      { id: 'veryLovely', icon: '💐', test: (f) => f.beauty >= 8 },
      { id: 'ownHouse', icon: '🔑', test: (f) => f.ownHouse },
      { id: 'mansion', icon: '🏰', test: (f) => f.homeSize >= 3 && f.beauty >= 12 }
    ]
  },
  {
    id: 'popular', icon: '🌟',
    steps: [
      { id: 'firstFriend', icon: '🤝', test: (f) => f.friends >= 1 },
      { id: 'threeFriends', icon: '👥', test: (f) => f.friends >= 3 },
      { id: 'goodFriend', icon: '😊', test: (f) => f.goodFriends >= 1 },
      { id: 'hostParty', icon: '🎉', test: (f) => (f.tally.hostParty ?? 0) >= 1 },
      { id: 'fiveFriends', icon: '🎊', test: (f) => f.friends >= 5 },
      { id: 'bestFriend', icon: '💖', test: (f) => f.bestFriends >= 1 }
    ]
  },
  {
    id: 'chef', icon: '👩‍🍳',
    steps: [
      { id: 'firstMeal', icon: '🍳', test: (f) => (f.tally.cook ?? 0) >= 1 },
      { id: 'cookingThree', icon: '🍲', test: (f) => (f.skills?.cooking ?? 0) >= 3 },
      { id: 'bigOven', icon: '🔥', test: (f) => !!f.has.bigOven },
      { id: 'cookingFive', icon: '🥘', test: (f) => (f.skills?.cooking ?? 0) >= 5 },
      { id: 'dinnerParty', icon: '🍽️', test: (f) => (f.tally.hostParty ?? 0) >= 1 && (f.skills?.cooking ?? 0) >= 6 },
      { id: 'masterChef', icon: '⭐', test: (f) => (f.skills?.cooking ?? 0) >= 8 }
    ]
  },
  // Waits for phase 5 (skills from objects: an easel, painting): not offered until then.
  { id: 'artist', icon: '🎨', later: 5, steps: [] }
];
export const goalById = (id) => GOALS.find((g) => g.id === id) ?? null;
// The ones that can be chosen now (not waiting for a later phase, not already done).
export const openGoals = (done = []) => GOALS.filter((g) => !g.later && !done.includes(g.id));
// Happy points for each step, and for the dream come true (its celebration).
export const STEP_POINTS = 150;
export const GOAL_POINTS = 1000;
// A dream at random.
export const rollGoal = (done = [], random = Math.random) => {
  const open = openGoals(done);
  return open.length ? open[Math.floor(random() * open.length)].id : null;
};
// Where a Sim is with their goal ({ id, step }): the steps done, given their facts. Returns how many steps are done
// now (from `step` on); the page rewards each one.
export function stepsDone(goal, facts) {
  const g = goalById(goal?.id);
  if (!g) return 0;
  let k = goal.step;
  while (k < g.steps.length && g.steps[k].test(facts)) k++;
  return k - goal.step;
}
