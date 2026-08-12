'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ComposedChart, Line
} from 'recharts'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download } from 'lucide-react'
import { fetchAllRows } from '@/lib/fetch-all'
import { useEmpresa } from '@/lib/empresa'

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

interface DespCatData extends CatData {
  pago: number
  pendente: number
}

export default function RelatoriosPage() {
  const [mesSelecionado, setMesSelecionado] = useState(format(new Date(), 'yyyy-MM'))
  const [meses, setMeses] = useState<MesData[]>([])
  const [categoriasSaida, setCategoriasSaida] = useState<CatData[]>([])
  const [categoriasEntrada, setCategoriasEntrada] = useState<CatData[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CatData[]>([])
  const [despesasCategoria, setDespesasCategoria] = useState<DespCatData[]>([])
  const [resumoMes, setResumoMes] = useState({ entradas: 0, saidas: 0, saldo: 0, despesasPagas: 0, despesasPendentes: 0 })
  const [loading, setLoading] = useState(true)
  const { empresaId } = useEmpresa()

  const load = useCallback(async () => {
    setLoading(true)
    const esc = <T,>(q: T): T => (empresaId ? (q as any).eq('empresa_id', empresaId) : q)
    const hoje = new Date()

    const mesesData: MesData[] = []
    for (let i = 11; i >= 0; i--) {
      const m = subMonths(hoje, i)
      const ini = format(startOfMonth(m), 'yyyy-MM-dd')
      const fim = format(endOfMonth(m), 'yyyy-MM-dd')
      const d = await fetchAllRows<{ tipo: string; valor: number }>(() =>
        esc(supabase.from('lancamentos').select('tipo, valor').gte('data', ini).lte('data', fim)))
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

    // Usa new Date(ano, mes-1, 1) para criar data em horário LOCAL
    const [anoSel, mesSel] = mesSelecionado.split('-').map(Number)
    const mesDate = new Date(anoSel, mesSel - 1, 1)
    const ini = format(startOfMonth(mesDate), 'yyyy-MM-dd')
    const fim = format(endOfMonth(mesDate), 'yyyy-MM-dd')

    const [lancamentos, despesas] = await Promise.all([
      fetchAllRows<any>(() => esc(supabase.from('lancamentos').select('tipo, valor, categorias(nome), centros_custo(nome)').gte('data', ini).lte('data', fim))),
      fetchAllRows<any>(() => esc(supabase.from('despesas').select('status, valor, categorias(nome), centros_custo(nome)').gte('data_vencimento', ini).lte('data_vencimento', fim))),
    ])
    const entradas = lancamentos.filter((l: any) => l.tipo === 'entrada').reduce((s: number, l: any) => s + Number(l.valor), 0)
    const saidas = lancamentos.filter((l: any) => l.tipo === 'saida').reduce((s: number, l: any) => s + Number(l.valor), 0)

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

    // Despesas (contas a pagar) por categoria — aparece mesmo antes do
    // pagamento, ao contrario dos lancamentos que so existem apos a baixa
    const despCatMap: Record<string, { total: number; pago: number; pendente: number }> = {}
    for (const d of despesas) {
      const status = (d as any).status
      if (status === 'cancelado') continue
      const cat = (d as any).categorias?.nome ?? 'Sem categoria'
      const v = Number((d as any).valor)
      const atual = despCatMap[cat] ?? { total: 0, pago: 0, pendente: 0 }
      atual.total += v
      if (status === 'pago') atual.pago += v
      else atual.pendente += v
      despCatMap[cat] = atual
    }
    setDespesasCategoria(
      Object.entries(despCatMap)
        .map(([nome, v]) => ({ nome, valor: v.total, pago: v.pago, pendente: v.pendente }))
        .sort((a, b) => b.valor - a.valor)
    )

    setLoading(false)
  }, [mesSelecionado, empresaId])

  useEffect(() => { load() }, [load])

  const baixarPDF = () => {
    window.print()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Relatorios</h1>
          <p className="text-sm text-slate-500 mt-0.5">Fechamento mensal e analise financeira</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <input
            type="month"
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            value={mesSelecionado}
            onChange={e => setMesSelecionado(e.target.value)}
          />
          <button
            onClick={baixarPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm print:hidden"
          >
            <Download size={15} /> Baixar PDF
          </button>
        </div>
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

      {/* Aviso: mes sem caixa realizado */}
      {!loading && resumoMes.entradas === 0 && resumoMes.saidas === 0 && resumoMes.despesasPendentes > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-800 font-medium">
            Nenhum lancamento de caixa neste mes ainda
          </p>
          <p className="text-xs text-amber-700 mt-1">
            Entradas e Saidas contam apenas o que ja foi <strong>realizado</strong> (despesa paga ou
            lancamento conciliado). As contas deste mes ainda estao pendentes — veja o quadro
            &quot;Despesas por Categoria&quot; abaixo para acompanhar por onde estao indo os gastos previstos.
          </p>
        </div>
      )}

      {/* Despesas (contas a pagar) por categoria */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>Despesas por Categoria (contas a pagar)</CardTitle>
            <span className="text-xs text-slate-400">Pagas + pendentes do mes, por vencimento</span>
          </div>
        </CardHeader>
        <CardContent>
          {despesasCategoria.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Sem despesas neste mes</p>
          ) : (
            <div className="space-y-3">
              {despesasCategoria.map((c, i) => {
                const totalGeral = despesasCategoria.reduce((s, x) => s + x.valor, 0)
                const pct = totalGeral > 0 ? (c.valor / totalGeral) * 100 : 0
                const pctPago = c.valor > 0 ? (c.pago / c.valor) * 100 : 0
                return (
                  <div key={c.nome}>
                    <div className="flex justify-between items-baseline text-sm mb-1 gap-2">
                      <span className="text-slate-600 truncate">{c.nome}</span>
                      <span className="font-semibold text-slate-800 flex-shrink-0">
                        {formatCurrency(c.valor)}
                        <span className="text-xs text-slate-400 font-normal ml-1">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    {/* Barra: verde = ja pago, faixa clara = ainda pendente */}
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                      <div className="h-2" style={{ width: `${pct * (pctPago / 100)}%`, background: '#22c55e' }} />
                      <div className="h-2" style={{ width: `${pct * (1 - pctPago / 100)}%`, background: COLORS[i % COLORS.length], opacity: 0.45 }} />
                    </div>
                    <div className="flex gap-3 mt-0.5 text-[11px]">
                      {c.pago > 0 && <span className="text-green-600">Pago: {formatCurrency(c.pago)}</span>}
                      {c.pendente > 0 && <span className="text-yellow-600">Pendente: {formatCurrency(c.pendente)}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>Evolucao 12 meses</CardTitle>
            <span className="text-xs text-slate-400">Barras = entradas/saidas · Linha = resultado (saldo)</span>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={meses} barGap={2} barCategoryGap="24%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="mesLabel" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `R$${(Number(v)/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatCurrency(Number(v))} cursor={{ fill: '#f8fafc' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="entradas" name="Entradas" fill="#22c55e" radius={[4,4,0,0]} maxBarSize={26} />
              <Bar dataKey="saidas" name="Saidas" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={26} />
              <Line type="monotone" dataKey="saldo" name="Resultado" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3, fill: '#4f46e5' }} activeDot={{ r: 5 }} />
            </ComposedChart>
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
            ) : (() => {
              const ordenados = [...centrosCusto].sort((a, b) => b.valor - a.valor)
              const TOP = 8
              const principais = ordenados.slice(0, TOP)
              const resto = ordenados.slice(TOP).reduce((s, c) => s + c.valor, 0)
              const dados = resto > 0 ? [...principais, { nome: `Outros (${ordenados.length - TOP})`, valor: resto }] : principais
              const total = dados.reduce((s, c) => s + c.valor, 0)
              const maxVal = Math.max(...dados.map(c => c.valor), 1)
              return (
                <div className="space-y-2.5">
                  {dados.map((c, i) => (
                    <div key={c.nome}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm text-slate-600 truncate">{c.nome}</span>
                        <span className="text-sm font-semibold text-slate-800 flex-shrink-0 tabular-nums">
                          {formatCurrency(c.valor)}
                          <span className="text-xs text-slate-400 font-normal ml-1.5">{total > 0 ? ((c.valor / total) * 100).toFixed(0) : 0}%</span>
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-2 rounded-full" style={{ width: `${(c.valor / maxVal) * 100}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Fechamento - {format(new Date(+mesSelecionado.slice(0,4), +mesSelecionado.slice(5,7) - 1, 1), 'MMMM yyyy', { locale: ptBR })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
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
