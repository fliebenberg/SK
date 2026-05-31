import '../global.css';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { useActiveTheme } from '../store/settingsStore';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Orbitron_400Regular, Orbitron_700Bold } from '@expo-google-fonts/orbitron';
import { Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { wsService } from '../services/websocket';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../store/authStore';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    Orbitron_400Regular,
    Orbitron_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const verifySession = useAuthStore(state => state.verifySession);

  useEffect(() => {
    async function prepare() {
      if (loaded) {
        try {
          // Check persistent auth token and fetch fresh user profile if present
          await verifySession();
        } catch (error) {
          console.warn('[RootLayout] Error verifying session on mount:', error);
        } finally {
          SplashScreen.hideAsync();
          wsService.connect();
        }
      }
    }
    prepare();
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeManager>
      <Stack screenOptions={{
        headerStyle: {
          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
        },
        headerTitleStyle: {
          color: isDark ? '#FFFFFF' : '#0F172A',
          fontFamily: 'Orbitron_700Bold',
        },
        headerTintColor: isDark ? '#FFFFFF' : '#0F172A',
      }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="landing" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </ThemeManager>
  );
}

function ThemeManager({ children }: { children: React.ReactNode }) {
  const activeTheme = useActiveTheme();
  const { setColorScheme } = useColorScheme();
  const isDark = activeTheme === 'dark';

  useEffect(() => {
    setColorScheme(activeTheme);
  }, [activeTheme, setColorScheme]);

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {children}
    </ThemeProvider>
  );
}

