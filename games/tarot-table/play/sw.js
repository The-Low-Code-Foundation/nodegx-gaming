// Written by pwa/install.mjs; rebuilt with every build. Keeps this build's files for offline use.
const CACHE = 'tarot-table-dc447df67661';
const FILES = [
  "./",
  "NODEGX-LICENSE.txt",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "index-0a96e92ce435d842.js",
  "index.html",
  "load_terminator.js",
  "manifest.webmanifest",
  "nodegx-config.json",
  "noodl-app.png",
  "noodl.deploy.js",
  "noodl.deploy.js.LICENSE.txt",
  "noodl_bundles/b1-f2ce60e2c9ef80df.json",
  "noodl_bundles/b2-a62ff489a28aed45.json",
  "noodl_bundles/b3-cd80f23c54fb5108.json",
  "noodl_bundles/b4-c7f30f83cbb78b24.json",
  "noodl_modules/inter/Inter-Bold.woff2",
  "noodl_modules/inter/Inter-Medium.woff2",
  "noodl_modules/inter/Inter-Regular.woff2",
  "noodl_modules/inter/Inter-SemiBold.woff2",
  "noodl_modules/inter/LICENSE.txt",
  "noodl_modules/inter/manifest.json",
  "noodl_modules/inter/styles.css",
  "react-dom.production.min.js",
  "react.production.min.js"
];

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
