import { View, Text, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { useActiveTheme } from '../../store/settingsStore';
import { apiService } from '../../services/api';
import { useState } from 'react';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const placeholderColor = isDark ? '#94A3B8' : '#64748B';
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestRecovery = async () => {
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await apiService.requestForgotPassword(email.trim());
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900 justify-center p-6">
      <View className="w-full max-w-md mx-auto">
        <Text className="font-orbitron-bold text-3xl text-brand-orange mb-6 text-center tracking-widest">
          RECOVER
        </Text>
        
        <GlassCard className="gap-4">
          {success ? (
            <View className="gap-4">
              <View className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-lg p-4">
                <Text className="text-emerald-800 dark:text-emerald-200 font-inter-bold text-sm mb-1">
                  Request Dispatched
                </Text>
                <Text className="text-emerald-700 dark:text-emerald-300 font-inter text-xs leading-relaxed">
                  If this email is associated with a ScoreKeeper account, you will receive a secure 6-digit passcode in your inbox shortly.
                </Text>
              </View>

              <Button 
                title="Enter Recovery Code" 
                variant="primary" 
                onPress={() => router.replace(`/(auth)/reset-password?email=${encodeURIComponent(email.trim())}`)}
                className="mt-2"
              />

              <Button 
                title="Back to Login" 
                variant="ghost" 
                onPress={() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace('/(auth)/login');
                  }
                }}
              />
            </View>
          ) : (
            <>
              {error ? (
                <View className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg p-4">
                  <Text className="text-red-800 dark:text-red-200 font-inter-bold text-sm mb-1">
                    Recovery Failed
                  </Text>
                  <Text className="text-red-700 dark:text-red-300 font-inter text-xs leading-relaxed">
                    {error}
                  </Text>
                </View>
              ) : null}

              <View>
                <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">Email Address</Text>
                <TextInput 
                  className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 font-inter"
                  placeholder="Enter registered email"
                  placeholderTextColor={placeholderColor}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
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
                    title="Send Recovery Instructions" 
                    variant="primary" 
                    onPress={handleRequestRecovery}
                    className="mt-4"
                  />
                  
                  <Button 
                    title="Back to Login" 
                    variant="ghost" 
                    onPress={() => router.back()}
                  />
                </>
              )}
            </>
          )}
        </GlassCard>
      </View>
    </View>
  );
}
