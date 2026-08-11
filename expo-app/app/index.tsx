import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../store/authStore';

export default function IndexGateway() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const isHydrated = useAuthStore(state => state.isHydrated);
  const router = useRouter();

  useEffect(() => {
    // Deciding before rehydration would flash the landing page at users who
    // already have a stored session.
    if (!isHydrated) return;

    if (isAuthenticated) {
      router.replace('/(tabs)');
    } else {
      router.replace('/landing');
    }
  }, [isHydrated, isAuthenticated]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' }}>
      <ActivityIndicator size="large" color="#FF3E00" />
    </View>
  );
}
