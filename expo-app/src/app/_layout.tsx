import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { TamaguiProvider } from 'tamagui';
import { useFonts, Orbitron_400Regular, Orbitron_700Bold, Orbitron_900Black } from '@expo-google-fonts/orbitron';
import * as SplashScreen from 'expo-splash-screen';
import { Slot, usePathname, useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import tamaguiConfig from '../tamagui.config';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { Navbar } from '@/components/Navbar';

// Prevent auto-hiding of splash screen
SplashScreen.preventAutoHideAsync().catch(() => {});

function AppContent() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const isAuthRoute = pathname === '/login' || pathname === '/signup';
    const isProtectedRoute = pathname.startsWith('/admin') || pathname === '/profile' || pathname === '/notifications';

    if (isAuthenticated && isAuthRoute) {
      // Redirect authenticated users away from login/signup to homepage
      router.replace('/');
    } else if (!isAuthenticated && isProtectedRoute) {
      // Redirect unauthenticated users away from protected screens to login
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  const isAuthRoute = pathname === '/login' || pathname === '/signup';

  if (isAuthRoute) {
    // Render full-page content without tabs for login/signup
    return <Slot />;
  }

  // Render main navigation shell with tabs for dashboard/explore/etc.
  return (
    <>
      <Navbar />
      <AppTabs />
    </>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    OrbitronRegular: Orbitron_400Regular,
    OrbitronBold: Orbitron_700Bold,
    OrbitronBlack: Orbitron_900Black,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <TamaguiProvider config={tamaguiConfig} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AuthProvider>
            <AnimatedSplashOverlay />
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </TamaguiProvider>
    </SafeAreaProvider>
  );
}

