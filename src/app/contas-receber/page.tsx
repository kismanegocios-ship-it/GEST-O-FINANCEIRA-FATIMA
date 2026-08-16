'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
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
  Plus, Search, CheckCircle, Trash2, Pencil, DollarSign, RotateCcw, FileDown,
} from 'lucide-react'
import type { ContaReceber, CentroCusto, Categoria, ContaBancaria, Anexo } from '@/lib/types'
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns'
import { fetchAllRows } from '@/lib/fetch-all'
import { useEmpresa } from '@/lib/empresa'
import { AnexosManager } from '@/components/anexos'
import { subirAnexos } from '@/lib/anexos'
import { Paperclip } from 'lucide-react'

const STATUS_OPTIONS = ['todos', 'pendente', 'recebido', 'vencido', 'cancelado']
const statusVariant: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = {
  pendente: 'warning', recebido: 'success', vencido: 'danger', cancelado: 'neutral',
}
const statusLabel: Record<string, string> = {
  pendente: 'A Receber', recebido: 'Recebido', vencido: 'Vencido', cancelado: 'Cancelado',
}

interface FormData {
  descricao: string; valor: string; data_vencimento: string
  centro_custo_id: string; categoria_id: string; observacoes: string
  parcelado: boolean; num_parcelas: string
}
const emptyForm: FormData = { descricao: '', valor: '', data_vencimento: '', centro_custo_id: '', categoria_id: '', observacoes: '', parcelado: false, num_parcelas: '2' }

