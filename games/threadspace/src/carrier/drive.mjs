// What the main drive's push feels like aboard (design/CARRIER-POLISH.md). On the spin-drum carrier, from cold (off
// for `COLD` seconds) the drive is held for a `WARN`-second stand-by the ship calls and the helm counts down. Lit, it
// is a push toward the stern: the seats use `push` (m/s²) for the lean you feel, `burnTilt` for the first carrier's
// slope, `lurch` for the shove back into the helm's seat as she lights, and the ship calls the burn once.

export const WARN = 3, COLD = 20;

export class Drive {
  /** `thrusters`: the carrier's thruster list (newton.mjs); `spin`: the ship has drums (the weightless fixed hull). */
  constructor({ thrusters, body, dc, helmSight, spin }) {
    Object.assign(this, { thrusters, body, dc, helmSight, spin });
    this.cold = COLD + 1; // seconds since the drive last burned
    this.warn = 0; // seconds into the stand-by's countdown
    this.lurch = 0;
    this.push = 0;
    this.burnTilt = 0;
    this.callT = 0;
    this.burning = false;
    this.held = false;
  }

  /** Before the helm's frame: from cold the main drive is held until the stand-by has been called and counted down. */
  hold() {
    this.held = this.spin && this.cold > COLD && this.warn < WARN;
    if (this.held) for (const t of this.thrusters) if (t.kind === 'main') t.health = 0;
  }

  /** After the helm's frame: the helm asking for the main drive while it is held starts (or calls off) the stand-by. */
  standBy(dt, helm, atHelm) {
    if (this.held && helm.u[2] < -0.05) {
      if (this.warn === 0) this.dc.say('Stand by for main drive. All hands, take hold.', `Stand by for main drive: lighting in ${WARN} s. In the weightless spaces, take hold.`, 0, 4);
      this.warn += dt;
      if (atHelm) this.helmSight.say(`MAIN DRIVE LIGHTING · ${Math.max(1, Math.ceil(WARN - this.warn))}`, 0.25);
    } else if (this.held) this.warn = 0; // let go of it before it lit: called off
  }

  /** Seconds before the drive lights if asked now (the nav plot counts it, helmsight.mjs `lightDelay`). */
  delay() {
    return this.spin && this.cold > COLD ? WARN : 0;
  }

  /** The drive's push this frame (m/s²), the tilt you feel aboard, and the call when she starts a burn. */
  frame(dt) {
    let push = 0;
    for (const t of this.thrusters) if (t.kind === 'main') push += t.force * t.throttle * (t.health ?? 1);
    push /= this.body.mass;
    this.push = push;
    this.burnTilt += (Math.atan(push / 9.81) - this.burnTilt) * Math.min(1, dt * 1.5);
    this.callT -= dt;
    if (push > 0.6 && !this.burning && this.callT <= 0) {
      this.callT = 40;
      if (this.spin) this.dc.say('Main drive burning. Weightless spaces, hold on.', `Main drive burning: ${(push / 9.81).toFixed(2)} g toward the stern. In the spine and the tunnel you go aft unless you hold on.`, 0, 5);
      else this.dc.say('Main drive burning. Hold on to something.', `Main drive burning: ${(push / 9.81).toFixed(2)} g toward the stern.`, 0, 4);
    }
    if (push > 0.3 && !this.burning) this.lurch = 1; // lighting: a shove back into the seat
    this.lurch = Math.max(0, this.lurch - dt / 1.6);
    this.burning = push > 0.3 ? true : push < 0.1 ? false : this.burning;
    if (push > 0.05) (this.cold = 0), (this.warn = 0);
    else this.cold += dt;
    return push;
  }
}
