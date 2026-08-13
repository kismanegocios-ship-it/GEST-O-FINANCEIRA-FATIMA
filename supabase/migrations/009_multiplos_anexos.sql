-- Multiplos anexos em Contas a Pagar e Contas a Receber
-- Rode no painel do Supabase: SQL Editor > New query > Run

-- Coluna anexos: array JSON de { path, nome }
alter table despesas       add column if not exists anexos jsonb default '[]'::jsonb;
alter table contas_receber add column if not exists anexos jsonb default '[]'::jsonb;

-- Migra o anexo unico que ja existe (anexo_path/anexo_nome) para o array
update despesas
set anexos = jsonb_build_array(jsonb_build_object('path', anexo_path, 'nome', coalesce(anexo_nome, 'comprovante')))
where anexo_path is not null
  and (anexos is null or anexos = '[]'::jsonb);
