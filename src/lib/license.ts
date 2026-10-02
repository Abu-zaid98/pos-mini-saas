import { createLicense, type LicenseResult, type LicenseFailReason, type TokenPayload, type LocalSubscriptionDetails, type LicenseConfig } from "./license-client";

// المفتاح العام ECDSA P-256 بصيغة JWK
// انسخه من تبويب "المفاتيح" -> بطاقة "المفتاح العام (JWK)" -> اضغط "نسخ"
const HARDCODED_PUBLIC_KEY: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "vt6E5qDQevaC7sT67PAix4of6aST3b-8DcrGgjHimbY",
  y: "Ou2yfITHwwrPIGHFMyXiDdpxNC987XYyd2ZM4e5zNog",
};

function getPublicKey(): JsonWebKey {
  const envKey = import.meta.env.VITE_LIC_PUBLIC_KEY;
  if (envKey) {
    try {
      const parsed = typeof envKey === "string" ? JSON.parse(envKey) : envKey;
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
