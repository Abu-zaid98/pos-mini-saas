import { useMemo, useState } from 'react'
import { Button, Modal, ConfirmModal, SectionHeader, Icon, PageHeader } from '../components/ui'
import { useWallets, addWallet, updateWallet, archiveWallet, deleteWallet, isWalletInUse, activeWallets } from '../hooks/useWallets'
import { useAccountBalances } from '../hooks/useInvoices'
import { WALLET_ICON_CHOICES, type Wallet } from '../utils/wallets'
import { formatCurrency } from '../utils/currency'
import { WalletDetailModal } from '../components/wallet/WalletDetailModal'
import { WalletTransferModal } from '../components/wallet/WalletTransferModal'
import { WalletOpeningBalanceModal } from '../components/wallet/WalletOpeningBalanceModal'

export function WalletsPage() {
  const wallets = useWallets()
  const balances = useAccountBalances()
  const [detailMethod, setDetailMethod] = useState<string | null>(null)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showOpening, setShowOpening] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Wallet | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('💵')
  const [iconOpen, setIconOpen] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Wallet | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<Wallet | null>(null)
  const [inUse, setInUse] = useState(false)

  const active = useMemo(() => activeWallets(wallets), [wallets])
  const archived = useMemo(() => wallets.filter((w) => w.archived), [wallets])

  const resetForm = () => {
    setEditing(null)
    setName('')
    setIcon('💵')
    setError('')
  }

  const handleAdd = () => {
    resetForm()
    setFormOpen(true)
  }

  const handleEdit = (w: Wallet) => {
    setEditing(w)
    setName(w.name)
    setIcon(w.icon)
    setError('')
    setFormOpen(true)
  }

  const handleOpenDelete = async (w: Wallet) => {
    setConfirmDelete(w)
    setInUse(await isWalletInUse(w.id))
  }

  const handleSave = async () => {
    setError('')
    const trimmed = name.trim()
    if (!trimmed) {
      setError('يرجى كتابة اسم المحفظة')
      return
    }
    setLoading(true)
    try {
      if (editing) {
        await updateWallet(editing.id, { name: trimmed, icon })
      } else {
        await addWallet(trimmed, icon)
      }
      setFormOpen(false)
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setLoading(false)
    }
  }

  const handleArchive = async () => {
    if (!confirmArchive) return
    setLoading(true)
    try {
      await archiveWallet(confirmArchive.id, true)
      setConfirmArchive(null)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setLoading(true)
    try {
      await deleteWallet(confirmDelete.id)
      setConfirmDelete(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setLoading(false)
    }
  }

  const balanceOf = (id: string) => Number((balances as any)[id] ?? 0)

  return (
    <div className="page-frame" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PageHeader
          icon="banknotes"
          title="الخزينة والمحافظ"
          subtitle="إدارة المحافظ، الأرصدة الافتتاحية والتحويلات بين المحافظ"
          actions={
            <>
              <Button variant="ghost" onClick={() => setShowOpening(true)}>رصيد افتتاحي</Button>
              <Button variant="ghost" onClick={() => setShowTransfer(true)}>تحويل بين المحافظ</Button>
              <Button variant="primary" onClick={handleAdd}>
                <Icon name="plus" size={15} />
                <span>إضافة محفظة</span>
              </Button>
            </>
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <div className="stat-card" style={{ background: 'var(--color-bg-elevated)', padding: 12, borderRadius: 12, border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>إجمالي الأرصدة</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)', direction: 'ltr', textAlign: 'right' }}>{formatCurrency(balances.total)}</div>
          </div>
          {wallets.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setDetailMethod(w.id)}
              style={{ textAlign: 'right', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 12, cursor: 'pointer' }}
            >
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>{w.icon}</span>
                <span>{w.name}</span>
                {w.archived && <span className="badge badge-muted">مؤرشفة</span>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', direction: 'ltr' }}>{formatCurrency(balanceOf(w.id))}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionHeader title="إدارة المحافظ" />
        {active.length === 0 && <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>لا توجد محافظ نشطة</div>}
        {active.map((w) => (
          <div key={w.id} style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{w.icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{w.name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', direction: 'ltr' }}>{formatCurrency(balanceOf(w.id))}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleEdit(w)}>تعديل</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmArchive(w)}>أرشفة</button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => handleOpenDelete(w)}>حذف</button>
            </div>
          </div>
        ))}
        {archived.length > 0 && (
          <>
            <SectionHeader title="المحافظ المؤرشفة" />
            {archived.map((w) => (
              <div key={w.id} style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', opacity: 0.75 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{w.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{w.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', direction: 'ltr' }}>{formatCurrency(balanceOf(w.id))}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => archiveWallet(w.id, false).catch(() => {})}>إلغاء أرشفة</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleOpenDelete(w)}>حذف</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'تعديل محفظة' : 'إضافة محفظة'} footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setFormOpen(false)} style={{ flex: 1 }}>إلغاء</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading} style={{ flex: 1 }}>{loading ? 'جارٍ الحفظ...' : 'حفظ'}</button>
        </div>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}
          <div className="input-wrap">
            <label className="input-label">اسم المحفظة</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: المحفظة الذكية / حساب بنك" />
          </div>
          <div className="input-wrap">
            <label className="input-label">أيقونة</label>
            <button type="button" className="btn btn-ghost" onClick={() => setIconOpen(true)}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ marginInlineStart: 6 }}>تغيير الأيقونة</span>
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={iconOpen} onClose={() => setIconOpen(false)} title="اختيار أيقونة المحفظة">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {WALLET_ICON_CHOICES.map((i) => (
            <button key={i} type="button" onClick={() => { setIcon(i); setIconOpen(false) }} style={{ fontSize: 22, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 8 }}>{i}</button>
          ))}
        </div>
      </Modal>

      <ConfirmModal open={confirmArchive !== null} onClose={() => setConfirmArchive(null)} onConfirm={handleArchive} title="أرشفة المحفظة" message={`هل تريد أرشفة "${confirmArchive?.name}"؟ لن تظهر في قوائم الدفع لكن حركاتها تبقى محفوظة.`} />

      <ConfirmModal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} onConfirm={handleDelete} title="حذف المحفظة" message={inUse ? `لا يمكن حذف "${confirmDelete?.name}" لأنها مستخدمة في حركات مسجلة. يمكنك أرشفتها بدلًا من ذلك.` : `هل تريد حذف "${confirmDelete?.name}" نهائيًا؟`} confirmText={inUse ? 'أرشفة بدل الحذف' : 'حذف'} variant={inUse ? 'warning' : 'danger'} />
      {inUse && (
        <div style={{ marginTop: -6, marginInline: 12, fontSize: 11, color: 'var(--color-warning-light)' }}>
          لا يمكن الحذف؛ المحفظة مرتبطة بحركات مسجلة (فواتير، مصاريف، تحويلات...)
        </div>
      )}

      <WalletDetailModal method={detailMethod} onClose={() => setDetailMethod(null)} />
      <WalletTransferModal open={showTransfer} onClose={() => setShowTransfer(false)} onSuccess={() => {}} />
      <WalletOpeningBalanceModal open={showOpening} onClose={() => setShowOpening(false)} onSuccess={() => {}} />
    </div>
  )
}
