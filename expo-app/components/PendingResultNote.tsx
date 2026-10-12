import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePendingResult, useResultQueue } from '../services/resultQueue';
import { useActiveTheme } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';

/**
 * A match's result entered offline (U20), on the match's own page: **waiting to send** until the
 * connection is back, or **not sent**, with the server's reason and *Discard*, when it was refused —
 * most often because somebody else changed the result meanwhile.
 */
export function PendingResultNote({ gameId, className = '' }: { gameId?: string; className?: string }) {
  const isDark = useActiveTheme() === 'dark';
  const pending = usePendingResult(gameId);
  if (!pending) return null;
  const refused = !!pending.refused;
  return (
    <View className={`flex-row items-start gap-2.5 rounded-xl px-3.5 py-2.5 ${refused ? 'bg-danger-soft' : 'bg-warning-soft'} ${className}`} accessibilityLiveRegion="polite">
      <Ionicons name={refused ? 'alert-circle-outline' : 'cloud-upload-outline'} size={16} color={themeColor(isDark, refused ? 'danger-ink' : 'warning-ink')} />
      <View className="flex-1 gap-0.5">
        <Text className={`font-inter-bold text-sm ${refused ? 'text-danger-ink' : 'text-warning-ink'}`}>
          {refused ? 'Your result was not sent' : 'Result waiting to send'}
        </Text>
        <Text className={`font-inter text-[13px] ${refused ? 'text-danger-ink' : 'text-warning-ink'}`}>
          {pending.label}. {refused ? pending.refused : 'It is sent when the connection is back.'}
        </Text>
      </View>
      {refused ? (
        <TouchableOpacity onPress={() => useResultQueue.getState().remove(pending.requestId)} accessibilityRole="button" className="rounded-lg border border-danger px-2.5 py-1">
          <Text className="font-inter-bold text-xs text-danger-ink">Discard</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
