// A drop-in mission: your ship, crew and credits are dealt to you, you arrive in the middle of somebody else's bad
// day, and it ends inside twenty minutes with a debrief. One template so far, THE STANDOFF: Rooks hold a Guild hauler
// and want a ransom before their thread opens. A seed rolls everything that varies (who, how many, how much, how
// much nerve, what the hauler's master overheard, whether Concord will come, whether you arrive mid-fight).
//
// Three layers, kept apart on purpose:
//   rollMission(seed)  → the sheet: plain data, the same for the same seed. A NodeGX backend would own these rows.
//   Mission            → the rules: stances, leverage, prices, the clock, the endings, the score. Deterministic.
//   Voices (comms.mjs) → the other captains' words and which of the moves the rules allow they pick. Gemma, or a script.
// The model proposes; the rules dispose. Nothing a voice says changes the game unless a rule here lets it.

import * as THREE from 'three';
import { Entity } from './world.mjs';
import * as M from './ships.mjs';
import { asteroidField } from './scenery.mjs';
import { Flight } from './controllers/fly.mjs';
import { aimTurret } from './ai.mjs';
import { SHIPS, HIRE, UPGRADES } from './data.mjs';
import { mulberry, fmtTime, clamp, turnToward, el } from './util.mjs';
import { EFFECTS, replySchema, cleanSay, scriptedLine, scriptedEffect } from './comms.mjs';

const round50 = (n) => Math.round(n / 50) * 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSED_HAIL_COST = 15; // seconds off the clock for a transmission sent from the paused map

const TEMPERS = {
  proud: { blurb: 'proud and theatrical; you cannot stand being talked down to, and you respect nerve', nerve: 5, patience: 5 },
  greedy: { blurb: 'greedy and practical; everything is a number to you and you enjoy haggling', nerve: 4, patience: 7 },
  desperate: { blurb: 'desperate and short of time; you need this payday badly and it shows in your voice', nerve: 4, patience: 5 },
  cold: { blurb: 'cold and patient; you never raise your voice and you do not bluff', nerve: 6, patience: 8 }
};
const NAMES = {
  you: ['Reyes', 'Okafor', 'Lindqvist', 'Tanaka', 'Moreau', 'Baptiste'],
  rook: ['Sable Mora', 'Jakob Teague', 'Ysolde Crane', 'Orrin Vash', 'Dima Kestova', 'Halla Brandt'],
  rookShip: ['Magpie', 'Gallows Bird', 'Long Knife', 'Second Mercy', 'Tallyman'],
  hauler: ['Marigold', 'Patient Ox', 'Ada Bell', 'Low Tide', 'Bright Ledger'],
  master: ['Tomas Reiner', 'Ines Okoro', 'Pell Aurand', 'Greta Lindqvist'],
  officer: ['Lieutenant Adeyemi', 'Lieutenant Sørensen', 'Commander Hale'],
  patrol: ['Vigil', 'Steadfast', 'Ardent'],
  prize: ['Lantern', 'Old Debt', 'Borrowed Time']
};

/** The sheet for a seed: everything that varies, as plain data. */
export function rollMission(seed) {
  seed = (Number(seed) >>> 0) || 1;
  const r = mulberry(seed * 7919 + 13);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const temper = pick(Object.keys(TEMPERS));
  const escorts = int(1, 3);
  const fleet = r() < 0.4; // you have a second ship: the prize corvette, with Kesh flying her
  const hot = r() < 0.3; // you arrive with the shooting already started
  const ask = round50(2400 + r() * 1400);
  const floor = round50(ask * (0.38 + r() * 0.2));
  const credits = round50(floor * (0.75 + r() * 0.7));
  const fee = round50(1800 + r() * 1200);
  const clock = int(14, 18) * 60;
  const boarders = int(2, 4);
  const souls = int(7, 14);
  const rook = { captain: pick(NAMES.rook), ship: pick(NAMES.rookShip), temper, ask, floor, nerve: TEMPERS[temper].nerve + (fleet ? 1 : 0), patience: TEMPERS[temper].patience, escorts: escorts + (fleet ? 1 : 0), boarders };
  const hauler = { name: pick(NAMES.hauler), master: pick(NAMES.master), temper: pick(['frightened', 'stubborn']), souls, cargo: pick(['medicine for Haven', 'reactor parts', 'seed stock and water filters']) };
  const willing = pick(['eager', 'reluctant', 'reluctant', 'absent']);
  const concord = { officer: pick(NAMES.officer), ship: pick(NAMES.patrol), temper: pick(['by the book', 'weary']), willing, need: willing === 'eager' ? 1 : 2, eta: int(150, 300), levy: 0.3 };
  const secretId = pick(['fuel', 'bounty', 'crew']);
  const secret = {
    fuel: { id: 'fuel', text: `The ${rook.ship} is flying on fumes: she has to make this thread window or she is stranded here.`, use: `Say it to ${rook.captain.split(' ')[1]}: the Rooks can no longer wait you out.` },
    bounty: { id: 'bounty', text: `Concord has a standing bounty on ${rook.captain}. A patrol would come a long way to collect it.`, use: 'Say it to Concord: it is the reason they need to come.' },
    crew: { id: 'crew', text: boarders <= 2 ? `Only two Rooks are aboard the ${hauler.name}. The rest went back to the ${rook.ship}.` : `There are ${boarders} Rooks aboard the ${hauler.name}, armoured. Do not come through the airlock lightly.`, use: 'It tells you what boarding her will cost.' }
  }[secretId];
  // You: the Kestrel as she is today. A couple of refits, two more hands, what is in the safe.
  const upgrades = [];
  const pool = UPGRADES.map((u) => u.id);
  for (let i = int(1, 3); i > 0; i--) {
    const u = pick(pool);
    if (!upgrades.includes(u)) upgrades.push(u);
  }
  const crew = { vex: 'helm', dag: 'turret' };
  const hired = [];
  const hands = HIRE.filter((h) => h.id !== 'kesh').map((h) => h.id);
  while (hired.length < 2) {
    const id = pick(hands);
    if (!hired.includes(id)) hired.push(id);
  }
  let party = 0;
  for (const id of hired) {
    const role = HIRE.find((h) => h.id === id).role;
    crew[id] = role === 'engineer' ? 'engine' : party++ < 2 ? 'party' : 'idle';
  }
  const you = { captain: 'Captain ' + pick(NAMES.you), credits, upgrades, crew, hired, hull: hot ? 0.85 : 1, prize: fleet ? pick(NAMES.prize) : null };
  return { seed, template: 'standoff', title: `The ${hauler.name} standoff`, place: 'Cinder Reach', sky: pick(['cinder', 'drift']), rocks: int(60, 160), clock, hot, fee, you, rook, hauler, concord, secret };
}

