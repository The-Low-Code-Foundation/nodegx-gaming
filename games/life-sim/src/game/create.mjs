// Create your own Sim (round 10, the brief: "Let's tackle saving, buy menu, create your own sim…"). Before a new game:
// one of the twelve people on a stand (the face stays theirs: brief answer 1), a name, rounder or thinner, taller or
// shorter, hair colour and style, an outfit and its colours, and the school year the work questions are pitched at.
// The look controls (`lookControls`) are also the chest of drawers' card in the game: clothes and hair, not the body.
import * as THREE from 'three';
import { Face } from '../face.mjs';
import { HAIR_COLOURS, CLOTH_COLOURS, blankLook, randomLook } from './looks.mjs';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The hair and clothes rows (and with `body`, the two body sliders), drawn into `el`. `look` is changed in place;
// `onChange()` is called after each change (the caller dresses the body and hands back its fabrics with `fabrics()`).
// A borrowed hairstyle or outfit is only offered when it measured clean on this person (looks.mjs `safe`): the
// lender is loaded the first time it is asked for.
export function lookControls(el, { folk, t, who, look, names, onChange, body = false }) {
  let fabrics = [];
  let busy = false;
  const others = [...folk.cast.keys()].filter((j) => j !== who);
  const lender = (kind) => (kind === 'hair' ? look.hair.style : look.outfit.from);
  const chip = (kind, j) => {
    const name = j === who ? null : folk.cast[j].name;
    const on = (lender(kind) ?? null) === name;
    return `<button data-${kind}="${j}" class="${on ? 'on' : ''}">${j === who ? t('ui.look.own') : t('ui.look.whose', { name: names[j] })}</button>`;
  };
  const swatches = (attr, list, current, plain) =>
    `<div class="swatches"><button class="plain ${current ? '' : 'on'}" data-${attr}="">${plain}</button>${list.map((c) => `<button data-${attr}="${c}" style="background:${c}" class="${current === c ? 'on' : ''}" title="${c}"></button>`).join('')}</div>`;
  function render() {
    el.innerHTML = `${body ? `<h3>${t('ui.look.body')}</h3>
        <div class="slider"><span>${t('ui.look.thinner')}</span><input type="range" id="look-weight" min="-80" max="80" value="${Math.round(look.weight * 100)}"><span>${t('ui.look.rounder')}</span></div>
        <div class="slider"><span>${t('ui.look.shorter')}</span><input type="range" id="look-height" min="94" max="106" value="${Math.round(look.height * 100)}"><span>${t('ui.look.taller')}</span></div>` : ''}
      <h3>${t('ui.look.hairColour')}</h3>${swatches('hc', HAIR_COLOURS, look.hair.colour, t('ui.look.asNow'))}
      <h3>${t('ui.look.hairStyle')}</h3><div class="chips">${[who, ...others].map((j) => chip('hair', j)).join('')}</div>
      <h3>${t('ui.look.outfit')}</h3><div class="chips">${[who, ...others].map((j) => chip('outfit', j)).join('')}</div>
      ${fabrics.map((f) => `<h3>${t(`ui.look.fabric.${f.channel}`)}</h3>${swatches(`fc${f.channel}`, CLOTH_COLOURS, look.outfit.colours[f.channel], t('ui.look.asMade'))}`).join('')}
      <p class="note" id="look-note"></p>`;
    const note = (key) => (el.querySelector('#look-note').textContent = key ? t(key) : '');
    const change = async (fn) => {
      if (busy) return;
      busy = true;
      try {
        if ((await fn()) !== false) await onChange();
      } finally {
        busy = false;
      }
    };
    if (body) {
      el.querySelector('#look-weight').onchange = (e) => change(() => (look.weight = Number(e.target.value) / 100));
      el.querySelector('#look-height').onchange = (e) => change(() => (look.height = Number(e.target.value) / 100));
    }
    for (const b of el.querySelectorAll('[data-hc]')) b.onclick = () => change(() => (look.hair.colour = b.dataset.hc || null));
    for (const ch of [0, 1, 2]) for (const b of el.querySelectorAll(`[data-fc${ch}]`)) b.onclick = () => change(() => (look.outfit.colours[ch] = b.dataset[`fc${ch}`] || null));
    for (const kind of ['hair', 'outfit'])
      for (const b of el.querySelectorAll(`[data-${kind}]`))
        b.onclick = () =>
          change(async () => {
            const j = Number(b.dataset[kind]);
            note('ui.look.loading');
            if (!(await folk.safe(kind, who, j))) return note('ui.look.unsafe'), false;
            note(null);
            const name = j === who ? null : folk.cast[j].name;
            if (kind === 'hair') look.hair.style = name;
            // A new outfit starts in its own colours (the old one's fabrics may not be this one's).
            else look.outfit = { from: name, colours: [null, null, null] };
          });
  }
  render();
  return {
    // After dressing: the fabrics this outfit has, for its colour rows.
    fabrics(list) {
      fabrics = (list ?? []).slice().sort((a, b) => a.channel - b.channel);
      render();
    },
    render
  };
}

