// Es war einmal in Ost-Berlin: the engine. Rooms are data (rooms-*.js); this file draws them and
// keeps the sticker album. Everything is one left click: no drag, no keys, no scrolling.
// Written in ES2015 with plain scripts so that an older TV browser runs it.
'use strict';

// Who grew up here: 'Mama' or 'Papa', picked on the title screen and kept in the save (S.who).
// Every {M} in a text becomes it, and every card's question says "Frag Mama:" or "Frag Papa:".
var WHO = 'Mama';

// ---- drawing helpers: every picture in the game is made of these ------------------------------
var NS = ' stroke="none"';
function r(x, y, w, h, f, rx, a) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + f + '"' + (rx ? ' rx="' + rx + '"' : '') + (a ? ' ' + a : '') + '/>'; }
function c(x, y, rad, f, a) { return '<circle cx="' + x + '" cy="' + y + '" r="' + rad + '" fill="' + f + '"' + (a ? ' ' + a : '') + '/>'; }
function e(x, y, rx, ry, f, a) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"' + (a ? ' ' + a : '') + '/>'; }
function p(d, f, a) { return '<path d="' + d + '" fill="' + (f || 'none') + '"' + (a ? ' ' + a : '') + '/>'; }
function l(x1, y1, x2, y2, col, w) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + (col || '#3b2b22') + '" stroke-width="' + (w || 3) + '" stroke-linecap="round"/>'; }
function t(s, x, y, size, f, a) { return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + (f || '#33241b') + '" font-weight="bold" text-anchor="middle" stroke="none"' + (a ? ' ' + a : '') + '>' + s + '</text>'; }
function star(x, y, s, f) { return p('M0,-10 L3,-3 L10,-3 L4.5,2 L6.5,9.5 L0,5 L-6.5,9.5 L-4.5,2 L-10,-3 L-3,-3 Z', f || '#ffd45e', 'transform="translate(' + x + ',' + y + ') scale(' + s + ')"'); }
var INK = '<g stroke="#3b2b22" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">';

// ---- the game's data and its saved state -----------------------------------------------------
var G = { rooms: {}, order: [], items: {}, cur: 'title', quest: null };
var S = (function () {
  var j = {};
  try { j = JSON.parse(localStorage.getItem('ostberlin1') || '{}') || {}; } catch (err) { j = {}; }
  j.found = j.found || {}; j.done = j.done || {};
  return j;
})();
if (S.who === 'Mama' || S.who === 'Papa') WHO = S.who;
function save() { try { localStorage.setItem('ostberlin1', JSON.stringify(S)); } catch (err) { /* a TV may refuse storage */ } }

function room(def) {
  G.rooms[def.id] = def; G.order.push(def.id);
  def.items.forEach(function (it) { it.room = def.id; G.items[it.id] = it; });
}
function tx(s) { return String(s || '').replace(/\{M\}/g, WHO); }
function count(id) {
  var n = 0, items = G.rooms[id].items;
  items.forEach(function (it) { if (S.found[it.id]) n++; });
  return { n: n, of: items.length };
}
function total() {
  var n = 0, of = 0;
  G.order.forEach(function (id) { var k = count(id); n += k.n; of += k.of; });
  return { n: n, of: of };
}

// ---- sound: a few synthesised notes, nothing recorded ----------------------------------------
var AC = null;
function ac() {
  if (S.mute) return null;
  try {
    if (!AC) { var K = window.AudioContext || window.webkitAudioContext; if (!K) return null; AC = new K(); }
    if (AC.state === 'suspended' && AC.resume) AC.resume();
    return AC;
  } catch (err) { return null; }
}
function tone(freq, dur, type, when, vol) {
  var a = ac(); if (!a) return;
  try {
    var o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + (when || 0);
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol || 0.18, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  } catch (err) { /* no sound is fine */ }
}
var sfx = {
  pop: function () { tone(520, 0.08, 'triangle'); },
  found: function () { tone(660, 0.15, 'triangle'); tone(990, 0.3, 'triangle', 0.12); },
  win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.3, 'triangle', i * 0.13); }); },
  no: function () { tone(196, 0.2, 'sawtooth', 0, 0.08); },
  honk: function () { tone(330, 0.18, 'square', 0, 0.1); tone(392, 0.3, 'square', 0.2, 0.1); },
  hum: function () { tone(110, 1.4, 'sawtooth', 0, 0.08); tone(165, 1.4, 'sine', 0, 0.1); },
  bell: function () { tone(1320, 0.5, 'sine'); tone(1760, 0.6, 'sine', 0.05, 0.1); },
  tick: function () { tone(880, 0.05, 'square', 0, 0.06); }
};

