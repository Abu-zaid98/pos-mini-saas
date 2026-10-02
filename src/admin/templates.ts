/**
 * templates.ts — قوالب رسائل الواتساب (بدون اعتماد على subscriptions لتجنب الدوران)
 */
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { WhatsTemplates } from './types'

export const DEFAULT_TEMPLATES: WhatsTemplates = {
  renewal:
    'مرحباً {name}،\n\nنود إعلامك بأن اشتراكك في نظام نقاط البيع (POS) سينتهي قريباً.\n\n📅 تاريخ الانتهاء: {date}\n👤 معرّفك: {uid}\n\nللتجديد وضمان الاستمرار بدون انقطاع، تواصل معنا.',
  expiring:
    'مرحباً {name}،\n\nتذكير: اشتراكك ينتهي خلال {days} — جدد الآن لتجنب التوقف.',
  expired:
    'مرحباً {name}،\n\nاشتراكك في نظام نقاط البيع (POS) قد انتهى في {date}.\n\n👤 معرّفك: {uid}\n\nللتجديد وإعادة التفعيل الفوري، تواصل معنا الآن.',
  receipt:
    '🧾 *إيصال تجديد اشتراك*\nرقم الإيصال: {receipt}\nالمشترك: {name}\nالمدة: {period}\nمن {from} إلى {to}\nالمبلغ: {amount} {currency} ({method})\n\nشكراً لثقتكم 🌟',
}

/** تعبئة متغيرات القالب {name} {days} {date} {uid} {receipt} {period} {from} {to} {amount} {currency} {method} */
export function formatTemplate(text: string, vars: Record<string, string | number>): string {
  let out = text
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(String(value))
  }
  return out
}

let cachedTemplates: WhatsTemplates | null = null

export function getTemplates(): WhatsTemplates {
  return cachedTemplates || DEFAULT_TEMPLATES
}

export async function loadTemplates(): Promise<WhatsTemplates> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'templates'))
    if (snap.exists()) {
      const data = snap.data() as Partial<WhatsTemplates>
      cachedTemplates = { ...DEFAULT_TEMPLATES, ...data }
    } else {
      cachedTemplates = DEFAULT_TEMPLATES
    }
  } catch {
    cachedTemplates = DEFAULT_TEMPLATES
  }
  return cachedTemplates!
}

export async function saveTemplates(t: WhatsTemplates): Promise<void> {
  await setDoc(doc(db, 'settings', 'templates'), { ...t })
  cachedTemplates = { ...t }
}
