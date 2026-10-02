import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: React.ReactNode
}

export function Input({ label, error, hint, leftIcon, className = '', ...props }: InputProps) {
  return (
    <div className="input-wrap">
      {label && <label className="input-label">{label}</label>}
      <div style={{ position: 'relative' }}>
        {leftIcon && (
          <span style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-text-muted)',
            pointerEvents: 'none',
          }}>
            {leftIcon}
          </span>
        )}
        <input
          className={`input ${className}`}
          style={leftIcon ? { paddingRight: 40 } : {}}
          {...props}
        />
      </div>
      {error && (
        <span style={{ fontSize: 12, color: 'var(--color-danger-light)' }}>⚠ {error}</span>
      )}
      {hint && !error && (
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{hint}</span>
      )}
    </div>
  )
}
