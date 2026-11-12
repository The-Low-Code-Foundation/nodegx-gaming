/* SQUIRM — the egg: a creature editor. You spend DNA on parts and shape; then nature rolls one change you did not choose.
 * Every new part grows a new nerve cell, spliced into the connectome after the sensory cell that part would use. */
(function (S) {
  const HUES = [0, 22, 45, 80, 130, 165, 190, 210, 235, 265, 290, 325];
  let open = null;

  S.editorOpen = () => !!open;

  /** o: { genome, dna, stage, title, sub, onHatch(genome, dnaLeft, roll) } */
  S.openEditor = function (o) {
    const base = o.genome, draft = S.cloneGenome(base), stage = o.stage || 1;
    let dna = o.dna, named = false, phase = 'edit', roll = null;
    const added = {}; // parts bought this visit (full refund on removal)
    const wrap = document.createElement('div'); wrap.className = 'over'; wrap.id = 'editor';
    wrap.innerHTML =
      '<div class="editor" role="dialog" aria-label="The egg: change your creature">' +
      '<div class="ed-stage"><canvas id="edCv"></canvas>' +
      '<div class="ed-name"><input id="edName" aria-label="Species name" maxlength="40"><div class="meta" id="edMeta"></div></div>' +
      '<div class="ed-stats" id="edStats"></div></div>' +
      '<div class="ed-side">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><div><h3>' + S.esc(o.title || 'The egg') + '</h3><div class="note" style="margin-top:2px">' + S.esc(o.sub || '') + '</div></div><div class="ed-dna"><span id="edDna"></span> <small>DNA</small></div></div>' +
      '<div><h3 style="margin-bottom:6px">Parts</h3><div class="parts" id="edParts"></div></div>' +
      '<div><h3 style="margin-bottom:6px">Carried <span class="note" style="text-transform:none;letter-spacing:0">(click to drop one)</span></h3><div class="have" id="edHave"></div></div>' +
      '<div class="sliders">' +
      '<label for="edSegs">Length<input type="range" id="edSegs" min="5" max="12" step="1"><output id="edSegsO"></output></label>' +
      '<label for="edGirth">Girth<input type="range" id="edGirth" min="3" max="8" step="1"><output id="edGirthO"></output></label></div>' +
      '<div><h3 style="margin-bottom:6px">Colour</h3><div class="swatches" id="edHue"></div></div>' +
      '<div><h3 style="margin-bottom:6px">Skin</h3><div class="pat" id="edPat"></div></div>' +
      '<div class="roll" id="edRoll" aria-live="polite"></div>' +
      '<div class="ed-go"><span class="note" id="edNote">Hatching rolls one random mutation.</span><button class="btn big" id="edGo" type="button">Hatch</button></div>' +
      '</div></div>';
    S.$('eye').appendChild(wrap);
    const $ = (id) => wrap.querySelector('#' + id);
    const nameEl = $('edName'); nameEl.value = draft.name;
    nameEl.addEventListener('input', () => { draft.name = nameEl.value || draft.name; named = true; });
    const segs = $('edSegs'), girth = $('edGirth');
    segs.value = draft.segs; girth.value = draft.girth;
    segs.addEventListener('input', () => { draft.segs = +segs.value; changed(); });
    girth.addEventListener('input', () => { draft.girth = +girth.value; changed(); });
    $('edHue').innerHTML = HUES.map((h) => '<button type="button" data-h="' + h + '" style="background:' + S.hsl(h, 70, 58) + '" aria-label="hue ' + h + '"></button>').join('');
    $('edHue').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; draft.hue = +b.dataset.h; draft.hue2 = (draft.hue + 170) % 360; changed(); S.sfx.play('click'); });
    $('edPat').innerHTML = S.PATTERNS.map((p) => '<button class="btn" type="button" data-p="' + p + '">' + p + '</button>').join('');
    $('edPat').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; draft.pattern = b.dataset.p; changed(); S.sfx.play('click'); });
    $('edParts').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-part]'); if (!b || b.disabled || phase !== 'edit') return;
      const p = b.dataset.part; draft.parts.push(p); dna -= S.PARTS[p].cost; added[p] = (added[p] || 0) + 1;
      S.sfx.play('dna'); changed();
    });
    $('edHave').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]'); if (!b || phase !== 'edit') return;
      const i = +b.dataset.i, p = draft.parts[i]; draft.parts.splice(i, 1);
      if (added[p]) { added[p]--; dna += S.PARTS[p].cost; } else dna += Math.floor(S.PARTS[p].cost / 2);
      S.sfx.play('click'); changed();
    });

    const prev = new S.Creature(draft, 0, 0, { h: 0, stage, scale: 1 });
    const baseSt = S.statsOf(base, stage);
    function changed() {
      prev.g = draft; prev.rebuild();
      render();
    }
    function render() {
      $('edDna').textContent = dna;
      $('edSegsO').textContent = draft.segs; $('edGirthO').textContent = draft.girth;
      [...$('edHue').children].forEach((b) => b.classList.toggle('on', +b.dataset.h === draft.hue));
      [...$('edPat').children].forEach((b) => b.classList.toggle('on', b.dataset.p === draft.pattern));
      $('edParts').innerHTML = S.PART_ORDER.map((p) => {
        const P = S.PARTS[p], have = S.count(draft, p), locked = P.from && stage < P.from;
        const dis = locked || have >= P.max || dna < P.cost || phase !== 'edit';
        return '<button class="part" type="button" data-part="' + p + '"' + (dis ? ' disabled' : '') + '><b>' + P.name + '<i>' + P.cost + '</i></b><span>' + (locked ? 'Grows from stage ' + P.from + '.' : P.desc) + '</span><span class="n">' + (have ? have + ' of ' + P.max : P.slot) + '</span></button>';
      }).join('');
      $('edHave').innerHTML = draft.parts.length ? draft.parts.map((p, i) => '<button type="button" data-i="' + i + '">' + S.PARTS[p].name + (added[p] ? '' : ' ·½') + '</button>').join('') : '<span class="note">Nothing yet: a bare tube that eats.</span>';
      const st = S.statsOf(draft, stage);
      $('edStats').innerHTML = S.statLines(st).map(([k, v]) => {
        const b = S.statLines(baseSt).find((x) => x[0] === k)[1];
        const d = typeof v === 'number' && typeof b === 'number' ? v - b : 0;
        return '<div><span>' + k + '</span><b' + (d ? ' style="color:' + (d > 0 ? 'var(--good)' : 'var(--hurt)') + '"' : '') + '>' + v + '</b></div>';
      }).join('');
      const cells = draft.conn ? draft.conn.neuronCount : 302;
      const ev = draft.conn ? draft.conn.n - draft.conn.muscleEnd : 0;
      const newParts = Object.values(added).reduce((a, b) => a + b, 0);
      $('edMeta').textContent = 'generation ' + (base.gen + 1) + ' · ' + cells + ' cells' + (ev ? ' + ' + ev + ' evolved' : '') + (newParts ? ' · +' + newParts + ' new on hatching' : '');
      if (!named) nameEl.value = draft.name;
    }
    render();

    $('edGo').addEventListener('click', () => {
      if (phase === 'edit') {
        phase = 'roll'; render();
        // one new nerve cell per part bought
        for (const p in added) for (let k = 0; k < added[p]; k++) S.addCell(draft, S.PARTS[p].name, S.PARTS[p].cell);
        const before = draft.parts.length;
        roll = S.mutate(draft, stage);
        if (roll.part && draft.parts.length > before) S.addCell(draft, S.PARTS[roll.part].name, S.PARTS[roll.part].cell);
        if (!named && !o.keepName) draft.name = S.speciesName(draft);
        const fake = ['a second pair of eyes?', 'a longer tail?', 'a new wire?', 'brighter skin?', 'a lost part?', 'one more segment?'];
        let k = 0; const el = $('edRoll'); $('edGo').disabled = true;
        const spin = setInterval(() => { el.textContent = 'Nature rolls… ' + fake[k++ % fake.length]; S.sfx.play('click'); }, 110);
        setTimeout(() => {
          clearInterval(spin); S.sfx.play('mut');
          el.innerHTML = '<span style="color:' + (roll.tone === 'good' ? 'var(--good)' : roll.tone === 'bad' ? 'var(--hurt)' : 'var(--label)') + '">' + S.esc(roll.text) + '</span>';
          prev.rebuild(); nameEl.value = draft.name; render();
          $('edGo').disabled = false; $('edGo').textContent = 'Into the world'; $('edNote').textContent = '';
          phase = 'done';
        }, 1300);
      } else if (phase === 'done') {
        close();
        draft.gen = base.gen + 1;
        S.sfx.play('hatch');
        o.onHatch(draft, dna, roll);
      }
    });

    // the preview swims a slow figure of eight
    const cv = $('edCv'), ctx = cv.getContext('2d');
    let t0 = performance.now(), raf = 0, t = 0;
    function frame(now) {
      const dt = Math.min(0.05, (now - t0) / 1000); t0 = now; t += dt;
      const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const want = Math.atan2(Math.cos(t * 0.5) * 60 - prev.y, Math.sin(t * 0.7) * 90 - prev.x);
      prev.steer(dt, want, 0.35); prev.physics(dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const sc = Math.min(w, h) / 120;
      ctx.translate(w / 2, h / 2 + 6); ctx.scale(sc, sc);
      prev.draw(ctx, t);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    function close() { cancelAnimationFrame(raf); wrap.remove(); open = null; }
    open = { close, wrap };
    $('edGo').focus();
  };
})(SQ);
