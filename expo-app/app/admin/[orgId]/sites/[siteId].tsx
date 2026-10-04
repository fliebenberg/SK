import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Facility, GameSummary, SocketAction, Sport } from '@sk/shared';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { EditLink, ReadCardEmpty } from '../../../../components/ReadCard';
import { OverflowMenu, OverflowMenuItem } from '../../../../components/OverflowMenu';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { JumpBar, useJumpSections } from '../../../../components/JumpBar';
import { AddressLines } from '../../../../components/address/AddressInput';
import { AddressMap } from '../../../../components/address/AddressMap';
import { facilityMarkers } from '../../../../components/address/facilityMarker';
import { CardNote, SectionCard, ShowMore } from '../../../../components/teams/TeamCards';
import { isUpcoming } from '../../../../components/teams/TeamBits';
import { SiteAddressLine, SiteMark, categoryLabel, isPlayingArea } from '../../../../components/sites/SiteBits';
import { CardSubheading, FacilityRow, SiteGameRow, gameTitle } from '../../../../components/sites/SiteCards';
import { FacilityDialog, LocationDialog, SiteDialog } from '../../../../components/sites/SiteDialogs';
import { useOrgSites } from '../../../../hooks/useOrgSites';
import { useSiteGames } from '../../../../hooks/useSiteGames';
import { useOrgSummary } from '../../../../hooks/useOrgSummary';
import { useSocketQuery } from '../../../../hooks/useSocketQuery';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { useAuthStore } from '../../../../store/authStore';
import { sendAction } from '../../../../services/actions';
import { hasPin } from '../../../../services/places';
import { timeZoneLabel, venueTimeZone, whenMs } from '../../../../utils/dates';
import { useActiveTheme } from '../../../../store/settingsStore';
import { themeColor } from '../../../../constants/Colors';

type Dialog = 'name' | 'location' | 'facility' | 'deactivate' | 'delete' | null;
type Section = 'facilities' | 'location' | 'games';

/** Games coming up shown before "Show all", while no search is on. */
const GAMES_SHOWN = 3;

/**
 * One site (docs/sites.md).
 *
 * Read-first (design_system.md, *Read-first record pages*): it replaced a read-only view screen, an
 * edit screen with a save bar, and a view and an edit screen for each facility, on 2026-10-04. The
 * banner carries the site's name and its Edit; Facilities, Location and Coming up are cards. A
 * facility row opens Edit facility; its ⋯ menu holds deactivate and delete. Deactivating and
 * deleting the site are in the header's ⋯ menu.
 *
 * One search covers facilities and the games coming up. Wide, it sits above the two columns; on a
 * phone it is pinned under the header with buttons that jump to each card. A viewer who cannot edit
 * (anyone but Admin or Staff) gets the same page with no Edit, no Add and no menus.
 */
