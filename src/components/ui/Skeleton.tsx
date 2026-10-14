/**
 * Skeleton — مكون هيكل التحميل
 */
import type { CSSProperties } from 'react'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  className?: string
  style?: CSSProperties
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius,
  className = '',
  style,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius: borderRadius ?? undefined,
        ...style,
      }}
    />
  )
}
