// The great-aunt's star map (the Royal Bedchamber; SCOPE.md §8 had Selene's "join-the-dot constellations"). Once the
// room is won, her Diary floats free and opens the map she drew of the night sky: real constellations, their stars
// labelled with numbers. She joins them by counting: by ones, by twos, by fives, by tens… one rule per sky, the easy
// ones first. Each right star draws a glowing line and plays a note; a wrong one shakes, and the Diary gives a hint.
// When every star is joined, the figure the old astronomers saw fades in behind (a bear, a swan, a queen's chair…),
// with its name in English and French and one true thing about it. A finished sky is a star on its chip.
// The skies are data (SKIES): another room can bring more, played the same way.
//
// open(api) resolves when she closes it. api: { save, persist, sfx(name), diary(mood), cheer(), note(midi, opts) }.
// While open, `window.__game.mini` is { kind: 'stars', sky, next(), tap(i), start(id), done } for the drives
// (`done`: the sky on the map now is finished).

// A sky: `stars` [x, y] in a 100 × 100 map (y down), in the order she joins them; `from[i]` is the star the line to
// star i starts at (the one before, if not given); `extra` are lines drawn once all are joined (to close a shape).
// `count`: the label of star i is start + i × step. `figure`: an SVG path drawn faintly behind when finished.
export const SKIES = [
  {
    id: 'dipper', title: 'The Great Bear', fr: 'La Grande Ourse', count: { start: 1, step: 1 },
    // Alkaid, Mizar, Alioth, Megrez, Phecda, Merak, Dubhe; the handle, then round the pan.
    stars: [[12, 34], [26, 27], [37, 30], [47, 35], [49, 51], [70, 53], [72, 35]],
    extra: [[6, 3]],
    figure: 'M6 40 Q4 26 16 22 Q30 14 46 24 Q60 18 74 22 Q88 20 92 32 Q94 40 86 44 L84 60 Q82 70 76 70 L74 62 L66 64 Q64 76 56 76 L54 64 Q40 66 32 60 Q28 72 20 72 L20 58 Q10 54 6 40 Z M86 30 L90 26 M80 34 Q82 36 84 34',
    fact: 'Follow the two stars at the end of the pan, upwards: they point to the Pole Star, which always shows the North.'
  },
  {
    id: 'cassiopeia', title: 'Cassiopeia, the Queen', fr: 'Cassiopée', count: { start: 2, step: 2 },
    stars: [[12, 42], [30, 60], [47, 45], [65, 62], [86, 40]],
    figure: 'M26 84 L26 54 Q26 40 34 36 L34 18 Q34 12 40 12 L60 12 Q66 12 66 18 L66 36 Q74 40 74 54 L74 84 M26 68 L74 68 M40 12 L44 4 L50 10 L56 4 L60 12',
    fact: 'Cassiopeia looks like a W, or an M when she turns upside down. She never sets in France: you can see her all year.'
  },
  {
    id: 'swan', title: 'The Swan', fr: 'Le Cygne', count: { start: 5, step: 5 },
    // Deneb (the tail), Sadr (the heart), Albireo (the head) down the long neck; then a wing each side of Sadr.
    stars: [[58, 12], [50, 38], [44, 60], [37, 87], [22, 30], [78, 46]],
    from: [null, 0, 1, 2, 1, 1],
    figure: 'M56 6 L63 9 L58 20 Q70 34 86 44 L77 50 Q63 46 52 46 Q46 60 42 70 Q38 80 37 92 Q33 90 35 80 Q38 66 44 50 Q30 40 15 26 L24 25 Q38 33 50 36 Q52 24 52 14 Z',
    fact: 'The Swan flies along the Milky Way. Its brightest star, Deneb, is the tail, and Albireo, at the beak, is really two stars, one gold and one blue.'
  },
  {
    id: 'little', title: 'The Little Bear', fr: 'La Petite Ourse', count: { start: 10, step: 10 },
    // Polaris at the tip of the tail, the handle, then the little pan (Kochab and Pherkad are its guards).
    stars: [[14, 18], [28, 26], [40, 36], [51, 48], [56, 66], [77, 64], [73, 47]],
    extra: [[6, 3]],
    figure: 'M10 14 Q20 18 30 28 Q40 34 48 40 Q60 36 74 38 Q86 40 88 54 Q90 66 82 72 L82 82 L76 82 L74 74 L64 76 L64 84 L58 84 L56 74 Q46 70 46 58 Q44 50 46 44 Q36 38 26 30 Q16 22 10 14 Z',
    fact: 'The star at the end of its tail is the Pole Star. All the other stars turn round it in the night, but it stays still.'
  },
  {
    id: 'orion', title: 'Orion, the Hunter', fr: 'Orion', count: { start: 3, step: 3 },
    // His head (Meissa), Betelgeuse at his shoulder, down to the three belt stars, up to Bellatrix; then his feet.
    stars: [[48, 10], [30, 24], [39, 57], [50, 53], [61, 49], [66, 26], [32, 85], [71, 81]],
    from: [null, 0, 1, 2, 3, 4, 2, 4],
    extra: [[5, 0]],
    figure: 'M48 4 Q54 6 54 12 Q54 18 48 18 Q42 18 42 12 Q42 6 48 4 Z M30 24 L22 10 L18 4 M66 26 L80 30 Q88 20 86 10 M86 10 Q92 28 82 44 M44 52 L34 84 L28 92 M56 48 L70 81 L76 92 M42 54 Q50 58 58 50',
    fact: 'Look at Orion’s shoulder: red Betelgeuse is a giant star, so big that our Sun would look like a pea beside it.'
  },
  {
    id: 'leo', title: 'The Lion', fr: 'Le Lion', count: { start: 4, step: 4 },
    // The sickle, a back-to-front question mark (his mane), down to Regulus, his heart; then his body to his tail.
    stars: [[18, 24], [26, 15], [37, 21], [41, 34], [35, 46], [30, 62], [67, 60], [87, 54], [68, 42]],
    from: [null, 0, 1, 2, 3, 4, 5, 6, 7],
    extra: [[8, 3]],
    figure: 'M14 30 Q10 14 26 8 Q42 6 46 22 Q50 34 60 36 Q76 36 86 46 Q94 50 96 40 M86 46 Q92 58 88 66 L88 80 L82 80 L80 68 Q70 70 62 68 L60 80 L54 80 L52 66 Q40 68 32 72 L30 84 L24 84 L24 68 Q18 56 22 44 Q14 40 14 30 Z',
    fact: 'Regulus, the bright star at the Lion’s heart, is the “little king”. The Lion shines high in the spring sky.'
  }
];

