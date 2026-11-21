// Captain Buttons's Toy Box (the Nursery, round 3): a memory game of pairs. The cards lie face down; she turns two at a
// time. Two that belong together stay up and glow; two that don't turn back over after a moment. All found: Captain
// Buttons, the tin soldier, counts the flips. Fewer flips is better; her best per deck is kept, and a star when it is
// under the deck's par (two flips a pair, plus two).
// The decks are data (DECKS), so a later room can bring another, played the same way:
//   toys     six pairs of toys (the same toy twice)
//   twins    eight pairs of toys, a bigger box
//   sums     a sum card goes with its answer card (additions within 20, fresh each game)
//   english  a picture goes with its English word
//
// open(api) resolves when she closes it. api: { save, persist, sfx(name), buttons(mood), cheer() }.
// While open, `window.__game.mini` is { kind: 'toys', deck, cards(), flip(i), busy, start(id) } for the drives.

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (list, n) => shuffle([...list]).slice(0, n);
const same = (faces) => faces.map((f) => [f, f]);

const TOYS = ['🧸', '🪆', '⚽', '🪁', '🥁', '🧩', '🎈', '🚂', '🪀', '🎨', '🦄', '🏰', '🎠', '🎁'];
const WORDS = [
  ['🐱', 'cat'], ['🐶', 'dog'], ['☀️', 'sun'], ['🍎', 'apple'], ['⭐', 'star'], ['🐟', 'fish'], ['🏠', 'house'], ['🌳', 'tree'],
  ['🌙', 'moon'], ['🐦', 'bird'], ['🌸', 'flower'], ['🎂', 'cake'], ['🐴', 'horse'], ['📕', 'book'], ['👑', 'crown'], ['🐭', 'mouse']
];
// Six sums within 20, each with a different answer.
function sums(n) {
  const out = [], seen = new Set();
  while (out.length < n) {
    const a = 2 + Math.floor(Math.random() * 10), b = 1 + Math.floor(Math.random() * 9);
    if (a + b > 20 || seen.has(a + b)) continue;
    seen.add(a + b);
    out.push([`${a} + ${b}`, String(a + b)]);
  }
  return out;
}

// A deck: `pairs()` gives [faceA, faceB] pairs (the same face twice for twins); `say` is how Captain Buttons starts it.
export const DECKS = [
  { id: 'toys', title: 'Toy twins', pairs: () => same(pick(TOYS.slice(0, 8), 6)), say: 'Attention! Find the two toys that are the same. Turn over two cards at a time!' },
  { id: 'twins', title: 'The big toy box', pairs: () => same(pick(TOYS, 8)), say: 'The big toy box! Eight pairs this time. Remember where everything is, soldier!' },
  { id: 'sums', title: 'Sums', pairs: () => sums(6), say: 'A sum and its answer make a pair. Six plus two goes with eight. Quick march!' },
  { id: 'english', title: 'English words', pairs: () => pick(WORDS, 6), say: 'A picture and its English word make a pair. The cat goes with “cat”. Forward!' }
];
const par = (n) => n * 2 + 2;

let el = null;
function ensure() {
  if (el) return el;
  el = document.createElement('section');
  el.id = 'toys';
  el.hidden = true;
  el.innerHTML = `
    <div class="win toys-panel">
      <h2>The Toy Box</h2>
      <div class="row" id="t-decks"></div>
      <p id="t-say"></p>
      <div id="t-grid"></div>
      <div class="row t-foot"><span id="t-flips"></span><button class="big" id="t-again" hidden>Play again</button></div>
      <p class="small"><button class="link" id="t-done">Thank Captain Buttons and go</button></p>
    </div>`;
  document.body.appendChild(el);
  return el;
}

