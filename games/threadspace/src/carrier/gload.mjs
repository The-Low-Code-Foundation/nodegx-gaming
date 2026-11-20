// What g does to the pilot. Lying back in the couch with the drive behind her, a pilot takes acceleration chest to
// back, the best way round: a few g all day long. Past `tolerate` the blood starts to leave the head: the view greys
// and closes in from the edges, and held long enough, she blacks out (g-LOC): her hands come off the controls, the
// drive cuts (it only burns while held), and she comes round once the load is off.
//
// The couch carries "the juice": a drug it pushes into her when the load goes over `tolerate`, which slows all that
// down (`juiceCut`) for as long as it lasts (`juice` seconds of hard burn; topped up on the pad). Hard burn itself is
// Shift with W: the drive runs past its rating, up to `boost` times its normal push, and burns propellant to match.
//
// Every number is the layout's `fighter.g`.

import { clamp } from '../util.mjs';

const G0 = 9.81;

export class GLoad {
  constructor(spec) {
    this.S = spec;
    this.strain = 0; // 0 fine, 1 out
    this.juice = spec.juice;
    this.out = false;
    this.g = 0;
    this.veil = document.getElementById('c-gveil');
  }

  /** On the pad: the couch's juice is topped up and she is fresh. */
  refill() {
    this.juice = this.S.juice;
    this.strain = 0;
    this.out = false;
  }

  /** Each frame with `acc` her acceleration (m/s², her own frame) and whether she is in the seat and flying. */
  frame(dt, acc, flying) {
    const S = this.S;
    this.g = acc.length() / G0;
    const over = flying ? Math.max(0, this.g - S.tolerate) : 0;
    const juiced = over > 0 && this.juice > 0;
    if (juiced) this.juice = Math.max(0, this.juice - dt);
    if (over > 0) this.strain += S.onset * over * (juiced ? S.juiceCut : 1) * dt;
    else this.strain = Math.max(0, this.strain - S.recover * dt);
    this.strain = clamp(this.strain, 0, 1.15);
    if (!this.out && this.strain >= 1) this.out = true;
    else if (this.out && this.strain < 0.45) this.out = false;
    this.juiced = juiced;
  }

  /** The grey-out over the view (only from her own cockpit). */
  draw(show) {
    if (!this.veil) return;
    const k = show ? (this.out ? 1 : clamp((this.strain - 0.3) / 0.7, 0, 1) ** 1.4) : 0;
    const v = k.toFixed(3);
    if (this.veil.style.opacity !== v) this.veil.style.opacity = v;
  }
}
