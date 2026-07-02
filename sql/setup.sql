-- Cindyland — šema baze (Supabase Postgres)
-- Pokreće se JEDNOM na novom projektu: node scripts/run-sql.mjs sql/setup.sql

create table if not exists clients (
  id text primary key,
  name text not null,
  phone text not null default '',
  note text not null default ''
);

create table if not exists pets (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  name text not null default '',
  species text not null default 'pas',      -- 'pas' | 'macka'
  size text,                                 -- 'mali' | 'veliki' (za pse)
  sex text,                                  -- 'muzjak' | 'zenka' | null
  breed text not null default '',
  note text not null default ''
);

create table if not exists stays (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  pet_ids text[] not null default '{}',
  type text not null default 'pansion',      -- 'pansion' | 'dnevni'
  from_date date not null,
  to_date date not null,
  box_id text,
  price numeric,
  paid boolean not null default false,
  paid_at date,
  note text not null default '',
  created_at timestamptz default now()
);
create index if not exists stays_dates on stays (from_date, to_date);
create index if not exists stays_client on stays (client_id);

create table if not exists boxes (
  id text primary key,
  name text not null,
  grp text not null,                         -- 'mb' | 'vb' | 'm'
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists settings (
  key text primary key,
  value jsonb
);

-- Prava: sve vide i mijenjaju SAMO prijavljeni (Vesna i Novica; naloge pravi Boško u dashboardu).
alter table clients enable row level security;
alter table pets enable row level security;
alter table stays enable row level security;
alter table boxes enable row level security;
alter table settings enable row level security;

drop policy if exists cindy_clients on clients;
create policy cindy_clients on clients for all to authenticated using (true) with check (true);
drop policy if exists cindy_pets on pets;
create policy cindy_pets on pets for all to authenticated using (true) with check (true);
drop policy if exists cindy_stays on stays;
create policy cindy_stays on stays for all to authenticated using (true) with check (true);
drop policy if exists cindy_boxes on boxes;
create policy cindy_boxes on boxes for all to authenticated using (true) with check (true);
drop policy if exists cindy_settings on settings;
create policy cindy_settings on settings for all to authenticated using (true) with check (true);

-- Realtime: obje strane vide izmjene uživo.
do $$
begin
  begin
    alter publication supabase_realtime add table clients, pets, stays, boxes, settings;
  exception when duplicate_object then null;
  end;
end $$;

notify pgrst, 'reload schema';