export default function SitePage() {
  const isDark = useActiveTheme() === 'dark';
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, siteId } = useLocalSearchParams<{ orgId: string; siteId: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 640;

  const user = useAuthStore(state => state.user);
  const viewerRole = useAuthStore(state => state.orgMemberships.find((m: any) => m.orgId === orgId && !m.restrictedReason)?.roleId);
  const canEdit = user?.globalRole === 'admin' || viewerRole === 'role-org-admin' || viewerRole === 'role-org-staff';

  const { sites, facilities: allFacilities, isLoading } = useOrgSites(orgId);
  const { org } = useOrgSummary(orgId);
  const { data: sportsData } = useSocketQuery<Sport[]>('sports');
  const sports = sportsData || [];

  const site = sites.find(s => s.id === siteId) || null;
  const facilities = useMemo(
    () => allFacilities.filter(f => f.siteId === siteId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [allFacilities, siteId]
  );
  const { games, events, eventNames, gamesByFacility } = useSiteGames(orgId, siteId, facilities);

  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editing, setEditing] = useState<Facility | null>(null);
  const [target, setTarget] = useState<{ facility: Facility; action: 'deactivate' | 'delete' } | null>(null);
  const [showAllGames, setShowAllGames] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);

  const jump = useJumpSections<Section>(['facilities', 'location', 'games'], isWide ? 24 : 12);
  const markers = useMemo(() => facilityMarkers(facilities, sports, isDark), [facilities, sports, isDark]);

  const back = () => safeBack(`/admin/${orgId}/sites`);
  const q = query.trim().toLowerCase();

  if (isLoading || !site) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Site" backLabel="Sites" onBack={back} />
        <View className="flex-1 items-center justify-center px-6">
          {isLoading ? <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /> : (
            <Text className="font-inter text-sm text-ink-muted text-center">This site does not exist any more.</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const inactive = site.isActive === false;
  const close = () => setDialog(null);
  const facilityName = (id?: string) => facilities.find(f => f.id === id)?.name;
  const sportNamesOf = (f: Facility) => (f.supportedSportIds || []).map(id => sports.find(s => s.id === id)?.name || '').join(' ');

  const matchingFacilities = q
    ? facilities.filter(f => `${f.name} ${categoryLabel(f.category)} ${sportNamesOf(f)} ${f.surfaceType || ''}`.toLowerCase().includes(q))
    : facilities;
  const upcoming = games.filter(isUpcoming).sort((a, b) => whenOf(a) - whenOf(b));
  const matchingGames = q
    ? upcoming.filter(g => {
        const sport = sports.find(s => s.id === g.sportId)?.name || '';
        return `${gameTitle(g, orgId!)} ${facilityName(g.facilityId) || ''} ${sport} ${eventNames.get(g.eventId) || ''}`.toLowerCase().includes(q);
      })
    : upcoming;

  const openGame = (g: GameSummary) => router.push(`/admin/${orgId}/events/${g.eventId}/games/${g.id}/view`);
  const openFacility = (f: Facility | null) => { setEditing(f); setDialog('facility'); };

  /* ---------------- actions ---------------- */

  /** Deactivating asks first; reactivating is harmless, so it simply happens. */
  const setSiteActive = async (isActive: boolean) => {
    setIsBusy(true);
    setBusyError(null);
    const result = await sendAction(SocketAction.UPDATE_SITE, { id: site.id, data: { isActive } }, { suppressToast: !isActive });
    setIsBusy(false);
    if (!result.ok) return setBusyError(result.message || 'The site was not deactivated.');
    close();
  };
  const deleteSite = async () => {
    setIsBusy(true);
    setBusyError(null);
    const result = await sendAction(SocketAction.DELETE_SITE, { id: site.id }, { suppressToast: true });
    setIsBusy(false);
    if (!result.ok) return setBusyError(result.message || 'The site was not deleted.');
    close();
    router.replace(`/admin/${orgId}/sites`);
  };
  const setFacilityActive = async (facility: Facility, isActive: boolean) => {
    setIsBusy(true);
    setBusyError(null);
    const result = await sendAction(SocketAction.UPDATE_FACILITY, { id: facility.id, data: { isActive } }, { suppressToast: !isActive });
    setIsBusy(false);
    if (!result.ok) return setBusyError(result.message || 'The facility was not deactivated.');
    setTarget(null);
  };
  const deleteFacility = async (facility: Facility) => {
    setIsBusy(true);
    setBusyError(null);
    const result = await sendAction(SocketAction.DELETE_FACILITY, { id: facility.id }, { suppressToast: true });
    setIsBusy(false);
    if (!result.ok) return setBusyError(result.message || 'The facility was not deleted.');
    setTarget(null);
  };

  // A single match is a game in an event of its own, so the games are named and the events only
  // when there are none — "5 events and 5 games" would count each match twice.
  const used = games.length
    ? (games.length === 1 ? '1 game is played here' : `${games.length} games are played here`)
    : events.length ? (events.length === 1 ? '1 event is based here' : `${events.length} events are based here`) : '';

  const menu: OverflowMenuItem[] = [
    inactive
      ? { label: 'Reactivate site', description: 'It is offered again when picking where an event or game is played.', icon: 'refresh-outline', onPress: () => setSiteActive(true) }
      : {
          label: 'Deactivate site',
          description: 'Stop it being offered when picking where an event or game is played. Its facilities and past games are kept, and you can reactivate it.',
          icon: 'pause-circle-outline',
          onPress: () => { setBusyError(null); setDialog('deactivate'); },
        },
    used
      ? { label: 'Delete site', description: `Not available: ${used}. Deactivate it instead.`, icon: 'trash-outline', destructive: true, disabled: true, onPress: () => {} }
      : { label: 'Delete site', description: 'Deletes the site and its facilities. This cannot be undone.', icon: 'trash-outline', destructive: true, onPress: () => { setBusyError(null); setDialog('delete'); } },
  ];

  const facilityMenu = (f: Facility): OverflowMenuItem[] | undefined => {
    if (!canEdit) return undefined;
    const played = gamesByFacility.get(f.id) || 0;
    return [
      f.isActive === false
        ? { label: 'Reactivate', description: `${f.name} is offered again when picking a facility for a game.`, icon: 'refresh-outline', onPress: () => setFacilityActive(f, true) }
        : {
            label: 'Deactivate',
            description: `Stop ${f.name} being offered when picking a facility for a game or tournament. Its games are kept.`,
            icon: 'pause-circle-outline',
            onPress: () => { setBusyError(null); setTarget({ facility: f, action: 'deactivate' }); },
          },
      played
        ? { label: 'Delete', description: `Not available: ${played === 1 ? '1 game is' : `${played} games are`} on it. Deactivate it instead.`, icon: 'trash-outline', destructive: true, disabled: true, onPress: () => {} }
        : { label: 'Delete', description: 'Deletes it from this site. This cannot be undone.', icon: 'trash-outline', destructive: true, onPress: () => { setBusyError(null); setTarget({ facility: f, action: 'delete' }); } },
    ];
  };

  /* ---------------- cards ---------------- */

  const banner = (
    <View className="flex-row items-center gap-4 rounded-2xl border p-4 bg-card border-line">
      <SiteMark size={isNarrow ? 54 : 68} dim={inactive} />
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center flex-wrap gap-2">
          <Text className={`font-inter-bold ${isNarrow ? 'text-lg' : 'text-2xl'} leading-tight text-ink`}>{site.name}</Text>
          {inactive ? (
            <View className="rounded-full border px-2.5 py-0.5 bg-sunken border-line">
              <Text className="font-inter-semibold text-xs text-ink-soft">Inactive</Text>
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center gap-3.5 mt-1">
          <SiteAddressLine address={site.address} className={`font-inter text-sm ${site.address ? 'text-ink-soft' : 'text-ink-muted'}`} />
          {/* Not on a phone, where it would cut the street short; the Facilities card counts them too. */}
          {facilities.length && !isNarrow ? (
            <Text className="font-inter text-sm text-ink-muted flex-shrink-0">
              {facilities.length === 1 ? '1 facility' : `${facilities.length} facilities`}
            </Text>
          ) : null}
        </View>
      </View>
      {canEdit ? <View className="self-start"><EditLink onPress={() => setDialog('name')} /></View> : null}
    </View>
  );

  const inactiveNote = inactive ? (
    <View className="flex-row items-center gap-3 rounded-xl px-4 py-2.5 bg-warning-soft">
      <Text className="flex-1 font-inter text-sm text-warning-ink">
        This site is inactive: it is not offered when picking where an event or game is played. Its facilities and past games are kept.
      </Text>
      {canEdit ? (
        <TouchableOpacity onPress={() => setSiteActive(true)} disabled={isBusy} accessibilityRole="button">
          <Text className="font-inter-bold text-sm text-primary-ink">Reactivate</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ) : null;

  const playing = matchingFacilities.filter(isPlayingArea);
  const other = matchingFacilities.filter(f => !isPlayingArea(f));
  const facilityRows = (list: Facility[]) => list.map((f, i) => (
    <FacilityRow
      key={f.id}
      facility={f}
      sports={sports}
      first={i === 0}
      canEdit={canEdit}
      onPress={canEdit ? () => openFacility(f) : undefined}
      menu={facilityMenu(f)}
    />
  ));
  const facilitiesCard = (
    <SectionCard
      label="Facilities"
      count={q ? `${matchingFacilities.length} of ${facilities.length}` : facilities.length ? String(facilities.length) : undefined}
      action={canEdit && facilities.length ? 'Add facility' : undefined}
      onAction={() => openFacility(null)}
    >
      {!facilities.length ? (
        <CardNote
          text="No facilities yet. Add the fields, courts and halls played on here, and anything else visitors look for — parking, the tuck shop, restrooms."
          action={canEdit ? '＋ Add facility' : undefined}
          onAction={() => openFacility(null)}
        />
      ) : !matchingFacilities.length ? (
        <CardNote text={`No facilities match “${query.trim()}”.`} />
      ) : (
        <View className="gap-1">
          {playing.length ? <View><CardSubheading text="Playing areas" />{facilityRows(playing)}</View> : null}
          {other.length ? <View><CardSubheading text="Other" />{facilityRows(other)}</View> : null}
        </View>
      )}
    </SectionCard>
  );

  const timeZone = venueTimeZone(site, org);
  const locationCard = (
    <SectionCard label="Location" action={canEdit && site.address ? 'Edit' : undefined} actionIcon="pencil" onAction={() => setDialog('location')}>
      {site.address ? (
        <>
          <AddressLines address={site.address} />
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="time-outline" size={14} color={themeColor(isDark, 'ink-muted')} />
            {/* Read-only: a site's timezone comes from its pin, and moving the pin is how to change it (DATE-2). */}
            <Text className="font-inter text-sm text-ink-soft flex-shrink">
              {timeZoneLabel(timeZone)}
              <Text className="text-ink-muted">
                {site.timezone ? ' · from the pin' : hasPin(site.address) ? ' · the organisation\'s' : ' · the organisation\'s, until the address has a pin'}
              </Text>
            </Text>
          </View>
          {hasPin(site.address) ? (
            <AddressMap latitude={site.address.latitude} longitude={site.address.longitude} title={site.name} interactive={false} height={isNarrow ? 170 : 220} markers={markers} />
          ) : null}
        </>
      ) : (
        <ReadCardEmpty
          text={`No address yet, so the site has no map, and kick-offs here are in the organisation's timezone: ${timeZoneLabel(timeZone)}.`}
          action={canEdit ? '＋ Add address' : undefined}
          onPress={() => setDialog('location')}
        />
      )}
    </SectionCard>
  );

  const shownGames = q || showAllGames ? matchingGames : matchingGames.slice(0, GAMES_SHOWN);
  const gamesCard = (
    <SectionCard label="Coming up" count={q ? `${matchingGames.length} of ${upcoming.length}` : upcoming.length ? String(upcoming.length) : undefined}>
      {!upcoming.length ? (
        <CardNote text="No games coming up here. Games are added to an event, and pick their site and facility there." />
      ) : !matchingGames.length ? (
        <CardNote text={`No games here match “${query.trim()}”.`} />
      ) : (
        <View>
          {shownGames.map((g, i) => (
            <SiteGameRow key={g.id} game={g} orgId={orgId!} facilityName={facilityName(g.facilityId)} eventName={eventNames.get(g.eventId)} first={i === 0} onPress={() => openGame(g)} />
          ))}
        </View>
      )}
      {!q && matchingGames.length > GAMES_SHOWN ? (
        <ShowMore label={showAllGames ? 'Show fewer games' : `Show all ${upcoming.length} games`} onPress={() => setShowAllGames(v => !v)} />
      ) : null}
    </SectionCard>
  );

  const hasContent = facilities.length > 0 || upcoming.length > 0;
  const searchBox = (
    <View className="flex-row items-center gap-2 bg-card border border-line rounded-xl px-3">
      <Ionicons name="search-outline" size={16} color={themeColor(isDark, 'ink-muted')} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search facilities and games"
        placeholderTextColor={themeColor(isDark, 'ink-muted')}
        accessibilityLabel="Search facilities and games"
        className={`flex-1 font-inter text-base text-ink outline-none ${isWide ? 'py-2.5' : 'py-2'}`}
      />
      {query ? (
        <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear the search">
          <Ionicons name="close-circle" size={18} color={themeColor(isDark, 'ink-muted')} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const pinned = (
    <View className="gap-2 px-3 py-2 bg-card border-b border-line">
      {searchBox}
      <JumpBar
        sections={[
          { key: 'facilities', label: 'Facilities', count: q ? matchingFacilities.length : facilities.length },
          { key: 'location', label: 'Location' },
          { key: 'games', label: 'Coming up', count: q ? matchingGames.length : upcoming.length },
        ]}
        inView={jump.inView}
        onJump={jump.jumpTo}
      />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Site"
        backLabel="Sites"
        onBack={back}
        right={canEdit ? <OverflowMenu items={menu} accessibilityLabel="Site actions" title={site.name} /> : undefined}
      />
      {/* A site with no facilities and nothing coming up has nothing to search or jump to. */}
      {isWide || !hasContent ? null : pinned}
      <ScrollView
        ref={jump.scrollRef}
        onScroll={isWide ? undefined : jump.onScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }}
      >
        <View className="w-full self-center gap-4" style={{ maxWidth: 960 }}>
          {banner}
          {inactiveNote}
          {isWide ? (
            <>
              {hasContent ? searchBox : null}
              <View className="flex-row gap-4 items-start">
                <View className="gap-4" style={{ flex: 1.35 }}>{facilitiesCard}</View>
                <View className="gap-4" style={{ flex: 1 }}>{locationCard}{gamesCard}</View>
              </View>
            </>
          ) : (
            <View className="gap-3" onLayout={jump.onColumnLayout}>
              <View onLayout={jump.track('facilities')}>{facilitiesCard}</View>
              <View onLayout={jump.track('location')}>{locationCard}</View>
              <View onLayout={jump.track('games')}>{gamesCard}</View>
            </View>
          )}
        </View>
      </ScrollView>

      {canEdit ? (
        <>
          <SiteDialog visible={dialog === 'name'} onClose={close} orgId={orgId!} site={site} />
          <LocationDialog visible={dialog === 'location'} onClose={close} site={site} markers={markers} />
          <FacilityDialog
            visible={dialog === 'facility'}
            onClose={close}
            site={site}
            facility={editing}
            others={markers.filter(m => m.id !== editing?.id)}
            sports={sports}
            orgSportIds={org?.supportedSportIds}
          />
          <ConfirmationModal
            isOpen={dialog === 'deactivate'}
            onClose={close}
            title="Deactivate site?"
            description={`${site.name} will not be offered when picking where an event or game is played. Its facilities and past games are kept, and you can reactivate it at any time.${busyError ? `\n\n${busyError}` : ''}`}
            onConfirm={() => setSiteActive(false)}
            confirmText={isBusy ? 'Deactivating…' : 'Deactivate'}
            isProcessing={isBusy}
          />
          <ConfirmationModal
            isOpen={dialog === 'delete'}
            onClose={close}
            title="Delete site?"
            description={`${site.name} and its facilities will be deleted. This cannot be undone.${busyError ? `\n\n${busyError}` : ''}`}
            onConfirm={deleteSite}
            confirmText={isBusy ? 'Deleting…' : 'Delete'}
            variant="danger"
            isProcessing={isBusy}
          />
          <ConfirmationModal
            isOpen={target?.action === 'deactivate'}
            onClose={() => setTarget(null)}
            title="Deactivate facility?"
            description={target ? `${target.facility.name} will not be offered when picking a facility for a game or tournament. Its games are kept, and you can reactivate it at any time.${busyError ? `\n\n${busyError}` : ''}` : ''}
            onConfirm={() => target && setFacilityActive(target.facility, false)}
            confirmText={isBusy ? 'Deactivating…' : 'Deactivate'}
            isProcessing={isBusy}
          />
          <ConfirmationModal
            isOpen={target?.action === 'delete'}
            onClose={() => setTarget(null)}
            title="Delete facility?"
            description={target ? `${target.facility.name} will be deleted from ${site.name}. This cannot be undone.${busyError ? `\n\n${busyError}` : ''}` : ''}
            onConfirm={() => target && deleteFacility(target.facility)}
            confirmText={isBusy ? 'Deleting…' : 'Delete'}
            variant="danger"
            isProcessing={isBusy}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}

const whenOf = (g: GameSummary) => {
  const ms = whenMs(g.scheduledStartTime || g.startTime);
  return Number.isNaN(ms) ? 0 : ms;
};
