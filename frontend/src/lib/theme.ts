// Modo oscuro: 'system' sigue prefers-color-scheme, 'light'/'dark' fuerza data-theme.
export type Theme = 'system' | 'light' | 'dark'

const KEY = 'motm-theme'

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // localStorage no disponible (privado/bloqueado) — el toggle sigue
    // funcionando para la sesión actual vía applyTheme.
  }
  applyTheme(theme)
}
