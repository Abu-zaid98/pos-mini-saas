import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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

const MENU_MAX_H = 260

/**
 * بديل مخصص لمنسدلة النظام — يعمل بهوية البرنامج في الثيمين.
 * القائمة تُرسم عبر Portal بإحداثيات ثابتة، فلا يقصّها أي كارد
 * (overflow:hidden) أو مودال أو حاوية تمرير في أي صفحة.
 */
export function CustomSelect<T extends string | number>({
  value, options, onChange, placeholder = 'اختر من القائمة', label, disabled = false,
  searchable = false, searchPlaceholder = '🔍 بحث بالاسم أو الرقم...',
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const placeMenu = () => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxH = Math.min(MENU_MAX_H, Math.floor(window.innerHeight * 0.4))
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const openUp = spaceBelow < 160 && rect.top > spaceBelow
    const width = Math.max(rect.width, 160)
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))
    setMenuStyle({
      position: 'fixed',
      zIndex: 400,
      width,
      maxHeight: maxH,
      left,
      right: 'auto', // يُبطل inset-inline من كلاس القائمة (صفحة RTL)
      ...(openUp
        ? { bottom: Math.max(8, window.innerHeight - rect.top + 5) }
        : { top: rect.bottom + 5 }),
    })
  }

  const toggle = () => {
    if (disabled) return
    if (open) {
      close()
      return
    }
    setQuery('')
    placeMenu()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const t = event.target as Node
      if (!menuRef.current?.contains(t) && !wrapRef.current?.contains(t)) close()
    }
    const onScrollResize = () => close()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
    }
  }, [open ])

  const filtered = query.trim()
    ? options.filter((option) =>
      `${option.label} ${option.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
    )
    : options

  return (
    <div className="custom-select" ref={wrapRef}>
      {label && <label className="input-label">{label}</label>}
      <button
        ref={triggerRef}
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
      {open && createPortal(
        <div className="custom-select-menu" role="listbox" ref={menuRef} style={menuStyle}>
          {searchable && (
            <div className="custom-select-search">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') close() }}
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
                onClick={() => { onChange(option.value); close() }}
              >
                <span>{option.label}</span>
                {option.description && <small>{option.description}</small>}
                {option.value === value && <b>✓</b>}
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
