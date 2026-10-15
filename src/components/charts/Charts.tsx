/**
 * Charts.tsx — مكوّنات رسوم بيانية خفيفة (SVG/HTML بلا أي مكتبة خارجية)
 *
 * - DonutChart: مخطط دائري مفرّغ (دوائر) مع وسيلة إيضاح ونِسَب مئوية
 * - RadialGauge: حلقة تقدّم بنسبة مئوية
 * - BarList: أعمدة أفقية مرتّبة مع قيم
 * - ColumnTrend: أعمدة زمنية رأسية (تُقرأ من اليمين لليسار)
 *
 * كل المكوّنات تستخدم متغيّرات الثيم (index.css) فتتناسق مع الوضعين الداكن والفاتح.
 */
import type { ReactNode } from 'react'
import { formatCurrency } from '../../utils/currency'

/** لوحة ألوان موحّدة للرسوم البيانية */
export const CHART_PALETTE = [
  '#45c7b2', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444',
  '#10b981', '#06b6d4', '#ec4899', '#84cc16', '#f97316',
]

/** ألوان دافئة خاصة بالديون */
export const DEBT_PALETTE = ['#ef4444', '#f87171', '#fb7185', '#f59e0b', '#fbbf24', '#facc15']

export interface ChartSlice {
  label: string
  value: number
  color?: string
}

function colorAt(i: number, palette: string[]): string {
  return palette[i % palette.length]
}

