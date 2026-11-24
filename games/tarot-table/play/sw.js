// Written by pwa/install.mjs; rebuilt with every build. Keeps this build's files for offline use.
const CACHE = 'tarot-table-206f403d093d';
const FILES = [
  "./",
  "NODEGX-LICENSE.txt",
  "cards/back.svg",
  "cards/cups-01.svg",
  "cards/cups-02.svg",
  "cards/cups-03.svg",
  "cards/cups-04.svg",
  "cards/cups-05.svg",
  "cards/cups-06.svg",
  "cards/cups-07.svg",
  "cards/cups-08.svg",
  "cards/cups-09.svg",
  "cards/cups-10.svg",
  "cards/cups-11.svg",
  "cards/cups-12.svg",
  "cards/cups-13.svg",
  "cards/cups-14.svg",
  "cards/major-00.svg",
  "cards/major-01.svg",
  "cards/major-02.svg",
  "cards/major-03.svg",
  "cards/major-04.svg",
  "cards/major-05.svg",
  "cards/major-06.svg",
  "cards/major-07.svg",
  "cards/major-08.svg",
  "cards/major-09.svg",
  "cards/major-10.svg",
  "cards/major-11.svg",
  "cards/major-12.svg",
  "cards/major-13.svg",
  "cards/major-14.svg",
  "cards/major-15.svg",
  "cards/major-16.svg",
  "cards/major-17.svg",
  "cards/major-18.svg",
  "cards/major-19.svg",
  "cards/major-20.svg",
  "cards/major-21.svg",
  "cards/pentacles-01.svg",
  "cards/pentacles-02.svg",
  "cards/pentacles-03.svg",
  "cards/pentacles-04.svg",
  "cards/pentacles-05.svg",
  "cards/pentacles-06.svg",
  "cards/pentacles-07.svg",
  "cards/pentacles-08.svg",
  "cards/pentacles-09.svg",
  "cards/pentacles-10.svg",
  "cards/pentacles-11.svg",
  "cards/pentacles-12.svg",
  "cards/pentacles-13.svg",
  "cards/pentacles-14.svg",
  "cards/swords-01.svg",
  "cards/swords-02.svg",
  "cards/swords-03.svg",
  "cards/swords-04.svg",
  "cards/swords-05.svg",
  "cards/swords-06.svg",
  "cards/swords-07.svg",
  "cards/swords-08.svg",
  "cards/swords-09.svg",
  "cards/swords-10.svg",
  "cards/swords-11.svg",
  "cards/swords-12.svg",
  "cards/swords-13.svg",
  "cards/swords-14.svg",
  "cards/wands-01.svg",
  "cards/wands-02.svg",
  "cards/wands-03.svg",
  "cards/wands-04.svg",
  "cards/wands-05.svg",
  "cards/wands-06.svg",
  "cards/wands-07.svg",
  "cards/wands-08.svg",
  "cards/wands-09.svg",
  "cards/wands-10.svg",
  "cards/wands-11.svg",
  "cards/wands-12.svg",
  "cards/wands-13.svg",
  "cards/wands-14.svg",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "index-040c287995568811.js",
  "index.html",
  "load_terminator.js",
  "manifest.json",
  "nodegx-config.json",
  "noodl-app.png",
  "noodl.deploy.js",
  "noodl.deploy.js.LICENSE.txt",
  "noodl_bundles/b1-f2ce60e2c9ef80df.json",
  "noodl_bundles/b2-c8f32667e74ad7c2.json",
  "noodl_bundles/b3-3a76a256e963514a.json",
  "noodl_bundles/b4-22d28c4a2916ac24.json",
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
