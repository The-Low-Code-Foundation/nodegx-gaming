// Turns a NodeGX web build into an installable, offline app (a PWA).
//
//   node pwa/install.mjs play
//
// Run it after every `nodegx-deploy` into play/. It:
//   1. copies the manifest and icons into the build,
//   2. adds the install tags to index.html (manifest, icons, theme colour, the dark page behind the app),
//   3. writes sw.js, a service worker that keeps every file of this build for offline use.
// The cache is named after a hash of the build, so a new build replaces the old one on the next visit.
// Everything is relative, so the same step works whatever --base-url the build was made with.
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const play = process.argv[2];
if (!play) {
  console.error('usage: node pwa/install.mjs <build folder>');
  process.exit(1);
}

for (const f of ['manifest.json', 'icon-192.png', 'icon-512.png', 'icon-180.png']) {
  copyFileSync(join(here, f), join(play, f));
}

const MARK = '<!-- pwa -->';
const head = `${MARK}
    <link rel="manifest" href="manifest.json" />
    <link rel="apple-touch-icon" href="icon-180.png" />
    <link rel="icon" type="image/png" href="icon-192.png" />
    <meta name="theme-color" content="#14112a" />
    <meta name="apple-mobile-web-app-title" content="Tarot" />
    <style>html, body { background-color: #14112a !important; }</style>
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(function () {});
        });
      }
    </script>
  `;
const indexPath = join(play, 'index.html');
let html = readFileSync(indexPath, 'utf8');
if (!html.includes(MARK)) {
  html = html.replace('</head>', head + '</head>');
  writeFileSync(indexPath, html);
}

// Every file the app can ask for, minus the build's own notes and its local test server.
const skip = new Set(['DEPLOY.md', 'serve.js', 'package.json', 'sw.js']);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!skip.has(relative(play, p))) files.push(relative(play, p).split('\\').join('/'));
  }
})(play);

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(play, f)));
const version = hash.digest('hex').slice(0, 12);

const sw = `// Written by pwa/install.mjs; rebuilt with every build. Keeps this build's files for offline use.
const CACHE = 'tarot-table-${version}';
const FILES = ${JSON.stringify(['./', ...files], null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tarot-table-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // The page itself: the newest from the network when there is one, the kept copy when there isn't.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }))
  );
});
`;
writeFileSync(join(play, 'sw.js'), sw);
console.log(`pwa: ${files.length} files kept offline, cache tarot-table-${version}`);
