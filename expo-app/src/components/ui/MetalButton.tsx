import React, { useState } from 'react';
import { Pressable, StyleProp, ViewStyle, Platform, View, StyleSheet } from 'react-native';
import { XStack, Text, useTheme } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';

export interface MetalButtonProps {
  metalVariant?: 'silver' | 'silver-dark';
  isPrimary?: boolean; // Deprecated, use variantType="outlined"
  variantType?: 'secondary' | 'outlined' | 'filled';
  glowColor?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  icon?: React.ReactNode;
  href?: string;
  children?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const MetalButton = React.forwardRef<any, MetalButtonProps>(
  (
    {
      metalVariant = 'silver',
      isPrimary = false,
      variantType,
      glowColor,
      size = 'sm',
      icon,
      href,
      children,
      onPress,
      disabled = false,
      style,
      ...props
    },
    ref
  ) => {
    const theme = useTheme();
    const [isPressed, setIsPressed] = useState(false);

    // Determine effective variant type
    const effectiveVariant = variantType || (isPrimary ? 'outlined' : 'secondary');

    // Retrieve metal colors from the active Tamagui theme
    const outerStart = theme.metalOuterStart?.get() || '#94a3b8';
    const outerMid = theme.metalOuterMid?.get() || '#cbd5e1';
    const outerEnd = theme.metalOuterEnd?.get() || '#64748b';

    const innerStart = theme.metalInnerStart?.get() || '#e2e8f0';
    const innerMid = theme.metalInnerMid?.get() || '#cbd5e1';
    const innerEnd = theme.metalInnerEnd?.get() || '#94a3b8';

    const textThemeColor = theme.metalText?.get() || '#334155';
    const brandPrimary = theme.primary?.get() || 'hsl(142, 70%, 50%)';

    const finalGlowColor = glowColor || brandPrimary;

    // Outer metal border gradient
    let outerColors = [outerStart, outerMid, outerEnd];
    // Inner metal recessed plate gradient
    let innerColors = isPressed
      ? [innerEnd, innerMid, innerStart] // Inverted gradient on press to show depth
      : [innerStart, innerMid, innerEnd];

    let textColor = textThemeColor;
    let textGlowStyle = {};
    let outerGlowStyle: ViewStyle = {};

    if (effectiveVariant === 'outlined') {
      textColor = finalGlowColor;
      outerGlowStyle = {
        shadowColor: finalGlowColor,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
        elevation: 6,
      };
    } else if (effectiveVariant === 'filled') {
      outerColors = [finalGlowColor, finalGlowColor, finalGlowColor];
      innerColors = isPressed
        ? ['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.15)']
        : ['rgba(255,255,255,0.3)', 'rgba(0,0,0,0.15)'];
      textColor = '#ffffff';
      textGlowStyle = {
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      };
      outerGlowStyle = {
        shadowColor: finalGlowColor,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
        elevation: 8,
      };
    }

    // Size-specific padding and font sizes
    const sizePadding = {
      default: { px: 24, py: 14, fontSize: 16 },
      sm: { px: 16, py: 10, fontSize: 13 },
      lg: { px: 32, py: 18, fontSize: 18 },
      icon: { px: 10, py: 10, fontSize: 14 },
    };

    const currentSize = sizePadding[size];

    const innerContent = (
      <LinearGradient
        colors={outerColors as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 12,
          padding: 3, // Simulate the bevel/recess border width
          opacity: disabled ? 0.6 : 1,
          transform: isPressed ? [{ translateY: 1 }] : [],
          ...outerGlowStyle,
        }}
      >
        <LinearGradient
          colors={innerColors as any}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={{
            borderRadius: 9,
            paddingHorizontal: size === 'icon' ? 0 : currentSize.px,
            paddingVertical: currentSize.py,
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: size === 'icon' ? 44 : undefined,
            minHeight: size === 'icon' ? 44 : undefined,
          }}
        >
          {icon ? (
            <XStack gap="$2" alignItems="center" justifyContent="center">
              {icon}
              {size !== 'icon' && (
                <Text
                  fontFamily="$heading"
                  fontWeight="bold"
                  color={textColor}
                  fontSize={currentSize.fontSize}
                  letterSpacing={1}
                  style={textGlowStyle}
                >
                  {children}
                </Text>
              )}
            </XStack>
          ) : (
            <Text
              fontFamily="$heading"
              fontWeight="bold"
              color={textColor}
              fontSize={currentSize.fontSize}
              letterSpacing={1}
              style={textGlowStyle}
            >
              {children}
            </Text>
          )}
        </LinearGradient>
      </LinearGradient>
    );

    const pressableProps = {
      onPressIn: () => {
        console.log(`[MetalButton PRESSABLE] onPressIn (Platform: ${Platform.OS}, href: ${href})`);
        setIsPressed(true);
      },
      onPressOut: () => {
        console.log(`[MetalButton PRESSABLE] onPressOut (Platform: ${Platform.OS}, href: ${href})`);
        setIsPressed(false);
      },
      onPress: () => {
        console.log(`[MetalButton PRESSABLE] onPress (Platform: ${Platform.OS}, href: ${href})`);
        if (!disabled && onPress) onPress();
      },
      disabled: disabled,
      style: style,
    };

    if (href && !disabled) {
      if (Platform.OS === 'web') {
        const flatStyle = style ? StyleSheet.flatten(style) : {};
        console.log(`[MetalButton WEB] Rendering button with href="${href}", children="${children}"`);
        return (
          <Link
            href={href as any}
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              cursor: 'pointer',
              ...flatStyle,
            } as any}
            {...({
              onClick: (e: any) => {
                console.log(`[MetalButton WEB Link onClick] Triggered for href="${href}"`);
              }
            } as any)}
          >
            <View
              style={{
                flex: 1,
                width: '100%',
              }}
              {...({
                onTouchStart: () => setIsPressed(true),
                onTouchEnd: () => setIsPressed(false),
                onMouseDown: () => setIsPressed(true),
                onMouseUp: () => setIsPressed(false),
                onClick: (e: any) => {
                  console.log(`[MetalButton WEB View onClick] Inner View clicked for href="${href}"`);
                }
              } as any)}
            >
              {innerContent}
            </View>
          </Link>
        );
      }

      console.log(`[MetalButton NATIVE] Rendering button with href="${href}", children="${children}"`);
      return (
        <Link href={href as any} asChild>
          <Pressable {...pressableProps}>{innerContent}</Pressable>
        </Link>
      );
    }

    console.log(`[MetalButton NO-HREF] Rendering button with children="${children}"`);
    return (
      <Pressable ref={ref} {...pressableProps}>
        {innerContent}
      </Pressable>
    );
  }
);

MetalButton.displayName = 'MetalButton';
