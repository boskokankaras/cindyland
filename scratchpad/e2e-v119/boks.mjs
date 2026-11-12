// Provjera obaveznog slobodnog boksa (v1.22.0). Headless; demo server :8643 (demo_sync.sh). Slike u ./bx/.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
const require = createRequire('/Users/boskokankaras/tiramisu-upload/package.json');
const { chromium } = require('playwright');
const OUT = new URL('./bx/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const FIX = readFileSync(new URL('./fixture.js', import.meta.url), 'utf8');
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
let pao = 0; const ok = (u, o) => { console.log((u ? '  OK  ' : '  PAO ') + o); if (!u) pao++; };
const w = ms => p.waitForTimeout(ms);
await p.goto('http://localhost:8643/app/'); await w(1300);
await p.evaluate(FIX); await w(300);
const broj = () => p.evaluate(() => D.stays.length);
const toastTxt = () => p.evaluate(() => document.getElementById('toast').textContent);
// klijent sa malim psom bez boravka danas
const cid = await p.evaluate(() => { const c = D.clients.find(c => { const ps = petsOfClient(c.id); return ps.length === 1 && ps[0].species === 'pas' && ps[0].size !== 'veliki' && !D.stays.some(s => s.clientId === c.id && s.to >= todayISO()); }); return c.id; });
const t = await p.evaluate(() => todayISO());
const A = n => p.evaluate(n => addDays(todayISO(), n), n);
const d1 = await A(1), d3 = await A(3);
// 1. novi boravak bez boksa -> ne upisuje
let n0 = await broj();
await p.evaluate(([c, f, to]) => { openStayForm({ clientId: c, from: f, to }); }, [cid, d1, d3]); await w(400);
await p.click('#sheetFoot [data-act="sf-save"]'); await w(300);
ok(await broj() === n0 && /Izaberi boks/.test(await toastTxt()), 'bez boksa: nema upisa, poruka „Izaberi boks"');
await p.screenshot({ path: OUT + '1-izaberi-boks.png' });
// 2. zauzet boks u meniju je onemogućen
const opc = await p.$$eval('#sfBox option', os => os.map(o => [o.value, o.textContent, o.disabled]));
const zauz = opc.filter(o => /zauzet/.test(o[1]));
ok(zauz.length > 0 && zauz.every(o => o[2]), 'zauzeti boksovi u meniju se ne mogu izabrati (' + zauz.length + ')');
// 3. boks koji je zauzet dio termina (preko SF, kao Premjesti) -> „Boks je zauzet", bez „Upiši svejedno"
const zauzetBoks = await p.evaluate(() => { const fx = D.stays.find(s => s.id === 'fx3'); return stayBoxId(fx); });   // drži ga fx3 do +3
await p.evaluate(([bx, f, to]) => { SF.boxes = [{ b: bx, f, t: to }]; renderStayForm(); }, [zauzetBoks, d1, d3]); await w(300);
await p.click('#sheetFoot [data-act="sf-save"]'); await w(300);
const m = await p.textContent('#modalHost');
ok(/Boks je zauzet/.test(m) && !/svejedno/i.test(m) && await broj() === n0, 'zauzet boks: „Boks je zauzet", nema „Upiši svejedno", nema upisa');
await p.screenshot({ path: OUT + '2-boks-zauzet.png' });
await p.click('#modalHost [data-act="sf-boks-izaberi"]'); await w(300);
ok(!await p.evaluate(() => !!document.querySelector('#modalHost').firstChild), '„Izaberi drugi boks" vraća u formu');
// 4. slobodan boks -> upisano
const slobodan = opc.find(o => o[0] && !o[2] && !/slobodan|zauzet/.test(o[1]))[0];
/* ukloni zauzet (krstić na boksu) pa izaberi slobodan iz menija */
await p.click('#sheetBody [data-act="sf-box-del"][data-id="0"]'); await w(200);
await p.click('#modalHost [data-act="sf-box-del-yes"]'); await w(250);
await p.selectOption('#sfBox', slobodan); await w(300);
await p.click('#sheetFoot [data-act="sf-save"]'); await w(400);
ok(await broj() === n0 + 1, 'slobodan boks: upisano');
await p.evaluate(() => { closeModal(); if (sheetOpen) sheetZatvoriSve(true); }); await w(300);
const novi = await p.evaluate(() => D.stays[D.stays.length - 1].id);
// 5. dan odlaska je zauzet: dolazak istog dana kada drugi odlazi iz tog boksa -> blokirano
const fx1box = await p.evaluate(() => stayBoxId(D.stays.find(s => s.id === 'fx1')));   // fx1 odlazi danas
const cid2 = await p.evaluate(c => D.clients.find(x => x.id !== c && petsOfClient(x.id).length === 1 && petsOfClient(x.id)[0].species === 'pas' && petsOfClient(x.id)[0].size !== 'veliki' && !D.stays.some(s => s.clientId === x.id && s.to >= todayISO())).id, cid);
n0 = await broj();
await p.evaluate(([c, f, to, bx]) => { openStayForm({ clientId: c, from: f, to, boxId: bx }); SF.boxes = [{ b: bx, f, t: to }]; renderStayForm(); }, [cid2, t, d3, fx1box]); await w(400);
await p.click('#sheetFoot [data-act="sf-save"]'); await w(300);
ok(/Boks je zauzet/.test(await p.textContent('#modalHost')) && await broj() === n0, 'dan odlaska je zauzet: dolazak u isti boks istog dana se ne upisuje');
await p.evaluate(() => { closeModal(); sheetZatvoriSve(true); }); await w(300);
// 6. upisan boravak: izmjena napomene ne traži boks (stari zapis bez boksa)
await p.evaluate(() => { const s = D.stays.find(x => x.id === 'fx8'); s.boxes = []; s.boxId = null; save(); });
await p.evaluate(() => openStayForm({ stayId: 'fx8' })); await w(350);
await p.click('#sheetBody [data-act="sf-otv"][data-id="napomena"]'); await w(200);
await p.fill('#sfNote', 'Proba napomene'); await p.dispatchEvent('#sfNote', 'input'); await w(150);
await p.click('#sheetFoot [data-act="sf-save"]'); await w(400);
ok(await p.evaluate(() => D.stays.find(x => x.id === 'fx8').note) === 'Proba napomene', 'stari zapis bez boksa: napomena se čuva bez traženja boksa');
// 7. upisan boravak: promjena termina bez boksa -> traži boks i otvara red Boks
await p.evaluate(() => { if (sheetOpen) sheetZatvoriSve(true); openStayForm({ stayId: 'fx8' }); }); await w(350);
await p.evaluate(() => { SF.to = addDays(SF.to, 1); renderStayForm(); }); await w(250);
await p.click('#sheetFoot [data-act="sf-save"]'); await w(350);
const fx8 = await p.evaluate(() => D.stays.find(x => x.id === 'fx8'));
ok(/Izaberi boks/.test(await toastTxt()) && await p.evaluate(() => !!(SF && SF.otv && SF.otv.boks)) && !!(await p.$('#sfBox')), 'promjena termina bez boksa: „Izaberi boks" i otvoren red Boks');
await p.screenshot({ path: OUT + '3-upisan-bez-boksa.png' });
// 8. upisan boravak: uklanjanje boksa (krstić na boksu) -> ne može se sačuvati
await p.evaluate(() => { sheetZatvoriSve(true); openStayForm({ stayId: 'fx3' }); }); await w(350);
await p.evaluate(() => { SF.boxes = []; renderStayForm(); }); await w(200);
await p.click('#sheetFoot [data-act="sf-save"]'); await w(300);
ok(await p.evaluate(() => stayBoxes(D.stays.find(x => x.id === 'fx3')).length === 1) && /Izaberi boks/.test(await toastTxt()), 'boks se ne može samo ukloniti');
// 9. stari dupli (prošli dani) ne blokira produženje boravka koji traje
await p.evaluate(() => sheetZatvoriSve(true)); await w(250);
const r9 = await p.evaluate(() => {
  const fx3 = D.stays.find(x => x.id === 'fx3'), bx = stayBoxId(fx3), t = todayISO();
  const tud = Object.assign({}, fx3, { id: 'dup1', from: addDays(t, -3), to: addDays(t, -2), boxes: [{ b: bx, f: addDays(t, -3), t: addDays(t, -2) }], arrivedAt: addDays(t, -3), leftAt: addDays(t, -2), payments: null, paid: false });
  D.stays.push(tud); save();
  return { bx, ima: D.stays.some(s => s.id === 'dup1') };
});
await p.evaluate(() => openStayForm({ stayId: 'fx3' })); await w(300);
await p.evaluate(() => { SF.to = addDays(SF.to, 1); renderStayForm(); }); await w(200);
const preDo = await p.evaluate(() => D.stays.find(x => x.id === 'fx3').to);
await p.click('#sheetFoot [data-act="sf-save"]'); await w(400);
const fx3poslije = await p.evaluate(() => D.stays.find(x => x.id === 'fx3').to);
const slobodanSjutra = await p.evaluate(to => !D.stays.some(s => s.id !== 'fx3' && stayHoldsBox(s, stayBoxId(D.stays.find(x => x.id === 'fx3')), to, to)), fx3poslije);
ok(fx3poslije > preDo || !slobodanSjutra, 'stari dupli u prošlosti ne blokira produženje (' + preDo + ' -> ' + fx3poslije + ')');
await p.evaluate(() => { closeModal(); if (sheetOpen) sheetZatvoriSve(true); }); await w(250);
// 10. poništi odlazak kad je boks u međuvremenu dat drugom -> ne dozvoljava
const r10 = await p.evaluate(() => {
  const t = todayISO(), y = D.stays.find(x => x.id === 'fx6'), bx = stayBoxId(y);
  y.leftAt = addDays(t, -1); y.arrivedAt = y.from;
  const drugi = D.stays.find(x => x.id === 'fx1');   // drugi pas (isti pas nije sudar sam sa sobom)
  const z = Object.assign({}, y, { id: 'zamjena', clientId: drugi.clientId, petIds: drugi.petIds.slice(), from: t, to: addDays(t, 2), boxes: [{ b: bx, f: t, t: addDays(t, 2) }], arrivedAt: t, leftAt: null, payments: null, paid: false });
  D.stays.push(z); save();
  stayUnmark('fx6', 'left');
  return { leftAt: D.stays.find(x => x.id === 'fx6').leftAt, toast: document.getElementById('toast').textContent };
});
ok(r10.leftAt && /zauzet/.test(r10.toast), 'poništi odlazak u boks koji je u međuvremenu dat drugom: ne dozvoljava (' + r10.toast + ')');
// 11. mali pas u mačji boks (čip iz mačjeg reda) -> ne upisuje
n0 = await broj();
const cid3 = await p.evaluate(c => D.clients.find(x => ![c].includes(x.id) && petsOfClient(x.id).length === 1 && petsOfClient(x.id)[0].species === 'pas' && petsOfClient(x.id)[0].size !== 'veliki' && !D.stays.some(s => s.clientId === x.id && s.to >= todayISO())).id, cid);
await p.evaluate(([c, f, to]) => { openStayForm({ clientId: c, from: f, to, boxId: 'm5' }); SF.to = to; SF.boxes = [{ b: 'm5', f, t: to }]; renderStayForm(); }, [cid3, await A(20), await A(22)]); await w(350);
await p.click('#sheetFoot [data-act="sf-save"]'); await w(300);
ok(await broj() === n0 && /nije za ovog ljubimca/.test(await toastTxt()), 'mali pas u mačji boks: ne upisuje');
await p.evaluate(() => sheetZatvoriSve(true)); await w(200);
// 12. stalni gost: novi mjesečni boravak istog psa počinje na dan kad stari završava, u istom boksu -> dozvoljeno
const r12 = await p.evaluate(() => {
  const fx6 = D.stays.find(x => x.id === 'fx6'); fx6.leftAt = null; save();
  return { cid: fx6.clientId, pid: fx6.petIds[0], bx: stayBoxId(fx6), to: fx6.to };
});
n0 = await broj();
await p.evaluate(r => { openStayForm({ clientId: r.cid, petId: r.pid, from: r.to, to: addDays(r.to, 5) }); SF.boxes = [{ b: r.bx, f: r.to, t: addDays(r.to, 5) }]; renderStayForm(); }, r12); await w(350);
await p.click('#sheetFoot [data-act="sf-save"]'); await w(400);
ok(await broj() === n0 + 1, 'isti pas, nastavak u istom boksu na dan odlaska: upisano (stalni gost)');
await p.evaluate(() => { closeModal(); if (sheetOpen) sheetZatvoriSve(true); }); await w(250);
// 13. završen boravak: bez provjere
console.log('greške na stranici:', errs.length ? errs : 'nema', '| palo:', pao);
await b.close();
