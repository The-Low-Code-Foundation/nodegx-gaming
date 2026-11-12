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
export const levelOfJob = (job) => careerOf(job).levels[job.level];
export const nextLevel = (job) => careerOf(job).levels[job.level + 1] ?? null;
// Is `minutes` (game minutes since day 1 began) inside a work day's going-to-work window?
export const timeForWork = (job, minutes) => {
  const c = careerOf(job), m = minutes % 1440;
  return c.days.includes(weekday(minutes)) && m >= c.leave && m < c.ends - 30;
};
