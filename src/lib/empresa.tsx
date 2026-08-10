'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Empresa } from '@/lib/types'

interface EmpresaCtx {
  empresaId: string | null       // null = migration ainda nao rodada (modo global)
  empresa: Empresa | null
  empresas: Empresa[]
  pronto: boolean                // true quando a tabela empresas existe e ha empresa ativa
  loading: boolean
  setEmpresaId: (id: string) => void
  recarregar: () => Promise<void>
}

const Ctx = createContext<EmpresaCtx | null>(null)
const LS_KEY = 'empresa_atual'

export function EmpresaProvider({ children }: { children: React.ReactNode }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresaId, setEmpresaIdState] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const [loading, setLoading] = useState(true)

  const recarregar = useCallback(async () => {
    setLoading(true)
    // Se a tabela empresas nao existir (migration nao rodada), cai no modo global
    const { data, error } = await supabase.from('empresas').select('*').eq('ativo', true).order('nome')
    if (error) {
      setEmpresas([])
      setEmpresaIdState(null)
      setPronto(false)
      setLoading(false)
      return
    }
    const lista = (data ?? []) as Empresa[]
    setEmpresas(lista)
    setPronto(lista.length > 0)
    if (lista.length > 0) {
      const salvo = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null
      const valido = salvo && lista.some(e => e.id === salvo) ? salvo : lista[0].id
      setEmpresaIdState(valido)
      if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, valido)
    } else {
      setEmpresaIdState(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { recarregar() }, [recarregar])

  const setEmpresaId = (id: string) => {
    setEmpresaIdState(id)
    if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, id)
  }

  const empresa = empresas.find(e => e.id === empresaId) ?? null

  return (
    <Ctx.Provider value={{ empresaId, empresa, empresas, pronto, loading, setEmpresaId, recarregar }}>
      {children}
    </Ctx.Provider>
  )
}

export function useEmpresa(): EmpresaCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useEmpresa deve ser usado dentro de EmpresaProvider')
  return ctx
}
