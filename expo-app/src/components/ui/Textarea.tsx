import React from 'react';
import { TextInput } from 'react-native';
import { TextArea as TamaguiTextArea, TextAreaProps as TamaguiTextAreaProps, useTheme } from 'tamagui';

export interface TextareaProps extends TamaguiTextAreaProps {}

export const Textarea = React.forwardRef<TextInput, TextareaProps>(
  (props, ref) => {
    const theme = useTheme();
    const isDark = theme.name?.toString().startsWith('dark');
    const sunkenBg = isDark ? '#050505' : 'rgba(0, 0, 0, 0.05)';
    const placeholderColor = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';

    return (
      <TamaguiTextArea
        ref={ref}
        minHeight={80}
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

Textarea.displayName = 'Textarea';
