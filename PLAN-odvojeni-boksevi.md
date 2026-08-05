# PLAN: „Jedan boks" / „Odvojeni boksevi" (runda 1)

> Zahtjev Boška, 5.8.2026. Kad vlasnik ima više ljubimaca, može tražiti da idu u JEDAN
> boks ili u ODVOJENE. Segbar čitavom širinom, samo kad je više od jednog ljubimca.
> Isto i na ekranu „Provjeri datume", sa brojačem količine uz svaku vrstu (to je RUNDA 2).
>
> **STANJE 5.8.2026: NIJE POČETO.** Živa verzija je v1.14.1. Nijedna linija ovog plana
> nije upisana u `app/index.html`. Svih 23 ankera iz plana su provjerena i postoje
> jedinstveno u fajlu, dakle plan se može upisati doslovno.
>
> **ODLUKE KOJE SU VEĆ PALE (ne pitati ponovo):**
> - Odgovor kad nema mjesta za sve: „IMA ZA JEDNOG, ZA DRUGOG NEMA" + pokazati gdje bi prvi bio.
> - Brojač količine ide uz SVE TRI vrste (neko dovede jednog malog i jednog velikog psa).
> - Kad su tražene različite vrste, „Jedan boks" NE POSTOJI (strogo pravilo od 31.7.),
>   pa se segbar tada i ne prikazuje - odmah se računa odvojeno.
> - **KORAK 13 (cijena) SE PRESKAČE.** Vesna i Novica: „ista je cijena đe god oni bili."
>   Boško: „iskuliraj to." Dakle `estimateFor` se NE dira.
> - Selidbe ostaju kako jesu. Vesna i Novica: „neka ga seli, svakako mi njegov raspored
>   ne pratimo, nego smještamo đe ima slobodno." Dakle „najkraći boravak prije selidbe" NE.
>
> Plan ispod je napravila ekipa agenata i svaki nalaz je prošao nezavisnu provjeru.
> Sve brojke su izmjerene nad živim izvozom baze, nisu pretpostavljene.

---

# PLAN IZMJENE: „Jedan boks" / „Odvojeni boksevi" (Cindyland v1.15.0)

Fajl: `/Users/boskokankaras/Documents/GitHub/cindyland/app/index.html` (danas v1.14.0, 3957 redova).
Sve mjere u planu su izmjerene nad živim izvozom baze kroz harness (skripte na kraju). Repo nije mijenjan.

---

## 0. PODJELA NA DVIJE RUNDE (preporuka)

Posao JESTE prevelik za jednu rundu ako se u nju natrpa sve, ali **jezgro se NE SMIJE dijeliti**: čim jedan boravak dobije dva boksa, a app ih ne vidi kao zauzete, ona ih nudi drugom klijentu. Zato je granica ovakva:

**RUNDA 1 (ova) = „Odvojeni boksevi" koji ne laže.** Koraci 1-13 ispod. Vesna i Novica poslije nje mogu: dva psa istog vlasnika staviti u dva boksa, ručno ili dugmetom „Iskombinuj", vide oba boksa u kalendaru i u „Slobodno danas", dobiju upozorenje kad nema mjesta za oba, i dobiju tačan predračun.

**RUNDA 2 (poslije, zasebno) =** ekran „Provjeri datume" sa brojem mjesta; pravilo „najkraći boravak prije selidbe" (da drugi pas ne skače iz kaveza u boks svaki dan); dugmad traka na 44px; boravak sa 3 i 4 ljubimca (polje postane predugačko); prozor upozorenja kad se za miješane vrste izabere „Jedan boks"; „Otišao" po ljubimcu. Obrazloženje u tački 6.

**NE OBJAVLJIVATI dok cijela runda 1 nije unutra.** Svaki korak pojedinačno je bezbjedan (ništa se ne mijenja za postojeće podatke), ali segbar iz koraka 9 je jedini put do dvije trake, pa on ide posljednji.

---

## 1. IZABRANI MODEL PODATAKA

**Opcija (a): postojeći niz `stays.boxes` dobija još jedan neobavezan ključ `p`.**

```
[{"b":"mb9","f":"2026-08-03","t":"2026-08-11"}]                        -> Jedan boks (kao danas)
[{"p":"p12","b":"mb9","f":"...","t":"..."},
 {"p":"p13","b":"mb13","f":"...","t":"..."}]                           -> Odvojeni boksevi
```

Pravilo čitanja, jednom rečenicom: **segment sa `p` važi samo za tog ljubimca; segment bez `p` važi za svakog ljubimca koji nema svoju traku.**

Sve što je bilo jedno pravilo za cio boravak (spajanje uzastopnih perioda, sječenje preklapanja, razvlačenje na dolazak/odlazak) sada se radi **odvojeno po svakoj traci**, pa se rezultati spoje. Tako „isti pas se preselio usput" i „dva psa u dva boksa u isto vrijeme" prestaju da se sudaraju.

### Zašto stari zapisi rade bez migracije

1. **Kolona se ne mijenja.** `public.stays.boxes` je `jsonb`, nullable, bez check ograničenja. Novi ključ u objektu ne traži ni `ALTER TABLE` ni backfill.
2. **Mapiranje se ne mijenja.** `DB_MAP.stays` (red 3283) i `DB_UNMAP.stays` (red 3290) su čist prolaz: `boxes: r.boxes || null` u oba smjera. Polje `p` prolazi u bazu i nazad netaknuto, bez ijedne izmjene u sloju baze.
3. **Svih 1384 postojećih boravaka nema nijedan `p`** (provjereno: u 1505 segmenata postoje tačno tri ključa, `b`, `f`, `t`). Bez `p` cijeli niz je JEDNA traka, pa prolazi kroz istu normalizaciju kao danas.
4. **Izmjereno, ne pretpostavljeno:** nova `stayBoxes` nad svih 1384 boravaka daje **0 razlika** u odnosu na današnju, uključujući svih **88 boravaka koji već koriste više perioda (selidba usput)**. Skripta `plan_a1.mjs`.

### Zašto NE nova kolona i NE zaseban boravak po ljubimcu

- Nova kolona traži DDL prije deploya, a `dbSave` šalje cio mapiran red: dok migracija ne prođe, **svaki** upis boravka bi pucao.
- Dijeljenje na dva boravka bi udvostručilo naplatu, depozit, štrikove Došao/Otišao i redove u svim spiskovima, a parska tarifa važi samo unutar jednog boravka.

### Gdje se pamti izabrani režim

**Nigdje posebno, i to je namjerno.** Režim se vidi iz samih podataka: ima li ijedan segment `p`, to su odvojeni boksevi. Kad boravak nema nijedan boks, nema ni šta da se pamti, pa se režim pogađa po ljubimcima (različite grupe = odvojeni). U formi režim živi u `SF.odvojeno` i vraća se pri svakom otvaranju. Time smo izbjegli i kolonu u bazi i lažno stanje.

### Povratak na staro (rollback)

Ako se izmjena povuče, stara verzija boravak sa dvije trake pročita kao jedan boks i **prvo čuvanje tog boravka trajno obriše drugu traku**. Dok se ti boravci ne diraju, podatak stoji u bazi. Zato: ako se vraća stara verzija, prvo napraviti kopiju `stays` (i tabela dobija RLS odmah, po pravilu iz CLAUDE.md).

---

## 2. IZMJENE PO FUNKCIJAMA, REDOM UPISIVANJA

Anker = tačan tekst koji treba naći u fajlu (brojevi redova su za orijentaciju, oni se pomjeraju kako se upisuje).

