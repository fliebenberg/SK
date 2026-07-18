import React, { useState, useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResponsiveHeader } from './ResponsiveHeader';
import { LeftNavigationRail } from './LeftNavigationRail';
import { getThemeColor } from '../constants';
import { useActiveTheme } from '../store/settingsStore';

interface ResponsivePageLayoutProps {
  children: React.ReactNode;
}

export function ResponsivePageLayout({ children }: ResponsivePageLayoutProps) {
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(false);
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLargeScreen = mounted && width >= 768;

  if (isLargeScreen) {
    return (
      <View className="flex-1 flex-row bg-slate-50 dark:bg-slate-950">
        <LeftNavigationRail />
        <View className="flex-1 h-full bg-slate-50 dark:bg-slate-950">
          {children}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: getThemeColor(isDark, 'background') }} className="bg-slate-50 dark:bg-slate-950">
      <ResponsiveHeader showNav={true} />
      {children}
    </SafeAreaView>
  );
}
