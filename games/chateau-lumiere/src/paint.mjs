// Madame Palette's colouring (the Painting Studio). Madame Palette stepped out of her own portrait when the Studio was
// won; she pins a drawing to the easel and teaches colouring. Every picture is a set of SVG regions, each with the
// number of its colour. Three ways to play (MODES, data, so a later room can bring more):
//   number  "Colour by number": each region shows its number; pick a numbered paint, tap the regions. All right = a star.
//   sums    "Colour by sums": each region shows a sum ("3 + 4", "9 − 2") whose answer is its colour; new sums each time.
//   free    "Free painting": no numbers, any colour, then "Finished!".
// A wrong colour is allowed, but the region gets a dotted outline and Madame Palette says which one it wanted.
// A finished painting is drawn on a 512×512 canvas and handed to main.mjs, which hangs it on the 3D easel.
// The pictures (PICTURES) and the paints (PALETTE) are data: a new picture is one more entry.
//
// open(api) resolves when she closes it. api: { save, persist, sfx(name), palette(mood), cheer(), hang(canvas, id) }.
// While open, `window.__game.mini` is { kind: 'paint', picture, mode, regions(), pick(n), fill(i), start(id, mode),
// finish() } for the drives.

export const PALETTE = [
  { n: 1, name: 'Rose pink', color: '#ff9ccb' },
  { n: 2, name: 'Red', color: '#e8434f' },
  { n: 3, name: 'Orange', color: '#ff9a3c' },
  { n: 4, name: 'Yellow', color: '#ffd84a' },
  { n: 5, name: 'Green', color: '#5cc46a' },
  { n: 6, name: 'Sky blue', color: '#7cc8f2' },
  { n: 7, name: 'Violet', color: '#9b7be0' },
  { n: 8, name: 'Brown', color: '#a8693a' },
  { n: 9, name: 'White', color: '#ffffff' }
];
const colourOf = (n) => PALETTE.find((p) => p.n === n);

