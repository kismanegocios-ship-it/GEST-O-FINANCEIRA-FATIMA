'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const COLORS = ['#6366f1', '#f472b6', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6']

interface MesData {
  mes: string
  mesLabel: string
  entradas: number
  saidas: number
  saldo: number
}

interface CatData {
  nome: string
  valor: number
}

export default function RelatoriosPage() {
  const [mesSelecionado, setMesSelecionado] = useState(format(new Date(), 'yyyy-MM'))
  const [meses, setMeses] = useState<MesData[]>([])
  const [categoriasSaida, setCategoriasSaida] = useState<CatData[]>([])
  const [categoriasEntrada, setCategoriasEntrada] = useState<CatData[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CatData[]>([])
  const [resumoMes, setResumoMes] = useState({ entradas: 0, saidas: 0, saldo: 0, despesasPagas: 0, despesasPendentes: 0 })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const hoje = new Date()

    const mesesData: MesData[] = []
    for (let i = 11; i >= 0; i--) {
      const m = subMonths(hoje, i)
      const ini = format(startOfMonth(m), 'yyyy-MM-dd')
      const fim = format(endOfMonth(m), 'yyyy-MM-dd')
      const { data } = await supabase.from('lancamentos').select('tipo, valor').gte('data', ini).lte('data', fim)
      const d = data ?? []
      const entradas = d.filter((l: any) => l.tipo === 'entrada').reduce((s: number, l: any) => s + Number(l.valor), 0)
      const saidas = d.filter((l: any) => l.tipo === 'saida').reduce((s: number, l: any) => s + Number(l.valor), 0)
      mesesData.push({
        mes: format(m, 'yyyy-MM'),
        mesLabel: format(m, 'MMM/yy', { locale: ptBR }),
        entradas,
        saidas,
        saldo: entradas - saidas,
      })
    }
    setMeses(mesesData)

    const mesDate = new Date(mesSelecionado + '-01')
    const ini = format(startOfMonth(mesDate), 'yyyy-MM-dd')
    const fim = format(endOfMonth(mesDate), 'yyyy-MM-dd')

    const [lanc, desp] = await Promise.all([
      supabase.from('lancamentos').select('tipo, valor, categorias(nome), centros_custo(nome)').gte('data', ini).lte('data', fim),
      supabase.from('despesas').select('status, valor').gte('data_vencimento', ini).lte('data_vencimento', fim),
    ])

    const lancamentos = lanc.data ?? []
    const entradas = lancamentos.filter((l: any) => l.tipo === 'entrada').reduce((s: number, l: any) => s + Number(l.valor), 0)
    const saidas = lancamentos.filter((l: any) => l.tipo === 'saida').reduce((s: number, l: any) => s + Number(l.valor), 0)
    const despesas = desp.data ?? []

    setResumoMes({
      entradas,
      saidas,
      saldo: entradas - saidas,
      despesasPagas: despesas.filter((d: any) => d.status === 'pago').reduce((s: number, d: any) => s + Number(d.valor), 0),
      despesasPendentes: despesas.filter((d: any) => ['pendente', 'vencido'].includes(d.status)).reduce((s: number, d: any) => s + Number(d.valor), 0),
    })

    const catSaidaMap: Record<string, number> = {}
    const catEntradaMap: Record<string, number> = {}
    const ccMap: Record<string, number> = {}
    for (const l of lancamentos) {
      const cat = (l as any).categorias?.nome ?? 'Sem categoria'
      const cc = (l as any).centros_custo?.nome ?? 'Sem CC'
      if ((l as any).tipo === 'saida') {
        catSaidaMap[cat] = (catSaidaMap[cat] ?? 0) + Number((l as any).valor)
        ccMap[cc] = (ccMap[cc] ?? 0) + Number((l as any).valor)
      } else {
        catEntradaMap[cat] = (catEntradaMap[cat] ?? 0) + Number((l as any).valor)
      }
    }
    setCategoriasSaida(Object.entries(catSaidaMap).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor))
    setCategoriasEntrada(Object.entries(catEntradaMap).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor))
    setCentrosCusto(Object.entries(ccMap).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor))

    setLoading(false)
  }, [mesSelecionado])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Relatorios</h1>
          <p className="text-sm text-slate-500 mt-1">Fechamento mensal e analise financeira</p>
        </div>
        <input
          type="month"
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          value={mesSelecionado}
          onChange={e => setMesSelecionado(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Entradas</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(resumoMes.entradas)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Saidas</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(resumoMes.saidas)}</p>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${resumoMes.saldo >= 0 ? 'border-l-indigo-500' : 'border-l-orange-500'}`}>
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Saldo</p>
            <p className={`text-2xl font-bold ${resumoMes.saldo >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>
              {formatCurrency(resumoMes.saldo)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-400">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Despesas pendentes</p>
            <p className="text-2xl font-bold text-yellow-600">{formatCurrency(resumoMes.despesasPendentes)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolucao 12 meses - Entradas vs Saidas</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={meses}>
              <defs>
                <linearGradient id="gradEntradas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradSaidas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mesLabel" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `R$${(Number(v)/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="entradas" name="Entradas" stroke="#22c55e" fill="url(#gradEntradas)" strokeWidth={2} />
              <Area type="monotone" dataKey="saidas" name="Saidas" stroke="#ef4444" fill="url(#gradSaidas)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Saldo Mensal</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={meses}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mesLabel" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `R$${(Number(v)/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
              <Bar dataKey="saldo" name="Saldo" radius={[6,6,0,0]}>
                {meses.map((m, i) => (
                  <Cell key={i} fill={m.saldo >= 0 ? '#6366f1' : '#f97316'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Saidas por Categoria</CardTitle></CardHeader>
          <CardContent>
            {categoriasSaida.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">Sem dados</p>
            ) : (
              <div className="space-y-2">
                {categoriasSaida.map((c, i) => {
                  const pct = resumoMes.saidas > 0 ? (c.valor / resumoMes.saidas) * 100 : 0
                  return (
                    <div key={c.nome}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600">{c.nome}</span>
                        <span className="font-semibold text-slate-800">{formatCurrency(c.valor)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full">
                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Entradas por Categoria</CardTitle></CardHeader>
          <CardContent>
            {categoriasEntrada.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">Sem dados</p>
            ) : (
              <div className="space-y-2">
                {categoriasEntrada.map((c, i) => {
                  const pct = resumoMes.entradas > 0 ? (c.valor / resumoMes.entradas) * 100 : 0
                  return (
                    <div key={c.nome}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600">{c.nome}</span>
                        <span className="font-semibold text-slate-800">{formatCurrency(c.valor)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full">
                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Saidas por Centro de Custo</CardTitle></CardHeader>
          <CardContent>
            {centrosCusto.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={centrosCusto} cx="50%" cy="50%" outerRadius={70} dataKey="valor" nameKey="nome">
                    {centrosCusto.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Fechamento - {format(new Date(mesSelecionado + '-01'), 'MMMM yyyy', { locale: ptBR })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h4 className="font-semibold text-green-700 mb-3 text-sm uppercase">Entradas</h4>
              <div className="space-y-1">
                {categoriasEntrada.map(c => (
                  <div key={c.nome} className="flex justify-between py-1.5 border-b border-slate-50 text-sm">
                    <span className="text-slate-600">{c.nome}</span>
                    <span className="font-medium text-green-600">{formatCurrency(c.valor)}</span>
                  </div>
                ))}
                {categoriasEntrada.length === 0 && <p className="text-slate-400 text-sm">Sem entradas</p>}
                <div className="flex justify-between py-2 font-bold text-sm">
                  <span className="text-slate-800">Total Entradas</span>
                  <span className="text-green-600">{formatCurrency(resumoMes.entradas)}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-red-700 mb-3 text-sm uppercase">Saidas</h4>
              <div className="space-y-1">
                {categoriasSaida.map(c => (
                  <div key={c.nome} className="flex justify-between py-1.5 border-b border-slate-50 text-sm">
                    <span className="text-slate-600">{c.nome}</span>
                    <span className="font-medium text-red-600">{formatCurrency(c.valor)}</span>
                  </div>
                ))}
                {categoriasSaida.length === 0 && <p className="text-slate-400 text-sm">Sem saidas</p>}
                <div className="flex justify-between py-2 font-bold text-sm">
                  <span className="text-slate-800">Total Saidas</span>
                  <span className="text-red-600">{formatCurrency(resumoMes.saidas)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className={`mt-6 p-4 rounded-xl flex items-center justify-between ${resumoMes.saldo >= 0 ? 'bg-green-50' : 'bg-orange-50'}`}>
            <span className="font-bold text-slate-800 uppercase text-sm">Resultado do Mes</span>
            <span className={`text-2xl font-bold ${resumoMes.saldo >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
              {resumoMes.saldo >= 0 ? '+' : ''}{formatCurrency(resumoMes.saldo)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
