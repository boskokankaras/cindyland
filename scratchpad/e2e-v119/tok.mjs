// Slike toka za Boška: telefon (375, prava visina ekrana) i nekoliko na računaru. Headless.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
const require = createRequire('/Users/boskokankaras/tiramisu-upload/package.json');
const { chromium } = require('playwright');
const OUT = new URL('./tok/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const FIX = readFileSync(new URL('./fixture.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
async function ekran(W, H, dpr){
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:8643/app/'); await page.waitForTimeout(1200);
  await page.evaluate(FIX); await page.waitForTimeout(300);
  return { page, ctx, errs };
}
const klik = async (page, sel) => { await page.click(sel); await page.waitForTimeout(350); };
const snimi = (page, ime) => page.screenshot({ path: OUT + ime + '.png' });

/* ---------- telefon ---------- */
{
  const { page, ctx, errs } = await ekran(375, 812, 2);
  await snimi(page, 't01-danas');
  await klik(page, '[data-act="group-open"][data-id="mb"]');
  await snimi(page, 't02-mali-boksevi');
  await klik(page, '#sheetBody [data-act="stay-edit"][data-id="fx3"]');
  await snimi(page, 't03-boravak-pregled');
  await klik(page, '[data-act="sf-otv"][data-id="novac"]');
  await page.fill('#sfAvans', '30'); await page.dispatchEvent('#sfAvans', 'input'); await page.waitForTimeout(200);
  await page.evaluate(() => { const r = document.querySelector('[data-act="sf-otv"][data-id="novac"]'); r.scrollIntoView({ block: 'start' }); document.getElementById('sheetBody').scrollTop -= 60; });
  await page.waitForTimeout(200);
  await snimi(page, 't04-boravak-avans-sacuvaj');
  await klik(page, '[data-act="sheet-close"].sheet-x');
  await snimi(page, 't05-sacuvati-izmjene');
  await klik(page, '[data-act="sf-izlaz-sacuvaj"]');
  await snimi(page, 't06-nazad-na-spisku');
  await page.evaluate(() => sheetZatvoriSve(true)); await page.waitForTimeout(2600);   // poruka „Boravak sačuvan" da nestane
  await page.evaluate(() => window.scrollTo(0, 360)); await page.waitForTimeout(200);
  await klik(page, '[data-act="stay-left"][data-id="fx1"]');
  await snimi(page, 't07-odlazak-60');
  await klik(page, '[data-act="nm-otkazi"]');
  await klik(page, '[data-act="stay-left"][data-id="fx2"]');
  await snimi(page, 't08-odlazak-sve-avansom');
  await klik(page, '[data-act="nm-ok"]');
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.scrollTo(0, 360)); await page.waitForTimeout(200);
  await snimi(page, 't09-danas-poslije-odlaska');
  /* kartica psa -> novi boravak */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => openStayForm({ stayId: 'fx3' })); await page.waitForTimeout(300);
  await klik(page, '#sheetBody .sf-stanje .pp[data-act="pet-open"]');
  await snimi(page, 't10-kartica-psa');
  await klik(page, '[data-act="pe-new-stay"]');
  await snimi(page, 't11-novi-boravak-iz-kartice');
  await page.evaluate(() => sheetZatvoriSve(true)); await page.waitForTimeout(300);
  /* kartica vlasnika */
  await page.evaluate(() => { setTab('klijenti'); openClientPop(D.stays.find(s => s.id === 'fx1').clientId); }); await page.waitForTimeout(400);
  await snimi(page, 't12-kartica-vlasnika');
  await page.evaluate(() => { CE = null; closeModal(); history.back(); setTab('zarada'); }); await page.waitForTimeout(400);
  await snimi(page, 't13-finansije');
  await klik(page, '[data-act="unpaid-open"]');
  await snimi(page, 't14-nenaplaceno');
  console.log('telefon greške:', errs.length ? errs : 'nema');
  await ctx.close();
}
/* ---------- računar ---------- */
{
  const { page, ctx, errs } = await ekran(1280, 860, 1);
  await snimi(page, 'r01-danas');
  await page.evaluate(() => openStayForm({ stayId: 'fx1' })); await page.waitForTimeout(400);
  await snimi(page, 'r02-boravak');
  await page.evaluate(() => sheetZatvoriSve(true)); await page.waitForTimeout(300);
  await klik(page, '[data-act="stay-left"][data-id="fx1"]');
  await snimi(page, 'r03-odlazak');
  console.log('računar greške:', errs.length ? errs : 'nema');
  await ctx.close();
}
await browser.close();
