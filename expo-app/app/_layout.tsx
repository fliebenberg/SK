import '../global.css';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});
import { useColorScheme } from 'nativewind';
import { useActiveTheme } from '../store/settingsStore';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Orbitron_400Regular, Orbitron_700Bold } from '@expo-google-fonts/orbitron';
import { Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { wsService } from '../services/websocket';
import { loadAssetConfig } from '../services/assets';
import { useWsStore } from '../store/wsStore';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../store/authStore';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { useUnsavedChangesStore } from '../store/unsavedChangesStore';
import { OfflineBanner } from '../components/OfflineBanner';
import { ToastContainer } from '../components/ToastContainer';
import { View } from 'react-native';

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
  const { user, isAuthenticated, setMemberships, markMembershipsResolved } = useAuthStore();
  const isHydrated = useAuthStore(state => state.isHydrated);
  const isConnected = useWsStore(state => state.isConnected);

  // Where uploaded images are served from comes from the server (MEDIA-1). Nothing that shows an
  // image renders until it is known; loadAssetConfig never throws and gives up after a few seconds.
  const [assetsReady, setAssetsReady] = useState(false);
  useEffect(() => {
    loadAssetConfig().finally(() => setAssetsReady(true));
  }, []);

  // People's pictures need the asset token, and a screen that rendered without one would not
  // re-render when it arrived. So a restored session whose stored token has expired waits for
  // verifySession, which brings a fresh one; a session with a valid token renders straight away.
  const isSessionVerified = useAuthStore(state => state.isSessionVerified);
  const assetToken = useAuthStore(state => state.assetToken);
  const refreshAssetToken = useAuthStore(state => state.refreshAssetToken);
  const [launchedAt] = useState(Date.now);
  const needsFreshAssetToken = isAuthenticated && !(assetToken && assetToken.expiresAt - launchedAt > 60 * 60 * 1000);
  const imagesReady = assetsReady && isHydrated && (isSessionVerified || !needsFreshAssetToken);

  // Tokens last 24–36 hours; renew well before, for an app left open.
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setInterval(() => { refreshAssetToken(); }, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated, refreshAssetToken]);

  useEffect(() => {
    async function prepare() {
      // Wait for rehydration: verifying first would read a null token and clear
      // the session that storage is about to restore.
      if (loaded && isHydrated && assetsReady) {
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
  }, [loaded, isHydrated, assetsReady]);

  useEffect(() => {
    if (loaded && isConnected && isAuthenticated && user?.id) {
      // `user:{id}:memberships` — one room, one dataset (rule 4). It used to be `user:{id}`,
      // which also carried notifications and event capabilities, and the memberships themselves
      // were read with a `get_data` because the broadcast carried `{}` (`LIVE-15`). The join push
      // is the load now, so there is no query here at all.
      const room = `user:${user.id}:memberships`;
      console.log(`[RootLayout] User authenticated and WS connected. Joining room ${room}`);

      /**
       * Route guards block until memberships resolve, and a room push has no ack and no timeout —
       * so unlike a query there is nothing to fail. A refused join has to release them explicitly,
       * and so does a push that simply never arrives, or the app sits on its splash screen forever.
       */
      const releaseGuards = setTimeout(() => {
        console.warn('[RootLayout] No membership push within 10s. Releasing route guards.');
        markMembershipsResolved();
      }, 10000);

      const handleUpdate = (update: any) => {
        if (!update || update.topic !== room) return;
        if (update.type === 'ROOM_ACCESS_DENIED' || update.type === 'ROOM_ACCESS_REVOKED') {
          clearTimeout(releaseGuards);
          markMembershipsResolved();
          return;
        }
        if (update.type !== 'USER_MEMBERSHIPS_UPDATED') return;
        clearTimeout(releaseGuards);
        if (Array.isArray(update.data?.orgs)) {
          console.log(`[RootLayout] Memberships received.`);
          setMemberships(update.data.orgs, update.data.teams || []);
        } else {
          markMembershipsResolved();
        }
      };

      wsService.on('update', handleUpdate);
      const unsubscribe = wsService.subscribeToRoom(room, handleUpdate);

      return () => {
        clearTimeout(releaseGuards);
        unsubscribe();
        wsService.off('update', handleUpdate);
      };
    }
  }, [loaded, isConnected, isAuthenticated, user?.id]);

  if (!loaded || !imagesReady) {
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
        <Stack.Screen name="claim/index" options={{ headerShown: false }} />
        <Stack.Screen name="claim/decline" options={{ headerShown: false }} />
        <Stack.Screen name="claim/refer" options={{ headerShown: false }} />
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
  const { showDialog, confirmDiscard, cancelDiscard } = useUnsavedChangesStore();

  useEffect(() => {
    setColorScheme(activeTheme);
  }, [activeTheme, setColorScheme]);

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <View className="flex-1">
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <OfflineBanner />
        {children}
        <ToastContainer />
      </View>
      <ConfirmationModal
        isOpen={showDialog}
        onClose={cancelDiscard}
        title="Unsaved Changes"
        description="You have unsaved changes that will be lost if you leave. Do you want to discard them?"
        onConfirm={confirmDiscard}
        confirmText="Discard & Leave"
        cancelText="Stay"
        variant="danger"
      />
    </ThemeProvider>
  );
}

