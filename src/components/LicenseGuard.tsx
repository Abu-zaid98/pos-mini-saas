import React, { useState, useEffect, useCallback, useRef } from "react";
import { lic, isPublicKeyConfigured, type LicenseResult, type LocalSubscriptionDetails } from "../lib/license";
import { PWAInstallBanner } from "./pwa/PWAInstallBanner";
import { PWAInstallSheet } from "./pwa/PWAInstallSheet";

interface LicenseGuardProps {
  children: React.ReactNode;
}

interface RenewalInfo {
  addedDays: number;
  addedHours: number;
  newExpiryMs: number;
  daysLeft: number;
}

export function LicenseGuard({ children }: LicenseGuardProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<LicenseResult | null>(null);

  // تجديد الاشتراك — popup فخم + toast للتعديلات الأخرى
  const [renewal, setRenewal] = useState<RenewalInfo | null>(null);
  const [updateToast, setUpdateToast] = useState<string | null>(null);
  const prevDetailsRef = useRef<LocalSubscriptionDetails | null>(null);

  // يقارن التوكن قبل/بعد المزامنة ويكشف التجديد أو أي تعديل على المدة
  const detectChange = useCallback(async (before: LocalSubscriptionDetails | null) => {
    try {
      const after = await lic.getDetails().catch(() => null);
      if (after && before && after.uid === before.uid && after.expiryMs !== before.expiryMs) {
        const diff = after.expiryMs - before.expiryMs;
        if (diff > 0) {
          const addedDays = Math.floor(diff / 86_400_000);
          const addedHours = Math.round((diff % 86_400_000) / 3_600_000);
          const daysLeft = Math.max(0, Math.ceil((after.expiryMs - Date.now()) / 86_400_000));
          setRenewal({ addedDays, addedHours, newExpiryMs: after.expiryMs, daysLeft });
          setUpdateToast(null);
        } else {
          setUpdateToast(
            `تم تحديث بيانات اشتراكك — تاريخ الانتهاء الجديد: ${new Date(after.expiryMs).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" })}`
          );
        }
      }
      prevDetailsRef.current = after;
    } catch {
      // تجاهل — لا نكسر التطبيق بسبب الإشعار
    }
  }, []);

  // Login form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Dismiss banner during session
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // تنبيه قرب الانتهاء — يُخفى لهذه الجلسة فقط ويعود عند فتح التطبيق
  const [earlyDismissed, setEarlyDismissed] = useState(false);

  // Manual recheck state
  const [recheckLoading, setRecheckLoading] = useState(false);

  // PWA full guide fallback (when native install unavailable)
  const [pwaGuideOpen, setPwaGuideOpen] = useState(false);

  // Check license — مزامنة فورية مع السيرفر ثم تقييم محلي
  const evaluateLicense = useCallback(async () => {
    try {
      // نلتقط التوكن المحلي القديم أولاً حتى نكشف التجديد حتى لو حدث والتطبيق مغلق
      const before = await lic.getDetails().catch(() => null);
      const res = await lic.sync();
      setResult(res);
      await detectChange(before);
    } catch (err: unknown) {
      console.error("[LicenseGuard] Error verifying license:", err);
      // Fallback to check if token exists locally
      const localRes = await lic.check().catch(() => null);
      if (localRes) {
        setResult(localRes);
      } else {
        setResult({ ok: false, reason: "login" });
      }
    } finally {
      setLoading(false);
    }
  }, [detectChange]);

  useEffect(() => {
    let mounted = true;
    evaluateLicense();

    // أي تعديل من لوحة التحكم (تخفيض/تمديد/حذف) يصل خلال دقائق:
    // إعادة المزامنة عند عودة الإنترنت، وعند رجوع المستخدم للتطبيق، ودورياً كل 5 دقائق
    const resync = () => {
      if (!mounted) return;
      const before = prevDetailsRef.current;
      lic.sync().then((res) => {
        if (!mounted) return;
        setResult(res);
        detectChange(before);
      }).catch(() => null);
    };

    const handleOnline = () => resync();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") resync();
    };

    const interval = setInterval(resync, 5 * 60_000);

    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [evaluateLicense, detectChange]);

  // إخفاء toast التحديث تلقائياً
  useEffect(() => {
    if (!updateToast) return;
    const t = setTimeout(() => setUpdateToast(null), 8000);
    return () => clearTimeout(t);
  }, [updateToast]);

  // Handle subscriber login / activation
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    // حساب جديد → لا نقارن مع توكن الحساب السابق
    prevDetailsRef.current = null;

    try {
      const res = await lic.login(username, password);
      setResult(res);
      prevDetailsRef.current = await lic.getDetails().catch(() => null);
      if (!res.ok) {
        if (res.reason === "expired") {
          setLoginError("عذراً، هذا الاشتراك منتهي الصلاحية. يرجى تجديد الاشتراك مع الإدارة.");
        } else if (res.reason === "session") {
          setLoginError("هذا الحساب مستخدم حالياً على جهاز آخر. اطلب من الإدارة فك ارتباط الجهاز القديم ثم حاول مجدداً.");
        } else if (res.reason === "invalid") {
          setLoginError("الترخيص غير صالح أو غير مخصص لهذا التطبيق.");
        } else if (res.reason === "clock") {
          setLoginError("تنبيه: ساعة الجهاز غير صحيحة، يرجى ضبط توقيت الجهاز تلقائياً.");
        } else {
          setLoginError("اسم المستخدم أو كلمة المرور غير صحيحة، أو لا يوجد اشتراك مفعّل لهذا التطبيق.");
        }
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      setLoginError(
        error.message ||
        "تعذر الاتصال بالخادم. يرجى التأكد من توفر اتصال بالإنترنت لإتمام التفعيل للمرة الأولى."
      );
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle recheck — مزامنة فورية متجاوزة للكاش (بعد تعديل من اللوحة)
  const handleRecheck = async () => {
    setRecheckLoading(true);
    setLoginError("");
    try {
      const before = prevDetailsRef.current ?? await lic.getDetails().catch(() => null);
      const res = await lic.sync();
      setResult(res);
      await detectChange(before);
    } catch {
      // ignore
    } finally {
      setRecheckLoading(false);
    }
  };

  // Switch account / logout license
  const handleSwitchAccount = () => {
    lic.logout();
    prevDetailsRef.current = null;
    setRenewal(null);
    setUpdateToast(null);
    setResult({ ok: false, reason: "login" });
    setUsername("");
    setPassword("");
    setLoginError("");
  };

  // ❶ Loading Screen
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100dvh",
          background: "var(--color-bg-base, #0b1120)",
          color: "var(--color-text-primary, #f9fafb)",
          fontFamily: "var(--font-main, system-ui, -apple-system, sans-serif)",
          direction: "rtl",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            borderRadius: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            boxShadow: "0 10px 30px rgba(59, 130, 246, 0.4)",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        >
          🏪
        </div>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>نظام نقاط البيع (POS)</h2>
          <p style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: 13, marginTop: 6, margin: 0 }}>
            جارٍ التحقق من ترخيص التطبيق أوفلاين...
          </p>
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.06); opacity: 0.85; }
          }
        `}</style>
      </div>
    );
  }

  // ❷ Public Key Notice (if not yet configured by admin)
  const isKeyMissing = !isPublicKeyConfigured();

  // ❸ Valid License (Active or Grace Period)
  if (result && result.ok) {
    // تنبيه مبكر: 7 أيام أو أقل قبل الانتهاء (قبل دخول فترة السماح)
    const showEarlyWarning =
      !result.grace && !earlyDismissed && result.daysLeft <= 7 && result.daysLeft >= 0;
    return (
      <>
        {/* Early Warning Banner — قبل الانتهاء بأسبوع */}
        {showEarlyWarning && (
          <div
            style={{
              background: "linear-gradient(90deg, #b45309, #d97706, #b45309)",
              color: "#ffffff",
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 2px 8px rgba(217, 119, 6, 0.35)",
              direction: "rtl",
              position: "relative",
              zIndex: 9999,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>⏳</span>
              <span>
                اشتراكك ينتهي خلال{" "}
                <span style={{ textDecoration: "underline", fontWeight: 900 }}>
                  {result.daysLeft === 0 ? "اليوم الأخير" : `${result.daysLeft} ${result.daysLeft === 1 ? "يوم" : "أيام"}`}
                </span>{" "}
                — جدد الآن لتجنب التوقف المفاجئ.
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: "auto" }}>
              <a
                href={lic.renewLink()}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "#ffffff",
                  color: "#92400e",
                  padding: "5px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 800,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}
              >
                <span>💬</span>
                <span>تجديد الاشتراك</span>
              </a>

              <button
                type="button"
                onClick={() => setEarlyDismissed(true)}
                title="إخفاء التنبيه مؤقتاً"
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "none",
                  color: "#ffffff",
                  borderRadius: 6,
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Warning Banner during Grace Period */}
        {result.grace && !bannerDismissed && (
          <div
            style={{
              background: "linear-gradient(90deg, #d97706, #b45309)",
              color: "#ffffff",
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 2px 8px rgba(217, 119, 6, 0.35)",
              direction: "rtl",
              position: "relative",
              zIndex: 9999,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span>
                أنت تعمل حالياً في <strong>فترة السماح</strong> المؤقتة (متبقي{" "}
                <span style={{ textDecoration: "underline", fontWeight: 900 }}>
                  {result.graceDaysLeft} يوم
                </span>{" "}
                قبل توقف التطبيق). يرجى التجديد لتجنب التوقف.
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: "auto" }}>
              <a
                href={lic.renewLink()}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "#ffffff",
                  color: "#92400e",
                  padding: "5px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 800,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}
              >
                <span>💬</span>
                <span>تجديد الاشتراك</span>
              </a>

              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                title="إخفاء التنبيه مؤقتاً"
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "none",
                  color: "#ffffff",
                  borderRadius: 6,
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {children}

        {/* 🎉 Renewal celebration popup + update toast */}
        {renewal && <RenewalPopup info={renewal} onClose={() => setRenewal(null)} />}
        {updateToast && (
          <UpdateToast text={updateToast} onClose={() => setUpdateToast(null)} />
        )}
      </>
    );
  }

  // ❹ Expired Subscription Screen
  if (result && !result.ok && result.reason === "expired") {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100dvh",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg-base, #0b1120)",
          color: "var(--color-text-primary, #f9fafb)",
          fontFamily: "var(--font-main, system-ui, -apple-system, sans-serif)",
          direction: "rtl",
          padding: 20,
        }}
      >
        <div
          style={{
            background: "var(--color-bg-card, #111827)",
            border: "1px solid var(--color-border, #1f2937)",
            borderRadius: 24,
            padding: "36px 28px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
            width: "100%",
            maxWidth: 440,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              background: "rgba(239, 68, 68, 0.15)",
              border: "1.5px solid rgba(239, 68, 68, 0.35)",
              borderRadius: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              margin: "0 auto 16px",
              boxShadow: "0 8px 24px rgba(239, 68, 68, 0.2)",
            }}
          >
            🔒
          </div>

          <span
            style={{
              display: "inline-block",
              background: "rgba(239, 68, 68, 0.15)",
              color: "#f87171",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 20,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 10,
            }}
          >
            انتهت صلاحية الاشتراك
          </span>

          <h1 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 10px 0" }}>
            عذراً، انتهت صلاحية اشتراكك
          </h1>

          <p
            style={{
              color: "var(--color-text-muted, #94a3b8)",
              fontSize: 13.5,
              lineHeight: 1.7,
              marginBottom: 24,
            }}
          >
            انتهت فترة الاشتراك وفترة السماح المحددة لهذا التطبيق. لتجديد الاشتراك والاستمرار بالعمل بدون انقطاع، تواصل مع الإدارة عبر واتساب.
          </p>

          {lic.getUid() && (
            <div
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid var(--color-border, #1f2937)",
                borderRadius: 12,
                padding: "10px 14px",
                marginBottom: 20,
                fontSize: 12,
                color: "var(--color-text-muted, #94a3b8)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>معرّف المشترك:</span>
              <span style={{ fontFamily: "monospace", color: "var(--color-primary-light, #60a5fa)", fontWeight: 700 }}>
                {lic.getUid()}
              </span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <a
              href={lic.renewLink()}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "13px 20px",
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "#ffffff",
                borderRadius: 14,
                fontWeight: 800,
                fontSize: 14,
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(34, 197, 94, 0.35)",
              }}
            >
              <span style={{ fontSize: 18 }}>💬</span>
              <span>تجديد الاشتراك عبر واتساب</span>
            </a>

            <button
              type="button"
              onClick={handleRecheck}
              disabled={recheckLoading}
              style={{
                padding: "12px",
                borderRadius: 14,
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid var(--color-border, #1f2937)",
                color: "var(--color-text-primary, #f9fafb)",
                fontSize: 13,
                fontWeight: 700,
                cursor: recheckLoading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <span>🔄</span>
              <span>{recheckLoading ? "جارٍ التحقق..." : "تم التجديد؟ اضغط لإعادة الفحص"}</span>
            </button>

            <button
              type="button"
              onClick={handleSwitchAccount}
              style={{
                padding: "8px",
                background: "none",
                border: "none",
                color: "var(--color-text-muted, #94a3b8)",
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              تسجيل الدخول بحساب أو ترخيص آخر
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ❺ Clock Rollback Warning Screen
  if (result && !result.ok && result.reason === "clock") {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100dvh",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg-base, #0b1120)",
          color: "var(--color-text-primary, #f9fafb)",
          fontFamily: "var(--font-main, system-ui, -apple-system, sans-serif)",
          direction: "rtl",
          padding: 20,
        }}
      >
        <div
          style={{
            background: "var(--color-bg-card, #111827)",
            border: "1px solid var(--color-border, #1f2937)",
            borderRadius: 24,
            padding: "36px 28px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
            width: "100%",
            maxWidth: 440,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              background: "rgba(245, 158, 11, 0.15)",
              border: "1.5px solid rgba(245, 158, 11, 0.35)",
              borderRadius: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              margin: "0 auto 16px",
            }}
          >
            ⏰
          </div>

          <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 10px 0" }}>
            تنبيه: تم اكتشاف خطأ في ساعة الجهاز
          </h1>

          <p
            style={{
              color: "var(--color-text-muted, #94a3b8)",
              fontSize: 13.5,
              lineHeight: 1.7,
              marginBottom: 24,
            }}
          >
            تاريخ أو وقت هذا الجهاز يسبق آخر وقت تم تشغيل النظام فيه. لأسباب أمنية وحماية دقة التراخيص، يرجى ضبط ساعة الجهاز على الوقت التلقائي الصحيح.
          </p>

          <button
            type="button"
            onClick={handleRecheck}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: 14,
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 800,
              border: "none",
              cursor: "pointer",
            }}
          >
            🔄 إعادة الفحص بعد ضبط الوقت
          </button>
        </div>
      </div>
    );
  }

  // ❺ⓑ Session Conflict Screen — الحساب يعمل على جهاز آخر
  if (result && !result.ok && result.reason === "session") {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100dvh",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg-base, #0b1120)",
          color: "var(--color-text-primary, #f9fafb)",
          fontFamily: "var(--font-main, system-ui, -apple-system, sans-serif)",
          direction: "rtl",
          padding: 20,
        }}
      >
        <div
          style={{
            background: "var(--color-bg-card, #111827)",
            border: "1px solid var(--color-border, #1f2937)",
            borderRadius: 24,
            padding: "36px 28px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
            width: "100%",
            maxWidth: 440,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              background: "rgba(139, 92, 246, 0.15)",
              border: "1.5px solid rgba(139, 92, 246, 0.35)",
              borderRadius: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              margin: "0 auto 16px",
            }}
          >
            📱
          </div>

          <h1 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 10px 0" }}>
            هذا الحساب مستخدم على جهاز آخر
          </h1>

          <p
            style={{
              color: "var(--color-text-muted, #94a3b8)",
              fontSize: 13.5,
              lineHeight: 1.7,
              marginBottom: 8,
            }}
          >
            اشتراكك يسمح بجهاز واحد نشط في نفس الوقت. إذا غيّرت جهازك، اطلب من
            الإدارة فك ارتباط الجهاز القديم ثم أعد الفحص.
          </p>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--color-border, #1f2937)",
              borderRadius: 12,
              padding: "10px 14px",
              marginBottom: 20,
              fontSize: 12,
              color: "var(--color-text-muted, #94a3b8)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>معرّف هذا الجهاز:</span>
            <span style={{ fontFamily: "monospace", color: "var(--color-primary-light, #60a5fa)", fontWeight: 700 }}>
              {lic.getDeviceId().slice(0, 8).toUpperCase()}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              onClick={handleRecheck}
              disabled={recheckLoading}
              style={{
                padding: "13px",
                borderRadius: 14,
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 800,
                border: "none",
                cursor: recheckLoading ? "not-allowed" : "pointer",
              }}
            >
              <span>{recheckLoading ? "جارٍ التحقق..." : "🔄 إعادة الفحص"}</span>
            </button>

            <button
              type="button"
              onClick={handleSwitchAccount}
              style={{
                padding: "8px",
                background: "none",
                border: "none",
                color: "var(--color-text-muted, #94a3b8)",
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              تسجيل الدخول بحساب آخر
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ❻ Activation / Login Screen (First time or Invalid local token)
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100dvh",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg-base, #0b1120)",
        color: "var(--color-text-primary, #f9fafb)",
        fontFamily: "var(--font-main, system-ui, -apple-system, sans-serif)",
        direction: "rtl",
        padding: "20px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow accent */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          background: "radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)",
          borderRadius: "50%",
          top: "-150px",
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          background: "var(--color-bg-card, #111827)",
          border: "1px solid var(--color-border, #1f2937)",
          borderRadius: 26,
          padding: "42px 34px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.45)",
          width: "100%",
          maxWidth: 460,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Brand header */}
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div
            style={{
              width: 78,
              height: 78,
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              borderRadius: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              margin: "0 auto 14px",
              boxShadow: "0 10px 28px rgba(59, 130, 246, 0.4)",
            }}
          >
            🏪
          </div>

          <h1 style={{ fontSize: 23, fontWeight: 900, margin: "0 0 8px 0", color: "var(--color-text-primary, #f9fafb)" }}>
            تفعيل ترخيص النظام
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-text-muted, #94a3b8)", margin: 0, lineHeight: 1.7 }}>
            أدخل بيانات المشترك الخاصة بك للتفعيل. يتطلب التفعيل اتصالاً بالإنترنت لمرة واحدة فقط، وبعدها يعمل النظام بدون إنترنت بالكامل.
          </p>
        </div>

        {/* Developer configuration notice if JWK not set */}
        {isKeyMissing && (
          <div
            style={{
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              color: "#fbbf24",
              borderRadius: 12,
              padding: "10px 12px",
              fontSize: 12,
              marginBottom: 16,
              lineHeight: 1.6,
            }}
          >
            ⚠️ <strong>ملاحظة للمطور:</strong> يرجى التأكد من لصق المفتاح العام <code>(JWK)</code> المنسوخ من لوحة التحكم في <code>src/lib/license.ts</code> أو في ملف <code>.env</code> (VITE_LIC_PUBLIC_KEY).
          </div>
        )}

        {/* Error message */}
        {loginError && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              color: "#f87171",
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: 13,
              marginBottom: 16,
              lineHeight: 1.6,
            }}
          >
            ⚠️ {loginError}
          </div>
        )}

        {/* Activation Form */}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--color-text-secondary, #cbd5e1)",
                marginBottom: 7,
              }}
            >
              اسم المستخدم (المشترك):
            </label>
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="مثال: ahmed"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 14,
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--color-border, #374151)",
                color: "var(--color-text-primary, #ffffff)",
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "var(--font-main)",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--color-text-secondary, #cbd5e1)",
                marginBottom: 7,
              }}
            >
              كلمة المرور:
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 14,
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--color-border, #374151)",
                color: "var(--color-text-primary, #ffffff)",
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "var(--font-main)",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loginLoading}
            style={{
              width: "100%",
              padding: "15px",
              borderRadius: 14,
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "#ffffff",
              fontSize: 15,
              fontWeight: 800,
              border: "none",
              cursor: loginLoading ? "not-allowed" : "pointer",
              boxShadow: "0 6px 20px rgba(59, 130, 246, 0.4)",
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontFamily: "var(--font-main)",
            }}
          >
            {loginLoading ? (
              <span>جارٍ التحقق والتفعيل...</span>
            ) : (
              <>
                <span>تفعيل والدخول للنظام</span>
                <span>➔</span>
              </>
            )}
          </button>
        </form>

        {/* WhatsApp & Developer Support */}
        <div
          style={{
            marginTop: 22,
            paddingTop: 16,
            borderTop: "1px solid var(--color-border, #1f2937)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
          }}
        >
          <span style={{ color: "var(--color-text-muted, #94a3b8)" }}>
            ليس لديك اشتراك أو كلمة مرور؟
          </span>
          <a
            href={lic.renewLink()}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "#4ade80",
              fontWeight: 800,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>💬</span>
            <span>تواصل عبر واتساب</span>
          </a>
        </div>
      </div>

      {/* PWA install banner on the activation screen + full guide fallback */}
      <PWAInstallBanner
        storageKey="pos_pwa_prompt"
        bottom="calc(16px + env(safe-area-inset-bottom, 0px))"
        onNeedGuide={() => setPwaGuideOpen(true)}
      />
      <PWAInstallSheet
        open={pwaGuideOpen}
        onClose={() => setPwaGuideOpen(false)}
        storageKey="pos_pwa_prompt"
        appName={lic.appName}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 🎉 RenewalPopup — نافذة التجديد الفخمة (تظهر عند تمديد الاشتراك)
// ─────────────────────────────────────────────────────────────

function RenewalPopup({ info, onClose }: { info: RenewalInfo; onClose: () => void }) {
  const addedLabel =
    info.addedDays > 0 && info.addedHours > 0
      ? `${info.addedDays} يوم و ${info.addedHours} ساعة`
      : info.addedDays > 0
        ? `${info.addedDays} ${info.addedDays === 1 ? "يوم" : "أيام"}`
        : `${info.addedHours} ساعة`;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        direction: "rtl",
        fontFamily: "var(--font-main, system-ui, sans-serif)",
        animation: "lic-fade-in 0.25s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 400,
          borderRadius: 28,
          overflow: "hidden",
          background: "var(--color-bg-card, #111827)",
          border: "1px solid rgba(255, 215, 130, 0.35)",
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.55), 0 0 60px rgba(34, 197, 94, 0.18)",
          animation: "lic-pop-in 0.35s cubic-bezier(0.34, 1.4, 0.64, 1)",
        }}
      >
        {/* Header الذهبي-الأخضر */}
        <div
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #10b981 55%, #d4af37 130%)",
            padding: "28px 24px 22px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 220,
              height: 220,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,255,255,0.25) 0%, transparent 70%)",
              top: -80,
              left: "50%",
              transform: "translateX(-50%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.95)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 900,
              color: "#059669",
              margin: "0 auto 12px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
              animation: "lic-check-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both",
            }}
          >
            ✓
          </div>
          <h2 style={{ color: "#fff", fontSize: 21, fontWeight: 900, margin: "0 0 4px" }}>
            تم تجديد اشتراكك بنجاح 🎉
          </h2>
          <p style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, margin: 0, fontWeight: 600 }}>
            أهلاً بعودتك — نتمنى لك مبيعات موفقة
          </p>
        </div>

        {/* التفاصيل */}
        <div style={{ padding: "20px 22px 22px" }}>
          <div
            style={{
              background: "linear-gradient(135deg, rgba(16,185,129,0.14), rgba(212,175,55,0.10))",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: 16,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--color-text-muted, #94a3b8)", fontWeight: 700 }}>
                ⏱ المدة المضافة
              </span>
              <span style={{ fontSize: 15, fontWeight: 900, color: "#34d399" }}>+ {addedLabel}</span>
            </div>
            <div style={{ height: 1, background: "var(--color-border, #1f2937)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--color-text-muted, #94a3b8)", fontWeight: 700 }}>
                📅 الانتهاء الجديد
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text-primary, #f9fafb)" }}>
                {new Date(info.newExpiryMs).toLocaleDateString("ar", { dateStyle: "medium" })}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--color-text-muted, #94a3b8)", fontWeight: 700 }}>
                📊 المتبقي الآن
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text-primary, #f9fafb)" }}>
                {info.daysLeft} يوم
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%",
              marginTop: 16,
              padding: "13px",
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 6px 20px rgba(16, 185, 129, 0.4)",
              fontFamily: "inherit",
            }}
          >
            ممتاز، شكراً ✨
          </button>
        </div>
      </div>

      <style>{`
        @keyframes lic-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lic-pop-in {
          from { transform: scale(0.9) translateY(16px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes lic-check-pop {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UpdateToast — تنبيه سفلي أنيق لأي تعديل آخر على المدة (تخفيض…)
// ─────────────────────────────────────────────────────────────

function UpdateToast({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "calc(90px + env(safe-area-inset-bottom, 0px))",
        right: "50%",
        transform: "translateX(50%)",
        zIndex: 10000,
        width: "calc(100% - 32px)",
        maxWidth: 420,
        direction: "rtl",
        fontFamily: "var(--font-main, system-ui, sans-serif)",
        animation: "lic-toast-up 0.3s cubic-bezier(0.34, 1.3, 0.64, 1)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #1e3a5f, #0f2743)",
          border: "1px solid rgba(96, 165, 250, 0.4)",
          borderRadius: 16,
          padding: "13px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
        }}
      >
        <span style={{ fontSize: 22 }}>🔔</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#e0e7ff", lineHeight: 1.6 }}>
          {text}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          style={{
            background: "rgba(255,255,255,0.1)",
            border: "none",
            color: "#fff",
            borderRadius: 8,
            width: 28,
            height: 28,
            cursor: "pointer",
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>
      <style>{`
        @keyframes lic-toast-up {
          from { transform: translateX(50%) translateY(20px); opacity: 0; }
          to { transform: translateX(50%) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
