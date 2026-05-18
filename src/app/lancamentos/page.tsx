'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, getFormaPagamentoLabel } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { toast } from 'sonner'
import { Plus, Search, Trash2, TrendingUp, TrendingDown, DollarSign, RefreshCw, ArrowUpDown } from 'lucide-react'
import type { Lancamento, CentroCusto, Categoria } from '@/lib/types'
import { format, startOfMonth, endOfMonth } from 'date-fns'

interface FormData {
  descricao: string
  valor: string
  tipo: 'entrada' | 'saida'
  data: string
  centro_custo_id: string
  categoria_id: string
  forma_pagamento: string
  conciliado: boolean
  observacoes: string
}

const emptyForm: FormData = {
  descricao: '', valor: '', tipo: 'saida', data: format(new Date(), 'yyyy-MM-dd'),
  centro_custo_id: '', categoria_id: '', forma_pagamento: 'dinheiro', conciliado: false, observacoes: '',
}

export default function LancamentosPage() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [centros, setCentros] = useState<CentroCusto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'entrada' | 'saida'>('todos')
  const [mesFiltro, setMesFiltro] = useState(format(new Date(), 'yyyy-MM'))

  const load = useCallback(async () => {
    setLoading(true)
    const [ini, fim] = [
      format(startOfMonth(new Date(mesFiltro + '-01')), 'yyyy-MM-dd'),
      format(endOfMonth(new Date(mesFiltro + '-01')), 'yyyy-MM-dd'),
    ]
    const [l, cc, cat] = await Promise.all([
      supabase.from('lancamentos').select('*, centros_custo(*), categorias(*)')
        .gte('data', ini).lte('data', fim).order('data', { ascending: false }),
      supabase.from('centros_custo').select('*').eq('ativo', true).order('nome'),
      supabase.from('categorias').select('*').order('tipo').order('nome'),
    ])
    setLancamentos((l.data ?? []) as Lancamento[])
    setCentros(cc.data ?? [])
    setCategorias(cat.data ?? [])
    setLoading(false)
  }, [mesFiltro])

  useEffect(() => { load() }, [load])

  const abrirNovo = (tipo?: 'entrada' | 'saida') => {
    setForm({ ...emptyForm, tipo: tipo ?? 'saida' })
    setModalOpen(true)
  }

  const salvar = async () => {
    if (!form.descricao || !form.valor || !form.data) {
      toast.error('Preencha os campos obrigatórios')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('lancamentos').insert({
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      tipo: form.tipo,
      data: form.data,
      centro_custo_id: form.centro_custo_id || null,
      categoria_id: form.categoria_id || null,
      forma_pagamento: form.forma_pagamento,
      conciliado: form.conciliado,
      observacoes: form.observacoes || null,
    })
    setSaving(false)
    if (error) { toast.error('Erro ao salvar'); return }
    toast.success('Lançamento registrado!')
    setModalOpen(false)
    load()
  }

  const excluir = async (id: string) => {
    await supabase.from('lancamentos').delete().eq('id', id)
    toast.success('Lançamento excluído')
    load()
  }

  const filtrados = lancamentos.filter(l => {
    const matchBusca = l.descricao.toLowerCase().includes(busca.toLowerCase())
    const matchTipo = filtroTipo === 'todos' || l.tipo === filtroTipo
    return matchBusca && matchTipo
  })

  const totalEntradas = filtrados.filter(l => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0)
  const totalSaidas = filtrados.filter(l => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0)
  const saldo = totalEntradas - totalSaidas

  const categoriasForm = form.tipo === 'entrada'
    ? categorias.filter(c => c.tipo === 'entrada')
    : categorias.filter(c => c.tipo === 'saida')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Lançamentos</h1>
          <p className="text-sm text-slate-500 mt-1">Entradas e saídas de caixa</p>
        </div>
        <div className="flex gap-2">
          <Button variant="success" onClick={() => abrirNovo('entrada')}>
            <TrendingUp size={16} /> Entrada
          </Button>
          <Button variant="danger" onClick={() => abrirNovo('saida')}>
            <TrendingDown size={16} /> Saída
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Entradas</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totalEntradas)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Saídas</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalSaidas)}</p>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${saldo >= 0 ? 'border-l-indigo-500' : 'border-l-orange-500'}`}>
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Saldo do período</p>
            <p className={`text-xl font-bold ${saldo >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>{formatCurrency(saldo)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-4">
          <div className="flex gap-3 flex-wrap items-center">
            <input
              type="month"
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              value={mesFiltro}
              onChange={e => setMesFiltro(e.target.value)}
            />
            <div className="flex-1 min-w-48 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="Buscar lançamento..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>
            {(['todos', 'entrada', 'saida'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFiltroTipo(t)}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  filtroTipo === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t === 'todos' ? 'Todos' : t === 'entrada' ? 'Entradas' : 'Saídas'}
              </button>
            ))}
            <Button variant="ghost" size="sm" onClick={load}><RefreshCw size={14} /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Descrição</th>
                <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor</th>
                <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Forma</th>
                <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Categoria</th>
                <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Conciliado</th>
                <th className="px-4 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">Carregando...</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">Nenhum lançamento encontrado</td></tr>
              ) : filtrados.map(l => (
                <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-800">{l.descricao}</p>
                    {(l as any).centros_custo && <p className="text-xs text-slate-400">{(l as any).centros_custo.nome}</p>}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{formatDate(l.data)}</td>
                  <td className="px-4 py-4">
                    <Badge variant={l.tipo === 'entrada' ? 'success' : 'danger'}>
                      {l.tipo === 'entrada' ? '↑ Entrada' : '↓ Saída'}
                    </Badge>
                  </td>
                  <td className={`px-4 py-4 font-semibold ${l.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                    {l.tipo === 'entrada' ? '+' : '-'}{formatCurrency(Number(l.valor))}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{getFormaPagamentoLabel(l.forma_pagamento)}</td>
                  <td className="px-4 py-4 text-slate-600">{(l as any).categorias?.nome ?? '—'}</td>
                  <td className="px-4 py-4">
                    <Badge variant={l.conciliado ? 'success' : 'neutral'}>
                      {l.conciliado ? 'Sim' : 'Não'}
                    </Badge>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => excluir(l.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Lançamento" size="md">
        <div className="space-y-4">
          {/* Tipo toggle */}
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setForm(f => ({ ...f, tipo: 'entrada' }))}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                form.tipo === 'entrada' ? 'bg-green-600 text-white shadow-sm' : 'text-slate-600'
              }`}
            >
              <TrendingUp size={14} /> Entrada
            </button>
            <button
              onClick={() => setForm(f => ({ ...f, tipo: 'saida' }))}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                form.tipo === 'saida' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-600'
              }`}
            >
              <TrendingDown size={14} /> Saída
            </button>
          </div>

          <Input label="Descrição *" placeholder="Ex: Venda do dia, Pagamento fornecedor..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Valor *" type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
            <Input label="Data *" type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Forma de Pagamento" value={form.forma_pagamento} onChange={e => setForm(f => ({ ...f, forma_pagamento: e.target.value }))}>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="cartao_debito">Cartão Débito</option>
              <option value="cartao_credito">Cartão Crédito</option>
              <option value="transferencia">Transferência</option>
              <option value="boleto">Boleto</option>
            </Select>
            <Select label="Centro de Custo" value={form.centro_custo_id} onChange={e => setForm(f => ({ ...f, centro_custo_id: e.target.value }))}>
              <option value="">Sem centro de custo</option>
              {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>
          <Select label="Categoria" value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
            <option value="">Sem categoria</option>
            {categoriasForm.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.conciliado} onChange={e => setForm(f => ({ ...f, conciliado: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
            <span className="text-sm text-slate-600">Já conciliado com extrato</span>
          </label>
          <Input label="Observações" placeholder="Opcional..." value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Registrar Lançamento'}</Button>
        </div>
      </Modal>
    </div>
  )
}
