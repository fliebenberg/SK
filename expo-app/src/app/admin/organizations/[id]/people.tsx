import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, ActivityIndicator, Alert, TextInput, TouchableOpacity } from 'react-native';
import { YStack, XStack, Text, H1, Paragraph, Theme, useTheme, Card, Label, Switch } from 'tamagui';
import { Image } from 'expo-image';
import { 
  Plus, 
  ArrowLeft, 
  Search, 
  Pencil, 
  Trash2, 
  UserPlus, 
  Users,
  ShieldCheck,
  Circle,
  X,
  Check
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { store } from '../../../../store/store';
import { MetalButton } from '../../../../components/ui/MetalButton';
import { MetalCard } from '../../../../components/ui/MetalCard';
import { Input } from '../../../../components/ui/Input';
import { OrgProfile } from '@sk/types';
import { getInitials, getUserAvatarUrl } from '../../../../lib/utils';

interface OrgMemberWithDetails extends OrgProfile {
  roleId: string;
  roleName?: string;
  membershipId: string;
  startDate?: string;
  endDate?: string;
  personOrgId?: string;
  image?: string;
}

export default function PeopleManagementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const [members, setMembers] = useState<OrgMemberWithDetails[]>([]);
  const [availableRoles, setAvailableRoles] = useState<{ id: string, name: string }[]>([]);
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all');

  // Form Management states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingMembershipId, setEditingMembershipId] = useState<string | null>(null);

  // Form Field states
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formOrgId, setFormOrgId] = useState('');
  const [formBirthdate, setFormBirthdate] = useState('');
  const [formNationalId, setFormNationalId] = useState('');
  const [formRoleId, setFormRoleId] = useState('role-org-member');
  const [formImage, setFormImage] = useState('');

  const primaryColor = theme.primary?.get() || '#10b981';

  useEffect(() => {
    if (!id) return;

    store.subscribeToOrganization(id);

    const updateData = () => {
      // Retrieve organization members
      const rawMembers = store.getOrganizationMembers(id);
      setMembers(rawMembers as OrgMemberWithDetails[]);
      
      // Retrieve organization roles
      const roles = store.getOrganizationRoles();
      setAvailableRoles(roles);

      const org = store.getOrganization(id);
      if (org) {
        setOrgName(org.name);
      }
      setIsLoading(false);
    };

    updateData();
    const unsubscribe = store.subscribe(updateData);

    return () => {
      unsubscribe();
      store.unsubscribeFromOrganization(id);
    };
  }, [id]);

  // Set default role when roles become available
  useEffect(() => {
    if (availableRoles.length > 0 && formMode === 'add') {
      const defaultRole = availableRoles.find(r => r.name.toLowerCase() === 'member')?.id || availableRoles[0]?.id;
      if (defaultRole) {
        setFormRoleId(defaultRole);
      }
    }
  }, [availableRoles, formMode]);

  const handleOpenAddForm = () => {
    setFormMode('add');
    setFormName('');
    setFormEmail('');
    setFormOrgId('');
    setFormBirthdate('');
    setFormNationalId('');
    setFormImage('');
    const defaultRole = availableRoles.find(r => r.name.toLowerCase() === 'member')?.id || availableRoles[0]?.id;
    setFormRoleId(defaultRole || 'role-org-member');
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (member: OrgMemberWithDetails) => {
    setFormMode('edit');
    setEditingMemberId(member.id);
    setEditingMembershipId(member.membershipId);
    setFormName(member.name || '');
    setFormEmail(member.email || '');
    setFormOrgId(member.personOrgId || '');
    setFormBirthdate(member.birthdate || '');
    setFormNationalId(member.nationalId || '');
    setFormRoleId(member.roleId || 'role-org-member');
    setFormImage(member.image || '');
    setIsFormOpen(true);
  };

  const handleSavePersonnel = async () => {
    if (!formName.trim()) {
      Alert.alert('Validation Error', 'Name is required.');
      return;
    }

    setIsProcessing(true);
    try {
      if (formMode === 'add') {
        // Find if a user matches email or name to prevent duplicates
        const matchingUser = await store.findMatchingUser(
          formEmail || undefined,
          formName,
          formBirthdate || undefined
        );

        const newProfile = await store.addOrgProfile({
          id: matchingUser?.id || `profile-${Date.now()}`,
          name: formName,
          email: formEmail || undefined,
          birthdate: formBirthdate || undefined,
          nationalId: formNationalId || undefined,
          orgId: id,
          image: formImage || undefined
        });

        // Add to organization with selected role
        await store.addOrganizationMember(newProfile.id, id, formRoleId);

        // Save organization-specific identifier if provided
        if (formOrgId) {
          await store.updateOrgProfile(newProfile.id, { identifier: formOrgId });
        }
        
        Alert.alert('Success', `${formName} has been added successfully.`);
      } else {
        // Edit Mode
        if (editingMemberId && editingMembershipId) {
          await store.updateOrgProfile(editingMemberId, {
            name: formName,
            email: formEmail || undefined,
            birthdate: formBirthdate || undefined,
            nationalId: formNationalId || undefined,
            image: formImage || undefined
          });

          await store.updateOrganizationMember(editingMembershipId, formRoleId);

          if (formOrgId) {
            await store.updateOrgProfile(editingMemberId, { identifier: formOrgId });
          }

          Alert.alert('Success', 'Profile changes saved.');
        }
      }
      setIsFormOpen(false);
    } catch (error: any) {
      Alert.alert('Operation Failed', error.message || 'Something went wrong.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveMember = (member: OrgMemberWithDetails) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${member.name} from this organization? This will also remove them from all squads.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await store.removeOrganizationMember(member.membershipId);
              Alert.alert('Removed', `${member.name} has been removed.`);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove member.');
            } finally {
              setIsProcessing(false);
            }
          }
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <Theme name="dark">
        <YStack style={styles.container} justifyContent="center" alignItems="center" gap="$3">
          <ActivityIndicator size="large" color={primaryColor} />
          <Text color="$gray10" fontSize={14}>Loading roster directory...</Text>
        </YStack>
      </Theme>
    );
  }

  // Filter members list
  const filteredMembers = members.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (member.roleName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (member.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = selectedRoleFilter === 'all' || member.roleId === selectedRoleFilter;
    return matchesSearch && matchesRole;
  }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <Theme name="dark">
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <YStack padding="$5" gap="$5" flex={1} width="100%">
          
          {/* Action Header */}
          <XStack justifyContent="space-between" alignItems="center" marginTop="$2">
            <MetalButton 
              variantType="outlined" 
              size="sm"
              onPress={() => router.push(`/admin/organizations/${id}`)}
              icon={<ArrowLeft size={14} color={primaryColor} />}
            >
              Dashboard
            </MetalButton>

            <MetalButton 
              variantType="filled" 
              glowColor={primaryColor}
              size="sm"
              onPress={handleOpenAddForm}
              icon={<Plus size={14} color="#ffffff" />}
            >
              Add Person
            </MetalButton>
          </XStack>

          {/* Page Title */}
          <YStack gap="$1.5">
            <H1 
              fontFamily="$heading" 
              fontSize={24} 
              color="$yellow10" 
              fontWeight="900" 
              letterSpacing={1.5}
            >
              ROSTER DIRECTORY
            </H1>
            <Paragraph color="$gray10" fontSize={13}>
              {orgName ? `Personnel management for ${orgName}` : 'Manage organization members'}
            </Paragraph>
          </YStack>

          {/* Form Expansion Section (Sliding Sheet Style) */}
          {isFormOpen && (
            <Card borderWidth={1.5} borderColor={primaryColor} backgroundColor="#0d0d0f" padding="$4.5" borderRadius={14} gap="$3.5">
              <XStack justifyContent="space-between" alignItems="center" borderBottomWidth={1} borderBottomColor="#27272a" paddingBottom="$2">
                <Text fontWeight="900" fontSize={15} color="$yellow10" letterSpacing={0.5}>
                  {formMode === 'add' ? 'ADD MEMBER TO ROSTER' : 'EDIT MEMBER DETAILS'}
                </Text>
                <TouchableOpacity onPress={() => setIsFormOpen(false)}>
                  <X size={18} color="#e4e4e7" />
                </TouchableOpacity>
              </XStack>

              <YStack gap="$3">
                <YStack gap="$1">
                  <Label fontSize={12} color="$gray10" fontWeight="700">Full Name *</Label>
                  <Input 
                    placeholder="John Doe" 
                    value={formName} 
                    onChangeText={setFormName} 
                  />
                </YStack>

                <YStack gap="$1">
                  <Label fontSize={12} color="$gray10" fontWeight="700">Email Address</Label>
                  <Input 
                    placeholder="johndoe@email.com" 
                    value={formEmail} 
                    onChangeText={setFormEmail}
                    keyboardType="email-address" 
                    autoCapitalize="none"
                  />
                </YStack>

                <XStack gap="$3" width="100%">
                  <YStack gap="$1" flex={1}>
                    <Label fontSize={12} color="$gray10" fontWeight="700">Birth Date (YYYY-MM-DD)</Label>
                    <Input 
                      placeholder="1995-10-15" 
                      value={formBirthdate} 
                      onChangeText={setFormBirthdate} 
                    />
                  </YStack>
                  <YStack gap="$1" flex={1}>
                    <Label fontSize={12} color="$gray10" fontWeight="700">National ID / Passport</Label>
                    <Input 
                      placeholder="ID Number" 
                      value={formNationalId} 
                      onChangeText={setFormNationalId} 
                    />
                  </YStack>
                </XStack>

                <YStack gap="$1">
                  <Label fontSize={12} color="$gray10" fontWeight="700">Organization ID / Student #</Label>
                  <Input 
                    placeholder="Student # or Membership #" 
                    value={formOrgId} 
                    onChangeText={setFormOrgId} 
                  />
                </YStack>

                <YStack gap="$1">
                  <Label fontSize={12} color="$gray10" fontWeight="700">Assigned Roster Role</Label>
                  <XStack flexWrap="wrap" gap="$2">
                    {availableRoles.map(role => (
                      <TouchableOpacity 
                        key={role.id}
                        activeOpacity={0.8}
                        style={[
                          styles.roleSelectBtn,
                          formRoleId === role.id ? { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: primaryColor } : null
                        ]}
                        onPress={() => setFormRoleId(role.id)}
                      >
                        <XStack gap="$1.5" alignItems="center">
                          {formRoleId === role.id ? (
                            <Check size={12} color={primaryColor} />
                          ) : (
                            <Circle size={10} color="#71717a" />
                          )}
                          <Text fontSize={11} fontWeight="800" color={formRoleId === role.id ? primaryColor : '$gray10'}>
                            {role.name.toUpperCase()}
                          </Text>
                        </XStack>
                      </TouchableOpacity>
                    ))}
                  </XStack>
                </YStack>
              </YStack>

              <XStack gap="$3" marginTop="$2.5">
                <MetalButton 
                  variantType="outlined" 
                  size="sm"
                  onPress={() => setIsFormOpen(false)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </MetalButton>
                <MetalButton 
                  variantType="filled" 
                  glowColor={primaryColor}
                  size="sm"
                  onPress={handleSavePersonnel}
                  disabled={isProcessing || !formName.trim()}
                  style={{ flex: 1 }}
                >
                  {isProcessing ? 'Saving...' : (formMode === 'add' ? 'Add Person' : 'Save Details')}
                </MetalButton>
              </XStack>
            </Card>
          )}

          {/* Search bar & Filter row */}
          <YStack gap="$3">
            <XStack position="relative" alignItems="center" width="100%">
              <Input
                placeholder="Search by name, email, role..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                paddingLeft={40}
                flex={1}
              />
              <Search size={16} color="#71717a" style={{ position: 'absolute', left: 14 }} />
            </XStack>

            {/* Quick role filter pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.filterPill,
                  selectedRoleFilter === 'all' ? { backgroundColor: primaryColor } : null
                ]}
                onPress={() => setSelectedRoleFilter('all')}
              >
                <Text fontSize={11} fontWeight="900" color={selectedRoleFilter === 'all' ? '#000000' : '$gray10'}>
                  ALL ROLES ({members.length})
                </Text>
              </TouchableOpacity>
              {availableRoles.map(role => {
                const count = members.filter(m => m.roleId === role.id).length;
                return (
                  <TouchableOpacity
                    key={role.id}
                    activeOpacity={0.8}
                    style={[
                      styles.filterPill,
                      selectedRoleFilter === role.id ? { backgroundColor: primaryColor } : null
                    ]}
                    onPress={() => setSelectedRoleFilter(role.id)}
                  >
                    <Text fontSize={11} fontWeight="900" color={selectedRoleFilter === role.id ? '#000000' : '$gray10'}>
                      {role.name.toUpperCase()} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </YStack>

          {/* Members List directory */}
          <YStack gap="$3.5">
            {filteredMembers.map((member) => {
              const hasImage = member.image && member.image.trim().length > 0;
              const initials = getInitials(member.name || '');

              return (
                <MetalCard key={member.membershipId} variant="dark" padding="$3.5">
                  <XStack justifyContent="space-between" alignItems="center" gap="$3">
                    
                    {/* Left: Avatar & Name details */}
                    <XStack gap="$3" alignItems="center" flex={1} minWidth={0}>
                      {hasImage ? (
                        <YStack style={styles.avatarBorder}>
                          <Image 
                            source={getUserAvatarUrl(member.image, 'thumb')}
                            style={styles.avatarImg}
                            contentFit="cover"
                          />
                        </YStack>
                      ) : (
                        <YStack 
                          style={styles.avatarInitials} 
                          backgroundColor={primaryColor}
                          justifyContent="center" 
                          alignItems="center"
                        >
                          <Text fontWeight="900" fontSize={12} color="#000000">
                            {initials}
                          </Text>
                        </YStack>
                      )}

                      <YStack minWidth={0} flex={1} gap="$0.5">
                        <Text fontWeight="800" fontSize={15} color="$color" numberOfLines={1}>
                          {member.name}
                        </Text>
                        <XStack gap="$2" alignItems="center" flexWrap="wrap">
                          <XStack backgroundColor="#27272a" paddingHorizontal="$2" paddingVertical="$0.5" borderRadius={4}>
                            <Text fontSize={9} color="$gray10" fontWeight="800">
                              {(member.roleName || 'Member').toUpperCase()}
                            </Text>
                          </XStack>
                          {member.personOrgId && (
                            <Text fontSize={10} color="$gray9" fontStyle="italic">
                              ID: {member.personOrgId}
                            </Text>
                          )}
                        </XStack>
                      </YStack>
                    </XStack>

                    {/* Right: Quick actions */}
                    <XStack gap="$2" flexShrink={0}>
                      <MetalButton
                        variantType="outlined"
                        size="icon"
                        style={styles.actionBtn}
                        onPress={() => handleOpenEditForm(member)}
                        icon={<Pencil size={12} color={primaryColor} />}
                      />
                      <MetalButton
                        variantType="outlined"
                        size="icon"
                        style={styles.actionBtn}
                        disabled={isProcessing}
                        onPress={() => handleRemoveMember(member)}
                        icon={<Trash2 size={12} color="#ef4444" />}
                      />
                    </XStack>

                  </XStack>
                </MetalCard>
              );
            })}

            {filteredMembers.length === 0 && (
              <YStack 
                borderRadius={12} 
                borderWidth={1} 
                borderStyle="dashed" 
                borderColor="$gray6" 
                padding="$10" 
                alignItems="center" 
                justifyContent="center"
                backgroundColor="#0d0d0f"
                gap="$2"
              >
                <Users size={24} color="#71717a" />
                <Text color="$gray10" fontSize={13} textAlign="center">
                  {searchQuery ? 'No members match search filter.' : 'Roster is empty. Add organization staff above!'}
                </Text>
              </YStack>
            )}
          </YStack>

        </YStack>
      </ScrollView>
    </Theme>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  filterScroll: {
    paddingVertical: 4,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleSelectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    marginBottom: 4,
  },
  avatarBorder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#27272a',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    padding: 0,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
