// The gun seat: in one of the turrets (weapons.mjs aims and fires it, and places the camera behind its sight). Here:
// getting in and out, and its keys.

export class GunSeat {
  constructor(G) {
    this.G = G;
  }

  /** Into turret `t`. */
  man(t) {
    this.G.guns.man(t);
    this.G.setMode('gun');
  }

  /** Back out through the turret's hatch, where you came in. */
  leave() {
    const { guns, setMode, walk, walker } = this.G;
    const s = guns.leave();
    setMode('walk');
    walk.goDeck(s.deck, s.at[0], s.at[1], s.yaw ?? walker.yaw);
  }

  key(code) {
    if (code === 'KeyE') this.G.fadeThen(() => this.leave());
    else if (code === 'KeyZ') this.G.guns.zoomStep();
  }

  frame(dt) {
    const { guns, camera, hud } = this.G;
    guns.placeCamera(camera, dt);
    hud.where(guns.where());
    hud.use(null);
  }
}
