import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../store/settingsStore';
import { wsService } from '../../../services/websocket';
import { useWsStore } from '../../../store/wsStore';
import { SocketAction, OrgProfile, OrgMember } from '@sk/types';
import { PersonnelAutocomplete } from '../../../components/PersonnelAutocomplete';
import { ImageEditor, ImageConfig } from '../../../components/ImageEditor';
import { getAvatarUrl } from '../../../services/api';
import { useSocketQuery } from '../../../hooks/useSocketQuery';
import { useAuthStore } from '../../../store/authStore';

interface OrgRole {
  id: string;
  name: string;
}

const parseImageConfig = (config: any): ImageConfig => {
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

export default function OrgPeople() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore(state => state.isConnected);

  // User & Permissions
  const user = useAuthStore(state => state.user);
  const orgMemberships = useAuthStore(state => state.orgMemberships || []);
  const { data: org } = useSocketQuery<any>('organization', { orgId });

  const userMembership = orgMemberships.find(m => m.orgId === orgId);
  const isOwner = org?.creatorId === user?.id;
  const canEdit = Boolean(
    user?.globalRole === 'admin' ||
    isOwner ||
    (userMembership && (userMembership.roleId === 'role-org-admin' || userMembership.roleId === 'role-org-staff'))
  );

  const { data: membersData, isLoading: isMembersLoading, refetch: refetchMembers, setData: setMembersData } = useSocketQuery<OrgMember[]>('org_members', { orgId });
  const { data: rolesData, isLoading: isRolesLoading } = useSocketQuery<any>('roles');
  const { data: settingsData } = useSocketQuery<any>('system_settings');

  const members = membersData || [];
  const availableRoles: any[] = rolesData?.org || [];
  
  // Filtering / Sorting state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'roleName'; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  // Action states
  const [isProcessing, setIsProcessing] = useState(false);

  // Add Member Modal State
  const [isAdding, setIsAdding] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<OrgProfile | null>(null);
  const [newMemberData, setNewMemberData] = useState({
    name: '',
    email: '',
    cellphone: '',
    birthdate: '',
    nationalId: '',
    personOrgId: '',
    roleId: 'role-org-member',
    image: '',
    imageConfig: { scale: 1, x: 0, y: 0 },
  });

  // Set default roleId once roles load
  useEffect(() => {
    if (rolesData && Array.isArray(rolesData.org)) {
      const defaultRole = rolesData.org.find((r: any) => r.name === 'Member')?.id || rolesData.org[0]?.id;
      setNewMemberData(prev => ({ ...prev, roleId: defaultRole || 'role-org-member' }));
    }
  }, [rolesData]);

  const handleCloseAddModal = () => {
    setIsAdding(false);
    const defaultRole = rolesData?.org?.find((r: any) => r.name === 'Member')?.id || 'role-org-member';
    setNewMemberData({
      name: '',
      email: '',
      cellphone: '',
      birthdate: '',
      nationalId: '',
      personOrgId: '',
      roleId: defaultRole,
      image: '',
      imageConfig: { scale: 1, x: 0, y: 0 },
    });
    setSelectedPerson(null);
  };

  const cooldownSetting = settingsData?.org_admin_invite_cooldown_hours ? parseInt(settingsData.org_admin_invite_cooldown_hours) : 168;

  const isLoading = isMembersLoading || isRolesLoading;

  // Remove Confirmation State
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; membershipId: string; name: string } | null>(null);

  // Image Editor state — which form slot (add) is being edited
  const [imageEditorTarget, setImageEditorTarget] = useState<'add' | null>(null);

  // Resolve the image URI to pass to ImageEditor (must be a displayable absolute URI)
  const getEditorImage = () => {
    const raw = imageEditorTarget === 'add' ? newMemberData.image : '';
    return getAvatarUrl(raw, 'large') || raw;
  };

  const getEditorConfig = (): ImageConfig =>
    imageEditorTarget === 'add' ? newMemberData.imageConfig : { scale: 1, x: 0, y: 0 };

  const handleImageEditorApply = (uri: string, config: ImageConfig) => {
    if (imageEditorTarget === 'add') {
      setNewMemberData(prev => ({ ...prev, image: uri, imageConfig: config }));
    }
    setImageEditorTarget(null);
  };

  // Subscribe to updates
  useEffect(() => {
    if (!isConnected || !orgId) return;

    const room = `org:${orgId}:members`;
    const unsubscribe = wsService.subscribeToRoom(room);

    const handleUpdate = (event: any) => {
      if (!event) return;
      if (event.type === 'ORG_MEMBERS_SYNC') {
        setMembersData(event.data);
      } else if (event.type === 'ORG_MEMBER_UPDATED') {
        const updatedData = event.data;
        if (updatedData) {
          if (updatedData.endDate) {
            // Member was removed
            setMembersData(prev => {
              if (!prev) return null;
              return prev.filter(m => m.membershipId !== updatedData.id && m.membershipId !== updatedData.membershipId);
            });
          } else if (updatedData.id) {
            setMembersData(prev => {
              if (!prev) return null;
              const idx = prev.findIndex(m => m.id === updatedData.id);
              if (idx !== -1) {
                // Update existing member
                const copy = [...prev];
                copy[idx] = { ...copy[idx], ...updatedData };
                return copy;
              } else if (updatedData.membershipId) {
                // Add new member to list
                return [...prev, updatedData];
              }
              return prev;
            });
          }
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId, setMembersData]);

  // Add Member Submission
  const handleAddMember = async () => {
    if (!newMemberData.name.trim()) return;

    setIsProcessing(true);
    try {
      let profileId = selectedPerson?.id;

      if (!profileId) {
        // Find matching user first to avoid duplication
        const matchingUser: any = await new Promise((resolve) => {
          wsService.emit('get_data', {
            type: 'find_matching_user',
            email: newMemberData.email || undefined,
            name: newMemberData.name,
            birthdate: newMemberData.birthdate || undefined
          }, (res) => resolve(res));
        });

        // Add org profile
        const newProfile: any = await new Promise((resolve, reject) => {
          const profilePayload = {
            id: matchingUser?.id || `profile-${Date.now()}`,
            name: newMemberData.name,
            email: newMemberData.email || undefined,
            cellphone: newMemberData.cellphone || undefined,
            birthdate: newMemberData.birthdate || undefined,
            nationalId: newMemberData.nationalId || undefined,
            orgId,
            image: newMemberData.image || undefined,
            imageConfig: newMemberData.imageConfig,
            identifier: newMemberData.personOrgId || undefined,
          };
          wsService.emit('action', { type: SocketAction.ADD_ORG_PROFILE, payload: profilePayload }, (response: any) => {
            if (response.status === 'ok') resolve(response.data);
            else reject(new Error(response.message || 'Failed to create profile'));
          });
        });
        profileId = newProfile.id;
      } else {
        // Update profile details
        await new Promise((resolve, reject) => {
          wsService.emit('action', {
            type: SocketAction.UPDATE_ORG_PROFILE,
            payload: {
              id: profileId,
              data: {
                email: newMemberData.email || undefined,
                cellphone: newMemberData.cellphone || undefined,
                birthdate: newMemberData.birthdate || undefined,
                nationalId: newMemberData.nationalId || undefined,
                image: newMemberData.image || undefined,
                imageConfig: newMemberData.imageConfig,
                identifier: newMemberData.personOrgId || undefined,
              }
            }
          }, (res: any) => {
            if (res.status === 'ok') resolve(res.data);
            else reject(new Error(res.message || 'Failed to update profile'));
          });
        });
      }

      // Link membership role to organization
      if (profileId) {
        await new Promise((resolve, reject) => {
          const membershipPayload = {
            orgProfileId: profileId,
            orgId,
            roleId: newMemberData.roleId
          };
          wsService.emit('action', { type: SocketAction.ADD_ORG_MEMBER, payload: membershipPayload }, (res: any) => {
            if (res.status === 'ok') resolve(res.data);
            else reject(new Error(res.message || 'Failed to add organization member'));
          });
        });
      }

      // Reset and close
      handleCloseAddModal();
    } catch (error) {
      console.error(error);
      alert('Failed to add member');
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete workflow
  const handleRemoveMember = async () => {
    if (!confirmDelete) return;

    setIsProcessing(true);
    try {
      await new Promise((resolve, reject) => {
        wsService.emit('action', {
          type: SocketAction.REMOVE_ORG_MEMBER,
          payload: { id: confirmDelete.membershipId }
        }, (res: any) => {
          if (res.status === 'ok') resolve(res);
          else reject(new Error(res.message || 'Failed to remove member'));
        });
      });
      setConfirmDelete(null);
    } catch (err) {
      console.error(err);
      alert('Failed to remove member');
    } finally {
      setIsProcessing(false);
    }
  };

  // Invite action with Cooldown Verification
  const handleSendInvite = (member: OrgMember) => {
    if (!member.email) return;

    wsService.emit('action', {
      type: SocketAction.SEND_MEMBER_INVITE,
      payload: { memberId: member.id }
    }, (res: any) => {
      if (res && res.status === 'error') {
        alert(res.message);
      } else {
        alert(`Invitation sent to ${member.name}`);
      }
    });
  };

  const getInviteButtonStatus = (member: OrgMember) => {
    if (member.userId) return null; // already linked
    if (!member.email) return null;

    if (member.lastInviteSentAt) {
      const lastSent = new Date(member.lastInviteSentAt);
      const diffMs = Date.now() - lastSent.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < cooldownSetting) {
        const remainingHours = Math.ceil(cooldownSetting - diffHours);
        const remainingDays = Math.ceil(remainingHours / 24);
        const text = remainingDays > 1 ? `Invited (${remainingDays}d)` : `Invited (${remainingHours}h)`;
        return { disabled: true, text };
      }
    }

    return { disabled: false, text: 'Invite' };
  };

  // Autocomplete Select Profile callback
  const handleSelectPerson = (person: OrgProfile | null) => {
    setSelectedPerson(person);
    if (person) {
      const lConfig = parseImageConfig(person.imageConfig || (person as any).settings?.logoConfig);
      setNewMemberData(prev => ({
        ...prev,
        name: person.name,
        email: person.email || prev.email,
        cellphone: person.cellphone || prev.cellphone,
        birthdate: person.birthdate || prev.birthdate,
        nationalId: person.nationalId || prev.nationalId,
        personOrgId: person.identifier || prev.personOrgId,
        image: person.image || prev.image,
        imageConfig: lConfig,
      }));
    }
  };

  // Filter & Sorting config
  const filteredMembers = members.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (m.roleName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (m.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || m.roleId === roleFilter;
    return matchesSearch && matchesRole;
  });

  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const aVal = (a[sortConfig.key] || '').toLowerCase();
    const bVal = (b[sortConfig.key] || '').toLowerCase();
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSort = (key: 'name' | 'roleName') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getAvatarSource = (member: OrgMember) => {
    if (member.image) {
      return { uri: getAvatarUrl(member.image, 'thumb') };
    }
    return null;
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#FF3E00" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          People & Roles
        </Text>
        <TouchableOpacity
          className="w-8 h-8 rounded-lg bg-brand-orange items-center justify-center shadow-md shadow-brand-orange/20 active:opacity-85"
          onPress={() => setIsAdding(true)}
        >
          <Ionicons name="person-add-outline" size={16} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 py-3" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* FILTERS */}
        <View className="flex-row gap-2 mb-3 flex-wrap">
          <View className="flex-1 flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-1.5 min-w-[200px] shadow-sm">
            <Ionicons name="search-outline" size={16} color="#94A3B8" />
            <TextInput
              placeholder="Search roster members..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 font-inter text-slate-800 dark:text-white text-xs ml-2 outline-none"
            />
          </View>

          <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden min-w-[120px] justify-center px-2 py-0.5">
            <Text className="font-orbitron-bold text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5 ml-1">Role Filter</Text>
            <View className="flex-row items-center gap-1">
              <TouchableOpacity onPress={() => setRoleFilter(roleFilter === 'all' ? 'role-org-member' : 'all')} className="flex-row items-center gap-1 py-0.5 px-1">
                <Text className="font-inter text-xs text-slate-700 dark:text-slate-300">
                  {roleFilter === 'all' ? 'All Roles' : availableRoles.find(r => r.id === roleFilter)?.name || 'Role'}
                </Text>
                <Ionicons name="chevron-down" size={12} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* SORT CONTROLS */}
        <View className="flex-row items-center gap-4 mb-2">
          <TouchableOpacity onPress={() => toggleSort('name')} className="flex-row items-center gap-1">
            <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Name
            </Text>
            {sortConfig.key === 'name' && (
              <Ionicons name={sortConfig.direction === 'asc' ? 'chevron-up' : 'chevron-down'} size={10} color="#FF3E00" />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => toggleSort('roleName')} className="flex-row items-center gap-1">
            <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Role
            </Text>
            {sortConfig.key === 'roleName' && (
              <Ionicons name={sortConfig.direction === 'asc' ? 'chevron-up' : 'chevron-down'} size={10} color="#FF3E00" />
            )}
          </TouchableOpacity>
        </View>

        {/* MEMBER LIST */}
        <View className="space-y-2">
          {sortedMembers.map((member) => {
            const inviteStatus = getInviteButtonStatus(member);
            const avatarSrc = getAvatarSource(member);
            const logoConf = parseImageConfig(member.imageConfig || (member as any).settings?.logoConfig);

            return (
              <TouchableOpacity
                key={member.membershipId}
                onPress={() => {
                  if (canEdit) {
                    router.push({
                      pathname: '/admin/[orgId]/people/[membershipId]',
                      params: { orgId: orgId!, membershipId: member.membershipId }
                    });
                  } else {
                    router.push({
                      pathname: '/admin/[orgId]/people/[membershipId]/view',
                      params: { orgId: orgId!, membershipId: member.membershipId }
                    });
                  }
                }}
                activeOpacity={0.85}
              >
                <GlassCard className="border border-slate-200 dark:border-white/5 p-2.5 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1 mr-4">
                    <View className="w-8 h-8 rounded-full bg-brand-orange/10 overflow-hidden items-center justify-center">
                      {avatarSrc ? (
                        <View style={{ width: 32, height: 32, overflow: 'hidden' }}>
                          <View
                            style={{
                              width: '100%',
                              height: '100%',
                              transform: [
                                { scale: logoConf.scale },
                                { translateX: logoConf.x * 32 },
                                { translateY: logoConf.y * 32 },
                              ],
                            }}
                          >
                            <Image
                              source={avatarSrc}
                              style={{
                                width: '100%',
                                height: '100%',
                              }}
                              resizeMode="cover"
                            />
                          </View>
                        </View>
                      ) : (
                        <Text className="font-orbitron-bold text-xs text-brand-orange">
                          {member.name.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>

                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5 mb-0.5 flex-wrap">
                        <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white">
                          {member.name}
                        </Text>
                        <View className="px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-800">
                          <Text className="font-inter-bold text-[7px] uppercase tracking-wider text-slate-600 dark:text-slate-400">
                            {member.roleName || 'Member'}
                          </Text>
                        </View>
                      </View>
                      <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500">
                        {[member.email, member.cellphone].filter(Boolean).join('  |  ') || 'No Contact Info'}
                      </Text>
                      {member.personOrgId ? (
                        <Text className="font-mono text-[8px] text-slate-400 dark:text-slate-600 mt-0.5">
                          ID: {member.personOrgId}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View className="flex-row items-center gap-1.5">
                    {inviteStatus && (
                      <TouchableOpacity
                        disabled={inviteStatus.disabled}
                        onPress={(e: any) => {
                          if (e && e.stopPropagation) e.stopPropagation();
                          handleSendInvite(member);
                        }}
                        className={`px-2 py-1 rounded-lg active:scale-95 ${
                          inviteStatus.disabled
                            ? 'bg-slate-200 dark:bg-slate-800 opacity-60'
                            : 'bg-brand-orange'
                        }`}
                      >
                        <Text className={`font-orbitron-bold text-[8px] uppercase tracking-widest ${
                          inviteStatus.disabled ? 'text-slate-500 dark:text-slate-400' : 'text-white'
                        }`}>
                          {inviteStatus.text}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 items-center justify-center border border-slate-200/50 dark:border-white/5 active:opacity-80"
                      onPress={(e: any) => {
                        if (e && e.stopPropagation) e.stopPropagation();
                        router.push({
                          pathname: '/admin/[orgId]/people/[membershipId]/view',
                          params: { orgId: orgId!, membershipId: member.membershipId }
                        });
                      }}
                    >
                      <Ionicons name="eye-outline" size={13} color={isDark ? "#E2E8F0" : "#475569"} />
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            );
          })}

          {sortedMembers.length === 0 && (
            <View className="items-center justify-center py-12">
              <Ionicons name="people-outline" size={48} color="#94A3B8" className="opacity-40 mb-3" />
              <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">
                No Members Found
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ADD MEMBER MODAL */}
      {isAdding && (
        <View className="absolute inset-0 bg-slate-950/80 items-center justify-center z-40 p-4">
          <View 
            className="w-full max-w-md border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl"
            style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '90%' }}
          >
            {/* Fixed Header */}
            <View className="flex-row items-center justify-between border-b border-slate-200 dark:border-white/5 px-5 pt-5 pb-4">
              <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white uppercase tracking-wider">
                Add Person to Organization
              </Text>
              <TouchableOpacity onPress={handleCloseAddModal}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Form Fields */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Row 1: Avatar Uploader + Name Input side-by-side */}
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', marginBottom: 24, zIndex: 10 }}>
                <View style={{ alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => setImageEditorTarget('add')}
                    style={{ width: 64, height: 64, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#CBD5E1' }}
                  >
                    {newMemberData.image ? (
                      <View style={{ width: 64, height: 64, overflow: 'hidden' }}>
                        <View
                          style={{
                            width: '100%',
                            height: '100%',
                            transform: [
                              { scale: newMemberData.imageConfig.scale },
                              { translateX: newMemberData.imageConfig.x * 64 },
                              { translateY: newMemberData.imageConfig.y * 64 },
                            ],
                          }}
                        >
                          <Image
                            source={{ uri: newMemberData.image }}
                            style={{
                              width: '100%',
                              height: '100%',
                            }}
                            resizeMode="cover"
                          />
                        </View>
                      </View>
                    ) : (
                      <Ionicons name="camera-outline" size={20} color="#94A3B8" />
                    )}
                  </TouchableOpacity>
                  <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 7, color: isDark ? '#94A3B8' : '#475569', textTransform: 'uppercase', marginTop: 4 }}>
                    Avatar
                  </Text>
                </View>

                {/* Name Input */}
                <View style={{ flex: 1, zIndex: 50 }}>
                  <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 9, color: isDark ? '#94A3B8' : '#475569', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                    Name
                  </Text>
                  <PersonnelAutocomplete
                    orgId={orgId!}
                    value={newMemberData.name}
                    onChangeText={(text) => setNewMemberData(prev => ({ ...prev, name: text }))}
                    onSelectPerson={handleSelectPerson}
                  />
                </View>
              </View>

              {/* Row 2: Email Address & Cell Number */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 9, color: isDark ? '#94A3B8' : '#475569', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                    Email Address
                  </Text>
                  <TextInput
                    placeholder="email@example.com"
                    placeholderTextColor="#94A3B8"
                    value={newMemberData.email}
                    onChangeText={(text) => setNewMemberData(prev => ({ ...prev, email: text }))}
                    style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: isDark ? '#fff' : '#1E293B', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(241,245,249,0.3)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 }}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 9, color: isDark ? '#94A3B8' : '#475569', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                    Cell Number
                  </Text>
                  <TextInput
                    placeholder="e.g. +1 234 567 8900"
                    placeholderTextColor="#94A3B8"
                    value={newMemberData.cellphone}
                    onChangeText={(text) => setNewMemberData(prev => ({ ...prev, cellphone: text }))}
                    style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: isDark ? '#fff' : '#1E293B', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(241,245,249,0.3)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 }}
                  />
                </View>
              </View>

              {/* Row 3: Org ID + Birthdate side-by-side */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 9, color: isDark ? '#94A3B8' : '#475569', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                    Org ID (e.g. Student #)
                  </Text>
                  <TextInput
                    placeholder="ID number"
                    placeholderTextColor="#94A3B8"
                    value={newMemberData.personOrgId}
                    onChangeText={(text) => setNewMemberData(prev => ({ ...prev, personOrgId: text }))}
                    style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: isDark ? '#fff' : '#1E293B', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(241,245,249,0.3)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 }}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 9, color: isDark ? '#94A3B8' : '#475569', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                    Birthdate
                  </Text>
                  <TextInput
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94A3B8"
                    value={newMemberData.birthdate}
                    onChangeText={(text) => setNewMemberData(prev => ({ ...prev, birthdate: text }))}
                    style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: isDark ? '#fff' : '#1E293B', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(241,245,249,0.3)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 }}
                  />
                </View>
              </View>

              {/* Row 4: Assigned Role */}
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 9, color: isDark ? '#94A3B8' : '#475569', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
                  Assigned Role
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {availableRoles.map(role => (
                    <TouchableOpacity
                      key={role.id}
                      onPress={() => setNewMemberData(prev => ({ ...prev, roleId: role.id }))}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: newMemberData.roleId === role.id ? '#FF3E00' : (isDark ? 'rgba(255,255,255,0.1)' : '#CBD5E1'),
                        backgroundColor: newMemberData.roleId === role.id ? '#FF3E00' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(241,245,249,0.3)'),
                      }}
                    >
                      <Text style={{ fontFamily: 'Orbitron_700Bold', fontSize: 8, textTransform: 'uppercase', letterSpacing: 1.5, color: newMemberData.roleId === role.id ? '#fff' : (isDark ? '#94A3B8' : '#64748B') }}>
                        {role.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Fixed Footer Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0' }}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={handleCloseAddModal}
                className="flex-1 min-h-[40px] py-2"
              />
              <Button
                title={isProcessing ? 'Adding...' : 'Add Person'}
                variant="primary"
                onPress={handleAddMember}
                disabled={isProcessing || !newMemberData.name.trim()}
                className="flex-1 min-h-[40px] py-2"
              />
            </View>
          </View>
        </View>
      )}



      {/* CONFIRM DELETE MODAL */}
      <ConfirmationModal
        isOpen={confirmDelete !== null && confirmDelete.isOpen}
        onClose={() => setConfirmDelete(null)}
        title="Remove Member"
        description={
          confirmDelete
            ? `Are you sure you want to remove ${confirmDelete.name} from the organization? They will also be removed from all teams in this organization.`
            : ''
        }
        onConfirm={handleRemoveMember}
        confirmText={isProcessing ? 'Removing...' : 'Remove'}
        cancelText="Cancel"
        variant="danger"
        isProcessing={isProcessing}
      />


      {/* SHARED IMAGE EDITOR */}
      <ImageEditor
        visible={imageEditorTarget !== null}
        imageUri={getEditorImage()}
        config={getEditorConfig()}
        title="Edit Avatar"
        allowRemove
        onApply={handleImageEditorApply}
        onCancel={() => setImageEditorTarget(null)}
      />
    </SafeAreaView>
  );
}