// The create-a-Sim screen. Runs its own loop on the game's renderer (the places hidden, a stand in their place) until
// "Move in" is pressed, then hands back { who, name, look, year, body }: the body is the one on the stand, already
// dressed, for the game to use.
export function createSim({ renderer, scene, camera, controls, folk, t, names, years, year, person = 0 }) {
  const $ = (id) => document.getElementById(id);
  const root = $('create');
  const stage = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.66, 0.08, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
  stand.position.y = -0.04;
  stand.receiveShadow = true;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd5e3d0, roughness: 1 }));
  floor.position.y = -0.081;
  floor.receiveShadow = true;
  stage.add(stand, floor);
  scene.add(stage);
  const was = { background: scene.background, target: controls.target.clone(), camera: camera.position.clone(), min: controls.minDistance, max: controls.maxDistance, polar: controls.maxPolarAngle };
  scene.background = new THREE.Color(0xe9f1f6);
  Object.assign(controls, { minDistance: 1.6, maxDistance: 7, maxPolarAngle: 1.5 });
  const frame = () => {
    // The Sim stands right of the middle: the panel is on the left.
    const k = Math.min(1, innerWidth / 1400);
    controls.target.set(-0.55 * k, 0.95, 0);
    camera.position.set(-0.55 * k, 1.35, 4.3);
    controls.update();
  };
  frame();

  let who = person, name = names[person], look = blankLook(), chosenYear = year;
  let shown = null, mixer = null, face = null, loading = 0, fabricsNow = [];
  const looks = new Map(); // each person's look, kept while you flip between them

  // The line under the buttons (not there before the panel is first drawn).
  const status = (text) => $('create-loading') && ($('create-loading').textContent = text);
  async function show(j) {
    const ticket = ++loading;
    status(t('ui.look.loading'));
    const body = await folk.body(j);
    const result = await folk.redress(body, looks.get(j) ?? blankLook());
    if (ticket !== loading) return body.outer.removeFromParent();
    fabricsNow = result.fabrics;
    shown?.outer.removeFromParent();
    shown = body;
    body.outer.traverse((o) => o.isMesh && (o.castShadow = true));
    stage.add(body.outer);
    mixer = new THREE.AnimationMixer(body.outer);
    mixer.clipAction(body.clips.Idle_Loop).play();
    face = new Face(body.outer, body.faceTable);
    face.mood = 'happy';
    status('');
  }
  const dressed = async () => {
    const result = await folk.redress(shown, look);
    fabricsNow = result.fabrics;
    controls_.fabrics(fabricsNow);
  };

  let controls_ = null;
  function render() {
    const taken = names.findIndex((n, j) => j !== who && n.toLowerCase() === name.trim().toLowerCase());
    const bad = !name.trim() ? 'ui.create.noName' : taken >= 0 ? 'ui.create.taken' : null;
    root.innerHTML = `<h2>${t('ui.create.title')}</h2>
      <p class="intro">${t('ui.create.intro')}</p>
      <h3>${t('ui.create.who')}</h3>
      <div class="who"><button id="create-prev" title="${t('ui.create.prev')}">◀</button><div class="chips" id="create-people">${names.map((n, j) => `<button data-j="${j}" class="${j === who ? 'on' : ''}">${/^Female/.test(folk.cast[j].name) ? '👩' : '👨'} ${esc(n)}</button>`).join('')}</div><button id="create-next" title="${t('ui.create.next')}">▶</button></div>
      <h3>${t('ui.create.name')}</h3>
      <input id="create-name" maxlength="14" value="${esc(name)}" autocomplete="off">
      <p class="note warn">${bad ? t(bad, { name: esc(name.trim()) }) : ''}</p>
      <div id="create-look"></div>
      <h3>${t('ui.create.year')}</h3>
      <div class="levels">${years.map((y) => `<button data-year="${y}" class="${y === chosenYear ? 'on' : ''}">${y}</button>`).join('')}</div>
      <p class="note">${t('ui.create.yearHint')}</p>
      <div class="actions"><button id="create-random">🎲 ${t('ui.create.random')}</button><button id="create-go" class="go" ${bad ? 'disabled' : ''}>🏠 ${t('ui.create.go', { name: esc(name.trim() || '…') })}</button></div>
      <p class="note" id="create-loading"></p>`;
    controls_ = lookControls($('create-look'), { folk, t, who, look, names, body: true, onChange: dressed });
    controls_.fabrics(fabricsNow);
    const pick = async (j) => {
      looks.set(who, look);
      who = (j + names.length) % names.length;
      name = names[who];
      look = looks.get(who) ?? blankLook();
      await show(who);
      render();
    };
    for (const b of root.querySelectorAll('#create-people button')) b.onclick = () => pick(Number(b.dataset.j));
    $('create-prev').onclick = () => pick(who - 1);
    $('create-next').onclick = () => pick(who + 1);
    $('create-name').oninput = (e) => {
      name = e.target.value;
      const at = e.target.selectionStart;
      render();
      $('create-name').focus();
      $('create-name').setSelectionRange(at, at);
    };
    for (const b of root.querySelectorAll('[data-year]')) b.onclick = () => ((chosenYear = b.dataset.year), render());
    $('create-random').onclick = async () => {
      status(t('ui.look.loading'));
      look = await randomLook(folk, who);
      looks.set(who, look);
      render();
      await dressed();
      status('');
    };
  }

  return new Promise((resolve) => {
    let running = true;
    const timer = new THREE.Timer();
    const loop = (now) => {
      if (!running) return;
      requestAnimationFrame(loop);
      timer.update(now);
      const dt = Math.min(timer.getDelta(), 0.1);
      mixer?.update(dt);
      face?.update(dt);
      controls.update();
      renderer.render(scene, camera);
    };
    addEventListener('resize', frame);
    root.hidden = false;
    document.body.classList.add('creating');
    show(who).then(() => {
      render();
      requestAnimationFrame(loop);
    });
    root.addEventListener('click', (e) => {
      if (e.target.id !== 'create-go' || e.target.disabled || !shown) return;
      running = false;
      removeEventListener('resize', frame);
      root.hidden = true;
      document.body.classList.remove('creating');
      scene.remove(stage);
      shown.outer.removeFromParent();
      scene.background = was.background;
      Object.assign(controls, { minDistance: was.min, maxDistance: was.max, maxPolarAngle: was.polar });
      controls.target.copy(was.target);
      camera.position.copy(was.camera);
      resolve({ who, name: name.trim(), look, year: chosenYear, body: shown });
    });
    // For tests: the screen's state, and a way to set the name without typing.
    window.__create = { get who() { return who; }, get look() { return look; }, get name() { return name; }, setName: (n) => ((name = n), render()), pick: (j) => root.querySelector(`#create-people [data-j="${j}"]`)?.click(), get shown() { return shown; } };
  });
}