---

### KORAK 1. `stayBoxes` normalizuje PO TRACI (jezgro svega)

**Anker:** `function stayBoxes(st){` (oko reda 876), zamijeniti cijelu funkciju do njene zatvorene vitičaste.

```js
/* jedna traka = svi periodi ISTOG ljubimca (ili zajednička traka, segmenti bez `p`).
   Spajanje, sječenje preklapanja i razvlačenje na termin rade se UNUTAR trake,
   pa se dva ljubimca u dva boksa ne jedu međusobno. */
function stayTraka(st, p, lista){
  let segs = lista
    .map(s => {
      const f0 = s.f || st.from, t0 = s.t || st.to;
      const o = { b: s.b, f: f0 < st.from ? st.from : f0, t: t0 > st.to ? st.to : t0 };
      if (p) o.p = p;
      return o;
    })
    .filter(s => s.f <= s.t)
    .sort((a, b) => a.f.localeCompare(b.f));
  if (!segs.length) return segs;
  /* uzastopni periodi ISTOG boksa su jedan period (stalni gost mjesecima u istom boksu) */
  const spojeni = [];
  for (const s of segs){
    const last = spojeni[spojeni.length - 1];
    if (last && last.b === s.b && addDays(last.t, 1) >= s.f){ if (s.t > last.t) last.t = s.t; }
    else spojeni.push(s);
  }
  segs = spojeni;
  /* period se prekida kad počne sljedeći U ISTOJ TRACI (premještanje); prazni ispadaju */
  for (let i = 0; i < segs.length - 1; i++){
    const nextF = segs[i + 1].f;
    if (segs[i].t >= nextF) segs[i].t = addDays(nextF, -1);
  }
  segs = segs.filter(s => s.f <= s.t);
  if (!segs.length) return segs;
  /* prvi počinje sa dolaskom, posljednji traje do odlaska (bez rupa na krajevima) */
  segs[0].f = st.from;
  segs[segs.length - 1].t = st.to;
  return segs;
}
function stayBoxes(st){
  const svi = (st.boxes && st.boxes.length ? st.boxes : (st.boxId ? [{ b: st.boxId, f: st.from, t: st.to }] : []))
    .filter(s => s && s.b);
  if (!svi.length) return [];
  const trake = new Map();
  for (const s of svi){
    const k = s.p || '';
    if (!trake.has(k)) trake.set(k, []);
    trake.get(k).push(s);
  }
  /* jedna zajednička traka = tačno današnje ponašanje (svi stari zapisi) */
  if (trake.size === 1 && trake.has('')) return stayTraka(st, '', svi);
  const out = [];
  for (const [p, lista] of trake) out.push(...stayTraka(st, p, lista));
  return out.sort((a, b) => a.f.localeCompare(b.f) || (a.p || '').localeCompare(b.p || '') || a.b.localeCompare(b.b));
}
```

Iznad funkcije dopuniti postojeći komentar `/* ---- MJESTO (BOKS) ---- ...`:

```
   Od v1.15.0 segment može imati i `p` (id ljubimca): tada važi SAMO za tog ljubimca.
   Segment bez `p` važi za svakog ljubimca koji nema svoju traku (režim „Jedan boks").
```

**Provjera:** `cd <scratchpad> && node plan_a1.mjs` mora ispisati `RAZLIKA: 0` i `boravaka sa vise perioda (selidba) stari/novi: 88 88`.

---

### KORAK 2. `stayBoxesLive` prestaje da briše `p`

**Anker:** `  return segs.map(s => ({ b: s.b, f: s.f, t: s.t > end ? end : s.t })).filter(s => s.f <= s.t);`

```js
  return segs.map(s => ({ ...s, t: s.t > end ? end : s.t })).filter(s => s.f <= s.t);
```

Bez ovoga se `p` gubi na svakom boravku koji ima štriknuto „Otišao", a kroz `stayBoxesLive` ide SVAKO računanje zauzetosti.

---

### KORAK 3. Nove pomoćne funkcije (boks po LJUBIMCU)

**Anker:** ubaciti odmah ispod `function boxOnLive(st, iso){ … }` (oko reda 923), prije komentara `/* „glavni" boks boravka …`.

```js
/* grupa boksa koja odgovara ljubimcu (STROGO pravilo od 31.7.) */
function petGrupa(p){ return p.species === 'macka' ? 'm' : (p.size === 'veliki' ? 'vb' : 'mb'); }
/* SVI boksevi koje boravak drži tog dana (dva ljubimca = dva boksa) */
function boxesOn(st, iso){ return stayBoxes(st).filter(s => s.f <= iso && iso <= s.t).map(s => s.b); }
function boxesOnLive(st, iso){ return stayBoxesLive(st).filter(s => s.f <= iso && iso <= s.t).map(s => s.b); }
/* boks JEDNOG ljubimca: prvo njegova traka, pa zajednički segment */
function petBoxOn(st, petId, iso){
  const segs = stayBoxes(st).filter(s => s.f <= iso && iso <= s.t);
  const svoj = segs.find(s => s.p === petId);
  if (svoj) return svoj.b;
  const zajedno = segs.find(s => !s.p);
  return zajedno ? zajedno.b : null;
}
function petStayBoxId(st, petId){
  const segs = stayBoxes(st).filter(s => !s.p || s.p === petId);
  if (!segs.length) return null;
  return petBoxOn(st, petId, todayISO()) || segs[0].b;
}
/* kojoj grupi ljubimac pripada tog dana: po SVOM boksu, a bez boksa po svojoj vrsti */
function petGroupOn(st, petId, iso){
  const b = boxById(petBoxOn(st, petId, iso));
  if (b) return b.group;
  const p = petById(petId);
  return p ? petGrupa(p) : stayGroup(st, iso);
}
/* koliko LJUBIMACA ovog boravka tog dana spada u grupu g */
function stayPetsInGroup(st, iso, g){
  const pets = petsOfStay(st);
  if (!pets.length) return stayGroup(st, iso) === g ? 1 : 0;
  return pets.filter(p => petGroupOn(st, p.id, iso) === g).length;
}
```

Usput, u `sfRelevantGroups` (red 2174) zamijeniti dvije linije da koriste `petGrupa` (jedan izvor istine):

**Anker:** `    if (p.species === 'macka') g.add('m');` i sljedeći red `    else g.add(p.size === 'veliki' ? 'vb' : 'mb');` -> `    g.add(petGrupa(p));`

---

### KORAK 4. „Slobodno danas" i spisak dana broje SVE bokseve boravka

**Anker (groupSheet):** `  const occupied = new Set(staysOnDate(t).map(st => boxOnLive(st, t)).filter(Boolean));`
```js
  const occupied = new Set(staysOnDate(t).flatMap(st => boxesOnLive(st, t)));
```

**Anker (daySheet):** `  const occupied = new Set(stays.map(st => boxOnLive(st, iso)).filter(Boolean));`
```js
  const occupied = new Set(stays.flatMap(st => boxesOnLive(st, iso)));
```

Bez ovoga bi drugi boks pisao SLOBODAN i primio tuđu rezervaciju. To je isti kvar koji je već jednom lovljen u v1.10.0, drugim povodom.

---

### KORAK 5. „Danas": ljubimci se broje po SVOM boksu, ne cio boravak po jednom

