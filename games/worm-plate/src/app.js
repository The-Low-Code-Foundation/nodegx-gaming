(function () {
'use strict';
var E = window.WormEngine, DATA = window.CONNECTOME;
var canvas = document.getElementById('plate'), ctx = canvas.getContext('2d');
var W = 640, H = 640, CX = 320, CY = 320, PR = 300;   // the plate: a 60 mm dish, 10 px per mm
var T = {};
function readTokens() {
  var cs = getComputedStyle(document.documentElement);
  ['bg','paper','fg','muted','line','agar','agar-rim','accent','food','harm','patch','fire','neuron'].forEach(function (n) { T[n] = cs.getPropertyValue('--' + n).trim(); });
}
var rnd = Math.random;
function rr(a, b) { return a + rnd() * (b - a); }
function ri(a, b) { return Math.floor(rr(a, b + 1)); }
function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function randomPoint(margin) { var a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (PR - margin); return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r }; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function clearPlate() {
  ctx.fillStyle = T.paper; ctx.fillRect(0, 0, W, H);
  ctx.beginPath(); ctx.arc(CX, CY, PR, 0, Math.PI * 2); ctx.fillStyle = T.agar; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = T['agar-rim']; ctx.stroke();
}
/** Keep a body inside the dish: past the rim, slide back and turn toward the centre. Returns true on a rim touch. */
function keepIn(b, margin) {
  var d = dist(b.x, b.y, CX, CY), lim = PR - margin;
  if (d > lim) { b.x = CX + (b.x - CX) * lim / d; b.y = CY + (b.y - CY) * lim / d; return true; }
  return false;
}
/** A worm: a sinusoid behind the head, crawling phase from distance travelled. */
function drawWorm(x, y, h, len, width, colour, phase, alpha) {
  var seg = 10, step = len / seg, amp = width * 0.9;
  ctx.save(); ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = width; ctx.strokeStyle = colour;
  var px = Math.cos(h), py = Math.sin(h), nx = -py, ny = px;
  for (var i = 0; i <= seg; i++) {
    var s = Math.sin(phase + i * 0.9) * amp * (i / seg + 0.15);
    var bx = x - px * i * step + nx * s, by = y - py * i * step + ny * s;
    if (i === 0) ctx.moveTo(bx, by); else ctx.lineTo(bx, by);
  }
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, width * 0.75, 0, Math.PI * 2); ctx.fillStyle = colour; ctx.fill();
  ctx.restore();
}
function drawFood(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r || 5, 0, Math.PI * 2); ctx.fillStyle = T.food; ctx.fill(); }
function drawPatch(p) {
  if (!p) return;
  var g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, p.r);
  g.addColorStop(0, T.patch); g.addColorStop(1, 'rgba(142,68,173,0)');
  ctx.save(); ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = T.patch; ctx.stroke(); ctx.setLineDash([]);
}
var brainEl = document.getElementById('brain'), notesEl = document.getElementById('notes'), ctlEl = document.getElementById('plateCtl'), legendEl = document.getElementById('legend');
function button(label, cls, onClick) { var b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', onClick); return b; }
function setOn(b, on) { b.classList.toggle('on', !!on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
function readout(items) { return '<div class="read">' + items.map(function (it) { return '<div><b id="' + it[0] + '">' + it[1] + '</b><span>' + it[2] + '</span></div>'; }).join('') + '</div>'; }
function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

/* ───────────── Level 1: a Braitenberg vehicle, two cells ───────────── */
var L1 = {
  name: 'two cells',
  lights: [], v: null, wiring: 'straight', synapse: 'excite', sL: 0, sR: 0, mL: 0, mR: 0, phase: 0,
  enter: function () {
    this.lights = [{ x: 200, y: 220 }, { x: 440, y: 400 }, { x: 330, y: 150 }];
    this.v = { x: 320, y: 420, h: -1.2 };
    ctlEl.innerHTML = ''; legendEl.innerHTML = '<span><i style="background:var(--food)"></i>light (food)</span><span>click the plate to add a light</span>';
    var self = this;
    var w1 = button('Wires straight', '', function () { self.wiring = 'straight'; setOn(w1, true); setOn(w2, false); self.brainDraw(); });
    var w2 = button('Wires crossed', '', function () { self.wiring = 'crossed'; setOn(w1, false); setOn(w2, true); self.brainDraw(); });
    var s1 = button('Light excites the motor', '', function () { self.synapse = 'excite'; setOn(s1, true); setOn(s2, false); self.brainDraw(); });
    var s2 = button('Light inhibits the motor', '', function () { self.synapse = 'inhibit'; setOn(s1, false); setOn(s2, true); self.brainDraw(); });
    setOn(w1, true); setOn(s1, true);
    ctlEl.appendChild(w1); ctlEl.appendChild(w2); ctlEl.appendChild(s1); ctlEl.appendChild(s2);
    brainEl.innerHTML = '<h2>Two cells, two wires</h2><div id="l1svg"></div>' + readout([['l1sL', '0.00', 'left eye'], ['l1sR', '0.00', 'right eye'], ['l1mL', '0.00', 'left motor'], ['l1mR', '0.00', 'right motor']]) + '<p class="hint" id="l1label"></p>';
    notesEl.innerHTML = '<h2>What you are looking at</h2>' +
      '<p>The vehicle has two light sensors at the front and two motors at the back. Each sensor is wired to one motor. That is the whole nervous system: two cells, two wires, no memory.</p>' +
      '<p>With straight wires and a sensor that speeds its motor up, the side nearer the light turns faster and the vehicle swings away. Valentino Braitenberg called that vehicle <em>fear</em>. Cross the wires and it turns towards the light and speeds up as it gets close: <em>aggression</em>. Make the sensor slow its motor instead and it approaches, slows, and settles facing the light: <em>love</em>. Crossed and slowing, it turns away and lingers: Braitenberg called it <em>the explorer</em>.</p>' +
      '<p>Nothing about the vehicle changes between those four names except which wire goes where and its sign. The names come from the person watching. Braitenberg&rsquo;s book is <em>Vehicles: Experiments in Synthetic Psychology</em> (1984); these are his vehicles 2a, 2b, 3a and 3b.</p>';
    renderLenses(1);
    this.brainDraw();
  },
  sense: function (x, y) { var s = 0; for (var i = 0; i < this.lights.length; i++) { var d = dist(x, y, this.lights[i].x, this.lights[i].y) / 110; s += 1 / (1 + d * d); } return Math.min(1.5, s); },
  tick: function () {
    var v = this.v, off = 0.45, ahead = 14;
    var lx = v.x + Math.cos(v.h - off) * ahead, ly = v.y + Math.sin(v.h - off) * ahead;
    var rx = v.x + Math.cos(v.h + off) * ahead, ry = v.y + Math.sin(v.h + off) * ahead;
    this.sL = this.sense(lx, ly); this.sR = this.sense(rx, ry);
    var inL = this.wiring === 'straight' ? this.sL : this.sR, inR = this.wiring === 'straight' ? this.sR : this.sL;
    if (this.synapse === 'excite') { this.mL = 0.25 + 1.6 * inL; this.mR = 0.25 + 1.6 * inR; }
    else { this.mL = Math.max(0, 1.5 - 1.6 * inL); this.mR = Math.max(0, 1.5 - 1.6 * inR); }
    var speed = (this.mL + this.mR) * 0.9;
    v.h += (this.mL - this.mR) * 0.09;
    v.x += Math.cos(v.h) * speed; v.y += Math.sin(v.h) * speed; this.phase += speed * 0.25;
    if (keepIn(v, 14)) v.h = Math.atan2(CY - v.y, CX - v.x) + rr(-0.6, 0.6);
  },
  click: function (x, y) { if (this.lights.length < 8) this.lights.push({ x: x, y: y }); else this.lights.shift(), this.lights.push({ x: x, y: y }); },
  draw: function () {
    clearPlate();
    for (var i = 0; i < this.lights.length; i++) {
      var l = this.lights[i], g = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 110);
      g.addColorStop(0, T.food); g.addColorStop(1, 'rgba(217,140,26,0)');
      ctx.save(); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(l.x, l.y, 110, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.restore();
      drawFood(l.x, l.y, 7);
    }
    var v = this.v;
    ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.h);
    ctx.fillStyle = T.fg; ctx.fillRect(-16, -10, 26, 20);
    ctx.fillStyle = T.food; ctx.globalAlpha = 0.4 + 0.6 * Math.min(1, this.sL); ctx.beginPath(); ctx.arc(12, -7, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.4 + 0.6 * Math.min(1, this.sR); ctx.beginPath(); ctx.arc(12, 7, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = T.accent; ctx.fillRect(-18, -13, 6, 8 * Math.min(1, this.mL / 2.5)); ctx.fillRect(-18, 5, 6, 8 * Math.min(1, this.mR / 2.5));
    ctx.restore();
    setText('l1sL', this.sL.toFixed(2)); setText('l1sR', this.sR.toFixed(2)); setText('l1mL', this.mL.toFixed(2)); setText('l1mR', this.mR.toFixed(2));
    var svg = document.getElementById('l1svg'); if (svg) {
      var ids = ['c_sL', 'c_sR', 'c_mL', 'c_mR'], vals = [this.sL, this.sR, this.mL / 2.5, this.mR / 2.5];
      for (var k = 0; k < 4; k++) { var c = document.getElementById(ids[k]); if (c) c.setAttribute('fill-opacity', (0.15 + 0.85 * clamp(vals[k], 0, 1)).toFixed(2)); }
    }
  },
  brainDraw: function () {
    var crossed = this.wiring === 'crossed', inh = this.synapse === 'inhibit';
    var names = { 'straight excite': 'fear', 'crossed excite': 'aggression', 'straight inhibit': 'love', 'crossed inhibit': 'the explorer' };
    var wire = function (x1, y1, x2, y2) {
      var end = inh ? '<line x1="' + (x2 - 8) + '" y1="' + (y2 - 10) + '" x2="' + (x2 - 8) + '" y2="' + (y2 + 10) + '" stroke="var(--harm)" stroke-width="4"/>' :
        '<polygon points="' + (x2 - 2) + ',' + y2 + ' ' + (x2 - 14) + ',' + (y2 - 6) + ' ' + (x2 - 14) + ',' + (y2 + 6) + '" fill="var(--accent)"/>';
      return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + (x2 - 14) + '" y2="' + y2 + '" stroke="' + (inh ? 'var(--harm)' : 'var(--accent)') + '" stroke-width="3"/>' + end;
    };
    var html = '<svg viewBox="0 0 360 150" role="img" aria-label="two sensors wired to two motors">' +
      (crossed ? wire(90, 40, 270, 110) + wire(90, 110, 270, 40) : wire(90, 40, 270, 40) + wire(90, 110, 270, 110)) +
      '<circle id="c_sL" cx="70" cy="40" r="20" fill="var(--food)" fill-opacity=".3" stroke="var(--fg)"/><circle id="c_sR" cx="70" cy="110" r="20" fill="var(--food)" fill-opacity=".3" stroke="var(--fg)"/>' +
      '<circle id="c_mL" cx="290" cy="40" r="20" fill="var(--accent)" fill-opacity=".3" stroke="var(--fg)"/><circle id="c_mR" cx="290" cy="110" r="20" fill="var(--accent)" fill-opacity=".3" stroke="var(--fg)"/>' +
      '<text x="70" y="78" text-anchor="middle" font-size="12" fill="var(--muted)" font-family="var(--mono)">left eye</text><text x="70" y="148" text-anchor="middle" font-size="12" fill="var(--muted)" font-family="var(--mono)">right eye</text>' +
      '<text x="290" y="78" text-anchor="middle" font-size="12" fill="var(--muted)" font-family="var(--mono)">left motor</text><text x="290" y="148" text-anchor="middle" font-size="12" fill="var(--muted)" font-family="var(--mono)">right motor</text></svg>';
    document.getElementById('l1svg').innerHTML = html;
    setText('l1label', 'Wires ' + this.wiring + ', light ' + (inh ? 'inhibits' : 'excites') + ' the motor. An observer calls this ' + names[this.wiring + ' ' + this.synapse] + '.');
  }
};

/* ───────────── Level 2: the touch withdrawal circuit, after Chalfie et al. 1985 ───────────── */
var L2 = {
  name: 'touch circuit',
  cells: ['ALM', 'AVM', 'PLM', 'AVD', 'PVC', 'AVA', 'AVB', 'A', 'B'],
  // [pre, post, weight]; a minus sign is an inhibitory connection as reported in Chalfie 1985 and Wicks & Rankin 1995
  wires: [['ALM', 'AVD', 1.0], ['AVM', 'AVD', 1.0], ['ALM', 'PVC', -0.8], ['AVM', 'PVC', -0.8], ['PLM', 'PVC', 1.2], ['PLM', 'AVD', -0.8],
    ['AVD', 'AVA', 1.2], ['PVC', 'AVB', 1.2], ['AVA', 'AVB', -1.0], ['AVB', 'AVA', -1.0], ['AVA', 'A', 1.5], ['AVB', 'B', 1.5]],
  pos: { ALM: [60, 40], AVM: [60, 100], PLM: [60, 200], AVD: [170, 70], PVC: [170, 170], AVA: [280, 70], AVB: [280, 170], A: [380, 70], B: [380, 170] },
  x: {}, r: {}, ablated: {}, input: {}, hNose: 1, hTail: 1, tapLeft: 0, tapTailLeft: 0, worm: null, phase: 0, taps: 0, reversing: 0, wallTouches: 0, learning: true,
  enter: function () {
    var self = this; this.x = {}; this.r = {}; this.input = {}; this.ablated = {};
    for (var i = 0; i < this.cells.length; i++) { this.x[this.cells[i]] = 0; this.r[this.cells[i]] = 0; this.input[this.cells[i]] = 0; }
    this.worm = { x: 320, y: 320, h: rr(-3, 3) }; this.hNose = 1; this.hTail = 1; this.taps = 0; this.wallTouches = 0;
    ctlEl.innerHTML = ''; legendEl.innerHTML = '<span>the rim of the dish is a nose touch too</span>';
    ctlEl.appendChild(button('Tap the nose', '', function () { self.tap('nose'); }));
    ctlEl.appendChild(button('Tap the tail', '', function () { self.tap('tail'); }));
    var lb = button('Habituation on', '', function () { self.learning = !self.learning; lb.textContent = self.learning ? 'Habituation on' : 'Habituation off'; setOn(lb, self.learning); if (!self.learning) { self.hNose = 1; self.hTail = 1; } });
    setOn(lb, true); ctlEl.appendChild(lb);
    brainEl.innerHTML = '<h2>Eight cell classes, from the 1985 ablation map</h2><div id="l2svg"></div><p class="hint">Click a cell to ablate it (the laser experiment). Green arrows excite, red bars inhibit.</p>' +
      readout([['l2nose', '100%', 'nose sensitivity'], ['l2tail', '100%', 'tail sensitivity'], ['l2taps', '0', 'taps'], ['l2state', 'forward', 'the worm is']]);
    notesEl.innerHTML = '<h2>What you are looking at</h2>' +
      '<p>In 1985 Martin Chalfie and colleagues killed single cells in living worms with a laser and watched which touches stopped working. The map they drew is this circuit. A touch on the head fires the cells ALM and AVM. They excite AVD. AVD excites AVA. AVA drives the A motor neurons, the cells that run the worm backwards. A touch on the tail fires PLM, which excites PVC, then AVB, then the B motor neurons: forwards. Each side also inhibits the other. The worm never tries both at once.</p>' +
      '<p>Tap the nose ten times in a row and the reversal gets shorter each time. That is habituation, the simplest learning there is. Catharine Rankin showed the real worm does it to taps. The synapse from the touch cells weakens with use and recovers with rest. Switch it off and every tap is the first tap.</p>' +
      '<p>Ablate AVA and the worm can no longer reverse, however hard you tap. Ablate AVD and it still reverses a little, through AVM&rsquo;s other route. Those are the two results the 1985 paper reports. The weights here are set by hand to reproduce the paper&rsquo;s signs; the full 302-cell table on the next tab has no signs at all.</p>';
    renderLenses(2);
    this.brainDraw();
  },
  tap: function (where) {
    this.taps++;
    if (where === 'nose') { this.tapLeft = 14; if (this.learning) this.hNose *= 0.6; }
    else { this.tapTailLeft = 14; if (this.learning) this.hTail *= 0.6; }
  },
  tick: function () {
    var c = this.cells, i, k;
    for (i = 0; i < c.length; i++) this.input[c[i]] = 0;
    this.input.AVB += 0.5;                                         // tonic forward drive
    if (this.tapLeft > 0) { this.tapLeft--; this.input.ALM += 1.6 * this.hNose; this.input.AVM += 1.6 * this.hNose; }
    if (this.tapTailLeft > 0) { this.tapTailLeft--; this.input.PLM += 1.6 * this.hTail; }
    for (k = 0; k < this.wires.length; k++) { var w = this.wires[k]; if (!this.ablated[w[0]] && !this.ablated[w[1]]) this.input[w[1]] += w[2] * this.r[w[0]]; }
    for (i = 0; i < c.length; i++) { var n = c[i]; if (this.ablated[n]) { this.x[n] = 0; this.r[n] = 0; continue; } this.x[n] += (-this.x[n] + this.input[n]) * 0.18; this.r[n] = Math.max(0, this.x[n]); }
    this.hNose += (1 - this.hNose) * 0.004; this.hTail += (1 - this.hTail) * 0.004;
    var v = (this.r.B - this.r.A) * 2.6, wm = this.worm;
    if (v < -0.2) { this.reversing++; wm.h += 0.025; } else { this.reversing = 0; wm.h += rr(-0.04, 0.04); }
    wm.x += Math.cos(wm.h) * v; wm.y += Math.sin(wm.h) * v; this.phase += Math.abs(v) * 0.25;
    if (keepIn(wm, 10) && v > 0 && this.tapLeft === 0) { this.tapLeft = 14; this.wallTouches++; if (this.learning) this.hNose *= 0.6; wm.h += rr(-0.5, 0.5); }
  },
  click: function () {},
  draw: function () {
    clearPlate();
    var wm = this.worm;
    drawWorm(wm.x, wm.y, wm.h, 70, 7, T.fg, this.phase, 1);
    if (this.tapLeft > 0) { ctx.beginPath(); ctx.arc(wm.x + Math.cos(wm.h) * 10, wm.y + Math.sin(wm.h) * 10, 10 + this.tapLeft, 0, Math.PI * 2); ctx.strokeStyle = T.harm; ctx.lineWidth = 2; ctx.stroke(); }
    if (this.tapTailLeft > 0) { var tx = wm.x - Math.cos(wm.h) * 70, ty = wm.y - Math.sin(wm.h) * 70; ctx.beginPath(); ctx.arc(tx, ty, 10 + this.tapTailLeft, 0, Math.PI * 2); ctx.strokeStyle = T.harm; ctx.lineWidth = 2; ctx.stroke(); }
    for (var i = 0; i < this.cells.length; i++) { var el = document.getElementById('l2c_' + this.cells[i]); if (el) el.setAttribute('fill-opacity', this.ablated[this.cells[i]] ? 0 : (0.12 + 0.88 * clamp(this.r[this.cells[i]] / 1.5, 0, 1)).toFixed(2)); }
    setText('l2nose', Math.round(this.hNose * 100) + '%'); setText('l2tail', Math.round(this.hTail * 100) + '%'); setText('l2taps', this.taps);
    setText('l2state', this.r.A > this.r.B + 0.05 ? 'reversing' : 'forward');
  },
  brainDraw: function () {
    var self = this, s = '<svg viewBox="0 0 430 240" role="img" aria-label="the touch withdrawal circuit">';
    for (var k = 0; k < this.wires.length; k++) {
      var w = this.wires[k], a = this.pos[w[0]], b = this.pos[w[1]], inh = w[2] < 0;
      var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy), ux = dx / L, uy = dy / L;
      var x1 = a[0] + ux * 22, y1 = a[1] + uy * 22, x2 = b[0] - ux * 24, y2 = b[1] - uy * 24;
      var col = inh ? 'var(--harm)' : 'var(--accent)';
      s += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + col + '" stroke-width="' + (1 + Math.abs(w[2]) * 1.6) + '" stroke-opacity=".85"/>';
      if (inh) s += '<line x1="' + (x2 - uy * 7) + '" y1="' + (y2 + ux * 7) + '" x2="' + (x2 + uy * 7) + '" y2="' + (y2 - ux * 7) + '" stroke="' + col + '" stroke-width="4"/>';
      else s += '<polygon points="' + (x2 + ux * 6) + ',' + (y2 + uy * 6) + ' ' + (x2 - ux * 6 - uy * 5) + ',' + (y2 - uy * 6 + ux * 5) + ' ' + (x2 - ux * 6 + uy * 5) + ',' + (y2 - uy * 6 - ux * 5) + '" fill="' + col + '"/>';
    }
    var kind = { ALM: 'touch, head', AVM: 'touch, head', PLM: 'touch, tail', AVD: 'interneuron', PVC: 'interneuron', AVA: 'command: back', AVB: 'command: forward', A: 'motor: back', B: 'motor: forward' };
    for (var n in this.pos) if (this.pos.hasOwnProperty(n)) {
      var p = this.pos[n], ab = this.ablated[n];
      s += '<g class="cell" data-cell="' + n + '" style="cursor:pointer"><circle id="l2c_' + n + '" cx="' + p[0] + '" cy="' + p[1] + '" r="20" fill="var(--fire)" fill-opacity=".12" stroke="' + (ab ? 'var(--harm)' : 'var(--fg)') + '" stroke-width="' + (ab ? 2 : 1.2) + '"' + (ab ? ' stroke-dasharray="4 3"' : '') + '/>' +
        '<text x="' + p[0] + '" y="' + (p[1] + 4) + '" text-anchor="middle" font-size="12" font-weight="600" font-family="var(--mono)" fill="var(--fg)"' + (ab ? ' text-decoration="line-through"' : '') + '>' + n + '</text>' +
        '<text x="' + p[0] + '" y="' + (p[1] + (n === 'AVA' || n === 'A' || n === 'AVD' ? -28 : 34)) + '" text-anchor="middle" font-size="10" font-family="var(--body)" fill="var(--muted)">' + kind[n] + '</text></g>';
    }
    s += '</svg>';
    var host = document.getElementById('l2svg'); host.innerHTML = s;
    var gs = host.querySelectorAll('g.cell');
    for (var g = 0; g < gs.length; g++) gs[g].addEventListener('click', function () { var n = this.getAttribute('data-cell'); self.ablated[n] = !self.ablated[n]; self.brainDraw(); });
  }
};

/* ───────────── Level 3: the full 302, Busbice's table and rule ───────────── */
var BASE = new E.Connectome(DATA);
var G = window.WormGloss;
/** The brain as squares, grouped by what the cells are for. Returns els indexed by cell index. */
function makeCellGrid(host, c, count) {
  var els = new Array(count), byGroup = {}, i;
  for (i = 0; i < count; i++) { var g = G.group(c.names[i]); (byGroup[g] = byGroup[g] || []).push(i); }
  host.innerHTML = '';
  for (var k = 0; k < G.GROUPS.length; k++) {
    var gid = G.GROUPS[k][0], list = byGroup[gid]; if (!list || gid === 'muscle') continue;
    var row = document.createElement('div'); row.className = 'cg'; row.setAttribute('data-group', gid);
    var lab = document.createElement('span'); lab.textContent = G.groupLabel(gid) + ' ' + list.length; row.appendChild(lab);
    var grid = document.createElement('div'); grid.className = 'cells'; row.appendChild(grid);
    for (i = 0; i < list.length; i++) { var el = document.createElement('i'); el.title = c.names[list[i]] + ': ' + G.words(c.names[list[i]]); grid.appendChild(el); els[list[i]] = el; }
    host.appendChild(row);
  }
  return els;
}
function addCellToGrid(host, els, c, i) {
  var row = host.querySelector('.cg[data-group="new"]');
  if (!row) { row = document.createElement('div'); row.className = 'cg'; row.setAttribute('data-group', 'new'); var lab = document.createElement('span'); lab.textContent = 'added by evolution'; row.appendChild(lab); var grid = document.createElement('div'); grid.className = 'cells'; row.appendChild(grid); host.appendChild(row); }
  var el = document.createElement('i'); el.title = c.names[i] + ': ' + G.words(c.names[i]); el.className = 'new'; row.querySelector('.cells').appendChild(el); els[i] = el;
}
/** "smell 4 · command 2 · body motor, forward 11": what fired this tick, in words. */
function firingSummary(brain) {
  var counts = {}, c = brain.c, n = c.neuronCount, any = false;
  for (var i = 0; i < n; i++) if (brain.fired[i]) { var g = G.group(c.names[i]); counts[g] = (counts[g] || 0) + 1; any = true; }
  if (!any) return 'nothing firing';
  var parts = []; for (var k = 0; k < G.GROUPS.length; k++) { var gid = G.GROUPS[k][0]; if (counts[gid]) parts.push(G.groupLabel(gid) + ' ' + counts[gid]); }
  return parts.join(' · ');
}
function paintCells(els, brain, glow, decay) {
  var n = Math.min(els.length, brain.c.neuronCount), d = decay === undefined ? 0.82 : decay;
  for (var i = 0; i < n; i++) {
    if (brain.fired[i]) glow[i] = 1; else glow[i] *= d;
    var g = glow[i], el = els[i]; if (!el) continue;
    if (g < 0.03) { if (el.style.opacity !== '') { el.style.opacity = ''; el.style.background = ''; } continue; }
    el.style.opacity = (0.55 + 0.45 * g).toFixed(2); el.style.background = 'rgba(255,140,0,' + g.toFixed(2) + ')';
  }
}
/** "smell: ASEL, AWCR · command: AVAL": the cells that fired this tick, by name, for slow-mo and pause. */
function firingNames(brain) {
  var byGroup = {}, c = brain.c, n = c.neuronCount;
  for (var i = 0; i < n; i++) if (brain.fired[i]) { var g = G.group(c.names[i]); (byGroup[g] = byGroup[g] || []).push(c.names[i]); }
  var parts = []; for (var k = 0; k < G.GROUPS.length; k++) { var gid = G.GROUPS[k][0]; if (byGroup[gid]) parts.push('<b>' + esc(G.groupLabel(gid)) + ':</b> ' + esc(byGroup[gid].join(', '))); }
  return parts.length ? parts.join(' &middot; ') : 'nothing fired this tick';
}
/** Slow-mo for tabs 3 and 4: how many frames each tick stays on screen, so the firing can be read. */
var SLOW = [['Slow-mo', 1], ['Slow-mo: 4 ticks/s', 15], ['Slow-mo: 1 tick/s', 60]];
function setSlow(lv, i) { lv.slow = i; lv.hold = 0; if (lv.slowBtn) { lv.slowBtn.textContent = SLOW[i][0]; setOn(lv.slowBtn, i > 0); } }
function setPaused(lv, on) { lv.paused = on; if (lv.pauseBtn) { lv.pauseBtn.textContent = on ? 'Run' : 'Pause'; setOn(lv.pauseBtn, on); } }
/** Pause, Slow-mo (cycles off, 4 ticks a second, 1 tick a second) and Step; onSlow runs when slow-mo turns on. */
function slowControls(lv, onSlow) {
  lv.pauseBtn = button('Pause', '', function () { setPaused(lv, !lv.paused); }); ctlEl.appendChild(lv.pauseBtn);
  lv.slowBtn = button('Slow-mo', '', function () { setSlow(lv, (lv.slow + 1) % SLOW.length); if (lv.slow > 0 && onSlow) onSlow(); }); ctlEl.appendChild(lv.slowBtn);
  var st = button('Step one tick', '', function () { setPaused(lv, true); lv.stepReq = true; }); st.title = 'pause and advance exactly one tick'; ctlEl.appendChild(st);
  setSlow(lv, lv.slow || 0); setPaused(lv, false);
}
/** Ticks to run this frame: -1 = full speed (the caller decides how many), 0 = hold, 1 = one slow or stepped tick. */
function slowTicks(lv) {
  if (lv.stepReq) { lv.stepReq = false; return 1; }
  if (lv.paused) return 0;
  var hold = SLOW[lv.slow][1]; if (hold === 1) return -1;
  lv.hold++; if (lv.hold >= hold) { lv.hold = 0; return 1; }
  return 0;
}
/** The names line under the grid: readable only when the plate is slow or still. */
function showNames(lv, id, brain) {
  var el = document.getElementById(id); if (!el) return;
  var h = lv.slow > 0 || lv.paused ? firingNames(brain) : 'Slow-mo, Pause or Step to read the cells by name.';
  if (el.innerHTML !== h) el.innerHTML = h;
}
/** One worm with a 302-cell brain on a plate. Shared by levels 3 and 4. */
function Worm302(conn, x, y, h) {
  this.brain = new E.Brain(conn); this.x = x; this.y = y; this.h = h; this.phase = 0; this.v = 0; this.turn = 0;
  this.hFood = 1; this.hTouch = 1; this.tapLeft = 0; this.age = 0; this.inPatch = false; this.recent = []; this.revWindow = []; this.eaten = 0;
}
Worm302.prototype.step = function (env, opts) {
  var b = this.brain, i, s;
  this.age++;
  // smell: any food within reach, every other tick (Busbice stimulated food every 0.5 s)
  var smell = false;
  for (i = 0; i < env.food.length; i++) { var f = env.food[i]; if (f.t === 0 && dist(this.x, this.y, f.x, f.y) < env.smell) { smell = true; break; } }
  if (smell && (this.age & 1) === 0 && rnd() < this.hFood) { s = E.SENSE.food; for (i = 0; i < s.length; i++) b.stimulate(s[i]); if (opts.habituate) this.hFood = Math.max(0.15, this.hFood - 0.004); }
  else this.hFood += (1 - this.hFood) * 0.002;
  var nx = this.x + Math.cos(this.h) * 8, ny = this.y + Math.sin(this.h) * 8;
  var rim = dist(nx, ny, CX, CY) > PR - 8;
  if (rim && this.tapLeft === 0) this.tapLeft = 10;
  if (this.tapLeft > 0) { this.tapLeft--; if (rnd() < this.hTouch) { s = opts.touchSet; for (i = 0; i < s.length; i++) b.stimulate(s[i]); } if (opts.habituate) this.hTouch = Math.max(0.1, this.hTouch * 0.97); }
  else this.hTouch += (1 - this.hTouch) * 0.003;
  var pr = env.predator; if (pr && dist(this.x, this.y, pr.x, pr.y) < 80) { s = E.SENSE.predator; for (i = 0; i < s.length; i++) b.stimulate(s[i]); }
  var p = env.patch; this.inPatch = !!(p && dist(this.x, this.y, p.x, p.y) < p.r);
  if (this.inPatch) { s = E.SENSE.harm; for (i = 0; i < s.length; i++) b.stimulate(s[i]); }
  b.tick(); var m = b.motor();
  this.v = m.v * 2.2; this.turn = m.turn;
  if (m.turn) this.h += m.turn * 0.22;
  this.x += Math.cos(this.h) * this.v; this.y += Math.sin(this.h) * this.v; this.phase += Math.abs(this.v) * 0.3;
  if (keepIn(this, 10)) this.h += rr(-0.3, 0.3);
  var ate = false;
  for (i = 0; i < env.food.length; i++) { f = env.food[i]; if (f.t === 0 && dist(this.x, this.y, f.x, f.y) < 9) { f.t = env.regrow; ate = true; this.eaten++; if (env.regrow === 0) { var q = randomPoint(20); f.x = q.x; f.y = q.y; } } }
  this.revWindow.push(this.v < 0 ? 1 : 0); if (this.revWindow.length > 300) this.revWindow.shift();
  return ate;
};
var L3 = {
  name: 'the full 302',
  worm: null, env: null, els: [], glow: null, habituate: true, patchOn: false, speed: 1, noseTaps: 0, slow: 0, hold: 0, paused: false, stepReq: false, ticked: false, slowBtn: null, pauseBtn: null,
  enter: function () {
    var self = this;
    this.worm = new Worm302(BASE, 320, 320, rr(-3, 3));
    this.env = { food: [], smell: 110, regrow: 0, patch: null };
    for (var i = 0; i < 14; i++) { var q = randomPoint(30); this.env.food.push({ x: q.x, y: q.y, t: 0 }); }
    ctlEl.innerHTML = ''; legendEl.innerHTML = '<span><i style="background:var(--food)"></i>food (bacteria)</span><span><i style="background:var(--patch)"></i>toxic patch, sensed by ASH</span><span>click the plate to drop food</span>';
    ctlEl.appendChild(button('Tap the nose', '', function () { self.worm.tapLeft = 10; self.noseTaps++; }));
    var pb = button('Toxic patch', 'patch', function () { self.patchOn = !self.patchOn; setOn(pb, self.patchOn); self.env.patch = self.patchOn ? { x: 320 + rr(-120, 120), y: 320 + rr(-120, 120), r: 70 } : null; });
    ctlEl.appendChild(pb);
    var hb = button('Habituation on', '', function () { self.habituate = !self.habituate; hb.textContent = self.habituate ? 'Habituation on' : 'Habituation off'; setOn(hb, self.habituate); if (!self.habituate) { self.worm.hFood = 1; self.worm.hTouch = 1; } });
    setOn(hb, true); ctlEl.appendChild(hb);
    var setSpeed = function (v) { self.speed = v; sp.textContent = v === 1 ? 'Speed ×4' : 'Speed ×1'; setOn(sp, v === 4); };
    var sp = button('Speed ×4', '', function () { setSpeed(self.speed === 1 ? 4 : 1); if (self.speed === 4) setSlow(self, 0); });
    ctlEl.appendChild(sp); this.speed = 1;
    slowControls(this, function () { setSpeed(1); });
    brainEl.innerHTML = '<h2>300 neurons, 3,689 synapses, no behaviour written</h2><div id="l3cells"></div>' +
      '<div class="hint" id="l3fire">nothing firing</div><div class="names" id="l3names"></div><div class="hint">One square per neuron, grouped by what the cell is for. A square lights when its cell fires. Hover a square for its name and job.</div>' +
      readout([['l3fired', '0', 'cells firing'], ['l3L', '0', 'left muscles'], ['l3R', '0', 'right muscles'], ['l3rev', '0%', 'reversing, last 300 ticks'], ['l3eat', '0', 'food eaten'], ['l3touch', '100%', 'touch sensitivity']]);
    this.els = makeCellGrid(document.getElementById('l3cells'), BASE, BASE.neuronCount); this.glow = new Float32Array(BASE.neuronCount);
    notesEl.innerHTML = '<h2>What you are looking at</h2>' +
      '<p>Timothy Busbice loaded this table into a Lego robot in 2014. It holds 300 named neurons and 3,689 weighted connections read from the worm&rsquo;s wiring diagram. The page runs it by his rule. A cell adds up what arrives. When the sum passes 30 it fires its whole row into its targets and resets to zero. Muscles never fire. Their left and right sums drive two wheels, as they drove the robot&rsquo;s. Smelling food fires the eight chemosensory cells he used. A nose touch fires his ten. The toxic patch fires ASH, the worm&rsquo;s pain cell, on its own.</p>' +
      '<p>Nothing on this tab says what the worm should do. The press reports of the robot said it backed away from a chair leg. Measured here over 300 runs with food smelt every other tick, 30% of ticks are reversals with no touch at all. A burst of nose touch brings that down to between 11% and 20%. In this table and this rule, touch does not make the worm back away. The table has no signs. A synapse count is a count. An inhibitory connection reads the same as an excitatory one.</p>' +
      '<p>Habituation works here as on the touch tab. A cell stimulated over and over answers less often, then recovers. That is the one piece of learning in this worm.</p>';
    renderLenses(3);
  },
  tick: function () {
    var n = slowTicks(this); if (n < 0) n = this.speed;
    for (var k = 0; k < n; k++) {
      this.worm.step(this.env, { habituate: this.habituate, touchSet: E.SENSE.noseTouch });
    }
    this.ticked = n > 0;
  },
  click: function (x, y) { this.env.food.push({ x: x, y: y, t: 0 }); if (this.env.food.length > 40) this.env.food.shift(); },
  draw: function () {
    clearPlate(); drawPatch(this.env.patch);
    for (var i = 0; i < this.env.food.length; i++) if (this.env.food[i].t === 0) drawFood(this.env.food[i].x, this.env.food[i].y, 5);
    var w = this.worm; drawWorm(w.x, w.y, w.h, 80, 8, w.inPatch ? T.harm : T.fg, w.phase, 1);
    if (w.tapLeft > 0) { ctx.beginPath(); ctx.arc(w.x + Math.cos(w.h) * 10, w.y + Math.sin(w.h) * 10, 8 + w.tapLeft, 0, Math.PI * 2); ctx.strokeStyle = T.harm; ctx.lineWidth = 2; ctx.stroke(); }
    paintCells(this.els, w.brain, this.glow, this.slow > 0 || this.paused ? (this.ticked ? 0.3 : 1) : 0.82);
    showNames(this, 'l3names', w.brain);
    var rev = 0; for (i = 0; i < w.revWindow.length; i++) rev += w.revWindow[i];
    setText('l3fired', w.brain.firingCount || 0); setText('l3fire', 'firing now: ' + firingSummary(w.brain)); setText('l3L', Math.round(w.brain.L)); setText('l3R', Math.round(w.brain.R));
    setText('l3rev', w.revWindow.length ? Math.round(100 * rev / w.revWindow.length) + '%' : '0%'); setText('l3eat', w.eaten); setText('l3touch', Math.round(w.hTouch * 100) + '%');
  }
};

/* ───────────── Level 4: the evolution plate ───────────── */
var L4 = {
  name: 'evolution plate',
  worms: [], env: null, tick0: 0, births: 0, deaths: 0, patchDeaths: 0, starved: 0, predDeaths: 0, lineages: {}, lineageOrder: [], nextLineage: 2, nextNeuron: 1,
  samples: [], learning: true, turbo: false, paused: false, mutRate: 0.6, els: [], glow: null, focus: null, pick: null, tps: 0, cap: 150, base: null, cut: 0, predatorOn: false, predator: null, slow: 0, hold: 0, stepReq: false, ticked: false, slowBtn: null, pauseBtn: null,
  costBase: 0.02, costMove: 0.03, foodE: 60, patchDrain: 2.4, foodN: 70, regrow: 80, smell: 120, splitAt: 150, clade: 6,
  enter: function () {
    var self = this;
    this.base = BASE.clone(); this.cut = this.base.cutOutputs('ASHL') + this.base.cutOutputs('ASHR');
    this.reset();
    ctlEl.innerHTML = ''; legendEl.innerHTML = '<span><i style="background:var(--food)"></i>food</span><span><i style="background:var(--patch)"></i>toxic patch: ASH fires, health drains</span><span><i style="background:var(--harm)"></i>predator: a bigger worm that bites</span><span>click the plate to move the patch</span>';
    var tb = button('Fast forward', '', function () { self.turbo = !self.turbo; setOn(tb, self.turbo); if (self.turbo) { setSlow(self, 0); setPaused(self, false); } });
    slowControls(this, function () { self.turbo = false; setOn(tb, false); }); this.turbo = false; ctlEl.appendChild(tb);
    var lb = button('Learning on', '', function () { self.learning = !self.learning; lb.textContent = self.learning ? 'Learning on' : 'Learning off'; setOn(lb, self.learning); }); setOn(lb, true); ctlEl.appendChild(lb);
    var prb = button('Predator', 'harm', function () { self.predatorOn = !self.predatorOn; setOn(prb, self.predatorOn); if (self.predatorOn && !self.predator) { var q = randomPoint(60); self.predator = { x: q.x, y: q.y, h: rr(-3, 3), rest: 0, kills: 0, phase: 0 }; } }); ctlEl.appendChild(prb);
    var mb = button('Mutation: normal', '', function () { self.mutRate = self.mutRate === 0.6 ? 0.95 : self.mutRate === 0.95 ? 0.25 : 0.6; mb.textContent = 'Mutation: ' + (self.mutRate === 0.6 ? 'normal' : self.mutRate === 0.95 ? 'high' : 'low'); }); ctlEl.appendChild(mb);
    ctlEl.appendChild(button('Move the patch', 'patch', function () { var q = randomPoint(90); self.env.patch.x = q.x; self.env.patch.y = q.y; }));
    ctlEl.appendChild(button('Reset', '', function () { self.reset(); }));
    brainEl.innerHTML = '<h2>Population by lineage</h2><div class="chart" id="l4chart"></div>' +
      '<div class="hint">A lineage starts at a structural mutation. Until it and its descendants number ' + this.clade + ', its worms count with, and wear the colour of, the nearest lineage above it. From then on it has its own colour on the plate and in the chart until it dies out.</div><div class="lineages" id="l4lin"></div>' +
      readout([['l4pop', '0', 'alive'], ['l4lines', '1', 'lineages'], ['l4births', '0', 'births'], ['l4pd', '0', 'died in the patch'], ['l4pr', '0', 'eaten by the predator'], ['l4st', '0', 'starved'], ['l4tps', '0', 'ticks / s']]) +
      '<h2 style="margin-top:14px" id="l4who">The biggest lineage&rsquo;s brain</h2><div class="hint">Click a lineage in the list, or a worm on the plate, to follow it instead. Slow-mo or Step to read its cells as they fire.</div><div class="hint" id="l4fire">nothing firing</div><div class="names" id="l4names"></div><div id="l4cells"></div><div class="mut" id="l4mut"></div>';
    this.els = makeCellGrid(document.getElementById('l4cells'), this.base, this.base.neuronCount); this.glow = new Float32Array(this.base.neuronCount);
    document.getElementById('l4lin').addEventListener('click', function (ev) { var row = ev.target.closest ? ev.target.closest('[data-lineage]') : null; if (row) { self.pick = +row.getAttribute('data-lineage'); self.focus = null; } });
    document.getElementById('l4who').style.cursor = 'pointer'; document.getElementById('l4who').title = 'click to follow the biggest lineage again';
    document.getElementById('l4who').addEventListener('click', function () { self.pick = null; self.focus = null; });
    notesEl.innerHTML = '<h2>What you are looking at</h2>' +
      '<p>Every worm here starts with the 302 table from the previous tab, with one change. The ' + this.cut + ' outgoing connections of ASH, the pain cell, are cut. ASH still fires in the toxic patch. It is wired to nobody. A worm in the patch loses health fast and dies in about forty ticks; outside it, moving costs energy and eating food restores it. A worm with enough energy splits into two. The child is a copy. With the mutation rate set to normal, six children in ten carry one random change. It is a weight nudged, a new connection between two random cells, or a new cell spliced into an existing connection. Nothing in the code says what a good change is.</p>' +
      '<p>A structural mutation starts a new lineage. Once it has six worms it takes a colour of its own, as far as it can from every lineage alive. The chart counts each lineage over time. The list under it says how its worms lived: how long, how many meals, what killed them. A lineage that lives longer or eats more than the founder is the explanation of its own spread. If one ends up wired from ASH to something that turns, it found what the real worm has and the starting worm lacked. It may equally find a cheat, such as never leaving the far side of the dish. Moving the patch tests which it found.</p>' +
      '<p>The predator is a bigger worm that hunts the nearest worm it can sense and bites. In a real dish it is <em>Pristionchus pacificus</em>, a nematode that eats <em>C. elegans</em>. The worm smells it through ADL and ASK, two cells this table keeps wired. Fleeing is a second thing for mutation to find.</p>' +
      '<p>Learning is a second mechanism on top. With it on, a worm&rsquo;s own synapses change during its life. Connections between cells that fired together just before a meal get a little stronger. Connections firing while the worm is in the patch get a little weaker. The learned weights die with the worm. Only the mutations are inherited, plus one number: how fast the worm learns. That number can itself mutate. Switch learning off and re-run to see whether the learners&rsquo; lineages win sooner.</p>';
    renderLenses(4);
  },
  reset: function () {
    this.worms = []; this.tick0 = 0; this.births = 0; this.deaths = 0; this.patchDeaths = 0; this.starved = 0; this.predDeaths = 0; this.lineages = {}; this.lineageOrder = []; this.nextLineage = 2; this.nextNeuron = 1; this.samples = []; this.focus = null;
    this.env = { food: [], smell: this.smell, regrow: this.regrow, patch: null, predator: null };
    var q = randomPoint(90); this.env.patch = { x: q.x, y: q.y, r: 72 };
    if (this.predator) { q = randomPoint(60); this.predator = { x: q.x, y: q.y, h: rr(-3, 3), rest: 0, kills: 0, phase: 0 }; }
    for (var i = 0; i < this.foodN; i++) { q = randomPoint(20); this.env.food.push({ x: q.x, y: q.y, t: 0 }); }
    var hue = 190; this.addLineage(1, hue, 'the starting worm, ASH cut', null);
    for (i = 0; i < 36; i++) { q = randomPoint(40); this.spawn(this.base.clone(), q.x, q.y, 1, hue, [], 0.6, 100); }
  },
  addLineage: function (id, hue, note, parent) { this.lineages[id] = { id: id, hue: hue, note: note, parent: parent, counted: parent === null, alive: 0, born: this.tick0, deaths: 0, patch: 0, pred: 0, starved: 0, ageSum: 0, meals: 0 }; this.lineageOrder.push(id); },
  spawn: function (conn, x, y, lineage, hue, mutations, eta, energy) {
    var w = new Worm302(conn, x, y, rr(-3, 3)); w.lineage = lineage; w.hue = hue; w.mutations = mutations; w.eta = eta; w.energy = energy; w.firedLog = []; w.brain.keepFired = false;
    this.worms.push(w); return w;
  },
  /** A cell name with its job, for the mutation list. */
  say: function (name) { return name + ' (' + G.words(name) + ')'; },
  mutate: function (child) {
    var c = child.conn, kind = rnd(), text, structural = false;
    if (kind < 0.6) {
      var pre = ri(0, c.neuronCount - 1), tries = 0; while (c.rowT[pre].length === 0 && tries++ < 50) pre = ri(0, c.neuronCount - 1);
      if (c.rowT[pre].length) { var k = ri(0, c.rowT[pre].length - 1), d = ri(-4, 4) || 2; c.rowW[pre][k] += d; text = (d > 0 ? 'stronger' : 'weaker') + ': ' + this.say(c.names[pre]) + ' → ' + this.say(c.names[c.rowT[pre][k]]) + ' ' + (d > 0 ? '+' : '') + d; }
    } else if (kind < 0.82) {
      pre = ri(0, c.neuronCount - 1); var post = ri(0, c.n - 1), w = ri(1, 8) * (rnd() < 0.8 ? 1 : -1);
      var how = c.addSynapse(c.names[pre], c.names[post], w); text = 'new wire: ' + this.say(c.names[pre]) + ' → ' + this.say(c.names[post]) + ' ' + (w > 0 ? '+' : '') + w + (how === 'strengthened' ? ', onto one that existed' : ''); structural = true;
    } else if (kind < 0.94) {
      pre = ri(0, c.neuronCount - 1); tries = 0; while (c.rowT[pre].length === 0 && tries++ < 50) pre = ri(0, c.neuronCount - 1);
      if (c.rowT[pre].length) { k = ri(0, c.rowT[pre].length - 1); var postName = c.names[c.rowT[pre][k]], name = 'N' + (this.nextNeuron++); c.addNeuron(name, c.names[pre], postName); text = 'new cell ' + name + ' between ' + this.say(c.names[pre]) + ' and ' + this.say(postName); structural = true; }
    } else { var e = clamp(child.eta * rr(0.5, 2), 0.05, 3); text = 'learns ' + (e > child.eta ? 'faster' : 'slower') + ' (' + child.eta.toFixed(2) + ' → ' + e.toFixed(2) + ')'; child.eta = e; }
    if (!text) return;
    child.mutations = child.mutations.concat(['t' + this.tick0 + ' ' + text]);
    if (structural) { var parent = child.lineage; child.hue = (child.hue + rr(18, 40) * (rnd() < 0.5 ? -1 : 1) + 360) % 360; child.lineage = this.nextLineage++; this.addLineage(child.lineage, child.hue, text, parent); }
  },
  learn: function (w, reward) {
    var b = w.brain, c = b.c, log = w.firedLog, eta = w.eta * reward;
    if (log.length < 2) return;
    var now = log[log.length - 1];
    for (var t = Math.max(0, log.length - 4); t < log.length - 1; t++) {
      var pres = log[t];
      for (var i = 0; i < pres.length; i++) {
        var T_ = c.rowT[pres[i]];
        for (var j = 0; j < now.length; j++) {
          var post = now[j];
          for (var k = 0; k < T_.length; k++) if (T_[k] === post) { c.learnWeight(pres[i], k, eta, 8); break; }
        }
      }
    }
  },
  died: function (w, how) {
    var L = this.lineages[w.lineage]; if (L) { L.deaths++; L.ageSum += w.age; L.meals += w.eaten; L[how]++; }
    this.deaths++; if (how === 'patch') this.patchDeaths++; else if (how === 'pred') this.predDeaths++; else this.starved++;
    if (this.focus === w) this.focus = null;
  },
  stepPredator: function () {
    var p = this.predator; if (!p || !this.predatorOn) return;
    p.phase += 0.2;
    if (p.rest > 0) { p.rest--; return; }
    var best = null, bd = 130, i;
    for (i = 0; i < this.worms.length; i++) { var d = dist(p.x, p.y, this.worms[i].x, this.worms[i].y); if (d < bd) { bd = d; best = this.worms[i]; } }
    if (best) { var want = Math.atan2(best.y - p.y, best.x - p.x); p.h += wrapAngle(want - p.h) * 0.12; } else p.h += rr(-0.08, 0.08);
    p.x += Math.cos(p.h) * 1.5; p.y += Math.sin(p.h) * 1.5;
    if (keepIn(p, 16)) p.h = Math.atan2(CY - p.y, CX - p.x) + rr(-0.5, 0.5);
    for (i = this.worms.length - 1; i >= 0; i--) if (dist(p.x, p.y, this.worms[i].x, this.worms[i].y) < 8) { var w = this.worms[i]; this.worms.splice(i, 1); this.died(w, 'pred'); p.kills++; p.rest = 160; break; }
  },
  stepPlate: function () {
    var env = this.env, i, w; this.tick0++;
    env.predator = this.predatorOn ? this.predator : null;
    for (i = 0; i < env.food.length; i++) if (env.food[i].t > 0 && --env.food[i].t === 0) { var q = randomPoint(20); env.food[i].x = q.x; env.food[i].y = q.y; }
    this.stepPredator();
    for (i = this.worms.length - 1; i >= 0; i--) {
      w = this.worms[i];
      var ate = w.step(env, { habituate: true, touchSet: E.SENSE.noseTouchNoASH });
      if (this.learning) {
        var fl = []; for (var c = 0; c < w.brain.c.neuronCount; c++) if (w.brain.fired[c]) fl.push(c);
        w.firedLog.push(fl); if (w.firedLog.length > 5) w.firedLog.shift();
        if (ate) this.learn(w, 0.5); else if (w.inPatch && (w.age % 5) === 0) this.learn(w, -0.5);
      }
      w.energy -= this.costBase + this.costMove * Math.abs(w.v); if (ate) w.energy += this.foodE; if (w.inPatch) w.energy -= this.patchDrain;
      if (w.energy <= 0) { this.worms.splice(i, 1); this.died(w, w.inPatch ? 'patch' : 'starved'); continue; }
      if (w.energy >= this.splitAt && this.worms.length < this.cap) {
        w.energy = this.splitAt / 2;
        var child = { conn: w.brain.c.clone(), eta: w.eta, hue: w.hue, lineage: w.lineage, mutations: w.mutations };
        if (rnd() < this.mutRate) this.mutate(child);
        this.spawn(child.conn, w.x + rr(-6, 6), w.y + rr(-6, 6), child.lineage, child.hue, child.mutations, child.eta, this.splitAt / 2); this.births++;
      }
    }
    if (this.worms.length === 0) { for (i = 0; i < 12; i++) { q = randomPoint(40); this.spawn(this.base.clone(), q.x, q.y, 1, 190, [], 0.6, 100); } }
    if (this.tick0 % 40 === 0) this.sample();
  },
  /** The lineage a worm is shown under: its own once counted, else its nearest counted ancestor. The plate, chart, list and statistics all use this. */
  shown: function (id) {
    var L = this.lineages[id], hops = 0;
    while (L && !L.counted && L.parent !== null && hops++ < 200) L = this.lineages[L.parent];
    return L ? L.id : id;
  },
  /** A lineage is counted on its own once it and its uncounted descendants alive reach `clade`, and stays counted until it dies out.
   *  Deepest first (a child's id is always above its parent's), so a big sub-lineage is promoted before its parent claims its worms. */
  promote: function () {
    var sub = {}, i, id, L, hops;
    for (i = 0; i < this.worms.length; i++) {
      L = this.lineages[this.worms[i].lineage]; hops = 0;
      while (L && !L.counted && hops++ < 200) { sub[L.id] = (sub[L.id] || 0) + 1; L = this.lineages[L.parent]; }
    }
    var ids = Object.keys(sub).map(Number).sort(function (a, b) { return b - a; });
    for (i = 0; i < ids.length; i++) {
      id = ids[i]; if (sub[id] < this.clade) continue;
      L = this.lineages[id]; var n = sub[id], up = this.lineages[L.parent];
      L.counted = true;
      L.hue = this.freeHue(up ? this.lineages[this.shown(up.id)].hue : L.hue);
      hops = 0; while (up && !up.counted && hops++ < 200) { sub[up.id] -= n; up = this.lineages[up.parent]; }
    }
  },
  /** The hue furthest from every shown lineage alive, nearest the parent's among equals, so lineages stay told apart on the plate. */
  freeHue: function (parentHue) {
    var used = Object.keys(this.shownCounts()).map(function (id) { return this.lineages[id].hue; }, this), best = parentHue, bestGap = -1, bestNear = 999;
    var gap = function (a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
    for (var h = 0; h < 360; h += 10) {
      var g = 360; for (var i = 0; i < used.length; i++) g = Math.min(g, gap(h, used[i]));
      var near = gap(h, parentHue);
      if (g > bestGap + 4 || (g >= bestGap - 4 && near < bestNear)) { if (g > bestGap) bestGap = g; best = h; bestNear = near; }
    }
    return best;
  },
  /** Alive counts per lineage (own members only). */
  aliveCounts: function () { var a = {}; for (var i = 0; i < this.worms.length; i++) a[this.worms[i].lineage] = (a[this.worms[i].lineage] || 0) + 1; return a; },
  /** Alive counts per SHOWN lineage. */
  shownCounts: function () {
    var out = {};
    for (var i = 0; i < this.worms.length; i++) { var s = this.shown(this.worms[i].lineage); out[s] = (out[s] || 0) + 1; }
    return out;
  },
  /** Life statistics of a shown lineage: every lineage counted under it, dead or alive. */
  stats: function (id) {
    var s = { deaths: 0, patch: 0, pred: 0, starved: 0, ageSum: 0, meals: 0 };
    for (var k in this.lineages) if (this.lineages.hasOwnProperty(k) && this.shown(+k) === id) {
      var L = this.lineages[k]; s.deaths += L.deaths; s.patch += L.patch; s.pred += L.pred; s.starved += L.starved; s.ageSum += L.ageSum; s.meals += L.meals;
    }
    return s;
  },
  why: function (id) {
    var s = this.stats(id), life = s.deaths ? Math.round(s.ageSum / s.deaths) : 0, meals = s.deaths ? (s.meals / s.deaths).toFixed(1) : '\u2013';
    return s.deaths ? ' \u00b7 lives ' + life + ' ticks, ' + meals + ' meals a life \u00b7 died: patch ' + Math.round(100 * s.patch / s.deaths) + '%, predator ' + Math.round(100 * s.pred / s.deaths) + '%, hunger ' + Math.round(100 * s.starved / s.deaths) + '%' : ' \u00b7 no deaths yet';
  },
  sample: function () {
    this.promote();
    var counts = this.shownCounts(), i;
    for (var id in counts) if (counts.hasOwnProperty(id) && this.lineageOrder.indexOf(+id) < 0) this.lineageOrder.push(+id);
    this.samples.push({ t: this.tick0, counts: counts }); if (this.samples.length > 220) this.samples.shift();
    var seen = {}; for (i = 0; i < this.samples.length; i++) for (var k in this.samples[i].counts) if (this.samples[i].counts[k] > 0) seen[k] = true;
    this.lineageOrder = this.lineageOrder.filter(function (id) { return seen[id]; });
  },
  tick: function () {
    var s = slowTicks(this); this.ticked = s !== 0;
    if (s === 0) return;
    if (s === 1) { this.stepPlate(); this.tps = this.paused ? 0 : 60 / SLOW[this.slow][1]; return; }
    var t0 = performance.now(), n = 0, budget = this.turbo ? 24 : 0;
    do { this.stepPlate(); n++; } while (performance.now() - t0 < budget && n < 400);
    this.tps = this.tps * 0.9 + (n * 60) * 0.1;
  },
  click: function (x, y) {
    var near = null, nd = 14;
    for (var i = 0; i < this.worms.length; i++) { var d = dist(x, y, this.worms[i].x, this.worms[i].y); if (d < nd) { nd = d; near = this.worms[i]; } }
    if (near) { this.pick = this.shown(near.lineage); this.focus = near; return; }
    this.env.patch.x = x; this.env.patch.y = y;
  },
  draw: function () {
    clearPlate(); drawPatch(this.env.patch);
    var i, env = this.env;
    for (i = 0; i < env.food.length; i++) if (env.food[i].t === 0) drawFood(env.food[i].x, env.food[i].y, 4);
    var counts = this.shownCounts(), own = this.aliveCounts(), best = null, bestN = -1;
    for (var id in counts) if (counts.hasOwnProperty(id) && counts[id] > bestN) { bestN = counts[id]; best = +id; }
    for (i = 0; i < this.worms.length; i++) { var w = this.worms[i]; var sh = this.lineages[this.shown(w.lineage)]; drawWorm(w.x, w.y, w.h, 34, 4.5, 'hsl(' + Math.round(sh ? sh.hue : w.hue) + ' 65% ' + (w.inPatch ? '35%' : '48%') + ')', w.phase, 0.95); }
    if (this.predatorOn && this.predator) { var p = this.predator; drawWorm(p.x, p.y, p.h, 60, 8, T.harm, p.phase, p.rest > 0 ? 0.6 : 1); }
    if (this.pick !== null && !counts[this.pick]) this.pick = null;   // the picked lineage died out
    var want = this.pick !== null ? this.pick : best;
    if (!this.focus || this.shown(this.focus.lineage) !== want) { this.focus = null; for (i = 0; i < this.worms.length; i++) if (this.shown(this.worms[i].lineage) === want) { this.focus = this.worms[i]; break; } }
    setText('l4who', this.pick !== null ? 'Lineage ' + this.pick + ', picked' : 'The biggest lineage\u2019s brain');
    if (this.focus) {
      ctx.beginPath(); ctx.arc(this.focus.x, this.focus.y, 12, 0, Math.PI * 2); ctx.strokeStyle = T.fg; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      var fc = this.focus.brain.c;
      if (fc.neuronCount > this.els.length) { for (i = this.els.length; i < fc.neuronCount; i++) addCellToGrid(document.getElementById('l4cells'), this.els, fc, i); this.glow = new Float32Array(this.els.length); }
      paintCells(this.els, this.focus.brain, this.glow, this.slow > 0 || this.paused ? (this.ticked ? 0.3 : 1) : 0.82);
      setText('l4fire', 'firing now: ' + firingSummary(this.focus.brain));
      showNames(this, 'l4names', this.focus.brain);
      var m = this.focus.mutations, wl = want, ms = '<b>lineage ' + wl + ', ' + (counts[wl] || 0) + ' alive, ' + m.length + ' inherited change' + (m.length === 1 ? '' : 's') + ', learns at ' + this.focus.eta.toFixed(2) + '</b>' +
        '<br>this worm: ' + this.focus.age + ' ticks old, ' + this.focus.eaten + ' meal' + (this.focus.eaten === 1 ? '' : 's') + ', energy ' + Math.round(this.focus.energy) + (this.focus.inPatch ? ', in the patch' : '') + '<br>' + this.why(wl).slice(3);
      for (i = Math.max(0, m.length - 12); i < m.length; i++) ms += '<br>' + esc(m[i]);
      if (m.length === 0) ms += '<br>the starting table, ASH cut, nothing inherited yet';
      document.getElementById('l4mut').innerHTML = ms;
    }
    setText('l4pop', this.worms.length); setText('l4lines', Object.keys(counts).length); setText('l4births', this.births); setText('l4pd', this.patchDeaths); setText('l4pr', this.predDeaths); setText('l4st', this.starved); setText('l4tps', Math.round(this.tps));
    if (frame < 3 || (frame & 7) === 0) this.drawChart(counts);
  },
  drawChart: function (counts) {
    var S = this.samples, order = this.lineageOrder, Wd = 420, Hd = 150, padL = 30, padB = 18, padT = 6;
    if (S.length < 2) { document.getElementById('l4chart').innerHTML = '<svg viewBox="0 0 420 150"><text x="30" y="80" font-size="12" fill="var(--muted)" font-family="var(--body)">the first sample arrives after 40 ticks</text></svg>'; return; }
    var maxT = 0, i, j; for (i = 0; i < S.length; i++) { var tot = 0; for (j = 0; j < order.length; j++) tot += S[i].counts[order[j]] || 0; if (tot > maxT) maxT = tot; }
    maxT = Math.max(10, Math.ceil(maxT / 10) * 10);
    var x = function (i) { return padL + (Wd - padL - 6) * i / (S.length - 1); }, y = function (v) { return padT + (Hd - padT - padB) * (1 - v / maxT); };
    var svg = '<svg viewBox="0 0 ' + Wd + ' ' + Hd + '" role="img" aria-label="worms alive per lineage over time">';
    for (var g = 0; g <= maxT; g += maxT / 2) svg += '<line x1="' + padL + '" x2="' + (Wd - 6) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="var(--line)" stroke-width="1"/><text x="' + (padL - 4) + '" y="' + (y(g) + 4) + '" text-anchor="end" font-size="10" fill="var(--muted)" font-family="var(--mono)">' + g + '</text>';
    var base = []; for (i = 0; i < S.length; i++) base.push(0);
    for (j = 0; j < order.length; j++) {
      var id = order[j], L = this.lineages[id]; if (!L) continue; var hue = L.hue, top = [], d = '';
      for (i = 0; i < S.length; i++) top.push(base[i] + (S[i].counts[id] || 0));
      for (i = 0; i < S.length; i++) d += (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(top[i]).toFixed(1);
      for (i = S.length - 1; i >= 0; i--) d += 'L' + x(i).toFixed(1) + ',' + y(base[i]).toFixed(1);
      svg += '<path d="' + d + 'Z" fill="hsl(' + Math.round(hue) + ' 65% 50%)" fill-opacity=".85" stroke="var(--paper)" stroke-width="1"/>';
      base = top;
    }
    svg += '<text x="' + padL + '" y="' + (Hd - 4) + '" font-size="10" fill="var(--muted)" font-family="var(--mono)">tick ' + S[0].t + '</text><text x="' + (Wd - 6) + '" y="' + (Hd - 4) + '" text-anchor="end" font-size="10" fill="var(--muted)" font-family="var(--mono)">tick ' + S[S.length - 1].t + '</text></svg>';
    document.getElementById('l4chart').innerHTML = svg;
    var ids = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 8), lin = '';
    if (this.pick !== null && counts[this.pick] && ids.indexOf(String(this.pick)) < 0) ids.push(String(this.pick));
    for (i = 0; i < ids.length; i++) {
      L = this.lineages[ids[i]]; if (!L) continue;
      lin += '<div data-lineage="' + ids[i] + '"' + (String(this.pick) === ids[i] ? ' class="picked"' : '') + '><i style="background:hsl(' + Math.round(L.hue) + ' 65% 50%)"></i><span><b>' + counts[ids[i]] + '</b> ' + esc(L.note) + this.why(+ids[i]) + '</span></div>';
    }
    document.getElementById('l4lin').innerHTML = lin;
  }
};

/* ───────────── Level 5: the debate ───────────── */
var LENSES = [
  { id: 'lab', name: 'The lab', who: 'mechanism' },
  { id: 'arm', name: 'The armchair', who: 'philosophy' },
  { id: 'rn', name: 'Responsive Naturing', who: 'James M. Corrigan&rsquo;s paradigm' },
  { id: 'sup', name: 'The supernatural', who: 'a soul, or a spark' }
];
var LENS_TEXT = {
  1: { lab: 'Two sensors wired to two motors. Fear and love are the observer&rsquo;s words for which wire goes where.',
       arm: 'Braitenberg&rsquo;s point is that a mechanism is easy to build and hard to analyse. We read feeling into anything that moves on its own.',
       rn: 'Corrigan keeps causality for random collections of matter and reserves his own description, naturing, for things with a lifespan. The vehicle has no lifespan. Causality is its whole story. <em>Fear</em> is what his theory would call a decoration, added by the person watching.',
       sup: 'Nobody is home. No tradition has ever placed a soul in two wires, which makes this the one tab where every lens agrees.' },
  2: { lab: 'This is a reflex arc with eight cell classes. Tap, reverse, habituate. Each step is a measured synapse. The 1985 ablations are repeated by a click.',
       arm: 'Thomas Nagel&rsquo;s test: is there something it is like to be tapped? The wiring answers what the worm does, never that.',
       rn: 'A worm has a lifespan, so by Corrigan&rsquo;s definition it belongs to Life and to naturing, not to causality alone. The reflex is the causal description. His Biphasic Perception puts a first phase of immediate recognition before any felt experience. Can eight cells hold that first phase?',
       sup: 'Here the line gets drawn for the first time: is a worm alive in the way that matters? Many traditions say any animal has a spark; some stop at animals that can suffer.' },
  3: { lab: 'Here are 300 named cells and 3,689 counted synapses, run by a rule anyone can read. It behaves. The behaviour is not the one the press reported.',
       arm: 'John Tyndall, 1868: the passage from the physics of the brain to the facts of consciousness is unthinkable. David Chalmers called that the hard problem in 1994. This tab is all physics.',
       rn: 'Corrigan notes that neuroscience relies on patterns of brain activity as its correlates of consciousness. The 300 squares are such a pattern. In his theory, cognizance is what recognises patterns. The lit squares are something a cognizance could recognise, never the place where recognising happens.',
       sup: 'If a soul is what animates, this worm has none and the real worm may. The two behave by the same table. What the difference would look like on the plate is the open question.' },
  4: { lab: 'Mutation is random and selection is death. The colours spread without anyone deciding. This is Darwin on a Sunday afternoon.',
       arm: 'The worms learn, evolve, flee and avoid. Every word in that sentence is about behaviour. The hard problem is untouched by all of them.',
       rn: 'Responsive Naturing describes the genesis of Life. This plate is a genesis by mutation and death. Every worm on it has a lifespan and no mass. Is a lineage of these worms Life in his sense, or a collection of matter wearing a lifespan? His Cognizant Gravitation Only says matter is how we perceive geometries of gravitation. These worms are not matter at all.',
       sup: 'If the spark were given at the start and copied at each split, the plate would look exactly as it does. If it were not, the plate would look exactly as it does.' }
};
var STANCES = [['nobody', 'Nobody is home'], ['something', 'Something is home'], ['unknowable', 'Cannot be known'], ['mistaken', 'The question is mistaken']];
function stanceGet(level) { try { return localStorage.getItem('worm-plate-stance-' + level) || ''; } catch (e) { return ''; } }
function stanceSet(level, v) { try { localStorage.setItem('worm-plate-stance-' + level, v); } catch (e) {} }
function renderLenses(level) {
  var h = '<h2>Four ways of looking at this tab</h2><div class="lenses">';
  for (var i = 0; i < LENSES.length; i++) { var L = LENSES[i]; h += '<div class="lens"><h3>' + L.name + '<small>' + L.who + '</small></h3><p>' + LENS_TEXT[level][L.id] + '</p></div>'; }
  h += '</div><div class="stance"><span>Your call on this tab: is anyone home?</span>';
  var cur = stanceGet(level);
  for (i = 0; i < STANCES.length; i++) h += '<label><input type="radio" name="stance' + level + '" id="stance' + level + '_' + STANCES[i][0] + '" value="' + STANCES[i][0] + '"' + (cur === STANCES[i][0] ? ' checked' : '') + '> ' + STANCES[i][1] + '</label>';
  h += '</div>';
  var box = document.createElement('div'); box.innerHTML = h; notesEl.appendChild(box);
  var radios = box.querySelectorAll('input[type=radio]');
  for (i = 0; i < radios.length; i++) radios[i].addEventListener('change', function () { stanceSet(level, this.value); });
}
var L5 = {
  name: 'the debate', phase: 0,
  enter: function () {
    ctlEl.innerHTML = ''; legendEl.innerHTML = '';
    var h = '<h2>Where each lens draws the line</h2><table class="lines"><tr><th></th>';
    var tabs = ['Two cells', 'Touch circuit', 'The full 302', 'Evolution plate'];
    for (var t = 0; t < 4; t++) h += '<th>' + tabs[t] + '</th>';
    h += '</tr>';
    var marks = { lab: ['no', 'no', 'no instrument', 'no instrument'], arm: ['no', 'unanswered', 'unanswered', 'unanswered'], rn: ['matter, causality', 'a lifespan: Life', 'a pattern to recognise', 'a genesis, or a copy of one?'], sup: ['no', 'the line?', 'the line?', 'the line?'] };
    for (var i = 0; i < LENSES.length; i++) { h += '<tr><th>' + LENSES[i].name + '</th>'; for (t = 0; t < 4; t++) h += '<td>' + marks[LENSES[i].id][t] + '</td>'; h += '</tr>'; }
    h += '<tr><th>You</th>';
    var names = {}; for (i = 0; i < STANCES.length; i++) names[STANCES[i][0]] = STANCES[i][1].toLowerCase();
    for (t = 1; t <= 4; t++) { var s = stanceGet(t); h += '<td>' + (s ? names[s] : '<span class="hint">not yet</span>') + '</td>'; }
    h += '</tr></table><p class="hint">Your row is what you ticked at the bottom of each tab. It stays in this browser only.</p>';
    brainEl.innerHTML = h;
    notesEl.innerHTML = '<h2>The debate</h2>' +
      '<p>The lab can show what every cell does and still has no instrument that reads whether anyone is home. The armchair says that is not an accident of today&rsquo;s instruments. Tyndall said it in 1868 and Chalmers named it in 1994. Corrigan says the gap is ours. In his words, the problem of consciousness is our cognitive limitation to understand the problem. The ladder of levels, he writes, comes from assuming only material interactions matter. His own description starts from the lifespan, not the matter. The supernatural lens says something is given to the living that no table holds.</p>' +
      '<p>The plate puts one question to all four. Four brains sit on the same dish and behave. Point at the tab where you stopped saying <em>nobody is home</em>. Then say what changed between that tab and the one before it. If nothing on the plate changed, the line came from you. That is Braitenberg&rsquo;s claim. If something did, name the cell.</p>' +
      '<p>James M. Corrigan is a philosopher (PhD), an award-winning university lecturer, a contemplative scientist and, for thirty years, a software engineer. His dissertation, <em>There is a Way of Seeing the World Different</em>, argued that science and spirituality can be united without the duality. His paradigm, Responsive Naturing, describes the genesis of Life, which for him is everything with an ontogenetic lifespan. Causality is left to random collections of matter.</p>' +
      '<p>Two theories stand on that paradigm. Biphasic Perception: a first phase of immediate recognition by cognizance, the hyperphantasic perception of the world we directly experience, then a second phase that decorates the recognition into subjective experience. Cognizant Gravitation Only: materiality and nonmateriality as one indivisible totality, in which matter is how we perceive complex geometries of gravitation, after the later Einstein and John Wheeler&rsquo;s geons. The sentences on these tabs come from his public bio and the readable parts of his site.</p>';
  },
  tick: function () { this.phase += 0.05; },
  click: function () {},
  draw: function () {
    clearPlate();
    var cx = CX, cy = CY, cols = [T.fg, T.accent, T.patch, T.food];
    for (var i = 0; i < 4; i++) { var a = this.phase * 0.3 + i * Math.PI / 2, r = 150; drawWorm(cx + Math.cos(a) * r, cy + Math.sin(a) * r, a + Math.PI / 2, 60, 7, cols[i], this.phase + i, 1); }
    ctx.font = '600 20px ' + 'Barlow Condensed, sans-serif'; ctx.fillStyle = T.muted; ctx.textAlign = 'center';
    ctx.fillText('is anyone home?', cx, cy + 7);
  }
};

/* ───────────── the bench ───────────── */
var levels = { 1: L1, 2: L2, 3: L3, 4: L4, 5: L5 }, current = null, frame = 0;
function show(n) {
  current = levels[n]; current.enter();
  var tabs = document.querySelectorAll('nav.levels button');
  for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute('aria-selected', tabs[i].getAttribute('data-level') === String(n) ? 'true' : 'false');
  try { localStorage.setItem('worm-plate-level', String(n)); } catch (e) {}
}
var tabs = document.querySelectorAll('nav.levels button');
for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener('click', function () { show(+this.getAttribute('data-level')); });
canvas.addEventListener('click', function (ev) {
  var r = canvas.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width, y = (ev.clientY - r.top) * H / r.height;
  if (dist(x, y, CX, CY) < PR - 10 && current && current.click) current.click(x, y);
});
function loop() {
  frame++;
  if ((frame & 31) === 1) readTokens();
  if (current) { current.tick(); current.draw(); }
  requestAnimationFrame(loop);
}
readTokens();
var start = 1; try { var saved = +localStorage.getItem('worm-plate-level'); if (saved >= 1 && saved <= 5) start = saved; } catch (e) {}
var hash = +(location.hash || '').replace('#', ''); if (hash >= 1 && hash <= 5) start = hash;
window.__plate = { levels: levels, show: show };
show(start);
requestAnimationFrame(loop);
})();
