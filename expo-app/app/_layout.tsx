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
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { wsService } from '../services/websocket';
import { loadAssetConfig } from '../services/assets';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../store/authStore';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { useUnsavedChangesStore } from '../store/unsavedChangesStore';
import { OfflineBanner } from '../components/OfflineBanner';
import { SportsReadFailure } from '../components/SportsReadFailure';
import { RoomFailureNotice } from '../components/RoomFailure';
import { useLiveRoom } from '../hooks/useLiveRoom';
import { startResultQueue } from '../services/resultQueue';
import { startIdleDisconnect } from '../services/idleDisconnect';
import { useAppActive } from '../hooks/useAppActive';
import { ToastContainer } from '../components/ToastContainer';
import { View } from 'react-native';
import { themeColor } from '../constants/Colors';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    Orbitron_400Regular,
    Orbitron_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const verifySession = useAuthStore(state => state.verifySession);
  const { user, isAuthenticated, setMemberships, markMembershipsResolved } = useAuthStore();
  const isHydrated = useAuthStore(state => state.isHydrated);
  const appActive = useAppActive();

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

  // Tokens last 24–36 hours; renew well before, for an app left open. Not while it is hidden: nothing
  // reads on a timer then (live-data skill), and one that has been away long renews on its return.
  useEffect(() => {
    if (!isAuthenticated || !appActive) return;
    const timer = setInterval(() => { refreshAssetToken(); }, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated, appActive, refreshAssetToken]);

  // A hidden app lets go of its connection after a while, and takes it up again on return.
  useEffect(() => startIdleDisconnect(() => {
    if (useAuthStore.getState().isAuthenticated) useAuthStore.getState().refreshAssetToken();
  }), []);

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
          // Results entered offline are sent once connected (U20).
          startResultQueue();
        }
      }
    }
    prepare();
  }, [loaded, isHydrated, assetsReady]);

  // `user:{id}:memberships` — one room, one dataset (rule 4). It used to be `user:{id}`, which also
  // carried notifications and event capabilities, and the memberships themselves were read with a
  // `get_data` because the broadcast carried `{}` (`LIVE-15`). The join push is the load now, so
  // there is no query here at all. Each held copy is tagged with its room, so a change of user never
  // hands the last user's memberships to the next.
  const membershipsRoom = loaded && isAuthenticated && user?.id ? `user:${user.id}:memberships` : null;
  // rooms-ok: route guard — RoomFailureNotice says it; failure releases the guards
  const memberships = useLiveRoom<{ id: string; data: any }>(membershipsRoom, {
    reduce: message =>
      message.type === 'USER_MEMBERSHIPS_UPDATED'
        ? { kind: 'replace', items: [{ id: membershipsRoom!, data: message.data }] }
        : { kind: 'ignore' },
  });
  const heldMemberships = memberships.items[0]?.id === membershipsRoom ? memberships.items[0] : undefined;

  useEffect(() => {
    if (!heldMemberships) return;
    const data = heldMemberships.data;
    if (Array.isArray(data?.orgs)) {
      console.log(`[RootLayout] Memberships received.`);
      setMemberships(data.orgs, data.teams || [], data.dependants || []);
    } else {
      markMembershipsResolved();
    }
  }, [heldMemberships]);

  /**
   * Route guards block until memberships resolve, so a room that refuses or never answers has to
   * release them, or the app sits on its splash screen for ever. The room's own status says when
   * (`LIVE-25`), and `RoomFailureNotice` says why: nothing on this layout claims the room.
   */
  const membershipsFailed = !!memberships.failure;
  useEffect(() => {
    if (!membershipsRoom || !(memberships.accessDenied || membershipsFailed)) return;
    console.warn('[RootLayout] Memberships did not arrive. Releasing route guards.');
    markMembershipsResolved();
  }, [membershipsRoom, memberships.accessDenied, membershipsFailed]);

  if (!loaded || !imagesReady) {
    return null;
  }

  return (
    <ThemeManager>
      <Stack screenOptions={{
        headerStyle: {
          backgroundColor: themeColor(isDark, 'card'),
        },
        headerTitleStyle: {
          color: themeColor(isDark, 'ink'),
          fontFamily: 'Orbitron_700Bold',
        },
        headerTintColor: themeColor(isDark, 'ink'),
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
        <SportsReadFailure />
        <RoomFailureNotice />
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

