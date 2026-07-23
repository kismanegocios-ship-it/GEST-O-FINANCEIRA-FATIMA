'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, getStatusLabel, googleCalendarLink } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { TableWrapper, CardList, MobileCard } from '@/components/ui/table-mobile'
import { CurrencyInput } from '@/components/ui/currency-input'
import { toast } from 'sonner'
import {
  Plus, Search, Calendar, CheckCircle, XCircle, Trash2,
  Pencil, Filter, RefreshCw, DollarSign, ChevronRight
} from 'lucide-react'
import type { Despesa, CentroCusto, Categoria, ContaBancaria } from '@/lib/types'
import { format, addMonths } from 'date-fns'

const STATUS_OPTIONS = ['todos', 'pendente', 'pago', 'vencido', 'cancelado']

const statusVariant: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = {
  pendente: 'warning', pago: 'success', vencido: 'danger', cancelado: 'neutral',
}

interface FormData {
  descricao: string; valor: string; data_vencimento: string; status: string
  centro_custo_id: string; categoria_id: string; recorrente: boolean; frequencia: string; observacoes: string
  parcelado: boolean; num_parcelas: string; solicitante: string; conta_bancaria_id: string; forma_pagamento: string
}

const emptyForm: FormData = {
  descricao: '', valor: '', data_vencimento: '', status: 'pendente',
  centro_custo_id: '', categoria_id: '', recorrente: false, frequencia: 'mensal', observacoes: '',
  parcelado: false, num_parcelas: '2', solicitante: '', conta_bancaria_id: '', forma_pagamento: 'pix',
}

