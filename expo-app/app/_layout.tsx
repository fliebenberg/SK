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
import { useWsStore } from '../store/wsStore';
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
  const { user, isAuthenticated, setMemberships } = useAuthStore();
  const isConnected = useWsStore(state => state.isConnected);

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

  useEffect(() => {
    if (loaded && isConnected && isAuthenticated && user?.id) {
      console.log(`[RootLayout] User authenticated and WS connected. Joining room user:${user.id}`);
      const room = `user:${user.id}`;
      const unsubscribe = wsService.subscribeToRoom(room);

      const fetchMemberships = () => {
        wsService.emit('get_data', { type: 'user_memberships', id: user.id }, (res: any) => {
          if (res) {
            console.log(`[RootLayout] Fetched memberships:`, res);
            setMemberships(res.orgs, res.teams);
          } else {
            console.warn(`[RootLayout] Failed to fetch memberships`);
          }
        });
      };

      fetchMemberships();

      const handleUpdate = (update: any) => {
        if (update && update.type === 'USER_MEMBERSHIPS_UPDATED') {
          console.log(`[RootLayout] Live memberships update received. Re-fetching...`);
          fetchMemberships();
        }
      };

      wsService.on('update', handleUpdate);

      return () => {
        unsubscribe();
        wsService.off('update', handleUpdate);
      };
    }
  }, [loaded, isConnected, isAuthenticated, user?.id]);

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
        <Stack.Screen name="admin/[orgId]" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
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

