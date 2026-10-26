// Slaže snimke toka u nekoliko preglednih slika sa naslovima (za Boška).
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire('/Users/boskokankaras/tiramisu-upload/package.json');
const { chromium } = require('playwright');
const DIR = new URL('./tok/', import.meta.url).pathname;
const OUT = '/Users/boskokankaras/cindyland/scratchpad/v1.19.0-slike/'; mkdirSync(OUT, { recursive: true });
const LISTOVI = [
  ['1-odlazak-i-avans', 'Odlazak i avans', [
    ['t01-danas', 'Danas: pločice „slobodno", Dolaze / Odlaze / Ostaju, „!" = napomena'],
    ['t07-odlazak-60', 'Otišao: avans 300 se oduzima, za naplatu 60 €'],
    ['t08-odlazak-sve-avansom', 'Sve plaćeno avansom: samo potvrda odlaska'],
    ['t09-danas-poslije-odlaska', 'Ispraćeni ostaju na spisku: „naplaćeno" ili „Naplati X €"'],
  ], 375],
  ['2-boravak-i-nazad', 'Boravak: prvo pregled, izmjena na dodir, nazad na spisak', [
    ['t02-mali-boksevi', 'Mali boksevi: „!" pored psa sa napomenom'],
    ['t03-boravak-pregled', 'Boravak: stanje, napomena, novac i dugmad gore'],
    ['t04-boravak-avans-sacuvaj', 'Cijena i avans: upisan avans, dolje se pojavi Sačuvaj'],
    ['t05-sacuvati-izmjene', 'Zatvaranje sa neupisanim avansom pita'],
    ['t06-nazad-na-spisku', 'Poslije čuvanja: nazad na Mali boksevi'],
  ], 375],
  ['3-kartice-i-novi-boravak', 'Kartice psa i vlasnika, novi boravak iz kartice', [
    ['t10-kartica-psa', 'Kartica psa: Novi boravak, boravci se otvaraju'],
    ['t11-novi-boravak-iz-kartice', 'Novi boravak: pas već izabran, vidi se da je u pansionu'],
    ['t12-kartica-vlasnika', 'Kartica vlasnika: prikaz, izmjena tek na „Izmijeni podatke"'],
  ], 375],
  ['4-finansije', 'Finansije i nenaplaćeno', [
    ['t13-finansije', 'Finansije: avans se broji kao naplata, red Nenaplaćeno'],
    ['t14-nenaplaceno', 'Nenaplaćeno: zbir, Naplati po redu, starija posebno'],
  ], 375],
  ['5-racunar', 'Na računaru', [
    ['r01-danas', 'Danas'], ['r02-boravak', 'Boravak'], ['r03-odlazak', 'Odlazak'],
  ], 1280],
];
const browser = await chromium.launch({ headless: true });
for (const [ime, naslov, slike, w] of LISTOVI){
  const tel = w < 700;
  const kol = tel ? Math.min(slike.length, slike.length === 5 ? 3 : slike.length === 4 ? 4 : slike.length) : 1;
  const sirSlike = tel ? 300 : 1000;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#EFE7DF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2B2320;padding:28px}
    h1{font-size:26px;margin:0 0 4px} .v{color:#8A7F78;font-size:14px;margin:0 0 22px}
    .g{display:grid;grid-template-columns:repeat(${kol}, ${sirSlike}px);gap:26px 22px}
    figure{margin:0} img{width:${sirSlike}px;border-radius:${tel ? 26 : 10}px;box-shadow:0 8px 26px rgba(43,35,32,.18);display:block;background:#fff}
    figcaption{font-size:14.5px;font-weight:650;margin-top:10px;line-height:1.35;max-width:${sirSlike}px}
    .n{display:inline-flex;width:22px;height:22px;border-radius:50%;background:#E0523A;color:#fff;font-size:12px;align-items:center;justify-content:center;margin-right:7px;vertical-align:1px}
  </style><h1>${naslov}</h1><p class="v">Cindyland v1.19.0 · probni podaci · nije objavljeno</p>
  <div class="g">${slike.map(([f, t], i) => `<figure><img src="file://${DIR}${f}.png"><figcaption><span class="n">${i + 1}</span>${t}</figcaption></figure>`).join('')}</div>`;
  const htmlPut = DIR + '_' + ime + '.html';
  writeFileSync(htmlPut, html);
  const ctx = await browser.newContext({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  await page.goto('file://' + htmlPut); await page.waitForTimeout(400);
  const dim = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  await page.setViewportSize({ width: dim.w, height: 400 });
  await page.screenshot({ path: OUT + ime + '.png', fullPage: true });
  await ctx.close();
}
await browser.close();
console.log('gotovo');