/* ============================================================
   DonutChart — مخطط دائري مفرّغ
============================================================ */
export function DonutChart({
  data,
  size = 168,
  thickness = 20,
  centerLabel,
  centerValue,
  valueFormatter = formatCurrency,
  palette = CHART_PALETTE,
  emptyText = 'لا توجد بيانات',
  showPercent = true,
}: {
  data: ChartSlice[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: ReactNode
  valueFormatter?: (v: number) => string
  palette?: string[]
  emptyText?: string
  showPercent?: boolean
}) {
  const slices = data.filter((d) => (Number(d.value) || 0) > 0)
  const total = slices.reduce((s, d) => s + (Number(d.value) || 0), 0)
  const cx = size / 2
  const cy = size / 2
  const r = (size - thickness) / 2
  const circ = 2 * Math.PI * r
  let acc = 0

  return (
    <div className="chart-donut">
      <div className="chart-donut-figure" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerLabel || 'مخطط دائري'}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-input-bg)" strokeWidth={thickness} />
          {total > 0 && slices.map((d, i) => {
            const frac = (Number(d.value) || 0) / total
            const dash = frac * circ
            const gap = slices.length > 1 ? Math.min(3, dash * 0.35) : 0
            const el = (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={d.color || colorAt(i, palette)}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(dash - gap, 0.5)} ${circ - Math.max(dash - gap, 0.5)}`}
                strokeDashoffset={-acc}
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            )
            acc += dash
            return el
          })}
        </svg>
        <div className="chart-donut-center">
          {centerValue !== undefined && <span className="chart-donut-value">{centerValue}</span>}
          {centerLabel && <span className="chart-donut-label">{centerLabel}</span>}
        </div>
      </div>

      <ul className="chart-legend">
        {slices.length === 0 && <li className="chart-legend-empty">{emptyText}</li>}
        {slices.map((d, i) => (
          <li key={i} className="chart-legend-item">
            <span className="chart-legend-dot" style={{ background: d.color || colorAt(i, palette) }} />
            <span className="chart-legend-name">{d.label}</span>
            <span className="chart-legend-val">
              {valueFormatter(d.value)}
              {showPercent && total > 0 && <em>{Math.round((d.value / total) * 100)}%</em>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ============================================================
   RadialGauge — حلقة تقدّم بنسبة مئوية
============================================================ */
export function RadialGauge({
  value,
  max = 100,
  size = 132,
  thickness = 13,
  color = 'var(--color-primary-light)',
  trackColor = 'var(--color-input-bg)',
  centerText,
  caption,
}: {
  value: number
  max?: number
  size?: number
  thickness?: number
  color?: string
  trackColor?: string
  centerText?: ReactNode
  caption?: string
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const cx = size / 2
  const cy = size / 2
  const r = (size - thickness) / 2
  const circ = 2 * Math.PI * r

  return (
    <div className="chart-gauge" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={caption || 'حلقة تقدّم'}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={thickness} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${ratio * circ} ${circ}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="chart-gauge-center">
        {centerText !== undefined && <span className="chart-gauge-value">{centerText}</span>}
        {caption && <span className="chart-gauge-caption">{caption}</span>}
      </div>
    </div>
  )
}

/* ============================================================
   BarList — أعمدة أفقية مرتّبة
============================================================ */
export function BarList({
  items,
  max,
  valueFormatter = formatCurrency,
  color = 'var(--brand-gradient)',
  palette,
  emptyText = 'لا توجد بيانات',
  showRank = true,
}: {
  items: { label: string; value: number; sub?: string; color?: string }[]
  max?: number
  valueFormatter?: (v: number) => string
  color?: string
  palette?: string[]
  emptyText?: string
  showRank?: boolean
}) {
  if (!items.length) return <p className="chart-empty">{emptyText}</p>
  const peak = max ?? Math.max(...items.map((i) => Number(i.value) || 0), 1)

  return (
    <div className="chart-bar-list">
      {items.map((it, idx) => {
        const pct = peak > 0 ? Math.max(3, Math.round(((Number(it.value) || 0) / peak) * 100)) : 0
        const bg = it.color || (palette ? colorAt(idx, palette) : color)
        return (
          <div className="chart-bar-row" key={idx}>
            <div className="chart-bar-top">
              <span className="chart-bar-name">
                {showRank && <b className="chart-bar-rank">#{idx + 1}</b>}
                <span className="chart-bar-name-text">{it.label}</span>
                {it.sub && <small>{it.sub}</small>}
              </span>
              <span className="chart-bar-value">{valueFormatter(it.value)}</span>
            </div>
            <div className="chart-bar-track">
              <span className="chart-bar-fill" style={{ width: `${pct}%`, background: bg }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ============================================================
   ColumnTrend — أعمدة زمنية رأسية (الأقدم يميناً)
============================================================ */
export function ColumnTrend({
  points,
  height = 132,
  color = 'var(--brand-gradient)',
  valueFormatter = formatCurrency,
  emptyText = 'لا توجد بيانات',
  showValues = true,
}: {
  points: { label: string; value: number }[]
  height?: number
  color?: string
  valueFormatter?: (v: number) => string
  emptyText?: string
  showValues?: boolean
}) {
  if (!points.length) return <p className="chart-empty">{emptyText}</p>
  const peak = Math.max(...points.map((p) => Number(p.value) || 0), 1)
  const labelStep = points.length > 10 ? Math.ceil(points.length / 6) : 1
  const showTopValues = showValues && points.length <= 5
  // مساحة أعلى العمود لكتابة القيمة (حتى لا يتجاوز أطول عمود ارتفاع الإطار)
  const barArea = Math.max(10, height - (showTopValues ? 16 : 0))

  return (
    <div className="chart-columns">
      <div className="chart-columns-plot" style={{ height }}>
        {points.map((p, idx) => {
          const h = Math.max(2, Math.round(((Number(p.value) || 0) / peak) * barArea))
          return (
            <div className="chart-col" key={idx} title={`${p.label}: ${valueFormatter(p.value)}`}>
              {showTopValues && p.value > 0 && <span className="chart-col-value">{valueFormatter(p.value)}</span>}
              <span className="chart-col-bar" style={{ height: h, background: color }} />
            </div>
          )
        })}
      </div>
      <div className="chart-columns-labels">
        {points.map((p, idx) => (
          <span key={idx}>{idx % labelStep === 0 || idx === points.length - 1 ? p.label : ''}</span>
        ))}
      </div>
    </div>
  )
}
