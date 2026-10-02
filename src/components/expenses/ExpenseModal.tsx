import React, { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type PaymentMethod } from '../../db/db'
import { addExpense } from '../../hooks/useExpenses'

interface ExpenseModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function ExpenseModal({ open, onClose, onSuccess }: ExpenseModalProps) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].name)
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:mm"
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleQuickSelectCategory = (catName: string) => {
    setCategory(catName)
    if (!title) {
      if (catName === 'كهرباء') setTitle('فاتورة كهرباء')
      else if (catName === 'مياه') setTitle('فاتورة مياه')
      else if (catName === 'نظافة ومستلزمات') setTitle('أدوات ومواد تنظيف')
      else if (catName === 'إيجار المحل') setTitle('إيجار المحل')
      else if (catName === 'رواتب ومكافآت') setTitle('راتب / مكافأة موظف')
      else if (catName === 'صيانة وتصليحات') setTitle('صيانة')
      else if (catName === 'ضيافة وبوفيه') setTitle('ضيافة واستراحة')
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError('')

    const numAmount = parseFloat(amount)
    if (!title.trim()) {
      setError('يرجى كتابة بيان المصروف')
      return
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('يرجى إدخال مبلغ صحيح أكبر من الصفر')
      return
    }

    setLoading(true)
    try {
      await addExpense({
        title: title.trim(),
        category,
        amount: numAmount,
        date: dateStr ? new Date(dateStr) : new Date(),
        paymentMethod,
        notes: notes.trim(),
      })

      // Reset form
      setTitle('')
      setAmount('')
      setNotes('')
      setDateStr(new Date().toISOString().slice(0, 16))
      onSuccess?.()
      onClose()
    } catch (err) {
      console.error(err)
      setError('حدث خطأ أثناء تسجيل المصروف')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="💸 تسجيل مصروف تشغيلي جديد"
      type="sheet"
      footer={
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{ flex: 1 }}
          >
            إلغاء
          </button>
          <Button
            variant="primary"
            loading={loading}
            onClick={handleSubmit}
            style={{ flex: 2 }}
          >
            ✓ حفظ المصروف
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10,
            padding: '8px 12px',
            color: 'var(--color-danger-light)',
            fontSize: 13,
            fontWeight: 700,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Categories Pills */}
        <div>
          <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>
            نوع المصروف التشغيلي *
          </label>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            maxHeight: 120,
            overflowY: 'auto',
            padding: '2px',
          }}>
            {EXPENSE_CATEGORIES.map((cat) => {
              const active = category === cat.name
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleQuickSelectCategory(cat.name)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 20,
                    border: active ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                    color: active ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Title / Description */}
        <Input
          label="بيان المصروف *"
          placeholder="مثال: فاتورة كهرباء شهر 9، شراء معقمات وأكياس..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        {/* Amount & Date in 2 cols */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input
            label="المبلغ ₪ *"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            required
          />

          <div>
            <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>
              التاريخ والوقت
            </label>
            <input
              type="datetime-local"
              className="input"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              style={{ width: '100%', fontSize: 13 }}
            />
          </div>
        </div>

        {/* Payment Method */}
        <div>
          <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>
            طريقة الدفع للمصروف
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {PAYMENT_METHODS.map((m) => {
              const active = paymentMethod === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: active ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: active ? 'rgba(59,130,246,0.15)' : 'var(--color-bg-card)',
                    color: active ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    justifyContent: 'center',
                  }}
                >
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="input-label" style={{ marginBottom: 6, display: 'block' }}>
            ملاحظات إضافية (اختياري)
          </label>
          <input
            className="input"
            placeholder="مثلاً: رقم الإيصال أو المستلم..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  )
}
