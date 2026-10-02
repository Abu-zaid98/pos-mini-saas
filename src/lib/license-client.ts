/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║              license-client.ts  — v1.0                          ║
 * ║  مكتبة التحقق من الترخيص الأوفلاين لتطبيقات محمد               ║
 * ║                                                                  ║
 * ║  الاستخدام:                                                       ║
 * ║    import { createLicense } from "./license-client";             ║
 * ║    export const lic = createLicense({ ... });                    ║
 * ║    const result = await lic.start();                             ║
 * ║    if (!result.ok) showLoginOrExpiredScreen(result.reason);      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 *  ⚠️  هذه المكتبة:
 *  - ES Module نقية — لا تعتمد على React أو أي إطار عمل.
 *  - تعمل في المتصفح فقط (تستخدم Web Crypto + localStorage).
 *  - آمنة للعميل العادي، وليست مضمونة ضد مبرمجين متمرسين.
 */

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

import {
  isSessionBlocked,
  mergeHeartbeat,
  SESSION_DEFAULT_MAX,
  type SessionDevice,
} from "./session-policy";

/** إعداد المكتبة */
export interface LicenseConfig {
  /** إعدادات Firebase (نفس مشروع لوحة التحكم) */
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
  };
  /** معرّف التطبيق — يجب أن يطابق appId في لوحة التحكم تماماً */
  appId: string;
  /** اسم التطبيق للعرض في رسائل الخطأ */
  appName: string;
  /** رقم واتساب للدعم (بصيغة دولية بدون +) */
  whatsapp: string;
  /** المفتاح العام ECDSA P-256 بصيغة JWK — انسخه من تبويب المفاتيح */
  publicKey: JsonWebKey;
}

/** نتيجة فحص الترخيص */
export type LicenseResult =
  | { ok: true; grace: false; daysLeft: number; status: "active" | "trial" }
  | { ok: true; grace: true; daysLeft: number; status: "grace"; graceDaysLeft: number }
  | { ok: false; reason: LicenseFailReason };

export type LicenseFailReason =
  | "login"    // لا توكن محلي، يحتاج تسجيل دخول
  | "expired"  // انتهى الاشتراك وفترة السماح
  | "invalid"  // توقيع غير صالح أو تطبيق مختلف
  | "clock"    // ساعة الجهاز رُجِّعت للخلف
  | "session"  // الحساب مستخدم على جهاز آخر (تجاوز حد الأجهزة)
  | "network"; // لا إنترنت ولا توكن محلي

/** نتيجة جلب الاشتراك من السيرفر */
type FetchOutcome =
  | { kind: "token"; token: string }
  | { kind: "deleted" }
  | { kind: "suspended" };

/** تفاصيل الاشتراك المحلي (للتوكن المخزن على الجهاز) */
export interface LocalSubscriptionDetails {
  uid: string;
  expiryMs: number;
  graceDays: number;
  issuedAt: number;
}

/** الحمولة المشفرة داخل التوكن */
export interface TokenPayload {
  u: string;   // uid
  a: string;   // appId
  exp: number; // تاريخ انتهاء الاشتراك (ms)
  g: number;   // أيام السماح
  iat: number; // وقت إصدار التوكن (ms)
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_ALGO = { name: "ECDSA", hash: "SHA-256" } as const;
// كان يوماً كاملاً — أي تخفيض/تعديل من اللوحة كان يتأخر حتى 24 ساعة.
// 5 دقائق توازن بين التحديث شبه الفوري وعدم إرهاق Firebase.
const REFRESH_INTERVAL = 5 * 60_000;

// ─────────────────────────────────────────────────────────────────
// Storage keys (prefixed by appId to avoid collisions)
// ─────────────────────────────────────────────────────────────────

function storageKeys(appId: string) {
  return {
    token: `lic_token_${appId}`,
    uid: `lic_uid_${appId}`,
    idToken: `lic_idt_${appId}`,   // Firebase idToken (قصير الأمد، للتجديد)
    lastFetch: `lic_last_fetch_${appId}`,
    lastSeen: `lic_last_seen_${appId}`, // لحماية ضد إرجاع الساعة
    device: `lic_dev_${appId}`,     // بصمة هذا الجهاز (ثابتة)
    heartbeat: `lic_hb_${appId}`,   // آخر نبضة أُرسلت للسيرفر
  };
}

// ─────────────────────────────────────────────────────────────────
// Base64url helpers
// ─────────────────────────────────────────────────────────────────

function b64uDecode(s: string): ArrayBuffer {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ─────────────────────────────────────────────────────────────────
// Token verification (ECDSA P-256)
// ─────────────────────────────────────────────────────────────────

async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, ALGO, true, ["verify"]);
}