/** The game state a sheet deals you (the shape `freshState` makes in game.mjs). */
export function missionState(sheet, base) {
  const y = sheet.you;
  const st = { ...base, captain: y.captain, credits: y.credits, upgrades: [...y.upgrades], crew: { ...y.crew }, hired: [...y.hired], fleet: [], missions: [], log: [], flags: {}, sector: 'mission', standing: { concord: 10, rooks: -10, guild: 5 }, hull: null, hullShare: y.hull };
  if (y.prize) {
    st.hired.push('kesh');
    st.crew.kesh = 'prize:fleet-1';
    st.fleet.push({ id: 'fleet-1', name: y.prize, cls: SHIPS.corvette.cls, kind: 'corvette', hull: SHIPS.corvette.hull, hullMax: SHIPS.corvette.hull, job: null, slot: 0, crew: 'kesh', at: 'mission', pos: null });
  }
  return st;
}

export class Mission {
  constructor(game, sheet, voices) {
    this.game = game;
    this.sheet = sheet;
    this.voices = voices;
    this.rnd = mulberry(sheet.seed * 104729 + 7);
    this.left = sheet.clock;
    this.t = 0;
    this.over = null;
    this.endT = null;
    this.settle = null;
    this.known = {}; // facts you have learned, by id
    this.events = []; // the timeline the debrief reads
    this.sent = 0;
    this.firstShot = null;
    this.brokeDeal = false;
    this.haulerHits = 0;
    this.kills = 0;
    this.paid = 0;
    this.warned = {};
    const R = sheet.rook;
    this.R = { ...R, stance: sheet.hot ? 'hostile' : 'standoff', fear: 0, trust: 0, fuelUsed: false, knowsConcord: false, dead: false, withdrew: false, lost: 0 };
    this.C = { ...sheet.concord, state: 'away', points: 0, told: {}, etaLeft: 0 };
    this.H = { ...sheet.hauler, state: 'held', told: false };
    this.P = { rook: { busy: 0, hist: [], log: [] }, master: { busy: 0, hist: [], log: [] }, concord: { busy: 0, hist: [], log: [] } };
    this.channel = 'rook';
    this.unread = { rook: 0, master: 0, concord: 0 };
    this.clockEl = document.getElementById('mclock');
    this.hailEl = document.getElementById('hailbox');
  }

  // --- the scene ---------------------------------------------------------------------------------------------------

  /** Lays the place out and puts everyone in it: two gates, rocks, the hauler with the corvette on her beam, the
   *  raiders circling, the Kestrel 1.4 km off with her nose on them (and your prize on her quarter if you have one). */
  build() {
    const g = this.game;
    const w = g.world;
    const S = this.sheet;
    w.clear([]);
    w.sector = { id: 'mission', name: S.place, blurb: S.title, seed: S.seed, threads: ['haven', 'drift'] };
    g.space.setSector(S.sky);
    const rnd = mulberry(S.seed + 5);
    const names = { haven: 'THREAD → HAVEN', drift: 'THREAD → THE DRIFT (ROOKS)' };
    w.sector.threads.forEach((to, i) => {
      const a = i * Math.PI + (S.seed % 628) / 100;
      const gate = M.gate();
      gate.position.set(Math.cos(a) * 2600, (rnd() - 0.5) * 300, Math.sin(a) * 2600);
      gate.lookAt(0, gate.position.y, 0);
      const e = w.add(new Entity('gate', gate, { side: 'none', hittable: false, radius: 45, name: names[to] }));
      e.to = to;
      w.gates.push(e);
    });
    this.exitGate = w.gates[0];
    this.rookGate = w.gates[1];
    const field = asteroidField(rnd, S.rocks, { avoid: [{ pos: new THREE.Vector3(0, 0, 0), r: 700 }], kind: S.sky });
    w.rocks = field.userData.rocks;
    g.scene.add(field);
    w.asteroids = field;
    const wire = (e) => {
      e.onDamage = (amount, at, side) => side === 'player' && this.shotAt(e);
      return e;
    };
    // The hauler, dead in space, and her captors.
    const hg = M.freighter();
    hg.position.set(0, 0, 0);
    hg.rotation.y = 0.6;
    const h = w.add(new Entity('freighter', hg, { side: 'guild', hull: SHIPS.freighter.hull, shields: SHIPS.freighter.shields, radius: SHIPS.freighter.radius, half: SHIPS.freighter.half, name: this.H.name.toUpperCase() }));
    h.cls = SHIPS.freighter;
    h.boardable = true;
    h.heldBy = 'rooks';
    h.defenderCount = this.R.boarders;
    w.freighter = this.hauler = wire(h);
    const cg = M.corvette();
    cg.position.set(260, 40, -230);
    cg.lookAt(-1100, 30, 900);
    const c = w.add(new Entity('corvette', cg, { side: 'rooks', hull: SHIPS.corvette.hull, shields: SHIPS.corvette.shields, radius: SHIPS.corvette.radius, half: SHIPS.corvette.half, name: this.R.ship.toUpperCase() }));
    c.cls = SHIPS.corvette;
    c.boardable = true;
    w.corvette = this.corvette = wire(c);
    this.escorts = [];
    for (let i = 0; i < this.R.escorts; i++) {
      const a = (i / this.R.escorts) * Math.PI * 2;
      const e = w.spawnPirate(new THREE.Vector3(Math.cos(a) * 380, 30 * (i % 2 ? 1 : -1), Math.sin(a) * 380));
      e.orbit = a;
      e.name = `ROOK RAIDER ${i + 1}`;
      this.escorts.push(wire(e));
    }
    // You.
    const k = g.player.obj;
    k.position.set(-1100, 30, 900);
    k.lookAt(0, 0, 0);
    k.updateMatrixWorld();
    g.player.hull = Math.round(g.player.hullMax * (g.state.hullShare ?? 1));
    g.helmFlight.throttle = 0;
    g.player.vel.set(0, 0, 0);
    if (!w.entities.includes(g.player)) w.add(g.player);
    g.spawnFollowers();
    if (S.hot) for (const [i, e] of this.escorts.entries()) e.obj.position.copy(k.position).add(new THREE.Vector3(420 + i * 90, 60 - i * 50, -380 - i * 60));
    this.note(S.hot ? `You dropped in with the ${this.R.ship}'s raiders already on you.` : `You arrived 1.4 km off the ${this.H.name}.`);
  }

  // --- sides and hands -----------------------------------------------------------------------------------------------

