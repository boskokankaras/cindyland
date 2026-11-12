-- DNEVNIK IZMJENA (12.11.2026): ko je, kada i šta promijenio na boravku, klijentu, ljubimcu i boksu.
-- Povod: Maša je „izgubila" boks, a Moni i Bubi su ujutru stajali kao „u pansionu" - bez istorije se nije
-- moglo utvrditi ko je i kada to uradio.
-- Bilježi baza sama (okidač), za SVAKI upis sa bilo kog telefona i bilo koje verzije app-a - app se ne mijenja.
-- Tabela je zatvorena za app i internet (RLS + revoke); čita se samo skriptom: node scripts/istorija.mjs <ime>.
-- Pokretanje: node scripts/run-sql.mjs sql/istorija.sql (može više puta - sve je „if not exists"/„or replace").

create table if not exists public.istorija (
  id bigserial primary key,
  kada timestamptz not null default now(),
  ko uuid,                          -- auth.uid() naloga koji je upisao (null = skripta / baza)
  tabela text not null,
  red_id text not null,
  akcija text not null,             -- dodat / izmijenjen / obrisan
  staro jsonb,                      -- izmijenjen: samo promijenjena polja (stara vrijednost); obrisan: cio red
  novo jsonb                        -- izmijenjen: samo promijenjena polja (nova vrijednost); dodat: cio red
);
create index if not exists istorija_red on public.istorija (tabela, red_id, kada desc);
create index if not exists istorija_kada on public.istorija (kada desc);
alter table public.istorija enable row level security;
revoke all on public.istorija from anon, authenticated;
revoke all on sequence public.istorija_id_seq from anon, authenticated;

create or replace function public.istorija_upisi() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb; n jsonb; ko uuid; staro jsonb := '{}'; novo jsonb := '{}'; k text;
begin
  begin ko := auth.uid(); exception when others then ko := null; end;
  if tg_op = 'INSERT' then
    insert into public.istorija (ko, tabela, red_id, akcija, novo) values (ko, tg_table_name, new.id::text, 'dodat', to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.istorija (ko, tabela, red_id, akcija, staro) values (ko, tg_table_name, old.id::text, 'obrisan', to_jsonb(old));
    return old;
  end if;
  o := to_jsonb(old); n := to_jsonb(new);
  -- app pri svakom čuvanju šalje cio red: bilježe se samo polja koja su se stvarno promijenila
  for k in select jsonb_object_keys(n) loop
    if (o -> k) is distinct from (n -> k) then
      staro := staro || jsonb_build_object(k, o -> k);
      novo := novo || jsonb_build_object(k, n -> k);
    end if;
  end loop;
  if novo <> '{}'::jsonb then
    insert into public.istorija (ko, tabela, red_id, akcija, staro, novo) values (ko, tg_table_name, new.id::text, 'izmijenjen', staro, novo);
  end if;
  return new;
end $$;
revoke all on function public.istorija_upisi() from anon, authenticated, public;

do $$ declare t text; begin
  foreach t in array array['stays', 'clients', 'pets', 'boxes'] loop
    execute format('drop trigger if exists istorija on public.%I', t);
    execute format('create trigger istorija after insert or update or delete on public.%I for each row execute function public.istorija_upisi()', t);
  end loop;
end $$;
