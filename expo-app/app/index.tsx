import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../store/authStore';


import { useActiveTheme } from '../store/settingsStore';
import { themeColor } from '../constants/Colors';
export default function IndexGateway() {
  const isDark = useActiveTheme() === 'dark';
  const isHydrated = useAuthStore(state => state.isHydrated);
  const router = useRouter();

  useEffect(() => {
    // Home is the same page for everyone (`HOME-1`), and shows the signed-out version until the
    // stored session is read back — so wait for that rather than flash the hero at a member.
    if (!isHydrated) return;
    router.replace('/(tabs)');
  }, [isHydrated]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: themeColor(isDark, 'canvas') }}>
      <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
    </View>
  );
}
