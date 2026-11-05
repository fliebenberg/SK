import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { orgColors, TeamDirectoryEntry } from '@sk/shared';
import { BrandedListCard } from '../BrandedListCard';
import { TeamCrest } from './TeamBits';
import { sportIcon } from './sportIcon';
import { useAuthStore } from '../../store/authStore';
import { inkOnBrand } from '../../utils/colorUtils';
import { formatDistance } from '../../utils/distance';
import { COACH_ROLES, orgAccess } from '../../utils/orgAccess';

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
 * A team's card, wherever teams are browsed (docs/design_spec.md §5.4): the Teams page and Home's
 * search. It opens the team where the viewer runs it, in the workspace, and otherwise its public page.
 */
export function TeamListCard({ team, km = null, testID }: {
  team: TeamDirectoryEntry;
  /** How far from the viewer, on a list that knows: after its sport. */
  km?: number | null;
  testID?: string;
}) {
  const router = useRouter();
  const { user, orgMemberships, teamMemberships } = useAuthStore();
  const access = orgAccess(team.orgId, user?.globalRole === 'admin', orgMemberships, teamMemberships);
  const coaches = !!team.myRoleId && COACH_ROLES.includes(team.myRoleId);

  const flags: string[] = [];
  if (team.orgIsPrivate) flags.push('Private');
  if (!team.isActive) flags.push('Inactive');
  if (team.myRoleId) flags.push(ROLE_LABELS[team.myRoleId] ?? 'On the team');
  else if (team.childNames.length) flags.push(childFlag(team.childNames));
  else if (access.canManage && access.role) flags.push(access.role);

  const ink = inkOnBrand(orgColors({ primaryColor: team.orgPrimaryColor }).primary);
  const sport = team.sportName || 'Sport';
  const distance = km === null ? null : formatDistance(km);

  return (
    <BrandedListCard
      testID={testID}
      primaryColor={team.orgPrimaryColor}
      secondaryColor={team.orgSecondaryColor}
      tertiaryColor={team.orgTertiaryColor}
      title={team.name}
      subtitle={team.orgName}
      flags={flags}
      accessibilityLabel={[team.name, team.orgName, sport, team.ageGroup, distance, ...flags].filter(Boolean).join(', ')}
      onPress={() => router.push((access.canManage || coaches ? `/admin/${team.orgId}/teams/${team.id}` : `/teams/${team.id}`) as any)}
      mark={(
        <TeamCrest
          team={{ name: team.name, shortName: team.shortName, ageGroup: team.ageGroup ?? undefined }}
          org={{ logo: team.orgLogo ?? undefined, primaryColor: team.orgPrimaryColor ?? undefined, secondaryColor: team.orgSecondaryColor ?? undefined } as any}
          size={44}
        />
      )}
      detail={(
        <View className="flex-row items-center gap-2.5">
          <View className="flex-row items-center gap-1">
            <MaterialCommunityIcons name={sportIcon(team.sportName)} size={15} color={ink.text} />
            <Text numberOfLines={1} style={{ color: ink.text }} className="font-inter-semibold text-xs leading-4">
              {[team.sportName, team.ageGroup].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {distance ? (
            <View className="flex-row items-center gap-0.5">
              <Ionicons name="location-outline" size={13} color={ink.text} />
              <Text numberOfLines={1} style={{ color: ink.text }} className="font-inter-semibold text-xs leading-4">{distance}</Text>
            </View>
          ) : null}
        </View>
      )}
    />
  );
}