// ---- real photos and films (js/media.js): a card works without either ------------------------
var NOMEDIA = { photos: {}, films: {}, look: {}, title: [] };
function med() { return window.MEDIA || NOMEDIA; }
function credit(ph) { return (ph.cap ? ph.cap + ' &middot; ' : '') + 'Foto: ' + ph.by + ', ' + ph.lic; }
function polaroid(ph) { return '<div class="polaroid"><div class="ph"><img src="img/' + ph.f + '" alt=""></div><span class="cr">' + credit(ph) + '</span></div>'; }
// the left half of a card: the real photo with the drawn sticker stuck on its corner, or the drawing alone
function picPane(it, key) {
  var ph = med().photos[key];
  if (!ph) return '<div class="pic">' + pic(it) + '</div>';
  return '<div class="pic photo">' + polaroid(ph) + '<div class="mini">' + pic(it) + '</div></div>';
}
function filmBtn(key) {
  var id = med().films[key];
  return id ? '<button class="film" data-act="film" data-yt="' + id + '">&#9654; Film ab</button>' : '';
}
// a film plays inside a drawn television; taking the frame away is what stops it
function openFilm(id) {
  kino.innerHTML = '<div class="tvset"><div class="tube"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&amp;rel=0&amp;playsinline=1" allow="autoplay; encrypted-media; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" frameborder="0"></iframe></div>' +
    '<div class="side"><i></i><i></i><u></u><u></u><u></u><button class="big" data-act="filmzu">Zur&uuml;ck</button></div><s></s><s></s></div>';
  kino.hidden = false;
}
function closeFilm() { kino.hidden = true; kino.innerHTML = ''; }
// paper confetti: a handful for a sticker, a shower for a full room
var CONF = ['#ffd45e', '#f28a2e', '#d6312b', '#2fa8c9', '#4caf50', '#f23e9a', '#fff6dd'], fxTimer = null;
function confetti(n, wide) {
  var h = '', i;
  for (i = 0; i < n; i++) {
    h += '<i style="left:' + (wide ? Math.random() * 100 : 32 + Math.random() * 36).toFixed(1) + '%;background:' + CONF[i % CONF.length] +
      ';animation-delay:' + Math.round(Math.random() * (wide ? 1100 : 250)) + 'ms;animation-duration:' + Math.round(1500 + Math.random() * 1500) + 'ms' + (i % 3 ? '' : ';border-radius:50%') + '"></i>';
  }
  fx.innerHTML = h;
  clearTimeout(fxTimer); fxTimer = setTimeout(function () { fx.innerHTML = ''; }, 4600);
}

