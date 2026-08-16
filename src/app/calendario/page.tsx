'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, googleCalendarLink } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Calendar, ChevronLeft, ChevronRight, AlertCircle,
  Download, Link2, ExternalLink, CheckCircle, Clock, XCircle, RefreshCw, HandCoins, Scale
} from 'lucide-react'
import type { Despesa, ContaReceber } from '@/lib/types'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  addMonths, subMonths, isToday, isBefore, parseISO, getDay, isThisMonth
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useEmpresa } from '@/lib/empresa'

const STATUS_CONFIG = {
  pendente: { label: 'Pendente', color: 'bg-amber-500', light: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-500' },
  pago:     { label: 'Pago',     color: 'bg-emerald-500', light: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500' },
  vencido:  { label: 'Vencido',  color: 'bg-red-500', light: 'bg-red-50 border-red-200 text-red-700', dot: 'bg-red-500' },
  cancelado:{ label: 'Cancelado',color: 'bg-slate-400', light: 'bg-slate-50 border-slate-200 text-slate-500', dot: 'bg-slate-400' },
}

function gerarICS(despesas: Despesa[]): string {
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sistema Fatima//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Vencimentos Fatima',
    'X-WR-TIMEZONE:America/Sao_Paulo',
  ]

  for (const d of despesas) {
    const data = d.data_vencimento.replace(/-/g, '')
    const uid = `${d.id}@sistema-fatima`
    const summary = `Pagar: ${d.descricao} - ${formatCurrency(Number(d.valor))}`
    const desc = `Valor: ${formatCurrency(Number(d.valor))}\\nStatus: ${d.status}\\nCentro: ${(d as any).centros_custo?.nome ?? '-'}`
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${data}`,
      `DTEND;VALUE=DATE:${data}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `STATUS:${d.status === 'pago' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:Vence amanha: ${d.descricao}`,
      'END:VALARM',
      'END:VEVENT'
    )
  }

  linhas.push('END:VCALENDAR')
  return linhas.join('\r\n')
}

