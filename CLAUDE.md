# Cindyland — kontekst projekta za Claude Code

PWA za evidenciju pansiona za pse i mačke. Korisnici: **Vesna i Novica** (vlasnici pansiona, Boškovi prijatelji) — po jedan nalog svako, sve dijele. Boško (vlasnik repoa) nije programer: srpski (latinica, ijekavica), bez žargona; sve tehničko radi Claude.

**PRAVILO (veće stvari):** prije isporuke ocijeni sam sebe 0–10 i revidiraj do min 9/10.

## Arhitektura

- **Bez builda**: `app/index.html` je cijela aplikacija (HTML+CSS+JS u jednom fajlu, vanilla). `app/` je JEDINI deploy folder.
- `app/config.js` — Supabase URL + anon ključ (`window.CINDY`). **Prazan config = lokalni probni režim** (localStorage + demo istorija iz `seed/seed.json`). Sa ključevima = prava app: prijava + baza + realtime.
- `app/supabase.js` — lokalna kopija supabase-js v2 UMD (bez CDN-a, radi offline).
- Podaci u bazi: `clients`, `pets`, `stays` (boravci; `pet_ids text[]`, `box_id`), `boxes`, `settings` (ključ `prices`). RLS: sve samo `authenticated`. Realtime na svim tabelama → app radi `loadAll()` refetch (debounce 600ms).
- Mutacije: optimistički u `D` + `dbSave`/`dbKill` (upsert/delete po `id`); id-jevi su tekstualni (`uid()` / `c123`/`p123`/`s123` iz seed-a).
- Boksovi: grupe `mb` (Mali boksevi: Boks 1–13, Kotilica, Kotilica 2), `vb` (Veliki boksevi: Boks 1,2,4,5,6,7 — VB 3 ne postoji fizički), `m` (Mačke: Boks 1–5) + improvizovana mjesta iz istorije (kavezi, Kuća — `active:false`).

## Verzioniranje / PWA update (ista logika kao K-Sport Hub)

- **Na SVAKOM deployu podigni verziju na OBA mjesta:** `APP_VERSION` u `app/index.html` + `CACHE` u `app/sw.js` (semver `vX.Y.Z`). Promjena sw.js je signal browseru da postoji update.
- Ponašanje: prompt (ništa se ne mijenja tiho) — tačkica na tabu Podešavanja + kutija „Nova verzija je spremna" + „Osvježi i ažuriraj" (SKIP_WAITING → controllerchange → reload, fallback 3s). Tiha provjera na povratak u app (visibilitychange/focus, throttle 60s) + na ~30 min + ručno dugme.
- `PWA.hadController` čuva da li je stranica bila kontrolisana pri učitavanju — bez toga bi prva instalacija lažno prijavila update (SW radi `clients.claim()`).

## Komande

```bash
npm install                                # prvi put (samo za skripte baze)
node scripts/run-sql.mjs sql/setup.sql     # šema baze (jednom po projektu)
node scripts/import-seed.mjs               # uvoz istorije iz seed/seed.json (truncate + insert)
python3 scripts/parse_excel.py "<CINDYLAND.xlsx>"   # regeneriši seed iz Excela
npx netlify deploy --prod --dir app        # objava (site se veže uz `netlify link` / sites:create)
```

- Lokalni pregled: server servira ROOT projekta (root `index.html` preusmjerava na `app/`), jer app u lokalnom režimu vuče `../seed/seed.json` za demo. **`seed/` NIKAD ne smije u deploy** (podaci klijenata) — zato je deploy `--dir app`.
- `.env` (van gita): `SUPABASE_DB_HOST=aws-0-eu-west-1.pooler.supabase.com` (pooler za eu-west-1, NE direktni db host — IPv6), `SUPABASE_DB_USER=postgres.<ref>`, `SUPABASE_DB_PASSWORD=...`.

## Istorija iz Excela (seed)

- Izvor: `CINDYLAND.xlsx` (27 mjesečnih sheetova, jun 2024 – avg 2026; blokovi MB/VB/M po sheetu, imena po danima, cijena sa € na dan odlaska).
- Parser `scripts/parse_excel.py`: spaja uzastopne dane u boravke, spaja preko granice mjeseca, „Preuzimanje" ćelija zatvara boravak, cjenovna ćelija dijeli boravak na naplatne segmente (stalni gosti plaćaju mjesečno — Xenny 300€/mj, Kan karting 330€/mj), najava cijene na prvi dan se ne duplira. Rezultat: ~1.430 boravaka, ~850 klijenata, ~93.000 € naplaćeno.
- **Granica tačnosti:** njene ručne mjesečne sume su često veće od zbira € u tabeli — dio naplata je vodila van tabele. Istorija u app-u = ono što je upisano u tabelu. Klijent = ime iz ćelije (nekad pas, nekad vlasnik, nekad oboje — tako je vodila).

## Produkcija (LIVE od 2.7.2026)

- **Live: https://cindyland.netlify.app** (Netlify site id `54a5dee4-62ca-4925-bb81-d735ec41b441`; deploy: `npx netlify deploy --prod --dir app --site 54a5dee4-...`). Repo: `https://github.com/boskokankaras/cindyland` (privatan; pull prije rada, push poslije).
- Supabase projekat `ggcvkeltmarcxlmaczmf`, **region eu-west-1 (Irska!)** — pooler host je `aws-0-eu-west-1.pooler.supabase.com` (NE eu-central kao K-Sport). URL `https://ggcvkeltmarcxlmaczmf.supabase.co`; anon ključ u `app/config.js`; DB šifra u `.env`.
- Šema + istorija uvezeni (850 klijenata / 855 ljubimaca / 1.432 boravka / 93.323 € naplaćeno) — `setup.sql` + `import-seed.mjs` izvršeni i provjereni kroz REST.
- Nalozi (kreirani direktno u `auth.users`+`auth.identities` SQL-om, prijava testirana): Vesna `vmitrovic1989@gmail.com` / `Vesna2026`, Novica `nolje.mne@gmail.com` / `Novica2026`. Novi nalog/promjena šifre: Supabase dashboard ili SQL recept iz sesije 2.7.
- **PostgREST vraća max 1000 redova po upitu** — `loadAll()` čita u serijama (`fetchAll` sa `.range()`); ne vraćati na obični `select('*')`.
- Na svakom sljedećem deployu: bump `APP_VERSION` + `CACHE` (korisnici dobiju „Nova verzija je spremna").
