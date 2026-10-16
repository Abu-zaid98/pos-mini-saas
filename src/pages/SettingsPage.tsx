import { useState, useEffect, type ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import { exportBackup, importBackup, daysSinceBackup } from '../utils/backup'
import { changePassword, hasPassword, setPassword } from '../utils/auth'
import { getStoredTheme, applyTheme, type Theme } from '../utils/theme'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { usePWAUpdate } from '../hooks/usePWAUpdate'
import { db } from '../db/db'
import { Modal } from '../components/ui/Modal'
import { lic, type LicenseResult } from '../lib/license'
import { Icon, ConfirmModal, useToast, type IconName } from '../components/ui'
import { exportTransactionsToExcel, resetTransactionsData } from '../utils/dataReset'
import { exportFullExcel } from '../utils/excelExport'

interface SettingsSectionProps {
  icon: IconName
  title: string
  subtitle?: string
  accent?: string
  badge?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * بند قابل للطي (فتح/إغلاق) في صفحة الإعدادات.
 * رأس واضح مع أيقونة وعنوان ووصف وسهم يدور عند الفتح.
 */
function SettingsSection({
  icon,
  title,
  subtitle,
  accent,
  badge,
  defaultOpen = false,
  children,
}: SettingsSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={`settings-section ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="settings-section-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="settings-section-icon" style={{ color: accent ?? 'var(--color-primary-light)' }}>
          <Icon name={icon} size={18} />
        </span>
        <span className="settings-section-titles">
          <span className="settings-section-title">{title}</span>
          {subtitle && <span className="settings-section-subtitle">{subtitle}</span>}
        </span>
        {badge && <span className="settings-section-badge">{badge}</span>}
        <Icon name="chevron-down" size={18} className="settings-chevron" />
      </button>
      {open && <div className="settings-section-body">{children}</div>}
    </section>
  )
}

export function SettingsPage() {
  const [storeName, setStoreName] = useState('ميزان')
  const [ownerName, setOwnerName] = useState('')
  const [currency, setCurrency] = useState('₪')
  const [lowStockDefault, setLowStockDefault] = useState('5')
  // تظهر على الفاتورة المطبوعة
  const [storePhone, setStorePhone] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [invoiceFooter, setInvoiceFooter] = useState('شكراً لتسوقكم معنا — نراكم قريباً')
  const [backupDays, setBackupDays] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [currentTheme, setCurrentTheme] = useState<Theme>(getStoredTheme)

  const toast = useToast()

  // تأكيد استعادة النسخة الاحتياطية (بديل عن confirm المتصفح)
  const [pendingImport, setPendingImport] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)

  // تأكيد التحديث القسري (بديل عن confirm المتصفح)
  const [forceRefreshOpen, setForceRefreshOpen] = useState(false)

  // تأكيد تهيئة البيانات: تصدير الحركات إلى إكسل ثم تصفيرها
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  // تصدير التقرير الشامل التفصيلي (كل الأوراق)
  const [exportingFull, setExportingFull] = useState(false)

  const {
    canInstall,
    isInstalled,
    installApp,
    isPersistent,
    requestPersistence,
    storageEstimate,
  } = usePWAInstall()
  const [persistLoading, setPersistLoading] = useState(false)

  // PWA updates — فحص يدوي + تحديث قسري
  const { updateAvailable, applyUpdate, checkNow, forceRefresh, checking } = usePWAUpdate()
  const [updateMsg, setUpdateMsg] = useState('')

  const handleThemeChange = (t: Theme) => {
    applyTheme(t)
    setCurrentTheme(t)
  }

  // Password modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [hasExistingPassword, setHasExistingPassword] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // Logout confirmation modal
  const [logoutModalOpen, setLogoutModalOpen] = useState(false)

  // Deactivate subscription / license confirmation modal
  const [deactivateLicenseOpen, setDeactivateLicenseOpen] = useState(false)

  // License info state
  const [licenseInfo, setLicenseInfo] = useState<LicenseResult | null>(null)
  const [licenseRefreshing, setLicenseRefreshing] = useState(false)

  // PWA guide modal
  const [pwaGuideModalOpen, setPwaGuideModalOpen] = useState(false)
  const [pwaGuideTab, setPwaGuideTab] = useState<'android' | 'ios'>('android')

  const handleInstallClick = async () => {
    if (canInstall) {
      const success = await installApp()
      if (!success) {
        setPwaGuideModalOpen(true)
      }
    } else {
      setPwaGuideModalOpen(true)
    }
  }

  const outlet = useOutletContext<{ onLogout?: () => void }>()

  const handleLogoutClick = () => {
    setLogoutModalOpen(true)
  }

  const confirmLogout = () => {
    setLogoutModalOpen(false)
    outlet?.onLogout?.()
  }

  useEffect(() => {
    // Load settings
    const loadSettings = async () => {
      const [sName, oName, curr, lStock, sPhone, sAddr, invFooter, days, hasPass] = await Promise.all([
        db.settings.get('storeName'),
        db.settings.get('ownerName'),
        db.settings.get('currency'),
        db.settings.get('lowStockDefault'),
        db.settings.get('storePhone'),
        db.settings.get('storeAddress'),
        db.settings.get('invoiceFooter'),
        daysSinceBackup(),
        hasPassword(),
      ])

      if (sName?.value) setStoreName(sName.value as string)
      if (oName?.value) setOwnerName(oName.value as string)
      if (curr?.value) setCurrency(curr.value as string)
      if (lStock?.value) setLowStockDefault(String(lStock.value))
      if (sPhone?.value) setStorePhone(sPhone.value as string)
      if (sAddr?.value) setStoreAddress(sAddr.value as string)
      if (invFooter?.value) setInvoiceFooter(invFooter.value as string)
      setBackupDays(days)
      setHasExistingPassword(hasPass)
    }

    loadSettings()
    lic.check().then((info) => setLicenseInfo(info)).catch(() => null)
  }, [])

  const handleRefreshLicense = async () => {
    setLicenseRefreshing(true)
    try {
      // مزامنة فورية مع السيرفر — أي تخفيض/تمديد من اللوحة يظهر هنا مباشرة
      const res = await lic.sync()
      setLicenseInfo(res)
    } catch {
      // ignore
    } finally {
      setLicenseRefreshing(false)
    }
  }

  const handleDeactivateLicense = () => {
    setDeactivateLicenseOpen(false)
    lic.logout()
    window.location.reload()
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      await db.settings.bulkPut([
        { key: 'storeName', value: storeName.trim() },
        { key: 'ownerName', value: ownerName.trim() },
        { key: 'currency', value: currency.trim() },
        { key: 'lowStockDefault', value: parseInt(lowStockDefault) || 5 },
        { key: 'storePhone', value: storePhone.trim() },
        { key: 'storeAddress', value: storeAddress.trim() },
        { key: 'invoiceFooter', value: invoiceFooter.trim() },
      ])
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err) {
      console.error(err)
      alert('حدث خطأ أثناء حفظ الإعدادات')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = async () => {
    try {
      await exportBackup()
      const days = await daysSinceBackup()
      setBackupDays(days)
      toast.success('تم تصدير النسخة الاحتياطية بنجاح وحُفظت كملف JSON')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر تصدير النسخة الاحتياطية، حاول مرة أخرى')
    }
  }

  const handleFullExcelExport = async () => {
    setExportingFull(true)
    try {
      await exportFullExcel()
      toast.success('تم تصدير التقرير الشامل بكل التفاصيل إلى Excel')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر تصدير التقرير، حاول مرة أخرى')
    } finally {
      setExportingFull(false)
    }
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) setPendingImport(file)
    }
    input.click()
  }

  const handleConfirmImport = async () => {
    const file = pendingImport
    if (!file) return
    setImporting(true)
    try {
      const result = await importBackup(file)
      if (result.success) {
        setPendingImport(null)
        toast.success('تمت استعادة البيانات بنجاح')
        setTimeout(() => window.location.reload(), 1500)
      } else {
        toast.error('فشل الاستيراد: ' + (result.error || 'ملف غير صالح'))
      }
    } catch (err) {
      console.error(err)
      toast.error('فشل الاستيراد: ' + (err instanceof Error ? err.message : 'ملف غير صالح'))
    } finally {
      setImporting(false)
    }
  }

  const handleForceRefresh = () => {
    setForceRefreshOpen(false)
    void forceRefresh()
  }

  const handleDataReset = async () => {
    setResetting(true)
    try {
      // أولاً نصدّر كل الحركات إلى إكسل (حتى يبقى أرشيف كامل قبل التصفير)
      await exportTransactionsToExcel()
      await resetTransactionsData()
      setResetOpen(false)
      toast.success('تم تصدير الحركات إلى إكسل ثم تصفيرها بنجاح')
    } catch (err) {
      console.error(err)
      toast.error('تعذّر إتمام تهيئة البيانات — لم يتم تصفير أي شيء')
    } finally {
      setResetting(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess(false)

    if (newPassword.length < 4) {
      setPasswordError('كلمة المرور يجب أن تكون 4 أرقام/أحرف على الأقل')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('كلمتا المرور غير متطابقتين')
      return
    }

    try {
      if (hasExistingPassword) {
        const ok = await changePassword(oldPassword, newPassword)
        if (!ok) {
          setPasswordError('كلمة المرور الحالية غير صحيحة')
          return
        }
      } else {
        await setPassword(newPassword)
      }

      setPasswordSuccess(true)
      setHasExistingPassword(true)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => {
        setPasswordModalOpen(false)
        setPasswordSuccess(false)
      }, 1500)
    } catch (err) {
      console.error(err)
      setPasswordError('حدث خطأ أثناء تعيين كلمة المرور')
    }
  }

  const openDeveloperWhatsApp = () => {
    const phone = '972592133357'
    const message = encodeURIComponent('السلام عليكم، أحتاج المساعدة بشأن النظام.')
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="page-frame" style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        flexWrap: 'wrap',
        padding: '2px 2px 0',
      }}>
        <div style={{
          color: 'var(--color-text-muted)',
          fontSize: 11,
          fontWeight: 700,
          textAlign: 'center',
        }}>
          تم التطوير بواسطة المهندس محمد الجوجو
        </div>

        <button
          type="button"
          onClick={openDeveloperWhatsApp}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '7px 12px',
            borderRadius: 999,
            border: '1px solid rgba(34,197,94,0.35)',
            background: 'rgba(34,197,94,0.1)',
            color: '#4ade80',
            fontWeight: 800,
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'var(--font-main)',
            boxShadow: '0 4px 12px rgba(34,197,94,0.08)',
          }}
        >
          <span>💬</span>
          <span>واتساب</span>
        </button>
      </div>

      {/* Store Header Card */}
      <div style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 18,
        padding: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: 'var(--shadow-sm)',
        flexWrap: 'wrap',
      }}>
        <img
          src="/logo.jpeg"
          alt="ميزان"
          style={{
            width: 60,
            height: 60,
            borderRadius: 18,
            objectFit: 'cover',
            boxShadow: '0 8px 20px rgba(16, 45, 74, 0.14)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            flexShrink: 0,
            display: 'block',
          }}
        />
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4, color: 'var(--color-text-primary)' }}>
            {storeName.trim() || 'بدون اسم'}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            ميزان — نظام إدارة المبيعات، المخزون، الديون والمصاريف
          </p>
        </div>
      </div>

      {/* Edit Store Profile Form */}
      <SettingsSection
        icon="store"
        title="بيانات المتجر والنظام"
        subtitle="اسم المتجر، المالك، العملة، وحد التنبيه"
        badge={saveSuccess ? '✓ تم الحفظ' : undefined}
      >
        <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
              اسم المتجر:
            </label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
              اسم المالك / المسؤول:
            </label>
            <input
              type="text"
              placeholder="مثال: محمد"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
                رمز العملة:
              </label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
                حد تنبيه نقص المخزون:
              </label>
              <input
                type="number"
                min="1"
                value={lowStockDefault}
                onChange={(e) => setLowStockDefault(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            style={{
              marginTop: 4,
              padding: '11px',
              borderRadius: 10,
              background: 'var(--brand-gradient)',
              border: 'none',
              color: 'white',
              fontWeight: 800,
              fontSize: 14,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-main)',
            }}
          >
            {isSaving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
          </button>
        </form>
      </SettingsSection>

      {/* Invoice appearance — تظهر على الفاتورة المطبوعة */}
      <SettingsSection
        icon="printer"
        title="مظهر الفاتورة المطبوعة"
        subtitle="الهاتف والعنوان ورسالة الشكر التي تظهر على الفاتورة"
        badge={saveSuccess ? '✓ تم الحفظ' : undefined}
      >
        <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
                الهاتف (يظهر أعلى الفاتورة):
              </label>
              <input
                type="tel"
                dir="ltr"
                placeholder="05xxxxxxxx"
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)', fontSize: 14, outline: 'none',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
                العنوان:
              </label>
              <input
                type="text"
                placeholder="مثال: شارع الثورة ، مقابل تاج مول"
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)', fontSize: 14, outline: 'none',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
              رسالة الشكر أسفل الفاتورة:
            </label>
            <input
              type="text"
              value={invoiceFooter}
              onChange={(e) => setInvoiceFooter(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)', fontSize: 14, outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            style={{
              marginTop: 4, padding: '11px', borderRadius: 10,
              background: 'var(--brand-gradient)',
              border: 'none', color: 'white', fontWeight: 800, fontSize: 14,
              cursor: isSaving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-main)',
            }}
          >
            {isSaving ? 'جارٍ الحفظ...' : 'حفظ مظهر الفاتورة'}
          </button>
        </form>
      </SettingsSection>

      {/* Security / Password */}
      <SettingsSection
        icon="lock"
        title="قفل التطبيق وكلمة المرور"
        subtitle={hasExistingPassword ? 'تم تعيين كلمة مرور مشفرة' : 'لم يتم تعيين كلمة مرور بعد'}
      >
        <button
          onClick={() => setPasswordModalOpen(true)}
          style={{
            alignSelf: 'flex-start',
            padding: '8px 16px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'var(--font-main)',
          }}
        >
          {hasExistingPassword ? 'تغيير الرمز' : 'تعيين رمز'}
        </button>
      </SettingsSection>

      {/* License & Subscription Card */}
      <SettingsSection
        icon="shield"
        title="ترخيص النظام والاشتراك"
        subtitle={
          licenseInfo?.ok
            ? (licenseInfo.grace
              ? `فترة سماح مؤقتة: متبقي ${licenseInfo.graceDaysLeft} يوم`
              : `الاشتراك نشط وموثق أوفلاين: متبقي ${licenseInfo.daysLeft} يوم`)
            : 'الترخيص غير مفعّل أو بانتظار التجديد'
        }
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleRefreshLicense}
            disabled={licenseRefreshing}
            style={{
              padding: '7px 14px',
              borderRadius: 10,
              background: 'rgba(59,130,246,0.12)',
              border: '1px solid rgba(59,130,246,0.3)',
              color: 'var(--color-primary-light)',
              fontSize: 12,
              fontWeight: 700,
              cursor: licenseRefreshing ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-main)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="refresh" size={14} />
            <span>{licenseRefreshing ? 'جارٍ الفحص...' : 'تحديث الترخيص'}</span>
          </button>
          <a
            href={lic.renewLink()}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '7px 14px',
              borderRadius: 10,
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.35)',
              color: '#4ade80',
              fontSize: 12,
              fontWeight: 800,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-main)',
            }}
          >
            <Icon name="chat" size={15} />
            <span>تجديد</span>
          </a>
        </div>

        {lic.getUid() && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11.5,
            color: 'var(--color-text-muted)',
            paddingTop: 10,
            borderTop: '1px solid var(--color-border)',
            flexWrap: 'wrap',
            gap: 8,
          }}>
            <span>معرّف المشترك الحالي: <strong style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{lic.getUid()}</strong></span>
            <button
              type="button"
              onClick={() => setDeactivateLicenseOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-danger-light)',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
                fontFamily: 'var(--font-main)',
              }}
            >
              إلغاء تفعيل الترخيص على هذا الجهاز
            </button>
          </div>
        )}
      </SettingsSection>

      {/* Device Storage & Data Protection Card */}
      <SettingsSection
        icon="shield"
        title="حماية بيانات الهاتف"
        subtitle="خيارات متقدمة — التخزين الدائم ومنع مسح البيانات"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, margin: 0 }}>
              بياناتك محفوظة على جهازك وتعمل بدون إنترنت — فعّل الحماية الدائمة حتى لا يمسحها الهاتف تلقائياً
            </p>
          </div>

          {storageEstimate && (
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>المساحة المستهلكة من ذاكرة الهاتف:</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-primary-light)', marginTop: 2 }}>
                  {storageEstimate.usageMB} ميجابايت <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>/ {storageEstimate.quotaMB} ميجابايت سعة مخصصة</span>
                </div>
              </div>
              <Icon name="phone" size={24} color="var(--color-primary-light)" />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                حالة الحماية الدائمة:
              </div>
              <div style={{ fontSize: 12, color: isPersistent ? 'var(--color-success-light)' : 'var(--color-warning-light)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name={isPersistent ? 'check' : 'warning'} size={14} color={isPersistent ? 'var(--color-success-light)' : '#fbbf24'} />
                <span>
                  {isPersistent
                    ? 'مفعّلة: بياناتك محمية ولن تُمسح تلقائياً'
                    : 'غير مفعّلة: فعّلها لحماية بياناتك من المسح التلقائي'}
                </span>
              </div>
            </div>

            {!isPersistent && (
              <button
                type="button"
                disabled={persistLoading}
                onClick={async () => {
                  setPersistLoading(true)
                  const ok = await requestPersistence()
                  setPersistLoading(false)
                  if (ok) {
                    alert('تم تفعيل التخزين الدائم وحماية قاعدة البيانات بنجاح!')
                  } else {
                    alert('لم يتم منح الإذن التلقائي، قم بتثبيت التطبيق على الشاشة الرئيسية ليتم تفعيله بأعلى درجة أمان.')
                  }
                }}
                style={{
                  background: 'rgba(59,130,246,0.15)',
                  border: '1px solid rgba(59,130,246,0.35)',
                  borderRadius: 10,
                  padding: '8px 14px',
                  color: 'var(--color-primary-light)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-main)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon name="shield" size={15} />
                <span>{persistLoading ? 'جارٍ التفعيل...' : 'تفعيل الحماية الدائمة'}</span>
              </button>
            )}
          </div>
        </div>
      </SettingsSection>

      {/* Appearance & Theme Card */}
      <SettingsSection
        icon="sun"
        title="مظهر التطبيق (الثيم)"
        subtitle="التبديل بين الثيم الداكن والفاتح المريح للعين"
      >
        <div style={{
          display: 'flex',
          background: 'var(--color-input-bg)',
          borderRadius: 12,
          padding: 3,
          border: '1px solid var(--color-border)',
          gap: 4,
        }}>
          <button
            type="button"
            onClick={() => handleThemeChange('dark')}
            style={{
              padding: '6px 14px',
              borderRadius: 9,
              border: 'none',
              background: currentTheme === 'dark' ? 'var(--brand-gradient)' : 'transparent',
              color: currentTheme === 'dark' ? 'white' : 'var(--color-text-secondary)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-main)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="moon" size={15} />
            <span>داكن</span>
          </button>
          <button
            type="button"
            onClick={() => handleThemeChange('light')}
            style={{
              padding: '6px 14px',
              borderRadius: 9,
              border: 'none',
              background: currentTheme === 'light' ? 'var(--brand-gradient)' : 'transparent',
              color: currentTheme === 'light' ? 'white' : 'var(--color-text-secondary)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-main)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="sun" size={15} />
            <span>فاتح</span>
          </button>
        </div>
      </SettingsSection>

      {/* PWA Installation Card */}
      <SettingsSection
        icon="download"
        title="تثبيت التطبيق على الجهاز"
        subtitle="تنزيل التطبيق للعمل كبرنامج مستقل على شاشة هاتفك أو حاسوبك بدون شريط المتصفح"
        badge={isInstalled ? '✓ مثبت بالفعل' : undefined}
      >
        {isInstalled ? (
          <div style={{
            background: 'rgba(16,185,129,0.1)',
            border: '1.5px solid rgba(16,185,129,0.3)',
            borderRadius: 14,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <Icon name="check" size={24} color="var(--color-success-light)" />
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-success-light)' }}>
                التطبيق مثبت بالفعل على هذا الجهاز
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                يعمل الآن كبرنامج مستقل (Standalone) بسرعة فائقة وبدون اتصال بالإنترنت.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={handleInstallClick}
              style={{
                background: 'var(--brand-gradient)',
                border: 'none',
                borderRadius: 14,
                padding: '14px 20px',
                color: 'white',
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                boxShadow: '0 4px 16px rgba(59,130,246,0.35)',
                fontFamily: 'var(--font-main)',
                transition: 'all 0.18s ease',
              }}
            >
              <Icon name="download" size={18} />
              <span>تثبيت التطبيق على الهاتف </span>
            </button>

            <button
              type="button"
              onClick={() => setPwaGuideModalOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary-light)',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
                textDecoration: 'underline',
                fontFamily: 'var(--font-main)',
              }}
            >
              كيف يتم تثبيت التطبيق على آيفون أو أندرويد يدوياً؟
            </button>

            {/* Manual update check + force refresh */}
            <div style={{
              borderTop: '1px dashed var(--color-border)',
              paddingTop: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={checking}
                  onClick={async () => {
                    if (updateAvailable) {
                      await applyUpdate()
                      return
                    }
                    setUpdateMsg('')
                    const found = await checkNow()
                    setUpdateMsg(found ? '🚀 يوجد تحديث جديد — سيظهر زر التحديث أسفل الشاشة' : '✓ نسختك هي الأحدث')
                    setTimeout(() => setUpdateMsg(''), 5000)
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 10,
                    background: 'rgba(16,185,129,0.12)',
                    border: '1px solid rgba(16,185,129,0.35)',
                    color: 'var(--color-success-light)',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: checking ? 'wait' : 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  {checking ? 'جارٍ الفحص...' : updateAvailable ? '🚀 تطبيق التحديث الآن' : '🔄 التحقق من وجود تحديث'}
                </button>
              </div>
              {updateAvailable ? (
                <button
                  type="button"
                  onClick={() => applyUpdate()}
                  style={{
                    padding: '10px',
                    borderRadius: 10,
                    background: 'var(--mint-gradient)',
                    border: 'none',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-main)',
                  }}
                >
                  🚀 تطبيق التحديث الجديد الآن
                </button>
              ) : null}
              {updateMsg && (
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center', margin: 0 }}>
                  {updateMsg}
                </p>
              )}
              <button
                type="button"
                onClick={() => setForceRefreshOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'center',
                  textDecoration: 'underline',
                  fontFamily: 'var(--font-main)',
                }}
              >
                التطبيق عالق على نسخة قديمة؟ تحديث قسري (يمسح الكاش)
              </button>
            </div>
          </div>
        )}
      </SettingsSection>

      {/* Backup Section */}
      <SettingsSection
        icon="download"
        title="النسخ الاحتياطية وتقرير شامل"
        subtitle="احفظ نسخة للاسترجاع، أو صدّر تقرير Excel بكل التفاصيل"
        badge={
          <span style={{
            fontSize: 12,
            padding: '3px 8px',
            borderRadius: 50,
            background: backupDays === null || backupDays > 3 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
            color: backupDays === null || backupDays > 3 ? 'var(--color-warning-light)' : 'var(--color-success-light)',
            fontWeight: 700,
          }}>
            {backupDays === null ? 'لا توجد نسخة سابقة' : backupDays === 0 ? 'اليوم' : `منذ ${backupDays} أيام`}
          </span>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* مجموعة النسخ الاحتياطية */}
          <div>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-secondary)', margin: '0 0 6px' }}>
              النسخ الاحتياطية
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
              احفظ نسخة من بياناتك أسبوعياً لاسترجاعها عند الحاجة.
            </p>

            <div style={{ border: '1px solid var(--color-border)', borderRadius: 14, overflow: 'hidden' }}>
              <button
                onClick={handleExport}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  color: 'var(--color-text-primary)',
                  textAlign: 'right',
                  fontFamily: 'var(--font-main)',
                }}
              >
                <Icon name="download" size={20} color="var(--color-primary-light)" />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>حفظ نسخة احتياطية</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>تحميل ملف نسخة كامل يحتوي المنتجات والديون والفواتير</p>
                </div>
              </button>

              <button
                onClick={handleImport}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-primary)',
                  textAlign: 'right',
                  fontFamily: 'var(--font-main)',
                }}
              >
                <Icon name="upload" size={20} color="var(--color-success-light)" />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>استرجاع نسخة سابقة</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>اختر ملف النسخة لاسترجاع كل السجلات السابقة</p>
                </div>
              </button>
            </div>
          </div>

          {/* تقرير Excel — كتلة منفصلة بهوية إكسل الخضراء */}
          <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 16 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
              تقرير شامل (Excel)
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 14,
                border: '1px solid rgba(16,185,129,0.35)',
                background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.03))',
              }}
            >
              <span
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 13,
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(16,185,129,0.18)',
                  color: '#16a34a',
                }}
              >
                <Icon name="excel" size={26} />
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>تصدير تقرير Excel شامل</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0', lineHeight: 1.6 }}>
                  كل التفاصيل في ملف واحد: مبيعات ومشتريات بالعبوات، مرتجعات، دفعات، مصاريف، أرصدة وملخص مالي.
                </p>
              </div>

              <button
                onClick={handleFullExcelExport}
                disabled={exportingFull}
                style={{
                  flexShrink: 0,
                  padding: '10px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: exportingFull ? 'default' : 'pointer',
                  opacity: exportingFull ? 0.6 : 1,
                  fontFamily: 'var(--font-main)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 6px 16px rgba(16,185,129,0.28)',
                }}
              >
                <Icon name="download" size={16} />
                <span>{exportingFull ? 'جارٍ...' : 'تصدير'}</span>
              </button>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* تهيئة البيانات — تصدير الحركات إلى إكسل ثم تصفيرها */}
      <SettingsSection
        icon="trash"
        title="تهيئة البيانات"
        subtitle="تصدير كل الحركات السابقة إلى إكسل ثم تصفيرها"
        accent="var(--color-danger-light)"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.7 }}>
            يصدّر هذا الخيار كل عملياتك السابقة (المبيعات، المشتريات، الدفعات، المصاريف،
            التحويلات، الإنتاج) وأرصدة العملاء والموردين إلى ملف Excel متعدد الأوراق، ثم
            يصفّرها نهائياً لتعود للعمل بسجل نظيف.
          </p>

          <ul style={{
            margin: 0,
            paddingInlineStart: 18,
            fontSize: 12,
            color: 'var(--color-text-muted)',
            lineHeight: 1.9,
          }}>
            <li>
              <strong style={{ color: 'var(--color-danger-light)' }}>يُصفّر:</strong>{' '}
              الفواتير والمشتريات والدفعات والمصاريف والتحويلات والإنتاج، وديون العملاء وأرصدة الموردين.
            </li>
            <li>
              <strong style={{ color: 'var(--color-success-light)' }}>يُبقي:</strong>{' '}
              الأصناف والمخزون، وقوائم العملاء والموردين، والإعدادات وبيانات المتجر.
            </li>
          </ul>

          <button
            type="button"
            onClick={() => setResetOpen(true)}
            style={{
              alignSelf: 'flex-start',
              padding: '11px 18px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              border: 'none',
              color: 'white',
              fontSize: 13.5,
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: 'var(--font-main)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 6px 16px rgba(239,68,68,0.28)',
              transition: 'all 0.15s ease',
            }}
          >
            <Icon name="trash" size={16} />
            <span>تصدير الحركات وتصفير البيانات</span>
          </button>
        </div>
      </SettingsSection>

      {/* Logout Card — آخر بند في الصفحة */}
      <div style={{
        background: 'rgba(239,68,68,0.06)',
        border: '1px solid rgba(239,68,68,0.25)',
        borderRadius: 16,
        padding: 16,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="lock" size={18} color="var(--color-danger-light)" />
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-danger-light)', margin: 0 }}>
              تسجيل الخروج
            </h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, margin: 0 }}>
            قفل التطبيق والعودة لشاشة إدخال رمز المرور (PIN)
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogoutClick}
          style={{
            padding: '9px 18px',
            borderRadius: 10,
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            border: 'none',
            color: 'white',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'var(--font-main)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(239,68,68,0.25)',
          }}
        >
          <Icon name="lock" size={15} />
          <span>تسجيل خروج</span>
        </button>
      </div>

      {/* MODAL: CHANGE PASSWORD */}
      <Modal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        title={hasExistingPassword ? 'تغيير رمز المرور' : 'تعيين رمز مرور جديد'}
        type="box"
      >
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {passwordError && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', color: 'var(--color-danger-light)', fontSize: 13, fontWeight: 600 }}>
              ⚠ {passwordError}
            </div>
          )}

          {passwordSuccess && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.15)', color: 'var(--color-success-light)', fontSize: 13, fontWeight: 600 }}>
              ✓ تم تعيين كلمة المرور بنجاح!
            </div>
          )}

          {hasExistingPassword && (
            <div>
              <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                كلمة المرور الحالية:
              </label>
              <input
                type="password"
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
              كلمة المرور الجديدة:
            </label>
            <input
              type="password"
              required
              placeholder="4 خانات على الأقل"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
              تأكيد كلمة المرور:
            </label>
            <input
              type="password"
              required
              placeholder="أعد كتابة كلمة المرور"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button
              type="button"
              onClick={() => setPasswordModalOpen(false)}
              className="btn btn-ghost"
              style={{ flex: 1 }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              حفظ الرمز
            </button>
          </div>
        </form>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        open={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        title="🔒 تسجيل الخروج"
        type="box"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🚪</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              هل تريد قفل التطبيق؟
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              سيتم إغلاق الجلسة الحالية وستحتاج إلى كلمة المرور للدخول مجدداً
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => setLogoutModalOpen(false)}
              className="btn btn-ghost"
              style={{ flex: 1 }}
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={confirmLogout}
              className="btn btn-danger"
              style={{ flex: 1 }}
            >
              🔒 تأكيد الخروج
            </button>
          </div>
        </div>
      </Modal>

      {/* Deactivate Subscription / License Confirmation Modal */}
      <ConfirmModal
        open={deactivateLicenseOpen}
        onClose={() => setDeactivateLicenseOpen(false)}
        onConfirm={handleDeactivateLicense}
        title="إلغاء تفعيل الاشتراك"
        icon="🔓"
        message="هل أنت متأكد من إلغاء تفعيل هذا الترخيص على هذا الجهاز؟"
        subMessage="سيتم الخروج من الاشتراك الحالي، وسيطلب الدخول مجدداً تفعيل الاشتراك عبر الإنترنت."
        confirmText="نعم، إلغاء التفعيل"
        cancelText="تراجع"
        variant="danger"
      />

      {/* Import Backup Confirmation */}
      <ConfirmModal
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        onConfirm={handleConfirmImport}
        title="استعادة نسخة احتياطية"
        icon="📥"
        message="سيتم استبدال البيانات الحالية بالبيانات الموجودة في الملف."
        subMessage={`الملف: ${pendingImport?.name ?? ''} — لا يمكن التراجع عن هذه العملية.`}
        confirmText="نعم، استعادة"
        cancelText="إلغاء"
        variant="warning"
        loading={importing}
        loadingText="جارٍ الاستعادة..."
      />

      {/* Force Refresh Confirmation */}
      <ConfirmModal
        open={forceRefreshOpen}
        onClose={() => setForceRefreshOpen(false)}
        onConfirm={handleForceRefresh}
        title="تحديث قسري"
        icon="🔄"
        message="سيتم مسح ذاكرة التخزين المؤقت وإعادة تحميل أحدث نسخة."
        subMessage="استخدم هذا الخيار فقط إذا كان التطبيق عالقاً على نسخة قديمة."
        confirmText="نعم، تحديث قسري"
        cancelText="إلغاء"
        variant="primary"
      />

      {/* Data Initialization Confirmation */}
      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleDataReset}
        title="تهيئة البيانات"
        icon="⚠️"
        message="سيتم تصدير كل الحركات السابقة إلى ملف Excel ثم تصفيرها نهائياً."
        subMessage="لا يمكن التراجع عن هذه العملية. ستبقى الأصناف والمخزون والعملاء والموردين والإعدادات محفوظة."
        confirmText="نعم، تصدير وتصفير"
        cancelText="إلغاء"
        variant="danger"
        loading={resetting}
        loadingText="جارٍ التصدير والتصفير..."
      />

      {/* PWA Install Guide Modal */}
      <Modal
        open={pwaGuideModalOpen}
        onClose={() => setPwaGuideModalOpen(false)}
        title="📲 تثبيت التطبيق على هاتفك"
        type="box"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* OS Tabs */}
          <div style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 3,
            gap: 4,
          }}>
            <button
              type="button"
              onClick={() => setPwaGuideTab('android')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 9,
                border: 'none',
                background: pwaGuideTab === 'android' ? 'var(--brand-gradient)' : 'transparent',
                color: pwaGuideTab === 'android' ? 'white' : 'var(--color-text-secondary)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
              }}
            >
              📱 أندرويد (Chrome)
            </button>
            <button
              type="button"
              onClick={() => setPwaGuideTab('ios')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 9,
                border: 'none',
                background: pwaGuideTab === 'ios' ? 'var(--brand-gradient)' : 'transparent',
                color: pwaGuideTab === 'ios' ? 'white' : 'var(--color-text-secondary)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
              }}
            >
              🍏 آيفون (Safari)
            </button>
          </div>

          {pwaGuideTab === 'android' ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: '14px',
              fontSize: 13,
              lineHeight: 1.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 18 }}>1️⃣</span>
                <span>افتح التطبيق عبر متصفح <strong>Google Chrome</strong> على جوالك.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 18 }}>2️⃣</span>
                <span>اضغط على قائمة <strong>النقاط الثلاث (⋮)</strong> في أعلى يسار أو يمين الشاشة.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 18 }}>3️⃣</span>
                <span>اختر <strong>«تثبيت التطبيق»</strong> أو <strong>«إضافة إلى الشاشة الرئيسية»</strong>.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 18 }}>✨</span>
                <span>سيتم تنزيل أيقونة البرنامج لتفتحه مباشرة كأي تطبيق أصلي بدون إنترنت!</span>
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: '14px',
              fontSize: 13,
              lineHeight: 1.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 18 }}>1️⃣</span>
                <span>افتح الرابط في متصفح <strong>Safari</strong> على الآيفون أو الآيباد.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 18 }}>2️⃣</span>
                <span>اضغط على زر المشاركة <strong>(Share) 📤</strong> في الشريط السفلي.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 18 }}>3️⃣</span>
                <span>مرر للأسفل واضغط على <strong>«إضافة إلى الصفحة الرئيسية» ➕</strong>.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 18 }}>4️⃣</span>
                <span>اضغط <strong>«إضافة»</strong> في الزاوية وسيصبح التطبيق برنامجاً كاملاً على شاشتك.</span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setPwaGuideModalOpen(false)}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 12,
              border: 'none',
              background: 'var(--color-primary)',
              color: 'white',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-main)',
            }}
          >
            فهمت، شكراً ✓
          </button>
        </div>
      </Modal>
    </div>
  )
}
