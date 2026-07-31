'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  TrendingUp, TrendingDown, DollarSign, AlertCircle,
  Calendar, ArrowRight
} from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Lancamento, Despesa } from '@/lib/types'

const COLORS = ['#6366f1', '#f472b6', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6']

interface ResumoMes {
  mes: string
  entradas: number
  saidas: number
}

export default function Dashboard() {
  const [totalEntradas, setTotalEntradas] = useState(0)
  const [totalSaidas, setTotalSaidas] = useState(0)
  const [despesasPendentes, setDespesasPendentes] = useState(0)
  const [despesasVencidas, setDespesasVencidas] = useState(0)
  const [ultimosLancamentos, setUltimosLancamentos] = useState<Lancamento[]>([])
  const [proximasVencendo, setProximasVencendo] = useState<Despesa[]>([])
  const [graficoMensal, setGraficoMensal] = useState<ResumoMes[]>([])
  const [graficoCategorias, setGraficoCategorias] = useState<{ nome: string; valor: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const hoje = new Date()
      const hojeStr = format(hoje, 'yyyy-MM-dd')
      const inicioMes = format(startOfMonth(hoje), 'yyyy-MM-dd')
      const fimMes = format(endOfMonth(hoje), 'yyyy-MM-dd')

      // Auto-vencimento: pendentes com data anterior a hoje → vencido
      await supabase
        .from('despesas')
        .update({ status: 'vencido' })
        .eq('status', 'pendente')
        .lt('data_vencimento', hojeStr)

      const [lanc, desp, lancRecentes, despVencendo] = await Promise.all([
        supabase.from('lancamentos').select('*').gte('data', inicioMes).lte('data', fimMes),
        supabase.from('despesas').select('*').in('status', ['pendente', 'vencido']),
        supabase.from('lancamentos').select('*, centros_custo(*), categorias(*)').order('data', { ascending: false }).limit(5),
        supabase.from('despesas').select('*, centros_custo(*), categorias(*)').eq('status', 'pendente').gte('data_vencimento', format(hoje, 'yyyy-MM-dd')).order('data_vencimento', { ascending: true }).limit(5),
      ])

      const lancamentos = lanc.data ?? []
      const entradas = lancamentos.filter((l: any) => l.tipo === 'entrada').reduce((s: number, l: any) => s + Number(l.valor), 0)
      const saidas = lancamentos.filter((l: any) => l.tipo === 'saida').reduce((s: number, l: any) => s + Number(l.valor), 0)
      setTotalEntradas(entradas)
      setTotalSaidas(saidas)

      const despesas = desp.data ?? []
      setDespesasPendentes(despesas.filter((d: any) => d.status === 'pendente').length)
      setDespesasVencidas(despesas.filter((d: any) => d.status === 'vencido').length)

      setUltimosLancamentos((lancRecentes.data ?? []) as Lancamento[])
      setProximasVencendo((despVencendo.data ?? []) as Despesa[])

      const meses: ResumoMes[] = []
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(hoje, i)
        const ini = format(startOfMonth(m), 'yyyy-MM-dd')
        const fim = format(endOfMonth(m), 'yyyy-MM-dd')
        const { data } = await supabase.from('lancamentos').select('tipo, valor').gte('data', ini).lte('data', fim)
        const d = data ?? []
        meses.push({
          mes: format(m, 'MMM', { locale: ptBR }),
          entradas: d.filter((l: any) => l.tipo === 'entrada').reduce((s: number, l: any) => s + Number(l.valor), 0),
          saidas: d.filter((l: any) => l.tipo === 'saida').reduce((s: number, l: any) => s + Number(l.valor), 0),
        })
      }
      setGraficoMensal(meses)

      const catMap: Record<string, number> = {}
      const { data: saidasCat } = await supabase.from('lancamentos').select('valor, categorias(nome)').eq('tipo', 'saida').gte('data', inicioMes).lte('data', fimMes)
      for (const l of saidasCat ?? []) {
        const cat = (l as any).categorias?.nome ?? 'Sem categoria'
        catMap[cat] = (catMap[cat] ?? 0) + Number(l.valor)
      }
      setGraficoCategorias(Object.entries(catMap).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor))

      setLoading(false)
    }
    load()
  }, [])

  const saldo = totalEntradas - totalSaidas

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          {format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })} &middot; Visao geral financeira
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Entradas do Mes</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalEntradas)}</p>
              </div>
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Saidas do Mes</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalSaidas)}</p>
              </div>
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${saldo >= 0 ? 'border-l-indigo-500' : 'border-l-orange-500'}`}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Saldo do Mes</p>
                <p className={`text-2xl font-bold mt-1 ${saldo >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>
                  {formatCurrency(saldo)}
                </p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${saldo >= 0 ? 'bg-indigo-100' : 'bg-orange-100'}`}>
                <DollarSign className={`w-5 h-5 ${saldo >= 0 ? 'text-indigo-600' : 'text-orange-600'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${despesasVencidas > 0 ? 'border-l-red-500' : 'border-l-yellow-500'}`}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">Contas Pendentes</p>
                <p className="text-2xl font-bold text-yellow-600 mt-1">{despesasPendentes}</p>
                {despesasVencidas > 0 && (
                  <p className="text-xs text-red-500 font-medium">{despesasVencidas} vencida(s)</p>
                )}
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${despesasVencidas > 0 ? 'bg-red-100' : 'bg-yellow-100'}`}>
                <AlertCircle className={`w-5 h-5 ${despesasVencidas > 0 ? 'text-red-600' : 'text-yellow-600'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Entradas vs Saidas - ultimos 6 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={graficoMensal} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `R$${(Number(v)/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Bar dataKey="entradas" name="Entradas" fill="#22c55e" radius={[6,6,0,0]} />
                <Bar dataKey="saidas" name="Saidas" fill="#ef4444" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saidas por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {graficoCategorias.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                Sem dados este mes
              </div>
            ) : (() => {
              // Top 6 categorias + "Outros" agregado — evita legenda gigante
              const ordenadas = [...graficoCategorias].sort((a, b) => b.valor - a.valor)
              const TOP = 6
              const principais = ordenadas.slice(0, TOP)
              const restoValor = ordenadas.slice(TOP).reduce((s, c) => s + c.valor, 0)
              const dados = restoValor > 0
                ? [...principais, { nome: `Outros (${ordenadas.length - TOP})`, valor: restoValor }]
                : principais
              const totalCat = dados.reduce((s, c) => s + c.valor, 0)
              return (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <ResponsiveContainer width="100%" height={200} className="sm:!w-[45%]">
                    <PieChart>
                      <Pie cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="valor" nameKey="nome" data={dados}>
                        {dados.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full sm:flex-1 space-y-1.5">
                    {dados.map((c, i) => (
                      <div key={c.nome} className="flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-slate-600 truncate flex-1">{c.nome}</span>
                        <span className="text-slate-400 text-xs flex-shrink-0">{totalCat > 0 ? ((c.valor / totalCat) * 100).toFixed(0) : 0}%</span>
                        <span className="font-semibold text-slate-800 text-xs flex-shrink-0 tabular-nums">{formatCurrency(c.valor)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Ultimos Lancamentos</CardTitle>
              <Link href="/lancamentos" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                Ver todos <ArrowRight size={12} />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-0">
            {ultimosLancamentos.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">Nenhum lancamento ainda</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {ultimosLancamentos.map(l => (
                  <div key={l.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${l.tipo === 'entrada' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{l.descricao}</p>
                        <p className="text-xs text-slate-400">{formatDate(l.data)}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold ${l.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                      {l.tipo === 'entrada' ? '+' : '-'}{formatCurrency(Number(l.valor))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Proximos Vencimentos</CardTitle>
              <Link href="/calendario" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                Calendario <ArrowRight size={12} />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-0">
            {proximasVencendo.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">Nenhuma despesa pendente</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {proximasVencendo.map(d => (
                  <div key={d.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{d.descricao}</p>
                        <p className="text-xs text-slate-400">Vence em {formatDate(d.data_vencimento)}</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-red-600">{formatCurrency(Number(d.valor))}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
