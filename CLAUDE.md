# Cindyland - kontekst projekta za Claude Code

PWA za evidenciju pansiona za pse i mačke. Korisnici: **Vesna i Novica** (vlasnici pansiona, Boškovi prijatelji) - po jedan nalog svako, sve dijele. Boško (vlasnik repoa) nije programer: srpski (latinica, ijekavica), bez žargona; sve tehničko radi Claude.

**PRAVILO (veće stvari):** prije isporuke ocijeni sam sebe 0-10 i revidiraj do min 9/10.

## Arhitektura

- **Bez builda**: `app/index.html` je cijela aplikacija (HTML+CSS+JS u jednom fajlu, vanilla). `app/` je JEDINI deploy folder.
- `app/config.js` - Supabase URL + anon ključ (`window.CINDY`). **Prazan config = lokalni probni režim** (localStorage + demo istorija iz `seed/seed.json`). Sa ključevima = prava app: prijava + baza + realtime.
- `app/supabase.js` - lokalna kopija supabase-js v2 UMD (bez CDN-a, radi offline).
- Podaci u bazi: `clients`, `pets`, `stays` (boravci; `pet_ids text[]`), `boxes`, `settings` (ključ `prices`). RLS: sve samo `authenticated`. Realtime na svim tabelama → app radi `loadAll()` refetch (debounce 600ms).
- **PRAVILO: svaka nova tabela u `public` šemi mora ODMAH dobiti RLS** - i privremene rezervne kopije. Anon ključ je javan (stoji u `app/config.js` na sajtu), pa tabela bez RLS-a znači da je svako sa interneta može čitati I brisati. Naučeno 4.8.2026: `stays_rez_20260730` (kopija s migracije 30.7.) stajala je 5 dana otvorena; Supabase je poslao "security vulnerabilities" mejl. Recept: `alter table public.X enable row level security;` + `revoke all on public.X from anon, authenticated;` (za pomoćne tabele koje app ne dira), ili politika za `authenticated` (za tabele koje app koristi).
- Mutacije: optimistički u `D` + `dbSave`/`dbKill` (upsert/delete po `id`); id-jevi su tekstualni (`uid()` / `c123`/`p123`/`s123` iz seed-a).
- Boksovi: grupe `mb` (Mali boksevi: Boks 1-13, Kotilica, Kotilica 2), `vb` (Veliki boksevi: Boks 1,2,4,5,6,7 - VB 3 ne postoji fizički), `m` (Mačke: Boks 1-5) + improvizovana mjesta iz istorije (kavezi, Kuća - `active:false`).

## Verzioniranje / PWA update (ista logika kao K-Sport Hub)

- **Na SVAKOM deployu podigni verziju na TRI mjesta:** `APP_VERSION` u `app/index.html`, `CACHE` u `app/sw.js` i `app/version.json` (semver `vX.Y.Z`). Promjena sw.js je signal browseru da postoji update.
- **Brza provjera (od v1.5.0):** `app/version.json` se ne kešira (`app/_headers`) - app ga pročita za desetinku sekunde i odmah zna da li ima novija verzija, bez čekanja da se worker instalira. „Osvježi i ažuriraj" preuzme workera na čekanju, a ako ga nema - obriše keš i učita iznova. Service worker precache-uje samo jezgro (index/config/supabase/manifest), ikone ulaze u kesh usput - zato je instalacija brza.
- Ponašanje: prompt (ništa se ne mijenja tiho) - tačkica na tabu Podešavanja + kutija „Nova verzija je spremna" + „Osvježi i ažuriraj" (SKIP_WAITING → controllerchange → reload, fallback 3s). Tiha provjera na povratak u app (visibilitychange/focus, throttle 60s) + na ~30 min + ručno dugme.
- `PWA.hadController` čuva da li je stranica bila kontrolisana pri učitavanju - bez toga bi prva instalacija lažno prijavila update (SW radi `clients.claim()`).

## Komande

```bash
npm install                                # prvi put (samo za skripte baze)
node scripts/run-sql.mjs sql/setup.sql     # šema baze (jednom po projektu)
node scripts/import-seed.mjs               # uvoz istorije iz seed/seed.json (truncate + insert)
python3 scripts/parse_excel.py "<CINDYLAND.xlsx>"   # regeneriši seed iz Excela
npx netlify deploy --prod --dir app        # objava (site se veže uz `netlify link` / sites:create)
```