export default function DespesasPage() {
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [centros, setCentros] = useState<CentroCusto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Despesa | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [modalPagar, setModalPagar] = useState<Despesa | null>(null)
  const [dataPagamento, setDataPagamento] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [pagContaId, setPagContaId] = useState('')
  const [pagForma, setPagForma] = useState('pix')
  const [pagDesconto, setPagDesconto] = useState('')
  const [pagJuros, setPagJuros] = useState('')

  const load = useCallback(async () => {
    setLoading(true)

    // Auto-vencimento: pendentes com data anterior a hoje → vencido
    const hoje = format(new Date(), 'yyyy-MM-dd')
    await supabase
      .from('despesas')
      .update({ status: 'vencido' })
      .eq('status', 'pendente')
      .lt('data_vencimento', hoje)

    const [d, cc, cat, cb] = await Promise.all([
      supabase.from('despesas').select('*, centros_custo(*), categorias(*)').order('data_vencimento'),
      supabase.from('centros_custo').select('*').eq('ativo', true).order('nome'),
      supabase.from('categorias').select('*').eq('tipo', 'saida').order('nome'),
      supabase.from('contas_bancarias').select('*').eq('ativo', true).order('nome'),
    ])
    setDespesas((d.data ?? []) as Despesa[])
    setCentros(cc.data ?? [])
    setCategorias(cat.data ?? [])
    setContas((cb.data ?? []) as ContaBancaria[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const abrirNovo = () => { setEditando(null); setForm(emptyForm); setModalOpen(true) }
  const abrirEditar = (d: Despesa) => {
    setEditando(d)
    setForm({
      descricao: d.descricao, valor: String(d.valor), data_vencimento: d.data_vencimento,
      status: d.status, centro_custo_id: d.centro_custo_id ?? '', categoria_id: d.categoria_id ?? '',
      recorrente: d.recorrente, frequencia: d.frequencia ?? 'mensal', observacoes: d.observacoes ?? '',
      parcelado: false, num_parcelas: '2', solicitante: d.solicitante ?? '', conta_bancaria_id: '', forma_pagamento: 'pix',
    })
    setModalOpen(true)
  }

  const salvar = async () => {
    if (!form.descricao || !form.valor || !form.data_vencimento) { toast.error('Preencha os campos obrigatorios'); return }
    setSaving(true)

    // ── Modo parcelas: cria N despesas mensais ──
    if (form.parcelado && !editando) {
      const n = Math.max(2, Math.min(120, parseInt(form.num_parcelas) || 2))
      const baseDate = new Date(form.data_vencimento + 'T12:00:00')
      const registros = Array.from({ length: n }, (_, i) => ({
        descricao: `${form.descricao} (${i + 1}/${n})`,
        valor: parseFloat(form.valor),
        data_vencimento: format(addMonths(baseDate, i), 'yyyy-MM-dd'),
        status: 'pendente',
        centro_custo_id: form.centro_custo_id || null,
        categoria_id: form.categoria_id || null,
        recorrente: false,
        frequencia: null,
        observacoes: form.observacoes || null,
        solicitante: form.solicitante || null,
      }))
      const { error } = await supabase.from('despesas').insert(registros)
      setSaving(false)
      if (error) { toast.error('Erro ao criar parcelas'); return }
      toast.success(`${n} parcelas criadas! (${form.descricao} 1/${n} até ${n}/${n})`)
      setModalOpen(false); setForm(emptyForm); load()
      return
    }

    // ── Modo normal: cria/edita 1 despesa ──
    const hoje = format(new Date(), 'yyyy-MM-dd')
    // Nova despesa SEMPRE entra como pendente — status só muda após criação
    const statusFinal = editando ? form.status : 'pendente'
    const payload = {
      descricao: form.descricao, valor: parseFloat(form.valor), data_vencimento: form.data_vencimento,
      status: statusFinal, centro_custo_id: form.centro_custo_id || null, categoria_id: form.categoria_id || null,
      recorrente: form.recorrente, frequencia: form.recorrente ? form.frequencia : null, observacoes: form.observacoes || null,
      solicitante: form.solicitante || null,
      data_pagamento: statusFinal === 'pago' ? hoje : null,
    }
    const { error } = editando
      ? await supabase.from('despesas').update(payload).eq('id', editando.id)
      : await supabase.from('despesas').insert(payload)
    if (error) { setSaving(false); toast.error('Erro ao salvar'); return }

    // ── Se marcou como PAGO e antes era pendente/vencido → cria lançamento de saída ──
    const eraDevedora = editando && ['pendente', 'vencido'].includes(editando.status)
    const viroupago = statusFinal === 'pago'
    if (eraDevedora && viroupago) {
      // Verifica se já existe lancamento para essa despesa (evita duplicata)
      const { data: lancExist } = await supabase
        .from('lancamentos').select('id').eq('despesa_id', editando!.id).maybeSingle()
      if (!lancExist) {
        await supabase.from('lancamentos').insert({
          descricao: `Pagamento: ${form.descricao}`,
          valor: parseFloat(form.valor),
          tipo: 'saida',
          data: hoje,
          despesa_id: editando!.id,
          centro_custo_id: form.centro_custo_id || null,
          categoria_id: form.categoria_id || null,
          forma_pagamento: form.forma_pagamento || 'pix',
          conta_bancaria_id: form.conta_bancaria_id || null,
          conciliado: !!form.conta_bancaria_id,
        })
        toast.success(form.conta_bancaria_id ? 'Despesa paga e ja conciliada no fluxo de caixa! 💸' : 'Despesa marcada como paga e saída registrada no fluxo de caixa! 💸')
        setSaving(false); setModalOpen(false); load()
        return
      }
    }

    setSaving(false)
    toast.success(editando ? 'Despesa atualizada!' : 'Despesa cadastrada!')
    setModalOpen(false); load()
  }

  const registrarPagamento = async () => {
    if (!modalPagar) return
    setSaving(true)
    const desconto = parseFloat(pagDesconto) || 0
    const juros = parseFloat(pagJuros) || 0
    const valorFinal = Math.max(0, Number(modalPagar.valor) - desconto + juros)
    const { error } = await supabase.from('despesas').update({ status: 'pago', data_pagamento: dataPagamento }).eq('id', modalPagar.id)
    if (!error) {
      const obs = [
        desconto > 0 ? `Desconto: ${formatCurrency(desconto)}` : '',
        juros > 0 ? `Juros/Multa: ${formatCurrency(juros)}` : '',
      ].filter(Boolean).join(' | ') || null
      await supabase.from('lancamentos').insert({
        descricao: `Pagamento: ${modalPagar.descricao}`,
        valor: valorFinal,
        tipo: 'saida',
        data: dataPagamento,
        despesa_id: modalPagar.id,
        centro_custo_id: modalPagar.centro_custo_id ?? null,
        categoria_id: modalPagar.categoria_id ?? null,
        forma_pagamento: pagForma,
        conta_bancaria_id: pagContaId || null,
        observacoes: obs,
        conciliado: !!pagContaId,
      })
      toast.success(pagContaId ? 'Pagamento registrado e ja conciliado no caixa!' : 'Pagamento registrado! Saida lancada no caixa.')
    } else { toast.error('Erro ao registrar') }
    setSaving(false)
    setModalPagar(null)
    setPagContaId('')
    setPagForma('pix')
    setPagDesconto('')
    setPagJuros('')
    load()
  }

  const cancelar = async (id: string) => { await supabase.from('despesas').update({ status: 'cancelado' }).eq('id', id); toast.success('Cancelada'); load() }
  const excluir = async (id: string) => { await supabase.from('despesas').delete().eq('id', id); toast.success('Excluida'); load() }

  const filtradas = despesas.filter(d => {
    const mb = d.descricao.toLowerCase().includes(busca.toLowerCase())
    const ms = filtroStatus === 'todos' || d.status === filtroStatus
    return mb && ms
  })

  const totais = {
    pendente: despesas.filter(d => d.status === 'pendente').reduce((s, d) => s + Number(d.valor), 0),
    vencido: despesas.filter(d => d.status === 'vencido').reduce((s, d) => s + Number(d.valor), 0),
    pago: despesas.filter(d => d.status === 'pago').reduce((s, d) => s + Number(d.valor), 0),
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Despesas</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">Pre-cadastro de contas a pagar</p>
        </div>
        <Button onClick={abrirNovo} size="sm">
          <Plus size={15} /> <span className="hidden sm:inline">Nova</span> Despesa
        </Button>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-yellow-400">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-slate-500">A Pagar</p>
            <p className="text-base md:text-xl font-bold text-yellow-600">{formatCurrency(totais.pendente)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-slate-500">Vencidas</p>
            <p className="text-base md:text-xl font-bold text-red-600">{formatCurrency(totais.vencido)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-slate-500">Pagas</p>
            <p className="text-base md:text-xl font-bold text-green-600">{formatCurrency(totais.pago)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {STATUS_OPTIONS.map(s => (
                <button key={s} onClick={() => setFiltroStatus(s)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${filtroStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {s === 'todos' ? 'Todos' : getStatusLabel(s)}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Desktop: tabela */}
      <Card>
        <TableWrapper>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Descricao</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Vencimento</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Valor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Centro</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Carregando...</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Nenhuma despesa</td></tr>
              ) : filtradas.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-800">{d.descricao}</p>
                    {d.recorrente && <span className="text-xs text-indigo-500">Recorrente · {d.frequencia}</span>}
                    {d.solicitante && <p className="text-xs text-slate-400 mt-0.5">Solicitado por: {d.solicitante}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-sm">{formatDate(d.data_vencimento)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{formatCurrency(Number(d.valor))}</td>
                  <td className="px-4 py-3"><Badge variant={statusVariant[d.status]}>{getStatusLabel(d.status)}</Badge></td>
                  <td className="px-4 py-3 text-slate-500 text-sm">{(d as any).centros_custo?.nome ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {(d.status === 'pendente' || d.status === 'vencido') && <>
                        <button onClick={() => { setModalPagar(d); setDataPagamento(format(new Date(), 'yyyy-MM-dd')); setPagContaId(''); setPagForma('pix'); setPagDesconto(''); setPagJuros('') }} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="Pagar"><CheckCircle size={14} /></button>
                        <a href={googleCalendarLink({ title: `Pagar: ${d.descricao}`, date: d.data_vencimento, description: `Valor: ${formatCurrency(Number(d.valor))}` })} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500 transition-colors" title="Google Agenda"><Calendar size={14} /></a>
                      </>}
                      <button onClick={() => abrirEditar(d)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => excluir(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>

        {/* Mobile: cards */}
        <CardList>
          {loading ? (
            <MobileCard><p className="text-center text-slate-400 py-6">Carregando...</p></MobileCard>
          ) : filtradas.length === 0 ? (
            <MobileCard><p className="text-center text-slate-400 py-6">Nenhuma despesa encontrada</p></MobileCard>
          ) : filtradas.map(d => {
            const cc = (d as any).centros_custo?.nome
            const isVencido = d.status === 'vencido'
            const isPendente = d.status === 'pendente'
            return (
              <MobileCard key={d.id} className="py-4">
                {/* Linha 1: descrição + badge status */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm leading-tight">{d.descricao}</p>
                    {d.recorrente && (
                      <span className="text-[10px] text-indigo-500 font-medium">↻ Recorrente · {d.frequencia}</span>
                    )}
                  </div>
                  <Badge variant={statusVariant[d.status]}>{getStatusLabel(d.status)}</Badge>
                </div>

                {/* Linha 2: valor em destaque + vencimento */}
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-xl font-bold ${isVencido ? 'text-red-600' : isPendente ? 'text-slate-800' : 'text-green-600'}`}>
                    {formatCurrency(Number(d.valor))}
                  </p>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-medium">Vencimento</p>
                    <p className={`text-xs font-semibold ${isVencido ? 'text-red-500' : 'text-slate-700'}`}>
                      {formatDate(d.data_vencimento)}
                    </p>
                  </div>
                </div>

                {/* Linha 3: centro de custo + solicitante */}
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {cc && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-medium">
                      🏢 {cc}
                    </span>
                  )}
                  {d.solicitante && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-lg text-[11px]">
                      👤 {d.solicitante}
                    </span>
                  )}
                </div>

                {/* Linha 4: ações */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                  {(isPendente || isVencido) && (
                    <button
                      onClick={() => { setModalPagar(d); setDataPagamento(format(new Date(), 'yyyy-MM-dd')); setPagContaId(''); setPagForma('pix'); setPagDesconto(''); setPagJuros('') }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-100 text-green-700 rounded-xl text-xs font-semibold hover:bg-green-200 transition-colors"
                    >
                      <CheckCircle size={13} /> Marcar Pago
                    </button>
                  )}
                  <button
                    onClick={() => abrirEditar(d)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors"
                  >
                    <Pencil size={13} /> Editar
                  </button>
                  {isPendente && (
                    <a
                      href={googleCalendarLink({ title: `Pagar: ${d.descricao}`, date: d.data_vencimento, description: `Valor: ${formatCurrency(Number(d.valor))}` })}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center p-2 bg-indigo-50 text-indigo-500 rounded-xl hover:bg-indigo-100 transition-colors"
                      title="Google Agenda"
                    >
                      <Calendar size={14} />
                    </a>
                  )}
                  <button
                    onClick={() => excluir(d.id)}
                    className="flex items-center justify-center p-2 bg-red-50 text-red-400 rounded-xl hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </MobileCard>
            )
          })}
        </CardList>
      </Card>

      {/* Modal Despesa */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Despesa' : 'Nova Despesa'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Descricao — linha inteira */}
          <div className="col-span-1 sm:col-span-2">
            <Input label="Descricao *" placeholder="Ex: Conta de luz, Aluguel, Fornecedor..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          </div>

          {/* Valor + Vencimento */}
          <CurrencyInput label="Valor *" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
          <Input label="Vencimento *" type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} />

          {/* Status só aparece ao EDITAR — nova despesa sempre entra como Pendente */}
          {editando && (
            <>
              <Select label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="vencido">Vencido</option>
                <option value="cancelado">Cancelado</option>
              </Select>
              <div /> {/* espaço para manter grid de 2 colunas */}
              {/* Se marcando como pago via edição, pede forma e conta */}
              {form.status === 'pago' && editando.status !== 'pago' && (
                <>
                  <Select label="Forma de Pagamento" value={form.forma_pagamento} onChange={e => setForm(f => ({ ...f, forma_pagamento: e.target.value }))}>
                    <option value="pix">PIX</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="boleto">Boleto</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_debito">Cartao Debito</option>
                    <option value="cartao_credito">Cartao Credito</option>
                  </Select>
                  {contas.length > 0 ? (
                    <Select label="Conta Bancaria" value={form.conta_bancaria_id} onChange={e => setForm(f => ({ ...f, conta_bancaria_id: e.target.value }))}>
                      <option value="">Sem conta especifica</option>
                      {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </Select>
                  ) : <div />}
                </>
              )}
            </>
          )}

          {/* Centro de Custo + Categoria — linha inteira cada */}
          <div className="col-span-1 sm:col-span-2">
            <Select label="Centro de Custo" value={form.centro_custo_id} onChange={e => setForm(f => ({ ...f, centro_custo_id: e.target.value }))}>
              <option value="">Sem centro de custo</option>
              {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>
          <div className="col-span-1 sm:col-span-2">
            <Select label="Categoria" value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
              <option value="">Sem categoria</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>
          {/* Parcelado / Recorrente — mutuamente exclusivos */}
          {!editando && (
            <div className="col-span-1 sm:col-span-2 space-y-3">
              {/* Toggle Parcelado */}
              <div className={`rounded-2xl border-2 p-3 transition-all cursor-pointer ${form.parcelado ? 'border-indigo-400 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}
                onClick={() => setForm(f => ({ ...f, parcelado: !f.parcelado, recorrente: false }))}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.parcelado ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                    {form.parcelado && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Parcelado</p>
                    <p className="text-xs text-slate-400">Cria uma entrada para cada parcela automaticamente</p>
                  </div>
                </div>
                {form.parcelado && (
                  <div className="mt-3 flex items-center gap-3" onClick={e => e.stopPropagation()}>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Numero de parcelas</label>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setForm(f => ({ ...f, num_parcelas: String(Math.max(2, parseInt(f.num_parcelas) - 1)) }))}
                          className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold flex items-center justify-center hover:bg-slate-100">−</button>
                        <input type="number" min={2} max={120}
                          className="w-16 text-center px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          value={form.num_parcelas}
                          onChange={e => setForm(f => ({ ...f, num_parcelas: e.target.value }))} />
                        <button type="button" onClick={() => setForm(f => ({ ...f, num_parcelas: String(Math.min(120, parseInt(f.num_parcelas) + 1)) }))}
                          className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold flex items-center justify-center hover:bg-slate-100">+</button>
                        <span className="text-xs text-slate-500">parcelas mensais</span>
                      </div>
                    </div>
                    <div className="bg-white border border-indigo-100 rounded-xl px-3 py-2 text-center">
                      <p className="text-xs text-slate-400">Valor por parcela</p>
                      <p className="text-sm font-bold text-indigo-600">
                        {form.valor ? formatCurrency(parseFloat(form.valor)) : 'R$ —'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Total: {form.valor ? formatCurrency(parseFloat(form.valor) * (parseInt(form.num_parcelas) || 0)) : '—'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Toggle Recorrente */}
              <div className={`rounded-2xl border-2 p-3 transition-all cursor-pointer ${form.recorrente ? 'border-purple-400 bg-purple-50' : 'border-slate-100 bg-slate-50'}`}
                onClick={() => setForm(f => ({ ...f, recorrente: !f.recorrente, parcelado: false }))}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.recorrente ? 'bg-purple-600 border-purple-600' : 'border-slate-300'}`}>
                    {form.recorrente && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Recorrente</p>
                    <p className="text-xs text-slate-400">Despesa fixa mensal, quinzenal ou anual — cancele quando quiser</p>
                  </div>
                </div>
                {form.recorrente && (
                  <div className="mt-3" onClick={e => e.stopPropagation()}>
                    <Select value={form.frequencia} onChange={e => setForm(f => ({ ...f, frequencia: e.target.value }))} className="w-44">
                      <option value="mensal">Mensal</option>
                      <option value="quinzenal">Quinzenal</option>
                      <option value="semanal">Semanal</option>
                      <option value="anual">Anual</option>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ao editar, mantém o toggle recorrente simples */}
          {editando && (
            <div className="col-span-1 sm:col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.recorrente} onChange={e => setForm(f => ({ ...f, recorrente: e.target.checked }))} className="w-4 h-4 rounded accent-indigo-600" />
                <span className="text-sm text-slate-600">Recorrente</span>
              </label>
              {form.recorrente && (
                <Select value={form.frequencia} onChange={e => setForm(f => ({ ...f, frequencia: e.target.value }))} className="w-36">
                  <option value="mensal">Mensal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="semanal">Semanal</option>
                  <option value="anual">Anual</option>
                </Select>
              )}
            </div>
          )}
          <div>
            <Input
              label="Quem solicitou"
              placeholder="Ex: Fulano, Depto. Comercial..."
              value={form.solicitante}
              onChange={e => setForm(f => ({ ...f, solicitante: e.target.value }))}
            />
          </div>
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Observacoes</label>
            <textarea className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30" rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? 'Salvando...' : editando ? 'Salvar alteracoes' : form.parcelado ? `Criar ${form.num_parcelas || '?'} parcelas` : 'Cadastrar Despesa'}
          </Button>
        </div>
      </Modal>

      {/* Modal Pagar */}
      <Modal open={!!modalPagar} onClose={() => setModalPagar(null)} title="Registrar Pagamento" size="sm">
        {modalPagar && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="font-semibold text-slate-800">{modalPagar.descricao}</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(Number(modalPagar.valor))}</p>
            </div>
            <Input label="Data do Pagamento *" type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Forma de Pagamento *" value={pagForma} onChange={e => setPagForma(e.target.value)}>
                <option value="pix">PIX</option>
                <option value="transferencia">Transferencia</option>
                <option value="boleto">Boleto</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao_debito">Cartao Debito</option>
                <option value="cartao_credito">Cartao Credito</option>
              </Select>
              <Select label="Conta Bancaria" value={pagContaId} onChange={e => setPagContaId(e.target.value)}>
                <option value="">{contas.length === 0 ? 'Nenhum banco cadastrado' : 'Selecione o banco...'}</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Select>
            </div>
            {contas.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                Cadastre bancos em <a href="/contas" className="font-semibold underline">Contas Bancarias</a> para vincular o pagamento.
              </p>
            )}
            {/* Desconto / Juros */}
            <div className="border border-slate-100 rounded-xl p-3 space-y-2.5 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ajuste do valor (opcional)</p>
              <div className="grid grid-cols-2 gap-3">
                <CurrencyInput
                  label="Desconto (abater)"
                  value={pagDesconto}
                  onChange={e => setPagDesconto(e.target.value)}
                  placeholder="0,00"
                />
                <CurrencyInput
                  label="Juros / Multa (acrescer)"
                  value={pagJuros}
                  onChange={e => setPagJuros(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              {/* Valor final calculado */}
              {(parseFloat(pagDesconto) > 0 || parseFloat(pagJuros) > 0) && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <span className="text-xs text-slate-500">Valor que sera debitado:</span>
                  <span className="text-base font-bold text-indigo-700">
                    {formatCurrency(Math.max(0, Number(modalPagar!.valor) - (parseFloat(pagDesconto) || 0) + (parseFloat(pagJuros) || 0)))}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400">Um lancamento de saida sera criado automaticamente no fluxo de caixa{pagContaId ? ' e ja conciliado, pois o banco foi informado' : ''}.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModalPagar(null)}>Cancelar</Button>
              <Button variant="success" onClick={registrarPagamento} disabled={saving}><DollarSign size={14} /> Confirmar Pagamento</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
