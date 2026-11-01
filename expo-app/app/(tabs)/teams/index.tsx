import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { orgColors, TeamDirectoryEntry } from '@sk/shared';
import { BrandedListCard } from '../../../components/BrandedListCard';
import { GlassCard } from '../../../components/GlassCard';
import { ListPager } from '../../../components/ListPager';
import { PageBody } from '../../../components/PageBody';
import { TeamCrest } from '../../../components/teams/TeamBits';
import { sportIcon } from '../../../components/teams/sportIcon';
import { themeColor } from '../../../constants/Colors';
import { useTeamDirectory } from '../../../hooks/useTeamDirectory';
import { useAuthStore } from '../../../store/authStore';
import { useActiveTheme, useSettingsStore } from '../../../store/settingsStore';
import { inkOnBrand } from '../../../utils/colorUtils';
import { COACH_ROLES, orgAccess } from '../../../utils/orgAccess';

/** The viewer's choice of My Teams or All Teams, remembered on this device. */
const TAB_KEY = 'teamsDirectoryTab';

const ROLE_LABELS: Record<string, string> = {
  'role-player': 'Player',
  'role-coach': 'Coach',
  'role-assistant-coach': 'Assistant coach',
  'role-scorer': 'Scorer',
  'role-medic': 'Medic',
};

/** "Mia's team", or "Mia & Liam's team" for two of them: their children's first names. */
function childFlag(names: string[]): string {
  const firsts = names.map(name => name.trim().split(/\s+/)[0]);
  return `${firsts.length > 2 ? `${firsts.slice(0, -1).join(', ')} & ${firsts[firsts.length - 1]}` : firsts.join(' & ')}’s team`;
}

/**
 * The public Teams tab (`UI-33`, docs/teams.md §8): every team in one list, static and paged on the
 * server. A card opens the team where the viewer runs it, in the workspace, and otherwise its public
 * page. There is no add action here: a team is only ever added inside an organisation's workspace
 * (docs/design_spec.md §5.4).
 */
