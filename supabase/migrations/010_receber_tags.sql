-- Tags em Contas a Receber (mesmo esquema do Contas a Pagar)
-- Rode no painel do Supabase: SQL Editor > New query > Run

alter table contas_receber add column if not exists tag_ids uuid[];
