import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { OrgLogo } from '../../components/OrgLogo';
import { wsService } from '../../services/websocket';
import { useWsStore } from '../../store/wsStore';
import { useActiveTheme } from '../../store/settingsStore';
import { Ionicons } from '@expo/vector-icons';
import { ResponsivePageLayout } from '../../components/ResponsivePageLayout';

export default function ReferScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const isConnected = useWsStore(state => state.isConnected);
  const placeholderColor = isDark ? '#94A3B8' : '#64748B';

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
    wsService.emit('action', {
      type: 'REFER_ORG_CONTACT_VIA_TOKEN',
      payload: { token, contactEmails: [email.trim().toLowerCase()] }
    }, (res: any) => {
      setSubmitting(false);
      if (res && res.error) {
        Alert.alert('Error', res.error || 'Failed to submit referral.');
      } else {
        setSubmitted(true);
      }
    });
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View className="flex-1 items-center justify-center py-12">
          <ActivityIndicator size="large" color="#F97316" />
          <Text className="font-orbitron-bold text-slate-600 dark:text-slate-400 mt-4">
            LOADING DETAILS...
          </Text>
        </View>
      );
    }

    if (errorMsg) {
      return (
        <View className="items-center py-12 px-6">
          <View className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950 items-center justify-center mb-6">
            <Ionicons name="warning" size={32} color="#EF4444" />
          </View>
          <Text className="font-orbitron-bold text-2xl text-red-500 mb-4 text-center">
            ERROR
          </Text>
          <Text className="font-inter-medium text-slate-600 dark:text-slate-400 text-center max-w-sm mb-8">
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
          <View className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 items-center justify-center mb-6">
            <Ionicons name="checkmark-circle" size={36} color="#10B981" />
          </View>
          <Text className="font-orbitron-bold text-2xl text-slate-900 dark:text-white mb-2 text-center">
            REFERRAL SENT
          </Text>
          <Text className="font-inter-medium text-slate-600 dark:text-slate-400 text-center max-w-sm mb-8 leading-6">
            Thank you! We have sent a new invitation to <Text className="font-inter-bold text-slate-900 dark:text-white">{email}</Text>.
          </Text>
          <Button 
            title="Back to Home" 
            variant="primary" 
            onPress={() => router.push('/')} 
            className="w-full max-w-xs shadow-md shadow-brand-orange/20"
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
            primaryColor="#F97316"
            size="xl"
            className="border-4 border-brand-orange/20 shadow-2xl"
          />
        </View>

        <Text className="font-orbitron-bold text-slate-900 dark:text-white text-2xl text-center mb-2 tracking-wider">
          REFER SOMEONE ELSE
        </Text>
        
        <Text className="font-inter-medium text-slate-600 dark:text-slate-400 text-center mb-8 leading-5">
          Know the right person to manage <Text className="font-inter-bold text-slate-900 dark:text-white">{claimInfo?.organizationName}</Text>? Enter their email below and we'll send them an invitation.
        </Text>

        <View className="space-y-4">
          <View className="mb-4">
            <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">Email Address</Text>
            <TextInput 
              className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 font-inter text-base"
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
          <View className="bg-brand-blue/10 dark:bg-brand-blue/5 border border-brand-blue/20 p-4 rounded-xl items-center mb-6">
            <Ionicons name="shield-checkmark" size={20} color="#00E5FF" className="mb-1" />
            <Text className="font-inter-bold text-xs text-brand-blue tracking-widest uppercase mb-1">
              Privacy Policy Guarantee
            </Text>
            <Text className="font-inter-medium text-xs text-slate-600 dark:text-slate-400 text-center leading-4">
              We will only use this email address to send a one-time invitation to claim this organization. We will never sell their data or send them marketing spam.
            </Text>
          </View>

          <Button 
            title={submitting ? "Sending Invitation..." : "Send Invitation"} 
            variant="primary" 
            isLoading={submitting}
            disabled={!email.includes('@')}
            onPress={handleRefer}
            className="w-full shadow-md shadow-brand-orange/20"
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
          <GlassCard className="p-6 border border-slate-200/60 dark:border-slate-800/60 shadow-lg bg-white/80 dark:bg-slate-900/80">
            {renderContent()}
          </GlassCard>
        </View>
      </ScrollView>
    </ResponsivePageLayout>
  );
}