export default function TeamsPage() {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const columns = width >= 1280 ? 3 : isLargeScreen ? 2 : 1;

  const { isAuthenticated, user, orgMemberships, teamMemberships, dependants } = useAuthStore();
  const saved = useSettingsStore(state => state.localOverrides[TAB_KEY]) as 'my' | 'all' | undefined;
  const setLocalOverride = useSettingsStore(state => state.setLocalOverride);
  // Until they choose, they start on their own teams if they have any.
  const hasTeams = (teamMemberships || []).length > 0 || (dependants || []).some(d => (d.teams || []).length > 0);
  const tab = isAuthenticated ? (saved ?? (hasTeams ? 'my' : 'all')) : 'all';

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { teams, total, limit, isLoading, error, isSettled, term, retry } = useTeamDirectory({ mine: tab === 'my', search, page });

  // A new search or tab starts again from the first page.
  useEffect(() => setPage(1), [term, tab]);

  const scroller = useRef<ScrollView>(null);
  const goToPage = (next: number) => {
    setPage(next);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };

  const open = (team: TeamDirectoryEntry) => {
    const access = orgAccess(team.orgId, user?.globalRole === 'admin', orgMemberships, teamMemberships);
    const coaches = !!team.myRoleId && COACH_ROLES.includes(team.myRoleId);
    router.push((access.canManage || coaches ? `/admin/${team.orgId}/teams/${team.id}` : `/teams/${team.id}`) as any);
  };

  const flagsFor = (team: TeamDirectoryEntry) => {
    const access = orgAccess(team.orgId, user?.globalRole === 'admin', orgMemberships, teamMemberships);
    const flags: string[] = [];
    if (team.orgIsPrivate) flags.push('Private');
    if (!team.isActive) flags.push('Inactive');
    if (team.myRoleId) flags.push(ROLE_LABELS[team.myRoleId] ?? 'On the team');
    else if (team.childNames.length) flags.push(childFlag(team.childNames));
    else if (access.canManage && access.role) flags.push(access.role);
    return flags;
  };

  const pager = (where: string) => (
    <View className={where === 'top' ? 'mb-3' : 'mt-3'}>
      <ListPager testID={`teams-pager-${where}`} page={page} limit={limit} total={total} noun="teams" onPageChange={goToPage} disabled={isLoading} />
    </View>
  );

  const message = (title: string, text: string, action?: { label: string; onPress: () => void }) => (
    <GlassCard className="border border-line p-6 items-center">
      <Ionicons name="shirt-outline" size={32} color={themeColor(isDark, 'ink-muted')} className="mb-3" />
      <Text className="font-orbitron-bold text-sm text-ink-soft text-center mb-1 uppercase tracking-wide">{title}</Text>
      <Text className="font-inter text-xs text-ink-muted text-center leading-4">{text}</Text>
      {action ? (
        <TouchableOpacity onPress={action.onPress} accessibilityRole="button" className="mt-3 px-4 py-2 rounded-xl bg-primary">
          <Text className="font-inter-bold text-xs text-on-primary">{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </GlassCard>
  );

  const body = () => {
    if (error) return message('Teams did not load', error, { label: 'Try again', onPress: retry });
    if (isLoading && !teams.length) {
      return <View className="py-20 items-center"><Text className="font-inter text-ink-muted">Loading teams...</Text></View>;
    }
    if (!teams.length && !isSettled) return null;
    if (!teams.length) {
      if (term.trim()) return message('No matching teams', `No teams found matching "${term.trim()}".`);
      return tab === 'my'
        ? message('No teams yet', "You're not on any teams yet. A team's coach or organisation adds you, and it shows here.")
        : message('No teams', 'There are no teams on ScoreKeeper yet.');
    }
    return (
      <View style={{ opacity: isLoading ? 0.6 : 1 }}>
        {pager('top')}
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
          {teams.map(team => {
            const { primary } = orgColors({ primaryColor: team.orgPrimaryColor });
            const ink = inkOnBrand(primary);
            const flags = flagsFor(team);
            const sport = team.sportName || 'Sport';
            return (
              <View key={team.id} style={{ width: `${100 / columns}%`, paddingHorizontal: 6, paddingBottom: 12 }}>
                <BrandedListCard
                  testID={`team-card-${team.id}`}
                  primaryColor={team.orgPrimaryColor}
                  secondaryColor={team.orgSecondaryColor}
                  title={team.name}
                  subtitle={team.orgName}
                  flags={flags}
                  accessibilityLabel={[team.name, team.orgName, sport, team.ageGroup, ...flags].filter(Boolean).join(', ')}
                  onPress={() => open(team)}
                  mark={(
                    <TeamCrest
                      team={{ name: team.name, shortName: team.shortName, ageGroup: team.ageGroup ?? undefined }}
                      org={{ logo: team.orgLogo ?? undefined, primaryColor: team.orgPrimaryColor ?? undefined, secondaryColor: team.orgSecondaryColor ?? undefined } as any}
                      size={44}
                    />
                  )}
                  detail={(
                    <View className="flex-row items-center gap-1">
                      <MaterialCommunityIcons name={sportIcon(team.sportName)} size={15} color={ink.text} />
                      <Text numberOfLines={1} style={{ color: ink.text }} className="font-inter-semibold text-xs leading-4">
                        {[team.sportName, team.ageGroup].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  )}
                />
              </View>
            );
          })}
        </View>
        {pager('bottom')}
      </View>
    );
  };

  const tabButton = (key: 'my' | 'all', label: string) => (
    <TouchableOpacity
      onPress={() => setLocalOverride(TAB_KEY, key)}
      accessibilityRole="tab"
      accessibilityState={{ selected: tab === key }}
      className={`flex-1 pb-3 items-center border-b-2 ${tab === key ? 'border-ink' : 'border-transparent'}`}
    >
      <Text className={`font-orbitron-bold text-xs uppercase tracking-wider ${tab === key ? 'text-ink' : 'text-ink-muted'}`}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView ref={scroller} className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <PageBody>
          {isLargeScreen && (
            <View className="mb-6">
              <Text className="font-orbitron-bold text-2xl tracking-widest text-ink uppercase mb-2">Teams</Text>
              <Text className="font-inter text-sm text-ink-muted">Find a team and see its games, results and squad.</Text>
            </View>
          )}

          <View className="flex-row items-center bg-card border border-line rounded-xl px-4 py-3 mb-6 shadow-sm">
            <Ionicons name="search-outline" size={18} color={themeColor(isDark, 'ink-muted')} />
            <TextInput
              placeholder="Search by team, organisation or sport..."
              placeholderTextColor={themeColor(isDark, 'ink-muted')}
              accessibilityLabel="Search teams"
              className="flex-1 font-inter text-ink text-sm ml-2.5 outline-none"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {isAuthenticated && (
            <View className="flex-row border-b border-line mb-5">
              {tabButton('my', 'My Teams')}
              {tabButton('all', 'All Teams')}
            </View>
          )}

          {body()}
        </PageBody>
      </ScrollView>
    </View>
  );
}
