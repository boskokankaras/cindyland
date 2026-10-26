# Cindyland - kontekst projekta za Claude Code

PWA za evidenciju pansiona za pse i mačke. Korisnici: **Vesna i Novica** (vlasnici pansiona, muž i žena, Boškovi prijatelji - **Novica je muško**, nikad o njima u ženskoj množini) - po jedan nalog svako, sve dijele. Boško (vlasnik repoa) nije programer: srpski (latinica, ijekavica), bez žargona; sve tehničko radi Claude.

**PRAVILO (veće stvari):** prije isporuke ocijeni sam sebe 0-10 i revidiraj do min 9/10.

## Arhitektura

- **Bez builda**: `app/index.html` je cijela aplikacija (HTML+CSS+JS u jednom fajlu, vanilla). `app/` je JEDINI deploy folder.
- `app/config.js` - Supabase URL + anon ključ (`window.CINDY`). **Prazan config = lokalni probni režim** (localStorage + demo istorija iz `seed/seed.json`). Sa ključevima = prava app: prijava + baza + realtime.
- `app/supabase.js` - lokalna kopija supabase-js v2 UMD (bez CDN-a, radi offline).
- Podaci u bazi: `clients`, `pets`, `stays` (boravci; `pet_ids text[]`), `boxes`, `settings` (ključ `prices`). RLS: sve samo `authenticated`. Realtime na svim tabelama → app radi `loadAll()` refetch (debounce 600ms); **od v1.18.0 `loadAll` precrtava ekran SAMO ako se podaci razlikuju** (`snimakPodataka`, poređenje po id-u), inače bi svaki povratak u app i odjek sopstvenog upisa „trepnuo" cijelim ekranom.
- **PRAVILO: svaka nova tabela u `public` šemi mora ODMAH dobiti RLS** - i privremene rezervne kopije. Anon ključ je javan (stoji u `app/config.js` na sajtu), pa tabela bez RLS-a znači da je svako sa interneta može čitati I brisati. Naučeno 4.8.2026: `stays_rez_20260730` (kopija s migracije 30.7.) stajala je 5 dana otvorena; Supabase je poslao "security vulnerabilities" mejl. Recept: `alter table public.X enable row level security;` + `revoke all on public.X from anon, authenticated;` (za pomoćne tabele koje app ne dira), ili politika za `authenticated` (za tabele koje app koristi).
- Mutacije: optimistički u `D` + `dbSave`/`dbKill` (upsert/delete po `id`); id-jevi su tekstualni (`uid()` / `c123`/`p123`/`s123` iz seed-a).
- **Upisi na server idu U REDU, jedan po jedan** (`DB_RED` u `dbSave`/`dbKill`/`dbSavePrices`, od v1.16.0). Ranije je svaki upis kretao odmah, pa su išli paralelno - a `pets.client_id` i `stays.client_id` imaju strani ključ na `clients`. Kod novog klijenta vlasnik i ljubimac kretali su u istoj hiljaditinki sekunde (izmjereno: razmak 4-5 ms) i ljubimac je znao stići prvi -> baza ga odbije (23503) -> `dbSave` grešku progutao -> ljubimac ostane samo lokalno dok ga prvi `loadAll()` ne obriše sa ekrana. **Izmjereno nad živom bazom 30.8.2026: 16 od 33 nova klijenta (48%) ostalo je bez ljubimca upisanog u istom koraku; nijedan ljubimac dodat kasnije nije nestao.** NE vraćati paralelne upise.
- Uz red idu i: 3 pokusaja po upisu (`dbPokusaj`, prekid poslije 20 s, bez ponavljanja kad `navigator.onLine` kaze da nema veze), mapa nepotvrdjenih upisa `DB_CEKA` KOJA SE PAMTI I NA TELEFONU (`cindyland-ceka`, `cekaSnimi`/`cekaUcitaj`) pa upis prezivi i gasenje app-a, `vratiNesacuvano()` poslije svakog citanja (da svjeze stanje sa servera ne obrise ono sto jos nije stiglo), `ponoviNesacuvano()` na paljenje app-a / `online` / `visibilitychange` (sam odustane poslije `CEKA_SAM` = 5 neuspjeha, dugme "Posalji" ga uvijek pokrene), i traka upozorenja na SVIM ekranima (`nesacuvanoBroj`, umece se u `#view` u `render()`). **Pravilo: nijedan neuspjeh upisa ne smije proci tiho.**
- Tri stvari koje je nasla adversarna provjera, ne razbijati ih: (1) oznaka u `DB_CEKA` se brise SAMO ako je i dalje ista (`dbUspjeh`), inace bi uspjeh upisa progutao oznaku brisanja koje ceka iza njega; (2) `mergeClients` pise u bazu MIMO reda pa mora prvo `await DB_RED` i `cekaZaboravi('clients:'+id)`, inace spojeni klijent vaskrsne; (3) `clientDelete` mora `cekaZaboravi` za ljubimce i boravke tog klijenta (server ih brise kaskadno, njihovi upisi nikad ne bi prosli). Provjera: `scratchpad/harness_db*.mjs` pustaju PRAVI kod iz `app/index.html` nad laznim serverom koji provjerava strani kljuc.
- Novac na boravku (od v1.19.0): `price` = ukupno (prazno → predračun po cjenovniku, do `stayKraj`), `payments[]` = SVE primljeno, uključujući **avans** (`{a, d, av:1}`); **za naplatu = ukupno − uplate** (`stayNovac`/`chargeDue`). Kolona `deposit` je ugašena (uvijek null) - vidi „Avans, odlazak i naplata".
- Boksovi: grupe `mb` (Mali boksevi: Boks 1-13, Kotilica, Kotilica 2), `vb` (Veliki boksevi: Boks 1,2,4,5,6,7 - VB 3 ne postoji fizički), `m` (Mačke: Boks 1-5) + improvizovana mjesta iz istorije (kavezi, Kuća - `active:false`).