**Anker (vDanas):**
```js
    const inG = here.filter(st => stayGroup(st, t) === g);
    const used = act.filter(b => use[b.id] && use[b.id].days.has(t)).length;
    const petsN = inG.reduce((s, st) => s + stayPets(st), 0);
```
```js
    const used = act.filter(b => use[b.id] && use[b.id].days.has(t)).length;
    const petsN = here.reduce((s, st) => s + stayPetsInGroup(st, t, g), 0);
```

**Anker (groupSheet, spisak grupe):**
```js
  const inGroup = staysOnDate(t).filter(st => stayHere(st, t) && stayGroup(st, t) === g)
    .sort((a, b) => ((boxById(boxOn(a, t)) || {}).sort || 0) - ((boxById(boxOn(b, t)) || {}).sort || 0));
```
```js
  const inGroup = staysOnDate(t).filter(st => stayHere(st, t) && stayPetsInGroup(st, t, g) > 0)
    .sort((a, b) => ((boxById(boxesOn(a, t)[0]) || {}).sort || 0) - ((boxById(boxesOn(b, t)[0]) || {}).sort || 0));
```

Boravak sa malim i velikim psom sada stoji na oba spiska, a brojčanik pokazuje po jednog psa u svakoj grupi. `stayGroup` ostaje netaknuta, koristi se još samo kao rezerva kad boravak nema nijednog ljubimca u imeniku.

---

### KORAK 6. Kalendar Boksevi: obje trake, ispravne ivice, ime ljubimca u ćeliji

**Anker:** `        (map[seg.b][iso] = map[seg.b][iso] || []).push(st);`
```js
        (map[seg.b][iso] = map[seg.b][iso] || []).push({ st, seg });
```

**Anker:** cio blok od `      const sts = map[b.id][iso];` do `      }` (redovi 1353-1361), zamijeniti:
```js
      const sts = map[b.id][iso];
      if (sts && sts.length){
        const st = sts[0].st;
        /* u ćeliji piše ime LJUBIMCA čija je to traka; kod zajedničkog boksa - svi ljubimci */
        const label = sts.map(x => { const p = x.seg.p ? petById(x.seg.p) : null;
          return p ? petLabel(p) : stayLabel(x.st); }).join(' / ');
        /* ivice po SEGMENTU, ne po „jednom boksu boravka" (inače se druga traka
           raspadne na zasebne kockice, svaki dan i početak i kraj) */
        const drzi = d => stayBoxesLive(st).some(s => s.b === b.id && s.f <= d && d <= s.t);
        const prevSame = drzi(addDays(iso, -1));
        const nextSame = drzi(addDays(iso, 1));
        const cls = `occ-${b.group} ${prevSame ? '' : 'stay-first'} ${nextSame ? '' : 'stay-last'}`;
        rows += `<td class="bg-cell ${cls}" data-act="stay-edit" data-id="${st.id}"><span class="bg-in">${esc(label)}</span></td>`;
      } else {
```
`gridBoxes()` se ne dira, ona već prolazi kroz sve segmente.

---

### KORAK 7. Značka boksa u spiskovima: po jedna po ljubimcu

**Anker:** `function boxBadge(st, short){` do kraja funkcije.
```js
function boxBadge(st, short){
  const segs = stayBoxes(st);
  if (!segs.length) return '<span class="badge b-warn">bez boksa</span>';
  const trake = [...new Set(segs.map(s => s.p || ''))];
  const jedna = (kljuc) => {
    const b = boxById(petStayBoxId(st, kljuc)) || boxById((segs.find(s => (s.p || '') === kljuc) || {}).b);
    if (!b) return '';
    const moji = segs.filter(s => (s.p || '') === kljuc);
    const more = moji.length > 1 ? `<span class="badge b-line bdg-swap" title="mijenja boks tokom boravka">${I.swap}</span>` : '';
    const ime = kljuc ? petLabel(petById(kljuc)) : '';
    const txt = (trake.length > 1 && ime ? ime + ' · ' : '')
      + (short ? GROUPS_1[b.group] + ' ' + boxShort(b) : GROUPS_1[b.group] + ' · ' + b.name);
    return `<span class="badge b-${b.group}">${esc(txt)}</span>${more}`;
  };
  return trake.map(jedna).join('');
}
```
Ikonica „mijenja boks" sada znači stvarno premještanje, a ne dva psa u dva boksa.

---

### KORAK 8. Kartica ljubimca pokazuje NJEGOV boks

**Anker (u spisku boravaka na kartici ljubimca, oko reda 2987):** `    const boks = boxById(stayBoxId(st));`
```js
    const boks = boxById(petStayBoxId(st, p.id));
```

---

### KORAK 9. FORMA BORAVKA: segbar i mjesto po ljubimcu

**9a. Otvaranje boravka pamti režim.**
**Anker:** `      boxes: stayBoxes(st).map(s => ({ ...s })), price: st.price != null ? String(st.price) : '',`
```js
      boxes: stayBoxes(st).map(s => ({ ...s })), odvojeno: false, price: st.price != null ? String(st.price) : '',
```
i odmah poslije zatvaranja tog objekta (`    };`) dodati:
```js
    SF.odvojeno = sfOdvojeniRezim();
```
Za NOVI boravak, u drugoj grani, u objekat dodati `odvojeno: false,` pored `boxes:`, a poslije `if (SF.clientId){ … }` dodati isti poziv `SF.odvojeno = sfOdvojeniRezim();`.

**Anker:** ispod `function sfDraftPets(){ … }` dodati:
```js
/* režim smještaja se NE pamti u bazi - vidi se iz samih boksova (svaki ljubimac svoj = odvojeni).
   Boravak bez ijednog boksa nema šta da pamti, pa odlučuju vrste: mali i veliki pas,
   odnosno pas i mačka, po strogom pravilu ne mogu u isti boks. */
function sfOdvojeniRezim(){
  const segs = (SF.boxes || []).filter(s => s && s.b);
  if (segs.some(s => s.p)) return true;
  if (segs.length) return false;
  return new Set(sfDraftPets().map(petGrupa)).size > 1;
}
/* segmenti boksa: bez argumenta svi, sa argumentom samo trake tog ljubimca ('' = zajednička) */
function sfSegsFor(kljuc){ return sfSegs().filter(s => (s.p || '') === kljuc); }
function sfGroupsFor(kljuc){
  const p = kljuc ? sfDraftPets().find(x => x.id === kljuc) : null;
  return p ? new Set([petGrupa(p)]) : sfRelevantGroups();
}
/* dani koje su u ovom istom boravku već uzeli DRUGI ljubimci - njima boks nije slobodan */
function sfBraceUse(kljuc, from, to, use){
  const out = {};
  for (const k in use) out[k] = { days: new Set(use[k].days), first: use[k].first, who: use[k].who };
  if (!kljuc) return out;
  sfSegs().forEach(s => {
    if ((s.p || '') === kljuc) return;
    const a = s.f > from ? s.f : from, b = s.t < to ? s.t : to;
    if (a > b) return;
    const m = out[s.b] = out[s.b] || { days: new Set(), first: null, who: '' };
    for (let iso = a; iso <= b; iso = addDays(iso, 1)) m.days.add(iso);
    if (!m.first || a < m.first){ m.first = a; m.who = petLabel(petById(s.p)) || 'isti boravak'; }
  });
  return out;
}
/* kad se spisak ljubimaca promijeni: siročad se čisti, a sa jednim ljubimcem nema odvojenih */
function sfUskladiBokseve(){
  const lista = sfDraftPets();
  const ids = new Set(lista.filter(p => p.id).map(p => p.id));
  SF.boxes = (SF.boxes || []).filter(s => !s.p || ids.has(s.p));
  if (lista.length < 2){
    SF.odvojeno = false;
    SF.boxes = SF.boxes.map(s => ({ b: s.b, f: s.f, t: s.t }));
  }
}
```