  /** Who shoots whom here: the Rooks' stance decides, not the campaign's standing. */
  hostile(a, b) {
    if (a === b || a === 'none' || b === 'none') return false;
    const pair = (x, y) => (a === x && b === y) || (a === y && b === x);
    if (pair('rooks', 'player')) return this.R.stance === 'hostile';
    if (pair('rooks', 'concord')) return true;
    if (pair('rooks', 'guild')) return this.R.stance === 'hostile' && this.H.state === 'freed';
    return false;
  }

  rooksLeft() {
    return [this.corvette, ...this.escorts].filter((e) => e.alive && !e.gone && e.side === 'rooks');
  }

  /** The AI's frame for a ship this mission moves itself (a standoff, a retreat, the hauler). True: handled. */
  drive(e, dt) {
    const g = this.game;
    if (e === this.hauler) {
      e.flight ??= new Flight(e, SHIPS.freighter);
      if (e.boarded && g.phase === 'board') return e.vel.set(0, 0, 0), true;
      if (this.H.state !== 'freed') return e.flight.hold(dt), true;
      if (e.flight.toward(this.exitGate.obj.position, dt, { stop: 60 }) < 130) this.haulerSafe();
      return true;
    }
    if (e.side !== 'rooks') return false;
    const st = this.R.stance;
    if (st === 'hostile') return false; // the ordinary Rook: ai.mjs
    const leaving = st === 'leaving';
    if (e === this.corvette) {
      if (e.boarded || e.captured) return e.vel.set(0, 0, 0), true;
      e.flight ??= new Flight(e, SHIPS.corvette);
      if (leaving) {
        if (e.flight.toward(this.rookGate.obj.position, dt, { stop: 40 }) < 110) this.jumpOut(e);
      } else {
        e.flight.hold(dt);
        const at = g.playerBody().obj.position.clone();
        for (const t of e.obj.userData.turrets ?? []) aimTurret(t, e.obj, at, dt, 1.2); // her guns follow you. That is the standoff.
      }
      return true;
    }
    if (e.kind === 'pirate') {
      e.flight ??= new Flight(e, SHIPS.pirate);
      if (leaving) {
        turnToward(e.obj, this.rookGate.obj.position, SHIPS.pirate.turn, dt);
        e.flight.throttle = 1;
        e.flight.move(dt);
        if (e.obj.position.distanceTo(this.rookGate.obj.position) < 110) this.jumpOut(e);
      } else {
        // A slow ring round the prize.
        e.orbit += dt * 0.11;
        const c = this.hauler.alive ? this.hauler.obj.position : this.corvette.obj.position;
        const to = new THREE.Vector3(c.x + Math.cos(e.orbit) * 400, c.y + Math.sin(e.orbit * 0.7) * 60, c.z + Math.sin(e.orbit) * 400);
        turnToward(e.obj, to, SHIPS.pirate.turn, dt);
        e.flight.throttle = 0.25;
        e.flight.move(dt);
      }
      return true;
    }
    return false;
  }

  jumpOut(e) {
    const g = this.game;
    g.combat.burst(e.obj.position.clone(), e.radius > 20 ? 30 : 10, { shards: 0, camera: g.camera, sound: false });
    e.gone = true;
    e.alive = false;
    e.deathHandled = true;
    g.world.remove(e);
    if (e === this.corvette) this.note(`The ${this.R.ship} went through the Rooks' thread.`);
  }

  // --- the clock and what it trips -----------------------------------------------------------------------------------

  frame(dt) {
    const g = this.game;
    if (this.over) {
      if (this.endT !== null && (this.endT -= dt) <= 0) {
        this.endT = null;
        g.showDebrief();
      }
      return;
    }
    this.t += dt;
    this.left -= dt;
    const R = this.R, C = this.C;
    // Concord on its way.
    if (C.state === 'inbound' && (C.etaLeft -= dt) <= 0) this.concordArrives();
    // The Rooks' losses.
    const lost = this.escorts.filter((e) => !e.alive && !e.gone).length;
    if (lost > R.lost) {
      R.lost = lost;
      this.kills++;
      this.note(`A Rook raider was destroyed (${this.escorts.length - lost} left).`);
      if (!R.dead && this.corvette.alive) this.react('rook', `[EVENT] One of your raider escorts was just destroyed. ${this.escorts.length - lost} left.`, { key: 'escort' });
    }
    if (!R.dead && !this.corvette.alive && !this.corvette.gone) {
      R.dead = true;
      this.kills++;
      this.note(`The ${R.ship} was destroyed with ${R.captain} aboard.`);
      R.stance = 'leaving'; // what is left of her wing runs
      this.freeHauler('The prize crew gave the hauler up when their ship died.');
    }
    if (!this.hauler.alive && this.H.state !== 'safe') return this.end('hauler-lost');
    // She has had enough: a losing fight is a reason to leave, not only to die.
    if (R.stance === 'hostile' && !R.dead && !R.withdrawing && this.t > (this.checkT ?? 0)) {
      this.checkT = this.t + 2;
      if (this.leverage() >= R.nerve + 2 || this.corvette.hull < this.corvette.hullMax * 0.35) {
        R.withdrawing = true;
        this.react('rook', '[EVENT] This fight is going badly for you: you are losing more than the prize is worth.', { moves: ['withdraw'], key: 'withdraw' });
      }
    }
    // Her warnings.
    if (R.stance === 'standoff' && !R.dead) {
      if (!this.warned.half && this.left < this.sheet.clock / 2) (this.warned.half = true), this.react('rook', `[EVENT] Half the time until your thread opens has gone and the Kestrel has not paid. ${fmtTime(this.left)} left.`, { key: 'half', moves: ['hold', 'threaten'] });
      if (!this.warned.final && this.left < 120) (this.warned.final = true), this.react('rook', '[EVENT] Two minutes until your thread opens. Give the Kestrel a last warning.', { key: 'final', moves: ['threaten'] });
    }
    if (this.H.state === 'freed' && !this.rooksLeft().length) return this.end('safe');
    if (this.settle !== null && (this.settle -= dt) <= 0) return this.end('safe');
    if (this.left <= 0 && this.H.state === 'held') return this.end('taken');
    if (this.left <= 0) this.left = 0;
  }

