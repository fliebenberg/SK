import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, useWindowDimensions, View, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OrgMember } from '@sk/shared';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { OverflowMenu } from '../../../components/OverflowMenu';
import { SegmentedControl } from '../../../components/SegmentedControl';
import { PaginatedList } from '../../../components/PaginatedList';
import { AddPersonDialog } from '../../../components/people/AddPersonDialog';
import { OrgRole } from '../../../components/people/PersonDialogs';
import { GuardianshipTag, PersonAvatar, RoleBadge, guardianshipOf } from '../../../components/people/PersonBits';
import { useOrgMembers } from '../../../hooks/useOrgMembers';
import { useOrgGuardians, guardianSummary } from '../../../hooks/useOrgGuardians';
import { useOrgMinorsSettings } from '../../../hooks/useOrgMinorsSettings';
import { useSocketQuery } from '../../../hooks/useSocketQuery';
import { useSafeBack } from '../../../hooks/useSafeBack';
import { useAuthStore } from '../../../store/authStore';
import { formatCellphone } from '../../../utils/phone';
import { COLORS } from '../../../constants/Colors';

const PAGE_SIZE = 50;
type RoleFilter = 'all' | 'role-org-admin' | 'role-org-staff' | 'role-org-member';
type SortKey = 'name' | 'role';
const ROLE_RANK: Record<string, number> = { 'role-org-admin': 0, 'role-org-staff': 1 };

/**
 * The organisation's people (docs/people.md). A row is the person at a glance — name, a badge for
 * Staff or Admin, the org ID, contact details and guardians — and opens their page, where
 * everything is read and edited. There is no Invite here: inviting is done from the person page.
 *
 * Wide, the row has columns: contact details stacked, then guardians. On a phone it is two lines —
 * name, badges and org ID; email and cell — and a Minor or Dependant tag stands in for the
 * guardian column.
 */
export default function OrgPeople() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const user = useAuthStore(state => state.user);
  const viewerRole = useAuthStore(state => state.orgMemberships.find((m: any) => m.orgId === orgId)?.roleId);
  const canEdit = user?.globalRole === 'admin' || viewerRole === 'role-org-admin' || viewerRole === 'role-org-staff';

  const { members, isLoading: isMembersLoading } = useOrgMembers(orgId);
  const { data: rolesData, isLoading: isRolesLoading } = useSocketQuery<any>('roles');
  const roles: OrgRole[] = rolesData?.org || [];
  const { byPlayer: guardiansByPlayer } = useOrgGuardians(orgId);
  const { settings: minorsSettings } = useOrgMinorsSettings(orgId);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [isAdding, setIsAdding] = useState(false);

  const all = members || [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of all) c[m.roleId] = (c[m.roleId] || 0) + 1;
    return c;
  }, [all]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = all.filter(m =>
      (roleFilter === 'all' || m.roleId === roleFilter) &&
      (!q || m.name.toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q) || (m.personOrgId || '').toLowerCase().includes(q))
    );
    const byName = (a: OrgMember, b: OrgMember) => a.name.localeCompare(b.name);
    return list.sort(sortKey === 'role'
      ? (a, b) => (ROLE_RANK[a.roleId] ?? 2) - (ROLE_RANK[b.roleId] ?? 2) || byName(a, b)
      : byName);
  }, [all, search, roleFilter, sortKey]);

  const label = (text: string, count: number) => (isWide ? `${text} ${count}` : text);
  const filterOptions: { key: RoleFilter; label: string }[] = [
    { key: 'all', label: label('All', all.length) },
    { key: 'role-org-admin', label: label('Admin', counts['role-org-admin'] || 0) },
    { key: 'role-org-staff', label: label('Staff', counts['role-org-staff'] || 0) },
    { key: 'role-org-member', label: label('Member', counts['role-org-member'] || 0) },
  ];

  const open = (member: OrgMember) => router.push({
    pathname: '/admin/[orgId]/people/[membershipId]',
    params: { orgId: orgId!, membershipId: member.membershipId },
  });

  const headerRight = canEdit ? (
    <View className="flex-row items-center gap-1">
      <OverflowMenu
        accessibilityLabel="People actions"
        items={[{
          label: 'Import from a spreadsheet',
          description: 'Add and update people and their guardians from an .xlsx or .csv file. You see every change before it is saved.',
          icon: 'cloud-upload-outline',
          onPress: () => router.push(`/admin/${orgId}/people/import`),
        }]}
      />
      <TouchableOpacity
        onPress={() => setIsAdding(true)}
        accessibilityRole="button"
        accessibilityLabel="Add person"
        className={`flex-row items-center gap-1.5 rounded-xl bg-brand-orange ${isWide ? 'px-3.5 py-2' : 'w-9 h-9 justify-center'}`}
      >
        <Ionicons name="add" size={18} color="white" />
        {isWide ? <Text className="font-inter-bold text-sm text-white">Add person</Text> : null}
      </TouchableOpacity>
    </View>
  ) : undefined;

  if (isMembersLoading || isRolesLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        <ScreenHeader title="People" onBack={() => safeBack(`/admin/${orgId}`)} />
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={COLORS.brand.orange} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      <ScreenHeader title="People" onBack={() => safeBack(`/admin/${orgId}`)} right={headerRight} />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View className="w-full gap-3 self-center" style={{ maxWidth: 960 }}>
          <View className={`gap-2.5 ${isWide ? 'flex-row items-center' : ''}`}>
            <View className="flex-1 flex-row items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3">
              <Ionicons name="search-outline" size={16} color="#94A3B8" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name, email or org ID"
                placeholderTextColor="#94A3B8"
                accessibilityLabel="Search people"
                className="flex-1 font-inter text-base text-slate-800 dark:text-white py-2.5 outline-none"
              />
            </View>
            <SegmentedControl options={filterOptions} value={roleFilter} onChange={setRoleFilter} isCompact={false} />
          </View>

          <View className="flex-row items-center justify-between px-1">
            <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">
              {shown.length === 1 ? '1 person' : `${shown.length} people`}
            </Text>
            <TouchableOpacity
              onPress={() => setSortKey(sortKey === 'name' ? 'role' : 'name')}
              accessibilityRole="button"
              accessibilityLabel={`Sorted by ${sortKey}. Change the sort.`}
              className="flex-row items-center gap-1"
            >
              <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">
                Sort: <Text className="font-inter-semibold text-slate-700 dark:text-slate-200">{sortKey === 'name' ? 'Name' : 'Role'}</Text>
              </Text>
              <Ionicons name="swap-vertical" size={14} color="#64748B" />
            </TouchableOpacity>
          </View>

          <PaginatedList
            data={shown}
            pageSize={PAGE_SIZE}
            keyExtractor={member => member.membershipId}
            containerClassName="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900 overflow-hidden"
            itemSpacingClassName=""
            emptyState={
              <View className="items-center justify-center py-12 gap-2">
                <Ionicons name="people-outline" size={40} color="#94A3B8" />
                <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">
                  {all.length ? 'Nobody matches.' : 'Nobody has been added yet.'}
                </Text>
              </View>
            }
            renderItem={(member, index) => {
              const guardians = guardiansByPlayer.get(member.id);
              return (
                <PersonRow
                  member={member}
                  isWide={isWide}
                  first={index % PAGE_SIZE === 0}
                  guardians={guardianSummary(guardians)}
                  guardianCount={guardians?.length || 0}
                  guardianship={guardianshipOf(member.birthdate, minorsSettings, !!guardians?.length)}
                  onPress={() => open(member)}
                />
              );
            }}
          />
        </View>
      </ScrollView>

      {canEdit ? <AddPersonDialog orgId={orgId!} roles={roles} visible={isAdding} onClose={() => setIsAdding(false)} /> : null}
    </SafeAreaView>
  );
}

