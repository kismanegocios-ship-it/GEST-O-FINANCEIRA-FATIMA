-- =============================================
-- CONFIGURAR USUARIO DE ACESSO
-- Rode no Supabase SQL Editor APÓS o migration.sql
-- =============================================

-- Criar o usuário admin (substitua o email e senha)
-- Faça isso pelo painel: Authentication > Users > Add user
-- Email: seu@email.com
-- Senha: uma senha forte

-- Habilitar RLS em todas as tabelas
ALTER TABLE centros_custo ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE extrato_manual ENABLE ROW LEVEL SECURITY;

-- Políticas: qualquer usuário autenticado pode fazer tudo
CREATE POLICY "Autenticados podem ler centros_custo" ON centros_custo FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados podem ler categorias" ON categorias FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados podem ler despesas" ON despesas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados podem ler lancamentos" ON lancamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados podem ler extrato_manual" ON extrato_manual FOR ALL TO authenticated USING (true) WITH CHECK (true);
