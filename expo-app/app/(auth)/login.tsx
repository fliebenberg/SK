import { View, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { useAuthStore } from '../../store/authStore';
import { useActiveTheme } from '../../store/settingsStore';
import { useState } from 'react';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore(state => state.login);
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const placeholderColor = isDark ? '#94A3B8' : '#64748B';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    // Scaffold: Mock successful login
    login('mock-jwt-token', {
      id: '1',
      name: 'Test User',
      email: email || 'test@example.com',
      globalRole: 'user'
    });
    router.replace('/(tabs)');
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900 justify-center p-6">
      <View className="w-full max-w-md mx-auto">
        <Text className="font-orbitron-bold text-3xl text-brand-orange mb-6 text-center tracking-widest">
          LOGIN
        </Text>
        
        <GlassCard className="gap-4">
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
            />
          </View>

          <Button 
            title="Login" 
            variant="primary" 
            onPress={handleLogin}
            className="mt-4"
          />
          
          <Button 
            title="Back to Home" 
            variant="ghost" 
            onPress={() => router.back()}
          />
        </GlassCard>
      </View>
    </View>
  );
}