## Verzioniranje / PWA update (ista logika kao K-Sport Hub)

- **Na SVAKOM deployu podigni verziju na TRI mjesta:** `APP_VERSION` u `app/index.html`, `CACHE` u `app/sw.js` i `app/version.json` (semver `vX.Y.Z`). Promjena sw.js je signal browseru da postoji update.
- **Brza provjera (od v1.5.0):** `app/version.json` se ne kešira (`app/_headers`) - app ga pročita za desetinku sekunde i odmah zna da li ima novija verzija, bez čekanja da se worker instalira. „Osvježi i ažuriraj" preuzme workera na čekanju, a ako ga nema - obriše keš i učita iznova. Service worker precache-uje samo jezgro (index/config/supabase/manifest), ikone ulaze u kesh usput - zato je instalacija brza.
- Ponašanje: prompt (ništa se ne mijenja tiho) - tačkica na tabu Podešavanja + kutija „Nova verzija je spremna" + „Osvježi i ažuriraj" (SKIP_WAITING → controllerchange → reload, fallback 3s). Tiha provjera na povratak u app (visibilitychange/focus, throttle 60s) + na ~30 min + ručno dugme.
- `PWA.hadController` čuva da li je stranica bila kontrolisana pri učitavanju - bez toga bi prva instalacija lažno prijavila update (SW radi `clients.claim()`).
- Keš slika ljubimaca `cindyland-slike` je ZASEBAN i NE briše se ni na aktivaciji nove verzije ni na „Osvježi i ažuriraj" (fallback koji briše keševe ga preskače) - adrese slika su verzionisane (`?v=`), pa je ista adresa uvijek ista slika.

## Komande

```bash
npm install                                # prvi put (samo za skripte baze)
node scripts/run-sql.mjs sql/setup.sql     # šema baze (jednom po projektu)
node scripts/import-seed.mjs               # uvoz istorije iz seed/seed.json (truncate + insert)
python3 scripts/parse_excel.py "<CINDYLAND.xlsx>"   # regeneriši seed iz Excela
node scratchpad/harness_slike.mjs          # slike: service worker, male slike, loadAll bez precrtavanja (55 provjera)
node scratchpad/harness_db2.mjs            # red upisa (i harness_db.mjs, harness_db3.mjs)
npx netlify deploy --prod --dir app        # objava (site se veže uz `netlify link` / sites:create)
```

