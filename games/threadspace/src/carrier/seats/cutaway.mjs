// The cutaway seat (Tab): the ship opened up from outside, a deck at a time (cutaway.mjs draws it). Here: its keys
// (1–9 a level, M the whole ship) and its frame.

export class CutawaySeat {
  constructor(G) {
    this.G = G;
  }

  key(code) {
    const cut = this.G.cut;
    if (code.startsWith('Digit')) cut.setLevel(Number(code.slice(5)) - 1);
    if (code === 'KeyM') cut.setLevel(cut.levels.length - 1);
  }

  frame(dt) {
    const { cut, walker, hud, dc, career } = this.G;
    cut.frame(dt, walker.pos.clone());
    dc.markScale = career.markScale = cut.pin.scale.x;
    hud.where(`Cutaway · ${cut.levels[cut.level].name}`);
    hud.use(null);
  }
}
