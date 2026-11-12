/* The Worm Plate — what the cell names mean, by class prefix, from WormAtlas. Plain words for the page. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.WormGloss = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // [prefix, group, plain words]. Longer prefixes first where they share letters.
  var TABLE = [
    ['ASH', 'pain', 'pain cell (nose: toxins, high salt, hard touch)'],
    ['ADL', 'smell', 'bad-smell cell (repellents, predator scent)'],
    ['ASK', 'smell', 'taste cell (pheromones, some repellents)'],
    ['ADF', 'smell', 'food-smell cell (serotonin)'], ['ASG', 'smell', 'food-smell cell'], ['ASI', 'smell', 'food-smell cell (also senses crowding)'], ['ASJ', 'smell', 'food-smell cell'],
    ['ASE', 'smell', 'salt-taste cell'], ['AWA', 'smell', 'odour cell (attractive smells)'], ['AWB', 'smell', 'odour cell (repellent smells)'], ['AWC', 'smell', 'odour cell (attractive smells)'],
    ['IL2', 'smell', 'nose chemical sensor'], ['PHA', 'smell', 'tail chemical sensor'], ['PHB', 'smell', 'tail chemical sensor'], ['NSM', 'smell', 'food-signal cell (serotonin)'],
    ['AFD', 'smell', 'temperature cell'], ['BAG', 'smell', 'gas cell (carbon dioxide, oxygen)'], ['URX', 'smell', 'oxygen cell'], ['AQR', 'smell', 'oxygen cell'], ['PQR', 'smell', 'oxygen cell'],
    ['ALM', 'touch', 'gentle-touch cell, head'], ['AVM', 'touch', 'gentle-touch cell, head'], ['PLM', 'touch', 'gentle-touch cell, tail'], ['PVM', 'touch', 'gentle-touch cell, tail'],
    ['FLP', 'touch', 'nose-touch cell (harsh)'], ['OLQ', 'touch', 'nose-touch cell'], ['OLL', 'touch', 'nose-touch cell'], ['IL1', 'touch', 'nose-touch cell, also moves the head'], ['CEP', 'touch', 'head-texture cell (dopamine)'],
    ['ADE', 'touch', 'head-texture cell (dopamine)'], ['PDE', 'touch', 'body-texture cell (dopamine)'], ['PVD', 'touch', 'harsh-touch cell, body'], ['DVA', 'touch', 'body-stretch cell'],
    ['AVA', 'command', 'command cell: go backwards'], ['AVB', 'command', 'command cell: go forwards'], ['AVD', 'command', 'command cell: backwards after a head touch'], ['AVE', 'command', 'command cell: backwards'], ['PVC', 'command', 'command cell: forwards after a tail touch'],
    ['AIA', 'inter', 'first-layer interneuron (smell and taste)'], ['AIB', 'inter', 'first-layer interneuron (turning)'], ['AIY', 'inter', 'first-layer interneuron (smell, temperature)'], ['AIZ', 'inter', 'first-layer interneuron (steering to food)'],
    ['RIM', 'inter', 'reversal interneuron (tyramine)'], ['RIA', 'inter', 'head-steering interneuron'], ['RIB', 'inter', 'speed interneuron'], ['RIV', 'inter', 'turn interneuron'], ['RIS', 'inter', 'sleep interneuron'], ['ALA', 'inter', 'sleep interneuron'],
    ['RMD', 'headmotor', 'head motor neuron'], ['RME', 'headmotor', 'head motor neuron (inhibitory)'], ['RMF', 'headmotor', 'head motor neuron'], ['RMG', 'headmotor', 'head hub interneuron'], ['RMH', 'headmotor', 'head motor neuron'],
    ['SMD', 'headmotor', 'head and neck motor neuron'], ['SMB', 'headmotor', 'neck motor neuron'], ['SAA', 'headmotor', 'neck motor neuron'], ['SAB', 'headmotor', 'neck motor neuron'], ['SIA', 'headmotor', 'neck motor neuron'], ['SIB', 'headmotor', 'neck motor neuron'],
    ['URA', 'headmotor', 'head motor neuron'], ['URB', 'inter', 'head interneuron'], ['URY', 'inter', 'head interneuron'],
    ['DA', 'motorA', 'body motor neuron, backward wave (dorsal)'], ['VA', 'motorA', 'body motor neuron, backward wave (ventral)'], ['AS', 'motorA', 'body motor neuron (dorsal)'],
    ['DB', 'motorB', 'body motor neuron, forward wave (dorsal)'], ['VB', 'motorB', 'body motor neuron, forward wave (ventral)'],
    ['DD', 'motorD', 'inhibitory motor neuron (dorsal)'], ['VD', 'motorD', 'inhibitory motor neuron (ventral)'],
    ['VC', 'egg', 'egg-laying motor neuron'], ['HSN', 'egg', 'egg-laying neuron (serotonin)'],
    ['MC', 'pharynx', 'pharynx pacemaker (pumping)'], ['MI', 'pharynx', 'pharynx neuron'], ['M1', 'pharynx', 'pharynx motor neuron'], ['M2', 'pharynx', 'pharynx motor neuron'], ['M3', 'pharynx', 'pharynx motor neuron'], ['M4', 'pharynx', 'pharynx motor neuron'], ['M5', 'pharynx', 'pharynx motor neuron'],
    ['I1', 'pharynx', 'pharynx interneuron'], ['I2', 'pharynx', 'pharynx interneuron'], ['I3', 'pharynx', 'pharynx interneuron'], ['I4', 'pharynx', 'pharynx interneuron'], ['I5', 'pharynx', 'pharynx interneuron'], ['I6', 'pharynx', 'pharynx interneuron'],
    ['MDL', 'muscle', 'body muscle, dorsal left'], ['MDR', 'muscle', 'body muscle, dorsal right'], ['MVL', 'muscle', 'body muscle, ventral left'], ['MVR', 'muscle', 'body muscle, ventral right'], ['MVU', 'muscle', 'vulval muscle'], ['MANAL', 'muscle', 'anal muscle'],
    ['N', 'new', 'a cell evolution added']
  ];
  var GROUPS = [
    ['smell', 'smell and taste'], ['touch', 'touch'], ['pain', 'pain'], ['command', 'command cells'], ['inter', 'interneurons'], ['headmotor', 'head and neck motor'],
    ['motorA', 'body motor, backward'], ['motorB', 'body motor, forward'], ['motorD', 'body motor, inhibitory'], ['egg', 'egg laying'], ['pharynx', 'pharynx (feeding)'], ['new', 'added by evolution'], ['muscle', 'muscles']
  ];
  var cache = {};
  function lookup(name) {
    if (cache[name]) return cache[name];
    var best = null;
    for (var i = 0; i < TABLE.length; i++) { var p = TABLE[i][0]; if (name.indexOf(p) === 0 && (!best || p.length > best[0].length)) best = TABLE[i]; }
    if (best && best[0] === 'N' && !/^N\d+$/.test(name)) best = null;
    cache[name] = best || [name, 'inter', 'interneuron'];
    return cache[name];
  }
  function group(name) { return lookup(name)[1]; }
  function words(name) { return lookup(name)[2]; }
  function groupLabel(g) { for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i][0] === g) return GROUPS[i][1]; return g; }
  return { group: group, words: words, groupLabel: groupLabel, GROUPS: GROUPS };
});
