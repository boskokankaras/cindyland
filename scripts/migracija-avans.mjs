// v1.19.0: stari „depozit" (stays.deposit) postaje AVANS = uplata { a, d, av: 1 } u stays.payments.
// Pravilo je ISTA funkcija kao u app-u (stayIzDepozita iz app/index.html), pa se app i baza ne mogu razići.
//   node scripts/migracija-avans.mjs            -> samo pokaže šta bi uradio (ništa ne upisuje)
//   node scripts/migracija-avans.mjs --upisi    -> rezervna kopija (sa RLS) + upis, u jednoj transakciji
// Pustiti TEK kad oba telefona pokazuju v1.19.0 (stara verzija bi avans pročitala kao običnu uplatu,
// a polje Depozit bi joj stajalo prazno - ponovni unos bi napravio dupli novac).
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
const html = readFileSync(join(root, 'app/index.html'), 'utf8');
const a = html.indexOf('function stayIzDepozita(st){');
const b = html.indexOf('\n}\n', a);
if (a < 0 || b < 0) throw new Error('stayIzDepozita nije nađena u app/index.html');
const stayIzDepozita = new Function(html.slice(a, b + 2) + '\nreturn stayIzDepozita;')();

const upisi = process.argv.includes('--upisi');
const c = new pg.Client({ host: env.SUPABASE_DB_HOST, port: 5432, user: env.SUPABASE_DB_USER,
  password: env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query(upisi ? 'begin' : 'begin read only');
  await c.query("set local lock_timeout = '5s'");
  const { rows } = await c.query(`select s.id, cl.name, to_char(s.from_date, 'YYYY-MM-DD') as from_date, s.price, s.deposit,
      s.payments, s.created_at from public.stays s left join public.clients cl on cl.id = s.client_id
    where coalesce(s.deposit, 0) > 0 order by s.from_date`);
  let zbir = 0;
  const izmjene = rows.map(r => {
    const st = { from: r.from_date, price: r.price == null ? null : Number(r.price), deposit: Number(r.deposit),
      payments: r.payments, createdAt: r.created_at ? new Date(r.created_at).toISOString() : null };
    stayIzDepozita(st);
    const prije = (r.payments || []).reduce((s, p) => s + (Number(p.a) || 0), 0);
    const poslije = (st.payments || []).reduce((s, p) => s + (Number(p.a) || 0), 0);
    zbir += poslije - prije;
    console.log(`${r.name.padEnd(22)} depozit ${String(r.deposit).padStart(5)}  ->  ${poslije - prije > 0 ? 'avans ' + (poslije - prije) + ' € ' + st.payments.find(p => p.av).d : 'samo brisanje (već je među uplatama)'}`);
    return { id: r.id, payments: st.payments, staro: r.deposit };
  });
  console.log(`\n${rows.length} boravaka sa depozitom; u Finansije ulazi ${zbir} €.`);
  if (upisi){
    const dan = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await c.query(`create table if not exists public.stays_rez_${dan} as select * from public.stays where coalesce(deposit, 0) > 0`);
    await c.query(`alter table public.stays_rez_${dan} enable row level security`);
    await c.query(`revoke all on public.stays_rez_${dan} from anon, authenticated`);
    for (const z of izmjene){
      const r = await c.query('update public.stays set payments = $1::jsonb, deposit = null where id = $2 and deposit = $3',
        [z.payments ? JSON.stringify(z.payments) : null, z.id, z.staro]);
      if (r.rowCount !== 1) throw new Error('Red ' + z.id + ' se u međuvremenu promijenio - ništa nije upisano.');
    }
    const ost = await c.query('select count(*)::int n from public.stays where coalesce(deposit, 0) > 0');
    if (ost.rows[0].n) throw new Error('Ostalo depozita: ' + ost.rows[0].n);
    await c.query('commit');
    console.log('UPISANO. Rezervna kopija: stays_rez_' + dan);
  } else {
    await c.query('rollback');
    console.log('(samo pregled - ništa nije upisano; za upis: --upisi)');
  }
} catch (e){
  await c.query('rollback').catch(() => {});
  throw e;
} finally { await c.end(); }
