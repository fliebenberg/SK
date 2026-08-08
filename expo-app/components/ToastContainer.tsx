import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useToastStore, ToastMessage } from '../store/toastStore';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS } from '../constants/Colors';

interface SingleToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
  isDark: boolean;
}

const SingleToast: React.FC<SingleToastProps> = ({ toast, onDismiss, isDark }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Entrance animation: Slide up and fade in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss timer
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration]);

  const handleDismiss = () => {
    // Exit animation: Slide down and fade out
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 15,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss(toast.id);
    });
  };

  const getToastConfig = () => {
    switch (toast.type) {
      case 'error':
        return {
          icon: 'alert-circle-outline' as const,
          iconColor: COLORS.brand.red,
          borderColor: COLORS.brand.red,
          bgStyle: isDark ? '#1E1B2E' : '#FEF2F2',
        };
      case 'success':
        return {
          icon: 'checkmark-circle-outline' as const,
          iconColor: COLORS.brand.green,
          borderColor: COLORS.brand.green,
          bgStyle: isDark ? '#142721' : '#F0FDF4',
        };
      case 'warning':
        return {
          icon: 'warning-outline' as const,
          iconColor: '#F59E0B',
          borderColor: '#F59E0B',
          bgStyle: isDark ? '#2D2316' : '#FFFBEB',
        };
      case 'info':
      default:
        return {
          icon: 'information-circle-outline' as const,
          iconColor: COLORS.brand.blue,
          borderColor: COLORS.brand.blue,
          bgStyle: isDark ? '#152536' : '#F0F9FF',
        };
    }
  };

  const config = getToastConfig();

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: translateYAnim }],
        backgroundColor: config.bgStyle,
        borderColor: config.borderColor,
      }}
      className="w-full max-w-md border-l-4 rounded-lg p-3.5 shadow-md flex-row items-center gap-3 self-center"
    >
      <Ionicons name={config.icon} size={22} color={config.iconColor} />

      <View className="flex-1">
        {toast.title ? (
          <Text className="font-orbitron-bold text-xs uppercase tracking-wider text-slate-900 dark:text-white mb-0.5">
            {toast.title}
          </Text>
        ) : null}
        <Text
          className="font-inter text-xs text-slate-700 dark:text-slate-200 leading-snug"
          numberOfLines={3}
        >
          {toast.message}
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleDismiss}
        activeOpacity={0.7}
        className="w-7 h-7 rounded-full items-center justify-center bg-slate-200/50 dark:bg-white/10"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name="close-outline"
          size={16}
          color={isDark ? COLORS.dark.textSecondary : COLORS.light.textSecondary}
        />
      </TouchableOpacity>
    </Animated.View>
  );
};

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) {
    return null;
  }

  // Calculate bottom offset to remain above bottom tabs and safe area
  const bottomInset = Platform.OS === 'web' ? 24 : Math.max(insets.bottom + 16, 24);

  return (
    <View
      pointerEvents="box-none"
      style={{ bottom: bottomInset }}
      className="absolute left-4 right-4 z-[9999] items-center"
    >
      <View pointerEvents="auto" className="w-full max-w-md gap-2">
        {toasts.map((toast) => (
          <SingleToast
            key={toast.id}
            toast={toast}
            onDismiss={dismissToast}
            isDark={isDark}
          />
        ))}
      </View>
    </View>
  );
};
