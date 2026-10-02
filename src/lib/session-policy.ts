/**
 * session-policy.ts — سياسة الجلسات والأجهزة (دوال نقية قابلة للاختبار)
 *
 * القاعدة: كل حساب يعمل على عدد محدود من الأجهزة (افتراضياً جهاز واحد).
 * كل جهاز يرسل نبضة (heartbeat) دورياً؛ الجهاز الذي لا ينبض منذ STALE_MS
 * يُعتبر مغادراً ويُفسح مكانه. المدير يستطيع فك الارتباط ورفع الحد.
 */

export interface SessionDevice {
  id: string
  /** آخر نبضة بالمللي ثانية */
  seen: number
}

export const SESSION_STALE_MS = 15 * 60_000 // 15 دقيقة بدون نبض = مغادر
export const SESSION_PRUNE_MS = 60 * 60_000 // نحذف سجلات الأجهزة بعد ساعة
export const SESSION_DEFAULT_MAX = 1

/** الأجهزة النشطة فقط (نبضة حديثة ومعرّف صالح) */
export function activeDevices(devices: SessionDevice[], nowMs: number): SessionDevice[] {
  return (devices || []).filter(
    (d) => d && typeof d.id === 'string' && d.id.length > 0 && nowMs - (Number(d.seen) || 0) < SESSION_STALE_MS
  )
}

/** احذف السجلات القديمة جداً لتقليل حجم المستند */
export function pruneDevices(devices: SessionDevice[], nowMs: number): SessionDevice[] {
  return (devices || []).filter(
    (d) => d && typeof d.id === 'string' && d.id.length > 0 && nowMs - (Number(d.seen) || 0) < SESSION_PRUNE_MS
  )
}

/**
 * هل يُمنع هذا الجهاز؟
 * يُمنع فقط إذا وُجدت أجهزة نشطة أخرى بعدد يملأ الحد الأقصى.
 */
export function isSessionBlocked(
  devices: SessionDevice[],
  myId: string,
  max: number,
  nowMs: number
): boolean {
  const limit = Math.max(1, Number(max) || SESSION_DEFAULT_MAX)
  const others = activeDevices(devices, nowMs).filter((d) => d.id !== myId)
  return others.length >= limit
}

/** ادمج نبضتي في القائمة (أضفني أو حدّث وقتي، مع تنظيف القديم) */
export function mergeHeartbeat(
  devices: SessionDevice[],
  myId: string,
  nowMs: number
): SessionDevice[] {
  const pruned = pruneDevices(devices, nowMs)
  const exists = pruned.some((d) => d.id === myId)
  const merged = exists
    ? pruned.map((d) => (d.id === myId ? { ...d, seen: nowMs } : d))
    : [...pruned, { id: myId, seen: nowMs }]
  return merged.slice(-10) // سقف أمان لحجم المستند
}

/** معرّف قصير للعرض (أول 8 أحرف) */
export function shortDeviceId(id: string): string {
  return (id || '').slice(0, 8).toUpperCase()
}
