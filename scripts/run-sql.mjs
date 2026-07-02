// Izvršava SQL fajl na Supabase bazi: node scripts/run-sql.mjs sql/setup.sql
// Čita .env u rootu projekta (SUPABASE_DB_HOST, SUPABASE_DB_USER, SUPABASE_DB_PASSWORD).
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
const file = process.argv[2];
if (!file){ console.error('Upotreba: node scripts/run-sql.mjs <fajl.sql>'); process.exit(1); }
const sql = readFileSync(join(root, file), 'utf8');

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
  await client.query(sql);
  console.log('OK:', file);
} finally {
  await client.end();
}
