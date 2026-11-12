// Provjera opcije Gratis (v1.21.0) u probnom režimu + slike u ./gr/. Headless. Demo server :8643 (demo_sync.sh).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire('/Users/boskokankaras/tiramisu-upload/package.json');
const { chromium } = require('playwright');
const OUT = new URL('./gr/', import.meta.url).pathname;
const FIX = readFileSync(new URL('./fixture.js', import.meta.url), 'utf8');
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
let pao = 0; const ok = (u, o) => { console.log((u ? '  OK  ' : '  PAO ') + o); if (!u) pao++; };
const w = ms => p.waitForTimeout(ms);
await p.goto('http://localhost:8643/app/'); await w(1300);
await p.evaluate(FIX); await w(300);
const st = id => p.evaluate(i => JSON.parse(JSON.stringify(D.stays.find(s => s.id === i))), id);
// 1. sa avansom nema Gratis; otišao bez uplate ima
await p.click('#view [data-act="stay-left"][data-id="fx1"]'); await w(300);
ok(await p.$('#modalHost [data-act="nm-gratis"]') === null, 'sa avansom nema Gratis (to je Popust)');
await p.click('#modalHost [data-act="nm-otkazi"]'); await w(200);
await p.click('#view [data-act="charge"][data-id="fx5"]'); await w(300);
ok(await p.$('#modalHost [data-act="nm-gratis"]') !== null, 'otišao bez uplate: nudi Gratis');
await p.screenshot({ path: OUT + '1-naplata-gratis.png' });
await p.click('#modalHost [data-act="nm-gratis"]'); await w(400);
let s = await st('fx5');
ok(s.paid && s.price === 0 && s.payments.length === 1 && s.payments[0].g === 1 && s.payments[0].a === 0 && s.payments[0].c === null, 'zatvoren gratis: cijena 0, oznaka g: ' + JSON.stringify(s.payments));
ok(await p.evaluate(() => stayNovac(D.stays.find(s => s.id === 'fx5')).naplaceno && !unpaidStays().some(s => s.id === 'fx5')), 'nije u Nenaplaćenom');
ok(await p.$('#view .row-tap[data-id="fx5"]') === null, 'nestao sa Danas (kao naplaćen)');
// 2. odlazak iz forme: „Gratis i otišao"
await p.click('#view [data-act="stay-arrived"][data-id="fx4"]'); await w(300);
await p.evaluate(() => { const t = document.getElementById('toast'); t.classList.remove('show', 'ima-radnju'); });
await p.evaluate(() => { const s = D.stays.find(x => x.id === 'fx4'); s.price = 150; save(); render(); });
await p.evaluate(() => openStayForm({ stayId: 'fx4' })); await w(350);
await p.click('#sheetBody [data-act="sf-left"]'); await w(300);
ok(/Gratis i otišao/.test(await p.textContent('#modalHost [data-act="nm-gratis"]')), 'odlazak: dugme „Gratis i otišao"');
await p.screenshot({ path: OUT + '2-odlazak-gratis.png' });
await p.click('#modalHost [data-act="nm-gratis"]'); await w(400);
s = await st('fx4');
ok(s.paid && s.leftAt && s.price === 0 && s.payments[0].c === 150, 'fx4: otišao i gratis, pamti cijenu 150');
// 3. pregled, zaključana cijena
await p.evaluate(() => openStayForm({ stayId: 'fx4' })); await w(350);
ok(/Gratis · /.test(await p.textContent('#sheetBody .sf-nv-red')), 'forma: „Gratis · datum"');
ok(/gratis/.test(await p.textContent('#sheetBody .sf-novac .pay-list')), 'spisak uplata: „gratis 0 €"');
await p.screenshot({ path: OUT + '3-boravak-gratis.png' });
await p.click('#sheetBody [data-act="sf-otv"][data-id="novac"]'); await w(250);
ok(await p.$eval('#sfPrice', e => e.disabled), 'cijena zaključana dok je gratis');
await p.click('#sheetBody [data-act="sf-otv"][data-id="novac"]'); await w(200);
// 4. poništi odlazak pa ponovo Otišao: gratis i cijena ostaju (nalaz pregleda)
await p.click('#sheetBody [data-act="sf-undo-left"]'); await w(300);
s = await st('fx4'); ok(!s.leftAt && s.paid && s.payments[0].g === 1, 'poništen odlazak, gratis ostaje');
/* isto što radi štrik „Otišao" na Danas */
await p.evaluate(() => { sheetZatvoriSve(true); chargeStart('fx4', true); }); await w(400);
const m = await p.textContent('#modalHost');
ok(/gratis/.test(m) && !(await p.$('#nmIznos')) && /Potvrdi odlazak/.test(m), 'ponovni odlazak: „gratis" i samo Potvrdi odlazak (bez polja za iznos)');
await p.click('#modalHost [data-act="nm-ok"]'); await w(400);
s = await st('fx4'); ok(s.leftAt && s.paid && s.price === 0 && s.payments.length === 1 && s.payments[0].g === 1 && s.payments[0].c === 150, 'poslije ponovnog odlaska: i dalje gratis, cijena 150 zapamćena');
// 5. poništi gratis vraća 150
await p.evaluate(() => openStayForm({ stayId: 'fx4' })); await w(300);
await p.click('#sheetBody [data-act="sf-unpay"]'); await w(250);
ok(/Poništiti gratis/.test(await p.textContent('#modalHost .modal-title')), 'potvrda „Poništiti gratis?"');
await p.click('#modalHost [data-act="sf-unpay-yes"]'); await w(350);
s = await st('fx4'); ok(!s.paid && s.price === 150 && !s.payments, 'poništeno: cijena 150, bez uplata');
await p.evaluate(() => sheetZatvoriSve(true)); await w(300);
// 6. bez ručne cijene: poništi vraća „po cjenovniku"
await p.evaluate(() => { const s = D.stays.find(x => x.id === 'fx4'); s.price = null; save(); render(); });
await p.evaluate(() => chargeStart('fx4')); await w(300);
await p.click('#modalHost [data-act="nm-gratis"]'); await w(350);
await p.evaluate(() => openStayForm({ stayId: 'fx4' })); await w(300);
await p.click('#sheetBody [data-act="sf-unpay"]'); await w(200);
await p.click('#modalHost [data-act="sf-unpay-yes"]'); await w(300);
s = await st('fx4'); ok(s.price === null && !s.paid, 'poništi vraća cijenu po cjenovniku');
await p.evaluate(() => sheetZatvoriSve(true)); await w(300);
await p.evaluate(() => chargeStart('fx4')); await w(300);
await p.click('#modalHost [data-act="nm-gratis"]'); await w(350);
// 7. Finansije i kartica vlasnika
const brojPrije = await p.evaluate(() => allPayments().filter(x => (x.d || '').slice(0, 7) === ZAR_YM && !x.g).length);
await p.click('#tabbar [data-act="tab"][data-id="zarada"]'); await w(300);
ok(/gratis/.test(await p.textContent('#view')), 'Finansije: red „gratis"');
ok(await p.evaluate(() => Number(document.querySelector('#view .stat .s-val').textContent)) === brojPrije, 'gratis se ne broji kao naplata');
await p.screenshot({ path: OUT + '4-finansije.png' });
const cid = await p.evaluate(() => D.stays.find(s => s.id === 'fx4').clientId);
await p.evaluate(c => { setTab('klijenti'); openClientPop(c); }, cid); await w(350);
ok(/gratis/.test(await p.textContent('#modalHost .ce-stays')), 'kartica vlasnika: boravak „gratis"');
await p.screenshot({ path: OUT + '5-kartica.png' });
ok(await p.evaluate(() => { const s = D.stays.find(x => x.id === 'fx4'); return JSON.stringify(DB_UNMAP.stays(DB_MAP.stays(s)).payments) === JSON.stringify(stayPayments(s)) && JSON.stringify(s.payments) === JSON.stringify(stayPayments(s)); }), 'oznaka gratis preživljava put do baze i nazad (isti oblik)');
console.log('greške na stranici:', errs.length ? errs : 'nema', '| palo:', pao);
await b.close();
