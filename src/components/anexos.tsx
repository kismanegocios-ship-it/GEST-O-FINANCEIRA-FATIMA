'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Paperclip, X, Loader2, Plus } from 'lucide-react'
import type { Anexo } from '@/lib/types'
import { subirAnexos, removerAnexo, anexoUrl, MAX_ANEXO } from '@/lib/anexos'

interface Props {
  table: 'despesas' | 'contas_receber'
  rowId: string | null           // null = registro novo (arquivos ficam "staged" ate salvar)
  anexos: Anexo[]                // ja salvos (quando ha rowId)
  onChanged?: (a: Anexo[]) => void   // apos alterar no banco
  staged?: File[]                // arquivos escolhidos antes de salvar (registro novo)
  onStagedChange?: (f: File[]) => void
}

export function AnexosManager({ table, rowId, anexos, onChanged, staged = [], onStagedChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const pick = () => { if (inputRef.current) inputRef.current.value = ''; inputRef.current?.click() }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const arr = Array.from(files)
    const grande = arr.find(f => f.size > MAX_ANEXO)
    if (grande) { toast.error(`"${grande.name}" tem mais de 2 MB`); return }
    if (rowId) {
      setBusy(true)
      try {
        const final = await subirAnexos(table, rowId, anexos, arr)
        onChanged?.(final)
        toast.success(`${arr.length} anexo(s) adicionado(s)`)
      } catch (e) { toast.error('Erro ao anexar: ' + (e as Error).message) }
      setBusy(false)
    } else {
      onStagedChange?.([...staged, ...arr])
    }
  }

  const remove = async (a: Anexo) => {
    if (!rowId) return
    if (!confirm(`Remover "${a.nome}"?`)) return
    setBusy(true)
    try { const final = await removerAnexo(table, rowId, anexos, a); onChanged?.(final); toast.success('Anexo removido') }
    catch (e) { toast.error('Erro: ' + (e as Error).message) }
    setBusy(false)
  }

  const total = anexos.length + staged.length

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
      {total > 0 && (
        <div className="space-y-1.5 mb-2">
          {anexos.map(a => (
            <div key={a.path} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
                <Paperclip size={13} className="text-indigo-500 flex-shrink-0" /><span className="truncate">{a.nome}</span>
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <a href={anexoUrl(a.path)} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50">Ver</a>
                <button type="button" onClick={() => remove(a)} className="px-2 py-1 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50">Remover</button>
              </div>
            </div>
          ))}
          {staged.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-indigo-700 min-w-0">
                <Paperclip size={13} className="flex-shrink-0" /><span className="truncate">{f.name}</span>
                <span className="text-xs text-indigo-400 flex-shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
              </span>
              <button type="button" onClick={() => onStagedChange?.(staged.filter((_, idx) => idx !== i))} className="p-1 rounded-lg hover:bg-indigo-100 text-indigo-500 flex-shrink-0"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={pick} disabled={busy}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all disabled:opacity-60">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Anexar arquivo(s) — imagem ou PDF, max 2MB cada
      </button>
      {!rowId && staged.length > 0 && <p className="text-[11px] text-slate-400 mt-1">Os arquivos serao enviados ao salvar.</p>}
    </div>
  )
}
