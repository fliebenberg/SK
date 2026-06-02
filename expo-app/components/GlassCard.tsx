import React from 'react';
import { View, ViewProps } from 'react-native';
import { useActiveTheme } from '../store/settingsStore';

export const GlassCard: React.FC<ViewProps> = ({ children, className = '', ...props }) => {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';

  return (
    <View 
      className={`bg-white rounded-xl p-4 overflow-hidden border border-slate-200 ${className}`}
      style={[{
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#FFFFFF',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#E2E8F0',
      }, props.style]}
      {...props}
    >
      {children}
    </View>
  );
};