// A region is { s: SVG shape markup (no fill: the region's group carries it), n: its colour, at: [x, y] for its label }.
// Later regions are drawn over earlier ones, so a background goes first. `outline`: lines drawn on top, not coloured.
const R = (s, n, x, y) => ({ s, n, at: [x, y] });
const half = (cx, cy, R1, r) => `<path d="M${cx - R1} ${cy} A${R1} ${R1} 0 0 1 ${cx + R1} ${cy} L${cx + r} ${cy} A${r} ${r} 0 0 0 ${cx - r} ${cy} Z"/>`;
export const PICTURES = [
  {
    id: 'butterfly', title: 'The Butterfly',
    regions: [
      R('<rect x="0" y="0" width="400" height="400"/>', 6, 60, 40),
      R('<path d="M0 330 Q100 310 200 330 T400 330 V400 H0 Z"/>', 5, 60, 372),
      R('<path d="M200 190 C150 80 40 60 60 150 C70 200 150 210 200 200 Z"/>', 7, 148, 190),
      R('<path d="M200 190 C250 80 360 60 340 150 C330 200 250 210 200 200 Z"/>', 7, 252, 190),
      R('<path d="M200 205 C150 210 70 240 100 290 C130 320 180 280 200 230 Z"/>', 1, 158, 234),
      R('<path d="M200 205 C250 210 330 240 300 290 C270 320 220 280 200 230 Z"/>', 1, 242, 234),
      R('<circle cx="112" cy="140" r="26"/>', 4, 112, 145),
      R('<circle cx="288" cy="140" r="26"/>', 4, 288, 145),
      R('<circle cx="128" cy="268" r="17"/>', 3, 128, 273),
      R('<circle cx="272" cy="268" r="17"/>', 3, 272, 273),
      R('<ellipse cx="200" cy="228" rx="15" ry="70"/>', 8, 200, 286),
      R('<circle cx="200" cy="148" r="19"/>', 8, 200, 153)
    ],
    outline: '<path d="M192 132 Q175 95 160 88 M208 132 Q225 95 240 88" fill="none"/><circle cx="160" cy="88" r="5" fill="#3a3040"/><circle cx="240" cy="88" r="5" fill="#3a3040"/>'
  },
  {
    id: 'chateau', title: 'The Château',
    regions: [
      R('<rect x="0" y="0" width="400" height="400"/>', 6, 32, 250),
      R('<path d="M0 325 Q200 300 400 325 V400 H0 Z"/>', 5, 60, 375),
      R('<polygon points="120,172 200,100 280,172"/>', 7, 200, 152),
      R('<rect x="110" y="170" width="180" height="160"/>', 1, 150, 300),
      R('<rect x="60" y="140" width="60" height="190"/>', 9, 90, 280),
      R('<rect x="280" y="140" width="60" height="190"/>', 9, 310, 280),
      R('<polygon points="50,142 90,48 130,142"/>', 7, 90, 120),
      R('<polygon points="270,142 310,48 350,142"/>', 7, 310, 120),
      R('<path d="M172 330 V276 A28 28 0 0 1 228 276 V330 Z"/>', 8, 200, 310),
      R('<path d="M76 222 V192 A14 14 0 0 1 104 192 V222 Z"/>', 4, 90, 212),
      R('<path d="M296 222 V192 A14 14 0 0 1 324 192 V222 Z"/>', 4, 310, 212),
      R('<circle cx="200" cy="215" r="20"/>', 4, 200, 220),
      R('<polygon points="310,14 356,26 310,38"/>', 2, 326, 31),
      R('<circle cx="200" cy="50" r="28"/>', 3, 200, 55)
    ],
    outline: '<path d="M310 48 V12" fill="none"/><path d="M110 170 v-14 h20 v14 m20 0 v-14 h20 v14 m80 0 v-14 h20 v14 m20 0 v-14 h20 v14" fill="none"/>'
  },
  {
    id: 'cupcake', title: 'The Cupcake',
    regions: [
      R('<rect x="0" y="0" width="400" height="400"/>', 6, 45, 45),
      R('<rect x="0" y="330" width="400" height="70"/>', 8, 45, 375),
      R('<ellipse cx="200" cy="336" rx="155" ry="20"/>', 9, 330, 341),
      R('<polygon points="110,222 170,222 178,330 135,330"/>', 7, 148, 275),
      R('<polygon points="170,222 230,222 222,330 178,330"/>', 4, 200, 275),
      R('<polygon points="230,222 290,222 265,330 222,330"/>', 7, 252, 275),
      R('<path d="M95 226 C80 180 130 150 150 156 C150 112 250 112 250 156 C270 150 320 180 305 226 Z"/>', 1, 200, 200),
      R('<path d="M158 145 C162 98 238 98 242 145 Z"/>', 9, 200, 135),
      R('<circle cx="200" cy="92" r="21"/>', 2, 200, 97)
    ],
    outline: '<path d="M203 72 Q210 50 228 44" fill="none"/>'
  },
  {
    id: 'rainbow', title: 'The Rainbow',
    regions: [
      R('<rect x="0" y="0" width="400" height="400"/>', 6, 200, 40),
      R('<circle cx="335" cy="78" r="40"/>', 4, 335, 83),
      R(half(200, 320, 180, 158), 2, 200, 155),
      R(half(200, 320, 158, 136), 3, 200, 177),
      R(half(200, 320, 136, 114), 4, 200, 199),
      R(half(200, 320, 114, 92), 5, 200, 221),
      R(half(200, 320, 92, 70), 7, 200, 243),
      R('<path d="M0 345 Q200 325 400 345 V400 H0 Z"/>', 5, 200, 378),
      R('<path d="M18 340 a30 30 0 0 1 30 -40 a36 36 0 0 1 66 0 a28 28 0 0 1 20 40 Z"/>', 9, 75, 328),
      R('<path d="M266 340 a30 30 0 0 1 30 -40 a36 36 0 0 1 66 0 a28 28 0 0 1 20 40 Z"/>', 9, 325, 328),
      R('<path d="M30 110 a22 22 0 0 1 24 -30 a28 28 0 0 1 52 0 a22 22 0 0 1 16 30 Z"/>', 9, 76, 100)
    ]
  },
  {
    id: 'fish', title: 'The Little Fish',
    regions: [
      R('<rect x="0" y="0" width="400" height="400"/>', 6, 50, 50),
      R('<path d="M0 345 Q120 325 240 342 T400 338 V400 H0 Z"/>', 4, 200, 380),
      R('<path d="M40 400 C20 340 60 320 40 262 C72 300 62 342 78 400 Z"/>', 5, 52, 350),
      R('<path d="M342 400 C322 350 360 330 346 280 C376 316 366 352 380 400 Z"/>', 5, 356, 360),
      R('<polygon points="285,190 365,125 365,255"/>', 2, 340, 195),
      R('<path d="M150 128 Q190 66 245 130 Z"/>', 2, 197, 115),
      R('<ellipse cx="190" cy="190" rx="110" ry="70"/>', 3, 240, 195),
      R('<path d="M162 124 Q146 190 162 256 L192 259 Q176 190 192 121 Z"/>', 9, 172, 195),
      R('<circle cx="118" cy="176" r="15"/>', 9, 118, 160),
      R('<g><circle cx="90" cy="90" r="16"/><circle cx="120" cy="50" r="11"/></g>', 9, 90, 95),
      R('<polygon points="300,350 309,368 329,370 314,383 318,398 300,390 282,398 286,383 271,370 291,368"/>', 1, 300, 383)
    ],
    outline: '<circle cx="114" cy="178" r="6" fill="#3a3040"/><path d="M95 206 Q108 214 120 208" fill="none"/>'
  }
];

