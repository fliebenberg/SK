import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
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
    sendAction(SocketAction.DECLINE_CLAIM, { token: token as string }).then(result => {
      setSubmitting(false);
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
          <View className="w-16 h-16 rounded-full bg-sunken items-center justify-center mb-6">
            <Ionicons name="close-circle" size={36} color={themeColor(isDark, 'ink-muted')} />
          </View>
          <Text className="font-orbitron-bold text-2xl text-ink mb-2 text-center">
            INVITATION DECLINED
          </Text>
          <Text className="font-inter-medium text-ink-muted text-center max-w-sm mb-8 leading-6">
            You have successfully declined the invitation. Your email address has been removed from our list for this organization.
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
      <View className="py-6 px-4 items-center">
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
          DECLINE INVITATION
        </Text>
        
        <Text className="font-inter-medium text-ink-muted text-center mb-8 max-w-sm leading-6">
          Are you sure you want to decline the invitation to manage <Text className="font-inter-bold text-ink">{claimInfo?.organizationName}</Text>?
        </Text>

        <View className="w-full max-w-sm gap-4">
          <View className="bg-danger-soft border border-danger-line p-4 rounded-xl items-center mb-4">
            <Ionicons name="trash-outline" size={20} color={themeColor(isDark, 'danger')} className="mb-1" />
            <Text className="font-inter-medium text-xs text-danger-ink text-center leading-4">
              If you decline, we will remove your email from our list for this organization. You won't be contacted again about this claim.
            </Text>
          </View>

          <Button 
            title={submitting ? "Declining..." : "Yes, Decline Invitation"} 
            variant="danger" 
            isLoading={submitting}
            onPress={handleDecline}
            className="w-full shadow-md shadow-danger/20"
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
