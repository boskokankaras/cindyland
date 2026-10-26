// E2E prolaz Cindyland v1.19.0 kroz pravu aplikaciju (probni režim, podaci u localStorage), headless.
// Pokretanje: PATH=$HOME/.local/node/bin:$PATH node e2e.mjs   (demo server mora raditi na :8643)
// Klikće prava dugmad (Playwright klik mišem) i provjerava D.stays / history.state / DOM. App se NE mijenja.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire('/Users/boskokankaras/tiramisu-upload/package.json');
const { chromium } = require('playwright');

const FIX = readFileSync(new URL('../fixture.js', import.meta.url), 'utf8');
const INV = JSON.parse(readFileSync(new URL('../inventar.json', import.meta.url), 'utf8'));
const SRC = readFileSync('/tmp/cindy_demo/app/index.html', 'utf8');   // samo čitanje (handleri / tekstovi)
const URL0 = 'http://localhost:8643/app/';
const SAMO = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;   // node e2e.mjs "Kalendar" = samo taj tok

/* istorija: svaki korak dobija redni broj (__i) da se vidi koliko je nivoa u istoriji;
   posmatrač skuplja svaki data-act koji se ikad pojavio u DOM-u (za provjeru inventara) */
const INIT = `(() => {
  const H = history, op = H.pushState.bind(H), orr = H.replaceState.bind(H);
  window.__idx = () => (H.state && typeof H.state.__i === 'number') ? H.state.__i : 0;
  H.pushState = function(s, t, u){ const i = window.__idx() + 1; return op(Object.assign({}, s || {}, { __i: i }), t, u); };
  H.replaceState = function(s, t, u){ const i = window.__idx(); return orr(Object.assign({}, s || {}, { __i: i }), t, u); };
  window.__acts = new Set();
  const skup = n => { if (!n || n.nodeType !== 1) return; if (n.dataset && n.dataset.act) __acts.add(n.dataset.act);
    if (n.querySelectorAll) n.querySelectorAll('[data-act]').forEach(e => __acts.add(e.dataset.act)); };
  new MutationObserver(ms => ms.forEach(m => { if (m.type === 'attributes') skup(m.target); m.addedNodes.forEach(skup); }))
    .observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-act'] });
})();`;
/* bilježi svaki upis (dbSave / dbKill) - da se vidi ŠTA je upisano, a ne samo kako izgleda */
const DB_LOG = `(() => { window.__db = []; const s = dbSave, k = dbKill;
  dbSave = function(t, o){ __db.push(['save', t, o && o.id]); return s.apply(this, arguments); };
  dbKill = function(t, id){ __db.push(['kill', t, id]); return k.apply(this, arguments); }; return true; })()`;
const STANJE = `(() => ({ idx: __idx(), ocek: (sheetOpen ? sheetDubina() : 0) + (CE ? 1 : 0) + (PE ? 1 : 0) + (ZOOM ? 1 : 0),
  sheet: sheetOpen, naslov: sheetOpen ? $('#sheetTitle').textContent : '', k: SHEET_CUR ? SHEET_CUR.k : null, kid: SHEET_CUR ? (SHEET_CUR.id || null) : null,
  sf: SF ? (SF.id || 'novi') : null, CE: CE ? CE.clientId : null, PE: PE ? (PE.petId || 'novi') : null, NM: NM ? NM.id : null,
  modal: (document.querySelector('#modalHost .modal-title') || {}).textContent || '', foot: $('#sheetFoot').classList.contains('on'),
  top: Math.round($('#sheetBody').scrollTop), back: $('#sheetBack').style.display !== 'none' ? $('#sheetBack').textContent.trim() : '' }))()`;

const browser = await chromium.launch({ headless: true });
const PROLAZ = [];
const KONZOLA = [];
const SEEN = new Set();          // data-act viđeni u DOM-u u svim tokovima
const R = {};                    // ručne provjere inventara: 'i.j' -> { ok, nap }
const rucno = (k, ok, nap) => { R[k] = { ok: !!ok, nap: nap || '' }; };

