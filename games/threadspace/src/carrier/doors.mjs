// The ship's moving doors, frame by frame: the hangar's bay doors (six seconds open or shut; `k` is how open they
// are, `want` where they are going), the ladders' hatch lids (layout.mjs `hatches`, drum.mjs `spokeFoot`) and the
// fighters' boarding tubes (layout.mjs `boardingTubes`).

export class Doors {
  constructor(C) {
    this.C = C;
    this.k = 0;
    this.want = 0;
    this.use = [...C.decks.values()].flatMap((I) => I.interactables).find((u) => u.id === 'bay');
  }

  get open() {
    return this.k >= 1;
  }

  /** Opens (1) or shuts (0) the bay doors. */
  setBay(v) {
    this.want = v;
    if (this.use) this.use.label = this.want ? 'Close the bay doors' : 'Open the bay doors';
  }

  /** Opens the bay doors at once (the doors normally take six seconds). */
  bayNow() {
    this.setBay(1);
    this.k = 1;
    this.C.bayDoor?.set(1);
    for (const p of this.C.bayPanels ?? []) p.position.y = p.userData.home + p.userData.travel;
  }

  /** `fighter`: whose boarding tube is up (yours telescopes up to the roof once her drive is up, and comes down again
   *  when she is back on her pad and you are out of her). */
  frame(dt, fighter) {
    const C = this.C;
    // The ladders' hatch lids: open in a third of a second, shut in half.
    for (const lid of C.lids ?? []) {
      if (lid.k === lid.want) continue;
      lid.k = lid.want > lid.k ? Math.min(1, lid.k + dt / 0.35) : Math.max(0, lid.k - dt / 0.5);
      lid.mesh.position.copy(lid.home).addScaledVector(lid.travel, lid.k);
    }
    for (const [i, b] of (C.boardTubes ?? []).entries()) {
      if (!b) continue;
      const want = i === fighter.index && (fighter.phase !== 'seated' || fighter.flight.online) ? 1 : 0;
      if (b.k === want) continue;
      b.k = want > b.k ? Math.min(1, b.k + dt / 2) : Math.max(0, b.k - dt / 2);
      b.t.scale.y = 1 - 0.88 * b.k;
    }
    if (this.k !== this.want) {
      this.k = this.want > this.k ? Math.min(1, this.k + dt / 6) : Math.max(0, this.k - dt / 6);
      C.bayDoor?.set(this.k);
      for (const p of C.bayPanels ?? []) p.position.y = p.userData.home + this.k * p.userData.travel;
    }
  }
}