// A sum whose answer is n: an addition, a take-away, or now and then a times table.
function sumFor(n) {
  const r = Math.random();
  if (n >= 4 && n % 2 === 0 && r < 0.2) return `2 × ${n / 2}`;
  if (n === 9 && r < 0.2) return '3 × 3';
  if (n >= 2 && r < 0.6) {
    const a = 1 + Math.floor(Math.random() * (n - 1));
    return `${a} + ${n - a}`;
  }
  const b = 1 + Math.floor(Math.random() * 6);
  return `${n + b} − ${b}`;
}

export const MODES = [
  { id: 'number', title: 'Colour by number', label: (n) => String(n), check: true },
  { id: 'sums', title: 'Colour by sums', label: sumFor, check: true },
  { id: 'free', title: 'Free painting', label: null, check: false }
];

const INK = '#3a3040', PAPER = '#fffaf0';
// The SVG of a picture. `fills`: the colour number in each region, or null. `labels`: the text on each (or null).
function pictureSvg(pic, fills, { labels = null, wrong = [], forExport = false } = {}) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"${forExport ? ' width="512" height="512"' : ''} class="paint-svg">`;
  if (!forExport) s += `<defs><pattern id="pt-blank" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${PAPER}"/><circle cx="5" cy="5" r="1.2" fill="#d8ccb8"/></pattern></defs>`;
  else s += `<rect width="400" height="400" fill="${PAPER}"/>`;
  pic.regions.forEach((r, i) => {
    const f = fills[i] ? colourOf(fills[i]).color : forExport ? PAPER : 'url(#pt-blank)';
    s += `<g class="rg${wrong[i] ? ' wrong' : ''}" data-i="${i}" fill="${f}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"${wrong[i] ? ' stroke-dasharray="7 5"' : ''}>${r.s}</g>`;
  });
  if (pic.outline) s += `<g class="outline" stroke="${INK}" stroke-width="3" stroke-linecap="round" pointer-events="none">${pic.outline}</g>`;
  if (labels)
    pic.regions.forEach((r, i) => {
      if (labels[i] == null) return;
      s += `<text class="lab" x="${r.at[0]}" y="${r.at[1]}" pointer-events="none">${labels[i]}</text>`;
    });
  return s + '</svg>';
}

// The finished painting on a 512×512 canvas, for the easel.
function toCanvas(pic, fills) {
  return new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = PAPER;
    g.fillRect(0, 0, 512, 512);
    const img = new Image();
    img.onload = () => (g.drawImage(img, 0, 0, 512, 512), resolve(c));
    img.onerror = () => resolve(c);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pictureSvg(pic, fills, { forExport: true }));
  });
}

