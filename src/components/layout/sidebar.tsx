'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, FileText, ArrowLeftRight, GitMerge,
  Calendar, BarChart3, Briefcase, Wallet, LogOut, Building2, Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase-browser'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/despesas', label: 'Contas a Pagar', icon: FileText },
  { href: '/lancamentos', label: 'Lancamentos', icon: ArrowLeftRight },
  { href: '/conciliacao', label: 'Conciliacao', icon: GitMerge },
  { href: '/calendario', label: 'Calendario', icon: Calendar },
  { href: '/relatorios', label: 'Relatorios', icon: BarChart3 },
  { href: '/categorias', label: 'Categorias', icon: Tag },
  { href: '/centros-custo', label: 'Centros de Custo', icon: Briefcase },
  { href: '/contas', label: 'Contas Bancarias', icon: Building2 },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 flex-col z-40 shadow-sm">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm leading-tight">Sistema</p>
            <p className="font-bold text-indigo-600 text-sm leading-tight">Fatima</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon className={cn('flex-shrink-0', active ? 'text-indigo-600' : 'text-slate-400')} size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-slate-100 space-y-2">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all"
        >
          <LogOut size={16} className="flex-shrink-0" />
          Sair
        </button>
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-3">
          <p className="text-xs font-semibold text-indigo-700">Gestao Financeira</p>
          <p className="text-xs text-slate-500 mt-0.5">v1.1 &middot; {new Date().getFullYear()}</p>
        </div>
      </div>
    </aside>
  )
}
