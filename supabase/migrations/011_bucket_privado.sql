-- Seguranca: torna o bucket de comprovantes PRIVADO.
-- Antes ele era publico (qualquer um com o link via o comprovante).
-- Agora so quem esta logado (authenticated) le/grava, e o app usa
-- URLs assinadas (signed URLs) que expiram em 1 hora.
-- Rode no painel do Supabase: SQL Editor > New query > Run.

-- 1. Bucket deixa de ser publico
update storage.buckets set public = false where id = 'comprovantes';

-- 2. Politicas: acesso apenas para usuarios autenticados
drop policy if exists "comprovantes_select" on storage.objects;
drop policy if exists "comprovantes_insert" on storage.objects;
drop policy if exists "comprovantes_update" on storage.objects;
drop policy if exists "comprovantes_delete" on storage.objects;

create policy "comprovantes_select" on storage.objects
  for select to authenticated using (bucket_id = 'comprovantes');
create policy "comprovantes_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'comprovantes');
create policy "comprovantes_update" on storage.objects
  for update to authenticated using (bucket_id = 'comprovantes');
create policy "comprovantes_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'comprovantes');