  /** Twice a second, paused or not: the clock over the view. */
  dom() {
    if (!this.clockEl) return;
    const R = this.R, C = this.C;
    const stance = R.dead ? 'DEAD' : { standoff: 'STANDOFF', hostile: 'WEAPONS HOT', leaving: 'LEAVING' }[R.stance];
    const chips = [
      `<b class="${this.left < 120 ? 'bad' : this.left < this.sheet.clock / 2 ? 'warn' : ''}">${fmtTime(this.left)}</b>`,
      `<span>${this.H.name.toUpperCase()} · ${{ held: 'HELD', freed: 'FREE · RUNNING', safe: 'SAFE' }[this.H.state]}</span>`,
      `<span class="${R.stance === 'hostile' && !R.dead ? 'bad' : ''}">${R.captain.split(' ')[1].toUpperCase()} · ${stance}</span>`,
      C.state === 'inbound' ? `<span class="good">CONCORD · ${fmtTime(C.etaLeft)} OUT</span>` : C.state === 'here' ? '<span class="good">CONCORD · ON STATION</span>' : ''
    ];
    const html = chips.join('');
    if (html !== this.clockHtml) this.clockEl.innerHTML = this.clockHtml = html;
    this.clockEl.hidden = false;
    if (this.hailT > 0 && (this.hailT -= this.game.realDt ?? 0) <= 0) this.hailEl.hidden = true;
  }

  // --- what you did ----------------------------------------------------------------------------------------------------

  /** One of your bolts landed on `e`. */
  shotAt(e) {
    const R = this.R;
    if (this.over) return;
    if (e === this.hauler) {
      if (!this.haulerHits++) this.aside(`That was the ${this.H.name} you hit. There are ${this.H.souls} people in her.`);
      return;
    }
    if (e.side !== 'rooks' || R.stance === 'hostile') return;
    this.firstShot ??= 'you';
    const broke = R.stance === 'leaving' && !R.dead;
    R.stance = 'hostile';
    this.settle = null;
    if (broke) {
      this.brokeDeal = true;
      this.note('You fired on the Rooks as they were leaving.');
      this.react('rook', '[EVENT] You had released the hauler and were leaving, and the Kestrel has just opened fire on you anyway.', { moves: ['attack'], key: 'broken' });
    } else {
      this.note('You fired first.');
      if (!R.dead) this.react('rook', '[EVENT] The Kestrel has just opened fire on your ships without warning.', { moves: ['attack'], key: 'attack' });
    }
    this.game.banner('WEAPONS HOT', 'bad');
  }

  /** You went through an airlock with a rifle. Aboard the prize, that is the end of anybody's patience. */
  boarded(ship) {
    const R = this.R;
    this.note(`You boarded the ${ship === this.hauler ? this.H.name : R.ship}.`);
    if (this.over || R.dead || R.stance !== 'standoff') return;
    R.patience -= 2;
    this.react('rook', `[EVENT] The Kestrel's captain has just forced the airlock of ${ship === this.hauler ? `your prize, the ${this.H.name}, and is fighting your prize crew` : 'your own ship and is fighting your crew in the corridors'}.`, { moves: R.patience <= 0 ? ['attack'] : ['threaten', 'attack'], key: 'boarded' });
  }

  /** An order on the command map to attack a Rook who is not shooting yet: that is you firing first. */
  orderedAttack(e) {
    if (e?.side === 'rooks' && this.R.stance !== 'hostile') this.shotAt(e);
  }

  /** You took a bridge by hand (controllers/board.mjs → game.captured). */
  captured(ship) {
    const g = this.game;
    if (ship.captured) return;
    ship.captured = true;
    g.banner('THE BRIDGE IS YOURS', 'good');
    if (ship === this.hauler) {
      this.byHand = true;
      this.note(`You took the ${this.H.name}'s bridge back from ${this.R.boarders} Rooks.`);
      this.freeHauler(null, 'run');
      if (!this.R.dead && this.rooksLeft().length) {
        const moves = this.leverage() >= this.R.nerve ? ['withdraw', 'attack'] : ['attack'];
        this.react('rook', `[EVENT] The Kestrel's captain has boarded the ${this.H.name} and taken her bridge back from your prize crew. You no longer hold the hauler.`, { moves, key: 'attack' });
      }
    } else if (ship === this.corvette) {
      this.flagship = true;
      ship.side = 'player';
      ship.name = `${ship.name} (YOURS)`;
      this.R.dead = true;
      this.R.stance = 'leaving';
      this.note(`You took ${this.R.captain} prisoner on the ${this.R.ship}'s bridge.`);
      this.freeHauler('With their captain taken, the prize crew gave the hauler up.');
    }
    g.panel.show('boarding');
  }

  /** You took the Kestrel through a gate: you left. */
  jumpedOut() {
    if (this.H.state === 'held') return this.end('abandoned');
    this.end('safe');
  }

  kestrelLost() {
    this.end('lost-ship');
  }

  freeHauler(why, line = 'free') {
    if (this.H.state !== 'held') return;
    this.H.state = 'freed';
    this.hauler.heldBy = null;
    if (why) this.note(why);
    this.say('master', 'them', scriptedLine('master', line, this.vars('master'), this.rnd));
    this.game.banner(`${this.H.name.toUpperCase()} IS FREE`, 'good');
  }

  haulerSafe() {
    if (this.H.state === 'safe') return;
    this.H.state = 'safe';
    this.note(`The ${this.H.name} went through the Haven thread.`);
    const e = this.hauler;
    this.game.combat.burst(e.obj.position.clone(), 30, { shards: 0, camera: this.game.camera, sound: false });
    e.deathHandled = true;
    e.gone = true;
    this.game.world.remove(e);
    this.end('safe');
  }

  concordArrives() {
    const g = this.game, C = this.C;
    C.state = 'here';
    this.R.knowsConcord = true;
    for (let i = 0; i < 2; i++) {
      const e = g.world.spawnPirate(this.exitGate.obj.position.clone().multiplyScalar(0.93).add(new THREE.Vector3(i * 80, 30 * i, 0)));
      e.side = 'concord';
      e.name = i ? 'CONCORD PATROL' : C.ship.toUpperCase();
      M.setEngineColor(e.obj, '#58b0ff');
      e.obj.lookAt(0, 0, 0);
    }
    this.note(`Concord patrol ${C.ship} came through the Haven thread.`);
    this.say('concord', 'them', scriptedLine('concord', 'arrive', this.vars('concord'), this.rnd));
    g.banner('CONCORD ON STATION', 'good');
    if (!this.R.dead && this.R.stance !== 'leaving') {
      const moves = this.leverage() >= this.R.nerve ? ['withdraw', 'attack'] : ['attack'];
      if (this.R.stance === 'standoff') this.react('rook', '[EVENT] Two Concord patrol ships have just come through the Haven thread with weapons hot. The Kestrel called them.', { moves, key: 'concord' });
    }
  }

  // --- the numbers the rules turn on -----------------------------------------------------------------------------------

  /** How much reason she has to give this up. Talk alone moves it two points at most: the rest is facts. */
  leverage() {
    const R = this.R, C = this.C;
    return Math.min(2, R.fear) + 2 * R.lost + (R.fuelUsed ? 2 : 0) + (C.state === 'here' ? 4 : C.state === 'inbound' && R.knowsConcord ? 2 : 0) + (this.corvette.alive && this.corvette.hull < this.corvette.hullMax * 0.6 ? 2 : 0) + (this.sheet.you.prize ? 1 : 0);
  }

