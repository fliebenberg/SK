import * as React from "react"
import { cn } from "@/lib/utils"

const MetalCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "gold" | "dark" }
>(({ className, variant = "default", ...props }, ref) => {
  const variantStyles = {
    default: "bg-gradient-to-br from-card to-muted/50 border-t-white/20 border-l-white/20 border-b-black/20 border-r-black/20",
    gold: "bg-gradient-to-br from-amber-100 to-amber-300 dark:from-amber-900 dark:to-amber-950 border-amber-400/30",
    dark: "bg-gradient-to-br from-slate-800 to-slate-950 border-slate-700/50"
  }

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border shadow-lg relative overflow-hidden transition-all hover:shadow-xl",
        // Metal sheen effect
        "before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/40 before:to-transparent before:opacity-0 hover:before:opacity-100 before:transition-opacity before:pointer-events-none",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
})
MetalCard.displayName = "MetalCard"

export { MetalCard }
