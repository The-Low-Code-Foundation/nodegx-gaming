// A baby (round 12; brief answer 2: "romance very Disney, hugs and hearts and a baby appears"). Two Sims in love who
// live together can have one ("Have a baby", social.mjs): hearts, a cot appears in the flat with the baby in it, and
// the page asks the baby's name. A baby never grows up (the brief: "maybe not ageing and death") and nothing harms one:
// three needs that fall with time, and when one runs low the baby cries until someone sees to it. Anyone at home can
// (the cot's offers, actions.mjs `baby`), and a Sim with free will goes to a crying baby by themselves (life.mjs
// `score`). At night the baby sleeps by itself. Life does the caring; the page draws the baby in its cot.
// Round 13 (childcare.mjs): never home alone. With every grown-up out, a nanny looks after them in the flat, or they
// are at the nursery (`away`): out of the cot, and home again looked after.
import { urge } from './needs.mjs';

// Each runs 0–100 (full) and falls by `decay` points a game hour while the baby is awake: a feed every ~7 hours.
export const BABY_NEEDS = [
  { id: 'hunger', icon: '🍼', decay: 10 },
  { id: 'cuddles', icon: '🤗', decay: 8 },
  { id: 'sleep', icon: '💤', decay: 7 }
];
// Asleep: rested a little more every hour, hungry slower, and nobody's cuddles missed.
const ASLEEP = { sleep: -30, hunger: 0.3, cuddles: 0 };
// Below this, the baby cries.
const CRY = 25;
// How many babies the flat holds (a cot each).
export const MAX_BABIES = 2;
// The blanket colours to choose from; a girl starts in the first, a boy in the second.
export const BLANKETS = ['#f4b6c8', '#9cc7ef', '#f6dd82', '#a8dcc0', '#c9b6ec'];
// Names the welcome card suggests (any name can be typed instead).
export const BABY_NAMES = {
  girl: ['Lily', 'Rosie', 'Mia', 'Zoe', 'Nina', 'Isla', 'Ruby', 'Daisy', 'Luna', 'Poppy'],
  boy: ['Theo', 'Max', 'Sam', 'Noah', 'Felix', 'Oscar', 'Leon', 'Arlo', 'Milo', 'Finn']
};
const night = (h) => h >= 21 || h < 7;

export class Baby {
  constructor({ name = '', girl = true, colour = null, parents = [], needs = null, asleep = false, born = 0 } = {}) {
    Object.assign(this, { name, girl, parents, born });
    this.colour = colour ?? BLANKETS[girl ? 0 : 1];
    this.needs = needs ?? { hunger: 80, cuddles: 90, sleep: 70 };
    this.asleep = asleep;
    this.crying = null; // the need they cry for, or null
    this.cot = null; // the cot they lie in (page.mjs)
    this.cared = false; // someone saw to them this tick (life.mjs `care`)
    this.away = null; // 'nursery' while they are there (round 13)
    this.events = []; // for the page to show once
  }

  // `min` game minutes passed at `hour` o'clock.
  tick(min, hour) {
    // At the nursery: looked after there, so nothing falls (they come home cared for: `home`).
    if (this.away) {
      this.crying = null;
      this.asleep = night(hour);
      return;
    }
    // Night: off to sleep by themselves, unless someone is with them. Day: awake again once rested.
    if (night(hour) && !this.cared) this.asleep = true;
    else if (this.asleep && !night(hour) && this.needs.sleep >= 99.5) this.asleep = false;
    for (const n of BABY_NEEDS) {
      const slow = this.asleep ? ASLEEP[n.id] : 1;
      this.needs[n.id] = Math.max(0, Math.min(100, this.needs[n.id] - (n.decay * slow * min) / 60));
    }
    this.cared = false;
    // Crying for the lowest need under the line; quiet once it is seen to.
    const low = this.asleep ? null : BABY_NEEDS.map((n) => n.id).filter((id) => this.needs[id] < CRY).sort((a, b) => this.needs[a] - this.needs[b])[0] ?? null;
    if (low && low !== this.crying) this.events.push({ key: `ui.baby.cries.${low}`, vars: { name: this.name } });
    this.crying = low;
  }

  // Someone feeding, cuddling or singing to them: `gives` points a game hour for `min` minutes. Wakes them, except a
  // lullaby, which ends with them asleep (`fallAsleep`).
  care(gives, min) {
    this.cared = true;
    if (!('sleep' in gives)) this.asleep = false;
    for (const [id, rate] of Object.entries(gives)) this.needs[id] = Math.max(0, Math.min(100, this.needs[id] + (rate * min) / 60));
  }
  // Off to the nursery, and home again fed, cuddled and rested at least `cared` (childcare.mjs NURSERY_CARED).
  goAway(where) {
    this.away = where;
    this.crying = null;
  }
  home(cared) {
    this.away = null;
    for (const id of Object.keys(this.needs)) this.needs[id] = Math.max(this.needs[id], cared);
  }
  fallAsleep() {
    this.asleep = true;
    this.crying = null;
  }

  // How much `offer` (taking `offer.minutes`) would do for them, the way free will weighs a Sim's own needs.
  relief(offer) {
    if (this.away) return 0;
    let r = 0;
    for (const [id, rate] of Object.entries(offer.baby ?? {})) r += urge(this.needs[id]) - urge(Math.min(100, this.needs[id] + (rate * offer.minutes) / 60));
    return r;
  }

  // 'away' | 'asleep' | 'crying' | 'awake': their face, and the bubble over the cot.
  get state() {
    return this.away ? 'away' : this.asleep ? 'asleep' : this.crying ? 'crying' : 'awake';
  }

  // For the save.
  saved() {
    return { name: this.name, girl: this.girl, colour: this.colour, parents: [...this.parents], needs: { ...this.needs }, asleep: this.asleep, born: this.born };
  }
}