export function open(api) {
  const { save, persist, sfx } = api;
  save.toys ??= { best: {} };
  save.toys.best ??= {};
  ensure();
  el.hidden = false;
  const $ = (s) => el.querySelector(s);
  let deck = null, cards = [], first = -1, flips = 0, busy = false, found = 0, timer = null;
  const say = (text, mood) => {
    $('#t-say').innerHTML = `<b>Captain Buttons:</b> ${text}`;
    if (mood) api.buttons?.(mood);
  };
  const renderDecks = () => {
    const m = $('#t-decks');
    m.innerHTML = '';
    for (const d of DECKS) {
      const b = document.createElement('button');
      const best = save.toys.best[d.id];
      const n = d.id === deck?.id ? cards.length / 2 : d.pairs().length;
      b.className = `chip${deck === d ? ' on' : ''}`;
      b.textContent = `${d.title}${best ? ` (best ${best})` : ''}${best && best <= par(n) ? ' ★' : ''}`;
      b.onclick = () => (sfx('click'), start(d.id));
      m.appendChild(b);
    }
  };
  const renderFlips = () => ($('#t-flips').textContent = `Flips: ${flips}`);
  const renderGrid = () => {
    const g = $('#t-grid');
    g.innerHTML = '';
    g.className = `n${cards.length}`;
    cards.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = `card${c.up ? ' up' : ''}${c.done ? ' done' : ''}${c.face.length > 2 && !/\p{Extended_Pictographic}/u.test(c.face) ? ' word' : ''}`;
      b.dataset.i = i;
      b.innerHTML = `<span class="in"><span class="back"></span><span class="front">${c.face}</span></span>`;
      b.onpointerdown = (e) => (e.preventDefault(), flip(i));
      g.appendChild(b);
    });
  };
  const paint = (i) => {
    const b = $(`#t-grid .card[data-i="${i}"]`);
    if (!b) return;
    b.classList.toggle('up', cards[i].up);
    b.classList.toggle('done', cards[i].done);
  };
  function start(id) {
    clearTimeout(timer);
    deck = DECKS.find((d) => d.id === id) ?? DECKS[0];
    cards = [];
    deck.pairs().forEach(([a, b], key) => cards.push({ face: a, key, up: false, done: false }, { face: b, key, up: false, done: false }));
    shuffle(cards);
    first = -1;
    flips = 0;
    found = 0;
    busy = false;
    $('#t-again').hidden = true;
    say(deck.say, 'calm');
    renderDecks();
    renderGrid();
    renderFlips();
  }
  function flip(i) {
    const c = cards[i];
    if (busy || !c || c.up || c.done) return;
    sfx('click');
    c.up = true;
    flips++;
    paint(i);
    renderFlips();
    if (first < 0) return void (first = i);
    const a = cards[first];
    first = -1;
    if (a.key === c.key) {
      a.done = c.done = true;
      found++;
      setTimeout(() => (paint(cards.indexOf(a)), paint(i)), 250);
      sfx('potion');
      const n = cards.length / 2;
      if (found < n) return say(['Splendid work, soldier!', 'A pair! Well done!', 'Bravo! Keep going!', 'Sharp eyes!'][found % 4], 'happy');
      // All found.
      busy = true;
      const was = save.toys.best[deck.id];
      const best = !was || flips < was;
      if (best) save.toys.best[deck.id] = flips;
      persist();
      setTimeout(() => {
        busy = false;
        sfx('win');
        api.cheer?.();
        const star = flips <= par(n);
        say(`All ${n} pairs in ${flips} flips${best && was ? ', your best yet' : ''}! ${star ? 'A star for you. Splendid!' : `Can you do it in ${par(n)} flips or fewer? That wins a star!`}`, 'happy');
        $('#t-again').hidden = false;
        renderDecks();
      }, 600);
      return;
    }
    busy = true;
    api.buttons?.('think');
    if (flips === 2 || Math.random() < 0.3) say(['Not a pair. Remember where they are!', 'Hmm, not those two. Try again!', 'Steady, soldier. Look carefully!'][Math.floor(Math.random() * 3)]);
    timer = setTimeout(() => {
      a.up = c.up = false;
      paint(cards.indexOf(a));
      paint(i);
      busy = false;
    }, 900);
  }
  $('#t-again').onclick = () => (sfx('click'), start(deck.id));
  start('toys');
  say('Hello! I am Captain Buttons. Let us play the Toy Box! ' + DECKS[0].say.replace('Attention! ', ''), 'happy');
  const handle = { kind: 'toys', get deck() { return deck?.id ?? null; }, cards: () => cards.map((c) => ({ ...c })), flip, get busy() { return busy; }, start };
  if (window.__game) window.__game.mini = handle;
  return new Promise((resolve) => {
    $('#t-done').onclick = () => {
      sfx('click');
      clearTimeout(timer);
      el.hidden = true;
      if (window.__game?.mini === handle) window.__game.mini = null;
      resolve();
    };
  });
}