const SCALE = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79];
const label = (sky, i) => sky.count.start + i * sky.count.step;
const ruleName = (step) => ({ 1: 'one at a time', 2: 'by twos', 3: 'by threes', 4: 'by fours', 5: 'by fives', 10: 'by tens' })[step] ?? `by ${step}s`;

// A field of faint background stars, the same every time.
const FIELD = (() => {
  let s = 99;
  const r = () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0), (s >>> 8) / 16777216);
  return Array.from({ length: 90 }, () => [r() * 100, r() * 100, 0.15 + r() * 0.45, r() * 4]);
})();

let el = null;
function ensure() {
  if (el) return el;
  el = document.createElement('section');
  el.id = 'stars';
  el.hidden = true;
  el.innerHTML = `
    <div class="win stars-panel">
      <h2>Great-aunt’s Star Map</h2>
      <div class="row" id="s-skies"></div>
      <p id="s-say"></p>
      <div id="s-sky"></div>
      <div id="s-name" hidden></div>
      <p class="small"><span id="s-hint"></span> <button class="link" id="s-done">Close the Diary and go</button></p>
    </div>`;
  document.body.appendChild(el);
  return el;
}

export function open(api) {
  const { save, persist, sfx } = api;
  save.stars ??= { done: {} };
  save.stars.done ??= {};
  ensure();
  el.hidden = false;
  const $ = (s) => el.querySelector(s);
  let sky = null, pos = 0, misses = 0, finished = false;
  const say = (text, mood) => {
    $('#s-say').innerHTML = `<b>The Diary:</b> ${text}`;
    if (mood) api.diary?.(mood);
  };
  const renderChips = () => {
    const m = $('#s-skies');
    m.innerHTML = '';
    for (const sk of SKIES) {
      const b = document.createElement('button');
      b.className = `chip${sk === sky ? ' on' : ''}`;
      b.textContent = `${sk.title.replace(/,.*/, '')}${save.stars.done[sk.id] ? ' ★' : ''}`;
      b.onclick = () => (sfx('click'), start(sk.id));
      m.appendChild(b);
    }
  };
  const fromOf = (i) => sky.from?.[i] ?? i - 1;
  const line = (a, b, cls = '') => {
    const [x1, y1] = sky.stars[a], [x2, y2] = sky.stars[b];
    return `<line class="link ${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  };
  const renderSky = () => {
    let s = `<svg viewBox="-4 -4 108 108" class="sky" role="img" aria-label="${sky.title}">`;
    for (const [x, y, r, d] of FIELD) s += `<circle class="bg" cx="${x}" cy="${y}" r="${r}" style="animation-delay:-${d}s" />`;
    s += `<path class="figure${finished ? ' show' : ''}" d="${sky.figure}" />`;
    for (let i = 1; i < pos; i++) if (fromOf(i) >= 0) s += line(fromOf(i), i, i === pos - 1 && !finished ? 'new' : '');
    if (finished) for (const [a, b] of sky.extra ?? []) s += line(a, b, 'new');
    sky.stars.forEach(([x, y], i) => {
      const cls = i < pos ? 'lit' : misses >= 2 && i === pos ? 'hint' : '';
      // The label sits above the star, or below it near the top edge.
      const ly = y < 10 ? y + 8 : y - 4.5;
      s += `<g class="star ${cls}" data-i="${i}"><circle class="hit" cx="${x}" cy="${y}" r="6.5" /><circle class="halo" cx="${x}" cy="${y}" r="3.4" /><circle class="core" cx="${x}" cy="${y}" r="1.6" /><text x="${x}" y="${ly}">${label(sky, i)}</text></g>`;
    });
    $('#s-sky').innerHTML = s + '</svg>';
    for (const g of $('#s-sky').querySelectorAll('.star')) g.onpointerdown = (e) => (e.preventDefault(), tap(Number(g.dataset.i)));
  };
  function start(id) {
    sky = SKIES.find((s) => s.id === id) ?? SKIES[0];
    pos = 0;
    misses = 0;
    finished = false;
    $('#s-name').hidden = true;
    const c = sky.count;
    $('#s-hint').textContent = `Count ${ruleName(c.step)}: ${label(sky, 0)}, ${label(sky, 1)}, ${label(sky, 2)}…`;
    say(c.step === 1 ? `This is ${sky.title}. Join the stars from <b>1</b>, in order. Tap them one by one.` : `${sky.title}. This time we count <b>${ruleName(c.step)}</b>. Start at <b>${c.start}</b>.`, 'think');
    renderChips();
    renderSky();
  }
  function tap(i) {
    if (!sky || finished) return;
    if (i < pos) return;
    if (i !== pos) {
      misses++;
      sfx('wrong');
      const g = $(`#s-sky .star[data-i="${i}"]`);
      g?.classList.add('shake');
      setTimeout(() => g?.classList.remove('shake'), 450);
      const step = sky.count.step;
      if (pos === 0) say(`Not that one. Find the star with <b>${label(sky, 0)}</b> first.`, 'think');
      else say(`After <b>${label(sky, pos - 1)}</b> comes… count on ${step === 1 ? 'by one' : `by ${step}`}! ${misses >= 2 ? 'Look: it twinkles.' : ''}`, 'think');
      if (misses === 2) renderSky();
      return;
    }
    api.note?.(SCALE[Math.min(SCALE.length - 1, i)], { dur: 0.9, vol: 0.16 });
    pos++;
    misses = 0;
    if (pos < sky.stars.length) {
      if (pos > 1 && pos % 3 === 0) say(['Yes, just like that.', 'She drew this map by candlelight, you know.', 'Lovely. On you go.', 'You count like a real astronomer.'][pos % 4], 'calm');
      return renderSky();
    }
    // Every star joined: the figure, its names, one true thing about it.
    finished = true;
    const first = !save.stars.done[sky.id];
    save.stars.done[sky.id] = true;
    persist();
    renderSky();
    sfx('win');
    api.cheer?.();
    $('#s-name').innerHTML = `<h3>${sky.title} <span>· ${sky.fr}</span></h3><p>${sky.fact}</p>`;
    $('#s-name').hidden = false;
    const left = SKIES.filter((s) => !save.stars.done[s.id]);
    say(left.length ? `Oh, well done! ${first ? 'A new star on the map.' : ''} Try <b>${left[0].title}</b> next?` : 'Every sky on her map! Ah, you have her eyes, my dear. She would be so proud.', 'happy');
    renderChips();
  }
  const first = SKIES.find((s) => !save.stars.done[s.id]) ?? SKIES[0];
  start(first.id);
  say(Object.keys(save.stars.done).length ? 'Back again? The sky is waiting. Pick a picture of stars above.' : 'Ah, you have her eyes, my dear. These are her stars. Join them by counting, and see what she saw.', 'happy');
  const handle = { kind: 'stars', get sky() { return sky?.id ?? null; }, next: () => (finished ? -1 : pos), tap, start, get done() { return finished; } };
  if (window.__game) window.__game.mini = handle;
  return new Promise((resolve) => {
    $('#s-done').onclick = () => {
      sfx('click');
      el.hidden = true;
      api.diary?.('calm');
      if (window.__game?.mini === handle) window.__game.mini = null;
      resolve();
    };
  });
}
