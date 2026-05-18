'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { toast } from 'sonner'
import { Plus, Link2, CheckCircle, Trash2, AlertCircle, RefreshCw } from 'lucide-react'
import type { ExtratoManual, Lancamento } from '@/lib/types'
import { format } from 'date-fns'

interface FormExtrato {
  descricao: string
  valor: string
  data: string
  tipo: 'credito' | 'debito'
  observacoes: string
}

const emptyForm: FormExtrato = {
  descricao: '', valor: '', data: format(new Date(), 'yyyy-MM-dd'), tipo: 'debito', observacoes: '',
}

export default function ConciliacaoPage() {
  const [extratos, setExtratos] = useState<ExtratoManual[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalConciliar, setModalConciliar] = useState<ExtratoManual | null>(null)
  const [form, setForm] = useState<FormExtrato>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [lancamentoSelecionado, setLancamentoSelecionado] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [ext, lanc] = await Promise.all([
      supabase.from('extrato_manual').select('*, lancamentos(*)').order('data', { ascending: false }),
      supabase.from('lancamentos').select('*').eq('conciliado', false).order('data', { ascending: false }),
    ])
    setExtratos((ext.data ?? []) as ExtratoManual[])
    setLancamentos((lanc.data ?? []) as Lancamento[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const salvarExtrato = async () => {
    if (!form.descricao || !form.valor || !form.data) {
      toast.error('Preencha os campos obrigatórios')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('extrato_manual').insert({
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      data: form.data,
      tipo: form.tipo,
      observacoes: form.observacoes || null,
      conciliado: false,
    })
    setSaving(false)
    if (error) { toast.error('Erro ao salvar'); return }
    toast.success('Lançamento de extrato adicionado!')
    setModalOpen(false)
    setForm(emptyForm)
    load()
  }

  const conciliar = async () => {
    if (!modalConciliar || !lancamentoSelecionado) {
      toast.error('Selecione um lançamento para conciliar')
      return
    }
    setSaving(true)
    await Promise.all([
      supabase.from('extrato_manual').update({ conciliado: true, lancamento_id: lancamentoSelecionado }).eq('id', modalConciliar.id),
      supabase.from('lancamentos').update({ conciliado: true }).eq('id', lancamentoSelecionado),
    ])
    setSaving(false)
    toast.success('Conciliação realizada!')
    setModalConciliar(null)
    setLancamentoSelecionado('')
    load()
  }

  const excluir = async (id: string) => {
    await supabase.from('extrato_manual').delete().eq('id', id)
    toast.success('Removido')
    load()
  }

  const pendentes = extratos.filter(e => !e.conciliado)
  const conciliados = extratos.filter(e => e.conciliado)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Conciliação Bancária</h1>
          <p className="text-sm text-slate-500 mt-1">Lance o extrato e concilie com seus lançamentos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load}><RefreshCw size={14} /></Button>
          <Button onClick={() => setModalOpen(true)}><Plus size={16} /> Lançar Extrato</Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-orange-400">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Pendentes</p>
            <p className="text-xl font-bold text-orange-600">{pendentes.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Conciliados</p>
            <p className="text-xl font-bold text-green-600">{conciliados.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">Lançamentos sem conciliar</p>
            <p className="text-xl font-bold text-blue-600">{lancamentos.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Pendentes */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-500" />
            <CardTitle>Pendentes de Conciliação</CardTitle>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Descrição</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Valor</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">Carregando...</td></tr>
              ) : pendentes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Tudo conciliado!</p>
                  </td>
                </tr>
              ) : pendentes.map(e => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-800">{e.descricao}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(e.data)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={e.tipo === 'credito' ? 'success' : 'danger'}>
                      {e.tipo === 'credito' ? 'Crédito' : 'Débito'}
                    </Badge>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${e.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(Number(e.valor))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setModalConciliar(e); setLancamentoSelecionado('') }}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors"
                        title="Conciliar"
                      >
                        <Link2 size={15} />
                      </button>
                      <button
                        onClick={() => excluir(e.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Conciliados */}
      {conciliados.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <CardTitle>Conciliados</CardTitle>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Descrição</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Valor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Lançamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {conciliados.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-700">{e.descricao}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(e.data)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={e.tipo === 'credito' ? 'success' : 'danger'}>
                        {e.tipo === 'credito' ? 'Crédito' : 'Débito'}
                      </Badge>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${e.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Number(e.valor))}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {(e as any).lancamentos?.descricao ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal Novo Extrato */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Lançar Extrato Manual" size="md">
        <div className="space-y-4">
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setForm(f => ({ ...f, tipo: 'credito' }))}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.tipo === 'credito' ? 'bg-green-600 text-white shadow-sm' : 'text-slate-600'}`}
            >
              Crédito (entrada)
            </button>
            <button
              onClick={() => setForm(f => ({ ...f, tipo: 'debito' }))}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.tipo === 'debito' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-600'}`}
            >
              Débito (saída)
            </button>
          </div>
          <Input label="Descrição *" placeholder="Descrição do lançamento no extrato..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Valor *" type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
            <Input label="Data *" type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
          </div>
          <Input label="Observações" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={salvarExtrato} disabled={saving}>{saving ? 'Salvando...' : 'Lançar no Extrato'}</Button>
        </div>
      </Modal>

      {/* Modal Conciliar */}
      <Modal open={!!modalConciliar} onClose={() => setModalConciliar(null)} title="Conciliar Lançamento" size="md">
        {modalConciliar && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Extrato bancário</p>
              <p className="font-semibold text-slate-800">{modalConciliar.descricao}</p>
              <p className="text-lg font-bold text-slate-700">{formatCurrency(Number(modalConciliar.valor))} · {formatDate(modalConciliar.data)}</p>
            </div>
            <Select label="Vincular ao lançamento do sistema" value={lancamentoSelecionado} onChange={e => setLancamentoSelecionado(e.target.value)}>
              <option value="">Selecione um lançamento...</option>
              {lancamentos.map(l => (
                <option key={l.id} value={l.id}>
                  {formatDate(l.data)} · {l.descricao} · {formatCurrency(Number(l.valor))} ({l.tipo})
                </option>
              ))}
            </Select>
            <p className="text-xs text-slate-500">Ao conciliar, o lançamento será marcado como conciliado.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModalConciliar(null)}>Cancelar</Button>
              <Button onClick={conciliar} disabled={saving || !lancamentoSelecionado}>
                <Link2 size={14} /> Confirmar Conciliação
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
