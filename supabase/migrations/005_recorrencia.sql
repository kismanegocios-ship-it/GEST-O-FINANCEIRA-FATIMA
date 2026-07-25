-- Provisionamento de contas recorrentes
-- Rode este SQL no painel do Supabase: SQL Editor > New query > Run

-- Liga cada ocorrencia gerada a conta "modelo" (a que tem recorrente = true).
-- on delete set null: se a conta modelo for excluida, as ocorrencias ja
-- geradas continuam existindo (apenas param de gerar novas no futuro).
alter table despesas
  add column if not exists recorrencia_id uuid references despesas(id) on delete set null;

create index if not exists idx_despesas_recorrencia on despesas(recorrencia_id);
