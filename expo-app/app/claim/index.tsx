import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform, Alert, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { OrgLogo } from '../../components/OrgLogo';
import { useAuthStore } from '../../store/authStore';
import { wsService } from '../../services/websocket';
import { sendAction } from '../../services/actions';
import { SocketAction } from '@sk/shared';
import { useWsStore } from '../../store/wsStore';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../store/settingsStore';
import * as SecureStore from 'expo-secure-store';
import { ResponsivePageLayout } from '../../components/ResponsivePageLayout';
import { themeColor } from '../../constants/Colors';

export default function ClaimIndexScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const isConnected = useWsStore(state => state.isConnected);
  const { user, isAuthenticated } = useAuthStore();

  const [claimInfo, setClaimInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
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

  const handleClaim = async () => {
    if (!token || !user) return;
    setClaiming(true);
    
    sendAction(SocketAction.CLAIM_ORG_VIA_TOKEN, { token: token as string, userId: user.id }).then(result => {
      setClaiming(false);
      // A missing reply used to count as a claim and navigate into an org the user may not hold.
      if (!result.ok) {
        Alert.alert('Error', result.message);
        return;
      }
      // Successfully claimed! Navigate to the admin view
      router.replace(`/(tabs)/organizations/${claimInfo?.orgId}`);
    });
  };

  const handleRedirectToLogin = async () => {
    if (!token) return;
    
    // Save pending claim token locally to resume after login
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem('pendingClaimToken', token);
      } else {
        await SecureStore.setItemAsync('pendingClaimToken', token);
      }
    } catch (e) {
      console.error('Failed to save pending claim token:', e);
    }

    router.push('/(auth)/login');
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View className="flex-1 items-center justify-center py-12">
          <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
          <Text className="font-orbitron-bold text-ink-muted mt-4">
            VERIFYING INVITATION...
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
            INVALID INVITATION
          </Text>
          <Text className="font-inter-medium text-ink-muted text-center max-w-sm mb-8 leading-6">
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

    if (claimInfo?.status === 'claimed') {
      return (
        <View className="items-center py-12 px-6">
          <View className="w-16 h-16 rounded-full bg-success-soft items-center justify-center mb-6">
            <Ionicons name="checkmark-circle" size={36} color={themeColor(isDark, 'success')} />
          </View>
          <Text className="font-orbitron-bold text-2xl text-ink mb-2 text-center">
            ALREADY CLAIMED
          </Text>
          <Text className="font-inter-medium text-ink-muted text-center max-w-sm mb-8 leading-6">
            The organization <Text className="font-inter-bold text-ink">{claimInfo.organizationName}</Text> has already been claimed by its administrator.
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

    if (claimInfo?.status === 'voided') {
      return (
        <View className="items-center py-12 px-6">
          <View className="w-16 h-16 rounded-full bg-sunken items-center justify-center mb-6">
            <Ionicons name="close-circle" size={36} color={themeColor(isDark, 'ink-muted')} />
          </View>
          <Text className="font-orbitron-bold text-2xl text-ink mb-2 text-center">
            ALREADY CLAIMED
          </Text>
          {/* Voided: the org got an administrator after this invitation was sent (`ORG-10`). */}
          <Text className="font-inter-medium text-ink-muted text-center max-w-sm mb-8 leading-6">
            <Text className="font-inter-bold text-ink">{claimInfo.organizationName}</Text> has already been claimed, so this invitation no longer works.
            {Array.isArray(claimInfo.adminNames) && claimInfo.adminNames.length > 0
              ? ` If you'd like to help run it, please contact its administrator${claimInfo.adminNames.length > 1 ? 's' : ''}, ${claimInfo.adminNames.join(', ')}.`
              : ' If you\'d like to help run it, please contact its administrator.'}
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

    return (
      <View className="items-center py-6 px-4">
        <Text className="font-orbitron-bold text-ink text-2xl text-center mb-2 tracking-wider">
          CLAIM OWNERSHIP
        </Text>
        
        <Text className="font-inter-medium text-ink-muted text-center mb-4 max-w-sm leading-6">
          You have been invited to claim administrative access for:
        </Text>

        {/* Centered Org Logo and Name */}
        <View className="items-center mb-6">
          <OrgLogo 
            logo={claimInfo?.organizationLogo}
            primaryColor={themeColor(isDark, 'primary')}
            size="xl"
            className="border-4 border-primary-line shadow-2xl mb-3"
          />
          <Text className="font-inter-bold text-ink text-xl text-center">
            {claimInfo?.organizationName}
          </Text>
        </View>

        {!isAuthenticated ? (
          <GlassCard className="w-full max-w-sm p-6 items-center border border-line-soft bg-sunken">
            <Text className="font-inter-medium text-ink-muted text-sm text-center mb-6 leading-5">
              Please log in or create an account to claim this organization and become its official administrator.
            </Text>
            <Button 
              title="Log In to Proceed" 
              variant="primary" 
              onPress={handleRedirectToLogin}
              className="w-full shadow-md shadow-primary/20"
            />
          </GlassCard>
        ) : (
          <View className="w-full max-w-sm gap-4">
            <View className="bg-primary-soft border border-primary-line p-4 rounded-xl items-center mb-4">
              <Text className="font-orbitron-bold text-xs text-primary-ink tracking-widest uppercase mb-1">
                Administrator Privileges
              </Text>
              <Text className="font-inter-medium text-xs text-ink-muted text-center leading-4">
                As administrator you will be able to add and manage organisation members, teams, facilities and much more.
              </Text>
            </View>

            <Button 
              title={claiming ? "Processing..." : "Claim Org Now"} 
              variant="primary" 
              isLoading={claiming}
              onPress={handleClaim}
              className="w-full shadow-md shadow-primary/20"
            />

            <View className="flex-row justify-between w-full mt-4">
              <Button 
                title="Nominate Someone Else" 
                variant="secondary" 
                onPress={() => router.push({ pathname: '/claim/refer', params: { token } })} 
                className="flex-1 mr-2"
                style={{ minHeight: 40, paddingVertical: 8 }}
              />
              <Button 
                title="Decline" 
                variant="danger" 
                onPress={() => router.push({ pathname: '/claim/decline', params: { token } })} 
                className="flex-1 ml-2"
                style={{ minHeight: 40, paddingVertical: 8 }}
              />
            </View>
          </View>
        )}
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
