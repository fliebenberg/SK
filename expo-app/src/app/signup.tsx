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
import { Switch } from '../components/ui/Switch';
import { Link } from 'expo-router';

export default function SignupScreen() {
  const { signup, loginWithGoogle } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Theme colors
  const isDark = theme.name?.toString().startsWith('dark');
  const primaryColor = theme.primary?.get() || '#10b981';
  const successColor = '#10b981';
  const errorColor = '#ef4444';
  const errorBg = isDark ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2';
  const errorBorder = 'rgba(239, 68, 68, 0.5)';

  // Determine password match status
  const isPasswordInputEmpty = !confirmPassword;
  const isPasswordMatched = password === confirmPassword;

  const handleSubmit = async () => {
    setError('');

    // Input Validations
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!acceptTerms) {
      setError('You must accept the terms and conditions');
      return;
    }

    setIsLoading(true);

    try {
      await signup(name, email, password);
      router.replace('/');
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    setIsLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError('Google signup failed');
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
                CREATE ACCOUNT
              </H1>
              <Paragraph color="$gray10" fontSize={14} textAlign="center">
                Join ScoreKeeper and stay in the game
              </Paragraph>
            </YStack>

            {/* Premium Metal Card */}
            <MetalCard variant="dark" hasRivets={true} padding="$6" gap="$5">
              
              {/* Google Social Signup */}
              <MetalButton
                onPress={handleGoogleSignup}
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
                
                {/* Full Name Field */}
                <YStack gap="$2">
                  <Label htmlFor="name" fontWeight="600" color="$gray11">Full Name</Label>
                  <Input
                    id="name"
                    autoComplete="name"
                    placeholder="John Doe"
                    value={name}
                    onChangeText={setName}
                    disabled={isLoading}
                  />
                </YStack>

                {/* Email Address Field */}
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
                  <Label htmlFor="password" fontWeight="600" color="$gray11">Password</Label>
                  <Input
                    id="password"
                    secureTextEntry={true}
                    autoCapitalize="none"
                    placeholder="•••••••• (Min. 6 chars)"
                    value={password}
                    onChangeText={setPassword}
                    disabled={isLoading}
                  />
                </YStack>

                {/* Confirm Password Field with Dynamic Indicators */}
                <YStack gap="$2">
                  <XStack justifyContent="space-between" alignItems="center">
                    <Label htmlFor="confirmPassword" fontWeight="600" color="$gray11">Confirm Password</Label>
                    {!isPasswordInputEmpty && (
                      isPasswordMatched ? (
                        <Text fontSize={10} fontWeight="900" letterSpacing={1} color={successColor}>
                          MATCHED
                        </Text>
                      ) : (
                        <Text fontSize={10} fontWeight="900" letterSpacing={1} color={errorColor} style={styles.pulseAnimation}>
                          UNMATCHED
                        </Text>
                      )
                    )}
                  </XStack>
                  <Input
                    id="confirmPassword"
                    secureTextEntry={true}
                    autoCapitalize="none"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    disabled={isLoading}
                    borderColor={
                      isPasswordInputEmpty 
                        ? '$border' 
                        : isPasswordMatched 
                          ? successColor 
                          : errorColor
                    }
                    focusStyle={{
                      borderColor: 
                        isPasswordInputEmpty 
                          ? '$primary' 
                          : isPasswordMatched 
                            ? successColor 
                            : errorColor,
                      borderWidth: 1.5,
                    }}
                  />
                </YStack>

              </YStack>

              {/* Accept Terms Switch */}
              <XStack gap="$3" alignItems="center" marginVertical="$2">
                <Switch
                  checked={acceptTerms}
                  onCheckedChange={setAcceptTerms}
                  disabled={isLoading}
                />
                <YStack flex={1}>
                  <Text color="$gray11" fontSize={13} lineHeight={16}>
                    I accept the{' '}
                    <Link href={"/terms" as any} style={styles.inlineLink}>
                      Terms and Conditions
                    </Link>{' '}
                    and{' '}
                    <Link href={"/privacy" as any} style={styles.inlineLink}>
                      Privacy Policy
                    </Link>
                  </Text>
                </YStack>
              </XStack>

              {/* Error Alert Box */}
              {!!error && (
                <YStack 
                  borderRadius={12} 
                  borderWidth={1} 
                  borderColor={errorBorder} 
                  backgroundColor={errorBg} 
                  overflow="hidden"
                  marginTop="$1"
                >
                  <XStack backgroundColor="#ef4444" paddingVertical="$2" paddingHorizontal="$3" gap="$2" alignItems="center">
                    <Shield size={14} color="#ffffff" />
                    <Text color="#ffffff" fontWeight="800" fontSize={12} letterSpacing={0.5}>
                      REGISTRATION FAILED
                    </Text>
                  </XStack>
                  <YStack padding="$3">
                    <Text color="#cbd5e1" fontSize={13} lineHeight={18} fontWeight="500">
                      {error}
                    </Text>
                  </YStack>
                </YStack>
              )}

              {/* Create Account Submit Button */}
              <MetalButton
                onPress={handleSubmit}
                disabled={isLoading}
                variantType="filled"
                glowColor={primaryColor}
                size="default"
                style={{ marginTop: 8 }}
              >
                {isLoading ? 'Creating account...' : 'Create Account'}
              </MetalButton>

            </MetalCard>

            {/* Bottom Redirect Link */}
            <XStack justifyContent="center" gap="$2" marginTop="$2">
              <Text color="$gray10" fontSize={14}>Already have an account?</Text>
              <Link href="/login" style={[styles.loginLink, { color: primaryColor }]}>
                Sign in
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
  inlineLink: {
    color: '#3b82f6',
    textDecorationLine: 'underline',
  },
  loginLink: {
    fontSize: 14,
    fontWeight: '700',
  },
  pulseAnimation: {
    opacity: 0.8,
  },
});
