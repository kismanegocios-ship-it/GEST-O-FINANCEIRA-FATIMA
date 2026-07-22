-- Contas bancárias
CREATE TABLE IF NOT EXISTS contas_bancarias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  banco VARCHAR(100),
  agencia VARCHAR(20),
  conta VARCHAR(30),
  tipo VARCHAR(20) DEFAULT 'corrente',
  saldo_inicial DECIMAL(12,2) DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE contas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticado_contas" ON contas_bancarias
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Vincula lançamentos e extrato a uma conta bancária
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS conta_bancaria_id UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL;

ALTER TABLE extrato_manual
  ADD COLUMN IF NOT EXISTS conta_bancaria_id UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL;

-- Quem solicitou a despesa
ALTER TABLE despesas
  ADD COLUMN IF NOT EXISTS solicitante VARCHAR(100);
