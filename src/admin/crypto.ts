/**
 * crypto.ts — توليد ECDSA P-256 key pairs وإصدار JWT tokens موقّعة
 * يعمل في المتصفح عبر Web Crypto API
 */

// ─────────────────────────────────────────────────────────────────
// Key Generation
// ─────────────────────────────────────────────────────────────────

const ALGO = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN_ALGO = { name: 'ECDSA', hash: 'SHA-256' } as const

/** توليد زوج مفاتيح ECDSA P-256 جديد */
export async function generateEcdsaKeyPair(): Promise<{
  publicKey: JsonWebKey
  privateKey: JsonWebKey
}> {
  const keyPair = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify'])

  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const privateKey = await crypto.subtle.exportKey('jwk', keyPair.privateKey)

  return { publicKey, privateKey }
}

// ─────────────────────────────────────────────────────────────────
// Token Signing
// ─────────────────────────────────────────────────────────────────

function b64uEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function objToB64u(obj: object): string {
  const json = JSON.stringify(obj)
  const enc = new TextEncoder()
  return b64uEncode(enc.encode(json).buffer as ArrayBuffer)
}

/** إصدار JWT token موقّع بـ ECDSA لاشتراك مشترك */
export async function issueToken(params: {
  uid: string
  appId: string
  expiryMs: number   // تاريخ الانتهاء بـ milliseconds
  graceDays: number
  privateKeyJwk: JsonWebKey
}): Promise<string> {
  const { uid, appId, expiryMs, graceDays, privateKeyJwk } = params

  const payload = {
    u: uid,
    a: appId,
    exp: expiryMs,
    g: graceDays,
    iat: Date.now(),
  }

  const payloadB64 = objToB64u(payload)

  // استيراد المفتاح الخاص
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    ALGO,
    false,
    ['sign']
  )

  // التوقيع
  const enc = new TextEncoder()
  const sigBuf = await crypto.subtle.sign(SIGN_ALGO, privateKey, enc.encode(payloadB64))
  const sigB64 = b64uEncode(sigBuf)

  return `${payloadB64}.${sigB64}`
}

// ─────────────────────────────────────────────────────────────────
// Key Storage (localStorage — private key never leaves the device)
// ─────────────────────────────────────────────────────────────────

const PRIVATE_KEY_STORAGE_PREFIX = 'admin_pk_'

export function savePrivateKey(appId: string, privateKeyJwk: JsonWebKey): void {
  localStorage.setItem(PRIVATE_KEY_STORAGE_PREFIX + appId, JSON.stringify(privateKeyJwk))
}

export function loadPrivateKey(appId: string): JsonWebKey | null {
  const raw = localStorage.getItem(PRIVATE_KEY_STORAGE_PREFIX + appId)
  if (!raw) return null
  try {
    return JSON.parse(raw) as JsonWebKey
  } catch {
    return null
  }
}

export function deletePrivateKey(appId: string): void {
  localStorage.removeItem(PRIVATE_KEY_STORAGE_PREFIX + appId)
}

export function hasPrivateKey(appId: string): boolean {
  return !!localStorage.getItem(PRIVATE_KEY_STORAGE_PREFIX + appId)
}

// ─────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────

/** حساب تاريخ الانتهاء (نهاية اليوم — للتوافق القديم) */
export function calcExpiryMs(fromDate: Date, durationDays: number): number {
  const d = new Date(fromDate)
  d.setDate(d.getDate() + durationDays)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

/** حساب دقيق يحافظ على الوقت: أيام + ساعات */
export function calcExpiryMsPrecise(fromDate: Date, durationDays: number, durationHours = 0): number {
  const d = new Date(fromDate).getTime()
  return d + Math.round(durationDays) * DAY_MS + Math.round(durationHours * 10) / 10 * HOUR_MS
}

/** إضافة مدة (موجبة أو سالبة) لتاريخ موجود */
export function addDurationMs(date: Date, deltaDays: number, deltaHours = 0): number {
  return date.getTime() + Math.round(deltaDays) * DAY_MS + Math.round(deltaHours * 10) / 10 * HOUR_MS
}

/** تحويل ms إلى {days, hours, mins} للعرض */
export function msToDhms(ms: number): { days: number; hours: number; mins: number; totalHours: number; expired: boolean } {
  if (ms <= 0) return { days: 0, hours: 0, mins: 0, totalHours: 0, expired: true }
  const totalMins = Math.floor(ms / 60_000)
  return {
    days: Math.floor(totalMins / 1440),
    hours: Math.floor((totalMins % 1440) / 60),
    mins: totalMins % 60,
    totalHours: Math.floor(ms / HOUR_MS),
    expired: false,
  }
}

/** تنسيق datetime-local */
export function toDatetimeLocalValue(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}

/** وصف مدة بالعربية */
export function formatDurationAr(days: number, hours = 0): string {
  const parts: string[] = []
  if (days > 0) parts.push(`${days} يوم`)
  if (hours > 0) parts.push(`${hours} ساعة`)
  if (parts.length === 0) return 'بدون مدة'
  return parts.join(' و ')
}

/** تنسيق المفتاح العام للعرض */
export function formatPublicKeyForDisplay(jwk: JsonWebKey): string {
  return JSON.stringify(jwk, null, 2)
}
