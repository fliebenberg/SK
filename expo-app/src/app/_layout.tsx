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

  console.log(`[AppContent] Render - pathname: "${pathname}", isAuthenticated: ${isAuthenticated}, isLoading: ${isLoading}`);

  useEffect(() => {
    if (isLoading) return;

    const isAuthRoute = pathname === '/login' || pathname === '/signup';
    const isProtectedRoute = pathname.startsWith('/admin') || pathname === '/profile' || pathname === '/notifications';

    console.log(`[AppContent useEffect] Checking routes - isAuthRoute: ${isAuthRoute}, isProtectedRoute: ${isProtectedRoute}`);

    if (isAuthenticated && isAuthRoute) {
      console.log(`[AppContent useEffect] Redirecting authenticated user away from auth route to "/"`);
      router.replace('/');
    } else if (!isAuthenticated && isProtectedRoute) {
      console.log(`[AppContent useEffect] Redirecting unauthenticated user away from protected route to "/login"`);
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  const isAuthRoute = pathname === '/login' || pathname === '/signup';

  if (isAuthRoute) {
    console.log(`[AppContent] Rendering auth route Slot for pathname: "${pathname}"`);
    return <Slot />;
  }

  console.log(`[AppContent] Rendering main navigation (Navbar + AppTabs) for pathname: "${pathname}"`);
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

