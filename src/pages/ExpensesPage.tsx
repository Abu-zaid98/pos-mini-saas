import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../components/ui/Button'
import { ExpenseModal } from '../components/expenses/ExpenseModal'
import { Modal } from '../components/ui/Modal'
import { db } from '../db/db'
import {
  DEFAULT_EXPENSE_CATEGORIES,
  countExpenseUsageByCategory,
  getExpenseCategories,
  saveExpenseCategories,
  type ExpenseCategoryItem,
} from '../hooks/useExpenses'

function formatMoney(value: number): string {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value) + ' ₪'
}

export function ExpensesPage() {
  const [categories, setCategories] = useState<ExpenseCategoryItem[]>(DEFAULT_EXPENSE_CATEGORIES)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', description: '', active: true })

  const expenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray(), []) ?? []

  useEffect(() => {
    let active = true

    getExpenseCategories().then((items) => {
      if (!active) return
      setCategories(items)
    }).catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  const usageMap = useMemo(() => countExpenseUsageByCategory(expenses), [expenses])
  const totalSpent = useMemo(
    () => expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    [expenses],
  )

  const filteredCategories = useMemo(() => {
    const term = search.trim().toLowerCase()
    return [...categories].sort((a, b) => Number(b.active ?? true) - Number(a.active ?? true)).filter((cat) => {
      if (!term) return true
      return [cat.name, cat.description ?? ''].join(' ').toLowerCase().includes(term)
    })
  }, [categories, search])

  const handleOpenCreate = () => {
    setEditingId(null)
    setDraft({ name: '', description: '', active: true })
    setModalOpen(true)
  }

  const handleOpenEdit = (item: ExpenseCategoryItem) => {
    setEditingId(item.id)
    setDraft({
      name: item.name,
      description: item.description ?? '',
      active: item.active !== false,
    })
    setModalOpen(true)
  }

  const handleSaveCategory = async () => {
    const name = draft.name.trim()
    if (!name) return

    const next = categories.some((item) => item.name.trim().toLowerCase() === name.toLowerCase() && item.id !== editingId)
    if (next) {
      alert('هذا البند موجود مسبقاً، جرّب اسماً مختلفاً.')
      return
    }

    const updated = editingId
      ? categories.map((item) => item.id === editingId ? { ...item, name, description: draft.description.trim(), active: draft.active } : item)
      : [...categories, { id: `cat-${Date.now()}`, name, description: draft.description.trim(), icon: '🧾', active: draft.active }]

    const saved = await saveExpenseCategories(updated)
    setCategories(saved)
    setModalOpen(false)
    setEditingId(null)
    setDraft({ name: '', description: '', active: true })
  }

  const handleDeleteCategory = async (id: string) => {
    const item = categories.find((category) => category.id === id)
    if (!item) return

    const count = usageMap[item.name] ?? 0
    const confirmed = window.confirm(
      count > 0
        ? `هذا البند مستخدم ${count} مرة في السجلات الحالية. هل تريد إخفاؤه فقط مع الاحتفاظ بالتاريخ؟`
        : `هل تريد حذف بند "${item.name}" نهائياً؟`,
    )

    if (!confirmed) return

    const next = count > 0
      ? categories.map((category) => category.id === id ? { ...category, active: false } : category)
      : categories.filter((category) => category.id !== id)

    const saved = await saveExpenseCategories(next)
    setCategories(saved)
  }

  const totalCategories = categories.filter((category) => category.active !== false).length

  return (
    <div className="page-frame" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--brand-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, boxShadow: '0 12px 26px rgba(22, 101, 52, 0.28)' }}>💸</div>
              <div>
                <h2 style={{ margin: 0, color: 'var(--color-text-primary)' }}>المصاريف</h2>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 12 }}>إدارة بنود المصروفات ومتابعة النفقات</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={handleOpenCreate}>+ إضافة بند</Button>
            <Button variant="primary" onClick={() => setExpenseModalOpen(true)}>+ إضافة مصروف</Button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>إجمالي المصاريف</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: 'var(--color-primary-light)' }}>{formatMoney(totalSpent)}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>عدد البنود</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: 'var(--color-success-light)' }}>{categories.length}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>بنود نشطة</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: 'var(--color-warning-light)' }}>{totalCategories}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="input-search" style={{ width: '100%' }}>
          <span>🔎</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث عن بند مصروف..."
            aria-label="بحث عن بند مصروف"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredCategories.length === 0 && (
            <div style={{ padding: 18, textAlign: 'center', color: 'var(--color-text-muted)' }}>
              لا توجد بنود مطابقة حالياً.
            </div>
          )}

          {filteredCategories.map((item) => {
            const usageCount = usageMap[item.name] ?? 0
            const isInactive = item.active === false

            return (
              <div key={item.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: 12,
                borderRadius: 14,
                border: '1px solid var(--color-border)',
                background: isInactive ? 'rgba(148,163,184,0.08)' : 'var(--color-bg-surface)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--brand-gradient-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    {item.icon || '🧾'}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{item.name}</strong>
                      <span className={`badge ${isInactive ? 'badge-muted' : 'badge-success'}`}>
                        {isInactive ? 'معطل' : 'نشط'}
                      </span>
                    </div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 2 }}>
                      {item.description || 'بنود مصروفات قابلة للتعديل'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className="badge badge-primary">{usageCount} استخدام</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleOpenEdit(item)}>تعديل</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteCategory(item.id)}>حذف</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <ExpenseModal
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        onSuccess={() => setExpenseModalOpen(false)}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'تعديل بند المصروف' : 'إضافة بند مصروف جديد'}
        type="sheet"
        footer={
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)} style={{ flex: 1 }}>إلغاء</button>
            <Button variant="primary" onClick={handleSaveCategory} style={{ flex: 2 }}>{editingId ? 'حفظ التغييرات' : 'إضافة البند'}</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="input-wrap">
            <label className="input-label">اسم البند</label>
            <input
              className="input"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="مثل: إيجار المحل"
            />
          </div>

          <div className="input-wrap">
            <label className="input-label">الوصف</label>
            <textarea
              className="input"
              rows={3}
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="وصف مختصر للبند إن رغبت..."
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 12px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>حالة البند</span>
            <button
              type="button"
              className={`btn btn-sm ${draft.active ? 'btn-success' : 'btn-ghost'}`}
              onClick={() => setDraft((current) => ({ ...current, active: !current.active }))}
            >
              {draft.active ? 'نشط' : 'معطل'}
            </button>
          </label>
        </div>
      </Modal>
    </div>
  )
}
