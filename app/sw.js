// Cindyland service worker.
// VERZIJA: mora se podići na SVAKOM deployu (zajedno sa APP_VERSION u index.html) —
// promjena ovog fajla je ono što browseru signalizira da postoji nova verzija.
const CACHE = 'cindyland-v1.0.5';

const ASSETS = [
  './',
  './index.html',
  './config.js',
  './supabase.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
];

// Instalacija: keširaj sve, ali NE preuzimaj kontrolu (prompt ponašanje kao K-Sport Hub —
// nova verzija čeka dok korisnik ne klikne "Osvježi i ažuriraj").
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

// Aktivacija: počisti stare keševe pa preuzmi otvorene kartice.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Kesh-prvo: app radi i bez interneta; novi sadržaj stiže tek kroz novu verziju SW-a.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});

// "Osvježi i ažuriraj" iz aplikacije šalje SKIP_WAITING → nova verzija odmah preuzima.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
