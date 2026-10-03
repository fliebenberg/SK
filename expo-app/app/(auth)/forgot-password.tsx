import { View, Text, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { useActiveTheme } from '../../store/settingsStore';
import { apiService } from '../../services/api';
import { useState } from 'react';
import { useSafeBack } from '../../hooks/useSafeBack';
import { themeColor } from '../../constants/Colors';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const placeholderColor = themeColor(isDark, 'ink-muted');
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
    <View className="flex-1 bg-canvas justify-center p-6">
      <View className="w-full max-w-md self-center">
        <Text className="font-orbitron-bold text-3xl text-primary-ink mb-6 text-center tracking-widest">
          RECOVER
        </Text>
        
        <GlassCard className="gap-4">
          {success ? (
            <View className="gap-4">
              <View className="bg-success-soft border border-success-line rounded-lg p-4">
                <Text className="text-success-ink font-inter-bold text-sm mb-1">
                  Request Dispatched
                </Text>
                <Text className="text-success-ink font-inter text-xs leading-relaxed">
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
                onPress={() => safeBack('/(auth)/login')}
              />
            </View>
          ) : (
            <>
              {error ? (
                <View className="bg-danger-soft border border-danger-line rounded-lg p-4">
                  <Text className="text-danger-ink font-inter-bold text-sm mb-1">
                    Recovery Failed
                  </Text>
                  <Text className="text-danger-ink font-inter text-xs leading-relaxed">
                    {error}
                  </Text>
                </View>
              ) : null}

              <View>
                <Text className="text-ink-muted font-inter mb-2">Email Address</Text>
                <TextInput 
                  className="bg-sunken text-ink border border-line rounded-lg p-4 font-inter"
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
                  <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
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
                    onPress={() => safeBack('/(auth)/login')}
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
