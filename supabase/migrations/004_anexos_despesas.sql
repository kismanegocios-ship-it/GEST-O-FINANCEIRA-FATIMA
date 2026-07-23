-- Anexos (comprovantes) em Despesas via Supabase Storage
-- Rode este SQL no painel do Supabase: SQL Editor > New query > Run

-- 1. Colunas na tabela despesas (guardam o caminho e o nome do arquivo)
alter table despesas add column if not exists anexo_path text;
alter table despesas add column if not exists anexo_nome text;

-- 2. Bucket de comprovantes: publico para leitura, limite de 2 MB por arquivo
insert into storage.buckets (id, name, public, file_size_limit)
values ('comprovantes', 'comprovantes', true, 2097152)
on conflict (id) do update
  set public = true, file_size_limit = 2097152;

-- 3. Politicas de acesso ao bucket
drop policy if exists "comprovantes_select" on storage.objects;
drop policy if exists "comprovantes_insert" on storage.objects;
drop policy if exists "comprovantes_update" on storage.objects;
drop policy if exists "comprovantes_delete" on storage.objects;

create policy "comprovantes_select" on storage.objects
  for select using (bucket_id = 'comprovantes');
create policy "comprovantes_insert" on storage.objects
  for insert with check (bucket_id = 'comprovantes');
create policy "comprovantes_update" on storage.objects
  for update using (bucket_id = 'comprovantes');
create policy "comprovantes_delete" on storage.objects
  for delete using (bucket_id = 'comprovantes');
