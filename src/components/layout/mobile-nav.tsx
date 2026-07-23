'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, ArrowLeftRight, Calendar, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/despesas', label: 'Contas', icon: FileText },
  { href: '/lancamentos', label: 'Caixa', icon: ArrowLeftRight },
  { href: '/calendario', label: 'Agenda', icon: Calendar },
  { href: '/relatorios', label: 'Relatorios', icon: BarChart3 },
]

export function MobileNav() {
  const pathname = usePathname()
  if (pathname === '/login') return null

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
      <div className="flex items-stretch">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-all min-h-[60px]',
                active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <div className={cn(
                'relative p-1.5 rounded-xl transition-all',
                active ? 'bg-indigo-50' : ''
              )}>
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                {active && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                )}
              </div>
              <span className={cn(
                'text-[10px] font-semibold leading-none',
                active ? 'text-indigo-600' : 'text-slate-400'
              )}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
      {/* Safe area para iPhone */}
      <div className="h-safe-bottom bg-white" style={{ height: 'env(safe-area-inset-bottom)' }} />
    </nav>
  )
}
