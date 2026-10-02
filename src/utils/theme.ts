export type Theme = 'dark' | 'light'

const THEME_STORAGE_KEY = 'pos_theme'

export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
  } catch {}
  return 'dark'
}

export function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {}
  document.documentElement.setAttribute('data-theme', theme)
}

export function toggleTheme(): Theme {
  const current = getStoredTheme()
  const next: Theme = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}

// Automatically apply theme upon module evaluation
if (typeof window !== 'undefined') {
  applyTheme(getStoredTheme())
}
