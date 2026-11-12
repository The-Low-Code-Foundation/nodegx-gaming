/* SQUIRM — stage 1, THE DROP (×400). A drop of water under dark-field light. Eat bacteria, dodge Pristionchus, lay three
 * eggs; each generation is bigger, so the thing that hunted you becomes the thing you hunt. */
(function (S) {
  const R = 1500;                 // the drop's radius, world px
  const UM = 2;                   // µm per world px
  const EGGS = [25, 65, 120];     // DNA earned in this stage at which each egg is ready
  const LEAVE = 175;              // …and at which the drop can be left
  const SCALE = [1, 1.3, 1.65, 2.05];

  const st = (S.stage1 = { id: 1, name: 'The Drop', mag: '×400' });
  let food, meat, npcs, patches, motes, t, P, deadT, hunterWarn, startEarned;

  st.enter = function () {
    const G = S.game;
    t = 0; deadT = 0; food = []; meat = []; npcs = []; patches = []; motes = [];
    startEarned = G.earned;
    for (let i = 0; i < 18; i++) cluster();
    for (let i = 0; i < 3; i++) { let p; do { p = rp(R - 250); } while (Math.hypot(p.x, p.y) < 450); patches.push({ x: p.x, y: p.y, r: S.rr(110, 170), a: S.rr(0, 6), vx: S.rr(-6, 6), vy: S.rr(-6, 6) }); }
    for (let i = 0; i < 500; i++) { const p = rp(R + 400); motes.push({ x: p.x, y: p.y, r: S.rr(0.4, 1.8), z: S.rr(0.2, 0.9) }); }
    P = new S.Creature(G.genome, 0, 0, { kind: 'player', scale: SCALE[Math.min(G.eggs, 3)], h: -Math.PI / 2 });   // before the others, so they spawn away from it
    for (let i = 0; i < 14; i++) spawn('prey');
    for (let i = 0; i < 8; i++) spawn('grazer');
    for (let i = 0; i < 3; i++) spawn('hunter');
    S.player = P; S.setBrain(G.genome);
    S.cam.x = 0; S.cam.y = 0; S.cam.z = zoomFor();
    S.setDial(st.mag, st.name, 'stage 1 of 3 · a drop of water');
    S.setKeys([['<kbd>WASD</kbd> or hold the mouse', 'swim'], ['<kbd>Space</kbd>', 'dash (bites harder)'], ['<kbd>E</kbd>', 'lay an egg when you have grown'], ['<kbd>B</kbd>', 'let its brain drive']]);
    panel();
  };

  function rp(maxR) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * maxR; return { x: Math.cos(a) * r, y: Math.sin(a) * r }; }
  function cluster() { const c = rp(R - 120), n = S.ri(10, 22), hue = S.pick([150, 165, 185, 95]); for (let k = 0; k < n; k++) food.push({ x: c.x + S.rr(-70, 70), y: c.y + S.rr(-70, 70), a: S.rr(0, 3.14), hue, t: 0 }); }
  function zoomFor() { const s = (S.W < 700 ? 1.25 : 1.9); return s / Math.pow(P ? P.scale : 1, 0.75); }

  function spawn(kind, at) {
    let g, scale, o = {};
    if (kind === 'prey') { g = S.makeGenome({ segs: S.ri(3, 4), girth: 3, parts: Math.random() < 0.5 ? ['cilia'] : [], pattern: 'glass', hue: S.pick([50, 60, 200]) }); scale = 0.9; }
    else if (kind === 'grazer') { g = S.randomGenome({ parts: S.ri(0, 2), segs: S.ri(6, 8), girth: S.ri(4, 5) }); g.parts = g.parts.filter((p) => p !== 'jaws' && p !== 'sting'); scale = S.rr(0.9, 1.25); }
    else { g = S.makeGenome({ segs: 9, girth: 6, parts: ['jaws', 'eye', 'spines'], pattern: 'bands', hue: S.pick([8, 18, 350]) }); g.name = 'Pristionchus pacificus'; scale = 1.75; }
    let p;
    do { p = at || rp(R - 80); at = null; } while (P && S.dist(p.x, p.y, P.x, P.y) < 500);
    const c = new S.Creature(g, p.x, p.y, Object.assign({ kind, scale }, o));
    c.wander = S.rr(-3, 3); c.mood = 0; c.target = null; c.rest = 0;
    npcs.push(c); return c;
  }

  // ── a frame ──
  st.update = function (dt) {
    t += dt;
    const G = S.game;
    if (deadT > 0) { deadT -= dt; S.prompt(''); if (deadT <= 0) respawn(); updateNpcs(dt); return; }
    // senses for the real brain
    const sense = P.st.sense * P.scale;
    let smellFood = false, threat = null, touch = false, harm = false;
    for (let i = 0; i < food.length; i += 3) { const f = food[i]; if (Math.abs(f.x - P.x) < sense && Math.abs(f.y - P.y) < sense && S.dist(f.x, f.y, P.x, P.y) < sense) { smellFood = true; break; } }
    for (const n of npcs) {
      const d = S.dist(n.x, n.y, P.x, P.y);
      if (n.kind === 'hunter' && n.scale > P.scale * 0.9 && d < sense * 1.2) threat = n;
      if (d < n.length + P.r * 2 && n.touches(P.x, P.y, P.r * 1.4) >= 0) touch = true;
    }
    for (const z of patches) if (S.dist(z.x, z.y, P.x, P.y) < z.r) harm = true;
    const tailHit = P.lastHitAt && performance.now() - P.lastHitAt < 200;
    S.tickBrain(dt, { food: smellFood, touch, tail: tailHit, predator: !!threat, harm });
    if (S.tapped('KeyB')) S.setAuto(!S.auto);
    S.drivePlayer(P, dt); P.physics(dt);
    S.keepInCircle(P, 0, 0, R - P.r);
    if (harm) { P.hp -= dt * 7; P.flash = 0.05; if (Math.random() < dt * 3) S.sfx.play('hurt'); }
    // regenerate a little
    P.hp = Math.min(P.st.hp, P.hp + dt * 0.8);
    // eat bacteria
    const m = P.mouth(), reach = P.r * (1.4 + (P.st.graze - 1) * 0.8), lure = P.st.lure ? 120 * P.scale : 0;
    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i], d = S.dist(f.x, f.y, m.x, m.y);
      if (lure && d < lure) { f.x += (m.x - f.x) * dt * 1.4; f.y += (m.y - f.y) * dt * 1.4; }
      if (d < reach) { food.splice(i, 1); G.ate.plant++; S.earn(P.st.graze, f.x, f.y); S.sfx.play('eat'); S.burst(f.x, f.y, S.hsl(f.hue, 90, 65), 3, 30, 0.3, 1.2); if (G.traits.indexOf('grazer') >= 0) P.hp = Math.min(P.st.hp, P.hp + 1); }
    }
    for (let i = meat.length - 1; i >= 0; i--) {
      const f = meat[i]; f.life -= dt; if (f.life <= 0) { meat.splice(i, 1); continue; }
      if (S.dist(f.x, f.y, m.x, m.y) < reach + 2) {
        meat.splice(i, 1);
        if (P.st.meat) { G.ate.meat++; S.earn(3, f.x, f.y); S.sfx.play('chomp'); P.hp = Math.min(P.st.hp, P.hp + 4); }
        else { S.float(f.x, f.y, 'no jaws: cannot eat meat', '#8d97b8'); }
      }
    }
    // biting other creatures
    for (const n of npcs) {
      if (n.dead) continue;
      const dmg = S.tryBite(P, n, { mult: G.traits.indexOf('hunter') >= 0 ? 1.25 : 1 });
      if (dmg) { S.sfx.play('chomp'); n.mood = 5; n.target = P; if (n.kind === 'hunter' && n.scale > P.scale) n.rest = 0; }
    }
    if (Math.random() < dt * 0.6 && food.length < 340) cluster();
    updateNpcs(dt);
    // death
    if (P.hp <= 0) { die(); }
    // camera
    const z = zoomFor();
    S.cam.x += (P.x - S.cam.x) * Math.min(1, dt * 5); S.cam.y += (P.y - S.cam.y) * Math.min(1, dt * 5); S.cam.z += (z - S.cam.z) * Math.min(1, dt * 2);
    for (const z2 of patches) { z2.x += z2.vx * dt; z2.y += z2.vy * dt; if (Math.hypot(z2.x, z2.y) > R - 200) { z2.vx *= -1; z2.vy *= -1; } }
    hunterWarn = threat;
    // eggs and leaving
    const grown = G.earned - startEarned + (G.stage1Base || 0);
    const next = G.eggs < 3 ? EGGS[G.eggs] : LEAVE;
    if (grown >= next) {
      if (G.eggs < 3) { S.prompt('<kbd>E</kbd> Lay an egg: spend your DNA on a new body'); if (S.tapped('KeyE')) layEgg(); }
      else { S.prompt('<kbd>E</kbd> Crawl out of the drop'); if (S.tapped('KeyE')) leave(); }
    } else if (S.auto) S.prompt('Its brain is driving. Any key or click takes it back.');
    else if (threat) S.prompt('<span style="color:var(--hurt)">Pristionchus</span> smells you: its scent cells (ADL, ASK) just fired');
    else if (harm) S.prompt('<span style="color:var(--danger)">Copper salts</span>: its pain cells (ASH) are firing');
    else S.prompt(t < 8 ? 'Eat the glowing bacteria. Hold the mouse or use <kbd>WASD</kbd>.' : '');
    panel();
  };

  function updateNpcs(dt) {
    for (let i = npcs.length - 1; i >= 0; i--) {
      const n = npcs[i];
      if (n.dead) { npcs.splice(i, 1); setTimeout(() => { if (S.stageNow === st) spawn(n.kind); }, 6000); continue; }
      const d = S.dist(n.x, n.y, P.x, P.y), sense = n.st.sense * n.scale, alive = deadT <= 0;
      let ang = null, thr = 0.45;
      n.wander += S.rr(-1.5, 1.5) * dt;
      if (n.kind === 'prey') {
        const big = alive && d < sense * 0.8 && P.scale >= n.scale * 0.8;
        if (big) { ang = Math.atan2(n.y - P.y, n.x - P.x); thr = 1; } else { ang = n.h + n.wander * dt * 2; thr = 0.35; }
      } else if (n.kind === 'grazer') {
        if (n.mood > 0 && alive) { n.mood -= dt; ang = Math.atan2(P.y - n.y, P.x - n.x); thr = 0.9; if (S.tryBite(n, P)) { S.sfx.play('hurt'); S.cam.shake = 3; } }
        else {
          let best = null, bd = sense;
          for (let k = 0; k < food.length; k += 4) { const f = food[k], fd = Math.abs(f.x - n.x) + Math.abs(f.y - n.y); if (fd < bd) { bd = fd; best = f; } }
          if (best) { ang = Math.atan2(best.y - n.y, best.x - n.x); thr = 0.5; const mm = n.mouth(); if (S.dist(mm.x, mm.y, best.x, best.y) < n.r * 1.5) food.splice(food.indexOf(best), 1); }
          else ang = n.h + n.wander * dt * 2;
        }
      } else { // hunter
        if (n.rest > 0) { n.rest -= dt; thr = 0.2; ang = n.h + n.wander * dt; }
        else {
          const prey = alive && d < sense * 1.2 ? P : null;
          if (prey && P.scale > n.scale * 1.12) { ang = Math.atan2(n.y - P.y, n.x - P.x); thr = 0.9; }   // you outgrew it
          else if (prey) { ang = Math.atan2(P.y - n.y, P.x - n.x); thr = 0.85; if (S.tryBite(n, P)) { S.sfx.play('hurt'); S.cam.shake = 6; n.rest = 1.2; } }
          else {
            let tgt = null, td = sense;
            for (const o of npcs) if (o !== n && o.kind !== 'hunter') { const od = S.dist(o.x, o.y, n.x, n.y); if (od < td) { td = od; tgt = o; } }
            if (tgt) { ang = Math.atan2(tgt.y - n.y, tgt.x - n.x); thr = 0.7; if (S.tryBite(n, tgt)) n.rest = 1; }
            else ang = n.h + n.wander * dt * 2;
          }
        }
      }
      n.steer(dt, ang, thr); n.physics(dt);
      if (S.keepInCircle(n, 0, 0, R - n.r)) n.wander = S.rr(-3, 3);
      if (n.hp <= 0 && !n.dead) {
        n.dead = true;
        const k = Math.max(2, Math.round(n.length / 18));
        for (let j = 0; j < k; j++) { const q = n.spine[Math.floor(j / k * n.spine.length)]; meat.push({ x: q.x + S.rr(-4, 4), y: q.y + S.rr(-4, 4), life: 30, r: S.rr(2.5, 4) * n.scale }); }
        S.burst(n.x, n.y, S.hsl(n.g.hue, 90, 60), 18, 90, 0.7, 2);
        if (n.lastHitBy === P) { S.game.kills++; S.float(n.x, n.y - 10, n.kind === 'hunter' ? 'Pristionchus down!' : 'kill', '#ff8fb1'); }
      }
    }
  }

  function die() {
    const G = S.game;
    P.dead = true; deadT = 2.2; G.deaths++;
    S.sfx.play('die'); S.burst(P.x, P.y, S.hsl(P.g.hue, 90, 65), 30, 120, 0.9, 2.5); S.cam.shake = 10;
    const lost = Math.floor(G.dna * 0.2); G.dna -= lost;
    S.toast('Eaten.' + (lost ? ' −' + lost + ' DNA' : '') + ' A sibling egg hatches…', 2.2);
  }
  function respawn() {
    let p; do { p = rp(R - 200); } while (npcs.some((n) => n.kind === 'hunter' && S.dist(n.x, n.y, p.x, p.y) < 500));
    P.dead = false; P.hp = P.st.hp; P.poison = 0; P.teleport(p.x, p.y); S.cam.x = p.x; S.cam.y = p.y;
  }

  function layEgg() {
    const G = S.game;
    S.sfx.play('egg'); S.setAuto(false);
    S.openEditor({
      genome: G.genome, dna: G.dna, stage: 1, title: 'Egg ' + (G.eggs + 1) + ' of 3',
      sub: 'The next generation is bigger. Pristionchus stays the same size.',
      onHatch(g, left, roll) {
        G.genome = g; G.dna = left; G.eggs++; G.rolls.push(roll.text);
        P.g = g; P.scale = SCALE[Math.min(G.eggs, 3)]; P.rebuild(); P.hp = P.st.hp;
        S.setBrain(g);
        S.toast('Generation ' + g.gen + ' · ' + g.name, 3);
        S.checkpoint();
      }
    });
  }
  function leave() {
    const G = S.game, tot = G.ate.plant + G.ate.meat * 3;
    const meatShare = tot ? (G.ate.meat * 3) / tot : 0;
    const trait = meatShare > 0.6 ? 'hunter' : meatShare < 0.25 ? 'grazer' : 'omnivore';
    G.traits.push(trait);
    const T = {
      hunter: ['Hunter', 'You ate mostly meat. Your kind bites a quarter harder from now on.'],
      grazer: ['Grazer', 'You ate mostly bacteria. From now on, every meal heals you a little.'],
      omnivore: ['Opportunist', 'You ate whatever you met. Your kind is a little faster and bites a little harder.']
    }[trait];
    S.endStage({
      eyebrow: 'Stage 1 done · ×400 → ×40', title: 'The drop dries out',
      body: '<p>The water you grew up in is evaporating off a leaf. ' + S.esc(G.genome.name) + ' crawls out onto the litter.</p>' +
        '<div class="rule"></div><p class="eyebrow">What you were</p><h2>' + T[0] + '</h2><p>' + T[1] + '</p>' +
        '<p class="fine">' + G.ate.plant + ' bacteria · ' + G.ate.meat + ' bites of meat · ' + G.kills + ' kills · ' + G.deaths + ' deaths · brain ' + (G.genome.conn.n - G.genome.conn.muscleEnd) + ' cells bigger than it started</p>',
      stamp: T[0], next: 2
    });
  }

  function panel() {
    const G = S.game, grown = G.earned - startEarned + (G.stage1Base || 0), next = G.eggs < 3 ? EGGS[G.eggs] : LEAVE;
    S.setSpecimen({
      slide: 'slide 1 · gen ' + G.genome.gen, size: Math.round(P.length * UM) + ' µm', name: G.genome.name,
      meta: '<span>' + G.ate.plant + ' bacteria</span><span>' + G.ate.meat + ' meat</span><span>' + G.kills + ' kills</span>',
      hp: P.hp, hpMax: P.st.hp, grow: grown, growMax: next, growLabel: G.eggs < 3 ? 'egg ' + (G.eggs + 1) : 'leave'
    });
    S.setDna(G.dna);
    S.setStagePanel('<h3>The drop <span>' + (G.eggs < 3 ? 'egg ' + (G.eggs + 1) + ' of 3' : 'ready to leave') + '</span></h3>' +
      '<div class="note">Each egg opens the editor. Every part you buy grows a <b>new nerve cell</b> in the brain above, and hatching rolls one mutation you did not choose. ' +
      (P.scale < 1.75 ? 'The red-banded <b>Pristionchus</b> are bigger than you. For now.' : '<b>You are bigger than Pristionchus now.</b> Go and find one.') + '</div>' +
      (grown >= next ? '<div class="row"><button class="btn big" type="button" data-act="egg">' + (G.eggs < 3 ? 'Lay an egg' : 'Crawl out') + '</button></div>' : ''));
  }
  st.act = () => { const G = S.game; if (G.eggs < 3) layEgg(); else leave(); };

  // ── drawing ──
  st.draw = function (ctx) {
    S.screenTx(ctx);
    ctx.fillStyle = '#04060d'; ctx.fillRect(0, 0, S.W, S.H);
    S.applyCam(ctx);
    // the drop
    const gr = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
    gr.addColorStop(0, '#111a36'); gr.addColorStop(0.85, '#0b1228'); gr.addColorStop(1, '#16224a');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(140,180,255,0.35)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = 'rgba(140,180,255,0.08)'; ctx.lineWidth = 40; ctx.stroke();
    // motes drifting at depth
    ctx.fillStyle = 'rgba(170,190,255,0.25)';
    for (const m of motes) { const x = m.x + S.cam.x * (1 - m.z) * 0.6 + Math.sin(t * 0.2 + m.x) * 6, y = m.y + S.cam.y * (1 - m.z) * 0.6; ctx.globalAlpha = m.z * 0.6; ctx.fillRect(x, y, m.r, m.r); }
    ctx.globalAlpha = 1;
    // copper-salt patches
    for (const z of patches) {
      const g2 = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
      g2.addColorStop(0, 'rgba(199,125,255,0.32)'); g2.addColorStop(1, 'rgba(199,125,255,0)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(199,125,255,0.35)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (0.95 + Math.sin(t * 2) * 0.02), 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
    }
    // bacteria: rods glowing in the dark field
    const vw = S.W / S.cam.z / 2 + 40, vh = S.H / S.cam.z / 2 + 40;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const f of food) {
      if (Math.abs(f.x - S.cam.x) > vw || Math.abs(f.y - S.cam.y) > vh) continue;
      const a = f.a + Math.sin(t + f.x) * 0.3, dx = Math.cos(a) * 3.2, dy = Math.sin(a) * 3.2;
      ctx.strokeStyle = S.hsl(f.hue, 90, 55, 0.25); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(f.x - dx, f.y - dy); ctx.lineTo(f.x + dx, f.y + dy); ctx.stroke();
      ctx.strokeStyle = S.hsl(f.hue, 90, 70, 0.95); ctx.lineWidth = 2.6; ctx.stroke();
    }
    for (const f of meat) { ctx.fillStyle = 'rgba(255,110,120,' + Math.min(1, f.life / 5) + ')'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill(); }
    ctx.restore();
    // creatures
    for (const n of npcs) if (Math.abs(n.x - S.cam.x) < vw + 120 && Math.abs(n.y - S.cam.y) < vh + 120) n.draw(ctx, t);
    if (!P.dead) {
      ctx.strokeStyle = 'rgba(255,201,77,0.35)'; ctx.lineWidth = 1.2 / S.cam.z; ctx.beginPath(); ctx.arc(P.x, P.y, P.r * 3.2, 0, 6.283); ctx.stroke();
      P.draw(ctx, t);
    }
    S.drawFx(ctx);
    S.screenTx(ctx);
    // a red edge arrow toward a hunter that smells you
    if (hunterWarn && !P.dead) {
      const s = S.toScreen(hunterWarn.x, hunterWarn.y);
      if (s.x < 0 || s.y < 0 || s.x > S.W || s.y > S.H) {
        const a = Math.atan2(s.y - S.H / 2, s.x - S.W / 2), ex = S.W / 2 + Math.cos(a) * (Math.min(S.W, S.H) / 2 - 30), ey = S.H / 2 + Math.sin(a) * (Math.min(S.W, S.H) / 2 - 30);
        ctx.fillStyle = '#ff5d73'; ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
    S.scaleBar(ctx, 100 / UM, '100 µm');
  };

  /** The microscope's scale bar, bottom left: worldLen px of world = label. */
  S.scaleBar = function (ctx, worldLen, label) {
    const w = worldLen * S.cam.z, x = 18, y = S.H - 22;
    ctx.fillStyle = 'rgba(241,234,216,0.9)'; ctx.fillRect(x, y, w, 4);
    ctx.font = '600 11px "IBM Plex Mono", monospace'; ctx.fillText(label, x, y - 6);
  };
})(SQ);
