import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Organization, Sport, Team, sortAgeGroups } from '@sk/shared';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { SegmentedControl } from '../../../components/SegmentedControl';
import CustomSelect from '../../../components/CustomSelect';
import { TeamCrest } from '../../../components/teams/TeamBits';
import { TeamDetailsDialog } from '../../../components/teams/TeamDialogs';
import { useOrgTeams } from '../../../hooks/useOrgTeams';
import { useOrgSummary } from '../../../hooks/useOrgSummary';
import { useSocketQuery } from '../../../hooks/useSocketQuery';
import { useSafeBack } from '../../../hooks/useSafeBack';
import { useAuthStore } from '../../../store/authStore';
import { useActiveTheme } from '../../../store/settingsStore';
import { themeColor } from '../../../constants/Colors';

const ALL = 'all';

/**
 * The organisation's teams (docs/teams.md). A row is the team at a glance — crest, name, age group,
 * head coach and how many players and staff — and opens the team page, the same page for everyone.
 *
 * Grouped by sport only when the teams span more than one; inactive teams are in a collapsed
 * section at the bottom, which is why the main list needs no Inactive badge. Add team is shown to
 * Admin and Staff only.
 */
export default function OrgTeams() {
  const isDark = useActiveTheme() === 'dark';
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const user = useAuthStore(state => state.user);
  const viewerRole = useAuthStore(state => state.orgMemberships.find((m: any) => m.orgId === orgId)?.roleId);
  const canEdit = user?.globalRole === 'admin' || viewerRole === 'role-org-admin' || viewerRole === 'role-org-staff';

  const { teams, isLoading } = useOrgTeams(orgId);
  const { org } = useOrgSummary(orgId);
  const { data: sportsData } = useSocketQuery<Sport[]>('sports');
  const sports = sportsData || [];

  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState(ALL);
  const [ageFilter, setAgeFilter] = useState(ALL);
  const [showInactive, setShowInactive] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const sportName = (id: string) => sports.find(s => s.id === id)?.name || 'Other';
  /** Where an age group sits in its sport's own order, so U13 and U11 read in the order the sport lists them. */
  const ageRank = useMemo(() => {
    const rank = new Map<string, number>();
    for (const sport of sports) sortAgeGroups(sport.ageGroups || []).forEach((g, i) => rank.set(g.id, i));
    return rank;
  }, [sports]);

  const active = teams.filter(t => t.isActive !== false);
  const sportIds = Array.from(new Set(active.map(t => t.sportId)));
  const ageGroups = Array.from(new Set(active.map(t => t.ageGroup).filter(Boolean))) as string[];

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teams
      .filter(t =>
        (sportFilter === ALL || t.sportId === sportFilter) &&
        (ageFilter === ALL || t.ageGroup === ageFilter) &&
        (!q || [t.name, t.shortName, t.coachName].some(v => (v || '').toLowerCase().includes(q))))
      .sort((a, b) =>
        (ageRank.get(a.ageGroupId || '') ?? 999) - (ageRank.get(b.ageGroupId || '') ?? 999) ||
        a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [teams, search, sportFilter, ageFilter, ageRank]);

  const shownActive = shown.filter(t => t.isActive !== false);
  const shownInactive = shown.filter(t => t.isActive === false);
  const groups = sportIds.length > 1
    ? sportIds
        .map(id => ({ id, name: sportName(id), teams: shownActive.filter(t => t.sportId === id) }))
        .filter(g => g.teams.length)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [{ id: ALL, name: '', teams: shownActive }];

  const open = (team: Team) => router.push({ pathname: '/admin/[orgId]/teams/[teamId]', params: { orgId: orgId!, teamId: team.id } });

  const headerRight = canEdit ? (
    <TouchableOpacity
      onPress={() => setIsAdding(true)}
      accessibilityRole="button"
      accessibilityLabel="Add team"
      className={`flex-row items-center gap-1.5 rounded-xl bg-primary ${isWide ? 'px-3.5 py-2' : 'w-9 h-9 justify-center'}`}
    >
      <Ionicons name="add" size={18} color={themeColor(isDark, 'on-primary')} />
      {isWide ? <Text className="font-inter-bold text-sm text-on-primary">Add team</Text> : null}
    </TouchableOpacity>
  ) : undefined;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Teams" onBack={() => safeBack(`/admin/${orgId}`)} />
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /></View>
      </SafeAreaView>
    );
  }

  const sportOptions = [
    { key: ALL, label: 'All', count: isWide ? active.length : undefined },
    ...sportIds
      .map(id => ({ key: id, label: sportName(id), count: isWide ? active.filter(t => t.sportId === id).length : undefined }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const ageOptions = [{ value: ALL, label: 'All ages' }, ...sortByName(ageGroups).map(a => ({ value: a, label: a }))];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Teams" onBack={() => safeBack(`/admin/${orgId}`)} right={headerRight} />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View className="w-full gap-3 self-center" style={{ maxWidth: 960 }}>
          <View className={`gap-2.5 ${isWide ? 'flex-row items-center' : ''}`}>
            <View className="flex-1 flex-row items-center gap-2 bg-card border border-line rounded-xl px-3" style={isWide ? { minWidth: 160 } : undefined}>
              <Ionicons name="search-outline" size={16} color={themeColor(isDark, 'ink-muted')} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name, short name or coach"
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                accessibilityLabel="Search teams"
                className="flex-1 font-inter text-base text-ink py-2.5 outline-none"
              />
            </View>
            {sportIds.length > 1 || ageGroups.length > 1 ? (
              <View className={`flex-row items-center gap-2 ${isWide ? 'flex-shrink min-w-0' : ''}`}>
                {sportIds.length > 1 ? (
                  isWide ? (
                    <SegmentedControl options={sportOptions} value={sportFilter} onChange={setSportFilter} isCompact={false} fit />
                  ) : (
                    <View className="flex-1">
                      <SegmentedControl options={sportOptions} value={sportFilter} onChange={setSportFilter} isCompact={false} />
                    </View>
                  )
                ) : null}
                {ageGroups.length > 1 ? (
                  <View style={{ minWidth: isWide ? 140 : 110 }}>
                    <CustomSelect value={ageFilter} onChange={setAgeFilter} options={ageOptions} />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <Text className="font-inter text-sm text-ink-muted px-1">
            {shownActive.length === 1 ? '1 team' : `${shownActive.length} teams`}
          </Text>

          {groups.map(group => (
            <View key={group.id} className="gap-2">
              {group.name ? <GroupHeading label={group.name} count={group.teams.length} /> : null}
              <TeamList teams={group.teams} org={org} isWide={isWide} onOpen={open} />
            </View>
          ))}
          {shownActive.length === 0 ? (
            <View className="items-center justify-center py-12 gap-2">
              <Ionicons name="shield-outline" size={40} color={themeColor(isDark, 'ink-muted')} />
              <Text className="font-inter text-sm text-ink-muted text-center">
                {active.length ? 'No team matches.' : canEdit ? 'No teams yet. Add the first one with Add team.' : 'No teams yet.'}
              </Text>
            </View>
          ) : null}

          {shownInactive.length ? (
            <View className="gap-2 mt-2">
              <TouchableOpacity
                onPress={() => setShowInactive(v => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showInactive }}
                className="flex-row items-center justify-between rounded-2xl border border-line bg-card px-4 py-3"
              >
                <Text className="font-inter-semibold text-sm text-ink-soft">Inactive teams · {shownInactive.length}</Text>
                <View className="flex-row items-center gap-1">
                  <Text className="font-inter text-sm text-ink-muted">{showInactive ? 'Hide' : 'Show'}</Text>
                  <Ionicons name={showInactive ? 'chevron-up' : 'chevron-down'} size={14} color={themeColor(isDark, 'ink-muted')} />
                </View>
              </TouchableOpacity>
              {showInactive ? <TeamList teams={shownInactive} org={org} isWide={isWide} onOpen={open} /> : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {canEdit ? (
        <TeamDetailsDialog
          visible={isAdding}
          onClose={() => setIsAdding(false)}
          orgId={orgId!}
          supportedSportIds={org?.supportedSportIds}
          sports={sports}
          onAdded={open}
        />
      ) : null}
    </SafeAreaView>
  );
}

const sortByName = (names: string[]) => [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

function GroupHeading({ label, count }: { label: string; count: number }) {
  return (
    <View className="flex-row items-center gap-2.5 px-1 mt-1">
      <Text className="font-orbitron-bold text-[11px] uppercase tracking-widest text-ink-muted">{label}</Text>
      <Text className="font-inter text-xs text-ink-muted">{count}</Text>
      <View className="flex-1 h-px bg-line" />
    </View>
  );
}

function TeamList({ teams, org, isWide, onOpen }: { teams: Team[]; org: Organization | null; isWide: boolean; onOpen: (team: Team) => void }) {
  return (
    <View className="rounded-2xl border border-line bg-card overflow-hidden">
      {teams.map((team, i) => <TeamRow key={team.id} team={team} org={org} isWide={isWide} first={i === 0} onPress={() => onOpen(team)} />)}
    </View>
  );
}

function TeamRow({ team, org, isWide, first, onPress }: { team: Team; org: Organization | null; isWide: boolean; first: boolean; onPress: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  const inactive = team.isActive === false;
  const players = team.playerCount || 0;
  const staff = team.staffCount || 0;
  const border = first ? '' : 'border-t border-line-soft';
  const crest = <TeamCrest team={team} org={org} size={40} inactive={inactive} />;
  const playersLabel = `${players} ${players === 1 ? 'player' : 'players'}`;

  if (!isWide) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" className={`flex-row items-center gap-3 px-3 py-2.5 ${border}`}>
        {crest}
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text className="font-inter-semibold text-[15px] text-ink flex-shrink" numberOfLines={1}>{team.name}</Text>
            <Text className="ml-auto pl-2 font-inter text-xs text-ink-muted flex-shrink-0">{playersLabel}</Text>
          </View>
          <View className="flex-row items-center justify-between gap-2.5 mt-0.5">
            <Text className="font-inter text-xs text-ink-muted flex-shrink-0">{team.ageGroup}</Text>
            <Text className="font-inter text-xs text-ink-muted flex-shrink" numberOfLines={1}>{team.coachName || 'No coach'}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="link" className={`flex-row items-center gap-3 px-4 py-3 ${border}`}>
      {crest}
      <View className="flex-1 min-w-0">
        <Text className="font-inter-semibold text-[15px] text-ink" numberOfLines={1}>{team.name}</Text>
        <Text className="font-inter text-xs text-ink-muted mt-0.5">{team.ageGroup}</Text>
      </View>
      <View style={{ width: 200 }}>
        <Text className="font-inter text-xs text-ink-muted">{team.coachName ? 'Coach' : 'No coach yet'}</Text>
        {team.coachName ? <Text className="font-inter text-sm text-ink-soft" numberOfLines={1}>{team.coachName}</Text> : null}
      </View>
      <View style={{ width: 110 }} className="items-end">
        <Text className="font-inter text-sm text-ink-soft">{playersLabel}</Text>
        <Text className="font-inter text-sm text-ink-muted">{staff} staff</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />
    </TouchableOpacity>
  );
}
