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
  Download, Link2, ExternalLink, CheckCircle, Clock, XCircle, RefreshCw
} from 'lucide-react'
import type { Despesa } from '@/lib/types'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  addMonths, subMonths, isToday, isBefore, parseISO, getDay, isThisMonth
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

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
  const [loading, setLoading] = useState(true)
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null)
  const [baseUrl, setBaseUrl] = useState('')

  useEffect(() => { setBaseUrl(window.location.origin) }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const ini = format(startOfMonth(mes), 'yyyy-MM-dd')
    const fim = format(endOfMonth(mes), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('despesas')
      .select('*, categorias(*), centros_custo(*)')
      .gte('data_vencimento', ini)
      .lte('data_vencimento', fim)
      .order('data_vencimento')
    setDespesas((data ?? []) as Despesa[])
    setLoading(false)
  }, [mes])

  useEffect(() => { load() }, [load])

  const diasDoMes = eachDayOfInterval({ start: startOfMonth(mes), end: endOfMonth(mes) })
  const offset = getDay(startOfMonth(mes))
  const despDia = (d: Date) => despesas.filter(dp => isSameDay(parseISO(dp.data_vencimento), d))

  const pendentes = despesas.filter(d => d.status === 'pendente')
  const vencidas  = despesas.filter(d => d.status === 'vencido')
  const pagas     = despesas.filter(d => d.status === 'pago')

  const totalPendente = pendentes.reduce((s, d) => s + Number(d.valor), 0)
  const totalVencido  = vencidas.reduce((s, d) => s + Number(d.valor), 0)
  const totalPago     = pagas.reduce((s, d) => s + Number(d.valor), 0)

  const exportarICS = () => {
    const pendentesEVencidas = despesas.filter(d => ['pendente', 'vencido'].includes(d.status))
    if (pendentesEVencidas.length === 0) { toast.info('Nenhuma despesa pendente este mes'); return }
    const ics = gerarICS(pendentesEVencidas)
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vencimentos-${format(mes, 'yyyy-MM')}.ics`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Arquivo .ics baixado! Importe no Google Agenda.')
  }

  const copiarSubscribeUrl = () => {
    const url = `${baseUrl}/api/calendario/ics`
    navigator.clipboard.writeText(url)
    toast.success('URL copiada! Cole no Google Agenda > Outros calendarios > Por URL')
  }

  const despSelecionadas = diaSelecionado ? despDia(diaSelecionado) : []

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

      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-400 hover:shadow-md transition-shadow">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">A Pagar</p>
                <p className="text-xl font-bold text-amber-600 mt-0.5">{formatCurrency(totalPendente)}</p>
                <p className="text-xs text-slate-400">{pendentes.length} conta(s)</p>
              </div>
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-l-4 border-l-red-500 hover:shadow-md transition-shadow ${vencidas.length > 0 ? 'ring-1 ring-red-200' : ''}`}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Vencidas</p>
                <p className="text-xl font-bold text-red-600 mt-0.5">{formatCurrency(totalVencido)}</p>
                <p className="text-xs text-slate-400">{vencidas.length} conta(s)</p>
              </div>
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Pago este mes</p>
                <p className="text-xl font-bold text-emerald-600 mt-0.5">{formatCurrency(totalPago)}</p>
                <p className="text-xs text-slate-400">{pagas.length} conta(s)</p>
              </div>
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
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
                  const desp = despDia(dia)
                  const selected = diaSelecionado && isSameDay(dia, diaSelecionado)
                  const hoje = isToday(dia)
                  const temVencido = desp.some(d => d.status === 'vencido')
                  const temPendente = desp.some(d => d.status === 'pendente')
                  const tudo_pago = desp.length > 0 && desp.every(d => d.status === 'pago')
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

                      {/* Despesas visíveis */}
                      <div className="space-y-0.5 w-full overflow-hidden">
                        {desp.slice(0, 2).map(d => (
                          <div
                            key={d.id}
                            className={`
                              text-[10px] font-medium px-1.5 py-0.5 rounded-md truncate border leading-tight
                              ${selected ? 'bg-white/20 text-white border-white/30'
                                : STATUS_CONFIG[d.status as keyof typeof STATUS_CONFIG]?.light ?? 'bg-slate-50 text-slate-600 border-slate-200'}
                            `}
                          >
                            {d.descricao.length > 10 ? d.descricao.slice(0, 10) + '…' : d.descricao}
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
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                    <span className="text-xs text-slate-500">{cfg.label}</span>
                  </div>
                ))}
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
                    {despSelecionadas.map(d => {
                      const cfg = STATUS_CONFIG[d.status as keyof typeof STATUS_CONFIG]
                      return (
                        <div key={d.id} className={`border rounded-xl p-3 ${cfg?.light}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm leading-tight truncate">{d.descricao}</p>
                              <p className="text-xl font-bold mt-1">{formatCurrency(Number(d.valor))}</p>
                              {(d as any).categorias && (
                                <p className="text-xs opacity-70 mt-0.5">{(d as any).categorias.nome}</p>
                              )}
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/60 flex-shrink-0`}>
                              {cfg?.label}
                            </span>
                          </div>
                          {d.status === 'pendente' && (
                            <div className="flex gap-2 mt-3 pt-2 border-t border-current/10">
                              <a
                                href={googleCalendarLink({
                                  title: `Pagar: ${d.descricao}`,
                                  date: d.data_vencimento,
                                  description: `Valor: ${formatCurrency(Number(d.valor))}`,
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
