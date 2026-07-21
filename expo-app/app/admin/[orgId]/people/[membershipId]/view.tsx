import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../../store/settingsStore';
import { useAuthStore } from '../../../../../store/authStore';
import { OrgMember, Organization } from '@sk/types';
import { useSocketQuery } from '../../../../../hooks/useSocketQuery';
import { getAvatarUrl } from '../../../../../services/api';

const parseImageConfig = (config: any) => {
  if (!config) return { scale: 1, x: 0, y: 0 };
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch (e) {
      return { scale: 1, x: 0, y: 0 };
    }
  }
  return {
    scale: config.scale ?? 1,
    x: config.x ?? 0,
    y: config.y ?? 0
  };
};

export default function PersonViewScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, membershipId } = useLocalSearchParams<{ orgId: string; membershipId: string }>();
  const isDark = useActiveTheme() === 'dark';

  // User & Permissions
  const user = useAuthStore(state => state.user);
  const orgMemberships = useAuthStore(state => state.orgMemberships || []);
  const { data: org } = useSocketQuery<Organization>('organization', { orgId });
  const { data: membersData, isLoading: isMembersLoading } = useSocketQuery<OrgMember[]>('org_members', { orgId });

  const member = useMemo(() => {
    return (membersData || []).find(m => m.membershipId === membershipId) || null;
  }, [membersData, membershipId]);

  const userMembership = orgMemberships.find(m => m.orgId === orgId);
  const isOwner = org?.creatorId === user?.id;
  const canEdit = Boolean(
    user?.globalRole === 'admin' ||
    isOwner ||
    (userMembership && (userMembership.roleId === 'role-org-admin' || userMembership.roleId === 'role-org-staff'))
  );

  if (isMembersLoading || !member) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color="#FF3E00" />
        <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-3">Loading Profile...</Text>
      </SafeAreaView>
    );
  }

  const avatarSrc = member.image ? { uri: getAvatarUrl(member.image, 'large') } : null;
  const logoConf = parseImageConfig(member.imageConfig);

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}/people`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            People
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          Member Profile
        </Text>
        {canEdit ? (
          <TouchableOpacity
            onPress={() => router.push({
              pathname: '/admin/[orgId]/people/[membershipId]',
              params: { orgId: orgId!, membershipId: member.membershipId }
            })}
            className="w-8 h-8 rounded-lg bg-brand-orange/10 border border-brand-orange/20 items-center justify-center active:opacity-85"
          >
            <Ionicons name="pencil" size={15} color="#FF3E00" />
          </TouchableOpacity>
        ) : (
          <View className="w-8" />
        )}
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* AVATAR & HEADER CARD */}
        <GlassCard className="border border-slate-200 dark:border-white/5 p-6 items-center mb-6">
          <View className="w-24 h-24 rounded-full bg-brand-orange/10 overflow-hidden items-center justify-center border-2 border-brand-orange/30 mb-4">
            {avatarSrc ? (
              <View style={{ width: 96, height: 96, overflow: 'hidden' }}>
                <View
                  style={{
                    width: '100%',
                    height: '100%',
                    transform: [
                      { scale: logoConf.scale },
                      { translateX: logoConf.x * 96 },
                      { translateY: logoConf.y * 96 },
                    ],
                  }}
                >
                  <Image
                    source={avatarSrc}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </View>
              </View>
            ) : (
              <Text className="font-orbitron-bold text-3xl text-brand-orange">
                {member.name.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>

          <Text className="font-orbitron-bold text-xl text-slate-800 dark:text-white text-center">
            {member.name}
          </Text>

          <View className="mt-2 px-3 py-1 rounded-full bg-brand-orange/10 border border-brand-orange/20">
            <Text className="font-orbitron-bold text-xs uppercase tracking-wider text-brand-orange">
              {member.roleName || 'Member'}
            </Text>
          </View>

          {member.personOrgId ? (
            <Text className="font-mono text-xs text-slate-400 dark:text-slate-500 mt-2">
              ID: {member.personOrgId}
            </Text>
          ) : null}
        </GlassCard>

        {/* CONTACT & DETAILS CARD */}
        <GlassCard className="border border-slate-200 dark:border-white/5 p-6 space-y-4">
          <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Contact Information
          </Text>

          <View className="flex-row items-center gap-3">
            <View className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 items-center justify-center">
              <Ionicons name="mail-outline" size={16} color="#94A3B8" />
            </View>
            <View className="flex-1">
              <Text className="font-inter-bold text-[10px] text-slate-400 uppercase tracking-wider">Email Address</Text>
              <Text className="font-inter text-sm text-slate-800 dark:text-white mt-0.5">
                {member.email || 'Not provided'}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-3 pt-3 border-t border-slate-100 dark:border-white/5">
            <View className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 items-center justify-center">
              <Ionicons name="call-outline" size={16} color="#94A3B8" />
            </View>
            <View className="flex-1">
              <Text className="font-inter-bold text-[10px] text-slate-400 uppercase tracking-wider">Phone Number</Text>
              <Text className="font-inter text-sm text-slate-800 dark:text-white mt-0.5">
                {member.cellphone || 'Not provided'}
              </Text>
            </View>
          </View>

          {member.birthdate ? (
            <View className="flex-row items-center gap-3 pt-3 border-t border-slate-100 dark:border-white/5">
              <View className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 items-center justify-center">
                <Ionicons name="calendar-outline" size={16} color="#94A3B8" />
              </View>
              <View className="flex-1">
                <Text className="font-inter-bold text-[10px] text-slate-400 uppercase tracking-wider">Birthdate</Text>
                <Text className="font-inter text-sm text-slate-800 dark:text-white mt-0.5">
                  {member.birthdate}
                </Text>
              </View>
            </View>
          ) : null}
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}
