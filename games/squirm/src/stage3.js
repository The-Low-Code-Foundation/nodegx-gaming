/* SQUIRM — stage 3, THE SWARM (×1). You are no longer a creature: you are a species. Every young one hatches with a copy
 * of a parent's genome and connectome, sometimes mutated. Who breeds is decided by who ate, unless you put your thumb on the
 * scale. You steer the swarm only with scent. Destroy the rival nest, or outlast it. */
(function (S) {
  const WW = 3400, WH = 2300, CAP = 80, EGG = 4;
  const E = window.WormEngine;
  const st = (S.stage3 = { id: 3, name: 'The Swarm', mag: '×1' });
  let t, teams, all, food, markers, lineages, linSeq, samples, focus, warcry, warCd, raidT, dragging, downAt, wasDown, railT, over, spawnT, history;

  st.enter = function () {
    const G = S.game;
    t = 0; all = []; food = []; markers = []; lineages = []; linSeq = 0; samples = []; focus = null; warcry = 0; warCd = 0; raidT = 40; dragging = false; wasDown = false; railT = 0; over = false; spawnT = 0; history = [];
    const rivalSp = G.species && G.species.find((s) => s.status === 'wild');
    let rg;
    if (rivalSp) { rg = S.cloneGenome(rivalSp.g); }
    else { rg = S.randomGenome({ stage: 2, parts: 3, segs: 7, girth: 5, jaws: true }); rg.name = rg.name.split(' ')[0] + ' invasor'; }
    rg.conn = S.BASE.clone(); rg.cellOf = {}; rg.nextCell = 1; rg.parts.forEach((p) => S.addCell(rg, S.PARTS[p].name, S.PARTS[p].cell));
    teams = [
      { id: 1, nest: { x: 520, y: WH / 2, hp: 600, max: 600 }, store: 6, founder: S.cloneGenome(G.genome), pop: 0, born: 0, died: 0, kills: 0, name: G.genome.name },
      { id: 2, nest: { x: WW - 520, y: WH / 2, hp: 600, max: 600 }, store: 6, founder: rg, pop: 0, born: 0, died: 0, kills: 0, name: rg.name }
    ];
    for (const tm of teams) {
      tm.lin0 = newLineage(tm, tm.founder, null, tm.founder.hue);
      for (let i = 0; i < 14; i++) born(tm, tm.founder, tm.lin0, false);
    }
    patches.length = 0;
    patches.push({ x: WW / 2, y: WH / 2, r: 220 });   // the rich middle both sides want
    for (const tm of teams) for (const dy of [-1, 1]) patches.push({ x: tm.nest.x + (tm.id === 1 ? 1 : -1) * S.rr(250, 450), y: tm.nest.y + dy * S.rr(300, 550), r: S.rr(110, 160) });
    for (let i = 0; i < 5; i++) patches.push({ x: S.rr(900, WW - 900), y: S.rr(250, WH - 250), r: S.rr(110, 200) });
    for (let i = 0; i < 220; i++) addFood();
    S.cam.x = WW * 0.3; S.cam.y = WH / 2; S.cam.z = zoomFor();
    S.setDial(st.mag, st.name, 'stage 3 of 3 · a garden bed');
    S.setKeys([['click the ground', 'a "food here" scent'], ['right-click or <kbd>Shift</kbd>-click', 'a "danger" scent'], ['click a creature', 'look inside its head'], ['<kbd>WASD</kbd> · drag · wheel', 'look around'], ['<kbd>R</kbd>', 'war cry: all to the rival nest'], ['<kbd>C</kbd>', 'lay a clutch (25 DNA)']]);
    buildPanel();
    S.toast('×1 · You are a species now', 3);
    S.setAuto(false);
  };
  const patches = [];

  function zoomFor() { return S.W < 700 ? 0.42 : 0.62; }
  function addFood() {
    const p = S.pick(patches); if (!p) return;
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * p.r;
    food.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, hue: S.pick([35, 45, 90, 0]), r: S.rr(4, 7) });
  }

  // ── lineages: a new one starts at every structural mutation (a part gained or lost) ──
  function newLineage(tm, g, parent, hue) {
    const L = { id: ++linSeq, team: tm.id, hue, parent: parent ? parent.id : 0, born: t, alive: 0, total: 0, peak: 0, favour: false, parts: g.parts.slice(), name: '' };
    L.name = (parent ? S.speciesName(g).split(' ')[1] : 'founders');
    if (lineages.some((x) => x.team === tm.id && x.name === L.name && x.alive > 0)) L.name += ' ' + ['II', 'III', 'IV', 'V', 'VI'][S.ri(0, 4)];
    lineages.push(L); return L;
  }
  function mutate(tm, g, L) {
    const G = S.game, rate = tm.id === 1 ? 0.32 + (G.traits.indexOf('diplomat') >= 0 ? 0.15 : 0) : 0.32;
    if (Math.random() > rate) return L;
    const pool = S.PART_ORDER.filter((p) => S.count(g, p) < S.PARTS[p].max);
    const r = Math.random();
    let structural = false, what = '';
    if (r < 0.28 && pool.length) { const p = S.pick(pool); g.parts.push(p); S.addCell(g, S.PARTS[p].name, S.PARTS[p].cell); structural = true; what = '+' + S.PARTS[p].name; }
    else if (r < 0.42 && g.parts.length > 1) { const i = S.ri(0, g.parts.length - 1); what = '−' + S.PARTS[g.parts[i]].name; g.parts.splice(i, 1); structural = true; }
    else if (r < 0.55) { g.segs = S.clamp(g.segs + S.pick([-1, 1]), 4, 12); }
    else if (r < 0.65) { g.girth = S.clamp(g.girth + S.pick([-1, 1]), 3, 8); }
    else if (r < 0.85) { const c = g.conn, pre = c.names[S.ri(0, c.neuronCount - 1)], post = c.names[S.ri(0, c.neuronCount - 1)]; c.addSynapse(pre, post, S.pick([-1, 1]) * S.ri(5, 25)); }
    else { S.addCell(g, 'a spare', null); }
    if (!structural) return L;
    const hue = (L.hue + S.pick([1, -1]) * S.rr(35, 120) + 360) % 360;
    g.hue = hue; g.hue2 = (hue + 160) % 360;
    const NL = newLineage(tm, g, L, hue);
    if (tm.id === 1 && Math.random() < 0.5) S.float(tm.nest.x, tm.nest.y - 70, 'new line: ' + what, S.hsl(hue, 80, 70));
    history.push({ t, team: tm.id, text: what });
    return NL;
  }
  function born(tm, parentG, L, doMutate) {
    const g = S.cloneGenome(parentG);
    if (doMutate) L = mutate(tm, g, L);
    const a = Math.random() * 6.283;
    const c = new S.Creature(g, tm.nest.x + Math.cos(a) * 50, tm.nest.y + Math.sin(a) * 50, { stage: 3, scale: 0.85, kind: 'swarm', h: a });
    c.team = tm.id; c.lin = L; c.brain = g.conn ? new E.Brain(g.conn) : null; c.eaten = 0; c.life = S.rr(75, 110); c.energy = S.rr(0.6, 0.8);
    c.decideT = Math.random() * 0.1; c.brainT = Math.random() * 0.1; c.bturn = 0; c.goal = null; c.target = null; c.thr = 0.5; c.wander = S.rr(-3, 3); c.raid = 0;
    L.alive++; L.total++; L.peak = Math.max(L.peak, L.alive); tm.pop++; tm.born++;
    all.push(c); return c;
  }
  function pickParent(tm) {
    let tot = 0; const live = all.filter((c) => c.team === tm.id && !c.dead);
    if (!live.length) return null;
    const w = live.map((c) => { const x = (c.eaten + 0.5) * (c.lin.favour ? 3 : 1); tot += x; return x; });
    let r = Math.random() * tot;
    for (let i = 0; i < live.length; i++) { r -= w[i]; if (r <= 0) return live[i]; }
    return live[live.length - 1];
  }

  // ── input ──
  function onWheel(e) { if (S.stageNow !== st) return; e.preventDefault(); S.cam.zTarget = S.clamp((S.cam.zTarget || S.cam.z) * (e.deltaY > 0 ? 0.88 : 1.14), 0.25, 1.6); }
  if (!S._wheel) { S._wheel = true; S.cv.addEventListener('wheel', onWheel, { passive: false }); }

  function handleMouse(dt) {
    const M = S.mouse;
    if (M.clicked) { downAt = { x: M.x, y: M.y, cx: S.cam.x, cy: S.cam.y }; dragging = false; }
    if (M.down && downAt) {
      if (!dragging && Math.hypot(M.x - downAt.x, M.y - downAt.y) > 8) dragging = true;
      if (dragging) { S.cam.x = downAt.cx - (M.x - downAt.x) / S.cam.z; S.cam.y = downAt.cy - (M.y - downAt.y) / S.cam.z; }
    }
    if (!M.down && (wasDown || M.clicked) && downAt && !dragging) click(S.toWorld(M.x, M.y), M.shift);
    if (!M.down) downAt = M.down ? downAt : null;
    wasDown = M.down;
    if (M.rclicked) click(S.toWorld(M.x, M.y), true);
  }
  function click(w, danger) {
    if (!danger) {
      let best = null, bd = 18 / S.cam.z;
      for (const c of all) if (!c.dead) { const d = S.dist(c.x, c.y, w.x, w.y); if (d < bd + c.r) { bd = d; best = c; } }
      if (best) { focus = best; S.sfx.play('click'); return; }
    }
    if (w.x < 0 || w.y < 0 || w.x > WW || w.y > WH) return;
    markers.push({ x: w.x, y: w.y, kind: danger ? 'danger' : 'food', t: 0, life: danger ? 22 : 26 });
    if (markers.filter((m) => m.kind === (danger ? 'danger' : 'food')).length > 3) markers.splice(markers.findIndex((m) => m.kind === (danger ? 'danger' : 'food')), 1);
    S.sfx.play('scent');
  }
  st.act = function (act, el) {
    if (act === 'war') warCry();
    if (act === 'clutch') clutch();
    if (act === 'fav') { const L = lineages.find((x) => x.id === +el.dataset.id); if (L) { L.favour = !L.favour; S.sfx.play('click'); railT = 0; } }
    if (act === 'look') { const L = lineages.find((x) => x.id === +el.dataset.id); const c = L && all.find((q) => q.lin === L && !q.dead); if (c) { focus = c; S.cam.x = c.x; S.cam.y = c.y; } }
    if (act === 'again') S.startStage(3, true);
  };
  function warCry() { if (warCd > 0) { S.toast('Still hoarse: ' + Math.ceil(warCd) + ' s', 1.2); return; } warcry = 24; warCd = 36; S.sfx.play('ally'); S.toast('War cry! Everyone to the rival nest', 2); }
  function clutch() {
    const G = S.game;
    if (G.dna < 25) { S.toast('A clutch costs 25 DNA', 1.4); return; }
    G.dna -= 25; teams[0].store += EGG * 5; S.sfx.play('egg'); S.toast('Five eggs laid', 1.6);
  }

  st.peek = () => ({ t: Math.round(t), pop: teams.map((x) => x.pop), born: teams.map((x) => x.born), nest: teams.map((x) => Math.round(x.nest.hp)), why: teams.map((x) => x.why || {}), store: teams.map((x) => x.store), eaten: teams.map((x) => all.filter((c) => c.team === x.id).reduce((a, c) => a + c.eaten, 0)), bite: teams.map((x) => (all.find((c) => c.team === x.id) || { st: {} }).st.bite), speed: teams.map((x) => Math.round((all.find((c) => c.team === x.id) || { st: {} }).st.speed)), lineages: lineages.filter((L) => L.team === 1).length, alive: lineages.filter((L) => L.team === 1 && L.alive > 0).length, markers: markers.length, focus: !!focus, over });
  /** A screen point with no creature within 80 world px, for a test click that must land on bare ground. */
  st.emptySpot = () => { for (let y = 120; y < S.H - 120; y += 40) for (let x = 120; x < S.W - 120; x += 40) { const w = S.toWorld(x, y); if (w.x > 0 && w.y > 0 && w.x < WW && w.y < WH && !all.some((c) => !c.dead && S.dist(c.x, c.y, w.x, w.y) < 80)) return { x, y }; } return null; };
  st.razeRival = () => { teams[1].nest.hp = -100; };

  // ── a frame ──
  st.update = function (dt) {
    t += dt;
    if (over) return;
    const G = S.game;
    handleMouse(dt);
    const kv = S.keyVector();
    if (kv) { S.cam.x += kv.x * 700 * dt / S.cam.z; S.cam.y += kv.y * 700 * dt / S.cam.z; }
    S.cam.x = S.clamp(S.cam.x, 0, WW); S.cam.y = S.clamp(S.cam.y, 0, WH);
    if (S.cam.zTarget) S.cam.z += (S.cam.zTarget - S.cam.z) * Math.min(1, dt * 8);
    if (S.tapped('KeyR')) warCry();
    if (S.tapped('KeyC')) clutch();
    if (warcry > 0) warcry -= dt; if (warCd > 0) warCd -= dt;
    for (let i = markers.length - 1; i >= 0; i--) { markers[i].t += dt; if (markers[i].t > markers[i].life) markers.splice(i, 1); }
    // the rival raids now and then
    raidT -= dt;
    if (raidT <= 0) {
      raidT = S.rr(35, 55);
      const rv = all.filter((c) => c.team === 2 && !c.dead);
      if (rv.length > 12) { rv.forEach((c) => { if (Math.random() < 0.45) c.raid = 25; }); S.toast('A raid! ' + teams[1].name + ' is coming for your nest', 2.6); S.sfx.play('hurt'); }
    }
    // food regrows
    spawnT += dt; while (spawnT > 0.12) { spawnT -= 0.12; if (food.length < 260) addFood(); }
    // births
    for (const tm of teams) {
      tm.nest.hp = Math.min(tm.nest.max, tm.nest.hp + dt * 1.5);
      tm.store = Math.min(tm.store, 40);
      while (tm.store >= EGG && tm.pop < CAP) {
        tm.store -= EGG;
        const par = pickParent(tm);
        born(tm, par ? par.g : tm.founder, par ? par.lin : tm.lin0, true);
      }
    }
    const mult = { 1: (G.traits.indexOf('predator') >= 0 ? 1.4 : 1) * (G.traits.indexOf('hunter') >= 0 ? 1.25 : 1) * (G.traits.indexOf('omnivore') >= 0 ? 1.1 : 1), 2: 1 };
    const charmer = G.traits.indexOf('charmer') >= 0, grazer = G.traits.indexOf('grazer') >= 0;
    for (let i = all.length - 1; i >= 0; i--) {
      const c = all[i];
      if (c.dead) { all.splice(i, 1); continue; }
      c.decideT -= dt;
      if (c.decideT <= 0) { c.decideT = 0.12 + Math.random() * 0.06; decide(c); }
      // its own brain, ten ticks a second: what it senses goes in, a turn comes out
      c.brainT -= dt;
      if (c.brain && c.brainT <= 0) {
        c.brainT = 0.1; const b = c.brain;
        if (c.smell) E.SENSE.food.forEach((n) => b.stimulate(n));
        if (c.fear) E.SENSE.predator.forEach((n) => b.stimulate(n));
        if (c.lastHitAt && performance.now() - c.lastHitAt < 300) E.SENSE.noseTouch.forEach((n) => b.stimulate(n));
        b.tick(); const m = b.motor(); c.bturn = m.turn; c.bv = m.v;
      }
      let ang = null, thr = c.thr;
      if (c.goal) ang = Math.atan2(c.goal.y - c.y, c.goal.x - c.x) + c.bturn * 0.25;
      else { c.wander += c.bturn * 0.4 * dt * 10 + S.rr(-0.6, 0.6) * dt; ang = c.h + c.bturn * 0.5 + Math.sin(c.wander) * 0.3; thr = 0.35 + Math.max(0, c.bv || 0) * 0.3; }
      c.steer(dt, ang, thr); c.physics(dt);
      if (S.keepInBox(c, WW, WH, 20)) c.wander += 2;
      // eat
      if (c.goal && c.goal.food) {
        const f = c.goal, mo = c.mouth();
        if (f.gone) c.goal = null;
        else if (S.dist(mo.x, mo.y, f.x, f.y) < c.r * 1.8 + f.r) {
          f.gone = true; food.splice(food.indexOf(f), 1); c.goal = null; c.eaten++; c.energy = 1;
          teams[c.team - 1].store += 1; if (grazer && c.team === 1) c.hp = Math.min(c.st.hp, c.hp + 5);
          if (c.team === 1) { G.dna += 0.5; G.earned += 0.5; }
        }
      }
      // fight
      if (c.target && !c.target.dead) {
        const home = teams[c.team - 1].nest, atHome = S.dist(c.x, c.y, home.x, home.y) < 550;   // defenders fight harder on their own ground
        const dmg = S.tryBite(c, c.target, { mult: mult[c.team] * (atHome ? 1.5 : 1) });
        if (dmg && charmer && c.team === 1 && c.target.team === 2 && Math.random() < 0.06) convert(c.target);
        if (dmg && c.target.hp <= 0 && c.team === 1) { G.dna += 2; G.earned += 2; teams[0].kills++; }
      } else if (c.goal && c.goal.nest) {
        const n = c.goal.nest;
        if (S.dist(c.x, c.y, n.x, n.y) < 70) { n.hp -= c.st.bite * dt * 0.6 * mult[c.team]; if (Math.random() < dt * 6) S.burst(n.x + S.rr(-30, 30), n.y + S.rr(-30, 30), '#e7c08a', 2, 50, 0.4, 2); }
      }
      // living costs
      c.energy -= dt / 55; c.life -= dt;
      if (c.hp <= 0 || c.energy <= 0 || c.life <= 0) kill(c, c.hp <= 0 ? 'fight' : c.energy <= 0 ? 'hunger' : 'age');
    }
    // the end
    for (const tm of teams) {
      const alive = tm.pop > 0 || tm.store >= EGG;
      if (tm.nest.hp <= 0 || (!alive && !(tm.id === 1 && G.dna >= 25))) { finish(tm.id === 2); return; }
    }
    railT -= dt; if (railT <= 0) { railT = 0.25; panelTick(); }
    if (t % 2 < dt) sample();
    if (focus && focus.dead) focus = null;
    if (!focus) focus = all.find((c) => c.team === 1 && !c.dead) || null;
    S.brain = focus ? focus.brain : null;
    S.prompt(warcry > 0 ? 'War cry: ' + Math.ceil(warcry) + ' s' : t < 12 ? 'Click the ground to lay a food scent. They will follow it.' : '');
  };

  function decide(c) {
    const me = teams[c.team - 1], foe = teams[2 - c.team];
    const sense = c.st.sense * 1.4;
    let enemy = null, ed = sense;
    for (const o of all) if (o.team !== c.team && !o.dead) { const d = Math.abs(o.x - c.x) + Math.abs(o.y - c.y); if (d < ed * 1.3) { const dd = S.dist(o.x, o.y, c.x, c.y); if (dd < ed) { ed = dd; enemy = o; } } }
    c.fear = !!enemy; c.target = null; c.thr = 0.6;
    // danger scents push away
    if (c.team === 1) for (const m of markers) if (m.kind === 'danger' && S.dist(m.x, m.y, c.x, c.y) < 280) { c.goal = { x: c.x + (c.x - m.x), y: c.y + (c.y - m.y) }; c.thr = 1; return; }
    const hpLow = c.hp < c.st.hp * 0.3;
    if (enemy && hpLow) { c.goal = { x: c.x + (c.x - enemy.x), y: c.y + (c.y - enemy.y) }; c.thr = 1; return; }
    const attacking = (c.team === 1 && warcry > 0) || c.raid > 0;
    if (c.raid > 0) c.raid -= 0.15;
    if (enemy && (c.st.bite >= 4 || ed < c.length * 1.2 || attacking)) { c.goal = enemy; c.target = enemy; c.thr = 1; return; }
    if (attacking) { c.goal = { x: foe.nest.x, y: foe.nest.y, nest: foe.nest }; c.thr = 1; return; }
    // food: the nearest within reach of its senses
    let best = null, bd = sense;
    for (const f of food) { const d = Math.abs(f.x - c.x) + Math.abs(f.y - c.y); if (d < bd) { bd = d; best = f; } }
    c.smell = !!best;
    if (best && c.energy < 0.95) { c.goal = best; best.food = true; c.thr = 0.75; return; }
    // a food scent the player laid
    if (c.team === 1) {
      let mk = null, md = 1500;
      for (const m of markers) if (m.kind === 'food') { const d = S.dist(m.x, m.y, c.x, c.y); if (d < md) { md = d; mk = m; } }
      if (mk && md > 90) { c.goal = { x: mk.x + S.rr(-60, 60), y: mk.y + S.rr(-60, 60) }; c.thr = 0.85; return; }
    }
    // hungry with nothing in smelling range: head for a patch it remembers (one of the three nearest)
    if (c.energy < 0.8) {
      if (!c.forage || S.dist(c.x, c.y, c.forage.x, c.forage.y) < 60) { const near = patches.slice().sort((a, b) => S.dist(a.x, a.y, c.x, c.y) - S.dist(b.x, b.y, c.x, c.y)).slice(0, 3), p = S.pick(near), a = Math.random() * 6.283; c.forage = { x: p.x + Math.cos(a) * p.r * 0.6, y: p.y + Math.sin(a) * p.r * 0.6 }; }
      c.goal = c.forage; c.thr = 0.7; return;
    }
    // stay near home
    if (S.dist(c.x, c.y, me.nest.x, me.nest.y) > 650) { c.goal = { x: me.nest.x, y: me.nest.y }; c.thr = 0.6; return; }
    c.goal = null;
  }
  function convert(r) {
    const L0 = r.lin; L0.alive--; teams[1].pop--;
    let L = lineages.find((x) => x.team === 1 && x.convert && x.alive >= 0 && x.src === L0.id);
    if (!L) { L = newLineage(teams[0], r.g, null, r.g.hue); L.convert = true; L.src = L0.id; L.name = 'turncoats'; }
    r.team = 1; r.lin = L; L.alive++; L.total++; teams[0].pop++; r.target = null; r.goal = null;
    S.float(r.x, r.y - 20, 'changed sides!', '#62e3b5');
  }
  function kill(c, why) {
    c.dead = true; c.lin.alive--; teams[c.team - 1].pop--; teams[c.team - 1].died++;
    const why_ = teams[c.team - 1].why = teams[c.team - 1].why || {}; why_[why] = (why_[why] || 0) + 1;
    if (why === 'fight') S.burst(c.x, c.y, S.hsl(c.g.hue, 90, 60), 10, 80, 0.6, 2);
    else S.burst(c.x, c.y, 'rgba(200,200,220,0.6)', 5, 30, 0.6, 1.5);
    if (why === 'fight') for (let k = 0; k < 2; k++) food.push({ x: c.x + S.rr(-10, 10), y: c.y + S.rr(-10, 10), hue: 355, r: 4 });
  }
  function sample() {
    const row = {};
    for (const L of lineages) if (L.team === 1 && L.alive > 0) row[L.id] = L.alive;
    samples.push({ t, row, rival: teams[1].pop });
    if (samples.length > 150) samples.shift();
  }

  function finish(won) {
    over = true;
    const G = S.game, tm = teams[0];
    const mine = lineages.filter((L) => L.team === 1), best = mine.slice().sort((a, b) => b.total - a.total)[0];
    if (won) {
      S.sfx.play('win');
      const evolved = all.filter((c) => c.team === 1 && !c.dead).reduce((m, c) => Math.max(m, c.g.conn ? c.g.conn.n - c.g.conn.muscleEnd : 0), 0);
      S.endStage({
        eyebrow: 'Stage 3 done · ×1 → ×0', title: 'Your kind looks up', stamp: 'Evolved', green: true, final: true,
        body: '<p>The rival nest is rubble. ' + S.esc(G.genome.name) + ' owns the garden bed. Something in their heads, ' + evolved + ' nerve cells more than the worm you started as, notices the sky.</p>' +
          '<div class="rule"></div>' +
          '<p class="fine">' + tm.born + ' born · ' + tm.died + ' died · ' + mine.length + ' lineages · most successful: <b>' + S.esc(best ? best.name : '—') + '</b> (' + (best ? best.total : 0) + ' born) · ' + tm.kills + ' rivals killed</p>' +
          '<p class="fine">Whole run: ' + G.genome.gen + ' generations by hand · ' + G.allies + ' species befriended · ' + G.extinct + ' wiped out · ' + G.deaths + ' deaths · ' + Math.round((Date.now() - G.t0) / 60000) + ' min</p>' +
          '<div class="rule"></div><p class="eyebrow">Next: stage 4, The Sky</p><p>Not built yet. In the version in my head, the swarm builds a mound, the mound becomes a city, and the city launches something into the dark. That is where Threadspace would start.</p>'
      });
    } else {
      S.sfx.play('extinct');
      S.endStage({
        eyebrow: 'Stage 3 · your line ended', title: 'Extinct', stamp: 'Extinct', retry: 3,
        body: '<p>' + S.esc(teams[1].name) + ' took the garden bed. Your swarm bred ' + tm.born + ' young across ' + mine.length + ' lineages; none of them made it.</p><p class="fine">Try more food scents near patches, war cries when they are busy eating, and favour the lineage that is winning fights.</p>'
      });
    }
  }

  // ── the rail ──
  function buildPanel() {
    S.setStagePanel('<h3>The swarm <span id="s3pop"></span></h3>' +
      '<div class="bars" style="margin:0 0 8px"><div class="bar hp"><span>your nest</span><div><i id="s3n1"></i></div><b id="s3n1t"></b></div><div class="bar hp"><span>rival</span><div><i id="s3n2"></i></div><b id="s3n2t"></b></div></div>' +
      '<canvas id="chartCv" aria-label="Your lineages over time"></canvas>' +
      '<div class="species" id="s3lin" style="margin-top:8px"></div>' +
      '<div class="row"><button class="btn" type="button" data-act="war" id="s3war">War cry <kbd>R</kbd></button><button class="btn" type="button" data-act="clutch" id="s3clutch">Clutch: 25 DNA <kbd>C</kbd></button></div>' +
      '<div class="note" style="margin-top:8px">You cannot design any more. You can choose who breeds: <b>favour</b> a lineage and its members are picked to breed three times as often.</div>');
  }
  function panelTick() {
    const G = S.game, A = teams[0], B = teams[1];
    S.$('s3pop').textContent = A.pop + ' vs ' + B.pop;
    S.$('s3n1').style.width = Math.max(0, A.nest.hp / A.nest.max * 100) + '%'; S.$('s3n1t').textContent = Math.max(0, Math.round(A.nest.hp));
    S.$('s3n2').style.width = Math.max(0, B.nest.hp / B.nest.max * 100) + '%'; S.$('s3n2t').textContent = Math.max(0, Math.round(B.nest.hp));
    const top = lineages.filter((L) => L.team === 1 && L.alive > 0).sort((a, b) => b.alive - a.alive).slice(0, 6);
    const html = top.map((L) => '<div class="sp" style="grid-template-columns:14px minmax(0,1fr) auto auto"><i style="width:12px;height:12px;border-radius:50%;background:' + S.hsl(L.hue, 70, 60) + '" data-act="look" data-id="' + L.id + '"></i>' +
      '<em data-act="look" data-id="' + L.id + '" title="' + S.esc(L.parts.map((p) => S.PARTS[p].name).join(', ') || 'no parts') + '">' + S.esc(L.name) + ' <span style="color:var(--muted);font-style:normal;font-size:11px">' + S.esc(partsShort(L.parts)) + '</span></em>' +
      '<span class="st">' + L.alive + '</span><button class="btn' + (L.favour ? ' on' : '') + '" type="button" data-act="fav" data-id="' + L.id + '" style="padding:1px 8px;font-size:11px">' + (L.favour ? 'favoured' : 'favour') + '</button></div>').join('');
    S.setHtml(S.$('s3lin'), html);
    S.$('s3war').disabled = warCd > 0; S.$('s3war').innerHTML = warCd > 0 ? 'War cry in ' + Math.ceil(warCd) + ' s' : 'War cry <kbd>R</kbd>';
    S.$('s3clutch').disabled = G.dna < 25;
    drawChart();
    const f = focus;
    if (f) {
      S.setSpecimen({
        slide: 'slide 3 · ' + (f.team === 1 ? 'yours' : 'rival') + ' · age ' + Math.round(f.age) + ' s', size: (f.length * 0.25).toFixed(0) + ' mm', name: f.lin.name + ' line',
        meta: '<span>' + S.esc(partsShort(f.g.parts) || 'no parts') + '</span><span>ate ' + f.eaten + '</span>',
        hp: f.hp, hpMax: f.st.hp, grow: f.energy * 100, growMax: 100, growLabel: 'fed', growText: Math.round(f.energy * 100) + '%'
      });
      S.setCellCount(f.g);
    }
    S.setDna(G.dna);
  }
  function partsShort(parts) { const c = {}; parts.forEach((p) => { c[p] = (c[p] || 0) + 1; }); return Object.keys(c).map((p) => (c[p] > 1 ? c[p] + '×' : '') + S.PARTS[p].name.toLowerCase()).join(', '); }
  function drawChart() {
    const cv = S.$('chartCv'); if (!cv) return;
    const ctx = cv.getContext('2d'), w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    if (samples.length < 2) { ctx.fillStyle = '#8d97b8'; ctx.font = '11px "IBM Plex Mono", monospace'; ctx.fillText('lineages appear here as they arise', 4, h / 2); return; }
    const ids = []; for (const s of samples) for (const k in s.row) if (ids.indexOf(+k) < 0) ids.push(+k);
    const maxPop = Math.max(10, ...samples.map((s) => Math.max(Object.values(s.row).reduce((a, b) => a + b, 0), s.rival)));
    const X = (i) => (i / (samples.length - 1)) * w, Y = (v) => h - 12 - (v / maxPop) * (h - 16);
    ctx.strokeStyle = 'rgba(150,170,230,0.15)'; ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(w, Y(0)); ctx.stroke();
    const base = samples.map(() => 0);
    for (const id of ids) {
      const L = lineages.find((x) => x.id === id); if (!L) continue;
      ctx.fillStyle = S.hsl(L.hue, 70, 58, 0.85); ctx.beginPath();
      samples.forEach((s, i) => { const y = Y(base[i] + (s.row[id] || 0)); if (i) ctx.lineTo(X(i), y); else ctx.moveTo(X(i), y); });
      for (let i = samples.length - 1; i >= 0; i--) ctx.lineTo(X(i), Y(base[i]));
      ctx.closePath(); ctx.fill();
      samples.forEach((s, i) => { base[i] += s.row[id] || 0; });
    }
    ctx.strokeStyle = '#ff5d73'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.beginPath();
    samples.forEach((s, i) => { const y = Y(s.rival); if (i) ctx.lineTo(X(i), y); else ctx.moveTo(X(i), y); }); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#8d97b8'; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.fillText('yours, by lineage', 2, h - 1); ctx.fillStyle = '#ff5d73'; ctx.textAlign = 'right'; ctx.fillText('- - rival', w - 2, h - 1); ctx.textAlign = 'left';
  }

  // ── drawing ──
  st.draw = function (ctx) {
    S.screenTx(ctx); ctx.fillStyle = '#100c08'; ctx.fillRect(0, 0, S.W, S.H);
    S.applyCam(ctx);
    ctx.fillStyle = S.groundPattern(); ctx.fillRect(0, 0, WW, WH);
    ctx.fillStyle = 'rgba(80,50,20,0.25)'; ctx.fillRect(0, 0, WW, WH);
    for (const p of patches) { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.2); g.addColorStop(0, 'rgba(120,160,60,0.22)'); g.addColorStop(1, 'rgba(120,160,60,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.2, 0, 6.283); ctx.fill(); }
    for (const f of food) { ctx.fillStyle = S.hsl(f.hue, 70, 55); ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill(); }
    for (const m of markers) {
      const k = 1 - m.t / m.life, col = m.kind === 'food' ? '255,174,74' : '199,125,255';
      for (let r = 0; r < 3; r++) { const rad = 30 + ((t * 40 + r * 40) % 120); ctx.strokeStyle = 'rgba(' + col + ',' + (0.5 * k * (1 - (rad - 30) / 120)) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(m.x, m.y, rad, 0, 6.283); ctx.stroke(); }
      ctx.fillStyle = 'rgba(' + col + ',' + k + ')'; ctx.font = '700 22px Gluten, cursive'; ctx.textAlign = 'center'; ctx.fillText(m.kind === 'food' ? 'food here' : 'danger', m.x, m.y + 7);
    }
    for (const tm of teams) drawMound(ctx, tm);
    const simple = S.cam.z < 0.5, mid = S.cam.z < 0.85, vw = S.W / S.cam.z / 2 + 60, vh = S.H / S.cam.z / 2 + 60;
    for (const c of all) {
      if (c.dead || Math.abs(c.x - S.cam.x) > vw || Math.abs(c.y - S.cam.y) > vh) continue;
      if (simple) drawSimple(ctx, c); else if (mid) drawMid(ctx, c); else c.draw(ctx, t, { flat: true });
      if (c.team === 2) { ctx.fillStyle = '#ff5d73'; ctx.beginPath(); ctx.arc(c.x, c.y - c.r * 2.4, 2.4 / S.cam.z * 0.6, 0, 6.283); ctx.fill(); }
    }
    if (focus && !focus.dead) { ctx.strokeStyle = '#ffc94d'; ctx.lineWidth = 2 / S.cam.z; ctx.beginPath(); ctx.arc(focus.x, focus.y, focus.r * 4, 0, 6.283); ctx.stroke(); }
    S.drawFx(ctx);
    S.screenTx(ctx);
    S.scaleBar(ctx, 40, '1 cm');
  };
  function drawSimple(ctx, c) {
    const s = c.spine; ctx.strokeStyle = S.hsl(c.g.hue, 70, 58); ctx.lineWidth = c.r * 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y); for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i].x, s[i].y); ctx.stroke();
    ctx.fillStyle = S.hsl(c.g.hue, 80, 80); ctx.beginPath(); ctx.arc(s[0].x, s[0].y, c.r * 0.9, 0, 6.283); ctx.fill();
  }
  /** Two strokes down the spine and a head: cheap enough for 160 at once, still reads as each creature's colour and size. */
  function drawMid(ctx, c) {
    const s = c.spine; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y); for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i].x, s[i].y);
    ctx.strokeStyle = c.flash > 0 ? '#ff5d73' : S.hsl(c.g.hue, 55, 12); ctx.lineWidth = c.r * 2.3; ctx.stroke();
    ctx.strokeStyle = S.hsl(c.g.hue, 70, 58); ctx.lineWidth = c.r * 1.6; ctx.stroke();
    ctx.fillStyle = S.hsl(c.g.hue, 80, 82); ctx.beginPath(); ctx.arc(s[0].x, s[0].y, c.r * 0.85, 0, 6.283); ctx.fill();
    if (S.count(c.g, 'jaws')) { ctx.strokeStyle = '#efe6d6'; ctx.lineWidth = c.r * 0.35; const a = c.h; ctx.beginPath(); ctx.moveTo(s[0].x + Math.cos(a + 0.6) * c.r, s[0].y + Math.sin(a + 0.6) * c.r); ctx.lineTo(s[0].x + Math.cos(a) * c.r * 2, s[0].y + Math.sin(a) * c.r * 2); ctx.lineTo(s[0].x + Math.cos(a - 0.6) * c.r, s[0].y + Math.sin(a - 0.6) * c.r); ctx.stroke(); }
  }
  function drawMound(ctx, tm) {
    const n = tm.nest, col = tm.id === 1 ? S.game.genome.hue : tm.founder.hue;
    const g = ctx.createRadialGradient(n.x - 20, n.y - 20, 10, n.x, n.y, 110); g.addColorStop(0, '#8a6a44'); g.addColorStop(1, 'rgba(60,40,20,0.2)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, 110, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#1a120a'; ctx.beginPath(); ctx.ellipse(n.x, n.y, 26, 18, 0, 0, 6.283); ctx.fill();
    for (let k = 0; k < Math.min(12, Math.floor(tm.store)); k++) { const a = k / 12 * 6.283; ctx.fillStyle = S.hsl(col, 40, 82); ctx.beginPath(); ctx.ellipse(n.x + Math.cos(a) * 52, n.y + Math.sin(a) * 52, 6, 8, a, 0, 6.283); ctx.fill(); }
    const w = 160, k = Math.max(0, n.hp / n.max);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(n.x - w / 2, n.y - 140, w, 9);
    ctx.fillStyle = tm.id === 1 ? '#62e3b5' : '#ff5d73'; ctx.fillRect(n.x - w / 2, n.y - 140, w * k, 9);
    ctx.fillStyle = '#f1ead8'; ctx.font = '700 20px Gluten, cursive'; ctx.textAlign = 'center'; ctx.fillText(tm.id === 1 ? 'your nest' : tm.name, n.x, n.y - 150);
  }
})(SQ);
