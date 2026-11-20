// The frame budget: how many pixels the carrier draws, set by how fast frames really come.
//
// Measured on the spin-drum carrier (design/CARRIER-POLISH.md, "Frame rate"): aboard, the cost is pixels, not
// objects. A drum mess is about 160 draw calls and 70k triangles, but every pixel goes through eight point lights, the
// logarithmic depth buffer, the post-processing chain (a NaN scrub, the bloom, the output pass) and, as first built,
// 4× MSAA on a half-float target. At a pixel ratio of 2 that MSAA alone was half the frame. So:
// - no MSAA on the composer's target once the pixel ratio is 1.5 or more (the pixels are too small to need it);
// - the bloom works from half the size the composer gives it;
// - the pixel ratio follows the frame time: down a step when frames run slow, back up a step after a while of fast
//   ones, and never back above a ratio that was too slow a moment ago. `?pr=1.25` fixes it instead.

const STEP = 0.25;

export class FrameBudget {
  /** `resize()` is the page's own (it sizes the renderer and composer to the canvas). */
  constructor(renderer, composer, bloom, resize, { fixed = null } = {}) {
    Object.assign(this, { renderer, composer, bloom, resize });
    this.max = Math.min(window.devicePixelRatio || 1, 2);
    this.min = this.max >= 2 ? 1 : 0.75;
    this.fixed = fixed;
    this.avg = 1 / 60;
    this.t = 0;
    this.fast = 0;
    this.ceiling = this.max; // the highest ratio not yet found too slow
    this.ceilingT = 0;
    const setSize = bloom.setSize.bind(bloom);
    bloom.setSize = (w, h) => setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    this.set(fixed ?? this.max);
  }

  set(pr) {
    pr = Math.max(this.min * (this.fixed ? 0 : 1), Math.min(this.fixed ? 4 : this.max, pr));
    this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    const samples = pr >= 1.5 ? 0 : 4;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples !== samples) (rt.samples = samples), rt.dispose();
    }
    this.resize();
  }

  /** Each animation frame, with the real time since the last one (seconds). */
  frame(ft) {
    if (this.fixed || ft > 0.25) return; // a hidden tab, a load, a breakpoint: not a measure of anything
    this.avg += (ft - this.avg) * 0.08;
    this.t += ft;
    if (this.ceilingT > 0 && (this.ceilingT -= ft) <= 0) this.ceiling = this.max; // try higher again, much later
    if (this.t < 1.5) return;
    this.t = 0;
    if (this.avg > 1 / 45 && this.pr > this.min) {
      // Slow: a step down, and that ratio is the ceiling for a while.
      this.ceiling = this.pr - STEP;
      this.ceilingT = 60;
      this.fast = 0;
      this.set(this.pr - STEP);
    } else if (this.avg < 1 / 56) {
      // Fast (at the display's own rate) for long enough: a step up, if that is not known to be too slow.
      if (++this.fast >= 4 && this.pr + STEP <= this.ceiling) (this.fast = 0), this.set(this.pr + STEP);
    } else this.fast = 0;
  }
}
