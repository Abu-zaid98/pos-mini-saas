import { createLicense, type LicenseResult, type LicenseFailReason, type TokenPayload, type LocalSubscriptionDetails, type LicenseConfig } from "./license-client";

// المفتاح العام ECDSA P-256 بصيغة JWK
// انسخه من تبويب "المفاتيح" -> بطاقة "المفتاح العام (JWK)" -> اضغط "نسخ"
const HARDCODED_PUBLIC_KEY: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "vt6E5qDQevaC7sT67PAix4of6aST3b-8DcrGgjHimbY",
  y: "Ou2yfITHwwrPIGHFMyXiDdpxNC987XYyd2ZM4e5zNog",
};

/**
 * تنظيف قيمة المفتاح العام قبل التحليل — يتسامح مع أخطاء اللصق الشائعة:
 * - علامات تنصيص مفردة حول القيمة (كما في ملف .env)
 * - أحرف اتجاه خفية (U+200E/U+200F) تتسرب عند النسخ من صفحات عربية RTL
 * - نصوص زائدة حول الـ JSON (يُستخرج ما بين أول { وآخر })
 */
export function cleanJwkEnv(raw: string): string {
  let s = raw
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00A0]/g, "")
    .trim();
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    s = s.slice(1, -1).trim();
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    s = s.slice(start, end + 1);
  }
  return s;
}

function getPublicKey(): JsonWebKey {
  const envKey = import.meta.env.VITE_LIC_PUBLIC_KEY;
  if (envKey) {
    try {
      const text = typeof envKey === "string" ? cleanJwkEnv(envKey) : envKey;
      const parsed = typeof text === "string" ? JSON.parse(text) : text;
      if (parsed && parsed.x && parsed.y) return parsed;
    } catch {
      console.warn("[License] فشل تحليل VITE_LIC_PUBLIC_KEY من ملف البيئة.");
    }
  }
  return HARDCODED_PUBLIC_KEY;
}

export function isPublicKeyConfigured(): boolean {
  const pk = getPublicKey();
  return Boolean(pk.kty === "EC" && pk.crv === "P-256" && pk.x && pk.y);
}

export const licenseConfig: LicenseConfig = {
  firebaseConfig: {
    apiKey: import.meta.env.VITE_FB_API_KEY || "AIzaSyB4RMwer7fmPM4dzfBj0CHkkayc5ExcaJk",
    authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN || "my-system-admin.firebaseapp.com",
    projectId: import.meta.env.VITE_FB_PROJECT_ID || "my-system-admin",
    appId: import.meta.env.VITE_FB_APP_ID || "1:374790599531:web:0b22b9db833219122b122e",
  },
  appId: import.meta.env.VITE_LIC_APP_ID || "1374790599531web0b22b9db833219122b122e",
  appName: import.meta.env.VITE_LIC_APP_NAME || "نظام نقاط البيع والمبيعات (POS)",
  whatsapp: import.meta.env.VITE_LIC_WHATSAPP || "972592133357",
  publicKey: getPublicKey(),
};

export const lic = createLicense(licenseConfig);

export type { LicenseResult, LicenseFailReason, TokenPayload, LocalSubscriptionDetails };
