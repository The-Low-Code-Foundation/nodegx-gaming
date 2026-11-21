// The carrier's heads-up text: where you are when walking, what E does, the helm's instruments (velocity in the ship's
// frame, turn rates, flight assist, what each thruster group is doing), the cutaway's levels and legend, and the keys.
// Plain DOM; it reads state and never changes it. The buttons call back through `onLevel`.

import { ASSIST } from './newton.mjs';
import { SYSTEMS } from './layout.mjs';

const DEG = 180 / Math.PI;
/** The keys line per seat. At the helm of the spin-drum carrier the click is the torpedo broadside and Q the broadside
 *  railgun; main.mjs makes the click the railgun on the first carrier (and drops Q). */
export const KEYS = {
  walk: '<b>walk</b> W A S D · <b>run</b> Shift · <b>look</b> mouse · <b>use</b> E · <b>watch bill</b> B · <b>cutaway</b> Tab',
  float: '<b>weightless</b> · <b>push off</b> W off a hold, a wall, the deck or the deckhead (hold for harder, Shift W: big push) · <b>pull along</b> A D S holding on · <b>take hold</b> Space (the glow; one you look at, a little further off, too) · <b>adrift</b> W A S D swim, slowly (clipped on, Space hauls in) · <b>suit puffer</b> P on or off: W A S D puff, Space brakes · <b>look</b> mouse · <b>use</b> E · <b>cutaway</b> Tab',
  helm: '<b>thrust</b> W S · <b>slide</b> A D · <b>rise / sink</b> R F · <b>pitch / yaw</b> mouse or arrows · <b>roll</b> Z C · <b>flight assist</b> Space · <b>all stop</b> hold X · <b>broadside</b> click · <b>railgun</b> Q · <b>radiators</b> G · <b>nav plot</b> N · <b>view</b> V · <b>stand up</b> E · <b>cutaway</b> Tab',
  pad: '<b>launch</b> hold W (once the bay is open) · <b>climb out</b> E · <b>view</b> V · <b>cutaway</b> Tab',
  fighter: '<b>burn</b> hold W (Shift: hard burn) · <b>retro jet</b> S · <b>slide</b> A D · <b>rise / sink</b> R F · <b>aim</b> mouse (M: stick) or arrows · <b>roll</b> Z C · <b>guns</b> hold click · <b>next contact</b> X · <b>missile</b> Q · <b>flares</b> G · <b>hold</b> Space · <b>stop</b> flip onto ⊗ and burn · <b>view</b> V · <b>land</b> fly down the lane, or E near the bay · <b>cutaway</b> Tab',
  gun: '<b>lay the guns</b> mouse or arrows · <b>fire</b> hold click · <b>sight</b> Z or wheel · <b>leave</b> E · <b>cutaway</b> Tab',
  cutaway: '<b>orbit</b> drag · <b>pan</b> right-drag · <b>zoom</b> wheel · <b>levels</b> 1 – 4 · <b>section</b> M · <b>back</b> Tab'
};

