// Posters and notices aboard, printed on one lit atlas (`C.paper`), and the wall screens.

import * as THREE from 'three';
import { at, mulberry } from '../../util.mjs';
import { SignAtlas } from '../../decor.mjs';

// --- paper: posters and notices, on a lit atlas ----------------------------------------------------------------------

/** An atlas whose pages are lit like paint (Lambert), not glowing like the signs. */
class PaperAtlas extends SignAtlas {
  newPage() {
    super.newPage();
    this.page.material = new THREE.MeshLambertMaterial({ map: this.page.tex });
  }
}
const paper = (C) => (C.paper ??= new PaperAtlas(2048));

const F = (size, weight = 600) => `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`;
export const MONO = (size, weight = 600) => `${weight} ${size}px ui-monospace, Menlo, monospace`;
export function text(g, s, x, y, font, color, align = 'left', maxW = Infinity) {
  g.font = font;
  const wide = g.measureText(s).width;
  if (wide > maxW) g.font = font.replace(/([\d.]+)px/, (m, n) => `${(n * maxW) / wide}px`);
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}
function wrap(g, s, x, y, maxW, lh, font, color) {
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'left';
  g.textBaseline = 'top';
  let line = '';
  for (const word of s.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > maxW && line) {
      g.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = t;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}

/** The posters aboard: a safety notice or a word from the ship, each a picture drawn in its cell. */
const POSTERS = {
  burn(g, w, h) {
    g.fillStyle = '#e8e2d2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e0b020';
    g.fillRect(0, 0, w, h * 0.2);
    for (let x = -h; x < w; x += 28) {
      g.fillStyle = '#1a1a1a';
      g.beginPath();
      g.moveTo(x, h * 0.2);
      g.lineTo(x + 14, h * 0.2);
      g.lineTo(x + 14 + 10, h * 0.2 + 10);
      g.lineTo(x + 10, h * 0.2 + 10);
      g.fill();
    }
    text(g, 'SECURE FOR BURN', w / 2, h * 0.1, F(h * 0.09, 800), '#1a1a1a', 'center', w * 0.9);
    // a figure strapped into a couch
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = w * 0.025;
    g.lineCap = 'round';
    const cx = w * 0.5, cy = h * 0.52;
    g.beginPath();
    g.moveTo(cx - w * 0.25, cy + h * 0.12);
    g.lineTo(cx + w * 0.05, cy + h * 0.12);
    g.lineTo(cx + w * 0.2, cy - h * 0.12);
    g.stroke();
    g.fillStyle = '#c03020';
    g.beginPath();
    g.arc(cx + w * 0.2, cy - h * 0.17, w * 0.05, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c03020';
    g.beginPath();
    g.moveTo(cx + w * 0.17, cy - h * 0.1);
    g.lineTo(cx + w * 0.02, cy + h * 0.08);
    g.lineTo(cx - w * 0.18, cy + h * 0.08);
    g.stroke();
    g.strokeStyle = '#e0b020';
    g.lineWidth = w * 0.015;
    g.beginPath();
    g.moveTo(cx + w * 0.12, cy - h * 0.1);
    g.lineTo(cx - w * 0.02, cy + h * 0.06);
    g.stroke();
    wrap(g, 'When the burn is called, get to a couch, strap in, and stay in until the drive is secured. Nothing loose: at three g a dropped mug weighs as much as a brick.', w * 0.08, h * 0.72, w * 0.84, h * 0.045, F(h * 0.034, 500), '#222');
  },
  suit(g, w, h) {
    g.fillStyle = '#1d2a36';
    g.fillRect(0, 0, w, h);
    text(g, 'IS YOUR SUIT', w / 2, h * 0.1, F(h * 0.075, 800), '#f0f0f0', 'center', w * 0.9);
    text(g, 'READY?', w / 2, h * 0.19, F(h * 0.11, 900), '#ffb347', 'center', w * 0.9);
    g.strokeStyle = '#f0f0f0';
    g.lineWidth = w * 0.02;
    g.beginPath();
    g.arc(w / 2, h * 0.42, w * 0.18, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(120,180,230,0.45)';
    g.beginPath();
    g.ellipse(w / 2, h * 0.43, w * 0.12, w * 0.08, 0, 0, Math.PI * 2);
    g.fill();
    const items = ['Bottles full', 'Seals checked', 'Helmet on its clip', 'Radio on the ship channel'];
    items.forEach((s, i) => {
      g.strokeStyle = '#39d27a';
      g.lineWidth = 3;
      g.strokeRect(w * 0.12, h * (0.63 + i * 0.075) - h * 0.02, h * 0.04, h * 0.04);
      text(g, s, w * 0.12 + h * 0.06, h * (0.63 + i * 0.075), F(h * 0.036, 500), '#e8e8e8');
    });
  },
  breach(g, w, h) {
    g.fillStyle = '#121518';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c0c4c8';
    g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    text(g, 'THIS SHIP HAS GONE', w / 2, h * 0.17, F(h * 0.1, 700), '#d8dce0', 'center', w * 0.9);
    g.fillStyle = '#05080a';
    g.fillRect(w * 0.36, h * 0.3, w * 0.28, h * 0.38);
    text(g, '0', w / 2, h * 0.5, MONO(h * 0.34, 700), '#ff5a3a', 'center', w * 0.9);
    text(g, 'DAYS WITHOUT A HULL BREACH', w / 2, h * 0.83, F(h * 0.09, 700), '#d8dce0', 'center', w * 0.9);
  },
  quiet(g, w, h) {
    g.fillStyle = '#2b2440';
    g.fillRect(0, 0, w, h);
    text(g, 'WATCH BELOW', w / 2, h * 0.32, F(h * 0.22, 800), '#e8e0ff', 'center', w * 0.9);
    text(g, 'SLEEPING', w / 2, h * 0.6, F(h * 0.22, 800), '#b48cff', 'center', w * 0.9);
    text(g, 'Keep it down. Your turn is coming.', w / 2, h * 0.85, F(h * 0.1, 500), '#c8c0e0', 'center', w * 0.9);
  },
  loose(g, w, h) {
    g.fillStyle = '#e8e2d2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#b02a20';
    g.fillRect(0, 0, w, h * 0.3);
    text(g, 'LOOSE KIT KILLS', w / 2, h * 0.15, F(h * 0.13, 900), '#fff', 'center', w * 0.9);
    wrap(g, 'Stow it or lose it. A wrench left on a bench is a round fired across the room the first time she turns hard.', w * 0.07, h * 0.4, w * 0.86, h * 0.1, F(h * 0.075, 500), '#222');
  },
  menu(g, w, h) {
    g.fillStyle = '#1c1f1c';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6a5a3a';
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
    text(g, 'TODAY', w / 2, h * 0.11, F(h * 0.08, 800), '#f0e6c8', 'center', w * 0.9);
    const lines = [['BREAKFAST', 'Oats · eggs (real) · toast'], ['DINNER', 'Protein loaf · greens from hydro'], ['', 'Rice · gravy'], ['SUPPER', 'Soup · bread · cheese'], ['ALWAYS', 'Coffee. Lots of it.']];
    lines.forEach(([a, b], i) => {
      text(g, a, w * 0.08, h * (0.26 + i * 0.14), F(h * 0.045, 700), '#e0b060');
      text(g, b, w * 0.08, h * (0.32 + i * 0.14), F(h * 0.045, 500), '#e8e8e0');
    });
  },
  crest(g, w, h) {
    g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
    g.fillStyle = '#1a2a44';
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c8a24a';
    g.lineWidth = R * 0.06;
    g.beginPath();
    g.arc(cx, cy, R * 0.94, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = R * 0.02;
    g.beginPath();
    g.arc(cx, cy, R * 0.72, 0, Math.PI * 2);
    g.stroke();
    // a carrier in plan, bow up, with a fighter leaving her
    g.fillStyle = '#d8dce2';
    g.beginPath();
    g.moveTo(cx, cy - R * 0.55);
    g.lineTo(cx + R * 0.16, cy - R * 0.2);
    g.lineTo(cx + R * 0.16, cy + R * 0.5);
    g.lineTo(cx - R * 0.16, cy + R * 0.5);
    g.lineTo(cx - R * 0.16, cy - R * 0.2);
    g.closePath();
    g.fill();
    g.fillStyle = '#c8a24a';
    g.beginPath();
    g.moveTo(cx + R * 0.36, cy - R * 0.36);
    g.lineTo(cx + R * 0.44, cy - R * 0.14);
    g.lineTo(cx + R * 0.28, cy - R * 0.14);
    g.fill();
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + ((i - 3) * Math.PI) / 9;
      g.beginPath();
      g.arc(cx + Math.cos(a) * R * 0.83, cy + Math.sin(a) * R * 0.83, R * 0.03, 0, Math.PI * 2);
      g.fill();
    }
    g.save();
    g.translate(cx, cy);
    g.font = F(R * 0.12, 800);
    g.fillStyle = '#c8a24a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const words = 'EVERY HAND · EVERY WATCH';
    const span = Math.PI * 0.7;
    [...words].forEach((ch, i) => {
      const a = Math.PI / 2 + span / 2 - (span * i) / (words.length - 1);
      g.save();
      g.rotate(a);
      g.translate(R * 0.83, 0);
      g.rotate(-Math.PI / 2);
      g.fillText(ch, 0, 0);
      g.restore();
    });
    g.restore();
  },
  board(g, w, h, seed = 3) {
    const r = mulberry(seed);
    g.fillStyle = '#6a5640';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#8a7054';
    g.fillRect(8, 8, w - 16, h - 16);
    for (let i = 0; i < 9; i++) {
      const pw = w * (0.18 + r() * 0.1), ph = h * (0.22 + r() * 0.15);
      const x = 14 + r() * (w - pw - 28), y = 14 + r() * (h - ph - 28);
      g.save();
      g.translate(x + pw / 2, y + ph / 2);
      g.rotate((r() - 0.5) * 0.12);
      g.fillStyle = ['#f2efe6', '#f4e8a0', '#e6eef4', '#f2efe6'][Math.floor(r() * 4)];
      g.fillRect(-pw / 2, -ph / 2, pw, ph);
      g.fillStyle = 'rgba(40,40,40,0.6)';
      for (let k = 0; k < 6; k++) g.fillRect(-pw / 2 + 6, -ph / 2 + 10 + k * (ph / 8), pw * (0.4 + r() * 0.45), 2);
      g.fillStyle = ['#c0302a', '#2a6ac0', '#2a9a4a'][Math.floor(r() * 3)];
      g.beginPath();
      g.arc(0, -ph / 2 + 4, 3, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  },
  cross(g, w, h) {
    g.fillStyle = '#f2f4f6';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2aa070';
    const t = w * 0.26;
    g.fillRect((w - t) / 2, h * 0.08, t, h * 0.62);
    g.fillRect(w * 0.13, h * 0.08 + (h * 0.62 - t) / 2, w * 0.74, t);
    text(g, 'SICK BAY', w / 2, h * 0.86, F(h * 0.11, 800), '#1d6a4a', 'center', w * 0.9);
  },
  triage(g, w, h) {
    g.fillStyle = '#f2f4f6';
    g.fillRect(0, 0, w, h);
    text(g, 'TRIAGE', w * 0.06, h * 0.1, F(h * 0.08, 800), '#222');
    const rows = [['#c0302a', 'IMMEDIATE', 'Airway · bleeding · decompression'], ['#e0a020', 'URGENT', 'Burns · fractures · g injury'], ['#2a9a4a', 'DELAYED', 'Walking wounded'], ['#202020', 'EXPECTANT', '']];
    rows.forEach(([c, a, b], i) => {
      const y = h * (0.24 + i * 0.18);
      g.fillStyle = c;
      g.fillRect(w * 0.06, y, w * 0.12, h * 0.12);
      text(g, a, w * 0.22, y + h * 0.035, F(h * 0.05, 700), '#222');
      text(g, b, w * 0.22, y + h * 0.09, F(h * 0.036, 500), '#444');
    });
  },
  hangar(g, w, h) {
    g.clearRect(0, 0, w, h);
    text(g, 'HANGAR ONE', w / 2, h * 0.42, F(h * 0.62, 900), 'rgba(230,232,236,0.92)', 'center', w * 0.9);
    g.fillStyle = 'rgba(232,184,48,0.95)';
    g.fillRect(w * 0.08, h * 0.86, w * 0.84, h * 0.08);
  },
  clear(g, w, h) {
    g.fillStyle = '#e8b830';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#141414';
    g.fillRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
    text(g, 'STAND CLEAR OF THE BAY WHEN THE DOORS MOVE', w / 2, h / 2, F(h * 0.36, 800), '#e8b830', 'center', w * 0.9);
  },
  fod(g, w, h) {
    g.fillStyle = '#e8e2d2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a3a6a';
    g.fillRect(0, 0, w, h * 0.28);
    text(g, 'FOD WALK', w / 2, h * 0.14, F(h * 0.14, 900), '#fff', 'center', w * 0.9);
    wrap(g, 'Before any launch, every hand on deck walks the lane, shoulder to shoulder. A bolt in the lane goes out the bay at forty metres a second.', w * 0.07, h * 0.36, w * 0.86, h * 0.1, F(h * 0.068, 500), '#222');
  }
};
/** A poster `kind`, `w` × `h` metres, on a wall at (x, y over the deck, z), facing `ry`. */
export function poster(C, I, kind, w, h, x, y, z, ry, opts) {
  const m = paper(C).plane(w, h, (g, pw, ph) => POSTERS[kind](g, pw, ph, opts), 260);
  I.group.add(at(m, x, I.floorY + y, z, 0, ry, 0));
  mark(I, x, z, w);
  return m;
}
/** Something flat on a wall at (x, z), `w` wide: `dressRoom` puts no frame across it. */
export function mark(I, x, z, w) {
  (I.onWalls ??= []).push({ x, z, w });
}
/** A screen on a wall (`Interior.screen`), marked so no frame stands across it. */
export function wallScreen(I, kind, x, y, z, ry, color, w, h) {
  mark(I, x, z, w);
  return I.screen(kind, x, y, z, ry, color, w, h);
}
