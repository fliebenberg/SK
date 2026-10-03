import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { OrgLogo } from '../../components/OrgLogo';
import { wsService } from '../../services/websocket';
import { sendAction } from '../../services/actions';
import { SocketAction } from '@sk/shared';
import { useWsStore } from '../../store/wsStore';
import { useActiveTheme } from '../../store/settingsStore';
import { Ionicons } from '@expo/vector-icons';
import { ResponsivePageLayout } from '../../components/ResponsivePageLayout';
import { themeColor } from '../../constants/Colors';

export default function ReferScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const isConnected = useWsStore(state => state.isConnected);
  const placeholderColor = themeColor(isDark, 'ink-muted');

  const [claimInfo, setClaimInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch token info from server on mount/connection
  useEffect(() => {
    if (!token) {
      setErrorMsg('No invitation token provided.');
      setIsLoading(false);
      return;
    }

    if (!isConnected) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    wsService.emit('get_data', { type: 'claim_info', token }, (res: any) => {
      if (res && res.error) {
        setErrorMsg(res.error);
      } else if (!res) {
        setErrorMsg('This invitation link is invalid or has expired.');
      } else {
        setClaimInfo(res);
      }
      setIsLoading(false);
    });
  }, [token, isConnected]);

  const handleRefer = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    sendAction(SocketAction.REFER_ORG_CONTACT_VIA_TOKEN, {
      token: token as string,
      contactEmails: [email.trim().toLowerCase()],
    }).then(result => {
      setSubmitting(false);
      // A missing reply used to count as submitted. The toast covers web, where Alert is a no-op.
      if (!result.ok) {
        Alert.alert('Error', result.message);
        return;
      }
      setSubmitted(true);
    });
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View className="flex-1 items-center justify-center py-12">
          <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
          <Text className="font-orbitron-bold text-ink-muted mt-4">
            LOADING DETAILS...
          </Text>
        </View>
      );
    }

    if (errorMsg) {
      return (
        <View className="items-center py-12 px-6">
          <View className="w-16 h-16 rounded-full bg-danger-soft items-center justify-center mb-6">
            <Ionicons name="warning" size={32} color={themeColor(isDark, 'danger')} />
          </View>
          <Text className="font-orbitron-bold text-2xl text-danger-ink mb-4 text-center">
            ERROR
          </Text>
          <Text className="font-inter-medium text-ink-muted text-center max-w-sm mb-8">
            {errorMsg}
          </Text>
          <Button 
            title="Back to Home" 
            variant="ghost" 
            onPress={() => router.push('/')} 
            className="w-full max-w-xs"
          />
        </View>
      );
    }

    if (submitted) {
      return (
        <View className="items-center py-12 px-6">
          <View className="w-16 h-16 rounded-full bg-success-soft items-center justify-center mb-6">
            <Ionicons name="checkmark-circle" size={36} color={themeColor(isDark, 'success')} />
          </View>
          <Text className="font-orbitron-bold text-2xl text-ink mb-2 text-center">
            REFERRAL SENT
          </Text>
          <Text className="font-inter-medium text-ink-muted text-center max-w-sm mb-8 leading-6">
            Thank you! We have sent a new invitation to <Text className="font-inter-bold text-ink">{email}</Text>.
          </Text>
          <Button 
            title="Back to Home" 
            variant="primary" 
            onPress={() => router.push('/')} 
            className="w-full max-w-xs shadow-md shadow-primary/20"
          />
        </View>
      );
    }

    return (
      <View className="py-6 px-4">
        {/* Org Logo */}
        <View className="mb-6 items-center justify-center">
          <OrgLogo 
            logo={claimInfo?.organizationLogo}
            primaryColor={themeColor(isDark, 'primary')}
            size="xl"
            className="border-4 border-primary-line shadow-2xl"
          />
        </View>

        <Text className="font-orbitron-bold text-ink text-2xl text-center mb-2 tracking-wider">
          REFER SOMEONE ELSE
        </Text>
        
        <Text className="font-inter-medium text-ink-muted text-center mb-8 leading-5">
          Know the right person to manage <Text className="font-inter-bold text-ink">{claimInfo?.organizationName}</Text>? Enter their email below and we'll send them an invitation.
        </Text>

        <View className="space-y-4">
          <View className="mb-4">
            <Text className="text-ink-muted font-inter mb-2">Email Address</Text>
            <TextInput 
              className="bg-sunken text-ink border border-line rounded-lg p-4 font-inter text-base"
              placeholder="colleague@example.com"
              placeholderTextColor={placeholderColor}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!submitting}
            />
          </View>

          {/* Privacy Guarantee Panel */}
          <View className="bg-accent-soft border border-accent-line p-4 rounded-xl items-center mb-6">
            <Ionicons name="shield-checkmark" size={20} color={themeColor(isDark, 'accent-ink')} className="mb-1" />
            <Text className="font-inter-bold text-xs text-accent-ink tracking-widest uppercase mb-1">
              Privacy Policy Guarantee
            </Text>
            <Text className="font-inter-medium text-xs text-ink-muted text-center leading-4">
              We will only use this email address to send a one-time invitation to claim this organization. We will never sell their data or send them marketing spam.
            </Text>
          </View>

          <Button 
            title={submitting ? "Sending Invitation..." : "Send Invitation"} 
            variant="primary" 
            isLoading={submitting}
            disabled={!email.includes('@')}
            onPress={handleRefer}
            className="w-full shadow-md shadow-primary/20"
          />

          <Button 
            title="Cancel" 
            variant="ghost" 
            onPress={() => safeBack('/landing')} 
            className="w-full mt-2"
          />
        </View>
      </View>
    );
  };

  return (
    <ResponsivePageLayout>
      <ScrollView 
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 16 }}
      >
        <View className="w-full max-w-md self-center">
          <GlassCard className="p-6 border border-line-soft shadow-lg bg-card/80">
            {renderContent()}
          </GlassCard>
        </View>
      </ScrollView>
    </ResponsivePageLayout>
  );
}
