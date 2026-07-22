'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { CurrencyInput } from '@/components/ui/currency-input'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Building2, RefreshCw } from 'lucide-react'
import type { ContaBancaria } from '@/lib/types'

interface FormData {
  nome: string
  banco: string
  agencia: string
  conta: string
  tipo: string
  saldo_inicial: string
  ativo: boolean
}

const emptyForm: FormData = {
  nome: '', banco: '', agencia: '', conta: '', tipo: 'corrente', saldo_inicial: '', ativo: true,
}

export default function ContasPage() {
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<ContaBancaria | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('contas_bancarias')
      .select('*')
      .order('nome')
    setContas((data ?? []) as ContaBancaria[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const abrirNovo = () => {
    setEditando(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const abrirEditar = (conta: ContaBancaria) => {
    setEditando(conta)
    setForm({
      nome: conta.nome,
      banco: conta.banco ?? '',
      agencia: conta.agencia ?? '',
      conta: conta.conta ?? '',
      tipo: conta.tipo,
      saldo_inicial: String(conta.saldo_inicial || ''),
      ativo: conta.ativo,
    })
    setModalOpen(true)
  }

  const salvar = async () => {
    if (!form.nome.trim()) { toast.error('Informe o nome da conta'); return }
    setSaving(true)
    const payload = {
      nome: form.nome.trim(),
      banco: form.banco.trim() || null,
      agencia: form.agencia.trim() || null,
      conta: form.conta.trim() || null,
      tipo: form.tipo,
      saldo_inicial: parseFloat(form.saldo_inicial) || 0,
      ativo: form.ativo,
    }
    const { error } = editando
      ? await supabase.from('contas_bancarias').update(payload).eq('id', editando.id)
      : await supabase.from('contas_bancarias').insert(payload)
    setSaving(false)
    if (error) { toast.error(`Erro: ${error.message}`); return }
    toast.success(editando ? 'Conta atualizada!' : 'Conta cadastrada!')
    setModalOpen(false)
    load()
  }

  const excluir = async (id: string) => {
    if (!confirm('Excluir esta conta bancária?')) return
    const { error } = await supabase.from('contas_bancarias').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir. A conta pode estar em uso.'); return }
    toast.success('Conta excluída')
    load()
  }

  const tipoLabel: Record<string, string> = {
    corrente: 'Conta Corrente',
    poupanca: 'Poupança',
    caixa: 'Caixa',
    investimento: 'Investimento',
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Contas Bancarias</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gerencie seus bancos e contas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load}><RefreshCw size={14} /></Button>
          <Button onClick={abrirNovo}>
            <Plus size={16} /> Nova Conta
          </Button>
        </div>
      </div>

      {/* Cards de contas */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : contas.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Nenhuma conta cadastrada</p>
            <p className="text-slate-400 text-sm mt-1">Cadastre seus bancos para organizar os pagamentos</p>
            <Button className="mt-4" onClick={abrirNovo}><Plus size={16} /> Cadastrar Conta</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contas.map(conta => (
            <Card key={conta.id} className={`transition-all ${!conta.ativo ? 'opacity-60' : ''}`}>
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm leading-tight">{conta.nome}</p>
                      {conta.banco && <p className="text-xs text-slate-400 mt-0.5">{conta.banco}</p>}
                    </div>
                  </div>
                  {!conta.ativo && (
                    <span className="text-[10px] font-semibold bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">Inativa</span>
                  )}
                </div>

                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Tipo</span>
                    <span className="text-slate-600 font-medium">{tipoLabel[conta.tipo] ?? conta.tipo}</span>
                  </div>
                  {conta.agencia && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Agência</span>
                      <span className="text-slate-600 font-medium">{conta.agencia}</span>
                    </div>
                  )}
                  {conta.conta && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Conta</span>
                      <span className="text-slate-600 font-medium">{conta.conta}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Saldo inicial</span>
                    <span className="text-slate-700 font-semibold">{formatCurrency(Number(conta.saldo_inicial))}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <Button variant="secondary" size="sm" onClick={() => abrirEditar(conta)} className="flex-1">
                    <Pencil size={13} /> Editar
                  </Button>
                  <button
                    onClick={() => excluir(conta.id)}
                    className="p-2 rounded-xl hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? 'Editar Conta' : 'Nova Conta Bancaria'}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Nome da conta *"
            placeholder="Ex: Bradesco Principal, Nubank, Caixa..."
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
          />
          <Input
            label="Banco"
            placeholder="Ex: Bradesco, Nubank, Caixa Economica..."
            value={form.banco}
            onChange={e => setForm(f => ({ ...f, banco: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Agência"
              placeholder="Ex: 0001-2"
              value={form.agencia}
              onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))}
            />
            <Input
              label="Número da conta"
              placeholder="Ex: 12345-6"
              value={form.conta}
              onChange={e => setForm(f => ({ ...f, conta: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Tipo"
              value={form.tipo}
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
            >
              <option value="corrente">Conta Corrente</option>
              <option value="poupanca">Poupança</option>
              <option value="caixa">Caixa</option>
              <option value="investimento">Investimento</option>
            </Select>
            <CurrencyInput
              label="Saldo inicial"
              value={form.saldo_inicial}
              onChange={e => setForm(f => ({ ...f, saldo_inicial: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
              className="w-4 h-4 accent-indigo-600"
            />
            <span className="text-sm text-slate-600">Conta ativa</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? 'Salvando...' : editando ? 'Salvar' : 'Cadastrar'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
