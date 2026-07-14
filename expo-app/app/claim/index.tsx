import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { OrgLogo } from '../../components/OrgLogo';
import { useAuthStore } from '../../store/authStore';
import { wsService } from '../../services/websocket';
import { useWsStore } from '../../store/wsStore';
import { Ionicons } from '@expo/vector-icons';
import { ResponsiveHeader } from '../../components/ResponsiveHeader';
import { LeftNavigationRail } from '../../components/LeftNavigationRail';
import { getThemeColor } from '../../constants';
import { useActiveTheme } from '../../store/settingsStore';
import * as SecureStore from 'expo-secure-store';

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
    
    wsService.emit('action', { 
      type: 'CLAIM_ORG_VIA_TOKEN', 
      payload: { token, userId: user.id } 
    }, (res: any) => {
      setClaiming(false);
      if (res && res.error) {
        // Show custom UI error alert
        Alert.alert('Error', res.error || 'Failed to claim organization.');
      } else {
        // Successfully claimed! Navigate to the admin view
        router.replace(`/(tabs)/organizations/${claimInfo?.orgId}`);
      }
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
          <ActivityIndicator size="large" color="#F97316" />
          <Text className="font-orbitron-bold text-slate-600 dark:text-slate-400 mt-4">
            VERIFYING INVITATION...
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
            INVALID INVITATION
          </Text>
          <Text className="font-inter-medium text-slate-600 dark:text-slate-400 text-center max-w-sm mb-8 leading-6">
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
          <View className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 items-center justify-center mb-6">
            <Ionicons name="checkmark-circle" size={36} color="#10B981" />
          </View>
          <Text className="font-orbitron-bold text-2xl text-slate-900 dark:text-white mb-2 text-center">
            ALREADY CLAIMED
          </Text>
          <Text className="font-inter-medium text-slate-600 dark:text-slate-400 text-center max-w-sm mb-8 leading-6">
            The organization <Text className="font-inter-bold text-slate-900 dark:text-white">{claimInfo.organizationName}</Text> has already been claimed by its administrator.
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
          <View className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mb-6">
            <Ionicons name="close-circle" size={36} color="#64748B" />
          </View>
          <Text className="font-orbitron-bold text-2xl text-slate-900 dark:text-white mb-2 text-center">
            INVITATION VOIDED
          </Text>
          <Text className="font-inter-medium text-slate-600 dark:text-slate-400 text-center max-w-sm mb-8 leading-6">
            This invitation to manage <Text className="font-inter-bold text-slate-900 dark:text-white">{claimInfo.organizationName}</Text> was voided because another nominee successfully claimed the organization.
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
        {/* Org Logo */}
        <View className="mb-6 items-center justify-center">
          <OrgLogo 
            logo={claimInfo?.organizationLogo}
            primaryColor="#F97316"
            size="xl"
            className="ring-4 ring-brand-orange/20 shadow-2xl"
          />
        </View>

        <Text className="font-orbitron-bold text-slate-900 dark:text-white text-2xl text-center mb-2 tracking-wider">
          CLAIM OWNERSHIP
        </Text>
        
        <Text className="font-inter-medium text-slate-600 dark:text-slate-400 text-center mb-8 max-w-sm leading-6">
          You have been invited to claim administrative access for <Text className="font-inter-bold text-slate-900 dark:text-white">{claimInfo.organizationName}</Text>.
        </Text>

        {!isAuthenticated ? (
          <GlassCard className="w-full max-w-sm p-6 items-center border border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/50">
            <Text className="font-inter-medium text-slate-600 dark:text-slate-400 text-sm text-center mb-6 leading-5">
              Please log in or create an account to claim this organization and become its official administrator.
            </Text>
            <Button 
              title="Log In to Proceed" 
              variant="primary" 
              onPress={handleRedirectToLogin}
              className="w-full shadow-md shadow-brand-orange/20"
            />
          </GlassCard>
        ) : (
          <View className="w-full max-w-sm gap-4">
            <View className="bg-brand-orange/10 dark:bg-brand-orange/5 border border-brand-orange/25 p-4 rounded-xl items-center mb-4">
              <Text className="font-orbitron-bold text-xs text-brand-orange tracking-widest uppercase mb-1">
                Administrator Privileges
              </Text>
              <Text className="font-inter-medium text-xs text-slate-600 dark:text-slate-400 text-center leading-4">
                Full control over teams, rosters, scheduling, scoring, and members.
              </Text>
            </View>

            <Button 
              title={claiming ? "Processing..." : "Claim Org Now"} 
              variant="primary" 
              isLoading={claiming}
              onPress={handleClaim}
              className="w-full shadow-md shadow-brand-orange/20"
            />

            <View className="flex-row justify-between w-full mt-4">
              <Button 
                title="Nominate Someone Else" 
                variant="ghost" 
                onPress={() => router.push({ pathname: '/claim/refer', params: { token } })} 
                className="flex-1 mr-2"
                style={{ minHeight: 40, paddingVertical: 8 }}
              />
              <Button 
                title="Decline" 
                variant="ghost" 
                onPress={() => router.push({ pathname: '/claim/decline', params: { token } })} 
                className="flex-1 ml-2 border-red-200 dark:border-red-950"
                style={{ minHeight: 40, paddingVertical: 8 }}
              />
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: getThemeColor(isDark, 'background') }}>
      <ResponsiveHeader />
      <View className="flex-1 flex-row">
        <LeftNavigationRail />
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
      </View>
    </SafeAreaView>
  );
}
