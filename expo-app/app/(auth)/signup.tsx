import { View, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { useActiveTheme } from '../../store/settingsStore';
import { useState } from 'react';

export default function SignupScreen() {
  const router = useRouter();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const placeholderColor = isDark ? '#94A3B8' : '#64748B';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignup = () => {
    // Scaffold: Proceed to login for now
    router.replace('/(auth)/login');
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900 justify-center p-6">
      <Text className="font-orbitron text-3xl text-brand-orange mb-6 text-center tracking-widest">
        CREATE ACCOUNT
      </Text>
      
      <GlassCard className="gap-4">
        <View>
          <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">Full Name</Text>
          <TextInput 
            className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 font-inter"
            placeholder="John Doe"
            placeholderTextColor={placeholderColor}
            value={name}
            onChangeText={setName}
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
          />
        </View>

        <Button 
          title="Sign Up" 
          variant="primary" 
          onPress={handleSignup}
          className="mt-4"
        />
        
        <Button 
          title="Already have an account? Login" 
          variant="ghost" 
          onPress={() => router.push('/(auth)/login')}
        />
      </GlassCard>
    </View>
  );
}
