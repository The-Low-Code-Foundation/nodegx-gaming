// Basile's flower beds (the Rose Garden, round 3; SCOPE.md §8: "plant, water, wait; the colours become new dyes").
// Basile asks for a bed of six flowers in a pattern, some already planted: she finishes it (rose, daisy, rose, daisy…
// what comes next?), then waters it, and has to work out how many drops that takes (six flowers, three drops each).
// Right: the seedlings grow into flowers in the 3D bed, one after the other. The beds are data (BEDS), so a later
// room can add more, played the same way; a free bed lets her plant whatever she likes.
//
// open(api) resolves when she closes it. api: { save, persist, sfx(name), basile(mood), cheer(), bed } where `bed` is
// the 3D bed (grounds.mjs flowerBed: plant(i, seed), grow(i), water(i), clear()). While open, `window.__game.mini` is
// { kind: 'flowers', bed, step, row(), pick(seed), plant(i), check(), answer(n), start(id) } for the drives.
import { SEEDS } from './grounds.mjs';

export const BEDS = [
  { id: 'ab', title: 'Rose, daisy…', row: ['rose', 'daisy', 'rose', 'daisy', null, null], answer: ['rose', 'daisy'], drops: 2, say: 'A pattern bed! Rose, daisy, rose, daisy… What comes next? Plant the two empty spots.' },
  { id: 'abc', title: 'Three in a row', row: ['tulip', 'bluebell', 'sunflower', 'tulip', null, null], answer: ['bluebell', 'sunflower'], drops: 3, say: 'Three flowers this time: tulip, bluebell, sunflower, then again… Finish it!' },
  { id: 'aab', title: 'Two and one', row: ['rose', 'rose', 'sunflower', 'rose', null, null], answer: ['rose', 'sunflower'], drops: 2, say: 'Two roses, then a sunflower. Then two roses… you see it?' },
  { id: 'abb', title: 'One and two', row: ['bluebell', 'daisy', 'daisy', 'bluebell', null, null], answer: ['daisy', 'daisy'], drops: 5, say: 'One bluebell, two daisies. One bluebell… What comes next?' },
  { id: 'mirror', title: 'The mirror bed', row: ['sunflower', 'tulip', 'rose', null, null, null], answer: ['rose', 'tulip', 'sunflower'], drops: 3, say: 'A mirror bed! The second half is the first half backwards, like in a looking glass.' },
  { id: 'free', title: 'Your own bed', row: [null, null, null, null, null, null], free: true, drops: 4, say: 'This bed is all yours! Plant any flowers you like.' }
];

// A little flower drawn in SVG, in the seed's colour (no emoji: the same on every tablet).
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
function icon(seed) {
  if (!seed) return '<svg viewBox="0 0 40 40" class="flower-ic"><circle cx="20" cy="22" r="9" class="hole" /><text x="20" y="27" text-anchor="middle">?</text></svg>';
  const s = SEEDS[seed], c = hex(s.colour);
  let petals = '';
  const n = s.shape === 'daisy' ? 8 : 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    petals += `<ellipse cx="${20 + Math.cos(a) * 8}" cy="${16 + Math.sin(a) * 8}" rx="${s.shape === 'daisy' ? 5 : 6.5}" ry="${s.shape === 'daisy' ? 3 : 5.5}" transform="rotate(${(a * 180) / Math.PI} ${20 + Math.cos(a) * 8} ${16 + Math.sin(a) * 8})" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width=".8" />`;
  }
  if (s.shape === 'tulip') petals = `<path d="M10 9 L14 18 L20 8 L26 18 L30 9 L29 22 Q20 30 11 22 Z" fill="${c}" stroke="rgba(0,0,0,.25)" />`;
  if (s.shape === 'bell') petals = `<path d="M13 10 Q20 4 27 10 L29 24 Q24 21 20 25 Q16 21 11 24 Z" fill="${c}" stroke="rgba(0,0,0,.25)" />`;
  const mid = s.shape === 'tulip' || s.shape === 'bell' ? '' : `<circle cx="20" cy="16" r="${s.big ? 5.5 : 4}" fill="${s.big ? '#6a4020' : '#ffd23a'}" />`;
  return `<svg viewBox="0 0 40 40" class="flower-ic"><path d="M20 22 L20 38" stroke="#3f9a4a" stroke-width="2.5" /><ellipse cx="25" cy="31" rx="5" ry="2" fill="#3f9a4a" transform="rotate(-30 25 31)" />${petals}${mid}</svg>`;
}

