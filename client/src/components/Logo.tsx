import React from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  glowColor?: string;
  metalVariant?: 'silver' | 'silver-dark' | 'copper' | 'copper-yellow' | 'copper-red' | 'copper-dark';
  glowSize?: 'sm' | 'md' | 'lg';
  text?: string;
}

export const Logo: React.FC<LogoProps> = ({ 
  className, 
  size = 'md', 
  glowColor = '#39ff14', 
  metalVariant = 'silver',
  glowSize = 'sm',
  text = 'SK'
}) => {
  const sizeClasses = {
    sm: 'h-[26px] text-[20px]',
    md: 'h-[40px] text-[32px]',
    lg: 'h-[60px] text-[52px]',
    xl: 'h-[84px] text-[72px]',
  };

  const minWidthClasses = {
    sm: 'min-w-[44px] px-2',
    md: 'min-w-[72px] px-4',
    lg: 'min-w-[116px] px-6',
    xl: 'min-w-[160px] px-8',
  };

  const variantStyles = {
    silver: {
      outer: 'bg-gradient-to-br from-slate-300 via-slate-100 to-slate-400',
      inner: 'bg-gradient-to-tl from-slate-200 via-slate-300 to-slate-400 border-slate-300/50',
      text: 'text-slate-300',
      screw: 'bg-slate-300',
      shadow: 'shadow-[inset_-1px_-1px_3px_rgba(0,0,0,0.3),2px_2px_5px_rgba(0,0,0,0.3)]',
    },
    'silver-dark': { // Dark grey/Gunmetal
      outer: 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950',
      inner: 'bg-gradient-to-tl from-slate-950 via-slate-800 to-slate-900 border-slate-700/30',
      text: 'text-slate-800',
      screw: 'bg-slate-900',
      shadow: 'shadow-[inset_-1px_-1px_3px_rgba(0,0,0,0.5),2px_2px_5px_rgba(0,0,0,0.5)]',
    },
    copper: { // Original dark copper
      outer: 'bg-gradient-to-br from-orange-950 via-orange-800 to-orange-900',
      inner: 'bg-gradient-to-tl from-orange-900 via-orange-800 to-orange-950 border-orange-700/30',
      text: 'text-orange-900',
      screw: 'bg-orange-950',
      shadow: 'shadow-[inset_-1px_-1px_3px_rgba(0,0,0,0.5),2px_2px_5px_rgba(0,0,0,0.5)]',
    },
    'copper-yellow': { // More yellowish/brass
      outer: 'bg-gradient-to-br from-yellow-700 via-yellow-600 to-yellow-800',
      inner: 'bg-gradient-to-tl from-yellow-800 via-yellow-600 to-yellow-700 border-yellow-500/30',
      text: 'text-yellow-800',
      screw: 'bg-yellow-700',
      shadow: 'shadow-[inset_-1px_-1px_3px_rgba(0,0,0,0.5),2px_2px_5px_rgba(0,0,0,0.5)]',
    },
    'copper-red': { // More reddish/classic copper
      outer: 'bg-gradient-to-br from-orange-800 via-orange-600 to-orange-900',
      inner: 'bg-gradient-to-tl from-orange-900 via-orange-600 to-orange-800 border-orange-500/30',
      text: 'text-orange-800',
      screw: 'bg-orange-900',
      shadow: 'shadow-[inset_-1px_-1px_3px_rgba(0,0,0,0.5),2px_2px_5px_rgba(0,0,0,0.5)]',
    },
    'copper-dark': { // Darker oxidized bronze
      outer: 'bg-gradient-to-br from-stone-700 via-stone-600 to-stone-800',
      inner: 'bg-gradient-to-tl from-stone-800 via-stone-600 to-stone-700 border-stone-500/30',
      text: 'text-stone-800',
      screw: 'bg-stone-700',
      shadow: 'shadow-[inset_-1px_-1px_3px_rgba(0,0,0,0.5),2px_2px_5px_rgba(0,0,0,0.5)]',
    }
  };

  const glowStyles = {
    sm: `0 0 2px ${glowColor}, 0 0 5px ${glowColor}`,
    md: `0 0 5px ${glowColor}, 0 0 10px ${glowColor}, 0 0 20px ${glowColor}`,
    lg: `0 0 10px ${glowColor}, 0 0 20px ${glowColor}, 0 0 40px ${glowColor}`,
  };

  const styles = variantStyles[metalVariant];

  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-sm font-bold tracking-wider',
        styles.outer,
        styles.shadow,
        sizeClasses[size],
        minWidthClasses[size],
        className
      )}
      style={{ fontFamily: 'var(--font-orbitron)' }}
    >
      {/* Brushed metal texture overlay */}
      <div className="absolute inset-0 rounded-sm opacity-20 bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')] pointer-events-none" />
      
      {/* Inner recessed area */}
      <div className={cn(
        "absolute inset-[3px] rounded-sm flex items-center justify-center z-10 shadow-[inset_1px_1px_2px_rgba(0,0,0,0.2)]",
        styles.inner
      )} />

      {/* Text with inset effect */}
      <span 
        className={cn("relative z-20 whitespace-nowrap", styles.text)}
        style={{ 
          textShadow: `-1px -1px 1px rgba(0,0,0,0.5), 1px 1px 1px rgba(255,255,255,0.1), ${glowStyles[glowSize]}`,
        }}
      >
        {text}
      </span>
      
      {/* Screws/Rivets */}
      <div className={cn("absolute top-1 left-1 w-1 h-1 rounded-full shadow-[inset_1px_1px_1px_rgba(0,0,0,0.4),1px_1px_0px_rgba(255,255,255,0.1)] z-20", styles.screw)} />
      <div className={cn("absolute top-1 right-1 w-1 h-1 rounded-full shadow-[inset_1px_1px_1px_rgba(0,0,0,0.4),1px_1px_0px_rgba(255,255,255,0.1)] z-20", styles.screw)} />
      <div className={cn("absolute bottom-1 left-1 w-1 h-1 rounded-full shadow-[inset_1px_1px_1px_rgba(0,0,0,0.4),1px_1px_0px_rgba(255,255,255,0.1)] z-20", styles.screw)} />
      <div className={cn("absolute bottom-1 right-1 w-1 h-1 rounded-full shadow-[inset_1px_1px_1px_rgba(0,0,0,0.4),1px_1px_0px_rgba(255,255,255,0.1)] z-20", styles.screw)} />
    </div>
  );
};
