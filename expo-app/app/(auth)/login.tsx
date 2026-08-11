import { View, Text, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { useAuthStore } from '../../store/authStore';
import { useActiveTheme } from '../../store/settingsStore';
import { apiService } from '../../services/api';
import { useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useSafeBack } from '../../hooks/useSafeBack';

export default function LoginScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  // Set by AuthGuard when it intercepts a protected route.
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  // Only ever return to an in-app path, never to an absolute URL.
  const redirectTarget = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : null;
  const login = useAuthStore(state => state.login);
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const placeholderColor = isDark ? '#94A3B8' : '#64748B';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await apiService.login(email.trim(), password);
      login(response.token, response.user);

      // Check for pending claim token stored during unauthenticated claim link access
      let pendingToken = null;
      try {
        if (Platform.OS === 'web') {
          pendingToken = localStorage.getItem('pendingClaimToken');
          if (pendingToken) localStorage.removeItem('pendingClaimToken');
        } else {
          pendingToken = await SecureStore.getItemAsync('pendingClaimToken');
          if (pendingToken) await SecureStore.deleteItemAsync('pendingClaimToken');
        }
      } catch (e) {
        console.error('Failed to retrieve pendingClaimToken:', e);
      }

      if (pendingToken) {
        router.replace({ pathname: '/claim', params: { token: pendingToken } });
      } else if (redirectTarget) {
        router.replace(redirectTarget as any);
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg === 'FORCE_PASSWORD_RESET') {
        router.push(`/(auth)/reset-password?forceReset=true&tempToken=${err.tempToken}`);
        return;
      }
      if (msg === 'EMAIL_NOT_FOUND') {
        setError("This email isn't registered. If you used Google to sign up, please sign in via the web app.");
      } else if (msg === 'PASSWORD_MISMATCH') {
        setError("The password you entered is incorrect. Please check your credentials and try again.");
      } else if (msg === 'SOCIAL_ONLY') {
        setError("This account is registered via Google OAuth. Please sign in via the web app.");
      } else {
        setError(msg || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900 justify-center p-6">
      <View className="w-full max-w-md self-center">
        <Text className="font-orbitron-bold text-3xl text-brand-orange mb-6 text-center tracking-widest">
          LOGIN
        </Text>
        
        <GlassCard className="gap-4">
          {error ? (
            <View className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg p-4">
              <Text className="text-red-800 dark:text-red-200 font-inter-bold text-sm mb-1">
                Sign In Failed
              </Text>
              <Text className="text-red-700 dark:text-red-300 font-inter text-xs leading-relaxed">
                {error}
              </Text>
            </View>
          ) : null}

          <View>
            <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">Email</Text>
            <TextInput 
              className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 font-inter"
              placeholder="Enter your email"
              placeholderTextColor={placeholderColor}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!isLoading}
            />
          </View>
          
          <View>
            <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">Password</Text>
            <TextInput 
              className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 font-inter"
              placeholder="Enter your password"
              placeholderTextColor={placeholderColor}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!isLoading}
            />
          </View>

          {isLoading ? (
            <View className="py-4 items-center justify-center">
              <ActivityIndicator size="large" color="#FF3E00" />
            </View>
          ) : (
            <>
              <Button 
                title="Login" 
                variant="primary" 
                onPress={handleLogin}
                className="mt-4"
              />
              
              <Button 
                title="Forgot Password?" 
                variant="ghost" 
                onPress={() => router.push('/(auth)/forgot-password')}
              />

              <Button 
                title="Don't have an account? Sign Up" 
                variant="ghost" 
                onPress={() => router.replace('/(auth)/signup')}
              />
              
              <Button 
                title="Back to Home" 
                variant="ghost" 
                onPress={() => safeBack('/landing')}
              />
            </>
          )}
        </GlassCard>
      </View>
    </View>
  );
}
