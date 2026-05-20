import React from 'react';
import { View, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Text, YStack, XStack } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';

interface MetalTextProps {
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  glowColor?: string;
  metalVariant?: 'silver' | 'silver-dark' | 'copper' | 'copper-yellow' | 'copper-red' | 'copper-dark';
  glowSize?: 'sm' | 'md' | 'lg';
  text: string;
}

export const MetalText: React.FC<MetalTextProps> = ({
  style,
  size = 'md',
  glowColor = '#39ff14',
  metalVariant = 'silver',
  glowSize = 'sm',
  text,
}) => {
  const sizeStyles = {
    sm: { height: 32, fontSize: 16, px: 12, minWidth: 60, rivetSize: 2, rivetOffset: 2 },
    md: { height: 52, fontSize: 26, px: 24, minWidth: 100, rivetSize: 4, rivetOffset: 4 },
    lg: { height: 80, fontSize: 44, px: 32, minWidth: 160, rivetSize: 6, rivetOffset: 6 },
    xl: { height: 110, fontSize: 60, px: 40, minWidth: 220, rivetSize: 8, rivetOffset: 8 },
  };

  const variantStyles = {
    silver: {
      outer: ['#cbd5e1', '#f8fafc', '#94a3b8'],
      inner: ['#e2e8f0', '#cbd5e1', '#94a3b8'],
      text: '#e2e8f0',
      screw: '#cbd5e1',
    },
    'silver-dark': {
      outer: ['#0f172a', '#1e293b', '#020617'],
      inner: ['#020617', '#1e293b', '#0f172a'],
      text: '#94a3b8',
      screw: '#0f172a',
    },
    copper: {
      outer: ['#451a03', '#9a3412', '#7c2d12'],
      inner: ['#7c2d12', '#9a3412', '#451a03'],
      text: '#fdba74',
      screw: '#451a03',
    },
    'copper-yellow': {
      outer: ['#a16207', '#ca8a04', '#854d0e'],
      inner: ['#854d0e', '#ca8a04', '#a16207'],
      text: '#fef08a',
      screw: '#a16207',
    },
    'copper-red': {
      outer: ['#9a3412', '#ea580c', '#c2410c'],
      inner: ['#c2410c', '#ea580c', '#9a3412'],
      text: '#ffedd5',
      screw: '#9a3412',
    },
    'copper-dark': {
      outer: ['#44403c', '#78716c', '#57534e'],
      inner: ['#57534e', '#78716c', '#44403c'],
      text: '#e7e5e4',
      screw: '#44403c',
    },
  };

  const glowStyles = {
    sm: { radius: 2, opacity: 0.8 },
    md: { radius: 6, opacity: 0.9 },
    lg: { radius: 12, opacity: 1.0 },
  };

  const currentSize = sizeStyles[size];
  const currentVariant = variantStyles[metalVariant];
  const currentGlow = glowStyles[glowSize];

  const textStyle: TextStyle = {
    fontFamily: 'OrbitronBold',
    fontWeight: 'bold',
    fontSize: currentSize.fontSize,
    color: currentVariant.text,
    textAlign: 'center',
    letterSpacing: 1.5,
    // Realistic backlit neon text shadow
    textShadowColor: glowColor,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: currentGlow.radius,
  };

  const rivetStyle = (top: boolean, left: boolean): ViewStyle => ({
    position: 'absolute',
    top: top ? currentSize.rivetOffset : undefined,
    bottom: !top ? currentSize.rivetOffset : undefined,
    left: left ? currentSize.rivetOffset : undefined,
    right: !left ? currentSize.rivetOffset : undefined,
    width: currentSize.rivetSize,
    height: currentSize.rivetSize,
    borderRadius: currentSize.rivetSize / 2,
    backgroundColor: currentVariant.screw,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: 'rgba(0,0,0,0.5)',
    shadowOffset: { width: 0.5, height: 0.5 },
    shadowOpacity: 0.5,
    shadowRadius: 0.5,
    elevation: 0.5,
  });

  return (
    <View style={style}>
      <LinearGradient
        colors={currentVariant.outer as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          height: currentSize.height,
          minWidth: currentSize.minWidth,
          borderRadius: 4,
          padding: 3, // Bevel recess
          shadowColor: 'rgba(0,0,0,0.5)',
          shadowOffset: { width: 2, height: 2 },
          shadowOpacity: 0.5,
          shadowRadius: 3,
          elevation: 4,
          position: 'relative',
        }}
      >
        <LinearGradient
          colors={currentVariant.inner as any}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={{
            flex: 1,
            borderRadius: 2,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: currentSize.px,
          }}
        >
          <Text style={textStyle}>{text}</Text>

          {/* Screws/Rivets in 4 corners */}
          <View style={rivetStyle(true, true)} />
          <View style={rivetStyle(true, false)} />
          <View style={rivetStyle(false, true)} />
          <View style={rivetStyle(false, false)} />
        </LinearGradient>
      </LinearGradient>
    </View>
  );
};
