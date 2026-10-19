import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, ConfirmModal, CustomSelect, StatCard, SearchBar, SectionHeader, EmptyState, Icon, PageHeader, PeriodFilter } from '../components/ui'
import { ExpenseModal } from '../components/expenses/ExpenseModal'
import { getPaymentMethodName, type Expense } from '../db/db'
import { useWallets, activeWallets } from '../hooks/useWallets'
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
import { formatDateTime } from '../utils/datetime'

function formatMoney(value: number): string {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ₪'
}

/** مجموعة أيقونات جاهزة لاختيار نوع المصروف (يمكن أيضاً إدخال رمز مخصّص). */
const EXPENSE_ICON_CHOICES = [
  '🧾', '⚡', '💧', '🏪', '👥', '🔧', '🚚', '📶', '📢', '📦', '💼',
  '💰', '💸', '🧰', '🛠️', '📱', '💻', '🖥️', '🧴', '🧻', '☕', '🍽️',
  '⛽', '🚗', '🛒', '🏠', '🔌', '💡', '📄', '📊', '🖊️', '🗂️', '🏦',
  '🧑‍💼', '👷', '🧹', '🔩', '🪪', '📋', '❤️', '⭐', '🚰', '🧊', '📅',
]

const DEFAULT_CATEGORY_ICON = '🧾'

