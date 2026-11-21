// Grooming Étoile (the Stables, round 3; SCOPE.md §7: "groom, braid her mane with ribbons; later ride her"). Four
// steps, like the bakery's: brush the mud off her coat (tap each brown spot on her, in 3D), feed her (how many more
// carrots does she want? a new sum each time), make her pretty (her mane, a ribbon, a blanket, her hooves, sparkles:
// she changes as she picks), then "Fly, Étoile!": a little flight round the stable. Her look is kept for next time.
// The choices are data (PONY_OPTIONS).
//
// open(api) resolves when she closes it. api: { save, persist, sfx(name), etoile, pick(meshes, x, y), cheer() } where
// `etoile` is friends.mjs makePegasus() and `pick` finds which of the meshes is under the pointer. While open,
// `window.__game.mini` is { kind: 'pony', step, brushNext(), mudLeft, want, answer(n), set(group, id), fly(), go(step) }.

export const PONY_OPTIONS = {
  mane: [
    { id: 'pink', name: 'Candy pink', color: '#ffa8d0' },
    { id: 'lilac', name: 'Lilac', color: '#c8a8ff' },
    { id: 'gold', name: 'Golden', color: '#ffd86a' },
    { id: 'sky', name: 'Sky blue', color: '#9ad0ff' },
    { id: 'mint', name: 'Mint', color: '#9fe8c8' }
  ],
  ribbon: [
    { id: 'none', name: 'No ribbon', color: null },
    { id: 'rose', name: 'Rose', color: '#ff5f9e' },
    { id: 'blue', name: 'Blue', color: '#4a7ae0' },
    { id: 'gold', name: 'Gold', color: '#f2c94a' }
  ],
  blanket: [
    { id: 'none', name: 'No blanket', color: null },
    { id: 'violet', name: 'Violet', color: '#7a5ad8' },
    { id: 'rose', name: 'Rose', color: '#e0608a' },
    { id: 'mint', name: 'Mint', color: '#3fb59a' },
    { id: 'night', name: 'Starry night', color: '#232a6b' }
  ],
  hooves: [
    { id: 'lilac', name: 'Pearl', color: '#c8b0d8' },
    { id: 'gold', name: 'Gold', color: '#f2c94a' },
    { id: 'silver', name: 'Silver', color: '#e6ecff' }
  ],
  sparkle: [
    { id: 'off', name: 'No sparkles', value: false },
    { id: 'on', name: 'Sparkles!', value: true }
  ]
};
const GROUPS = { mane: 'Her mane', ribbon: 'A ribbon', blanket: 'A blanket', hooves: 'Her hooves', sparkle: 'Magic' };
const STEPS = [
  { id: 'brush', title: 'Brush' },
  { id: 'feed', title: 'Feed' },
  { id: 'style', title: 'Make her pretty' },
  { id: 'fly', title: 'Fly!' }
];
const FRESH_LOOK = { mane: 'pink', ribbon: 'none', blanket: 'none', hooves: 'lilac', sparkle: 'off' };
// Dress her as she was left (main.mjs calls it when the Stables load, so she keeps her ribbon between visits).
export function applyLook(etoile, L = FRESH_LOOK) {
  const col = (g) => PONY_OPTIONS[g].find((o) => o.id === L[g]) ?? PONY_OPTIONS[g][0];
  etoile.setLook({ mane: col('mane').color, ribbon: col('ribbon').color, blanket: col('blanket').color, hooves: col('hooves').color, sparkle: col('sparkle').value });
}

let el = null;
function ensure() {
  if (el) return el;
  el = document.createElement('section');
  el.id = 'pony';
  el.hidden = true;
  el.innerHTML = `
    <div class="win side-panel pony-panel">
      <h2>Étoile the Pegasus</h2>
      <div class="row" id="po-steps"></div>
      <p class="say" id="po-say"></p>
      <div id="po-work"></div>
      <p class="small"><button class="link" id="po-done">Give Étoile a hug and go</button></p>
    </div>`;
  document.body.appendChild(el);
  return el;
}

