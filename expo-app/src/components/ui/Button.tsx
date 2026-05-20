import React from 'react';
import { Button as TamaguiButton, ButtonProps as TamaguiButtonProps, Text } from 'tamagui';

export interface ButtonProps extends Omit<TamaguiButtonProps, 'variant' | 'size'> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<any, ButtonProps>(
  ({ variant = 'default', size = 'default', style, children, ...props }, ref) => {
    // Style mappings for variants
    let bg = '$primary';
    let textColor = '$background';
    let borderWidth = 0;
    let borderColor = 'transparent';
    let textDecoration: 'none' | 'underline' = 'none';

    if (variant === 'destructive') {
      bg = '$red10';
      textColor = '#ffffff';
    } else if (variant === 'outline') {
      bg = 'transparent';
      textColor = '$color';
      borderWidth = 1;
      borderColor = '$border';
    } else if (variant === 'secondary') {
      bg = '$secondary';
      textColor = '$color';
    } else if (variant === 'ghost') {
      bg = 'transparent';
      textColor = '$color';
    } else if (variant === 'link') {
      bg = 'transparent';
      textColor = '$primary';
      textDecoration = 'underline';
    }

    // Size mappings
    let height: number | undefined = 40;
    let px: string | undefined = '$4';
    let py: string | undefined = '$2';
    let width: number | undefined = undefined;

    if (size === 'sm') {
      height = 36;
      px = '$3';
      py = '$1.5';
    } else if (size === 'lg') {
      height = 44;
      px = '$8';
      py = '$3';
    } else if (size === 'icon') {
      height = 40;
      width = 40;
      px = undefined;
      py = undefined;
    }

    return (
      <TamaguiButton
        ref={ref}
        backgroundColor={bg}
        borderWidth={borderWidth}
        borderColor={borderColor}
        height={height}
        width={width}
        paddingHorizontal={px}
        paddingVertical={py}
        borderRadius={8}
        pressStyle={{
          opacity: 0.8,
          backgroundColor: variant === 'ghost' || variant === 'link' || variant === 'outline'
            ? '$secondary'
            : undefined,
        }}
        disabledStyle={{
          opacity: 0.5,
        }}
        {...props as any}
      >
        {typeof children === 'string' ? (
          <Text
            fontFamily="$body"
            fontWeight="600"
            fontSize={14}
            color={textColor}
            style={{
              textDecorationLine: textDecoration,
            }}
          >
            {children}
          </Text>
        ) : (
          children
        )}
      </TamaguiButton>
    );
  }
);

Button.displayName = 'Button';