// ---- the stage ------------------------------------------------------------------------------
var view, dlg, kino, fx, toastEl, toastTimer = null, hintTimer = null, slideTimer = null, busy = false;
function fit() {
  var w = Math.min(window.innerWidth, window.innerHeight * 16 / 9);
  document.documentElement.style.fontSize = (w / 100) + 'px';
}
function toast(msg) {
  toastEl.hidden = true; void toastEl.offsetWidth; // so that the toast drops in again
  toastEl.innerHTML = '<span>' + msg + '</span>'; toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
}
function hud(title, sub, cnt, back) {
  return '<div class="hud">' +
    (back ? '<div class="b"><button data-act="hub">Zur Stra&szlig;e</button></div>' : '') +
    '<div class="ttl">' + title + '<small>' + sub + '</small></div>' +
    '<div class="cnt" id="cnt">' + cnt + '</div>' +
    (back ? '<div class="b"><button data-act="hint">Tipp</button></div>' : '') +
    '<div class="b"><button data-act="album">Album</button></div>' +
    '<div class="b"><button data-act="mute" class="quiet">' + (S.mute ? 'Ton aus' : 'Ton an') + '</button></div>' +
    '</div><div class="lbl" id="lbl"></div>';
}
function hot(it, i) {
  var pad = Math.max(14, (120 / (it.s || 1) - Math.min(it.w, it.h)) / 2), s = it.s || 1;
  var org = 'transform-origin:' + (it.w / 2) + 'px ' + it.h + 'px;';
  return '<g class="hot' + (S.found[it.id] ? '' : ' new') + '" data-id="' + it.id + '" data-de="' + it.de + '" data-en="' + tx(it.en) + '" transform="translate(' + it.x + ',' + it.y + ') scale(' + s + ')">' +
    '<ellipse class="halo" cx="' + it.w / 2 + '" cy="' + it.h / 2 + '" rx="' + (it.w * 0.62 + 10) + '" ry="' + (it.h * 0.62 + 10) + '"/>' +
    '<g class="lift" style="' + org + '"><g class="bob" style="' + org + 'animation-delay:' + (60 + i * 70) + 'ms,' + (2500 + (i * 1370) % 7000) + 'ms">' + INK + it.art + '</g></g></g>' +
    '<rect x="' + -pad + '" y="' + -pad + '" width="' + (it.w + 2 * pad) + '" height="' + (it.h + 2 * pad) + '" fill="#000" fill-opacity="0" pointer-events="all"/></g>';
}
function scene(inner) { return '<svg class="scene" id="scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">' + inner + '</svg>'; }

function enter() { view.className = ''; void view.offsetWidth; view.className = 'enter'; busy = false; }
function pile() {
  var list = med().title;
  if (!list.length) return '';
  return '<div class="pile" id="pile">' + list.map(function (ph, i) { return '<div class="snap s' + (i % 4) + '">' + polaroid(ph) + '</div>'; }).join('') + '</div>';
}
// the top photo of the pile slides off and goes to the bottom
function nextSnap() {
  var pl = document.getElementById('pile'); if (!pl || pl.children.length < 2) return;
  var top = pl.lastChild; top.className += ' away';
  setTimeout(function () { if (top.parentNode !== pl) return; top.className = top.className.replace(' away', ''); pl.insertBefore(top, pl.firstChild); }, 650);
}
function showTitle() {
  G.cur = 'title';
  clearInterval(slideTimer); slideTimer = setInterval(nextSnap, 4200);
  view.innerHTML = scene(HUB.bg()) + '<div class="title" style="background:rgba(40,25,15,.45)">' + pile() + '<div class="box">' +
    '<h1>Es war einmal<br>in <em>Ost-Berlin</em></h1>' +
    '<p><b>Mama oder Papa ist in Ost-Berlin geboren.</b> Mum or dad was born in East Berlin, the capital of a country called the DDR. The country is gone now, but everything in this little museum is still there, in their memory.<br><br>Point at anything and click it. Every find is a sticker for the album. And when a card says <b>Frag Mama</b> or <b>Frag Papa</b>, ask!</p>' +
    '<p class="who">Wer ist hier aufgewachsen? <small>Who grew up here?</small></p>' +
    '<button class="big" data-act="hub" data-who="Mama">Mama</button> <button class="big" data-act="hub" data-who="Papa">Papa</button></div></div>';
}
function showHub(quiet) {
  G.cur = 'hub'; G.quest = null; clearInterval(slideTimer);
  var k = total();
  view.innerHTML = scene(HUB.bg(!quiet) + HUB.spots()) + hud('Unsere Stra&szlig;e', 'our street, East Berlin, 1988', k.n + ' / ' + k.of + ' Sticker', false);
  if (!quiet) enter();
}
// walking in: the street zooms towards the door, then the room opens
function goRoom(id) {
  var sc = document.getElementById('scene'), h = HUB.find(id);
  if (busy) return;
  if (!sc || !h || G.cur !== 'hub') { showRoom(id); return; }
  busy = true;
  sc.style.transformOrigin = ((h.x + h.w / 2) / 19.2).toFixed(1) + '% ' + ((h.y + h.h / 2) / 10.8).toFixed(1) + '%';
  sc.setAttribute('class', 'scene zoomto');
  setTimeout(function () { showRoom(id); }, 380);
}
function showRoom(id) {
  var rm = G.rooms[id], k = count(id);
  G.cur = id; G.quest = null; clearInterval(slideTimer);
  view.innerHTML = scene('<g' + NS + '>' + rm.bg + '</g>' + rm.items.map(hot).join('')) +
    '<div class="glow"></div><div class="motes">' + [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return '<i style="left:' + (6 + i * 11) + '%;top:' + (18 + (i * 37) % 60) + '%;animation-delay:-' + (i * 2.3) + 's;animation-duration:' + (15 + (i * 5) % 11) + 's"></i>'; }).join('') + '</div>' +
    hud(rm.de, rm.en, k.n + ' / ' + k.of, true) + '<div id="zettel"></div>';
  enter();
}
function refresh() {
  if (G.cur === 'hub') { showHub(true); return; }
  var rm = G.rooms[G.cur]; if (!rm) return;
  var k = count(G.cur), cnt = document.getElementById('cnt'), now = k.n + ' / ' + k.of;
  if (cnt.innerHTML !== now) { cnt.innerHTML = now; cnt.className = 'cnt'; void cnt.offsetWidth; cnt.className = 'cnt bump'; }
  var nodes = view.querySelectorAll('.hot');
  for (var i = 0; i < nodes.length; i++) {
    var id = nodes[i].getAttribute('data-id');
    nodes[i].setAttribute('class', 'hot' + (S.found[id] ? '' : ' new'));
  }
  drawQuest();
}

