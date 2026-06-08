import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, useWindowDimensions, Modal, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/authStore';
import { useActiveTheme } from '../../../store/settingsStore';
import { wsService } from '../../../services/websocket';
import { useWsStore } from '../../../store/wsStore';
import { SocketAction } from '@sk/types';
import { getOrgLogoUrl } from '../../../services/api';

export default function OrganizationsPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const isDark = useActiveTheme() === 'dark';
  const { isAuthenticated, user, orgMemberships, setMemberships } = useAuthStore();
  const isConnected = useWsStore(state => state.isConnected);

  const [organizations, setOrganizations] = useState<any[]>([]);
  const [sportsMap, setSportsMap] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSport, setNewOrgSport] = useState('Football');
  const [activeTab, setActiveTab] = useState<'my' | 'all'>('my');

  const loadOrgsAndSports = () => {
    if (!isConnected) return;
    setIsLoading(true);

    wsService.emit('get_data', { type: 'sports' }, (sportsList: any) => {
      const map: Record<string, string> = {};
      if (Array.isArray(sportsList)) {
        sportsList.forEach((s: any) => {
          map[s.id] = s.name;
        });
      }
      setSportsMap(map);

      wsService.emit('get_data', { type: 'organizations', limit: 1000 }, (res: any) => {
        setIsLoading(false);
        if (res && Array.isArray(res.items)) {
          setOrganizations(res.items);
        } else {
          setOrganizations([]);
        }
      });
    });
  };

  useEffect(() => {
    loadOrgsAndSports();
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected || organizations.length === 0) return;

    // Dynamically join the summary room for each organization loaded in the list
    const unsubscribes = organizations.map(org => {
      const room = `org:${org.id}:summary`;
      return wsService.subscribeToRoom(room);
    });

    const handleUpdate = (event: any) => {
      if (event && event.type === 'ORGANIZATION_UPDATED') {
        if (event.data && event.data.id) {
          setOrganizations(prev =>
            prev.map(org => org.id === event.data.id ? { ...org, ...event.data } : org)
          );
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      unsubscribes.forEach(unsub => unsub());
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, organizations.map(org => org.id).join(',')]);

  // Map database properties dynamically
  const mappedOrgs = organizations.map(org => {
    const userMembership = orgMemberships.find(m => m.orgId === org.id);
    const isOwner = org.creatorId === user?.id;
    
    const isManaged = (user?.globalRole === 'admin') || (userMembership && (userMembership.roleId === 'role-org-admin' || userMembership.roleId === 'role-org-staff'));

    let role = 'Guest';
    if (isOwner) {
      role = 'Owner';
    } else if (userMembership) {
      if (userMembership.roleId === 'role-org-admin') role = 'Admin';
      else if (userMembership.roleId === 'role-org-staff') role = 'Staff';
      else if (userMembership.roleId === 'role-org-member') role = 'Member';
    } else if (user?.globalRole === 'admin') {
      role = 'Admin';
    }

    const sports = org.supportedSportIds?.map((id: string) => sportsMap[id] || id) || [];
    const hasFootball = sports.some((s: string) => s.toLowerCase().includes('football'));
    const icon = hasFootball ? ('football-outline' as const) : ('trophy-outline' as const);

    return {
      ...org,
      sports: sports.length > 0 ? sports : ['General'],
      icon,
      teamsCount: org.teamCount || 0,
      eventsCount: org.eventCount || 0,
      facilitiesCount: org.siteCount || 0,
      membersCount: String(org.memberCount || 0),
      role,
      isManaged,
    };
  });

  const filteredOrgs = mappedOrgs.filter(org => 
    org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    org.sports.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const managedOrgs = filteredOrgs.filter(org => org.isManaged);
  const orgs = filteredOrgs;

  const handleCreateOrg = () => {
    if (!newOrgName.trim()) return;

    const sportId = newOrgSport.trim().toLowerCase().replace(/\s+/g, '-');

    const payload = {
      name: newOrgName.trim(),
      supportedSportIds: [sportId],
      creatorId: user?.id,
      isActive: true,
    };

    wsService.emit('action', { type: SocketAction.ADD_ORG, payload }, (res: any) => {
      if (res) {
        console.log('[OrganizationsPage] Created new organization:', res);
        loadOrgsAndSports();

        if (user?.id) {
          wsService.emit('get_data', { type: 'user_memberships', id: user.id }, (membershipRes: any) => {
            if (membershipRes) {
              setMemberships(membershipRes.orgs, membershipRes.teams);
            }
          });
        }
      } else {
        console.error('[OrganizationsPage] Failed to create organization');
      }
    });

    setNewOrgName('');
    setNewOrgSport('Football');
    setModalVisible(false);
  };

  const showTabs = isAuthenticated && (user?.globalRole === 'admin' || user?.isAdminOrCoach);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        {isLargeScreen && (
          <View className="mb-6">
            <Text className="font-orbitron-bold text-2xl tracking-widest text-slate-800 dark:text-white uppercase mb-2">
              Organizations
            </Text>
            <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">
              Browse and search active sports clubs, schools, and leagues on ScoreKeeper.
            </Text>
          </View>
        )}

        {/* SEARCH BAR */}
        <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Search organizations..."
            placeholderTextColor="#94A3B8"
            className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2.5 outline-none"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* TABS */}
        {showTabs && (
          <View className="flex-row border-b border-slate-200 dark:border-white/5 mb-6">
            <TouchableOpacity
              onPress={() => setActiveTab('my')}
              className={`flex-1 pb-3 items-center border-b-2 ${
                activeTab === 'my' ? 'border-brand-orange' : 'border-transparent'
              }`}
            >
              <Text className={`font-orbitron-bold text-xs uppercase tracking-wider ${
                activeTab === 'my' ? 'text-brand-orange font-orbitron-bold' : 'text-slate-400 dark:text-slate-500'
              }`}>
                My Organizations
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('all')}
              className={`flex-1 pb-3 items-center border-b-2 ${
                activeTab === 'all' ? 'border-brand-orange' : 'border-transparent'
              }`}
            >
              <Text className={`font-orbitron-bold text-xs uppercase tracking-wider ${
                activeTab === 'all' ? 'text-brand-orange font-orbitron-bold' : 'text-slate-400 dark:text-slate-500'
              }`}>
                All Organizations
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB CONTENTS */}
        {isLoading ? (
          <View className="py-20 items-center justify-center">
            <Text className="font-inter text-slate-500 dark:text-slate-400">Loading organizations...</Text>
          </View>
        ) : showTabs && activeTab === 'my' ? (
          <View className="mb-8">
            <View className="space-y-4">
              {managedOrgs.length === 0 ? (
                <GlassCard className="border border-slate-200 dark:border-white/5 p-6 items-center">
                  <Ionicons name="business-outline" size={32} color="#94A3B8" className="mb-3" />
                  <Text className="font-orbitron-bold text-sm text-slate-700 dark:text-slate-300 text-center mb-1 uppercase tracking-wide">
                    No Managed Organizations
                  </Text>
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 text-center mb-5 leading-4">
                    You don't manage any organizations yet. Create one to get started.
                  </Text>
                </GlassCard>
              ) : (
                managedOrgs.map((org) => (
                  <GlassCard key={org.id} className="border border-slate-200 dark:border-white/5 p-5 relative overflow-hidden">
                    {/* Glowing vertical highlight bar for premium managing state */}
                    <View className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-orange" />
                    
                    <TouchableOpacity 
                      onPress={() => router.push(`/organizations/${org.id}` as any)}
                      className="pl-1.5 flex-1"
                      activeOpacity={0.7}
                    >
                      <View className="flex-row justify-between items-center mb-3">
                        {/* SPORTS BADGES */}
                        <View className="flex-row flex-wrap gap-1.5 max-w-[70%]">
                          {org.sports.map((sport: string) => (
                            <View key={sport} className="bg-slate-100 dark:bg-white/10 px-2.5 py-0.5 rounded-full border border-slate-200/50 dark:border-white/5">
                              <Text className={`font-inter-bold text-[8px] uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                {sport}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <View className="flex-row items-center gap-1 bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/30 px-2.5 py-0.5 rounded">
                          <Ionicons name="shield-checkmark" size={12} color={isDark ? "#00E5FF" : "#0891B2"} />
                          <Text className={`font-orbitron-bold text-[9px] uppercase tracking-widest ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>
                            {org.role}
                          </Text>
                        </View>
                      </View>

                      <View className="flex-row items-center gap-3 mb-3">
                        {org.logo ? (
                          <Image source={{ uri: getOrgLogoUrl(org.logo, 'medium') }} className="w-10 h-10 rounded-full border border-slate-200 dark:border-white/10 bg-white" />
                        ) : (
                          <View className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center border border-slate-200 dark:border-white/10">
                            <Ionicons name="business" size={20} color="#94A3B8" />
                          </View>
                        )}
                        <Text className={`flex-1 font-orbitron-bold text-lg uppercase tracking-wide leading-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>
                          {org.name}
                        </Text>
                      </View>

                      <View className="flex-row gap-6 mb-4">
                        <View className="flex-row items-center gap-1.5">
                          <Ionicons name="people-outline" size={15} color="#FF3E00" />
                          <Text className={`font-inter text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            {org.teamsCount} Teams
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-1.5">
                          <Ionicons name="location-outline" size={15} color="#FF3E00" />
                          <Text className={`font-inter text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            {org.facilitiesCount} Facilities
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    <View className="mt-2 pl-1.5 border-t border-slate-100 dark:border-white/5 pt-3">
                      <Button
                        title="Manage Workspace"
                        variant="secondary"
                        onPress={() => router.push(`/admin/${org.id}` as any)}
                        className="w-full shadow-sm py-2"
                      />
                    </View>
                  </GlassCard>
                ))
              )}

              <Button
                title="+ Add Organization"
                variant="primary"
                onPress={() => setModalVisible(true)}
                className="w-full shadow-sm py-2.5 mt-2"
              />
            </View>
          </View>
        ) : (
          <View className="space-y-4">
            {orgs.map((org) => {
              const showManage = isAuthenticated && org.isManaged && (user?.globalRole === 'admin' || user?.isAdminOrCoach);
              return (
                <GlassCard key={org.id} className="border border-slate-200 dark:border-white/5 shadow-sm p-5 relative overflow-hidden">
                  {showManage && <View className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-orange" />}
                  
                  <TouchableOpacity
                    onPress={() => router.push(`/organizations/${org.id}` as any)}
                    activeOpacity={0.7}
                    className={showManage ? "pl-1.5" : ""}
                  >
                    <View className="flex-row justify-between items-start mb-3">
                      <View className="flex-row flex-wrap gap-1.5 max-w-[70%]">
                        {org.sports.map((sport: string) => (
                          <View key={sport} className="flex-row items-center gap-1 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full border border-slate-200/50 dark:border-white/5">
                            <Ionicons name={org.icon} size={10} color="#FF3E00" />
                            <Text className={`font-inter-bold text-[8px] uppercase tracking-wider ml-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                              {sport}
                            </Text>
                          </View>
                        ))}
                      </View>
                      
                      {showManage ? (
                        <View className="flex-row items-center gap-1 bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/30 px-2.5 py-0.5 rounded">
                          <Ionicons name="shield-checkmark" size={12} color={isDark ? "#00E5FF" : "#0891B2"} />
                          <Text className={`font-orbitron-bold text-[9px] uppercase tracking-widest ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>
                            {org.role}
                          </Text>
                        </View>
                      ) : (
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="people-outline" size={12} color="#94A3B8" />
                          <Text className={`font-inter text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {org.membersCount} Members
                          </Text>
                        </View>
                      )}
                    </View>

                    <View className="flex-row items-center gap-3 mb-4">
                      {org.logo ? (
                        <Image source={{ uri: getOrgLogoUrl(org.logo, 'medium') }} className="w-10 h-10 rounded-full border border-slate-200 dark:border-white/10 bg-white" />
                      ) : (
                        <View className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center border border-slate-200 dark:border-white/10">
                          <Ionicons name="business" size={20} color="#94A3B8" />
                        </View>
                      )}
                      <Text className={`flex-1 font-orbitron-bold text-lg uppercase tracking-wide ${isDark ? 'text-white' : 'text-slate-800'}`}>
                        {org.name}
                      </Text>
                    </View>

                    {/* STATS BLOCKS */}
                    <View className="flex-row gap-6 mb-4">
                      <View>
                        <Text className={`font-orbitron-bold text-base leading-none ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          {org.teamsCount}
                        </Text>
                        <Text className={`font-inter text-[9px] mt-1 uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          Teams
                        </Text>
                      </View>
                      <View>
                        <Text className={`font-orbitron-bold text-base leading-none ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          {org.eventsCount}
                        </Text>
                        <Text className={`font-inter text-[9px] mt-1 uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          Events
                        </Text>
                      </View>
                      {showManage && (
                        <View>
                          <Text className={`font-orbitron-bold text-base leading-none ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            {org.facilitiesCount}
                          </Text>
                          <Text className={`font-inter text-[9px] mt-1 uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            Facilities
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>

                  <View className={`flex-row gap-2 mt-1 ${showManage ? "pl-1.5" : ""}`}>
                    <Button
                      title="View Profile"
                      variant="secondary"
                      onPress={() => router.push(`/organizations/${org.id}` as any)}
                      className="flex-1 shadow-sm mt-1"
                    />
                    {showManage && (
                      <Button
                        title="Manage"
                        variant="primary"
                        onPress={() => router.push(`/admin/${org.id}` as any)}
                        className="flex-1 shadow-sm mt-1"
                      />
                    )}
                  </View>
                </GlassCard>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* QUICK CREATION MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-slate-950/80 px-6">
          <View className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-6 rounded-2xl shadow-2xl">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white uppercase tracking-wide">
                Add Organization
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-1 active:opacity-70">
                <Ionicons name="close" size={22} color={isDark ? "white" : "#475569"} />
              </TouchableOpacity>
            </View>

            <View className="mb-4">
              <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                Organization Name
              </Text>
              <TextInput
                value={newOrgName}
                onChangeText={setNewOrgName}
                placeholder="e.g. Springvale High"
                placeholderTextColor="#94A3B8"
                className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-800 dark:text-white outline-none"
                autoFocus
              />
            </View>

            <View className="mb-6">
              <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                Primary Sport
              </Text>
              <TextInput
                value={newOrgSport}
                onChangeText={setNewOrgSport}
                placeholder="e.g. Football"
                placeholderTextColor="#94A3B8"
                className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-800 dark:text-white outline-none"
              />
              
              {/* Quick Select Sports */}
              <View className="flex-row flex-wrap gap-2 mt-3">
                {['Football', 'Rugby Union', 'Basketball', 'Tennis'].map((sport) => (
                  <TouchableOpacity
                    key={sport}
                    onPress={() => setNewOrgSport(sport)}
                    className={`px-3 py-1 rounded-full border ${
                      newOrgSport === sport
                        ? 'bg-brand-orange/15 border-brand-orange'
                        : 'bg-transparent border-slate-200 dark:border-white/5'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${
                      newOrgSport === sport
                        ? 'text-brand-orange font-inter-bold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      {sport}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View className="flex-row gap-3">
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setModalVisible(false)}
                className="flex-1"
              />
              <Button
                title="Add"
                variant="primary"
                onPress={handleCreateOrg}
                disabled={!newOrgName.trim()}
                className="flex-1"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