function derToP1363(der: Uint8Array): Uint8Array | null {
  if (der[0] !== 0x30) return null;
  let offset = 2;
  if (der[1] & 0x80) {
    offset = 2 + (der[1] & 0x7f);
  }
  if (der[offset] !== 0x02) return null;
  const rLen = der[offset + 1];
  offset += 2;
  const r = der.subarray(offset, offset + rLen);
  offset += rLen;

  if (der[offset] !== 0x02) return null;
  const sLen = der[offset + 1];
  offset += 2;
  const s = der.subarray(offset, offset + sLen);

  const raw = new Uint8Array(64);
  const rTrimmed = r[0] === 0x00 && r.length === 33 ? r.subarray(1) : r;
  raw.set(rTrimmed, 32 - rTrimmed.length);

  const sTrimmed = s[0] === 0x00 && s.length === 33 ? s.subarray(1) : s;
  raw.set(sTrimmed, 64 - sTrimmed.length);

  return raw;
}

async function verifyToken(
  token: string,
  publicKey: CryptoKey
): Promise<TokenPayload | null> {
  try {
    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) {
      console.warn("[License Verify] Token format invalid - missing payload or signature");
      return null;
    }

    const dec = new TextDecoder();
    let payload: TokenPayload | null = null;
    try {
      payload = JSON.parse(dec.decode(b64uDecode(payloadB64))) as TokenPayload;
    } catch {
      return null;
    }

    const enc = new TextEncoder();
    const sigBytes = new Uint8Array(b64uDecode(sigB64));

    let valid = await crypto.subtle.verify(
      SIGN_ALGO,
      publicKey,
      sigBytes,
      enc.encode(payloadB64)
    );

    if (!valid && sigBytes[0] === 0x30) {
      const p1363 = derToP1363(sigBytes);
      if (p1363) {
        valid = await crypto.subtle.verify(
          SIGN_ALGO,
          publicKey,
          p1363 as unknown as ArrayBuffer,
          enc.encode(payloadB64)
        );
      }
    }

    if (!valid) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Firebase REST helpers (بدون Firebase SDK)
// ─────────────────────────────────────────────────────────────────

interface FirebaseRestConfig {
  apiKey: string;
  projectId: string;
}

/** تسجيل الدخول بـ Firebase Auth REST API */
async function firebaseSignIn(
  cfg: FirebaseRestConfig,
  email: string,
  password: string
): Promise<{ idToken: string; localId: string; refreshToken: string }> {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cfg.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    const code = err.error?.message || "UNKNOWN";
    if (
      code.includes("INVALID_PASSWORD") ||
      code.includes("EMAIL_NOT_FOUND") ||
      code.includes("INVALID_LOGIN_CREDENTIALS") ||
      code.includes("INVALID_EMAIL")
    ) {
      throw new LicenseError("invalid-credentials", "اسم المستخدم أو كلمة المرور غير صحيحة");
    }
    if (code.includes("TOO_MANY_ATTEMPTS")) {
      throw new LicenseError("too-many-attempts", "تم تجاوز عدد المحاولات المسموح بها. حاول لاحقاً.");
    }
    throw new LicenseError("network", "تعذّر الاتصال بالخادم — تحقق من اتصالك بالإنترنت");
  }

  return res.json() as Promise<{ idToken: string; localId: string; refreshToken: string }>;
}

