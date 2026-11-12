/* SQUIRM — creatures: the genome (body plan + a real connectome), its parts, its numbers, its mutations, and how it moves
 * and looks. The body crawls the way C. elegans does: the head snakes side to side and the body follows its own trail. */
(function (S) {
  const E = window.WormEngine, GL = window.WormGloss;
  S.BASE = new E.Connectome(window.CONNECTOME);

  // slot: where it sits. cell: the sensory cell its new neuron is spliced after. max: how many one body carries.
  S.PARTS = {
    jaws:   { name: 'Jaws',          slot: 'head', cost: 15, max: 1, cell: 'IL1VL', desc: 'Bite other creatures. Lets you eat meat.', latin: 'mordax' },
    filter: { name: 'Filter mouth',  slot: 'head', cost: 8,  max: 1, cell: 'ADFL',  desc: 'A sweeping fringe. Bacteria are worth double.', latin: 'colans' },
    eye:    { name: 'Eyespot',       slot: 'head', cost: 10, max: 2, cell: 'AWCL',  desc: 'See and smell from further away.', latin: 'oculata' },
    cilia:  { name: 'Cilia',         slot: 'body', cost: 10, max: 4, cell: 'AVBL',  desc: 'Rows of beating hairs. Faster.', latin: 'velox' },
    spines: { name: 'Spines',        slot: 'body', cost: 12, max: 4, cell: 'PLML',  desc: 'Whatever bites you gets hurt.', latin: 'spinosa' },
    shell:  { name: 'Cuticle plate', slot: 'body', cost: 12, max: 3, cell: 'ALML',  desc: 'Armour and health. A little slower.', latin: 'loricata' },
    glow:   { name: 'Glow organ',    slot: 'tail', cost: 8,  max: 1, cell: 'ASKL',  desc: 'Lures food to you. Others find you charming.', latin: 'lucida' },
    sting:  { name: 'Stinger',       slot: 'tail', cost: 15, max: 1, cell: 'PVDL',  desc: 'Bites leave poison that keeps hurting.', latin: 'aculeata' },
    legs:   { name: 'Legs',          slot: 'body', cost: 14, max: 3, cell: 'AVBR',  desc: 'A pair of legs. Much faster on land.', latin: 'pedata', from: 2 },
    song:   { name: 'Song sac',      slot: 'head', cost: 12, max: 1, cell: 'ASIL',  desc: 'A throat that sings. Charming is easier.', latin: 'cantans', from: 2 },
    horn:   { name: 'Horn',          slot: 'head', cost: 14, max: 1, cell: 'FLPL',  desc: 'A ram. Bites hit harder.', latin: 'cornuta', from: 2 }
  };
  S.PART_ORDER = ['jaws', 'filter', 'eye', 'cilia', 'spines', 'shell', 'glow', 'sting', 'legs', 'song', 'horn'];
  S.PATTERNS = ['glass', 'plain', 'stripes', 'bands', 'spots'];
  const GENERA = ['Squirmus', 'Vermiculus', 'Glissandra', 'Nemata', 'Wriggla', 'Spirella', 'Twistia', 'Lumbricella', 'Caenorhabdella', 'Sinuosa', 'Undulina', 'Filaria'];

  S.count = (g, type) => g.parts.reduce((n, p) => n + (p === type ? 1 : 0), 0);

  S.makeGenome = function (o) {
    o = o || {};
    const g = {
      name: '', hue: o.hue != null ? o.hue : S.ri(0, 359), hue2: 0, pattern: o.pattern || 'glass',
      segs: o.segs || 7, girth: o.girth || 5, parts: (o.parts || []).slice(), conn: null, cellOf: {}, nextCell: 1, gen: 1
    };
    g.hue2 = o.hue2 != null ? o.hue2 : (g.hue + S.pick([40, 150, 180, 200])) % 360;
    if (o.brain) g.conn = S.BASE.clone();
    g.name = o.name || S.speciesName(g);
    return g;
  };
  S.cloneGenome = function (g) {
    const c = JSON.parse(JSON.stringify({ name: g.name, hue: g.hue, hue2: g.hue2, pattern: g.pattern, segs: g.segs, girth: g.girth, parts: g.parts, cellOf: g.cellOf, nextCell: g.nextCell, gen: g.gen }));
    c.conn = g.conn ? g.conn.clone() : null;
    return c;
  };
  S.speciesName = function (g) {
    const genus = S.pick(GENERA);
    let best = null, n = 0;
    for (const k of S.PART_ORDER) { const c = S.count(g, k); if (c > n) { n = c; best = k; } }
    return genus + ' ' + (best ? S.PARTS[best].latin : S.pick(['simplex', 'primus', 'vulgaris', 'nudus']));
  };

  /** A new nerve cell for a new part: spliced into one of the part's sensory cell's own synapses, the NEAT way. */
  S.addCell = function (g, label, preName) {
    const c = g.conn; if (!c) return null;
    let pi = c.index[preName];
    if (pi === undefined || !c.rowT[pi].length) { do { pi = S.ri(0, c.neuronCount - 1); } while (!c.rowT[pi].length); }
    const post = c.names[c.rowT[pi][S.ri(0, c.rowT[pi].length - 1)]];
    const name = 'N' + g.nextCell++;
    c.addNeuron(name, c.names[pi], post);
    g.cellOf[name] = label + ' · between ' + c.names[pi] + ' and ' + post;
    return { name, pre: c.names[pi], post };
  };

  /** Numbers the game runs on. stage changes what legs are worth. */
  S.statsOf = function (g, stage) {
    const k = (t) => S.count(g, t);
    const st = {
      speed: 92 - (g.girth - 5) * 4 - Math.max(0, g.segs - 8) * 2 + k('cilia') * 15 - k('shell') * 6,
      turn: 3.4, hp: 20 + g.segs * 2.5 + g.girth * 2 + k('shell') * 22, armor: Math.min(0.45, k('shell') * 0.13),
      bite: 2 + g.girth * 0.4 + k('jaws') * 8 + k('horn') * 6, meat: k('jaws') > 0, sense: 150 + k('eye') * 70,
      thorns: k('spines') * 3, poison: k('sting') * 3, charm: k('glow') + k('song') * 2, lure: k('glow'), graze: 1 + k('filter'), legs: k('legs')
    };
    if (stage >= 2) { st.speed = st.speed * 0.72 + k('legs') * 26; st.turn = 3 + Math.min(2, k('legs') * 0.6); }
    st.speed = Math.max(40, st.speed);
    st.hp = Math.round(st.hp); st.bite = Math.round(st.bite * 10) / 10;
    return st;
  };
  S.statLines = (st) => [['speed', Math.round(st.speed)], ['health', st.hp], ['bite', st.bite], ['armour', Math.round(st.armor * 100) + '%'], ['senses', st.sense], ['charm', st.charm], ['spines', st.thorns], ['poison', st.poison], ['diet', st.meat ? 'meat + plants' : 'bacteria']];

  /** Nature's roll at hatching: one change nobody chose. Returns { text, tone: 'good' | 'bad' | 'odd' }. */
  S.mutate = function (g, stage) {
    const body = g.parts.filter((p) => S.PARTS[p].slot === 'body');
    const options = [
      { w: 3, ok: () => body.length > 0, run: () => { const p = S.pick(body); if (S.count(g, p) >= S.PARTS[p].max) return null; g.parts.push(p); return { text: 'A copying slip: a second ' + S.PARTS[p].name.toLowerCase() + ', free.', tone: 'good', part: p }; } },
      { w: 2, ok: () => g.parts.length > 1, run: () => { const i = S.ri(0, g.parts.length - 1), p = g.parts[i]; g.parts.splice(i, 1); return { text: 'A gene broke: the ' + S.PARTS[p].name.toLowerCase() + ' did not grow. Its nerve cell stays, wired to nothing useful.', tone: 'bad' }; } },
      { w: 2, ok: () => g.segs < 12, run: () => { g.segs++; return { text: 'One more segment. Longer, tougher.', tone: 'good' }; } },
      { w: 1, ok: () => g.segs > 5, run: () => { g.segs--; return { text: 'One segment fewer. Shorter, nimbler.', tone: 'odd' }; } },
      { w: 2, ok: () => true, run: () => { const d = S.pick([-50, -30, 30, 50]); g.hue = (g.hue + d + 360) % 360; return { text: 'A pigment drifted ' + (d > 0 ? 'warmer' : 'cooler') + '. Purely cosmetic. Probably.', tone: 'odd' }; } },
      { w: 1, ok: () => true, run: () => { const p = S.pick(S.PATTERNS.filter((x) => x !== g.pattern)); g.pattern = p; return { text: 'A new skin: ' + p + '.', tone: 'odd' }; } },
      { w: 1, ok: () => g.girth < 8, run: () => { g.girth++; return { text: 'Thicker-bodied: more health, a harder bite, a little slower.', tone: 'good' }; } },
      { w: 3, ok: () => !!g.conn, run: () => { const c = S.addCell(g, 'a spare', null); return { text: 'A new nerve cell, ' + c.name + ', grew between ' + c.pre + ' and ' + c.post + '. Watch the brain panel for it.', tone: 'odd' }; } },
      { w: 3, ok: () => !!g.conn, run: () => {
        const c = g.conn, sense = ['ASHL', 'ASHR', 'ADFL', 'AWCL', 'ASKR', 'FLPL', 'PLML', 'ALMR'], targets = ['AVAL', 'AVAR', 'AVBL', 'AVBR', 'AIYL', 'AIZR', 'RIML', 'PVCL'];
        const pre = S.pick(sense), post = S.pick(targets), w = S.pick([-1, 1]) * S.ri(6, 22);
        if (c.index[pre] === undefined || c.index[post] === undefined) return null;
        c.addSynapse(pre, post, w); return { text: 'A new wire: ' + pre + ' (' + GL.words(pre) + ') now ' + (w > 0 ? 'excites' : 'inhibits') + ' ' + post + ' (' + GL.words(post) + ').', tone: 'odd' };
      } }
    ];
    for (let tries = 0; tries < 12; tries++) {
      const live = options.filter((o) => o.ok()), tot = live.reduce((s, o) => s + o.w, 0);
      let r = Math.random() * tot, o = live[0];
      for (const x of live) { r -= x.w; if (r <= 0) { o = x; break; } }
      const res = o.run(); if (res) return res;
    }
    return { text: 'Nothing changed this time.', tone: 'odd' };
  };

  // ─────────────────────────────── the creature ───────────────────────────────
  class Creature {
    constructor(g, x, y, o) {
      o = o || {};
      this.g = g; this.x = x; this.y = y; this.h = o.h != null ? o.h : S.rr(-Math.PI, Math.PI);
      this.v = 0; this.phase = S.rr(0, 6); this.scale = o.scale || 1; this.stage = o.stage || 1;
      this.kind = o.kind || 'npc'; this.team = o.team || 0; this.cd = 0; this.flash = 0; this.poison = 0; this.biteAnim = 0; this.singing = 0;
      this.dead = false; this.spine = []; this.age = 0;
      this.rebuild();
      this.hp = this.st.hp;
    }
    rebuild() {
      const g = this.g; this.st = S.statsOf(g, this.stage);
      this.r = g.girth * this.scale; this.n = g.segs * 2 + 2; this.gap = this.r * 0.62;
      const s = this.spine;
      while (s.length < this.n) { const last = s[s.length - 1] || { x: this.x, y: this.y }; s.push({ x: last.x - Math.cos(this.h) * this.gap, y: last.y - Math.sin(this.h) * this.gap }); }
      s.length = this.n;
      if (this.hp > this.st.hp) this.hp = this.st.hp;
    }
    get length() { return this.n * this.gap; }
    /** ang: the direction it wants (null keeps its heading). thr: -1..1, negative backs up. */
    steer(dt, ang, thr) {
      if (ang != null) { const d = S.wrap(ang - this.h), m = this.st.turn * dt * (thr < 0 ? 0.6 : 1); this.h += S.clamp(d, -m, m); }
      const slow = this.poison > 0 ? 0.8 : 1;
      const target = this.st.speed * S.clamp(thr, -0.5, 1) * slow * (this.boost > 0 ? 1.8 : 1);
      this.v += (target - this.v) * Math.min(1, dt * 5);
    }
    physics(dt) {
      this.age += dt;
      const legs = this.st.legs, A = legs ? 0.18 : 0.62, sp = Math.abs(this.v) / Math.max(1, this.st.speed);
      this.phase += dt * (2 + sp * 9);
      const dir = this.h + Math.sin(this.phase) * A * Math.min(1, sp + 0.1);
      this.x += Math.cos(dir) * this.v * dt; this.y += Math.sin(dir) * this.v * dt;
      const s = this.spine; s[0].x = this.x; s[0].y = this.y;
      for (let i = 1; i < s.length; i++) {
        const dx = s[i].x - s[i - 1].x, dy = s[i].y - s[i - 1].y, d = Math.hypot(dx, dy) || 1;
        if (this.v < 0 && i === 1) { s[i].x = s[0].x - Math.cos(this.h) * this.gap; s[i].y = s[0].y - Math.sin(this.h) * this.gap; continue; }
        s[i].x = s[i - 1].x + (dx / d) * this.gap; s[i].y = s[i - 1].y + (dy / d) * this.gap;
      }
      if (this.cd > 0) this.cd -= dt;
      if (this.flash > 0) this.flash -= dt;
      if (this.biteAnim > 0) this.biteAnim -= dt * 4;
      if (this.singing > 0) this.singing -= dt;
      if (this.boost > 0) this.boost -= dt;
      if (this.poison > 0) { this.poison -= dt; this.hp -= dt * 2.2; }
    }
    mouth() { return { x: this.x + Math.cos(this.h) * this.r * 1.1, y: this.y + Math.sin(this.h) * this.r * 1.1 }; }
    /** The index of the body point nearest (px, py) when within reach, or -1. */
    touches(px, py, reach) {
      let best = -1, bd = 1e9;
      for (let i = 0; i < this.spine.length; i += 2) { const p = this.spine[i], d = Math.hypot(p.x - px, p.y - py); if (d < bd) { bd = d; best = i; } }
      return bd < this.r * 1.05 + reach ? best : -1;
    }
    teleport(x, y) { this.x = x; this.y = y; this.v = 0; for (const p of this.spine) { p.x = x; p.y = y; } this.spine.length = 0; this.rebuild(); }

    // ── drawing ──
    radiusAt(u) { return this.r * (u < 0.18 ? 0.86 + 0.14 * (u / 0.18) : 1 - 0.62 * Math.pow((u - 0.18) / 0.82, 1.25)); }
    draw(ctx, t, o) {
      o = o || {};
      const g = this.g, s = this.spine, n = s.length, hue = g.hue, alpha = o.alpha == null ? 1 : o.alpha;
      const R = []; for (let i = 0; i < n; i++) R.push(this.radiusAt(i / (n - 1)));
      ctx.save(); ctx.globalAlpha = alpha;
      // halo: dark-field light scattering off the cuticle
      if (!o.flat) {
        ctx.globalCompositeOperation = 'lighter';
        const glow = 0.06 + (S.count(g, 'glow') ? 0.05 : 0);
        ctx.fillStyle = S.hsl(hue, 90, 60, glow);
        for (let i = 0; i < n; i += 2) { ctx.beginPath(); ctx.arc(s[i].x, s[i].y, R[i] * 2.3, 0, 6.283); ctx.fill(); }
        ctx.globalCompositeOperation = 'source-over';
      }
      this.drawParts(ctx, t, R, 'under');
      // outline then fill: the outline only shows outside the union of circles
      ctx.fillStyle = this.flash > 0 ? '#ff5d73' : S.hsl(hue, 55, o.flat ? 25 : 10, 1);
      for (let i = n - 1; i >= 0; i--) { ctx.beginPath(); ctx.arc(s[i].x, s[i].y, R[i] + Math.max(0.8, this.r * 0.16), 0, 6.283); ctx.fill(); }
      const pat = g.pattern;
      for (let i = n - 1; i >= 0; i--) {
        const u = i / (n - 1); let l = 62 - u * 16, sat = 72, h = hue, a = 1;
        if (pat === 'glass') { a = 0.55; l = 70 - u * 10; sat = 55; }
        else if (pat === 'stripes' && Math.floor(i / 2) % 2) h = g.hue2;
        else if (pat === 'bands' && i % 4 === 2) l -= 26;
        ctx.fillStyle = S.hsl(h, sat, l, a);
        ctx.beginPath(); ctx.arc(s[i].x, s[i].y, R[i], 0, 6.283); ctx.fill();
      }
      if (pat === 'glass') { // the gut: dark-field shows a nematode's insides
        ctx.strokeStyle = S.hsl(g.hue2, 70, 62, 0.75); ctx.lineWidth = this.r * 0.32; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s[1].x, s[1].y); for (let i = 2; i < n - 2; i++) ctx.lineTo(s[i].x, s[i].y); ctx.stroke();
        ctx.fillStyle = S.hsl(g.hue2, 80, 75, 0.9); ctx.beginPath(); ctx.arc(s[1].x, s[1].y, this.r * 0.32, 0, 6.283); ctx.fill();
      }
      if (pat === 'spots') {
        ctx.fillStyle = S.hsl(g.hue2, 80, 70, 0.95);
        for (let i = 2; i < n - 2; i += 3) { const nx = this.normal(i); const side = i % 2 ? 1 : -1; ctx.beginPath(); ctx.arc(s[i].x + nx.x * R[i] * 0.45 * side, s[i].y + nx.y * R[i] * 0.45 * side, R[i] * 0.28, 0, 6.283); ctx.fill(); }
      }
      // a highlight down one flank
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      for (let i = 0; i < n - 2; i += 2) { const nx = this.normal(i); ctx.beginPath(); ctx.arc(s[i].x + nx.x * R[i] * 0.4, s[i].y + nx.y * R[i] * 0.4, R[i] * 0.32, 0, 6.283); ctx.fill(); }
      this.drawParts(ctx, t, R, 'over');
      if (this.poison > 0) { ctx.fillStyle = 'rgba(140,255,120,0.5)'; for (let i = 0; i < 3; i++) { const p = s[S.ri(0, n - 1)]; ctx.beginPath(); ctx.arc(p.x + S.rr(-4, 4), p.y + S.rr(-4, 4), 1.5 * this.scale, 0, 6.283); ctx.fill(); } }
      ctx.restore();
    }
    dirAt(i) { const s = this.spine, a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)]; return Math.atan2(a.y - b.y, a.x - b.x) || this.h; }
    normal(i) { const d = this.dirAt(i); return { x: -Math.sin(d), y: Math.cos(d) }; }
    /** Where each part sits: head parts at the front, tail parts at the end, body parts spread down the trunk. */
    partSpots() {
      const g = this.g, n = this.spine.length, body = g.parts.filter((p) => S.PARTS[p].slot === 'body'), out = [];
      let eyes = 0, bi = 0;
      for (const p of g.parts) {
        const slot = S.PARTS[p].slot;
        if (slot === 'head') out.push({ p, i: p === 'song' ? 2 : 0, side: p === 'eye' ? (eyes++ ? -1 : 1) : 0, k: eyes });
        else if (slot === 'tail') out.push({ p, i: n - 1, side: 0 });
        else { const u = 0.22 + ((bi + 0.5) / body.length) * 0.56; out.push({ p, i: Math.round(u * (n - 1)), side: 0, k: bi++ }); }
      }
      return out;
    }
    drawParts(ctx, t, R, layer) {
      const s = this.spine, hue = this.g.hue, r = this.r, bone = S.hsl(hue, 25, 88), dark = S.hsl(hue, 50, 18);
      for (const sp of this.partSpots()) {
        const P = s[sp.i], a = this.dirAt(sp.i), nx = -Math.sin(a), ny = Math.cos(a), cx = Math.cos(a), cy = Math.sin(a), Ri = R[sp.i];
        ctx.lineCap = 'round';
        switch (sp.p) {
          case 'jaws': if (layer !== 'over') break; {
            const open = 0.35 + Math.max(0, this.biteAnim) * 0.6 + Math.sin(t * 3 + this.phase) * 0.05;
            ctx.strokeStyle = bone; ctx.lineWidth = Math.max(1.2, r * 0.32);
            for (const sd of [-1, 1]) {
              const bx = P.x + cx * Ri * 0.6 + nx * sd * Ri * 0.5, by = P.y + cy * Ri * 0.6 + ny * sd * Ri * 0.5;
              const ang = a + sd * open;
              ctx.beginPath(); ctx.moveTo(bx, by);
              ctx.quadraticCurveTo(bx + Math.cos(ang) * r * 1.3, by + Math.sin(ang) * r * 1.3, bx + Math.cos(a - sd * 0.5) * r * 1.5 + nx * sd * -r * 0.2, by + Math.sin(a - sd * 0.5) * r * 1.5 + ny * sd * -r * 0.2);
              ctx.stroke();
            }
          } break;
          case 'filter': if (layer !== 'under') break;
            ctx.strokeStyle = S.hsl(this.g.hue2, 80, 75, 0.8); ctx.lineWidth = Math.max(0.6, r * 0.1);
            for (let k = -3; k <= 3; k++) { const ang = a + k * 0.28 + Math.sin(t * 9 + k) * 0.1; ctx.beginPath(); ctx.moveTo(P.x + cx * Ri * 0.7, P.y + cy * Ri * 0.7); ctx.lineTo(P.x + Math.cos(ang) * r * 1.9, P.y + Math.sin(ang) * r * 1.9); ctx.stroke(); }
            break;
          case 'eye': if (layer !== 'over') break; {
            const ex = P.x + cx * Ri * 0.25 + nx * sp.side * Ri * 0.55, ey = P.y + cy * Ri * 0.25 + ny * sp.side * Ri * 0.55;
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, Ri * 0.38, 0, 6.283); ctx.fill();
            ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex + cx * Ri * 0.12, ey + cy * Ri * 0.12, Ri * 0.2, 0, 6.283); ctx.fill();
          } break;
          case 'cilia': if (layer !== 'under') break;
            ctx.strokeStyle = S.hsl(hue, 70, 78, 0.75); ctx.lineWidth = Math.max(0.5, r * 0.09);
            for (let k = -2; k <= 2; k++) {
              const q = s[S.clamp(sp.i + k, 0, s.length - 1)];
              for (const sd of [-1, 1]) { const w = Math.sin(t * 14 + k + sp.i) * 0.5; const ang = a + sd * (Math.PI / 2 + 0.3 + w * sd); ctx.beginPath(); ctx.moveTo(q.x + nx * sd * Ri * 0.8, q.y + ny * sd * Ri * 0.8); ctx.lineTo(q.x + Math.cos(ang) * Ri * 2.1, q.y + Math.sin(ang) * Ri * 2.1); ctx.stroke(); }
            }
            break;
          case 'spines': if (layer !== 'under') break;
            ctx.fillStyle = bone;
            for (const k of [-1, 1]) {
              const q = s[S.clamp(sp.i + k, 0, s.length - 1)];
              for (const sd of [-1, 1]) {
                const bx = q.x + nx * sd * Ri * 0.7, by = q.y + ny * sd * Ri * 0.7, ang = a + sd * 2.1;
                ctx.beginPath(); ctx.moveTo(bx + cx * Ri * 0.35, by + cy * Ri * 0.35); ctx.lineTo(bx - cx * Ri * 0.35, by - cy * Ri * 0.35); ctx.lineTo(bx + Math.cos(ang) * Ri * 1.5, by + Math.sin(ang) * Ri * 1.5); ctx.closePath(); ctx.fill();
              }
            }
            break;
          case 'shell': if (layer !== 'over') break;
            ctx.fillStyle = S.hsl(this.g.hue2, 35, 38, 0.92); ctx.strokeStyle = S.hsl(this.g.hue2, 40, 70, 0.8); ctx.lineWidth = Math.max(0.6, r * 0.12);
            ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, Ri * 1.5, Ri * 1.08, 0, 0, 6.283); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-Ri * 1.2, 0); ctx.lineTo(Ri * 1.2, 0); ctx.stroke(); ctx.restore();
            break;
          case 'glow': if (layer !== 'over') break; {
            const pulse = 0.75 + Math.sin(t * 4 + this.phase) * 0.25;
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const gr = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, r * 3.2 * pulse);
            gr.addColorStop(0, S.hsl(this.g.hue2, 100, 80, 0.9)); gr.addColorStop(1, S.hsl(this.g.hue2, 100, 60, 0));
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(P.x, P.y, r * 3.2 * pulse, 0, 6.283); ctx.fill(); ctx.restore();
            ctx.fillStyle = S.hsl(this.g.hue2, 100, 85); ctx.beginPath(); ctx.arc(P.x, P.y, r * 0.55, 0, 6.283); ctx.fill();
          } break;
          case 'sting': if (layer !== 'under') break;
            ctx.strokeStyle = S.hsl(300, 40, 80); ctx.lineWidth = Math.max(1, r * 0.3);
            ctx.beginPath(); ctx.moveTo(P.x, P.y);
            ctx.quadraticCurveTo(P.x - cx * r * 2.2, P.y - cy * r * 2.2, P.x - cx * r * 1.6 + nx * r * 1.3, P.y - cy * r * 1.6 + ny * r * 1.3); ctx.stroke();
            break;
          case 'legs': if (layer !== 'under') break;
            ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, r * 0.28);
            for (const sd of [-1, 1]) {
              const sw = Math.sin(this.phase * 2 + sp.k * 1.7 + (sd > 0 ? 0 : Math.PI)) * 0.6;
              const hx = P.x + nx * sd * Ri * 0.6, hy = P.y + ny * sd * Ri * 0.6;
              const kx = hx + nx * sd * r * 1.4 + cx * r * sw, ky = hy + ny * sd * r * 1.4 + cy * r * sw;
              const fx = kx + nx * sd * r * 0.6 + cx * r * (sw - 0.6), fy = ky + ny * sd * r * 0.6 + cy * r * (sw - 0.6);
              ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
            }
            break;
          case 'song': if (layer !== 'over') break; {
            const inflate = this.singing > 0 ? 1 + Math.sin(t * 20) * 0.25 : 0.6;
            ctx.fillStyle = S.hsl(this.g.hue2, 70, 70, 0.7); ctx.beginPath(); ctx.arc(P.x + nx * Ri * 0.6, P.y + ny * Ri * 0.6, Ri * 0.75 * inflate, 0, 6.283); ctx.fill();
          } break;
          case 'horn': if (layer !== 'over') break;
            ctx.fillStyle = bone; ctx.beginPath();
            ctx.moveTo(P.x + nx * Ri * 0.45, P.y + ny * Ri * 0.45); ctx.lineTo(P.x - nx * Ri * 0.45, P.y - ny * Ri * 0.45); ctx.lineTo(P.x + cx * r * 2.3, P.y + cy * r * 2.3); ctx.closePath(); ctx.fill();
            break;
        }
      }
    }
  }
  S.Creature = Creature;

  /** A random species for the world to hold: a body plan and a few parts, no brain. */
  S.randomGenome = function (o) {
    o = o || {};
    const parts = [], budget = o.parts != null ? o.parts : S.ri(1, 4), pool = S.PART_ORDER.filter((p) => !S.PARTS[p].from || (o.stage || 1) >= S.PARTS[p].from);
    for (let i = 0; i < budget * 3 && parts.length < budget; i++) { const p = S.pick(pool); if (parts.filter((x) => x === p).length < S.PARTS[p].max) parts.push(p); }
    if (o.jaws && parts.indexOf('jaws') < 0) parts.unshift('jaws');
    return S.makeGenome({ hue: o.hue, segs: o.segs || S.ri(5, 10), girth: o.girth || S.ri(4, 7), parts, pattern: S.pick(S.PATTERNS) });
  };

  /** A portrait of a genome, curled in a small canvas: species lists and the editor use it. */
  S.portrait = function (cv, g, stage) {
    const ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
    cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const c = new Creature(g, 0, 0, { h: 0, stage: stage || 1 });
    const sc = Math.min(w, h) / (c.length + c.r * 4) * 1.3;
    c.spine.forEach((p, i) => { const u = i / (c.n - 1); p.x = (0.5 - u) * c.length * 0.8; p.y = Math.sin(u * 4) * c.r * 1.2; });
    c.x = c.spine[0].x; c.y = c.spine[0].y; c.h = Math.atan2(c.spine[0].y - c.spine[1].y, c.spine[0].x - c.spine[1].x);
    ctx.translate(w / 2, h / 2); ctx.scale(sc, sc); c.draw(ctx, 0, { flat: true });
  };
})(SQ);
