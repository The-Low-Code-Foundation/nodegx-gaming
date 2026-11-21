// A job (round 8; round 9: at the office). What a career is, when its days are, what it pays and how to be promoted.
// Life (life.mjs) runs it: on a work day the Sim leaves at `leave`, goes to the office (world.mjs lifeOffice), works
// there until `ends` (you follow them: the brief, 10-29, "I expected we'd be able to follow our sim to work and see the
// office"), and comes home with the day's pay. At the office the work stations (one a school subject) each ask a few
// questions: every right answer earns coins on the spot and fills the promotion bar (TASK). The bar also fills a
// little every hour there, faster in a good mood. Full at the end of the day: promoted. No game over, no clock on a
// question, nothing lost for a wrong answer.
//
// A career:
//   icon       on its card and in the Job panel
//   days       the work days, 0 = Monday … 6 = Sunday (day 1 of the game is a Monday)
//   leave      game minutes after midnight they set off (walk to the door); `starts` and `ends` the working day
//   work       how the needs fall at work (`slows`: they use the loo there, and the office has no loo to show), as the
//              actions.mjs offers say it
//   levels     lowest first: `pay` a day, `days` (days at work that fill the promotion bar on their own)
// Round 16, phase 5.3 (more careers):
//   place      where the work is (the page's place, built the first time someone has the job): 'office' if not said
//   stations   the work stations there, by school subject (world.mjs STATIONS): all six if not said. Their names are
//              the career's (strings.mjs `station.<career>.<subject>`), the questions the school year's
//   learns     skill points each right answer gives too (skills.mjs: a café chef learns cooking)
//   skills     true: only in a game with skills on (a test URL needs ?skills=1)
export const CAREERS = {
  office: {
    icon: '🏢',
    days: [0, 1, 2, 3, 4],
    leave: 8 * 60 + 30,
    starts: 9 * 60,
    ends: 15 * 60,
    work: { id: 'work', slows: { hunger: 0.7, energy: 1, bladder: 0, hygiene: 0.8, fun: 0.9, social: 0.8 } },
    levels: [
      { id: 'trainee', pay: 60, days: 3 },
      { id: 'assistant', pay: 85, days: 4 },
      { id: 'teamMember', pay: 120, days: 4 },
      { id: 'teamLeader', pay: 160, days: 5 },
      { id: 'manager', pay: 210, days: 5 },
      { id: 'boss', pay: 280 }
    ]
  },
  // The café chef: Wednesday to Sunday (the weekend is the café's busy time), late morning to late afternoon, at the
  // café (world.mjs lifeCafe). Pay a little under the office's, and cooking learnt at every right answer.
  cafe: {
    icon: '☕',
    skills: true,
    place: 'cafe',
    days: [2, 3, 4, 5, 6],
    leave: 10 * 60 + 30,
    starts: 11 * 60,
    ends: 17 * 60,
    work: { id: 'work', slows: { hunger: 0.7, energy: 1, bladder: 0, hygiene: 0.8, fun: 0.9, social: 0.8 } },
    stations: ['maths', 'science', 'geography', 'english'],
    learns: { cooking: 0.3 },
    levels: [
      { id: 'kitchenHelper', pay: 50, days: 3 },
      { id: 'commis', pay: 75, days: 4 },
      { id: 'cook', pay: 105, days: 4 },
      { id: 'sousChef', pay: 145, days: 5 },
      { id: 'headChef', pay: 200, days: 5 },
      { id: 'starChef', pay: 260 }
    ]
  }
};

// A work station's task: `questions` in a row; each right answer pays `pay(level)` coins at once, fills the promotion
// bar by `bar` and gives the subject's skill `skill` points.
export const TASK = { questions: 3, pay: (level) => 5 + 2 * level, bar: 6, skill: 0.4 };

// How much a good mood helps at work: the promotion bar fills this much faster (or slower) an hour.
export const MOOD_AT_WORK = { veryHappy: 1.5, happy: 1.25, fine: 1, sad: 0.75, tired: 0.75, uncomfortable: 0.75, cross: 0.6 };

// The money a household starts with, and what a pizza costs (the one thing to spend it on, for now: actions.mjs).
export const START_MONEY = 100;

export const weekday = (minutes) => Math.floor(minutes / 1440) % 7;
export const careerOf = (job) => CAREERS[job.career];
// Where a career's work is (a place's name), and its stations.
export const workPlaceOf = (job) => careerOf(job).place ?? 'office';
export const stationsOf = (job, all) => careerOf(job).stations ?? all;
export const levelOfJob = (job) => careerOf(job).levels[job.level];
export const nextLevel = (job) => careerOf(job).levels[job.level + 1] ?? null;
// Is `minutes` (game minutes since day 1 began) inside a work day's going-to-work window?
export const timeForWork = (job, minutes) => {
  const c = careerOf(job), m = minutes % 1440;
  return c.days.includes(weekday(minutes)) && m >= c.leave && m < c.ends - 30;
};