// ---- finding things -------------------------------------------------------------------------
function find(it) {
  if (S.found[it.id]) return;
  S.found[it.id] = 1; save();
  var k = count(it.room), all = total();
  if (all.n === all.of) { sfx.win(); toast('Alle Sticker! Das Album ist voll!'); confetti(90, true); }
  else if (k.n === k.of) { sfx.win(); toast('Raum komplett! Ein Stern f&uuml;r dich.'); confetti(60, true); }
  else { sfx.found(); toast('Neuer Sticker!'); confetti(14, false); }
}
function pic(it) { return '<svg viewBox="-12 -12 ' + (it.w + 24) + ' ' + (it.h + 24) + '">' + INK + it.art + '</g></svg>'; }
function askBox(q) { return q ? '<div class="ask"><b>Frag ' + WHO + ':</b> ' + tx(q) + '</div>' : ''; }

function openItem(id) {
  var it = G.items[id]; if (!it) return;
  sfx.pop();
  if (it.sound && sfx[it.sound]) setTimeout(sfx[it.sound], 150);
  if (G.quest && G.quest.want.indexOf(id) >= 0 && !G.quest.got[id]) { G.quest.got[id] = 1; }
  if (it.kind === 'flip') { find(it); flip(it, 0, true); }
  else if (it.kind === 'triola') { find(it); triola(it); }
  else if (it.kind === 'cook') { find(it); cook(it, null); }
  else {
    if (it.kind === 'list' && !S.done[it.id]) { G.quest = { id: it.id, want: it.want, got: {} }; }
    find(it);
    dlg.innerHTML = '<div class="card pop">' + picPane(it, it.id) + '<div class="txt"><h2>' + it.de + '</h2><h3>' + tx(it.en) + '</h3><p>' + tx(it.text) + '</p>' + askBox(it.ask) + '</div><div class="foot">' + filmBtn(it.id) + '<button class="big" data-act="close">Weiter</button></div></div>';
  }
  dlg.hidden = false;
  refresh();
}
function closeDlg() {
  dlg.hidden = true; dlg.innerHTML = ''; closeFilm();
  if (G.quest) {
    var q = G.quest, left = q.want.filter(function (id) { return !q.got[id]; });
    if (!left.length) { S.done[q.id] = 1; save(); G.quest = null; sfx.win(); toast('Einkauf fertig! Das Netz ist voll.'); }
  }
  refresh();
}
function drawQuest() {
  var z = document.getElementById('zettel'); if (!z) return;
  if (!G.quest) { z.innerHTML = ''; return; }
  var q = G.quest;
  z.innerHTML = '<div class="zettel"><b>Einkaufszettel</b>' + q.want.map(function (id) {
    return '<div' + (q.got[id] ? ' class="ok"' : '') + '>' + G.items[id].de + '</div>';
  }).join('') + '</div>';
}

