import { useMemo, useState } from 'react'
import { Modal } from '../components/ui/Modal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { SupplierPaymentModal } from '../components/purchases/SupplierPaymentModal'
import { formatCurrency } from '../utils/currency'
import { supplierKey, useSuppliers, addSupplier, updateSupplier, deleteSupplier, registerSupplierName, type SupplierCard } from '../hooks/useSuppliers'
import { usePurchases } from '../hooks/usePurchases'
import type { Purchase } from '../db/db'

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
      <section className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 900 }}>الموردون</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 2 }}>
              حساباتك مع الموردين — ما اشتريته وما سددته وما بقي عليك.
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
            + مورد جديد
          </button>
        </div>
        <div className="input-search"><span>🔍</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="اسم المورد أو رقمه..." /></div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>المتبقي عليك للموردين</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: totalDebt > 0 ? 'var(--color-danger-light)' : 'var(--color-success-light)', direction: 'ltr', marginTop: 4 }}>
            {formatCurrency(totalDebt)}
          </div>
        </div>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>عدد الموردين</div>
          <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{suppliers.length}</div>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🚚</div>
          <p>لا يوجد موردون بعد — أضف مورداً أو سجّل فاتورة شراء باسمه</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {suppliers.map((s) => (
            <button
              key={s.registered ? `r-${s.id}` : `u-${s.key}`}
              type="button"
              onClick={() => setDetail(s)}
              style={{
                width: '100%', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
                color: 'var(--color-text-primary)', borderRadius: 15, padding: 13, cursor: 'pointer',
                textAlign: 'right', fontFamily: 'var(--font-main)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 15 }}>{s.name}</strong>
                    {s.registered
                      ? <span className="badge badge-success">مسجل</span>
                      : <span className="badge badge-warning">من الفواتير</span>}
                    {s.totalDebt > 0 && <span className="badge badge-danger">عليه {formatCurrency(s.totalDebt)}</span>}
                  </div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 5 }}>
                    {s.invoices} فواتير · مشتريات {formatCurrency(s.totalAmount)} · مدفوع {formatCurrency(s.totalPaid)}
                    {s.phone ? ` · ${s.phone}` : ''}
                  </div>
                </div>
                <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>›</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail sheet */}
      {liveDetail && (
        <Modal open onClose={() => setDetail(null)} title={`🚚 ${liveDetail.name}`} type="sheet">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {liveDetail.phone && (
                <a href={`https://wa.me/${liveDetail.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#25D366', color: 'white', textDecoration: 'none' }}>
                  💬 واتساب
                </a>
              )}
              {!liveDetail.registered ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleRegister(liveDetail)}>
                  ✓ تسجيل كمورد رسمي
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(liveDetail)}>
                    ✏️ تعديل
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDeleteBlocked(''); setDeleteTarget(liveDetail) }}>
                    🗑️ حذف
                  </button>
                </>
              )}
            </div>
            {liveDetail.notes && (
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>📝 {liveDetail.notes}</p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
              <div style={{ background: 'var(--color-input-bg)', borderRadius: 10, padding: '8px 4px' }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>مشتريات</div>
                <strong style={{ fontSize: 13, direction: 'ltr', display: 'block' }}>{formatCurrency(liveDetail.totalAmount)}</strong>
              </div>
              <div style={{ background: 'var(--kpi-green-bg)', borderRadius: 10, padding: '8px 4px' }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>سددت</div>
                <strong style={{ fontSize: 13, direction: 'ltr', display: 'block', color: 'var(--color-success-light)' }}>{formatCurrency(liveDetail.totalPaid)}</strong>
              </div>
              <div style={{ background: liveDetail.totalDebt > 0 ? 'var(--kpi-danger-bg)' : 'var(--color-input-bg)', borderRadius: 10, padding: '8px 4px' }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>بقي عليك</div>
                <strong style={{ fontSize: 13, direction: 'ltr', display: 'block', color: liveDetail.totalDebt > 0 ? 'var(--color-danger-light)' : 'var(--color-success-light)' }}>{formatCurrency(liveDetail.totalDebt)}</strong>
              </div>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>فواتير الشراء ({detailPurchases.length})</h3>
            {detailPurchases.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>لا توجد فواتير لهذا المورد بعد</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detailPurchases.map((p: Purchase) => (
                  <div key={p.id} style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', borderRadius: 12, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div>
                        <strong style={{ fontSize: 13 }}>#{p.invoiceNumber || p.id}</strong>
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginInlineStart: 8 }}>
                          {new Date(p.date).toLocaleDateString('ar-EG')} · {p.items.length} أصناف
                        </span>
                      </div>
                      <strong style={{ direction: 'ltr', fontSize: 14 }}>{formatCurrency(p.totalAmount)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
                      <span style={{ fontSize: 12, color: (p.debtAmount || 0) > 0 ? 'var(--color-danger-light)' : 'var(--color-success-light)', fontWeight: 700 }}>
                        {(p.debtAmount || 0) > 0 ? `متبقٍ: ${formatCurrency(p.debtAmount || 0)}` : '✓ مسددة'}
                      </span>
                      {(p.debtAmount || 0) > 0 && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => setPayingPurchase(p)}>
                          💳 سداد
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

      {/* Add / Edit supplier */}
      {formOpen && (
        <Modal open onClose={() => setFormOpen(false)} title={editingId ? '✏️ تعديل المورد' : '＋ مورد جديد'} type="box">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {formError && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', color: 'var(--color-danger-light)', fontSize: 13, fontWeight: 600 }}>
                ⚠ {formError}
              </div>
            )}
            <div className="input-wrap">
              <label className="input-label">اسم المورد *</label>
              <input className="input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="مثال: شركة النور للتجارة" autoFocus />
            </div>
            <div className="input-wrap">
              <label className="input-label">رقم الهاتف / واتساب</label>
              <input className="input" type="tel" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="05xxxxxxxx" style={{ direction: 'ltr', textAlign: 'right' }} />
            </div>
            <div className="input-wrap">
              <label className="input-label">ملاحظات</label>
              <input className="input" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="مثال: مندوب المنطقة الشمالية" />
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
              تنبيه: الفواتير مرتبطة بالاسم — إعادة تسمية مورد له فواتير تفصلها عن سجله.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setFormOpen(false)}>إلغاء</button>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                {saving ? 'جارٍ الحفظ...' : editingId ? 'حفظ التعديلات' : 'إضافة المورد'}
              </button>
            </div>
          </div>
        </Modal>
      )}

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
