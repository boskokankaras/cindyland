// Uvozi istoriju iz seed/seed.json u Supabase bazu (jednokratno, idempotentno).
// Pokretanje: node scripts/import-seed.mjs
// Prije toga: sql/setup.sql mora biti izvršen; .env mora imati DB pristup.
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
const seed = JSON.parse(readFileSync(join(root, 'seed/seed.json'), 'utf8'));

// boksovi: podrazumijevani + improvizovana mjesta iz istorije (neaktivna)
const boxes = [];
let s = 0;
for (let i = 1; i <= 13; i++) boxes.push({ id: 'mb' + i, name: 'Boks ' + i, grp: 'mb', active: true, sort: s++ });
boxes.push({ id: 'kot1', name: 'Kotilica', grp: 'mb', active: true, sort: s++ });
boxes.push({ id: 'kot2', name: 'Kotilica 2', grp: 'mb', active: true, sort: s++ });
for (const i of [1, 2, 4, 5, 6, 7]) boxes.push({ id: 'vb' + i, name: 'Boks ' + i, grp: 'vb', active: true, sort: s++ });
for (let i = 1; i <= 5; i++) boxes.push({ id: 'm' + i, name: 'Boks ' + i, grp: 'm', active: true, sort: s++ });
for (const b of seed.adhocBoxes || []) boxes.push({ id: b.id, name: b.name, grp: b.group, active: false, sort: s++ });

const client = new pg.Client({
  host: env.SUPABASE_DB_HOST,
  port: 5432,
  user: env.SUPABASE_DB_USER,
  password: env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query('begin');
  await client.query('truncate stays, pets, clients cascade');
  await client.query('truncate boxes');

  for (const b of boxes){
    await client.query('insert into boxes (id, name, grp, active, sort) values ($1,$2,$3,$4,$5)',
      [b.id, b.name, b.grp, b.active, b.sort]);
  }
  await client.query(`insert into settings (key, value) values ('prices', $1)
    on conflict (key) do update set value = excluded.value`,
    [JSON.stringify({ mali: 12, veliki: 15, macka: 10, dnevni: 10 })]);

  for (const c of seed.clients){
    await client.query('insert into clients (id, name, phone, note) values ($1,$2,$3,$4)',
      [c.id, c.name, c.phone || '', c.note || '']);
  }
  for (const p of seed.pets){
    await client.query('insert into pets (id, client_id, name, species, size, sex, breed, note) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [p.id, p.clientId, p.name, p.species, p.size, p.sex, p.breed || '', p.note || '']);
  }
  let n = 0;
  for (const st of seed.stays){
    await client.query(`insert into stays (id, client_id, pet_ids, type, from_date, to_date, box_id, price, paid, paid_at, note)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [st.id, st.clientId, st.petIds, st.type, st.from, st.to, st.boxId, st.price, st.paid, st.paidAt, st.note || '']);
    n++;
  }
  await client.query('commit');
  const chk = await client.query('select (select count(*) from clients) c, (select count(*) from pets) p, (select count(*) from stays) s, (select coalesce(sum(price),0) from stays where paid) total');
  console.log('Uvezeno:', chk.rows[0]);
} catch (e){
  await client.query('rollback');
  throw e;
} finally {
  await client.end();
}
