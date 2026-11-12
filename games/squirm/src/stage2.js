/* SQUIRM — stage 2, THE CRAWL (×40). Leaf litter at dusk. Five species nest here. Charm them (they sing a phrase, you
 * sing it back) or hunt them to extinction. Allies follow you and fight beside you. Settle four of the five to move on. */
(function (S) {
  const WW = 3600, WH = 2600, MM = 0.05;   // world size; mm per world px
  const NOTE_COL = ['#62e3b5', '#ffc94d', '#ff8fb1', '#c77dff'], NOTE_WORD = ['chirp', 'trill', 'click', 'hum'];
  const st = (S.stage2 = { id: 2, name: 'The Crawl', mag: '×40' });
  let wantSing = false, t, P, species, members, food, meat, leaves, rocks, flies, nest, charm, deadT, groundPat, packTarget, track, doneShown;

  st.enter = function () {
    const G = S.game;
    t = 0; deadT = 0; charm = null; packTarget = null; track = null; doneShown = false;
    food = []; meat = []; leaves = []; rocks = []; flies = []; members = [];
    nest = { x: 520, y: WH / 2 };
    for (let i = 0; i < 46; i++) leaves.push({ x: S.rr(0, WW), y: S.rr(0, WH), rot: S.rr(0, 6.28), len: S.rr(140, 320), w: S.rr(0.32, 0.5), hue: S.pick([70, 85, 100, 35, 25, 48]), l: S.rr(14, 24) });
    for (let i = 0; i < 34; i++) { const r = S.rr(18, 60); const p = { x: S.rr(80, WW - 80), y: S.rr(80, WH - 80), r }; if (S.dist(p.x, p.y, nest.x, nest.y) > 220) rocks.push(p); }
    for (let i = 0; i < 60; i++) flies.push({ x: S.rr(0, WW), y: S.rr(0, WH), a: S.rr(0, 6), s: S.rr(10, 30), ph: S.rr(0, 6) });
    for (let i = 0; i < 110; i++) addFood();
    // five species: three ordinary, one shy, one fierce, plus the Old One
    const temps = S.pick([['calm', 'shy', 'fierce', 'calm'], ['shy', 'fierce', 'calm', 'fierce'], ['calm', 'fierce', 'shy', 'shy']]);
    const spots = [[1500, 600], [2700, 700], [2900, 1900], [1600, 2050], [2300, 1300]];
    species = [];
    for (let i = 0; i < 5; i++) {
      const epic = i === 4;
      const g = epic ? S.makeGenome({ segs: 12, girth: 8, parts: ['horn', 'jaws', 'spines', 'spines', 'shell', 'legs', 'legs', 'eye'], pattern: 'bands', hue: 15 }) : S.randomGenome({ stage: 2, parts: S.ri(2, 4), segs: S.ri(5, 10), girth: S.ri(4, 7) });
      if (!epic && Math.random() < 0.6 && S.count(g, 'legs') === 0) g.parts.push('legs');
      if (epic) g.name = 'The Old One';
      const sp = { i, g, epic, temp: epic ? 'fierce' : temps[i], scale: epic ? 2.6 : S.rr(0.95, 1.45), nest: { x: spots[i][0], y: spots[i][1] }, rel: 0, status: 'wild', angry: 0, song: [], members: [] };
      for (let k = 0; k < 9; k++) sp.song.push(S.ri(0, 3));
      const n = epic ? 1 : S.ri(4, 5);
      for (let k = 0; k < n; k++) {
        const c = new S.Creature(g, sp.nest.x + S.rr(-120, 120), sp.nest.y + S.rr(-120, 120), { stage: 2, scale: sp.scale * S.rr(0.92, 1.08), kind: 'wild' });
        if (epic) { c.st.hp *= 3; c.hp = c.st.hp; c.st.speed *= 0.8; }
        c.sp = sp; c.wander = S.rr(-3, 3); c.flee = 0; sp.members.push(c); members.push(c);
      }
      species.push(sp);
    }
    G.species = species;
    P = new S.Creature(G.genome, nest.x + 60, nest.y, { kind: 'player', stage: 2, scale: 1.25, h: 0 });
    S.player = P; S.setBrain(G.genome);
    S.cam.x = P.x; S.cam.y = P.y; S.cam.z = zoomFor();
    if (!groundPat) groundPat = makeGround();
    S.setDial(st.mag, st.name, 'stage 2 of 3 · leaf litter');
    S.setKeys([['<kbd>WASD</kbd> or hold the mouse', 'walk'], ['<kbd>Q</kbd>', 'sing to the nearest creature'], ['<kbd>1</kbd>–<kbd>4</kbd>', 'sing a note back'], ['<kbd>Space</kbd>', 'lunge (a bite, if you touch)'], ['<kbd>E</kbd> at your nest', 'the egg: change your body'], ['<kbd>B</kbd>', 'let its brain drive']]);
    buildPanel();
    buildNotes();
    S.toast('×40 · The leaf litter', 2.5);
  };

  function zoomFor() { return S.W < 700 ? 0.8 : 1.15; }
  function addFood() {
    let p; do { p = { x: S.rr(60, WW - 60), y: S.rr(60, WH - 60) }; } while (rocks.some((r) => S.dist(r.x, r.y, p.x, p.y) < r.r + 10));
    food.push({ x: p.x, y: p.y, kind: Math.random() < 0.55 ? 'cap' : 'berry', hue: S.pick([30, 40, 0, 340, 280]), r: S.rr(4, 7) });
  }
  S.groundPattern = () => groundPat || (groundPat = makeGround());
  function makeGround() {
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    x.fillStyle = '#1a2014'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1400; i++) { x.fillStyle = S.hsl(S.pick([30, 40, 60, 80, 95]), S.ri(15, 35), S.ri(8, 20), S.rr(0.15, 0.45)); const r = S.rr(2, 18); x.beginPath(); x.ellipse(Math.random() * 512, Math.random() * 512, r, r * S.rr(0.4, 1), S.rr(0, 3), 0, 6.283); x.fill(); }
    for (let i = 0; i < 900; i++) { x.fillStyle = S.hsl(S.pick([40, 50, 90]), 20, S.ri(25, 45), S.rr(0.2, 0.6)); x.fillRect(Math.random() * 512, Math.random() * 512, S.rr(0.8, 2.2), S.rr(0.8, 2.2)); }
    return S.ctx.createPattern(c, 'repeat');
  }

  // ── the rail ──
  function buildPanel() {
    S.setStagePanel('<h3>Who lives here <span id="s2count"></span></h3><div class="species" id="s2list">' +
      species.map((sp) => '<div class="sp" data-act="track" data-i="' + sp.i + '" role="button" tabindex="0"><canvas></canvas><em>' + S.esc(sp.g.name) + '</em><span class="st" id="s2st' + sp.i + '"></span></div>').join('') +
      '</div><div class="row"><button class="btn" type="button" data-act="sing">Sing <kbd>Q</kbd></button><button class="btn" type="button" data-act="egg">The egg <kbd>E</kbd></button></div><div class="note" style="margin-top:8px" id="s2note">Settle four of the five: befriend them or wipe them out. Click a name to track its nest.</div><div class="row" id="s2go"></div>');
    [...S.$('s2list').querySelectorAll('canvas')].forEach((cv, i) => S.portrait(cv, species[i].g, 2));
  }
  st.act = function (act, el) {
    if (act === 'track') { const sp = species[+el.dataset.i]; track = track === sp ? null : sp; }
    if (act === 'egg') { if (S.dist(P.x, P.y, nest.x, nest.y) < 170) openEgg(); else { S.toast('The egg is at your nest', 1.6); track = null; } }
    if (act === 'sing') wantSing = true;
    if (act === 'next') finish();
  };
  function panelTick() {
    const G = S.game;
    let settled = 0;
    for (const sp of species) {
      const el = S.$('s2st' + sp.i); if (!el) continue;
      const alive = sp.members.filter((m) => !m.dead).length;
      let txt, cls = 'st';
      if (sp.status === 'allied') { txt = 'allied'; cls += ' ally'; settled++; }
      else if (sp.status === 'extinct') { txt = 'extinct'; cls += ' gone'; settled++; }
      else txt = (sp.angry > 0 ? 'angry · ' : sp.temp + ' · ') + '♥'.repeat(sp.rel) + '♡'.repeat(3 - sp.rel) + ' · ' + alive;
      if (el.textContent !== txt) { el.textContent = txt; el.className = cls; }
      el.parentNode.classList.toggle('sel', track === sp);
    }
    S.$('s2count').textContent = settled + ' of 4 settled';
    const go = S.$('s2go'), want = settled >= 4 ? '<button class="btn big" type="button" data-act="next">Gather your kind</button>' : '';
    if (go._h !== want) { go.innerHTML = want; go._h = want; }
    S.setSpecimen({
      slide: 'slide 2 · gen ' + G.genome.gen, size: (P.length * MM).toFixed(1) + ' mm', name: G.genome.name,
      meta: '<span>' + G.allies + ' allied</span><span>' + G.extinct + ' extinct</span><span>pack ' + pack().length + '</span>',
      hp: P.hp, hpMax: P.st.hp, grow: settled, growMax: 4, growLabel: 'settled', growText: settled + ' of 4'
    });
    S.setDna(G.dna);
    return settled;
  }
  function pack() { return members.filter((m) => m.inPack && !m.dead); }

  // ── the song: call and response ──
  function buildNotes() {
    const el = S.$('notes');
    el.innerHTML = [0, 1, 2, 3].map((i) => '<button type="button" data-n="' + i + '" style="color:' + NOTE_COL[i] + ';border-color:' + NOTE_COL[i] + '">' + (i + 1) + '<small>' + NOTE_WORD[i] + '</small></button>').join('');
    if (!el._wired) { el._wired = true; el.addEventListener('pointerdown', (e) => { const b = e.target.closest('button'); if (b && S.stageNow === st) { e.preventDefault(); sing(+b.dataset.n); } }); }
  }
  function lightNote(i) { const b = S.$('notes').children[i]; if (!b) return; b.classList.add('lit'); setTimeout(() => b.classList.remove('lit'), 260); }
  function startCharm(target) {
    const sp = target.sp, len = 3 + sp.rel + (sp.epic ? 2 : 0);
    charm = { sp, target, seq: sp.song.slice(0, len), i: 0, phase: 'listen', t: 0.5, got: 0, bubble: -1 };
    S.$('notes').hidden = false;
    S.prompt('Listen…');
  }
  function sing(n) {
    if (!charm || charm.phase !== 'echo') { lightNote(n); S.sfx.play('note', n); P.singing = 0.3; return; }
    lightNote(n); S.sfx.play('note', n); P.singing = 0.4;
    S.float(P.x, P.y - P.r * 3, NOTE_WORD[n], NOTE_COL[n]);
    if (n === charm.seq[charm.got]) {
      charm.got++; charm.t = window_();
      if (charm.got >= charm.seq.length) win();
    } else lose('Wrong note.');
  }
  function window_() { return 1.7 + P.st.charm * 0.45; }
  function win() {
    const sp = charm.sp, tg = charm.target, G = S.game;
    sp.rel++; S.earn(5 + sp.rel * 2, tg.x, tg.y - tg.r * 3, 'DNA');
    for (let k = 0; k < 8; k++) S.float(tg.x + S.rr(-20, 20), tg.y - S.rr(10, 40), '♥', '#ff8fb1');
    if (sp.rel >= 3) ally(sp); else { S.sfx.play('dna'); S.toast('It likes you. ' + (3 - sp.rel) + ' more to win them over.', 2); }
    endCharm();
  }
  function lose(why) {
    const sp = charm.sp; S.sfx.play('wrong');
    if (sp.temp === 'fierce') { sp.angry = 8; S.toast(why + ' It attacks!', 2); }
    else if (sp.temp === 'shy') { for (const m of sp.members) m.flee = 4; S.toast(why + ' They scatter.', 2); }
    else S.toast(why + ' It wanders off, unimpressed.', 2);
    endCharm();
  }
  function endCharm(why) { st.lastEnd = why || 'done'; charm = null; S.$('notes').hidden = true; S.prompt(''); }
  function ally(sp) {
    const G = S.game;
    sp.status = 'allied'; sp.angry = 0; G.allies++; S.sfx.play('ally');
    S.toast('Allied: ' + sp.g.name, 3);
    const cap = 2 + P.st.charm;
    for (const m of sp.members) if (!m.dead && pack().length < cap) m.inPack = true;
  }
  function extinct(sp) {
    const G = S.game;
    sp.status = 'extinct'; G.extinct++; S.sfx.play('extinct');
    S.toast('Extinct: ' + sp.g.name, 3);
  }

  // test hooks (tools/drive.mjs)
  st.peek = () => ({ charm: charm && { phase: charm.phase, seq: charm.seq, got: charm.got }, species: species.map((sp) => ({ name: sp.g.name, temp: sp.temp, rel: sp.rel, status: sp.status, alive: sp.members.filter((m) => !m.dead).length })) });
  st.settleFour = () => { species.filter((x) => x.status === 'wild').slice(0, 4 - species.filter((x) => x.status !== 'wild').length).forEach((sp) => { sp.status = 'allied'; S.game.allies++; }); };
  st.besideA = function (temp) {
    const sp = species.find((x) => x.temp === temp && x.status === 'wild' && !x.epic) || species.find((x) => x.status === 'wild' && !x.epic);
    const m = sp.members.find((q) => !q.dead); P.teleport(m.x - 90, m.y); P.h = 0; sp.angry = 0; return sp.i;
  };

  // ── a frame ──
  st.update = function (dt) {
    t += dt;
    const G = S.game;
    for (const sp of species) if (sp.angry > 0) sp.angry -= dt;
    if (deadT > 0) { deadT -= dt; S.prompt(''); if (deadT <= 0) respawn(); updateMembers(dt); return; }
    // senses for the brain
    let near = null, nd = 1e9, threat = false, touch = false, smell = false;
    for (const m of members) {
      if (m.dead) continue;
      const d = S.dist(m.x, m.y, P.x, P.y);
      if (m.sp.status === 'wild' && d < nd) { nd = d; near = m; }
      if (d < P.st.sense && m.sp.status === 'wild' && (m.sp.temp === 'fierce' || m.sp.angry > 0)) threat = true;
      if (d < m.length + P.r * 2 && m.touches(P.x, P.y, P.r * 1.3) >= 0) touch = true;
    }
    for (let i = 0; i < food.length; i += 2) if (S.dist(food[i].x, food[i].y, P.x, P.y) < P.st.sense) { smell = true; break; }
    S.tickBrain(dt, { food: smell, touch, predator: threat, tail: P.lastHitAt && performance.now() - P.lastHitAt < 200 });
    if (S.tapped('KeyB')) S.setAuto(!S.auto);
    // the song
    if (charm) {
      charm.target.steer(dt, Math.atan2(P.y - charm.target.y, P.x - charm.target.x), 0);
      if (charm.target.dead || S.dist(P.x, P.y, charm.target.x, charm.target.y) > 260) endCharm(charm.target.dead ? 'target died' : 'too far: ' + Math.round(S.dist(P.x, P.y, charm.target.x, charm.target.y)));
      else if (charm.phase === 'listen') {
        charm.t -= dt;
        if (charm.t <= 0) {
          if (charm.i < charm.seq.length) {
            const n = charm.seq[charm.i++]; lightNote(n); S.sfx.play('note', n); charm.target.singing = 0.4;
            S.float(charm.target.x, charm.target.y - charm.target.r * 3, NOTE_WORD[n], NOTE_COL[n]);
            charm.t = 0.62;
          } else { charm.phase = 'echo'; charm.t = window_() + 0.6; S.prompt('Your turn: sing it back with <kbd>1</kbd>–<kbd>4</kbd>'); }
        }
      } else if (charm.phase === 'echo') { charm.t -= dt; if (charm.t <= 0) lose('Too slow.'); }
    }
    for (const k of ['Digit1', 'Digit2', 'Digit3', 'Digit4']) if (S.tapped(k)) sing(+k.slice(5) - 1);
    const singNow = wantSing; wantSing = false;
    if ((S.tapped('KeyQ') || singNow) && !charm) {
      st.lastQ = { nd: Math.round(nd), sp: near && near.sp.g.name, angry: near && near.sp.angry, t };
      if (near && nd < 200 + near.r * 2 && near.sp.angry <= 0) startCharm(near);
      else if (near && near.sp.angry > 0) S.toast('Too angry to listen. Give it a moment.', 1.6);
      else S.toast('No one close enough to sing to.', 1.4);
    }
    // move (frozen while it sings back)
    if (!charm || charm.phase === 'listen') S.drivePlayer(P, dt); else P.steer(dt, null, 0);
    P.physics(dt);
    S.keepInBox(P, WW, WH, 30); S.pushOut(P, rocks);
    P.hp = Math.min(P.st.hp, P.hp + dt * 1.2);
    // eat
    const mo = P.mouth(), reach = P.r * 1.6;
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i];
      if (S.dist(f.x, f.y, mo.x, mo.y) < reach + f.r) { food.splice(i, 1); G.ate.plant++; S.earn(1 + P.st.graze, f.x, f.y); S.sfx.play('eat'); if (G.traits.indexOf('grazer') >= 0) P.hp = Math.min(P.st.hp, P.hp + 4); }
    }
    for (let i = meat.length - 1; i >= 0; i--) {
      const f = meat[i]; f.life -= dt; if (f.life <= 0) { meat.splice(i, 1); continue; }
      if (S.dist(f.x, f.y, mo.x, mo.y) < reach + 3) { meat.splice(i, 1); if (P.st.meat) { G.ate.meat++; S.earn(4, f.x, f.y); S.sfx.play('chomp'); P.hp = Math.min(P.st.hp, P.hp + 6); } else S.float(f.x, f.y, 'no jaws: cannot eat meat', '#8d97b8'); }
    }
    if (food.length < 110 && Math.random() < dt * 1.5) addFood();
    // bite: only with jaws or a horn, or in a lunge
    const armed = P.st.meat || S.count(P.g, 'horn') > 0 || P.boost > 0;
    if (armed) for (const m of members) {
      if (m.dead || m.sp.status === 'allied') continue;
      if (charm && charm.sp === m.sp && !(P.boost > 0)) continue;   // brushing your audience is not a bite; a lunge is
      const mult = (S.game.traits.indexOf('hunter') >= 0 ? 1.25 : 1) * (S.game.traits.indexOf('omnivore') >= 0 ? 1.1 : 1);
      if (S.tryBite(P, m, { mult })) {
        S.sfx.play('chomp'); packTarget = m;
        if (m.sp.temp !== 'shy') m.sp.angry = 12; else m.flee = 5;
        if (charm && charm.sp === m.sp) { endCharm('you bit it'); S.toast('You bit your audience. That ended the song.', 2); }
      }
    }
    updateMembers(dt);
    if (P.hp <= 0) die();
    // camera
    S.cam.x += (P.x - S.cam.x) * Math.min(1, dt * 4); S.cam.y += (P.y - S.cam.y) * Math.min(1, dt * 4); S.cam.z += (zoomFor() - S.cam.z) * Math.min(1, dt * 2);
    // prompts
    const settled = panelTick(), atNest = S.dist(P.x, P.y, nest.x, nest.y) < 170;
    if (charm) {} else if (settled >= 4) { S.prompt('<kbd>E</kbd> Gather your kind: the next stage'); if (S.tapped('KeyE')) finish(); if (!doneShown) { doneShown = true; S.toast('Four settled. Your kind is ready to swarm.', 3); } }
    else if (atNest) { S.prompt('<kbd>E</kbd> Open the egg: ' + Math.floor(G.dna) + ' DNA to spend'); if (S.tapped('KeyE')) openEgg(); }
    else if (near && nd < 200 + near.r * 2 && near.sp.status === 'wild') S.prompt('<kbd>Q</kbd> Sing to ' + S.esc(near.sp.g.name) + (near.sp.temp === 'fierce' ? ' <span style="color:var(--hurt)">(fierce)</span>' : near.sp.temp === 'shy' ? ' (shy)' : ''));
    else if (S.auto) S.prompt('Its brain is driving. Any key or click takes it back.');
    else S.prompt(t < 10 ? 'Find the other species. Sing to them, or hunt them.' : '');
  };

  function updateMembers(dt) {
    const alive = deadT <= 0, pk = pack();
    for (let i = members.length - 1; i >= 0; i--) {
      const m = members[i];
      if (m.dead) continue;
      const sp = m.sp, d = S.dist(m.x, m.y, P.x, P.y);
      let ang = null, thr = 0.4;
      m.wander += S.rr(-1.5, 1.5) * dt;
      if (m.flee > 0) m.flee -= dt;
      if (charm && charm.target === m) { ang = Math.atan2(P.y - m.y, P.x - m.x); thr = 0; }   // held by the song, facing you
      else if (m.inPack) {
        const tg = packTarget && !packTarget.dead && S.dist(packTarget.x, packTarget.y, m.x, m.y) < 600 ? packTarget : null;
        if (tg) { ang = Math.atan2(tg.y - m.y, tg.x - m.x); thr = 1; if (S.tryBite(m, tg)) { if (tg.sp.temp !== 'shy') tg.sp.angry = Math.max(tg.sp.angry, 6); } }
        else { const k = pk.indexOf(m), bx = P.x - Math.cos(P.h + (k % 2 ? 0.6 : -0.6)) * (P.length + 30 + k * 18), by = P.y - Math.sin(P.h + (k % 2 ? 0.6 : -0.6)) * (P.length + 30 + k * 18); const bd = S.dist(bx, by, m.x, m.y); ang = Math.atan2(by - m.y, bx - m.x); thr = S.clamp(bd / 80, 0, 1); }
      } else if (sp.status === 'allied') {
        ang = home(m, 220); thr = 0.3;
      } else {
        const hostile = (sp.angry > 0 || (sp.temp === 'fierce' && d < 170 && !(charm && charm.sp === sp))) && alive;
        if (hostile) {
          let tg = P, td = d;
          for (const q of pk) { const qd = S.dist(q.x, q.y, m.x, m.y); if (qd < td) { td = qd; tg = q; } }
          if (td < 700) { ang = Math.atan2(tg.y - m.y, tg.x - m.x); thr = 0.95; if (S.tryBite(m, tg)) { if (tg === P) { S.sfx.play('hurt'); S.cam.shake = sp.epic ? 12 : 5; } packTarget = m; } }
          else ang = home(m, 260);
        } else if ((sp.temp === 'shy' && d < 150 && !(charm && charm.sp === sp)) || m.flee > 0) { ang = Math.atan2(m.y - P.y, m.x - P.x); thr = 1; }
        else { ang = sp.epic ? m.h + m.wander * dt * 2 : home(m, 260); thr = sp.epic ? 0.35 : 0.3; }
      }
      m.steer(dt, ang, thr); m.physics(dt);
      if (S.keepInBox(m, WW, WH, 30)) m.wander = S.rr(-3, 3);
      S.pushOut(m, rocks);
      if (m.hp <= 0) {
        m.dead = true; m.inPack = false;
        const k = Math.max(2, Math.round(m.length / 16));
        for (let j = 0; j < k; j++) { const q = m.spine[Math.floor(j / k * m.spine.length)]; meat.push({ x: q.x + S.rr(-5, 5), y: q.y + S.rr(-5, 5), life: 40, r: S.rr(3, 5) * m.scale }); }
        S.burst(m.x, m.y, S.hsl(m.g.hue, 90, 60), 20, 100, 0.8, 2.4);
        if (m.lastHitBy === P || (m.lastHitBy && m.lastHitBy.inPack)) S.game.kills++;
        if (sp.status === 'wild' && sp.members.every((q) => q.dead)) extinct(sp);
        if (packTarget === m) packTarget = null;
      }
    }
  }
  function home(m, R) {
    const sp = m.sp, d = S.dist(m.x, m.y, sp.nest.x, sp.nest.y);
    if (d > R) return Math.atan2(sp.nest.y - m.y, sp.nest.x - m.x);
    return m.h + m.wander * 0.03;
  }

  function die() {
    const G = S.game; P.dead = true; deadT = 2.4; G.deaths++; endCharm();
    S.sfx.play('die'); S.burst(P.x, P.y, S.hsl(P.g.hue, 90, 65), 30, 120, 0.9, 2.5); S.cam.shake = 10;
    const lost = Math.floor(G.dna * 0.15); G.dna -= lost;
    S.toast('You died.' + (lost ? ' −' + lost + ' DNA.' : '') + ' Back to the nest.', 2.4);
  }
  function respawn() { P.dead = false; P.hp = P.st.hp; P.poison = 0; P.teleport(nest.x + 50, nest.y); for (const sp of species) sp.angry = 0; }

  function openEgg() {
    const G = S.game; S.setAuto(false); S.sfx.play('egg');
    S.openEditor({
      genome: G.genome, dna: G.dna, stage: 2, title: 'Your nest', sub: 'Legs, a song sac and a horn grow on land.', keepName: true,
      onHatch(g, left, roll) {
        G.genome = g; G.dna = left; G.rolls.push(roll.text);
        P.g = g; P.rebuild(); P.hp = P.st.hp; S.setBrain(g);
        S.toast('Generation ' + g.gen, 2.4); S.checkpoint();
      }
    });
  }

  function finish() {
    const G = S.game;
    const al = species.filter((s) => s.status === 'allied').length, ex = species.filter((s) => s.status === 'extinct').length;
    const trait = al >= 3 ? 'charmer' : ex >= 3 ? 'predator' : 'diplomat';
    G.traits.push(trait);
    const T = {
      charmer: ['Charmer', 'You sang your way through the litter. In the swarm, rival creatures your kind bites sometimes change sides.'],
      predator: ['Predator', 'You hunted your neighbours out of existence. Your swarm bites forty per cent harder.'],
      diplomat: ['Diplomat', 'Some you befriended and some you ate. Your young mutate more often, so new lineages appear faster.']
    }[trait];
    S.endStage({
      eyebrow: 'Stage 2 done · ×40 → ×1', title: 'Gather your kind',
      body: '<p>You stop being one creature. From here you are a species: a nest, a swarm, and every one of them a little different.</p>' +
        '<div class="rule"></div><p class="eyebrow">What you were</p><h2>' + T[0] + '</h2><p>' + T[1] + '</p>' +
        '<p class="fine">' + al + ' allied · ' + ex + ' extinct · ' + G.kills + ' kills · ' + G.ate.plant + ' plants · ' + G.ate.meat + ' meat</p>',
      stamp: T[0], next: 3
    });
  }

  // ── drawing ──
  st.draw = function (ctx) {
    S.screenTx(ctx); ctx.fillStyle = '#0d110a'; ctx.fillRect(0, 0, S.W, S.H);
    S.applyCam(ctx);
    ctx.fillStyle = groundPat; ctx.fillRect(0, 0, WW, WH);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 30; ctx.strokeRect(0, 0, WW, WH);
    const vw = S.W / S.cam.z / 2 + 200, vh = S.H / S.cam.z / 2 + 200, vis = (x, y, m) => Math.abs(x - S.cam.x) < vw + (m || 0) && Math.abs(y - S.cam.y) < vh + (m || 0);
    for (const L of leaves) if (vis(L.x, L.y, L.len)) drawLeaf(ctx, L);
    for (const r of rocks) if (vis(r.x, r.y)) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(r.x + 6, r.y + 8, r.r, r.r * 0.8, 0, 0, 6.283); ctx.fill();
      const g = ctx.createRadialGradient(r.x - r.r * 0.4, r.y - r.r * 0.4, r.r * 0.1, r.x, r.y, r.r); g.addColorStop(0, '#8c8a80'); g.addColorStop(1, '#3d3c37');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.283); ctx.fill();
    }
    // nests
    drawNest(ctx, nest.x, nest.y, S.game.genome.hue, true);
    for (const sp of species) if (sp.status !== 'extinct' && !sp.epic) drawNest(ctx, sp.nest.x, sp.nest.y, sp.g.hue, false);
    for (const f of food) if (vis(f.x, f.y)) {
      if (f.kind === 'cap') { ctx.fillStyle = '#d8ccb0'; ctx.fillRect(f.x - 1.2, f.y, 2.4, f.r); ctx.fillStyle = S.hsl(f.hue, 60, 50); ctx.beginPath(); ctx.arc(f.x, f.y, f.r, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#f4ead2'; ctx.beginPath(); ctx.arc(f.x - f.r * 0.35, f.y - f.r * 0.45, f.r * 0.18, 0, 6.283); ctx.arc(f.x + f.r * 0.3, f.y - f.r * 0.3, f.r * 0.14, 0, 6.283); ctx.fill(); }
      else { ctx.fillStyle = S.hsl(f.hue, 75, 50); for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(f.x + Math.cos(k * 2.1) * f.r * 0.6, f.y + Math.sin(k * 2.1) * f.r * 0.6, f.r * 0.55, 0, 6.283); ctx.fill(); } }
    }
    for (const f of meat) { ctx.fillStyle = 'rgba(220,80,90,' + Math.min(1, f.life / 5) + ')'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill(); }
    for (const m of members) if (!m.dead && vis(m.x, m.y, m.length)) {
      m.draw(ctx, t, { flat: false });
      if (m.inPack) { ctx.fillStyle = '#62e3b5'; ctx.font = '700 ' + 12 + 'px Gluten, cursive'; ctx.textAlign = 'center'; ctx.fillText('♥', m.x, m.y - m.r * 2.6); }
      else if (m.sp.status === 'wild' && m.sp.angry > 0) { ctx.fillStyle = '#ff5d73'; ctx.font = '900 14px Gluten, cursive'; ctx.textAlign = 'center'; ctx.fillText('!', m.x, m.y - m.r * 2.6); }
    }
    if (!P.dead) { ctx.strokeStyle = 'rgba(255,201,77,0.4)'; ctx.lineWidth = 1.5 / S.cam.z; ctx.beginPath(); ctx.arc(P.x, P.y, P.r * 3, 0, 6.283); ctx.stroke(); P.draw(ctx, t); }
    // fireflies
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const f of flies) {
      f.a += Math.sin(t * 0.7 + f.ph) * 0.02; f.x += Math.cos(f.a) * f.s * 0.016; f.y += Math.sin(f.a) * f.s * 0.016;
      if (!vis(f.x, f.y)) continue;
      const on = Math.max(0, Math.sin(t * 1.3 + f.ph * 3));
      if (on < 0.05) continue;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 14); g.addColorStop(0, 'rgba(230,255,140,' + on * 0.8 + ')'); g.addColorStop(1, 'rgba(230,255,140,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, 14, 0, 6.283); ctx.fill();
    }
    ctx.restore();
    S.drawFx(ctx);
    // dusk: a vignette, the light gathered round you
    S.screenTx(ctx);
    const s0 = S.toScreen(P.x, P.y), vg = ctx.createRadialGradient(s0.x, s0.y, Math.min(S.W, S.H) * 0.25, s0.x, s0.y, Math.max(S.W, S.H) * 0.75);
    vg.addColorStop(0, 'rgba(10,8,30,0)'); vg.addColorStop(1, 'rgba(10,8,30,0.62)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, S.W, S.H);
    if (track) edgeArrow(ctx, track.status === 'extinct' ? null : (track.epic ? track.members[0] : track.nest), S.hsl(track.g.hue, 80, 65));
    if (!charm) for (const sp of species) if (sp.angry > 0 && sp.status === 'wild') { const m = sp.members.find((q) => !q.dead && S.dist(q.x, q.y, P.x, P.y) < 700); if (m) edgeArrow(ctx, m, '#ff5d73'); }
    S.scaleBar(ctx, 2 / MM, '2 mm');
  };
  function edgeArrow(ctx, at, col) {
    if (!at) return;
    const s = S.toScreen(at.x, at.y);
    if (s.x > 20 && s.y > 20 && s.x < S.W - 20 && s.y < S.H - 20) return;
    const a = Math.atan2(s.y - S.H / 2, s.x - S.W / 2), rr = Math.min(S.W, S.H) / 2 - 34;
    ctx.fillStyle = col; ctx.save(); ctx.translate(S.W / 2 + Math.cos(a) * rr, S.H / 2 + Math.sin(a) * rr); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawLeaf(ctx, L) {
    ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(L.rot);
    const l = L.len, w = l * L.w;
    ctx.fillStyle = S.hsl(L.hue, 35, L.l, 0.78); ctx.beginPath(); ctx.moveTo(-l / 2, 0); ctx.quadraticCurveTo(0, -w, l / 2, 0); ctx.quadraticCurveTo(0, w, -l / 2, 0); ctx.fill();
    ctx.strokeStyle = S.hsl(L.hue, 30, L.l + 12, 0.6); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-l / 2 - 14, 0); ctx.lineTo(l / 2, 0); ctx.stroke();
    ctx.lineWidth = 1;
    for (let k = -3; k <= 3; k++) { if (!k) continue; const x0 = k * l / 9; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + l / 10, -w * 0.55); ctx.moveTo(x0, 0); ctx.lineTo(x0 + l / 10, w * 0.55); ctx.stroke(); }
    ctx.restore();
  }
  function drawNest(ctx, x, y, hue, mine) {
    ctx.save(); ctx.strokeStyle = mine ? 'rgba(255,201,77,0.7)' : 'rgba(150,120,80,0.75)'; ctx.lineWidth = 3;
    for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283 + (mine ? 0 : 0.2); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 34, y + Math.sin(a) * 34); ctx.lineTo(x + Math.cos(a + 0.7) * 46, y + Math.sin(a + 0.7) * 46); ctx.stroke(); }
    for (let k = 0; k < 4; k++) { ctx.fillStyle = S.hsl(hue, 40, 82); ctx.beginPath(); ctx.ellipse(x + (k - 1.5) * 12, y + (k % 2) * 8 - 4, 7, 9, 0.2, 0, 6.283); ctx.fill(); }
    if (mine) { ctx.fillStyle = 'rgba(255,201,77,0.9)'; ctx.font = '700 13px Gluten, cursive'; ctx.textAlign = 'center'; ctx.fillText('your nest', x, y + 66); }
    ctx.restore();
  }
})(SQ);