let el = null;
function ensure() {
  if (el) return el;
  el = document.createElement('section');
  el.id = 'paint';
  el.hidden = true;
  el.innerHTML = `
    <div class="win paint-panel">
      <div class="row" id="pt-pictures"></div>
      <div class="row" id="pt-modes"></div>
      <p id="pt-say"></p>
      <div id="pt-paper"></div>
      <div id="pt-palette"></div>
      <div class="row pt-foot"><button class="big" id="pt-finish" hidden>Finished!</button>
        <p class="small"><button class="link" id="pt-done">Thank Madame Palette and go</button></p></div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

export function open(api) {
  const { save, persist, sfx } = api;
  save.paint ??= { done: {} };
  ensure();
  el.hidden = false;
  const $ = (s) => el.querySelector(s);
  let pic = PICTURES[0], mode = MODES[0], fills = [], labels = [], wrong = [], brush = null, finished = false, busy = false;
  const say = (text, mood) => {
    $('#pt-say').innerHTML = `<b>Madame Palette:</b> ${text}`;
    if (mood) api.palette?.(mood);
  };
  const starsOf = (id) => '★'.repeat(Object.keys(save.paint.done[id] ?? {}).length);
  const chips = (sel, items, isOn, label, fn) => {
    const m = $(sel);
    m.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.className = `chip${isOn(it) ? ' on' : ''}`;
      b.innerHTML = label(it);
      b.disabled = busy;
      b.onclick = () => (sfx('click'), fn(it));
      m.appendChild(b);
    }
  };
  const renderChips = () => {
    chips('#pt-pictures', PICTURES, (p) => p === pic, (p) => `${p.title} <span class="pt-stars">${starsOf(p.id)}</span>`, (p) => start(p.id, mode.id));
    chips('#pt-modes', MODES, (m) => m === mode, (m) => m.title, (m) => start(pic.id, m.id));
  };
  const renderPicture = () => {
    const shown = mode.check && !finished ? labels.map((l, i) => (fills[i] === pic.regions[i].n ? null : l)) : null;
    $('#pt-paper').innerHTML = pictureSvg(pic, fills, { labels: shown, wrong });
    for (const g of $('#pt-paper').querySelectorAll('.rg')) g.onpointerdown = (e) => (e.preventDefault(), fill(Number(g.dataset.i)));
  };
  const renderPalette = () => {
    const p = $('#pt-palette');
    p.innerHTML = '';
    for (const c of PALETTE) {
      const b = document.createElement('button');
      b.className = `pt-swatch${brush === c.n ? ' on' : ''}`;
      b.style.background = c.color;
      b.title = c.name;
      b.innerHTML = `<b>${c.n}</b>`;
      b.onclick = () => pick(c.n);
      p.appendChild(b);
    }
    $('#pt-finish').hidden = mode.check || finished;
  };
  const render = () => (renderChips(), renderPicture(), renderPalette());

  function start(id, m) {
    pic = PICTURES.find((p) => p.id === id) ?? PICTURES[0];
    mode = MODES.find((x) => x.id === m) ?? MODES[0];
    fills = pic.regions.map(() => null);
    wrong = pic.regions.map(() => false);
    labels = pic.regions.map((r) => (mode.label ? mode.label(r.n) : null));
    finished = false;
    if (mode.id === 'number') say(`${pic.title}! Each shape has a number. Pick a paint with that number, then tap the shape.`, 'happy');
    else if (mode.id === 'sums') say(`Ah, a little puzzle! Work out each sum. The answer is the number of its paint.`, 'think');
    else say(`${pic.title}, and no numbers at all! Paint it any way you like, ma chérie. Then press “Finished!”.`, 'happy');
    render();
  }
  function pick(n) {
    if (busy || !colourOf(n)) return;
    brush = n;
    sfx('click');
    renderPalette();
    if (mode.check) $('#pt-say').innerHTML = `<b>Madame Palette:</b> ${colourOf(n).name}, number ${n}. Now tap a shape!`;
  }
  function fill(i) {
    if (busy || finished || !pic.regions[i]) return;
    if (!brush) return say('First pick a paint from the pots below!', 'think');
    fills[i] = brush;
    const want = pic.regions[i].n;
    wrong[i] = mode.check && brush !== want;
    if (wrong[i]) {
      sfx('wrong');
      const w = colourOf(want);
      say(mode.id === 'sums' ? `Hmm, look again: ${labels[i]} makes ${want}. Number ${want} is ${w.name.toLowerCase()}.` : `Not quite, ma chérie. That shape is number ${want}: ${w.name.toLowerCase()}.`, 'think');
    } else sfx('potion');
    renderPicture();
    if (mode.check && fills.every((f, k) => f === pic.regions[k].n)) complete();
    else if (mode.check && !wrong[i] && Math.random() < 0.3) say(['Magnifique!', 'Oh, très joli!', 'What a steady hand!', 'Bravo, bravo!'][Math.floor(Math.random() * 4)], 'happy');
  }
  async function complete() {
    finished = true;
    busy = true;
    (save.paint.done[pic.id] ??= {})[mode.id] = true;
    persist();
    renderChips();
    renderPicture();
    renderPalette();
    say('Finished! Let me put it on the easel…', 'happy');
    const canvas = await toCanvas(pic, fills);
    api.hang?.(canvas, pic.id);
    sfx('win');
    api.cheer?.();
    busy = false;
    renderChips();
    say(mode.check ? `Magnifique! A gold star for ${pic.title.replace(/^The /, 'the ')}! Look, it is on the easel now. Another one?` : 'C’est un chef-d’œuvre! A masterpiece! It is on the easel now. Shall we paint another?', 'happy');
  }
  function finish() {
    if (busy || finished || mode.check) return Promise.resolve(false);
    if (!fills.some(Boolean)) {
      say('Paint something first, ma chérie! A blank page is very shy.', 'think');
      return Promise.resolve(false);
    }
    return complete().then(() => true);
  }
  $('#pt-finish').onclick = () => (sfx('click'), finish());
  start(PICTURES[0].id, 'number');
  say('Bonjour! I am Madame Palette. Choose a picture and a way to paint it. Shall we begin with the butterfly?', 'happy');
  const handle = {
    kind: 'paint',
    get picture() { return pic.id; },
    get mode() { return mode.id; },
    get finished() { return finished; },
    get busy() { return busy; },
    regions: () => pic.regions.map((r, i) => ({ n: r.n, fill: fills[i] })),
    pick, fill, start, finish
  };
  if (window.__game) window.__game.mini = handle;
  return new Promise((resolve) => {
    $('#pt-done').onclick = () => {
      sfx('click');
      el.hidden = true;
      if (window.__game?.mini === handle) window.__game.mini = null;
      resolve();
    };
  });
}
