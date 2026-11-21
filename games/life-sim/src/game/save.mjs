// Saving the game (round 10): the household, the clock, the money, each person's look, needs, skills, job and school
// level, the bonds between everyone, the colleagues at the office, who sleeps where, and what has been bought. One
// save, in this browser's local storage (one device, one household): written every game hour, when something is bought
// or changed, and when the page is put away. Reading it back puts everyone at home, standing about: what they were in
// the middle of is not kept (a date, a question at a station), and a day at work they had started they go back to.
const KEY = 'lifesim.save.v1';

export function readSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    // v2 (round 14): the whole home's furniture, the boxes, which home and how big, the town. A v1 save is read as the
    // flat as it came plus what was added to it (page.mjs).
    // v3 (round 16): the town's seed (`town.seed`), how the life began (`story`), each Sim's traits and likes, and
    // everyone else's by person (`traits`, `likes`). A v1 or v2 save is upgraded as it loads (page.mjs): the classic
    // Sunny Lane (town seed 0, which it was), and traits and likes rolled for everyone.
    // v4 (round 16, phase 2): each Sim's dream, dreams come true, wishes, happy points, perks and tally, and the
    // household's life story (`diary`). A v3 save or older loads with no dream yet (the panel offers to pick one),
    // fresh wishes, no points, and a life story that begins on loading.
    // v5 (round 16, phase 3): the event deck (`deck`: when it was last looked at, what came up when, a party you said
    // yes to, a power cut) and the day's weather (`weather`). A v4 save or older loads with a fresh deck (the first event
    // an hour or more after loading) and the day's weather rolled.
    // v6 (round 16, phase 4): the town as it has changed (`town.houses`: lived in or for sale, the price and name;
    // `town.homes`: who lives where; `town.dreams`: the newcomers' dreams; `town.life`: town life's state, its babies and
    // the notice board's news). A v5 save or older loads with the town as made, and town life starts from that day.
    // v7 (round 16, phase 5): the household's side earnings (`side`: paintings to sell, the vegetables, today's odd
    // job, all earned so far); skills were in `lives` already. A v6 save or older loads with none (skills.mjs freshSide).
    return [1, 2, 3, 4, 5, 6, 7].includes(s?.v) && Array.isArray(s.lives) && s.lives.length ? s : null;
  } catch {
    return null;
  }
}
export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 7, savedAt: Date.now(), ...state }));
    return true;
  } catch {
    return false;
  }
}
export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

// One person, as saved.
export function lifeState(l) {
  return {
    who: l.who, name: l.name, look: l.look ?? null, year: l.year ?? null,
    needs: { ...l.needs }, skills: { ...l.skills }, timed: [...l.timed],
    job: l.job ? { ...l.job } : null,
    traits: [...(l.traits ?? [])],
    likes: l.likes ? { ...l.likes } : null,
    // Round 16, phase 2: their dream, the dreams come true, happy points, what they have done.
    goal: l.goal ? { id: l.goal.id, step: l.goal.step } : null, goalsDone: [...(l.goalsDone ?? [])], points: l.points ?? 0, tally: { ...(l.tally ?? {}) },
    wants: (l.wants ?? []).map((w) => ({ id: w.id, until: w.until })), perks: [...(l.perks ?? [])]
  };
}
// And back onto a Life just made for them. A work day they had started (`lastDay` today, not yet over) they go back to.
export function restoreLife(l, s, minutes) {
  for (const [id, v] of Object.entries(s.needs ?? {})) if (id in l.needs) l.needs[id] = Math.max(0, Math.min(100, Number(v) || 0));
  l.skills = { science: 0, ...(s.skills ?? {}) };
  l.timed = new Map((s.timed ?? []).filter(([, left]) => left > 0));
  l.year = s.year ?? undefined;
  l.look = s.look ?? null;
  // Round 16: traits (a save from before has none, and gets three: page.mjs).
  l.traits = Array.isArray(s.traits) ? [...s.traits] : [];
  l.likes = s.likes ? { ...s.likes } : null;
  l.goal = s.goal?.id ? { id: s.goal.id, step: Number(s.goal.step) || 0 } : null;
  l.goalsDone = Array.isArray(s.goalsDone) ? [...s.goalsDone] : [];
  l.points = Math.max(0, Number(s.points) || 0);
  l.tally = s.tally && typeof s.tally === 'object' ? { ...s.tally } : {};
  l.perks = Array.isArray(s.perks) ? [...s.perks] : [];
  l.wants = Array.isArray(s.wants) ? s.wants.filter((w) => w?.id).map((w) => ({ id: w.id, until: Number(w.until) || 0 })) : [];
  if (s.job) {
    l.job = { ...s.job };
    if (l.job.lastDay === Math.floor(minutes / 1440)) l.job.lastDay = -1;
  }
}
