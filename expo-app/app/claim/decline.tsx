import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
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

export default function DeclineScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const isConnected = useWsStore(state => state.isConnected);

  const [claimInfo, setClaimInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  const handleDecline = async () => {
    setSubmitting(true);
    wsService.emit('action', {
      type: 'DECLINE_CLAIM',
      payload: { token }
    }, (res: any) => {
      setSubmitting(false);
      if (res && res.error) {
        Alert.alert('Error', res.error || 'Failed to decline invitation.');
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
          <View className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mb-6">
            <Ionicons name="close-circle" size={36} color="#64748B" />
          </View>
          <Text className="font-orbitron-bold text-2xl text-slate-900 dark:text-white mb-2 text-center">
            INVITATION DECLINED
          </Text>
          <Text className="font-inter-medium text-slate-600 dark:text-slate-400 text-center max-w-sm mb-8 leading-6">
            You have successfully declined the invitation. Your email address has been removed from our list for this organization.
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
      <View className="py-6 px-4 items-center">
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
          DECLINE INVITATION
        </Text>
        
        <Text className="font-inter-medium text-slate-600 dark:text-slate-400 text-center mb-8 max-w-sm leading-6">
          Are you sure you want to decline the invitation to manage <Text className="font-inter-bold text-slate-900 dark:text-white">{claimInfo?.organizationName}</Text>?
        </Text>

        <View className="w-full max-w-sm gap-4">
          <View className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 p-4 rounded-xl items-center mb-4">
            <Ionicons name="trash-outline" size={20} color="#EF4444" className="mb-1" />
            <Text className="font-inter-medium text-xs text-red-800 dark:text-red-200 text-center leading-4">
              If you decline, we will remove your email from our list for this organization. You won't be contacted again about this claim.
            </Text>
          </View>

          <Button 
            title={submitting ? "Declining..." : "Yes, Decline Invitation"} 
            variant="danger" 
            isLoading={submitting}
            onPress={handleDecline}
            className="w-full shadow-md shadow-brand-red/20"
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
        <View className="w-full max-w-md mx-auto">
          <GlassCard className="p-6 border border-slate-200/60 dark:border-slate-800/60 shadow-xl bg-white/80 dark:bg-slate-900/80">
            {renderContent()}
          </GlassCard>
        </View>
      </ScrollView>
    </ResponsivePageLayout>
  );
}
