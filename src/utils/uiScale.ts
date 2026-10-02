/**
 * uiScale.ts — حجم العرض (تكبير/تصغير الخطوط والأيقونات) لتطبيق الكاشير
 * ثلاثة أحجام مقفلة فقط: قياسي 87% | طبيعي 100% (افتراضي) | كبير 108%
 * التطبيق عبر خاصية zoom على body + ضبط متغيرات الارتفاعات بنفس النسبة
 * حتى لا يغطي الهيدر/التنقل المحتوى. الطباعة تُعاد دائماً لـ 100%.
 */

const STORAGE_KEY = 'pos_ui_scale';
const BASE_HEADER = 70;
const BASE_NAV = 72;

export const UI_SCALE_PRESETS = [
  { id: 'standard', label: 'قياسي', value: 0.87 },
  { id: 'normal', label: 'طبيعي', value: 1 },
  { id: 'large', label: 'كبير', value: 1.08 },
] as const;

const ALLOWED = UI_SCALE_PRESETS.map((p) => p.value);

/** تقريب أي قيمة لأقرب حجم مسموح (دالة نقية — مغطاة بالاختبارات) */
export function parseUiScale(value: unknown): number {
  if (value === null || value === undefined) return 1;
  const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  let best = ALLOWED[1];
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
  const extra = z >= 1 ? 36 : Math.round(36 * z * z);
  root.style.setProperty('--page-bottom-extra', `${extra}px`);
  document.body.style.zoom = String(z);
}

/** قيمة الهامش السفلي الإضافي لمقياس ما (دالة نقية — مغطاة بالاختبارات) */
export function bottomExtra(scale: number): number {
  const z = parseUiScale(scale);
  return z >= 1 ? 36 : Math.round(36 * z * z);
}

/** أقرب وصف لفظي لقيمة ما (للعرض في الإعدادات) */
export function scaleLabel(value: number): string {
  const found = UI_SCALE_PRESETS.find((p) => p.value === parseUiScale(value));
  return found ? found.label : 'طبيعي';
}
