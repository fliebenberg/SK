import React from 'react';
import { TextInput } from 'react-native';
import { Input as TamaguiInput, InputProps as TamaguiInputProps, useTheme } from 'tamagui';

export interface InputProps extends TamaguiInputProps {}

export const Input = React.forwardRef<TextInput, InputProps>(
  ({ style, ...props }, ref) => {
    const theme = useTheme();
    const isDark = theme.name?.toString().startsWith('dark');
    const sunkenBg = isDark ? '#050505' : 'rgba(0, 0, 0, 0.05)';
    const placeholderColor = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';

    return (
      <TamaguiInput
        ref={ref}
        height={40}
        width="100%"
        borderRadius={8}
        borderWidth={1}
        borderColor="$border"
        backgroundColor={sunkenBg}
        px="$3"
        py="$2"
        color="$color"
        fontSize={14}
        placeholderTextColor={placeholderColor as any}
        focusStyle={{
          borderColor: '$primary',
          borderWidth: 1.5,
        }}
        hoverStyle={{
          borderColor: '$border',
        }}
        disabledStyle={{
          opacity: 0.5,
        }}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
