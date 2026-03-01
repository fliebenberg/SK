"use client"

import * as React from "react"
import { Settings, Check } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function SettingsMenu() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="border-primary/20 hover:border-primary hover:bg-primary/10 transition-colors">
          <Settings className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all text-primary" />
          <span className="sr-only">Settings</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme("system")} className="flex items-center justify-between cursor-pointer">
          <span>Browser Default</span>
          {theme === "system" && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark-green")} className="flex items-center justify-between cursor-pointer">
          <span>Dark (Green)</span>
          {theme === "dark-green" && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark-orange")} className="flex items-center justify-between cursor-pointer">
          <span>Dark (Orange)</span>
          {theme === "dark-orange" && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("light-orange")} className="flex items-center justify-between cursor-pointer">
          <span>Light (Orange)</span>
          {theme === "light-orange" && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

