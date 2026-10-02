import { useEffect, useRef, useState } from 'react'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
  description?: string
}

interface CustomSelectProps<T extends string | number> {
  value: T | null
  options: SelectOption<T>[]
  onChange: (value: T) => void
  placeholder?: string
  label?: string
  disabled?: boolean
}

/** A small, touch-friendly replacement for the browser's native select. */
export function CustomSelect<T extends string | number>({
  value, options, onChange, placeholder = 'اختر من القائمة', label, disabled = false,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="custom-select" ref={ref}>
      {label && <label className="input-label">{label}</label>}
      <button
        type="button"
        className={`custom-select-trigger ${open ? 'is-open' : ''}`}
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? '' : 'custom-select-placeholder'}>{selected?.label ?? placeholder}</span>
        <span className="custom-select-chevron">⌄</span>
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`custom-select-option ${option.value === value ? 'is-selected' : ''}`}
              key={String(option.value)}
              onClick={() => { onChange(option.value); setOpen(false) }}
            >
              <span>{option.label}</span>
              {option.description && <small>{option.description}</small>}
              {option.value === value && <b>✓</b>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
