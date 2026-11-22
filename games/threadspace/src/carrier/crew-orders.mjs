// Who does what aboard a small ship: her crew's jobs, and what the one at the helm is to fly (design/ROADMAP.md, "The
// new course": the cutter's crew work with you, and you can choose your own job without running between stations).
//
// The crew are the layout's stations that name a person (`stations[].person`, with its `post`): on the cutter the
// commander, the gunner and the engineer. Each has a job: `helm` (only one), `gun` (one per turret), `repair` or
// `standby`. By their posts they start at the helm, on the gun and on repairs. Where you sit is your job: at the helm
// you have her and the commander stands by; in the turret, the gunner does.
//
//   - helm:   the crew's pilot (pilot.mjs) flies the helm's order while you are not at the helm. Orders: `auto` (fight
//             a raider when one comes, else leave her be: the default), `fight` (bring the contact, raider or drill
//             target, onto the turret and hold her steady), `evade` (the same, and slide her about so its guns miss),
//             `hold` (hold her here), `home` (fly her home to her berth), `none` (hands off). A plan somebody else
//             gave the pilot (the career's, or J at the helm) is left alone; so is she while her berth carries her.
//   - gun:    the turret's crew lays and fires it (weapons/turrets.mjs) under fire control; with nobody on the gun it
//             is silent unless you are in it.
//   - repair: the hand mends what a hit wrecked, most urgent first (mend.mjs), and works damage control jobs.
//
// O shows the orders card (it stays up until O again): 1, 2, 3 change a hand's job, 4 to 8 the helm's order. The
// crew's line (`#c-crew`) shows what each is doing. `G.orders`, `__carrier.orders`.

import { fetchJson } from '../core/ship.mjs';

const JOBS = ['helm', 'gun', 'repair', 'standby'];
const JOB_WORD = { helm: 'Helm', gun: 'Gun', repair: 'Repairs', standby: 'Standing by' };
export const HELM_ORDERS = [
  { id: 'fight', key: 'Digit4', word: 'Fight', say: 'bring the contact onto the guns, hold her steady' },
  { id: 'evade', key: 'Digit5', word: 'Evade', say: 'guns on the contact, and jink so its rounds miss' },
  { id: 'hold', key: 'Digit6', word: 'Hold', say: 'hold her here, as she lies' },
  { id: 'home', key: 'Digit7', word: 'Home', say: 'fly her home to her berth' },
  { id: 'auto', key: 'Digit8', word: 'As needed', say: 'fight a raider when one comes, else leave her be' }
];

/** "Lieutenant Hart" → "Lt Hart". */
const short = (name) => name.replace(/^Lieutenant Commander /, 'Lt Cdr ').replace(/^Lieutenant /, 'Lt ').replace(/^Petty Officer /, 'PO ').replace(/^Chief Petty Officer /, 'CPO ').replace(/^Leading Hand /, 'LH ');

export class CrewOrders {
  /** `G`: the game in hand (main.mjs), with `pilot`, `guns`, `mend` and maybe `berth`. */
  constructor(G) {
    this.G = G;
    this.crew = (G.L.stations ?? [])
      .filter((s) => s.person && s.post)
      .map((s) => {
        const post = s.post;
        const job = /command|captain|cox/i.test(post) ? 'helm' : /gun/i.test(post) ? 'gun' : 'repair';
        return { id: s.person, post, who: post, job };
      });
    this.helmOrder = 'auto';
    this.open = false;
    this.flying = null; // the plan the pilot flies for us, while it does
    this.said = '';
    this.el = document.getElementById('c-orders');
    this.line = document.getElementById('c-crew');
    // Their names, when their files have come (the posts until then).
    for (const c of this.crew) fetchJson(`content/people/${c.id}.json`).then((p) => p?.name && (c.who = short(p.name))).catch(() => {});
  }

  /** The crew member on `job`, or null. */
  on(job) {
    return this.crew.find((c) => c.job === job) ?? null;
  }

  /** Gives hand `c` the next job; a job only one may have (helm, gun) swaps with whoever had it. */
  cycle(c) {
    const next = JOBS[(JOBS.indexOf(c.job) + 1) % JOBS.length];
    const had = (next === 'helm' || next === 'gun') && this.crew.find((x) => x !== c && x.job === next);
    if (had) had.job = c.job === 'helm' || c.job === 'gun' ? c.job : 'standby';
    c.job = next;
    this.tell(`${c.who}: ${JOB_WORD[next].toLowerCase()}${had ? `. ${had.who}: ${JOB_WORD[had.job].toLowerCase()}` : ''}.`);
  }

  /** The helm's order. */
  order(id) {
    const o = HELM_ORDERS.find((x) => x.id === id);
    if (!o) return;
    if (id === 'home' && !this.G.berth) return this.tell('She has no berth to go home to from here.');
    this.helmOrder = id;
    const h = this.on('helm');
    this.tell(h ? `${h.who}, at the helm: ${o.say}.` : `Helm order: ${o.say}. Nobody is on the helm: give someone the helm (1 to 3), or take it yourself.`);
  }

  tell(t) {
    this.said = t;
    this.G.helmSight?.say(t, 4);
    this.G.dc?.say(null, t, 0, 4);
  }