  /** The least she would take right now: her floor, softened by trust, a known weakness and her losses. */
  floorNow() {
    const R = this.R;
    return Math.max(300, round50(R.floor * (1 - 0.08 * Math.min(3, Math.max(0, R.trust))) * (R.fuelUsed ? 0.75 : 1) * (1 - 0.1 * R.lost)));
  }

  /** The moves open to the Rook captain, for what you just said. */
  rookMoves(ctx = {}) {
    const R = this.R;
    const L = this.leverage();
    const offer = ctx.offer && ctx.offer <= this.game.state.credits ? ctx.offer : 0;
    const canPay = offer >= this.floorNow();
    if (R.stance === 'leaving') return ['hold'];
    if (R.stance === 'hostile') return ['taunt', ...(L >= R.nerve - 1 ? ['ceasefire'] : []), ...(L >= R.nerve ? ['withdraw'] : []), ...(canPay ? ['accept'] : [])];
    if (offer && offer >= R.ask) return ['accept'];
    if (L >= R.nerve + 2) return ['withdraw'];
    const out = R.patience <= 0 ? ['attack'] : ['hold', 'threaten', 'counter'];
    if (canPay) out.push('accept');
    if (L >= R.nerve) out.push('withdraw');
    return out;
  }

  // --- comms -------------------------------------------------------------------------------------------------------------

  parties() {
    const R = this.R, C = this.C, H = this.H;
    const gone = R.dead || !this.rooksLeft().includes(this.corvette);
    return [
      { id: 'rook', name: R.captain, ship: R.ship, role: 'Free Rooks · corvette', color: '#ff5540', status: R.dead ? 'silent' : { standoff: `wants ${R.ask.toLocaleString()} cr`, hostile: 'shooting at you', leaving: 'leaving' }[R.stance], can: !gone, why: gone ? 'Nobody answers.' : '' },
      { id: 'master', name: H.master, ship: H.name, role: `Guild hauler · ${H.souls} aboard`, color: '#ffb347', status: { held: 'held by a prize crew', freed: 'free, running for the Haven thread', safe: 'safe' }[H.state], can: this.hauler.alive && !this.hauler.gone, why: '' },
      { id: 'concord', name: C.officer, ship: C.ship, role: 'Concord patrol', color: '#58b0ff', status: { away: 'not here', inbound: `${fmtTime(C.etaLeft)} out`, here: 'on station', refused: 'will not come' }[C.state], can: true, why: '' }
    ];
  }

  vars(id) {
    const R = this.R, C = this.C, H = this.H;
    const base = { you: this.sheet.you.captain, hauler: H.name, left: fmtTime(this.left), price: R.ask.toLocaleString(), souls: H.souls, secret: this.sheet.secret.text, eta: fmtTime(C.state === 'inbound' ? C.etaLeft : C.eta) };
    if (id === 'rook') return { ...base, me: R.captain, ship: R.ship };
    if (id === 'master') return { ...base, me: H.master, ship: H.name };
    return { ...base, me: C.officer, ship: C.ship };
  }

  /** A line in a party's channel. `from`: you | them | aside (your own crew) | note (what happened). */
  say(id, from, text, who = null) {
    const P = this.P[id];
    P.log.push({ t: this.t, from, text, who });
    if (from === 'them') {
      const p = this.parties().find((x) => x.id === id);
      if (this.channel !== id || this.game.panel.tab !== 'comms') this.unread[id]++;
      if (this.hailEl) {
        this.hailEl.replaceChildren(el('b', { style: `color:${p.color}` }, `◉ ${p.name.toUpperCase()} · ${p.ship}`), el('div', {}, text));
        this.hailEl.hidden = false;
        this.hailEl.onclick = () => this.openChannel(id);
        this.hailT = 9;
      }
    }
    this.game.panel.refresh();
  }

  aside(text, who = null) {
    const g = this.game;
    who ??= g.crewName(g.crewAt('helm')) ?? 'Vex';
    this.say(this.channel, 'aside', text, who);
    g.toast(`${who}: ${text}`, 'warn');
  }

  note(text) {
    this.events.push({ t: this.t, text });
    this.game.log(text);
  }

  openChannel(id) {
    this.channel = id;
    this.unread[id] = 0;
    this.game.input.unlock();
    this.game.panel.show('comms');
  }

  /** Lines you can send with one click: the obvious things to say from where things stand. */
  suggestions(id) {
    const R = this.R, C = this.C, H = this.H;
    const out = [];
    if (id === 'rook') {
      if (R.stance === 'hostile') out.push('Cease fire. Neither of us needs to lose a ship over this.');
      else {
        const mine = this.game.state.credits;
        out.push(`I can pay ${Math.min(mine, round50(R.ask * 0.5)).toLocaleString()} credits. Take it and go.`);
        out.push('Release the hauler and leave. You do not want what happens otherwise.');
      }
      if (this.known.fuel && !R.fuelUsed) out.push(`I know the ${R.ship} is flying on fumes. You cannot wait me out.`);
      if (C.state === 'inbound' && !R.knowsConcord) out.push(`A Concord patrol is ${fmtTime(C.etaLeft)} out. Leave now while you still can.`);
    } else if (id === 'master') {
      out.push(H.told ? 'Hold on. We are coming for you.' : 'What can you tell me about them?');
    } else {
      if (C.state === 'away') out.push(`A Rook corvette is holding ${H.souls} Guild crew in Cinder Reach. I need a patrol.`);
      if (this.known.bounty && !C.told.bounty) out.push(`It is ${R.captain}. You have a bounty on her.`);
      if (C.state !== 'away') out.push('How long?');
    }
    return out;
  }

