import { View, Text, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { PasswordInput } from '../../components/PasswordInput';
import { useActiveTheme } from '../../store/settingsStore';
import { useAuthStore } from '../../store/authStore';
import { apiService } from '../../services/api';
import { useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { themeColor } from '../../constants/Colors';

export default function SignupScreen() {
  const router = useRouter();
  // An invite from an organisation links here with the invited address: signing up with it is
  // what links the new account to the person's profile there.
  const { email: invitedEmail } = useLocalSearchParams<{ email?: string }>();
  const login = useAuthStore(state => state.login);
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const placeholderColor = themeColor(isDark, 'ink-muted');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(typeof invitedEmail === 'string' ? invitedEmail : '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async () => {
    // Basic validation
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await apiService.signup(
        name.trim(),
        email.trim().toLowerCase(),
        password
      );
      
      // Auto-login upon successful registration
      login(response.token, response.user, response.assetToken);
      
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
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-canvas justify-center p-6">
      <View className="w-full max-w-md self-center">
        <Text className="font-orbitron-bold text-3xl text-primary-ink mb-6 text-center tracking-widest">
          CREATE ACCOUNT
        </Text>
        
        <GlassCard className="gap-4">
          {error ? (
            <View className="bg-danger-soft border border-danger-line rounded-lg p-4">
              <Text className="text-danger-ink font-inter-bold text-sm mb-1">
                Registration Failed
              </Text>
              <Text className="text-danger-ink font-inter text-xs leading-relaxed">
                {error}
              </Text>
            </View>
          ) : null}

          <View>
            <Text className="text-ink-muted font-inter mb-2">Full Name</Text>
            <TextInput 
              className="bg-sunken text-ink border border-line rounded-lg p-4 font-inter"
              placeholder="John Doe"
              placeholderTextColor={placeholderColor}
              value={name}
              onChangeText={setName}
              editable={!isLoading}
            />
          </View>

          <View>
            <Text className="text-ink-muted font-inter mb-2">Email</Text>
            <TextInput 
              className="bg-sunken text-ink border border-line rounded-lg p-4 font-inter"
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
            <Text className="text-ink-muted font-inter mb-2">Password</Text>
            <PasswordInput
              purpose="new"
              className="bg-sunken text-ink border border-line rounded-lg p-4 font-inter"
              placeholder="Create a password"
              placeholderTextColor={placeholderColor}
              value={password}
              onChangeText={setPassword}
              editable={!isLoading}
            />
          </View>

          <View>
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-ink-muted font-inter">Confirm Password</Text>
              {confirmPassword ? (
                password === confirmPassword ? (
                  <Text className="text-success-ink font-inter-bold text-xs uppercase tracking-wider">Matched</Text>
                ) : (
                  <Text className="text-danger-ink font-inter-bold text-xs uppercase tracking-wider">Unmatched</Text>
                )
              ) : null}
            </View>
            <PasswordInput
              purpose="new"
              className="bg-sunken text-ink border border-line rounded-lg p-4 font-inter"
              placeholder="Confirm your password"
              placeholderTextColor={placeholderColor}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!isLoading}
            />
          </View>

          {isLoading ? (
            <View className="py-4 items-center justify-center">
              <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
            </View>
          ) : (
            <>
              <Button 
                title="Sign Up" 
                variant="primary" 
                onPress={handleSignup}
                className="mt-2"
              />
              
              <Button 
                title="Already have an account? Login" 
                variant="ghost" 
                onPress={() => router.replace('/(auth)/login')}
              />
            </>
          )}
        </GlassCard>
      </View>
    </View>
  );
}
