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
import { fetchAllRows } from '@/lib/fetch-all'
import { useEmpresa } from '@/lib/empresa'

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
  const [filtroContas, setFiltroContas] = useState<Set<string>>(new Set())
  const [contaMenuOpen, setContaMenuOpen] = useState(false)
  // Periodo (De/Ate) — padrao: mes atual
  const [dataIni, setDataIni] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dataFim, setDataFim] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [centroMenuOpen, setCentroMenuOpen] = useState(false)
  const [categoriaMenuOpen, setCategoriaMenuOpen] = useState(false)
  const [cols, setCols] = useState<Set<ColKey>>(new Set(DEFAULT_COLS))
  // Extrato: do inicio do mes para o fim (crescente), como no extrato bancario
  const [ordem, setOrdem] = useState<'asc' | 'desc'>('asc')
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [priorLancs, setPriorLancs] = useState<Pick<Lancamento, 'valor' | 'tipo' | 'conta_bancaria_id' | 'centro_custo_id' | 'categoria_id'>[]>([])

  const { empresaId, empresa, loading: empLoading } = useEmpresa()

  const load = useCallback(async () => {
    if (empLoading) return // espera saber qual empresa esta ativa (evita misturar empresas)
    setLoading(true)
    const ini = dataIni
    const fim = dataFim
    const escopo = <T,>(q: T): T => (empresaId ? (q as any).eq('empresa_id', empresaId) : q)
    // Paginado: garante o saldo correto mesmo com +1000 lancamentos no historico
    const [l, cc, cat, cb, prior] = await Promise.all([
      fetchAllRows<Lancamento>(() => escopo(supabase.from('lancamentos')
        .select('*, centros_custo(*), categorias(*), contas_bancarias(*)')
        .gte('data', ini).lte('data', fim).order('data', { ascending: false }))),
      escopo(supabase.from('centros_custo').select('*').eq('ativo', true).order('nome')),
      escopo(supabase.from('categorias').select('*').order('tipo').order('nome')),
      escopo(supabase.from('contas_bancarias').select('*').eq('ativo', true).order('nome')),
      fetchAllRows<typeof priorLancs[number]>(() => escopo(supabase.from('lancamentos')
        .select('valor, tipo, conta_bancaria_id, centro_custo_id, categoria_id')
        .lt('data', ini))),
    ])
    setLancamentos(l)
    setCentros(cc.data ?? [])
    setCategorias(cat.data ?? [])
    setContas((cb.data ?? []) as ContaBancaria[])
    setPriorLancs(prior)
    setLoading(false)
  }, [dataIni, dataFim, empresaId, empLoading])

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
      : await supabase.from('lancamentos').insert({ ...payload, ...(empresaId ? { empresa_id: empresaId } : {}) })

    setSaving(false)
    if (error) { toast.error(`Erro: ${error.message}`); return }
    toast.success(editando ? 'Lancamento atualizado!' : (form.tipo === 'entrada' ? 'Entrada registrada!' : 'Saida registrada!'))
    setModalOpen(false)
    load()
  }

  const excluir = async (l: Lancamento) => {
    const sinal = l.tipo === 'entrada' ? '+' : '-'
    if (!confirm(`Excluir este lancamento?\n\n${l.descricao}\n${sinal}${formatCurrency(Number(l.valor))} · ${formatDate(l.data)}`)) return
    const { error } = await supabase.from('lancamentos').delete().eq('id', l.id)
    if (error) { toast.error('Erro ao excluir: ' + error.message); return }
    setSelecionados(prev => { const n = new Set(prev); n.delete(l.id); return n })
    toast.success('Lancamento excluido')
    load()
  }

  const toggleSelecionado = (id: string) => {
    setSelecionados(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const toggleTodosVisiveis = () => {
    const ids = filtrados.map(l => l.id)
    const todosMarcados = ids.length > 0 && ids.every(id => selecionados.has(id))
    setSelecionados(todosMarcados ? new Set() : new Set(ids))
  }

  const excluirSelecionados = async () => {
    if (selecionados.size === 0) return
    const ids = Array.from(selecionados)
    const itens = lancamentos.filter(l => selecionados.has(l.id))
    const previa = itens.slice(0, 8).map(l => `• ${l.descricao} (${l.tipo === 'entrada' ? '+' : '-'}${formatCurrency(Number(l.valor))})`).join('\n')
    const extra = itens.length > 8 ? `\n... e mais ${itens.length - 8}` : ''
    if (!confirm(`Excluir ${ids.length} lancamento(s)?\n\n${previa}${extra}\n\nEsta acao nao pode ser desfeita.`)) return
    const { error } = await supabase.from('lancamentos').delete().in('id', ids)
    if (error) { toast.error('Erro ao excluir: ' + error.message); return }
    toast.success(`${ids.length} lancamento(s) excluido(s)`)
    setSelecionados(new Set())
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
    if (filtrados.length === 0) { toast.error('Nenhum lancamento para exportar com os filtros atuais'); return }
    const periodoNome = `${formatDate(dataIni)} a ${formatDate(dataFim)}`
    const geradoEm = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const nomeEmpresa = esc(empresa?.nome ?? 'Sistema Financeiro Fatima')
    const pdfCols = COLS.filter(c => cols.has(c.key))

    const nomesCentros = centros.filter(c => filtroCentros.has(c.id)).map(c => c.nome)
    const nomesCategorias = categorias.filter(c => filtroCategorias.has(c.id)).map(c => c.nome)
    const escopo = [
      filtroContas.size > 0 ? `Contas: ${contas.filter(c => filtroContas.has(c.id)).map(c => c.nome).join(', ')}` : '',
      nomesCentros.length > 0 ? `Centros: ${nomesCentros.join(', ')}` : '',
      nomesCategorias.length > 0 ? `Categorias: ${nomesCategorias.join(', ')}` : '',
      filtroTipo !== 'todos' ? `Tipo: ${filtroTipo === 'entrada' ? 'Entradas' : 'Saidas'}` : '',
      busca ? `Busca: "${busca}"` : '',
    ].filter(Boolean).map(t => esc(t as string)).join(' &nbsp;•&nbsp; ') || 'Todos os lancamentos'

    // Quebra: saidas por categoria (barras)
    const catMap = new Map<string, number>()
    for (const l of filtrados) {
      if (l.tipo !== 'saida') continue
      const nome = (l as any).categorias?.nome ?? 'Sem categoria'
      catMap.set(nome, (catMap.get(nome) ?? 0) + Number(l.valor))
    }
    const porCat = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])
    const maxCat = Math.max(...porCat.map(c => c[1]), 1)
    const linhasCat = porCat.map(([nome, valor]) => {
      const pct = totalSaidas > 0 ? (valor / totalSaidas) * 100 : 0
      return `<tr><td>${esc(nome)}</td><td class="num">${formatCurrency(valor)}</td><td class="num">${pct.toFixed(1)}%</td><td style="width:38%"><div class="bar"><span style="width:${(valor / maxCat) * 100}%"></span></div></td></tr>`
    }).join('')

    const thHtml = pdfCols.map(c => `<th style="text-align:${c.align}">${c.label}</th>`).join('')
    const linhasHtml = linhas.map(({ l, saldoAcum }) => `<tr>${
      pdfCols.map(c => `<td style="text-align:${c.align}">${pdfCell(l, c.key, saldoAcum)}</td>`).join('')
    }</tr>`).join('')

    const resultado = totalEntradas - totalSaidas

    const html = `
      <!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"><title>Extrato de Lancamentos — ${nomeEmpresa}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #0f172a; margin: 0; padding: 28px 32px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .head { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:16px; border-bottom:3px solid #4f46e5; margin-bottom:18px; }
        .brand { display:flex; align-items:center; gap:10px; }
        .logo { width:38px; height:38px; border-radius:10px; background:linear-gradient(135deg,#6366f1,#7c3aed); color:#fff; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:800; }
        .brand h2 { margin:0; font-size:13px; color:#4f46e5; letter-spacing:.02em; }
        .brand p { margin:2px 0 0; font-size:10px; color:#64748b; }
        .head .rt { text-align:right; }
        .head .rt h1 { margin:0; font-size:20px; }
        .head .rt p { margin:3px 0 0; font-size:10px; color:#64748b; }
        .scope { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-size:10px; color:#475569; margin-bottom:16px; }
        .kpis { display:flex; gap:10px; margin-bottom:20px; }
        .kpi { flex:1; border:1px solid #e2e8f0; border-radius:10px; padding:11px 13px; }
        .kpi .lbl { font-size:9px; text-transform:uppercase; letter-spacing:.05em; color:#64748b; font-weight:700; }
        .kpi .val { font-size:15px; font-weight:800; margin-top:3px; }
        .kpi.k1 { border-left:4px solid #94a3b8; } .kpi.k1 .val { color:#334155; }
        .kpi.k2 { border-left:4px solid #22c55e; } .kpi.k2 .val { color:#15803d; }
        .kpi.k3 { border-left:4px solid #ef4444; } .kpi.k3 .val { color:#b91c1c; }
        .kpi.k4 { border-left:4px solid #6366f1; background:#eef2ff; } .kpi.k4 .val { color:#4338ca; }
        h3 { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#334155; margin:22px 0 8px; padding-bottom:5px; border-bottom:1px solid #e2e8f0; }
        table { width:100%; border-collapse:collapse; }
        th { text-align:left; padding:7px 8px; font-size:9px; text-transform:uppercase; letter-spacing:.04em; color:#64748b; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
        td { padding:7px 8px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
        tbody tr:nth-child(even) td { background:#fbfcfe; }
        .num { text-align:right; font-weight:600; white-space:nowrap; }
        .bar { background:#eef2ff; border-radius:6px; height:10px; overflow:hidden; }
        .bar span { display:block; height:10px; background:linear-gradient(90deg,#f43f5e,#fb7185); border-radius:6px; }
        tfoot td { font-weight:800; border-top:2px solid #e2e8f0; background:#f8fafc; }
        .foot { margin-top:22px; padding-top:10px; border-top:1px solid #e2e8f0; font-size:9px; color:#94a3b8; display:flex; justify-content:space-between; }
        @media print { body { padding:0; } }
      </style></head><body>
      <div class="head">
        <div class="brand">
          <div class="logo">${(nomeEmpresa[0] ?? 'F').toUpperCase()}</div>
          <div><h2>${nomeEmpresa}</h2><p>Gestao Financeira</p></div>
        </div>
        <div class="rt">
          <h1>Extrato de Lancamentos</h1>
          <p>Periodo: ${periodoNome} • Gerado em ${geradoEm}</p>
        </div>
      </div>

      <div class="scope">${escopo} &nbsp;•&nbsp; ${filtrados.length} lancamento(s)</div>

      <div class="kpis">
        <div class="kpi k1"><div class="lbl">Saldo inicial</div><div class="val">${formatCurrency(saldoInicial)}</div></div>
        <div class="kpi k2"><div class="lbl">Entradas</div><div class="val">+${formatCurrency(totalEntradas)}</div></div>
        <div class="kpi k3"><div class="lbl">Saidas</div><div class="val">-${formatCurrency(totalSaidas)}</div></div>
        <div class="kpi k4"><div class="lbl">Saldo final</div><div class="val">${formatCurrency(saldoFinal)}</div></div>
      </div>

      ${porCat.length > 0 ? `
      <h3>Saidas por Categoria</h3>
      <table>
        <thead><tr><th>Categoria</th><th class="num">Valor</th><th class="num">% Saidas</th><th>Participacao</th></tr></thead>
        <tbody>${linhasCat}</tbody>
        <tfoot><tr><td>Total de saidas</td><td class="num">${formatCurrency(totalSaidas)}</td><td class="num">100%</td><td></td></tr></tfoot>
      </table>` : ''}

      <h3>Extrato Detalhado</h3>
      <table>
        <thead><tr>${thHtml}</tr></thead>
        <tbody>${linhasHtml}</tbody>
        <tfoot><tr>
          <td colspan="${Math.max(1, pdfCols.length - 1)}">Resultado do periodo (${filtrados.length} lancamentos)</td>
          <td class="num" style="color:${resultado >= 0 ? '#15803d' : '#b91c1c'}">${resultado >= 0 ? '+' : ''}${formatCurrency(resultado)}</td>
        </tr></tfoot>
      </table>

      <div class="foot">
        <span>${nomeEmpresa} • Sistema Financeiro Fatima</span>
        <span>Documento gerado automaticamente • ${geradoEm}</span>
      </div>
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
    (filtroContas.size === 0 || (!!l.conta_bancaria_id && filtroContas.has(l.conta_bancaria_id)))

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
        .filter(c => filtroContas.size === 0 || filtroContas.has(c.id))
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
            {/* Contas (multi) */}
            <div className="relative">
              <button
                onClick={() => setContaMenuOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all ${filtroContas.size > 0 ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
              >
                {filtroContas.size > 0 ? `${filtroContas.size} conta(s)` : 'Todas as contas'}
                <Columns3 size={13} className="opacity-60" />
              </button>
              {contaMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setContaMenuOpen(false)} />
                  <div className="absolute left-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 w-56 max-h-72 overflow-y-auto">
                    <div className="flex items-center justify-between px-2 py-1">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">Contas bancarias</span>
                      {filtroContas.size > 0 && <button onClick={() => setFiltroContas(new Set())} className="text-[11px] text-indigo-500 hover:underline">Limpar</button>}
                    </div>
                    {contas.map(c => {
                      const on = filtroContas.has(c.id)
                      return (
                        <button key={c.id} onClick={() => toggleSetItem(setFiltroContas, c.id)}
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

            {(filtroContas.size > 0 || filtroCentros.size > 0 || filtroCategorias.size > 0) && (
              <button
                onClick={() => { setFiltroContas(new Set()); setFiltroCentros(new Set()); setFiltroCategorias(new Set()) }}
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

      {/* Barra de acao em massa */}
      {selecionados.size > 0 && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-red-700">{selecionados.size} lancamento(s) selecionado(s)</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelecionados(new Set())}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
            >
              Limpar selecao
            </button>
            <button
              onClick={excluirSelecionados}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              <Trash2 size={13} /> Excluir selecionados
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <Card>
        {/* Desktop */}
        <TableWrapper>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-4 w-10">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-indigo-600 cursor-pointer align-middle"
                    checked={filtrados.length > 0 && filtrados.every(l => selecionados.has(l.id))}
                    onChange={toggleTodosVisiveis}
                    title="Selecionar todos"
                  />
                </th>
                {COLS.filter(c => cols.has(c.key)).map(c => (
                  <th key={c.key} className={`px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
                ))}
                <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={cols.size + 2} className="text-center py-12 text-slate-400">Carregando...</td></tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={cols.size + 2} className="text-center py-12">
                    <ArrowUpDown className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium">Nenhum lancamento no periodo</p>
                    <p className="text-slate-400 text-xs mt-1">Use os botoes Entrada ou Saida para registrar</p>
                  </td>
                </tr>
              ) : linhas.map(({ l, saldoAcum }) => (
                <tr key={l.id} className={`hover:bg-slate-50/80 transition-colors group ${selecionados.has(l.id) ? 'bg-indigo-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-indigo-600 cursor-pointer align-middle"
                      checked={selecionados.has(l.id)}
                      onChange={() => toggleSelecionado(l.id)}
                    />
                  </td>
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
                        onClick={() => excluir(l)}
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
            <MobileCard key={l.id} className={selecionados.has(l.id) ? 'bg-indigo-50/40' : ''}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-indigo-600 cursor-pointer mt-0.5 flex-shrink-0"
                    checked={selecionados.has(l.id)}
                    onChange={() => toggleSelecionado(l.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{l.descricao}</p>
                    {(l as any).centros_custo && (
                      <p className="text-xs text-slate-400">{(l as any).centros_custo.nome}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge variant={l.tipo === 'entrada' ? 'success' : 'danger'}>
                    {l.tipo === 'entrada' ? '↑' : '↓'}
                  </Badge>
                  <button onClick={() => abrirEditar(l)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => excluir(l)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400">
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
