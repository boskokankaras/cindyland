// Cindyland service worker.
// VERZIJA: mora se podići na SVAKOM deployu (zajedno sa APP_VERSION u index.html i version.json).
// Promjena ovog fajla je ono što browseru signalizira da postoji nova verzija.
const CACHE = 'cindyland-v1.5.2';

// Samo ono bez čega app ne radi - instalacija mora biti BRZA (ikone se keširaju usput).
const CORE = [
  './',
  './index.html',
  './config.js',
  './supabase.js',
  './manifest.webmanifest',
];

// Instalacija: keširaj jezgro, ali NE preuzimaj kontrolu (nova verzija čeka
// dok korisnik ne klikne "Osvježi i ažuriraj").
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
});

// Aktivacija: počisti stare keševe pa preuzmi otvorene kartice.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Kesh-prvo (app radi i bez interneta), a sve ostalo ulazi u kesh pri prvom korišćenju.
// version.json NIKAD ne ide u keš - po njemu app zna da li na serveru stoji novija verzija.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return;   // uvijek sa mreže
  if (req.mode === 'navigate'){
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic'){
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});

// "Osvježi i ažuriraj" iz aplikacije šalje SKIP_WAITING → nova verzija odmah preuzima.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
