import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'success' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  full?: boolean
  loading?: boolean
  icon?: React.ReactNode
  iconLeft?: boolean
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  full = false,
  loading = false,
  icon,
  iconLeft = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : size === 'icon' ? 'btn-icon' : ''
  const fullClass = full ? 'btn-full' : ''

  return (
    <button
      className={`btn btn-${variant} ${sizeClass} ${fullClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span style={{
          width: 18, height: 18,
          border: '2px solid rgba(255,255,255,0.3)',
          borderTopColor: 'white',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spin 0.7s linear infinite'
        }} />
      ) : (
        <>
          {iconLeft && icon}
          {children}
          {!iconLeft && icon}
        </>
      )}
    </button>
  )
}