let el = null;
function ensure() {
  if (el) return el;
  el = document.createElement('section');
  el.id = 'flowers';
  el.hidden = true;
  el.innerHTML = `
    <div class="win side-panel flowers-panel">
      <h2>Basile's Flower Beds</h2>
      <div class="row" id="fl-beds"></div>
      <p class="say" id="fl-say"></p>
      <div id="fl-row"></div>
      <div id="fl-work"></div>
      <p class="small"><button class="link" id="fl-done">Thank Basile and go</button></p>
    </div>`;
  document.body.appendChild(el);
  return el;
}

export function open(api) {
  const { save, persist, sfx, bed } = api;
  save.flowers ??= { done: {} };
  ensure();
  el.hidden = false;
  const $ = (s) => el.querySelector(s);
  let order = null, row = [], seed = 'rose', step = 'plant', wrong = new Set(), busy = false;
  const say = (text, mood) => {
    $('#fl-say').innerHTML = `<b>Basile:</b> ${text}`;
    if (mood) api.basile?.(mood);
  };
  const button = (html, cls, fn) => {
    const b = document.createElement('button');
    b.innerHTML = html;
    if (cls) b.className = cls;
    b.onclick = () => (sfx('click'), fn());
    return b;
  };
  const renderBeds = () => {
    $('#fl-beds').replaceChildren(...BEDS.map((o) => button(`${o.title}${save.flowers.done[o.id] ? ' ★' : ''}`, `chip${order === o ? ' on' : ''}`, () => start(o.id))));
  };
  const blanks = () => row.map((s, i) => (order.free || order.row[i] === null ? i : -1)).filter((i) => i >= 0);
  const renderRow = () => {
    const r = $('#fl-row');
    r.replaceChildren(...row.map((s, i) => {
      const fixed = !order.free && order.row[i] !== null;
      const b = button(icon(s), `slot${fixed ? ' fixed' : ''}${wrong.has(i) ? ' wrong' : ''}`, () => plant(i));
      b.disabled = fixed || step !== 'plant';
      b.title = s ? SEEDS[s].name : 'Empty';
      return b;
    }));
  };
  const renderWork = () => {
    const w = $('#fl-work');
    w.innerHTML = '';
    if (step === 'plant') {
      const h = document.createElement('h3');
      h.textContent = 'Pick a seed, then tap an empty spot';
      const seeds = document.createElement('div');
      seeds.className = 'row seeds';
      seeds.replaceChildren(...Object.entries(SEEDS).map(([id, s]) => button(`${icon(id)}<span>${s.name}</span>`, seed === id ? 'on' : '', () => ((seed = id), renderWork()))));
      const go = button('Ready! Check it', 'big', check);
      go.disabled = blanks().some((i) => !row[i]);
      const acts = document.createElement('div');
      acts.className = 'row actions';
      acts.append(go);
      w.append(h, seeds, acts);
    } else if (step === 'water') {
      const n = row.length, d = order.drops;
      const h = document.createElement('h3');
      h.textContent = `${n} flowers, ${d} drops of water each. How many drops in all?`;
      const right = n * d;
      const opts = [...new Set([right, right + d, right - d, n + d, right + 1])].filter((x) => x > 0).slice(0, 4).sort(() => Math.random() - 0.5);
      const choices = document.createElement('div');
      choices.className = 'row answers';
      choices.replaceChildren(...opts.map((x) => button(String(x), 'answer', () => answer(x))));
      w.append(h, choices);
      w.dataset.right = right;
    } else if (step === 'done') {
      const acts = document.createElement('div');
      acts.className = 'row actions';
      const next = BEDS[(BEDS.indexOf(order) + 1) % BEDS.length];
      acts.append(button(`Next bed: ${next.title}`, 'big', () => start(next.id)), button('Plant this one again', '', () => start(order.id)));
      w.append(acts);
    }
  };
  const render = () => (renderBeds(), renderRow(), renderWork());
  function start(id) {
    order = BEDS.find((o) => o.id === id) ?? BEDS[0];
    row = [...order.row];
    step = 'plant';
    wrong = new Set();
    busy = false;
    bed.clear();
    row.forEach((s, i) => s && bed.plant(i, s));
    say(order.say, 'think');
    render();
  }
  function plant(i) {
    if (step !== 'plant' || busy || (!order.free && order.row[i] !== null)) return;
    row[i] = row[i] === seed ? null : seed;
    wrong.delete(i);
    bed.plant(i, row[i]);
    sfx('potion');
    render();
  }
  function check() {
    if (blanks().some((i) => !row[i])) return;
    if (!order.free) {
      wrong = new Set(order.answer.map((a, k) => (row[order.row.length - order.answer.length + k] === a ? -1 : order.row.length - order.answer.length + k)).filter((i) => i >= 0));
      if (wrong.size) {
        sfx('wrong');
        say(order.id === 'mirror' ? 'Not quite! Read the first half from the end: the last flower comes first.' : `Hmm, not quite. Say the pattern out loud from the start: ${order.row.filter(Boolean).map((s) => SEEDS[s].name.toLowerCase()).join(', ')}… What comes next?`, 'think');
        return renderRow();
      }
    }
    step = 'water';
    say('Perfect! Now they need water. Can you work out how many drops?', 'happy');
    render();
  }
  async function answer(x) {
    if (step !== 'water' || busy) return;
    const right = row.length * order.drops;
    if (x !== right) {
      sfx('wrong');
      const d = order.drops;
      return say(`Not that many. Count in ${d}s, one for each flower: ${d}, ${d * 2}, ${d * 3}… up to six flowers!`, 'think');
    }
    busy = true;
    step = 'growing';
    renderWork();
    say(`${right} drops! Here we go… grow, little ones, grow!`, 'happy');
    for (let i = 0; i < row.length; i++) {
      bed.water(i);
      await new Promise((r) => setTimeout(r, 260));
      if (el.hidden) return;
      void bed.grow(i);
    }
    await new Promise((r) => setTimeout(r, 1300));
    sfx('win');
    api.cheer?.();
    const first = !save.flowers.done[order.id];
    save.flowers.done[order.id] = true;
    persist();
    step = 'done';
    busy = false;
    const all = BEDS.every((o) => save.flowers.done[o.id]);
    say(all && first ? 'Every bed in bloom! You are a real gardener now. The château has never looked so pretty!' : first ? 'Look at them! A star for this bed. Shall we plant the next one?' : 'Beautiful, just beautiful. Another bed?', 'happy');
    render();
  }
  const handle = {
    kind: 'flowers',
    get bed() {
      return order?.id;
    },
    get step() {
      return step;
    },
    get busy() {
      return busy;
    },
    row: () => [...row],
    answerFor: () => [...(order.answer ?? [])],
    pick: (s) => ((seed = s), renderWork()),
    plant, check, answer: (n) => answer(n), start,
    right: () => row.length * order.drops
  };
  if (window.__game) window.__game.mini = handle;
  start(BEDS.find((o) => !save.flowers.done[o.id])?.id ?? 'ab');
  say(`Bonjour! I'm Basile. ${order.say}`, 'happy');
  return new Promise((resolve) => {
    $('#fl-done').onclick = () => {
      sfx('click');
      el.hidden = true;
      api.basile?.('calm');
      if (window.__game?.mini === handle) window.__game.mini = null;
      resolve();
    };
  });
}
