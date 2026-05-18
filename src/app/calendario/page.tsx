'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, getStatusColor, getStatusLabel, googleCalendarLink } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, ExternalLink, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import type { Despesa } from '@/lib/types'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  addMonths, subMonths, isToday, isBefore, parseISO, getDay
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

const statusVariant: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = {
  pendente: 'warning', pago: 'success', vencido: 'danger', cancelado: 'neutral',
}

export default function CalendarioPage() {
  const [mesSelecionado, setMesSelecionado] = useState(new Date())
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [loading, setLoading] = useState(true)
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const ini = format(startOfMonth(mesSelecionado), 'yyyy-MM-dd')
    const fim = format(endOfMonth(mesSelecionado), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('despesas')
      .select('*, categorias(*), centros_custo(*)')
      .gte('data_vencimento', ini)
      .lte('data_vencimento', fim)
      .order('data_vencimento', { ascending: true })
    setDespesas((data ?? []) as Despesa[])
    setLoading(false)
  }, [mesSelecionado])

  useEffect(() => { load() }, [load])

  const diasDoMes = eachDayOfInterval({
    start: startOfMonth(mesSelecionado),
    end: endOfMonth(mesSelecionado),
  })

  const despesasDoDia = (dia: Date) =>
    despesas.filter(d => isSameDay(parseISO(d.data_vencimento), dia))

  const despesasDiaSelecionado = diaSelecionado ? despesasDoDia(diaSelecionado) : []

  const primeiroDiaSemana = getDay(startOfMonth(mesSelecionado))
  const diasAntes = Array(primeiroDiaSemana).fill(null)

  const totalPendente = despesas.filter(d => d.status === 'pendente').reduce((s, d) => s + Number(d.valor), 0)
  const totalVencido = despesas.filter(d => d.status === 'vencido').reduce((s, d) => s + Number(d.valor), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Calendário de Vencimentos</h1>
          <p className="text-sm text-slate-500 mt-1">Visualize e gerencie seus vencimentos por data</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendário */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="capitalize">
                  {format(mesSelecionado, 'MMMM yyyy', { locale: ptBR })}
                </CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setMesSelecionado(m => subMonths(m, 1))}>
                    <ChevronLeft size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setMesSelecionado(new Date())}>
                    Hoje
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setMesSelecionado(m => addMonths(m, 1))}>
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Cabeçalho dias semana */}
              <div className="grid grid-cols-7 mb-2">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-slate-400 py-2">{d}</div>
                ))}
              </div>

              {/* Grid dias */}
              <div className="grid grid-cols-7 gap-1">
                {diasAntes.map((_, i) => <div key={`antes-${i}`} />)}
                {diasDoMes.map(dia => {
                  const despsDia = despesasDoDia(dia)
                  const temVencido = despsDia.some(d => d.status === 'vencido')
                  const temPendente = despsDia.some(d => d.status === 'pendente')
                  const selected = diaSelecionado && isSameDay(dia, diaSelecionado)
                  const hoje = isToday(dia)

                  return (
                    <button
                      key={dia.toISOString()}
                      onClick={() => setDiaSelecionado(isSameDay(dia, diaSelecionado ?? new Date('')) ? null : dia)}
                      className={`
                        relative p-2 rounded-xl text-sm min-h-[52px] flex flex-col items-center transition-all
                        ${selected ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-50'}
                        ${hoje && !selected ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}
                      `}
                    >
                      <span className={`font-medium ${selected ? 'text-white' : hoje ? 'text-indigo-600' : 'text-slate-700'}`}>
                        {format(dia, 'd')}
                      </span>
                      {despsDia.length > 0 && (
                        <div className="flex gap-0.5 mt-1">
                          {temVencido && <div className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-red-200' : 'bg-red-500'}`} />}
                          {temPendente && <div className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-yellow-200' : 'bg-yellow-500'}`} />}
                          {!temVencido && !temPendente && <div className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-green-200' : 'bg-green-500'}`} />}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Legenda */}
              <div className="flex gap-4 mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-xs text-slate-500">Vencido</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-500" /><span className="text-xs text-slate-500">Pendente</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-xs text-slate-500">Pago</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Resumo do mês */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-l-4 border-l-yellow-400">
              <CardContent className="py-4">
                <p className="text-xs text-slate-500">A pagar este mês</p>
                <p className="text-xl font-bold text-yellow-600">{formatCurrency(totalPendente)}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="py-4">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-xs text-slate-500">Vencidas</p>
                    <p className="text-xl font-bold text-red-600">{formatCurrency(totalVencido)}</p>
                  </div>
                  {totalVencido > 0 && <AlertCircle className="w-5 h-5 text-red-500 ml-auto" />}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sidebar direita */}
        <div className="space-y-4">
          {/* Despesas do dia selecionado */}
          {diaSelecionado && (
            <Card>
              <CardHeader>
                <CardTitle className="capitalize">
                  {format(diaSelecionado, "dd 'de' MMMM", { locale: ptBR })}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {despesasDiaSelecionado.length === 0 ? (
                  <p className="text-slate-400 text-sm">Nenhuma despesa neste dia</p>
                ) : (
                  <div className="space-y-3">
                    {despesasDiaSelecionado.map(d => (
                      <div key={d.id} className="border border-slate-100 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium text-slate-800 text-sm">{d.descricao}</p>
                            <p className="text-lg font-bold text-red-600">{formatCurrency(Number(d.valor))}</p>
                            <Badge variant={statusVariant[d.status]} className="mt-1">{getStatusLabel(d.status)}</Badge>
                          </div>
                          {d.status === 'pendente' && (
                            <a
                              href={googleCalendarLink({
                                title: `Pagar: ${d.descricao}`,
                                date: d.data_vencimento,
                                description: `Valor: ${formatCurrency(Number(d.valor))}`,
                              })}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500 flex-shrink-0 transition-colors"
                              title="Adicionar ao Google Agenda"
                            >
                              <Calendar size={15} />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Lista todas despesas do mês */}
          <Card>
            <CardHeader>
              <CardTitle>Todas do mês</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 max-h-96 overflow-y-auto scrollbar-thin">
              {loading ? (
                <p className="text-slate-400 text-sm">Carregando...</p>
              ) : despesas.length === 0 ? (
                <p className="text-slate-400 text-sm">Nenhuma despesa este mês</p>
              ) : (
                <div className="space-y-2">
                  {despesas.map(d => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => setDiaSelecionado(parseISO(d.data_vencimento))}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          d.status === 'vencido' ? 'bg-red-500' :
                          d.status === 'pendente' ? 'bg-yellow-500' :
                          d.status === 'pago' ? 'bg-green-500' : 'bg-slate-300'
                        }`} />
                        <div>
                          <p className="text-sm font-medium text-slate-700 leading-tight">{d.descricao}</p>
                          <p className="text-xs text-slate-400">{formatDate(d.data_vencimento)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-700">{formatCurrency(Number(d.valor))}</span>
                        {d.status === 'pendente' && (
                          <a
                            href={googleCalendarLink({ title: `Pagar: ${d.descricao}`, date: d.data_vencimento, description: `Valor: ${formatCurrency(Number(d.valor))}` })}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-indigo-400 hover:text-indigo-600 transition-colors"
                            title="Google Agenda"
                          >
                            <Calendar size={13} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
