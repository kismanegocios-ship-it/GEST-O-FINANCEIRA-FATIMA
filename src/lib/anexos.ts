import { supabase } from '@/lib/supabase'
import type { Anexo } from '@/lib/types'

export const MAX_ANEXO = 2 * 1024 * 1024 // 2 MB por arquivo
const BUCKET = 'comprovantes'

export function anexoUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

function buildPath(table: string, rowId: string, fileName: string): string {
  const ext = fileName.includes('.') ? fileName.split('.').pop() : ''
  const safe = fileName.replace(/[^\w.\-]/g, '_').slice(0, 60)
  const suf = ext && !safe.includes('.') ? '.' + ext : ''
  return `${table}/${rowId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}${suf}`
}

// Sobe varios arquivos e adiciona ao array anexos da linha. Lanca em caso de erro.
export async function subirAnexos(table: string, rowId: string, existentes: Anexo[], files: File[]): Promise<Anexo[]> {
  const novos: Anexo[] = []
  for (const f of files) {
    if (f.size > MAX_ANEXO) throw new Error(`"${f.name}" tem mais de 2 MB`)
    const path = buildPath(table, rowId, f.name)
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false })
    if (error) throw new Error(error.message)
    novos.push({ path, nome: f.name })
  }
  const final = [...existentes, ...novos]
  const { error: dbErr } = await supabase.from(table).update({ anexos: final }).eq('id', rowId)
  if (dbErr) throw new Error(dbErr.message)
  return final
}

export async function removerAnexo(table: string, rowId: string, existentes: Anexo[], alvo: Anexo): Promise<Anexo[]> {
  await supabase.storage.from(BUCKET).remove([alvo.path])
  const final = existentes.filter(a => a.path !== alvo.path)
  await supabase.from(table).update({ anexos: final }).eq('id', rowId)
  return final
}