  /** You hail `id` with `text`. */
  async hail(id, text) {
    text = String(text ?? '').trim().slice(0, 300);
    const p = this.parties().find((x) => x.id === id);
    if (!text || this.over || !p?.can || this.P[id].busy) return false;
    const g = this.game;
    this.sent++;
    this.say(id, 'you', text);
    if (g.command.open && g.command.paused) this.left = Math.max(1, this.left - PAUSED_HAIL_COST);
    const ctx = { text };
    let moves;
    let user = `[${this.sheet.you.captain} of the Kestrel says:] ${text}`;
    if (id === 'rook') {
      const R = this.R;
      ctx.offer = parseOffer(text);
      ctx.notes = [];
      if (this.known.fuel && !R.fuelUsed && /fuel|fumes|tank|reactor|strand|dry|wait me out/i.test(text)) {
        R.fuelUsed = true;
        this.note(`You told ${R.captain} you knew about the fuel.`);
        ctx.notes.push('They know you are nearly out of fuel and must make this thread window. It is true, and it frightens you.');
      }
      if (/concord|patrol|navy|the law/i.test(text)) {
        const real = this.C.state === 'inbound' || this.C.state === 'here';
        if (real) R.knowsConcord = true;
        ctx.notes.push(real ? 'Your long scope confirms it: Concord ships really are coming through the Haven thread.' : 'Your scope shows no Concord ships anywhere. This is probably a bluff.');
      }
      if (ctx.offer) ctx.notes.push(ctx.offer > g.state.credits ? `They offered ${ctx.offer} credits, but your scan of their safe says they cannot cover it.` : `They have put ${ctx.offer} credits on the table.`);
      moves = this.rookMoves(ctx);
    } else if (id === 'master') {
      moves = this.H.told || this.H.state !== 'held' ? ['plead'] : ['tell'];
      if (this.R.stance === 'standoff' && !this.warned.cargo) {
        this.warned.cargo = true;
        this.R.patience--;
        setTimeout(() => !this.over && this.R.stance === 'standoff' && this.say('rook', 'them', `Talk to me, ${this.sheet.you.captain}, not to my cargo.`), 2500);
      }
    } else {
      const C = this.C;
      if (this.known.bounty && !C.told.bounty && /bounty|mora|reward|wanted/i.test(text + ' ' + (text.includes(this.R.captain.split(' ')[1]) ? 'mora' : ''))) (C.told.bounty = true), (C.points += 2);
      if (!C.told.stakes && /corvette|hostage|crew|souls|people|medicine|guild/i.test(text)) (C.told.stakes = true), (C.points += 1);
      moves = C.state === 'inbound' ? ['inbound'] : C.state === 'here' ? ['here'] : C.willing === 'absent' ? ['absent'] : ['refuse', 'stall', ...(C.points >= C.need ? ['come'] : [])];
    }
    await this.exchange(id, { user, moves, ctx });
    return true;
  }

  /** A party speaks without being hailed: something happened that she would not stay quiet about. */
  react(id, event, { moves = null, key = null } = {}) {
    if (this.over) return;
    const ctx = { event: true, notes: [] };
    return this.exchange(id, { user: `${event} Hail the Kestrel about it.`, moves: moves ?? (id === 'rook' ? this.rookMoves(ctx).filter((m) => m !== 'accept') : ['plead']), key, ctx });
  }

  /** One exchange: the voice picks a move from `moves` and says it; the rules check it and apply it. */
  async exchange(id, { user, moves, key = null, ctx = {} }) {
    const P = this.P[id];
    P.busy++;
    this.game.panel.refresh();
    let out = null;
    if (this.voices.live) out = await this.voices.ask({ system: this.systemFor(id, moves, ctx), turns: [...P.hist.slice(-8), { role: 'user', content: user }], schema: replySchema(moves) });
    else await sleep(350);
    P.busy--;
    if (this.over) return null;
    // What was open to her when you spoke may not be now (you shot her while she was thinking).
    if (id === 'rook' && !ctx.event) {
      const now = this.rookMoves(ctx);
      if (moves.some((m) => !now.includes(m))) (moves = now), (out = null), (key = null);
    } else if (id === 'rook' && this.R.stance === 'hostile' && !moves.some((m) => ['attack', 'taunt', 'withdraw', 'ceasefire'].includes(m))) return null;
    const temper = id === 'rook' ? this.R.temper : id === 'master' ? this.H.temper : this.C.temper;
    const live = !!out && typeof out === 'object';
    const move = live && moves.includes(out.move) ? out.move : this.scriptMove(id, moves, ctx);
    const effect = ctx.event ? 'unmoved' : live && EFFECTS.includes(out.effect) ? out.effect : scriptedEffect(ctx.text ?? '', temper, this.rnd);
    let say = live ? cleanSay(out.say) : '';
    const result = this.apply(id, { move, effect, price: live ? Number(out.price) : NaN, ctx });
    if (!say) say = scriptedLine(id, key && (!live || move === moves[0]) ? key : move, this.vars(id), this.rnd);
    if (id === 'rook' && result.price) say = /\d[\d,.]{2,}/.test(say) ? say.replace(/\d[\d,.]*\d/g, (n) => (Number(n.replace(/[,.]/g, '')) >= 100 ? result.price.toLocaleString() : n)) : ['counter'].includes(move) ? `${say} ${result.price.toLocaleString()} credits.` : say;
    P.hist.push({ role: 'user', content: user }, { role: 'assistant', content: JSON.stringify({ say, effect, move }) });
    this.say(id, 'them', say);
    // Whatever words the voice found for it, the fact itself goes on the record as the sheet has it.
    if (id === 'master' && move === 'tell') this.say(id, 'note', `◆ Learned: ${this.sheet.secret.text} ${this.sheet.secret.use}`);
    result.after?.();
    return { say, move, effect, live };
  }

  scriptMove(id, moves, ctx) {
    const first = (...want) => want.find((m) => moves.includes(m));
    if (id === 'rook') return first('accept', 'withdraw', ...(moves[0] === 'attack' ? ['attack'] : []), 'ceasefire', ...(ctx.offer ? ['counter'] : []), 'hold', 'threaten', 'taunt') ?? moves[0]; // she shoots when it is all she has left
    if (id === 'concord') return first('come', ...(this.C.stalled ? ['refuse'] : ['stall']), 'refuse') ?? moves[0];
    return first('tell', 'plead') ?? moves[0];
  }

