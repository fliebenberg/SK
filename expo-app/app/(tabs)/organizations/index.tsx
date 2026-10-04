import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, useWindowDimensions, Modal, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/authStore';
import { useActiveTheme } from '../../../store/settingsStore';
import { wsService } from '../../../services/websocket';
import { sendAction } from '../../../services/actions';
import { useWsStore } from '../../../store/wsStore';
import { ORG_SHORT_CODE_MAX_LENGTH, SocketAction, OrganizationType, orgColors, DEFAULT_ORG_PRIMARY_COLOR, DEFAULT_ORG_SECONDARY_COLOR } from '@sk/shared';
import { BrandColorsField, brandColorsProblem } from '../../../components/org/BrandColorsField';
import { useOrgShortCode } from '../../../hooks/useOrgShortCode';
import { OrgLogo } from '../../../components/OrgLogo';
import { OrgBrandedCard } from '@/components/OrgBrandedCard';
import { inkOnBrand } from '@/utils/colorUtils';
import { deviceTimeZone } from '@/utils/dates';
import { themeColor } from '../../../constants/Colors';


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
  const [newOrgType, setNewOrgType] = useState<OrganizationType | null>(null);
  const [newOrgCustomType, setNewOrgCustomType] = useState('');
  // The app's two colours until changed, so a new org has two either way (2026-10-03).
  const [newOrgColors, setNewOrgColors] = useState({ primary: DEFAULT_ORG_PRIMARY_COLOR, secondary: DEFAULT_ORG_SECONDARY_COLOR });
  const shortCode = useOrgShortCode();
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
    const isManaged = (user?.globalRole === 'admin') || (userMembership && (userMembership.roleId === 'role-org-admin' || userMembership.roleId === 'role-org-staff'));

    let role = 'Guest';
    if (userMembership) {
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
    if (!newOrgName.trim() || !newOrgType || !shortCode.shortCode) return;
    if (newOrgType === 'OTHER' && !newOrgCustomType.trim()) return;
    if (brandColorsProblem(newOrgColors.primary, newOrgColors.secondary)) return;

    const matchedSportId = Object.keys(sportsMap).find(
      (id) => sportsMap[id].toLowerCase() === newOrgSport.trim().toLowerCase()
    ) || (newOrgSport.trim() ? newOrgSport.trim() : undefined);

    const payload = {
      name: newOrgName.trim(),
      shortName: shortCode.shortCode,
      supportedSportIds: matchedSportId ? [matchedSportId] : [],
      creatorId: user?.id,
      isActive: true,
      type: newOrgType,
      customType: newOrgType === 'OTHER' ? newOrgCustomType.trim() : undefined,
      primaryColor: newOrgColors.primary,
      // Cleared means "not set": painted as the primary.
      secondaryColor: newOrgColors.secondary || null,
      // Whoever sets an organisation up is most likely where it plays (DATE-2); changeable in its settings.
      timezone: deviceTimeZone(),
    };

    sendAction(SocketAction.ADD_ORG, payload).then(result => {
      // A refusal used to be read as the new org (`if (res)`), and the form was cleared and closed
      // before any reply — so a failed create lost what was typed. Now it stays open to retry.
      if (!result.ok) return;
      loadOrgsAndSports();

      if (user?.id) {
        wsService.emit('get_data', { type: 'user_memberships', id: user.id }, (membershipRes: any) => {
          if (membershipRes) {
            setMemberships(membershipRes.orgs, membershipRes.teams);
          }
        });
      }

      setNewOrgName('');
      setNewOrgSport('Football');
      setNewOrgType(null);
      setNewOrgCustomType('');
      setNewOrgColors({ primary: DEFAULT_ORG_PRIMARY_COLOR, secondary: DEFAULT_ORG_SECONDARY_COLOR });
      shortCode.reset();
      setModalVisible(false);
    });
  };

  const orgTypes: { value: OrganizationType; label: string }[] = [
    { value: 'SCHOOL', label: 'School' },
    { value: 'CLUB', label: 'Sports Club' },
    { value: 'ACADEMY', label: 'Academy' },
    { value: 'LEAGUE', label: 'League' },
    { value: 'CORPORATE', label: 'Corporate' },
    { value: 'COMMUNITY', label: 'Community' },
    { value: 'OTHER', label: 'Other' },
  ];

  const showTabs = isAuthenticated && (user?.globalRole === 'admin' || user?.isAdminOrCoach);

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        {isLargeScreen && (
          <View className="mb-6">
            <Text className="font-orbitron-bold text-2xl tracking-widest text-ink uppercase mb-2">
              Organizations
            </Text>
            <Text className="font-inter text-sm text-ink-muted">
              Browse and search active sports clubs, schools, and leagues on ScoreKeeper.
            </Text>
          </View>
        )}

        {/* SEARCH BAR */}
        <View className="flex-row items-center bg-card border border-line rounded-xl px-4 py-3 mb-6 shadow-sm">
          <Ionicons name="search-outline" size={18} color={themeColor(isDark, 'ink-muted')} />
          <TextInput
            placeholder="Search organizations..."
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
                activeTab === 'my' ? 'border-primary' : 'border-transparent'
              }`}
            >
              <Text className={`font-orbitron-bold text-xs uppercase tracking-wider ${
                activeTab === 'my' ? 'text-primary-ink font-orbitron-bold' : 'text-ink-muted'
              }`}>
                My Organizations
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('all')}
              className={`flex-1 pb-3 items-center border-b-2 ${
                activeTab === 'all' ? 'border-primary' : 'border-transparent'
              }`}
            >
              <Text className={`font-orbitron-bold text-xs uppercase tracking-wider ${
                activeTab === 'all' ? 'text-primary-ink font-orbitron-bold' : 'text-ink-muted'
              }`}>
                All Organizations
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB CONTENTS */}
        {isLoading ? (
          <View className="py-20 items-center justify-center">
            <Text className="font-inter text-ink-muted">Loading organizations...</Text>
          </View>
        ) : showTabs && activeTab === 'my' ? (
          <View className="mb-8">
            <View className="space-y-4">
              {managedOrgs.length === 0 ? (
                <GlassCard className="border border-line p-6 items-center">
                  <Ionicons name="business-outline" size={32} color={themeColor(isDark, 'ink-muted')} className="mb-3" />
                  <Text className="font-orbitron-bold text-sm text-ink-soft text-center mb-1 uppercase tracking-wide">
                    {searchQuery.trim() ? "No Matching Organizations" : "No Managed Organizations"}
                  </Text>
                  <Text className="font-inter text-xs text-ink-muted text-center mb-5 leading-4">
                    {searchQuery.trim()
                      ? `No managed organizations found matching "${searchQuery}".`
                      : "You don't manage any organizations yet. Create one to get started."
                    }
                  </Text>
                </GlassCard>
              ) : (
                managedOrgs.map((org) => {
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
                              settings={org.settings} 
                              size={40} 
                              className="border bg-logo-plate rounded-full" 
                              style={{ borderColor: borderColor }}
                            />
                            <Text style={{ color: textColor }} className="flex-1 font-orbitron-bold text-lg uppercase tracking-wide leading-tight flex-shrink">
                              {org.name}
                            </Text>
                          </View>
                          <View style={{ backgroundColor: ink.chip, borderColor: borderColor }} className="flex-row items-center gap-1 border px-2.5 py-0.5 rounded">
                            <Ionicons name="shield-checkmark" size={12} color={textColor} />
                            <Text style={{ color: textColor }} className="font-orbitron-bold text-[9px] uppercase tracking-widest">
                              {org.role}
                            </Text>
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
                            Manage Workspace
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </OrgBrandedCard>
                  );
                })
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
            {orgs.length === 0 ? (
              <GlassCard className="border border-line p-6 items-center">
                <Ionicons name="business-outline" size={32} color={themeColor(isDark, 'ink-muted')} className="mb-3" />
                <Text className="font-orbitron-bold text-sm text-ink-soft text-center mb-1 uppercase tracking-wide">
                  {searchQuery.trim() ? "No Matching Organizations" : "No Organizations"}
                </Text>
                <Text className="font-inter text-xs text-ink-muted text-center mb-2 leading-4">
                  {searchQuery.trim()
                    ? `No organizations found matching "${searchQuery}".`
                    : "There are no active organizations on ScoreKeeper yet."
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
              const showManage = isAuthenticated && org.isManaged && (user?.globalRole === 'admin' || user?.isAdminOrCoach);

              return (
                <OrgBrandedCard
                  key={org.id}
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
                          settings={org.settings} 
                          size={40} 
                          className="border bg-logo-plate rounded-full" 
                          style={{ borderColor: borderColor }}
                        />
                        <Text style={{ color: textColor }} className="flex-1 font-orbitron-bold text-lg uppercase tracking-wide flex-shrink">
                          {org.name}
                        </Text>
                      </View>
                      
                      {showManage ? (
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
                    {showManage && (
                      <TouchableOpacity
                        style={{
                          backgroundColor: ink.text,
                          borderColor: 'transparent',
                        }}
                        className="flex-1 border py-2 rounded-lg items-center justify-center active:opacity-85"
                        onPress={() => router.push(`/admin/${org.id}` as any)}
                      >
                        <Text style={{ color: ink.inverse }} className="font-inter-bold text-sm">
                          Manage
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

      {/* QUICK CREATION MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-center items-center bg-overlay/80 px-6">
          <View className="w-full max-w-md bg-card border border-line p-6 rounded-2xl shadow-2xl" style={{ maxHeight: '90%' }}>
            <View className="flex-row justify-between items-center mb-6">
              <Text className="font-orbitron-bold text-lg text-ink uppercase tracking-wide">
                Add Organization
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} className="p-1 active:opacity-70">
                <Ionicons name="close" size={22} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
            <View className="mb-4">
              <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider mb-2">
                Organization Name
              </Text>
              <TextInput
                value={newOrgName}
                onChangeText={(text) => {
                  setNewOrgName(text);
                  shortCode.onNameChange(text);
                }}
                placeholder="e.g. Springvale High"
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                className="bg-sunken border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink outline-none"
                autoFocus
              />
            </View>

            {/* Required, but pre-filled from the name as it is typed — see `useOrgShortCode`. */}
            <View className="mb-4">
              <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider mb-2">
                Short Code (Required)
              </Text>
              <TextInput
                value={shortCode.shortCode}
                onChangeText={shortCode.onShortCodeChange}
                maxLength={ORG_SHORT_CODE_MAX_LENGTH}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                placeholder="SVH"
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                className="bg-sunken border border-line rounded-xl px-4 py-3 font-orbitron-bold text-sm text-ink outline-none w-32 text-center"
              />
              <Text className="font-inter text-[10px] text-ink-muted mt-1.5">
                Used wherever the full name will not fit — tabs, columns and team flags.
              </Text>
            </View>

            <View className="mb-6">
              <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider mb-2">
                Primary Sport
              </Text>
              <TextInput
                value={newOrgSport}
                onChangeText={setNewOrgSport}
                placeholder="e.g. Football"
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                className="bg-sunken border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink outline-none"
              />
              
              {/* Quick Select Sports */}
              <View className="flex-row flex-wrap gap-2 mt-3">
                {['Football', 'Rugby Union', 'Basketball', 'Tennis'].map((sport) => (
                  <TouchableOpacity
                    key={sport}
                    onPress={() => setNewOrgSport(sport)}
                    className={`px-3 py-1 rounded-full border ${
                      newOrgSport === sport
                        ? 'bg-primary-soft border-primary'
                        : 'bg-transparent border-line'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${
                      newOrgSport === sport
                        ? 'text-primary-ink font-inter-bold'
                        : 'text-ink-muted'
                    }`}>
                      {sport}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Organization Type Selector */}
            <View className="mb-4">
              <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider mb-2">
                Organization Type (Required)
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-2">
                {orgTypes.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    onPress={() => {
                      setNewOrgType(t.value);
                      if (t.value !== 'OTHER') {
                        setNewOrgCustomType('');
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl border ${
                      newOrgType === t.value
                        ? 'bg-primary-soft border-primary'
                        : 'bg-sunken border-line'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${
                      newOrgType === t.value
                        ? 'text-primary-ink font-inter-bold'
                        : 'text-ink-muted'
                    }`}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Custom Organization Type Specification */}
            {newOrgType === 'OTHER' && (
              <View className="mb-6">
                <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider mb-2">
                  Specify Custom Type (Required)
                </Text>
                <TextInput
                  value={newOrgCustomType}
                  onChangeText={setNewOrgCustomType}
                  placeholder="e.g. Charity / Social Group"
                  placeholderTextColor={themeColor(isDark, 'ink-muted')}
                  className="bg-sunken border border-line rounded-xl px-4 py-2.5 font-inter text-sm text-ink outline-none"
                />
              </View>
            )}

            <View className="mb-4">
              <BrandColorsField
                primary={newOrgColors.primary}
                secondary={newOrgColors.secondary}
                onChange={setNewOrgColors}
              />
            </View>
            </ScrollView>

            <View className="flex-row gap-3 mt-2">
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => {
                  setModalVisible(false);
                  setNewOrgName('');
                  setNewOrgSport('Football');
                  setNewOrgType(null);
                  setNewOrgCustomType('');
                  setNewOrgColors({ primary: DEFAULT_ORG_PRIMARY_COLOR, secondary: DEFAULT_ORG_SECONDARY_COLOR });
                  shortCode.reset();
                }}
                className="flex-1"
              />
              <Button
                title="Add"
                variant="primary"
                onPress={handleCreateOrg}
                disabled={
                  !newOrgName.trim() ||
                  !shortCode.shortCode ||
                  !newOrgType ||
                  (newOrgType === 'OTHER' && !newOrgCustomType.trim()) ||
                  !!brandColorsProblem(newOrgColors.primary, newOrgColors.secondary)
                }
                className="flex-1"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

