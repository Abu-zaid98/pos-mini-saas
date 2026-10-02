/**
 * uiScale.ts — حجم عرض ثابت واحد لكل التطبيق (86٪ من الطبيعي)
 * بلا أي تحكم من المستخدم: يُطبق عند بدء الكاشير، وتُصفّره لوحة التحكم.
 * الطباعة دائماً 100% عبر CSS.
 */

export const UI_SCALE = 0.86;

const BASE_HEADER = 70;
const BASE_NAV = 72;
const BASE_EXTRA = 24;

export function applyUiScale(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--header-height', `${Math.round(BASE_HEADER * UI_SCALE * 10) / 10}px`);
  root.style.setProperty('--nav-height', `${Math.round(BASE_NAV * UI_SCALE * 10) / 10}px`);
  root.style.setProperty('--page-bottom-extra', `${bottomExtra(UI_SCALE)}px`);
  // التكبير على <html> نفسه (وليس body) — يتصرف مثل زوم المتصفح:
  // يملأ الشاشة دائماً ولا يترك شريطاً ميتاً أسفلها
  (root.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(UI_SCALE);
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

/** قيمة الهامش السفلي الإضافي — ثابت صغير فوق 100٪ ويتقلص تحتها */
export function bottomExtra(scale: number): number {
  const z = Number(scale) || 1;
  return z >= 1 ? BASE_EXTRA : Math.round(BASE_EXTRA * z * z);
}
