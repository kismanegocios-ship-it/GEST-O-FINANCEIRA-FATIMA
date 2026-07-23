'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Tag, TrendingUp, TrendingDown } from 'lucide-react'
import type { Categoria } from '@/lib/types'

const CORES = [
  '#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#f472b6', '#06b6d4', '#84cc16', '#14b8a6',
]

interface FormData {
  nome: string
  tipo: 'entrada' | 'saida'
  cor: string
}

const emptyForm: FormData = { nome: '', tipo: 'saida', cor: '#6366f1' }

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Categoria | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'entrada' | 'saida'>('todos')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('categorias').select('*').order('tipo').order('nome')
    setCategorias((data ?? []) as Categoria[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const abrirNovo = () => {
    setEditando(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const abrirEditar = (c: Categoria) => {
    setEditando(c)
    setForm({ nome: c.nome, tipo: c.tipo, cor: c.cor })
    setModalOpen(true)
  }

  const salvar = async () => {
    if (!form.nome) { toast.error('Informe o nome'); return }
    setSaving(true)
    const payload = { nome: form.nome, tipo: form.tipo, cor: form.cor, icone: editando?.icone ?? 'tag' }
    const { error } = editando
      ? await supabase.from('categorias').update(payload as any).eq('id', editando.id)
      : await supabase.from('categorias').insert(payload as any)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar'); return }
    toast.success(editando ? 'Categoria atualizada!' : 'Categoria criada!')
    setModalOpen(false)
    load()
  }

  const excluir = async (id: string) => {
    const { error } = await supabase.from('categorias').delete().eq('id', id)
    if (error) { toast.error('Nao foi possivel excluir. Ela pode estar em uso.'); return }
    toast.success('Categoria excluida')
    load()
  }

  const filtradas = categorias.filter(c => filtroTipo === 'todos' || c.tipo === filtroTipo)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Categorias</h1>
          <p className="text-sm text-slate-500 mt-1">Organize entradas e saidas por categoria</p>
        </div>
        <Button onClick={abrirNovo} size="sm"><Plus size={15} /> Nova Categoria</Button>
      </div>

      <div className="flex gap-1.5">
        {(['todos', 'entrada', 'saida'] as const).map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)}
            className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${filtroTipo === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t === 'todos' ? 'Todas' : t === 'entrada' ? 'Entradas' : 'Saidas'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 text-center py-12 text-slate-400">Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-slate-400">
            <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nenhuma categoria cadastrada</p>
          </div>
        ) : filtradas.map(c => (
          <Card key={c.id} className="overflow-hidden">
            <div className="h-1.5" style={{ background: c.cor }} />
            <CardContent className="py-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${c.cor}20` }}>
                    {c.tipo === 'entrada'
                      ? <TrendingUp className="w-5 h-5" style={{ color: c.cor }} />
                      : <TrendingDown className="w-5 h-5" style={{ color: c.cor }} />}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{c.nome}</p>
                    <p className={`text-xs mt-0.5 ${c.tipo === 'entrada' ? 'text-green-600' : 'text-red-500'}`}>
                      {c.tipo === 'entrada' ? 'Entrada' : 'Saida'}
                    </p>
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
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Categoria' : 'Nova Categoria'} size="sm">
        <div className="space-y-4">
          <Input label="Nome *" placeholder="Ex: Aluguel, Vendas..." value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          <Select label="Tipo *" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'entrada' | 'saida' }))}>
            <option value="saida">Saida (despesa)</option>
            <option value="entrada">Entrada (receita)</option>
          </Select>
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
        </div>
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : editando ? 'Salvar' : 'Criar'}</Button>
        </div>
      </Modal>
    </div>
  )
}
