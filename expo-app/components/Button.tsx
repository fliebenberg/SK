import React, { forwardRef } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps, View } from 'react-native';
import { useActiveTheme } from '../store/settingsStore';
import { themeColor, type ThemeToken } from '../constants/Colors';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
}

/** The spinner shown while loading, in the colour the label would be. */
const SPINNER: Record<NonNullable<ButtonProps['variant']>, ThemeToken> = {
  primary: 'on-primary',
  secondary: 'on-accent',
  danger: 'on-danger',
  ghost: 'ink-soft',
};

export const Button = forwardRef<View, ButtonProps>(({ 
  title, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  disabled,
  ...props 
}, ref) => {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';

  const baseClasses = "min-h-[40px] flex-row items-center justify-center rounded-xl px-4 py-2 active:opacity-80";
  
  const variantClasses = {
    primary: "bg-primary",
    secondary: "bg-accent",
    danger: "bg-danger",
    ghost: "bg-card border border-line",
  };

  const textClasses = {
    primary: "text-on-primary",
    secondary: "text-on-accent",
    danger: "text-on-danger",
    ghost: "text-ink-soft",
  };

  const disabledClasses = disabled || isLoading ? "opacity-50" : "";

  return (
    <TouchableOpacity 
      ref={ref}
      className={`${baseClasses} ${variantClasses[variant]} ${disabledClasses} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={themeColor(isDark, SPINNER[variant])} />
      ) : (
        <Text className={`font-inter-bold text-sm text-center leading-tight ${textClasses[variant]}`}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
});