export function open(api) {
  const { save, persist, sfx, etoile } = api;
  save.pony ??= { look: { ...FRESH_LOOK }, grooms: 0, flights: 0 };
  ensure();
  el.hidden = false;
  const $ = (s) => el.querySelector(s);
  let step = 'brush', want = 0, has = 0, busy = false;
  const look = () => applyLook(etoile, save.pony.look);
  look();
  etoile.resetMud();
  const say = (text, mood) => {
    $('#po-say').innerHTML = `<b>${mood === 'neigh' ? 'Étoile' : 'Lumière'}:</b> ${text}`;
    if (mood && mood !== 'neigh') etoile.mood(mood);
  };
  const button = (html, cls, fn) => {
    const b = document.createElement('button');
    b.innerHTML = html;
    if (cls) b.className = cls;
    b.onclick = () => (sfx('click'), fn());
    return b;
  };
  const renderSteps = () => {
    const done = save.pony.grooms > 0;
    $('#po-steps').replaceChildren(...STEPS.map((s, i) => {
      const b = button(`${i + 1}. ${s.title}`, `chip${step === s.id ? ' on' : ''}`, () => go(s.id));
      b.disabled = !done && s.id !== step;
      return b;
    }));
  };
  const renderWork = () => {
    const w = $('#po-work');
    w.innerHTML = '';
    if (step === 'brush') {
      const p = document.createElement('p');
      p.className = 'big-count';
      p.textContent = etoile.mudLeft ? `${etoile.mudLeft} muddy spot${etoile.mudLeft > 1 ? 's' : ''} left` : 'All clean!';
      const acts = document.createElement('div');
      acts.className = 'row actions';
      acts.append(button('Brush the next spot', '', brushNext));
      w.append(p, acts);
    } else if (step === 'feed') {
      const h = document.createElement('h3');
      h.textContent = `Étoile wants ${want} carrots. There are ${has} in her bucket. How many more does she need?`;
      const right = want - has;
      const opts = [...new Set([right, right + 1, right - 1, want + has, right + 2])].filter((x) => x > 0).slice(0, 4).sort(() => Math.random() - 0.5);
      const row = document.createElement('div');
      row.className = 'row answers';
      row.replaceChildren(...opts.map((x) => button(String(x), 'answer', () => answer(x))));
      w.append(h, row);
    } else if (step === 'style') {
      for (const [g, opts] of Object.entries(PONY_OPTIONS)) {
        const grp = document.createElement('div');
        grp.className = 'group';
        grp.innerHTML = `<h3>${GROUPS[g]}</h3>`;
        const row = document.createElement('div');
        row.className = 'row';
        row.replaceChildren(...opts.map((o) => button(`${o.color ? `<span class="swatch" style="background:${o.color}"></span>` : ''}${o.name}`, save.pony.look[g] === o.id ? 'on' : '', () => set(g, o.id))));
        grp.append(row);
        w.append(grp);
      }
      const acts = document.createElement('div');
      acts.className = 'row actions';
      acts.append(button('She’s ready!', 'big', () => go('fly')));
      w.append(acts);
    } else if (step === 'fly') {
      const acts = document.createElement('div');
      acts.className = 'row actions';
      const b = button('✨ Fly, Étoile! ✨', 'big', fly);
      b.disabled = busy;
      acts.append(b);
      if (!busy && save.pony.flights) acts.append(button('Groom her again', '', () => (etoile.resetMud(), go('brush'))));
      w.append(acts);
    }
  };
  const render = () => (renderSteps(), renderWork());
  function go(s) {
    step = s;
    busy = false;
    if (s === 'brush') say(etoile.mudLeft ? 'Étoile rolled in the mud! Tap the brown spots on her coat to brush them off.' : 'She is all clean already! On to the next step.', 'think');
    if (s === 'feed') {
      want = 6 + Math.floor(Math.random() * 10);
      has = 1 + Math.floor(Math.random() * (want - 2));
      say('Brushing makes a pony hungry! Carrots, please!', 'neigh');
    }
    if (s === 'style') say('Now make her the prettiest pegasus in France! She changes as you pick.', 'happy');
    if (s === 'fly') say('Her wings are fluttering… I think she wants to fly!', 'happy');
    render();
  }
  function brushNext() {
    const spot = etoile.mud.find((m) => m.visible);
    if (spot) brush(spot);
  }
  function brush(spot) {
    if (step !== 'brush' || !etoile.brush(spot)) return;
    sfx('potion');
    api.cheer?.();
    if (!etoile.mudLeft) {
      etoile.mood('happy');
      say('Squeaky clean! She’s shining!', 'happy');
      setTimeout(() => step === 'brush' && go('feed'), 1300);
    }
    renderWork();
  }
  function answer(x) {
    if (step !== 'feed' || busy) return;
    if (x !== want - has) {
      sfx('wrong');
      return say(`Not quite. Count on from ${has} up to ${want}: how many numbers did you say?`, 'think');
    }
    busy = true;
    sfx('reward');
    etoile.eat();
    say(`${want - has} more! Crunch, crunch, crunch… Thank you!`, 'neigh');
    setTimeout(() => step === 'feed' && go('style'), 2400);
  }
  function set(g, id) {
    save.pony.look[g] = id;
    look();
    sfx('potion');
    api.cheer?.();
    persist();
    renderWork();
  }
  async function fly() {
    if (busy) return;
    busy = true;
    renderWork();
    sfx('cast');
    say('Up, up and away!', 'happy');
    await etoile.fly();
    sfx('win');
    api.cheer?.();
    save.pony.flights++;
    save.pony.grooms++;
    persist();
    busy = false;
    say(save.pony.flights === 1 ? 'She flew! Étoile loves you now. Come back and groom her any time.' : `Flight number ${save.pony.flights}! What a clever pegasus.`, 'happy');
    render();
  }
  // Tapping her coat: a mud spot under the pointer is brushed off.
  const onTap = (e) => {
    if (step !== 'brush' || e.target.closest?.('.win')) return;
    const hit = api.pick(etoile.mud.filter((m) => m.visible), e.clientX, e.clientY);
    if (hit) brush(hit);
  };
  addEventListener('pointerup', onTap);
  const handle = {
    kind: 'pony',
    get step() {
      return step;
    },
    get mudLeft() {
      return etoile.mudLeft;
    },
    get want() {
      return want - has;
    },
    get busy() {
      return busy;
    },
    brushNext, answer, set, fly, go
  };
  if (window.__game) window.__game.mini = handle;
  go('brush');
  return new Promise((resolve) => {
    $('#po-done').onclick = () => {
      sfx('click');
      removeEventListener('pointerup', onTap);
      el.hidden = true;
      etoile.mood('calm');
      if (window.__game?.mini === handle) window.__game.mini = null;
      resolve();
    };
  });
}
