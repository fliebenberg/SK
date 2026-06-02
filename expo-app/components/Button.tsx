import React, { forwardRef } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps, View } from 'react-native';
import { useActiveTheme } from '../store/settingsStore';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
}

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

  const baseClasses = "min-h-[44px] flex-row items-center justify-center rounded-lg px-6 py-3 active:opacity-80";
  
  const variantClasses = {
    primary: "bg-brand-orange",
    secondary: "bg-brand-blue",
    danger: "bg-brand-red",
    ghost: "bg-white border border-slate-200",
  };

  const textClasses = {
    primary: "text-white",
    secondary: "text-slate-950",
    danger: "text-white",
    ghost: "text-slate-700 dark:text-brand-blue",
  };

  const disabledClasses = disabled || isLoading ? "opacity-50" : "";

  const ghostStyle = variant === 'ghost' ? {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FFFFFF',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#E2E8F0',
  } : {};

  return (
    <TouchableOpacity 
      ref={ref}
      className={`${baseClasses} ${variantClasses[variant]} ${disabledClasses} ${className}`}
      disabled={disabled || isLoading}
      style={[ghostStyle, props.style]}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'secondary' ? '#0F172A' : '#FFFFFF'} />
      ) : (
        <Text className={`font-inter-bold text-base text-center w-full ${textClasses[variant]}`}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
});
