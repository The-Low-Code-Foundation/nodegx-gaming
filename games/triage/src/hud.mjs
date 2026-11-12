// The HUD: health, the infection clock, the weapon and its ammo, the trapped and the saved, the crosshair, prompts and
// toasts; the title screen; the end-of-floor screen with the skills. Plain DOM over the game's state.
import { SKILLS } from './weapons.mjs';

const $ = (sel) => document.querySelector(sel);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

export class HUD {
  constructor(world) {
    this.world = world;
    this.root = $('#hud');
    this.root.innerHTML = `
      <div id="vitals">
        <div class="bar" id="hp"><div class="fill"></div><span class="label">HEALTH</span></div>
        <div id="infection" hidden><span class="tag">INFECTED</span> <span id="turn"></span> <span id="bleed" hidden>· bleeding</span></div>
      </div>
      <div id="people"><div id="counts"></div><div id="alarms"></div></div>
      <div id="weapon"><div id="wname"></div><div id="ammo"></div><div id="slots"></div></div>
      <div id="cross"><div class="dot"></div><i class="t u"></i><i class="t d"></i><i class="t l"></i><i class="t r"></i><div id="hitmark"><i></i><i></i><i></i><i></i></div></div>
      <div id="areload" hidden><div class="zone"></div><div class="cur"></div><span class="say"></span></div>
      <div id="sandbox" hidden></div>
      <div id="tune" hidden></div>
      <div id="prompt"></div>
      <div id="hint"></div>
      <div id="toasts"></div>
      <div id="radar"></div>
      <div id="under" hidden></div>
      <div id="fear"></div>
      <div id="flash"></div>
      <div id="breath" hidden><i></i><span>breath</span></div>
      <div id="vignette"></div>`;
    this.flashA = 0;
    this.flashFresh = false;
    this.kickLeft = 0;
    this.hintTimer = 0;
    this.markLeft = 0;
    this.gap = 8;
  }

  // Round 3: a hit marker on the crosshair (white: a hit; red and bigger: a kill).
  hitmark(kind) {
    const el = $('#hitmark');
    el.className = kind === 'kill' ? 'on kill' : 'on';
    this.markLeft = kind === 'kill' ? 0.3 : 0.14;
  }
  // Round 4: the shot's flash over the whole screen, hottest where the muzzle is (x, y in % of the screen).
  flash(x, y, a) {
    const el = $('#flash');
    el.style.background = `radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, rgba(255,240,210,0.95) 0, rgba(255,190,110,0.55) 12%, rgba(255,150,60,0.18) 34%, rgba(255,140,50,0.05) 60%, transparent 85%)`;
    this.flashA = Math.max(this.flashA, a);
    this.flashFresh = true;
    el.style.opacity = this.flashA.toFixed(3);
  }

  // The active reload bar: the sweet spot lit, a cursor running along it.
  reloadStart(r) {
    const el = $('#areload');
    if (!r?.def?.active) return;
    const [a, b] = r.def.active;
    el.hidden = false;
    el.className = '';
    el.querySelector('.zone').style.cssText = `left:${a * 100}%;width:${(b - a) * 100}%`;
    el.querySelector('.say').textContent = '';
  }
  activeReload(ok) {
    const el = $('#areload');
    el.className = ok ? 'ok' : 'bad';
    el.querySelector('.say').textContent = ok ? 'PERFECT' : 'FUMBLED';
  }
  reloadEnd() {
    const el = $('#areload');
    setTimeout(() => (el.hidden = true), el.className ? 350 : 0);
  }

