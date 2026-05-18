/**
 * Wrapper responsivo: tabela no desktop, cards no mobile.
 * Uso: envolva o <table> com <TableOrCards> e passe também o <MobileCards>.
 */
import { cn } from '@/lib/utils'

export function TableWrapper({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('hidden md:block overflow-x-auto', className)}>
      {children}
    </div>
  )
}

export function CardList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('md:hidden divide-y divide-slate-50', className)}>
      {children}
    </div>
  )
}

export function MobileCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-4 py-3', className)}>
      {children}
    </div>
  )
}
