'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  TrendingUp, TrendingDown, DollarSign, AlertCircle,
  Calendar, ArrowRight, Wallet, ArrowUpRight, ArrowDownRight, Building2
} from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Lancamento, Despesa } from '@/lib/types'
import { useEmpresa } from '@/lib/empresa'
import { fetchAllRows } from '@/lib/fetch-all'

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
  const [saldoCaixa, setSaldoCaixa] = useState(0)
  const [saldosBanco, setSaldosBanco] = useState<{ nome: string; saldo: number }[]>([])
  const [aPagar, setAPagar] = useState(0)
  const [aReceber, setAReceber] = useState(0)
  const [entradasPrev, setEntradasPrev] = useState(0)
  const [saidasPrev, setSaidasPrev] = useState(0)
  const [loading, setLoading] = useState(true)
  const { empresaId } = useEmpresa()

  useEffect(() => {
    async function load() {
      const esc = <T,>(q: T): T => (empresaId ? (q as any).eq('empresa_id', empresaId) : q)
      const hoje = new Date()
      const hojeStr = format(hoje, 'yyyy-MM-dd')
      const inicioMes = format(startOfMonth(hoje), 'yyyy-MM-dd')
      const fimMes = format(endOfMonth(hoje), 'yyyy-MM-dd')

      // Auto-vencimento: pendentes com data anterior a hoje → vencido (so da empresa atual)
      await esc(supabase
        .from('despesas')
        .update({ status: 'vencido' })
        .eq('status', 'pendente')
        .lt('data_vencimento', hojeStr))

      const [lanc, desp, lancRecentes, despVencendo] = await Promise.all([
        esc(supabase.from('lancamentos').select('*').gte('data', inicioMes).lte('data', fimMes)),
        esc(supabase.from('despesas').select('*').in('status', ['pendente', 'vencido'])),
        esc(supabase.from('lancamentos').select('*, centros_custo(*), categorias(*)').order('data', { ascending: false }).limit(5)),
        esc(supabase.from('despesas').select('*, centros_custo(*), categorias(*)').eq('status', 'pendente').gte('data_vencimento', format(hoje, 'yyyy-MM-dd')).order('data_vencimento', { ascending: true }).limit(5)),
      ])

      const lancamentos = lanc.data ?? []
      const entradas = lancamentos.filter((l: any) => l.tipo === 'entrada').reduce((s: number, l: any) => s + Number(l.valor), 0)
      const saidas = lancamentos.filter((l: any) => l.tipo === 'saida').reduce((s: number, l: any) => s + Number(l.valor), 0)
      setTotalEntradas(entradas)
      setTotalSaidas(saidas)

      const despesas = desp.data ?? []
      setDespesasPendentes(despesas.filter((d: any) => d.status === 'pendente').length)
      setDespesasVencidas(despesas.filter((d: any) => d.status === 'vencido').length)
      setAPagar(despesas.reduce((s: number, d: any) => s + Number(d.valor), 0))

      setUltimosLancamentos((lancRecentes.data ?? []) as Lancamento[])
      setProximasVencendo((despVencendo.data ?? []) as Despesa[])

      // A receber (pendente + vencido)
      const { data: recData } = await esc(supabase.from('contas_receber').select('valor').in('status', ['pendente', 'vencido']))
      setAReceber((recData ?? []).reduce((s: number, r: any) => s + Number(r.valor), 0))

      // Saldo em caixa REAL: saldo inicial das contas + todos os lancamentos (paginado)
      const [contasData, todosLancs] = await Promise.all([
        esc(supabase.from('contas_bancarias').select('*').eq('ativo', true).order('nome')),
        fetchAllRows<{ valor: number; tipo: string; conta_bancaria_id: string | null }>(() =>
          esc(supabase.from('lancamentos').select('valor, tipo, conta_bancaria_id'))),
      ])
      const contas = (contasData.data ?? []) as any[]
      const deltaPorConta: Record<string, number> = {}
      let deltaTotal = 0
      for (const l of todosLancs) {
        const d = l.tipo === 'entrada' ? Number(l.valor) : -Number(l.valor)
        deltaTotal += d
        if (l.conta_bancaria_id) deltaPorConta[l.conta_bancaria_id] = (deltaPorConta[l.conta_bancaria_id] ?? 0) + d
      }
      const saldoInicialTotal = contas.reduce((s, c) => s + Number(c.saldo_inicial), 0)
      setSaldoCaixa(saldoInicialTotal + deltaTotal)
      setSaldosBanco(contas.map(c => ({ nome: c.nome, saldo: Number(c.saldo_inicial) + (deltaPorConta[c.id] ?? 0) })).sort((a, b) => b.saldo - a.saldo))

      // Mes anterior (para variacao %)
      const mAnt = subMonths(hoje, 1)
      const { data: lancPrev } = await esc(supabase.from('lancamentos').select('tipo, valor')
        .gte('data', format(startOfMonth(mAnt), 'yyyy-MM-dd')).lte('data', format(endOfMonth(mAnt), 'yyyy-MM-dd')))
      setEntradasPrev((lancPrev ?? []).filter((l: any) => l.tipo === 'entrada').reduce((s: number, l: any) => s + Number(l.valor), 0))
      setSaidasPrev((lancPrev ?? []).filter((l: any) => l.tipo === 'saida').reduce((s: number, l: any) => s + Number(l.valor), 0))

      const meses: ResumoMes[] = []
      for (let i = 5; i >= 0; i--) {
        const m = subMonths(hoje, i)
        const ini = format(startOfMonth(m), 'yyyy-MM-dd')
        const fim = format(endOfMonth(m), 'yyyy-MM-dd')
        const { data } = await esc(supabase.from('lancamentos').select('tipo, valor').gte('data', ini).lte('data', fim))
        const d = data ?? []
        meses.push({
          mes: format(m, 'MMM', { locale: ptBR }),
          entradas: d.filter((l: any) => l.tipo === 'entrada').reduce((s: number, l: any) => s + Number(l.valor), 0),
          saidas: d.filter((l: any) => l.tipo === 'saida').reduce((s: number, l: any) => s + Number(l.valor), 0),
        })
      }
      setGraficoMensal(meses)

      const catMap: Record<string, number> = {}
      const { data: saidasCat } = await esc(supabase.from('lancamentos').select('valor, categorias(nome)').eq('tipo', 'saida').gte('data', inicioMes).lte('data', fimMes))
      for (const l of saidasCat ?? []) {
        const cat = (l as any).categorias?.nome ?? 'Sem categoria'
        catMap[cat] = (catMap[cat] ?? 0) + Number(l.valor)
      }
      setGraficoCategorias(Object.entries(catMap).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor))

      setLoading(false)
    }
    load()
  }, [empresaId])

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

      {/* Hero: Saldo em caixa + Entradas/Saidas/Resultado do mes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Saldo em caixa (hero) */}
        <div className="lg:col-span-1 rounded-2xl p-5 bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-lg flex flex-col justify-between">
          <div className="flex items-center gap-2 text-indigo-200 text-xs font-medium">
            <Wallet size={15} /> SALDO EM CAIXA
          </div>
          <div>
            <p className={`text-3xl font-extrabold mt-2 ${saldoCaixa < 0 ? 'text-red-200' : ''}`}>{formatCurrency(saldoCaixa)}</p>
            <p className="text-indigo-200 text-xs mt-1">Saldo inicial + todas as movimentacoes</p>
          </div>
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/20 text-xs">
            <div><span className="text-indigo-200">A pagar</span><p className="font-bold text-sm">{formatCurrency(aPagar)}</p></div>
            <div><span className="text-indigo-200">A receber</span><p className="font-bold text-sm">{formatCurrency(aReceber)}</p></div>
            <div><span className="text-indigo-200">Projetado</span><p className="font-bold text-sm">{formatCurrency(saldoCaixa - aPagar + aReceber)}</p></div>
          </div>
        </div>

        {/* Entradas / Saidas / Resultado do mes com variacao */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(() => {
            const varPct = (atual: number, ant: number) => ant === 0 ? null : ((atual - ant) / ant) * 100
            const kpis = [
              { label: 'Entradas do mes', val: totalEntradas, prev: entradasPrev, color: 'text-green-600', bg: 'bg-green-100', icon: <TrendingUp className="w-5 h-5 text-green-600" />, accent: 'border-l-green-500', up: 'good' },
              { label: 'Saidas do mes', val: totalSaidas, prev: saidasPrev, color: 'text-red-600', bg: 'bg-red-100', icon: <TrendingDown className="w-5 h-5 text-red-600" />, accent: 'border-l-red-500', up: 'bad' },
            ]
            return (<>
              {kpis.map(k => {
                const p = varPct(k.val, k.prev)
                const subiu = p != null && p >= 0
                const bom = k.up === 'good' ? subiu : !subiu
                return (
                  <Card key={k.label} className={`border-l-4 ${k.accent}`}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500 font-medium">{k.label}</p>
                        <div className={`w-9 h-9 ${k.bg} rounded-xl flex items-center justify-center`}>{k.icon}</div>
                      </div>
                      <p className={`text-2xl font-bold mt-1 ${k.color}`}>{formatCurrency(k.val)}</p>
                      {p != null && (
                        <p className={`text-xs font-medium mt-1 flex items-center gap-0.5 ${bom ? 'text-green-600' : 'text-red-500'}`}>
                          {subiu ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          {Math.abs(p).toFixed(0)}% vs mes passado
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
              <Card className={`border-l-4 ${saldo >= 0 ? 'border-l-indigo-500' : 'border-l-orange-500'}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500 font-medium">Resultado do mes</p>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${saldo >= 0 ? 'bg-indigo-100' : 'bg-orange-100'}`}>
                      <DollarSign className={`w-5 h-5 ${saldo >= 0 ? 'text-indigo-600' : 'text-orange-600'}`} />
                    </div>
                  </div>
                  <p className={`text-2xl font-bold mt-1 ${saldo >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>{formatCurrency(saldo)}</p>
                  <p className="text-xs text-slate-400 mt-1">{despesasPendentes} conta(s) pendente(s){despesasVencidas > 0 ? ` · ${despesasVencidas} vencida(s)` : ''}</p>
                </CardContent>
              </Card>
            </>)
          })()}
        </div>
      </div>

      {/* Saldo por banco */}
      {saldosBanco.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2"><Building2 size={16} className="text-slate-400" /><CardTitle>Saldo por Banco</CardTitle></div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {saldosBanco.map(b => (
                <div key={b.nome} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0"><Building2 size={15} className="text-indigo-600" /></div>
                    <span className="text-sm font-medium text-slate-700 truncate">{b.nome}</span>
                  </div>
                  <span className={`text-sm font-bold flex-shrink-0 ${b.saldo >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{formatCurrency(b.saldo)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
              // Ranking em barras horizontais: Top 8 + "Outros" agregado
              const ordenadas = [...graficoCategorias].sort((a, b) => b.valor - a.valor)
              const TOP = 8
              const principais = ordenadas.slice(0, TOP)
              const restoValor = ordenadas.slice(TOP).reduce((s, c) => s + c.valor, 0)
              const dados = restoValor > 0
                ? [...principais, { nome: `Outros (${ordenadas.length - TOP})`, valor: restoValor }]
                : principais
              const totalCat = dados.reduce((s, c) => s + c.valor, 0)
              const maxVal = Math.max(...dados.map(c => c.valor), 1)
              return (
                <div className="space-y-2.5">
                  {dados.map((c, i) => {
                    const pctTotal = totalCat > 0 ? (c.valor / totalCat) * 100 : 0
                    const pctBarra = (c.valor / maxVal) * 100
                    return (
                      <div key={c.nome}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm text-slate-600 truncate">{c.nome}</span>
                          <span className="text-sm font-semibold text-slate-800 flex-shrink-0 tabular-nums">
                            {formatCurrency(c.valor)}
                            <span className="text-xs text-slate-400 font-normal ml-1.5">{pctTotal.toFixed(0)}%</span>
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${pctBarra}%`, background: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                    )
                  })}
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
