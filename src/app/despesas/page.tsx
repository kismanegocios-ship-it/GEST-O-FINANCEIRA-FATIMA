'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, getStatusColor, getStatusLabel, googleCalendarLink } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { toast } from 'sonner'
import {
  Plus, Search, Calendar, CheckCircle, XCircle, Trash2,
  ExternalLink, Filter, RefreshCw, DollarSign
} from 'lucide-react'
import type { Despesa, CentroCusto, Categoria } from '@/lib/types'
import { format } from 'date-fns'

const STATUS_OPTIONS = ['todos', 'pendente', 'pago', 'vencido', 'cancelado']

const statusVariant: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = {
  pendente: 'warning',
  pago: 'success',
  vencido: 'danger',
  cancelado: 'neutral',
}

interface FormData {
  descricao: string
  valor: string
  data_vencimento: string
  status: string
  centro_custo_id: string
  categoria_id: string
  recorrente: boolean
  frequencia: string
  observacoes: string
}

const emptyForm: FormData = {
  descricao: '', valor: '', data_vencimento: '', status: 'pendente',
  centro_custo_id: '', categoria_id: '', recorrente: false, frequencia: 'mensal', observacoes: '',
}

export default function DespesasPage() {
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [centros, setCentros] = useState<CentroCusto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Despesa | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [modalPagar, setModalPagar] = useState<Despesa | null>(null)
  const [dataPagamento, setDataPagamento] = useState(format(new Date(), 'yyyy-MM-dd'))

  const load = useCallback(async () => {
    setLoading(true)
    const [d, cc, cat] = await Promise.all([
      supabase.from('despesas').select('*, centros_custo(*), categorias(*)').order('data_vencimento', { ascending: true }),
      supabase.from('centros_custo').select('*').eq('ativo', true).order('nome'),
      supabase.from('categorias').select('*').eq('tipo', 'saida').order('nome'),
    ])
    setDespesas((d.data ?? []) as Despesa[])
    setCentros(cc.data ?? [])
    setCategorias(cat.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const abrirNovo = () => {
    setEditando(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const abrirEditar = (d: Despesa) => {
    setEditando(d)
    setForm({
      descricao: d.descricao,
      valor: String(d.valor),
      data_vencimento: d.data_vencimento,
      status: d.status,
      centro_custo_id: d.centro_custo_id ?? '',
      categoria_id: d.categoria_id ?? '',
      recorrente: d.recorrente,
      frequencia: d.frequencia ?? 'mensal',
      observacoes: d.observacoes ?? '',
    })
    setModalOpen(true)
  }

  const salvar = async () => {
    if (!form.descricao || !form.valor || !form.data_vencimento) {
      toast.error('Preencha os campos obrigatórios')
      return
    }
    setSaving(true)
    const payload = {
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      data_vencimento: form.data_vencimento,
      status: form.status,
      centro_custo_id: form.centro_custo_id || null,
      categoria_id: form.categoria_id || null,
      recorrente: form.recorrente,
      frequencia: form.recorrente ? form.frequencia : null,
      observacoes: form.observacoes || null,
    }
    const { error } = editando
      ? await supabase.from('despesas').update(payload).eq('id', editando.id)
      : await supabase.from('despesas').insert(payload)

    setSaving(false)
    if (error) { toast.error('Erro ao salvar'); return }
    toast.success(editando ? 'Despesa atualizada!' : 'Despesa cadastrada!')
    setModalOpen(false)
    load()
  }

  const registrarPagamento = async () => {
    if (!modalPagar) return
    setSaving(true)
    const { error } = await supabase.from('despesas').update({
      status: 'pago',
      data_pagamento: dataPagamento,
    }).eq('id', modalPagar.id)

    if (!error) {
      await supabase.from('lancamentos').insert({
        descricao: `Pagamento: ${modalPagar.descricao}`,
        valor: modalPagar.valor,
        tipo: 'saida',
        data: dataPagamento,
        despesa_id: modalPagar.id,
        centro_custo_id: modalPagar.centro_custo_id ?? null,
        categoria_id: modalPagar.categoria_id ?? null,
        forma_pagamento: 'dinheiro',
        conciliado: false,
      })
      toast.success('Pagamento registrado e lançamento criado!')
    } else {
      toast.error('Erro ao registrar pagamento')
    }
    setSaving(false)
    setModalPagar(null)
    load()
  }

  const cancelar = async (id: string) => {
    await supabase.from('despesas').update({ status: 'cancelado' }).eq('id', id)
    toast.success('Despesa cancelada')
    load()
  }

  const excluir = async (id: string) => {
    await supabase.from('despesas').delete().eq('id', id)
    toast.success('Despesa excluída')
    load()
  }

  const despesasFiltradas = despesas.filter(d => {
    const matchBusca = d.descricao.toLowerCase().includes(busca.toLowerCase())
    const matchStatus = filtroStatus === 'todos' || d.status === filtroStatus
    return matchBusca && matchStatus
  })

  const totais = {
    pendente: despesas.filter(d => d.status === 'pendente').reduce((s, d) => s + Number(d.valor), 0),
    vencido: despesas.filter(d => d.status === 'vencido').reduce((s, d) => s + Number(d.valor), 0),
    pago: despesas.filter(d => d.status === 'pago').reduce((s, d) => s + Number(d.valor), 0),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Despesas</h1>
          <p className="text-sm text-slate-500 mt-1">Pré-cadastro e gestão de contas a pagar</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={16} /> Nova Despesa
        </Button>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-yellow-400">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">A Pagar</p>
            <p className="text-xl font-bold text-yellow-600">{formatCurrency(totais.pendente)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Vencidas</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totais.vencido)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Pago este mês</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totais.pago)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-4">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="Buscar despesa..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setFiltroStatus(s)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    filtroStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {s === 'todos' ? 'Todos' : getStatusLabel(s)}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw size={14} />
            </Button>
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
                <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vencimento</th>
                <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor</th>
                <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Centro de Custo</th>
                <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Categoria</th>
                <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">Carregando...</td></tr>
              ) : despesasFiltradas.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">Nenhuma despesa encontrada</td></tr>
              ) : despesasFiltradas.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-slate-800">{d.descricao}</p>
                      {d.recorrente && <span className="text-xs text-indigo-500">↻ {d.frequencia}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{formatDate(d.data_vencimento)}</td>
                  <td className="px-4 py-4 font-semibold text-slate-800">{formatCurrency(Number(d.valor))}</td>
                  <td className="px-4 py-4">
                    <Badge variant={statusVariant[d.status]}>{getStatusLabel(d.status)}</Badge>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{(d as any).centros_custo?.nome ?? '—'}</td>
                  <td className="px-4 py-4 text-slate-600">{(d as any).categorias?.nome ?? '—'}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1">
                      {d.status === 'pendente' && (
                        <>
                          <button
                            onClick={() => { setModalPagar(d); setDataPagamento(format(new Date(), 'yyyy-MM-dd')) }}
                            className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors"
                            title="Registrar pagamento"
                          >
                            <CheckCircle size={15} />
                          </button>
                          <a
                            href={googleCalendarLink({ title: `Pagar: ${d.descricao}`, date: d.data_vencimento, description: `Valor: ${formatCurrency(Number(d.valor))}` })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500 transition-colors"
                            title="Adicionar ao Google Agenda"
                          >
                            <Calendar size={15} />
                          </a>
                        </>
                      )}
                      <button
                        onClick={() => abrirEditar(d)}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors"
                        title="Editar"
                      >
                        <ExternalLink size={15} />
                      </button>
                      {d.status === 'pendente' && (
                        <button
                          onClick={() => cancelar(d.id)}
                          className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600 transition-colors"
                          title="Cancelar"
                        >
                          <XCircle size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => excluir(d.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Nova/Editar Despesa */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Despesa' : 'Nova Despesa'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input
              label="Descrição *"
              placeholder="Ex: Conta de luz, Aluguel..."
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            />
          </div>
          <Input
            label="Valor *"
            type="number"
            step="0.01"
            placeholder="0,00"
            value={form.valor}
            onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
          />
          <Input
            label="Data de Vencimento *"
            type="date"
            value={form.data_vencimento}
            onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))}
          />
          <Select
            label="Status"
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
          >
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="vencido">Vencido</option>
            <option value="cancelado">Cancelado</option>
          </Select>
          <Select
            label="Centro de Custo"
            value={form.centro_custo_id}
            onChange={e => setForm(f => ({ ...f, centro_custo_id: e.target.value }))}
          >
            <option value="">Sem centro de custo</option>
            {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <Select
            label="Categoria"
            value={form.categoria_id}
            onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
          >
            <option value="">Sem categoria</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <div className="flex items-center gap-3 col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.recorrente}
                onChange={e => setForm(f => ({ ...f, recorrente: e.target.checked }))}
                className="w-4 h-4 rounded accent-indigo-600"
              />
              <span className="text-sm text-slate-600">Despesa recorrente</span>
            </label>
            {form.recorrente && (
              <Select value={form.frequencia} onChange={e => setForm(f => ({ ...f, frequencia: e.target.value }))} className="w-40">
                <option value="mensal">Mensal</option>
                <option value="quinzenal">Quinzenal</option>
                <option value="semanal">Semanal</option>
                <option value="anual">Anual</option>
              </Select>
            )}
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Observações</label>
            <textarea
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              rows={2}
              placeholder="Observações opcionais..."
              value={form.observacoes}
              onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Cadastrar Despesa'}
          </Button>
        </div>
      </Modal>

      {/* Modal Registrar Pagamento */}
      <Modal open={!!modalPagar} onClose={() => setModalPagar(null)} title="Registrar Pagamento" size="sm">
        {modalPagar && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="font-semibold text-slate-800">{modalPagar.descricao}</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(Number(modalPagar.valor))}</p>
            </div>
            <Input
              label="Data do Pagamento"
              type="date"
              value={dataPagamento}
              onChange={e => setDataPagamento(e.target.value)}
            />
            <p className="text-xs text-slate-500">Um lançamento de saída será criado automaticamente.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModalPagar(null)}>Cancelar</Button>
              <Button variant="success" onClick={registrarPagamento} disabled={saving}>
                <DollarSign size={14} /> Confirmar Pagamento
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
