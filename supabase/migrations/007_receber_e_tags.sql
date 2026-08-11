-- Contas a Receber + Tags coloridas
-- Rode este SQL no painel do Supabase: SQL Editor > New query > Run without RLS

-- 1. Contas a Receber (espelho do Contas a Pagar, para entradas)
create table if not exists contas_receber (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  valor decimal(12,2) not null,
  data_vencimento date not null,            -- data prevista de recebimento
  data_recebimento date,                    -- quando de fato caiu
  status text default 'pendente' check (status in ('pendente','recebido','vencido','cancelado')),
  centro_custo_id uuid references centros_custo(id) on delete set null,
  categoria_id uuid references categorias(id) on delete set null,
  conta_bancaria_id uuid references contas_bancarias(id) on delete set null,
  observacoes text,
  empresa_id uuid references empresas(id) on delete cascade,
  created_at timestamptz default now()
);
create index if not exists idx_contas_receber_empresa on contas_receber(empresa_id);

-- Liga o lancamento de entrada gerado na baixa a conta a receber (para estorno)
alter table lancamentos add column if not exists conta_receber_id uuid references contas_receber(id) on delete set null;

-- 2. Tags coloridas (por empresa) + vinculo nas despesas via array de ids
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cor text default '#6366f1',
  empresa_id uuid references empresas(id) on delete cascade,
  created_at timestamptz default now()
);
create index if not exists idx_tags_empresa on tags(empresa_id);

alter table despesas add column if not exists tag_ids uuid[];
