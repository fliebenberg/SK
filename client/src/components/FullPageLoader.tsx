"use client";

import { Logo } from "./Logo";
import { useThemeColors } from "@/hooks/useThemeColors";

export function FullPageLoader() {
  const { primaryColor } = useThemeColors();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
      
      <div className="relative flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-500">
        {/* Pulsing Logo Container */}
        <div className="relative">
          <div 
            className="absolute inset-0 blur-2xl opacity-20 animate-pulse" 
            style={{ backgroundColor: primaryColor }}
          />
          <Logo size="xl" glowColor={primaryColor} glowSize="lg" className="animate-pulse" />
        </div>
        
        {/* Loading Text */}
        <div className="flex flex-col items-center gap-2">
          <span 
            className="text-2xl font-bold tracking-[0.2em] text-foreground uppercase"
            style={{ fontFamily: 'var(--font-orbitron)' }}
          >
            Entering Arena
          </span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div 
                key={i}
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{ 
                  backgroundColor: primaryColor,
                  animationDelay: `${i * 0.15}s`
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
