/* SQUIRM — the rail: the specimen label, the brain panel (every cell, lit as it fires, left = senses, right = muscles),
 * the stage's own panel and the keys. */
(function (S) {
  const GL = window.WormGloss;
  const COLS = [
    ['sense', ['smell', 'touch', 'pain']], ['inter', ['inter']], ['cmd', ['command']], ['head', ['headmotor']],
    ['body', ['motorA', 'motorB', 'motorD']], ['gut', ['pharynx', 'egg']], ['new', ['new']]
  ];
  S.GROUP_COLOUR = { smell: '#62e3b5', touch: '#7cc7ff', pain: '#ff5d73', inter: '#c9b6ff', command: '#ffffff', headmotor: '#ffae4a', motorA: '#ff8fb1', motorB: '#ffd36e', motorD: '#9fa8da', pharynx: '#8de0ff', egg: '#e0b0ff', new: '#ffc94d' };

  const cv = S.$('brainCv'), ctx = cv.getContext('2d');
  const B = { conn: null, n: 0, pos: null, grp: null, glow: null, L: 0, R: 0, labels: [] };

  /** Lay the cells out in columns by what they are for. Recomputed when the brain grows. */
  function layout(c) {
    const w = cv.clientWidth || 284, h = cv.clientHeight || 150, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pitch = 5.2, top = 4, rows = Math.floor((h - 22) / pitch), muscleW = 22;
    const byCol = COLS.map(() => []);
    const grp = new Array(c.n);
    for (let i = 0; i < c.n; i++) {
      if (i >= c.neuronCount && i < (c.muscleEnd || c.n)) { grp[i] = 'muscle'; continue; }
      const gname = GL.group(c.names[i]); grp[i] = gname;
      for (let k = 0; k < COLS.length; k++) if (COLS[k][1].indexOf(gname) >= 0) { byCol[k].push(i); break; }
    }
    const widths = byCol.map((l) => Math.ceil(l.length / rows));
    const total = widths.reduce((a, b) => a + b, 0) + COLS.length - 1;
    const pitchX = Math.min(pitch + 1, (w - muscleW - 6) / Math.max(1, total));
    const pos = new Array(c.n); let x = 3; B.labels = [];
    byCol.forEach((list, k) => {
      if (!list.length) return;
      list.forEach((i, j) => { pos[i] = { x: x + Math.floor(j / rows) * pitchX, y: top + (j % rows) * pitch }; });
      B.labels.push({ x: x, w: widths[k] * pitchX, t: COLS[k][0] });
      x += (widths[k] + 1) * pitchX;
    });
    B.conn = c; B.n = c.n; B.pos = pos; B.grp = grp; B.glow = new Float32Array(c.n); B.w = w; B.h = h; B.mx = w - muscleW + 2;
  }

  /** Paint the brain. brain: a WormEngine.Brain (or null). */
  S.drawBrain = function (brain, g) {
    if (!brain) return;
    const c = brain.c;
    if (B.conn !== c || B.n !== c.n || B.w !== (cv.clientWidth || 284)) layout(c);
    const w = B.w, h = B.h, glow = B.glow;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < c.n; i++) {
      const p = B.pos[i]; if (!p) continue;
      glow[i] = brain.fired[i] ? 1 : glow[i] * 0.86;
      const gl = glow[i], gname = B.grp[i];
      if (gl > 0.05) { ctx.fillStyle = S.GROUP_COLOUR[gname] || '#fff'; ctx.globalAlpha = 0.35 + gl * 0.65; ctx.fillRect(p.x - (gl > 0.6 ? 0.6 : 0), p.y - (gl > 0.6 ? 0.6 : 0), gl > 0.6 ? 4.6 : 3.4, gl > 0.6 ? 4.6 : 3.4); }
      else { ctx.globalAlpha = 1; ctx.fillStyle = gname === 'new' ? 'rgba(255,201,77,.45)' : 'rgba(150,165,210,.22)'; ctx.fillRect(p.x, p.y, 3.4, 3.4); }
    }
    ctx.globalAlpha = 1;
    // the two muscle sums Busbice drove his wheels with
    B.L += (brain.L - B.L) * 0.3; B.R += (brain.R - B.R) * 0.3;
    const mid = (h - 22) / 2 + 4, sc = (h - 30) / 2 / 160;
    [['L', B.L, B.mx], ['R', B.R, B.mx + 10]].forEach(([lab, v, x]) => {
      const hh = S.clamp(v * sc, -(h - 30) / 2, (h - 30) / 2);
      ctx.fillStyle = 'rgba(150,165,210,.15)'; ctx.fillRect(x, 4, 7, h - 26);
      ctx.fillStyle = v >= 0 ? '#ffd36e' : '#ff8fb1'; ctx.fillRect(x, hh >= 0 ? mid - hh : mid, 7, Math.abs(hh));
      ctx.fillStyle = '#8d97b8'; ctx.font = '9px "IBM Plex Mono", monospace'; ctx.fillText(lab, x + 1, h - 4);
    });
    ctx.fillStyle = '#8d97b8'; ctx.font = '9px "IBM Plex Mono", monospace';
    let right = -1;
    for (const l of B.labels) { const tw = ctx.measureText(l.t).width; if (l.x > right + 3 && tw <= l.w + 10) { ctx.fillText(l.t, l.x, h - 4); right = l.x + tw; } }
  };

  /** "smell 4 · command AVBL · body motor, forward 11", and any evolved cell by name. */
  S.firingWords = function (brain, g) {
    const c = brain.c, counts = {}, names = {}, added = [];
    let any = false;
    for (let i = 0; i < c.n; i++) {
      if (!brain.fired[i]) continue; any = true;
      const nm = c.names[i];
      if (i >= (c.muscleEnd || c.n)) { added.push(nm); continue; }
      const gr = GL.group(nm); counts[gr] = (counts[gr] || 0) + 1; (names[gr] = names[gr] || []).push(nm);
    }
    if (!any) return 'quiet';
    const parts = [];
    if (added.length) parts.push('<b style="color:#ffc94d">' + added.slice(0, 2).map((n) => S.esc(n + ' (' + ((g && g.cellOf[n]) || 'evolved').split(' · ')[0] + ')')).join(', ') + '</b>');
    if (names.command) parts.push('<b>' + names.command.slice(0, 3).join(' ') + '</b> ' + (names.command.some((n) => /^AV[ADE]/.test(n)) ? 'back up' : 'go'));
    for (const gr of ['pain', 'smell', 'touch', 'motorB', 'motorA', 'headmotor', 'inter']) if (counts[gr]) parts.push(GL.groupLabel(gr) + ' ' + counts[gr]);
    return parts.slice(0, 5).join(' · ');
  };

  S.setKeys = function (rows) { S.setHtml(S.$('keys'), rows.map((r) => '<span>' + r[0] + '</span><span>' + r[1] + '</span>').join('')); };
  S.setStagePanel = function (html) { const el = S.$('stagePanel'); el.hidden = !html; S.setHtml(el, html || ''); };

  /** The slide label. info: { slide, name, gen, size, meta, hp, hpMax, grow, growMax, growLabel } */
  S.setSpecimen = function (o) {
    S.$('slideNo').textContent = o.slide;
    S.$('sizeUm').textContent = o.size;
    S.$('spName').textContent = o.name;
    S.setHtml(S.$('spMeta'), o.meta || '');
    S.$('hpBar').style.width = Math.max(0, Math.min(100, (o.hp / o.hpMax) * 100)) + '%';
    S.$('hpTxt').textContent = Math.max(0, Math.ceil(o.hp)) + '/' + o.hpMax;
    S.$('growLbl').textContent = o.growLabel || 'growth';
    S.$('growBar').style.width = Math.max(0, Math.min(100, (o.grow / o.growMax) * 100)) + '%';
    S.$('growTxt').textContent = o.growText || Math.floor(o.grow) + '/' + o.growMax;
  };
  S.setCellCount = function (g) {
    const c = g && g.conn; if (!c) return;
    const added = c.n - (c.muscleEnd || c.n), base = c.neuronCount;
    S.$('cellCount').textContent = base + ' cells' + (added ? ' + ' + added + ' evolved' : '');
  };
  S.setDial = function (mag, stage, sub) { S.$('hudMag').textContent = mag; S.$('hudStage').textContent = stage; S.$('hudSub').textContent = sub; };
  S.setDna = function (n) { S.$('hudDna').textContent = Math.floor(n); };
})(SQ);
