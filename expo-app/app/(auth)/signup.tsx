import { View, Text, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { useActiveTheme } from '../../store/settingsStore';
import { useAuthStore } from '../../store/authStore';
import { apiService } from '../../services/api';
import { useState } from 'react';

export default function SignupScreen() {
  const router = useRouter();
  const login = useAuthStore(state => state.login);
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const placeholderColor = isDark ? '#94A3B8' : '#64748B';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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
      login(response.token, response.user);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900 justify-center p-6">
      <View className="w-full max-w-md mx-auto">
        <Text className="font-orbitron-bold text-3xl text-brand-orange mb-6 text-center tracking-widest">
          CREATE ACCOUNT
        </Text>
        
        <GlassCard className="gap-4">
          {error ? (
            <View className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg p-4">
              <Text className="text-red-800 dark:text-red-200 font-inter-bold text-sm mb-1">
                Registration Failed
              </Text>
              <Text className="text-red-700 dark:text-red-300 font-inter text-xs leading-relaxed">
                {error}
              </Text>
            </View>
          ) : null}

          <View>
            <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">Full Name</Text>
            <TextInput 
              className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 font-inter"
              placeholder="John Doe"
              placeholderTextColor={placeholderColor}
              value={name}
              onChangeText={setName}
              editable={!isLoading}
            />
          </View>

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
              placeholder="Create a password"
              placeholderTextColor={placeholderColor}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!isLoading}
            />
          </View>

          <View>
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-slate-600 dark:text-slate-400 font-inter">Confirm Password</Text>
              {confirmPassword ? (
                password === confirmPassword ? (
                  <Text className="text-emerald-500 font-inter-bold text-xs uppercase tracking-wider">Matched</Text>
                ) : (
                  <Text className="text-red-500 font-inter-bold text-xs uppercase tracking-wider">Unmatched</Text>
                )
              ) : null}
            </View>
            <TextInput 
              className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 font-inter"
              placeholder="Confirm your password"
              placeholderTextColor={placeholderColor}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
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
                title="Sign Up" 
                variant="primary" 
                onPress={handleSignup}
                className="mt-2"
              />
              
              <Button 
                title="Already have an account? Login" 
                variant="ghost" 
                onPress={() => router.push('/(auth)/login')}
              />
            </>
          )}
        </GlassCard>
      </View>
    </View>
  );
}