**9b. `sfSegs` prima ljubimca.**
**Anker:** `function sfSegs(){` do kraja funkcije.
```js
function sfSegs(){
  const from = SF.from, to = SF.type === 'dnevni' ? SF.from : SF.to;
  if (!from || !to || to < from) return (SF.boxes || []).filter(s => s && s.b);
  return stayBoxes({ boxes: SF.boxes, from, to, boxId: null });
}
```
(Ostaje ista, samo je sada svjesna traka. Filtriranje po ljubimcu radi `sfSegsFor`.)

**9c. Segbar u polju „Ljubimci".**
**Anker:** kraj petsHTML, tačno ova dva reda:
```js
        </button>
      </div></div>`;
```
zamijeniti sa:
```js
        </button>
      </div>
      ${existing.filter(p => SF.petIds.has(p.id)).length > 1 ? `<div class="seg" style="margin-top:10px">
        <button class="seg-btn ${SF.odvojeno ? '' : 'active'}" data-act="sf-smjestaj" data-id="jedan">Jedan boks</button>
        <button class="seg-btn ${SF.odvojeno ? 'active' : ''}" data-act="sf-smjestaj" data-id="odvojeno">Odvojeni boksevi</button>
      </div>` : ''}
      </div>`;
```
Traka ide UNUTAR polja „Ljubimci", odmah ispod slika, punom širinom, **bez naslova** (oba dugmeta sama izgovaraju svoju temu). Mora biti iznad „Termina", jer baneri o popunjenosti ispod termina zavise od ovog izbora. Klase `.seg` i `.seg-btn` (redovi 186-195) već postoje i klizač `.seg::before` je pravljen tačno za dva dugmeta, ništa se ne stilizuje.

**9d. Polje „Mjesto (boks)" po ljubimcu.**
**Anker:** cio blok od `  const segs = sfSegs();` (red 2322) do `  }` koje zatvara `else` granu (red 2353). Zamijeniti:
```js
  const odv = SF.odvojeno && sfDraftPets().length > 1;
  const boxHTML = `<div class="fld"><label class="lbl">Mjesto (boks)</label>
    ${odv
      ? sfDraftPets().map(p => `<div class="bs-grp">
          <div class="bs-pet"><span class="bs-av ${petGrupa(p) === 'm' ? 'av-m' : (petGrupa(p) === 'vb' ? 'av-vb' : 'av-mb')}">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : (p.species === 'macka' ? I.cat : I.dog)}</span>${esc(petLabel(p))}</div>
          ${boxBlockHTML(p.id || '', from, to, validRange)}
        </div>`).join('')
      : boxBlockHTML('', from, to, validRange)}
  </div>`;
```
i dodati novu funkciju odmah iznad `function sfSegs(){`:
```js
/* sadržaj polja „Mjesto (boks)" za JEDNOG ljubimca (kljuc = id ljubimca, '' = zajednički) */
function boxBlockHTML(kljuc, from, to, validRange){
  const svi = sfSegs();
  const moji = svi.map((s, i) => ({ s, i })).filter(x => (x.s.p || '') === kljuc);
  const otvoren = SF.plan && SF.plan[kljuc];
  if (!moji.length){
    const plan = validRange ? autoPlanHTML(from, to, kljuc, otvoren) : '';
    return `<select class="sf-box" data-pet="${esc(kljuc)}">${boxOptionsHTML(from, to, '', kljuc)}</select>
      ${validRange && !plan ? `<button class="btn btn-ghost btn-sm btn-block" data-act="sf-plan-show" data-pet="${esc(kljuc)}" style="margin-top:8px">${I.swap} Iskombinuj mjesta</button>` : ''}
      ${plan}
      ${kljuc ? '' : `<p class="hint" style="margin-top:6px">Ako još ne znaš gdje ide, ostavi prazno - upisaćeš kasnije.</p>`}`;
  }
  const lim = sfLeftLimit();
  const rows = moji.map(({ s, i }) => {
    const b = boxById(s.b);
    const kraj = lim && s.t > lim ? lim : s.t;
    const busy = kraj < s.f ? [] : boxStays(s.b, s.f, kraj, SF.id);
    const brat = svi.find(o => o !== s && (o.p || '') !== kljuc && o.b === s.b && o.f <= s.t && s.f <= o.t);
    return `<div class="bseg">
      <span class="badge b-${b ? b.group : 'line'}">${esc(boxFullName(b))}</span>
      <span class="bseg-d num">${moji.length > 1 ? fmtD(s.f) + ' - ' + fmtD(s.t) : 'cijeli boravak'}</span>
      ${busy.length ? `<span class="badge b-warn">zauzet</span>` : (brat ? `<span class="badge b-warn">${esc(petLabel(petById(brat.p)) || 'isti boravak')}</span>` : '')}
      <button class="iconbtn bseg-x" data-act="sf-box-del" data-id="${i}" aria-label="Ukloni">${I.x}</button>
    </div>`;
  }).join('');
  return `<div class="bsegs">${rows}</div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${validRange && diffDays(from, to) >= 1 ? `<button class="btn btn-ghost btn-sm" style="flex:1" data-act="sf-box-move" data-pet="${esc(kljuc)}">${I.swap} Premjesti</button>` : ''}
      ${validRange ? `<button class="btn btn-ghost btn-sm" style="flex:1" data-act="sf-plan-show" data-pet="${esc(kljuc)}">${I.swap} Iskombinuj</button>` : ''}
    </div>
    ${validRange && otvoren ? autoPlanHTML(from, to, kljuc, true) : ''}`;
}
```
Indeks `data-id` je indeks u PUNOM nizu, pa `sf-box-del-yes` ostaje netaknut.

