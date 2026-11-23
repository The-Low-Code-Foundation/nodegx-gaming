// The ship's automated voice telling you what is broken, as it breaks and as it comes back, so a drive that will not
// light is never a surprise. It watches the state other modules already keep and says a call on the change
// (content/announcements/, said by `ai`), each with a short synthesised alert tone so there is sound before the lines
// are recorded:
//
//   aboard (the ship you are in: integrity.mjs `driveFactor` and `power`, plant.mjs `leaking`, the thrusters' health)
//     drive-offline / drive-restored   the main drive can or cannot light (hurt, or no power to it)
//     power-lost / power-restored      the reactor or the switchboards under `integrity.power.below`
//     tank-leak                        a propellant tank holed and venting
//     jets-degraded                    a manoeuvring thruster (a cluster's) under `JETS.bad` of its push
//   in your fighter (fighter-damage.mjs `harm`), on the radio
//     fighter-drive-offline / fighter-drive-restored, fighter-leak (propellant or jet gas), fighter-jets
//
// Pressing the drive key when it cannot light (W at the helm, or in the fighter) says "Main drive offline." once per
// press (the call's `again` stops it nagging) and the turbopump kicks and dies (spool.mjs `fail`). Nothing here is
// seeded or changes how the ship behaves: it only listens.

/** A manoeuvring thruster's health under which the jets are degraded, and over which (all of them) whole again. */
const JETS = { bad: 0.5, good: 0.9 };
/** Seconds after the page starts before a change is called (her state put back at load is not news). */
const SETTLE = 2;
/** The alert tones: falling for something lost, rising for something back, a low double buzz for a refused drive. */
const TONE = { level: 0.05 };

export class StatusCalls {
  /** `ship` integrity.mjs, `plant`, `thrusters` her list (newton.mjs), `fighter` (or null) and `guns` (its `fdmg`),
   *  `flightAudio`, `ambience` (their spools), `sfx` for the tones, `carried()` whether her berth holds her. */
  constructor(C, { ship, plant, thrusters, fighter = null, guns = null, flightAudio = null, ambience = null, sfx = null, carried = () => false }) {
    Object.assign(this, { C, ship, plant, thrusters, fighter, guns, flightAudio, ambience, sfx, carried });
    this.t = 0;
    this.was = null; // the ship's state last frame
    this.fwas = null; // the fighter's
    this.fobj = null; // which fighter that was
    this.wHeld = false;
    this.log = []; // what was said: { id, t } (tests and the console)
  }

  /** Each frame, after the ship's systems and the plant have stepped. `f` the input frame, `mode` the seat. */
  frame(dt, f, mode) {
    this.t += dt;
    const now = this.shipState();
    const quiet = this.t < SETTLE;
    if (this.was && !quiet) {
      const w = this.was;
      if (w.power && !now.power) this.say('power-lost', 'down');
      else if (!w.power && now.power) this.say('power-restored', 'up');
      if (w.drive && !now.drive) this.say('drive-offline', 'down');
      else if (!w.drive && now.drive) this.say('drive-restored', 'up');
      if (!w.leak && now.leak) this.say('tank-leak', 'down');
      if (!w.jetsBad && now.jetsBad) this.say('jets-degraded', 'down');
    }
    this.was = now;
    // The drive key, pressed with the drive out.
    const w = !!f?.keys?.has('KeyW');
    const press = w && !this.wHeld;
    this.wHeld = w;
    if (press && mode === 'helm' && !this.carried() && !now.drive) {
      this.say('drive-offline', 'deny');
      this.ambience?.spool?.fail();
    }
    this.fighterFrame(mode, press, quiet);
  }

  shipState() {
    const S = this.ship, w = this.was;
    let jets = 1;
    for (const t of this.thrusters) if (t.kind !== 'main') jets = Math.min(jets, t.health ?? 1);
    return {
      power: S.power !== false,
      drive: (S.driveFactor ?? 1) > 0,
      leak: !!this.plant?.leaking,
      jets,
      jetsBad: w?.jetsBad ? jets < JETS.good : jets < JETS.bad
    };
  }

