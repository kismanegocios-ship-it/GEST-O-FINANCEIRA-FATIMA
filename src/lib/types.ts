export type Database = {
  public: {
    Tables: {
      centros_custo: {
        Row: CentroCusto
        Insert: Omit<CentroCusto, 'id' | 'created_at'>
        Update: Partial<Omit<CentroCusto, 'id' | 'created_at'>>
      }
      categorias: {
        Row: Categoria
        Insert: Omit<Categoria, 'id' | 'created_at'>
        Update: Partial<Omit<Categoria, 'id' | 'created_at'>>
      }
      despesas: {
        Row: Despesa
        Insert: Omit<Despesa, 'id' | 'created_at'>
        Update: Partial<Omit<Despesa, 'id' | 'created_at'>>
      }
      lancamentos: {
        Row: Lancamento
        Insert: Omit<Lancamento, 'id' | 'created_at'>
        Update: Partial<Omit<Lancamento, 'id' | 'created_at'>>
      }
      extrato_manual: {
        Row: ExtratoManual
        Insert: Omit<ExtratoManual, 'id' | 'created_at'>
        Update: Partial<Omit<ExtratoManual, 'id' | 'created_at'>>
      }
      contas_bancarias: {
        Row: ContaBancaria
        Insert: Omit<ContaBancaria, 'id' | 'created_at'>
        Update: Partial<Omit<ContaBancaria, 'id' | 'created_at'>>
      }
    }
  }
}

export interface CentroCusto {
  id: string
  nome: string
  descricao?: string
  cor: string
  ativo: boolean
  created_at: string
}

export interface Categoria {
  id: string
  nome: string
  tipo: 'entrada' | 'saida'
  cor: string
  icone: string
  created_at: string
}

export interface ContaBancaria {
  id: string
  nome: string
  banco: string | null
  agencia: string | null
  conta: string | null
  tipo: string
  saldo_inicial: number
  ativo: boolean
  created_at: string
}

export interface Despesa {
  id: string
  descricao: string
  valor: number
  data_vencimento: string
  data_pagamento?: string | null
  status: 'pendente' | 'pago' | 'vencido' | 'cancelado'
  centro_custo_id?: string | null
  categoria_id?: string | null
  recorrente: boolean
  frequencia?: string | null
  observacoes?: string | null
  solicitante?: string | null
  anexo_path?: string | null
  anexo_nome?: string | null
  created_at: string
  centros_custo?: CentroCusto
  categorias?: Categoria
}

export interface Lancamento {
  id: string
  descricao: string
  valor: number
  tipo: 'entrada' | 'saida'
  data: string
  despesa_id?: string | null
  centro_custo_id?: string | null
  categoria_id?: string | null
  conta_bancaria_id?: string | null
  conciliado: boolean
  forma_pagamento: string
  observacoes?: string | null
  created_at: string
  centros_custo?: CentroCusto
  categorias?: Categoria
  contas_bancarias?: ContaBancaria
}

export interface ExtratoManual {
  id: string
  descricao: string
  valor: number
  data: string
  tipo: 'credito' | 'debito'
  conciliado: boolean
  lancamento_id?: string | null
  conta_bancaria_id?: string | null
  observacoes?: string | null
  created_at: string
  lancamentos?: Lancamento
  contas_bancarias?: ContaBancaria
}
