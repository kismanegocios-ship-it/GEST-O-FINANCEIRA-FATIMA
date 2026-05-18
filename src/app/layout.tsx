import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/sidebar'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'Sistema Financeiro Fátima',
  description: 'Gestão financeira completa',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen" style={{ background: '#f8fafc' }}>
        <Sidebar />
        <main className="flex-1 min-h-screen" style={{ marginLeft: '256px' }}>
          <div className="p-6 max-w-7xl mx-auto fade-in">
            {children}
          </div>
        </main>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
