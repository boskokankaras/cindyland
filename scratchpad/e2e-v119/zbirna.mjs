// Provjera zajedničke potvrde (v1.20.0) u probnom režimu + slike. Headless.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('/Users/boskokankaras/tiramisu-upload/package.json');
const { chromium } = require('playwright');
const OUT = new URL('./zb/', import.meta.url).pathname  /* mkdir zb prije pokretanja */;
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
let pao = 0; const ok = (u, o) => { console.log((u ? '  OK  ' : '  PAO ') + o); if (!u) pao++; };
await p.goto('http://localhost:8643/app/'); await p.waitForTimeout(1300);
await p.evaluate(() => {
  const g = todayISO().slice(0, 4);
  D.clients.push({ id: 'zc1', name: 'Merve Cambol', phone: '067 123 456', note: '', blacklist: false });
  D.clients.push({ id: 'zc2', name: 'Jedan Boravak', phone: '067 000 111', note: '', blacklist: false });
  D.pets.push({ id: 'zp1', clientId: 'zc1', name: 'Dobby', species: 'macka', size: null, sex: null, breed: '', note: '', photo: null },
    { id: 'zp2', clientId: 'zc1', name: 'Bobby', species: 'pas', size: 'mali', sex: null, breed: '', note: '', photo: null },
    { id: 'zp3', clientId: 'zc2', name: 'Solo', species: 'pas', size: 'mali', sex: null, breed: '', note: '', photo: null });
  const mk = (id, cid, pid, from, to) => ({ id, clientId: cid, petIds: [pid], type: 'pansion', from, to, boxes: [], boxId: null, price: null, deposit: null,
    payments: null, paid: false, paidAt: null, arrivedAt: null, leftAt: null, note: '', createdAt: new Date().toISOString() });
  D.stays.push(mk('zs1', 'zc1', 'zp1', g + '-11-13', g + '-12-07'), mk('zs2', 'zc1', 'zp2', g + '-11-16', g + '-12-07'), mk('zs3', 'zc2', 'zp3', g + '-11-20', g + '-11-25'));
  save(); render();
});
const dekod = h => decodeURIComponent(h.split('body=')[1]);
// 1. kartica vlasnika
await p.evaluate(() => { setTab('klijenti'); openClientPop('zc1'); }); await p.waitForTimeout(400);
const zbir = await p.textContent('#modalHost .ce-zbir');
ok(/Rezervacije ukupno/.test(zbir) && /450 €/.test(zbir), 'kartica: „Rezervacije ukupno" 450 € -> ' + zbir.replace(/\s+/g, ' ').trim());
const hrefK = await p.getAttribute('#modalHost .ce-zbir a.iconbtn', 'href');
const txt = dekod(hrefK);
ok(hrefK.startsWith('sms:067123456'), 'poruka ide na broj klijenta');
ok(/🐱 Dobby\n📅 13\.11\.\d{4}\. - 07\.12\.\d{4}\.\n💶 240 €/.test(txt) && /🐶 Bobby\n📅 16\.11\.\d{4}\. - 07\.12\.\d{4}\.\n💶 210 €/.test(txt), 'oba boravka sa terminom i iznosom');
ok(/Ukupan iznos: 450 €/.test(txt) && !/Avans/.test(txt) && !/Ostatak/.test(txt), 'ukupno 450 €, bez avansa');
ok(/njihovu hranu/.test(txt) && /vašim ljubimcima!/.test(txt), 'množina u tekstu');
writeFileSync(OUT + 'poruka.txt', txt);
await p.screenshot({ path: OUT + '1-kartica.png' });
// 2. ikonica u boravku -> izbor
await p.evaluate(() => { CE = null; closeModal(); history.back(); }); await p.waitForTimeout(300);
await p.evaluate(() => openStayForm({ stayId: 'zs1' })); await p.waitForTimeout(400);
await p.click('#sheetBody [data-act="sms-izbor"]'); await p.waitForTimeout(350);
const dug = await p.$$eval('#modalHost a[data-act="sms-salji"]', a => a.map(x => [x.textContent.trim(), x.getAttribute('href')]));
ok(dug.length === 2 && /Svi boravci · 2/.test(dug[0][0]) && /Dobby, Bobby/.test(dug[0][0]) && /450 €/.test(dug[0][0]) && /Samo Dobby/.test(dug[1][0]) && /240 €/.test(dug[1][0]), 'izbor: ' + dug.map(d => d[0].replace(/\s+/g, ' ')).join(' | '));
ok(dekod(dug[0][1]) === txt, 'zajednička poruka ista kao sa kartice');
ok(/Dolazak: 13\.11\./.test(dekod(dug[1][1])) && /Ukupan iznos boravka: 240 €/.test(dekod(dug[1][1])) && /njegovu hranu/.test(dekod(dug[1][1])), 'pojedinačna poruka kao do sada');
await p.screenshot({ path: OUT + '2-izbor.png' });
await p.goBack(); await p.waitForTimeout(350);
ok(await p.evaluate(() => !document.querySelector('#modalHost').firstChild && sheetOpen && SF && SF.id === 'zs1'), 'nazad zatvara samo prozor izbora');
// 3. avans na jednom boravku
await p.evaluate(() => { sheetZatvoriSve(true); const s = D.stays.find(x => x.id === 'zs1'); s.payments = [{ a: 100, d: todayISO(), av: 1 }]; save(); render(); }); await p.waitForTimeout(300);
const t2 = dekod(await p.evaluate(() => smsZbirnaURI('zc1')));
ok(/Ukupan iznos: 450 €\n💰 Avans: 100 €\n💶 Ostatak za uplatu: 350 €/.test(t2), 'sa avansom: 450 / avans 100 / ostatak 350');
await p.evaluate(() => { setTab('klijenti'); openClientPop('zc1'); }); await p.waitForTimeout(350);
ok(/avans 100 € · za naplatu 350 €/.test(await p.textContent('#modalHost .ce-zbir')), 'kartica: avans 100 € · za naplatu 350 €');
await p.screenshot({ path: OUT + '3-kartica-avans.png' });
await p.evaluate(() => { CE = null; closeModal(); history.back(); }); await p.waitForTimeout(300);
// 4. klijent sa jednim boravkom: sve po starom
await p.evaluate(() => openStayForm({ stayId: 'zs3' })); await p.waitForTimeout(350);
ok(await p.$('#sheetBody [data-act="sms-izbor"]') === null && (await p.getAttribute('#sheetBody .sf-vl a.iconbtn', 'href')).startsWith('sms:'), 'jedan boravak: ikonica šalje odmah (bez izbora)');
await p.evaluate(() => sheetZatvoriSve(true)); await p.waitForTimeout(250);
await p.evaluate(() => openClientPop('zc2')); await p.waitForTimeout(300);
ok(await p.$('#modalHost .ce-zbir') === null, 'jedan boravak: na kartici nema zbira');
await p.evaluate(() => { CE = null; closeModal(); history.back(); }); await p.waitForTimeout(300);
// 5. novi boravak za klijenta koji već ima rezervaciju -> poslije upisa izbor
await p.evaluate(() => ponudiPotvrdu('zs2')); await p.waitForTimeout(300);
ok(/Boravak je upisan/.test(await p.textContent('#modalHost .modal-title')) && (await p.$$('#modalHost a[data-act="sms-salji"]')).length === 2, 'poslije upisa drugog boravka: izbor (svi / samo ovaj)');
await p.evaluate(() => closeModal());
await p.evaluate(() => ponudiPotvrdu('zs3')); await p.waitForTimeout(300);
ok((await p.$$('#modalHost a[data-act="sms-salji"]')).length === 1, 'poslije upisa jedinog boravka: kao do sada');
// 5b. rubni slučajevi iz pregleda koda
const rub = await p.evaluate(() => {
  const g = todayISO().slice(0, 4), dek = h => decodeURIComponent(h.split('body=')[1]);
  const mk = (id, cid, pids, from, to, x) => Object.assign({ id, clientId: cid, petIds: pids, type: 'pansion', from, to, boxes: [], boxId: null, price: null, deposit: null,
    payments: null, paid: false, paidAt: null, arrivedAt: null, leftAt: null, note: '', createdAt: new Date().toISOString() }, x || {});
  D.clients.push({ id: 'zc3', name: 'Preplata Test', phone: '067 222 333', note: '', blacklist: false }, { id: 'zc4', name: 'Isti Pas', phone: '067 444 555', note: '', blacklist: false });
  D.pets.push({ id: 'zp4', clientId: 'zc3', name: 'Mica', species: 'macka', size: null, sex: null, breed: '', note: '', photo: null },
    { id: 'zp5', clientId: 'zc3', name: 'Luna', species: 'pas', size: 'mali', sex: null, breed: '', note: '', photo: null },
    { id: 'zp6', clientId: 'zc4', name: 'Rex', species: 'pas', size: 'mali', sex: null, breed: '', note: '', photo: null });
  D.stays.push(mk('zs4', 'zc3', ['zp4'], g + '-11-20', g + '-11-25', { price: 100, payments: [{ a: 150, d: todayISO(), av: 1 }] }),
    mk('zs5', 'zc3', ['zp5'], g + '-11-20', g + '-12-10', { price: 200 }),
    mk('zs6', 'zc4', ['zp6'], g + '-11-15', g + '-11-18'), mk('zs7', 'zc4', ['zp6'], g + '-12-10', g + '-12-13'));
  return { preplata: klijentZbir('zc3').ostalo, tPre: dek(smsZbirnaURI('zc3')), isti: dek(smsZbirnaURI('zc4')), lj: klijentZbir('zc4').ljubimci };
});
ok(rub.preplata === 200 && /Ostatak za uplatu: 200 €/.test(rub.tPre), 'preplata jednog boravka ne umanjuje drugi (ostatak 200 €)');
ok(/🐱 Mica/.test(rub.tPre) && /🐶 Luna/.test(rub.tPre), 'znak po vrsti ljubimca');
ok(/njegovu hranu/.test(rub.isti) && /vašim ljubimcem!/.test(rub.isti) && rub.lj.length === 1, 'isti pas u dva termina: jednina, ime jednom');
ok(!/\n\n\n/.test(rub.tPre) && !/\n\n\n/.test(rub.isti) && !/undefined|NaN/.test(rub.tPre + rub.isti), 'bez duplih praznih redova i „undefined"');
// 6. otišao boravak ne ulazi u zbir
await p.evaluate(() => { closeModal(); const s = D.stays.find(x => x.id === 'zs2'); s.leftAt = todayISO(); });
ok(await p.evaluate(() => smsZbirnaURI('zc1')) === null, 'kad jedan ode, zajedničke poruke više nema');
console.log('greške na stranici:', errs.length ? errs : 'nema', '| palo:', pao);
await b.close();
