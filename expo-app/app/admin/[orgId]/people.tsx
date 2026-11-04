import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, useWindowDimensions, View, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OrgPeoplePage, OrgPersonRow } from '@sk/shared';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { OverflowMenu } from '../../../components/OverflowMenu';
import { SegmentedControl } from '../../../components/SegmentedControl';
import { ListPager } from '../../../components/ListPager';
import { AddPersonDialog } from '../../../components/people/AddPersonDialog';
import { OrgApplicationsCard } from '../../../components/people/OrgApplications';
import { OrgRole, rolesTheyMayGive } from '../../../components/people/PersonDialogs';
import { GuardianshipTag, PersonAvatar, RoleBadge, guardianshipOf } from '../../../components/people/PersonBits';
import { guardianSummary } from '../../../hooks/useOrgGuardians';
import { usePagedList } from '../../../hooks/usePagedList';
import { useOrgMinorsSettings } from '../../../hooks/useOrgMinorsSettings';
import { useSocketQuery } from '../../../hooks/useSocketQuery';
import { useSafeBack } from '../../../hooks/useSafeBack';
import { formatCellphone } from '../../../utils/phone';
import { useActiveTheme } from '../../../store/settingsStore';
import { themeColor } from '../../../constants/Colors';
import { PageBody } from '../../../components/PageBody';
import { useOrgAccess } from '../../../hooks/useOrgAccess';

type RoleFilter = 'all' | 'role-org-admin' | 'role-org-staff' | 'role-org-member' | 'guardians';
type SortKey = 'name' | 'role';

/**
 * The organisation's people (docs/people.md). A row is the person at a glance — name, a badge for
 * Staff or Admin, the org ID, contact details and guardians — and opens their page, where
 * everything is read and edited. There is no Invite here: inviting is done from the person page.
 *
 * Wide, the row has columns: contact details stacked, then guardians. On a phone it is two lines —
 * name, badges and org ID; email and cell — and a Minor or Dependant tag stands in for the
 * guardian column.
 *
 * The list is static and paged on the server (okf/live_rooms.md): search, the role filter and the
 * sort are all in the read. The viewer's own changes show at once, and someone else's at the next read.
 *
 * The list is members. Guardians hold no membership, so they have their own filter, and a search under
 * All finds them too (`PEOPLE-9`); one with no membership opens their guardian page.
 */
