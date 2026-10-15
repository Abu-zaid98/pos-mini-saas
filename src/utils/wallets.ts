/**
 * wallets.ts — نظام المحافظ/الحسابات القابل للتخصيص
 *
 * كل "محفظة" هي حساب مالي (صندوق كاش، محفظة إلكترونية، بنك...) يعرّفه المستخدم بنفسه
 * مع اسم وأيقونة. المعرّف (id) نصي ثابت يُخزَّن على الفواتير والدفعات والمصاريف
 * والتحويلات — لذلك تبقى الحركات التاريخية سليمة حتى لو غيّر المستخدم الاسم لاحقاً.
 *
 * هذا الملف نقي (بلا اعتماد على قاعدة البيانات) حتى تستطيع الوحدات الأخرى استخدامه،
 * ويُبقي "سجلاً عاماً" (registry) يُحدَّث من hook useWallets ليقرأ الثوابت الأسماء المخصصة.
 */

export interface Wallet {
  id: string
  name: string
  icon: string
  /** محفظة مؤرشفة: تبقى حركاتها التاريخية لكن لا تظهر في قوائم اختيار الدفع */
  archived?: boolean
}

export const WALLETS_KEY = 'wallets'

/** المحافظ الافتراضية — معرّفاتها مطابقة للمدفوعات القديمة حتى لا تنكسر البيانات السابقة */
export const DEFAULT_WALLETS: Wallet[] = [
  { id: 'cash', name: 'نقداً (كاش)', icon: '💵' },
  { id: 'jawwal_pay', name: 'جوال باي', icon: '📱' },
  { id: 'palpay', name: 'بال باي', icon: '💳' },
  { id: 'bop', name: 'بنك فلسطين', icon: '🏦' },
]

/** يوازي PAYMENT_METHODS القديمة: { id, label, icon } */
export const WALLET_ICON_CHOICES = [
  '💵', '💳', '🏦', '📱', '💰', '🪙', '📲', '🧾', '🏧', '💼',
  '🛒', '🏪', '🎁', '✈️', '🚚', '🔒', '⭐', '🕌', '📈', '💎',
]

export function normalizeWallets(value: unknown): Wallet[] {
  if (!Array.isArray(value)) return DEFAULT_WALLETS
  const list = (value as Array<Partial<Wallet>>)
    .filter((w) => w && typeof w.id === 'string' && String(w.id).trim() !== '')
    .map((w) => ({
      id: String(w.id),
      name: (typeof w.name === 'string' ? w.name.trim() : '') || String(w.id),
      icon: typeof w.icon === 'string' && w.icon.trim() ? w.icon : '💼',
      archived: w.archived === true,
    }))
  return list.length ? list : DEFAULT_WALLETS
}

// ===========================
// سجل عام — يُحدَّث من useWallets
// ===========================
let registry: Wallet[] = DEFAULT_WALLETS

export function setWalletRegistry(list: Wallet[]): void {
  registry = list.length ? list : DEFAULT_WALLETS
}

export function getWalletRegistry(): Wallet[] {
  return registry
}

export function findWallet(id: string | undefined, list: Wallet[] = registry): Wallet | undefined {
  if (!id) return undefined
  return list.find((w) => w.id === id)
}

export function walletName(id: string | undefined, list: Wallet[] = registry): string {
  return findWallet(id, list)?.name || id || 'نقداً (كاش)'
}

export function walletIcon(id: string | undefined, list: Wallet[] = registry): string {
  return findWallet(id, list)?.icon || '💼'
}

/** الاسم المعروض: أيقونة + اسم (مثال: "💵 نقداً (كاش)") */
export function walletLabel(id?: string, list: Wallet[] = registry): string {
  const w = findWallet(id, list)
  if (!w) return walletName(id, list)
  return `${w.icon} ${w.name}`
}

/**
 * الاسم القديم — يُقرأ من السجل العام افتراضياً فيعمل في كل مواضع الاستدعاء
 * الثابتة، ويمكن تمرير قائمة المحافظ لجعله تفاعلياً.
 */
export function getPaymentMethodName(method?: string, list: Wallet[] = registry): string {
  return walletLabel(method, list)
}
