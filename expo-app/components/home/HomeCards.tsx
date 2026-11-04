import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GameSummary, HOME_RADIUS_KM, HomeNearbyOrganizations, HomeSearchResult, MyHome, Sport } from '@sk/shared';
import { TournamentCard } from '../tournament/TournamentBits';
import { OrgListCard } from '../org/OrgListCard';
import { opponentOf, scoresFor } from '../teams/TeamBits';
import { GroupHeading, HomeRow, IconMark, ShowMore } from './HomeBits';
import { homeLinks } from './homeLinks';
import { useGameRows } from '../../hooks/useListRows';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { formatDistance } from '../../utils/distance';
import { fixtureDateParts, formatDateRange, instantCalendarDate, todayCalendarDate } from '../../utils/dates';

/** Organisations shown before *Show more*. */
const FIRST_ORGS = 5;

const Distance = ({ km }: { km: number | null }) =>
  km === null ? null : <Text className="font-inter-semibold text-xs text-ink-muted">{formatDistance(km)}</Text>;

/** *Organisations near you*, closest first (`HOME-1`). */
export function NearbyOrgsCard({ nearby, isLoading, hasLocation }: {
  nearby: HomeNearbyOrganizations | null;
  isLoading: boolean;
  hasLocation: boolean;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [showAll, setShowAll] = useState(false);
  const orgs = nearby?.organizations || [];
  const shown = showAll ? orgs : orgs.slice(0, FIRST_ORGS);
  const title = hasLocation ? 'Organisations near you' : 'Organisations';

  return (
    <TournamentCard title={title} count={orgs.length && !nearby?.organizationsBeyondRadius ? orgs.length : undefined}>
      {isLoading && !nearby ? (
        <View className="items-center py-6"><ActivityIndicator color={themeColor(isDark, 'primary')} /></View>
      ) : !orgs.length ? (
        <Text className="font-inter text-sm text-ink-muted py-1">No organisations yet.</Text>
      ) : (
        <View className="gap-2.5 pt-1">
          {nearby?.organizationsBeyondRadius ? (
            <Text className="font-inter text-[13px] text-ink-muted">None within {HOME_RADIUS_KM} km. The closest:</Text>
          ) : null}
          {shown.map(org => <OrgListCard key={org.id} org={org} place={org.locality} km={org.km} />)}
          {orgs.length > FIRST_ORGS ? <ShowMore open={showAll} onToggle={() => setShowAll(v => !v)} /> : null}
        </View>
      )}
    </TournamentCard>
  );
}

/** What the search found, grouped by kind, closest first. It takes the place of the cards while there is a term. */
export function SearchResultsCard({ query, results, isSearching, sports }: {
  query: string;
  results: HomeSearchResult | null;
  isSearching: boolean;
  sports: Sport[];
}) {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const sportName = (id: string) => sports.find(s => s.id === id)?.name || '';
  const total = results ? results.organizations.length + results.teams.length + results.sites.length : 0;
  const tooShort = query.trim().length < 2;

  let body: React.ReactNode;
  if (tooShort) {
    body = <Text className="font-inter text-sm text-ink-muted py-1">Type at least two letters.</Text>;
  } else if (!results) {
    body = <View className="items-center py-6"><ActivityIndicator color={themeColor(isDark, 'primary')} /></View>;
  } else if (!total) {
    body = <Text className="font-inter text-sm text-ink-muted py-1">Nothing matches “{query.trim()}”.</Text>;
  } else {
    const groups: React.ReactNode[] = [];
    if (results.organizations.length) {
      groups.push(
        <View key="orgs">
          <GroupHeading label={`Organisations  ${results.organizations.length}`} first={!groups.length} />
          <View className="gap-2.5 pt-1">
            {results.organizations.map(org => <OrgListCard key={org.id} org={org} place={org.locality} km={org.km} />)}
          </View>
        </View>
      );
    }
    if (results.teams.length) {
      groups.push(
        <View key="teams">
          <GroupHeading label={`Teams  ${results.teams.length}`} first={!groups.length} />
          {results.teams.map((team, i) => (
            <HomeRow
              key={team.id}
              first={i === 0}
              lead={<IconMark name="people" />}
              title={team.name}
              subtitle={[team.orgName, sportName(team.sportId)].filter(Boolean).join(' · ')}
              end={<Distance km={team.km} />}
              onPress={() => router.push(homeLinks.team(team.id) as any)}
            />
          ))}
        </View>
      );
    }
    if (results.sites.length) {
      groups.push(
        <View key="sites">
          <GroupHeading label={`Sites  ${results.sites.length}`} first={!groups.length} />
          {results.sites.map((site, i) => (
            <HomeRow
              key={site.id}
              first={i === 0}
              lead={<IconMark name="location" />}
              title={site.name}
              subtitle={site.orgName}
              end={<Distance km={site.km} />}
              onPress={() => router.push(homeLinks.site(site.id) as any)}
            />
          ))}
        </View>
      );
    }
    body = <View>{groups}</View>;
  }

  return (
    <TournamentCard
      title="Results"
      count={!tooShort && results ? `${total} for “${query.trim()}”` : undefined}
      right={isSearching && results ? <ActivityIndicator size="small" color={themeColor(isDark, 'ink-muted')} /> : undefined}
    >
      {body}
    </TournamentCard>
  );
}

const TEAM_ROLE_LABELS: Record<string, string> = {
  'role-coach': 'Coach',
  'role-assistant-coach': 'Assistant coach',
  'role-scorer': 'Scorer',
};

/**
 * *My organisations & teams* (`HOME-1`): the organisations and teams the viewer belongs to — their
 * memberships, until following exists (`FIX-37`). An organisation shows how many of its games are
 * live; a team shows the game it is playing now, or its next one.
 */
/** What an appointment to a tournament is called on Home. */
const RUN_SCOPE_LABELS: Record<string, string> = {
  event: 'Organiser',
  sport: 'Sport organiser',
  division: 'Convenor',
};

/** A team's game holds a room only while it can change now: it is live, or on today. */
const worthRoom = (game: GameSummary, today: string) =>
  game.status === 'Live' || instantCalendarDate(game.scheduledStartTime || game.startTime) === today;

export function MyHomeCard({ mine, sports, live }: { mine: MyHome; sports: Sport[]; live: boolean }) {
  const router = useRouter();
  const sportName = (id: string) => sports.find(s => s.id === id)?.name || '';
  const today = todayCalendarDate();
  const gameRows = useGameRows(mine.teams.flatMap(team => (team.game && worthRoom(team.game, today) ? [team.game.id] : [])), live);

  const orgRows = mine.organizations.map(org => (
    <OrgListCard key={org.id} org={org} place={org.locality} extraFlags={org.liveCount ? [`● ${org.liveCount} live`] : []} />
  ));

  const teamRows = mine.teams.map((team, i) => {
    const row = team.game ? gameRows.get(team.game.id) : undefined;
    const game = team.game && row !== null ? { ...team.game, ...row } : null;
    const role = TEAM_ROLE_LABELS[team.roleId];
    let subtitle = [team.orgName, sportName(team.sportId), role].filter(Boolean).join(' · ');
    let end: React.ReactNode;
    if (game) {
      const opponent = opponentOf(game, team.id);
      subtitle = [`v ${opponent}`, role].filter(Boolean).join(' · ');
      if (game.status === 'Live') {
        const { mine: ours, theirs } = scoresFor(game, team.id);
        end = (
          <>
            <Text className="font-orbitron-bold text-[15px] text-danger-ink">{ours} – {theirs}</Text>
            <Text className="font-inter-semibold text-[11px] text-danger-ink">{game.periodLabel || 'Live'}</Text>
          </>
        );
      } else {
        const when = fixtureDateParts(game.scheduledStartTime || game.startTime, { timeTbd: game.timeTbd });
        end = when ? <Text className="font-inter-semibold text-[13px] text-ink">{when.when}</Text> : undefined;
      }
    }
    return (
      <HomeRow
        key={team.id}
        first={i === 0}
        lead={<IconMark name="people" />}
        title={`${team.name} · ${sportName(team.sportId) || 'Team'}`}
        subtitle={subtitle}
        end={end}
        onPress={() => router.push(homeLinks.team(team.id) as any)}
      />
    );
  });

  // Tournaments they run by appointment come first (`PERM-8`): for an organiser or convenor from
  // outside the host this is the way in to the tournament's workspace.
  const runRows = (mine.runs || []).map((run, i) => (
    <HomeRow
      key={run.id}
      first={i === 0}
      lead={<IconMark name="trophy" />}
      title={run.name}
      subtitle={[run.orgName, RUN_SCOPE_LABELS[run.scope]].filter(Boolean).join(' · ')}
      end={run.startDate ? <Text className="font-inter-semibold text-[13px] text-ink">{formatDateRange(run.startDate, run.endDate, { compact: true })}</Text> : undefined}
      onPress={() => router.push(`/admin/${run.orgId}/events/${run.id}` as any)}
    />
  ));

  const groups = [runRows, orgRows, teamRows].filter(rows => rows.length > 0).length;
  return (
    <TournamentCard title={runRows.length ? 'My tournaments, organisations & teams' : 'My organisations & teams'}>
      <View>
        {groups > 1 && runRows.length ? <GroupHeading label="Tournaments I run" first /> : null}
        {runRows}
        {groups > 1 && orgRows.length ? <GroupHeading label="Organisations" first={!runRows.length} /> : null}
        {orgRows.length ? <View className="gap-2.5 pt-1">{orgRows}</View> : null}
        {groups > 1 && teamRows.length ? <GroupHeading label="Teams" first={false} /> : null}
        {teamRows}
      </View>
    </TournamentCard>
  );
}
