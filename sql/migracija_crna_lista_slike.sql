-- Crna lista klijenata + slike ljubimaca (Supabase Storage)
alter table clients add column if not exists blacklist boolean not null default false;
alter table pets add column if not exists photo text;

-- javni bucket za slike ljubimaca (čitanje javno, upis samo prijavljeni)
insert into storage.buckets (id, name, public) values ('slike', 'slike', true)
on conflict (id) do nothing;

drop policy if exists slike_read on storage.objects;
create policy slike_read on storage.objects for select using (bucket_id = 'slike');
drop policy if exists slike_insert on storage.objects;
create policy slike_insert on storage.objects for insert to authenticated with check (bucket_id = 'slike');
drop policy if exists slike_update on storage.objects;
create policy slike_update on storage.objects for update to authenticated using (bucket_id = 'slike') with check (bucket_id = 'slike');
drop policy if exists slike_delete on storage.objects;
create policy slike_delete on storage.objects for delete to authenticated using (bucket_id = 'slike');

notify pgrst, 'reload schema';
