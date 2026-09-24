/* Provjera slika ljubimaca (v1.18.0): PRAVI kod iz app/sw.js i app/index.html nad lažnim serverom,
   kešom i storage-om. Pokretanje: node scratchpad/harness_slike.mjs */
import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const OVDJE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(OVDJE, '..');
const html = fs.readFileSync(path.join(REPO, 'app/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(REPO, 'app/sw.js'), 'utf8');
const blokovi = (html.match(/<script>([\s\S]*?)<\/script>/g) || []).map(b => b.replace(/^<script>|<\/script>$/g, ''));
const blokSlike = blokovi.find(b => b.includes('SLIKA LJUBIMCA'));
const blokDb = blokovi.find(b => b.includes('SUPABASE sloj'));
const b0 = blokovi[0];
const fotoKod = b0.slice(b0.indexOf('const fotoMala'), b0.indexOf('function groupAvatar'));
if (!blokSlike || !blokDb || !fotoKod.includes('function fotoImg')) throw new Error('nisu nadjeni blokovi');

let pao = 0, prosli = 0;
function ok(uslov, opis){ if (uslov){ prosli++; console.log('  OK  ' + opis); } else { pao++; console.log('  PAO ' + opis); } }
const eq = (a, b, opis) => ok(JSON.stringify(a) === JSON.stringify(b), opis + ' -> ' + JSON.stringify(a));
const SB = 'https://ggcvkeltmarcxlmaczmf.supabase.co/storage/v1/object/public/slike/';
const putanja = url => (String(url).match(/\/public\/slike\/([^?]+)/) || [])[1];
const cekaj = ms => new Promise(r => setTimeout(r, ms));

/* ---------- lažni keš (kao Cache Storage: match vraća kopiju) ---------- */
function laznaKesMemorija(){
  const stores = new Map();
  const otvori = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    const key = k => typeof k === 'string' ? k : k.url;
    return { match: async k => { const r = m.get(key(k)); return r ? r.clone() : undefined; },
             put: async (k, r) => { m.set(key(k), r); }, keys: async () => [...m.keys()].map(u => new Request(u)),
             delete: async k => m.delete(key(k)), addAll: async () => {} };
  };
  const deleted = [];
  return { stores, deleted, caches: { open: async n => otvori(n), keys: async () => [...stores.keys()],
    delete: async n => { deleted.push(n); return stores.delete(n); },
    match: async k => { for (const m of stores.values()){ const kk = typeof k === 'string' ? k : k.url; if (m.has(kk)) return m.get(kk).clone(); } } } };
}

/* ================= SERVICE WORKER ================= */
function swOkvir(server){
  const handlers = {};
  const kes = laznaKesMemorija();
  const net = [];
  const st = { offline: false };
  const fetch = async (r) => {
    const url = typeof r === 'string' ? r : r.url; net.push(url);
    if (st.offline) throw new TypeError('offline');
    const p = putanja(url);
    if (!p) return new Response('drugo', { status: 200 });
    if (!server.has(p)) return new Response('{"statusCode":"404","error":"not_found"}', { status: 400 });
    return new Response(server.get(p), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  const ctx = { caches: kes.caches, fetch, Request, Response, URL, console, Promise, Map, Set, Array, Object, JSON, RegExp, String,
    location: { origin: 'https://cindyland.netlify.app' }, clients: { claim: async () => {} }, skipWaiting(){},
    addEventListener(t, f){ handlers[t] = f; } };
  ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx); vm.runInContext(sw, ctx);
  const o = { net, st, kes, handlers, server, zadnji: null };
  o.run = async (url) => {
    const e = { request: new Request(url), p: undefined, cekano: [], respondWith(p){ this.p = p; }, waitUntil(p){ this.cekano.push(p); } };
    handlers.fetch(e); o.zadnji = e;
    if (!e.p) return undefined;
    const r = await e.p; await Promise.all(e.cekano); return r;
  };
  return o;
}
console.log('\n== service worker: slike ljubimaca ==');
{
  const server = new Map([['pets/p1.jpg', 'VELIKA-1'], ['pets/p2.jpg', 'VELIKA-2'], ['pets/p2_s.jpg', 'MALA-2']]);
  const o = swOkvir(server);
  const U1s = SB + 'pets/p1_s.jpg?v=111', U1 = SB + 'pets/p1.jpg?v=111', U2s = SB + 'pets/p2_s.jpg?v=222';
  let r = await o.run(U1s);
  eq(await r.text(), 'VELIKA-1', 'S1 mala ne postoji -> stiže velika');
  eq(o.net, [U1s, U1], 'S1 mreža: pokušana mala pa velika');
  const slike = () => [...(o.kes.stores.get('cindyland-slike') || new Map()).keys()].map(putanja).sort();
  eq(slike(), ['pets/p1.jpg'], 'S1 u kešu samo velika, pod svojim imenom');
  ok(o.zadnji.cekano.length === 1, 'S1 upis u keš je vezan za događaj (waitUntil)');
  o.net.length = 0;
  r = await o.run(U1s);
  eq(await r.text(), 'VELIKA-1', 'S2 ponovo mala -> velika iz keša');
  eq(o.net, [U1s], 'S2 mreža: samo kratki „nema" za malu, velika ne ide na mrežu');
  o.net.length = 0;
  r = await o.run(U1);
  eq(await r.text(), 'VELIKA-1', 'S3 velika direktno -> iz keša');
  eq(o.net, [], 'S3 bez mreže');
  r = await o.run(U2s);
  eq(await r.text(), 'MALA-2', 'S4 mala postoji -> mala');
  eq(slike(), ['pets/p1.jpg', 'pets/p2_s.jpg'], 'S4 mala ušla u keš');
  o.net.length = 0;
  r = await o.run(U2s);
  eq(o.net, [], 'S5 mala drugi put iz keša, bez mreže');
  server.set('pets/p1_s.jpg', 'MALA-1'); o.net.length = 0;
  r = await o.run(U1s);
  eq(await r.text(), 'MALA-1', 'S6 kad mala nastane, uzima se ona (a ne velika iz keša)');
  eq(slike(), ['pets/p1.jpg', 'pets/p1_s.jpg', 'pets/p2_s.jpg'], 'S6 i ona ulazi u keš');
  o.st.offline = true; o.net.length = 0;
  const U3s = SB + 'pets/p3_s.jpg?v=333', U3 = SB + 'pets/p3.jpg?v=333';
  const kesS = await o.kes.caches.open('cindyland-slike'); await kesS.put(U3, new Response('VELIKA-3'));
  r = await o.run(U3s);
  eq(await r.text(), 'VELIKA-3', 'S7 bez mreže: mala nije u kešu, velika jeste -> velika');
  const ishod = await o.run(SB + 'pets/p9_s.jpg?v=9').then(() => 'odgovor', () => 'greska');
  eq(ishod, 'greska', 'S8 bez mreže i bez keša -> mrežna greška (slika javi error kao i ranije)');
  o.st.offline = false;
  r = await o.run('https://ggcvkeltmarcxlmaczmf.supabase.co/rest/v1/pets?select=*');
  ok(r === undefined, 'S9 REST zahtjevi ka Supabase-u se ne presreću');
  r = await o.run('https://cindyland.netlify.app/version.json?t=1');
  ok(r === undefined, 'S10 version.json se ne presreće');
  r = await o.run('https://drugi-host.example/storage/v1/object/public/slike/pets/x.jpg');
  ok(r === undefined, 'S11 ista putanja na tuđem domenu se ne presreće');
  /* ako keš pukne, browser sam skida sliku */
  const oo = swOkvir(new Map([['pets/p1.jpg', 'V']]));
  oo.kes.caches.open = async () => { throw new Error('keš pukao'); };
  r = await oo.run(SB + 'pets/p1.jpg?v=1');
  eq(await r.text(), 'V', 'S12 keš ne radi -> slika ipak stiže sa mreže');
  o.kes.stores.set('cindyland-v1.17.0', new Map()); o.kes.stores.set('cindyland-v1.18.0', new Map());
  let c; o.handlers.activate({ waitUntil(p){ c = p; } }); await c;
  eq(o.kes.deleted, ['cindyland-v1.17.0'], 'S13 aktivacija briše stari keš app-a, a keš slika ostaje');
}

/* ================= APLIKACIJA: mala slika, upload, dopuna, čišćenje ================= */
function appOkvir(opts){
  const store = new Map();
  const localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const uploads = [], removes = [], net = [], poruke = [];
  const server = opts.server;
  let zatvoreno = 0;
  const sb = { storage: { from(bucket){ return {
      async upload(p, blob, o){ uploads.push({ bucket, path: p, size: blob.size, o });
        if (opts.uploadFails) return { error: { message: 'x', statusCode: '403' } };
        if (opts.padaMala && /_s\.jpg$/.test(p)) return { error: { message: 'x' } };
        if (opts.upload409) return { error: { statusCode: '409', message: 'The resource already exists' } };
        server.add(p); return { error: null }; },
      remove(paths){ removes.push(paths); return Promise.resolve({ data: paths, error: null }); } }; } },
    from(){ throw new Error('DB NE SMIJE BITI DIRANA'); } };
  const fetch = async (url, init = {}) => {
    net.push((init.method || 'GET') + ' ' + putanja(url));
    if (opts.offline) throw new TypeError('offline');
    if (opts.serverDown) return new Response('', { status: 503 });
    const p = putanja(url);
    if (!p || !server.has(p)) return new Response('{"statusCode":"404"}', { status: 400 });
    return new Response(init.method === 'HEAD' ? null : new Uint8Array(1000), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  const kes = laznaKesMemorija();
  const canvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage(){} }), toBlob(cb, type){ cb(new Blob([new Uint8Array(12000)], { type })); } });
  const ctx = { D: opts.D, sb, OFFLINE: false, document: { hidden: false, createElement: canvas }, navigator: { onLine: true }, localStorage, fetch,
    caches: kes.caches, createImageBitmap: async () => ({ width: 1000, height: 800, close(){ zatvoreno++; } }), Response, Blob, URL, Image: class {},
    console, setTimeout, clearTimeout, Promise, Map, Set, Array, Object, Number, JSON, Date, Math, String, RegExp,
    CFG: { url: 'https://ggcvkeltmarcxlmaczmf.supabase.co' }, esc: s => String(s), toast(m){ poruke.push(m); },
    petById: id => (opts.D.pets || []).find(p => p.id === id) || null, dbSave: async () => (opts.dbSaveRezultat === undefined ? true : opts.dbSaveRezultat),
    PE: null, CE: null, render(){}, staysOnDate: () => opts.danas || [], todayISO: () => '2026-09-24' };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx); vm.runInContext(fotoKod + '\n' + blokSlike, ctx);
  return { ctx, uploads, removes, net, poruke, store, kes, server, zatvoreno: () => zatvoreno, run: k => vm.runInContext(k, ctx) };
}
console.log('\n== aplikacija: mala/velika adresa ==');
{
  const o = appOkvir({ server: new Set(), D: { pets: [] } });
  eq(o.run(`fotoMala('${SB}pets/p1.jpg?v=5')`), SB + 'pets/p1_s.jpg?v=5', 'A1 fotoMala umeće _s ispred .jpg i čuva ?v=');
  eq(o.run(`fotoMala('pets/p1-1790000000000.jpg')`), 'pets/p1-1790000000000_s.jpg', 'A2 fotoMala radi i na novoj (verzionisanoj) putanji');
  eq(o.run(`fotoMala(null)`), null, 'A3 fotoMala(null) = null');
  eq(o.run(`fotoMala('https://x/y.png')`), 'https://x/y.png', 'A4 nepoznat format ostaje kakav je');
  eq(o.run(`fotoImg('${SB}pets/p1.jpg?v=5', 'loading="lazy"')`), `<img src="${SB}pets/p1_s.jpg?v=5" data-velika="${SB}pets/p1.jpg?v=5" alt="" loading="lazy">`, 'A5 fotoImg: mala + data-velika + dodatni atribut');
  eq(o.run(`fotoImg('https://x/y.png')`), '<img src="https://x/y.png" alt="">', 'A6 fotoImg bez _s nema data-velika (nema šta da zamijeni)');
  eq(o.run(`putanjaSlike('${SB}pets/p1.jpg?v=5')`), 'pets/p1.jpg', 'A7 putanjaSlike vadi putanju bez ?v=');
  eq(o.run(`putanjaSlike('https://drugi/nesto.jpg')`), null, 'A8 putanjaSlike za tuđu adresu = null');
}
console.log('\n== aplikacija: upload nove slike ==');
{
  const server = new Set(['pets/p1.jpg', 'pets/p1_s.jpg']);
  const D = { pets: [{ id: 'p1', name: 'Rex', photo: SB + 'pets/p1.jpg?v=1' }] };
  const o = appOkvir({ server, D });
  await o.run(`uploadPetPhoto('p1', new Blob([new Uint8Array(500000)], { type: 'image/jpeg' }))`);
  await cekaj(20);
  const p = D.pets[0];
  ok(/^pets\/p1-\d{13}\.jpg$/.test(o.uploads[0] && o.uploads[0].path), 'U1 velika ide na NOVU putanju pets/<id>-<vrijeme>.jpg -> ' + (o.uploads[0] && o.uploads[0].path));
  ok(o.uploads[1] && o.uploads[1].path === o.uploads[0].path.replace('.jpg', '_s.jpg'), 'U1 mala uz nju (_s)');
  ok(o.uploads.every(u => u.o.upsert && u.o.cacheControl === '31536000' && u.o.contentType === 'image/jpeg'), 'U1 obje sa keš-zaglavljem od godinu dana');
  ok(p.photo.startsWith(SB + o.uploads[0].path + '?v='), 'U1 pets.photo = nova adresa velike');
  eq(o.removes, [['pets/p1.jpg', 'pets/p1_s.jpg']], 'U1 stara velika i mala se brišu poslije potvrđenog upisa');
  eq(JSON.parse(o.store.get('cindyland-male-slike') || 'null'), [p.photo], 'U1 nova adresa odmah potvrđena (mala postoji)');
  eq([...o.kes.stores.get('cindyland-slike').keys()].map(putanja), [o.uploads[0].path, o.uploads[1].path], 'U1 obje odmah u kešu telefona');
  eq(o.poruke, ['Slika se šalje…', 'Slika sačuvana.'], 'U1 poruke');
  eq(o.zatvoreno(), 1, 'U1 bitmapa zatvorena');
}
{
  const D = { pets: [{ id: 'p1', name: 'Rex', photo: SB + 'pets/p1.jpg?v=1' }] };
  const o = appOkvir({ server: new Set(['pets/p1.jpg']), D, padaMala: true });
  await o.run(`uploadPetPhoto('p1', new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }))`);
  await cekaj(20);
  ok(/^pets\/p1-\d{13}\.jpg/.test(putanja(D.pets[0].photo)), 'U2 mala pala: velika svejedno upisana');
  eq(JSON.parse(o.store.get('cindyland-male-slike') || '[]'), [], 'U2 mala pala: nije potvrđena (dopuna će je napraviti)');
  eq([...o.kes.stores.get('cindyland-slike').keys()].length, 1, 'U2 u kešu samo velika');
  eq(o.poruke[1], 'Slika sačuvana.', 'U2 korisnik vidi uspjeh');
}
{
  const D = { pets: [{ id: 'p1', name: 'Rex', photo: SB + 'pets/p1.jpg?v=1' }] };
  const o = appOkvir({ server: new Set(['pets/p1.jpg']), D, dbSaveRezultat: false });
  await o.run(`uploadPetPhoto('p1', new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }))`);
  await cekaj(20);
  eq(o.removes, [], 'U3 upis u bazu nije prošao -> stara slika se NE briše');
  ok(o.poruke[1].startsWith('Slika je poslata, ali upis'), 'U3 poruka o čekanju upisa');
}
{
  const D = { pets: [{ id: 'p1', name: 'Rex', photo: SB + 'pets/p1.jpg?v=1' }] };
  const o = appOkvir({ server: new Set(['pets/p1.jpg']), D, uploadFails: true });
  await o.run(`uploadPetPhoto('p1', new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }))`);
  await cekaj(20);
  eq(putanja(D.pets[0].photo), 'pets/p1.jpg', 'U4 velika pala: adresa ostaje stara');
  eq(o.poruke[1], 'Slika nije poslata - pokušaj drugu ili provjeri internet.', 'U4 poruka o grešci');
  eq(o.removes, [], 'U4 ništa se ne briše');
}
console.log('\n== aplikacija: dopuna malih slika za stare upise ==');
{
  const server = new Set(['pets/p1.jpg', 'pets/p2.jpg', 'pets/p2_s.jpg', 'pets/p3.jpg']);
  const D = { pets: [{ id: 'p1', photo: SB + 'pets/p1.jpg?v=1' }, { id: 'p2', photo: SB + 'pets/p2.jpg?v=2' }, { id: 'p3', photo: SB + 'pets/p3.jpg?v=3' }, { id: 'p4', photo: null }] };
  const o = appOkvir({ server, D, danas: [{ petIds: ['p3'] }] });
  await o.run('dopuniMaleSlike()');
  eq(o.uploads.map(u => u.path).sort(), ['pets/p1_s.jpg', 'pets/p3_s.jpg'], 'D1 male se prave samo gdje ih nema');
  ok(o.uploads.every(u => u.o.upsert === false && u.o.cacheControl === '31536000'), 'D1 dopuna: upsert:false + keš godinu dana');
  eq(o.net[0], 'HEAD pets/p3_s.jpg', 'D1 prvo ljubimac koji je danas u pansionu');
  eq(o.net.filter(n => n.startsWith('HEAD')).length, 3, 'D1 po jedan HEAD za svaku sliku');
  eq(o.net.filter(n => n.startsWith('GET')).sort(), ['GET pets/p1.jpg', 'GET pets/p3.jpg'], 'D1 velika se skida samo za one koje treba smanjiti');
  eq(JSON.parse(o.store.get('cindyland-male-slike')).sort(), [SB + 'pets/p1.jpg?v=1', SB + 'pets/p2.jpg?v=2', SB + 'pets/p3.jpg?v=3'], 'D1 sve tri potvrđene i zapamćene na telefonu');
  eq([...o.kes.stores.get('cindyland-slike').keys()].map(putanja).sort(), ['pets/p1_s.jpg', 'pets/p3_s.jpg'], 'D1 napravljene male odmah u kešu telefona');
  eq(o.zatvoreno(), 2, 'D1 bitmape zatvorene');
  o.net.length = 0; o.uploads.length = 0;
  await o.run('dopuniMaleSlike()');
  eq(o.net, [], 'D2 drugi prolaz: ništa na mreži');
  eq(o.uploads, [], 'D2 drugi prolaz: nema slanja');
  D.pets[0].photo = SB + 'pets/p1-1790000000000.jpg?v=9'; server.add('pets/p1-1790000000000.jpg');
  await o.run('dopuniMaleSlike()');
  eq(o.uploads.map(u => u.path), ['pets/p1-1790000000000_s.jpg'], 'D3 nova adresa slike -> mala se pravi za nju');
  const ok3 = JSON.parse(o.store.get('cindyland-male-slike'));
  ok(!ok3.includes(SB + 'pets/p1.jpg?v=1') && ok3.includes(D.pets[0].photo), 'D3 stara potvrda ispala, nova upisana');
  eq(o.run('MALE_OK.size'), 3, 'D3 tačno tri potvrde');
}
{
  const server = new Set(['pets/p1.jpg', 'pets/p2.jpg']);
  const D = { pets: [{ id: 'p1', photo: SB + 'pets/p1.jpg?v=1' }, { id: 'p2', photo: SB + 'pets/p2.jpg?v=2' }] };
  const o = appOkvir({ server, D, serverDown: true });
  await o.run('dopuniMaleSlike()');
  eq(o.uploads, [], 'D4 server javlja grešku (503): ništa se ne šalje');
  eq(o.net.length, 1, 'D4 poslije prve greške se staje');
  ok(o.run('MALE_ODGODA') > Date.now() + 9 * 60 * 1000, 'D4 i miruje ~10 min');
  o.net.length = 0; await o.run('dopuniMaleSlike()');
  eq(o.net, [], 'D4 dok miruje ne pipa mrežu');
  o.run('MALE_ODGODA = 0'); o.ctx.document.hidden = true;
  await o.run('dopuniMaleSlike()');
  eq(o.net, [], 'D5 app u pozadini: ne radi ništa');
  o.ctx.document.hidden = false; o.ctx.sb = null;
  await o.run('dopuniMaleSlike()');
  eq(o.net, [], 'D6 bez servera (probni režim): ne radi ništa');
}
{
  const D = { pets: [{ id: 'p1', photo: SB + 'pets/p1.jpg?v=1' }, { id: 'p2', photo: SB + 'pets/p2.jpg?v=2' }] };
  const o = appOkvir({ server: new Set(['pets/p1.jpg', 'pets/p2.jpg']), D, uploadFails: true });
  await o.run('dopuniMaleSlike()');
  eq(o.uploads.length, 1, 'D7 slanje male palo (403): poslije prvog pada se staje');
  eq(JSON.parse(o.store.get('cindyland-male-slike')), [], 'D7 ništa nije potvrđeno');
  await o.run('dopuniMaleSlike()');
  eq(o.uploads.length, 1, 'D7 miruje 10 min - ne lupa ponovo');
  o.run('MALE_ODGODA = 0');
  await o.run('dopuniMaleSlike()');
  eq(o.uploads.length, 2, 'D7 poslije pauze pokušava ponovo');
}
{
  const D = { pets: [{ id: 'p1', photo: SB + 'pets/p1.jpg?v=1' }] };
  const o = appOkvir({ server: new Set(['pets/p1.jpg']), D, upload409: true });
  await o.run('dopuniMaleSlike()');
  eq(o.uploads.length, 1, 'D8 409 (drugi telefon već napravio malu): jedno slanje');
  eq(JSON.parse(o.store.get('cindyland-male-slike')), [D.pets[0].photo], 'D8 računa se kao „ima" - ne prepisuje se');
  eq((o.kes.stores.get('cindyland-slike') || new Map()).size, 0, 'D8 sopstvena (možda starija) mala ne ide u keš');
}
{
  const D = { pets: [{ id: 'p1', photo: SB + 'pets/p1.jpg?v=1' }, { id: 'p2', photo: SB + 'pets/p2.jpg?v=2' }] };
  const o = appOkvir({ server: new Set(['pets/p2.jpg']), D });   // p1: velike nema na serveru
  await o.run('dopuniMaleSlike()');
  eq(o.uploads.map(u => u.path), ['pets/p2_s.jpg'], 'D9 velike nema -> preskoči, ostale se rade');
  eq(JSON.parse(o.store.get('cindyland-male-slike')), [D.pets[1].photo], 'D9 preskočena nije potvrđena');
  o.net.length = 0; await o.run('dopuniMaleSlike()');
  eq(o.net, [], 'D9 preskočena se ne pipa ponovo do sljedećeg paljenja');
}
console.log('\n== aplikacija: čišćenje keša slika ==');
{
  const D = { pets: [{ id: 'p1', photo: SB + 'pets/p1.jpg?v=2' }] };
  const o = appOkvir({ server: new Set(), D });
  const c = await o.kes.caches.open('cindyland-slike');
  for (const u of [SB + 'pets/p1.jpg?v=2', SB + 'pets/p1_s.jpg?v=2', SB + 'pets/p1.jpg?v=1', SB + 'pets/obrisan.jpg?v=7']) await c.put(u, new Response('x'));
  await o.run('ocistiKesSlika()');
  eq([...o.kes.stores.get('cindyland-slike').keys()].map(putanja).sort(), ['pets/p1.jpg', 'pets/p1_s.jpg'], 'C1 stara verzija i obrisan ljubimac izlaze, žive (mala i velika) ostaju');
  await c.put(SB + 'pets/staro.jpg?v=1', new Response('x'));
  await o.run('ocistiKesSlika()');
  eq([...o.kes.stores.get('cindyland-slike').keys()].length, 3, 'C2 unutar 24 h se ne čisti ponovo');
  o.store.set('cindyland-kes-slike-ciscen', String(Date.now() - 25 * 3600 * 1000));
  await o.run('ocistiKesSlika()');
  eq([...o.kes.stores.get('cindyland-slike').keys()].length, 2, 'C3 poslije 24 h čisti ponovo');
}

