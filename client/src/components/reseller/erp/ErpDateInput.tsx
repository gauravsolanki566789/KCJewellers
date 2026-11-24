'use client'

import { erpInputCls } from '@/components/reseller/erp/erp-ui'
import { isoToDdMmYyyyInput } from '@/lib/erp-date-format'

type Props = {
  value: string
  onChange: (iso: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  title?: string
}

/** dd/mm/yyyy text field — same format as ERP filters (not browser locale date picker). */
export function ErpDateInput({
  value,
  onChange,
  className,
  placeholder = 'dd/mm/yyyy',
  disabled = false,
  readOnly = false,
  title,
}: Props) {
  const raw = String(value || '')
  const display = /^\d{4}-\d{2}-\d{2}/.test(raw.trim()) ? isoToDdMmYyyyInput(raw) : raw
  const locked = disabled || readOnly

  return (
    <input
      type="text"
      inputMode="numeric"
      className={`${className ?? erpInputCls}${locked ? ' cursor-not-allowed bg-[var(--color-slate-900,#faf8f4)]' : ''}`}
      placeholder={placeholder}
      value={display}
      onChange={(e) => {
        if (locked) return
        onChange(e.target.value)
      }}
      autoComplete="off"
      disabled={disabled}
      readOnly={readOnly}
      title={title}
      aria-disabled={locked || undefined}
    />
  )
}
