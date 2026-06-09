import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { OrgBrandedCard } from '@/components/OrgBrandedCard';
import { OrgLogo } from '@/components/OrgLogo';
import { getContrastColor } from '@/utils/colorUtils';
import { useAuthStore } from '@/store/authStore';

export default function OrgControlDashboard() {
  const router = useRouter();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore(state => state.isConnected);
  const { user, orgMemberships } = useAuthStore();

  const [orgData, setOrgData] = useState<any>(null);
  const [sportsMap, setSportsMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isConnected || !orgId) return;
    
    setIsLoading(true);
    wsService.emit('get_data', { type: 'sports' }, (sportsList: any) => {
      const map: Record<string, string> = {};
      if (Array.isArray(sportsList)) {
        sportsList.forEach((s: any) => {
          map[s.id] = s.name;
        });
      }
      setSportsMap(map);

      wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
        setOrgData(res);
        setIsLoading(false);
      });
    });
  }, [isConnected, orgId]);

  if (isLoading || !orgData) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 items-center justify-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color="#FF3E00" />
      </SafeAreaView>
    );
  }

  const primaryColor = orgData.primaryColor || '#FF3E00';
  const secondaryColor = orgData.secondaryColor || '#00E5FF';
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

  const contrastColor = getContrastColor(org.primaryColor);
  const isLightBg = contrastColor === '#000000';
  const textColor = contrastColor;
  const subtextColor = isLightBg ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.7)';
  const badgeBgColor = isLightBg ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.15)';
  const borderColor = isLightBg ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.15)';

  const userMembership = orgMemberships.find(m => m.orgId === orgId);
  const isOwner = orgData.creatorId === user?.id;

  let role: string | null = null;
  if (isOwner) {
    role = 'Owner';
  } else if (userMembership) {
    if (userMembership.roleId === 'role-org-admin') role = 'Admin';
    else if (userMembership.roleId === 'role-org-staff') role = 'Staff';
    else if (userMembership.roleId === 'role-org-member') role = 'Member';
  } else if (user?.globalRole === 'admin') {
    role = 'Admin';
  }

  const modules = [
    {
      title: 'Org Settings',
      description: 'Configure colors, branding logo, details & rules',
      icon: 'settings-outline' as const,
      route: `/admin/${orgId}/settings` as const,
      color: '#FF3E00',
      bgColor: 'bg-brand-orange/10',
    },
    {
      title: 'People & Roles',
      description: 'Manage coaches, team staff, and athletes',
      icon: 'people-outline' as const,
      route: `/admin/${orgId}/people` as const,
      color: '#10B981',
      bgColor: 'bg-emerald-500/10',
    },
    {
      title: 'Teams & Divisions',
      description: 'Create sports squads and assign managers',
      icon: 'trophy-outline' as const,
      route: `/admin/${orgId}/teams` as const,
      color: '#00E5FF',
      bgColor: 'bg-cyan-500/10',
    },
    {
      title: 'Facilities & Courts',
      description: 'Configure facilities, playgrounds, and arenas',
      icon: 'location-outline' as const,
      route: `/admin/${orgId}/sites` as const,
      color: '#8B5CF6',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Fixtures & Events',
      description: 'Generate schedules, pools, and score games',
      icon: 'calendar-outline' as const,
      route: `/admin/${orgId}/events` as const,
      color: '#F59E0B',
      bgColor: 'bg-amber-500/10',
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/organizations')}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-xs tracking-widest text-slate-800 dark:text-white uppercase">
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
                className="border bg-white rounded-full" 
                style={{ borderColor: borderColor }}
              />
              <Text style={{ color: textColor }} className="flex-1 font-orbitron-bold text-lg uppercase tracking-wide leading-tight flex-shrink">
                {org.name}
              </Text>
            </View>
            {role && (
              <View style={{ backgroundColor: isLightBg ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.25)', borderColor: borderColor }} className="flex-row items-center gap-1 border px-2.5 py-1 rounded-lg">
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
        <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
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
                className="border border-slate-200 dark:border-white/5 p-4 flex-row items-center justify-between gap-4"
              >
                <View className="flex-row items-center gap-3.5 flex-1">
                  <View className={`w-10 h-10 rounded-xl ${mod.bgColor} items-center justify-center flex-shrink-0`}>
                    <Ionicons name={mod.icon} size={18} color={mod.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white leading-tight">
                      {mod.title}
                    </Text>
                    <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-3">
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
