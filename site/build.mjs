// Builds the games site into _site/: the gallery page plus each game's playable folder at /<slug>/.
//   node site/build.mjs            (checks every game.json, then builds)
//   node site/build.mjs --check    (checks only)
// No dependencies: Node 18+.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = path.join(root, 'games');
const out = path.join(root, '_site');
const REPO = 'The-Low-Code-Foundation/nodegx-gaming';
const DOMAIN = 'games.nodegx.io';
const checkOnly = process.argv.includes('--check');

const REQUIRED = ['slug', 'title', 'tagline', 'category', 'kind', 'play', 'readiness', 'readinessNote', 'buildYourOwn', 'controls', 'devices', 'licence'];
const CATEGORIES = ['educational', 'casual'];
const KINDS = ['static', 'nodegx'];
const READINESS = {
  A: { label: 'Build levels today', hint: 'Content is data: add levels without touching the engine.' },
  B: { label: 'Playable', hint: 'Plays end to end; levels live in code, so a level format comes first.' },
  C: { label: 'Prototype', hint: 'A slice or a toy: finish the game loop before building levels.' }
};
const DEVICE_LABEL = { desktop: 'Desktop', phone: 'Phone', tablet: 'Tablet', tv: 'TV' };

const problems = [];
const games = [];
for (const slug of fs.readdirSync(gamesDir).sort()) {
  const dir = path.join(gamesDir, slug);
  if (!fs.statSync(dir).isDirectory()) continue;
  const file = path.join(dir, 'game.json');
  if (!fs.existsSync(file)) { problems.push(`${slug}: no game.json`); continue; }
  let g;
  try { g = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { problems.push(`${slug}: game.json is not JSON (${e.message})`); continue; }
  if (g.hidden) continue;
  for (const k of REQUIRED) if (g[k] === undefined || g[k] === '') problems.push(`${slug}: game.json misses "${k}"`);
  if (g.slug !== slug) problems.push(`${slug}: game.json slug "${g.slug}" is not the folder name`);
  if (!CATEGORIES.includes(g.category)) problems.push(`${slug}: category must be one of ${CATEGORIES.join(', ')}`);
  if (!KINDS.includes(g.kind)) problems.push(`${slug}: kind must be one of ${KINDS.join(', ')}`);
  if (!READINESS[g.readiness]) problems.push(`${slug}: readiness must be A, B or C`);
  if (!fs.existsSync(path.join(dir, g.play ?? ''))) problems.push(`${slug}: play page "${g.play}" does not exist`);
  for (const f of ['README.md', 'CLAUDE.md', 'CREDITS.md', 'thumb.jpg']) if (!fs.existsSync(path.join(dir, f))) problems.push(`${slug}: no ${f}`);
  games.push({ ...g, dir });
}
if (problems.length) {
  console.error(`${problems.length} problem(s):\n  ` + problems.join('\n  '));
  process.exit(1);
}
console.log(`${games.length} games checked`);
if (checkOnly) process.exit(0);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'thumbs'), { recursive: true });
const SKIP_NAMES = new Set(['.DS_Store', 'node_modules', '.git']);
for (const g of games) {
  // The playable folder: a static game is its folder; a NodeGX game is the folder holding its play page (built with
  // --base-url /<slug>/, so it must land at exactly /<slug>/).
  const src = g.kind === 'static' ? g.dir : path.join(g.dir, path.dirname(g.play));
  fs.cpSync(src, path.join(out, g.slug), { recursive: true, filter: (p) => !SKIP_NAMES.has(path.basename(p)) });
  fs.copyFileSync(path.join(g.dir, 'thumb.jpg'), path.join(out, 'thumbs', `${g.slug}.jpg`));
  const page = g.kind === 'static' ? g.play : path.basename(g.play);
  g.url = `${g.slug}/${page === 'index.html' ? '' : page}`;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const card = (g) => {
  const r = READINESS[g.readiness];
  const clone = `npx tiged ${REPO}/games/${g.slug} my-${g.slug}`;
  return `
      <article class="card" data-category="${g.category}">
        <a class="thumb" href="${esc(g.url)}" aria-label="Play ${esc(g.title)}"><img src="thumbs/${g.slug}.jpg" alt="" loading="lazy" width="640" height="360" /></a>
        <div class="body">
          <div class="meta">
            <span class="badge r${g.readiness}" title="${esc(r.hint)}">${g.readiness} · ${r.label}</span>
            ${g.kind === 'nodegx' ? '<span class="badge nodegx" title="Built in NodeGX: open project/ in the editor">NodeGX project</span>' : ''}
          </div>
          <h3>${esc(g.title)}</h3>
          <p class="tagline">${esc(g.tagline)}</p>
          <p class="note">${esc(g.readinessNote)}</p>
          <dl>
            <div><dt>Build your own</dt><dd>${esc(g.buildYourOwn)}</dd></div>
            <div><dt>Controls</dt><dd>${esc(g.controls)}</dd></div>
            <div><dt>Plays on</dt><dd>${g.devices.map((d) => DEVICE_LABEL[d] ?? esc(d)).join(', ')}${g.languages?.length ? ` · ${g.languages.map(esc).join(', ').toUpperCase()}` : ''}</dd></div>
          </dl>
          <div class="actions">
            <a class="btn play" href="${esc(g.url)}">Play</a>
            <a class="btn" href="https://github.com/${REPO}/tree/main/games/${g.slug}">Source</a>
          </div>
          <div class="clone">
            <code>${esc(clone)}</code>
            <button type="button" data-copy="${esc(clone)}" aria-label="Copy the clone command for ${esc(g.title)}">Copy</button>
          </div>
        </div>
      </article>`;
};
const section = (cat, title, blurb) => {
  const list = games.filter((g) => g.category === cat).sort((a, b) => a.readiness.localeCompare(b.readiness) || a.title.localeCompare(b.title));
  if (!list.length) return '';
  return `
    <section class="shelf" id="${cat}" data-category="${cat}">
      <header><h2>${title}</h2><p>${blurb}</p></header>
      <div class="grid">${list.map(card).join('')}
      </div>
    </section>`;
};

const template = fs.readFileSync(path.join(root, 'site', 'template.html'), 'utf8');
const html = template
  .replace('<!--COUNT-->', String(games.length))
  .replace('<!--SHELVES-->',
    section('educational', 'Educational', 'Games that teach something while you play: maths, coding, history, biology.') +
    section('casual', 'Casual', 'Games to play for fun, and engines to build your own on.'));
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'CNAME'), DOMAIN + '\n');
fs.writeFileSync(path.join(out, '.nojekyll'), '');

let bytes = 0, files = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : ((bytes += fs.statSync(path.join(d, e.name)).size), files++)));
walk(out);
console.log(`_site: ${files} files, ${(bytes / 1048576).toFixed(1)} MB`);