- Lokalni pregled: server servira ROOT projekta (root `index.html` preusmjerava na `app/`), jer app u lokalnom režimu vuče `../seed/seed.json` za demo. **`seed/` NIKAD ne smije u deploy** (podaci klijenata) - zato je deploy `--dir app`.
- `.env` (van gita): `SUPABASE_DB_HOST=aws-0-eu-west-1.pooler.supabase.com` (pooler za eu-west-1, NE direktni db host - IPv6), `SUPABASE_DB_USER=postgres.<ref>`, `SUPABASE_DB_PASSWORD=...`. **PAŽNJA: na ovom računaru .env NE POSTOJI** (šifra baze nije ovdje sačuvana). Izmjene šeme: ili Boško nalijepi SQL u Supabase SQL editor (https://supabase.com/dashboard/project/ggcvkeltmarcxlmaczmf/sql/new - tako je rađena migracija depozita), ili Boško resetuje DB šifru (Settings - Database) pa je upisati u .env. Trebaće za dan predaje (istorija)!

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
- `stayBoxes(st)` normalizuje periode (kliješti ih na termin boravka, siječe preklapanja, prvi počinje sa dolaskom a posljednji traje do odlaska). `stayBoxesLive(st)` je isto to ali skraćeno na `left_at` - koristi ga SVAKO računanje zauzetosti (kalendar, slobodni boksevi, kapacitet), dok prikaz reda koristi `stayBoxes`.
- **Boks NIJE obavezan** (može se upisati kasnije). Popunjen kapacitet nije zabrana nego pitanje „X od Y dana je preko kapaciteta - Upiši / Odustani" (`sfCapacityAsk`).
- **`stays.payments` (jsonb)** = niz naplata `[{"a":300,"d":"2025-11-09"}, …]`. Dug boravak može biti plaćen u više navrata a Zarada po mjesecima ostaje tačna (svaka naplata nosi svoj datum). Zarada čita `allPayments()`, ne `price`.
- **`stays.arrived_at` / `left_at`** = štrik „Došao"/„Otišao" u Danas. Brojčanik i zauzetost boksa gledaju `stayHere()`; za ranije dane se podrazumijeva da je stigao/otišao (stara evidencija nema štrikove). Naplata na dan odlaska sama upisuje `left_at`; naplata usred boravka nudi „Samo naplata, ostaje u pansionu".
- **Cijena se računa po NOĆENJIMA** (`stayNights` = `diffDays(from,to)`): 25.-31. = 6 noćenja, dan odlaska se ne naplaćuje. Dolazak i odlazak istog dana = cijena dnevnog čuvanja. Pragovi 10+ i mjesečno se gledaju po noćenjima.
- **Pravi boks vs kavez** (`boxSpare(b)` = ime sadrži „kavez"/„transport"): Vesni i Novici broj boksa NE znači ništa, jedino im je bitno kad se pravi boksevi popune jer tada sljedeći ide u transporter. Zato: `autoBoxPlan()` sam složi raspored za cijeli termin (najduži niz slobodnih dana, pravi boks ima prednost, kavez samo za dane kad pravog nema), forma nudi „Prijedlog rasporeda" sa hronologijom i rupama („nema mjesta"), a `sfLoadDays()` daje dva nivoa upozorenja: `kavezi` (pravi puni) i `puni` (nema baš ničeg). Padajući meni ima samo tri stanja: prazno / „slobodan do X" / „zauzet" / „djelimično slobodan".
- Grupe po ljubimcu (`sfRelevantGroups`/`pdGroups`, STROGO od v1.8.2 na zahtjev Vesne i Novice): **mali pas SAMO mali boksevi, veliki pas SAMO veliki, mačka SAMO mačji** - vrste se ne miješaju ni u ponudi ni u „Provjeri datume". (Ranije je mali pas mogao i u veliki boks - NE vraćati bez njihove riječi.)
- Svuda se broje LJUBIMCI, ne boravci (dva psa u jednom boksu = 2) - brojčanik i brojevi uz naslove na Danas moraju da se slažu. `stayPets()` broji samo ljubimce koji POSTOJE u imeniku (u starim zapisima zna ostati obrisani ljubimac).
- Migracija 30.7.2026: rezervna kopija `stays_rez_20260730`, pa spojeni svi lanci (134 komada, 1528 → 1394 boravka). **Dnevna čuvanja se NIKAD ne spajaju** (dva dana = dva čuvanja) - jedan takav slučaj je vraćen nazad. Kontrola: zbir svih naplata prije i poslije = 102.264 € (isto do centa), i po svakom mjesecu isto. Naknadno ispravljeno: `paid` prati POSLJEDNJI komad (naplata na dan odlaska zatvara boravak) - 58 boravaka je pogrešno stajalo kao nenaplaćeno; i očišćeni nepostojeći ljubimci iz `pet_ids` (2 zapisa).

## Naplata i depozit (od v1.2.0)

- `stays.deposit` (numeric, null = bez depozita) - upisuje se pri rezervaciji, **ulazi u cijenu**: modal naplate predlaže `cijena - depozit`, a po potvrdi se u `price` upiše ukupno (`depozit + naplaćeno`); Zarada tako ostaje tačna. Migracija: `sql/migracija_depozit.sql` (izvršena na živoj bazi 8.7.2026, prije deploya v1.2.0).
- Naplata ide iz forme boravka (veliko zeleno „Naplati" na dnu; naplaćen boravak ima red „Naplaćeno · datum" + „Poništi"). U listama Danas nema dugmadi ni pilula - klik na red otvara boravak. „Naplati" prije dana odlaska (st.to ≠ danas) prvo pita „X danas ne napušta pansion…" (Ne/Da).
- Zum aplikacije blokiran (viewport `maximum-scale=1` + `touch-action:pan-x pan-y` na `*`) - zbog fiksnih zaglavlja u tabeli Boksevi (sticky datumi lijevo + boksevi gore, skroluje se samo sadržaj).

## Predaja aplikacije - NE ZABORAVITI

- Vesna i Novica i dalje pune stari Excel. Na dan predaje se PITAJU šta žele sa istorijom, pa jedno od dva:
  - **Žele istoriju:** Boško daje svježi `CINDYLAND.xlsx` → regenerisati seed (`parse_excel.py`) i dopuniti bazu.
  - **Neće istoriju (čist start):** PRVO puna rezervna kopija baze (da se istorija može vratiti ako se predomisle), pa obrisati završene boravke prije dana predaje. Preporuka: klijente + ljubimce + crnu listu ZADRŽATI (imenik s telefonima vrijedi i bez istorije); aktivni boravci (ko je trenutno u pansionu) i rezervacije se NE diraju. Zarada tada kreće od nule.