export default function OrgPeople() {
  const isDark = useActiveTheme() === 'dark';
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;


  const { data: rolesData, isLoading: isRolesLoading } = useSocketQuery<any>('roles');
  const { canManage: canEdit, isAdmin } = useOrgAccess(orgId);
  const roles: OrgRole[] = rolesTheyMayGive(rolesData?.org || [], isAdmin);
  const { settings: minorsSettings } = useOrgMinorsSettings(orgId);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [isAdding, setIsAdding] = useState(false);
  const [page, setPage] = useState(1);

  const { response, items: people, total, limit, isLoading, error, isSettled, term, retry } = usePagedList<OrgPersonRow, OrgPeoplePage>({
    type: 'org_people',
    noun: 'people',
    params: {
      orgId,
      sort: sortKey,
      ...(roleFilter === 'guardians' ? { view: 'guardians' } : roleFilter === 'all' ? { withGuardians: true } : { roleId: roleFilter }),
    },
    search,
    page,
    enabled: !!orgId,
    followActions: true,
  });

  // A new search, filter or sort starts again from the first page.
  useEffect(() => setPage(1), [term, roleFilter, sortKey]);

  const scroller = useRef<ScrollView>(null);
  const goToPage = (next: number) => {
    setPage(next);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };

  const counts = response?.roleCounts ?? {};
  const everyone = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const count = (n: number) => (isWide ? n : undefined);
  const filterOptions: { key: RoleFilter; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: count(everyone) },
    { key: 'role-org-admin', label: 'Admin', count: count(counts['role-org-admin'] || 0) },
    { key: 'role-org-staff', label: 'Staff', count: count(counts['role-org-staff'] || 0) },
    { key: 'role-org-member', label: 'Member', count: count(counts['role-org-member'] || 0) },
    { key: 'guardians', label: 'Guardians', count: count(response?.guardianCount || 0) },
  ];
  const isGuardiansView = roleFilter === 'guardians';

  const open = (member: OrgPersonRow) => {
    if (member.membershipId) {
      router.push({ pathname: '/admin/[orgId]/people/[membershipId]', params: { orgId: orgId!, membershipId: member.membershipId } });
    } else {
      router.push({ pathname: '/admin/[orgId]/people/guardian/[profileId]', params: { orgId: orgId!, profileId: member.id } });
    }
  };

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
        className={`flex-row items-center gap-1.5 rounded-xl bg-primary ${isWide ? 'px-3.5 py-2' : 'w-9 h-9 justify-center'}`}
      >
        <Ionicons name="add" size={18} color={themeColor(isDark, 'on-primary')} />
        {isWide ? <Text className="font-inter-bold text-sm text-on-primary">Add person</Text> : null}
      </TouchableOpacity>
    </View>
  ) : undefined;

  if (isRolesLoading) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="People" onBack={() => safeBack(`/admin/${orgId}`)} />
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="People" onBack={() => safeBack(`/admin/${orgId}`)} right={headerRight} />
      <ScrollView ref={scroller} contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <PageBody className="gap-3">
          {canEdit ? <OrgApplicationsCard orgId={orgId!} /> : null}
          <View className={`gap-2.5 ${isWide ? 'flex-row items-center' : ''}`}>
            <View className="flex-1 flex-row items-center gap-2 bg-card border border-line rounded-xl px-3" style={isWide ? { minWidth: 160 } : undefined}>
              <Ionicons name="search-outline" size={16} color={themeColor(isDark, 'ink-muted')} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={isGuardiansView ? 'Search by name, contact or child' : 'Search by name, email or org ID'}
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                accessibilityLabel="Search people"
                className="flex-1 font-inter text-base text-ink py-2.5 outline-none"
              />
            </View>
            <SegmentedControl options={filterOptions} value={roleFilter} onChange={setRoleFilter} isCompact={false} fit />
          </View>

          <View className="flex-row items-center justify-between px-1">
            <Text className="font-inter text-sm text-ink-muted">
              {isGuardiansView
                ? (total === 1 ? '1 guardian' : `${total} guardians`)
                : (total === 1 ? '1 person' : `${total} people`)}
            </Text>
            {isGuardiansView ? null : (
              <TouchableOpacity
                onPress={() => setSortKey(sortKey === 'name' ? 'role' : 'name')}
                accessibilityRole="button"
                accessibilityLabel={`Sorted by ${sortKey}. Change the sort.`}
                className="flex-row items-center gap-1"
              >
                <Text className="font-inter text-sm text-ink-muted">
                  Sort: <Text className="font-inter-semibold text-ink-soft">{sortKey === 'name' ? 'Name' : 'Role'}</Text>
                </Text>
                <Ionicons name="swap-vertical" size={14} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            )}
          </View>

          {error ? (
            <View className="items-center justify-center py-12 gap-3">
              <Text className="font-inter text-sm text-danger-ink text-center">{error}</Text>
              <TouchableOpacity onPress={retry} accessibilityRole="button" className="px-4 py-2 rounded-xl bg-primary">
                <Text className="font-inter-bold text-xs text-on-primary">Try again</Text>
              </TouchableOpacity>
            </View>
          ) : isLoading && !people.length ? (
            <View className="items-center justify-center py-12"><ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /></View>
          ) : !people.length ? (
            isSettled ? (
              <View className="items-center justify-center py-12 gap-2">
                <Ionicons name="people-outline" size={40} color={themeColor(isDark, 'ink-muted')} />
                <Text className="font-inter text-sm text-ink-muted">
                  {isGuardiansView && !term ? 'No guardians have been recorded yet.' : term || everyone ? 'Nobody matches.' : 'Nobody has been added yet.'}
                </Text>
              </View>
            ) : null
          ) : (
            <View className="gap-3" style={{ opacity: isLoading ? 0.6 : 1 }}>
              <ListPager testID="people-pager-top" page={page} limit={limit} total={total} noun="people" onPageChange={goToPage} disabled={isLoading} />
              <View className="rounded-2xl border border-line bg-card overflow-hidden">
                {people.map((member, index) => (
                  <PersonRow
                    key={member.membershipId ?? member.id}
                    member={member}
                    isWide={isWide}
                    first={index === 0}
                    showChildren={isGuardiansView || !member.membershipId}
                    guardians={guardianSummary(member.guardianNames)}
                    guardianCount={member.guardianNames.length}
                    guardianship={guardianshipOf(member.birthdate, minorsSettings, member.guardianNames.length > 0)}
                    onPress={() => open(member)}
                  />
                ))}
              </View>
              <ListPager testID="people-pager-bottom" page={page} limit={limit} total={total} noun="people" onPageChange={goToPage} disabled={isLoading} />
            </View>
          )}
        </PageBody>
      </ScrollView>

      {canEdit ? <AddPersonDialog orgId={orgId!} roles={roles} visible={isAdding} onClose={() => setIsAdding(false)} /> : null}
    </SafeAreaView>
  );
}

