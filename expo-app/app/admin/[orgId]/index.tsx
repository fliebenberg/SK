import React, { useMemo } from 'react';
import { orgColors } from '@sk/shared';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useGlobalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../store/settingsStore';
import { useSocketQuery } from '../../../hooks/useSocketQuery';
import { useOrgSummary } from '../../../hooks/useOrgSummary';
import { OrgBrandedCard } from '@/components/OrgBrandedCard';
import { OrgLogo } from '@/components/OrgLogo';
import { inkOnBrand } from '@/utils/colorUtils';
import { useAuthStore } from '@/store/authStore';
import { themeColor } from '../../../constants/Colors';


export default function OrgControlDashboard() {
  const router = useRouter();
  const { orgId } = useGlobalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const { user, orgMemberships } = useAuthStore();

  const { data: sportsList } = useSocketQuery('sports');
  const { org: orgData, isLoading: isOrgLoading } = useOrgSummary(orgId);

  const sportsMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (Array.isArray(sportsList)) {
      sportsList.forEach((s: any) => {
        map[s.id] = s.name;
      });
    }
    return map;
  }, [sportsList]);

  const isLoading = isOrgLoading || !sportsList || !orgData;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-canvas items-center justify-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
      </SafeAreaView>
    );
  }

  const { primary: primaryColor, secondary: secondaryColor } = orgColors(orgData);
  const sports = orgData.supportedSportIds?.map((id: string) => sportsMap[id] || id) || ['General'];
  const primarySport = sports[0];

  const org = {
    name: orgData.name || 'Unknown Organization',
    sport: primarySport,
    sports: sports,
    primaryColor: primaryColor,
    secondaryColor: secondaryColor,
    teamsCount: orgData.teamCount || 0,
    facilitiesCount: orgData.siteCount || 0,
    membersCount: orgData.memberCount || 0,
  };

  const ink = inkOnBrand(org.primaryColor);
  const isLightBg = ink.isLight;
  const textColor = ink.text;
  const subtextColor = ink.subtext;
  const badgeBgColor = ink.badge;
  const borderColor = ink.border;

  const userMembership = orgMemberships.find(m => m.orgId === orgId);
  let role: string | null = null;
  if (userMembership) {
    if (userMembership.roleId === 'role-org-admin') role = 'Admin';
    else if (userMembership.roleId === 'role-org-staff') role = 'Staff';
    else if (userMembership.roleId === 'role-org-member') role = 'Member';
  } else if (user?.globalRole === 'admin') {
    role = 'Admin';
  }

  const modules = [
    {
      title: 'Profile',
      description: 'Name, logo, colours, about, address and sports',
      icon: 'business-outline' as const,
      route: `/admin/${orgId}/profile` as const,
      color: themeColor(isDark, 'primary-ink'),
      bgColor: 'bg-primary-soft',
    },
    {
      title: 'Settings',
      description: 'Timezone, minors and how the organisation runs',
      icon: 'settings-outline' as const,
      route: `/admin/${orgId}/settings` as const,
      color: themeColor(isDark, 'primary-ink'),
      bgColor: 'bg-primary-soft',
    },
    {
      title: 'People & Roles',
      description: 'Manage coaches, team staff, and athletes',
      icon: 'people-outline' as const,
      route: `/admin/${orgId}/people` as const,
      color: themeColor(isDark, 'success-ink'),
      bgColor: 'bg-success-soft',
    },
    {
      title: 'Teams & Divisions',
      description: 'Create sports squads and assign managers',
      icon: 'trophy-outline' as const,
      route: `/admin/${orgId}/teams` as const,
      color: themeColor(isDark, 'accent-ink'),
      bgColor: 'bg-accent-soft',
    },
    {
      title: 'Sites and Facilities',
      description: 'Configure facilities, playgrounds, and arenas',
      icon: 'location-outline' as const,
      route: `/admin/${orgId}/sites` as const,
      color: themeColor(isDark, 'special-ink'),
      bgColor: 'bg-special-soft',
    },
    {
      title: 'Fixtures & Events',
      description: 'Generate schedules, pools, and score games',
      icon: 'calendar-outline' as const,
      route: `/admin/${orgId}/events` as const,
      color: themeColor(isDark, 'warning-ink'),
      bgColor: 'bg-warning-soft',
    },
    {
      title: 'Leagues & Seasons',
      description: 'Configure standings rules, league rosters, and view leaderboards',
      icon: 'list-outline' as const,
      route: `/admin/${orgId}/leagues` as const,
      color: themeColor(isDark, 'info-ink'),
      bgColor: 'bg-info-soft',
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-line-soft bg-card z-10">
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/organizations')}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={themeColor(isDark, 'primary')} />
          <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-xs tracking-widest text-ink uppercase">
          Org Control Panel
        </Text>
        <View className="w-10 h-2" />
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* BANNER WITH BACKGROUND ACCENT GLOW */}
        <OrgBrandedCard
          primaryColor={org.primaryColor}
          secondaryColor={org.secondaryColor}
          className="p-6 mb-8"
        >
          <View className="flex-row justify-between items-center gap-3 mb-4">
            <View className="flex-row items-center gap-3 flex-1">
              <OrgLogo 
                logo={orgData.logo} 
                settings={orgData.settings} 
                size={40} 
                className="border bg-logo-plate rounded-full" 
                style={{ borderColor: borderColor }}
              />
              <Text style={{ color: textColor }} className="flex-1 font-orbitron-bold text-lg uppercase tracking-wide leading-tight flex-shrink">
                {org.name}
              </Text>
            </View>
            {role && (
              <View style={{ backgroundColor: ink.chip, borderColor: borderColor }} className="flex-row items-center gap-1 border px-2.5 py-1 rounded-lg">
                <Ionicons name="shield-checkmark" size={12} color={textColor} />
                <Text style={{ color: textColor }} className="font-orbitron-bold text-[9px] uppercase tracking-widest">
                  {role}
                </Text>
              </View>
            )}
          </View>

          {/* QUICK STATS ROW */}
          <View style={{ borderTopColor: borderColor }} className="flex-row gap-6 border-t pt-4">
            <View>
              <Text style={{ color: textColor }} className="font-orbitron-bold text-sm">
                {org.sports.length}
              </Text>
              <Text style={{ color: subtextColor }} className="font-inter text-[9px] uppercase tracking-widest mt-0.5">
                {org.sports.length === 1 ? 'Sport' : 'Sports'}
              </Text>
            </View>
            <View>
              <Text style={{ color: textColor }} className="font-orbitron-bold text-sm">
                {org.membersCount}
              </Text>
              <Text style={{ color: subtextColor }} className="font-inter text-[9px] uppercase tracking-widest mt-0.5">
                Members
              </Text>
            </View>
            <View>
              <Text style={{ color: textColor }} className="font-orbitron-bold text-sm">
                {org.teamsCount}
              </Text>
              <Text style={{ color: subtextColor }} className="font-inter text-[9px] uppercase tracking-widest mt-0.5">
                Teams
              </Text>
            </View>
            <View>
              <Text style={{ color: textColor }} className="font-orbitron-bold text-sm">
                {org.facilitiesCount}
              </Text>
              <Text style={{ color: subtextColor }} className="font-inter text-[9px] uppercase tracking-widest mt-0.5">
                Sites
              </Text>
            </View>
          </View>
        </OrgBrandedCard>

        {/* LIST OF MODULES */}
        <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest mb-4">
          Administration Modules
        </Text>
        <View className="space-y-4 mb-8">
          {modules.map((mod) => (
            <TouchableOpacity
              key={mod.title}
              onPress={() => router.push(mod.route as any)}
              activeOpacity={0.7}
            >
              <GlassCard 
                className="border border-line p-4 flex-row items-center justify-between gap-4"
              >
                <View className="flex-row items-center gap-3.5 flex-1">
                  <View className={`w-10 h-10 rounded-xl ${mod.bgColor} items-center justify-center flex-shrink-0`}>
                    <Ionicons name={mod.icon} size={18} color={mod.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-sm text-ink leading-tight">
                      {mod.title}
                    </Text>
                    <Text className="font-inter text-[10px] text-ink-muted mt-0.5 leading-3">
                      {mod.description}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </TouchableOpacity>
          ))}
        </View>


      </ScrollView>
    </SafeAreaView>
  );
}
