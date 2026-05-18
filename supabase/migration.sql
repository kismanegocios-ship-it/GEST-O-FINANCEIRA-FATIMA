-- =============================================
-- SISTEMA FINANCEIRO FÁTIMA - MIGRATION
-- Rodar no Supabase SQL Editor
-- =============================================

-- Centros de Custo
create table if not exists centros_custo (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  cor text default '#6366f1',
  ativo boolean default true,
  created_at timestamptz default now()
);

-- Categorias
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('entrada', 'saida')),
  cor text default '#6366f1',
  icone text default 'tag',
  created_at timestamptz default now()
);

-- Despesas (pré-cadastro de contas a pagar)
create table if not exists despesas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  valor decimal(12,2) not null,
  data_vencimento date not null,
  data_pagamento date,
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'vencido', 'cancelado')),
  centro_custo_id uuid references centros_custo(id) on delete set null,
  categoria_id uuid references categorias(id) on delete set null,
  recorrente boolean default false,
  frequencia text check (frequencia in ('mensal', 'quinzenal', 'semanal', 'anual')),
  observacoes text,
  created_at timestamptz default now()
);

-- Lançamentos (entradas e saídas de caixa)
create table if not exists lancamentos (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  valor decimal(12,2) not null,
  tipo text not null check (tipo in ('entrada', 'saida')),
  data date not null,
  despesa_id uuid references despesas(id) on delete set null,
  centro_custo_id uuid references centros_custo(id) on delete set null,
  categoria_id uuid references categorias(id) on delete set null,
  conciliado boolean default false,
  forma_pagamento text default 'dinheiro' check (forma_pagamento in ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'transferencia', 'boleto')),
  observacoes text,
  created_at timestamptz default now()
);

-- Extrato Manual (importação de extrato bancário)
create table if not exists extrato_manual (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  valor decimal(12,2) not null,
  data date not null,
  tipo text not null check (tipo in ('credito', 'debito')),
  conciliado boolean default false,
  lancamento_id uuid references lancamentos(id) on delete set null,
  observacoes text,
  created_at timestamptz default now()
);

-- Dados iniciais - Categorias de entrada
insert into categorias (nome, tipo, cor, icone) values
  ('Vendas', 'entrada', '#22c55e', 'shopping-cart'),
  ('Serviços', 'entrada', '#3b82f6', 'briefcase'),
  ('Investimentos', 'entrada', '#8b5cf6', 'trending-up'),
  ('Outros Recebimentos', 'entrada', '#06b6d4', 'plus-circle')
on conflict do nothing;

-- Dados iniciais - Categorias de saída
insert into categorias (nome, tipo, cor, icone) values
  ('Aluguel', 'saida', '#ef4444', 'home'),
  ('Água/Luz/Internet', 'saida', '#f97316', 'zap'),
  ('Fornecedores', 'saida', '#eab308', 'truck'),
  ('Salários', 'saida', '#ec4899', 'users'),
  ('Marketing', 'saida', '#14b8a6', 'megaphone'),
  ('Impostos', 'saida', '#6b7280', 'file-text'),
  ('Manutenção', 'saida', '#84cc16', 'tool'),
  ('Outros Gastos', 'saida', '#f43f5e', 'minus-circle')
on conflict do nothing;

-- Dados iniciais - Centro de custo padrão
insert into centros_custo (nome, descricao, cor) values
  ('Geral', 'Centro de custo geral', '#6366f1'),
  ('Administrativo', 'Despesas administrativas', '#3b82f6'),
  ('Operacional', 'Despesas operacionais', '#22c55e')
on conflict do nothing;

-- Enable RLS (Row Level Security) - desabilitado para simplicidade
alter table centros_custo disable row level security;
alter table categorias disable row level security;
alter table despesas disable row level security;
alter table lancamentos disable row level security;
alter table extrato_manual disable row level security;
