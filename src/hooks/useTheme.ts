import { useEffect, useState, useCallback } from 'react'

export type ThemeMode = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'log-analyzer:theme'

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  const effective =
    mode === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode
  root.classList.toggle('dark', effective === 'dark')
  root.classList.toggle('light', effective === 'light')
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => (localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'dark')

  useEffect(() => {
    applyTheme(theme)
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  const setTheme = useCallback((mode: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, mode)
    setThemeState(mode)
  }, [])

  return { theme, setTheme }
}
