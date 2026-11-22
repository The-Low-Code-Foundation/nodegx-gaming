// The gun seat: in one of the turrets (weapons/turrets.mjs aims and fires it and draws the sight; turret-cab.mjs is
// the cab you sit in). Here: getting in and out, and its keys.
//
// Getting in is a move you see, not a cut: from the hatch (main.mjs fades as it shuts behind you) you come up the
// hoist trunk hand over hand, head through the hatch in the cab's floor, over the seat's back and down onto the sight
// (`ENTER` seconds; turret-cab.mjs `pose`). A ventral turret is the same cab the other way up, so there you go "up"
// the trunk away from the hull. Getting out (E) is the first part of that backwards, into the dark of the trunk, and
// then you are standing at the hatch you came in by.
//
// You are the turret's gunner from the moment `man(t)` is called (so the crew stop laying it at once, as before); the
// guns will not fire until you are in the seat, and the sight stays unmagnified until then.
//
// The way out runs on the wall clock, not on frames, and ends on a timer of its own: a page that is not being drawn
// (tools/carrier-check.mjs steps it by hand) still gets you out. `leave()` is the whole of it at once, for scripts.

const ENTER = 1.9; // seconds from the foot of the trunk to the sight
const EXIT = 800; // milliseconds from the seat to the hatch

export class GunSeat {
  constructor(G) {
    this.G = G;
    this.entering = null; // { t }: seconds into the way in
    this.exiting = null; // { t0 }: when you started out (performance.now())
    this.timer = null;
    this.fadeEl = document.getElementById('fade');
  }

  /** Into turret `t`: up its trunk and into the seat. */
  man(t) {
    this.cancelExit();
    this.G.guns.man(t);
    this.G.setMode('gun');
    this.entering = { t: 0 };
    this.G.guns.seated = false;
    this.G.guns.hudK = 0;
  }

  /** Back out through the turret's hatch, where you came in: at once (E takes the trunk first). */
  leave() {
    const { guns, setMode, walk, walker } = this.G;
    this.cancelExit();
    this.entering = null;
    const s = guns.leave();
    setMode('walk');
    if (s) walk.goDeck(s.deck, s.at[0], s.at[1], s.yaw ?? walker.yaw);
  }

  /** E: out of the seat and down the trunk, then `leave()`. */
  startExit() {
    if (this.exiting) return;
    const { guns } = this.G;
    this.entering = null;
    this.exiting = { t0: performance.now() };
    guns.seated = false;
    guns.zoom = 0;
    this.timer = setTimeout(() => this.exiting && this.leave(), EXIT + 20);
  }

  cancelExit() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.exiting) this.fadeEl?.classList.remove('on');
    this.exiting = null;
  }

  key(code) {
    if (this.exiting) return;
    if (code === 'KeyE') this.startExit();
    else if (code === 'KeyZ' && !this.entering) this.G.guns.zoomStep();
  }

  frame(dt) {
    const { guns, camera, hud } = this.G;
    let p = 1; // how far in you are: 0 the foot of the trunk, 1 in the seat
    if (this.exiting) {
      const k = (performance.now() - this.exiting.t0) / EXIT;
      if (k >= 1) return this.leave();
      p = 1 - 0.62 * k * k;
      if (k > 0.45) this.fadeEl?.classList.add('on'); // dark by the time you are in the trunk; `leave` lifts it
    } else if (this.entering) {
      this.entering.t += dt;
      p = this.entering.t / ENTER;
      if (p >= 1) (p = 1), (this.entering = null);
    }
    const seated = p >= 1;
    if (!seated) guns.zoom = 0;
    guns.seated = seated;
    guns.hudK = this.exiting ? 0 : Math.max(0, Math.min(1, (p - 0.82) / 0.18)); // the sight's markings come up as you reach it
    guns.placeCamera(camera, dt);
    const cab = guns.cab;
    if (cab && guns.seatP) {
      cab.frame(dt, guns, guns.seatP, guns.seatQ);
      if (!seated) cab.pose(p, camera, guns.seatP, guns.seatQ);
    }
    hud.where(guns.where());
    hud.use(null);
  }
}
