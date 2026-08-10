'use client'

import { usePathname } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { EmpresaSelector } from '@/components/layout/empresa-selector'

const LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/despesas': 'Contas a Pagar',
  '/lancamentos': 'Lancamentos',
  '/conciliacao': 'Conciliacao',
  '/calendario': 'Calendario',
  '/relatorios': 'Relatorios',
  '/categorias': 'Categorias',
  '/centros-custo': 'Centros de Custo',
}

export function MobileHeader() {
  const pathname = usePathname()
  if (pathname === '/login') return null

  const label = Object.entries(LABELS).find(([key]) =>
    key === '/' ? pathname === '/' : pathname.startsWith(key)
  )?.[1] ?? 'Sistema'

  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-100 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-xs text-slate-400 leading-none">Sistema</p>
            <p className="text-sm font-bold text-indigo-600 leading-tight">Fatima</p>
          </div>
        </div>
        <div className="max-w-[45%]">
          <EmpresaSelector compact />
        </div>
      </div>
      <p className="px-4 pb-1.5 -mt-1 text-[11px] text-slate-400">{label}</p>
    </header>
  )
}
