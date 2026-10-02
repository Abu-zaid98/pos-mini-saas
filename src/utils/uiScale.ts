/**
 * uiScale.ts — حجم العرض (تكبير/تصغير الخطوط والأيقونات) لتطبيق الكاشير
 * ثلاثة أحجام مقفلة فقط: قياسي 87% | طبيعي 100% (افتراضي) | كبير 108%
 * التطبيق عبر خاصية zoom على body + ضبط متغيرات الارتفاعات بنفس النسبة
 * حتى لا يغطي الهيدر/التنقل المحتوى. الطباعة تُعاد دائماً لـ 100%.
 */

const STORAGE_KEY = 'pos_ui_scale';
const BASE_HEADER = 70;
const BASE_NAV = 72;

/** الحجم الافتراضي الرئيسي */
export const UI_SCALE_DEFAULT = 0.86;

export const UI_SCALE_PRESETS = [
  { id: 'standard', label: 'قياسي', value: 0.86 },
  { id: 'normal', label: 'طبيعي', value: 1 },
  { id: 'large', label: 'كبير', value: 1.08 },
] as const;

const ALLOWED = UI_SCALE_PRESETS.map((p) => p.value);

/** تقريب أي قيمة لأقرب حجم مسموح — والغائب/الفاسد يعود للافتراضي (دالة نقية) */
export function parseUiScale(value: unknown): number {
  if (value === null || value === undefined) return UI_SCALE_DEFAULT;
  const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(n) || n <= 0) return UI_SCALE_DEFAULT;
  let best = ALLOWED[0];
  let bestDiff = Math.abs(n - best);
  for (const a of ALLOWED) {
    const diff = Math.abs(n - a);
    if (diff < bestDiff) {
      best = a;
      bestDiff = diff;
    }
  }
  return best;
}

export function getStoredScale(): number {
  try {
    if (typeof localStorage === 'undefined') return 1;
    return parseUiScale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 1;
  }
}

export function applyUiScale(scale: number): void {
  const z = parseUiScale(scale);
  try {
    localStorage.setItem(STORAGE_KEY, String(z));
  } catch {
    // تجاهل — التخزين غير متاح
  }
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--header-height', `${Math.round(BASE_HEADER * z * 10) / 10}px`);
  root.style.setProperty('--nav-height', `${Math.round(BASE_NAV * z * 10) / 10}px`);
  // الهامش السفلي يتقلص تربيعياً عند التصغير حتى لا يبدو فراغاً مبالغاً فيه
  const extra = z >= 1 ? 24 : Math.round(24 * z * z);
  root.style.setProperty('--page-bottom-extra', `${extra}px`);
  // التكبير على <html> نفسه (وليس body) — يتصرف مثل زوم المتصفح:
  // يملأ الشاشة دائماً ولا يترك شريطاً ميتاً أسفلها كما يفعل zoom على body مع 100dvh
  (root.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(z);
}

/** إعادة ضبط التكبير (للوحة التحكم — تعمل دائماً 100٪) */
export function resetUiScale(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  (root.style as CSSStyleDeclaration & { zoom?: string }).zoom = '';
  root.style.removeProperty('--header-height');
  root.style.removeProperty('--nav-height');
  root.style.removeProperty('--page-bottom-extra');
}

/** قيمة الهامش السفلي الإضافي لمقياس ما (دالة نقية — مغطاة بالاختبارات) */
export function bottomExtra(scale: number): number {
  const z = parseUiScale(scale);
  return z >= 1 ? 24 : Math.round(24 * z * z);
}

/** أقرب وصف لفظي لقيمة ما (للعرض في الإعدادات) */
export function scaleLabel(value: number): string {
  const found = UI_SCALE_PRESETS.find((p) => p.value === parseUiScale(value));
  return found ? found.label : 'قياسي';
}