function PersonRow({ member, isWide, first, guardians, guardianCount, guardianship, onPress }: {
  member: OrgMember;
  isWide: boolean;
  first: boolean;
  guardians: string | null;
  guardianCount: number;
  guardianship: ReturnType<typeof guardianshipOf>;
  onPress: () => void;
}) {
  const cell = formatCellphone(member.cellphone);
  const border = first ? '' : 'border-t border-slate-100 dark:border-white/5';

  if (!isWide) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" className={`flex-row items-center gap-3 px-3 py-2.5 ${border}`}>
        <PersonAvatar name={member.name} image={member.image} imageConfig={member.imageConfig} size={36} />
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-1.5">
            <Text className="font-inter-semibold text-sm text-slate-800 dark:text-white flex-shrink" numberOfLines={1}>{member.name}</Text>
            <RoleBadge roleId={member.roleId} roleName={member.roleName} />
            <GuardianshipTag kind={guardianship} />
            {member.personOrgId ? (
              <Text className="ml-auto pl-2 font-inter text-xs text-slate-500 dark:text-slate-400 flex-shrink-0" style={{ fontVariant: ['tabular-nums'] }}>
                {member.personOrgId}
              </Text>
            ) : null}
          </View>
          {member.email || cell ? (
            <View className="flex-row items-center justify-between gap-2.5 mt-0.5">
              <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 flex-shrink" numberOfLines={1}>{member.email || ''}</Text>
              {cell ? <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">{cell}</Text> : null}
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" className={`flex-row items-center gap-3 px-4 py-2.5 ${border}`}>
      <PersonAvatar name={member.name} image={member.image} imageConfig={member.imageConfig} size={36} />
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="font-inter-semibold text-sm text-slate-800 dark:text-white" numberOfLines={1}>{member.name}</Text>
          <RoleBadge roleId={member.roleId} roleName={member.roleName} />
        </View>
        {member.personOrgId ? (
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>{member.personOrgId}</Text>
        ) : null}
      </View>
      <View style={{ width: 250 }}>
        {member.email ? <Text className="font-inter text-sm text-slate-500 dark:text-slate-400" numberOfLines={1}>{member.email}</Text> : null}
        {cell ? <Text className="font-inter text-sm text-slate-500 dark:text-slate-400" numberOfLines={1}>{cell}</Text> : null}
      </View>
      <View style={{ width: 170 }}>
        {guardians ? (
          <>
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">{guardianCount > 1 ? 'Guardians' : 'Guardian'}</Text>
            <Text className="font-inter text-sm text-slate-700 dark:text-slate-200" numberOfLines={1}>{guardians}</Text>
          </>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
    </TouchableOpacity>
  );
}
