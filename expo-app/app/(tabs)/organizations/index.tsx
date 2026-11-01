import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { GlassCard } from '../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/authStore';
import { useActiveTheme } from '../../../store/settingsStore';
import { wsService } from '../../../services/websocket';
import { useWsStore } from '../../../store/wsStore';
import { orgColors } from '@sk/shared';
import { AddOrgDialog } from '../../../components/org/AddOrgDialog';
import { OrgLogo } from '../../../components/OrgLogo';
import { PrivateOrgChip } from '../../../components/org/PrivateOrgTag';
import { SignInPrompt } from '../../../components/SignInPrompt';
import { OrgBrandedCard } from '@/components/OrgBrandedCard';
import { inkOnBrand } from '@/utils/colorUtils';
import { orgAccess } from '@/utils/orgAccess';
import { themeColor } from '../../../constants/Colors';


export default function OrganizationsPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const isDark = useActiveTheme() === 'dark';
  const { isAuthenticated, user, orgMemberships, teamMemberships, setMemberships } = useAuthStore();
  const isConnected = useWsStore(state => state.isConnected);

  const [organizations, setOrganizations] = useState<any[]>([]);
  const [sportsMap, setSportsMap] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [signInPromptVisible, setSignInPromptVisible] = useState(false);
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
    const access = orgAccess(org.id, user?.globalRole === 'admin', orgMemberships, teamMemberships);

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
      role: access.role,
      // Every org they hold a role in, not only the ones they run — a coach is an org Member.
      isMine: !!access.role,
      // Admin and Staff manage the workspace; a Member opens it for what is theirs there.
      workspaceLabel: access.canManage ? 'Manage' : access.canOpenWorkspace ? 'Open' : null,
    };
  });

  const filteredOrgs = mappedOrgs.filter(org => 
    org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    org.sports.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const myOrgs = filteredOrgs.filter(org => org.isMine);
  const orgs = filteredOrgs;

  // The new org is theirs, and setting it up is what comes next: its workspace opens (2026-10-31).
  // The directory and their memberships are re-read for when they come back to this page.
  const handleOrgCreated = (org: { id: string }) => {
    router.push(`/admin/${org.id}` as any);
    loadOrgsAndSports();
    if (user?.id) {
      wsService.emit('get_data', { type: 'user_memberships', id: user.id }, (membershipRes: any) => {
        if (membershipRes) {
          setMemberships(membershipRes.orgs, membershipRes.teams);
        }
      });
    }
  };

  // Anyone signed in may belong to an org, or set one up.
  const showTabs = isAuthenticated;

  // The page's add action sits in its header, as on every list page — never at the end of the list.
  // A signed-out visitor sees it too, and is told to sign in, so they know it is there.
  const addButton = (
    <TouchableOpacity
      onPress={() => (isAuthenticated ? setModalVisible(true) : setSignInPromptVisible(true))}
      accessibilityRole="button"
      accessibilityLabel="Add organisation"
      className={`flex-row items-center gap-1.5 rounded-xl bg-primary ${isLargeScreen ? 'px-3.5 py-2' : 'w-9 h-9 justify-center mr-4'}`}
    >
      <Ionicons name="add" size={18} color={themeColor(isDark, 'on-primary')} />
      {isLargeScreen ? <Text className="font-inter-bold text-sm text-on-primary">Add organisation</Text> : null}
    </TouchableOpacity>
  );

  // On a phone the header is the tab navigator's, one level up from this page's stack.
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.getParent()?.setOptions({ headerRight: isLargeScreen ? undefined : () => addButton });
  }, [navigation, isAuthenticated, isLargeScreen, isDark]);

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        {isLargeScreen && (
          <View className="mb-6 flex-row items-start gap-4">
            <View className="flex-1">
              <Text className="font-orbitron-bold text-2xl tracking-widest text-ink uppercase mb-2">
                Organisations
              </Text>
              <Text className="font-inter text-sm text-ink-muted">
                Browse and search active sports clubs, schools, and leagues on ScoreKeeper.
              </Text>
            </View>
            {addButton}
          </View>
        )}

        {/* SEARCH BAR */}
        <View className="flex-row items-center bg-card border border-line rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color={themeColor(isDark, 'ink-muted')} />
          <TextInput
            placeholder="Search organisations..."
            placeholderTextColor={themeColor(isDark, 'ink-muted')}
            className="flex-1 font-inter text-ink text-sm ml-2.5 outline-none"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* TABS */}
        {showTabs && (
          <View className="flex-row border-b border-line mb-6">
            <TouchableOpacity
              onPress={() => setActiveTab('my')}
              className={`flex-1 pb-3 items-center border-b-2 ${
                activeTab === 'my' ? 'border-ink' : 'border-transparent'
              }`}
            >
              <Text className={`font-orbitron-bold text-xs uppercase tracking-wider ${
                activeTab === 'my' ? 'text-ink font-orbitron-bold' : 'text-ink-muted'
              }`}>
                My Organisations
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('all')}
              className={`flex-1 pb-3 items-center border-b-2 ${
                activeTab === 'all' ? 'border-ink' : 'border-transparent'
              }`}
            >
              <Text className={`font-orbitron-bold text-xs uppercase tracking-wider ${
                activeTab === 'all' ? 'text-ink font-orbitron-bold' : 'text-ink-muted'
              }`}>
                All Organisations
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB CONTENTS */}
        {isLoading ? (
          <View className="py-20 items-center justify-center">
            <Text className="font-inter text-ink-muted">Loading organisations...</Text>
          </View>
        ) : showTabs && activeTab === 'my' ? (
          <View className="mb-8">
            <View className="gap-4">
              {myOrgs.length === 0 ? (
                <GlassCard className="border border-line p-6 items-center">
                  <Ionicons name="business-outline" size={32} color={themeColor(isDark, 'ink-muted')} className="mb-3" />
                  <Text className="font-orbitron-bold text-sm text-ink-soft text-center mb-1 uppercase tracking-wide">
                    {searchQuery.trim() ? "No Matching Organisations" : "No Organisations Yet"}
                  </Text>
                  <Text className="font-inter text-xs text-ink-muted text-center mb-5 leading-4">
                    {searchQuery.trim()
                      ? `None of your organisations match "${searchQuery}".`
                      : "You're not part of any organisations yet. Set one up with Add organisation."
                    }
                  </Text>
                </GlassCard>
              ) : (
                myOrgs.map((org) => {
                  const { primary: primaryColor, secondary: secondaryColor } = orgColors(org);
                  const ink = inkOnBrand(primaryColor);
                  const isLightBg = ink.isLight;
                  const textColor = ink.text;
                  const subtextColor = ink.subtext;
                  const badgeBgColor = ink.badge;
                  const borderColor = ink.border;

                  return (
                    <OrgBrandedCard
                      key={org.id}
                      testID={`my-org-${org.id}`}
                      primaryColor={primaryColor}
                      secondaryColor={secondaryColor}
                      className="p-5"
                    >
                      <TouchableOpacity 
                        onPress={() => router.push(`/organizations/${org.id}` as any)}
                        activeOpacity={0.7}
                      >
                        <View className="flex-row justify-between items-center gap-3 mb-3">
                          <View className="flex-row items-center gap-3 flex-1">
                            <OrgLogo 
                              logo={org.logo} 
                              size={40} 
                              className="border bg-logo-plate rounded-full" 
                              style={{ borderColor: borderColor }}
                            />
                            <Text style={{ color: textColor }} className="flex-1 font-orbitron-bold text-lg uppercase tracking-wide leading-tight flex-shrink">
                              {org.name}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1.5">
                            {org.isPrivate ? <PrivateOrgChip textColor={textColor} chipColor={ink.chip} borderColor={borderColor} /> : null}
                            <View style={{ backgroundColor: ink.chip, borderColor: borderColor }} className="flex-row items-center gap-1 border px-2.5 py-0.5 rounded">
                              <Ionicons name="shield-checkmark" size={12} color={textColor} />
                              <Text style={{ color: textColor }} className="font-orbitron-bold text-[9px] uppercase tracking-widest">
                                {org.role}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View className="flex-row gap-4 mb-4">
                          <View className="flex-row items-center gap-1">
                            <Ionicons name="trophy-outline" size={14} color={textColor} />
                            <Text style={{ color: subtextColor }} className="font-inter text-xs">
                              {org.sports.length} {org.sports.length === 1 ? 'Sport' : 'Sports'}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <Ionicons name="people-outline" size={14} color={textColor} />
                            <Text style={{ color: subtextColor }} className="font-inter text-xs">
                              {org.membersCount} {org.membersCount === '1' ? 'Member' : 'Members'}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <Ionicons name="shirt-outline" size={14} color={textColor} />
                            <Text style={{ color: subtextColor }} className="font-inter text-xs">
                              {org.teamsCount} {org.teamsCount === 1 ? 'Team' : 'Teams'}
                            </Text>
                          </View>
                          <View className="flex-row items-center gap-1">
                            <Ionicons name="location-outline" size={14} color={textColor} />
                            <Text style={{ color: subtextColor }} className="font-inter text-xs">
                              {org.facilitiesCount} {org.facilitiesCount === 1 ? 'Facility' : 'Facilities'}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>

                      {/* A restricted minor's membership has no workspace; the card itself opens the profile. */}
                      {org.workspaceLabel && (
                        <View style={{ borderTopColor: borderColor }} className="mt-2 border-t pt-3">
                          <TouchableOpacity
                            style={{
                              backgroundColor: ink.button,
                              borderColor: borderColor,
                            }}
                            className="w-full border py-2.5 rounded-lg items-center justify-center active:opacity-85"
                            onPress={() => router.push(`/admin/${org.id}` as any)}
                          >
                            <Text style={{ color: textColor }} className="font-inter-bold text-sm">
                              {org.workspaceLabel} Workspace
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </OrgBrandedCard>
                  );
                })
              )}

            </View>
          </View>
        ) : (
          <View className="gap-4">
            {orgs.length === 0 ? (
              <GlassCard className="border border-line p-6 items-center">
                <Ionicons name="business-outline" size={32} color={themeColor(isDark, 'ink-muted')} className="mb-3" />
                <Text className="font-orbitron-bold text-sm text-ink-soft text-center mb-1 uppercase tracking-wide">
                  {searchQuery.trim() ? "No Matching Organisations" : "No Organisations"}
                </Text>
                <Text className="font-inter text-xs text-ink-muted text-center mb-2 leading-4">
                  {searchQuery.trim()
                    ? `No organisations found matching "${searchQuery}".`
                    : "There are no active organisations on ScoreKeeper yet."
                  }
                </Text>
              </GlassCard>
            ) : (
              orgs.map((org) => {
              const { primary: primaryColor, secondary: secondaryColor } = orgColors(org);
              const ink = inkOnBrand(primaryColor);
              const isLightBg = ink.isLight;
              const textColor = ink.text;
              const subtextColor = ink.subtext;
              const badgeBgColor = ink.badge;
              const borderColor = ink.border;

              return (
                <OrgBrandedCard
                  key={org.id}
                  testID={`org-${org.id}`}
                  primaryColor={primaryColor}
                  secondaryColor={secondaryColor}
                  className="p-5"
                >
                  <TouchableOpacity
                    onPress={() => router.push(`/organizations/${org.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <View className="flex-row justify-between items-center gap-3 mb-4">
                      <View className="flex-row items-center gap-3 flex-1">
                        <OrgLogo 
                          logo={org.logo} 
                          size={40} 
                          className="border bg-logo-plate rounded-full" 
                          style={{ borderColor: borderColor }}
                        />
                        <Text style={{ color: textColor }} className="flex-1 font-orbitron-bold text-lg uppercase tracking-wide flex-shrink">
                          {org.name}
                        </Text>
                      </View>
                      
                      {org.isPrivate ? <PrivateOrgChip textColor={textColor} chipColor={ink.chip} borderColor={borderColor} /> : null}
                      {org.isMine ? (
                        <View style={{ backgroundColor: ink.chip, borderColor: borderColor }} className="flex-row items-center gap-1 border px-2.5 py-0.5 rounded">
                          <Ionicons name="shield-checkmark" size={12} color={textColor} />
                          <Text style={{ color: textColor }} className="font-orbitron-bold text-[9px] uppercase tracking-widest">
                            {org.role}
                          </Text>
                        </View>
                      ) : (
                        <View style={{ backgroundColor: ink.chip, borderColor: borderColor }} className="flex-row items-center gap-1 border px-2.5 py-0.5 rounded">
                          <Ionicons name="people-outline" size={12} color={textColor} />
                          <Text style={{ color: textColor }} className="font-orbitron-bold text-[9px] uppercase tracking-widest">
                            {org.membersCount}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* STATS BLOCKS */}
                    <View className="flex-row gap-6 mb-4">
                      <View>
                        <Text style={{ color: textColor }} className="font-orbitron-bold text-base leading-none">
                          {org.sports.length}
                        </Text>
                        <Text style={{ color: subtextColor }} className="font-inter text-[9px] mt-1 uppercase tracking-wider">
                          {org.sports.length === 1 ? 'Sport' : 'Sports'}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ color: textColor }} className="font-orbitron-bold text-base leading-none">
                          {org.membersCount}
                        </Text>
                        <Text style={{ color: subtextColor }} className="font-inter text-[9px] mt-1 uppercase tracking-wider">
                          {org.membersCount === '1' ? 'Member' : 'Members'}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ color: textColor }} className="font-orbitron-bold text-base leading-none">
                          {org.teamsCount}
                        </Text>
                        <Text style={{ color: subtextColor }} className="font-inter text-[9px] mt-1 uppercase tracking-wider">
                          {org.teamsCount === 1 ? 'Team' : 'Teams'}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ color: textColor }} className="font-orbitron-bold text-base leading-none">
                          {org.facilitiesCount}
                        </Text>
                        <Text style={{ color: subtextColor }} className="font-inter text-[9px] mt-1 uppercase tracking-wider">
                          {org.facilitiesCount === 1 ? 'Facility' : 'Facilities'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  <View className="flex-row gap-2 mt-1">
                    <TouchableOpacity
                      style={{
                        backgroundColor: ink.button,
                        borderColor: borderColor,
                      }}
                      className="flex-1 border py-2 rounded-lg items-center justify-center active:opacity-85"
                      onPress={() => router.push(`/organizations/${org.id}` as any)}
                    >
                      <Text style={{ color: textColor }} className="font-inter-bold text-sm">
                        View Profile
                      </Text>
                    </TouchableOpacity>
                    {org.workspaceLabel && (
                      <TouchableOpacity
                        style={{
                          backgroundColor: ink.text,
                          borderColor: 'transparent',
                        }}
                        className="flex-1 border py-2 rounded-lg items-center justify-center active:opacity-85"
                        onPress={() => router.push(`/admin/${org.id}` as any)}
                      >
                        <Text style={{ color: ink.inverse }} className="font-inter-bold text-sm">
                          {org.workspaceLabel}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </OrgBrandedCard>
              );
            })
            )}
          </View>
        )}
      </ScrollView>

      <SignInPrompt
        isOpen={signInPromptVisible}
        onClose={() => setSignInPromptVisible(false)}
        title="Sign in to add an organisation"
        description="Set up your school, club or league on ScoreKeeper, and run its teams, fixtures and results."
      />

      <AddOrgDialog
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCreated={handleOrgCreated}
      />
    </View>
  );
}

