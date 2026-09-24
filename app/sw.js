// Cindyland service worker.
// VERZIJA: mora se podići na SVAKOM deployu (zajedno sa APP_VERSION u index.html i version.json).
// Promjena ovog fajla je ono što browseru signalizira da postoji nova verzija.
const CACHE = 'cindyland-v1.18.0';

// Slike ljubimaca (Supabase storage) žive u SVOM kešu koji preživljava nove verzije aplikacije:
// adresa slike nosi ?v=<vrijeme slanja>, pa je ista adresa uvijek ista slika - smije se čuvati zauvijek.
// Isto ime koristi i aplikacija (KES_SLIKE u index.html) kad upravo poslatu sliku odmah stavi u keš.
const SLIKE = 'cindyland-slike';
const SLIKE_PUT = '/storage/v1/object/public/slike/';

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

// Aktivacija: počisti stare keševe (ali ne slike) pa preuzmi otvorene kartice.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SLIKE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Kesh-prvo (app radi i bez interneta), a sve ostalo ulazi u kesh pri prvom korišćenju.
// version.json NIKAD ne ide u keš - po njemu app zna da li na serveru stoji novija verzija.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin){
    // slike ljubimaca sa storage servera: keš-prvo, zauvijek (adresa je verzionisana);
    // ako nešto u kešu pukne, browser sam skida sliku kao da workera nema
    if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith(SLIKE_PUT)) e.respondWith(slika(req, e).catch(() => fetch(req)));
    return;
  }
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

// Slika ljubimca: iz keša ako je tu, inače sa mreže pa u keš.
// Mala slika (…_s.jpg) za stare upise još ne postoji (aplikacija ih pravi u pozadini) - umjesto nje
// ide velika. Velika se pamti pod SVOJIM imenom, ne pod imenom male: kad mala jednom nastane, i ona
// ulazi u keš, a do tada je jedan kratak odgovor „nema" sa servera jedini trošak.
async function slika(req, e){
  const c = await caches.open(SLIKE);
  const hit = await c.match(req.url);
  if (hit) return hit;
  const url = req.url;
  // upis u keš drži worker živim dok ne završi (iOS ga inače gasi čim odgovor ode)
  const upisi = (k, r) => e.waitUntil(c.put(k, r.clone()).catch(() => {}));
  const res = await saMreze(url);
  if (res && res.ok){ upisi(url, res); return res; }
  if (/_s\.jpg(\?|$)/.test(url)){
    const velika = url.replace(/_s\.jpg(\?|$)/, '.jpg$1');
    const hit2 = await c.match(velika);
    if (hit2) return hit2;
    const r2 = await saMreze(velika);
    if (r2 && r2.ok){ upisi(velika, r2); return r2; }
    if (r2) return r2;
  }
  return res || fetch(req);   // nema ni mreže ni keša - neka browser pokuša sam (i javi grešku kao i inače)
}
// CORS zahtjev umjesto „opaque": samo tako vidimo da li je odgovor uspio, pa keš ne raste u prazno
// (storage vraća access-control-allow-origin: *). Bez mreže vraća null.
function saMreze(url){
  return fetch(new Request(url, { mode: 'cors', credentials: 'omit' })).catch(() => null);
}

// "Osvježi i ažuriraj" iz aplikacije šalje SKIP_WAITING → nova verzija odmah preuzima.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
