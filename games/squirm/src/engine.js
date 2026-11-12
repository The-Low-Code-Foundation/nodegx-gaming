/* The Worm Plate — engine. Plain ES5-style JS (no Map/for-of) so it can later sit in a NodeGX library module.
 * Level 3 runs Busbice's 2014 connectome rule exactly: every cell accumulates weighted input; when |acc| > 30 it
 * fires its whole row into its targets and resets; muscles never fire, their accumulators are summed left vs right
 * each tick and zeroed (motorcontrol). A sensory stimulus is "dendriteAccumulate": the cell fires unconditionally. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.WormEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var THRESHOLD = 30;

  function Connectome(data) {
    // data: { neurons: [...], muscles: [...], table: { pre: { post: w } } }
    this.names = data.neurons.concat(data.muscles);
    this.index = {};
    for (var i = 0; i < this.names.length; i++) this.index[this.names[i]] = i;
    this.n = this.names.length;
    this.neuronCount = data.neurons.length;
    this.muscleEnd = this.n;   // SQUIRM: cells past here were added by evolution (addNeuron appends after the muscles)
    // rows as flat arrays: rowT[i] = [target index...], rowW[i] = [weight...]
    this.rowT = []; this.rowW = [];
    for (i = 0; i < this.n; i++) { this.rowT.push([]); this.rowW.push([]); }
    for (var pre in data.table) if (Object.prototype.hasOwnProperty.call(data.table, pre)) {
      var pi = this.index[pre]; if (pi === undefined) continue;
      var row = data.table[pre];
      for (var post in row) if (Object.prototype.hasOwnProperty.call(row, post)) {
        var qi = this.index[post]; if (qi === undefined) continue;
        this.rowT[pi].push(qi); this.rowW[pi].push(row[post]);
      }
    }
    this.left = []; this.right = [];
    for (i = this.neuronCount; i < this.n; i++) {
      var m = this.names[i];
      if (m.charAt(2) === 'L') this.left.push(i); else if (m.charAt(2) === 'R') this.right.push(i);
    }
  }
  Connectome.prototype.clone = function () {
    var c = Object.create(Connectome.prototype);
    c.names = this.names.slice(); c.index = {}; for (var i = 0; i < c.names.length; i++) c.index[c.names[i]] = i;
    c.n = this.n; c.neuronCount = this.neuronCount; c.muscleEnd = this.muscleEnd;
    c.rowT = []; c.rowW = [];
    var W = this.rowW0 || this.rowW;   // the genome: learned changes (rowW) die with the worm
    for (i = 0; i < this.n; i++) { c.rowT.push(this.rowT[i].slice()); c.rowW.push(W[i].slice()); }
    c.left = this.left.slice(); c.right = this.right.slice();
    return c;
  };
  /** Learning touches rowW; the inherited weights are kept in rowW0 the first time, and a learned weight stays within ±bound of them. */
  Connectome.prototype.learnWeight = function (pre, k, delta, bound) {
    if (!this.rowW0) { this.rowW0 = []; for (var i = 0; i < this.n; i++) this.rowW0.push(this.rowW[i].slice()); }
    var w0 = this.rowW0[pre][k], w = this.rowW[pre][k] + delta;
    if (w > w0 + bound) w = w0 + bound; else if (w < w0 - bound) w = w0 - bound;
    this.rowW[pre][k] = w;
  };
  Connectome.prototype.synapseCount = function () { var s = 0; for (var i = 0; i < this.n; i++) s += this.rowT[i].length; return s; };
  /** Remove every outgoing synapse of a cell (a laser ablation of its axon). Returns how many were cut. */
  Connectome.prototype.cutOutputs = function (name) {
    var i = this.index[name]; if (i === undefined) return 0;
    var k = this.rowT[i].length; this.rowT[i] = []; this.rowW[i] = []; return k;
  };
  Connectome.prototype.addSynapse = function (pre, post, w) {
    this.rowW0 = null;
    var pi = this.index[pre], qi = this.index[post];
    for (var k = 0; k < this.rowT[pi].length; k++) if (this.rowT[pi][k] === qi) { this.rowW[pi][k] += w; return 'strengthened'; }
    this.rowT[pi].push(qi); this.rowW[pi].push(w); return 'new';
  };
  /** NEAT-style: a new neuron spliced into an existing synapse pre→post becomes pre→new→post. */
  Connectome.prototype.addNeuron = function (name, pre, post) {
    this.rowW0 = null;
    var ni = this.n; this.names.push(name); this.index[name] = ni; this.n++;
    this.rowT.push([]); this.rowW.push([]);
    var pi = this.index[pre], qi = this.index[post], w = 1;
    for (var k = 0; k < this.rowT[pi].length; k++) if (this.rowT[pi][k] === qi) { w = this.rowW[pi][k]; this.rowT[pi].splice(k, 1); this.rowW[pi].splice(k, 1); break; }
    // the new cell must itself be able to fire: it needs > THRESHOLD of input. Give it a strong input and the old weight out.
    this.rowT[pi].push(ni); this.rowW[pi].push(THRESHOLD + 1);
    this.rowT[ni].push(qi); this.rowW[ni].push(w);
    return ni;
  };

  function Brain(connectome) {
    this.c = connectome;
    this.acc = new Float64Array(connectome.n);
    this.fired = new Uint8Array(connectome.n);   // what fired this tick (for drawing)
    this.plastic = null;                          // optional learning state
    this.ablated = {};                            // name -> true
    this.ablatedMask = null;                      // Uint8Array when any cell is ablated
    this.L = 0; this.R = 0;
  }
  Brain.prototype.resize = function () {
    if (this.acc.length !== this.c.n) {
      var a = new Float64Array(this.c.n); a.set(this.acc.subarray(0, Math.min(this.acc.length, this.c.n)));
      this.acc = a; this.fired = new Uint8Array(this.c.n); if (this.ablatedMask) { var m = new Uint8Array(this.c.n); m.set(this.ablatedMask.subarray(0, Math.min(this.ablatedMask.length, this.c.n))); this.ablatedMask = m; }
    }
  };
  /** dendriteAccumulate: a stimulus makes a sensory cell fire now. */
  Brain.prototype.ablate = function (name, on) {
    this.ablated[name] = !!on; var any = false; for (var k in this.ablated) if (this.ablated[k]) any = true;
    if (!any) { this.ablatedMask = null; return; }
    this.ablatedMask = new Uint8Array(this.c.n); for (k in this.ablated) if (this.ablated[k] && this.c.index[k] !== undefined) this.ablatedMask[this.c.index[k]] = 1;
  };
  Brain.prototype.stimulate = function (name) {
    var i = this.c.index[name]; if (i === undefined || this.ablated[name]) return;
    this.fireInto(i, this.acc); this.fired[i] = 1;
  };
  Brain.prototype.fireInto = function (i, acc) {
    var T = this.c.rowT[i], W = this.c.rowW[i];
    for (var k = 0; k < T.length; k++) acc[T[k]] += W[k];
  };
  /** One tick of Busbice's runconnectome + motorcontrol. */
  Brain.prototype.tick = function () {
    this.resize();
    var c = this.c, acc = this.acc, n = c.neuronCount, i;
    var firing = [], mask = this.ablatedMask, fired = this.fired, v;
    if (!this.keepFired) fired.fill(0);
    this.keepFired = false;
    for (i = 0; i < n; i++) { v = acc[i]; if ((v > THRESHOLD || v < -THRESHOLD) && !(mask && mask[i])) firing.push(i); }
    // SQUIRM fix (Worm Plate engine bug): an added cell sits after the muscles, so the loop above never let it fire.
    for (i = c.muscleEnd || c.n; i < c.n; i++) { v = acc[i]; if ((v > THRESHOLD || v < -THRESHOLD) && !(mask && mask[i])) firing.push(i); }
    for (var f = 0; f < firing.length; f++) { i = firing[f]; this.fireInto(i, acc); acc[i] = 0; this.fired[i] = 1; }
    var L = 0, R = 0;
    for (i = 0; i < c.left.length; i++) { L += acc[c.left[i]]; acc[c.left[i]] = 0; }
    for (i = 0; i < c.right.length; i++) { R += acc[c.right[i]]; acc[c.right[i]] = 0; }
    this.L = L; this.R = R; this.firingCount = firing.length;
    return firing;
  };
  /** Busbice's motorcontrol read as a body command: speed 0..1 and a turn in -1..1, sign = forward/back. */
  Brain.prototype.motor = function () {
    var L = this.L, R = this.R, speed = Math.abs(L) + Math.abs(R);
    if (speed === 0) return { v: 0, turn: 0 };
    var v = Math.min(150, Math.max(75, speed)) / 150;
    var turn = 0, dir = 0;
    if (R <= 0 && L < 0) { dir = -1; var tr = R / L; if (tr <= 0.6) turn = -1; else if (tr >= 2) turn = 1; }
    else if (R >= 0 && L > 0) { dir = 1; tr = R / L; if (tr <= 0.6) turn = -1; else if (tr >= 2) turn = 1; }
    else if (R <= 0 && L >= 0) { dir = 0; turn = 1; }
    else if (R >= 0 && L <= 0) { dir = 0; turn = -1; }
    return { v: dir * v, turn: turn, L: L, R: R };
  };

  // The stimulus sets Busbice used, straight from his main loop.
  var SENSE = {
    noseTouch: ['FLPR', 'FLPL', 'ASHL', 'ASHR', 'IL1VL', 'IL1VR', 'OLQDL', 'OLQDR', 'OLQVR', 'OLQVL'],
    food: ['ADFL', 'ADFR', 'ASGR', 'ASGL', 'ASIL', 'ASIR', 'ASJR', 'ASJL'],
    harm: ['ASHL', 'ASHR'],               // the nociceptor pair (copper, quinine, high salt)
    noseTouchNoASH: ['FLPR', 'FLPL', 'IL1VL', 'IL1VR', 'OLQDL', 'OLQDR', 'OLQVR', 'OLQVL'],
    tailTouch: ['PLML', 'PLMR', 'PVDL', 'PVDR'],
    predator: ['ADLL', 'ADLR', 'ASKL', 'ASKR']   // Pristionchus scent: sulfolipids sensed by ADL and ASK (ASH too, cut on the plate)
  };

  return { THRESHOLD: THRESHOLD, Connectome: Connectome, Brain: Brain, SENSE: SENSE };
});
