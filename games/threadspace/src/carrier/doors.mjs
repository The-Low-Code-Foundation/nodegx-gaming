// The ship's moving doors, frame by frame: the hangar's bay doors (six seconds open or shut; `k` is how open they
// are told to be, `want` where they are going) and the ladders' hatch lids (layout.mjs `hatches`, drum.mjs `spokeFoot`).
// Each side's door follows `k` unless a hit has jammed it (carrier-damage.mjs `jam`): then it stays where it is, open,
// shut or part open, until it is freed, and nothing launches or lands on that side (`openOn`).

export class Doors {
  constructor(C) {
    this.C = C;
    this.k = 0;
    this.want = 0;
    this.use = [...C.decks.values()].flatMap((I) => I.interactables).find((u) => u.id === 'bay');
    // Each side's door: how open it is, and whether it is jammed.
    this.sides = Object.fromEntries(Object.keys(C.bayDoorSides ?? {}).map((s) => [s, { k: 0, jammed: false }]));
  }

  /** Both doors open (a jammed one too, if it jammed open). */
  get open() {
    const ss = Object.values(this.sides);
    return ss.length ? ss.every((s) => s.k >= 1) : this.k >= 1;
  }

  /** How open the door on side `side` is ('w' port, 'e' starboard; 'port' and 'starboard' are taken too). */
  kOf(side) {
    const s = this.sides[side === 'port' ? 'w' : side === 'starboard' ? 'e' : side];
    return s ? s.k : this.k;
  }

  /** The door on that side is open all the way: a fighter can go out or come in through it. */
  openOn(side) {
    return side ? this.kOf(side) >= 1 : this.open;
  }

  /** Jams (or frees) the door on one side where it stands. */
  jam(side, on) {
    const s = this.sides[side];
    if (s) s.jammed = on;
  }

  /** Opens (1) or shuts (0) the bay doors. */
  setBay(v) {
    this.want = v;
    if (this.use) this.use.label = this.want ? 'Close the bay doors' : 'Open the bay doors';
  }

  /** Opens the bay doors at once (the doors normally take six seconds). A jammed door stays where it is. */
  bayNow() {
    this.setBay(1);
    this.k = 1;
    this.place();
  }

  /** Each side's door and outer panel where it is now. */
  place() {
    const C = this.C;
    if (!C.bayDoorSides) {
      C.bayDoor?.set(this.k);
      for (const p of C.bayPanels ?? []) p.position.y = p.userData.home + this.k * p.userData.travel;
      return;
    }
    for (const [side, s] of Object.entries(this.sides)) {
      if (!s.jammed) s.k = this.k;
      C.bayDoorSides[side].set(s.k);
    }
    for (const p of C.bayPanels ?? []) p.position.y = p.userData.home + this.kOf(p.userData.side) * p.userData.travel;
  }

  frame(dt) {
    const C = this.C;
    // The ladders' hatch lids: open in a third of a second, shut in half.
    for (const lid of C.lids ?? []) {
      if (lid.k === lid.want) continue;
      lid.k = lid.want > lid.k ? Math.min(1, lid.k + dt / 0.35) : Math.max(0, lid.k - dt / 0.5);
      lid.mesh.position.copy(lid.home).addScaledVector(lid.travel, lid.k);
    }
    const moving = this.k !== this.want;
    if (moving) this.k = this.want > this.k ? Math.min(1, this.k + dt / 6) : Math.max(0, this.k - dt / 6);
    // A freed door catches up with the other at the doors' own pace.
    let lag = false;
    for (const s of Object.values(this.sides)) {
      if (s.jammed || s.k === this.k) continue;
      s.k = this.k > s.k ? Math.min(this.k, s.k + dt / 6) : Math.max(this.k, s.k - dt / 6);
      lag = true;
    }
    if (moving || lag) {
      if (!C.bayDoorSides) return this.place();
      for (const [side, s] of Object.entries(this.sides)) C.bayDoorSides[side].set(s.k);
      for (const p of C.bayPanels ?? []) p.position.y = p.userData.home + this.kOf(p.userData.side) * p.userData.travel;
    }
  }
}
