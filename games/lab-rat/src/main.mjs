// Lab Rat: the world. The loop, noise and hearing, hits, explosions, doors, pickups, the scripted beats, checkpoints.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Level, S, ROOMS, PICKUPS, CANISTERS, NEST, VENTS, START, AT, OKAFOR, SWEEP, SONG_EVERY, wallPos } from './map.mjs';
import { makeTextures } from './textures.mjs';
import { buildLevel, LightRig, makeCrystal } from './build.mjs';
import { Audio } from './audio.mjs';
import { FX } from './fx.mjs';
import { Player, makeWrench, makeSMG } from './player.mjs';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Skitter, Tender, Bulwark, Canister } from './creatures.mjs';
import { loadCreatureModels } from './creature-models.mjs';
import { Okafor, Soldier } from './humans.mjs';
import { HUD, NOTES } from './hud.mjs';

const params = new URLSearchParams(location.search);
const FOG = {
  lab: [0x0c0707, 0.045], corr: [0x060608, 0.05], sec: [0x090806, 0.045], corrB: [0x05080a, 0.05], door: null,
  garden: [0x03100e, 0.038], bay: [0x0c0906, 0.028], lift: [0x08080a, 0.04]
};
const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem('labrat.' + k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('labrat.' + k, JSON.stringify(v));
    } catch {}
  }
};

