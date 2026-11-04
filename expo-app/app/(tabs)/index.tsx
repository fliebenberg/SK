import React, { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { PageBody } from '../../components/PageBody';
import { HomeHero } from '../../components/home/HomeHero';
import { HomeSearchBox } from '../../components/home/HomeBits';
import { LocationCard, SetLocationDialog } from '../../components/home/LocationCard';
import { NearbyEventsCard } from '../../components/home/NearbyEventsCard';
import { MyHomeCard, NearbyOrgsCard, SearchResultsCard } from '../../components/home/HomeCards';
import { useHomeLocation, useHomeNearby, useHomeNearbyOrgs, useHomeSearch, useMyHome } from '../../hooks/useHome';
import { useAppActive } from '../../hooks/useAppActive';
import { useSports } from '../../hooks/useEventRooms';
import { useAuthStore } from '../../store/authStore';
import { LAYOUT } from '../../constants/layout';

/** The two columns on a wide screen, so the search and location line up with the cards under them. */
const WIDE_LEFT = 1.35;
const WIDE_RIGHT = 1;

/**
 * Home (`HOME-1`, docs/home.md, option B on mockups/home-near-you.html): the page anyone gets when
 * they open the app without a link, signed in or not.
 *
 * - **Signed out**: the hero — what ScoreKeeper is, *Create an account*, *Log in*, *What is
 *   ScoreKeeper?* — then the search, the location, and what is on and who plays near there.
 * - **Signed in**: *My organisations & teams* first, then the same search, location and cards.
 *
 * On a wide screen the search and the location share a line, and the two cards sit side by side
 * under them once the page has the room (`LAYOUT.twoColumnsMinWidth`). While the search has a term,
 * its results take the place of the cards under it, and on a phone of the location too. Every block shares the page's edges (the app's standard page padding, `UI-35`).
 */
export default function Home() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  // Starts from the window so a wide page does not draw one column first; measured from then on.
  const [contentWidth, setContentWidth] = useState(width);
  const twoColumns = isWide && contentWidth >= LAYOUT.twoColumnsMinWidth;
  const sports = useSports();

  const { location, resolving, permission, locating, locateMe, setTypedPlace } = useHomeLocation();
  const near = location?.near ?? null;
  // A tab stays mounted when the viewer moves to another, so being mounted does not mean on screen.
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const onScreen = isFocused && appActive;
  const { nearby, isLoading } = useHomeNearby(near, !resolving, onScreen);
  const { nearbyOrgs, isLoading: orgsLoading } = useHomeNearbyOrgs(near, !resolving);
  const { mine } = useMyHome(onScreen);
  const [query, setQuery] = useState('');
  const { results, isSearching } = useHomeSearch(query, near);
  const [settingLocation, setSettingLocation] = useState(false);

  const searching = query.trim().length > 0;
  const hasLocation = !!location;
  const hasMine = !!mine && ((mine.runs?.length ?? 0) > 0 || mine.organizations.length > 0 || mine.teams.length > 0);

  // Still finding out where to look counts as loading, so a card never says "nothing" too early.
  const loading = isLoading || resolving;
  const events = <NearbyEventsCard nearby={nearby} isLoading={loading} hasLocation={hasLocation} sports={sports} live={isFocused} />;
  const orgs = <NearbyOrgsCard nearby={nearbyOrgs} isLoading={orgsLoading || resolving} hasLocation={hasLocation} />;
  const cards = twoColumns ? (
    <View className="flex-row gap-4 items-start">
      <View className="min-w-0" style={{ flex: WIDE_LEFT }}>{events}</View>
      <View className="min-w-0" style={{ flex: WIDE_RIGHT }}>{orgs}</View>
    </View>
  ) : (
    <>{events}{orgs}</>
  );
  const onSetLocation = () => setSettingLocation(true);

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <PageBody className={isWide ? 'gap-4' : 'gap-3'} onLayout={e => setContentWidth(e.nativeEvent.layout.width)}>
          {isAuthenticated
            ? (hasMine ? <MyHomeCard mine={mine!} sports={sports} live={isFocused} /> : null)
            : <HomeHero nearby={nearby} sports={sports} isWide={isWide} live={isFocused} />}
          {isWide ? (
            <View className="flex-row gap-4">
              <View className="min-w-0" style={{ flex: WIDE_LEFT }}>
                <HomeSearchBox value={query} onChange={setQuery} className="flex-1" />
              </View>
              <View className="min-w-0" style={{ flex: WIDE_RIGHT }}>
                <LocationCard location={location} resolving={resolving} onSet={onSetLocation} isWide className="flex-1" />
              </View>
            </View>
          ) : (
            <HomeSearchBox value={query} onChange={setQuery} />
          )}
          {searching ? (
            <SearchResultsCard query={query} results={results} isSearching={isSearching} sports={sports} />
          ) : (
            <>
              {isWide ? null : <LocationCard location={location} resolving={resolving} onSet={onSetLocation} isWide={false} />}
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