  /** A key, from any seat (main.mjs, before the seat's own). Returns true when it was an order. */
  key(code, mode) {
    if (code === 'KeyO') return (this.open = !this.open), this.draw(mode), true;
    if (!this.open) return false;
    const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(code);
    if (i >= 0 && this.crew[i]) return this.cycle(this.crew[i]), this.draw(mode), true;
    const o = HELM_ORDERS.find((x) => x.key === code);
    if (o) return this.order(o.id), this.draw(mode), true;
    return false;
  }

  /** What the helm's order wants flown now: a plan for the pilot, or null for hands off. */
  want() {
    const R = this.G.guns?.raider, live = R && !R.gone && !R.dead;
    switch (this.helmOrder) {
      case 'auto': return live && !R.target ? 'fight' : null;
      case 'none': return null;
      default: return this.helmOrder;
    }
  }

  /** Each frame, before the pilot's (main.mjs `tick`): starts or stops the pilot's plan for the order, tells the gun
   *  whether its crew is on it, and draws the card and the crew's line. */
  frame(dt, mode) {
    const { pilot, berth, guns } = this.G;
    // The gun: crewed while a hand is on it (or you are in it).
    for (const t of guns?.turrets ?? []) t.unmanned = !this.on('gun');
    // The helm: the hand on it flies the order while you are not at the helm and she is free to fly.
    const h = this.on('helm');
    const free = !berth || berth.phase === 'out';
    const want = h && mode !== 'helm' && free ? this.want() : null;
    const ours = pilot && this.flying && pilot.busy && pilot.plan === this.flying.plan;
    const key = want && `${want}:${this.helmOrder}`;
    if (ours && (!want || this.flying.key !== key)) {
      pilot.abort(want ? 'a new order' : mode === 'helm' ? 'you have the helm' : 'stood down');
      this.flying = null;
    }
    if (want && pilot && !pilot.busy) {
      const plan = want === 'home' ? [{ do: 'recover', max: Infinity }] : [{ do: want === 'hold' ? 'hold' : 'fight', evade: want === 'evade', secs: Infinity, max: Infinity }];
      pilot.fly(plan, { who: h.who });
      this.flying = { plan: pilot.plan, key };
    }
    if (this.flying && !pilot?.busy) {
      // It ended by itself (home: she is on her cradle): the order is done.
      if (this.helmOrder === 'home') this.helmOrder = 'auto';
      this.flying = null;
    }
    this.draw(mode);
  }

  /** What hand `c` is doing now, in a few words. */
  doing(c, mode) {
    const { pilot, mend } = this.G;
    if (c.job === 'helm') {
      if (mode === 'helm') return 'standing by: you have the helm';
      if (pilot?.busy) return pilot.plan === this.flying?.plan ? pilot.phase || 'flying' : `flying · ${pilot.phase}`;
      return this.want() ? 'taking the helm' : 'at the helm, hands off';
    }
    if (c.job === 'gun') return mode === 'gun' ? 'standing by: you are on the gun' : this.G.guns?.turrets?.[0]?.layed ? 'on the gun · laid on' : 'on the gun';
    if (c.job === 'repair') {
      const d = mend?.doing(c.id);
      return d ? `${d.going ? 'going to' : 'mending'} the ${d.label} · ${d.pct}%` : 'repairs · nothing to mend';
    }
    return 'standing by';
  }

  draw(mode) {
    if (this.line) {
      const show = mode !== 'cutaway';
      this.line.hidden = !show;
      if (show) {
        // Something wrecked and nobody on repairs: say so, and how to put it right.
        const top = !this.on('repair') && this.G.mend?.jobs().find((j) => j.kind === 'node');
        const need = top ? `<div class="o-need">The ${top.label} needs mending (${top.pct}%) and nobody is on repairs: O, then a hand's number, or mend it yourself with a tool kit (the ${this.G.C.rooms.get(top.room)?.name.toLowerCase()}).</div>` : '';
        const html = `<div class="o-head">Crew <span>O: orders</span></div>` + this.crew.map((c) => `<div><b>${c.who}</b> <i>${JOB_WORD[c.job]}</i> ${this.doing(c, mode)}</div>`).join('') + need;
        if (html !== this.lineHtml) (this.line.innerHTML = html), (this.lineHtml = html);
      }
    }
    if (!this.el) return;
    this.el.hidden = !this.open;
    if (!this.open) return;
    const order = HELM_ORDERS.find((o) => o.id === this.helmOrder);
    const html =
      `<div class="o-head">Orders <span>O to close</span></div>` +
      this.crew.map((c, i) => `<div class="o-row"><code>${i + 1}</code><b>${c.who}</b> <span class="o-post">${c.post}</span><i>${JOB_WORD[c.job]}</i></div>`).join('') +
      `<div class="o-sub">The helm${this.on('helm') ? ` (${this.on('helm').who})` : ': nobody'}: <b>${order?.word ?? 'Hands off'}</b></div>` +
      HELM_ORDERS.filter((o) => o.id !== 'home' || this.G.berth).map((o) => `<div class="o-row${o.id === this.helmOrder ? ' on' : ''}"><code>${o.key.slice(5)}</code><b>${o.word}</b> <span>${o.say}</span></div>`).join('') +
      `<div class="o-note">Where you sit is your job: at the helm you fly her, in the turret you fire. 1 to 3 change a hand's job (helm and gun swap).</div>` +
      (this.said ? `<div class="o-said">${this.said}</div>` : '');
    if (html !== this.cardHtml) (this.el.innerHTML = html), (this.cardHtml = html);
  }
}
