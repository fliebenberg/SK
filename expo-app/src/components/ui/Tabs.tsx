import React, { createContext, useContext, useState, useEffect } from 'react';
import { YStack, XStack, Text, YStackProps, XStackProps } from 'tamagui';
import { Pressable } from 'react-native';

const TabsContext = createContext<{
  activeTab?: string;
  setActiveTab: (value: string) => void;
}>({
  setActiveTab: () => {},
});

export interface TabsProps extends YStackProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

export const Tabs = React.forwardRef<any, TabsProps>(
  ({ defaultValue, value, onValueChange, children, ...props }, ref) => {
    const [activeTab, setActiveTab] = useState(value || defaultValue);

    useEffect(() => {
      if (value !== undefined) {
        setActiveTab(value);
      }
    }, [value]);

    const handleValueChange = (newValue: string) => {
      if (value === undefined) {
        setActiveTab(newValue);
      }
      onValueChange?.(newValue);
    };

    return (
      <TabsContext.Provider value={{ activeTab, setActiveTab: handleValueChange }}>
        <YStack ref={ref} width="100%" {...props}>
          {children}
        </YStack>
      </TabsContext.Provider>
    );
  }
);

Tabs.displayName = 'Tabs';

export interface TabsListProps extends XStackProps {}

export const TabsList = React.forwardRef<any, TabsListProps>(
  ({ children, style, ...props }, ref) => {
    return (
      <XStack
        ref={ref}
        flexDirection="row"
        alignSelf="flex-start"
        alignItems="center"
        justifyContent="center"
        borderRadius={8}
        backgroundColor="$border" // Neutral muted grey in light/dark themes
        padding={4}
        gap={4}
        {...props as any}
      >
        {children}
      </XStack>
    );
  }
);

TabsList.displayName = 'TabsList';

export interface TabsTriggerProps extends XStackProps {
  value: string;
}

export const TabsTrigger = React.forwardRef<any, TabsTriggerProps>(
  ({ value, children, style, ...props }, ref) => {
    const { activeTab, setActiveTab } = useContext(TabsContext);
    const isActive = activeTab === value;

    return (
      <Pressable
        onPress={() => setActiveTab(value)}
        style={({ pressed }) => [
          {
            opacity: pressed ? 0.8 : 1,
          },
          style as any,
        ]}
      >
        <XStack
          ref={ref}
          alignItems="center"
          justifyContent="center"
          px="$3"
          py="$1.5"
          borderRadius={6}
          backgroundColor={isActive ? '$background' : 'transparent'}
          shadowColor={isActive ? '#000' : 'transparent'}
          shadowOffset={{ width: 0, height: 1 }}
          shadowOpacity={isActive ? 0.15 : 0}
          shadowRadius={1.5}
          elevation={isActive ? 1 : 0}
          {...props as any}
        >
          {typeof children === 'string' ? (
            <Text
              fontFamily="$body"
              fontWeight="600"
              fontSize={14}
              color={isActive ? '$color' : '$muted-foreground'}
            >
              {children}
            </Text>
          ) : (
            children
          )}
        </XStack>
      </Pressable>
    );
  }
);

TabsTrigger.displayName = 'TabsTrigger';

export interface TabsContentProps extends YStackProps {
  value: string;
}

export const TabsContent = React.forwardRef<any, TabsContentProps>(
  ({ value, children, ...props }, ref) => {
    const { activeTab } = useContext(TabsContext);

    if (activeTab !== value) return null;

    return (
      <YStack ref={ref} marginTop="$2" {...props}>
        {children}
      </YStack>
    );
  }
);

TabsContent.displayName = 'TabsContent';
