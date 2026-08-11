-- Seguranca: ativa Row Level Security (RLS) em todas as tabelas do app,
-- liberando acesso apenas para usuarios autenticados (o app exige login).
-- Rode no painel do Supabase: SQL Editor > New query > Run.
--
-- Depois disso, a chave anon publica deixa de dar acesso aos dados: so
-- quem esta logado (sessao authenticated) le/grava. O app continua igual.
--
-- OBS: a rota publica /api/calendario/ics (assinar por URL no Google Agenda)
-- passa a exigir SUPABASE_SERVICE_ROLE_KEY configurada no Vercel; sem ela,
-- essa URL retorna calendario vazio. O download .ics dentro do app (logado)
-- continua funcionando normalmente.

do $$
declare t text;
begin
  foreach t in array array[
    'empresas','categorias','centros_custo','despesas','lancamentos',
    'extrato_manual','contas_bancarias','contas_receber','tags'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "auth_all_%s" on %I;', t, t);
    execute format('create policy "auth_all_%s" on %I for all to authenticated using (true) with check (true);', t, t);
  end loop;
end $$;
