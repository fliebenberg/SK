import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, useWindowDimensions, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/authStore';
import { useActiveTheme } from '../../../store/settingsStore';

export default function OrganizationsPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const isDark = useActiveTheme() === 'dark';
  const { isAuthenticated, user } = useAuthStore();

  const [organizations, setOrganizations] = useState([
    {
      id: 'org-1',
      name: 'Premier Rugby Union',
      sports: ['Rugby Union', 'Seven-a-Side'],
      icon: 'trophy-outline' as const,
      teamsCount: 24,
      eventsCount: 3,
      membersCount: '1,450',
      role: 'Owner',
      facilitiesCount: 3,
      isManaged: true,
    },
    {
      id: 'org-2',
      name: 'Metro Football League',
      sports: ['Football', 'Futsal'],
      icon: 'football-outline' as const,
      teamsCount: 48,
      eventsCount: 6,
      membersCount: '3,200',
      role: 'Owner',
      facilitiesCount: 6,
      isManaged: true,
    },
  ]);

  const [modalVisible, setModalVisible] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSport, setNewOrgSport] = useState('Football');
  const [activeTab, setActiveTab] = useState<'my' | 'all'>('my');

  const managedOrgs = organizations.filter(org => org.isManaged);
  const orgs = organizations;

  const handleCreateOrg = () => {
    if (!newOrgName.trim()) return;

    const newOrg = {
      id: `org-${Date.now()}`,
      name: newOrgName.trim(),
      sports: [newOrgSport.trim() || 'General'],
      icon: (newOrgSport.toLowerCase().includes('football') ? 'football-outline' : 'trophy-outline') as any,
      teamsCount: 0,
      eventsCount: 0,
      membersCount: '1',
      role: 'Owner',
      facilitiesCount: 0,
      isManaged: true,
    };

    setOrganizations(prev => [newOrg, ...prev]);
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

        {/* SEARCH BAR PLACEHOLDER */}
        <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Search organizations..."
            placeholderTextColor="#94A3B8"
            className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2.5 outline-none"
            editable={false}
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
        {showTabs && activeTab === 'my' ? (
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
                          {org.sports.map((sport) => (
                            <View key={sport} className="bg-slate-100 dark:bg-white/10 px-2.5 py-0.5 rounded-full border border-slate-200/50 dark:border-white/5">
                              <Text className="font-inter-bold text-[8px] text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                                {sport}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <View className="flex-row items-center gap-1 bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/30 px-2.5 py-0.5 rounded">
                          <Ionicons name="shield-checkmark" size={12} color={isDark ? "#00E5FF" : "#0891B2"} />
                          <Text className="font-orbitron-bold text-[9px] text-cyan-700 dark:text-cyan-400 uppercase tracking-widest">
                            {org.role}
                          </Text>
                        </View>
                      </View>

                      <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white uppercase tracking-wide leading-tight mb-3">
                        {org.name}
                      </Text>

                      <View className="flex-row gap-6 mb-4">
                        <View className="flex-row items-center gap-1.5">
                          <Ionicons name="people-outline" size={15} color="#FF3E00" />
                          <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                            {org.teamsCount} Teams
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-1.5">
                          <Ionicons name="location-outline" size={15} color="#FF3E00" />
                          <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
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
                        {org.sports.map((sport) => (
                          <View key={sport} className="flex-row items-center gap-1 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full border border-slate-200/50 dark:border-white/5">
                            <Ionicons name={org.icon} size={10} color="#FF3E00" />
                            <Text className="font-inter-bold text-[8px] text-slate-700 dark:text-slate-300 uppercase tracking-wider ml-1">
                              {sport}
                            </Text>
                          </View>
                        ))}
                      </View>
                      
                      {showManage ? (
                        <View className="flex-row items-center gap-1 bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/30 px-2.5 py-0.5 rounded">
                          <Ionicons name="shield-checkmark" size={12} color={isDark ? "#00E5FF" : "#0891B2"} />
                          <Text className="font-orbitron-bold text-[9px] text-cyan-700 dark:text-cyan-400 uppercase tracking-widest">
                            {org.role}
                          </Text>
                        </View>
                      ) : (
                        <View className="flex-row items-center gap-1">
                          <Ionicons name="people-outline" size={12} color="#94A3B8" />
                          <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                            {org.membersCount} Members
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white mb-4 uppercase tracking-wide">
                      {org.name}
                    </Text>

                    {/* STATS BLOCKS */}
                    <View className="flex-row gap-6 mb-4">
                      <View>
                        <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300 leading-none">
                          {org.teamsCount}
                        </Text>
                        <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
                          Teams
                        </Text>
                      </View>
                      <View>
                        <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300 leading-none">
                          {org.eventsCount}
                        </Text>
                        <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
                          Events
                        </Text>
                      </View>
                      {showManage && (
                        <View>
                          <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300 leading-none">
                            {org.facilitiesCount}
                          </Text>
                          <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
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

