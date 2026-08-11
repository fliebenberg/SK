import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/Colors';
import { Button } from './Button';

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
}) => (
  <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
    <View className="w-full max-w-sm items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6">
      <View className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 items-center justify-center mb-4">
        <Ionicons name="lock-closed" size={22} color={COLORS.brand.red} />
      </View>

      <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white uppercase tracking-widest text-center mb-2">
        {title}
      </Text>

      <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 leading-relaxed text-center">
        {message}
      </Text>

      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="ghost" onPress={onAction} className="mt-5 w-full" />
      ) : null}
    </View>
  </View>
);
