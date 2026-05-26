import { View, Text } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Button } from '../components/Button';
import { useAuthStore } from '../store/authStore';
import { useEffect } from 'react';

export default function LandingPage() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  return (
    <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
      <Text className="font-orbitron-bold text-3xl sm:text-4xl md:text-5xl text-brand-orange tracking-widest mb-4 text-center">
        SCOREKEEPER
      </Text>
      <Text className="font-inter text-slate-600 dark:text-slate-400 text-base sm:text-lg text-center mb-12">
        Manage your sports organization and follow live games in real-time.
      </Text>
      
      <View className="w-full max-w-sm gap-4">
        <Button 
          title="Login" 
          variant="primary" 
          onPress={() => router.push('/(auth)/login')} 
        />
        <Button 
          title="Create Account" 
          variant="secondary" 
          onPress={() => router.push('/(auth)/signup')} 
        />
        <Link href="/(tabs)" asChild>
          <Button 
            title="Browse Live Games" 
            variant="ghost" 
            className="mt-4"
          />
        </Link>
      </View>
    </View>
  );
}