  /** The rules' half of an exchange. Returns { price?, after? }: the number her words must carry, and what happens
   *  once she has said them. */
  apply(id, { move, effect, price, ctx }) {
    const g = this.game;
    if (id === 'master') {
      if (move === 'tell') {
        this.H.told = true;
        this.known[this.sheet.secret.id] = true;
        this.note(`${this.H.master} told you: ${this.sheet.secret.text}`);
      }
      return {};
    }
    if (id === 'concord') {
      const C = this.C;
      if (effect === 'impressed' || effect === 'frightened') C.points++;
      if (move === 'stall') C.stalled = true;
      if (move === 'come') {
        C.state = 'inbound';
        C.etaLeft = C.eta;
        this.note(`Concord agreed to send the ${C.ship}: ${fmtTime(C.eta)} out. They take ${Math.round(C.levy * 100)}% of the Guild's fee.`);
        return { after: () => this.aside(`Concord is coming, ${fmtTime(C.eta)} out. ${this.R.captain.split(' ')[1]} does not know yet.`) };
      }
      return {};
    }
    const R = this.R;
    if (effect === 'insulted') (R.patience -= 2), (R.trust = Math.max(-2, R.trust - 1));
    else if (effect === 'impressed') R.trust = Math.min(3, R.trust + 1);
    else if (effect === 'frightened') R.fear++;
    else if (!ctx.event && !ctx.offer) R.patience--;
    else if (ctx.offer && ctx.offer < this.floorNow() * 0.6) R.patience--; // a lowball wears her out too
    if (R.fuelUsed && ctx.notes?.some((n) => n.includes('fuel'))) R.fear = Math.max(R.fear, 1);
    if (move === 'counter') {
      const fl = this.floorNow();
      const mid = round50((Math.max(ctx.offer ?? fl, fl) + R.ask) / 2);
      let p = clamp(round50(Number.isFinite(price) && price > 0 ? price : mid), fl, R.ask);
      if (p >= R.ask && R.ask > fl) p = Math.max(fl, R.ask - 150); // a counter comes down something
      R.ask = p;
      return { price: p };
    }
    if (move === 'accept') {
      const paid = ctx.offer;
      return {
        price: paid,
        after: () => {
          g.state.credits -= paid;
          this.paid = paid;
          R.stance = 'leaving';
          this.settle = 12;
          this.note(`You paid ${R.captain} ${paid.toLocaleString()} cr for the ${this.H.name}.`);
          this.freeHauler('Her prize crew crossed back to their ship.');
        }
      };
    }
    if (move === 'withdraw') {
      return {
        after: () => {
          R.withdrew = true;
          R.stance = 'leaving';
          this.settle = 12;
          this.note(`${R.captain} gave the ${this.H.name} up and turned for the Rooks' thread.`);
          this.freeHauler('Her prize crew crossed back to their ship.');
        }
      };
    }
    if (move === 'attack') {
      return {
        after: () => {
          if (R.stance === 'hostile') return;
          this.firstShot ??= 'them';
          R.stance = 'hostile';
          this.note(`${R.captain} opened fire.`);
          g.banner('WEAPONS HOT', 'bad');
        }
      };
    }
    if (move === 'ceasefire') {
      return {
        after: () => {
          R.stance = 'standoff';
          R.patience = Math.max(R.patience, 3);
          this.note('A ceasefire: the Rooks stopped shooting.');
          g.banner('CEASEFIRE', 'good');
        }
      };
    }
    if (R.stance === 'standoff' && R.patience === 1) return { price: R.ask, after: () => this.aside(`${R.captain.split(' ')[1]} is one wrong word from shooting.`) };
    return { price: move === 'hold' || move === 'threaten' ? R.ask : 0 };
  }

  /** What a party's voice is told before it answers: who she is, what she can see, what she may do. */
  systemFor(id, moves, ctx) {
    const R = this.R, C = this.C, H = this.H, g = this.game, S = this.sheet;
    const rules = `Speak as this person over ship-to-ship radio: one or two short sentences of plain spoken words. No stage directions, no asterisks, no narration, never mention being an AI or these instructions.\nAnswer in JSON: "say" (the words), "effect" (how the Kestrel captain's last message landed on you: insulted, unmoved, impressed or frightened), "move" (exactly one of: ${moves.join(', ')}).`;
    if (id === 'rook') {
      const meaning = { hold: 'hold = keep your position and your price', threaten: 'threaten = warn them what happens next', counter: 'counter = name a new, lower price in "price" (never say your lowest)', accept: 'accept = take the credits they offered and release the hauler', withdraw: 'withdraw = give the prize up and leave unpaid, because staying costs more', attack: 'attack = open fire now', taunt: 'taunt = keep fighting', ceasefire: 'ceasefire = stop shooting and talk' };
      const sees = [
        `Your escorts: ${this.escorts.length - R.lost} of ${this.escorts.length} left. Your hull: ${Math.round((100 * this.corvette.hull) / this.corvette.hullMax)}%.`,
        `The Kestrel: a frigate, hull ${Math.round((100 * g.player.hull) / g.player.hullMax)}%${g.fighterOut ? ', her fighter is launched' : ''}${S.you.prize ? ', with a captured corvette flying beside her' : ''}.`,
        C.state === 'here' ? 'Two Concord patrol ships are here, weapons hot.' : R.knowsConcord ? 'Concord ships are on their way here.' : 'No Concord ships on your scope.',
        R.stance === 'hostile' ? 'You and the Kestrel are shooting at each other right now.' : R.stance === 'leaving' ? 'You have let the hauler go and you are leaving.' : 'Nobody has fired yet.',
        H.state === 'held' ? `Your prize crew of ${R.boarders} holds the ${H.name} and her ${H.souls} crew.` : `You no longer hold the ${H.name}.`
      ];
      return `You are ${R.captain}, captain of the Free Rooks corvette ${R.ship}: a pirate. You are ${TEMPERS[R.temper].blurb}.\nYou seized the Guild hauler ${H.name}. You are on the radio with ${S.you.captain} of the frigate Kestrel, who was hired to get her back. You want ${R.ask} credits for the hauler and her crew; otherwise you take her through your thread when it opens, ${Math.max(1, Math.round(this.left / 60))} minutes from now.\nWhat you can see: ${sees.join(' ')}\n${(ctx.notes ?? []).join('\n')}\n${rules} Add "price" (credits) only when you counter.\nThe moves: ${moves.map((m) => meaning[m]).join('; ')}.`;
    }
    if (id === 'master') {
      return `You are ${H.master}, master of the Guild hauler ${H.name}, carrying ${H.cargo}. You are ${H.temper}. ${H.state === 'held' ? `Rook pirates from the corvette ${R.ship} hold your ship; you and your ${H.souls} crew are under guard and you are whispering into a hidden handset.` : 'The pirates have left your ship and you are running for the Haven thread.'} You are on the radio with ${S.you.captain} of the frigate Kestrel, who was hired to get you out.\n${moves.includes('tell') ? `You overheard something and you must tell them now, in your own words: ${S.secret.text}` : 'You have nothing new to tell them. Urge them on.'}\n${rules}\nThe moves: tell = pass on what you overheard; plead = urge them to hurry.`;
    }
    const meaning = { refuse: 'refuse = you will not come', stall: 'stall = ask what exactly is out there before deciding', come: `come = agree to bring your patrol, ${fmtTime(C.eta)} away`, absent: 'absent = explain that no patrol can reach them in time', inbound: `inbound = you are on your way, ${fmtTime(C.etaLeft)} out`, here: 'here = you are on station with them' };
    return `You are ${C.officer} of the Concord navy patrol ship ${C.ship}. You are ${C.temper}, stretched thin, and you do not move a patrol without a reason. You are on the radio with ${S.you.captain} of the frigate Kestrel, a private captain on a Guild contract in Cinder Reach, where Rook pirates hold the hauler ${H.name}. If Concord comes, Concord takes ${Math.round(C.levy * 100)}% of the Guild's fee as its levy.\n${rules}\nThe moves: ${moves.map((m) => meaning[m]).join('; ')}.`;
  }

