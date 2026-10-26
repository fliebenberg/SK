import React, { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { PageBody } from '../../components/PageBody';
import { HomeHero } from '../../components/home/HomeHero';
import { HomeSearchBox } from '../../components/home/HomeBits';
import { LocationCard, SetLocationDialog } from '../../components/home/LocationCard';
import { NearbyEventsCard } from '../../components/home/NearbyEventsCard';
import { MyHomeCard, NearbyOrgsCard, SearchResultsCard } from '../../components/home/HomeCards';
import { useHomeLocation, useHomeNearby, useHomeSearch, useMyHome } from '../../hooks/useHome';
import { useSports } from '../../hooks/useEventRooms';
import { useAuthStore } from '../../store/authStore';

/**
 * Home (`HOME-1`, docs/home.md, option B on mockups/home-near-you.html): the page anyone gets when
 * they open the app without a link, signed in or not.
 *
 * - **Signed out**: the hero — what ScoreKeeper is, *Create an account*, *Log in*, *What is
 *   ScoreKeeper?* — then the search, *Your location*, and what is on and who plays near there.
 * - **Signed in**: *My organisations & teams* first, then the same search, location and cards.
 *
 * While the search has a term, its results take the place of the cards under it. Every block
 * shares the page's edges (the app's standard page padding, `UI-35`).
 */
export default function Home() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const sports = useSports();

  const { location, resolving, permission, locating, locateMe, setTypedPlace } = useHomeLocation();
  const near = location?.near ?? null;
  const { nearby, isLoading } = useHomeNearby(near, !resolving);
  const { mine } = useMyHome();
  const [query, setQuery] = useState('');
  const { results, isSearching } = useHomeSearch(query, near);
  const [settingLocation, setSettingLocation] = useState(false);

  const searching = query.trim().length > 0;
  const hasLocation = !!location;
  const hasMine = !!mine && (mine.organizations.length > 0 || mine.teams.length > 0);

  // Still finding out where to look counts as loading, so a card never says "nothing" too early.
  const loading = isLoading || resolving;
  const events = <NearbyEventsCard nearby={nearby} isLoading={loading} hasLocation={hasLocation} sports={sports} />;
  const orgs = <NearbyOrgsCard nearby={nearby} isLoading={loading} hasLocation={hasLocation} sports={sports} />;
  const cards = isWide ? (
    <View className="flex-row gap-4 items-start">
      <View className="min-w-0" style={{ flex: 1.35 }}>{events}</View>
      <View className="min-w-0" style={{ flex: 1 }}>{orgs}</View>
    </View>
  ) : (
    <>{events}{orgs}</>
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <PageBody className={isWide ? 'gap-4' : 'gap-3'}>
          {isAuthenticated
            ? (hasMine ? <MyHomeCard mine={mine!} sports={sports} /> : null)
            : <HomeHero nearby={nearby} sports={sports} isWide={isWide} />}
          <HomeSearchBox value={query} onChange={setQuery} />
          {searching ? (
            <SearchResultsCard query={query} results={results} isSearching={isSearching} sports={sports} />
          ) : (
            <>
              <LocationCard location={location} resolving={resolving} onSet={() => setSettingLocation(true)} />
              {cards}
            </>
          )}
        </PageBody>
      </ScrollView>
      <SetLocationDialog
        visible={settingLocation}
        onClose={() => setSettingLocation(false)}
        location={location}
        permission={permission}
        locating={locating}
        onUseMyLocation={locateMe}
        onChoosePlace={setTypedPlace}
      />
    </View>
  );
}