// a card you leaf through: TV channels, records, books
function flip(it, i, first) {
  var cd = it.cards[i], last = i === it.cards.length - 1, key = it.id + ':' + i;
  var yt = med().films[key], ph = med().photos[key], look = med().look[it.id] || 'tv';
  var cover = '<div class="cover" style="background:' + (cd.bg || '#b3401a') + '"><span>' + cd.de + (cd.by ? '<small>' + cd.by + '</small>' : '') + '</span></div>';
  var left = cd.art ? '<svg viewBox="0 0 200 250">' + INK + cd.art + '</g></svg>' : cover;
  // the film's own still is the picture: on a television screen, or as a sleeve with the record turning behind it
  if (yt) {
    left = '<div class="' + look + '" data-act="film" data-yt="' + yt + '"><div class="still" style="background-color:' + (cd.bg || '#33241b') + '"><b style="background-image:url(https://i.ytimg.com/vi/' + yt + '/hqdefault.jpg)"></b><em></em><span class="play">&#9654;</span></div>' +
      (look === 'tv' ? '<i></i><i></i><u></u><u></u><u></u>' : '<div class="disc"><i></i></div>') + '<button class="film" data-act="film" data-yt="' + yt + '">&#9654; Film ab</button></div>';
  } else if (ph) { left = polaroid(ph); }
  dlg.innerHTML = '<div class="card ' + (first ? 'pop' : 'turn') + '"><div class="pic' + (ph && !yt ? ' photo' : '') + '" style="background:' + (it.picBg || '#f1cf7e') + '">' + left + '</div><div class="txt"><h2>' + cd.de + '</h2><h3>' + cd.en + '</h3><p>' + tx(cd.text) + '</p>' + askBox(cd.ask) + '</div>' +
    '<div class="foot"><span class="n">' + (i + 1) + ' / ' + it.cards.length + '</span>' +
    (i > 0 ? '<button data-act="flip" data-id="' + it.id + '" data-i="' + (i - 1) + '" class="quiet">Zur&uuml;ck</button>' : '') +
    (last ? '<button class="big" data-act="close">Fertig</button>' : '<button class="big" data-act="flip" data-id="' + it.id + '" data-i="' + (i + 1) + '">' + (it.next || 'Weiter') + '</button>') +
    '</div></div>';
  if (it.flipSound) sfx[it.flipSound]();
}

