import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOME_RADIUS_KM, HomeNearby, HomeSearchResult, MyHome, NearbyOrganization, Sport } from '@sk/shared';
import { TournamentCard } from '../tournament/TournamentBits';
import { RowTag } from '../events/EventBits';
import { RoleBadge } from '../people/PersonBits';
import { opponentOf, scoresFor } from '../teams/TeamBits';
import { GroupHeading, HomeRow, IconMark, OrgMark, ShowMore } from './HomeBits';
import { homeLinks } from './homeLinks';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { formatDistance } from '../../utils/distance';
import { fixtureDateParts } from '../../utils/dates';

/** Organisations shown before *Show more*. */
const FIRST_ORGS = 5;

const Distance = ({ km }: { km: number | null }) =>
  km === null ? null : <Text className="font-inter-semibold text-xs text-ink-muted">{formatDistance(km)}</Text>;

function orgLine(org: NearbyOrganization, sportName: (id: string) => string): string {
  const sports = org.sportIds.map(sportName).filter(Boolean).join(', ');
  const teams = org.teamCount ? `${org.teamCount} ${org.teamCount === 1 ? 'team' : 'teams'}` : '';
  return [org.locality, sports, teams].filter(Boolean).join(' · ');
}

function OrgRow({ org, first, sportName }: { org: NearbyOrganization; first: boolean; sportName: (id: string) => string }) {
  const router = useRouter();
  return (
    <HomeRow
      first={first}
      lead={<OrgMark logo={org.logo} logoConfig={org.logoConfig} primaryColor={org.primaryColor} />}
      title={org.name}
      subtitle={orgLine(org, sportName)}
      end={<Distance km={org.km} />}
      onPress={() => router.push(homeLinks.organization(org.id) as any)}
    />
  );
}

/** *Organisations near you*, closest first (`HOME-1`). */
export function NearbyOrgsCard({ nearby, isLoading, hasLocation, sports }: {
  nearby: HomeNearby | null;
  isLoading: boolean;
  hasLocation: boolean;
  sports: Sport[];
}) {
  const isDark = useActiveTheme() === 'dark';
  const [showAll, setShowAll] = useState(false);
  const sportName = (id: string) => sports.find(s => s.id === id)?.name || '';
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
        <View>
          {nearby?.organizationsBeyondRadius ? (
            <Text className="font-inter text-[13px] text-ink-muted pb-1">None within {HOME_RADIUS_KM} km. The closest:</Text>
          ) : null}
          {shown.map((org, i) => <OrgRow key={org.id} org={org} first={i === 0} sportName={sportName} />)}
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
          {results.organizations.map((org, i) => <OrgRow key={org.id} org={org} first={i === 0} sportName={sportName} />)}
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
};

/**
 * *My organisations & teams* (`HOME-1`): the organisations and teams the viewer belongs to — their
 * memberships, until following exists (`FIX-37`). An organisation shows how many of its games are
 * live; a team shows the game it is playing now, or its next one.
 */
export function MyHomeCard({ mine, sports }: { mine: MyHome; sports: Sport[] }) {
  const router = useRouter();
  const sportName = (id: string) => sports.find(s => s.id === id)?.name || '';

  const orgRows = mine.organizations.map((org, i) => (
    <HomeRow
      key={org.id}
      first={i === 0}
      lead={<OrgMark logo={org.logo} logoConfig={org.logoConfig} primaryColor={org.primaryColor} />}
      title={org.name}
      tags={<RoleBadge roleId={org.roleId} />}
      end={org.liveCount ? <RowTag tone="live" label={`● ${org.liveCount} live`} /> : undefined}
      onPress={() => router.push(homeLinks.organization(org.id) as any)}
    />
  ));

  const teamRows = mine.teams.map((team, i) => {
    const game = team.game;
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

  const both = orgRows.length > 0 && teamRows.length > 0;
  return (
    <TournamentCard title="My organisations & teams">
      <View>
        {both ? <GroupHeading label="Organisations" first /> : null}
        {orgRows}
        {both ? <GroupHeading label="Teams" first={false} /> : null}
        {teamRows}
      </View>
    </TournamentCard>
  );
}
