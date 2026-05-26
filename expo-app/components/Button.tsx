import React, { forwardRef } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps, View } from 'react-native';

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
  const baseClasses = "min-h-[44px] flex-row items-center justify-center rounded-lg px-6 py-3 active:opacity-80";
  
  const variantClasses = {
    primary: "bg-brand-orange",
    secondary: "bg-brand-blue",
    danger: "bg-brand-red",
    ghost: "bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5",
  };

  const textClasses = {
    primary: "text-white",
    secondary: "text-slate-950",
    danger: "text-white",
    ghost: "text-brand-blue",
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
        <ActivityIndicator color={variant === 'secondary' ? '#0F172A' : '#FFFFFF'} />
      ) : (
        <Text className={`font-inter-bold text-base ${textClasses[variant]}`}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
});