- Lokalni pregled: server servira ROOT projekta (root `index.html` preusmjerava na `app/`), jer app u lokalnom režimu vuče `../seed/seed.json` za demo. **`seed/` NIKAD ne smije u deploy** (podaci klijenata) - zato je deploy `--dir app`.
- **Demo u pregledaču bez prijave** (za provjeru UI-ja i service workera): `app/` + `seed/` + root `index.html` kopirati u `/tmp/cindy_demo`, u kopiji `app/config.js` staviti `window.CINDY = {};`, pa `preview_start` sa imenom `cindyland-demo` (port 8643, unos u `~/.claude/launch.json`). Prave storage adrese slika rade i u demu (bucket je javan), pa se SW/keš/zamjena male velikom provjeravaju bez naloga; upload i dopuna malih rade samo prijavljeni.
- `.env` (van gita): `SUPABASE_DB_HOST=aws-0-eu-west-1.pooler.supabase.com` (pooler za eu-west-1, NE direktni db host - IPv6), `SUPABASE_DB_USER=postgres.<ref>`, `SUPABASE_DB_PASSWORD=...`. **PAŽNJA: `.env` postoji samo na jednom od dva računara** (24.9.2026 zatečen na ovom sa sva tri ključa, na drugom ga nema) - prvo `ls -la .env`. Izmjene šeme: ili Boško nalijepi SQL u Supabase SQL editor (https://supabase.com/dashboard/project/ggcvkeltmarcxlmaczmf/sql/new - tako je rađena migracija depozita), ili Boško resetuje DB šifru (Settings - Database) pa je upisati u .env. Trebaće za dan predaje (istorija)!

## Istorija iz Excela (seed)

- Izvor: `CINDYLAND.xlsx` (27 mjesečnih sheetova, jun 2024 - avg 2026; blokovi MB/VB/M po sheetu, imena po danima, cijena sa € na dan odlaska).
- Parser `scripts/parse_excel.py`: spaja uzastopne dane u boravke, spaja preko granice mjeseca, „Preuzimanje" ćelija zatvara boravak, cjenovna ćelija dijeli boravak na naplatne segmente (stalni gosti plaćaju mjesečno - Xenny 300€/mj, Kan karting 330€/mj), najava cijene na prvi dan se ne duplira. Rezultat: ~1.430 boravaka, ~850 klijenata, ~93.000 € naplaćeno.
- **Granica tačnosti:** njene ručne mjesečne sume su često veće od zbira € u tabeli - dio naplata je vodila van tabele. Istorija u app-u = ono što je upisano u tabelu. Klijent = ime iz ćelije (nekad pas, nekad vlasnik, nekad oboje - tako je vodila).

## Produkcija (LIVE od 2.7.2026)

- **Live: https://cindyland.netlify.app** (Netlify site id `54a5dee4-62ca-4925-bb81-d735ec41b441`; deploy: `npx netlify deploy --prod --dir app --site 54a5dee4-...`). Repo: `https://github.com/boskokankaras/cindyland` (privatan; pull prije rada, push poslije).
- Supabase projekat `ggcvkeltmarcxlmaczmf`, **region eu-west-1 (Irska!)** - pooler host je `aws-0-eu-west-1.pooler.supabase.com` (NE eu-central kao K-Sport). URL `https://ggcvkeltmarcxlmaczmf.supabase.co`; anon ključ u `app/config.js`; DB šifra u `.env`.
- Šema + istorija uvezeni (850 klijenata / 855 ljubimaca / 1.432 boravka / 93.323 € naplaćeno) - `setup.sql` + `import-seed.mjs` izvršeni i provjereni kroz REST.
- Nalozi (kreirani direktno u `auth.users`+`auth.identities` SQL-om, prijava testirana): Vesna `vmitrovic1989@gmail.com` / `Vesna2026`, Novica `nolje.mne@gmail.com` / `Novica2026`. Novi nalog/promjena šifre: Supabase dashboard ili SQL recept iz sesije 2.7.
- **PostgREST vraća max 1000 redova po upitu** - `loadAll()` čita u serijama (`fetchAll` sa `.range()`); ne vraćati na obični `select('*')`.
- Na svakom sljedećem deployu: bump `APP_VERSION` + `CACHE` (korisnici dobiju „Nova verzija je spremna").

## Model boravka (od v1.5.0 - najvažnije)

Ranije je boravak bio zakovan za JEDAN boks za cijeli period, pa se svaki prelazak u drugi boks (i svaka granica mjeseca) vodio kao NOVI boravak. To je Vesni i Novici sjeckalo boravke i cijene. Sada:

- **`stays.boxes` (jsonb)** = niz perioda `[{"b":"mb2","f":"2026-07-01","t":"2026-07-31"}, …]`. Jedan boravak = jedan red od dolaska do odlaska, boks se mijenja usput („Premjesti u drugi boks"). `stays.box_id` je ostao samo kao trag starih zapisa (fallback u `stayBoxes()`); novi upisi pišu prvi boks iz niza.
- `stayBoxes(st)` normalizuje periode (kliješti ih na termin boravka, siječe preklapanja, prvi počinje sa dolaskom a posljednji traje do odlaska). `stayBoxesLive(st)` je isto to ali skraćeno ZAKLJUČNO SA `left_at` - koristi ga SVAKO računanje zauzetosti (kalendar, slobodni boksevi, kapacitet), dok prikaz reda koristi `stayBoxes`. **DAN ODLASKA JE ZAUZET**: štrik „Otišao" skida ljubimca sa spiska prisutnih ali NE oslobađa boks tog dana, boks je slobodan tek sjutradan (traženje Vesne i Novice, v1.10.0). Dan odlaska se NE naplaćuje, ali boks tog dana JESTE zauzet - to su dvije različite stvari.
- **Boks NIJE obavezan** (može se upisati kasnije). Popunjen kapacitet nije zabrana nego pitanje „X od Y dana je preko kapaciteta - Upiši / Odustani" (`sfCapacityAsk`).
- **`stays.payments` (jsonb)** = niz naplata `[{"a":300,"d":"2025-11-09"}, …]`. Dug boravak može biti plaćen u više navrata a Zarada po mjesecima ostaje tačna (svaka naplata nosi svoj datum). Zarada čita `allPayments()`, ne `price`.
- **`stays.arrived_at` / `left_at`** = štrik „Došao"/„Otišao" u Danas. Brojčanik LJUBIMACA gleda `stayHereOn()` (i Danas i kalendar, da bi pokazivali ISTI broj za isti dan); zauzetost BOKSA svuda ide preko `stayBoxesLive` - i pločica „zauzeto X od Y" i „Slobodno danas" (od v1.10.0; ranije su gledale `stayHere` pa su nudile zauzet boks kao slobodan); za ranije dane se podrazumijeva da je stigao/otišao (stara evidencija nema štrikove). Naplata na dan odlaska sama upisuje `left_at`; naplata usred boravka nudi „Samo naplata, ostaje u pansionu".
- **Cijena se računa po NOĆENJIMA** (`stayNights` = `diffDays(from,to)`): 25.-31. = 6 noćenja, dan odlaska se ne naplaćuje. Dolazak i odlazak istog dana = cijena dnevnog čuvanja. Pragovi 10+ i mjesečno se gledaju po noćenjima.
- **Pravi boks vs kavez** (`boxSpare(b)` = ime sadrži „kavez"/„transport"): Vesni i Novici broj boksa NE znači ništa, jedino im je bitno kad se pravi boksevi popune jer tada sljedeći ide u transporter. Zato: `autoBoxPlan()` sam složi raspored za cijeli termin (najduži niz slobodnih dana, pravi boks ima prednost, kavez samo za dane kad pravog nema), forma nudi „Prijedlog rasporeda" sa hronologijom i rupama („nema mjesta"), a `sfLoadDays()` daje dva nivoa upozorenja: `kavezi` (pravi puni) i `puni` (nema baš ničeg). Padajući meni ima samo tri stanja: prazno / „slobodan do X" / „zauzet" / „djelimično slobodan".
- Grupe po ljubimcu (`sfRelevantGroups`/`pdGroups`, STROGO od v1.8.2 na zahtjev Vesne i Novice): **mali pas SAMO mali boksevi, veliki pas SAMO veliki, mačka SAMO mačji** - vrste se ne miješaju ni u ponudi ni u „Provjeri datume". (Ranije je mali pas mogao i u veliki boks - NE vraćati bez njihove riječi.)
- Svuda se broje LJUBIMCI, ne boravci (dva psa u jednom boksu = 2) - brojčanik i brojevi uz naslove na Danas moraju da se slažu. `stayPets()` broji samo ljubimce koji POSTOJE u imeniku (u starim zapisima zna ostati obrisani ljubimac).
- Migracija 30.7.2026: rezervna kopija `stays_rez_20260730`, pa spojeni svi lanci (134 komada, 1528 → 1394 boravka). **Dnevna čuvanja se NIKAD ne spajaju** (dva dana = dva čuvanja) - jedan takav slučaj je vraćen nazad. Kontrola: zbir svih naplata prije i poslije = 102.264 € (isto do centa), i po svakom mjesecu isto. Naknadno ispravljeno: `paid` prati POSLJEDNJI komad (naplata na dan odlaska zatvara boravak) - 58 boravaka je pogrešno stajalo kao nenaplaćeno; i očišćeni nepostojeći ljubimci iz `pet_ids` (2 zapisa).

## Kartica ljubimca - prikaz i izmjena (od v1.17.0)

Novica je 15.9.2026 tražio dvije stvari, obje zbog slučajnih izmjena: navike da samo STOJE kao tekst, i da
„Izmijeni" na ljubimcu ne otvara podatke o vlasniku (x puta je tako zabrljao vlasnika).

- `PE` je sada `{ petId, fromStay, hist, form, top }`. **`form === null` = kartica samo PRIKAZUJE** (navike su
  tekst u `.pe-ro` bloku, ne textarea); `PE.form` postavljen = izmjena. Staro stanje (`PE.note` + `peSave()`
  koji je pri svakom zatvaranju tiho upisivao textarea) je UKLONJENO - to je bio uzrok slučajnih izmjena.
- **Izmjena živi U KARTICI LJUBIMCA** (`pePetFormHTML`): ime, pas/mačka, mali/veliki, pol, rasa, navike,
  „Obriši ljubimca". Nikad polja vlasnika. Ranije je `pe-edit` zatvarao karticu ljubimca i otvarao KARTON
  VLASNIKA sa `CE.petForm` - **NE vraćati to**. Vlasnik se mijenja samo preko reda „Vlasnik" (`pe-client`).
- Radnja `ce-pet-edit` (izmjena ljubimca iz kartona vlasnika) je obrisana - niko je nije ni pozivao, a vodila
  je tačno tamo gdje Novica ne želi. `cePetFormHTML` ostaje samo za DODAVANJE novog ljubimca (`ce-pet-new`).
- **Zatvaranje kartice ništa ne upisuje tiho.** Ako je u izmjeni nešto dirano (`peFormDirty`), krstić/klik
  pored/Android-nazad pitaju „Odbaciti izmjene?" (`pe-discard` / `pe-back`). Kad potvrda dođe iz `popstate`,
  `peDone` VRAĆA korak u istoriju (`history.pushState`) - bez toga bi sljedeće zatvaranje popovalo korak
  ispod (sheet) i zatvorilo i formu boravka.
- `PE.top` = sljedeći re-render počinje od vrha (prelaz prikaz<->izmjena); inače se skrol čuva (toggle
  pas/mačka ne smije baciti karticu na vrh).
- Slika ostaje SAMO u prikazu, ne u izmjeni: upload se upisuje odmah, pa bi u formi sa „Otkaži" lagao.
- **„Dodaj" ljubimca iz forme boravka takođe NE otvara karton vlasnika** (`pet-new` → `openPetNew`): ista
  kartica, samo prazna („Novi ljubimac", bez značaka i bez „Obriši"). Ranije je `client-open` sa
  `data-newpet` vodio na miješani ekran sa živim poljima vlasnika koja se pri zatvaranju tiho upišu -
  isti kvar na koji se Novica žalio. „Dodaj" iz KARTONA VLASNIKA (`ce-pet-new`) ostaje kakav je bio.
- **Znački u izmjeni NEMA** (forma ispod je jedina istina), a avatar boju/ikonu vuče iz `PE.form` - inače
  bi značka pisala staru vrstu/pol pa bi izgledalo da dodir nije primljen; kod pola je to opasno jer se
  drugi dodir GASI (`sex === id ? null : id`) pa bi ga ponovni dodir poništio.
- **`PE.pitanje`** = preko kartice stoji potvrda; dok je postavljeno, „nazad" znači Otkaži (vrati u
  karticu). Bez toga je „nazad" u „Odbaciti izmjene?" samo ponovo crtao isti prozor (izgleda pokvareno),
  a u potvrdi brisanja je jednim pritiskom zatvarao i potvrdu i cijelu karticu.
- **`PE.base`** = snimak u trenutku ulaska u izmjenu. „Dirano" se mjeri prema njemu, NE prema trenutnom
  zapisu (inače tuđi upis sa drugog telefona lažno prijavi izmjenu), a `peFormSave` upisuje **samo polja
  koja je korisnik dirao** - ako je druga osoba u međuvremenu dopisala navike, njen upis se ne gazi.
- `.pe-del` drži „Obriši ljubimca" odvojeno (34px niže, uže) - dupli dodir na „Izmijeni" je prije padao
  tačno na njega.
- `petDelete` sa nepostojećim ljubimcem (obrisan sa drugog uređaja dok je potvrda stajala) zatvara prozor
  i javi „Ljubimac je već obrisan." - ranije je tiho izlazio i potvrda se zaglavljivala.
- **NIJE mijenjano, svjesno** (za Boškovu odluku): brisanje ljubimca može ostaviti boravak bez ijednog
  ljubimca (potvrda obećava „Boravci ostaju sačuvani", `stayLabel`/`stayPets` imaju fallback - ali se takav
  boravak ne može ponovo snimiti dok mu se ne izabere ljubimac). I: brisanje klijenta iz liste otvorene
  kao sheet ostavlja jedan mrtav korak u istoriji (zatiče se i u v1.16.0).

## Slike ljubimaca (od v1.18.0) - brzina i keš

Novica se 24.9.2026 žalio da se slike i ikonice sporo učitavaju i da se „nešto samo refreshuje". Uzroci (izmjereno nad
živim storage-om): 117 slika, prosjek 169 KB (700 px JPEG) crtano u kvadratu od 42 px; storage šalje `Cache-Control:
max-age=3600` a stari SW je preskakao tuđe domene, pa su se slike poslije sata skidale iznova; i `loadAll()` je na svaki
povratak u app / svaki realtime događaj (i odjek sopstvenog upisa) mijenjao cio `#view`, pa je svaki `<img>` nastajao iznova.

