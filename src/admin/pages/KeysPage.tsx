/**
 * KeysPage.tsx — إدارة مفاتيح ECDSA P-256
 * توليد، استيراد، عرض المفتاح العام للنسخ
 */
import { useState, useEffect } from 'react'
import { generateEcdsaKeyPair, savePrivateKey, loadPrivateKey, deletePrivateKey, hasPrivateKey } from '../crypto'
import { useToast, useConfirm } from '../components/feedback'

const APP_ID = import.meta.env.VITE_LIC_APP_ID || '1374790599531web0b22b9db833219122b122e'
const WHATSAPP = import.meta.env.VITE_LIC_WHATSAPP || '972592133357'
const APP_NAME = import.meta.env.VITE_LIC_APP_NAME || 'نظام نقاط البيع والمبيعات (POS)'

export function KeysPage() {
  const [hasPK, setHasPK] = useState(false)
  const [publicKey, setPublicKey] = useState<JsonWebKey | null>(null)
  const [loading, setLoading] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [exportCopied, setExportCopied] = useState(false)
  const [exportSaved, setExportSaved] = useState(false)
  const [importFileName, setImportFileName] = useState('')
  const toast = useToast()
  const confirmAction = useConfirm()

  useEffect(() => {
    checkKey()
  }, [])

  const checkKey = () => {
    const exists = hasPrivateKey(APP_ID)
    setHasPK(exists)
    if (exists) {
      const pk = loadPrivateKey(APP_ID)
      // نعرض المفتاح العام المشتق من المفتاح الخاص المحفوظ (بدون d)
      if (pk) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { d: _d, ...pubPart } = pk as JsonWebKey & { d?: string }
        setPublicKey({ ...pubPart, key_ops: ['verify'] })
      }
    } else {
      setPublicKey(null)
    }
  }

  const handleGenerate = async () => {
    if (hasPK) {
      const ok = await confirmAction({
        title: 'استبدال المفتاح الحالي؟',
        message: 'التوكنات الموقعة بالمفتاح القديم ستتوقف عن العمل. تأكد أنك تعرف ما تفعل.',
        confirmLabel: 'توليد جديد',
        danger: true,
      })
      if (!ok) return
    }
    setLoading(true)
    try {
      const { privateKey: priv } = await generateEcdsaKeyPair()
      savePrivateKey(APP_ID, priv)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { d: _d, ...pubPart } = priv as JsonWebKey & { d?: string }
      setPublicKey({ ...pubPart, key_ops: ['verify'] })
      setHasPK(true)
      toast.success('تم توليد المفتاح', 'انسخ المفتاح العام إلى ملف .env ثم خذ نسخة احتياطية من الخاص')
    } catch (e) {
      toast.error('فشل توليد المفتاح', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleImport = () => {
    setImportError('')
    try {
      const parsed = JSON.parse(importJson)
      if (!parsed.kty || !parsed.crv || !parsed.x || !parsed.y || !parsed.d) {
        setImportError('المفتاح غير صالح — يجب أن يحتوي على kty, crv, x, y, d')
        return
      }
      savePrivateKey(APP_ID, parsed)
      setShowImport(false)
      setImportJson('')
      checkKey()
      toast.success('تم استيراد المفتاح بنجاح')
    } catch {
      setImportError('خطأ في تحليل JSON — تأكد من صحة النص')
    }
  }

  const handleDelete = () => {
    deletePrivateKey(APP_ID)
    setHasPK(false)
    setPublicKey(null)
    setShowDelete(false)
    toast.success('تم حذف المفتاح من هذا الجهاز')
  }

  const copyPublicKey = () => {
    if (!publicKey) return
    navigator.clipboard.writeText(JSON.stringify(publicKey)).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    })
  }

  /** تنزيل المفتاح الخاص كملف JSON — للنقل الآمن بين الأجهزة */
  const downloadPrivateKey = () => {
    const pk = loadPrivateKey(APP_ID)
    if (!pk) return
    const blob = new Blob([JSON.stringify(pk, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const a = document.createElement('a')
    a.href = url
    a.download = `pos-private-key-${stamp}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setExportSaved(true)
    setTimeout(() => setExportSaved(false), 2500)
  }

  /** قراءة ملف المفتاح وتعبئته في حقل الاستيراد */
  const handleImportFile = (file: File | undefined) => {
    if (!file) return
    setImportFileName(file.name)
    setImportError('')
    file
      .text()
      .then((text) => setImportJson(text.trim()))
      .catch(() => setImportError('تعذّر قراءة الملف — تأكد أنه ملف نصي صالح'))
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">المفاتيح التشفيرية</h1>
          <p className="admin-page-desc">إدارة مفاتيح ECDSA P-256 لإصدار توقيع التوكنات</p>
        </div>
      </div>

      {/* How it works */}
      <div className="admin-card-panel admin-info-panel">
        <h3 className="admin-panel-title">⚙️ كيف يعمل النظام</h3>
        <div className="admin-steps">
          <div className="admin-step">
            <div className="admin-step-num">1</div>
            <div>
              <div className="admin-step-title">توليد زوج المفاتيح</div>
              <div className="admin-step-desc">تُنشئ زوج مفاتيح ECDSA P-256 — المفتاح الخاص يُحفظ في هذا المتصفح فقط ولا يُرفع للسيرفر أبداً.</div>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">2</div>
            <div>
              <div className="admin-step-title">نسخ المفتاح العام</div>
              <div className="admin-step-desc">انسخ المفتاح العام (JWK) والصقه في ملف <code>.env</code> الخاص بتطبيق POS كـ <code>VITE_LIC_PUBLIC_KEY</code>.</div>
            </div>
          </div>
          <div className="admin-step">
            <div className="admin-step-num">3</div>
            <div>
              <div className="admin-step-title">إصدار التوكنات</div>
              <div className="admin-step-desc">عند إنشاء أو تجديد اشتراك، يُوقَّع التوكن بالمفتاح الخاص ويُرفع لـ Firestore — التطبيق يتحقق منه محلياً بالمفتاح العام.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Status */}
      <div className="admin-card-panel">
        <div className="admin-panel-header">
          <h3 className="admin-panel-title">مفتاح التطبيق الحالي</h3>
          <div className="admin-keys-actions">
            {!hasPK ? (
              <>
                <button
                  id="generate-key-btn"
                  className="admin-btn-primary admin-btn-sm"
                  onClick={handleGenerate}
                  disabled={loading}
                >
                  {loading ? <><span className="admin-spinner" /> جارٍ التوليد...</> : '🔑 توليد مفتاح جديد'}
                </button>
                <button
                  className="admin-btn-secondary admin-btn-sm"
                  onClick={() => setShowImport(true)}
                >
                  📥 استيراد مفتاح
                </button>
              </>
            ) : (
              <>
                <button
                  className="admin-btn-secondary admin-btn-sm"
                  onClick={handleGenerate}
                  disabled={loading}
                >
                  🔄 إعادة توليد
                </button>
                <button
                  className="admin-btn-secondary admin-btn-sm"
                  onClick={() => setShowExport(true)}
                >
                  📤 نسخة احتياطية
                </button>
                <button
                  className="admin-btn-danger admin-btn-sm"
                  onClick={() => setShowDelete(true)}
                >
                  🗑️ حذف المفتاح
                </button>
              </>
            )}
          </div>
        </div>

        {!hasPK ? (
          <div className="admin-key-empty">
            <div className="admin-key-empty-icon">🔐</div>
            <p>لا يوجد مفتاح خاص محفوظ في هذا الجهاز.</p>
            <p className="admin-key-empty-note">لإصدار توكنات للمشتركين يجب توليد أو استيراد مفتاح خاص أولاً.</p>
          </div>
        ) : (
          <>
            <div className="admin-key-status">
              <span className="admin-badge admin-badge-success">✓ المفتاح محفوظ في هذا المتصفح</span>
              <span className="admin-key-app-id">App ID: <code>{APP_ID}</code></span>
            </div>

            {publicKey && (
              <div className="admin-key-public-section">
                <div className="admin-panel-header">
                  <span className="admin-label">المفتاح العام (JWK) — انسخه للتطبيق</span>
                  <button
                    className={`admin-btn-secondary admin-btn-xs ${copySuccess ? 'admin-btn-success' : ''}`}
                    onClick={copyPublicKey}
                  >
                    {copySuccess ? '✓ تم النسخ!' : '📋 نسخ'}
                  </button>
                </div>
                <pre className="admin-key-json">{JSON.stringify(publicKey, null, 2)}</pre>
                <div className="admin-env-hint">
                  <p className="admin-env-hint-title">📄 في ملف <code>.env</code> الخاص بتطبيق POS:</p>
                  <pre className="admin-env-code">VITE_LIC_PUBLIC_KEY='{JSON.stringify(publicKey)}'</pre>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* App Config */}
      <div className="admin-card-panel">
        <h3 className="admin-panel-title">إعدادات التطبيق</h3>
        <dl className="admin-info-list">
          <div className="admin-info-row">
            <dt>اسم التطبيق</dt>
            <dd>{APP_NAME}</dd>
          </div>
          <div className="admin-info-row">
            <dt>معرّف التطبيق (App ID)</dt>
            <dd><code className="admin-mono">{APP_ID}</code></dd>
          </div>
          <div className="admin-info-row">
            <dt>واتساب الدعم</dt>
            <dd>
              <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noreferrer" className="admin-phone-link">
                +{WHATSAPP}
              </a>
            </dd>
          </div>
        </dl>
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="admin-modal-overlay" onClick={() => setShowImport(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">استيراد مفتاح خاص</h2>
              <button className="admin-modal-close" onClick={() => setShowImport(false)}>✕</button>
            </div>
            <p className="admin-modal-desc">الصق المفتاح الخاص بصيغة JWK — يجب أن يحتوي على الحقل <code>d</code> — أو اختر ملف النسخة الاحتياطية:</p>
            {importError && <div className="admin-alert admin-alert-error">{importError}</div>}
            <label
              className="admin-btn-secondary admin-btn-sm"
              style={{ justifyContent: 'center', cursor: 'pointer', marginBottom: 10 }}
            >
              📁 اختيار ملف المفتاح (.json)
              <input
                type="file"
                accept=".json,.txt,application/json"
                onChange={(e) => {
                  handleImportFile(e.target.files?.[0])
                  e.target.value = ''
                }}
                style={{ display: 'none' }}
              />
            </label>
            {importFileName && (
              <p className="admin-field-hint" style={{ marginBottom: 8 }}>
                📄 الملف المختار: <code className="admin-mono">{importFileName}</code> — راجع المحتوى ثم اضغط استيراد
              </p>
            )}
            <textarea
              className="admin-input admin-textarea admin-mono"
              rows={8}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='{"kty":"EC","crv":"P-256","x":"...","y":"...","d":"..."}'
              dir="ltr"
            />
            <div className="admin-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setShowImport(false)}>إلغاء</button>
              <button className="admin-btn-primary" onClick={handleImport}>استيراد</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDelete && (
        <div className="admin-modal-overlay" onClick={() => setShowDelete(false)}>
          <div className="admin-modal admin-modal-sm" onClick={(e) => e.stopPropagation()} role="alertdialog">
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">⚠️ حذف المفتاح الخاص</h2>
            </div>
            <p className="admin-modal-body">
              سيؤدي حذف المفتاح الخاص إلى منعك من إصدار توكنات جديدة. يجب توليد مفتاح جديد وتحديث <code>VITE_LIC_PUBLIC_KEY</code> في تطبيق POS، وإعادة إصدار جميع توكنات المشتركين.
            </p>
            <div className="admin-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setShowDelete(false)}>إلغاء</button>
              <button className="admin-btn-danger" onClick={handleDelete}>حذف المفتاح</button>
            </div>
          </div>
        </div>
      )}

      {/* Export private key backup */}
      {showExport && (
        <div className="admin-modal-overlay" onClick={() => setShowExport(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="نسخة احتياطية للمفتاح الخاص">
            <div className="admin-modal-header">
              <h2 className="admin-modal-title">📤 نسخة احتياطية — المفتاح الخاص</h2>
              <button className="admin-modal-close" onClick={() => setShowExport(false)}>✕</button>
            </div>
            <div className="admin-alert admin-alert-error" style={{ marginBottom: 12 }}>
              <span>🔴</span>
              <span>سري للغاية! من يملك هذا المفتاح يستطيع إصدار توكنات باسمك. احفظه في مكان آمن غير متصل (USB/ورقة) ولا تشاركه أبداً ولا ترفعه على الإنترنت.</span>
            </div>
            <p className="admin-modal-desc">
              المفتاح محفوظ في هذا المتصفح فقط — إن فُقد (مسح البيانات/جهاز جديد) لن تستطيع إصدار توكنات إلا بتوليد مفتاح جديد وإعادة إصدار كل الاشتراكات. انسخه الآن:
            </p>
            <pre className="admin-key-json" dir="ltr">{JSON.stringify(loadPrivateKey(APP_ID), null, 2)}</pre>
            <div className="admin-modal-footer" style={{ justifyContent: 'stretch' }}>
              <button className="admin-btn-secondary" onClick={() => setShowExport(false)}>إغلاق</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className={`admin-btn-primary ${exportCopied ? 'admin-btn-success' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(loadPrivateKey(APP_ID))).then(() => {
                    setExportCopied(true)
                    setTimeout(() => setExportCopied(false), 2000)
                  })
                }}
              >
                {exportCopied ? '✓ تم النسخ — احفظه الآن' : '📋 نسخ كنص'}
              </button>
              <button
                className={`admin-btn-secondary ${exportSaved ? 'admin-btn-success' : ''}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={downloadPrivateKey}
              >
                {exportSaved ? '✓ تم التنزيل' : '⬇ تنزيل ملف'}
              </button>
            </div>
            <p className="admin-field-hint" style={{ marginTop: 8 }}>
              الملف للنقل بين أجهزتك فقط — انقله عبر USB ثم احذفه من مجلد التنزيلات، ولا ترفعه على أي سحابة.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
