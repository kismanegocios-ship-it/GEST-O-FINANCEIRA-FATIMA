'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Briefcase } from 'lucide-react'
import type { CentroCusto } from '@/lib/types'

const CORES = [
  '#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#f472b6', '#06b6d4', '#84cc16', '#14b8a6',
]

interface FormData {
  nome: string
  descricao: string
  cor: string
  ativo: boolean
}

const emptyForm: FormData = { nome: '', descricao: '', cor: '#6366f1', ativo: true }

export default function CentrosCustoPage() {
  const [centros, setCentros] = useState<CentroCusto[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<CentroCusto | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('centros_custo').select('*').order('nome')
    setCentros(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const abrirNovo = () => {
    setEditando(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const abrirEditar = (c: CentroCusto) => {
    setEditando(c)
    setForm({ nome: c.nome, descricao: c.descricao ?? '', cor: c.cor, ativo: c.ativo })
    setModalOpen(true)
  }

  const salvar = async () => {
    if (!form.nome) { toast.error('Informe o nome'); return }
    setSaving(true)
    const payload = { nome: form.nome, descricao: form.descricao || null, cor: form.cor, ativo: form.ativo }
    const { error } = editando
      ? await supabase.from('centros_custo').update(payload as any).eq('id', editando.id)
      : await supabase.from('centros_custo').insert(payload as any)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar'); return }
    toast.success(editando ? 'Centro atualizado!' : 'Centro criado!')
    setModalOpen(false)
    load()
  }

  const excluir = async (id: string) => {
    await supabase.from('centros_custo').delete().eq('id', id)
    toast.success('Centro excluído')
    load()
  }

  const toggleAtivo = async (c: CentroCusto) => {
    await supabase.from('centros_custo').update({ ativo: !c.ativo }).eq('id', c.id)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Centros de Custo</h1>
          <p className="text-sm text-slate-500 mt-1">Organize suas despesas por área ou departamento</p>
        </div>
        <Button onClick={abrirNovo}><Plus size={16} /> Novo Centro</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 text-center py-12 text-slate-400">Carregando...</div>
        ) : centros.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-slate-400">
            <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nenhum centro de custo cadastrado</p>
          </div>
        ) : centros.map(c => (
          <Card key={c.id} className={`overflow-hidden ${!c.ativo ? 'opacity-60' : ''}`}>
            <div className="h-1.5" style={{ background: c.cor }} />
            <CardContent className="py-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${c.cor}20` }}>
                    <Briefcase className="w-5 h-5" style={{ color: c.cor }} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{c.nome}</p>
                    {c.descricao && <p className="text-xs text-slate-500 mt-0.5">{c.descricao}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => abrirEditar(c)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => excluir(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => toggleAtivo(c)}>
                  <Badge variant={c.ativo ? 'success' : 'neutral'}>{c.ativo ? 'Ativo' : 'Inativo'}</Badge>
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Centro de Custo' : 'Novo Centro de Custo'} size="sm">
        <div className="space-y-4">
          <Input label="Nome *" placeholder="Ex: Administrativo, Vendas..." value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          <Input label="Descrição" placeholder="Descrição opcional..." value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Cor</label>
            <div className="flex gap-2 flex-wrap">
              {CORES.map(cor => (
                <button
                  key={cor}
                  onClick={() => setForm(f => ({ ...f, cor }))}
                  className={`w-8 h-8 rounded-lg transition-all ${form.cor === cor ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : ''}`}
                  style={{ background: cor }}
                />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
            <span className="text-sm text-slate-600">Centro ativo</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : editando ? 'Salvar' : 'Criar'}</Button>
        </div>
      </Modal>
    </div>
  )
}
