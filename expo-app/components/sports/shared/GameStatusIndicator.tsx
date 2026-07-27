import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Platform } from 'react-native';

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
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showPausedBadge, setShowPausedBadge] = useState(false);

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

  useEffect(() => {
    if (!isRunning) {
      const interval = setInterval(() => {
        Animated.sequence([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 250,
            useNativeDriver,
          }),
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver,
          }),
        ]).start();

        setShowPausedBadge(prev => !prev);
      }, 1600);

      return () => clearInterval(interval);
    } else {
      setShowPausedBadge(false);
      fadeAnim.setValue(0);
    }
  }, [isRunning, fadeAnim, useNativeDriver]);

  return (
    <View className="flex-row items-center gap-1.5 min-h-[18px]">
      {isRunning ? (
        <View className="flex-row items-center gap-1.5">
          {periodText ? (
            <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">
              {periodText}
            </Text>
          ) : null}
          <View className="flex-row items-center gap-1">
            <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#10B981',
                  opacity: pulseAnim,
                }}
              />
            </View>
            {!compact && (
              <Text className="font-orbitron-bold text-[9px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                LIVE
              </Text>
            )}
          </View>
        </View>
      ) : (
        <Animated.View style={{ opacity: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }}>
          {showPausedBadge ? (
            <View className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 flex-row items-center justify-center">
              <Text className="font-orbitron-bold text-[9px] text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                PAUSED
              </Text>
            </View>
          ) : (
            periodText ? (
              <Text className="font-inter text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wider font-semibold">
                {periodText}
              </Text>
            ) : null
          )}
        </Animated.View>
      )}
    </View>
  );
}
