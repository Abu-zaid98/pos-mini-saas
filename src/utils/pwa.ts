/**
 * pwa.ts — أدوات إشعار تثبيت التطبيق (PWA)
 * تُستخدم في الكاشير ولوحة التحكم لعرض تنزيل البرنامج على الجوال
 */

export type PwaPlatform = 'ios' | 'android' | 'desktop'

/** كشف المنصة من userAgent (يقبل قيمة مخصصة للاختبارات) */
export function detectPlatform(ua?: string): PwaPlatform {
  const agent = (ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')).toLowerCase()
  if (/iphone|ipad|ipod/.test(agent)) return 'ios'
  if (/android/.test(agent)) return 'android'
  return 'desktop'
}

/** هل يعمل داخل التطبيق المثبت (standalone)؟ */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const nav = window.navigator as unknown as { standalone?: boolean }
  return nav.standalone === true
}

const SNOOZE_DAYS_DEFAULT = 7

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

/** هل يجب عرض إشعار التثبيت؟ (ليس مثبتاً + غير مؤجّل) */
export function shouldShowPrompt(key: string, nowMs = Date.now()): boolean {
  if (isRunningStandalone()) return false
  const store = storage()
  if (!store) return true
  try {
    const raw = store.getItem(key)
    if (!raw) return true
    return nowMs >= Number(raw) || !Number.isFinite(Number(raw))
  } catch {
    return true
  }
}

/** تأجيل الإشعار لعدد أيام */
export function snoozePrompt(key: string, days = SNOOZE_DAYS_DEFAULT, nowMs = Date.now()): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(key, String(nowMs + days * 86_400_000))
  } catch {
    // تجاهل — التخزين غير متاح
  }
}

/** خطوات التثبيت اليدوي حسب المنصة */
export const PWA_STEPS: Record<'android' | 'ios', string[]> = {
  android: [
    'افتح التطبيق من متصفح Google Chrome على جوالك',
    'اضغط قائمة النقاط الثلاث (⋮) أعلى الشاشة',
    'اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»',
  ],
  ios: [
    'افتح الرابط من متصفح Safari على الآيفون',
    'اضغط زر المشاركة 📤 في الشريط السفلي',
    'اختر «إضافة إلى الصفحة الرئيسية» ثم «إضافة»',
  ],
}