/* ================= loadAll: bez precrtavanja kad nema promjene ================= */
console.log('\n== loadAll: precrtavanje samo kad ima promjene ==');
{
  const T = { clients: new Map(), pets: new Map(), stays: new Map(), boxes: new Map(), settings: new Map() };
  let obrni = false, padniJednom = false, selectPoziva = 0;
  const kolone = [];
  const sb = { from(table){ return { select(){ selectPoziva++; const b = { order(k){ kolone.push(table + ':' + k); return b; }, range(){ return b; },
    then(r, j){ if (padniJednom){ padniJednom = false; return Promise.reject(new Error('mreža')).then(r, j); }
      const rows = [...T[table].values()]; if (obrni) rows.reverse(); return Promise.resolve(r({ data: rows, error: null })); } }; return b; } }; } };
  const D = { clients: [], pets: [], stays: [], boxes: [], prices: { x: 1 } };
  const store = new Map();
  const localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const broj = { render: 0, save: 0, dopuna: 0, ciscenje: 0 };
  const ctx = { D, sb, console, setTimeout, clearTimeout, Promise, Map, Set, Array, Object, Number, JSON, Date, Math, localStorage,
    AbortController: class { constructor(){ this.signal = {}; } abort(){} }, navigator: { onLine: true },
    save(){ broj.save++; }, toast(){}, normalizePrices: p => p, OFFLINE: false, CE: null, PE: null, PD: null, sheetOpen: false, NES_CRTANO: 0,
    $: () => ({ textContent: '' }), cePopSync(){}, renderClientPop(){}, renderDatesCheck(){}, renderPetPop(){}, uid: () => 'x', esc: s => s, I: {}, CFG: {}, defaultData: () => D,
    dopuniMaleSlikeUskoro(){ broj.dopuna++; }, ocistiKesSlika(){ broj.ciscenje++; } };
  ctx.render = function(){ broj.render++; ctx.NES_CRTANO = vm.runInContext('nesacuvanoBroj()', ctx); };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(blokDb, ctx);
  T.clients.set('c1', { id: 'c1', name: 'Ana', phone: '1', note: '', blacklist: false });
  T.clients.set('c2', { id: 'c2', name: 'Bob', phone: '2', note: '', blacklist: false });
  T.pets.set('p1', { id: 'p1', client_id: 'c1', name: 'Rex', species: 'pas', size: 'mali', sex: null, breed: '', note: '', photo: null });
  T.stays.set('s1', { id: 's1', client_id: 'c1', pet_ids: ['p1'], type: 'pansion', from_date: '2026-09-01', to_date: '2026-09-05', box_id: null, boxes: null, payments: [{ a: '30', d: '2026-09-05' }], arrived_at: null, left_at: null, price: '30', deposit: null, paid: true, paid_at: '2026-09-05', note: '', created_at: '2026-09-01T10:00:00+00:00' });
  T.settings.set('prices', { key: 'prices', value: { x: 1 } });
  await vm.runInContext('loadAll()', ctx);
  eq([broj.render, broj.save], [1, 1], 'L1 prvi loadAll: podaci stigli -> jedno precrtavanje');
  eq(D.clients.length + D.pets.length + D.stays.length, 4, 'L1 podaci u D');
  ok(kolone.includes('stays:id') && kolone.includes('settings:key') && !kolone.includes('settings:id'), 'L1 fetchAll sortira po id (settings po key)');
  await vm.runInContext('loadAll()', ctx);
  eq([broj.render, broj.save], [1, 1], 'L2 isti podaci -> bez precrtavanja i bez upisa u localStorage');
  obrni = true;
  await vm.runInContext('loadAll()', ctx);
  eq([broj.render, broj.save], [1, 1], 'L3 isti podaci drugim redom -> i dalje bez precrtavanja');
  T.clients.get('c2').phone = '3';
  await vm.runInContext('loadAll()', ctx);
  eq([broj.render, broj.save], [2, 2], 'L4 promjena na serveru -> precrtavanje');
  ctx.OFFLINE = true;
  await vm.runInContext('loadAll()', ctx);
  eq([broj.render, ctx.OFFLINE], [3, false], 'L5 povratak sa „nema veze" -> precrtavanje (skida se traka) i OFFLINE=false');
  eq([broj.dopuna, broj.ciscenje], [5, 5], 'L6 dopuna malih i čišćenje keša se zakazuju poslije svakog čitanja');
  D.clients.push({ id: 'c3', name: 'Lokalni', phone: '', note: '', blacklist: false });
  vm.runInContext("DB_CEKA.set('clients:c3', { table: 'clients', obj: D.clients[D.clients.length - 1], del: false })", ctx);
  await vm.runInContext('loadAll()', ctx);
  eq([broj.render, D.clients.some(c => c.id === 'c3')], [3, true], 'L7 upis koji čeka na server ostaje u D i ne izaziva precrtavanje');
  vm.runInContext("DB_CEKA.delete('clients:c3')", ctx); D.clients.splice(D.clients.findIndex(c => c.id === 'c3'), 1);
  /* L8: traka „nije stiglo na server" mora da nestane kad upis prođe iako se podaci nisu promijenili */
  const c9 = { id: 'c9', name: 'Kasni', phone: '', note: '', blacklist: false };
  D.clients.push(c9); T.clients.set('c9', { ...c9 });
  vm.runInContext("DB_CEKA.set('clients:c9', { table: 'clients', obj: D.clients[D.clients.length - 1], del: false, pao: true })", ctx);
  vm.runInContext('render()', ctx);
  eq([broj.render, ctx.NES_CRTANO], [4, 1], 'L8 traka nacrtana (1 nesačuvan upis)');
  vm.runInContext("DB_CEKA.delete('clients:c9')", ctx);   // upis je u međuvremenu prošao (dbUspjeh)
  await vm.runInContext('loadAll()', ctx);
  eq([broj.render, ctx.NES_CRTANO], [5, 0], 'L8 isti podaci, ali traka mora da ode -> precrtavanje');
  /* L9: prvi neuspjeh čitanja se tiho ponovi, bez trake „nema veze" */
  padniJednom = true; const prije9 = selectPoziva;
  await vm.runInContext('loadAll()', ctx);
  eq([ctx.OFFLINE, broj.render], [false, 5], 'L9 pad čitanja: nema trake ni precrtavanja odmah');
  await cekaj(2800);
  ok(selectPoziva > prije9 + 5 && ctx.OFFLINE === false && broj.render === 5, 'L9 poslije 2,5 s tiho ponovljeno i uspjelo (bez precrtavanja jer je isto)');
  padniJednom = false;
  /* L10: tek upisan boravak u lokalnom obliku (drugi redoslijed ključeva, createdAt „…Z", paidAt undefined) = odjek sa servera */
  const lokalni = { createdAt: '2026-09-24T10:00:00.123Z', id: 's2', clientId: 'c1', petIds: ['p1'], type: 'pansion', from: '2026-10-01', to: '2026-10-05', boxId: null,
    boxes: [{ b: 'mb1', f: '2026-10-01', t: '2026-10-05' }], payments: null, arrivedAt: null, leftAt: null, price: 100, deposit: null, paid: false, paidAt: undefined, note: '' };
  D.stays.push(lokalni);
  T.stays.set('s2', { id: 's2', client_id: 'c1', pet_ids: ['p1'], type: 'pansion', from_date: '2026-10-01', to_date: '2026-10-05', box_id: null, boxes: [{ b: 'mb1', f: '2026-10-01', t: '2026-10-05' }],
    payments: null, arrived_at: null, left_at: null, price: '100', deposit: null, paid: false, paid_at: null, note: '', created_at: '2026-09-24T10:00:00.123+00:00' });
  await vm.runInContext('loadAll()', ctx);
  eq(broj.render, 5, 'L10 sopstveni upis i njegov odjek sa servera = isto -> bez eho-precrtavanja');
  T.stays.get('s2').price = '120';
  await vm.runInContext('loadAll()', ctx);
  eq(broj.render, 6, 'L10 a prava razlika (cijena) se i dalje vidi');
}

console.log(`\n${prosli} prošlo, ${pao} palo`);
process.exit(pao ? 1 : 0);
