import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps } from 'react-native';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  title, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  disabled,
  ...props 
}) => {
  const baseClasses = "min-h-[44px] flex-row items-center justify-center rounded-lg px-6 py-3 active:opacity-80";
  
  const variantClasses = {
    primary: "bg-brand-orange",
    secondary: "bg-brand-blue",
    danger: "bg-brand-red",
  };

  const textClasses = {
    primary: "text-white",
    secondary: "text-slate-950",
    danger: "text-white",
  };

  const disabledClasses = disabled || isLoading ? "opacity-50" : "";

  return (
    <TouchableOpacity 
      className={`${baseClasses} ${variantClasses[variant]} ${disabledClasses} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'secondary' ? '#0F172A' : '#FFFFFF'} />
      ) : (
        <Text className={`font-inter font-bold text-base ${textClasses[variant]}`}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};
