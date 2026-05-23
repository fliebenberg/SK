import React from 'react';
import { View, ViewProps } from 'react-native';

export const GlassCard: React.FC<ViewProps> = ({ children, className = '', ...props }) => {
  return (
    <View 
      className={`bg-surface rounded-xl p-4 overflow-hidden border border-white/5 ${className}`}
      {...props}
    >
      {children}
    </View>
  );
};
