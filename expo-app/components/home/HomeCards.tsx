import React, { useState } from 'react';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOME_RADIUS_KM, HomeNearbyOrganizations, HomeSearchResult } from '@sk/shared';
import { TournamentCard } from '../tournament/TournamentBits';
import { OrgListCard } from '../org/OrgListCard';
import { TeamListCard } from '../teams/TeamListCard';
import { GroupHeading, HomeRow, IconMark, ShowMore } from './HomeBits';
import { homeLinks } from './homeLinks';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { formatDistance } from '../../utils/distance';

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

/** Cards in the same columns as the Organisations and Teams pages. */
function CardColumns({ children }: { children: React.ReactNode[] }) {
  const { width } = useWindowDimensions();
  const columns = width >= 1280 ? 3 : width >= 768 ? 2 : 1;
  return (
    <View className="flex-row flex-wrap pt-1" style={{ marginHorizontal: -6, marginBottom: -12 }}>
      {children.map((card, i) => (
        <View key={i} style={{ width: `${100 / columns}%`, paddingHorizontal: 6, paddingBottom: 12 }}>{card}</View>
      ))}
    </View>
  );
}

/** What the search found, grouped by kind, closest first. It takes the place of the cards while there is a term. */
export function SearchResultsCard({ query, results, isSearching }: {
  query: string;
  results: HomeSearchResult | null;
  isSearching: boolean;
}) {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
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
          <CardColumns>
            {results.organizations.map(org => <OrgListCard key={org.id} org={org} place={org.locality} km={org.km} />)}
          </CardColumns>
        </View>
      );
    }
    if (results.teams.length) {
      groups.push(
        <View key="teams">
          <GroupHeading label={`Teams  ${results.teams.length}`} first={!groups.length} />
          <CardColumns>
            {results.teams.map(team => <TeamListCard key={team.id} team={team} km={team.km} />)}
          </CardColumns>
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