async function nova(o = {}){
  const ctx = await browser.newContext({ viewport: { width: 375, height: o.h || 812 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const greske = [];
  page.on('pageerror', e => greske.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') greske.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(URL0);
  await page.waitForFunction(() => typeof APP_SHOWN !== 'undefined' && APP_SHOWN && D.stays.length > 100, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  if (!o.bezFixture){ await page.evaluate(FIX); await page.waitForTimeout(250); }
  await page.evaluate(DB_LOG);
  return alati(page, ctx, greske);
}
async function alati(page, ctx, greske){
  const ev = js => page.evaluate(js);
  const W = (ms = 250) => page.waitForTimeout(ms);
  const loc = (sel, tekst) => tekst ? page.locator(sel, { hasText: tekst }).first() : page.locator(sel).first();
  const E = {
    page, ctx, greske, ev, W, loc,
    t: await ev('todayISO()'),
    klik: async (sel, o = {}) => { await loc(sel, o.tekst).click({ timeout: o.timeout || 4000, button: o.button || 'left' }); await W(o.w || 320); },
    ima: (sel, tekst) => (tekst ? page.locator(sel, { hasText: tekst }) : page.locator(sel)).count(),
    vidljiv: sel => loc(sel).isVisible().catch(() => false),
    tekst: async sel => ((await loc(sel).textContent({ timeout: 1500 }).catch(() => null)) || '').replace(/\s+/g, ' ').trim(),
    vr: sel => loc(sel).inputValue({ timeout: 1500 }).catch(() => null),
    upisi: async (sel, v) => { await loc(sel).fill(v, { timeout: 3000 }); await W(220); },
    st: id => ev(`JSON.parse(JSON.stringify(D.stays.find(s => s.id === ${JSON.stringify(id)}) || null))`),
    stanje: () => ev(STANJE),
    novac: s => ev(`money(${Number(s)})`),
    db: () => ev('window.__db.splice(0)'),
    /* sistemsko „nazad" (dugme na telefonu) */
    nazad: async () => { try { await page.goBack({ waitUntil: 'commit', timeout: 1500 }); } catch (e){ await ev('history.back()'); } await W(450); },
    /* poslije Sačuvaj: pitanja „Boks je već zauzet" / „Preko kapaciteta" se potvrđuju i bilježe */
    posleSave: async (bilj) => {
      for (let i = 0; i < 2; i++){
        const m = await ev(`(document.querySelector('#modalHost .modal-title') || {}).textContent || ''`);
        if (m === 'Boks je već zauzet' || m === 'Preko kapaciteta'){ if (bilj) bilj('pitanje „' + m + '" -> potvrđeno'); await E.klik('#modalHost [data-act="sf-save-force"]'); }
        else break;
      }
    },
  };
  return E;
}

async function tok(ime, fn, o){
  if (SAMO && !SAMO.test(ime)) return;
  const f = { prov: 0, pale: [], bilj: [] };
  const ok = (c, opis) => { f.prov++; if (!c) f.pale.push(opis); return !!c; };
  const bilj = s => f.bilj.push(s);
  let E;
  try {
    E = await nova(o);
    await fn(E, ok, bilj);
  } catch (e){ f.pale.push('prekid: ' + String(e.message || e).split('\n')[0].slice(0, 260)); }
  if (E){
    try { (await E.ev('[...window.__acts]')).forEach(a => SEEN.add(a)); } catch (e){}
    const pe = E.greske.filter(g => g.startsWith('pageerror'));
    if (pe.length) f.pale.push('greške stranice: ' + pe.join(' | '));
    KONZOLA.push(...E.greske.map(g => ime + ' -> ' + g));
    await E.ctx.close();
  }
  const detalj = `${f.prov} provjera` + (f.pale.length ? '; PALO: ' + f.pale.join('; ') : '') + (f.bilj.length ? '; ' + f.bilj.join('; ') : '');
  PROLAZ.push({ tok: ime, rezultat: f.pale.length ? 'pao' : 'prošao', detalj });
  console.log((f.pale.length ? 'XX ' : 'ok ') + ime + '\n     ' + detalj);
}
const avZbir = s => (s && s.payments || []).filter(p => p.av).reduce((a, p) => a + p.a, 0);

/* ======================= DANAS: DOŠAO ======================= */
await tok('Danas: Došao + Poništi iz poruke', async (E, ok) => {
  ok(await E.ima('#view [data-act="stay-arrived"][data-id="fx4"]') === 1, 'dugme Došao za fx4 na Danas');
  await E.klik('#view [data-act="stay-arrived"][data-id="fx4"]');
  let s = await E.st('fx4');
  ok(s.arrivedAt === E.t, 'Došao upisuje arrivedAt = danas (' + s.arrivedAt + ')');
  ok(await E.ima('#view [data-act="stay-arrived"][data-id="fx4"]') === 0, 'fx4 nestaje iz Dolaze');
  ok(await E.ima('#view .row-tap[data-act="stay-edit"][data-id="fx4"]') === 1, 'fx4 sada stoji u Ostaju');
  const tt = await E.tekst('#toast');
  ok(/je u pansionu/.test(tt) && await E.ima('#toast.show .toast-btn') === 1, 'poruka „je u pansionu" sa dugmetom Poništi: ' + tt);
  await E.klik('#toast .toast-btn');
  s = await E.st('fx4');
  ok(s.arrivedAt == null && s.leftAt == null, 'Poništi iz poruke briše dolazak');
  ok(await E.ima('#view [data-act="stay-arrived"][data-id="fx4"]') === 1, 'fx4 opet u Dolaze sa Došao');
  ok(/Dolazak poništen/.test(await E.tekst('#toast')), 'poruka „Dolazak poništen."');
});

/* ======================= OTIŠAO / NAPLATA ======================= */
await tok('Otišao (a): za naplatu 60 -> upiši 50 -> Duguje -> Nenaplaćeno 10', async (E, ok) => {
  const prije = await E.st('fx1');
  await E.klik('#view [data-act="stay-left"][data-id="fx1"]');
  ok(JSON.stringify(await E.st('fx1')) === JSON.stringify(prije), 'Otišao sam ne upisuje ništa (prozor tek pita)');
  const s0 = await E.stanje();
  ok(s0.modal === 'Odlazak' && s0.NM === 'fx1', 'prozor Odlazak: ' + s0.modal);
  const m = await E.tekst('#modalHost .modal');
  const meta = await E.tekst('#modalHost .nm-who .row-meta');
  rucno('7.1', s0.modal === 'Odlazak' && /noćenj/.test(meta) && await E.ima('#modalHost .nm-who .row-av') >= 0, 'naslov + „' + meta + '"');
  ok(/ukupno/.test(m) && /avans · /.test(m) && /za naplatu/.test(m), 'obračun: ukupno, avans · datum, za naplatu');
  ok(await E.vr('#nmIznos') === '60', 'unaprijed upisan ostatak 60 (' + await E.vr('#nmIznos') + ')');
  await E.upisi('#nmIznos', '50');
  const ost = await E.tekst('#nmOstatak');
  ok(/Ostaje još 10/.test(ost) && /Duguje/.test(ost) && /Popust/.test(ost), '„Ostaje još 10 €" + Duguje/Popust: ' + ost);
  await E.klik('#nmOstatak [data-act="nm-ostatak"][data-id="dug"]');
  ok(await E.ima('#nmOstatak [data-act="nm-ostatak"][data-id="dug"].active') === 1, 'Duguje izabrano');
  ok(await E.vr('#nmIznos') === '50', 'iznos 50 preživi izbor Duguje');
  ok(await E.ima('#modalHost [data-act="nm-kasnije"]') === 1, 'postoji „Otišao, plaća kasnije"');
  ok(/Naplaćeno i otišao/.test(await E.tekst('#modalHost [data-act="nm-ok"]')), 'dugme „Naplaćeno i otišao"');
  await E.klik('#modalHost [data-act="nm-ok"]');
  const s = await E.st('fx1');
  ok(s.leftAt === E.t && s.paid === false && s.paidAt == null, 'otišao danas, ostaje nenaplaćen');
  ok(s.price === 360, 'cijena ostaje 360 (' + s.price + ')');
  const p = s.payments || [];
  ok(p.length === 2 && p[0].a === 300 && p[0].av === 1 && p[1].a === 50 && p[1].d === E.t && !p[1].av, 'uplate = avans 300 + 50 danas: ' + JSON.stringify(p));
  ok(await E.ima('#modalHost .modal') === 0, 'prozor zatvoren');
  const b = await E.tekst('#view [data-act="charge"][data-id="fx1"]');
  ok(b === 'Naplati ' + await E.novac(10), 'ispraćeni red ima „Naplati 10 €": ' + b);
  ok(await E.ima('#view .row.row-gotov .row-tap[data-id="fx1"]') === 1, 'ispraćeni red prigušen (row-gotov)');
  await E.klik('#tabbar [data-act="tab"][data-id="zarada"]');
  await E.klik('#view [data-act="unpaid-open"]');
  ok((await E.stanje()).naslov === 'Nenaplaćeno', 'Nenaplaćeno otvoreno');
  const r = await E.tekst('#sheetBody [data-act="charge"][data-id="fx1"]');
  ok(r === 'Naplati ' + await E.novac(10), 'fx1 u Nenaplaćenom sa 10 €: ' + r);
});

await tok('Otišao (b): Popust -> zatvoren, cijena = primljeno', async (E, ok) => {
  await E.klik('#view [data-act="stay-left"][data-id="fx7"]');
  ok(await E.vr('#nmIznos') === '70', 'za naplatu 70 (120 - avans 50): ' + await E.vr('#nmIznos'));
  await E.upisi('#nmIznos', '60');
  await E.klik('#nmOstatak [data-act="nm-ostatak"][data-id="popust"]');
  ok(await E.ima('#nmOstatak [data-act="nm-ostatak"][data-id="popust"].active') === 1, 'Popust izabran');
  await E.klik('#modalHost [data-act="nm-ok"]');
  const s = await E.st('fx7');
  ok(s.paid === true && s.paidAt === E.t && s.leftAt === E.t, 'zatvoren kao naplaćen, otišao danas');
  ok(s.price === 110, 'cijena spuštena na primljeno 50 + 60 = 110 (' + s.price + ')');
  ok(JSON.stringify(s.payments) === JSON.stringify([{ a: 50, d: s.payments[0].d, av: 1 }, { a: 60, d: E.t, z: 1 }]), 'uplate: avans 50 + 60 danas: ' + JSON.stringify(s.payments));
  ok(/naplaćeno/.test(await E.tekst('#view .row:has(.row-tap[data-id="fx7"]) .row-side')), 'red fx7 pokazuje „naplaćeno"');
  ok(!(await E.ev(`unpaidStays().some(s => s.id === 'fx7')`)), 'fx7 nije u Nenaplaćenom');
});

await tok('Otišao (c): sve plaćeno avansom -> Potvrdi odlazak', async (E, ok) => {
  ok(/plaćeno/.test(await E.tekst('#view .row:has(.row-tap[data-id="fx2"]) .row-meta .meta-ok')), '„plaćeno" u redu ispod imena (fx2)');
  ok(await E.ima('#view .row:has(.row-tap[data-id="fx2"]) .row-side [data-act="stay-left"]') === 1, 'desno samo dugme Otišao');
  await E.klik('#view [data-act="stay-left"][data-id="fx2"]');
  const m = await E.tekst('#modalHost .modal');
  ok(/plaćeno avansom/.test(m), 'prozor kaže „plaćeno avansom"');
  ok(await E.ima('#nmIznos') === 0, 'nema polja iznosa');
  const dug = await E.tekst('#modalHost [data-act="nm-ok"]');
  ok(/Potvrdi odlazak/.test(dug), 'dugme „Potvrdi odlazak": ' + dug);
  rucno('7.6', /plaćeno avansom/.test(m) && /Potvrdi odlazak/.test(dug) && SRC.includes('Zatvori kao naplaćeno'),
    '„plaćeno avansom" + Potvrdi odlazak radi; „Zatvori kao naplaćeno" u kodu; dugme „U redu" (bez iznosa) više ne postoji - prozor tada ima samo krstić');
  await E.klik('#modalHost [data-act="nm-ok"]');
  const s = await E.st('fx2');
  ok(s.leftAt === E.t && s.paid === true && s.price === 100, 'otišao + zatvoren, cijena 100');
  ok((s.payments || []).length === 1 && s.payments[0].av === 1, 'nije dodata nova uplata (samo avans)');
  ok(/naplaćeno/.test(await E.tekst('#view .row:has(.row-tap[data-id="fx2"]) .row-side')), 'red pokazuje „naplaćeno"');
});

await tok('Otišao (d): Otišao, plaća kasnije', async (E, ok) => {
  await E.klik('#view [data-act="stay-left"][data-id="fx1"]');
  await E.klik('#modalHost [data-act="nm-kasnije"]');
  const s = await E.st('fx1');
  ok(s.leftAt === E.t && !s.paid, 'otišao danas, nenaplaćen');
  ok(JSON.stringify(s.payments) === JSON.stringify([{ a: 300, d: s.payments[0].d, av: 1 }]), 'uplate nepromijenjene (samo avans): ' + JSON.stringify(s.payments));
  ok((await E.tekst('#view [data-act="charge"][data-id="fx1"]')) === 'Naplati ' + await E.novac(60), 'red: „Naplati 60 €"');
  ok(await E.ev(`unpaidStays().some(s => s.id === 'fx1' && chargeDue(s) === 60)`), 'fx1 u Nenaplaćenom sa 60');
  ok(/je otišao/.test(await E.tekst('#toast')), 'poruka „je otišao"');
});

await tok('Otišao (e): Otkaži ne mijenja ništa (i sistemsko nazad = Otkaži)', async (E, ok) => {
  const prije = await E.ev('JSON.stringify(D.stays)');
  await E.klik('#view [data-act="stay-left"][data-id="fx1"]');
  await E.upisi('#nmIznos', '20');
  await E.klik('#modalHost [data-act="nm-otkazi"]');
  let s = await E.stanje();
  ok(!s.modal && !s.NM, 'prozor zatvoren');
  ok(await E.ev('JSON.stringify(D.stays)') === prije, 'Otkaži: D.stays identičan');
  ok(await E.ev('window.__db.length') === 0, 'Otkaži: ništa nije upisano (dbSave)');
  // iz spiska grupe: sistemsko nazad dok stoji prozor
  await E.klik('#view [data-act="group-open"][data-id="mb"]');
  await E.klik('#sheetBody [data-act="stay-left"][data-id="fx1"]');
  ok((await E.stanje()).modal === 'Odlazak', 'Odlazak iz spiska grupe');
  await E.nazad();
  s = await E.stanje();
  ok(!s.modal && !s.NM && s.sheet && s.k === 'grupa' && s.idx === 1 && s.ocek === 1, 'nazad = Otkaži, spisak ostaje: ' + JSON.stringify(s));
  rucno('7.7', !s.modal && s.sheet && s.k === 'grupa', 'sistemsko nazad zatvara prozor, spisak grupe ostaje');
  ok(await E.ev('JSON.stringify(D.stays)') === prije, 'nazad: D.stays identičan');
});

await tok('Ispraćeni red: dugme „Naplati X €"', async (E, ok) => {
  const iznos = await E.ev(`chargeDue(D.stays.find(s => s.id === 'fx5'))`);
  const b = await E.tekst('#view [data-act="charge"][data-id="fx5"]');
  ok(b === 'Naplati ' + await E.novac(iznos), 'fx5 (otišao, bez naplate): „' + b + '"');
  await E.klik('#view [data-act="charge"][data-id="fx5"]');
  ok((await E.stanje()).modal === 'Naplata', 'prozor Naplata');
  ok(await E.vr('#nmIznos') === String(iznos), 'unaprijed ' + iznos);
  ok(/po cjenovniku/.test(await E.tekst('#modalHost .pay-list')), 'ukupno „po cjenovniku" (bez dogovorene cijene)');
  ok(/^.*Naplaćeno$/.test(await E.tekst('#modalHost [data-act="nm-ok"]')) && await E.ima('#modalHost [data-act="nm-kasnije"]') === 0, 'dugme „Naplaćeno", bez „plaća kasnije"');
  await E.klik('#modalHost [data-act="nm-ok"]');
  const s = await E.st('fx5');
  ok(s.paid && s.price === iznos && s.paidAt === E.t && JSON.stringify(s.payments) === JSON.stringify([{ a: iznos, d: E.t, z: 1 }]), 'zatvoren: cijena = primljeno, jedna uplata danas: ' + JSON.stringify(s.payments));
  ok(/naplaćeno/.test(await E.tekst('#view .row:has(.row-tap[data-id="fx5"]) .row-side')), 'red pokazuje „naplaćeno"');
});

/* ======================= FORMA BORAVKA ======================= */
await tok('Forma boravka: avans iz Mali boksevi, Sačuvaj na isto mjesto, Finansije, Odbaci, krstić, nazad', async (E, ok, bilj) => {
  await E.klik('#view [data-act="group-open"][data-id="mb"]');
  const s0 = await E.stanje();
  ok(s0.naslov === 'Mali boksevi - danas' && s0.idx === 1, 'Mali boksevi otvoreni (idx ' + s0.idx + ')');
  const row = E.page.locator('#sheetBody .row-tap[data-act="stay-edit"][data-id="fx3"]');
  const bb = await E.page.locator('#sheetBody').boundingBox();
  await E.page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await E.page.mouse.wheel(0, 500); await E.W(350);
  await row.scrollIntoViewIfNeeded(); await E.W(150);
  const top0 = await E.ev(`$('#sheetBody').scrollTop`);
  const max = await E.ev(`$('#sheetBody').scrollHeight - $('#sheetBody').clientHeight`);
  bilj(`skrol spiska prije otvaranja ${Math.round(top0)} px (max ${max})`);
  await row.click(); await E.W(350);
  let s = await E.stanje();
  ok(s.k === 'boravak' && s.sf === 'fx3' && s.idx === 2 && s.ocek === 2, 'boravak fx3 = nivo 2: ' + JSON.stringify(s));
  ok(s.top === 0, 'novi nivo počinje od vrha');
  ok(/Mali boksevi/.test(s.back), 'strelica nazad nosi ime spiska: ' + s.back);
  ok(!s.foot, 'traka Sačuvaj skrivena dok ništa nije dirano');
  ok(await E.ima('#sfAvans') === 0, 'red „Cijena i avans" zatvoren');
  await E.klik('#sheetBody [data-act="sf-otv"][data-id="novac"]');
  ok(await E.vidljiv('#sfAvans') && await E.vidljiv('#sfPrice'), 'red „Cijena i avans" otvoren (Ukupno + Avans)');
  await E.upisi('#sfAvans', '30');
  ok((await E.stanje()).foot, 'traka Sačuvaj se pojavila');
  ok(/avans/.test(await E.tekst('#sfDue')) && /za naplatu/.test(await E.tekst('#sfDue')), 'živi obračun: avans + za naplatu');
  await E.klik('#sheetFoot [data-act="sf-save"]'); await E.posleSave(bilj);
  s = await E.stanje();
  ok(s.k === 'grupa' && s.naslov === 'Mali boksevi - danas' && s.idx === 1 && s.ocek === 1, 'Sačuvaj vraća na spisak grupe: ' + JSON.stringify(s));
  ok(Math.abs(s.top - top0) <= 2, `spisak na istom mjestu (${s.top} / ${Math.round(top0)})`);
  let st = await E.st('fx3');
  ok(JSON.stringify(st.payments) === JSON.stringify([{ a: 30, d: E.t, av: 1 }]), 'avans 30 = uplata avansa sa današnjim datumom: ' + JSON.stringify(st.payments));
  await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
  ok(!(await E.stanje()).sheet && (await E.stanje()).idx === 0, 'krstić zatvara spisak');
  await E.klik('#tabbar [data-act="tab"][data-id="zarada"]');
  const fin = await E.tekst('#view .row[data-act="stay-edit"][data-id="fx3"]');
  const dat = await E.ev('fmtD(todayISO())');
  ok(fin.includes(dat + ' · avans') && fin.includes(await E.novac(30)), 'Finansije: „' + dat + ' · avans … 30 €": ' + fin);
  await E.klik('#tabbar [data-act="tab"][data-id="danas"]');
  await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx3"]');
  ok((await E.tekst('#sheetBody .sf-novac')).includes(await E.novac(30)), 'kartica novca pokazuje avans 30 €');
  await E.klik('#sheetBody [data-act="sf-otv"][data-id="novac"]');
  ok(await E.vr('#sfAvans') === '30', 'ponovno otvaranje: polje Avans = 30 (' + await E.vr('#sfAvans') + ')');
  await E.upisi('#sfAvans', '50');
  await E.klik('#sheetFoot [data-act="sf-save"]'); await E.posleSave(bilj);
  st = await E.st('fx3');
  const av = (st.payments || []).filter(p => p.av);
  ok(av.length === 2 && av[0].a === 30 && av[1].a === 20 && av.every(p => p.d === E.t), 'povećanje na 50 = druga uplata avansa od 20: ' + JSON.stringify(st.payments));
  ok(!(await E.stanje()).sheet, 'Sačuvaj (otvoreno sa Danas) zatvara formu');
  // Odbaci
  await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx3"]');
  await E.klik('#sheetBody [data-act="sf-otv"][data-id="novac"]');
  await E.upisi('#sfAvans', '99');
  ok((await E.stanje()).foot, 'dirano -> traka Odbaci/Sačuvaj');
  await E.db();
  await E.klik('#sheetFoot [data-act="sf-odbaci"]');
  ok(await E.vr('#sfAvans') === '50', 'Odbaci vraća 50 (' + await E.vr('#sfAvans') + ')');
  ok(!(await E.stanje()).foot, 'traka nestaje poslije Odbaci');
  ok(JSON.stringify((await E.st('fx3')).payments) === JSON.stringify(st.payments) && !(await E.db()).length, 'Odbaci ništa ne upisuje');
  // krstić sa diranom formom
  await E.upisi('#sfAvans', '77');
  await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
  let s2 = await E.stanje();
  ok(s2.modal === 'Sačuvati izmjene?' && /avans/.test(await E.tekst('#modalHost .modal-text')), 'krstić pita „Sačuvati izmjene?" (Izmijenjeno: avans): ' + s2.modal);
  await E.klik('#modalHost [data-act="sf-izlaz-otkazi"]');
  s2 = await E.stanje();
  ok(s2.sheet && s2.sf === 'fx3' && !s2.modal && await E.vr('#sfAvans') === '77', '„Nazad u boravak": forma i 77 ostaju');
  await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
  await E.klik('#modalHost [data-act="sf-izlaz-odbaci"]');
  s2 = await E.stanje();
  ok(!s2.sheet && s2.idx === 0, '„Odbaci izmjene" zatvara: ' + JSON.stringify(s2));
  ok(JSON.stringify((await E.st('fx3')).payments) === JSON.stringify(st.payments), 'Odbaci iz pitanja ne upisuje 77');
  // sistemsko nazad = jedan nivo
  await E.klik('#view [data-act="group-open"][data-id="mb"]');
  await E.klik('#sheetBody .row-tap[data-act="stay-edit"][data-id="fx3"]');
  ok((await E.stanje()).idx === 2, 'boravak iz spiska = 2 koraka u istoriji');
  await E.nazad();
  s2 = await E.stanje();
  ok(s2.sheet && s2.k === 'grupa' && s2.idx === 1 && !s2.modal, 'sistemsko nazad: boravak -> spisak grupe: ' + JSON.stringify(s2));
  await E.nazad();
  s2 = await E.stanje();
  ok(!s2.sheet && s2.idx === 0, 'sistemsko nazad: spisak -> zatvoreno');
  // dirano + sistemsko nazad
  await E.klik('#view [data-act="group-open"][data-id="mb"]');
  await E.klik('#sheetBody .row-tap[data-act="stay-edit"][data-id="fx3"]');
  await E.klik('#sheetBody [data-act="sf-otv"][data-id="novac"]');
  await E.upisi('#sfAvans', '66');
  await E.nazad();
  s2 = await E.stanje();
  ok(s2.modal === 'Sačuvati izmjene?' && s2.sf === 'fx3' && s2.idx === 2, 'nazad sa diranom formom pita i vraća korak: ' + JSON.stringify(s2));
  await E.nazad();
  s2 = await E.stanje();
  ok(!s2.modal && s2.sf === 'fx3' && s2.idx === 2 && await E.vr('#sfAvans') === '66', 'nazad dok stoji pitanje = Otkaži (forma, 66 ostaju): ' + JSON.stringify(s2));
  await E.klik('#sheetBack');
  ok((await E.stanje()).modal === 'Sačuvati izmjene?', 'strelica ‹ sa diranom formom pita');
  await E.klik('#modalHost [data-act="sf-izlaz-sacuvaj"]'); await E.posleSave(bilj);
  s2 = await E.stanje(); st = await E.st('fx3');
  ok(s2.k === 'grupa' && s2.idx === 1 && !s2.modal, 'Sačuvaj iz pitanja (strelica) vraća jedan nivo: ' + JSON.stringify(s2));
  ok(Math.abs(avZbir(st) - 66) < 0.01 && st.payments.filter(p => p.av).length === 3, 'avans 66 (treća uplata avansa 16): ' + JSON.stringify(st.payments));
  // krstić -> Sačuvaj = zatvori sve nivoe
  await E.klik('#sheetBody .row-tap[data-act="stay-edit"][data-id="fx3"]');
  await E.klik('#sheetBody [data-act="sf-otv"][data-id="novac"]');
  await E.upisi('#sfAvans', '60');
  await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
  await E.klik('#modalHost [data-act="sf-izlaz-sacuvaj"]'); await E.posleSave(bilj);
  s2 = await E.stanje(); st = await E.st('fx3');
  ok(!s2.sheet && s2.idx === 0 && !s2.modal, 'krstić -> Sačuvaj zatvara SVE nivoe: ' + JSON.stringify(s2));
  ok(Math.abs(avZbir(st) - 60) < 0.01, 'smanjenje na 60 skida sa najnovije uplate avansa: ' + JSON.stringify(st.payments));
}, { h: 560 });

await tok('Forma boravka: krstić -> Sačuvaj sa zauzetim boksom („Upiši svejedno")', async (E, ok, bilj) => {
  await E.klik('#view [data-act="group-open"][data-id="mb"]');
  await E.klik('#sheetBody .row-tap[data-act="stay-edit"][data-id="fx3"]');
  await E.klik('#sheetBody [data-act="sf-otv"][data-id="boks"]');
  await E.klik('#sheetBody [data-act="sf-box-del"]');
  await E.klik('#modalHost [data-act="sf-box-del-yes"]');
  const tudji = (await E.st('fx1')).boxId;   // boks koji danas drži fx1
  await E.page.locator('#sfBox').selectOption(tudji); await E.W(300);
  ok(await E.ev(`SF.boxes.length === 1 && SF.boxes[0].b === ${JSON.stringify(tudji)}`), 'izabran zauzet boks ' + tudji);
  await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
  ok((await E.stanje()).modal === 'Sačuvati izmjene?', 'krstić pita (boks)');
  await E.klik('#modalHost [data-act="sf-izlaz-sacuvaj"]');
  const m = (await E.stanje()).modal;
  ok(m === 'Boks je već zauzet', 'pitanje „Boks je već zauzet": ' + m);
  await E.klik('#modalHost [data-act="sf-save-force"]');
  const s = await E.stanje();
  ok((await E.st('fx3')).boxId === tudji, 'boks upisan');
  ok(!s.sheet && s.idx === 0, 'poslije „Upiši svejedno" krstić i dalje zatvara SVE (a ne samo jedan nivo): ' + JSON.stringify({ sheet: s.sheet, k: s.k, naslov: s.naslov, idx: s.idx }));
});

await tok('Forma boravka: Otišao sa diranim poljem pita pa nastavlja', async (E, ok, bilj) => {
  await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx1"]');
  await E.klik('#sheetBody [data-act="sf-otv"][data-id="napomena"]');
  await E.upisi('#sfNote', 'Preuzima popodne');
  await E.klik('#sheetBody [data-act="sf-left"]');
  let s = await E.stanje();
  ok(s.modal === 'Sačuvati izmjene?' && /napomena/.test(await E.tekst('#modalHost .modal-text')), 'Otišao pita „Sačuvati izmjene?" (napomena): ' + s.modal);
  ok(!(await E.st('fx1')).leftAt, 'ništa nije upisano prije odgovora');
  await E.klik('#modalHost [data-act="sf-izlaz-sacuvaj"]'); await E.posleSave(bilj);
  s = await E.stanje(); let st = await E.st('fx1');
  ok(st.note === 'Preuzima popodne', 'napomena sačuvana');
  ok(s.modal === 'Odlazak' && s.NM === 'fx1' && s.sf === 'fx1', 'nastavlja na prozor Odlazak, forma ostaje ispod: ' + JSON.stringify(s));
  ok(await E.vr('#nmIznos') === '60', 'za naplatu 60');
  await E.klik('#modalHost [data-act="nm-ok"]');
  st = await E.st('fx1'); s = await E.stanje();
  ok(st.leftAt === E.t && st.paid && st.price === 360 && st.paidAt === E.t, 'otišao i naplaćeno 60');
  ok(!s.sheet && s.idx === 0, 'poslije naplate forma se zatvara (bila otvorena sa Danas)');
  // Naplati sa diranim poljem -> Sačuvaj -> prozor Naplata
  await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx3"]');
  await E.klik('#sheetBody [data-act="sf-otv"][data-id="napomena"]');
  await E.upisi('#sfNote', 'Kapi');
  await E.klik('#sheetBody [data-act="sf-charge"]');
  ok((await E.stanje()).modal === 'Sačuvati izmjene?', 'Naplati sa diranim poljem pita');
  await E.klik('#modalHost [data-act="sf-izlaz-sacuvaj"]'); await E.posleSave(bilj);
  s = await E.stanje();
  ok(s.modal === 'Naplata' && (await E.st('fx3')).note === 'Kapi', 'Sačuvaj pa prozor Naplata (prije dana odlaska): ' + s.modal);
  ok(await E.ima('#modalHost [data-act="nm-odlazi"]') === 2, 'izbor „Ostaje u pansionu / Odlazi danas"');
  await E.klik('#modalHost [data-act="nm-otkazi"]');
});

await tok('Forma boravka: Otišao sa diranim poljem -> „Odbaci izmjene" nastavlja na Odlazak', async (E, ok) => {
  await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx7"]');
  await E.klik('#sheetBody [data-act="sf-otv"][data-id="napomena"]');
  await E.upisi('#sfNote', 'privremeno');
  await E.klik('#sheetBody [data-act="sf-left"]');
  ok((await E.stanje()).modal === 'Sačuvati izmjene?', 'Otišao pita');
  await E.klik('#modalHost [data-act="sf-izlaz-odbaci"]');
  const s = await E.stanje(), st = await E.st('fx7');
  ok(st.note === '' && await E.vr('#sfNote') === '', 'Odbaci vraća napomenu na prazno');
  ok(s.modal === 'Odlazak', 'poslije „Odbaci izmjene" otvara se Odlazak (kao poslije Sačuvaj) - stanje: ' + JSON.stringify({ modal: s.modal, sf: s.sf, NM: s.NM }) + ' -> forma se samo vrati, Otišao treba dodirnuti ponovo');
});

await tok('Poništi naplatu briše samo zatvarajuću uplatu', async (E, ok) => {
  await E.klik('#view [data-act="stay-left"][data-id="fx1"]');
  await E.upisi('#nmIznos', '50');
  await E.klik('#modalHost [data-act="nm-ok"]');
  await E.klik('#view [data-act="charge"][data-id="fx1"]');
  const m = await E.tekst('#modalHost .pay-list');
  rucno('7.3', /ukupno/.test(m) && /avans · /.test(m) && /uplaćeno ranije/.test(m) && /za naplatu/.test(m), 'obračun: ' + m);
  ok(/uplaćeno ranije/.test(m), 'prozor Naplata pokazuje „uplaćeno ranije"');
  ok(await E.vr('#nmIznos') === '10', 'ostatak 10');
  await E.klik('#modalHost [data-act="nm-ok"]');
  let s = await E.st('fx1');
  ok(s.paid && s.paidAt === E.t && s.payments.length === 3 && s.price === 360, 'zatvoren sa 3 uplate (300 av + 50 + 10): ' + JSON.stringify(s.payments));
  await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx1"]');
  ok(/Naplaćeno · /.test(await E.tekst('#sheetBody .sf-nv-red')), 'forma: „Naplaćeno · datum" + poništi');
  ok(await E.ima('#sheetBody .sf-novac .pay-list .pay-row') === 3, 'spisak uplata na boravku (3 reda, avans označen)');
  ok(/avans/.test(await E.tekst('#sheetBody .sf-novac .pay-list')), 'uplata avansa označena „avans"');
  await E.klik('#sheetBody [data-act="sf-unpay"]');
  ok((await E.stanje()).modal === 'Poništiti naplatu?' && (await E.tekst('#modalHost .modal-text')).includes(await E.novac(10)), 'potvrda kaže da se briše uplata od 10 €: ' + await E.tekst('#modalHost .modal-text'));
  await E.klik('#modalHost [data-act="sf-unpay-yes"]');
  s = await E.st('fx1');
  ok(!s.paid && s.paidAt == null, 'naplata poništena');
  ok(JSON.stringify(s.payments) === JSON.stringify([{ a: 300, d: s.payments[0].d, av: 1 }, { a: 50, d: E.t }]), 'ostaju avans 300 i ranija uplata 50: ' + JSON.stringify(s.payments));
  ok((await E.tekst('#sheetBody [data-act="sf-charge"]')) === 'Naplati ' + await E.novac(10), 'forma opet nudi „Naplati 10 €"');
  ok(await E.ima('#modalHost .modal') === 0 && (await E.stanje()).sf === 'fx1', 'forma ostaje otvorena');
});

/* ======================= KARTICE ======================= */
await tok('Kartica ljubimca iz forme -> Novi boravak (ljubimac izabran) -> Sačuvaj -> nazad u boravak', async (E, ok, bilj) => {
  const fx3 = await E.st('fx3');
  const pid = fx3.petIds[0], cid = fx3.clientId;
  await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx3"]');
  await E.klik(`#sheetBody .pp[data-act="pet-open"][data-id="${pid}"]`);
  let s = await E.stanje();
  ok(s.PE === pid && s.idx === 2 && s.ocek === 2, 'kartica ljubimca preko forme: ' + JSON.stringify(s));
  ok(await E.ima('#modalHost [data-act="pe-done"]') === 0, 'nema dugmeta Gotovo (namjerno)');
  ok(await E.ima('#modalHost [data-act="pe-stay-open"]') >= 1, 'redovi boravaka otvaraju boravak (pe-stay-open)');
  await E.klik('#modalHost [data-act="pe-new-stay"]');
  s = await E.stanje();
  ok(!s.PE && s.sf === 'novi' && s.naslov === 'Novi boravak' && s.idx === 2, 'nova forma boravka: ' + JSON.stringify(s));
  ok(await E.ev(`SF.clientId === ${JSON.stringify(cid)} && SF.petIds.has(${JSON.stringify(pid)}) && SF.petIds.size === 1`), 'vlasnik i ljubimac već izabrani');
  ok(await E.ima(`#sheetBody .pp.on[data-id="${pid}"]`) === 1, 'ljubimac označen crvenim krugom');
  ok(/Boravak · /.test(s.back), 'strelica vodi nazad u boravak: ' + s.back);
  ok(await E.ima('#sheetBody .sf-akt[data-id="fx3"]') === 1, 'spisak tekućih boravaka klijenta (sf-akt) pokazuje fx3');
  const d1 = await E.ev('addDays(todayISO(), 40)'), d2 = await E.ev('addDays(todayISO(), 43)');
  const pomak = await E.ev(`(() => { const [a, b] = todayISO().split('-').map(Number), [c, d] = ${JSON.stringify(d1)}.split('-').map(Number); return (c - a) * 12 + d - b; })()`);
  for (let i = 0; i < pomak; i++) await E.klik('#sheetBody [data-act="dr-nav"][data-id="1"]', { w: 150 });
  await E.klik(`#sheetBody [data-act="dr-pick"][data-id="${d1}"]`);
  await E.klik(`#sheetBody [data-act="dr-pick"][data-id="${d2}"]`);
  ok(/Trajanje: 3 noćenja/.test(await E.tekst('#sheetBody .dr-foot')), 'termin izabran: ' + await E.tekst('#sheetBody .dr-foot'));
  ok(/Sačuvaj boravak/.test(await E.tekst('#sheetFoot')) && (await E.stanje()).foot, 'traka „Sačuvaj boravak"');
  const n0 = await E.ev('D.stays.length');
  await E.klik('#sheetFoot [data-act="sf-save"]'); await E.posleSave(bilj);
  s = await E.stanje();
  const novi = await E.ev(`JSON.parse(JSON.stringify(D.stays.find(s => s.from === ${JSON.stringify(d1)} && s.clientId === ${JSON.stringify(cid)}) || null))`);
  ok(await E.ev('D.stays.length') === n0 + 1 && novi && JSON.stringify(novi.petIds) === JSON.stringify([pid]) && novi.to === d2, 'nov boravak upisan sa tim ljubimcem: ' + JSON.stringify(novi && { from: novi.from, to: novi.to, petIds: novi.petIds }));
  ok(s.sf === 'fx3' && s.k === 'boravak' && s.idx === 1, 'vraćeno u prethodni boravak fx3: ' + JSON.stringify(s));
  ok(s.modal === 'Nema broja telefona', 'ponuda potvrde: bez broja -> „Nema broja telefona": ' + s.modal);
  await E.klik('#modalHost [data-act="client-open"]', { tekst: 'Upiši broj' });
  s = await E.stanje();
  ok(s.CE === cid && s.idx === 2 && s.ocek === 2, '„Upiši broj" otvara karticu vlasnika: ' + JSON.stringify(s));
  await E.klik('#modalHost .sheet-x[data-act="modal-close"]');
  s = await E.stanje();
  ok(!s.CE && s.sf === 'fx3' && s.idx === 1, 'krstić kartice vraća u boravak: ' + JSON.stringify(s));
});

await tok('Kartica vlasnika: Klijenti -> boravak -> strelica nazad -> kartica; Izmijeni podatke', async (E, ok, bilj) => {
  const fx1 = await E.st('fx1');
  const cid = fx1.clientId;
  const ime = await E.ev(`clientById(${JSON.stringify(cid)}).name`);
  await E.klik('#tabbar [data-act="tab"][data-id="klijenti"]');
  ok(await E.ev(`$('#fabWrap').style.display`) === 'none', 'u Klijentima nema dugmeta +');
  await E.upisi('#klSearch', ime);
  await E.klik(`#klList [data-act="client-open"][data-id="${cid}"]`);
  let s = await E.stanje();
  ok(s.CE === cid && s.idx === 1, 'kartica vlasnika otvorena: ' + JSON.stringify(s));
  ok(await E.ima('#modalHost .ce-akcije [data-act="ce-new-stay"]') === 1 && await E.ima('#modalHost .ce-akcije [data-act="ce-edit"]') === 1, 'gore: „Dodaj broj" + „Novi boravak" (nema telefona)');
  const nRed0 = await E.ima('#modalHost [data-act="ce-stay-open"]');
  if (await E.ima('#modalHost [data-act="ce-sve"]')){
    await E.klik('#modalHost [data-act="ce-sve"]');
    const n1 = await E.ima('#modalHost [data-act="ce-stay-open"]');
    ok(n1 > nRed0, `Prikaži sve: ${nRed0} -> ${n1} boravaka`);
  }
  ok(/\d\d\.\d\d\. – \d\d\.\d\d\./.test(await E.tekst('#modalHost .ce-stays .row-name')), 'kratki datumi (fmtRaspon): ' + await E.tekst('#modalHost .ce-stays .row-name'));
  await E.klik('#modalHost [data-act="ce-stay-open"][data-id="fx1"]');
  s = await E.stanje();
  ok(!s.CE && s.sf === 'fx1' && s.idx === 1 && s.back === ime, 'boravak iz kartice, strelica „' + s.back + '": ' + JSON.stringify(s));
  await E.klik('#sheetBack');
  s = await E.stanje();
  ok(s.CE === cid && !s.sheet && s.idx === 1, 'strelica nazad -> kartica vlasnika: ' + JSON.stringify(s));
  // Izmijeni podatke -> promjena telefona -> krstić pita
  const kl0 = await E.ev('JSON.stringify(D.clients)');
  await E.db();
  await E.klik('#modalHost [data-act="ce-edit"]', { tekst: 'Izmijeni podatke' });
  ok(await E.vidljiv('#cePhone') && await E.vidljiv('#ceName'), 'izmjena: polja vlasnika');
  await E.upisi('#cePhone', '067 111 222');
  await E.klik('#modalHost .sheet-x[data-act="modal-close"]');
  s = await E.stanje();
  ok(s.modal === 'Odbaciti izmjene?' && s.CE === cid, 'krstić sa diranim telefonom pita „Odbaciti izmjene?": ' + s.modal);
  await E.klik('#modalHost [data-act="ce-back"]');
  ok(await E.vr('#cePhone') === '067 111 222', 'Otkaži vraća u izmjenu, telefon ostaje ukucan');
  await E.klik('#modalHost .sheet-x[data-act="modal-close"]');
  await E.klik('#modalHost [data-act="ce-discard"]');
  s = await E.stanje();
  ok(!s.CE && !s.modal && s.idx === 0, 'Odbaci zatvara karticu: ' + JSON.stringify(s));
  ok(await E.ev('JSON.stringify(D.clients)') === kl0 && !(await E.db()).length, 'Odbaci: clients identičan, ništa upisano');
  // Sačuvaj upisuje samo telefon
  await E.klik(`#klList [data-act="client-open"][data-id="${cid}"]`);
  await E.klik('#modalHost [data-act="ce-edit"]', { tekst: 'Izmijeni podatke' });
  await E.upisi('#cePhone', '067 111 222');
  await E.klik('#modalHost [data-act="ce-form-save"]');
  const log = await E.db();
  const razlika = await E.ev(`(() => { const a = JSON.parse(${JSON.stringify(kl0)}), b = D.clients; const r = [];
    if (a.length !== b.length) r.push('broj ' + a.length + '->' + b.length);
    a.forEach((c, i) => { const n = b[i]; Object.keys(Object.assign({}, c, n)).forEach(k => { if (JSON.stringify(c[k]) !== JSON.stringify(n[k])) r.push(c.id + '.' + k); }); });
    return r; })()`);
  ok(JSON.stringify(razlika) === JSON.stringify([cid + '.phone']), 'promijenjeno SAMO polje telefon: ' + JSON.stringify(razlika));
  ok(JSON.stringify(log) === JSON.stringify([['save', 'clients', cid]]), 'jedan upis (clients ' + cid + '): ' + JSON.stringify(log));
  ok(await E.ima('#modalHost .ce-akcije a[href="tel:067 111 222"]') === 1, 'kartica sad ima dugme poziva sa brojem');
  rucno('8.1', await E.ev(`(() => { const u = decodeURIComponent(smsPotvrdaURI(D.stays.find(s => s.id === 'fx1'))); return u.startsWith('sms:067111222?body=') && /Avans/.test(u) && /Ostatak/.test(u) && /hranu/.test(u) && /08:00/.test(u) && /Dolazak/.test(u); })()`), 'tekst poruke (datumi, iznos, avans, ostatak, hrana, termini), ?body= za ne-iPhone');
  // zatvaranje bez izmjena ne upisuje ništa
  const kl1 = await E.ev('JSON.stringify(D.clients)');
  await E.klik('#modalHost .sheet-x[data-act="modal-close"]');
  await E.klik(`#klList [data-act="client-open"][data-id="${cid}"]`);
  await E.klik('#modalHost [data-act="ce-edit"]', { tekst: 'Izmijeni podatke' });
  await E.klik('#modalHost .sheet-x[data-act="modal-close"]');
  s = await E.stanje();
  ok(!s.CE && !s.modal && s.idx === 0, 'izmjena bez promjena: krstić zatvara bez pitanja');
  await E.klik(`#klList [data-act="client-open"][data-id="${cid}"]`);
  await E.nazad();
  s = await E.stanje();
  ok(!s.CE && s.idx === 0, 'sistemsko nazad zatvara karticu');
  ok(await E.ev('JSON.stringify(D.clients)') === kl1 && !(await E.db()).length, 'zatvaranje bez izmjena: clients identičan, nijedan upis');
  // Novi boravak iz kartice (vlasnik sad ima broj) -> ponuda potvrde porukom
  await E.klik(`#klList [data-act="client-open"][data-id="${cid}"]`);
  await E.klik('#modalHost [data-act="ce-new-stay"]');
  s = await E.stanje();
  ok(s.sf === 'novi' && s.back === ime && s.idx === 1, 'Novi boravak iz kartice, strelica vodi u karticu: ' + JSON.stringify(s));
  const d1 = await E.ev('addDays(todayISO(), 50)'), d2 = await E.ev('addDays(todayISO(), 52)');
  const pomak = await E.ev(`(() => { const [a, b] = todayISO().split('-').map(Number), [c, d] = ${JSON.stringify(d1)}.split('-').map(Number); return (c - a) * 12 + d - b; })()`);
  for (let i = 0; i < pomak; i++) await E.klik('#sheetBody [data-act="dr-nav"][data-id="1"]', { w: 150 });
  await E.klik(`#sheetBody [data-act="dr-pick"][data-id="${d1}"]`);
  await E.klik(`#sheetBody [data-act="dr-pick"][data-id="${d2}"]`);
  await E.klik('#sheetFoot [data-act="sf-save"]'); await E.posleSave(bilj);
  s = await E.stanje();
  ok(s.modal === 'Boravak je upisan' && await E.ima('#modalHost a[data-act="sms-salji"][href^="sms:"]') === 1, 'poslije upisa: „Boravak je upisan" + Pošalji (sms:)');
  ok(s.CE === cid && !s.sheet, 'poslije upisa vraća u karticu vlasnika: ' + JSON.stringify(s));
  rucno('8.0', s.modal === 'Boravak je upisan' && await E.ima('#modalHost [data-act="modal-close"]') >= 1, 'Ne sad / Pošalji');
  await E.klik('#modalHost .modal-actions [data-act="modal-close"]');
});

/* ======================= KALENDAR ======================= */
await tok('Kalendar: dan -> boravak -> nazad; slobodan boks; Boksevi skroluje do danas', async (E, ok, bilj) => {
  await E.klik('#tabbar [data-act="tab"][data-id="kalendar"]');
  await E.klik(`#view .cal-cell[data-act="day-open"][data-id="${E.t}"]`);
  let s = await E.stanje();
  ok(s.k === 'dan' && s.kid === E.t && s.idx === 1, 'dan iz kalendara: ' + s.naslov);
  const sekcije = await E.ev(`[...document.querySelectorAll('#sheetBody .sec-title')].map(e => e.textContent.trim().split(/\\s/)[0])`);
  ok(JSON.stringify(sekcije.slice(0, 3)) === JSON.stringify(['Dolaze', 'Odlaze', 'Ostaju']), 'redoslijed kao na Danas: ' + sekcije.join(', '));
  ok(await E.ima('#sheetBody [data-act="stay-arrived"][data-id="fx4"]') === 1 && await E.ima('#sheetBody [data-act="stay-left"][data-id="fx1"]') === 1, 'današnji dan ima Došao/Otišao');
  ok(await E.ima('#sheetBody .free-gr .free-gr-ime') >= 1, 'slobodni boksevi po grupi');
  const row = E.page.locator('#sheetBody .row-tap[data-act="stay-edit"][data-id="fx3"]');
  await row.scrollIntoViewIfNeeded(); await E.W(150);
  const top0 = await E.ev(`$('#sheetBody').scrollTop`);
  await row.click(); await E.W(350);
  s = await E.stanje();
  ok(s.sf === 'fx3' && s.idx === 2 && s.back.length > 0, 'boravak iz dana, strelica „' + s.back + '"');
  await E.klik('#sheetBack');
  s = await E.stanje();
  ok(s.k === 'dan' && s.kid === E.t && s.idx === 1, 'strelica vraća na dan: ' + JSON.stringify(s));
  ok(Math.abs(s.top - top0) <= 2, `dan na istom mjestu (${s.top} / ${Math.round(top0)})`);
  rucno('15.0', JSON.stringify(sekcije.slice(0, 3)) === JSON.stringify(['Dolaze', 'Odlaze', 'Ostaju']), 'redoslijed je sada Dolaze / Odlaze / Ostaju (kao Danas), današnji dan ima Došao/Otišao');
  rucno('15.1', s.k === 'dan' && Math.abs(s.top - top0) <= 2, 'nazad na dan na isto mjesto');
  // čip slobodnog boksa
  const chip = E.page.locator('#sheetBody .free-gr .chip[data-act="grid-new"]').first();
  const box = await chip.getAttribute('data-box');
  await chip.click(); await E.W(350);
  s = await E.stanje();
  ok(s.sf === 'novi' && s.naslov === 'Novi boravak' && s.idx === 2, 'čip slobodnog boksa otvara novi boravak');
  ok(await E.ev(`SF.from === todayISO() && SF.boxes.length === 1 && SF.boxes[0].b === ${JSON.stringify(box)}`), 'novi boravak od danas u boksu ' + box);
  await E.nazad();
  s = await E.stanje();
  ok(s.k === 'dan' && s.idx === 1 && !s.modal, 'nazad iz neizmijenjenog novog boravka vraća na dan bez pitanja');
  // čip iz Mali boksevi
  await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
  await E.klik('#tabbar [data-act="tab"][data-id="danas"]');
  await E.klik('#view [data-act="group-open"][data-id="mb"]');
  const chip2 = E.page.locator('#sheetBody .chips .chip[data-act="grid-new"]').first();
  const box2 = await chip2.getAttribute('data-box').catch(() => null);
  if (box2){ await chip2.click(); await E.W(350);
    ok(await E.ev(`SF && !SF.id && SF.from === todayISO() && SF.boxes[0].b === ${JSON.stringify(box2)}`), 'čip „Slobodno danas" u Mali boksevi otvara novi boravak u ' + box2);
    await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
  } else bilj('Mali boksevi: nema slobodnog boksa danas');
  // Boksevi
  await E.klik('#tabbar [data-act="tab"][data-id="kalendar"]');
  await E.klik('#view [data-act="cal-view"][data-id="grid"]', { w: 600 });
  const g = await E.ev(`(() => { const w = $('.bgrid-wrap'), r = $('.today-row'), h = $('.bgrid thead');
    const wr = w.getBoundingClientRect(), rr = r.getBoundingClientRect(), hh = h.getBoundingClientRect().height;
    return { top: Math.round(w.scrollTop), vidi: rr.top >= wr.top + hh - 2 && rr.bottom <= wr.bottom + 2, rt: Math.round(rr.top - wr.top), hh: Math.round(hh) }; })()`);
  ok(g.top > 0 && g.vidi, 'Boksevi skroluje do današnjeg reda: ' + JSON.stringify(g));
  ok(await E.ev(`localStorage.getItem('cindyland-calview')`) === 'grid', 'prikaz Boksevi se pamti');
  const wb = await E.page.locator('.bgrid-wrap').boundingBox();
  await E.page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2);
  await E.page.mouse.wheel(260, 0); await E.W(300);
  const gi = await E.ev(`(() => { const w = $('.bgrid-wrap'), wr = w.getBoundingClientRect();
    const th = document.querySelector('.grp-row th.g-mb'), sp = th.querySelector('.grp-ime'), tr = th.getBoundingClientRect(), sr = sp.getBoundingClientRect();
    return { sl: Math.round(w.scrollLeft), thL: Math.round(tr.left - wr.left), imeL: Math.round(sr.left - wr.left), imeR: Math.round(wr.right - sr.right) }; })()`);
  ok(gi.sl > 0 && gi.thL < 0 && gi.imeL >= 60 && gi.imeR >= 0, 'ime grupe ostaje vidljivo pri vodoravnom skrolu: ' + JSON.stringify(gi));
  await E.klik('#view tr.today-row td.bg-cell.free[data-act="grid-new"]');
  s = await E.stanje();
  ok(s.sf === 'novi' && await E.ev('SF.from === todayISO() && SF.boxes.length === 1'), 'slobodna ćelija tabele = novi boravak za taj dan i boks');
  await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
  await E.klik('#view tr.today-row td.bg-cell[data-act="stay-edit"]');
  ok((await E.stanje()).k === 'boravak' && (await E.stanje()).sf !== 'novi', 'zauzeta ćelija otvara boravak');
});

/* ======================= NENAPLAĆENO ======================= */
await tok('Nenaplaćeno: Naplati iz spiska, spisak se osvježi i ostane otvoren; Starije od 45 dana', async (E, ok) => {
  await E.klik('#tabbar [data-act="tab"][data-id="zarada"]');
  const traka = await E.tekst('#view [data-act="unpaid-open"]');
  ok(/Nenaplaćeno/.test(traka), 'traka Nenaplaćeno u Finansijama: ' + traka);
  await E.klik('#view [data-act="unpaid-open"]');
  const n0 = await E.ima('#sheetBody [data-act="charge"]');
  const z0 = await E.tekst('#sheetBody .nen-zbir');
  ok(await E.ima('#sheetBody [data-act="charge"][data-id="fx5"]') === 1, 'fx5 u spisku (' + n0 + ' redova, ' + z0 + ')');
  await E.klik('#sheetBody [data-act="charge"][data-id="fx5"]');
  ok((await E.stanje()).modal === 'Naplata', 'prozor Naplata');
  await E.klik('#modalHost [data-act="nm-ok"]');
  let s = await E.stanje();
  ok(s.sheet && s.naslov === 'Nenaplaćeno' && !s.modal && s.idx === 1, 'spisak ostaje otvoren: ' + JSON.stringify(s));
  ok(await E.ima('#sheetBody [data-act="charge"][data-id="fx5"]') === 0 && await E.ima('#sheetBody [data-act="charge"]') === n0 - 1, 'fx5 nestao, spisak osvježen');
  ok((await E.tekst('#sheetBody .nen-zbir')) !== z0, 'zbir osvježen: ' + await E.tekst('#sheetBody .nen-zbir'));
  ok((await E.st('fx5')).paid === true, 'fx5 naplaćen');
  const st = await E.tekst('#sheetBody [data-act="nen-starije"]');
  ok(/Starije od 45 dana/.test(st), 'sklopljeno „Starije od 45 dana": ' + st);
  await E.klik('#sheetBody [data-act="nen-starije"]');
  const n2 = await E.ima('#sheetBody [data-act="charge"]');
  ok(n2 > n0, `Starije se otvara (${n0 - 1} -> ${n2} redova)`);
  const red = E.page.locator('#sheetBody .card').nth(1).locator('.row-tap[data-act="stay-edit"]').nth(3);
  await red.scrollIntoViewIfNeeded(); await E.W(150);
  const top0 = await E.ev(`$('#sheetBody').scrollTop`);
  await red.click(); await E.W(350);
  ok((await E.stanje()).k === 'boravak', 'dodir na ime otvara boravak');
  await E.klik('#sheetBack');
  s = await E.stanje();
  ok(s.naslov === 'Nenaplaćeno' && Math.abs(s.top - top0) <= 2 && await E.ima('#sheetBody [data-act="charge"]') === n2, `nazad vraća na spisak na isto mjesto (${s.top} / ${Math.round(top0)}), Starije i dalje otvoreno`);
  rucno('18.0', await E.ev(`unpaidStays().every(s => !s.paid && chargeDue(s) > 0)`), 'završeni nenaplaćeni iz 45 dana; starije u sklopljenom redu');
  rucno('18.1', s.naslov === 'Nenaplaćeno' && Math.abs(s.top - top0) <= 2, 'dodir na ime -> boravak -> nazad na isto mjesto');
  rucno('18.2', true, 'Naplati X € -> prozor naplate, spisak se osvježi');
});

/* ======================= ZNAK „!" ======================= */
await tok('Znak „!" na redovima sa napomenom ljubimca i napomenom boravka', async (E, ok, bilj) => {
  const znak = id => E.ima(`#view .row-tap[data-id="${id}"] .row-name-w .nap-znak`);
  ok(await znak('fx3') === 1, 'fx3 (ljubimac sa napomenom) ima „!"');
  ok(await znak('fx6') === 1, 'fx6 (veliki pas, kapi) ima „!"');
  ok(await znak('fx1') === 0 && await znak('fx4') === 0, 'fx1 i fx4 bez napomene nemaju „!"');
  await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx3"]');
  const pid = (await E.st('fx3')).petIds[0];
  ok(await E.ima(`#sheetBody .pp[data-id="${pid}"] .pp-nap .nap-znak`) === 1, '„!" na kružiću ljubimca');
  ok(/Oće da ujede/.test(await E.tekst('#sheetBody .nap-box')), 'žuta napomena ljubimca u formi');
  await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
  await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx4"]');
  await E.klik('#sheetBody [data-act="sf-otv"][data-id="napomena"]');
  await E.upisi('#sfNote', 'Nosi svoju hranu');
  await E.klik('#sheetFoot [data-act="sf-save"]'); await E.posleSave(bilj);
  ok((await E.st('fx4')).note === 'Nosi svoju hranu', 'napomena boravka sačuvana');
  ok(await znak('fx4') === 1, 'fx4 (napomena boravka) sada ima „!"');
  await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx4"]');
  ok(/Ovaj boravak Nosi svoju hranu/.test(await E.tekst('#sheetBody .nap-box')), 'žuta napomena „Ovaj boravak" u formi');
  await E.klik('#sheetBody .nap-row[data-act="sf-otv-nap"]');
  ok(await E.vidljiv('#sfNote'), 'dodir na napomenu otvara red Napomena');
  await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
  await E.klik('#tabbar [data-act="tab"][data-id="kalendar"]');
  await E.klik(`#view .cal-cell[data-act="day-open"][data-id="${E.t}"]`);
  ok(await E.ima(`#sheetBody .row-tap[data-id="fx4"] .nap-znak`) === 1 && await E.ima(`#sheetBody .row-tap[data-id="fx3"] .nap-znak`) === 1, '„!" i u danu iz kalendara');
});

/* ======================= STARI DEPOZIT ======================= */
await tok('Stari zapis sa deposit (fx7) postaje avans (učitan sa servera / fixture)', async (E, ok) => {
  // fixture pravi fx7 sa deposit: 50 i pušta stayIzDepozita (isti put kao DB_UNMAP pri učitavanju sa servera)
  const s = await E.st('fx7');
  const dat = await E.ev(`isoFromDate(new Date(D.stays.find(s => s.id === 'fx7').createdAt))`);
  ok(s.deposit == null && JSON.stringify(s.payments) === JSON.stringify([{ a: 50, d: dat, av: 1 }]), 'fx7: deposit -> uplata avansa 50 sa datumom upisa (' + dat + '): ' + JSON.stringify(s.payments));
  const s8 = await E.st('fx8');
  ok(s8.deposit == null && JSON.stringify(s8.payments) === JSON.stringify([{ a: 40, d: s8.payments[0].d, av: 1 }]), 'fx8 (rezervacija): avans 40: ' + JSON.stringify(s8.payments));
  ok(await E.ev(`(() => { const a = { from: '2026-11-01', price: 100, deposit: 40, payments: [{ a: 40, d: '2026-10-01' }] }; stayIzDepozita(a);
    const b = { from: '2026-11-01', price: 100, deposit: 30, payments: [{ a: 100, d: '2026-11-05' }] }; stayIzDepozita(b);
    return a.payments.length === 1 && a.payments[0].av === 1 && b.payments.length === 1 && !b.payments[0].av; })()`), 'pravilo duplikata: depozit već upisan kao uplata se ne dodaje drugi put');
  await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx7"]');
  const nv = await E.tekst('#sheetBody .sf-novac');
  ok(nv.includes(await E.novac(50)) && nv.includes(await E.ev(`fmtD(${JSON.stringify(dat)})`)) && /za naplatu/.test(nv) && nv.includes(await E.novac(70)), 'forma: avans 50 € (datum), za naplatu 70 €: ' + nv);
  await E.klik('#sheetBody [data-act="sf-otv"][data-id="novac"]');
  ok(await E.vr('#sfAvans') === '50', 'polje Avans = 50');
  await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
  await E.klik('#view [data-act="stay-left"][data-id="fx7"]');
  ok(/avans · /.test(await E.tekst('#modalHost .pay-list')), 'prozor Odlazak: „avans · datum"');
  await E.klik('#modalHost [data-act="nm-otkazi"]');
  await E.klik('#tabbar [data-act="tab"][data-id="zarada"]');
  const fin = await E.tekst('#view .row[data-act="stay-edit"][data-id="fx7"]');
  ok(/avans/.test(fin) && fin.includes(await E.novac(50)), 'Finansije: avans fx7 u mjesecu prijema: ' + fin);
});

await tok('Stari zapis sa deposit u memoriji telefona -> ponovno pokretanje app-a', async (E, ok) => {
  // telefon sa podacima stare verzije: u localStorage boravak ima kolonu deposit (i createdAt), bez uplata
  await E.ev(`(() => { const d = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const a = d.stays.find(s => s.id === 'fx7'); a.deposit = 50; a.payments = null;
    const b = d.stays.find(s => s.id === 'fx8'); b.deposit = 40; b.payments = [{ a: 40, d: addDays(b.from, -20) }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); })()`);
  const n0 = await E.ev('D.stays.length');
  await E.page.reload(); await E.page.waitForFunction(() => typeof APP_SHOWN !== 'undefined' && APP_SHOWN && D.stays.length > 100); await E.W(300);
  const n1 = await E.ev('D.stays.length');
  ok(n1 === n0 && await E.ev(`D.stays.some(s => s.id === 'fx1')`), `lokalni podaci preživljavaju pokretanje (prije ${n0}, poslije ${n1} boravaka, fx* ${await E.ev("D.stays.some(s => s.id === 'fx1')") ? 'postoje' : 'NESTALI'})`);
  const greska = await E.ev(`(() => { try { JSON.parse(localStorage.getItem(STORAGE_KEY)); return loadLocal.toString().includes('stayIzDepozita') ? 'loadLocal zove stayIzDepozita' : ''; } catch (e){ return String(e); } })()`);
  if (n1 !== n0) ok(false, 'uzrok: ' + greska + ' -> stayIzDepozita -> isoFromDate -> pad, a `const pad` (red 921) je definisan POSLIJE `let D = loadLocal()` (red 901): ReferenceError u loadLocal, catch vraća defaultData() i odbacuje sve lokalne podatke (probni režim ih zamijeni demo istorijom)');
  const s = await E.st('fx7');
  if (!s) return;
  const dat = await E.ev(`isoFromDate(new Date(D.stays.find(s => s.id === 'fx7').createdAt))`);
  ok(s.deposit == null && JSON.stringify(s.payments) === JSON.stringify([{ a: 50, d: dat, av: 1 }]), 'fx7: deposit -> uplata avansa 50 sa datumom upisa (' + dat + '): ' + JSON.stringify(s.payments));
  const s8 = await E.st('fx8');
  ok(s8.deposit == null && s8.payments.length === 1 && s8.payments[0].av === 1 && s8.payments[0].a === 40, 'fx8 duplikat (deposit = uplata bez oznake): jedan avans, ne dva: ' + JSON.stringify(s8.payments));
  await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx7"]');
  const nv = await E.tekst('#sheetBody .sf-novac');
  ok(nv.includes(await E.novac(50)) && nv.includes(await E.ev(`fmtD(${JSON.stringify(dat)})`)) && /za naplatu/.test(nv) && nv.includes(await E.novac(70)), 'forma: avans 50 € (datum), za naplatu 70 €: ' + nv);
  await E.klik('#sheetBody [data-act="sf-otv"][data-id="novac"]');
  ok(await E.vr('#sfAvans') === '50', 'polje Avans = 50');
  await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
  await E.klik('#tabbar [data-act="tab"][data-id="zarada"]');
  const fin = await E.tekst('#view .row[data-act="stay-edit"][data-id="fx7"]');
  ok(/avans/.test(fin) && fin.includes(await E.novac(50)), 'Finansije: avans fx7 u mjesecu prijema: ' + fin);
});

/* ======================= OBILAZAK ZA INVENTAR ======================= */
await tok('Obilazak svih ekrana (inventar)', async (E, ok, bilj) => {
  const korak = async (opis, fn) => { try { await fn(); } catch (e){
      const m = String(e.message || e).split('\n'); const l = m.find(x => /waiting for locator/.test(x)) || '';
      bilj('obilazak „' + opis + '" prekinut: ' + m[0].slice(0, 90) + ' ' + l.trim().slice(0, 160));
      await zatvoriSve(); await E.ev(`setTab('danas')`); } };
  async function zatvoriSve(){ await E.ev(`(() => { NM = null; SF_ZATVORI = null; closeModal(); PE = null; CE = null; ZOOM = null; if (sheetOpen) sheetSkloni(); })()`); for (let i = 0; i < 8 && await E.ev('__idx()'); i++){ await E.ev('POP_SKIP = true; history.back()'); await E.W(120); } await E.ev('POP_SKIP = false'); await E.W(100); }
  const t = E.t;
  // Okvir + Danas
  await korak('okvir', async () => {
    const tabs = await E.ev(`[...document.querySelectorAll('#tabbar .tab')].map(b => b.dataset.id + ':' + (b.querySelector('.tab-lbl') || {}).textContent)`);
    rucno('0.0', tabs.length === 5 && SRC.includes('tab-dot'), 'tabovi sa natpisima: ' + tabs.join(', '));
    rucno('0.2', await E.ima('#tabbar .side-add[data-act="stay-new"]') === 1 && await E.ima('#tabbar .side-add[data-act="dates-check"]') === 1 && await E.ima('#tabbar .side-foot') === 1, 'bočna traka (vidi se na računaru)');
    rucno('0.5', SRC.includes('nije sačuvan na server') && typeof (await E.ev('typeof toast')) === 'string', 'toast + poruka greške upisa u kodu');
    rucno('0.6', await E.ev(`typeof dayTick === 'function' && typeof initRealtime === 'function' && typeof loadAll === 'function'`), 'dayTick / loadAll / initRealtime');
    rucno('0.7', /if \(CE && !CE\.pitanje\)[\s\S]{0,80}renderClientPop[\s\S]{0,200}renderPetPop[\s\S]{0,200}renderDatesCheck/.test(SRC), 'loadAll preračunava kartice i Provjeri datume');
    rucno('0.8', /user-scalable=no/.test(SRC), 'meta viewport user-scalable=no');
    rucno('1.1', await E.ev(`Number($('.hero-num').firstChild.textContent) === petsHereOn(todayISO())`), 'brojčanik = petsHereOn');
    rucno('1.3', await E.ev(`!!$('.hero-sjutra') || !(D.stays.some(s => s.from === addDays(todayISO(), 1) || s.to === addDays(todayISO(), 1)))`), 'Sjutra: ' + await E.tekst('.hero-sjutra'));
    rucno('1.2', await E.ima('#view .gtile[data-act="group-open"]') === 3, 'tri pločice: broj ljubimaca u grupi + „slobodno N" / „puno" (umjesto „zauzeto X od Y")');
    rucno('1.6', /^do \d\d\.\d\d\.$/.test(await E.tekst('#view .row:has(.row-tap[data-id="fx3"]) .row-side .badge')), 'Ostaju: „do dd.mm."');
    rucno('1.8', SRC.includes('Danas nema nikoga u pansionu'), 'tekst praznog stanja u kodu');
    await E.klik('#fab');
    ok(await E.vidljiv('#fabWrap [data-act="stay-new"]') && await E.vidljiv('#fabWrap [data-act="dates-check"]'), 'dugme + otvara Dodaj boravak / Provjeri datume');
    await E.klik('#fabScrim');
    ok(!(await E.ev(`$('#fabWrap').classList.contains('open')`)), 'klik pored sklanja radnje dugmeta +');
  });
  // Spisak grupe + osvježavanje poslije štrika
  await korak('grupa', async () => {
    await E.klik('#view [data-act="group-open"][data-id="mb"]');
    await E.klik('#sheetBody [data-act="stay-left"][data-id="fx1"]');
    await E.klik('#modalHost [data-act="nm-kasnije"]');
    rucno('2.2', await E.ima('#sheetBody [data-act="stay-left"][data-id="fx1"]') === 0 && (await E.stanje()).k === 'grupa', 'poslije Otišao spisak grupe precrtan, fx1 nema dugme Otišao');
    await zatvoriSve();
  });
  // Forma postojećeg boravka (fx3) + boks
  await korak('forma postojeći', async () => {
    await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx3"]');
    await E.klik('#sheetBody [data-act="sms-bez-broja"]');
    ok((await E.stanje()).modal === 'Nema broja telefona', 'ikonica poruke bez broja -> „Nema broja telefona"');
    rucno('8.3', true, 'ikonica poruke u formi upisanog boravka');
    await E.klik('#modalHost .modal-actions [data-act="modal-close"]');
    await E.klik('#sheetBody [data-act="sf-otv"][data-id="termin"]');
    await E.klik('#sheetBody [data-act="dr-nav"][data-id="1"]'); await E.klik('#sheetBody [data-act="dr-nav"][data-id="-1"]');
    await E.klik('#sheetBody [data-act="sf-type"][data-id="dnevni"]'); await E.klik('#sheetBody [data-act="sf-type"][data-id="pansion"]');
    rucno('3.7', SRC.includes('Pravi boksevi su puni') && SRC.includes('Sve je popunjeno'), 'upozorenja u kodu (red Termin)');
    await E.klik('#sheetBody [data-act="sf-otv"][data-id="napomena"]');
    rucno('3.9', await E.vidljiv('#sfNote'), 'napomena boravka u redu „Napomena"');
    await E.klik('#sheetBody [data-act="sf-otv"][data-id="novac"]');
    rucno('3.10', await E.vidljiv('#sfPrice') && await E.vidljiv('#sfAvans') && /Po cjenovniku/.test(await E.tekst('#sheetBody .sf-red-t .hint')) && await E.ima('#sfDue') === 1, 'Ukupno + Avans + hint + živi obračun (u redu „Cijena i avans")');
    const nap0 = await E.tekst('#sheetBody [data-act="sf-charge"]');
    await E.upisi('#sfPrice', '200');
    const nap1 = await E.tekst('#sheetBody [data-act="sf-charge"]');
    rucno('3.11', nap0 !== nap1, `„Naplati X €" dok se kuca cijena: „${nap0}" -> „${nap1}" (iznos se računa iz SAČUVANOG boravka; poslije Naplati sa diranom formom prvo pita Sačuvaj/Odbaci); ostalo (Naplaćeno·poništi, Sve je plaćeno, Otišao) postoji`);
    await E.klik('#sheetFoot [data-act="sf-odbaci"]');
    rucno('3.15', await E.ev(`renderStayForm.toString().includes('!clientById(SF.clientId)')`), 'obrisan klijent -> pretraga (kod)');
    await E.klik('#sheetBody [data-act="sf-otv"][data-id="boks"]');
    rucno('4.4', await E.ima('#sheetBody .bsegs') === 1 && await E.ima('#sheetBody [data-act="sf-plan-show"]') === 1, '„Predloži raspored" i kad boks postoji');
    rucno('4.5', await E.ev(`typeof sfLeftLimit === 'function'`), 'sfLeftLimit');
    await E.klik('#sheetBody [data-act="sf-box-del"]');
    ok((await E.stanje()).modal === 'Ukloniti mjesto?', '✕ boksa pita „Ukloniti mjesto?"');
    await E.klik('#modalHost button[data-act="modal-close"]', { tekst: 'Otkaži' });
    await E.klik('#sheetBody [data-act="sf-box-move"]');
    await E.klik('#modalHost [data-act="mv-nav"][data-id="1"]').catch(() => {});
    await E.klik('#modalHost [data-act="mv-nav"][data-id="-1"]').catch(() => {});
    await E.klik('#modalHost [data-act="mv-pick"]').catch(() => {});
    ok(await E.ima('#modalHost #mvBox') === 1 && await E.ima('#modalHost [data-act="sf-box-move-do"]') === 1, 'Premjesti: prozor sa kalendarom i izborom boksa');
    await E.ev('closeModal()');
    await E.klik('#sheetBody [data-act="sf-plan-show"]');
    if (await E.ima('#sheetBody [data-act="sf-plan-take"]')) await E.klik('#sheetBody [data-act="sf-plan-take"]');
    if (await E.ima('#sheetFoot.on [data-act="sf-odbaci"]')) await E.klik('#sheetFoot [data-act="sf-odbaci"]');
    await E.klik('#sheetBody [data-act="stay-del"]');
    ok((await E.stanje()).modal === 'Obrisati boravak?' && await E.ima('#modalHost [data-act="stay-del-yes"]') === 1, 'Obriši boravak -> potvrda');
    await E.klik('#modalHost button[data-act="modal-close"]', { tekst: 'Otkaži' });
    // Došao/Otišao + poništavanje u formi (fx4)
    await zatvoriSve();
    await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx4"]');
    await E.klik('#sheetBody .sf-novac [data-act="stay-arrived"]');
    ok((await E.st('fx4')).arrivedAt === t && await E.ima('#sheetBody [data-act="sf-undo-arrived"]') === 1, 'Došao u formi + „poništi dolazak"');
    await E.klik('#sheetBody [data-act="sf-undo-arrived"]');
    ok((await E.st('fx4')).arrivedAt == null, 'poništi dolazak radi');
    await zatvoriSve();
    await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx1"]');
    ok(await E.ima('#sheetBody [data-act="sf-undo-left"]') === 1, 'otišao: „poništi" odlazak u formi');
    await E.klik('#sheetBody [data-act="sf-undo-left"]');
    ok((await E.st('fx1')).leftAt == null, 'poništi odlazak radi');
    await zatvoriSve();
  });
  // Kartica ljubimca (prikaz, izmjena, novi, toggle)
  await korak('kartica ljubimca', async () => {
    const pid = (await E.st('fx3')).petIds[0];
    await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx3"]');
    await E.klik(`#sheetBody .pp[data-act="pet-open"][data-id="${pid}"]`);
    rucno('9.1', await E.ima('#modalHost .pe-sub .badge') >= 1, 'značke: ' + await E.tekst('#modalHost .pe-sub'));
    rucno('9.2', /U pansionu do/.test(await E.tekst('#modalHost .pe-sada')), await E.tekst('#modalHost .pe-sada'));
    rucno('9.7', await E.ima('#modalHost .ce-stays [data-act="pe-stay-open"]') >= 1 && /i još \$\{stays\.length - SHOW\} starijih/.test(SRC),
      'boravci (6) su sada KLIKABILNI (pe-stay-open) - promjena u odnosu na inventar „NISU klikabilni"');
    await E.klik('#modalHost [data-act="pe-edit"]', { tekst: 'Izmijeni' });
    await E.klik('#modalHost [data-act="pe-pf-species"][data-id="macka"]');
    rucno('10.1', await E.ima('#modalHost .pe-av.av-m') === 1 && await E.ima('#modalHost .pe-sub') === 0, 'avatar prati izbor, bez znački');
    await E.klik('#modalHost [data-act="pe-pf-species"][data-id="pas"]');
    await E.klik('#modalHost [data-act="pe-pf-size"][data-id="veliki"]');
    await E.klik('#modalHost [data-act="pe-pf-sex"][data-id="muzjak"]'); await E.klik('#modalHost [data-act="pe-pf-sex"][data-id="muzjak"]');
    await E.klik('#modalHost [data-act="pe-pet-del"]');
    ok((await E.stanje()).modal === 'Obrisati ljubimca?', 'Obriši ljubimca -> potvrda');
    await E.klik('#modalHost [data-act="pe-back"]');
    await E.klik('#modalHost .sheet-x[data-act="modal-close"]');
    ok((await E.stanje()).modal === 'Odbaciti izmjene?', 'dirana izmjena ljubimca pita „Odbaciti izmjene?"');
    await E.klik('#modalHost [data-act="pe-discard"]');
    // novi ljubimac iz forme ide na boravak
    await E.klik('#sheetBody [data-act="pet-new"]');
    await E.upisi('#peName', 'Novko');
    await E.klik('#modalHost [data-act="pe-pf-save"]');
    const novi = await E.ev(`(D.pets.find(p => p.name === 'Novko') || {}).id`);
    rucno('10.5', novi && await E.ev(`SF.petIds.has(${JSON.stringify(novi)}) && D.stays.find(s => s.id === 'fx3').petIds.includes(${JSON.stringify(novi)})`), 'Novko odmah na boravku (i u D)');
    rucno('10.6', /Ljubimac je u međuvremenu obrisan/.test(SRC), 'kod');
    // sad vlasnik ima 2 ljubimca -> Skloni sa ovog boravka
    await E.klik(`#sheetBody .pp[data-act="pet-open"][data-id="${novi}"]`);
    ok(await E.ima('#modalHost [data-act="pe-stay-toggle"]') === 1, 'Skloni/Dodaj na ovaj boravak (vlasnik sa 2 ljubimca)');
    await E.klik('#modalHost [data-act="pe-stay-toggle"]');
    ok(!(await E.st('fx3')).petIds.includes(novi), 'Skloni sa ovog boravka upisuje odmah');
    await E.klik(`#sheetBody .pp[data-act="pet-open"][data-id="${pid}"]`);
    await E.klik('#modalHost [data-act="pe-client"]');
    ok((await E.stanje()).CE === (await E.st('fx3')).clientId, 'red Vlasnik u kartici ljubimca -> kartica vlasnika');
    await zatvoriSve();
  });
  // Kartica vlasnika (iz boravka): dodaj ljubimca, Gotovo, crna lista
  await korak('kartica vlasnika', async () => {
    const cid = (await E.st('fx3')).clientId;
    await E.klik('#view .row-tap[data-act="stay-edit"][data-id="fx3"]');
    await E.klik('#sheetBody .sf-vl [data-act="client-open"]');
    ok((await E.stanje()).CE === cid, 'red vlasnika u formi -> kartica vlasnika');
    rucno('12.2', false, 'polja vlasnika više nisu „živa" i ne upisuju se tiho pri zatvaranju: kartica je PRIKAZ, izmjena kroz „Izmijeni podatke" + Sačuvaj/Otkaži (namjerna promjena redizajna); prazno ime -> „Ime je obavezno" na Sačuvaj');
    rucno('12.5', await E.ima('#modalHost [data-act="ce-stay-open"]') <= 6 && SRC.includes("data-act=\"ce-sve\""), 'boravci: 6 najnovijih + „Prikaži sve (N)" umjesto 12 (klikabilni, ista zaštita od dvostrukog otvaranja)');
    rucno('12.6', /€/.test(await E.tekst('#modalHost .ce-sub')) || !(await E.ev(`D.stays.filter(s => s.clientId === ${JSON.stringify(cid)}).reduce((a, s) => a + stayPaidSum(s), 0)`)),
      'ukupno naplaćeno je sada u podnaslovu kartice („N boravaka · X €"): ' + await E.tekst('#modalHost .ce-sub'));
    await E.klik('#modalHost [data-act="ce-pet-new"]');
    await E.klik('#modalHost [data-act="ce-pf-species"][data-id="macka"]'); await E.klik('#modalHost [data-act="ce-pf-species"][data-id="pas"]');
    await E.klik('#modalHost [data-act="ce-pf-size"][data-id="veliki"]'); await E.klik('#modalHost [data-act="ce-pf-sex"][data-id="zenka"]');
    await E.klik('#modalHost [data-act="ce-pf-cancel"]');
    await E.klik('#modalHost [data-act="ce-pet-new"]');
    await E.upisi('#cePfName', 'Mini');
    await E.klik('#modalHost [data-act="ce-pf-save"]');
    const mini = await E.ev(`(D.pets.find(p => p.name === 'Mini') || {}).id`);
    const gotovo = await E.ima('#modalHost [data-act="ce-done"]');
    await E.klik('#modalHost .sheet-x[data-act="modal-close"]');
    const naBor = await E.ev(`SF && SF.petIds.has(${JSON.stringify(mini)})`);
    rucno('12.4', gotovo > 0 || naBor, `ljubimac dodat (${mini ? 'da' : 'ne'}); dugme Gotovo ${gotovo ? 'postoji' : 'NE postoji'}, krstić ga ${naBor ? 'stavlja' : 'NE stavlja'} na boravak - „dodat tačno jedan pa Gotovo = sam ide na boravak" više nije dostupno`);
    rucno('12.8', gotovo > 0, 'dugme Gotovo (ce-done) ' + (gotovo ? 'postoji' : 'ne postoji - kartica se zatvara samo krstićem/klikom pored/nazad'));
    rucno('3.3', await E.ima(`#sheetBody .pp[data-act="pet-open"]`) >= 1 && await E.ima('#sheetBody [data-act="pet-new"]') === 1, 'kružići ljubimaca + Dodaj');
    // crna lista
    await E.klik('#sheetBody .sf-vl [data-act="client-open"]');
    await E.klik('#modalHost [data-act="ce-edit"]', { tekst: 'Izmijeni podatke' });
    ok(await E.ima('#modalHost [data-act="ce-del"]') === 0, 'iz boravka nema Obriši klijenta');
    await E.klik('#modalHost [data-act="ce-black"]');
    await E.klik('#modalHost [data-act="ce-form-save"]');
    rucno('12.1', /Crna lista/.test(await E.tekst('#modalHost .banner')), 'traka Crna lista u kartici');
    await E.klik('#modalHost .sheet-x[data-act="modal-close"]');
    rucno('3.2', /Crna lista/.test(await E.tekst('#sheetBody .sf-vl .banner')), 'traka Crna lista u formi');
    rucno('12.9', /Klijent je u međuvremenu obrisan/.test(SRC), 'kod');
    await zatvoriSve();
  });
  // Novi boravak: izbor vlasnika, novi klijent
  await korak('novi boravak', async () => {
    await E.klik('#fab'); await E.klik('#fabWrap [data-act="stay-new"]');
    ok((await E.stanje()).naslov === 'Novi boravak' && await E.vidljiv('#sfClientQ'), 'Novi boravak: pretraga vlasnika');
    const fxc = await E.ev(`clientById(D.stays.find(s => s.id === 'fx6').clientId).name`);
    await E.upisi('#sfClientQ', fxc);
    await E.klik('#sfClientList [data-act="sf-client-pick"]');
    rucno('5.3', await E.ima('#sheetBody .sf-stanje') === 0 && await E.ima('#sheetBody [data-act="sf-left"]') === 0 && await E.ima('#sheetBody [data-act="sf-charge"]') === 0 && await E.vidljiv('#sfAvans'), 'nova forma bez stanja/dugmadi novca, ima Avans');
    const grupe0 = await E.ev(`[...document.querySelectorAll('#sfBox optgroup')].map(g => g.label)`);
    await E.klik(`#sheetBody [data-act="dr-pick"][data-id="${t}"]`);
    await E.klik(`#sheetBody [data-act="dr-pick"][data-id="${await E.ev('addDays(todayISO(), 2)')}"]`);
    const opc = await E.ev(`[...document.querySelectorAll('#sfBox option')].map(o => o.textContent)`);
    const meniOk = await E.ima('#sfBox') === 1 && JSON.stringify(grupe0) === '["Veliki boksevi"]' && opc.some(o => /zauzet|slobodan/.test(o));
    const hint = /upisaćeš kasnije|ostavi prazno/.test(SRC);
    rucno('4.0', meniOk && hint, 'padajući meni radi (samo grupa za vrstu: ' + grupe0.join(', ') + '; uz boks „' + (opc.find(o => /zauzet|slobodan/.test(o)) || 'nema oznake') + '"), boks i dalje nije obavezan'
      + (hint ? '' : ', ali hint „Ako još ne znaš gdje ide, ostavi prazno - upisaćeš kasnije." je uklonjen'));
    await E.klik('#sheet .sheet-x[data-act="sheet-close"]');
    const m = await E.stanje();
    rucno('5.5', m.modal === 'Boravak nije upisan' && await E.ima('#modalHost [data-act="sf-izlaz-sacuvaj"]') && await E.ima('#modalHost [data-act="sf-izlaz-odbaci"]') && await E.ima('#modalHost [data-act="sf-izlaz-otkazi"]'), m.modal);
    await E.klik('#modalHost [data-act="sf-izlaz-odbaci"]');
    await E.klik('#fab'); await E.klik('#fabWrap [data-act="stay-new"]');
    await E.upisi('#sfClientQ', 'Novak Probni');
    await E.klik('#sheetFab');
    rucno('6.1', await E.vr('#sfNcName') === 'Novak Probni' && await E.vidljiv('#sfNcPhone'), 'Ime (preneseno iz pretrage) + Telefon');
    await E.klik('#sheetBody [data-act="sf-client-clear"]');
    await E.klik('#sheetFab');
    await E.klik('#sheetBody [data-act="nc-black"]');
    await E.klik('#sheetBody [data-act="sf-pet-form"]');
    await E.klik('#sheetBody [data-act="sf-pf-species"][data-id="macka"]'); await E.klik('#sheetBody [data-act="sf-pf-species"][data-id="pas"]');
    await E.klik('#sheetBody [data-act="sf-pf-size"][data-id="veliki"]'); await E.klik('#sheetBody [data-act="sf-pf-sex"][data-id="muzjak"]');
    await E.upisi('#sfPfName', 'Rex');
    await E.klik('#sheetBody [data-act="sf-pf-add"]');
    await E.klik('#sheetBody [data-act="sf-newpet-del"]');
    await E.klik('#sheetBody [data-act="sf-pet-form"]'); await E.klik('#sheetBody [data-act="sf-pf-cancel"]');
    await E.klik('#sheetBody [data-act="sf-pet-form"]'); await E.upisi('#sfPfName', 'Rex'); await E.klik('#sheetBody [data-act="sf-pf-add"]');
    await E.klik('#sheetBody [data-act="sf-save-client"]');
    const nk = await E.ev(`(() => { const c = D.clients.find(c => c.name === 'Novak Probni'); return c ? { bl: !!c.blacklist, pets: petsOfClient(c.id).map(p => p.name), izabran: SF && SF.clientId === c.id && SF.petIds.size === 1 } : null; })()`);
    ok(nk && nk.bl && JSON.stringify(nk.pets) === '["Rex"]' && nk.izabran, 'novi klijent (crna lista, Rex) upisan i izabran na boravak: ' + JSON.stringify(nk));
    await zatvoriSve();
  });
  // Klijenti
  await korak('klijenti', async () => {
    await E.klik('#tabbar [data-act="tab"][data-id="klijenti"]');
    rucno('16.6', await E.ev(`$('#fabWrap').style.display`) === 'none', 'nema + u Klijentima');
    ok(await E.ima('#view [data-act="kl-jump"]') > 3, 'A-Ž traka');
    await E.klik('#view [data-act="kl-all"]');
    await E.upisi('#klSearch', 'ab');
    await E.klik('#view [data-act="kl-clear"]');
    ok(await E.vr('#klSearch') === '', 'krstić briše pretragu');
    const prvi = E.page.locator('#klList [data-act="client-open"]').first();
    await prvi.click({ button: 'right' }); await E.W(300);
    ok(await E.ima('#modalHost [data-act="kl-merge-start"]') === 1 && await E.ima('#modalHost [data-act="kl-menu-edit"]') === 1, 'meni na dugi dodir / desni klik');
    await E.klik('#modalHost [data-act="kl-merge-start"]');
    await E.klik('#klList [data-act="kl-merge-toggle"] >> nth=1');
    await E.klik('#view [data-act="kl-merge-do"]');
    ok((await E.stanje()).modal === 'Objediniti klijente?', 'Objedini -> potvrda');
    await E.klik('#modalHost button[data-act="modal-close"]', { tekst: 'Otkaži' });
    await E.klik('#view [data-act="kl-merge-cancel"]');
    await E.page.locator('#klList [data-act="client-open"]').first().click({ button: 'right' }); await E.W(300);
    await E.klik('#modalHost [data-act="kl-menu-edit"]');
    ok(!!(await E.stanje()).CE, 'Izmijeni podatke iz menija otvara karticu');
    await E.klik('#modalHost [data-act="ce-edit"]', { tekst: 'Izmijeni podatke' });
    ok(await E.ima('#modalHost [data-act="ce-del"]') === 1, 'Obriši klijenta (van boravka) u izmjeni');
    await E.klik('#modalHost [data-act="ce-del"]');
    await E.klik('#modalHost [data-act="ce-back"]');
    await E.klik('#modalHost [data-act="ce-form-cancel"]');
    await zatvoriSve();
  });
  // Kalendar
  await korak('kalendar', async () => {
    await E.klik('#tabbar [data-act="tab"][data-id="kalendar"]');
    if (await E.ev('CAL_VIEW') !== 'mreza') await E.klik('#view [data-act="cal-view"][data-id="mreza"]');
    rucno('13.3', await E.ima('#view .cal-legend') === 1, 'legenda');
    await E.klik('#view [data-act="cal-nav"][data-id="1"]');
    await E.klik('#view [data-act="cal-today"]');
    ok(await E.ev('CAL_YM === todayISO().slice(0, 7)'), 'dodir na naziv mjeseca vraća na tekući');
    for (let i = 0; i < 8; i++) await E.klik('#view [data-act="cal-nav"][data-id="1"]', { w: 120 });
    const prazan = await E.ev(`(() => { for (let d = 1; d <= daysInMonth(CAL_YM); d++){ const iso = CAL_YM + '-' + pad(d); if (!staysOnDate(iso).length) return iso; } return null; })()`);
    if (prazan){ await E.klik(`#view .cal-cell[data-id="${prazan}"]`); rucno('15.4', /Ovaj dan je prazan/.test(await E.tekst('#sheetBody')), 'prazan dan ' + prazan); await zatvoriSve(); }
    await E.klik('#view [data-act="cal-today"]');
    await E.klik('#view [data-act="cal-view"][data-id="grid"]');
    rucno('14.0', await E.ima('#view .bgrid thead tr.grp-row') === 1 && await E.ima('#view .bgrid thead tr.box-row') === 1 && await E.ima('#view td.bg-date') > 27, 'tabela dani × boksevi, red grupa');
    rucno('14.2', await E.ima('#view tr.today-row') === 1 && await E.ima('#view tr.ned') >= 4 && await E.ev(`typeof stayBoxesLive === 'function'`), 'danas + nedjelje istaknuti');
    await E.klik('#view tr.today-row td.bg-date[data-act="day-open"]');
    ok((await E.stanje()).k === 'dan', 'dodir na datum u tabeli -> dan');
    await zatvoriSve();
    await E.klik('#view [data-act="cal-view"][data-id="mreza"]');
  });
  // Finansije, Nenaplaćeno, Profil
  await korak('finansije/profil', async () => {
    await E.klik('#tabbar [data-act="tab"][data-id="zarada"]');
    rucno('17.1', await E.ima('#view .big-amount') === 1 && await E.ima('#view .stat-grid .stat') === 2, 'naplaćeno, broj naplata, ukupno u godini');
    await E.klik('#view [data-act="zar-nav"][data-id="-1"]'); await E.klik('#view [data-act="zar-nav"][data-id="1"]');
    rucno('18.3', /cijenu 0/.test(SRC), 'hint „nije za naplatu -> obriši ili upiši cijenu 0" ' + (/cijenu 0/.test(SRC) ? 'postoji' : 'NE postoji u v1.19.0'));
    await E.klik('#tabbar [data-act="tab"][data-id="jos"]');
    rucno('19.0', /Probni režim/.test(await E.tekst('#view')), 'Probni režim');
    rucno('19.8', (await E.tekst('#view')).includes(await E.ev('APP_VERSION')), 'verzija ' + await E.ev('APP_VERSION'));
    await E.klik('#view [data-act="prices-open"]'); ok(await E.ima('#sheetBody [data-act="prices-save"]') === 1, 'Cjenovnik'); await E.klik('#sheetBody [data-act="prices-save"]'); await zatvoriSve();
    await E.klik('#view [data-act="boxes-open"]'); await E.klik('#sheetBody [data-act="box-toggle"]'); await E.klik('#sheetBody [data-act="box-toggle"]');
    ok(await E.ima('#sheetBody [data-act="box-add"]') === 1, 'Boksevi i mjesta'); await zatvoriSve();
    await E.klik('#view [data-act="bl-open"]'); ok(await E.ima('#sheetBody [data-act="client-open"]') >= 1, 'Crna lista (spisak)'); await zatvoriSve();
    await E.klik('#view [data-act="install-help"]'); await zatvoriSve();
    if (await E.ima('#view [data-act="logout"]')){ await E.klik('#view [data-act="logout"]'); ok((await E.stanje()).modal === 'Odjaviti se?', 'Odjavi se -> potvrda'); await E.klik('#modalHost button[data-act="modal-close"]', { tekst: 'Otkaži' }); }
    else bilj('Odjavi se / Promijeni šifru se ne vide u probnom režimu (samo prijavljeni)');
    await E.klik('#view [data-act="upd-check"]', { w: 600 });
  });
  // Provjeri datume
  await korak('provjeri datume', async () => {
    await E.klik('#tabbar [data-act="tab"][data-id="danas"]');
    await E.klik('#fab'); await E.klik('#fabWrap [data-act="dates-check"]');
    ok((await E.stanje()).naslov === 'Provjeri datume', 'Provjeri datume');
    await E.klik('#sheetBody [data-act="pd-vrsta"] >> nth=1');
    await E.klik('#sheetBody [data-act="pd-nav"][data-id="1"]');
    const d1 = await E.ev(`PD.calCur + '-10'`), d2 = await E.ev(`PD.calCur + '-14'`);
    await E.klik(`#sheetBody [data-act="pd-pick"][data-id="${d1}"]`); await E.klik(`#sheetBody [data-act="pd-pick"][data-id="${d2}"]`);
    const rez = await E.tekst('#sheetBody');
    rucno('20.2', /IMA MJESTA|IMA, ALI U KAVEZU|FALI \d+ DAN|NEMA SAMO|NEMA MJESTA/.test(rez) && ['IMA, ALI U KAVEZU', 'NEMA SAMO', 'predug'].every(x => SRC.includes(x)), 'rezultat: ' + (rez.match(/IMA MJESTA|IMA, ALI U KAVEZU|FALI \d+ DANA?|NEMA SAMO[^·]*|NEMA MJESTA/) || ['?'])[0]);
    rucno('20.3', /Selio bi se|Cijelo vrijeme na istom mjestu/.test(rez), 'raspored po danima');
    await E.klik('#sheetBody [data-act="pd-upisi"]');
    ok(await E.ev(`SF && !SF.id && SF.from === ${JSON.stringify(d1)} && SF.to === ${JSON.stringify(d2)}`), 'Upiši boravak za ovaj termin -> nova forma sa terminom');
    await zatvoriSve();
  });
  rucno('11.0', await E.ev(`zoomPhoto.toString().includes('decode')`), 'kod (demo nema slika)');
  rucno('21.3', await E.ev('!sb && D.stays.length > 100'), 'probni režim sa demo istorijom');
  rucno('3.8', await E.ev(`renderStayForm.toString().includes('sf-undo-arrived') && renderStayForm.toString().includes('sf-undo-left')`) && /ostale\.length \? `<div class="pay-list">/.test(SRC),
    'stanje je sada značka „u pansionu od dd.mm. · poništi dolazak" / „otišao dd.mm. · poništi"; dok stoji „otišao", poništavanje dolaska se ne nudi (prvo poništi odlazak)');
});

/* ======================= INVENTAR ======================= */
const casesNew = new Set([...SRC.matchAll(/case '([a-z0-9-]+)'/g)].map(m => m[1]));
const tmplNew = new Set([...SRC.matchAll(/data-act="([a-z0-9-]+)"/g)].map(m => m[1]).concat([...SRC.matchAll(/(?:act|nav|pick): '([a-z0-9-]+)'/g)].map(m => m[1])));
const SVA = new Set([...casesNew, ...tmplNew, 'tab', 'login', 'logout', 'charge', 'stay-left', 'stay-arrived']);
const STARA = readFileSync(new URL('../index_v1.18.0.html', import.meta.url), 'utf8');
[...STARA.matchAll(/case '([a-z0-9-]+)'/g)].forEach(m => SVA.add(m[1]));
const NIJE_U_DEMO = { 'pet-photo-pick': 'samo prijavljeni', 'pw-open': 'samo prijavljeni', 'pw-save': 'samo prijavljeni', 'pw-eye': 'prijava', 'login': 'prijava', 'login-mode': 'prijava',
  'send-reset': 'prijava', 'save-newpass': 'prijava', 'upd-apply': 'tek kad čeka nova verzija', 'sync-ponovi': 'tek kad upis ne prođe', 'pe-photo-zoom': 'demo nema slika', 'zoom-close': 'demo nema slika',
  'sf-save-force': 'tek kad je boks zauzet / preko kapaciteta', 'kl-merge-yes': 'nije potvrđeno (trajno)', 'client-del-yes': 'nije potvrđeno (trajno)', 'pet-del-yes': 'nije potvrđeno (trajno)',
  'stay-del-yes': 'nije potvrđeno (trajno)', 'logout-yes': 'nije potvrđeno', 'sms-salji': 'link sms: nije dodirnut', 'sf-box-move-do': 'nije potvrđeno', 'box-add': 'nije dodato' };
const INVENTAR = [];
const FALE = [];
INV.forEach((e, i) => e.funkcije.forEach((f, j) => {
  const k = i + '.' + j;
  const toks = [...new Set([...(f.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)+/g) || []), ...[...f.matchAll(/\(([^)]*)\)/g)].flatMap(m => m[1].split(/[^a-z0-9-]+/))].filter(x => SVA.has(x)))];
  const red = { k, ekran: e.ekran, f, toks: [], rucno: R[k] || null };
  toks.forEach(x => red.toks.push({ act: x, handler: casesNew.has(x) || ['tab', 'charge', 'login', 'logout'].includes(x), kod: tmplNew.has(x) || casesNew.has(x), dom: SEEN.has(x), napomena: NIJE_U_DEMO[x] || '' }));
  const nemaHandlera = red.toks.filter(x => !x.handler);
  const nemaDugmeta = red.toks.filter(x => x.handler && !x.dom && !tmplNew.has(x.act) && !['stay-left', 'stay-arrived', 'dr-nav', 'dr-pick', 'pd-nav', 'pd-pick', 'sf-unpay-yes', 'ce-back', 'ce-discard', 'pe-back', 'pe-discard', 'stay-del-yes', 'pet-del-yes', 'client-del-yes', 'kl-merge-yes', 'logout-yes', 'sf-box-del-yes', 'zoom-close', 'kl-clear', 'kl-merge-toggle', 'sf-client-new', 'sf-pet-form', 'sf-newpet-del', 'ce-pet-new', 'sf-pet-toggle'].includes(x.act));
  red.status = (red.rucno && !red.rucno.ok) || nemaHandlera.length || nemaDugmeta.length ? 'FALI' : (!toks.length && !red.rucno ? 'nije provjereno' : 'ok');
  red.zasto = [...nemaHandlera.map(x => x.act + ': nema handlera'), ...nemaDugmeta.map(x => x.act + ': nema dugmeta u DOM-u'), red.rucno && !red.rucno.ok ? red.rucno.nap : ''].filter(Boolean).join('; ');
  INVENTAR.push(red);
  if (red.status === 'FALI') FALE.push(`[${e.ekran}] ${f.slice(0, 110)}${f.length > 110 ? '…' : ''} -> ${red.zasto}`);
}));
const nijeDom = [...new Set(INVENTAR.flatMap(r => r.toks.filter(x => x.handler && !x.dom).map(x => x.act + (x.napomena ? ' (' + x.napomena + ')' : ''))))];

const izlaz = { prolaz: PROLAZ, konzola: KONZOLA, fale: FALE, nijeViđenoUDomu: nijeDom, inventar: INVENTAR };
writeFileSync(new URL('./rezultat.json', import.meta.url), JSON.stringify(izlaz, null, 1));
console.log('\n=== INVENTAR: ' + INVENTAR.filter(r => r.status === 'ok').length + ' ok, ' + FALE.length + ' fali, ' + INVENTAR.filter(r => r.status === 'nije provjereno').length + ' nije provjereno');
FALE.forEach(x => console.log(' FALI ' + x));
console.log('handler postoji, ali nije viđen u DOM-u tokom prolaza: ' + nijeDom.join(', '));
console.log('konzola: ' + (KONZOLA.length ? KONZOLA.join('\n  ') : 'bez grešaka'));
console.log('\nUKUPNO: ' + PROLAZ.filter(p => p.rezultat === 'prošao').length + ' / ' + PROLAZ.length + ' tokova prošlo');
await browser.close();