export class CarrierHud {
  constructor(cut) {
    this.top = document.getElementById('c-top');
    this.prompt = document.getElementById('prompt');
    this.helmEl = document.getElementById('c-helm');
    this.cutEl = document.getElementById('c-cut');
    this.keysEl = document.getElementById('c-keys');
    this.onLevel = null;
    this.cutEl.innerHTML = `<div class="c-levels">${cut.levels.map((l, i) => `<button data-i="${i}">${i < 4 ? `<kbd>${i + 1}</kbd>` : '<kbd>M</kbd>'} ${l.name}</button>`).join('')}</div>
      <div class="c-legend">${Object.entries(SYSTEMS).filter(([k], i, a) => a.findIndex(([, v]) => v[1] === SYSTEMS[k][1]) === i).map(([, [c, n]]) => `<span style="--c:${c}">${n}</span>`).join('')}</div>`;
    this.cutEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) this.onLevel?.(Number(b.dataset.i));
    });
    this.helmEl.innerHTML = `<div class="c-grid">
      <span>speed</span><b id="h-speed"></b>
      <span>ahead</span><b id="h-fwd"></b><span>starboard</span><b id="h-lat"></b><span>up</span><b id="h-up"></b>
      <span>pitch</span><b id="h-p"></b><span>yaw</span><b id="h-y"></b><span>roll</span><b id="h-r"></b>
      <span>flight assist</span><b id="h-assist"></b>
      <span>main drive</span><i class="bar"><i id="h-main"></i></i>
      <span>manoeuvring</span><b id="h-rcs"></b>
      <span class="fo">to the bay</span><b class="fo" id="h-bay"></b>
      <span class="fo">closing</span><b class="fo" id="h-close"></b>
      <span class="fo">fuel</span><b class="fo" id="h-fuel"></b>
      <span class="fo">jet gas</span><b class="fo" id="h-gas"></b></div>`;
    this.h = Object.fromEntries([...this.helmEl.querySelectorAll('[id^="h-"]')].map((e) => [e.id.slice(2), e]));
    this.modeNow = null;
  }

  mode(m) {
    if (m === this.modeNow) return;
    this.modeNow = m;
    this.floatNow = false;
    this.helmEl.hidden = m !== 'helm' && m !== 'fighter';
    this.helmEl.classList.toggle('fighter', m === 'fighter');
    this.cutEl.hidden = m !== 'cutaway';
    this.keysEl.innerHTML = KEYS[m] ?? '';
  }

  /** Walking, the keys line for weightless or not (weightless.mjs). */
  float(on) {
    if (this.modeNow !== 'walk' || on === this.floatNow) return;
    this.floatNow = on;
    this.keysEl.innerHTML = on ? KEYS.float : KEYS.walk;
  }

  where(text) {
    if (this.top.textContent !== text) this.top.textContent = text;
  }

  use(u) {
    this.prompt.hidden = !u;
    if (u) {
      const key = u.key ?? 'E';
      const html = key ? `<b>${key}</b>${u.label}` : u.label;
      if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    }
  }

  /** The helm's instruments: `helm` the carrier's Helm, or a fighter's Flight (flight.mjs). Velocities are relative to
   *  `helm.ref`, or for a fighter to `bay.ref` (the carrier's velocity). `bay`, for a fighter: { dist, closing, ref }
   *  to the landing gate. */
  helm(helm, bay = null) {
    const v = helm.localVel(undefined, bay?.ref);
    const w = helm.body.ang;
    const set = (k, s) => (this.h[k].textContent = s);
    set('speed', `${v.length().toFixed(1)} m/s`);
    if (bay) {
      set('bay', bay.dist < 1000 ? `${Math.round(bay.dist)} m` : `${(bay.dist / 1000).toFixed(2)} km`);
      set('close', fmt(bay.closing, 'm/s'));
    }
    set('fwd', fmt(-v.z, 'm/s'));
    set('lat', fmt(v.x, 'm/s'));
    set('up', fmt(v.y, 'm/s'));
    set('p', fmt(w.x * DEG, '°/s', 2));
    set('y', fmt(-w.y * DEG, '°/s', 2));
    set('r', fmt(-w.z * DEG, '°/s', 2));
    set('assist', helm.assistName ?? ASSIST[helm.assist]);
    this.h.assist.className = (helm.assistOn ?? helm.assist) ? 'on' : 'off';
    let main = 0, mains = 0, rcs = 0;
    for (const t of helm.list ?? helm.thr.list) {
      if (t.kind === 'main') (main += t.throttle), mains++;
      else if (t.throttle > 0.02) rcs++;
    }
    this.h.main.style.width = `${(100 * main) / Math.max(1, mains)}%`;
    if (helm.prop) {
      // A fighter's tanks: amber under 15 %, red and DRY when empty.
      const tank = (el, k) => {
        const f = helm.prop[k] / helm.S.tank[k];
        el.textContent = f <= 0 ? 'DRY' : `${Math.round(f * 100)}%`;
        el.style.color = f <= 0 ? '#ff6050' : f < 0.15 ? '#ffc04a' : '';
      };
      tank(this.h.fuel, 'main');
      tank(this.h.gas, 'rcs');
    }
    set('rcs', `${rcs} firing`);
  }
}

function fmt(x, unit, dp = 1) {
  const s = Math.abs(x) < 0.5 * 10 ** -dp ? 0 : x;
  return `${s >= 0 ? '+' : ''}${s.toFixed(dp)} ${unit}`;
}
