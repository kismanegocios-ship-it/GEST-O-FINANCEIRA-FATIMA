'use client'

import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: 'lg:max-w-md',
  md: 'lg:max-w-xl',
  lg: 'lg:max-w-2xl',
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    // Bloqueia scroll do body quando modal aberto
    if (open) document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal — fullscreen bottom sheet no mobile, centered no desktop */}
      <div className={cn(
        'relative bg-white w-full fade-in shadow-2xl flex flex-col',
        // Mobile: bottom sheet com cantos arredondados no topo
        'rounded-t-3xl max-h-[92dvh]',
        // Desktop: modal centralizado com cantos em todos os lados
        `lg:rounded-2xl lg:mx-4 ${sizes[size]}`,
      )}>
        {/* Handle bar (mobile) */}
        <div className="lg:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content — scrollable */}
        <div className="px-5 py-5 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
