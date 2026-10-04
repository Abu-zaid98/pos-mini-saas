import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { CustomSelect } from '../components/ui/CustomSelect'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { ExpenseModal } from '../components/expenses/ExpenseModal'
import { Modal } from '../components/ui/Modal'
import { getPaymentMethodName, PAYMENT_METHODS } from '../db/db'
import {
  DEFAULT_EXPENSE_CATEGORIES,
  countExpenseUsageByCategory,
  deleteExpense,
  getExpenseCategories,
  saveExpenseCategories,
  useExpenses,
  type ExpensePeriod,
  type ExpenseCategoryItem,
} from '../hooks/useExpenses'

function formatMoney(value: number): string {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ₪'
}

export function ExpensesPage() {
  const [categories, setCategories] = useState<ExpenseCategoryItem[]>(DEFAULT_EXPENSE_CATEGORIES)
  const [search, setSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [period, setPeriod] = useState<ExpensePeriod>('month')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', description: '', active: true })
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<{ id: number; title: string } | null>(null)
  const [deletingExpense, setDeletingExpense] = useState(false)
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<{ id: string; name: string; count: number } | null>(null)
  const [deletingCategory, setDeletingCategory] = useState(false)

  const expenses = useExpenses(period)
  const allExpenses = useExpenses('all')

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

  const usageMap = useMemo(() => countExpenseUsageByCategory(allExpenses), [allExpenses])
  const filteredExpenses = useMemo(() => {
    const term = search.trim().toLowerCase()
    return expenses.filter((expense) => {
      if (categoryFilter !== 'all' && expense.category !== categoryFilter) return false
      if (paymentFilter !== 'all' && expense.paymentMethod !== paymentFilter) return false
      if (!term) return true
      return [expense.title, expense.category, expense.notes ?? ''].join(' ').toLowerCase().includes(term)
    })
  }, [expenses, categoryFilter, paymentFilter, search])
  const totalSpent = useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    [filteredExpenses],
  )

  const filteredCategories = useMemo(() => {
    const term = categorySearch.trim().toLowerCase()
    return [...categories].sort((a, b) => Number(b.active ?? true) - Number(a.active ?? true)).filter((cat) => {
      if (!term) return true
      return [cat.name, cat.description ?? ''].join(' ').toLowerCase().includes(term)
    })
  }, [categories, categorySearch])

  const handleOpenCreate = () => {
    setEditingId(null)
    setDraft({ name: '', description: '', active: true })
    setCategoryEditorOpen(true)
  }

  const handleOpenEdit = (item: ExpenseCategoryItem) => {
    setEditingId(item.id)
    setDraft({
      name: item.name,
      description: item.description ?? '',
      active: item.active !== false,
    })
    setCategoryEditorOpen(true)
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
    setCategoryEditorOpen(false)
    setEditingId(null)
    setDraft({ name: '', description: '', active: true })
  }

  const handleDeleteCategory = (id: string) => {
    const item = categories.find((category) => category.id === id)
    if (!item) return
    setDeleteCategoryTarget({ id, name: item.name, count: usageMap[item.name] ?? 0 })
  }

  const handleConfirmDeleteCategory = async () => {
    if (!deleteCategoryTarget) return
    setDeletingCategory(true)
    try {
      const { id, count } = deleteCategoryTarget
      const next = count > 0
        ? categories.map((category) => category.id === id ? { ...category, active: false } : category)
        : categories.filter((category) => category.id !== id)

      const saved = await saveExpenseCategories(next)
      setCategories(saved)
      setDeleteCategoryTarget(null)
    } finally {
      setDeletingCategory(false)
    }
  }

  const handleConfirmDeleteExpense = async () => {
    if (!deleteExpenseTarget) return
    setDeletingExpense(true)
    try {
      await deleteExpense(deleteExpenseTarget.id)
      setDeleteExpenseTarget(null)
    } finally {
      setDeletingExpense(false)
    }
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
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 12 }}>سجل المصروفات والفلاتر</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => setCategoryManagerOpen(true)}>إدارة الأنواع</Button>
            <Button variant="primary" onClick={() => setExpenseModalOpen(true)}>+ إضافة مصروف</Button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>إجمالي المصاريف</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: 'var(--color-primary-light)' }}>{formatMoney(totalSpent)}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>عدد السجلات المعروضة</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: 'var(--color-success-light)' }}>{filteredExpenses.length}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>أنواع نشطة</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: 'var(--color-warning-light)' }}>{totalCategories}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <CustomSelect
            label="الفترة"
            value={period}
            onChange={(v) => setPeriod(v as ExpensePeriod)}
            options={[
              { value: 'today', label: 'اليوم' },
              { value: 'week', label: 'آخر 7 أيام' },
              { value: 'month', label: 'هذا الشهر' },
              { value: 'all', label: 'كل الفترات' },
            ]}
          />
          <CustomSelect
            label="نوع المصروف"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: 'all', label: 'كل الأنواع' },
              ...categories.map((category) => ({ value: category.name, label: category.name })),
            ]}
          />
          <CustomSelect
            label="طريقة الدفع"
            value={paymentFilter}
            onChange={setPaymentFilter}
            options={[
              { value: 'all', label: 'كل الطرق' },
              ...PAYMENT_METHODS.map((method) => ({ value: method.id, label: method.label })),
            ]}
          />
        </div>

        <div className="input-search" style={{ width: '100%' }}>
          <span>🔎</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث في البيان أو النوع أو الملاحظات..."
            aria-label="بحث في سجلات المصاريف"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--color-text-primary)' }}>سجلات المصاريف</h3>
          <span className="badge badge-muted">{filteredExpenses.length} سجل</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredExpenses.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 12 }}>
              لا توجد مصاريف تطابق الفلاتر المحددة.
            </div>
          ) : filteredExpenses.map((expense) => {
            const category = categories.find((item) => item.name === expense.category)
            return (
              <div key={expense.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                flexWrap: 'wrap', padding: '12px 14px', border: '1px solid var(--color-border)',
                borderRadius: 12, background: 'var(--color-bg-surface)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 240px' }}>
                  <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 11, background: 'var(--brand-gradient-soft)', display: 'grid', placeItems: 'center', fontSize: 18 }}>
                    {category?.icon || '🧾'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', color: 'var(--color-text-primary)', fontSize: 14 }}>{expense.title}</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 8px', marginTop: 3, color: 'var(--color-text-muted)', fontSize: 11 }}>
                      <span>{expense.category}</span>
                      <span>{new Date(expense.date).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                      <span>{getPaymentMethodName(expense.paymentMethod)}</span>
                      {expense.notes && <span>{expense.notes}</span>}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginInlineStart: 'auto' }}>
                  <strong style={{ color: 'var(--color-danger-light)', direction: 'ltr', whiteSpace: 'nowrap' }}>{formatMoney(expense.amount)}</strong>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    title="حذف المصروف"
                    aria-label={`حذف مصروف ${expense.title}`}
                    onClick={() => expense.id && setDeleteExpenseTarget({ id: expense.id, title: expense.title })}
                  >حذف</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Modal
        open={categoryManagerOpen}
        onClose={() => {
          setCategoryManagerOpen(false)
          setCategoryEditorOpen(false)
        }}
        title={categoryEditorOpen ? (editingId ? 'تعديل نوع المصروف' : 'إضافة نوع مصروف') : 'إدارة أنواع المصاريف'}
        type="sheet"
        footer={categoryEditorOpen ? (
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setCategoryEditorOpen(false)} style={{ flex: 1 }}>رجوع</button>
            <Button variant="primary" onClick={handleSaveCategory} style={{ flex: 2 }}>{editingId ? 'حفظ التغييرات' : 'إضافة النوع'}</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setCategoryManagerOpen(false)} style={{ flex: 1 }}>إغلاق</button>
            <Button variant="primary" onClick={handleOpenCreate} style={{ flex: 2 }}>+ نوع جديد</Button>
          </div>
        )}
      >
        {categoryEditorOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="input-wrap">
              <label className="input-label">اسم النوع</label>
              <input
                className="input"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="مثل: إيجار المحل"
                autoFocus
              />
            </div>
            <div className="input-wrap">
              <label className="input-label">الوصف</label>
              <textarea
                className="input"
                rows={3}
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="وصف مختصر للنوع إن رغبت..."
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 12px' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>حالة النوع</span>
              <button
                type="button"
                className={`btn btn-sm ${draft.active ? 'btn-success' : 'btn-ghost'}`}
                onClick={() => setDraft((current) => ({ ...current, active: !current.active }))}
              >
                {draft.active ? 'نشط' : 'معطل'}
              </button>
            </label>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="input-search" style={{ width: '100%' }}>
              <span>🔎</span>
              <input
                value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder="بحث في أنواع المصروفات..."
                aria-label="بحث في أنواع المصروفات"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '52dvh', overflowY: 'auto' }}>
              {filteredCategories.length === 0 && (
                <div style={{ padding: 18, textAlign: 'center', color: 'var(--color-text-muted)' }}>لا توجد أنواع مطابقة.</div>
              )}
              {filteredCategories.map((item) => {
                const usageCount = usageMap[item.name] ?? 0
                const isInactive = item.active === false
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    flexWrap: 'wrap', padding: 10, borderRadius: 12,
                    border: '1px solid var(--color-border)',
                    background: isInactive ? 'rgba(148,163,184,0.08)' : 'var(--color-bg-surface)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: '1 1 180px' }}>
                      <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: 'var(--brand-gradient-soft)', display: 'grid', placeItems: 'center' }}>
                        {item.icon || '🧾'}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block', color: 'var(--color-text-primary)', fontSize: 13 }}>{item.name}</strong>
                        <small style={{ color: 'var(--color-text-muted)' }}>{usageCount} استخدام · {isInactive ? 'معطل' : 'نشط'}</small>
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginInlineStart: 'auto' }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleOpenEdit(item)}>تعديل</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteCategory(item.id)}>{isInactive ? 'حذف' : 'تعطيل'}</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Modal>

      <ExpenseModal
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        onSuccess={() => setExpenseModalOpen(false)}
      />

      <ConfirmModal
        open={deleteExpenseTarget !== null}
        onClose={() => setDeleteExpenseTarget(null)}
        onConfirm={handleConfirmDeleteExpense}
        loading={deletingExpense}
        title="حذف المصروف"
        icon="💸"
        message={`هل تريد حذف مصروف "${deleteExpenseTarget?.title}"؟`}
        subMessage="سيُحذف السجل نهائياً من المصاريف، ولن يؤثر على باقي البيانات."
        confirmText="تأكيد الحذف"
        cancelText="إلغاء"
      />

      <ConfirmModal
        open={deleteCategoryTarget !== null}
        onClose={() => setDeleteCategoryTarget(null)}
        onConfirm={handleConfirmDeleteCategory}
        loading={deletingCategory}
        title="حذف نوع المصروف"
        icon="🏷️"
        message={(deleteCategoryTarget?.count ?? 0) > 0
          ? `البند "${deleteCategoryTarget?.name}" مستخدم ${deleteCategoryTarget?.count} مرة — إخفاؤه فقط؟`
          : `هل تريد حذف بند "${deleteCategoryTarget?.name}" نهائياً؟`}
        subMessage={(deleteCategoryTarget?.count ?? 0) > 0
          ? 'سيُخفى من القوائم مع الاحتفاظ بسجلاته التاريخية.'
          : 'لا يمكن التراجع عن هذا الإجراء.'}
        confirmText={(deleteCategoryTarget?.count ?? 0) > 0 ? 'إخفاء البند' : 'تأكيد الحذف'}
        cancelText="إلغاء"
      />

    </div>
  )
}
