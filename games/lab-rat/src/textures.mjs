// Every texture is drawn on a canvas at start-up: no image files.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
function noise(ctx, w, h, n, rand, rgb, aMax, size = 1.5) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(${rgb},${rand() * aMax})`;
    const s = rand() * size + 0.5;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
}
function grime(ctx, w, h, rand, count, rgb = '20,16,12', aMax = 0.12, rMax = 60) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w, y = rand() * h, r = 10 + rand() * rMax;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${rand() * aMax})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
function streaks(ctx, w, h, rand, count, top = 0) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w, len = 40 + rand() * h * 0.5, y = top + rand() * h * 0.3;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(30,24,16,0.18)');
    g.addColorStop(1, 'rgba(30,24,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 2 + rand() * 5, len);
  }
}

export function makeTextures(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (c, { srgb = true, repeat = true } = {}) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    return t;
  };
  const T = {};

  // Lab and office floors: 50 cm vinyl tiles, scuffed. One texture = one 2 m cell.
  {
    const [c, g] = canvas(512);
    const r = rng(11);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const v = 92 + Math.floor(r() * 14) + ((x + y) % 2 ? 8 : 0);
        g.fillStyle = `rgb(${v},${v + 2},${v - 2})`;
        g.fillRect(x * 128, y * 128, 128, 128);
      }
    noise(g, 512, 512, 9000, r, '40,40,40', 0.25);
    noise(g, 512, 512, 1500, r, '200,200,190', 0.12);
    grime(g, 512, 512, r, 14);
    g.strokeStyle = 'rgba(30,30,28,0.65)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke();
      g.beginPath(); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke();
    }
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(20,20,20,${0.05 + r() * 0.12})`;
      g.lineWidth = 1 + r() * 3;
      g.beginPath();
      const x = r() * 512, y = r() * 512;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + r() * 80 - 40, y + r() * 80 - 40, x + r() * 120 - 60, y + r() * 60 - 30);
      g.stroke();
    }
    T.floorTile = tex(c);
  }
  // Hold and bay floors: poured concrete with joints and stains.
  {
    const [c, g] = canvas(512);
    const r = rng(23);
    g.fillStyle = '#5d5b57';
    g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, 22000, r, '30,30,30', 0.22, 2);
    noise(g, 512, 512, 6000, r, '160,156,150', 0.15, 2);
    grime(g, 512, 512, r, 30, '25,22,18', 0.2, 90);
    g.strokeStyle = 'rgba(25,25,25,0.7)';
    g.lineWidth = 3;
    g.strokeRect(1, 1, 510, 510);
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = 'rgba(20,20,20,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      let x = r() * 512, y = r() * 512;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.lineTo((x += r() * 50 - 25), (y += r() * 50 - 25));
      g.stroke();
    }
    T.floorConcrete = tex(c);
  }
  // Office walls: painted block, a dark skirting, a teal band at waist height. v = 0..1 maps 0..3.4 m.
  {
    const [c, g] = canvas(512, 1024);
    const r = rng(37);
    const m = (y) => 1024 - (y / 3.4) * 1024; // metres → canvas y
    g.fillStyle = '#b9b5a8';
    g.fillRect(0, 0, 512, 1024);
    g.fillStyle = '#5f6d6c';
    g.fillRect(0, m(1.1), 512, m(0) - m(1.1));
    g.fillStyle = '#2f7f86';
    g.fillRect(0, m(1.18), 512, m(1.1) - m(1.18));
    g.fillStyle = '#2b2a28';
    g.fillRect(0, m(0.12), 512, m(0) - m(0.12));
    g.strokeStyle = 'rgba(40,38,34,0.25)';
    g.lineWidth = 2;
    for (let y = 0; y < 3.4; y += 0.2) {
      g.beginPath(); g.moveTo(0, m(y)); g.lineTo(512, m(y)); g.stroke();
      const off = Math.round(y / 0.2) % 2 ? 0 : 64;
      for (let x = off; x < 512; x += 128) { g.beginPath(); g.moveTo(x, m(y)); g.lineTo(x, m(y + 0.2)); g.stroke(); }
    }
    noise(g, 512, 1024, 12000, r, '50,45,40', 0.12);
    grime(g, 512, 1024, r, 12, '30,26,20', 0.12, 80);
    streaks(g, 512, 1024, r, 8);
    T.wallOffice = tex(c);
  }
  // Lab walls: white tiles to 2 m, painted above.
  {
    const [c, g] = canvas(512, 1024);
    const r = rng(41);
    const m = (y) => 1024 - (y / 3.4) * 1024;
    g.fillStyle = '#c8cbc6';
    g.fillRect(0, 0, 512, 1024);
    const ts = 512 / 13.33; // 15 cm tiles
    for (let y = 0; y < 2.0; y += 0.15)
      for (let x = 0; x < 512; x += ts) {
        const v = 205 + Math.floor(r() * 18);
        g.fillStyle = `rgb(${v},${v + 3},${v + 1})`;
        g.fillRect(x + 1, m(y + 0.15) + 1, ts - 2, m(y) - m(y + 0.15) - 2);
      }
    g.fillStyle = '#8b2d2a';
    g.fillRect(0, m(2.06), 512, m(2.0) - m(2.06));
    noise(g, 512, 1024, 9000, r, '60,60,60', 0.1);
    grime(g, 512, 1024, r, 10, '30,30,24', 0.1, 70);
    T.wallLab = tex(c);
  }
  // Concrete walls (hold, bay): 2 m × 2 m form-work panels with tie holes. v repeats every 2 m.
  {
    const [c, g] = canvas(512);
    const r = rng(53);
    g.fillStyle = '#6c6a64';
    g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, 20000, r, '35,35,35', 0.2, 2);
    noise(g, 512, 512, 5000, r, '170,165,160', 0.12, 2);
    grime(g, 512, 512, r, 16, '30,28,24', 0.18, 100);
    streaks(g, 512, 512, r, 14);
    g.strokeStyle = 'rgba(30,30,30,0.6)';
    g.lineWidth = 3;
    g.strokeRect(1, 1, 510, 510);
    g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
    for (const [x, y] of [[64, 64], [448, 64], [64, 320], [448, 320], [256, 192], [256, 448]]) {
      g.fillStyle = 'rgba(25,25,25,0.8)';
      g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    }
    T.wallConcrete = tex(c);
  }
  // Ceiling: acoustic tiles in a grid.
  {
    const [c, g] = canvas(256);
    const r = rng(61);
    g.fillStyle = '#a7a59c';
    g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 8000, r, '80,80,70', 0.2, 1);
    grime(g, 256, 256, r, 6, '60,50,30', 0.2, 40);
    g.strokeStyle = '#55554f';
    g.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
    }
    T.ceilTile = tex(c);
  }
  {
    const [c, g] = canvas(256);
    const r = rng(67);
    g.fillStyle = '#2a2a2a';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#3a3936';
    for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 18, 256);
    noise(g, 256, 256, 5000, r, '0,0,0', 0.4, 2);
    T.ceilMetal = tex(c);
  }
  // Metal door with hazard stripes along its foot.
  {
    const [c, g] = canvas(512);
    const r = rng(71);
    g.fillStyle = '#6f7478';
    g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, 12000, r, '30,30,30', 0.18);
    g.strokeStyle = 'rgba(20,20,20,0.6)';
    g.lineWidth = 4;
    g.strokeRect(30, 30, 452, 380);
    g.beginPath(); g.moveTo(256, 30); g.lineTo(256, 410); g.stroke();
    g.save();
    g.beginPath(); g.rect(0, 430, 512, 82); g.clip();
    g.fillStyle = '#d9a514';
    g.fillRect(0, 430, 512, 82);
    g.fillStyle = '#1b1b1b';
    for (let x = -100; x < 600; x += 60) {
      g.beginPath(); g.moveTo(x, 512); g.lineTo(x + 30, 512); g.lineTo(x + 112, 430); g.lineTo(x + 82, 430); g.fill();
    }
    g.restore();
    grime(g, 512, 512, r, 10, '20,18,14', 0.2, 80);
    T.door = tex(c, { repeat: false });
  }
  {
    const [c, g] = canvas(128, 32);
    g.fillStyle = '#d9a514';
    g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#1b1b1b';
    for (let x = -40; x < 160; x += 32) {
      g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 48, 0); g.lineTo(x + 32, 0); g.fill();
    }
    T.hazard = tex(c);
  }
  // Wooden crate.
  {
    const [c, g] = canvas(256);
    const r = rng(79);
    g.fillStyle = '#7a5a36';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = `rgba(${60 + r() * 40},${40 + r() * 30},20,0.5)`;
      g.fillRect(0, y, 256, 30);
    }
    noise(g, 256, 256, 6000, r, '30,20,10', 0.25, 2);
    g.strokeStyle = '#3f2c18';
    g.lineWidth = 16;
    g.strokeRect(8, 8, 240, 240);
    g.beginPath(); g.moveTo(8, 8); g.lineTo(248, 248); g.stroke();
    g.fillStyle = 'rgba(20,20,20,0.75)';
    g.font = 'bold 22px monospace';
    g.fillText('KDR-C', 150, 70);
    T.crate = tex(c);
  }
  // A bullet hole; a scorch; blood (tinted per creature by the material colour); a soft glow.
  {
    const [c, g] = canvas(64);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(5,5,5,1)');
    gr.addColorStop(0.25, 'rgba(15,15,15,0.95)');
    gr.addColorStop(0.45, 'rgba(40,38,34,0.6)');
    gr.addColorStop(1, 'rgba(40,38,34,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    T.hole = tex(c, { repeat: false });
  }
  {
    const [c, g] = canvas(256);
    const r = rng(83);
    for (let i = 0; i < 40; i++) {
      const x = 128 + (r() - 0.5) * 90, y = 128 + (r() - 0.5) * 90, rad = 30 + r() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(8,6,4,0.35)');
      gr.addColorStop(1, 'rgba(8,6,4,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
    }
    T.scorch = tex(c, { repeat: false });
  }
  {
    const [c, g] = canvas(128);
    const r = rng(89);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.arc(64, 64, 26, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = 20 + r() * 40, s = 2 + r() * 9;
      g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, s, 0, Math.PI * 2); g.fill();
    }
    T.splat = tex(c, { repeat: false, srgb: false });
  }
  {
    const [c, g] = canvas(128);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.15)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    T.glow = tex(c, { repeat: false, srgb: false });
  }
  {
    const [c, g] = canvas(128);
    const r = rng(97);
    for (let i = 0; i < 30; i++) {
      const x = 64 + (r() - 0.5) * 50, y = 64 + (r() - 0.5) * 50, rad = 14 + r() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    }
    T.smoke = tex(c, { repeat: false, srgb: false });
  }
  // Muzzle flash: a four-pointed star.
  {
    const [c, g] = canvas(128);
    g.translate(64, 64);
    for (let k = 0; k < 2; k++) {
      g.rotate(Math.PI / 4);
      const gr = g.createLinearGradient(-64, 0, 64, 0);
      gr.addColorStop(0, 'rgba(255,200,120,0)');
      gr.addColorStop(0.5, 'rgba(255,240,200,1)');
      gr.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = gr;
      g.fillRect(-64, -6, 128, 12);
      g.fillRect(-6, -64, 12, 128);
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    gr.addColorStop(0, 'rgba(255,255,230,1)');
    gr.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = gr;
    g.fillRect(-64, -64, 128, 128);
    T.flash = tex(c, { repeat: false });
  }
  // Vending machine front.
  {
    const [c, g] = canvas(256, 384);
    g.fillStyle = '#1a2a3a';
    g.fillRect(0, 0, 256, 384);
    g.fillStyle = '#c23a2a';
    g.fillRect(0, 0, 256, 60);
    g.fillStyle = '#fff';
    g.font = 'bold 34px sans-serif';
    g.fillText('FIZZ·O', 60, 44);
    const cols = ['#d33', '#3a6', '#36c', '#ea3', '#a3c', '#3cc'];
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 6; x++) {
        g.fillStyle = cols[(x + y * 2) % 6];
        g.fillRect(18 + x * 30, 80 + y * 52, 20, 40);
      }
    g.fillStyle = '#0a0a0a';
    g.fillRect(206, 90, 36, 180);
    g.fillRect(20, 340, 160, 30);
    T.vending = tex(c, { repeat: false });
  }
  // The terminal's screen.
  {
    const [c, g] = canvas(256, 192);
    g.fillStyle = '#04140c';
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#5dff9a';
    g.font = '13px monospace';
    ['KESTREL DEEP / HOLD C', '> NIGHT LOG  A.OKAFOR', '', '23:10 specimens restless', '00:42 crystal 4 brighter', '02:15 gate ctl down', '', '[E] READ'].forEach(
      (l, i) => g.fillText(l, 12, 24 + i * 20)
    );
    for (let y = 0; y < 192; y += 3) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, y, 256, 1);
    }
    T.screen = tex(c, { repeat: false });
  }
  // A grille for vents.
  {
    const [c, g] = canvas(128);
    g.fillStyle = '#3c3f42';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#0b0b0b';
    for (let y = 14; y < 118; y += 14) g.fillRect(12, y, 104, 7);
    g.strokeStyle = '#222';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 122);
    T.grille = tex(c, { repeat: false });
  }
  // Signs are made on demand.
  T.sign = (text, small) => {
    const [c, g] = canvas(512, 96);
    g.fillStyle = '#1c2a30';
    g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#d9a514';
    g.lineWidth = 6;
    g.strokeRect(4, 4, 504, 88);
    g.fillStyle = '#e8e4d8';
    g.font = `bold ${small ? 40 : 46}px "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 50);
    return tex(c, { repeat: false });
  };
  T.cross = (() => {
    const [c, g] = canvas(128);
    g.fillStyle = '#e9e9e4';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#c4221c';
    g.fillRect(48, 20, 32, 88);
    g.fillRect(20, 48, 88, 32);
    return tex(c, { repeat: false });
  })();
  return T;
}
