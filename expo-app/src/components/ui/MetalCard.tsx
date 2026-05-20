import React from 'react';
import { ViewStyle, StyleSheet, View } from 'react-native';
import { YStack, YStackProps, useTheme } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';

export interface MetalCardProps extends YStackProps {
  variant?: 'default' | 'gold' | 'dark';
  hasRivets?: boolean;
}

export const MetalCard = React.forwardRef<any, MetalCardProps>(
  ({ variant = 'default', hasRivets = false, children, style, ...props }, ref) => {
    const theme = useTheme();

    // Determine dark mode
    const isDark = theme.name?.toString().startsWith('dark');

    // Retrieve base metal colors from active Tamagui theme
    const outerStart = theme.metalOuterStart?.get() || '#94a3b8';
    const outerMid = theme.metalOuterMid?.get() || '#cbd5e1';
    const outerEnd = theme.metalOuterEnd?.get() || '#64748b';

    const innerStart = theme.metalInnerStart?.get() || '#e2e8f0';
    const innerMid = theme.metalInnerMid?.get() || '#cbd5e1';
    const innerEnd = theme.metalInnerEnd?.get() || '#94a3b8';

    // Configure gradients based on variant and light/dark theme
    let outerColors: string[];
    let innerColors: string[];
    let borderColor: string = 'rgba(255, 255, 255, 0.1)';

    if (variant === 'gold') {
      if (isDark) {
        outerColors = ['#78350f', '#451a03', '#020617'];
        innerColors = ['#451a03', '#78350f', '#92400e'];
        borderColor = 'rgba(251, 191, 36, 0.2)';
      } else {
        outerColors = ['#fbbf24', '#f59e0b', '#d97706'];
        innerColors = ['#fef3c7', '#fde68a', '#fbbf24'];
        borderColor = 'rgba(217, 119, 6, 0.2)';
      }
    } else if (variant === 'dark') {
      outerColors = ['#334155', '#1e293b', '#0f172a'];
      innerColors = ['#1e293b', '#0f172a', '#020617'];
      borderColor = 'rgba(255, 255, 255, 0.05)';
    } else {
      // 'default' variant uses theme metal variables
      outerColors = [outerStart, outerMid, outerEnd];
      innerColors = [innerStart, innerMid, innerEnd];
      borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.25)';
    }

    // Screws/Rivets styling if enabled (adds high-fidelity sports look to specific scoreboards/rosters)
    const rivetSize = 5;
    const rivetOffset = 6;
    const screwColor = variant === 'gold' ? '#b45309' : variant === 'dark' ? '#0f172a' : '#94a3b8';

    const rivetStyle = (top: boolean, left: boolean): ViewStyle => ({
      position: 'absolute',
      top: top ? rivetOffset : undefined,
      bottom: !top ? rivetOffset : undefined,
      left: left ? rivetOffset : undefined,
      right: !left ? rivetOffset : undefined,
      width: rivetSize,
      height: rivetSize,
      borderRadius: rivetSize / 2,
      backgroundColor: screwColor,
      borderWidth: 0.5,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      opacity: 0.6,
    });

    return (
      <LinearGradient
        colors={outerColors as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.outerBorder,
          {
            borderColor: borderColor,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.4 : 0.15,
            shadowRadius: 8,
            elevation: 5,
          },
          style as ViewStyle,
        ]}
      >
        <LinearGradient
          colors={innerColors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.innerContainer,
            {
              padding: hasRivets ? 16 : 12,
            },
          ]}
        >
          {/* Subtle metal sheen / specular highlight overlay */}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.02)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <YStack flex={1} {...props} ref={ref}>
            {children}
          </YStack>

          {/* Optional sports-decor rivets */}
          {hasRivets && (
            <>
              <View style={rivetStyle(true, true)} />
              <View style={rivetStyle(true, false)} />
              <View style={rivetStyle(false, true)} />
              <View style={rivetStyle(false, false)} />
            </>
          )}
        </LinearGradient>
      </LinearGradient>
    );
  }
);

MetalCard.displayName = 'MetalCard';

const styles = StyleSheet.create({
  outerBorder: {
    borderRadius: 16,
    padding: 1.5, // Outer bevel thickness
    borderWidth: 1,
    overflow: 'hidden',
  },
  innerContainer: {
    flex: 1,
    borderRadius: 14.5, // Matches border radius minus padding
    position: 'relative',
    overflow: 'hidden',
  },
});
