import React from 'react';
import { XStack, Text, XStackProps } from 'tamagui';

export interface BadgeProps extends XStackProps {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  children,
  ...props
}) => {
  // Styles tailored to the selected variant
  let bg = '$primary';
  let color = '$background';
  let borderWidth = 0;
  let borderColor = 'transparent';

  if (variant === 'secondary') {
    bg = '$secondary';
    color = '$color';
  } else if (variant === 'destructive') {
    bg = '$red10';
    color = '#ffffff';
  } else if (variant === 'outline') {
    bg = 'transparent';
    color = '$color';
    borderWidth = 1;
    borderColor = '$border';
  }

  return (
    <XStack
      alignSelf="flex-start"
      alignItems="center"
      justifyContent="center"
      backgroundColor={bg}
      borderRadius={100}
      px="$2.5"
      py="$0.5"
      borderWidth={borderWidth}
      borderColor={borderColor}
      {...props}
    >
      <Text
        fontSize={11}
        fontWeight="600"
        color={color}
        letterSpacing={0.5}
      >
        {children}
      </Text>
    </XStack>
  );
};
