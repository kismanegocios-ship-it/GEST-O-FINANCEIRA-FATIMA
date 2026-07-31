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
import { TableWrapper, CardList, MobileCard } from '@/components/ui/table-mobile'
import { CurrencyInput } from '@/components/ui/currency-input'
import { toast } from 'sonner'
import {
  Plus, Search, Trash2, TrendingUp, TrendingDown,
  RefreshCw, Pencil, FileDown, ArrowUpDown, Columns3, Check,
} from 'lucide-react'
import type { Lancamento, CentroCusto, Categoria, ContaBancaria } from '@/lib/types'
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns'

type ColKey = 'data' | 'descricao' | 'tipo' | 'valor' | 'saldo' | 'forma' | 'conta' | 'categoria' | 'centro' | 'conciliado'
const COLS: { key: ColKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'data', label: 'Data', align: 'left' },
  { key: 'descricao', label: 'Descricao', align: 'left' },
  { key: 'tipo', label: 'Tipo', align: 'left' },
  { key: 'valor', label: 'Valor', align: 'right' },
  { key: 'saldo', label: 'Saldo', align: 'right' },
  { key: 'forma', label: 'Forma', align: 'left' },
  { key: 'conta', label: 'Conta', align: 'left' },
  { key: 'categoria', label: 'Categoria', align: 'left' },
  { key: 'centro', label: 'Centro de Custo', align: 'left' },
  { key: 'conciliado', label: 'Conciliado', align: 'left' },
]
const DEFAULT_COLS: ColKey[] = ['data', 'descricao', 'tipo', 'valor', 'saldo', 'forma', 'conta', 'categoria', 'conciliado']

interface FormData {
  descricao: string
  valor: string
  tipo: 'entrada' | 'saida'
  data: string
  centro_custo_id: string
  categoria_id: string
  conta_bancaria_id: string
  forma_pagamento: string
  conciliado: boolean
  observacoes: string
}

const emptyForm: FormData = {
  descricao: '', valor: '', tipo: 'saida', data: format(new Date(), 'yyyy-MM-dd'),
  centro_custo_id: '', categoria_id: '', conta_bancaria_id: '', forma_pagamento: 'transferencia',
  conciliado: false, observacoes: '',
}

