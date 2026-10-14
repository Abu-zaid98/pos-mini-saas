import { useMemo, useState } from 'react'
import { Modal } from '../components/ui/Modal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { SupplierPaymentModal } from '../components/purchases/SupplierPaymentModal'
import { formatCurrency } from '../utils/currency'
import { supplierKey, useSuppliers, addSupplier, updateSupplier, deleteSupplier, registerSupplierName, type SupplierCard } from '../hooks/useSuppliers'
import { usePurchases } from '../hooks/usePurchases'
import type { Purchase } from '../db/db'
import { Icon, SearchBar, StatCard, EmptyState, SectionHeader } from '../components/ui'

export function SuppliersPage() {
  const [search, setSearch] = useState('')
  const suppliers = useSuppliers(search)
  const purchases = usePurchases()

  const [detail, setDetail] = useState<SupplierCard | null>(null)
  const [payingPurchase, setPayingPurchase] = useState<Purchase | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SupplierCard | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteBlocked, setDeleteBlocked] = useState('')

  const totalDebt = useMemo(
    () => suppliers.reduce((s, c) => s + (c.totalDebt || 0), 0),
    [suppliers],
  )

  const detailPurchases = useMemo(() => {
    if (!detail) return []
    return purchases
      .filter((p) => supplierKey(p.supplierName) === detail.key)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [purchases, detail])

  // تحديث الكارد المعروض مع البيانات الحية (بعد سداد مثلاً)
  const liveDetail = detail ? suppliers.find((s) => s.key === detail.key) ?? detail : null

  const openAdd = () => {
    setEditingId(null)
    setFormName('')
    setFormPhone('')
    setFormNotes('')
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (card: SupplierCard) => {
    if (!card.registered || !card.id) return
    setEditingId(card.id)
    setFormName(card.name)
    setFormPhone(card.phone || '')
    setFormNotes(card.notes || '')
    setFormError('')
    setFormOpen(true)
  }

  const handleSave = async () => {
    setFormError('')
    if (!formName.trim()) {
      setFormError('يرجى كتابة اسم المورد')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await updateSupplier(editingId, { name: formName, phone: formPhone, notes: formNotes })
      } else {
        await addSupplier({ name: formName, phone: formPhone, notes: formNotes })
      }
      setFormOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'تعذر الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const handleRegister = async (card: SupplierCard) => {
    try {
      await registerSupplierName(card.name)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر التسجيل')
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return
    setDeleting(true)
    setDeleteBlocked('')
    try {
      const res = await deleteSupplier(deleteTarget.id)
      if (res.blocked) {
        setDeleteBlocked(`لا يمكن حذف "${deleteTarget.name}" — مرتبط بـ ${res.invoices} فواتير شراء. احذف الفواتير أولاً من سجل المشتريات إن أردت.`)
        return
      }
      setDeleteTarget(null)
      if (detail?.key === deleteTarget.key) setDetail(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page-frame" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Top Header Card */}
      <section className="card" style={{ padding: 16 }}>
        <SectionHeader
          title="الموردون"
          action={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={openAdd}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="plus" size={16} />
              <span>مورد جديد</span>
            </button>
          }
        />
        <div style={{ marginTop: 12 }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="ابحث باسم المورد أو رقمه..."
          />
        </div>
      </section>

      {/* Stats Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <StatCard
          label="المتبقي للموردين"
          value={formatCurrency(totalDebt)}
          variant={totalDebt > 0 ? 'danger' : 'success'}
          ltr
        />
        <StatCard
          label="عدد الموردين"
          value={suppliers.length}
          variant="brand"
        />
      </div>

      {/* Suppliers List */}
      {suppliers.length === 0 ? (
        <EmptyState
          icon="box"
          title="لا يوجد موردون بعد"
          description={search ? `لم نجد أي مورد مطابق لـ "${search}"` : 'أضف مورداً أو سجّل فاتورة شراء باسمه ليظهر هنا'}
          action={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={openAdd}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="plus" size={15} />
              <span>إضافة مورد جديد</span>
            </button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {suppliers.map((s) => (
            <button
              key={s.registered ? `r-${s.id}` : `u-${s.key}`}
              type="button"
              onClick={() => setDetail(s)}
              style={{
                width: '100%',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-card)',
                color: 'var(--color-text-primary)',
                borderRadius: 16,
                padding: '14px 16px',
                cursor: 'pointer',
                textAlign: 'right',
                fontFamily: 'var(--font-main)',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>{s.name}</strong>
                    {s.registered
                      ? <span className="badge badge-success">مسجل</span>
                      : <span className="badge badge-warning">من الفواتير</span>}
                    {s.totalDebt > 0 && <span className="badge badge-danger">عليه {formatCurrency(s.totalDebt)}</span>}
                  </div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span>{s.invoices} فواتير</span>
                    <span>·</span>
                    <span>مشتريات {formatCurrency(s.totalAmount)}</span>
                    <span>·</span>
                    <span style={{ color: 'var(--color-success-light)' }}>مدفوع {formatCurrency(s.totalPaid)}</span>
                    {s.phone ? (
                      <>
                        <span>·</span>
                        <span style={{ direction: 'ltr' }}>{s.phone}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <span style={{ color: 'var(--color-text-muted)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  <Icon name="chevron-left" size={18} />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Supplier Detail Sheet */}
      {liveDetail && (
        <Modal
          open
          onClose={() => setDetail(null)}
          title={liveDetail.name}
          type="sheet"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Actions Toolbar */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {liveDetail.phone && (
                <a
                  href={`https://wa.me/${liveDetail.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm"
                  style={{
                    background: '#25D366',
                    color: 'white',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 800,
                  }}
                >
                  <Icon name="chat" size={16} />
                  <span>واتساب</span>
                </a>
              )}
              {!liveDetail.registered ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleRegister(liveDetail)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Icon name="check" size={16} />
                  <span>تسجيل كمورد رسمي</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => openEdit(liveDetail)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Icon name="pencil" size={15} />
                    <span>تعديل</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setDeleteBlocked(''); setDeleteTarget(liveDetail) }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-danger-light)' }}
                  >
                    <Icon name="trash" size={15} />
                    <span>حذف</span>
                  </button>
                </>
              )}
            </div>

            {liveDetail.notes && (
              <p style={{
                fontSize: 13,
                color: 'var(--color-text-secondary)',
                margin: 0,
                background: 'var(--color-input-bg)',
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid var(--color-border)',
              }}>
                {liveDetail.notes}
              </p>
            )}

            {/* Financial Overview 3-Stat Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
              <div style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 6px' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700 }}>مشتريات</div>
                <strong style={{ fontSize: 14, direction: 'ltr', display: 'block', marginTop: 4 }}>
                  {formatCurrency(liveDetail.totalAmount)}
                </strong>
              </div>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 12, padding: '10px 6px' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700 }}>سددت</div>
                <strong style={{ fontSize: 14, direction: 'ltr', display: 'block', color: 'var(--color-success-light)', marginTop: 4 }}>
                  {formatCurrency(liveDetail.totalPaid)}
                </strong>
              </div>
              <div style={{
                background: liveDetail.totalDebt > 0 ? 'rgba(239, 68, 68, 0.12)' : 'var(--color-input-bg)',
                border: liveDetail.totalDebt > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--color-border)',
                borderRadius: 12,
                padding: '10px 6px',
              }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700 }}>بقي عليك</div>
                <strong style={{
                  fontSize: 14,
                  direction: 'ltr',
                  display: 'block',
                  color: liveDetail.totalDebt > 0 ? 'var(--color-danger-light)' : 'var(--color-success-light)',
                  marginTop: 4,
                }}>
                  {formatCurrency(liveDetail.totalDebt)}
                </strong>
              </div>
            </div>

            {/* Invoices list */}
            <h3 style={{ fontSize: 14, fontWeight: 800, margin: '6px 0 0' }}>
              فواتير الشراء ({detailPurchases.length})
            </h3>
            {detailPurchases.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px 0' }}>
                لا توجد فواتير لهذا المورد بعد
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                {detailPurchases.map((p: Purchase) => (
                  <div key={p.id} style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', borderRadius: 14, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div>
                        <strong style={{ fontSize: 14 }}>#{p.invoiceNumber || p.id}</strong>
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginInlineStart: 8 }}>
                          {new Date(p.date).toLocaleDateString('ar-EG')} · {p.items.length} أصناف
                        </span>
                      </div>
                      <strong style={{ direction: 'ltr', fontSize: 15 }}>{formatCurrency(p.totalAmount)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 }}>
                      <span style={{ fontSize: 12, color: (p.debtAmount || 0) > 0 ? 'var(--color-danger-light)' : 'var(--color-success-light)', fontWeight: 700 }}>
                        {(p.debtAmount || 0) > 0 ? `متبقٍ: ${formatCurrency(p.debtAmount || 0)}` : 'مسددة بالكامل'}
                      </span>
                      {(p.debtAmount || 0) > 0 && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setPayingPurchase(p)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Icon name="card" size={15} />
                          <span>سداد</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {payingPurchase && (
        <SupplierPaymentModal
          key={payingPurchase.id}
          open
          purchase={payingPurchase}
          onClose={() => setPayingPurchase(null)}
          onSuccess={() => setPayingPurchase(null)}
        />
      )}

      {/* Add / Edit supplier modal */}
      {formOpen && (
        <Modal
          open
          onClose={() => setFormOpen(false)}
          title={editingId ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
          type="box"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {formError && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', color: 'var(--color-danger-light)', fontSize: 13, fontWeight: 600 }}>
                {formError}
              </div>
            )}
            <div className="input-wrap">
              <label className="input-label">اسم المورد *</label>
              <input
                className="input"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="مثال: شركة النور للتجارة"
                autoFocus
              />
            </div>
            <div className="input-wrap">
              <label className="input-label">رقم الهاتف / واتساب</label>
              <input
                className="input"
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="05xxxxxxxx"
                style={{ direction: 'ltr', textAlign: 'right' }}
              />
            </div>
            <div className="input-wrap">
              <label className="input-label">ملاحظات</label>
              <input
                className="input"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="مثال: مندوب المنطقة الشمالية"
              />
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
              تنبيه: الفواتير مرتبطة بالاسم — إعادة تسمية مورد له فواتير تفصلها عن سجله.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setFormOpen(false)}>
                إلغاء
              </button>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                {saving ? 'جارٍ الحفظ...' : editingId ? 'حفظ التعديلات' : 'إضافة المورد'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Supplier Confirmation Modal */}
      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => { setDeleteTarget(null); setDeleteBlocked('') }}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        title="حذف المورد"
        icon="🚚"
        message={`هل تريد حذف "${deleteTarget?.name}" من السجل؟`}
        subMessage={deleteBlocked || 'يُحذف السجل فقط — فواتيره (إن وجدت) تبقى في سجل المشتريات.'}
        confirmText="تأكيد الحذف"
        cancelText="إلغاء"
      />
    </div>
  )
}
