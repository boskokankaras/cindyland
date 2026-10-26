// Headless snimci svih ekrana Cindyland demoa (fixture iz fixture.js). node shots.mjs <izlazni folder> [sirine]
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
const require = createRequire('/Users/boskokankaras/tiramisu-upload/package.json');
const { chromium } = require('playwright');
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const WIDTHS = (process.argv[3] || '375,1280').split(',').map(Number);
const FIX = readFileSync(new URL('./fixture.js', import.meta.url), 'utf8');
const URL0 = 'http://localhost:8643/app/';
const browser = await chromium.launch({ headless: true });
const FULL = `.sheet{height:auto!important;max-height:none!important;position:absolute!important;top:0!important;bottom:auto!important}
.sheet-body{overflow:visible!important;flex:none!important}.modal-overlay{position:absolute!important;min-height:100%}
.modal,.modal-card{max-height:none!important;overflow:visible!important}`;
for (const W of WIDTHS){
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 700 ? 812 : 900 }, deviceScaleFactor: W < 700 ? 2 : 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(URL0); await page.waitForTimeout(1200);
  await page.evaluate(FIX); await page.waitForTimeout(300);
  const tag = n => `${OUT}/${n}-${W}.png`;
  const shot = async (n, full) => {
    if (full){ const s = await page.addStyleTag({ content: FULL }); await page.waitForTimeout(120); await page.screenshot({ path: tag(n), fullPage: true }); await s.evaluate(e => e.remove()); }
    else await page.screenshot({ path: tag(n), fullPage: false });
  };
  const ev = (js) => page.evaluate(js);
  const reset = async () => { await ev(`(() => { NM = null; closeModal(); if (PE) { PE = null; } if (CE) { CE = null; } if (sheetOpen) sheetSkloni(); setTab('danas'); window.scrollTo(0,0); })()`); await page.waitForTimeout(250); };
  await reset(); await page.screenshot({ path: tag('01-danas'), fullPage: true });
  await ev(`groupSheet('mb')`); await page.waitForTimeout(300); await shot('02-grupa-mali', true);
  await ev(`document.querySelector('#sheetBody [data-act="stay-edit"][data-id="fx3"]').click()`); await page.waitForTimeout(300); await shot('03-boravak-u-pansionu', true);
  await reset(); await ev(`openStayForm({ stayId: 'fx1' })`); await page.waitForTimeout(300); await shot('04-boravak-odlazi-danas', true);
  await reset(); await ev(`document.querySelector('[data-act="stay-left"][data-id="fx1"]').click()`); await page.waitForTimeout(300); await shot('05-odlazak-prozor', false);
  await reset(); await ev(`document.querySelector('[data-act="stay-left"][data-id="fx2"]').click()`); await page.waitForTimeout(300); await shot('06-odlazak-sve-avansom', false);
  await reset(); await ev(`openPetPop(D.stays.find(s=>s.id==='fx3').petIds[0])`); await page.waitForTimeout(300); await shot('07-kartica-ljubimca', true);
  await reset(); await ev(`openClientPop(D.stays.find(s=>s.id==='fx1').clientId)`); await page.waitForTimeout(300); await shot('08-kartica-vlasnika', true);
  await reset(); await ev(`openStayForm({})`); await page.waitForTimeout(300); await shot('09-novi-boravak', false);
  await reset(); await ev(`openStayForm({ clientId: D.stays.find(s=>s.id==='fx3').clientId })`); await page.waitForTimeout(300); await shot('10-novi-boravak-klijent', true);
  await reset(); await ev(`setTab('kalendar')`); await page.waitForTimeout(300); await page.screenshot({ path: tag('11-kalendar'), fullPage: true });
  await ev(`daySheet(todayISO())`); await page.waitForTimeout(300); await shot('12-dan-sheet', true);
  await reset(); await ev(`setTab('klijenti')`); await page.waitForTimeout(300); await page.screenshot({ path: tag('13-klijenti'), fullPage: false });
  await reset(); await ev(`setTab('zarada')`); await page.waitForTimeout(300); await page.screenshot({ path: tag('14-finansije'), fullPage: true });
  await ev(`unpaidSheet()`); await page.waitForTimeout(300); await shot('15-nenaplaceno', false);
  await reset(); await ev(`setTab('jos')`); await page.waitForTimeout(300); await page.screenshot({ path: tag('16-profil'), fullPage: true });
  await reset(); await ev(`datesCheckSheet()`); await page.waitForTimeout(300); await shot('17-provjeri-datume', true);
  await reset(); await ev(`CAL_VIEW = 'grid'; setTab('kalendar')`); await page.waitForTimeout(300); await page.screenshot({ path: tag('18-kalendar-boksevi'), fullPage: false });
  await ev(`CAL_VIEW = 'mreza'`);
  console.log(W, 'greske:', errs.length ? errs : 'nema');
  await ctx.close();
}
await browser.close();