function PersonRow({ member, isWide, first, showChildren, guardians, guardianCount, guardianship, onPress }: {
  member: OrgPersonRow;
  isWide: boolean;
  first: boolean;
  /** In place of the person's own guardians: who this person answers for. */
  showChildren: boolean;
  guardians: string | null;
  guardianCount: number;
  guardianship: ReturnType<typeof guardianshipOf>;
  onPress: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const cell = formatCellphone(member.cellphone);
  const border = first ? '' : 'border-t border-line-soft';
  const children = member.childNames.join(', ');

  if (!isWide) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" className={`flex-row items-center gap-3 px-3 py-2.5 ${border}`}>
        <PersonAvatar name={member.name} image={member.image} size={36} />
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-1.5">
            <Text className="font-inter-semibold text-sm text-ink flex-shrink" numberOfLines={1}>{member.name}</Text>
            <RoleBadge roleId={member.roleId ?? undefined} roleName={member.roleName} />
            {member.membershipId ? <GuardianshipTag kind={guardianship} /> : null}
            {member.personOrgId ? (
              <Text className="ml-auto pl-2 font-inter text-xs text-ink-muted flex-shrink-0" style={{ fontVariant: ['tabular-nums'] }}>
                {member.personOrgId}
              </Text>
            ) : null}
          </View>
          {member.email || cell ? (
            <View className="flex-row items-center justify-between gap-2.5 mt-0.5">
              <Text className="font-inter text-xs text-ink-muted flex-shrink" numberOfLines={1}>{member.email || ''}</Text>
              {cell ? <Text className="font-inter text-xs text-ink-muted flex-shrink-0">{cell}</Text> : null}
            </View>
          ) : null}
          {showChildren && children ? (
            <Text className="font-inter text-xs text-ink-soft mt-0.5" numberOfLines={1}>Guardian of {children}</Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" className={`flex-row items-center gap-3 px-4 py-2.5 ${border}`}>
      <PersonAvatar name={member.name} image={member.image} size={36} />
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{member.name}</Text>
          <RoleBadge roleId={member.roleId ?? undefined} roleName={member.roleName} />
        </View>
        {member.personOrgId ? (
          <Text className="font-inter text-xs text-ink-muted mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>{member.personOrgId}</Text>
        ) : null}
      </View>
      <View style={{ width: 250 }}>
        {member.email ? <Text className="font-inter text-sm text-ink-muted" numberOfLines={1}>{member.email}</Text> : null}
        {cell ? <Text className="font-inter text-sm text-ink-muted" numberOfLines={1}>{cell}</Text> : null}
      </View>
      <View style={{ width: 170 }}>
        {showChildren ? (
          children ? (
            <>
              <Text className="font-inter text-xs text-ink-muted">Guardian of</Text>
              <Text className="font-inter text-sm text-ink-soft" numberOfLines={1}>{children}</Text>
            </>
          ) : null
        ) : guardians ? (
          <>
            <Text className="font-inter text-xs text-ink-muted">{guardianCount > 1 ? 'Guardians' : 'Guardian'}</Text>
            <Text className="font-inter text-sm text-ink-soft" numberOfLines={1}>{guardians}</Text>
          </>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />
    </TouchableOpacity>
  );
}
