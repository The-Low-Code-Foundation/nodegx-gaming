// The heads-up display and the panels (the stone's question, crafting, the trophy case, the menu). Plain DOM.
import { ACTIONS } from './input.mjs';
import { SLOTS } from './weapons.mjs';
import { heartIcons } from './items.mjs';
import { AMMO, AMMO_BY_ID, TIERS, STANDARD } from './ammo.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Where a carved text is, said over it (DIG-007).
const CARVED = { lintel: 'Over a doorway', mural: 'Under a mural', statue: 'At the foot of a statue', song: 'A song', note: 'A note', tablet: 'A tablet', stone: 'A reading-stone' };
const firstWords = (s) => {
  const w = String(s ?? '').split(/\s+/).slice(0, 7).join(' ');
  return w.length < String(s ?? '').trim().length ? `${w} …` : w;
};
// Just enough Markdown for the sources page: headings, paragraphs, lists, bold, italic, links (as their text).
function markdown(md) {
  const inline = (s) => esc(s).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '$1');
  const out = [];
  let para = [], list = null;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
    if (list) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`);
    list = null;
  };
  for (const line of md.split('\n')) {
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      flush();
      const n = Math.min(4, h[1].length + 1);
      out.push(`<h${n}>${inline(h[2])}</h${n}>`);
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (para.length) flush();
      (list ??= []).push(line.replace(/^\s*[-*]\s+/, ''));
    } else if (!line.trim() || /^\s*(---|\*\*\*)\s*$/.test(line)) flush();
    else if (list && /^\s+/.test(line)) list[list.length - 1] += ` ${line.trim()}`;
    else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return out.join('');
}
export const KIND = { task:'A thing to plan', learn: 'Something to learn', reflect: 'To think about', body: 'For your body', people: 'Someone to see' };

// What a weapon has loaded: the special kind picked while any is left, else the standard.
export function loadedAmmo(kind, pack) {
  const id = pack.loaded?.[kind];
  return id && pack.ammo?.[id] > 0 && AMMO_BY_ID[id] ? AMMO_BY_ID[id] : STANDARD[kind];
}

export function makeHud({ onSlot, onMenu }) {
  const el = {
    hotbar: $('hotbar'), health: $('health'), depth: $('depth'), toasts: $('toasts'), prompt: $('prompt'),
    warn: $('warn'), stick: $('stick'), knob: $('knob'), panel: $('panel'), card: $('card'), crack: $('crack'),
    flash: $('flash'), hurt: $('hurt'), hit: $('hitmarker'), scope: $('scope'), crosshair: $('crosshair'), hookring: $('hookring'),
    compass: $('compass'), ticks: $('ticks'), marks: $('marks'), ammo: $('ammo'), burn: $('burn'), discover: $('discover'),
    buttons: { jump: $('btnJump'), fire: $('btnFire'), aim: $('btnAim'), use: $('btnUse'), pulse: $('btnPulse') },
    pulseRing: $('pulseRing'),
    pulseDial: $('pulseDial')
  };
  SLOTS.forEach((s, i) => {
    const b = document.createElement('button');
    b.dataset.i = i;
    b.innerHTML = `<i></i><span>${s.label}</span><b>0</b><u></u>`;
    b.setAttribute('aria-label', s.label);
    const pick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSlot(i);
    };
    b.addEventListener('touchstart', pick, { passive: false });
    b.addEventListener('mousedown', pick);
    el.hotbar.append(b);
  });
  // The compass: a strip of the horizon 150° wide, ticks every 15°, a letter every 45°, laid out once over two
  // turns of the circle (so sliding it never runs off the end).
  const SPAN = 150;
  let cw = 0;
  const lay = () => {
    cw = el.compass.clientWidth || 360;
    const px = cw / SPAN;
    el.ticks.innerHTML = '';
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let b = -180; b <= 540; b += 15) {
      const t = document.createElement('div');
      const n = names[(b + 360) % 360];
      t.className = n ? (n.length === 1 ? 'tick big' : 'tick mid') : 'tick';
      t.style.left = `${(b + 180) * px}px`;
      if (n) t.dataset.n = n;
      el.ticks.append(t);
    }
  };
  lay();
  addEventListener('resize', lay);
  const markPool = [];

  // Ten hearts for twenty health, as in Minecraft.
  const hearts = heartIcons();
  for (let i = 0; i < 10; i++) el.health.append(document.createElement('i'));
  const menuOpen = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onMenu();
  };
  $('menuBtn').addEventListener('touchstart', menuOpen, { passive: false });
  $('menuBtn').addEventListener('click', menuOpen);

  let panelClose = null;
  const hud = {
    el,
    touchZone: $('touch'),
    buttons: el.buttons,
    typing: () => document.activeElement?.tagName === 'TEXTAREA',
    panelOpen: () => !el.panel.hidden,

    // The counts: the special ammo loaded in a weapon (its colour on a bar under it), or ∞.
    slots(active, pack) {
      [...el.hotbar.children].forEach((b, i) => {
        const s = SLOTS[i];
        b.classList.toggle('on', i === active);
        const a = s.ammo ? loadedAmmo(s.ammo, pack) : null;
        b.querySelector('b').textContent = s.key ? (pack[s.key] ?? 0) : a?.id ? pack.ammo[a.id] : s.endless ? '∞' : '';
        b.querySelector('u').style.background = a?.id ? a.color : 'transparent';
        if (i === 0) b.querySelector('span').textContent = 'Cutter · flares';
      });
      const s = SLOTS[active];
      el.ammo.hidden = !s.ammo;
      if (s.ammo) {
        const a = loadedAmmo(s.ammo, pack);
        const kinds = AMMO.filter((x) => x.for === s.ammo && pack.ammo?.[x.id] > 0).length;
        el.ammo.innerHTML = a.id
          ? `<b style="color:${a.color}">${esc(a.name)}</b> · ${pack.ammo[a.id]}<small>${kinds > 1 ? `${kinds} kinds · ` : ''}${hud.ammoHint}</small>`
          : `Standard rounds · ∞${pack.fireMode === 'auto' ? ' · auto' : ''}${kinds ? `<small>${kinds} special kind${kinds > 1 ? 's' : ''} · ${hud.ammoHint}</small>` : ''}`;
      }
    },
    ammoHint: '',
    // The compass strip. heading: degrees clockwise from north. marks: { bearing, dy, dist, kind } — off the strip,
    // a mark waits at the edge it is beyond.
    compass(heading, marks) {
      const px = cw / SPAN;
      el.ticks.style.transform = `translateX(${cw / 2 - (heading + 180) * px}px)`;
      while (markPool.length < marks.length) {
        const m = document.createElement('div');
        m.innerHTML = '<i></i><span></span>';
        el.marks.append(m);
        markPool.push(m);
      }
      markPool.forEach((m, i) => {
        const k = marks[i];
        m.hidden = !k;
        if (!k) return;
        let rel = ((k.bearing - heading + 540) % 360) - 180;
        const edge = Math.abs(rel) > SPAN / 2 - 4;
        rel = Math.max(-SPAN / 2 + 4, Math.min(SPAN / 2 - 4, rel));
        m.className = `mk ${k.kind}${edge ? (rel < 0 ? ' edge left' : ' edge right') : ''}`;
        m.style.transform = `translateX(${cw / 2 + rel * px}px)`;
        const v = k.dy > 3 ? '▲' : k.dy < -3 ? '▼' : '';
        const text = `${v}${k.dist < 1000 ? Math.round(k.dist) : '…'}m`;
        const span = m.lastChild;
        if (span.textContent !== text) span.textContent = text;
      });
    },
    burning(on) {
      el.burn.classList.toggle('on', !!on);
    },
    // A kind of ammo arriving in the pack: new ones get the middle of the screen for a moment.
    discover(a, n, isNew) {
      if (!isNew) return hud.toast(`+${n} ${a.name}`);
      const t = TIERS[a.tier];
      el.discover.innerHTML = `<div class="tier" style="color:${t.color}">New · ${t.label} multitool ammo</div><h3 style="color:${a.color}">${esc(a.name)} × ${n}</h3><p>${esc(a.text)}</p><p class="small">${hud.ammoHint}</p>`;
      el.discover.classList.remove('on');
      void el.discover.offsetWidth;
      el.discover.classList.add('on');
    },
    // The hotbar's pictures (made from the hand's own pixels once the atlas exists).
    setIcons(urls) {
      [...el.hotbar.children].forEach((b, i) => (b.querySelector('i').style.backgroundImage = `url(${urls[i]})`));
    },
    vitals(health, max, depth) {
      const h = (health / max) * 20;
      [...el.health.children].forEach((heart, i) => {
        const v = h / 2 - i;
        const url = v >= 0.75 ? hearts.full : v >= 0.25 ? hearts.half : hearts.empty;
        if (heart.dataset.url !== url) {
          heart.dataset.url = url;
          heart.style.backgroundImage = `url(${url})`;
        }
      });
      el.depth.textContent = depth > 0 ? `${Math.round(depth)} m down` : 'the surface';
    },
    toast(text) {
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = text;
      el.toasts.append(t);
      setTimeout(() => t.remove(), 3700);
      while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
    },
    // The pulse's button (phone) and dial (desktop): p how far it has recharged (0–1), c how far a hold has charged it.
    pulse(p, c) {
      for (const e of [el.buttons.pulse, el.pulseDial]) {
        e.style.setProperty('--p', p.toFixed(3));
        e.style.setProperty('--c', c.toFixed(3));
        e.classList.toggle('ready', p >= 1);
      }
    },
    // The ring going out across the view.
    ring() {
      el.pulseRing.classList.remove('go');
      void el.pulseRing.offsetWidth;
      el.pulseRing.classList.add('go');
    },
    prompt(text) {
      el.prompt.textContent = text ?? '';
      el.prompt.classList.toggle('on', !!text);
    },
    crack(p) {
      el.crack.classList.toggle('on', p > 0);
      el.crack.style.setProperty('--p', `${Math.round(p * 100)}%`);
    },
    flash(o = 0.35) {
      el.flash.style.transition = 'none';
      el.flash.style.opacity = o;
      requestAnimationFrame(() => {
        el.flash.style.transition = 'opacity 0.2s';
        el.flash.style.opacity = 0;
      });
    },
    hurt() {
      el.hurt.style.transition = 'none';
      el.hurt.style.opacity = 1;
      requestAnimationFrame(() => {
        el.hurt.style.transition = 'opacity 0.6s';
        el.hurt.style.opacity = 0;
      });
    },
    hitMarker(head) {
      el.hit.classList.toggle('head', !!head);
      el.hit.classList.add('on');
      setTimeout(() => el.hit.classList.remove('on'), 60);
    },
    scope(on) {
      el.scope.style.opacity = on ? 1 : 0;
      el.crosshair.style.opacity = on ? 0 : 1;
    },
    // With the hook in hand: a ring round the crosshair, lit when the hook can reach what it points at.
    hookRing(inHand, reach) {
      el.hookring.classList.toggle('on', !!inHand);
      el.hookring.classList.toggle('reach', !!reach);
    },
    // Only the buttons that apply right now: the two for what is in hand (input.mjs ACTIONS), and Use.
    context({ hand, use }) {
      const [main, second] = ACTIONS[hand] ?? [];
      for (const [b, a] of [[el.buttons.fire, main], [el.buttons.aim, second]]) {
        b.hidden = !a;
        if (a && b.textContent !== a.label) b.textContent = a.label;
      }
      el.buttons.use.hidden = !use;
      if (use) el.buttons.use.textContent = use;
    },
    stick(on, x, y, dx = 0, dy = 0) {
      el.stick.classList.toggle('on', !!on);
      if (!on) return;
      el.stick.style.left = `${x}px`;
      el.stick.style.top = `${y}px`;
      el.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    },
    // A dismissable bar: yellow at 15 minutes, orange at 30, red at 45. It never stops the game.
    warn(level, text) {
      const bar = document.createElement('div');
      bar.className = `bar ${level}`;
      bar.innerHTML = `<span>${esc(text)}</span><button aria-label="Dismiss">✕</button>`;
      const close = (e) => {
        e.preventDefault();
        e.stopPropagation();
        bar.remove();
      };
      bar.querySelector('button').addEventListener('click', close);
      bar.querySelector('button').addEventListener('touchstart', close, { passive: false });
      el.warn.replaceChildren(bar);
    },

    open(html, { onClose } = {}) {
      el.card.innerHTML = html;
      el.panel.hidden = false;
      panelClose = onClose ?? null;
      el.card.scrollTop = 0;
      return el.card;
    },
    close() {
      if (el.panel.hidden) return;
      el.panel.hidden = true;
      el.card.innerHTML = '';
      const f = panelClose;
      panelClose = null;
      f?.();
    },

    // The stone in a planted room: the instructions, and the answer that wakes the portal.
    lectern(plant, { answered, previous, date, source }, onAnswer) {
      const kind = KIND[plant.kind] ?? 'Planted for you';
      const when = source === 'sample' ? 'A sample room' : `Planted the night before ${esc(date)}`;
      const card = hud.open(`
        <div class="kind">${esc(kind)}</div>
        <h2>${esc(plant.title)}</h2>
        <p>${esc(plant.instructions)}</p>
        <p class="ask">${esc(plant.ask)}</p>
        <textarea id="answer" placeholder="Write it here. The portal wakes when you carve it.">${esc(previous ?? '')}</textarea>
        <p class="dim">${when}. What you carve is kept in this browser.${answered ? ' You have already carved an answer: the portal is open.' : ''}</p>
        <div class="row"><button class="go" id="carve">${answered ? 'Carve again' : 'Carve it into the stone'}</button><button id="later">Not now</button></div>`);
      card.querySelector('#later').onclick = () => hud.close();
      card.querySelector('#carve').onclick = async () => {
        const text = card.querySelector('#answer').value.trim();
        if (!text) {
          card.querySelector('#answer').focus();
          return;
        }
        card.querySelector('#carve').disabled = true;
        await onAnswer(text);
        hud.close();
      };
    },
    // What they carved (DIG-007): one text a page, a shelf's tablets one after another. onShown(text) as each shows.
    carved(texts, where, onShown) {
      let i = 0;
      const draw = () => {
        const t = texts[i];
        const last = i === texts.length - 1;
        const card = hud.open(`<div class="kind">${esc(where)} · ${esc(CARVED[t.kind] ?? 'Carved')}</div>${t.title ? `<h2>${esc(t.title)}</h2>` : ''}<p class="carved">${esc(t.body)}</p>
          <div class="row">${last ? '' : `<button class="go" id="next">${texts[i + 1].kind === 'note' ? 'The next one' : 'The next tablet'}</button>`}<button${last ? ' class="go"' : ''} id="ok">Close</button></div>`);
        onShown?.(t);
        card.querySelector('#ok').onclick = () => hud.close();
        const n = card.querySelector('#next');
        if (n) n.onclick = () => (i++, draw());
      };
      draw();
    },
    // The record: everything read, in the order found, readable again. No total, nothing marked missing.
    record(entries, onBack) {
      const list = () => {
        const rows = entries.length
          ? entries.map((e, i) => `<button class="rec-row" data-i="${i}"><b>${esc(e.text.title || firstWords(e.text.body))}</b><br><span class="small">${esc(e.where ?? '')} · ${esc(CARVED[e.text.kind] ?? 'Carved')}</span></button>`).join('')
          : '<p class="dim">Nothing read yet. What you read down there is kept here, to read again.</p>';
        const card = hud.open(`<div class="kind">The Dig</div><h2>The record</h2><div class="rec-list">${rows}</div><div class="row"><button class="go" id="back">Back</button></div>`);
        card.querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => one(Number(b.dataset.i))));
        card.querySelector('#back').onclick = () => (onBack ? onBack() : hud.close());
      };
      const one = (i) => {
        const e = entries[i];
        const card = hud.open(`<div class="kind">${esc(e.where ?? '')} · ${esc(CARVED[e.text.kind] ?? 'Carved')}</div>${e.text.title ? `<h2>${esc(e.text.title)}</h2>` : ''}<p class="carved">${esc(e.text.body)}</p>
          <div class="row"><button class="go" id="list">The record</button></div>`);
        card.querySelector('#list').onclick = list;
      };
      list();
    },
    // A page of a little Markdown (unused in this copy: the menu no longer opens it).
    sources(md, onBack) {
      const body = md ? markdown(md) : '<p class="dim">This page could not be fetched just now.</p>';
      const card = hud.open(`<div class="kind">The Dig</div><div class="sources">${body}</div><div class="row"><button class="go" id="back">Back</button></div>`);
      card.querySelector('#back').onclick = () => (onBack ? onBack() : hud.close());
    },
    note(note, where) {
      const card = hud.open(`<div class="kind">${esc(where)}</div><h2>${esc(note.title)}</h2><p>${esc(note.text)}</p><div class="row"><button class="go" id="ok">Close</button></div>`);
      card.querySelector('#ok').onclick = () => hud.close();
    },
    craft(pack, recipes, onCraft) {
      const draw = () => {
        const rows = recipes
          .map((r, i) => `<div class="recipe"><div><b>${esc(r.makes)}</b><br><span class="small">${esc(r.from)}</span></div><button data-i="${i}" ${r.can(pack) ? '' : 'disabled'}>Make</button></div>`)
          .join('');
        const card = hud.open(`<div class="kind">Craft</div><h2>The pack</h2>
          <p class="dim">Coal ${pack.coal} · Iron ${pack.iron} · Flint ${pack.flint} · Crystal ${pack.crystal}</p>${rows}
          <div class="row"><button class="go" id="done">Done</button></div>`);
        card.querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => {
          onCraft(recipes[Number(b.dataset.i)]);
          draw();
        }));
        card.querySelector('#done').onclick = () => hud.close();
      };
      draw();
    },
    // The ammo for one weapon: the standard (always there), then every special kind in the pack.
    ammo(kind, pack, onPick, onMode) {
      const have = AMMO.filter((a) => a.for === kind && pack.ammo?.[a.id] > 0);
      const cur = loadedAmmo(kind, pack).id;
      const row = (a, n) => {
        const t = a.tier ? TIERS[a.tier] : null;
        return `<button class="ammo-row${(a.id ?? null) === cur ? ' on' : ''}" data-id="${a.id ?? ''}"><i style="background:${a.color}"></i><span><b>${esc(a.name)}</b>${t ? ` <em style="color:${t.color}">${t.label}</em>` : ''}<br><span class="small">${esc(a.text ?? 'Never runs out.')}</span></span><strong>${n}</strong></button>`;
      };
      const rows = [row({ ...STANDARD[kind], name: 'Standard rounds', text: null }, '∞'), ...have.map((a) => row(a, pack.ammo[a.id]))].join('');
      // Standard rounds only: one shot a press, or firing while held. Special ammo is always one a press.
      const mode = pack.fireMode === 'auto' ? 'auto' : 'single';
      const modes = `<div class="fire-mode"><span class="small">Standard rounds fire</span><div class="seg"><button data-mode="single"${mode === 'single' ? ' class="on"' : ''}>Single shot</button><button data-mode="auto"${mode === 'auto' ? ' class="on"' : ''}>Auto</button></div><span class="small dim">Special ammo is always one shot a press.</span></div>`;
      const seen = (pack.seen ?? []).filter((id) => AMMO_BY_ID[id]?.for === kind).length;
      const card = hud.open(`<div class="kind">The multitool</div><h2>Load</h2>${modes}<div class="ammo-list">${rows}</div>
        <p class="dim">${have.length ? '' : 'Nothing special yet. '}${seen ? `${seen} kind${seen > 1 ? 's' : ''} found so far. ` : ''}More kinds wait behind the portals, in glowing caches, and on the brutes.</p>
        <div class="row"><button class="go" id="ok">Done</button></div>`);
      card.querySelectorAll('button[data-id]').forEach((b) => (b.onclick = () => onPick(b.dataset.id || null)));
      card.querySelectorAll('button[data-mode]').forEach(
        (b) =>
          (b.onclick = () => {
            onMode?.(b.dataset.mode);
            card.querySelectorAll('button[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
          })
      );
      card.querySelector('#ok').onclick = () => onPick(cur);
      // A long list scrolls; open it at what is loaded.
      card.querySelector('.ammo-row.on')?.scrollIntoView({ block: 'nearest' });
    },
    trophies(list) {
      const items = list.length
        ? list
            .slice()
            .reverse()
            .map((t) => `<div class="trophy"><b>${esc(t.name)}</b><p class="small">${esc(t.description)}</p><small>${esc(t.world)} · ${esc((t.at ?? '').slice(0, 10))}</small></div>`)
            .join('')
        : '<p class="dim">Empty for now. Treasure waits on the far side of the portals.</p>';
      const card = hud.open(`<div class="kind">The trophy case</div><h2>${list.length} found</h2><div class="grid">${items}</div><div class="row"><button class="go" id="ok">Close</button></div>`);
      card.querySelector('#ok').onclick = () => hud.close();
    },
    menu(actions, today) {
      const rooms = today.plants
        .map((p) => `<li>${esc(p.title)} <span class="small">· ${p.answered ? 'answered, the portal is open' : 'somewhere in the deep'}</span></li>`)
        .join('');
      const source = today.source === 'nightly' ? 'Planted last night' : today.source === 'older' ? `No new rooms last night: these are from ${esc(today.date)}` : 'Sample rooms';
      const card = hud.open(`<div class="kind">The Dig</div><h2>Paused</h2>
        <p class="dim">${source}${today.note ? ` · ${esc(today.note)}` : ''}</p><ul>${rooms}</ul>
        <div class="menu">${actions.map((a, i) => `<button data-i="${i}">${esc(a.label)}</button>`).join('')}</div>`);
      card.querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => actions[Number(b.dataset.i)].run()));
    },
    help(touch) {
      const lines = touch
        ? ['Left thumb anywhere on the left: move. Push to the rim: run (loud).', 'Right thumb: look.', '▲ jumps. Beside it, two buttons for what is in hand: the cutter\'s Dig (hold) and Flare, rubble\'s Place and Dig, the multitool\'s Fire and Aim (raises the sight), the hook\'s Fire. A flare with nothing near is thrown: it lands on the first floor it meets. Flares never run out.', 'The hook: aim at rock (the ring round the crosshair lights when it can reach) and Fire. It pulls you up; aimed at the lip of a ledge it puts you on top. Fire again in the air to go higher; ▲ lets go.', 'Tap the multitool again in the hotbar to load special ammo.', 'Pulse (above ▲): hold it about a second and let go. Soft glows show where the rock is hollow in front of you: blue a cave, teal water, red lava, gold something somebody built, violet a room waiting for you. The farther, the fuzzier. It is loud, and it takes twelve seconds to charge again. Look at a glow and Use says Pin: it goes on the compass.', 'Use appears when you look at something you can read or take.', 'The compass at the top shows north, the ship (white) and your pins. Nothing else is on it: the rooms you find by the pulse, and by their hum close up.']
        : ['WASD move, Shift run (loud), Space jump.', 'Left mouse: cut (or fire). Right mouse: place a flare, or rubble with rubble in hand; raise the sight with the multitool. With nothing near, right mouse throws the flare: it lands on the first floor it meets. Flares never run out.', 'F places a flare whatever is in hand. E uses. 1–4 or the wheel pick from the hotbar.', 'R is the pulse: hold it about a second and let go. Soft glows show where the rock is hollow in front of you: blue a cave, teal water, red lava, gold something somebody built, violet a room waiting for you. The farther, the fuzzier. It is loud, and it takes twelve seconds to charge again. Look at a glow and press E to pin it to the compass.', 'Press 3 again (the multitool in hand) to load special ammo; Q swaps to the next kind.', '4 is the grappling hook: aim at rock (the ring round the crosshair lights when it can reach) and click. It pulls you up; aimed at the lip of a ledge it puts you on top. Click again in the air to go higher; Space lets go.', 'The compass at the top shows north, the ship (white) and your pins. Nothing else is on it: the rooms you find by the pulse, and by their hum close up.', 'C crafts, T opens the trophy case, Esc pauses.'];
      const card = hud.open(`<div class="kind">How to dig</div><h2>Controls</h2><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        <p class="dim">Flares keep the crawlers off: they won't walk into bright light. The brutes hunt by sound: walk, don't run, and a one-block tunnel is too narrow for them. Dying costs nothing in the pack: you come round in the ship's med bay.</p>
        <div class="row"><button class="go" id="ok">Close</button></div>`);
      card.querySelector('#ok').onclick = () => hud.close();
    },
    home({ world, found, minutes }, onDone, onDig) {
      const items = found.length ? `<ul>${found.map((f) => `<li><b>${esc(f.name)}</b> <span class="small">${esc(f.description)}</span></li>`).join('')}</ul>` : '<p class="dim">Nothing taken this time. It will still be there.</p>';
      const card = hud.open(`<div class="kind">Back through the portal</div><h2>Home from ${esc(world)}</h2>${items}
        <p class="dim">${minutes} minutes this session. The cave stays exactly as you left it.</p>
        <div class="row"><button class="go" id="done">Done for now</button><button id="dig">Keep digging</button></div>`);
      card.querySelector('#done').onclick = () => {
        hud.close();
        onDone();
      };
      card.querySelector('#dig').onclick = () => {
        hud.close();
        onDig();
      };
    }
  };
  return hud;
}
