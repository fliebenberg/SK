"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeInitializer() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    // If the theme is set to 'system', we want to override it with our specific
    // orange themes based on the system preference.
    if (theme === 'system') {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      setTheme(isDark ? 'dark-orange' : 'light-orange')
    }
  }, [theme, setMounted, mounted, setTheme])

  return null
}
