/* SQUIRM — core: maths, input, camera, sound, particles. Plain scripts sharing window.SQ, loaded in order by index.html. */
var SQ = (window.SQ = window.SQ || {});
(function (S) {
  // ── maths ──
  S.rr = (a, b) => a + Math.random() * (b - a);
  S.ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  S.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  S.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  S.lerp = (a, b, t) => a + (b - a) * t;
  S.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  S.wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  S.hsl = (h, s, l, a) => 'hsla(' + Math.round(h) + ',' + s + '%,' + l + '%,' + (a == null ? 1 : a) + ')';
  S.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  S.$ = (id) => document.getElementById(id);
  S.store = {
    get(k) { try { const v = localStorage.getItem('squirm.' + k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('squirm.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  // ── canvas & camera ──
  const cv = S.$('cv'), eye = S.$('eye');
  S.cv = cv; S.ctx = cv.getContext('2d');
  S.W = 800; S.H = 600; S.dpr = 1;
  S.resize = function () {
    const r = eye.getBoundingClientRect();
    S.dpr = Math.min(2, window.devicePixelRatio || 1);
    S.W = Math.max(200, r.width); S.H = Math.max(200, r.height);
    cv.width = Math.round(S.W * S.dpr); cv.height = Math.round(S.H * S.dpr);
  };
  window.addEventListener('resize', () => S.resize());
  S.cam = { x: 0, y: 0, z: 1, shake: 0 };
  S.applyCam = function (ctx) {
    const c = S.cam, z = c.z * S.dpr, sx = c.shake ? S.rr(-c.shake, c.shake) : 0, sy = c.shake ? S.rr(-c.shake, c.shake) : 0;
    ctx.setTransform(z, 0, 0, z, S.dpr * (S.W / 2 + sx) - c.x * z, S.dpr * (S.H / 2 + sy) - c.y * z);
  };
  S.screenTx = (ctx) => ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  S.toWorld = (sx, sy) => ({ x: (sx - S.W / 2) / S.cam.z + S.cam.x, y: (sy - S.H / 2) / S.cam.z + S.cam.y });
  S.toScreen = (x, y) => ({ x: (x - S.cam.x) * S.cam.z + S.W / 2, y: (y - S.cam.y) * S.cam.z + S.H / 2 });

  // ── input ──
  const keys = {}; let hit = {};
  S.key = (c) => !!keys[c];
  S.tapped = (c) => !!hit[c];
  S.mouse = { x: 0, y: 0, down: false, clicked: false, rclicked: false, shift: false, moved: 0 };
  S.lastSteer = -1e9;
  const GAME_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (!keys[e.code]) hit[e.code] = true;
    keys[e.code] = true;
    if (GAME_KEYS.indexOf(e.code) >= 0) e.preventDefault();
    S.sfx.wake();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; S.mouse.down = false; });
  function pos(e) { const r = cv.getBoundingClientRect(); S.mouse.x = e.clientX - r.left; S.mouse.y = e.clientY - r.top; S.mouse.shift = e.shiftKey; }
  cv.addEventListener('pointerdown', (e) => {
    pos(e); S.sfx.wake();
    if (e.button === 2) { S.mouse.rclicked = true; return; }
    S.mouse.down = true; S.mouse.clicked = true; S.mouse.moved = 0;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  });
  cv.addEventListener('pointermove', (e) => { pos(e); S.mouse.moved++; });
  cv.addEventListener('pointerup', (e) => { pos(e); if (e.button !== 2) S.mouse.down = false; });
  cv.addEventListener('pointercancel', () => { S.mouse.down = false; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  S.endFrame = () => { hit = {}; S.mouse.clicked = false; S.mouse.rclicked = false; };
  /** WASD / arrows as a unit vector, or null. */
  S.keyVector = function () {
    let x = 0, y = 0;
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (!x && !y) return null;
    const l = Math.hypot(x, y); return { x: x / l, y: y / l };
  };

  // ── sound: a few synthesised voices, started by the first key or click ──
  S.sfx = {
    ac: null, muted: S.store.get('muted') === true, master: null,
    wake() {
      if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
      try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ac.createGain(); this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(this.ac.destination); } catch (e) { this.ac = null; }
    },
    setMuted(m) { this.muted = m; S.store.set('muted', m); if (this.master) this.master.gain.value = m ? 0 : 0.5; },
    tone(f, dur, type, vol, f2, when) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime + (when || 0), o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, freq, when) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime + (when || 0), n = Math.floor(this.ac.sampleRate * dur), buf = this.ac.createBuffer(1, n, this.ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
      s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = 1.2; g.gain.value = vol || 0.3;
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
    },
    NOTES: [392, 494, 587, 740],
    play(name, arg) {
      if (!this.ac || this.muted) return;
      switch (name) {
        case 'eat': this.tone(660 + Math.random() * 200, 0.07, 'sine', 0.08, 990); break;
        case 'chomp': this.noise(0.09, 0.35, 900); this.tone(180, 0.1, 'square', 0.06, 90); break;
        case 'hurt': this.tone(240, 0.22, 'sawtooth', 0.09, 70); break;
        case 'dna': this.tone(1046, 0.09, 'triangle', 0.08); this.tone(1568, 0.12, 'triangle', 0.06, null, 0.06); break;
        case 'egg': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.1, null, i * 0.09)); break;
        case 'hatch': for (let i = 0; i < 6; i++) this.tone(300 + Math.random() * 600, 0.08, 'sine', 0.07, 900, i * 0.05); break;
        case 'die': this.tone(400, 0.9, 'sawtooth', 0.1, 40); break;
        case 'note': { const f = this.NOTES[arg % 4]; this.tone(f, 0.32, ['sine', 'triangle', 'square', 'sawtooth'][arg % 4], arg % 4 >= 2 ? 0.05 : 0.12); break; }
        case 'wrong': this.tone(150, 0.3, 'square', 0.07, 110); break;
        case 'ally': [523, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.1, null, i * 0.07)); break;
        case 'extinct': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.1, null, i * 0.16)); break;
        case 'win': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.1, null, i * 0.1)); break;
        case 'mut': for (let i = 0; i < 10; i++) this.tone(200 + i * 90, 0.05, 'square', 0.03, null, i * 0.045); break;
        case 'click': this.tone(880, 0.04, 'square', 0.03); break;
        case 'scent': this.tone(520, 0.15, 'sine', 0.06, 780); break;
      }
    }
  };
  const muteBtn = S.$('mute');
  const showMute = () => { muteBtn.textContent = S.sfx.muted ? 'sound off' : 'sound on'; muteBtn.setAttribute('aria-pressed', S.sfx.muted ? 'true' : 'false'); };
  muteBtn.addEventListener('click', () => { S.sfx.wake(); S.sfx.setMuted(!S.sfx.muted); showMute(); });
  showMute();

  // ── particles and floating words ──
  S.fx = [];
  S.burst = function (x, y, colour, n, speed, life, size) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * (speed || 60);
      S.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life || 0.6, t: 0, c: colour, r: (size || 2) * (0.5 + Math.random()) });
    }
  };
  S.floaters = [];
  S.float = (x, y, text, colour) => S.floaters.push({ x, y, text, c: colour || '#ffc94d', t: 0 });
  S.updateFx = function (dt) {
    for (let i = S.fx.length - 1; i >= 0; i--) { const p = S.fx[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; if (p.t > p.life) S.fx.splice(i, 1); }
    for (let i = S.floaters.length - 1; i >= 0; i--) { const f = S.floaters[i]; f.t += dt; f.y -= 22 * dt; if (f.t > 1.1) S.floaters.splice(i, 1); }
    if (S.cam.shake) S.cam.shake = Math.max(0, S.cam.shake - dt * 30);
  };
  S.drawFx = function (ctx) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of S.fx) { ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
    ctx.restore();
    ctx.save(); ctx.textAlign = 'center'; ctx.font = '700 ' + Math.round(15 / S.cam.z) + 'px Gluten, cursive';
    for (const f of S.floaters) { ctx.globalAlpha = Math.min(1, 2.2 - f.t * 2); ctx.fillStyle = f.c; ctx.fillText(f.text, f.x, f.y); }
    ctx.restore();
  };

  // ── on-eye HUD words ──
  let toastT = 0;
  S.toast = function (text, secs) { const el = S.$('toast'); el.textContent = text; el.style.opacity = 1; toastT = secs || 2.4; };
  S.tickToast = function (dt) { if (toastT > 0) { toastT -= dt; if (toastT <= 0) S.$('toast').style.opacity = 0; } };
  let lastPrompt = '';
  S.prompt = function (html) { if (html !== lastPrompt) { S.$('prompt').innerHTML = html || ''; lastPrompt = html; } };
  S.setHtml = function (el, html) { if (el && el._h !== html) { el.innerHTML = html; el._h = html; } };
})(SQ);