**9e. CSS za podnaslov ljubimca.**
**Anker:** poslije `.bseg-x svg{width:16px;height:16px}` (red 364):
```css
/* kad svaki ljubimac ima svoj boks */
.bs-grp + .bs-grp{margin-top:14px;padding-top:14px;border-top:1.5px solid var(--line)}
.bs-pet{display:flex;align-items:center;gap:7px;margin:2px 2px 6px;font-size:13px;font-weight:750;color:var(--muted)}
.bs-av{width:26px;height:26px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.bs-av img{width:100%;height:100%;object-fit:cover}
.bs-av svg{width:14px;height:14px}
```
Ime ljubimca IDE U PODNASLOV, a ne u red sa boksom: najgori red već troši svih 339px raspoložive širine na 375px ekranu (značka 106.7 + datum 91.5 + „zauzet" 59.8 + X 34 + razmaci), pa bi se prelio.

**9f. Rukovaoci.**
**Anker:** `    case 'sf-type': sfSync(); SF.type = id; …` ubaciti iznad njega:
```js
    case 'sf-smjestaj': sfSync(); sfSmjestaj(id === 'odvojeno'); break;
```
Nova funkcija, uz ostale sf- funkcije:
```js
/* prekidač režima: ništa se ne upisuje u bazu, forma je nacrt do „Sačuvaj".
   Povratak na „Jedan boks" ostavi na stranu tuđe trake, pa se ponovnim dodirom vrate. */
function sfSmjestaj(odvojeno){
  if (!!SF.odvojeno === odvojeno) return;
  const pets = sfDraftPets();
  if (odvojeno){
    if (SF.boxesOdvojeno){ SF.boxes = SF.boxesOdvojeno; SF.boxesOdvojeno = null; }
    else { const prvi = pets.find(p => p.id);
      SF.boxes = (SF.boxes || []).map(s => ({ ...s, p: s.p || (prvi ? prvi.id : undefined) })); }
  } else {
    SF.boxesOdvojeno = (SF.boxes || []).map(s => ({ ...s }));
    /* ostaje boks onog ljubimca koji ga jedini ima, inače prvog na ekranu */
    const imaju = pets.filter(p => p.id && (SF.boxes || []).some(s => s.p === p.id));
    const drzi = imaju.length ? (imaju.length === 1 ? imaju[0] : imaju[0]) : null;
    SF.boxes = (drzi ? (SF.boxes || []).filter(s => s.p === drzi.id) : (SF.boxes || []))
      .map(s => ({ b: s.b, f: s.f, t: s.t }));
  }
  SF.odvojeno = odvojeno;
  SF.plan = null;
  renderStayForm();
}
```
**Anker:** `  if (e.target.id === 'sfBox' && SF){` (u `change` slušaocu)
```js
  if (e.target.classList && e.target.classList.contains('sf-box') && SF){
    sfSync();
    const to = SF.type === 'dnevni' ? SF.from : SF.to;
    const kljuc = e.target.dataset.pet || '';
    const ostali = (SF.boxes || []).filter(s => (s.p || '') !== kljuc);
    const novi = e.target.value ? [{ ...(kljuc ? { p: kljuc } : {}), b: e.target.value, f: SF.from, t: to || SF.from }] : [];
    SF.boxes = ostali.concat(novi);
    renderStayForm();
  }
```
**Anker:** `    case 'sf-plan-show': sfSync(); {` cio case:
```js
    case 'sf-plan-show': sfSync(); { const kljuc = t.dataset.pet || '';
        const p = autoBoxPlan(SF.from, SF.type === 'dnevni' ? SF.from : SF.to, SF.id, sfGroupsFor(kljuc),
          sfBraceUse(kljuc, SF.from, SF.type === 'dnevni' ? SF.from : SF.to, boxUsage(SF.from, SF.type === 'dnevni' ? SF.from : SF.to, SF.id)));
        if (!p){ toast('Za ovaj termin i vrstu nema šta da se kombinuje.'); break; }
        SF.plan = SF.plan || {}; SF.plan[kljuc] = true;
      } renderStayForm(); break;
```
**Anker:** `    case 'sf-plan-take': {` cio case:
```js
    case 'sf-plan-take': {
        sfSync();
        const kljuc = t.dataset.pet || '';
        const to2 = SF.type === 'dnevni' ? SF.from : SF.to;
        const use0 = sfBraceUse(kljuc, SF.from, to2, boxUsage(SF.from, to2, SF.id));
        const plan = autoBoxPlan(SF.from, to2, SF.id, sfGroupsFor(kljuc), use0);
        if (!plan || !plan.segs.length){ toast('Nema slobodnih mjesta u ovom terminu.'); break; }
        /* pregazi SAMO traku ovog ljubimca */
        SF.boxes = sfSegs().filter(s => (s.p || '') !== kljuc)
          .concat(plan.segs.map(s => ({ ...(kljuc ? { p: kljuc } : {}), ...s })));
        renderStayForm();
        toast(plan.segs.length === 1 ? 'Upisan boks.' : 'Raspoređeno u ' + plan.segs.length + ' boksa.');
      } break;
```
**Anker:** `    case 'sf-box-move': sfSync(); MV = null; sfMoveModal(); break;`
```js
    case 'sf-box-move': sfSync(); MV = null; sfMoveModal(t.dataset.pet || ''); break;
```
**Anker (`sfMoveModal`):** potpis i prva dva reda:
```js
function sfMoveModal(kljuc){
  if (kljuc === undefined) kljuc = MV ? MV.pet : '';
  const from = SF.from, to = SF.type === 'dnevni' ? SF.from : SF.to;
  if (!from || !to || to < from){ toast('Prvo izaberi termin.'); return; }
  const segs = sfSegsFor(kljuc);
```
u istoj funkciji, red `  if (!MV || MV.date < minD || MV.date > to) MV = { date: (t > minD && t <= to) ? t : minD, box: '' };`
```js
  if (!MV || MV.pet !== kljuc || MV.date < minD || MV.date > to) MV = { pet: kljuc, date: (t > minD && t <= to) ? t : minD, box: '' };
```
i red sa padajućim menijem: `      <select id="mvBox">${boxOptionsHTML(MV.date, to, MV.box)}</select></div>`
```js
      <select id="mvBox">${boxOptionsHTML(MV.date, to, MV.box, kljuc)}</select></div>
```
**Anker:** `        SF.boxes = sfSegs().concat([{ b, f: d, t: to }]);`
```js
        const kljuc = MV ? (MV.pet || '') : '';
        SF.boxes = sfSegs().concat([{ ...(kljuc ? { p: kljuc } : {}), b, f: d, t: to }]);
```
**Anker (`sf-box-del`, poruka):** blok od `        const ostali = segs.filter((_, j) => j !== i);` do zatvaranja `confirmModal(...)`:
```js
        const kljuc = s.p || '';
        /* ishod se računa UNUTAR trake tog ljubimca - tuđi boks ne preuzima njegove dane */
        const moji = segs.filter((x, j) => j !== i && (x.p || '') === kljuc);
        const to0 = SF.type === 'dnevni' ? SF.from : SF.to;
        const poslije = stayBoxes({ boxes: moji, from: SF.from, to: to0, boxId: null });
        const pokriva = poslije.find(x => x.f <= s.f && s.f <= x.t);
        const nb = pokriva ? boxById(pokriva.b) : null;
        const ime = (kljuc && sfDraftPets().length > 1) ? petLabel(petById(kljuc)) + ': ' : '';
        confirmModal('Ukloniti mjesto?',
          `<b>${esc(b.name || '?')}</b> · <span class="num">${s.f === s.t ? fmtD(s.f) : fmtD(s.f) + ' - ' + fmtD(s.t)}</span><br>` +
          (nb ? `${esc(ime)}te dane preuzima <b>${esc(nb.name)}</b>${poslije.length === 1 ? ' (cijeli boravak)' : ''}.`
              : (poslije.length ? `${esc(ime)}ti dani ostaju bez boksa.` : `${esc(ime) || 'Boravak '}ostaje bez boksa.`)),
          'sf-box-del-yes', String(i), 'Ukloni', true);
```
**Anker:** `    case 'sf-pet-toggle': sfSync(); SF.petIds.has(id) ? SF.petIds.delete(id) : SF.petIds.add(id); renderStayForm(); break;`
```js
    case 'sf-pet-toggle': sfSync(); SF.petIds.has(id) ? SF.petIds.delete(id) : SF.petIds.add(id); sfUskladiBokseve(); renderStayForm(); break;
```
Isto dopisati `sfUskladiBokseve();` prije `renderStayForm()` u `sf-newpet-del`, `sf-pf-add`, `sf-client-pick` i `sf-client-clear`.

**Anker (`pe-stay-toggle`):** blok
```js
        if (SF.id){
          const st = D.stays.find(s => s.id === SF.id);
          if (st){ st.petIds = [...SF.petIds]; dbSave('stays', st); }
        }
```
```js
        sfUskladiBokseve();
        if (SF.id){
          const st = D.stays.find(s => s.id === SF.id);
          if (st){ st.petIds = [...SF.petIds]; st.boxes = SF.boxes.map(s => ({ ...s }));
            st.boxId = st.boxes.length ? st.boxes[0].b : null; dbSave('stays', st); }
        }
```
**Anker (`petDelete`):** `  touched.forEach(st => { st.petIds = st.petIds.filter(id => id !== petId); });`
```js
  touched.forEach(st => {
    st.petIds = st.petIds.filter(id => id !== petId);
    /* boks se NE oslobađa tiho samo zato što je karton obrisan - briše se samo njegova traka */
    st.boxes = (st.boxes || []).filter(s => !s.p || s.p !== petId);
    if (st.petIds.length < 2) st.boxes = st.boxes.map(s => ({ b: s.b, f: s.f, t: s.t }));
    st.boxId = st.boxes.length ? st.boxes[0].b : null;
  });
```
i poslije `  if (SF) SF.petIds.delete(petId);` dodati `  if (SF) sfUskladiBokseve();`.

---

### KORAK 10. Padajući meni i planer po ljubimcu, plus plan za N mjesta

**Anker:** `function boxOptionsHTML(from, to, selected){` i prva tri reda:
```js
function boxOptionsHTML(from, to, selected, kljuc){
  const groups = sfGroupsFor(kljuc || '');
  const valid = from && to && to >= from;
  const use = valid ? sfBraceUse(kljuc || '', from, to, boxUsage(from, to, SF ? SF.id : null)) : {};
```
Time drugi ljubimac vidi bratov boks kao zauzet, sa tačnim tekstom „slobodan 05.09.-10.09." koji već pravi `boxFreeRanges` + `freeRangesLabel`.

**Anker:** `function autoBoxPlan(from, to, exceptId, grupe){` i red `  const use = boxUsage(from, to, exceptId);`
```js
function autoBoxPlan(from, to, exceptId, grupe, use0){
```
```js
  const use = use0 || boxUsage(from, to, exceptId);
```
Jedna riječ, a svi postojeći pozivi ostaju važeći.

**Anker:** `function autoPlanHTML(from, to, tarzi){` i `  const plan = autoBoxPlan(from, to, SF.id);`
```js
function autoPlanHTML(from, to, kljuc, tarzi){
  const use0 = sfBraceUse(kljuc || '', from, to, boxUsage(from, to, SF.id));
  const plan = autoBoxPlan(from, to, SF.id, sfGroupsFor(kljuc || ''), use0);
```
i u dnu iste funkcije dugme:
```js
    ${plan.segs.length ? `<button class="btn btn-primary btn-block btn-sm" data-act="sf-plan-take" data-pet="${esc(kljuc || '')}" style="margin-top:10px">Prihvati raspored</button>` : ''}
```

---

### KORAK 11. Popunjenost broji PO GRUPI i za onoliko mjesta koliko se traži

**Anker:** `function sfLoadDays(){` do kraja funkcije.
```js
function sfLoadDays(){
  const from = SF.from, to = SF.type === 'dnevni' ? SF.from : SF.to;
  const prazno = { puni: [], kavezi: [] };
  if (!from || !to || to < from || diffDays(from, to) > 400) return prazno;
  const pets = sfDraftPets();
  /* koliko mjesta traži svaka grupa: „Jedan boks" = jedno po grupi, „Odvojeni" = po ljubimcu.
     Slobodan mali boks ne pomaže mački, zato se broji po grupi a ne po zbiru. */
  const treba = {};
  if (pets.length) for (const p of pets){ const g = petGrupa(p); treba[g] = SF.odvojeno ? (treba[g] || 0) + 1 : 1; }
  else for (const g of sfRelevantGroups()) treba[g] = 1;
  const use = boxUsage(from, to, SF.id);
  const zauzet = (b, iso) => !!(use[b.id] && use[b.id].days.has(iso));
  const fali = (samoPravi, iso) => {
    for (const g in treba){
      const arr = D.boxes.filter(b => b.active && b.group === g && (!samoPravi || !boxSpare(b)));
      if (!arr.length) continue;
      if (arr.filter(b => !zauzet(b, iso)).length < treba[g]) return true;
    }
    return false;
  };
  const puni = [], kavezi = [];
  for (let iso = from; iso <= to; iso = addDays(iso, 1)){
    if (fali(false, iso)) puni.push(iso);
    else if (fali(true, iso)) kavezi.push(iso);
  }
  return { puni, kavezi };
}
```
**Anker (crveni baner):** `<b>Sve je popunjeno${sfPetsSuffix()}</b>`
```js
<b>${SF.odvojeno && sfDraftPets().length > 1 ? 'Nema mjesta za sve' + sfPetsSuffix() : 'Sve je popunjeno' + sfPetsSuffix()}</b>
```

Izmjereno na živim podacima (05.08.2026 + godinu dana): mačke imaju **5 dana** sa tačno jednim slobodnim boksom, veliki psi **1 dan**, mali psi nijedan (imaju 8 kaveza kao rezervu, ali **12 dana** kad je slobodan manje od dva prava boksa). Danas app te dane pusti bez riječi.

---

### KORAK 12. Brana pri upisu vidi i brata iz istog boravka

**Anker:** `  sfSegs().forEach(s => {` u `sfBoxConflicts` i cio blok do zatvaranja.
```js
  const svi = sfSegs();
  svi.forEach((s, i) => {
    const kraj = lim && s.t > lim ? lim : s.t;
    if (kraj < s.f) return;
    const b = boxById(s.b);
    const ime = b => GROUPS_1[b ? b.group : ''] ? GROUPS_1[b.group] + ' ' + b.name : (b ? b.name : '?');
    boxStays(s.b, s.f, kraj, SF.id).forEach(st => {
      out.push({ boks: ime(b), ko: stayLabel(st),
        od: s.f > st.from ? s.f : st.from, do: kraj < st.to ? kraj : st.to });
    });
    /* i unutar istog boravka: dva ljubimca u istom boksu iako je izabrano „Odvojeni" */
    svi.forEach((o, j) => {
      if (j <= i || (o.p || '') === (s.p || '') || o.b !== s.b) return;
      if (o.t < s.f || kraj < o.f) return;
      out.push({ boks: ime(b), ko: petLabel(petById(o.p)) || 'isti boravak',
        od: s.f > o.f ? s.f : o.f, do: kraj < o.t ? kraj : o.t });
    });
  });
```

---

### KORAK 13. Cijena: parska tarifa važi samo kad DIJELE boks

**PRVO PITATI BOŠKA** (pa Vesnu i Novicu): da li „Dva u boksu · noćenje" iz cjenovnika važi i za dva psa istog vlasnika u ODVOJENIM boksevima? Ime polja kaže da ne važi, ali to je njihova poslovna odluka. Ako kažu da važi uvijek, ovaj korak se **preskače** i ništa drugo se ne mijenja (zato je posljednji).

**Anker:** `function estimateFor(petsArr, type, from, to){` i red sa parenjem.
```js
function estimateFor(petsArr, type, from, to, zajedno){
```
```js
    const par = zajedno !== false;
    total += (par ? Math.floor(cnt[k] / 2) : 0) * catAmount(c, nights, true)
           + (par ? cnt[k] % 2 : cnt[k]) * catAmount(c, nights, false);
```
**Anker:** `function stayEstimate(st){ return estimateFor(petsOfStay(st), st.type, st.from, st.to); }`
```js
/* parska cijena je po cjenovniku „dva u ISTOM boksu" - kad svaki ima svoj, ne važi */
function stayEstimate(st){ return estimateFor(petsOfStay(st), st.type, st.from, st.to, !stayBoxes(st).some(s => s.p)); }
```
**Anker (u formi):** `  const est = estimateFor(estPets, SF.type, from, to);`
```js
  const est = estimateFor(estPets, SF.type, from, to, !SF.odvojeno);
```
**Anker (tekst predračuna):** `${estPets.length} ljubim${estPets.length === 1 ? 'ac' : 'ca'})`
```js
${estPets.length} ljubim${estPets.length === 1 ? 'ac' : 'ca'}${estPets.length > 1 ? (SF.odvojeno ? ', odvojeni boksevi' : ', jedan boks') : ''})
```

Razmjera na živim podacima: mijenja se **jedan jedini postojeći boravak** (Jelena Kasalica, Cezar + Simba, 8 noćenja, bez upisane cijene): 160 EUR danas prema 192 EUR za odvojene. Ostalih 5 boravaka sa dva ljubimca ima ručno upisanu cijenu ili su kućni psi sa 0 EUR. Za buduće: razlika je 4-5 EUR po noćenju do 9 noćenja, **tačno 0 za 10-29 noćenja** (parska desetodnevna je dvostruka dnevna u sve tri kategorije), pa oko 100 EUR na 30 noćenja.

---

### KORAK 14. Verzija

`APP_VERSION` u `app/index.html` (red 704), `CACHE` u `app/sw.js`, `app/version.json` -> `v1.15.0`.

---

## 3. ALGORITAM ZA N ODVOJENIH MJESTA (u kodu)

Jezgro `autoBoxPlan` se **ne mijenja** (osim što prima `use0`). N mjesta = N prolaza, svaki sljedeći vidi mjesta prethodnih kao zauzeta, i svaki bira SAMO iz grupe svog ljubimca.

U ovoj rundi se to postiže bez nove funkcije: dugme „Iskombinuj" postoji po ljubimcu, a `sfBraceUse` u zauzetost ubacuje trake ostalih ljubimaca istog boravka. Ako se hoće jedno dugme za sve ljubimce odjednom (runda 2), evo funkcije:

```js
/* raspored za VIŠE mjesta odjednom: ljubimac po ljubimac, svaki sljedeći vidi prethodne */
function autoBoxPlanN(from, to, exceptId, zahtjevi){
  if (!from || !to || to < from || diffDays(from, to) > 400) return null;
  const use = boxUsage(from, to, exceptId);
  const uzeto = {};                                  // boks -> dani koje je uzeo OVAJ plan
  const spoji = () => {
    const out = {};
    for (const k in use) out[k] = { days: new Set(use[k].days), first: use[k].first, who: use[k].who };
    for (const k in uzeto){ const m = out[k] = out[k] || { days: new Set(), first: null, who: '' };
      for (const d of uzeto[k]) m.days.add(d); }
    return out;
  };
  const mjesta = [];
  for (const z of zahtjevi){                         // z = { p: idLjubimca, g: 'mb' | 'vb' | 'm' }
    const p = autoBoxPlan(from, to, exceptId, new Set([z.g]), spoji());
    if (!p){ mjesta.push({ p: z.p, segs: [], full: null, nemaBokseva: true }); continue; }
    mjesta.push({ p: z.p, segs: p.segs, full: p.full });
    p.segs.forEach(s => { const set = uzeto[s.b] = uzeto[s.b] || new Set();
      for (let iso = s.f; iso <= s.t; iso = addDays(iso, 1)) set.add(iso); });
  }
  return { mjesta };
}
```

**Izmjereno (skripta `plan_a2.mjs`, 1080 kombinacija grupa x termin x N=2 i 3, avgust 2026 do februara 2027):**
- **0 sudara** unutar plana (nikad dva ljubimca u istom boksu istog dana),
- **0 planova gorih od fizičkog minimuma** (ako mjesta stvarno ima, plan ga nađe; ako fali, fali tačno onoliko koliko fizički fali).

Šta plan NE garantuje: najmanji mogući broj selidbi. U gužvi zna dati jednu selidbu više od savršenog rasporeda. Živi primjer, špica 06-15.08.2026, dva mala psa: prvi ide u Mali Kavez 5 svih 10 dana bez selidbe, drugi se seli 3 puta po kavezima. To nije mana algoritma nego stanje pansiona tih dana (sva 24 prava mala boksa su puna). Omekšavanje selidbi je runda 2.

---

## 4. UI: TAČAN HTML SEGBARA I GDJE IDE

**Gdje:** unutar polja „Ljubimci", odmah ispod reda sa slikama ljubimaca, prije zatvaranja tog polja. Dakle **iznad** „Vrste boravka" i **iznad** „Termina". Razlog: crveni i žuti baner o popunjenosti stoje ispod „Termina" i njihov tekst zavisi od ovog izbora. Da traka stoji u polju „Mjesto (boks)", odgovor bi se čitao prije pitanja.

**Kada:** samo kad boravak ima više od jednog izabranog ljubimca.

**HTML (bez naslova iznad, punom širinom):**
```html
<div class="seg" style="margin-top:10px">
  <button class="seg-btn active" data-act="sf-smjestaj" data-id="jedan">Jedan boks</button>
  <button class="seg-btn" data-act="sf-smjestaj" data-id="odvojeno">Odvojeni boksevi</button>
</div>
```
(`active` ide na ono što je izabrano, vidi korak 9c.)

**Podrazumijevano stanje:** „Jedan boks" kad su svi ljubimci iste grupe (svih 6 današnjih takvih boravaka je tako), „Odvojeni boksevi" kad su iz različitih grupa (11 od 26 klijenata sa više ljubimaca ima miješane grupe, npr. Maja Abramović pudla + labrador, Nikolai mali pas + mačka). Oba dugmeta su uvijek dodirljiva, ništa se ne zaključava.

**Izmjereno na 375px:** raspoloživa širina 339px, tekst „Odvojeni boksevi" ima 31px rezerve, ne prelama se. Polje „Mjesto (boks)" naraste sa 114px na 301px za dva ljubimca.

---

## 5. KAKO SE SVAKA IZMJENA PROVJERAVA

Harness: `cd /private/tmp/claude-501/-Users-boskokankaras/67ea4aa0-6855-4c01-9044-47fa7eb78db2/scratchpad && node <skripta>.mjs`. Skripte `plan_a1.mjs`, `plan_a2.mjs`, `plan_a3.mjs` su napisane i puštene, pokreću PRAVE funkcije iz `index.html` nad živim izvozom baze.

| Korak | Provjera |
|---|---|
| 1 | `node plan_a1.mjs` -> `RAZLIKA: 0` nad svih 1384 boravaka, `selidbe stari/novi: 88 88`. Ako nije nula, normalizacija po traci nije ista kao stara. |
| 2 | U `plan_a1.mjs` privremeno pustiti `stayBoxesLive` nad boravkom sa `leftAt` i tračkom `p`: `p` mora ostati u izlazu. |
| 3 | `node plan_a2.mjs` sekcije A-D: A vraća dvije trake, B vraća selidbu jednog psa dok drugi stoji, C je bajt u bajt kao danas, D drži i zajednički i lični segment. |
| 4 | U app-u: napravi boravak sa dva psa u odvojenim boksevima za DANAS, pa Danas -> klik na „Mali boksevi" -> u „Slobodno danas" **ne smiju** stajati ni jedan ni drugi boks. Isto u Kalendar -> klik na datum -> „Slobodni boksevi". |
| 5 | Isti boravak sa malim i velikim psom: na ekranu Danas „Mali boksevi" pokazuje 1 psa i „Veliki boksevi" 1 psa, a zbir gore („U pansionu danas") se ne mijenja. |
| 6 | Kalendar -> Boksevi: obje kolone imaju traku, svaka piše svoje ime psa, traka je jedna neprekidna a ne niz kockica; provjeriti i prelaz iz mjeseca u mjesec (traka na 1. u mjesecu ne smije imati zaobljen vrh ako se nastavlja unazad). |
| 7 | Spisak Danas: red boravka ima dvije značke sa imenima („Cezar · Mali B9", „Simba · Mali B13") i **nema** ikonicu „mijenja boks". |
| 8 | Kartica ljubimca Cezar pokazuje Mali B9, kartica Simba pokazuje Mali B13. |
| 9 | Klik „Odvojeni boksevi" pa nazad „Jedan boks" pa opet „Odvojeni": raspored se vraća netaknut (ništa se ne gubi na promašen dodir). Skloni jednog psa sa boravka -> traka nestane, ostane boks onog koji je ostao. |
| 10 | Za drugog psa padajući meni bratovog boksa piše „zauzet" (ili „slobodan od-do"), a „Iskombinuj" mu predlaže DRUGI boks. `node plan_a2.mjs` sekcije E i F: `sudara u planu: 0`, `planova gorih od fizickog minimuma: 0`. |
| 11 | Dvije mačke, odvojeni boksevi, termin 05.-09.08.2026: mora iskočiti crveni baner „Nema mjesta za sve za mačke". Sa „Jedan boks" istog termina banera nema. |
| 12 | Ručno oba psa u ISTI boks uz izabrano „Odvojeni" -> „Sačuvaj" mora iskočiti prozor „Boks je već zauzet" sa imenom brata. |
| 13 | Cezar + Simba, 03.-11.08.2026, prazno polje Cijena: „Jedan boks" pokazuje predračun 160 EUR, „Odvojeni boksevi" 192 EUR. |
| **kontrola koja NE ide kroz `stayBoxes`** | Prije i poslije: prebrojati sirove segmente u bazi (`select id, jsonb_array_length(boxes) from stays`). Otvoriti boravak sa dvije trake i pritisnuti „Sačuvaj izmjene" bez ijedne izmjene -> broj segmenata mora ostati isti. Ovo je jedina provjera koja hvata tiho gutanje trake. |
| **regresija premještanja** | Boravak sa JEDNIM psom: „Premjesti" od sredine termina i dalje mora dati dva perioda, drugi počinje na izabrani dan. To je noseće ponašanje 88 postojećih boravaka. |
| **prije objave** | `sudari(api, od, do)` iz `harness.mjs` preko naredna 3 mjeseca mora vratiti nulu. PAŽNJA: nula ima smisla tek POSLIJE koraka 1, jer prije njega nula ne dokazuje ništa. |

Uz to, po pravilu iz memorije: dizajnerski pregled ekrana na 375px i 1280px prije objave (forma boravka sa 1, 2 i 3 ljubimca, Danas, kalendar Boksevi, kartica ljubimca).

---

## 6. ŠTA NAMJERNO NE RADIMO U OVOJ RUNDI

1. **Ekran „Provjeri datume" ne dobija broj mjesta.** Ostaje kakav jeste i njegova rečenica na dnu ostaje TAČNA („Odgovor važi za jedno mjesto"). Razlog: taj ekran zna samo vrstu ljubimca, ne i čiji je, pa mu treba svoja mala forma; a njegov račun mora prvo dobiti `autoBoxPlanN`. Ako se dira sada, opseg se razlijeva na drugi ekran a dobit je manja nego u formi. Mjera problema: 11% termina za velike pse i 8,8% za mačke gdje ekran kaže „IMA MJESTA" a dva odvojena boksa nema; kod malih pasa 0%. **Jedina izmjena koju vrijedi uraditi odmah** je dopuna te rečenice u jednu riječ istine: `Odgovor važi za jedno mjesto (jedan boks) - koliko god ljubimaca u njega išlo.` (anker: `Odgovor važi za jedno mjesto (jedan boks).`)
2. **Ne uvodimo „najkraći boravak prije selidbe".** Drugi mali pas u gužvi zna da skače kavez -> boks -> kavez skoro svaki dan. Popravka je poznata i izmjerena (P=2 skida selidbe sa 185 na 144 uz 35 dana više u kavezu, a odgovor „ima li mjesta" se ne mijenja ni za jedan dan), ali to je **trgovina koju biraju Vesna i Novica**, ne programer. Pitati ih poslije prve sedmice korišćenja.
3. **Ne diramo visinu dugmadi traka (34,5px).** Pravilo traži 44px, ali to važi za CIJELU app-u (dugme „Sačuvaj" je 41,5px, X je 34x34px). Ako se digne samo nova traka, ona postane viša od „Sačuvaj". To je zaseban zadatak kroz zlatno pravilo (revizija, ocjena najmanje 9/10) i traži Boškovo „da".
4. **Ne pravimo poseban prikaz za 3 i 4 ljubimca.** Polje „Mjesto (boks)" tada naraste na oko 611px i traži sklopive grupe ili zajednička dugmad. U bazi postoje 2 klijenta sa tri i 1 sa četiri ljubimca, dakle rijedak slučaj; radi ispravno, samo je dugačko za skrolovanje.
5. **Ne pravimo prozor upozorenja kad se za miješane vrste izabere „Jedan boks".** Podrazumijevana vrijednost ih već vodi na „Odvojeni", a ručni izbor „Jedan boks" za psa i mačku radi tačno ono što app radi i danas, dakle nema pogoršanja.
6. **„Otišao" ostaje po BORAVKU.** Štrik i dalje oslobađa oba boksa odjednom. Odvajanje po ljubimcu traži novo polje u bazi (`left_at` je jedan datum po boravku), dakle DDL, a to je izričito van ove runde.
7. **Nema migracije podataka i nema nove kolone.** Nijedan postojeći zapis se ne dira. To je i najveća prednost izabranog modela.

---

## 7. TRI PITANJA KOJA IDU BOŠKU PRIJE (ILI ODMAH POSLIJE) KODIRANJA

1. **Parska cijena:** važi li „Dva u boksu" i kad su ljubimci u ODVOJENIM boksevima? (Od odgovora zavisi korak 13. Sve ostalo je nezavisno.)
2. **Tri ljubimca u jednom boksu:** koliko se naplaćuje? Danas kod izlazi na 1 par + 1 pojedinačno, i to niko nije potvrdio.
3. **Selidbe drugog psa:** smije li drugi ljubimac da se seli skoro svaki dan zbog jednog slobodnog dana u pravom boksu, ili radije da ostane u kavezu? (Runda 2, ali odgovor treba ranije.)

---

**Skripte za ponavljanje mjerenja:** `/private/tmp/claude-501/-Users-boskokankaras/67ea4aa0-6855-4c01-9044-47fa7eb78db2/scratchpad/plan_a1.mjs` (0 razlika nad 1384 boravka), `plan_a2.mjs` (nove trake + `autoBoxPlanN`, 1080 testova, 0 sudara), `plan_a3.mjs` (brojke o klijentima, boravcima i danima sa jednim slobodnim boksom). Nijedan fajl u repou nije mijenjan.