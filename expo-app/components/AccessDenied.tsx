import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from './Button';
import { useActiveTheme } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';

interface AccessDeniedProps {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Shown when a signed-in user reaches a screen their roles do not cover.
 * Distinct from the sign-in redirect: there is nothing to log into here, so the
 * user is given a way back rather than being bounced.
 */
export const AccessDenied: React.FC<AccessDeniedProps> = ({
  title = 'Access Restricted',
  message,
  actionLabel,
  onAction,
}) => {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View className="flex-1 items-center justify-center bg-canvas p-6">
      <View className="w-full max-w-sm items-center bg-card border border-line rounded-2xl p-6">
        <View className="w-12 h-12 rounded-full bg-danger-soft items-center justify-center mb-4">
          <Ionicons name="lock-closed" size={22} color={themeColor(isDark, 'danger')} />
        </View>

        <Text className="font-orbitron-bold text-sm text-ink uppercase tracking-widest text-center mb-2">
          {title}
        </Text>

        <Text className="font-inter text-xs text-ink-muted leading-relaxed text-center">
          {message}
        </Text>

        {actionLabel && onAction ? (
          <Button title={actionLabel} variant="ghost" onPress={onAction} className="mt-5 w-full" />
        ) : null}
      </View>
    </View>
  );
};
