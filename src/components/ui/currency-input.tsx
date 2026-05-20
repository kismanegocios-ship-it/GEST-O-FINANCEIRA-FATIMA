'use client'

import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface CurrencyInputProps {
  label?: string
  value: string
  onChange: (e: { target: { value: string } }) => void
  className?: string
  placeholder?: string
  error?: string
}

function formatBRL(raw: string): string {
  const num = parseFloat(raw)
  if (!raw || isNaN(num)) return ''
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseBRL(display: string): string {
  // Remove pontos (separador de milhar), troca vírgula por ponto decimal
  const cleaned = display
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? '' : String(num)
}

/**
 * Input monetário em R$.
 * O usuário digita livremente (ex: 10000 ou 10.000,00).
 * Ao sair do campo (blur), formata automaticamente para "10.000,00".
 * O onChange retorna o valor numérico bruto (ex: "10000").
 */
export function CurrencyInput({
  label,
  value,
  onChange,
  className,
  placeholder = '0,00',
  error,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(() => formatBRL(value))
  const [focused, setFocused] = useState(false)

  // Sincroniza quando valor externo muda (ex: reset do formulário)
  useEffect(() => {
    if (!focused) {
      setDisplay(formatBRL(value))
    }
  }, [value, focused])

  const handleFocus = () => {
    setFocused(true)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Deixa o usuário digitar livremente
    setDisplay(e.target.value)
  }

  const handleBlur = () => {
    setFocused(false)
    const raw = parseBRL(display)
    if (!raw) {
      setDisplay('')
      onChange({ target: { value: '' } })
    } else {
      setDisplay(formatBRL(raw))
      onChange({ target: { value: raw } })
    }
  }

  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      )}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none select-none">
          R$
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={display}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={cn(
            'w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all',
            error && 'border-red-400 focus:ring-red-500/30',
            className
          )}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
