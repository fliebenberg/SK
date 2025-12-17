"use client"

import * as React from "react"
import { Settings } from "lucide-react"
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
  const { setTheme } = useTheme()

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
        <DropdownMenuItem onClick={() => setTheme("dark-green")}>
          Dark (Green)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark-orange")}>
          Dark (Orange)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("light-orange")}>
          Light (Orange)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