- **Dvije veličine:** velika (do 700 px, za uvećan prikaz) i mala `…_s.jpg` (240×240, isječak sredine = isto što
  pokazuje avatar sa `object-fit: cover`). U bazi ostaje SAMO adresa velike (`pets.photo`); mala se izvodi imenom
  (`fotoMala`: `_s` ispred `.jpg`). Stari upisi stoje na `pets/<id>.jpg`; **od v1.18.0 svaka nova slika ide na NOVU
  putanju `pets/<id>-<vrijeme>.jpg`** jer CDN ispred storage-a kešira po putanji i NE gleda `?v=` (provjereno 24.9.2026:
  nasumičan `?v=` = `cf-cache-status: HIT`) - zamjena na istoj putanji bi drugom telefonu stizala stara, a uz keš
  „zauvijek" tako bi i ostala. Stara putanja (velika + mala) se briše tek kad `dbSave` potvrdi novu adresu. Avatari svuda (`fotoImg`) crtaju malu sa `data-velika` kao zamjenom; zum
  (`zoomPhoto`) prvo pokaže malu (već je na ekranu) pa podmetne veliku kad stigne.
- **Service worker** (`sw.js`, keš `cindyland-slike`): sve sa `/storage/v1/object/public/slike/` ide keš-prvo, zauvijek
  (adresa je verzionisana). Mreža se pita CORS zahtjevom (`mode:'cors'`, storage vraća `access-control-allow-origin: *`),
  ne „opaque" - da se vidi uspjeh i da keš ne raste u prazno. Ako male nema (stari upisi), SW vrati veliku i pamti je pod
  NJENIM imenom (ne pod imenom male), pa čim mala nastane koristi se ona; bez mreže vraća šta ima u kešu, inače
  `Response.error()`. Same-origin dio SW-a nije mijenjan.