export function ExpensesPage() {
  const [categories, setCategories] = useState<ExpenseCategoryItem[]>(DEFAULT_EXPENSE_CATEGORIES)
  const [search, setSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [period, setPeriod] = useState<ExpensePeriod>('month')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', description: '', active: true, icon: DEFAULT_CATEGORY_ICON })
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<{ id: number; title: string } | null>(null)
  const [deletingExpense, setDeletingExpense] = useState(false)
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<{ id: string; name: string; count: number } | null>(null)
  const [deletingCategory, setDeletingCategory] = useState(false)

  const allWallets = useWallets()
  const activeList = activeWallets(allWallets)
  const wallets = activeList.length ? activeList : allWallets

  const expenses = useExpenses(period, { fromDate, toDate })
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
    setDraft({ name: '', description: '', active: true, icon: DEFAULT_CATEGORY_ICON })
    setCategoryEditorOpen(true)
  }

  const handleOpenEdit = (item: ExpenseCategoryItem) => {
    setEditingId(item.id)
    setDraft({
      name: item.name,
      description: item.description ?? '',
      active: item.active !== false,
      icon: item.icon || DEFAULT_CATEGORY_ICON,
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

    const icon = draft.icon.trim() || DEFAULT_CATEGORY_ICON

    const updated = editingId
      ? categories.map((item) => item.id === editingId ? { ...item, name, description: draft.description.trim(), icon, active: draft.active } : item)
      : [...categories, { id: `cat-${Date.now()}`, name, description: draft.description.trim(), icon, active: draft.active }]

    const saved = await saveExpenseCategories(updated)
    setCategories(saved)
    setCategoryEditorOpen(false)
    setEditingId(null)
    setDraft({ name: '', description: '', active: true, icon: DEFAULT_CATEGORY_ICON })
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
        <PageHeader
          icon="credit-card"
          title="المصاريف والنفقات"
          subtitle="سجل المصروفات اليومية والفلاتر"
          actions={
            <>
              <Button variant="ghost" onClick={() => setCategoryManagerOpen(true)}>إدارة الأنواع</Button>
              <Button variant="primary" onClick={() => { setEditingExpense(null); setExpenseModalOpen(true) }}>
                <Icon name="plus" size={15} />
                <span>إضافة مصروف</span>
              </Button>
            </>
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <StatCard
            label="إجمالي المصاريف"
            value={formatMoney(totalSpent)}
            icon="banknotes"
            variant="danger"
            ltr
          />
          <StatCard
            label="عدد السجلات المعروضة"
            value={filteredExpenses.length}
            icon="receipt"
            variant="info"
          />
          <StatCard
            label="أنواع نشطة"
            value={totalCategories}
            icon="squares-2x2"
            variant="brand"
          />
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'start' }}>
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
              ...wallets.map((method) => ({ value: method.id, label: `${method.icon} ${method.name}` })),
            ]}
          />
        </div>

        <PeriodFilter
          variant="select"
          period={period}
          onPeriodChange={(v) => setPeriod(v as ExpensePeriod)}
          from={fromDate}
          to={toDate}
          onRangeChange={(f, t) => { setFromDate(f); setToDate(t) }}
          options={[
            { value: 'today', label: 'اليوم' },
            { value: 'week', label: 'آخر 7 أيام' },
            { value: 'month', label: 'هذا الشهر' },
            { value: 'all', label: 'كل الفترات' },
            { value: 'custom', label: 'مدة مخصصة' },
          ]}
        />

        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="ابحث في البيان أو النوع أو الملاحظات..."
        />

        <SectionHeader
          title="سجلات المصاريف"
          action={<span className="badge badge-muted">{filteredExpenses.length} سجل</span>}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredExpenses.length === 0 ? (
            <EmptyState
              icon="credit-card"
              title="لا توجد مصاريف مطابقة"
              description="لا توجد مصاريف تطابق الفلاتر المحددة حالياً. يمكنك تسجيل مصروف جديد بسهولة."
              action={
                <Button variant="primary" onClick={() => { setEditingExpense(null); setExpenseModalOpen(true) }}>
                  <Icon name="plus" size={15} />
                  <span>إضافة مصروف جديد</span>
                </Button>
              }
            />
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
                      <span>{formatDateTime(expense.date)}</span>
                      <span>{getPaymentMethodName(expense.paymentMethod)}</span>
                      {expense.notes && <span>{expense.notes}</span>}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginInlineStart: 'auto' }}>
                  <strong style={{ color: 'var(--color-danger-light)', direction: 'ltr', whiteSpace: 'nowrap' }}>{formatMoney(expense.amount)}</strong>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    title="تعديل المصروف"
                    aria-label={`تعديل مصروف ${expense.title}`}
                    onClick={() => { setEditingExpense(expense); setExpenseModalOpen(true) }}
                  >تعديل</button>
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
              <label className="input-label">أيقونة النوع</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
                gap: 7,
                maxHeight: 176,
                overflowY: 'auto',
                padding: 8,
                background: 'var(--color-input-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
              }}>
                {EXPENSE_ICON_CHOICES.map((icon) => {
                  const selected = draft.icon === icon
                  return (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, icon }))}
                      aria-label={`اختيار الأيقونة ${icon}`}
                      aria-pressed={selected}
                      style={{
                        height: 40,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 19,
                        borderRadius: 9,
                        cursor: 'pointer',
                        lineHeight: 1,
                        background: selected ? 'var(--brand-gradient-soft)' : 'var(--color-bg-surface)',
                        border: selected ? '2px solid var(--color-primary-light)' : '1px solid var(--color-border)',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      {icon}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>أو رمز مخصّص:</span>
                <input
                  className="input"
                  value={draft.icon}
                  maxLength={6}
                  onChange={(event) => setDraft((current) => ({ ...current, icon: event.target.value }))}
                  placeholder={DEFAULT_CATEGORY_ICON}
                  aria-label="رمز مخصّص للنوع"
                  style={{ width: 72, textAlign: 'center', fontSize: 18 }}
                />
                <span style={{
                  width: 40,
                  height: 40,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 20,
                  borderRadius: 10,
                  background: 'var(--brand-gradient-soft)',
                  flexShrink: 0,
                }}>
                  {draft.icon.trim() || DEFAULT_CATEGORY_ICON}
                </span>
              </div>
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
        onClose={() => { setExpenseModalOpen(false); setEditingExpense(null) }}
        onSuccess={() => { setExpenseModalOpen(false); setEditingExpense(null) }}
        expense={editingExpense}
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