export default function CalendarioPage() {
  const [mes, setMes] = useState(new Date())
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [receber, setReceber] = useState<ContaReceber[]>([])
  const [proximas, setProximas] = useState<Despesa[]>([])
  const [proximasRec, setProximasRec] = useState<ContaReceber[]>([])
  const [loading, setLoading] = useState(true)
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'pagar' | 'receber'>('todos')
  const { empresaId, loading: empLoading } = useEmpresa()

  useEffect(() => { setBaseUrl(window.location.origin) }, [])

  const load = useCallback(async () => {
    if (empLoading) return // espera saber qual empresa esta ativa (evita misturar empresas)
    setLoading(true)
    const esc = <T,>(q: T): T => (empresaId ? (q as any).eq('empresa_id', empresaId) : q)

    // Auto-vencimento: pendentes com data anterior a hoje → vencido (so da empresa atual)
    const hoje = format(new Date(), 'yyyy-MM-dd')
    await esc(supabase
      .from('despesas')
      .update({ status: 'vencido' })
      .eq('status', 'pendente')
      .lt('data_vencimento', hoje))

    const ini = format(startOfMonth(mes), 'yyyy-MM-dd')
    const fim = format(endOfMonth(mes), 'yyyy-MM-dd')
    // Proximos vencimentos: atrasados + pendentes ate 3 meses a frente
    const horizonte = format(endOfMonth(addMonths(new Date(), 3)), 'yyyy-MM-dd')
    // Auto-vencimento tambem nas contas a receber
    await esc(supabase.from('contas_receber').update({ status: 'vencido' }).eq('status', 'pendente').lt('data_vencimento', hoje))

    const [mesRes, proxRes, mesRec, proxRec] = await Promise.all([
      esc(supabase.from('despesas')
        .select('*, categorias(*), centros_custo(*)')
        .gte('data_vencimento', ini).lte('data_vencimento', fim)
        .order('data_vencimento')),
      esc(supabase.from('despesas')
        .select('*, categorias(*), centros_custo(*)')
        .in('status', ['pendente', 'vencido'])
        .lte('data_vencimento', horizonte)
        .order('data_vencimento')),
      esc(supabase.from('contas_receber')
        .select('*, categorias(*), centros_custo(*)')
        .gte('data_vencimento', ini).lte('data_vencimento', fim)
        .order('data_vencimento')),
      esc(supabase.from('contas_receber')
        .select('*, categorias(*), centros_custo(*)')
        .in('status', ['pendente', 'vencido'])
        .lte('data_vencimento', horizonte)
        .order('data_vencimento')),
    ])
    setDespesas((mesRes.data ?? []) as Despesa[])
    setProximas((proxRes.data ?? []) as Despesa[])
    setReceber((mesRec.data ?? []) as ContaReceber[])
    setProximasRec((proxRec.data ?? []) as ContaReceber[])
    setLoading(false)
  }, [mes, empresaId, empLoading])

  useEffect(() => { load() }, [load])

  const diasDoMes = eachDayOfInterval({ start: startOfMonth(mes), end: endOfMonth(mes) })
  const offset = getDay(startOfMonth(mes))

  // Eventos unificados do mes (pagar + receber), respeitando o filtro
  type Evento = { id: string; kind: 'pagar' | 'receber'; descricao: string; valor: number; data: string; status: string }
  const eventosMes: Evento[] = [
    ...(filtro !== 'receber' ? despesas.map(d => ({ id: d.id, kind: 'pagar' as const, descricao: d.descricao, valor: Number(d.valor), data: d.data_vencimento, status: d.status })) : []),
    ...(filtro !== 'pagar' ? receber.map(r => ({ id: r.id, kind: 'receber' as const, descricao: r.descricao, valor: Number(r.valor), data: r.data_vencimento, status: r.status })) : []),
  ]
  const eventosDia = (d: Date) => eventosMes.filter(e => isSameDay(parseISO(e.data), d))

  // Cor/estilo por evento: pagar usa status, receber = azul
  const eventoLight = (e: Evento) =>
    e.kind === 'receber'
      ? (e.status === 'recebido' ? 'bg-blue-50 border-blue-200 text-blue-500' : 'bg-blue-50 border-blue-200 text-blue-700')
      : (STATUS_CONFIG[e.status as keyof typeof STATUS_CONFIG]?.light ?? 'bg-slate-50 text-slate-600 border-slate-200')
  const eventoDot = (e: Evento) =>
    e.kind === 'receber' ? 'bg-blue-500' : (STATUS_CONFIG[e.status as keyof typeof STATUS_CONFIG]?.dot ?? 'bg-slate-400')

  const pendentes = despesas.filter(d => d.status === 'pendente')
  const vencidas  = despesas.filter(d => d.status === 'vencido')
  const pagas     = despesas.filter(d => d.status === 'pago')

  const totalPendente = pendentes.reduce((s, d) => s + Number(d.valor), 0)
  const totalVencido  = vencidas.reduce((s, d) => s + Number(d.valor), 0)
  const totalPago     = pagas.reduce((s, d) => s + Number(d.valor), 0)

  const receberAberto = receber.filter(r => r.status === 'pendente' || r.status === 'vencido')
  const totalReceber  = receberAberto.reduce((s, r) => s + Number(r.valor), 0)
  const recVencido = receber.filter(r => r.status === 'vencido').reduce((s, r) => s + Number(r.valor), 0)
  const recRecebido = receber.filter(r => r.status === 'recebido').reduce((s, r) => s + Number(r.valor), 0)
  const recRecebidoCount = receber.filter(r => r.status === 'recebido').length
  const saldoPrevisto = totalReceber - (totalPendente + totalVencido)

  // Cards do topo mudam conforme o filtro selecionado
  type CardCal = { label: string; valor: number; sub: string; accent: string; text: string; bg: string; icon: 'clock' | 'alert' | 'check' | 'coins' | 'scale' }
  const cardsCal: CardCal[] = filtro === 'receber'
    ? [
        { label: 'A Receber', valor: totalReceber, sub: `${receberAberto.length} conta(s)`, accent: 'border-l-blue-500', text: 'text-blue-600', bg: 'bg-blue-100', icon: 'coins' },
        { label: 'Atrasado', valor: recVencido, sub: `${receber.filter(r => r.status === 'vencido').length} conta(s)`, accent: 'border-l-red-500', text: 'text-red-600', bg: 'bg-red-100', icon: 'alert' },
        { label: 'Recebido este mes', valor: recRecebido, sub: `${recRecebidoCount} conta(s)`, accent: 'border-l-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-100', icon: 'check' },
      ]
    : filtro === 'pagar'
    ? [
        { label: 'A Pagar', valor: totalPendente, sub: `${pendentes.length} conta(s)`, accent: 'border-l-amber-400', text: 'text-amber-600', bg: 'bg-amber-100', icon: 'clock' },
        { label: 'Vencidas', valor: totalVencido, sub: `${vencidas.length} conta(s)`, accent: 'border-l-red-500', text: 'text-red-600', bg: 'bg-red-100', icon: 'alert' },
        { label: 'Pago este mes', valor: totalPago, sub: `${pagas.length} conta(s)`, accent: 'border-l-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-100', icon: 'check' },
      ]
    : [
        { label: 'A Pagar', valor: totalPendente + totalVencido, sub: `${pendentes.length + vencidas.length} conta(s)`, accent: 'border-l-amber-400', text: 'text-amber-600', bg: 'bg-amber-100', icon: 'clock' },
        { label: 'A Receber', valor: totalReceber, sub: `${receberAberto.length} conta(s)`, accent: 'border-l-blue-500', text: 'text-blue-600', bg: 'bg-blue-100', icon: 'coins' },
        { label: 'Vencidas (pagar)', valor: totalVencido, sub: `${vencidas.length} conta(s)`, accent: 'border-l-red-500', text: 'text-red-600', bg: 'bg-red-100', icon: 'alert' },
        { label: 'Saldo previsto', valor: saldoPrevisto, sub: 'receber − pagar', accent: saldoPrevisto >= 0 ? 'border-l-indigo-500' : 'border-l-orange-500', text: saldoPrevisto >= 0 ? 'text-indigo-600' : 'text-orange-600', bg: saldoPrevisto >= 0 ? 'bg-indigo-100' : 'bg-orange-100', icon: 'scale' },
      ]
  const iconCal = (k: CardCal['icon']) => k === 'clock' ? <Clock className="w-5 h-5" /> : k === 'alert' ? <AlertCircle className="w-5 h-5" /> : k === 'check' ? <CheckCircle className="w-5 h-5" /> : k === 'coins' ? <HandCoins className="w-5 h-5" /> : <Scale className="w-5 h-5" />

  // Proximos vencimentos unificados (pagar + receber), respeitando o filtro
  const proximosEventos: Evento[] = [
    ...(filtro !== 'receber' ? proximas.map(d => ({ id: d.id, kind: 'pagar' as const, descricao: d.descricao, valor: Number(d.valor), data: d.data_vencimento, status: d.status })) : []),
    ...(filtro !== 'pagar' ? proximasRec.map(r => ({ id: r.id, kind: 'receber' as const, descricao: r.descricao, valor: Number(r.valor), data: r.data_vencimento, status: r.status })) : []),
  ].sort((a, b) => (a.data < b.data ? -1 : 1))

  const exportarICS = () => {
    // Exporta TODOS os vencimentos futuros (atrasados + ate 3 meses), nao so o mes na tela
    if (proximas.length === 0) { toast.info('Nenhuma conta pendente ou vencida a exportar'); return }
    const ics = gerarICS(proximas)
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vencimentos-fatima.ics`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${proximas.length} vencimento(s) exportados! Importe no Google Agenda.`)
  }

  const copiarSubscribeUrl = () => {
    const url = `${baseUrl}/api/calendario/ics`
    navigator.clipboard.writeText(url)
    toast.success('URL copiada! Cole no Google Agenda > Outros calendarios > Por URL')
  }

  const despSelecionadas = diaSelecionado ? eventosDia(diaSelecionado) : []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Calendario de Vencimentos</h1>
          <p className="text-sm text-slate-500 mt-0.5">Visualize e sincronize com Google Agenda</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw size={14} />
          </Button>
          <Button variant="secondary" size="sm" onClick={exportarICS}>
            <Download size={14} /> Exportar .ics
          </Button>
          <Button variant="secondary" size="sm" onClick={copiarSubscribeUrl}>
            <Link2 size={14} /> Subscribe URL
          </Button>
        </div>
      </div>

      {/* Banner Google Agenda */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">Sincronize com Google Agenda</p>
            <p className="text-indigo-200 text-xs mt-0.5">
              Exporte .ics para importar uma vez, ou use a Subscribe URL para sincronizacao automatica
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportarICS}
            className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-medium rounded-xl transition-all flex items-center gap-1.5"
          >
            <Download size={13} /> Baixar .ics
          </button>
          <button
            onClick={copiarSubscribeUrl}
            className="px-3 py-2 bg-white text-indigo-700 hover:bg-indigo-50 text-xs font-medium rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Link2 size={13} /> Copiar Subscribe URL
          </button>
        </div>
      </div>

      {/* Filtro Tudo / A Pagar / A Receber */}
      <div className="flex gap-1.5">
        {([['todos', 'Tudo'], ['pagar', 'A Pagar'], ['receber', 'A Receber']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filtro === k
                ? (k === 'receber' ? 'bg-blue-600 text-white' : 'bg-indigo-600 text-white')
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Cards resumo — mudam conforme o filtro */}
      <div className={`grid gap-3 md:gap-4 ${cardsCal.length === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
        {cardsCal.map(c => (
          <Card key={c.label} className={`border-l-4 ${c.accent} hover:shadow-md transition-shadow`}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium">{c.label}</p>
                  <p className={`text-xl font-bold mt-0.5 ${c.text}`}>{formatCurrency(c.valor)}</p>
                  <p className="text-xs text-slate-400">{c.sub}</p>
                </div>
                <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center ${c.text}`}>
                  {iconCal(c.icon)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Calendário */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            {/* Navegação do mês */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
              <button
                onClick={() => setMes(m => subMonths(m, 1))}
                className="w-8 h-8 rounded-xl hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-center">
                <p className="font-bold text-slate-800 capitalize text-base">
                  {format(mes, 'MMMM', { locale: ptBR })}
                </p>
                <p className="text-xs text-slate-400">{format(mes, 'yyyy')}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMes(new Date())}
                  className="px-3 py-1.5 rounded-xl hover:bg-indigo-50 text-indigo-600 text-xs font-semibold transition-colors"
                >
                  Hoje
                </button>
                <button
                  onClick={() => setMes(m => addMonths(m, 1))}
                  className="w-8 h-8 rounded-xl hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <CardContent className="p-4">
              {/* Cabeçalho semana */}
              <div className="grid grid-cols-7 mb-2">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>
                ))}
              </div>

              {/* Grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array(offset).fill(null).map((_, i) => <div key={`off-${i}`} />)}
                {diasDoMes.map(dia => {
                  const desp = eventosDia(dia)
                  const selected = diaSelecionado && isSameDay(dia, diaSelecionado)
                  const hoje = isToday(dia)
                  const passado = isBefore(dia, new Date()) && !hoje

                  return (
                    <button
                      key={dia.toISOString()}
                      onClick={() => setDiaSelecionado(diaSelecionado && isSameDay(dia, diaSelecionado) ? null : dia)}
                      className={`
                        relative rounded-xl p-1.5 min-h-[72px] flex flex-col transition-all text-left
                        ${selected
                          ? 'bg-indigo-600 shadow-md ring-2 ring-indigo-300'
                          : hoje
                            ? 'bg-indigo-50 ring-2 ring-indigo-400'
                            : 'hover:bg-slate-50'
                        }
                      `}
                    >
                      {/* Número do dia */}
                      <span className={`
                        text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 flex-shrink-0
                        ${selected ? 'bg-white text-indigo-700'
                          : hoje ? 'bg-indigo-600 text-white'
                          : passado && desp.length === 0 ? 'text-slate-300'
                          : 'text-slate-700'}
                      `}>
                        {format(dia, 'd')}
                      </span>

                      {/* Eventos visíveis (pagar/receber) */}
                      <div className="space-y-0.5 w-full overflow-hidden">
                        {desp.slice(0, 2).map(e => (
                          <div
                            key={e.kind + e.id}
                            className={`
                              text-[10px] font-medium px-1.5 py-0.5 rounded-md truncate border leading-tight
                              ${selected ? 'bg-white/20 text-white border-white/30' : eventoLight(e)}
                            `}
                          >
                            {e.kind === 'receber' ? '↓ ' : ''}{e.descricao.length > 9 ? e.descricao.slice(0, 9) + '…' : e.descricao}
                          </div>
                        ))}
                        {desp.length > 2 && (
                          <div className={`text-[10px] font-medium px-1.5 rounded-md ${selected ? 'text-white/70' : 'text-slate-400'}`}>
                            +{desp.length - 2} mais
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Legenda */}
              <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-100">
                {filtro !== 'receber' && Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                    <span className="text-xs text-slate-500">{cfg.label} (pagar)</span>
                  </div>
                ))}
                {filtro !== 'pagar' && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="text-xs text-slate-500">A Receber</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Painel lateral */}
        <div className="space-y-4">
          {/* Detalhe do dia */}
          {diaSelecionado ? (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-purple-600">
                <p className="text-white/80 text-xs font-medium uppercase tracking-wide">
                  {format(diaSelecionado, 'EEEE', { locale: ptBR })}
                </p>
                <p className="text-white font-bold text-lg leading-tight capitalize">
                  {format(diaSelecionado, "dd 'de' MMMM", { locale: ptBR })}
                </p>
                <p className="text-white/70 text-xs mt-0.5">
                  {despSelecionadas.length === 0
                    ? 'Nenhuma despesa'
                    : `${despSelecionadas.length} despesa(s)`}
                </p>
              </div>
              <CardContent className="py-4 px-4">
                {despSelecionadas.length === 0 ? (
                  <div className="text-center py-4">
                    <CheckCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Dia livre!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {despSelecionadas.map(e => {
                      const label = e.kind === 'receber'
                        ? (e.status === 'recebido' ? 'Recebido' : e.status === 'vencido' ? 'A receber (atrasado)' : 'A receber')
                        : (STATUS_CONFIG[e.status as keyof typeof STATUS_CONFIG]?.label ?? e.status)
                      return (
                        <div key={e.kind + e.id} className={`border rounded-xl p-3 ${eventoLight(e)}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{e.kind === 'receber' ? '↓ Receber' : '↑ Pagar'}</p>
                              <p className="font-semibold text-sm leading-tight truncate">{e.descricao}</p>
                              <p className="text-xl font-bold mt-1">{formatCurrency(Number(e.valor))}</p>
                            </div>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/60 flex-shrink-0">{label}</span>
                          </div>
                          {(e.status === 'pendente' || e.status === 'vencido') && (
                            <div className="flex gap-2 mt-3 pt-2 border-t border-current/10">
                              <a
                                href={googleCalendarLink({
                                  title: `${e.kind === 'receber' ? 'Receber' : 'Pagar'}: ${e.descricao}`,
                                  date: e.data,
                                  description: `Valor: ${formatCurrency(Number(e.valor))}`,
                                })}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 bg-white/60 hover:bg-white/80 rounded-lg transition-all"
                              >
                                <ExternalLink size={11} /> Google Agenda
                              </a>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">Clique em um dia</p>
                <p className="text-slate-300 text-xs mt-1">para ver as despesas</p>
              </CardContent>
            </Card>
          )}

          {/* Lista do mês — todas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Todas do mes</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 max-h-72 overflow-y-auto scrollbar-thin px-3">
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : despesas.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">Nenhuma despesa este mes</p>
              ) : (
                <div className="space-y-1.5">
                  {despesas.map(d => {
                    const cfg = STATUS_CONFIG[d.status as keyof typeof STATUS_CONFIG]
                    return (
                      <button
                        key={d.id}
                        onClick={() => setDiaSelecionado(parseISO(d.data_vencimento))}
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 transition-colors text-left group"
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg?.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate leading-tight">{d.descricao}</p>
                          <p className="text-xs text-slate-400">{formatDate(d.data_vencimento)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-xs font-bold text-slate-700">{formatCurrency(Number(d.valor))}</span>
                          {d.status === 'pendente' && (
                            <a
                              href={googleCalendarLink({ title: `Pagar: ${d.descricao}`, date: d.data_vencimento, description: `Valor: ${formatCurrency(Number(d.valor))}` })}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400 hover:text-indigo-600"
                              title="Adicionar ao Google Agenda"
                            >
                              <Calendar size={12} />
                            </a>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Proximos vencimentos (atrasados + 3 meses) — nao preso ao mes na tela */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Proximos vencimentos</CardTitle>
                <span className="text-[11px] text-slate-400">atrasados + 3 meses</span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 max-h-80 overflow-y-auto scrollbar-thin px-3">
              {proximosEventos.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Nada a vencer!</p>
                </div>
              ) : (
                (() => {
                  const grupos = new Map<string, Evento[]>()
                  for (const e of proximosEventos) {
                    const k = (e.data ?? '').slice(0, 7)
                    const arr = grupos.get(k); if (arr) arr.push(e); else grupos.set(k, [e])
                  }
                  return Array.from(grupos.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, itens]) => {
                    const [ano, m] = k.split('-').map(Number)
                    const totPagar = itens.filter(e => e.kind === 'pagar').reduce((s, e) => s + e.valor, 0)
                    const totReceber = itens.filter(e => e.kind === 'receber').reduce((s, e) => s + e.valor, 0)
                    return (
                      <div key={k} className="mb-2">
                        <div className="flex items-center justify-between px-1 py-1 sticky top-0 bg-white">
                          <span className="text-[11px] font-bold text-slate-500 capitalize">{format(new Date(ano, m - 1, 1), "MMMM/yyyy", { locale: ptBR })}</span>
                          <span className="text-[11px] font-bold flex gap-2">
                            {totPagar > 0 && <span className="text-red-500">-{formatCurrency(totPagar)}</span>}
                            {totReceber > 0 && <span className="text-blue-600">+{formatCurrency(totReceber)}</span>}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {itens.map(e => (
                            <div key={e.kind + e.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 transition-colors">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${eventoDot(e)}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-700 truncate leading-tight">{e.kind === 'receber' ? '↓ ' : ''}{e.descricao}</p>
                                <p className="text-xs text-slate-400">{formatDate(e.data)}{e.status === 'vencido' ? (e.kind === 'receber' ? ' · atrasado' : ' · vencida') : ''}</p>
                              </div>
                              <span className={`text-xs font-bold flex-shrink-0 ${e.kind === 'receber' ? 'text-blue-600' : 'text-slate-700'}`}>{formatCurrency(e.valor)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })
                })()
              )}
            </CardContent>
          </Card>

          {/* Instruções Google Agenda */}
          <Card className="bg-gradient-to-br from-slate-50 to-indigo-50 border-indigo-100">
            <CardContent className="py-4 px-4">
              <p className="text-xs font-bold text-indigo-700 mb-2 flex items-center gap-1.5">
                <Calendar size={12} /> Como usar no Google Agenda
              </p>
              <ol className="text-xs text-slate-600 space-y-1.5 list-none">
                <li className="flex gap-2">
                  <span className="w-4 h-4 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0">1</span>
                  <span><strong>Importar .ics:</strong> Baixe o arquivo e importe em Google Agenda &gt; Outros calendarios</span>
                </li>
                <li className="flex gap-2">
                  <span className="w-4 h-4 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0">2</span>
                  <span><strong>Subscribe URL:</strong> Copie a URL e cole em Google Agenda &gt; Adicionar por URL (sincroniza automaticamente)</span>
                </li>
                <li className="flex gap-2">
                  <span className="w-4 h-4 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0">3</span>
                  <span><strong>Por despesa:</strong> Clique no icone do calendario em cada despesa para adicionar individualmente</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