- **Zamjena bez SW-a:** capture slušač `error` na `document` prebaci `<img data-velika>` na veliku tačno jednom
  (prvo otvaranje prije nego SW preuzme, privatni režim, „delete caches + reload" put u `applyUpdate`).
- **Dopuna malih za stare upise** (`dopuniMaleSlike`, poslije svakog `loadAll`, sa 4 s zakašnjenja): za svaku sliku iz
  `D.pets` HEAD na malu (storage za nepostojeći fajl vraća **HTTP 400** + `not_found`, ne 404); ako je nema - povuče
  veliku (kroz SW keš), smanji na telefonu (`slikaUJpeg`), pošalje `_s.jpg` sa **`upsert: false`** (dopuna samo PRAVI
  ono čega nema; 409 = već postoji = u redu - nikad starija verzija preko novije) i `cacheControl: 31536000`, pa je stavi
  u keš. Jedna po jedna, pauza 300 ms, izmiješan redoslijed. Na serversku grešku (HEAD/upload/mreža) staje i **miruje
  10 min** (`MALE_ODGODA`) - istekao token ili kvota ne smiju da izazovu 117 uzaludnih pokušaja na svaki `loadAll`;
  oštećen fajl / velika koje nema ide u `MALE_PRESKOCI` do sljedećeg paljenja. Staje i kad app ode u pozadinu ili
  nestane mreže. Potvrđene ADRESE pamti
  `localStorage['cindyland-male-slike']` (nova slika = nova adresa = nova provjera). **NIŠTA ne piše u bazu i nikad ne
  dira veliku.** Samo prijavljeni (`sb`), ne u probnom režimu. **Stanje 24.9.2026: male slike za svih 117 starih upisa su
  već napravljene** (pušteno iz prijavljene sesije u pregledaču na Macu, 117/117, prosjek 15,6 KB) - telefoni ih samo
  potvrde HEAD-om jednom i zapamte; dopuna ostaje kao osigurač za buduće slučajeve (pala mala pri uploadu).
- `uploadPetPhoto` pravi obje slike iz iste bitmape, obje šalje sa `cacheControl` godinu dana i obje odmah stavlja u
  `cindyland-slike` (`kesSlikaUpisi`) - da se upravo poslato ne skida nazad. Ako mala ne prođe, velika se svejedno upiše,
  a malu dopuni `dopuniMaleSlike`.
- `ocistiKesSlika` jednom dnevno izbaci iz keša adrese kojih nema u `D.pets` (zamijenjena slika, obrisan ljubimac).
- `loadAll` bez precrtavanja: snimak `snimakPodataka()` prije/poslije - po id-u (PostgREST vraća redove bilo kojim
  redom) i u KANONSKOM obliku reda sa servera (`DB_UNMAP(DB_MAP(x))`, `createdAt` kao vrijeme, `undefined`→`null`),
  jer bi inače tek upisan boravak/ljubimac (drugi redoslijed ključeva, „…Z" umjesto „…+00:00") izgledao drugačije od
  svog odjeka i izazvao precrtavanje sekundu poslije svakog upisa. `render()`/`save()`/re-crtanje kartica samo kad se
  razlikuje, kad se vraća iz `OFFLINE` ili kad se broj nesačuvanih upisa razlikuje od onog koji je posljednji `render`
  pokazao (`NES_CRTANO`) - inače bi traka „X unosa nije stiglo na server" ostala i poslije uspješnog ponovnog slanja.
  Prvi neuspjeh čitanja se tiho ponovi jednom poslije 2,5 s (`loadAll(true)`) prije trake „nema veze" (radio poslije
  buđenja). `fetchAll` ima `.order('id')` (`settings` → `key`): bez toga red na granici stranice od 1000 može ispasti
  ili se udvojiti. Održavanje slika je u `try` - ne smije nikad upaliti traku „nema veze".
