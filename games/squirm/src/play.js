/* SQUIRM — what every stage shares: the run's state, steering the player, feeding the player's real brain what it senses,
 * biting, and the save. */
(function (S) {
  const E = window.WormEngine;

  S.game = null;
  S.newRun = function () {
    const g = S.makeGenome({ brain: true, segs: 7, girth: 5, hue: S.pick([170, 190, 300, 30]), pattern: 'glass' });
    g.name = 'Squirmus primus';
    S.game = { stage: 1, genome: g, dna: 0, earned: 0, eggs: 0, ate: { plant: 0, meat: 0 }, kills: 0, allies: 0, extinct: 0, deaths: 0, traits: [], t0: Date.now(), cellsAdded: 0, rolls: [] };
    S.player = null; S.brain = null; S.auto = false;
    return S.game;
  };

  // ── the player's brain: Busbice's rule, ticked 20 times a second, fed by what the body senses ──
  S.brainClock = 0;
  S.setBrain = function (g) { S.brain = g.conn ? new E.Brain(g.conn) : null; S.setCellCount(g); };
  /** senses: { food, touch, tail, predator, harm } booleans for this moment. Returns the motor command of the last tick. */
  S.tickBrain = function (dt, senses) {
    if (!S.brain) return null;
    S.brainClock += dt; let m = null, guard = 0;
    while (S.brainClock >= 0.05 && guard++ < 4) {
      S.brainClock -= 0.05;
      const b = S.brain;
      // Busbice's own loop: with nothing touching the robot, pulse the food-smell cells on a 20-step cycle, or the table sits silent
      const quiet = !senses.food && !senses.touch && !senses.tail && !senses.predator && !senses.harm;
      S.tfood = ((S.tfood || 0) + 0.5) % 20;
      const pulse = S.auto && quiet && S.tfood < 2;
      if ((senses.food && Math.random() < 0.6) || pulse) E.SENSE.food.forEach((n) => b.stimulate(n));
      if (senses.touch) E.SENSE.noseTouch.forEach((n) => b.stimulate(n));
      if (senses.tail) E.SENSE.tailTouch.forEach((n) => b.stimulate(n));
      if (senses.predator) E.SENSE.predator.forEach((n) => b.stimulate(n));
      if (senses.harm) E.SENSE.harm.forEach((n) => b.stimulate(n));
      b.keepFired = guard > 1;   // several ticks in one frame: keep every cell that fired lit
      b.tick(); m = b.motor();
    }
    if (m) S.lastMotor = m;
    return S.lastMotor || null;
  };

  /** Keys, mouse or the brain. Returns true when a person steered this frame. */
  S.drivePlayer = function (p, dt) {
    const kv = S.keyVector(), M = S.mouse;
    let ang = null, thr = 0, human = false;
    if (kv) { ang = Math.atan2(kv.y, kv.x); thr = 1; human = true; }
    else if (M.down && !S.overUi) {
      const w = S.toWorld(M.x, M.y), d = S.dist(w.x, w.y, p.x, p.y);
      ang = Math.atan2(w.y - p.y, w.x - p.x); thr = S.clamp(d / (p.length * 1.2), 0.15, 1); human = true;
    }
    if (human) { S.lastSteer = performance.now(); if (S.auto) S.setAuto(false); }
    if (!human && S.auto && S.lastMotor) {
      const m = S.lastMotor; ang = p.h + m.turn * 0.9; thr = m.v;
    }
    if (S.tapped('Space') && !(p.dashCd > 0)) { p.boost = 0.35; p.dashCd = 1.4; S.sfx.play('scent'); S.burst(p.spine[p.n - 1].x, p.spine[p.n - 1].y, S.hsl(p.g.hue, 80, 70), 8, 60, 0.4, 1.5 * p.scale); }
    if (p.dashCd > 0) p.dashCd -= dt;
    p.steer(dt, ang, thr || 0);
    return human;
  };
  S.setAuto = function (on) {
    S.auto = on; const b = S.$('autoBtn'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.innerHTML = on ? 'The brain is driving <kbd>B</kbd>' : 'Let the brain drive <kbd>B</kbd>';
    if (on) S.toast('Hands off: its own nerve cells are steering now', 2.6);
    const n = S.$('autoNote'); if (n) n.hidden = !on;
  };
  S.$('autoBtn').addEventListener('click', () => S.setAuto(!S.auto));

  /** a bites b if its mouth touches b and its jaw is ready. Returns the damage done, 0 when nothing happened. */
  S.tryBite = function (a, b, opts) {
    if (a.cd > 0 || a.dead || b.dead) return 0;
    const m = a.mouth(), hit = b.touches(m.x, m.y, a.r * 0.6);
    if (hit < 0) return 0;
    let dmg = a.st.bite * (1 - b.st.armor) * (opts && opts.mult || 1);
    if (a.boost > 0) dmg *= 1.5;
    b.hp -= dmg; b.flash = 0.15; b.lastHitBy = a; b.lastHitAt = performance.now();
    if (a.st.poison) b.poison = Math.max(b.poison, a.st.poison);
    if (b.st.thorns) { a.hp -= b.st.thorns; a.flash = 0.12; }
    a.cd = 0.55; a.biteAnim = 1;
    const P = b.spine[hit];
    S.burst(P.x, P.y, S.hsl(b.g.hue, 90, 65), 6, 70, 0.45, 1.4 * b.scale);
    return dmg;
  };

  /** Keep a body inside a circle (stage 1) or a box (stages 2–3). */
  S.keepInCircle = function (c, cx, cy, R) { const d = S.dist(c.x, c.y, cx, cy); if (d > R) { c.x = cx + (c.x - cx) * R / d; c.y = cy + (c.y - cy) * R / d; c.h += S.wrap(Math.atan2(cy - c.y, cx - c.x) - c.h) * 0.2; return true; } return false; };
  S.keepInBox = function (c, w, h, m) { let hit = false; if (c.x < m) { c.x = m; hit = true; } if (c.y < m) { c.y = m; hit = true; } if (c.x > w - m) { c.x = w - m; hit = true; } if (c.y > h - m) { c.y = h - m; hit = true; } if (hit) c.h += S.wrap(Math.atan2(h / 2 - c.y, w / 2 - c.x) - c.h) * 0.2; return hit; };
  /** Pebbles and the like: push a body out of circles. */
  S.pushOut = function (c, rocks) { for (const r of rocks) { const dx = c.x - r.x, dy = c.y - r.y, d = Math.hypot(dx, dy), m = r.r + c.r; if (d < m && d > 0.01) { c.x = r.x + dx / d * m; c.y = r.y + dy / d * m; return true; } } return false; };

  S.earn = function (n, x, y, why) {
    S.game.dna += n; S.game.earned += n;
    if (x != null) S.float(x, y, '+' + n + (why ? ' ' + why : ''), '#ffc94d');
  };

  // ── the save: a genome with its connectome, per stage start ──
  S.packGenome = function (g) {
    const c = g.conn;
    return { name: g.name, hue: g.hue, hue2: g.hue2, pattern: g.pattern, segs: g.segs, girth: g.girth, parts: g.parts, cellOf: g.cellOf, nextCell: g.nextCell, gen: g.gen,
      conn: c ? { names: c.names, rowT: c.rowT, rowW: c.rowW, neuronCount: c.neuronCount, muscleEnd: c.muscleEnd } : null };
  };
  S.unpackGenome = function (o) {
    const g = Object.assign({}, o); g.conn = null;
    if (o.conn) {
      const c = Object.create(E.Connectome.prototype);
      c.names = o.conn.names.slice(); c.n = c.names.length; c.neuronCount = o.conn.neuronCount; c.muscleEnd = o.conn.muscleEnd;
      c.index = {}; c.names.forEach((n, i) => { c.index[n] = i; });
      c.rowT = o.conn.rowT.map((r) => r.slice()); c.rowW = o.conn.rowW.map((r) => r.slice());
      c.left = []; c.right = [];
      for (let i = c.neuronCount; i < c.muscleEnd; i++) { const m = c.names[i]; if (m.charAt(2) === 'L') c.left.push(i); else if (m.charAt(2) === 'R') c.right.push(i); }
      g.conn = c;
    }
    return g;
  };
  S.checkpoint = function () {
    const G = S.game; if (!G) return;
    S.store.set('save', { stage: G.stage, genome: S.packGenome(G.genome), dna: G.dna, earned: G.earned, eggs: G.eggs, ate: G.ate, kills: G.kills, allies: G.allies, extinct: G.extinct, deaths: G.deaths, traits: G.traits, t0: G.t0, rolls: G.rolls.slice(-12), species: G.species ? G.species.map((s) => ({ name: s.g.name, status: s.status, g: S.packGenome(s.g) })) : null });
  };
  S.restore = function () {
    const o = S.store.get('save'); if (!o || !o.genome) return null;
    S.newRun(); const G = S.game;
    Object.assign(G, o); G.genome = S.unpackGenome(o.genome);
    G.carried = o.species ? o.species.map((s) => ({ name: s.name, status: s.status, g: S.unpackGenome(s.g) })) : null;
    G.species = null;
    return G;
  };
})(SQ);
