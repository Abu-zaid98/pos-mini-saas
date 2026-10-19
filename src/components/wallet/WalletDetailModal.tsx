import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Modal } from '../ui/Modal'
import { DatePicker } from '../ui/DatePicker'
import { db, getPaymentMethodName, type PaymentMethod } from '../../db/db'
import { buildWalletLedger, parseAdjustments, type WalletEntryWithRunning } from '../../utils/wallet'
import { formatCurrency } from '../../utils/currency'
import { formatDateTime } from '../../utils/datetime'
import { withinRange } from '../../utils/dateRange'

interface WalletDetailModalProps {
  method: PaymentMethod | null
  onClose: () => void
}

const SOURCE_ICON: Record<WalletEntryWithRunning['source'], string> = {
  sale: '🧾',
  collection: '🤝',
  purchase: '📥',
  expense: '💸',
  transfer: '🔄',
  refund: '↩️',
  loan: '🤲',
  opening: '🏁',
  adjustment: '🧮',
}

/**
 * كشف حركات محفظة — عرض فقط.
 * لا يتضمن أي تعديل أو حذف لأي بند؛ العمليات المالية تُدار من صفحاتها
 * (المصاريف، الفواتير، المشتريات، التحصيل) وإدارة الأرصدة من صفحة المحافظ.
 */
export function WalletDetailModal({ method, onClose }: WalletDetailModalProps) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const payments = useLiveQuery(() => db.payments.toArray(), []) ?? []
  const purchases = useLiveQuery(() => db.purchases.toArray(), []) ?? []
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) ?? []
  const transfers = useLiveQuery(() => db.transfers.toArray(), []) ?? []
  const openingSetting = useLiveQuery(() => db.settings.get('wallet_opening_balances'))
  const adjustmentsSetting = useLiveQuery(() => db.settings.get('wallet_adjustments'))

  const openingBalance = useMemo(() => {
    if (!method || !openingSetting?.value) return 0
    const obj = openingSetting.value as Record<string, number>
    return Number(obj[method]) || 0
  }, [method, openingSetting])

  const adjustments = useMemo(
    () => parseAdjustments(adjustmentsSetting?.value),
    [adjustmentsSetting],
  )

  const ledger = useMemo(
    () => (method ? buildWalletLedger(payments, purchases, expenses, method, transfers, openingBalance, adjustments) : null),
    [payments, purchases, expenses, method, transfers, openingBalance, adjustments],
  )

  // فلتر الفترة المخصصة (من – إلى) — لا يؤثر على الرصيد الجاري لكل حركة
  const visibleEntries = useMemo(() => {
    if (!ledger) return []
    if (!from && !to) return ledger.entries
    return ledger.entries.filter((e) => withinRange(e.date, from, to))
  }, [ledger, from, to])

  const totals = useMemo(() => {
    const round = (n: number) => Math.round(n * 100) / 100
    const totalIn = round(visibleEntries.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0))
    const totalOut = round(visibleEntries.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0))
    return { totalIn, totalOut, net: round(totalIn - totalOut) }
  }, [visibleEntries])

  if (!method || !ledger) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={`💼 كشف ${getPaymentMethodName(method)}`}
      type="sheet"
      footer={
        <div style={{ display: 'flex', gap: 8, width: '100%', fontSize: 12, fontWeight: 800 }}>
          <span style={{ flex: 1, textAlign: 'center', color: 'var(--color-success-light)', background: 'var(--kpi-green-bg)', border: '1px solid var(--kpi-green-border)', borderRadius: 10, padding: '8px 4px', direction: 'ltr' }}>
            داخل {formatCurrency(totals.totalIn)}
          </span>
          <span style={{ flex: 1, textAlign: 'center', color: 'var(--color-danger-light)', background: 'var(--kpi-danger-bg)', border: '1px solid var(--kpi-danger-border)', borderRadius: 10, padding: '8px 4px', direction: 'ltr' }}>
            خارج {formatCurrency(totals.totalOut)}
          </span>
          <span style={{ flex: 1, textAlign: 'center', color: 'var(--color-text-primary)', background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '8px 4px', direction: 'ltr' }}>
            صافي {formatCurrency(totals.net)}
          </span>
        </div>
      }
    >
      <div className="period-filter-custom" style={{ marginBottom: 10 }}>
        <div className="period-range-fields">
          <DatePicker label="من تاريخ" value={from} max={to || undefined} onChange={(v) => setFrom(v)} />
          <DatePicker label="إلى تاريخ" value={to} min={from || undefined} onChange={(v) => setTo(v)} />
        </div>
        <div className="period-range-foot">
          <span className="period-range-summary">
            {from || to ? `${visibleEntries.length} حركة في الفترة` : 'كل الحركات'}
          </span>
          {(from || to) && (
            <button type="button" className="period-range-clear" onClick={() => { setFrom(''); setTo('') }}>
              مسح التاريخ
            </button>
          )}
        </div>
      </div>

      {visibleEntries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💼</div>
          <p>لا توجد حركات على هذه المحفظة بعد</p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
            للعرض فقط — لتعديل أو حذف أي حركة، استخدم صفحتها الأصلية (الفواتير، المصاريف، المشتريات، التحصيل).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...visibleEntries].reverse().map((e) => (
              <div
                key={e.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                }}
              >
                <span style={{ fontSize: 20, flexShrink: 0 }}>{SOURCE_ICON[e.source]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {formatDateTime(e.date)}
                    {e.sub ? ` · ${e.sub}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>
                    الرصيد بعدها: <span style={{ direction: 'ltr', display: 'inline-block' }}>{formatCurrency(e.running)}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'left', flexShrink: 0 }}>
                  <div style={{
                    fontWeight: 900, fontSize: 14, direction: 'ltr',
                    color: e.kind === 'in' ? 'var(--color-success-light)' : 'var(--color-danger-light)',
                  }}>
                    {e.kind === 'in' ? '+' : '-'}{formatCurrency(e.amount)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}