- **Manje treptanja pri precrtavanju** (isti dan): `showModal` mijenja samo sadržaj već otvorenog modala (bez ponovne
  fade/pop animacije, fokus i kursor u polju se vraćaju; skrol ide na vrh kao kod novog elementa - kartice ga same
  vraćaju); `renderTopbar`/`renderTabbar` ne crtaju isti sadržaj ponovo (`TOPBAR_KLJUC`/`TABBAR_KLJUC`, reset u
  `showApp`) pa logo i ikonice tabova ne nastaju iznova; `render()` vraća fokus i kursor u `#klSearch`; zum podmeće
  veliku tek poslije `decode()` (WebKit inače zna da nacrta prazan kadar).
- `applyUpdate` („Osvježi i ažuriraj"): ako se novi worker još instalira, čeka ga do 8 s pa šalje SKIP_WAITING; ranije bi
  brisanje keša ispod workera koji se instalira ostavilo novu verziju bez jezgra (app bez interneta ne bi krenuo do
  sljedeće verzije). Dugme za to vrijeme piše „Osvježavam…".
- Provjera: `scratchpad/harness_slike.mjs` (pravi kod SW-a i app-a nad lažnim serverom/kešom: zamjena male velikom,
  offline, aktivacija čuva keš slika, dopuna malih, čišćenje, loadAll bez precrtavanja); u pregledaču demo (gore) sa
  pravom storage adresom: prvi put 488 ms (velika umjesto male), iz keša 3 ms.

## Avans, odlazak i naplata (v1.19.0, Novica 25.10.2026)

Novica: depozit se nije računao kao uplaćen (nije ulazio ni u Finansije), boravak plaćen unaprijed ostajao je
„nenaplaćen", „Otišao" nije nudio naplatu, a ukucan depozit je nestajao (forma se zatvarala krstićem bez čuvanja).

- **Avans = uplata sa oznakom `av:1`** i datumom kad je primljen. Ulazi u Finansije tog dana, oduzima se od ukupnog.
  Polje „Avans" u formi pokazuje zbir; povećanje dodaje NOVU uplatu avansa današnjeg datuma, smanjenje skida najnovije,
  prazno briše sve (`sfUpisiAvans`). U SMS potvrdi piše „Avans" i ostatak.
- **Stari depozit** (`deposit`) se pri SVAKOM čitanju prebacuje u avans (`stayIzDepozita` - u DB_UNMAP, loadLocal,
  applySeed, cekaUcitaj): datum = dan upisa boravka; ne dodaje se ako je isti novac već među uplatama (dupli unos
  iz vremena kad se depozit nije brojao: uplate pokrivaju depozit, a depozit + uplate > cijena). Stara verzija app-a
  pri čuvanju briše oznaku `av` - uplata prije dana dolaska zato dobija oznaku nazad. **`stayIzDepozita` se zove iz
  `loadLocal()` prije nego što se učita ostatak skripte - NE smije koristiti `pad`/`isoFromDate` (TDZ = prazni podaci).**
- **Trajni upis u bazu:** `node scripts/migracija-avans.mjs` (pregled) / `--upisi` (rezervna kopija sa RLS + upis u jednoj
  transakciji). Koristi ISTU funkciju iz `app/index.html`. **IZVRŠENO 26.10.2026** (na Boškov zahtjev, dok je jedan
  telefon još bio na v1.18.0): 12 boravaka, 10 dobilo avans (1.169 € ušlo u Finansije po mjesecima upisa), Doga i
  Marta Mihičić samo izgubile duplikat; rezervna kopija `stays_rez_20261026` (RLS uključen). Kolona `deposit` je
  prazna; stara verzija bi mogla ponovo upisati depozit - app ga pri čitanju opet prebaci (isti iznos se ne duplira).
- **Jedan prozor naplate/odlaska** (`chargeStart` → `renderNaplata` → `naplataPotvrdi`; stanje `NM`): štrik „Otišao",
  „Naplati" u boravku, „Naplati X €" na Danas i u Nenaplaćenom. Ništa se ne upisuje prije potvrde. Obračun ukupno /
  avans / uplaćeno ranije / za naplatu; „Naplaćeno i otišao", „Otišao, plaća kasnije", a kad je sve plaćeno „Potvrdi
  odlazak". Manji iznos → izbor **Duguje** (ostaje u Nenaplaćenom) / **Popust** (cijena = primljeno). Prije dana odlaska
  izbor „Ostaje u pansionu / Odlazi danas". Uplata kojom se boravak zatvara nosi `z:1` - samo nju briše „poništi"
  naplatu (`sfZatvarajucaUplata`); zatvaranje bez nove uplate poništava samo oznaku. Prije upisa provjera da druga
  osoba nije u međuvremenu naplatila (`nmOtisk`). Prozor bez sheet-a/kartice ima svoj korak u istoriji (`NM.korak`).
- **Prijevremeni odlazak** ne skraćuje `to`: boravak se računa do `leftAt` (`stayKraj` u `stayNights`/`stayEstimate`),
  pa „poništi" odlazak vraća sve. Na Danas ispraćen i NAPLAĆEN nestaje (v1.19.1, Novica 26.10.); ostaje samo ispraćen
  koji duguje (`leftAt === danas`), prigušen, sa „Naplati X €".
- **Stari dugovi iz Excela** (bez cijene, bez uplate, stariji od 45 dana - `stayStariDug`) nemaju izmišljen iznos:
  u kartici vlasnika „nenaplaćeno", ne ulaze u „Duguje ukupno"; Nenaplaćeno ih drži u sklopljenom redu „Starije od 45 dana".

## Forma boravka, „nazad" i kartice (v1.19.0)

- **Upisan boravak = PREGLED** (`renderStayForm`, `edit`): kartica stanja (status + poništi, termin, boks, ljubimci,
  vlasnik), žute napomene (navike ljubimaca + napomena boravka), kartica novca sa dugmadima po stanju (Došao / Otišao /
  Naplati X € / Naplaćeno · poništi). Termin, Boks, Cijena i avans, Napomena su redovi koji se otvaraju dodirom (`SF.otv`).
  Traka „Odbaci / Sačuvaj izmjene" (`sheetFoot`, `sfSaveBar`) se pojavi tek kad je nešto dirano. Otišao/Naplati rade nad
  SAČUVANIM boravkom; sa diranom formom prvo pitaju (Sačuvaj pa nastavi / Odbaci pa nastavi). Novi boravak ostaje
  otvorena forma + spisak tekućih boravaka klijenta (da se produži postojeći umjesto duplog).
- **Dirano polje po polje** (`sfPolja`/`sfIzmjene`, `SF.base`): čuvanje upisuje SAMO dirana polja - avans/cijena koje je
  druga osoba upisala dok je forma bila otvorena ostaju. Upisi koji idu odmah (ljubimac na boravak, poništi naplatu)
  usklađuju bazu sa `sfBazaPolje`. Zatvaranje sa diranim poljima pita „Sačuvati izmjene?" i kaže šta je dirano.
- **„Nazad"** (`SHEET_STACK`, `sheetGurni`/`sheetNazad`/`sheetZatvoriSve`): boravak otvoren sa spiska (grupa, dan,
  Nenaplaćeno), iz drugog boravka ili iz kartice vlasnika/ljubimca vraća se tamo, na isto mjesto. Strelica „‹" u zaglavlju
  i sistemsko nazad = jedan nivo; krstić = sve (ali prvo vrati na niži boravak sa nesačuvanim izmjenama). Svaki nivo
  sheet-a ima tačno jedan korak u istoriji; kartica na dnu dijeli korak sa prvim nivoom. Bilo koji prozor preko sheet-a:
  nazad = Otkaži. Isti boravak se ne otvara dva puta. `POP_SKIP` može biti funkcija (izvrši se kad stigne popstate).
