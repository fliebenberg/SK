"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeInitializer() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return null
}

