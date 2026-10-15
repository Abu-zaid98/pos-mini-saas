import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  DEFAULT_WALLETS,
  WALLETS_KEY,
  normalizeWallets,
  setWalletRegistry,
  type Wallet,
} from '../utils/wallets'

/**
 * يقرأ المحافظ المخصصة (تفاعلياً) مع الرجوع للافتراضية.
 * ويُحدِّث السجل العام حتى تعمل دوال العرض الثابتة (getPaymentMethodName).
 */
export function useWallets(): Wallet[] {
  const list = useLiveQuery(async () => {
    const setting = await db.settings.get(WALLETS_KEY)
    return normalizeWallets(setting?.value)
  }, [])

  const wallets = list ?? DEFAULT_WALLETS

  useEffect(() => {
    setWalletRegistry(wallets)
  }, [wallets])

  return wallets
}

/** المحافظ النشطة فقط (غير المؤرشفة) — للاستخدام في قوائم اختيار الدفع */
export function activeWallets(list: Wallet[]): Wallet[] {
  return list.filter((w) => !w.archived)
}

export async function getWallets(): Promise<Wallet[]> {
  const setting = await db.settings.get(WALLETS_KEY)
  return normalizeWallets(setting?.value)
}

export async function saveWallets(list: Wallet[]): Promise<Wallet[]> {
  const normalized = normalizeWallets(list)
  await db.settings.put({ key: WALLETS_KEY, value: normalized })
  setWalletRegistry(normalized)
  return normalized
}

function newWalletId(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export async function addWallet(name: string, icon: string): Promise<Wallet[]> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('يرجى كتابة اسم المحفظة')
  const list = await getWallets()
  if (list.some((w) => w.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('يوجد محفظة بنفس الاسم مسبقاً')
  }
  return saveWallets([
    ...list,
    { id: newWalletId(), name: trimmed, icon: icon.trim() || '💼' },
  ])
}

export async function updateWallet(
  id: string,
  data: { name: string; icon: string; archived?: boolean },
): Promise<Wallet[]> {
  const trimmed = data.name.trim()
  if (!trimmed) throw new Error('يرجى كتابة اسم المحفظة')
  const list = await getWallets()
  if (list.some((w) => w.id !== id && w.name.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('يوجد محفظة بنفس الاسم مسبقاً')
  }
  return saveWallets(
    list.map((w) =>
      w.id === id
        ? { ...w, name: trimmed, icon: data.icon.trim() || '💼', archived: data.archived ?? w.archived }
        : w,
    ),
  )
}

export async function archiveWallet(id: string, archived: boolean): Promise<Wallet[]> {
  const list = await getWallets()
  return saveWallets(list.map((w) => (w.id === id ? { ...w, archived } : w)))
}

/** حذف محفظة — يُسمح به فقط إذا لم تكن مستخدمة في أي حركة (وإلا يُنصح بالأرشفة) */
export async function deleteWallet(id: string): Promise<Wallet[]> {
  if (await isWalletInUse(id)) {
    throw new Error('لا يمكن حذف محفظة لها حركات مسجلة — يمكنك أرشفتها بدل ذلك.')
  }
  const list = await getWallets()
  return saveWallets(list.filter((w) => w.id !== id))
}

/** هل للمحفظة أي حركة أو رصيد افتتاحي مرتبط بها؟ */
export async function isWalletInUse(id: string): Promise<boolean> {
  const [payments, purchases, expenses, invoices, transfers, opening, adjustments] = await Promise.all([
    db.payments.where('method').equals(id).count(),
    db.purchases.toArray(),
    db.expenses.toArray(),
    db.invoices.toArray(),
    db.transfers.toArray(),
    db.settings.get('wallet_opening_balances'),
    db.settings.get('wallet_adjustments'),
  ])

  if (payments > 0) return true
  if (invoices.some((inv) => inv.paymentMethod === id)) return true
  if (expenses.some((e) => e.paymentMethod === id)) return true
  if (transfers.some((t) => t.fromMethod === id || t.toMethod === id)) return true
  if (
    purchases.some(
      (p) =>
        p.paymentMethod === id ||
        (p.supplierPayments || []).some((sp) => sp.paymentMethod === id),
    )
  ) {
    return true
  }

  const openingMap = (opening?.value as Record<string, number> | undefined) || {}
  if (Number(openingMap[id]) > 0) return true

  if (Array.isArray(adjustments?.value)) {
    if ((adjustments!.value as Array<{ method?: string }>).some((a) => a?.method === id)) return true
  }

  return false
}