export default function LancamentosPage() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [centros, setCentros] = useState<CentroCusto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Lancamento | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'entrada' | 'saida'>('todos')
  const [filtroCentros, setFiltroCentros] = useState<Set<string>>(new Set())
  const [filtroCategorias, setFiltroCategorias] = useState<Set<string>>(new Set())
  const [filtroConta, setFiltroConta] = useState('')
  // Periodo (De/Ate) — padrao: mes atual
  const [dataIni, setDataIni] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dataFim, setDataFim] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [centroMenuOpen, setCentroMenuOpen] = useState(false)
  const [categoriaMenuOpen, setCategoriaMenuOpen] = useState(false)
  const [cols, setCols] = useState<Set<ColKey>>(new Set(DEFAULT_COLS))
  // Extrato: do inicio do mes para o fim (crescente), como no extrato bancario
  const [ordem, setOrdem] = useState<'asc' | 'desc'>('asc')
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [priorLancs, setPriorLancs] = useState<Pick<Lancamento, 'valor' | 'tipo' | 'conta_bancaria_id' | 'centro_custo_id' | 'categoria_id'>[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const ini = dataIni
    const fim = dataFim
    const [l, cc, cat, cb, prior] = await Promise.all([
      supabase.from('lancamentos')
        .select('*, centros_custo(*), categorias(*), contas_bancarias(*)')
        .gte('data', ini).lte('data', fim).order('data', { ascending: false }),
      supabase.from('centros_custo').select('*').eq('ativo', true).order('nome'),
      supabase.from('categorias').select('*').order('tipo').order('nome'),
      supabase.from('contas_bancarias').select('*').eq('ativo', true).order('nome'),
      supabase.from('lancamentos')
        .select('valor, tipo, conta_bancaria_id, centro_custo_id, categoria_id')
        .lt('data', ini),
    ])
    setLancamentos((l.data ?? []) as Lancamento[])
    setCentros(cc.data ?? [])
    setCategorias(cat.data ?? [])
    setContas((cb.data ?? []) as ContaBancaria[])
    setPriorLancs((prior.data ?? []) as typeof priorLancs)
    setLoading(false)
  }, [dataIni, dataFim])

  useEffect(() => { load() }, [load])

  const setPeriodo = (ini: Date, fim: Date) => {
    setDataIni(format(ini, 'yyyy-MM-dd'))
    setDataFim(format(fim, 'yyyy-MM-dd'))
  }
  const hojeRef = new Date()
  const presets = [
    { label: 'Este mes', on: () => setPeriodo(startOfMonth(hojeRef), endOfMonth(hojeRef)) },
    { label: 'Mes passado', on: () => { const m = subMonths(hojeRef, 1); setPeriodo(startOfMonth(m), endOfMonth(m)) } },
    { label: 'Ultimos 3 meses', on: () => setPeriodo(startOfMonth(subMonths(hojeRef, 2)), endOfMonth(hojeRef)) },
    { label: 'Este ano', on: () => setPeriodo(startOfYear(hojeRef), endOfYear(hojeRef)) },
  ]

  const toggleSetItem = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const abrirNovo = (tipo?: 'entrada' | 'saida') => {
    setEditando(null)
    setForm({ ...emptyForm, tipo: tipo ?? 'saida' })
    setModalOpen(true)
  }

  const abrirEditar = (l: Lancamento) => {
    setEditando(l)
    setForm({
      descricao: l.descricao,
      valor: String(l.valor),
      tipo: l.tipo,
      data: l.data,
      centro_custo_id: l.centro_custo_id ?? '',
      categoria_id: l.categoria_id ?? '',
      conta_bancaria_id: l.conta_bancaria_id ?? '',
      forma_pagamento: l.forma_pagamento ?? 'transferencia',
      conciliado: l.conciliado,
      observacoes: l.observacoes ?? '',
    })
    setModalOpen(true)
  }

  const salvar = async () => {
    if (!form.descricao) { toast.error('Informe a descricao'); return }
    if (!form.valor || parseFloat(form.valor) <= 0) { toast.error('Informe um valor maior que zero'); return }
    if (!form.data) { toast.error('Informe a data'); return }
    setSaving(true)

    const payload = {
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      tipo: form.tipo,
      data: form.data,
      centro_custo_id: form.centro_custo_id || null,
      categoria_id: form.categoria_id || null,
      conta_bancaria_id: form.conta_bancaria_id || null,
      forma_pagamento: form.forma_pagamento,
      conciliado: form.conciliado,
      observacoes: form.observacoes || null,
    }

    const { error } = editando
      ? await supabase.from('lancamentos').update(payload).eq('id', editando.id)
      : await supabase.from('lancamentos').insert(payload)

    setSaving(false)
    if (error) { toast.error(`Erro: ${error.message}`); return }
    toast.success(editando ? 'Lancamento atualizado!' : (form.tipo === 'entrada' ? 'Entrada registrada!' : 'Saida registrada!'))
    setModalOpen(false)
    load()
  }

  const excluir = async (id: string) => {
    if (!confirm('Excluir este lancamento?')) return
    await supabase.from('lancamentos').delete().eq('id', id)
    toast.success('Lancamento excluido')
    load()
  }

  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

  const pdfCell = (l: Lancamento, key: ColKey, saldoAcum: number): string => {
    switch (key) {
      case 'data': return formatDate(l.data)
      case 'descricao': return esc(l.descricao)
      case 'tipo': return `<span style="color:${l.tipo === 'entrada' ? '#16a34a' : '#dc2626'}">${l.tipo === 'entrada' ? 'Entrada' : 'Saida'}</span>`
      case 'valor': return `<span style="font-weight:600;color:${l.tipo === 'entrada' ? '#16a34a' : '#dc2626'}">${l.tipo === 'entrada' ? '+' : '-'}${formatCurrency(Number(l.valor))}</span>`
      case 'saldo': return `<span style="font-weight:600;color:${saldoAcum >= 0 ? '#334155' : '#dc2626'}">${formatCurrency(saldoAcum)}</span>`
      case 'forma': return esc(getFormaPagamentoLabel(l.forma_pagamento))
      case 'conta': return esc((l as any).contas_bancarias?.nome ?? '—')
      case 'categoria': return esc((l as any).categorias?.nome ?? '—')
      case 'centro': return esc((l as any).centros_custo?.nome ?? '—')
      case 'conciliado': return `<span style="color:${l.conciliado ? '#16a34a' : '#64748b'}">${l.conciliado ? 'Sim' : 'Nao'}</span>`
    }
  }

  const tableCell = (l: Lancamento, key: ColKey, saldoAcum: number) => {
    switch (key) {
      case 'data': return <span className="text-slate-600 whitespace-nowrap">{formatDate(l.data)}</span>
      case 'descricao': return (
        <div>
          <p className="font-semibold text-slate-800 leading-tight">{l.descricao}</p>
          {l.observacoes && <p className="text-xs text-slate-400 italic truncate max-w-[220px]">{l.observacoes}</p>}
        </div>
      )
      case 'tipo': return (
        <Badge variant={l.tipo === 'entrada' ? 'success' : 'danger'}>
          {l.tipo === 'entrada' ? '↑ Entrada' : '↓ Saida'}
        </Badge>
      )
      case 'valor': return (
        <span className={`font-bold whitespace-nowrap ${l.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
          {l.tipo === 'entrada' ? '+' : '-'}{formatCurrency(Number(l.valor))}
        </span>
      )
      case 'saldo': return (
        <span className={`font-semibold whitespace-nowrap ${saldoAcum >= 0 ? 'text-slate-700' : 'text-red-600'}`}>
          {formatCurrency(saldoAcum)}
        </span>
      )
      case 'forma': return <span className="text-slate-600 text-xs whitespace-nowrap">{getFormaPagamentoLabel(l.forma_pagamento)}</span>
      case 'conta': return <span className="text-slate-600 text-xs whitespace-nowrap">{(l as any).contas_bancarias?.nome ?? '—'}</span>
      case 'categoria': return <span className="text-slate-600 text-xs">{(l as any).categorias?.nome ?? '—'}</span>
      case 'centro': return <span className="text-slate-600 text-xs">{(l as any).centros_custo?.nome ?? '—'}</span>
      case 'conciliado': return (
        <Badge variant={l.conciliado ? 'success' : 'neutral'}>{l.conciliado ? 'Sim' : 'Nao'}</Badge>
      )
    }
  }

  const exportarPDF = () => {
    const periodoNome = `${formatDate(dataIni)} a ${formatDate(dataFim)}`
    const pdfCols = COLS.filter(c => cols.has(c.key))

    const nomesCentros = centros.filter(c => filtroCentros.has(c.id)).map(c => c.nome)
    const nomesCategorias = categorias.filter(c => filtroCategorias.has(c.id)).map(c => c.nome)

    // Linha do escopo/filtros aplicados, pra quem recebe entender o recorte
    const escopo = [
      filtroConta && `Conta: ${contas.find(c => c.id === filtroConta)?.nome ?? ''}`,
      nomesCentros.length > 0 && `Centros: ${nomesCentros.join(', ')}`,
      nomesCategorias.length > 0 && `Categorias: ${nomesCategorias.join(', ')}`,
      filtroTipo !== 'todos' && `Tipo: ${filtroTipo === 'entrada' ? 'Entradas' : 'Saidas'}`,
      busca && `Busca: "${busca}"`,
    ].filter(Boolean).map(t => esc(t as string)).join(' &nbsp;|&nbsp; ')

    const thHtml = pdfCols.map(c => `<th style="text-align:${c.align}">${c.label}</th>`).join('')
    const linhasHtml = linhas.map(({ l, saldoAcum }) => `<tr>${
      pdfCols.map(c => `<td style="text-align:${c.align}">${pdfCell(l, c.key, saldoAcum)}</td>`).join('')
    }</tr>`).join('')

    const html = `
      <!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"><title>Extrato de Lancamentos – ${periodoNome}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 24px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .sub { color: #64748b; font-size: 11px; margin-bottom: 4px; }
        .escopo { color: #475569; font-size: 10px; margin-bottom: 14px; }
        .resumo { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
        .resumo div { padding: 8px 16px; border-radius: 6px; }
        .ini { background: #f1f5f9; color: #334155; font-weight: 600; }
        .ent { background: #f0fdf4; color: #16a34a; font-weight: 600; }
        .sai { background: #fef2f2; color: #dc2626; font-weight: 600; }
        .fim { background: #eef2ff; color: #4f46e5; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f8fafc; padding: 6px 8px; font-size: 10px;
             text-transform: uppercase; letter-spacing: .05em; color: #64748b;
             border-bottom: 2px solid #e2e8f0; }
        td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
        tfoot td { font-weight: 700; border-top: 2px solid #e2e8f0; background: #f8fafc; }
        .footer { margin-top: 16px; font-size: 10px; color: #94a3b8; }
      </style></head><body>
      <h1>Extrato de Lancamentos</h1>
      <p class="sub">Periodo: ${periodoNome} &bull; Gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      ${escopo ? `<p class="escopo">${escopo}</p>` : ''}
      <div class="resumo">
        <div class="ini">Saldo inicial: ${formatCurrency(saldoInicial)}</div>
        <div class="ent">Entradas: ${formatCurrency(totalEntradas)}</div>
        <div class="sai">Saidas: ${formatCurrency(totalSaidas)}</div>
        <div class="fim">Saldo final: ${formatCurrency(saldoFinal)}</div>
      </div>
      <table>
        <thead><tr>${thHtml}</tr></thead>
        <tbody>${linhasHtml}</tbody>
      </table>
      <p class="footer">Total: ${filtrados.length} lancamento(s)</p>
      </body></html>
    `
    const win = window.open('', '_blank')
    if (!win) { toast.error('Permita popups para exportar PDF'); return }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
  }

  const matchEscopo = (l: { centro_custo_id?: string | null; categoria_id?: string | null; conta_bancaria_id?: string | null }) =>
    (filtroCentros.size === 0 || (!!l.centro_custo_id && filtroCentros.has(l.centro_custo_id))) &&
    (filtroCategorias.size === 0 || (!!l.categoria_id && filtroCategorias.has(l.categoria_id))) &&
    (!filtroConta || l.conta_bancaria_id === filtroConta)

  const filtrados = lancamentos.filter(l => {
    const matchBusca = l.descricao.toLowerCase().includes(busca.toLowerCase())
    const matchTipo = filtroTipo === 'todos' || l.tipo === filtroTipo
    return matchBusca && matchTipo && matchEscopo(l)
  })

  const totalEntradas = filtrados.filter(l => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0)
  const totalSaidas   = filtrados.filter(l => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0)
  const saldo         = totalEntradas - totalSaidas

  // Saldo inicial do mes = saldo inicial das contas (so quando nao ha filtro por
  // centro/categoria, pois saldo_inicial e a nivel de conta) + movimentacoes
  // anteriores ao mes que batem com o escopo filtrado.
  const saldoInicialContas = (filtroCentros.size === 0 && filtroCategorias.size === 0)
    ? contas
        .filter(c => !filtroConta || c.id === filtroConta)
        .reduce((s, c) => s + Number(c.saldo_inicial), 0)
    : 0
  const priorDelta = priorLancs
    .filter(matchEscopo)
    .reduce((s, l) => s + (l.tipo === 'entrada' ? Number(l.valor) : -Number(l.valor)), 0)
  const saldoInicial = saldoInicialContas + priorDelta
  const saldoFinal   = saldoInicial + saldo

  // Saldo corrido linha a linha (igual extrato bancario): sempre calculado em
  // ordem cronologica crescente a partir do saldo inicial. A ordem de exibicao
  // so inverte a lista depois — o saldo de cada linha continua correto.
  const linhasAsc = (() => {
    const asc = [...filtrados].sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1
      return (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1
    })
    let acumulado = saldoInicial
    return asc.map(l => {
      acumulado += l.tipo === 'entrada' ? Number(l.valor) : -Number(l.valor)
      return { l, saldoAcum: acumulado }
    })
  })()
  const linhas = ordem === 'asc' ? linhasAsc : [...linhasAsc].reverse()

  const categoriasForm = form.tipo === 'entrada'
    ? categorias.filter(c => c.tipo === 'entrada')
    : categorias.filter(c => c.tipo === 'saida')

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Lancamentos</h1>
          <p className="text-sm text-slate-500 mt-0.5">Entradas e saidas de caixa</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="secondary" onClick={exportarPDF} title="Exportar PDF">
            <FileDown size={15} /> <span className="hidden sm:inline">Exportar PDF</span>
          </Button>
          <Button variant="success" onClick={() => abrirNovo('entrada')}>
            <TrendingUp size={16} /> Entrada
          </Button>
          <Button variant="danger" onClick={() => abrirNovo('saida')}>
            <TrendingDown size={16} /> Saida
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="py-3 md:py-4 px-3 md:px-6">
            <p className="text-xs text-slate-500">Saldo inicial</p>
            <p className={`text-base md:text-xl font-bold ${saldoInicial >= 0 ? 'text-slate-700' : 'text-red-600'}`}>{formatCurrency(saldoInicial)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-3 md:py-4 px-3 md:px-6">
            <p className="text-xs text-slate-500">Entradas</p>
            <p className="text-base md:text-xl font-bold text-green-600">{formatCurrency(totalEntradas)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-3 md:py-4 px-3 md:px-6">
            <p className="text-xs text-slate-500">Saidas</p>
            <p className="text-base md:text-xl font-bold text-red-600">{formatCurrency(totalSaidas)}</p>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${saldoFinal >= 0 ? 'border-l-indigo-500' : 'border-l-orange-500'}`}>
          <CardContent className="py-3 md:py-4 px-3 md:px-6">
            <p className="text-xs text-slate-500">Saldo final</p>
            <p className={`text-base md:text-xl font-bold ${saldoFinal >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>{formatCurrency(saldoFinal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-3 md:py-4 space-y-2.5">
          {/* Periodo (De/Ate) + atalhos */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-slate-400 font-medium">Periodo:</span>
            <input
              type="date"
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              value={dataIni}
              onChange={e => setDataIni(e.target.value)}
            />
            <span className="text-slate-400 text-xs">ate</span>
            <input
              type="date"
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              value={dataFim}
              onChange={e => setDataFim(e.target.value)}
            />
            <div className="flex gap-1 flex-wrap">
              {presets.map(p => (
                <button key={p.label} onClick={p.on}
                  className="px-2.5 py-2 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex-1 min-w-36 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="Buscar descricao..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {(['todos', 'entrada', 'saida'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFiltroTipo(t)}
                  className={`px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${
                    filtroTipo === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t === 'todos' ? 'Todos' : t === 'entrada' ? 'Entradas' : 'Saidas'}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={load}><RefreshCw size={14} /></Button>
          </div>

          {/* Escopo do extrato: conta, centro de custo, categoria + colunas */}
          <div className="flex gap-2 flex-wrap items-center">
            <select
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 max-w-[48%] sm:max-w-none"
              value={filtroConta}
              onChange={e => setFiltroConta(e.target.value)}
            >
              <option value="">Todas as contas</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            {/* Centros de custo (multi) */}
            <div className="relative">
              <button
                onClick={() => setCentroMenuOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all ${filtroCentros.size > 0 ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
              >
                {filtroCentros.size > 0 ? `${filtroCentros.size} centro(s)` : 'Todos os centros'}
                <Columns3 size={13} className="opacity-60" />
              </button>
              {centroMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCentroMenuOpen(false)} />
                  <div className="absolute left-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 w-56 max-h-72 overflow-y-auto">
                    <div className="flex items-center justify-between px-2 py-1">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">Centros de custo</span>
                      {filtroCentros.size > 0 && <button onClick={() => setFiltroCentros(new Set())} className="text-[11px] text-indigo-500 hover:underline">Limpar</button>}
                    </div>
                    {centros.map(c => {
                      const on = filtroCentros.has(c.id)
                      return (
                        <button key={c.id} onClick={() => toggleSetItem(setFiltroCentros, c.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors text-left">
                          <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                            {on && <Check size={11} className="text-white" />}
                          </span>
                          <span className="truncate">{c.nome}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Categorias (multi) */}
            <div className="relative">
              <button
                onClick={() => setCategoriaMenuOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all ${filtroCategorias.size > 0 ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
              >
                {filtroCategorias.size > 0 ? `${filtroCategorias.size} categoria(s)` : 'Todas as categorias'}
                <Columns3 size={13} className="opacity-60" />
              </button>
              {categoriaMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCategoriaMenuOpen(false)} />
                  <div className="absolute left-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 w-56 max-h-72 overflow-y-auto">
                    <div className="flex items-center justify-between px-2 py-1">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">Categorias</span>
                      {filtroCategorias.size > 0 && <button onClick={() => setFiltroCategorias(new Set())} className="text-[11px] text-indigo-500 hover:underline">Limpar</button>}
                    </div>
                    {categorias.map(c => {
                      const on = filtroCategorias.has(c.id)
                      return (
                        <button key={c.id} onClick={() => toggleSetItem(setFiltroCategorias, c.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors text-left">
                          <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                            {on && <Check size={11} className="text-white" />}
                          </span>
                          <span className="truncate">{c.nome}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {(filtroConta || filtroCentros.size > 0 || filtroCategorias.size > 0) && (
              <button
                onClick={() => { setFiltroConta(''); setFiltroCentros(new Set()); setFiltroCategorias(new Set()) }}
                className="px-2.5 py-2 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100 transition-all"
              >
                Limpar
              </button>
            )}
            <button
              onClick={() => setOrdem(o => (o === 'asc' ? 'desc' : 'asc'))}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all ml-auto"
              title="Inverter a ordem do extrato"
            >
              <ArrowUpDown size={14} />
              {ordem === 'asc' ? 'Mais antigo primeiro' : 'Mais recente primeiro'}
            </button>
            <div className="relative">
              <button
                onClick={() => setColMenuOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
              >
                <Columns3 size={14} /> Colunas
              </button>
              {colMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setColMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 w-52">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase px-2 py-1">Colunas do extrato</p>
                    {COLS.map(c => {
                      const on = cols.has(c.key)
                      return (
                        <button
                          key={c.key}
                          onClick={() => setCols(prev => {
                            const next = new Set(prev)
                            if (next.has(c.key)) { if (next.size > 1) next.delete(c.key) }
                            else next.add(c.key)
                            return next
                          })}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                            {on && <Check size={11} className="text-white" />}
                          </span>
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        {/* Desktop */}
        <TableWrapper>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {COLS.filter(c => cols.has(c.key)).map(c => (
                  <th key={c.key} className={`px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
                ))}
                <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={cols.size + 1} className="text-center py-12 text-slate-400">Carregando...</td></tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={cols.size + 1} className="text-center py-12">
                    <ArrowUpDown className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium">Nenhum lancamento no periodo</p>
                    <p className="text-slate-400 text-xs mt-1">Use os botoes Entrada ou Saida para registrar</p>
                  </td>
                </tr>
              ) : linhas.map(({ l, saldoAcum }) => (
                <tr key={l.id} className="hover:bg-slate-50/80 transition-colors group">
                  {COLS.filter(c => cols.has(c.key)).map(c => (
                    <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}>{tableCell(l, c.key, saldoAcum)}</td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => abrirEditar(l)}
                        className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => excluir(l.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>

        {/* Mobile */}
        <CardList>
          {loading ? (
            <MobileCard><p className="text-center text-slate-400 py-8">Carregando...</p></MobileCard>
          ) : filtrados.length === 0 ? (
            <MobileCard><p className="text-center text-slate-400 py-8">Nenhum lancamento encontrado</p></MobileCard>
          ) : linhas.map(({ l, saldoAcum }) => (
            <MobileCard key={l.id}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{l.descricao}</p>
                  {(l as any).centros_custo && (
                    <p className="text-xs text-slate-400">{(l as any).centros_custo.nome}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge variant={l.tipo === 'entrada' ? 'success' : 'danger'}>
                    {l.tipo === 'entrada' ? '↑' : '↓'}
                  </Badge>
                  <button onClick={() => abrirEditar(l)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => excluir(l.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs text-slate-400">{formatDate(l.data)} &middot; {getFormaPagamentoLabel(l.forma_pagamento)}</p>
                  <p className="text-xs text-slate-400">{(l as any).categorias?.nome ?? 'Sem categoria'}</p>
                  {(l as any).contas_bancarias?.nome && (
                    <p className="text-xs text-indigo-500">{(l as any).contas_bancarias.nome}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className={`text-base font-bold ${l.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                    {l.tipo === 'entrada' ? '+' : '-'}{formatCurrency(Number(l.valor))}
                  </p>
                  {cols.has('saldo') && (
                    <p className={`text-[11px] font-semibold ${saldoAcum >= 0 ? 'text-slate-500' : 'text-red-500'}`}>
                      Saldo: {formatCurrency(saldoAcum)}
                    </p>
                  )}
                  <Badge variant={l.conciliado ? 'success' : 'neutral'} className="text-[10px]">
                    {l.conciliado ? 'Conciliado' : 'Nao concil.'}
                  </Badge>
                </div>
              </div>
            </MobileCard>
          ))}
        </CardList>

        {filtrados.length > 0 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{filtrados.length} registro(s)</span>
            <span className="font-medium">
              Saldo do periodo: <span className={saldo >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{formatCurrency(saldo)}</span>
            </span>
          </div>
        )}
      </Card>

      {/* Modal criar / editar */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? 'Editar Lancamento' : 'Novo Lancamento'}
        size="md"
      >
        <div className="space-y-4">
          {/* Tipo: toggle só aparece na criação — editar mantém o tipo */}
          {!editando && (
            <div className="flex bg-slate-100 rounded-xl p-1">
              <button
                onClick={() => setForm(f => ({ ...f, tipo: 'entrada', categoria_id: '' }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  form.tipo === 'entrada' ? 'bg-green-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                <TrendingUp size={14} /> Entrada
              </button>
              <button
                onClick={() => setForm(f => ({ ...f, tipo: 'saida', categoria_id: '' }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  form.tipo === 'saida' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                <TrendingDown size={14} /> Saida
              </button>
            </div>
          )}

          {editando && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${
              form.tipo === 'entrada' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {form.tipo === 'entrada' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {form.tipo === 'entrada' ? 'Entrada de caixa' : 'Saida de caixa'}
            </div>
          )}

          <Input
            label="Descricao *"
            placeholder="Ex: Venda do dia, Pagamento fornecedor..."
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <CurrencyInput label="Valor *" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
            <Input label="Data *" type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Forma de Pagamento" value={form.forma_pagamento} onChange={e => setForm(f => ({ ...f, forma_pagamento: e.target.value }))}>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="cartao_debito">Cartao Debito</option>
              <option value="cartao_credito">Cartao Credito</option>
              <option value="transferencia">Transferencia</option>
              <option value="boleto">Boleto</option>
              <option value="cheque">Cheque</option>
            </Select>
            <Select label="Conta Bancaria" value={form.conta_bancaria_id} onChange={e => setForm(f => ({ ...f, conta_bancaria_id: e.target.value }))}>
              <option value="">Sem conta especifica</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Centro de Custo" value={form.centro_custo_id} onChange={e => setForm(f => ({ ...f, centro_custo_id: e.target.value }))}>
              <option value="">Sem centro de custo</option>
              {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
            <Select label="Categoria" value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
              <option value="">Sem categoria</option>
              {categoriasForm.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.conciliado}
                onChange={e => setForm(f => ({ ...f, conciliado: e.target.checked }))}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-sm text-slate-600">Ja conciliado com extrato bancario</span>
            </label>
          </div>

          <Input
            label="Observacoes"
            placeholder="Referencia, nota fiscal, detalhes..."
            value={form.observacoes}
            onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
          />
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? 'Salvando...' : editando ? 'Salvar Alteracoes' : 'Registrar Lancamento'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
