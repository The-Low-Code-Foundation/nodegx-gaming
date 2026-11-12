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
    return (s?.v === 1 || s?.v === 2) && Array.isArray(s.lives) && s.lives.length ? s : null;
  } catch {
    return null;
  }
}
export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 2, savedAt: Date.now(), ...state }));
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
    job: l.job ? { ...l.job } : null
  };
}
// And back onto a Life just made for them. A work day they had started (`lastDay` today, not yet over) they go back to.
export function restoreLife(l, s, minutes) {
  for (const [id, v] of Object.entries(s.needs ?? {})) if (id in l.needs) l.needs[id] = Math.max(0, Math.min(100, Number(v) || 0));
  l.skills = { science: 0, ...(s.skills ?? {}) };
  l.timed = new Map((s.timed ?? []).filter(([, left]) => left > 0));
  l.year = s.year ?? undefined;
  l.look = s.look ?? null;
  if (s.job) {
    l.job = { ...s.job };
    if (l.job.lastDay === Math.floor(minutes / 1440)) l.job.lastDay = -1;
  }
}
