import { View, Text, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { useActiveTheme } from '../../store/settingsStore';
import { apiService } from '../../services/api';
import { useState } from 'react';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Detect if this is an admin-enforced reset (no passcode required, authenticated via temp token)
  const isForceReset = params.forceReset === 'true';
  const tempToken = params.tempToken as string | undefined;

  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const placeholderColor = isDark ? '#94A3B8' : '#64748B';

  const [passcode, setPasscode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleReset = async () => {
    // Basic Validations
    if (!isForceReset && !passcode.trim()) {
      setError('Please enter the 6-digit recovery passcode');
      return;
    }
    if (!password.trim() || !confirmPassword.trim()) {
      setError('Please fill in all password fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const payload: { passcode?: string; password?: string } = {
        password: password.trim()
      };
      if (!isForceReset) {
        payload.passcode = passcode.trim();
      }

      await apiService.resetPassword(payload, tempToken);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please check your passcode and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900 justify-center p-6">
      <View className="w-full max-w-md mx-auto">
        <Text className="font-orbitron-bold text-3xl text-brand-orange mb-6 text-center tracking-widest">
          {isForceReset ? 'UPDATE' : 'RESET'}
        </Text>
        
        <GlassCard className="gap-4">
          {success ? (
            <View className="gap-4">
              <View className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-lg p-4">
                <Text className="text-emerald-800 dark:text-emerald-200 font-inter-bold text-sm mb-1">
                  Password Updated!
                </Text>
                <Text className="text-emerald-700 dark:text-emerald-300 font-inter text-xs leading-relaxed">
                  Your password has been successfully reset. You can now use your new credentials to sign in.
                </Text>
              </View>

              <Button 
                title="Go to Login" 
                variant="primary" 
                onPress={() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace('/(auth)/login');
                  }
                }}
                className="mt-2"
              />
            </View>
          ) : (
            <>
              {isForceReset ? (
                <View className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg p-4">
                  <Text className="text-amber-800 dark:text-amber-200 font-inter-bold text-sm mb-1">
                    Password Reset Required
                  </Text>
                  <Text className="text-amber-700 dark:text-amber-300 font-inter text-xs leading-relaxed">
                    An administrator has requested that you choose a new, secure password before accessing your account.
                  </Text>
                </View>
              ) : null}

              {error ? (
                <View className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg p-4">
                  <Text className="text-red-800 dark:text-red-200 font-inter-bold text-sm mb-1">
                    Failed to Update
                  </Text>
                  <Text className="text-red-700 dark:text-red-300 font-inter text-xs leading-relaxed">
                    {error}
                  </Text>
                </View>
              ) : null}

              {!isForceReset ? (
                <View>
                  <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">6-Digit Recovery Passcode</Text>
                  <TextInput 
                    className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 font-inter text-center font-bold tracking-widest text-lg"
                    placeholder="000 000"
                    placeholderTextColor={placeholderColor}
                    value={passcode}
                    onChangeText={setPasscode}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoCapitalize="none"
                    editable={!isLoading}
                  />
                </View>
              ) : null}

              <View>
                <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">New Password</Text>
                <TextInput 
                  className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 font-inter"
                  placeholder="Enter new password"
                  placeholderTextColor={placeholderColor}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!isLoading}
                />
              </View>

              <View>
                <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">Confirm Password</Text>
                <TextInput 
                  className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 font-inter"
                  placeholder="Re-enter new password"
                  placeholderTextColor={placeholderColor}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
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
                    title={isForceReset ? 'Update Password' : 'Reset Password'} 
                    variant="primary" 
                    onPress={handleReset}
                    className="mt-4"
                  />
                  
                  <Button 
                    title="Cancel" 
                    variant="ghost" 
                    onPress={() => {
                      if (router.canGoBack()) {
                        router.back();
                      } else {
                        router.replace('/(auth)/login');
                      }
                    }}
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