// the Triola: eight coloured keys and a song written in coloured dots
var KEYS = [['C', 262, '#d6312b'], ['D', 294, '#f28a2e'], ['E', 330, '#f2c82e'], ['F', 349, '#4caf50'], ['G', 392, '#2fa8c9'], ['A', 440, '#3558c7'], ['H', 494, '#8a4fc7'], ['C', 523, '#d6312b']];
var SONG = [0, 1, 2, 3, 4, 4, 5, 5, 5, 5, 4, 5, 5, 5, 5, 4, 3, 3, 3, 3, 2, 2, 1, 1, 1, 1, 0];
var songAt = 0;
function triola(it, keep) {
  if (!keep) songAt = 0;
  var done = songAt >= SONG.length;
  dlg.innerHTML = '<div class="card' + (keep ? '' : ' pop') + '">' + picPane(it, it.id) + '<div class="txt"><h2>' + it.de + '</h2><h3>' + it.en + '</h3><p style="font-size:1.6rem">' + tx(it.text) + '</p>' +
    '<div class="song">' + SONG.map(function (k, i) { return '<i class="' + (i < songAt ? 'done' : i === songAt ? 'next' : '') + '" style="background:' + KEYS[k][2] + '"></i>'; }).join('') + '</div>' +
    '<div class="keys">' + KEYS.map(function (k, i) { return '<button data-act="key" data-i="' + i + '" class="' + (!done && SONG[songAt] === i ? 'want' : '') + '" style="background:' + k[2] + '">' + k[0] + '</button>'; }).join('') + '</div></div>' +
    '<div class="foot"><span class="n">' + (done ? 'Bravo! Das war &bdquo;Alle meine Entchen&ldquo;.' : 'Press the colour of the big dot.') + '</span>' + filmBtn(it.id) + '<button class="big" data-act="close">Fertig</button></div></div>';
}
function pressKey(i) {
  tone(KEYS[i][1], 0.45, 'square', 0, 0.09); tone(KEYS[i][1] * 2, 0.3, 'sine', 0, 0.05);
  if (songAt < SONG.length && SONG[songAt] === i) {
    songAt++;
    if (songAt === SONG.length) { S.done.triola = 1; save(); setTimeout(sfx.win, 500); }
    triola(G.items.triola, true);
  }
}

// the stove: pick a dish, then the three things that go in it
var cookState = null;
function cook(it, dishIdx) {
  var body;
  if (dishIdx === null) {
    cookState = null;
    body = '<p>' + tx(it.text) + '</p><div class="toks">' + it.dishes.map(function (d, i) {
      return '<button data-act="dish" data-i="' + i + '"' + (S.done['dish' + i] ? ' class="in"' : '') + '>' + d.de + '<small>' + d.en + '</small></button>';
    }).join('') + '</div>' + askBox(it.ask);
  } else {
    var d = it.dishes[dishIdx];
    if (!cookState || cookState.i !== dishIdx) {
      var all = d.good.map(function (g) { return { n: g, ok: true }; }).concat(d.bad.map(function (b) { return { n: b, ok: false }; }));
      all.sort(function (a, b) { return a.n[0] < b.n[0] ? -1 : 1; });
      cookState = { i: dishIdx, toks: all, n: 0 };
    }
    var ready = cookState.n === d.good.length;
    body = '<p style="font-size:1.6rem">' + (ready ? tx(d.text) : 'Three of these go into the pot. Which ones?') + '</p>' +
      (ready ? askBox(d.ask) : '<div class="toks">' + cookState.toks.map(function (k, i) {
        return '<button data-act="tok" data-i="' + i + '" class="' + (k.st || '') + '">' + k.n[0] + '<small>' + k.n[1] + '</small></button>';
      }).join('') + '</div>');
    body = '<h2>' + d.de + '</h2><h3>' + d.en + '</h3>' + body;
  }
  var served = dishIdx !== null && cookState.n === it.dishes[dishIdx].good.length, dkey = it.id + ':' + dishIdx;
  dlg.innerHTML = '<div class="card' + (dishIdx === null && !cookState ? ' pop' : '') + '">' + picPane(it, served ? dkey : it.id) + '<div class="txt">' + (dishIdx === null ? '<h2>' + it.de + '</h2><h3>' + it.en + '</h3>' : '') + body + '</div>' +
    '<div class="foot">' + (dishIdx !== null ? '<button class="quiet" data-act="dish" data-i="-1">Anderes Gericht</button>' : '') + (served ? filmBtn(dkey) : '') + '<button class="big" data-act="close">Fertig</button></div></div>';
}
function pressTok(i) {
  var k = cookState.toks[i]; if (k.st) return;
  if (k.ok) { k.st = 'in'; cookState.n++; sfx.found(); } else { k.st = 'out'; sfx.no(); }
  var it = G.items.herd;
  if (cookState.n === it.dishes[cookState.i].good.length) { S.done['dish' + cookState.i] = 1; save(); sfx.win(); }
  cook(it, cookState.i);
}

