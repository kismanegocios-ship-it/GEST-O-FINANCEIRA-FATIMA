'use client'

import { cn } from '@/lib/utils'

interface CurrencyInputProps {
  label?: string
  value: string
  onChange: (e: { target: { value: string } }) => void
  className?: string
  placeholder?: string
  error?: string
}

/**
 * Input de valor monetário em Real (R$).
 * Exibe formatado (ex: 10.000,50) e retorna o valor numérico bruto (ex: "10000.5")
 * compatível com a interface do Input padrão (onChange com e.target.value).
 */
export function CurrencyInput({
  label,
  value,
  onChange,
  className,
  placeholder = '0,00',
  error,
}: CurrencyInputProps) {
  // Formata número bruto para exibição: 10000.5 → "10.000,50"
  const toDisplay = (raw: string) => {
    const num = parseFloat(raw)
    if (!raw || isNaN(num)) return ''
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove R$, pontos e espaços; troca vírgula por ponto
    const raw = e.target.value
      .replace(/R\$\s?/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.]/g, '')

    // Garante no máximo 2 casas decimais
    const match = raw.match(/^\d*\.?\d{0,2}$/)
    if (raw === '' || raw === '.') {
      onChange({ target: { value: '' } })
    } else if (match) {
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
          value={toDisplay(value)}
          onChange={handleChange}
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
