import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileNav } from '@/components/layout/mobile-nav'
import { MobileHeader } from '@/components/layout/mobile-header'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'Sistema Financeiro Fatima',
  description: 'Gestao financeira completa',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen bg-slate-50">
        {/* Sidebar — visivel apenas em desktop */}
        <Sidebar />

        {/* Conteudo principal */}
        <main className="flex-1 min-h-screen flex flex-col
          lg:ml-64
          ml-0
        ">
          {/* Header mobile */}
          <MobileHeader />

          <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full fade-in pb-24 lg:pb-6">
            {children}
          </div>
        </main>

        {/* Bottom nav — visivel apenas no mobile */}
        <MobileNav />

        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