// ---- the album ------------------------------------------------------------------------------
function album() {
  var k = total();
  dlg.innerHTML = '<div class="album pop"><h2>Mein Sammelalbum<small>' + k.n + ' of ' + k.of + ' stickers. Click one to read it again.</small></h2>' +
    '<button class="big x" data-act="close">Zu</button>' +
    G.order.map(function (id) {
      var rm = G.rooms[id], kk = count(id);
      return '<div class="row"><b>' + (kk.n === kk.of ? '&#9733; ' : '') + rm.de + '</b>' + rm.items.map(function (it) {
        return S.found[it.id] ? '<span class="st" data-act="item" data-id="' + it.id + '">' + pic(it) + '</span>' : '<span class="st no">?</span>';
      }).join('') + '</div>';
    }).join('') + '</div>';
  dlg.hidden = false;
}

// ---- one click handler for everything -------------------------------------------------------
function up(el, test) { while (el && el !== document && el.getAttribute) { if (test(el)) return el; el = el.parentNode; } return null; }
function onClick(ev) {
  var b = up(ev.target, function (n) { return n.getAttribute('data-act'); });
  if (b) {
    var act = b.getAttribute('data-act'), i = Number(b.getAttribute('data-i'));
    if (act === 'hub') { var w = b.getAttribute('data-who'); if (w) { WHO = w; S.who = w; save(); } sfx.pop(); showHub(); }
    else if (act === 'room') { sfx.pop(); goRoom(b.getAttribute('data-id')); }
    else if (act === 'film') { sfx.tick(); openFilm(b.getAttribute('data-yt')); }
    else if (act === 'filmzu') { sfx.pop(); closeFilm(); }
    else if (act === 'album') { sfx.pop(); album(); }
    else if (act === 'close') { sfx.pop(); closeDlg(); }
    else if (act === 'item') { openItem(b.getAttribute('data-id')); }
    else if (act === 'flip') { sfx.pop(); flip(G.items[b.getAttribute('data-id')], i); }
    else if (act === 'key') { pressKey(i); }
    else if (act === 'dish') { sfx.pop(); cook(G.items.herd, i < 0 ? null : i); }
    else if (act === 'tok') { pressTok(i); }
    else if (act === 'mute') { S.mute = !S.mute; save(); b.innerHTML = S.mute ? 'Ton aus' : 'Ton an'; sfx.pop(); }
    else if (act === 'hint') {
      var sc = document.getElementById('scene'); sc.setAttribute('class', 'scene hinting'); sfx.bell();
      clearTimeout(hintTimer); hintTimer = setTimeout(function () { var s2 = document.getElementById('scene'); if (s2) s2.setAttribute('class', 'scene'); }, 4000);
    }
    return;
  }
  var h = up(ev.target, function (n) { return (n.getAttribute('class') || '').indexOf('hot') === 0; });
  if (h) { openItem(h.getAttribute('data-id')); return; }
  if (ev.target === kino) closeFilm();
  else if (ev.target === dlg) closeDlg();
}
function onOver(ev) {
  var lbl = document.getElementById('lbl'); if (!lbl) return;
  var h = up(ev.target, function (n) { return n.getAttribute('data-de'); });
  lbl.innerHTML = h ? '<span>' + h.getAttribute('data-de') + '<small>' + h.getAttribute('data-en') + '</small></span>' : '';
}

function boot() {
  view = document.getElementById('view'); dlg = document.getElementById('dlg'); toastEl = document.getElementById('toast');
  kino = document.getElementById('kino'); fx = document.getElementById('fx');
  fit(); window.addEventListener('resize', fit);
  document.getElementById('stage').addEventListener('click', onClick);
  document.getElementById('stage').addEventListener('mouseover', onOver);
  showTitle();
  // for a drive: what is on the screen, without looking
  window.__game = {
    state: S, G: G, open: openItem, room: showRoom, hub: showHub, close: closeDlg, film: openFilm,
    stats: function () { var k = total(); return { cur: G.cur, found: k.n, of: k.of, dlg: !dlg.hidden, film: !kino.hidden, quest: G.quest }; },
    reset: function () { S.found = {}; S.done = {}; save(); showTitle(); }
  };
}
