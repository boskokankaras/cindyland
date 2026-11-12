// Istorija izmjena iz dnevnika (sql/istorija.sql): ko je, kada i šta promijenio.
//   node scripts/istorija.mjs Maša            -> sve izmjene boravaka tog ljubimca / klijenta (ime, dio imena)
//   node scripts/istorija.mjs Maša 3          -> samo zadnja 3 dana
//   node scripts/istorija.mjs --sve 1         -> sve izmjene zadnjeg dana
// Samo čita (transakcija read only). Vremena su po Podgorici.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')){
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const [upit, dana] = [process.argv[2], Number(process.argv[3]) || 30];
if (!upit){ console.error('Upotreba: node scripts/istorija.mjs <ime ljubimca ili klijenta | --sve> [dana]'); process.exit(1); }

const c = new pg.Client({ host: env.SUPABASE_DB_HOST, port: 5432, user: env.SUPABASE_DB_USER,
  password: env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query('begin read only');
  const sve = upit === '--sve';
  /* boravci / ljubimci / klijenti čije ime (ljubimca ili klijenta) sadrži upit - i obrisani (iz samog dnevnika) */
  const { rows } = await c.query(`
    with trazeni as (
      select s.id from stays s join clients cl on cl.id = s.client_id
        where cl.name ilike $1 or exists (select 1 from pets p where p.id = any(s.pet_ids) and p.name ilike $1)
      union select p.id from pets p where p.name ilike $1
      union select cl.id from clients cl where cl.name ilike $1
      union select i.red_id from istorija i where i.akcija = 'obrisan' and (i.staro->>'name' ilike $1)
    )
    select to_char(i.kada at time zone 'Europe/Podgorica', 'DD.MM. HH24:MI:SS') kada, coalesce(u.email, 'baza/skripta') ko,
      i.tabela, i.red_id, i.akcija, i.staro, i.novo
    from istorija i left join auth.users u on u.id = i.ko
    where i.kada > now() - make_interval(days => $2) and ($3 or i.red_id in (select id from trazeni))
    order by i.kada`, ['%' + (sve ? '' : upit) + '%', dana, sve]);
  if (!rows.length) console.log('Nema izmjena u zadnjih ' + dana + ' dana.');
  const kratko = v => v == null ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  for (const r of rows){
    const ko = r.ko.replace(/@.*/, '');
    if (r.akcija === 'izmijenjen'){
      const polja = Object.keys(r.novo || {}).map(k => `${k}: ${kratko(r.staro[k])} -> ${kratko(r.novo[k])}`);
      console.log(`${r.kada}  ${ko.padEnd(16)} ${r.tabela} ${r.red_id} izmijenjen\n    ${polja.join('\n    ')}`);
    } else {
      console.log(`${r.kada}  ${ko.padEnd(16)} ${r.tabela} ${r.red_id} ${r.akcija}  ${kratko(r.akcija === 'obrisan' ? r.staro : r.novo).slice(0, 300)}`);
    }
  }
  await c.query('rollback');
} finally { await c.end(); }
