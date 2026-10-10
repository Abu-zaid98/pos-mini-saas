import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Modal } from '../ui/Modal'
import { ConfirmModal } from '../ui/ConfirmModal'
import { ExpenseModal } from '../expenses/ExpenseModal'
import { db, getPaymentMethodName, type Expense, type PaymentMethod } from '../../db/db'
import { buildWalletLedger, deleteWalletTransfer, type WalletEntryWithRunning } from '../../utils/wallet'
import { formatCurrency } from '../../utils/currency'
import { deleteExpense } from '../../hooks/useExpenses'
import { deletePurchase } from '../../hooks/usePurchases'
import { deleteCollectionPayment } from '../../hooks/useCustomers'
import { deleteInvoice } from '../../hooks/useInvoices'

interface WalletDetailModalProps {
  method: PaymentMethod | null
  onClose: () => void
}

interface PendingDelete {
  kind: 'expense' | 'purchase' | 'collection' | 'sale' | 'transfer'
  refId: number
  title: string
  message: string
  subMessage: string
  confirmText: string
}

const SOURCE_ICON: Record<WalletEntryWithRunning['source'], string> = {
  sale: '🧾',
  collection: '🤝',
  purchase: '📥',
  expense: '💸',
  transfer: '🔄',
  refund: '↩️',
  opening: '🏁',
}

export function WalletDetailModal({ method, onClose }: WalletDetailModalProps) {
  const [confirm, setConfirm] = useState<PendingDelete | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  const payments = useLiveQuery(() => db.payments.toArray(), []) ?? []
  const purchases = useLiveQuery(() => db.purchases.toArray(), []) ?? []
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) ?? []
  const transfers = useLiveQuery(() => db.transfers.toArray(), []) ?? []
  const openingSetting = useLiveQuery(() => db.settings.get('wallet_opening_balances'))

  const openingBalance = useMemo(() => {
    if (!method || !openingSetting?.value) return 0
    const obj = openingSetting.value as Record<string, number>
    return Number(obj[method]) || 0
  }, [method, openingSetting])

  const ledger = useMemo(
    () => (method ? buildWalletLedger(payments, purchases, expenses, method, transfers, openingBalance) : null),
    [payments, purchases, expenses, method, transfers, openingBalance],
  )

  if (!method || !ledger) return null

  const askDelete = (entry: WalletEntryWithRunning) => {
    if (entry.source === 'expense') {
      setConfirm({
        kind: 'expense',
        refId: entry.refId,
        title: 'حذف المصروف',
        message: `هل تريد حذف "${entry.title}" (${formatCurrency(entry.amount)})؟`,
        subMessage: 'سيُحذف من المصاريف ويرتفع رصيد المحفظة تلقائياً.',
        confirmText: 'تأكيد الحذف',
      })
    } else if (entry.source === 'purchase') {
      setConfirm({
        kind: 'purchase',
        refId: entry.refId,
        title: 'حذف سجل التوريد',
        message: `هل تريد حذف "${entry.title}" (${formatCurrency(entry.amount)})؟`,
        subMessage: 'سيُحذف السجل المالي وتُخصم الكميات الموردة من المخزون تلقائياً.',
        confirmText: 'تأكيد الحذف',
      })
    } else if (entry.source === 'collection') {
      setConfirm({
        kind: 'collection',
        refId: entry.refId,
        title: 'حذف سند القبض',
        message: `هل تريد حذف سند التحصيل (${formatCurrency(entry.amount)})؟`,
        subMessage: 'سيعود المبلغ إلى دين العميل تلقائياً وينقص رصيد المحفظة.',
        confirmText: 'تأكيد الحذف',
      })
    } else if (entry.source === 'transfer') {
      setConfirm({
        kind: 'transfer',
        refId: entry.refId,
        title: 'إلغاء التحويل المالي',
        message: `هل تريد إلغاء حركة "${entry.title}" (${formatCurrency(entry.amount)})؟`,
        subMessage: 'سيعود الرصيد كما كان قبل التحويل في كلا المحفظتين.',
        confirmText: 'تأكيد الإلغاء',
      })
    } else {
      setConfirm({
        kind: 'sale',
        refId: entry.invoiceId ?? entry.refId,
        title: 'حذف فاتورة البيع',
        message: `دفعة البيع (${formatCurrency(entry.amount)}) جزء من فاتورة #${entry.invoiceId} — حذفها منفردة يكسر تطابق الفاتورة.`,
        subMessage: 'الحذف الكامل للفاتورة يعيد الأصناف للمخزون ويلغي دينها ومدفوعاتها معاً.',
        confirmText: 'حذف الفاتورة كاملة',
      })
    }
  }

  const handleConfirm = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.kind === 'expense') await deleteExpense(confirm.refId)
      else if (confirm.kind === 'purchase') await deletePurchase(confirm.refId)
      else if (confirm.kind === 'collection') await deleteCollectionPayment(confirm.refId)
      else if (confirm.kind === 'transfer') await deleteWalletTransfer(confirm.refId)
      else await deleteInvoice(confirm.refId)
      setConfirm(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر الحذف')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`💼 كشف ${getPaymentMethodName(method)}`}
        type="sheet"
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', fontSize: 12, fontWeight: 800 }}>
            <span style={{ flex: 1, textAlign: 'center', color: 'var(--color-success-light)', background: 'var(--kpi-green-bg)', border: '1px solid var(--kpi-green-border)', borderRadius: 10, padding: '8px 4px', direction: 'ltr' }}>
              داخل {formatCurrency(ledger.totalIn)}
            </span>
            <span style={{ flex: 1, textAlign: 'center', color: 'var(--color-danger-light)', background: 'var(--kpi-danger-bg)', border: '1px solid var(--kpi-danger-border)', borderRadius: 10, padding: '8px 4px', direction: 'ltr' }}>
              خارج {formatCurrency(ledger.totalOut)}
            </span>
            <span style={{ flex: 1, textAlign: 'center', color: 'var(--color-text-primary)', background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '8px 4px', direction: 'ltr' }}>
              صافي {formatCurrency(ledger.net)}
            </span>
          </div>
        }
      >
        {ledger.entries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💼</div>
            <p>لا توجد حركات على هذه المحفظة بعد</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...ledger.entries].reverse().map((e) => (
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
                    {new Date(e.date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
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
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, justifyContent: 'flex-end' }}>
                    {e.source === 'expense' && (
                      <button
                        type="button"
                        onClick={() => {
                          const full = expenses.find((x) => x.id === e.refId) ?? null
                          if (full) setEditingExpense(full)
                        }}
                        style={{
                          background: 'var(--color-primary-glow)',
                          border: '1px solid var(--color-border-active)',
                          color: 'var(--color-primary-light)',
                          borderRadius: 8, padding: '4px 10px',
                          fontSize: 11, fontWeight: 800, cursor: 'pointer',
                          fontFamily: 'var(--font-main)',
                        }}
                      >
                        تعديل
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => askDelete(e)}
                      style={{
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        color: 'var(--color-danger-light)',
                        borderRadius: 8, padding: '4px 10px',
                        fontSize: 11, fontWeight: 800, cursor: 'pointer',
                        fontFamily: 'var(--font-main)',
                      }}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
        loading={busy}
        title={confirm?.title ?? ''}
        icon="⚠️"
        message={confirm?.message ?? ''}
        subMessage={confirm?.subMessage}
        confirmText={confirm?.confirmText ?? 'تأكيد'}
        cancelText="إلغاء"
      />

      {editingExpense && (
        <ExpenseModal
          open
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSuccess={() => setEditingExpense(null)}
        />
      )}
    </>
  )
}
