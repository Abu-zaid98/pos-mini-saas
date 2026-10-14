/**
 * SearchBar — شريط البحث الموحد
 * يحل محل جميع تطبيقات البحث المتفرقة في الصفحات
 */
import { useId, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** عناصر إضافية تُعرض على يسار حقل البحث (باركود سكانر، فلتر، ...) */
  actions?: ReactNode
  autoFocus?: boolean
  id?: string
  className?: string
}

/**
 * شريط بحث موحد لجميع الصفحات
 *
 * @example
 * <SearchBar value={search} onChange={setSearch} placeholder="ابحث..." />
 *
 * @example مع أيقونة باركود
 * <SearchBar
 *   value={search}
 *   onChange={setSearch}
 *   actions={<button onClick={openScanner}><Icon name="camera" size={18} /></button>}
 * />
 */
export function SearchBar({
  value,
  onChange,
  placeholder = 'بحث...',
  actions,
  autoFocus,
  id,
  className = '',
}: SearchBarProps) {
  const autoId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = id ?? autoId

  return (
    <div
      className={`search-bar ${className}`}
      onClick={() => inputRef.current?.focus()}
      style={{ cursor: 'text' }}
    >
      {/* أيقونة بحث */}
      <label htmlFor={inputId} className="search-bar-icon" style={{ cursor: 'text' }}>
        <Icon name="search" size={18} />
      </label>

      {/* حقل الإدخال */}
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus={autoFocus}
        style={{ WebkitAppearance: 'none' }}
      />

      {/* زر مسح */}
      {value && (
        <button
          type="button"
          className="search-bar-clear"
          onClick={(e) => {
            e.stopPropagation()
            onChange('')
            inputRef.current?.focus()
          }}
          aria-label="مسح البحث"
          title="مسح"
        >
          <Icon name="x-mark" size={14} strokeWidth={2} />
        </button>
      )}

      {/* إجراءات إضافية (باركود، فلتر، ...) */}
      {actions && (
        <div className="search-bar-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  )
}
