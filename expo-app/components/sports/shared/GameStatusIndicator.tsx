import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Platform } from 'react-native';
import { AnimatedBox } from '../../AnimatedBox';
import { themeColor } from '../../../constants/Colors';
import { useActiveTheme } from '../../../store/settingsStore';

interface GameStatusIndicatorProps {
  isRunning?: boolean;
  periodText?: string;
  compact?: boolean;
}

export function GameStatusIndicator({
  isRunning = false,
  periodText,
  compact = false,
}: GameStatusIndicatorProps) {
  const isDark = useActiveTheme() === 'dark';
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    if (isRunning) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.2,
            duration: 750,
            useNativeDriver,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 750,
            useNativeDriver,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRunning, pulseAnim, useNativeDriver]);

  return (
    <View className="flex-row items-center gap-1.5 min-h-[18px]">
      {isRunning ? (
        <View className="flex-row items-center gap-1.5">
          {periodText ? (
            <Text className="font-inter text-[10px] text-ink-muted uppercase tracking-wider font-medium">
              {periodText}
            </Text>
          ) : null}
          <View className="flex-row items-center gap-1">
            <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
              <AnimatedBox
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: themeColor(isDark, 'success'),
                  opacity: pulseAnim,
                }}
              />
            </View>
            {!compact && (
              <Text className="font-orbitron-bold text-[9px] text-success-ink uppercase tracking-wider">
                LIVE
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View className="px-2 py-0.5 rounded-full bg-warning-soft border border-warning-line flex-row items-center justify-center">
          <Text className="font-orbitron-bold text-[9px] text-warning-ink uppercase tracking-wider">
            PAUSED
          </Text>
        </View>
      )}
    </View>
  );
}
