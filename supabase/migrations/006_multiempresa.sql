-- Multiempresa (multi-tenant)
-- Rode este SQL no painel do Supabase: SQL Editor > New query > Run

-- 1. Tabela de empresas
create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean default true,
  created_at timestamptz default now()
);

-- 2. Empresa padrao para carimbar os dados que ja existem (renomeie depois na tela)
insert into empresas (nome)
select 'Empresa Principal'
where not exists (select 1 from empresas);

-- 3. Coluna empresa_id em cada tabela de dados
alter table despesas         add column if not exists empresa_id uuid references empresas(id) on delete cascade;
alter table lancamentos      add column if not exists empresa_id uuid references empresas(id) on delete cascade;
alter table categorias       add column if not exists empresa_id uuid references empresas(id) on delete cascade;
alter table centros_custo    add column if not exists empresa_id uuid references empresas(id) on delete cascade;
alter table contas_bancarias add column if not exists empresa_id uuid references empresas(id) on delete cascade;
alter table extrato_manual   add column if not exists empresa_id uuid references empresas(id) on delete cascade;

-- 4. Carimba os dados existentes na empresa padrao (a mais antiga)
update despesas         set empresa_id = (select id from empresas order by created_at limit 1) where empresa_id is null;
update lancamentos      set empresa_id = (select id from empresas order by created_at limit 1) where empresa_id is null;
update categorias       set empresa_id = (select id from empresas order by created_at limit 1) where empresa_id is null;
update centros_custo    set empresa_id = (select id from empresas order by created_at limit 1) where empresa_id is null;
update contas_bancarias set empresa_id = (select id from empresas order by created_at limit 1) where empresa_id is null;
update extrato_manual   set empresa_id = (select id from empresas order by created_at limit 1) where empresa_id is null;

-- 5. Indices
create index if not exists idx_despesas_empresa    on despesas(empresa_id);
create index if not exists idx_lancamentos_empresa on lancamentos(empresa_id);
create index if not exists idx_categorias_empresa  on categorias(empresa_id);
create index if not exists idx_centros_empresa     on centros_custo(empresa_id);
create index if not exists idx_contas_empresa      on contas_bancarias(empresa_id);
create index if not exists idx_extrato_empresa     on extrato_manual(empresa_id);
