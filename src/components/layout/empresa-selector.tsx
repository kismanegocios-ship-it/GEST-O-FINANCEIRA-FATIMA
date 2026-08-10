'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useEmpresa } from '@/lib/empresa'
import { Building, ChevronDown, Check, Plus, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

export function EmpresaSelector({ compact = false }: { compact?: boolean }) {
  const { empresaId, empresa, empresas, pronto, setEmpresaId, recarregar } = useEmpresa()
  const [open, setOpen] = useState(false)
  const [gerenciar, setGerenciar] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Migration ainda nao rodada: mostra dica discreta
  if (!pronto) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
        <p className="text-[11px] font-semibold text-amber-700">Multiempresa inativo</p>
        <p className="text-[10px] text-amber-600 mt-0.5">Rode o SQL 006 no Supabase para ativar.</p>
      </div>
    )
  }

  const criar = async () => {
    if (!novoNome.trim()) { toast.error('Informe o nome da empresa'); return }
    setSalvando(true)
    const { data, error } = await supabase.from('empresas').insert({ nome: novoNome.trim() }).select('id').single()
    setSalvando(false)
    if (error) { toast.error('Erro ao criar: ' + error.message); return }
    setNovoNome('')
    await recarregar()
    if (data?.id) setEmpresaId(data.id as string)
    toast.success('Empresa criada!')
  }

  const renomear = async (id: string) => {
    if (!editNome.trim()) return
    setSalvando(true)
    const { error } = await supabase.from('empresas').update({ nome: editNome.trim() }).eq('id', id)
    setSalvando(false)
    if (error) { toast.error('Erro ao renomear: ' + error.message); return }
    setEditId(null)
    await recarregar()
    toast.success('Empresa renomeada')
  }

  const excluir = async (id: string, nome: string) => {
    if (empresas.length <= 1) { toast.error('Deixe ao menos uma empresa'); return }
    if (!confirm(`Excluir a empresa "${nome}"?\n\nATENCAO: isso apaga TODOS os dados dela (contas, lancamentos, etc). Nao pode ser desfeito.`)) return
    setSalvando(true)
    const { error } = await supabase.from('empresas').delete().eq('id', id)
    setSalvando(false)
    if (error) { toast.error('Erro ao excluir: ' + error.message); return }
    await recarregar()
    if (empresaId === id) {
      const outra = empresas.find(e => e.id !== id)
      if (outra) setEmpresaId(outra.id)
    }
    toast.success('Empresa excluida')
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 rounded-xl border transition-all ${
          compact ? 'px-2.5 py-1.5 bg-white border-slate-200' : 'px-3 py-2.5 bg-indigo-50 border-indigo-100 hover:bg-indigo-100'
        }`}
      >
        <Building size={compact ? 14 : 16} className="text-indigo-600 flex-shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          {!compact && <p className="text-[10px] text-indigo-400 leading-none uppercase font-semibold">Empresa</p>}
          <p className={`font-bold text-slate-800 truncate ${compact ? 'text-xs' : 'text-sm leading-tight mt-0.5'}`}>
            {empresa?.nome ?? 'Selecione'}
          </p>
        </div>
        <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 w-64 ${compact ? 'right-0' : 'left-0'}`}>
            <p className="text-[10px] font-semibold text-slate-400 uppercase px-2 py-1">Trocar empresa</p>
            <div className="max-h-60 overflow-y-auto">
              {empresas.map(e => (
                <button
                  key={e.id}
                  onClick={() => { setEmpresaId(e.id); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${e.id === empresaId ? 'bg-indigo-600' : 'border border-slate-300'}`}>
                    {e.id === empresaId && <Check size={11} className="text-white" />}
                  </span>
                  <span className="truncate">{e.nome}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setOpen(false); setGerenciar(true) }}
              className="w-full flex items-center gap-2 px-2 py-2 mt-1 rounded-lg text-sm text-indigo-600 hover:bg-indigo-50 transition-colors border-t border-slate-100"
            >
              <Pencil size={13} /> Gerenciar empresas
            </button>
          </div>
        </>
      )}

      {/* Modal gerenciar */}
      {gerenciar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setGerenciar(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">Gerenciar empresas</h3>
              <button onClick={() => setGerenciar(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto mb-4">
              {empresas.map(e => (
                <div key={e.id} className="flex items-center gap-2 p-2 rounded-xl bg-slate-50">
                  {editId === e.id ? (
                    <>
                      <input
                        autoFocus
                        className="flex-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        value={editNome}
                        onChange={ev => setEditNome(ev.target.value)}
                        onKeyDown={ev => ev.key === 'Enter' && renomear(e.id)}
                      />
                      <button onClick={() => renomear(e.id)} disabled={salvando} className="px-2 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold">Salvar</button>
                      <button onClick={() => setEditId(null)} className="px-2 py-1 rounded-lg text-slate-500 text-xs">Cancelar</button>
                    </>
                  ) : (
                    <>
                      <Building size={15} className="text-indigo-500 flex-shrink-0" />
                      <span className="flex-1 text-sm text-slate-700 truncate">{e.nome}</span>
                      <button onClick={() => { setEditId(e.id); setEditNome(e.nome) }} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500" title="Renomear"><Pencil size={13} /></button>
                      <button onClick={() => excluir(e.id, e.nome)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Excluir"><Trash2 size={13} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <input
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                placeholder="Nome da nova empresa..."
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && criar()}
              />
              <button onClick={criar} disabled={salvando} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
                <Plus size={15} /> Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