class World {
  constructor() {
    this.god = params.has('god');
    this.nolock = params.has('nolock');
    this.time = 0;
    this.state = 'title';
    this.flags = {};
    this.notes = new Set();
    this.stats = { kills: { skitter: 0, tender: 0, bulwark: 0 }, sweep: { player: 0, fold: 0, blast: 0, sweep: 0 }, start: 0 };
    this.groundShards = [];
    this.songT = 22;
    this.singing = false;
    this.crystalPulse = 1;
    this.spawnSeq = 0;
    this.shakeAmt = 0;
    this.timers = [];
    this.creatures = [];
    this.tenders = [];
    this.canisters = [];
    this.thrown = [];
    this.settings = { sens: store.get('sens', 1), invert: store.get('invert', false), vol: store.get('vol', 0.8) };
    this.input = { f: 0, b: 0, l: 0, r: 0, sprint: false, jump: false, fire: false, mdx: 0, mdy: 0 };

    // renderer, scenes, cameras
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.setSize(innerWidth, innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.2;
    document.getElementById('view').appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x060608, 0.05);
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 220);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 5);
    this.vmHemi = new THREE.HemisphereLight(0xdde6f0, 0x2a2420, 1.2);
    this.vmScene.add(this.vmHemi);
    this.vmSun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.vmSun.position.set(0.3, 1, 0.4);
    this.vmScene.add(this.vmSun);
    // a soft reflection map for the gun and hands only: metal needs something to reflect, and the world scene has none
    const pm = new THREE.PMREMGenerator(r);
    this.vmScene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.vmScene.environmentIntensity = 0.3;
    this.vmFlash = new THREE.PointLight(0xffb060, 0, 2, 2);
    this.vmFlash.position.set(0.15, -0.1, -0.6);
    this.vmScene.add(this.vmFlash);
    this.localLight = 0.3;
    this.bloomOn = !params.has('nobloom');
    if (this.bloomOn) {
      const rt = new THREE.WebGLRenderTarget(innerWidth * r.getPixelRatio(), innerHeight * r.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(r, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.3, 0.3, 1.6);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      // the grade, after tone mapping: film grain, a vignette, a touch of lens fringing at the edges, crushed blacks
      // lifted a hair so the dark reads as dark rather than as missing pixels
      this.grade = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, time: { value: 0 }, hurt: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float hurt; varying vec2 vUv;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          void main(){
            vec2 c = vUv - 0.5; float r2 = dot(c, c);
            vec2 off = c * (0.004 + hurt * 0.01) * r2 * 4.0;
            vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
            col = col * 0.97 + 0.012;
            col *= 1.0 - smoothstep(0.12, 0.62, r2) * 0.55;
            float g = hash(vUv * 1000.0 + fract(time * 7.13) * 100.0) - 0.5;
            col += g * 0.045 * (1.0 - dot(col, vec3(0.33)) * 0.6);
            gl_FragColor = vec4(col, 1.0);
          }`
      });
      this.composer.addPass(this.grade);
    }
    addEventListener('resize', () => this.resize());

    // the world
    this.T = makeTextures(r);
    this.level = new Level();
    this.lights = new LightRig(this.scene, 10, 3);
    this.scene.add(new THREE.HemisphereLight(0x8090a8, 0x1a1410, 0.5));
    this.built = buildLevel(this.level, this.T, this.scene, this.lights);
    this.audio = new Audio();
    this.audio.volume = this.settings.vol;
    this.fx = new FX(this.scene, this.T, this.lights);
    this.hud = new HUD(this);
    this.player = new Player(this);
    this.torch = new THREE.SpotLight(0xfff0dc, 0, 26, 0.44, 0.6, 1.5);
    this.torch.position.set(0.12, -0.12, 0);
    this.camera.add(this.torch);
    this.torch.target.position.set(0, -0.05, -1);
    this.camera.add(this.torch.target);
    this.muzzle = new THREE.PointLight(0xffb060, 0, 8, 2);
    this.scene.add(this.muzzle);
    this.spores();

    // things in the world
    this.pickups = PICKUPS.map((def) => this.makePickup(def));
    for (const [x, z] of CANISTERS) this.canisters.push(new Canister(this, x, z));
    for (const h of NEST.homes) {
      const s = new Skitter(this, h[0], h[1], { leash: 2.2 });
      s.nest = true;
      this.creatures.push(s);
    }
    const tender = new Tender(this, this.built.crystals);
    this.tenders.push(tender);
    this.creatures.push(tender);
    this.bulwark = new Bulwark(this, 99, 39.5, Math.PI);
    this.creatures.push(this.bulwark);
    this.okafor = new Okafor(this, OKAFOR.p[0], OKAFOR.p[1], OKAFOR.yaw);
    this.creatures.push(this.okafor);
    this.usableState = { vending: 5 };
    this.setGroup('bay', 0.45);
    this.setGroup('lift', 0);

    // start where the URL says
    const at = AT[params.get('at')];
    const start = at ?? START;
    this.player.pos.set(start.p[0], 0, start.p[1]);
    this.player.yaw = start.yaw;
    if (at) {
      Object.assign(this.flags, at.flags, { intro: 1 });
      this.player.give(at.give);
      for (const p of this.pickups) if (['wrench', 'smg', 'ammo-sec1', 'ammo-sec2'].includes(p.def.id) || (params.get('at') === 'bay' && p.def.id.endsWith('-h'))) this.take(p);
      this.popCorridor(true);
      if (this.flags.gateOpen) this.openGate(true);
      // she has already met you and come along
      const O = this.okafor;
      O.said.add('greet').add('join').add('vent');
      O.pos.set(start.p[0] + 1.2, 0, start.p[1] + 1.5);
      O.setState('follow');
      O.lastMode = 'follow';
      O.crouched = false;
    }
    this.checkpoint(at ? ROOM[params.get('at') === 'bay' ? 'bay' : 'garden'].name : 'Lab 3', true);
    this.input.binds = true;
    this.bindInput();
    this.hud.health();
    this.hud.ammo();
    this.titleScreen();
    this.last = performance.now();
    this.fps = 60;
    const loop = () => {
      requestAnimationFrame(loop);
      this.tick();
    };
    loop();
    window.__lab = this;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.camera.aspect = this.vmCam.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCam.updateProjectionMatrix();
  }

  // ---------- input ----------
  bindInput() {
    const I = this.input;
    const canvas = this.renderer.domElement;
    const key = (e, down) => {
      if (e.code === 'Tab') e.preventDefault();
      if (this.state === 'reading') {
        if (down && (e.code === 'KeyE' || e.code === 'Escape')) this.closeTerminal();
        return;
      }
      if (this.state === 'notes') {
        if (down && (e.code === 'Tab' || e.code === 'Escape')) this.toggleNotes();
        return;
      }
      if (this.state === 'end' && down && e.code === 'KeyR') location.reload();
      if (this.state !== 'play') return;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': I.f = down ? 1 : 0; break;
        case 'KeyS': case 'ArrowDown': I.b = down ? 1 : 0; break;
        case 'KeyA': case 'ArrowLeft': I.l = down ? 1 : 0; break;
        case 'KeyD': case 'ArrowRight': I.r = down ? 1 : 0; break;
        case 'ShiftLeft': case 'ShiftRight': I.sprint = down; break;
        case 'Space': if (down) I.jump = true; break;
      }
      if (!down || e.repeat) return;
      const P = this.player;
      switch (e.code) {
        case 'KeyC': case 'ControlLeft': P.crouch = !P.crouch; break;
        case 'KeyR': P.reload(); break;
        case 'KeyE': this.use(); break;
        case 'KeyG': P.throwCan(); break;
        case 'KeyF': this.toggleTorch(); break;
        case 'Digit1': P.equip('wrench'); break;
        case 'Digit2': P.equip('smg'); break;
        case 'Digit3': P.equip('shard'); break;
        case 'Tab': this.toggleNotes(); break;
        case 'KeyP': if (this.nolock) this.pause(); break;
      }
    };
    addEventListener('keydown', (e) => key(e, true));
    addEventListener('keyup', (e) => key(e, false));
    addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX / innerWidth;
      if (this.state !== 'play') return;
      // captured: the usual. Not captured (a window that refuses pointer lock): look follows the mouse anyway
      if (!document.pointerLockElement && !this.freeLook) return;
      const s = 0.0022 * this.settings.sens;
      this.player.yaw -= e.movementX * s;
      this.player.pitch -= e.movementY * s * (this.settings.invert ? -1 : 1);
      this.player.pitch = Math.max(-1.5, Math.min(1.5, this.player.pitch));
      I.mdx += e.movementX;
      I.mdy += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (this.state === 'play' && e.button === 0) I.fire = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) I.fire = false;
    });
    addEventListener('wheel', (e) => {
      if (this.state !== 'play') return;
      const P = this.player;
      const list = ['wrench', 'smg', 'shard'].filter((n) => P.has[n]);
      if (list.length < 2) return;
      P.equip(list[(list.indexOf(P.weapon) + 1) % list.length]);
    });
    const screen = document.getElementById('screen');
    screen.addEventListener('click', (e) => {
      if (e.target.closest('input,label,button')) return;
      if (this.state === 'title') this.begin();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'deadscreen') this.respawn();
    });
    canvas.addEventListener('click', () => {
      if (this.state === 'play' && !document.pointerLockElement && !this.nolock) this.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) {
        this.hadLock = true;
        this.freeLook = false;
        this.renderer.domElement.style.cursor = '';
      } else if (this.hadLock && this.state === 'play' && !this.nolock) this.pause();
    });
    document.addEventListener('pointerlockerror', () => this.lockFailed());
    addEventListener('keydown', (e) => {
      // without the lock, Esc never reaches pointerlockchange: pause here instead
      if (e.code === 'Escape' && this.state === 'play' && !document.pointerLockElement && !this.nolock) this.pause();
    });
    document.documentElement.addEventListener('mouseleave', () => (this.mouseX = null));
    addEventListener('blur', () => {
      this.mouseX = null;
      Object.assign(I, { f: 0, b: 0, l: 0, r: 0, sprint: false, fire: false });
    });
  }
  /**
   * Capture the mouse. The plain request only: a second request from a rejected promise has lost the click's user
   * gesture and always fails. Some windows (an embedded browser pane) refuse the lock outright; then look follows the
   * mouse uncaptured, and holding it near the left or right edge keeps turning.
   */
  lock() {
    if (this.nolock) return;
    try {
      const p = this.renderer.domElement.requestPointerLock();
      p?.catch?.(() => this.lockFailed());
    } catch {
      this.lockFailed();
    }
  }
  lockFailed() {
    if (this.freeLook || this.state !== 'play') return;
    this.freeLook = true;
    this.renderer.domElement.style.cursor = 'crosshair';
    if (!this.flags.freeLookHint) {
      this.flags.freeLookHint = 1;
      this.hud.toast('This window won\'t capture the mouse, so look follows it uncaptured: hold it near an edge to keep turning. In Chrome or Safari it captures properly.');
    }
  }
  edgeTurn(dt) {
    if (!this.freeLook || document.pointerLockElement || this.mouseX == null) return;
    const x = this.mouseX, m = 0.12;
    const k = x < m ? -(m - x) / m : x > 1 - m ? (x - (1 - m)) / m : 0;
    this.player.yaw -= k * 2.6 * this.settings.sens * dt;
  }

  // ---------- screens ----------
  titleScreen() {
    this.hud.screen(
      `<div class="title">
        <h1>LAB RAT</h1>
        <p class="tag">Kestrel Deep Research Annex · Sublevel C · 02:47</p>
        <p class="lede">You analyse materials on the night shift. Something came through from the Fold. Get to the east freight lift.</p>
        <div class="keys">
          <span><b>WASD</b> move</span><span><b>Mouse</b> look</span><span><b>Shift</b> sprint (loud)</span><span><b>C</b> crouch (quiet)</span>
          <span><b>LMB</b> swing / fire</span><span><b>R</b> reload</span><span><b>1 2</b> / wheel weapons</span><span><b>E</b> use</span>
          <span><b>G</b> throw a can</span><span><b>F</b> torch</span><span><b>Tab</b> field notes</span><span><b>Esc</b> pause</span>
          <span><b>E</b> on a survivor: wait / follow</span><span><b>3</b> hold a crystal shard</span>
        </div>
        <p class="go">Click to begin</p>
        <p class="small">An ode to a game about a scientist with a crowbar. Headphones help: they hunt by sound.</p>
        <p class="small"><a href="credits.html" target="_blank" style="color:inherit" onclick="event.stopPropagation()">Credits</a>: the creatures are by other artists.</p>
      </div>`,
      'on'
    );
  }
  begin() {
    this.audio.init();
    this.hud.screen('');
    this.hud.show(true);
    this.hud.fade(1, 0);
    setTimeout(() => this.hud.fade(0, 3), 50);
    this.state = 'play';
    this.stats.start = this.time;
    this.lock();
  }
  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.input.fire = false;
    this.audio.suspend(true);
    const s = this.settings;
    this.hud.screen(
      `<div class="title small">
        <h2>Paused</h2>
        <div class="settings">
          <label>Mouse sensitivity <input id="set-sens" type="range" min="0.3" max="2.5" step="0.05" value="${s.sens}"></label>
          <label>Volume <input id="set-vol" type="range" min="0" max="1" step="0.05" value="${s.vol}"></label>
          <label><input id="set-inv" type="checkbox" ${s.invert ? 'checked' : ''}> Invert look up/down</label>
        </div>
        <p class="go">Click to resume</p>
        <p class="small">Field notes ${this.notes.size} / ${NOTES.length} · checkpoint: ${this.cp?.name ?? '—'}</p>
      </div>`,
      'on dim'
    );
    document.getElementById('set-sens').oninput = (e) => store.set('sens', (s.sens = +e.target.value));
    document.getElementById('set-vol').oninput = (e) => {
      store.set('vol', (s.vol = +e.target.value));
      this.audio.setVolume(s.vol);
    };
    document.getElementById('set-inv').onchange = (e) => store.set('invert', (s.invert = e.target.checked));
  }
  resume() {
    this.hud.screen('');
    this.state = 'play';
    this.audio.suspend(false);
    this.lock();
  }
  toggleNotes() {
    if (this.state === 'play') {
      this.state = 'notes';
      this.input.fire = false;
      this.hud.showNotes(true);
    } else if (this.state === 'notes') {
      this.state = 'play';
      this.hud.showNotes(false);
    }
  }
  closeTerminal() {
    this.state = 'play';
    this.hud.showTerminal(false);
  }
  toggleTorch() {
    this.player.torch = !this.player.torch;
    this.audio.play('button', null, 0.4);
  }

  // ---------- scheduling ----------
  later(secs, fn) {
    this.timers.push({ at: this.time + secs, fn });
  }
  runTimers() {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.time) {
        const t = this.timers.splice(i, 1)[0];
        t.fn();
      }
    }
  }

  // ---------- the loop ----------
  /** For scripted tests (a hidden window never fires rAF): run the world `sec` seconds in fixed steps, then draw. */
  advance(sec, dt = 1 / 60) {
    for (let t = 0; t < sec; t += dt) if (this.state === 'play' || this.state === 'dead' || this.state === 'ending') this.step(dt);
    this.render();
    return { t: +this.time.toFixed(2), state: this.state, hp: this.player.hp, pos: this.player.pos.toArray().map((v) => +v.toFixed(2)), room: this.room };
  }
  tick() {
    const now = performance.now();
    // __lab.hold = true freezes the real-time loop, so a frame made by advance() stays on screen for a screenshot
    if (this.hold) {
      this.last = now;
      return;
    }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (dt <= 0) return;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    if (this.state === 'play' || this.state === 'dead' || this.state === 'ending') this.step(dt);
    else if (this.state === 'title') {
      // a slow look around the lab behind the title
      this.player.yaw = START.yaw + Math.sin(performance.now() / 4000) * 0.4;
      this.placeCamera(0);
      this.lights.update(performance.now() / 1000, dt, this.camera.position);
    }
    this.render();
  }
  step(dt) {
    this.time += dt;
    const P = this.player, I = this.input;
    this.edgeTurn(dt);
    P.update(dt, I);
    I.mdx = I.mdy = 0;
    I.jump = false;
    this.updateDoors(dt);
    for (const c of this.creatures) c.update(dt);
    for (const g of this.built.grown ?? []) g.anim?.update(dt);
    this.separate();
    for (const k of this.canisters) k.update(dt);
    this.updateThrown(dt);
    this.updateShards(dt);
    this.updatePickups(dt);
    this.updateUsables();
    this.updateSong(dt);
    this.updateCrystals(dt);
    this.runTimers();
    this.beats(dt);
    this.updateSpores(dt);
    this.fx.update(dt);
    this.hud.update(dt);
    this.placeCamera(dt);
    this.lights.update(this.time, dt, this.camera.position);
    this.updateLocalLight(dt);
    const fwd = P.forward();
    this.audio.setListener(this.camera.position, fwd);
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 400);
    this.vmFlash.intensity = this.muzzle.intensity > 0 ? 3 : 0;
  }
  placeCamera(dt) {
    const P = this.player;
    const e = P.eye();
    const k = Math.min(1, P.moving / 4) * (P.onGround ? 1 : 0);
    const by = Math.sin(P.bob * 2) * 0.03 * k;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.4);
    const s = this.shakeAmt * this.shakeAmt;
    this.camera.position.set(e.x + (Math.random() - 0.5) * s * 0.6, e.y + by + (Math.random() - 0.5) * s * 0.6, e.z + (Math.random() - 0.5) * s * 0.6);
    const roll = P.alive ? Math.sin(P.bob) * 0.006 * k : Math.min(1.2, P.deathT * 2) * 0.6;
    this.camera.rotation.set(P.pitch, P.yaw, roll);
    this.torch.intensity = P.torch && P.alive ? 34 : 0;
  }
  updateLocalLight(dt) {
    // how lit the viewmodel should be: the strongest few lights near the camera, plus the torch
    let sum = this.player.torch ? 0.55 : 0;
    const c = this.camera.position;
    for (const l of this.lights.pool) {
      if (l.intensity <= 0) continue;
      const d2 = l.position.distanceToSquared(c);
      sum += l.intensity / (6 + d2 * 1.4);
    }
    sum = Math.min(1.3, 0.25 + sum * 0.5);
    this.localLight += (sum - this.localLight) * Math.min(1, dt * 4);
    this.vmHemi.intensity = this.localLight * 1.6;
    this.vmScene.environmentIntensity = this.localLight * 0.9;
    this.vmSun.intensity = this.localLight * 1.4;
  }
  render() {
    // a window that opened hidden (zero size) never gets a resize event until it shows
    if (innerWidth !== this.w0 || innerHeight !== this.h0) {
      this.w0 = innerWidth;
      this.h0 = innerHeight;
      this.resize();
    }
    if (this.composer) {
      if (this.grade) {
        this.grade.uniforms.time.value = performance.now() / 1000;
        this.grade.uniforms.hurt.value = this.player.flashT;
      }
      this.composer.render();
    } else this.renderer.render(this.scene, this.camera);
    if (this.state === 'play' || this.state === 'notes' || this.state === 'reading' || this.state === 'paused') {
      const r = this.renderer;
      r.autoClear = false;
      r.clearDepth();
      r.render(this.vmScene, this.vmCam);
      r.autoClear = true;
    }
  }
  shake(a) {
    this.shakeAmt = Math.min(0.9, this.shakeAmt + a);
  }

  // ---------- hearing, light, bodies ----------
  noise(x, z, r, src, actor) {
    const from = new THREE.Vector3(x, 0.8, z);
    if (!actor && src === 'player') actor = this.player;
    for (const c of this.creatures) {
      if (!c.alive || !c.hear || c === actor) continue;
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d > r) continue;
      if (d > r * 0.5 && !this.level.los(from, c.zones()[0].c)) continue; // through walls a sound carries half as far
      c.hear({ x, z, src, actor }, d);
    }
    if (this.bulwark.alive && this.bulwark.state === 'dormant' && (src === 'player' || src === 'soldier') && r > 30) {
      if (Math.hypot(this.bulwark.pos.x - x, this.bulwark.pos.z - z) < r * 0.8 && this.level.roomAt(x, z) === 'bay') this.bulwark.wake();
    }
  }
  /** Everyone alive and on their feet that a creature can go for: you, Okafor, the soldiers. */
  bodies() {
    const out = this.player.alive ? [this.player] : [];
    for (const c of this.creatures) if (c.human && c.alive && c.standing) out.push(c);
    return out;
  }
  /** Can you see this point: in front of you, in range, nothing in the way? (For the field notes.) */
  canSee(p, maxD = 25) {
    const P = this.player;
    if (!P.alive) return false;
    const e = P.eye(), f = P.forward();
    const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, d = Math.hypot(dx, dy, dz);
    if (d > maxD) return false;
    if (d > 1.5 && (dx * f.x + dy * f.y + dz * f.z) / d < 0.35) return false;
    return this.level.los(e, p);
  }
  /** How lit you are, 0..1: the torch gives you away; so does standing under a lamp. */
  playerLit() {
    if (this.player.torch) return 1;
    return Math.max(0, Math.min(1, (this.localLight - 0.32) / 0.7));
  }
  /** A line spoken by the PA, Okafor or the Sweep's radio, with a subtitle. */
  say(text, who = 'pa', bark = false) {
    const label = { pa: 'PA', okafor: 'OKAFOR', sweep: 'RADIO' }[who] ?? who.toUpperCase();
    const dur = who === 'pa' ? this.audio.pa(text) : this.audio.speak(text, who, bark);
    this.hud.subtitle(who === 'pa' ? `PA: “${text}”` : `${label}: ${text}`, dur + 1.2, who);
  }
  /** Where a Skitter takes someone: the nearest crystal that is not inside a Tender's light. */
  dragGoal(p) {
    const lights = this.fearLights();
    let best = null, bd = Infinity;
    for (const c of this.built.crystals) {
      const x = c.def.p[0], z = c.def.p[1];
      if (lights.some((L) => Math.hypot(x - L.x, z - L.z) < L.r + 1)) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < bd) {
        bd = d;
        best = { x: x + 0.9, z: z + 0.9 };
      }
    }
    return best ?? { x: NEST.p[0], z: NEST.p[1] };
  }
  /** What a Tender is drawn to: a shard lying on the floor near it, else a shard in your hand that it can see. */
  shardBait(t) {
    let best = null, bd = 26;
    for (const g of this.groundShards) {
      if (g.flying || (g.claimed && t.planting !== g)) continue;
      const d = t.distTo(g.pos);
      if (d < bd) {
        bd = d;
        best = { x: g.pos.x, z: g.pos.z, ground: g };
      }
    }
    if (best) return best;
    const P = this.player;
    if (P.alive && P.weapon === 'shard' && t.distTo(P.pos) < 18 && this.level.los(P.eye(), t.lanternPos)) return { x: P.pos.x, z: P.pos.z, ground: null };
    return null;
  }
  throwShard(o, v) {
    const mesh = makeCrystal({ p: [0, 0], seed: true }, this.T, null).group;
    mesh.scale.setScalar(0.35);
    mesh.position.copy(o);
    this.scene.add(mesh);
    const g = { mesh, pos: o.clone(), vel: v.clone(), flying: true, claimed: false };
    this.groundShards.push(g);
  }
  updateShards(dt) {
    for (const g of this.groundShards) {
      if (!g.flying) {
        g.mesh.children[0].material.emissiveIntensity = 0.8 + Math.sin(this.time * 2.2) * 0.25;
        continue;
      }
      g.vel.y -= 9.8 * dt;
      const p = { x: g.pos.x, z: g.pos.z };
      if (this.level.moveCircle(p, g.vel.x * dt, g.vel.z * dt, 0.06)) {
        g.vel.x *= -0.3;
        g.vel.z *= -0.3;
      }
      g.pos.x = p.x;
      g.pos.z = p.z;
      g.pos.y += g.vel.y * dt;
      if (g.pos.y <= 0.02) {
        g.pos.y = 0.02;
        g.flying = false;
        this.audio.play('chime', g.pos, 0.8);
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.y += dt * 6;
    }
  }
  /** The Tender plants a shard: a new crystal cluster grows where it lay. */
  growShard(g) {
    this.scene.remove(g.mesh);
    this.groundShards = this.groundShards.filter((x) => x !== g);
    const c = makeCrystal({ p: [g.pos.x, g.pos.z], small: true, planted: true }, this.T, this.scene);
    c.glow = 2.0;
    this.built.crystals.push(c);
    return c;
  }
  /** Every 40.3 s the crystals sing. Everything in the hold stops to listen. */
  updateSong(dt) {
    this.songT -= dt;
    if (!this.singing && this.songT <= 0) {
      this.singing = true;
      this.songT = 4;
      this.audio.play('song', new THREE.Vector3(NEST.p[0], 2, NEST.p[1]), this.room === 'garden' || this.room === 'corrB' ? 1 : 0.35);
      for (const c of this.built.crystals) c.glow = Math.max(c.glow, 1.8);
      this.songSeenAt = null;
    } else if (this.singing) {
      if (this.room === 'garden' && this.songT < 2.5) {
        this.observe('crystal-song');
        const O = this.okafor;
        if (O.following && O.distTo(this.player.pos) < 14) O.line('song', "There! Every forty seconds. That's the Lantern interval, the signal we picked up from the Fold. They're answering it.");
      }
      if (this.songT <= 0) {
        this.singing = false;
        this.songT = SONG_EVERY - 4;
      }
    }
    const target = this.singing ? 1.8 + Math.sin(this.time * 6) * 0.3 : 1;
    this.crystalPulse += (target - this.crystalPulse) * Math.min(1, dt * 3);
  }
  muzzleFlashAt(p, gun) {
    const s = this.lights.add({ pos: p.clone(), color: 0xffb060, i: 18, d: 8, kind: 'fade', life: 0.06 });
    s.maxLife = 0.06;
    if (gun) {
      const dir = new THREE.Vector3(0, 0, 1).transformDirection(gun.matrixWorld);
      this.fx.muzzle(p, dir, 1);
    } else this.fx.flash(p, 0xffc070, 0.5, 0.05);
  }
  fearLights() {
    const out = [];
    for (const t of this.tenders) {
      const f = t.fear;
      if (f) out.push(f);
    }
    return out;
  }
  pushOut(p, r) {
    const push = (cx, cz, cr) => {
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), m = r + cr;
      if (d < m && d > 1e-4) {
        p.x += (dx / d) * (m - d);
        p.z += (dz / d) * (m - d);
      }
    };
    for (const k of this.canisters) if (k.alive) push(k.pos.x, k.pos.z, 0.36);
    for (const c of this.creatures) {
      if (!c.alive || c.kind === 'tender' || (c.kind === 'skitter' && c.y > 0.5)) continue;
      push(c.pos.x, c.pos.z, c.kind === 'bulwark' ? 0.95 : 0.3);
    }
    this.level.resolve(p, r);
  }
  separate() {
    const sk = this.creatures.filter((c) => c.alive && c.kind === 'skitter');
    for (let i = 0; i < sk.length; i++)
      for (let j = i + 1; j < sk.length; j++) {
        const a = sk[i].pos, b = sk[j].pos;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d < 0.7 && d > 1e-4) {
          const m = (0.7 - d) / 2;
          a.x -= (dx / d) * m;
          a.z -= (dz / d) * m;
          b.x += (dx / d) * m;
          b.z += (dz / d) * m;
        }
      }
    for (const c of this.creatures) if (c.alive && c.kind === 'skitter') this.level.resolve(c.pos, c.r);
  }

  // ---------- shooting ----------
  hitscan(o, d, max, ignore) {
    let best = null;
    const g = this.level.ray(o, d, max);
    if (g) best = { t: g.t, kind: 'world', n: g.n, what: g.what };
    const lim = () => (best ? best.t : max);
    for (const c of this.creatures) {
      if (!c.alive || c === ignore || (c.kind === 'okafor' && !c.standing) || (ignore?.kind === 'soldier' && c.kind === 'soldier')) continue;
      const h = c.hitTest(o, d, lim());
      if (h) best = { t: h.t, kind: 'creature', c, zone: h.zone };
    }
    for (const k of this.canisters) {
      if (!k.alive) continue;
      const h = k.hitTest(o, d, lim());
      if (h) best = { t: h.t, kind: 'canister', k };
    }
    if (best) best.p = o.clone().addScaledVector(d, best.t);
    return best;
  }
  bulletHit(hit, dir, dmg, shooter) {
    if (hit.kind === 'world') {
      this.fx.decal(hit.p, hit.n, 'hole', 0.1 + Math.random() * 0.05);
      this.fx.dust(hit.p, hit.n);
      this.fx.sparks(hit.p, hit.n, 4, 3);
      if (Math.random() < 0.12) this.audio.play('ricochet', hit.p, 0.6);
      else this.audio.play('impact', hit.p);
    } else if (hit.kind === 'canister') {
      this.fx.sparks(hit.p, [-dir.x, 0.2, -dir.z], 10, 4);
      this.audio.play('clank', hit.p, 0.7);
      hit.k.hit();
    } else {
      const res = hit.c.damage(dmg, hit.zone, shooter ? shooter.pos : this.player.pos, 'bullet', shooter);
      if (res === 'armor') {
        this.fx.sparks(hit.p, [-dir.x, 0.3, -dir.z], 14, 6);
        this.audio.play('ricochet', hit.p, 0.8);
      } else {
        this.fx.blood(hit.p, this.bloodColor(hit.c, hit.zone), 8, 2.5);
        this.audio.play('splat', hit.p, 0.5);
      }
    }
  }
  bloodColor(c, zone) {
    return c.human ? 0x7a0a0a : c.kind === 'skitter' ? 0xc8d040 : c.kind === 'tender' ? 0x70e8ff : zone === 'sac' ? 0xff8a20 : 0x7a3a18;
  }
  bulwarkZoneFrom(b, eye) {
    const f = b.fwd(), dx = eye.x - b.pos.x, dz = eye.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
    const dot = (dx * f.x + dz * f.z) / d;
    return dot > 0.3 ? 'plates' : dot < -0.3 ? 'sac' : 'body';
  }
  muzzleLight(p) {
    this.muzzle.position.copy(p);
    this.muzzle.intensity = 30;
  }
  explosion(p, r, dmg) {
    this.fx.explosion(p);
    this.audio.play('explode', p);
    const P = this.player;
    const pd = p.distanceTo(P.eye());
    this.shake(Math.max(0, 0.9 * (1 - pd / 26)));
    this.observe('canister');
    for (const c of this.creatures) {
      if (!c.alive) continue;
      const cc = c.zones()[0].c;
      const d = cc.distanceTo(p);
      if (d < r && this.level.los(p, cc)) c.damage(dmg * (1 - d / r), 'blast', p, 'blast');
    }
    if (P.alive && pd < r && this.level.los(p, P.eye())) {
      P.hurt(80 * (1 - pd / r), p);
      const dx = P.pos.x - p.x, dz = P.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
      P.knock((dx / d) * 7, 3, (dz / d) * 7);
    }
    for (const k of this.canisters) {
      if (!k.alive) continue;
      if (k.c.distanceTo(p) < 4.5 && k.c.distanceTo(p) > 0.1) k.fuse = k.fuse < 0 ? 0.15 + Math.random() * 0.25 : Math.min(k.fuse, 0.2);
    }
    this.noise(p.x, p.z, 45, 'boom');
  }

  // ---------- thrown cans ----------
  canMesh() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0xc2271c, metalness: 0.6, roughness: 0.35 }));
    g.add(m);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0335, 0.0335, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.5, roughness: 0.4 }));
    g.add(band);
    return g;
  }
  throwCan(o, v) {
    const mesh = this.canMesh();
    mesh.position.copy(o);
    this.scene.add(mesh);
    this.thrown.push({ mesh, pos: o.clone(), vel: v.clone(), noisy: true, rest: false, age: 0, spin: new THREE.Vector3(8, 3, 5) });
  }
  updateThrown(dt) {
    for (const c of this.thrown) {
      if (c.rest) continue;
      c.age += dt;
      c.vel.y -= 9.8 * dt;
      const before = { x: c.pos.x, z: c.pos.z };
      const want = { x: c.pos.x + c.vel.x * dt, z: c.pos.z + c.vel.z * dt };
      const p = { x: before.x, z: before.z };
      const hitWall = this.level.moveCircle(p, c.vel.x * dt, c.vel.z * dt, 0.05);
      let impact = 0;
      if (hitWall) {
        if (Math.abs(p.x - want.x) > 1e-3) c.vel.x *= -0.45;
        if (Math.abs(p.z - want.z) > 1e-3) c.vel.z *= -0.45;
        impact = Math.hypot(c.vel.x, c.vel.z) + 2;
      }
      c.pos.x = p.x;
      c.pos.z = p.z;
      c.pos.y += c.vel.y * dt;
      const ch = this.level.heightAt(c.pos.x, c.pos.z);
      if (c.pos.y > ch - 0.05) {
        c.pos.y = ch - 0.05;
        c.vel.y = -Math.abs(c.vel.y) * 0.3;
      }
      if (c.pos.y < 0.035) {
        c.pos.y = 0.035;
        impact = Math.max(impact, Math.abs(c.vel.y));
        c.vel.y = Math.abs(c.vel.y) * 0.35;
        c.vel.x *= 0.6;
        c.vel.z *= 0.6;
        if (Math.abs(c.vel.y) < 0.6 && Math.hypot(c.vel.x, c.vel.z) < 0.4) {
          c.rest = true;
          c.mesh.rotation.set(Math.PI / 2, Math.random() * 6, 0);
          this.pickups.push({ def: { id: 'thrown', kind: 'can' }, mesh: c.mesh, taken: false, pos: c.pos.clone(), thrown: true, readyAt: this.time + 0.8 });
        }
      }
      if (impact > 1.5) {
        this.audio.play('can', c.pos, Math.min(1, impact / 6));
        this.noise(c.pos.x, c.pos.z, c.noisy ? 16 : 7, 'can');
        c.noisy = false;
      }
      if (!c.rest) {
        c.mesh.rotation.x += c.spin.x * dt;
        c.mesh.rotation.z += c.spin.z * dt;
      }
      c.mesh.position.copy(c.pos);
    }
    this.thrown = this.thrown.filter((c) => !c.rest);
  }

  // ---------- pickups ----------
  makePickup(def) {
    let mesh;
    if (def.kind === 'wrench') {
      mesh = makeWrench();
      mesh.rotation.set(0, 0.7, Math.PI / 2);
      mesh.position.set(def.p[0], 0.03, def.p[2]);
    } else if (def.kind === 'smg') {
      mesh = makeSMG();
      mesh.rotation.set(0, 1.9, Math.PI / 2);
      mesh.position.set(def.p[0], def.p[1] + 0.03, def.p[2]);
    } else if (def.kind === 'ammo') {
      mesh = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.13, 0.15), new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.7 }));
      b.position.y = 0.065;
      mesh.add(b);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.262, 0.03, 0.152), new THREE.MeshStandardMaterial({ color: 0xd9a514, emissive: 0x332200 }));
      s.position.y = 0.09;
      mesh.add(s);
      mesh.position.set(def.p[0], def.p[1], def.p[2]);
      mesh.rotation.y = Math.random() * 3;
    } else {
      mesh = this.canMesh();
      mesh.rotation.set(Math.PI / 2, Math.random() * 6, 0);
      mesh.position.set(def.p[0], 0.035, def.p[2]);
    }
    this.scene.add(mesh);
    // a faint glint so things on the floor can be found in the dark
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.T.glow, color: 0xfff0c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 }));
    glint.scale.setScalar(0.35);
    glint.position.set(def.p[0], def.p[1] + 0.12, def.p[2]);
    this.scene.add(glint);
    return { def, mesh, glint, taken: false, pos: new THREE.Vector3(def.p[0], def.p[1], def.p[2]) };
  }
  take(p) {
    p.taken = true;
    p.mesh.visible = false;
    if (p.glint) p.glint.visible = false;
  }
  updatePickups() {
    const P = this.player;
    if (!P.alive) return;
    for (const p of this.pickups) {
      if (p.taken) continue;
      if (p.glint) p.glint.material.opacity = 0.25 + 0.2 * Math.sin(this.time * 3 + p.pos.x);
      if (p.readyAt && this.time < p.readyAt) continue;
      const reach = p.pos.y > 0.5 ? 1.6 : 1.25;
      if (Math.hypot(p.pos.x - P.pos.x, p.pos.z - P.pos.z) > reach) continue;
      const k = p.def.kind;
      if (k === 'wrench') {
        P.has.wrench = true;
        P.equip('wrench');
        this.audio.play('pickup');
        this.hud.toast('<b>Pipe wrench</b> · left mouse to swing');
      } else if (k === 'smg') {
        P.has.smg = true;
        P.mag = Math.max(P.mag, 30);
        P.equip('smg');
        this.audio.play('gun');
        this.hud.toast('<b>Security SMG</b> · left mouse to fire · R reload · 1 / 2 to switch');
        this.checkpoint('Security office');
      } else if (k === 'ammo') {
        if (P.reserve >= 180) continue;
        P.reserve = Math.min(180, P.reserve + p.def.amount);
        this.audio.play('reload2');
        this.hud.toast(`+${p.def.amount} rounds`);
      } else if (k === 'can') {
        if (P.cans >= 4) continue;
        P.cans++;
        this.audio.play('pickup');
        if (!this.flags.canHint) {
          this.flags.canHint = 1;
          this.hud.toast('<b>Can of FIZZ·O</b> · G to throw it. It makes a racket.');
        }
      }
      this.take(p);
      this.hud.ammo();
    }
  }

  // ---------- using things ----------
  updateUsables() {
    const P = this.player;
    this.focus = null;
    if (!P.alive) return this.hud.prompt(null);
    const eye = P.eye(), fwd = P.forward();
    let best = null, bd = 2.0;
    for (const u of Object.values(this.built.usables)) {
      const dx = u.pos.x - eye.x, dy = u.pos.y - eye.y, dz = u.pos.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > bd) continue;
      if ((dx * fwd.x + dy * fwd.y + dz * fwd.z) / d < 0.55) continue;
      best = u;
      bd = d;
    }
    // things that are not on a wall: Okafor, the small crystals, a shard on the floor
    const dyn = [];
    const O = this.okafor;
    if (O.standing && ['follow', 'wait'].includes(O.state)) dyn.push({ def: { kind: 'okafor' }, pos: O.eye().clone().setY(O.crouched ? 0.9 : 1.3) });
    if (!P.has.shard) {
      for (const c of this.built.crystals) if (c.def.small && !c.def.planted) dyn.push({ def: { kind: 'crystal' }, pos: new THREE.Vector3(c.def.p[0], 0.4, c.def.p[1]), c });
      for (const g of this.groundShards) if (!g.flying && !g.claimed) dyn.push({ def: { kind: 'shard' }, pos: g.pos.clone().setY(0.2), g });
    }
    for (const u of dyn) {
      const dx = u.pos.x - eye.x, dy = u.pos.y - eye.y, dz = u.pos.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > (best ? bd : 2.4)) continue;
      if ((dx * fwd.x + dy * fwd.y + dz * fwd.z) / d < 0.6) continue;
      best = u;
      bd = d;
    }
    this.focus = best;
    if (!best) return this.hud.prompt(null);
    const k = best.def.kind;
    const text = {
      okafor: O.state === 'follow' ? 'E · Okafor: wait here' : 'E · Okafor: follow me',
      crystal: 'E · break off a crystal shard',
      shard: 'E · pick up the shard',
      terminal: best.def.file === 'lantern' ? 'E · read the Lantern file' : 'E · read the night log',
      vending: this.usableState.vending > 0 ? 'E · buy a can of FIZZ·O' : 'Sold out',
      medkit: best.used ? 'Empty' : P.hp >= 100 ? 'First aid (health full)' : 'E · first aid',
      gatectl: this.flags.gateOpen ? 'Gate open' : 'E · open the loading bay gate',
      breaker: this.flags.breaker ? 'Lift called' : 'E · power to the freight lift'
    }[k];
    this.hud.prompt(text);
  }
  use() {
    const u = this.focus, P = this.player;
    if (!u) return;
    const k = u.def.kind;
    if (k === 'okafor') {
      const O = this.okafor;
      if (O.state === 'follow') {
        O.setState('wait');
        O.lastMode = 'wait';
        O.crouched = P.crouch;
        this.say(O.inLight() ? "Here, in its light? All right." : P.crouch ? 'Staying down. Come back for me.' : "I'll wait. Don't leave me here.", 'okafor', true);
      } else {
        O.setState('follow');
        O.lastMode = 'follow';
        this.say('Right behind you.', 'okafor', true);
      }
    } else if (k === 'crystal' || k === 'shard') {
      if (k === 'shard') {
        this.scene.remove(u.g.mesh);
        this.groundShards = this.groundShards.filter((x) => x !== u.g);
      }
      P.has.shard = true;
      P.equip('shard');
      this.audio.play('chime', u.pos, 0.7);
      if (!this.flags.shardHint) {
        this.flags.shardHint = 1;
        this.hud.toast('<b>Crystal shard</b> · it hums in your hand · 3 to hold it, left mouse to throw it');
      }
    } else if (k === 'terminal') {
      this.state = 'reading';
      this.input.fire = false;
      this.hud.showTerminal(true, u.def.file);
      this.audio.play('button', u.pos, 0.6);
      if (u.def.file === 'lantern') this.flags.readLantern = 1;
    } else if (k === 'vending') {
      if (this.usableState.vending > 0 && P.cans < 4) {
        this.usableState.vending--;
        P.cans++;
        this.audio.play('vend', u.pos);
        this.hud.ammo();
        if (!this.flags.canHint) {
          this.flags.canHint = 1;
          this.hud.toast('<b>Can of FIZZ·O</b> · G to throw it. It makes a racket.');
        }
      } else this.audio.play('denied', u.pos);
    } else if (k === 'medkit') {
      if (u.used || P.hp >= 100) return this.audio.play('denied', u.pos);
      u.used = true;
      P.heal(40);
      u.front.emissiveIntensity = 0;
      u.front.color.setHex(0x555555);
      this.audio.play('heal');
    } else if (k === 'gatectl') {
      if (this.flags.gateOpen) return;
      this.audio.play('button', u.pos);
      this.openGate(false);
    } else if (k === 'breaker') {
      if (this.flags.breaker) return;
      this.pullBreaker();
    }
  }
  openGate(instant) {
    this.flags.gateOpen = 1;
    this.level.doorLocked.gate = false;
    this.level.version++;
    this.built.usables.gatectl.lamp.emissive.setHex(0x20ff40);
    if (instant) {
      this.level.doorOpen.gate = 1;
      return;
    }
    this.later(1.5, () => this.say('Warning. Loading bay containment is offline.'));
  }
  pullBreaker() {
    const u = this.built.usables.breaker;
    this.flags.breaker = 1;
    u.lever.rotation.x = 0.9;
    u.lamp.emissive.setHex(0x20ff40);
    this.audio.play('lever', u.pos);
    this.setGroup('bay', 1);
    this.liftT = 25;
    this.waveT = 2;
    this.waveN = 0;
    this.later(1.2, () => this.say('Freight lift called. Arrival in twenty-five seconds.'));
    this.later(5.5, () => {
      const O = this.okafor;
      if (O.standing && O.distTo(this.player.pos) < 25 && !this.flags.radio) O.line('breaker', "The lift! A response team is coming down. We're saved.", true);
    });
    this.noise(u.pos.x, u.pos.z, 30, 'boom');
  }
  setGroup(g, scale) {
    for (const s of this.lights.sources) if (s.group === g) s.scale = scale;
  }

  // ---------- doors ----------
  updateDoors(dt) {
    const actors = [this.player.pos, ...this.creatures.filter((c) => c.alive && c.kind !== 'tender').map((c) => c.pos)];
    for (const [id, d] of Object.entries(this.built.doors)) {
      const locked = this.level.doorLocked[id];
      let want = false;
      if (!locked) for (const a of actors) if (Math.hypot(a.x - d.center.x, a.z - d.center.z) < (id === 'gate' || id === 'lift' ? 99 : 3.2)) want = true;
      const was = this.level.doorOpen[id];
      const speed = d.def.slow ? 0.3 : 2.4;
      const now = Math.max(0, Math.min(1, was + (want ? 1 : -1) * speed * dt));
      if ((was === 0 && now > 0) || (was === 1 && now < 1)) this.audio.play(d.def.slow ? 'gate' : 'door', d.center.clone().setY(1.5));
      this.level.doorOpen[id] = now;
      d.group.position.y = d.def.h / 2 + now * d.def.h * 0.97;
      d.lampMat.emissive.setHex(locked ? 0xff2010 : 0x20ff40);
    }
  }

  // ---------- the hold's crystals and spores ----------
  updateCrystals(dt) {
    for (const c of this.built.crystals) {
      const target = c.dead ? 0.12 : 1;
      c.glow += (target - c.glow) * Math.min(1, dt * (c.dead ? 1.5 : 0.3));
      c.mat.emissiveIntensity = c.base * c.glow * (1 + (this.crystalPulse - 1) * 0.5);
      c.pool.opacity = Math.min(1, 0.35 * c.glow);
    }
    const dead = this.tenders.some((t) => !t.alive);
    this.setGroup('crystal', dead ? 0.15 : 1);
  }
  spores() {
    const n = 320, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = 36 + Math.random() * 44;
      pos[i * 3 + 1] = Math.random() * 6.5;
      pos[i * 3 + 2] = 28 + Math.random() * 26;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sporePts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.05, map: this.T.glow, color: 0x6ff0d8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.sporePts);
  }
  updateSpores(dt) {
    const a = this.sporePts.geometry.attributes.position;
    const t = this.time;
    for (let i = 0; i < a.count; i++) {
      let y = a.getY(i) + dt * 0.12;
      if (y > 6.6) y = 0.1;
      a.setY(i, y);
      a.setX(i, a.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.08);
    }
    a.needsUpdate = true;
  }

  // ---------- the level's script ----------
  beats(dt) {
    const P = this.player, f = this.flags, t = this.time;
    const room = this.level.roomAt(P.pos.x, P.pos.z);
    if (room && room !== 'door' && room !== this.room) {
      this.room = room;
      this.visited ??= new Set();
      if (!this.visited.has(room)) {
        this.visited.add(room);
        if (this.time > 2) this.hud.place(ROOM[room].name);
      }
      this.audio.setZone(room);
    }
    // fog per room
    const fog = FOG[this.room] ?? FOG.corr;
    this.scene.fog.color.lerp(new THREE.Color(fog[0]), Math.min(1, dt * 1.5));
    this.scene.fog.density += (fog[1] - this.scene.fog.density) * Math.min(1, dt * 1.5);
    // the alarm, near the lab, for the first minute and a half
    this.audio.setAlarm(t < 95 && ['lab', 'corr', 'sec'].includes(this.room) ? (this.room === 'sec' ? 0.5 : 1) * Math.min(1, (95 - t) / 15) : 0);

    if (!f.intro && t > 1.5) {
      f.intro = 1;
      this.say('Attention. Containment failure in Sublevel C. All personnel, evacuate by the east freight lift.');
      this.later(9, () => this.hud.toast('WASD to move · mouse to look · E to use'));
    }
    // corridor: the tubes blow one by one, then something drops out of the ceiling
    if (!f.corrBeat && room === 'corr' && P.pos.x > 27) {
      f.corrBeat = 1;
      this.popCorridor(false);
    }
    // the security office: the gun, then the vent behind you
    if (P.has.smg && !f.smgBeat) {
      f.smgBeat = 1;
      this.later(1.4, () => {
        const v = VENTS.sec, w = wallPos(v.c[0], v.c[1], v.side, 0.7);
        this.popVent('sec', [0, 0, -1]);
        this.ambush = [];
        for (let i = 0; i < 3; i++) {
          this.later(i * 0.45, () => {
            const s = new Skitter(this, w.x + (Math.random() - 0.5) * 0.6, w.z, { state: 'hunt' });
            s.target = { x: P.pos.x, z: P.pos.z };
            s.lastSense = this.time;
            this.creatures.push(s);
            this.ambush.push(s);
          });
        }
        this.later(0.3, () => this.okafor.line('vent', 'The vent! Behind you!', true));
      });
      this.later(4.5, () => this.say('Security response teams, report to Sublevel C.'));
    }
    this.okaforBeats(room);
    if (!this.notes.has('crystal-bodies') && room === 'garden')
      for (const g of this.built.grown ?? []) if (Math.hypot(g.pos.x - P.pos.x, g.pos.z - P.pos.z) < 6 && this.canSee(g.pos, 6)) this.observe('crystal-bodies');
    if (!f.cpHold && room === 'garden' && P.pos.z > 29.5) {
      f.cpHold = 1;
      this.checkpoint(ROOM.garden.name);
    }
    if (!f.cpBay && room === 'bay' && P.pos.x > 83) {
      f.cpBay = 1;
      this.checkpoint(ROOM.bay.name);
    }
    // the hold-out: waves from the vents until the lift arrives, and the lift is not bringing a rescue
    if (f.breaker && !f.radio && this.liftT < 14) {
      f.radio = 1;
      this.audio.play('radio', new THREE.Vector3(96, 2, 15), 1.2);
      this.say('Sweep One, descending to Sublevel C. Orders stand: sterilise the hold, recover one seed crystal. Nobody from Sublevel C comes up.', 'sweep');
      this.observe('sweep-orders');
      this.later(8.5, () => {
        const O = this.okafor;
        if (O.standing && O.distTo(P.pos) < 25) O.line('radio', "Nobody comes up? They're not here to save us. They'll shoot us. Tell me where to hide.", true);
      });
    }
    if (f.liftHere && this.waveN < 12 && this.time - this.liftAt < 14) {
      this.waveT -= dt;
      if (this.waveT <= 0) this.spawnWave();
    }
    if (f.breaker && !f.liftHere) {
      this.liftT -= dt;
      this.hud.timer(Math.max(0, this.liftT));
      this.waveT -= dt;
      if (this.waveT <= 0 && this.waveN < 9) this.spawnWave();
      if (this.liftT <= 0) {
        f.liftHere = 1;
        this.level.doorLocked.lift = false;
        this.level.version++;
        this.setGroup('lift', 1);
        this.audio.play('ding', new THREE.Vector3(96, 2, 15));
        this.hud.timer(0);
        this.liftAt = this.time;
        this.waveT = 3;
        this.sweepArrive();
      }
    }
    if (f.liftHere && room === 'lift' && P.pos.z < 15.6 && this.state === 'play') this.finish();
  }
  spawnWave() {
    const P = this.player;
    this.waveT = 2.6;
    const i = this.waveN % VENTS.bay.length;
    const v = VENTS.bay[i], w = wallPos(v.c[0], v.c[1], v.side, 0.7);
    if (this.waveN < VENTS.bay.length) this.popVent('bay' + i, [0, 0, 0]);
    const s = new Skitter(this, w.x, w.z, { state: 'hunt' });
    s.target = { x: P.pos.x, z: P.pos.z };
    this.creatures.push(s);
    this.audio.play('chitter', s.zones()[0].c, 1.2);
    this.waveN++;
  }
  /** The lift doors open on three soldiers. */
  sweepArrive() {
    this.sweep = [];
    SWEEP.spawn.forEach(([x, z], i) => {
      const s = new Soldier(this, x, z, SWEEP.posts[i]);
      this.creatures.push(s);
      this.sweep.push(s);
    });
    this.later(0.8, () => this.say('Sweep on the floor. Spread out. Anything that moves.', 'sweep'));
    this.later(4, () => {
      if (this.player.alive && !this.notes.has('sweep-gunfire')) this.hud.toast('The Skitters hunt by sound. <b>Who is the loudest thing in the bay now?</b>');
    });
  }
  onSoldierDown(s) {
    this.stats.sweep[s.lastHitBy ?? 'player']++;
    // its magazine drops where it falls
    const def = { id: 'sweep-ammo', kind: 'ammo', p: [s.pos.x + 0.3, 0, s.pos.z + 0.3], amount: 30 };
    this.pickups.push(this.makePickup(def));
    const left = this.sweep?.filter((x) => x.alive) ?? [];
    if (left.length) this.later(0.6, () => left[0].alive && left[0].bark('down'));
    if (s.lastHitBy === 'fold' && this.canSee(s.zones()[0].c, 30)) this.observe('sweep-gunfire');
  }
  onSkitterWindup(sk, A) {
    const O = this.okafor, P = this.player;
    if (A !== P || !O.standing || O.distTo(P.pos) > 15) return;
    const f = P.forward(), dx = sk.pos.x - P.pos.x, dz = sk.pos.z - P.pos.z, d = Math.hypot(dx, dz) || 1;
    if ((f.x * dx + f.z * dz) / (d * (Math.hypot(f.x, f.z) || 1)) < -0.3) O.shout('Behind you!', 6);
  }
  onOkaforDown() {
    this.hud.toast("Okafor is down. <b>They're taking her somewhere.</b>");
  }
  onOkaforPlanted(O) {
    if (this.canSee(O.zones()[0].c, 30)) {
      this.observe('skitter-drag');
      this.observe('crystal-bodies');
    }
    this.hud.toast('Okafor has gone quiet.');
  }
  onOkaforDead(O) {
    if (O.fate === 'shot by the Sweep') this.later(0.8, () => this.say('Civilian down. Moving on.', 'sweep'));
  }
  /** What she says, and when: once each, only while she is with you and on her feet. */
  okaforBeats(room) {
    const O = this.okafor, P = this.player, f = this.flags;
    if (!O.standing) return;
    const near = O.distTo(P.pos) < 13;
    // the vent ambush is over: she comes along
    if (O.said.has('greet') && !O.said.has('join') && this.ambush && this.ambush.length === 3 && this.ambush.every((s) => !s.alive)) {
      this.later(1.2, () => {
        if (O.line('join', "They're blind. They hunt by sound. I'm coming with you: the lift is the only way up. If you need me to stay put, tell me.", true)) {
          O.setState('follow');
          O.lastMode = 'follow';
          this.later(6, () => this.hud.toast('<b>E</b> on Okafor · wait here / follow me. She does what you do: crouch, and so does she.'));
        }
      });
      this.ambush = null;
    }
    // you walk off without her before the ambush: she calls after you and comes anyway
    if (O.said.has('greet') && !O.said.has('join') && O.state === 'wait' && O.distTo(P.pos) > 12 && !this.ambush) {
      if (O.line('join', "Wait! Don't leave me here! I'm coming with you.", true)) {
        O.setState('follow');
        O.lastMode = 'follow';
        this.later(5, () => this.hud.toast('<b>E</b> on Okafor · wait here / follow me. She does what you do: crouch, and so does she.'));
      }
    }
    if (!near || O.state === 'hide') return;
    if (room === 'corrB') O.line('corrB', 'That is the hold, where we kept the specimens. The gate control for the bay is in the far corner, past the nest.');
    if (room === 'garden') O.line('garden', "The crystals. They've grown since my shift. Metres, in a few hours.");
    for (const g of this.built.grown ?? []) {
      if (O.distTo(g.pos) < 8 && this.level.los(O.eye(), g.pos)) {
        if (O.line('grown', "That's Kowalski. Oh God. They're not eating them. They're planting them.")) this.observe('crystal-bodies');
      }
    }
    const T = this.tenders[0];
    if (T.alive && room === 'garden' && O.distTo(T.pos) < 13 && this.level.los(O.eye(), T.lanternPos)) O.line('tender', "The tall one. It tends them, like a gardener. The small ones won't go near its light.");
    if (room === 'bay' && this.bulwark.alive) O.line('bay', "That's the big one from the pen. Bullets won't go through its front. Make it charge into something.");
  }
  popCorridor(instant) {
    const tubes = this.lights.sources.filter((s) => s.group === 'corr').sort((a, b) => b.pos.x - a.pos.x);
    if (instant) {
      for (const s of tubes) s.on = false;
      this.built.vents.corr.visible = false;
      return;
    }
    tubes.forEach((s, i) =>
      this.later(i * 0.5, () => {
        s.on = false;
        this.fx.sparks(s.pos, [0, -1, 0], 22, 3, 0xd8e8ff);
        this.audio.play('pop', s.pos);
        this.audio.play('spark', s.pos);
      })
    );
    this.later(1.9, () => {
      const v = VENTS.corr;
      this.popVent('corr', [0, -1, 0]);
      const s = new Skitter(this, v.p[0], v.p[2], { state: 'fall', y: 2.5, afterFall: 'sniff' });
      s.home = { x: v.p[0], z: v.p[2] };
      this.creatures.push(s);
      this.audio.play('screech', new THREE.Vector3(v.p[0], 2.5, v.p[2]), 0.8);
    });
    this.later(3.5, () => {
      if (!this.player.torch) this.hud.toast('It went dark · <b>F</b> for your torch');
    });
  }
  popVent(key, dir) {
    const m = this.built.vents[key];
    if (!m || !m.visible) return;
    this.audio.play('vent', m.position);
    this.fx.dust(m.position, dir[1] ? dir : [Math.sin(m.rotation.y), 0, Math.cos(m.rotation.y)]);
    const fall = m.clone();
    m.visible = false;
    this.scene.add(fall);
    const v = new THREE.Vector3(Math.sin(m.rotation.y) * 2, 1, Math.cos(m.rotation.y) * 2);
    if (dir[1]) v.set(0, 0, 0);
    const spin = (Math.random() - 0.5) * 8;
    const step = () => {
      v.y -= 9.8 / 60;
      fall.position.addScaledVector(v, 1 / 60);
      fall.rotation.x += spin / 60;
      if (fall.position.y > 0.03) requestAnimationFrame(step);
      else {
        fall.position.y = 0.02;
        fall.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
        this.audio.play('clank', fall.position, 0.6);
      }
    };
    step();
  }

  // ---------- notes, kills, death, checkpoints, the end ----------
  observe(id, src) {
    if (this.notes.has(id) || this.state === 'title') return;
    if (id === 'cans-lure' && src && src.distTo(this.player.pos) > 30) return;
    const n = NOTES.find((x) => x.id === id);
    if (!n) return;
    this.notes.add(id);
    this.hud.toast(`<span class="pen">Field note</span> ${n.title}`, 'note');
    this.audio.play('note');
    if (this.notes.size === 1) this.later(2.5, () => this.hud.toast('<b>Tab</b> · read your field notes'));
  }
  onKill(c) {
    this.stats.kills[c.kind]++;
    if (c.kind === 'skitter') this.observe('skitter-soft');
  }
  onPlayerDeath() {
    this.state = 'dead';
    this.input.fire = false;
    this.later(1.6, () => {
      this.state = 'deadscreen';
      if (document.pointerLockElement) document.exitPointerLock();
      this.hud.screen(`<div class="title small"><h2>You died</h2><p class="lede">Checkpoint: ${this.cp.name}</p><p class="go">Click to try again</p></div>`, 'on dead');
    });
  }
  checkpoint(name, silent) {
    const P = this.player;
    this.cp = {
      name,
      pos: P.pos.clone(),
      yaw: P.yaw,
      has: { ...P.has },
      weapon: P.weapon,
      mag: P.mag,
      reserve: P.reserve,
      cans: P.cans,
      hp: P.hp,
      flags: { ...this.flags },
      taken: new Set(this.pickups.filter((p) => p.taken).map((p) => p)),
      seq: this.spawnSeq,
      okafor: (() => {
        const O = this.okafor;
        return { state: O.state, pos: O.pos.clone(), hp: O.hp, crouched: O.crouched, said: new Set(O.said), lastMode: O.lastMode, alive: O.alive, fate: O.fate };
      })()
    };
    if (!silent) this.hud.toast('Checkpoint', 'cp');
  }
  respawn() {
    const cp = this.cp, P = this.player;
    this.timers = [];
    P.pos.copy(cp.pos);
    P.vel.set(0, 0, 0);
    P.yaw = cp.yaw;
    P.pitch = 0;
    P.has = { ...cp.has };
    P.mag = cp.mag;
    P.reserve = Math.max(cp.reserve, cp.has.smg ? 60 : 0);
    P.cans = Math.max(cp.cans, 1);
    P.hp = 100;
    P.alive = true;
    P.eyeH = 1.62;
    P.crouch = false;
    P.weapon = undefined;
    P.equip(cp.weapon, true);
    this.flags = { ...cp.flags };
    // the doors and switches follow the flags
    this.level.doorLocked.gate = !this.flags.gateOpen;
    this.level.doorLocked.lift = !this.flags.liftHere;
    if (!this.flags.gateOpen) {
      this.level.doorOpen.gate = 0;
      this.built.usables.gatectl.lamp.emissive.setHex(0xff2010);
    }
    if (!this.flags.liftHere) this.level.doorOpen.lift = 0;
    this.level.version++;
    if (!this.flags.breaker) {
      this.setGroup('bay', 0.45);
      this.setGroup('lift', 0);
      const u = this.built.usables.breaker;
      u.lever.rotation.x = -0.5;
      u.lamp.emissive.setHex(0xff2010);
      this.hud.timer(null);
    }
    if (!this.flags.corrBeat) for (const s of this.lights.sources) if (s.group === 'corr') s.on = true;
    // pickups taken since the checkpoint come back
    for (const p of this.pickups) {
      if (p.thrown) continue;
      if (p.taken && !cp.taken.has(p)) {
        p.taken = false;
        p.mesh.visible = true;
        if (p.glint) p.glint.visible = true;
      }
    }
    this.pickups = this.pickups.filter((p) => !p.thrown || !p.taken);
    // creatures that arrived since the checkpoint go; the rest go home and calm down
    this.creatures = this.creatures.filter((c) => {
      if (c.seq >= cp.seq) {
        c.remove();
        return false;
      }
      return true;
    });
    for (const c of this.creatures) {
      if (!c.alive) continue;
      if (c.kind === 'skitter') {
        c.pos.set(c.home.x, 0, c.home.z);
        c.y = 0;
        c.setState('idle');
        c.target = null;
        c.prey = null;
        c.dragging = null;
      } else if (c.kind === 'tender') {
        c.setState('drift');
        c.tendTarget = null;
        c.planting = null;
        c.scaredT = 0;
      } else if (c.kind === 'bulwark') {
        c.pos.set(99, 0, 39.5);
        c.yaw = Math.PI;
        c.body.rotation.set(0, 0, 0);
        c.setState('dormant');
      }
    }
    for (const c of this.thrown) this.scene.remove(c.mesh);
    this.thrown = [];
    for (const g of this.groundShards) this.scene.remove(g.mesh);
    this.groundShards = [];
    this.sweep = null;
    // Okafor as she was at the checkpoint
    {
      const O = this.okafor, os = cp.okafor;
      if (O.shards && os.state !== 'planted') {
        O.group.remove(O.shards);
        O.shards = null;
      }
      Object.assign(O, { alive: os.alive, hp: os.hp, crouched: os.crouched, said: new Set(os.said), lastMode: os.lastMode, fate: os.fate, dragger: null });
      O.pos.copy(os.pos);
      O.setState(os.state === 'down' || os.state === 'dragged' ? os.lastMode ?? 'follow' : os.state);
      if (os.state === 'down' || os.state === 'dragged') O.hp = 25;
    }
    if (P.weapon === 'shard' && !P.has.shard) P.equip(P.has.smg ? 'smg' : 'wrench', true);
    this.hud.screen('');
    this.hud.health();
    this.hud.ammo();
    this.hud.fade(1, 0);
    setTimeout(() => this.hud.fade(0, 1.2), 50);
    this.state = 'play';
    this.lock();
  }
  finish() {
    this.state = 'ending';
    this.hud.fade(1, 2);
    this.audio.play('ding');
    setTimeout(() => {
      this.state = 'end';
      if (document.pointerLockElement) document.exitPointerLock();
      this.hud.show(false);
      const secs = Math.round(this.time - this.stats.start);
      const k = this.stats.kills;
      const T0 = this.tenders[0];
      const tender = T0.alive ? 'left to its garden' : T0.killedBy === 'the Sweep' ? 'shot by the Sweep' : 'killed';
      const bul = this.bulwark.alive ? 'escaped' : 'brought down';
      const O = this.okafor;
      const okafor = O.alive ? (O.distTo(this.player.pos) < 6 && O.standing ? 'came up with you' : 'still down there, alive') : O.fate ?? 'lost';
      const sw = this.stats.sweep, swDown = sw.player + sw.fold + sw.blast + sw.sweep;
      this.hud.screen(
        `<div class="title end">
          <h2>Sublevel C · out</h2>
          <p class="lede">The freight lift groans upward. Whatever came through from the Fold is still down there.</p>
          <div class="stats">
            <span><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b> time</span>
            <span><b>${k.skitter}</b> Skitters</span>
            <span><b>${bul}</b> the Bulwark</span>
            <span><b>${tender}</b> the Tender</span>
            <span><b>${okafor}</b> Dr Okafor</span>
            <span><b>${swDown} / 3</b> of the Sweep down${sw.fold ? ` (${sw.fold} by the Fold)` : ''}</span>
          </div>
          <p class="lede">As the lift rises you hear the crystals below begin to sing. And this time, very faintly, from somewhere much further down, something sings back.</p>
          <h3>Field notes ${this.notes.size} / ${NOTES.length}</h3>
          <div class="endnotes">${this.hud.notesHTML(true)}</div>
          <p class="go">That's the test level. R to play again.</p>
        </div>`,
        'on end'
      );
    }, 2200);
  }
}

// the real creature bodies load first; any that fail fall back to their procedural ones
await loadCreatureModels();
new World();
