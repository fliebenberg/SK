import React from 'react';
import { ScrollView } from 'react-native';
import { YStack, XStack, Text, YStackProps, XStackProps } from 'tamagui';

export const Table = React.forwardRef<any, YStackProps>(({ children, ...props }, ref) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%' }}>
    <YStack ref={ref} minWidth={600} width="100%" {...props}>
      {children}
    </YStack>
  </ScrollView>
));
Table.displayName = 'Table';

export const TableHeader = React.forwardRef<any, YStackProps>(({ children, ...props }, ref) => (
  <YStack ref={ref} borderBottomWidth={1} borderBottomColor="$border" {...props}>
    {children}
  </YStack>
));
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<any, YStackProps>(({ children, ...props }, ref) => (
  <YStack ref={ref} {...props}>
    {children}
  </YStack>
));
TableBody.displayName = 'TableBody';

export const TableFooter = React.forwardRef<any, YStackProps>(({ children, ...props }, ref) => (
  <YStack ref={ref} borderTopWidth={1} borderTopColor="$border" backgroundColor="$muted" {...props}>
    {children}
  </YStack>
));
TableFooter.displayName = 'TableFooter';

export const TableRow = React.forwardRef<any, XStackProps>(({ children, ...props }, ref) => (
  <XStack
    ref={ref}
    flexDirection="row"
    alignItems="center"
    borderBottomWidth={1}
    borderBottomColor="$border"
    py="$2.5"
    {...props as any}
  >
    {children}
  </XStack>
));
TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef<any, XStackProps>(({ children, ...props }, ref) => (
  <XStack ref={ref} flex={1} px="$4" alignItems="center" {...props as any}>
    {typeof children === 'string' ? (
      <Text fontFamily="$body" fontWeight="600" fontSize={13} color="$muted-foreground">
        {children}
      </Text>
    ) : (
      children
    )}
  </XStack>
));
TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef<any, XStackProps>(({ children, ...props }, ref) => (
  <XStack ref={ref} flex={1} px="$4" alignItems="center" {...props as any}>
    {typeof children === 'string' ? (
      <Text fontFamily="$body" fontSize={13} color="$color">
        {children}
      </Text>
    ) : (
      children
    )}
  </XStack>
));
TableCell.displayName = 'TableCell';

export const TableCaption = React.forwardRef<any, YStackProps>(({ children, ...props }, ref) => (
  <YStack ref={ref} py="$3" alignItems="center" {...props}>
    {typeof children === 'string' ? (
      <Text fontFamily="$body" fontSize={12} color="$muted-foreground">
        {children}
      </Text>
    ) : (
      children
    )}
  </YStack>
));
TableCaption.displayName = 'TableCaption';
