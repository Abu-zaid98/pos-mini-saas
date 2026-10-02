import React from 'react'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'primary' | 'success' | 'danger' | 'warning' | 'purple' | 'muted'
  className?: string
  icon?: string
}

export function Badge({ children, variant = 'muted', className = '', icon }: BadgeProps) {
  return (
    <span className={`badge badge-${variant} ${className}`}>
      {icon && <span>{icon}</span>}
      {children}
    </span>
  )
}