  /** Your fighter, while you are in her: her drive, her tanks, her jet blocks. */
  fighterFrame(mode, press, quiet) {
    const F = this.fighter, D = this.guns?.fdmg;
    if (!F || !D || mode !== 'fighter' || !F.aboard) return void (this.fwas = null);
    const H = D.harm;
    if (!H) return;
    const leaking = (tank) => H.leaks.some((h) => h.tank === tank && h.rate > 0.01);
    const w = this.fwas;
    const now = {
      drive: (H.drive ?? 1) > 0,
      main: leaking('main'),
      rcs: leaking('rcs'),
      jetsBad: H.blocks.some((k) => k < (w?.jetsBad ? JETS.good : JETS.bad))
    };
    if (w && this.fobj === D.obj && !quiet) {
      if (w.drive && !now.drive) this.say('fighter-drive-offline', 'down');
      else if (!w.drive && now.drive) this.say('fighter-drive-restored', 'up');
      if (!w.main && now.main) this.say('fighter-leak', 'down', { what: 'Propellant leak.' });
      if (!w.rcs && now.rcs) this.say('fighter-leak', 'down', { what: 'Jet gas leak.' });
      if (!w.jetsBad && now.jetsBad) this.say('fighter-jets', 'down');
    }
    this.fwas = now;
    this.fobj = D.obj;
    if (press && F.flying && !now.drive) {
      this.say('fighter-drive-offline', 'deny');
      this.flightAudio?.driveFail();
    }
  }

  /** The call `id` on the bus, after its tone. */
  say(id, tone, vars = {}) {
    if (this.toneAt !== this.t) this.tone(tone); // one tone a frame: power lost takes the drive with it
    this.toneAt = this.t;
    this.log.push({ id, t: +this.t.toFixed(2) });
    if (this.log.length > 30) this.log.shift();
    // Each id written out where it is said, so tools/check.mjs finds every call the code makes.
    if (id === 'drive-offline') this.C.bus?.emit('call', { id: 'drive-offline', ...vars });
    else if (id === 'drive-restored') this.C.bus?.emit('call', { id: 'drive-restored', ...vars });
    else if (id === 'power-lost') this.C.bus?.emit('call', { id: 'power-lost', ...vars });
    else if (id === 'power-restored') this.C.bus?.emit('call', { id: 'power-restored', ...vars });
    else if (id === 'tank-leak') this.C.bus?.emit('call', { id: 'tank-leak', ...vars });
    else if (id === 'jets-degraded') this.C.bus?.emit('call', { id: 'jets-degraded', ...vars });
    else if (id === 'fighter-drive-offline') this.C.bus?.emit('call', { id: 'fighter-drive-offline', ...vars });
    else if (id === 'fighter-drive-restored') this.C.bus?.emit('call', { id: 'fighter-drive-restored', ...vars });
    else if (id === 'fighter-leak') this.C.bus?.emit('call', { id: 'fighter-leak', ...vars });
    else if (id === 'fighter-jets') this.C.bus?.emit('call', { id: 'fighter-jets', ...vars });
  }

  /** The alert before the words: `down` two falling tones, twice; `up` three rising; `deny` a low double buzz. */
  tone(kind) {
    const ctx = this.sfx?.ctx, out = this.sfx?.out;
    if (!ctx || !out || ctx.state !== 'running') return;
    const v = TONE.level;
    const notes = kind === 'up' ? [[659, 0, 0.1, 'sine'], [880, 0.12, 0.1, 'sine'], [1175, 0.24, 0.16, 'sine']]
      : kind === 'deny' ? [[196, 0, 0.09, 'square'], [196, 0.13, 0.09, 'square']]
      : [[932, 0, 0.13, 'square'], [698, 0.15, 0.18, 'square'], [932, 0.45, 0.13, 'square'], [698, 0.6, 0.18, 'square']];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.connect(out);
    for (const [hz, at, len, type] of notes) {
      const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.value = hz;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * (type === 'sine' ? 1.6 : 1), t + 0.01);
      g.gain.setValueAtTime(v * (type === 'sine' ? 1.6 : 1), t + len - 0.02);
      g.gain.linearRampToValueAtTime(0, t + len);
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(t + len + 0.02);
    }
  }
}
