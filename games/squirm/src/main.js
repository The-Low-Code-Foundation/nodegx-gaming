/* SQUIRM — the frame loop, the title, the cards between stages, and the microscope's zoom-out between them. */
(function (S) {
  const STAGES = { 1: S.stage1, 2: S.stage2, 3: S.stage3 };
  S.stageNow = null;
  let card = null, attract = false, trans = null, firingT = 0, fpsAvg = 60;

  S.$('stagePanel').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && S.stageNow && S.stageNow.act) { S.sfx.wake(); S.stageNow.act(b.dataset.act, b); } });

  S.startStage = function (n, retry) {
    const G = S.game; G.stage = n;
    if (S.stageNow && S.stageNow !== STAGES[n]) snapshot();
    S.fx.length = 0; S.floaters.length = 0; S.cam.zTarget = 0; S.prompt('');
    S.stageNow = STAGES[n]; S.stageNow.enter(retry);
    S.$('notes').hidden = true;
    if (!attract && S.auto) S.setAuto(false);
    if (!attract) S.checkpoint();
  };
  /** The old view shrinks into the middle of the new, wider one: a turret clicking to a lower objective. */
  function snapshot() {
    try { const c = document.createElement('canvas'); c.width = S.cv.width; c.height = S.cv.height; c.getContext('2d').drawImage(S.cv, 0, 0); trans = { img: c, t: 0 }; } catch (e) { trans = null; }
  }

  // ── cards ──
  function showCard(html, wire) {
    hideCard();
    const el = document.createElement('div'); el.className = 'over'; el.id = 'card';
    el.innerHTML = html; S.$('eye').appendChild(el); card = el;
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { S.sfx.wake(); wire(b.dataset.go, b); } });
    const first = el.querySelector('.btn.big'); if (first) first.focus();
  }
  function hideCard() { if (card) { card.remove(); card = null; } }

  S.endStage = function (o) {
    S.setAuto(false); S.prompt('');
    const go = o.final ? '<button class="btn big" type="button" data-go="again">Play again</button>'
      : o.retry ? '<button class="btn big" type="button" data-go="retry">Try the swarm again</button><button class="btn" type="button" data-go="again">Start over</button>'
      : '<button class="btn big" type="button" data-go="next">Zoom out</button>';
    showCard('<div class="card">' + (o.stamp ? '<span class="stamp' + (o.green || !o.retry ? ' green' : '') + '">' + S.esc(o.stamp) + '</span>' : '') +
      '<div class="eyebrow">' + S.esc(o.eyebrow) + '</div><h1>' + S.esc(o.title) + '</h1>' + o.body + '<div class="go">' + go + '</div></div>',
      (what) => {
        hideCard();
        if (what === 'next') S.startStage(o.next);
        else if (what === 'retry') S.startStage(o.retry, true);
        else title();
      });
  };

  function title() {
    S.newRun(); attract = true;
    S.startStage(1); S.auto = true;
    const save = S.store.get('save');
    const cont = save && save.stage > 1 ? '<button class="btn" type="button" data-go="continue">Continue: stage ' + save.stage + '</button>' : '';
    showCard('<div class="card title-card">' +
      '<div class="eyebrow">a Spore reboot, grown from the Worm Plate</div>' +
      '<h1>Squirm</h1>' +
      '<p>Spore let you design a creature and called it evolution. Squirm hands you one with a real nervous system: the wiring of the worm <i>C. elegans</i>, 300 of its 302 nerve cells as Busbice’s 2014 table has them, firing in the panel on the right. You change its body, nature rolls the rest, and by the end the only thing you can still choose is <b>who gets to breed</b>.</p>' +
      '<div class="ladder">' +
      '<div><b>×400</b>The Drop. Eat, grow, lay three eggs.</div>' +
      '<div><b>×40</b>The Crawl. Sing to the neighbours, or eat them.</div>' +
      '<div><b>×1</b>The Swarm. Scent, lineages, selection.</div>' +
      '<div class="soon"><b>×0</b>The Sky. Not built yet.</div></div>' +
      '<div class="go"><button class="btn big" type="button" data-go="start">Start squirming</button>' + cont + '</div>' +
      '<div class="rule"></div>' +
      '<p class="fine">Mouse or <kbd>WASD</kbd>. Sound starts with your first key or click. Behind this card, the worm is being driven by its own brain. ' +
      'Jump ahead for a look: <button class="btn" type="button" data-go="j2" style="padding:1px 8px;font-size:11px">The Crawl</button> <button class="btn" type="button" data-go="j3" style="padding:1px 8px;font-size:11px">The Swarm</button></p>' +
      '</div>', (what) => {
      hideCard(); attract = false; S.auto = false; S.setAuto(false);
      if (what === 'start') { S.newRun(); S.startStage(1); S.toast('×400 · A drop of water', 2.6); }
      else if (what === 'continue') { const G = S.restore(); if (G) S.startStage(G.stage); else { S.newRun(); S.startStage(1); } }
      else if (what === 'j2' || what === 'j3') { jumpTo(what === 'j2' ? 2 : 3); }
    });
  }
  /** A plausible creature for a stage you have not played to: three eggs' worth of parts. */
  function jumpTo(n) {
    S.newRun(); const G = S.game, g = G.genome;
    g.parts = ['jaws', 'eye', 'cilia', 'spines']; if (n === 3) g.parts.push('legs', 'song');
    g.parts.forEach((p) => S.addCell(g, S.PARTS[p].name, S.PARTS[p].cell));
    g.segs = 8; g.girth = 6; g.gen = 4; g.pattern = 'stripes'; g.name = S.speciesName(g);
    G.eggs = 3; G.dna = n === 3 ? 40 : 30; G.traits = n === 3 ? ['omnivore', 'diplomat'] : ['omnivore'];
    S.startStage(n);
  }

  // ── the loop ──
  let last = performance.now();
  function frame(now) {
    const raw = Math.max(0.001, (now - last) / 1000), dt = Math.min(0.05, raw); last = now;
    fpsAvg += (1 / raw - fpsAvg) * 0.05;   // from the unclamped interval: the clamp would hide anything under 20
    const r = S.$('eye').getBoundingClientRect();
    if (Math.abs(r.width - S.W) > 1 || Math.abs(r.height - S.H) > 1) S.resize();
    const running = S.stageNow && !S.editorOpen() && (!card || attract);
    if (running) {
      if (attract) S.auto = true;
      S.stageNow.update(dt); S.updateFx(dt);
    }
    if (S.stageNow) S.stageNow.draw(S.ctx);
    if (trans) {
      trans.t += Math.min(0.1, (now - (trans.last || now)) / 1000); trans.last = now;
      const k = Math.min(1, trans.t / 1.1), e = 1 - Math.pow(1 - k, 3), s = 1 - e * 0.93, ctx = S.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const w = S.cv.width * s, h = S.cv.height * s, cx = S.cv.width / 2, cy = S.cv.height / 2;
      ctx.save(); ctx.globalAlpha = 1 - k * k;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(w, h) * 0.5 * (1 - k * 0.3), 0, 6.283); ctx.clip();
      ctx.drawImage(trans.img, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
      ctx.strokeStyle = 'rgba(241,234,216,' + (1 - k) + ')'; ctx.lineWidth = 3 * S.dpr; ctx.beginPath(); ctx.arc(cx, cy, Math.max(w, h) * 0.5 * (1 - k * 0.3), 0, 6.283); ctx.stroke();
      if (k >= 1) trans = null;
    }
    if (S.brain) {
      S.drawBrain(S.brain);
      firingT -= dt;
      if (firingT <= 0) { firingT = 0.2; S.setHtml(S.$('firing'), S.firingWords(S.brain, S.stageNow === S.stage3 ? null : S.game.genome)); }
    }
    S.tickToast(dt);
    S.endFrame();
    requestAnimationFrame(frame);
  }

  // test and debugging hooks for tools/drive.mjs
  window.__game = {
    S,
    state() {
      const G = S.game, p = S.player, c = G && G.genome.conn;
      return { stage: S.stageNow && S.stageNow.id, card: !!card, editor: S.editorOpen(), dna: G && Math.floor(G.dna), earned: G && Math.floor(G.earned), gen: G && G.genome.gen, eggs: G && G.eggs,
        parts: G && G.genome.parts.slice(), cells: c ? c.n : 0, evolved: c ? c.n - c.muscleEnd : 0, hp: p ? Math.round(p.hp) : null, x: p ? Math.round(p.x) : null, y: p ? Math.round(p.y) : null, auto: S.auto, fps: Math.round(fpsAvg),
        fired: S.brain ? Array.prototype.reduce.call(S.brain.fired, (a, b) => a + b, 0) : 0, traits: G && G.traits.slice(), allies: G && G.allies, extinct: G && G.extinct };
    },
    give(n) { S.game.dna += n; S.game.earned += n; },
    stage(n) { return n === 1 ? S.stage1 : n === 2 ? S.stage2 : S.stage3; },
    jump: jumpTo
  };

  S.resize();
  title();
  requestAnimationFrame(frame);
})(SQ);
