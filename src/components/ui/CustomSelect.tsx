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
  /** إظهار خانة بحث داخل القائمة (تصفية بالاسم والوصف — للعملاء: الاسم أو الرقم) */
  searchable?: boolean
  searchPlaceholder?: string
}

/** A small, touch-friendly replacement for the browser's native select. */
export function CustomSelect<T extends string | number>({
  value, options, onChange, placeholder = 'اختر من القائمة', label, disabled = false,
  searchable = false, searchPlaceholder = '🔍 بحث بالاسم أو الرقم...',
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  const toggle = () => {
    if (disabled) return
    setQuery('')
    setOpen((current) => !current)
  }

  const filtered = query.trim()
    ? options.filter((option) =>
      `${option.label} ${option.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
    )
    : options

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
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? '' : 'custom-select-placeholder'}>{selected?.label ?? placeholder}</span>
        <span className="custom-select-chevron">⌄</span>
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox">
          {searchable && (
            <div className="custom-select-search">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
                placeholder={searchPlaceholder}
                aria-label="بحث في القائمة"
              />
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="custom-select-empty">لا توجد نتائج مطابقة</div>
          ) : (
            filtered.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`custom-select-option ${option.value === value ? 'is-selected' : ''}`}
                key={String(option.value)}
                onClick={() => { onChange(option.value); setQuery(''); setOpen(false) }}
              >
                <span>{option.label}</span>
                {option.description && <small>{option.description}</small>}
                {option.value === value && <b>✓</b>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