/** تجديد Firebase idToken باستخدام refreshToken */
async function firebaseRefresh(
  apiKey: string,
  refreshToken: string
): Promise<{ id_token: string } | null> {
  try {
    const url = `https://securetoken.googleapis.com/v1/token?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ id_token: string }>;
  } catch {
    return null;
  }
}

/** قراءة مستند Firestore بـ REST */
async function firestoreGet(
  cfg: FirebaseRestConfig,
  idToken: string,
  path: string
): Promise<Record<string, unknown> | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new LicenseError("network", "تعذّر الوصول إلى بيانات الاشتراك");

  const doc = await res.json() as FirestoreDoc;
  return parseFirestoreDoc(doc);
}

// ─────────────────────────────────────────────────────────────────
// Firestore document parser (REST format → plain object)
// ─────────────────────────────────────────────────────────────────

interface FirestoreDoc {
  fields?: Record<string, FirestoreValue>;
}

interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

function parseFirestoreDoc(doc: FirestoreDoc): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!doc.fields) return result;
  for (const [key, val] of Object.entries(doc.fields)) {
    if (val.stringValue !== undefined) result[key] = val.stringValue;
    else if (val.integerValue !== undefined) result[key] = Number(val.integerValue);
    else if (val.doubleValue !== undefined) result[key] = val.doubleValue;
    else if (val.booleanValue !== undefined) result[key] = val.booleanValue;
    else result[key] = null;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────
// Custom error class
// ─────────────────────────────────────────────────────────────────

export class LicenseError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LicenseError";
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────────
// createLicense — المصنع الرئيسي
// ─────────────────────────────────────────────────────────────────

export function createLicense(config: LicenseConfig) {
  const { firebaseConfig, appId, appName, whatsapp, publicKey: pubJwk } = config;
  const K = storageKeys(appId);
  const restCfg: FirebaseRestConfig = {
    apiKey: firebaseConfig.apiKey,
    projectId: firebaseConfig.projectId,
  };

  // مفتاح محفوظ في الذاكرة بعد أول import
  let _pubKey: CryptoKey | null = null;

  async function getPubKey(): Promise<CryptoKey> {
    if (!_pubKey) _pubKey = await importPublicKey(pubJwk);
    return _pubKey;
  }

  // ── localStorage helpers ──
  const ls = {
    get: (k: string) => localStorage.getItem(k),
    set: (k: string, v: string) => localStorage.setItem(k, v),
    del: (k: string) => localStorage.removeItem(k),
    getNum: (k: string) => Number(localStorage.getItem(k) || "0"),
  };

  function clearLocal() {
    Object.values(K).forEach((k) => ls.del(k));
  }

  // ── Evaluate payload → LicenseResult ──
  function evalPayload(payload: TokenPayload): LicenseResult {
    const now = Date.now();
    const expMs = payload.exp;
    const graceMs = payload.g * DAY_MS;
    const graceEnd = expMs + graceMs;
    const daysLeft = Math.ceil((expMs - now) / DAY_MS);

    if (now <= expMs) {
      // نعتبر الاشتراك "trial" إذا كان iat أقل من 30 يوم قبل exp
      const status: "active" | "trial" =
        expMs - payload.iat <= 30 * DAY_MS + DAY_MS ? "trial" : "active";
      return { ok: true, grace: false, daysLeft: Math.max(0, daysLeft), status };
    }

    if (now <= graceEnd) {
      const graceDaysLeft = Math.ceil((graceEnd - now) / DAY_MS);
      return { ok: true, grace: true, daysLeft: 0, status: "grace", graceDaysLeft };
    }

    return { ok: false, reason: "expired" };
  }

  // ── Fetch latest token from Firestore & save ──
  // الحالات: token (جديد) | deleted (حُذف المستند/التوكن) | suspended (موقوف من اللوحة)
  // ويThrow عند خطأ شبكة.
  async function fetchToken(idToken: string, uid: string): Promise<FetchOutcome> {
    const subId = `${uid}_${appId}`;
    const data = await firestoreGet(restCfg, idToken, `subs/${subId}`);
    if (!data || typeof data.token !== "string") return { kind: "deleted" };
    // ⛔ التعليق من اللوحة يجب أن يوقف التطبيق فوراً — التوكن وحده لا يكفي
    if (data.status === "suspended" || data.disabled === true) return { kind: "suspended" };
    // لا نحفظ قبل التحقق من التوقيع — حتى لا نستبدل توكناً صالحاً بآخر فاسد
    const pubKey = await getPubKey();
    const payload = await verifyToken(data.token, pubKey);
    if (!payload || payload.a !== appId) {
      console.warn("[License Sync] تم تجاهل توكن قادم من السيرفر (توقيع غير صالح)");
      const fallback = ls.get(K.token);
      return { kind: "token", token: fallback ?? data.token };
    }
    ls.set(K.token, data.token);
    ls.set(K.lastFetch, String(Date.now()));
    return { kind: "token", token: data.token };
  }

  // ── Try silent refresh using stored refreshToken ──
  // 'updated' | 'deleted' | 'suspended' | 'session-blocked' | 'no-session' — ويThrow عند فشل الشبكة
  async function trySilentRefresh(uid: string): Promise<"updated" | "deleted" | "suspended" | "session-blocked" | "no-session"> {
    const refreshToken = ls.get(K.idToken); // نخزن refreshToken في K.idToken
    if (!refreshToken) return "no-session";
    const result = await firebaseRefresh(restCfg.apiKey, refreshToken);
    if (!result) throw new LicenseError("network", "تعذّر تجديد الجلسة");
    const newIdToken = result.id_token;
    // فحص الأجهزة أولاً — جهاز آخر نشط يمنع هذا الجهاز
    const session = await checkSession(newIdToken, uid, false);
    if (session === "blocked") return "session-blocked";
    const outcome = await fetchToken(newIdToken, uid);
    if (outcome.kind === "deleted") return "deleted";
    if (outcome.kind === "suspended") return "suspended";
    return "updated";
  }

  // مشترك محذوف أو موقوف من اللوحة → قفل فوري للتطبيق
  function lockForRemoved(): LicenseResult {
    ls.del(K.token);
    ls.set(K.lastFetch, String(Date.now()));
    return { ok: false, reason: "expired" };
  }

  // ─────────────────────────────────────────────
  // Device sessions — جهاز واحد نشط لكل حساب (قابل للزيادة من اللوحة)
  // ─────────────────────────────────────────────

  const HEARTBEAT_WRITE_MS = 10 * 60_000; // نكتب النبضة كل 10 دقائق فقط

  /** بصمة هذا الجهاز — تُولّد مرة واحدة وتبقى ثابتة */
  function getDeviceId(): string {
    let id = ls.get(K.device);
    if (!id) {
      id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? (crypto as Crypto).randomUUID()
        : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      ls.set(K.device, id);
    }
    return id;
  }

  interface SessionDoc {
    devices: SessionDevice[];
    max: number;
  }

  function encodeSessionDoc(data: SessionDoc): Record<string, unknown> {
    return {
      fields: {
        devices: {
          arrayValue: {
            values: data.devices.map((d) => ({
              mapValue: {
                fields: {
                  id: { stringValue: d.id },
                  seen: { integerValue: String(Math.round(d.seen)) },
                },
              },
            })),
          },
        },
        max: { integerValue: String(Math.max(1, Math.round(data.max) || SESSION_DEFAULT_MAX)) },
      },
    };
  }

  function decodeSessionDoc(doc: { fields?: Record<string, FirestoreValue> } | null): SessionDoc | null {
    if (!doc || !doc.fields) return null;
    const devicesRaw = doc.fields.devices?.arrayValue?.values || [];
    const devices: SessionDevice[] = [];
    for (const v of devicesRaw) {
      const f = v.mapValue?.fields;
      const id = f?.id?.stringValue;
      const seen = Number(f?.seen?.integerValue ?? f?.seen?.doubleValue ?? 0);
      if (typeof id === "string" && id && Number.isFinite(seen)) {
        devices.push({ id, seen });
      }
    }
    const max = Number(doc.fields.max?.integerValue ?? doc.fields.max?.doubleValue ?? SESSION_DEFAULT_MAX);
    return { devices, max: Math.max(1, Math.round(max) || SESSION_DEFAULT_MAX) };
  }

  /** قراءة مستند الجلسات sessions/{uid} */
  async function firestoreGetSession(idToken: string, uid: string): Promise<SessionDoc | null> {
    const url = `https://firestore.googleapis.com/v1/projects/${restCfg.projectId}/databases/(default)/documents/sessions/${uid}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new LicenseError("network", "تعذّر الوصول إلى بيانات الجلسة");
    const doc = await res.json() as { fields?: Record<string, FirestoreValue> };
    return decodeSessionDoc(doc);
  }

  /** كتابة مستند الجلسات (إنشاء عند أول مرة، تحديث بعدها) */
  async function firestoreWriteSession(idToken: string, uid: string, data: SessionDoc, exists: boolean): Promise<void> {
    const base = `https://firestore.googleapis.com/v1/projects/${restCfg.projectId}/databases/(default)/documents`;
    const headers = {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    };
    let res: Response;
    if (exists) {
      res = await fetch(
        `${base}/sessions/${uid}?updateMask.fieldPaths=devices&updateMask.fieldPaths=max`,
        { method: "PATCH", headers, body: JSON.stringify(encodeSessionDoc(data)) }
      );
    } else {
      res = await fetch(`${base}/sessions?documentId=${encodeURIComponent(uid)}`, {
        method: "POST",
        headers,
        body: JSON.stringify(encodeSessionDoc(data)),
      });
    }
    if (!res.ok) throw new LicenseError("network", "تعذّر حفظ بيانات الجلسة");
  }

  /**
   * فحص الجلسة وكتابة النبضة.
   * يُرجع 'blocked' إذا امتلأت الأجهزة النشطة بجهاز آخر، و'ok' خلاف ذلك.
   * عند فشل الشبكة يُرجع 'ok' (أوفلاين-أولاً: لا نعاقب على انقطاع الإنترنت).
   */
  async function checkSession(idToken: string, uid: string, forceHeartbeat: boolean): Promise<"ok" | "blocked"> {
    const deviceId = getDeviceId();
    const now = Date.now();
    let doc: SessionDoc | null;
    try {
      doc = await firestoreGetSession(idToken, uid);
    } catch {
      return "ok";
    }

    if (doc && isSessionBlocked(doc.devices, deviceId, doc.max, now)) {
      return "blocked";
    }

    const lastHb = ls.getNum(K.heartbeat);
    if (forceHeartbeat || now - lastHb > HEARTBEAT_WRITE_MS) {
      const merged = mergeHeartbeat(doc?.devices || [], deviceId, now);
      const max = doc?.max || SESSION_DEFAULT_MAX;
      try {
        await firestoreWriteSession(idToken, uid, { devices: merged, max }, !!doc);
        ls.set(K.heartbeat, String(now));
      } catch {
        // فشل الكتابة لا يمنع الدخول — سنحاول لاحقاً
      }
    }
    return "ok";
  }

  /**
   * sync() — مزامنة فورية مع السيرفر (تتجاوز بوابة الـ 5 دقائق).
   * - أونلاين: يجلب أحدث توكن من Firestore ثم يقيّم محلياً.
   * - أوفلاين/فشل شبكة: يرجع للفحص المحلي (يعمل بدون إنترنت).
   * - اشتراك محذوف من السيرفر: يمسح التوكن المحلي ويرجع expired فوراً.
   */
  async function sync(): Promise<LicenseResult> {
    const now = Date.now();

    // حماية إرجاع الساعة (نفس start/check)
    const lastSeen = ls.getNum(K.lastSeen);
    if (lastSeen > 0 && now < lastSeen - 60_000) {
      return { ok: false, reason: "clock" };
    }
    ls.set(K.lastSeen, String(now));

    const uid = ls.get(K.uid);
    if (!uid || !ls.get(K.token)) {
      return { ok: false, reason: "login" };
    }

    if (navigator.onLine) {
      try {
        const res = await trySilentRefresh(uid);
        if (res === "deleted" || res === "suspended") {
          // الاشتراك حُذف أو عُلّق من لوحة التحكم → قفل فوري
          return lockForRemoved();
        }
        if (res === "session-blocked") {
          // الحساب يعمل على جهاز آخر → قفل بدون مسح التوكن (يعود عند فك الارتباط)
          return { ok: false, reason: "session" };
        }
      } catch {
        // فشل شبكة/جلسة → نكمل بالتوكن المحلي (أوفلاين-أولاً)
      }
    }

    return check();
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /**
   * start() — نقطة الدخول الرئيسية عند إقلاع التطبيق.
   *
   * الخطوات:
   * 1. فحص ساعة الجهاز.
   * 2. تجديد التوكن من Firestore (صامت) إذا مرّت 5 دقائق.
   * 3. التحقق من توقيع التوكن المحلي.
   * 4. تقييم الحالة وإرجاع النتيجة.
   *
   * ملاحظة: للتحقق الفوري بعد تعديل من اللوحة استخدم sync() — فهو
   * يتجاوز بوابة الـ 5 دقائق ويجلب الأحدث دائماً.
   */
  async function start(): Promise<LicenseResult> {
    const now = Date.now();

    // ❶ حماية إرجاع الساعة
    const lastSeen = ls.getNum(K.lastSeen);
    if (lastSeen > 0 && now < lastSeen - 60_000) {
      return { ok: false, reason: "clock" };
    }
    ls.set(K.lastSeen, String(now));

    const token = ls.get(K.token);
    const uid = ls.get(K.uid);

    // ❷ لا بيانات محلية → يحتاج login
    if (!token || !uid) {
      return { ok: false, reason: "login" };
    }

    // ❸ تجديد صامت عبر refreshToken إذا مرّت المهلة (أي تخفيض/تمديد
    // من اللوحة يصل خلال دقائق بدل 24 ساعة كما كان سابقاً)
    const lastFetch = ls.getNum(K.lastFetch);
    if (now - lastFetch > REFRESH_INTERVAL && navigator.onLine) {
      try {
        const res = await trySilentRefresh(uid);
        if (res === "deleted" || res === "suspended") {
          return lockForRemoved();
        }
        if (res === "session-blocked") {
          return { ok: false, reason: "session" };
        }
      } catch {
        // فشل شبكة → نكمل بالتوكن المحلي
      }
    }

    // ❹ قراءة أحدث توكن (قد يكون تجدد)
    const currentToken = ls.get(K.token) ?? token;

    // ❺ تحقق من التوقيع
    const pubKey = await getPubKey();
    const payload = await verifyToken(currentToken, pubKey);
    if (!payload) return { ok: false, reason: "invalid" };
    if (payload.a !== appId) return { ok: false, reason: "invalid" };

    return evalPayload(payload);
  }

  /**
   * login(username, password) — تسجيل الدخول (يتطلب إنترنت).
   * استدعها عند submit نموذج الدخول.
   */
  async function login(username: string, password: string): Promise<LicenseResult> {
    const cleanUser = username.trim().toLowerCase();
    const email = cleanUser.includes("@") ? cleanUser : `${cleanUser}@lic.local`;

    const { idToken, localId, refreshToken } = await firebaseSignIn(restCfg, email, password);

    // فحص الأجهزة قبل تخزين الجلسة — جهاز آخر نشط يمنع هذا الدخول
    // (الأولوية لصاحب الجلسة النشطة؛ الجديد يُرفض حتى يفك المدير الارتباط)
    const session = await checkSession(idToken, localId, true);
    if (session === "blocked") {
      return { ok: false, reason: "session" };
    }

    ls.set(K.uid, localId);
    ls.set(K.idToken, refreshToken); // نخزن refreshToken للتجديد الصامت لاحقاً

    const outcome = await fetchToken(idToken, localId);
    if (outcome.kind === "deleted") {
      // مستخدم موجود لكن لا اشتراك لهذا التطبيق
      return { ok: false, reason: "login" };
    }
    if (outcome.kind === "suspended") {
      // موقوف من اللوحة — مُنع من الدخول أصلاً
      return { ok: false, reason: "expired" };
    }
    const token = outcome.token;

    const pubKey = await getPubKey();
    const payload = await verifyToken(token, pubKey);
    if (!payload) {
      console.warn("[License Login] فشل التحقق من توقيع التوكن (التوقيع غير متطابق مع المفتاح العام)");
      return { ok: false, reason: "invalid" };
    }
    if (payload.a !== appId) {
      console.warn("[License Login] معرّف التطبيق غير متطابق! في التوكن:", payload.a, "وفي التطبيق:", appId);
      return { ok: false, reason: "invalid" };
    }

    ls.set(K.lastSeen, String(Date.now()));
    return evalPayload(payload);
  }

  /**
   * recheck(username, password) — إعادة التحقق بعد تجديد الاشتراك.
   * استدعها عند ضغط "تحقق من الاشتراك".
   */
  async function recheck(username: string, password: string): Promise<LicenseResult> {
    return login(username, password);
  }

  /**
   * check() — فحص سريع محلي (بدون إنترنت).
   * مفيد للفحص الدوري أثناء التشغيل.
   */
  async function check(): Promise<LicenseResult> {
    const now = Date.now();
    const lastSeen = ls.getNum(K.lastSeen);
    if (lastSeen > 0 && now < lastSeen - 60_000) return { ok: false, reason: "clock" };
    ls.set(K.lastSeen, String(now));

    const token = ls.get(K.token);
    if (!token) return { ok: false, reason: "login" };

    const pubKey = await getPubKey();
    const payload = await verifyToken(token, pubKey);
    if (!payload || payload.a !== appId) return { ok: false, reason: "invalid" };

    return evalPayload(payload);
  }

  /**
   * getDetails() — تفاصيل الاشتراك من التوكن المحلي (بعد التحقق من التوقيع).
   * تُستخدم لمقارنة تاريخ الانتهاء قبل/بعد المزامنة واكتشاف التجديد.
   */
  async function getDetails(): Promise<LocalSubscriptionDetails | null> {
    const token = ls.get(K.token);
    if (!token) return null;
    const pubKey = await getPubKey();
    const payload = await verifyToken(token, pubKey);
    if (!payload || payload.a !== appId) return null;
    return { uid: payload.u, expiryMs: payload.exp, graceDays: payload.g, issuedAt: payload.iat };
  }

  /**
   * logout() — تسجيل خروج ومسح البيانات المحلية.
   * + تحرير بصمة الجهاز من السيرفر (best-effort) حتى ينتقل للجهاز الجديد فوراً
   * بدل انتظار 15 دقيقة لانتهاء النبضة — الفشل هنا لا يمنع الخروج المحلي أبداً.
   */
  function logout(): void {
    const refreshToken = ls.get(K.idToken);
    const uid = ls.get(K.uid);
    const deviceId = ls.get(K.device);
    clearLocal();

    if (refreshToken && uid && deviceId && typeof navigator !== "undefined" && navigator.onLine) {
      void (async () => {
        try {
          const result = await firebaseRefresh(restCfg.apiKey, refreshToken);
          if (!result) return;
          const idToken = result.id_token;
          const doc = await firestoreGetSession(idToken, uid);
          if (!doc) return;
          const remaining = doc.devices.filter((d) => d.id !== deviceId);
          if (remaining.length === doc.devices.length) return;
          await firestoreWriteSession(idToken, uid, { devices: remaining, max: doc.max }, true);
        } catch {
          // تجاهل — النبضة القديمة ستنتهي تلقائياً خلال 15 دقيقة
        }
      })();
    }
  }

  /**
   * renewLink() — رابط واتساب لطلب التجديد من المدير.
   */
  function renewLink(): string {
    const uid = ls.get(K.uid) || "؟";
    const msg = `مرحباً، اشتراكي في ${appName} انتهى.\nمعرّفي: ${uid}\nأرجو تجديد الاشتراك.`;
    return `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
  }

  /**
   * isLoggedIn() — هل يوجد جلسة محلية؟ (لا يتحقق من التوقيع)
   */
  function isLoggedIn(): boolean {
    return !!ls.get(K.token) && !!ls.get(K.uid);
  }

  /**
   * getUid() — الحصول على معرّف المستخدم المحلي.
   */
  function getUid(): string | null {
    return ls.get(K.uid);
  }

  return {
    /** تشغيل عند الإقلاع — النقطة الرئيسية */
    start,
    /** مزامنة فورية مع السيرفر (تتجاوز مهلة التحديث) — استخدمها بعد أي تعديل من اللوحة */
    sync,
    /** تفاصيل الاشتراك المحلي (توكن مُتحقق منه) */
    getDetails,
    /** تسجيل دخول (يحتاج إنترنت) */
    login,
    /** إعادة فحص بعد تجديد الاشتراك */
    recheck,
    /** فحص محلي سريع */
    check,
    /** تسجيل خروج */
    logout,
    /** رابط واتساب لطلب التجديد */
    renewLink,
    /** هل المستخدم مسجل دخوله؟ */
    isLoggedIn,
    /** UID المستخدم الحالي */
    getUid,
    /** بصمة هذا الجهاز (للعرض عند التعارض) */
    getDeviceId,
    /** اسم التطبيق */
    appName,
    /** رقم واتساب الدعم */
    whatsapp,
  };
}

/** نوع الكائن المُرجَع من createLicense */
export type LicenseClient = ReturnType<typeof createLicense>;