  // --- the end -------------------------------------------------------------------------------------------------------------

  end(key) {
    if (this.over) return;
    const g = this.game, R = this.R, H = this.H, S = this.sheet;
    let route = null;
    if (key === 'safe') route = this.paid ? 'paid' : this.byHand ? 'boarded' : this.flagship ? 'flagship' : R.withdrew ? (this.firstShot ? 'driven' : 'talked') : 'fought';
    const T = {
      paid: ['RANSOM PAID', `You bought the ${H.name} back for ${this.paid.toLocaleString()} cr. ${H.souls} people go home.`],
      talked: ['TALKED DOWN', `${R.captain} left without a credit or a shot. ${H.souls} people go home.`],
      driven: ['DRIVEN OFF', `${R.captain} decided the ${H.name} was not worth dying for.`],
      fought: ['ROOKS DESTROYED', `Nothing of the ${R.ship}'s wing is left. The ${H.name} is free.`],
      boarded: ['TAKEN BACK BY HAND', `You went through the ${H.name}'s airlock and took her bridge back.`],
      flagship: [`THE ${R.ship.toUpperCase()} IS YOURS`, `You took ${R.captain} prisoner on the ${R.ship}'s bridge. The ${H.name} is free.`],
      taken: ['THE THREAD OPENED', `The ${R.ship} took the ${H.name} and her ${H.souls} crew through it.`],
      'hauler-lost': [`THE ${H.name.toUpperCase()} IS GONE`, `She broke up with ${H.souls} people aboard.`],
      'lost-ship': ['KESTREL LOST', 'She broke up round you. The Rooks kept the hauler.'],
      abandoned: ['YOU LEFT THEM', `You took the Kestrel out through a thread. The ${H.name} stayed.`]
    }[route ?? key];
    const good = key === 'safe';
    if (good) {
      this.feePaid = Math.round(S.fee * (this.C.state === 'away' ? 1 : 1 - this.C.levy));
      g.state.credits += this.feePaid;
    }
    this.over = { key, route, good, title: T[0], line: T[1], score: null };
    this.over.score = this.score();
    this.note(`${T[0]}. ${T[1]}`);
    g.banner(T[0], good ? 'good' : 'bad', 5);
    this.endT = key === 'lost-ship' ? 2.6 : 3.2;
    if (this.hailEl) this.hailEl.hidden = true;
    // The wire's account, if a voice is there to write it. The debrief shows without it and takes it when it lands.
    if (this.voices.live) {
      const facts = this.events.map((e) => `${fmtTime(e.t)} ${e.text}`).join('\n');
      this.voices
        .ask({ system: 'You write for a spacers\' news wire. Three plain, dry sentences reporting what happened, in the past tense, naming the people and ships. No headline, no opinion, nothing that is not in the facts. Answer in JSON: {"report": "..."}.', turns: [{ role: 'user', content: `Facts, in order:\n${facts}` }], schema: { type: 'object', properties: { report: { type: 'string' } }, required: ['report'] }, max: 170, timeout: 30000, temperature: 0.6 })
        .then((r) => {
          const text = typeof r?.report === 'string' ? r.report.replace(/\s+/g, ' ').trim().slice(0, 600) : '';
          if (!text) return;
          this.over.report = text;
          g.showDebrief(true);
        });
    }
  }

  /** Points, each with its reason: the debrief prints the list, not just the total. */
  score() {
    const g = this.game, S = this.sheet, o = this.over;
    const lines = [];
    const add = (label, pts, detail = '') => lines.push({ label, pts: Math.round(pts), detail });
    if (o.good) {
      add(`The ${this.H.name} and her crew are safe`, 50, `${this.H.souls} people`);
      const hull = g.player.hull / g.player.hullMax;
      add('The Kestrel', 15 * hull, `hull ${Math.round(hull * 100)}%`);
      add('Time in hand', 10 * clamp(this.left / S.clock, 0, 1), `${fmtTime(this.left)} left of ${fmtTime(S.clock)}`);
      const net = (this.feePaid ?? 0) - this.paid;
      add('The money', 15 * clamp(net / S.fee, 0, 1), `fee ${(this.feePaid ?? 0).toLocaleString()} − ransom ${this.paid.toLocaleString()} = ${net.toLocaleString()} cr`);
      if (!this.kills && !this.firstShot) add('Nobody died', 10);
      else if (this.kills) add('Rooks destroyed', Math.min(10, this.kills * 3), `${this.kills}`);
    }
    if (g.state.wren === 'lost') add('The Wren was lost', -5);
    if (this.brokeDeal) add('You fired on a captain who had dealt', -15);
    if (this.haulerHits) add(`You hit the ${this.H.name}`, -5, `${this.haulerHits} bolts`);
    const total = clamp(lines.reduce((a, l) => a + l.pts, 0), 0, 100);
    const grade = !o.good ? '—' : total >= 85 ? 'S' : total >= 70 ? 'A' : total >= 55 ? 'B' : total >= 40 ? 'C' : 'D';
    return { lines, total, grade };
  }

  /** For the drive. */
  stats() {
    const R = this.R;
    return { seed: this.sheet.seed, left: Math.round(this.left), stance: R.stance, ask: R.ask, floor: this.floorNow(), leverage: this.leverage(), nerve: R.nerve, patience: R.patience, trust: R.trust, fear: R.fear, lost: R.lost, hauler: this.H.state, concord: this.C.state, known: Object.keys(this.known), sent: this.sent, voices: this.voices.state, over: this.over ? { key: this.over.key, route: this.over.route, total: this.over.score.total, grade: this.over.score.grade } : null, rooks: this.rooksLeft().length, log: Object.fromEntries(Object.entries(this.P).map(([k, v]) => [k, v.log.length])) };
  }
}

/** The credits in a sentence, if there are any: "1,500", "1500 cr", "1.5k". Anything under 100 is not an offer. */
export function parseOffer(text) {
  const k = /(\d+(?:[.,]\d+)?)\s*k\b/i.exec(text);
  if (k) return Math.round(parseFloat(k[1].replace(',', '.')) * 1000);
  let best = 0;
  for (const m of text.matchAll(/\d[\d,. ]*\d|\d/g)) {
    const n = Number(m[0].replace(/[,. ]/g, ''));
    if (n >= 100 && n <= 50000) best = Math.max(best, n);
  }
  return best || null;
}
