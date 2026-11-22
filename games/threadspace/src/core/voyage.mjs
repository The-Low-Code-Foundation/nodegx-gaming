// The voyage: what is kept when the scene changes from one ship to another (design/ROADMAP.md, "How two ships share
// one engine"). The engine runs the ship you are aboard (carrier.html?ship=<id>); going through an airlock into another
// ship loads the page again for her. What must survive that is here, in localStorage:
//
//   aboard   the ship you are in
//   ships    per carried ship, keyed "<host id>/<berth id>" (berths.mjs `berthKey`): { ship, out, rebuilt, hurt }.
//            `out: true` while she is away from her berth; no entry, or `out` unset, and she is on her cradle.
//            `rebuilt`: a wreck brought back to her cradle (collide.mjs). `hurt`: her damage, reaction mass and rounds
//            as she was last seen (carrier/upkeep.mjs), which the hangar crew work on while she is on her cradle.
//
// The career's own save (career.mjs) is still its own key; it joins this one when the career is rewritten for the
// cutter (ROADMAP phase 13).

const KEY = 'threadspace.voyage';

/** The voyage a new game starts with: aboard the carrier, both cutters in their berths. */
const fresh = () => ({ v: 1, aboard: 'carrier', ships: {} });

export function loadVoyage() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v?.v === 1 && v.ships) return v;
  } catch {
    // an unreadable save is a new voyage
  }
  return fresh();
}

export function saveVoyage(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // private windows: the voyage lasts as long as the page
  }
}

/** Notes where the carried ship `key` ("<host>/<berth>") is: `{ ship }` on her cradle, `{ ship, out: true }` away.
 *  Her `hurt` is kept unless `where` gives one. */
export function setShip(id, where) {
  const v = loadVoyage();
  const hurt = v.ships[id]?.hurt;
  v.ships[id] = hurt && !('hurt' in where) ? { ...where, hurt } : where;
  saveVoyage(v);
  return v;
}

/** Her damage, reaction mass and rounds (carrier/upkeep.mjs), for the next page that shows her. */
export function setHurt(id, hurt, more = {}) {
  const v = loadVoyage();
  v.ships[id] = { ...(v.ships[id] ?? {}), ...more, hurt };
  saveVoyage(v);
  return v;
}

/** The address of the page that runs ship `id`, with `params` ({ berth, host, at… }). Flags that are about how the
 *  page runs, not about where you are (`voice`, `crew`, `dc`, `post`, `hull`), are carried over from this page. */
export function pageFor(id, params = {}, from = location) {
  const q = new URLSearchParams();
  if (id !== 'carrier') q.set('ship', id);
  for (const [k, val] of Object.entries(params)) if (val !== null && val !== undefined) q.set(k, val);
  const here = new URLSearchParams(from.search);
  for (const k of ['voice', 'crew', 'dc', 'post', 'hull']) if (here.has(k) && !q.has(k)) q.set(k, here.get(k));
  return `${from.pathname}?${q}`;
}

/** Goes aboard ship `id`: notes it, puts up the airlock's card (carrier.html `#c-lock`) with `line` on it while the
 *  lock cycles for `secs`, and loads her page, which keeps the card up until she is built (`arrived`). */
export function goAboard(id, params = {}, { line = 'Outer door shut. Cycling.', secs = 1.6, title = null } = {}) {
  const v = loadVoyage();
  v.aboard = id;
  saveVoyage(v);
  const el = document.getElementById('c-lock');
  if (el) {
    el.hidden = false;
    el.classList.remove('out');
    const t = document.getElementById('c-lock-line');
    if (t) t.textContent = line;
    const h = el.querySelector('.c-lock-title');
    if (h && title) h.textContent = title; // not through an airlock (a crash's rescue)
  }
  setTimeout(() => (location.href = pageFor(id, params)), el ? secs * 1000 : 0);
}

/** The ship is built: the airlock's card comes down. */
export function arrived() {
  const el = document.getElementById('c-lock');
  if (!el || el.hidden) return;
  el.classList.add('out');
  setTimeout(() => (el.hidden = true), 600);
}
