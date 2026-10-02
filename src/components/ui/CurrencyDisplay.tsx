import { formatCurrency } from '../../utils/currency'

interface CurrencyDisplayProps {
  amount: number
  className?: string
  variant?: 'positive' | 'negative' | 'neutral' | 'muted' | 'auto'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showSign?: boolean
}

const sizeMap = {
  sm: '13px',
  md: '15px',
  lg: '18px',
  xl: '24px',
}

export function CurrencyDisplay({
  amount,
  className = '',
  variant = 'neutral',
  size = 'md',
  showSign = false,
}: CurrencyDisplayProps) {
  const autoVariant =
    variant === 'auto'
      ? amount > 0 ? 'positive' : amount < 0 ? 'negative' : 'muted'
      : variant

  const variantClass = `currency-${autoVariant}`
  const sign = showSign && amount > 0 ? '+' : ''

  return (
    <span
      className={`currency ${variantClass} ${className}`}
      style={{ fontSize: sizeMap[size] }}
    >
      {sign}{formatCurrency(amount)}
    </span>
  )
}