  toast(text, kind = '', ms = 3200) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('#toasts').prepend(el);
    setTimeout(() => el.classList.add('out'), ms - 400);
    setTimeout(() => el.remove(), ms);
  }
  hint(text) {
    $('#hint').textContent = text;
    this.hintTimer = 1.8;
  }
  kick() {
    this.kickLeft = 0.08;
  }
  alarm(room) {
    this.toast(`Room ${room.index}: something is at the door`, 'bad');
  }

  update(dt) {
    const p = this.world.player;
    if (!p) return;
    $('#hp .fill').style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    $('#hp').classList.toggle('low', p.hp < 30);
    $('#infection').hidden = !p.infected;
    if (p.infected) {
      $('#turn').textContent = `turns in ${fmt(p.turnIn)}`;
      $('#infection').classList.toggle('urgent', p.turnIn < 45);
    }
    $('#bleed').hidden = !p.bleeding;
    const w = p.weapon;
    $('#wname').textContent = w.def.name;
    $('#ammo').textContent = w.def.melee ? (w.def === p.weapons.knife.def ? 'always on you' : 'melee') : `${w.mag} / ${w.reserve}`;
    $('#slots').innerHTML = [['1', 'pistol'], ['2', 'long'], ['3', 'melee']].map(([k, s]) => `<span class="${p.current === s ? 'on' : ''} ${p.weapons[s] ? '' : 'empty'}">${k} ${p.weapons[s]?.def.name ?? '—'}</span>`).join('') + `<span class="${p.current === 'knife' ? 'on' : ''}">4 Knife</span>`;
    this.updateSandbox(dt);
    const sv = this.world.survivors;
    $('#counts').innerHTML = `<b>${sv.trapped}</b> trapped · <b class="good">${sv.counts.saved}</b> out · <b class="bad">${sv.counts.lost}</b> lost`;
    $('#alarms').innerHTML = this.world.grid.rooms.filter((r) => r.banging > 0 && !r.open && !r.lost).map((r) => `<div class="alarm">⚠ Room ${r.index}: door ${Math.ceil((r.doorHp / 28) * 100)}%</div>`).join('');
    const cross = $('#cross');
    cross.classList.toggle('aim', p.aiming);
    cross.classList.toggle('melee', !p.gunOut);
    // The ticks sit where the spread is (in pixels at this field of view), opened by each shot's kick.
    const cam = this.world.camera;
    const px = innerHeight / (2 * Math.tan(((cam?.fov ?? 60) * Math.PI) / 360));
    const want = 5 + (p.spreadNow ?? 0) * px * 1.6 + Math.max(0, this.kickLeft) * 90;
    this.gap += (want - this.gap) * Math.min(1, dt * 18);
    cross.style.setProperty('--gap', `${this.gap.toFixed(1)}px`);
    this.kickLeft -= dt;
    this.markLeft -= dt;
    if (this.markLeft <= 0) $('#hitmark').className = '';
    const rl = p.rig?.reload;
    if (rl?.def.active) $('#areload .cur').style.left = `${Math.min(100, rl.t * 100)}%`;
    cross.style.display = p.alive ? '' : 'none';
    $('#prompt').textContent = p.prompt ?? '';
    this.hintTimer -= dt;
    if (this.hintTimer <= 0) $('#hint').textContent = '';
    // The flash: drawn in at least one frame, gone in a few hundredths of a second.
    if (this.flashFresh) this.flashFresh = false;
    else if (this.flashA > 0) {
      this.flashA *= Math.exp(-dt * 30);
      if (this.flashA < 0.01) this.flashA = 0;
      $('#flash').style.opacity = this.flashA.toFixed(3);
    }
    // Fear: the edges close in and throb with her heart; hidden, the dark under the desk round the view.
    const F = this.world.fear;
    if (F) {
      const fe = $('#fear');
      const k = F.level;
      fe.style.opacity = Math.min(1, k * 0.75 + F.pulse * k * 0.45 + (p.hidden ? 0.15 : 0)).toFixed(3);
      fe.style.transform = `scale(${(1.12 - k * 0.1 - F.pulse * k * 0.035).toFixed(4)})`;
    }
    $('#under').hidden = !(p.hidden && p.hidden.t > 0.7);
    if (p.hidden) $('#under').className = p.hidden.kind;
    $('#breath').hidden = !p.hidden;
    if (p.hidden) {
      $('#breath i').style.width = `${(p.breath * 100).toFixed(0)}%`;
      $('#breath').classList.toggle('held', p.breathHeld);
      $('#breath').classList.toggle('low', p.breath < 0.3);
    }
    const v = $('#vignette');
    v.style.opacity = Math.min(1, p.hurtFlash * 0.9 + (p.hp < 30 ? 0.25 + Math.sin(performance.now() / 300) * 0.1 : 0) + (p.infected && p.turnIn < 45 ? 0.2 : 0));
  }

  // ---- the sandbox (round 3) --------------------------------------------------------------------------------------
  sandboxTitle(onStart) {
    const el = $('#screen');
    el.hidden = false;
    el.innerHTML = `
      <div class="card">
        <h1>SANDBOX</h1>
        <p class="lede">One room. They keep coming through the doors at the top. They can't hurt you here: practise getting into cover and shooting.</p>
        <div class="cols">
          <div><h3>Shoot</h3><p><b>Right mouse</b> aim · <b>Left</b> fire · <b>R</b> reload, <b>R again</b> in the white band for a perfect reload · <b>1</b> pistol · <b>2</b> long gun, <b>2 again</b> to change it</p></div>
          <div><h3>Cover</h3><p><b>Q</b> against a wall, a pillar, a counter · <b>A D</b> slide along it · at its end, <b>aim</b> to lean out or pop up · <b>Shift</b> run (low and fast)</p></div>
          <div><h3>The infected</h3><p><b>Z</b> one · <b>X</b> five · <b>K</b> clear · <b>B</b> stop / start them coming · <b>N</b> charge / walk / stand still</p></div>
          <div><h3>Hide</h3><p>Break their line of sight and <b>E</b> at a desk or a bed to get under it · <b>right mouse</b> hold your breath · they search where they lost you, then give up and wander off · <b>E</b> to come out</p></div>
          <div><h3>Tune</h3><p><b>\`</b> the numbers: shake, kick, recoil, zoom, camera, hit-stop, gore</p></div>
        </div>
        <button id="start">Click to start</button>
      </div>`;
    $('#start').onclick = () => {
      el.hidden = true;
      onStart();
    };
  }
  sandboxPanel() {
    $('#sandbox').hidden = false;
    this.sbLeft = 0;
  }
  updateSandbox(dt) {
    const S = this.world.sandbox;
    if (!S) return;
    this.sbLeft -= dt;
    if (this.sbLeft > 0) return;
    this.sbLeft = 0.25;
    const sc = this.world.score;
    const hits = sc.hits ?? 0;
    const alive = this.world.zombies.filter((z) => z.alive).length;
    $('#sandbox').innerHTML = `
      <div class="stats"><span><b>${sc.headshots}</b> headshots</span><span><b>${sc.shots ? Math.round((hits / sc.shots) * 100) : 0}%</b> hits</span><span><b>${sc.bites ?? 0}</b> bites taken</span><span><b>${alive}</b> up · ${S.mode}${S.auto ? '' : ' · paused'}</span>${this.world.player.hidden ? '<span class="hid">hidden</span>' : ''}</div>
      <div class="keys"><kbd>Z</kbd>one <kbd>X</kbd>five <kbd>K</kbd>clear <kbd>B</kbd>${S.auto ? 'stop' : 'start'} <kbd>N</kbd>mode <kbd>2</kbd>long gun <kbd>\`</kbd>tune</div>`;
  }
  // The numbers, live. Returns whether the panel is now open.
  tunePanel(tune, defaults, save) {
    const el = $('#tune');
    if (!el.hidden) {
      el.hidden = true;
      return false;
    }
    const rows = [
      ['shake', 'Screen shake', 0, 2.5, 0.05], ['kick', 'View kick', 0, 2.5, 0.05], ['recoil', 'Gun recoil', 0, 2.5, 0.05], ['fovPunch', 'Zoom punch', 0, 3, 0.05],
      ['fovHip', 'View (deg)', 50, 90, 1], ['fovAim', 'Aimed view (deg)', 25, 70, 1], ['hipDist', 'Camera back', 1.4, 3.6, 0.05], ['aimDist', 'Aimed back', 0.6, 2.4, 0.05],
      ['hipSide', 'Over shoulder', 0.2, 1.1, 0.02], ['aimSide', 'Aimed shoulder', 0.2, 1.1, 0.02],
      ['flash', 'Muzzle flash', 0, 2, 0.05], ['deafen', 'Deafening', 0, 2, 0.05]
    ];
    const render = () => {
      el.innerHTML = `<h3>Feel</h3>${rows.map(([k, label, a, b, st]) => `<label><span>${label}</span><input type="range" data-k="${k}" min="${a}" max="${b}" step="${st}" value="${tune[k]}"><output>${tune[k]}</output></label>`).join('')}
        <label><span>Hit-stop</span><input type="checkbox" data-k="hitstop" ${tune.hitstop ? 'checked' : ''}><span></span></label>
        <label><span>Gore</span><input type="checkbox" data-k="gore" ${tune.gore ? 'checked' : ''}><span></span></label>
        <button id="tune-reset" class="ghost">Defaults</button><button id="tune-copy" class="ghost">Copy the numbers</button>
        <p class="small">\` or a click on the game to close</p>`;
      for (const inp of el.querySelectorAll('input')) {
        inp.oninput = () => {
          const k = inp.dataset.k;
          tune[k] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
          if (inp.nextElementSibling?.tagName === 'OUTPUT') inp.nextElementSibling.textContent = tune[k];
          save();
        };
      }
      $('#tune-reset').onclick = () => {
        Object.assign(tune, defaults);
        save();
        render();
      };
      $('#tune-copy').onclick = () => {
        const text = JSON.stringify(tune);
        navigator.clipboard?.writeText(text).catch(() => {});
        console.log('triage.tune', text);
        this.toast('Copied: paste them to Claude');
      };
    };
    render();
    el.hidden = false;
    return true;
  }

  // The title: who you are, what happened, how to play.
  title(onStart) {
    const el = $('#screen');
    el.hidden = false;
    el.innerHTML = `
      <div class="card">
        <h1>TRIAGE</h1>
        <p class="lede">Northgate General Hospital, 03:10. Something got loose on the wards an hour ago. You were here off duty, with your sidearm.
        People are still hiding in the rooms. Get them out. Get yourself out if you can.</p>
        <div class="cols">
          <div><h3>Move</h3><p><b>W A S D</b> walk · <b>Shift</b> sprint · <b>C</b> crouch · <b>T</b> torch · <b>V</b> swap shoulder</p></div>
          <div><h3>Cover</h3><p><b>Q</b> against any wall, counter, bed or trolley · slide along it · at a corner or a doorway you look round it; <b>aim</b> to lean out</p></div>
          <div><h3>Fight</h3><p><b>Right mouse</b> aim · <b>Left mouse</b> fire · <b>R</b> reload · <b>F</b> knife or swing (aim for the head) · <b>1 2 3 4</b> weapons</p></div>
          <div><h3>Save</h3><p><b>E</b> open a door, take a thing, or knife one from behind while crouched</p></div>
          <div><h3>See</h3><p><b>M</b> the whole floor on the radar · the yellow rooms still have people in them</p></div>
          <div><h3>Pause</h3><p><b>Esc</b> or <b>P</b>: settings (look up/down, sensitivity, volume)</p></div>
        </div>
        <p class="small">Only the head kills one: a bullet, the knife, the bat. Legs slow it; both legs and it crawls after you, still biting.
        Swing doors and curtains hide you, and hide them. A gunshot carries. Sneaking past is cheaper than shooting through.
        A bite infects you, and the clock starts.</p>
        <button id="start">Click to start</button>
      </div>`;
    $('#start').onclick = () => {
      el.hidden = true;
      onStart();
    };
  }

  // Paused: carry on, the settings, start the floor again.
  pause(settings, { resume, change, restart }) {
    const el = $('#screen');
    el.hidden = false;
    el.innerHTML = `
      <div class="card">
        <h1>PAUSED</h1>
        <div class="settings">
          <label><span>Invert look up/down</span><input type="checkbox" id="s-invert" ${settings.invertY ? 'checked' : ''}></label>
          <label><span>Mouse sensitivity</span><input type="range" id="s-sens" min="0.3" max="2.5" step="0.05" value="${settings.sensitivity}"><output id="o-sens">${settings.sensitivity.toFixed(2)}</output></label>
          <label><span>Volume</span><input type="range" id="s-vol" min="0" max="1" step="0.05" value="${settings.volume}"><output id="o-vol">${Math.round(settings.volume * 100)}%</output></label>
          <label><span>Radar</span><input type="checkbox" id="s-radar" ${settings.radar ? 'checked' : ''}></label>
        </div>
        <p class="small">W A S D move · Shift sprint · C crouch · Q cover (lean out: aim at a corner) · V shoulder · right mouse aim · left fire · R reload · F knife/swing · E use · T torch · M map</p>
        <button id="resume">Resume</button> <button id="restart" class="ghost">Start the floor again</button>
      </div>`;
    $('#s-invert').onchange = (e) => change('invertY', e.target.checked);
    $('#s-radar').onchange = (e) => change('radar', e.target.checked);
    $('#s-sens').oninput = (e) => {
      change('sensitivity', Number(e.target.value));
      $('#o-sens').textContent = Number(e.target.value).toFixed(2);
    };
    $('#s-vol').oninput = (e) => {
      change('volume', Number(e.target.value));
      $('#o-vol').textContent = `${Math.round(e.target.value * 100)}%`;
    };
    $('#resume').onclick = () => {
      el.hidden = true;
      resume();
    };
    $('#restart').onclick = restart;
  }

  // The end of the floor: what happened, the points, the skills.
  end(result, score, skills, points, onNext) {
    const el = $('#screen');
    el.hidden = false;
    const sv = this.world.survivors;
    const won = result === 'out';
    const title = { out: 'OUT', killed: 'KILLED', bled: 'BLED OUT', turned: 'TURNED' }[result];
    const sub = {
      out: this.world.player.infected ? `You made it to the stairs, infected. ${fmt(this.world.player.turnIn)} left on the clock.` : 'Out, and never bitten. Nobody will believe you.',
      killed: 'They got you in the corridor.',
      bled: 'You bled out. The medkits were on the ward.',
      turned: 'The clock ran out. You are one of them now.'
    }[result];
    let left = points;
    const render = () => {
      el.innerHTML = `
        <div class="card">
          <h1 class="${won ? 'good' : 'bad'}">${title}</h1>
          <p class="lede">${sub}</p>
          <div class="stats">
            <div><b>${sv.counts.saved}</b> / ${sv.total} saved</div><div><b>${sv.counts.lost}</b> lost</div>
            <div><b>${this.world.player.bites}</b> bites</div><div><b>${score.headshots}</b> headshots</div>
            <div><b>${score.stealthKills}</b> knife kills</div><div><b>${score.shots}</b> shots</div>
          </div>
          <h3>Skills · <span id="pts">${left}</span> point${left === 1 ? '' : 's'} to spend</h3>
          <div class="skills">${Object.entries(SKILLS).map(([k, s]) => `<div class="skill"><div><b>${s.name}</b> <span class="lvl">${'●'.repeat(Math.round(skills[k] / s.step))}</span><br><small>${s.what}</small></div><button data-k="${k}" ${left ? '' : 'disabled'}>+</button></div>`).join('')}</div>
          <button id="next">${won ? 'Next floor' : 'Try the floor again'}</button>
        </div>`;
      for (const b of el.querySelectorAll('button[data-k]'))
        b.onclick = () => {
          skills[b.dataset.k] += SKILLS[b.dataset.k].step;
          left--;
          render();
        };
      $('#next').onclick = () => onNext(skills);
    };
    render();
  }
}