export default function ContasReceberPage() {
  const [itens, setItens] = useState<ContaReceber[]>([])
  const [centros, setCentros] = useState<CentroCusto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<ContaReceber | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroCentro, setFiltroCentro] = useState('')
  const [perIni, setPerIni] = useState('')
  const [perFim, setPerFim] = useState('')
  const { empresaId, empresa, loading: empLoading } = useEmpresa()
  const [modalAnexos, setModalAnexos] = useState<Anexo[]>([])
  const [stagedAnexos, setStagedAnexos] = useState<File[]>([])

  // Modal de baixa (receber)
  const [modalReceber, setModalReceber] = useState<ContaReceber | null>(null)
  const [dataRecebimento, setDataRecebimento] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [recContaId, setRecContaId] = useState('')
  const [recForma, setRecForma] = useState('pix')

  const load = useCallback(async () => {
    if (empLoading) return // espera saber qual empresa esta ativa (evita misturar empresas)
    setLoading(true)
    const esc = <T,>(q: T): T => (empresaId ? (q as any).eq('empresa_id', empresaId) : q)
    const hoje = format(new Date(), 'yyyy-MM-dd')
    await esc(supabase.from('contas_receber').update({ status: 'vencido' }).eq('status', 'pendente').lt('data_vencimento', hoje))

    const [d, cc, cat, cb] = await Promise.all([
      fetchAllRows<ContaReceber>(() => esc(supabase.from('contas_receber').select('*, centros_custo(*), categorias(*)').order('data_vencimento'))),
      esc(supabase.from('centros_custo').select('*').eq('ativo', true).order('nome')),
      esc(supabase.from('categorias').select('*').eq('tipo', 'entrada').order('nome')),
      esc(supabase.from('contas_bancarias').select('*').eq('ativo', true).order('nome')),
    ])
    setItens(d)
    setCentros((cc as any).data ?? [])
    setCategorias((cat as any).data ?? [])
    setContas(((cb as any).data ?? []) as ContaBancaria[])
    setLoading(false)
  }, [empresaId, empLoading])

  useEffect(() => { load() }, [load])

  const setPeriodo = (ini: Date, fim: Date) => { setPerIni(format(ini, 'yyyy-MM-dd')); setPerFim(format(fim, 'yyyy-MM-dd')) }
  const hojeRef = new Date()
  const presets = [
    { label: 'Este mes', on: () => setPeriodo(startOfMonth(hojeRef), endOfMonth(hojeRef)) },
    { label: 'Mes passado', on: () => { const m = subMonths(hojeRef, 1); setPeriodo(startOfMonth(m), endOfMonth(m)) } },
    { label: 'Proximos 3 meses', on: () => setPeriodo(startOfMonth(hojeRef), endOfMonth(addMonthsSafe(hojeRef, 2))) },
    { label: 'Este ano', on: () => setPeriodo(startOfYear(hojeRef), endOfYear(hojeRef)) },
  ]

  const abrirNovo = () => { setEditando(null); setForm(emptyForm); setModalAnexos([]); setStagedAnexos([]); setModalOpen(true) }
  const abrirEditar = (c: ContaReceber) => {
    setEditando(c)
    setModalAnexos(c.anexos ?? [])
    setStagedAnexos([])
    setForm({
      descricao: c.descricao, valor: String(c.valor), data_vencimento: c.data_vencimento,
      centro_custo_id: c.centro_custo_id ?? '', categoria_id: c.categoria_id ?? '', observacoes: c.observacoes ?? '',
      parcelado: false, num_parcelas: '2',
    })
    setModalOpen(true)
  }

  const salvar = async () => {
    if (!form.descricao || !form.valor || !form.data_vencimento) { toast.error('Preencha os campos obrigatorios'); return }
    setSaving(true)

    // ── Modo parcelas: cria N recebimentos mensais (ex: parcelas de um contrato) ──
    if (form.parcelado && !editando) {
      const n = Math.max(2, Math.min(120, parseInt(form.num_parcelas) || 2))
      const base = new Date(form.data_vencimento + 'T12:00:00')
      const registros = Array.from({ length: n }, (_, i) => ({
        descricao: `${form.descricao} (${i + 1}/${n})`,
        valor: parseFloat(form.valor),
        data_vencimento: format(addMonthsSafe(base, i), 'yyyy-MM-dd'),
        status: 'pendente',
        centro_custo_id: form.centro_custo_id || null,
        categoria_id: form.categoria_id || null,
        observacoes: form.observacoes || null,
        ...(empresaId ? { empresa_id: empresaId } : {}),
      }))
      const { error } = await supabase.from('contas_receber').insert(registros)
      setSaving(false)
      if (error) { toast.error('Erro ao criar parcelas: ' + error.message); return }
      toast.success(`${n} parcelas criadas! Total ${formatCurrency(parseFloat(form.valor) * n)}`)
      setModalOpen(false); setForm(emptyForm); setStagedAnexos([]); load()
      return
    }

    const payload = {
      descricao: form.descricao, valor: parseFloat(form.valor), data_vencimento: form.data_vencimento,
      centro_custo_id: form.centro_custo_id || null, categoria_id: form.categoria_id || null,
      observacoes: form.observacoes || null,
      ...(empresaId && !editando ? { empresa_id: empresaId } : {}),
    }
    // Registro novo com anexos escolhidos → insere pegando o id pra enviar os arquivos
    if (!editando && stagedAnexos.length > 0) {
      const { data: novo, error } = await supabase.from('contas_receber').insert(payload).select('id').single()
      if (error || !novo) { setSaving(false); toast.error('Erro ao salvar: ' + (error?.message ?? 'sem retorno')); return }
      try { await subirAnexos('contas_receber', (novo as { id: string }).id, [], stagedAnexos) } catch (e) { toast.error('Salvo, mas erro nos anexos: ' + (e as Error).message) }
      setSaving(false)
      toast.success('Conta a receber cadastrada!')
      setModalOpen(false); setForm(emptyForm); setStagedAnexos([]); load()
      return
    }
    const { error } = editando
      ? await supabase.from('contas_receber').update(payload).eq('id', editando.id)
      : await supabase.from('contas_receber').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success(editando ? 'Atualizado!' : 'Conta a receber cadastrada!')
    setModalOpen(false); setForm(emptyForm); load()
  }

  const registrarRecebimento = async () => {
    if (!modalReceber) return
    setSaving(true)
    const { error } = await supabase.from('contas_receber')
      .update({ status: 'recebido', data_recebimento: dataRecebimento }).eq('id', modalReceber.id)
    if (error) { setSaving(false); toast.error('Erro: ' + error.message); return }
    await supabase.from('lancamentos').insert({
      descricao: `Recebimento: ${modalReceber.descricao}`,
      valor: Number(modalReceber.valor),
      tipo: 'entrada',
      data: dataRecebimento,
      conta_receber_id: modalReceber.id,
      centro_custo_id: modalReceber.centro_custo_id ?? null,
      categoria_id: modalReceber.categoria_id ?? null,
      forma_pagamento: recForma,
      conta_bancaria_id: recContaId || null,
      conciliado: !!recContaId,
      ...(empresaId ? { empresa_id: empresaId } : {}),
    })
    setSaving(false)
    toast.success(recContaId ? 'Recebimento registrado e ja conciliado no caixa!' : 'Recebimento registrado! Entrada lancada no caixa.')
    setModalReceber(null); setRecContaId(''); setRecForma('pix'); load()
  }

  const estornarRecebimento = async (c: ContaReceber) => {
    if (c.status !== 'recebido') return
    if (!confirm(`Estornar o recebimento de "${c.descricao}"?\n\nVolta para pendente e o lancamento de entrada sera removido do caixa.`)) return
    const { error: lErr } = await supabase.from('lancamentos').delete().eq('conta_receber_id', c.id)
    if (lErr) { toast.error('Erro ao remover lancamento: ' + lErr.message); return }
    const hoje = format(new Date(), 'yyyy-MM-dd')
    const novoStatus = c.data_vencimento < hoje ? 'vencido' : 'pendente'
    await supabase.from('contas_receber').update({ status: novoStatus, data_recebimento: null }).eq('id', c.id)
    toast.success('Recebimento estornado e saiu do caixa.')
    load()
  }

  const excluir = async (id: string) => {
    if (!confirm('Excluir esta conta a receber?')) return
    await supabase.from('contas_receber').delete().eq('id', id)
    toast.success('Excluida'); load()
  }

  const filtradas = itens.filter(c => {
    const mb = c.descricao.toLowerCase().includes(busca.toLowerCase())
    const ms = filtroStatus === 'todos' || c.status === filtroStatus
    const dv = c.data_vencimento ?? ''
    const mm = (perIni === '' || dv >= perIni) && (perFim === '' || dv <= perFim)
    const mcc = !filtroCentro || c.centro_custo_id === filtroCentro
    return mb && ms && mm && mcc
  })

  const totais = {
    pendente: filtradas.filter(c => c.status === 'pendente').reduce((s, c) => s + Number(c.valor), 0),
    vencido: filtradas.filter(c => c.status === 'vencido').reduce((s, c) => s + Number(c.valor), 0),
    recebido: filtradas.filter(c => c.status === 'recebido').reduce((s, c) => s + Number(c.valor), 0),
  }

  const escHtml = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string))

  // Relatorio por contrato/centro de custo (estilo "resultado do projeto")
  const exportarPDF = () => {
    if (filtradas.length === 0) { toast.error('Nenhum recebimento para exportar com os filtros atuais'); return }
    const geradoEm = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const nomeEmpresa = escHtml(empresa?.nome ?? 'Sistema Financeiro Fatima')
    const statusPdf: Record<string, { c: string; bg: string; lbl: string }> = {
      pendente: { c: '#b45309', bg: '#fef3c7', lbl: 'A receber' },
      vencido: { c: '#b91c1c', bg: '#fee2e2', lbl: 'Atrasado' },
      recebido: { c: '#15803d', bg: '#dcfce7', lbl: 'Recebido' },
      cancelado: { c: '#475569', bg: '#f1f5f9', lbl: 'Cancelado' },
    }

    const totalGeral = filtradas.reduce((s, c) => s + Number(c.valor), 0)
    const totRecebido = totais.recebido
    const totAReceber = totais.pendente + totais.vencido

    // Agrupa por contrato/centro
    const grupos = new Map<string, ContaReceber[]>()
    for (const c of filtradas) {
      const nome = (c as any).centros_custo?.nome ?? 'Sem contrato/centro'
      const arr = grupos.get(nome); if (arr) arr.push(c); else grupos.set(nome, [c])
    }
    const contratos = Array.from(grupos.entries())
      .map(([nome, itens]) => ({
        nome, itens,
        total: itens.reduce((s, c) => s + Number(c.valor), 0),
        recebido: itens.filter(c => c.status === 'recebido').reduce((s, c) => s + Number(c.valor), 0),
        aReceber: itens.filter(c => c.status === 'pendente' || c.status === 'vencido').reduce((s, c) => s + Number(c.valor), 0),
      }))
      .sort((a, b) => b.total - a.total)
    const maxContrato = Math.max(...contratos.map(c => c.total), 1)

    const escopo = [
      filtroCentro ? `Contrato: ${centros.find(c => c.id === filtroCentro)?.nome ?? ''}` : '',
      (perIni || perFim) ? `Previsao: ${perIni ? formatDate(perIni) : '...'} a ${perFim ? formatDate(perFim) : '...'}` : '',
      filtroStatus !== 'todos' ? `Status: ${statusLabel[filtroStatus]}` : '',
      busca ? `Busca: "${busca}"` : '',
    ].filter(Boolean).map(t => escHtml(t as string)).join(' &nbsp;•&nbsp; ') || 'Todos os contratos'

    const resumoContratos = contratos.map(ct => `<tr>
      <td><strong>${escHtml(ct.nome)}</strong></td>
      <td class="num" style="color:#15803d">${formatCurrency(ct.recebido)}</td>
      <td class="num" style="color:#b45309">${formatCurrency(ct.aReceber)}</td>
      <td class="num">${formatCurrency(ct.total)}</td>
      <td style="width:26%"><div class="bar"><span style="width:${(ct.total / maxContrato) * 100}%"></span></div></td>
    </tr>`).join('')

    const detalhe = contratos.map(ct => `
      <tr class="grp"><td colspan="5">${escHtml(ct.nome)} — ${formatCurrency(ct.total)} <span class="gsub">(recebido ${formatCurrency(ct.recebido)} • a receber ${formatCurrency(ct.aReceber)})</span></td></tr>
      ${ct.itens.slice().sort((a, b) => (a.data_vencimento < b.data_vencimento ? -1 : 1)).map(c => {
        const st = statusPdf[c.status] ?? statusPdf.pendente
        return `<tr>
          <td>${escHtml(c.descricao)}</td>
          <td>${formatDate(c.data_vencimento)}</td>
          <td>${c.status === 'recebido' && c.data_recebimento ? formatDate(c.data_recebimento) : '—'}</td>
          <td><span class="pill" style="color:${st.c};background:${st.bg}">${st.lbl}</span></td>
          <td class="num">${formatCurrency(Number(c.valor))}</td>
        </tr>`
      }).join('')}`).join('')

    const html = `
      <!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"><title>Contas a Receber — ${nomeEmpresa}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #0f172a; margin: 0; padding: 28px 32px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .head { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:16px; border-bottom:3px solid #2563eb; margin-bottom:18px; }
        .brand { display:flex; align-items:center; gap:10px; }
        .logo { width:38px; height:38px; border-radius:10px; background:linear-gradient(135deg,#2563eb,#4f46e5); color:#fff; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:800; }
        .brand h2 { margin:0; font-size:13px; color:#2563eb; }
        .brand p { margin:2px 0 0; font-size:10px; color:#64748b; }
        .head .rt { text-align:right; }
        .head .rt h1 { margin:0; font-size:20px; }
        .head .rt p { margin:3px 0 0; font-size:10px; color:#64748b; }
        .scope { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-size:10px; color:#475569; margin-bottom:16px; }
        .kpis { display:flex; gap:10px; margin-bottom:20px; }
        .kpi { flex:1; border:1px solid #e2e8f0; border-radius:10px; padding:11px 13px; }
        .kpi .lbl { font-size:9px; text-transform:uppercase; letter-spacing:.05em; color:#64748b; font-weight:700; }
        .kpi .val { font-size:15px; font-weight:800; margin-top:3px; }
        .kpi.k1 { border-left:4px solid #f59e0b; } .kpi.k1 .val { color:#b45309; }
        .kpi.k2 { border-left:4px solid #22c55e; } .kpi.k2 .val { color:#15803d; }
        .kpi.k3 { border-left:4px solid #2563eb; background:#eff6ff; } .kpi.k3 .val { color:#1d4ed8; }
        h3 { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#334155; margin:22px 0 8px; padding-bottom:5px; border-bottom:1px solid #e2e8f0; }
        table { width:100%; border-collapse:collapse; }
        th { text-align:left; padding:7px 8px; font-size:9px; text-transform:uppercase; letter-spacing:.04em; color:#64748b; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
        td { padding:7px 8px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
        .num { text-align:right; font-weight:600; white-space:nowrap; }
        .pill { display:inline-block; padding:2px 8px; border-radius:20px; font-size:9px; font-weight:700; }
        .bar { background:#eff6ff; border-radius:6px; height:10px; overflow:hidden; }
        .bar span { display:block; height:10px; background:linear-gradient(90deg,#2563eb,#60a5fa); border-radius:6px; }
        tr.grp td { background:#eff6ff; font-weight:800; color:#1e3a8a; border-top:2px solid #dbeafe; }
        tr.grp .gsub { font-weight:500; color:#3b82f6; font-size:10px; }
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
          <h1>Contas a Receber</h1>
          <p>Por contrato / centro de custo • Gerado em ${geradoEm}</p>
        </div>
      </div>

      <div class="scope">${escopo} &nbsp;•&nbsp; ${filtradas.length} recebimento(s) • ${contratos.length} contrato(s)</div>

      <div class="kpis">
        <div class="kpi k1"><div class="lbl">A Receber</div><div class="val">${formatCurrency(totAReceber)}</div></div>
        <div class="kpi k2"><div class="lbl">Recebido</div><div class="val">${formatCurrency(totRecebido)}</div></div>
        <div class="kpi k3"><div class="lbl">Total previsto</div><div class="val">${formatCurrency(totalGeral)}</div></div>
      </div>

      <h3>Resumo por Contrato / Centro de Custo</h3>
      <table>
        <thead><tr><th>Contrato / Centro</th><th class="num">Recebido</th><th class="num">A Receber</th><th class="num">Total</th><th>Participacao</th></tr></thead>
        <tbody>${resumoContratos}</tbody>
        <tfoot><tr><td>Total geral</td><td class="num">${formatCurrency(totRecebido)}</td><td class="num">${formatCurrency(totAReceber)}</td><td class="num">${formatCurrency(totalGeral)}</td><td></td></tr></tfoot>
      </table>

      <h3>Detalhamento por Contrato</h3>
      <table>
        <thead><tr><th>Descricao</th><th>Previsao</th><th>Recebido em</th><th>Status</th><th class="num">Valor</th></tr></thead>
        <tbody>${detalhe}</tbody>
      </table>

      <div class="foot">
        <span>${nomeEmpresa} • Sistema Financeiro Fatima</span>
        <span>Documento gerado automaticamente • ${geradoEm}</span>
      </div>
      </body></html>`

    const win = window.open('', '_blank')
    if (!win) { toast.error('Permita popups para exportar PDF'); return }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Contas a Receber</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">Recebimentos previstos e baixa de entradas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportarPDF} size="sm" title="Relatorio por contrato/centro (PDF)">
            <FileDown size={15} /> <span className="hidden sm:inline">PDF</span>
          </Button>
          <Button onClick={abrirNovo} size="sm"><Plus size={15} /> <span className="hidden sm:inline">Novo</span> Recebimento</Button>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-yellow-400"><CardContent className="py-3 px-4">
          <p className="text-xs text-slate-500">A Receber</p>
          <p className="text-base md:text-xl font-bold text-yellow-600">{formatCurrency(totais.pendente)}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-red-500"><CardContent className="py-3 px-4">
          <p className="text-xs text-slate-500">Atrasadas</p>
          <p className="text-base md:text-xl font-bold text-red-600">{formatCurrency(totais.vencido)}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-green-500"><CardContent className="py-3 px-4">
          <p className="text-xs text-slate-500">Recebidas</p>
          <p className="text-base md:text-xl font-bold text-green-600">{formatCurrency(totais.recebido)}</p>
        </CardContent></Card>
      </div>

      {(filtroStatus !== 'todos' || busca || perIni || perFim) && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
          <span className="text-xs text-emerald-700 font-medium">{filtradas.length} conta(s) exibida(s)</span>
          <span className="text-sm font-bold text-emerald-700">Total: {formatCurrency(filtradas.reduce((s, c) => s + Number(c.valor), 0))}</span>
        </div>
      )}

      {/* Filtros */}
      <Card><CardContent className="py-3 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => setFiltroStatus(s)}
                className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${filtroStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {s === 'todos' ? 'Todos' : statusLabel[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium">Previsao:</span>
          <input type="date" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" value={perIni} onChange={e => setPerIni(e.target.value)} />
          <span className="text-slate-400 text-xs">ate</span>
          <input type="date" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30" value={perFim} onChange={e => setPerFim(e.target.value)} />
          <div className="flex gap-1 flex-wrap">
            {presets.map(p => (
              <button key={p.label} onClick={p.on} className="px-2.5 py-2 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">{p.label}</button>
            ))}
            <button onClick={() => { setPerIni(''); setPerFim('') }} className={`px-2.5 py-2 rounded-xl text-xs font-medium transition-all ${!perIni && !perFim ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Todos</button>
          </div>
        </div>
        {/* Filtro por centro de custo (contrato/projeto) */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium">Contrato / Centro:</span>
          <select
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 max-w-[70%]"
            value={filtroCentro}
            onChange={e => setFiltroCentro(e.target.value)}
          >
            <option value="">Todos os contratos/centros</option>
            {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {filtroCentro && <button onClick={() => setFiltroCentro('')} className="px-2.5 py-2 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100">Limpar</button>}
        </div>
      </CardContent></Card>

      {/* Tabela desktop */}
      <Card>
        <TableWrapper>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Descricao</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Previsao</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Valor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Categoria</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Carregando...</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Nenhuma conta a receber</td></tr>
              ) : filtradas.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-800">{c.descricao}{(c.anexos?.length ?? 0) > 0 && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-indigo-500 align-middle"><Paperclip size={11} />{c.anexos!.length}</span>}</p>
                    {(c as any).centros_custo?.nome && <p className="text-xs text-slate-400 mt-0.5">{(c as any).centros_custo.nome}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-sm">{formatDate(c.data_vencimento)}</td>
                  <td className="px-4 py-3 font-semibold text-green-700">{formatCurrency(Number(c.valor))}</td>
                  <td className="px-4 py-3"><Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge></td>
                  <td className="px-4 py-3 text-slate-500 text-sm">{(c as any).categorias?.nome ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {(c.status === 'pendente' || c.status === 'vencido') && (
                        <button onClick={() => { setModalReceber(c); setDataRecebimento(format(new Date(), 'yyyy-MM-dd')); setRecContaId(''); setRecForma('pix') }} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors" title="Dar baixa (recebido)"><CheckCircle size={14} /></button>
                      )}
                      {c.status === 'recebido' && (
                        <button onClick={() => estornarRecebimento(c)} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-500 transition-colors" title="Estornar recebimento"><RotateCcw size={14} /></button>
                      )}
                      <button onClick={() => abrirEditar(c)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors" title="Editar"><Pencil size={14} /></button>
                      <button onClick={() => excluir(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors" title="Excluir"><Trash2 size={14} /></button>
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
            <MobileCard><p className="text-center text-slate-400 py-6">Carregando...</p></MobileCard>
          ) : filtradas.length === 0 ? (
            <MobileCard><p className="text-center text-slate-400 py-6">Nenhuma conta a receber</p></MobileCard>
          ) : filtradas.map(c => {
            const isVencido = c.status === 'vencido'
            const isPend = c.status === 'pendente'
            return (
              <MobileCard key={c.id} className="py-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-bold text-slate-800 text-sm leading-tight flex-1 min-w-0">{c.descricao}{(c.anexos?.length ?? 0) > 0 && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-indigo-500 align-middle"><Paperclip size={11} />{c.anexos!.length}</span>}</p>
                  <Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-xl font-bold ${isVencido ? 'text-red-600' : 'text-green-700'}`}>{formatCurrency(Number(c.valor))}</p>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-medium">Previsao</p>
                    <p className={`text-xs font-semibold ${isVencido ? 'text-red-500' : 'text-slate-700'}`}>{formatDate(c.data_vencimento)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                  {(isPend || isVencido) && (
                    <button onClick={() => { setModalReceber(c); setDataRecebimento(format(new Date(), 'yyyy-MM-dd')); setRecContaId(''); setRecForma('pix') }} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-100 text-green-700 rounded-xl text-xs font-semibold hover:bg-green-200 transition-colors"><CheckCircle size={13} /> Dar baixa</button>
                  )}
                  {c.status === 'recebido' && (
                    <button onClick={() => estornarRecebimento(c)} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-100 text-amber-700 rounded-xl text-xs font-semibold hover:bg-amber-200 transition-colors"><RotateCcw size={13} /> Estornar</button>
                  )}
                  <button onClick={() => abrirEditar(c)} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors"><Pencil size={13} /> Editar</button>
                  <button onClick={() => excluir(c.id)} className="flex items-center justify-center p-2 bg-red-50 text-red-400 rounded-xl hover:bg-red-100 transition-colors"><Trash2 size={14} /></button>
                </div>
              </MobileCard>
            )
          })}
        </CardList>
      </Card>

      {/* Modal cadastro/edicao */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Conta a Receber' : 'Novo Recebimento'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="col-span-1 sm:col-span-2">
            <Input label="Descricao *" placeholder="Ex: Cliente Fulano, Servico prestado..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          </div>
          <CurrencyInput label="Valor *" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
          <Input label="Previsao de recebimento *" type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} />
          <div className="col-span-1 sm:col-span-2">
            <Select label="Categoria (entrada)" value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
              <option value="">Sem categoria</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>
          <div className="col-span-1 sm:col-span-2">
            <Select label="Centro de Custo (contrato)" value={form.centro_custo_id} onChange={e => setForm(f => ({ ...f, centro_custo_id: e.target.value }))}>
              <option value="">Sem centro de custo</option>
              {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>

          {/* Parcelamento — so ao criar */}
          {!editando && (
            <div className="col-span-1 sm:col-span-2">
              <div className={`rounded-2xl border-2 p-3 transition-all cursor-pointer ${form.parcelado ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}
                onClick={() => setForm(f => ({ ...f, parcelado: !f.parcelado }))}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${form.parcelado ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                    {form.parcelado && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Parcelado (varias parcelas do contrato)</p>
                    <p className="text-xs text-slate-400">Cria N recebimentos mensais com o mesmo valor</p>
                  </div>
                </div>
                {form.parcelado && (
                  <div className="mt-3 flex items-center gap-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setForm(f => ({ ...f, num_parcelas: String(Math.max(2, parseInt(f.num_parcelas) - 1)) }))}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold flex items-center justify-center hover:bg-slate-100">−</button>
                      <input type="number" min={2} max={120}
                        className="w-16 text-center px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        value={form.num_parcelas} onChange={e => setForm(f => ({ ...f, num_parcelas: e.target.value }))} />
                      <button type="button" onClick={() => setForm(f => ({ ...f, num_parcelas: String(Math.min(120, parseInt(f.num_parcelas) + 1)) }))}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold flex items-center justify-center hover:bg-slate-100">+</button>
                      <span className="text-xs text-slate-500">parcelas mensais</span>
                    </div>
                    <div className="bg-white border border-blue-100 rounded-xl px-3 py-1.5 text-center ml-auto">
                      <p className="text-[10px] text-slate-400">Total</p>
                      <p className="text-sm font-bold text-blue-600">{form.valor ? formatCurrency(parseFloat(form.valor) * (parseInt(form.num_parcelas) || 0)) : '—'}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Observacoes</label>
            <textarea className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30" rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>
          {!(form.parcelado && !editando) && (
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Anexos (comprovantes)</label>
              <AnexosManager
                table="contas_receber"
                rowId={editando?.id ?? null}
                anexos={modalAnexos}
                onChanged={a => { setModalAnexos(a); load() }}
                staged={stagedAnexos}
                onStagedChange={setStagedAnexos}
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : editando ? 'Salvar' : form.parcelado ? `Criar ${form.num_parcelas || '?'} parcelas` : 'Cadastrar'}</Button>
        </div>
      </Modal>

      {/* Modal baixa */}
      <Modal open={!!modalReceber} onClose={() => setModalReceber(null)} title="Registrar Recebimento" size="sm">
        {modalReceber && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="font-semibold text-slate-800">{modalReceber.descricao}</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(Number(modalReceber.valor))}</p>
            </div>
            <Input label="Data do Recebimento *" type="date" value={dataRecebimento} onChange={e => setDataRecebimento(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Forma *" value={recForma} onChange={e => setRecForma(e.target.value)}>
                <option value="pix">PIX</option>
                <option value="transferencia">Transferencia</option>
                <option value="boleto">Boleto</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao_debito">Cartao Debito</option>
                <option value="cartao_credito">Cartao Credito</option>
              </Select>
              <Select label="Conta Bancaria" value={recContaId} onChange={e => setRecContaId(e.target.value)}>
                <option value="">{contas.length === 0 ? 'Nenhum banco' : 'Selecione o banco...'}</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Select>
            </div>
            <p className="text-xs text-slate-400">Uma entrada sera criada automaticamente no caixa{recContaId ? ' e ja conciliada, pois o banco foi informado' : ''}.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModalReceber(null)}>Cancelar</Button>
              <Button variant="success" onClick={registrarRecebimento} disabled={saving}><DollarSign size={14} /> Confirmar Recebimento</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// helper local pra evitar import extra
function addMonthsSafe(d: Date, n: number): Date {
  const r = new Date(d); r.setMonth(r.getMonth() + n); return r
}
