import React, { useState } from 'react';
import { ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { YStack, XStack, Text, H1, Paragraph, Theme, useTheme } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shield, Globe } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { MetalButton } from '../components/ui/MetalButton';
import { MetalCard } from '../components/ui/MetalCard';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Link } from 'expo-router';

export default function LoginScreen() {
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Theme values
  const isDark = theme.name?.toString().startsWith('dark');
  const primaryColor = theme.primary?.get() || '#10b981';
  const errorBg = isDark ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2';
  const errorBorder = 'rgba(239, 68, 68, 0.5)';

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      router.replace('/');
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError('Google login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Theme name="dark">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContainer, { paddingTop: Math.max(40, insets.top), paddingBottom: Math.max(40, insets.bottom) }]}
          keyboardShouldPersistTaps="handled"
        >
          <YStack width="100%" maxWidth={400} gap="$6" padding="$4">
            
            {/* Header Section */}
            <YStack gap="$2" alignItems="center" marginBottom="$2">
              <H1 
                fontFamily="$heading" 
                fontSize={32} 
                fontWeight="900" 
                letterSpacing={2} 
                color="$color"
                textAlign="center"
              >
                WELCOME BACK
              </H1>
              <Paragraph color="$gray10" fontSize={14} textAlign="center">
                Sign in to your ScoreKeeper account
              </Paragraph>
            </YStack>

            {/* Premium Metal card */}
            <MetalCard variant="dark" hasRivets={true} padding="$6" gap="$5">
              
              {/* Google OAuth Button */}
              <MetalButton
                onPress={handleGoogleLogin}
                disabled={isLoading}
                variantType="outlined"
                glowColor="#ffffff"
                size="default"
                icon={<Globe size={20} color="#cbd5e1" />}
              >
                Continue with Google
              </MetalButton>

              {/* Separator */}
              <XStack alignItems="center" gap="$3" marginVertical="$2">
                <YStack flex={1} height={1} backgroundColor="$gray6" />
                <Text color="$gray9" fontSize={12} fontWeight="700" letterSpacing={0.5}>
                  OR CONTINUE WITH EMAIL
                </Text>
                <YStack flex={1} height={1} backgroundColor="$gray6" />
              </XStack>

              {/* Form Input fields */}
              <YStack gap="$4">
                
                {/* Email Field */}
                <YStack gap="$2">
                  <Label htmlFor="email" fontWeight="600" color="$gray11">Email Address</Label>
                  <Input
                    id="email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChangeText={setEmail}
                    disabled={isLoading}
                  />
                </YStack>

                {/* Password Field */}
                <YStack gap="$2">
                  <XStack justifyContent="space-between" alignItems="center">
                    <Label htmlFor="password" fontWeight="600" color="$gray11">Password</Label>
                    <Link href="/forgot-password" style={styles.forgotLink}>
                      Forgot password?
                    </Link>
                  </XStack>
                  <Input
                    id="password"
                    secureTextEntry={true}
                    autoCapitalize="none"
                    autoComplete="password"
                    placeholder="••••••••"
                    value={password}
                    onChangeText={setPassword}
                    disabled={isLoading}
                  />
                </YStack>

              </YStack>

              {/* Custom High-Fidelity Error Box */}
              {!!error && (
                <YStack 
                  borderRadius={12} 
                  borderWidth={1} 
                  borderColor={errorBorder} 
                  backgroundColor={errorBg} 
                  overflow="hidden"
                  marginTop="$2"
                >
                  <XStack backgroundColor="#ef4444" paddingVertical="$2" paddingHorizontal="$3" gap="$2" alignItems="center">
                    <Shield size={14} color="#ffffff" />
                    <Text color="#ffffff" fontWeight="800" fontSize={12} letterSpacing={0.5}>
                      SIGN IN FAILED
                    </Text>
                  </XStack>
                  <YStack padding="$3">
                    <Text color="#cbd5e1" fontSize={13} lineHeight={18} fontWeight="500">
                      {error === 'EMAIL_NOT_FOUND' && "This email isn't registered. If you used Google to sign up, please try the Google button above, or create a new account."}
                      {error === 'PASSWORD_MISMATCH' && "The password you entered is incorrect. You can reset it using the 'Forgot password?' link above."}
                      {error === 'SOCIAL_ONLY' && "You usually log in with Google. Please click the 'Continue with Google' button above to access your account."}
                      {!['EMAIL_NOT_FOUND', 'PASSWORD_MISMATCH', 'SOCIAL_ONLY'].includes(error) && error}
                    </Text>
                  </YStack>
                </YStack>
              )}

              {/* Submit Sign In Button */}
              <MetalButton
                onPress={handleSubmit}
                disabled={isLoading}
                variantType="filled"
                glowColor={primaryColor}
                size="default"
                style={{ marginTop: 8 }}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </MetalButton>

            </MetalCard>

            {/* Footer Sign Up Link */}
            <XStack justifyContent="center" gap="$2" marginTop="$2">
              <Text color="$gray10" fontSize={14}>Don't have an account?</Text>
              <Link href="/signup" style={[styles.signupLink, { color: primaryColor }]}>
                Sign up
              </Link>
            </XStack>

          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </Theme>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    backgroundColor: '#09090b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  forgotLink: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600',
  },
  signupLink: {
    fontSize: 14,
    fontWeight: '700',
  },
});
