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
  // Remove pontos (milhar), troca vírgula por ponto decimal, remove resto
  const cleaned = display
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '')
  // Garante apenas um ponto decimal
  const parts = cleaned.split('.')
  const normalized = parts.length > 2
    ? parts[0] + '.' + parts.slice(1).join('')
    : cleaned
  const num = parseFloat(normalized)
  return isNaN(num) ? '' : String(num)
}

/**
 * Input monetário R$.
 * - Digita livremente (ex: 10000 ou 10.000,00 ou 1500,50)
 * - Ao sair do campo (blur) formata para "10.000,00"
 * - onChange é chamado a CADA tecla para garantir que o formulário
 *   sempre tenha o valor atualizado mesmo ao clicar direto em Salvar
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

  // Sincroniza display quando valor externo muda (ex: reset do formulário)
  useEffect(() => {
    if (!focused) {
      setDisplay(formatBRL(value))
    }
  }, [value, focused])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value
    setDisplay(inputVal)

    // Notifica o pai imediatamente com o valor numérico bruto
    // para que form.valor esteja sempre atualizado
    const raw = parseBRL(inputVal)
    onChange({ target: { value: raw } })
  }

  const handleBlur = () => {
    setFocused(false)
    // Apenas reformata o display na saída do campo
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
          onFocus={() => setFocused(true)}
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