- **Kartica vlasnika = PRIKAZ** (kao kartica ljubimca od v1.17.0): Pozovi / Novi boravak gore, „Duguje ukupno", boravci
  kratko (`fmtRaspon`), „Izmijeni podatke" otvara polja + crnu listu + Obriši klijenta. Zatvaranje NIŠTA ne upisuje
  (ranije je svako zatvaranje tiho upisivalo polja); dirana izmjena pita „Odbaciti izmjene?". Dugmad „Gotovo" nema ni na
  jednoj kartici (krstić). Kartica ljubimca: „Novi boravak" (ljubimac već izabran), redovi i traka „U pansionu" otvaraju boravak.
- **Napomene** (navike ljubimca + napomena boravka) stoje kao žuti tekst u boravku. Znak „!" pored imena u spiskovima i na
  kružiću ljubimca je bio u v1.19.0 i UKLONJEN je u v1.19.1 (Novica se predomislio 26.10.). „poništi dolazak" u boravku
  OSTAJE (Novica ga je htio skloniti pa se predomislio) - radi samo na dan dolaska; za psa koji je stigao ranije ne mijenja ništa.
- **Danas:** brojčanik + tri pločice (ljubimaca, „slobodno N"), Dolaze / Odlaze / **Ostaju** (samo oni koji danas ne
  odlaze - ranije su se odlasci ponavljali u „U pansionu"; Odlaze + Ostaju = brojčanik). Desno u redu uvijek jedna stvar;
  „plaćeno" ide u red ispod imena. Poslije Došao poruka ima „Poništi". Dan iz kalendara ima isti redoslijed.
- Provjera: `scratchpad/v1.19.0-slike/` (slike toka), E2E (20 tokova + inventar funkcija) je bio u sesiji 25.10. -
  headless Playwright iz `~/tiramisu-upload/node_modules`; `harness_slike.mjs` usklađen (93/93).

## Predaja aplikacije - NE ZABORAVITI

- Vesna i Novica i dalje pune stari Excel. Na dan predaje se PITAJU šta žele sa istorijom, pa jedno od dva:
  - **Žele istoriju:** Boško daje svježi `CINDYLAND.xlsx` → regenerisati seed (`parse_excel.py`) i dopuniti bazu.
  - **Neće istoriju (čist start):** PRVO puna rezervna kopija baze (da se istorija može vratiti ako se predomisle), pa obrisati završene boravke prije dana predaje. Preporuka: klijente + ljubimce + crnu listu ZADRŽATI (imenik s telefonima vrijedi i bez istorije); aktivni boravci (ko je trenutno u pansionu) i rezervacije se NE diraju. Zarada tada kreće od nule.
