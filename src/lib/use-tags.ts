'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Tag } from '@/lib/types'

// Hook simples pra carregar/gerenciar tags da empresa atual
export function useTags(empresaId: string | null) {
  const [tags, setTags] = useState<Tag[]>([])

  const recarregar = useCallback(async () => {
    let q = supabase.from('tags').select('*').order('nome')
    if (empresaId) q = q.eq('empresa_id', empresaId)
    const { data } = await q
    setTags((data ?? []) as Tag[])
  }, [empresaId])

  useEffect(() => { recarregar() }, [recarregar])

  const criar = async (nome: string, cor: string): Promise<boolean> => {
    const { error } = await supabase.from('tags').insert({ nome, cor, ...(empresaId ? { empresa_id: empresaId } : {}) })
    if (error) return false
    await recarregar()
    return true
  }
  const renomear = async (id: string, nome: string, cor: string): Promise<boolean> => {
    const { error } = await supabase.from('tags').update({ nome, cor }).eq('id', id)
    if (error) return false
    await recarregar()
    return true
  }
  const excluir = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('tags').delete().eq('id', id)
    if (error) return false
    await recarregar()
    return true
  }

  return { tags, recarregar, criar, renomear, excluir }
}
